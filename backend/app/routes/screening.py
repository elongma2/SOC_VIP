from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request, Response, status

from backend.app.models.formulation import (
    ConcentrationBasis,
    ConcentrationUnit,
    FormulationRequest,
    FormulationScreeningResponse,
    PreparationStage,
    ScreeningOptionsResponse,
)
from backend.app.services.formulation import screen_formulation
from backend.app.models.identity_catalogue import IngredientSearchResponse, IngredientSearchResult
from backend.app.services.ingredient_catalog import IDENTITY_SOURCE_NAME, IngredientCatalog
from backend.app.services.loader import RegulatoryStore
from backend.app.services.parsing import UnsupportedProductContextError
from backend.app.services.source_rendering import (
    RenderedSourceEvidence,
    RenderMode,
    SourceEvidenceCoordinatesError,
    SourceEvidenceNotFoundError,
    SourceEvidenceRenderer,
    SourceEvidenceUnavailableError,
)


router = APIRouter()
CACHE_CONTROL = "public, max-age=31536000, immutable"


def _accepted_store(request: Request) -> RegulatoryStore:
    store = getattr(request.app.state, "regulatory_store", None)
    if store is None:
        message = getattr(
            request.app.state,
            "baseline_error",
            "Accepted regulatory baseline is unavailable",
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "accepted_baseline_integrity_failure",
                "message": message,
            },
        )
    return store


def _source_renderer(request: Request) -> SourceEvidenceRenderer:
    _accepted_store(request)
    renderer = getattr(request.app.state, "source_evidence_renderer", None)
    if renderer is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "source_evidence_unavailable", "message": "Source evidence renderer is unavailable"},
        )
    return renderer


def _accepted_ingredient_catalog(request: Request) -> IngredientCatalog:
    catalogue = getattr(request.app.state, "ingredient_catalog", None)
    if catalogue is None:
        message = getattr(
            request.app.state,
            "identity_catalogue_error",
            "Accepted ingredient identity catalogue is unavailable",
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "accepted_identity_baseline_integrity_failure", "message": message},
        )
    return catalogue


def _image_response(request: Request, rendered: RenderedSourceEvidence) -> Response:
    etag = f'"{rendered.etag}"'
    headers = {
        "ETag": etag,
        "Cache-Control": CACHE_CONTROL,
        "X-Dataset-Version": rendered.dataset_version,
        "X-Source-Document": rendered.source_document,
        "X-Source-SHA256": rendered.source_sha256,
        "X-Source-Reference": rendered.reference_number,
        "X-Source-Pages": ",".join(str(page) for page in rendered.pages),
        "X-Render-Mode": rendered.render_mode,
        "X-Render-DPI": str(rendered.dpi),
    }
    supplied_etags = {value.strip() for value in request.headers.get("if-none-match", "").split(",")}
    if etag in supplied_etags or "*" in supplied_etags:
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers=headers)
    return Response(content=rendered.content, media_type="image/png", headers=headers)


def _render_source(request: Request, raw_record_id: str, mode: RenderMode) -> Response:
    try:
        rendered = _source_renderer(request).render(raw_record_id, mode)
    except SourceEvidenceNotFoundError as error:
        raise HTTPException(status_code=404, detail={"code": "source_evidence_not_found", "message": str(error)}) from error
    except SourceEvidenceCoordinatesError as error:
        raise HTTPException(status_code=422, detail={"code": "source_evidence_coordinates_unavailable", "message": str(error)}) from error
    except SourceEvidenceUnavailableError as error:
        raise HTTPException(status_code=503, detail={"code": "source_evidence_unavailable", "message": str(error)}) from error
    return _image_response(request, rendered)


@router.get("/source-evidence/{raw_record_id}", responses={200: {"content": {"image/png": {}}}})
def source_evidence_crop_route(raw_record_id: str, request: Request) -> Response:
    return _render_source(request, raw_record_id, "crop")


@router.get("/source-evidence/{raw_record_id}/page", responses={200: {"content": {"image/png": {}}}})
def source_evidence_page_route(raw_record_id: str, request: Request) -> Response:
    return _render_source(request, raw_record_id, "page")


@router.get("/screening-options", response_model=ScreeningOptionsResponse)
def screening_options_route(request: Request) -> ScreeningOptionsResponse:
    store = _accepted_store(request)
    return ScreeningOptionsResponse(
        jurisdiction="Singapore",
        dataset_version=store.dataset_version,
        accepted_baseline_sha256=store.baseline_manifest_hash,
        product_contexts=sorted(store.source_backed_contexts.values(), key=str.casefold),
        concentration_units=list(ConcentrationUnit),
        concentration_bases=[None, *list(ConcentrationBasis)],
        preparation_stages=list(PreparationStage),
    )


@router.get("/ingredients", response_model=IngredientSearchResponse)
def ingredient_search_route(
    request: Request,
    query: str = Query(min_length=2),
    limit: int = Query(default=20, ge=1, le=20),
) -> IngredientSearchResponse:
    catalogue = _accepted_ingredient_catalog(request)
    return IngredientSearchResponse(
        query=query,
        dataset_version=catalogue.dataset_version,
        accepted_baseline_sha256=catalogue.baseline_manifest_hash,
        results=[
            IngredientSearchResult(
                ingredient_id=item["ingredient_id"],
                canonical_name=item["canonical_name"],
                display_name=item["display_name"],
                identity_source=IDENTITY_SOURCE_NAME,
                source_document=item["source_document"],
                source_version=item["source_version"],
                source_entries=item["source_entries"],
                source_pages=item["source_pages"],
                raw_record_ids=item["raw_record_ids"],
            )
            for item in catalogue.search(query, limit)
        ],
    )


@router.post("/screen-formulation", response_model=FormulationScreeningResponse)
def screen_formulation_route(
    formulation: FormulationRequest,
    request: Request,
) -> FormulationScreeningResponse:
    try:
        return screen_formulation(
            _accepted_store(request),
            formulation,
            ingredient_catalog=getattr(request.app.state, "ingredient_catalog", None),
            catalogue_error=getattr(request.app.state, "identity_catalogue_error", None),
            linkage_store=getattr(request.app.state, "ingredient_linkage_store", None),
            linkage_error=getattr(request.app.state, "identity_linkage_error", None),
        )
    except UnsupportedProductContextError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "unsupported_product_context",
                "message": str(error),
            },
        ) from error

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response, status

from backend.app.models.formulation import (
    ConcentrationBasis,
    ConcentrationUnit,
    FormulationRequest,
    FormulationScreeningResponse,
    PreparationStage,
    ScreeningOptionsResponse,
)
from backend.app.services.formulation import screen_formulation
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


@router.post("/screen-formulation", response_model=FormulationScreeningResponse)
def screen_formulation_route(
    formulation: FormulationRequest,
    request: Request,
) -> FormulationScreeningResponse:
    try:
        return screen_formulation(_accepted_store(request), formulation)
    except UnsupportedProductContextError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "unsupported_product_context",
                "message": str(error),
            },
        ) from error

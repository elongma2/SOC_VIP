from __future__ import annotations

from collections.abc import Callable
from contextlib import asynccontextmanager
import math
from typing import Any

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from backend.app.routes import screening_router
from backend.app.services.loader import AcceptedBaselineError, RegulatoryStore, load_accepted_store
from backend.app.services.ingredient_catalog import (
    AcceptedIdentityCatalogueError,
    IngredientCatalog,
    load_accepted_ingredient_catalog,
)
from backend.app.services.ingredient_linkage import (
    AcceptedIngredientLinkageError,
    IngredientLinkageStore,
    load_accepted_ingredient_linkages,
)
from backend.app.services.source_rendering import SourceEvidenceRenderer


def _json_safe(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, bool)):
        return value
    if isinstance(value, float) and not math.isfinite(value):
        return repr(value)
    if isinstance(value, float):
        return value
    if isinstance(value, dict):
        return {key: _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    return str(value)


def create_app(
    store_loader: Callable[[], RegulatoryStore] = load_accepted_store,
    ingredient_catalog_loader: Callable[[], IngredientCatalog] = load_accepted_ingredient_catalog,
    ingredient_linkage_loader: Callable[
        [], IngredientLinkageStore
    ] = load_accepted_ingredient_linkages,
) -> FastAPI:
    @asynccontextmanager
    async def lifespan(application: FastAPI):
        application.state.regulatory_store = None
        application.state.source_evidence_renderer = None
        application.state.baseline_error = None
        application.state.ingredient_catalog = None
        application.state.identity_catalogue_error = None
        application.state.ingredient_linkage_store = None
        application.state.identity_linkage_error = None
        try:
            application.state.regulatory_store = store_loader()
            application.state.source_evidence_renderer = SourceEvidenceRenderer(
                application.state.regulatory_store
            )
        except AcceptedBaselineError as error:
            application.state.baseline_error = str(error)
        try:
            application.state.ingredient_catalog = ingredient_catalog_loader()
        except AcceptedIdentityCatalogueError as error:
            application.state.identity_catalogue_error = str(error)
        try:
            application.state.ingredient_linkage_store = ingredient_linkage_loader()
        except AcceptedIngredientLinkageError as error:
            application.state.identity_linkage_error = str(error)
        yield

    application = FastAPI(
        title="Singapore Cosmetic Formulation Screening API",
        version="0.1.0",
        lifespan=lifespan,
    )

    @application.exception_handler(RequestValidationError)
    async def validation_error_handler(_, error: RequestValidationError) -> JSONResponse:
        return JSONResponse(status_code=422, content={"detail": _json_safe(error.errors())})

    application.include_router(screening_router)
    return application


app = create_app()

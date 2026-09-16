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
) -> FastAPI:
    @asynccontextmanager
    async def lifespan(application: FastAPI):
        application.state.regulatory_store = None
        application.state.source_evidence_renderer = None
        application.state.baseline_error = None
        try:
            application.state.regulatory_store = store_loader()
            application.state.source_evidence_renderer = SourceEvidenceRenderer(
                application.state.regulatory_store
            )
        except AcceptedBaselineError as error:
            application.state.baseline_error = str(error)
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

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, File, HTTPException, Request, UploadFile, status
from pydantic import ValidationError

from backend.app.models.agent import (
    AgentAnswersRequest,
    AgentPrepareRequest,
    AgentPreparedFormulation,
    AgentSessionView,
)
from backend.app.services.agent_csv import CSVUploadError, MAX_FILE_BYTES, parse_csv_upload
from backend.app.services.formulation_agent import (
    AgentConfirmationRequiredError,
    AgentRevisionConflictError,
    AgentSessionExpiredError,
    AgentSessionNotFoundError,
    FormulationAgentService,
)


router = APIRouter(prefix="/agent/formulations", tags=["formulation-agent"])
ACCEPTED_CSV_CONTENT_TYPES = {
    "text/csv",
    "application/csv",
    "application/vnd.ms-excel",
    "text/plain",
    "application/octet-stream",
}


def _service(request: Request) -> FormulationAgentService:
    service = getattr(request.app.state, "formulation_agent", None)
    if service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "agent_unavailable", "message": "The formulation agent is unavailable."},
        )
    return service


def _session_error(error: Exception) -> HTTPException:
    if isinstance(error, AgentSessionExpiredError):
        return HTTPException(status_code=410, detail={"code": "agent_session_expired", "message": "The agent session expired. Upload the CSV again."})
    return HTTPException(status_code=404, detail={"code": "agent_session_not_found", "message": "The agent session was not found."})


@router.post("", response_model=AgentSessionView, status_code=status.HTTP_201_CREATED)
async def create_formulation_agent_session(
    request: Request,
    file: Annotated[UploadFile, File(description="CSV formulation")],
) -> AgentSessionView:
    if file.content_type and file.content_type.casefold() not in ACCEPTED_CSV_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "agent_csv_type_unsupported", "message": "Only CSV text uploads are supported."},
        )
    content = await file.read(MAX_FILE_BYTES + 1)
    try:
        parsed = parse_csv_upload(file.filename or "formulation.csv", content)
    except CSVUploadError as error:
        raise HTTPException(
            status_code=error.status_code,
            detail={"code": error.code, "message": str(error)},
        ) from error
    return _service(request).create(parsed)


@router.get("/{session_id}", response_model=AgentSessionView)
def get_formulation_agent_session(session_id: str, request: Request) -> AgentSessionView:
    try:
        return _service(request).get(session_id)
    except (AgentSessionNotFoundError, AgentSessionExpiredError) as error:
        raise _session_error(error) from error


@router.post("/{session_id}/retry", response_model=AgentSessionView)
def retry_formulation_agent_session(session_id: str, request: Request) -> AgentSessionView:
    try:
        return _service(request).retry(session_id)
    except (AgentSessionNotFoundError, AgentSessionExpiredError) as error:
        raise _session_error(error) from error


@router.post("/{session_id}/answers", response_model=AgentSessionView)
def answer_formulation_agent_questions(
    session_id: str,
    answers: AgentAnswersRequest,
    request: Request,
) -> AgentSessionView:
    try:
        return _service(request).apply_answers(session_id, answers)
    except (AgentSessionNotFoundError, AgentSessionExpiredError) as error:
        raise _session_error(error) from error
    except AgentRevisionConflictError as error:
        raise HTTPException(status_code=409, detail={"code": "agent_revision_conflict", "message": str(error)}) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail={"code": "agent_answer_invalid", "message": str(error)}) from error


@router.post("/{session_id}/prepare", response_model=AgentPreparedFormulation)
def prepare_formulation_agent_session(
    session_id: str,
    preparation: AgentPrepareRequest,
    request: Request,
) -> AgentPreparedFormulation:
    try:
        return _service(request).prepare(session_id, preparation)
    except (AgentSessionNotFoundError, AgentSessionExpiredError) as error:
        raise _session_error(error) from error
    except AgentRevisionConflictError as error:
        raise HTTPException(status_code=409, detail={"code": "agent_revision_conflict", "message": str(error)}) from error
    except AgentConfirmationRequiredError as error:
        raise HTTPException(status_code=409, detail={"code": "agent_confirmation_required", "message": str(error)}) from error
    except (ValidationError, ValueError) as error:
        raise HTTPException(status_code=422, detail={"code": "agent_formulation_invalid", "message": str(error)}) from error

from __future__ import annotations

import json
import logging
import re
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any
from uuid import uuid4

from openai import OpenAI
from pydantic import ValidationError

from data_pipeline.identity.eu_common_ingredient_glossary.scripts.pipeline import search_name

from backend.app.models.agent import (
    AgentActivityItem,
    AgentAnswersRequest,
    AgentColumnMapping,
    AgentConcentration,
    AgentConfidence,
    AgentDetectedTable,
    AgentFailure,
    AgentFieldProvenance,
    AgentIngredientRow,
    AgentPrepareRequest,
    AgentPreparedFormulation,
    AgentQuestion,
    AgentQuestionOption,
    AgentModelRun,
    AgentSourceReference,
    AgentSourceMetadata,
    AgentSessionState,
    AgentSessionView,
    ModelIngredientInterpretation,
    ModelInterpretation,
    ModelSourceReference,
)
from backend.app.models.formulation import FormulationRequest
from backend.app.models.openai import OpenAIUsage
from backend.app.services.agent_csv import ParsedCSV
from backend.app.services.ingredient_catalog import IDENTITY_SOURCE_NAME, IngredientCatalog
from backend.app.services.loader import RegulatoryStore
from backend.app.services.parsing import validate_formulation_request
from backend.app.services.regulatory_search import search_acd_rules, search_singapore_rules


AGENT_INSTRUCTIONS = """You are a formulation-structure assistant. Interpret the bounded CSV grid without assuming a fixed layout.
Identify the formulation header rows, formulation data rows, column meanings, explicit formulation metadata, and logical ingredients. A logical ingredient may use several source rows when the document explicitly relates them. Every proposed field must cite exact source cells using one-based source_row, zero-based source_column_index, and the unchanged source_value. Treat raw-material names, trade names, supplier, function, notes, remarks, comments, and batch fields as provenance rather than regulatory fields. Prefer an explicit INCI/common ingredient value over a trade name when the source establishes that relationship. Never infer product context, preparation stage, basis, CAS, concentration value, or concentration unit from general knowledge. A bare number has no unit. QS and balance have no numeric value. Mark every material uncertainty with the supplied uncertainty codes. Use read-only search tools only for a genuine non-exact identity candidate; exact catalogue matching is performed by application code. Never make regulatory, safety, legality, permission, or compliance decisions. Never invent cells, values, rows, or relationships. Return only the strict structured output and do not expose reasoning."""

NUMERIC_WITH_UNIT = re.compile(r"^\s*(?P<value>(?:\d+(?:\.\d*)?|\.\d+))\s*(?P<unit>%|ppm|mg\s*/\s*kg)\s*$", re.IGNORECASE)
NUMERIC_ONLY = re.compile(r"^\s*(?:\d+(?:\.\d*)?|\.\d+)\s*$")
NON_NUMERIC_CONCENTRATIONS = {"q.s.", "q.s", "qs", "balance"}
SESSION_TTL_SECONDS = 60 * 60
MAX_SESSIONS = 100
MAX_TOOL_CALLS = 12
MAX_TOOL_ROUNDS = 5
LOGGER = logging.getLogger(__name__)


class AgentSessionNotFoundError(KeyError):
    pass


class AgentSessionExpiredError(KeyError):
    pass


class AgentRevisionConflictError(ValueError):
    pass


class AgentConfirmationRequiredError(ValueError):
    pass


class AgentExecutionError(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


@dataclass
class _Session:
    parsed: ParsedCSV
    view: AgentSessionView
    touched_at: float


ModelRunner = Callable[[ParsedCSV, RegulatoryStore, IngredientCatalog | None, str], AgentModelRun | ModelInterpretation]


def _rule_tool_result(rule: dict[str, Any]) -> dict[str, Any]:
    return {
        "rule_id": rule["rule_id"],
        "name": rule["substance_name"],
        "section": rule["regulatory_section"],
        "reference": rule["reference_number"],
        "cas_numbers": rule.get("cas_numbers", []),
        "normalization_status": rule.get("normalization_status"),
    }


class OpenAIFormulationInterpreter:
    def __init__(self, api_key: str | None = None, timeout_seconds: float = 45):
        self.api_key = api_key
        self.timeout_seconds = timeout_seconds

    @staticmethod
    def tools() -> list[dict[str, Any]]:
        search_schema = {
            "type": "object",
            "properties": {"query": {"type": "string", "minLength": 2}},
            "required": ["query"],
            "additionalProperties": False,
        }
        formulation_schema = {
            "type": "object",
            "properties": {
                "formulation_id": {"type": ["string", "null"]},
                "formulation_name": {"type": ["string", "null"]},
                "product_context": {"type": ["string", "null"]},
                "ingredients": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "cas_number": {"type": ["string", "null"]},
                            "concentration": {
                                "anyOf": [
                                    {"type": "null"},
                                    {
                                        "type": "object",
                                        "properties": {
                                            "value": {"type": "number"},
                                            "unit": {"type": "string", "enum": ["percent", "mg/kg", "ppm"]},
                                            "basis": {"type": ["string", "null"]},
                                            "preparation_stage": {"type": "string", "enum": ["finished_product", "after_mixing", "ready_for_use"]},
                                        },
                                        "required": ["value", "unit", "basis", "preparation_stage"],
                                        "additionalProperties": False,
                                    },
                                ],
                            },
                        },
                        "required": ["name", "cas_number", "concentration"],
                        "additionalProperties": False,
                    },
                },
            },
            "required": ["formulation_id", "formulation_name", "product_context", "ingredients"],
            "additionalProperties": False,
        }
        return [
            {"type": "function", "name": name, "description": description, "strict": True, "parameters": search_schema}
            for name, description in (
                ("search_ingredient_catalogue", "Search accepted EU cosmetic ingredient identities."),
                ("search_singapore_regulatory_records", "Search accepted Singapore scoped names for identity clarification only."),
                ("search_acd_regulatory_records", "Search accepted ACD scoped names for identity clarification only."),
            )
        ] + [{
            "type": "function",
            "name": "validate_formulation",
            "description": "Validate a proposed canonical formulation structurally without screening it.",
            "strict": True,
            "parameters": formulation_schema,
        }]

    @staticmethod
    def _run_tool(
        name: str,
        arguments: dict[str, Any],
        store: RegulatoryStore,
        catalogue: IngredientCatalog | None,
    ) -> dict[str, Any]:
        if name == "search_ingredient_catalogue":
            if catalogue is None:
                return {"available": False, "results": []}
            return {"available": True, "results": [
                {"ingredient_id": item["ingredient_id"], "canonical_name": item["canonical_name"], "source_entries": item["source_entries"]}
                for item in catalogue.search(str(arguments["query"]), 10)
            ]}
        if name == "search_singapore_regulatory_records":
            return {"results": [_rule_tool_result(rule) for rule in search_singapore_rules(store, str(arguments["query"]), 10)]}
        if name == "search_acd_regulatory_records":
            return {"results": [_rule_tool_result(rule) for rule in search_acd_rules(store, str(arguments["query"]), 10)]}
        if name == "validate_formulation":
            try:
                proposal = FormulationRequest.model_validate(arguments)
                validate_formulation_request(proposal, store)
            except (ValidationError, ValueError) as error:
                return {"valid": False, "errors": str(error)[:2_000]}
            return {"valid": True, "errors": None}
        return {"error": "Unknown tool"}

    @staticmethod
    def _continuation_items(output: list[Any]) -> list[dict[str, Any]]:
        """Convert response output items into valid stateless response inputs.

        The Responses API output models include a response-only ``status``
        field on function calls and messages. Sending that field back in
        ``input`` causes a 400 ``unknown_parameter`` response.
        """
        items: list[dict[str, Any]] = []
        for item in output:
            payload = item.model_dump(mode="json", exclude_none=True)
            payload.pop("status", None)
            items.append(payload)
        return items

    def __call__(
        self,
        parsed: ParsedCSV,
        store: RegulatoryStore,
        catalogue: IngredientCatalog | None,
        model: str,
    ) -> AgentModelRun:
        if not self.api_key:
            raise AgentExecutionError(
                "agent_not_configured",
                "The formulation agent is not configured. Set OPENAI_API_KEY and retry.",
            )
        client = OpenAI(api_key=self.api_key, timeout=self.timeout_seconds)
        input_items: list[dict[str, Any]] = [{
            "role": "user",
            "content": json.dumps({
                "parsed_rows": [
                    {"source_row": index, "cells": list(row)}
                    for index, row in enumerate(parsed.rows, start=1)
                ],
                "delimiter": parsed.delimiter,
            }, ensure_ascii=False),
        }]
        tool_calls = 0
        request_rounds = 0
        input_tokens = 0
        output_tokens = 0
        total_tokens = 0
        actual_model: str | None = None
        validation_attempts = 0

        def record(response: Any) -> None:
            nonlocal request_rounds, input_tokens, output_tokens, total_tokens, actual_model
            request_rounds += 1
            actual_model = getattr(response, "model", None) or actual_model
            usage = getattr(response, "usage", None)
            if usage is not None:
                input_tokens += int(getattr(usage, "input_tokens", 0) or 0)
                output_tokens += int(getattr(usage, "output_tokens", 0) or 0)
                total_tokens += int(getattr(usage, "total_tokens", 0) or 0)

        def result(response: Any) -> AgentModelRun:
            interpretation = ModelInterpretation.model_validate_json(response.output_text)
            return AgentModelRun(
                interpretation=interpretation,
                usage=OpenAIUsage(
                    configured_model=model,
                    actual_model=actual_model,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    total_tokens=total_tokens,
                    tool_calls=tool_calls,
                    request_rounds=request_rounds,
                ),
            )

        for _ in range(MAX_TOOL_ROUNDS):
            remaining_tool_calls = MAX_TOOL_CALLS - tool_calls
            if remaining_tool_calls <= 0:
                break
            response = client.responses.create(
                model=model,
                instructions=AGENT_INSTRUCTIONS,
                input=input_items,
                tools=self.tools(),
                max_tool_calls=remaining_tool_calls,
                store=False,
                parallel_tool_calls=True,
                text={"format": {
                    "type": "json_schema",
                    "name": "formulation_interpretation",
                    "strict": True,
                    "schema": ModelInterpretation.model_json_schema(),
                }},
            )
            record(response)
            function_calls = [item for item in response.output if getattr(item, "type", None) == "function_call"]
            if function_calls:
                LOGGER.info(
                    "Formulation Agent requested %s read-only tool call(s): %s",
                    len(function_calls),
                    ", ".join(call.name for call in function_calls),
                )
                input_items.extend(self._continuation_items(response.output))
                for call in function_calls:
                    tool_calls += 1
                    if tool_calls > MAX_TOOL_CALLS:
                        raise AgentExecutionError("agent_tool_limit_exceeded", "The formulation agent exceeded its tool-call limit.")
                    try:
                        arguments = json.loads(call.arguments)
                        tool_result = self._run_tool(call.name, arguments, store, catalogue)
                    except (KeyError, TypeError, json.JSONDecodeError) as error:
                        tool_result = {"error": f"Invalid tool arguments: {error}"}
                    input_items.append({
                        "type": "function_call_output",
                        "call_id": call.call_id,
                        "output": json.dumps(tool_result, ensure_ascii=False),
                    })
                continue
            try:
                return result(response)
            except (ValidationError, ValueError) as error:
                if validation_attempts:
                    raise AgentExecutionError("agent_invalid_structured_output", "The model returned an invalid structured interpretation.") from error
                validation_attempts += 1
                input_items.extend(self._continuation_items(response.output))
                input_items.append({"role": "user", "content": f"Return the required schema. Validation error: {str(error)[:1500]}"})
        input_items.append({
            "role": "user",
            "content": (
                "Finish the structured interpretation now without calling more tools. Cite every proposed field "
                "to exact cells, include every row you identify as formulation data, and keep uncertain values "
                "unresolved instead of searching again."
            ),
        })
        for attempt in range(2):
            response = client.responses.create(
                model=model,
                instructions=AGENT_INSTRUCTIONS,
                input=input_items,
                tools=[],
                store=False,
                parallel_tool_calls=False,
                text={"format": {
                    "type": "json_schema",
                    "name": "formulation_interpretation",
                    "strict": True,
                    "schema": ModelInterpretation.model_json_schema(),
                }},
            )
            record(response)
            try:
                return result(response)
            except (ValidationError, ValueError) as error:
                if attempt:
                    raise AgentExecutionError(
                        "agent_invalid_structured_output",
                        "The model returned an invalid structured interpretation.",
                    ) from error
                input_items.extend(self._continuation_items(response.output))
                input_items.append({
                    "role": "user",
                    "content": f"Return the required schema without tools. Validation error: {str(error)[:1500]}",
                })
        raise AgentExecutionError("agent_invalid_structured_output", "The model returned an invalid structured interpretation.")

    def repair(
        self,
        parsed: ParsedCSV,
        invalid: ModelInterpretation,
        error: AgentExecutionError,
        model: str,
    ) -> AgentModelRun:
        if not self.api_key:
            raise error
        response = OpenAI(api_key=self.api_key, timeout=self.timeout_seconds).responses.create(
            model=model,
            instructions=AGENT_INSTRUCTIONS,
            input=[{
                "role": "user",
                "content": json.dumps({
                    "parsed_rows": [
                        {"source_row": index, "cells": list(row)}
                        for index, row in enumerate(parsed.rows, start=1)
                    ],
                    "invalid_interpretation": invalid.model_dump(mode="json"),
                    "validation_error": str(error),
                    "instruction": "Repair only the source references and structural interpretation. Do not invent values.",
                }, ensure_ascii=False),
            }],
            tools=[],
            store=False,
            text={"format": {
                "type": "json_schema",
                "name": "formulation_interpretation_repair",
                "strict": True,
                "schema": ModelInterpretation.model_json_schema(),
            }},
        )
        try:
            interpretation = ModelInterpretation.model_validate_json(response.output_text)
        except (ValidationError, ValueError) as validation_error:
            raise AgentExecutionError(
                "agent_invalid_structured_output",
                "The model could not repair its source references.",
            ) from validation_error
        usage = getattr(response, "usage", None)
        return AgentModelRun(
            interpretation=interpretation,
            usage=OpenAIUsage(
                configured_model=model,
                actual_model=getattr(response, "model", None),
                input_tokens=int(getattr(usage, "input_tokens", 0) or 0),
                output_tokens=int(getattr(usage, "output_tokens", 0) or 0),
                total_tokens=int(getattr(usage, "total_tokens", 0) or 0),
                request_rounds=1,
            ),
        )


class FormulationAgentService:
    def __init__(
        self,
        store: RegulatoryStore,
        catalogue: IngredientCatalog | None,
        model_runner: ModelRunner | None = None,
        model: str | None = None,
    ):
        self.store = store
        self.catalogue = catalogue
        self.model = model or "gpt-5.6-sol"
        self.model_runner = model_runner or OpenAIFormulationInterpreter()
        self._sessions: dict[str, _Session] = {}
        self._lock = threading.RLock()

    @staticmethod
    def _activity(status: str, message: str) -> AgentActivityItem:
        return AgentActivityItem(activity_id=str(uuid4()), status=status, message=message)

    def _catalogue_evidence(self, ingredient: dict[str, Any] | None):
        if ingredient is None or self.catalogue is None:
            return None
        from backend.app.models.screening import CatalogueIdentity

        return CatalogueIdentity(
            ingredient_id=ingredient["ingredient_id"],
            canonical_name=ingredient["canonical_name"],
            source_name=IDENTITY_SOURCE_NAME,
            source_document=ingredient["source_document"],
            source_version=ingredient["source_version"],
            source_url=ingredient["source_url"],
            source_entries=ingredient["source_entries"],
            source_pages=ingredient["source_pages"],
            raw_record_ids=ingredient["raw_record_ids"],
            identity_dataset_version=self.catalogue.dataset_version,
            accepted_baseline_sha256=self.catalogue.baseline_manifest_hash,
        )

    def _purge(self) -> None:
        now = time.monotonic()
        expired = [key for key, session in self._sessions.items() if now - session.touched_at > SESSION_TTL_SECONDS]
        for key in expired:
            self._sessions.pop(key, None)
        while len(self._sessions) >= MAX_SESSIONS:
            oldest = min(self._sessions, key=lambda key: self._sessions[key].touched_at)
            self._sessions.pop(oldest)

    def _get(self, session_id: str) -> _Session:
        with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                raise AgentSessionNotFoundError(session_id)
            if time.monotonic() - session.touched_at > SESSION_TTL_SECONDS:
                self._sessions.pop(session_id, None)
                raise AgentSessionExpiredError(session_id)
            session.touched_at = time.monotonic()
            return session

    def create(self, parsed: ParsedCSV) -> AgentSessionView:
        with self._lock:
            self._purge()
            session_id = str(uuid4())
            view = AgentSessionView(
                session_id=session_id,
                revision=0,
                state=AgentSessionState.PARSING,
                filename=parsed.filename,
                model=self.model,
                activity=[self._activity("complete", f"Read {len(parsed.rows)} CSV rows")],
            )
            session = _Session(parsed=parsed, view=view, touched_at=time.monotonic())
            self._sessions[session_id] = session
        return self._interpret(session)

    def retry(self, session_id: str) -> AgentSessionView:
        with self._lock:
            session = self._get(session_id)
            session.view.state = AgentSessionState.PARSING
            session.view.error = None
            session.view.revision += 1
        return self._interpret(session)

    def get(self, session_id: str) -> AgentSessionView:
        return self._get(session_id).view.model_copy(deep=True)

    def _interpret(self, session: _Session) -> AgentSessionView:
        try:
            model_result = self.model_runner(session.parsed, self.store, self.catalogue, self.model)
            if isinstance(model_result, AgentModelRun):
                model_output = model_result.interpretation
                usage = model_result.usage
            else:
                model_output = model_result
                usage = OpenAIUsage(configured_model=self.model)
            with self._lock:
                try:
                    self._apply_model_output(session, model_output)
                except AgentExecutionError as error:
                    if not isinstance(self.model_runner, OpenAIFormulationInterpreter):
                        raise
                    repaired = self.model_runner.repair(session.parsed, model_output, error, self.model)
                    self._apply_model_output(session, repaired.interpretation)
                    usage.input_tokens += repaired.usage.input_tokens
                    usage.output_tokens += repaired.usage.output_tokens
                    usage.total_tokens += repaired.usage.total_tokens
                    usage.request_rounds += repaired.usage.request_rounds
                    usage.actual_model = repaired.usage.actual_model or usage.actual_model
                    session.view.activity.append(self._activity("warning", "Repaired invalid source references once"))
                session.view.usage = usage
        except AgentExecutionError as error:
            with self._lock:
                session.view.state = AgentSessionState.FAILED
                session.view.error = AgentFailure(code=error.code, message=str(error), recoverable=True)
                session.view.activity.append(self._activity("error", "Agent interpretation did not finish"))
                session.view.revision += 1
        except Exception as error:
            LOGGER.exception(
                "Formulation Agent interpretation failed for session %s (%s)",
                session.view.session_id,
                type(error).__name__,
            )
            with self._lock:
                session.view.state = AgentSessionState.FAILED
                session.view.error = AgentFailure(
                    code="agent_model_unavailable",
                    message="The formulation agent could not finish interpreting this file. Your original CSV has not been changed.",
                    recoverable=True,
                )
                session.view.activity.append(self._activity("error", "Agent interpretation did not finish"))
                session.view.revision += 1
        return session.view.model_copy(deep=True)

    @staticmethod
    def _column_name(parsed: ParsedCSV, header_row: int, index: int) -> str:
        header = parsed.rows[header_row - 1]
        return header[index] if 0 <= index < len(header) else f"Column {index + 1}"

    def _apply_model_output(self, session: _Session, output: ModelInterpretation) -> None:
        parsed = session.parsed
        row_count = len(parsed.rows)
        if any(row < 1 or row > row_count for row in [*output.header_rows, *output.data_rows]):
            raise AgentExecutionError("agent_invalid_source_reference", "The model referenced a row outside the CSV.")
        if len(set(output.header_rows)) != len(output.header_rows) or len(set(output.data_rows)) != len(output.data_rows):
            raise AgentExecutionError("agent_invalid_source_reference", "The model returned duplicate header or data rows.")
        if set(output.header_rows) & set(output.data_rows):
            raise AgentExecutionError("agent_invalid_source_reference", "Header rows and formulation data rows must be distinct.")
        if len({item.row_id for item in output.ingredients}) != len(output.ingredients):
            raise AgentExecutionError("agent_invalid_structured_output", "The model returned duplicate logical ingredient IDs.")

        max_columns = max(len(row) for row in parsed.rows)
        for mapping in output.column_mappings:
            if mapping.source_column_index < 0 or mapping.source_column_index >= max_columns:
                raise AgentExecutionError("agent_invalid_source_reference", "A column mapping points outside the CSV.")

        mapping_by_index = {mapping.source_column_index: mapping for mapping in output.column_mappings}
        public_mappings = [
            AgentColumnMapping(
                source_column=self._column_label(parsed, output.header_rows, mapping.source_column_index),
                source_column_index=mapping.source_column_index,
                mapped_field=mapping.mapped_field,
                confidence=mapping.confidence,
            )
            for mapping in output.column_mappings
        ]
        covered_data_rows: set[int] = set()
        rows: list[AgentIngredientRow] = []
        questions: list[AgentQuestion] = []
        missing_unit_rows: list[str] = []

        for item in output.ingredients:
            source_rows = list(dict.fromkeys(item.source_rows))
            if any(row < 1 or row > row_count for row in source_rows):
                raise AgentExecutionError("agent_invalid_source_reference", "An ingredient references a row outside the CSV.")
            covered_data_rows.update(set(source_rows) & set(output.data_rows))
            references = [
                *item.name_sources,
                *item.cas_sources,
                *item.concentration_value_sources,
                *item.concentration_unit_sources,
                *item.basis_sources,
                *item.preparation_stage_sources,
            ]
            for reference in references:
                self._validate_model_reference(parsed, reference)
                if reference.source_row not in source_rows:
                    raise AgentExecutionError("agent_invalid_source_reference", "A field cites a row that is not attached to its logical ingredient.")

            name_reference = next(
                (
                    reference
                    for reference in item.name_sources
                    if mapping_by_index.get(reference.source_column_index)
                    and mapping_by_index[reference.source_column_index].mapped_field == "ingredient_name"
                ),
                item.name_sources[0],
            )
            source_name = name_reference.source_value.strip()
            if not source_name:
                raise AgentExecutionError("agent_invalid_structured_output", "An ingredient identity source is blank.")

            exact_source = self.catalogue.find_exact_name(source_name) if self.catalogue else None
            source_interpreted_name = exact_source["canonical_name"] if exact_source else source_name
            interpreted_name = source_interpreted_name
            identity_status = AgentConfidence.HIGH_CONFIDENCE if exact_source else AgentConfidence.UNRESOLVED
            catalogue_match = exact_source
            name_method = "exact_catalogue_match" if exact_source else "source_value_preserved"
            name_needs_confirmation = False
            if search_name(item.interpreted_name) != search_name(source_interpreted_name):
                interpreted_name = item.interpreted_name.strip()
                catalogue_match = self.catalogue.find_exact_name(interpreted_name) if self.catalogue else None
                identity_status = AgentConfidence.NEEDS_CONFIRMATION
                name_method = "agent_identity_candidate"
                name_needs_confirmation = True
            elif "ingredient_identity" in item.uncertainties:
                identity_status = AgentConfidence.NEEDS_CONFIRMATION
                name_needs_confirmation = True

            if name_needs_confirmation:
                questions.append(AgentQuestion(
                    question_id=f"identity:{item.row_id}",
                    question_type="identity",
                    title="Ingredient identity",
                    prompt=f'Confirm whether "{source_name}" should be interpreted as "{interpreted_name}".',
                    source_row=source_rows[0],
                    row_id=item.row_id,
                    options=[
                        AgentQuestionOption(option_id="confirm_candidate", label=f"Confirm {interpreted_name}", value=interpreted_name),
                        AgentQuestionOption(option_id="keep_source", label="Keep source value", value=source_name),
                    ],
                ))

            cas_value = None
            if item.proposed_cas is not None:
                proposed_cas = item.proposed_cas.strip()
                if not item.cas_sources or all(reference.source_value.strip() != proposed_cas for reference in item.cas_sources):
                    raise AgentExecutionError("agent_invalid_source_reference", "A proposed CAS number is not present in its cited cells.")
                cas_value = proposed_cas

            concentration = None
            value_reference = item.concentration_value_sources[0] if item.concentration_value_sources else None
            if value_reference is not None and value_reference.source_value.strip():
                raw = value_reference.source_value.strip()
                unit_match = NUMERIC_WITH_UNIT.fullmatch(raw)
                numeric_match = NUMERIC_ONLY.fullmatch(raw)
                if unit_match:
                    value = float(unit_match.group("value"))
                    if item.concentration_value is not None and abs(item.concentration_value - value) > 1e-12:
                        raise AgentExecutionError("agent_invalid_source_reference", "A proposed concentration does not match its cited cell.")
                    token = unit_match.group("unit").lower().replace(" ", "")
                    unit = "percent" if token == "%" else ("mg/kg" if token == "mg/kg" else "ppm")
                    concentration = self._source_concentration(source_rows[0], value_reference, value, unit, "deterministic_explicit_unit")
                elif numeric_match:
                    value = float(raw)
                    if item.concentration_value is not None and abs(item.concentration_value - value) > 1e-12:
                        raise AgentExecutionError("agent_invalid_source_reference", "A proposed concentration does not match its cited cell.")
                    explicit_unit = None
                    unit_reference = item.concentration_unit_sources[0] if item.concentration_unit_sources else None
                    if unit_reference is not None:
                        explicit_unit = self._normalize_unit(unit_reference.source_value)
                        if explicit_unit is None:
                            raise AgentExecutionError("agent_invalid_source_reference", "The cited concentration unit is unsupported.")
                    concentration = self._source_concentration(
                        source_rows[0], value_reference, value, explicit_unit,
                        "source_explicit_unit" if explicit_unit else "unit_unresolved", unit_reference,
                    )
                    if explicit_unit is None:
                        missing_unit_rows.append(item.row_id)
                elif raw.casefold() in NON_NUMERIC_CONCENTRATIONS:
                    questions.append(AgentQuestion(
                        question_id=f"nonnumeric:{item.row_id}",
                        question_type="non_numeric_concentration",
                        title="Concentration unavailable",
                        prompt=f'"{raw}" cannot be converted safely to a numeric concentration.',
                        source_row=source_rows[0],
                        row_id=item.row_id,
                        options=[
                            AgentQuestionOption(option_id="leave_unavailable", label="Leave unavailable", value=None),
                            AgentQuestionOption(option_id="enter_manually", label="Enter manually", value=None),
                        ],
                    ))
                elif item.concentration_value is not None:
                    raise AgentExecutionError("agent_invalid_source_reference", "A numeric concentration was not present in its cited cell.")
            if item.concentration_value is not None and value_reference is None:
                raise AgentExecutionError("agent_invalid_source_reference", "A concentration value has no source cell.")

            if concentration is not None:
                if item.basis is not None:
                    if not item.basis_sources or not any(self._exact_text(reference.source_value) == self._exact_text(item.basis) for reference in item.basis_sources):
                        raise AgentExecutionError("agent_invalid_source_reference", "A concentration basis has no exact source cell.")
                    basis_reference = item.basis_sources[0]
                    concentration.basis = AgentFieldProvenance(
                        value=item.basis,
                        source_value=basis_reference.source_value,
                        source_row=basis_reference.source_row,
                        source_column=self._column_label(parsed, output.header_rows, basis_reference.source_column_index),
                        interpretation_method="source_explicit_basis",
                        source_references=[self._public_reference(parsed, output.header_rows, basis_reference)],
                    )
                if item.preparation_stage is not None:
                    if not item.preparation_stage_sources or not any(self._normalize_stage(reference.source_value) == item.preparation_stage for reference in item.preparation_stage_sources):
                        raise AgentExecutionError("agent_invalid_source_reference", "A preparation stage has no exact source cell.")
                    stage_reference = item.preparation_stage_sources[0]
                    concentration.preparation_stage = AgentFieldProvenance(
                        value=item.preparation_stage,
                        source_value=stage_reference.source_value,
                        source_row=stage_reference.source_row,
                        source_column=self._column_label(parsed, output.header_rows, stage_reference.source_column_index),
                        interpretation_method="source_explicit_stage",
                        source_references=[self._public_reference(parsed, output.header_rows, stage_reference)],
                    )

            canonical_coordinates = {(reference.source_row, reference.source_column_index) for reference in references}
            source_metadata = [
                AgentSourceMetadata(
                    source_row=source_row,
                    source_column=self._column_label(parsed, output.header_rows, column_index),
                    source_column_index=column_index,
                    source_value=value,
                    mapped_as=mapping_by_index[column_index].mapped_field if column_index in mapping_by_index else "metadata",
                )
                for source_row in source_rows
                for column_index, value in enumerate(parsed.rows[source_row - 1])
                if value != "" and (source_row, column_index) not in canonical_coordinates
            ]
            rows.append(AgentIngredientRow(
                row_id=item.row_id,
                source_row=source_rows[0],
                source_rows=source_rows,
                source_cells=list(parsed.rows[source_rows[0] - 1]),
                name=AgentFieldProvenance(
                    value=interpreted_name,
                    source_value=source_name,
                    source_row=name_reference.source_row,
                    source_column=self._column_label(parsed, output.header_rows, name_reference.source_column_index),
                    interpretation_method=name_method,
                    needs_confirmation=name_needs_confirmation,
                    source_references=[self._public_reference(parsed, output.header_rows, reference) for reference in item.name_sources],
                ),
                cas_number=(
                    AgentFieldProvenance(
                        value=cas_value,
                        source_value=cas_value,
                        source_row=item.cas_sources[0].source_row,
                        source_column=self._column_label(parsed, output.header_rows, item.cas_sources[0].source_column_index),
                        interpretation_method="source_value_preserved",
                        source_references=[self._public_reference(parsed, output.header_rows, reference) for reference in item.cas_sources],
                    )
                    if cas_value else None
                ),
                concentration=concentration,
                identity_status=identity_status,
                identity_catalogue_id=catalogue_match["ingredient_id"] if catalogue_match else None,
                catalogue_identity=self._catalogue_evidence(catalogue_match),
                source_metadata=source_metadata,
                issues=list(item.issues),
            ))

        missing_rows = sorted(set(output.data_rows) - covered_data_rows)
        if missing_rows:
            raise AgentExecutionError("agent_invalid_source_reference", f"Declared formulation data rows were not consumed: {missing_rows}")

        session.view.formulation_id = self._metadata_provenance(parsed, output.header_rows, output.formulation_metadata.formulation_id)
        session.view.formulation_name = self._metadata_provenance(parsed, output.header_rows, output.formulation_metadata.formulation_name)
        context_provenance = self._metadata_provenance(parsed, output.header_rows, output.formulation_metadata.product_context)
        context_options = [
            AgentQuestionOption(option_id="not_supplied", label="Not available", value=None),
            *[
                AgentQuestionOption(option_id=f"context:{index}", label=value, value=value)
                for index, value in enumerate(sorted(self.store.source_backed_contexts.values(), key=str.casefold))
            ],
        ]
        if context_provenance and context_provenance.value:
            accepted_context = self.store.source_backed_contexts.get(self._exact_text(str(context_provenance.value)))
            if accepted_context:
                context_provenance.value = accepted_context
                context_provenance.interpretation_method = "exact_product_context_match"
                session.view.product_context = context_provenance
            else:
                context_provenance.value = None
                context_provenance.needs_confirmation = True
                context_provenance.interpretation_method = "product_context_requires_confirmation"
                session.view.product_context = context_provenance
                questions.append(AgentQuestion(
                    question_id="formulation:product_context",
                    question_type="product_context",
                    title="Product context",
                    prompt=f'Choose the accepted Product Context that corresponds to "{context_provenance.source_value}".',
                    options=context_options,
                ))
        else:
            session.view.product_context = AgentFieldProvenance(
                value=None, source_value=None, source_row=output.header_rows[0], source_column=None,
                interpretation_method="not_supplied", needs_confirmation=True,
            )
            questions.append(AgentQuestion(
                question_id="formulation:product_context",
                question_type="product_context",
                title="Product context",
                prompt="No explicit Product Context was found. Select an accepted context if known, or confirm that it is unavailable.",
                options=context_options,
            ))

        if missing_unit_rows:
            questions.append(AgentQuestion(
                question_id="global:concentration_unit",
                question_type="unit",
                title="Concentration unit",
                prompt="Select the unit for numeric concentrations that did not include one in the CSV.",
                options=[
                    AgentQuestionOption(option_id=value, label=label, value=value)
                    for value, label in (("percent", "%"), ("ppm", "ppm"), ("mg/kg", "mg/kg"), ("leave_unavailable", "Leave unavailable"))
                ],
            ))
        if any(row.concentration is not None and row.concentration.preparation_stage is None for row in rows):
            questions.append(AgentQuestion(
                question_id="global:preparation_stage",
                question_type="preparation_stage",
                title="Preparation stage",
                prompt="Confirm when the imported concentrations apply. Finished product is proposed and will not be applied until confirmed.",
                options=[
                    AgentQuestionOption(option_id=value, label=label, value=value)
                    for value, label in (("finished_product", "Finished product"), ("after_mixing", "After mixing for use"), ("ready_for_use", "Ready for use"))
                ],
            ))

        session.view.detected_table = AgentDetectedTable(
            header_row=output.header_rows[0],
            data_start_row=min(output.data_rows),
            header_rows=output.header_rows,
            data_rows=output.data_rows,
            source_row_count=len(rows),
            source_column_count=max_columns,
            delimiter=parsed.delimiter,
        )
        session.view.column_mappings = public_mappings
        session.view.interpreted_rows = rows
        session.view.questions = questions
        session.view.canonical_formulation = None
        session.view.error = None
        session.view.state = AgentSessionState.NEEDS_CONFIRMATION if questions else AgentSessionState.INTERPRETED
        session.view.activity.extend([
            self._activity("complete", f"Detected header row(s): {', '.join(map(str, output.header_rows))}"),
            self._activity("complete", f"Identified {len(output.data_rows)} formulation source row(s)"),
            self._activity("complete", f"Prepared {len(rows)} logical ingredient row(s)"),
            self._activity("warning" if questions else "complete", f"{len(questions)} clarification question(s) remain"),
        ])
        session.view.revision += 1

    @staticmethod
    def _validate_model_reference(parsed: ParsedCSV, reference: ModelSourceReference) -> None:
        if reference.source_row < 1 or reference.source_row > len(parsed.rows):
            raise AgentExecutionError("agent_invalid_source_reference", "A field references a row outside the CSV.")
        row = parsed.rows[reference.source_row - 1]
        if reference.source_column_index < 0 or reference.source_column_index >= len(row):
            raise AgentExecutionError("agent_invalid_source_reference", "A field references a column outside the CSV.")
        if row[reference.source_column_index] != reference.source_value:
            raise AgentExecutionError("agent_invalid_source_reference", "A cited source value does not match the original CSV cell.")

    @staticmethod
    def _column_label(parsed: ParsedCSV, header_rows: list[int], column_index: int) -> str:
        labels = [
            parsed.rows[row_number - 1][column_index].strip()
            for row_number in header_rows
            if column_index < len(parsed.rows[row_number - 1]) and parsed.rows[row_number - 1][column_index].strip()
        ]
        return " / ".join(dict.fromkeys(labels)) or f"Column {column_index + 1}"

    @classmethod
    def _public_reference(cls, parsed: ParsedCSV, header_rows: list[int], reference: ModelSourceReference) -> AgentSourceReference:
        return AgentSourceReference(
            source_row=reference.source_row,
            source_column_index=reference.source_column_index,
            source_column=cls._column_label(parsed, header_rows, reference.source_column_index),
            source_value=reference.source_value,
        )

    @classmethod
    def _metadata_provenance(cls, parsed, header_rows, proposal):
        if proposal.value is None:
            if proposal.sources:
                raise AgentExecutionError("agent_invalid_source_reference", "Null metadata must not cite source cells.")
            return None
        if not proposal.sources:
            raise AgentExecutionError("agent_invalid_source_reference", "Proposed formulation metadata has no source cell.")
        for reference in proposal.sources:
            cls._validate_model_reference(parsed, reference)
        if all(cls._exact_text(reference.source_value) != cls._exact_text(proposal.value) for reference in proposal.sources):
            raise AgentExecutionError("agent_invalid_source_reference", "Proposed formulation metadata is not present in its cited cells.")
        primary = proposal.sources[0]
        return AgentFieldProvenance(
            value=proposal.value,
            source_value=primary.source_value,
            source_row=primary.source_row,
            source_column=cls._column_label(parsed, header_rows, primary.source_column_index),
            interpretation_method="source_value_preserved",
            source_references=[cls._public_reference(parsed, header_rows, reference) for reference in proposal.sources],
        )

    @classmethod
    def _source_concentration(
        cls,
        primary_row: int,
        value_reference: ModelSourceReference,
        value: float,
        unit: str | None,
        method: str,
        unit_reference: ModelSourceReference | None = None,
    ) -> AgentConcentration:
        value_public = AgentSourceReference(
            source_row=value_reference.source_row,
            source_column_index=value_reference.source_column_index,
            source_value=value_reference.source_value,
        )
        unit_public = (
            AgentSourceReference(
                source_row=unit_reference.source_row,
                source_column_index=unit_reference.source_column_index,
                source_value=unit_reference.source_value,
            )
            if unit_reference else value_public
        )
        return AgentConcentration(
            value=AgentFieldProvenance(
                value=value, source_value=value_reference.source_value, source_row=value_reference.source_row,
                source_column=None, interpretation_method="deterministic_numeric_parse", source_references=[value_public],
            ),
            unit=AgentFieldProvenance(
                value=unit, source_value=unit_public.source_value, source_row=unit_public.source_row,
                source_column=None, interpretation_method=method, needs_confirmation=unit is None,
                source_references=[unit_public],
            ),
            basis=AgentFieldProvenance(
                value=None, source_value=None, source_row=primary_row, source_column=None, interpretation_method="not_supplied",
            ),
            preparation_stage=None,
        )

    @staticmethod
    def _exact_text(value: str) -> str:
        return " ".join(value.split()).casefold()

    @staticmethod
    def _normalize_unit(value: str) -> str | None:
        normalized = value.strip().casefold().replace(" ", "")
        return {"%": "percent", "percent": "percent", "ppm": "ppm", "mg/kg": "mg/kg"}.get(normalized)

    @staticmethod
    def _normalize_stage(value: str) -> str | None:
        normalized = re.sub(r"[\s-]+", "_", value.strip().casefold())
        return {
            "finished_product": "finished_product",
            "after_mixing": "after_mixing",
            "after_mixing_for_use": "after_mixing",
            "ready_for_use": "ready_for_use",
        }.get(normalized)

    def apply_answers(self, session_id: str, request: AgentAnswersRequest) -> AgentSessionView:
        with self._lock:
            session = self._get(session_id)
            if request.revision != session.view.revision:
                raise AgentRevisionConflictError("The agent session changed; reload it before answering.")
            question_map = {question.question_id: question for question in session.view.questions}
            answered: set[str] = set()
            for answer in request.answers:
                question = question_map.get(answer.question_id)
                if question is None:
                    raise ValueError(f"Unknown or already answered question: {answer.question_id}")
                allowed = {option.option_id for option in question.options}
                if answer.option_id not in allowed:
                    raise ValueError(f"Unsupported answer for {answer.question_id}")
                self._apply_answer(session, question, answer.option_id, answer.value)
                answered.add(answer.question_id)
            for update in request.row_updates:
                row = self._select_row(session.view, update.row_id, update.source_row)
                self._apply_row_update(row, update)
            session.view.questions = [question for question in session.view.questions if question.question_id not in answered]
            session.view.state = AgentSessionState.NEEDS_CONFIRMATION if session.view.questions else AgentSessionState.INTERPRETED
            session.view.canonical_formulation = None
            session.view.revision += 1
            session.view.activity.append(self._activity("complete", "Applied user confirmation"))
            return session.view.model_copy(deep=True)

    def _apply_answer(self, session: _Session, question: AgentQuestion, option_id: str, value: Any) -> None:
        view = session.view
        if question.question_type == "identity":
            row = self._select_row(view, question.row_id, question.source_row)
            selected = next(option.value for option in question.options if option.option_id == option_id)
            row.name.value = selected
            row.name.needs_confirmation = False
            row.name.confirmed_by_user = True
            row.name.interpretation_method = "user_confirmed_identity" if option_id == "confirm_candidate" else "user_kept_source_value"
            exact = self.catalogue.find_exact_name(selected) if self.catalogue else None
            row.identity_status = AgentConfidence.CONFIRMED if exact else AgentConfidence.UNRESOLVED
            row.identity_catalogue_id = exact["ingredient_id"] if exact else None
            row.catalogue_identity = self._catalogue_evidence(exact)
        elif question.question_type == "unit":
            for row in view.interpreted_rows:
                if row.concentration and row.concentration.unit and row.concentration.unit.needs_confirmation:
                    if option_id == "leave_unavailable":
                        row.concentration = None
                    else:
                        row.concentration.unit.value = option_id
                        row.concentration.unit.needs_confirmation = False
                        row.concentration.unit.confirmed_by_user = True
                        row.concentration.unit.interpretation_method = "user_confirmed_unit"
        elif question.question_type == "preparation_stage":
            for row in view.interpreted_rows:
                if row.concentration and row.concentration.preparation_stage is None:
                    row.concentration.preparation_stage = AgentFieldProvenance(
                        value=option_id,
                        source_value=None,
                        source_row=row.source_row,
                        source_column=None,
                        interpretation_method="user_confirmed_global_stage",
                        confirmed_by_user=True,
                    )
        elif question.question_type == "product_context":
            selected = next(option.value for option in question.options if option.option_id == option_id)
            view.product_context = AgentFieldProvenance(
                value=selected,
                source_value=view.product_context.source_value if view.product_context else None,
                source_row=view.product_context.source_row if view.product_context else 1,
                source_column=view.product_context.source_column if view.product_context else None,
                interpretation_method="user_confirmed_product_context" if selected else "user_confirmed_context_unavailable",
                confirmed_by_user=True,
            )
        elif question.question_type == "mapping":
            column_index = int(option_id.split(":", 1)[1])
            source_column = self._column_name(session.parsed, view.detected_table.header_row, column_index)
            for mapping in view.column_mappings:
                if mapping.mapped_field == "ingredient_name":
                    mapping.mapped_field = "ignore"
            view.column_mappings.append(AgentColumnMapping(
                source_column=source_column,
                source_column_index=column_index,
                mapped_field="ingredient_name",
                confidence=AgentConfidence.CONFIRMED,
            ))
            for row in view.interpreted_rows:
                source_value = row.source_cells[column_index] if column_index < len(row.source_cells) else ""
                exact = self.catalogue.find_exact_name(source_value) if self.catalogue else None
                row.name = AgentFieldProvenance(
                    value=exact["canonical_name"] if exact else source_value,
                    source_value=source_value,
                    source_row=row.source_row,
                    source_column=source_column,
                    interpretation_method="user_confirmed_mapping",
                    confirmed_by_user=True,
                )
                row.identity_status = AgentConfidence.CONFIRMED if exact else AgentConfidence.UNRESOLVED
                row.identity_catalogue_id = exact["ingredient_id"] if exact else None
                row.catalogue_identity = self._catalogue_evidence(exact)
        elif question.question_type == "non_numeric_concentration":
            row = self._select_row(view, question.row_id, question.source_row)
            if option_id == "enter_manually":
                if not isinstance(value, dict):
                    raise ValueError("Manual concentration requires value, unit, and preparation_stage")
                row.concentration = AgentConcentration(
                    value=AgentFieldProvenance(value=value.get("value"), source_value=None, source_row=row.source_row, interpretation_method="user_entered"),
                    unit=AgentFieldProvenance(value=value.get("unit"), source_value=None, source_row=row.source_row, interpretation_method="user_entered"),
                    basis=AgentFieldProvenance(value=value.get("basis"), source_value=None, source_row=row.source_row, interpretation_method="user_entered"),
                    preparation_stage=AgentFieldProvenance(value=value.get("preparation_stage"), source_value=None, source_row=row.source_row, interpretation_method="user_entered"),
                )
            else:
                row.concentration = None

    @staticmethod
    def _select_row(view: AgentSessionView, row_id: str | None, source_row: int | None) -> AgentIngredientRow:
        if row_id is not None:
            row = next((item for item in view.interpreted_rows if item.row_id == row_id), None)
            if row is None:
                raise ValueError(f"Unknown logical ingredient row: {row_id}")
            return row
        matches = [item for item in view.interpreted_rows if item.source_row == source_row]
        if len(matches) != 1:
            raise ValueError(f"Source row {source_row} does not identify one logical ingredient")
        return matches[0]

    def _apply_row_update(self, row: AgentIngredientRow, update) -> None:
        if update.name is not None:
            row.name.value = update.name
            row.name.interpretation_method = "user_edited"
            row.name.confirmed_by_user = True
            row.name.needs_confirmation = False
            exact = self.catalogue.find_exact_name(update.name) if self.catalogue else None
            row.identity_status = AgentConfidence.CONFIRMED if exact else AgentConfidence.UNRESOLVED
            row.identity_catalogue_id = exact["ingredient_id"] if exact else None
            row.catalogue_identity = self._catalogue_evidence(exact)
        if update.cas_number is not None:
            row.cas_number = AgentFieldProvenance(value=update.cas_number or None, source_value=row.cas_number.source_value if row.cas_number else None, source_row=row.source_row, interpretation_method="user_edited", confirmed_by_user=True)
        if update.remove_concentration:
            row.concentration = None
        elif update.concentration_value is not None:
            row.concentration = AgentConcentration(
                value=AgentFieldProvenance(value=update.concentration_value, source_value=None, source_row=row.source_row, interpretation_method="user_edited", confirmed_by_user=True),
                unit=AgentFieldProvenance(value=update.concentration_unit, source_value=None, source_row=row.source_row, interpretation_method="user_edited", confirmed_by_user=True),
                basis=AgentFieldProvenance(value=update.concentration_basis, source_value=None, source_row=row.source_row, interpretation_method="user_edited", confirmed_by_user=True),
                preparation_stage=AgentFieldProvenance(value=update.preparation_stage, source_value=None, source_row=row.source_row, interpretation_method="user_edited", confirmed_by_user=True),
            )

    def prepare(self, session_id: str, request: AgentPrepareRequest) -> AgentPreparedFormulation:
        with self._lock:
            session = self._get(session_id)
            if request.revision != session.view.revision:
                raise AgentRevisionConflictError("The agent session changed; reload it before preparing.")
            if any(question.blocking for question in session.view.questions):
                raise AgentConfirmationRequiredError("Resolve all blocking clarification questions before preparing the formulation.")
            ingredients = []
            for row in session.view.interpreted_rows:
                concentration = None
                if row.concentration is not None:
                    fields = row.concentration
                    if not fields.value or not fields.unit or not fields.preparation_stage:
                        raise AgentConfirmationRequiredError(f"Row {row.source_row} has incomplete concentration semantics.")
                    concentration = {
                        "value": fields.value.value,
                        "unit": fields.unit.value,
                        "basis": fields.basis.value,
                        "preparation_stage": fields.preparation_stage.value,
                    }
                ingredients.append({
                    "name": row.name.value,
                    "cas_number": row.cas_number.value if row.cas_number else None,
                    "concentration": concentration,
                })
            formulation = FormulationRequest.model_validate({
                "formulation_id": request.formulation_id if request.formulation_id is not None else (
                    session.view.formulation_id.value if session.view.formulation_id else None
                ),
                "formulation_name": request.formulation_name if request.formulation_name is not None else (
                    session.view.formulation_name.value if session.view.formulation_name else None
                ),
                "product_context": request.product_context,
                "ingredients": ingredients,
            })
            validate_formulation_request(formulation, self.store)
            session.view.canonical_formulation = formulation
            session.view.state = AgentSessionState.READY
            session.view.revision += 1
            session.view.activity.append(self._activity("complete", "Validated canonical formulation without screening"))
            return AgentPreparedFormulation(
                session=session.view.model_copy(deep=True),
                formulation=formulation,
                row_provenance=session.view.interpreted_rows,
            )


from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
import json

import pytest
from fastapi.testclient import TestClient

from backend.app.config import OpenAISettings
from backend.app.main import create_app as build_app
from backend.app.models.agent import AgentAnswer, AgentAnswersRequest, AgentModelRun, AgentPrepareRequest, ModelInterpretation
from backend.app.models.openai import OpenAIUsage
from backend.app.services.agent_csv import CSVUploadError, parse_csv_upload
from backend.app.services.formulation_agent import (
    AgentExecutionError,
    FormulationAgentService,
    OpenAIFormulationInterpreter,
)
from backend.app.services.ingredient_catalog import load_accepted_ingredient_catalog
from backend.app.services.loader import load_accepted_store


ROOT = Path(__file__).resolve().parents[2]


def create_app(*args, **kwargs):
    kwargs.setdefault("settings_loader", lambda: OpenAISettings(None, "gpt-5.6-sol", "gpt-5.6-luna"))
    return build_app(*args, **kwargs)


def interpretation(
    rows: list[dict],
    mappings: list[dict] | None = None,
    *,
    header_rows: list[int] | None = None,
    data_rows: list[int] | None = None,
    formulation_metadata: dict | None = None,
) -> ModelInterpretation:
    """Translate concise test fixtures into the strict semantic-output contract."""
    mappings = mappings or [
        {"source_column_index": 0, "mapped_field": "ingredient_name", "confidence": "high_confidence"},
        {"source_column_index": 1, "mapped_field": "concentration", "confidence": "high_confidence"},
    ]
    mappings = [{key: value for key, value in mapping.items() if key != "source_column"} for mapping in mappings]
    by_field = {mapping["mapped_field"]: mapping["source_column_index"] for mapping in mappings}
    converted = []
    for index, old in enumerate(rows):
        source_row = old["source_row"]
        name_column = by_field.get("ingredient_name", 0)
        concentration_column = by_field.get("concentration", 1)
        cas_column = by_field.get("cas_number", 1)
        concentration_source = old.get("source_concentration")
        uncertainties = []
        if "unit_not_explicit" in old.get("issues", []):
            uncertainties.append("concentration_unit")
        if old.get("identity_status") == "candidate":
            uncertainties.append("ingredient_identity")
        converted.append({
            "row_id": old.get("row_id", f"row-{source_row}-{index}"),
            "source_rows": old.get("source_rows", [source_row]),
            "interpreted_name": old["interpreted_name"],
            "identity_status": old["identity_status"],
            "name_sources": [{
                "source_row": source_row,
                "source_column_index": name_column,
                "source_value": old["source_name"],
            }],
            "proposed_cas": old.get("source_cas"),
            "cas_sources": ([{
                "source_row": source_row,
                "source_column_index": cas_column,
                "source_value": old["source_cas"],
            }] if old.get("source_cas") else []),
            "concentration_value": old.get("concentration_value"),
            "concentration_unit": old.get("concentration_unit"),
            "concentration_value_sources": ([{
                "source_row": source_row,
                "source_column_index": concentration_column,
                "source_value": concentration_source,
            }] if concentration_source is not None else []),
            "concentration_unit_sources": [],
            "basis": None,
            "basis_sources": [],
            "preparation_stage": None,
            "preparation_stage_sources": [],
            "uncertainties": uncertainties,
            "issues": old.get("issues", []),
        })
    null_metadata = {"value": None, "sources": []}
    return ModelInterpretation.model_validate({
        "header_rows": header_rows or [1],
        "data_rows": data_rows or [row["source_row"] for row in rows],
        "column_mappings": mappings,
        "ingredients": converted,
        "formulation_metadata": formulation_metadata or {
            "formulation_id": null_metadata,
            "formulation_name": null_metadata,
            "product_context": null_metadata,
        },
    })


def clean_runner(parsed, store, catalogue, model):
    return interpretation([
        {"source_row": 2, "source_name": "NIACINAMIDE", "interpreted_name": "NIACINAMIDE", "identity_status": "exact_match", "identity_catalogue_id": None, "source_cas": None, "source_concentration": "5%", "concentration_value": 5, "concentration_unit": "percent", "issues": []},
        {"source_row": 3, "source_name": "GLYCERIN", "interpreted_name": "GLYCERIN", "identity_status": "exact_match", "identity_catalogue_id": None, "source_cas": None, "source_concentration": "4%", "concentration_value": 4, "concentration_unit": "percent", "issues": []},
        {"source_row": 4, "source_name": "Tosylchloramide sodium", "interpreted_name": "Tosylchloramide sodium", "identity_status": "exact_match", "identity_catalogue_id": None, "source_cas": None, "source_concentration": "0.21%", "concentration_value": 0.21, "concentration_unit": "percent", "issues": []},
    ])


@pytest.fixture(scope="module")
def store():
    return load_accepted_store(ROOT)


@pytest.fixture(scope="module")
def catalogue():
    return load_accepted_ingredient_catalog(ROOT)


@pytest.fixture()
def client(store, catalogue):
    factory = lambda loaded_store, loaded_catalogue: FormulationAgentService(
        loaded_store, loaded_catalogue, model_runner=clean_runner
    )
    with TestClient(create_app(lambda: store, lambda: catalogue, factory)) as test_client:
        yield test_client


def test_csv_parser_preserves_source_cells_and_supports_bom():
    parsed = parse_csv_upload("formula.csv", "INCI,Concentration\nNIACINAMIDE,5%\n".encode("utf-8-sig"))
    assert parsed.rows[1] == ("NIACINAMIDE", "5%")
    assert parsed.filename == "formula.csv"
    assert parsed.delimiter == ","


def test_csv_parser_rejects_invalid_files():
    with pytest.raises(CSVUploadError, match="Only .csv"):
        parse_csv_upload("formula.xlsx", b"a,b")
    with pytest.raises(CSVUploadError, match="empty"):
        parse_csv_upload("formula.csv", b"")


def test_agent_upload_confirmation_prepare_and_existing_screening(client):
    response = client.post(
        "/agent/formulations",
        files={"file": ("clean.csv", b"INCI,Concentration\nNIACINAMIDE,5%\nGLYCERIN,4%\nTosylchloramide sodium,0.21%\n", "text/csv")},
    )
    assert response.status_code == 201
    session = response.json()
    assert session["state"] == "needs_confirmation"
    assert [row["source_row"] for row in session["interpreted_rows"]] == [2, 3, 4]
    assert {question["question_id"] for question in session["questions"]} == {
        "formulation:product_context",
        "global:preparation_stage",
    }
    assert session["interpreted_rows"][0]["name"]["source_value"] == "NIACINAMIDE"
    identity_evidence = session["interpreted_rows"][0]["catalogue_identity"]
    assert identity_evidence["canonical_name"] == "NIACINAMIDE"
    assert identity_evidence["source_entries"] == [17380]
    assert identity_evidence["source_pages"] == [516]
    assert identity_evidence["raw_record_ids"] == ["raw-eu-2025-1175-entry-17380"]

    answered = client.post(
        f'/agent/formulations/{session["session_id"]}/answers',
        json={"revision": session["revision"], "answers": [
            {"question_id": "formulation:product_context", "option_id": "not_supplied"},
            {"question_id": "global:preparation_stage", "option_id": "finished_product"},
        ]},
    )
    assert answered.status_code == 200
    updated = answered.json()
    assert updated["questions"] == []
    assert updated["interpreted_rows"][0]["concentration"]["preparation_stage"]["interpretation_method"] == "user_confirmed_global_stage"

    prepared = client.post(
        f'/agent/formulations/{session["session_id"]}/prepare',
        json={"revision": updated["revision"], "formulation_id": "CSV-001", "formulation_name": "Imported demo", "product_context": None},
    )
    assert prepared.status_code == 200
    canonical = prepared.json()["formulation"]
    assert canonical["ingredients"][0]["concentration"] == {
        "value": 5.0, "unit": "percent", "basis": None, "preparation_stage": "finished_product"
    }
    screened = client.post("/screen-formulation", json=canonical)
    assert screened.status_code == 200
    assert screened.json()["summary"]["ingredients_submitted"] == 3


def test_prepare_is_blocked_before_confirmation_and_stale_answers_conflict(client):
    session = client.post(
        "/agent/formulations",
        files={"file": ("clean.csv", b"INCI,Concentration\nNIACINAMIDE,5%\nGLYCERIN,4%\nTosylchloramide sodium,0.21%\n", "text/csv")},
    ).json()
    blocked = client.post(
        f'/agent/formulations/{session["session_id"]}/prepare',
        json={"revision": session["revision"], "formulation_id": None, "formulation_name": None, "product_context": None},
    )
    assert blocked.status_code == 409
    first = client.post(
        f'/agent/formulations/{session["session_id"]}/answers',
        json={"revision": session["revision"], "answers": [
            {"question_id": "formulation:product_context", "option_id": "not_supplied"},
            {"question_id": "global:preparation_stage", "option_id": "finished_product"},
        ]},
    )
    assert first.status_code == 200
    stale = client.post(
        f'/agent/formulations/{session["session_id"]}/answers',
        json={"revision": session["revision"], "answers": [{"question_id": "global:preparation_stage", "option_id": "ready_for_use"}]},
    )
    assert stale.status_code == 409


def test_qs_and_missing_unit_create_targeted_questions(store, catalogue):
    def messy_runner(parsed, accepted_store, accepted_catalogue, model):
        return interpretation([
            {"source_row": 2, "source_name": "Niacinamide", "interpreted_name": "NIACINAMIDE", "identity_status": "exact_match", "identity_catalogue_id": None, "source_cas": None, "source_concentration": "5", "concentration_value": 5, "concentration_unit": "percent", "issues": ["unit_not_explicit"]},
            {"source_row": 3, "source_name": "Perfume", "interpreted_name": "Perfume", "identity_status": "unresolved", "identity_catalogue_id": None, "source_cas": None, "source_concentration": "QS", "concentration_value": None, "concentration_unit": None, "issues": ["non_numeric_concentration"]},
        ])
    service = FormulationAgentService(store, catalogue, model_runner=messy_runner)
    session = service.create(parse_csv_upload("messy.csv", b"INCI,Concentration\nNiacinamide,5\nPerfume,QS\n"))
    assert {question.question_type for question in session.questions} == {
        "unit", "preparation_stage", "product_context", "non_numeric_concentration",
    }
    assert session.interpreted_rows[1].concentration is None


def test_non_exact_identity_requires_confirmation(store, catalogue):
    def candidate_runner(parsed, accepted_store, accepted_catalogue, model):
        return interpretation([
            {"source_row": 2, "source_name": "Tosyl chl Na", "interpreted_name": "Tosylchloramide sodium", "identity_status": "candidate", "identity_catalogue_id": None, "source_cas": None, "source_concentration": None, "concentration_value": None, "concentration_unit": None, "issues": []},
        ])
    session = FormulationAgentService(store, catalogue, model_runner=candidate_runner).create(
        parse_csv_upload("candidate.csv", b"INCI,Concentration\nTosyl chl Na,\n")
    )
    assert session.interpreted_rows[0].name.source_value == "Tosyl chl Na"
    assert session.interpreted_rows[0].name.needs_confirmation is True
    assert any(question.question_type == "identity" for question in session.questions)


def test_optional_source_metadata_is_preserved_and_inci_is_the_identity_field(store, catalogue):
    def metadata_runner(parsed, accepted_store, accepted_catalogue, model):
        return interpretation(
            [{
                "source_row": 2,
                "source_name": "Niacinamide",
                "interpreted_name": "NIACINAMIDE",
                "identity_status": "exact_match",
                "identity_catalogue_id": None,
                "source_cas": None,
                "source_concentration": "5%",
                "concentration_value": 5,
                "concentration_unit": "percent",
                "issues": [],
            }],
            mappings=[
                {"source_column": "RM Name", "source_column_index": 0, "mapped_field": "raw_material_name", "confidence": "high_confidence"},
                {"source_column": "INCI", "source_column_index": 1, "mapped_field": "ingredient_name", "confidence": "high_confidence"},
                {"source_column": "Dosage", "source_column_index": 2, "mapped_field": "concentration", "confidence": "high_confidence"},
            ],
        )

    session = FormulationAgentService(store, catalogue, model_runner=metadata_runner).create(
        parse_csv_upload("metadata.csv", b"RM Name,INCI,Dosage\nVitamin B3 Active,Niacinamide,5%\n")
    )
    row = session.interpreted_rows[0]
    assert row.name.source_column == "INCI"
    assert row.name.source_value == "Niacinamide"
    assert row.name.value == "NIACINAMIDE"
    assert [(item.source_column, item.source_value, item.mapped_as) for item in row.source_metadata] == [
        ("RM Name", "Vitamin B3 Active", "raw_material_name")
    ]
    assert all(item.source_column != "Notes" for item in row.source_metadata)


def test_product_context_exact_match_and_ambiguous_value_are_kept_distinct(store, catalogue):
    def context_runner(source_context: str):
        def run(parsed, accepted_store, accepted_catalogue, model):
            return interpretation(
                [{
                    "source_row": 2,
                    "source_name": "NIACINAMIDE",
                    "interpreted_name": "NIACINAMIDE",
                    "identity_status": "exact_match",
                    "identity_catalogue_id": None,
                    "source_cas": None,
                    "source_concentration": None,
                    "concentration_value": None,
                    "concentration_unit": None,
                    "issues": [],
                }],
                mappings=[
                    {"source_column": "Ingredient", "source_column_index": 0, "mapped_field": "ingredient_name", "confidence": "high_confidence"},
                    {"source_column": "Product Type", "source_column_index": 1, "mapped_field": "product_context", "confidence": "high_confidence"},
                ],
                formulation_metadata={
                    "formulation_id": {"value": None, "sources": []},
                    "formulation_name": {"value": None, "sources": []},
                    "product_context": {
                        "value": source_context,
                        "sources": [{"source_row": 2, "source_column_index": 1, "source_value": source_context}],
                    },
                },
            )
        return run

    exact = FormulationAgentService(store, catalogue, model_runner=context_runner("Toothpaste")).create(
        parse_csv_upload("exact-context.csv", b"Ingredient,Product Type\nNIACINAMIDE,Toothpaste\n")
    )
    assert exact.product_context.value == "Toothpaste"
    assert exact.product_context.interpretation_method == "exact_product_context_match"
    assert not any(question.question_type == "product_context" for question in exact.questions)

    ambiguous = FormulationAgentService(store, catalogue, model_runner=context_runner("rinse product")).create(
        parse_csv_upload("ambiguous-context.csv", b"Ingredient,Product Type\nNIACINAMIDE,rinse product\n")
    )
    assert ambiguous.product_context.value is None
    assert ambiguous.product_context.source_value == "rinse product"
    assert ambiguous.product_context.needs_confirmation is True
    assert any(question.question_type == "product_context" for question in ambiguous.questions)


def test_preamble_product_context_is_semantic_and_omitted_declared_rows_fail(store, catalogue):
    def partial_runner(parsed, accepted_store, accepted_catalogue, model):
        return interpretation([{
                "source_row": 4,
                "source_name": "NIACINAMIDE",
                "interpreted_name": "NIACINAMIDE",
                "identity_status": "exact_match",
                "identity_catalogue_id": None,
                "source_cas": None,
                "source_concentration": "5%",
                "concentration_value": 5,
                "concentration_unit": "percent",
                "issues": [],
            }], mappings=[
                {"source_column_index": 0, "mapped_field": "metadata", "confidence": "high_confidence"},
                {"source_column_index": 1, "mapped_field": "ingredient_name", "confidence": "high_confidence"},
                {"source_column_index": 2, "mapped_field": "concentration", "confidence": "high_confidence"},
            ], header_rows=[3], data_rows=[4, 5], formulation_metadata={
                "formulation_id": {"value": None, "sources": []},
                "formulation_name": {"value": None, "sources": []},
                "product_context": {
                    "value": "Toothpaste",
                    "sources": [{"source_row": 1, "source_column_index": 2, "source_value": "Toothpaste"}],
                },
            })

    parsed = parse_csv_upload(
        "metadata-preamble.csv",
        b"Product Type,,Toothpaste\n\nSeq,INCI,Dose\n1,NIACINAMIDE,5%\n2,AQUA,balance\n",
    )
    session = FormulationAgentService(store, catalogue, model_runner=partial_runner).create(parsed)

    assert session.state == "failed"
    assert session.error.code == "agent_invalid_source_reference"
    assert session.filename == "metadata-preamble.csv"


def test_missing_product_context_requires_an_explicit_choice_and_enters_canonical_request(store, catalogue):
    def identity_only_runner(parsed, accepted_store, accepted_catalogue, model):
        return interpretation([{
            "source_row": 2,
            "source_name": "NIACINAMIDE",
            "interpreted_name": "NIACINAMIDE",
            "identity_status": "exact_match",
            "identity_catalogue_id": None,
            "source_cas": None,
            "source_concentration": None,
            "concentration_value": None,
            "concentration_unit": None,
            "issues": [],
        }], mappings=[
            {"source_column": "Ingredient", "source_column_index": 0, "mapped_field": "ingredient_name", "confidence": "high_confidence"},
        ])

    service = FormulationAgentService(store, catalogue, model_runner=identity_only_runner)
    session = service.create(parse_csv_upload("missing-context.csv", b"Ingredient\nNIACINAMIDE\n"))
    question = next(item for item in session.questions if item.question_type == "product_context")
    selected = next(option for option in question.options if option.value == "Toothpaste")
    updated = service.apply_answers(session.session_id, AgentAnswersRequest(
        revision=session.revision,
        answers=[AgentAnswer(question_id=question.question_id, option_id=selected.option_id)],
    ))
    assert updated.product_context.value == "Toothpaste"
    prepared = service.prepare(session.session_id, AgentPrepareRequest(
        revision=updated.revision,
        product_context="Toothpaste",
    ))
    assert prepared.formulation.product_context == "Toothpaste"


def test_changed_model_source_copy_fails_exact_reference_validation(store, catalogue):
    def changed_copy_runner(parsed, accepted_store, accepted_catalogue, model):
        return interpretation([
            {"source_row": 2, "source_name": "Niacinamide ", "interpreted_name": "Niacinamide", "identity_status": "exact_match", "identity_catalogue_id": None, "source_cas": None, "source_concentration": None, "concentration_value": None, "concentration_unit": None, "issues": []},
        ])

    session = FormulationAgentService(store, catalogue, model_runner=changed_copy_runner).create(
        parse_csv_upload("source-copy.csv", b"INCI,Concentration\nNiacinamide,\n")
    )
    assert session.state == "failed"
    assert session.error.code == "agent_invalid_source_reference"


def test_logical_ingredient_can_combine_exact_cells_from_multiple_rows(store, catalogue):
    def multirow_runner(parsed, accepted_store, accepted_catalogue, model):
        return ModelInterpretation.model_validate({
            "header_rows": [3],
            "data_rows": [4, 5],
            "column_mappings": [
                {"source_column_index": 0, "mapped_field": "concentration", "confidence": "high_confidence"},
                {"source_column_index": 1, "mapped_field": "ingredient_name", "confidence": "high_confidence"},
                {"source_column_index": 2, "mapped_field": "raw_material_name", "confidence": "high_confidence"},
            ],
            "ingredients": [{
                "row_id": "b3-active",
                "source_rows": [4, 5],
                "interpreted_name": "NIACINAMIDE",
                "identity_status": "exact_match",
                "name_sources": [{"source_row": 5, "source_column_index": 1, "source_value": "NIACINAMIDE"}],
                "proposed_cas": None,
                "cas_sources": [],
                "concentration_value": 5,
                "concentration_unit": None,
                "concentration_value_sources": [{"source_row": 4, "source_column_index": 0, "source_value": "5"}],
                "concentration_unit_sources": [],
                "basis": None,
                "basis_sources": [],
                "preparation_stage": None,
                "preparation_stage_sources": [],
                "uncertainties": ["concentration_unit"],
                "issues": [],
            }],
            "formulation_metadata": {
                "formulation_id": {"value": None, "sources": []},
                "formulation_name": {"value": "Night Serum", "sources": [{"source_row": 1, "source_column_index": 0, "source_value": "Night Serum"}]},
                "product_context": {"value": None, "sources": []},
            },
        })

    parsed = parse_csv_upload(
        "multirow.csv",
        b"Night Serum,,\n,,\nAmount,INCI,RM Name\n5,,B3 Active\n,NIACINAMIDE,B3 Active\n",
    )
    session = FormulationAgentService(store, catalogue, model_runner=multirow_runner).create(parsed)
    assert session.state == "needs_confirmation"
    assert session.interpreted_rows[0].source_rows == [4, 5]
    assert session.interpreted_rows[0].name.source_row == 5
    assert session.interpreted_rows[0].concentration.value.source_row == 4
    assert session.formulation_name.value == "Night Serum"


def test_semantic_reference_failure_gets_one_bounded_repair(store, catalogue):
    valid = interpretation([{
        "source_row": 2, "source_name": "NIACINAMIDE", "interpreted_name": "NIACINAMIDE",
        "identity_status": "exact_match", "source_cas": None, "source_concentration": "5%",
        "concentration_value": 5, "concentration_unit": "percent", "issues": [],
    }])
    invalid = valid.model_copy(deep=True)
    invalid.ingredients[0].name_sources[0].source_value = "CHANGED"

    class RepairingInterpreter(OpenAIFormulationInterpreter):
        def __init__(self):
            super().__init__(api_key="test")
            self.repairs = 0

        def __call__(self, *args):
            return invalid

        def repair(self, *args):
            self.repairs += 1
            return AgentModelRun(
                interpretation=valid,
                usage=OpenAIUsage(configured_model="gpt-5.6-sol", actual_model="gpt-5.6-sol", request_rounds=1),
            )

    interpreter = RepairingInterpreter()
    session = FormulationAgentService(store, catalogue, model_runner=interpreter).create(
        parse_csv_upload("repair.csv", b"INCI,Concentration\nNIACINAMIDE,5%\n")
    )
    assert interpreter.repairs == 1
    assert session.state == "needs_confirmation"
    assert session.interpreted_rows[0].name.value == "NIACINAMIDE"


def test_model_failure_retains_recoverable_session(store, catalogue):
    def failed_runner(*args):
        raise AgentExecutionError("agent_model_unavailable", "Model unavailable")
    session = FormulationAgentService(store, catalogue, model_runner=failed_runner).create(
        parse_csv_upload("clean.csv", b"INCI,Concentration\nNIACINAMIDE,5%\n")
    )
    assert session.state == "failed"
    assert session.error.recoverable is True
    assert session.filename == "clean.csv"


def test_openai_tools_are_strict_read_only_and_never_screen(store, catalogue):
    tool_names = {tool["name"] for tool in OpenAIFormulationInterpreter.tools()}
    assert tool_names == {
        "search_ingredient_catalogue",
        "search_singapore_regulatory_records",
        "search_acd_regulatory_records",
        "validate_formulation",
    }
    assert all(tool["strict"] is True for tool in OpenAIFormulationInterpreter.tools())
    before = store.rules_by_id["acd-iii-14"].copy()
    result = OpenAIFormulationInterpreter._run_tool("search_acd_regulatory_records", {"query": "hydroquinone"}, store, catalogue)
    assert result["results"]
    assert store.rules_by_id["acd-iii-14"] == before


def test_responses_api_is_stateless_bounded_and_sends_parsed_cells_only(monkeypatch, store, catalogue):
    calls = []
    tool_call = SimpleNamespace(
        type="function_call",
        name="search_ingredient_catalogue",
        arguments='{"query":"NIACINAMIDE"}',
        call_id="call-1",
        model_dump=lambda **kwargs: {
            "type": "function_call", "name": "search_ingredient_catalogue",
            "arguments": '{"query":"NIACINAMIDE"}', "call_id": "call-1", "status": "completed",
        },
    )
    final_output = interpretation([
        {"source_row": 2, "source_name": "NIACINAMIDE", "interpreted_name": "NIACINAMIDE", "identity_status": "exact_match", "identity_catalogue_id": "eu-id", "source_cas": None, "source_concentration": "5%", "concentration_value": 5, "concentration_unit": "percent", "issues": []},
    ]).model_dump_json()

    class FakeResponses:
        def create(self, **kwargs):
            calls.append(kwargs)
            if len(calls) == 1:
                return SimpleNamespace(output=[tool_call], output_text="")
            return SimpleNamespace(output=[], output_text=final_output)

    monkeypatch.setattr(
        "backend.app.services.formulation_agent.OpenAI",
        lambda **kwargs: SimpleNamespace(responses=FakeResponses()),
    )
    parsed = parse_csv_upload("private-name.csv", b"INCI,Concentration\nNIACINAMIDE,5%\n")
    output = OpenAIFormulationInterpreter(api_key="test")(parsed, store, catalogue, "gpt-5.6-sol")
    assert output.interpretation.ingredients[0].name_sources[0].source_value == "NIACINAMIDE"
    assert all(call["store"] is False for call in calls)
    assert all(call["max_tool_calls"] <= 12 for call in calls)
    first_payload = json.dumps(calls[0]["input"])
    assert "private-name.csv" not in first_payload
    assert str(ROOT) not in first_payload
    assert "source_text" not in first_payload
    assert any(item.get("type") == "function_call_output" for item in calls[1]["input"])
    continued_call = next(item for item in calls[1]["input"] if item.get("type") == "function_call")
    assert "status" not in continued_call


def test_tool_round_limit_forces_a_final_structured_response_without_more_tools(monkeypatch, store, catalogue):
    calls = []
    final_output = interpretation([{
        "source_row": 2,
        "source_name": "NIACINAMIDE",
        "interpreted_name": "NIACINAMIDE",
        "identity_status": "exact_match",
        "identity_catalogue_id": None,
        "source_cas": None,
        "source_concentration": "5%",
        "concentration_value": 5,
        "concentration_unit": "percent",
        "issues": [],
    }]).model_dump_json()

    class FakeResponses:
        def create(self, **kwargs):
            calls.append(kwargs)
            if kwargs.get("tools") == []:
                return SimpleNamespace(output=[], output_text=final_output)
            call_number = len(calls)
            tool_call = SimpleNamespace(
                type="function_call",
                name="search_ingredient_catalogue",
                arguments='{"query":"NIACINAMIDE"}',
                call_id=f"call-{call_number}",
                model_dump=lambda **dump_kwargs: {
                    "type": "function_call",
                    "name": "search_ingredient_catalogue",
                    "arguments": '{"query":"NIACINAMIDE"}',
                    "call_id": f"call-{call_number}",
                    "status": "completed",
                },
            )
            return SimpleNamespace(output=[tool_call], output_text="")

    monkeypatch.setattr(
        "backend.app.services.formulation_agent.OpenAI",
        lambda **kwargs: SimpleNamespace(responses=FakeResponses()),
    )
    parsed = parse_csv_upload("tool-loop.csv", b"INCI,Concentration\nNIACINAMIDE,5%\n")
    output = OpenAIFormulationInterpreter(api_key="test")(parsed, store, catalogue, "gpt-5.6-sol")

    assert output.interpretation.ingredients[0].name_sources[0].source_value == "NIACINAMIDE"
    assert len([call for call in calls if call.get("tools")]) == 5
    assert calls[-1]["tools"] == []
    assert "Finish the structured interpretation now" in calls[-1]["input"][-1]["content"]


@pytest.mark.openai_integration
@pytest.mark.skipif(__import__("os").getenv("RUN_OPENAI_INTEGRATION") != "1", reason="live OpenAI checks are explicitly opt-in")
def test_live_openai_interpretation_is_optional(store, catalogue):
    from backend.app.config import load_settings

    settings = load_settings()
    if not settings.api_key:
        pytest.skip("OPENAI_API_KEY is not configured")
    parsed = parse_csv_upload(
        "synthetic-messy.csv",
        (
            "Regulens synthetic model check,,,\n"
            "Product Type,Toothpaste,,\n"
            ",,,\n"
            "RM Description,INCI Declaration,Usage,Remarks\n"
            "B3 Active,Niacinamide,5,unit intentionally absent\n"
            "Humectant,Glycerin,4%,explicit percent\n"
            "Water Phase,Aqua,balance,non-numeric\n"
            "Fragrance Base,Parfum,QS,non-numeric\n"
        ).encode()
    )
    model = settings.agent_model
    service = FormulationAgentService(
        store,
        catalogue,
        model_runner=OpenAIFormulationInterpreter(api_key=settings.api_key),
        model=model,
    )
    session = service.create(parsed)
    assert session.state != "failed"
    assert session.usage and session.usage.actual_model
    assert session.usage.actual_model.startswith(model)
    print(json.dumps({
        "model": session.usage.actual_model,
        "input_tokens": session.usage.input_tokens,
        "output_tokens": session.usage.output_tokens,
        "total_tokens": session.usage.total_tokens,
        "tool_calls": session.usage.tool_calls,
        "detected_rows": session.detected_table.data_rows,
        "clarification_questions": [question.question_type for question in session.questions],
        "final_state": session.state,
    }))

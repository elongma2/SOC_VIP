from __future__ import annotations

from collections import Counter

from backend.app.models.formulation import (
    FINDING_SUMMARY_FIELDS,
    DatasetIdentity,
    FormulationMetadata,
    FormulationRequest,
    FormulationScreeningResponse,
    FormulationSummary,
    IngredientScreeningResponse,
    source_snapshot_from_record,
)
from backend.app.models.screening import ConcentrationInput, IngredientInput
from backend.app.services.compliance import screen_ingredient
from backend.app.services.loader import RegulatoryStore
from backend.app.services.parsing import validate_formulation_request


def _runtime_ingredient(ingredient) -> IngredientInput:
    concentration = ingredient.concentration
    runtime_concentration = None
    if concentration is not None:
        runtime_concentration = ConcentrationInput(
            value=concentration.value,
            unit=concentration.unit.value,
            basis=concentration.basis.value if concentration.basis is not None else None,
            preparation_stage=concentration.preparation_stage.value,
        )
    return IngredientInput(
        name=ingredient.name,
        cas_number=ingredient.cas_number,
        concentration=runtime_concentration,
    )


def screen_formulation(
    store: RegulatoryStore, request: FormulationRequest
) -> FormulationScreeningResponse:
    duplicate_groups = validate_formulation_request(request, store)
    results = [
        screen_ingredient(store, _runtime_ingredient(ingredient), request.product_context)
        for ingredient in request.ingredients
    ]
    primary_counts = Counter(result.primary_finding for result in results)
    summary_values = {
        field: primary_counts[finding]
        for finding, field in FINDING_SUMMARY_FIELDS.items()
    }
    summary = FormulationSummary(
        ingredients_submitted=len(results),
        **summary_values,
        total_requiring_review=sum(result.review_required for result in results),
        total_unresolved_identities=sum(
            result.primary_finding.value == "identity_unresolved" for result in results
        ),
        duplicate_row_groups=duplicate_groups,
    )
    ingredient_results = [
        IngredientScreeningResponse(
            submitted_row_number=row_number,
            **result.model_dump(),
        )
        for row_number, result in enumerate(results, start=1)
    ]
    return FormulationScreeningResponse(
        formulation=FormulationMetadata(
            formulation_id=request.formulation_id,
            formulation_name=request.formulation_name,
            product_context=request.product_context,
        ),
        dataset=DatasetIdentity(
            dataset_version=store.dataset_version,
            accepted_baseline_sha256=store.baseline_manifest_hash,
            sources=[source_snapshot_from_record(record) for record in store.source_snapshots],
        ),
        summary=summary,
        ingredient_results=ingredient_results,
    )

from __future__ import annotations

from enum import StrEnum
from typing import Annotated, Any

from pydantic import Field, field_validator, model_validator

from data_pipeline.scripts.normalize import CAS_STRUCTURE_RE, cas_is_valid

from .openai import OpenAIUsage
from .screening import Finding, ScreeningResult, StrictModel
from .identity_catalogue import IdentityCatalogueDataset, IdentityLinkageDataset


class ConcentrationUnit(StrEnum):
    PERCENT = "percent"
    MG_PER_KG = "mg/kg"
    PPM = "ppm"


class ConcentrationBasis(StrEnum):
    NH3 = "NH3"
    FREE_BASE = "free base"
    ZINC = "zinc"
    SULPHATE = "sulphate"
    HYDROCHLORIDE = "hydrochloride"
    TETRAHYDROCHLORIDE = "tetrahydrochloride"


class PreparationStage(StrEnum):
    FINISHED_PRODUCT = "finished_product"
    AFTER_MIXING = "after_mixing"
    READY_FOR_USE = "ready_for_use"


StrictFiniteFloat = Annotated[float, Field(strict=True, ge=0, allow_inf_nan=False)]


class FormulationConcentration(StrictModel):
    value: StrictFiniteFloat
    unit: ConcentrationUnit
    basis: ConcentrationBasis | None
    preparation_stage: PreparationStage

    @model_validator(mode="after")
    def enforce_percentage_ceiling(self) -> "FormulationConcentration":
        if self.unit == ConcentrationUnit.PERCENT and self.value > 100:
            raise ValueError("Percentage concentration cannot exceed 100")
        return self


class FormulationIngredientRequest(StrictModel):
    name: str
    cas_number: str | None = None
    concentration: FormulationConcentration | None = None

    @field_validator("name")
    @classmethod
    def require_nonblank_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Ingredient name cannot be blank")
        return value

    @field_validator("cas_number")
    @classmethod
    def validate_cas_number(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value or not CAS_STRUCTURE_RE.fullmatch(value) or not cas_is_valid(value):
            raise ValueError("CAS number must have valid syntax and checksum")
        return value


class FormulationRequest(StrictModel):
    formulation_id: str | None = None
    formulation_name: str | None = None
    product_context: str | None = None
    ingredients: list[FormulationIngredientRequest] = Field(min_length=1)

    @field_validator("formulation_id", "formulation_name", "product_context")
    @classmethod
    def reject_blank_optional_text(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("Optional text fields must be omitted or non-blank")
        return value


class FormulationMetadata(StrictModel):
    formulation_id: str | None
    formulation_name: str | None
    product_context: str | None


class SourceSnapshot(StrictModel):
    source_document: str
    title: str
    authority: str
    sha256: str
    page_count: int
    source_url: str
    document_revision: str | None
    effective_date: str | None
    retrieval_date: str
    snapshot_generated_at: str | None


class DatasetIdentity(StrictModel):
    dataset_version: str
    accepted_baseline_sha256: str
    sources: list[SourceSnapshot]
    identity_catalogue: IdentityCatalogueDataset
    identity_linkage: IdentityLinkageDataset


class FormulationSummary(StrictModel):
    ingredients_submitted: int
    prohibited_substance_identified: int = 0
    restriction_exceeded: int = 0
    restriction_within_limit: int = 0
    professional_review_required: int = 0
    information_missing: int = 0
    identity_unresolved: int = 0
    no_issue_identified_within_scoped_rules: int = 0
    total_requiring_review: int = 0
    total_unresolved_identities: int = 0
    duplicate_row_groups: list[list[int]] = Field(default_factory=list)


class IngredientScreeningResponse(ScreeningResult):
    submitted_row_number: int


class ReviewExplanationMetadata(StrictModel):
    configured: bool
    configured_model: str
    actual_model: str | None = None
    status: str
    requested_count: int = Field(default=0, ge=0)
    model_count: int = Field(default=0, ge=0)
    fallback_count: int = Field(default=0, ge=0)
    truncated_count: int = Field(default=0, ge=0)
    usage: OpenAIUsage | None = None


class FormulationScreeningResponse(StrictModel):
    formulation: FormulationMetadata
    dataset: DatasetIdentity
    summary: FormulationSummary
    ingredient_results: list[IngredientScreeningResponse]
    review_explanation_metadata: ReviewExplanationMetadata | None = None


class ScreeningOptionsResponse(StrictModel):
    jurisdiction: str
    dataset_version: str
    accepted_baseline_sha256: str
    product_contexts: list[str]
    concentration_units: list[ConcentrationUnit]
    concentration_bases: list[ConcentrationBasis | None]
    preparation_stages: list[PreparationStage]


FINDING_SUMMARY_FIELDS: dict[Finding, str] = {
    Finding.PROHIBITED: "prohibited_substance_identified",
    Finding.RESTRICTION_EXCEEDED: "restriction_exceeded",
    Finding.WITHIN_LIMIT: "restriction_within_limit",
    Finding.PROFESSIONAL_REVIEW: "professional_review_required",
    Finding.INFORMATION_MISSING: "information_missing",
    Finding.IDENTITY_UNRESOLVED: "identity_unresolved",
    Finding.NO_ISSUE: "no_issue_identified_within_scoped_rules",
}


def source_snapshot_from_record(record: dict[str, Any]) -> SourceSnapshot:
    return SourceSnapshot(**{field: record.get(field) for field in SourceSnapshot.model_fields})

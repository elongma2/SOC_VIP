from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Finding(StrEnum):
    NO_ISSUE = "no_issue_identified_within_scoped_rules"
    WITHIN_LIMIT = "restriction_within_limit"
    RESTRICTION_EXCEEDED = "restriction_exceeded"
    PROHIBITED = "prohibited_substance_identified"
    INFORMATION_MISSING = "information_missing"
    IDENTITY_UNRESOLVED = "identity_unresolved"
    PROFESSIONAL_REVIEW = "professional_review_required"


class IdentityStatus(StrEnum):
    RESOLVED = "resolved"
    UNRESOLVED = "unresolved"
    AMBIGUOUS = "ambiguous"
    REVIEW_REQUIRED = "review_required"


class ConcentrationInput(StrictModel):
    value: float = Field(ge=0, allow_inf_nan=False)
    unit: str = Field(min_length=1)
    basis: str | None
    preparation_stage: str = Field(min_length=1)

    @field_validator("unit", "preparation_stage")
    @classmethod
    def require_nonblank_semantics(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Concentration unit and preparation stage cannot be blank")
        return value

    @field_validator("basis")
    @classmethod
    def reject_blank_basis(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("Concentration basis must be null or non-blank")
        return value


class IngredientInput(StrictModel):
    name: str | None = None
    cas_number: str | None = None
    concentration: ConcentrationInput | None = None

    @model_validator(mode="after")
    def require_identity_input(self) -> "IngredientInput":
        if not (self.name and self.name.strip()) and not (self.cas_number and self.cas_number.strip()):
            raise ValueError("At least one of ingredient name or CAS number is required")
        return self


class IdentityCandidate(StrictModel):
    substance_id: str
    source_document: str
    regulatory_section: str
    reference_number: str
    original_substance_name: str
    normalized_substance_name: str
    cas_numbers: list[str] = Field(default_factory=list)
    match_methods: list[str] = Field(default_factory=list)
    cross_reference_statuses: list[str] = Field(default_factory=list)


class IdentityResolution(StrictModel):
    status: IdentityStatus
    match_methods: list[str] = Field(default_factory=list)
    singapore_candidates: list[IdentityCandidate] = Field(default_factory=list)
    acd_candidates: list[IdentityCandidate] = Field(default_factory=list)
    resolved_singapore_substance_id: str | None = None
    reasons: list[str] = Field(default_factory=list)


class RuleEvidence(StrictModel):
    dataset_version: str
    rule_id: str
    source_document: str
    source_version: str | None
    effective_date: str | None
    document_revision: str | None
    retrieval_date: str
    source_url: str
    regulatory_section: str
    reference_number: str
    substance_name: str
    product_context: str | None
    concentration: dict[str, Any] | None
    other_conditions: str | None
    required_warning: str | None
    source_text: str
    source_pages: list[int]
    normalization_status: str
    review_reasons: list[str]
    raw_record_id: str
    raw_fragments: list[dict[str, Any]] = Field(default_factory=list)
    regulation_6_provisions: list[dict[str, Any]] = Field(default_factory=list)
    cross_references: list[dict[str, Any]] = Field(default_factory=list)
    acd_counterpart_rules: list[dict[str, Any]] = Field(default_factory=list)


class RuleEvaluation(StrictModel):
    rule_id: str
    evaluation_status: str
    finding: Finding | None = None
    reasons: list[str] = Field(default_factory=list)
    submitted_concentration: ConcentrationInput | None = None
    evidence: RuleEvidence


class ScreeningResult(StrictModel):
    dataset_version: str
    accepted_baseline_sha256: str
    submitted_ingredient: IngredientInput
    submitted_product_context: str | None
    identity: IdentityResolution
    primary_finding: Finding
    confirmed_findings: list[Finding] = Field(default_factory=list)
    review_required: bool
    review_reasons: list[str] = Field(default_factory=list)
    rule_evaluations: list[RuleEvaluation] = Field(default_factory=list)
    inactive_evidence: list[RuleEvidence] = Field(default_factory=list)
    searched_singapore_parts: list[str] = Field(default_factory=list)
    scope_note: str = (
        "This is an initial Singapore screening result within the implemented rules only; "
        "professional review remains required."
    )

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


class ReviewType(StrEnum):
    IDENTITY = "identity_review"
    RULE = "rule_review"


class IdentitySourceType(StrEnum):
    SINGAPORE_REGULATORY = "singapore_regulatory_source"
    ACD_REGULATORY = "acd_regulatory_source"
    INGREDIENT_CATALOGUE = "ingredient_identity_catalogue"


class SingaporeLinkageStatus(StrEnum):
    NOT_APPLICABLE = "not_applicable"
    LINKED = "linked"
    VERIFIED_NOT_REPRESENTED = "verified_not_represented"
    UNRESOLVED = "unresolved"


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


class CatalogueIdentity(StrictModel):
    ingredient_id: str
    canonical_name: str
    source_name: str
    source_document: str
    source_version: str
    source_url: str
    source_entries: list[int]
    source_pages: list[int]
    raw_record_ids: list[str]
    identity_dataset_version: str
    accepted_baseline_sha256: str


class LinkageTarget(StrictModel):
    raw_record_id: str
    rule_id: str
    substance_id: str
    part: str
    reference: str
    source_substance_name: str
    source_document: str
    source_hash: str


class LinkageReview(StrictModel):
    reviewed: bool
    reviewed_at: str
    reviewer: str
    review_basis: str
    notes: str


class LinkageEvidence(StrictModel):
    linkage_id: str
    accepted_status: SingaporeLinkageStatus
    applicable_to_active_baseline: bool
    identity_dataset_version: str
    identity_dataset_hash: str
    singapore_regulatory_baseline: str
    singapore_regulatory_baseline_hash: str
    screened_scope: list[str]
    singapore_targets: list[LinkageTarget] = Field(default_factory=list)
    review: LinkageReview
    inapplicability_reasons: list[str] = Field(default_factory=list)


class IdentityResolution(StrictModel):
    status: IdentityStatus
    match_methods: list[str] = Field(default_factory=list)
    singapore_candidates: list[IdentityCandidate] = Field(default_factory=list)
    acd_candidates: list[IdentityCandidate] = Field(default_factory=list)
    resolved_singapore_substance_id: str | None = None
    resolved_singapore_substance_ids: list[str] = Field(default_factory=list)
    identity_source_type: IdentitySourceType | None = None
    identity_source_name: str | None = None
    singapore_linkage_status: SingaporeLinkageStatus = SingaporeLinkageStatus.NOT_APPLICABLE
    catalogue_identity: CatalogueIdentity | None = None
    linkage_evidence: LinkageEvidence | None = None
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
    review_types: list[ReviewType] = Field(default_factory=list)
    review_reasons: list[str] = Field(default_factory=list)
    rule_evaluations: list[RuleEvaluation] = Field(default_factory=list)
    inactive_evidence: list[RuleEvidence] = Field(default_factory=list)
    searched_singapore_parts: list[str] = Field(default_factory=list)
    scope_note: str = (
        "This is an initial Singapore screening result within the implemented rules only; "
        "professional review remains required."
    )

    @model_validator(mode="after")
    def require_review_details(self) -> "ScreeningResult":
        if self.review_required and (not self.review_types or not self.review_reasons):
            raise ValueError("Review-required results must include review types and reasons")
        if not self.review_required and self.review_types:
            raise ValueError("Review types require review_required=true")
        self.review_types = list(dict.fromkeys(self.review_types))
        self.review_reasons = list(dict.fromkeys(self.review_reasons))
        return self

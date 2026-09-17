from __future__ import annotations

from typing import Any

from pydantic import Field

from .screening import StrictModel


class ACDIngredientSearchResult(StrictModel):
    rule_id: str
    substance_id: str
    name: str
    annex: str
    reference: str
    cas_numbers: list[str] = Field(default_factory=list)
    restriction_type: str
    product_context: str | None
    concentration: dict[str, Any] | None
    concentration_text: str | None
    other_conditions: str | None
    required_warning: str | None
    source_text: str
    source_pages: list[int]
    raw_record_id: str
    source_version: str | None
    source_url: str
    normalization_status: str
    review_reasons: list[str] = Field(default_factory=list)
    manual_review_required: bool


class ACDIngredientSearchResponse(StrictModel):
    query: str
    dataset_version: str
    accepted_baseline_sha256: str
    results: list[ACDIngredientSearchResult]

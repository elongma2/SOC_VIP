from __future__ import annotations

from data_pipeline.scripts.normalize import conservative_text

from backend.app.models.screening import (
    Finding,
    IdentityStatus,
    IngredientInput,
    RuleEvaluation,
    ScreeningResult,
)
from backend.app.services.evidence import build_rule_evidence
from backend.app.services.loader import RegulatoryStore
from backend.app.services.resolver import resolve_ingredient


def _same(value: str | None, expected: str | None) -> bool:
    if value is None or expected is None:
        return value is expected
    return conservative_text(value) == conservative_text(expected)


def _dedupe(values: list[str]) -> list[str]:
    return list(dict.fromkeys(values))


def screen_ingredient(
    store: RegulatoryStore,
    ingredient: IngredientInput,
    product_context: str | None = None,
) -> ScreeningResult:
    identity = resolve_ingredient(store, ingredient.name, ingredient.cas_number)
    if identity.status == IdentityStatus.UNRESOLVED:
        return ScreeningResult(
            dataset_version=store.dataset_version,
            accepted_baseline_sha256=store.baseline_manifest_hash,
            submitted_ingredient=ingredient,
            submitted_product_context=product_context,
            identity=identity,
            primary_finding=Finding.IDENTITY_UNRESOLVED,
            review_required=True,
            review_reasons=identity.reasons,
        )
    if identity.status != IdentityStatus.RESOLVED:
        return ScreeningResult(
            dataset_version=store.dataset_version,
            accepted_baseline_sha256=store.baseline_manifest_hash,
            submitted_ingredient=ingredient,
            submitted_product_context=product_context,
            identity=identity,
            primary_finding=Finding.PROFESSIONAL_REVIEW,
            review_required=True,
            review_reasons=identity.reasons,
        )

    substance_id = identity.resolved_singapore_substance_id
    assert substance_id
    all_rules = [
        rule
        for rule in store.rules_by_substance_id.get(substance_id, ())
        if rule["regulatory_section"] in {"Third Schedule Part I", "Third Schedule Part II"}
    ]
    evaluations: list[RuleEvaluation] = []
    inactive_evidence = []
    confirmed: list[Finding] = []
    review_reasons: list[str] = []
    missing_reasons: list[str] = []

    submitted_context_key = conservative_text(product_context) if product_context and product_context.strip() else None
    context_is_source_backed = (
        submitted_context_key is None or submitted_context_key in store.source_backed_contexts
    )

    for rule in sorted(all_rules, key=lambda item: item["rule_id"]):
        evidence = build_rule_evidence(store, rule)
        inactive = not rule["active"] or rule["normalization_status"] == "inactive_source_entry"
        if inactive:
            inactive_evidence.append(evidence)
            if rule.get("unresolved_current_applicability"):
                reason = f"{rule['rule_id']}: inactive record has unresolved current applicability"
                review_reasons.append(reason)
                evaluations.append(
                    RuleEvaluation(
                        rule_id=rule["rule_id"],
                        evaluation_status="withheld_professional_review",
                        reasons=[reason],
                        evidence=evidence,
                    )
                )
            continue

        if rule["regulatory_section"] == "Third Schedule Part I":
            if rule["normalization_status"] != "normalized":
                reasons = rule["review_reasons"] or ["prohibition semantics require professional review"]
                review_reasons.extend(f"{rule['rule_id']}: {reason}" for reason in reasons)
                evaluations.append(
                    RuleEvaluation(
                        rule_id=rule["rule_id"],
                        evaluation_status="withheld_professional_review",
                        reasons=reasons,
                        evidence=evidence,
                    )
                )
            else:
                confirmed.append(Finding.PROHIBITED)
                evaluations.append(
                    RuleEvaluation(
                        rule_id=rule["rule_id"],
                        evaluation_status="deterministic",
                        finding=Finding.PROHIBITED,
                        evidence=evidence,
                    )
                )
            continue

        rule_context = rule.get("product_context")
        all_products = rule_context and conservative_text(rule_context) == "all products"
        if rule_context and not all_products:
            if submitted_context_key is None:
                reason = f"{rule['rule_id']}: product context is required"
                missing_reasons.append(reason)
                evaluations.append(
                    RuleEvaluation(
                        rule_id=rule["rule_id"],
                        evaluation_status="withheld_information_missing",
                        reasons=[reason],
                        evidence=evidence,
                    )
                )
                continue
            if rule["normalization_status"] != "normalized":
                reasons = rule["review_reasons"] or ["restriction semantics require professional review"]
                review_reasons.extend(f"{rule['rule_id']}: {reason}" for reason in reasons)
                evaluations.append(
                    RuleEvaluation(
                        rule_id=rule["rule_id"],
                        evaluation_status="withheld_professional_review",
                        reasons=reasons,
                        evidence=evidence,
                    )
                )
                continue
            if not context_is_source_backed:
                reason = f"{rule['rule_id']}: submitted product context is not an exact source-backed context"
                review_reasons.append(reason)
                evaluations.append(
                    RuleEvaluation(
                        rule_id=rule["rule_id"],
                        evaluation_status="withheld_professional_review",
                        reasons=[reason],
                        evidence=evidence,
                    )
                )
                continue
            if submitted_context_key != conservative_text(rule_context):
                evaluations.append(
                    RuleEvaluation(
                        rule_id=rule["rule_id"],
                        evaluation_status="not_applicable_to_submitted_context",
                        evidence=evidence,
                    )
                )
                continue

        if rule["normalization_status"] != "normalized":
            reasons = rule["review_reasons"] or ["restriction semantics require professional review"]
            review_reasons.extend(f"{rule['rule_id']}: {reason}" for reason in reasons)
            evaluations.append(
                RuleEvaluation(
                    rule_id=rule["rule_id"],
                    evaluation_status="withheld_professional_review",
                    reasons=reasons,
                    evidence=evidence,
                )
            )
            continue

        constraint = rule.get("concentration")
        if not constraint:
            reason = f"{rule['rule_id']}: normalized restriction has no executable concentration constraint"
            review_reasons.append(reason)
            evaluations.append(
                RuleEvaluation(
                    rule_id=rule["rule_id"],
                    evaluation_status="withheld_professional_review",
                    reasons=[reason],
                    evidence=evidence,
                )
            )
            continue
        if not constraint.get("preparation_stage") or conservative_text(constraint["preparation_stage"]) == "unspecified":
            reason = f"{rule['rule_id']}: source preparation stage is not sufficiently specified for comparison"
            review_reasons.append(reason)
            evaluations.append(
                RuleEvaluation(
                    rule_id=rule["rule_id"],
                    evaluation_status="withheld_professional_review",
                    reasons=[reason],
                    submitted_concentration=ingredient.concentration,
                    evidence=evidence,
                )
            )
            continue
        if ingredient.concentration is None:
            reason = f"{rule['rule_id']}: concentration value, unit, basis, and stage are required"
            missing_reasons.append(reason)
            evaluations.append(
                RuleEvaluation(
                    rule_id=rule["rule_id"],
                    evaluation_status="withheld_information_missing",
                    reasons=[reason],
                    evidence=evidence,
                )
            )
            continue
        submitted = ingredient.concentration
        incompatible = []
        if not _same(submitted.unit, constraint.get("unit")):
            incompatible.append("unit")
        if not _same(submitted.basis, constraint.get("basis")):
            incompatible.append("basis")
        if not _same(submitted.preparation_stage, constraint.get("preparation_stage")):
            incompatible.append("preparation_stage")
        if incompatible:
            reason = f"{rule['rule_id']}: incompatible " + ", ".join(incompatible) + "; no conversion performed"
            review_reasons.append(reason)
            evaluations.append(
                RuleEvaluation(
                    rule_id=rule["rule_id"],
                    evaluation_status="withheld_professional_review",
                    reasons=[reason],
                    submitted_concentration=submitted,
                    evidence=evidence,
                )
            )
            continue
        comparator = constraint.get("comparator")
        limit = constraint.get("value")
        if comparator not in {"less_than_or_equal", "less_than"} or not isinstance(limit, (int, float)):
            reason = f"{rule['rule_id']}: unsupported comparator or numerical limit"
            review_reasons.append(reason)
            evaluations.append(
                RuleEvaluation(
                    rule_id=rule["rule_id"],
                    evaluation_status="withheld_professional_review",
                    reasons=[reason],
                    submitted_concentration=submitted,
                    evidence=evidence,
                )
            )
            continue
        within = submitted.value <= limit if comparator == "less_than_or_equal" else submitted.value < limit
        finding = Finding.WITHIN_LIMIT if within else Finding.RESTRICTION_EXCEEDED
        confirmed.append(finding)
        ancillary_reasons = []
        if (rule.get("other_conditions") or "").strip():
            ancillary_reasons.append("other regulatory requirements were returned as evidence but not evaluated")
        if (rule.get("required_warning") or "").strip():
            ancillary_reasons.append("required warning was returned as evidence but not evaluated")
        review_reasons.extend(f"{rule['rule_id']}: {reason}" for reason in ancillary_reasons)
        evaluations.append(
            RuleEvaluation(
                rule_id=rule["rule_id"],
                evaluation_status="deterministic",
                finding=finding,
                reasons=ancillary_reasons,
                submitted_concentration=submitted,
                evidence=evidence,
            )
        )

    confirmed = list(dict.fromkeys(confirmed))
    if Finding.PROHIBITED in confirmed:
        primary = Finding.PROHIBITED
    elif Finding.RESTRICTION_EXCEEDED in confirmed:
        primary = Finding.RESTRICTION_EXCEEDED
    elif review_reasons:
        primary = Finding.PROFESSIONAL_REVIEW
    elif missing_reasons:
        primary = Finding.INFORMATION_MISSING
    elif Finding.WITHIN_LIMIT in confirmed:
        primary = Finding.WITHIN_LIMIT
    else:
        primary = Finding.NO_ISSUE

    return ScreeningResult(
        dataset_version=store.dataset_version,
        accepted_baseline_sha256=store.baseline_manifest_hash,
        submitted_ingredient=ingredient,
        submitted_product_context=product_context,
        identity=identity,
        primary_finding=primary,
        confirmed_findings=confirmed,
        review_required=bool(review_reasons),
        review_reasons=_dedupe(review_reasons),
        rule_evaluations=evaluations,
        inactive_evidence=inactive_evidence,
        searched_singapore_parts=["Third Schedule Part I", "Third Schedule Part II"],
    )

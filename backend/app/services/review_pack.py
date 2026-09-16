from __future__ import annotations

import json
from collections import Counter
from pathlib import Path
from typing import Any, Iterable

from backend.app.services.evidence import build_rule_evidence
from backend.app.services.loader import RegulatoryStore, load_accepted_store


CATEGORIES = (
    "conditional_prohibition",
    "ambiguous_multi_case_restriction",
    "secondary_numerical_condition",
    "active_acd_only",
    "materially_changed_cross_reference",
)
QUESTIONS = {
    "conditional_prohibition": "How should the stated exception be represented and evaluated for Singapore screening?",
    "ambiguous_multi_case_restriction": "Can the source cases be mapped into separate executable rules without adding an interpretation?",
    "secondary_numerical_condition": "How should the additional numerical condition be represented and when is it applicable?",
    "active_acd_only": "Does this newer ACD entry have any current Singapore effect, or should it remain comparison evidence only?",
    "materially_changed_cross_reference": "Does this source difference affect Singapore screening, and which exact condition should the reviewer apply?",
}


def _natural_reference(rule: dict[str, Any]) -> tuple[int, str]:
    value = rule["reference_number"].casefold().removeprefix("a")
    digits = "".join(character for character in value if character.isdigit())
    return (int(digits) if digits else 10**9, value)


def _cross_reference_for_rule(store: RegulatoryStore, rule: dict[str, Any]) -> dict[str, Any] | None:
    values = store.cross_references_by_rule_id.get(rule["rule_id"], ())
    return values[0] if len(values) == 1 else None


def _case_key(store: RegulatoryStore, rule: dict[str, Any]) -> str:
    cross_reference = _cross_reference_for_rule(store, rule)
    if cross_reference:
        return cross_reference["cross_reference_id"]
    return rule.get("parent_rule_id") or f"{rule['source_document']}:{rule['regulatory_section']}:{rule['reference_number']}"


def _source_entry(store: RegulatoryStore, rule: dict[str, Any]) -> dict[str, Any]:
    evidence = build_rule_evidence(store, rule).model_dump(mode="json")
    return {
        "jurisdiction": "Singapore" if rule["source_document"].startswith("singapore") else "ASEAN",
        "source_document": evidence["source_document"],
        "source_version": evidence["source_version"],
        "effective_date": evidence["effective_date"],
        "document_revision": evidence["document_revision"],
        "retrieval_date": evidence["retrieval_date"],
        "source_url": evidence["source_url"],
        "source_pages": evidence["source_pages"],
        "regulatory_section": evidence["regulatory_section"],
        "reference_number": evidence["reference_number"],
        "rule_id": evidence["rule_id"],
        "substance_wording": evidence["substance_name"],
        "exact_source_wording": evidence["source_text"],
        "normalization_status": evidence["normalization_status"],
        "review_reasons": evidence["review_reasons"],
        "raw_record_id": evidence["raw_record_id"],
        "bounding_box_fragments": evidence["raw_fragments"],
    }


def _case(
    store: RegulatoryStore,
    category: str,
    primary_rule: dict[str, Any],
    cross_reference: dict[str, Any] | None = None,
) -> dict[str, Any]:
    cross_reference = cross_reference or _cross_reference_for_rule(store, primary_rule)
    linked_ids: list[str] = []
    if cross_reference:
        linked_ids = cross_reference["singapore_rule_ids"] + cross_reference["acd_rule_ids"]
    if primary_rule["rule_id"] not in linked_ids:
        linked_ids.append(primary_rule["rule_id"])
    linked_rules = [store.rules_by_id[rule_id] for rule_id in dict.fromkeys(linked_ids)]
    sources = [_source_entry(store, rule) for rule in linked_rules]
    reasons = list(primary_rule["review_reasons"])
    if cross_reference:
        reasons.extend(cross_reference["review_reasons"])
    return {
        "case_id": f"review-{category}-{primary_rule['rule_id']}",
        "priority": CATEGORIES.index(category) + 1,
        "category": category,
        "reference_number": primary_rule["reference_number"],
        "substance_wording": primary_rule["substance_name"],
        "normalization_status": primary_rule["normalization_status"],
        "cross_reference_id": cross_reference["cross_reference_id"] if cross_reference else None,
        "cross_reference_status": cross_reference["comparison_status"] if cross_reference else None,
        "field_differences": cross_reference["field_differences"] if cross_reference else {},
        "review_reasons": list(dict.fromkeys(reasons)),
        "reviewer_question": QUESTIONS[category],
        "sources": sources,
    }


def _select_rules(
    store: RegulatoryStore,
    rules: Iterable[dict[str, Any]],
    reason: str,
    used: set[str],
    count: int = 5,
) -> list[dict[str, Any]]:
    selected = []
    for rule in sorted(rules, key=lambda item: (not item["source_document"].startswith("singapore"), _natural_reference(item))):
        key = _case_key(store, rule)
        if reason not in rule["review_reasons"] or key in used:
            continue
        selected.append(rule)
        used.add(key)
        if len(selected) == count:
            break
    if len(selected) != count:
        raise RuntimeError(f"Could not select {count} unique records for {reason}")
    return selected


def build_review_pack(store: RegulatoryStore) -> dict[str, Any]:
    rules = list(store.rules_by_id.values())
    used: set[str] = set()
    cases: list[dict[str, Any]] = []
    selections = (
        ("conditional_prohibition", "conditional_prohibition_wording_not_structured"),
        ("ambiguous_multi_case_restriction", "multi_case_mapping_not_unambiguous"),
        ("secondary_numerical_condition", "additional_numeric_condition_not_structured"),
    )
    for category, reason in selections:
        for rule in _select_rules(store, rules, reason, used):
            cases.append(_case(store, category, rule))

    acd_only = [
        cross_reference
        for cross_reference in store.cross_references
        if cross_reference["comparison_status"] == "acd_only"
        and any(store.rules_by_id[rule_id]["active"] for rule_id in cross_reference["acd_rule_ids"])
    ]
    acd_only_count = 0
    for cross_reference in sorted(acd_only, key=lambda item: item["reference_number"]):
        rule = next(store.rules_by_id[rule_id] for rule_id in cross_reference["acd_rule_ids"] if store.rules_by_id[rule_id]["active"])
        key = _case_key(store, rule)
        if key in used:
            continue
        used.add(key)
        cases.append(_case(store, "active_acd_only", rule, cross_reference))
        acd_only_count += 1
        if acd_only_count == 5:
            break

    semantic_fields = {"product_context", "concentration", "concentration_text", "other_conditions", "required_warning"}
    changed = [
        cross_reference
        for cross_reference in store.cross_references
        if cross_reference["comparison_status"] == "changed"
        and semantic_fields.intersection(cross_reference["field_differences"])
    ]
    changed.sort(key=lambda item: item["reference_number"])
    changed_count = 0
    for cross_reference in changed:
        rule_id = cross_reference["singapore_rule_ids"][0]
        rule = store.rules_by_id[rule_id]
        key = _case_key(store, rule)
        if key in used:
            continue
        used.add(key)
        cases.append(_case(store, "materially_changed_cross_reference", rule, cross_reference))
        changed_count += 1
        if changed_count == 5:
            break

    counts = Counter(item["category"] for item in cases)
    if len(cases) != 25 or any(counts[category] != 5 for category in CATEGORIES):
        raise RuntimeError(f"Review pack category invariant failed: {dict(counts)}")
    complete_queue = json.loads(
        (store.root / "data_pipeline" / "reports" / "manual_review_queue.json").read_text(encoding="utf-8")
    )
    return {
        "dataset_version": store.dataset_version,
        "accepted_baseline_sha256": store.baseline_manifest_hash,
        "purpose": "First-pass regulatory professional triage; no item is automatically resolved.",
        "complete_review_queue": "data_pipeline/reports/manual_review_queue.json",
        "complete_review_queue_item_count": len(complete_queue["items"]),
        "summary": {"total_cases": len(cases), "counts_by_category": dict(counts)},
        "cases": cases,
    }


def render_review_pack_markdown(pack: dict[str, Any]) -> str:
    lines = [
        "# Regulatory Professional First-Pass Review Pack",
        "",
        f"Dataset: `{pack['dataset_version']}`  ",
        f"Accepted baseline manifest SHA-256: `{pack['accepted_baseline_sha256']}`  ",
        f"Cases: **{pack['summary']['total_cases']}** (five in each priority category).  ",
        "The complete unresolved inventory remains `data_pipeline/reports/manual_review_queue.json` (2,313 items).",
        "",
        "These questions request professional interpretation. The runtime does not resolve or execute the uncertain wording.",
        "",
    ]
    for item in pack["cases"]:
        lines.extend(
            [
                f"## P{item['priority']} · {item['category'].replace('_', ' ').title()} · {item['reference_number']}",
                "",
                f"**Substance:** {item['substance_wording']}  ",
                f"**Status:** `{item['normalization_status']}` / `{item['cross_reference_status'] or 'not_cross_referenced'}`  ",
                f"**Review reasons:** {', '.join(item['review_reasons']) or 'Source comparison requires review.'}  ",
                f"**Question:** {item['reviewer_question']}",
                "",
            ]
        )
        if item["field_differences"]:
            lines.extend(["**Field differences:**", "", "```json", json.dumps(item["field_differences"], ensure_ascii=False, indent=2), "```", ""])
        for source in item["sources"]:
            pages = ", ".join(str(page) for page in source["source_pages"])
            lines.extend(
                [
                    f"<details><summary>{source['jurisdiction']} · {source['regulatory_section']} · {source['rule_id']}</summary>",
                    "",
                    f"Version/date: {source['source_version'] or source['document_revision']}; effective {source['effective_date'] or 'not stated'}; retrieved {source['retrieval_date']}  ",
                    f"Pages: {pages} · [Official source]({source['source_url']})  ",
                    f"Raw record: `{source['raw_record_id']}`",
                    "",
                    "```text",
                    source["exact_source_wording"],
                    "```",
                    "",
                    "</details>",
                    "",
                ]
            )
    return "\n".join(lines).rstrip() + "\n"


def write_review_pack(root: Path | None = None) -> tuple[Path, Path]:
    store = load_accepted_store(root)
    pack = build_review_pack(store)
    json_path = store.root / "data_pipeline" / "reports" / "professional_review_pack.json"
    markdown_path = store.root / "docs" / "REGULATORY_PROFESSIONAL_REVIEW_PACK.md"
    json_path.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    markdown_path.write_text(render_review_pack_markdown(pack), encoding="utf-8")
    return json_path, markdown_path


if __name__ == "__main__":
    for output in write_review_pack():
        print(output)

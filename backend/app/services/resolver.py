from __future__ import annotations

from collections import defaultdict
from typing import Iterable

from data_pipeline.scripts.normalize import cas_is_valid, conservative_text

from backend.app.models.screening import IdentityCandidate, IdentityResolution, IdentityStatus
from backend.app.services.loader import ACD_SECTIONS, SINGAPORE_SECTIONS, RegulatoryStore


SAFE_BRIDGE_STATUS = "aligned"


def _candidate(substance: dict, methods: Iterable[str], statuses: Iterable[str] = ()) -> IdentityCandidate:
    return IdentityCandidate(
        substance_id=substance["substance_id"],
        source_document=substance["source_document"],
        regulatory_section=substance["regulatory_section"],
        reference_number=substance["reference_number"],
        original_substance_name=substance["original_substance_name"],
        normalized_substance_name=substance["normalized_substance_name"],
        cas_numbers=substance["cas_numbers"],
        match_methods=sorted(set(methods)),
        cross_reference_statuses=sorted(set(statuses)),
    )


def _merge(candidates: Iterable[IdentityCandidate]) -> list[IdentityCandidate]:
    merged: dict[str, IdentityCandidate] = {}
    for candidate in candidates:
        current = merged.get(candidate.substance_id)
        if current is None:
            merged[candidate.substance_id] = candidate
            continue
        merged[candidate.substance_id] = current.model_copy(
            update={
                "match_methods": sorted(set(current.match_methods + candidate.match_methods)),
                "cross_reference_statuses": sorted(
                    set(current.cross_reference_statuses + candidate.cross_reference_statuses)
                ),
            }
        )
    return [merged[key] for key in sorted(merged)]


def _matches_for_substances(
    store: RegulatoryStore, substances: Iterable[dict], method: str
) -> tuple[list[IdentityCandidate], list[IdentityCandidate], dict[str, set[str]]]:
    singapore: list[IdentityCandidate] = []
    acd: list[IdentityCandidate] = []
    bridge_statuses: dict[str, set[str]] = defaultdict(set)
    for substance in substances:
        if substance["regulatory_section"] in SINGAPORE_SECTIONS:
            singapore.append(_candidate(substance, [method]))
            continue
        if substance["regulatory_section"] not in ACD_SECTIONS:
            continue
        acd_candidate = _candidate(substance, [method])
        acd.append(acd_candidate)
        for rule in store.rules_by_substance_id.get(substance["substance_id"], ()):
            for cross_reference in store.cross_references_by_rule_id.get(rule["rule_id"], ()):
                status = cross_reference["comparison_status"]
                for rule_id in cross_reference["singapore_rule_ids"]:
                    singapore_rule = store.rules_by_id[rule_id]
                    singapore_id = singapore_rule.get("substance_id")
                    if not singapore_id:
                        continue
                    bridge_statuses[singapore_id].add(status)
                    singapore_substance = store.substances_by_id[singapore_id]
                    singapore.append(_candidate(singapore_substance, [f"{method}_via_acd"], [status]))
    return _merge(singapore), _merge(acd), bridge_statuses


def resolve_ingredient(store: RegulatoryStore, name: str | None, cas_number: str | None) -> IdentityResolution:
    name_sg: list[IdentityCandidate] = []
    name_acd: list[IdentityCandidate] = []
    name_statuses: dict[str, set[str]] = {}
    cas_sg: list[IdentityCandidate] = []
    cas_acd: list[IdentityCandidate] = []
    cas_statuses: dict[str, set[str]] = {}
    reasons: list[str] = []

    if name and name.strip():
        substances = store.substances_by_name.get(conservative_text(name), ())
        name_sg, name_acd, name_statuses = _matches_for_substances(store, substances, "exact_name")

    supplied_cas = cas_number.strip() if cas_number else None
    if supplied_cas:
        if cas_is_valid(supplied_cas):
            cas_sg, cas_acd, cas_statuses = _matches_for_substances(
                store, store.substances_by_cas.get(supplied_cas, ()), "exact_cas"
            )
        else:
            reasons.append("supplied_cas_is_malformed")

    all_sg = _merge([*name_sg, *cas_sg])
    all_acd = _merge([*name_acd, *cas_acd])
    name_ids = {item.substance_id for item in name_sg}
    cas_ids = {item.substance_id for item in cas_sg}

    def safe(candidate_id: str, statuses: dict[str, set[str]], candidates: list[IdentityCandidate]) -> bool:
        candidate = next((item for item in candidates if item.substance_id == candidate_id), None)
        if candidate and any(not method.endswith("_via_acd") for method in candidate.match_methods):
            return True
        values = statuses.get(candidate_id)
        return values is None or values == {SAFE_BRIDGE_STATUS}

    if name and name.strip() and supplied_cas:
        if not name_ids and not cas_ids and not name_acd and not cas_acd:
            return IdentityResolution(
                status=IdentityStatus.UNRESOLVED,
                singapore_candidates=all_sg,
                acd_candidates=all_acd,
                reasons=reasons + ["neither_name_nor_cas_resolved_to_a_source_backed_identity"],
            )
        common = name_ids & cas_ids
        if len(common) == 1:
            common_id = next(iter(common))
            return IdentityResolution(
                status=IdentityStatus.RESOLVED,
                match_methods=["exact_name", "exact_cas"],
                singapore_candidates=all_sg,
                acd_candidates=all_acd,
                resolved_singapore_substance_id=common_id,
            )
        if name_ids and cas_ids and not common:
            reasons.append("supplied_name_and_cas_resolve_to_different_singapore_identities")
        elif len(common) > 1:
            reasons.append("supplied_name_and_cas_have_multiple_common_singapore_identities")
        elif name_ids or cas_ids:
            reasons.append("only_one_supplied_identifier_provides_a_unique_corroborated_identity")
        else:
            reasons.append("supplied_identifiers_do_not_establish_a_unique_singapore_identity")
        return IdentityResolution(
            status=IdentityStatus.AMBIGUOUS if name_ids and cas_ids else IdentityStatus.REVIEW_REQUIRED,
            singapore_candidates=all_sg,
            acd_candidates=all_acd,
            reasons=reasons,
        )

    candidates = name_sg if name and name.strip() else cas_sg
    acd_candidates = name_acd if name and name.strip() else cas_acd
    statuses = name_statuses if name and name.strip() else cas_statuses
    ids = {item.substance_id for item in candidates}
    if len(ids) == 1:
        candidate_id = next(iter(ids))
        if safe(candidate_id, statuses, candidates):
            return IdentityResolution(
                status=IdentityStatus.RESOLVED,
                match_methods=sorted({method for candidate in candidates for method in candidate.match_methods}),
                singapore_candidates=candidates,
                acd_candidates=acd_candidates,
                resolved_singapore_substance_id=candidate_id,
            )
        reasons.append("singapore_identity_bridge_is_not_aligned")
        status = IdentityStatus.REVIEW_REQUIRED
    elif len(ids) > 1:
        reasons.append("identifier_matches_multiple_singapore_identities")
        status = IdentityStatus.AMBIGUOUS
    elif acd_candidates:
        reasons.append("exact_identity_exists_only_in_the_acd_snapshot")
        status = IdentityStatus.REVIEW_REQUIRED
    else:
        reasons.append("no_source_backed_identity_match")
        status = IdentityStatus.UNRESOLVED
    return IdentityResolution(
        status=status,
        singapore_candidates=candidates,
        acd_candidates=acd_candidates,
        reasons=reasons,
    )

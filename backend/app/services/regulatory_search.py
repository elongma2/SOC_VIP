from __future__ import annotations

from data_pipeline.scripts.normalize import conservative_text

from backend.app.services.loader import ACD_SECTIONS, SINGAPORE_SECTIONS, RegulatoryStore
from backend.app.services.search_names import regulatory_search_keys


def _search_rules(
    store: RegulatoryStore,
    query: str,
    sections: set[str],
    limit: int = 20,
) -> list[dict]:
    query_key = conservative_text(query)
    ranked: list[tuple[int, str, str, str, dict]] = []
    for rule in store.rules_by_id.values():
        if rule["regulatory_section"] not in sections or not rule["active"]:
            continue
        keys = regulatory_search_keys(rule["substance_name"])
        if query_key in keys:
            rank = 0
        elif any(key.startswith(query_key) for key in keys):
            rank = 1
        elif any(query_key in key for key in keys):
            rank = 2
        else:
            continue
        ranked.append(
            (
                rank,
                min(keys),
                rule["regulatory_section"],
                rule["rule_id"],
                rule,
            )
        )
    ranked.sort(key=lambda item: item[:4])
    return [item[4] for item in ranked[:limit]]


def search_acd_rules(store: RegulatoryStore, query: str, limit: int = 20) -> list[dict]:
    return _search_rules(store, query, ACD_SECTIONS, limit)


def search_singapore_rules(store: RegulatoryStore, query: str, limit: int = 20) -> list[dict]:
    return _search_rules(store, query, SINGAPORE_SECTIONS, limit)

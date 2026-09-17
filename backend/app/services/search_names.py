from __future__ import annotations

from data_pipeline.scripts.normalize import conservative_text


EXCEPT_DELIMITER = " (except "


def derived_except_search_name(source_name: str) -> str | None:
    """Return the literal source prefix before `` (except `` for lookup only."""

    index = source_name.casefold().find(EXCEPT_DELIMITER)
    if index <= 0:
        return None
    prefix = source_name[:index].strip()
    return prefix or None


def regulatory_search_keys(source_name: str) -> tuple[str, ...]:
    keys = [conservative_text(source_name)]
    derived = derived_except_search_name(source_name)
    if derived:
        key = conservative_text(derived)
        if key not in keys:
            keys.append(key)
    return tuple(keys)

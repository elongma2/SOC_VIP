from __future__ import annotations

import hashlib
import json
import re
from bisect import bisect_left
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from data_pipeline.identity.eu_common_ingredient_glossary.scripts.pipeline import search_name


IDENTITY_SOURCE_NAME = "EU Glossary of Common Ingredient Names"


class AcceptedIdentityCatalogueError(RuntimeError):
    """Raised when the independent accepted identity catalogue cannot be verified."""


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _display_name(canonical_name: str) -> str:
    if re.fullmatch(r"[A-Z]+(?: [A-Z]+)*", canonical_name):
        return canonical_name.capitalize()
    return canonical_name


@dataclass(frozen=True)
class IngredientCatalog:
    root: Path
    dataset_version: str
    baseline_manifest_hash: str
    source_document: dict[str, Any]
    ingredient_count: int
    ingredients: tuple[dict[str, Any], ...]
    raw_by_id: dict[str, dict[str, Any]]
    by_search_name: dict[str, dict[str, Any]]
    sorted_search_names: tuple[str, ...]
    ingredients_by_search_name: tuple[dict[str, Any], ...]

    def find_exact_name(self, value: str) -> dict[str, Any] | None:
        return self.by_search_name.get(search_name(value))

    def search_prefix(self, query: str) -> tuple[dict[str, Any], ...]:
        key = search_name(query)
        start = bisect_left(self.sorted_search_names, key)
        matches: list[dict[str, Any]] = []
        for index in range(start, len(self.sorted_search_names)):
            candidate = self.sorted_search_names[index]
            if not candidate.startswith(key):
                break
            matches.append(self.ingredients_by_search_name[index])
        return tuple(matches)

    def search(self, query: str, limit: int = 20) -> list[dict[str, Any]]:
        key = search_name(query)
        ranked: list[tuple[int, str, str, dict[str, Any]]] = []
        seen: set[str] = set()

        exact = self.by_search_name.get(key)
        if exact is not None:
            ranked.append((0, key, exact["ingredient_id"], exact))
            seen.add(exact["ingredient_id"])

        for ingredient in self.search_prefix(key):
            if ingredient["ingredient_id"] in seen:
                continue
            ranked.append((1, ingredient["search_name"], ingredient["ingredient_id"], ingredient))
            seen.add(ingredient["ingredient_id"])
            if len(ranked) >= limit:
                break

        if len(ranked) < limit:
            for ingredient in self.ingredients_by_search_name:
                if ingredient["ingredient_id"] in seen or key not in ingredient["search_name"]:
                    continue
                ranked.append((2, ingredient["search_name"], ingredient["ingredient_id"], ingredient))
                if len(ranked) >= limit:
                    break
        return [
            {**ingredient, "display_name": _display_name(ingredient["canonical_name"])}
            for _, _, _, ingredient in ranked[:limit]
        ]


def load_accepted_ingredient_catalog(root: Path | None = None) -> IngredientCatalog:
    root = (root or Path(__file__).resolve().parents[3]).resolve()
    catalogue_root = root / "data_pipeline" / "identity" / "eu_common_ingredient_glossary"
    accepted_path = catalogue_root / "accepted" / "accepted_identity_hashes.json"
    if not accepted_path.exists():
        raise AcceptedIdentityCatalogueError("Accepted identity catalogue manifest is missing")
    accepted_hash = _sha256(accepted_path)
    accepted = _load(accepted_path)
    for relative_path, expected_hash in accepted.get("generated_output_hashes", {}).items():
        path = root / relative_path
        if not path.exists():
            raise AcceptedIdentityCatalogueError(f"Accepted identity file is missing: {relative_path}")
        if _sha256(path) != expected_hash:
            raise AcceptedIdentityCatalogueError(f"Accepted identity file hash mismatch: {relative_path}")

    source_pdf = root / accepted["source_pdf"]["path"]
    if not source_pdf.exists() or _sha256(source_pdf) != accepted["source_pdf"]["sha256"]:
        raise AcceptedIdentityCatalogueError("Accepted identity source PDF hash mismatch")

    raw_root = catalogue_root / "raw"
    source_manifest = _load(raw_root / "source_manifest.json")
    processed = _load(catalogue_root / "processed" / "ingredients.json")
    dataset_version = accepted["dataset_version"]
    if source_manifest.get("dataset_version") != dataset_version or processed.get("dataset_version") != dataset_version:
        raise AcceptedIdentityCatalogueError("Identity catalogue dataset version mismatch")
    ingredients = tuple(processed["ingredients"])
    raw_records = _load(raw_root / "ingredient_rows.json")["records"]
    if len(ingredients) != accepted["counts"]["searchable_identities"]:
        raise AcceptedIdentityCatalogueError("Accepted identity catalogue count mismatch")
    by_search_name = {ingredient["search_name"]: ingredient for ingredient in ingredients}
    if len(by_search_name) != len(ingredients):
        raise AcceptedIdentityCatalogueError("Accepted identity catalogue contains duplicate search keys")
    sorted_ingredients = tuple(
        sorted(ingredients, key=lambda ingredient: (ingredient["search_name"], ingredient["ingredient_id"]))
    )
    return IngredientCatalog(
        root=root,
        dataset_version=dataset_version,
        baseline_manifest_hash=accepted_hash,
        source_document=source_manifest["documents"][0],
        ingredient_count=len(ingredients),
        ingredients=ingredients,
        raw_by_id={record["raw_record_id"]: record for record in raw_records},
        by_search_name=by_search_name,
        sorted_search_names=tuple(item["search_name"] for item in sorted_ingredients),
        ingredients_by_search_name=sorted_ingredients,
    )

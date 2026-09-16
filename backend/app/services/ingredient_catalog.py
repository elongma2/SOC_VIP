from __future__ import annotations

import hashlib
import json
import re
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
    by_search_name: dict[str, dict[str, Any]]

    def find_exact_name(self, value: str) -> dict[str, Any] | None:
        return self.by_search_name.get(search_name(value))

    def search_prefix(self, query: str) -> tuple[dict[str, Any], ...]:
        key = search_name(query)
        return tuple(item for item in self.ingredients if item["search_name"].startswith(key))

    def search_contains(self, query: str) -> tuple[dict[str, Any], ...]:
        key = search_name(query)
        return tuple(item for item in self.ingredients if key in item["search_name"])

    def search(self, query: str, limit: int = 20) -> list[dict[str, Any]]:
        key = search_name(query)
        ranked: list[tuple[int, str, str, dict[str, Any]]] = []
        for ingredient in self.ingredients:
            candidate = ingredient["search_name"]
            if candidate == key:
                rank = 0
            elif candidate.startswith(key):
                rank = 1
            elif key in candidate:
                rank = 2
            else:
                continue
            ranked.append((rank, candidate, ingredient["ingredient_id"], ingredient))
        ranked.sort(key=lambda item: item[:3])
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
    if len(ingredients) != accepted["counts"]["searchable_identities"]:
        raise AcceptedIdentityCatalogueError("Accepted identity catalogue count mismatch")
    by_search_name = {ingredient["search_name"]: ingredient for ingredient in ingredients}
    if len(by_search_name) != len(ingredients):
        raise AcceptedIdentityCatalogueError("Accepted identity catalogue contains duplicate search keys")
    return IngredientCatalog(
        root=root,
        dataset_version=dataset_version,
        baseline_manifest_hash=accepted_hash,
        source_document=source_manifest["documents"][0],
        ingredient_count=len(ingredients),
        ingredients=ingredients,
        by_search_name=by_search_name,
    )

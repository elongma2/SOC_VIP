from __future__ import annotations

import hashlib
import json
from pathlib import Path

from data_pipeline.identity.eu_common_ingredient_glossary.scripts.pipeline import (
    EXPECTED_IDENTITY_COUNT,
    EXPECTED_RAW_COUNT,
    SOURCE_PDF,
    SOURCE_SHA256,
    normalize,
)


ROOT = Path(__file__).resolve().parents[4]
CATALOGUE_ROOT = ROOT / "data_pipeline" / "identity" / "eu_common_ingredient_glossary"


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def test_source_hash_and_accepted_manifest_are_separate() -> None:
    accepted = load(CATALOGUE_ROOT / "accepted" / "accepted_identity_hashes.json")
    assert hashlib.sha256(SOURCE_PDF.read_bytes()).hexdigest() == SOURCE_SHA256
    assert accepted["source_pdf"]["sha256"] == SOURCE_SHA256
    assert accepted["counts"]["raw_rows"] == EXPECTED_RAW_COUNT
    assert accepted["counts"]["searchable_identities"] == EXPECTED_IDENTITY_COUNT
    assert "data_pipeline/accepted_output_hashes.json" not in accepted["generated_output_hashes"]


def test_raw_rows_are_continuous_and_provenance_is_preserved() -> None:
    raw = load(CATALOGUE_ROOT / "raw" / "ingredient_rows.json")
    assert [record["entry_number"] for record in raw["records"]] == list(range(1, 30419))
    assert all(record["canonical_name"] and record["source_page"] and record["row_bbox"] for record in raw["records"])
    assert not any(record["source_page"] < 3 or record["source_page"] > 862 for record in raw["records"])


def test_processed_identity_counts_duplicates_and_qa_names() -> None:
    document = load(CATALOGUE_ROOT / "processed" / "ingredients.json")
    assert document["ingredient_count"] == EXPECTED_IDENTITY_COUNT
    by_name = {item["canonical_name"]: item for item in document["ingredients"]}
    for name in ("NIACINAMIDE", "GLYCERIN", "PANTHENOL", "TOCOPHEROL"):
        assert name in by_name
    assert by_name["NIACINAMIDE"]["source_entries"] == [17380]
    assert by_name["NIACINAMIDE"]["source_pages"] == [516]
    duplicates = [item for item in document["ingredients"] if len(item["source_entries"]) > 1]
    assert [(item["canonical_name"], item["source_entries"]) for item in duplicates] == [
        ("LACTOBACILLUS/PANAX GINSENG ROOT FERMENT FILTRATE", [14588, 14589]),
        ("SYZYGIUM LUEHMANNII FRUIT POWDER", [28194, 28195]),
    ]


def test_normalization_is_deterministic_and_preserves_canonical_names() -> None:
    raw = load(CATALOGUE_ROOT / "raw" / "ingredient_rows.json")
    first = normalize(raw)
    second = normalize(raw)
    assert first == second
    assert first == load(CATALOGUE_ROOT / "processed" / "ingredients.json")


def test_validation_report_passes() -> None:
    report = load(CATALOGUE_ROOT / "reports" / "validation_report.json")
    assert report["validation_status"] == "passed"
    assert report["errors"] == []

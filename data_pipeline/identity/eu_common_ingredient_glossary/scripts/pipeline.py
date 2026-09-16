from __future__ import annotations

import argparse
import hashlib
import json
import unicodedata
from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Any

import pdfplumber


ROOT = Path(__file__).resolve().parents[4]
PIPELINE_ROOT = ROOT / "data_pipeline" / "identity" / "eu_common_ingredient_glossary"
SOURCE_PDF = ROOT / "data_pipeline" / "Sources" / "OJ_L_202501175_EN_TXT.pdf"
RAW_ROOT = PIPELINE_ROOT / "raw"
PROCESSED_ROOT = PIPELINE_ROOT / "processed"
ACCEPTED_ROOT = PIPELINE_ROOT / "accepted"
REPORT_ROOT = PIPELINE_ROOT / "reports"

DATASET_VERSION = "eu-glossary-2025-1175"
SOURCE_DOCUMENT = "eu_common_ingredient_glossary_2025_1175"
SOURCE_ROLE = "ingredient_identity_reference"
SOURCE_SHA256 = "03f8a31f86326b6ab6c659685e6442bb63295860b2aaded00c3b12858f4d952a"
SOURCE_URL = "http://data.europa.eu/eli/dec_impl/2025/1175/oj"
SOURCE_TITLE = (
    "Commission Implementing Decision (EU) 2025/1175 — "
    "Glossary of common ingredient names for use in the labelling of cosmetic products"
)
PUBLICATION_DATE = "2025-07-10"
APPLICATION_DATE = "2026-07-30"
RETRIEVAL_DATE = "2026-09-16"
EXPECTED_PAGE_COUNT = 862
EXPECTED_RAW_COUNT = 30418
EXPECTED_IDENTITY_COUNT = 30416


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def search_name(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split())


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=False) + "\n",
        encoding="utf-8",
    )


def _source_metadata(page_count: int) -> dict[str, Any]:
    return {
        "source_document": SOURCE_DOCUMENT,
        "source_role": SOURCE_ROLE,
        "title": SOURCE_TITLE,
        "authority": "European Commission",
        "official_identifier": "Commission Implementing Decision (EU) 2025/1175",
        "eli": SOURCE_URL,
        "source_url": SOURCE_URL,
        "publication_date": PUBLICATION_DATE,
        "application_date": APPLICATION_DATE,
        "retrieval_date": RETRIEVAL_DATE,
        "filename": SOURCE_PDF.name,
        "sha256": SOURCE_SHA256,
        "page_count": page_count,
        "source_pages": {"decision": [1, 2], "glossary": [3, 862]},
    }


def _row_words(words: list[dict[str, Any]], top: float, next_top: float) -> list[dict[str, Any]]:
    return [
        word
        for word in words
        if float(word["x0"]) >= 120
        and float(word["top"]) >= top - 2
        and float(word["top"]) < next_top - 1
        and float(word["top"]) < 800
    ]


def _lines(words: list[dict[str, Any]]) -> list[str]:
    ordered = sorted(words, key=lambda word: (round(float(word["top"]), 1), float(word["x0"])))
    lines: list[tuple[float, list[str]]] = []
    for word in ordered:
        y = round(float(word["top"]), 1)
        if not lines or abs(lines[-1][0] - y) > 2:
            lines.append((y, [str(word["text"])]))
        else:
            lines[-1][1].append(str(word["text"]))
    return [" ".join(tokens).strip() for _, tokens in lines if tokens]


def extract() -> tuple[dict[str, Any], dict[str, Any]]:
    if not SOURCE_PDF.exists():
        raise FileNotFoundError(f"EU glossary PDF is missing: {SOURCE_PDF}")
    actual_hash = sha256(SOURCE_PDF)
    if actual_hash != SOURCE_SHA256:
        raise ValueError(f"EU glossary PDF hash mismatch: {actual_hash}")

    records: list[dict[str, Any]] = []
    page_diagnostics: list[dict[str, Any]] = []
    with pdfplumber.open(SOURCE_PDF) as pdf:
        if len(pdf.pages) != EXPECTED_PAGE_COUNT:
            raise ValueError(f"Expected {EXPECTED_PAGE_COUNT} PDF pages, found {len(pdf.pages)}")
        for source_page, page in enumerate(pdf.pages[2:], start=3):
            words = page.extract_words(x_tolerance=1, y_tolerance=2, keep_blank_chars=False)
            markers = sorted(
                [
                    (int(str(word["text"])), float(word["top"]), float(word["bottom"]))
                    for word in words
                    if str(word["text"]).strip().isdigit()
                    and float(word["x0"]) < 110
                    and 100 < float(word["top"]) < 800
                ],
                key=lambda item: item[1],
            )
            page_entries: list[int] = []
            for index, (entry_number, top, bottom) in enumerate(markers):
                next_top = markers[index + 1][1] if index + 1 < len(markers) else 800.0
                cell_words = _row_words(words, top, next_top)
                source_lines = _lines(cell_words)
                original_source_text = "\n".join(source_lines).strip()
                canonical_name = " ".join(original_source_text.split())
                if not canonical_name:
                    raise ValueError(f"Entry {entry_number} on page {source_page} has no ingredient name")
                row_bottom = max([bottom, *[float(word["bottom"]) for word in cell_words]])
                row_bbox = [
                    round(max(0.0, 67.0), 3),
                    round(max(0.0, top - 4.0), 3),
                    round(min(float(page.width), 528.0), 3),
                    round(min(float(page.height), row_bottom + 4.0), 3),
                ]
                records.append(
                    {
                        "raw_record_id": f"raw-eu-2025-1175-entry-{entry_number:05d}",
                        "source_document": SOURCE_DOCUMENT,
                        "source_role": SOURCE_ROLE,
                        "entry_number": entry_number,
                        "canonical_name": canonical_name,
                        "source_lines": source_lines,
                        "original_source_text": original_source_text,
                        "source_page": source_page,
                        "row_bbox": row_bbox,
                    }
                )
                page_entries.append(entry_number)
            page_diagnostics.append(
                {
                    "source_page": source_page,
                    "record_count": len(page_entries),
                    "first_entry": page_entries[0] if page_entries else None,
                    "last_entry": page_entries[-1] if page_entries else None,
                }
            )

    metadata = _source_metadata(EXPECTED_PAGE_COUNT)
    source_manifest = {"dataset_version": DATASET_VERSION, "documents": [metadata]}
    raw_document = {
        "dataset_version": DATASET_VERSION,
        **metadata,
        "section": "Glossary of common ingredient names",
        "column_names": ["Entry", "Common Ingredient name"],
        "records": records,
        "page_diagnostics": page_diagnostics,
    }
    return source_manifest, raw_document


def normalize(raw_document: dict[str, Any]) -> dict[str, Any]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in raw_document["records"]:
        grouped[search_name(record["canonical_name"])].append(record)

    ingredients: list[dict[str, Any]] = []
    for key, records in sorted(grouped.items(), key=lambda item: (item[0], item[1][0]["entry_number"])):
        records = sorted(records, key=lambda record: record["entry_number"])
        canonical_names = {record["canonical_name"] for record in records}
        if len(canonical_names) != 1:
            raise ValueError(f"Search key {key!r} collapses different canonical names: {canonical_names}")
        primary = records[0]
        ingredients.append(
            {
                "ingredient_id": f"eu-2025-1175-entry-{primary['entry_number']:05d}",
                "canonical_name": primary["canonical_name"],
                "search_name": key,
                "source_role": SOURCE_ROLE,
                "source_document": SOURCE_DOCUMENT,
                "source_version": "Commission Implementing Decision (EU) 2025/1175",
                "source_url": SOURCE_URL,
                "source_sha256": SOURCE_SHA256,
                "source_entries": [record["entry_number"] for record in records],
                "source_pages": sorted({record["source_page"] for record in records}),
                "raw_record_ids": [record["raw_record_id"] for record in records],
                "original_source_texts": [record["original_source_text"] for record in records],
            }
        )
    return {
        "dataset_version": DATASET_VERSION,
        "source_document": SOURCE_DOCUMENT,
        "source_role": SOURCE_ROLE,
        "source_version": "Commission Implementing Decision (EU) 2025/1175",
        "source_url": SOURCE_URL,
        "source_sha256": SOURCE_SHA256,
        "ingredient_count": len(ingredients),
        "ingredients": ingredients,
    }


def validate(source_manifest: dict[str, Any], raw: dict[str, Any], processed: dict[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []
    records = raw["records"]
    ingredients = processed["ingredients"]
    entries = [record["entry_number"] for record in records]
    ingredient_ids = [ingredient["ingredient_id"] for ingredient in ingredients]
    search_keys = [ingredient["search_name"] for ingredient in ingredients]

    if len(records) != EXPECTED_RAW_COUNT:
        errors.append(f"Expected {EXPECTED_RAW_COUNT} raw rows, found {len(records)}")
    if entries != list(range(1, EXPECTED_RAW_COUNT + 1)):
        errors.append("Entry numbers are not continuous from 1 through 30418")
    if len(ingredients) != EXPECTED_IDENTITY_COUNT:
        errors.append(f"Expected {EXPECTED_IDENTITY_COUNT} identities, found {len(ingredients)}")
    if len(ingredient_ids) != len(set(ingredient_ids)):
        errors.append("Ingredient IDs are not unique")
    if len(search_keys) != len(set(search_keys)):
        errors.append("Processed search keys are not unique")
    if any(not ingredient["canonical_name"].strip() for ingredient in ingredients):
        errors.append("One or more canonical names are blank")
    if any(not ingredient["raw_record_ids"] or not ingredient["source_pages"] for ingredient in ingredients):
        errors.append("One or more identities lack source provenance")
    if source_manifest["documents"][0]["sha256"] != sha256(SOURCE_PDF):
        errors.append("Source manifest hash does not match the PDF")

    duplicate_groups = [
        {
            "canonical_name": ingredient["canonical_name"],
            "source_entries": ingredient["source_entries"],
            "source_pages": ingredient["source_pages"],
        }
        for ingredient in ingredients
        if len(ingredient["source_entries"]) > 1
    ]
    if len(duplicate_groups) != 2:
        errors.append(f"Expected 2 explicit duplicate-name groups, found {len(duplicate_groups)}")

    by_name = {ingredient["canonical_name"]: ingredient for ingredient in ingredients}
    qa_names = ["NIACINAMIDE", "GLYCERIN", "PANTHENOL", "TOCOPHEROL", "AMINOPHYLLINE", "DIETHYLENE GLYCOL"]
    qa_results = [
        {
            "canonical_name": name,
            "present": name in by_name,
            "source_entries": by_name.get(name, {}).get("source_entries", []),
            "source_pages": by_name.get(name, {}).get("source_pages", []),
        }
        for name in qa_names
    ]
    if not all(item["present"] for item in qa_results):
        errors.append("One or more required QA names are absent")

    return {
        "dataset_version": DATASET_VERSION,
        "validation_status": "passed" if not errors else "failed",
        "source_sha256": SOURCE_SHA256,
        "counts": {
            "pdf_pages": EXPECTED_PAGE_COUNT,
            "raw_rows": len(records),
            "searchable_identities": len(ingredients),
            "duplicate_search_key_groups": len(duplicate_groups),
        },
        "errors": errors,
        "warnings": warnings,
        "duplicate_groups": duplicate_groups,
        "qa_results": qa_results,
    }


def build(*, accept: bool = False) -> dict[str, Path]:
    source_manifest, raw = extract()
    processed = normalize(raw)
    report = validate(source_manifest, raw, processed)
    if report["errors"]:
        raise ValueError("Identity catalogue validation failed: " + "; ".join(report["errors"]))

    paths = {
        "source_manifest": RAW_ROOT / "source_manifest.json",
        "raw": RAW_ROOT / "ingredient_rows.json",
        "processed": PROCESSED_ROOT / "ingredients.json",
        "report": REPORT_ROOT / "validation_report.json",
        "summary": REPORT_ROOT / "validation_summary.md",
    }
    write_json(paths["source_manifest"], source_manifest)
    write_json(paths["raw"], raw)
    write_json(paths["processed"], processed)
    write_json(paths["report"], report)
    paths["summary"].parent.mkdir(parents=True, exist_ok=True)
    paths["summary"].write_text(
        "# EU Ingredient Catalogue Validation\n\n"
        f"- Status: **{report['validation_status'].upper()}**\n"
        f"- PDF pages: {report['counts']['pdf_pages']:,}\n"
        f"- Raw glossary rows: {report['counts']['raw_rows']:,}\n"
        f"- Searchable identities: {report['counts']['searchable_identities']:,}\n"
        f"- Explicit duplicate-name groups: {report['counts']['duplicate_search_key_groups']}\n",
        encoding="utf-8",
    )

    if accept:
        accepted = {
            "dataset_version": DATASET_VERSION,
            "accepted_on": date.today().isoformat(),
            "source_role": SOURCE_ROLE,
            "source_pdf": {
                "path": str(SOURCE_PDF.relative_to(ROOT)).replace("\\", "/"),
                "sha256": SOURCE_SHA256,
            },
            "counts": report["counts"],
            "generated_output_hashes": {
                str(path.relative_to(ROOT)).replace("\\", "/"): sha256(path)
                for path in (paths["source_manifest"], paths["raw"], paths["processed"])
            },
        }
        accepted_path = ACCEPTED_ROOT / "accepted_identity_hashes.json"
        write_json(accepted_path, accepted)
        paths["accepted"] = accepted_path
    return paths


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the accepted EU ingredient identity catalogue")
    parser.add_argument("--accept", action="store_true", help="Write the separate accepted identity manifest")
    args = parser.parse_args()
    for name, path in build(accept=args.accept).items():
        print(f"{name}: {path}")


if __name__ == "__main__":
    main()

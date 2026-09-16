from __future__ import annotations

import json

from .pipeline import (
    PROCESSED_ROOT,
    RAW_ROOT,
    validate,
    write_json,
    REPORT_ROOT,
)


def main() -> None:
    source_manifest = json.loads((RAW_ROOT / "source_manifest.json").read_text(encoding="utf-8"))
    raw = json.loads((RAW_ROOT / "ingredient_rows.json").read_text(encoding="utf-8"))
    processed = json.loads((PROCESSED_ROOT / "ingredients.json").read_text(encoding="utf-8"))
    report = validate(source_manifest, raw, processed)
    write_json(REPORT_ROOT / "validation_report.json", report)
    print(report["validation_status"])
    if report["errors"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()

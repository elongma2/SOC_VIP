from __future__ import annotations

from .cross_reference import build_cross_references
from .extract import extract_all
from .normalize import normalize_all
from .validate_rules import validate


def main() -> int:
    extract_all()
    normalize_all()
    build_cross_references()
    report = validate()
    print(f"validation_status={report['validation_status']}")
    print(f"normalized_rules={report['counts']['normalized_rules']}")
    print(f"cross_references={report['counts']['cross_references']}")
    return 0 if report["validation_status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())

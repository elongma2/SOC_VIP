# Regulatory data pipeline handoff

Updated: 2026-09-15

## What has been completed

The first functional offline regulatory-data pipeline has been built for the Singapore cosmetic formulation-screening MVP.

It covers only the agreed regulatory material:

- ACD Appendix I;
- ACD Annex II Part 1;
- ACD Annex III Part 1;
- Singapore Regulation 6(1), 6(2), and 6(7);
- Singapore Third Schedule Part I; and
- Singapore Third Schedule Part II.

The pipeline follows this sequence:

```text
official PDFs
    -> raw extraction
    -> conservative normalization
    -> version-aware cross-reference
    -> structural validation
    -> professional-review queue
```

The original supplied PDFs remain unchanged. The current full Singapore regulations were also obtained from Singapore Statutes Online and preserved as a separate source PDF. Every source has a URL, retrieval date, effective/revision information, PDF metadata, and SHA-256 hash in [`source_manifest.json`](../data_pipeline/raw/source_manifest.json).

## Source versions and legal structure

The source relationship is recorded as follows:

- Regulation 6(1) applies Singapore Third Schedule Part I, which corresponds structurally to ACD Annex II Part 1.
- Regulation 6(2) applies Singapore Third Schedule Part II, which corresponds structurally to ACD Annex III Part 1.
- Regulation 6(7) records the relevant statutory consequence for failure to comply with the applicable paragraphs.

The two regulatory datasets are treated as separate snapshots:

- ACD Annexes: Version 2026-1, dated 22 June 2026.
- Singapore regulations: informal consolidation in force from 1 December 2025.

Structural correspondence does not mean the entries are currently identical. The pipeline never selects one source as controlling, merges differences, or assumes entry-by-entry parity.

## Extraction approach

The tables are extracted with `pdfplumber`; `pypdf` is used for document metadata and Regulation 6 text. OCR is not used.

The ACD tables use explicit PDF column boundaries. Singapore tables use their embedded table lines with a narrow text tolerance. The raw JSON preserves:

- source page text;
- original cells and row wording;
- reference numbers and identifiers;
- table and row bounding boxes;
- cross-page continuation fragments;
- fields of use;
- concentrations;
- conditions and warnings;
- footnotes and supporting definitions;
- jurisdiction-specific wording; and
- extraction flags.

Normalization splits lettered cases only when the product context, concentration, conditions, and warnings map unambiguously. Complex or nested cases remain intact and are marked `manual_review_required`.

## Current dataset

The generated dataset contains:

| Dataset measure | Count |
| --- | ---: |
| Raw table records | 3,908 |
| Total rule records | 3,983 |
| Active source-specific substance records | 3,877 |
| Rules normalized for deterministic use | 2,776 |
| Rules requiring manual review | 1,176 |
| Inactive blank, ranged, moved, or deleted records | 31 |
| Source cross-references | 1,978 |

Cross-reference results are:

| Status | Count | Meaning |
| --- | ---: | --- |
| `aligned` | 872 | Same reference and no material difference after conservative field comparison. |
| `changed` | 1,057 | Same reference, but one or more comparable source fields, including parsed concentration semantics, differ. |
| `acd_only` | 40 | No current Singapore reference-number match. |
| `singapore_only` | 0 | No Singapore-only reference was found in this extraction. |
| `ambiguous` | 9 | A range or incompatible case structure prevents a unique comparison. |

The database-ready files are:

- [`product_context.json`](../data_pipeline/processed/product_context.json)
- [`substances.json`](../data_pipeline/processed/substances.json)
- [`rules.json`](../data_pipeline/processed/rules.json)
- [`singapore_provisions.json`](../data_pipeline/processed/singapore_provisions.json)
- [`source_cross_references.json`](../data_pipeline/processed/source_cross_references.json)

## What to look out for

### 1. Version differences need professional review

There are 1,057 `changed` and 40 `acd_only` cross-references. A `changed` result only establishes that source-backed fields differ; it does not determine whether the difference is legally significant. Differences can include substance wording, product use, parsed concentration value/unit/comparator/basis/preparation stage, conditions, or warnings.

Do not automatically copy ACD 2026-1 wording into the Singapore rules or treat an ACD-only entry as currently enacted in Singapore.

### 2. Use the completed 20-record spot check as the source-fidelity baseline

The representative records in [`manual_spot_check_checklist.json`](../data_pipeline/reports/manual_spot_check_checklist.json) were rechecked directly against rendered PDF pages on 15 September 2026. All 20 passed. The results are tied to the accepted generated-output baseline in [`manual_spot_check_results.json`](../data_pipeline/reports/manual_spot_check_results.json); changing the baseline invalidates validation until the results are repeated or deliberately reaccepted.

The checklist covers:

- Appendix I hierarchy;
- Regulation 6(1), 6(2), and 6(7);
- long and cross-page Annex II entries;
- Annex III headerless pages;
- warnings continued onto another page;
- nested and clearly mapped lettered cases;
- limits found outside the concentration column;
- Singapore-specific wording; and
- entries from both ACD and Singapore schedules.

Rendered technical checks are recorded in [`rendered_page_check_notes.md`](../data_pipeline/reports/rendered_page_check_notes.md). This is a technical source-fidelity check; professional interpretation of flagged regulatory conditions remains outstanding.

### 3. Review conservative normalization decisions

The complete review queue is [`manual_review_queue.json`](../data_pipeline/reports/manual_review_queue.json). It currently contains 2,313 items:

- 1,207 manual-review or inactive source-rule items; and
- 1,106 non-aligned cross-reference items.

The larger queue is an intentional correction. Conditional Annex II and Singapore Part I prohibitions are now flagged instead of being exposed as unconditional executable rules. Compact or ambiguous `(a)/(b)/(c)` structures, secondary numerical limits, multiple percentages, mixture thresholds, ingredient impurity limits, post-mixing limits, jurisdiction-specific wording, and ranged references are also retained for review.

### 4. Six source CAS values are malformed

The following values are preserved exactly as found and are not silently corrected:

- Annex II reference 255: `144202-89-2`
- Annex II reference 1226: `6566-48-1`
- Annex II reference 1319: `18266-25-9`
- Annex II reference 1443: `4874-78-3`
- Annex II reference 1711: `607-285-6`
- Annex III reference 305: `4403-90-`

All six were checked against the rendered official PDF and are printed that way in the source. They remain in `malformed_identifiers` and the validation warnings; no corrected value is invented.

### 5. Singapore entries generally do not provide CAS numbers

The Singapore Third Schedule primarily identifies substances by reference number and substance wording. Do not infer missing Singapore identifiers from the ACD source without retaining the cross-source nature of that association.

### 6. Extraction text may retain PDF encoding artifacts

Some Singapore source text contains replacement characters where the PDF encoding does not expose the original punctuation cleanly. The raw wording is retained, and comparison normalization removes only limited Unicode and whitespace noise. Any material wording affected by an encoding artifact should be checked visually.

### 7. The runtime screening engine has not been built

This milestone produces regulatory data only. It does not yet provide database loading, ingredient resolution, product-context rule selection, concentration evaluation, an API, or a frontend. No product-level approval or compliance conclusion should be produced from the data alone.

## Validation completed

The latest [`validation_report.json`](../data_pipeline/reports/validation_report.json) passes with zero structural errors. It checks source hashes, the accepted generated-output baseline, duplicate IDs, required provenance, table structure, continuation fragments, reference coverage, recovered and malformed CAS identifiers, concentrations, raw links, source-text retention, permitted scope, footnote counts, cross-reference direction/statuses, and the completed spot-check set.

Thirteen regression tests pass. Two consecutive full pipeline runs produce identical raw and processed JSON hashes and match [`accepted_output_hashes.json`](../data_pipeline/accepted_output_hashes.json).

Run the complete pipeline and tests from the repository root:

```powershell
uv run python -m data_pipeline.scripts.run_pipeline
uv run pytest data_pipeline/tests -q
```

## Recommended next task

1. Triage the highest-priority ambiguous, conditional, and ACD-only records with a regulatory professional.
2. Freeze the accepted dataset baseline for the MVP.
3. Build the database loader and deterministic runtime screening logic against that baseline.
4. Keep manual-review records available for evidence, but do not execute their ambiguous numerical semantics automatically.

The current project state and counts are also recorded in [`STATUS.md`](../STATUS.md).

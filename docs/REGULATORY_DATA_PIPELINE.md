# Regulatory data pipeline

## Source structure discovered

- **ACD Appendix I:** a two-page document. Page 1 contains the cosmetic-product definition and interpretive background. Page 2 contains an explicitly non-exhaustive list of 20 product categories; the hair-care category has six nested examples. The document does not supply a complete leave-on/rinse-off, population, or exposure taxonomy, so those concepts are not inferred.
- **ACD Annex II Part 1:** three columns in source order: substance wording, CAS number, and reference number. The table occupies PDF pages 2–97 of the combined annex PDF. Supporting definitions for reference 419 continue on pages 98–101. Entries may span row fragments and pages; reference 1539 spans pages 74–82.
- **ACD Annex III Part 1:** six columns: reference number, substance wording, field of application/use, maximum authorised concentration, other limitations/requirements, and warning text. The title is on page 102, the table runs on pages 103–257, and footnotes continue through page 258. Some pages have no repeated header, warnings and rows continue across pages, numerical limits can appear in the requirements column, and lettered cases can contain nested lists. Ranged and blank entries are preserved as inactive source records.
- **Singapore Regulation 6:** the supplied six-page extract places Regulation 6 on its PDF pages 2–4. Paragraph (1) applies Third Schedule Part I subject to its trace amount, technical unavoidability, and applicable-condition wording. Paragraph (2) applies the Part II product type, maximum limit, and other requirements columns. Paragraph (7) supplies the relevant statutory consequence. The recurring SSO page header is removed from clause records while unchanged page text remains in the raw file.
- **Singapore Third Schedule:** the acquired full SSO snapshot is the informal consolidation in force from 1 December 2025. Part I is a two-column reference/substance table on pages 13–95, with supporting definitions and notes through page 97. Part II starts on page 97 and uses six columns corresponding to reference, substance, product type, maximum concentration, other requirements, and warnings; its table and footnotes end on page 168. Parts III–V are not extracted.

The established structural relationship is recorded as metadata: Regulation 6(1) maps to Third Schedule Part I and ACD Annex II Part 1; Regulation 6(2) maps to Third Schedule Part II and ACD Annex III Part 1. It does not establish entry-by-entry parity between the ACD 2026-1 release dated 22 June 2026 and the Singapore version in force from 1 December 2025.

## Extraction strategy

`pdfplumber` extracts table cells and geometric provenance without OCR. The ACD tables use explicit vertical column boundaries because those boundaries consistently recover the three- and six-column layouts, including pages without headers. Singapore tables use their embedded ruling lines and a narrow text tolerance to avoid collapsing spaces. Repeated headers are removed by their content. Row fragments without a new reference are linked to the preceding record and retain page, table/row bounding boxes, original cells, and continuation flags. `pypdf` reads document metadata and Regulation 6 text.

Normalization only splits lettered cases when the product context and limit have the same consecutive case labels and every other labelled field agrees. Compact markers such as `(a)Hair` are recognized, but complex or nested mappings remain intact with `manual_review_required` and no actionable concentration. A numerical percentage is parsed only when one unambiguous percentage is present; its original text is always retained. Secondary thresholds such as nitrosamine limits are retained and flagged when they are not yet structured. CAS values are recovered across spaces and line breaks, canonicalized only when structurally valid, and checksum-validated. Malformed source values remain unchanged in `malformed_identifiers`. Conditional Annex II/Part I wording is preserved and flagged rather than treated as an unconditional executable prohibition. Blank, deleted, ranged, and superseded table rows remain inactive records.

## Outputs

- `raw/source_manifest.json` records source URLs, versions/effective dates, retrieval dates, PDF metadata, page counts, and SHA-256 hashes.
- `raw/*_raw.json` preserves page text, source rows, cells, bounding boxes, continuation links, identifiers, conditions, warnings, footnotes, and source wording.
- `processed/product_context.json`, `substances.json`, `rules.json`, and `singapore_provisions.json` are database-ready source-specific records.
- `processed/source_cross_references.json` compares the two versioned source sets by exact reference number first and retains both values for every differing field.
- `reports/validation_report.json` and `validation_summary.md` separate structural failures from professional-review items.
- `reports/manual_review_queue.json` is the complete unresolved queue. `manual_spot_check_checklist.json` defines 20 representative source checks, and `manual_spot_check_results.json` records the completed visual verification against the accepted output baseline.

Cross-reference statuses are bounded to `aligned`, `changed`, `acd_only`, `singapore_only`, and `ambiguous`. Comparison includes original source fields and parsed concentration value, unit, comparator, basis, and preparation stage. Name similarity under a different reference can only create a candidate; it cannot establish correspondence. The pipeline does not choose which differing source controls and does not merge conflicting wording.

## Reproduction

Run:

```powershell
uv run python -m data_pipeline.scripts.run_pipeline
uv run pytest data_pipeline/tests
```

The validator checks locked source hashes, an accepted generated-output hash baseline, duplicate IDs, provenance, expected table counts and regression references, recovered and malformed CAS identifiers, concentrations, raw links, source-text retention, permitted scope, cross-reference direction/statuses, completed spot checks tied to the baseline, and obsolete terminology. Review items do not fail structural validation.

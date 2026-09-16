# Regulatory data rectification summary

Updated: 2026-09-15

## Outcome

The focused regulatory-data audit and rectification are complete. Structural validation passes, two consecutive full builds produce identical generated hashes, the generated hashes match the accepted baseline, all 13 regression tests pass, and all 20 representative records pass rendered-page source checks.

No unresolved technical extraction defect was found in the scoped records. Regulatory ambiguity remains explicit in the review queue and must not be converted into automatic screening decisions without professional review.

## What changed and why

1. **CAS recovery:** CAS-like text is collected from the original cells even when spaces or line breaks surround the hyphens. Valid identifiers are canonicalized only after structure and checksum validation. This recovered 98 identifiers across 70 source records that were previously omitted. The raw cell text remains unchanged.
2. **Malformed identifiers:** Structurally incomplete and checksum-invalid source identifiers are retained in `malformed_identifiers` and reported. The six current values were visually confirmed in the official PDF, so the pipeline does not invent corrections.
3. **Annex III references 8c and 334:** Compact markers such as `(a)Hair` are now detected. Because the fields do not map unambiguously, each parent remains unsplit, its concentration is `null`, and it is marked `manual_review_required`. Regression tests prevent either record from becoming automatically actionable.
4. **Conditional prohibitions:** Active Annex II and Singapore Part I entries containing exceptions, thresholds, trace allowances, or other conditional wording are marked `manual_review_required`. A separate reason is used when a source says its CAS scope is non-exhaustive. This prevents a conditional source row from being executed as an unconditional prohibition.
5. **Secondary numerical conditions:** Numerical requirements outside the main concentration field, including `μg/kg` impurity limits, are retained and flagged when the pipeline does not yet model them safely.
6. **Cross-reference comparison:** ACD and Singapore rules continue to be compared by exact reference first. Field comparison now includes parsed concentration value, unit, comparator, basis, and preparation stage. This corrected reference A10 from `aligned` to `changed` because its preparation-stage semantics differ.
7. **Validation baseline:** Validation now compares every generated raw and processed JSON hash against `accepted_output_hashes.json`. It also verifies that all valid and malformed CAS candidates survive normalization and that the completed spot-check results refer to the exact accepted baseline.
8. **Documentation and review queue:** Conflicting counts were corrected, the review queue was regenerated, and the completed 20-record check was recorded in machine-readable form.

## Final authoritative counts

| Measure | Count |
| --- | ---: |
| Raw table records | 3,908 |
| Total rule records | 3,983 |
| Rules normalized for deterministic use | 2,776 |
| Rules requiring manual review | 1,176 |
| Inactive source records | 31 |
| Active source-specific substance records | 3,877 |
| Cross-references | 1,978 |
| Cross-reference `aligned` | 872 |
| Cross-reference `changed` | 1,057 |
| Cross-reference `acd_only` | 40 |
| Cross-reference `singapore_only` | 0 |
| Cross-reference `ambiguous` | 9 |
| Complete review queue | 2,313 |
| Completed source spot checks | 20 of 20 passed |

The review queue contains 1,207 manual-review or inactive source-rule items and 1,106 non-aligned cross-reference items. Its size is intentionally conservative: it includes 957 conditional-prohibition records, 131 ambiguous multi-case records, 46 records with an unstructured secondary numerical condition, and other overlapping reasons.

## Remaining review work

The following are regulatory or modelling questions, rather than confirmed parser failures:

- conditional Annex II and Singapore Part I rows need professional interpretation before they can become executable rule logic;
- 127 ambiguous multi-case records contain numerical text that is deliberately not normalized into an actionable concentration;
- 46 records contain secondary numeric conditions that are preserved but not yet represented as separate executable constraints;
- 1,057 changed, 40 ACD-only, and 9 ambiguous source cross-references require version-aware professional review;
- the six malformed source CAS values remain source warnings; and
- jurisdiction-specific wording and ranged, blank, deleted, or moved entries remain visible and non-actionable.

`pypdf` emits two non-fatal malformed-object notices while reading the supplied PDFs. The affected extraction remains deterministic, and the representative rendered-page checks found no content loss. This is a library/source-PDF warning, not a current dataset validation failure.

## How to process a regulatory update

1. Preserve the new official file as an immutable source and update its URL, revision/effective date, retrieval date, snapshot date, and expected source hash in the source configuration.
2. Run `uv run python -m data_pipeline.scripts.run_pipeline`. A source or generated-output hash mismatch should fail validation at this point.
3. Inspect the raw diff first. Confirm pages, cells, continuations, identifiers, footnotes, and wording before reviewing normalized changes.
4. Review normalized rule and cross-reference diffs. Resolve only mappings that are unambiguous; leave uncertain conditions in the review queue.
5. Repeat the representative rendered-page checks for changed patterns and record results against the candidate baseline.
6. Run `uv run pytest -q`, then run the full pipeline twice and confirm `matched_previous_run`.
7. After professional acceptance, deliberately update `accepted_output_hashes.json`, update the spot-check result baseline hash, rerun validation, and record the new authoritative counts in `STATUS.md`.

The accepted baseline is a deliberate gate. It should never be updated merely to make a failed build pass.

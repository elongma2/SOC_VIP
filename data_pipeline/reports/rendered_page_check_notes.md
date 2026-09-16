# Rendered-page extraction checks

These visual checks verify difficult PDF layouts. On 15 September 2026, the full 20-record checklist was repeated against rendered source pages; all 20 checks passed and are recorded in `manual_spot_check_results.json` against the accepted output-baseline hash.

- **ACD Annex II pages 14–15:** reference 391 continues at the top of page 15 with a blank reference cell. The raw record links pages 14 and 15, and reference 392 starts a new record.
- **ACD Annex III page 113:** reference 12 appears on a page without repeated A–F labels and contains nested `(a)`–`(e)` and `(i)`–`(iii)` structures across several columns. The extractor recovers six columns and normalization keeps the parent record intact for review.
- **ACD Annex III pages 181–182:** reference 250 begins on page 181 and its warning continues on page 182. Both pages are linked to the same raw record; the mismatched case layout remains unsplit for review.
- **ACD Annex III page 252:** references 339 and 342 use mapped cases, while `A1-A3` is explicitly described as intentionally blank. Reference 342 is split into three child rules and `A1-A3` remains inactive.
- **Singapore Third Schedule page 97:** Part II begins below Part I definitions and footnotes on the same page. Part II table extraction starts at the six-column table only; the upper text is preserved with Part I supporting material.
- **Singapore Third Schedule pages 165–166:** reference 339 and its restrictions continue across the page boundary. The raw record links both pages and retains the continuation fragment.
- **ACD Annex II pages 74–82:** reference 1539 retains its qualifying benzene condition and all 177 CAS values across nine pages.
- **ACD Annex II pages 98–101:** the supporting animal-category definitions for reference 419 are retained as four linked evidence blocks.
- **ACD Annex III page 108:** line-wrapped CAS `16245-77-5` is recovered without altering the raw source cell.
- **ACD Annex III page 109:** reference 8c uses compact `(a)Hair` markers and a secondary `50 μg/kg` limit; it remains unsplit and non-actionable pending review.
- **ACD Annex III page 250:** reference 334 uses compact case markers but only one concentration-cell value; it remains unsplit and non-actionable pending review.
- **ACD Annex II page 96:** reference 1711 visibly contains `607-285-6`; the source value is preserved and reported as malformed.

No column-boundary or continuation defect was found in these rendered checks.

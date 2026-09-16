# Frontend manual testing set

Verified against accepted baseline `8dc52418c1360074a52221966cd3e74e1dcd108233d8ad8045797a6c34e25017` on 15 September 2026.

Enter each scenario as a separate formulation because product context applies to the whole formulation. A disabled concentration control must submit `concentration: null`. Where concentration is enabled below, use `basis: No basis` and `stage: finished product`.

## Scenario 1 — main finding coverage

- Formulation ID: `TEST-COVERAGE-001`
- Formulation name: `Main finding coverage`
- Product context: `No product context supplied`

| Row | Ingredient name | CAS | Concentration | Expected primary finding | Expected Singapore rule |
| ---: | --- | --- | --- | --- | --- |
| 1 | `Aminophylline` | `317-34-0` | Disabled | Prohibited-list substance identified | Third Schedule Part I · Ref A1136 · Regulation 6(1) |
| 2 | `Tosylchloramide sodium` | — | `0.20%` | Within limit | Third Schedule Part II · Ref 5 · Regulation 6(2) |
| 3 | `Tosylchloramide sodium` | — | `0.21%` | Limit exceeded | Third Schedule Part II · Ref 5 · Regulation 6(2) |
| 4 | `Mystery Extract` | — | Disabled | Identity unresolved | — |
| 5 | `Diethylene glycol (except if it is present as an unavoidable trace amount up to a limit of 0.1% in the finished cosmetic product)` | — | `0.05%` | Professional review required | — in table; withheld Singapore A1140 evidence remains in drawer |
| 6 | `BHT` | `128-37-0` | `0.10%` | Professional review required | —; ACD-only identity is shown in the drawer |
| 7 | `Aminophylline` | `128-37-0` | Disabled | Professional review required | —; supplied name and CAS resolve to different identities |

Expected summary:

| Summary value | Count |
| --- | ---: |
| Ingredients submitted | 7 |
| Prohibited | 1 |
| Limit exceeded | 1 |
| Within limit | 1 |
| Professional review required primary finding | 3 |
| Identity unresolved | 1 |
| Review required | 4 |
| Attention count | 6 |

`Review required` is four because it counts rows whose `review_required` flag is true. The display attention count is six because it also includes the confirmed prohibited and exceeded rows, counting every row once.

Evidence checks:

- Aminophylline must show submitted concentration `—` and Singapore A1136 evidence.
- Tosylchloramide must show `Submitted CAS —` and separately show `Source-backed identifier — CAS 127-65-1 · ACD Annex III`.
- The 0.21% Tosylchloramide row must show a `+0.01 percentage points` difference.
- Mystery Extract, BHT, and the mismatched Aminophylline/CAS row must not show an ACD record as a Singapore rule.
- The A1140 conditional wording must remain review-only and visible as original source evidence.

## Scenario 2 — required product context missing

- Formulation ID: `TEST-CONTEXT-001`
- Product context: `No product context supplied`
- Ingredient: `Chlorates of alkali metals`
- Concentration: `4%`, no basis, finished product

Expected result: `Information missing`. The engine found a Part II rule whose applicability depends on product context.

## Scenario 3 — exact product context supplied

Use the same ingredient and concentration as Scenario 2, but select the exact context `Toothpaste`.

Expected result: `Within limit`, using Singapore Third Schedule Part II ref 6 and Regulation 6(2).

## Scenario 4 — input validation

Test these separately. They should produce input errors rather than regulatory findings:

| Input | Expected behavior |
| --- | --- |
| Blank ingredient name | Ingredient field error; no screening request |
| CAS `123-45-6` | HTTP 422 checksum/syntax validation message |
| Concentration enabled with an empty value | Concentration field error; no screening request |
| `-0.1%` | HTTP 422 non-negative-value error |
| `100.1%` | HTTP 422 percentage ceiling error |

## API proxy check

With both development servers running, the browser should request `/api/screening-options` and `/api/screen-formulation`. Vite must rewrite those requests to `/screening-options` and `/screen-formulation` on `127.0.0.1:8000`. Both successful screening and regulatory uncertainty return HTTP 200; only malformed input returns 422.

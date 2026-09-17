# Twenty-row screening demonstration set

Verified against accepted baseline `8dc52418c1360074a52221966cd3e74e1dcd108233d8ad8045797a6c34e25017` on 16 September 2026.

The ready-to-submit request bodies are in [`demo_screening_requests.json`](demo_screening_requests.json). Submit each scenario separately because product context applies to the whole formulation.

## Coverage

| Scenario | Rows | Outcomes exercised |
| --- | ---: | --- |
| DEMO-01 | 13 | Prohibited, within limit, exceeded, missing information, professional review, unresolved identity |
| DEMO-02 | 3 | Context-specific within limit, exceeded, and missing concentration |
| DEMO-03 | 2 | Resolved identity with no applicable rule in the selected context |
| DEMO-04 | 2 | Alternative context-specific limit, within and exceeded |
| **Total** | **20** | All seven bounded runtime findings |

## DEMO-01 — mixed finding coverage

Leave Product context empty.

| Row | Ingredient | Submitted data | Expected primary finding | Why |
| ---: | --- | --- | --- | --- |
| 1 | Aminophylline | No concentration | Prohibited-list substance identified | Active Singapore Part I ref A1136 |
| 2 | Benzene | No concentration | Prohibited-list substance identified | Active Singapore Part I ref 47 |
| 3 | Dioxane | No concentration | Prohibited-list substance identified | Active Singapore Part I ref 343 |
| 4 | Tosylchloramide sodium | 0.10%, no basis, finished product | Within limit | At or below the 0.20% Part II limit |
| 5 | Tosylchloramide sodium | 0.21%, no basis, finished product | Limit exceeded | Above the 0.20% Part II limit |
| 6 | Tosylchloramide sodium | No concentration | Information missing | Applicable rule requires concentration semantics |
| 7 | Tosylchloramide sodium | 0.10%, no basis, ready for use | Professional review required | Submitted stage is incompatible; no conversion is performed |
| 8 | Complete Diethylene glycol conditional wording | 0.05%, no basis, finished product | Professional review required | Conditional Part I prohibition is deliberately non-executable |
| 9 | BHT, CAS 128-37-0 | 0.10%, no basis, finished product | Professional review required | Exact ACD-only identity has no current Singapore correspondence |
| 10 | Aminophylline, CAS 128-37-0 | No concentration | Professional review required | Name and CAS resolve to different source-backed identities |
| 11 | Aqua | No concentration | No issue identified within scoped rules | EU catalogue identity is recognised; no matching listing was identified in the four screened lists |
| 12 | Mystery Extract | No concentration | Identity unresolved | No exact source-backed identity exists |
| 13 | Diethylene glycol | No concentration | Professional review required | The literal source-backed ` (except ` search identity locates the conditional Singapore Part I rule, whose semantics remain review-only |

Expected summary:

| Summary field | Count |
| --- | ---: |
| Ingredients submitted | 13 |
| Prohibited | 3 |
| Within limit | 1 |
| Limit exceeded | 1 |
| Information missing | 1 |
| Professional review primary finding | 6 |
| Identity unresolved | 1 |
| Rows requiring review | 7 |

## DEMO-02 — Toothpaste context

Select the exact Product context `Toothpaste`.

| Row | Ingredient | Submitted data | Expected primary finding |
| ---: | --- | --- | --- |
| 1 | Chlorates of alkali metals | 4%, no basis, finished product | Within limit |
| 2 | Chlorates of alkali metals | 6%, no basis, finished product | Limit exceeded |
| 3 | Chlorates of alkali metals | No concentration | Information missing |

The applicable Singapore Part II ref 6 toothpaste limit is 5%.

## DEMO-03 — bounded no-issue behavior

Select the exact Product context `Artificial nail systems`.

Both `Chlorates of alkali metals` rows return `no_issue_identified_within_scoped_rules`. The identity resolves, both Singapore indexes are searched, and its context-specific Part II cases do not apply to the submitted context. Concentration is therefore unnecessary for the second row.

This scenario demonstrates the bounded no-issue result. It must not be presented as product approval or general ingredient safety.

## DEMO-04 — Other uses context

Select the exact Product context `Other uses`.

| Row | Ingredient | Submitted data | Expected primary finding |
| ---: | --- | --- | --- |
| 1 | Chlorates of alkali metals | 2%, no basis, finished product | Within limit |
| 2 | Chlorates of alkali metals | 4%, no basis, finished product | Limit exceeded |

The applicable Singapore Part II ref 6 `Other uses` limit is 3%.

## Important limitation for a “normal ingredient” demo

The EU glossary recognises a common name such as `Aqua`. The engine then searches Singapore Third Schedule Parts I/II and ACD Annex II/III. If no exact supported listing is found, it returns the bounded `no_issue_identified_within_scoped_rules` result. This does not establish ingredient safety, unrestricted use, or product compliance.

DEMO-03 is the honest way to exercise `no_issue_identified_within_scoped_rules` with the current accepted baseline: it uses a resolved identity whose known Singapore restrictions do not apply to the selected product context.

## How to run

In the UI, enter one scenario at a time and press **Run screen**. For direct API testing, send the contents of a scenario's `request` object to:

```text
POST http://127.0.0.1:8000/screen-formulation
Content-Type: application/json
```

Regulatory uncertainty is returned as a normal HTTP 200 screening result. HTTP 422 is reserved for malformed input.

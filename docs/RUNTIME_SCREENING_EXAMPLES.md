# Runtime screening examples

The runtime opens only the accepted dataset recorded in `data_pipeline/accepted_output_hashes.json`. It verifies every accepted raw and processed JSON hash before constructing indexes. It never runs extraction or rewrites the accepted files.

All concentrations supplied to the screening core include a value, unit, basis, and preparation stage. `basis: null` is explicit because the accepted source limit does not state another basis.

## Aminophylline by Singapore name

```python
result = screen_ingredient(store, IngredientInput(name="Aminophylline"))
```

The exact Singapore name resolves to `substance-sg-third-schedule-i-a1136`. Third Schedule Part I ref A1136 is active and normalized, so the primary finding is `prohibited_substance_identified`. Evidence includes Regulation 6(1) and 6(7), the exact wording `A1136 | Aminophylline`, PDF page 13, the official SSO URL, raw row ID and bounding box, and the aligned ACD comparison.

## Aminophylline by CAS

```python
result = screen_ingredient(store, IngredientInput(cas_number="317-34-0"))
```

Singapore does not publish a CAS value for this row. The validated ACD CAS resolves through the unique `aligned` ACD-to-Singapore cross-reference to the same Singapore A1136 identity. The Singapore rule still controls the finding; ACD supplies identity and comparison evidence only.

## Tosylchloramide sodium at and above its limit

```python
at_limit = IngredientInput(
    name="Tosylchloramide sodium",
    concentration={
        "value": 0.2,
        "unit": "percent",
        "basis": None,
        "preparation_stage": "finished_product",
    },
)
above_limit = at_limit.model_copy(
    update={"concentration": {**at_limit.concentration.model_dump(), "value": 0.21}}
)
```

Third Schedule Part II ref 5 applies to `All products`, so no product context is needed. At 0.2% the result is `restriction_within_limit`; at 0.21% it is `restriction_exceeded`. The runtime performs no unit, basis, or preparation-stage conversion.

## Context-specific chlorates

```python
ingredient = IngredientInput(
    name="Chlorates of alkali metals",
    concentration={
        "value": 4,
        "unit": "percent",
        "basis": None,
        "preparation_stage": "finished_product",
    },
)
missing_context = screen_ingredient(store, ingredient)
toothpaste = screen_ingredient(store, ingredient, product_context="Toothpaste")
```

Ref 6 has separate accepted cases. Without context, the result is `information_missing`. Exact `Toothpaste` selects case (a), whose 5% maximum can be evaluated, and yields `restriction_within_limit`. The runtime does not infer context from Appendix I or translate a user label into a source label.

## Conditional A1140 prohibition

Singapore Part I ref A1140 contains an exception for an unavoidable trace of diethylene glycol up to 0.1% in the finished product. That condition is preserved but not encoded as an executable exception. An exact match therefore produces `professional_review_required` and returns the full wording rather than an unconditional prohibited/pass result.

## Confirmed adverse finding with a separate review flag

The precedence regression test combines the real accepted A1136 deterministic record and the real accepted A1140 review-only record under one synthetic test identity. This fixture has no regulatory meaning; it tests aggregation only. The primary finding remains `prohibited_substance_identified`, while `review_required: true` and the A1140 reason remain separate. The same test covers an exceeded Part II finding. This prevents uncertain secondary records from erasing a confirmed adverse result.

## Inactive evidence

The accepted inactive records are ACD deleted rows, such as Annex II ref 382 (`Entry deleted`). They remain available through the rule, substance, cross-reference, and raw evidence indexes and are excluded from Singapore executable indexes. A regression fixture also verifies that an inactive Singapore-shaped historical record does not block `no_issue_identified_within_scoped_rules`; only an explicit future `unresolved_current_applicability` marker would require review.

## ACD-only BHT

CAS `128-37-0` exactly identifies the active ACD Annex III ref 342 BHT record. Its cross-reference status is `acd_only`, so it cannot establish a current Singapore rule or decision. The runtime stops at identity review and returns `professional_review_required` with the ACD source evidence.

## No-issue gate

`no_issue_identified_within_scoped_rules` is emitted only for a resolved Singapore identity after both Part I and Part II indexes were searched and no applicable current deterministic or review-only candidate remains. Missing product context does not block this result when no matched rule requires context. The wording is a bounded screening result and is never a product approval conclusion.

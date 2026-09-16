# Formulation screening API

Start the local API from the repository root:

```powershell
uv run uvicorn backend.app.main:app --reload
```

`POST /screen-formulation` accepts JSON only. It validates the complete formulation before screening any row. Regulatory uncertainty remains a normal HTTP 200 screening result; malformed input returns HTTP 422. If the accepted regulatory baseline cannot be verified, the endpoint fails closed with HTTP 503.

`GET /screening-options` supplies the frontend with the accepted Singapore product-context values and concentration enums. Its `concentration_bases` array contains JSON `null` for the absence of a basis; it never serializes this as the string `"null"`. This endpoint uses the same accepted store and fail-closed behavior.

Concentration fields have no defaults. `basis` is always present and is JSON `null` when no basis applies.

## Example request

```json
{
  "formulation_id": "DEMO-001",
  "formulation_name": "Demonstration formulation",
  "product_context": null,
  "ingredients": [
    {
      "name": "Aminophylline",
      "cas_number": "317-34-0",
      "concentration": null
    },
    {
      "name": "Tosylchloramide sodium",
      "cas_number": null,
      "concentration": {
        "value": 0.2,
        "unit": "percent",
        "basis": null,
        "preparation_stage": "finished_product"
      }
    },
    {
      "name": "Definitely absent ingredient",
      "cas_number": null,
      "concentration": {
        "value": 1.0,
        "unit": "percent",
        "basis": null,
        "preparation_stage": "finished_product"
      }
    }
  ]
}
```

## Example response structure

The endpoint returns the complete evidence objects. The following excerpt omits repeated source fields and bounding-box coordinates only to keep this document readable.

```json
{
  "formulation": {
    "formulation_id": "DEMO-001",
    "formulation_name": "Demonstration formulation",
    "product_context": null
  },
  "dataset": {
    "dataset_version": "acd-2026-1__sg-2025-12-01",
    "accepted_baseline_sha256": "8dc52418c1360074a52221966cd3e74e1dcd108233d8ad8045797a6c34e25017",
    "sources": [
      {
        "source_document": "acd_appendix_i",
        "title": "ACD Appendix I - Illustrative List of Cosmetic Products by Categories",
        "authority": "Health Sciences Authority",
        "sha256": "30690ead067954dc90dafc59833a2663f82827f3ffc44d887658a2d449dbf231",
        "page_count": 2,
        "source_url": "https://file.go.gov.sg/appendix-i-illustrative-list-by-category-of-cosmetic-products.pdf",
        "document_revision": null,
        "effective_date": null,
        "retrieval_date": "2026-09-14",
        "snapshot_generated_at": null
      }
    ]
  },
  "summary": {
    "ingredients_submitted": 3,
    "prohibited_substance_identified": 1,
    "restriction_exceeded": 0,
    "restriction_within_limit": 1,
    "professional_review_required": 0,
    "information_missing": 0,
    "identity_unresolved": 1,
    "no_issue_identified_within_scoped_rules": 0,
    "total_requiring_review": 1,
    "total_unresolved_identities": 1,
    "duplicate_row_groups": []
  },
  "ingredient_results": [
    {
      "submitted_row_number": 1,
      "primary_finding": "prohibited_substance_identified",
      "confirmed_findings": ["prohibited_substance_identified"],
      "review_required": false,
      "rule_evaluations": [
        {
          "rule_id": "sg-third-schedule-i-a1136",
          "evaluation_status": "deterministic",
          "finding": "prohibited_substance_identified",
          "evidence": {
            "regulatory_section": "Third Schedule Part I",
            "reference_number": "A1136",
            "source_text": "A1136 | Aminophylline",
            "source_pages": [13],
            "raw_record_id": "raw-singapore_regulations_2025_12_01-third-schedule-part-i-a1136"
          }
        }
      ]
    },
    {
      "submitted_row_number": 2,
      "primary_finding": "restriction_within_limit",
      "confirmed_findings": ["restriction_within_limit"],
      "review_required": false
    },
    {
      "submitted_row_number": 3,
      "primary_finding": "identity_unresolved",
      "confirmed_findings": [],
      "review_required": true
    }
  ]
}
```

This is an aggregation of ingredient findings. It is not a product-level compliance, approval, legality, or safety conclusion.

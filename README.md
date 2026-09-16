# Singapore cosmetic formulation-screening MVP

This repository is building an initial screening assistant for Singapore cosmetic formulations. Regulatory findings will be produced from structured, source-traceable rules and reviewed by a professional. The project does not make product-level approval or compliance determinations.

The current implementation includes the offline regulatory-data pipeline, a separate EU common-ingredient identity catalogue, and a read-only screening core. The regulatory layer covers ACD Appendix I, ACD Annex II Part 1, ACD Annex III Part 1, Singapore Regulation 6, and Singapore Third Schedule Parts I and II. The ACD 2026-1 and Singapore 1 December 2025 sources remain separate snapshots; only the Singapore snapshot controls screening findings.

The identity catalogue is built from Commission Implementing Decision (EU) 2025/1175. It contains 30,416 searchable identities from 30,418 source rows. Catalogue recognition establishes nomenclature only. A catalogue-only identity requires professional linkage review and does not establish Singapore permission, safety, or regulatory status.

Run validation and tests from the repository root:

```powershell
uv run python -m data_pipeline.scripts.validate_rules
uv run pytest
```

Build and validate the separate identity catalogue only when intentionally updating its accepted baseline:

```powershell
uv run python -m data_pipeline.identity.eu_common_ingredient_glossary.scripts.pipeline --accept
uv run python -m data_pipeline.identity.eu_common_ingredient_glossary.scripts.validate_catalogue
```

Normal API startup never runs this command or rewrites either accepted baseline.

Generate the bounded EU-to-Singapore linkage review queue:

```powershell
uv run python -m data_pipeline.identity.eu_singapore_linkage.scripts.pipeline candidates
```

Professional decisions are entered explicitly in
`data_pipeline/identity/eu_singapore_linkage/inputs/review_decisions.json`. The accepted schema
supports `linked`, scope-bound `verified_not_represented`, and reviewed `unresolved` decisions.
Each decision uses this human-editable shape:

```json
{
  "catalogue_ingredient_id": "eu-2025-1175-entry-17380",
  "catalogue_canonical_name": "NIACINAMIDE",
  "status": "verified_not_represented",
  "singapore_raw_record_ids": [],
  "review": {
    "reviewed": true,
    "reviewed_at": "2026-09-16",
    "reviewer": "Reviewer name or identifier",
    "review_basis": "What accepted evidence was checked",
    "notes": "Optional review notes"
  }
}
```

Validate the input without changing the accepted linkage baseline, then build it explicitly:

```powershell
uv run python -m data_pipeline.identity.eu_singapore_linkage.scripts.pipeline validate-review
uv run python -m data_pipeline.identity.eu_singapore_linkage.scripts.pipeline build-accepted
```

`linked` decisions require one or more accepted Singapore raw-record IDs.
`verified_not_represented` and `unresolved` decisions require no accepted targets. Every accepted
decision requires explicit reviewer metadata. Generated candidate matches are never promoted to an
accepted decision.

Start the screening API from the repository root:

```powershell
uv run uvicorn backend.app.main:app --reload
```

In a second terminal, start the frontend:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. The Vite development proxy strips `/api`, so `/api/screen-formulation`, `/api/screening-options`, and `/api/ingredients` reach the corresponding backend routes. Set `VITE_API_BASE_URL` to the backend origin, such as `http://127.0.0.1:8000`, when bypassing that proxy.

Search the accepted identity catalogue directly:

```powershell
Invoke-RestMethod "http://127.0.0.1:8000/ingredients?query=nia&limit=20"
```

Results are ordered by exact, prefix, then contains matches. The endpoint performs no fuzzy matching and returns no regulatory-status field.

Normal runtime loading does not run any extraction or linkage pipeline. `load_accepted_store()` verifies the regulatory baseline, `load_accepted_ingredient_catalog()` independently verifies the identity baseline, and `load_accepted_ingredient_linkages()` verifies the separate reviewed linkage baseline. If the identity catalogue or linkage baseline is unavailable, established regulatory identities still screen normally; catalogue-dependent identity verification is withheld for review. See [the formulation API](docs/FORMULATION_API.md), [the runtime examples](docs/RUNTIME_SCREENING_EXAMPLES.md), [the professional review pack](docs/REGULATORY_PROFESSIONAL_REVIEW_PACK.md), and [the regulatory pipeline notes](docs/REGULATORY_DATA_PIPELINE.md).

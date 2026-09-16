# Singapore cosmetic formulation-screening MVP

This repository is building an initial screening assistant for Singapore cosmetic formulations. Regulatory findings will be produced from structured, source-traceable rules and reviewed by a professional. The project does not make product-level approval or compliance determinations.

The current implementation includes the offline regulatory-data pipeline and a read-only screening core. It covers ACD Appendix I, ACD Annex II Part 1, ACD Annex III Part 1, Singapore Regulation 6, and Singapore Third Schedule Parts I and II. The ACD 2026-1 and Singapore 1 December 2025 sources remain separate snapshots; only the Singapore snapshot controls screening findings.

Run validation and tests from the repository root:

```powershell
uv run python -m data_pipeline.scripts.validate_rules
uv run pytest
```

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

Open `http://127.0.0.1:5173`. The Vite development proxy rewrites `/api/screen-formulation` to the backend's `/screen-formulation` route and does the same for `/api/screening-options`. Set `VITE_API_BASE_URL` to the backend origin, such as `http://127.0.0.1:8000`, when bypassing that proxy.

Normal runtime loading does not run the extraction pipeline. `load_accepted_store()` rejects any raw or processed file that differs from the accepted, spot-checked hash manifest. See [the formulation API](docs/FORMULATION_API.md), [the runtime examples](docs/RUNTIME_SCREENING_EXAMPLES.md), [the professional review pack](docs/REGULATORY_PROFESSIONAL_REVIEW_PACK.md), and [the regulatory pipeline notes](docs/REGULATORY_DATA_PIPELINE.md).

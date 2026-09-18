# Regulens — Singapore cosmetic formulation-screening MVP

Regulens is an initial screening assistant for Singapore cosmetic formulations. Its interface uses a restrained inspection-lens mark and the subtitle **Regulatory Intelligence**. Regulatory findings are produced from structured, source-traceable rules and reviewed by a professional. The project does not make product-level approval or compliance determinations.

The current implementation includes the offline regulatory-data pipeline, a separate EU common-ingredient identity catalogue, and a read-only screening core. The regulatory layer covers ACD Appendix I, ACD Annex II Part 1, ACD Annex III Part 1, Singapore Regulation 6, and Singapore Third Schedule Parts I and II. The ACD 2026-1 and Singapore 1 December 2025 sources remain separate snapshots; only the Singapore snapshot controls screening findings.

The identity catalogue is built from Commission Implementing Decision (EU) 2025/1175. It contains 30,416 searchable identities from 30,418 source rows. Catalogue recognition establishes nomenclature only. An exact catalogue identity is searched against the accepted Singapore Third Schedule Parts I/II and ACD Annex II/III scope; a no-match result is bounded to those four lists and does not establish Singapore permission, safety, unrestricted use, or product compliance.

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

The earlier EU-to-Singapore linkage pipeline and its immutable artifacts remain in the repository for audit history, but they are inactive in the current screening path. Missing linkage decisions no longer create review findings or block catalogue-recognised ingredients.

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

Open `http://127.0.0.1:5173`. The Vite development proxy strips `/api`, so `/api/screen-formulation`, `/api/screening-options`, `/api/ingredients`, and `/api/acd-ingredients` reach the corresponding backend routes. Set `VITE_API_BASE_URL` to the backend origin, such as `http://127.0.0.1:8000`, when bypassing that proxy.

## Vercel deployment setup

Create **two Vercel projects from this same repository**. Do not put an OpenAI key in the frontend project and never create a `VITE_*` OpenAI variable.

### Backend project

Use these Vercel project settings:

- Root Directory: repository root (`.`; leave the dashboard field empty when the imported repository root is already selected)
- Framework Preset: **FastAPI** (automatic detection is also valid)
- Build Command: leave empty
- Output Directory: leave empty
- Install Command: leave empty; Vercel reads `pyproject.toml` and `uv.lock`

`pyproject.toml` points Vercel directly to `backend.app.main:app`; it does not create a second FastAPI application. The root [`vercel.json`](vercel.json) enables Fluid Compute and gives the function a 300-second ceiling for bounded Agent requests. Function-level `includeFiles` and `excludeFiles` are intentionally omitted for compatibility with the current FastAPI project configuration; the initial deployment therefore uses Vercel's normal Python project bundle. Repository and local build clutter remain covered by `.gitignore`.

Set these variables on the **backend project** for Production, and separately for Preview if preview deployments need the Agent:

```text
OPENAI_API_KEY=<server-side secret>
OPENAI_AGENT_MODEL=gpt-5.6-sol
OPENAI_AGENT_TIMEOUT_SECONDS=180
OPENAI_EXPLANATION_MODEL=gpt-5.6-luna
FRONTEND_ORIGIN=https://<frontend-project-domain>
```

`FRONTEND_ORIGIN` must be an exact HTTP(S) origin without a path. Multiple exact origins may be comma-separated when a stable preview domain is also required. Regulens always retains `http://localhost:5173` and `http://127.0.0.1:5173` for local development; it does not use wildcard CORS. Production reads Vercel environment variables because no `.env` file is committed. Local startup continues to load the ignored repository-root `.env` with operating-system variables taking precedence.

### Frontend project

Use these Vercel project settings:

- Root Directory: `frontend`
- Framework Preset: **Vite**
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install` (or leave the detected default)

Set this public build-time variable on the **frontend project**:

```text
VITE_API_BASE_URL=https://<backend-project-domain>
```

Use the backend origin without a trailing route, for example `https://regulens-api.vercel.app`. The browser will then call `https://regulens-api.vercel.app/screen-formulation` and the other existing FastAPI paths. When this variable is absent locally, the frontend continues to use `/api` through the Vite proxy.

After both projects are deployed, update the backend `FRONTEND_ORIGIN` to the final frontend production origin and redeploy the backend if Vercel requests it. Smoke-test:

```text
GET https://<backend-project-domain>/health
GET https://<backend-project-domain>/screening-options
GET https://<frontend-project-domain>/
```

`/health` reports baseline/catalogue availability, configured model names, and whether the Agent key is present; it never returns the key. Then run one manual New Screen request, load one PDF evidence crop, and test one Agent CSV upload through prepare and screening.

The Agent session store is still process-local memory. A Vercel serverless request may reach a different or recycled instance, so session IDs cannot yet be relied upon across upload, answer, retry, and prepare calls. **The first post-deployment issue to test and fix is Agent session continuity across requests.** This deployment preparation intentionally does not redesign session persistence.

## Formulation Agent

The **Agent** tab accepts CSV formulations, interprets the table into the existing canonical formulation request, and pauses for explicit confirmation before screening. The backend loads the repository-root `.env` once with exported operating-system variables taking precedence. Configure the official OpenAI Python SDK with:

```dotenv
OPENAI_API_KEY=your-key
OPENAI_AGENT_MODEL=gpt-5.6-sol
OPENAI_AGENT_TIMEOUT_SECONDS=180
OPENAI_EXPLANATION_MODEL=gpt-5.6-luna
```

`OPENAI_AGENT_MODEL` defaults to `gpt-5.6-sol`. The legacy `OPENAI_MODEL` remains an Agent-only fallback. `OPENAI_AGENT_TIMEOUT_SECONDS` defaults to 180 seconds and accepts 30–240 seconds; this gives larger structured Sol responses time to finish before the application starts a fresh attempt while remaining below the 300-second Vercel function ceiling. `OPENAI_EXPLANATION_MODEL` defaults independently to `gpt-5.6-luna`. If the key or Agent model is unavailable, the parsed in-memory session is retained and the Agent page offers Retry; New Screen and established deterministic screening remain usable. Startup logs report only whether OpenAI is configured, the request timeout, and the two selected model names; the key is never logged.

The Agent API is:

- `POST /agent/formulations` — multipart CSV upload and interpretation;
- `GET /agent/formulations/{session_id}` — current structured session;
- `POST /agent/formulations/{session_id}/answers` — typed confirmations and edits;
- `POST /agent/formulations/{session_id}/prepare` — canonical request validation without screening;
- `POST /agent/formulations/{session_id}/retry` — retry a recoverable interpretation failure.

CSV input is limited to 2 MiB, 500 logical rows, 50 columns, 8,192 characters per cell, and UTF-8 or BOM-identified UTF-16 text. Sessions are memory-only, expire after 60 minutes of inactivity, and disappear when the API process restarts. Uploaded bytes are discarded after local parsing. Local code only decodes the file, detects the delimiter, enforces bounds, and preserves exact numbered cells. It does not assume the first row is a header or that a particular column name or order is required. The complete bounded grid is sent to the Responses API with response storage disabled; accepted PDFs, regulatory databases, filesystem paths, and API keys are never included.

Clarifications identify the affected source row, ingredient, field, and original value. The editable interpretation row and its clarification card share the same backend row state: text edits save on blur, selectors save immediately, and resolving either surface updates the other. Missing concentration units are handled per row. An unchanged unmatched identity is shown as unresolved instead of being presented as a recommendation; only an exact accepted catalogue candidate is labelled as a source-backed match.

The Agent model identifies headers, formulation rows, column meanings, explicit formulation metadata, and logical ingredients. A logical ingredient may cite exact cells from more than one source row. Every proposed field retains its cell references, and the backend rejects missing rows, impossible coordinates, changed source values, duplicate logical IDs, or ungrounded values. One bounded semantic repair is allowed before the session fails recoverably. Non-exact identity changes, assumed units, non-numeric values such as `QS` or `balance`, and a missing preparation stage remain under user control. **Confirm & Screen** sends the accepted canonical JSON to the existing deterministic `/screen-formulation` endpoint. The model has no screening tool and cannot generate regulatory findings or limits.

The uploaded CSV has no mandatory template. The Agent maps arbitrary source columns into the existing canonical request:

- each ingredient requires only `ingredient_name`;
- `cas_number` is optional;
- concentration is optional and, when present, contains `value`, `unit`, nullable `basis`, and `preparation_stage`;
- formulation ID, formulation name, and Product Context are optional formulation-level fields.

Columns such as **RM Name**, trade name, supplier, function, Notes, Remarks, comments, and batch information remain exact source metadata. They are visible in the collapsed Agent provenance view and after screening but are never sent to the deterministic regulatory engine. When both RM/trade name and INCI/common ingredient columns are present, the Agent proposes the INCI/common ingredient column; unclear mappings require confirmation. Notes are never required and cannot generate regulatory conclusions.

Product Context is handled separately from Preparation Stage. An exact source value may be proposed only when it equals an accepted backend option. Ambiguous source text is left unmapped. If the CSV has no Product Context, the user must choose an accepted option or explicitly confirm that it is unavailable; the screening engine may then return information missing for a context-dependent rule. A missing Preparation Stage produces a visible global proposal, such as **Finished product**, which is not applied until the user confirms it.

The representative fixtures are [`backend/tests/fixtures/agent_clean.csv`](backend/tests/fixtures/agent_clean.csv) and [`backend/tests/fixtures/agent_messy.csv`](backend/tests/fixtures/agent_messy.csv). The clean file contains only ingredient and concentration columns. The messy file includes optional RM Name and Remarks fields to demonstrate provenance rather than required screening input.

Normal tests mock both model boundaries. Live integration checks require an explicit opt-in even when `.env` contains a key:

```powershell
$env:RUN_OPENAI_INTEGRATION="1"
uv run pytest -m openai_integration backend/tests/test_agent.py backend/tests/test_review_explanations.py -s
```

The live checks print only safe usage metadata: actual model, token counts, tool-call count, detected row numbers, clarification types, and final state. They never print the key or complete confidential formulations.

After deterministic screening, review-required rows may be sent in one bounded batch to the configured explanation model. The request contains only the existing finding, review codes, submitted facts, selected structured rule evidence, identifiers, references, and source versions. It does not contain PDFs or unrelated datasets. The response can only provide short presentation text and exact precomputed submitted/rule fact strings; it has no fields capable of changing a finding or review flag. Unsafe, invalid, timed-out, or unavailable model output is replaced by deterministic plain-language guidance, so OpenAI availability cannot change or suppress the screening result. The exact review codes and explanation source/model remain under **Technical provenance**.

Search the accepted identity catalogue directly:

```powershell
Invoke-RestMethod "http://127.0.0.1:8000/ingredients?query=nia&limit=20"
```

Results are ordered by exact, prefix, then contains matches. The endpoint performs no fuzzy matching and returns no regulatory-status field.

The Agent interpretation table stays focused on canonicalisation and confirmation. After **Confirm & Screen**, the shared evidence drawer can load the trusted EU glossary row from `GET /identity-source-evidence/{raw_record_id}` and the complete accepted page from `GET /identity-source-evidence/{raw_record_id}/page`. Both routes resolve the page and coordinates internally from the accepted catalogue; client-supplied paths or coordinates are never used. This evidence confirms nomenclature only. Singapore regulatory evidence remains part of the deterministic screening result.

Search accepted ACD Annex II/III regulatory records separately:

```powershell
Invoke-RestMethod "http://127.0.0.1:8000/acd-ingredients?query=hydro&limit=20"
```

`/ingredients` searches recognised cosmetic names in the EU identity catalogue. `/acd-ingredients` searches active accepted regulatory records in ACD Annex II Part 1 and Annex III Part 1. Neither search endpoint creates a screening finding; Singapore remains the decision source when a Singapore rule is found.

The formulation ingredient picker can query either source or both. **EU glossary** suggestions are labelled as recognised ingredient names; **ACD regulatory lists** suggestions are labelled with their annex and reference. Only enabled sources are requested, stale searches are cancelled, and at most 20 combined suggestions are rendered. EU prefix lookup uses a sorted index and binary search; deterministic contains matching is a bounded fallback.

Runtime matching is exact and conservative. One additional search identity is derived only when an accepted regulatory source name contains the literal delimiter `" (except "`; the prefix may then be searched while the complete accepted wording remains unchanged. No general parenthetical stripping, synonym generation, or fuzzy matching is performed.

Normal runtime loading never runs extraction or rewrites an accepted baseline. `load_accepted_store()` verifies the regulatory baseline and `load_accepted_ingredient_catalog()` independently verifies the identity baseline. If the identity catalogue is unavailable, established regulatory identities still screen normally; catalogue-dependent identity verification is withheld for review. See [the formulation API](docs/FORMULATION_API.md), [the runtime examples](docs/RUNTIME_SCREENING_EXAMPLES.md), [the professional review pack](docs/REGULATORY_PROFESSIONAL_REVIEW_PACK.md), and [the regulatory pipeline notes](docs/REGULATORY_DATA_PIPELINE.md).

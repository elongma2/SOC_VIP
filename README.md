# Clarity Review — UI Prototype V1

This is a desktop browser-based, dependency-free clickable prototype for a source-controlled cosmetic formula evidence review workflow. The primary pilot user is a junior RA or consultant inside a regulatory consultancy, preparing client evidence for qualified senior review. Small in-house RA teams are the secondary user hypothesis; this is not positioned as a brand self-service compliance tool.

## Run locally

From this folder:

```bash
python3 -m http.server 4173
```

Then open [http://localhost:4173](http://localhost:4173).

## Repository contents

- `index.html`, `styles.css`, and `app.js`: the dependency-free clickable prototype.
- `assets/source-pages/`: rendered previews of the synthetic source documents.
- `docs/Clarity_Review_Synthetic_Client_Source_Pack.pdf`: the complete three-page synthetic source pack.
- `scripts/`: the synthetic-PDF builder and UI smoke test.

This public repository contains synthetic demonstration material only. Do not commit real client formulations, supplier dossiers, interview recordings, credentials, or personal data.

## Prototype scope

- Six screens: Cases, Product context, Formula & raw materials, Preflight, Findings review, and Review summary.
- Compact six-stage workflow progress: the active stage shows the current location, teal segments show completed workflow actions, and open-issue counts remain separate.
- A source-document comparison drawer available from Formula, Preflight and Findings.
- Three rendered pages from a synthetic client source pack: formula sheet, fragrance SDS and CAPB specification.
- Desktop demonstration layout and synthetic data only.
- Browser-memory state only; refresh resets the prototype.
- No database, AI model, real upload, OCR, authentication, or final regulatory conclusion.

The source drawer displays a static, synthetic PDF rendering. `Extraction simulated` means the values are pre-authored for the interaction demo; the browser has not parsed the PDF.

## Why this comes first

The interview evidence supports missing-information checks, direct-source traceability and professional reviewer control. UI V1 first tests a consultancy-led workflow, while small in-house RA teams remain a secondary segment to validate. The economic buyer is still a hypothesis: likely a consultancy owner or operations lead in the first pilot, with in-house RA managers tested in parallel.

## Next implementation gate

Do not connect confidential formulation data until the team has:

1. selected one product category;
2. recruited two qualified reviewers;
3. obtained 4–6 anonymised completed cases;
4. agreed the pilot source register and bounded rule set;
5. defined access, retention, deletion and model-training controls.

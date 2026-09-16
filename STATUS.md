# Project status

Updated: 2026-09-16

- **Current state:** The end-to-end screening slice now includes professional-facing evidence. The drawer presents readable Singapore rules and ACD differences, renders the exact accepted PDF row through `GET /source-evidence/{raw_record_id}`, and opens the corresponding accepted page without accepting client paths or coordinates. Snapshot evidence is visually distinct from the live official-source link.
- **Coverage:** 3,908 raw table records produce 3,983 rule records: 2,776 normalized, 1,176 requiring manual review, and 31 inactive. There are 3,877 active source-specific substance records. The 1,978 cross-references comprise 872 `aligned`, 1,057 `changed`, 40 `acd_only`, 0 `singapore_only`, and 9 `ambiguous` records.
- **Current blocker:** No technical blocker for the interactive demo. The complete 2,313-item review queue remains unresolved pending professional triage.
- **Immediate next milestone:** Final demo polish and a lightweight professional-review interaction plan without adding persistence.
- **Known limitations:** Identity resolution remains exact and source-backed. Submitting the simple name `Diethylene glycol` returns `identity_unresolved`; the complete accepted conditional wording resolves, and the UI shortens it only for display. There is no persistence, authentication, upload, history, reviewer storage, fuzzy matching, context inference, unit/stage/basis conversion, or legal synchronization. Conditional prohibitions, ambiguous restrictions, ACD-only identities, warnings, and unsupported semantics remain review-only.
- **Next task:** Polish the demo workflow and prepare the reviewer-facing walkthrough using the accepted review pack.
- **Last verified workflow:** TEST-001 loads the 82 accepted contexts, screens through the real API, renders summary and Singapore-only rules, and displays hash-verified accepted PDF crops/pages for Aminophylline A1136 and Tosylchloramide Ref 5. Structural validation passes; all 90 Python tests and all 17 frontend tests pass; the production build succeeds; all 12 accepted outputs match the reviewed baseline.

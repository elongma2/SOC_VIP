import type { IngredientResult, RuleEvidence, ScreeningOptions, ScreeningResponse } from "../types/screening";

export const optionsFixture: ScreeningOptions = {
  jurisdiction: "Singapore",
  dataset_version: "acd-2026-1__sg-2025-12-01",
  accepted_baseline_sha256: "8dc52418c1360074a52221966cd3e74e1dcd108233d8ad8045797a6c34e25017",
  product_contexts: ["All products", "Toothpaste"],
  concentration_units: ["percent", "mg/kg", "ppm"],
  concentration_bases: [null, "NH3", "free base", "zinc", "sulphate", "hydrochloride", "tetrahydrochloride"],
  preparation_stages: ["finished_product", "after_mixing", "ready_for_use"],
};

const provision = (paragraph: "1" | "2") => ({
  provision_id: `sg-regulation-6-${paragraph}`,
  regulation: "6",
  paragraph,
  source_document: "singapore_regulation_6_excerpt",
  source_pages: [2],
  source_text: `Regulation 6(${paragraph}) source wording`,
  source_version: "version in force from 1 December 2025",
  effective_date: "2025-12-01",
  retrieval_date: "2026-09-14",
  source_url: "https://sso.agc.gov.sg/example",
  source_hash: "abc",
});

const baseResult = (row: number, name: string): IngredientResult => ({
  dataset_version: optionsFixture.dataset_version,
  accepted_baseline_sha256: optionsFixture.accepted_baseline_sha256,
  submitted_ingredient: { name, cas_number: null, concentration: null },
  submitted_product_context: null,
  identity: {
    status: "resolved",
    match_methods: ["exact_name"],
    singapore_candidates: [],
    acd_candidates: [],
    resolved_singapore_substance_id: `sg-${row}`,
    resolved_singapore_substance_ids: [`sg-${row}`],
    identity_source_type: "singapore_regulatory_source",
    identity_source_name: "Singapore Third Schedule",
    singapore_linkage_status: "not_applicable",
    catalogue_identity: null,
    linkage_evidence: null,
    reasons: [],
  },
  primary_finding: "no_issue_identified_within_scoped_rules",
  confirmed_findings: [],
  review_required: false,
  review_types: [],
  review_reasons: [],
  rule_evaluations: [],
  inactive_evidence: [],
  searched_singapore_parts: ["Third Schedule Part I", "Third Schedule Part II"],
  scope_note: "Initial Singapore screening only.",
  submitted_row_number: row,
});

const evidence = (part: "I" | "II", reference: string, name: string): RuleEvidence => ({
  dataset_version: optionsFixture.dataset_version,
  rule_id: `sg-${part}-${reference}`,
  source_document: "singapore_regulations_2025_12_01",
  source_version: "informal consolidation - version in force from 1 December 2025",
  effective_date: "2025-12-01",
  document_revision: "informal consolidation - version in force from 1 December 2025",
  retrieval_date: "2026-09-15",
  source_url: "https://sso.agc.gov.sg/SL/HPA2007-S683-2007",
  regulatory_section: `Third Schedule Part ${part}`,
  reference_number: reference,
  substance_name: name,
  product_context: part === "II" ? "All products" : null,
  concentration: part === "II" ? {
    value: 0.2,
    unit: "percent",
    comparator: "less_than_or_equal",
    basis: null,
    preparation_stage: "finished_product",
    source_text: "0.2%",
  } : null,
  other_conditions: null,
  required_warning: null,
  source_text: `${reference} | ${name}${part === "II" ? " | All products | 0.2% | |" : ""}`,
  source_pages: [part === "I" ? 13 : 99],
  normalization_status: "normalized",
  review_reasons: [],
  raw_record_id: `raw-sg-${reference}`,
  raw_fragments: [{ raw_record_id: `raw-sg-${reference}`, source_page: part === "I" ? 13 : 99, row_bbox: [76.6, 247.8, 433.5, 266.1] }],
  regulation_6_provisions: [provision(part === "I" ? "1" : "2")],
  cross_references: [],
  acd_counterpart_rules: [],
});

const aminophylline = baseResult(1, "Aminophylline");
aminophylline.submitted_ingredient.cas_number = "317-34-0";
aminophylline.primary_finding = "prohibited_substance_identified";
aminophylline.confirmed_findings = ["prohibited_substance_identified"];
aminophylline.rule_evaluations = [{
  rule_id: "sg-third-schedule-i-a1136",
  evaluation_status: "deterministic",
  finding: "prohibited_substance_identified",
  reasons: [],
  submitted_concentration: null,
  evidence: evidence("I", "A1136", "Aminophylline"),
}];

const tosylchloramide = baseResult(2, "Tosylchloramide sodium");
tosylchloramide.submitted_ingredient.concentration = { value: 0.21, unit: "percent", basis: null, preparation_stage: "finished_product" };
tosylchloramide.primary_finding = "restriction_exceeded";
tosylchloramide.confirmed_findings = ["restriction_exceeded"];
const tosylEvidence = evidence("II", "5", "Tosylchloramide sodium");
tosylEvidence.cross_references = [{
  cross_reference_id: "xref-5",
  regulatory_mapping: "annex-iii-to-third-schedule-part-ii",
  reference_number: "5",
  acd_rule_ids: ["acd-iii-5"],
  singapore_rule_ids: ["sg-third-schedule-ii-5"],
  match_basis: "reference_number",
  comparison_status: "changed",
  field_differences: {
    product_context: { acd: "[parent] ", singapore: "[parent] All products" },
    concentration: {
      acd: '[parent] {"basis": null, "comparator": "less_than_or_equal", "preparation_stage": "ready_for_use", "source_text": "0.2%", "unit": "percent", "value": 0.2}',
      singapore: '[parent] {"basis": null, "comparator": "less_than_or_equal", "preparation_stage": "finished_product", "source_text": "0.2%", "unit": "percent", "value": 0.2}',
    },
  },
  candidate_matches: [],
  professional_review_required: true,
  review_reasons: ["source_wording_or_regulatory_field_differs"],
}];
tosylEvidence.acd_counterpart_rules = [{
  rule_id: "acd-iii-5",
  source_document: "acd_annexes_2026_1",
  source_version: "2026-1, 22 June 2026",
  regulatory_section: "Annex III Part 1",
  reference_number: "5",
  substance_name: "Tosylchloramide sodium (INN) Chloramine-T",
  cas_numbers: ["127-65-1"],
  source_text: "5 | Tosylchloramide sodium | 0.2%",
  source_pages: [105],
  source_url: "https://file.go.gov.sg/annexes.pdf",
  document_revision: "2026-1, 22 June 2026",
  active: true,
  normalization_status: "normalized",
  review_reasons: [],
  raw_fragments: [],
}];
tosylchloramide.rule_evaluations = [{
  rule_id: "sg-third-schedule-ii-5",
  evaluation_status: "deterministic",
  finding: "restriction_exceeded",
  reasons: [],
  submitted_concentration: tosylchloramide.submitted_ingredient.concentration,
  evidence: tosylEvidence,
}];

const mystery = baseResult(3, "Mystery Extract");
mystery.identity = {
  status: "unresolved",
  match_methods: [],
  singapore_candidates: [],
  acd_candidates: [],
  resolved_singapore_substance_id: null,
  resolved_singapore_substance_ids: [],
  identity_source_type: null,
  identity_source_name: null,
  singapore_linkage_status: "not_applicable",
  catalogue_identity: null,
  linkage_evidence: null,
  reasons: ["no_source_backed_identity_match"],
};
mystery.primary_finding = "identity_unresolved";
mystery.review_required = true;
mystery.review_types = ["identity_review"];
mystery.review_reasons = ["no_source_backed_identity_match"];
mystery.searched_singapore_parts = [];

export const testResponse: ScreeningResponse = {
  formulation: { formulation_id: "TEST-001", formulation_name: "My test formulation", product_context: null },
  dataset: {
    dataset_version: optionsFixture.dataset_version,
    accepted_baseline_sha256: optionsFixture.accepted_baseline_sha256,
    sources: [{
      source_document: "singapore_regulations_2025_12_01",
      title: "Health Products (Cosmetic Products - ASEAN Cosmetic Directive) Regulations 2007",
      authority: "Singapore Statutes Online",
      sha256: "sourcehash",
      page_count: 196,
      source_url: "https://sso.agc.gov.sg/SL/HPA2007-S683-2007",
      document_revision: "informal consolidation - version in force from 1 December 2025",
      effective_date: "2025-12-01",
      retrieval_date: "2026-09-15",
      snapshot_generated_at: "2025-12-01T17:34:45+08:00",
    }],
    identity_catalogue: {
      available: true,
      dataset_version: "eu-glossary-2025-1175",
      accepted_baseline_sha256: "identityhash",
      source_name: "EU Glossary of Common Ingredient Names",
      source_role: "ingredient_identity_reference",
      ingredient_count: 30416,
      error: null,
    },
    identity_linkage: {
      available: true,
      dataset_version: "eu-sg-linkage__eu-glossary-2025-1175__sg-2025-12-01",
      accepted_baseline_sha256: "linkagehash",
      identity_dataset_version: "eu-glossary-2025-1175",
      singapore_regulatory_baseline: "sg-2025-12-01",
      screened_scope: ["Third Schedule Part I", "Third Schedule Part II"],
      accepted_records: 0,
      linked: 0,
      verified_not_represented: 0,
      unresolved: 0,
      error: null,
    },
  },
  summary: {
    ingredients_submitted: 3,
    prohibited_substance_identified: 1,
    restriction_exceeded: 1,
    restriction_within_limit: 0,
    professional_review_required: 0,
    information_missing: 0,
    identity_unresolved: 1,
    no_issue_identified_within_scoped_rules: 0,
    total_requiring_review: 1,
    total_unresolved_identities: 1,
    duplicate_row_groups: [],
  },
  ingredient_results: [aminophylline, tosylchloramide, mystery],
};

export { baseResult, evidence };

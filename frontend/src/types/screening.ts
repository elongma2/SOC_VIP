export type ConcentrationUnit = "percent" | "mg/kg" | "ppm";
export type ConcentrationBasis =
  | "NH3"
  | "free base"
  | "zinc"
  | "sulphate"
  | "hydrochloride"
  | "tetrahydrochloride";
export type PreparationStage = "finished_product" | "after_mixing" | "ready_for_use";

export type Finding =
  | "no_issue_identified_within_scoped_rules"
  | "restriction_within_limit"
  | "restriction_exceeded"
  | "prohibited_substance_identified"
  | "information_missing"
  | "identity_unresolved"
  | "professional_review_required";

export interface Concentration {
  value: number;
  unit: ConcentrationUnit;
  basis: ConcentrationBasis | null;
  preparation_stage: PreparationStage;
}

export interface FormulationIngredient {
  name: string;
  cas_number: string | null;
  concentration: Concentration | null;
}

export interface FormulationRequest {
  formulation_id: string | null;
  formulation_name: string | null;
  product_context: string | null;
  ingredients: FormulationIngredient[];
}

export interface ScreeningOptions {
  jurisdiction: "Singapore";
  dataset_version: string;
  accepted_baseline_sha256: string;
  product_contexts: string[];
  concentration_units: ConcentrationUnit[];
  concentration_bases: Array<ConcentrationBasis | null>;
  preparation_stages: PreparationStage[];
}

export interface SourceSnapshot {
  source_document: string;
  title: string;
  authority: string;
  sha256: string;
  page_count: number;
  source_url: string;
  document_revision: string | null;
  effective_date: string | null;
  retrieval_date: string;
  snapshot_generated_at: string | null;
}

export interface IdentityCandidate {
  substance_id: string;
  source_document: string;
  regulatory_section: string;
  reference_number: string;
  original_substance_name: string;
  normalized_substance_name: string;
  cas_numbers: string[];
  match_methods: string[];
  cross_reference_statuses: string[];
}

export interface IdentityResolution {
  status: "resolved" | "unresolved" | "ambiguous" | "review_required";
  match_methods: string[];
  singapore_candidates: IdentityCandidate[];
  acd_candidates: IdentityCandidate[];
  resolved_singapore_substance_id: string | null;
  resolved_singapore_substance_ids: string[];
  identity_source_type: "singapore_regulatory_source" | "acd_regulatory_source" | "ingredient_identity_catalogue" | null;
  identity_source_name: string | null;
  singapore_linkage_status: "not_applicable" | "linked" | "verified_not_represented" | "unresolved";
  catalogue_identity: CatalogueIdentity | null;
  linkage_evidence: LinkageEvidence | null;
  reasons: string[];
}

export interface LinkageTarget {
  raw_record_id: string;
  rule_id: string;
  substance_id: string;
  part: string;
  reference: string;
  source_substance_name: string;
  source_document: string;
  source_hash: string;
}

export interface LinkageEvidence {
  linkage_id: string;
  accepted_status: "linked" | "verified_not_represented" | "unresolved";
  applicable_to_active_baseline: boolean;
  identity_dataset_version: string;
  identity_dataset_hash: string;
  singapore_regulatory_baseline: string;
  singapore_regulatory_baseline_hash: string;
  screened_scope: string[];
  singapore_targets: LinkageTarget[];
  review: {
    reviewed: boolean;
    reviewed_at: string;
    reviewer: string;
    review_basis: string;
    notes: string;
  };
  inapplicability_reasons: string[];
}

export interface CatalogueIdentity {
  ingredient_id: string;
  canonical_name: string;
  source_name: string;
  source_document: string;
  source_version: string;
  source_url: string;
  source_entries: number[];
  source_pages: number[];
  raw_record_ids: string[];
  identity_dataset_version: string;
  accepted_baseline_sha256: string;
}

export interface RawFragment {
  raw_record_id: string;
  source_page: number;
  table_bbox?: number[] | null;
  row_bbox?: number[] | null;
  cells?: Array<string | null>;
  original_row_text?: string;
  is_continuation?: boolean;
  [key: string]: unknown;
}

export interface RegulationProvision {
  provision_id: string;
  regulation: string;
  paragraph: string;
  source_document: string;
  source_pages: number[];
  source_text: string;
  source_version: string | null;
  effective_date: string | null;
  retrieval_date: string;
  source_url: string;
  source_hash: string;
}

export interface CrossReference {
  cross_reference_id: string;
  regulatory_mapping: string;
  reference_number: string;
  acd_rule_ids: string[];
  singapore_rule_ids: string[];
  match_basis: string;
  comparison_status: "aligned" | "changed" | "acd_only" | "singapore_only" | "ambiguous";
  field_differences: Record<string, unknown>;
  candidate_matches: unknown[];
  professional_review_required: boolean;
  review_reasons: string[];
}

export interface CounterpartRule {
  rule_id: string;
  source_document: string;
  source_version: string | null;
  regulatory_section: string;
  reference_number: string;
  substance_name: string;
  cas_numbers: string[];
  source_text: string;
  source_pages: number[];
  source_url: string;
  document_revision: string | null;
  active: boolean;
  normalization_status: string;
  review_reasons: string[];
  raw_fragments: RawFragment[];
  [key: string]: unknown;
}

export interface RuleConcentration {
  value?: number;
  unit?: string;
  comparator?: string;
  basis?: string | null;
  preparation_stage?: string;
  source_field?: string;
  source_text?: string;
  [key: string]: unknown;
}

export interface RuleEvidence {
  dataset_version: string;
  rule_id: string;
  source_document: string;
  source_version: string | null;
  effective_date: string | null;
  document_revision: string | null;
  retrieval_date: string;
  source_url: string;
  regulatory_section: string;
  reference_number: string;
  substance_name: string;
  product_context: string | null;
  concentration: RuleConcentration | null;
  other_conditions: string | null;
  required_warning: string | null;
  source_text: string;
  source_pages: number[];
  normalization_status: string;
  review_reasons: string[];
  raw_record_id: string;
  raw_fragments: RawFragment[];
  regulation_6_provisions: RegulationProvision[];
  cross_references: CrossReference[];
  acd_counterpart_rules: CounterpartRule[];
}

export interface RuleEvaluation {
  rule_id: string;
  evaluation_status: string;
  finding: Finding | null;
  reasons: string[];
  submitted_concentration: Concentration | null;
  evidence: RuleEvidence;
}

export interface IngredientResult {
  dataset_version: string;
  accepted_baseline_sha256: string;
  submitted_ingredient: FormulationIngredient;
  submitted_product_context: string | null;
  identity: IdentityResolution;
  primary_finding: Finding;
  confirmed_findings: Finding[];
  review_required: boolean;
  review_types: Array<"identity_review" | "rule_review">;
  review_reasons: string[];
  rule_evaluations: RuleEvaluation[];
  inactive_evidence: RuleEvidence[];
  searched_singapore_parts: string[];
  scope_note: string;
  submitted_row_number: number;
}

export interface FormulationSummary {
  ingredients_submitted: number;
  prohibited_substance_identified: number;
  restriction_exceeded: number;
  restriction_within_limit: number;
  professional_review_required: number;
  information_missing: number;
  identity_unresolved: number;
  no_issue_identified_within_scoped_rules: number;
  total_requiring_review: number;
  total_unresolved_identities: number;
  duplicate_row_groups: number[][];
}

export interface ScreeningResponse {
  formulation: {
    formulation_id: string | null;
    formulation_name: string | null;
    product_context: string | null;
  };
  dataset: {
    dataset_version: string;
    accepted_baseline_sha256: string;
    sources: SourceSnapshot[];
    identity_catalogue: {
      available: boolean;
      dataset_version: string | null;
      accepted_baseline_sha256: string | null;
      source_name: string | null;
      source_role: string | null;
      ingredient_count: number | null;
      error: string | null;
    };
    identity_linkage: {
      available: boolean;
      dataset_version: string | null;
      accepted_baseline_sha256: string | null;
      identity_dataset_version: string | null;
      singapore_regulatory_baseline: string | null;
      screened_scope: string[];
      accepted_records: number | null;
      linked: number | null;
      verified_not_represented: number | null;
      unresolved: number | null;
      error: string | null;
    };
  };
  summary: FormulationSummary;
  ingredient_results: IngredientResult[];
}

export interface IngredientSearchResult {
  ingredient_id: string;
  canonical_name: string;
  display_name: string;
  identity_source: string;
  source_document: string;
  source_version: string;
  source_entries: number[];
  source_pages: number[];
  raw_record_ids: string[];
}

export interface IngredientSearchResponse {
  query: string;
  dataset_version: string;
  accepted_baseline_sha256: string;
  results: IngredientSearchResult[];
}

export interface EditorIngredient {
  id: string;
  name: string;
  casNumber: string;
  concentrationEnabled: boolean;
  concentrationValue: string;
  unit: ConcentrationUnit;
  basis: ConcentrationBasis | null;
  preparationStage: PreparationStage;
}

export interface FieldIssue {
  path: string;
  message: string;
}

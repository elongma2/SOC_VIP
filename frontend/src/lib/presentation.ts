import { supportingSingaporeEvaluations } from "./screening";
import type {
  CrossReference,
  IngredientResult,
  RuleConcentration,
  RuleEvaluation,
} from "../types/screening";

const reviewReasonLabels: Record<string, string> = {
  no_source_backed_identity_match: "No source-backed ingredient identity was found",
  neither_name_nor_cas_resolved_to_a_source_backed_identity: "Neither the submitted name nor CAS resolved to a source-backed identity",
  supplied_name_and_cas_resolve_to_different_singapore_identities: "The submitted name and CAS resolve to different Singapore identities",
  supplied_name_and_cas_have_multiple_common_singapore_identities: "The submitted name and CAS match multiple Singapore identities",
  only_one_supplied_identifier_provides_a_unique_corroborated_identity: "Only one submitted identifier could be corroborated",
  supplied_identifiers_do_not_establish_a_unique_singapore_identity: "The submitted identifiers do not establish one Singapore identity",
  singapore_identity_bridge_is_not_aligned: "The ACD-to-Singapore identity link is not aligned",
  identifier_matches_multiple_singapore_identities: "The identifier matches multiple Singapore identities",
  exact_identity_exists_only_in_the_acd_snapshot: "An exact identity exists only in the ACD snapshot",
  supplied_cas_is_malformed: "The submitted CAS identifier is malformed",
  source_wording_or_regulatory_field_differs: "ACD and Singapore source wording or regulatory fields differ",
  ambiguous_multi_case_concentration_not_normalized: "This rule contains multiple concentration cases that cannot yet be evaluated automatically",
  conditional_prohibition_wording_not_structured: "The prohibition includes a source condition that has not been structured for automatic evaluation",
  additional_numeric_condition_not_structured: "The rule includes an additional numerical condition that is not structured for automatic evaluation",
  concentration_condition_not_normalized: "The concentration condition has not been normalized for automatic evaluation",
  concentration_contains_multiple_or_ambiguous_values: "The source contains multiple or ambiguous concentration values",
  multi_case_mapping_not_unambiguous: "The source cases cannot be mapped unambiguously",
  no_current_singapore_reference_number_match: "No current Singapore reference-number match was found",
  non_exhaustive_identifier_scope_not_structured: "The source identifier scope is not structured for automatic evaluation",
  normalized_case_structure_differs_between_sources: "The normalized case structure differs between the ACD and Singapore sources",
  ranged_reference_prevents_unique_entry_correspondence: "A ranged reference prevents a unique source correspondence",
  jurisdiction_specific_source_wording: "The sources contain jurisdiction-specific wording",
  malformed_cas_identifier_preserved: "A malformed source CAS identifier was preserved for review",
  blank_deleted_or_ranged_source_entry: "The source contains a blank, deleted, or ranged entry",
  catalogue_identity_singapore_linkage_unresolved: "Singapore identity linkage needs verification",
  ingredient_catalogue_unavailable_identity_verification_withheld: "The ingredient catalogue is unavailable, so identity verification was withheld",
  ingredient_linkage_baseline_unavailable: "The accepted Singapore identity-linkage baseline is unavailable",
  linkage_not_valid_for_active_baseline: "The accepted identity linkage is not valid for the active source baseline or screening scope",
  supplied_cas_cannot_be_corroborated_by_catalogue_source: "The submitted CAS cannot be corroborated by the name-only ingredient catalogue",
};

const statusLabels: Record<string, string> = {
  changed: "Changed",
  aligned: "Aligned",
  acd_only: "ACD only",
  singapore_only: "Singapore only",
  ambiguous: "Ambiguous",
  deterministic: "Deterministic",
  withheld_professional_review: "Withheld for professional review",
  withheld_information_missing: "Information missing",
  not_applicable_to_submitted_context: "Not applicable to submitted context",
  resolved: "Resolved",
  unresolved: "Unresolved",
  review_required: "Review required",
  not_applicable: "Not applicable",
  linked: "Linked",
  verified_not_represented: "Verified not represented in scoped lists",
};

const matchMethodLabels: Record<string, string> = {
  exact_name: "Exact source-backed name",
  exact_cas: "Exact source-backed CAS",
  exact_name_via_acd: "Exact name via ACD cross-reference",
  exact_cas_via_acd: "Exact CAS via ACD cross-reference",
  exact_catalogue_name: "Exact EU catalogue name",
  accepted_catalogue_linkage: "Accepted EU-to-Singapore identity linkage",
  accepted_verified_not_represented: "Accepted scoped absence review",
};

const fieldLabels: Record<string, string> = {
  substance_name: "Source substance wording",
  product_context: "Product context",
  concentration: "Concentration",
  other_conditions: "Other requirements",
  required_warning: "Required warning",
};

export function displayIngredientName(result: IngredientResult): string {
  const supportingName = supportingSingaporeEvaluations(result)[0]?.evidence.substance_name;
  const resolvedName = result.identity.singapore_candidates.find(
    (candidate) => candidate.substance_id === result.identity.resolved_singapore_substance_id,
  )?.original_substance_name;
  const sourceBackedName = supportingName ?? resolvedName ?? result.identity.catalogue_identity?.canonical_name;
  if (!sourceBackedName) return result.submitted_ingredient.name;
  const delimiterIndex = sourceBackedName.toLowerCase().indexOf(" (except ");
  return delimiterIndex < 0 ? sourceBackedName : sourceBackedName.slice(0, delimiterIndex);
}

export function reviewTypeLabel(value: string): string {
  return {
    identity_review: "Identity review",
    rule_review: "Rule review",
  }[value] ?? readableCode(value);
}

export function readableCode(value: string): string {
  return statusLabels[value] ?? value.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}

export function matchMethodLabel(value: string): string {
  return matchMethodLabels[value] ?? readableCode(value);
}

export function reviewReasonLabel(value: string): string {
  const separator = value.indexOf(": ");
  const reason = separator >= 0 ? value.slice(separator + 2) : value;
  return reviewReasonLabels[reason] ?? readableCode(reason);
}

export function preparationStageLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return {
    finished_product: "Finished product",
    after_mixing: "After mixing for use",
    ready_for_use: "Ready for use",
  }[value] ?? readableCode(value);
}

export function basisLabel(value: string | null | undefined): string {
  return value == null ? "No specific basis" : value;
}

export function comparatorLabel(value: string | undefined): string {
  return {
    less_than_or_equal: "At most",
    less_than: "Less than",
  }[value ?? ""] ?? readableCode(value ?? "Unspecified");
}

export function formatRuleConcentration(value: RuleConcentration | null): string {
  if (!value || typeof value.value !== "number") return value?.source_text ?? "—";
  const unit = value.unit === "percent" ? "%" : ` ${value.unit ?? ""}`;
  return `${value.value}${unit}`;
}

export function acceptedSnapshotLabel(evaluation: RuleEvaluation): string {
  const effectiveDate = evaluation.evidence.effective_date;
  if (effectiveDate) {
    const date = new Date(`${effectiveDate}T00:00:00Z`);
    const formatted = new Intl.DateTimeFormat("en-GB", {
      day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
    }).format(date);
    return `Accepted snapshot · version in force ${formatted}`;
  }
  return `Accepted snapshot · ${evaluation.evidence.source_version ?? evaluation.evidence.document_revision ?? "version recorded in baseline"}`;
}

function stripStructuralMarker(value: unknown): string {
  if (value == null || value === "") return "—";
  const text = typeof value === "string" ? value : String(value);
  return text.replace(/^\[parent\]\s?/, "") || "—";
}

function parseConcentration(value: unknown): RuleConcentration | null {
  const text = stripStructuralMarker(value);
  if (!text.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed as RuleConcentration : null;
  } catch {
    return null;
  }
}

export interface ComparisonRow {
  field: string;
  acd: string;
  singapore: string;
}

export function comparisonRows(reference: CrossReference): ComparisonRow[] {
  const rows: ComparisonRow[] = [];
  for (const [field, rawDifference] of Object.entries(reference.field_differences)) {
    const difference = rawDifference && typeof rawDifference === "object"
      ? rawDifference as { acd?: unknown; singapore?: unknown }
      : { acd: rawDifference, singapore: rawDifference };
    if (field === "concentration") {
      const acd = parseConcentration(difference.acd);
      const singapore = parseConcentration(difference.singapore);
      if (acd && singapore) {
        rows.push(
          { field: "Maximum concentration", acd: formatRuleConcentration(acd), singapore: formatRuleConcentration(singapore) },
          { field: "Comparator", acd: comparatorLabel(acd.comparator), singapore: comparatorLabel(singapore.comparator) },
          { field: "Concentration basis", acd: basisLabel(acd.basis), singapore: basisLabel(singapore.basis) },
          { field: "Preparation stage", acd: preparationStageLabel(acd.preparation_stage), singapore: preparationStageLabel(singapore.preparation_stage) },
        );
        continue;
      }
    }
    rows.push({
      field: fieldLabels[field] ?? readableCode(field),
      acd: stripStructuralMarker(difference.acd),
      singapore: stripStructuralMarker(difference.singapore),
    });
  }
  return rows;
}

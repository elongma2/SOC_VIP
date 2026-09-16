import type { Finding, IngredientResult, RuleEvaluation } from "../types/screening";

export const findingPresentation: Record<Finding, { label: string; tone: string; dot: string }> = {
  prohibited_substance_identified: {
    label: "Prohibited-list substance identified",
    tone: "text-red-700 bg-red-50 border-red-200",
    dot: "bg-red-600",
  },
  restriction_exceeded: {
    label: "Limit exceeded",
    tone: "text-red-700 bg-red-50 border-red-200",
    dot: "bg-red-600",
  },
  restriction_within_limit: {
    label: "Within limit",
    tone: "text-emerald-700 bg-emerald-50 border-emerald-200",
    dot: "bg-emerald-600",
  },
  professional_review_required: {
    label: "Professional review required",
    tone: "text-amber-800 bg-amber-50 border-amber-200",
    dot: "bg-amber-500",
  },
  information_missing: {
    label: "Information missing",
    tone: "text-amber-800 bg-amber-50 border-amber-200",
    dot: "bg-amber-500",
  },
  identity_unresolved: {
    label: "Identity unresolved",
    tone: "text-slate-700 bg-slate-100 border-slate-200",
    dot: "bg-slate-500",
  },
  no_issue_identified_within_scoped_rules: {
    label: "No issue identified within scoped rules",
    tone: "text-emerald-700 bg-emerald-50 border-emerald-200",
    dot: "bg-emerald-600",
  },
};

export const adversePrimaryFindings = new Set<Finding>([
  "prohibited_substance_identified",
  "restriction_exceeded",
  "professional_review_required",
  "information_missing",
  "identity_unresolved",
]);

const confirmedPrecedence: Finding[] = [
  "prohibited_substance_identified",
  "restriction_exceeded",
  "restriction_within_limit",
  "information_missing",
  "no_issue_identified_within_scoped_rules",
];

export function isSingaporeEvaluation(evaluation: RuleEvaluation): boolean {
  return ["Third Schedule Part I", "Third Schedule Part II"].includes(
    evaluation.evidence.regulatory_section,
  );
}

export function supportingSingaporeEvaluations(result: IngredientResult): RuleEvaluation[] {
  const singapore = result.rule_evaluations.filter(isSingaporeEvaluation);
  const primary = singapore.filter(
    (evaluation) => evaluation.evaluation_status !== "withheld" && evaluation.finding === result.primary_finding,
  );
  if (primary.length) return primary;

  for (const finding of confirmedPrecedence) {
    if (!result.confirmed_findings.includes(finding)) continue;
    const matches = singapore.filter(
      (evaluation) => evaluation.evaluation_status === "deterministic" && evaluation.finding === finding,
    );
    if (matches.length) return matches;
  }
  return [];
}

export function regulationLabel(evaluation: RuleEvaluation): string | null {
  const provision = evaluation.evidence.regulation_6_provisions.find(
    (item) => item.paragraph === "1" || item.paragraph === "2",
  );
  return provision ? `Regulation 6(${provision.paragraph})` : null;
}

export function formatConcentration(value: IngredientResult["submitted_ingredient"]["concentration"]): string {
  if (!value) return "—";
  const unit = value.unit === "percent" ? "%" : ` ${value.unit}`;
  return `${value.value}${unit}`;
}

export function humanizeCode(value: string): string {
  return value.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}

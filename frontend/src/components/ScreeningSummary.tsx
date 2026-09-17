import { ChevronRight } from "lucide-react";
import { displayIngredientName, formatRuleConcentration, reviewReasonLabel } from "../lib/presentation";
import {
  adversePrimaryFindings,
  findingPresentation,
  formatConcentration,
  supportingSingaporeEvaluations,
} from "../lib/screening";
import type { Finding, FormulationSummary, IngredientResult } from "../types/screening";

const primaryCards: Array<{ key: keyof FormulationSummary; label: string; tone: string }> = [
  { key: "prohibited_substance_identified", label: "Prohibited-list substance", tone: "bg-red-600" },
  { key: "restriction_exceeded", label: "Limit exceeded", tone: "bg-red-600" },
  { key: "professional_review_required", label: "Needs human review", tone: "bg-amber-500" },
  { key: "identity_unresolved", label: "Identity unresolved", tone: "bg-slate-500" },
];

const deterministicFindings = new Set<Finding>([
  "prohibited_substance_identified",
  "restriction_exceeded",
  "restriction_within_limit",
]);

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function firstReadableReason(result: IngredientResult): string | null {
  const reason = result.review_reasons[0]
    ?? result.rule_evaluations.flatMap((evaluation) => evaluation.reasons)[0]
    ?? result.identity.reasons[0];
  return reason ? reviewReasonLabel(reason) : null;
}

function attentionDescription(result: IngredientResult): string {
  const evaluation = supportingSingaporeEvaluations(result)[0];
  const readableReason = firstReadableReason(result);
  const reviewSuffix = result.review_required && readableReason ? ` · Review: ${readableReason}` : "";

  if (result.primary_finding === "prohibited_substance_identified" && evaluation) {
    return `Prohibited-list substance identified · ${evaluation.evidence.regulatory_section} · ${evaluation.evidence.reference_number}${reviewSuffix}`;
  }
  if (result.primary_finding === "restriction_exceeded" && evaluation) {
    return `Submitted ${formatConcentration(result.submitted_ingredient.concentration)} · Singapore maximum ${formatRuleConcentration(evaluation.evidence.concentration)}${reviewSuffix}`;
  }
  if (result.primary_finding === "identity_unresolved") {
    return `Identity unresolved${readableReason ? ` · ${readableReason}` : result.review_required ? " · Human review required" : ""}`;
  }
  if (result.primary_finding === "information_missing") {
    return `Information missing${readableReason ? ` · ${readableReason}` : ""}`;
  }
  if (result.primary_finding === "professional_review_required") {
    return `Human review needed${readableReason ? ` · ${readableReason}` : ""}`;
  }
  return `${findingPresentation[result.primary_finding].label}${readableReason ? ` · ${readableReason}` : " · Human review required"}`;
}

export function ScreeningSummary({
  summary,
  results,
  selectedRow,
  onSelect,
}: {
  summary: FormulationSummary;
  results: IngredientResult[];
  selectedRow: number | null;
  onSelect: (row: number) => void;
}) {
  const attentionResults = results.filter(
    (result) => adversePrimaryFindings.has(result.primary_finding) || result.review_required,
  );
  const reviewResults = results.filter((result) => result.review_required);
  const deterministicCount = results.filter((result) => deterministicFindings.has(result.primary_finding)).length;

  return (
    <section aria-labelledby="summary-heading">
      <div className="mb-4">
        <p className="eyebrow">Screening results</p>
        <h2 id="summary-heading" className="text-xl font-semibold tracking-tight text-slate-950">
          {attentionResults.length} of {summary.ingredients_submitted} {summary.ingredients_submitted === 1 ? "ingredient requires" : "ingredients require"} attention
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {plural(deterministicCount, "deterministic regulatory finding")} · {plural(summary.identity_unresolved, "unresolved identity", "unresolved identities")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {primaryCards.map((card) => (
          <div className="summary-card" key={card.key}>
            <span className={`h-2 w-2 rounded-full ${card.tone}`} />
            <strong>{summary[card.key] as number}</strong>
            <span>{card.label}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500" aria-label="Secondary finding counts">
        <span><strong className="text-slate-700">{summary.restriction_within_limit}</strong> within limit</span>
        <span><strong className="text-slate-700">{summary.information_missing}</strong> information missing</span>
        <span><strong className="text-slate-700">{summary.no_issue_identified_within_scoped_rules}</strong> no scoped issue</span>
      </div>

      <div className="summary-detail-grid">
        <section className="summary-detail-section" aria-labelledby="human-review-heading">
          <h3 id="human-review-heading">Human review</h3>
          {reviewResults.length ? (
            <>
              <p className="summary-detail-lead">
                {plural(summary.total_requiring_review, "ingredient requires", "ingredients require")} human review
              </p>
              <ul className="summary-action-list">
                {reviewResults.map((result) => (
                  <li key={result.submitted_row_number}>
                    <button type="button" onClick={() => onSelect(result.submitted_row_number)} aria-pressed={selectedRow === result.submitted_row_number}>
                      <span>
                        <strong>{displayIngredientName(result)}</strong>
                        <small>{firstReadableReason(result) ?? findingPresentation[result.primary_finding].label}</small>
                      </span>
                      <ChevronRight size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="summary-detail-lead text-slate-500">No ingredients currently require manual review.</p>
          )}
        </section>

        <section className="summary-detail-section" aria-labelledby="attention-heading">
          <h3 id="attention-heading">What needs attention</h3>
          {attentionResults.length ? (
            <ul className="summary-action-list">
              {attentionResults.map((result) => (
                <li key={result.submitted_row_number}>
                  <button type="button" onClick={() => onSelect(result.submitted_row_number)} aria-pressed={selectedRow === result.submitted_row_number}>
                    <span>
                      <strong>{displayIngredientName(result)}</strong>
                      <small>{attentionDescription(result)}</small>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="summary-detail-lead text-slate-500">No ingredient rows currently require attention.</p>
          )}
        </section>
      </div>

      {summary.duplicate_row_groups.length > 0 ? (
        <p className="mt-3 border-l-2 border-amber-400 pl-3 text-xs text-slate-600">
          Duplicate submitted rows retained: {summary.duplicate_row_groups.map((rows) => rows.join(", ")).join(" · ")}
        </p>
      ) : null}
    </section>
  );
}

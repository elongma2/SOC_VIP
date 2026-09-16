import type { FormulationSummary } from "../types/screening";

const primaryCards: Array<{ key: keyof FormulationSummary; label: string; tone: string }> = [
  { key: "prohibited_substance_identified", label: "Prohibited", tone: "bg-red-600" },
  { key: "restriction_exceeded", label: "Limit exceeded", tone: "bg-red-600" },
  { key: "total_requiring_review", label: "Review required", tone: "bg-amber-500" },
  { key: "total_unresolved_identities", label: "Unresolved", tone: "bg-slate-500" },
];

export function ScreeningSummary({ summary, attentionCount }: { summary: FormulationSummary; attentionCount: number }) {
  return (
    <section aria-labelledby="summary-heading">
      <div className="mb-4">
        <p className="eyebrow">Screening results</p>
        <h2 id="summary-heading" className="text-xl font-semibold tracking-tight text-slate-950">
          {attentionCount} {attentionCount === 1 ? "ingredient requires" : "ingredients require"} attention
        </h2>
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
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
        <span><strong className="text-slate-700">{summary.restriction_within_limit}</strong> within limit</span>
        <span><strong className="text-slate-700">{summary.information_missing}</strong> information missing</span>
        <span><strong className="text-slate-700">{summary.professional_review_required}</strong> professional review finding</span>
        <span><strong className="text-slate-700">{summary.no_issue_identified_within_scoped_rules}</strong> no scoped issue</span>
      </div>
      {summary.duplicate_row_groups.length > 0 && (
        <p className="mt-3 border-l-2 border-amber-400 pl-3 text-xs text-slate-600">
          Duplicate submitted rows retained: {summary.duplicate_row_groups.map((rows) => rows.join(", ")).join(" · ")}
        </p>
      )}
    </section>
  );
}

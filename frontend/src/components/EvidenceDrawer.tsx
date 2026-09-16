import { ExternalLink, X } from "lucide-react";
import { FindingBadge } from "./FindingBadge";
import { SourceEvidence } from "./SourceEvidence";
import {
  basisLabel,
  comparatorLabel,
  comparisonRows,
  displayIngredientName,
  formatRuleConcentration,
  matchMethodLabel,
  preparationStageLabel,
  readableCode,
  reviewReasonLabel,
  reviewTypeLabel,
} from "../lib/presentation";
import {
  formatConcentration,
  isSingaporeEvaluation,
  regulationLabel,
} from "../lib/screening";
import type { IngredientResult, RuleEvaluation, SourceSnapshot } from "../types/screening";

function concentrationComparison(evaluation: RuleEvaluation) {
  const submitted = evaluation.submitted_concentration;
  const limit = evaluation.evidence.concentration;
  if (
    evaluation.evaluation_status !== "deterministic" ||
    !["restriction_exceeded", "restriction_within_limit"].includes(evaluation.finding ?? "") ||
    !submitted || !limit || typeof limit.value !== "number" ||
    submitted.unit !== limit.unit || submitted.basis !== (limit.basis ?? null) ||
    submitted.preparation_stage !== limit.preparation_stage ||
    limit.comparator !== "less_than_or_equal"
  ) return null;
  return { submitted, limit, difference: submitted.value - limit.value };
}

function ConcentrationComparison({ evaluation }: { evaluation: RuleEvaluation }) {
  const comparison = concentrationComparison(evaluation);
  if (!comparison) return null;
  return (
    <div className="comparison-panel mt-3" aria-label="Concentration comparison">
      <div><span>Submitted concentration</span><strong>{formatConcentration(comparison.submitted)}</strong></div>
      <div><span>Singapore maximum</span><strong>{formatRuleConcentration(comparison.limit)}</strong></div>
      <div className="comparison-total">
        <span>Difference</span>
        <strong className={comparison.difference > 0 ? "text-red-700" : "text-emerald-700"}>
          {comparison.difference > 0 ? "+" : ""}{comparison.difference.toFixed(2)} {comparison.limit.unit === "percent" ? "percentage points" : comparison.limit.unit}
        </strong>
      </div>
    </div>
  );
}

export function EvidenceDrawer({
  result,
  sources,
  onClose,
}: {
  result: IngredientResult | null;
  sources: SourceSnapshot[];
  onClose: () => void;
}) {
  if (!result) return null;
  const singapore = result.rule_evaluations.filter(isSingaporeEvaluation);
  const acdCandidates = result.identity.acd_candidates;
  const sourceIdentifiers = [
    ...acdCandidates.flatMap((candidate) => candidate.cas_numbers.map((cas) => ({ cas, section: candidate.regulatory_section }))),
    ...result.rule_evaluations.flatMap((evaluation) =>
      evaluation.evidence.acd_counterpart_rules.flatMap((counterpart) =>
        counterpart.cas_numbers.map((cas) => ({ cas, section: counterpart.regulatory_section })),
      ),
    ),
  ].filter((value, index, all) => all.findIndex((item) => item.cas === value.cas && item.section === value.section) === index);
  const crossReferences = result.rule_evaluations.flatMap((evaluation) => evaluation.evidence.cross_references)
    .filter((reference, index, all) => all.findIndex((item) => item.cross_reference_id === reference.cross_reference_id) === index);
  const counterparts = result.rule_evaluations.flatMap((evaluation) => evaluation.evidence.acd_counterpart_rules)
    .filter((counterpart, index, all) => all.findIndex((item) => item.rule_id === counterpart.rule_id) === index);
  const readableReasons = [...new Set(result.review_reasons.map(reviewReasonLabel))];

  return (
    <>
      <button className="drawer-backdrop" onClick={onClose} aria-label="Close evidence" />
      <aside className="evidence-drawer" role="dialog" aria-modal="true" aria-label="Regulatory evidence">
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-5 backdrop-blur">
          <button className="icon-button absolute right-4 top-4" onClick={onClose} aria-label="Close evidence drawer"><X size={18} /></button>
          <p className="eyebrow">Ingredient evidence</p>
          <h2 className="pr-10 text-xl font-semibold tracking-tight text-slate-950">{displayIngredientName(result)}</h2>
          <div className="mt-3"><FindingBadge finding={result.primary_finding} /></div>
        </div>

        <div className="space-y-7 px-5 py-5">
          <section>
            <h3 className="drawer-title">Submitted information</h3>
            <div className="metadata-grid mt-3">
              <span>Submitted name</span><strong>{result.submitted_ingredient.name}</strong>
              <span>Submitted CAS</span><strong>{result.submitted_ingredient.cas_number ?? "—"}</strong>
              <span>Concentration</span><strong>{formatConcentration(result.submitted_ingredient.concentration)}</strong>
              <span>Product context</span><strong>{result.submitted_product_context ?? "—"}</strong>
              {result.submitted_ingredient.concentration && <>
                <span>Preparation stage</span><strong>{preparationStageLabel(result.submitted_ingredient.concentration.preparation_stage)}</strong>
                <span>Basis</span><strong>{basisLabel(result.submitted_ingredient.concentration.basis)}</strong>
              </>}
            </div>
            {sourceIdentifiers.length > 0 && (
              <div className="mt-4 border-l-2 border-slate-300 pl-3 text-sm text-slate-700">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Source-backed identifier</div>
                {sourceIdentifiers.map((identifier) => (
                  <div key={`${identifier.cas}-${identifier.section}`} className="mt-1">
                    CAS {identifier.cas} · {identifier.section.replace("Part 1", "").trim()}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h3 className="drawer-title">Screening result</h3>
            <div className="metadata-grid mt-3">
              <span>Identity</span><strong>{readableCode(result.identity.status)}</strong>
              <span>Match method</span><strong>{result.identity.match_methods.map(matchMethodLabel).join(", ") || "—"}</strong>
              <span>Confirmed</span><strong>{result.confirmed_findings.map(readableCode).join(", ") || "—"}</strong>
              <span>Review required</span><strong>{result.review_required ? "Yes" : "No"}</strong>
              {result.review_required && <><span>Review type</span><strong>{result.review_types.map(reviewTypeLabel).join(", ")}</strong></>}
            </div>
            {result.review_required && (
              <div className="review-panel mt-4">
                <h4 className="font-semibold text-amber-950">Professional review needed</h4>
                <p className="mt-1 text-xs text-amber-800">Automation stopped or retained a review flag because:</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-950">
                  {readableReasons.map((reason) => <li key={reason}>{reason}</li>)}
                </ul>
                {result.review_reasons.includes("catalogue_identity_singapore_linkage_unresolved") && (
                  <p className="mt-3 text-sm text-amber-950">
                    The ingredient name is recognised in the EU glossary, but this identity has not yet been verified against the Singapore regulatory dataset.
                  </p>
                )}
              </div>
            )}
          </section>

          {result.identity.catalogue_identity && (
            <section>
              <h3 className="drawer-title">Ingredient identity catalogue</h3>
              <div className="evidence-card">
                <div className="metadata-grid">
                  <span>Recognised name</span><strong>{result.identity.catalogue_identity.canonical_name}</strong>
                  <span>Identity source</span><strong>{result.identity.catalogue_identity.source_name}</strong>
                  <span>EU entry</span><strong>{result.identity.catalogue_identity.source_entries.join(", ")}</strong>
                  <span>Source page</span><strong>{result.identity.catalogue_identity.source_pages.join(", ")}</strong>
                </div>
                <p className="mt-4 text-xs leading-5 text-slate-600">
                  Catalogue recognition confirms the ingredient name only. It does not establish Singapore permission, safety, or regulatory status.
                </p>
                <a className="source-link" href={result.identity.catalogue_identity.source_url} target="_blank" rel="noreferrer">
                  Open identity source <ExternalLink size={14} />
                </a>
              </div>
            </section>
          )}

          {result.identity.catalogue_identity && (
            <section>
              <h3 className="drawer-title">Singapore linkage</h3>
              <div className="evidence-card">
                {result.identity.singapore_linkage_status === "linked" && <>
                  <strong className="text-slate-950">Linked to Singapore regulatory identity</strong>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    This reviewed catalogue identity is linked to the Singapore records shown below. Existing Singapore rule logic remains controlling.
                  </p>
                </>}
                {result.identity.singapore_linkage_status === "verified_not_represented" && <>
                  <strong className="text-slate-950">Verified for current screening scope</strong>
                  <div className="metadata-grid mt-3">
                    <span>Scope checked</span><strong>{result.identity.linkage_evidence?.screened_scope.join(" · ")}</strong>
                    <span>Singapore baseline</span><strong>{result.identity.linkage_evidence?.singapore_regulatory_baseline}</strong>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{result.scope_note}</p>
                </>}
                {result.identity.singapore_linkage_status === "unresolved" && <>
                  <strong className="text-amber-900">Needs verification</strong>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    The recognised catalogue identity has not been verified against the active Singapore screening scope.
                  </p>
                  {result.identity.linkage_evidence?.inapplicability_reasons.map((reason) => (
                    <p className="mt-2 text-xs text-amber-800" key={reason}>{reason}</p>
                  ))}
                </>}
              </div>
            </section>
          )}

          <section>
            <h3 className="drawer-title">Regulatory basis</h3>
            {singapore.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No Singapore rule evaluated.</p>
            ) : singapore.map((evaluation) => (
              <article className="evidence-card" key={evaluation.rule_id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-slate-900">{evaluation.evidence.regulatory_section}</div>
                    <div className="mt-1 text-sm text-slate-600">
                      Reference {evaluation.evidence.reference_number}
                      {regulationLabel(evaluation) ? ` · ${regulationLabel(evaluation)}` : ""}
                    </div>
                  </div>
                  <span className="quiet-badge">{readableCode(evaluation.evaluation_status)}</span>
                </div>
                <div className="metadata-grid mt-4">
                  <span>Source substance</span><strong className="whitespace-pre-wrap">{evaluation.evidence.substance_name}</strong>
                  <span>Applicable context</span><strong>{evaluation.evidence.product_context ?? "—"}</strong>
                  <span>Limit</span><strong>{formatRuleConcentration(evaluation.evidence.concentration)}</strong>
                  {evaluation.evidence.concentration && <>
                    <span>Comparator</span><strong>{comparatorLabel(evaluation.evidence.concentration.comparator)}</strong>
                    <span>Basis</span><strong>{basisLabel(evaluation.evidence.concentration.basis)}</strong>
                    <span>Stage</span><strong>{preparationStageLabel(evaluation.evidence.concentration.preparation_stage)}</strong>
                  </>}
                </div>
                <ConcentrationComparison evaluation={evaluation} />
                <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Original source wording</div>
                <blockquote className="source-quote">{evaluation.evidence.source_text}</blockquote>
                {evaluation.evidence.other_conditions && <p className="mt-3 text-sm"><strong>Other requirements:</strong> {evaluation.evidence.other_conditions}</p>}
                {evaluation.evidence.required_warning && <p className="mt-2 text-sm"><strong>Required warning:</strong> {evaluation.evidence.required_warning}</p>}
              </article>
            ))}
          </section>

          {singapore.length > 0 && (
            <section>
              <h3 className="drawer-title">Accepted snapshot evidence</h3>
              {singapore.map((evaluation) => (
                <SourceEvidence
                  key={evaluation.rule_id}
                  evaluation={evaluation}
                  source={sources.find((source) => source.source_document === evaluation.evidence.source_document)}
                />
              ))}
            </section>
          )}

          {(crossReferences.length > 0 || counterparts.length > 0 || acdCandidates.length > 0) && (
            <details className="acd-details">
              <summary>ACD comparison</summary>
              <div className="mt-4 space-y-5">
                {crossReferences.map((reference) => {
                  const rows = comparisonRows(reference);
                  return (
                    <article key={reference.cross_reference_id} className="text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <strong>ACD reference {reference.reference_number}</strong>
                        <span className="quiet-badge">{readableCode(reference.comparison_status)}</span>
                      </div>
                      {rows.length > 0 && (
                        <div className="acd-comparison-table mt-3">
                          <div className="acd-comparison-head"><span>Field</span><span>ASEAN ACD</span><span>Singapore</span></div>
                          {rows.map((row, index) => (
                            <div className="acd-comparison-row" key={`${row.field}-${index}`}>
                              <strong>{row.field}</strong><span>{row.acd}</span><span>{row.singapore}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {reference.review_reasons.map((reason) => <p className="mt-2 text-amber-800" key={reason}>{reviewReasonLabel(reason)}</p>)}
                    </article>
                  );
                })}
                {counterparts.map((counterpart) => (
                  <article key={counterpart.rule_id} className="border-t border-slate-200 pt-4 text-sm text-slate-600">
                    <strong className="text-slate-800">{counterpart.regulatory_section} · Ref {counterpart.reference_number}</strong>
                    <p className="mt-1">{counterpart.source_version}</p>
                    <p className="mt-2 whitespace-pre-wrap text-xs leading-5">{counterpart.source_text}</p>
                    <a className="source-link" href={counterpart.source_url} target="_blank" rel="noreferrer">View ACD source <ExternalLink size={14} /></a>
                  </article>
                ))}
              </div>
            </details>
          )}

          {result.identity.linkage_evidence && (
            <details className="acd-details">
              <summary>Technical provenance</summary>
              <div className="metadata-grid mt-4">
                <span>Linkage ID</span><strong>{result.identity.linkage_evidence.linkage_id}</strong>
                <span>Accepted status</span><strong>{readableCode(result.identity.linkage_evidence.accepted_status)}</strong>
                <span>Applicable now</span><strong>{result.identity.linkage_evidence.applicable_to_active_baseline ? "Yes" : "No"}</strong>
                <span>Identity dataset</span><strong>{result.identity.linkage_evidence.identity_dataset_version}</strong>
                <span>Identity hash</span><strong className="break-all">{result.identity.linkage_evidence.identity_dataset_hash}</strong>
                <span>Singapore baseline</span><strong>{result.identity.linkage_evidence.singapore_regulatory_baseline}</strong>
                <span>Regulatory hash</span><strong className="break-all">{result.identity.linkage_evidence.singapore_regulatory_baseline_hash}</strong>
                <span>Reviewer</span><strong>{result.identity.linkage_evidence.review.reviewer}</strong>
                <span>Reviewed at</span><strong>{result.identity.linkage_evidence.review.reviewed_at}</strong>
                <span>Review basis</span><strong>{result.identity.linkage_evidence.review.review_basis}</strong>
                <span>Notes</span><strong>{result.identity.linkage_evidence.review.notes || "—"}</strong>
              </div>
              {result.identity.linkage_evidence.singapore_targets.length > 0 && (
                <div className="mt-4 space-y-2 text-xs text-slate-600">
                  {result.identity.linkage_evidence.singapore_targets.map((target) => (
                    <div className="rounded border border-slate-200 p-3" key={target.rule_id}>
                      <strong className="text-slate-800">{target.part} · Ref {target.reference}</strong>
                      <div className="mt-1 whitespace-pre-wrap">{target.source_substance_name}</div>
                      <div className="mt-1 break-all">{target.raw_record_id} · {target.rule_id}</div>
                    </div>
                  ))}
                </div>
              )}
            </details>
          )}

        </div>
      </aside>
    </>
  );
}

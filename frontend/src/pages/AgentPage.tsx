import { AlertTriangle, Check, FileUp, LoaderCircle, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { answerAgentQuestions, prepareAgentFormulation, retryAgentSession, uploadAgentCSV } from "../api/agent";
import { ApiError, getScreeningOptions, screenFormulation } from "../api/screening";
import { EvidenceDrawer } from "../components/EvidenceDrawer";
import { HelpHint } from "../components/HelpHint";
import { ScreeningResultsPanel } from "../components/ScreeningResultsPanel";
import { adversePrimaryFindings } from "../lib/screening";
import type { AgentPreparedFormulation, AgentQuestion, AgentSession, InputProvenance } from "../types/agent";
import type { ConcentrationBasis, ConcentrationUnit, PreparationStage, ScreeningOptions, ScreeningResponse } from "../types/screening";

interface RowDraft {
  name: string;
  cas: string;
  value: string;
  unit: ConcentrationUnit | "";
  basis: ConcentrationBasis | null;
  stage: PreparationStage | "";
}

function optional(value: string): string | null {
  return value.trim() || null;
}

function rowDrafts(session: AgentSession): Record<string, RowDraft> {
  return Object.fromEntries(session.interpreted_rows.map((row) => [row.row_id, {
    name: String(row.name.value ?? ""),
    cas: String(row.cas_number?.value ?? ""),
    value: row.concentration?.value?.value == null ? "" : String(row.concentration.value.value),
    unit: row.concentration?.unit?.value ?? "",
    basis: row.concentration?.basis.value ?? null,
    stage: row.concentration?.preparation_stage?.value ?? "",
  }]));
}

export function AgentPage() {
  const fileInput = useRef<HTMLInputElement>(null);
  const initializedSessionId = useRef<string | null>(null);
  const [session, setSession] = useState<AgentSession | null>(null);
  const [prepared, setPrepared] = useState<AgentPreparedFormulation | null>(null);
  const [options, setOptions] = useState<ScreeningOptions | null>(null);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [formulationId, setFormulationId] = useState("");
  const [formulationName, setFormulationName] = useState("");
  const [productContext, setProductContext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<ScreeningResponse | null>(null);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [manualValues, setManualValues] = useState<Record<string, { value: string; unit: ConcentrationUnit; stage: PreparationStage }>>({});
  const [retrying, setRetrying] = useState(false);
  const [highlightedRow, setHighlightedRow] = useState<string | null>(null);
  const [highlightedQuestion, setHighlightedQuestion] = useState<string | null>(null);

  useEffect(() => { getScreeningOptions().then(setOptions).catch(() => setError("Unable to load screening options.")); }, []);
  useEffect(() => {
    if (!session) return;
    setDrafts(rowDrafts(session));
    if (initializedSessionId.current !== session.session_id) {
      initializedSessionId.current = session.session_id;
      setFormulationId(typeof session.formulation_id?.value === "string" ? session.formulation_id.value : "");
      setFormulationName(typeof session.formulation_name?.value === "string" ? session.formulation_name.value : "");
    }
    setProductContext(typeof session.product_context?.value === "string" ? session.product_context.value : "");
  }, [session]);

  const upload = async (file?: File) => {
    if (!file || busy) return;
    setBusy(true); setError(null); setPrepared(null); setResponse(null); setSelectedRow(null); setProductContext(""); setFormulationId(""); setFormulationName("");
    try { setSession(await uploadAgentCSV(file)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "The CSV could not be uploaded."); }
    finally { setBusy(false); }
  };

  const answer = async (question: AgentQuestion, optionId: string) => {
    if (!session || busy) return;
    let value: unknown;
    if (question.question_type === "non_numeric_concentration" && optionId === "enter_manually") {
      const manual = manualValues[question.question_id] ?? { value: "", unit: "percent", stage: "finished_product" };
      const numeric = Number(manual.value);
      if (!Number.isFinite(numeric) || numeric < 0) { setError("Enter a non-negative numeric concentration."); return; }
      value = { value: numeric, unit: manual.unit, basis: null, preparation_stage: manual.stage };
    }
    setBusy(true); setError(null);
    try { setSession(await answerAgentQuestions(session, [{ question_id: question.question_id, option_id: optionId, value }])); setPrepared(null); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "The answer could not be applied."); }
    finally { setBusy(false); }
  };

  const changeProductContext = async (value: string) => {
    setProductContext(value);
    const contextQuestion = session?.questions.find((question) => question.question_type === "product_context") ?? null;
    if (!contextQuestion) return;
    const option = contextQuestion.options.find((item) => item.value === (value || null));
    if (option) await answer(contextQuestion, option.option_id);
  };

  const saveRow = async (rowId: string, draft: RowDraft, field: "name" | "cas" | "concentration") => {
    if (!session || busy) return;
    const update = field === "name"
      ? { row_id: rowId, name: draft.name }
      : field === "cas"
        ? { row_id: rowId, cas_number: draft.cas }
        : (() => {
            if (!draft.value.trim()) { setError("Enter a numeric concentration or use Leave unavailable in its clarification card."); return null; }
            const parsed = Number(draft.value);
            if (!Number.isFinite(parsed) || parsed < 0) { setError("Concentration edits must be non-negative numbers."); return null; }
            return {
              row_id: rowId,
              concentration_value: parsed,
              concentration_unit: draft.unit || null,
              concentration_basis: draft.basis,
              preparation_stage: draft.stage || null,
            };
          })();
    if (!update) return;
    setBusy(true); setError(null);
    try { setSession(await answerAgentQuestions(session, [], [update])); setPrepared(null); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Row edits could not be saved."); }
    finally { setBusy(false); }
  };

  const focusRow = (rowId: string, targetField?: AgentQuestion["target_field"]) => {
    const element = document.getElementById(`agent-row-${rowId}`);
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedRow(rowId);
    window.setTimeout(() => setHighlightedRow((current) => current === rowId ? null : current), 1400);
    const selector = targetField === "ingredient_name" ? "input[data-agent-field='ingredient_name']" : targetField === "concentration.unit" ? "select[data-agent-field='concentration.unit']" : targetField === "preparation_stage" ? "select[data-agent-field='preparation_stage']" : "input, select";
    window.setTimeout(() => element?.querySelector<HTMLElement>(selector)?.focus(), 250);
  };

  const focusQuestion = (questionId: string) => {
    const element = document.getElementById(`agent-question-${questionId}`);
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedQuestion(questionId);
    window.setTimeout(() => setHighlightedQuestion((current) => current === questionId ? null : current), 1400);
  };

  const prepare = async () => {
    if (!session || busy) return;
    setBusy(true); setError(null);
    try {
      const next = await prepareAgentFormulation(session, {
        formulation_id: optional(formulationId), formulation_name: optional(formulationName), product_context: optional(productContext),
      });
      setPrepared(next); setSession(next.session);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The formulation could not be prepared."); }
    finally { setBusy(false); }
  };

  const screenPrepared = async () => {
    if (!prepared || busy) return;
    setBusy(true); setError(null);
    try {
      const next = await screenFormulation(prepared.formulation);
      setResponse(next);
      const first = next.ingredient_results.find((item) => adversePrimaryFindings.has(item.primary_finding) || item.review_required) ?? next.ingredient_results[0];
      setSelectedRow(first?.submitted_row_number ?? null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Screening failed.");
    } finally { setBusy(false); }
  };

  const retry = async () => {
    if (!session || busy) return;
    setBusy(true); setRetrying(true); setError(null);
    try { setSession(await retryAgentSession(session.session_id)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Retry failed."); }
    finally { setBusy(false); setRetrying(false); }
  };

  const startNewCSV = () => {
    if (busy) return;
    initializedSessionId.current = null;
    if (fileInput.current) fileInput.current.value = "";
    setSession(null);
    setPrepared(null);
    setResponse(null);
    setSelectedRow(null);
    setDrafts({});
    setFormulationId("");
    setFormulationName("");
    setProductContext("");
    setManualValues({});
    setRetrying(false);
    setHighlightedRow(null);
    setHighlightedQuestion(null);
    setError(null);
  };

  const selectedResult = response?.ingredient_results.find((item) => item.submitted_row_number === selectedRow) ?? null;
  const provenance: InputProvenance | null = selectedRow && prepared ? (() => {
    const row = prepared.row_provenance[selectedRow - 1];
    return row ? {
      filename: prepared.session.filename,
      sourceRow: row.source_row,
      sourceRows: row.source_rows,
      originalValue: row.name.source_value,
      interpretedValue: String(row.name.value),
      method: row.name.interpretation_method,
      confirmedByUser: row.name.confirmed_by_user,
      sourceMetadata: row.source_metadata,
    } : null;
  })() : null;
  const contextQuestion = session?.questions.find((question) => question.question_type === "product_context") ?? null;
  const clarificationQuestions = session?.questions.filter((question) => question.question_type !== "product_context") ?? [];
  const stageQuestion = session?.questions.find((question) => question.question_type === "preparation_stage") ?? null;
  const blockingItems = session?.questions.flatMap((question) => {
    if (question.row_id) {
      const row = session.interpreted_rows.find((item) => item.row_id === question.row_id);
      return row ? [`Row ${row.source_row} · ${row.name.source_value ?? row.name.value} · ${question.title.toLocaleLowerCase()}`] : [];
    }
    if (question.affected_row_ids.length) return question.affected_row_ids.flatMap((rowId) => {
      const row = session.interpreted_rows.find((item) => item.row_id === rowId);
      return row ? [`Row ${row.source_row} · ${row.name.source_value ?? row.name.value} · ${question.title.toLocaleLowerCase()}`] : [];
    });
    return [question.title];
  }) ?? [];
  const rowsNeedingConfirmation = new Set(session?.questions.flatMap((question) => question.row_id ? [question.row_id] : question.affected_row_ids) ?? []);

  return (
    <div className={`workspace ${selectedResult ? "workspace-with-drawer" : ""}`}>
      <main className="min-w-0 px-5 py-7 md:px-8 lg:px-10">
        <header className="mb-7">
          <p className="eyebrow">Formulation agent</p>
          <h1 className="page-title">Turn a formulation file into screening input</h1>
          <p className="mt-2 text-sm text-slate-600">AI interprets the CSV structure. The existing deterministic engine performs regulatory screening only after your confirmation.</p>
        </header>

        {error && <div className="mb-5 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="alert"><AlertTriangle size={16} />{error}</div>}

        {!session && (
          <section
            className="agent-dropzone"
            onDragOver={(event) => { event.preventDefault(); event.currentTarget.classList.add("is-dragging"); }}
            onDragLeave={(event) => event.currentTarget.classList.remove("is-dragging")}
            onDrop={(event) => { event.preventDefault(); event.currentTarget.classList.remove("is-dragging"); void upload(event.dataTransfer.files[0]); }}
          >
            {busy ? <LoaderCircle className="animate-spin text-slate-500" size={34} /> : <FileUp className="text-slate-500" size={34} />}
            <h2>{busy ? "Interpreting formulation" : "Drop formulation CSV here"}</h2>
            <p>{busy ? "Regulens is identifying the formulation structure and ingredient fields." : "or"}</p>
            <button className="secondary-button" type="button" onClick={() => fileInput.current?.click()} disabled={busy}>Browse files</button>
            <input ref={fileInput} className="sr-only" type="file" accept=".csv,text/csv" aria-label="Choose formulation CSV" onChange={(event) => void upload(event.target.files?.[0])} />
            <small>CSV supported · maximum 2 MiB</small>
          </section>
        )}

        {session && (
          <div className="space-y-5">
            <section className="agent-status-panel">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="eyebrow">{retrying ? "Interpreting formulation" : session.state === "failed" ? "Interpretation could not be completed" : "Analysis complete"}</p>
                  <h2 className="section-title">{session.filename}</h2>
                </div>
                <button className="secondary-button shrink-0" type="button" onClick={startNewCSV} disabled={busy}>
                  <FileUp size={14} /> Start new CSV
                </button>
              </div>
              <div className="agent-stat-strip">
                <span><strong>{session.interpreted_rows.length}</strong> formulation rows detected</span>
                <span><strong>{session.interpreted_rows.length - rowsNeedingConfirmation.size}</strong> resolved</span>
                <span><strong>{blockingItems.length}</strong> need confirmation</span>
              </div>
              {retrying && <div className="agent-failure"><LoaderCircle className="animate-spin" size={17} /><span>Regulens is identifying the formulation structure and ingredient fields.</span></div>}
              {session.state === "failed" && !retrying && <div className="agent-failure"><AlertTriangle size={17} /><span>{session.error?.message}</span><button className="secondary-button" type="button" onClick={retry} disabled={busy}><RotateCcw size={14} /> Retry</button></div>}
            </section>

            {session.interpreted_rows.length > 0 && (
              <section className="agent-details-panel">
                <div>
                  <p className="eyebrow">Formulation details</p>
                  <h2 className="section-title">Screening input</h2>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <label className="field-label">Formulation ID <span className="optional-label">Optional</span><input className="field-control" value={formulationId} onChange={(event) => setFormulationId(event.target.value)} /></label>
                  <label className="field-label">Formulation name <span className="optional-label">Optional</span><input className="field-control" value={formulationName} onChange={(event) => setFormulationName(event.target.value)} /></label>
                  <div className="field-label">
                    <div className="flex items-center gap-1.5"><span>Product context</span><HelpHint label="Agent Product context"><p>Some restrictions depend on the exact cosmetic product type. Select only an accepted backend option; the Agent does not infer a regulatory hierarchy.</p></HelpHint></div>
                    <span className="optional-label">Optional when unavailable</span>
                    <select aria-label="Agent Product context" className="field-control" value={contextQuestion && !productContext ? "__unresolved" : productContext} disabled={busy} onChange={(event) => void changeProductContext(event.target.value)}>
                      {contextQuestion && <option value="__unresolved" disabled>Choose a product context</option>}
                      <option value="">No product context supplied</option>
                      {options?.product_contexts.map((context) => <option key={context}>{context}</option>)}
                    </select>
                  </div>
                </div>
                <div className="agent-detail-notes">
                  <p>{session.product_context?.source_value
                    ? <>Detected source value: <strong>{session.product_context.source_value}</strong>{session.product_context.value ? <> · Exact accepted match</> : <> · Confirmation required</>}</>
                    : <>No Product Context was detected in the source file. Choose an accepted value if known, or explicitly confirm that it is unavailable.</>}</p>
                  <p>{stageQuestion
                    ? <>Preparation stage: <strong>Finished product</strong> is only a visible proposal and has not been applied.</>
                    : <>Preparation stage values shown below come from the source or a confirmed selection.</>}</p>
                </div>
                {contextQuestion && <div className="agent-inline-question"><div><strong>{contextQuestion.title}</strong><p>{contextQuestion.prompt}</p></div></div>}
                {session.state !== "failed" && !prepared && (
                  <div className="mt-5 flex justify-end"><button className="primary-button" type="button" onClick={prepare} disabled={busy || blockingItems.length > 0}>{busy ? "Preparing…" : "Prepare formulation"}</button></div>
                )}
              </section>
            )}

            {session.interpreted_rows.length > 0 && (
              <section className="editor-panel">
                <div className="section-heading-row"><div><p className="eyebrow">Ingredient interpretation</p><h2 className="section-title">Source values and screening fields</h2></div><span className="text-xs text-slate-500">Source value → structured value</span></div>
                <div className="agent-table-scroll">
                  <table className="agent-table">
                    <thead><tr><th>Source</th><th>Interpreted ingredient</th><th>Concentration</th><th>Status</th></tr></thead>
                    <tbody>{session.interpreted_rows.map((row) => {
                      const draft = drafts[row.row_id];
                      if (!draft) return null;
                      const rowQuestions = session.questions.filter((question) => question.row_id === row.row_id || question.affected_row_ids.includes(row.row_id));
                      const requiredFieldsFilled = draft.name.trim().length > 0;
                      const rowStatus = rowQuestions.length ? "Needs confirmation" : requiredFieldsFilled ? "Resolved" : "Unresolved";
                      return <tr id={`agent-row-${row.row_id}`} className={highlightedRow === row.row_id ? "agent-target-highlight" : ""} key={row.row_id}>
                        <td><small>Row{row.source_rows.length > 1 ? "s" : ""} {row.source_rows.join(", ")}</small><strong>{row.name.source_value}</strong></td>
                        <td><div className="agent-field-stack">
                          <label><span>Ingredient name</span><input data-agent-field="ingredient_name" className="field-control" aria-label={`Row ${row.source_row} interpreted name`} value={draft.name} onChange={(event) => setDrafts((current) => ({ ...current, [row.row_id]: { ...draft, name: event.target.value } }))} onBlur={() => void saveRow(row.row_id, draft, "name")} /></label>
                          <label><span>CAS, if supplied</span><input className="field-control" aria-label={`Row ${row.source_row} CAS`} value={draft.cas} placeholder="—" onChange={(event) => setDrafts((current) => ({ ...current, [row.row_id]: { ...draft, cas: event.target.value } }))} onBlur={() => void saveRow(row.row_id, draft, "cas")} /></label>
                        </div></td>
                        <td><div className="agent-concentration-grid">
                          <label><span>Value</span><input data-agent-field="concentration" className="field-control" aria-label={`Row ${row.source_row} concentration`} value={draft.value} placeholder="—" onChange={(event) => setDrafts((current) => ({ ...current, [row.row_id]: { ...draft, value: event.target.value } }))} onBlur={() => { if (draft.value.trim()) void saveRow(row.row_id, draft, "concentration"); }} /></label>
                          <label><span>Unit</span><select data-agent-field="concentration.unit" className="field-control" aria-label={`Row ${row.source_row} unit`} value={draft.unit} onChange={(event) => { const next = { ...draft, unit: event.target.value as ConcentrationUnit | "" }; setDrafts((current) => ({ ...current, [row.row_id]: next })); if (next.value.trim()) void saveRow(row.row_id, next, "concentration"); }}><option value="">Choose unit</option><option value="percent">%</option><option value="ppm">ppm</option><option value="mg/kg">mg/kg</option></select></label>
                          <label><span>Basis</span><select className="field-control" aria-label={`Row ${row.source_row} basis`} value={draft.basis ?? ""} onChange={(event) => { const next = { ...draft, basis: optional(event.target.value) as ConcentrationBasis | null }; setDrafts((current) => ({ ...current, [row.row_id]: next })); if (next.value.trim()) void saveRow(row.row_id, next, "concentration"); }}><option value="">No specific basis</option>{options?.concentration_bases.filter((basis): basis is ConcentrationBasis => basis !== null).map((basis) => <option key={basis} value={basis}>{basis}</option>)}</select></label>
                          <label><span>Preparation stage</span><select data-agent-field="preparation_stage" className="field-control" aria-label={`Row ${row.source_row} stage`} value={draft.stage} onChange={(event) => { const next = { ...draft, stage: event.target.value as PreparationStage | "" }; setDrafts((current) => ({ ...current, [row.row_id]: next })); if (next.value.trim()) void saveRow(row.row_id, next, "concentration"); }}><option value="">Choose stage</option><option value="finished_product">Finished product</option><option value="after_mixing">After mixing for use</option><option value="ready_for_use">Ready for use</option></select></label>
                        </div></td>
                        <td>
                          <button className={`agent-row-status ${rowQuestions.length ? "warning" : rowStatus === "Unresolved" ? "unresolved" : "ready"}`} type="button" title={rowStatus === "Resolved" ? "All required Agent input is complete" : undefined} onClick={() => rowQuestions[0] && focusQuestion(rowQuestions[0].question_id)}>{rowStatus}{rowQuestions.length ? ` · ${rowQuestions.length} issue${rowQuestions.length === 1 ? "" : "s"}` : ""}</button>
                        </td>
                      </tr>;
                    })}</tbody>
                  </table>
                </div>
              </section>
            )}

            {clarificationQuestions.length > 0 && (
              <section>
                <p className="eyebrow">Clarification required</p>
                <div className="agent-question-grid">{clarificationQuestions.map((question) => {
                  const row = question.row_id ? session.interpreted_rows.find((item) => item.row_id === question.row_id) : null;
                  const candidate = question.question_type === "identity" ? question.options.find((option) => option.option_id === "confirm_candidate") : null;
                  return (
                  <article id={`agent-question-${question.question_id}`} className={`agent-question ${highlightedQuestion === question.question_id ? "agent-target-highlight" : ""}`} key={question.question_id}>
                    {row && <div className="agent-question-row"><strong>Row {row.source_row} · {row.name.source_value ?? row.name.value}</strong><button type="button" onClick={() => focusRow(row.row_id, question.target_field)}>View row</button></div>}
                    <h3>{question.title}</h3>
                    {question.question_type === "identity" && row ? <div className="agent-question-facts"><span>Submitted</span><strong>{row.name.source_value}</strong>{candidate && <><span>Possible source-backed match</span><strong>{String(candidate.value)}</strong><span>Source</span><strong>{row.catalogue_identity?.source_name ?? "EU Common Ingredient Glossary"}</strong></>}</div> : <p>{question.prompt}</p>}
                    {question.question_type === "preparation_stage" && <ul className="agent-question-rows">{question.affected_row_ids.map((rowId) => { const affected = session.interpreted_rows.find((item) => item.row_id === rowId); return affected ? <li key={rowId}><span>Row {affected.source_row} · {affected.name.source_value ?? affected.name.value}</span><button type="button" onClick={() => focusRow(rowId, "preparation_stage")}>View row</button></li> : null; })}</ul>}
                    {question.question_type === "non_numeric_concentration" && (() => {
                      const manual = manualValues[question.question_id] ?? { value: "", unit: "percent" as ConcentrationUnit, stage: "finished_product" as PreparationStage };
                      return <div className="mt-3 grid grid-cols-3 gap-2">
                        <input className="field-control" type="number" min="0" placeholder="Value" aria-label={`${question.title} manual value`} value={manual.value} onChange={(event) => setManualValues((current) => ({ ...current, [question.question_id]: { ...manual, value: event.target.value } }))} />
                        <select className="field-control" aria-label={`${question.title} manual unit`} value={manual.unit} onChange={(event) => setManualValues((current) => ({ ...current, [question.question_id]: { ...manual, unit: event.target.value as ConcentrationUnit } }))}><option value="percent">%</option><option value="ppm">ppm</option><option value="mg/kg">mg/kg</option></select>
                        <select className="field-control" aria-label={`${question.title} manual stage`} value={manual.stage} onChange={(event) => setManualValues((current) => ({ ...current, [question.question_id]: { ...manual, stage: event.target.value as PreparationStage } }))}><option value="finished_product">Finished product</option><option value="after_mixing">After mixing</option><option value="ready_for_use">Ready for use</option></select>
                      </div>;
                    })()}
                    {question.question_type === "identity" && !candidate && row && <button className="secondary-button mt-3" type="button" onClick={() => focusRow(row.row_id, "ingredient_name")}>Edit ingredient name</button>}
                    <div className="mt-3 flex flex-wrap gap-2">{question.options.map((option) => <button className="secondary-button" key={option.option_id} type="button" onClick={() => void answer(question, option.option_id)} disabled={busy}>{option.label}</button>)}</div>
                  </article>
                );})}</div>
              </section>
            )}

            {blockingItems.length > 0 && session.state !== "failed" && (
              <section className="agent-blocking-summary" aria-live="polite">
                <strong>{blockingItems.length} item{blockingItems.length === 1 ? "" : "s"} still need confirmation</strong>
                <ul>{blockingItems.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
              </section>
            )}

            {session.interpreted_rows.some((row) => row.source_metadata.length > 0) && (
              <details className="agent-source-metadata">
                <summary>Source metadata</summary>
                <p>Preserved exactly from non-regulatory CSV columns. These values are not sent to the screening engine.</p>
                <div className="mt-3 overflow-x-auto">
                  <table className="agent-table"><thead><tr><th>Source row</th><th>Column</th><th>Original value</th></tr></thead><tbody>
                    {session.interpreted_rows.flatMap((row) => row.source_metadata.map((item, index) => <tr key={`${row.row_id}-${item.source_row}-${item.source_column_index}-${index}`}><td>Row {item.source_row ?? row.source_row}</td><td>{item.source_column}</td><td>{item.source_value}</td></tr>))}
                  </tbody></table>
                </div>
              </details>
            )}

            <details className="agent-activity"><summary>Agent activity</summary><ul>{session.activity.map((item) => <li key={item.activity_id}><span>{item.status === "complete" ? "✓" : "⚠"}</span>{item.message}</li>)}</ul></details>
            {session.attempt_diagnostics.length > 0 && <details className="agent-activity"><summary>Technical activity</summary><p className="mt-3 text-xs text-slate-500">{session.attempts} attempt{session.attempts === 1 ? "" : "s"}{session.successful_attempt ? ` · successful attempt ${session.successful_attempt}` : ""}</p><ul>{session.attempt_diagnostics.map((attempt) => <li key={attempt.attempt_number}><span>{attempt.status === "success" ? "✓" : "⚠"}</span>Attempt {attempt.attempt_number} · {attempt.status}{attempt.failure_category ? ` · ${attempt.failure_category.replaceAll("_", " ")}` : ""} · {attempt.actual_model ?? attempt.configured_model} · {attempt.input_tokens} input · {attempt.output_tokens} output · {attempt.tool_calls} tool calls</li>)}</ul>{session.total_usage && <p className="mt-3 text-xs text-slate-500">Total usage · {session.total_usage.input_tokens} input tokens · {session.total_usage.output_tokens} output tokens · {session.total_usage.tool_calls} tool calls</p>}</details>}

            {prepared && !response && (
              <section className="agent-ready-panel">
                <div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Formulation ready for screening</p><h2 className="section-title">{prepared.formulation.ingredients.length} ingredients</h2></div><Sparkles size={19} className="text-emerald-700" /></div>
                <div className="agent-ready-meta"><span>Formulation</span><strong>{prepared.formulation.formulation_name ?? "Untitled formulation"}</strong><span>Product context</span><strong>{prepared.formulation.product_context ?? "Not supplied"}</strong></div>
                <div className="mt-4 overflow-x-auto"><table className="agent-table"><thead><tr><th>Ingredient</th><th>CAS</th><th>Concentration</th><th>Basis</th><th>Preparation stage</th><th>Source rows</th></tr></thead><tbody>{prepared.formulation.ingredients.map((ingredient, index) => <tr key={`${ingredient.name}-${index}`}><td><strong>{ingredient.name}</strong></td><td>{ingredient.cas_number ?? "—"}</td><td>{ingredient.concentration ? `${ingredient.concentration.value} ${ingredient.concentration.unit}` : "—"}</td><td>{ingredient.concentration?.basis ?? "No specific basis"}</td><td>{ingredient.concentration ? ingredient.concentration.preparation_stage.replaceAll("_", " ") : "—"}</td><td>{prepared.row_provenance[index]?.source_rows.join(", ")}</td></tr>)}</tbody></table></div>
                <div className="mt-5 flex justify-between gap-3"><button className="secondary-button" type="button" onClick={() => setPrepared(null)}>Back to interpretation</button><button className="primary-button" type="button" onClick={screenPrepared} disabled={busy}>{busy ? <><LoaderCircle className="animate-spin" size={15} /> Screening…</> : <><Check size={15} /> Confirm & Screen</>}</button></div>
              </section>
            )}

            {response && <><p className="text-xs font-medium text-slate-500">Imported by Formulation Agent · Source: {session.filename}</p><ScreeningResultsPanel response={response} selectedRow={selectedRow} onSelect={setSelectedRow} /></>}
          </div>
        )}
      </main>
      <EvidenceDrawer result={selectedResult} sources={response?.dataset.sources ?? []} inputProvenance={provenance} explanationMetadata={response?.review_explanation_metadata ?? null} onClose={() => setSelectedRow(null)} />
    </div>
  );
}

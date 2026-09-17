import { AlertTriangle, ExternalLink, LoaderCircle, Maximize2, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { searchACDIngredients, sourceEvidenceUrl } from "../api/screening";
import type { ACDIngredientSearchResult } from "../types/screening";

function listingLabel(result: ACDIngredientSearchResult): string {
  if (result.restriction_type === "prohibited") return "Prohibited listing";
  if (result.restriction_type === "restricted") return "Restricted listing";
  return result.restriction_type.replaceAll("_", " ");
}

function SourceCrop({ result }: { result: ACDIngredientSearchResult }) {
  const [cropFailed, setCropFailed] = useState(false);
  const [pageFailed, setPageFailed] = useState(false);
  const [showPage, setShowPage] = useState(false);

  useEffect(() => {
    if (!showPage) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowPage(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [showPage]);

  const pageLabel = result.source_pages.length > 1 ? "pages" : "page";

  return (
    <>
      {cropFailed ? (
        <div className="source-image-error">The accepted PDF row could not be rendered. The exact source wording remains available below.</div>
      ) : (
        <div className="source-image-scroll">
          <img
            className="source-crop-image"
            src={sourceEvidenceUrl(result.raw_record_id)}
            alt={`${result.annex} reference ${result.reference} accepted PDF evidence`}
            loading="lazy"
            onError={() => setCropFailed(true)}
          />
        </div>
      )}
      <div className="source-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            setPageFailed(false);
            setShowPage(true);
          }}
        >
          <Maximize2 size={14} /> View full accepted {pageLabel}
        </button>
      </div>

      {showPage && (
        <div className="page-modal" role="dialog" aria-modal="true" aria-label="Accepted ACD source page">
          <button className="page-modal-backdrop" onClick={() => setShowPage(false)} aria-label="Close full ACD source page" />
          <div className="page-modal-panel">
            <div className="page-modal-header">
              <div>
                <p className="text-sm font-semibold text-slate-900">Accepted ACD source {pageLabel}</p>
                <p className="text-xs text-slate-500">
                  {result.annex} · Ref {result.reference} · Page {result.source_pages.join(", ")}
                </p>
              </div>
              <button autoFocus className="icon-button" onClick={() => setShowPage(false)} aria-label="Close full ACD source page"><X size={18} /></button>
            </div>
            <div className="page-modal-body">
              {pageFailed ? (
                <div className="source-image-error">The accepted ACD source {pageLabel} could not be rendered.</div>
              ) : (
                <img
                  src={sourceEvidenceUrl(result.raw_record_id, "page")}
                  alt={`Accepted ACD PDF ${pageLabel} ${result.source_pages.join(", ")}`}
                  onError={() => setPageFailed(true)}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function SourcesPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ACDIngredientSearchResult[]>([]);
  const [selected, setSelected] = useState<ACDIngredientSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSelected(null);
      setLoading(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      searchACDIngredients(trimmed, controller.signal)
        .then((response) => {
          setResults(response.results);
          setSelected((current) => response.results.find((item) => item.rule_id === current?.rule_id) ?? response.results[0] ?? null);
        })
        .catch((caught: unknown) => {
          if (controller.signal.aborted) return;
          setResults([]);
          setSelected(null);
          setError(caught instanceof Error ? caught.message : "Unable to search the accepted ACD records.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return (
    <div className="workspace">
      <main className="min-w-0 px-5 py-7 md:px-8 lg:px-10">
        <header className="mb-7">
          <p className="eyebrow">Accepted regulatory sources</p>
          <h1 className="page-title">ACD regulatory search</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            Search accepted ACD Annex II Part 1 and Annex III Part 1 records. Results show regulatory listings and do not establish a Singapore product conclusion.
          </p>
        </header>

        <section className="source-search-shell" aria-label="ACD regulatory ingredient search">
          <label className="field-label" htmlFor="acd-search">Search ACD regulatory ingredients</label>
          <div className="source-search-input-wrap mt-2 max-w-2xl">
            <Search className="source-search-icon text-slate-400" size={16} aria-hidden="true" />
            <input
              id="acd-search"
              className="field-control source-search-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by accepted ingredient name"
              autoComplete="off"
            />
            {loading && <LoaderCircle className="source-search-spinner animate-spin text-slate-400" size={16} aria-label="Searching" />}
          </div>
          <p className="mt-2 text-xs text-slate-500">Enter at least 2 characters. Matching is exact, prefix, then contains; no fuzzy matching is used.</p>
        </section>

        {error && <div className="mt-5 flex items-start gap-3 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="alert"><AlertTriangle size={16} /><span>{error}</span></div>}

        <div className="source-search-layout mt-6">
          <section className="source-results" aria-label="ACD search results">
            <div className="section-heading-row"><h2 className="section-title">Results</h2><span className="text-xs text-slate-500">{results.length}</span></div>
            {query.trim().length < 2 && <p className="px-5 py-8 text-sm text-slate-500">Enter a regulatory ingredient name to search the accepted ACD scope.</p>}
            {query.trim().length >= 2 && !loading && !error && results.length === 0 && <p className="px-5 py-8 text-sm text-slate-500">No matching ACD record was found in the scoped lists.</p>}
            {results.map((result) => (
              <button
                className={`source-result-row ${selected?.rule_id === result.rule_id ? "is-selected" : ""}`}
                key={result.rule_id}
                type="button"
                onClick={() => setSelected(result)}
                aria-pressed={selected?.rule_id === result.rule_id}
              >
                <strong className="whitespace-pre-line">{result.name}</strong>
                <span>{result.annex} · Ref {result.reference}</span>
                <small>{listingLabel(result)}{result.manual_review_required ? " · Manual review state" : ""}</small>
              </button>
            ))}
          </section>

          <section className="source-detail" aria-label="Selected ACD regulatory record">
            {!selected ? <p className="p-6 text-sm text-slate-500">Select a result to inspect its accepted evidence.</p> : (
              <div className="p-5">
                <p className="eyebrow">ACD regulatory record</p>
                <h2 className="text-xl font-semibold tracking-tight text-slate-950 whitespace-pre-line">{selected.name}</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="quiet-badge">{selected.annex} · Ref {selected.reference}</span>
                  <span className="quiet-badge">{listingLabel(selected)}</span>
                  {selected.manual_review_required && <span className="quiet-badge text-amber-800">Manual review required</span>}
                </div>
                <div className="metadata-grid mt-5">
                  <span>CAS</span><strong>{selected.cas_numbers.join(", ") || "—"}</strong>
                  <span>Context</span><strong>{selected.product_context ?? "—"}</strong>
                  <span>Concentration</span><strong className="whitespace-pre-line">{selected.concentration_text ?? "—"}</strong>
                  <span>Pages</span><strong>{selected.source_pages.join(", ")}</strong>
                  <span>Version</span><strong>{selected.source_version ?? "—"}</strong>
                  <span>Status</span><strong>{selected.normalization_status.replaceAll("_", " ")}</strong>
                </div>
                {selected.other_conditions && <p className="mt-4 text-sm leading-6"><strong>Other conditions:</strong> {selected.other_conditions}</p>}
                {selected.required_warning && <p className="mt-3 whitespace-pre-line text-sm leading-6"><strong>Required warning:</strong> {selected.required_warning}</p>}
                <h3 className="drawer-title mt-7">Accepted PDF evidence</h3>
                <SourceCrop key={selected.raw_record_id} result={selected} />
                <h3 className="drawer-title mt-7">Original source wording</h3>
                <blockquote className="source-quote">{selected.source_text}</blockquote>
                <a className="source-link" href={selected.source_url} target="_blank" rel="noreferrer">Open official ACD source <ExternalLink size={14} /></a>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

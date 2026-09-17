import { useEffect, useId, useState } from "react";
import { searchACDIngredients, searchIngredients } from "../api/screening";
import type { ACDIngredientSearchResult, IngredientSearchResult } from "../types/screening";

type IngredientSuggestion =
  | { key: string; source: "eu"; value: string; eu: IngredientSearchResult }
  | { key: string; source: "acd"; value: string; acd: ACDIngredientSearchResult };

type SearchSource = "eu" | "acd";

type SearchState = {
  query: string;
  eu: IngredientSuggestion[];
  acd: IngredientSuggestion[];
  failed: SearchSource[];
};

const MAX_COMBINED_RESULTS = 20;

function sourceLimit(euEnabled: boolean, acdEnabled: boolean): number {
  return euEnabled && acdEnabled ? MAX_COMBINED_RESULTS / 2 : MAX_COMBINED_RESULTS;
}

export function IngredientCombobox({
  rowNumber,
  value,
  disabled,
  invalid,
  onChange,
}: {
  rowNumber: number;
  value: string;
  disabled: boolean;
  invalid: boolean;
  onChange: (value: string) => void;
}) {
  const listboxId = useId();
  const [searchState, setSearchState] = useState<SearchState>({ query: "", eu: [], acd: [], failed: [] });
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [engaged, setEngaged] = useState(false);
  const [euEnabled, setEuEnabled] = useState(true);
  const [acdEnabled, setAcdEnabled] = useState(false);

  useEffect(() => {
    const query = value.trim();
    if (disabled || !engaged || query.length < 2) {
      setSearchState({ query: "", eu: [], acd: [], failed: [] });
      setOpen(false);
      setLoading(false);
      return;
    }
    setOpen(true);
    if (!euEnabled && !acdEnabled) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(() => {
      const limit = sourceLimit(euEnabled, acdEnabled);
      const requests: Array<{ source: SearchSource; promise: Promise<IngredientSuggestion[]> }> = [];
      if (euEnabled) {
        requests.push({
          source: "eu",
          promise: searchIngredients(query, controller.signal, limit).then((response) => response.results.map((item) => ({
            key: `eu:${item.ingredient_id}`,
            source: "eu" as const,
            value: item.canonical_name,
            eu: item,
          }))),
        });
      }
      if (acdEnabled) {
        requests.push({
          source: "acd",
          promise: searchACDIngredients(query, controller.signal, limit).then((response) => response.results.map((item) => ({
            key: `acd:${item.rule_id}`,
            source: "acd" as const,
            value: item.name,
            acd: item,
          }))),
        });
      }

      void Promise.allSettled(requests.map((request) => request.promise)).then((settled) => {
        if (controller.signal.aborted) return;
        setSearchState((current) => {
          const next: SearchState = current.query === query
            ? { ...current, eu: [...current.eu], acd: [...current.acd], failed: [...current.failed] }
            : { query, eu: [], acd: [], failed: [] };
          const failures = new Set(next.failed);

          settled.forEach((outcome, index) => {
            const source = requests[index].source;
            if (outcome.status === "fulfilled") {
              next[source] = outcome.value;
              failures.delete(source);
            } else {
              next[source] = [];
              failures.add(source);
            }
          });
          next.failed = [...failures];
          return next;
        });
        setHighlighted(0);
        setLoading(false);
      });
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [acdEnabled, disabled, engaged, euEnabled, value]);

  const choose = (result: IngredientSuggestion) => {
    onChange(result.value);
    setEngaged(false);
    setOpen(false);
  };

  const noSources = !euEnabled && !acdEnabled;
  const currentQuery = value.trim();
  const queryMatches = searchState.query === currentQuery;
  const results = queryMatches
    ? [
        ...(euEnabled ? searchState.eu : []),
        ...(acdEnabled ? searchState.acd : []),
      ].slice(0, MAX_COMBINED_RESULTS)
    : [];
  const failedSources = queryMatches
    ? searchState.failed.filter((source) => source === "eu" ? euEnabled : acdEnabled)
    : [];
  const failedSourceLabels = failedSources.map((source) => source === "eu" ? "EU glossary" : "ACD regulatory lists");
  const activeIndex = Math.min(highlighted, Math.max(results.length - 1, 0));

  return (
    <div className="ingredient-combobox">
      <input
        aria-label={`Ingredient ${rowNumber} name`}
        aria-autocomplete="list"
        aria-controls={open ? listboxId : undefined}
        aria-expanded={open}
        aria-activedescendant={open && results[activeIndex] ? `${listboxId}-${activeIndex}` : undefined}
        role="combobox"
        className={`field-control ${invalid ? "field-error" : ""}`}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          setEngaged(true);
          onChange(event.target.value);
        }}
        onFocus={() => setEngaged(true)}
        onBlur={() => window.setTimeout(() => {
          setOpen(false);
          setEngaged(false);
        }, 120)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            return;
          }
          if (!open || results.length === 0) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setHighlighted((current) => (current + 1) % results.length);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlighted((current) => (current - 1 + results.length) % results.length);
          } else if (event.key === "Enter") {
            event.preventDefault();
            choose(results[activeIndex]);
          }
        }}
        placeholder="Ingredient name"
      />
      {open && (
        <div className="ingredient-options">
          <div className="ingredient-source-filters" onMouseDown={(event) => event.preventDefault()}>
            <span aria-live="polite">{loading ? "Updating results…" : "Search sources"}</span>
            <label>
              <input type="checkbox" checked={euEnabled} onChange={(event) => setEuEnabled(event.target.checked)} />
              EU glossary
            </label>
            <label>
              <input type="checkbox" checked={acdEnabled} onChange={(event) => setAcdEnabled(event.target.checked)} />
              ACD regulatory lists
            </label>
          </div>
          <div id={listboxId} role="listbox" aria-label={`Ingredient ${rowNumber} suggestions`}>
            {!loading && failedSources.length > 0 && (
              <div className="ingredient-option-state">
                {failedSourceLabels.join(" and ")} unavailable. Results from available sources are shown.
              </div>
            )}
            {!loading && noSources && (
              <div className="ingredient-option-state">Select at least one search source.</div>
            )}
            {!loading && !noSources && results.length === 0 && failedSources.length === 0 && (
              <div className="ingredient-option-state">
                <strong>No result found in the selected sources</strong>
                <span>Use entered text</span>
              </div>
            )}
            {results.map((result, index) => (
              <button
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                id={`${listboxId}-${index}`}
                key={result.key}
                className={`ingredient-option ${index === activeIndex ? "is-highlighted" : ""}`}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setHighlighted(index)}
                onClick={() => choose(result)}
              >
                {result.source === "eu" ? <>
                  <strong>{result.eu.display_name}</strong>
                  <span>Recognised ingredient name</span>
                  <small>{result.eu.identity_source}</small>
                </> : <>
                  <strong>{result.acd.name}</strong>
                  <span>ACD regulatory listing</span>
                  <small>{result.acd.annex} · Ref {result.acd.reference}</small>
                </>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

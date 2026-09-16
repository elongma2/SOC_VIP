import { useEffect, useId, useState } from "react";
import { searchIngredients } from "../api/screening";
import type { IngredientSearchResult } from "../types/screening";

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
  const [results, setResults] = useState<IngredientSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [engaged, setEngaged] = useState(false);

  useEffect(() => {
    const query = value.trim();
    if (disabled || !engaged || query.length < 2) {
      setResults([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setUnavailable(false);
      void Promise.resolve()
        .then(() => searchIngredients(query, controller.signal))
        .then((response) => {
          if (controller.signal.aborted) return;
          setResults(Array.isArray(response.results) ? response.results : []);
          setHighlighted(0);
          setOpen(true);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setResults([]);
          setUnavailable(true);
          setOpen(true);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [disabled, engaged, value]);

  const choose = (result: IngredientSearchResult) => {
    onChange(result.canonical_name);
    setEngaged(false);
    setOpen(false);
  };

  return (
    <div className="ingredient-combobox">
      <input
        aria-label={`Ingredient ${rowNumber} name`}
        aria-autocomplete="list"
        aria-controls={open ? listboxId : undefined}
        aria-expanded={open}
        aria-activedescendant={open && results[highlighted] ? `${listboxId}-${highlighted}` : undefined}
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
            choose(results[highlighted]);
          }
        }}
        placeholder="Ingredient name"
      />
      {open && (
        <div className="ingredient-options" id={listboxId} role="listbox" aria-label={`Ingredient ${rowNumber} suggestions`}>
          {loading && <div className="ingredient-option-state">Searching ingredient catalogue…</div>}
          {!loading && unavailable && (
            <div className="ingredient-option-state">
              Ingredient catalogue unavailable. You may continue with the entered text.
            </div>
          )}
          {!loading && !unavailable && results.length === 0 && (
            <div className="ingredient-option-state">
              <strong>Ingredient not found in identity catalogue</strong>
              <span>Use entered text</span>
            </div>
          )}
          {!loading && results.map((result, index) => (
            <button
              type="button"
              role="option"
              aria-selected={index === highlighted}
              id={`${listboxId}-${index}`}
              key={result.ingredient_id}
              className={`ingredient-option ${index === highlighted ? "is-highlighted" : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setHighlighted(index)}
              onClick={() => choose(result)}
            >
              <strong>{result.display_name}</strong>
              <span>Recognised ingredient name</span>
              <small>{result.identity_source}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

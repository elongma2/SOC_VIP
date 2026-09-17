import { ResultsTable } from "./ResultsTable";
import { ScreeningSummary } from "./ScreeningSummary";
import type { ScreeningResponse } from "../types/screening";

export function ScreeningResultsPanel({
  response,
  selectedRow,
  onSelect,
}: {
  response: ScreeningResponse;
  selectedRow: number | null;
  onSelect: (row: number) => void;
}) {
  return (
    <div className="mt-9 space-y-5">
      <ScreeningSummary summary={response.summary} results={response.ingredient_results} selectedRow={selectedRow} onSelect={onSelect} />
      <ResultsTable results={response.ingredient_results} selectedRow={selectedRow} onSelect={onSelect} />
      <p className="border-t border-slate-200 pt-4 text-xs leading-5 text-slate-500">
        Screening scope: Singapore ingredient rules covered by the current MVP. Findings are ingredient-level screening results and are not a formulation-level compliance conclusion.
      </p>
      <p className="text-xs leading-5 text-slate-500">
        Dataset {response.dataset.dataset_version} · Accepted baseline {response.dataset.accepted_baseline_sha256.slice(0, 12)}…
      </p>
    </div>
  );
}

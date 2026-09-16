import { findingPresentation } from "../lib/screening";
import type { Finding } from "../types/screening";

export function FindingBadge({ finding }: { finding: Finding }) {
  const presentation = findingPresentation[finding];
  return (
    <span className={`inline-flex items-center gap-2 border px-2 py-1 text-xs font-medium ${presentation.tone}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${presentation.dot}`} aria-hidden="true" />
      {presentation.label}
    </span>
  );
}

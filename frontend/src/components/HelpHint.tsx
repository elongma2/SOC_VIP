import { CircleHelp } from "lucide-react";
import type { ReactNode } from "react";

export function HelpHint({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="help-hint">
      <summary aria-label={`About ${label}`}><CircleHelp size={14} /></summary>
      <div className="help-popover" role="note">{children}</div>
    </details>
  );
}

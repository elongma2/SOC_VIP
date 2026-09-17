import { Bot, FileText, FlaskConical } from "lucide-react";
import type { AppView } from "../App";
import { RegulensMark } from "./RegulensMark";

const items = [
  { label: "New Screen", icon: FlaskConical, view: "screen" as const },
  { label: "Agent", icon: Bot, view: "agent" as const },
  { label: "Sources", icon: FileText, view: "sources" as const },
];

export function Sidebar({
  activeView,
  onNavigate,
}: {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
}) {
  return (
    <aside className="sidebar-shell">
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="brand-mark">
          <RegulensMark size={34} />
        </div>
        <div>
          <div className="font-semibold tracking-tight text-slate-950">Regulens</div>
          <div className="text-[11px] text-slate-500">Regulatory Intelligence</div>
        </div>
      </div>
      <div className="mx-5 border-t border-slate-200" />
      <nav className="flex flex-1 flex-col px-3 pt-4" aria-label="Primary navigation">
        <div className="space-y-1">
          {items.map(({ label, icon: Icon, view }) => {
            const active = view === activeView;
            return (
              <button
                key={label}
                className={`nav-item ${active ? "nav-item-active" : "text-slate-500"}`}
                aria-current={active ? "page" : undefined}
                onClick={() => onNavigate(view)}
                type="button"
              >
                <Icon size={17} strokeWidth={1.8} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}

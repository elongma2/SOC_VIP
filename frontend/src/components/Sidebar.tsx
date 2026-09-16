import { Clock3, FileText, FlaskConical, Info, LayoutGrid, Leaf } from "lucide-react";

const upperItems = [
  { label: "Dashboard", icon: LayoutGrid, implemented: false },
  { label: "New Screen", icon: FlaskConical, implemented: true },
  { label: "History", icon: Clock3, implemented: false },
];
const lowerItems = [
  { label: "Sources", icon: FileText },
  { label: "About", icon: Info },
];

export function Sidebar() {
  return (
    <aside className="sidebar-shell">
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="grid h-9 w-9 place-items-center border border-emerald-200 bg-emerald-50 text-emerald-700">
          <Leaf size={18} strokeWidth={1.8} />
        </div>
        <div>
          <div className="font-semibold tracking-tight text-slate-950">AseanCos</div>
          <div className="text-[11px] text-slate-500">Regulatory Intelligence</div>
        </div>
      </div>
      <nav className="flex flex-1 flex-col justify-between px-3 pb-4" aria-label="Primary navigation">
        <div className="space-y-1">
          {upperItems.map(({ label, icon: Icon, implemented }) => (
            <button
              key={label}
              className={`nav-item ${implemented ? "nav-item-active" : "text-slate-500"}`}
              title={implemented ? undefined : "Not implemented in MVP"}
              aria-current={implemented ? "page" : undefined}
              type="button"
            >
              <Icon size={17} strokeWidth={1.8} />
              <span>{label}</span>
              {!implemented && <span className="ml-auto text-[9px] uppercase tracking-wider text-slate-400">MVP</span>}
            </button>
          ))}
        </div>
        <div className="space-y-1">
          {lowerItems.map(({ label, icon: Icon }) => (
            <button key={label} className="nav-item text-slate-500" title="Not implemented in MVP" type="button">
              <Icon size={17} strokeWidth={1.8} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </aside>
  );
}

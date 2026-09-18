import { useCallback, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { FormulaScreeningPage } from "./pages/FormulaScreeningPage";
import { AgentPage } from "./pages/AgentPage";
import { SourcesPage } from "./pages/SourcesPage";

export type AppView = "screen" | "agent" | "sources";

const views: AppView[] = ["screen", "agent", "sources"];

function viewContent(view: AppView) {
  if (view === "agent") return <AgentPage />;
  if (view === "sources") return <SourcesPage />;
  return <FormulaScreeningPage />;
}

export default function App() {
  const [view, setView] = useState<AppView>("screen");
  const [mountedViews, setMountedViews] = useState<Set<AppView>>(() => new Set(["screen"]));

  const navigate = useCallback((nextView: AppView) => {
    setMountedViews((current) => {
      if (current.has(nextView)) return current;
      const next = new Set(current);
      next.add(nextView);
      return next;
    });
    setView(nextView);
  }, []);

  return (
    <div className="app-shell">
      <Sidebar activeView={view} onNavigate={navigate} />
      {views.map((candidate) => (
        <div
          key={candidate}
          className="app-view"
          hidden={candidate !== view}
          aria-hidden={candidate !== view ? true : undefined}
          data-view={candidate}
        >
          {mountedViews.has(candidate) ? viewContent(candidate) : null}
        </div>
      ))}
    </div>
  );
}

import { useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { FormulaScreeningPage } from "./pages/FormulaScreeningPage";
import { AgentPage } from "./pages/AgentPage";
import { SourcesPage } from "./pages/SourcesPage";

export type AppView = "screen" | "agent" | "sources";

export default function App() {
  const [view, setView] = useState<AppView>("screen");
  return (
    <div className="app-shell">
      <Sidebar activeView={view} onNavigate={setView} />
      {view === "sources" ? <SourcesPage /> : view === "agent" ? <AgentPage /> : <FormulaScreeningPage />}
    </div>
  );
}

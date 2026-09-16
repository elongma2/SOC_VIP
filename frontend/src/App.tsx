import { Sidebar } from "./components/Sidebar";
import { FormulaScreeningPage } from "./pages/FormulaScreeningPage";

export default function App() {
  return (
    <div className="app-shell">
      <Sidebar />
      <FormulaScreeningPage />
    </div>
  );
}

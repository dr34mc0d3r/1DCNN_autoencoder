import { Navigate, Route, Routes } from "react-router-dom";
import NavBar          from "./components/NavBar.jsx";
import SetupPage       from "./pages/SetupPage.jsx";
import TrainPage       from "./pages/TrainPage.jsx";
import WindowsPage     from "./pages/WindowsPage.jsx";
import LatentSpacePage from "./pages/LatentSpacePage.jsx";
import AnalysisPage    from "./pages/AnalysisPage.jsx";
import InferencePage   from "./pages/InferencePage.jsx";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      <NavBar />
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        <Routes>
          <Route path="/setup"     element={<SetupPage />} />
          <Route path="/train"     element={<TrainPage />} />
          <Route path="/windows"   element={<WindowsPage />} />
          <Route path="/latent"    element={<LatentSpacePage />} />
          <Route path="/analysis"  element={<AnalysisPage />} />
          <Route path="/inference" element={<InferencePage />} />
          {/* Legacy route redirects */}
          <Route path="/"         element={<Navigate to="/setup" replace />} />
          <Route path="/download" element={<Navigate to="/setup" replace />} />
        </Routes>
      </main>
    </div>
  );
}

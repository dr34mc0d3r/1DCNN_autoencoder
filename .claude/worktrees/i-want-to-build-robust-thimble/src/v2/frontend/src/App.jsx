import { Routes, Route } from "react-router-dom";
import NavBar from "./components/NavBar.jsx";
import ConfigPage      from "./pages/ConfigPage.jsx";
import DownloadPage    from "./pages/DownloadPage.jsx";
import TrainPage       from "./pages/TrainPage.jsx";
import LatentSpacePage from "./pages/LatentSpacePage.jsx";
import WindowsPage     from "./pages/WindowsPage.jsx";
import AnalysisPage    from "./pages/AnalysisPage.jsx";
import InferencePage   from "./pages/InferencePage.jsx";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      <NavBar />
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        <Routes>
          <Route path="/"           element={<ConfigPage />} />
          <Route path="/download"   element={<DownloadPage />} />
          <Route path="/train"      element={<TrainPage />} />
          <Route path="/latent"     element={<LatentSpacePage />} />
          <Route path="/windows"    element={<WindowsPage />} />
          <Route path="/analysis"   element={<AnalysisPage />} />
          <Route path="/inference"  element={<InferencePage />} />
        </Routes>
      </main>
    </div>
  );
}

import ConfigPage from "./ConfigPage.jsx";
import DownloadPage from "./DownloadPage.jsx";

function StepDivider({ n, label }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <span className="bg-indigo-600 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0">
        {n}
      </span>
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</span>
      <div className="flex-1 border-t border-gray-800" />
    </div>
  );
}

export default function SetupPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Setup</h1>
      <p className="text-sm text-gray-500 mb-8">Configure the model parameters, then download the training data.</p>

      <StepDivider n="1" label="Configure" />
      <ConfigPage />

      <div className="my-10 border-t border-gray-800" />

      <StepDivider n="2" label="Data" />
      <DownloadPage />
    </div>
  );
}

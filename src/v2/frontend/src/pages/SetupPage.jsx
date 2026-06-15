import { useState } from "react";
import ConfigPage from "./ConfigPage.jsx";
import DownloadPage from "./DownloadPage.jsx";

function SetupGuide() {
  const [open, setOpen] = useState(false);

  const Section = ({ title, color = "#6366f1", children }) => (
    <div className="border-l-2 pl-5 mb-8" style={{ borderColor: color }}>
      <h3 className="text-base font-semibold mb-3" style={{ color }}>{title}</h3>
      {children}
    </div>
  );

  const Tag = ({ label, color }) => (
    <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded mr-1 mb-1"
      style={{ background: `${color}22`, color, border: `1px solid ${color}55` }}>
      {label}
    </span>
  );

  const bullets = (items, color = "#9ca3af") => (
    <ul className="space-y-1.5 mt-2">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2 text-sm" style={{ color: "#9ca3af" }}>
          <span style={{ color, flexShrink: 0 }}>›</span>
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl mb-6 overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-300 hover:text-gray-100 hover:bg-gray-800/40 transition-colors"
      >
        <span className="flex items-center gap-2">
          Understanding Setup
          <span className="text-[11px] font-normal bg-indigo-900/40 text-indigo-300 border border-indigo-800 rounded px-1.5 py-0.5">
            Beginner's Guide
          </span>
        </span>
        <span className="text-gray-500 text-xs">{open ? "▲ Hide" : "▼ Show"}</span>
      </button>

      {open && (
        <div className="border-t border-gray-800 px-6 py-6">

          <div className="mb-6">
            <Tag label="5-stage pipeline" color="#6366f1" />
            <Tag label="run in order" color="#f59e0b" />
            <Tag label="one-time setup" color="#10b981" />
          </div>

          <Section title="The Full Pipeline" color="#6366f1">
            <svg
              viewBox="0 0 580 90"
              className="w-full mb-4 rounded-lg"
              style={{ maxWidth: "42rem", background: "#111827" }}
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Node 1 — Setup (highlighted) */}
              <rect x="20" y="18" width="90" height="54" rx="8" fill="#312e81" stroke="#6366f1" strokeWidth="1.5" />
              <text x="65" y="38" textAnchor="middle" fontSize="14" fill="#a5b4fc">⚙</text>
              <text x="65" y="53" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#e0e7ff">Setup</text>
              <text x="65" y="65" textAnchor="middle" fontSize="9" fill="#818cf8">Config + Data</text>

              {/* Arrow 1→2 */}
              <path d="M110 45 L128 45" stroke="#4b5563" strokeWidth="1.5" markerEnd="url(#arr-setup)" />

              {/* Node 2 — Train (highlighted) */}
              <rect x="130" y="18" width="90" height="54" rx="8" fill="#312e81" stroke="#6366f1" strokeWidth="1.5" />
              <text x="175" y="38" textAnchor="middle" fontSize="14" fill="#a5b4fc">🧠</text>
              <text x="175" y="53" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#e0e7ff">Train</text>
              <text x="175" y="65" textAnchor="middle" fontSize="9" fill="#818cf8">Model</text>

              {/* Arrow 2→3 */}
              <path d="M220 45 L238 45" stroke="#4b5563" strokeWidth="1.5" markerEnd="url(#arr-setup)" />

              {/* Node 3 — Windows */}
              <rect x="240" y="18" width="90" height="54" rx="8" fill="#1f2937" stroke="#374151" strokeWidth="1" />
              <text x="285" y="38" textAnchor="middle" fontSize="14" fill="#9ca3af">🔍</text>
              <text x="285" y="53" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#d1d5db">Windows</text>
              <text x="285" y="65" textAnchor="middle" fontSize="9" fill="#6b7280">Preview Data</text>

              {/* Arrow 3→4 */}
              <path d="M330 45 L348 45" stroke="#4b5563" strokeWidth="1.5" markerEnd="url(#arr-setup)" />

              {/* Node 4 — Analysis */}
              <rect x="350" y="18" width="90" height="54" rx="8" fill="#1f2937" stroke="#374151" strokeWidth="1" />
              <text x="395" y="38" textAnchor="middle" fontSize="14" fill="#9ca3af">📊</text>
              <text x="395" y="53" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#d1d5db">Analysis</text>
              <text x="395" y="65" textAnchor="middle" fontSize="9" fill="#6b7280">Patterns</text>

              {/* Arrow 4→5 */}
              <path d="M440 45 L458 45" stroke="#4b5563" strokeWidth="1.5" markerEnd="url(#arr-setup)" />

              {/* Node 5 — Inference */}
              <rect x="460" y="18" width="100" height="54" rx="8" fill="#1f2937" stroke="#374151" strokeWidth="1" />
              <text x="510" y="38" textAnchor="middle" fontSize="14" fill="#9ca3af">▶</text>
              <text x="510" y="53" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#d1d5db">Inference</text>
              <text x="510" y="65" textAnchor="middle" fontSize="9" fill="#6b7280">Live / Walk-fwd</text>

              <defs>
                <marker id="arr-setup" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L6,3 z" fill="#4b5563" />
                </marker>
              </defs>
            </svg>

            <p className="text-sm text-gray-400 mb-3">
              This application guides you through a one-time pipeline — run each stage in order.
              You're currently on Setup, which covers the first two steps.
            </p>
            {bullets([
              "Setup → Train → Inference is the minimum path to see the model running live",
              "Windows and Analysis pages reveal what the model learned — run them after training",
              "You only need to re-run Setup if you want to change the symbol, timeframe, or date range",
              "Config and Data are on this page; the remaining stages each have their own page in the nav",
            ], "#6366f1")}
          </Section>

          <Section title="Step 1: Configuration" color="#3b82f6">
            {bullets([
              "The Config section lets you set the model's architecture and training behaviour before training starts",
              "Key settings to understand: window_size (how many bars the model reads at once), latent_dim (how compressed the internal representation is), n_clusters (how many market behaviour types to discover)",
              "The Preset cards at the top of Config are a good starting point — pick \"Standard 5Min\" for typical use",
              "You can always come back and change settings, but you'll need to retrain after any change",
            ], "#3b82f6")}
          </Section>

          <Section title="Step 2: Downloading Data" color="#10b981">
            {bullets([
              "The Data section fetches historical OHLCV bars from Alpaca's market data API",
              "Match the Symbol and Timeframe here to what you set in Config — they must be identical",
              "Broader date ranges produce better-generalising models (more market conditions to learn from)",
              "Once downloaded, the CSV is stored locally and reused for every training run unless you re-download",
            ], "#10b981")}
          </Section>

        </div>
      )}
    </div>
  );
}

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

      <SetupGuide />

      <StepDivider n="1" label="Configure" />
      <ConfigPage />

      <div className="my-10 border-t border-gray-800" />

      <StepDivider n="2" label="Data" />
      <DownloadPage />
    </div>
  );
}

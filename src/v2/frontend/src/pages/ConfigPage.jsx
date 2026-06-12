import { useEffect, useState } from "react";
import { api } from "../api.js";

// ── Presets ────────────────────────────────────────────────────────────────────

const PRESETS = [
  {
    name: "Smoke Test",
    tag: "~5 min",
    color: "border-yellow-600 text-yellow-400",
    description: "Verify the full pipeline works end-to-end quickly. Use with 2 weeks of 5Min data.",
    download: "2 weeks of 5Min bars  (≈780 bars)",
    values: {
      timeframe: "5Min", window_size: 32, latent_dim: 8,
      epochs: 10, lr: 0.001, batch_size: 64, n_clusters: 3, test_split: 0.2,
      guard_patience: 5, guard_min_delta: 0.0001,
      guard_overfit_ratio: 20.0, guard_explosion_factor: 10.0,
      guard_oscillation_window: 3, guard_oscillation_cv: 0.9,
      guard_collapse_threshold: 1e-7,
    },
  },
  {
    name: "Standard 5Min",
    tag: "recommended",
    color: "border-indigo-500 text-indigo-400",
    description: "Recommended starting point for intraday pattern learning. Guards are relaxed so training runs to a natural plateau.",
    download: "1–2 years of 5Min bars  (≈20 k–40 k bars)",
    values: {
      timeframe: "5Min", window_size: 64, latent_dim: 32,
      epochs: 50, lr: 0.0001, batch_size: 256, n_clusters: 8, test_split: 0.2,
      guard_patience: 10, guard_min_delta: 0.00001,
      guard_overfit_ratio: 10.0, guard_explosion_factor: 10.0,
      guard_oscillation_window: 10, guard_oscillation_cv: 0.6,
      guard_collapse_threshold: 1e-6,
    },
  },
  {
    name: "Deep 5Min",
    tag: "long run",
    color: "border-purple-500 text-purple-400",
    description: "Extended training once Standard has converged. Lower LR and wider guard windows for fine-grained convergence. Requires the same data as Standard.",
    download: "Same as Standard 5Min",
    values: {
      timeframe: "5Min", window_size: 64, latent_dim: 32,
      epochs: 150, lr: 0.00003, batch_size: 256, n_clusters: 8, test_split: 0.2,
      guard_patience: 20, guard_min_delta: 0.000001,
      guard_overfit_ratio: 10.0, guard_explosion_factor: 10.0,
      guard_oscillation_window: 20, guard_oscillation_cv: 0.7,
      guard_collapse_threshold: 1e-6,
    },
  },
  {
    name: "Daily Bars",
    tag: "multi-year",
    color: "border-green-600 text-green-400",
    description: "Learn multi-week swing patterns from daily closes. Smaller window and latent space suit the lower bar count.",
    download: "5–10 years of 1Day bars  (≈1 250–2 500 bars)",
    values: {
      timeframe: "1Day", window_size: 20, latent_dim: 16,
      epochs: 100, lr: 0.0001, batch_size: 32, n_clusters: 6, test_split: 0.2,
      guard_patience: 15, guard_min_delta: 0.00001,
      guard_overfit_ratio: 5.0, guard_explosion_factor: 10.0,
      guard_oscillation_window: 10, guard_oscillation_cv: 0.5,
      guard_collapse_threshold: 1e-6,
    },
  },
];

// ── Field definitions ──────────────────────────────────────────────────────────

const SECTIONS = [
  {
    heading: "Data",
    fields: [
      { key: "symbol",    label: "Symbol",    type: "text" },
      { key: "timeframe", label: "Timeframe", type: "text" },
      { key: "start_date", label: "Start Date", type: "date" },
      { key: "end_date",   label: "End Date",   type: "date" },
    ],
  },
  {
    heading: "Model",
    fields: [
      { key: "window_size", label: "Window Size",      type: "number" },
      { key: "latent_dim",  label: "Latent Dim",       type: "number" },
      { key: "n_clusters",  label: "K-Means Clusters", type: "number" },
    ],
  },
  {
    heading: "Training",
    fields: [
      { key: "epochs",      label: "Epochs",         type: "number" },
      { key: "lr",          label: "Learning Rate",  type: "number" },
      { key: "batch_size",  label: "Batch Size",     type: "number" },
      { key: "test_split",  label: "Validation Split", type: "number" },
    ],
  },
  {
    heading: "Training Guard",
    fields: [
      { key: "guard_patience",            label: "Patience (plateau epochs)", type: "number" },
      { key: "guard_min_delta",           label: "Min Delta",                 type: "number" },
      { key: "guard_overfit_ratio",       label: "Overfit Ratio (val/train)", type: "number" },
      { key: "guard_explosion_factor",    label: "Explosion Factor",          type: "number" },
      { key: "guard_oscillation_window",  label: "Oscillation Window",        type: "number" },
      { key: "guard_oscillation_cv",      label: "Oscillation CV Threshold",  type: "number" },
      { key: "guard_collapse_threshold",  label: "Collapse Threshold",        type: "number" },
    ],
  },
];

// ── Component ──────────────────────────────────────────────────────────────────

export default function ConfigPage() {
  const [cfg, setCfg]             = useState(null);
  const [saving, setSaving]       = useState(false);
  const [msg, setMsg]             = useState("");
  const [activePreset, setActive] = useState(null);

  useEffect(() => {
    api.getConfig().then(setCfg).catch(console.error);
  }, []);

  function handleChange(key, value) {
    setCfg((c) => ({ ...c, [key]: value }));
    setActive(null);   // manual edit clears the active preset badge
    setMsg("");
  }

  function applyPreset(preset) {
    setCfg((c) => ({ ...c, ...preset.values }));
    setActive(preset.name);
    setMsg("");
  }

  async function handleSave() {
    setSaving(true);
    setMsg("");
    try {
      await api.updateConfig(cfg);
      setMsg("Saved.");
    } catch (e) {
      setMsg(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  if (!cfg) return <p className="text-gray-400">Loading…</p>;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Configuration</h1>

      {/* ── Presets ── */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Presets
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => applyPreset(p)}
              className={`text-left border rounded-lg p-4 transition-colors hover:bg-gray-800
                ${activePreset === p.name ? "bg-gray-800 " + p.color : "border-gray-700"}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-sm font-semibold ${activePreset === p.name ? p.color.split(" ")[1] : "text-gray-100"}`}>
                  {p.name}
                </span>
                <span className="text-xs text-gray-500">{p.tag}</span>
              </div>
              <p className="text-xs text-gray-400 leading-snug mb-2">{p.description}</p>
              <p className="text-xs text-gray-500">
                <span className="text-gray-600">Download: </span>{p.download}
              </p>
            </button>
          ))}
        </div>
        {activePreset && (
          <p className="text-xs text-indigo-400 mt-2">
            "{activePreset}" applied — review the fields below, then click Save.
          </p>
        )}
      </section>

      {/* ── Fields by section ── */}
      {SECTIONS.map(({ heading, fields }) => (
        <section key={heading} className="mb-6">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 border-b border-gray-800 pb-1">
            {heading}
          </h2>
          <div className="grid grid-cols-2 gap-4">
            {fields.map(({ key, label, type }) => (
              <div key={key} className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">{label}</label>
                <input
                  type={type}
                  value={cfg[key] ?? ""}
                  step={type === "number" ? "any" : undefined}
                  onChange={(e) =>
                    handleChange(key, type === "number" ? Number(e.target.value) : e.target.value)
                  }
                  className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
            ))}
          </div>
        </section>
      ))}

      <div className="flex items-center gap-4 mt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-5 py-2 rounded text-sm font-semibold"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {msg && (
          <span className={`text-sm ${msg.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>
            {msg}
          </span>
        )}
      </div>
    </div>
  );
}

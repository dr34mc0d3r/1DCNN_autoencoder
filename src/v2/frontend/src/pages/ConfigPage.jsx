import { useEffect, useState } from "react";
import { api } from "../api.js";

const FIELDS = [
  { key: "alpaca_key",       label: "Alpaca API Key",    type: "text"   },
  { key: "alpaca_secret",    label: "Alpaca API Secret", type: "password" },
  { key: "symbol",           label: "Symbol",            type: "text"   },
  { key: "timeframe",        label: "Timeframe",         type: "text"   },
  { key: "start_date",       label: "Start Date",        type: "date"   },
  { key: "end_date",         label: "End Date",          type: "date"   },
  { key: "window_size",      label: "Window Size",       type: "number" },
  { key: "latent_dim",       label: "Latent Dim",        type: "number" },
  { key: "epochs",           label: "Epochs",            type: "number" },
  { key: "lr",               label: "Learning Rate",     type: "number" },
  { key: "batch_size",       label: "Batch Size",        type: "number" },
  { key: "n_clusters",       label: "K-Means Clusters",  type: "number" },
  { key: "guard_patience",   label: "Guard Patience",    type: "number" },
  { key: "guard_min_delta",  label: "Guard Min Delta",   type: "number" },
  { key: "guard_overfit_ratio",    label: "Guard Overfit Ratio",    type: "number" },
  { key: "guard_explosion_factor", label: "Guard Explosion Factor", type: "number" },
  { key: "guard_oscillation_cv",   label: "Guard Oscillation CV",  type: "number" },
  { key: "guard_collapse_threshold", label: "Guard Collapse Threshold", type: "number" },
];

export default function ConfigPage() {
  const [cfg, setCfg]       = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState("");

  useEffect(() => {
    api.getConfig().then(setCfg).catch(console.error);
  }, []);

  function handleChange(key, value) {
    setCfg((c) => ({ ...c, [key]: value }));
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
      <div className="grid grid-cols-2 gap-4">
        {FIELDS.map(({ key, label, type }) => (
          <div key={key} className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">{label}</label>
            <input
              type={type}
              value={cfg[key] ?? ""}
              onChange={(e) => handleChange(key, type === "number" ? Number(e.target.value) : e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
        ))}
      </div>
      <div className="mt-6 flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-5 py-2 rounded text-sm font-semibold"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {msg && <span className="text-sm text-green-400">{msg}</span>}
      </div>
    </div>
  );
}

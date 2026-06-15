import { useEffect, useRef, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer,
} from "recharts";
import { api } from "../api.js";
import { ws } from "../ws.js";
import { captureRechartsSvg } from "../utils/exportUtils.js";

// ── Train Guide ────────────────────────────────────────────────────────────────

function TrainGuide() {
  const [open, setOpen] = useState(false);

  const Section = ({ title, color = "#6366f1", children }) => (
    <div className="border-l-2 pl-5 mb-8" style={{ borderColor: color }}>
      <h3 className="text-base font-semibold mb-3" style={{ color }}>{title}</h3>
      {children}
    </div>
  );

  const bullets = (items) => (
    <ul className="space-y-1.5 mt-2">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2 text-sm" style={{ color: "#9ca3af" }}>
          <span style={{ color: "#9ca3af", flexShrink: 0 }}>›</span>
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
          Understanding Training
          <span className="text-[11px] font-normal bg-indigo-900/40 text-indigo-300 border border-indigo-800 rounded px-1.5 py-0.5">
            Beginner's Guide
          </span>
        </span>
        <span className="text-gray-500 text-xs">{open ? "▲ Hide" : "▼ Show"}</span>
      </button>

      {open && (
        <div className="border-t border-gray-800 px-6 py-6">

          {/* Section 1 — What Training Actually Does */}
          <Section title="What Training Actually Does" color="#6366f1">
            <p className="text-sm" style={{ color: "#9ca3af" }}>
              Training teaches the autoencoder to recognise patterns by repeatedly compressing and rebuilding
              windows of bar data. It never predicts price direction — it learns what "normal" looks like.
            </p>
            {bullets([
              "Each epoch = one pass through all training windows. The model adjusts its internal weights to reduce reconstruction error",
              "Loss = average reconstruction error across all windows. Lower loss means the model rebuilds windows more accurately",
              "Training loss uses the training set (80% of data). Validation loss uses the held-out validation set (most recent 20%)",
              "The model saves automatically when validation loss hits a new best — so even if training stops early, you keep the best checkpoint",
            ])}
          </Section>

          {/* Section 2 — Reading the Loss Curves */}
          <Section title="Reading the Loss Curves" color="#f59e0b">
            <div className="overflow-x-auto mb-4">
              <svg viewBox="0 0 560 180" xmlns="http://www.w3.org/2000/svg" style={{ background: "#111827", borderRadius: 8, width: "100%", maxWidth: 560 }}>
                {/* Panel 1 — Healthy */}
                <rect x="20" y="20" width="120" height="70" fill="#1f2937" rx="4" stroke="#374151" strokeWidth="1" />
                <line x1="30" y1="82" x2="130" y2="82" stroke="#374151" strokeWidth="1" />
                <line x1="30" y1="25" x2="30" y2="82" stroke="#374151" strokeWidth="1" />
                <polyline points="30,72 50,62 70,52 90,44 110,39 130,36" fill="none" stroke="#10b981" strokeWidth="1.5" />
                <polyline points="30,75 50,66 70,57 90,50 110,45 130,42" fill="none" stroke="#f59e0b" strokeWidth="1.5" />
                <text x="80" y="105" textAnchor="middle" fill="#10b981" fontSize="9">✓ Healthy convergence</text>

                {/* Panel 2 — Overfitting */}
                <rect x="160" y="20" width="120" height="70" fill="#1f2937" rx="4" stroke="#374151" strokeWidth="1" />
                <line x1="170" y1="82" x2="270" y2="82" stroke="#374151" strokeWidth="1" />
                <line x1="170" y1="25" x2="170" y2="82" stroke="#374151" strokeWidth="1" />
                <polyline points="170,72 190,62 210,50 230,40 250,33 270,28" fill="none" stroke="#10b981" strokeWidth="1.5" />
                <polyline points="170,75 190,65 210,56 230,55 250,59 270,66" fill="none" stroke="#f59e0b" strokeWidth="1.5" />
                <text x="220" y="105" textAnchor="middle" fill="#f59e0b" fontSize="9">⚠ Overfitting</text>

                {/* Panel 3 — Underfitting */}
                <rect x="300" y="20" width="120" height="70" fill="#1f2937" rx="4" stroke="#374151" strokeWidth="1" />
                <line x1="310" y1="82" x2="410" y2="82" stroke="#374151" strokeWidth="1" />
                <line x1="310" y1="25" x2="310" y2="82" stroke="#374151" strokeWidth="1" />
                <polyline points="310,66 330,65 350,64 370,63 390,63 410,62" fill="none" stroke="#10b981" strokeWidth="1.5" />
                <polyline points="310,70 330,69 350,68 370,68 390,67 410,67" fill="none" stroke="#f59e0b" strokeWidth="1.5" />
                <text x="360" y="105" textAnchor="middle" fill="#f59e0b" fontSize="9">⚠ Underfitting</text>

                {/* Panel 4 — Guard stop */}
                <rect x="440" y="20" width="120" height="70" fill="#1f2937" rx="4" stroke="#374151" strokeWidth="1" />
                <line x1="450" y1="82" x2="550" y2="82" stroke="#374151" strokeWidth="1" />
                <line x1="450" y1="25" x2="450" y2="82" stroke="#374151" strokeWidth="1" />
                <polyline points="450,72 466,63 482,54 498,47" fill="none" stroke="#10b981" strokeWidth="1.5" />
                <polyline points="450,75 466,67 482,59 498,53" fill="none" stroke="#f59e0b" strokeWidth="1.5" />
                <line x1="498" y1="25" x2="498" y2="82" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4 2" />
                <text x="498" y="20" textAnchor="middle" fill="#ef4444" fontSize="11" fontWeight="bold">✕</text>
                <text x="495" y="105" textAnchor="middle" fill="#14b8a6" fontSize="9">✓ Guard fired</text>

                {/* Legend */}
                <line x1="20" y1="165" x2="36" y2="165" stroke="#10b981" strokeWidth="1.5" />
                <text x="40" y="168" fill="#9ca3af" fontSize="9">Train loss</text>
                <line x1="100" y1="165" x2="116" y2="165" stroke="#f59e0b" strokeWidth="1.5" />
                <text x="120" y="168" fill="#9ca3af" fontSize="9">Val loss</text>
              </svg>
            </div>
            {bullets([
              "Healthy: both losses declining and staying close together = ideal. Train will typically be slightly below val",
              "Overfitting: model memorised the training data; val loss worsens. The overfit_ratio guard catches this",
              "Underfitting: model hasn't learned enough. Usually means too few epochs, too high learning rate, or too large latent_dim",
              "Guard stop: one of the 6 safety guards detected a training problem and stopped early. Check the guard status column in the epoch log",
            ])}
          </Section>

          {/* Section 3 — Train vs Validation Loss */}
          <Section title="Train vs Validation Loss" color="#3b82f6">
            {bullets([
              "The training set is the first 80% of bars (chronologically). The validation set is the most recent 20%",
              "A small gap between train and val loss (e.g. 0.003 vs 0.0035) is healthy — slight overfitting is normal and expected",
              "A large gap (e.g. 0.001 train vs 0.008 val) means the model learned the training period but didn't generalise to the validation period",
              "If both losses are identical or val is lower than train, the model may not have trained enough yet — or there's data leakage",
              "Delta column in the epoch log shows how much val loss improved each epoch. Negative delta = improvement.",
            ])}
          </Section>

          {/* Section 4 — The Guard System */}
          <Section title="The Guard System" color="#ef4444">
            <div className="grid grid-cols-2 gap-3 mt-2">
              {[
                { name: "Patience / Plateau", desc: "No improvement for N epochs → reduce LR or stop. Set guard_patience." },
                { name: "Overfitting", desc: "Train loss / val loss ratio exceeds threshold → stop. Set guard_overfit_ratio." },
                { name: "Collapse", desc: "Loss drops below a tiny threshold → weights collapsed to near-zero → stop. Set guard_collapse_threshold." },
                { name: "Explosion", desc: "Loss rises by explosion_factor × previous → diverging training → stop." },
                { name: "Oscillation", desc: "Val loss oscillating without converging (measured by CV over a window) → stop." },
              ].map(({ name, desc }) => (
                <div key={name} className="rounded-lg p-3" style={{ background: "#1f2937", border: "1px solid #374151" }}>
                  <p className="text-xs font-semibold mb-1" style={{ color: "#ef4444" }}>{name}</p>
                  <p className="text-xs" style={{ color: "#9ca3af" }}>{desc}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* Section 5 — What to Watch For */}
          <Section title="What to Watch For" color="#14b8a6">
            {bullets([
              "LR drops in the LR column mean the scheduler fired — this is expected behaviour, not an error",
              "Guard status column: 'ok' is good; 'plateau' means LR was reduced; red status means training is about to stop",
              "If training stops before epoch 30, the patience or oscillation guards may be too tight — increase guard_patience in Config",
              "If val loss never improves at all, the learning rate may be too high — try the Exponential or Plateau scheduler",
              "A good training run shows both losses below 0.01, with val loss roughly 1.1–1.5× train loss",
            ])}
          </Section>

          {/* Section 6 — When is Training Good Enough? */}
          <Section title="When is Training Good Enough?" color="#10b981">
            {bullets([
              "Val loss has plateaued for 20+ epochs with no improvement = the model has learned all it can from this data",
              "Both losses below 0.005 is a strong result for a 26-feature autoencoder",
              "Check the Windows page after training — if windows look visually diverse, the scaler and features are working",
              "The Analysis page's Feature MSE chart will tell you which features the model struggled with — that's useful signal, not a failure",
              "You can always retrain with different Config settings — the new model overwrites the active bundle",
            ])}
          </Section>

        </div>
      )}
    </div>
  );
}

// ── Data Preview ───────────────────────────────────────────────────────────────

function DataTable({ columns, rows, caption }) {
  if (!rows.length) return <p className="text-xs text-gray-500">No rows.</p>;
  // Shorten timestamp column header; keep feature names as-is
  return (
    <div>
      {caption && <p className="text-xs text-gray-500 mb-1">{caption}</p>}
      <div className="overflow-x-auto rounded border border-gray-800">
        <table className="text-xs font-mono whitespace-nowrap">
          <thead>
            <tr className="bg-gray-800 text-gray-400">
              {columns.map((c) => (
                <th key={c} className="px-2.5 py-1.5 text-left font-normal border-r border-gray-700 last:border-r-0">
                  {c === "timestamp" ? "timestamp" : c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className={i % 2 === 0 ? "bg-gray-900" : "bg-gray-800/50"}>
                {columns.map((c) => (
                  <td key={c} className="px-2.5 py-1 text-gray-300 border-r border-gray-800 last:border-r-0">
                    {row[c]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DataPreview() {
  const [open, setOpen]       = useState(false);
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const fetched               = useRef(false);

  function toggle() {
    setOpen((v) => {
      const next = !v;
      if (next && !fetched.current) {
        fetched.current = true;
        setLoading(true);
        api.trainPreview()
          .then(setData)
          .catch((e) => setError(e.message))
          .finally(() => setLoading(false));
      }
      return next;
    });
  }

  const s = data?.stats;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl mb-6 overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-300 hover:text-gray-100 hover:bg-gray-800/40 transition-colors"
      >
        <span>Training Data Preview</span>
        <span className="text-gray-500 text-xs">{open ? "▲ Hide" : "▼ Show"}</span>
      </button>

      {open && (
        <div className="border-t border-gray-800 px-4 py-4 space-y-5">
          {loading && <p className="text-xs text-gray-500">Running pipeline…</p>}
          {error   && <p className="text-xs text-red-400">{error}</p>}

          {s && (
            <div className="grid grid-cols-5 gap-3">
              {[
                ["Total bars",     s.total_bars.toLocaleString()],
                ["Total windows",  s.total_windows.toLocaleString()],
                ["Train windows",  s.train_windows.toLocaleString()],
                ["Test windows",   s.test_windows.toLocaleString()],
                ["Test split",     `${s.test_split_pct}%  (window size ${s.window_size})`],
              ].map(([label, val]) => (
                <div key={label} className="bg-gray-800 rounded-lg p-3">
                  <p className="text-[10px] text-gray-500 mb-0.5">{label}</p>
                  <p className="text-sm font-semibold text-gray-100">{val}</p>
                </div>
              ))}
            </div>
          )}

          {data && (
            <>
              <DataTable
                columns={data.columns}
                rows={data.train_rows}
                caption={`Training portion — first 20 rows (bars 1–20 of ${s.total_bars.toLocaleString()})`}
              />
              <DataTable
                columns={data.columns}
                rows={data.test_rows}
                caption={`Test portion — first 20 rows (starting at bar ${(s.train_windows + 1).toLocaleString()} of ${s.total_bars.toLocaleString()})`}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function guardColor(status) {
  if (!status) return "text-gray-500";
  const s = status.toLowerCase();
  if (s.includes("ok") || s.includes("healthy")) return "text-green-400";
  if (s.includes("plateau") || s.includes("oscillat")) return "text-yellow-400";
  if (s.includes("overfit") || s.includes("explos") || s.includes("collapse")) return "text-red-400";
  return "text-gray-400";
}

function delta(current, previous, key) {
  if (!previous) return null;
  const d = current[key] - previous[key];
  return d;
}

function DeltaBadge({ value }) {
  if (value === null) return <span className="text-gray-700">—</span>;
  const improved = value < 0;
  return (
    <span className={improved ? "text-green-400" : "text-red-400"}>
      {improved ? "▼" : "▲"} {Math.abs(value).toFixed(5)}
    </span>
  );
}

export default function TrainPage() {
  const [modelName, setModelName] = useState("");
  const [csvInfo, setCsvInfo]     = useState(null);
  const [epochs, setEpochs]   = useState([]);
  const [status, setStatus]   = useState("idle");
  const [guard, setGuard]     = useState("");
  const [stopReason, setStop] = useState("");
  const [error, setError]     = useState("");
  const logRef    = useRef(null);
  const chartRef  = useRef(null);
  // Mirror epochs in a ref so the WS complete handler sees current data
  const epochsRef = useRef([]);

  useEffect(() => {
    api.getConfig()
      .then((cfg) => setCsvInfo({ symbol: cfg.symbol, timeframe: cfg.timeframe }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const offEpoch = ws.on("training_epoch", (data) => {
      setEpochs((prev) => {
        const next = [...prev, data];
        epochsRef.current = next;
        return next;
      });
      setGuard(data.guard_status ?? "");
    });
    const offDone = ws.on("training_complete", (data) => {
      setStatus("done");
      setStop(data.stop_reason ?? "");
      // Auto-save loss_curves.png (backend already writes epoch_log.csv)
      (async () => {
        try {
          const dataUrl = await captureRechartsSvg(chartRef);
          if (dataUrl) await api.saveArtifact("loss_curves.png", dataUrl);
        } catch (err) {
          console.warn("Auto-save loss_curves.png failed:", err);
        }
      })();
    });
    const offErr = ws.on("error", (data) => {
      setError(data.message ?? "Unknown error");
      setStatus("error");
    });
    return () => { offEpoch(); offDone(); offErr(); };
  }, []);

  // Auto-scroll epoch log to bottom whenever a new epoch arrives
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [epochs.length]);

  async function handleStart() {
    setEpochs([]);
    setStop("");
    setError("");
    setStatus("running");
    try {
      await api.startTrain({ model_name: modelName.trim() });
    } catch (e) {
      setError(e.message);
      setStatus("error");
    }
  }

  async function handleStop() {
    await api.stopTrain();
  }

  const lastEpoch = epochs.at(-1);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Train</h1>

      {/* ── CSV info strip ── */}
      <div className="flex items-center gap-2 mb-5 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-xs w-fit">
        <span className="text-gray-600 uppercase tracking-wider font-semibold">CSV</span>
        {csvInfo ? (
          <span className="text-indigo-300 font-mono">src/v2/backend/downloads/{csvInfo.symbol}/{csvInfo.timeframe}.csv</span>
        ) : (
          <span className="text-gray-600">loading…</span>
        )}
      </div>

      {/* ── Controls ── */}
      <div className="flex flex-col gap-3 mb-6">
        <div className="flex flex-col gap-1 max-w-xs">
          <label className="text-xs text-gray-400">
            Model Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
            disabled={status === "running"}
            placeholder="e.g. tsla_5min_jan2024"
            className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-50"
          />
          <p className="text-[11px] text-gray-600">
            Saved to <code>models/{modelName.trim() || "…"}/</code> — required before training
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleStart}
            disabled={status === "running" || !modelName.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-5 py-2 rounded text-sm font-semibold"
          >
            {status === "running" ? "Training…" : "Start Training"}
          </button>
          <button
            onClick={handleStop}
            disabled={status !== "running"}
            className="bg-red-700 hover:bg-red-600 disabled:opacity-50 px-5 py-2 rounded text-sm font-semibold"
          >
            Stop
          </button>
        </div>
      </div>

      <TrainGuide />

      <DataPreview />

      {/* ── Live status card ── */}
      {(status === "running" || lastEpoch) && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 grid grid-cols-5 gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">Epoch</p>
            <p className="text-2xl font-bold text-gray-100">{lastEpoch?.epoch ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Train loss</p>
            <p className="text-lg font-mono text-indigo-400">
              {lastEpoch?.train_loss?.toFixed(6) ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Val loss</p>
            <p className="text-lg font-mono text-amber-400">
              {lastEpoch?.val_loss?.toFixed(6) ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">LR</p>
            <p className="text-lg font-mono text-green-400">
              {lastEpoch?.lr != null ? lastEpoch.lr.toExponential(2) : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Guard</p>
            <p className={`text-sm font-medium ${guardColor(guard)}`}>
              {guard || "—"}
            </p>
          </div>
        </div>
      )}

      {/* ── Loss curves ── */}
      <div ref={chartRef} className="bg-gray-900 rounded-xl p-4 mb-6">
        <p className="text-sm text-gray-400 mb-3">Loss Curves</p>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={epochs}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="epoch" stroke="#6B7280" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="left"  stroke="#6B7280" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="right" orientation="right" stroke="#4ade80"
                   tick={{ fontSize: 10 }} tickFormatter={(v) => v.toExponential(0)} width={58} />
            <Tooltip contentStyle={{ backgroundColor: "#111827", border: "none" }} />
            <Legend />
            <Line yAxisId="left"  type="monotone"  dataKey="train_loss" stroke="#6366f1" dot={false} name="Train" />
            <Line yAxisId="left"  type="monotone"  dataKey="val_loss"   stroke="#f59e0b" dot={false} name="Val" />
            <Line yAxisId="right" type="stepAfter" dataKey="lr"         stroke="#4ade80" dot={false} name="LR" strokeDasharray="4 2" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── Epoch log ── */}
      {epochs.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-4 mb-6">
          <p className="text-sm text-gray-400 mb-3">Epoch Log</p>
          <div
            ref={logRef}
            className="overflow-y-auto max-h-64 font-mono text-xs space-y-px"
          >
            {/* Header row */}
            <div className="grid grid-cols-6 gap-2 text-gray-600 pb-1 border-b border-gray-800 sticky top-0 bg-gray-900">
              <span>Epoch</span>
              <span>Train loss</span>
              <span>Val loss</span>
              <span>Val Δ</span>
              <span>LR</span>
              <span>Guard</span>
            </div>

            {epochs.map((ep, i) => {
              const prev   = epochs[i - 1] ?? null;
              const valDelta = delta(ep, prev, "val_loss");
              const isLast = i === epochs.length - 1;
              return (
                <div
                  key={ep.epoch}
                  className={`grid grid-cols-6 gap-2 py-0.5 px-1 rounded
                    ${isLast ? "bg-gray-800 text-gray-100" : "text-gray-400"}`}
                >
                  <span>{ep.epoch}</span>
                  <span className="text-indigo-400">{ep.train_loss?.toFixed(6)}</span>
                  <span className="text-amber-400">{ep.val_loss?.toFixed(6)}</span>
                  <span><DeltaBadge value={valDelta} /></span>
                  <span className="text-green-400">{ep.lr != null ? ep.lr.toExponential(2) : "—"}</span>
                  <span className={guardColor(ep.guard_status)}>{ep.guard_status || "ok"}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Outcome ── */}
      {stopReason && (
        <p className="text-green-400 text-sm">Stopped: {stopReason}</p>
      )}
      {error && (
        <p className="text-red-400 text-sm">{error}</p>
      )}
    </div>
  );
}

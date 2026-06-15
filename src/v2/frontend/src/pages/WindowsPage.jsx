import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import FieldInfo from "../components/FieldInfo.jsx";
import { renderWindowsCanvas } from "../utils/exportUtils.js";

// ── Field info ─────────────────────────────────────────────────────────────────

const COUNT_INFO = {
  label: "Window Count",
  what: "The number of training windows to sample and display. Windows are drawn randomly from the full training set each time you click Load Windows.",
  values: "1–5000. Use 50–200 for a quick visual check; use 500–2000 for a more representative sample. Larger counts take longer to render, especially in Contact Sheet view.",
  affects: "Only affects what you see on this page — does not change the model or training data. If the page feels slow, reduce this number.",
};

// ── Spinner ────────────────────────────────────────────────────────────────────

function Spinner({ className = "h-4 w-4" }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ── Guide (collapsible) ────────────────────────────────────────────────────────

function WindowsGuide() {
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

  const featureGroups = [
    { rows: [0, 1, 2],        color: "#10b981", label: "Trend",       names: ["ema_9", "ema_21", "ema_50"] },
    { rows: [3, 4, 5],        color: "#6366f1", label: "Momentum",    names: ["macd", "macd_9", "macd_hist"] },
    { rows: [6, 7, 8, 9],     color: "#f59e0b", label: "Candle",      names: ["body", "upper_wick", "lower_wick", "candle_efficiency"] },
    { rows: [10, 11, 12, 13], color: "#3b82f6", label: "Returns",     names: ["return", "vol_return", "log_return", "volume_ratio"] },
    { rows: [14, 15],         color: "#ef4444", label: "Volatility",  names: ["atr_14", "rolling_vol"] },
    { rows: [16, 17, 18],     color: "#14b8a6", label: "Range",       names: ["bb_width", "bb_pct", "vwap_dev"] },
    { rows: [19, 20, 21],     color: "#ec4899", label: "Oscillators", names: ["rsi_14", "stoch_k", "stoch_d"] },
    { rows: [22, 23],         color: "#9ca3af", label: "Time",        names: ["hour_sin", "hour_cos"] },
    { rows: [24],             color: "#f97316", label: "Price",       names: ["close"] },
  ];

  const ROW_H = 11;
  const SVG_W = 480;
  const BAND_W = 8;
  const NAME_X = 28;
  const TOTAL_ROWS = 25;
  const svgHeight = TOTAL_ROWS * ROW_H + 20;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl mb-6 overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-300 hover:text-gray-100 hover:bg-gray-800/40 transition-colors"
      >
        <span className="flex items-center gap-2">
          Reading the Window Viewer
          <span className="text-[11px] font-normal bg-indigo-900/40 text-indigo-300 border border-indigo-800 rounded px-1.5 py-0.5">
            Beginner's Guide
          </span>
        </span>
        <span className="text-gray-500 text-xs">{open ? "▲ Hide" : "▼ Show"}</span>
      </button>

      {open && (
        <div className="border-t border-gray-800 px-6 py-6">

          {/* Section 1 — What You're Looking At */}
          <Section title="What You're Looking At" color="#6366f1">
            <p className="text-sm mb-4" style={{ color: "#9ca3af" }}>
              Each greyscale image is one training window: 26 feature rows × 64 bar columns. Every pixel's
              brightness encodes a scaled feature value — brighter = higher, darker = lower. The scaler
              normalises each feature to [0, 1] across training data before encoding to pixels.
            </p>
            <div className="flex gap-1 mb-4">
              <Tag label="26 features per bar" color="#6366f1" />
              <Tag label="64 bars per window" color="#6366f1" />
              <Tag label="normalised 0–1" color="#6366f1" />
            </div>

            {/* Feature Row Map SVG */}
            <div className="overflow-x-auto">
              <svg
                viewBox={`0 0 ${SVG_W} ${svgHeight}`}
                xmlns="http://www.w3.org/2000/svg"
                style={{ background: "#111827", borderRadius: 8, width: "100%", maxWidth: SVG_W }}
              >
                {featureGroups.map((group) => {
                  const startRow = group.rows[0];
                  const endRow   = group.rows[group.rows.length - 1];
                  const bandY    = startRow * ROW_H + 10;
                  const bandH    = (endRow - startRow + 1) * ROW_H;
                  const midY     = bandY + bandH / 2;

                  return (
                    <g key={group.label}>
                      {/* Colour band */}
                      <rect x="2" y={bandY} width={BAND_W} height={bandH} fill={group.color} rx="2" opacity="0.8" />
                      {/* Group label — rotated into the band */}
                      <text
                        x="6"
                        y={midY}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill={group.color}
                        fontSize="7"
                        fontWeight="600"
                        transform={`rotate(-90, 6, ${midY})`}
                      >
                        {group.label}
                      </text>
                      {/* Feature name rows */}
                      {group.rows.map((rowIdx, ri) => {
                        const y = rowIdx * ROW_H + 10;
                        const isEven = rowIdx % 2 === 0;
                        return (
                          <g key={rowIdx}>
                            <rect x={NAME_X} y={y} width={SVG_W - NAME_X - 4} height={ROW_H} fill={isEven ? "#1f2937" : "#111827"} />
                            <text x={NAME_X + 6} y={y + ROW_H / 2 + 0.5} dominantBaseline="middle" fill="#9ca3af" fontSize="8" fontFamily="monospace">
                              {String(rowIdx).padStart(2, "0")}
                            </text>
                            <text x={NAME_X + 22} y={y + ROW_H / 2 + 0.5} dominantBaseline="middle" fill="#e5e7eb" fontSize="8" fontFamily="monospace">
                              {group.names[ri]}
                            </text>
                          </g>
                        );
                      })}
                    </g>
                  );
                })}
              </svg>
            </div>
          </Section>

          {/* Section 2 — Patterns to Look For */}
          <Section title="Patterns to Look For" color="#f59e0b">
            {bullets([
              "Smooth horizontal gradient (gradually brightening left to right) = a consistent trend — price/features changing steadily over the 64 bars",
              "Checkerboard / alternating bright-dark columns = choppy market, no sustained direction",
              "Sudden brightness change near the right edge (most recent bars) = a recent event: spike, reversal, or news-driven move",
              "A fully uniform row (all one shade) = that feature barely moved in this window. Common for slow oscillators (ema_50, stoch_d) in flat markets",
              "Rows 22-23 (hour_sin/hour_cos) will always form smooth sine-like curves — they encode time of day, not price",
            ])}
          </Section>

          {/* Section 3 — The Three View Modes */}
          <Section title="The Three View Modes" color="#14b8a6">
            <div className="grid grid-cols-3 gap-3 mt-2">
              {[
                {
                  name: "Contact Sheet",
                  desc: "Windows in a grid. Best for spotting outlier windows and comparing many at once. If one window looks very different from all others, it may be an anomalous period.",
                },
                {
                  name: "Heatmap Strip",
                  desc: "Windows concatenated left-to-right in time order. Best for seeing how market behaviour changed over the training period. A colour shift in the strip = regime transition.",
                },
                {
                  name: "Thumbnail Grid",
                  desc: "Compact overview showing the diversity of all sampled windows. Best for a quick sanity check — if all thumbnails look similar, the training data may lack variety.",
                },
              ].map(({ name, desc }) => (
                <div key={name} className="rounded-lg p-3" style={{ background: "#1f2937", border: "1px solid #374151" }}>
                  <p className="text-xs font-semibold mb-1" style={{ color: "#14b8a6" }}>{name}</p>
                  <p className="text-xs" style={{ color: "#9ca3af" }}>{desc}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* Section 4 — Data Quality Signals */}
          <Section title="Data Quality Signals" color="#ef4444">
            {bullets([
              "All windows look nearly identical = low data variety. Try a longer date range or a more volatile symbol",
              "A feature row that is completely black across all windows = that feature has near-zero variance after scaling. Check for calculation errors",
              "A feature row that is completely white = the scaler was dominated by one extreme outlier. The scaler clips at the training min/max",
              "If you see a sudden transition in the Heatmap Strip where the entire image brightens or darkens = a major volatility regime change in the data",
            ])}
          </Section>

          {/* Section 5 — Finding Hidden Patterns */}
          <Section title="Finding Hidden Patterns" color="#10b981">
            {bullets([
              "Use the Heatmap Strip as a rough regime timeline before running K-Means. Areas of similar texture = windows that will likely cluster together",
              "Look for windows where only rows 6-9 (candle shape features) are bright while momentum rows are flat = pure candle-pattern regime, not trend-driven",
              "Contact Sheet with 200+ windows: if you see 3-4 visually distinct 'types' of windows, that suggests a natural cluster count in Config",
              "After training, compare these windows to the Cluster Profile's representative windows — the visual similarity should confirm the clustering",
            ])}
          </Section>

        </div>
      )}
    </div>
  );
}

// ── Canvas renderer ────────────────────────────────────────────────────────────

function WindowCanvas({ window: win, size = 4 }) {
  const ref = useRef(null);

  function drawOnMount(canvas) {
    if (!canvas || !win) return;
    ref.current = canvas;
    const ctx = canvas.getContext("2d");
    const W = win[0].length;  // n_features
    const H = win.length;     // window_size
    canvas.width  = W * size;
    canvas.height = H * size;
    const imgData = ctx.createImageData(W * size, H * size);
    for (let row = 0; row < H; row++) {
      for (let col = 0; col < W; col++) {
        const v = win[row][col];
        for (let dy = 0; dy < size; dy++) {
          for (let dx = 0; dx < size; dx++) {
            const idx = ((row * size + dy) * W * size + col * size + dx) * 4;
            imgData.data[idx]     = v;
            imgData.data[idx + 1] = v;
            imgData.data[idx + 2] = v;
            imgData.data[idx + 3] = 255;
          }
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }

  return <canvas ref={drawOnMount} style={{ imageRendering: "pixelated" }} />;
}

// ── Page ───────────────────────────────────────────────────────────────────────

const VIEW_LABELS = { contact: "Contact Sheet", heatmap: "Heatmap Strip", thumbnail: "Thumbnail Grid" };

export default function WindowsPage() {
  const [activeModel, setActiveModel]     = useState(null);
  const [data, setData]                   = useState(null);
  const [loading, setLoading]             = useState(false);
  const [count, setCount]                 = useState(200);
  const [view, setView]                   = useState("contact");
  const [viewSwitching, setViewSwitching] = useState(null);

  useEffect(() => {
    api.getActiveModel().then(m => setActiveModel(Object.keys(m).length ? m : null)).catch(() => {});
  }, []);

  async function handleLoad() {
    setLoading(true);
    try {
      const res = await api.getWindows(count);
      setData(res);
      // Auto-save all 3 layouts as PNGs (off-screen, no DOM needed)
      (async () => {
        try {
          for (const layout of ["contact", "heatmap", "thumbnail"]) {
            const dataUrl = renderWindowsCanvas(res.windows, res.window_size, res.n_features, layout);
            if (dataUrl) await api.saveArtifact(`windows_${layout}.png`, dataUrl);
          }
        } catch (err) {
          console.warn("Auto-save windows PNGs failed:", err);
        }
      })();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function handleViewChange(v) {
    if (v === view) return;
    setViewSwitching(v);
    setView(v);
    setTimeout(() => setViewSwitching(null), 400);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Windows</h1>
      <p className="text-sm text-gray-400 mb-6">
        Visualise the raw training data as the model sees it. Each window is a short clip of bar data
        encoded as a greyscale image — rows are bars, columns are technical indicator features.
        Use this page to inspect data quality, spot unusual market conditions, and build intuition
        for what patterns the model is learning from before moving to the Latent Space page.
      </p>

      {/* Active model badge */}
      <div className="flex items-center gap-2 mb-6 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-xs w-fit">
        <span className="text-gray-600 uppercase tracking-wider font-semibold">Model</span>
        {activeModel ? (
          <span className="text-indigo-300 font-mono">src/v2/backend/models/{activeModel.name}/</span>
        ) : (
          <span className="text-red-400">No active model — train one first</span>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-4 items-end mb-6">
        {/* Count input with label + FieldInfo */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400 flex items-center gap-0.5">
            Window Count
            <FieldInfo info={COUNT_INFO} />
          </label>
          <input
            type="number"
            value={count}
            min={1}
            max={5000}
            onChange={(e) => setCount(Number(e.target.value))}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm w-28 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Load button */}
        <button
          onClick={handleLoad}
          disabled={loading}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-5 py-2 rounded text-sm font-semibold"
        >
          {loading && <Spinner />}
          {loading ? "Loading…" : "Load Windows"}
        </button>

        {/* View toggle buttons */}
        {data && (
          <div className="flex gap-2">
            {["contact", "heatmap", "thumbnail"].map((v) => {
              const isActive = view === v;
              const isBusy   = viewSwitching === v;
              return (
                <button
                  key={v}
                  onClick={() => handleViewChange(v)}
                  disabled={isBusy}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors
                    ${isActive ? "bg-indigo-700 text-white" : "bg-gray-700 hover:bg-gray-600 text-gray-300"}`}
                >
                  {isBusy && <Spinner className="h-3 w-3" />}
                  {VIEW_LABELS[v]}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <WindowsGuide />

      {data && (
        <>
          <p className="text-sm text-gray-400 mb-4">
            {data.n_windows} windows × {data.window_size} bars × {data.n_features} features
          </p>

          {view === "contact" && (
            <div className="flex flex-wrap gap-1">
              {data.windows.map((win, i) => (
                <WindowCanvas key={i} window={win} size={2} />
              ))}
            </div>
          )}

          {view === "heatmap" && (
            <div className="overflow-x-auto">
              <div className="flex gap-0">
                {data.windows.map((win, i) => (
                  <WindowCanvas key={i} window={win} size={1} />
                ))}
              </div>
            </div>
          )}

          {view === "thumbnail" && (
            <div className="flex flex-wrap gap-0">
              {data.windows.map((win, i) => (
                <WindowCanvas key={i} window={win} size={1} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

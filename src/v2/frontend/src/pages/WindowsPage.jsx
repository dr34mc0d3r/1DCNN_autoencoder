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
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl mb-6 overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-300 hover:text-gray-100 hover:bg-gray-800/40 transition-colors"
      >
        <span>Reading the Window Viewer</span>
        <span className="text-gray-500 text-xs">{open ? "▲ Hide" : "▼ Show"}</span>
      </button>

      {open && (
        <div className="border-t border-gray-800 px-5 py-4 space-y-4 text-sm text-gray-400">

          <div>
            <p className="text-gray-200 font-semibold mb-1">What you're looking at</p>
            <p>Each window is a slice of <strong className="text-gray-300">14 normalised technical indicator features</strong> — rows are time steps, columns are features. Pixel brightness represents the scaled value: dark = low, bright = high. This is exactly what the model sees during both training and inference.</p>
          </div>

          <div>
            <p className="text-gray-300 font-medium mb-0.5">Contact Sheet view</p>
            <p>Best for spotting outliers. Windows that look dramatically different from the majority are rare regimes — the model typically assigns these to low-frequency clusters. Look for:</p>
            <ul className="list-disc list-inside space-y-1 mt-1">
              <li><strong className="text-gray-300">All-dark windows</strong> — low volatility, flat price action, compressed range.</li>
              <li><strong className="text-gray-300">All-bright windows</strong> — breakout or strong directional move.</li>
              <li><strong className="text-gray-300">Striped / high-contrast windows</strong> — oscillating or choppy conditions.</li>
            </ul>
          </div>

          <div>
            <p className="text-gray-300 font-medium mb-0.5">Heatmap Strip view</p>
            <p>All windows concatenated left-to-right in time order. A sudden shift in the brightness pattern marks a transition between market conditions — useful for sanity-checking that the CSV spans multiple distinct regimes. Long uniform stretches mean the model is seeing a homogeneous period.</p>
          </div>

          <div>
            <p className="text-gray-300 font-medium mb-0.5">Thumbnail Grid view</p>
            <p>Same windows packed tightly — useful for seeing the overall distribution of appearances at a glance. If the grid looks monotonous (everything mid-grey), the training data may be too uniform. If you see clear visual clusters, the K-Means clustering should work well.</p>
          </div>

          <div>
            <p className="text-gray-300 font-medium mb-0.5">What to watch for</p>
            <ul className="list-disc list-inside space-y-1">
              <li>If all windows look nearly identical, consider extending the date range to include more varied conditions before retraining.</li>
              <li>Windows that are extreme outliers (pure black or pure white) may indicate bad data or a scaler issue — cross-check the CSV.</li>
              <li>The window count input lets you trade off between a representative sample (large count, slower) and a quick visual check (small count, fast).</li>
            </ul>
          </div>

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

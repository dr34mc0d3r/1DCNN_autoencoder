import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";

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

export default function WindowsPage() {
  const [activeModel, setActiveModel] = useState(null);
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [count, setCount]     = useState(200);
  const [view, setView]       = useState("contact");

  useEffect(() => {
    api.getActiveModel().then(m => setActiveModel(Object.keys(m).length ? m : null)).catch(() => {});
  }, []);

  async function handleLoad() {
    setLoading(true);
    try {
      const res = await api.getWindows(count);
      setData(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Windows</h1>

      <div className="flex items-center gap-2 mb-5 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-xs w-fit">
        <span className="text-gray-600 uppercase tracking-wider font-semibold">Model</span>
        {activeModel ? (
          <span className="text-indigo-300 font-mono">src/v2/backend/models/{activeModel.name}/</span>
        ) : (
          <span className="text-red-400">No active model — train one first</span>
        )}
      </div>

      <div className="flex gap-3 items-center mb-6">
        <input
          type="number"
          value={count}
          min={1}
          max={5000}
          onChange={(e) => setCount(Number(e.target.value))}
          className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm w-28"
        />
        <button
          onClick={handleLoad}
          disabled={loading}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-5 py-2 rounded text-sm font-semibold"
        >
          {loading ? "Loading…" : "Load Windows"}
        </button>
        {data && (
          <div className="flex gap-2">
            {["contact", "heatmap", "thumbnail"].map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1 rounded text-xs ${view === v ? "bg-indigo-700" : "bg-gray-700"}`}
              >
                {v}
              </button>
            ))}
          </div>
        )}
      </div>

      <WindowsGuide />

      {data && (
        <>
          <p className="text-sm text-gray-400 mb-4">
            {data.n_windows} windows × {data.window_size} bars × {data.n_features} features
          </p>

          {/* Panel A — Contact Sheet */}
          {view === "contact" && (
            <div className="flex flex-wrap gap-1">
              {data.windows.map((win, i) => (
                <WindowCanvas key={i} window={win} size={2} />
              ))}
            </div>
          )}

          {/* Panel B — Heatmap Strip: all windows concatenated horizontally */}
          {view === "heatmap" && (
            <div className="overflow-x-auto">
              <div className="flex gap-0">
                {data.windows.map((win, i) => (
                  <WindowCanvas key={i} window={win} size={1} />
                ))}
              </div>
            </div>
          )}

          {/* Panel C — Thumbnail Grid: 10×10 px each */}
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

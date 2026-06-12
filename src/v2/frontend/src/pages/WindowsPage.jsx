import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";

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

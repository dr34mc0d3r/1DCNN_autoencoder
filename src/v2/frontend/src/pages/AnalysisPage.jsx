import { useRef, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
} from "recharts";
import { api } from "../api.js";

const COLORS = ["#6366f1","#f59e0b","#10b981","#ef4444","#3b82f6","#8b5cf6","#ec4899","#14b8a6"];

function WindowCanvas({ win, size = 2 }) {
  function draw(canvas) {
    if (!canvas || !win) return;
    const W = win[0].length;
    const H = win.length;
    canvas.width  = W * size;
    canvas.height = H * size;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(W * size, H * size);
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const v = win[r][c];
        for (let dy = 0; dy < size; dy++) {
          for (let dx = 0; dx < size; dx++) {
            const i = ((r * size + dy) * W * size + c * size + dx) * 4;
            img.data[i] = img.data[i+1] = img.data[i+2] = Math.round(v * 255);
            img.data[i+3] = 255;
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  return <canvas ref={draw} style={{ imageRendering: "pixelated" }} />;
}

export default function AnalysisPage() {
  const [recon, setRecon]       = useState(null);
  const [temporal, setTemporal] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  async function handleReconstruct() {
    setLoading(true);
    setError("");
    try {
      const res = await api.reconstruct(20);
      setRecon(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleTemporal() {
    try {
      const res = await api.getTemporal();
      setTemporal(res);
    } catch (e) {
      setError(e.message);
    }
  }

  const mseData = recon
    ? Object.entries(recon.per_feature_mse).map(([name, val]) => ({ name, val }))
    : [];

  const hourData = temporal?.by_hour ?? [];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Analysis</h1>

      <div className="flex gap-3 mb-6">
        <button
          onClick={handleReconstruct}
          disabled={loading}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-5 py-2 rounded text-sm font-semibold"
        >
          {loading ? "Running…" : "Run Reconstruction"}
        </button>
        <button
          onClick={handleTemporal}
          className="bg-gray-700 hover:bg-gray-600 px-5 py-2 rounded text-sm font-semibold"
        >
          Load Temporal Patterns
        </button>
      </div>

      {/* Panel A — Reconstruction Comparison */}
      {recon && (
        <div className="mb-6">
          <p className="text-sm text-gray-400 mb-2">Reconstruction Comparison (first 10 windows)</p>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-xs text-gray-500 mb-1">Original</p>
              <div className="flex flex-wrap gap-1">
                {recon.original.slice(0, 10).map((win, i) => (
                  <WindowCanvas key={i} win={win} size={3} />
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Reconstructed</p>
              <div className="flex flex-wrap gap-1">
                {recon.reconstructed.slice(0, 10).map((win, i) => (
                  <WindowCanvas key={i} win={win} size={3} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Panel B — Per-Feature MSE */}
      {mseData.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-4 mb-6">
          <p className="text-sm text-gray-400 mb-3">
            Per-Feature MSE (overall: {recon.overall_mse.toFixed(6)})
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={mseData}>
              <XAxis dataKey="name" stroke="#6B7280" tick={{ fontSize: 10 }} />
              <YAxis stroke="#6B7280" />
              <Tooltip contentStyle={{ backgroundColor: "#111827", border: "none" }} />
              <Bar dataKey="val" fill="#6366f1" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Panel C — Temporal Patterns */}
      {temporal && (
        <div className="bg-gray-900 rounded-xl p-4 mb-6">
          <p className="text-sm text-gray-400 mb-3">Cluster by Hour of Day</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={hourData}>
              <XAxis dataKey="hour" stroke="#6B7280" />
              <YAxis stroke="#6B7280" />
              <Tooltip contentStyle={{ backgroundColor: "#111827", border: "none" }} />
              <Bar dataKey="count">
                {hourData.map((entry, i) => (
                  <Cell key={i} fill={COLORS[entry.label % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
    </div>
  );
}

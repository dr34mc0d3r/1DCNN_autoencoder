import { useEffect, useRef, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, ResponsiveContainer,
  BarChart, Bar, Cell,
} from "recharts";
import { api } from "../api.js";
import { ws } from "../ws.js";

const COLORS = ["#6366f1","#f59e0b","#10b981","#ef4444","#3b82f6","#8b5cf6","#ec4899","#14b8a6"];
const HISTORY_LEN = 200;

export default function InferencePage() {
  const [form, setForm]       = useState({ infer_start: "2024-01-01", infer_end: "2024-06-30" });
  const [mseData, setMseData] = useState([]);
  const [current, setCurrent] = useState(null);
  const [clusterHistory, setClusterHistory] = useState([]);
  const [state, setState]     = useState("idle");
  const [error, setError]     = useState("");
  const canvasRef             = useRef(null);

  const p95 = mseData.length
    ? [...mseData].sort((a, b) => a.mse - b.mse)[Math.floor(mseData.length * 0.95)]?.mse
    : null;

  useEffect(() => {
    const off = ws.on("infer_step", (data) => {
      setMseData((prev) => [...prev.slice(-999), { timestamp: data.timestamp, mse: data.mse }]);
      setCurrent(data);
      setClusterHistory((prev) => [...prev.slice(-(HISTORY_LEN - 1)), data.cluster_label]);
      drawWindow(data);
    });
    return off;
  }, []);

  function drawWindow(data) {
    const canvas = canvasRef.current;
    if (!canvas || !data.window_pixels) return;
    const win = data.window_pixels;
    const H = win.length, W = win[0].length;
    canvas.width  = W * 8;
    canvas.height = H * 8;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(W * 8, H * 8);
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const v = win[r][c];
        for (let dy = 0; dy < 8; dy++) {
          for (let dx = 0; dx < 8; dx++) {
            const i = ((r * 8 + dy) * W * 8 + c * 8 + dx) * 4;
            img.data[i] = img.data[i+1] = img.data[i+2] = v;
            img.data[i+3] = 255;
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  async function handleStart() {
    setMseData([]);
    setCurrent(null);
    setClusterHistory([]);
    setError("");
    setState("running");
    try {
      await api.startInfer(form);
    } catch (e) {
      setError(e.message);
      setState("error");
    }
  }

  async function handleStop() {
    await api.stopInfer();
    setState("idle");
  }

  const latentData = current?.latent_vector
    ? current.latent_vector.map((v, i) => ({ i, v }))
    : [];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Live Inference</h1>

      <div className="flex gap-3 items-end mb-6 flex-wrap">
        {[["infer_start", "Start Date", "date"], ["infer_end", "End Date", "date"]].map(([k, label, type]) => (
          <div key={k} className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">{label}</label>
            <input
              type={type}
              value={form[k]}
              onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
            />
          </div>
        ))}
        <button
          onClick={handleStart}
          disabled={state === "running"}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-5 py-2 rounded text-sm font-semibold"
        >
          {state === "running" ? "Running…" : "Start"}
        </button>
        <button
          onClick={handleStop}
          disabled={state !== "running"}
          className="bg-red-700 hover:bg-red-600 disabled:opacity-50 px-5 py-2 rounded text-sm font-semibold"
        >
          Stop
        </button>
      </div>

      {/* Panel A — MSE Timeline */}
      <div className="bg-gray-900 rounded-xl p-4 mb-6">
        <p className="text-sm text-gray-400 mb-3">MSE Timeline</p>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={mseData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="timestamp" stroke="#6B7280" tick={false} />
            <YAxis stroke="#6B7280" />
            <Tooltip contentStyle={{ backgroundColor: "#111827", border: "none" }} />
            <Line type="monotone" dataKey="mse" stroke="#6366f1" dot={false} />
            {p95 && <ReferenceLine y={p95} stroke="#f59e0b" strokeDasharray="4 2" label={{ value: "p95", fill: "#f59e0b", fontSize: 11 }} />}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-3 gap-6 mb-6">
        {/* Panel B — Current Bar Info */}
        <div className="bg-gray-900 rounded-xl p-4">
          <p className="text-sm text-gray-400 mb-3">Current Bar</p>
          {current ? (
            <table className="text-sm w-full">
              <tbody>
                {[["Time", current.timestamp], ["MSE", current.mse?.toFixed(6)],
                  ["Cluster", current.cluster_label]].map(([k, v]) => (
                  <tr key={k}>
                    <td className="text-gray-500 pr-3">{k}</td>
                    <td className="text-gray-100">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-gray-500 text-xs">No data yet.</p>
          )}
        </div>

        {/* Panel C — Window Image */}
        <div className="bg-gray-900 rounded-xl p-4 flex flex-col items-center">
          <p className="text-sm text-gray-400 mb-3">Current Window</p>
          <canvas ref={canvasRef} style={{ imageRendering: "pixelated" }} className="border border-gray-700" />
        </div>

        {/* Panel D — Latent Vector */}
        <div className="bg-gray-900 rounded-xl p-4">
          <p className="text-sm text-gray-400 mb-3">Latent Vector</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={latentData}>
              <XAxis dataKey="i" tick={false} />
              <YAxis stroke="#6B7280" />
              <Tooltip contentStyle={{ backgroundColor: "#111827", border: "none" }} />
              <Bar dataKey="v">
                {latentData.map((d, i) => (
                  <Cell key={i} fill={d.v >= 0 ? "#6366f1" : "#ef4444"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Panel E — Cluster History Strip */}
      <div className="bg-gray-900 rounded-xl p-4 mb-6">
        <p className="text-sm text-gray-400 mb-2">Cluster History (last {HISTORY_LEN})</p>
        <div className="flex h-6 rounded overflow-hidden">
          {clusterHistory.map((label, i) => (
            <div
              key={i}
              title={`Cluster ${label}`}
              style={{
                flex: 1,
                backgroundColor: COLORS[label % COLORS.length],
              }}
            />
          ))}
          {clusterHistory.length === 0 && (
            <div className="flex-1 bg-gray-800 text-xs text-gray-600 flex items-center justify-center">
              no data
            </div>
          )}
        </div>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
    </div>
  );
}

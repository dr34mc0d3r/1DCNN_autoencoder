import { useEffect, useRef, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, ResponsiveContainer,
  BarChart, Bar, Cell,
} from "recharts";
import { api } from "../api.js";
import { ws } from "../ws.js";

const COLORS = ["#6366f1","#f59e0b","#10b981","#ef4444","#3b82f6","#8b5cf6","#ec4899","#14b8a6"];
const HISTORY_LEN = 200;

// ── Chart guide ────────────────────────────────────────────────────────────────

const GUIDE = [
  {
    id: "mse",
    label: "MSE Timeline",
    panel: "Panel A",
    what: "Mean Squared Error — how well the model can reconstruct the current window from its compressed latent representation. Low MSE means the model recognised this pattern from training. High MSE means it encountered something unfamiliar.",
    watch: [
      "A flat line with occasional spikes is healthy. The model knows what it's looking at most of the time.",
      "A sudden spike = the model saw something it hasn't seen before — could be a breakout, news-driven move, or unusual volume.",
      "Sustained high MSE = the market has shifted into a regime the model wasn't trained on. Consider retraining.",
      "The amber dashed line is the p95 threshold — anything above it is in the top 5% most 'surprising' windows seen so far this session.",
    ],
  },
  {
    id: "bar",
    label: "Current Bar",
    panel: "Panel B",
    what: "A snapshot of the most recently processed bar: its timestamp, reconstruction error, and the cluster the model assigned it to.",
    watch: [
      "Watch the cluster label over time. Staying in one cluster = persistent, consistent behaviour (trend or tight range). Rapidly switching clusters = choppy, uncertain price action.",
      "Cross-reference the MSE here with the MSE Timeline — a high number here explains a spike on the chart.",
    ],
  },
  {
    id: "window",
    label: "Current Window",
    panel: "Panel C",
    what: "A greyscale image of the 14 technical indicator channels × 64 bars that the model just processed. Each row is one feature (ema, macd, body size, volume ratio, etc.); each column is one bar in the window. Brighter pixel = higher scaled value.",
    watch: [
      "Clean, horizontal bands = the features are moving consistently. The model likely sees a trend or steady regime.",
      "Lots of vertical variation / noise = choppy, erratic price action across features.",
      "A sharp change in brightness on the right edge = a recent shift in market character — watch the MSE spike.",
      "This is the exact input the model 'sees'. If MSE is high, look here to understand why.",
    ],
  },
  {
    id: "latent",
    label: "Latent Vector",
    panel: "Panel D",
    what: "The 32-number compressed fingerprint the encoder extracted from this window. It's the model's internal summary of 'what is the market doing right now'. K-Means clustering runs in this space — windows with similar bar patterns here land in the same cluster.",
    watch: [
      "Both indigo (positive) and red (negative) bars are normal — the pattern across all 32 values is what matters, not individual bars.",
      "If consecutive windows look nearly identical here, the model thinks the market is repeating the same behaviour.",
      "A sudden dramatic shift in the bar pattern = the encoder detected a regime change, even if price hasn't moved much yet.",
      "Compare this to the t-SNE scatter on the Latent Space page — each dot there is one of these 32-number vectors projected into 2D.",
    ],
  },
  {
    id: "history",
    label: "Cluster History",
    panel: "Panel E",
    what: "The last 200 windows colour-coded by the cluster the model assigned each one to. Time runs left to right. The colours match the clusters on the Latent Space page.",
    watch: [
      "Long runs of the same colour = the model sees a persistent regime. This is characteristic of a trend or a quiet consolidation.",
      "Rapidly alternating colours = choppy, indecisive action. The model can't find a stable pattern.",
      "A new colour appearing and staying = the market transitioned into a behaviour the model treats as distinct.",
      "Watch for colour changes that coincide with MSE spikes — a regime change often shows up in both at the same time.",
    ],
  },
];

function ChartGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl mb-6 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-300 hover:text-gray-100 hover:bg-gray-800/40 transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className="text-indigo-400 text-base">?</span>
          How to read these charts
        </span>
        <span className="text-gray-500 text-xs">{open ? "▲ Hide" : "▼ Show"}</span>
      </button>

      {open && (
        <div className="border-t border-gray-800 px-4 py-4 space-y-5">
          {GUIDE.map((g) => (
            <div key={g.id}>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-[10px] font-mono text-gray-600 uppercase tracking-wider">{g.panel}</span>
                <span className="text-sm font-semibold text-gray-200">{g.label}</span>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed mb-2">{g.what}</p>
              <ul className="space-y-1">
                {g.watch.map((w, i) => (
                  <li key={i} className="flex gap-2 text-xs text-gray-500 leading-relaxed">
                    <span className="text-indigo-500 shrink-0 mt-0.5">›</span>
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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

      <ChartGuide />

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

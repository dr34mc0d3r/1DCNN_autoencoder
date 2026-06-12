import { useEffect, useRef, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer,
} from "recharts";
import { api } from "../api.js";
import { ws } from "../ws.js";

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
  const [epochs, setEpochs]   = useState([]);
  const [status, setStatus]   = useState("idle");
  const [guard, setGuard]     = useState("");
  const [stopReason, setStop] = useState("");
  const [error, setError]     = useState("");
  const logRef                = useRef(null);

  useEffect(() => {
    const offEpoch = ws.on("training_epoch", (data) => {
      setEpochs((prev) => [...prev, data]);
      setGuard(data.guard_status ?? "");
    });
    const offDone = ws.on("training_complete", (data) => {
      setStatus("done");
      setStop(data.stop_reason ?? "");
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
      await api.startTrain();
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

      {/* ── Controls ── */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={handleStart}
          disabled={status === "running"}
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

      {/* ── Live status card ── */}
      {(status === "running" || lastEpoch) && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 grid grid-cols-4 gap-4">
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
            <p className="text-xs text-gray-500 mb-1">Guard</p>
            <p className={`text-sm font-medium ${guardColor(guard)}`}>
              {guard || "—"}
            </p>
          </div>
        </div>
      )}

      {/* ── Loss curves ── */}
      <div className="bg-gray-900 rounded-xl p-4 mb-6">
        <p className="text-sm text-gray-400 mb-3">Loss Curves</p>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={epochs}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="epoch" stroke="#6B7280" tick={{ fontSize: 11 }} />
            <YAxis stroke="#6B7280" tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ backgroundColor: "#111827", border: "none" }} />
            <Legend />
            <Line type="monotone" dataKey="train_loss" stroke="#6366f1" dot={false} name="Train" />
            <Line type="monotone" dataKey="val_loss"   stroke="#f59e0b" dot={false} name="Val" />
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
            <div className="grid grid-cols-5 gap-2 text-gray-600 pb-1 border-b border-gray-800 sticky top-0 bg-gray-900">
              <span>Epoch</span>
              <span>Train loss</span>
              <span>Val loss</span>
              <span>Val Δ</span>
              <span>Guard</span>
            </div>

            {epochs.map((ep, i) => {
              const prev   = epochs[i - 1] ?? null;
              const valDelta = delta(ep, prev, "val_loss");
              const isLast = i === epochs.length - 1;
              return (
                <div
                  key={ep.epoch}
                  className={`grid grid-cols-5 gap-2 py-0.5 px-1 rounded
                    ${isLast ? "bg-gray-800 text-gray-100" : "text-gray-400"}`}
                >
                  <span>{ep.epoch}</span>
                  <span className="text-indigo-400">{ep.train_loss?.toFixed(6)}</span>
                  <span className="text-amber-400">{ep.val_loss?.toFixed(6)}</span>
                  <span><DeltaBadge value={valDelta} /></span>
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

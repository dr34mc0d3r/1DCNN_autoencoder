import { useEffect, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer,
} from "recharts";
import { api } from "../api.js";
import { ws } from "../ws.js";

export default function TrainPage() {
  const [epochs, setEpochs]   = useState([]);
  const [status, setStatus]   = useState("idle");
  const [guard, setGuard]     = useState("");
  const [stopReason, setStop] = useState("");
  const [error, setError]     = useState("");

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

      {/* Guard status badge */}
      {guard && (
        <div className="mb-4 inline-block bg-gray-800 border border-gray-700 rounded px-3 py-1 text-xs text-yellow-300">
          Guard: {guard}
        </div>
      )}

      {/* Loss curves */}
      <div className="bg-gray-900 rounded-xl p-4 mb-6">
        <p className="text-sm text-gray-400 mb-3">Loss Curves</p>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={epochs}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="epoch" stroke="#6B7280" />
            <YAxis stroke="#6B7280" />
            <Tooltip contentStyle={{ backgroundColor: "#111827", border: "none" }} />
            <Legend />
            <Line type="monotone" dataKey="train_loss" stroke="#6366f1" dot={false} name="Train" />
            <Line type="monotone" dataKey="val_loss"   stroke="#f59e0b" dot={false} name="Val" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {lastEpoch && (
        <div className="text-sm text-gray-400">
          Epoch {lastEpoch.epoch} — train {lastEpoch.train_loss?.toFixed(6)} / val {lastEpoch.val_loss?.toFixed(6)}
        </div>
      )}
      {stopReason && <p className="mt-3 text-green-400 text-sm">Stopped: {stopReason}</p>}
      {error      && <p className="mt-3 text-red-400 text-sm">{error}</p>}
    </div>
  );
}

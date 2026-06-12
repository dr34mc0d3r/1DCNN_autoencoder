import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { ws } from "../ws.js";

export default function DownloadPage() {
  const [form, setForm] = useState({
    symbol: "TSLA", timeframe: "5Min",
    start: "2024-01-01", end: "2025-01-01",
  });
  const [state, setState]     = useState("idle");
  const [progress, setProgress] = useState(null);
  const [error, setError]     = useState("");

  useEffect(() => {
    const off = ws.on("download_progress", (data) => {
      setProgress(data);
      if (data.done) setState("done");
    });
    return off;
  }, []);

  async function handleStart() {
    setError("");
    setState("running");
    setProgress(null);
    try {
      await api.startDownload(form);
    } catch (e) {
      setError(e.message);
      setState("error");
    }
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold mb-6">Download Bars</h1>

      <div className="grid grid-cols-2 gap-4 mb-6">
        {[["Symbol", "symbol", "text"], ["Timeframe", "timeframe", "text"],
          ["Start Date", "start", "date"], ["End Date", "end", "date"]].map(([label, key, type]) => (
          <div key={key} className="flex flex-col gap-1">
            <label className="text-xs text-gray-400">{label}</label>
            <input
              type={type}
              value={form[key]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
            />
          </div>
        ))}
      </div>

      <button
        onClick={handleStart}
        disabled={state === "running"}
        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-5 py-2 rounded text-sm font-semibold mb-4"
      >
        {state === "running" ? "Downloading…" : "Start Download"}
      </button>

      {progress && (
        <div className="bg-gray-800 rounded p-4 text-sm">
          <div className="text-gray-300">Bars: {progress.total?.toLocaleString() ?? "—"}</div>
          <div className="text-gray-400 text-xs mt-1">{JSON.stringify(progress)}</div>
        </div>
      )}

      {state === "done" && <p className="text-green-400 mt-3">Download complete.</p>}
      {error && <p className="text-red-400 mt-3">{error}</p>}
    </div>
  );
}

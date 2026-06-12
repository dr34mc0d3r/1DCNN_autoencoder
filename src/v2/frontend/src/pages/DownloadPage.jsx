import { useEffect, useState } from "react";
import { api } from "../api.js";
import { ws } from "../ws.js";

export default function DownloadPage() {
  const [form, setForm] = useState({
    symbol: "TSLA", timeframe: "5Min",
    start: "2024-01-01", end: "2025-01-01",
  });
  const [state, setState]         = useState("idle");
  const [barsTotal, setBarsTotal] = useState(0);
  const [savedPath, setSavedPath] = useState("");
  const [error, setError]         = useState("");

  useEffect(() => {
    const off = ws.on("download_progress", (data) => {
      setBarsTotal(data.bars_fetched ?? 0);
      if (data.done) {
        setState("done");
        setSavedPath(data.path ?? "");
      }
    });
    return off;
  }, []);

  async function handleStart() {
    setError("");
    setBarsTotal(0);
    setSavedPath("");
    setState("running");
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
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
        ))}
      </div>

      <button
        onClick={handleStart}
        disabled={state === "running"}
        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-5 py-2 rounded text-sm font-semibold mb-6"
      >
        {state === "running" ? "Downloading…" : "Start Download"}
      </button>

      {/* Progress bar — visible while running or after done */}
      {(state === "running" || state === "done") && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>{state === "done" ? "Complete" : "Fetching pages…"}</span>
            <span>{barsTotal.toLocaleString()} bars</span>
          </div>
          {/* Indeterminate bar while running (no known total), filled when done */}
          <div className="w-full h-2 bg-gray-800 rounded overflow-hidden">
            {state === "running" ? (
              <div className="h-full bg-indigo-500 rounded animate-pulse w-full" />
            ) : (
              <div className="h-full bg-green-500 rounded w-full" />
            )}
          </div>
        </div>
      )}

      {state === "done" && (
        <div className="bg-gray-800 rounded p-4 text-sm">
          <p className="text-green-400 font-semibold mb-1">Download complete</p>
          <p className="text-gray-400">{barsTotal.toLocaleString()} bars saved</p>
          {savedPath && <p className="text-gray-500 text-xs mt-1 break-all">{savedPath}</p>}
        </div>
      )}

      {error && <p className="text-red-400 mt-3 text-sm">{error}</p>}
    </div>
  );
}

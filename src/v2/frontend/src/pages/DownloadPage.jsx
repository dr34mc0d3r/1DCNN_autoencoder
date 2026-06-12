import { useEffect, useState } from "react";
import { api } from "../api.js";
import { ws } from "../ws.js";

// Guidance per timeframe: what to enter and why.
const GUIDANCE = {
  "1Min": {
    interval: "1Min",
    barsPerDay: 390,
    minRange: { label: "3 months", start: () => offsetDate(-90) },
    recRange: { label: "6–12 months", start: () => offsetDate(-365), end: () => today() },
    notes: [
      "1-minute bars capture every intraday tick-level move.",
      "3 months ≈ 25 k bars — enough to train, but patterns may be noisy.",
      "6–12 months (50 k–100 k bars) gives the model enough variety to generalise.",
      "Avoid going beyond 2 years — the file gets large and training slows noticeably.",
    ],
  },
  "5Min": {
    interval: "5Min",
    barsPerDay: 78,
    minRange: { label: "6 months", start: () => offsetDate(-180) },
    recRange: { label: "1–2 years", start: () => offsetDate(-730), end: () => today() },
    notes: [
      "5-minute bars are the standard for intraday pattern learning with this model.",
      "6 months ≈ 10 k bars — a viable minimum; expect noisier clusters.",
      "1–2 years (20 k–40 k bars) is the recommended sweet spot.",
      "Use the same symbol and timeframe you have set in Config.",
    ],
  },
  "15Min": {
    interval: "15Min",
    barsPerDay: 26,
    minRange: { label: "1 year", start: () => offsetDate(-365) },
    recRange: { label: "2–3 years", start: () => offsetDate(-1095), end: () => today() },
    notes: [
      "15-minute bars smooth out micro-noise while keeping intraday structure.",
      "1 year ≈ 6.5 k bars — workable but clusters will be broad.",
      "2–3 years (13 k–20 k bars) gives the model more pattern variety.",
    ],
  },
  "1Hour": {
    interval: "1Hour",
    barsPerDay: 7,
    minRange: { label: "2 years", start: () => offsetDate(-730) },
    recRange: { label: "3–5 years", start: () => offsetDate(-1825), end: () => today() },
    notes: [
      "Hourly bars capture session-level swings and opening/closing dynamics.",
      "2 years ≈ 3.6 k bars — minimum for meaningful training.",
      "3–5 years (5 k–9 k bars) is recommended.",
    ],
  },
  "1Day": {
    interval: "1Day",
    barsPerDay: 1,
    minRange: { label: "3 years", start: () => offsetDate(-1095) },
    recRange: { label: "5–10 years", start: () => "2015-01-01", end: () => today() },
    notes: [
      "Daily bars are for multi-week swing and trend patterns.",
      "3 years ≈ 750 bars — a minimum; the model will underfit with fewer.",
      "5–10 years (1 250–2 500 bars) gives the model enough bull/bear cycles to learn from.",
      "Alpaca provides free daily data back to 2015 for most US equities.",
    ],
  },
};

function today() {
  return new Date().toISOString().slice(0, 10);
}
function offsetDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function GuidancePanel({ timeframe, onApply }) {
  const g = GUIDANCE[timeframe];
  if (!g) return (
    <div className="bg-gray-800 rounded-lg p-4 text-sm text-gray-400">
      No guidance available for timeframe <code className="text-gray-300">{timeframe}</code>.
      Check your Config page.
    </div>
  );

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-5 mb-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-200 mb-0.5">
            What to download for <code className="text-indigo-400">{g.interval}</code>
          </h2>
          <p className="text-xs text-gray-500">≈ {g.barsPerDay} bars per trading day</p>
        </div>
        <button
          onClick={() => onApply(g.recRange.start(), g.recRange.end ? g.recRange.end() : today())}
          className="shrink-0 bg-indigo-700 hover:bg-indigo-600 px-3 py-1.5 rounded text-xs font-semibold"
        >
          Use recommended range
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-gray-800 rounded p-3">
          <p className="text-xs text-gray-500 mb-1">Minimum</p>
          <p className="text-sm text-gray-200 font-medium">{g.minRange.label}</p>
          <p className="text-xs text-gray-500 mt-0.5">{g.minRange.start()} → {today()}</p>
        </div>
        <div className="bg-gray-800 rounded p-3 border border-indigo-800">
          <p className="text-xs text-indigo-400 mb-1">Recommended</p>
          <p className="text-sm text-gray-200 font-medium">{g.recRange.label}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {g.recRange.start()} → {g.recRange.end ? g.recRange.end() : today()}
          </p>
        </div>
      </div>

      <ul className="space-y-1">
        {g.notes.map((n, i) => (
          <li key={i} className="flex gap-2 text-xs text-gray-400">
            <span className="text-gray-600 shrink-0">—</span>
            {n}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function DownloadPage() {
  const [form, setForm] = useState({
    symbol: "TSLA", timeframe: "5Min",
    start: "2024-01-01", end: today(),
  });
  const [state, setState]         = useState("idle");
  const [barsTotal, setBarsTotal] = useState(0);
  const [savedPath, setSavedPath] = useState("");
  const [error, setError]         = useState("");

  // Load symbol + timeframe from config on mount
  useEffect(() => {
    api.getConfig()
      .then((cfg) => setForm((f) => ({ ...f, symbol: cfg.symbol ?? f.symbol, timeframe: cfg.timeframe ?? f.timeframe })))
      .catch(() => {});
  }, []);

  // WebSocket progress
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

  function applyRange(start, end) {
    setForm((f) => ({ ...f, start, end }));
  }

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

      <GuidancePanel timeframe={form.timeframe} onApply={applyRange} />

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

      {(state === "running" || state === "done") && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>{state === "done" ? "Complete" : "Fetching pages…"}</span>
            <span>{barsTotal.toLocaleString()} bars</span>
          </div>
          <div className="w-full h-2 bg-gray-800 rounded overflow-hidden">
            {state === "running"
              ? <div className="h-full bg-indigo-500 rounded animate-pulse w-full" />
              : <div className="h-full bg-green-500 rounded w-full" />}
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

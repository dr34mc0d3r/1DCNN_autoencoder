import { useEffect, useState } from "react";
import { api } from "../api.js";
import { ws } from "../ws.js";
import FieldInfo from "../components/FieldInfo.jsx";

// ── Field info content ─────────────────────────────────────────────────────────

const INFO = {
  symbol: {
    label: "Symbol",
    what: "The stock ticker to fetch bars for. Should match the symbol set in Config so training uses the correct CSV.",
    values: "Any valid US equity on Alpaca's IEX data feed — e.g. TSLA, AAPL, SPY. Must be uppercase.",
    affects: "Creates the file downloads/{SYMBOL}/{TIMEFRAME}.csv. The Train, Windows, Analysis, and Inference pages all read from this file. If this differs from Config's symbol, training will fail to find the data.",
  },
  timeframe: {
    label: "Timeframe",
    what: "The bar interval to fetch. Must exactly match the timeframe set in Config — Alpaca's filename lookup is case-sensitive and the pipeline constructs the path from these two values.",
    values: "Alpaca strings: 1Min, 5Min, 15Min, 30Min, 1Hour, 4Hour, 1Day. No spaces.",
    affects: "Creates downloads/{SYMBOL}/{TIMEFRAME}.csv. A mismatch with Config's timeframe means training fails silently (wrong file path). Also determines how many bars per trading day you receive.",
  },
  start: {
    label: "Start Date",
    what: "The earliest date to fetch bars from (inclusive). Alpaca IEX data goes back to roughly 2016 for most US equities.",
    values: "ISO date YYYY-MM-DD. Must be before end. Alpaca's IEX feed has no pre-market or extended hours — bars are market-hours only.",
    affects: "Determines how many total bars are downloaded and therefore how many training windows are available. Too short a range means too few windows → the model won't generalise well. The training pipeline uses all bars; the validation set is taken from the most recent portion.",
  },
  end: {
    label: "End Date",
    what: "The latest date to fetch bars through (inclusive). Use today's date to include the most recent market data.",
    values: "ISO date YYYY-MM-DD. Must be after start. Cannot be in the future — Alpaca won't return future bars.",
    affects: "Sets the recency of your data. The validation set (last test_split % of bars) covers the period nearest this date. More recent data means the model and Inference page reflect current market conditions.",
  },
};

// ── Guidance panel ─────────────────────────────────────────────────────────────

const GUIDANCE = {
  "1Min": {
    barsPerDay: 390,
    minRange: { label: "3 months", start: () => offsetDate(-90) },
    recRange: { label: "6–12 months", start: () => offsetDate(-365) },
    notes: [
      "1-minute bars capture every intraday move. Files are large.",
      "3 months ≈ 25 k bars — enough to train, but patterns may be noisy.",
      "6–12 months (50 k–100 k bars) gives the model enough variety to generalise.",
      "Avoid going beyond 2 years — the file gets large and training slows noticeably.",
    ],
  },
  "5Min": {
    barsPerDay: 78,
    minRange: { label: "6 months", start: () => offsetDate(-180) },
    recRange: { label: "1–2 years", start: () => offsetDate(-730) },
    notes: [
      "5-minute bars are the standard for intraday pattern learning with this model.",
      "6 months ≈ 10 k bars — a viable minimum; expect noisier clusters.",
      "1–2 years (20 k–40 k bars) is the recommended sweet spot.",
      "Use the same symbol and timeframe you have set in Config.",
    ],
  },
  "15Min": {
    barsPerDay: 26,
    minRange: { label: "1 year", start: () => offsetDate(-365) },
    recRange: { label: "2–3 years", start: () => offsetDate(-1095) },
    notes: [
      "15-minute bars smooth out micro-noise while keeping intraday structure.",
      "1 year ≈ 6.5 k bars — workable but clusters will be broad.",
      "2–3 years (13 k–20 k bars) gives the model more pattern variety.",
    ],
  },
  "1Hour": {
    barsPerDay: 7,
    minRange: { label: "2 years", start: () => offsetDate(-730) },
    recRange: { label: "3–5 years", start: () => offsetDate(-1825) },
    notes: [
      "Hourly bars capture session-level swings and open/close dynamics.",
      "2 years ≈ 3.6 k bars — minimum for meaningful training.",
      "3–5 years (5 k–9 k bars) is recommended.",
    ],
  },
  "1Day": {
    barsPerDay: 1,
    minRange: { label: "3 years", start: () => offsetDate(-1095) },
    recRange: { label: "5–10 years", start: () => "2015-01-01" },
    notes: [
      "Daily bars are for multi-week swing and trend patterns.",
      "3 years ≈ 750 bars — a minimum; the model will underfit with fewer.",
      "5–10 years (1 250–2 500 bars) gives the model bull/bear cycle variety.",
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
    <div className="bg-gray-800 rounded-lg p-4 text-sm text-gray-400 mb-6">
      No guidance for timeframe <code className="text-gray-300">{timeframe}</code>. Check Config.
    </div>
  );

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-5 mb-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-200 mb-0.5">
            What to download for <code className="text-indigo-400">{timeframe}</code>
          </h2>
          <p className="text-xs text-gray-500">≈ {g.barsPerDay} bars per trading day</p>
        </div>
        <button
          onClick={() => onApply(g.recRange.start(), today())}
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
          <p className="text-xs text-gray-500 mt-0.5">{g.recRange.start()} → {today()}</p>
        </div>
      </div>

      <ul className="space-y-1">
        {g.notes.map((n, i) => (
          <li key={i} className="flex gap-2 text-xs text-gray-400">
            <span className="text-gray-600 shrink-0">—</span>{n}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Available Downloads / Models panel ────────────────────────────────────────

function ConfirmButtons({ onYes, onNo }) {
  return (
    <>
      <span className="text-red-400 text-[11px]">Delete?</span>
      <button onClick={onYes} className="bg-red-700 hover:bg-red-600 px-2 py-1 rounded text-[11px] font-semibold">Yes</button>
      <button onClick={onNo}  className="bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-[11px] font-semibold">No</button>
    </>
  );
}

function AvailableDownloads({ onUse }) {
  const [files, setFiles]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [confirming, setConfirm] = useState(null); // "csv:TICKER/TF" | "model:NAME" | "deactivate:NAME"
  const [activating, setActivating] = useState(null); // model name mid-activation (shows "…")
  const [deactivating, setDeactivating] = useState(false);

  function load() {
    setLoading(true);
    setConfirm(null);
    api.listDownloads()
      .then(setFiles)
      .catch(() => setFiles([]))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleDeleteCsv(f) {
    await api.deleteDownload(f.ticker, f.timeframe).catch(() => {});
    load();
  }

  async function handleDeleteModel(name) {
    await api.deleteModel(name).catch(() => {});
    load();
  }

  async function handleUseModel(f, m) {
    setActivating(m.name);
    try {
      await api.activateModel(m.name);
      onUse(f);
      load();
    } catch {
      // silently ignore
    } finally {
      setActivating(null);
    }
  }

  async function handleDeactivate() {
    setDeactivating(true);
    try {
      await api.deactivateModel();
      load();
    } catch {
      // silently ignore
    } finally {
      setDeactivating(false);
      setConfirm(null);
    }
  }

  if (loading) return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 text-sm text-gray-500">
      Scanning downloads…
    </div>
  );

  if (files.length === 0) return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">No CSV files found in downloads/</p>
        <button onClick={load} className="text-xs text-gray-500 hover:text-gray-300 underline">Refresh</button>
      </div>
    </div>
  );

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-400">Available Downloads / Models</p>
        <button onClick={load} className="text-xs text-gray-500 hover:text-gray-300 underline">Refresh</button>
      </div>

      <div className="space-y-3">
        {files.map((f) => {
          const csvKey = `csv:${f.ticker}/${f.timeframe}`;
          return (
            <div key={csvKey} className="border border-gray-800 rounded-lg overflow-hidden">

              {/* CSV row */}
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-800/60 text-xs">
                <span className="font-semibold text-gray-100 w-14 shrink-0">{f.ticker}</span>
                <span className="font-mono text-gray-300 w-12 shrink-0">{f.timeframe}</span>
                <span className="font-mono text-gray-500">{f.start_date}</span>
                <span className="text-gray-700">→</span>
                <span className="font-mono text-gray-500">{f.end_date}</span>
                <span className="font-mono text-gray-600 ml-auto mr-2">{f.rows.toLocaleString()} rows</span>
                <span className="flex items-center gap-1 shrink-0">
                  {confirming === csvKey ? (
                    <ConfirmButtons onYes={() => handleDeleteCsv(f)} onNo={() => setConfirm(null)} />
                  ) : (
                    <>
                      <button
                        onClick={() => onUse(f)}
                        className="bg-indigo-700 hover:bg-indigo-600 px-2.5 py-1 rounded text-[11px] font-semibold"
                      >
                        Use CSV
                      </button>
                      <button
                        onClick={() => setConfirm(csvKey)}
                        className="bg-gray-700 hover:bg-red-800 px-2.5 py-1 rounded text-[11px] font-semibold text-gray-400 hover:text-red-300"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </span>
              </div>

              {/* Model sub-rows */}
              {f.models?.length > 0 && (
                <div className="border-t border-gray-800">
                  {f.models.map((m) => {
                    const modelKey = `model:${m.name}`;
                    const isActive = activating === m.name;
                    return (
                      <div
                        key={m.name}
                        className={`flex items-center gap-2 px-3 py-1.5 text-[11px] border-b border-gray-800/50 last:border-0
                          ${m.is_active ? "bg-indigo-950/40" : "bg-gray-900/60"}`}
                      >
                        <span className="text-indigo-400 shrink-0 w-4">⊕</span>
                          <span className="font-mono text-gray-300 truncate max-w-[200px]" title={m.name}>{m.name}</span>
                        <span className="text-gray-600 shrink-0">Win <span className="text-gray-400">{m.window_size}</span></span>
                        <span className="text-gray-600 shrink-0">Lat <span className="text-gray-400">{m.latent_dim}</span></span>
                        <span className="text-gray-600 shrink-0">K <span className="text-gray-400">{m.n_clusters}</span></span>
                        {m.scheduler && m.scheduler !== "none" && (
                          <span className="text-gray-600 shrink-0">Sched <span className="text-green-400">{m.scheduler}</span></span>
                        )}
                        {m.final_lr != null && (
                          <span className="text-gray-600 shrink-0">LR <span className="text-green-400">{m.final_lr.toExponential(2)}</span></span>
                        )}
                        <span className="text-gray-700 shrink-0">{m.saved_at?.slice(0, 16).replace("T", " ") ?? ""}</span>
                        {m.is_active && <span className="text-indigo-400 font-semibold shrink-0">● active</span>}
                        <span className="flex items-center gap-1 ml-auto shrink-0">
                          {confirming === modelKey ? (
                            <ConfirmButtons onYes={() => handleDeleteModel(m.name)} onNo={() => setConfirm(null)} />
                          ) : confirming === `deactivate:${m.name}` ? (
                            <>
                              <span className="text-amber-400 text-[11px]">Deactivate?</span>
                              <button
                                onClick={handleDeactivate}
                                disabled={deactivating}
                                className="bg-amber-700 hover:bg-amber-600 disabled:opacity-50 px-2 py-1 rounded text-[11px] font-semibold"
                              >
                                {deactivating ? "…" : "Yes"}
                              </button>
                              <button onClick={() => setConfirm(null)} className="bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-[11px] font-semibold">No</button>
                            </>
                          ) : (
                            <>
                              {m.is_active ? (
                                <button
                                  onClick={() => setConfirm(`deactivate:${m.name}`)}
                                  className="bg-amber-900 hover:bg-amber-800 text-amber-300 px-2.5 py-1 rounded text-[11px] font-semibold"
                                >
                                  Deactivate
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleUseModel(f, m)}
                                  disabled={isActive}
                                  className="bg-indigo-700 hover:bg-indigo-600 disabled:opacity-40 px-2.5 py-1 rounded text-[11px] font-semibold"
                                >
                                  {isActive ? "…" : "Set Active"}
                                </button>
                              )}
                              <button
                                onClick={() => setConfirm(modelKey)}
                                className="bg-gray-700 hover:bg-red-800 px-2.5 py-1 rounded text-[11px] font-semibold text-gray-400 hover:text-red-300"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* No models placeholder */}
              {(!f.models || f.models.length === 0) && (
                <div className="px-3 py-1.5 text-[11px] text-gray-700 bg-gray-900/40 flex items-center gap-2">
                  <span className="text-gray-800">⊕</span>
                  No model trained for this symbol / timeframe yet
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function DownloadPage() {
  const [form, setForm] = useState({
    symbol: "TSLA", timeframe: "5Min",
    start: "2024-01-01", end: today(),
  });
  const [state, setState]         = useState("idle");
  const [barsTotal, setBarsTotal] = useState(0);
  const [savedPath, setSavedPath] = useState("");
  const [error, setError]         = useState("");

  useEffect(() => {
    api.getConfig()
      .then((cfg) => setForm((f) => ({
        ...f,
        symbol:    cfg.symbol     ?? f.symbol,
        timeframe: cfg.timeframe  ?? f.timeframe,
        start:     cfg.start_date ?? f.start,
        end:       cfg.end_date   ?? f.end,
      })))
      .catch(() => {});
  }, []);

  function handleUse(file) {
    api.updateConfig({ symbol: file.ticker, timeframe: file.timeframe }).catch(() => {});
    setForm((f) => ({
      ...f,
      symbol:    file.ticker,
      timeframe: file.timeframe,
      start:     file.start_date,
      end:       file.end_date,
    }));
  }

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

  const FORM_FIELDS = [
    { key: "symbol",    label: "Symbol",     type: "text" },
    { key: "timeframe", label: "Timeframe",  type: "text" },
    { key: "start",     label: "Start Date", type: "date" },
    { key: "end",       label: "End Date",   type: "date" },
  ];

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold mb-6">Download Bars</h1>

      <AvailableDownloads onUse={handleUse} />

      <GuidancePanel timeframe={form.timeframe} onApply={applyRange} />

      <div className="grid grid-cols-2 gap-4 mb-6">
        {FORM_FIELDS.map(({ key, label, type }) => (
          <div key={key} className="flex flex-col gap-1">
            <label className="text-xs text-gray-400 flex items-center">
              {label}
              <FieldInfo info={INFO[key]} />
            </label>
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

import { useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries, HistogramSeries, LineSeries, LineStyle } from "lightweight-charts";
import {
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from "recharts";
import { api } from "../api.js";
import { ws } from "../ws.js";
import PanelInfo from "../components/PanelInfo.jsx";

const COLORS = ["#6366f1","#f59e0b","#10b981","#ef4444","#3b82f6","#8b5cf6","#ec4899","#14b8a6"];
const HISTORY_LEN = 200;

const SPEED_OPTIONS = [
  { value: "full", label: "Full Speed",      delayMs: 0    },
  { value: "1s",   label: "Every 1 second",  delayMs: 1000 },
  { value: "5s",   label: "Every 5 seconds", delayMs: 5000 },
];

// ── Panel info content ─────────────────────────────────────────────────────────

const PANEL_INFO = {
  mse: {
    label: "MSE Timeline",
    what: "Mean Squared Error — how well the model can reconstruct the current window from its compressed latent representation. Low MSE means the model recognised this pattern from training. High MSE means it encountered something unfamiliar.",
    watch: [
      "A flat line with occasional spikes is healthy. The model knows what it's looking at most of the time.",
      "A sudden spike = the model saw something it hasn't seen before — could be a breakout, news-driven move, or unusual volume.",
      "Sustained high MSE = the market has shifted into a regime the model wasn't trained on. Consider retraining.",
      "The amber dashed line is the p95 threshold — anything above it is in the top 5% most 'surprising' windows seen so far this session.",
    ],
  },
  bar: {
    label: "Current Bar",
    what: "A snapshot of the most recently processed bar: its timestamp, reconstruction error, and the cluster the model assigned it to.",
    watch: [
      "Watch the cluster label over time. Staying in one cluster = persistent, consistent behaviour (trend or tight range). Rapidly switching clusters = choppy, uncertain price action.",
      "Cross-reference the MSE here with the MSE Timeline — a high number here explains a spike on the chart.",
    ],
  },
  window: {
    label: "Current Window",
    what: "A greyscale image of the 14 technical indicator channels × 64 bars that the model just processed. Each row is one feature (ema, macd, body size, volume ratio, etc.); each column is one bar in the window. Brighter pixel = higher scaled value.",
    watch: [
      "Clean, horizontal bands = the features are moving consistently. The model likely sees a trend or steady regime.",
      "Lots of vertical variation / noise = choppy, erratic price action across features.",
      "A sharp change in brightness on the right edge = a recent shift in market character — watch the MSE spike.",
      "This is the exact input the model 'sees'. If MSE is high, look here to understand why.",
    ],
  },
  latent: {
    label: "Latent Vector",
    what: "The compressed fingerprint the encoder extracted from this window. It's the model's internal summary of 'what is the market doing right now'. K-Means clustering runs in this space — windows with similar bar patterns here land in the same cluster.",
    watch: [
      "Both indigo (positive) and red (negative) bars are normal — the pattern across all values is what matters, not individual bars.",
      "If consecutive windows look nearly identical here, the model thinks the market is repeating the same behaviour.",
      "A sudden dramatic shift in the bar pattern = the encoder detected a regime change, even if price hasn't moved much yet.",
      "Compare this to the t-SNE scatter on the Latent Space page — each dot there is one of these vectors projected into 2D.",
    ],
  },
  history: {
    label: "Cluster History",
    what: `The last ${HISTORY_LEN} windows colour-coded by the cluster the model assigned each one to. Time runs left to right. The colours match the clusters on the Latent Space page.`,
    watch: [
      "Long runs of the same colour = the model sees a persistent regime. Characteristic of a trend or a quiet consolidation.",
      "Rapidly alternating colours = choppy, indecisive action. The model can't find a stable pattern.",
      "A new colour appearing and staying = the market transitioned into a behaviour the model treats as distinct.",
      "Watch for colour changes that coincide with MSE spikes — a regime change often shows up in both at the same time.",
    ],
  },
};

function MSEChart({ data, p95, onChartCreated, runId }) {
  const containerRef     = useRef(null);
  const chartRef         = useRef(null);
  const lineRef          = useRef(null);
  const p95LineRef       = useRef(null);
  const hasInitialFitRef = useRef(false);

  useEffect(() => { hasInitialFitRef.current = false; }, [runId]);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout:    { background: { color: "#111827" }, textColor: "#9CA3AF" },
      grid:      { vertLines: { color: "#1f2937" }, horzLines: { color: "#1f2937" } },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: "#374151" },
      timeScale:  { borderColor: "#374151", timeVisible: true, secondsVisible: false },
      width:  containerRef.current.clientWidth,
      height: 240,
    });
    const line = chart.addSeries(LineSeries, {
      color: "#6366f1", lineWidth: 1,
      lastValueVisible: false, priceLineVisible: false,
    });
    chartRef.current = chart;
    lineRef.current  = line;
    onChartCreated?.(chart, line);

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: containerRef.current?.clientWidth ?? 800 });
    });
    ro.observe(containerRef.current);
    return () => { ro.disconnect(); chart.remove(); };
  }, []);

  useEffect(() => {
    if (!data?.length || !lineRef.current) return;
    lineRef.current.setData(
      data.map(d => ({ time: Math.floor(new Date(d.timestamp).getTime() / 1000), value: d.mse }))
    );
    if (!hasInitialFitRef.current) {
      hasInitialFitRef.current = true;
      chartRef.current.timeScale().fitContent();
    }
  }, [data]);

  useEffect(() => {
    if (!lineRef.current) return;
    if (p95LineRef.current) { lineRef.current.removePriceLine(p95LineRef.current); p95LineRef.current = null; }
    if (p95 != null) {
      p95LineRef.current = lineRef.current.createPriceLine({
        price: p95, color: "#f59e0b", lineWidth: 1,
        lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "p95",
      });
    }
  }, [p95]);

  return <div ref={containerRef} className="w-full" />;
}

function CandleChart({ data, onChartCreated }) {
  const containerRef     = useRef(null);
  const chartRef         = useRef(null);
  const candleRef        = useRef(null);
  const volRef           = useRef(null);
  const ema9Ref          = useRef(null);
  const ema21Ref         = useRef(null);
  const ema50Ref         = useRef(null);
  const hasInitialFitRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout:    { background: { color: "#111827" }, textColor: "#9CA3AF" },
      grid:      { vertLines: { color: "#1f2937" }, horzLines: { color: "#1f2937" } },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: "#374151" },
      timeScale:  { borderColor: "#374151", timeVisible: true, secondsVisible: false },
      width:  containerRef.current.clientWidth,
      height: 320,
    });

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981", downColor: "#ef4444",
      borderUpColor: "#10b981", borderDownColor: "#ef4444",
      wickUpColor: "#10b981", wickDownColor: "#ef4444",
    });

    const vol = chart.addSeries(HistogramSeries, {
      color: "#374151",
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

    const ema9  = chart.addSeries(LineSeries, { color: "#6366f1", lineWidth: 1, title: "EMA 9",  lastValueVisible: false, priceLineVisible: false });
    const ema21 = chart.addSeries(LineSeries, { color: "#f59e0b", lineWidth: 1, title: "EMA 21", lastValueVisible: false, priceLineVisible: false });
    const ema50 = chart.addSeries(LineSeries, { color: "#10b981", lineWidth: 1, title: "EMA 50", lastValueVisible: false, priceLineVisible: false });

    chartRef.current  = chart;
    candleRef.current = candles;
    volRef.current    = vol;
    ema9Ref.current   = ema9;
    ema21Ref.current  = ema21;
    ema50Ref.current  = ema50;
    onChartCreated?.(chart, candles);

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: containerRef.current?.clientWidth ?? 800 });
    });
    ro.observe(containerRef.current);
    return () => { ro.disconnect(); chart.remove(); };
  }, []);

  useEffect(() => {
    if (!data?.length || !candleRef.current) return;
    candleRef.current.setData(data.map(d => ({ time: d.t, open: d.o, high: d.h, low: d.l, close: d.c })));
    volRef.current.setData(data.map(d => ({ time: d.t, value: d.v, color: d.c >= d.o ? "#10b98133" : "#ef444433" })));
    ema9Ref.current.setData(data.map(d => ({ time: d.t, value: d.e9  })));
    ema21Ref.current.setData(data.map(d => ({ time: d.t, value: d.e21 })));
    ema50Ref.current.setData(data.map(d => ({ time: d.t, value: d.e50 })));
    if (!hasInitialFitRef.current) {
      hasInitialFitRef.current = true;
      chartRef.current.timeScale().fitContent();
    }
  }, [data]);

  return <div ref={containerRef} className="w-full" />;
}

function CrossSymbolGuide({ activeModel, csvInfo }) {
  const [open, setOpen] = useState(false);

  const modelSymbol = activeModel?.symbol?.toUpperCase();
  const csvSymbol   = csvInfo?.symbol?.toUpperCase();
  const isCross     = modelSymbol && csvSymbol && modelSymbol !== csvSymbol;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl mb-6 overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-300 hover:text-gray-100 hover:bg-gray-800/40 transition-colors"
      >
        <span className="flex items-center gap-2">
          Cross-Symbol Inference
          {isCross && (
            <span className="text-[11px] font-normal bg-amber-900/60 text-amber-300 border border-amber-800 rounded px-1.5 py-0.5">
              active — {modelSymbol} model → {csvSymbol} data
            </span>
          )}
        </span>
        <span className="text-gray-500 text-xs">{open ? "▲ Hide" : "▼ Show"}</span>
      </button>

      {open && (
        <div className="border-t border-gray-800 px-5 py-4 space-y-4 text-sm text-gray-400">

          <div>
            <p className="text-gray-200 font-semibold mb-1">What it is</p>
            <p>
              The model never sees raw prices. It learns from 14 normalised technical indicator
              features — EMAs, MACD, candle body/wick ratios, log returns, volume ratio — all
              scaled by a RobustScaler. Because these features describe <em>pattern shapes</em>,
              not absolute values, a model trained on one symbol can score windows from any other
              symbol's CSV. The model assigns each window to the nearest cluster it learned during
              training and measures how well it can reconstruct that pattern.
            </p>
          </div>

          <div>
            <p className="text-gray-200 font-semibold mb-1">How to use it</p>
            <ol className="list-decimal list-inside space-y-1 text-gray-400">
              <li>On the <strong className="text-gray-300">Download</strong> page, download the target symbol's CSV and click <strong className="text-gray-300">Use CSV</strong>.</li>
              <li>On the <strong className="text-gray-300">Download</strong> page, set the trained model as active with <strong className="text-gray-300">Set Active</strong>.</li>
              <li>Return here — the Model and CSV strips above should show different symbols.</li>
              <li>Set your date range and click <strong className="text-gray-300">Start</strong>.</li>
            </ol>
          </div>

          <div>
            <p className="text-gray-200 font-semibold mb-1">What to expect</p>
            <ul className="list-disc list-inside space-y-1 text-gray-400">
              <li><strong className="text-gray-300">Higher baseline MSE</strong> — the scaler was fitted on the training symbol's feature distribution. The target symbol's IQR and median will differ slightly, raising the floor MSE. This is normal.</li>
              <li><strong className="text-gray-300">Cluster assignments still meaningful</strong> — the model maps the target symbol's windows to whichever of its learned regimes they most resemble. A TSLA-trained "trending" cluster will attract trending MSFT windows.</li>
              <li><strong className="text-gray-300">MSE spikes still signal anomalies</strong> — even on a different symbol, a sudden spike means the model encountered a pattern it has never seen. Watch for these against news or earnings events.</li>
              <li><strong className="text-gray-300">Best-transferring features</strong> — returns, log-returns, and MACD patterns transfer most cleanly. Features tied to absolute price levels (EMA ratios) transfer less cleanly when the symbols have very different volatility profiles.</li>
            </ul>
          </div>

          <div>
            <p className="text-gray-200 font-semibold mb-1">What to watch for</p>
            <ul className="list-disc list-inside space-y-1 text-gray-400">
              <li>Compare the <strong className="text-gray-300">p95 line</strong> on the MSE Timeline — if it's much higher than it was on the training symbol, the symbols have meaningfully different volatility profiles.</li>
              <li>Watch whether the <strong className="text-gray-300">cluster history</strong> gravitates to a small subset of clusters — this means the target symbol's behaviour mostly resembles only a few of the trained regimes.</li>
              <li>For a cleaner baseline, train a dedicated model on the target symbol's data.</li>
            </ul>
          </div>

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
  const [activeModel, setActiveModel] = useState(null);
  const [csvInfo, setCsvInfo]         = useState(null);
  const [speed, setSpeed]     = useState("full");
  const [paused, setPaused]   = useState(false);
  const [mode, setMode]       = useState("walkforward"); // "walkforward" | "live"
  const [candleData, setCandleData] = useState([]);
  const [runId, setRunId]           = useState(0);
  const candleAccumRef         = useRef(new Map()); // t → bar, accumulates all received bars
  const mseTimeMapRef          = useRef(new Map()); // unix_sec → mse, for crosshair lookup
  const canvasRef              = useRef(null);
  const candleChartRef         = useRef(null);
  const candleSeriesRef        = useRef(null);
  const mseChartRef            = useRef(null);
  const mseSeriesRef           = useRef(null);
  const syncSetupRef           = useRef(null);   // holds the candle chart instance sync was set up for
  const syncingRef             = useRef(false);
  const crosshairSyncingRef    = useRef(false);
  const syncCleanupRef         = useRef(null);
  const activeRef             = useRef(false);
  const pausedRef             = useRef(false);  // mirrors paused for use inside intervals
  const pendingRef            = useRef(null);   // latest unprocessed infer_step
  const lastFlushRef          = useRef(0);      // ms timestamp of last UI update
  const speedRef              = useRef("full"); // mirrors speed for use inside intervals

  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  useEffect(() => {
    api.getActiveModel().then(m => setActiveModel(Object.keys(m).length ? m : null)).catch(() => {});
    api.getConfig().then(cfg => setCsvInfo({ symbol: cfg.symbol, timeframe: cfg.timeframe })).catch(() => {});
    // Sync inference state from backend — if a run is in progress (e.g. after page
    // navigation or refresh) show the Stop button instead of Start.
    api.inferResults().then(res => {
      if (res.state === "running") {
        setState("running");
        activeRef.current = true;
      }
    }).catch(() => {});
  }, []);

  // Collect incoming steps into pendingRef without touching state
  useEffect(() => {
    const offStep = ws.on("infer_step", (data) => {
      if (!activeRef.current) return;
      pendingRef.current = data;
    });
    const offDone = ws.on("infer_complete", () => {
      activeRef.current = false;
      setState("idle");
      // flush whatever is pending so the final bar always appears
      if (pendingRef.current) {
        flushPending(pendingRef.current);
        pendingRef.current = null;
      }
    });
    return () => { offStep(); offDone(); };
  }, []);

  // Poll at 50 ms and flush pending data when the chosen interval has elapsed
  useEffect(() => {
    const id = setInterval(() => {
      if (!pendingRef.current || pausedRef.current) return;
      const opt = SPEED_OPTIONS.find(o => o.value === speedRef.current) ?? SPEED_OPTIONS[0];
      const now = Date.now();
      if (now - lastFlushRef.current >= opt.delayMs) {
        flushPending(pendingRef.current);
        pendingRef.current = null;
        lastFlushRef.current = now;
      }
    }, 50);
    return () => clearInterval(id);
  }, []);

  function setupSync() {
    const c = candleChartRef.current;
    const m = mseChartRef.current;
    if (!c || !m) return;
    // Guard: skip if already wired for this exact candle chart instance.
    // Using the instance (not a boolean) so Strict Mode re-mounts trigger re-wiring.
    if (syncSetupRef.current === c) return;

    // Clean up any previous listeners (may be on a now-removed chart instance)
    try { syncCleanupRef.current?.(); } catch {}
    syncCleanupRef.current = null;
    syncSetupRef.current = c;

    // Pan/zoom sync via logical range. Candle has (warmupOffset) more bars than MSE,
    // so we shift by the live offset when translating logical indices.
    const candleRangeHandler = (logicalRange) => {
      if (syncingRef.current || !logicalRange) return;
      const offset = candleAccumRef.current.size - mseTimeMapRef.current.size;
      if (!offset) return;
      syncingRef.current = true;
      m.timeScale().setVisibleLogicalRange({ from: logicalRange.from - offset, to: logicalRange.to - offset });
      syncingRef.current = false;
    };
    const mseRangeHandler = (logicalRange) => {
      if (syncingRef.current || !logicalRange) return;
      const offset = candleAccumRef.current.size - mseTimeMapRef.current.size;
      if (!offset) return;
      syncingRef.current = true;
      c.timeScale().setVisibleLogicalRange({ from: logicalRange.from + offset, to: logicalRange.to + offset });
      syncingRef.current = false;
    };
    c.timeScale().subscribeVisibleLogicalRangeChange(candleRangeHandler);
    m.timeScale().subscribeVisibleLogicalRangeChange(mseRangeHandler);

    // Crosshair sync uses coordinateToTime() on the TARGET chart so that the visual
    // x-position (not the timestamp) drives alignment. The two charts show different
    // calendar times at the same x because of the warmup-bar offset, so timestamp
    // lookup across charts cannot work — matching by visual coordinate does.
    const candleCrosshairHandler = param => {
      if (crosshairSyncingRef.current || !param.point) return;
      crosshairSyncingRef.current = true;
      if (!param.time || !mseSeriesRef.current) {
        m.clearCrosshairPosition();
      } else {
        const mseTime = m.timeScale().coordinateToTime(param.point.x);
        if (mseTime != null) {
          const mseVal = mseTimeMapRef.current.get(mseTime);
          if (mseVal != null) m.setCrosshairPosition(mseVal, mseTime, mseSeriesRef.current);
          else m.clearCrosshairPosition();
        } else {
          m.clearCrosshairPosition();
        }
      }
      crosshairSyncingRef.current = false;
    };
    const mseCrosshairHandler = param => {
      if (crosshairSyncingRef.current || !param.point) return;
      crosshairSyncingRef.current = true;
      if (!param.time || !candleSeriesRef.current) {
        c.clearCrosshairPosition();
      } else {
        const candleTime = c.timeScale().coordinateToTime(param.point.x);
        if (candleTime != null) {
          const bar = candleAccumRef.current.get(candleTime);
          if (bar != null) c.setCrosshairPosition(bar.c, candleTime, candleSeriesRef.current);
          else c.clearCrosshairPosition();
        } else {
          c.clearCrosshairPosition();
        }
      }
      crosshairSyncingRef.current = false;
    };
    c.subscribeCrosshairMove(candleCrosshairHandler);
    m.subscribeCrosshairMove(mseCrosshairHandler);

    syncCleanupRef.current = () => {
      try {
        c.timeScale().unsubscribeVisibleLogicalRangeChange(candleRangeHandler);
        m.timeScale().unsubscribeVisibleLogicalRangeChange(mseRangeHandler);
        c.unsubscribeCrosshairMove(candleCrosshairHandler);
        m.unsubscribeCrosshairMove(mseCrosshairHandler);
      } catch {}
    };
  }

  function handleCandleChartReady(chart, series) { candleChartRef.current = chart; candleSeriesRef.current = series; setupSync(); }
  function handleMseChartReady(chart, series)    { mseChartRef.current    = chart; mseSeriesRef.current    = series; setupSync(); }

  function flushPending(data) {
    setMseData(prev => [...prev, { timestamp: data.timestamp, mse: data.mse }]);
    mseTimeMapRef.current.set(Math.floor(new Date(data.timestamp).getTime() / 1000), data.mse);
    setCurrent(data);
    setClusterHistory((prev) => [...prev.slice(-(HISTORY_LEN - 1)), data.cluster_label]);
    if (data.candle_data?.length) {
      data.candle_data.forEach(bar => candleAccumRef.current.set(bar.t, bar));
      setCandleData([...candleAccumRef.current.values()].sort((a, b) => a.t - b.t));
    }
    drawWindow(data);
  }

  const p95 = mseData.length
    ? [...mseData].sort((a, b) => a.mse - b.mse)[Math.floor(mseData.length * 0.95)]?.mse
    : null;

  function drawWindow(data) {
    const canvas = canvasRef.current;
    if (!canvas || !data.window_pixels) return;
    const win = data.window_pixels;
    const H = win.length, W = win[0].length;
    canvas.width  = W * 6;
    canvas.height = H * 6;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(W * 6, H * 6);
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const v = win[r][c];
        for (let dy = 0; dy < 6; dy++) {
          for (let dx = 0; dx < 6; dx++) {
            const i = ((r * 6 + dy) * W * 6 + c * 6 + dx) * 4;
            img.data[i] = img.data[i+1] = img.data[i+2] = v;
            img.data[i+3] = 255;
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  async function handleStart() {
    try { syncCleanupRef.current?.(); } catch {}
    syncCleanupRef.current = null;
    syncSetupRef.current   = null;
    setRunId(id => id + 1);
    setMseData([]);
    setCurrent(null);
    setClusterHistory([]);
    setCandleData([]);
    candleAccumRef.current  = new Map();
    mseTimeMapRef.current   = new Map();
    setError("");
    pendingRef.current   = null;
    lastFlushRef.current = 0;
    activeRef.current    = true;
    setPaused(false);
    setState("running");
    try {
      await api.startInfer({ ...form, speed, mode });
    } catch (e) {
      activeRef.current = false;
      setError(e.message);
      setState("error");
    }
  }

  async function handleStop() {
    activeRef.current = false;
    await api.stopInfer();
    setState("idle");
  }

  const latentData = current?.latent_vector
    ? current.latent_vector.map((v, i) => ({ i, v }))
    : [];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Live Inference</h1>

      {/* ── Active model / CSV info strip ── */}
      <div className="flex flex-wrap gap-4 mb-6 text-xs">
        <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
          <span className="text-gray-600 uppercase tracking-wider font-semibold">Model</span>
          {activeModel ? (
            <span className="text-indigo-300 font-mono">src/v2/backend/models/{activeModel.name}/</span>
          ) : (
            <span className="text-red-400">No active model — train one first</span>
          )}
          {activeModel && (
            <span className="text-gray-600">
              · W{activeModel.window_size} L{activeModel.latent_dim} K{activeModel.n_clusters}
              {activeModel.has_kmeans ? "" : " · ⚠ no K-Means yet"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
          <span className="text-gray-600 uppercase tracking-wider font-semibold">CSV</span>
          {csvInfo ? (
            <span className="text-indigo-300 font-mono">src/v2/backend/downloads/{csvInfo.symbol}/{csvInfo.timeframe}.csv</span>
          ) : (
            <span className="text-gray-600">loading…</span>
          )}
        </div>
      </div>

      {/* ── Cross-symbol guide ── */}
      <CrossSymbolGuide activeModel={activeModel} csvInfo={csvInfo} />

      {/* ── Mode toggle ── */}
      <div className="flex gap-2 mb-4">
        {[
          { value: "walkforward", label: "Walk-forward" },
          { value: "live",        label: "Live (Alpaca)" },
        ].map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setMode(value)}
            disabled={state === "running"}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors
              ${mode === value
                ? "bg-indigo-600 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700 disabled:opacity-50"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Controls ── */}
      <div className="flex gap-3 items-end mb-6 flex-wrap">
        {mode === "walkforward" && (
          <>
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

            {/* Stream speed dropdown */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400">Stream Speed</label>
              <select
                value={speed}
                onChange={(e) => setSpeed(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
              >
                {SPEED_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </>
        )}

        {mode === "live" && (
          <div className="flex flex-col gap-1 text-sm text-gray-400 mr-2">
            <p>
              Polls Alpaca every 60 s for new{" "}
              <span className="text-gray-300 font-mono">
                {activeModel?.symbol ?? csvInfo?.symbol ?? "—"} {csvInfo?.timeframe ?? "—"}
              </span>{" "}
              bars. Results appear only during market hours.
            </p>
            {current && state === "running" && (
              <p className="text-gray-300 text-xs">Last bar: {current.timestamp}</p>
            )}
          </div>
        )}

        <button
          onClick={handleStart}
          disabled={state === "running"}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-5 py-2 rounded text-sm font-semibold"
        >
          {state === "running" ? "Running…" : "Start"}
        </button>
        <button
          onClick={() => setPaused(p => !p)}
          disabled={state !== "running"}
          className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 px-5 py-2 rounded text-sm font-semibold"
        >
          {paused ? "Resume" : "Pause"}
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
        <p className="text-sm text-gray-400 mb-3 flex items-center">
          MSE Timeline
          <PanelInfo {...PANEL_INFO.mse} />
        </p>
        <MSEChart data={mseData} p95={p95} onChartCreated={handleMseChartReady} runId={runId} />
      </div>

      {/* Panel — Candlestick Chart */}
      {candleData.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-4 mb-6">
          <p className="text-sm text-gray-400 mb-1 flex items-center gap-3">
            OHLCV
            <span className="text-xs text-gray-600">
              <span style={{ color: "#6366f1" }}>— EMA 9</span>
              {" · "}
              <span style={{ color: "#f59e0b" }}>— EMA 21</span>
              {" · "}
              <span style={{ color: "#10b981" }}>— EMA 50</span>
            </span>
          </p>
          <CandleChart data={candleData} onChartCreated={handleCandleChartReady} />
        </div>
      )}

      <div className="grid grid-cols-3 gap-6 mb-6">
        {/* Panel B — Current Bar Info */}
        <div className="bg-gray-900 rounded-xl p-4">
          <p className="text-sm text-gray-400 mb-3 flex items-center">
            Current Bar
            <PanelInfo {...PANEL_INFO.bar} />
          </p>
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
          <p className="text-sm text-gray-400 mb-3 flex items-center">
            Current Window
            <PanelInfo {...PANEL_INFO.window} />
          </p>
          <canvas ref={canvasRef} style={{ imageRendering: "pixelated" }} className="border border-gray-700" />
          {!current && <p className="text-gray-600 text-xs mt-2">No data yet.</p>}
        </div>

        {/* Panel D — Latent Vector */}
        <div className="bg-gray-900 rounded-xl p-4">
          <p className="text-sm text-gray-400 mb-3 flex items-center">
            Latent Vector
            <PanelInfo {...PANEL_INFO.latent} />
          </p>
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
        <p className="text-sm text-gray-400 mb-2 flex items-center">
          Cluster History (last {HISTORY_LEN})
          <PanelInfo {...PANEL_INFO.history} />
        </p>
        <div className="flex h-6 rounded overflow-hidden">
          {clusterHistory.map((label, i) => (
            <div
              key={i}
              title={`Cluster ${label}`}
              style={{ flex: 1, backgroundColor: COLORS[label % COLORS.length] }}
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

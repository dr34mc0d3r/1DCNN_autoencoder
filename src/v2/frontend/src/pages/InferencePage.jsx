import { useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries, HistogramSeries, LineSeries, LineStyle, createSeriesMarkers } from "lightweight-charts";
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
      "The amber dashed line is the historical p95 threshold — computed from a completed walk-forward run. Anything above it is in the top 5% most 'surprising' windows from training history.",
      "The lighter dashed line is the historical median (p50). Values below it mean the model is highly confident; above it means above-average reconstruction difficulty.",
      "Coloured dots mark cluster transitions — when the model switches from one learned regime to another.",
    ],
  },
  bar: {
    label: "Current Bar",
    what: "A snapshot of the most recently processed bar: its timestamp, reconstruction error, percentile rank against the historical baseline, and the cluster the model assigned it to.",
    watch: [
      "The percentile rank puts the MSE in historical context — p12 means this bar's MSE is lower than 88% of all training bars. Only visible after a walk-forward run has established the baseline.",
      "Watch the cluster label over time. Staying in one cluster = persistent, consistent behaviour. Rapidly switching clusters = choppy, uncertain price action.",
      "Cross-reference the MSE here with the MSE Timeline — a high number here explains a spike on the chart.",
    ],
  },
  window: {
    label: "Current Window",
    what: "A greyscale image of the 26 technical indicator channels × 64 bars that the model just processed. Each row is one feature (ema, macd, body size, volume ratio, etc.); each column is one bar in the window. Brighter pixel = higher scaled value.",
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
  featureMse: {
    label: "Feature MSE Contribution",
    what: "Per-feature reconstruction error for the current window — how much each of the 26 indicator channels contributed to the overall MSE. Each bar is the mean squared error between the original and reconstructed values for that feature across all 64 bars in the window.",
    watch: [
      "The features with the tallest bars are the ones the model struggled to reconstruct. These are driving the overall MSE.",
      "During unusual price action, you'll typically see spikes in return, log_return, vol_return, or atr_14 — the high-frequency features.",
      "If ema or macd features dominate, the model is confused about the trend direction.",
      "Sorted highest to lowest. The top few features are almost always the meaningful signal.",
    ],
  },
};

// ── MSE percentile rank ────────────────────────────────────────────────────────

function msePercentileRank(mse, baseline) {
  if (!baseline) return null;
  const points = [
    [0,   baseline.min],
    [5,   baseline.p5],
    [10,  baseline.p10],
    [25,  baseline.p25],
    [50,  baseline.p50],
    [75,  baseline.p75],
    [90,  baseline.p90],
    [95,  baseline.p95],
    [99,  baseline.p99],
    [100, baseline.max],
  ];
  if (mse <= baseline.min) return 0;
  if (mse >= baseline.max) return 100;
  for (let i = 1; i < points.length; i++) {
    const [p1, v1] = points[i - 1];
    const [p2, v2] = points[i];
    if (mse <= v2) {
      if (v2 === v1) return p1;
      return Math.round(p1 + (mse - v1) / (v2 - v1) * (p2 - p1));
    }
  }
  return 100;
}

function MSEChart({ data, p95, p50, markers, onChartCreated, runId }) {
  const containerRef      = useRef(null);
  const chartRef          = useRef(null);
  const lineRef           = useRef(null);
  const markersPluginRef  = useRef(null);
  const p95LineRef        = useRef(null);
  const p50LineRef        = useRef(null);
  const hasInitialFitRef  = useRef(false);

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
    chartRef.current         = chart;
    lineRef.current          = line;
    markersPluginRef.current = createSeriesMarkers(line, []);
    onChartCreated?.(chart, line);

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: containerRef.current?.clientWidth ?? 800 });
    });
    ro.observe(containerRef.current);
    return () => { ro.disconnect(); chart.remove(); markersPluginRef.current = null; };
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

  useEffect(() => {
    if (!lineRef.current) return;
    if (p50LineRef.current) { lineRef.current.removePriceLine(p50LineRef.current); p50LineRef.current = null; }
    if (p50 != null) {
      p50LineRef.current = lineRef.current.createPriceLine({
        price: p50, color: "#6b7280", lineWidth: 1,
        lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "p50",
      });
    }
  }, [p50]);

  useEffect(() => {
    if (!markersPluginRef.current) return;
    markersPluginRef.current.setMarkers(
      (markers || []).map(m => ({
        time:     m.time,
        position: "aboveBar",
        color:    COLORS[m.cluster % COLORS.length],
        shape:    "circle",
        text:     `${m.cluster}`,
        size:     1,
      }))
    );
  }, [markers]);

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

// ── SVG illustrations ──────────────────────────────────────────────────────────

const SVG_AUTOENCODER = (
  <svg viewBox="0 0 580 112" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-xl">
    {/* Input block */}
    <rect x="2" y="16" width="72" height="80" rx="5" fill="#1f2937" stroke="#374151" strokeWidth="1.5"/>
    {[0,1,2,3,4].map(r => [0,1,2,3].map(c => (
      <rect key={`${r}${c}`} x={8+c*15} y={22+r*14} width="12" height="10" rx="1"
        fill={`rgba(99,102,241,${0.15 + (r*4+c)*0.035})`} stroke="#374151" strokeWidth="0.5"/>
    )))}
    <text x="38" y="108" textAnchor="middle" fill="#6b7280" fontSize="9">26 features</text>
    <text x="38" y="118" textAnchor="middle" fill="#6b7280" fontSize="9">× 64 bars</text>

    {/* Encoder arrow + label */}
    <path d="M78 56 L108 56" stroke="#6366f1" strokeWidth="1.5" markerEnd="url(#arr)"/>
    <defs>
      <marker id="arr" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
        <path d="M0,0 L0,6 L6,3 z" fill="#6366f1"/>
      </marker>
      <marker id="arrB" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
        <path d="M0,0 L0,6 L6,3 z" fill="#3b82f6"/>
      </marker>
      <marker id="arrA" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
        <path d="M0,0 L0,6 L6,3 z" fill="#f59e0b"/>
      </marker>
    </defs>

    {/* Encoder funnel */}
    <polygon points="110,16 110,96 148,40 148,72" fill="#312e81" stroke="#6366f1" strokeWidth="1.5"/>
    <text x="129" y="57" textAnchor="middle" fill="#a5b4fc" fontSize="8.5" fontWeight="600">Encoder</text>
    <text x="129" y="67" textAnchor="middle" fill="#818cf8" fontSize="7.5">compress</text>

    {/* Latent vector box */}
    <rect x="152" y="36" width="44" height="40" rx="5" fill="#1e1b4b" stroke="#6366f1" strokeWidth="2"/>
    <text x="174" y="54" textAnchor="middle" fill="#e0e7ff" fontSize="10" fontWeight="700">32</text>
    <text x="174" y="65" textAnchor="middle" fill="#a5b4fc" fontSize="8">numbers</text>
    <text x="174" y="87" textAnchor="middle" fill="#6b7280" fontSize="7.5">latent vector</text>

    {/* Decoder arrow */}
    <path d="M200 56 L228 56" stroke="#3b82f6" strokeWidth="1.5" markerEnd="url(#arrB)"/>

    {/* Decoder funnel */}
    <polygon points="230,40 230,72 268,16 268,96" fill="#1a2744" stroke="#3b82f6" strokeWidth="1.5"/>
    <text x="249" y="57" textAnchor="middle" fill="#93c5fd" fontSize="8.5" fontWeight="600">Decoder</text>
    <text x="249" y="67" textAnchor="middle" fill="#60a5fa" fontSize="7.5">rebuild</text>

    {/* Output block */}
    <rect x="272" y="16" width="72" height="80" rx="5" fill="#1f2937" stroke="#374151" strokeWidth="1.5"/>
    {[0,1,2,3,4].map(r => [0,1,2,3].map(c => (
      <rect key={`o${r}${c}`} x={278+c*15} y={22+r*14} width="12" height="10" rx="1"
        fill={`rgba(59,130,246,${0.12 + (r*4+c)*0.032})`} stroke="#374151" strokeWidth="0.5"/>
    )))}
    <text x="308" y="108" textAnchor="middle" fill="#6b7280" fontSize="9">Rebuilt</text>
    <text x="308" y="118" textAnchor="middle" fill="#6b7280" fontSize="9">version</text>

    {/* MSE arrow */}
    <path d="M348 56 L378 56" stroke="#f59e0b" strokeWidth="1.5" markerEnd="url(#arrA)"/>
    <text x="362" y="48" textAnchor="middle" fill="#6b7280" fontSize="7.5">compare</text>

    {/* MSE box */}
    <rect x="382" y="26" width="80" height="60" rx="5" fill="#451a03" stroke="#f59e0b" strokeWidth="1.5"/>
    <text x="422" y="51" textAnchor="middle" fill="#fbbf24" fontSize="11" fontWeight="700">MSE</text>
    <text x="422" y="63" textAnchor="middle" fill="#d97706" fontSize="7.5">original vs rebuilt</text>
    <text x="422" y="74" textAnchor="middle" fill="#92400e" fontSize="7.5">low = good match</text>

    {/* "vs" annotation between input and output */}
    <path d="M74 96 Q190 130 272 96" stroke="#374151" strokeWidth="1" strokeDasharray="3,3" fill="none"/>
    <text x="174" y="128" textAnchor="middle" fill="#4b5563" fontSize="7.5">original vs rebuilt → difference = MSE</text>
  </svg>
);

const SVG_MSE_PATTERNS = (
  <svg viewBox="0 0 500 150" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-lg">
    <rect width="500" height="150" fill="#111827" rx="6"/>
    {/* axes */}
    <line x1="40" y1="10" x2="40" y2="110" stroke="#374151" strokeWidth="1"/>
    <line x1="40" y1="110" x2="490" y2="110" stroke="#374151" strokeWidth="1"/>
    <text x="8" y="115" fill="#6b7280" fontSize="8">MSE</text>
    <text x="260" y="128" textAnchor="middle" fill="#6b7280" fontSize="8">time →</text>
    {/* p95 dashed */}
    <line x1="40" y1="42" x2="490" y2="42" stroke="#f59e0b" strokeWidth="1" strokeDasharray="5,4"/>
    <text x="492" y="45" fill="#f59e0b" fontSize="8">p95</text>
    {/* p50 dashed */}
    <line x1="40" y1="75" x2="490" y2="75" stroke="#6b7280" strokeWidth="1" strokeDasharray="3,4"/>
    <text x="492" y="78" fill="#6b7280" fontSize="8">p50</text>
    {/* Normal flat section */}
    <path d="M45 80 Q60 82 75 79 Q90 81 105 80 Q120 79 135 80" stroke="#10b981" strokeWidth="2" fill="none"/>
    <rect x="55" y="13" width="70" height="16" rx="3" fill="#064e3b" stroke="#10b981" strokeWidth="1"/>
    <text x="90" y="24" textAnchor="middle" fill="#6ee7b7" fontSize="8.5" fontWeight="600">Normal</text>
    <line x1="90" y1="30" x2="90" y2="80" stroke="#10b981" strokeWidth="0.8" strokeDasharray="2,2"/>
    {/* Brief spike */}
    <path d="M140 80 Q155 78 165 38 Q170 30 175 38 Q182 78 195 80" stroke="#f59e0b" strokeWidth="2" fill="none"/>
    <rect x="148" y="13" width="70" height="16" rx="3" fill="#451a03" stroke="#f59e0b" strokeWidth="1"/>
    <text x="183" y="24" textAnchor="middle" fill="#fbbf24" fontSize="8.5" fontWeight="600">Unusual event</text>
    <line x1="175" y1="30" x2="175" y2="34" stroke="#f59e0b" strokeWidth="0.8" strokeDasharray="2,2"/>
    {/* Sustained elevation */}
    <path d="M200 80 Q215 55 230 48 Q260 44 310 46 Q340 47 360 80" stroke="#ef4444" strokeWidth="2" fill="none"/>
    <rect x="245" y="13" width="90" height="16" rx="3" fill="#450a0a" stroke="#ef4444" strokeWidth="1"/>
    <text x="290" y="24" textAnchor="middle" fill="#fca5a5" fontSize="8.5" fontWeight="600">Regime change</text>
    <line x1="290" y1="30" x2="285" y2="46" stroke="#ef4444" strokeWidth="0.8" strokeDasharray="2,2"/>
    {/* Return to normal */}
    <path d="M365 80 Q380 81 400 79 Q430 82 460 80" stroke="#10b981" strokeWidth="2" fill="none"/>
  </svg>
);

const SVG_WINDOW_GRID = (
  <svg viewBox="0 0 420 160" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-md">
    <rect width="420" height="160" fill="#111827" rx="6"/>
    {/* Column header: time */}
    <text x="248" y="16" textAnchor="middle" fill="#6b7280" fontSize="8">← 64 bars (time) →</text>
    <text x="24" y="155" textAnchor="middle" fill="#6b7280" fontSize="8" transform="rotate(-90,24,100)">← features →</text>

    {/* Simplified 6-row × 14-col grid */}
    {(() => {
      const rows = [
        { label: "ema_9",    vals: [3,4,5,6,7,8,9,9,8,8,8,7,7,6] },
        { label: "macd",     vals: [5,5,6,7,6,5,4,4,5,6,7,7,6,5] },
        { label: "return",   vals: [4,6,8,3,5,9,2,7,4,6,8,5,3,4] },
        { label: "vol_ret",  vals: [3,4,5,7,9,8,6,5,4,3,4,6,5,4] },
        { label: "rsi_14",   vals: [5,6,7,8,7,6,5,4,5,6,7,6,5,5] },
        { label: "bb_pct",   vals: [6,7,8,7,6,5,5,6,7,7,6,6,5,5] },
      ];
      const cells = [];
      rows.forEach((row, r) => {
        cells.push(
          <text key={`l${r}`} x="88" y={34+r*18} textAnchor="end" fill="#6b7280" fontSize="8">{row.label}</text>
        );
        row.vals.forEach((v, c) => {
          const brightness = Math.round((v / 9) * 200 + 30);
          const fill = `rgb(${brightness},${brightness},${brightness})`;
          cells.push(
            <rect key={`c${r}${c}`} x={92+c*22} y={23+r*18} width="20" height="14" rx="1"
              fill={fill} stroke="#1f2937" strokeWidth="0.5"/>
          );
        });
      });
      return cells;
    })()}

    {/* Trend annotation */}
    <rect x="92" y="133" width="110" height="20" rx="3" fill="#064e3b" stroke="#10b981" strokeWidth="1"/>
    <text x="147" y="147" textAnchor="middle" fill="#6ee7b7" fontSize="8">gradual = trend</text>

    {/* Noise annotation */}
    <rect x="212" y="133" width="110" height="20" rx="3" fill="#450a0a" stroke="#ef4444" strokeWidth="1"/>
    <text x="267" y="147" textAnchor="middle" fill="#fca5a5" fontSize="8">checkerboard = choppy</text>

    {/* Right edge bright annotation */}
    <rect x="324" y="23" width="24" height="95" rx="2" fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="3,2"/>
    <text x="358" y="55" fill="#f59e0b" fontSize="8" textAnchor="start">latest</text>
    <text x="358" y="65" fill="#f59e0b" fontSize="8" textAnchor="start">bar</text>
  </svg>
);

const SVG_CLUSTER_SPACE = (
  <svg viewBox="0 0 380 180" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-sm">
    <rect width="380" height="180" fill="#111827" rx="6"/>
    <text x="190" y="16" textAnchor="middle" fill="#6b7280" fontSize="8.5">Latent space — each dot is one window of bars</text>
    {/* Cluster 0 — indigo */}
    {[[60,60],[75,55],[65,75],[50,65],[80,70],[70,45]].map(([x,y],i)=>(
      <circle key={`c0${i}`} cx={x} cy={y} r="6" fill="#6366f1" opacity="0.7"/>
    ))}
    <text x="40" y="97" fill="#818cf8" fontSize="8.5" fontWeight="600">Cluster 0</text>
    <text x="40" y="108" fill="#6b7280" fontSize="7.5">quiet trend</text>
    {/* Cluster 1 — amber */}
    {[[190,50],[205,65],[175,70],[195,80],[215,55],[180,55]].map(([x,y],i)=>(
      <circle key={`c1${i}`} cx={x} cy={y} r="6" fill="#f59e0b" opacity="0.7"/>
    ))}
    <text x="175" y="97" fill="#fbbf24" fontSize="8.5" fontWeight="600">Cluster 1</text>
    <text x="175" y="108" fill="#6b7280" fontSize="7.5">volatile breakout</text>
    {/* Cluster 2 — green */}
    {[[310,80],[325,65],[300,70],[315,55],[335,75],[320,85]].map(([x,y],i)=>(
      <circle key={`c2${i}`} cx={x} cy={y} r="6" fill="#10b981" opacity="0.7"/>
    ))}
    <text x="295" y="97" fill="#34d399" fontSize="8.5" fontWeight="600">Cluster 2</text>
    <text x="295" y="108" fill="#6b7280" fontSize="7.5">reversal</text>
    {/* Cluster 3 — red */}
    {[[100,140],[115,130],[90,145],[105,125],[125,138]].map(([x,y],i)=>(
      <circle key={`c3${i}`} cx={x} cy={y} r="6" fill="#ef4444" opacity="0.7"/>
    ))}
    <text x="80" y="162" fill="#f87171" fontSize="8.5" fontWeight="600">Cluster 3</text>
    <text x="80" y="173" fill="#6b7280" fontSize="7.5">high vol consolidation</text>
    {/* Current bar — bright white with ring */}
    <circle cx="195" cy="65" r="9" fill="none" stroke="#ffffff" strokeWidth="2" strokeDasharray="3,2"/>
    <circle cx="195" cy="65" r="5" fill="#ffffff"/>
    <text x="218" y="58" fill="#ffffff" fontSize="8" fontWeight="600">← current bar</text>
    <text x="218" y="68" fill="#9ca3af" fontSize="7.5">assigned to cluster 1</text>
  </svg>
);

const SVG_COMBINED_SIGNALS = (
  <svg viewBox="0 0 480 140" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-lg">
    <rect width="480" height="140" fill="#111827" rx="6"/>
    {/* Three signal bars */}
    {[
      { label: "MSE",     x: 60,  val: 0.25, color: "#10b981", note: "low — model confident"    },
      { label: "Cluster", x: 200, val: 0.0,  color: "#6366f1", note: "stable — same regime"     },
      { label: "Feat MSE",x: 340, val: 0.2,  color: "#3b82f6", note: "returns leading — watch"  },
    ].map(({ label, x, val, color, note }) => (
      <g key={label}>
        <text x={x+40} y="20" textAnchor="middle" fill="#9ca3af" fontSize="9" fontWeight="600">{label}</text>
        <rect x={x} y="25" width="80" height="80" rx="4" fill="#1f2937" stroke="#374151"/>
        <rect x={x+10} y={105 - Math.round(val*60) - 10} width="60" height={Math.round(val*60)+10} rx="3" fill={color} opacity="0.8"/>
        <text x={x+40} y="118" textAnchor="middle" fill={color} fontSize="7.5">{note}</text>
      </g>
    ))}
    <text x="240" y="135" textAnchor="middle" fill="#4b5563" fontSize="8">Low MSE + stable cluster + moderate feature MSE → model is seeing a familiar, ongoing pattern</text>
  </svg>
);

// ── Beginner's Guide ───────────────────────────────────────────────────────────

function BeginnerGuide() {
  const [open, setOpen] = useState(false);

  const Section = ({ title, color = "#6366f1", children }) => (
    <div className="border-l-2 pl-5 mb-8" style={{ borderColor: color }}>
      <h3 className="text-base font-semibold mb-3" style={{ color }}>{title}</h3>
      {children}
    </div>
  );

  const Tag = ({ label, color }) => (
    <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded mr-1 mb-1"
      style={{ background: `${color}22`, color, border: `1px solid ${color}55` }}>
      {label}
    </span>
  );

  const bullets = (items, color = "#9ca3af") => (
    <ul className="space-y-1.5 mt-2">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2 text-sm" style={{ color: "#9ca3af" }}>
          <span style={{ color, flexShrink: 0 }}>›</span>
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl mb-6 overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-300 hover:text-gray-100 hover:bg-gray-800/40 transition-colors"
      >
        <span className="flex items-center gap-2">
          Understanding the Charts
          <span className="text-[11px] font-normal bg-indigo-900/40 text-indigo-300 border border-indigo-800 rounded px-1.5 py-0.5">
            Beginner's Guide
          </span>
        </span>
        <span className="text-gray-500 text-xs">{open ? "▲ Hide" : "▼ Show"}</span>
      </button>

      {open && (
        <div className="border-t border-gray-800 px-6 py-6">

          {/* ── 1. How the model works ── */}
          <Section title="How the Model Works — The Autoencoder" color="#6366f1">
            <p className="text-sm text-gray-400 mb-3">
              This model is a <strong className="text-gray-200">1D Convolutional Autoencoder</strong>. That's a mouthful —
              here's the simple version: it reads a window of 64 bars, squeezes all that information down to just 32 numbers,
              then tries to rebuild the original 64 bars from those 32 numbers alone. The difference between the original
              and the rebuilt version is the <strong className="text-gray-200">MSE score</strong>.
            </p>
            <div className="bg-gray-950 rounded-lg p-4 mb-4">{SVG_AUTOENCODER}</div>
            <p className="text-sm text-gray-500 mb-3">
              Think of it like this: if you asked someone to summarise a 64-page book in 32 words and then
              re-write the full book from that summary — a familiar book (normal market behaviour) would
              produce a low-error re-write. A book they'd never seen before (unusual price action) would
              produce a high-error re-write. That's exactly what MSE measures.
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              <Tag label="26 features per bar" color="#6366f1"/>
              <Tag label="64 bars per window" color="#6366f1"/>
              <Tag label="32-number compression" color="#6366f1"/>
              <Tag label="MSE = reconstruction error" color="#f59e0b"/>
            </div>
          </Section>

          {/* ── 2. MSE Timeline ── */}
          <Section title="MSE Timeline — The Main Signal" color="#f59e0b">
            <p className="text-sm text-gray-400 mb-3">
              The MSE timeline is the most important chart on this page. It shows, bar by bar, how well the
              model recognised what the market was doing. The lower the line, the more familiar the pattern.
              The higher the line, the more the model is saying "I haven't seen this before."
            </p>
            <div className="bg-gray-950 rounded-lg p-4 mb-4">{SVG_MSE_PATTERNS}</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="bg-gray-800/50 rounded-lg p-3 border border-emerald-900/50">
                <p className="text-xs font-semibold text-emerald-400 mb-1">Flat low line</p>
                <p className="text-xs text-gray-400">Model is confident. It's seen this price behaviour many times in training. Normal, expected market action.</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3 border border-amber-900/50">
                <p className="text-xs font-semibold text-amber-400 mb-1">Brief spike</p>
                <p className="text-xs text-gray-400">One unusual bar — a large candle, sudden volume surge, or news event. Typically recovers quickly if it was a one-off.</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3 border border-red-900/50">
                <p className="text-xs font-semibold text-red-400 mb-1">Sustained elevation</p>
                <p className="text-xs text-gray-400">The market has moved into a regime the model wasn't trained on. MSE stays high across many bars. Worth investigating.</p>
              </div>
            </div>
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-1">Reference lines</p>
            {bullets([
              "Amber dashed line (p95) — from historical walk-forward. Only 5% of bars from training history exceeded this. A spike above it is genuinely rare, not just high today.",
              "Grey dashed line (p50) — the historical median. Values below this mean the model is more confident than it was for half of all training bars.",
              "Coloured dots — cluster transitions. When the model switches from one learned pattern-type to another, a dot appears.",
            ], "#f59e0b")}
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mt-4 mb-1">Finding hidden patterns</p>
            {bullets([
              "A gradual MSE rise over many bars (not a sudden spike) often signals a slow regime shift — the market is drifting away from patterns the model learned.",
              "MSE rising while price is flat suggests something changed in a non-price feature — volume dynamics, spread, or time-of-day behaviour.",
              "A spike followed by immediate recovery = the model re-anchored itself. Watch the cluster label — it may have briefly switched clusters then returned.",
              "If MSE and price move in opposite directions, the model found something unusual in the structure of the move, not just the magnitude.",
            ], "#f59e0b")}
          </Section>

          {/* ── 3. Candlestick chart ── */}
          <Section title="Candlestick Chart (OHLCV)" color="#10b981">
            <p className="text-sm text-gray-400 mb-3">
              The OHLCV chart shows the standard view of price: each candle represents one 5-minute bar.
              Green candles closed higher than they opened; red closed lower. The thin wicks show how far
              price moved above and below the open/close during that bar.
              The three coloured lines are <strong className="text-gray-200">Exponential Moving Averages</strong> (EMAs) —
              smoothed versions of recent price that help show trend direction.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="bg-gray-800/50 rounded-lg p-3 border border-indigo-900/50">
                <p className="text-xs font-semibold text-indigo-400 mb-1">EMA 9 (fast)</p>
                <p className="text-xs text-gray-400">Reacts quickly to price changes. Crosses above EMA 21 = short-term bullish signal.</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3 border border-amber-900/50">
                <p className="text-xs font-semibold text-amber-400 mb-1">EMA 21 (medium)</p>
                <p className="text-xs text-gray-400">Short-to-medium trend direction. Price bouncing off EMA 21 = common support/resistance level.</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3 border border-emerald-900/50">
                <p className="text-xs font-semibold text-emerald-400 mb-1">EMA 50 (slow)</p>
                <p className="text-xs text-gray-400">Broader trend. Price trading above EMA 50 = market in a medium-term uptrend.</p>
              </div>
            </div>
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-1">Model performance signals — relate this chart to MSE</p>
            {bullets([
              "EMA fan-out (all three spreading apart) = strong trend — the model likely shows low MSE and a consistent cluster because trends are well-represented in training.",
              "EMA pinch (all three converging) = consolidation, low directional momentum. The model often sees this as very familiar and scores it with low MSE.",
              "Large wicks (candles with long thin tails) = price rejected a level. This can spike MSE temporarily because the feature values jump and recover in ways that are unusual.",
              "Volume bars (bottom histogram) — spikes in volume that don't match price movement are one of the first things the Feature MSE panel will flag.",
            ], "#10b981")}
          </Section>

          {/* ── 4. Current Bar ── */}
          <Section title="Current Bar Panel" color="#3b82f6">
            <p className="text-sm text-gray-400 mb-3">
              This panel is a snapshot of the most recently processed bar: when it occurred, the MSE score for
              the 64-bar window ending at that bar, and which cluster the model assigned it to.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="bg-gray-800/50 rounded-lg p-3 border border-blue-900/50">
                <p className="text-xs font-semibold text-blue-400 mb-2">The percentile rank badge (p{"{n}"})</p>
                <p className="text-xs text-gray-400 mb-2">
                  The small coloured tag next to MSE puts the score in historical context. It tells you where
                  this bar sits relative to all bars processed in the last completed walk-forward run.
                </p>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-emerald-900/60 text-emerald-300">p12</span>
                    <span className="text-xs text-gray-400">MSE lower than 88% of history — model very confident</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">p51</span>
                    <span className="text-xs text-gray-400">Near median — average reconstruction difficulty</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-300">p82</span>
                    <span className="text-xs text-gray-400">Elevated — worth checking Feature MSE for the cause</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-red-900/60 text-red-300">p97</span>
                    <span className="text-xs text-gray-400">Top 3% most surprising — genuine anomaly signal</span>
                  </div>
                </div>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3 border border-blue-900/50">
                <p className="text-xs font-semibold text-blue-400 mb-2">The cluster number</p>
                <p className="text-xs text-gray-400 mb-2">
                  The model sorted all patterns it saw during training into groups (clusters) based on
                  similarity. Each cluster represents a type of market behaviour — the model doesn't name
                  them, but you can learn what each one looks like by watching which candle patterns
                  produce which cluster labels consistently.
                </p>
                <p className="text-xs text-gray-500">
                  Common cluster meanings (yours will vary): one cluster often corresponds to quiet
                  sideways action, another to trending moves, another to high-volatility chop. Discover
                  them on the Cluster Profile page.
                </p>
              </div>
            </div>
            {bullets([
              "The cluster number matters most when it changes — a switch from cluster 2 to cluster 5 after 40 bars of stability often precedes or confirms a price move.",
              "MSE at p30 with cluster 3 = confident assignment to a known pattern. MSE at p90 with cluster 7 = model found the nearest cluster but the fit is poor — treat with caution.",
              "During walk-forward, the percentile rank is a direct comparison to training history. During live inference, you're using training history as context for today's behaviour.",
            ], "#3b82f6")}
          </Section>

          {/* ── 5. Current Window ── */}
          <Section title="Current Window — What the Model Sees" color="#8b5cf6">
            <p className="text-sm text-gray-400 mb-3">
              This greyscale image is the <strong className="text-gray-200">exact input the model processed</strong> for the current bar.
              Each row is one of the 26 technical indicator features. Each column is one of the 64 bars in the window
              (left = oldest, right = most recent). A brighter pixel means a higher scaled value for that feature at
              that bar; darker means lower.
            </p>
            <div className="bg-gray-950 rounded-lg p-4 mb-4">{SVG_WINDOW_GRID}</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="bg-gray-800/50 rounded-lg p-3 border border-violet-900/50">
                <p className="text-xs font-semibold text-violet-400 mb-1">What patterns to look for</p>
                {bullets([
                  "Smooth horizontal gradients = the model saw a gradual, consistent change — typical of a trending price with volume following.",
                  "Sharp vertical edges (sudden column brightness change) = an abrupt market event. The right edge is the most recent bar.",
                  "A nearly uniform row (one feature is one brightness level) = that feature barely moved. This is normal for slow oscillators like RSI.",
                  "Noisy, checkerboard-like texture = choppy price action. The model has to compress contradictory signals.",
                ], "#8b5cf6")}
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3 border border-violet-900/50">
                <p className="text-xs font-semibold text-violet-400 mb-1">Connecting the image to MSE</p>
                {bullets([
                  "If MSE is high, look at the right edge of the window — that's where the most recent, unusual bars will appear as a sudden brightness change.",
                  "A window that looks visually similar to recent windows but has higher MSE than expected = the unusual signal is subtle, likely in a specific feature row.",
                  "If the entire image is roughly the same brightness, the model received very flat, featureless input — often during low-volatility overnight gaps.",
                ], "#8b5cf6")}
              </div>
            </div>
          </Section>

          {/* ── 6. Latent Vector ── */}
          <Section title="Latent Vector — The Model's Internal Summary" color="#ec4899">
            <p className="text-sm text-gray-400 mb-3">
              After the encoder processes the 64-bar window, it produces 32 numbers — the <strong className="text-gray-200">latent vector</strong>.
              This is the model's compressed "fingerprint" of the current market state. The bar chart shows these 32
              values: indigo bars are positive, red bars are negative. The pattern across all 32 bars is what matters —
              not any individual bar.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="bg-gray-800/50 rounded-lg p-3 border border-pink-900/50">
                <p className="text-xs font-semibold text-pink-400 mb-2">What the numbers represent</p>
                <p className="text-xs text-gray-400">
                  The 32 dimensions don't have human-readable names — the model invented them during training.
                  Think of each dimension as a dial that measures some abstract aspect of market behaviour the
                  model found useful to distinguish patterns. Some dimensions might loosely correspond to
                  "trend strength", "volatility level", or "volume-price divergence" — but they're likely
                  combinations of multiple features.
                </p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3 border border-pink-900/50">
                <p className="text-xs font-semibold text-pink-400 mb-2">How K-Means clustering uses this</p>
                <p className="text-xs text-gray-400">
                  K-Means clustering treats each latent vector as a point in 32-dimensional space.
                  During training, it found groups of similar points (clusters). When a new bar arrives,
                  the model asks: "which cluster centroid is this latent vector closest to?" That centroid
                  becomes the cluster assignment. Similar market conditions produce similar latent vectors
                  and land in the same cluster.
                </p>
              </div>
            </div>
            {bullets([
              "Two consecutive bars with nearly identical latent vector patterns = the model thinks the market is repeating the same behaviour. Watch for MSE staying flat too.",
              "A sudden large shift in the bar chart (many bars flip from red to indigo or vice versa) = regime change detected, even before it's obvious on the candlestick chart.",
              "Very low bars (near zero) across many dimensions = the encoder wasn't sure how to describe what it saw. This often accompanies high MSE.",
              "The Latent Space page's t-SNE scatter is a 2D projection of these 32-number vectors. Each dot there is exactly the kind of vector shown here.",
            ], "#ec4899")}
          </Section>

          {/* ── 7. Cluster History ── */}
          <Section title="Cluster History — Regime Detection Over Time" color="#14b8a6">
            <p className="text-sm text-gray-400 mb-3">
              The colour strip shows the last 200 windows, left to right, each coloured by which cluster
              the model assigned it to. Each colour represents a distinct type of price behaviour the model
              learned during training. Long runs of the same colour mean the market was in a stable,
              consistent regime. Rapid alternation means the model couldn't find a stable pattern.
            </p>
            <div className="mb-4 bg-gray-950 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-2">Example patterns:</p>
              <div className="space-y-2">
                <div>
                  <div className="h-4 rounded flex overflow-hidden mb-1">
                    {[...Array(40)].map((_,i) => <div key={i} style={{flex:1, background:"#6366f1"}}/>)}
                    {[...Array(40)].map((_,i) => <div key={i+40} style={{flex:1, background:"#f59e0b"}}/>)}
                    {[...Array(40)].map((_,i) => <div key={i+80} style={{flex:1, background:"#6366f1"}}/>)}
                  </div>
                  <p className="text-xs text-gray-500">Stable indigo → transition → stable indigo: price moved into a new regime then returned</p>
                </div>
                <div>
                  <div className="h-4 rounded flex overflow-hidden mb-1">
                    {[0,1,0,1,2,0,1,0,2,1,0,1,0,2,1,0,1,0,2,1,0,1,0,2,1,0].map((c,i) => (
                      <div key={i} style={{flex:1, background:["#6366f1","#f59e0b","#ef4444"][c]}}/>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500">Rapid alternation: choppy market, model can't find a stable pattern — treat any cluster assignment with scepticism</p>
                </div>
              </div>
            </div>
            {bullets([
              "A new colour appearing and holding for 10+ bars = the market transitioned into a regime the model treats as genuinely distinct. Note the timestamp and check the candlestick chart.",
              "Cluster transitions that coincide with MSE spikes = strong signal of a real regime change, not just noise.",
              "If you see the same 2-3 clusters repeating all day, the market has been in a narrow behavioural range. New clusters appearing toward the close can signal a late-session regime shift.",
              "Go to the Cluster Profile page to learn what each numbered cluster looked like historically — what price behaviour it typically captures.",
            ], "#14b8a6")}
          </Section>

          {/* ── 8. Feature MSE ── */}
          <Section title="Feature MSE Contribution — Finding the Root Cause" color="#f97316">
            <p className="text-sm text-gray-400 mb-3">
              When MSE is high, this panel tells you <em>which features</em> are responsible. Each bar shows
              how much reconstruction error came from one of the 26 indicator channels. Features are sorted
              from highest (most error) to lowest. Red bars are the main drivers; indigo bars are low
              contributors.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="bg-gray-800/50 rounded-lg p-3 border border-orange-900/50">
                <p className="text-xs font-semibold text-orange-400 mb-2">What high-error features mean</p>
                <div className="space-y-1.5">
                  {[
                    { feat: "return / log_return", meaning: "Price moved unusually sharply — gap, spike, or reversal" },
                    { feat: "vol_return / volume_ratio", meaning: "Volume was abnormal relative to its recent average" },
                    { feat: "atr_14 / rolling_vol", meaning: "Volatility regime changed — the market became more or less volatile than expected" },
                    { feat: "bb_pct / bb_width", meaning: "Price moved outside or to the edge of its recent Bollinger Band range" },
                    { feat: "rsi_14 / stoch_k", meaning: "Momentum oscillators reached extreme values (overbought/oversold)" },
                    { feat: "ema_9 / macd", meaning: "Trend signals contradicted each other or moved unusually fast" },
                  ].map(({ feat, meaning }) => (
                    <div key={feat} className="text-xs">
                      <span className="text-orange-300 font-mono">{feat}</span>
                      <span className="text-gray-500"> → </span>
                      <span className="text-gray-400">{meaning}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3 border border-orange-900/50">
                <p className="text-xs font-semibold text-orange-400 mb-2">Finding hidden patterns with feature MSE</p>
                {bullets([
                  "If only 1–2 features dominate the error, the event was specific and identifiable (e.g. a volume spike without matching price movement).",
                  "If all features are roughly equal height, the entire window was unusual — this is a genuine broad-based anomaly, not a single-feature quirk.",
                  "A return spike with normal volume is different from a return spike with high volume. Feature MSE shows you which combination you're seeing.",
                  "Watch for slow-moving features (ema_50, atr_14) becoming the top contributors — this means the broader context shifted, not just this bar.",
                ], "#f97316")}
              </div>
            </div>
          </Section>

          {/* ── 9. Reading signals together ── */}
          <Section title="Combining the Signals — What to Look For" color="#a78bfa">
            <p className="text-sm text-gray-400 mb-4">
              Each panel is most useful when read together with the others. Here are the most reliable
              combined signal patterns:
            </p>
            <div className="bg-gray-950 rounded-lg p-4 mb-4">{SVG_COMBINED_SIGNALS}</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-800/50 rounded-lg p-3 border border-violet-900/50">
                <p className="text-xs font-semibold text-violet-400 mb-2">High-confidence signals</p>
                {bullets([
                  "MSE spike above p95 + cluster transition + Feature MSE top contributors are return/volume = a real, specific market event. High confidence it's genuine.",
                  "MSE gradually rising over 20+ bars + cluster slowly switching between 2-3 options = the market is transitioning regimes. Not a single event — a structural shift.",
                  "MSE low (below p25) + same cluster for 50+ bars = market is doing exactly what the model expects. High regime stability.",
                ], "#a78bfa")}
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3 border border-violet-900/50">
                <p className="text-xs font-semibold text-violet-400 mb-2">Lower-confidence / noise patterns</p>
                {bullets([
                  "MSE briefly above p95 for 1-2 bars then immediately back to baseline = single unusual bar, probably not meaningful unless it coincides with a visible event.",
                  "Cluster alternating every 2-3 bars = the model is on the boundary between two clusters. The market is in a zone the model doesn't classify cleanly.",
                  "Feature MSE dominated by hour_sin / hour_cos = time-of-day pattern the model didn't see often in training. Common at open and close.",
                ], "#a78bfa")}
              </div>
            </div>
          </Section>

          {/* ── 10. Model limitations ── */}
          <Section title="What the Model Cannot Tell You" color="#6b7280">
            <p className="text-sm text-gray-400 mb-3">
              This is an unsupervised pattern recognition model — it was never told what "good" or "bad"
              looks like. It doesn't know about earnings, news, or fundamentals. There are important things
              it cannot do:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                {[
                  ["Direction", "The model has no concept of up vs down. A high-MSE bar could precede a rally or a crash — it only tells you the pattern was unusual."],
                  ["Causation", "It can detect that volume was anomalous, but not why. Always check news and fundamentals alongside the model output."],
                  ["Predictions", "This is a retrospective pattern scorer. It measures what just happened, not what will happen next."],
                ].map(([t, d]) => (
                  <div key={t} className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
                    <p className="text-xs font-semibold text-gray-300 mb-1">{t}</p>
                    <p className="text-xs text-gray-500">{d}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                {[
                  ["Out-of-distribution", "If the market enters a regime never seen in the training period (a major crash, a flash crash), MSE will be high but the signal may be less reliable — the model has no reference point."],
                  ["Inter-cluster meaning", "Cluster 0 and Cluster 1 are not ordered. There's no 'better' or 'worse' cluster — just different learned patterns. Meaning comes from observation, not position."],
                  ["Absolute price level", "The model sees normalised, scaled features. Whether TSLA is at $100 or $400 doesn't matter to it — it only sees relative movements and structure."],
                ].map(([t, d]) => (
                  <div key={t} className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50">
                    <p className="text-xs font-semibold text-gray-300 mb-1">{t}</p>
                    <p className="text-xs text-gray-500">{d}</p>
                  </div>
                ))}
              </div>
            </div>
          </Section>

        </div>
      )}
    </div>
  );
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
              The model never sees raw prices. It learns from 26 normalised technical indicator
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
  const [clusterHistory, setClusterHistory]         = useState([]);
  const [clusterTransitions, setClusterTransitions] = useState([]);
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
  const prevClusterRef         = useRef(null);      // previous cluster label for transition detection
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
    const offDone = ws.on("infer_complete", async (data) => {
      activeRef.current = false;
      setState("idle");
      if (pendingRef.current) {
        flushPending(pendingRef.current);
        pendingRef.current = null;
      }
      // Walk-forward completion → re-fetch model to pick up updated mse_baseline
      if (data?.stop_reason === "completed") {
        try {
          const m = await api.getActiveModel();
          setActiveModel(Object.keys(m).length ? m : null);
        } catch {}
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
    if (syncSetupRef.current === c) return;

    try { syncCleanupRef.current?.(); } catch {}
    syncCleanupRef.current = null;
    syncSetupRef.current = c;

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

    // Detect cluster transitions for MSE chart markers
    const newCluster = data.cluster_label;
    if (prevClusterRef.current !== null && prevClusterRef.current !== newCluster) {
      const t = Math.floor(new Date(data.timestamp).getTime() / 1000);
      setClusterTransitions(prev => [...prev, { time: t, cluster: newCluster }]);
    }
    prevClusterRef.current = newCluster;

    if (data.candle_data?.length) {
      data.candle_data.forEach(bar => candleAccumRef.current.set(bar.t, bar));
      setCandleData([...candleAccumRef.current.values()].sort((a, b) => a.t - b.t));
    }
    drawWindow(data);
  }

  // p95/p50 — prefer historical baseline from completed walk-forward, fall back to session
  const baseline = activeModel?.mse_baseline ?? null;
  const p95 = baseline?.p95
    ?? (mseData.length ? [...mseData].sort((a, b) => a.mse - b.mse)[Math.floor(mseData.length * 0.95)]?.mse : null);
  const p50 = baseline?.p50 ?? null;

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
    setClusterTransitions([]);
    setCandleData([]);
    candleAccumRef.current  = new Map();
    mseTimeMapRef.current   = new Map();
    prevClusterRef.current  = null;
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

  const featureMseData = current?.feature_mse && activeModel?.feature_columns
    ? activeModel.feature_columns
        .map((name, i) => ({ name, mse: current.feature_mse[i] ?? 0 }))
        .sort((a, b) => b.mse - a.mse)
    : [];

  const pctRank = current ? msePercentileRank(current.mse, baseline) : null;

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
        {baseline && (
          <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
            <span className="text-gray-600 uppercase tracking-wider font-semibold">Baseline</span>
            <span className="text-gray-400">{baseline.count.toLocaleString()} bars · p50 {baseline.p50?.toFixed(3)} · p95 {baseline.p95?.toFixed(3)}</span>
          </div>
        )}
      </div>

      {/* ── Beginner's guide ── */}
      <BeginnerGuide />

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
          {!baseline && mseData.length === 0 && (
            <span className="ml-3 text-xs text-gray-600">Run walk-forward to establish historical p95 baseline</span>
          )}
          <PanelInfo {...PANEL_INFO.mse} />
        </p>
        <MSEChart
          data={mseData}
          p95={p95}
          p50={p50}
          markers={clusterTransitions}
          onChartCreated={handleMseChartReady}
          runId={runId}
        />
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
                <tr>
                  <td className="text-gray-500 pr-3">Time</td>
                  <td className="text-gray-100">{current.timestamp}</td>
                </tr>
                <tr>
                  <td className="text-gray-500 pr-3">MSE</td>
                  <td className="text-gray-100">
                    {current.mse?.toFixed(6)}
                    {pctRank !== null && (
                      <span className={`ml-2 text-xs font-mono px-1.5 py-0.5 rounded
                        ${pctRank >= 95 ? "bg-red-900/60 text-red-300" :
                          pctRank >= 75 ? "bg-amber-900/60 text-amber-300" :
                          pctRank >= 50 ? "bg-gray-700 text-gray-300" :
                                          "bg-emerald-900/60 text-emerald-300"}`}>
                        p{pctRank}
                      </span>
                    )}
                  </td>
                </tr>
                <tr>
                  <td className="text-gray-500 pr-3">Cluster</td>
                  <td className="text-gray-100">{current.cluster_label}</td>
                </tr>
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

      {/* Panel F — Feature MSE Contribution */}
      {featureMseData.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-4 mb-6">
          <p className="text-sm text-gray-400 mb-3 flex items-center">
            Feature MSE Contribution
            <PanelInfo {...PANEL_INFO.featureMse} />
          </p>
          <ResponsiveContainer width="100%" height={featureMseData.length * 22 + 20}>
            <BarChart data={featureMseData} layout="vertical" margin={{ left: 0, right: 20, top: 0, bottom: 0 }}>
              <XAxis type="number" stroke="#6B7280" tick={{ fontSize: 10, fill: "#9CA3AF" }} />
              <YAxis
                dataKey="name"
                type="category"
                width={110}
                tick={{ fontSize: 10, fill: "#9CA3AF" }}
              />
              <Tooltip
                contentStyle={{ backgroundColor: "#111827", border: "none", fontSize: 11 }}
                formatter={(v) => [v.toFixed(6), "MSE"]}
              />
              <Bar dataKey="mse" radius={[0, 2, 2, 0]}>
                {featureMseData.map((d, i) => {
                  const maxMse = featureMseData[0]?.mse ?? 1;
                  const ratio  = maxMse > 0 ? d.mse / maxMse : 0;
                  const color  = ratio > 0.6 ? "#ef4444" : ratio > 0.3 ? "#f59e0b" : "#6366f1";
                  return <Cell key={i} fill={color} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}
    </div>
  );
}

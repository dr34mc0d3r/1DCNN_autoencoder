import { useEffect, useMemo, useRef, useState } from "react";
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, Cell, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
} from "recharts";
import { api } from "../api.js";
import { captureRechartsSvg } from "../utils/exportUtils.js";

const COLORS = ["#6366f1","#f59e0b","#10b981","#ef4444","#3b82f6","#8b5cf6","#ec4899","#14b8a6"];

function CentroidMarker({ cx, cy, payload }) {
  if (cx == null || cy == null) return null;
  const fill = COLORS[payload.label % COLORS.length];
  const r = 7;
  return (
    <g>
      <line x1={cx - r - 5} y1={cy} x2={cx + r + 5} y2={cy} stroke="white" strokeWidth={1.5} />
      <line x1={cx} y1={cy - r - 5} x2={cx} y2={cy + r + 5} stroke="white" strokeWidth={1.5} />
      <circle cx={cx} cy={cy} r={r + 2} fill="white" />
      <circle cx={cx} cy={cy} r={r} fill={fill} />
    </g>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-5 w-5 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function clusterStats(labels, nClusters) {
  const counts = Array(nClusters).fill(0);
  for (const l of labels) counts[l]++;
  const total = labels.length;
  return counts.map((count, i) => ({
    cluster: i,
    count,
    pct: total > 0 ? ((count / total) * 100).toFixed(1) : "0.0",
  }));
}

function LatentGuide() {
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
          Understanding the Latent Space
          <span className="text-[11px] font-normal bg-indigo-900/40 text-indigo-300 border border-indigo-800 rounded px-1.5 py-0.5">
            Beginner's Guide
          </span>
        </span>
        <span className="text-gray-500 text-xs">{open ? "▲ Hide" : "▼ Show"}</span>
      </button>
      {open && (
        <div className="border-t border-gray-800 px-6 py-6">

          {/* Section 1 — What is the Latent Space? */}
          <Section title="What is the Latent Space?" color="#6366f1">
            <p className="text-sm mb-3" style={{ color: "#9ca3af" }}>
              The encoder compresses each 64-bar window from 26 features × 64 bars (1,664 numbers) down to just 32 numbers — the "latent vector". This latent space is where every window lives as a single point. Windows with similar market behaviour land near each other in this 32-dimensional space.
            </p>
            <p className="text-sm mb-4" style={{ color: "#9ca3af" }}>
              t-SNE (t-Distributed Stochastic Neighbour Embedding) is an algorithm that projects those 32-dimensional points into 2D so we can visualise them. Points that were close in 32D stay close in 2D — so the scatter plot is a valid map of market behaviour similarity.
            </p>
            {/* Compression SVG */}
            <svg viewBox="0 0 400 80" className="w-full max-w-lg mb-2 rounded-lg" style={{ background: "#111827" }}>
              {/* Left: tall narrow rect = raw input */}
              <rect x="20" y="10" width="30" height="60" fill="#1f2937" stroke="#374151" strokeWidth="1" />
              <text x="35" y="78" textAnchor="middle" fontSize="9" fill="#9ca3af">1,664 numbers</text>
              {/* Arrow 1 */}
              <line x1="55" y1="40" x2="100" y2="40" stroke="#374151" strokeWidth="1.5" />
              <polygon points="100,36 108,40 100,44" fill="#374151" />
              {/* Encoder label */}
              <text x="80" y="35" textAnchor="middle" fontSize="8" fill="#6b7280">encoder</text>
              {/* Middle: small square = latent vector */}
              <rect x="112" y="28" width="30" height="24" fill="#1e1b4b" stroke="#6366f1" strokeWidth="1.5" />
              <text x="127" y="58" textAnchor="middle" fontSize="9" fill="#6366f1">32 numbers</text>
              {/* Arrow 2 */}
              <line x1="148" y1="40" x2="192" y2="40" stroke="#374151" strokeWidth="1.5" />
              <polygon points="192,36 200,40 192,44" fill="#374151" />
              {/* t-SNE label */}
              <text x="175" y="35" textAnchor="middle" fontSize="8" fill="#6b7280">t-SNE</text>
              {/* Right: 2D scatter dots — cluster 1 indigo */}
              <circle cx="238" cy="22" r="3.5" fill="#6366f1" opacity="0.85" />
              <circle cx="248" cy="18" r="3.5" fill="#6366f1" opacity="0.85" />
              <circle cx="255" cy="26" r="3.5" fill="#6366f1" opacity="0.85" />
              <circle cx="244" cy="29" r="3.5" fill="#6366f1" opacity="0.85" />
              <circle cx="252" cy="14" r="3.5" fill="#6366f1" opacity="0.85" />
              {/* cluster 2 amber */}
              <circle cx="305" cy="52" r="3.5" fill="#f59e0b" opacity="0.85" />
              <circle cx="315" cy="48" r="3.5" fill="#f59e0b" opacity="0.85" />
              <circle cx="322" cy="56" r="3.5" fill="#f59e0b" opacity="0.85" />
              <circle cx="310" cy="60" r="3.5" fill="#f59e0b" opacity="0.85" />
              <circle cx="320" cy="44" r="3.5" fill="#f59e0b" opacity="0.85" />
              {/* cluster 3 green */}
              <circle cx="360" cy="20" r="3.5" fill="#10b981" opacity="0.85" />
              <circle cx="370" cy="16" r="3.5" fill="#10b981" opacity="0.85" />
              <circle cx="376" cy="24" r="3.5" fill="#10b981" opacity="0.85" />
              <circle cx="365" cy="28" r="3.5" fill="#10b981" opacity="0.85" />
              <circle cx="373" cy="12" r="3.5" fill="#10b981" opacity="0.85" />
              <text x="307" y="78" textAnchor="middle" fontSize="9" fill="#9ca3af">2D t-SNE</text>
            </svg>
          </Section>

          {/* Section 2 — Reading the Scatter Plot */}
          <Section title="Reading the Scatter Plot" color="#14b8a6">
            <svg viewBox="0 0 480 180" className="w-full mb-4 rounded-lg" style={{ background: "#111827" }}>
              {/* Left panel: Good separation */}
              <text x="120" y="16" textAnchor="middle" fontSize="10" fill="#14b8a6">✓ Well-separated</text>
              {/* cluster A indigo */}
              <circle cx="50" cy="50" r="5" fill="#6366f1" opacity="0.85" />
              <circle cx="62" cy="44" r="5" fill="#6366f1" opacity="0.85" />
              <circle cx="58" cy="58" r="5" fill="#6366f1" opacity="0.85" />
              <circle cx="45" cy="62" r="5" fill="#6366f1" opacity="0.85" />
              <circle cx="70" cy="52" r="5" fill="#6366f1" opacity="0.85" />
              {/* cluster B amber */}
              <circle cx="160" cy="40" r="5" fill="#f59e0b" opacity="0.85" />
              <circle cx="172" cy="35" r="5" fill="#f59e0b" opacity="0.85" />
              <circle cx="168" cy="48" r="5" fill="#f59e0b" opacity="0.85" />
              <circle cx="155" cy="52" r="5" fill="#f59e0b" opacity="0.85" />
              <circle cx="178" cy="44" r="5" fill="#f59e0b" opacity="0.85" />
              {/* cluster C green */}
              <circle cx="100" cy="130" r="5" fill="#10b981" opacity="0.85" />
              <circle cx="113" cy="124" r="5" fill="#10b981" opacity="0.85" />
              <circle cx="108" cy="138" r="5" fill="#10b981" opacity="0.85" />
              <circle cx="95" cy="142" r="5" fill="#10b981" opacity="0.85" />
              <circle cx="120" cy="132" r="5" fill="#10b981" opacity="0.85" />
              {/* cluster D red */}
              <circle cx="175" cy="130" r="5" fill="#ef4444" opacity="0.85" />
              <circle cx="187" cy="124" r="5" fill="#ef4444" opacity="0.85" />
              <circle cx="183" cy="138" r="5" fill="#ef4444" opacity="0.85" />
              <circle cx="170" cy="142" r="5" fill="#ef4444" opacity="0.85" />
              <circle cx="193" cy="133" r="5" fill="#ef4444" opacity="0.85" />
              {/* Divider */}
              <line x1="240" y1="10" x2="240" y2="170" stroke="#374151" strokeWidth="1" strokeDasharray="4 3" />
              {/* Right panel: Poor separation */}
              <text x="360" y="16" textAnchor="middle" fontSize="10" fill="#ef4444">⚠ Overlapping</text>
              {/* overlapping blob */}
              <circle cx="290" cy="80" r="5" fill="#6366f1" opacity="0.75" />
              <circle cx="305" cy="70" r="5" fill="#f59e0b" opacity="0.75" />
              <circle cx="315" cy="85" r="5" fill="#10b981" opacity="0.75" />
              <circle cx="300" cy="95" r="5" fill="#ef4444" opacity="0.75" />
              <circle cx="320" cy="75" r="5" fill="#3b82f6" opacity="0.75" />
              <circle cx="330" cy="90" r="5" fill="#6366f1" opacity="0.75" />
              <circle cx="345" cy="80" r="5" fill="#f59e0b" opacity="0.75" />
              <circle cx="310" cy="100" r="5" fill="#10b981" opacity="0.75" />
              <circle cx="295" cy="65" r="5" fill="#ef4444" opacity="0.75" />
              <circle cx="340" cy="68" r="5" fill="#3b82f6" opacity="0.75" />
              <circle cx="355" cy="95" r="5" fill="#6366f1" opacity="0.75" />
              <circle cx="325" cy="108" r="5" fill="#f59e0b" opacity="0.75" />
              <circle cx="360" cy="78" r="5" fill="#10b981" opacity="0.75" />
              <circle cx="285" cy="100" r="5" fill="#ef4444" opacity="0.75" />
              <circle cx="370" cy="88" r="5" fill="#3b82f6" opacity="0.75" />
              {/* Legend */}
              <circle cx="252" cy="150" r="4" fill="#6366f1" />
              <text x="259" y="154" fontSize="8" fill="#9ca3af">C0</text>
              <circle cx="278" cy="150" r="4" fill="#f59e0b" />
              <text x="285" y="154" fontSize="8" fill="#9ca3af">C1</text>
              <circle cx="304" cy="150" r="4" fill="#10b981" />
              <text x="311" y="154" fontSize="8" fill="#9ca3af">C2</text>
              <circle cx="330" cy="150" r="4" fill="#ef4444" />
              <text x="337" y="154" fontSize="8" fill="#9ca3af">C3</text>
              <circle cx="356" cy="150" r="4" fill="#3b82f6" />
              <text x="363" y="154" fontSize="8" fill="#9ca3af">C4</text>
            </svg>
            {bullets([
              "Tight clusters = the model found distinct, consistent market behaviour types. Patterns within a cluster are very similar.",
              "Well-separated clusters = the model can clearly tell behaviours apart. Each cluster should look different on the price chart.",
              "Overlapping clusters = the model found similar latent vectors for different market conditions. This suggests n_clusters may be too high for the data, or more training is needed.",
              "A very large cluster dominating the scatter = most of your training data looks the same (e.g. a low-volatility sideways period dominates). Consider using data with more regime variety.",
              "t-SNE preserves local structure, not global distances — two clusters being far apart doesn't necessarily mean they're more different than two nearby clusters.",
            ], "#14b8a6")}
          </Section>

          {/* Section 3 — The Cluster Size Table */}
          <Section title="The Cluster Size Table" color="#f59e0b">
            {bullets([
              "Even distribution (e.g. each cluster has 10-20% of windows) = the model found genuinely distinct regimes of similar frequency",
              "One cluster with 60%+ of windows = most training data looked similar. This is common if the training period was dominated by one market regime.",
              "A cluster with <2% of windows = a rare but real pattern (e.g. extreme volatility events) — or noise. Check its representative windows on the Cluster Profile page.",
              "The total window count × cluster % gives you absolute numbers — a cluster with 3% of 20,000 windows = 600 windows, enough to be meaningful",
            ], "#f59e0b")}
          </Section>

          {/* Section 4 — Cluster Quality Metrics */}
          <Section title="Cluster Quality Metrics" color="#ec4899">
            {/* Quality curves SVG */}
            <svg viewBox="0 0 500 160" className="w-full mb-4 rounded-lg" style={{ background: "#111827" }}>
              {/* Axes */}
              <line x1="50" y1="20" x2="50" y2="130" stroke="#374151" strokeWidth="1" />
              <line x1="50" y1="130" x2="470" y2="130" stroke="#374151" strokeWidth="1" />
              {/* X axis labels K=2..12 */}
              {[2,3,4,5,6,7,8,9,10,11,12].map((k, i) => (
                <text key={k} x={50 + i * 38} y="143" textAnchor="middle" fontSize="9" fill="#6b7280">{k}</text>
              ))}
              <text x="260" y="158" textAnchor="middle" fontSize="9" fill="#6b7280">Number of clusters (K)</text>
              <text x="18" y="80" textAnchor="middle" fontSize="9" fill="#6b7280" transform="rotate(-90,18,80)">quality</text>
              {/* Silhouette (green): peaks at K=5 (i=3), gently falls */}
              <polyline
                points="50,110 88,90 126,72 164,52 202,62 240,70 278,78 316,84 354,90 392,95 430,98"
                fill="none" stroke="#10b981" strokeWidth="2"
              />
              <text x="435" y="96" fontSize="8" fill="#10b981">higher=better</text>
              {/* Davies-Bouldin (red): lowest at K=5, then rises */}
              <polyline
                points="50,65 88,72 126,80 164,95 202,85 240,78 278,72 316,68 354,65 392,63 430,62"
                fill="none" stroke="#ef4444" strokeWidth="2"
              />
              <text x="435" y="60" fontSize="8" fill="#ef4444">lower=better</text>
              {/* Calinski-Harabasz (blue): high at K=2, falls and flattens */}
              <polyline
                points="50,30 88,38 126,50 164,62 202,72 240,78 278,84 316,88 354,91 392,93 430,94"
                fill="none" stroke="#3b82f6" strokeWidth="2"
              />
              <text x="435" y="92" fontSize="8" fill="#3b82f6">elbow</text>
              {/* Amber dashed line at K=5 (x=164) */}
              <line x1="164" y1="20" x2="164" y2="130" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4 3" />
              <text x="164" y="15" textAnchor="middle" fontSize="8" fill="#f59e0b">Suggested K</text>
            </svg>
            {bullets([
              "Silhouette Score (−1 to +1): measures how similar each window is to its own cluster vs other clusters. +1 = perfectly assigned, 0 = on the boundary, −1 = likely in the wrong cluster. Look for the peak.",
              "Davies-Bouldin Index: average similarity between each cluster and its most similar neighbour. Lower is better — it means clusters are compact and well-separated. Look for the minimum.",
              "Calinski-Harabasz Index: ratio of between-cluster scatter to within-cluster scatter. Higher is better. Look for an 'elbow' — the point where adding more clusters stops giving big gains.",
              "When all three metrics agree on the same K, that's a strong choice. When they disagree, prefer the K where Silhouette peaks.",
            ], "#ec4899")}
          </Section>

          {/* Section 5 — Finding Hidden Patterns */}
          <Section title="Finding Hidden Patterns" color="#10b981">
            {bullets([
              "Start with K=8 (default). Run Cluster Quality to see if a lower K (5-6) gives better separation — fewer, cleaner clusters are easier to interpret.",
              "After choosing K and re-clustering, go to Cluster Profile for each cluster. The fingerprints will tell you what market behaviour each cluster represents.",
              "If two clusters have nearly identical fingerprints, they're redundant — lower K by 1.",
              "The density view of the scatter shows where the model is most 'confident' — dense regions are the core of each regime.",
              "Compare the t-SNE scatter from different training runs — if the cluster boundaries are similar, the model found stable patterns. If they're very different, training is unstable (possibly too few epochs or poor guard settings).",
            ], "#10b981")}
            <div className="mt-4">
              <Tag label="32-dimensional compression" color="#6366f1" />
              <Tag label="t-SNE projection" color="#14b8a6" />
              <Tag label="K-Means clustering" color="#f59e0b" />
            </div>
          </Section>

        </div>
      )}
    </div>
  );
}

export default function LatentSpacePage() {
  const [activeModel, setActiveModel] = useState(null);
  const [scatter, setScatter]         = useState([]);
  const [result, setResult]           = useState(null);
  const [quality, setQuality]         = useState(null);
  const [state, setState]             = useState("idle");
  const [qualityLoading, setQualityLoading] = useState(false);
  const [error, setError]             = useState("");
  const clusterViewRef  = useRef(null);
  const densityViewRef  = useRef(null);
  const qualityChartRef = useRef(null);

  useEffect(() => {
    api.getActiveModel().then(m => setActiveModel(Object.keys(m).length ? m : null)).catch(() => {});
  }, []);

  async function handleCluster() {
    setState("running");
    setError("");
    try {
      await api.startCluster();
      const poll = setInterval(async () => {
        const res = await api.clusterResult();
        if (res.state === "done") {
          clearInterval(poll);
          setScatter(res.result.scatter);
          setResult(res.result);
          setState("done");
          // Auto-save t-SNE PNGs after a tick so React renders the charts first
          setTimeout(async () => {
            try {
              const clusterUrl = await captureRechartsSvg(clusterViewRef);
              if (clusterUrl) await api.saveArtifact("tsne_cluster.png", clusterUrl);
              const densityUrl = await captureRechartsSvg(densityViewRef);
              if (densityUrl) await api.saveArtifact("tsne_density.png", densityUrl);
            } catch (err) {
              console.warn("Auto-save t-SNE PNGs failed:", err);
            }
          }, 800);
        } else if (res.state === "error") {
          clearInterval(poll);
          setError(res.error ?? "Clustering failed");
          setState("error");
        }
      }, 2000);
    } catch (e) {
      setError(e.message);
      setState("error");
    }
  }

  async function handleQuality() {
    setQualityLoading(true);
    setError("");
    try {
      const res = await api.clusterQuality();
      setQuality(res.scores);
      // Auto-save quality chart after render tick
      setTimeout(async () => {
        try {
          const dataUrl = await captureRechartsSvg(qualityChartRef);
          if (dataUrl) await api.saveArtifact("cluster_quality.png", dataUrl);
        } catch (err) {
          console.warn("Auto-save cluster_quality.png failed:", err);
        }
      }, 800);
    } catch (e) {
      setError(e.message);
    } finally {
      setQualityLoading(false);
    }
  }

  const qualityData = quality
    ? Object.entries(quality).map(([k, v]) => ({ k: Number(k), ...v }))
    : [];

  const stats = result ? clusterStats(result.labels, result.n_clusters) : [];

  const scatterCentroids = useMemo(() => {
    if (!scatter.length) return [];
    const acc = {};
    for (const p of scatter) {
      if (!acc[p.label]) acc[p.label] = { x: 0, y: 0, n: 0 };
      acc[p.label].x += p.x;
      acc[p.label].y += p.y;
      acc[p.label].n += 1;
    }
    return Object.entries(acc).map(([label, v]) => ({
      x: v.x / v.n,
      y: v.y / v.n,
      label: Number(label),
    }));
  }, [scatter]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Latent Space</h1>

      {/* Active model strip */}
      <div className="flex items-center gap-2 mb-5 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-xs w-fit">
        <span className="text-gray-600 uppercase tracking-wider font-semibold">Model</span>
        {activeModel ? (
          <span className="text-indigo-300 font-mono">
            src/v2/backend/models/{activeModel.name}/
          </span>
        ) : (
          <span className="text-red-400">No active model — train one first</span>
        )}
      </div>

      {/* Controls */}
      <div className="flex gap-3 mb-6 items-center">
        <button
          onClick={handleCluster}
          disabled={state === "running" || qualityLoading}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-5 py-2 rounded text-sm font-semibold"
        >
          {state === "running" ? "Clustering…" : "Extract + Cluster"}
        </button>
        <button
          onClick={handleQuality}
          disabled={state === "running" || qualityLoading}
          className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 px-5 py-2 rounded text-sm font-semibold"
        >
          {qualityLoading ? "Scoring…" : "Cluster Quality"}
        </button>
        {(state === "running" || qualityLoading) && <Spinner />}
      </div>

      <LatentGuide />

      {/* Extract + Cluster running status */}
      {state === "running" && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 text-sm text-gray-400">
          Extracting latent vectors → fitting K-Means → running t-SNE…
          <span className="text-gray-600 ml-1">This typically takes 30–60 seconds.</span>
        </div>
      )}

      {/* Cluster Quality running status */}
      {qualityLoading && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 text-sm text-gray-400">
          Re-encoding all windows → fitting K-Means for K=2…16 → computing metrics…
          <span className="text-gray-600 ml-1">This typically takes 60–120 seconds.</span>
        </div>
      )}

      {/* Clustering report */}
      {result && (
        <div className="bg-gray-900 rounded-xl p-4 mb-6">
          <p className="text-sm text-gray-400 mb-4">Clustering Report</p>

          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Total Windows</p>
              <p className="text-2xl font-bold text-gray-100">{result.n_windows.toLocaleString()}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Clusters</p>
              <p className="text-2xl font-bold text-indigo-400">{result.n_clusters}</p>
            </div>
          </div>

          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-800">
                <th className="text-left py-1.5 font-normal">Cluster</th>
                <th className="text-right py-1.5 pr-4 font-normal">Windows</th>
                <th className="text-right py-1.5 font-normal">Share</th>
              </tr>
            </thead>
            <tbody>
              {stats.map(({ cluster, count, pct }) => (
                <tr key={cluster} className="border-b border-gray-800/40">
                  <td className="py-1.5">
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block w-3 h-3 rounded-sm shrink-0"
                        style={{ backgroundColor: COLORS[cluster % COLORS.length] }}
                      />
                      <span className="text-gray-300">Cluster {cluster}</span>
                    </span>
                  </td>
                  <td className="text-right py-1.5 pr-4 font-mono text-gray-300">
                    {count.toLocaleString()}
                  </td>
                  <td className="py-1.5">
                    <span className="flex items-center justify-end gap-2">
                      <span className="w-20 h-1.5 bg-gray-800 rounded overflow-hidden">
                        <span
                          className="block h-full rounded"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: COLORS[cluster % COLORS.length],
                          }}
                        />
                      </span>
                      <span className="font-mono text-gray-400 w-10 text-right">{pct}%</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* t-SNE Cluster View */}
      {scatter.length > 0 && (
        <div ref={clusterViewRef} className="bg-gray-900 rounded-xl p-4 mb-6">
          <p className="text-sm text-gray-400 mb-1">t-SNE Projection — Cluster View</p>
          <p className="text-xs text-gray-600 mb-3">Small dots + transparency; best for seeing cluster separation.</p>
          <ResponsiveContainer width="100%" height={480}>
            <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis
                dataKey="x" type="number" name="t-SNE 0"
                stroke="#6B7280" tick={{ fontSize: 11 }}
                domain={[d => Math.floor(d - 5), d => Math.ceil(d + 5)]}
              />
              <YAxis
                dataKey="y" type="number" name="t-SNE 1"
                stroke="#6B7280" tick={{ fontSize: 11 }}
                domain={[d => Math.floor(d - 5), d => Math.ceil(d + 5)]}
              />
              <ZAxis range={[10, 10]} />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                contentStyle={{ backgroundColor: "#111827", border: "none" }}
                formatter={(v) => v.toFixed(2)}
              />
              <Scatter data={scatter} fillOpacity={0.65} isAnimationActive={false}>
                {scatter.map((p, i) => (
                  <Cell key={i} fill={COLORS[p.label % COLORS.length]} />
                ))}
              </Scatter>
              <Scatter data={scatterCentroids} shape={<CentroidMarker />} isAnimationActive={false} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* t-SNE Density View */}
      {scatter.length > 0 && (
        <div ref={densityViewRef} className="bg-gray-900 rounded-xl p-4 mb-6">
          <p className="text-sm text-gray-400 mb-1">t-SNE Projection — Density View</p>
          <p className="text-xs text-gray-600 mb-3">Up to 5 000 windows sampled. Each point is one window; colour = cluster.</p>
          <ResponsiveContainer width="100%" height={340}>
            <ScatterChart>
              <XAxis dataKey="x" stroke="#6B7280" name="t-SNE 0" tick={{ fontSize: 11 }} />
              <YAxis dataKey="y" stroke="#6B7280" name="t-SNE 1" tick={{ fontSize: 11 }} />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                contentStyle={{ backgroundColor: "#111827", border: "none" }}
                formatter={(v) => v.toFixed(2)}
              />
              <Scatter data={scatter} fill="#6366f1" isAnimationActive={false}>
                {scatter.map((p, i) => (
                  <Cell key={i} fill={COLORS[p.label % COLORS.length]} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Cluster Quality */}
      {qualityData.length > 0 && (
        <div ref={qualityChartRef} className="bg-gray-900 rounded-xl p-4 mb-6">
          <p className="text-sm text-gray-400 mb-1">Cluster Quality (K=2…16)</p>
          <p className="text-xs text-gray-600 mb-3">
            Silhouette: higher = better &nbsp;·&nbsp; Davies-Bouldin: lower = better &nbsp;·&nbsp;
            Calinski-Harabasz: higher = better (right axis)
          </p>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={qualityData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="k" stroke="#6B7280" tick={{ fontSize: 11 }} />
              <YAxis yAxisId={0} stroke="#6B7280" tick={{ fontSize: 11 }} />
              <YAxis yAxisId={1} orientation="right" stroke="#10b981" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: "#111827", border: "none" }} />
              <Legend />
              <Line yAxisId={0} type="monotone" dataKey="silhouette"        stroke="#6366f1" dot name="Silhouette"          isAnimationActive={false} />
              <Line yAxisId={0} type="monotone" dataKey="davies_bouldin"    stroke="#f59e0b" dot name="Davies-Bouldin"      isAnimationActive={false} />
              <Line yAxisId={1} type="monotone" dataKey="calinski_harabasz" stroke="#10b981" dot name="Calinski-Harabasz"  isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { api } from "../api.js";
import MiniCandlestick from "../components/MiniCandlestick.jsx";
import { captureRechartsSvg } from "../utils/exportUtils.js";

const COLORS = ["#6366f1","#f59e0b","#10b981","#ef4444","#3b82f6","#8b5cf6","#ec4899","#14b8a6"];

// ── Utilities ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg className="animate-spin h-5 w-5 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function InfoIcon({ content }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-4 h-4 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-gray-200 text-[10px] font-bold flex items-center justify-center leading-none transition-colors"
        title="What does this mean?"
      >
        i
      </button>
      {open && (
        <div className="absolute z-20 left-0 top-6 w-72 bg-gray-800 border border-gray-700 rounded-lg p-3 text-xs text-gray-300 shadow-2xl">
          <button
            onClick={() => setOpen(false)}
            className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center rounded text-gray-500 hover:text-gray-200 hover:bg-gray-700 transition-colors text-sm leading-none"
            title="Close"
          >
            ×
          </button>
          <div className="pr-5">{content}</div>
        </div>
      )}
    </div>
  );
}

const tooltipStyle = { backgroundColor: "#111827", border: "none" };

// ── Guide ──────────────────────────────────────────────────────────────────────

function ClusterProfileGuide() {
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
          Understanding Cluster Profiles
          <span className="text-[11px] font-normal bg-indigo-900/40 text-indigo-300 border border-indigo-800 rounded px-1.5 py-0.5">
            Beginner's Guide
          </span>
        </span>
        <span className="text-gray-500 text-xs">{open ? "▲ Hide" : "▼ Show"}</span>
      </button>

      {open && (
        <div className="border-t border-gray-800 px-6 py-6">

          {/* Section 1 — What is a Cluster Profile? */}
          <Section title="What is a Cluster Profile?" color="#6366f1">
            <p className="text-sm mb-3" style={{ color: "#9ca3af" }}>
              After training, K-Means assigned every window in the training set to one of N clusters. The Cluster Profile page is a forensic tool — it asks "what is special about the windows in cluster X?" and gives you several angles to answer that question.
            </p>
            {bullets([
              "Feature Fingerprint: z-scores showing which features are unusually high or low compared to the overall training average",
              "Decision Tree: a simple if-then-else rule set that best separates this cluster from all others",
              "Representative Windows: the 5 windows most similar to the cluster centre — what 'typical' looks like",
              "Forward Returns: how price typically moved in the bars immediately after windows belonging to this cluster",
            ], "#6366f1")}
          </Section>

          {/* Section 2 — The Feature Fingerprint — Z-Scores */}
          <Section title="The Feature Fingerprint — Z-Scores" color="#f59e0b">
            {/* Dual cluster fingerprint SVG */}
            <svg viewBox="0 0 520 170" className="w-full mb-4 rounded-lg" style={{ background: "#111827" }}>
              {/* Left panel label */}
              <text x="130" y="14" textAnchor="middle" fontSize="10" fill="#f59e0b">Cluster A — Trending</text>
              {/* Centre axis left panel */}
              <line x1="130" y1="20" x2="130" y2="162" stroke="#374151" strokeWidth="1" />

              {/* Left panel bars: feature labels on left, bars extending right (green) or left (red) of x=130 */}
              {/* ema_9 z=+1.8 */}
              <text x="126" y="34" textAnchor="end" fontSize="8" fill="#9ca3af">ema_9</text>
              <rect x="130" y="27" width="54" height="9" fill="#10b981" opacity="0.8" />
              {/* return z=+1.4 */}
              <text x="126" y="48" textAnchor="end" fontSize="8" fill="#9ca3af">return</text>
              <rect x="130" y="41" width="42" height="9" fill="#10b981" opacity="0.8" />
              {/* rsi_14 z=+1.2 */}
              <text x="126" y="62" textAnchor="end" fontSize="8" fill="#9ca3af">rsi_14</text>
              <rect x="130" y="55" width="36" height="9" fill="#10b981" opacity="0.8" />
              {/* bb_pct z=+0.8 */}
              <text x="126" y="76" textAnchor="end" fontSize="8" fill="#9ca3af">bb_pct</text>
              <rect x="130" y="69" width="24" height="9" fill="#10b981" opacity="0.8" />
              {/* volume_ratio z=-0.3 */}
              <text x="126" y="90" textAnchor="end" fontSize="8" fill="#9ca3af">volume_ratio</text>
              <rect x="121" y="83" width="9" height="9" fill="#ef4444" opacity="0.7" />
              {/* macd_hist z=+1.6 */}
              <text x="126" y="104" textAnchor="end" fontSize="8" fill="#9ca3af">macd_hist</text>
              <rect x="130" y="97" width="48" height="9" fill="#10b981" opacity="0.8" />
              {/* atr_14 z=-0.9 */}
              <text x="126" y="118" textAnchor="end" fontSize="8" fill="#9ca3af">atr_14</text>
              <rect x="103" y="111" width="27" height="9" fill="#ef4444" opacity="0.7" />
              {/* stoch_k z=+1.1 */}
              <text x="126" y="132" textAnchor="end" fontSize="8" fill="#9ca3af">stoch_k</text>
              <rect x="130" y="125" width="33" height="9" fill="#10b981" opacity="0.8" />

              {/* Divider */}
              <line x1="260" y1="10" x2="260" y2="165" stroke="#374151" strokeWidth="1" strokeDasharray="4 3" />

              {/* Right panel label */}
              <text x="390" y="14" textAnchor="middle" fontSize="10" fill="#f59e0b">Cluster B — Mean Reversion</text>
              {/* Centre axis right panel */}
              <line x1="390" y1="20" x2="390" y2="162" stroke="#374151" strokeWidth="1" />

              {/* Right panel bars */}
              {/* ema_9 z=-1.2 */}
              <text x="386" y="34" textAnchor="end" fontSize="8" fill="#9ca3af">ema_9</text>
              <rect x="354" y="27" width="36" height="9" fill="#ef4444" opacity="0.8" />
              {/* return z=-1.6 */}
              <text x="386" y="48" textAnchor="end" fontSize="8" fill="#9ca3af">return</text>
              <rect x="342" y="41" width="48" height="9" fill="#ef4444" opacity="0.8" />
              {/* rsi_14 z=-1.8 (oversold) */}
              <text x="386" y="62" textAnchor="end" fontSize="8" fill="#9ca3af">rsi_14</text>
              <rect x="336" y="55" width="54" height="9" fill="#ef4444" opacity="0.8" />
              {/* bb_pct z=-1.4 */}
              <text x="386" y="76" textAnchor="end" fontSize="8" fill="#9ca3af">bb_pct</text>
              <rect x="348" y="69" width="42" height="9" fill="#ef4444" opacity="0.8" />
              {/* volume_ratio z=+1.3 */}
              <text x="386" y="90" textAnchor="end" fontSize="8" fill="#9ca3af">volume_ratio</text>
              <rect x="390" y="83" width="39" height="9" fill="#10b981" opacity="0.8" />
              {/* macd_hist z=-0.8 */}
              <text x="386" y="104" textAnchor="end" fontSize="8" fill="#9ca3af">macd_hist</text>
              <rect x="366" y="97" width="24" height="9" fill="#ef4444" opacity="0.7" />
              {/* atr_14 z=+1.1 */}
              <text x="386" y="118" textAnchor="end" fontSize="8" fill="#9ca3af">atr_14</text>
              <rect x="390" y="111" width="33" height="9" fill="#10b981" opacity="0.8" />
            </svg>
            {bullets([
              "Z-score = (cluster average − overall training mean) / overall training std. A z-score of +1.5 means this cluster's average value for that feature is 1.5 standard deviations above the training mean.",
              "High positive z-scores tell you what features are unusually elevated in this cluster. High RSI + high EMA slope = uptrend cluster.",
              "High negative z-scores tell you what's unusually low. Low RSI + negative return = potential mean-reversion setup.",
              "Features near zero (z-score −0.3 to +0.3) are not distinctive for this cluster — they don't define it.",
              "Comparing two clusters' fingerprints reveals what market conditions they represent. Opposite z-scores = opposite market regimes.",
            ], "#f59e0b")}
          </Section>

          {/* Section 3 — The Decision Tree */}
          <Section title="The Decision Tree" color="#3b82f6">
            {bullets([
              "The decision tree is trained on the cluster labels to find simple rules that separate one cluster from all others",
              "It is a description, not a prediction — it tells you which feature thresholds the model found distinguishing, but doesn't cause the cluster assignment",
              "The first split (root node) uses the single most separating feature. This is usually the most important feature for understanding what the cluster represents",
              "Depth 4 means up to 4 yes/no questions to classify a window. Shallower trees are easier to read; deeper trees are more precise",
              "Feature importance percentages (shown below the tree text) tell you which features collectively contributed most to separating this cluster",
            ], "#3b82f6")}
          </Section>

          {/* Section 4 — Representative Windows */}
          <Section title="Representative Windows" color="#ec4899">
            {bullets([
              "These are the 5 windows with the smallest distance to the cluster centroid in 32-dimensional latent space — the 'most average' examples of this cluster",
              "Visually similar windows across the 5 thumbnails confirm the cluster is coherent — if they look random, the cluster may not have a clear interpretation",
              "Look at the right edge of each window (most recent bars) — what does the latest price action look like for this cluster?",
              "Compare representative windows across two different clusters — the visual difference is what the model learned to distinguish",
              "The MiniCandlestick chart shows OHLCV bars for those windows — you can see whether the cluster captures trending candles, doji-heavy consolidation, or high-wick reversals",
            ], "#ec4899")}
          </Section>

          {/* Section 5 — Forward Return Analysis */}
          <Section title="Forward Return Analysis" color="#10b981">
            {/* Forward return bar chart SVG */}
            <svg viewBox="0 0 480 140" className="w-full mb-4 rounded-lg" style={{ background: "#111827" }}>
              {/* Axes */}
              <line x1="40" y1="10" x2="40" y2="110" stroke="#374151" strokeWidth="1" />
              <line x1="40" y1="65" x2="460" y2="65" stroke="#374151" strokeWidth="1" strokeDasharray="3 2" />
              <line x1="40" y1="110" x2="460" y2="110" stroke="#374151" strokeWidth="1" />
              {/* Y axis label */}
              <text x="12" y="68" textAnchor="middle" fontSize="8" fill="#6b7280" transform="rotate(-90,12,68)">% return</text>
              {/* Zero label */}
              <text x="35" y="68" textAnchor="end" fontSize="8" fill="#6b7280">0%</text>
              {/* Bars: 6 clusters, each ~55px wide with 10px gap */}
              {/* C0: +0.8% → green bar going up from y=65 */}
              <rect x="50" y="41" width="42" height="24" fill="#10b981" opacity="0.85" />
              <text x="71" y="115" textAnchor="middle" fontSize="8" fill="#9ca3af">C0</text>
              <text x="71" y="38" textAnchor="middle" fontSize="7" fill="#10b981">+0.8%</text>
              <text x="71" y="126" textAnchor="middle" fontSize="7" fill="#6b7280">58%</text>
              {/* C1: -0.4% → red bar going down from y=65 */}
              <rect x="105" y="65" width="42" height="12" fill="#ef4444" opacity="0.85" />
              <text x="126" y="115" textAnchor="middle" fontSize="8" fill="#9ca3af">C1</text>
              <text x="126" y="88" textAnchor="middle" fontSize="7" fill="#ef4444">−0.4%</text>
              <text x="126" y="126" textAnchor="middle" fontSize="7" fill="#6b7280">44%</text>
              {/* C2: +0.2% → light green */}
              <rect x="160" y="59" width="42" height="6" fill="#10b981" opacity="0.6" />
              <text x="181" y="115" textAnchor="middle" fontSize="8" fill="#9ca3af">C2</text>
              <text x="181" y="56" textAnchor="middle" fontSize="7" fill="#10b981">+0.2%</text>
              <text x="181" y="126" textAnchor="middle" fontSize="7" fill="#6b7280">51%</text>
              {/* C3: +1.2% → tall green */}
              <rect x="215" y="29" width="42" height="36" fill="#10b981" opacity="0.85" />
              <text x="236" y="115" textAnchor="middle" fontSize="8" fill="#9ca3af">C3</text>
              <text x="236" y="26" textAnchor="middle" fontSize="7" fill="#10b981">+1.2%</text>
              <text x="236" y="126" textAnchor="middle" fontSize="7" fill="#6b7280">62%</text>
              {/* C4: -0.9% → tall red */}
              <rect x="270" y="65" width="42" height="27" fill="#ef4444" opacity="0.85" />
              <text x="291" y="115" textAnchor="middle" fontSize="8" fill="#9ca3af">C4</text>
              <text x="291" y="102" textAnchor="middle" fontSize="7" fill="#ef4444">−0.9%</text>
              <text x="291" y="126" textAnchor="middle" fontSize="7" fill="#6b7280">40%</text>
              {/* C5: -0.1% → tiny red */}
              <rect x="325" y="65" width="42" height="3" fill="#ef4444" opacity="0.6" />
              <text x="346" y="115" textAnchor="middle" fontSize="8" fill="#9ca3af">C5</text>
              <text x="346" y="78" textAnchor="middle" fontSize="7" fill="#ef4444">−0.1%</text>
              <text x="346" y="126" textAnchor="middle" fontSize="7" fill="#6b7280">49%</text>
              {/* Legend label */}
              <text x="420" y="120" textAnchor="middle" fontSize="7" fill="#6b7280">% = hit rate</text>
            </svg>
            {bullets([
              "Mean return: average price change in the N bars after a window is assigned to this cluster. Positive = price typically rose after this pattern.",
              "Hit rate: % of times price moved in the positive direction after this cluster. 50% = random (no edge). Above 55% starts to be interesting.",
              "Small sample sizes (N < 200) mean high variance — don't over-interpret. Look for clusters with N > 500 and consistent hit rates.",
              "Mean vs median: a cluster with mean +0.5% but median +0.05% likely has a few large outlier moves driving the average. Median is more reliable.",
              "These are historical patterns from training data — they describe what happened, not what will happen. Treat them as hypotheses to watch, not trading signals.",
            ], "#10b981")}
          </Section>

          {/* Section 6 — Finding Hidden Patterns */}
          <Section title="Finding Hidden Patterns" color="#14b8a6">
            {bullets([
              "Cluster with high RSI + high return z-scores + positive forward returns = a momentum cluster. Price was rising and continued rising.",
              "Cluster with low RSI + negative bb_pct + high volume_ratio = an oversold-with-volume cluster — potential mean reversion setup worth watching.",
              "Compare cluster appearances by time of day (Analysis page → Hour-of-Day Heatmap). A cluster that only appears at market open is likely capturing the opening gap behaviour.",
              "If a cluster has a feature fingerprint dominated by hour_sin/hour_cos, it's a time-of-day cluster, not a price-action cluster — less useful for pattern analysis.",
              "Use forward returns to rank clusters by edge: which cluster has the most consistent hit rate AND meaningful mean return? That's your 'interesting' cluster to monitor in Inference.",
            ], "#14b8a6")}
            <div className="mt-4">
              <Tag label="z-score fingerprints" color="#f59e0b" />
              <Tag label="decision tree" color="#3b82f6" />
              <Tag label="forward returns" color="#10b981" />
            </div>
          </Section>

        </div>
      )}
    </div>
  );
}

// ── Panel wrapper ──────────────────────────────────────────────────────────────

function Panel({ title, loading, info, children }) {
  return (
    <div className="bg-gray-900 rounded-xl p-4 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <p className="text-sm font-semibold text-gray-300">{title}</p>
        {info && <InfoIcon content={info} />}
        {loading && <Spinner />}
      </div>
      {children}
    </div>
  );
}

// ── Cluster pill info popup content ───────────────────────────────────────────

function clusterPillInfo(k, profile) {
  if (!profile) return <p className="text-gray-400">Profile not loaded yet.</p>;

  const total = Object.values(profile.cluster_sizes).reduce((a, b) => a + b, 0);
  const size  = profile.cluster_sizes[String(k)] ?? 0;
  const pct   = total > 0 ? ((size / total) * 100).toFixed(1) : "0.0";

  const fingerprint = profile.fingerprints[String(k)] ?? [];
  const top3 = [...fingerprint]
    .sort((a, b) => Math.abs(b.z_score) - Math.abs(a.z_score))
    .slice(0, 3);

  const zLabel = z => {
    const sign = z > 0 ? "+" : "";
    const desc = Math.abs(z) > 1.5 ? "strong" : Math.abs(z) > 0.8 ? "moderate" : "weak";
    return `${sign}${z.toFixed(2)} (${desc})`;
  };

  return (
    <div className="space-y-2">
      <p className="font-semibold text-gray-200">Cluster {k}</p>
      <p className="text-gray-400">{size.toLocaleString()} windows — {pct}% of total</p>
      {top3.length > 0 && (
        <div>
          <p className="text-gray-500 mb-1">Top defining features:</p>
          <ul className="space-y-0.5">
            {top3.map(f => (
              <li key={f.feature} className="flex justify-between gap-3">
                <span className="text-gray-300">{f.feature}</span>
                <span style={{ color: f.z_score > 0 ? "#6366f1" : "#ef4444" }}>
                  {zLabel(f.z_score)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Panel content components ───────────────────────────────────────────────────

function FingerPrint({ profile, selectedCluster, containerRef }) {
  if (!profile) return null;
  const raw    = profile.fingerprints[String(selectedCluster)] || [];
  const sorted = [...raw].sort((a, b) => Math.abs(b.z_score) - Math.abs(a.z_score)).slice(0, 12);
  const data   = sorted.map(d => ({ name: d.feature, z: d.z_score }));

  return (
    <div ref={containerRef}>
      <p className="text-xs text-gray-500 mb-3">
        Top 12 features by |z-score| deviation from global mean. Cluster size:{" "}
        {profile.cluster_sizes[String(selectedCluster)] ?? "—"} windows.
      </p>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} layout="vertical" margin={{ left: 90, right: 20 }}>
          <XAxis type="number" tick={{ fill: "#9ca3af", fontSize: 11 }} />
          <YAxis dataKey="name" type="category" tick={{ fill: "#d1d5db", fontSize: 11 }} width={90} />
          <Tooltip contentStyle={tooltipStyle} formatter={v => [v.toFixed(3), "z-score"]} />
          <Bar dataKey="z">
            {data.map((d, i) => (
              <Cell key={i} fill={d.z > 0.5 ? "#6366f1" : d.z < -0.5 ? "#ef4444" : "#4b5563"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DecisionTree({ profile }) {
  if (!profile) return null;
  const top10 = profile.feature_importances.slice(0, 10);
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-gray-500 mb-2">Top 10 feature importances (shared tree, all clusters)</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={top10} layout="vertical" margin={{ left: 110, right: 20 }}>
            <XAxis type="number" tick={{ fill: "#9ca3af", fontSize: 11 }} />
            <YAxis dataKey="feature" type="category" tick={{ fill: "#d1d5db", fontSize: 11 }} width={110} />
            <Tooltip contentStyle={tooltipStyle} formatter={v => [v.toFixed(4), "importance"]} />
            <Bar dataKey="importance" fill="#6366f1" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div>
        <p className="text-xs text-gray-500 mb-2">Full decision tree rules (depth 4)</p>
        <pre className="font-mono text-xs text-gray-300 bg-gray-950 rounded p-3 overflow-auto">
          {profile.decision_tree_rules}
        </pre>
      </div>
    </div>
  );
}

function Representatives({ reps, loading }) {
  if (loading) return <div className="flex justify-center py-8"><Spinner /></div>;
  if (!reps || reps.windows.length === 0)
    return <p className="text-gray-500 text-sm">No windows found for this cluster.</p>;
  return (
    <div className="flex flex-wrap gap-4">
      {reps.windows.map(w => (
        <div key={w.rank} className="bg-gray-950 rounded-lg p-3 flex flex-col items-center gap-2">
          <p className="text-xs text-gray-400">Rank {w.rank} — dist {w.dist_to_centroid.toFixed(2)}</p>
          <MiniCandlestick ohlcv={w.ohlcv} width={140} height={90} />
          <p className="text-[10px] text-gray-600">{w.ohlcv[0]?.timestamp?.slice(0, 10)}</p>
        </div>
      ))}
    </div>
  );
}

function ForwardReturns({ fwdData, selectedCluster, containerRef }) {
  if (!fwdData) return null;
  const { horizon, n_non_overlapping, clusters } = fwdData;
  const n_clusters = Object.keys(clusters).length;
  const barData = Array.from({ length: n_clusters }, (_, k) => ({
    cluster: `C${k}`,
    mean: clusters[String(k)]?.mean ?? 0,
  }));

  return (
    <div ref={containerRef} className="space-y-4">
      <p className="text-xs text-gray-500">
        Next {horizon} × 5-min bars ({horizon * 5} min) — {n_non_overlapping} non-overlapping samples total.
      </p>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={barData} margin={{ left: 0, right: 10 }}>
          <XAxis dataKey="cluster" tick={{ fill: "#d1d5db", fontSize: 12 }} />
          <YAxis tickFormatter={v => `${(v * 100).toFixed(2)}%`} tick={{ fill: "#9ca3af", fontSize: 11 }} />
          <Tooltip contentStyle={tooltipStyle} formatter={v => [`${(v * 100).toFixed(3)}%`, "mean return"]} />
          <Bar dataKey="mean">
            {barData.map((d, i) => (
              <Cell
                key={i}
                fill={d.mean >= 0 ? "#10b981" : "#ef4444"}
                opacity={i === selectedCluster ? 1 : 0.55}
                stroke={i === selectedCluster ? "#fff" : "none"}
                strokeWidth={i === selectedCluster ? 1.5 : 0}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="overflow-x-auto">
        <table className="text-xs text-gray-400 w-full">
          <thead>
            <tr className="border-b border-gray-800 text-gray-500">
              <th className="py-1 pr-4 text-left">Cluster</th>
              <th className="py-1 pr-4 text-right">Mean</th>
              <th className="py-1 pr-4 text-right">Median</th>
              <th className="py-1 pr-4 text-right">P25</th>
              <th className="py-1 pr-4 text-right">P75</th>
              <th className="py-1 pr-4 text-right">Hit rate</th>
              <th className="py-1 text-right">n</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: n_clusters }, (_, k) => {
              const c   = clusters[String(k)];
              const pct = v => `${(v * 100).toFixed(2)}%`;
              return (
                <tr key={k} className={`border-b border-gray-800/50 ${k === selectedCluster ? "text-gray-100" : ""}`}>
                  <td className="py-1 pr-4">
                    <span style={{ color: COLORS[k % COLORS.length] }}>●</span>{" "}C{k}
                  </td>
                  <td className="py-1 pr-4 text-right">{pct(c.mean)}</td>
                  <td className="py-1 pr-4 text-right">{pct(c.median)}</td>
                  <td className="py-1 pr-4 text-right">{pct(c.p25)}</td>
                  <td className="py-1 pr-4 text-right">{pct(c.p75)}</td>
                  <td className="py-1 pr-4 text-right">{pct(c.hit_rate)}</td>
                  <td className="py-1 text-right">{c.n}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const PANEL_INFO = {
  fingerprint: (
    <div className="space-y-1.5">
      <p className="font-semibold text-gray-200 mb-1">Feature Fingerprint</p>
      <p>Z-score = how many standard deviations this cluster's average feature value sits above or below the global mean.</p>
      <p><span className="text-indigo-400 font-semibold">Indigo bar (positive z)</span> — cluster has more of this feature than average. <span className="text-red-400 font-semibold">Red bar (negative z)</span> — less than average. <span className="text-gray-500 font-semibold">Gray</span> — near average, not distinctive.</p>
      <p>|z| &gt; 1.5 is a strong signal. Features with |z| &lt; 0.5 don't define this cluster.</p>
    </div>
  ),
  decisionTree: (
    <div className="space-y-1.5">
      <p className="font-semibold text-gray-200 mb-1">Decision Tree Rules</p>
      <p>A single depth-4 tree fitted across all clusters. It finds the feature thresholds that best separate clusters globally.</p>
      <p><strong className="text-gray-300">Feature importance</strong> — how much each feature contributed to all splits. High importance + high |z| in fingerprint = strongly defining characteristic.</p>
      <p>Features near the root (early splits) separate the majority of windows. Features at leaves handle edge cases.</p>
    </div>
  ),
  representatives: (
    <div className="space-y-1.5">
      <p className="font-semibold text-gray-200 mb-1">Representative Windows</p>
      <p>The 5 windows closest to this cluster's centroid in 32-dimensional latent space. These are the most "typical" examples the model assigned here.</p>
      <p><strong className="text-gray-300">dist</strong> = Euclidean distance from the centroid. Rank 0 (lowest dist) is the purest example.</p>
      <p>If all 5 look similar → tight cluster. If varied → the cluster captures a broad regime rather than a specific pattern.</p>
    </div>
  ),
  forwardReturns: (
    <div className="space-y-1.5">
      <p className="font-semibold text-gray-200 mb-1">Forward Return Distribution</p>
      <p>Mean return of the close price N bars after each window ends. Computed on non-overlapping samples (one per window_size bars) to avoid autocorrelation.</p>
      <p><strong className="text-gray-300">Hit rate</strong> — fraction of samples where the next move was positive. Above 55% with n &gt; 30 is worth noting; below 30 samples, don't draw conclusions.</p>
      <p>P25–P75 spread shows how consistent the direction is. A narrow spread + high hit rate is more reliable than a wide spread with the same mean.</p>
    </div>
  ),
};

export default function ClusterProfilePage() {
  const [ready,   setReady]   = useState(null);
  const [profile, setProfile] = useState(null);
  const [fwdData, setFwdData] = useState(null);
  const [reps,    setReps]    = useState(null);

  const [profileLoading, setProfileLoading] = useState(false);
  const [fwdLoading,     setFwdLoading]     = useState(false);
  const [repsLoading,    setRepsLoading]    = useState(false);

  const [selectedCluster, setSelectedCluster] = useState(0);
  const [error, setError] = useState("");
  const fingerprintRef = useRef(null);
  const fwdReturnsRef  = useRef(null);
  const autoSavedRef   = useRef(false);  // fire once on initial load

  useEffect(() => {
    api.clusterResult()
      .then(r => setReady(r.state === "done" && r.result?.n_clusters > 0))
      .catch(() => setReady(false));
  }, []);

  useEffect(() => {
    if (!ready) return;
    fetchProfile();
    fetchFwd();
  }, [ready]);

  // Auto-save fingerprint_c0.png + forward_returns.png once both loads complete
  useEffect(() => {
    if (!profile || !fwdData || autoSavedRef.current) return;
    autoSavedRef.current = true;
    setTimeout(async () => {
      try {
        const fpUrl = await captureRechartsSvg(fingerprintRef);
        if (fpUrl) await api.saveArtifact(`fingerprint_c${selectedCluster}.png`, fpUrl);
        const fwdUrl = await captureRechartsSvg(fwdReturnsRef);
        if (fwdUrl) await api.saveArtifact("forward_returns.png", fwdUrl);
      } catch (err) {
        console.warn("Auto-save ClusterProfile PNGs failed:", err);
      }
    }, 800);
  }, [profile, fwdData]);

  useEffect(() => {
    if (!ready || !profile) return;
    fetchReps(selectedCluster);
  }, [selectedCluster, profile]);

  async function fetchProfile() {
    setProfileLoading(true);
    setError("");
    try {
      setProfile(await api.clusterProfile());
    } catch (e) {
      setError(e.message);
    } finally {
      setProfileLoading(false);
    }
  }

  async function fetchFwd() {
    setFwdLoading(true);
    try {
      setFwdData(await api.clusterFwdReturns());
    } catch (e) {
      setError(e.message);
    } finally {
      setFwdLoading(false);
    }
  }

  async function fetchReps(k) {
    setRepsLoading(true);
    try {
      setReps(await api.clusterReps(k, 5));
    } catch (e) {
      setError(e.message);
    } finally {
      setRepsLoading(false);
    }
  }

  if (ready === null) {
    return (
      <div className="flex items-center gap-3 py-8 text-gray-400 text-sm">
        <Spinner /> Checking cluster state…
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="bg-yellow-900/30 border border-yellow-700 rounded-xl px-5 py-4 text-yellow-300 text-sm">
        No cluster data available. Go to the <strong>Latent Space</strong> page and run{" "}
        <strong>Extract + Cluster</strong> first.
      </div>
    );
  }

  const nClusters = profile?.n_clusters ?? (fwdData ? Object.keys(fwdData.clusters).length : 8);

  return (
    <div>
      <h1 className="text-lg font-semibold text-gray-100 mb-1">Cluster Profile</h1>
      <p className="text-sm text-gray-500 mb-5">
        Characterise each cluster: which features define it, what the price action looks like,
        and whether windows in it tend to precede upward or downward moves.
      </p>

      {error && (
        <div className="mb-4 bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      <ClusterProfileGuide />

      {/* Cluster selector */}
      <div className="flex flex-wrap gap-2 mb-6">
        {Array.from({ length: nClusters }, (_, k) => (
          <div key={k} className="flex items-center gap-1">
            <button
              onClick={() => setSelectedCluster(k)}
              className={`px-3 py-1 rounded-full text-sm font-semibold transition-colors ${
                k === selectedCluster ? "text-gray-950" : "text-gray-400 bg-gray-800 hover:bg-gray-700"
              }`}
              style={k === selectedCluster ? { backgroundColor: COLORS[k % COLORS.length] } : {}}
            >
              C{k}
            </button>
            <InfoIcon content={clusterPillInfo(k, profile)} />
          </div>
        ))}
      </div>

      {/* Panel 1 — Feature Fingerprint */}
      <Panel
        title={`Feature Fingerprint — Cluster ${selectedCluster}`}
        loading={profileLoading}
        info={PANEL_INFO.fingerprint}
      >
        {profile
          ? <FingerPrint profile={profile} selectedCluster={selectedCluster} containerRef={fingerprintRef} />
          : <p className="text-gray-500 text-sm">Loading…</p>}
      </Panel>

      {/* Panel 2 — Decision Tree */}
      <Panel title="Decision Tree Rules" loading={profileLoading} info={PANEL_INFO.decisionTree}>
        {profile
          ? <DecisionTree profile={profile} />
          : <p className="text-gray-500 text-sm">Loading…</p>}
      </Panel>

      {/* Panel 3 — Representative Windows */}
      <Panel
        title={`Representative Windows — Cluster ${selectedCluster}`}
        loading={repsLoading}
        info={PANEL_INFO.representatives}
      >
        <Representatives reps={reps} loading={repsLoading} />
      </Panel>

      {/* Panel 4 — Forward Return Distribution */}
      <Panel title="Forward Return Distribution" loading={fwdLoading} info={PANEL_INFO.forwardReturns}>
        {fwdData
          ? <ForwardReturns fwdData={fwdData} selectedCluster={selectedCluster} containerRef={fwdReturnsRef} />
          : <p className="text-gray-500 text-sm">Loading…</p>}
      </Panel>
    </div>
  );
}

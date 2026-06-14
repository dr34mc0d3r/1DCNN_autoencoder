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
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl mb-6 overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-300 hover:text-gray-100 hover:bg-gray-800/40 transition-colors"
      >
        <span>What to look for &amp; Finding Patterns</span>
        <span className="text-gray-500 text-xs">{open ? "▲ Hide" : "▼ Show"}</span>
      </button>

      {open && (
        <div className="border-t border-gray-800 px-5 py-4 space-y-5 text-sm text-gray-400">

          {/* ── What to look for ── */}
          <div>
            <p className="text-gray-200 font-semibold mb-2">What to look for</p>
            <div className="space-y-3">

              <div>
                <p className="text-gray-300 font-medium mb-0.5">Feature Fingerprint</p>
                <ul className="list-disc list-inside space-y-1">
                  <li><strong className="text-gray-300">|z| &gt; 1.5 (indigo/red bars)</strong> — this cluster has a meaningfully elevated or depressed level of that feature compared to the full dataset. Strong defining characteristic.</li>
                  <li><strong className="text-gray-300">|z| &lt; 0.5 (gray bars)</strong> — this feature is near the global average for this cluster. It's not what makes this cluster distinctive.</li>
                  <li><strong className="text-gray-300">Multiple features with high |z| in the same direction</strong> — the cluster represents a coherent market regime. E.g., high rsi_14 + high return + positive body = momentum cluster.</li>
                  <li><strong className="text-gray-300">Conflicting z directions</strong> — mixed regime. The autoencoder found something unusual, but it doesn't fit a single clean narrative.</li>
                </ul>
              </div>

              <div>
                <p className="text-gray-300 font-medium mb-0.5">Decision Tree Rules</p>
                <ul className="list-disc list-inside space-y-1">
                  <li><strong className="text-gray-300">High feature importance</strong> — that feature most cleanly separates clusters from each other globally. If the same feature also has a high |z| in the fingerprint for your selected cluster, it's a defining characteristic.</li>
                  <li><strong className="text-gray-300">Feature appears early in the tree (near root)</strong> — it's a primary split. The first split separates the majority of windows.</li>
                  <li><strong className="text-gray-300">Tree rules feel interpretable</strong> — "rsi_14 &lt;= 42" followed by cluster 4 → low-RSI oversold regime. Good sign the model learned real structure.</li>
                  <li><strong className="text-gray-300">Tree rules feel arbitrary</strong> — small threshold differences between branches — suggests the clusters are close together in feature space. The model may have over-split.</li>
                </ul>
              </div>

              <div>
                <p className="text-gray-300 font-medium mb-0.5">Representative Windows</p>
                <ul className="list-disc list-inside space-y-1">
                  <li><strong className="text-gray-300">All 5 look similar</strong> — tight, well-defined cluster. The model consistently puts these kinds of windows together.</li>
                  <li><strong className="text-gray-300">Varied shapes across the 5</strong> — looser cluster. The model identified a broader regime (e.g. "low volatility") without a specific candle pattern.</li>
                  <li><strong className="text-gray-300">dist close to 0</strong> — very typical example of this cluster; a reliable representative.</li>
                  <li><strong className="text-gray-300">dist much higher than Rank 0</strong> — the cluster is spread out in latent space; the "centre" is somewhat abstract.</li>
                </ul>
              </div>

              <div>
                <p className="text-gray-300 font-medium mb-0.5">Forward Returns</p>
                <ul className="list-disc list-inside space-y-1">
                  <li><strong className="text-gray-300">Hit rate &gt; 55% with n &gt; 30</strong> — clusters that appear before more up-moves than down. Statistically notable; worth tracking.</li>
                  <li><strong className="text-gray-300">Hit rate &lt; 45% with n &gt; 30</strong> — clusters that tend to precede down-moves. Potential short-bias signal.</li>
                  <li><strong className="text-gray-300">n &lt; 20</strong> — too few non-overlapping samples for this cluster. Don't draw conclusions; it may be a rare regime.</li>
                  <li><strong className="text-gray-300">Large P25–P75 spread</strong> — wide distribution of outcomes. Mean return may be misleading; the cluster appears in both trending and choppy conditions.</li>
                </ul>
              </div>
            </div>
          </div>

          {/* ── Finding patterns ── */}
          <div>
            <p className="text-gray-200 font-semibold mb-2">Finding Hidden Patterns</p>
            <div className="space-y-3">

              <div>
                <p className="text-gray-300 font-medium mb-0.5">Step 1 — Identify the dominant feature story for each cluster</p>
                <p>Read the fingerprint top-to-bottom. The first 2–3 bars tell you the main story. "High rsi_14, high return, high vol_return" = momentum. "Low rsi_14, negative body, low rolling_vol" = slow bleed. "High bb_width, high atr_14" = expansion. "Low bb_width, low rolling_vol" = compression/consolidation.</p>
              </div>

              <div>
                <p className="text-gray-300 font-medium mb-0.5">Step 2 — Cross-reference fingerprint and forward returns</p>
                <p>Momentum clusters (high return z) often have high hit rates — the market was already moving and tended to continue. Oversold clusters (low rsi, negative body) may have high hit rates if they represent mean-reversion setups. A high |z| cluster with a near-50% hit rate suggests a volatility regime, not a directional one.</p>
              </div>

              <div>
                <p className="text-gray-300 font-medium mb-0.5">Step 3 — Use representative windows to build intuition</p>
                <p>Screenshot the Rank 0 candles for each cluster and label them manually ("opening gap fill", "midday grind up", "pre-close fade"). Over time, these labels become your regime names. Confirm against the Analysis page's Hour-of-Day Heatmap — if a cluster you labelled "opening range" shows up mostly at 9:30–10:00, that's validation.</p>
              </div>

              <div>
                <p className="text-gray-300 font-medium mb-0.5">Step 4 — Watch for high-z clusters with low window counts</p>
                <p>A cluster with &lt; 5% of windows but z-scores above 2.0 is a rare, extreme regime. These often correspond to earnings, macro events, or flash moves. The model separated them from everything else because they're genuinely different — even if there aren't enough samples for forward-return statistics.</p>
              </div>

              <div>
                <p className="text-gray-300 font-medium mb-0.5">Step 5 — Compare clusters after retraining</p>
                <p>After retraining with a different gamma, K, or vol_return clip, re-run this page. If the same 3–4 clusters appear with similar fingerprints, the model has learned stable market regimes. If the clusters look completely different each time, the model is fitting noise — consider increasing training data or regularising the latent dim.</p>
              </div>

            </div>
          </div>
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

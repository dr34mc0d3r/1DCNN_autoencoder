import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { api } from "../api.js";
import MiniCandlestick from "../components/MiniCandlestick.jsx";

const COLORS = ["#6366f1","#f59e0b","#10b981","#ef4444","#3b82f6","#8b5cf6","#ec4899","#14b8a6"];

function Spinner() {
  return (
    <svg className="animate-spin h-5 w-5 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function Panel({ title, loading, children }) {
  return (
    <div className="bg-gray-900 rounded-xl p-4 mb-6">
      <div className="flex items-center gap-3 mb-4">
        <p className="text-sm font-semibold text-gray-300">{title}</p>
        {loading && <Spinner />}
      </div>
      {children}
    </div>
  );
}

const tooltipStyle = { backgroundColor: "#111827", border: "none" };

// ── Panel 1: Feature Fingerprint ──────────────────────────────────────────────

function FingerPrint({ profile, selectedCluster }) {
  if (!profile) return null;
  const raw = profile.fingerprints[String(selectedCluster)] || [];
  const sorted = [...raw].sort((a, b) => Math.abs(b.z_score) - Math.abs(a.z_score)).slice(0, 12);
  const data = sorted.map(d => ({ name: d.feature, z: d.z_score }));

  return (
    <div>
      <p className="text-xs text-gray-500 mb-3">
        Top 12 features by |z-score| deviation from global mean. Cluster size:{" "}
        {profile.cluster_sizes[String(selectedCluster)] ?? "—"} windows.
      </p>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} layout="vertical" margin={{ left: 90, right: 20 }}>
          <XAxis type="number" tick={{ fill: "#9ca3af", fontSize: 11 }} />
          <YAxis dataKey="name" type="category" tick={{ fill: "#d1d5db", fontSize: 11 }} width={90} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={v => [v.toFixed(3), "z-score"]}
          />
          <Bar dataKey="z">
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={d.z > 0.5 ? "#6366f1" : d.z < -0.5 ? "#ef4444" : "#4b5563"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Panel 2: Decision Tree ────────────────────────────────────────────────────

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
        <pre className="font-mono text-xs text-gray-300 bg-gray-950 rounded p-3 overflow-auto max-h-64">
          {profile.decision_tree_rules}
        </pre>
      </div>
    </div>
  );
}

// ── Panel 3: Representative Windows ──────────────────────────────────────────

function Representatives({ reps, loading }) {
  if (loading) return <div className="flex justify-center py-8"><Spinner /></div>;
  if (!reps || reps.windows.length === 0) return (
    <p className="text-gray-500 text-sm">No windows found for this cluster.</p>
  );
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

// ── Panel 4: Forward Returns ──────────────────────────────────────────────────

function ForwardReturns({ fwdData, selectedCluster }) {
  if (!fwdData) return null;
  const { horizon, n_non_overlapping, clusters } = fwdData;
  const n_clusters = Object.keys(clusters).length;
  const barData = Array.from({ length: n_clusters }, (_, k) => ({
    cluster: `C${k}`,
    mean: clusters[String(k)]?.mean ?? 0,
    hit_rate: clusters[String(k)]?.hit_rate ?? 0,
    n: clusters[String(k)]?.n ?? 0,
  }));

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Next {horizon} × 5-min bars ({horizon * 5} min) — {n_non_overlapping} non-overlapping samples total.
      </p>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={barData} margin={{ left: 0, right: 10 }}>
          <XAxis dataKey="cluster" tick={{ fill: "#d1d5db", fontSize: 12 }} />
          <YAxis tickFormatter={v => `${(v * 100).toFixed(2)}%`} tick={{ fill: "#9ca3af", fontSize: 11 }} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={v => [`${(v * 100).toFixed(3)}%`, "mean return"]}
          />
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
              const c = clusters[String(k)];
              const pct = v => `${(v * 100).toFixed(2)}%`;
              return (
                <tr
                  key={k}
                  className={`border-b border-gray-800/50 ${k === selectedCluster ? "text-gray-100" : ""}`}
                >
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

export default function ClusterProfilePage() {
  const [ready,   setReady]   = useState(null);   // null=checking, true, false
  const [profile, setProfile] = useState(null);
  const [fwdData, setFwdData] = useState(null);
  const [reps,    setReps]    = useState(null);

  const [profileLoading, setProfileLoading] = useState(false);
  const [fwdLoading,     setFwdLoading]     = useState(false);
  const [repsLoading,    setRepsLoading]    = useState(false);

  const [selectedCluster, setSelectedCluster] = useState(0);
  const [error, setError] = useState("");

  // Check that clustering has been run
  useEffect(() => {
    api.clusterResult()
      .then(r => setReady(r.state === "done" && r.result?.n_clusters > 0))
      .catch(() => setReady(false));
  }, []);

  // Auto-load profile + forward returns on mount (once ready)
  useEffect(() => {
    if (!ready) return;
    fetchProfile();
    fetchFwd();
  }, [ready]);

  // Reload reps whenever selected cluster changes (and profile is loaded)
  useEffect(() => {
    if (!ready || !profile) return;
    fetchReps(selectedCluster);
  }, [selectedCluster, profile]);

  async function fetchProfile() {
    setProfileLoading(true);
    setError("");
    try {
      const data = await api.clusterProfile();
      setProfile(data);
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

      {/* Cluster selector */}
      <div className="flex flex-wrap gap-2 mb-6">
        {Array.from({ length: nClusters }, (_, k) => (
          <button
            key={k}
            onClick={() => setSelectedCluster(k)}
            className={`px-3 py-1 rounded-full text-sm font-semibold transition-colors ${
              k === selectedCluster
                ? "text-gray-950"
                : "text-gray-400 bg-gray-800 hover:bg-gray-700"
            }`}
            style={k === selectedCluster ? { backgroundColor: COLORS[k % COLORS.length] } : {}}
          >
            C{k}
          </button>
        ))}
      </div>

      {/* Panel 1 — Feature Fingerprint */}
      <Panel title={`Feature Fingerprint — Cluster ${selectedCluster}`} loading={profileLoading}>
        {profile
          ? <FingerPrint profile={profile} selectedCluster={selectedCluster} />
          : <p className="text-gray-500 text-sm">Loading…</p>}
      </Panel>

      {/* Panel 2 — Decision Tree */}
      <Panel title="Decision Tree Rules" loading={profileLoading}>
        {profile
          ? <DecisionTree profile={profile} />
          : <p className="text-gray-500 text-sm">Loading…</p>}
      </Panel>

      {/* Panel 3 — Representative Windows */}
      <Panel title={`Representative Windows — Cluster ${selectedCluster}`} loading={repsLoading}>
        <Representatives reps={reps} loading={repsLoading} />
      </Panel>

      {/* Panel 4 — Forward Return Distribution */}
      <Panel title="Forward Return Distribution" loading={fwdLoading}>
        {fwdData
          ? <ForwardReturns fwdData={fwdData} selectedCluster={selectedCluster} />
          : <p className="text-gray-500 text-sm">Loading…</p>}
      </Panel>
    </div>
  );
}

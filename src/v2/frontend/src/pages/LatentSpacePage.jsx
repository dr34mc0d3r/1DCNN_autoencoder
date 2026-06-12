import { useState } from "react";
import {
  ScatterChart, Scatter, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
} from "recharts";
import { api } from "../api.js";

const COLORS = ["#6366f1","#f59e0b","#10b981","#ef4444","#3b82f6","#8b5cf6","#ec4899","#14b8a6"];

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

export default function LatentSpacePage() {
  const [scatter, setScatter] = useState([]);
  const [result, setResult]   = useState(null);
  const [quality, setQuality] = useState(null);
  const [state, setState]     = useState("idle");
  const [error, setError]     = useState("");

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
    try {
      const res = await api.clusterQuality();
      setQuality(res.scores);
    } catch (e) {
      setError(e.message);
    }
  }

  const qualityData = quality
    ? Object.entries(quality).map(([k, v]) => ({ k: Number(k), ...v }))
    : [];

  const stats = result ? clusterStats(result.labels, result.n_clusters) : [];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Latent Space</h1>

      {/* Controls */}
      <div className="flex gap-3 mb-6 items-center">
        <button
          onClick={handleCluster}
          disabled={state === "running"}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-5 py-2 rounded text-sm font-semibold"
        >
          {state === "running" ? "Clustering…" : "Extract + Cluster"}
        </button>
        <button
          onClick={handleQuality}
          disabled={state === "running"}
          className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 px-5 py-2 rounded text-sm font-semibold"
        >
          Cluster Quality
        </button>
        {state === "running" && <Spinner />}
      </div>

      {/* Running status */}
      {state === "running" && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 text-sm text-gray-400">
          Extracting latent vectors → fitting K-Means → running t-SNE…
          <span className="text-gray-600 ml-1">This typically takes 30–60 seconds.</span>
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

      {/* t-SNE Scatter */}
      {scatter.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-4 mb-6">
          <p className="text-sm text-gray-400 mb-1">t-SNE Projection</p>
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
              <Scatter data={scatter} fill="#6366f1">
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
        <div className="bg-gray-900 rounded-xl p-4 mb-6">
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
              <Line yAxisId={0} type="monotone" dataKey="silhouette"        stroke="#6366f1" dot name="Silhouette" />
              <Line yAxisId={0} type="monotone" dataKey="davies_bouldin"    stroke="#f59e0b" dot name="Davies-Bouldin" />
              <Line yAxisId={1} type="monotone" dataKey="calinski_harabasz" stroke="#10b981" dot name="Calinski-Harabasz" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
    </div>
  );
}

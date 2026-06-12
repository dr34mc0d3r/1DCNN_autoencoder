import { useState } from "react";
import {
  ScatterChart, Scatter, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
} from "recharts";
import { api } from "../api.js";

const COLORS = ["#6366f1","#f59e0b","#10b981","#ef4444","#3b82f6","#8b5cf6","#ec4899","#14b8a6"];

export default function LatentSpacePage() {
  const [scatter, setScatter]     = useState([]);
  const [centroids, setCentroids] = useState([]);
  const [quality, setQuality]     = useState(null);
  const [state, setState]         = useState("idle");
  const [error, setError]         = useState("");

  async function handleCluster() {
    setState("running");
    setError("");
    try {
      await api.startCluster();
      // Poll result
      const poll = setInterval(async () => {
        const res = await api.clusterResult();
        if (res.state === "done") {
          clearInterval(poll);
          setScatter(res.result.scatter);
          setCentroids(res.result.centroids);
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

  // Build centroid chart data: one series per latent dim index
  const centroidData = centroids.map((c, i) =>
    Object.fromEntries([["cluster", i], ...c.map((v, d) => [`d${d}`, v])])
  );

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Latent Space</h1>

      <div className="flex gap-3 mb-6">
        <button
          onClick={handleCluster}
          disabled={state === "running"}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-5 py-2 rounded text-sm font-semibold"
        >
          {state === "running" ? "Clustering…" : "Extract + Cluster"}
        </button>
        <button
          onClick={handleQuality}
          className="bg-gray-700 hover:bg-gray-600 px-5 py-2 rounded text-sm font-semibold"
        >
          Cluster Quality
        </button>
      </div>

      {/* Panel A — t-SNE Scatter */}
      {scatter.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-4 mb-6">
          <p className="text-sm text-gray-400 mb-3">t-SNE Projection</p>
          <ResponsiveContainer width="100%" height={340}>
            <ScatterChart>
              <XAxis dataKey="x" stroke="#6B7280" name="dim-0" />
              <YAxis dataKey="y" stroke="#6B7280" name="dim-1" />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={{ backgroundColor: "#111827", border: "none" }} />
              <Scatter data={scatter} fill="#6366f1">
                {scatter.map((p, i) => (
                  <Cell key={i} fill={COLORS[p.label % COLORS.length]} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Panel C — Cluster Quality */}
      {qualityData.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-4 mb-6">
          <p className="text-sm text-gray-400 mb-3">Cluster Quality (K=2…16)</p>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={qualityData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="k" stroke="#6B7280" />
              <YAxis stroke="#6B7280" />
              <Tooltip contentStyle={{ backgroundColor: "#111827", border: "none" }} />
              <Legend />
              <Line type="monotone" dataKey="silhouette"       stroke="#6366f1" dot />
              <Line type="monotone" dataKey="davies_bouldin"   stroke="#f59e0b" dot />
              <Line type="monotone" dataKey="calinski_harabasz" stroke="#10b981" dot yAxisId={1} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}
    </div>
  );
}

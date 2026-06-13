import { useEffect, useState } from "react";
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

function LatentGuide() {
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
                <p className="text-gray-300 font-medium mb-0.5">t-SNE scatter shape</p>
                <ul className="list-disc list-inside space-y-1">
                  <li><strong className="text-gray-300">Tight, well-separated blobs</strong> — the model has learned genuinely distinct market regimes. Good clustering.</li>
                  <li><strong className="text-gray-300">One giant blob with the rest tiny</strong> — most of the data looks the same to the model. Try increasing K, retraining longer, or using a larger dataset.</li>
                  <li><strong className="text-gray-300">Crescent or horseshoe shapes</strong> — the market has a natural continuum (e.g. slow grind → fast trend). The clusters are capturing points along that continuum, which is still useful.</li>
                  <li><strong className="text-gray-300">Scattered noise with no structure</strong> — the model hasn't learned meaningful representations. The training data may be too short or the model undertrained.</li>
                </ul>
              </div>

              <div>
                <p className="text-gray-300 font-medium mb-0.5">Cluster size table</p>
                <ul className="list-disc list-inside space-y-1">
                  <li><strong className="text-gray-300">Balanced sizes (10–20% each)</strong> — the model is using all its clusters. Healthy.</li>
                  <li><strong className="text-gray-300">One cluster &gt; 50%</strong> — the dominant cluster is a catch-all "normal" regime. The others are specialised edge-case clusters. This is common and fine.</li>
                  <li><strong className="text-gray-300">Clusters with &lt; 1%</strong> — near-empty clusters waste K. Try reducing K or increasing training data.</li>
                </ul>
              </div>

              <div>
                <p className="text-gray-300 font-medium mb-0.5">Cluster Quality chart (K=2–16)</p>
                <ul className="list-disc list-inside space-y-1">
                  <li><strong className="text-gray-300">Silhouette elbow</strong> — look for where it stops rising sharply. That K gives the best-separated clusters relative to their width.</li>
                  <li><strong className="text-gray-300">Davies-Bouldin minimum</strong> — the K where this metric bottoms out is another vote for optimal K. Lower is better.</li>
                  <li><strong className="text-gray-300">Calinski-Harabasz peak</strong> — typically peaks early (K=3–5) for financial data. Good as a sanity check, less useful for picking a final K.</li>
                  <li>If all three agree on the same K, that's your number. If they disagree, pick the K that makes the scatter plot most interpretable.</li>
                </ul>
              </div>
            </div>
          </div>

          {/* ── Finding patterns ── */}
          <div>
            <p className="text-gray-200 font-semibold mb-2">Finding Hidden Patterns</p>

            <div className="space-y-3">
              <div>
                <p className="text-gray-300 font-medium mb-0.5">Step 1 — Run Extract + Cluster, then Cluster Quality</p>
                <p>Start with the default K from Config. Run Cluster Quality to see whether a different K would produce tighter clusters. If the quality chart clearly peaks at K=5 but you trained with K=8, retrain with K=5 — or just note the mismatch when interpreting results.</p>
              </div>

              <div>
                <p className="text-gray-300 font-medium mb-0.5">Step 2 — Characterise each cluster on Inference</p>
                <p>Run inference on a date range you know well (e.g. a confirmed trend or a choppy consolidation period). Watch which cluster dominates in the Cluster History strip. That cluster is the model's "label" for that market behaviour. Repeat for other known regimes.</p>
              </div>

              <div>
                <p className="text-gray-300 font-medium mb-0.5">Step 3 — Look for temporal clustering on Analysis</p>
                <p>The Hour-of-Day Heatmap and Day-of-Week Distribution on the Analysis page show whether certain clusters dominate at the open, midday, or close — or concentrate on specific days. A cluster that only appears at 9:30–10:00 is almost certainly the "opening-range volatility" regime.</p>
              </div>

              <div>
                <p className="text-gray-300 font-medium mb-0.5">Step 4 — Use MSE as an anomaly filter</p>
                <p>On Inference, windows with MSE above the p95 line are ones the model found hardest to reconstruct — they don't fit any learned regime cleanly. Cross-reference these timestamps against news, earnings, or macro events. Consistent MSE spikes at the same times across multiple runs suggest a repeating structural pattern the model partially understands.</p>
              </div>

              <div>
                <p className="text-gray-300 font-medium mb-0.5">Step 5 — Compare symbols (cross-symbol inference)</p>
                <p>Run a TSLA-trained model against MSFT data. If a cluster that dominated TSLA's trending days also dominates MSFT's trending days, that cluster is capturing a universal trend signature — not something TSLA-specific. This is a strong signal that the model has learned genuine market structure.</p>
              </div>
            </div>
          </div>

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

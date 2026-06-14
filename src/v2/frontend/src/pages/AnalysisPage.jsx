import { useEffect, useRef, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { api } from "../api.js";
import { captureRechartsSvg, captureElement } from "../utils/exportUtils.js";

const COLORS = ["#6366f1","#f59e0b","#10b981","#ef4444","#3b82f6","#8b5cf6","#ec4899","#14b8a6"];
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function Spinner() {
  return (
    <svg className="animate-spin h-5 w-5 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function WindowCanvas({ win, size = 2 }) {
  function draw(canvas) {
    if (!canvas || !win) return;
    const W = win[0].length, H = win.length;
    canvas.width  = W * size;
    canvas.height = H * size;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(W * size, H * size);
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const v = win[r][c];
        for (let dy = 0; dy < size; dy++) {
          for (let dx = 0; dx < size; dx++) {
            const idx = ((r * size + dy) * W * size + c * size + dx) * 4;
            img.data[idx] = img.data[idx+1] = img.data[idx+2] = Math.round(v * 255);
            img.data[idx+3] = 255;
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  return <canvas ref={draw} style={{ imageRendering: "pixelated" }} />;
}

// ── Temporal chart helpers ─────────────────────────────────────────────────────

function pivotByKey(rows, keyField, keyLabel, nClusters) {
  const keys = [...new Set(rows.map(r => r[keyField]))].sort((a, b) => a - b);
  return keys.map(k => {
    const rec = { [keyLabel]: keyField === "weekday" ? DAY_NAMES[k] : `${k}:00` };
    for (let c = 0; c < nClusters; c++) {
      const match = rows.find(r => r[keyField] === k && r.label === c);
      rec[`c${c}`] = match?.count ?? 0;
    }
    return rec;
  });
}

// Hour-of-Day Heatmap — CSS grid, each cell coloured by cluster with opacity = relative frequency
function HourHeatmap({ byHour, nClusters }) {
  if (!byHour?.length) return null;
  const hours = [...new Set(byHour.map(d => d.hour))].sort((a, b) => a - b);
  const maxCount = Math.max(...byHour.map(d => d.count), 1);
  const lookup = {};
  byHour.forEach(d => { lookup[`${d.label}-${d.hour}`] = d.count; });

  const cells = [];
  // Top-left corner
  cells.push(<div key="corner" className="text-[10px] text-gray-600 pr-2 pb-1">cluster</div>);
  // Hour headers
  hours.forEach(h => cells.push(
    <div key={`h-${h}`} className="text-[10px] text-gray-500 text-center pb-1">{h}</div>
  ));
  // Cluster rows
  for (let c = 0; c < nClusters; c++) {
    cells.push(
      <div key={`lbl-${c}`} className="text-[10px] text-gray-400 pr-2 flex items-center gap-1">
        <span style={{ color: COLORS[c % COLORS.length] }}>●</span>C{c}
      </div>
    );
    hours.forEach(h => {
      const count = lookup[`${c}-${h}`] ?? 0;
      const intensity = count / maxCount;
      cells.push(
        <div
          key={`${c}-${h}`}
          title={`Cluster ${c}  ${h}:00 — ${count} windows`}
          className="rounded-sm m-px"
          style={{
            height: 18,
            backgroundColor: COLORS[c % COLORS.length],
            opacity: intensity > 0 ? 0.15 + intensity * 0.85 : 0.04,
          }}
        />
      );
    });
  }

  return (
    <div
      className="overflow-x-auto"
      style={{ display: "grid", gridTemplateColumns: `auto repeat(${hours.length}, 1fr)` }}
    >
      {cells}
    </div>
  );
}

const tooltipStyle = { backgroundColor: "#111827", border: "none" };

// ── Reusable panel wrapper with its own Execute button + spinner ────────────────

function ChartPanel({ title, description, guide, onExecute, loading, hasData, children }) {
  const [guideOpen, setGuideOpen] = useState(false);
  return (
    <div className="bg-gray-900 rounded-xl p-4 mb-6">
      <div className="flex items-start justify-between gap-4 mb-1">
        <div className="flex-1">
          <p className="text-sm text-gray-400">{title}</p>
          {description && <p className="text-xs text-gray-600 mt-0.5">{description}</p>}
          {guide && (
            <button
              onClick={() => setGuideOpen(v => !v)}
              className="mt-1.5 text-xs text-gray-600 hover:text-gray-400 transition-colors"
            >
              {guideOpen ? "▲ Hide guide" : "▼ Guide"}
            </button>
          )}
        </div>
        <button
          onClick={onExecute}
          disabled={loading}
          className="shrink-0 flex items-center gap-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 px-3 py-1.5 rounded text-xs font-semibold"
        >
          {loading ? (
            <>
              <Spinner />
              <span>Running…</span>
            </>
          ) : (
            hasData ? "Re-run" : "Execute"
          )}
        </button>
      </div>
      {guide && guideOpen && (
        <div className="mt-3 border-t border-gray-800 pt-3 text-xs text-gray-400 space-y-2">
          {guide}
        </div>
      )}
      {hasData && <div className="mt-4">{children}</div>}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AnalysisPage() {
  const [activeModel, setActiveModel] = useState(null);
  const [recon,        setRecon]       = useState(null);

  useEffect(() => {
    api.getActiveModel().then(m => setActiveModel(Object.keys(m).length ? m : null)).catch(() => {});
  }, []);
  const [heatmapData,  setHeatmap]     = useState(null);
  const [hourData,     setHourData]    = useState(null);
  const [weekdayData,  setWeekday]     = useState(null);

  const [reconLoading,    setReconLoad]    = useState(false);
  const [heatmapLoading,  setHeatmapLoad]  = useState(false);
  const [hourLoading,     setHourLoad]     = useState(false);
  const [weekdayLoading,  setWeekdayLoad]  = useState(false);

  const [error, setError] = useState("");

  const reconMseRef  = useRef(null);
  const heatmapRef   = useRef(null);
  const hourChartRef = useRef(null);
  const wkChartRef   = useRef(null);

  async function fetchTemporal(setter, setLoading, chartRef, filename) {
    setLoading(true);
    setError("");
    try {
      setter(await api.getTemporal());
      setTimeout(async () => {
        try {
          if (filename === "heatmap_hour.png") {
            const dataUrl = await captureElement(heatmapRef);
            if (dataUrl) await api.saveArtifact(filename, dataUrl);
          } else if (chartRef) {
            const dataUrl = await captureRechartsSvg(chartRef);
            if (dataUrl) await api.saveArtifact(filename, dataUrl);
          }
        } catch (err) {
          console.warn(`Auto-save ${filename} failed:`, err);
        }
      }, 800);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleReconstruct() {
    setReconLoad(true);
    setError("");
    try {
      setRecon(await api.reconstruct(20));
      // Auto-save per-feature MSE BarChart
      setTimeout(async () => {
        try {
          const dataUrl = await captureRechartsSvg(reconMseRef);
          if (dataUrl) await api.saveArtifact("reconstruction_comparison.png", dataUrl);
        } catch (err) {
          console.warn("Auto-save reconstruction_comparison.png failed:", err);
        }
      }, 800);
    } catch (e) {
      setError(e.message);
    } finally {
      setReconLoad(false);
    }
  }

  const mseData = recon
    ? Object.entries(recon.per_feature_mse).map(([name, val]) => ({ name, val }))
    : [];

  function nClustersFrom(d) {
    if (!d) return 0;
    return Math.max(...d.by_hour.map(r => r.label), ...d.by_weekday.map(r => r.label)) + 1;
  }

  const hmClusters  = nClustersFrom(heatmapData);
  const hrClusters  = nClustersFrom(hourData);
  const wkClusters  = nClustersFrom(weekdayData);

  const hourPivot    = hourData    ? pivotByKey(hourData.by_hour,       "hour",    "hour",    hrClusters) : [];
  const weekdayPivot = weekdayData ? pivotByKey(weekdayData.by_weekday, "weekday", "weekday", wkClusters) : [];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Analysis</h1>

      <div className="flex items-center gap-2 mb-5 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-xs w-fit">
        <span className="text-gray-600 uppercase tracking-wider font-semibold">Model</span>
        {activeModel ? (
          <span className="text-indigo-300 font-mono">src/v2/backend/models/{activeModel.name}/</span>
        ) : (
          <span className="text-red-400">No active model — train one first</span>
        )}
      </div>

      {/* Panel A — Reconstruction Comparison */}
      <ChartPanel
        title="Reconstruction Comparison"
        description="Encode then decode 20 windows; compare original vs reconstructed to judge how well the model has learned the data."
        guide={
          <div className="space-y-2">
            <p><strong className="text-gray-300">What it does:</strong> Takes 20 random windows, encodes them through the CNN encoder to a compressed latent vector, then decodes back to the original shape. Comparing original vs reconstructed shows how faithfully the model compresses market patterns.</p>
            <p><strong className="text-gray-300">Reading the images:</strong> A reconstructed window that looks close to the original means the model understood that pattern well. A blurry or smoothed-out reconstruction means the model averaged it toward the nearest learned regime. A completely different reconstruction means the model has never seen anything like it — this window is an outlier from the model's perspective.</p>
            <p><strong className="text-gray-300">Per-feature MSE:</strong> Shows which of the 14 technical indicator features the model reconstructs worst. High MSE on a feature means the model deprioritises it in its internal representation. Low MSE features are the ones the model weights most heavily when encoding. Use this to understand what the model "pays attention to."</p>
            <p><strong className="text-gray-300">Overall MSE as a baseline:</strong> Re-run Reconstruction Comparison after retraining with different parameters (more epochs, different window size, different K). A lower overall MSE generally means a better-fitting model — but watch for overfitting if it drops too close to zero.</p>
          </div>
        }
        onExecute={handleReconstruct}
        loading={reconLoading}
        hasData={!!recon}
      >
        <div className="grid grid-cols-2 gap-6 mb-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">Original (first 10)</p>
            <div className="flex flex-wrap gap-1">
              {recon?.original.slice(0, 10).map((win, i) => <WindowCanvas key={i} win={win} size={3} />)}
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Reconstructed (first 10)</p>
            <div className="flex flex-wrap gap-1">
              {recon?.reconstructed.slice(0, 10).map((win, i) => <WindowCanvas key={i} win={win} size={3} />)}
            </div>
          </div>
        </div>

        {/* Per-feature MSE inline */}
        {mseData.length > 0 && (
          <>
            <p className="text-xs text-gray-500 mb-2">Per-Feature MSE — overall: {recon.overall_mse.toFixed(6)}</p>
            <div ref={reconMseRef}>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={mseData}>
                  <XAxis dataKey="name" stroke="#6B7280" tick={{ fontSize: 10 }} />
                  <YAxis stroke="#6B7280" tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="val" fill="#6366f1" name="MSE" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </ChartPanel>

      {/* Panel C — Hour-of-Day Heatmap */}
      <ChartPanel
        title="Hour-of-Day Heatmap"
        description="Each row is a cluster; each column is a market hour. Brighter = more windows of that cluster fell in that hour. Shows which clusters are characteristic of different times of day."
        guide={
          <div className="space-y-2">
            <p><strong className="text-gray-300">How to read it:</strong> Each coloured row is one cluster; each column is a market hour. Brighter cells = more windows of that cluster appeared at that hour. A bright cell means that cluster and that hour are strongly associated.</p>
            <p><strong className="text-gray-300">What to look for:</strong></p>
            <ul className="list-disc list-inside space-y-1">
              <li><strong className="text-gray-300">Bright only at 9–10</strong> — opening-range volatility regime. Common for breakout and gap-fill clusters.</li>
              <li><strong className="text-gray-300">Bright only at 15–16</strong> — closing behaviour. Often high-volume, directional runs into the close.</li>
              <li><strong className="text-gray-300">Uniformly bright across all hours</strong> — the cluster is a time-agnostic regime (e.g. calm drift or trend). It can occur at any point in the session.</li>
              <li><strong className="text-gray-300">All cells roughly equal brightness</strong> — the model's clusters don't carry strong temporal signatures. Not bad — it may be capturing volatility structure rather than intraday rhythm.</li>
            </ul>
          </div>
        }
        onExecute={() => fetchTemporal(setHeatmap, setHeatmapLoad, null, "heatmap_hour.png")}
        loading={heatmapLoading}
        hasData={!!heatmapData}
      >
        <div ref={heatmapRef}>
          <HourHeatmap byHour={heatmapData?.by_hour ?? []} nClusters={hmClusters} />
        </div>
      </ChartPanel>

      {/* Panel D — Cluster Frequency by Hour */}
      <ChartPanel
        title="Cluster Frequency by Hour of Day"
        description="Stacked bars show how many windows of each cluster appeared at each market hour. A cluster that dominates the open behaves differently to one that dominates the close."
        guide={
          <div className="space-y-2">
            <p><strong className="text-gray-300">How to read it:</strong> Each bar represents one market hour. The bar's total height = total windows in that hour. The colour breakdown = how many windows of each cluster fell there. A colour that fills most of a bar means that cluster dominates that hour.</p>
            <p><strong className="text-gray-300">What to look for:</strong></p>
            <ul className="list-disc list-inside space-y-1">
              <li>A cluster colour that appears proportionally the same across every hour is a market-state cluster — it occurs regardless of time.</li>
              <li>A colour that spikes dramatically in one hour but is nearly absent elsewhere is a time-specific regime (opening auction, lunch lull, power hour).</li>
              <li>Unequal total bar heights are normal for 5-minute data — more sessions open at 9:30 than any other hour, so that bar is often tallest.</li>
            </ul>
            <p><strong className="text-gray-300">Cross-reference with the Heatmap:</strong> These two charts show the same data at different angles. The heatmap is better for spotting single-cluster temporal spikes; the bar chart is better for seeing the full composition of each hour side-by-side.</p>
          </div>
        }
        onExecute={() => fetchTemporal(setHourData, setHourLoad, hourChartRef, "cluster_freq_hour.png")}
        loading={hourLoading}
        hasData={!!hourData}
      >
        <div ref={hourChartRef}>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={hourPivot}>
            <XAxis dataKey="hour" stroke="#6B7280" tick={{ fontSize: 11 }} />
            <YAxis stroke="#6B7280" tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend />
            {Array.from({ length: hrClusters }, (_, c) => (
              <Bar key={c} dataKey={`c${c}`} stackId="a" fill={COLORS[c % COLORS.length]} name={`Cluster ${c}`} />
            ))}
          </BarChart>
        </ResponsiveContainer>
        </div>
      </ChartPanel>

      {/* Panel E — Day-of-Week Distribution */}
      <ChartPanel
        title="Day-of-Week Distribution"
        description="Which clusters dominate each trading day. Uneven bar heights across days can reflect weekly seasonality — e.g. Mondays opening with different behaviour to Fridays closing."
        guide={
          <div className="space-y-2">
            <p><strong className="text-gray-300">How to read it:</strong> Same stacked bar format as the hourly chart, but grouped by day of the week (Mon–Fri). Total bar height = total windows that fell on that day across the entire CSV. The colour split shows which clusters those windows belong to.</p>
            <p><strong className="text-gray-300">What to look for:</strong></p>
            <ul className="list-disc list-inside space-y-1">
              <li><strong className="text-gray-300">Monday dominated by a different cluster</strong> — the model has captured gap-open or news-reaction behaviour that tends to concentrate at week-starts.</li>
              <li><strong className="text-gray-300">Friday showing a distinctive cluster</strong> — position-squaring and end-of-week volume patterns. Common in equities.</li>
              <li><strong className="text-gray-300">Wednesday spikes</strong> — for macro-driven stocks, Fed meeting Wednesdays can produce abnormal cluster concentrations.</li>
              <li><strong className="text-gray-300">All days look similar</strong> — the model doesn't see strong weekly seasonality in this symbol/period. Still valid; the temporal signal just lives in intraday patterns instead.</li>
            </ul>
            <p><strong className="text-gray-300">Caveat:</strong> For short date ranges (&lt; 3 months), individual events (earnings, macro announcements) can distort individual days more than actual weekly structure. Use a wide date range for statistically meaningful day-of-week distributions.</p>
          </div>
        }
        onExecute={() => fetchTemporal(setWeekday, setWeekdayLoad, wkChartRef, "cluster_freq_weekday.png")}
        loading={weekdayLoading}
        hasData={!!weekdayData}
      >
        <div ref={wkChartRef}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={weekdayPivot}>
              <XAxis dataKey="weekday" stroke="#6B7280" tick={{ fontSize: 11 }} />
              <YAxis stroke="#6B7280" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
              {Array.from({ length: wkClusters }, (_, c) => (
                <Bar key={c} dataKey={`c${c}`} stackId="a" fill={COLORS[c % COLORS.length]} name={`Cluster ${c}`} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartPanel>

      {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
    </div>
  );
}

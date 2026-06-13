import { useEffect, useState } from "react";
import { api } from "../api.js";
import FieldInfo from "../components/FieldInfo.jsx";

// ── Field info content ─────────────────────────────────────────────────────────

const INFO = {
  symbol: {
    label: "Symbol",
    what: "The stock ticker to download bars for, train on, and run inference against.",
    values: "Any valid US equity on Alpaca's IEX data feed — e.g. TSLA, AAPL, SPY, QQQ. Must be uppercase.",
    affects: "Download page fetches bars for this symbol. Every other page (Train, Windows, Latent Space, Analysis, Inference) operates on data from the resulting CSV.",
  },
  timeframe: {
    label: "Timeframe",
    what: "The OHLCV bar interval — how much clock time each candle represents.",
    values: "Alpaca strings: 1Min, 5Min, 15Min, 30Min, 1Hour, 4Hour, 1Day. Must match exactly — a typo means the training pipeline won't find the downloaded CSV.",
    affects: "Download page (fetches at this interval). window_size is measured in units of this timeframe. Every chart on the Inference and Windows pages shows one bar per tick at this resolution.",
  },
  start_date: {
    label: "Start Date",
    what: "Pre-fills the start date on the Download page. Has no direct effect on training.",
    values: "ISO date YYYY-MM-DD. Alpaca IEX data is generally available from 2016 onward for most US equities.",
    affects: "Download page form default only.",
  },
  end_date: {
    label: "End Date",
    what: "Pre-fills the end date on the Download page. Has no direct effect on training.",
    values: "ISO date YYYY-MM-DD. Must be after start_date and not in the future.",
    affects: "Download page form default only.",
  },
  window_size: {
    label: "Window Size",
    what: "Number of consecutive bars that form one training sample. The model receives a matrix of shape (window_size × 14 features) and learns to compress it into latent_dim numbers.",
    values: "16–256. Powers of 2 work best with the Conv1d architecture. Typical: 32 (quick test) or 64 (standard). Larger windows capture longer patterns but require more data and train slower.",
    affects: "Train page — determines the model input shape; changing this after training invalidates the saved model.pt. Windows page — canvas height equals window_size pixels per window. Inference page — sets the height of the live window image.",
  },
  latent_dim: {
    label: "Latent Dim",
    what: "Size of the compressed vector the encoder produces for each window. Lower = more aggressive compression, simpler clusters. Higher = richer representation but noisier latent space.",
    values: "4–128. Must be greater than n_clusters. Typical: 8 (quick test), 16 (daily bars), or 32 (standard 5Min).",
    affects: "Train page — determines encoder output size; changing after training invalidates the model. Latent Space page — t-SNE scatter reduces these vectors to 2D. Inference page — latent bar chart shows one bar per dimension.",
  },
  n_clusters: {
    label: "K-Means Clusters",
    what: "Number of K-Means groups to fit on the latent vectors after training. Each cluster represents a distinct market pattern the model has learned.",
    values: "2–20. Must be less than latent_dim. Use Latent Space → Cluster Quality to find the elbow in the silhouette score. Typical: 3 (quick test), 6–8 (standard).",
    affects: "Latent Space page — scatter plot colours and centroid profiles. Analysis page — temporal cluster pattern charts. Inference page — cluster history strip colour and the live cluster label for each bar.",
  },
  epochs: {
    label: "Epochs",
    what: "Maximum number of full passes through the training data. The guard may stop training earlier if it detects overfitting, oscillation, or plateau.",
    values: "1–1000. Typical: 10 (quick test), 50–150 (standard). More epochs are only useful if the loss is still declining when training stops.",
    affects: "Train page — sets the maximum width of the loss curve. If both curves flatten before this limit, the guard's patience setting will fire first.",
  },
  lr: {
    label: "Learning Rate",
    what: "Step size for the Adam optimiser — controls how aggressively weights are updated after each batch.",
    values: "0.000001–0.01. Typical: 0.001 (quick test), 0.0001 (standard), 0.00003 (deep fine-tuning). Too high causes a jagged, oscillating loss curve; too low causes very slow or stalled training.",
    affects: "Train page loss curve shape — a high LR makes both curves noisy and steep; a low LR makes them smooth but slow. Also interacts with the oscillation guard.",
  },
  batch_size: {
    label: "Batch Size",
    what: "Number of training windows processed together before updating model weights. Larger batches produce more stable gradient estimates but use more memory.",
    values: "8–1024. Powers of 2. Typical: 64 (quick test / daily bars), 128–256 (standard 5Min). Keep below roughly 10% of total training windows.",
    affects: "Training speed and gradient smoothness. Does not change what the model ultimately learns — only how it gets there. Not reflected directly on any page.",
  },
  test_split: {
    label: "Validation Split",
    what: "Fraction of windows held out for validation, taken chronologically from the most recent end of the dataset. This is out-of-sample data the model never trains on.",
    values: "0.05–0.3. Typical: 0.2 (20%). Lower = more training data but a noisier val curve. Higher = smoother val curve but less training data.",
    affects: "Train page — the orange val loss line comes exclusively from this held-out slice. The size of this slice also determines how far back the validation period starts.",
  },
  guard_patience: {
    label: "Guard Patience",
    what: "Number of consecutive epochs with no val loss improvement before the guard declares a plateau and stops training.",
    values: "3–50. Typical: 5 (quick test), 10–20 (standard). Lower stops sooner; higher lets training run longer through flat regions.",
    affects: "Train page — when the val loss line goes flat for this many epochs, training stops with reason 'Plateau'.",
  },
  guard_min_delta: {
    label: "Guard Min Delta",
    what: "Minimum reduction in val loss that counts as meaningful improvement. Changes smaller than this are treated as flat for plateau detection.",
    values: "0.000001–0.001. Typical: 0.00001. A larger value makes the guard less sensitive to small improvements.",
    affects: "Train page plateau detection. Rarely needs tuning.",
  },
  guard_overfit_ratio: {
    label: "Guard Overfit Ratio",
    what: "Maximum allowed ratio of val_loss ÷ train_loss. When the gap between the two loss curves grows beyond this multiple, the guard stops training.",
    values: "1.5–20. Typical: 10 (standard). Lower values stop sooner when curves diverge; 2.5 is too strict for early epochs when the ratio naturally spikes.",
    affects: "Train page — visible as the gap between the blue train and orange val loss lines. Stop reason will show 'Overfitting at epoch N (val/train=X.XX)'.",
  },
  guard_explosion_factor: {
    label: "Guard Explosion Factor",
    what: "If val loss increases by more than this multiple compared to the previous epoch, training stops immediately. Catches runaway loss spikes.",
    values: "2–100. Typical: 10. Rarely triggers with normal LR values. Reduce if you see sudden enormous loss jumps.",
    affects: "Train page — protects against a sharp vertical spike on the val loss line caused by a bad batch or too-high LR.",
  },
  guard_oscillation_window: {
    label: "Guard Oscillation Window",
    what: "Number of recent epochs used to measure val loss variability. The guard computes CV (std ÷ mean) over this window.",
    values: "3–30. Typical: 5 (quick test), 10–20 (standard). Wider windows require more sustained oscillation before stopping.",
    affects: "Train page — the oscillation check looks at the last N points on the val loss line. Too narrow and it fires during steep descent.",
  },
  guard_oscillation_cv: {
    label: "Guard Oscillation CV",
    what: "Maximum coefficient of variation (std ÷ mean) of recent val losses before triggering an oscillation stop. CV measures how much the values bounce relative to their average.",
    values: "0.1–1.0. Typical: 0.6–0.7 (standard). 0.4 is too strict — it fires during steep descent when values legitimately change a lot. Lower = stricter.",
    affects: "Train page — a high CV is visible as a jagged, back-and-forth val loss line. Stop reason shows 'Oscillating at epoch N (CV=X.XX)'.",
  },
  guard_collapse_threshold: {
    label: "Guard Collapse Threshold",
    what: "If val loss drops below this value the model has likely collapsed — outputting near-zero reconstructions regardless of input.",
    values: "0.0000001–0.001. Typical: 0.000001 (1e-6). Rarely triggered in normal training.",
    affects: "Train page — would appear as the val loss line hitting zero on the chart. Effectively a sanity check.",
  },
  scheduler: {
    label: "LR Scheduler",
    what: "Automatically adjusts the learning rate during training. Each option uses a different decay or cycling strategy.",
    values: "none (fixed LR), plateau, step, multistep, cosine, exponential, warmup, cyclic.",
    affects: "Train page LR card and chart. Final LR is saved to the model bundle.",
  },
  scheduler_plateau_factor: {
    label: "Reduce Factor",
    what: "Multiplicative factor applied to the LR when validation loss plateaus.",
    values: "0.1–0.9. 0.5 halves the LR each time. Smaller = more aggressive reduction.",
    affects: "How much the LR drops each time the scheduler fires.",
  },
  scheduler_plateau_patience: {
    label: "Patience (epochs)",
    what: "Consecutive epochs with no val loss improvement before the LR is reduced.",
    values: "Positive integer. Typical: 3–10. Independent of the Training Guard patience.",
    affects: "How long the scheduler waits before stepping down.",
  },
  scheduler_plateau_min_lr: {
    label: "Min LR",
    what: "Floor below which the LR will not be reduced further.",
    values: "Small positive float. Typical: 1e-7.",
    affects: "Prevents the LR from collapsing to zero.",
  },
  scheduler_step_size: {
    label: "Step Size (epochs)",
    what: "LR is multiplied by gamma every step_size epochs.",
    values: "Positive integer. Typical: 10–30.",
    affects: "Frequency of LR decay steps — visible as regular drops on the Train page LR line.",
  },
  scheduler_step_gamma: {
    label: "Gamma",
    what: "Multiplicative factor applied to the LR at each step.",
    values: "0.1–0.99. 0.5 halves the LR each step.",
    affects: "Size of each decay step.",
  },
  scheduler_multistep_milestones: {
    label: "Milestones",
    what: "Comma-separated list of epoch numbers at which the LR is multiplied by gamma.",
    values: "e.g. '20,40,60' — fires at epoch 20, 40, and 60.",
    affects: "Specific epochs where LR drops are visible on the Train page LR line.",
  },
  scheduler_multistep_gamma: {
    label: "Gamma",
    what: "Multiplicative factor applied to the LR at each milestone.",
    values: "0.1–0.99. 0.1 reduces LR to 10% at each milestone.",
    affects: "Size of each scheduled drop.",
  },
  scheduler_cosine_t_max: {
    label: "T Max (epochs)",
    what: "Half-period of the cosine annealing cycle. LR decays from its initial value to eta_min over T_max epochs.",
    values: "Positive integer. Set to your expected total epochs for a single smooth decay.",
    affects: "Shape of the cosine LR curve — visible on the Train page.",
  },
  scheduler_cosine_eta_min: {
    label: "Min LR",
    what: "Minimum LR value at the trough of the cosine curve.",
    values: "Small positive float. Typical: 1e-7.",
    affects: "The floor of the cosine decay.",
  },
  scheduler_exp_gamma: {
    label: "Gamma (per epoch)",
    what: "LR is multiplied by gamma every epoch, compounding geometrically.",
    values: "0.8–0.99. 0.95 decays by 5% per epoch. Lower = faster decay.",
    affects: "Rate of exponential LR decay — visible as a smooth curve on the Train page.",
  },
  scheduler_warmup_epochs: {
    label: "Warmup Epochs",
    what: "Number of epochs over which the LR ramps linearly from start_factor × lr up to lr.",
    values: "Positive integer. Typical: 3–10. After this many epochs, LR stays at its initial value.",
    affects: "Prevents large gradient updates in the first few epochs, useful when starting from random weights.",
  },
  scheduler_warmup_start_factor: {
    label: "Start Factor",
    what: "Fraction of the initial LR to start from. LR ramps from start_factor × lr to lr over warmup_epochs.",
    values: "0.01–0.5. 0.1 means warmup starts at 10% of the configured LR.",
    affects: "Initial LR at the start of training — lower start factor = gentler warmup.",
  },
  scheduler_cyclic_base_lr: {
    label: "Base LR (min)",
    what: "Lower boundary of the LR cycle. The LR oscillates between base_lr and max_lr.",
    values: "Positive float, must be less than max_lr. Typical: 1e-5.",
    affects: "Trough of each cycle — visible on the Train page LR right axis.",
  },
  scheduler_cyclic_max_lr: {
    label: "Max LR",
    what: "Upper boundary of the LR cycle.",
    values: "Positive float, must be greater than base_lr. Typical: 1e-2.",
    affects: "Peak of each cycle. If too high, may cause oscillating loss.",
  },
  scheduler_cyclic_step_size: {
    label: "Step Size (epochs up)",
    what: "Number of epochs in the ascending half of one cycle. Full cycle = 2 × step_size.",
    values: "Positive integer. Typical: 5–20. A full triangular cycle is 2 × step_size epochs.",
    affects: "Width of each LR triangle on the Train page chart.",
  },
  scheduler_cyclic_mode: {
    label: "Cycle Mode",
    what: "Controls how the LR boundaries change across cycles. triangular: constant bounds. triangular2: max_lr halves each cycle. exp_range: bounds decay exponentially.",
    values: "triangular, triangular2, exp_range.",
    affects: "Whether peaks diminish over time — visible on the Train page LR line.",
  },
};

// ── Presets ────────────────────────────────────────────────────────────────────

const PRESETS = [
  {
    name: "Smoke Test",
    tag: "~5 min",
    color: "border-yellow-600 text-yellow-400",
    description: "Verify the full pipeline works end-to-end quickly. Use with 2 weeks of 5Min data.",
    download: "2 weeks of 5Min bars  (≈780 bars)",
    values: {
      timeframe: "5Min", window_size: 32, latent_dim: 8,
      epochs: 10, lr: 0.001, batch_size: 64, n_clusters: 3, test_split: 0.2,
      guard_patience: 5, guard_min_delta: 0.0001,
      guard_overfit_ratio: 20.0, guard_explosion_factor: 10.0,
      guard_oscillation_window: 3, guard_oscillation_cv: 0.9,
      guard_collapse_threshold: 1e-7,
    },
  },
  {
    name: "Standard 5Min",
    tag: "recommended",
    color: "border-indigo-500 text-indigo-400",
    description: "Recommended starting point for intraday pattern learning. Guards are relaxed so training runs to a natural plateau.",
    download: "1–2 years of 5Min bars  (≈20 k–40 k bars)",
    values: {
      timeframe: "5Min", window_size: 64, latent_dim: 32,
      epochs: 50, lr: 0.0001, batch_size: 256, n_clusters: 8, test_split: 0.2,
      guard_patience: 10, guard_min_delta: 0.00001,
      guard_overfit_ratio: 10.0, guard_explosion_factor: 10.0,
      guard_oscillation_window: 10, guard_oscillation_cv: 0.6,
      guard_collapse_threshold: 1e-6,
    },
  },
  {
    name: "Deep 5Min",
    tag: "long run",
    color: "border-purple-500 text-purple-400",
    description: "Extended training once Standard has converged. Lower LR and wider guard windows for fine-grained convergence.",
    download: "Same as Standard 5Min",
    values: {
      timeframe: "5Min", window_size: 64, latent_dim: 32,
      epochs: 150, lr: 0.00003, batch_size: 256, n_clusters: 8, test_split: 0.2,
      guard_patience: 20, guard_min_delta: 0.000001,
      guard_overfit_ratio: 10.0, guard_explosion_factor: 10.0,
      guard_oscillation_window: 20, guard_oscillation_cv: 0.7,
      guard_collapse_threshold: 1e-6,
    },
  },
  {
    name: "Daily Bars",
    tag: "multi-year",
    color: "border-green-600 text-green-400",
    description: "Learn multi-week swing patterns from daily closes. Smaller window and latent space suit the lower bar count.",
    download: "5–10 years of 1Day bars  (≈1 250–2 500 bars)",
    values: {
      timeframe: "1Day", window_size: 20, latent_dim: 16,
      epochs: 100, lr: 0.0001, batch_size: 32, n_clusters: 6, test_split: 0.2,
      guard_patience: 15, guard_min_delta: 0.00001,
      guard_overfit_ratio: 5.0, guard_explosion_factor: 10.0,
      guard_oscillation_window: 10, guard_oscillation_cv: 0.5,
      guard_collapse_threshold: 1e-6,
    },
  },
];

// ── Field sections ─────────────────────────────────────────────────────────────

const SECTIONS = [
  {
    heading: "Data",
    fields: [
      { key: "symbol",     label: "Symbol",    type: "text" },
      { key: "timeframe",  label: "Timeframe", type: "text" },
      { key: "start_date", label: "Start Date", type: "date" },
      { key: "end_date",   label: "End Date",   type: "date" },
    ],
  },
  {
    heading: "Model",
    fields: [
      { key: "window_size", label: "Window Size",      type: "number" },
      { key: "latent_dim",  label: "Latent Dim",       type: "number" },
      { key: "n_clusters",  label: "K-Means Clusters", type: "number" },
    ],
  },
  {
    heading: "Training",
    fields: [
      { key: "epochs",     label: "Epochs",            type: "number" },
      { key: "lr",         label: "Learning Rate",     type: "number" },
      { key: "batch_size", label: "Batch Size",        type: "number" },
      { key: "test_split", label: "Validation Split",  type: "number" },
    ],
  },
  {
    heading: "Training Guard",
    fields: [
      { key: "guard_patience",           label: "Patience",           type: "number" },
      { key: "guard_min_delta",          label: "Min Delta",          type: "number" },
      { key: "guard_overfit_ratio",      label: "Overfit Ratio",      type: "number" },
      { key: "guard_explosion_factor",   label: "Explosion Factor",   type: "number" },
      { key: "guard_oscillation_window", label: "Oscillation Window", type: "number" },
      { key: "guard_oscillation_cv",     label: "Oscillation CV",     type: "number" },
      { key: "guard_collapse_threshold", label: "Collapse Threshold", type: "number" },
    ],
  },
];

// ── Scheduler field definitions ───────────────────────────────────────────────

const SCHEDULER_FIELDS = {
  plateau: [
    { key: "scheduler_plateau_factor",   label: "Reduce Factor",    type: "number" },
    { key: "scheduler_plateau_patience", label: "Patience (epochs)", type: "number" },
    { key: "scheduler_plateau_min_lr",   label: "Min LR",           type: "number" },
  ],
  step: [
    { key: "scheduler_step_size",  label: "Step Size (epochs)", type: "number" },
    { key: "scheduler_step_gamma", label: "Gamma",              type: "number" },
  ],
  multistep: [
    { key: "scheduler_multistep_milestones", label: "Milestones (comma-sep epochs)", type: "text" },
    { key: "scheduler_multistep_gamma",      label: "Gamma",                         type: "number" },
  ],
  cosine: [
    { key: "scheduler_cosine_t_max",   label: "T Max (epochs)", type: "number" },
    { key: "scheduler_cosine_eta_min", label: "Min LR",         type: "number" },
  ],
  exponential: [
    { key: "scheduler_exp_gamma", label: "Gamma (per epoch)", type: "number" },
  ],
  warmup: [
    { key: "scheduler_warmup_epochs",       label: "Warmup Epochs", type: "number" },
    { key: "scheduler_warmup_start_factor", label: "Start Factor",  type: "number" },
  ],
  cyclic: [
    { key: "scheduler_cyclic_base_lr",   label: "Base LR (min)",         type: "number" },
    { key: "scheduler_cyclic_max_lr",    label: "Max LR",                type: "number" },
    { key: "scheduler_cyclic_step_size", label: "Step Size (epochs up)", type: "number" },
  ],
};

// ── Component ──────────────────────────────────────────────────────────────────

export default function ConfigPage() {
  const [cfg, setCfg]             = useState(null);
  const [saving, setSaving]       = useState(false);
  const [msg, setMsg]             = useState("");
  const [activePreset, setActive] = useState(null);

  useEffect(() => {
    api.getConfig().then(setCfg).catch(console.error);
  }, []);

  function handleChange(key, value) {
    setCfg((c) => ({ ...c, [key]: value }));
    setActive(null);
    setMsg("");
  }

  function applyPreset(preset) {
    setCfg((c) => ({ ...c, ...preset.values }));
    setActive(preset.name);
    setMsg("");
  }

  async function handleSave() {
    setSaving(true);
    setMsg("");
    try {
      await api.updateConfig(cfg);
      setMsg("Saved.");
    } catch (e) {
      setMsg(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  if (!cfg) return <p className="text-gray-400">Loading…</p>;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Configuration</h1>

      {/* ── Presets ── */}
      <section className="mb-8">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 border-b border-gray-800 pb-1">
          Presets
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => applyPreset(p)}
              className={`text-left border rounded-lg p-4 transition-colors hover:bg-gray-800
                ${activePreset === p.name ? "bg-gray-800 " + p.color : "border-gray-700"}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-sm font-semibold ${activePreset === p.name ? p.color.split(" ")[1] : "text-gray-100"}`}>
                  {p.name}
                </span>
                <span className="text-xs text-gray-500">{p.tag}</span>
              </div>
              <p className="text-xs text-gray-400 leading-snug mb-2">{p.description}</p>
              <p className="text-xs text-gray-500">
                <span className="text-gray-600">Download: </span>{p.download}
              </p>
            </button>
          ))}
        </div>
        {activePreset && (
          <p className="text-xs text-indigo-400 mt-2">
            "{activePreset}" applied — review the fields below, then click Save.
          </p>
        )}
      </section>

      {/* ── Sectioned fields ── */}
      {SECTIONS.map(({ heading, fields }) => (
        <section key={heading} className="mb-6">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 border-b border-gray-800 pb-1">
            {heading}
          </h2>
          <div className="grid grid-cols-2 gap-4">
            {fields.map(({ key, label, type }) => (
              <div key={key} className="flex flex-col gap-1">
                <label className="text-xs text-gray-400 flex items-center">
                  {label}
                  <FieldInfo info={INFO[key]} />
                </label>
                <input
                  type={type}
                  value={cfg[key] ?? ""}
                  step={type === "number" ? "any" : undefined}
                  onChange={(e) =>
                    handleChange(key, type === "number" ? Number(e.target.value) : e.target.value)
                  }
                  className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* ── LR Scheduler ── */}
      <section className="mb-6">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 border-b border-gray-800 pb-1">
          LR Scheduler
        </h2>

        {/* Scheduler type selector */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400 flex items-center">
              Scheduler Type
              <FieldInfo info={INFO.scheduler} />
            </label>
            <select
              value={cfg.scheduler ?? "none"}
              onChange={(e) => handleChange("scheduler", e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            >
              <option value="none">None (fixed LR)</option>
              <option value="plateau">ReduceLROnPlateau</option>
              <option value="step">Step Decay</option>
              <option value="multistep">Multi-Step</option>
              <option value="cosine">Cosine Annealing</option>
              <option value="exponential">Exponential Decay</option>
              <option value="warmup">Linear Warmup</option>
              <option value="cyclic">Cyclic LR</option>
            </select>
          </div>
        </div>

        {/* Per-scheduler param fields */}
        {SCHEDULER_FIELDS[cfg.scheduler] && (
          <div className="grid grid-cols-2 gap-4">
            {SCHEDULER_FIELDS[cfg.scheduler].map(({ key, label, type }) => (
              <div key={key} className="flex flex-col gap-1">
                <label className="text-xs text-gray-400 flex items-center">
                  {label}
                  <FieldInfo info={INFO[key]} />
                </label>
                <input
                  type={type}
                  value={cfg[key] ?? ""}
                  step={type === "number" ? "any" : undefined}
                  onChange={(e) =>
                    handleChange(key, type === "number" ? Number(e.target.value) : e.target.value)
                  }
                  className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
            ))}

            {/* Cyclic mode select (only for cyclic) */}
            {cfg.scheduler === "cyclic" && (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400 flex items-center">
                  Cycle Mode
                  <FieldInfo info={INFO.scheduler_cyclic_mode} />
                </label>
                <select
                  value={cfg.scheduler_cyclic_mode ?? "triangular2"}
                  onChange={(e) => handleChange("scheduler_cyclic_mode", e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                >
                  <option value="triangular">Triangular (constant bounds)</option>
                  <option value="triangular2">Triangular2 (halving peaks)</option>
                  <option value="exp_range">Exp Range (exponential decay)</option>
                </select>
              </div>
            )}
          </div>
        )}
      </section>

      <div className="flex items-center gap-4 mt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-5 py-2 rounded text-sm font-semibold"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {msg && (
          <span className={`text-sm ${msg.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>
            {msg}
          </span>
        )}
      </div>
    </div>
  );
}

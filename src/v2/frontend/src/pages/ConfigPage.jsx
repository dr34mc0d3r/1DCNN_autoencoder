import { useEffect, useState } from "react";
import { api } from "../api.js";
import FieldInfo from "../components/FieldInfo.jsx";

function numToDecimal(v) {
  if (v == null || v === "") return "";
  const s = String(Number(v));
  if (!s.includes("e")) return s;
  const [coeff, exp] = s.split("e");
  const e = parseInt(exp);
  const [intPart, decPart = ""] = coeff.replace("-", "").split(".");
  const sign = Number(v) < 0 ? "-" : "";
  if (e < 0) return sign + "0." + "0".repeat(-e - 1) + intPart + decPart;
  const full = intPart + decPart.padEnd(e, "0");
  return sign + full.slice(0, e + 1) + (full.length > e + 1 ? "." + full.slice(e + 1) : "");
}

// ── Guard SVG illustrations ────────────────────────────────────────────────────

const GUARD_SVG = {
  patience: (
    <svg viewBox="0 0 240 106" className="w-full">
      <line x1="22" y1="8"  x2="22"  y2="78" stroke="#4b5563" strokeWidth="1"/>
      <line x1="22" y1="78" x2="215" y2="78" stroke="#4b5563" strokeWidth="1"/>
      {/* val loss: steep descent → plateau */}
      <polyline fill="none" strokeLinecap="round" strokeLinejoin="round"
        points="22,10 45,20 68,35 88,55 100,65 115,66 130,64 145,66 160,64 175,66 190,64"
        stroke="#fb923c" strokeWidth="2"/>
      {/* stop marker */}
      <line x1="190" y1="8" x2="190" y2="78" stroke="#f87171" strokeWidth="1.5" strokeDasharray="4,3"/>
      {/* patience bracket */}
      <line x1="100" y1="85" x2="190" y2="85" stroke="#9ca3af" strokeWidth="1"/>
      <line x1="100" y1="82" x2="100" y2="88" stroke="#9ca3af" strokeWidth="1"/>
      <line x1="190" y1="82" x2="190" y2="88" stroke="#9ca3af" strokeWidth="1"/>
      <text x="145" y="100" textAnchor="middle" fontSize="9" fill="#9ca3af">patience epochs (no improvement)</text>
      <text x="193" y="20" fontSize="9" fill="#f87171">STOP</text>
      <text x="25"  y="17" fontSize="9" fill="#fb923c">val loss</text>
    </svg>
  ),

  min_delta: (
    <svg viewBox="0 0 240 106" className="w-full">
      <line x1="22" y1="8"  x2="22"  y2="78" stroke="#4b5563" strokeWidth="1"/>
      <line x1="22" y1="78" x2="215" y2="78" stroke="#4b5563" strokeWidth="1"/>
      {/* min_delta band */}
      <rect x="22" y="40" width="193" height="18" fill="#4b5563" opacity="0.45" rx="1"/>
      {/* val loss: tiny fluctuations within the band */}
      <polyline fill="none" strokeLinecap="round" strokeLinejoin="round"
        points="22,50 42,48 62,52 82,47 102,51 122,48 142,52 162,47 182,51 202,48"
        stroke="#fb923c" strokeWidth="2"/>
      {/* band bracket */}
      <line x1="218" y1="40" x2="218" y2="58" stroke="#6366f1" strokeWidth="1.5"/>
      <line x1="215" y1="40" x2="221" y2="40" stroke="#6366f1" strokeWidth="1.5"/>
      <line x1="215" y1="58" x2="221" y2="58" stroke="#6366f1" strokeWidth="1.5"/>
      <text x="110" y="36" textAnchor="middle" fontSize="9" fill="#6366f1">min_delta zone</text>
      <text x="25"  y="18" fontSize="9" fill="#fb923c">val loss</text>
      <text x="22"  y="97" fontSize="8" fill="#9ca3af">changes within the band count as "no improvement"</text>
    </svg>
  ),

  overfit_ratio: (
    <svg viewBox="0 0 240 106" className="w-full">
      <line x1="22" y1="8"  x2="22"  y2="78" stroke="#4b5563" strokeWidth="1"/>
      <line x1="22" y1="78" x2="215" y2="78" stroke="#4b5563" strokeWidth="1"/>
      {/* train loss: steady descent */}
      <polyline fill="none" strokeLinecap="round" strokeLinejoin="round"
        points="22,12 60,28 100,42 140,52 175,58 200,60"
        stroke="#60a5fa" strokeWidth="2"/>
      {/* val loss: descent then diverges up */}
      <polyline fill="none" strokeLinecap="round" strokeLinejoin="round"
        points="22,15 60,30 100,44 130,50 155,48 175,44 195,40 200,38"
        stroke="#fb923c" strokeWidth="2"/>
      {/* ratio bracket */}
      <line x1="200" y1="38" x2="200" y2="60" stroke="#f87171" strokeWidth="1.5"/>
      <line x1="197" y1="38" x2="203" y2="38" stroke="#f87171" strokeWidth="1.5"/>
      <line x1="197" y1="60" x2="203" y2="60" stroke="#f87171" strokeWidth="1.5"/>
      {/* stop line */}
      <line x1="200" y1="8" x2="200" y2="78" stroke="#f87171" strokeWidth="1" strokeDasharray="4,3" opacity="0.7"/>
      <text x="204" y="52" fontSize="9" fill="#f87171">ratio</text>
      <text x="25"  y="18" fontSize="9" fill="#60a5fa">train</text>
      <text x="25"  y="30" fontSize="9" fill="#fb923c">val</text>
      <text x="168" y="20" fontSize="9" fill="#f87171">STOP</text>
      <text x="110" y="97" textAnchor="middle" fontSize="8" fill="#9ca3af">val/train ratio grows as curves diverge</text>
    </svg>
  ),

  explosion_factor: (
    <svg viewBox="0 0 240 106" className="w-full">
      <line x1="22" y1="8"  x2="22"  y2="78" stroke="#4b5563" strokeWidth="1"/>
      <line x1="22" y1="78" x2="215" y2="78" stroke="#4b5563" strokeWidth="1"/>
      {/* val loss: normal descent */}
      <polyline fill="none" strokeLinecap="round" strokeLinejoin="round"
        points="22,12 50,28 80,44 110,55 135,61 148,63"
        stroke="#fb923c" strokeWidth="2"/>
      {/* spike up then recovers */}
      <polyline fill="none" strokeLinecap="round" strokeLinejoin="round"
        points="148,63 153,10 158,63 175,64 200,65"
        stroke="#fb923c" strokeWidth="2"/>
      {/* spike annotation */}
      <line x1="153" y1="10" x2="168" y2="18" stroke="#f87171" strokeWidth="1"/>
      <text x="170" y="22" fontSize="9" fill="#f87171">×factor spike</text>
      {/* stop line */}
      <line x1="153" y1="8" x2="153" y2="78" stroke="#f87171" strokeWidth="1.5" strokeDasharray="4,3"/>
      <text x="25"  y="18" fontSize="9" fill="#fb923c">val loss</text>
      <text x="94"  y="73" textAnchor="middle" fontSize="9" fill="#f87171">STOP</text>
      <text x="22"  y="97" fontSize="8" fill="#9ca3af">val loss jumped more than explosion_factor × previous epoch</text>
    </svg>
  ),

  oscillation_window: (
    <svg viewBox="0 0 240 106" className="w-full">
      <line x1="22" y1="8"  x2="22"  y2="78" stroke="#4b5563" strokeWidth="1"/>
      <line x1="22" y1="78" x2="215" y2="78" stroke="#4b5563" strokeWidth="1"/>
      {/* highlighted window region */}
      <rect x="90" y="8" width="105" height="70" fill="#6366f1" opacity="0.08" rx="2"/>
      {/* val loss: descent then zigzag */}
      <polyline fill="none" strokeLinecap="round" strokeLinejoin="round"
        points="22,10 48,25 72,45 90,42 108,58 126,40 144,58 162,40 180,58 195,40"
        stroke="#fb923c" strokeWidth="2"/>
      {/* window bracket */}
      <line x1="90"  y1="83" x2="195" y2="83" stroke="#6366f1" strokeWidth="1.5"/>
      <line x1="90"  y1="80" x2="90"  y2="86" stroke="#6366f1" strokeWidth="1.5"/>
      <line x1="195" y1="80" x2="195" y2="86" stroke="#6366f1" strokeWidth="1.5"/>
      {/* stop line */}
      <line x1="195" y1="8" x2="195" y2="78" stroke="#f87171" strokeWidth="1.5" strokeDasharray="4,3"/>
      <text x="142" y="98" textAnchor="middle" fontSize="9" fill="#6366f1">oscillation window (last N epochs)</text>
      <text x="25"  y="17" fontSize="9" fill="#fb923c">val loss</text>
      <text x="197" y="22" fontSize="9" fill="#f87171">STOP</text>
    </svg>
  ),

  oscillation_cv: (
    <svg viewBox="0 0 240 106" className="w-full">
      <line x1="22" y1="8"  x2="22"  y2="78" stroke="#4b5563" strokeWidth="1"/>
      <line x1="22" y1="78" x2="215" y2="78" stroke="#4b5563" strokeWidth="1"/>
      {/* ±std band */}
      <rect x="22" y="28" width="193" height="38" fill="#6366f1" opacity="0.1" rx="1"/>
      <line x1="22" y1="28" x2="215" y2="28" stroke="#6366f1" strokeWidth="1" strokeDasharray="3,2" opacity="0.7"/>
      <line x1="22" y1="66" x2="215" y2="66" stroke="#6366f1" strokeWidth="1" strokeDasharray="3,2" opacity="0.7"/>
      {/* mean line */}
      <line x1="22" y1="47" x2="215" y2="47" stroke="#9ca3af" strokeWidth="1" strokeDasharray="5,3"/>
      {/* val loss: zigzag */}
      <polyline fill="none" strokeLinecap="round" strokeLinejoin="round"
        points="22,47 38,28 54,66 70,28 86,66 102,28 118,66 134,28 150,66 166,28 182,66 198,28"
        stroke="#fb923c" strokeWidth="2"/>
      <text x="148" y="44" fontSize="8" fill="#9ca3af">mean</text>
      <text x="148" y="25" fontSize="8" fill="#6366f1">+std</text>
      <text x="148" y="73" fontSize="8" fill="#6366f1">-std</text>
      <text x="110" y="98" textAnchor="middle" fontSize="9" fill="#9ca3af">CV = std ÷ mean — high CV triggers stop</text>
    </svg>
  ),

  collapse_threshold: (
    <svg viewBox="0 0 240 106" className="w-full">
      <line x1="22" y1="8"  x2="22"  y2="78" stroke="#4b5563" strokeWidth="1"/>
      <line x1="22" y1="78" x2="215" y2="78" stroke="#4b5563" strokeWidth="1"/>
      {/* val loss: plunges toward threshold */}
      <polyline fill="none" strokeLinecap="round" strokeLinejoin="round"
        points="22,12 48,22 74,35 100,49 126,60 148,68 165,72 175,74"
        stroke="#fb923c" strokeWidth="2"/>
      {/* threshold line */}
      <line x1="22" y1="75" x2="215" y2="75" stroke="#f87171" strokeWidth="1.5" strokeDasharray="5,3"/>
      {/* stop line */}
      <line x1="175" y1="8" x2="175" y2="78" stroke="#f87171" strokeWidth="1.5" strokeDasharray="4,3"/>
      <text x="178" y="70" fontSize="9" fill="#f87171">threshold</text>
      <text x="178" y="22" fontSize="9" fill="#f87171">STOP</text>
      <text x="25"  y="17" fontSize="9" fill="#fb923c">val loss</text>
      <text x="22"  y="97" fontSize="8" fill="#9ca3af">loss ≈ 0 → model outputs near-zero for every input</text>
    </svg>
  ),
};

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
    svg: GUARD_SVG.patience,
  },
  guard_min_delta: {
    label: "Guard Min Delta",
    what: "Minimum reduction in val loss that counts as meaningful improvement. Changes smaller than this are treated as flat for plateau detection.",
    values: "0.000001–0.001. Typical: 0.00001. A larger value makes the guard less sensitive to small improvements.",
    affects: "Train page plateau detection. Rarely needs tuning.",
    svg: GUARD_SVG.min_delta,
  },
  guard_overfit_ratio: {
    label: "Guard Overfit Ratio",
    what: "Maximum allowed ratio of val_loss ÷ train_loss. When the gap between the two loss curves grows beyond this multiple, the guard stops training.",
    values: "1.5–20. Typical: 10 (standard). Lower values stop sooner when curves diverge; 2.5 is too strict for early epochs when the ratio naturally spikes.",
    affects: "Train page — visible as the gap between the blue train and orange val loss lines. Stop reason will show 'Overfitting at epoch N (val/train=X.XX)'.",
    svg: GUARD_SVG.overfit_ratio,
  },
  guard_explosion_factor: {
    label: "Guard Explosion Factor",
    what: "If val loss increases by more than this multiple compared to the previous epoch, training stops immediately. Catches runaway loss spikes.",
    values: "2–100. Typical: 10. Rarely triggers with normal LR values. Reduce if you see sudden enormous loss jumps.",
    affects: "Train page — protects against a sharp vertical spike on the val loss line caused by a bad batch or too-high LR.",
    svg: GUARD_SVG.explosion_factor,
  },
  guard_oscillation_window: {
    label: "Guard Oscillation Window",
    what: "Number of recent epochs used to measure val loss variability. The guard computes CV (std ÷ mean) over this window.",
    values: "3–30. Typical: 5 (quick test), 10–20 (standard). Wider windows require more sustained oscillation before stopping.",
    affects: "Train page — the oscillation check looks at the last N points on the val loss line. Too narrow and it fires during steep descent.",
    svg: GUARD_SVG.oscillation_window,
  },
  guard_oscillation_cv: {
    label: "Guard Oscillation CV",
    what: "Maximum coefficient of variation (std ÷ mean) of recent val losses before triggering an oscillation stop. CV measures how much the values bounce relative to their average.",
    values: "0.1–1.0. Typical: 0.6–0.7 (standard). 0.4 is too strict — it fires during steep descent when values legitimately change a lot. Lower = stricter.",
    affects: "Train page — a high CV is visible as a jagged, back-and-forth val loss line. Stop reason shows 'Oscillating at epoch N (CV=X.XX)'.",
    svg: GUARD_SVG.oscillation_cv,
  },
  guard_collapse_threshold: {
    label: "Guard Collapse Threshold",
    what: "If val loss drops below this value the model has likely collapsed — outputting near-zero reconstructions regardless of input.",
    values: "0.0000001–0.001. Typical: 0.000001 (1e-6). Rarely triggered in normal training.",
    affects: "Train page — would appear as the val loss line hitting zero on the chart. Effectively a sanity check.",
    svg: GUARD_SVG.collapse_threshold,
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

// ── Scheduler descriptions ─────────────────────────────────────────────────────

const SCHEDULER_DESC = {
  none: {
    title: "Fixed LR",
    desc: "The learning rate stays constant for every epoch. Simple and predictable — a good baseline until you understand your loss curves.",
    svg: (
      <svg viewBox="0 0 220 60" className="w-full">
        <line x1="18" y1="8" x2="18" y2="52" stroke="#4b5563" strokeWidth="1"/>
        <line x1="18" y1="52" x2="208" y2="52" stroke="#4b5563" strokeWidth="1"/>
        <line x1="18" y1="28" x2="200" y2="28" stroke="#4ade80" strokeWidth="2" strokeLinecap="round"/>
        <text x="20" y="8" fontSize="8" fill="#4b5563">LR</text>
        <text x="100" y="48" textAnchor="middle" fontSize="8" fill="#4b5563">epochs →</text>
      </svg>
    ),
  },
  plateau: {
    title: "ReduceLROnPlateau",
    desc: "Monitors val loss and multiplies the LR by a factor whenever no improvement is seen for N epochs. Reactive — fires only when training stalls.",
    svg: (
      <svg viewBox="0 0 220 60" className="w-full">
        <line x1="18" y1="8" x2="18" y2="52" stroke="#4b5563" strokeWidth="1"/>
        <line x1="18" y1="52" x2="208" y2="52" stroke="#4b5563" strokeWidth="1"/>
        <polyline fill="none" strokeLinecap="round" strokeLinejoin="round"
          points="18,18 75,18 75,28 120,28 120,36 160,36 160,42 200,42"
          stroke="#4ade80" strokeWidth="2"/>
        <text x="20" y="8" fontSize="8" fill="#4b5563">LR</text>
        <text x="100" y="48" textAnchor="middle" fontSize="8" fill="#4b5563">epochs →</text>
      </svg>
    ),
  },
  step: {
    title: "Step Decay",
    desc: "Multiplies the LR by gamma every step_size epochs on a fixed schedule, regardless of val loss. Predictable staircase drops.",
    svg: (
      <svg viewBox="0 0 220 60" className="w-full">
        <line x1="18" y1="8" x2="18" y2="52" stroke="#4b5563" strokeWidth="1"/>
        <line x1="18" y1="52" x2="208" y2="52" stroke="#4b5563" strokeWidth="1"/>
        <polyline fill="none" strokeLinecap="round" strokeLinejoin="round"
          points="18,18 68,18 68,27 118,27 118,36 168,36 168,43 200,43"
          stroke="#4ade80" strokeWidth="2"/>
        <line x1="68"  y1="50" x2="68"  y2="52" stroke="#4b5563" strokeWidth="1"/>
        <line x1="118" y1="50" x2="118" y2="52" stroke="#4b5563" strokeWidth="1"/>
        <line x1="168" y1="50" x2="168" y2="52" stroke="#4b5563" strokeWidth="1"/>
        <text x="20" y="8" fontSize="8" fill="#4b5563">LR</text>
        <text x="100" y="48" textAnchor="middle" fontSize="8" fill="#4b5563">epochs →</text>
      </svg>
    ),
  },
  multistep: {
    title: "Multi-Step",
    desc: "Same as Step Decay but drops fire at specific epoch milestones you choose (e.g. 20, 40, 60), giving fine control over when each reduction happens.",
    svg: (
      <svg viewBox="0 0 220 60" className="w-full">
        <line x1="18" y1="8" x2="18" y2="52" stroke="#4b5563" strokeWidth="1"/>
        <line x1="18" y1="52" x2="208" y2="52" stroke="#4b5563" strokeWidth="1"/>
        <polyline fill="none" strokeLinecap="round" strokeLinejoin="round"
          points="18,18 58,18 58,27 98,27 98,36 158,36 158,43 200,43"
          stroke="#4ade80" strokeWidth="2"/>
        <line x1="58"  y1="50" x2="58"  y2="52" stroke="#6366f1" strokeWidth="1.5"/>
        <line x1="98"  y1="50" x2="98"  y2="52" stroke="#6366f1" strokeWidth="1.5"/>
        <line x1="158" y1="50" x2="158" y2="52" stroke="#6366f1" strokeWidth="1.5"/>
        <text x="52"  y="58" fontSize="7" fill="#6366f1" textAnchor="middle">20</text>
        <text x="98"  y="58" fontSize="7" fill="#6366f1" textAnchor="middle">40</text>
        <text x="158" y="58" fontSize="7" fill="#6366f1" textAnchor="middle">60</text>
        <text x="20" y="8" fontSize="8" fill="#4b5563">LR</text>
      </svg>
    ),
  },
  cosine: {
    title: "Cosine Annealing",
    desc: "Smoothly decays the LR along a cosine curve from the initial LR down to eta_min over T_max epochs. No sudden drops — the LR glides gradually toward zero.",
    svg: (
      <svg viewBox="0 0 220 60" className="w-full">
        <line x1="18" y1="8" x2="18" y2="52" stroke="#4b5563" strokeWidth="1"/>
        <line x1="18" y1="52" x2="208" y2="52" stroke="#4b5563" strokeWidth="1"/>
        {/* cosine curve: y = 18 + 24*(1 - cos(pi*t)) / 2  where t goes 0→1 across x=18→200 */}
        <path fill="none" strokeLinecap="round"
          d="M18,18 C60,18 80,22 109,36 C138,48 160,48 200,48"
          stroke="#4ade80" strokeWidth="2"/>
        <text x="20" y="8" fontSize="8" fill="#4b5563">LR</text>
        <text x="100" y="48" textAnchor="middle" fontSize="8" fill="#4b5563">epochs →</text>
      </svg>
    ),
  },
  exponential: {
    title: "Exponential Decay",
    desc: "Multiplies the LR by gamma every epoch, producing a smooth continuous exponential decay. Simple and aggressive — good when you want steady, uninterrupted reduction.",
    svg: (
      <svg viewBox="0 0 220 60" className="w-full">
        <line x1="18" y1="8" x2="18" y2="52" stroke="#4b5563" strokeWidth="1"/>
        <line x1="18" y1="52" x2="208" y2="52" stroke="#4b5563" strokeWidth="1"/>
        <path fill="none" strokeLinecap="round"
          d="M18,18 C40,18 60,22 90,32 C120,40 160,46 200,48"
          stroke="#4ade80" strokeWidth="2"/>
        <text x="20" y="8" fontSize="8" fill="#4b5563">LR</text>
        <text x="100" y="48" textAnchor="middle" fontSize="8" fill="#4b5563">epochs →</text>
      </svg>
    ),
  },
  warmup: {
    title: "Linear Warmup",
    desc: "Ramps the LR linearly from a small fraction up to the full value over warmup_epochs, then holds steady. Prevents instability in early epochs before the model stabilises.",
    svg: (
      <svg viewBox="0 0 220 60" className="w-full">
        <line x1="18" y1="8" x2="18" y2="52" stroke="#4b5563" strokeWidth="1"/>
        <line x1="18" y1="52" x2="208" y2="52" stroke="#4b5563" strokeWidth="1"/>
        <polyline fill="none" strokeLinecap="round" strokeLinejoin="round"
          points="18,46 80,18 200,18"
          stroke="#4ade80" strokeWidth="2"/>
        <line x1="80" y1="16" x2="80" y2="52" stroke="#6366f1" strokeWidth="1" strokeDasharray="3,2"/>
        <text x="82" y="30" fontSize="8" fill="#6366f1">warmup done</text>
        <text x="20" y="8" fontSize="8" fill="#4b5563">LR</text>
        <text x="100" y="48" textAnchor="middle" fontSize="8" fill="#4b5563">epochs →</text>
      </svg>
    ),
  },
  cyclic: {
    title: "Cyclic LR",
    desc: "Oscillates the LR between base_lr and max_lr on repeated cycles. The oscillation can help escape shallow local minima and explore the loss landscape more broadly.",
    svg: (
      <svg viewBox="0 0 220 60" className="w-full">
        <line x1="18" y1="8" x2="18" y2="52" stroke="#4b5563" strokeWidth="1"/>
        <line x1="18" y1="52" x2="208" y2="52" stroke="#4b5563" strokeWidth="1"/>
        <line x1="18" y1="18" x2="208" y2="18" stroke="#4b5563" strokeWidth="1" strokeDasharray="3,3" opacity="0.5"/>
        <line x1="18" y1="44" x2="208" y2="44" stroke="#4b5563" strokeWidth="1" strokeDasharray="3,3" opacity="0.5"/>
        <polyline fill="none" strokeLinecap="round" strokeLinejoin="round"
          points="18,44 58,18 98,44 138,18 178,44 208,30"
          stroke="#4ade80" strokeWidth="2"/>
        <text x="208" y="16" fontSize="7" fill="#4b5563" textAnchor="end">max_lr</text>
        <text x="208" y="42" fontSize="7" fill="#4b5563" textAnchor="end">base_lr</text>
        <text x="20" y="8" fontSize="8" fill="#4b5563">LR</text>
        <text x="100" y="48" textAnchor="middle" fontSize="8" fill="#4b5563">epochs →</text>
      </svg>
    ),
  },
};

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

  async function handleLoggingToggle() {
    const newVal = !cfg.logging_enabled;
    setCfg(c => ({ ...c, logging_enabled: newVal }));
    try {
      await api.setLogging(newVal);
    } catch {
      setCfg(c => ({ ...c, logging_enabled: !newVal }));
    }
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
    <div className="w-full">
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
                  value={type === "number" ? numToDecimal(cfg[key]) : (cfg[key] ?? "")}
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

        {/* Scheduler description card */}
        {SCHEDULER_DESC[cfg.scheduler ?? "none"] && (() => {
          const d = SCHEDULER_DESC[cfg.scheduler ?? "none"];
          return (
            <div className="mb-4 rounded-lg border border-gray-800 bg-gray-900 px-4 py-3 flex gap-4 items-start">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-green-400 mb-1">{d.title}</p>
                <p className="text-xs text-gray-400 leading-relaxed">{d.desc}</p>
              </div>
              <div className="w-40 shrink-0">{d.svg}</div>
            </div>
          );
        })()}

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
                  value={type === "number" ? numToDecimal(cfg[key]) : (cfg[key] ?? "")}
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

      {/* ── System ── */}
      <section className="mb-6">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 border-b border-gray-800 pb-1">
          System
        </h2>
        <div className="flex items-center justify-between px-4 py-3 bg-gray-900 rounded-lg">
          <div>
            <p className="text-sm text-gray-200">File Logging</p>
            <p className="text-xs text-gray-500 mt-0.5">Write server events to logs/server.log</p>
          </div>
          <button
            onClick={handleLoggingToggle}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none
              ${cfg.logging_enabled ? "bg-indigo-600" : "bg-gray-700"}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                ${cfg.logging_enabled ? "translate-x-6" : "translate-x-1"}`}
            />
          </button>
        </div>
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

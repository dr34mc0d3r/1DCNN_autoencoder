# How to Find Hidden Patterns with the 1DCNN-A App

## Before You Start: What Is a 1D CNN and Why Does It Find Patterns?

You don't need to be a machine learning engineer to use this app effectively. But a mental model of what's happening under the hood will make every result you see feel less like magic and more like a tool you control.

### The core idea in plain English

A **1D Convolutional Neural Network (CNN) Autoencoder** is a compression machine. You feed it a short clip of market data — say, 64 one-minute bars — and it does two things:

1. **Encodes** that clip down to a tiny summary (32 numbers, called the **latent vector**). Think of it like describing a face using only 32 measurements: nose length, eye spacing, jaw angle, etc.
2. **Decodes** that summary back into the full 64-bar clip and compares it to the original. The difference between the two is the **reconstruction error (MSE)**.

The network trains by trying to minimise that reconstruction error across thousands of windows. To get good at reconstruction, it is forced to discover which shapes and rhythms repeat — because those are the things worth encoding efficiently. Shapes that are completely random are expensive to remember; shapes that repeat are cheap.

**The patterns you're looking for live inside the latent space** — the 32-number summaries. Windows that look alike have similar latent vectors. When you cluster those vectors into groups using K-Means, each group (cluster) represents a distinct recurring market behaviour. The t-SNE scatter plot on the Latent Space page makes those groups visible as clouds of dots.

### The three things the app tells you

| Output | What it means |
|---|---|
| **Low MSE** during inference | The model has seen this type of bar pattern before — it's familiar, probably a common regime |
| **High MSE** during inference | This pattern is unusual — the model struggles to reconstruct it. Could be news, earnings, a flash crash |
| **Cluster label** | Which category of market behaviour this window most resembles |

### A word on the data the model sees

The raw bar data (open, high, low, close, volume, VWAP) is automatically converted into 26 features before training:

- **Trend:** EMA-9, EMA-21, EMA-50, MACD line, signal, histogram
- **Candle shape:** body size, upper wick, lower wick, candle efficiency
- **Returns:** simple return, log return, volume return
- **Volatility:** ATR-14, rolling volatility, Bollinger width and position, volume ratio
- **Momentum:** RSI-14, Stochastic %K and %D, VWAP deviation
- **Time of day:** hour encoded as sine and cosine (so midnight and 23:00 are close together)
- **Price level:** close (normalised)

You never have to calculate any of this manually. The pipeline does it every time you download and train.

---

## The Workflow at a Glance

Every tutorial below follows the same seven-step loop. Memorise this before you start.

```
Setup → Download → Train → Windows → Latent Space → Analysis → Inference
```

Each page in the app corresponds to one step. You always go left to right. When you want to ask a different question, you change one or two settings, re-run from the affected step, and compare results.

---

## Tutorial 1: Finding the Intraday Rhythm of a Liquid Stock

**Question:** Does TSLA have a repeating intraday shape — like a surge at open, a lull at midday, and a close run-up?

**Why 1D CNN for this?** You could look at charts yourself, but the CNN will find the rhythm mathematically across thousands of days simultaneously, without you having to define what "surge" means in advance.

---

### Step 1 — Setup → Config

Open the app at `http://localhost:5173`. Click **Setup** in the nav bar.

Set these values and click **Save Config**:

| Field | Value | Why |
|---|---|---|
| Symbol | `TSLA` | High volume, strong intraday personality |
| Timeframe | `5Min` | Fine enough to see structure; coarse enough to avoid noise |
| Start Date | `2024-01-01` | One full year of data |
| End Date | `2024-12-31` | |
| Window Size | `78` | 78 × 5-minute bars = ~6.5 hours, one full trading session |
| Latent Dim | `32` | Default — good starting point |
| Epochs | `40` | Enough time to learn intraday rhythms |
| n_clusters | `6` | A conservative guess; you'll tune this in Step 5 |
| Scheduler | `plateau` | Automatically slows the learning rate when progress stalls |

**What to expect after saving:** The config panel shows a green confirmation and all fields reflect the values you entered. If any field turns red, check for typos (dates must be `YYYY-MM-DD`).

---

### Step 2 — Setup → Download

Scroll down to the **Download** section.

Fill in: Symbol = `TSLA`, Timeframe = `5Min`, Start = `2024-01-01`, End = `2024-12-31`.

Click **Start Download** and watch the progress bar.

**What to expect:**
- A 5-minute bar for every trading minute in a year produces roughly 19,500 rows (390 bars/day × ~252 trading days, minus early closes and halts).
- The progress bar increments in batches. Download takes 30–90 seconds depending on your connection.
- When complete, the **Available Downloads** table gains a row: `TSLA / 5Min / 2024-01-01 → 2024-12-31 / ~19,500 rows`.

**Validation:** If the row count is below 15,000, the Alpaca data feed may have gaps. This is normal for 2024. Proceed — the model handles sparse data gracefully.

---

### Step 3 — Train → Data Preview

Click **Train** in the nav bar. Expand the **Training Data Preview** section.

**What to expect:**
- Total bars: ~19,500
- Total windows: somewhere between 200 and 19,500 depending on window stride (the pipeline uses stride 1, so total windows ≈ total bars − window_size = ~19,422)
- Train windows: ~80% (~15,500)
- Test windows: ~20% (~3,900)
- The first 20 rows of the training table should show normalised values roughly between −3 and +3 (RobustScaler centres and scales but doesn't hard-clip).

If you see all zeros or extreme values (> 100), something went wrong with the download. Delete the CSV and re-download.

---

### Step 4 — Train

Type a name in the **Model Name** field (e.g. `tsla_5min_intraday`). Click **Start Training**.

Watch the **loss curve** as it updates every epoch. You're looking for:

- **Train loss falling** — the model is learning
- **Val loss tracking train loss** — no overfitting (both lines moving together is good)
- **A gap opening** where val loss stops falling but train loss keeps dropping — overfitting; the TrainingGuard will stop training automatically

**What to expect on a clean run:**
- First 5–10 epochs: both losses drop quickly from ~0.4–0.8 down toward ~0.05–0.15
- Epochs 10–30: slower, steadier decline
- TrainingGuard stops training somewhere between epoch 15 and 40 with reason `plateau` or `patience`
- Final val loss around 0.02–0.08 is a good result for 5-minute data

**If the loss explodes** (shoots up instead of down): go back to Config, halve the learning rate (`lr: 0.0005`), and retrain.

**If training stops immediately** at epoch 1 or 2: the `guard_collapse_threshold` may have triggered. This means the loss went to near-zero too fast, which usually means the dataset is too small or window size is larger than the data length. Check your date range.

---

### Step 5 — Latent Space

Click **Latent Space**. Click **Extract + Cluster**.

This takes 20–60 seconds. The app encodes every training window into its 32-number latent vector, runs K-Means to assign each one a cluster label, then uses t-SNE to project those 32 dimensions down to 2D so you can see them.

**What to expect on the scatter plot:**
- 6 coloured clouds of dots (one per cluster)
- Some clouds tightly packed, some loose — tight clouds = highly consistent behaviour, loose = more varied
- Centroid markers (white cross, coloured outline) at the centre of each cloud

**Now run Cluster Quality.** Click the **Cluster Quality** button. A second chart appears showing Silhouette, Davies-Bouldin, and Calinski-Harabasz scores for K=2 through 16.

**How to read this:**
- **Silhouette** (higher is better, range −1 to 1): Look for a peak. A value above 0.3 means the clusters are genuinely separable. A peak at K=5 means 5 clusters probably fits better than your initial guess of 6.
- **Davies-Bouldin** (lower is better): Look for a trough at the same K as the Silhouette peak.
- If Silhouette peaks at K=5 and Davies-Bouldin troughs at K=5, go back to Config, set `n_clusters = 5`, and re-run Extract + Cluster.

**Validation for intraday rhythm:**
Look at cluster sizes. If the intraday rhythm hypothesis is correct, you'd expect clusters that differ in size — some small (rare market states) and one or two large ones (the "ordinary" sessions that fill most of the year). An even distribution across all 6 clusters would mean the model found 6 equally common behaviours, which is also interesting but different from a simple rhythm story.

---

### Step 6 — Analysis: Hour-of-Day Heatmap

Click **Analysis**. Run the **Hour-of-Day Heatmap**.

The heatmap is a grid: rows are your clusters, columns are market hours (9 AM to 4 PM). Bright cells mean that cluster appears frequently at that hour.

**What to expect if an intraday rhythm exists:**
- Cluster A lights up in column 9–10 AM (open surge)
- Cluster B lights up in column 12–1 PM (midday drift)
- Cluster C lights up in column 3–4 PM (close run-up)
- Some cluster lights up uniformly (no time preference — this is the "steady state" cluster)

If most clusters are uniformly bright across all hours, the model did not find strong time-of-day structure. That's a real finding too: it means TSLA's intraday shape is not consistent enough across the year to form stable clusters at specific times.

---

### Step 7 — Live Inference: Watch the Rhythm in Real-Time

Click **Live Inference**. Set:
- Symbol: `TSLA`
- Timeframe: `5Min`
- Date range: any week in early 2024 (e.g. `2024-03-04` to `2024-03-08`)

Click **Start**.

Watch the **Cluster History strip** at the bottom. If the intraday rhythm is real, you'll see the strip shift colour around 9:30 AM, again around 11:30–12:00, and again near 3:30 PM each day.

**Validation:** Open the **MSE Timeline** panel. High MSE spikes at market open are normal (the open is often the most volatile and unusual moment of the day). If you see a spike at 9:30 every day, the model is correctly identifying the open as less "normal" than the rest of the session.

---

## Tutorial 2: Catching Anomalies — Earnings Days and News Spikes

**Question:** Can the model flag days when something unusual happened — even if you don't tell it what day that was?

**Why this works:** The autoencoder learns "normal." When the market behaves in a way it hasn't seen before, reconstruction error (MSE) spikes. You don't need to label the anomalies in advance.

---

### Step 1 — Setup → Config

Use the same TSLA 5Min dataset from Tutorial 1, but change the training date range to **exclude** a known earnings quarter, so the model has no idea what an earnings reaction looks like. Then run inference **over** the earnings period.

Set:
- Start Date: `2024-01-01`
- End Date: `2024-07-15` (avoids the Q2 earnings call around July 23, 2024)
- Window Size: `78`
- Epochs: `40`
- Scheduler: `plateau`

Train a new model: call it `tsla_pre_earnings`.

**What the model will learn:** Normal TSLA behaviour from January through mid-July 2024. It will encode that behaviour into 32 latent dimensions. Earnings day patterns — gap opens, extreme volume, sustained one-directional moves — will be outside its training distribution.

---

### Steps 2–4 — Download, Preview, Train

Follow the same steps as Tutorial 1. Your loss curve should look similar. The model is learning from a slightly shorter dataset so it may converge faster.

---

### Step 5 — Live Inference Over Earnings

Click **Live Inference**. Set:
- Symbol: `TSLA`
- Timeframe: `5Min`
- Date range: `2024-07-22` to `2024-07-26` (the week of Q2 2024 earnings)

Click **Start** and watch the **MSE Timeline**.

**What to expect:**
- Most of July 22 (Monday, pre-earnings): MSE low and flat — the model recognises normal TSLA trading
- July 23 (Tuesday) after 4 PM (when earnings are released after-hours) or July 24 (Wednesday) at market open: **MSE spikes sharply**. The reaction pattern — giant gap, extreme volume — is unlike anything in the training set
- MSE stays elevated for several bars as the market absorbs the news, then slowly returns toward normal as the initial shock fades

**Validation threshold:** The MSE Timeline shows a horizontal red line at the **p95 threshold** — the 95th percentile reconstruction error from the training set. Everything above that line is in the top 5% of "weirdness." An earnings reaction should sit well above it.

**If the spike doesn't appear:** TSLA's Q2 2024 reaction was modest (it rallied, but not violently). Try the same experiment with Q3 2024 earnings (October 23, 2024) instead, which had a sharper gap.

---

### Step 6 — Cross-Validate with Cluster Labels

Alongside the MSE spike, watch the **Cluster History strip**. On earnings day you should see:
- The strip jump to a cluster that barely appeared during normal days (a minority cluster — one of the small clouds in your t-SNE scatter)
- The cluster label staying unusual for 30–60 bars before reverting

This cross-validates the MSE spike: it's not just "high error" in isolation — the model is placing the earnings windows into an entirely different region of latent space.

---

### Step 7 — Systematic Anomaly Map

For a fuller picture, run inference over the **entire year** (`2024-01-01` to `2024-12-31`). This takes longer but produces a complete MSE timeline. Every spike above the p95 line marks a candidate event. Cross-reference those dates with a news calendar. You'll often find:

- FOMC announcement days (the Fed rate decision)
- Major index rebalancing days
- Macro data releases (CPI, jobs report) that moved TSLA

The model doesn't know what any of these events are. It only knows the bar data felt unusual.

---

## Tutorial 3: Discovering Volatility Regimes

**Question:** Does the market alternate between distinct volatility regimes — quiet accumulation vs explosive expansion — and can we label those periods automatically?

**Why this matters practically:** Volatility regimes affect how you size positions, which strategies work, and how much to trust short-term signals. A model that can classify the current regime in real-time is genuinely useful.

---

### Step 1 — Setup → Config

This experiment works best on a longer timeframe so one window covers a meaningful period.

| Field | Value | Why |
|---|---|---|
| Symbol | `SPY` | The S&P 500 ETF — the most studied equity instrument |
| Timeframe | `1Hour` | Between 1Min and 1Day; captures multi-hour regime shifts |
| Start Date | `2022-01-01` | Includes the 2022 bear market (high vol) and 2023–2024 bull (low vol) |
| End Date | `2024-12-31` | Three full years |
| Window Size | `48` | 48 × 1-hour bars ≈ 12 trading days (two weeks) |
| Latent Dim | `16` | Smaller bottleneck — forces the model to focus on coarser structure |
| Epochs | `50` | Longer dataset needs more time |
| n_clusters | `4` | Hypothesis: roughly four regimes — low vol bull, high vol bull, low vol bear, high vol bear |
| Scheduler | `cosine` | Cosine annealing works well for longer training runs |

---

### Steps 2–4 — Download, Preview, Train

Download SPY 1Hour data. The dataset will be approximately 19,000 bars (6.5 hours/day × 252 days × 3 years).

In the Data Preview, verify that `total windows` is at least 5,000. If it's below that, widen your date range.

During training, watch the loss curve carefully. With `latent_dim = 16` (smaller than default), the model has less capacity to memorise individual windows and must generalise more. This typically means:
- Higher final val loss than a default-dim run (~0.08–0.15 instead of 0.02–0.08)
- But the clusters will be coarser and more interpretable

That's the trade-off: **smaller latent dim → more compression → coarser but cleaner clusters**.

---

### Step 5 — Latent Space

Click **Extract + Cluster**. You're looking for well-separated clouds. Run Cluster Quality.

**Expected shape of the scatter plot for a volatility regime model:**
- Two or three large dense clouds (the "normal" regimes that fill most of the year)
- One or two smaller, looser clouds (the "transition" periods between regimes)
- Not all clouds should be the same size — regimes don't last equal amounts of time

If the quality metrics peak at K=3 instead of 4, go back and change `n_clusters = 3`. Three regimes is a perfectly reasonable finding.

---

### Step 6 — Analysis: Day-of-Week Distribution

Run the **Day-of-Week Distribution** panel under Analysis.

**What to expect for volatility regimes:**
- The high-volatility clusters should distribute fairly evenly across Mon–Fri (volatility shocks don't have a strong day preference)
- But the low-volatility accumulation clusters may skew toward mid-week (Tuesday–Thursday) because Mondays and Fridays often have more directional bias

This is a secondary signal — don't over-interpret it. Use it to add texture to your hypothesis, not to make trading decisions.

---

### Step 7 — Live Inference: Watch a Regime Transition

Run inference over the period `2022-09-01` to `2022-12-31` (the end of the 2022 bear market, leading into the early 2023 recovery).

**What to expect on the Cluster History strip:**
- One cluster (the bear/high-vol regime) dominates September–October 2022
- Around mid-November to December 2022, the strip shifts colour, spending more time in a different cluster
- This is the regime transition — the model detects it in real-time from the bar data alone

The shift won't be clean. Regime transitions are messy. You'll see the strip alternate between old and new cluster colours for several days before the new one dominates. That's exactly right — transitions are noisy in real markets too.

---

## Tutorial 4: Cross-Symbol Pattern Transfer — Does What Happens in NVDA Show Up in AMD?

**Question:** Train a model on NVDA. Can it classify AMD windows meaningfully — even though it has never seen AMD data?

**Why this is powerful:** If two stocks share structural patterns (correlated sector behaviour, similar volatility regimes, sympathetic moves), a model trained on one may generalise to the other. This tells you something about the relationship between the two stocks that correlation coefficients alone can't capture.

---

### Step 1 — Train a Model on NVDA

Use the following config:

| Field | Value |
|---|---|
| Symbol | `NVDA` |
| Timeframe | `15Min` |
| Start Date | `2023-01-01` |
| End Date | `2024-06-30` |
| Window Size | `26` | (~one full trading day at 15Min) |
| Latent Dim | `32` | |
| Epochs | `30` | |
| n_clusters | `6` | |

Train and name the model `nvda_15min_base`.

---

### Step 2 — Inspect NVDA Clusters

Run Extract + Cluster. Look at the t-SNE scatter and run the Hour-of-Day heatmap.

Make a note of what each cluster seems to represent. With 15-minute data and a 26-bar window (one trading day), each cluster likely represents a day-type:
- Strong trending up day
- Strong trending down day
- Gap-up fade (opens high, gives it back)
- Gap-down recover (opens low, bounces)
- Choppy/low-vol day
- High-vol reversal day

You won't know the labels yet — you have to infer them from the heatmap (time-of-day distribution) and from the Windows page (visual inspection).

---

### Step 3 — Windows Page: Visually Inspect Clusters

Click **Windows**. Set count to `500`. Switch to **Thumbnail Grid** view.

Each tile in the grid is one training window (one trading day of 15-minute bars). The 26 columns represent time across the trading day; the 14 rows represent the technical indicator features. Bright means high value; dark means low value.

**What to look for:**
- Tiles that look uniformly light in the top rows (EMA features) and dark in the bottom rows (RSI, Stochastic) represent strong uptrend days — everything is elevated
- Tiles with a bright stripe down the left side and darkening to the right = gap-up fade
- Tiles with high contrast from top to bottom and scattered bright patches = high-vol reversal day

At this stage you're building intuition. You don't need to formally label each cluster — you're learning the visual language of the latent space.

---

### Step 4 — Run Live Inference on AMD

Click **Live Inference**. Change the **Symbol** field to `AMD` (keep everything else the same — timeframe, date range, the active model is still `nvda_15min_base`).

Set date range: `2023-01-01` to `2023-06-30`.

Click **Start**.

**What to expect — three possible outcomes:**

**Outcome A — Strong generalisation (good):**
MSE stays low and the cluster labels assigned to AMD windows look similar to the clusters NVDA used during the same calendar period. This means NVDA and AMD share day-type patterns. The model learned something real about semiconductor stock behaviour in general, not just NVDA-specific noise.

**Outcome B — Moderate generalisation:**
MSE is slightly higher than it was for NVDA inference, but not consistently above p95. Clusters are assigned but may not match the NVDA calendar. This means partial transfer — the model finds AMD recognisable but different in detail.

**Outcome C — Poor generalisation (also valuable):**
MSE is chronically above p95 for AMD. The model finds AMD fundamentally different from NVDA. This is a genuine finding: despite being in the same sector, AMD and NVDA had structurally different bar patterns during this period. (This could happen during periods where one was caught in idiosyncratic news — a product launch, an acquisition, a short squeeze.)

---

### Step 5 — Validate with a Known Correlation Period

AMD and NVDA are known to move together during broad AI/semiconductor sell-offs. Find a major sector drawdown in your data range (e.g., the tech sell-off in late 2023 around October–November).

Run inference on both symbols over that specific period. If the model generalises:
- AMD and NVDA windows during the sell-off should both be assigned to the same "high-vol down day" cluster
- Both should show elevated MSE on the worst days of the drawdown

If they don't align, you've found evidence that NVDA and AMD responded differently to that particular event — useful information for pairs trading or hedging research.

---

## Tutorial 5: Finding the "Golden Hour" — When Does the Model's Favourite Pattern Appear?

**Question:** Every model learns a cluster that represents the market state it found most compressible — the most internally consistent, repeating pattern. When does that "ideal" pattern actually occur?

**Why this is useful:** If a cluster represents a clean, directional pattern (say: a sustained, orderly uptrend with expanding volume), knowing *when* it appears most frequently is a tradeable signal. This tutorial is about finding and studying that cluster.

---

### Step 1 — Train a High-Resolution Intraday Model

| Field | Value |
|---|---|
| Symbol | `QQQ` | The NASDAQ-100 ETF — clean, liquid, strong personality |
| Timeframe | `1Min` | Maximum resolution |
| Start Date | `2024-01-01` |
| End Date | `2024-06-30` |
| Window Size | `30` | 30 minutes — half an hour of 1-minute bars |
| Latent Dim | `24` | Slightly smaller than default to sharpen clusters |
| Epochs | `25` | 1-minute data is plentiful; the model converges quickly |
| n_clusters | `8` | More clusters at fine resolution |

Train and name the model `qqq_1min_intraday`.

The download will be large: 390 bars/day × 125 trading days = ~48,750 bars. This may take 2–3 minutes.

---

### Step 2 — Latent Space and Cluster Quality

Run Extract + Cluster. At K=8, you'll likely see some clusters that are large (representing common bar patterns like mild drift) and a few tiny ones (representing rare states).

Run Cluster Quality. With 1-minute data and 30-bar windows, the quality scores may peak at K=5 or K=6. If so, retrain K-Means by going to Config → change `n_clusters` → click Extract + Cluster again (you don't need to retrain the neural model — just re-cluster the existing latent vectors).

---

### Step 3 — Analysis: Hour-of-Day Heatmap and Cluster Frequency

Run both the **Hour-of-Day Heatmap** and the **Cluster Frequency by Hour** panels.

At 1-minute resolution with 30-bar windows, you now have approximately:
- 13 non-overlapping windows per trading session (390 min ÷ 30 bars)
- ~1,600 total days worth of windows

The heatmap and frequency bars will be much more detailed than the 5-minute experiments. You should see very clear time-of-day patterns.

**What to look for:**

Look for a cluster that:
1. Appears almost exclusively in a 1–2 hour window during the trading day (highly time-concentrated)
2. Is one of the larger clusters (it happens often at that time)
3. Has low average reconstruction error during inference (the model finds it very familiar)

This is your "golden hour" cluster — a pattern so consistent that it happens at a predictable time, day after day.

**Common findings with QQQ 1-minute data:**
- A high-frequency cluster between 9:30–10:00 AM (the open surge — large moves, high volume, directional)
- A low-frequency cluster between 12:00–12:30 PM (the midday flatline — minimal movement, very low volatility)
- A medium-frequency cluster between 3:30–4:00 PM (the close push — accelerating momentum into the bell)

---

### Step 4 — Windows Page: Identify the Visual Signature

Go to the **Windows** page and set the count to `1000`. Switch to **Contact Sheet** view.

In Contact Sheet mode, every window is laid out side by side. Look for a recognisable visual texture that repeats. Some you'll learn to recognise quickly:
- A uniform grey horizontal band across all rows: low volatility, everything compressed — this is the midday lull
- A strong diagonal from dark to bright across the time axis: steady directional move — this is the trending cluster
- Alternating bright/dark vertical stripes: choppy, reversing every few bars — this is the chop cluster

You are essentially reading the neural network's vocabulary. Each visual texture is a word in the market's language that the model has learned.

---

### Step 5 — Live Inference: Verify the Golden Hour in Real-Time

Run inference over a recent week: `2024-06-17` to `2024-06-21`.

Set the symbol and timeframe to match your model (`QQQ`, `1Min`).

Watch the **Cluster History strip** through a full trading day. The strip should:
- Show a burst of the "open" cluster colour at 9:30 AM
- Settle into the "normal drift" cluster colour by 10:30 AM
- Shift to the "midday lull" cluster colour around 12:00–1:00 PM
- Return to directional cluster colours after 2:30 PM
- Spike to the "close" cluster in the last 30 minutes

**Validation:** Open the **MSE Timeline** alongside the Cluster History. MSE spikes at the open and close (the unusual extremes) and flattens at midday (the model finds midday QQQ very predictable). If these two panels tell the same story — high MSE at open/close, low MSE at noon, matching cluster transitions — you have a validated finding.

**What to do with this information:** You now know that the model's "predictability score" (inverse of MSE) varies systematically through the day. Trading systems that rely on this model's cluster assignments should weight signals differently by time of day. An open-hour cluster assignment is noisier than a mid-session one.

---

## Going Deeper: What to Try Next

### Experiment with the latent dimension

The `latent_dim` parameter is the single biggest lever for controlling what the model pays attention to:

| Latent Dim | Effect | Best for |
|---|---|---|
| 8 | Very coarse — forces dramatic compression | Finding broad regime types (bull/bear/chop) |
| 16–24 | Medium — good balance of detail and generality | Intraday session types, volatility regimes |
| 32 (default) | Standard — captures moderate detail | General-purpose pattern finding |
| 64+ | Fine-grained — can memorise individual events | Anomaly detection where every spike matters |

Run the same dataset with `latent_dim = 8` and `latent_dim = 64` and compare the t-SNE plots. Smaller dim = fewer, fatter clouds. Larger dim = more, tighter clouds, but some may be artefacts of the training data rather than real patterns.

### Stack multiple timeframes

Train a model on 1-minute data. Train another on 1-hour data. Run inference on the same date range with both. A window that shows up as "anomalous" in both timeframes simultaneously (high MSE at 1-minute AND the corresponding 1-hour window also spikes) is a multi-scale anomaly — something unusual is happening at both the micro and macro level at the same time. These are often the highest-quality signals.

### Try a different stock universe

The same model architecture that finds patterns in stocks also works on:
- **ETFs:** `GLD` (gold), `TLT` (bonds), `VXX` (volatility) — each has a distinct bar personality
- **Index ETFs:** Compare `SPY` vs `IWM` (small caps) — different volatility regimes at different market phases
- **Sector ETFs:** `XLK` (tech) vs `XLE` (energy) — almost entirely uncorrelated regime structure

Every new symbol is a new dataset. You don't have to build a new app. Just download the data and train.

### Use the Reconstruction Comparison to understand what the model "cares about"

The **Reconstruction Comparison** panel in Analysis shows you, per feature, how well the model reconstructs each of the 26 input features. Features with **low reconstruction error** are things the model handles well — probably because they're smooth, predictable, or highly correlated with other features. Features with **high reconstruction error** are things the model finds hard — either because they're noisy, or because they carry information that doesn't compress well.

If `rsi_14` always has high reconstruction error, the model is effectively ignoring RSI in its latent representation. If `ema_9` has low error, the model is using trend information heavily.

This is a diagnostic, not a problem. It tells you which features drive the clusters. If you care specifically about momentum patterns, the RSI being poorly reconstructed is a signal that you need a different architecture or a different input feature set.

### Tune the TrainingGuard for your experiment

The TrainingGuard is conservative by default — it stops training early to prevent overfitting. For anomaly detection experiments, you want a model that generalises broadly (conservative guard is fine). For fine-grained cluster discrimination, you want a model that has trained a bit longer (loosen the guard):

- Raise `guard_patience` from 7 to 15
- Raise `guard_overfit_ratio` from 2.5 to 4.0
- Lower `guard_min_delta` from 1e-5 to 1e-6

Don't disable the guard entirely — it protects you from training on a model that has started fitting noise instead of structure.

---

## Reading the t-SNE Plot Like a Pro

The t-SNE scatter plot is the most information-dense output in the app. Here's a field guide:

| What you see | What it means |
|---|---|
| **Tight, round clusters far apart** | Strong, distinct patterns — the model is very confident about the difference between clusters |
| **Elongated, sausage-shaped clusters** | A gradual continuum — there's a spectrum between two states, not a hard boundary |
| **One giant cluster, several tiny ones** | The market spends most of its time in one normal state, with rare excursions to unusual states |
| **All clusters roughly equal size** | No dominant regime — the market cycles through multiple states with roughly equal frequency |
| **Many overlapping clusters** | Too many clusters for the data (reduce `n_clusters`) or the model didn't train enough (increase `epochs`) |
| **One cluster hugging the centre, others at the edges** | The centre cluster is the "average" state; the edge clusters are the extremes |

**The most important thing to remember:** t-SNE distances between clusters are not meaningful — only the shapes of the clusters and whether they're separated matter. Two clouds that look far apart in the scatter plot might not be very different in latent space. Use the Cluster Quality metrics (Silhouette, Davies-Bouldin) for that.

---

## Troubleshooting Common Issues

| Symptom | Likely cause | Fix |
|---|---|---|
| Loss curve is flat from epoch 1 | Learning rate too low | Increase `lr` to `0.005` |
| Loss spikes up after a few epochs | Learning rate too high | Halve the `lr`; try `plateau` scheduler |
| t-SNE shows one giant blob, no structure | Model underfit (too few epochs) or latent_dim too large | Increase epochs; try smaller latent_dim |
| All clusters the same size | n_clusters too high for the data | Run Cluster Quality and use the suggested K |
| MSE never goes above p95 during inference | Training data covered too many regimes; nothing is anomalous relative to it | Shorten training range to exclude the inference period |
| Download stalls or produces very few rows | Alpaca API rate limit or thin market data | Wait 60 seconds and retry; try a less exotic ticker |
| TrainingGuard stops at epoch 1–2 with "collapse" | Loss went near-zero too fast — dataset may be trivially easy or tiny | Increase window_size; add more data; lower latent_dim |
| Reconstruction comparison shows all features have equal error | Underfitting — model hasn't learned to differentiate features | Increase epochs; increase latent_dim |

---

## Vocabulary Reference

| Term | Plain-English meaning |
|---|---|
| **Window** | A short clip of sequential bars (e.g. 64 five-minute bars) that the model processes as one unit |
| **Latent vector** | The 32-number summary the encoder compresses each window into |
| **Reconstruction error (MSE)** | How different the decoded window is from the original — low = familiar, high = unusual |
| **Cluster** | A group of windows with similar latent vectors — one recurring market behaviour |
| **t-SNE** | An algorithm that squashes 32 dimensions into 2 so you can see the clusters visually |
| **K-Means** | The algorithm that draws the cluster boundaries in latent space |
| **Silhouette score** | How well-separated the clusters are (0 to 1; higher is better) |
| **Davies-Bouldin score** | How compact and separated the clusters are (lower is better) |
| **TrainingGuard** | The automatic early-stop system that prevents the model from overfitting |
| **Walk-forward inference** | Running the trained model on new data one window at a time, in time order |
| **p95 threshold** | The reconstruction error level that only 5% of training windows exceeded — everything above it is "unusual" |
| **Regime** | A sustained period when the market behaves consistently in one cluster |
| **Feature** | One of the 26 technical indicators the model sees per bar (EMA, RSI, MACD, etc.) |

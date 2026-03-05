# SimpleBench v2

SimpleBench is a static browser benchmarking tool focused on lower variance and more realistic subsystem coverage across desktop and mobile browsers.

## Benchmark Suite

SimpleBench v2 runs 7 benchmarks:

1. **DOM Manipulation**
- Mixed insert/remove/reorder list operations.
- Attribute/class toggles and text updates.
- Periodic forced layout checkpoints.
- Primary metric: `ops_per_sec`.

2. **Canvas 2D Rendering**
- Fixed-duration Canvas2D workload on a measured 800x600 surface.
- Blend of path rendering, sprite blits, and text draws.
- Primary metric: `draw_calls_per_sec`.

3. **JavaScript Compute**
- Seeded deterministic datasets.
- Sieve, sort, matrix multiply, and JSON round-trip.
- Min-duration timing loops per task.
- Primary metric: `compute_geomean`.

4. **CSS Layout Pipeline**
- Layout invalidation/reflow phase.
- Style recalculation phase.
- Compositor animation phase with JS pressure.
- Primary metric: `pipeline_score`.

5. **Worker Throughput**
- Sweep over worker counts `[1, 2, 4, max]`.
- Throughput scaling and efficiency capture.
- Primary metric: `throughput_scaling_auc`.

6. **Responsiveness Under Load**
- Event-loop lag and rAF jitter under worker + CPU burst load.
- Tracks long-task count when supported.
- Primary metric: `responsiveness_index`.

7. **WebGL GPU Rendering**
- Fixed WebGL2 rendering tiers.
- Weighted FPS and frame-time metrics.
- Uses `EXT_disjoint_timer_query_webgl2` when available, with CPU frametime fallback.
- Primary metric: `fps_tier_weighted`.

## Measurement Protocol

- Deterministic seeded randomness per benchmark run.
- Fixed measured resolution: `800x600` @ DPR 1 paths.
- Per benchmark default protocol: `1 warmup + 3 measured` samples.
- If variance is high (CV over threshold), benchmark auto-reruns one extra measured batch.
- Measurements pause/retry when tab visibility changes during sampling.
- A brief sample cooldown is applied between intra-benchmark samples to reduce thermal/frequency transients.

## Scoring

- Bench cards show:
- Normalized `index` score (calibrated baseline model).
- Raw primary metric with its true unit.
- Variability info (`CV`, sample count, unstable flags).

- Category subscores:
- `UI Pipeline`: DOM + CSS
- `Graphics`: Canvas + WebGL
- `Compute`: JS Compute + Worker Throughput
- `Responsiveness`: Responsiveness Under Load

- Composite index:
- Geometric mean of category subscores.

Calibration baselines live in `js/calibration/v2-baselines.json`.

## Baseline Calibration Workflow

Normalization is only meaningful if baselines are calibrated from real hardware.

1. Run benchmark mode on 3-5 representative devices:
- Low-end mobile
- Mid-range laptop
- High-end desktop
2. Export CSV from each device and capture each benchmark's primary raw median.
3. For each primary metric key in `v2-baselines.json`, compute geometric mean across devices.
4. Update the corresponding `baseline` values in `js/calibration/v2-baselines.json`.
5. Re-run a verification pass (5 loops per device) and confirm composite and per-benchmark CV remain within target thresholds.

## Benchmark Mode

Benchmark mode runs multiple loops, rotates benchmark order each loop, applies cooldown between tests, and exports CSV with:

- Per-loop normalized scores
- Averages
- CV and unstable run counts
- Primary raw metric samples for each run

## Running Locally

Serve over HTTP (required for Worker loading):

```bash
python3 -m http.server
```

Then open `http://localhost:8000`.

## File Layout

- `index.html` — UI and benchmark cards
- `css/style.css` — styling
- `js/bench-utils.js` — shared sampling/statistics/seeded RNG helpers
- `js/main.js` — harness, scoring, category/composite aggregation, benchmark mode, CSV export
- `js/bench-*.js` — benchmark modules
- `js/calibration/v2-baselines.json` — normalization baselines
- `workers/compute-worker.js` — worker compute task implementation

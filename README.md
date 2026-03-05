# SimpleBench

A browser performance benchmarking tool. Pure static HTML, CSS, and vanilla JavaScript — no frameworks, no build tools, no dependencies. Designed for GitHub Pages deployment.

## Benchmarks

SimpleBench runs 5 tests that stress different browser subsystems:

1. **DOM Manipulation** — 30 cycles of creating, updating, swapping, and deleting 3,000 table rows (12,000 cells per cycle). Measures DOM mutation throughput in ops/sec.

2. **Canvas 2D Rendering** — Renders 1,500 frames of 4,500 bouncing arc sprites on an 800x600 canvas in a synchronous tight loop. Measures raw Canvas2D draw throughput in frames/sec. Not tied to display refresh rate.

3. **JavaScript Compute** — Runs four CPU-intensive tasks and reports their geometric mean throughput:
   - Prime Sieve of Eratosthenes to 3,000,000 (15 iterations)
   - Array sort of 300,000 random floats (30 iterations)
   - Naive 350x350 matrix multiplication (9 iterations)
   - JSON stringify + parse of a ~50KB object (60 iterations)

4. **CSS Layout & Animation** — Two phases of synchronous layout/style work:
   - 600 forced reflows on 1,500 nested flexbox/grid elements (toggling properties + reading `offsetHeight`)
   - 1,500 style recalculations on 900 absolutely-positioned elements (transform, color, width changes + forced reflow)

5. **Async & Concurrency** — Two sub-tests combined:
   - Spawns `navigator.hardwareConcurrency` Web Workers each running a prime sieve to 1,500,000, comparing parallel wall-clock time to sequential single-threaded time (measures parallelism speedup)
   - 9-second `requestAnimationFrame` consistency test measuring frame-timing jitter (standard deviation)

## Scoring

Each benchmark produces a raw score (ops/sec, frames/sec, etc.) which is normalized against a baseline where 100 = good modern hardware. Scores are uncapped — faster hardware scores higher.

The **Composite Index** is the geometric mean of all completed benchmark scores.

## Running Locally

Serve the files with any static HTTP server (needed for Web Workers):

```
python3 -m http.server
```

Then open `http://localhost:8000`. Click **Run All** or run individual tests.

## Tech Stack

- `index.html` — Page structure
- `css/style.css` — Brutalist glitch art theme
- `js/main.js` — Orchestrator, UI updates, scoring
- `js/bench-*.js` — Individual benchmark modules
- `workers/compute-worker.js` — Web Worker for async benchmark

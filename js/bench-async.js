(function () {
  const SIEVE_N = 1500000;
  const RAF_DURATION = 9000;
  const RAF_WARMUP = 1000;

  function sieveSingleThread(n) {
    const start = performance.now();
    const flags = new Uint8Array(n + 1);
    flags.fill(1);
    flags[0] = flags[1] = 0;
    for (let i = 2; i * i <= n; i++) {
      if (flags[i]) {
        for (let j = i * i; j <= n; j += i) {
          flags[j] = 0;
        }
      }
    }
    return performance.now() - start;
  }

  function runWorkers(count, onWorkerDone) {
    return new Promise((resolve, reject) => {
      let completed = 0;
      let totalTime = 0;
      const wallStart = performance.now();
      const workers = [];

      for (let i = 0; i < count; i++) {
        const w = new Worker("workers/compute-worker.js");
        workers.push(w);
        w.onmessage = function (e) {
          totalTime += e.data.time;
          completed++;
          if (onWorkerDone) onWorkerDone(completed, count);
          if (completed === count) {
            const wallTime = performance.now() - wallStart;
            workers.forEach((w) => w.terminate());
            resolve({ wallTime, totalTime });
          }
        };
        w.onerror = function (e) {
          workers.forEach((w) => w.terminate());
          reject(e);
        };
        w.postMessage({ task: "sieve", n: SIEVE_N });
      }
    });
  }

  function measureRAFConsistency(jitterCtx, jitterW, jitterH) {
    return new Promise((resolve) => {
      const intervals = [];
      let lastTime = performance.now();
      const startTime = lastTime;
      let warmedUp = false;

      function tick(now) {
        const elapsed = now - startTime;
        const delta = now - lastTime;
        lastTime = now;

        if (!warmedUp) {
          if (elapsed >= RAF_WARMUP) {
            warmedUp = true;
          }
          requestAnimationFrame(tick);
          return;
        }

        if (elapsed >= RAF_WARMUP + RAF_DURATION) {
          const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
          const variance =
            intervals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / intervals.length;
          const stdDev = Math.sqrt(variance);
          resolve(stdDev);
          return;
        }

        intervals.push(delta);

        // Draw jitter waveform
        if (jitterCtx && intervals.length > 1) {
          jitterCtx.clearRect(0, 0, jitterW, jitterH);
          jitterCtx.strokeStyle = "#00ffff";
          jitterCtx.lineWidth = 1;
          jitterCtx.beginPath();
          const visCount = Math.min(intervals.length, jitterW);
          const startIdx = intervals.length - visCount;
          for (let i = 0; i < visCount; i++) {
            const val = intervals[startIdx + i];
            // Map 0-40ms to canvas height (16.67ms = ideal)
            const y = jitterH - Math.min(val / 40, 1) * jitterH;
            if (i === 0) jitterCtx.moveTo(i, y);
            else jitterCtx.lineTo(i * (jitterW / visCount), y);
          }
          jitterCtx.stroke();

          // Draw 16.67ms reference line
          const refY = jitterH - (16.67 / 40) * jitterH;
          jitterCtx.strokeStyle = "#00ff4144";
          jitterCtx.setLineDash([4, 4]);
          jitterCtx.beginPath();
          jitterCtx.moveTo(0, refY);
          jitterCtx.lineTo(jitterW, refY);
          jitterCtx.stroke();
          jitterCtx.setLineDash([]);
        }

        requestAnimationFrame(tick);
      }

      requestAnimationFrame(tick);
    });
  }

  window.SimpleBench.benchmarks.async = {
    name: "Async & Concurrency",
    description: "Parallel Web Worker sieve vs single-thread + rAF frame-timing jitter",

    _preview: null,

    run: async function (onProgress) {
      const workerCount = navigator.hardwareConcurrency || 4;

      // Create preview
      const preview = document.createElement("div");
      preview.className = "bench-preview";
      let workersHTML = "";
      for (let i = 0; i < workerCount; i++) {
        workersHTML += '<div class="async-worker-row">' +
          '<span class="async-worker-label">W' + i + '</span>' +
          '<div class="async-worker-bar"><div class="async-worker-fill" id="awf-' + i + '"></div></div></div>';
      }
      preview.innerHTML = `
        <div class="bench-preview-header">
          <span class="bench-preview-label">ASYNC // LIVE</span>
          <span class="bench-preview-stats" id="async-stats">SINGLE THREAD</span>
        </div>
        <div class="bench-preview-body">
          <div class="async-preview-content">
            <div class="async-phase-label">PHASE 1: WORKER PARALLELISM</div>
            ${workersHTML}
            <div class="async-phase-label" id="async-phase2-label" style="display:none">PHASE 2: RAF JITTER</div>
            <canvas class="async-jitter-canvas" id="async-jitter" style="display:none" width="260" height="50"></canvas>
          </div>
        </div>
        <div class="bench-preview-scanlines"></div>
      `;
      document.body.appendChild(preview);
      this._preview = preview;

      const statsDisplay = document.getElementById("async-stats");
      const workerFills = [];
      for (let i = 0; i < workerCount; i++) {
        workerFills.push(document.getElementById("awf-" + i));
      }

      let workerScore = 0;
      let workersAvailable = true;

      try {
        // Single-threaded baseline — yield between each so bars animate
        statsDisplay.textContent = "SINGLE THREAD...";
        let singleTotal = 0;
        for (let i = 0; i < workerCount; i++) {
          // Show which worker slot is "running"
          workerFills[i].style.width = "50%";
          workerFills[i].style.background = "var(--yellow)";
          await new Promise((r) => setTimeout(r, 0));

          singleTotal += sieveSingleThread(SIEVE_N);

          workerFills[i].style.width = "100%";
          workerFills[i].style.background = "var(--gray)";
          statsDisplay.textContent = "SINGLE " + (i + 1) + "/" + workerCount;
          await new Promise((r) => setTimeout(r, 0));
        }
        onProgress(0.2);

        // Reset fills for parallel run
        for (let i = 0; i < workerCount; i++) {
          workerFills[i].style.width = "0%";
          workerFills[i].style.background = "";
        }
        await new Promise((r) => setTimeout(r, 50));

        statsDisplay.textContent = "PARALLEL WORKERS...";

        // Show all bars pulsing while workers run
        for (let i = 0; i < workerCount; i++) {
          workerFills[i].style.width = "100%";
          workerFills[i].style.background = "var(--cyan)";
          workerFills[i].style.opacity = "0.3";
          workerFills[i].style.transition = "opacity 0.3s";
        }

        // Parallel workers
        const { wallTime } = await runWorkers(workerCount, function (completed) {
          // Mark completed workers with solid fill
          if (completed <= workerCount) {
            workerFills[completed - 1].style.opacity = "1";
            workerFills[completed - 1].style.background = "var(--toxic)";
          }
        });

        const speedup = singleTotal / wallTime;
        workerScore = (speedup / 3) * 100;
        statsDisplay.textContent = speedup.toFixed(2) + "x SPEEDUP";
        onProgress(0.6);
      } catch (e) {
        console.warn("Web Workers unavailable, skipping worker benchmark:", e);
        workersAvailable = false;
        onProgress(0.6);
      }

      // Show phase 2
      const phase2Label = document.getElementById("async-phase2-label");
      const jitterCanvas = document.getElementById("async-jitter");
      phase2Label.style.display = "";
      jitterCanvas.style.display = "";
      statsDisplay.textContent = "MEASURING JITTER...";

      const jitterCtx = jitterCanvas.getContext("2d");

      // rAF consistency with live waveform
      const stdDev = await measureRAFConsistency(jitterCtx, 260, 50);
      const rafScore = Math.max(0, 100 - stdDev * 10);
      statsDisplay.textContent = "JITTER: " + stdDev.toFixed(2) + "ms stddev";
      onProgress(1);

      let combined;
      if (workersAvailable) {
        combined = workerScore * 0.6 + rafScore * 0.4;
      } else {
        combined = rafScore;
      }

      return { rawScore: combined, unit: "score" };
    },

    cleanup: function () {
      if (this._preview) {
        this._preview.classList.add("bench-preview-exit");
        const el = this._preview;
        setTimeout(() => el.remove(), 300);
        this._preview = null;
      }
    },

    normalize: function (rawScore) {
      return rawScore;
    },
  };
})();

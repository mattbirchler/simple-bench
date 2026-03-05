(function () {
  const SIEVE_N = 1500000;
  const RAF_DURATION = 9000;

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

  function runWorkers(count) {
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

  function measureRAFConsistency() {
    return new Promise((resolve) => {
      const intervals = [];
      let lastTime = performance.now();
      const startTime = lastTime;

      function tick(now) {
        const elapsed = now - startTime;
        if (elapsed >= RAF_DURATION) {
          // Compute standard deviation of intervals
          const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
          const variance =
            intervals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / intervals.length;
          const stdDev = Math.sqrt(variance);
          resolve(stdDev);
          return;
        }
        const delta = now - lastTime;
        lastTime = now;
        intervals.push(delta);
        requestAnimationFrame(tick);
      }

      requestAnimationFrame(tick);
    });
  }

  window.SimpleBench.benchmarks.async = {
    name: "Async & Concurrency",
    description: "Parallel Web Worker sieve vs single-thread + rAF frame-timing jitter",

    run: async function (onProgress) {
      let workerScore = 0;
      let workersAvailable = true;

      try {
        // Single-threaded baseline
        const workerCount = navigator.hardwareConcurrency || 4;
        let singleTotal = 0;
        for (let i = 0; i < workerCount; i++) {
          singleTotal += sieveSingleThread(SIEVE_N);
        }
        onProgress(0.2);

        // Parallel workers
        const { wallTime } = await runWorkers(workerCount);
        const speedup = singleTotal / wallTime;
        workerScore = (speedup / 3) * 100;
        onProgress(0.6);
      } catch (e) {
        console.warn("Web Workers unavailable, skipping worker benchmark:", e);
        workersAvailable = false;
        onProgress(0.6);
      }

      // rAF consistency
      const stdDev = await measureRAFConsistency();
      const rafScore = Math.max(0, 100 - stdDev * 10);
      onProgress(1);

      let combined;
      if (workersAvailable) {
        combined = workerScore * 0.6 + rafScore * 0.4;
      } else {
        combined = rafScore;
      }

      return { rawScore: combined, unit: "score" };
    },

    cleanup: function () {},

    normalize: function (rawScore) {
      return rawScore;
    },
  };
})();

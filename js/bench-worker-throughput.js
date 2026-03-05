(function () {
  const utils = window.SimpleBench.utils;

  function uniqueSorted(values) {
    return Array.from(new Set(values)).sort(function (a, b) { return a - b; });
  }

  function runWorkerBatch(workerCount, n) {
    return new Promise(function (resolve, reject) {
      let done = 0;
      const workers = [];
      const start = performance.now();

      for (let i = 0; i < workerCount; i++) {
        const w = new Worker("workers/compute-worker.js");
        workers.push(w);
        w.onmessage = function () {
          done++;
          if (done === workerCount) {
            const elapsed = performance.now() - start;
            workers.forEach(function (x) { x.terminate(); });
            resolve(elapsed);
          }
        };
        w.onerror = function (err) {
          workers.forEach(function (x) { x.terminate(); });
          reject(err);
        };
        w.postMessage({ task: "sieve", n: n });
      }
    });
  }

  function trapezoidAuc(xs, ys) {
    let area = 0;
    for (let i = 1; i < xs.length; i++) {
      const w = xs[i] - xs[i - 1];
      const h = (ys[i] + ys[i - 1]) * 0.5;
      area += w * h;
    }
    return area;
  }

  window.SimpleBench.benchmarks.worker = {
    id: "worker",
    name: "Worker Throughput",
    category: "compute",
    primaryMetric: "throughput_scaling_auc",
    cvThreshold: 0.08,
    metricDefs: {
      max_throughput_scaling: { unit: "x", direction: "higher_is_better" },
      throughput_scaling_auc: { unit: "score", direction: "higher_is_better" },
      parallel_efficiency_at_max: { unit: "ratio", direction: "higher_is_better" },
    },

    run: async function (ctx) {
      if (typeof Worker === "undefined") {
        return {
          metrics: {},
          samples: [],
          metadata: { benchmark: "worker", unsupported: true },
          warnings: ["Web Workers are unavailable on this browser."],
          unstable: false,
          primaryMetric: this.primaryMetric,
        };
      }

      const maxSupported = Math.max(1, Math.min(8, navigator.hardwareConcurrency || 4));
      const counts = uniqueSorted([1, 2, 4, maxSupported].filter(function (n) {
        return n <= maxSupported;
      }));

      const protocolResult = await utils.runSamplingProtocol({
        warmup: ctx.warmup,
        measured: ctx.measured,
        maxReruns: 1,
        cvThreshold: this.cvThreshold,
        primaryMetric: this.primaryMetric,
        onProgress: ctx.onProgress,
        measureSample: async function () {
          const n = 1000000;
          const t1 = await runWorkerBatch(1, n);
          const xs = [1];
          const ys = [1];
          let maxThroughputScaling = 1;

          for (let i = 1; i < counts.length; i++) {
            const c = counts[i];
            const tc = await runWorkerBatch(c, n);
            // This is throughput scaling (total work completed per unit time), not latency speedup.
            const throughputScaling = (t1 * c) / tc;
            xs.push(c);
            ys.push(throughputScaling);
            if (throughputScaling > maxThroughputScaling) maxThroughputScaling = throughputScaling;
          }

          const aucRaw = trapezoidAuc(xs, ys);
          const normSpan = Math.max(1, xs[xs.length - 1] - xs[0]);
          const aucNorm = aucRaw / normSpan;
          const efficiency = maxThroughputScaling / xs[xs.length - 1];

          return {
            max_throughput_scaling: maxThroughputScaling,
            throughput_scaling_auc: aucNorm,
            parallel_efficiency_at_max: efficiency,
          };
        },
      });

      const metrics = utils.buildMetricMap(protocolResult.samples, this.metricDefs);

      return {
        metrics: metrics,
        samples: protocolResult.samples,
        metadata: {
          benchmark: "worker",
          worker_counts: counts,
          max_supported: maxSupported,
        },
        warnings: protocolResult.warnings,
        unstable: protocolResult.unstable,
        primaryMetric: this.primaryMetric,
      };
    },

    cleanup: function () {},
  };
})();

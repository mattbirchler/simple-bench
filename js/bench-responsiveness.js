(function () {
  const utils = window.SimpleBench.utils;

  function startWorkerLoad(workerCount, n) {
    if (typeof Worker === "undefined" || workerCount <= 0) {
      return {
        stop: function () {},
        active: false,
      };
    }

    let active = true;
    const workers = [];
    for (let i = 0; i < workerCount; i++) {
      const w = new Worker("workers/compute-worker.js");
      w.onmessage = function () {
        if (!active) return;
        w.postMessage({ task: "sieve", n: n });
      };
      w.postMessage({ task: "sieve", n: n });
      workers.push(w);
    }

    return {
      stop: function () {
        active = false;
        workers.forEach(function (w) { w.terminate(); });
      },
      active: true,
    };
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  async function estimateFrameBudgetMs(samples) {
    return new Promise(function (resolve) {
      const intervals = [];
      let last = performance.now();
      function tick(now) {
        intervals.push(now - last);
        last = now;
        if (intervals.length >= samples) {
          resolve(utils.percentile(intervals, 0.5));
          return;
        }
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }

  async function measureResponsivenessSample(durationMs) {
    const workerCount = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
    const workerLoad = startWorkerLoad(workerCount, 650000);
    const frameBudgetMs = await estimateFrameBudgetMs(24);
    const burnBudgetMs = clamp(frameBudgetMs * 0.45, 2.5, 8);

    const lagSamples = [];
    const rafIntervals = [];
    let longTasks = 0;
    let running = true;
    let longTaskSupported = false;

    let observer = null;
    if (typeof PerformanceObserver !== "undefined") {
      try {
        observer = new PerformanceObserver(function (list) {
          longTasks += list.getEntries().length;
        });
        observer.observe({ entryTypes: ["longtask"] });
        longTaskSupported = true;
      } catch (e) {
        observer = null;
      }
    }

    const channel = new MessageChannel();
    let pingAt = performance.now();
    channel.port1.onmessage = function () {
      const now = performance.now();
      lagSamples.push(Math.max(0, now - pingAt));
      if (running) {
        pingAt = performance.now();
        channel.port2.postMessage(0);
      }
    };
    channel.port2.postMessage(0);

    const burn = setInterval(function () {
      const t = performance.now();
      while (performance.now() - t < burnBudgetMs) {
        Math.sqrt(991 * 991);
      }
    }, 80);

    let lastRaf = performance.now();
    let rafHandle = 0;
    function rafTick(now) {
      rafIntervals.push(now - lastRaf);
      lastRaf = now;
      if (running) rafHandle = requestAnimationFrame(rafTick);
    }
    rafHandle = requestAnimationFrame(rafTick);

    await utils.sleep(durationMs);

    running = false;
    cancelAnimationFrame(rafHandle);
    clearInterval(burn);
    workerLoad.stop();
    channel.port1.close();
    channel.port2.close();
    if (observer) observer.disconnect();

    const lagP95 = lagSamples.length ? utils.percentile(lagSamples, 0.95) : 999;
    const rafStddev = rafIntervals.length ? utils.stddev(rafIntervals) : 999;
    const score = 1000 / (1 + lagP95 + rafStddev * 2 + longTasks * 0.5);

    return {
      event_loop_lag_ms_p95: lagP95,
      raf_jitter_ms_stddev: rafStddev,
      long_task_count: longTasks,
      responsiveness_index: score,
      worker_load_threads: workerLoad.active ? workerCount : 0,
      longtask_supported: longTaskSupported ? 1 : 0,
      burn_budget_ms: burnBudgetMs,
      estimated_frame_budget_ms: frameBudgetMs,
    };
  }

  window.SimpleBench.benchmarks.responsive = {
    id: "responsive",
    name: "Responsiveness Under Load",
    category: "responsiveness",
    primaryMetric: "responsiveness_index",
    cvThreshold: 0.08,
    metricDefs: {
      event_loop_lag_ms_p95: { unit: "ms", direction: "lower_is_better" },
      raf_jitter_ms_stddev: { unit: "ms", direction: "lower_is_better" },
      long_task_count: { unit: "count", direction: "lower_is_better" },
      responsiveness_index: { unit: "score", direction: "higher_is_better" },
    },

    run: async function (ctx) {
      const protocolResult = await utils.runSamplingProtocol({
        warmup: ctx.warmup,
        measured: ctx.measured,
        maxReruns: 1,
        cvThreshold: this.cvThreshold,
        primaryMetric: this.primaryMetric,
        onProgress: ctx.onProgress,
        measureSample: async function () {
          return measureResponsivenessSample(2200);
        },
      });

      const metrics = utils.buildMetricMap(protocolResult.samples, this.metricDefs);
      const longtaskSupported = protocolResult.samples.some(function (s) {
        return s.longtask_supported === 1;
      });
      const burnBudgetMs = protocolResult.samples.length
        ? protocolResult.samples[0].burn_budget_ms
        : null;
      const frameBudgetMs = protocolResult.samples.length
        ? protocolResult.samples[0].estimated_frame_budget_ms
        : null;
      const warnings = protocolResult.warnings.slice();
      if (!longtaskSupported) {
        warnings.unshift("Long Task API unsupported; responsiveness score may be slightly optimistic.");
      }

      return {
        metrics: metrics,
        samples: protocolResult.samples,
        metadata: {
          benchmark: "responsive",
          worker_supported: typeof Worker !== "undefined",
          longtask_supported: longtaskSupported,
          burn_budget_ms: burnBudgetMs,
          estimated_frame_budget_ms: frameBudgetMs,
        },
        warnings: warnings,
        unstable: protocolResult.unstable,
        primaryMetric: this.primaryMetric,
      };
    },

    cleanup: function () {},
  };
})();

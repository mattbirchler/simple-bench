(function () {
  window.SimpleBench = window.SimpleBench || { benchmarks: {} };

  const DEFAULT_MEASURED_WIDTH = 800;
  const DEFAULT_MEASURED_HEIGHT = 600;

  function hashString(input) {
    let h = 2166136261;
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function createRng(seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function percentile(values, p) {
    if (!values.length) return 0;
    const sorted = values.slice().sort(function (a, b) { return a - b; });
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    const w = idx - lo;
    return sorted[lo] * (1 - w) + sorted[hi] * w;
  }

  function median(values) {
    return percentile(values, 0.5);
  }

  function iqr(values) {
    return percentile(values, 0.75) - percentile(values, 0.25);
  }

  function mean(values) {
    if (!values.length) return 0;
    return values.reduce(function (a, b) { return a + b; }, 0) / values.length;
  }

  function stddev(values) {
    if (values.length <= 1) return 0;
    const m = mean(values);
    const variance = values.reduce(function (sum, v) {
      const d = v - m;
      return sum + d * d;
    }, 0) / values.length;
    return Math.sqrt(variance);
  }

  function cv(values) {
    const m = mean(values);
    if (!values.length || m === 0) return 0;
    return stddev(values) / m;
  }

  function geomean(values) {
    const positive = values.filter(function (v) { return Number.isFinite(v) && v > 0; });
    if (!positive.length) return 0;
    const logSum = positive.reduce(function (sum, v) {
      return sum + Math.log(v);
    }, 0);
    return Math.exp(logSum / positive.length);
  }

  function waitForVisible() {
    if (typeof document === "undefined") return Promise.resolve();
    if (document.visibilityState === "visible") return Promise.resolve();
    return new Promise(function (resolve) {
      function onVis() {
        if (document.visibilityState === "visible") {
          document.removeEventListener("visibilitychange", onVis);
          resolve();
        }
      }
      document.addEventListener("visibilitychange", onVis);
    });
  }

  function createVisibilityGuard() {
    let hidden = false;
    function onVis() {
      if (document.visibilityState !== "visible") {
        hidden = true;
      }
    }
    document.addEventListener("visibilitychange", onVis);
    return {
      wasHidden: function () {
        return hidden;
      },
      stop: function () {
        document.removeEventListener("visibilitychange", onVis);
      },
    };
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function summarizeMetric(values, unit, direction) {
    return {
      unit: unit,
      direction: direction,
      samples: values.slice(),
      median: median(values),
      p50: percentile(values, 0.5),
      p95: percentile(values, 0.95),
      iqr: iqr(values),
      cv: cv(values),
      mean: mean(values),
    };
  }

  function buildMetricMap(sampleRows, metricDefs) {
    const metricMap = {};
    Object.keys(metricDefs).forEach(function (key) {
      const values = sampleRows
        .map(function (row) { return row[key]; })
        .filter(function (v) { return Number.isFinite(v); });
      metricMap[key] = summarizeMetric(values, metricDefs[key].unit, metricDefs[key].direction);
    });
    return metricMap;
  }

  async function runSamplingProtocol(opts) {
    const warmup = opts.warmup || 1;
    const measured = opts.measured || 3;
    const maxReruns = opts.maxReruns == null ? 1 : opts.maxReruns;
    const cvThreshold = opts.cvThreshold || 0.08;
    const sampleCooldownMs = opts.sampleCooldownMs == null ? 300 : opts.sampleCooldownMs;
    const primaryMetric = opts.primaryMetric;
    const onProgress = opts.onProgress || function () {};

    const warnings = [];
    let measuredRows = [];
    let reruns = 0;
    let stepsDone = 0;
    const maxSteps = warmup + measured * (maxReruns + 1);

    async function takeSamples(count, collect) {
      for (let i = 0; i < count; i++) {
        await waitForVisible();
        let sample = null;
        let attempts = 0;
        while (attempts < 2) {
          const guard = createVisibilityGuard();
          try {
            sample = await opts.measureSample({
              isWarmup: !collect,
              index: i,
              sampleIndex: measuredRows.length,
            });
          } finally {
            const hiddenDuring = guard.wasHidden();
            guard.stop();
            if (hiddenDuring) {
              warnings.push("Tab visibility changed during measurement; sample retried.");
              sample = null;
            }
          }
          if (sample) break;
          attempts++;
          await waitForVisible();
        }
        if (collect && sample) measuredRows.push(sample);
        stepsDone++;
        onProgress(Math.min(1, stepsDone / maxSteps));
        const isLast = i === count - 1;
        if (!isLast && sampleCooldownMs > 0) {
          await sleep(sampleCooldownMs);
        } else {
          await sleep(0);
        }
      }
    }

    await takeSamples(warmup, false);
    await takeSamples(measured, true);

    function primaryValues() {
      return measuredRows
        .map(function (row) { return row[primaryMetric]; })
        .filter(function (v) { return Number.isFinite(v); });
    }

    while (reruns < maxReruns) {
      const values = primaryValues();
      if (!values.length || cv(values) <= cvThreshold) break;
      warnings.push("Primary metric variance exceeded threshold; rerunning measurement batch.");
      reruns++;
      await takeSamples(measured, true);
    }

    onProgress(1);

    const finalValues = primaryValues();
    const unstable = finalValues.length > 1 && cv(finalValues) > cvThreshold;
    return {
      samples: measuredRows,
      warnings: warnings,
      reruns: reruns,
      unstable: unstable,
      sampleCount: measuredRows.length,
      protocol: {
        warmup: warmup,
        measured: measured,
        maxReruns: maxReruns,
        sampleCooldownMs: sampleCooldownMs,
      },
    };
  }

  window.SimpleBench.utils = {
    DEFAULT_MEASURED_WIDTH: DEFAULT_MEASURED_WIDTH,
    DEFAULT_MEASURED_HEIGHT: DEFAULT_MEASURED_HEIGHT,
    hashString: hashString,
    createRng: createRng,
    percentile: percentile,
    median: median,
    iqr: iqr,
    mean: mean,
    cv: cv,
    stddev: stddev,
    geomean: geomean,
    waitForVisible: waitForVisible,
    createVisibilityGuard: createVisibilityGuard,
    sleep: sleep,
    summarizeMetric: summarizeMetric,
    buildMetricMap: buildMetricMap,
    runSamplingProtocol: runSamplingProtocol,
  };
})();

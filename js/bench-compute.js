(function () {
  const utils = window.SimpleBench.utils;

  function makeData(rng) {
    const sortBase = new Float64Array(65000);
    for (let i = 0; i < sortBase.length; i++) {
      sortBase[i] = rng();
    }

    const matrixN = 96;
    const matrixA = new Float64Array(matrixN * matrixN);
    const matrixB = new Float64Array(matrixN * matrixN);
    for (let i = 0; i < matrixA.length; i++) {
      matrixA[i] = rng();
      matrixB[i] = rng();
    }

    const jsonObj = {};
    for (let i = 0; i < 140; i++) {
      jsonObj["k_" + i] = {
        id: i,
        label: "node_" + i,
        values: [i, i * 2, i * 4, i * 8],
        flags: { hot: i % 3 === 0, cold: i % 5 === 0 },
      };
    }

    return {
      sortBase: sortBase,
      matrixN: matrixN,
      matrixA: matrixA,
      matrixB: matrixB,
      jsonStr: JSON.stringify(jsonObj),
    };
  }

  function sieve(n) {
    const flags = new Uint8Array(n + 1);
    flags.fill(1);
    flags[0] = 0;
    flags[1] = 0;
    for (let i = 2; i * i <= n; i++) {
      if (flags[i]) {
        for (let j = i * i; j <= n; j += i) flags[j] = 0;
      }
    }
    let count = 0;
    for (let i = 0; i <= n; i++) count += flags[i];
    return count;
  }

  function sortTask(base) {
    const arr = Array.from(base);
    arr.sort(function (a, b) { return a - b; });
    return arr[0];
  }

  function matrixTask(n, A, B) {
    const C = new Float64Array(n * n);
    for (let i = 0; i < n; i++) {
      const rowOffset = i * n;
      for (let j = 0; j < n; j++) {
        let sum = 0;
        for (let k = 0; k < n; k++) {
          sum += A[rowOffset + k] * B[k * n + j];
        }
        C[rowOffset + j] = sum;
      }
    }
    return C[0];
  }

  function jsonTask(jsonStr) {
    const parsed = JSON.parse(jsonStr);
    return Object.keys(parsed).length;
  }

  function timedOps(fn, minMs) {
    let loops = 0;
    const start = performance.now();
    while (performance.now() - start < minMs) {
      fn();
      loops++;
    }
    const elapsed = performance.now() - start;
    return loops / (elapsed / 1000);
  }

  window.SimpleBench.benchmarks.compute = {
    id: "compute",
    name: "JavaScript Compute",
    category: "compute",
    primaryMetric: "compute_geomean",
    cvThreshold: 0.05,
    metricDefs: {
      sieve_ops: { unit: "ops/s", direction: "higher_is_better" },
      sort_ops: { unit: "ops/s", direction: "higher_is_better" },
      matrix_ops: { unit: "ops/s", direction: "higher_is_better" },
      json_ops: { unit: "ops/s", direction: "higher_is_better" },
      compute_geomean: { unit: "ops/s", direction: "higher_is_better" },
    },

    run: async function (ctx) {
      const seedBase = ctx.seed + ":compute:";

      const protocolResult = await utils.runSamplingProtocol({
        warmup: ctx.warmup,
        measured: ctx.measured,
        maxReruns: 1,
        cvThreshold: this.cvThreshold,
        primaryMetric: this.primaryMetric,
        onProgress: ctx.onProgress,
        measureSample: async ({ sampleIndex }) => {
          const rng = utils.createRng(utils.hashString(seedBase + sampleIndex));
          const data = makeData(rng);

          const sieveOps = timedOps(function () { sieve(700000); }, 350);
          await utils.sleep(0);
          const sortOps = timedOps(function () { sortTask(data.sortBase); }, 350);
          await utils.sleep(0);
          const matrixOps = timedOps(function () { matrixTask(data.matrixN, data.matrixA, data.matrixB); }, 350);
          await utils.sleep(0);
          const jsonOps = timedOps(function () { jsonTask(data.jsonStr); }, 350);
          const geo = utils.geomean([sieveOps, sortOps, matrixOps, jsonOps]);

          return {
            sieve_ops: sieveOps,
            sort_ops: sortOps,
            matrix_ops: matrixOps,
            json_ops: jsonOps,
            compute_geomean: geo,
          };
        },
      });

      const metrics = utils.buildMetricMap(protocolResult.samples, this.metricDefs);

      return {
        metrics: metrics,
        samples: protocolResult.samples,
        metadata: {
          benchmark: "compute",
          dataset: "seeded_reused",
        },
        warnings: protocolResult.warnings,
        unstable: protocolResult.unstable,
        primaryMetric: this.primaryMetric,
      };
    },

    cleanup: function () {},
  };
})();

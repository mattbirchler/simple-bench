(function () {
  function sieve(n) {
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
    let count = 0;
    for (let i = 0; i <= n; i++) if (flags[i]) count++;
    return count;
  }

  function arraySort(size) {
    const arr = new Float64Array(size);
    for (let i = 0; i < size; i++) arr[i] = Math.random();
    const sorted = Array.from(arr);
    sorted.sort((a, b) => a - b);
    return sorted.length;
  }

  function matrixMultiply(n) {
    const A = [];
    const B = [];
    for (let i = 0; i < n; i++) {
      A[i] = new Float64Array(n);
      B[i] = new Float64Array(n);
      for (let j = 0; j < n; j++) {
        A[i][j] = Math.random();
        B[i][j] = Math.random();
      }
    }
    const C = [];
    for (let i = 0; i < n; i++) {
      C[i] = new Float64Array(n);
      for (let j = 0; j < n; j++) {
        let sum = 0;
        for (let k = 0; k < n; k++) {
          sum += A[i][k] * B[k][j];
        }
        C[i][j] = sum;
      }
    }
    return C[0][0];
  }

  function jsonRoundTrip() {
    const obj = {};
    for (let i = 0; i < 200; i++) {
      obj[`key_${i}`] = {
        id: i,
        name: `item_${i}`,
        values: Array.from({ length: 20 }, (_, j) => j * i),
        nested: { a: Math.random(), b: `str_${i}`, c: [1, 2, 3] },
      };
    }
    const str = JSON.stringify(obj);
    const parsed = JSON.parse(str);
    return Object.keys(parsed).length;
  }

  function measureTask(fn, iterations) {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) fn();
    const elapsed = performance.now() - start;
    return (iterations / elapsed) * 1000; // ops per second
  }

  window.SimpleBench.benchmarks.compute = {
    name: "JavaScript Compute",
    description: "Prime sieve to 3M, sort 300K floats, 350x350 matrix multiply, 50KB JSON x60 parse/stringify",

    run: async function (onProgress) {
      // Sieve
      const sieveOps = measureTask(() => sieve(3000000), 15);
      onProgress(0.25);
      await new Promise((r) => setTimeout(r, 0));

      // Array sort
      const sortOps = measureTask(() => arraySort(300000), 30);
      onProgress(0.5);
      await new Promise((r) => setTimeout(r, 0));

      // Matrix multiply
      const matOps = measureTask(() => matrixMultiply(350), 9);
      onProgress(0.75);
      await new Promise((r) => setTimeout(r, 0));

      // JSON round-trip
      const jsonOps = measureTask(() => jsonRoundTrip(), 60);
      onProgress(1);

      // Geometric mean
      const geoMean = Math.pow(sieveOps * sortOps * matOps * jsonOps, 0.25);

      return { rawScore: geoMean, unit: "geo mean" };
    },

    cleanup: function () {},

    normalize: function (rawScore) {
      // Baseline: geo mean of 800 = score of 100
      return (rawScore / 800) * 100;
    },
  };
})();

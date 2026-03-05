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

  function measureTask(fn, warmup, iterations) {
    for (let i = 0; i < warmup; i++) fn();
    const start = performance.now();
    for (let i = 0; i < iterations; i++) fn();
    const elapsed = performance.now() - start;
    return (iterations / elapsed) * 1000;
  }

  const TASKS = [
    { id: "sieve", label: "PRIME SIEVE (3M)", warmup: 3, iters: 15, fn: () => sieve(3000000) },
    { id: "sort", label: "ARRAY SORT (300K)", warmup: 5, iters: 30, fn: () => arraySort(300000) },
    { id: "matrix", label: "MATRIX MUL (350\u00B2)", warmup: 3, iters: 9, fn: () => matrixMultiply(350) },
    { id: "json", label: "JSON R/T (50KB\u00D760)", warmup: 10, iters: 60, fn: () => jsonRoundTrip() },
  ];

  window.SimpleBench.benchmarks.compute = {
    name: "JavaScript Compute",
    description: "Prime sieve to 3M, sort 300K floats, 350x350 matrix multiply, 50KB JSON x60 parse/stringify",

    _preview: null,

    run: async function (onProgress) {
      // Create preview
      const preview = document.createElement("div");
      preview.className = "bench-preview";
      const tasksHTML = TASKS.map(function (t) {
        return '<div class="compute-task" id="ct-' + t.id + '">' +
          '<span>\u25B6 ' + t.label + '</span>' +
          '<span class="compute-task-result" id="ctr-' + t.id + '">---</span></div>';
      }).join("");
      preview.innerHTML = `
        <div class="bench-preview-header">
          <span class="bench-preview-label">JS COMPUTE // LIVE</span>
          <span class="bench-preview-stats" id="compute-stats">---</span>
        </div>
        <div class="bench-preview-body">
          <div class="compute-tasks">${tasksHTML}</div>
        </div>
        <div class="bench-preview-scanlines"></div>
      `;
      document.body.appendChild(preview);
      this._preview = preview;

      const statsDisplay = document.getElementById("compute-stats");
      const results = [];

      for (let i = 0; i < TASKS.length; i++) {
        const t = TASKS[i];
        const taskEl = document.getElementById("ct-" + t.id);
        const resultEl = document.getElementById("ctr-" + t.id);

        taskEl.className = "compute-task running";
        resultEl.textContent = "running...";

        await new Promise((r) => setTimeout(r, 0));

        const ops = measureTask(t.fn, t.warmup, t.iters);
        results.push(ops);

        resultEl.textContent = ops.toFixed(1) + " ops/s";
        taskEl.className = "compute-task done";
        statsDisplay.textContent = (i + 1) + "/" + TASKS.length + " DONE";

        onProgress((i + 1) / TASKS.length);
        await new Promise((r) => setTimeout(r, 0));
      }

      const geoMean = Math.pow(results.reduce(function (a, b) { return a * b; }, 1), 0.25);
      statsDisplay.textContent = "GEO MEAN: " + geoMean.toFixed(1);

      return { rawScore: geoMean, unit: "geo mean" };
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
      return (rawScore / 800) * 100;
    },
  };
})();

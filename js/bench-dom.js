(function () {
  const utils = window.SimpleBench.utils;

  function makeListItem(i) {
    const li = document.createElement("li");
    li.className = "dom-item";
    li.textContent = "Item " + i;
    li.style.padding = "2px 4px";
    li.style.borderBottom = "1px solid #1f1f1f";
    return li;
  }

  function runDomWorkload(sandbox, rng) {
    const container = document.createElement("div");
    container.style.width = "800px";
    container.style.height = "600px";
    container.style.overflow = "auto";
    container.style.position = "relative";

    const list = document.createElement("ul");
    list.style.margin = "0";
    list.style.padding = "0";
    list.style.listStyle = "none";
    container.appendChild(list);

    const initial = 900;
    for (let i = 0; i < initial; i++) {
      list.appendChild(makeListItem(i));
    }

    sandbox.innerHTML = "";
    sandbox.appendChild(container);

    const cycles = 220;
    let ops = 0;
    const layoutReads = [];
    const start = performance.now();

    for (let i = 0; i < cycles; i++) {
      const extra = makeListItem(initial + i);
      list.appendChild(extra);
      ops++;

      if (list.children.length > initial + 30) {
        list.removeChild(list.firstChild);
        ops++;
      }

      if (i % 3 === 0 && list.children.length > 3) {
        const moving = list.children[2];
        list.removeChild(moving);
        list.appendChild(moving);
        ops += 2;
      }

      const row = list.children[(i * 7) % list.children.length];
      row.classList.toggle("active", i % 2 === 0);
      row.classList.toggle("alt", i % 3 === 0);
      row.style.background = i % 2 === 0 ? "#161616" : "#0f0f0f";
      ops += 3;

      const textNode = list.children[(i * 13) % list.children.length];
      textNode.textContent = "Item " + i + " / " + Math.floor(rng() * 1000);
      ops++;

      if (i % 8 === 0) {
        const layoutStart = performance.now();
        void container.offsetHeight;
        layoutReads.push(performance.now() - layoutStart);
      }
    }

    const elapsed = performance.now() - start;
    const opsPerSec = (ops / elapsed) * 1000;
    const layoutP50 = layoutReads.length ? utils.percentile(layoutReads, 0.5) : 0;
    const layoutP95 = layoutReads.length ? utils.percentile(layoutReads, 0.95) : 0;

    sandbox.innerHTML = "";

    return {
      ops_per_sec: opsPerSec,
      layout_read_ms_p50: layoutP50,
      layout_read_ms_p95: layoutP95,
    };
  }

  window.SimpleBench.benchmarks.dom = {
    id: "dom",
    name: "DOM Manipulation",
    category: "ui_pipeline",
    primaryMetric: "ops_per_sec",
    cvThreshold: 0.07,
    metricDefs: {
      ops_per_sec: { unit: "ops/s", direction: "higher_is_better" },
      layout_read_ms_p50: { unit: "ms", direction: "lower_is_better" },
      layout_read_ms_p95: { unit: "ms", direction: "lower_is_better" },
    },

    run: async function (ctx) {
      const seedBase = ctx.seed + ":dom:";
      const protocolResult = await utils.runSamplingProtocol({
        warmup: ctx.warmup,
        measured: ctx.measured,
        maxReruns: 2,
        cvThreshold: this.cvThreshold,
        primaryMetric: this.primaryMetric,
        onProgress: ctx.onProgress,
        measureSample: async ({ sampleIndex }) => {
          const rng = utils.createRng(utils.hashString(seedBase + sampleIndex));
          return runDomWorkload(ctx.sandbox, rng);
        },
      });

      const metrics = utils.buildMetricMap(protocolResult.samples, this.metricDefs);

      return {
        metrics: metrics,
        samples: protocolResult.samples,
        metadata: {
          benchmark: "dom",
          fixed_resolution: ctx.fixedResolution,
        },
        warnings: protocolResult.warnings,
        unstable: protocolResult.unstable,
        primaryMetric: this.primaryMetric,
      };
    },

    cleanup: function (sandbox) {
      if (sandbox) sandbox.innerHTML = "";
    },
  };
})();

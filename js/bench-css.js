(function () {
  const utils = window.SimpleBench.utils;

  function ensureCssClasses() {
    if (document.getElementById("sb2-css-bench-style")) return;
    const style = document.createElement("style");
    style.id = "sb2-css-bench-style";
    style.textContent = [
      ".sb2-css-cell { width: 20px; height: 20px; margin: 1px; background: #1f1f1f; }",
      ".sb2-a { color: #9aa; background: #181818; }",
      ".sb2-b { color: #ccd; background: #202020; }",
      ".sb2-c { color: #eef; background: #282828; }",
      ".sb2-anim { transition: transform 120ms linear, opacity 120ms linear; }",
    ].join("\n");
    document.head.appendChild(style);
  }

  function layoutPhase(container, durationMs) {
    const wrappers = [];
    let parent = container;
    for (let d = 0; d < 4; d++) {
      const wrap = document.createElement("div");
      wrap.style.display = d % 2 === 0 ? "flex" : "grid";
      wrap.style.flexWrap = "wrap";
      wrap.style.gridTemplateColumns = "repeat(20, 22px)";
      wrap.style.gap = "2px";
      parent.appendChild(wrap);
      wrappers.push(wrap);
      parent = wrap;
    }

    for (let i = 0; i < 700; i++) {
      const c = document.createElement("div");
      c.className = "sb2-css-cell";
      wrappers[i % wrappers.length].appendChild(c);
    }

    let ops = 0;
    const start = performance.now();
    while (performance.now() - start < durationMs) {
      const step = ops % 2;
      for (let i = 0; i < wrappers.length; i++) {
        const w = wrappers[i];
        w.style.display = step === 0 ? "flex" : "grid";
        w.style.gridTemplateColumns = step === 0 ? "repeat(18, 22px)" : "repeat(22, 22px)";
        w.style.justifyContent = step === 0 ? "flex-start" : "center";
        ops += 3;
      }
      void container.offsetHeight;
      ops++;
    }

    const elapsed = performance.now() - start;
    return (ops / elapsed) * 1000;
  }

  function stylePhase(container, durationMs) {
    const nodes = [];
    for (let i = 0; i < 900; i++) {
      const d = document.createElement("div");
      d.className = "sb2-css-cell sb2-a";
      d.style.position = "absolute";
      d.style.left = (i % 30) * 24 + "px";
      d.style.top = Math.floor(i / 30) * 22 + "px";
      container.appendChild(d);
      nodes.push(d);
    }

    let ops = 0;
    const start = performance.now();
    while (performance.now() - start < durationMs) {
      const mode = ops % 3;
      const cls = mode === 0 ? "sb2-a" : mode === 1 ? "sb2-b" : "sb2-c";
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        n.classList.remove("sb2-a", "sb2-b", "sb2-c");
        n.classList.add(cls);
        n.style.borderRadius = (mode * 3) + "px";
        ops += 3;
      }
      void container.offsetWidth;
      ops++;
    }

    const elapsed = performance.now() - start;
    return (ops / elapsed) * 1000;
  }

  function compositorPhase(container, durationMs, burnBudgetMs) {
    const animated = [];
    for (let i = 0; i < 140; i++) {
      const el = document.createElement("div");
      el.className = "sb2-css-cell sb2-anim";
      el.style.position = "absolute";
      el.style.left = (i % 20) * 28 + "px";
      el.style.top = Math.floor(i / 20) * 26 + "px";
      container.appendChild(el);
      animated.push(el);
    }

    const frameTimes = [];
    const start = performance.now();
    let frame = 0;

    while (performance.now() - start < durationMs) {
      const frameStart = performance.now();

      for (let i = 0; i < animated.length; i++) {
        const a = animated[i];
        const x = Math.sin((frame + i) * 0.09) * 14;
        const y = Math.cos((frame + i) * 0.07) * 10;
        a.style.transform = "translate(" + x.toFixed(2) + "px," + y.toFixed(2) + "px)";
        a.style.opacity = String(0.5 + (Math.sin((frame + i) * 0.03) + 1) * 0.25);
      }

      // Time-based CPU burn keeps pressure proportional to device speed.
      let burn = 0;
      const burnStart = performance.now();
      while (performance.now() - burnStart < burnBudgetMs) {
        burn += Math.sqrt((frame + 1) * 13.37 + burn);
      }
      if (burn < 0) container.dataset.burn = "1";

      frameTimes.push(performance.now() - frameStart);
      frame++;
    }

    const dropped = frameTimes.filter(function (ms) { return ms > 20; }).length;
    return frameTimes.length ? (dropped / frameTimes.length) * 100 : 100;
  }

  window.SimpleBench.benchmarks.css = {
    id: "css",
    name: "CSS Layout Pipeline",
    category: "ui_pipeline",
    primaryMetric: "pipeline_score",
    cvThreshold: 0.07,
    metricDefs: {
      layout_ops_per_sec: { unit: "ops/s", direction: "higher_is_better" },
      style_recalc_ops_per_sec: { unit: "ops/s", direction: "higher_is_better" },
      dropped_frame_pct: { unit: "%", direction: "lower_is_better" },
      pipeline_score: { unit: "score", direction: "higher_is_better" },
    },

    run: async function (ctx) {
      ensureCssClasses();
      const seedBase = ctx.seed + ":css:";

      const protocolResult = await utils.runSamplingProtocol({
        warmup: ctx.warmup,
        measured: ctx.measured,
        maxReruns: 2,
        cvThreshold: this.cvThreshold,
        primaryMetric: this.primaryMetric,
        onProgress: ctx.onProgress,
        measureSample: async ({ sampleIndex }) => {
          const _rng = utils.createRng(utils.hashString(seedBase + sampleIndex));
          if (!_rng) return null;

          const holder = document.createElement("div");
          holder.style.position = "relative";
          holder.style.width = "800px";
          holder.style.height = "600px";
          holder.style.overflow = "hidden";

          ctx.sandbox.innerHTML = "";
          ctx.sandbox.appendChild(holder);

          const layoutOps = layoutPhase(holder, 520);
          holder.innerHTML = "";
          const styleOps = stylePhase(holder, 520);
          holder.innerHTML = "";
          const droppedPct = compositorPhase(holder, 820, 2.0);

          const pipelineScore = ((layoutOps + styleOps) / 2) / (1 + droppedPct / 100);

          ctx.sandbox.innerHTML = "";

          return {
            layout_ops_per_sec: layoutOps,
            style_recalc_ops_per_sec: styleOps,
            dropped_frame_pct: droppedPct,
            pipeline_score: pipelineScore,
          };
        },
      });

      const metrics = utils.buildMetricMap(protocolResult.samples, this.metricDefs);

      return {
        metrics: metrics,
        samples: protocolResult.samples,
        metadata: {
          benchmark: "css",
          phases: ["layout", "style", "compositor"],
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

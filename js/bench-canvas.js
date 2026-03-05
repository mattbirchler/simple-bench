(function () {
  const utils = window.SimpleBench.utils;

  function createSpriteAtlas() {
    const atlas = typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(64, 64)
      : document.createElement("canvas");
    atlas.width = 64;
    atlas.height = 64;
    const c = atlas.getContext("2d");
    const grad = c.createRadialGradient(32, 32, 6, 32, 32, 30);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.3, "#00ffff");
    grad.addColorStop(1, "#002233");
    c.fillStyle = grad;
    c.beginPath();
    c.arc(32, 32, 30, 0, Math.PI * 2);
    c.fill();
    return atlas;
  }

  function acquireMeasuredContext(sandbox) {
    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(800, 600);
      return { ctx: canvas.getContext("2d"), path: "offscreen" };
    }
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;
    sandbox.innerHTML = "";
    sandbox.appendChild(canvas);
    return { ctx: canvas.getContext("2d"), path: "dom_canvas" };
  }

  function runCanvasWorkload(ctx2d, rng, atlas, durationMs) {
    const frameTimes = [];
    let drawCalls = 0;
    let frames = 0;

    const start = performance.now();
    while (performance.now() - start < durationMs) {
      const frameStart = performance.now();

      ctx2d.clearRect(0, 0, 800, 600);

      for (let i = 0; i < 45; i++) {
        const x = rng() * 800;
        const y = rng() * 600;
        const r = 6 + rng() * 40;
        ctx2d.beginPath();
        ctx2d.arc(x, y, r, 0, Math.PI * 2);
        ctx2d.strokeStyle = i % 2 ? "#00ffff66" : "#ff005566";
        ctx2d.lineWidth = 1 + rng() * 2;
        ctx2d.stroke();
        drawCalls += 2;
      }

      for (let i = 0; i < 260; i++) {
        const x = rng() * 780;
        const y = rng() * 580;
        const s = 8 + rng() * 24;
        ctx2d.drawImage(atlas, x, y, s, s);
        drawCalls++;
      }

      ctx2d.fillStyle = "#a0a0a0";
      ctx2d.font = "12px Space Mono, monospace";
      for (let i = 0; i < 28; i++) {
        ctx2d.fillText("SB2 " + (i * 7), 8 + (i % 7) * 110, 20 + Math.floor(i / 7) * 18);
        drawCalls++;
      }

      const frameMs = performance.now() - frameStart;
      frameTimes.push(frameMs);
      frames++;
    }

    const elapsed = performance.now() - start;
    return {
      draw_calls_per_sec: drawCalls / (elapsed / 1000),
      ms_per_frame_p50: utils.percentile(frameTimes, 0.5),
      ms_per_frame_p95: utils.percentile(frameTimes, 0.95),
      frame_count: frames,
    };
  }

  window.SimpleBench.benchmarks.canvas = {
    id: "canvas",
    name: "Canvas 2D Rendering",
    category: "graphics",
    primaryMetric: "draw_calls_per_sec",
    cvThreshold: 0.05,
    metricDefs: {
      draw_calls_per_sec: { unit: "calls/s", direction: "higher_is_better" },
      ms_per_frame_p50: { unit: "ms", direction: "lower_is_better" },
      ms_per_frame_p95: { unit: "ms", direction: "lower_is_better" },
    },

    run: async function (ctx) {
      const acquired = acquireMeasuredContext(ctx.sandbox);
      const atlas = createSpriteAtlas();
      const seedBase = ctx.seed + ":canvas:";

      const protocolResult = await utils.runSamplingProtocol({
        warmup: ctx.warmup,
        measured: ctx.measured,
        maxReruns: 1,
        cvThreshold: this.cvThreshold,
        primaryMetric: this.primaryMetric,
        onProgress: ctx.onProgress,
        measureSample: async ({ sampleIndex }) => {
          const rng = utils.createRng(utils.hashString(seedBase + sampleIndex));
          return runCanvasWorkload(acquired.ctx, rng, atlas, 1200);
        },
      });

      const metrics = utils.buildMetricMap(protocolResult.samples, this.metricDefs);
      const warnings = protocolResult.warnings.slice();
      if (acquired.path !== "offscreen") {
        warnings.unshift("OffscreenCanvas unavailable; using DOM canvas fallback (cross-device comparisons may shift).");
      }

      return {
        metrics: metrics,
        samples: protocolResult.samples,
        metadata: {
          benchmark: "canvas",
          render_path: acquired.path,
          fixed_resolution: ctx.fixedResolution,
        },
        warnings: warnings,
        unstable: protocolResult.unstable,
        primaryMetric: this.primaryMetric,
      };
    },

    cleanup: function (sandbox) {
      if (sandbox) sandbox.innerHTML = "";
    },
  };
})();

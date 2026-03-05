(function () {
  const sandbox = document.getElementById("bench-sandbox");
  const WIDTH = 800;
  const HEIGHT = 600;
  const SPRITE_COUNT = 4500;
  const TARGET_FRAMES = 1500;
  const WARMUP_FRAMES = 50;

  function initSprites() {
    const sprites = [];
    for (let i = 0; i < SPRITE_COUNT; i++) {
      sprites.push({
        x: Math.random() * WIDTH,
        y: Math.random() * HEIGHT,
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 0.5) * 6,
        r: 4 + Math.random() * 8,
        color: `hsl(${Math.random() * 360}, 70%, 60%)`,
      });
    }
    return sprites;
  }

  function renderFrame(ctx, sprites, w, h) {
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < sprites.length; i++) {
      const s = sprites[i];
      s.x += s.vx;
      s.y += s.vy;
      if (s.x - s.r < 0 || s.x + s.r > WIDTH) s.vx *= -1;
      if (s.y - s.r < 0 || s.y + s.r > HEIGHT) s.vy *= -1;
      ctx.beginPath();
      ctx.arc(s.x * (w / WIDTH), s.y * (h / HEIGHT), s.r * (w / WIDTH), 0, Math.PI * 2);
      ctx.fillStyle = s.color;
      ctx.fill();
    }
  }

  window.SimpleBench.benchmarks.canvas = {
    name: "Canvas 2D Rendering",
    description: "Render 1,500 frames of 4,500 arc sprites — measured via rAF actual draw throughput",

    _preview: null,

    run: async function (onProgress) {
      // Create visible preview
      const preview = document.createElement("div");
      preview.className = "bench-preview";
      const previewW = Math.min(320, window.innerWidth - 40);
      const previewH = Math.round(previewW * 0.6);
      preview.innerHTML = `
        <div class="bench-preview-header">
          <span class="bench-preview-label">CANVAS 2D // LIVE</span>
          <span class="bench-preview-stats" id="canvas-stats">---</span>
        </div>
        <canvas id="canvas-preview-el" width="${previewW * window.devicePixelRatio}" height="${previewH * window.devicePixelRatio}" style="width:${previewW}px;height:${previewH}px"></canvas>
        <div class="bench-preview-scanlines"></div>
      `;
      document.body.appendChild(preview);
      this._preview = preview;

      const visCanvas = document.getElementById("canvas-preview-el");
      const visCtx = visCanvas.getContext("2d");
      const statsDisplay = document.getElementById("canvas-stats");

      // Also keep sandbox canvas for benchmark integrity
      const benchCanvas = document.createElement("canvas");
      benchCanvas.width = WIDTH;
      benchCanvas.height = HEIGHT;
      sandbox.appendChild(benchCanvas);
      const benchCtx = benchCanvas.getContext("2d");

      const sprites = initSprites();

      // Warmup on bench canvas
      for (let f = 0; f < WARMUP_FRAMES; f++) {
        renderFrame(benchCtx, sprites, WIDTH, HEIGHT);
      }
      await new Promise((r) => setTimeout(r, 0));

      // Measured run via rAF
      return new Promise((resolve) => {
        let framesRendered = 0;
        const wallStart = performance.now();
        let lastStatsUpdate = wallStart;
        let statsFrameCount = 0;

        function tick() {
          const frameStart = performance.now();

          const BATCH = 5;
          for (let b = 0; b < BATCH && framesRendered < TARGET_FRAMES; b++) {
            renderFrame(benchCtx, sprites, WIDTH, HEIGHT);
            framesRendered++;
          }

          // Mirror to visible preview (render once at current sprite positions)
          renderFrame(visCtx, sprites, visCanvas.width, visCanvas.height);

          const now = performance.now();
          statsFrameCount++;

          if (now - lastStatsUpdate > 400) {
            const liveFps = Math.round(framesRendered / ((now - wallStart) / 1000));
            statsDisplay.textContent = liveFps + " frames/s";
            lastStatsUpdate = now;
            statsFrameCount = 0;
          }

          onProgress(framesRendered / TARGET_FRAMES);

          if (framesRendered < TARGET_FRAMES) {
            requestAnimationFrame(tick);
          } else {
            const wallElapsed = (performance.now() - wallStart) / 1000;
            const fps = TARGET_FRAMES / wallElapsed;
            resolve({ rawScore: fps, unit: "frames/s" });
          }
        }

        requestAnimationFrame(tick);
      });
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
      return (rawScore / 500) * 100;
    },
  };
})();

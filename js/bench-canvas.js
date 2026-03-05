(function () {
  const sandbox = document.getElementById("bench-sandbox");
  const WIDTH = 800;
  const HEIGHT = 600;
  const SPRITE_COUNT = 4500;
  const TARGET_FRAMES = 1500;

  window.SimpleBench.benchmarks.canvas = {
    name: "Canvas 2D Rendering",
    description: "Render 1,500 frames of 4,500 arc sprites — raw draw throughput",

    run: async function (onProgress) {
      const canvas = document.createElement("canvas");
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      sandbox.appendChild(canvas);
      const ctx = canvas.getContext("2d");

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

      // Render frames synchronously in batches, yielding for progress updates
      const BATCH = 25;
      const start = performance.now();
      let framesRendered = 0;

      while (framesRendered < TARGET_FRAMES) {
        const batchEnd = Math.min(framesRendered + BATCH, TARGET_FRAMES);
        for (let f = framesRendered; f < batchEnd; f++) {
          ctx.clearRect(0, 0, WIDTH, HEIGHT);
          for (let i = 0; i < SPRITE_COUNT; i++) {
            const s = sprites[i];
            s.x += s.vx;
            s.y += s.vy;
            if (s.x - s.r < 0 || s.x + s.r > WIDTH) s.vx *= -1;
            if (s.y - s.r < 0 || s.y + s.r > HEIGHT) s.vy *= -1;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fillStyle = s.color;
            ctx.fill();
          }
        }
        framesRendered = batchEnd;
        onProgress(framesRendered / TARGET_FRAMES);
        await new Promise((r) => setTimeout(r, 0));
      }

      const elapsed = (performance.now() - start) / 1000;
      const fps = TARGET_FRAMES / elapsed;

      return { rawScore: fps, unit: "frames/s" };
    },

    cleanup: function () {},

    normalize: function (rawScore) {
      // Baseline: 500 frames/sec = score of 100
      return (rawScore / 500) * 100;
    },
  };
})();

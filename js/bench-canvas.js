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

  function renderFrame(ctx, sprites) {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    for (let i = 0; i < sprites.length; i++) {
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

  window.SimpleBench.benchmarks.canvas = {
    name: "Canvas 2D Rendering",
    description: "Render 1,500 frames of 4,500 arc sprites — measured via rAF actual draw throughput",

    run: async function (onProgress) {
      const canvas = document.createElement("canvas");
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      sandbox.appendChild(canvas);
      const ctx = canvas.getContext("2d");

      const sprites = initSprites();

      // Warmup frames — let JIT optimize
      for (let f = 0; f < WARMUP_FRAMES; f++) {
        renderFrame(ctx, sprites);
      }
      await new Promise((r) => setTimeout(r, 0));

      // Use rAF to measure actual presented frames
      return new Promise((resolve) => {
        let framesRendered = 0;
        let totalDrawTime = 0;
        const wallStart = performance.now();

        function tick() {
          const frameStart = performance.now();

          // Render a batch of draw calls per rAF to stress throughput
          const BATCH = 5;
          for (let b = 0; b < BATCH && framesRendered < TARGET_FRAMES; b++) {
            renderFrame(ctx, sprites);
            framesRendered++;
          }

          totalDrawTime += performance.now() - frameStart;
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

    cleanup: function () {},

    normalize: function (rawScore) {
      // Baseline: 500 frames/sec = score of 100
      return (rawScore / 500) * 100;
    },
  };
})();

(function () {
  const sandbox = document.getElementById("bench-sandbox");
  const LAYOUT_ELEMENTS = 1500;
  const LAYOUT_ITERATIONS = 600;
  const STYLE_ELEMENTS = 900;
  const STYLE_ITERATIONS = 1500;
  const VIS_BLOCKS = 40;

  function buildLayoutTree(container) {
    let parent = container;
    let count = 0;
    const depth = 5;
    const perLevel = Math.ceil(LAYOUT_ELEMENTS / depth);

    for (let d = 0; d < depth; d++) {
      const wrapper = document.createElement("div");
      wrapper.style.display = d % 2 === 0 ? "flex" : "grid";
      wrapper.style.flexDirection = "row";
      wrapper.style.gridTemplateColumns = "repeat(auto-fill, 50px)";
      wrapper.style.padding = "2px";
      for (let i = 0; i < perLevel && count < LAYOUT_ELEMENTS; i++, count++) {
        const child = document.createElement("div");
        child.className = "layout-item";
        child.style.width = "40px";
        child.style.height = "20px";
        child.style.background = "#333";
        child.style.margin = "1px";
        wrapper.appendChild(child);
      }
      parent.appendChild(wrapper);
      parent = wrapper;
    }
  }

  window.SimpleBench.benchmarks.css = {
    name: "CSS Layout & Animation",
    description: "600 forced reflows on 1,500 nested flex/grid elements + 1,500 style recalcs on 900 elements",

    _preview: null,

    run: async function (onProgress) {
      // Create preview with mini blocks
      const preview = document.createElement("div");
      preview.className = "bench-preview";
      let blocksHTML = "";
      const colors = ["#00ffff", "#ff0055", "#00ff41", "#ffff00", "#8800ff"];
      for (let i = 0; i < VIS_BLOCKS; i++) {
        const col = colors[i % colors.length];
        const size = 8 + Math.random() * 16;
        blocksHTML += '<div class="css-mini-block" id="cssb-' + i + '" style="' +
          "width:" + size + "px;height:" + size + "px;" +
          "left:" + (Math.random() * 230) + "px;" +
          "top:" + (Math.random() * 100) + "px;" +
          "border-color:" + col + ";" +
          "background:" + col + "22;" +
          '"></div>';
      }
      preview.innerHTML = `
        <div class="bench-preview-header">
          <span class="bench-preview-label">CSS LAYOUT // LIVE</span>
          <span class="bench-preview-stats" id="css-stats">PHASE 1: REFLOW</span>
        </div>
        <div class="bench-preview-body">
          <div class="css-mini-viewport">${blocksHTML}</div>
        </div>
        <div class="bench-preview-scanlines"></div>
      `;
      document.body.appendChild(preview);
      this._preview = preview;

      const statsDisplay = document.getElementById("css-stats");
      const visBlocks = [];
      for (let i = 0; i < VIS_BLOCKS; i++) {
        visBlocks.push(document.getElementById("cssb-" + i));
      }

      // Phase 1: Layout thrash
      const layoutContainer = document.createElement("div");
      sandbox.appendChild(layoutContainer);
      buildLayoutTree(layoutContainer);

      const wrappers = layoutContainer.querySelectorAll("div[style]");
      let layoutElapsed = 0;

      for (let i = 0; i < LAYOUT_ITERATIONS; i++) {
        const start = performance.now();
        for (let j = 0; j < wrappers.length; j++) {
          const w = wrappers[j];
          w.style.flexDirection = i % 2 === 0 ? "column" : "row";
          w.style.justifyContent = i % 3 === 0 ? "center" : "flex-start";
          w.style.gridTemplateColumns =
            i % 2 === 0 ? "repeat(auto-fill, 60px)" : "repeat(auto-fill, 40px)";
        }
        layoutContainer.offsetHeight;
        layoutElapsed += performance.now() - start;

        if (i % 20 === 0) {
          onProgress((i / LAYOUT_ITERATIONS) * 0.5);
          statsDisplay.textContent = "REFLOW " + i + "/" + LAYOUT_ITERATIONS;

          // Animate mini blocks — shuffle positions
          for (let b = 0; b < visBlocks.length; b++) {
            const col = i % 2 === 0;
            visBlocks[b].style.left = (col ? (b % 10) * 25 : Math.random() * 230) + "px";
            visBlocks[b].style.top = (col ? Math.floor(b / 10) * 28 : Math.random() * 100) + "px";
          }

          await new Promise((r) => setTimeout(r, 0));
        }
      }

      const layoutOps = (LAYOUT_ITERATIONS / layoutElapsed) * 1000;
      sandbox.innerHTML = "";

      // Phase 2: Style recalculation
      statsDisplay.textContent = "PHASE 2: STYLE RECALC";
      const styleContainer = document.createElement("div");
      styleContainer.style.position = "relative";
      styleContainer.style.width = "800px";
      styleContainer.style.height = "600px";
      sandbox.appendChild(styleContainer);

      const divs = [];
      for (let i = 0; i < STYLE_ELEMENTS; i++) {
        const div = document.createElement("div");
        div.style.position = "absolute";
        div.style.width = "20px";
        div.style.height = "20px";
        div.style.background = "#333";
        div.style.left = Math.random() * 780 + "px";
        div.style.top = Math.random() * 580 + "px";
        styleContainer.appendChild(div);
        divs.push(div);
      }

      let styleElapsed = 0;

      for (let i = 0; i < STYLE_ITERATIONS; i++) {
        const start = performance.now();
        for (let j = 0; j < divs.length; j++) {
          const d = divs[j];
          d.style.transform = `translate(${Math.sin(i + j) * 20}px, ${Math.cos(i + j) * 20}px) rotate(${i * 2}deg)`;
          d.style.backgroundColor = i % 2 === 0 ? "#444" : "#222";
          d.style.width = (18 + (i % 4)) + "px";
        }
        styleContainer.offsetHeight;
        styleElapsed += performance.now() - start;

        if (i % 50 === 0) {
          onProgress(0.5 + (i / STYLE_ITERATIONS) * 0.5);
          statsDisplay.textContent = "RECALC " + i + "/" + STYLE_ITERATIONS;

          // Animate mini blocks with transforms
          for (let b = 0; b < visBlocks.length; b++) {
            visBlocks[b].style.transform = "translate(" +
              (Math.sin(i + b) * 15) + "px," +
              (Math.cos(i + b) * 10) + "px) rotate(" + (i * 3) + "deg)";
            const w = 8 + (i % 6) + Math.random() * 10;
            visBlocks[b].style.width = w + "px";
            visBlocks[b].style.height = w + "px";
          }

          await new Promise((r) => setTimeout(r, 0));
        }
      }

      const styleOps = (STYLE_ITERATIONS / styleElapsed) * 1000;
      const rawScore = layoutOps * 0.4 + styleOps * 0.6;
      statsDisplay.textContent = rawScore.toFixed(0) + " ops/s";

      return { rawScore, unit: "ops/s" };
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
      return (rawScore / 1500) * 100;
    },
  };
})();

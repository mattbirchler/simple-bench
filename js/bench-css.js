(function () {
  const sandbox = document.getElementById("bench-sandbox");
  const LAYOUT_ELEMENTS = 1500;
  const LAYOUT_ITERATIONS = 600;
  const STYLE_ELEMENTS = 900;
  const STYLE_ITERATIONS = 1500;

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

    run: async function (onProgress) {
      // Phase 1: Layout thrash — toggle flex/grid properties and force reflow
      const layoutContainer = document.createElement("div");
      sandbox.appendChild(layoutContainer);
      buildLayoutTree(layoutContainer);

      const wrappers = layoutContainer.querySelectorAll("div[style]");
      const start1 = performance.now();

      for (let i = 0; i < LAYOUT_ITERATIONS; i++) {
        for (let j = 0; j < wrappers.length; j++) {
          const w = wrappers[j];
          w.style.flexDirection = i % 2 === 0 ? "column" : "row";
          w.style.justifyContent = i % 3 === 0 ? "center" : "flex-start";
          w.style.gridTemplateColumns =
            i % 2 === 0 ? "repeat(auto-fill, 60px)" : "repeat(auto-fill, 40px)";
        }
        // Force synchronous reflow
        layoutContainer.offsetHeight;

        if (i % 20 === 0) {
          onProgress((i / LAYOUT_ITERATIONS) * 0.5);
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      const layoutTime = performance.now() - start1;
      const layoutOps = (LAYOUT_ITERATIONS / layoutTime) * 1000;

      sandbox.innerHTML = "";

      // Phase 2: Style recalculation throughput — change transforms + colors, force reflow
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

      const start2 = performance.now();

      for (let i = 0; i < STYLE_ITERATIONS; i++) {
        for (let j = 0; j < divs.length; j++) {
          const d = divs[j];
          d.style.transform = `translate(${Math.sin(i + j) * 20}px, ${Math.cos(i + j) * 20}px) rotate(${i * 2}deg)`;
          d.style.backgroundColor = i % 2 === 0 ? "#444" : "#222";
          d.style.width = (18 + (i % 4)) + "px";
        }
        // Force synchronous style recalculation + layout
        styleContainer.offsetHeight;

        if (i % 50 === 0) {
          onProgress(0.5 + (i / STYLE_ITERATIONS) * 0.5);
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      const styleTime = performance.now() - start2;
      const styleOps = (STYLE_ITERATIONS / styleTime) * 1000;

      // Weighted composite: layout (40%) + style recalc (60%)
      const rawScore = layoutOps * 0.4 + styleOps * 0.6;

      return { rawScore, unit: "ops/s" };
    },

    cleanup: function () {},

    normalize: function (rawScore) {
      // Baseline: 1500 ops/s = score of 100
      return (rawScore / 1500) * 100;
    },
  };
})();

window.SimpleBench = { benchmarks: {} };

(function () {
  const benchOrder = ["dom", "canvas", "compute", "css", "async"];
  const results = {};
  let running = false;

  const runAllBtn = document.getElementById("run-all-btn");
  const compositeScoreEl = document.getElementById("composite-score");
  const compositeProgressEl = document.getElementById("composite-progress");
  const sandbox = document.getElementById("bench-sandbox");

  // Glitch characters for score corruption effect
  const GLITCH_CHARS = "█▓▒░╪╫╬╧╨╩╦╤╥╙╘╗╖╕╔╓╒║═╏╎╍╌";

  function getEls(id) {
    return {
      card: document.querySelector(`.bench-card[data-bench="${id}"]`),
      score: document.querySelector(`[data-score-for="${id}"]`),
      unit: document.querySelector(`[data-unit-for="${id}"]`),
      progress: document.querySelector(`[data-progress-for="${id}"]`),
      btn: document.querySelector(`[data-run="${id}"]`),
    };
  }

  function setAllButtons(disabled) {
    runAllBtn.disabled = disabled;
    benchOrder.forEach((id) => {
      getEls(id).btn.disabled = disabled;
    });
  }

  // Corrupted score animation — numbers glitch through random characters before settling
  function animateScore(el, target, isComposite) {
    const duration = 600;
    const corruptPhase = 0.6; // first 60% is corruption
    const start = performance.now();
    const targetStr = String(Math.round(target));

    function tick(now) {
      const t = Math.min((now - start) / duration, 1);

      if (t < corruptPhase) {
        // Corruption phase: random glitch chars with occasional real numbers
        const corruptT = t / corruptPhase;
        let display = "";
        for (let i = 0; i < targetStr.length; i++) {
          if (Math.random() < corruptT * 0.5) {
            display += targetStr[i];
          } else {
            display += GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
          }
        }
        el.textContent = display;
      } else {
        // Resolve phase: smooth number count-up with occasional glitch
        const resolveT = (t - corruptPhase) / (1 - corruptPhase);
        const current = Math.round(target * resolveT);
        let display = String(current);
        // Occasional character corruption during resolve
        if (Math.random() < (1 - resolveT) * 0.3) {
          const pos = Math.floor(Math.random() * display.length);
          display = display.substring(0, pos) +
            GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)] +
            display.substring(pos + 1);
        }
        el.textContent = display;
      }

      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        el.textContent = targetStr;
        if (isComposite) {
          el.setAttribute("data-text", targetStr);
          el.classList.add("has-score");
        }
        // Spawn accent burst on score settle
        spawnBurst(el);
      }
    }
    requestAnimationFrame(tick);
  }

  // Random color burst effect near an element
  function spawnBurst(targetEl) {
    const colors = ["#ff0055", "#00ffff", "#00ff41", "#ffff00"];
    const rect = targetEl.getBoundingClientRect();
    const burst = document.createElement("div");
    burst.className = "accent-burst";
    const size = 30 + Math.random() * 60;
    burst.style.width = size + "px";
    burst.style.height = size + "px";
    burst.style.borderRadius = Math.random() > 0.5 ? "50%" : "0";
    burst.style.background = colors[Math.floor(Math.random() * colors.length)];
    burst.style.left = (rect.left + rect.width / 2 - size / 2 + (Math.random() - 0.5) * 40) + "px";
    burst.style.top = (rect.top + rect.height / 2 - size / 2 + (Math.random() - 0.5) * 20) + "px";
    document.body.appendChild(burst);
    burst.addEventListener("animationend", () => burst.remove());
  }

  function updateComposite() {
    const scores = benchOrder.map((id) => results[id]).filter((s) => s != null && s > 0);
    if (scores.length === 0) return;
    // Geometric mean — appropriate for combining normalized scores with different scales
    const geoMean = Math.pow(
      scores.reduce((product, s) => product * s, 1),
      1 / scores.length
    );
    const display = Math.round(geoMean);
    animateScore(compositeScoreEl, display, true);
    compositeProgressEl.style.width = Math.min(geoMean, 120) / 1.2 + "%";
  }

  async function runBenchmark(id) {
    const bench = window.SimpleBench.benchmarks[id];
    if (!bench) return;
    const els = getEls(id);

    els.card.classList.remove("complete");
    els.card.classList.add("running");
    els.btn.classList.add("running-spinner");
    els.score.textContent = "---";
    els.unit.textContent = "";
    els.progress.style.width = "0%";

    sandbox.innerHTML = "";

    try {
      const result = await bench.run((progress) => {
        els.progress.style.width = (progress * 100) + "%";
      });

      const normalized = bench.normalize(result.rawScore);
      results[id] = normalized;

      els.progress.style.width = "100%";
      animateScore(els.score, Math.round(normalized), false);
      els.unit.textContent = result.unit;
      els.card.classList.add("complete");
    } catch (e) {
      els.score.textContent = "ERR";
      console.error(`Benchmark ${id} failed:`, e);
    }

    els.card.classList.remove("running");
    els.btn.classList.remove("running-spinner");
    bench.cleanup();
    sandbox.innerHTML = "";
    updateComposite();
  }

  async function runAll() {
    if (running) return;
    running = true;
    setAllButtons(true);
    compositeScoreEl.textContent = "--";
    compositeScoreEl.setAttribute("data-text", "--");
    compositeScoreEl.classList.remove("has-score");
    compositeProgressEl.style.width = "0%";

    for (const id of benchOrder) {
      results[id] = undefined;
    }

    for (const id of benchOrder) {
      await runBenchmark(id);
    }

    setAllButtons(false);
    running = false;
  }

  runAllBtn.addEventListener("click", runAll);

  benchOrder.forEach((id) => {
    const els = getEls(id);
    els.btn.addEventListener("click", async () => {
      if (running) return;
      running = true;
      setAllButtons(true);
      await runBenchmark(id);
      setAllButtons(false);
      running = false;
    });
  });

  // ---- Info modal ----
  const benchExplanations = {
    dom: "Every time a webpage updates \u2014 loading emails, refreshing a feed, filtering a table \u2014 the browser creates and destroys thousands of elements. This test hammers that pipeline to measure how fast your browser can churn through real page updates.",
    canvas: "Maps, data visualizations, browser games, and image editors all rely on Canvas drawing. This test floods the 2D renderer with thousands of shapes per frame to measure your browser\u2019s raw graphics throughput.",
    compute: "JavaScript powers everything from spreadsheet formulas to AI inference in the browser. This test runs heavy number-crunching, sorting, and data parsing to measure your engine\u2019s raw computational muscle.",
    css: "Scrolling, resizing windows, and opening menus all force the browser to recalculate layout. Complex sites with flexbox and grid layouts amplify this cost. This test stress-tests how fast your browser reflows and repaints under pressure.",
    async: "Modern sites offload heavy work to background threads so the UI stays smooth. This test measures how well your browser parallelizes across CPU cores and how steady your animation frame rate stays under load.",
  };

  const modal = document.getElementById("info-modal");
  const modalBody = document.getElementById("modal-body");
  const modalClose = document.getElementById("modal-close");

  function openModal(benchId) {
    modalBody.textContent = benchExplanations[benchId] || "";
    modal.hidden = false;
  }

  function closeModal() {
    modal.hidden = true;
  }

  modalClose.addEventListener("click", closeModal);
  modal.addEventListener("click", function (e) {
    if (e.target === modal) closeModal();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !modal.hidden) closeModal();
  });

  document.querySelectorAll("[data-info]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      openModal(btn.getAttribute("data-info"));
    });
  });

  // ---- Ambient glitch: occasional random screen tear ----
  function randomScreenTear() {
    if (running) {
      const tear = document.createElement("div");
      tear.style.cssText = `
        position: fixed;
        left: 0; right: 0;
        height: ${2 + Math.random() * 8}px;
        top: ${Math.random() * 100}%;
        background: rgba(${Math.random() > 0.5 ? "255,0,85" : "0,255,255"}, 0.15);
        pointer-events: none;
        z-index: 9997;
        mix-blend-mode: screen;
      `;
      document.body.appendChild(tear);
      setTimeout(() => tear.remove(), 80 + Math.random() * 120);
    }
    setTimeout(randomScreenTear, 200 + Math.random() * 1500);
  }
  randomScreenTear();
})();

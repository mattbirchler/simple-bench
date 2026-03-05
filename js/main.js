window.SimpleBench = { benchmarks: {} };

(function () {
  const benchOrder = ["dom", "canvas", "compute", "css", "async", "webgl"];
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
    const bmBtn = document.getElementById("bench-mode-btn");
    if (bmBtn) bmBtn.disabled = disabled;
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
    webgl: "3D maps, browser games, product viewers, and GPU-accelerated effects all use WebGL. This test renders thousands of lit triangles with procedural noise, dynamic lighting, and a bloom post-process pass to stress your GPU\u2019s fill rate, shader units, and memory bandwidth.",
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

  // ---- Benchmark Mode ----
  let benchLoops = 5;
  let cooldownSecs = 30;
  const benchModeBtn = document.getElementById("bench-mode-btn");
  const loopCountEl = document.getElementById("loop-count");
  const loopDecBtn = document.getElementById("loop-dec");
  const loopIncBtn = document.getElementById("loop-inc");
  const coolCountEl = document.getElementById("cool-count");
  const coolDecBtn = document.getElementById("cool-dec");
  const coolIncBtn = document.getElementById("cool-inc");

  loopDecBtn.addEventListener("click", function () {
    if (benchLoops > 1) {
      benchLoops--;
      loopCountEl.textContent = benchLoops;
    }
  });
  loopIncBtn.addEventListener("click", function () {
    if (benchLoops < 10) {
      benchLoops++;
      loopCountEl.textContent = benchLoops;
    }
  });
  coolDecBtn.addEventListener("click", function () {
    if (cooldownSecs > 1) {
      cooldownSecs = Math.max(1, cooldownSecs - 5);
      coolCountEl.textContent = cooldownSecs;
    }
  });
  coolIncBtn.addEventListener("click", function () {
    if (cooldownSecs < 60) {
      cooldownSecs = Math.min(60, cooldownSecs + 5);
      coolCountEl.textContent = cooldownSecs;
    }
  });
  const benchModeOverlay = document.getElementById("bench-mode-overlay");
  const benchModePhase = document.getElementById("bench-mode-phase");
  const benchModeDetail = document.getElementById("bench-mode-detail");
  const benchModeProgress = document.getElementById("bench-mode-progress");
  const benchModeProgressLabel = document.getElementById("bench-mode-progress-label");
  const benchModeCooldown = document.getElementById("bench-mode-cooldown");
  const benchModeCooldownTimer = document.getElementById("bench-mode-cooldown-timer");
  const benchModeCooldownFill = document.getElementById("bench-mode-cooldown-fill");
  const benchModeCancel = document.getElementById("bench-mode-cancel");
  const benchResultsOverlay = document.getElementById("bench-results-overlay");
  const benchResultsBody = document.getElementById("bench-results-body");
  const benchResultsClose = document.getElementById("bench-results-close");
  const benchResultsCsv = document.getElementById("bench-results-csv");
  const benchResultsCopy = document.getElementById("bench-results-copy");

  let benchModeCancelled = false;
  let benchModeData = null; // stored for CSV download

  const benchNames = {
    dom: "DOM Manipulation",
    canvas: "Canvas 2D Rendering",
    compute: "JavaScript Compute",
    css: "CSS Layout & Animation",
    async: "Async & Concurrency",
    webgl: "WebGL GPU Rendering",
  };

  function cooldown(seconds) {
    return new Promise((resolve) => {
      benchModeCooldown.hidden = false;
      benchModeCooldownTimer.textContent = seconds;
      benchModeCooldownFill.style.transition = "none";
      benchModeCooldownFill.style.width = "100%";
      // Force reflow so transition reset takes effect
      benchModeCooldownFill.offsetWidth;
      benchModeCooldownFill.style.transition = "width 1s linear";

      let remaining = seconds;
      const interval = setInterval(() => {
        if (benchModeCancelled) {
          clearInterval(interval);
          benchModeCooldown.hidden = true;
          resolve();
          return;
        }
        remaining--;
        benchModeCooldownTimer.textContent = remaining;
        benchModeCooldownFill.style.width = ((remaining / seconds) * 100) + "%";
        if (remaining <= 0) {
          clearInterval(interval);
          benchModeCooldown.hidden = true;
          resolve();
        }
      }, 1000);
    });
  }

  async function runBenchmarkMode() {
    if (running) return;
    running = true;
    benchModeCancelled = false;
    setAllButtons(true);
    benchModeBtn.disabled = true;

    benchModeOverlay.hidden = false;
    benchModeCooldown.hidden = true;

    // allResults[loop][benchId] = normalized score
    const allResults = [];
    const totalSteps = benchLoops * benchOrder.length;
    let currentStep = 0;

    for (let loop = 0; loop < benchLoops; loop++) {
      allResults.push({});

      for (let b = 0; b < benchOrder.length; b++) {
        if (benchModeCancelled) break;

        const id = benchOrder[b];
        benchModePhase.textContent = benchNames[id];
        benchModeDetail.textContent = "LOOP " + (loop + 1) + "/" + benchLoops + " \u2022 TEST " + (b + 1) + "/" + benchOrder.length;
        const pct = Math.round((currentStep / totalSteps) * 100);
        benchModeProgress.style.width = pct + "%";
        benchModeProgressLabel.textContent = pct + "%";

        await runBenchmark(id);
        allResults[loop][id] = results[id];
        currentStep++;

        if (benchModeCancelled) break;

        // Cooldown between tests (skip after the very last test)
        const isLast = (loop === benchLoops - 1 && b === benchOrder.length - 1);
        if (!isLast) {
          benchModePhase.textContent = "COOLDOWN";
          benchModeDetail.textContent = "THERMAL THROTTLE PREVENTION";
          await cooldown(cooldownSecs);
        }
      }

      if (benchModeCancelled) break;
    }

    benchModeProgress.style.width = "100%";
    benchModeProgressLabel.textContent = "100%";
    benchModeOverlay.hidden = true;

    setAllButtons(false);
    benchModeBtn.disabled = false;
    running = false;

    if (!benchModeCancelled) {
      showBenchmarkResults(allResults);
    }
  }

  function showBenchmarkResults(allResults) {
    const completedLoops = allResults.length;

    // Calculate averages
    const averages = {};
    benchOrder.forEach((id) => {
      const scores = allResults.map((loop) => loop[id]).filter((s) => s != null && s > 0);
      if (scores.length > 0) {
        averages[id] = scores.reduce((a, b) => a + b, 0) / scores.length;
      }
    });

    // Composite average (geometric mean of averages)
    const avgValues = benchOrder.map((id) => averages[id]).filter((s) => s != null && s > 0);
    const compositeAvg = avgValues.length > 0
      ? Math.pow(avgValues.reduce((p, s) => p * s, 1), 1 / avgValues.length)
      : 0;

    // Build results HTML
    let tableRows = "";
    benchOrder.forEach((id) => {
      let cells = '<td>' + benchNames[id] + '</td>';
      for (let loop = 0; loop < completedLoops; loop++) {
        const val = allResults[loop][id];
        cells += '<td class="num">' + (val != null ? Math.round(val) : "-") + '</td>';
      }
      cells += '<td class="num avg">' + (averages[id] != null ? Math.round(averages[id]) : "-") + '</td>';
      tableRows += '<tr>' + cells + '</tr>';
    });

    let loopHeaders = "";
    for (let i = 0; i < completedLoops; i++) {
      loopHeaders += '<th class="num">R' + (i + 1) + '</th>';
    }

    benchResultsBody.innerHTML =
      '<div class="bench-results-composite">' +
        '<div class="bench-results-composite-label">COMPOSITE AVERAGE</div>' +
        '<div class="bench-results-composite-score">' + Math.round(compositeAvg) + '</div>' +
      '</div>' +
      '<table class="bench-results-table">' +
        '<thead><tr><th>TEST</th>' + loopHeaders + '<th class="num">AVG</th></tr></thead>' +
        '<tbody>' + tableRows + '</tbody>' +
      '</table>';

    // Store data for CSV
    benchModeData = { allResults, averages, compositeAvg, completedLoops };

    benchResultsOverlay.hidden = false;
  }

  function buildCSV() {
    if (!benchModeData) return "";
    const { allResults, averages, completedLoops } = benchModeData;

    let csv = "Test";
    for (let i = 0; i < completedLoops; i++) {
      csv += ",Run " + (i + 1);
    }
    csv += ",Average\n";

    benchOrder.forEach((id) => {
      csv += benchNames[id];
      for (let loop = 0; loop < completedLoops; loop++) {
        const val = allResults[loop][id];
        csv += "," + (val != null ? val.toFixed(2) : "");
      }
      csv += "," + (averages[id] != null ? averages[id].toFixed(2) : "");
      csv += "\n";
    });

    return csv;
  }

  function downloadCSV() {
    const csv = buildCSV();
    if (!csv) return;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "simplebench-results-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function copyCSV() {
    const csv = buildCSV();
    if (!csv) return;
    navigator.clipboard.writeText(csv).then(function () {
      const inner = benchResultsCopy.querySelector(".btn-inner");
      inner.textContent = "COPIED";
      setTimeout(function () { inner.textContent = "COPY CSV"; }, 1500);
    });
  }

  benchModeBtn.addEventListener("click", runBenchmarkMode);
  benchModeCancel.addEventListener("click", function () {
    benchModeCancelled = true;
  });
  benchResultsClose.addEventListener("click", function () {
    benchResultsOverlay.hidden = true;
  });
  benchResultsOverlay.addEventListener("click", function (e) {
    if (e.target === benchResultsOverlay) benchResultsOverlay.hidden = true;
  });
  benchResultsCsv.addEventListener("click", downloadCSV);
  benchResultsCopy.addEventListener("click", copyCSV);

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

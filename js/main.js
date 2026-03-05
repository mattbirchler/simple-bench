window.SimpleBench = window.SimpleBench || { benchmarks: {} };

(function () {
  const utils = window.SimpleBench.utils;

  const baseBenchOrder = ["dom", "canvas", "compute", "css", "worker", "responsive", "webgl"];
  const categories = {
    ui_pipeline: { label: "UI PIPELINE", benches: ["dom", "css"] },
    graphics: { label: "GRAPHICS", benches: ["canvas", "webgl"] },
    compute: { label: "COMPUTE", benches: ["compute", "worker"] },
    responsiveness: { label: "RESPONSIVENESS", benches: ["responsive"] },
  };

  const results = {};
  let running = false;
  let runCounter = 0;
  let calibration = { version: "fallback", metrics: {} };
  let calibrationReady = Promise.resolve();

  const runAllBtn = document.getElementById("run-all-btn");
  const compositeScoreEl = document.getElementById("composite-score");
  const compositeProgressEl = document.getElementById("composite-progress");
  const sandbox = document.getElementById("bench-sandbox");

  const categoryEls = {
    ui_pipeline: document.querySelector('[data-category-score="ui_pipeline"]'),
    graphics: document.querySelector('[data-category-score="graphics"]'),
    compute: document.querySelector('[data-category-score="compute"]'),
    responsiveness: document.querySelector('[data-category-score="responsiveness"]'),
  };

  const GLITCH_CHARS = "█▓▒░╪╫╬╧╨╩╦╤╥╙╘╗╖╕╔╓╒║═╏╎╍╌";

  function getEls(id) {
    return {
      card: document.querySelector('.bench-card[data-bench="' + id + '"]'),
      score: document.querySelector('[data-score-for="' + id + '"]'),
      unit: document.querySelector('[data-unit-for="' + id + '"]'),
      raw: document.querySelector('[data-raw-for="' + id + '"]'),
      meta: document.querySelector('[data-meta-for="' + id + '"]'),
      progress: document.querySelector('[data-progress-for="' + id + '"]'),
      btn: document.querySelector('[data-run="' + id + '"]'),
    };
  }

  function rotateOrder(order, offset) {
    const n = order.length;
    const o = ((offset % n) + n) % n;
    return order.slice(o).concat(order.slice(0, o));
  }

  function safeRound(v, digits) {
    if (!Number.isFinite(v)) return "--";
    return v.toFixed(digits == null ? 2 : digits);
  }

  function setAllButtons(disabled) {
    runAllBtn.disabled = disabled;
    const bmBtn = document.getElementById("bench-mode-btn");
    if (bmBtn) bmBtn.disabled = disabled;
    baseBenchOrder.forEach(function (id) {
      const btn = getEls(id).btn;
      if (btn) btn.disabled = disabled;
    });
  }

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
    burst.addEventListener("animationend", function () { burst.remove(); });
  }

  function animateScore(el, target, isComposite) {
    const duration = 550;
    const corruptPhase = 0.6;
    const start = performance.now();
    const targetStr = String(Math.round(target));

    function tick(now) {
      const t = Math.min((now - start) / duration, 1);
      if (t < corruptPhase) {
        const corruptT = t / corruptPhase;
        let display = "";
        for (let i = 0; i < targetStr.length; i++) {
          if (Math.random() < corruptT * 0.5) display += targetStr[i];
          else display += GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
        }
        el.textContent = display;
      } else {
        const resolveT = (t - corruptPhase) / (1 - corruptPhase);
        const current = Math.round(target * resolveT);
        el.textContent = String(current);
      }

      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        el.textContent = targetStr;
        if (isComposite) {
          el.setAttribute("data-text", targetStr);
          el.classList.add("has-score");
        }
        spawnBurst(el);
      }
    }

    requestAnimationFrame(tick);
  }

  async function loadCalibration() {
    try {
      const res = await fetch("js/calibration/v2-baselines.json", { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      calibration = await res.json();
    } catch (e) {
      console.warn("Calibration file unavailable. Falling back to ad-hoc baselines.", e);
      calibration = { version: "fallback", metrics: {} };
    }
  }

  function normalizeMetric(benchId, metricKey, value, metricMeta) {
    if (!Number.isFinite(value) || value <= 0) return null;
    const calibKey = benchId + "." + metricKey;
    const entry = calibration.metrics && calibration.metrics[calibKey];

    if (!entry || !Number.isFinite(entry.baseline) || entry.baseline <= 0) {
      return null;
    }

    const direction = entry.direction || (metricMeta && metricMeta.direction) || "higher_is_better";
    if (direction === "lower_is_better") {
      return (entry.baseline / value) * 100;
    }
    return (value / entry.baseline) * 100;
  }

  function gm(values) {
    return utils.geomean(values.filter(function (v) { return Number.isFinite(v) && v > 0; }));
  }

  function updateComposite() {
    const categoryScores = {};

    Object.keys(categories).forEach(function (catId) {
      const ids = categories[catId].benches;
      const vals = ids
        .map(function (id) { return results[id] && results[id].normalized; })
        .filter(function (v) { return Number.isFinite(v) && v > 0; });
      const catScore = gm(vals);
      categoryScores[catId] = catScore > 0 ? catScore : null;
      if (categoryEls[catId]) {
        categoryEls[catId].textContent = catScore > 0 ? String(Math.round(catScore)) : "--";
      }
    });

    const overallValues = Object.keys(categoryScores)
      .map(function (k) { return categoryScores[k]; })
      .filter(function (v) { return Number.isFinite(v) && v > 0; });

    if (!overallValues.length) {
      compositeScoreEl.textContent = "--";
      compositeProgressEl.style.width = "0%";
      return;
    }

    const composite = gm(overallValues);
    animateScore(compositeScoreEl, Math.round(composite), true);
    compositeProgressEl.style.width = Math.min(120, composite) / 1.2 + "%";
  }

  function clearCard(id) {
    const els = getEls(id);
    if (!els.card) return;
    els.card.classList.remove("complete", "error", "unsupported", "unstable");
    els.score.textContent = "--";
    els.unit.textContent = "index";
    els.raw.textContent = "raw: --";
    els.meta.textContent = "cv: --";
    els.progress.style.width = "0%";
  }

  function resetAllCards() {
    baseBenchOrder.forEach(function (id) {
      clearCard(id);
      results[id] = null;
    });
    Object.keys(categoryEls).forEach(function (catId) {
      if (categoryEls[catId]) categoryEls[catId].textContent = "--";
    });
  }

  async function runBenchmark(id, seed, showSpinner) {
    const bench = window.SimpleBench.benchmarks[id];
    const els = getEls(id);
    if (!bench || !els.card) return null;

    els.card.classList.remove("complete", "error", "unsupported", "unstable");
    els.card.classList.add("running");
    if (showSpinner) els.btn.classList.add("running-spinner");
    els.score.textContent = "---";
    els.unit.textContent = "index";
    els.raw.textContent = "raw: --";
    els.meta.textContent = "sampling...";
    els.progress.style.width = "0%";

    sandbox.innerHTML = "";

    let record = null;

    try {
      await utils.waitForVisible();
      const runSeed = seed + ":" + id;
      const response = await bench.run({
        warmup: 1,
        measured: 3,
        seed: runSeed,
        fixedResolution: { width: 800, height: 600, dpr: 1 },
        sandbox: sandbox,
        onProgress: function (p) {
          els.progress.style.width = (Math.max(0, Math.min(1, p)) * 100).toFixed(1) + "%";
        },
      });
      await calibrationReady;

      const primaryMetric = response.primaryMetric || bench.primaryMetric;
      const primarySummary = response.metrics && response.metrics[primaryMetric];

      if (!primarySummary || !Number.isFinite(primarySummary.median)) {
        els.score.textContent = "SKIP";
        els.unit.textContent = "unsupported";
        els.raw.textContent = "raw: unsupported";
        els.meta.textContent = (response.warnings && response.warnings[0]) || "No primary metric";
        els.card.classList.add("unsupported");
        results[id] = null;

        record = {
          id: id,
          normalized: null,
          primaryMetric: primaryMetric,
          primaryUnit: primarySummary ? primarySummary.unit : "",
          primaryMedian: NaN,
          primarySamples: [],
          cv: NaN,
          unstable: false,
          unsupported: true,
        };
      } else {
        const normalized = normalizeMetric(id, primaryMetric, primarySummary.median, primarySummary);
        const cvPct = primarySummary.cv * 100;

        if (normalized == null) {
          els.score.textContent = "NA";
          els.unit.textContent = "index";
        } else {
          animateScore(els.score, Math.round(normalized), false);
          els.unit.textContent = "index";
        }

        els.raw.textContent = "raw: " + safeRound(primarySummary.median, 2) + " " + primarySummary.unit;
        els.meta.textContent = "cv: " + safeRound(cvPct, 1) + "% · n=" + primarySummary.samples.length;

        const unstable = !!response.unstable || cvPct > (bench.cvThreshold || 0.08) * 100;
        if (unstable) {
          els.card.classList.add("unstable");
          els.meta.textContent += " · unstable";
        }

        if (response.warnings && response.warnings.length) {
          els.meta.textContent += " · " + response.warnings[0];
        }

        els.card.classList.add("complete");
        results[id] = {
          normalized: normalized,
          category: bench.category,
        };

        record = {
          id: id,
          normalized: normalized,
          primaryMetric: primaryMetric,
          primaryUnit: primarySummary.unit,
          primaryMedian: primarySummary.median,
          primarySamples: primarySummary.samples || [],
          cv: primarySummary.cv,
          iqr: primarySummary.iqr,
          unstable: unstable,
          unsupported: false,
        };
      }
    } catch (e) {
      els.score.textContent = "ERR";
      els.unit.textContent = "index";
      els.raw.textContent = "raw: error";
      els.meta.textContent = e && e.message ? e.message : "Benchmark failed";
      els.card.classList.add("error");
      results[id] = null;
      console.error("Benchmark failed:", id, e);
    }

    els.progress.style.width = "100%";
    els.card.classList.remove("running");
    if (showSpinner) els.btn.classList.remove("running-spinner");
    if (bench.cleanup) bench.cleanup(sandbox);
    sandbox.innerHTML = "";

    updateComposite();

    return record;
  }

  let cooldownSecs = 8;
  function doCooldown(seconds) {
    return utils.sleep(seconds * 1000);
  }

  async function runAll() {
    if (running) return;
    running = true;
    setAllButtons(true);
    resetAllCards();

    compositeScoreEl.textContent = "--";
    compositeScoreEl.setAttribute("data-text", "--");
    compositeScoreEl.classList.remove("has-score");
    compositeProgressEl.style.width = "0%";

    const seed = "runall:" + Date.now() + ":" + runCounter;
    const order = rotateOrder(baseBenchOrder, runCounter);
    runCounter++;

    for (let i = 0; i < order.length; i++) {
      const id = order[i];
      await runBenchmark(id, seed, true);
      if (i < order.length - 1) {
        await doCooldown(cooldownSecs);
      }
    }

    setAllButtons(false);
    running = false;
  }

  runAllBtn.addEventListener("click", runAll);

  baseBenchOrder.forEach(function (id) {
    const els = getEls(id);
    if (!els.btn) return;
    els.btn.addEventListener("click", async function () {
      if (running) return;
      running = true;
      setAllButtons(true);
      const seed = "single:" + Date.now();
      await runBenchmark(id, seed, true);
      setAllButtons(false);
      running = false;
    });
  });

  const benchExplanations = {
    dom: "Mixed list mutation benchmark for insert/remove/reorder/class toggles and text updates with periodic forced layout reads.",
    canvas: "Canvas2D draw throughput test measured on fixed 800x600 surfaces with arcs, sprite blits, and text rendering.",
    compute: "Seeded deterministic compute mix: sieve, sort, matrix multiply, and JSON round-trip with min-duration timing loops.",
    css: "Three-phase pipeline test: layout invalidation, style recalculation, and compositor animation under concurrent JS pressure.",
    worker: "Parallel worker throughput sweep over worker counts [1,2,4,max] with throughput scaling and efficiency metrics.",
    responsive: "Main-thread responsiveness test under worker load and periodic CPU bursts; tracks event-loop lag, rAF jitter, and long tasks.",
    webgl: "Fixed-tier WebGL2 rendering stress test with weighted FPS and frame-time metrics, using GPU timer queries when available.",
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

  if (modalClose) {
    modalClose.addEventListener("click", closeModal);
  }
  if (modal) {
    modal.addEventListener("click", function (e) {
      if (e.target === modal) closeModal();
    });
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && modal && !modal.hidden) closeModal();
  });

  document.querySelectorAll("[data-info]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      openModal(btn.getAttribute("data-info"));
    });
  });

  let benchLoops = 5;

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
      cooldownSecs = Math.max(1, cooldownSecs - 1);
      coolCountEl.textContent = cooldownSecs;
    }
  });
  coolIncBtn.addEventListener("click", function () {
    if (cooldownSecs < 30) {
      cooldownSecs = Math.min(30, cooldownSecs + 1);
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
  let benchModeData = null;

  const benchNames = {
    dom: "DOM Manipulation",
    canvas: "Canvas 2D",
    compute: "JS Compute",
    css: "CSS Pipeline",
    worker: "Worker Throughput",
    responsive: "Responsiveness",
    webgl: "WebGL GPU",
  };

  function cooldownWithOverlay(seconds) {
    return new Promise(function (resolve) {
      benchModeCooldown.hidden = false;
      benchModeCooldownTimer.textContent = seconds;
      benchModeCooldownFill.style.transition = "none";
      benchModeCooldownFill.style.width = "100%";
      benchModeCooldownFill.offsetWidth;
      benchModeCooldownFill.style.transition = "width 1s linear";

      let remaining = seconds;
      const interval = setInterval(function () {
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

    resetAllCards();

    benchModeOverlay.hidden = false;
    benchModeCooldown.hidden = true;

    const allResults = [];
    const allDetails = [];
    const totalSteps = benchLoops * baseBenchOrder.length;
    let currentStep = 0;

    for (let loop = 0; loop < benchLoops; loop++) {
      allResults.push({});
      allDetails.push({});

      const order = rotateOrder(baseBenchOrder, loop);
      const seed = "benchmode:" + Date.now() + ":" + loop;

      for (let b = 0; b < order.length; b++) {
        if (benchModeCancelled) break;

        const id = order[b];
        benchModePhase.textContent = benchNames[id];
        benchModeDetail.textContent = "LOOP " + (loop + 1) + "/" + benchLoops + " • TEST " + (b + 1) + "/" + order.length;

        const pct = Math.round((currentStep / totalSteps) * 100);
        benchModeProgress.style.width = pct + "%";
        benchModeProgressLabel.textContent = pct + "%";

        const rec = await runBenchmark(id, seed, false);
        allDetails[loop][id] = rec;
        allResults[loop][id] = rec ? rec.normalized : null;

        currentStep++;

        if (benchModeCancelled) break;
        const isLast = loop === benchLoops - 1 && b === order.length - 1;
        if (!isLast) {
          benchModePhase.textContent = "COOLDOWN";
          benchModeDetail.textContent = "THERMAL STABILIZATION";
          await cooldownWithOverlay(cooldownSecs);
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
      showBenchmarkResults(allResults, allDetails);
    }
  }

  function showBenchmarkResults(allResults, allDetails) {
    const completedLoops = allResults.length;

    const averages = {};
    const avgCv = {};
    const unstableCounts = {};

    baseBenchOrder.forEach(function (id) {
      const vals = allResults
        .map(function (loop) { return loop[id]; })
        .filter(function (v) { return Number.isFinite(v) && v > 0; });
      averages[id] = vals.length ? (vals.reduce(function (a, b) { return a + b; }, 0) / vals.length) : null;

      const cvs = allDetails
        .map(function (loop) { return loop[id] && loop[id].cv; })
        .filter(function (v) { return Number.isFinite(v); });
      avgCv[id] = cvs.length ? (cvs.reduce(function (a, b) { return a + b; }, 0) / cvs.length) : null;

      unstableCounts[id] = allDetails.filter(function (loop) {
        return loop[id] && loop[id].unstable;
      }).length;
    });

    const compositeAvg = gm(baseBenchOrder.map(function (id) { return averages[id]; }));

    let loopHeaders = "";
    for (let i = 0; i < completedLoops; i++) {
      loopHeaders += '<th class="num">R' + (i + 1) + "</th>";
    }

    let rows = "";
    baseBenchOrder.forEach(function (id) {
      let cells = "<td>" + benchNames[id] + "</td>";
      for (let loop = 0; loop < completedLoops; loop++) {
        const val = allResults[loop][id];
        cells += '<td class="num">' + (Number.isFinite(val) ? Math.round(val) : "-") + "</td>";
      }
      cells += '<td class="num avg">' + (Number.isFinite(averages[id]) ? Math.round(averages[id]) : "-") + "</td>";
      cells += '<td class="num">' + (Number.isFinite(avgCv[id]) ? (avgCv[id] * 100).toFixed(1) + "%" : "-") + "</td>";
      cells += '<td class="num">' + unstableCounts[id] + "</td>";
      rows += "<tr>" + cells + "</tr>";
    });

    benchResultsBody.innerHTML =
      '<div class="bench-results-composite">' +
        '<div class="bench-results-composite-label">COMPOSITE AVERAGE</div>' +
        '<div class="bench-results-composite-score">' + (compositeAvg ? Math.round(compositeAvg) : "-") + "</div>" +
      "</div>" +
      '<table class="bench-results-table">' +
        "<thead><tr><th>TEST</th>" + loopHeaders + '<th class="num">AVG</th><th class="num">CV</th><th class="num">UNSTABLE</th></tr></thead>' +
        "<tbody>" + rows + "</tbody>" +
      "</table>";

    benchModeData = {
      allResults: allResults,
      allDetails: allDetails,
      averages: averages,
      avgCv: avgCv,
      compositeAvg: compositeAvg,
      completedLoops: completedLoops,
    };

    benchResultsOverlay.hidden = false;
  }

  function csvEscape(value) {
    const s = String(value == null ? "" : value);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function buildCSV() {
    if (!benchModeData) return "";

    const loops = benchModeData.completedLoops;
    let csv = "Test";
    for (let i = 0; i < loops; i++) csv += ",Run " + (i + 1);
    csv += ",Average,CV,Unstable Runs,Primary Metric,Primary Unit,Raw Samples By Run\n";

    baseBenchOrder.forEach(function (id) {
      const row = [benchNames[id]];
      for (let loop = 0; loop < loops; loop++) {
        const v = benchModeData.allResults[loop][id];
        row.push(Number.isFinite(v) ? v.toFixed(2) : "");
      }

      row.push(Number.isFinite(benchModeData.averages[id]) ? benchModeData.averages[id].toFixed(2) : "");
      row.push(Number.isFinite(benchModeData.avgCv[id]) ? (benchModeData.avgCv[id] * 100).toFixed(2) + "%" : "");

      let unstableCount = 0;
      for (let loop = 0; loop < loops; loop++) {
        const rec = benchModeData.allDetails[loop][id];
        if (rec && rec.unstable) unstableCount++;
      }
      row.push(String(unstableCount));

      const detail0 = benchModeData.allDetails[0] && benchModeData.allDetails[0][id];
      row.push(detail0 ? detail0.primaryMetric : "");
      row.push(detail0 ? detail0.primaryUnit : "");

      const rawByRun = [];
      for (let loop = 0; loop < loops; loop++) {
        const rec = benchModeData.allDetails[loop][id];
        if (!rec || !rec.primarySamples || !rec.primarySamples.length) {
          rawByRun.push("");
        } else {
          rawByRun.push(rec.primarySamples.map(function (v) { return v.toFixed(3); }).join("|"));
        }
      }
      row.push(rawByRun.join(" ; "));

      csv += row.map(csvEscape).join(",") + "\n";
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
    a.download = "simplebench-v2-results-" + new Date().toISOString().slice(0, 10) + ".csv";
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
      setTimeout(function () {
        inner.textContent = "COPY CSV";
      }, 1200);
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

  function randomScreenTear() {
    if (running) {
      const tear = document.createElement("div");
      tear.style.cssText =
        "position: fixed; left: 0; right: 0;" +
        "height: " + (2 + Math.random() * 8) + "px;" +
        "top: " + (Math.random() * 100) + "%;" +
        "background: rgba(" + (Math.random() > 0.5 ? "255,0,85" : "0,255,255") + ", 0.15);" +
        "pointer-events: none; z-index: 9997; mix-blend-mode: screen;";
      document.body.appendChild(tear);
      setTimeout(function () { tear.remove(); }, 100);
    }
    setTimeout(randomScreenTear, 300 + Math.random() * 1200);
  }
  randomScreenTear();

  resetAllCards();
  calibrationReady = loadCalibration();
})();

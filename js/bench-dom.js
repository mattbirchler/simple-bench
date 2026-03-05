(function () {
  const sandbox = document.getElementById("bench-sandbox");
  const ROWS = 3000;
  const CYCLES = 30;
  const WARMUP_CYCLES = 3;
  const GRID_CELLS = 600; // visual representation cells

  function createRows(tbody) {
    for (let i = 0; i < ROWS; i++) {
      const tr = document.createElement("tr");
      for (let j = 0; j < 4; j++) {
        const td = document.createElement("td");
        td.textContent = `Row ${i} Col ${j}`;
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
  }

  function updateRows(tbody) {
    const rows = tbody.children;
    for (let i = 0; i < rows.length; i++) {
      rows[i].children[1].textContent = `Updated ${i}`;
    }
  }

  function swapRows(tbody) {
    const toRemove = [];
    for (let i = tbody.children.length - 1; i >= 0; i -= 10) {
      toRemove.push(tbody.children[i]);
    }
    toRemove.forEach((row) => tbody.removeChild(row));
    for (let i = 0; i < toRemove.length; i++) {
      const tr = document.createElement("tr");
      for (let j = 0; j < 4; j++) {
        const td = document.createElement("td");
        td.textContent = `Swap ${i} Col ${j}`;
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
  }

  function deleteRows(tbody) {
    while (tbody.firstChild) {
      tbody.removeChild(tbody.firstChild);
    }
  }

  function runCycle(tbody, table) {
    createRows(tbody);
    table.offsetHeight; // force layout
    updateRows(tbody);
    table.offsetHeight;
    swapRows(tbody);
    table.offsetHeight;
    deleteRows(tbody);
  }

  window.SimpleBench.benchmarks.dom = {
    name: "DOM Manipulation",
    description: "30 cycles of create/update/swap/delete on 3,000 table rows (12,000 cells each)",

    _preview: null,

    run: async function (onProgress) {
      // Create preview
      const preview = document.createElement("div");
      preview.className = "bench-preview";
      let cellsHTML = "";
      for (let i = 0; i < GRID_CELLS; i++) {
        cellsHTML += '<div class="dom-grid-cell"></div>';
      }
      preview.innerHTML = `
        <div class="bench-preview-header">
          <span class="bench-preview-label">DOM OPS // LIVE</span>
          <span class="bench-preview-stats" id="dom-stats">WARMUP</span>
        </div>
        <div class="bench-preview-body">
          <div class="dom-grid">${cellsHTML}</div>
        </div>
        <div class="bench-preview-scanlines"></div>
      `;
      document.body.appendChild(preview);
      this._preview = preview;

      const statsDisplay = document.getElementById("dom-stats");
      const cells = preview.querySelectorAll(".dom-grid-cell");

      const table = document.createElement("table");
      const tbody = document.createElement("tbody");
      table.appendChild(tbody);
      sandbox.appendChild(table);

      // Warmup
      for (let c = 0; c < WARMUP_CYCLES; c++) {
        runCycle(tbody, table);
      }
      await new Promise((r) => setTimeout(r, 0));

      let totalElapsed = 0;

      for (let c = 0; c < CYCLES; c++) {
        const start = performance.now();
        runCycle(tbody, table);
        totalElapsed += performance.now() - start;

        onProgress((c + 1) / CYCLES);

        // Update preview during yield
        if (c % 5 === 4) {
          const phase = (c % 20) / 20;
          const opsNow = ((c + 1) / (totalElapsed / 1000)).toFixed(1);
          statsDisplay.textContent = "CYCLE " + (c + 1) + "/" + CYCLES + " • " + opsNow + " ops/s";

          // Animate grid: wave of active cells
          for (let i = 0; i < cells.length; i++) {
            const cellPhase = i / cells.length;
            if (phase < 0.5) {
              cells[i].className = cellPhase < phase * 2 ? "dom-grid-cell active" : "dom-grid-cell";
            } else {
              cells[i].className = cellPhase < (phase - 0.5) * 2 ? "dom-grid-cell" : "dom-grid-cell deleting";
            }
          }

          await new Promise((r) => setTimeout(r, 0));
        }
      }

      // Final stats
      statsDisplay.textContent = (CYCLES / (totalElapsed / 1000)).toFixed(1) + " ops/s";

      const elapsed = totalElapsed / 1000;
      const opsPerSec = CYCLES / elapsed;

      return { rawScore: opsPerSec, unit: "ops/s" };
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
      return (rawScore / 150) * 100;
    },
  };
})();

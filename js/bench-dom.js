(function () {
  const sandbox = document.getElementById("bench-sandbox");
  const ROWS = 3000;
  const CYCLES = 30;
  const WARMUP_CYCLES = 3;

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

    run: async function (onProgress) {
      const table = document.createElement("table");
      const tbody = document.createElement("tbody");
      table.appendChild(tbody);
      sandbox.appendChild(table);

      // Warmup — let JIT optimize before measuring
      for (let c = 0; c < WARMUP_CYCLES; c++) {
        runCycle(tbody, table);
      }
      await new Promise((r) => setTimeout(r, 0));

      // Measured runs — time only the work, not the yields
      let totalElapsed = 0;

      for (let c = 0; c < CYCLES; c++) {
        const start = performance.now();
        runCycle(tbody, table);
        totalElapsed += performance.now() - start;

        onProgress((c + 1) / CYCLES);
        // Yield to keep UI responsive — outside timing window
        if (c % 5 === 4) {
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      const elapsed = totalElapsed / 1000;
      const opsPerSec = CYCLES / elapsed;

      return { rawScore: opsPerSec, unit: "ops/s" };
    },

    cleanup: function () {},

    normalize: function (rawScore) {
      return (rawScore / 150) * 100;
    },
  };
})();

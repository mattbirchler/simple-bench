(function () {
  const sandbox = document.getElementById("bench-sandbox");
  const ROWS = 3000;
  const CYCLES = 30;

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

  window.SimpleBench.benchmarks.dom = {
    name: "DOM Manipulation",
    description: "30 cycles of create/update/swap/delete on 3,000 table rows (12,000 cells each)",

    run: async function (onProgress) {
      const table = document.createElement("table");
      const tbody = document.createElement("tbody");
      table.appendChild(tbody);
      sandbox.appendChild(table);

      const start = performance.now();

      for (let c = 0; c < CYCLES; c++) {
        createRows(tbody);
        updateRows(tbody);
        swapRows(tbody);
        deleteRows(tbody);
        onProgress((c + 1) / CYCLES);
        // Yield to keep UI responsive
        await new Promise((r) => setTimeout(r, 0));
      }

      const elapsed = (performance.now() - start) / 1000;
      const opsPerSec = CYCLES / elapsed;

      return { rawScore: opsPerSec, unit: "ops/s" };
    },

    cleanup: function () {},

    normalize: function (rawScore) {
      return (rawScore / 150) * 100;
    },
  };
})();

self.onmessage = function (e) {
  if (e.data.task === "sieve") {
    const n = e.data.n;
    const start = performance.now();
    const flags = new Uint8Array(n + 1);
    flags.fill(1);
    flags[0] = flags[1] = 0;
    for (let i = 2; i * i <= n; i++) {
      if (flags[i]) {
        for (let j = i * i; j <= n; j += i) {
          flags[j] = 0;
        }
      }
    }
    let count = 0;
    for (let i = 0; i <= n; i++) if (flags[i]) count++;
    const elapsed = performance.now() - start;
    self.postMessage({ time: elapsed, count });
  }
};

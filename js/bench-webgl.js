(function () {
  const utils = window.SimpleBench.utils;

  const MAX_INSTANCES = 32000;

  const VERT = `#version 300 es
    layout(location=0) in vec2 aPos;
    layout(location=1) in vec2 aOffset;
    layout(location=2) in float aScale;
    uniform float uTime;
    uniform vec2 uResolution;
    out vec2 vUv;
    void main() {
      float c = cos(uTime * 0.4 + float(gl_InstanceID) * 0.001);
      float s = sin(uTime * 0.4 + float(gl_InstanceID) * 0.001);
      mat2 rot = mat2(c, -s, s, c);
      vec2 p = rot * aPos * aScale + aOffset;
      vec2 clip = (p / uResolution) * 2.0 - 1.0;
      clip.y *= -1.0;
      vUv = aPos;
      gl_Position = vec4(clip, 0.0, 1.0);
    }
  `;

  const FRAG = `#version 300 es
    precision highp float;
    in vec2 vUv;
    uniform float uTime;
    out vec4 fragColor;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      float n = hash(vUv * 8.0 + uTime);
      float edge = 1.0 - smoothstep(0.1, 0.45, length(vUv));
      vec3 base = mix(vec3(0.0, 1.0, 1.0), vec3(1.0, 0.1, 0.35), n);
      vec3 col = base * (0.35 + edge * 1.5);
      fragColor = vec4(col, 0.55);
    }
  `;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(s) || "shader compile failed");
    }
    return s;
  }

  function makeProgram(gl) {
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(p) || "program link failed");
    }
    return p;
  }

  function initScene(gl, rng) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const tri = new Float32Array([
      0.0, -0.6,
      -0.52, 0.3,
      0.52, 0.3,
    ]);
    const triBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, triBuf);
    gl.bufferData(gl.ARRAY_BUFFER, tri, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const offsets = new Float32Array(MAX_INSTANCES * 2);
    const scales = new Float32Array(MAX_INSTANCES);
    for (let i = 0; i < MAX_INSTANCES; i++) {
      offsets[i * 2] = rng() * 800;
      offsets[i * 2 + 1] = rng() * 600;
      scales[i] = 6 + rng() * 28;
    }

    const offBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, offBuf);
    gl.bufferData(gl.ARRAY_BUFFER, offsets, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(1, 1);

    const scaleBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, scaleBuf);
    gl.bufferData(gl.ARRAY_BUFFER, scales, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(2, 1);

    gl.bindVertexArray(null);
    return { vao: vao };
  }

  async function collectGpuTimes(gl, queries) {
    const gpuMs = [];
    for (let i = 0; i < queries.length; i++) {
      const q = queries[i];
      let tries = 0;
      while (tries < 10) {
        const available = gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE);
        if (available) break;
        tries++;
        await utils.sleep(0);
      }
      const available = gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE);
      if (available) {
        const ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
        gpuMs.push(ns / 1000000);
      }
      gl.deleteQuery(q);
    }
    return gpuMs;
  }

  window.SimpleBench.benchmarks.webgl = {
    id: "webgl",
    name: "WebGL GPU Rendering",
    category: "graphics",
    primaryMetric: "fps_tier_weighted",
    cvThreshold: 0.07,
    metricDefs: {
      fps_tier_weighted: { unit: "fps", direction: "higher_is_better" },
      frame_ms_p50: { unit: "ms", direction: "lower_is_better" },
      frame_ms_p95: { unit: "ms", direction: "lower_is_better" },
      gpu_ms_p50: { unit: "ms", direction: "lower_is_better" },
      gpu_ms_p95: { unit: "ms", direction: "lower_is_better" },
    },

    run: async function (ctx) {
      const canvas = document.createElement("canvas");
      canvas.width = 800;
      canvas.height = 600;
      ctx.sandbox.innerHTML = "";
      ctx.sandbox.appendChild(canvas);

      const gl = canvas.getContext("webgl2", {
        antialias: false,
        alpha: false,
        powerPreference: "high-performance",
      });

      if (!gl) {
        return {
          metrics: {},
          samples: [],
          metadata: { benchmark: "webgl", unsupported: true },
          warnings: ["WebGL2 unavailable on this browser/device."],
          unstable: false,
          primaryMetric: this.primaryMetric,
        };
      }

      const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
      const seed = utils.hashString(ctx.seed + ":webgl:scene");
      const rng = utils.createRng(seed);
      const program = makeProgram(gl);
      const scene = initScene(gl, rng);
      const uTime = gl.getUniformLocation(program, "uTime");
      const uResolution = gl.getUniformLocation(program, "uResolution");

      const tiers = [
        { instances: 8000, frames: 70 },
        { instances: 16000, frames: 70 },
        { instances: 32000, frames: 70 },
      ];

      const protocolResult = await utils.runSamplingProtocol({
        warmup: ctx.warmup,
        measured: ctx.measured,
        maxReruns: 1,
        cvThreshold: this.cvThreshold,
        primaryMetric: this.primaryMetric,
        onProgress: ctx.onProgress,
        measureSample: async function () {
          const frameTimes = [];
          const gpuTimes = [];
          let weightedFpsSum = 0;
          let weightedCount = 0;

          gl.viewport(0, 0, 800, 600);
          gl.clearColor(0.02, 0.02, 0.03, 1);
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

          for (let tierIdx = 0; tierIdx < tiers.length; tierIdx++) {
            const tier = tiers[tierIdx];
            const queries = [];
            const tierStart = performance.now();

            for (let f = 0; f < tier.frames; f++) {
              const t0 = performance.now();
              gl.clear(gl.COLOR_BUFFER_BIT);
              gl.useProgram(program);
              gl.uniform1f(uTime, f * 0.016 + tierIdx);
              gl.uniform2f(uResolution, 800, 600);
              gl.bindVertexArray(scene.vao);

              let q = null;
              if (ext) {
                q = gl.createQuery();
                gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
              }

              gl.drawArraysInstanced(gl.TRIANGLES, 0, 3, tier.instances);

              if (ext) {
                gl.endQuery(ext.TIME_ELAPSED_EXT);
                queries.push(q);
              }

              // Intentionally force completion for CPU-side frametime measurement stability.
              // This sacrifices normal GPU pipelining, so real-world FPS can be higher.
              gl.finish();
              frameTimes.push(performance.now() - t0);
            }

            const tierElapsed = (performance.now() - tierStart) / 1000;
            const tierFps = tier.frames / tierElapsed;
            weightedFpsSum += tierFps * tier.instances;
            weightedCount += tier.instances;

            if (ext) {
              const tierGpu = await collectGpuTimes(gl, queries);
              Array.prototype.push.apply(gpuTimes, tierGpu);
            }
          }

          const weightedFps = weightedCount ? (weightedFpsSum / weightedCount) : 0;

          return {
            fps_tier_weighted: weightedFps,
            frame_ms_p50: utils.percentile(frameTimes, 0.5),
            frame_ms_p95: utils.percentile(frameTimes, 0.95),
            gpu_ms_p50: gpuTimes.length ? utils.percentile(gpuTimes, 0.5) : NaN,
            gpu_ms_p95: gpuTimes.length ? utils.percentile(gpuTimes, 0.95) : NaN,
          };
        },
      });

      const metrics = utils.buildMetricMap(protocolResult.samples, this.metricDefs);

      ctx.sandbox.innerHTML = "";

      return {
        metrics: metrics,
        samples: protocolResult.samples,
        metadata: {
          benchmark: "webgl",
          fixed_tiers: tiers,
          timing_path: ext ? "timer_query" : "cpu_frametime",
        },
        warnings: protocolResult.warnings,
        unstable: protocolResult.unstable,
        primaryMetric: this.primaryMetric,
      };
    },

    cleanup: function (sandbox) {
      if (sandbox) sandbox.innerHTML = "";
    },
  };
})();

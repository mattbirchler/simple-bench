(function () {
  const START_INSTANCES = 5000;
  const MAX_INSTANCES = 80000;
  const TARGET_FRAMES = 1200;
  const WARMUP_FRAMES = 30;

  // ---- MAIN SCENE SHADERS ----
  // Large triangles with heavy per-pixel procedural noise, 4 dynamic lights, fake volumetrics
  const SCENE_VERT = `#version 300 es
    layout(location=0) in vec2 aPos;
    layout(location=1) in vec3 aOffset;
    layout(location=2) in float aRotation;
    layout(location=3) in float aScale;
    layout(location=4) in vec3 aColor;

    uniform float uTime;
    uniform float uAspect;

    out vec3 vColor;
    out vec2 vLocalPos;
    out vec3 vWorldPos;
    out float vAlpha;

    void main() {
      float c = cos(aRotation + uTime * 0.5);
      float s = sin(aRotation + uTime * 0.5);
      mat2 rot = mat2(c, s, -s, c);
      vec2 pos = rot * aPos * aScale;

      float z = mod(aOffset.z - uTime * 2.0, 20.0) - 10.0;
      float depth = 1.0 / (z * 0.3 + 3.0);

      vec2 screenPos = (aOffset.xy + pos) * depth;
      screenPos.x /= uAspect;

      vColor = aColor;
      vLocalPos = aPos;
      vWorldPos = vec3(aOffset.xy + pos, z);
      vAlpha = smoothstep(10.0, 5.0, z) * smoothstep(-10.0, -5.0, z);

      gl_Position = vec4(screenPos, depth, 1.0);
    }
  `;

  const SCENE_FRAG = `#version 300 es
    precision highp float;
    in vec3 vColor;
    in vec2 vLocalPos;
    in vec3 vWorldPos;
    in float vAlpha;

    uniform float uTime;
    uniform float uComplexity; // 0..1 ramps shader cost over time

    out vec4 fragColor;

    // Hash functions for procedural noise
    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i), hash(i + vec2(1,0)), f.x),
        mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x),
        f.y
      );
    }

    // Fractal Brownian Motion — octave count scales with complexity
    float fbm(vec2 p) {
      float total = 0.0;
      float amp = 0.5;
      float freq = 1.0;
      int octaves = 3 + int(uComplexity * 5.0); // 3 to 8 octaves
      for (int i = 0; i < 8; i++) {
        if (i >= octaves) break;
        total += noise(p * freq) * amp;
        freq *= 2.17;
        amp *= 0.48;
      }
      return total;
    }

    void main() {
      // Procedural noise pattern on each triangle surface
      vec2 noiseCoord = vWorldPos.xy * 3.0 + uTime * 0.3;
      float n = fbm(noiseCoord);
      float n2 = fbm(noiseCoord * 2.3 + 5.7);

      // 4 dynamic point lights orbiting the scene
      vec3 lighting = vec3(0.05);
      for (int i = 0; i < 4; i++) {
        float angle = uTime * (0.5 + float(i) * 0.3) + float(i) * 1.57;
        float radius = 2.0 + float(i) * 1.5;
        vec3 lightPos = vec3(
          cos(angle) * radius,
          sin(angle * 0.7) * radius,
          sin(angle) * 3.0
        );
        vec3 lightCol;
        if (i == 0) lightCol = vec3(0.0, 1.0, 1.0);      // cyan
        else if (i == 1) lightCol = vec3(1.0, 0.0, 0.33); // hot pink
        else if (i == 2) lightCol = vec3(0.0, 1.0, 0.25);  // toxic green
        else lightCol = vec3(1.0, 1.0, 0.0);               // yellow

        float dist = length(vWorldPos - lightPos);
        float atten = 1.0 / (1.0 + dist * dist * 0.3);

        // Fake specular using noise-distorted normal
        vec3 fakeNormal = normalize(vec3(n - 0.5, n2 - 0.5, 1.0));
        vec3 lightDir = normalize(lightPos - vWorldPos);
        float spec = pow(max(dot(fakeNormal, lightDir), 0.0), 16.0);

        lighting += lightCol * atten * (0.8 + spec * 1.5);
      }

      // Combine: base color * noise pattern * lighting
      vec3 col = vColor * (0.5 + n * 0.8) * lighting;

      // Edge glow on triangles
      float edgeDist = min(min(
        abs(vLocalPos.x * 1.73 + vLocalPos.y),
        abs(-vLocalPos.x * 1.73 + vLocalPos.y)),
        abs(vLocalPos.y + 0.29)
      );
      float edge = smoothstep(0.02, 0.0, edgeDist);
      col += vColor * edge * 2.0;

      // Fake volumetric haze that increases with complexity
      float haze = fbm(vWorldPos.xz * 0.5 + uTime * 0.1) * uComplexity * 0.4;
      col += vec3(0.0, 0.3, 0.4) * haze;

      fragColor = vec4(col, vAlpha * 0.7);
    }
  `;

  // ---- POST-PROCESS BLOOM SHADER ----
  const POST_VERT = `#version 300 es
    layout(location=0) in vec2 aPos;
    out vec2 vUV;
    void main() {
      vUV = aPos * 0.5 + 0.5;
      gl_Position = vec4(aPos, 0.0, 1.0);
    }
  `;

  const POST_FRAG = `#version 300 es
    precision highp float;
    in vec2 vUV;
    uniform sampler2D uScene;
    uniform vec2 uResolution;
    uniform float uComplexity;
    uniform float uTime;
    out vec4 fragColor;

    void main() {
      vec2 texel = 1.0 / uResolution;
      vec4 center = texture(uScene, vUV);

      // Multi-sample blur — sample count scales with complexity
      vec3 bloom = vec3(0.0);
      float total = 0.0;
      int radius = 2 + int(uComplexity * 10.0); // 2 to 12

      for (int x = -12; x <= 12; x++) {
        if (x < -radius || x > radius) continue;
        for (int y = -12; y <= 12; y++) {
          if (y < -radius || y > radius) continue;
          float w = exp(-float(x*x + y*y) / (float(radius) * 2.0));
          vec2 offset = vec2(float(x), float(y)) * texel * 2.0;
          vec3 s = texture(uScene, vUV + offset).rgb;
          // Only bloom bright pixels
          float brightness = max(s.r, max(s.g, s.b));
          bloom += s * w * smoothstep(0.4, 1.0, brightness);
          total += w;
        }
      }
      bloom /= total;

      vec3 col = center.rgb + bloom * (0.6 + uComplexity * 0.8);

      // Chromatic aberration — increases with complexity
      float aberration = (0.001 + uComplexity * 0.004);
      vec2 dir = vUV - 0.5;
      float r = texture(uScene, vUV + dir * aberration).r;
      float b = texture(uScene, vUV - dir * aberration).b;
      col.r = mix(col.r, r, 0.5);
      col.b = mix(col.b, b, 0.5);

      // Vignette
      float vig = 1.0 - dot(dir, dir) * 1.5;
      col *= vig;

      // Film grain
      float grain = fract(sin(dot(vUV * uTime * 100.0, vec2(12.9898, 78.233))) * 43758.5453);
      col += (grain - 0.5) * 0.04;

      fragColor = vec4(col, 1.0);
    }
  `;

  function compileShader(gl, type, src) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const err = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error("Shader compile error: " + err);
    }
    return shader;
  }

  function linkProgram(gl, vsSrc, fsSrc) {
    const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error("Program link error: " + gl.getProgramInfoLog(prog));
    }
    return prog;
  }

  function initScene(gl) {
    // Larger triangle geometry — covers more pixels for fill-rate stress
    const h = Math.sqrt(3) / 2;
    const triVerts = new Float32Array([
      0.0,  h * 0.66,
     -0.5, -h * 0.33,
      0.5, -h * 0.33,
    ]);

    const offsets = new Float32Array(MAX_INSTANCES * 3);
    const rotations = new Float32Array(MAX_INSTANCES);
    const scales = new Float32Array(MAX_INSTANCES);
    const colors = new Float32Array(MAX_INSTANCES * 3);

    const palette = [
      [0.0, 1.0, 0.255],
      [1.0, 0.0, 0.333],
      [0.0, 1.0, 1.0],
      [1.0, 1.0, 0.0],
      [0.5, 0.0, 1.0],
    ];

    for (let i = 0; i < MAX_INSTANCES; i++) {
      offsets[i * 3]     = (Math.random() - 0.5) * 8;
      offsets[i * 3 + 1] = (Math.random() - 0.5) * 6;
      offsets[i * 3 + 2] = Math.random() * 20 - 10;
      rotations[i] = Math.random() * Math.PI * 2;
      // Much larger triangles — 5x to 20x bigger than before
      scales[i] = 0.1 + Math.random() * 0.6;
      const col = palette[Math.floor(Math.random() * palette.length)];
      colors[i * 3]     = col[0];
      colors[i * 3 + 1] = col[1];
      colors[i * 3 + 2] = col[2];
    }

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, triVerts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const offsetBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, offsetBuf);
    gl.bufferData(gl.ARRAY_BUFFER, offsets, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(1, 1);

    const rotBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, rotBuf);
    gl.bufferData(gl.ARRAY_BUFFER, rotations, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(2, 1);

    const scaleBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, scaleBuf);
    gl.bufferData(gl.ARRAY_BUFFER, scales, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(3, 1);

    const colorBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuf);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 3, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(4, 1);

    gl.bindVertexArray(null);
    return { vao };
  }

  function initPostProcess(gl) {
    // Fullscreen quad
    const quadVerts = new Float32Array([-1,-1, 1,-1, -1,1, 1,1]);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    return { vao };
  }

  function createFramebuffer(gl, w, h, useFloat) {
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (useFloat) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.FLOAT, null);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fb, tex };
  }

  // Compute load ramp
  function loadForFrame(frame) {
    const t = frame / TARGET_FRAMES;
    const eased = t * t;
    const count = Math.round(START_INSTANCES + (MAX_INSTANCES - START_INSTANCES) * eased);
    // Complexity ramp for shader cost (0..1)
    const complexity = eased;
    return { instances: count, complexity };
  }

  function formatCount(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(2) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "K";
    return String(n);
  }

  window.SimpleBench.benchmarks.webgl = {
    name: "WebGL GPU Rendering",
    description: "2K→20K lit triangles with procedural noise, dynamic lights, and bloom post-processing",

    _preview: null,

    run: async function (onProgress) {
      const preview = document.createElement("div");
      preview.className = "bench-preview";
      preview.innerHTML = `
        <div class="bench-preview-header">
          <span class="bench-preview-label">GPU STRESS // LIVE</span>
          <span class="bench-preview-stats" id="webgl-stats">---</span>
        </div>
        <canvas id="bench-preview-canvas"></canvas>
        <div class="bench-preview-scanlines"></div>
      `;
      document.body.appendChild(preview);
      this._preview = preview;

      const canvas = document.getElementById("bench-preview-canvas");
      const width = Math.min(640, window.innerWidth - 40);
      const height = Math.round(width * 0.6);
      canvas.width = width * window.devicePixelRatio;
      canvas.height = height * window.devicePixelRatio;
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";

      const statsDisplay = document.getElementById("webgl-stats");

      const gl = canvas.getContext("webgl2", {
        antialias: false,
        alpha: false,
        powerPreference: "high-performance",
      });

      if (!gl) {
        if (this._preview) { this._preview.remove(); this._preview = null; }
        throw new Error("WebGL 2 not supported");
      }

      // Float textures for HDR — fall back to RGBA8 on mobile GPUs
      const hasFloat = !!gl.getExtension("EXT_color_buffer_float");

      const sceneProgram = linkProgram(gl, SCENE_VERT, SCENE_FRAG);
      const postProgram = linkProgram(gl, POST_VERT, POST_FRAG);

      const sceneUniforms = {
        uTime: gl.getUniformLocation(sceneProgram, "uTime"),
        uAspect: gl.getUniformLocation(sceneProgram, "uAspect"),
        uComplexity: gl.getUniformLocation(sceneProgram, "uComplexity"),
      };
      const postUniforms = {
        uScene: gl.getUniformLocation(postProgram, "uScene"),
        uResolution: gl.getUniformLocation(postProgram, "uResolution"),
        uComplexity: gl.getUniformLocation(postProgram, "uComplexity"),
        uTime: gl.getUniformLocation(postProgram, "uTime"),
      };

      const scene = initScene(gl);
      const post = initPostProcess(gl);
      const fbo = createFramebuffer(gl, canvas.width, canvas.height, hasFloat);

      const aspect = canvas.width / canvas.height;

      function renderFrame(time, instances, complexity) {
        // Pass 1: render scene to FBO
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.fb);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        gl.clearColor(0.02, 0.02, 0.03, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(sceneProgram);
        gl.uniform1f(sceneUniforms.uTime, time);
        gl.uniform1f(sceneUniforms.uAspect, aspect);
        gl.uniform1f(sceneUniforms.uComplexity, complexity);
        gl.bindVertexArray(scene.vao);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 3, instances);
        gl.bindVertexArray(null);

        // Pass 2: post-process bloom + chromatic aberration to screen
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.disable(gl.BLEND);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(postProgram);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, fbo.tex);
        gl.uniform1i(postUniforms.uScene, 0);
        gl.uniform2f(postUniforms.uResolution, canvas.width, canvas.height);
        gl.uniform1f(postUniforms.uComplexity, complexity);
        gl.uniform1f(postUniforms.uTime, time);
        gl.bindVertexArray(post.vao);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindVertexArray(null);
      }

      // Warmup
      for (let i = 0; i < WARMUP_FRAMES; i++) {
        renderFrame(i * 0.016, START_INSTANCES, 0.0);
      }
      gl.finish();
      await new Promise((r) => setTimeout(r, 0));

      return new Promise((resolve) => {
        let framesRendered = 0;
        const wallStart = performance.now();
        let lastStatsUpdate = wallStart;
        let statsFrameCount = 0;
        let currentInstances = START_INSTANCES;

        let weightedSum = 0;
        let weightTotal = 0;

        function tick() {
          const now = performance.now();
          const t = (now - wallStart) / 1000;

          const load = loadForFrame(framesRendered);
          currentInstances = load.instances;
          renderFrame(t, load.instances, load.complexity);
          framesRendered++;
          statsFrameCount++;

          if (now - lastStatsUpdate > 400) {
            const intervalSec = (now - lastStatsUpdate) / 1000;
            const liveFps = Math.round(statsFrameCount / intervalSec);
            statsDisplay.textContent = formatCount(currentInstances) + " tris @ " + liveFps + " FPS";

            weightedSum += liveFps * currentInstances;
            weightTotal += currentInstances;

            lastStatsUpdate = now;
            statsFrameCount = 0;
          }

          onProgress(framesRendered / TARGET_FRAMES);

          if (framesRendered < TARGET_FRAMES) {
            requestAnimationFrame(tick);
          } else {
            gl.finish();

            if (statsFrameCount > 0) {
              const intervalSec = (performance.now() - lastStatsUpdate) / 1000;
              const liveFps = statsFrameCount / intervalSec;
              weightedSum += liveFps * currentInstances;
              weightTotal += currentInstances;
            }

            const weightedFps = weightedSum / weightTotal;
            resolve({ rawScore: weightedFps, unit: "wtd fps" });
          }
        }

        requestAnimationFrame(tick);
      });
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
      return (rawScore / 60) * 100;
    },
  };
})();

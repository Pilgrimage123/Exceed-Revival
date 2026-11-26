// ============================================================
// STANDEE STAGE — WebGL2 4x6 Deformable Mesh + Canvas2D Fallback + VFX
// ============================================================
// Persistent 60 FPS stage mounted in #standee-stage-root (outside #app so
// paint() DOM replacements never tear down GL context or clip active motion).
// Layer z-index (50) renders above the stone board (.board z=2..6), beneath
// drawers/modals (z>=95) and foreground sparks/callouts (#fx-overlay-root z=1120).

const StandeeStage = (() => {
  const GRID_COLS = 4;
  const GRID_ROWS = 6;
  const VERTEX_COLS = GRID_COLS + 1; // 5
  const VERTEX_ROWS = GRID_ROWS + 1; // 7
  const VERTEX_COUNT = VERTEX_COLS * VERTEX_ROWS; // 35
  const FLOATS_PER_VERTEX = 8; // [x, y, u0, v0, u1, v1, h, alpha]
  const INDEX_COUNT = GRID_COLS * GRID_ROWS * 6; // 144

  let mounted = false;
  let rootEl = null;
  let glCanvas = null;
  let vfxCanvas = null;
  let gl = null;
  let vfxCtx = null;
  let fallback2dCtx = null;
  let useWebGL2 = false;

  // WebGL2 program & pre-allocated Zero-GC geometry buffers
  let program = null;
  let vao = null;
  let vbo = null;
  let ibo = null;
  let uniforms = {};
  let vertexBuf = null;
  let indexBuf = null;
  const textures = new Map(); // characterKey -> { tex, width, height }
  const textureLru = [];
  const MAX_CACHED_TEXTURES = 96;

  let rafId = 0;
  let lastTimeMs = 0;
  let stageClockSec = 0;
  let viewportW = 1280;
  let viewportH = 720;
  let dpr = 1;

  let dimmerAlpha = 0;
  let dimmerTarget = 0;
  let boardBounds = null;
  let spaceRects = []; // index 0..8 -> { left, top, width, height, cx, groundY }
  let inStrikePlayback = false;
  let strikeSpaces = { p1: null, p2: null };
  let lastKnownActors = new Set();
  let clashSparkTimer = 0;
  let exceedSequence = null; // { pid, charKey, space, x, groundY, width, height, battleCry, subCry, elapsed, duration }
  let cameraZoomCur = 0;
  let cameraZoomTarget = 0;
  let cameraTiltCur = 0;
  let cameraTiltTarget = 0;
  let cameraPanXCur = 0;
  let cameraPanXTarget = 0;

  const afterimages = []; // pooled-style active trail records
  const projectiles = [];
  const stageVfx = [];

  const fighters = {
    p1: createFighterRuntime('p1'),
    p2: createFighterRuntime('p2'),
  };

  // Scratch objects reused inside rAF to keep GC zero
  const _spineOut = { dx: 0, dy: 0, rotRad: 0, scaleX: 1 };
  const _vertOut = { x: 0, y: 0 };
  const _meshParams = {
    anchorXRatio: 0.5,
    footBottomRatio: 0.98,
    width: 120,
    height: 180,
    anchorX: 0,
    groundY: 0,
    facingScale: 1,
    spine: _spineOut,
    spring: null,
    shearPx: 0,
    hopOffsetY: 0,
    wholeRotRad: 0,
    pivotHRatio: 0.38,
  };

  function createFighterRuntime(pid) {
    return {
      pid,
      charKey: null,
      initialized: false,
      active: false,
      exceeded: false,
      activeBoostCount: 0,
      activeBoostLabel: '',
      wildSwingHazard: false,
      domAnchor: null,
      space: 0,
      x: 0,
      startX: 0,
      targetX: 0,
      moveElapsed: 0,
      moveDuration: 0.32,
      moving: false,
      moveKind: 'advance',
      vx: 0,
      groundY: 0,
      width: 120,
      height: 180,
      facingSign: pid === 'p1' ? 1 : -1,
      flipStartSign: pid === 'p1' ? 1 : -1,
      flipTargetSign: pid === 'p1' ? 1 : -1,
      flipElapsed: 1,
      flipDuration: 0.18,
      flipping: false,
      flipHopHeight: 18,
      spring: (typeof StandeeRigMath !== 'undefined')
        ? StandeeRigMath.createSpringState()
        : { scaleX: 1, scaleY: 1, velX: 0, velY: 0 },
      springStiffness: 360,
      springDamping: 22,
      spineKnots: (typeof StandeeRigMath !== 'undefined')
        ? StandeeRigMath.createFourKnotSpine()
        : [{ dx: 0, dy: 0, rotRad: 0, scaleX: 1 }, { dx: 0, dy: 0, rotRad: 0, scaleX: 1 }, { dx: 0, dy: 0, rotRad: 0, scaleX: 1 }, { dx: 0, dy: 0, rotRad: 0, scaleX: 1 }],
      choreo: null,
      choreoElapsed: 0,
      choreoDuration: 0,
      choreoTargetDistPx: 0,
      additiveChoreo: null, // Track 2 additive hit-flinch / super-armor grit
      additiveElapsed: 0,
      additiveDuration: 0,
      hitstopRemaining: 0,
      flashRemaining: 0,
      flashDuration: 0.065,
      flashColorRgb: [1, 1, 1],
      auraFlare: 0,
      exceedTrailTimer: 0,
      desaturateAmount: 0,
      shudderRemaining: 0,
      shudderHz: 0,
      afterimageCooldown: 0,
      afterimageLeft: 0,
      afterimageCfg: null,
      ironWallChainsTimer: 0,
      cammyCrossUpFlashTimer: 0,
      lastSideSwapped: false,
      activeFrameKey: 'idle',
      zPriority: pid === 'p1' ? 2 : 2,
    };
  }

  function isReducedMotion() {
    if (typeof UXSettings !== 'undefined' && UXSettings.get && UXSettings.get('reducedHitStop')) return true;
    if (typeof window !== 'undefined' && window.matchMedia) {
      try {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
      } catch (_) {}
    }
    return false;
  }

  function canUseDom() {
    return (
      typeof document !== 'undefined' &&
      typeof window !== 'undefined' &&
      typeof document.createElement === 'function' &&
      typeof requestAnimationFrame === 'function'
    );
  }

  function buildMeshIndexBuffer() {
    if (typeof Uint16Array === 'undefined') return null;
    const idx = new Uint16Array(INDEX_COUNT);
    let ptr = 0;
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const i0 = r * VERTEX_COLS + c;
        const i1 = i0 + 1;
        const i2 = i0 + VERTEX_COLS;
        const i3 = i2 + 1;
        idx[ptr++] = i0; idx[ptr++] = i2; idx[ptr++] = i1;
        idx[ptr++] = i1; idx[ptr++] = i2; idx[ptr++] = i3;
      }
    }
    return idx;
  }

  function compileShader(context, type, source) {
    const sh = context.createShader(type);
    if (!sh) return null;
    context.shaderSource(sh, source);
    context.compileShader(sh);
    if (!context.getShaderParameter(sh, context.COMPILE_STATUS)) {
      context.deleteShader(sh);
      return null;
    }
    return sh;
  }

  function initWebGL2(canvas) {
    if (!canvas || !canvas.getContext) return false;
    let ctx = null;
    try {
      ctx = canvas.getContext('webgl2', {
        alpha: true,
        premultipliedAlpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch (_) {
      ctx = null;
    }
    if (!ctx) return false;

    const vsSrc = `#version 300 es
      precision highp float;
      uniform vec2 u_resolution;
      layout(location = 0) in vec2 a_pos;
      layout(location = 1) in vec2 a_uv0;
      layout(location = 2) in vec2 a_uv1;
      layout(location = 3) in float a_h;
      layout(location = 4) in float a_alpha;
      out vec2 v_uv0;
      out float v_h;
      out float v_alpha;
      void main() {
        vec2 zeroToOne = a_pos / u_resolution;
        vec2 clip = zeroToOne * 2.0 - 1.0;
        gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
        v_uv0 = a_uv0;
        v_h = a_h;
        v_alpha = a_alpha;
      }
    `;

    const fsSrc = `#version 300 es
      precision mediump float;
      uniform sampler2D u_tex;
      uniform vec3 u_flashColor;
      uniform float u_flashAmount;
      uniform vec3 u_tintColor;
      uniform float u_tintAmount;
      uniform vec3 u_rimColor;
      uniform float u_rimStrength;
      uniform float u_desaturate;
      uniform float u_reflectFade;
      in vec2 v_uv0;
      in float v_h;
      in float v_alpha;
      out vec4 fragColor;
      void main() {
        vec4 texel = texture(u_tex, v_uv0);
        if (texel.a < 0.005) discard;
        vec3 rgb = texel.rgb / texel.a;
        if (u_desaturate > 0.0) {
          float luma = dot(rgb, vec3(0.299, 0.587, 0.114));
          rgb = mix(rgb, vec3(luma), u_desaturate);
        }
        if (u_tintAmount > 0.0) {
          rgb = mix(rgb, u_tintColor, u_tintAmount);
        }
        // Fresnel / Rim-Lighting Edge Glow: illuminates outer silhouette contour
        // while keeping interior face, limbs, and gi details 100% crisp.
        if (u_rimStrength > 0.0) {
          float aN = texture(u_tex, v_uv0 + vec2(0.0, -0.007)).a;
          float aS = texture(u_tex, v_uv0 + vec2(0.0,  0.007)).a;
          float aE = texture(u_tex, v_uv0 + vec2( 0.007, 0.0)).a;
          float aW = texture(u_tex, v_uv0 + vec2(-0.007, 0.0)).a;
          float minNeighborA = min(min(aN, aS), min(aE, aW));
          float rimEdge = clamp((texel.a - minNeighborA) * 1.75 + (1.0 - texel.a) * 0.65, 0.0, 1.0);
          float rimMask = smoothstep(0.12, 0.88, rimEdge) * clamp(u_rimStrength, 0.0, 1.5);
          rgb = mix(rgb, u_rimColor, clamp(rimMask * 0.78, 0.0, 0.92)) + u_rimColor * (rimMask * 0.42);
        }
        if (u_flashAmount > 0.0) {
          rgb = mix(rgb, u_flashColor, u_flashAmount);
        }
        float fade = (u_reflectFade > 0.0) ? clamp(1.0 - v_h * u_reflectFade, 0.0, 1.0) : 1.0;
        float outAlpha = clamp(texel.a * v_alpha * fade, 0.0, 1.0);
        fragColor = vec4(rgb * outAlpha, outAlpha);
      }
    `;

    const vs = compileShader(ctx, ctx.VERTEX_SHADER, vsSrc);
    const fs = compileShader(ctx, ctx.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return false;

    const prog = ctx.createProgram();
    ctx.attachShader(prog, vs);
    ctx.attachShader(prog, fs);
    ctx.linkProgram(prog);
    ctx.deleteShader(vs);
    ctx.deleteShader(fs);
    if (!ctx.getProgramParameter(prog, ctx.LINK_STATUS)) {
      ctx.deleteProgram(prog);
      return false;
    }

    gl = ctx;
    program = prog;
    uniforms = {
      u_resolution: gl.getUniformLocation(prog, 'u_resolution'),
      u_tex: gl.getUniformLocation(prog, 'u_tex'),
      u_flashColor: gl.getUniformLocation(prog, 'u_flashColor'),
      u_flashAmount: gl.getUniformLocation(prog, 'u_flashAmount'),
      u_tintColor: gl.getUniformLocation(prog, 'u_tintColor'),
      u_tintAmount: gl.getUniformLocation(prog, 'u_tintAmount'),
      u_rimColor: gl.getUniformLocation(prog, 'u_rimColor'),
      u_rimStrength: gl.getUniformLocation(prog, 'u_rimStrength'),
      u_desaturate: gl.getUniformLocation(prog, 'u_desaturate'),
      u_reflectFade: gl.getUniformLocation(prog, 'u_reflectFade'),
    };

    if (typeof Float32Array !== 'undefined') {
      vertexBuf = new Float32Array(VERTEX_COUNT * FLOATS_PER_VERTEX);
    }
    indexBuf = buildMeshIndexBuffer();

    vao = gl.createVertexArray();
    vbo = gl.createBuffer();
    ibo = gl.createBuffer();

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertexBuf ? vertexBuf.byteLength : VERTEX_COUNT * FLOATS_PER_VERTEX * 4, gl.DYNAMIC_DRAW);

    const stride = FLOATS_PER_VERTEX * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 16);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, 28);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexBuf, gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    return true;
  }

  function resize() {
    if (!mounted || !glCanvas || !vfxCanvas) return;
    viewportW = Math.max(1, window.innerWidth || 1280);
    viewportH = Math.max(1, window.innerHeight || 720);
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    const wPx = Math.round(viewportW * dpr);
    const hPx = Math.round(viewportH * dpr);
    if (glCanvas.width !== wPx || glCanvas.height !== hPx) {
      glCanvas.width = wPx;
      glCanvas.height = hPx;
    }
    if (vfxCanvas.width !== wPx || vfxCanvas.height !== hPx) {
      vfxCanvas.width = wPx;
      vfxCanvas.height = hPx;
    }
  }

  function getOrUploadTexture(charKey, frameKey = 'idle') {
    if (!useWebGL2 || !gl || !charKey) return null;
    const fKey = frameKey || 'idle';
    const cacheKey = fKey === 'idle' ? charKey : `${charKey}:${fKey}`;
    if (textures.has(cacheKey)) {
      const entry = textures.get(cacheKey);
      // Touch LRU
      const idx = textureLru.indexOf(cacheKey);
      if (idx !== -1) {
        textureLru.splice(idx, 1);
        textureLru.push(cacheKey);
      }
      return entry;
    }
    const surface = (typeof StandeeAssets !== 'undefined')
      ? (StandeeAssets.getFrameSurface
        ? StandeeAssets.getFrameSurface(charKey, fKey)
        : (StandeeAssets.getSurface ? StandeeAssets.getSurface(charKey) : null))
      : null;
    if (!surface) {
      if (fKey !== 'idle' && typeof StandeeAssets !== 'undefined' && StandeeAssets.ensureFrameLoaded) {
        StandeeAssets.ensureFrameLoaded(charKey, fKey);
        return getOrUploadTexture(charKey, 'idle');
      }
      return null;
    }

    // If getFrameSurface fell back to the idle surface while a non-idle frame is still loading,
    // return the cached idle texture rather than caching the idle pixels under the non-idle key.
    if (fKey !== 'idle' && typeof StandeeAssets !== 'undefined' && StandeeAssets.getSurface) {
      const idleSurface = StandeeAssets.getSurface(charKey);
      if (idleSurface && surface === idleSurface) {
        if (StandeeAssets.ensureFrameLoaded) StandeeAssets.ensureFrameLoaded(charKey, fKey);
        return getOrUploadTexture(charKey, 'idle');
      }
    }

    if (textureLru.length >= MAX_CACHED_TEXTURES) {
      const oldest = textureLru.shift();
      const oldEntry = textures.get(oldest);
      if (oldEntry && oldEntry.tex) {
        try { gl.deleteTexture(oldEntry.tex); } catch (_) {}
      }
      textures.delete(oldest);
    }

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, surface);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindTexture(gl.TEXTURE_2D, null);

    const entry = { tex, width: surface.width || 512, height: surface.height || 768 };
    textures.set(cacheKey, entry);
    textureLru.push(cacheKey);
    return entry;
  }

  function mount() {
    if (mounted || !canUseDom()) return;
    rootEl = document.getElementById('standee-stage-root');
    if (!rootEl || typeof rootEl.appendChild !== 'function') return;

    glCanvas = document.createElement('canvas');
    glCanvas.id = 'standee-stage-canvas';
    glCanvas.className = 'standee-stage-canvas';
    glCanvas.setAttribute('data-testid', 'standee-stage');

    vfxCanvas = document.createElement('canvas');
    vfxCanvas.id = 'standee-vfx-canvas';
    vfxCanvas.className = 'standee-vfx-canvas';

    rootEl.appendChild(glCanvas);
    rootEl.appendChild(vfxCanvas);

    useWebGL2 = initWebGL2(glCanvas);
    if (!useWebGL2) {
      fallback2dCtx = glCanvas.getContext ? glCanvas.getContext('2d') : null;
    }
    vfxCtx = vfxCanvas.getContext ? vfxCanvas.getContext('2d') : null;

    resize();
    window.addEventListener('resize', resize);

    if (typeof StandeeAssets !== 'undefined' && StandeeAssets.onReady) {
      StandeeAssets.onReady(() => {
        syncAfterRender();
      });
    }

    bindEvents();
    mounted = true;
    startLoop();
  }

  function hexToRgbNorm(hex) {
    if (!hex || typeof hex !== 'string') return [1, 1, 1];
    const clean = hex.replace('#', '');
    if (clean.length === 3) {
      const r = parseInt(clean[0] + clean[0], 16) / 255;
      const g = parseInt(clean[1] + clean[1], 16) / 255;
      const b = parseInt(clean[2] + clean[2], 16) / 255;
      return [r, g, b];
    }
    if (clean.length >= 6) {
      const r = parseInt(clean.slice(0, 2), 16) / 255;
      const g = parseInt(clean.slice(2, 4), 16) / 255;
      const b = parseInt(clean.slice(4, 6), 16) / 255;
      return [r, g, b];
    }
    return [1, 1, 1];
  }

  function computeSharedOffset(pid, p1Space, p2Space) {
    if (p1Space == null || p2Space == null || p1Space !== p2Space) return 0;
    const cell = spaceRects[p1Space];
    const w = cell ? cell.width : 84;
    return pid === 'p1' ? -w * 0.24 : w * 0.24;
  }

  function spaceToX(pid, space, p1Space, p2Space) {
    const cell = spaceRects[space];
    if (!cell) return null;
    return cell.cx + computeSharedOffset(pid, p1Space, p2Space);
  }

  function setFighterFacing(f, targetSign, hopHeight = 18) {
    if (f.facingSign === targetSign && !f.flipping) return;
    if (f.flipTargetSign === targetSign && f.flipping) return;
    if (!f.initialized || isReducedMotion()) {
      f.facingSign = targetSign;
      f.flipStartSign = targetSign;
      f.flipTargetSign = targetSign;
      f.flipping = false;
      return;
    }
    f.flipStartSign = f.facingSign;
    f.flipTargetSign = targetSign;
    f.flipElapsed = 0;
    f.flipDuration = 0.13;
    f.flipHopHeight = hopHeight;
    f.flipping = true;
  }

  function triggerCameraEffect(zoomPunch = 0, tiltDeg = 0, panX = 0) {
    if (isReducedMotion()) return;
    if (zoomPunch > 0) cameraZoomTarget = Math.max(cameraZoomTarget, zoomPunch);
    if (tiltDeg) cameraTiltTarget = tiltDeg;
    if (panX) cameraPanXTarget = panX;
  }

  function stepCameraEffects(dt) {
    if (typeof document === 'undefined') return;
    const frameEl = document.querySelector('.arena-board-frame');
    if (!frameEl || !frameEl.style) return;
    if (isReducedMotion()) {
      if (cameraZoomCur !== 0 || cameraTiltCur !== 0 || cameraPanXCur !== 0) {
        cameraZoomCur = 0; cameraTiltCur = 0; cameraPanXCur = 0;
        frameEl.style.transform = '';
      }
      return;
    }
    cameraZoomCur += (cameraZoomTarget - cameraZoomCur) * Math.min(1, dt * 16);
    cameraTiltCur += (cameraTiltTarget - cameraTiltCur) * Math.min(1, dt * 14);
    cameraPanXCur += (cameraPanXTarget - cameraPanXCur) * Math.min(1, dt * 12);
    cameraZoomTarget *= Math.max(0, 1 - dt * 5.2);
    cameraTiltTarget *= Math.max(0, 1 - dt * 4.5);
    cameraPanXTarget *= Math.max(0, 1 - dt * 5.0);
    if (Math.abs(cameraZoomCur) < 0.0008 && Math.abs(cameraTiltCur) < 0.03 && Math.abs(cameraPanXCur) < 0.25) {
      cameraZoomCur = 0; cameraTiltCur = 0; cameraPanXCur = 0;
      frameEl.style.transform = '';
    } else {
      const s = (1 + cameraZoomCur).toFixed(4);
      const r = cameraTiltCur.toFixed(2);
      const px = cameraPanXCur.toFixed(1);
      frameEl.style.transform = `translate3d(${px}px, 0, 0) scale(${s}) rotate(${r}deg)`;
    }
  }

  function startChoreography(f, choreo, opts = {}) {
    if (!choreo) return;
    const distPx = opts.distanceToTargetPx != null ? opts.distanceToTargetPx : 0;
    // Track 2 additive hit-flinch / super-armor grit layers on top of Track 1 windup
    if (choreo.track === 2 && f.choreo && f.choreo.track !== 2) {
      f.additiveChoreo = choreo;
      f.additiveElapsed = 0;
      f.additiveDuration = Math.max(0.14, choreo.durationSec || 0.28);
    } else {
      f.choreo = choreo;
      f.choreoDuration = Math.max(0.14, choreo.durationSec || 0.32);
      f.choreoElapsed = (choreo.holdAtU != null) ? (choreo.holdAtU * f.choreoDuration) : 0;
      f.choreoTargetDistPx = distPx;
      f.wildSwingHazard = !!choreo.wildSwingHazard;
    }
    if (choreo.springPreset && typeof StandeeRigMath !== 'undefined') {
      const sp = choreo.springPreset;
      f.springStiffness = sp.stiffness || 360;
      f.springDamping = sp.damping || 22;
      StandeeRigMath.applySpringImpulse(
        f.spring,
        sp.scaleX,
        sp.scaleY,
        sp.velImpulseX || 0,
        sp.velImpulseY || 0
      );
    }
    if (choreo.hitstopSec > 0 && !isReducedMotion()) {
      f.hitstopRemaining = Math.max(f.hitstopRemaining, choreo.hitstopSec);
    }
    if (choreo.track !== 2 || !f.choreo || f.choreo.track === 2) {
      f.activeFrameKey = getFighterActiveFrameKey(f);
    }
    if (choreo.flashWhiteMs > 0 && !isReducedMotion()) {
      f.flashDuration = choreo.flashWhiteMs / 1000;
      f.flashRemaining = f.flashDuration;
      f.flashColorRgb = hexToRgbNorm(choreo.flashColorHex || '#ffffff');
    }
    if (choreo.shudderHz > 0 && !isReducedMotion()) {
      f.shudderHz = choreo.shudderHz;
      f.shudderRemaining = choreo.durationSec || 0.45;
    }
    if (choreo.cameraPunch > 0 || choreo.cameraTiltDeg) {
      triggerCameraEffect(choreo.cameraPunch || 0, choreo.cameraTiltDeg || 0, 0);
    }
    // Dynamic VFX Scaling on Action: only spike elemental auraFlare when Exceeded, Boosted, or Ultra
    const hasElementalState = !!(f.exceeded || (f.activeBoostCount || 0) > 0 || (choreo.vfx && choreo.vfx.isUltra));
    if (choreo.phase === 'boost') {
      f.auraFlare = Math.max(f.auraFlare || 0, 0.95);
    } else if (choreo.phase === 'exceed') {
      f.auraFlare = 1.45;
    } else if (hasElementalState && (choreo.phase === 'reveal' || choreo.phase === 'before' || choreo.phase === 'hit_attack')) {
      f.auraFlare = Math.max(f.auraFlare || 0, choreo.phase === 'reveal' ? 1.15 : 0.95);
    }
    if (choreo.ironWallChains && !isReducedMotion()) {
      f.ironWallChainsTimer = Math.max(f.ironWallChainsTimer || 0, Math.max(0.72, (choreo.durationSec || 0.42) + 0.35));
    }
    if (choreo.cammyCrossUpHeelFlash && !isReducedMotion()) {
      f.cammyCrossUpFlashTimer = Math.max(f.cammyCrossUpFlashTimer || 0, 0.78);
    }
    f.desaturateAmount = choreo.desaturate || f.desaturateAmount || 0;
    if (choreo.afterimage && !isReducedMotion()) {
      f.afterimageCfg = choreo.afterimage;
      f.afterimageLeft = choreo.afterimage.count || 3;
      f.afterimageCooldown = 0;
    } else if (choreo.track !== 2) {
      f.afterimageLeft = 0;
      f.afterimageCfg = null;
    }
  }

  function spawnProjectile(attPid, defPid, cardKey, choreo) {
    const att = fighters[attPid];
    const def = fighters[defPid];
    if (!att || !att.active) return;
    const cal = (typeof StandeeAssets !== 'undefined' && StandeeAssets.getCalibration)
      ? StandeeAssets.getCalibration(att.charKey)
      : null;
    const muzzle = cal && cal.muzzleRel ? cal.muzzleRel : { dx: 0.22, h: 0.56 };
    const startX = att.x + att.facingSign * att.width * (0.25 + Math.max(0, muzzle.dx * 0.4));
    const startY = att.groundY - att.height * muzzle.h;
    const endX = (def && def.active) ? def.x : (startX + att.facingSign * 280);
    const endY = (def && def.active) ? (def.groundY - def.height * 0.52) : startY;
    const spec = choreo.projectile || {};
    projectiles.push({
      style: spec.style || 'cyan_hadoken',
      startX,
      startY,
      endX: spec.whiff ? (startX + att.facingSign * Math.min(280, Math.abs(endX - startX) * 0.72)) : endX,
      endY,
      x: startX,
      y: startY,
      dir: att.facingSign,
      radius: spec.radius || 20,
      trailColor: spec.trailColor || '#38bdf8',
      coreColor: spec.coreColor || '#ffffff',
      elapsed: 0,
      duration: spec.whiff ? 0.34 : 0.28,
      whiff: !!spec.whiff,
    });
  }

  function spawnStageVfx(pid, vfxSpec) {
    const f = fighters[pid];
    if (!f || !f.active || !vfxSpec) return;
    const opp = fighters[pid === 'p1' ? 'p2' : 'p1'];
    const defaultReach = (opp && opp.active) ? Math.abs(opp.x - f.x) : 0;
    stageVfx.push({
      type: vfxSpec.type,
      fallbackType: vfxSpec.fallbackType || null,
      color: vfxSpec.color || '#38bdf8',
      accent: vfxSpec.accent || '#ffffff',
      isUltra: !!vfxSpec.isUltra,
      isExceeded: !!vfxSpec.isExceeded,
      reachPx: vfxSpec.reachPx != null ? vfxSpec.reachPx : defaultReach,
      followPid: (
        vfxSpec.type === 'cammy_heel_crossup_flash' ||
        vfxSpec.type === 'evasion_shimmer' ||
        vfxSpec.type === 'iron_wall_chains' ||
        vfxSpec.type === 'speed_ring' ||
        vfxSpec.type === 'cyclone' ||
        vfxSpec.type === 'prepare_pulse' ||
        vfxSpec.type === 'boost_install' ||
        vfxSpec.type === 'exceed_burst' ||
        vfxSpec.type === 'ken_backflip_fire_wheel' ||
        vfxSpec.type === 'ryu_backdash_ki_wake'
      ) ? pid : null,
      x: f.x,
      groundY: f.groundY,
      width: f.width,
      height: f.height,
      facingSign: f.facingSign,
      elapsed: (vfxSpec.holdAtT != null) ? (vfxSpec.holdAtT * (vfxSpec.isUltra ? 0.56 : 0.42)) : 0,
      duration: vfxSpec.isUltra ? 0.56 : 0.42,
      holdAtT: vfxSpec.holdAtT != null ? vfxSpec.holdAtT : null,
    });
  }

  function getFighterActiveFrameKey(f) {
    if (!f || !f.choreo) return 'idle';
    const rawU = f.choreoDuration > 0 ? Math.min(1, f.choreoElapsed / f.choreoDuration) : 1;
    // During hitstop freeze on impact (hit_attack), lock onto the active impact keyframe (u >= 0.25)
    // rather than freezing on u=0 startup/windup!
    const u = (f.hitstopRemaining > 0 && f.choreo.phase === 'hit_attack')
      ? Math.max(0.25, rawU)
      : rawU;
    if (typeof StandeeRigMath !== 'undefined' && StandeeRigMath.resolveActiveFrameKey) {
      return StandeeRigMath.resolveActiveFrameKey(f.choreo, u);
    }
    return f.choreo.frameKey || 'idle';
  }

  function spawnAfterimage(f, alpha, tintHex) {
    if (!f || !f.active || afterimages.length >= 24) return;
    const spinState = computeCurrentSpinState(f);
    afterimages.push({
      charKey: f.charKey,
      frameKey: getFighterActiveFrameKey(f),
      x: f.x + computeFighterLungeOffsetX(f),
      groundY: f.groundY,
      width: f.width,
      height: f.height,
      facingSign: f.facingSign * spinState.horizSpinScaleX,
      scaleX: f.spring.scaleX,
      scaleY: f.spring.scaleY,
      alpha: alpha || 0.28,
      maxAlpha: alpha || 0.28,
      tint: hexToRgbNorm(tintHex || '#4de6d1'),
      tintHex: tintHex || '#4de6d1',
      elapsed: 0,
      duration: 0.22,
      knots: f.spineKnots.map(k => ({ ...k })),
      shearPx: StandeeRigMath.stepHorizontalVelocityShear(f.vx, 1),
      vx: f.vx,
      hopOffsetY: computeCurrentHopY(f),
      wholeRotRad: spinState.wholeRotRad,
    });
  }

  function computeCurrentHopY(f) {
    if (typeof StandeeRigMath === 'undefined') return 0;
    let hopY = 0;
    if (f.flipping) {
      const flipU = Math.min(1, f.flipElapsed / Math.max(0.05, f.flipDuration));
      const flipState = StandeeRigMath.stepHorizontalFlip(flipU, f.flipStartSign, f.flipTargetSign, f.flipHopHeight);
      hopY = Math.min(hopY, flipState.hopYPx);
    }
    if (f.choreo && f.choreo.hopHeight > 0 && f.choreoDuration > 0) {
      const u = Math.min(1, f.choreoElapsed / f.choreoDuration);
      const win = f.choreo.airWindow || [0.22, 0.78];
      const arc = StandeeRigMath.airborneArcYPx(u, f.choreo.hopHeight, win[0], win[1]);
      hopY = Math.min(hopY, arc);
    }
    return hopY;
  }

  function computeCurrentSpinRad(f) {
    if (!f.choreo || !f.choreo.wholeSpinRad || f.choreoDuration <= 0 || isReducedMotion()) return 0;
    const u = Math.min(1, f.choreoElapsed / f.choreoDuration);
    const win = f.choreo.spinWindow || [0.15, 0.85];
    const t = StandeeRigMath.smoothstep(win[0], win[1], u);
    // When using a dedicated inverted mid-air somersault frame (cross_retreat / ken_backflip.jpg),
    // the keyframe artwork is already authored at the 180-deg (-pi) apex of the backflip (t = 0.5),
    // so pitch around the apex (t - 0.5) rather than rotating the inverted drawing 180-deg back upright.
    if (getFighterActiveFrameKey(f) === 'cross_retreat') {
      return f.choreo.wholeSpinRad * (t - 0.5) * 0.42 * f.facingSign;
    }
    return f.choreo.wholeSpinRad * t * f.facingSign;
  }

  function computeCurrentSpinState(f) {
    const rad = computeCurrentSpinRad(f);
    const plane = (f && f.choreo && f.choreo.spinPlane) ? f.choreo.spinPlane : 'xy';
    if (plane === 'horizontal_flare' && rad !== 0) {
      let cosScale = Math.cos(rad);
      if (Math.abs(cosScale) < 0.18) {
        cosScale = (cosScale < 0 ? -1 : 1) * 0.18;
      }
      return { wholeRotRad: 0, horizSpinScaleX: cosScale };
    }
    return { wholeRotRad: rad, horizSpinScaleX: 1 };
  }

  function syncDomMetrics() {
    if (typeof document === 'undefined' || !document.querySelectorAll) return;
    const isPlaying = typeof G !== 'undefined' && G && G.mode !== 'game_over' &&
      (!document.body || !document.body.dataset || document.body.dataset.state === 'playing');

    const boardEl = document.querySelector('.arena-board-frame .board');
    if (!isPlaying || !boardEl) {
      boardBounds = null;
      fighters.p1.active = false;
      fighters.p2.active = false;
      return;
    }
    boardBounds = boardEl.getBoundingClientRect();

    const cells = document.querySelectorAll('.arena-board-frame .board .cell[data-space]');
    for (const c of cells) {
      const sp = Number(c.getAttribute('data-space'));
      if (!Number.isFinite(sp)) continue;
      const r = c.getBoundingClientRect();
      spaceRects[sp] = {
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height,
        cx: r.left + r.width / 2,
        bottom: r.bottom,
      };
    }

    const engine = G && G.engine;
    const p1 = engine && engine.P ? engine.P('p1') : null;
    const p2 = engine && engine.P ? engine.P('p2') : null;

    const seenPids = new Set();
    const tokens = document.querySelectorAll('.arena-board-frame .token.has-standee[data-pid]');
    for (const tok of tokens) {
      const pid = tok.getAttribute('data-pid');
      const f = fighters[pid];
      if (!f) continue;
      seenPids.add(pid);

      const charKey = tok.getAttribute('data-char');
      const spec = (typeof getStandeeSpec === 'function') ? getStandeeSpec(charKey) : null;
      const anchor = tok.querySelector('.standee-anchor');
      const spriteEl = tok.querySelector('.standee-sprite');
      if (!spec || !anchor) {
        f.active = false;
        continue;
      }

      const surface = (typeof StandeeAssets !== 'undefined' && StandeeAssets.getSurface)
        ? StandeeAssets.getSurface(charKey)
        : null;
      const hasSurface = !!surface;

      if (spriteEl && spriteEl.dataset) {
        spriteEl.dataset.stageRendered = hasSurface ? 'true' : 'false';
      }

      if (!hasSurface) {
        if (typeof StandeeAssets !== 'undefined' && StandeeAssets.ensureLoaded) {
          StandeeAssets.ensureLoaded(charKey);
        }
        f.active = false;
        continue;
      }

      if (useWebGL2) {
        getOrUploadTexture(charKey);
      }

      const rect = anchor.getBoundingClientRect();
      const playerObj = pid === 'p1' ? p1 : p2;
      f.charKey = charKey;
      f.active = true;
      f.exceeded = !!(playerObj && playerObj.exceeded);
      const boostsArr = (playerObj && Array.isArray(playerObj.boostsInPlay)) ? playerObj.boostsInPlay : [];
      f.activeBoostCount = boostsArr.length;
      if (boostsArr.length > 0) {
        const lastB = boostsArr[boostsArr.length - 1];
        f.activeBoostLabel = (lastB && (lastB.boostName || lastB.name)) ? String(lastB.boostName || lastB.name).toUpperCase() : 'BOOST';
      } else {
        f.activeBoostLabel = '';
      }
      f.domAnchor = anchor;
      f.height = Math.max(48, rect.height || 180);
      f.width = f.height * (spec.aspectRatio || (1024 / 1536));
      const footShiftPx = f.height * ((spec.footOffsetPct || 0) / 100);
      f.groundY = rect.bottom + footShiftPx;

      const domSpace = playerObj ? playerObj.pos : (pid === 'p1' ? 2 : 6);
      const activeSpace = (inStrikePlayback && strikeSpaces[pid] != null) ? strikeSpaces[pid] : domSpace;
      const oppSpace = (inStrikePlayback && strikeSpaces[pid === 'p1' ? 'p2' : 'p1'] != null)
        ? strikeSpaces[pid === 'p1' ? 'p2' : 'p1']
        : (pid === 'p1' ? (p2 ? p2.pos : 6) : (p1 ? p1.pos : 2));

      const p1Sp = pid === 'p1' ? activeSpace : oppSpace;
      const p2Sp = pid === 'p2' ? activeSpace : oppSpace;
      const resolvedX = spaceToX(pid, activeSpace, p1Sp, p2Sp) ?? (rect.left + rect.width / 2);

      if (!f.initialized) {
        f.initialized = true;
        f.space = activeSpace;
        f.x = resolvedX;
        f.startX = resolvedX;
        f.targetX = resolvedX;
        const initFacing = (pid === 'p1')
          ? (activeSpace <= oppSpace ? 1 : -1)
          : (activeSpace < oppSpace ? 1 : -1);
        f.facingSign = initFacing;
        f.flipStartSign = initFacing;
        f.flipTargetSign = initFacing;
      } else if (!inStrikePlayback) {
        // Keep aligned smoothly with DOM space if resize or non-animated shift occurred
        f.space = activeSpace;
        if (!f.moving && Math.abs(f.targetX - resolvedX) > 2) {
          f.x = resolvedX;
          f.targetX = resolvedX;
        } else {
          f.targetX = resolvedX;
        }
        const desiredFacing = (pid === 'p1')
          ? (activeSpace <= oppSpace ? 1 : -1)
          : (activeSpace < oppSpace ? 1 : -1);
        setFighterFacing(f, desiredFacing, 16);
      }
    }

    if (!seenPids.has('p1')) fighters.p1.active = false;
    if (!seenPids.has('p2')) fighters.p2.active = false;
    lastKnownActors = seenPids;
  }

  function notifyBoardMove(info) {
    if (!info || !info.pid || inStrikePlayback) return;
    const f = fighters[info.pid];
    if (!f || !f.active) return;
    syncDomMetrics();

    const p1Pos = info.p1Pos != null ? info.p1Pos : (fighters.p1.space);
    const p2Pos = info.p2Pos != null ? info.p2Pos : (fighters.p2.space);
    const nextX = spaceToX(info.pid, info.nextSpace, p1Pos, p2Pos);
    if (nextX == null) return;

    const prevSpace = f.space;
    f.space = info.nextSpace;
    const deltaSpaces = Math.abs((info.nextSpace || 0) - (prevSpace || 0));
    if (Math.abs(nextX - f.x) < 2 && deltaSpaces === 0) return;

    f.startX = f.x;
    f.targetX = nextX;
    f.moveElapsed = 0;

    const fxKind = info.fxKind || 'move';
    const isPushPull = fxKind === 'push' || fxKind === 'pull';
    const movedForward = (nextX - f.x) * f.facingSign > 0;
    const moveKind = isPushPull ? fxKind : (movedForward ? 'advance' : 'retreat');
    f.moveKind = moveKind;

    const opp = fighters[info.pid === 'p1' ? 'p2' : 'p1'];
    const oppSpace = info.pid === 'p1' ? p2Pos : p1Pos;
    const movedPastOpponent = !!(opp && opp.active && prevSpace !== oppSpace && info.nextSpace !== oppSpace && ((prevSpace < oppSpace) !== (info.nextSpace < oppSpace)));

    if (typeof resolveStandeeChoreography === 'function') {
      const choreo = resolveStandeeChoreography(f.charKey, null, 'move', {
        moveKind,
        spacesMoved: Math.max(1, deltaSpaces),
        sideSwapped: movedPastOpponent,
        exceeded: f.exceeded,
        reducedHitStop: isReducedMotion(),
      });
      f.moveDuration = choreo.durationSec || 0.32;
      startChoreography(f, choreo);
      if (choreo.vfx) spawnStageVfx(f.pid, choreo.vfx);
    } else {
      f.moveDuration = 0.32;
    }
    f.moving = true;

    const nextFacing = (info.pid === 'p1')
      ? (p1Pos <= p2Pos ? 1 : -1)
      : (p2Pos < p1Pos ? 1 : -1);
    setFighterFacing(f, nextFacing, 18);
  }

  function syncAfterRender() {
    if (!mounted) mount();
    if (!mounted) return;
    syncDomMetrics();
  }

  function isFighterActive(pid) {
    const f = fighters[pid];
    return !!(mounted && f && f.active);
  }

  function bindEvents() {
    if (typeof EventBus === 'undefined' || !EventBus.on) return;

    EventBus.on('OnStrikeReveal', (payload) => {
      const si = payload && payload.strikeInfo;
      if (!si || !si.timeline || si.timeline.length === 0) return;
      inStrikePlayback = true;
      const firstStep = si.timeline[0];
      strikeSpaces.p1 = firstStep.p1Pos;
      strikeSpaces.p2 = firstStep.p2Pos;
      dimmerTarget = isReducedMotion() ? 0 : 0.48;
      clashSparkTimer = isReducedMotion() ? 0 : 0.42;
      syncDomMetrics();

      const firstId = si.firstId;
      for (const pid of ['p1', 'p2']) {
        const f = fighters[pid];
        if (!f || !f.active) continue;
        const sx = spaceToX(pid, strikeSpaces[pid], strikeSpaces.p1, strikeSpaces.p2);
        if (sx != null) {
          f.x = sx;
          f.startX = sx;
          f.targetX = sx;
          f.moving = false;
        }
        const fSign = pid === 'p1'
          ? (strikeSpaces.p1 <= strikeSpaces.p2 ? 1 : -1)
          : (strikeSpaces.p2 < strikeSpaces.p1 ? 1 : -1);
        f.facingSign = fSign;
        f.flipStartSign = fSign;
        f.flipTargetSign = fSign;
        f.flipping = false;

        const side = si.sides && si.sides[pid];
        f.lastSideSwapped = false;
        const choreo = resolveStandeeChoreography(f.charKey, side && side.cardKey, 'reveal', {
          isFaster: pid === firstId,
          criticalPaid: !!(side && side.criticalPaid),
          isEX: !!(side && side.isEX),
          exceeded: f.exceeded,
          fromWildSwing: !!(side && side.fromWildSwing),
          reducedHitStop: isReducedMotion(),
        });
        f.zPriority = pid === firstId ? 4 : 3;
        startChoreography(f, choreo);
        if (choreo.vfx) spawnStageVfx(pid, choreo.vfx);
      }
    });

    EventBus.on('OnStrikePhase', (payload) => {
      const step = payload && payload.step;
      const si = payload && payload.strikeInfo;
      if (!step || !si) return;

      let stepSwapped = !!step.sideSwapped;
      let prevP1 = strikeSpaces.p1;
      let prevP2 = strikeSpaces.p2;
      if (step.p1Pos != null && step.p2Pos != null) {
        prevP1 = strikeSpaces.p1;
        prevP2 = strikeSpaces.p2;
        strikeSpaces.p1 = step.p1Pos;
        strikeSpaces.p2 = step.p2Pos;
        const swapped = (prevP1 != null && prevP2 != null) && ((prevP1 < prevP2) !== (strikeSpaces.p1 < strikeSpaces.p2));
        if (swapped) stepSwapped = true;

        let anyMoving = false;
        for (const pid of ['p1', 'p2']) {
          const f = fighters[pid];
          if (!f || !f.active) continue;
          const prevSpace = pid === 'p1' ? prevP1 : prevP2;
          const curSpace = strikeSpaces[pid];
          const movedSpace = prevSpace != null && curSpace != null && prevSpace !== curSpace;
          const nextX = spaceToX(pid, curSpace, strikeSpaces.p1, strikeSpaces.p2);
          if (nextX != null && movedSpace) {
            f.startX = f.x;
            f.targetX = nextX;
            f.moveElapsed = 0;
            f.moveDuration = step.phase === 'after' ? 0.38 : 0.32;
            f.moving = true;
            f.moveKind = step.phase === 'after' ? 'retreat' : 'advance';
            anyMoving = true;
          }
        }
        // Only flip immediately when no fighter is actively translating across the opponent;
        // during cross-up motion, stepFighter flips BOTH fighters cleanly at the exact X-crossover midpoint!
        if (!swapped || !anyMoving || isReducedMotion()) {
          for (const pid of ['p1', 'p2']) {
            const f = fighters[pid];
            if (!f || !f.active) continue;
            const nextFacing = pid === 'p1'
              ? (strikeSpaces.p1 <= strikeSpaces.p2 ? 1 : -1)
              : (strikeSpaces.p2 < strikeSpaces.p1 ? 1 : -1);
            setFighterFacing(f, nextFacing, swapped ? 18 : 14);
          }
        }
      }

      const actorId = step.actor;
      const defId = actorId === 'p1' ? 'p2' : 'p1';
      const att = fighters[actorId];
      const def = fighters[defId];
      const side = actorId && si.sides && si.sides[actorId];
      const distSpaces = Math.max(1, Math.abs((strikeSpaces.p1 || 0) - (strikeSpaces.p2 || 0)));
      const distPx = (att && def && att.active && def.active) ? Math.abs(def.x - att.x) : (distSpaces * 92);

      if (step.phase === 'before' && att && att.active) {
        att.zPriority = 4;
        if (def) def.zPriority = 3;
        if (stepSwapped) att.lastSideSwapped = true;
        const prevActorSpace = actorId === 'p1' ? prevP1 : prevP2;
        const curActorSpace = strikeSpaces[actorId];
        const attMovedOnStep = !!((prevActorSpace != null && curActorSpace != null && prevActorSpace !== curActorSpace) || stepSwapped);
        const cardKeyNorm = String((side && side.cardKey) || '').replace(/^gg_/, '');
        const hasDedicatedBeforePose = (
          cardKeyNorm === 'spiral_arrow' ||
          cardKeyNorm === 'cannonball' ||
          cardKeyNorm === 'dive_kick' ||
          cardKeyNorm === 'razors_edge_slicer' ||
          cardKeyNorm === 'gyro_drive_smasher' ||
          cardKeyNorm === 'flying_power_bomb' ||
          cardKeyNorm === 'siberian_blizzard' ||
          cardKeyNorm === 'dive' ||
          cardKeyNorm === 'tatsumaki_ryu' ||
          cardKeyNorm === 'tatsumaki_ken' ||
          cardKeyNorm === 'guren_senpukyaku' ||
          cardKeyNorm === 'assault' ||
          cardKeyNorm === 'axe_kick'
        );
        // Only play before-movement dash choreography if the attacker actually translates or uses a dedicated Before-phase card;
        // otherwise keep their coiled Reveal windup pose (e.g. Sweep's sweep_windup or Cross's cross_strike) ready for Range/Hit!
        if (attMovedOnStep || hasDedicatedBeforePose) {
          const choreo = resolveStandeeChoreography(att.charKey, side && side.cardKey, 'before', {
            sideSwapped: stepSwapped,
            criticalPaid: !!(side && side.criticalPaid),
            isEX: !!(side && side.isEX),
            exceeded: att.exceeded,
            rangeSpaces: distSpaces,
            distanceToTargetPx: distPx,
            reducedHitStop: isReducedMotion(),
          });
          startChoreography(att, choreo, { distanceToTargetPx: distPx });
          if (choreo.vfx) spawnStageVfx(actorId, choreo.vfx);
        }
      } else if (step.phase === 'range' && step.hitLanded === false && att && att.active) {
        att.zPriority = 4;
        const choreo = resolveStandeeChoreography(att.charKey, side && side.cardKey, 'range', {
          hitLanded: false,
          exceeded: att.exceeded,
          rangeSpaces: distSpaces,
          distanceToTargetPx: distPx,
          reducedHitStop: isReducedMotion(),
        });
        startChoreography(att, choreo, { distanceToTargetPx: distPx });
        if (choreo.projectile) spawnProjectile(actorId, defId, side && side.cardKey, choreo);
      } else if (step.phase === 'after' && att && att.active) {
        const choreo = resolveStandeeChoreography(att.charKey, side && side.cardKey, 'after', {
          criticalPaid: !!(side && side.criticalPaid),
          isEX: !!(side && side.isEX),
          exceeded: att.exceeded,
          sideSwapped: stepSwapped || !!att.lastSideSwapped,
          reducedHitStop: isReducedMotion(),
        });
        startChoreography(att, choreo);
        if (choreo.vfx) spawnStageVfx(actorId, choreo.vfx);
      } else if (step.phase === 'cleanup') {
        dimmerTarget = 0;
        for (const pid of ['p1', 'p2']) {
          const f = fighters[pid];
          if (!f) continue;
          if (f.choreo && f.choreo.phase === 'reveal') {
            f.choreo = null;
            f.choreoElapsed = 0;
          }
          f.zPriority = 2;
          f.desaturateAmount = 0;
          f.wildSwingHazard = false;
          f.lastSideSwapped = false;
        }
      }
    });

    EventBus.on('OnStrikeHit', (payload) => {
      if (!payload) return;
      const attId = payload.actor;
      const defId = payload.defenderId || (attId === 'p1' ? 'p2' : 'p1');
      const att = fighters[attId];
      const def = fighters[defId];
      const si = (typeof G !== 'undefined' && G && G.engine) ? G.engine.lastStrikeInfo : null;
      const attSide = si && si.sides && si.sides[attId];
      const defSide = si && si.sides && si.sides[defId];
      const distSpaces = Math.max(1, Math.abs((strikeSpaces.p1 || (att ? att.space : 2)) - (strikeSpaces.p2 || (def ? def.space : 6))));
      const distPx = (att && def && att.active && def.active) ? Math.abs(def.x - att.x) : (distSpaces * 92);

      if (att && att.active) {
        att.zPriority = 4;
        const attChoreo = resolveStandeeChoreography(att.charKey, attSide && attSide.cardKey, 'hit_attack', {
          damageDealt: payload.damage || 0,
          guardBroken: !!payload.guardBroken,
          isEX: !!payload.isEX,
          criticalPaid: !!payload.criticalPaid,
          exceeded: att.exceeded,
          sideSwapped: !!att.lastSideSwapped,
          rangeSpaces: distSpaces,
          distanceToTargetPx: distPx,
          reducedHitStop: isReducedMotion(),
        });
        startChoreography(att, attChoreo, { distanceToTargetPx: distPx });
        if (attChoreo.projectile) spawnProjectile(attId, defId, attSide && attSide.cardKey, attChoreo);
        if (attChoreo.vfx) spawnStageVfx(attId, attChoreo.vfx);
      }
      if (def && def.active) {
        def.zPriority = 3;
        const defChoreo = resolveStandeeChoreography(def.charKey, defSide && defSide.cardKey, 'hit_defend', {
          damageDealt: payload.damage || 0,
          effectiveArmor: defSide && defSide.effectiveStats ? (defSide.effectiveStats.armor || 0) : 0,
          effectiveGuard: defSide && defSide.effectiveStats ? (defSide.effectiveStats.guard || 0) : 0,
          guardBroken: !!payload.guardBroken,
          exceeded: def.exceeded,
          reducedHitStop: isReducedMotion(),
        });
        startChoreography(def, defChoreo);
        if (defChoreo.vfx) spawnStageVfx(defId, defChoreo.vfx);
      }
    });

    EventBus.on('OnGuardBreak', (payload) => {
      const pid = payload && payload.stunnedPlayerId;
      const f = fighters[pid];
      if (!f || !f.active) return;
      const choreo = resolveStandeeChoreography(f.charKey, null, 'stunned', {
        exceeded: f.exceeded,
        reducedHitStop: isReducedMotion(),
      });
      startChoreography(f, choreo);
    });

    EventBus.on('OnExceedActivated', (payload) => {
      const pid = payload && payload.playerId;
      const f = fighters[pid];
      if (!f || !f.active) return;
      f.exceeded = true;
      const choreo = resolveStandeeChoreography(f.charKey, null, 'exceed', {
        exceeded: true,
        reducedHitStop: isReducedMotion(),
      });
      startChoreography(f, choreo);
      if (choreo.vfx) spawnStageVfx(pid, choreo.vfx);
      dimmerTarget = isReducedMotion() ? 0 : 0.54;
      exceedSequence = {
        pid,
        charKey: f.charKey,
        space: f.space,
        x: f.x,
        groundY: f.groundY,
        width: f.width,
        height: f.height,
        battleCry: choreo.battleCry || (f.charKey === 'ken' ? 'SHORYU FLAME!!' : 'DENJIN KIAI!!'),
        subCry: choreo.subCry || 'EXCEED MODE ACTIVATED',
        elapsed: 0,
        duration: choreo.durationSec || 1.55,
      };
    });

    EventBus.on('OnNeutralAction', (payload) => {
      const pid = payload && payload.playerId;
      const f = fighters[pid];
      if (!f || !f.active) return;
      const phaseKind = payload.kind || 'prepare';
      const choreo = resolveStandeeChoreography(f.charKey, payload.cardKey || null, phaseKind, {
        exceeded: f.exceeded,
        reducedHitStop: isReducedMotion(),
      });
      startChoreography(f, choreo);
      if (choreo.vfx) spawnStageVfx(pid, choreo.vfx);
      syncDomMetrics();
    });

    EventBus.on('OnStrikePlaybackEnd', () => {
      inStrikePlayback = false;
      strikeSpaces.p1 = null;
      strikeSpaces.p2 = null;
      dimmerTarget = 0;
      clashSparkTimer = 0;
      for (const pid of ['p1', 'p2']) {
        const f = fighters[pid];
        if (!f) continue;
        if (f.choreo && f.choreo.phase === 'reveal') {
          f.choreo = null;
          f.choreoElapsed = 0;
        }
        f.zPriority = 2;
        f.desaturateAmount = 0;
        f.wildSwingHazard = false;
        f.lastSideSwapped = false;
      }
      syncDomMetrics();
    });
  }

  function stepFighter(f, dt) {
    if (!f.active) return;

    // Smooth spotlight dimmer convergence
    if (f.hitstopRemaining > 0) {
      f.hitstopRemaining = Math.max(0, f.hitstopRemaining - dt);
    }
    if (f.flashRemaining > 0) {
      f.flashRemaining = Math.max(0, f.flashRemaining - dt);
    }
    if (f.shudderRemaining > 0) {
      f.shudderRemaining = Math.max(0, f.shudderRemaining - dt);
    }
    if (f.ironWallChainsTimer > 0) {
      f.ironWallChainsTimer = Math.max(0, f.ironWallChainsTimer - dt);
    }
    if (f.cammyCrossUpFlashTimer > 0) {
      f.cammyCrossUpFlashTimer = Math.max(0, f.cammyCrossUpFlashTimer - dt);
    }

    // Rig spring pauses during hitstopRemaining > 0
    if (typeof StandeeRigMath !== 'undefined') {
      StandeeRigMath.stepSpring(f.spring, dt, f.springStiffness, f.springDamping, f.hitstopRemaining);
    }

    // Horizontal translation (monotone cubic Hermite / quintic ease) + Midpoint X-Crossover Flip
    let prevX = f.x;
    const opp = fighters[f.pid === 'p1' ? 'p2' : 'p1'];
    if (f.moving && f.hitstopRemaining <= 0) {
      f.moveElapsed += dt;
      const u = Math.min(1, f.moveElapsed / Math.max(0.05, f.moveDuration));
      const e = (typeof StandeeRigMath !== 'undefined') ? StandeeRigMath.quinticEase(u) : u;
      f.x = f.startX + (f.targetX - f.startX) * e;
      f.vx = dt > 0 ? (f.x - prevX) / dt : 0;

      // Exact Midpoint Crossover Flip & Camera Pan when crossing opponent on X-axis
      if (opp && opp.active) {
        const prevDiff = prevX - opp.x;
        const curDiff = f.x - opp.x;
        if ((prevDiff < 0 && curDiff >= 0) || (prevDiff > 0 && curDiff <= 0)) {
          const crossSign = curDiff <= 0 ? 1 : -1;
          setFighterFacing(f, crossSign, 24);
          setFighterFacing(opp, -crossSign, 18);
          const crossTrailColor = f.charKey === 'cammy'
            ? '#10b981'
            : (f.charKey === 'zangief' ? '#ef4444' : (f.charKey === 'ken' ? '#ffb703' : '#4de6d1'));
          spawnAfterimage(f, 0.40, crossTrailColor);
          if (f.charKey === 'cammy' && !isReducedMotion()) {
            // Cammy's Cross-Up Aura: sharp green flash triggers on her red heels signaling +1 Power & Advantage!
            f.cammyCrossUpFlashTimer = 0.85;
            f.lastSideSwapped = true;
            f.flashDuration = 0.068;
            f.flashRemaining = 0.068;
            f.flashColorRgb = hexToRgbNorm('#10b981');
            spawnStageVfx(f.pid, { type: 'cammy_heel_crossup_flash', color: '#10b981', accent: '#ff2a4b' });
          }
          triggerCameraEffect(0.015, 0, -crossSign * 6);
        }
      }

      if (u >= 1) {
        f.x = f.targetX;
        f.moving = false;
        f.vx = 0;
        if (opp && opp.active) {
          const finalSign = f.pid === 'p1'
            ? (f.space <= opp.space ? 1 : -1)
            : (f.space < opp.space ? 1 : -1);
          setFighterFacing(f, finalSign, 16);
        }
        if (f.choreo && f.choreo.springPreset && f.choreo.springPreset.landingScaleX) {
          StandeeRigMath.applySpringImpulse(
            f.spring,
            f.choreo.springPreset.landingScaleX,
            f.choreo.springPreset.landingScaleY
          );
        }
      }
    } else {
      f.vx *= Math.max(0, 1 - dt * 14);
    }

    // 2.5D Paper-Mario cosine flip
    if (f.flipping && f.hitstopRemaining <= 0) {
      f.flipElapsed += dt;
      const u = Math.min(1, f.flipElapsed / Math.max(0.05, f.flipDuration));
      if (u >= 1) {
        f.facingSign = f.flipTargetSign;
        f.flipping = false;
      }
    }

    // Advance Track 1 active choreography timer
    if (f.choreo && f.hitstopRemaining <= 0) {
      if (f.choreo.holdAtU != null) {
        f.choreoElapsed = f.choreo.holdAtU * f.choreoDuration;
      } else {
        f.choreoElapsed += dt;
        if (f.choreoElapsed >= f.choreoDuration) {
          if (inStrikePlayback && f.choreo.phase === 'reveal') {
            f.choreoElapsed = f.choreoDuration;
          } else {
            f.choreo = null;
            f.choreoElapsed = 0;
            f.desaturateAmount = 0;
            f.wildSwingHazard = false;
          }
        }
      }
    }

    // Advance Track 2 additive flinch choreography timer
    if (f.additiveChoreo && f.hitstopRemaining <= 0) {
      f.additiveElapsed += dt;
      if (f.additiveElapsed >= f.additiveDuration) {
        f.additiveChoreo = null;
        f.additiveElapsed = 0;
      }
    }

    // Spawn sprint / Tatsumaki / backflip afterimages
    if (f.afterimageLeft > 0 && f.afterimageCfg && f.hitstopRemaining <= 0) {
      f.afterimageCooldown -= dt;
      if (f.afterimageCooldown <= 0) {
        spawnAfterimage(f, f.afterimageCfg.alpha, f.afterimageCfg.color);
        f.afterimageLeft--;
        f.afterimageCooldown = (f.afterimageCfg.spacingMs || 28) / 1000;
      }
    }

    // Dynamic VFX Scaling decay + Exceeded movement ghost trail
    if (f.auraFlare > 0) {
      f.auraFlare = Math.max(0, f.auraFlare - dt * 2.4);
    }
    if (f.exceeded && f.moving && !isReducedMotion()) {
      f.exceedTrailTimer -= dt;
      if (f.exceedTrailTimer <= 0) {
        const trailColor = f.charKey === 'ken'
          ? '#ff5f38'
          : (f.charKey === 'cammy' ? '#10b981' : (f.charKey === 'zangief' ? '#ef4444' : '#38bdf8'));
        spawnAfterimage(f, 0.28, trailColor);
        f.exceedTrailTimer = 0.038;
      }
    }

    // Compose 4-Knot Spine targets: Idle breath (with Exceeded lower/tenser crouch) + Track 1 + Track 2
    const knots = f.spineKnots;
    StandeeRigMath.resetFourKnotSpine(knots);

    const idleSpec = resolveStandeeChoreography(f.charKey, null, 'idle', { exceeded: f.exceeded });
    const freq = idleSpec.idleFreqHz || 1.2;
    const amp = idleSpec.idleAmpScale || 0.015;
    const lean = idleSpec.idleLeanPx || 1.2;
    const phaseOff = f.pid === 'p2' ? 1.7 : 0.0;
    const breath = Math.sin(stageClockSec * Math.PI * 2 * freq + phaseOff);
    const breath2 = Math.cos(stageClockSec * Math.PI * 2 * freq * 0.5 + phaseOff);

    // Base idle stance crouch/lean (Exceeded mode has lower, tenser crouch)
    for (let k = 1; k <= 3; k++) {
      const ik = k === 1 ? idleSpec.pelvis : (k === 2 ? idleSpec.waist : idleSpec.head);
      if (ik) {
        knots[k].dx += ik.dx || 0;
        knots[k].dy += ik.dy || 0;
        knots[k].rotRad += ik.rotRad || 0;
        knots[k].scaleX *= (ik.scaleX != null ? ik.scaleX : 1);
      }
    }

    // Subtle idle breathing (feet knot[0] stays strictly 0)
    knots[1].dy += breath * 1.4;
    knots[2].dy += breath * 2.2;
    knots[2].dx += breath2 * lean;
    knots[2].scaleX *= (1 + breath * amp);
    knots[3].dy += breath * 2.8;
    knots[3].dx += breath2 * lean * 1.2;
    knots[3].rotRad += breath2 * 0.012;

    if (f.choreo) {
      const rawU = f.choreoDuration > 0 ? Math.min(1, f.choreoElapsed / f.choreoDuration) : 1;
      // During hitstop freeze on impact (hit_attack / hit_defend), evaluate spine & clip envelope
      // at peak active contact (u >= 0.28) so the fighter freezes in the full strike pose!
      const u = (f.hitstopRemaining > 0 && (f.choreo.phase === 'hit_attack' || f.choreo.phase === 'hit_defend'))
        ? Math.max(0.28, rawU)
        : rawU;
      let env = 1.0;
      let stumble = 0;
      if (f.choreo.clipMode === 'attack_3clip' || f.choreo.clipMode === 'whiff_3clip') {
        const clipEnv = StandeeRigMath.computeClipEnvelope(u, f.choreo.clipMode === 'whiff_3clip');
        env = clipEnv.poseWeight;
        stumble = clipEnv.stumbleWeight;
      } else {
        env = u < 0.2 ? StandeeRigMath.quinticEase(u / 0.2)
          : (u > 0.72 ? StandeeRigMath.quinticEase((1 - u) / 0.28) : 1.0);
      }

      for (let k = 1; k <= 3; k++) {
        const srcKnot = k === 1 ? f.choreo.pelvis : (k === 2 ? f.choreo.waist : f.choreo.head);
        if (!srcKnot) continue;
        knots[k].dx += (srcKnot.dx || 0) * env;
        knots[k].dy += (srcKnot.dy || 0) * env;
        knots[k].rotRad += (srcKnot.rotRad || 0) * env;
        knots[k].scaleX *= (1 + ((srcKnot.scaleX != null ? srcKnot.scaleX : 1) - 1) * env);
      }
      if (stumble !== 0) {
        knots[2].dx += stumble * 12;
        knots[2].rotRad += stumble * 0.11;
        knots[3].dx += stumble * 16;
        knots[3].rotRad += stumble * 0.14;
      }
    }

    // Track 2 Additive Flinch ("Super Armor" Grit / Guard Brace on top of active windup)
    if (f.additiveChoreo) {
      const rawAu = f.additiveDuration > 0 ? Math.min(1, f.additiveElapsed / f.additiveDuration) : 1;
      const au = f.hitstopRemaining > 0 ? Math.max(0.5, rawAu) : rawAu;
      const aEnv = Math.sin(au * Math.PI);
      for (let k = 1; k <= 3; k++) {
        const srcKnot = k === 1 ? f.additiveChoreo.pelvis : (k === 2 ? f.additiveChoreo.waist : f.additiveChoreo.head);
        if (!srcKnot) continue;
        knots[k].dx += (srcKnot.dx || 0) * aEnv;
        knots[k].dy += (srcKnot.dy || 0) * aEnv;
        knots[k].rotRad += (srcKnot.rotRad || 0) * aEnv;
        knots[k].scaleX *= (1 + ((srcKnot.scaleX != null ? srcKnot.scaleX : 1) - 1) * aEnv);
      }
    }
    f.activeFrameKey = getFighterActiveFrameKey(f);
  }

  function computeFighterLungeOffsetX(f) {
    if (!f.choreo || !f.choreoDuration || f.choreoDuration <= 0) return 0;
    const rawU = Math.min(1, f.choreoElapsed / f.choreoDuration);
    const u = (f.hitstopRemaining > 0 && f.choreo.phase === 'hit_attack') ? Math.max(0.28, rawU) : rawU;
    if (f.choreo.dynamicLunge && typeof StandeeRigMath !== 'undefined' && StandeeRigMath.computeDynamicLungeOffset) {
      const isProj = !!f.choreo.projectile;
      const isWhiff = f.choreo.clipMode === 'whiff_3clip';
      const dist = StandeeRigMath.computeDynamicLungeOffset(u, f.choreo.lungePx || 0, f.choreoTargetDistPx || 0, isProj, isWhiff);
      return dist * f.facingSign;
    }
    if (f.choreo.lungePx) {
      const lungeEnv = Math.sin(Math.min(1, u * 1.35) * Math.PI);
      return f.choreo.lungePx * lungeEnv * f.facingSign;
    }
    return 0;
  }

  function populateMeshVertices(f, isReflection) {
    if (!vertexBuf) return;
    const frameKey = getFighterActiveFrameKey(f);
    f.activeFrameKey = frameKey;
    const cal = (typeof StandeeAssets !== 'undefined')
      ? (StandeeAssets.getFrameCalibration
        ? StandeeAssets.getFrameCalibration(f.charKey, frameKey)
        : (StandeeAssets.getCalibration ? StandeeAssets.getCalibration(f.charKey) : null))
      : null;

    let facingScale = f.facingSign;
    let hopY = computeCurrentHopY(f);
    if (f.flipping) {
      const flipU = Math.min(1, f.flipElapsed / Math.max(0.05, f.flipDuration));
      const fs = StandeeRigMath.stepHorizontalFlip(flipU, f.flipStartSign, f.flipTargetSign, f.flipHopHeight);
      facingScale = fs.scaleX;
    }
    const spinState = computeCurrentSpinState(f);
    facingScale *= spinState.horizSpinScaleX;

    const lungeOffsetX = computeFighterLungeOffsetX(f);

    let shudderX = 0;
    if (f.hitstopRemaining > 0 && f.shudderHz > 0) {
      shudderX = Math.sin(stageClockSec * Math.PI * 2 * 38) * 5.0;
    } else if (f.shudderRemaining > 0 && f.shudderHz > 0) {
      const dec = Math.exp(-4 * (0.45 - Math.min(0.45, f.shudderRemaining)));
      shudderX = Math.sin(stageClockSec * Math.PI * 2 * f.shudderHz) * 4.5 * dec;
    }

    const wholeRotRad = spinState.wholeRotRad;

    _meshParams.anchorXRatio = cal ? cal.anchorXRatio : 0.5;
    _meshParams.footBottomRatio = cal ? cal.footBottomRatio : 0.98;
    _meshParams.width = f.width;
    _meshParams.height = f.height;
    _meshParams.anchorX = f.x + lungeOffsetX + shudderX;
    _meshParams.groundY = f.groundY;
    _meshParams.facingScale = facingScale;
    _meshParams.spring = f.spring;
    _meshParams.hopOffsetY = isReflection ? -hopY * 0.32 : hopY;
    _meshParams.wholeRotRad = isReflection ? -wholeRotRad : wholeRotRad;

    const baseAlpha = isReflection ? 0.20 : 1.0;

    let ptr = 0;
    for (let r = 0; r < VERTEX_ROWS; r++) {
      const h = r / GRID_ROWS; // 0 (feet) .. 1 (head)
      const vCoord = 1 - h;
      StandeeRigMath.evalFourKnotSpine(f.spineKnots, h, _spineOut);
      const shearPx = StandeeRigMath.stepHorizontalVelocityShear(f.vx, h);
      _meshParams.shearPx = shearPx;

      for (let c = 0; c < VERTEX_COLS; c++) {
        const uCoord = c / GRID_COLS;
        StandeeRigMath.computeDeformedMeshVertex(uCoord, h, _meshParams, _vertOut);
        let wy = _vertOut.y;
        if (isReflection) {
          wy = f.groundY + (f.groundY - wy) * 0.32;
        }
        vertexBuf[ptr++] = _vertOut.x;
        vertexBuf[ptr++] = wy;
        vertexBuf[ptr++] = uCoord;
        vertexBuf[ptr++] = vCoord;
        vertexBuf[ptr++] = uCoord;
        vertexBuf[ptr++] = vCoord;
        vertexBuf[ptr++] = h;
        vertexBuf[ptr++] = baseAlpha;
      }
    }
  }

  function populateAfterimageVertices(ai) {
    if (!vertexBuf) return;
    const cal = (typeof StandeeAssets !== 'undefined')
      ? (StandeeAssets.getFrameCalibration
        ? StandeeAssets.getFrameCalibration(ai.charKey, ai.frameKey || 'idle')
        : (StandeeAssets.getCalibration ? StandeeAssets.getCalibration(ai.charKey) : null))
      : null;

    _meshParams.anchorXRatio = cal ? cal.anchorXRatio : 0.5;
    _meshParams.footBottomRatio = cal ? cal.footBottomRatio : 0.98;
    _meshParams.width = ai.width;
    _meshParams.height = ai.height;
    _meshParams.anchorX = ai.x;
    _meshParams.groundY = ai.groundY;
    _meshParams.facingScale = ai.facingSign;
    _meshParams.spring = { scaleX: ai.scaleX, scaleY: ai.scaleY };
    _meshParams.hopOffsetY = ai.hopOffsetY || 0;
    _meshParams.wholeRotRad = ai.wholeRotRad || 0;

    let ptr = 0;
    for (let r = 0; r < VERTEX_ROWS; r++) {
      const h = r / GRID_ROWS;
      const vCoord = 1 - h;
      StandeeRigMath.evalFourKnotSpine(ai.knots, h, _spineOut);
      _meshParams.shearPx = StandeeRigMath.stepHorizontalVelocityShear(ai.vx || 0, h);
      for (let c = 0; c < VERTEX_COLS; c++) {
        const uCoord = c / GRID_COLS;
        StandeeRigMath.computeDeformedMeshVertex(uCoord, h, _meshParams, _vertOut);
        vertexBuf[ptr++] = _vertOut.x;
        vertexBuf[ptr++] = _vertOut.y;
        vertexBuf[ptr++] = uCoord;
        vertexBuf[ptr++] = vCoord;
        vertexBuf[ptr++] = uCoord;
        vertexBuf[ptr++] = vCoord;
        vertexBuf[ptr++] = h;
        vertexBuf[ptr++] = ai.alpha;
      }
    }
  }

  function renderWebGL2(activeList) {
    gl.viewport(0, 0, glCanvas.width, glCanvas.height);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (activeList.length === 0) return;

    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform2f(uniforms.u_resolution, viewportW, viewportH);
    gl.uniform1i(uniforms.u_tex, 0);

    // Pass 1A: Scissor-clipped Planar Ground Reflections
    if (boardBounds && boardBounds.width > 0 && boardBounds.height > 0) {
      const sx = Math.max(0, Math.floor(boardBounds.left * dpr));
      const sy = Math.max(0, Math.floor((viewportH - (boardBounds.bottom + 14)) * dpr));
      const sw = Math.max(1, Math.floor(boardBounds.width * dpr));
      const sh = Math.max(1, Math.floor((boardBounds.height + 14) * dpr));
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(sx, sy, sw, sh);

      for (const f of activeList) {
        const frameKey = getFighterActiveFrameKey(f);
        const texEntry = getOrUploadTexture(f.charKey, frameKey);
        if (!texEntry) continue;
        populateMeshVertices(f, true);
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertexBuf);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texEntry.tex);
        gl.uniform3f(uniforms.u_flashColor, 1, 1, 1);
        gl.uniform1f(uniforms.u_flashAmount, 0);
        gl.uniform3f(uniforms.u_tintColor, 0, 0, 0);
        gl.uniform1f(uniforms.u_tintAmount, 0);
        gl.uniform3f(uniforms.u_rimColor, 0, 0, 0);
        gl.uniform1f(uniforms.u_rimStrength, 0);
        gl.uniform1f(uniforms.u_desaturate, 0.25);
        gl.uniform1f(uniforms.u_reflectFade, 1.35);
        gl.drawElements(gl.TRIANGLES, INDEX_COUNT, gl.UNSIGNED_SHORT, 0);
      }
      gl.disable(gl.SCISSOR_TEST);
    }

    // Pass 1B: Motion Afterimages
    for (const ai of afterimages) {
      const texEntry = getOrUploadTexture(ai.charKey, ai.frameKey || 'idle');
      if (!texEntry) continue;
      populateAfterimageVertices(ai);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertexBuf);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texEntry.tex);
      gl.uniform3f(uniforms.u_flashColor, 1, 1, 1);
      gl.uniform1f(uniforms.u_flashAmount, 0);
      gl.uniform3f(uniforms.u_tintColor, ai.tint[0], ai.tint[1], ai.tint[2]);
      gl.uniform1f(uniforms.u_tintAmount, 0.72);
      gl.uniform3f(uniforms.u_rimColor, ai.tint[0], ai.tint[1], ai.tint[2]);
      gl.uniform1f(uniforms.u_rimStrength, 0.65);
      gl.uniform1f(uniforms.u_desaturate, 0.5);
      gl.uniform1f(uniforms.u_reflectFade, 0);
      gl.drawElements(gl.TRIANGLES, INDEX_COUNT, gl.UNSIGNED_SHORT, 0);
    }

    // Pass 1C: Active Standees sorted by zPriority with Fresnel Rim Lighting (Silhouette Saver)
    for (const f of activeList) {
      const frameKey = getFighterActiveFrameKey(f);
      const texEntry = getOrUploadTexture(f.charKey, frameKey);
      if (!texEntry) continue;
      populateMeshVertices(f, false);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertexBuf);

      const flashAmt = f.flashRemaining > 0
        ? Math.min(1, f.flashRemaining / Math.max(0.01, f.flashDuration))
        : 0;
      const fc = f.flashColorRgb || [1, 1, 1];

      // Keep interior sprite 100% crisp (tintAmt = 0 unless desaturated by Stun).
      // Use Fresnel Rim Light (u_rimColor, u_rimStrength) around the outer silhouette edge
      // for Exceed Mode, Active Boosts, and Startup Flare!
      let tintR = 0.25, tintG = 0.35, tintB = 0.50, tintAmt = 0;
      let rimR = 0, rimG = 0, rimB = 0, rimStrength = 0;
      if (f.desaturateAmount > 0) {
        tintAmt = 0.22;
      } else if (f.exceeded || f.activeBoostCount > 0 || f.auraFlare > 0.05) {
        const isKen = f.charKey === 'ken';
        const isCammy = f.charKey === 'cammy';
        const isZangief = f.charKey === 'zangief';
        const breathFreq = isCammy ? 2.45 : (isKen ? 2.15 : (isZangief ? 1.80 : 1.55));
        const pulse = 0.5 + 0.5 * Math.sin(stageClockSec * Math.PI * 2 * breathFreq + (f.pid === 'p2' ? 1.4 : 0));
        const boostStack = Math.min(0.35, (f.activeBoostCount || 0) * 0.16);
        const flareBoost = (f.auraFlare || 0) * 0.55;

        if (isCammy) {
          // Cammy: Delta Red Emerald-and-Cyan high-velocity Fresnel rim light
          rimR = 0.08 + 0.12 * pulse;
          rimG = 0.86 + 0.14 * pulse;
          rimB = 0.60 + 0.28 * pulse;
        } else if (isZangief) {
          // Zangief: Red Cyclone Crimson-and-Gold Super-Armor Fresnel rim light
          rimR = 1.0;
          rimG = 0.20 + 0.34 * pulse;
          rimB = 0.10;
        } else if (isKen) {
          // Ken: Crimson-and-Gold fiery Fresnel rim light
          rimR = 1.0;
          rimG = 0.46 + 0.22 * pulse;
          rimB = 0.12;
        } else {
          // Ryu: Focused White-and-Cobalt Denjin electric Fresnel rim light
          rimR = 0.32 + 0.45 * pulse;
          rimG = 0.78 + 0.18 * pulse;
          rimB = 1.0;
        }
        const baseRim = f.exceeded ? (0.72 + 0.24 * pulse) : (f.activeBoostCount > 0 ? 0.44 : 0.18);
        rimStrength = Math.min(1.45, baseRim + boostStack + flareBoost);
      }

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texEntry.tex);
      gl.uniform3f(uniforms.u_flashColor, fc[0], fc[1], fc[2]);
      gl.uniform1f(uniforms.u_flashAmount, flashAmt);
      gl.uniform3f(uniforms.u_tintColor, tintR, tintG, tintB);
      gl.uniform1f(uniforms.u_tintAmount, tintAmt);
      gl.uniform3f(uniforms.u_rimColor, rimR, rimG, rimB);
      gl.uniform1f(uniforms.u_rimStrength, rimStrength);
      gl.uniform1f(uniforms.u_desaturate, f.desaturateAmount || 0);
      gl.uniform1f(uniforms.u_reflectFade, 0);
      gl.drawElements(gl.TRIANGLES, INDEX_COUNT, gl.UNSIGNED_SHORT, 0);
    }

    gl.bindVertexArray(null);
  }

  function renderCanvas2DFallback(activeList) {
    if (!fallback2dCtx) return;
    const c = fallback2dCtx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, viewportW, viewportH);

    // Draw decaying afterimages in fallback mode too
    for (const ai of afterimages) {
      const surface = (typeof StandeeAssets !== 'undefined')
        ? (StandeeAssets.getFrameSurface
          ? StandeeAssets.getFrameSurface(ai.charKey, ai.frameKey || 'idle')
          : (StandeeAssets.getSurface ? StandeeAssets.getSurface(ai.charKey) : null))
        : null;
      if (!surface) continue;
      const cal = (typeof StandeeAssets !== 'undefined')
        ? (StandeeAssets.getFrameCalibration
          ? StandeeAssets.getFrameCalibration(ai.charKey, ai.frameKey || 'idle')
          : (StandeeAssets.getCalibration ? StandeeAssets.getCalibration(ai.charKey) : null))
        : null;
      const ax = cal ? cal.anchorXRatio : 0.5;
      const fb = cal ? cal.footBottomRatio : 0.98;
      c.save();
      c.globalAlpha = Math.max(0, Math.min(0.45, ai.alpha));
      c.translate(ai.x, ai.groundY + (ai.hopOffsetY || 0));
      if (ai.wholeRotRad) {
        c.translate(0, -ai.height * 0.38);
        c.rotate(ai.wholeRotRad);
        c.translate(0, ai.height * 0.38);
      }
      c.scale(ai.facingSign * ai.scaleX, ai.scaleY);
      c.drawImage(surface, -ai.width * ax, -ai.height * fb, ai.width, ai.height);
      c.restore();
    }

    for (const f of activeList) {
      const frameKey = getFighterActiveFrameKey(f);
      f.activeFrameKey = frameKey;
      const surface = (typeof StandeeAssets !== 'undefined')
        ? (StandeeAssets.getFrameSurface
          ? StandeeAssets.getFrameSurface(f.charKey, frameKey)
          : (StandeeAssets.getSurface ? StandeeAssets.getSurface(f.charKey) : null))
        : null;
      if (!surface) continue;
      const hopY = computeCurrentHopY(f);
      const lungeX = computeFighterLungeOffsetX(f);
      const spinState = computeCurrentSpinState(f);
      let facingScale = f.facingSign;
      if (f.flipping) {
        const flipU = Math.min(1, f.flipElapsed / Math.max(0.05, f.flipDuration));
        facingScale = StandeeRigMath.stepHorizontalFlip(flipU, f.flipStartSign, f.flipTargetSign, f.flipHopHeight).scaleX;
      }
      facingScale *= spinState.horizSpinScaleX;
      const cal = (typeof StandeeAssets !== 'undefined')
        ? (StandeeAssets.getFrameCalibration
          ? StandeeAssets.getFrameCalibration(f.charKey, frameKey)
          : (StandeeAssets.getCalibration ? StandeeAssets.getCalibration(f.charKey) : null))
        : null;
      const ax = cal ? cal.anchorXRatio : 0.5;
      const fb = cal ? cal.footBottomRatio : 0.98;
      c.save();
      c.translate(f.x + lungeX, f.groundY + hopY);
      if (spinState.wholeRotRad) {
        c.translate(0, -f.height * 0.38);
        c.rotate(spinState.wholeRotRad);
        c.translate(0, f.height * 0.38);
      }
      c.scale(facingScale * f.spring.scaleX, f.spring.scaleY);
      c.drawImage(surface, -f.width * ax, -f.height * fb, f.width, f.height);
      c.restore();
    }
  }

  // Helper to draw jagged Denjin lightning arc between two points (x0,y0) -> (x1,y1)
  function drawLightningArc(c, x0, y0, x1, y1, segments, jitterPx, seed) {
    c.beginPath();
    c.moveTo(x0, y0);
    for (let s = 1; s < segments; s++) {
      const t = s / segments;
      const bx = x0 + (x1 - x0) * t;
      const by = y0 + (y1 - y0) * t;
      const n1 = Math.sin(seed * 13.7 + s * 7.3) * jitterPx;
      const n2 = Math.cos(seed * 19.1 + s * 5.9) * jitterPx;
      c.lineTo(bx + n1, by + n2);
    }
    c.lineTo(x1, y1);
    c.stroke();
  }

  function renderVfxLayer(dt, activeList) {
    if (!vfxCtx) return;
    const c = vfxCtx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, viewportW, viewportH);

    // Spotlight backdrop dimmer behind standees during Strike Reveal / Resolution / Exceed Awakening
    dimmerAlpha += (dimmerTarget - dimmerAlpha) * Math.min(1, dt * 10);
    if (dimmerAlpha > 0.01 && boardBounds) {
      const grad = c.createRadialGradient(
        boardBounds.left + boardBounds.width * 0.5,
        boardBounds.top + boardBounds.height * 0.55,
        Math.min(viewportW, viewportH) * 0.14,
        boardBounds.left + boardBounds.width * 0.5,
        boardBounds.top + boardBounds.height * 0.55,
        Math.max(viewportW, viewportH) * 0.65
      );
      grad.addColorStop(0, `rgba(6, 9, 18, ${(dimmerAlpha * 0.15).toFixed(3)})`);
      grad.addColorStop(1, `rgba(4, 6, 14, ${dimmerAlpha.toFixed(3)})`);
      c.fillStyle = grad;
      c.fillRect(0, 0, viewportW, viewportH);
    }

    // 1.55s Exceed Mode Activation Sequence: 9-Space Outward Grid Shockwave + Battle Cry Flare
    if (exceedSequence) {
      exceedSequence.elapsed += dt;
      const et = Math.min(1, exceedSequence.elapsed / Math.max(0.2, exceedSequence.duration));
      const isKen = exceedSequence.charKey === 'ken';
      const isCammy = exceedSequence.charKey === 'cammy';
      const isZangief = exceedSequence.charKey === 'zangief';
      const waveColor = isCammy ? '#10b981' : (isZangief ? '#ef4444' : (isKen ? '#ff5f38' : '#38bdf8'));
      const coreColor = isCammy ? '#a7f3d0' : (isZangief ? '#fde047' : (isKen ? '#fde047' : '#e0f2fe'));
      const fAct = fighters[exceedSequence.pid];
      const cx = (fAct && fAct.active) ? fAct.x : exceedSequence.x;
      const gy = (fAct && fAct.active) ? fAct.groundY : exceedSequence.groundY;
      const fh = (fAct && fAct.active) ? fAct.height : exceedSequence.height;

      c.save();
      c.globalCompositeOperation = 'lighter';

      // Outward shockwave rippling across the 9-space track
      const waveFrontSpaces = et * 10.5;
      for (let sp = 0; sp < 9; sp++) {
        const sr = spaceRects[sp];
        if (!sr) continue;
        const distSp = Math.abs(sp - (exceedSequence.space || 0));
        const waveDelta = waveFrontSpaces - distSp;
        if (waveDelta > 0 && waveDelta < 3.2) {
          const cellAlpha = Math.sin((waveDelta / 3.2) * Math.PI) * (1 - et * 0.45);
          c.strokeStyle = waveColor;
          c.lineWidth = 3;
          c.globalAlpha = Math.max(0, cellAlpha * 0.75);
          c.strokeRect(sr.left + 2, sr.top + 2, sr.width - 4, sr.height - 4);
        }
      }

      // Expanding radial ground shockwave rings
      for (let rIdx = 0; rIdx < 2; rIdx++) {
        const rt = Math.max(0, Math.min(1, (et - rIdx * 0.12) / 0.75));
        if (rt > 0 && rt < 1) {
          c.strokeStyle = rIdx === 0 ? coreColor : waveColor;
          c.lineWidth = (1 - rt) * 6;
          c.globalAlpha = (1 - rt) * 0.85;
          c.beginPath();
          c.ellipse(cx, gy - 4, 24 + rt * 260, 8 + rt * 44, 0, 0, Math.PI * 2);
          c.stroke();
        }
      }

      // Vertical Awakening Pillar (subtle silhouette framing so fighter stays crisp) & Auto-Sized Battle Cry Callout
      const pillarAlpha = et < 0.15 ? (et / 0.15) : (1 - (et - 0.15) / 0.85);
      if (pillarAlpha > 0.02) {
        const pGrad = c.createLinearGradient(cx, gy, cx, gy - fh * 1.38);
        pGrad.addColorStop(
          0,
          isCammy
            ? 'rgba(16, 185, 129, 0.30)'
            : (isZangief ? 'rgba(239, 68, 68, 0.32)' : (isKen ? 'rgba(255, 95, 56, 0.30)' : 'rgba(56, 189, 248, 0.30)'))
        );
        pGrad.addColorStop(
          0.55,
          isCammy
            ? 'rgba(167, 243, 208, 0.14)'
            : (isZangief ? 'rgba(253, 224, 71, 0.14)' : (isKen ? 'rgba(253, 224, 71, 0.14)' : 'rgba(224, 242, 254, 0.14)'))
        );
        pGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        c.globalAlpha = Math.max(0, pillarAlpha * 0.85);
        c.fillStyle = pGrad;
        c.beginPath();
        c.ellipse(cx, gy - fh * 0.56, exceedSequence.width * (0.52 + 0.10 * Math.sin(et * 18)), fh * 0.70, 0, 0, Math.PI * 2);
        c.fill();

        // Arcade Battle Cry Text above fighter — dynamically sized to text width, crisp & viewport clamped
        c.globalCompositeOperation = 'source-over';
        c.globalAlpha = Math.min(1, pillarAlpha * 1.65);
        c.font = '900 15.5px "Cinzel", "Georgia", serif';
        const wCry = c.measureText(exceedSequence.battleCry || '').width;
        c.font = '800 9.5px system-ui, sans-serif';
        const wSub = c.measureText(exceedSequence.subCry || '').width;
        const plateW = Math.max(248, Math.ceil(Math.max(wCry, wSub)) + 32);
        const halfW = plateW * 0.5;
        const bannerCx = Math.max(halfW + 12, Math.min(viewportW - halfW - 12, cx));
        const bannerY = Math.max(44, gy - fh - 30 - et * 8);

        c.fillStyle = 'rgba(6, 10, 22, 0.92)';
        c.strokeStyle = waveColor;
        c.lineWidth = 1.6;
        c.beginPath();
        c.roundRect(bannerCx - halfW, bannerY - 22, plateW, 36, 6);
        c.fill();
        c.stroke();

        c.font = '900 15.5px "Cinzel", "Georgia", serif';
        c.textAlign = 'center';
        c.fillStyle = coreColor;
        c.shadowColor = waveColor;
        c.shadowBlur = 10;
        c.fillText(exceedSequence.battleCry, bannerCx, bannerY - 5);
        c.shadowBlur = 0;
        c.font = '800 9.5px system-ui, sans-serif';
        c.fillStyle = '#e2e8f0';
        c.fillText(exceedSequence.subCry, bannerCx, bannerY + 9);
      }
      c.restore();

      if (et >= 1) {
        exceedSequence = null;
        if (!inStrikePlayback) dimmerTarget = 0;
      }
    }

    // Persistent Character-Specific Exceed Aura + Dynamic Action Scaling + Boost/Overdrive Synergy + Passives
    for (const f of activeList) {
      const hasExceed = !!f.exceeded;
      const boostCount = f.activeBoostCount || 0;
      const flare = f.auraFlare || 0;
      const isCammy = f.charKey === 'cammy';
      const isZangief = f.charKey === 'zangief';
      const isKen = f.charKey === 'ken';
      const hasIronWallChains = (f.ironWallChainsTimer || 0) > 0;
      const hasCammyCrossUpFlash = (f.cammyCrossUpFlashTimer || 0) > 0;
      // Cammy's iconic red boots also emit a subtle kinetic boot-sheen when moving or striking even before Exceed
      const cammyBootActive = isCammy && (f.moving || !!f.choreo || hasCammyCrossUpFlash);
      if (!hasExceed && boostCount === 0 && flare <= 0.05 && !cammyBootActive && !hasIronWallChains && !f.wildSwingHazard) continue;

      const hopY = computeCurrentHopY(f);
      const lungeX = computeFighterLungeOffsetX(f);
      const fx = f.x + lungeX;
      const fy = f.groundY + hopY;

      const activeFrameKey = getFighterActiveFrameKey(f);
      const cal = (typeof StandeeAssets !== 'undefined')
        ? (StandeeAssets.getFrameCalibration
          ? StandeeAssets.getFrameCalibration(f.charKey, activeFrameKey)
          : (StandeeAssets.getCalibration ? StandeeAssets.getCalibration(f.charKey) : null))
        : null;
      let facingScale = f.facingSign;
      if (f.flipping && typeof StandeeRigMath !== 'undefined') {
        const flipU = Math.min(1, f.flipElapsed / Math.max(0.05, f.flipDuration));
        const fs = StandeeRigMath.stepHorizontalFlip(flipU, f.flipStartSign, f.flipTargetSign, f.flipHopHeight);
        facingScale = fs.scaleX;
      }
      const spinState = computeCurrentSpinState(f);
      facingScale *= spinState.horizSpinScaleX;
      const wholeRotRad = spinState.wholeRotRad;
      _meshParams.anchorXRatio = cal ? cal.anchorXRatio : 0.5;
      _meshParams.footBottomRatio = cal ? cal.footBottomRatio : 0.98;
      _meshParams.width = f.width;
      _meshParams.height = f.height;
      _meshParams.anchorX = fx;
      _meshParams.groundY = f.groundY;
      _meshParams.facingScale = facingScale;
      _meshParams.spring = f.spring;
      _meshParams.hopOffsetY = hopY;
      _meshParams.wholeRotRad = wholeRotRad;

      function sampleUvSocket(uCoord, hCoord) {
        if (typeof StandeeRigMath !== 'undefined') {
          StandeeRigMath.evalFourKnotSpine(f.spineKnots, hCoord, _spineOut);
          _meshParams.shearPx = StandeeRigMath.stepHorizontalVelocityShear(f.vx, hCoord);
          StandeeRigMath.computeDeformedMeshVertex(uCoord, hCoord, _meshParams, _vertOut);
          return { x: _vertOut.x, y: _vertOut.y };
        }
        return {
          x: fx + f.facingSign * (uCoord - 0.5) * f.width,
          y: fy - hCoord * f.height,
        };
      }

      // Per-frame calibrated UV sockets (idle, sweep_windup, sweep_active, cross_strike, cross_retreat)
      const frameSpec = (typeof getStandeeFrameSpec === 'function')
        ? getStandeeFrameSpec(f.charKey, activeFrameKey)
        : null;
      const uvSockets = frameSpec && frameSpec.uvSockets ? frameSpec.uvSockets : null;

      const leadFist = uvSockets && uvSockets.leadHand
        ? sampleUvSocket(uvSockets.leadHand.normX, uvSockets.leadHand.h)
        : (isCammy
          ? sampleUvSocket(0.83, 0.72)
          : (isZangief ? sampleUvSocket(0.86, 0.49) : (isKen ? sampleUvSocket(0.74, 0.64) : sampleUvSocket(0.72, 0.62))));
      const rearFist = uvSockets && uvSockets.rearHand
        ? sampleUvSocket(uvSockets.rearHand.normX, uvSockets.rearHand.h)
        : (isCammy
          ? sampleUvSocket(0.40, 0.63)
          : (isZangief ? sampleUvSocket(0.30, 0.47) : (isKen ? sampleUvSocket(0.33, 0.58) : sampleUvSocket(0.36, 0.56))));
      const leadShoulder = uvSockets && uvSockets.chest
        ? sampleUvSocket(Math.min(0.92, uvSockets.chest.normX + 0.08), Math.min(0.92, uvSockets.chest.h + 0.12))
        : (isCammy
          ? sampleUvSocket(0.55, 0.74)
          : (isZangief ? sampleUvSocket(0.73, 0.78) : (isKen ? sampleUvSocket(0.56, 0.76) : sampleUvSocket(0.56, 0.76))));
      const rearShoulder = uvSockets && uvSockets.chest
        ? sampleUvSocket(Math.max(0.08, uvSockets.chest.normX - 0.14), Math.min(0.92, uvSockets.chest.h + 0.11))
        : (isCammy
          ? sampleUvSocket(0.42, 0.74)
          : (isZangief ? sampleUvSocket(0.31, 0.80) : (isKen ? sampleUvSocket(0.36, 0.75) : sampleUvSocket(0.36, 0.75))));
      const leadBoot = uvSockets && uvSockets.leadFoot
        ? sampleUvSocket(uvSockets.leadFoot.normX, uvSockets.leadFoot.h)
        : (isCammy
          ? sampleUvSocket(0.81, 0.14)
          : (isZangief ? sampleUvSocket(0.76, 0.12) : sampleUvSocket(0.70, 0.05)));
      const rearBoot = uvSockets && uvSockets.rearFoot
        ? sampleUvSocket(uvSockets.rearFoot.normX, uvSockets.rearFoot.h)
        : (isCammy
          ? sampleUvSocket(0.14, 0.14)
          : (isZangief ? sampleUvSocket(0.21, 0.12) : sampleUvSocket(0.28, 0.05)));

      // Dynamic intensity scale: base 1.0 + Startup Flare spike + Boost stack + Movement surge
      const moveBoost = f.moving ? 0.35 : 0;
      const scaleMult = 1.0 + flare * 0.75 + Math.min(0.45, boostCount * 0.18) + moveBoost;

      c.save();
      c.globalCompositeOperation = 'lighter';

      // Cammy Iconic Red Boots Kinetic Trail / Boot Socket Highlight during strikes, cross-ups, or Exceed Mode
      if (isCammy && (hasExceed || cammyBootActive || flare > 0.05)) {
        const bootPulse = 0.6 + 0.4 * Math.sin(stageClockSec * 11.5);
        const bootRadius = (hasExceed ? 15 : 11) * Math.min(1.4, scaleMult);
        for (const bootPt of [leadBoot, rearBoot]) {
          const bGrad = c.createRadialGradient(bootPt.x, bootPt.y, 1.5, bootPt.x, bootPt.y, bootRadius);
          bGrad.addColorStop(0, '#ffffff');
          bGrad.addColorStop(0.35, '#ff2a4b');
          bGrad.addColorStop(0.72, '#10b981');
          bGrad.addColorStop(1, 'rgba(16, 185, 129, 0)');
          c.fillStyle = bGrad;
          c.globalAlpha = (hasExceed ? 0.84 : 0.56) * bootPulse;
          c.beginPath();
          c.arc(bootPt.x, bootPt.y, bootRadius, 0, Math.PI * 2);
          c.fill();
        }
        // Kinetic red-boot to emerald-spiral ribbon arc connecting rearBoot -> leadBoot during motion/kicks
        if (f.moving || f.choreo) {
          c.strokeStyle = '#ff2a4b';
          c.lineWidth = 2.6;
          c.globalAlpha = hasExceed ? 0.78 : 0.52;
          c.beginPath();
          c.moveTo(rearBoot.x, rearBoot.y);
          c.quadraticCurveTo(
            (rearBoot.x + leadBoot.x) * 0.5,
            Math.min(rearBoot.y, leadBoot.y) - 18,
            leadBoot.x,
            leadBoot.y
          );
          c.stroke();
        }
      }

      // ============================================================
      // CAMMY CROSS-UP AURA — Sharp Emerald Heel Flash (+1/+2 POW · ADVANTAGE) on Iconic Red Boots
      // ============================================================
      if (isCammy && hasCammyCrossUpFlash) {
        const cfAlpha = Math.min(1, (f.cammyCrossUpFlashTimer || 0) / 0.45);
        for (const bootPt of [leadBoot, rearBoot]) {
          const starR = 24 + (1 - cfAlpha) * 14;
          // Sharp 4-point emerald diamond starburst anchored to each red boot heel
          c.fillStyle = '#10b981';
          c.globalAlpha = cfAlpha * 0.92;
          c.beginPath();
          c.moveTo(bootPt.x, bootPt.y - starR);
          c.lineTo(bootPt.x + 5, bootPt.y - 5);
          c.lineTo(bootPt.x + starR * 1.15, bootPt.y);
          c.lineTo(bootPt.x + 5, bootPt.y + 5);
          c.lineTo(bootPt.x, bootPt.y + starR * 0.75);
          c.lineTo(bootPt.x - 5, bootPt.y + 5);
          c.lineTo(bootPt.x - starR * 1.15, bootPt.y);
          c.lineTo(bootPt.x - 5, bootPt.y - 5);
          c.closePath();
          c.fill();

          // White-hot diamond core
          c.fillStyle = '#ffffff';
          c.beginPath();
          c.arc(bootPt.x, bootPt.y, 6.5 * cfAlpha, 0, Math.PI * 2);
          c.fill();
        }

        // Floating Cross-Up Passive Indicator (suppressed while Exceed Battle Cry banner is active on same fighter)
        if (!(exceedSequence && exceedSequence.pid === f.pid)) {
          c.save();
          c.globalCompositeOperation = 'source-over';
          c.globalAlpha = cfAlpha;
          const tagLabel = hasExceed ? 'CROSS-UP · +2 POW · ADV' : 'CROSS-UP · +1 POW · ADV';
          c.font = '900 10px system-ui, sans-serif';
          const tagW = Math.max(132, Math.ceil(c.measureText(tagLabel).width) + 20);
          const tagCx = Math.max(tagW * 0.5 + 8, Math.min(viewportW - tagW * 0.5 - 8, fx));
          const tagY = Math.max(32, fy - f.height - 16 - (1 - cfAlpha) * 10);
          c.fillStyle = 'rgba(4, 24, 18, 0.92)';
          c.strokeStyle = '#10b981';
          c.lineWidth = 1.6;
          c.beginPath();
          c.roundRect(tagCx - tagW * 0.5, tagY - 11, tagW, 20, 4);
          c.fill();
          c.stroke();
          c.textAlign = 'center';
          c.fillStyle = '#6ee7b7';
          c.fillText(tagLabel, tagCx, tagY + 3);
          c.restore();
        }
      }

      // ============================================================
      // ZANGIEF "IRON WALL" PRESENCE — Heavy Forged Foot Chains (Block, Focus, Double Lariat, Siberian Blizzard)
      // ============================================================
      if (isZangief && hasIronWallChains) {
        const iwAlpha = Math.min(1, (f.ironWallChainsTimer || 0) / 0.35);
        c.save();
        c.globalCompositeOperation = 'source-over';
        c.globalAlpha = iwAlpha;

        const leftAnchorX = fx - f.width * 0.44;
        const rightAnchorX = fx + f.width * 0.44;
        const floorY = f.groundY + 3;

        // Grounded crimson-steel Immovable Lock Ring beneath his boots
        c.strokeStyle = '#ef4444';
        c.lineWidth = 2.6;
        c.beginPath();
        c.ellipse(fx, floorY, f.width * 0.50, 10, 0, 0, Math.PI * 2);
        c.stroke();

        // Draw forged metallic interlocking chain links from floor anchors to both wrestling boots
        const drawChainSegment = (ax, ay, bx, by) => {
          const links = 5;
          for (let l = 0; l < links; l++) {
            const lt = (l + 0.5) / links;
            const lx = ax + (bx - ax) * lt;
            const ly = ay + (by - ay) * lt;
            const ang = Math.atan2(by - ay, bx - ax);
            c.save();
            c.translate(lx, ly);
            c.rotate(ang);
            c.strokeStyle = l % 2 === 0 ? '#cbd5e1' : '#94a3b8';
            c.lineWidth = 3.0;
            c.beginPath();
            c.ellipse(0, 0, 6.5, 3.6, 0, 0, Math.PI * 2);
            c.stroke();
            c.strokeStyle = '#1e293b';
            c.lineWidth = 1.0;
            c.stroke();
            c.restore();
          }
        };

        drawChainSegment(leftAnchorX, floorY, rearBoot.x, rearBoot.y);
        drawChainSegment(rightAnchorX, floorY, leadBoot.x, leadBoot.y);
        drawChainSegment(rearBoot.x, rearBoot.y, leadBoot.x, leadBoot.y);

        // Heavy iron ankle cuffs bolted around both red wrestling boots
        for (const bootPt of [rearBoot, leadBoot]) {
          c.fillStyle = '#334155';
          c.strokeStyle = '#e2e8f0';
          c.lineWidth = 2.0;
          c.beginPath();
          c.ellipse(bootPt.x, bootPt.y, 11, 5.5, 0, 0, Math.PI * 2);
          c.fill();
          c.stroke();
          // Crimson bolt rivet
          c.fillStyle = '#ef4444';
          c.beginPath();
          c.arc(bootPt.x, bootPt.y, 2.4, 0, Math.PI * 2);
          c.fill();
        }

        // Iron floor anchor bolts
        for (const ax of [leftAnchorX, rightAnchorX]) {
          c.fillStyle = '#475569';
          c.strokeStyle = '#cbd5e1';
          c.lineWidth = 1.6;
          c.fillRect(ax - 5, floorY - 4, 10, 8);
          c.strokeRect(ax - 5, floorY - 4, 10, 8);
        }

        // Grounded micro-badge positioned cleanly INSIDE the stone arena above the bottom range readout bar
        const tagCx = Math.max(66, Math.min(viewportW - 66, fx));
        const maxTagBottom = boardBounds ? (boardBounds.bottom - 24) : (floorY - 4);
        const tagTop = Math.min(floorY - 16, maxTagBottom - 17);
        c.fillStyle = 'rgba(28, 10, 12, 0.94)';
        c.strokeStyle = '#ef4444';
        c.lineWidth = 1.5;
        c.beginPath();
        c.roundRect(tagCx - 56, tagTop, 112, 17, 4);
        c.fill();
        c.stroke();
        c.font = '900 9.5px system-ui, sans-serif';
        c.textAlign = 'center';
        c.fillStyle = '#fca5a5';
        c.fillText('IRON WALL · LOCKED', tagCx, tagTop + 12);
        c.restore();
      }

      if (hasExceed) {
        if (isCammy) {
          // ============================================================
          // CAMMY EXCEED AURA — Killer Bee High-Velocity Emerald Spiral Wind Ribbons + Iconic Red Boot Kinetic Flares
          // ============================================================
          const windPulse = 0.6 + 0.4 * Math.sin(stageClockSec * 9.5);

          // 1. Emerald Vortex Ground Ring
          c.strokeStyle = '#10b981';
          c.lineWidth = 2.4 * scaleMult;
          c.globalAlpha = Math.min(1, (0.40 + 0.22 * windPulse) * scaleMult);
          c.beginPath();
          c.ellipse(fx, f.groundY + 2, f.width * 0.46 * Math.min(1.38, scaleMult), 9.5, 0, 0, Math.PI * 2);
          c.stroke();

          // 2. Helical Emerald-and-Cyan Wind Ribbons spiraling around Cammy's silhouette
          const ribbonCount = 4;
          for (let r = 0; r < ribbonCount; r++) {
            const rPhase = stageClockSec * 7.5 + r * (Math.PI * 0.5);
            c.strokeStyle = r % 2 === 0 ? '#10b981' : '#6ee7b7';
            c.lineWidth = (r % 2 === 0 ? 3.0 : 1.8) * Math.min(1.35, scaleMult);
            c.globalAlpha = 0.68;
            c.beginPath();
            for (let seg = 0; seg <= 10; seg++) {
              const st = seg / 10;
              const wx = fx + Math.sin(rPhase + st * Math.PI * 2.4) * (f.width * (0.34 + 0.08 * (1 - st)));
              const wy = fy - st * f.height * 0.94;
              if (seg === 0) c.moveTo(wx, wy);
              else c.lineTo(wx, wy);
            }
            c.stroke();
          }

          // 3. Delta Red Gauntlet Spark on Lead & Rear Fists
          for (const gPt of [leadFist, rearFist]) {
            const gR = 11 * Math.min(1.35, scaleMult);
            const gGrad = c.createRadialGradient(gPt.x, gPt.y, 1, gPt.x, gPt.y, gR);
            gGrad.addColorStop(0, '#ffffff');
            gGrad.addColorStop(0.45, '#34d399');
            gGrad.addColorStop(1, 'rgba(16, 185, 129, 0)');
            c.fillStyle = gGrad;
            c.globalAlpha = 0.75;
            c.beginPath();
            c.arc(gPt.x, gPt.y, gR, 0, Math.PI * 2);
            c.fill();
          }
        } else if (isZangief) {
          // ============================================================
          // ZANGIEF EXCEED AURA — Red Cyclone Vortex + Super-Armor Muscle Steam + Vibrating Arena Gravel
          // ============================================================
          const cyclonePulse = 0.6 + 0.4 * Math.sin(stageClockSec * 6.4);

          // 1. Seismic Red Cyclone Ground Shock Rings
          c.strokeStyle = '#ef4444';
          c.lineWidth = 3.0 * scaleMult;
          c.globalAlpha = Math.min(1, (0.44 + 0.22 * cyclonePulse) * scaleMult);
          c.beginPath();
          c.ellipse(fx, f.groundY + 2, f.width * 0.52 * Math.min(1.4, scaleMult), 11.5, 0, 0, Math.PI * 2);
          c.stroke();

          c.strokeStyle = '#fbbf24';
          c.lineWidth = 1.6;
          c.beginPath();
          c.ellipse(fx, f.groundY + 2, f.width * 0.36 * Math.min(1.4, scaleMult), 7.5, 0, 0, Math.PI * 2);
          c.stroke();

          // 2. Heavy stone chunks lifting and vibrating around Zangief's wrestling boots
          for (let pIdx = 0; pIdx < 8; pIdx++) {
            const pSeed = pIdx * 1.49;
            const cycle = (stageClockSec * 0.95 + pSeed) % 1.0;
            const px = fx + Math.cos(pSeed * 4.7) * f.width * (0.28 + (pIdx % 3) * 0.10);
            const py = f.groundY - cycle * (34 * scaleMult);
            const pr = Math.max(1.8, (3.8 - cycle * 2.4));
            c.fillStyle = pIdx % 2 === 0 ? '#fbbf24' : '#ef4444';
            c.globalAlpha = (1 - cycle) * 0.78;
            c.fillRect(px - pr * 0.5, py - pr * 0.5, pr * 1.35, pr * 1.15);
          }

          // 3. Swirling Red-and-Gold Cyclone Bands wrapping Zangief's colossal torso (scaled smoothly with facingScale)
          const zWidthScale = Math.max(0.55, Math.abs(facingScale));
          for (let band = 0; band < 4; band++) {
            const by = fy - f.height * (0.24 + band * 0.17);
            const tilt = Math.sin(stageClockSec * 7.2 + band * 1.4) * 0.16;
            c.strokeStyle = band % 2 === 0 ? '#ef4444' : '#fde047';
            c.lineWidth = (band % 2 === 0 ? 3.0 : 1.8) * Math.min(1.3, scaleMult);
            c.globalAlpha = 0.54;
            c.beginPath();
            c.ellipse(fx, by, f.width * (0.42 + band * 0.03) * zWidthScale, 9 + band * 1.2, tilt, 0, Math.PI * 2);
            c.stroke();
          }

          // 4. Ignited Gold-and-Crimson Wrestling Bracer Flares on Lead & Rear Fists
          for (const fistPt of [leadFist, rearFist]) {
            const fR = (10.5 + 3 * cyclonePulse) * Math.min(1.3, scaleMult);
            const fGrad = c.createRadialGradient(fistPt.x, fistPt.y, 1.5, fistPt.x, fistPt.y, fR);
            fGrad.addColorStop(0, '#ffffff');
            fGrad.addColorStop(0.38, '#fde047');
            fGrad.addColorStop(0.75, '#ef4444');
            fGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');
            c.fillStyle = fGrad;
            c.globalAlpha = 0.62;
            c.beginPath();
            c.arc(fistPt.x, fistPt.y, fR, 0, Math.PI * 2);
            c.fill();
          }
        } else if (!isKen) {
          // ============================================================
          // RYU EXCEED AURA — Focused White-and-Cobalt Ki + Denjin Lightning + Levitating Pebbles
          // ============================================================
          const breathPulse = 0.6 + 0.4 * Math.sin(stageClockSec * Math.PI * 2 * 1.55);

          // 1. Ground Pressure Ring & Levitating Courtyard Pebbles / Dust Motes
          c.strokeStyle = '#38bdf8';
          c.lineWidth = 2.2 * scaleMult;
          c.globalAlpha = Math.min(1, (0.34 + 0.18 * breathPulse) * scaleMult);
          c.beginPath();
          c.ellipse(fx, f.groundY + 2, f.width * 0.44 * Math.min(1.35, scaleMult), 9, 0, 0, Math.PI * 2);
          c.stroke();

          c.strokeStyle = '#e0f2fe';
          c.lineWidth = 1.2;
          c.beginPath();
          c.ellipse(fx, f.groundY + 2, f.width * 0.28 * Math.min(1.35, scaleMult), 5.5, 0, 0, Math.PI * 2);
          c.stroke();

          // Tiny levitating pebbles rising off the courtyard stone around Ryu's feet
          for (let pIdx = 0; pIdx < 6; pIdx++) {
            const pSeed = pIdx * 1.37;
            const cycle = (stageClockSec * 0.85 + pSeed) % 1.0;
            const px = fx + Math.cos(pSeed * 4.2) * f.width * (0.24 + (pIdx % 3) * 0.09);
            const py = f.groundY - cycle * (28 * scaleMult);
            const pr = Math.max(1.2, (2.6 - cycle * 1.8));
            c.fillStyle = pIdx % 2 === 0 ? '#cbd5e1' : '#7dd3fc';
            c.globalAlpha = (1 - cycle) * 0.65;
            c.fillRect(px - pr * 0.5, py - pr * 0.5, pr * 1.2, pr);
          }

          // 2. Tight, Disciplined White-and-Cobalt Vertical Ki Plumes hugging shoulders & gi
          const plumeCount = 5;
          for (let i = 0; i < plumeCount; i++) {
            const frac = (i / (plumeCount - 1)) - 0.5; // -0.5 .. 0.5
            const phase = stageClockSec * 4.2 + i * 1.3;
            const baseX = fx + frac * f.width * 0.52 - (f.moving ? f.vx * 0.025 : 0);
            const baseY = fy - f.height * (0.22 + Math.abs(frac) * 0.35);
            const plumeH = f.height * (0.26 + 0.08 * Math.sin(phase)) * Math.min(1.45, scaleMult);
            const plumeW = (10 + 4 * breathPulse) * Math.min(1.35, scaleMult);

            const pGrad = c.createLinearGradient(baseX, baseY, baseX, baseY - plumeH);
            pGrad.addColorStop(0, 'rgba(56, 189, 248, 0.36)');
            pGrad.addColorStop(0.55, 'rgba(224, 242, 254, 0.22)');
            pGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
            c.fillStyle = pGrad;
            c.globalAlpha = Math.min(0.85, 0.48 * scaleMult);
            c.beginPath();
            c.moveTo(baseX - plumeW, baseY);
            c.quadraticCurveTo(
              baseX + Math.sin(phase) * 6,
              baseY - plumeH * 0.6,
              baseX - (f.moving ? Math.sign(f.vx) * 10 : 0),
              baseY - plumeH
            );
            c.quadraticCurveTo(baseX - Math.sin(phase) * 5, baseY - plumeH * 0.5, baseX + plumeW, baseY);
            c.closePath();
            c.fill();
          }

          // 3. Sporadic Denjin Lightning Arcs snapping between Lead Fist, Rear Fist, and Shoulders
          const arcBucket = Math.floor(stageClockSec * (14 + flare * 10));
          const arcCount = (flare > 0.2 || f.choreo) ? 3 : 2;
          for (let a = 0; a < arcCount; a++) {
            const seed = arcBucket + a * 17.3;
            const srcPt = (a % 2 === 0) ? leadFist : rearFist;
            const targetPt = (a === 0) ? leadShoulder : (a === 1 ? rearShoulder : leadFist);
            // Outer cobalt glow arc
            c.strokeStyle = '#38bdf8';
            c.lineWidth = 3.2 * Math.min(1.35, scaleMult);
            c.globalAlpha = 0.72;
            drawLightningArc(c, srcPt.x, srcPt.y, targetPt.x, targetPt.y, 5, 8 * scaleMult, seed);

            // Inner white-hot Denjin core arc
            c.strokeStyle = '#ffffff';
            c.lineWidth = 1.35;
            c.globalAlpha = 0.92;
            drawLightningArc(c, srcPt.x, srcPt.y, targetPt.x, targetPt.y, 5, 8 * scaleMult, seed);
          }
        } else {
          // ============================================================
          // KEN EXCEED AURA — Wild Crimson-and-Gold Dancing Flame Plumes + Drifting Embers & Foot Cinders
          // ============================================================
          const flamePulse = 0.55 + 0.45 * Math.sin(stageClockSec * 7.8);

          // 1. Scorching Ground Ring & Trailing Foot Cinders
          c.strokeStyle = '#ff4d2e';
          c.lineWidth = 2.6 * scaleMult;
          c.globalAlpha = Math.min(1, (0.38 + 0.22 * flamePulse) * scaleMult);
          c.beginPath();
          c.ellipse(fx, f.groundY + 2, f.width * 0.48 * Math.min(1.4, scaleMult), 10.5, 0, 0, Math.PI * 2);
          c.stroke();

          // Rising crimson-and-gold flame tongues dancing off Ken's shoulders, fists, and ankles
          const flameCount = 7;
          for (let i = 0; i < flameCount; i++) {
            const frac = (i / (flameCount - 1)) - 0.5;
            const tPhase = stageClockSec * 6.8 + i * 1.7;
            const trailLag = f.moving ? (-Math.sign(f.vx || f.facingSign) * (12 + i * 3)) : 0;
            const bx = fx + frac * f.width * 0.58 + trailLag * 0.35;
            const by = fy - f.height * (0.14 + Math.abs(frac) * 0.42);
            const fh = f.height * (0.32 + 0.12 * Math.sin(tPhase)) * Math.min(1.5, scaleMult);
            const fw = (13 + 5 * Math.cos(tPhase * 0.7)) * Math.min(1.4, scaleMult);

            const fGrad = c.createLinearGradient(bx, by, bx + trailLag, by - fh);
            fGrad.addColorStop(0, 'rgba(255, 77, 46, 0.46)');
            fGrad.addColorStop(0.5, 'rgba(251, 191, 36, 0.32)');
            fGrad.addColorStop(1, 'rgba(255, 77, 46, 0)');
            c.fillStyle = fGrad;
            c.globalAlpha = Math.min(0.9, 0.54 * scaleMult);
            c.beginPath();
            c.moveTo(bx - fw, by);
            c.quadraticCurveTo(
              bx + Math.sin(tPhase) * 11,
              by - fh * 0.55,
              bx + trailLag + Math.cos(tPhase) * 6,
              by - fh
            );
            c.quadraticCurveTo(bx - Math.sin(tPhase) * 9, by - fh * 0.45, bx + fw, by);
            c.closePath();
            c.fill();
          }

          // 2. Ignited Fist Flame Cluster around Ken's raised lead glove + chambered rear glove
          const fistR = (14 + 5 * flamePulse) * Math.min(1.45, scaleMult);
          const fistGrad = c.createRadialGradient(leadFist.x, leadFist.y, 2, leadFist.x, leadFist.y, fistR * 1.4);
          fistGrad.addColorStop(0, '#ffffff');
          fistGrad.addColorStop(0.35, '#fde047');
          fistGrad.addColorStop(0.7, '#ff4d2e');
          fistGrad.addColorStop(1, 'rgba(255, 77, 46, 0)');
          c.fillStyle = fistGrad;
          c.globalAlpha = 0.82;
          c.beginPath();
          c.arc(leadFist.x, leadFist.y, fistR * 1.4, 0, Math.PI * 2);
          c.fill();

          const rearFistR = fistR * 0.75;
          const rearGrad = c.createRadialGradient(rearFist.x, rearFist.y, 1.5, rearFist.x, rearFist.y, rearFistR * 1.3);
          rearGrad.addColorStop(0, '#fde047');
          rearGrad.addColorStop(0.55, '#ff4d2e');
          rearGrad.addColorStop(1, 'rgba(255, 77, 46, 0)');
          c.fillStyle = rearGrad;
          c.globalAlpha = 0.62;
          c.beginPath();
          c.arc(rearFist.x, rearFist.y, rearFistR * 1.3, 0, Math.PI * 2);
          c.fill();

          // 3. Hot Drifting Embers off his gi and trailing behind his feet
          const emberCount = f.moving ? 12 : 8;
          for (let eIdx = 0; eIdx < emberCount; eIdx++) {
            const eSeed = eIdx * 2.13;
            const cycle = (stageClockSec * 1.35 + eSeed) % 1.0;
            const lagX = f.moving ? (-Math.sign(f.vx || f.facingSign) * cycle * 48) : (Math.sin(stageClockSec * 3 + eSeed) * 14);
            const ex = fx + Math.cos(eSeed * 5.1) * f.width * 0.36 + lagX;
            const ey = (eIdx < 4 ? f.groundY : fy - f.height * 0.35) - cycle * (f.height * 0.48 * scaleMult);
            const er = Math.max(1.3, (3.4 - cycle * 2.2) * Math.min(1.3, scaleMult));
            c.fillStyle = eIdx % 2 === 0 ? '#fde047' : '#ff5f38';
            c.globalAlpha = (1 - cycle) * 0.85;
            c.beginPath();
            c.arc(ex, ey, er, 0, Math.PI * 2);
            c.fill();
          }
        }
      }

      // ============================================================
      // BOOST / OVERDRIVE SYNERGY — Orbiting Sparks & Stacked Energy Rings on Fighter
      // ============================================================
      if (boostCount > 0) {
        const ringColor = isCammy ? '#10b981' : (isZangief ? '#ef4444' : (isKen ? '#fbbf24' : '#38bdf8'));
        const sparkColor = '#fde047';
        const ringCount = Math.min(3, boostCount);
        for (let r = 0; r < ringCount; r++) {
          const ry = fy - f.height * (0.34 + r * 0.16);
          const tilt = Math.sin(stageClockSec * 3.2 + r) * 0.16;
          c.strokeStyle = r % 2 === 0 ? ringColor : sparkColor;
          c.lineWidth = (hasExceed ? 2.8 : 2.0) + boostCount * 0.4;
          c.globalAlpha = hasExceed ? 0.68 : 0.52;
          c.beginPath();
          c.ellipse(fx, ry, f.width * (0.46 + r * 0.06), 8 + r * 2, tilt, 0, Math.PI * 2);
          c.stroke();
        }
        // Orbiting Overdrive Sparks
        const totalSparks = Math.min(8, 3 + boostCount * 2 + (hasExceed ? 2 : 0));
        for (let s = 0; s < totalSparks; s++) {
          const ang = stageClockSec * 4.4 + (s * Math.PI * 2) / totalSparks;
          const ox = fx + Math.cos(ang) * f.width * 0.48;
          const oy = fy - f.height * (0.32 + 0.28 * ((s % 3) / 2)) + Math.sin(ang) * 9;
          c.fillStyle = s % 2 === 0 ? '#fde047' : ringColor;
          c.globalAlpha = 0.88;
          c.beginPath();
          c.arc(ox, oy, hasExceed ? 3.4 : 2.6, 0, Math.PI * 2);
          c.fill();
        }
      }

      // ============================================================
      // WILD SWING "!" CRACKED-CARD HAZARD BADGE
      // ============================================================
      if (f.wildSwingHazard) {
        const hx = fx;
        const hy = fy - f.height - 22 + Math.sin(stageClockSec * 18) * 3;
        c.globalCompositeOperation = 'source-over';
        c.fillStyle = 'rgba(225, 29, 72, 0.92)';
        c.strokeStyle = '#fde047';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(hx, hy - 16);
        c.lineTo(hx + 15, hy + 10);
        c.lineTo(hx - 15, hy + 10);
        c.closePath();
        c.fill();
        c.stroke();
        c.fillStyle = '#ffffff';
        c.font = '900 15px system-ui, sans-serif';
        c.textAlign = 'center';
        c.fillText('!', hx, hy + 7);
      }

      c.restore();
    }

    // Startup Clash Freeze "VS" Lightning Emblem between fighters during Strike Reveal
    if (clashSparkTimer > 0) {
      clashSparkTimer = Math.max(0, clashSparkTimer - dt);
      if (fighters.p1.active && fighters.p2.active) {
        const mx = (fighters.p1.x + fighters.p2.x) * 0.5;
        const my = Math.min(fighters.p1.groundY, fighters.p2.groundY) - Math.max(fighters.p1.height, fighters.p2.height) * 0.52;
        const ct = clashSparkTimer / 0.42;
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.strokeStyle = '#fde047';
        c.lineWidth = 2.6;
        c.globalAlpha = Math.min(1, ct * 1.4);
        drawLightningArc(c, mx - 28, my - 26, mx + 28, my + 26, 5, 6, stageClockSec * 20);
        drawLightningArc(c, mx + 28, my - 26, mx - 28, my + 26, 5, 6, stageClockSec * 20 + 7);
        c.beginPath();
        c.arc(mx, my, 18 + (1 - ct) * 16, 0, Math.PI * 2);
        c.stroke();
        c.restore();
      }
    }

    // Active projectiles (Hadoken / Metsu Hadoken)
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.elapsed += dt;
      const t = Math.min(1, p.elapsed / Math.max(0.05, p.duration));
      const e = StandeeRigMath.quinticEase(t);
      p.x = p.startX + (p.endX - p.startX) * e;
      p.y = p.startY + (p.endY - p.startY) * e;

      c.save();
      c.globalCompositeOperation = 'lighter';
      const alpha = p.whiff ? (1 - t * 0.85) : (t > 0.85 ? (1 - t) / 0.15 : 1);
      c.globalAlpha = Math.max(0, alpha);

      // Comet tail
      const tailLen = (p.style === 'metsu_denjin' ? 96 : 64) * p.dir;
      const tGrad = c.createLinearGradient(p.x - tailLen, p.y, p.x, p.y);
      tGrad.addColorStop(0, 'rgba(0,0,0,0)');
      tGrad.addColorStop(1, p.trailColor);
      c.fillStyle = tGrad;
      c.beginPath();
      c.moveTo(p.x - tailLen, p.y);
      c.lineTo(p.x, p.y - p.radius * 0.72);
      c.lineTo(p.x + p.dir * p.radius * 0.4, p.y);
      c.lineTo(p.x, p.y + p.radius * 0.72);
      c.closePath();
      c.fill();

      // Core orb
      const orbGrad = c.createRadialGradient(p.x, p.y, p.radius * 0.12, p.x, p.y, p.radius * 1.45);
      orbGrad.addColorStop(0, p.coreColor);
      orbGrad.addColorStop(0.42, p.trailColor);
      orbGrad.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = orbGrad;
      c.beginPath();
      c.arc(p.x, p.y, p.radius * 1.45, 0, Math.PI * 2);
      c.fill();
      c.restore();

      if (t >= 1) projectiles.splice(i, 1);
    }

    // Active character VFX (Shoryuken, Tatsumaki, Spiral Arrow Vortex, Zangief Ground Crater / SPD Card Shatter / Green Hand, etc.)
    for (let i = stageVfx.length - 1; i >= 0; i--) {
      const v = stageVfx[i];
      if (v.holdAtT != null) {
        v.elapsed = v.holdAtT * v.duration;
      } else {
        v.elapsed += dt;
      }
      const t = Math.min(1, v.elapsed / Math.max(0.05, v.duration));
      if (v.followPid && fighters[v.followPid] && fighters[v.followPid].active) {
        const ff = fighters[v.followPid];
        v.x = ff.x + computeFighterLungeOffsetX(ff);
        v.groundY = ff.groundY + computeCurrentHopY(ff);
        v.facingSign = ff.facingSign;
      }
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = Math.max(0, 1 - t);

      if (v.type === 'dragon_uppercut') {
        const rise = v.height * (v.isUltra ? 1.15 : 0.9) * t;
        c.strokeStyle = v.color;
        c.lineWidth = v.isUltra ? 7 : 5;
        c.beginPath();
        for (let s = 0; s <= 12; s++) {
          const st = s / 12;
          const sx = v.x + Math.sin(st * Math.PI * 3 + t * 8) * (v.width * 0.24) + v.facingSign * 14 * st;
          const sy = v.groundY - rise * st;
          if (s === 0) c.moveTo(sx, sy);
          else c.lineTo(sx, sy);
        }
        c.stroke();
        // Cammy Cannon Spike red-boot accent streak alongside the emerald column
        if (v.accent) {
          c.strokeStyle = v.accent;
          c.lineWidth = 3.2;
          c.beginPath();
          for (let s = 0; s <= 12; s++) {
            const st = s / 12;
            const sx = v.x - Math.sin(st * Math.PI * 3 + t * 8) * (v.width * 0.18) + v.facingSign * 18 * st;
            const sy = v.groundY - rise * st;
            if (s === 0) c.moveTo(sx, sy);
            else c.lineTo(sx, sy);
          }
          c.stroke();
        }
      } else if (v.type === 'spiral_vortex') {
        // Cammy Spiral Arrow / Gyro Drive Smasher horizontal corkscrew drill vortex + red boot lance
        const reachLen = Math.max(v.width * 0.85, Math.min(340, (v.reachPx || 120) * (v.isUltra ? 1.15 : 0.95)));
        const cy = v.groundY - v.height * 0.42;
        const ringCount = v.isUltra ? 7 : 5;
        c.strokeStyle = v.color || '#10b981';
        c.lineWidth = v.isUltra ? 4.5 : 3.4;
        for (let r = 0; r < ringCount; r++) {
          const rf = (r + 1) / ringCount;
          const rx = v.x + v.facingSign * reachLen * rf * Math.min(1, t * 1.35);
          const radY = (1 - rf * 0.55) * (v.height * 0.30);
          c.beginPath();
          c.ellipse(rx, cy, 10 + (1 - rf) * 8, Math.max(6, radY), v.facingSign * 0.18, 0, Math.PI * 2);
          c.stroke();
        }
        // Central red-boot drill core lance
        c.strokeStyle = v.accent || '#ff2a4b';
        c.lineWidth = v.isUltra ? 5.0 : 3.6;
        c.beginPath();
        c.moveTo(v.x, cy);
        c.lineTo(v.x + v.facingSign * reachLen * Math.min(1, t * 1.4), cy);
        c.stroke();
      } else if (v.type === 'ground_crater') {
        // Zangief Atomic Suplex / Flying Power Bomb / Siberian Blizzard seismic floor crater & flying debris
        const radiusX = (v.isUltra ? 155 : 105) * (0.35 + t * 0.75);
        const radiusY = (v.isUltra ? 28 : 19) * (0.35 + t * 0.75);
        const cx = v.x + v.facingSign * 22;
        const cy = v.groundY - 2;
        c.strokeStyle = v.color || '#ef4444';
        c.lineWidth = (v.isUltra ? 6.5 : 4.8) * (1 - t * 0.4);
        c.beginPath();
        c.ellipse(cx, cy, radiusX, radiusY, 0, 0, Math.PI * 2);
        c.stroke();

        // Radial fracture lines & flying stone shards
        c.strokeStyle = v.accent || '#fde047';
        c.fillStyle = v.accent || '#fde047';
        c.lineWidth = 2.4;
        for (let s = 0; s < 8; s++) {
          const ang = (s / 8) * Math.PI * 2;
          c.beginPath();
          c.moveTo(cx + Math.cos(ang) * 12, cy + Math.sin(ang) * 4);
          c.lineTo(cx + Math.cos(ang) * radiusX * 1.12, cy + Math.sin(ang) * radiusY * 1.12);
          c.stroke();
          // Flying rock shard
          const sx = cx + Math.cos(ang) * radiusX * t;
          const sy = cy - Math.sin(t * Math.PI) * (36 + (s % 3) * 18);
          c.fillRect(sx - 3, sy - 3, 6, 5);
        }
      } else if (v.type === 'green_hand_burst') {
        // Zangief Banishing Flat ("Green Hand") emerald flame backhand & projectile-banishing wall
        const reachX = v.x + v.facingSign * Math.max(44, Math.min(180, (v.reachPx || 90) * 0.75));
        const palmY = v.groundY - v.height * 0.56;
        const r = 24 + t * 54;
        const gGrad = c.createRadialGradient(reachX, palmY, 3, reachX, palmY, r);
        gGrad.addColorStop(0, '#ffffff');
        gGrad.addColorStop(0.35, v.accent || '#bbf7d0');
        gGrad.addColorStop(0.7, v.color || '#22c55e');
        gGrad.addColorStop(1, 'rgba(34, 197, 94, 0)');
        c.fillStyle = gGrad;
        c.beginPath();
        c.arc(reachX, palmY, r, 0, Math.PI * 2);
        c.fill();
      } else if (v.type === 'spd_card_shatter') {
        // Zangief Spinning Piledriver / Ultimate Atomic Buster — helical drill vortex + shattering queued command card shards
        const cx = v.x + v.facingSign * 20;
        const cy = v.groundY - 6;
        c.strokeStyle = v.color || '#ef4444';
        c.lineWidth = v.isUltra ? 6.0 : 4.5;
        c.beginPath();
        c.ellipse(cx, cy, (v.isUltra ? 160 : 115) * t, (v.isUltra ? 30 : 20) * t, 0, 0, Math.PI * 2);
        c.stroke();

        // Shattered command card fragments spinning outward from impact
        const shardCount = v.isUltra ? 12 : 8;
        for (let s = 0; s < shardCount; s++) {
          const ang = -Math.PI * 0.15 - (s / Math.max(1, shardCount - 1)) * Math.PI * 0.7;
          const dist = 22 + t * (v.isUltra ? 165 : 115);
          const sx = cx + Math.cos(ang) * dist;
          const sy = (cy - 24) + Math.sin(ang) * dist + t * t * 48;
          c.save();
          c.translate(sx, sy);
          c.rotate(t * 7 + s * 1.1);
          c.fillStyle = s % 2 === 0 ? '#fde047' : '#ef4444';
          c.strokeStyle = '#ffffff';
          c.lineWidth = 1.2;
          c.fillRect(-7, -10, 14, 20);
          c.strokeRect(-7, -10, 14, 20);
          c.restore();
        }
      } else if (v.type === 'cammy_heel_crossup_flash') {
        // Cammy Cross-Up Heel Flash burst: emerald diamond shock ring + crimson boot arc
        const cy = v.groundY - v.height * 0.16;
        const r = 18 + t * 58;
        c.strokeStyle = v.color || '#10b981';
        c.lineWidth = 3.8 * (1 - t * 0.45);
        c.beginPath();
        c.moveTo(v.x, cy - r);
        c.lineTo(v.x + r * 1.15, cy);
        c.lineTo(v.x, cy + r * 0.7);
        c.lineTo(v.x - r * 1.15, cy);
        c.closePath();
        c.stroke();

        c.strokeStyle = v.accent || '#ff2a4b';
        c.lineWidth = 2.6;
        c.beginPath();
        c.arc(v.x, cy, r * 0.62, 0, Math.PI * 2);
        c.stroke();
      } else if (v.type === 'iron_wall_chains') {
        // Zangief Iron Wall anchor shock clang burst around his boots
        const cy = v.groundY - 6;
        const rx = v.width * (0.48 + t * 0.42);
        const ry = 10 + t * 14;
        c.strokeStyle = v.color || '#ef4444';
        c.lineWidth = 4.2 * (1 - t * 0.4);
        c.beginPath();
        c.ellipse(v.x, cy, rx, ry, 0, 0, Math.PI * 2);
        c.stroke();

        c.strokeStyle = v.accent || '#cbd5e1';
        c.lineWidth = 2.2;
        for (let s = 0; s < 6; s++) {
          const ang = (s / 6) * Math.PI * 2 + t * 1.5;
          c.beginPath();
          c.moveTo(v.x + Math.cos(ang) * (rx * 0.45), cy + Math.sin(ang) * (ry * 0.45));
          c.lineTo(v.x + Math.cos(ang) * (rx * 1.05), cy + Math.sin(ang) * (ry * 1.05));
          c.stroke();
        }
      } else if (v.type === 'evasion_shimmer') {
        // Cammy Dive Kick / CQC cross-up evasion phase ring
        const cy = v.groundY - v.height * 0.52;
        c.strokeStyle = v.color || '#34d399';
        c.lineWidth = 3.2;
        c.beginPath();
        c.ellipse(v.x, cy, v.width * (0.42 + t * 0.35), v.height * (0.44 + t * 0.15), 0, 0, Math.PI * 2);
        c.stroke();
      } else if (v.type === 'cyclone') {
        c.strokeStyle = v.color;
        c.lineWidth = v.isUltra ? 4.5 : 3;
        for (let ring = 0; ring < 3; ring++) {
          const ry = v.groundY - v.height * (0.28 + ring * 0.2);
          c.beginPath();
          c.ellipse(v.x, ry, v.width * (0.58 + ring * 0.08), 10, Math.sin(t * 14 + ring) * 0.14, 0, Math.PI * 2);
          c.stroke();
        }
      } else if (v.type === 'physical_sweep_dust') {
        // Normal-State (VFX-free martial arts) low Sweep: crisp air-shear crescent along the stone floor + flying grit/dust plumes (no magical beams)
        c.globalCompositeOperation = 'source-over';
        const reachRadius = Math.max(v.width * 0.64, Math.min(290, (v.reachPx || 0) * 0.88));
        const arcY = v.groundY - 10;
        const startAng = v.facingSign > 0 ? -0.68 : (Math.PI - 0.52);
        const endAng = v.facingSign > 0 ? 0.52 : (Math.PI + 0.68);

        c.strokeStyle = 'rgba(226, 232, 240, 0.58)';
        c.lineWidth = 3.2 * (1 - t * 0.45);
        c.beginPath();
        c.ellipse(v.x + v.facingSign * 18, arcY, reachRadius, 16, 0, startAng, endAng);
        c.stroke();

        // Low floor-skimming stone dust puffs kicked up by the sweeping heel
        for (let d = 0; d < 7; d++) {
          const df = d / 6;
          const dx = v.x + v.facingSign * (20 + df * reachRadius * (0.45 + 0.55 * t));
          const dy = v.groundY - 3 - Math.sin(df * Math.PI) * (8 + t * 14);
          const dr = (3.2 + (d % 3) * 1.4) * (1 - t * 0.65);
          c.fillStyle = d % 2 === 0 ? (v.color || '#cbd5e1') : '#94a3b8';
          c.beginPath();
          c.arc(dx, dy, Math.max(0.8, dr), 0, Math.PI * 2);
          c.fill();
        }
      } else if (v.type === 'physical_cross_snap') {
        // Normal-State (VFX-free martial arts) Cross punch: sharp kinetic air-compression cone & crisp white knuckle snap lines
        c.globalCompositeOperation = 'source-over';
        const reachLen = Math.max(v.width * 0.56, Math.min(220, (v.reachPx || 96) * 0.82));
        const fistX = v.x + v.facingSign * reachLen * Math.min(1, 0.35 + t * 0.75);
        const fistY = v.groundY - v.height * 0.63;

        // Crisp kinetic air-shear lines
        c.strokeStyle = 'rgba(241, 245, 249, 0.72)';
        c.lineWidth = 2.4 * (1 - t * 0.4);
        for (let l = -1; l <= 1; l++) {
          const ly = fistY + l * 9;
          c.beginPath();
          c.moveTo(v.x + v.facingSign * 18, ly);
          c.lineTo(fistX, ly);
          c.stroke();
        }
        // Compact air-snap shock ring at fist contact point
        c.strokeStyle = '#ffffff';
        c.lineWidth = 2.2 * (1 - t * 0.5);
        c.beginPath();
        c.ellipse(fistX, fistY, 7 + t * 14, 16 + t * 22, 0, 0, Math.PI * 2);
        c.stroke();
      } else if (v.type === 'ryu_ashi_barai_ki_sweep') {
        // Exceeded Ryu Sweep (Ashi Barai): white-hot & cobalt floor-skimming Ki crescent blade + Denjin ground lightning
        const reachRadius = Math.max(v.width * 0.72, Math.min(320, (v.reachPx || 110) * 0.96));
        const arcY = v.groundY - 12;
        const startAng = v.facingSign > 0 ? -0.86 : (Math.PI - 0.68);
        const endAng = v.facingSign > 0 ? 0.68 : (Math.PI + 0.86);

        c.strokeStyle = v.color || '#38bdf8';
        c.lineWidth = 8.0 * (1 - t * 0.3);
        c.beginPath();
        c.ellipse(v.x + v.facingSign * 20, arcY, reachRadius, 26, 0, startAng, endAng);
        c.stroke();

        c.strokeStyle = '#ffffff';
        c.lineWidth = 3.2;
        c.beginPath();
        c.ellipse(v.x + v.facingSign * 20, arcY, reachRadius * 0.96, 19, 0, startAng, endAng);
        c.stroke();

        // Crackling Denjin lightning arcs snapping along the sweeping ankle & stone floor
        const tipX = v.x + v.facingSign * (20 + reachRadius * 0.94);
        c.strokeStyle = '#38bdf8';
        c.lineWidth = 2.8;
        drawLightningArc(c, v.x, arcY, tipX, arcY - 6, 6, 9, stageClockSec * 24);
        c.strokeStyle = '#ffffff';
        c.lineWidth = 1.4;
        drawLightningArc(c, v.x, arcY, tipX, arcY - 6, 6, 9, stageClockSec * 24 + 3.1);
      } else if (v.type === 'ken_flare_fire_sweep') {
        // Exceeded Ken Sweep: 360° blazing crimson-and-gold breakdance floor-flare fire whip + orbiting ember sparks
        const reachRadius = Math.max(v.width * 0.76, Math.min(330, (v.reachPx || 120) * 0.98));
        const arcY = v.groundY - 11;

        // Full 360° floor-flare fire vortex ellipse
        c.strokeStyle = v.color || '#ff5f38';
        c.lineWidth = 8.5 * (1 - t * 0.28);
        c.beginPath();
        c.ellipse(v.x + v.facingSign * 22, arcY, reachRadius, 28, 0, 0, Math.PI * 2);
        c.stroke();

        c.strokeStyle = v.accent || '#fde047';
        c.lineWidth = 3.6;
        c.beginPath();
        c.ellipse(v.x + v.facingSign * 22, arcY, reachRadius * 0.92, 20, 0, 0, Math.PI * 2);
        c.stroke();

        // Orbiting flame tongues & flying cinders along the sweep arc
        for (let e = 0; e < 10; e++) {
          const ang = (e / 10) * Math.PI * 2 + t * 5.2 * v.facingSign;
          const ex = v.x + v.facingSign * 22 + Math.cos(ang) * reachRadius * (0.65 + 0.35 * t);
          const ey = arcY + Math.sin(ang) * 24 - t * 18;
          c.fillStyle = e % 2 === 0 ? '#fde047' : '#ff4d2e';
          c.beginPath();
          c.arc(ex, ey, 3.8 * (1 - t * 0.5), 0, Math.PI * 2);
          c.fill();
        }
      } else if (v.type === 'ryu_denjin_cross_lance') {
        // Exceeded Ryu Cross: high-speed cobalt-white Denjin shock-lance & crackling electric cross impact
        const reachLen = Math.max(v.width * 0.68, Math.min(280, (v.reachPx || 110) * 0.92));
        const fistY = v.groundY - v.height * 0.63;
        const endX = v.x + v.facingSign * reachLen;

        c.strokeStyle = v.color || '#38bdf8';
        c.lineWidth = 7.5 * (1 - t * 0.35);
        c.beginPath();
        c.moveTo(v.x + v.facingSign * 14, fistY);
        c.lineTo(endX, fistY);
        c.stroke();

        c.strokeStyle = '#ffffff';
        c.lineWidth = 3.0;
        c.beginPath();
        c.moveTo(v.x + v.facingSign * 14, fistY);
        c.lineTo(endX, fistY);
        c.stroke();

        drawLightningArc(c, v.x + v.facingSign * 16, fistY - 8, endX, fistY + 6, 6, 10, stageClockSec * 28);
        c.strokeStyle = '#38bdf8';
        c.lineWidth = 3.0;
        c.beginPath();
        c.ellipse(endX, fistY, 12 + t * 24, 26 + t * 34, 0, 0, Math.PI * 2);
        c.stroke();
      } else if (v.type === 'ken_crimson_cross_whip') {
        // Exceeded Ken Cross: blazing crimson-and-gold flame whip slash + explosive ember burst at fist reach
        const reachLen = Math.max(v.width * 0.72, Math.min(290, (v.reachPx || 115) * 0.94));
        const fistY = v.groundY - v.height * 0.65;
        const endX = v.x + v.facingSign * reachLen;

        c.strokeStyle = v.color || '#ff5f38';
        c.lineWidth = 8.0 * (1 - t * 0.32);
        c.beginPath();
        c.moveTo(v.x + v.facingSign * 12, fistY + 12);
        c.quadraticCurveTo(v.x + v.facingSign * reachLen * 0.55, fistY - 22, endX, fistY);
        c.stroke();

        c.strokeStyle = v.accent || '#fde047';
        c.lineWidth = 3.4;
        c.beginPath();
        c.moveTo(v.x + v.facingSign * 12, fistY + 10);
        c.quadraticCurveTo(v.x + v.facingSign * reachLen * 0.55, fistY - 18, endX, fistY);
        c.stroke();

        const fGrad = c.createRadialGradient(endX, fistY, 2, endX, fistY, 22 + t * 28);
        fGrad.addColorStop(0, '#ffffff');
        fGrad.addColorStop(0.4, '#fde047');
        fGrad.addColorStop(0.75, '#ff4d2e');
        fGrad.addColorStop(1, 'rgba(255, 77, 46, 0)');
        c.fillStyle = fGrad;
        c.beginPath();
        c.arc(endX, fistY, 22 + t * 28, 0, Math.PI * 2);
        c.fill();
      } else if (v.type === 'ken_backflip_fire_wheel') {
        // Exceeded Ken Cross Retreat (After: Retreat 3 backflip): airborne flaming somersault wheel
        const cy = v.groundY - v.height * 0.48;
        const r = v.width * (0.44 + 0.14 * Math.sin(t * Math.PI));
        c.strokeStyle = v.color || '#ff5f38';
        c.lineWidth = 5.5 * (1 - t * 0.35);
        c.beginPath();
        c.arc(v.x, cy, r, 0, Math.PI * 2);
        c.stroke();

        c.strokeStyle = v.accent || '#fde047';
        c.lineWidth = 2.4;
        c.beginPath();
        c.arc(v.x, cy, r * 0.84, 0, Math.PI * 2);
        c.stroke();
      } else if (v.type === 'ryu_backdash_ki_wake') {
        // Exceeded Ryu Cross Retreat (After: Retreat 3 backdash): cobalt-white vacuum wake
        const cy = v.groundY - v.height * 0.42;
        c.strokeStyle = v.color || '#38bdf8';
        c.lineWidth = 3.6 * (1 - t * 0.4);
        c.beginPath();
        c.ellipse(v.x + v.facingSign * 18, cy, v.width * (0.38 + t * 0.25), v.height * 0.36, 0, 0, Math.PI * 2);
        c.stroke();
      } else if (v.type === 'sweep_arc' || v.type === 'strike_slash' || v.type === 'overhead_crash' || v.type === 'armor_pierce') {
        // Dynamic Ki/Limb Smear Trail: stretches horizontal radius to reachPx so Range 2..3 attacks visually bridge the gap
        const reachRadius = Math.max(v.width * 0.62, Math.min(310, (v.reachPx || 0) * 0.92));
        const arcY = v.type === 'sweep_arc' ? (v.groundY - 12) : (v.groundY - v.height * 0.52);
        const startAng = v.facingSign > 0 ? -0.82 : (Math.PI - 0.65);
        const endAng = v.facingSign > 0 ? 0.65 : (Math.PI + 0.82);

        c.strokeStyle = v.color;
        c.lineWidth = v.type === 'sweep_arc' ? 6.5 : 5.0;
        c.beginPath();
        c.ellipse(v.x + v.facingSign * 16, arcY, reachRadius, v.type === 'sweep_arc' ? 24 : (v.height * 0.34), 0, startAng, endAng);
        c.stroke();

        c.strokeStyle = v.accent || '#ffffff';
        c.lineWidth = 2.0;
        c.beginPath();
        c.ellipse(v.x + v.facingSign * 16, arcY, reachRadius * 0.96, v.type === 'sweep_arc' ? 18 : (v.height * 0.30), 0, startAng, endAng);
        c.stroke();
      } else if (v.type === 'armor_gold_clang' || v.type === 'guard_grit_spark') {
        // Golden Metallic Armor flash ring / Super-Armor Grit shield spark
        const cx = v.x + v.facingSign * 12;
        const cy = v.groundY - v.height * 0.52;
        c.strokeStyle = v.color || '#ffd166';
        c.lineWidth = 4.0 * (1 - t * 0.5);
        const r = 16 + t * 52;
        c.beginPath();
        for (let s = 0; s < 6; s++) {
          const ang = (s * Math.PI) / 3;
          const px = cx + Math.cos(ang) * r;
          const py = cy + Math.sin(ang) * r;
          if (s === 0) c.moveTo(px, py);
          else c.lineTo(px, py);
        }
        c.closePath();
        c.stroke();
      } else if (v.type === 'prepare_pulse' || v.type === 'boost_install') {
        // Kinetic Neutral Turn upward ki ring
        const isBoost = v.type === 'boost_install';
        c.strokeStyle = v.color;
        c.lineWidth = isBoost ? 4.0 : 2.8;
        const ry = v.groundY - t * v.height * (isBoost ? 0.88 : 0.55);
        c.beginPath();
        c.ellipse(v.x, ry, v.width * (0.42 + t * 0.25), 9 + t * 6, 0, 0, Math.PI * 2);
        c.stroke();
      } else if (v.type === 'focus_ink' || v.type === 'exceed_burst' || v.type === 'speed_ring' || v.type === 'ki_shockwave' || v.type === 'clash_spark') {
        c.strokeStyle = v.color;
        c.lineWidth = v.type === 'exceed_burst' ? 3.2 : 3.0;
        const maxExpand = v.type === 'ki_shockwave'
          ? Math.min(125, Math.max(68, (v.reachPx || 0) * 0.55))
          : (v.type === 'exceed_burst' ? 74 : 58);
        const r = 18 + t * maxExpand;
        c.globalAlpha = Math.max(0, (1 - t) * (v.type === 'exceed_burst' ? 0.65 : 0.85));
        c.beginPath();
        c.arc(v.x, v.groundY - v.height * 0.48, r, 0, Math.PI * 2);
        c.fillStyle = 'rgba(0,0,0,0)';
        c.stroke();
      } else if (v.type === 'dust' || v.type === 'skid_sparks' || v.type === 'whiff_dust') {
        c.fillStyle = v.color;
        for (let k = -2; k <= 2; k++) {
          const px = v.x + k * 12 - v.facingSign * t * 24;
          const py = v.groundY - Math.abs(k) * 4 - t * 14;
          c.beginPath();
          c.arc(px, py, 3.5 * (1 - t), 0, Math.PI * 2);
          c.fill();
        }
      }
      c.restore();

      if (t >= 1) stageVfx.splice(i, 1);
    }
  }

  function tick(nowMs) {
    rafId = requestAnimationFrame(tick);
    if (!mounted) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      lastTimeMs = nowMs;
      return;
    }

    const dt = lastTimeMs > 0 ? Math.min(0.05, Math.max(0.001, (nowMs - lastTimeMs) / 1000)) : (1 / 60);
    lastTimeMs = nowMs;
    stageClockSec += dt;

    syncDomMetrics();

    // Update decaying afterimages
    for (let i = afterimages.length - 1; i >= 0; i--) {
      const ai = afterimages[i];
      ai.elapsed += dt;
      if (ai.elapsed >= ai.duration) {
        afterimages.splice(i, 1);
      } else {
        ai.alpha = ai.maxAlpha * (1 - ai.elapsed / ai.duration);
      }
    }

    stepFighter(fighters.p1, dt);
    stepFighter(fighters.p2, dt);
    stepCameraEffects(dt);

    const activeList = [];
    if (fighters.p1.active) activeList.push(fighters.p1);
    if (fighters.p2.active) activeList.push(fighters.p2);
    activeList.sort((a, b) => a.zPriority - b.zPriority);

    if (useWebGL2) {
      renderWebGL2(activeList);
    } else {
      renderCanvas2DFallback(activeList);
    }
    renderVfxLayer(dt, activeList);
  }

  function startLoop() {
    if (rafId || typeof requestAnimationFrame !== 'function') return;
    lastTimeMs = 0;
    rafId = requestAnimationFrame(tick);
  }

  function getFighterHitPoint(pid, socketKind = 'impact') {
    const f = fighters[pid];
    if (!mounted || !f || !f.active) return null;
    const activeFrameKey = getFighterActiveFrameKey(f);
    const cal = (typeof StandeeAssets !== 'undefined')
      ? (StandeeAssets.getFrameCalibration
        ? StandeeAssets.getFrameCalibration(f.charKey, activeFrameKey)
        : (StandeeAssets.getCalibration ? StandeeAssets.getCalibration(f.charKey) : null))
      : null;
    const rel = socketKind === 'muzzle'
      ? (cal && cal.muzzleRel ? cal.muzzleRel : { dx: 0.16, h: 0.56 })
      : (cal && cal.impactRel ? cal.impactRel : { dx: 0.04, h: 0.54 });
    const hopY = computeCurrentHopY(f);
    const lungeOffsetX = computeFighterLungeOffsetX(f);
    return {
      x: f.x + lungeOffsetX + f.facingSign * f.width * (rel.dx || 0),
      y: f.groundY + hopY - f.height * (rel.h || 0.54),
      groundY: f.groundY,
      facingSign: f.facingSign,
      space: (inStrikePlayback && strikeSpaces[pid] != null) ? strikeSpaces[pid] : f.space,
    };
  }

  function triggerChoreography(pid, cardKey, stepKind, ctx = {}) {
    const f = fighters[pid];
    if (!f || !f.active || typeof resolveStandeeChoreography !== 'function') return null;
    const opp = fighters[pid === 'p1' ? 'p2' : 'p1'];
    const distPx = (opp && opp.active) ? Math.abs(opp.x - f.x) : 0;
    const mergedCtx = {
      exceeded: !!f.exceeded,
      ...ctx,
    };
    const choreo = resolveStandeeChoreography(f.charKey, cardKey, stepKind, mergedCtx);
    if (!choreo) return null;
    if (ctx.holdAtU != null) {
      choreo.holdAtU = ctx.holdAtU;
      if (choreo.vfx) {
        choreo.vfx = { ...choreo.vfx, holdAtT: ctx.holdAtU };
      }
    }
    startChoreography(f, choreo, { distanceToTargetPx: distPx });
    if (choreo.vfx) {
      spawnStageVfx(pid, choreo.vfx);
    }
    if (choreo.projectile) {
      spawnProjectile(pid, pid === 'p1' ? 'p2' : 'p1', cardKey, choreo);
    }
    return choreo;
  }

  // Auto-mount cleanly when browser DOM is present
  if (canUseDom()) {
    if (document.readyState === 'loading' && document.addEventListener) {
      document.addEventListener('DOMContentLoaded', mount, { once: true });
    } else {
      setTimeout(mount, 0);
    }
  }

  const api = {
    mount,
    syncAfterRender,
    notifyBoardMove,
    isFighterActive,
    getFighterHitPoint,
    triggerChoreography,
    getStateSnapshot: () => ({
      mounted,
      useWebGL2,
      inStrikePlayback,
      p1: {
        active: fighters.p1.active,
        charKey: fighters.p1.charKey,
        activeFrameKey: fighters.p1.activeFrameKey,
        exceeded: fighters.p1.exceeded,
        activeBoostCount: fighters.p1.activeBoostCount,
        auraFlare: fighters.p1.auraFlare,
        x: fighters.p1.x,
        groundY: fighters.p1.groundY,
        pose: fighters.p1.choreo && fighters.p1.choreo.poseKind,
        additivePose: fighters.p1.additiveChoreo && fighters.p1.additiveChoreo.poseKind,
      },
      p2: {
        active: fighters.p2.active,
        charKey: fighters.p2.charKey,
        activeFrameKey: fighters.p2.activeFrameKey,
        exceeded: fighters.p2.exceeded,
        activeBoostCount: fighters.p2.activeBoostCount,
        auraFlare: fighters.p2.auraFlare,
        x: fighters.p2.x,
        groundY: fighters.p2.groundY,
        pose: fighters.p2.choreo && fighters.p2.choreo.poseKind,
        additivePose: fighters.p2.additiveChoreo && fighters.p2.additiveChoreo.poseKind,
      },
      projectiles: projectiles.length,
      afterimages: afterimages.length,
    }),
  };

  if (typeof window !== 'undefined') window.StandeeStage = api;
  if (typeof globalThis !== 'undefined') globalThis.StandeeStage = api;
  return api;
})();

// ============================================================
// FIGHTER STANDEES — Registry, Bidirectional Facing & Alpha-Matting
// ============================================================
// Extensible standee system for full-body arena fighters standing
// on the Shrine Courtyard stone pavement. Any fighter registered in
// FIGHTER_STANDEES renders as a grounded full-body standee capable of
// facing both left and right (via nativeFacing + automatic mirroring
// or optional dedicated srcLeft / srcRight artwork).

const FIGHTER_STANDEES = {
  ryu: {
    src: '/assets/aistudio/ryu_standee.jpg',
    nativeFacing: 'right',
    supportedFacings: ['left', 'right'],
    heightScale: 1.02,
    aspectRatio: 1024 / 1536,
    footOffsetPct: 2.3,
    footCenterPct: 50,
    shadowWidthPct: 76,
    matteMode: 'auto',
  },
  ken: {
    src: '/assets/aistudio/ken_standee.jpg',
    nativeFacing: 'right',
    supportedFacings: ['left', 'right'],
    heightScale: 1.02,
    aspectRatio: 1024 / 1536,
    footOffsetPct: 2.2,
    footCenterPct: 50,
    shadowWidthPct: 76,
    matteMode: 'auto',
  },
  cviper: {
    src: '/assets/aistudio/image_9b961de0.png',
    nativeFacing: 'right',
    supportedFacings: ['left', 'right'],
    heightScale: 1.04,
    aspectRatio: 1024 / 1536,
    footOffsetPct: 2.7,
    footCenterPct: 51,
    shadowWidthPct: 72,
    matteMode: 'auto',
  },
};

function normalizeFacingDirection(facing) {
  return (facing === 'left' || facing === 'facing-left') ? 'left' : 'right';
}

function getStandeeSpec(characterKey) {
  if (!characterKey || typeof characterKey !== 'string') return null;
  return FIGHTER_STANDEES[characterKey] || null;
}

function shouldFlipStandee(nativeFacing, currentFacing) {
  const nativeDir = normalizeFacingDirection(nativeFacing);
  const curDir = normalizeFacingDirection(currentFacing);
  return nativeDir !== curDir;
}

// Resolves full directional render state for a fighter standee in either
// 'left' or 'right' facing. Supports dedicated directional assets (srcLeft /
// srcRight) as well as automatic mirroring from a single nativeFacing asset.
function resolveStandeeFacing(characterKey, currentFacing) {
  const spec = getStandeeSpec(characterKey);
  if (!spec) return null;
  const targetDir = normalizeFacingDirection(currentFacing);
  if (targetDir === 'left' && spec.srcLeft) {
    return {
      facing: 'left',
      nativeFacing: 'left',
      src: spec.srcLeft,
      flipped: false,
    };
  }
  if (targetDir === 'right' && spec.srcRight) {
    return {
      facing: 'right',
      nativeFacing: 'right',
      src: spec.srcRight,
      flipped: false,
    };
  }
  const nativeDir = normalizeFacingDirection(spec.nativeFacing);
  return {
    facing: targetDir,
    nativeFacing: nativeDir,
    src: spec.src,
    flipped: nativeDir !== targetDir,
  };
}

function hasTransparentBorder(data, width, height) {
  if (!data || width <= 0 || height <= 0) return false;
  let sampled = 0;
  let transparent = 0;
  const stepX = Math.max(1, Math.floor(width / 48));
  const stepY = Math.max(1, Math.floor(height / 48));
  for (let x = 0; x < width; x += stepX) {
    sampled += 2;
    if (data[(x) * 4 + 3] < 245) transparent++;
    if (data[((height - 1) * width + x) * 4 + 3] < 245) transparent++;
  }
  for (let y = 0; y < height; y += stepY) {
    sampled += 2;
    if (data[(y * width) * 4 + 3] < 245) transparent++;
    if (data[(y * width + (width - 1)) * 4 + 3] < 245) transparent++;
  }
  return sampled > 0 && (transparent / sampled) >= 0.1;
}

// Pure RGBA pixel-matting kernel (no DOM required, unit-testable in Node).
// Mutates `data` (Uint8ClampedArray, length width*height*4) in place and
// returns stats { clearedPixels, matted }.
// Handles both warm fire auras (Ken, C. Viper) and cool cyan ki auras (Ryu)
// while preserving enclosed white/cream clothing like Ryu's karate gi.
function matteStandeeRgba(data, width, height, opts = {}) {
  const n = width * height;
  if (!data || data.length < n * 4 || n === 0) {
    return { clearedPixels: 0, matted: false };
  }
  if (!opts.force && hasTransparentBorder(data, width, height)) {
    return { clearedPixels: 0, matted: false };
  }

  const candMinRgb = opts.candMinRgb != null ? opts.candMinRgb : 232;
  const candMaxSat = opts.candMaxSat != null ? opts.candMaxSat : 14;
  const holeMinSize = opts.holeMinSize != null ? opts.holeMinSize : 16;
  const holeAvgMin = opts.holeAvgMin != null ? opts.holeAvgMin : 247;
  const holeAvgSat = opts.holeAvgSat != null ? opts.holeAvgSat : 6;
  const bgRef = 252;

  // 1. Mark bright neutral pixels as backdrop candidates
  const isCand = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const r = data[p], g = data[p + 1], b = data[p + 2], a = data[p + 3];
    if (a < 16) {
      isCand[i] = 1;
      continue;
    }
    const mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
    const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
    if (mn >= candMinRgb && (mx - mn) <= candMaxSat) {
      isCand[i] = 1;
    }
  }

  // 2. 4-connected components: clear border-touching backdrop and enclosed pure-neutral holes
  const visited = new Uint8Array(n);
  const bgMask = new Uint8Array(n);
  const queue = new Int32Array(n);
  let clearedPixels = 0;

  for (let i = 0; i < n; i++) {
    if (!isCand[i] || visited[i]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = i;
    visited[i] = 1;
    let touchesBorder = false;
    let sumMin = 0;
    let sumSat = 0;

    while (head < tail) {
      const cur = queue[head++];
      const cx = cur % width;
      const cy = (cur / width) | 0;
      if (cx === 0 || cy === 0 || cx === width - 1 || cy === height - 1) {
        touchesBorder = true;
      }
      const p = cur * 4;
      const r = data[p], g = data[p + 1], b = data[p + 2];
      const mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
      const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
      sumMin += mn;
      sumSat += (mx - mn);

      if (cx > 0) {
        const nb = cur - 1;
        if (isCand[nb] && !visited[nb]) { visited[nb] = 1; queue[tail++] = nb; }
      }
      if (cx < width - 1) {
        const nb = cur + 1;
        if (isCand[nb] && !visited[nb]) { visited[nb] = 1; queue[tail++] = nb; }
      }
      if (cy > 0) {
        const nb = cur - width;
        if (isCand[nb] && !visited[nb]) { visited[nb] = 1; queue[tail++] = nb; }
      }
      if (cy < height - 1) {
        const nb = cur + width;
        if (isCand[nb] && !visited[nb]) { visited[nb] = 1; queue[tail++] = nb; }
      }
    }

    const avgMin = sumMin / tail;
    const avgSat = sumSat / tail;
    const isHole = !touchesBorder && tail >= holeMinSize && avgMin >= holeAvgMin && avgSat <= holeAvgSat;
    if (touchesBorder || isHole) {
      for (let k = 0; k < tail; k++) {
        const idx = queue[k];
        bgMask[idx] = 1;
        data[idx * 4 + 3] = 0;
      }
      clearedPixels += tail;
    }
  }

  if (clearedPixels === 0) {
    return { clearedPixels: 0, matted: false };
  }

  // 3. Build 4-pixel distance band around bgMask for smooth edge & energy aura decontamination
  const dist = new Uint8Array(n);
  const maxBand = 4;
  let bfsHead = 0;
  let bfsTail = 0;

  for (let i = 0; i < n; i++) {
    if (bgMask[i]) continue;
    const cx = i % width;
    const cy = (i / width) | 0;
    if (
      (cx > 0 && bgMask[i - 1]) ||
      (cx < width - 1 && bgMask[i + 1]) ||
      (cy > 0 && bgMask[i - width]) ||
      (cy < height - 1 && bgMask[i + width])
    ) {
      dist[i] = 1;
      queue[bfsTail++] = i;
    }
  }

  while (bfsHead < bfsTail) {
    const cur = queue[bfsHead++];
    const d = dist[cur];
    if (d >= maxBand) continue;
    const cx = cur % width;
    const cy = (cur / width) | 0;
    const nextD = d + 1;
    if (cx > 0) {
      const nb = cur - 1;
      if (!bgMask[nb] && dist[nb] === 0) { dist[nb] = nextD; queue[bfsTail++] = nb; }
    }
    if (cx < width - 1) {
      const nb = cur + 1;
      if (!bgMask[nb] && dist[nb] === 0) { dist[nb] = nextD; queue[bfsTail++] = nb; }
    }
    if (cy > 0) {
      const nb = cur - width;
      if (!bgMask[nb] && dist[nb] === 0) { dist[nb] = nextD; queue[bfsTail++] = nb; }
    }
    if (cy < height - 1) {
      const nb = cur + width;
      if (!bgMask[nb] && dist[nb] === 0) { dist[nb] = nextD; queue[bfsTail++] = nb; }
    }
  }

  // 4. White-matte unpremultiplication on silhouette fringes and elemental energy swirls (warm fire & cool ki)
  for (let k = 0; k < bfsTail; k++) {
    const idx = queue[k];
    const d = dist[idx];
    const p = idx * 4;
    const r = data[p], g = data[p + 1], b = data[p + 2];
    const mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
    const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
    const sat = mx - mn;

    // Any colored elemental aura (warm red/orange fire or cool cyan/blue ki) blended over white
    const isChromaFringe = sat >= 12 && mn >= 125;
    // Neutral/cool anti-aliased edge right on silhouette boundary (dist 1..2)
    const isNeutralEdge = d <= 2 && sat <= 26 && mn >= 140;

    if (isChromaFringe) {
      const alphaFromWhite = (bgRef - mn) / 140;
      const alphaFromChroma = sat / 165;
      let alpha = Math.max(alphaFromWhite, alphaFromChroma);
      if (d === 1) alpha *= 0.88;
      if (alpha < 0.03) {
        data[p + 3] = 0;
      } else if (alpha < 0.98) {
        const inv = 1 / alpha;
        const nr = Math.round((r - (1 - alpha) * bgRef) * inv);
        const ng = Math.round((g - (1 - alpha) * bgRef) * inv);
        const nb = Math.round((b - (1 - alpha) * bgRef) * inv);
        data[p] = nr < 0 ? 0 : (nr > 255 ? 255 : nr);
        data[p + 1] = ng < 0 ? 0 : (ng > 255 ? 255 : ng);
        data[p + 2] = nb < 0 ? 0 : (nb > 255 ? 255 : nb);
        data[p + 3] = Math.round(alpha * 255);
      }
    } else if (isNeutralEdge) {
      const avg = (r + g + b) / 3;
      let alpha = (bgRef - avg) / 118;
      if (d === 1 && avg >= 224) alpha *= 0.55;
      if (alpha <= 0.03) {
        data[p + 3] = 0;
      } else if (alpha < 0.98) {
        const inv = 1 / alpha;
        const nr = Math.round((r - (1 - alpha) * bgRef) * inv);
        const ng = Math.round((g - (1 - alpha) * bgRef) * inv);
        const nb = Math.round((b - (1 - alpha) * bgRef) * inv);
        data[p] = nr < 0 ? 0 : (nr > 255 ? 255 : nr);
        data[p + 1] = ng < 0 ? 0 : (ng > 255 ? 255 : ng);
        data[p + 2] = nb < 0 ? 0 : (nb > 255 ? 255 : nb);
        data[p + 3] = Math.round(alpha * 255);
      }
    }
  }

  return { clearedPixels, matted: true };
}

const StandeeAssets = (() => {
  const readyUrls = {};
  const directionalUrls = {};
  const inflight = {};
  const failed = {};
  const MAX_CANVAS_HEIGHT = 960;

  function canProcessInBrowser() {
    return (
      typeof window !== 'undefined' &&
      typeof document !== 'undefined' &&
      typeof Image !== 'undefined' &&
      typeof document.createElement === 'function'
    );
  }

  function applyReadyUrlToDom(key, url) {
    if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return;
    const imgs = document.querySelectorAll(`img[data-standee-key="${key}"]`);
    for (const img of imgs) {
      if (img.getAttribute('src') !== url) img.src = url;
      if (img.dataset) img.dataset.standeeMatted = 'true';
      if (img.classList) img.classList.add('standee-ready');
    }
  }

  function finishKey(key, url, flippedUrl, nativeDir) {
    readyUrls[key] = url;
    const dir = normalizeFacingDirection(nativeDir);
    const oppDir = dir === 'right' ? 'left' : 'right';
    directionalUrls[`${key}:${dir}`] = url;
    directionalUrls[`${key}:${oppDir}`] = flippedUrl || url;
    delete inflight[key];
    applyReadyUrlToDom(key, url);
  }

  function canvasToUrl(canvas, cb) {
    if (typeof canvas.toBlob === 'function' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      canvas.toBlob((blob) => {
        if (blob) cb(URL.createObjectURL(blob));
        else cb(canvas.toDataURL('image/png'));
      }, 'image/png');
    } else {
      cb(canvas.toDataURL('image/png'));
    }
  }

  function ensureLoaded(characterKey) {
    const spec = getStandeeSpec(characterKey);
    if (!spec) return null;
    if (readyUrls[characterKey]) return readyUrls[characterKey];
    if (failed[characterKey]) return null;
    if (spec.matteMode === 'none') {
      finishKey(characterKey, spec.src, spec.src, spec.nativeFacing);
      return spec.src;
    }
    if (!canProcessInBrowser()) {
      return spec.src;
    }
    if (inflight[characterKey]) return null;

    inflight[characterKey] = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      try {
        const natW = img.naturalWidth || img.width || 0;
        const natH = img.naturalHeight || img.height || 0;
        if (!natW || !natH) {
          finishKey(characterKey, spec.src, spec.src, spec.nativeFacing);
          return;
        }
        const scale = natH > MAX_CANVAS_HEIGHT ? (MAX_CANVAS_HEIGHT / natH) : 1;
        const w = Math.max(1, Math.round(natW * scale));
        const h = Math.max(1, Math.round(natH * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          finishKey(characterKey, spec.src, spec.src, spec.nativeFacing);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);
        const result = matteStandeeRgba(imageData.data, w, h);
        if (result.matted) {
          ctx.putImageData(imageData, 0, 0);
        }

        // Also generate the opposite-facing horizontal mirror canvas so both
        // left-facing and right-facing matted assets are cached in memory.
        const mirrorCanvas = document.createElement('canvas');
        mirrorCanvas.width = w;
        mirrorCanvas.height = h;
        const mCtx = mirrorCanvas.getContext('2d');
        if (mCtx) {
          mCtx.translate(w, 0);
          mCtx.scale(-1, 1);
          mCtx.drawImage(canvas, 0, 0);
        }

        canvasToUrl(canvas, (primaryUrl) => {
          if (mCtx) {
            canvasToUrl(mirrorCanvas, (mirroredUrl) => {
              finishKey(characterKey, primaryUrl, mirroredUrl, spec.nativeFacing);
            });
          } else {
            finishKey(characterKey, primaryUrl, primaryUrl, spec.nativeFacing);
          }
        });
      } catch (_) {
        finishKey(characterKey, spec.src, spec.src, spec.nativeFacing);
      }
    };
    img.onerror = () => {
      failed[characterKey] = true;
      delete inflight[characterKey];
    };
    img.src = spec.src;
    return null;
  }

  function getReadySrc(characterKey) {
    const spec = getStandeeSpec(characterKey);
    if (!spec) return null;
    if (readyUrls[characterKey]) return readyUrls[characterKey];
    if (spec.matteMode === 'none') return spec.src;
    return null;
  }

  function getDirectionalSrc(characterKey, facing) {
    const spec = getStandeeSpec(characterKey);
    if (!spec) return null;
    const dir = normalizeFacingDirection(facing);
    if (directionalUrls[`${characterKey}:${dir}`]) {
      return directionalUrls[`${characterKey}:${dir}`];
    }
    return readyUrls[characterKey] || null;
  }

  function preloadForMatch(keys) {
    if (!Array.isArray(keys)) return;
    for (const k of keys) {
      if (getStandeeSpec(k)) ensureLoaded(k);
    }
  }

  function isFailed(characterKey) {
    return !!failed[characterKey];
  }

  return { ensureLoaded, getReadySrc, getDirectionalSrc, preloadForMatch, isFailed };
})();

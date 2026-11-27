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
    aspectRatio: 896 / 1200,
    footOffsetPct: 2.3,
    footCenterPct: 50,
    shadowWidthPct: 76,
    matteMode: 'auto',
    vfxPolicy: 'procedural_exceed_only',
    frames: {
      idle: {
        src: '/assets/aistudio/ryu_standee.jpg',
        uvSockets: {
          leadHand: { normX: 0.86, h: 0.79 },
          rearHand: { normX: 0.54, h: 0.78 },
          leadFoot: { normX: 0.74, h: 0.07 },
          rearFoot: { normX: 0.14, h: 0.07 },
          chest: { normX: 0.48, h: 0.72 },
          head: { normX: 0.53, h: 0.90 },
        },
      },
      sweep_windup: {
        src: '/assets/aistudio/ryu_sweep_windup.jpg',
        uvSockets: {
          leadHand: { normX: 0.60, h: 0.25 },
          rearHand: { normX: 0.38, h: 0.66 },
          leadFoot: { normX: 0.85, h: 0.20 },
          rearFoot: { normX: 0.11, h: 0.18 },
          chest: { normX: 0.50, h: 0.63 },
          head: { normX: 0.62, h: 0.78 },
        },
      },
      sweep_active: {
        src: '/assets/aistudio/ryu_sweep.jpg',
        uvSockets: {
          leadHand: { normX: 0.49, h: 0.60 },
          rearHand: { normX: 0.12, h: 0.30 },
          leadFoot: { normX: 0.89, h: 0.56 },
          rearFoot: { normX: 0.50, h: 0.31 },
          chest: { normX: 0.35, h: 0.62 },
          head: { normX: 0.37, h: 0.76 },
        },
      },
      cross_windup: {
        src: '/assets/aistudio/ryu_cross_windup.jpg',
        uvSockets: {
          leadHand: { normX: 0.90, h: 0.58 },
          rearHand: { normX: 0.42, h: 0.60 },
          leadFoot: { normX: 0.74, h: 0.08 },
          rearFoot: { normX: 0.11, h: 0.07 },
          chest: { normX: 0.52, h: 0.69 },
          head: { normX: 0.66, h: 0.85 },
        },
      },
      cross_strike: {
        src: '/assets/aistudio/ryu_cross.jpg',
        uvSockets: {
          leadHand: { normX: 0.90, h: 0.79 },
          rearHand: { normX: 0.61, h: 0.83 },
          leadFoot: { normX: 0.73, h: 0.11 },
          rearFoot: { normX: 0.10, h: 0.07 },
          chest: { normX: 0.50, h: 0.73 },
          head: { normX: 0.52, h: 0.90 },
        },
      },
      cross_retreat: {
        src: '/assets/aistudio/ryu_backdash.jpg',
        uvSockets: {
          leadHand: { normX: 0.69, h: 0.78 },
          rearHand: { normX: 0.52, h: 0.78 },
          leadFoot: { normX: 0.63, h: 0.22 },
          rearFoot: { normX: 0.12, h: 0.08 },
          chest: { normX: 0.51, h: 0.72 },
          head: { normX: 0.54, h: 0.90 },
        },
      },
    },
  },
  ken: {
    src: '/assets/aistudio/ken_standee.jpg',
    nativeFacing: 'right',
    supportedFacings: ['left', 'right'],
    heightScale: 1.02,
    aspectRatio: 896 / 1200,
    footOffsetPct: 2.2,
    footCenterPct: 50,
    shadowWidthPct: 76,
    matteMode: 'auto',
    vfxPolicy: 'procedural_exceed_only',
    frames: {
      idle: {
        src: '/assets/aistudio/ken_standee.jpg',
        uvSockets: {
          leadHand: { normX: 0.82, h: 0.81 },
          rearHand: { normX: 0.31, h: 0.59 },
          leadFoot: { normX: 0.81, h: 0.07 },
          rearFoot: { normX: 0.13, h: 0.07 },
          chest: { normX: 0.49, h: 0.73 },
          head: { normX: 0.50, h: 0.89 },
        },
      },
      sweep_windup: {
        src: '/assets/aistudio/ken_sweep_windup.jpg',
        uvSockets: {
          leadHand: { normX: 0.66, h: 0.19 },
          rearHand: { normX: 0.23, h: 0.66 },
          leadFoot: { normX: 0.86, h: 0.18 },
          rearFoot: { normX: 0.09, h: 0.16 },
          chest: { normX: 0.52, h: 0.64 },
          head: { normX: 0.73, h: 0.74 },
        },
      },
      sweep_active: {
        src: '/assets/aistudio/ken_sweep.jpg',
        uvSockets: {
          leadHand: { normX: 0.35, h: 0.73 },
          rearHand: { normX: 0.10, h: 0.27 },
          leadFoot: { normX: 0.90, h: 0.74 },
          rearFoot: { normX: 0.49, h: 0.28 },
          chest: { normX: 0.32, h: 0.63 },
          head: { normX: 0.18, h: 0.73 },
        },
      },
      sweep_flare: {
        src: '/assets/aistudio/ken_sweep_flare.jpg',
        uvSockets: {
          leadHand: { normX: 0.58, h: 0.16 },
          rearHand: { normX: 0.58, h: 0.81 },
          leadFoot: { normX: 0.86, h: 0.20 },
          rearFoot: { normX: 0.10, h: 0.26 },
          chest: { normX: 0.55, h: 0.57 },
          head: { normX: 0.71, h: 0.66 },
        },
      },
      cross_windup: {
        src: '/assets/aistudio/ken_cross_windup.jpg',
        uvSockets: {
          leadHand: { normX: 0.83, h: 0.54 },
          rearHand: { normX: 0.20, h: 0.52 },
          leadFoot: { normX: 0.82, h: 0.08 },
          rearFoot: { normX: 0.14, h: 0.07 },
          chest: { normX: 0.49, h: 0.70 },
          head: { normX: 0.50, h: 0.89 },
        },
      },
      cross_strike: {
        src: '/assets/aistudio/ken_cross.jpg',
        uvSockets: {
          leadHand: { normX: 0.90, h: 0.79 },
          rearHand: { normX: 0.59, h: 0.82 },
          leadFoot: { normX: 0.81, h: 0.07 },
          rearFoot: { normX: 0.13, h: 0.07 },
          chest: { normX: 0.49, h: 0.73 },
          head: { normX: 0.50, h: 0.89 },
        },
      },
      cross_retreat: {
        src: '/assets/aistudio/ken_backflip.jpg',
        uvSockets: {
          leadHand: { normX: 0.53, h: 0.61 },
          rearHand: { normX: 0.41, h: 0.35 },
          leadFoot: { normX: 0.20, h: 0.49 },
          rearFoot: { normX: 0.24, h: 0.52 },
          chest: { normX: 0.58, h: 0.45 },
          head: { normX: 0.54, h: 0.25 },
        },
      },
    },
  },
  cammy: {
    src: '/assets/aistudio/cammy_standee.jpg',
    nativeFacing: 'right',
    supportedFacings: ['left', 'right'],
    heightScale: 1.00,
    aspectRatio: 896 / 1200,
    footOffsetPct: 2.4,
    footCenterPct: 50,
    shadowWidthPct: 74,
    matteMode: 'auto',
    vfxPolicy: 'procedural_exceed_only',
  },
  zangief: {
    src: '/assets/aistudio/zangief_standee.jpg',
    nativeFacing: 'right',
    supportedFacings: ['left', 'right'],
    heightScale: 1.24,
    aspectRatio: 896 / 1200,
    footOffsetPct: 2.1,
    footCenterPct: 50,
    shadowWidthPct: 92,
    matteMode: 'auto',
    vfxPolicy: 'procedural_exceed_only',
  },
  cviper: {
    src: '/assets/aistudio/cviper_standee.jpg',
    nativeFacing: 'right',
    supportedFacings: ['left', 'right'],
    heightScale: 1.04,
    aspectRatio: 896 / 1200,
    footOffsetPct: 2.7,
    footCenterPct: 51,
    shadowWidthPct: 72,
    matteMode: 'auto',
    vfxPolicy: 'procedural_exceed_only',
  },
};

function normalizeFacingDirection(facing) {
  return (facing === 'left' || facing === 'facing-left') ? 'left' : 'right';
}

function getStandeeSpec(characterKey) {
  if (!characterKey || typeof characterKey !== 'string') return null;
  return FIGHTER_STANDEES[characterKey] || null;
}

function getStandeeFrameSpec(characterKey, frameKey = 'idle') {
  const spec = getStandeeSpec(characterKey);
  if (!spec) return null;
  const fKey = frameKey || 'idle';
  if (spec.frames && spec.frames[fKey]) {
    return spec.frames[fKey];
  }
  if (spec.frames && spec.frames.idle) {
    return spec.frames.idle;
  }
  return { src: spec.src, uvSockets: null };
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

// Scans an RGBA buffer to extract pelvis-centroid anchorX (35%..65% band),
// sole-locked footBottomRatio, headTopRatio, and VFX origin landmarks with
// co-adjustment invariant so landmarks remain fixed relative to torso mass.
function calibrateStandeeRgba(data, width, height, opts = {}) {
  const w = width | 0;
  const h = height | 0;
  if (!data || w <= 0 || h <= 0 || data.length < w * h * 4) {
    return {
      width: w,
      height: h,
      anchorXRatio: 0.5,
      footBottomRatio: 0.98,
      headTopRatio: 0.05,
      muzzleRel: { dx: 0.18, h: 0.56 },
      impactRel: { dx: 0.02, h: 0.54 },
      slashRel: { dx: 0.24, h: 0.58 },
    };
  }

  const alphaThresh = opts.alphaThresh != null ? opts.alphaThresh : 128;
  const bandY0 = Math.max(0, Math.floor(h * 0.35));
  const bandY1 = Math.min(h - 1, Math.floor(h * 0.65));

  let sumX = 0;
  let bandCount = 0;
  let totalSumX = 0;
  let totalCount = 0;
  let topY = h;
  let bottomY = -1;

  for (let y = 0; y < h; y++) {
    let rowSumX = 0;
    let rowCount = 0;
    const rowOff = y * w;
    for (let x = 0; x < w; x++) {
      const a = data[(rowOff + x) * 4 + 3];
      if (a > alphaThresh) {
        rowSumX += x;
        rowCount++;
      }
    }
    if (rowCount > 0) {
      totalSumX += rowSumX;
      totalCount += rowCount;
      if (rowCount >= 2 || topY === h) {
        if (y < topY) topY = y;
      }
      if (rowCount >= 2 || bottomY < 0) {
        if (y > bottomY) bottomY = y;
      }
      if (y >= bandY0 && y <= bandY1) {
        sumX += rowSumX;
        bandCount += rowCount;
      }
    }
  }

  const rawAnchorX = bandCount > 0
    ? (sumX / bandCount)
    : (totalCount > 0 ? (totalSumX / totalCount) : (w * 0.5));
  const clampedAnchorX = Math.max(w * 0.30, Math.min(w * 0.70, rawAnchorX));
  const anchorXRatio = clampedAnchorX / w;
  const deltaAnchorRatio = anchorXRatio - 0.5;

  const resolvedBottomY = bottomY >= 0 ? bottomY : Math.floor(h * 0.98);
  const resolvedTopY = topY < h ? topY : Math.floor(h * 0.05);
  const footBottomRatio = Math.max(0.55, Math.min(1.0, (resolvedBottomY + 1) / h));
  const headTopRatio = Math.max(0.0, Math.min(0.45, resolvedTopY / h));

  // Co-adjustment invariant: shift relative VFX origins by -deltaAnchorRatio
  // whenever pelvis centroid differs from horizontal frame midpoint (0.5).
  return {
    width: w,
    height: h,
    anchorXRatio,
    footBottomRatio,
    headTopRatio,
    muzzleRel: { dx: 0.22 - deltaAnchorRatio, h: 0.56 },
    impactRel: { dx: 0.02 - deltaAnchorRatio, h: 0.54 },
    slashRel: { dx: 0.26 - deltaAnchorRatio, h: 0.58 },
  };
}

const StandeeAssets = (() => {
  const readyUrls = {};
  const directionalUrls = {};
  const surfaces = {};
  const calibrations = {};
  const frameReadyUrls = {};
  const frameSurfaces = {};
  const frameCalibrations = {};
  const inflight = {};
  const failed = {};
  const readyListeners = new Set();
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

  function finishKey(key, url, flippedUrl, nativeDir, surfaceCanvas, calibration) {
    readyUrls[key] = url;
    frameReadyUrls[`${key}:idle`] = url;
    if (surfaceCanvas) {
      surfaces[key] = surfaceCanvas;
      frameSurfaces[`${key}:idle`] = surfaceCanvas;
    }
    if (calibration) {
      calibrations[key] = calibration;
      frameCalibrations[`${key}:idle`] = calibration;
    }
    const dir = normalizeFacingDirection(nativeDir);
    const oppDir = dir === 'right' ? 'left' : 'right';
    directionalUrls[`${key}:${dir}`] = url;
    directionalUrls[`${key}:${oppDir}`] = flippedUrl || url;
    delete inflight[key];
    applyReadyUrlToDom(key, url);
    for (const fn of [...readyListeners]) {
      try { fn(key); } catch (_) {}
    }
  }

  function finishFrameKey(characterKey, frameKey, url, surfaceCanvas, calibration) {
    const compositeKey = `${characterKey}:${frameKey}`;
    frameReadyUrls[compositeKey] = url;
    if (surfaceCanvas) frameSurfaces[compositeKey] = surfaceCanvas;
    if (calibration) frameCalibrations[compositeKey] = calibration;
    delete inflight[compositeKey];
    for (const fn of [...readyListeners]) {
      try { fn(characterKey, frameKey); } catch (_) {}
    }
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

  function ensureFrameLoaded(characterKey, frameKey = 'idle') {
    if (!frameKey || frameKey === 'idle') {
      return ensureLoaded(characterKey);
    }
    const spec = getStandeeSpec(characterKey);
    const frameSpec = getStandeeFrameSpec(characterKey, frameKey);
    if (!spec || !frameSpec || !frameSpec.src) return null;
    const compositeKey = `${characterKey}:${frameKey}`;
    if (frameReadyUrls[compositeKey]) return frameReadyUrls[compositeKey];
    if (failed[compositeKey]) return null;
    if (spec.matteMode === 'none') {
      finishFrameKey(characterKey, frameKey, frameSpec.src, null, null);
      return frameSpec.src;
    }
    if (!canProcessInBrowser()) {
      return frameSpec.src;
    }
    if (inflight[compositeKey]) return null;

    inflight[compositeKey] = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      try {
        const natW = img.naturalWidth || img.width || 0;
        const natH = img.naturalHeight || img.height || 0;
        if (!natW || !natH) {
          finishFrameKey(characterKey, frameKey, frameSpec.src, null, null);
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
          finishFrameKey(characterKey, frameKey, frameSpec.src, null, null);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);
        const result = matteStandeeRgba(imageData.data, w, h);
        if (result.matted) {
          ctx.putImageData(imageData, 0, 0);
        }
        const cal = calibrateStandeeRgba(imageData.data, w, h);
        canvasToUrl(canvas, (primaryUrl) => {
          finishFrameKey(characterKey, frameKey, primaryUrl, canvas, cal);
        });
      } catch (_) {
        finishFrameKey(characterKey, frameKey, frameSpec.src, null, null);
      }
    };
    img.onerror = () => {
      failed[compositeKey] = true;
      delete inflight[compositeKey];
    };
    img.src = frameSpec.src;
    return null;
  }

  function ensureLoaded(characterKey) {
    const spec = getStandeeSpec(characterKey);
    if (!spec) return null;
    if (spec.frames) {
      for (const fKey of Object.keys(spec.frames)) {
        if (fKey !== 'idle') ensureFrameLoaded(characterKey, fKey);
      }
    }
    if (readyUrls[characterKey]) return readyUrls[characterKey];
    if (failed[characterKey]) return null;
    if (spec.matteMode === 'none') {
      finishKey(characterKey, spec.src, spec.src, spec.nativeFacing, null, null);
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
          finishKey(characterKey, spec.src, spec.src, spec.nativeFacing, null, null);
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
          finishKey(characterKey, spec.src, spec.src, spec.nativeFacing, null, null);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);
        const result = matteStandeeRgba(imageData.data, w, h);
        if (result.matted) {
          ctx.putImageData(imageData, 0, 0);
        }
        const cal = calibrateStandeeRgba(imageData.data, w, h);

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
              finishKey(characterKey, primaryUrl, mirroredUrl, spec.nativeFacing, canvas, cal);
            });
          } else {
            finishKey(characterKey, primaryUrl, primaryUrl, spec.nativeFacing, canvas, cal);
          }
        });
      } catch (_) {
        finishKey(characterKey, spec.src, spec.src, spec.nativeFacing, null, null);
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

  function getFrameReadySrc(characterKey, frameKey = 'idle') {
    if (!frameKey || frameKey === 'idle') return getReadySrc(characterKey);
    const compositeKey = `${characterKey}:${frameKey}`;
    if (frameReadyUrls[compositeKey]) return frameReadyUrls[compositeKey];
    return getReadySrc(characterKey);
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

  function getSurface(characterKey) {
    return surfaces[characterKey] || null;
  }

  function getFrameSurface(characterKey, frameKey = 'idle') {
    if (!frameKey || frameKey === 'idle') return getSurface(characterKey);
    const compositeKey = `${characterKey}:${frameKey}`;
    return frameSurfaces[compositeKey] || surfaces[characterKey] || null;
  }

  function getCalibration(characterKey) {
    return calibrations[characterKey] || null;
  }

  function getFrameCalibration(characterKey, frameKey = 'idle') {
    if (!frameKey || frameKey === 'idle') return getCalibration(characterKey);
    const compositeKey = `${characterKey}:${frameKey}`;
    return frameCalibrations[compositeKey] || calibrations[characterKey] || null;
  }

  function onReady(cb) {
    if (typeof cb !== 'function') return () => {};
    readyListeners.add(cb);
    return () => readyListeners.delete(cb);
  }

  function preloadForMatch(keys) {
    if (!Array.isArray(keys)) return;
    for (const k of keys) {
      const spec = getStandeeSpec(k);
      if (spec) {
        ensureLoaded(k);
        if (spec.frames) {
          for (const fKey of Object.keys(spec.frames)) {
            ensureFrameLoaded(k, fKey);
          }
        }
      }
    }
  }

  function isFailed(characterKey) {
    return !!failed[characterKey];
  }

  return {
    ensureLoaded,
    ensureFrameLoaded,
    getReadySrc,
    getFrameReadySrc,
    getDirectionalSrc,
    getSurface,
    getFrameSurface,
    getCalibration,
    getFrameCalibration,
    onReady,
    preloadForMatch,
    isFailed,
  };
})();

// ============================================================
// PURE KINEMATICS, 4-KNOT SPINE & SYMPLECTIC SPRING RIG MATH
// ============================================================
const StandeeRigMath = (() => {
  const CANONICAL_HEIGHT = 214;
  const KNOT_HEIGHTS = [0.0, 0.33, 0.67, 1.0];

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function smoothstep(edge0, edge1, x) {
    if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function quinticEase(t) {
    const x = clamp(t, 0, 1);
    return x * x * x * (x * (x * 6 - 15) + 10);
  }

  // C2 quintic solidity blend: alphaA + alphaB >= 1.0 across t in [0, 1]
  function computeSolidityAlphas(t) {
    const u = quinticEase(t);
    const alphaA = u < 0.55 ? 1.0 : (1.0 - u) / 0.45;
    return { u, alphaA, alphaB: u };
  }

  // Crisp-cut safe transition evaluator (guards blendDuration === 0 even at dt === 0)
  function computeFrameTransitionState(elapsed, blendDuration) {
    if (!blendDuration || blendDuration <= 0) {
      return { frameBlendAlpha: 1.0, activeProgress: 1.0 };
    }
    const rawT = clamp(elapsed / blendDuration, 0, 1);
    return {
      frameBlendAlpha: quinticEase(rawT),
      activeProgress: rawT,
    };
  }

  // Strictly confined airborne stride hop: 0 when u outside [0.22, 0.78], <= 0 inside
  function hopYPx(u, height) {
    if (!height || height <= 0 || u < 0.22 || u > 0.78) return 0;
    return -height * Math.sin(((u - 0.22) / 0.56) * Math.PI);
  }

  // Generalized airborne arc over [winStart, winEnd] for jumps / Dive / Shoryuken / Backflip
  function airborneArcYPx(u, height, winStart = 0.22, winEnd = 0.78) {
    if (!height || height <= 0 || u < winStart || u > winEnd || winEnd <= winStart) return 0;
    return -Math.max(0, height * Math.sin(((u - winStart) / (winEnd - winStart)) * Math.PI));
  }

  // 2.5D Paper-Mario cosine flip for Cross-Up side swaps (never < 0.18 scaleX so fighters stay solid, hopYPx <= 0)
  function stepHorizontalFlip(u, startSign, targetSign, hopHeight = 18) {
    const t = clamp(u, 0, 1);
    const s0 = startSign >= 0 ? 1 : -1;
    const s1 = targetSign >= 0 ? 1 : -1;
    let scaleX = s0 + (s1 - s0) * (1 - Math.cos(Math.PI * t)) * 0.5;
    if (Math.abs(scaleX) < 0.18) {
      const sign = scaleX === 0 ? (t < 0.5 ? s0 : s1) : (scaleX > 0 ? 1 : -1);
      scaleX = sign * 0.18;
    }
    const hop = -Math.max(0, Math.sin(Math.PI * t) * Math.max(0, hopHeight));
    return { scaleX, hopYPx: hop };
  }

  // Velocity-driven top-weighted horizontal shear: 0 at feet (h = 0)
  function stepHorizontalVelocityShear(vx, h, kSkew = 0.032) {
    const hn = clamp(h, 0, 1);
    if (hn <= 0) return 0;
    const clampedBase = clamp(vx * kSkew, -22, 22);
    return clampedBase * Math.pow(hn, 1.35);
  }

  function createSpringState() {
    return { scaleX: 1, scaleY: 1, velX: 0, velY: 0 };
  }

  function applySpringImpulse(state, scaleX, scaleY, velImpulseX = 0, velImpulseY = 0) {
    if (!state) return state;
    if (scaleX != null) state.scaleX = scaleX;
    if (scaleY != null) state.scaleY = scaleY;
    if (velImpulseX) state.velX += velImpulseX;
    if (velImpulseY) state.velY += velImpulseY;
    return state;
  }

  // 2x sub-stepped Symplectic Euler harmonic oscillator around (1.0, 1.0)
  // Pauses while hitstopRemaining > 0.
  function stepSpring(state, dt, stiffness = 360, damping = 22, hitstopRemaining = 0) {
    if (!state || hitstopRemaining > 0 || !dt || dt <= 0) return state;
    const subDt = Math.min(dt, 0.05) * 0.5;
    for (let step = 0; step < 2; step++) {
      const accX = -stiffness * (state.scaleX - 1) - damping * state.velX;
      const accY = -stiffness * (state.scaleY - 1) - damping * state.velY;
      state.velX += accX * subDt;
      state.velY += accY * subDt;
      state.scaleX += state.velX * subDt;
      state.scaleY += state.velY * subDt;
    }
    return state;
  }

  function createFourKnotSpine() {
    return [
      { dx: 0, dy: 0, rotRad: 0, scaleX: 1 },
      { dx: 0, dy: 0, rotRad: 0, scaleX: 1 },
      { dx: 0, dy: 0, rotRad: 0, scaleX: 1 },
      { dx: 0, dy: 0, rotRad: 0, scaleX: 1 },
    ];
  }

  function resetFourKnotSpine(knots) {
    for (let i = 0; i < 4; i++) {
      knots[i].dx = 0;
      knots[i].dy = 0;
      knots[i].rotRad = 0;
      knots[i].scaleX = 1;
    }
    return knots;
  }

  function cubicHermite(p0, m0, p1, m1, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    return h00 * p0 + h10 * m0 + h01 * p1 + h11 * m1;
  }

  function evalSpineChannel(knots, prop, seg, t, h0, h1) {
    const p0 = knots[seg][prop];
    const p1 = knots[seg + 1][prop];
    const span = h1 - h0;
    const d0 = seg === 0
      ? ((p1 - p0) / span) * 0.65
      : ((knots[seg + 1][prop] - knots[seg - 1][prop]) / (KNOT_HEIGHTS[seg + 1] - KNOT_HEIGHTS[seg - 1]));
    const d1 = seg === 2
      ? ((p1 - p0) / span) * 0.65
      : ((knots[seg + 2][prop] - knots[seg][prop]) / (KNOT_HEIGHTS[seg + 2] - KNOT_HEIGHTS[seg]));
    return cubicHermite(p0, d0 * span, p1, d1 * span, t);
  }

  // Evaluates 4-knot cubic Hermite spine at normalized height h in [0, 1].
  // Feet (h === 0) are strictly pinned to (0, 0, 0, 1).
  function evalFourKnotSpine(knots, h, out) {
    const target = out || { dx: 0, dy: 0, rotRad: 0, scaleX: 1 };
    const hn = clamp(h, 0, 1);
    if (hn <= 0 || !knots || knots.length < 4) {
      target.dx = 0;
      target.dy = 0;
      target.rotRad = 0;
      target.scaleX = 1;
      return target;
    }
    let seg = 0;
    if (hn >= KNOT_HEIGHTS[2]) seg = 2;
    else if (hn >= KNOT_HEIGHTS[1]) seg = 1;
    const h0 = KNOT_HEIGHTS[seg];
    const h1 = KNOT_HEIGHTS[seg + 1];
    const t = clamp((hn - h0) / (h1 - h0), 0, 1);

    // Ensure feet knot stays pinned regardless of caller mutation
    const f0 = knots[0];
    const savedDx = f0.dx, savedDy = f0.dy, savedRot = f0.rotRad, savedSx = f0.scaleX;
    f0.dx = 0; f0.dy = 0; f0.rotRad = 0; f0.scaleX = 1;

    target.dx = evalSpineChannel(knots, 'dx', seg, t, h0, h1);
    target.dy = evalSpineChannel(knots, 'dy', seg, t, h0, h1);
    target.rotRad = evalSpineChannel(knots, 'rotRad', seg, t, h0, h1);
    target.scaleX = evalSpineChannel(knots, 'scaleX', seg, t, h0, h1);

    f0.dx = savedDx; f0.dy = savedDy; f0.rotRad = savedRot; f0.scaleX = savedSx;
    return target;
  }

  // Zero-GC vertex transform for a 4x6 WebGL2 / Canvas2D deformable standee quad.
  // normX in [0, 1] across image width, h in [0, 1] from sole (0) to crown (1).
  function computeDeformedMeshVertex(normX, h, params, out) {
    const p = out || { x: 0, y: 0 };
    const anchorRatio = params.anchorXRatio != null ? params.anchorXRatio : 0.5;
    const footRatio = params.footBottomRatio != null ? params.footBottomRatio : 0.98;
    const width = params.width;
    const height = params.height;
    const anchorX = params.anchorX;
    const groundY = params.groundY;
    const facingScale = params.facingScale != null ? params.facingScale : 1;
    const spine = params.spine;
    const spring = params.spring;
    const shearPx = params.shearPx || 0;
    const hopOffsetY = params.hopOffsetY || 0;
    const wholeRotRad = params.wholeRotRad || 0;
    const pivotHRatio = params.pivotHRatio != null ? params.pivotHRatio : 0.38;

    const sx = (spring ? spring.scaleX : 1) * (spine ? spine.scaleX : 1);
    const sy = spring ? spring.scaleY : 1;

    // Local coordinates relative to calibrated sole anchor (0, 0), +Y downward
    let lx = (normX - anchorRatio) * width * sx * facingScale;
    let ly = ((1 - h) - footRatio) * height * sy;

    // Spine local rotation tilt around current height band (proportional to h)
    if (spine && spine.rotRad) {
      const sign = facingScale >= 0 ? 1 : -1;
      const rot = spine.rotRad * sign;
      const c = Math.cos(rot);
      const s = Math.sin(rot);
      const leverY = -h * height * 0.28 * sy;
      const rx = lx * c - leverY * s;
      const ry = lx * s + leverY * c;
      lx = rx;
      ly += (ry - leverY);
    }

    if (spine) {
      lx += spine.dx * facingScale;
      ly += spine.dy;
    }
    lx += shearPx;

    // Optional full-body aerial rotation (Ken backflip, Tatsumaki cyclone, Shoryu corkscrew)
    if (wholeRotRad) {
      const pivotY = -pivotHRatio * height * sy;
      const dxp = lx;
      const dyp = ly - pivotY;
      const c = Math.cos(wholeRotRad);
      const s = Math.sin(wholeRotRad);
      lx = dxp * c - dyp * s;
      ly = pivotY + dxp * s + dyp * c;
    }

    p.x = anchorX + lx;
    p.y = groundY + hopOffsetY + ly;
    return p;
  }

  // Dynamic "Lunge-and-Return" root motion envelope for variable-range melee attacks.
  // Given distanceToTargetPx > 0, computes the forward lunge translation so the fighter's
  // attacking limb closes the physical gap across Range 1..3 during Startup->Active,
  // then returns smoothly to their grid space during Recovery.
  function computeDynamicLungeOffset(u, baseLungePx, distanceToTargetPx = 0, isProjectile = false, isWhiff = false, slideReach = null) {
    const t = clamp(u, 0, 1);
    const base = baseLungePx || 0;
    if (base <= 0 && (isProjectile || distanceToTargetPx <= 0)) {
      return base * Math.sin(Math.min(1, t * 1.35) * Math.PI);
    }

    // Opt-in uncapped low-slide contact profile (exclusively Ryu & Ken Sweep so Range 1-3 reaches opponent's ankles)
    if (!isProjectile && slideReach && slideReach.enabled) {
      const fighterW = Math.max(84, slideReach.fighterWidthPx || 148);
      const clearanceRatio = slideReach.clearanceRatio != null ? slideReach.clearanceRatio : 0.58;
      const clearancePx = Math.max(62, fighterW * clearanceRatio);
      const spacePx = Math.max(76, slideReach.spaceWidthPx || 145);
      const maxContactPx = Math.max(520, spacePx * 3.45);
      let peakLunge = Math.max(0, base);
      if (distanceToTargetPx > 0) {
        const contactGap = Math.max(0, distanceToTargetPx - clearancePx);
        if (isWhiff) {
          const whiffMaxSpaces = slideReach.whiffMaxSpaces != null ? slideReach.whiffMaxSpaces : 2.55;
          const safeShortGap = Math.max(0, distanceToTargetPx - fighterW * 0.92);
          peakLunge = Math.max(peakLunge, Math.min(safeShortGap, spacePx * whiffMaxSpaces));
        } else {
          peakLunge = Math.max(peakLunge, Math.min(maxContactPx, contactGap));
        }
      }
      const peakU = clamp(slideReach.peakU != null ? slideReach.peakU : 0.18, 0.08, 0.40);
      const holdEndU = clamp(slideReach.holdEndU != null ? slideReach.holdEndU : 0.52, peakU + 0.05, 0.85);
      const returnEndU = clamp(slideReach.returnEndU != null ? slideReach.returnEndU : 0.95, holdEndU + 0.08, 1.0);
      const holdDrift = slideReach.holdDrift != null ? slideReach.holdDrift : 0.04;
      if (t < peakU) {
        return peakLunge * quinticEase(t / peakU);
      }
      if (t < holdEndU) {
        const holdT = (t - peakU) / (holdEndU - peakU);
        return peakLunge * (1 - holdDrift * holdT);
      }
      if (t < returnEndU) {
        const rec = (t - holdEndU) / (returnEndU - holdEndU);
        return peakLunge * (1 - holdDrift) * (1 - quinticEase(rec));
      }
      return 0;
    }

    let peakLunge = base;
    if (!isProjectile && distanceToTargetPx > 0) {
      const contactGap = Math.max(0, distanceToTargetPx - 64);
      const reachBridge = isWhiff ? Math.min(86, contactGap * 0.45) : Math.min(210, contactGap * 0.76);
      peakLunge = Math.max(base, base * 0.55 + reachBridge);
    }
    // 3-clip envelope: Startup (0..0.24) lunges in, Active (0.24..0.52) holds contact, Recovery (0.52..1.0) snaps back
    if (t < 0.24) {
      return peakLunge * quinticEase(t / 0.24);
    }
    if (t < 0.52) {
      const plateau = (t - 0.24) / 0.28;
      return peakLunge * (1 - 0.08 * plateau);
    }
    const rec = (t - 0.52) / 0.48;
    return peakLunge * 0.92 * (1 - quinticEase(rec));
  }

  // IK Target Snapping reach extension: stretches upper/lower striking knots toward the
  // target hurtbox proportionally to distance (Range 1 stays compact; Range 2-3 extends limb/smear).
  function computeIkReachPx(distanceToTargetPx = 0, rangeSpaces = 1, maxReachPx = 38) {
    const distPx = Math.max(0, distanceToTargetPx || 0);
    const sp = Math.max(1, rangeSpaces || 1);
    const factor = clamp((sp - 1) * 0.42 + (distPx / 420) * 0.58, 0, 1);
    return maxReachPx * factor;
  }

  // 3-Clip Attack State Machine Envelope (Startup -> Active -> Recovery)
  // If isWhiff is true, cancels Active early at u=0.38 and blends into off-balance whiff recovery wobble.
  function computeClipEnvelope(u, isWhiff = false) {
    const t = clamp(u, 0, 1);
    if (isWhiff) {
      if (t < 0.25) return { clip: 'startup', poseWeight: quinticEase(t / 0.25), stumbleWeight: 0 };
      if (t < 0.40) return { clip: 'active_cancel', poseWeight: 1.0 - ((t - 0.25) / 0.15) * 0.35, stumbleWeight: (t - 0.25) / 0.15 };
      const recT = (t - 0.40) / 0.60;
      const decay = 1 - quinticEase(recT);
      return {
        clip: 'whiff_recovery',
        poseWeight: 0.65 * decay,
        stumbleWeight: Math.sin(recT * Math.PI * 2.2) * decay,
      };
    }
    if (t < 0.22) return { clip: 'startup', poseWeight: quinticEase(t / 0.22), stumbleWeight: 0 };
    if (t < 0.66) return { clip: 'active', poseWeight: 1.0, stumbleWeight: 0 };
    return { clip: 'recovery', poseWeight: 1.0 - quinticEase((t - 0.66) / 0.34), stumbleWeight: 0 };
  }

  // Evaluates a crisp-cut multi-frame sequence [{ at: 0.0, frameKey: 'sweep_windup' }, { at: 0.16, frameKey: 'sweep_active' }, ...]
  // Strictly enforces instant crisp cuts (blendDuration = 0, frameBlendAlpha = 1.0) to prevent ghosted limb double-exposure.
  function resolveActiveFrameKey(choreo, u = 0) {
    if (!choreo) return 'idle';
    const seq = choreo.frameSequence;
    if (Array.isArray(seq) && seq.length > 0) {
      const t = clamp(u, 0, 1);
      let active = seq[0].frameKey || choreo.frameKey || 'idle';
      for (let i = 0; i < seq.length; i++) {
        const step = seq[i];
        if (step && typeof step.at === 'number' && t >= step.at && step.frameKey) {
          active = step.frameKey;
        }
      }
      return active;
    }
    return choreo.frameKey || 'idle';
  }

  return {
    CANONICAL_HEIGHT,
    KNOT_HEIGHTS,
    clamp,
    smoothstep,
    quinticEase,
    computeSolidityAlphas,
    computeFrameTransitionState,
    hopYPx,
    airborneArcYPx,
    stepHorizontalFlip,
    stepHorizontalVelocityShear,
    createSpringState,
    applySpringImpulse,
    stepSpring,
    createFourKnotSpine,
    resetFourKnotSpine,
    evalFourKnotSpine,
    computeDeformedMeshVertex,
    computeDynamicLungeOffset,
    computeIkReachPx,
    computeClipEnvelope,
    resolveActiveFrameKey,
  };
})();

function resolveActiveFrameKey(choreo, u = 0) {
  return StandeeRigMath.resolveActiveFrameKey(choreo, u);
}

// ============================================================
// RYU, KEN, CAMMY & ZANGIEF EXCEED CHOREOGRAPHY DISPATCHER
// ============================================================
// Translates Exceed card keys, Strike phases, and board moves into
// concrete 4-Knot spine, symplectic spring, airborne arc, afterimage,
// projectile, and aura specs tailored to Ryu, Ken, Cammy & Zangief's martial style.
function resolveStandeeChoreography(characterKey, cardKey, phase, ctx = {}) {
  const charKey = characterKey || 'ryu';
  const isKen = charKey === 'ken';
  const isRyu = charKey === 'ryu';
  const isCammy = charKey === 'cammy';
  const isZangief = charKey === 'zangief';
  const reduced = !!ctx.reducedHitStop;
  const sideSwapped = !!ctx.sideSwapped;
  const criticalPaid = !!ctx.criticalPaid;
  const isEX = !!ctx.isEX;
  const isExceeded = !!ctx.exceeded;
  const fromWildSwing = !!ctx.fromWildSwing;
  const rangeSpaces = Math.max(1, Number(ctx.rangeSpaces) || 1);
  const distanceToTargetPx = Math.max(0, Number(ctx.distanceToTargetPx) || 0);
  const cKey = String(cardKey || '').replace(/^gg_/, '');

  const primaryTrailColor = isCammy
    ? '#10b981'
    : (isZangief ? '#ef4444' : (isKen ? '#ff7b54' : '#4de6d1'));

  const base = {
    characterKey: charKey,
    cardKey: cKey,
    phase: phase || 'idle',
    poseKind: 'idle',
    frameKey: 'idle',
    frameSequence: null,
    exceeded: isExceeded,
    track: 1, // Track 0: Root Movement, Track 1: Upper/Full Body Action, Track 2: Additive Flinch/Aura
    clipMode: 'standard', // 'standard' | 'attack_3clip' | 'whiff_3clip'
    durationSec: 0.32,
    hopHeight: 0,
    airWindow: [0.22, 0.78],
    lungePx: 0,
    dynamicLunge: false,
    ikReachPx: 0,
    smearReachPx: 0,
    wholeSpinRad: 0,
    spinPlane: 'xy', // 'xy' (vertical pitch somersault) | 'horizontal_flare' (Y-axis grounded breakdance turn)
    spinWindow: [0.15, 0.85],
    flipDurationSec: 0.18,
    pelvis: { dx: 0, dy: 0, rotRad: 0, scaleX: 1 },
    waist: { dx: 0, dy: 0, rotRad: 0, scaleX: 1 },
    head: { dx: 0, dy: 0, rotRad: 0, scaleX: 1 },
    springPreset: null,
    afterimage: null,
    projectile: null,
    vfx: null,
    hitstopSec: 0,
    shake: 'none',
    flashWhiteMs: 0,
    flashColorHex: '#ffffff',
    desaturate: 0,
    shudderHz: 0,
    cameraPunch: 0,
    cameraTiltDeg: 0,
    wildSwingHazard: fromWildSwing,
    cammyCrossUpHeelFlash: false,
    ironWallChains: false,
  };

  // Helper: Zangief "Iron Wall" immovable cards (Block, Focus, Double Lariat, Siberian Blizzard)
  const isZangiefIronWallCard = isZangief && (
    cKey === 'block' ||
    cKey === 'focus' ||
    cKey === 'double_lariat' ||
    cKey === 'siberian_blizzard'
  );

  // Helper: Cammy Cross-Up Passive Trigger (+1 Power & Advantage when crossing past opponent)
  const isCammyCrossUpActive = isCammy && sideSwapped;

  // Board-level movement primitives (Track 0: Advance, Retreat, Close, Push, Pull)
  if (phase === 'move') {
    const kind = ctx.moveKind || 'advance';
    const dist = Math.max(1, ctx.spacesMoved || 1);
    if (kind === 'cross_retreat') {
      if (isCammy && !reduced) {
        return {
          ...base,
          track: 0,
          poseKind: 'cammy_hooligan_backflip',
          durationSec: 0.38,
          hopHeight: 40,
          airWindow: [0.12, 0.88],
          wholeSpinRad: -Math.PI * 2,
          spinWindow: [0.12, 0.84],
          pelvis: { dx: -8, dy: 2, rotRad: -0.12, scaleX: 0.92 },
          waist: { dx: -10, dy: 3, rotRad: -0.18, scaleX: 0.88 },
          head: { dx: -12, dy: 3, rotRad: -0.24, scaleX: 0.9 },
          springPreset: { scaleX: 0.86, scaleY: 0.88, stiffness: 400, damping: 20, landingScaleX: 1.18, landingScaleY: 0.84 },
          afterimage: { count: 4, spacingMs: 20, alpha: 0.40, color: '#10b981' },
          vfx: { type: 'dust', color: '#34d399', accent: '#ff2a4b' },
        };
      }
      if (isZangief) {
        return {
          ...base,
          track: 0,
          poseKind: 'zangief_iron_stepback',
          durationSec: 0.38,
          hopHeight: 8,
          airWindow: [0.22, 0.78],
          pelvis: { dx: -4, dy: 5, rotRad: 0.03, scaleX: 1.06 },
          waist: { dx: 6, dy: 4, rotRad: 0.06, scaleX: 1.08 },
          head: { dx: 8, dy: 2, rotRad: 0.04, scaleX: 1.02 },
          springPreset: { scaleX: 1.12, scaleY: 0.90, stiffness: 360, damping: 24, landingScaleX: 1.16, landingScaleY: 0.86 },
          afterimage: { count: 2, spacingMs: 36, alpha: 0.24, color: '#ef4444' },
          vfx: { type: 'ground_crater', color: '#f59e0b', accent: '#ef4444' },
        };
      }
      if (isKen && !reduced) {
        return {
          ...base,
          track: 0,
          poseKind: 'backflip',
          frameKey: 'cross_retreat',
          frameSequence: [
            { at: 0.0, frameKey: 'cross_windup' },
            { at: 0.10, frameKey: 'cross_retreat' },
            { at: 0.82, frameKey: 'sweep_flare' },
            { at: 0.93, frameKey: 'idle' },
          ],
          durationSec: 0.68,
          hopHeight: 48,
          airWindow: [0.10, 0.84],
          wholeSpinRad: -Math.PI * 2,
          spinPlane: 'xy',
          spinWindow: [0.10, 0.84],
          pelvis: { dx: -8, dy: 2, rotRad: -0.10, scaleX: 0.95 },
          waist: { dx: -10, dy: 4, rotRad: -0.16, scaleX: 0.92 },
          head: { dx: -10, dy: 4, rotRad: -0.20, scaleX: 0.94 },
          springPreset: { scaleX: 0.88, scaleY: 1.14, stiffness: 350, damping: 20, landingScaleX: 1.20, landingScaleY: 0.82 },
          afterimage: isExceeded
            ? { count: 6, spacingMs: 28, alpha: 0.46, color: '#ff5f38' }
            : { count: 4, spacingMs: 32, alpha: 0.28, color: '#cbd5e1' },
          vfx: isExceeded
            ? { type: 'ken_backflip_fire_wheel', color: '#ff5f38', accent: '#fde047', isExceeded: true }
            : { type: 'dust', color: '#fbbf24', isExceeded: false },
        };
      }
      return {
        ...base,
        track: 0,
        poseKind: 'backdash_hop',
        frameKey: isRyu ? 'cross_retreat' : 'idle',
        frameSequence: isRyu
          ? [
            { at: 0.0, frameKey: 'cross_windup' },
            { at: 0.09, frameKey: 'cross_retreat' },
            { at: 0.84, frameKey: 'idle' },
          ]
          : null,
        durationSec: 0.60,
        hopHeight: reduced ? 14 : 28,
        airWindow: [0.09, 0.84],
        pelvis: { dx: -8, dy: 2, rotRad: 0.05, scaleX: 1 },
        waist: { dx: 8, dy: 2, rotRad: 0.07, scaleX: 1 },
        head: { dx: 10, dy: 0, rotRad: 0.05, scaleX: 1 },
        springPreset: { scaleX: 0.92, scaleY: 1.10, stiffness: 390, damping: 24, landingScaleX: 1.14, landingScaleY: 0.88 },
        afterimage: isExceeded
          ? { count: 5, spacingMs: 28, alpha: 0.40, color: primaryTrailColor }
          : { count: 3, spacingMs: 36, alpha: 0.24, color: '#94a3b8' },
        vfx: (isRyu && isExceeded)
          ? { type: 'ryu_backdash_ki_wake', color: '#38bdf8', accent: '#ffffff', isExceeded: true }
          : { type: 'dust', color: '#94a3b8', isExceeded: false },
      };
    }
    if (kind === 'push' || kind === 'pull') {
      return {
        ...base,
        track: 0,
        poseKind: 'forced_skid',
        durationSec: 0.34,
        hopHeight: 0,
        pelvis: { dx: -6, dy: 4, rotRad: -0.06, scaleX: 1 },
        waist: { dx: 12, dy: 2, rotRad: 0.1, scaleX: 1 },
        head: { dx: 14, dy: 2, rotRad: 0.14, scaleX: 1 },
        springPreset: { scaleX: 1.12, scaleY: 0.9, stiffness: 360, damping: 22 },
        vfx: { type: 'skid_sparks', color: '#f7c65a' },
      };
    }
    if (kind === 'retreat') {
      return {
        ...base,
        track: 0,
        poseKind: 'retreat_step',
        durationSec: isCammy ? 0.28 : 0.32,
        hopHeight: isZangief ? 6 : Math.min(16, 6 + dist * 2.5),
        pelvis: { dx: -4, dy: 2, rotRad: 0.03, scaleX: 1 },
        waist: { dx: 6, dy: 1, rotRad: 0.05, scaleX: 1 },
        head: { dx: 8, dy: 0, rotRad: 0.03, scaleX: 1 },
        afterimage: {
          count: isCammy ? 3 : 2,
          spacingMs: isCammy ? 22 : 30,
          alpha: isCammy ? 0.34 : 0.24,
          color: primaryTrailColor,
        },
        vfx: { type: 'dust', color: isKen || isZangief ? '#fbbf24' : (isCammy ? '#34d399' : '#94a3b8') },
      };
    }
    // Voluntary Advance / Close with character-specific sprint kinematics
    return {
      ...base,
      track: 0,
      poseKind: isCammy ? 'cammy_blur_sprint' : (isZangief ? 'zangief_quake_march' : 'advance_dash'),
      durationSec: isCammy ? 0.27 : (isZangief ? 0.36 : 0.32),
      hopHeight: isZangief ? 8 : Math.min(18, 6 + dist * 3),
      pelvis: { dx: isCammy ? 8 : 4, dy: isZangief ? 5 : 3, rotRad: isCammy ? 0.08 : 0.04, scaleX: isZangief ? 1.05 : 1 },
      waist: { dx: isCammy ? 16 : 10, dy: 2, rotRad: isCammy ? 0.14 : 0.08, scaleX: isZangief ? 1.06 : 1 },
      head: { dx: isCammy ? 20 : 16, dy: 2, rotRad: isCammy ? 0.14 : 0.1, scaleX: 1 },
      springPreset: isZangief
        ? { scaleX: 1.08, scaleY: 0.92, stiffness: 360, damping: 22, landingScaleX: 1.16, landingScaleY: 0.86 }
        : { scaleX: 0.92, scaleY: 1.08, stiffness: 390, damping: 24 },
      afterimage: {
        count: isCammy ? 4 : (isZangief ? 2 : 3),
        spacingMs: isCammy ? 20 : 26,
        alpha: isCammy ? 0.38 : 0.28,
        color: primaryTrailColor,
      },
      cammyCrossUpHeelFlash: isCammyCrossUpActive,
      vfx: isZangief
        ? { type: 'ground_crater', color: '#f59e0b', accent: '#ef4444' }
        : { type: 'dust', color: isCammy ? '#34d399' : (isKen ? '#fbbf24' : '#94a3b8') },
    };
  }

  // Kinetic "Neutral" Turns: Prepare (Draw), Boost ("Install"), Change Cards, Reshuffle
  if (phase === 'prepare' || phase === 'change_cards' || phase === 'reshuffle') {
    const poseKind = isCammy
      ? 'cammy_gauntlet_check'
      : (isZangief ? 'zangief_chest_flex' : (isKen ? 'ken_knuckle_crack' : 'ryu_headband_focus'));
    return {
      ...base,
      track: 1,
      poseKind,
      durationSec: 0.38,
      hopHeight: isCammy ? 8 : (isKen ? 6 : 0),
      pelvis: {
        dx: isCammy ? 4 : (isKen ? 2 : 0),
        dy: isZangief ? 6 : (isKen ? -3 : 4),
        rotRad: isCammy ? 0.06 : (isKen ? 0.04 : -0.02),
        scaleX: isZangief ? 1.08 : 1.03,
      },
      waist: {
        dx: isCammy ? 8 : (isKen ? 6 : -3),
        dy: isZangief ? 4 : (isKen ? -4 : 3),
        rotRad: isCammy ? 0.10 : (isKen ? 0.08 : -0.05),
        scaleX: isZangief ? 1.12 : 1.05,
      },
      head: {
        dx: isCammy ? 10 : (isKen ? 8 : -2),
        dy: isKen ? -4 : 2,
        rotRad: isCammy ? 0.08 : (isKen ? 0.06 : -0.04),
        scaleX: 1.02,
      },
      springPreset: isZangief
        ? { scaleX: 1.14, scaleY: 0.88, stiffness: 360, damping: 20 }
        : (isKen || isCammy
          ? { scaleX: 0.92, scaleY: 1.09, stiffness: 380, damping: 20 }
          : { scaleX: 1.06, scaleY: 0.94, stiffness: 340, damping: 22 }),
      vfx: {
        type: 'prepare_pulse',
        color: primaryTrailColor,
        accent: isCammy ? '#ff2a4b' : (isZangief ? '#fde047' : '#ffffff'),
      },
    };
  }

  if (phase === 'boost') {
    const poseKind = isCammy
      ? 'cammy_delta_install'
      : (isZangief ? 'zangief_muscle_install' : (isKen ? 'ken_flame_install' : 'ryu_ki_install'));
    return {
      ...base,
      track: 1,
      poseKind,
      durationSec: 0.44,
      pelvis: { dx: 0, dy: 6, rotRad: -0.03, scaleX: isZangief ? 1.10 : 1.05 },
      waist: { dx: 4, dy: 3, rotRad: -0.08, scaleX: isZangief ? 1.14 : 1.08 },
      head: { dx: 2, dy: -2, rotRad: -0.1, scaleX: 1.03 },
      springPreset: isZangief
        ? { scaleX: 1.18, scaleY: 0.85, stiffness: 360, damping: 18 }
        : { scaleX: 0.88, scaleY: 1.15, stiffness: 380, damping: 18 },
      flashWhiteMs: reduced ? 0 : 45,
      flashColorHex: primaryTrailColor,
      vfx: {
        type: 'boost_install',
        color: primaryTrailColor,
        accent: isCammy ? '#ff2a4b' : '#fde047',
      },
    };
  }

  if (phase === 'exceed') {
    const battleCry = isCammy
      ? 'KILLER BEE ASSAULT!!'
      : (isZangief ? 'RED CYCLONE MUSCLE!!' : (isKen ? 'SHORYU FLAME!!' : 'DENJIN KIAI!!'));
    const subCry = isCammy
      ? 'EXCEED OVERDRIVE · CROSS-UP +2 POW & ADVANTAGE'
      : (isZangief
        ? 'EXCEED OVERDRIVE · CRITICAL RANGE 1 DOMINANCE'
        : (isKen ? 'EXCEED OVERDRIVE · +2 POW INITIATE' : 'EXCEED OVERDRIVE · CRITICAL POWER'));
    return {
      ...base,
      poseKind: 'exceed_awakening',
      durationSec: reduced ? 0.55 : 1.55,
      pelvis: { dx: 0, dy: 8, rotRad: 0, scaleX: isZangief ? 1.10 : 1.05 },
      waist: { dx: 3, dy: 4, rotRad: -0.09, scaleX: isZangief ? 1.14 : 1.08 },
      head: { dx: -4, dy: -3, rotRad: -0.15, scaleX: 1.03 },
      springPreset: isZangief
        ? { scaleX: 1.22, scaleY: 0.82, stiffness: 360, damping: 16 }
        : { scaleX: 0.85, scaleY: 1.20, stiffness: 380, damping: 18 },
      flashWhiteMs: reduced ? 0 : 90,
      flashColorHex: primaryTrailColor,
      vfx: {
        type: 'exceed_burst',
        color: primaryTrailColor,
        accent: isCammy ? '#ff2a4b' : (isZangief || isKen ? '#fde047' : '#ffffff'),
      },
      battleCry,
      subCry,
      cardFlip: true,
      gridShockwave: true,
      hitstopSec: reduced ? 0 : 0.16,
      cameraPunch: reduced ? 0 : 0.055,
    };
  }

  if (phase === 'reveal') {
    const isFaster = !!ctx.isFaster;
    // Zangief Critical bursts flash bright red super-armor; Zangief Block/Focus/Lariat/Blizzard locks Iron Wall chains around feet
    const critFlash = criticalPaid && !reduced;
    const isRyuOrKenSweep = (isRyu || isKen) && cKey === 'sweep';
    const isRyuOrKenCross = (isRyu || isKen) && cKey === 'cross';
    return {
      ...base,
      poseKind: fromWildSwing
        ? 'wild_swing_gamble'
        : (isZangiefIronWallCard ? 'zangief_iron_wall_lock' : (isZangief && criticalPaid ? 'zangief_red_armor_coil' : 'windup')),
      frameKey: isRyuOrKenSweep ? 'sweep_windup' : (isRyuOrKenCross ? 'cross_windup' : 'idle'),
      frameSequence: isRyuOrKenSweep
        ? [{ at: 0.0, frameKey: 'sweep_windup' }]
        : (isRyuOrKenCross
          ? [{ at: 0.0, frameKey: 'cross_windup' }]
          : null),
      durationSec: 0.44,
      ironWallChains: isZangiefIronWallCard,
      pelvis: { dx: isFaster ? -5 : -3, dy: isRyuOrKenSweep ? 11 : (isFaster ? 9 : 6), rotRad: fromWildSwing ? 0.08 : -0.05, scaleX: isZangief ? 1.07 : 1.03 },
      waist: { dx: isFaster ? -8 : -4, dy: isRyuOrKenSweep ? 9 : (isFaster ? 7 : 5), rotRad: fromWildSwing ? 0.14 : -0.09, scaleX: isZangief ? 1.09 : 1.04 },
      head: { dx: fromWildSwing ? 10 : 3, dy: isRyuOrKenSweep ? 7 : 4, rotRad: fromWildSwing ? 0.12 : 0.05, scaleX: 1 },
      springPreset: isFaster
        ? { scaleX: 1.12, scaleY: 0.89, stiffness: 380, damping: 20 }
        : { scaleX: 1.07, scaleY: 0.93, stiffness: 360, damping: 22 },
      flashWhiteMs: critFlash ? 60 : (isZangiefIronWallCard && !reduced ? 45 : 0),
      flashColorHex: isZangief ? '#ff2a2a' : (isCammy ? '#fde047' : primaryTrailColor),
      vfx: isZangiefIronWallCard
        ? { type: 'iron_wall_chains', color: '#ef4444', accent: '#94a3b8' }
        : {
          type: fromWildSwing ? 'wild_swing_hazard' : (isFaster ? 'speed_ring' : 'clash_spark'),
          color: fromWildSwing ? '#ff2a55' : (criticalPaid && isCammy ? '#fde047' : primaryTrailColor),
        },
      hitstopSec: reduced ? 0 : 0.07,
      cameraTiltDeg: (!reduced && fromWildSwing) ? (isFaster ? -1.4 : 1.4) : 0,
    };
  }

  if (phase === 'before') {
    // ============================================================
    // CAMMY BEFORE-MOVEMENT CHOREOGRAPHY (High-Speed Cross-Up Assassin)
    // ============================================================
    if (cKey === 'spiral_arrow') {
      // Launches horizontally like a torpedo wrapped in a green spiral vortex (flashes gold when Critical)
      return {
        ...base,
        track: 0,
        poseKind: 'spiral_arrow_torpedo',
        durationSec: 0.36,
        hopHeight: 22,
        airWindow: [0.05, 0.95],
        wholeSpinRad: reduced ? 0 : (Math.PI * 2 * 2),
        spinWindow: [0.06, 0.92],
        flipDurationSec: 0.16,
        cammyCrossUpHeelFlash: isCammyCrossUpActive,
        pelvis: { dx: 14, dy: -4, rotRad: 0.22, scaleX: 1.08 },
        waist: { dx: 22, dy: -4, rotRad: 0.30, scaleX: 1.12 },
        head: { dx: 26, dy: -2, rotRad: 0.25, scaleX: 0.96 },
        springPreset: { scaleX: 1.16, scaleY: 0.86, stiffness: 400, damping: 20 },
        flashWhiteMs: ((criticalPaid || isCammyCrossUpActive) && !reduced) ? 65 : 0,
        flashColorHex: criticalPaid ? '#fde047' : '#10b981',
        afterimage: {
          count: 4,
          spacingMs: 18,
          alpha: 0.42,
          color: criticalPaid ? '#fde047' : '#10b981',
        },
        vfx: {
          type: 'spiral_vortex',
          color: criticalPaid ? '#fde047' : '#10b981',
          accent: '#ff2a4b', // Iconic red boot streak
          isUltra: false,
        },
      };
    }

    if (cKey === 'cannonball') {
      // Tucks into a spinning mid-air somersault across 3 spaces
      return {
        ...base,
        track: 0,
        poseKind: 'cannonball_somersault',
        durationSec: 0.36,
        hopHeight: 42,
        airWindow: [0.06, 0.94],
        wholeSpinRad: reduced ? 0 : (Math.PI * 2 * 2),
        spinWindow: [0.08, 0.90],
        flipDurationSec: 0.16,
        cammyCrossUpHeelFlash: isCammyCrossUpActive,
        pelvis: { dx: 8, dy: -4, rotRad: 0.16, scaleX: 0.92 },
        waist: { dx: 12, dy: -2, rotRad: 0.22, scaleX: 0.88 },
        head: { dx: 14, dy: 0, rotRad: 0.26, scaleX: 0.88 },
        springPreset: { scaleX: 0.88, scaleY: 0.88, stiffness: 380, damping: 20 },
        flashWhiteMs: (isCammyCrossUpActive && !reduced) ? 65 : 0,
        flashColorHex: '#10b981',
        afterimage: { count: 4, spacingMs: 20, alpha: 0.38, color: criticalPaid ? '#fde047' : '#10b981' },
        vfx: {
          type: 'spiral_vortex',
          color: criticalPaid ? '#fde047' : '#10b981',
          accent: '#ff2a4b',
        },
      };
    }

    if (cKey === 'dive_kick') {
      // Leaps diagonally over opponent's head, grazing their shoulder with a downward red-boot kick
      return {
        ...base,
        track: 0,
        poseKind: 'dive_kick_leap',
        durationSec: 0.34,
        hopHeight: 50,
        airWindow: [0.06, 0.94],
        flipDurationSec: 0.16,
        cammyCrossUpHeelFlash: isCammyCrossUpActive,
        pelvis: { dx: 10, dy: -6, rotRad: 0.18, scaleX: 1 },
        waist: { dx: 16, dy: -4, rotRad: 0.24, scaleX: 0.96 },
        head: { dx: 20, dy: -2, rotRad: 0.18, scaleX: 0.96 },
        springPreset: { scaleX: 0.88, scaleY: 1.16, stiffness: 400, damping: 22 },
        flashWhiteMs: (isCammyCrossUpActive && !reduced) ? 65 : 0,
        flashColorHex: '#10b981',
        afterimage: { count: 4, spacingMs: 20, alpha: 0.38, color: '#10b981' },
        vfx: sideSwapped ? { type: 'evasion_shimmer', color: '#10b981', accent: '#ff2a4b' } : null,
      };
    }

    if (cKey === 'razors_edge_slicer') {
      // Low, ground-hugging slide kick across 4 tiles that ducks clean under high projectiles
      return {
        ...base,
        track: 0,
        poseKind: 'razors_edge_slide',
        durationSec: 0.36,
        hopHeight: 0,
        flipDurationSec: 0.16,
        cammyCrossUpHeelFlash: isCammyCrossUpActive,
        pelvis: { dx: 18, dy: 16, rotRad: -0.18, scaleX: 1.20 },
        waist: { dx: 6, dy: 14, rotRad: -0.26, scaleX: 1.12 },
        head: { dx: -4, dy: 14, rotRad: -0.20, scaleX: 1 },
        springPreset: { scaleX: 1.24, scaleY: 0.78, stiffness: 380, damping: 20 },
        flashWhiteMs: (isCammyCrossUpActive && !reduced) ? 65 : 0,
        flashColorHex: '#10b981',
        afterimage: { count: 4, spacingMs: 20, alpha: 0.38, color: '#10b981' },
        vfx: { type: 'sweep_arc', color: '#10b981', accent: '#ff2a4b' },
      };
    }

    if (cKey === 'gyro_drive_smasher') {
      // Ultra: Rockets from full-screen in a high-speed corkscrew drill
      return {
        ...base,
        track: 0,
        poseKind: 'gyro_drive_drill',
        durationSec: 0.42,
        hopHeight: 30,
        airWindow: [0.04, 0.96],
        wholeSpinRad: reduced ? 0 : (Math.PI * 2 * 3),
        spinWindow: [0.04, 0.94],
        flipDurationSec: 0.15,
        cammyCrossUpHeelFlash: isCammyCrossUpActive,
        pelvis: { dx: 16, dy: -4, rotRad: 0.24, scaleX: 1.12 },
        waist: { dx: 24, dy: -4, rotRad: 0.32, scaleX: 1.16 },
        head: { dx: 28, dy: -2, rotRad: 0.26, scaleX: 0.96 },
        springPreset: { scaleX: 1.20, scaleY: 0.82, stiffness: 420, damping: 18 },
        flashWhiteMs: (isCammyCrossUpActive && !reduced) ? 75 : 0,
        flashColorHex: '#10b981',
        afterimage: { count: 5, spacingMs: 16, alpha: 0.45, color: '#10b981' },
        vfx: { type: 'spiral_vortex', color: '#10b981', accent: '#ff2a4b', isUltra: true },
        cameraPunch: reduced ? 0 : 0.04,
      };
    }

    // ============================================================
    // ZANGIEF BEFORE-MOVEMENT CHOREOGRAPHY (Unstoppable Wall & Grappler)
    // ============================================================
    if (cKey === 'flying_power_bomb') {
      // Charges forward 2 spaces with outstretched hands; glows bright red when Critical (Stun Immunity)
      return {
        ...base,
        track: 0,
        poseKind: 'flying_power_bomb_charge',
        durationSec: 0.38,
        hopHeight: 12,
        airWindow: [0.15, 0.85],
        pelvis: { dx: 10, dy: 6, rotRad: 0.08, scaleX: 1.10 },
        waist: { dx: 18, dy: 4, rotRad: 0.16, scaleX: 1.14 },
        head: { dx: 22, dy: 4, rotRad: 0.14, scaleX: 1.04 },
        springPreset: { scaleX: 1.14, scaleY: 0.88, stiffness: 360, damping: 20 },
        flashWhiteMs: (criticalPaid && !reduced) ? 95 : 0,
        flashColorHex: '#ff2a2a',
        afterimage: { count: 3, spacingMs: 24, alpha: 0.36, color: criticalPaid ? '#ff2a2a' : '#ef4444' },
        vfx: {
          type: 'ground_crater',
          color: criticalPaid ? '#ff2a2a' : '#f59e0b',
          accent: '#fde047',
        },
        cameraPunch: reduced ? 0 : 0.025,
      };
    }

    if (cKey === 'siberian_blizzard') {
      // Ultra: Closes 1 space and leaps straight up to snatch airborne/nimble opponents out of the sky (Iron Wall: opponents cannot move past you)
      return {
        ...base,
        track: 0,
        poseKind: 'siberian_blizzard_intercept',
        durationSec: 0.36,
        hopHeight: 38,
        airWindow: [0.10, 0.92],
        ironWallChains: true,
        pelvis: { dx: 8, dy: -6, rotRad: -0.06, scaleX: 1.12 },
        waist: { dx: 14, dy: -8, rotRad: -0.10, scaleX: 1.16 },
        head: { dx: 12, dy: -8, rotRad: -0.12, scaleX: 1.04 },
        springPreset: { scaleX: 0.88, scaleY: 1.18, stiffness: 380, damping: 18 },
        afterimage: { count: 3, spacingMs: 22, alpha: 0.36, color: '#ef4444' },
        vfx: { type: 'iron_wall_chains', color: '#ef4444', accent: '#fde047', isUltra: true },
      };
    }

    // Shared Normals Before movements (Dive & Assault — tailored to Cammy, Zangief, Ryu, Ken)
    if (cKey === 'dive') {
      if (isCammy) {
        // Cammy Cannon Leap: Vaults high in a tight aerial arc over 3 tiles; sharp green flash on heels if crossing past opponent!
        return {
          ...base,
          track: 0,
          poseKind: 'cammy_cannon_leap',
          durationSec: 0.32,
          hopHeight: 54,
          airWindow: [0.06, 0.94],
          flipDurationSec: 0.16,
          cammyCrossUpHeelFlash: isCammyCrossUpActive,
          pelvis: { dx: 10, dy: -6, rotRad: 0.16, scaleX: 0.96 },
          waist: { dx: 16, dy: -4, rotRad: 0.22, scaleX: 0.94 },
          head: { dx: 20, dy: -2, rotRad: 0.16, scaleX: 0.96 },
          springPreset: { scaleX: 0.86, scaleY: 1.18, stiffness: 390, damping: 20 },
          flashWhiteMs: (isCammyCrossUpActive && !reduced) ? 75 : 0,
          flashColorHex: '#10b981',
          afterimage: { count: 4, spacingMs: 20, alpha: 0.40, color: '#10b981' },
          vfx: isCammyCrossUpActive
            ? { type: 'cammy_heel_crossup_flash', color: '#10b981', accent: '#ff2a4b' }
            : { type: 'evasion_shimmer', color: '#10b981', accent: '#ff2a4b' },
        };
      }
      if (isZangief) {
        // Zangief Flying Body Press: Launches his 400-pound frame horizontally like a cannonball across 3 tiles
        return {
          ...base,
          track: 0,
          poseKind: 'zangief_flying_body_press',
          durationSec: 0.38,
          hopHeight: 38,
          airWindow: [0.08, 0.92],
          flipDurationSec: 0.18,
          pelvis: { dx: 14, dy: 4, rotRad: 0.22, scaleX: 1.18 },
          waist: { dx: 22, dy: 6, rotRad: 0.28, scaleX: 1.24 },
          head: { dx: 26, dy: 8, rotRad: 0.24, scaleX: 1.08 },
          springPreset: { scaleX: 1.24, scaleY: 0.82, stiffness: 350, damping: 18 },
          afterimage: { count: 3, spacingMs: 24, alpha: 0.36, color: '#ef4444' },
          vfx: sideSwapped ? { type: 'evasion_shimmer', color: '#ef4444' } : null,
        };
      }
      return {
        ...base,
        track: 0,
        poseKind: 'dive_crossup',
        durationSec: 0.36,
        hopHeight: isKen ? 46 : 38,
        airWindow: [0.08, 0.92],
        flipDurationSec: 0.18,
        pelvis: { dx: 8, dy: -4, rotRad: 0.12, scaleX: 1 },
        waist: { dx: 14, dy: -4, rotRad: 0.2, scaleX: 0.96 },
        head: { dx: 18, dy: -2, rotRad: 0.14, scaleX: 0.96 },
        springPreset: { scaleX: 0.9, scaleY: 1.12, stiffness: 360, damping: 22 },
        afterimage: { count: 3, spacingMs: 22, alpha: 0.36, color: primaryTrailColor },
        vfx: sideSwapped ? { type: 'evasion_shimmer', color: primaryTrailColor } : null,
      };
    }

    if (cKey === 'tatsumaki_ryu' || cKey === 'tatsumaki_ken' || cKey === 'guren_senpukyaku') {
      const spinCount = cKey === 'guren_senpukyaku' ? 3 : 2;
      return {
        ...base,
        track: 0,
        poseKind: 'tatsumaki_advance',
        durationSec: 0.38,
        hopHeight: cKey === 'guren_senpukyaku' ? 34 : (isKen ? 30 : 24),
        airWindow: [0.06, 0.94],
        wholeSpinRad: reduced ? 0 : (Math.PI * 2 * spinCount),
        spinWindow: [0.08, 0.92],
        pelvis: { dx: 10, dy: -2, rotRad: 0.08, scaleX: 1.08 },
        waist: { dx: 14, dy: -2, rotRad: 0.12, scaleX: 1.12 },
        head: { dx: 12, dy: 0, rotRad: 0.08, scaleX: 1 },
        afterimage: { count: 4, spacingMs: 22, alpha: 0.36, color: isKen ? '#ff5f38' : '#38bdf8' },
        vfx: { type: 'cyclone', color: isKen ? '#ff5f38' : '#4de6d1' },
      };
    }

    if (cKey === 'assault') {
      if (isCammy) {
        // Cammy Knee Bullet Rush: Darts forward two tiles low to the ground; triggers green heel flash if crossing past opponent
        return {
          ...base,
          track: 0,
          poseKind: 'cammy_knee_bullet_rush',
          durationSec: 0.30,
          hopHeight: 12,
          airWindow: [0.10, 0.90],
          flipDurationSec: 0.16,
          cammyCrossUpHeelFlash: isCammyCrossUpActive,
          pelvis: { dx: 14, dy: 10, rotRad: 0.12, scaleX: 1.08 },
          waist: { dx: 20, dy: 8, rotRad: 0.18, scaleX: 1.10 },
          head: { dx: 24, dy: 6, rotRad: 0.16, scaleX: 1 },
          springPreset: { scaleX: 1.16, scaleY: 0.86, stiffness: 400, damping: 22 },
          flashWhiteMs: (isCammyCrossUpActive && !reduced) ? 75 : 0,
          flashColorHex: '#10b981',
          afterimage: { count: 4, spacingMs: 18, alpha: 0.38, color: '#10b981' },
          vfx: isCammyCrossUpActive
            ? { type: 'cammy_heel_crossup_flash', color: '#10b981', accent: '#ff2a4b' }
            : { type: 'dust', color: '#10b981', accent: '#ff2a4b' },
        };
      }
      if (isZangief) {
        // Zangief Shoulder Tackle: Lowers his massive shoulder and bulldozes forward two tiles
        return {
          ...base,
          track: 0,
          poseKind: 'zangief_shoulder_tackle_rush',
          durationSec: 0.36,
          hopHeight: 4,
          airWindow: [0.18, 0.82],
          pelvis: { dx: 12, dy: 8, rotRad: 0.10, scaleX: 1.16 },
          waist: { dx: 22, dy: 6, rotRad: 0.18, scaleX: 1.22 },
          head: { dx: 26, dy: 6, rotRad: 0.16, scaleX: 1.06 },
          springPreset: { scaleX: 1.22, scaleY: 0.84, stiffness: 360, damping: 20 },
          afterimage: { count: 3, spacingMs: 24, alpha: 0.34, color: '#ef4444' },
          vfx: { type: 'ground_crater', color: '#ef4444', accent: '#fde047' },
        };
      }
      return {
        ...base,
        track: 0,
        poseKind: isKen ? 'thunder_kick_approach' : 'collarbone_approach',
        durationSec: 0.34,
        hopHeight: isKen ? 26 : 18,
        airWindow: [0.08, 0.94],
        pelvis: { dx: 8, dy: -2, rotRad: 0.08, scaleX: 1 },
        waist: { dx: 16, dy: -3, rotRad: 0.16, scaleX: 1.04 },
        head: { dx: 20, dy: -2, rotRad: 0.18, scaleX: 1 },
        springPreset: { scaleX: 0.9, scaleY: 1.12, stiffness: 380, damping: 22 },
        afterimage: { count: 3, spacingMs: 24, alpha: 0.3, color: primaryTrailColor },
      };
    }

    if (cKey === 'axe_kick') {
      return {
        ...base,
        track: 0,
        poseKind: 'axe_kick_approach',
        durationSec: 0.3,
        hopHeight: 18,
        pelvis: { dx: 6, dy: 0, rotRad: 0.06, scaleX: 1 },
        waist: { dx: 12, dy: -2, rotRad: 0.1, scaleX: 1 },
        head: { dx: 14, dy: -2, rotRad: 0.1, scaleX: 1 },
        afterimage: { count: 2, spacingMs: 26, alpha: 0.28, color: '#ff9270' },
      };
    }
    // Generic before move
    return {
      ...base,
      track: 0,
      poseKind: 'advance_dash',
      durationSec: 0.3,
      hopHeight: 10,
      cammyCrossUpHeelFlash: isCammyCrossUpActive,
      pelvis: { dx: 4, dy: 2, rotRad: 0.04, scaleX: 1 },
      waist: { dx: 10, dy: 2, rotRad: 0.08, scaleX: 1 },
      head: { dx: 14, dy: 1, rotRad: 0.1, scaleX: 1 },
      afterimage: { count: 2, spacingMs: 28, alpha: 0.24, color: primaryTrailColor },
    };
  }

  if (phase === 'range' && ctx.hitLanded === false) {
    // Universal "Whiff Recovery" Blending: Startup -> early Active cancel -> off-balance stumble recovery
    const isProjectile = cKey.startsWith('hadoken') || cKey === 'metsu_hadoken';
    if (isProjectile) {
      return {
        ...base,
        clipMode: 'whiff_3clip',
        poseKind: 'hadoken_whiff',
        durationSec: 0.36,
        lungePx: 14,
        pelvis: { dx: 8, dy: 8, rotRad: 0.06, scaleX: 1.04 },
        waist: { dx: 16, dy: 6, rotRad: 0.14, scaleX: 1.06 },
        head: { dx: 18, dy: 4, rotRad: 0.1, scaleX: 1 },
        projectile: {
          style: cKey === 'metsu_hadoken' ? 'metsu_denjin' : (isKen ? 'fire_hadoken' : 'cyan_hadoken'),
          radius: cKey === 'metsu_hadoken' ? 28 : 18,
          whiff: true,
        },
      };
    }
    const isRyuOrKenSweepWhiff = (isRyu || isKen) && cKey === 'sweep';
    const isRyuOrKenCrossWhiff = (isRyu || isKen) && cKey === 'cross';
    const sweepWhiffSlide = isRyuOrKenSweepWhiff
      ? {
        enabled: true,
        style: isKen ? 'breakdance_flare_slide' : 'karate_heel_slide',
        peakU: isKen ? 0.20 : 0.21,
        holdEndU: isKen ? 0.56 : 0.46,
        returnEndU: 0.94,
        holdDrift: 0.06,
        clearanceRatio: isKen ? 0.56 : 0.58,
        whiffMaxSpaces: isKen ? 2.60 : 2.55,
      }
      : null;
    return {
      ...base,
      clipMode: 'whiff_3clip',
      poseKind: 'whiff_overextend',
      frameKey: isRyuOrKenSweepWhiff ? 'sweep_active' : (isRyuOrKenCrossWhiff ? 'cross_strike' : 'idle'),
      frameSequence: isRyuOrKenSweepWhiff
        ? (isKen
          ? [
            { at: 0.0, frameKey: 'sweep_windup' },
            { at: 0.10, frameKey: 'sweep_active' },
            { at: 0.50, frameKey: 'sweep_flare' },
            { at: 0.76, frameKey: 'sweep_windup' },
            { at: 0.90, frameKey: 'idle' },
          ]
          : [
            { at: 0.0, frameKey: 'sweep_windup' },
            { at: 0.11, frameKey: 'sweep_active' },
            { at: 0.58, frameKey: 'sweep_windup' },
            { at: 0.86, frameKey: 'idle' },
          ])
        : (isRyuOrKenCrossWhiff
          ? [
            { at: 0.0, frameKey: 'cross_windup' },
            { at: 0.15, frameKey: 'cross_strike' },
            { at: 0.62, frameKey: 'cross_windup' },
            { at: 0.86, frameKey: 'idle' },
          ]
          : null),
      durationSec: isRyuOrKenSweepWhiff ? (isKen ? 0.76 : 0.70) : (isRyuOrKenCrossWhiff ? 0.58 : 0.44),
      lungePx: isRyuOrKenSweepWhiff ? 44 : 38,
      dynamicLunge: true,
      slideReach: sweepWhiffSlide,
      wholeSpinRad: (isRyuOrKenSweepWhiff && isKen && !reduced) ? Math.PI * 2 : 0,
      spinPlane: (isRyuOrKenSweepWhiff && isKen) ? 'horizontal_flare' : 'xy',
      spinWindow: [0.50, 0.78],
      ikReachPx: StandeeRigMath.computeIkReachPx(distanceToTargetPx, rangeSpaces, 26),
      pelvis: { dx: 12, dy: isRyuOrKenSweepWhiff ? 14 : 5, rotRad: 0.08, scaleX: 1.04 },
      waist: { dx: 22, dy: isRyuOrKenSweepWhiff ? 11 : 5, rotRad: 0.14, scaleX: 1.06 },
      head: { dx: 26, dy: isRyuOrKenSweepWhiff ? 9 : 6, rotRad: 0.18, scaleX: 1 },
      springPreset: { scaleX: 1.12, scaleY: 0.88, stiffness: 320, damping: 18 },
      afterimage: isRyuOrKenSweepWhiff
        ? { count: isKen ? 4 : 3, spacingMs: 32, alpha: 0.22, color: '#cbd5e1' }
        : null,
      vfx: isRyuOrKenSweepWhiff
        ? { type: 'physical_sweep_dust', color: '#cbd5e1', accent: '#f8fafc', isExceeded: false, followSlide: true, style: isKen ? 'breakdance_flare_slide' : 'karate_heel_slide' }
        : { type: 'whiff_dust', color: '#94a3b8' },
    };
  }

  if (phase === 'hit_attack') {
    const isUltraCard = cKey.startsWith('metsu') ||
      cKey === 'shinryuken' ||
      cKey === 'guren_senpukyaku' ||
      cKey === 'gyro_drive_smasher' ||
      cKey === 'cqc' ||
      cKey === 'siberian_blizzard' ||
      cKey === 'ultimate_atomic_buster';
    const isHeavy = (ctx.damageDealt || 0) >= 5 || !!ctx.guardBroken || isEX || isUltraCard || isZangief;
    const hitstop = reduced ? 0 : (isUltraCard ? 0.24 : (isHeavy ? 0.20 : 0.12));
    const shake = reduced ? 'none' : (isUltraCard ? 'ultra' : (isHeavy ? 'heavy' : 'medium'));
    const ikReach = StandeeRigMath.computeIkReachPx(distanceToTargetPx, rangeSpaces, 36);
    const smearReach = Math.max(0, distanceToTargetPx);
    const attackBase = {
      ...base,
      clipMode: 'attack_3clip',
      dynamicLunge: true,
      ikReachPx: ikReach,
      smearReachPx: smearReach,
      cameraPunch: reduced ? 0 : (isUltraCard ? 0.048 : (isHeavy ? 0.032 : 0.015)),
      ironWallChains: isZangiefIronWallCard,
    };

    // ============================================================
    // CAMMY SPECIAL & ULTRA HIT CHOREOGRAPHY (Iconic Red Boots & Emerald Spirals)
    // ============================================================
    if (cKey === 'cannon_spike') {
      // Speed 7 instant green-streaked vertical red-boot kick before enemy finishes wind-up
      return {
        ...attackBase,
        poseKind: 'cannon_spike_kick',
        durationSec: 0.42,
        hopHeight: 68,
        airWindow: [0.05, 0.92],
        lungePx: 26,
        wholeSpinRad: reduced ? 0 : -Math.PI * 0.35,
        spinWindow: [0.10, 0.65],
        pelvis: { dx: 10, dy: -10, rotRad: -0.10, scaleX: 0.90 },
        waist: { dx: 14 + ikReach * 0.35, dy: -12, rotRad: -0.18, scaleX: 0.88 },
        head: { dx: 8, dy: -14, rotRad: -0.24, scaleX: 0.92 },
        springPreset: { scaleX: 0.82, scaleY: 1.24, stiffness: 420, damping: 20 },
        afterimage: { count: 4, spacingMs: 18, alpha: 0.40, color: '#10b981' },
        vfx: {
          type: 'dragon_uppercut',
          color: '#10b981',
          accent: '#ff2a4b', // Iconic bright crimson-red boot trail
          isUltra: false,
          reachPx: smearReach,
        },
        hitstopSec: hitstop,
        shake,
      };
    }

    if (cKey === 'dive_kick') {
      // Downward diagonal kick grazing shoulder & landing behind so Range 1 counter whiffs
      return {
        ...attackBase,
        poseKind: 'cammy_dive_kick_strike',
        durationSec: 0.36,
        hopHeight: 34,
        airWindow: [0.04, 0.86],
        lungePx: 30,
        pelvis: { dx: 12 + ikReach * 0.45, dy: 4, rotRad: 0.16, scaleX: 1.06 },
        waist: { dx: 18 + ikReach * 0.40, dy: 4, rotRad: 0.22, scaleX: 1.08 },
        head: { dx: 16, dy: 4, rotRad: 0.14, scaleX: 1 },
        springPreset: { scaleX: 1.16, scaleY: 0.86, stiffness: 380, damping: 20 },
        afterimage: { count: 3, spacingMs: 20, alpha: 0.36, color: '#10b981' },
        vfx: {
          type: 'strike_slash',
          color: '#10b981',
          accent: '#ff2a4b',
          reachPx: smearReach,
        },
        hitstopSec: hitstop,
        shake,
      };
    }

    if (cKey === 'spiral_arrow') {
      // Horizontal torpedo drill wrapped in emerald spiral vortex (gold when Critical)
      return {
        ...attackBase,
        poseKind: 'spiral_arrow_drill',
        durationSec: 0.42,
        hopHeight: 18,
        airWindow: [0.05, 0.90],
        lungePx: 36,
        wholeSpinRad: reduced ? 0 : (Math.PI * 2 * 2),
        spinWindow: [0.05, 0.88],
        pelvis: { dx: 16 + ikReach * 0.55, dy: 4, rotRad: 0.22, scaleX: 1.16 },
        waist: { dx: 22 + ikReach * 0.50, dy: 4, rotRad: 0.28, scaleX: 1.18 },
        head: { dx: 24, dy: 4, rotRad: 0.20, scaleX: 1 },
        springPreset: { scaleX: 1.22, scaleY: 0.82, stiffness: 400, damping: 18 },
        flashWhiteMs: (criticalPaid && !reduced) ? 70 : 0,
        flashColorHex: '#fde047',
        afterimage: {
          count: 4,
          spacingMs: 18,
          alpha: 0.42,
          color: criticalPaid ? '#fde047' : '#10b981',
        },
        vfx: {
          type: 'spiral_vortex',
          color: criticalPaid ? '#fde047' : '#10b981',
          accent: '#ff2a4b',
          reachPx: smearReach,
        },
        hitstopSec: hitstop,
        shake,
      };
    }

    if (cKey === 'cannonball') {
      // Spinning mid-air somersault crashing heel onto opponent's block & hooking them back
      return {
        ...attackBase,
        poseKind: 'cannonball_heel_drop',
        durationSec: 0.42,
        hopHeight: 38,
        airWindow: [0.04, 0.88],
        lungePx: 32,
        wholeSpinRad: reduced ? 0 : (Math.PI * 2),
        spinWindow: [0.06, 0.78],
        pelvis: { dx: 12 + ikReach * 0.4, dy: 8, rotRad: 0.14, scaleX: 1.10 },
        waist: { dx: 18 + ikReach * 0.45, dy: 8, rotRad: 0.22, scaleX: 1.14 },
        head: { dx: 20, dy: 8, rotRad: 0.18, scaleX: 1 },
        springPreset: { scaleX: 1.20, scaleY: 0.82, stiffness: 390, damping: 18 },
        afterimage: { count: 4, spacingMs: 20, alpha: 0.38, color: criticalPaid ? '#fde047' : '#10b981' },
        vfx: {
          type: criticalPaid ? 'armor_pierce' : 'overhead_crash',
          color: criticalPaid ? '#fde047' : '#10b981',
          accent: '#ff2a4b',
          reachPx: smearReach,
        },
        hitstopSec: hitstop,
        shake,
      };
    }

    if (cKey === 'razors_edge_slicer') {
      // Low ground-hugging slide kick that pins ankles and explodes into a knee-crush
      return {
        ...attackBase,
        poseKind: 'razors_edge_ankle_pin',
        durationSec: 0.40,
        lungePx: 44,
        pelvis: { dx: 16 + ikReach * 0.65, dy: 16, rotRad: -0.16, scaleX: 1.22 },
        waist: { dx: 8 + ikReach * 0.35, dy: 14, rotRad: -0.24, scaleX: 1.14 },
        head: { dx: -6, dy: 14, rotRad: -0.18, scaleX: 1 },
        springPreset: { scaleX: 1.24, scaleY: 0.78, stiffness: 360, damping: 18 },
        afterimage: { count: 3, spacingMs: 22, alpha: 0.36, color: '#10b981' },
        vfx: {
          type: 'sweep_arc',
          color: '#10b981',
          accent: '#ff2a4b',
          reachPx: smearReach,
        },
        hitstopSec: hitstop,
        shake,
      };
    }

    if (cKey === 'gyro_drive_smasher') {
      // Ultra: Corkscrew drill catching opponent mid-air and slamming them down
      return {
        ...attackBase,
        poseKind: 'gyro_drive_smasher_finisher',
        durationSec: 0.56,
        hopHeight: 64,
        airWindow: [0.05, 0.94],
        lungePx: 42,
        wholeSpinRad: reduced ? 0 : (Math.PI * 2 * 3),
        spinWindow: [0.05, 0.90],
        pelvis: { dx: 16 + ikReach * 0.5, dy: -8, rotRad: 0.20, scaleX: 1.16 },
        waist: { dx: 24 + ikReach * 0.55, dy: -8, rotRad: 0.28, scaleX: 1.20 },
        head: { dx: 26, dy: -6, rotRad: 0.22, scaleX: 1 },
        springPreset: { scaleX: 0.80, scaleY: 1.28, stiffness: 420, damping: 16 },
        afterimage: { count: 5, spacingMs: 16, alpha: 0.46, color: '#10b981' },
        vfx: {
          type: 'spiral_vortex',
          color: '#10b981',
          accent: '#ff2a4b',
          isUltra: true,
          reachPx: smearReach,
        },
        hitstopSec: reduced ? 0 : 0.25,
        shake: reduced ? 'none' : 'ultra',
        cameraPunch: reduced ? 0 : 0.055,
      };
    }

    if (cKey === 'cqc') {
      // Ultra: Close-quarters counter stance -> neck-scissors takedown throw
      return {
        ...attackBase,
        poseKind: 'cqc_neck_scissors_throw',
        durationSec: 0.52,
        hopHeight: 36,
        airWindow: [0.10, 0.88],
        lungePx: 28,
        wholeSpinRad: reduced ? 0 : -Math.PI * 2,
        spinWindow: [0.15, 0.82],
        pelvis: { dx: 12, dy: 6, rotRad: 0.14, scaleX: 1.10 },
        waist: { dx: 20 + ikReach * 0.45, dy: 4, rotRad: 0.22, scaleX: 1.14 },
        head: { dx: 18, dy: 4, rotRad: 0.16, scaleX: 1 },
        springPreset: { scaleX: 1.20, scaleY: 0.82, stiffness: 400, damping: 18 },
        afterimage: { count: 4, spacingMs: 20, alpha: 0.40, color: '#10b981' },
        vfx: {
          type: 'armor_pierce',
          color: '#10b981',
          accent: '#ff2a4b',
          isUltra: true,
          reachPx: smearReach,
        },
        hitstopSec: reduced ? 0 : 0.22,
        shake: reduced ? 'none' : 'ultra',
        cameraPunch: reduced ? 0 : 0.048,
      };
    }

    // ============================================================
    // ZANGIEF SPECIAL & ULTRA HIT CHOREOGRAPHY (Unstoppable Wall & Grappler)
    // ============================================================
    if (cKey === 'atomic_suplex') {
      // Speed 6 lunging waist-lock into massive overhead belly-to-belly suplex (bounces opponent 3 tiles)
      return {
        ...attackBase,
        poseKind: 'atomic_suplex_slam',
        durationSec: 0.48,
        hopHeight: 46,
        airWindow: [0.10, 0.86],
        lungePx: 34,
        wholeSpinRad: reduced ? 0 : -Math.PI * 2,
        spinWindow: [0.18, 0.84],
        pelvis: { dx: 14, dy: 10, rotRad: -0.14, scaleX: 1.16 },
        waist: { dx: 22 + ikReach * 0.45, dy: 8, rotRad: -0.24, scaleX: 1.20 },
        head: { dx: 18, dy: 8, rotRad: -0.28, scaleX: 1.06 },
        springPreset: { scaleX: 1.24, scaleY: 0.78, stiffness: 360, damping: 16 },
        afterimage: { count: 3, spacingMs: 24, alpha: 0.36, color: '#ef4444' },
        vfx: {
          type: 'ground_crater',
          color: '#ef4444',
          accent: '#fde047',
          isUltra: false,
          reachPx: smearReach,
        },
        hitstopSec: reduced ? 0 : 0.22,
        shake: reduced ? 'none' : 'heavy',
        cameraPunch: reduced ? 0 : 0.042,
      };
    }

    if (cKey === 'banishing_flat') {
      // Massive emerald-flame-imbued backhand ("Green Hand") that slaps away projectiles
      return {
        ...attackBase,
        poseKind: 'banishing_flat_green_hand',
        durationSec: 0.42,
        lungePx: 36,
        pelvis: { dx: 12 + ikReach * 0.45, dy: 8, rotRad: 0.08, scaleX: 1.14 },
        waist: { dx: 26 + ikReach * 0.60, dy: 6, rotRad: 0.20, scaleX: 1.22 },
        head: { dx: 22, dy: 4, rotRad: 0.12, scaleX: 1.05 },
        springPreset: { scaleX: 1.22, scaleY: 0.82, stiffness: 380, damping: 18 },
        flashWhiteMs: (criticalPaid && !reduced) ? 75 : 0,
        flashColorHex: '#22c55e',
        vfx: {
          type: 'green_hand_burst',
          color: '#22c55e',
          accent: '#fde047',
          reachPx: smearReach,
        },
        hitstopSec: hitstop,
        shake,
      };
    }

    if (cKey === 'double_lariat') {
      // Plants boots with Iron Wall chains and spins like a hurricane with arms outstretched (Armor 1, Guard 6, movementImmune)
      return {
        ...attackBase,
        poseKind: 'double_lariat_cyclone',
        durationSec: 0.46,
        hopHeight: 8,
        airWindow: [0.15, 0.85],
        lungePx: 20,
        wholeSpinRad: reduced ? 0 : (Math.PI * 2 * 3),
        spinWindow: [0.04, 0.94],
        ironWallChains: true,
        pelvis: { dx: 8 + ikReach * 0.35, dy: 4, rotRad: 0.06, scaleX: 1.18 },
        waist: { dx: 16 + ikReach * 0.45, dy: 2, rotRad: 0.12, scaleX: 1.26 },
        head: { dx: 10, dy: 2, rotRad: 0.08, scaleX: 1.08 },
        springPreset: { scaleX: 1.24, scaleY: 0.84, stiffness: 380, damping: 20 },
        afterimage: { count: 4, spacingMs: 20, alpha: 0.38, color: '#ef4444' },
        vfx: {
          type: 'cyclone',
          color: '#ef4444',
          accent: '#fde047',
          isUltra: false,
          reachPx: smearReach,
        },
        hitstopSec: hitstop,
        shake,
      };
    }

    if (cKey === 'flying_power_bomb') {
      // Red-glowing Critical Stun-Immunity throat-grab into sky leap and floor crater slam
      return {
        ...attackBase,
        poseKind: 'flying_power_bomb_crater',
        durationSec: 0.50,
        hopHeight: 54,
        airWindow: [0.08, 0.88],
        lungePx: 34,
        pelvis: { dx: 14, dy: 12, rotRad: 0.12, scaleX: 1.16 },
        waist: { dx: 24 + ikReach * 0.45, dy: 10, rotRad: 0.22, scaleX: 1.22 },
        head: { dx: 22, dy: 10, rotRad: 0.18, scaleX: 1.06 },
        springPreset: { scaleX: 1.26, scaleY: 0.76, stiffness: 360, damping: 16 },
        flashWhiteMs: (criticalPaid && !reduced) ? 95 : 0,
        flashColorHex: '#ff2a2a',
        afterimage: { count: 3, spacingMs: 22, alpha: 0.38, color: '#ef4444' },
        vfx: {
          type: 'ground_crater',
          color: '#ef4444',
          accent: '#fde047',
          isUltra: true,
          reachPx: smearReach,
        },
        hitstopSec: reduced ? 0 : 0.22,
        shake: reduced ? 'none' : 'heavy',
        cameraPunch: reduced ? 0 : 0.045,
      };
    }

    if (cKey === 'spinning_piledriver') {
      // Iconic command grab: leaps into the stratosphere spinning like a drill, crashes headfirst & shatters a card
      return {
        ...attackBase,
        poseKind: 'spinning_piledriver_impact',
        durationSec: 0.56,
        hopHeight: 84,
        airWindow: [0.05, 0.92],
        lungePx: 30,
        wholeSpinRad: reduced ? 0 : (Math.PI * 2 * 3),
        spinWindow: [0.06, 0.88],
        pelvis: { dx: 12, dy: 12, rotRad: 0.14, scaleX: 1.16 },
        waist: { dx: 20 + ikReach * 0.45, dy: 10, rotRad: 0.22, scaleX: 1.22 },
        head: { dx: 18, dy: 12, rotRad: 0.20, scaleX: 1.06 },
        springPreset: { scaleX: 1.28, scaleY: 0.74, stiffness: 360, damping: 15 },
        afterimage: { count: 5, spacingMs: 18, alpha: 0.42, color: '#ef4444' },
        vfx: {
          type: 'spd_card_shatter',
          color: '#ef4444',
          accent: '#fde047',
          isUltra: true,
          reachPx: smearReach,
        },
        hitstopSec: reduced ? 0 : 0.24,
        shake: reduced ? 'none' : 'ultra',
        cameraPunch: reduced ? 0 : 0.052,
      };
    }

    if (cKey === 'siberian_blizzard') {
      // Ultra: Anti-air inverted bearhug vertical piledriver slam + gauge-refill muscle flex
      return {
        ...attackBase,
        poseKind: 'siberian_blizzard_slam',
        durationSec: 0.56,
        hopHeight: 78,
        airWindow: [0.05, 0.90],
        lungePx: 28,
        wholeSpinRad: reduced ? 0 : (Math.PI * 2 * 2),
        spinWindow: [0.08, 0.86],
        ironWallChains: true,
        pelvis: { dx: 12, dy: 12, rotRad: -0.10, scaleX: 1.18 },
        waist: { dx: 20 + ikReach * 0.4, dy: 10, rotRad: -0.18, scaleX: 1.24 },
        head: { dx: 16, dy: 10, rotRad: -0.16, scaleX: 1.08 },
        springPreset: { scaleX: 1.28, scaleY: 0.74, stiffness: 360, damping: 15 },
        afterimage: { count: 4, spacingMs: 18, alpha: 0.42, color: '#ef4444' },
        vfx: {
          type: 'ground_crater',
          color: '#ef4444',
          accent: '#38bdf8',
          isUltra: true,
          reachPx: smearReach,
        },
        hitstopSec: reduced ? 0 : 0.25,
        shake: reduced ? 'none' : 'ultra',
        cameraPunch: reduced ? 0 : 0.055,
      };
    }

    if (cKey === 'ultimate_atomic_buster') {
      // Ultra (Power 11): Multi-stage German suplex -> belly-to-belly -> sky-high Spinning Piledriver shattering both hands
      return {
        ...attackBase,
        poseKind: 'ultimate_atomic_buster_cataclysm',
        durationSec: 0.64,
        hopHeight: 96,
        airWindow: [0.04, 0.94],
        lungePx: 36,
        wholeSpinRad: reduced ? 0 : (Math.PI * 2 * 4),
        spinWindow: [0.05, 0.92],
        pelvis: { dx: 16, dy: 14, rotRad: 0.16, scaleX: 1.22 },
        waist: { dx: 26 + ikReach * 0.5, dy: 12, rotRad: 0.26, scaleX: 1.28 },
        head: { dx: 24, dy: 14, rotRad: 0.24, scaleX: 1.10 },
        springPreset: { scaleX: 1.32, scaleY: 0.70, stiffness: 340, damping: 14 },
        flashWhiteMs: reduced ? 0 : 95,
        flashColorHex: '#fde047',
        afterimage: { count: 6, spacingMs: 16, alpha: 0.48, color: '#ef4444' },
        vfx: {
          type: 'spd_card_shatter',
          color: '#ef4444',
          accent: '#fde047',
          isUltra: true,
          reachPx: smearReach,
        },
        hitstopSec: reduced ? 0 : 0.26,
        shake: reduced ? 'none' : 'ultra',
        cameraPunch: reduced ? 0 : 0.065,
      };
    }

    // Signature Ryu & Ken Attack Choreography
    if (cKey === 'hadoken_ryu' || cKey === 'hadoken_ken' || cKey === 'metsu_hadoken') {
      const isMetsu = cKey === 'metsu_hadoken';
      return {
        ...attackBase,
        dynamicLunge: false,
        ikReachPx: 8,
        poseKind: isMetsu ? 'metsu_hadoken_blast' : 'hadoken_cast',
        durationSec: isMetsu ? 0.52 : 0.4,
        lungePx: isMetsu ? 18 : 12,
        pelvis: { dx: 8, dy: 10, rotRad: 0.06, scaleX: 1.06 },
        waist: { dx: 20, dy: 6, rotRad: 0.16, scaleX: 1.08 },
        head: { dx: 22, dy: 4, rotRad: 0.1, scaleX: 1 },
        springPreset: { scaleX: 1.14, scaleY: 0.88, stiffness: 380, damping: 20 },
        projectile: {
          style: isMetsu ? 'metsu_denjin' : (isKen ? 'fire_hadoken' : 'cyan_hadoken'),
          radius: isMetsu ? 32 : 20,
          trailColor: isMetsu ? '#818cf8' : (isKen ? '#fb923c' : '#38bdf8'),
          coreColor: '#ffffff',
          whiff: false,
        },
        hitstopSec: hitstop,
        shake,
      };
    }

    if (cKey === 'shoryuken_ryu' || cKey === 'shoryuken_ken' || cKey === 'metsu_shoryuken' || cKey === 'shinryuken') {
      const isUltra = cKey === 'metsu_shoryuken' || cKey === 'shinryuken';
      const isFlaming = isKen || cKey === 'shinryuken';
      return {
        ...attackBase,
        poseKind: 'shoryuken_rise',
        durationSec: isUltra ? 0.52 : 0.42,
        hopHeight: isUltra ? 76 : (isKen ? 60 : 52),
        airWindow: [0.06, 0.92],
        lungePx: 26,
        wholeSpinRad: (!reduced && (cKey === 'shinryuken' || cKey === 'shoryuken_ken')) ? Math.PI * 2 * (cKey === 'shinryuken' ? 2 : 1) : 0,
        spinWindow: [0.1, 0.85],
        pelvis: { dx: 8, dy: -8, rotRad: -0.06, scaleX: 0.92 },
        waist: { dx: 12 + ikReach * 0.35, dy: -10, rotRad: -0.14, scaleX: 0.9 },
        head: { dx: 10 + ikReach * 0.25, dy: -12, rotRad: -0.2, scaleX: 0.92 },
        springPreset: { scaleX: 0.84, scaleY: 1.22, stiffness: 380, damping: 20 },
        afterimage: { count: isUltra ? 4 : 3, spacingMs: 22, alpha: 0.36, color: isFlaming ? '#ff5f38' : '#38bdf8' },
        vfx: {
          type: 'dragon_uppercut',
          color: isFlaming ? '#ff6b2b' : '#38bdf8',
          accent: isFlaming ? '#fde047' : '#ffffff',
          isUltra,
          reachPx: smearReach,
        },
        hitstopSec: hitstop,
        shake,
      };
    }

    if (cKey === 'tatsumaki_ryu' || cKey === 'tatsumaki_ken' || cKey === 'guren_senpukyaku') {
      const isGuren = cKey === 'guren_senpukyaku';
      return {
        ...attackBase,
        poseKind: 'tatsumaki_strike',
        durationSec: isGuren ? 0.5 : 0.4,
        hopHeight: isGuren ? 36 : (isKen ? 30 : 24),
        airWindow: [0.05, 0.92],
        lungePx: 22,
        wholeSpinRad: reduced ? 0 : (Math.PI * 2 * (isGuren ? 3 : 2)),
        spinWindow: [0.05, 0.88],
        pelvis: { dx: 10 + ikReach * 0.4, dy: -2, rotRad: 0.1, scaleX: 1.1 },
        waist: { dx: 16 + ikReach * 0.5, dy: -2, rotRad: 0.14, scaleX: 1.14 },
        head: { dx: 12, dy: 0, rotRad: 0.08, scaleX: 1 },
        springPreset: { scaleX: 1.12, scaleY: 0.92, stiffness: 380, damping: 22 },
        afterimage: { count: 4, spacingMs: 20, alpha: 0.38, color: isKen ? '#ff4d2e' : '#38bdf8' },
        vfx: { type: 'cyclone', color: isKen ? '#ff5f38' : '#4de6d1', isUltra: isGuren, reachPx: smearReach },
        hitstopSec: hitstop,
        shake,
      };
    }

    // ============================================================
    // UNIVERSAL NORMALS: CAMMY vs. ZANGIEF vs. KEN vs. RYU
    // ============================================================
    if (cKey === 'sweep') {
      if (isCammy) {
        // Cammy Crouching Roundhouse: Drops completely flat to the floor, bracing defensively before whipping her red-booted leg in a wide arc
        return {
          ...attackBase,
          poseKind: 'cammy_crouching_roundhouse',
          durationSec: 0.38,
          lungePx: 38,
          pelvis: { dx: 14 + ikReach * 0.65, dy: 18, rotRad: -0.16, scaleX: 1.22 },
          waist: { dx: 6 + ikReach * 0.3, dy: 15, rotRad: -0.22, scaleX: 1.14 },
          head: { dx: -4, dy: 14, rotRad: -0.18, scaleX: 1 },
          springPreset: { scaleX: 1.22, scaleY: 0.78, stiffness: 360, damping: 18 },
          vfx: { type: 'sweep_arc', color: '#10b981', accent: '#ff2a4b', reachPx: smearReach },
          hitstopSec: hitstop,
          shake,
        };
      }
      if (isZangief) {
        // Zangief Crouching Spinning Kick: Drops to one knee with arms tucked tight, then sweeps a tree-trunk leg across the floor
        return {
          ...attackBase,
          poseKind: 'zangief_crouching_spinning_kick',
          durationSec: 0.42,
          lungePx: 34,
          pelvis: { dx: 12 + ikReach * 0.65, dy: 16, rotRad: -0.12, scaleX: 1.22 },
          waist: { dx: 8 + ikReach * 0.35, dy: 14, rotRad: -0.18, scaleX: 1.16 },
          head: { dx: 2, dy: 12, rotRad: -0.12, scaleX: 1.04 },
          springPreset: { scaleX: 1.24, scaleY: 0.78, stiffness: 340, damping: 18 },
          vfx: { type: 'sweep_arc', color: '#ef4444', accent: '#fde047', reachPx: smearReach },
          hitstopSec: hitstop,
          shake,
        };
      }
      if (isKen) {
        const rangeExtraSec = Math.min(2, Math.max(0, rangeSpaces - 1)) * 0.08;
        return {
          ...attackBase,
          poseKind: 'ken_flare_sweep',
          frameKey: 'sweep_active',
          frameSequence: [
            { at: 0.0, frameKey: 'sweep_windup' },
            { at: 0.09, frameKey: 'sweep_active' },
            { at: 0.48, frameKey: 'sweep_flare' },
            { at: 0.78, frameKey: 'sweep_windup' },
            { at: 0.92, frameKey: 'idle' },
          ],
          hitstopTriggerU: 0.17,
          durationSec: +(0.78 + rangeExtraSec).toFixed(2),
          lungePx: 46,
          slideReach: {
            enabled: true,
            style: 'breakdance_flare_slide',
            peakU: 0.17,
            holdEndU: 0.68,
            returnEndU: 0.96,
            holdDrift: 0.06,
            clearanceRatio: 0.56,
            whiffMaxSpaces: 2.60,
          },
          wholeSpinRad: reduced ? 0 : Math.PI * 2,
          spinPlane: 'horizontal_flare',
          spinWindow: [0.48, 0.78],
          pelvis: { dx: 14 + ikReach * 0.65, dy: 14, rotRad: -0.14, scaleX: 1.18 },
          waist: { dx: 6 + ikReach * 0.3, dy: 12, rotRad: -0.22, scaleX: 1.12 },
          head: { dx: -8, dy: 12, rotRad: -0.18, scaleX: 1 },
          springPreset: { scaleX: 1.22, scaleY: 0.78, stiffness: 340, damping: 18 },
          afterimage: isExceeded
            ? { count: rangeSpaces >= 2 ? 7 : 5, spacingMs: 24, alpha: 0.44, color: '#ff5f38' }
            : { count: rangeSpaces >= 2 ? 5 : 3, spacingMs: 28, alpha: 0.24, color: '#cbd5e1' },
          vfx: isExceeded
            ? {
              type: 'ken_flare_fire_sweep',
              fallbackType: 'sweep_arc',
              color: '#ff5f38',
              accent: '#fde047',
              reachPx: smearReach,
              isExceeded: true,
              followSlide: true,
              style: 'breakdance_flare_slide',
            }
            : {
              type: 'physical_sweep_dust',
              fallbackType: 'sweep_arc',
              color: '#d6c7b2',
              accent: '#f8fafc',
              reachPx: smearReach,
              isExceeded: false,
              followSlide: true,
              style: 'breakdance_flare_slide',
            },
          hitstopSec: hitstop,
          shake,
        };
      }
      const ryuRangeExtraSec = Math.min(2, Math.max(0, rangeSpaces - 1)) * 0.08;
      return {
        ...attackBase,
        poseKind: 'ryu_cr_hk_sweep',
        frameKey: 'sweep_active',
        frameSequence: [
          { at: 0.0, frameKey: 'sweep_windup' },
          { at: 0.10, frameKey: 'sweep_active' },
          { at: 0.62, frameKey: 'sweep_windup' },
          { at: 0.88, frameKey: 'idle' },
        ],
        hitstopTriggerU: 0.18,
        durationSec: +(0.68 + ryuRangeExtraSec).toFixed(2),
        lungePx: 34,
        slideReach: {
          enabled: true,
          style: 'karate_heel_slide',
          peakU: 0.18,
          holdEndU: 0.50,
          returnEndU: 0.94,
          holdDrift: 0.03,
          clearanceRatio: 0.58,
          whiffMaxSpaces: 2.55,
        },
        pelvis: { dx: 12 + ikReach * 0.65, dy: 14, rotRad: -0.05, scaleX: 1.18 },
        waist: { dx: 8 + ikReach * 0.3, dy: 10, rotRad: -0.07, scaleX: 1.08 },
        head: { dx: 4, dy: 8, rotRad: 0.02, scaleX: 1 },
        springPreset: { scaleX: 1.18, scaleY: 0.83, stiffness: 340, damping: 19 },
        afterimage: isExceeded
          ? { count: rangeSpaces >= 2 ? 6 : 4, spacingMs: 26, alpha: 0.38, color: '#38bdf8' }
          : { count: rangeSpaces >= 2 ? 4 : 2, spacingMs: 32, alpha: 0.20, color: '#cbd5e1' },
        vfx: isExceeded
          ? {
            type: 'ryu_ashi_barai_ki_sweep',
            fallbackType: 'sweep_arc',
            color: '#38bdf8',
            accent: '#ffffff',
            reachPx: smearReach,
            isExceeded: true,
            followSlide: true,
            style: 'karate_heel_slide',
          }
          : {
            type: 'physical_sweep_dust',
            fallbackType: 'sweep_arc',
            color: '#cbd5e1',
            accent: '#ffffff',
            reachPx: smearReach,
            isExceeded: false,
            followSlide: true,
            style: 'karate_heel_slide',
          },
        hitstopSec: hitstop,
        shake,
      };
    }

    if (cKey === 'cross') {
      if (isCammy) {
        // Cammy Spin Knuckle Backfist (& Backflip on After: Retreat 3)
        return {
          ...attackBase,
          poseKind: 'cammy_spin_knuckle_backfist',
          durationSec: 0.36,
          lungePx: 26,
          pelvis: { dx: 8 + ikReach * 0.3, dy: 3, rotRad: 0.08, scaleX: 1.06 },
          waist: { dx: 20 + ikReach * 0.55, dy: 2, rotRad: 0.16, scaleX: 1.10 },
          head: { dx: 18, dy: 2, rotRad: 0.10, scaleX: 1 },
          springPreset: { scaleX: 1.14, scaleY: 0.90, stiffness: 410, damping: 24 },
          vfx: { type: 'strike_slash', color: '#10b981', accent: '#ff2a4b', reachPx: smearReach },
          hitstopSec: hitstop,
          shake: reduced ? 'none' : 'light',
        };
      }
      if (isZangief) {
        // Zangief Heavy Chop (& Step-Back on After: Retreat 3): Thunderous open-palm chest slap that echoes across the arena
        return {
          ...attackBase,
          poseKind: 'zangief_heavy_chest_chop',
          durationSec: 0.40,
          lungePx: 22,
          pelvis: { dx: 8 + ikReach * 0.3, dy: 6, rotRad: 0.06, scaleX: 1.12 },
          waist: { dx: 22 + ikReach * 0.55, dy: 4, rotRad: 0.18, scaleX: 1.18 },
          head: { dx: 18, dy: 3, rotRad: 0.10, scaleX: 1.04 },
          springPreset: { scaleX: 1.18, scaleY: 0.86, stiffness: 380, damping: 22 },
          vfx: { type: 'ki_shockwave', color: '#ef4444', accent: '#fde047', reachPx: smearReach },
          hitstopSec: hitstop,
          shake: reduced ? 'none' : 'medium',
        };
      }
      return {
        ...attackBase,
        poseKind: isKen ? 'ken_backfist_tag' : 'ryu_cr_mk_poke',
        frameKey: 'cross_strike',
        frameSequence: [
          { at: 0.0, frameKey: 'cross_windup' },
          { at: 0.15, frameKey: 'cross_strike' },
          { at: 0.76, frameKey: 'cross_windup' },
        ],
        hitstopTriggerU: 0.17,
        durationSec: isKen ? 0.58 : 0.56,
        lungePx: isKen ? 28 : 24,
        pelvis: { dx: 8 + ikReach * 0.35, dy: isKen ? 2 : 5, rotRad: 0.06, scaleX: 1.07 },
        waist: { dx: (isKen ? 22 : 18) + ikReach * 0.55, dy: isKen ? 2 : 3, rotRad: 0.15, scaleX: 1.09 },
        head: { dx: 18, dy: 2, rotRad: 0.08, scaleX: 1 },
        springPreset: { scaleX: 1.15, scaleY: 0.89, stiffness: 380, damping: 22 },
        afterimage: isExceeded
          ? { count: 4, spacingMs: 24, alpha: 0.38, color: isKen ? '#ff5f38' : '#38bdf8' }
          : (isKen ? { count: 2, spacingMs: 30, alpha: 0.22, color: '#cbd5e1' } : null),
        vfx: isExceeded
          ? {
            type: isKen ? 'ken_crimson_cross_whip' : 'ryu_denjin_cross_lance',
            fallbackType: 'strike_slash',
            color: isKen ? '#ff5f38' : '#38bdf8',
            accent: isKen ? '#fde047' : '#ffffff',
            reachPx: smearReach,
            isExceeded: true,
          }
          : {
            type: 'physical_cross_snap',
            fallbackType: 'strike_slash',
            color: '#e2e8f0',
            accent: '#ffffff',
            reachPx: smearReach,
            isExceeded: false,
          },
        hitstopSec: hitstop,
        shake: reduced ? 'none' : 'light',
      };
    }

    if (cKey === 'grasp') {
      if (isCammy) {
        // Cammy Hooligan Neck-Scissors: Steps inside guard, wraps red-booted legs around head, and somersaults to toss them 2 tiles
        return {
          ...attackBase,
          poseKind: 'cammy_hooligan_neck_scissors',
          durationSec: 0.40,
          hopHeight: 34,
          airWindow: [0.08, 0.88],
          lungePx: 28,
          wholeSpinRad: reduced ? 0 : -Math.PI * 2,
          spinWindow: [0.12, 0.84],
          pelvis: { dx: 12, dy: -4, rotRad: -0.14, scaleX: 1.08 },
          waist: { dx: 18 + ikReach * 0.45, dy: -2, rotRad: -0.22, scaleX: 1.12 },
          head: { dx: 14, dy: 2, rotRad: -0.18, scaleX: 1 },
          springPreset: { scaleX: 0.88, scaleY: 1.16, stiffness: 400, damping: 20 },
          afterimage: { count: 3, spacingMs: 20, alpha: 0.38, color: '#10b981' },
          vfx: { type: 'strike_slash', color: '#10b981', accent: '#ff2a4b', reachPx: smearReach },
          hitstopSec: hitstop,
          shake: reduced ? 'none' : 'medium',
        };
      }
      if (isZangief) {
        // Zangief Bearing-Down Headbutt / Toss: Snatches opponent by collar with one massive hand, headbutts them, and heaves them across stage
        return {
          ...attackBase,
          poseKind: 'zangief_headbutt_collar_toss',
          durationSec: 0.40,
          hopHeight: 10,
          lungePx: 28,
          pelvis: { dx: 12, dy: 8, rotRad: 0.10, scaleX: 1.14 },
          waist: { dx: 20 + ikReach * 0.45, dy: 6, rotRad: 0.20, scaleX: 1.20 },
          head: { dx: 26, dy: 8, rotRad: 0.26, scaleX: 1.08 },
          springPreset: { scaleX: 1.22, scaleY: 0.82, stiffness: 380, damping: 20 },
          vfx: { type: 'ground_crater', color: '#ef4444', accent: '#fde047', reachPx: smearReach },
          hitstopSec: hitstop,
          shake: reduced ? 'none' : 'heavy',
        };
      }
      return {
        ...attackBase,
        poseKind: isKen ? 'ken_knee_throw' : 'ryu_seoi_nage',
        durationSec: 0.36,
        hopHeight: 0,
        lungePx: 26,
        pelvis: { dx: 10, dy: 8, rotRad: 0.08, scaleX: 1.06 },
        waist: { dx: 16 + ikReach * 0.45, dy: 6, rotRad: 0.16, scaleX: 1.08 },
        head: { dx: 12, dy: 6, rotRad: 0.1, scaleX: 1 },
        springPreset: { scaleX: 1.12, scaleY: 0.9, stiffness: 380, damping: 22 },
        hitstopSec: hitstop,
        shake: reduced ? 'none' : 'light',
      };
    }

    if (cKey === 'assault') {
      if (isCammy) {
        // Cammy Knee Bullet Rush Impact: Drives a rapid knee into opponent's midsection and resets into an aggressive crouch
        return {
          ...attackBase,
          poseKind: 'cammy_knee_bullet_strike',
          durationSec: 0.34,
          hopHeight: 16,
          lungePx: 28,
          cammyCrossUpHeelFlash: isCammyCrossUpActive,
          pelvis: { dx: 12, dy: 10, rotRad: 0.10, scaleX: 1.10 },
          waist: { dx: 20 + ikReach * 0.4, dy: 8, rotRad: 0.18, scaleX: 1.12 },
          head: { dx: 18, dy: 8, rotRad: 0.14, scaleX: 1 },
          springPreset: { scaleX: 1.16, scaleY: 0.86, stiffness: 400, damping: 22 },
          vfx: { type: 'strike_slash', color: '#10b981', accent: '#ff2a4b', reachPx: smearReach },
          hitstopSec: hitstop,
          shake,
        };
      }
      if (isZangief) {
        // Zangief Shoulder Tackle Impact: Bulldozes into opponent, knocking the wind out of them while looming over them
        return {
          ...attackBase,
          poseKind: 'zangief_shoulder_tackle_impact',
          durationSec: 0.38,
          hopHeight: 6,
          lungePx: 30,
          pelvis: { dx: 14, dy: 8, rotRad: 0.10, scaleX: 1.18 },
          waist: { dx: 24 + ikReach * 0.45, dy: 6, rotRad: 0.20, scaleX: 1.24 },
          head: { dx: 22, dy: 6, rotRad: 0.16, scaleX: 1.06 },
          springPreset: { scaleX: 1.24, scaleY: 0.80, stiffness: 360, damping: 18 },
          vfx: { type: 'ground_crater', color: '#ef4444', accent: '#fde047', reachPx: smearReach },
          hitstopSec: hitstop,
          shake: reduced ? 'none' : 'heavy',
        };
      }
      return {
        ...attackBase,
        poseKind: isKen ? 'thunder_kick_chop' : 'collarbone_breaker',
        durationSec: 0.34,
        hopHeight: isKen ? 16 : 6,
        lungePx: 26,
        pelvis: { dx: 8, dy: 10, rotRad: 0.06, scaleX: 1.06 },
        waist: { dx: 18 + ikReach * 0.4, dy: 8, rotRad: 0.18, scaleX: 1.08 },
        head: { dx: 18, dy: 10, rotRad: 0.14, scaleX: 1 },
        springPreset: { scaleX: 1.14, scaleY: 0.88, stiffness: 380, damping: 22 },
        vfx: { type: 'overhead_crash', color: primaryTrailColor, accent: '#ffffff', reachPx: smearReach },
        hitstopSec: hitstop,
        shake,
      };
    }

    if (cKey === 'dive') {
      if (isCammy) {
        // Cammy Cannon Leap Drop: Drops a red-boot heel kick onto their crown (with sharp green heel flash if crossed up)
        return {
          ...attackBase,
          poseKind: 'cammy_cannon_leap_heel_drop',
          durationSec: 0.34,
          hopHeight: 30,
          lungePx: 28,
          cammyCrossUpHeelFlash: isCammyCrossUpActive,
          pelvis: { dx: 12 + ikReach * 0.4, dy: 4, rotRad: 0.14, scaleX: 1.08 },
          waist: { dx: 18 + ikReach * 0.35, dy: 4, rotRad: 0.20, scaleX: 1.10 },
          head: { dx: 16, dy: 4, rotRad: 0.12, scaleX: 1 },
          springPreset: { scaleX: 1.18, scaleY: 0.84, stiffness: 380, damping: 20 },
          vfx: { type: 'overhead_crash', color: '#10b981', accent: '#ff2a4b', reachPx: smearReach },
          hitstopSec: hitstop,
          shake,
        };
      }
      if (isZangief) {
        // Zangief Flying Body Press Slam: 400-pound belly-flop onto the target
        return {
          ...attackBase,
          poseKind: 'zangief_flying_body_press_slam',
          durationSec: 0.42,
          hopHeight: 26,
          lungePx: 30,
          pelvis: { dx: 14 + ikReach * 0.4, dy: 12, rotRad: 0.18, scaleX: 1.22 },
          waist: { dx: 22 + ikReach * 0.4, dy: 12, rotRad: 0.24, scaleX: 1.26 },
          head: { dx: 20, dy: 10, rotRad: 0.18, scaleX: 1.08 },
          springPreset: { scaleX: 1.28, scaleY: 0.74, stiffness: 340, damping: 16 },
          vfx: { type: 'ground_crater', color: '#ef4444', accent: '#fde047', reachPx: smearReach },
          hitstopSec: reduced ? 0 : 0.22,
          shake: reduced ? 'none' : 'heavy',
        };
      }
      return {
        ...attackBase,
        poseKind: 'dive_impact',
        durationSec: 0.34,
        hopHeight: 20,
        lungePx: 28,
        pelvis: { dx: 10 + ikReach * 0.4, dy: 4, rotRad: 0.1, scaleX: 1.06 },
        waist: { dx: 16 + ikReach * 0.35, dy: 4, rotRad: 0.16, scaleX: 1.08 },
        head: { dx: 14, dy: 4, rotRad: 0.1, scaleX: 1 },
        springPreset: { scaleX: 1.16, scaleY: 0.86, stiffness: 360, damping: 20 },
        vfx: { type: 'strike_slash', color: primaryTrailColor, accent: '#ffffff', reachPx: smearReach },
        hitstopSec: hitstop,
        shake,
      };
    }

    if (cKey === 'spike') {
      if (isCammy) {
        // Cammy Guillotine Axe Kick: Raises leg straight vertical, flashes white with brief focus armor, brings red-booted heel crashing down
        return {
          ...attackBase,
          poseKind: 'cammy_guillotine_axe_kick',
          durationSec: 0.38,
          hopHeight: 16,
          lungePx: 28,
          pelvis: { dx: 10 + ikReach * 0.5, dy: 6, rotRad: 0.14, scaleX: 1.10 },
          waist: { dx: 22 + ikReach * 0.55, dy: 4, rotRad: 0.20, scaleX: 1.14 },
          head: { dx: 14, dy: 4, rotRad: 0.12, scaleX: 1 },
          springPreset: { scaleX: 0.86, scaleY: 1.18, stiffness: 390, damping: 20 },
          flashWhiteMs: reduced ? 0 : 55,
          flashColorHex: '#ffffff',
          vfx: { type: 'armor_pierce', color: '#10b981', accent: '#ff2a4b', reachPx: smearReach },
          hitstopSec: hitstop,
          shake,
        };
      }
      if (isZangief) {
        // Zangief Double Hammer Fist: Clenches both fists overhead, tanks a light hit with a metallic clang, slams both arms down onto shoulders
        return {
          ...attackBase,
          poseKind: 'zangief_double_hammer_fist',
          durationSec: 0.42,
          lungePx: 26,
          pelvis: { dx: 10 + ikReach * 0.5, dy: 10, rotRad: 0.10, scaleX: 1.16 },
          waist: { dx: 24 + ikReach * 0.55, dy: 8, rotRad: 0.22, scaleX: 1.24 },
          head: { dx: 18, dy: 8, rotRad: 0.16, scaleX: 1.06 },
          springPreset: { scaleX: 1.24, scaleY: 0.78, stiffness: 360, damping: 18 },
          flashWhiteMs: reduced ? 0 : 60,
          flashColorHex: '#ffd166',
          vfx: { type: 'overhead_crash', color: '#ef4444', accent: '#ffd166', reachPx: smearReach },
          hitstopSec: hitstop,
          shake: reduced ? 'none' : 'heavy',
        };
      }
      return {
        ...attackBase,
        poseKind: isKen ? 'ken_roundhouse' : 'ryu_side_kick',
        durationSec: 0.34,
        lungePx: 24,
        pelvis: { dx: 8 + ikReach * 0.5, dy: 2, rotRad: isKen ? 0.12 : -0.06, scaleX: 1.08 },
        waist: { dx: (isKen ? 22 : 16) + ikReach * 0.55, dy: 2, rotRad: isKen ? 0.16 : -0.1, scaleX: 1.12 },
        head: { dx: 10, dy: 2, rotRad: -0.08, scaleX: 1 },
        springPreset: { scaleX: 1.16, scaleY: 0.88, stiffness: 380, damping: 20 },
        vfx: { type: 'armor_pierce', color: '#f7c65a', accent: primaryTrailColor, reachPx: smearReach },
        hitstopSec: hitstop,
        shake,
      };
    }

    if (cKey === 'focus') {
      if (isCammy) {
        // Cammy Delta Red Counter-Strike: Holds tight martial arts parry stance, absorbs two hits without flinching, delivers pinpoint palm strike to solar plexus
        return {
          ...attackBase,
          poseKind: 'cammy_delta_red_counter_strike',
          durationSec: 0.40,
          lungePx: 28,
          pelvis: { dx: 10, dy: 8, rotRad: 0.06, scaleX: 1.10 },
          waist: { dx: 22 + ikReach * 0.45, dy: 6, rotRad: 0.16, scaleX: 1.14 },
          head: { dx: 18, dy: 4, rotRad: 0.10, scaleX: 1 },
          springPreset: { scaleX: 1.18, scaleY: 0.86, stiffness: 380, damping: 20 },
          vfx: { type: 'focus_ink', color: '#10b981', accent: '#ff2a4b', reachPx: smearReach },
          hitstopSec: hitstop,
          shake,
        };
      }
      if (isZangief) {
        // Zangief Muscle Flex & Clothesline: Puffs out chest and flexes—turning bright red with Iron Wall foot chains—before unwinding a devastating lariat
        return {
          ...attackBase,
          poseKind: 'zangief_muscle_flex_clothesline',
          durationSec: 0.44,
          lungePx: 30,
          ironWallChains: true,
          pelvis: { dx: 12, dy: 8, rotRad: 0.08, scaleX: 1.18 },
          waist: { dx: 24 + ikReach * 0.45, dy: 6, rotRad: 0.22, scaleX: 1.26 },
          head: { dx: 20, dy: 4, rotRad: 0.14, scaleX: 1.08 },
          springPreset: { scaleX: 1.24, scaleY: 0.80, stiffness: 360, damping: 18 },
          flashWhiteMs: reduced ? 0 : 85,
          flashColorHex: '#ff2a2a',
          vfx: { type: 'iron_wall_chains', color: '#ef4444', accent: '#fde047', reachPx: smearReach },
          hitstopSec: hitstop,
          shake: reduced ? 'none' : 'heavy',
        };
      }
      return {
        ...attackBase,
        poseKind: isKen ? 'focus_backfist' : 'focus_palm',
        durationSec: 0.4,
        lungePx: 28,
        pelvis: { dx: 10, dy: 8, rotRad: 0.04, scaleX: 1.1 },
        waist: { dx: 20 + ikReach * 0.45, dy: 6, rotRad: isKen ? 0.2 : 0.12, scaleX: 1.12 },
        head: { dx: 18, dy: 4, rotRad: 0.08, scaleX: 1 },
        springPreset: { scaleX: 1.18, scaleY: 0.86, stiffness: 360, damping: 20 },
        vfx: { type: 'focus_ink', color: primaryTrailColor, reachPx: smearReach },
        hitstopSec: hitstop,
        shake,
      };
    }

    if (cKey === 'one_inch_punch') {
      return {
        ...attackBase,
        poseKind: 'one_inch_punch',
        durationSec: 0.38,
        lungePx: 20,
        pelvis: { dx: 10, dy: 8, rotRad: 0.05, scaleX: 1.12 },
        waist: { dx: 22 + ikReach * 0.4, dy: 4, rotRad: 0.15, scaleX: 1.16 },
        head: { dx: 20, dy: 4, rotRad: 0.08, scaleX: 1 },
        springPreset: { scaleX: 1.22, scaleY: 0.84, stiffness: 400, damping: 18 },
        vfx: { type: 'ki_shockwave', color: '#38bdf8', reachPx: smearReach },
        hitstopSec: reduced ? 0 : 0.18,
        shake: reduced ? 'none' : 'heavy',
      };
    }

    if (cKey === 'donkey_kick' || cKey === 'axe_kick' || cKey === 'knee_bash') {
      return {
        ...attackBase,
        poseKind: cKey,
        durationSec: 0.36,
        hopHeight: cKey === 'axe_kick' ? 18 : 10,
        lungePx: 28,
        pelvis: { dx: 10 + ikReach * 0.5, dy: cKey === 'axe_kick' ? 10 : 4, rotRad: 0.08, scaleX: 1.08 },
        waist: { dx: 18 + ikReach * 0.5, dy: 4, rotRad: 0.14, scaleX: 1.1 },
        head: { dx: 14, dy: 4, rotRad: 0.08, scaleX: 1 },
        springPreset: { scaleX: 1.16, scaleY: 0.88, stiffness: 380, damping: 20 },
        vfx: { type: 'strike_slash', color: isKen ? '#ff7b54' : '#38bdf8', reachPx: smearReach },
        hitstopSec: hitstop,
        shake,
      };
    }

    if (cKey === 'block') {
      if (isCammy) {
        // Cammy Tactical Guard: Crosses gauntleted forearms tight over face and braces stance, deflecting heavy blows with sharp sparks
        return {
          ...base,
          poseKind: 'cammy_tactical_guard',
          durationSec: 0.32,
          pelvis: { dx: -2, dy: 7, rotRad: -0.05, scaleX: 1.06 },
          waist: { dx: -6, dy: 6, rotRad: -0.08, scaleX: 1.08 },
          head: { dx: -4, dy: 6, rotRad: -0.06, scaleX: 1 },
          springPreset: { scaleX: 1.14, scaleY: 0.88, stiffness: 380, damping: 24 },
          vfx: { type: 'armor_gold_clang', color: '#10b981', accent: '#ff2a4b' },
        };
      }
      if (isZangief) {
        // Zangief Iron Curtain: Plants both boots wide with Iron Wall chains and crosses his massive arms like steel girders
        return {
          ...base,
          poseKind: 'zangief_iron_curtain_block',
          durationSec: 0.36,
          ironWallChains: true,
          pelvis: { dx: 0, dy: 8, rotRad: -0.02, scaleX: 1.14 },
          waist: { dx: -2, dy: 6, rotRad: -0.04, scaleX: 1.20 },
          head: { dx: -2, dy: 4, rotRad: -0.02, scaleX: 1.06 },
          springPreset: { scaleX: 1.18, scaleY: 0.86, stiffness: 420, damping: 26 },
          vfx: { type: 'iron_wall_chains', color: '#ef4444', accent: '#94a3b8' },
        };
      }
      return {
        ...base,
        poseKind: 'guard_brace',
        durationSec: 0.32,
        pelvis: { dx: -2, dy: 6, rotRad: -0.04, scaleX: 1.04 },
        waist: { dx: -6, dy: 6, rotRad: isKen ? -0.08 : -0.04, scaleX: 1.06 },
        head: { dx: -4, dy: 6, rotRad: -0.04, scaleX: 1 },
        springPreset: { scaleX: 1.14, scaleY: 0.88, stiffness: 360, damping: 22 },
      };
    }

    // Fallback attack
    return {
      ...attackBase,
      poseKind: 'generic_strike',
      durationSec: 0.34,
      lungePx: 22,
      pelvis: { dx: 6, dy: 4, rotRad: 0.05, scaleX: 1.04 },
      waist: { dx: 16 + ikReach * 0.45, dy: 4, rotRad: 0.14, scaleX: 1.08 },
      head: { dx: 14, dy: 3, rotRad: 0.08, scaleX: 1 },
      springPreset: { scaleX: 1.14, scaleY: 0.88, stiffness: 380, damping: 20 },
      vfx: { type: 'strike_slash', color: primaryTrailColor, reachPx: smearReach },
      hitstopSec: hitstop,
      shake,
    };
  }

  if (phase === 'hit_defend') {
    const dmg = Number(ctx.damageDealt) || 0;
    const effArm = Number(ctx.effectiveArmor) || 0;
    const guardBroken = !!ctx.guardBroken;
    const blockedZero = dmg <= 0 || cKey === 'block';

    // 1. Armor (0 damage taken or Block brace) = Metallic / Golden (or Red Cyclone Super-Armor + Iron Wall chains) Flash + Zero Knockback
    if (blockedZero) {
      return {
        ...base,
        track: 2,
        poseKind: isCammy && cKey === 'block'
          ? 'cammy_tactical_guard'
          : (isZangief && cKey === 'block' ? 'zangief_iron_curtain_block' : 'guard_brace'),
        durationSec: 0.32,
        lungePx: 0,
        ironWallChains: isZangiefIronWallCard,
        pelvis: { dx: -2, dy: 6, rotRad: -0.03, scaleX: isZangief ? 1.09 : 1.05 },
        waist: { dx: -4, dy: 5, rotRad: isKen ? -0.06 : -0.03, scaleX: isZangief ? 1.12 : 1.07 },
        head: { dx: -2, dy: 4, rotRad: -0.03, scaleX: 1 },
        springPreset: { scaleX: 1.12, scaleY: 0.9, stiffness: 400, damping: 24 },
        flashWhiteMs: reduced ? 0 : 75,
        flashColorHex: isZangief ? '#ff2a2a' : '#ffd166',
        vfx: isZangiefIronWallCard
          ? { type: 'iron_wall_chains', color: '#ff2a2a', accent: '#94a3b8' }
          : { type: 'armor_gold_clang', color: isZangief ? '#ff2a2a' : '#ffd166', accent: '#ffffff' },
        hitstopSec: reduced ? 0 : 0.09,
        shake: 'none',
      };
    }

    // 2. Stunned (Damage > Guard) = Heavy Reel / Crumple + Camera Zoom Punch
    if (guardBroken) {
      return {
        ...base,
        track: 1,
        poseKind: 'heavy_crumple_reel',
        durationSec: 0.46,
        lungePx: -18,
        pelvis: { dx: -8, dy: 10, rotRad: -0.1, scaleX: 1.02 },
        waist: { dx: -20, dy: 8, rotRad: -0.18, scaleX: 0.96 },
        head: { dx: -26, dy: 6, rotRad: -0.24, scaleX: 0.94 },
        springPreset: { scaleX: 1.24, scaleY: 0.78, velImpulseX: 4.0, velImpulseY: -4.0, stiffness: 320, damping: 16 },
        flashWhiteMs: reduced ? 0 : 85,
        flashColorHex: '#ffffff',
        desaturate: 0.45,
        shudderHz: reduced ? 0 : 26,
        hitstopSec: reduced ? 0 : 0.18,
        cameraPunch: reduced ? 0 : 0.038,
      };
    }

    // 3. Guard Holds (Took damage, NOT stunned) = "Super Armor" Grit!
    // Zangief flashes bright crimson super-armor when eating a hit without staggering (with Iron Wall chains on Focus/Block/Lariat/Blizzard).
    const armorAbsorbed = effArm > 0 || isZangief;
    const gritFlashColor = isZangief ? '#ff2a2a' : (armorAbsorbed ? '#ffd166' : '#ffffff');
    return {
      ...base,
      track: 2,
      poseKind: 'super_armor_grit',
      durationSec: 0.28,
      lungePx: armorAbsorbed ? 0 : -4,
      ironWallChains: isZangiefIronWallCard,
      pelvis: { dx: -3, dy: 3, rotRad: -0.03, scaleX: 1.02 },
      waist: { dx: -8, dy: 2, rotRad: -0.07, scaleX: 1.01 },
      head: { dx: -11, dy: 1, rotRad: -0.1, scaleX: 1 },
      springPreset: { scaleX: 1.11, scaleY: 0.91, velImpulseX: 1.6, velImpulseY: -1.6, stiffness: 400, damping: 24 },
      flashWhiteMs: reduced ? 0 : 65,
      flashColorHex: gritFlashColor,
      vfx: isZangiefIronWallCard
        ? { type: 'iron_wall_chains', color: '#ff2a2a', accent: '#fde047' }
        : (armorAbsorbed
          ? { type: 'armor_gold_clang', color: gritFlashColor, accent: '#fde047' }
          : { type: 'guard_grit_spark', color: primaryTrailColor }),
      hitstopSec: reduced ? 0 : 0.11,
      shudderHz: reduced ? 0 : 18,
    };
  }

  if (phase === 'after') {
    if (cKey === 'cross') {
      return resolveStandeeChoreography(charKey, cKey, 'move', {
        ...ctx,
        moveKind: 'cross_retreat',
        spacesMoved: 3,
      });
    }
    if (cKey === 'atomic_suplex' && criticalPaid) {
      // Critical, After: Close 3 — earth-shaking dash right back into their face
      return {
        ...base,
        track: 0,
        poseKind: 'zangief_critical_stomp_chase',
        durationSec: 0.36,
        hopHeight: 14,
        pelvis: { dx: 10, dy: 6, rotRad: 0.08, scaleX: 1.10 },
        waist: { dx: 18, dy: 4, rotRad: 0.14, scaleX: 1.14 },
        head: { dx: 20, dy: 2, rotRad: 0.12, scaleX: 1.04 },
        springPreset: { scaleX: 1.16, scaleY: 0.86, stiffness: 360, damping: 20 },
        afterimage: { count: 3, spacingMs: 22, alpha: 0.38, color: '#ff2a2a' },
        vfx: { type: 'ground_crater', color: '#ff2a2a', accent: '#fde047' },
        cameraPunch: reduced ? 0 : 0.03,
      };
    }
    if (cKey === 'banishing_flat') {
      // After: Close 2 stomp follow-up
      return {
        ...base,
        track: 0,
        poseKind: 'zangief_critical_stomp_chase',
        durationSec: 0.32,
        hopHeight: 10,
        pelvis: { dx: 8, dy: 4, rotRad: 0.06, scaleX: 1.08 },
        waist: { dx: 14, dy: 3, rotRad: 0.10, scaleX: 1.10 },
        head: { dx: 16, dy: 2, rotRad: 0.08, scaleX: 1.02 },
        afterimage: { count: 2, spacingMs: 24, alpha: 0.32, color: '#22c55e' },
        vfx: { type: 'ground_crater', color: '#22c55e', accent: '#fde047' },
      };
    }
    return {
      ...base,
      poseKind: 'recovery',
      durationSec: 0.25,
      pelvis: { dx: 0, dy: 2, rotRad: 0, scaleX: 1 },
      waist: { dx: 2, dy: 1, rotRad: 0.03, scaleX: 1 },
      head: { dx: 2, dy: 0, rotRad: 0.02, scaleX: 1 },
    };
  }

  if (phase === 'stunned') {
    return {
      ...base,
      poseKind: 'stunned',
      durationSec: 0.48,
      lungePx: -16,
      pelvis: { dx: -8, dy: 10, rotRad: -0.1, scaleX: 1 },
      waist: { dx: -18, dy: 8, rotRad: -0.18, scaleX: 0.95 },
      head: { dx: -24, dy: 10, rotRad: -0.25, scaleX: 0.93 },
      desaturate: 0.62,
      shudderHz: reduced ? 0 : 26,
      hitstopSec: reduced ? 0 : 0.14,
      cameraPunch: reduced ? 0 : 0.035,
    };
  }

  // Idle breathing specification (character-distinct Ryu vs Ken vs Cammy vs Zangief, with lower/tenser Exceeded stance)
  const isExceededIdle = !!ctx.exceeded;
  const idleFreqHz = isExceededIdle
    ? (isCammy ? 2.35 : (isKen ? 2.15 : (isRyu ? 1.55 : (isZangief ? 1.35 : 1.75))))
    : (isCammy ? 1.85 : (isKen ? 1.65 : (isRyu ? 1.05 : (isZangief ? 0.92 : 1.25))));
  const idleAmpScale = isExceededIdle
    ? (isZangief ? 0.036 : (isKen || isCammy ? 0.032 : 0.022))
    : (isZangief ? 0.026 : (isKen || isCammy ? 0.024 : 0.014));
  const idleLeanPx = isExceededIdle
    ? (isCammy ? 4.8 : (isKen ? 4.2 : 2.8))
    : (isCammy ? 3.0 : (isKen ? 2.5 : 1.2));

  return {
    ...base,
    poseKind: isExceededIdle ? 'exceed_idle' : 'idle',
    durationSec: 1.0,
    idleFreqHz,
    idleAmpScale,
    idleLeanPx,
    pelvis: isExceededIdle ? { dx: isCammy ? 5 : 3, dy: 5, rotRad: 0.04, scaleX: isZangief ? 1.06 : 1.03 } : { dx: 0, dy: 0, rotRad: 0, scaleX: 1 },
    waist: isExceededIdle ? { dx: isCammy ? 9 : 7, dy: 4, rotRad: 0.08, scaleX: isZangief ? 1.08 : 1.04 } : { dx: 0, dy: 0, rotRad: 0, scaleX: 1 },
    head: isExceededIdle ? { dx: isCammy ? 11 : 9, dy: 3, rotRad: 0.06, scaleX: 1 } : { dx: 0, dy: 0, rotRad: 0, scaleX: 1 },
    criticalAura: criticalPaid || isExceededIdle,
  };
}


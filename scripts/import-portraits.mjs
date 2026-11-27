#!/usr/bin/env node
/**
 * Manifest-Locked Portrait Ingestion & Audit Pipeline for Exceed Revival
 * ----------------------------------------------------------------------
 * Prepares raw, uncropped fighter Source Art into:
 *   1. Full Portraits (`480px` wide JPEG -> FIGHTER_PHOTOS)
 *   2. Face/upper-center Headshots (`480x600` 4:5 JPEG -> FIGHTER_HEADSHOTS)
 *   3. Side-by-side `Raw | Previous | New` QA diff contact sheet
 *   4. Pure-Node 41-fighter `--audit` comparison against any git ref
 *
 * Usage:
 *   node scripts/import-portraits.mjs --ingest <key> <rawFilePath>
 *   node scripts/import-portraits.mjs --unlock <k1,k2>
 *   node scripts/import-portraits.mjs --stage [manifestPath] [--only k1,k2] [--force-stage] [--out .playwright-cli/portrait-batch] [--serve --port 3099]
 *   node scripts/import-portraits.mjs --apply <results.json> [--unlock k1,k2]
 *   node scripts/import-portraits.mjs --lock <k1,k2|all>
 *   node scripts/import-portraits.mjs --mark-needs-source <k1,k2>
 *   node scripts/import-portraits.mjs --audit [--out ../.scratch/portrait-audit] [--compare-ref adc29ad~1]
 */
import crypto from 'crypto';
import { execSync, spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const PORTRAITS_FILE = path.join(ROOT, 'game', 'portraits.js');
const DEFAULT_MANIFEST_FILE = path.join(ROOT, 'assets', 'portraits', 'manifest.json');
const RAW_DIR = path.join(ROOT, 'assets', 'portraits', 'raw');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        args[k] = true;
      } else {
        args[k] = next;
        i++;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function sha256(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

function mimeForPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}

function loadPortraitsMaps(code) {
  const ctx = {};
  vm.runInNewContext(code + '\nthis.P=FIGHTER_PHOTOS;this.H=FIGHTER_HEADSHOTS;', ctx);
  return { photos: ctx.P, headshots: ctx.H };
}

function loadManifest(manifestPath = DEFAULT_MANIFEST_FILE) {
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function saveManifest(manifest, manifestPath = DEFAULT_MANIFEST_FILE) {
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

function parseKeyList(val) {
  if (!val || val === true) return [];
  return String(val)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseJpegDimensions(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) {
    throw new Error('Invalid JPEG magic header');
  }
  let i = 2;
  while (i + 3 < buf.length) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1];
    // Standalone markers
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }
    if (i + 4 > buf.length) break;
    const segLen = buf.readUInt16BE(i + 2);
    // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      if (i + 9 <= buf.length) {
        const height = buf.readUInt16BE(i + 5);
        const width = buf.readUInt16BE(i + 7);
        return { width, height };
      }
    }
    i += 2 + segLen;
  }
  throw new Error('Could not find JPEG SOF dimensions');
}

function decodeDataUriJpeg(dataUri) {
  const m = dataUri.match(/^data:image\/jpeg;base64,(.+)$/);
  if (!m) throw new Error('Expected data:image/jpeg;base64,... URI');
  return Buffer.from(m[1], 'base64');
}

function buildProcessorHTML(entries, currentMaps, autoSave = false) {
  const embedded = entries.map((entry) => {
    const abs = path.isAbsolute(entry.src) ? entry.src : path.join(ROOT, entry.src);
    if (!fs.existsSync(abs)) {
      throw new Error(`Missing source image: ${entry.src}`);
    }
    const b64 = fs.readFileSync(abs).toString('base64');
    return {
      key: entry.key,
      fullCrop: entry.fullCrop || null,
      crop: entry.crop || null,
      backdrop: entry.backdrop || {
        mode: 'auto',
        removeInteriorPockets: true,
        edgeDecontam: true,
        protectRects: [],
      },
      dataUrl: `data:${mimeForPath(abs)};base64,${b64}`,
      prevFullUrl: currentMaps.photos[entry.key] || null,
      prevHeadshotUrl: currentMaps.headshots[entry.key] || null,
    };
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Exceed Portrait Auto-Crop Processor</title>
<style>
  body { margin: 0; background: #08090e; color: #eef2ff; font-family: monospace; padding: 16px; }
  canvas { display: block; max-width: 100%; border: 1px solid #2b3248; }
</style>
</head>
<body>
<div id="status">processing</div>
<canvas id="contact-sheet"></canvas>
<script>
const ENTRIES = ${JSON.stringify(embedded)};
const QUALITIES = [0.87, 0.86, 0.88, 0.85, 0.89, 0.84, 0.90, 0.83, 0.82, 0.81, 0.80, 0.91];

function isCheckerPixel(data, w, h, x, y, requireAlternation = false) {
  const i = (y * w + x) * 4;
  const r = data[i], g = data[i + 1], b = data[i + 2];
  if (Math.max(r, g, b) - Math.min(r, g, b) > 20) return false;
  const lum = r * 0.299 + g * 0.587 + b * 0.114;
  if (lum < 178) return false;
  let minL = 255, maxL = 0, neutral = 0, total = 0;
  const pts = requireAlternation
    ? [
        [x - 12, y], [x - 6, y], [x - 5, y], [x + 5, y], [x + 6, y], [x + 12, y],
        [x, y - 12], [x, y - 6], [x, y - 5], [x, y + 5], [x, y + 6], [x, y + 12],
      ]
    : [
        [x - 12, y], [x - 6, y], [x + 6, y], [x + 12, y],
        [x, y - 12], [x, y - 6], [x, y + 6], [x, y + 12],
        [x - 6, y - 6], [x + 6, y - 6], [x - 6, y + 6], [x + 6, y + 6],
      ];
  for (const [nx, ny] of pts) {
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
    const ni = (ny * w + nx) * 4;
    const nr = data[ni], ng = data[ni + 1], nb = data[ni + 2];
    total++;
    if (Math.max(nr, ng, nb) - Math.min(nr, ng, nb) <= 20) {
      neutral++;
      const nl = nr * 0.299 + ng * 0.587 + nb * 0.114;
      if (nl < minL) minL = nl;
      if (nl > maxL) maxL = nl;
    }
  }
  if (requireAlternation) {
    return total >= 4 && neutral >= total - 1 && minL <= 232 && maxL >= 242 && (maxL - minL >= 18);
  }
  return total >= 4 && neutral >= Math.ceil(total * 0.55) && (maxL - minL >= 18 || lum >= 244);
}

function detectBackdropMode(data, w, h) {
  let transparentEdge = 0, edgeSamples = 0, checkerEdge = 0, whiteEdge = 0;
  const step = Math.max(1, Math.floor(Math.min(w, h) / 100));
  const checkPt = (x, y) => {
    const idx = (y * w + x) * 4;
    edgeSamples++;
    if (data[idx + 3] < 245) transparentEdge++;
    const mx = Math.max(data[idx], data[idx + 1], data[idx + 2]);
    const mn = Math.min(data[idx], data[idx + 1], data[idx + 2]);
    const lum = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
    if (mx - mn <= 18 && lum >= 238) whiteEdge++;
    if (isCheckerPixel(data, w, h, x, y, true)) checkerEdge++;
  };
  for (let x = 0; x < w; x += step) { checkPt(x, 0); checkPt(x, h - 1); }
  for (let y = 0; y < h; y += step) { checkPt(0, y); checkPt(w - 1, y); }
  if (transparentEdge / edgeSamples > 0.25) return 'alpha';
  if (checkerEdge / edgeSamples > 0.12) return 'checkerboard';
  if (whiteEdge / edgeSamples > 0.35) return 'white-matte';
  if (transparentEdge / edgeSamples > 0.03) return 'alpha';
  return 'opaque-dark';
}

function buildProtectedMask(w, h, protectRects) {
  const mask = new Uint8Array(w * h);
  if (!Array.isArray(protectRects)) return mask;
  for (const r of protectRects) {
    const x0 = Math.max(0, Math.floor(r.x));
    const y0 = Math.max(0, Math.floor(r.y));
    const x1 = Math.min(w, Math.ceil(r.x + r.w));
    const y1 = Math.min(h, Math.ceil(r.y + r.h));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        mask[y * w + x] = 1;
      }
    }
  }
  return mask;
}

function removeBackdrop(imgData, opts = {}) {
  const { data, width: w, height: h } = imgData;
  const reqMode = opts.mode || 'auto';
  if (reqMode === 'none') return { imgData, mode: 'none' };

  const mode = reqMode === 'auto' ? detectBackdropMode(data, w, h) : reqMode;
  if (mode === 'alpha' || mode === 'opaque-dark') return { imgData, mode };

  const removeInteriorPockets = opts.removeInteriorPockets !== false;
  const edgeDecontam = opts.edgeDecontam !== false;
  const protectedMask = buildProtectedMask(w, h, opts.protectRects);

  let hasSubtleCheckerBorder = false;
  if (mode === 'white-matte') {
    let borderNeutral = 0, borderMid = 0, borderStep = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (x >= 16 && x < w - 16 && y >= 16 && y < h - 16) continue;
        const i = (y * w + x) * 4;
        const mn = Math.min(data[i], data[i + 1], data[i + 2]);
        const mx = Math.max(data[i], data[i + 1], data[i + 2]);
        if (mn >= 235 && mx - mn <= 7) {
          borderNeutral++;
          if (mn >= 236 && mn <= 249) borderMid++;
          if (x + 12 < w) {
            const j = (y * w + x + 12) * 4;
            const mn2 = Math.min(data[j], data[j + 1], data[j + 2]);
            const mx2 = Math.max(data[j], data[j + 1], data[j + 2]);
            if (mn2 >= 235 && mx2 - mn2 <= 7 && Math.abs(mn - mn2) >= 3) borderStep++;
          }
        }
      }
    }
    hasSubtleCheckerBorder =
      borderNeutral >= 500 &&
      (borderMid / borderNeutral) >= 0.25 &&
      (borderStep / borderNeutral) >= 0.25;
  }

  const total = w * h;
  const bg = new Uint8Array(total);
  const q = new Int32Array(total);
  let head = 0, tail = 0;

  const isBgPixel = (p) => {
    if (protectedMask[p]) return false;
    const i = p * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    const lum = r * 0.299 + g * 0.587 + b * 0.114;
    if (mode === 'white-matte') {
      const mn = Math.min(r, g, b);
      return hasSubtleCheckerBorder
        ? (mn >= 237 && sat <= 7)
        : (mn >= 243 && sat <= 8);
    }
    if (sat > 20) return false;
    const x = p % w, y = (p - x) / w;
    return lum >= 238 || (lum >= 186 && isCheckerPixel(data, w, h, x, y, false));
  };

  const trySeed = (x, y) => {
    const p = y * w + x;
    if (!bg[p] && isBgPixel(p)) {
      bg[p] = 1;
      q[tail++] = p;
    }
  };

  for (let x = 0; x < w; x++) { trySeed(x, 0); trySeed(x, h - 1); }
  for (let y = 0; y < h; y++) { trySeed(0, y); trySeed(w - 1, y); }

  if (mode === 'checkerboard' && removeInteriorPockets) {
    for (let y = 12; y < h - 12; y += 12) {
      for (let x = 12; x < w - 12; x += 12) {
        const p = y * w + x;
        if (!bg[p] && !protectedMask[p]) {
          let hasGrey = false, hasWhite = false, colorPixel = false;
          for (let dy = -8; dy <= 8; dy += 4) {
            for (let dx = -8; dx <= 8; dx += 4) {
              const ni = ((y + dy) * w + (x + dx)) * 4;
              const nr = data[ni], ng = data[ni + 1], nb = data[ni + 2];
              if (Math.max(nr, ng, nb) - Math.min(nr, ng, nb) > 12) { colorPixel = true; break; }
              const nl = nr * 0.299 + ng * 0.587 + nb * 0.114;
              if (nl >= 185 && nl <= 225) hasGrey = true;
              if (nl >= 245) hasWhite = true;
            }
            if (colorPixel) break;
          }
          if (!colorPixel && hasGrey && hasWhite) trySeed(x, y);
        }
      }
    }
  }

  while (head < tail) {
    const p = q[head++];
    const x = p % w;
    const y = (p - x) / w;
    const nbrs = [
      x > 0 ? p - 1 : -1,
      x + 1 < w ? p + 1 : -1,
      y > 0 ? p - w : -1,
      y + 1 < h ? p + w : -1,
    ];
    for (const np of nbrs) {
      if (np >= 0 && !bg[np] && isBgPixel(np)) {
        bg[np] = 1;
        q[tail++] = np;
      }
    }
  }

  if (Array.isArray(opts.extraSeeds) && opts.extraSeeds.length > 0) {
    const isSeedBgPixel = (p) => {
      if (protectedMask[p]) return false;
      const i = p * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      const lum = r * 0.299 + g * 0.587 + b * 0.114;
      return sat <= 45 && lum >= 218;
    };
    const eq = new Int32Array(total);
    for (const seed of opts.extraSeeds) {
      const sx = Math.max(0, Math.min(w - 1, Math.round(seed.x)));
      const sy = Math.max(0, Math.min(h - 1, Math.round(seed.y)));
      const sp = sy * w + sx;
      if (bg[sp] || !isSeedBgPixel(sp)) continue;
      let eh = 0, et = 0;
      bg[sp] = 1;
      eq[et++] = sp;
      while (eh < et) {
        const cp = eq[eh++];
        const cx = cp % w, cy = (cp - cx) / w;
        for (const np of [cx > 0 ? cp - 1 : -1, cx + 1 < w ? cp + 1 : -1, cy > 0 ? cp - w : -1, cy + 1 < h ? cp + w : -1]) {
          if (np >= 0 && !bg[np] && isSeedBgPixel(np)) {
            bg[np] = 1;
            eq[et++] = np;
          }
        }
      }
    }
  }

  if (mode === 'checkerboard' && removeInteriorPockets) {
    const isChkPx = (p) => {
      if (protectedMask[p]) return false;
      const i = p * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      const lum = r * 0.299 + g * 0.587 + b * 0.114;
      return sat <= 14 && lum >= 202;
    };
    const visited = new Uint8Array(total);
    const compQ = new Int32Array(total);
    for (let startP = 0; startP < total; startP++) {
      if (bg[startP] || visited[startP] || !isChkPx(startP)) continue;
      let ch = 0, ct = 0;
      visited[startP] = 1;
      compQ[ct++] = startP;
      let hiCount = 0, loCount = 0, bt = 0, bsoft = 0;
      while (ch < ct) {
        const cp = compQ[ch++];
        const cx = cp % w, cy = (cp - cx) / w;
        const ci = cp * 4;
        const clum = data[ci] * 0.299 + data[ci + 1] * 0.587 + data[ci + 2] * 0.114;
        if (clum >= 242) hiCount++;
        else if (clum >= 202 && clum <= 236) loCount++;
        for (const np of [cx > 0 ? cp - 1 : -1, cx + 1 < w ? cp + 1 : -1, cy > 0 ? cp - w : -1, cy + 1 < h ? cp + w : -1]) {
          if (np < 0 || bg[np] || visited[np]) continue;
          if (isChkPx(np)) {
            visited[np] = 1;
            compQ[ct++] = np;
          } else {
            const nx = np % w, ny = (np - nx) / w;
            const sx = Math.max(0, Math.min(w - 1, nx + (nx - cx) * 2));
            const sy = Math.max(0, Math.min(h - 1, ny + (ny - cy) * 2));
            const bi = (sy * w + sx) * 4;
            const bsat = Math.max(data[bi], data[bi + 1], data[bi + 2]) - Math.min(data[bi], data[bi + 1], data[bi + 2]);
            const blum = data[bi] * 0.299 + data[bi + 1] * 0.587 + data[bi + 2] * 0.114;
            bt++;
            if (bsat <= 20 && blum >= 150 && blum < 202) bsoft++;
          }
        }
      }
      if (ct >= 100 && (hiCount / ct) >= 0.30 && (loCount / ct) >= 0.16 && (bt ? bsoft / bt : 0) <= 0.10) {
        for (let k = 0; k < ct; k++) bg[compQ[k]] = 1;
      }
    }
  }

  if (mode === 'white-matte' && removeInteriorPockets) {
    const minStrict = hasSubtleCheckerBorder ? 238 : 244;
    const maxStrictSat = hasSubtleCheckerBorder ? 6 : 7;
    const isStrictPocketPx = (p) => {
      if (protectedMask[p]) return false;
      const i = p * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      return Math.min(r, g, b) >= minStrict && (Math.max(r, g, b) - Math.min(r, g, b)) <= maxStrictSat;
    };
    const visited = new Uint8Array(total);
    const compQ = new Int32Array(total);
    for (let startP = 0; startP < total; startP++) {
      if (bg[startP] || visited[startP] || !isStrictPocketPx(startP)) continue;

      let ch = 0, ct = 0;
      visited[startP] = 1;
      compQ[ct++] = startP;
      let maxCompY = 0;
      let pureWhiteCount = 0;
      let midGreyCount = 0;
      let checkerStepHits = 0;
      let borderTotal = 0;
      let borderSoftNeutral = 0;
      let borderDarkOrSaturated = 0;
      let borderSaturated = 0;
      let borderDarkInk = 0;
      let borderLumSum = 0;

      while (ch < ct) {
        const cp = compQ[ch++];
        const cx = cp % w;
        const cy = (cp - cx) / w;
        if (cy > maxCompY) maxCompY = cy;
        const ci = cp * 4;
        const cr = data[ci], cg = data[ci + 1], cb = data[ci + 2];
        const clum = (cr + cg + cb) / 3;
        const cmn = Math.min(cr, cg, cb);
        if (cmn >= 250 && Math.max(cr, cg, cb) - cmn <= 5) {
          pureWhiteCount++;
        } else if (cmn >= minStrict && clum <= 249.5) {
          midGreyCount++;
        }
        if (hasSubtleCheckerBorder && cx + 8 < w) {
          const sp = cp + 8;
          if (isStrictPocketPx(sp)) {
            const si = sp * 4;
            const slum = (data[si] + data[si + 1] + data[si + 2]) / 3;
            const d = Math.abs(clum - slum);
            if (d >= 3 && d <= 16) checkerStepHits++;
          }
        }
        const nbrs = [
          cx > 0 ? cp - 1 : -1,
          cx + 1 < w ? cp + 1 : -1,
          cy > 0 ? cp - w : -1,
          cy + 1 < h ? cp + w : -1,
        ];
        for (const np of nbrs) {
          if (np < 0 || bg[np] || visited[np]) continue;
          if (isStrictPocketPx(np)) {
            visited[np] = 1;
            compQ[ct++] = np;
          } else {
            const nx = np % w, ny = (np - nx) / w;
            const sx = Math.max(0, Math.min(w - 1, nx + (nx - cx) * 2));
            const sy = Math.max(0, Math.min(h - 1, ny + (ny - cy) * 2));
            const bi = (sy * w + sx) * 4;
            const br = data[bi], bgc = data[bi + 1], bb = data[bi + 2];
            const bsat = Math.max(br, bgc, bb) - Math.min(br, bgc, bb);
            const blum = br * 0.299 + bgc * 0.587 + bb * 0.114;
            borderTotal++;
            borderLumSum += blum;
            if (bsat <= 24 && blum >= 180 && blum < minStrict) borderSoftNeutral++;
            if (bsat >= 30) borderSaturated++;
            if (blum < 165 || bsat >= 30) borderDarkOrSaturated++;
            if (blum < 120) borderDarkInk++;
          }
        }
      }

      const compArea = ct;
      const pureFrac = compArea > 0 ? pureWhiteCount / compArea : 0;
      const midFrac = compArea > 0 ? midGreyCount / compArea : 0;
      const stepFrac = compArea > 0 ? checkerStepHits / compArea : 0;
      const softNeutralFrac = borderTotal > 0 ? borderSoftNeutral / borderTotal : 0;
      const crispEdgeFrac = borderTotal > 0 ? borderDarkOrSaturated / borderTotal : 0;
      const satEdgeFrac = borderTotal > 0 ? borderSaturated / borderTotal : 0;
      const darkInkFrac = borderTotal > 0 ? borderDarkInk / borderTotal : 0;
      const avgBorderLum = borderTotal > 0 ? borderLumSum / borderTotal : 255;

      const isSubtleCheckerPocket =
        hasSubtleCheckerBorder &&
        compArea >= 250 &&
        midFrac >= 0.30 &&
        stepFrac >= 0.22;
      const isPureBackdropPocket =
        pureFrac >= 0.75 &&
        compArea >= 400 &&
        softNeutralFrac <= 0.08 &&
        crispEdgeFrac >= 0.58 &&
        (darkInkFrac >= 0.22 ||
         (satEdgeFrac >= 0.68 && avgBorderLum <= 194) ||
         (pureFrac >= 0.80 && softNeutralFrac <= 0.02 && satEdgeFrac >= 0.55 && avgBorderLum <= 232));
      const isFlatMatteInteriorPocket =
        !hasSubtleCheckerBorder &&
        compArea >= 140 &&
        pureFrac >= 0.85 &&
        softNeutralFrac <= 0.11 &&
        (darkInkFrac >= 0.18 || satEdgeFrac >= 0.28 || (pureFrac >= 0.90 && softNeutralFrac <= 0.09));
      const isHairGapPocket =
        !hasSubtleCheckerBorder &&
        maxCompY < h * 0.24 &&
        softNeutralFrac <= 0.16 &&
        satEdgeFrac <= 0.48 &&
        ((compArea >= 85 && compArea < 1400 && darkInkFrac >= 0.41 && avgBorderLum <= 160 && (pureFrac >= 0.45 || avgBorderLum <= 130)) ||
         (compArea >= 25 && compArea < 85 && darkInkFrac >= 0.55 && avgBorderLum <= 135));

      if (isSubtleCheckerPocket || isPureBackdropPocket || isFlatMatteInteriorPocket || isHairGapPocket) {
        for (let k = 0; k < ct; k++) bg[compQ[k]] = 1;
      }
    }
  }

  const dist = new Uint8Array(total);
  if (edgeDecontam) {
    for (let p = 0; p < total; p++) {
      if (bg[p]) continue;
      const x = p % w, y = (p - x) / w;
      if (
        (x > 0 && bg[p - 1]) ||
        (x + 1 < w && bg[p + 1]) ||
        (y > 0 && bg[p - w]) ||
        (y + 1 < h && bg[p + w])
      ) {
        dist[p] = 1;
      }
    }
    for (let p = 0; p < total; p++) {
      if (bg[p] || dist[p] === 1) continue;
      const x = p % w, y = (p - x) / w;
      if (
        (x > 0 && dist[p - 1] === 1) ||
        (x + 1 < w && dist[p + 1] === 1) ||
        (y > 0 && dist[p - w] === 1) ||
        (y + 1 < h && dist[p + w] === 1)
      ) {
        dist[p] = 2;
      }
    }
  }

  for (let p = 0; p < total; p++) {
    const i = p * 4;
    if (bg[p]) {
      data[i + 3] = 0;
      continue;
    }
    if (!edgeDecontam || dist[p] === 0 || protectedMask[p]) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const sat = mx - mn;
    const lum = r * 0.299 + g * 0.587 + b * 0.114;
    const isWarmSkin = r > g && g >= b && (r - b) < 95;

    if (mode === 'white-matte') {
      if (dist[p] === 1) {
        if (sat <= 28 && lum >= 135) {
          const alpha = Math.max(0.05, Math.min(1, (234 - lum) / 99));
          data[i] = Math.max(0, Math.min(255, Math.round((r - (1 - alpha) * 255) / Math.max(alpha, 0.2))));
          data[i + 1] = Math.max(0, Math.min(255, Math.round((g - (1 - alpha) * 255) / Math.max(alpha, 0.2))));
          data[i + 2] = Math.max(0, Math.min(255, Math.round((b - (1 - alpha) * 255) / Math.max(alpha, 0.2))));
          data[i + 3] = Math.round(alpha * 255);
        } else if (mn >= 155 && !isWarmSkin) {
          const alpha = Math.max(0.12, Math.min(1, 1 - (mn - 145) / 108));
          data[i] = Math.max(0, Math.min(255, Math.round((r - (1 - alpha) * 255) / Math.max(alpha, 0.2))));
          data[i + 1] = Math.max(0, Math.min(255, Math.round((g - (1 - alpha) * 255) / Math.max(alpha, 0.2))));
          data[i + 2] = Math.max(0, Math.min(255, Math.round((b - (1 - alpha) * 255) / Math.max(alpha, 0.2))));
          data[i + 3] = Math.round(alpha * 255);
        }
      } else if (dist[p] === 2) {
        if (sat <= 22 && lum >= 190) {
          const alpha = Math.max(0.22, Math.min(1, (242 - lum) / 54));
          data[i] = Math.max(0, Math.min(255, Math.round((r - (1 - alpha) * 255) / Math.max(alpha, 0.35))));
          data[i + 1] = Math.max(0, Math.min(255, Math.round((g - (1 - alpha) * 255) / Math.max(alpha, 0.35))));
          data[i + 2] = Math.max(0, Math.min(255, Math.round((b - (1 - alpha) * 255) / Math.max(alpha, 0.35))));
          data[i + 3] = Math.round(alpha * 255);
        } else if (mn >= 195 && !isWarmSkin) {
          const alpha = Math.max(0.35, Math.min(1, 1 - (mn - 185) / 70));
          data[i] = Math.max(0, Math.min(255, Math.round((r - (1 - alpha) * 255) / Math.max(alpha, 0.35))));
          data[i + 1] = Math.max(0, Math.min(255, Math.round((g - (1 - alpha) * 255) / Math.max(alpha, 0.35))));
          data[i + 2] = Math.max(0, Math.min(255, Math.round((b - (1 - alpha) * 255) / Math.max(alpha, 0.35))));
          data[i + 3] = Math.round(alpha * 255);
        }
      }
    } else if (dist[p] === 1) {
      const x = p % w, y = (p - x) / w;
      let adjBg = 0;
      if (x > 0 && bg[p - 1]) adjBg++;
      if (x + 1 < w && bg[p + 1]) adjBg++;
      if (y > 0 && bg[p - w]) adjBg++;
      if (y + 1 < h && bg[p + w]) adjBg++;
      if (sat <= 26 && lum >= 185) {
        data[i + 3] = Math.max(0, 255 - adjBg * 56);
      }
    }
  }
  return { imgData, mode };
}

function computeAutoHeadshotCrop(imgData) {
  const { data, width: w, height: h } = imgData;
  const rowCounts = new Int32Array(h);
  const colCounts = new Int32Array(w);
  for (let y = 0; y < h; y++) {
    let rc = 0;
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 32) {
        rc++;
        colCounts[x]++;
      }
    }
    rowCounts[y] = rc;
  }
  const minRowMass = Math.max(8, Math.floor(w * 0.025));
  const minColMass = Math.max(8, Math.floor(h * 0.025));
  let minY = 0; while (minY < h - 1 && rowCounts[minY] < minRowMass) minY++;
  let maxY = h - 1; while (maxY > minY && rowCounts[maxY] < minRowMass) maxY--;
  let minX = 0; while (minX < w - 1 && colCounts[minX] < minColMass) minX++;
  let maxX = w - 1; while (maxX > minX && colCounts[maxX] < minColMass) maxX--;

  const fgW = Math.max(1, maxX - minX);
  const fgH = Math.max(1, maxY - minY);

  const yStart = minY;
  const yEnd = Math.min(h - 2, Math.floor(minY + fgH * 0.42));
  const winW = Math.max(32, Math.floor(fgW * 0.22));
  const winH = Math.max(32, Math.floor(fgH * 0.16));
  const step = Math.max(4, Math.floor(Math.min(w, h) / 140));

  let bestScore = -1;
  let bestCx = Math.floor((minX + maxX) / 2);
  let bestCy = Math.floor(minY + fgH * 0.20);

  for (let cy = yStart + Math.floor(winH * 0.45); cy <= yEnd; cy += step) {
    const relY = (cy - minY) / fgH;
    const yPrior = Math.exp(-Math.pow((relY - 0.21) / 0.13, 2));
    for (let cx = minX + Math.floor(winW * 0.35); cx <= maxX - Math.floor(winW * 0.35); cx += step) {
      const relX = (cx - w * 0.5) / (w * 0.5);
      const xPrior = 0.65 + 0.35 * Math.exp(-Math.pow(relX / 0.7, 2));
      let skinSum = 0, detailSum = 0, alphaSum = 0, samples = 0;
      const x0 = Math.max(1, cx - Math.floor(winW / 2));
      const x1 = Math.min(w - 2, cx + Math.floor(winW / 2));
      const y0 = Math.max(1, cy - Math.floor(winH / 2));
      const y1 = Math.min(h - 2, cy + Math.floor(winH / 2));
      for (let yy = y0; yy <= y1; yy += 4) {
        for (let xx = x0; xx <= x1; xx += 4) {
          const i = (yy * w + xx) * 4;
          const a = data[i + 3];
          samples++;
          if (a < 48) continue;
          alphaSum++;
          const r = data[i], g = data[i + 1], b = data[i + 2];
          if (r > g + 8 && r > b + 18 && r > 75 && (r - b) < 165) skinSum++;
          const nr = data[((yy * w + xx + 2) * 4)];
          const dr = Math.abs(r - nr);
          if (dr > 14 && dr < 140) detailSum++;
        }
      }
      if (!samples) continue;
      const fillRatio = alphaSum / samples;
      if (fillRatio < 0.35) continue;
      const score = yPrior * xPrior * (fillRatio * 0.8 + (skinSum / samples) * 2.4 + (detailSum / samples) * 1.1);
      if (score > bestScore) {
        bestScore = score;
        bestCx = cx;
        bestCy = cy;
      }
    }
  }

  const cropW = Math.round(Math.min(w * 0.72, Math.max(w * 0.42, fgW * 0.56)));
  const cropH = Math.round(cropW * 1.25);
  const cropX = Math.max(0, Math.min(w - cropW, Math.round(bestCx - cropW / 2)));
  const cropY = Math.max(0, Math.min(h - cropH, Math.round(bestCy - cropH * 0.34)));

  return { x: cropX, y: cropY, w: cropW, h: cropH, autoCenter: [bestCx, bestCy] };
}

function paintRadialBackdrop(ctx, w, h) {
  const g = ctx.createRadialGradient(w * 0.5, h * 0.38, w * 0.08, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
  g.addColorStop(0, '#1c2438');
  g.addColorStop(1, '#08090e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function drawCropped(ctx, work, crop, dstW, dstH) {
  const sx0 = Math.max(0, crop.x);
  const sy0 = Math.max(0, crop.y);
  const sx1 = Math.min(work.width, crop.x + crop.w);
  const sy1 = Math.min(work.height, crop.y + crop.h);
  if (sx1 > sx0 && sy1 > sy0) {
    const dx = ((sx0 - crop.x) / crop.w) * dstW;
    const dy = ((sy0 - crop.y) / crop.h) * dstH;
    const dw = ((sx1 - sx0) / crop.w) * dstW;
    const dh = ((sy1 - sy0) / crop.h) * dstH;
    ctx.drawImage(work, sx0, sy0, sx1 - sx0, sy1 - sy0, dx, dy, dw, dh);
  }
}

function encodeSafeJpeg(canvas) {
  for (const q of QUALITIES) {
    const url = canvas.toDataURL('image/jpeg', q);
    if (!url.includes('NaN') && !url.includes('undefined')) return { url, quality: q };
  }
  throw new Error('Could not encode JPEG without NaN/undefined substring');
}

async function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

(async () => {
  const photos = {};
  const headshots = {};
  const meta = [];

  const rowH = 260;
  const sheet = document.getElementById('contact-sheet');
  sheet.width = 1320;
  sheet.height = Math.max(rowH, ENTRIES.length * rowH);
  const sctx = sheet.getContext('2d');
  sctx.fillStyle = '#08090e';
  sctx.fillRect(0, 0, sheet.width, sheet.height);

  for (let i = 0; i < ENTRIES.length; i++) {
    const entry = ENTRIES[i];
    const img = await loadImage(entry.dataUrl);
    const work = document.createElement('canvas');
    work.width = img.width;
    work.height = img.height;
    const wctx = work.getContext('2d');
    wctx.drawImage(img, 0, 0);
    const rawData = wctx.getImageData(0, 0, work.width, work.height);
    const { imgData, mode } = removeBackdrop(rawData, entry.backdrop);
    wctx.putImageData(imgData, 0, 0);

    // 1. Full Portrait (480px wide)
    const fullCrop = entry.fullCrop || { x: 0, y: 0, w: work.width, h: work.height };
    const fullW = 480;
    const fullH = Math.round(fullW * (fullCrop.h / fullCrop.w));
    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = fullW;
    fullCanvas.height = fullH;
    const fctx = fullCanvas.getContext('2d');
    paintRadialBackdrop(fctx, fullW, fullH);
    drawCropped(fctx, work, fullCrop, fullW, fullH);
    const fullEnc = encodeSafeJpeg(fullCanvas);
    photos[entry.key] = fullEnc.url;

    // 2. Headshot (480x600 4:5)
    const crop = entry.crop || computeAutoHeadshotCrop(imgData);
    const hsCanvas = document.createElement('canvas');
    hsCanvas.width = 480;
    hsCanvas.height = 600;
    const hctx = hsCanvas.getContext('2d');
    paintRadialBackdrop(hctx, 480, 600);
    drawCropped(hctx, work, crop, 480, 600);
    const hsEnc = encodeSafeJpeg(hsCanvas);
    headshots[entry.key] = hsEnc.url;

    // 3. Render Raw | Prev Full | New Full (3:4) | Prev Headshot | New Headshot (4:5) | HUD (1:1) | Token (5:6)
    const ry = i * rowH + 16;
    sctx.fillStyle = '#9aa4bf';
    sctx.font = 'bold 13px monospace';
    sctx.fillText(entry.key + ' [' + mode + ' crop=' + crop.x + ',' + crop.y + ',' + crop.w + 'x' + crop.h + ']', 16, ry);

    // Raw Source (fit 150x220)
    const rawRatio = Math.min(150 / img.width, 220 / img.height);
    sctx.drawImage(img, 16, ry + 10, Math.round(img.width * rawRatio), Math.round(img.height * rawRatio));

    // Prev Full
    if (entry.prevFullUrl) {
      const pf = await loadImage(entry.prevFullUrl);
      sctx.drawImage(pf, 0, 0, pf.width, Math.min(pf.height, Math.round(pf.width * 4 / 3)), 184, ry + 10, 165, 220);
    }
    // New Full (3:4)
    sctx.drawImage(fullCanvas, 0, 0, fullW, Math.min(fullH, Math.round(fullW * 4 / 3)), 365, ry + 10, 165, 220);

    // Prev Headshot
    if (entry.prevHeadshotUrl) {
      const ph = await loadImage(entry.prevHeadshotUrl);
      sctx.drawImage(ph, 0, 0, 480, 600, 550, ry + 10, 176, 220);
    }
    // New Headshot (4:5)
    sctx.drawImage(hsCanvas, 0, 0, 480, 600, 742, ry + 10, 176, 220);

    // HUD 1:1 top slice (140x140)
    sctx.drawImage(hsCanvas, 0, 0, 480, 480, 938, ry + 10, 140, 140);
    // Token 5:6 (150x180)
    sctx.drawImage(hsCanvas, 0, 0, 480, 576, 1098, ry + 10, 150, 180);

    meta.push({ key: entry.key, mode, fullCrop, crop, fullQuality: fullEnc.quality, hsQuality: hsEnc.quality });
  }

  window.__PORTRAIT_RESULTS = { photos, headshots, meta };
  if (${autoSave ? 'true' : 'false'}) {
    await fetch('/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(window.__PORTRAIT_RESULTS),
    });
  }
  document.getElementById('status').textContent = 'ready:' + ENTRIES.length;
})();
</script>
</body>
</html>`;
}

function updatePortraitsFile(results, unlockKeys = new Set()) {
  const src = fs.readFileSync(PORTRAITS_FILE, 'utf8');
  let next = src;

  const hasManifest = fs.existsSync(DEFAULT_MANIFEST_FILE);
  const manifest = hasManifest ? loadManifest(DEFAULT_MANIFEST_FILE) : null;

  const affectedKeys = new Set([
    ...Object.keys(results.photos || {}),
    ...Object.keys(results.headshots || {}),
  ]);

  if (manifest) {
    const blocked = [];
    for (const k of affectedKeys) {
      const entry = manifest.fighters[k];
      if (entry && entry.locked && !unlockKeys.has(k)) {
        blocked.push(k);
      }
    }
    if (blocked.length > 0) {
      throw new Error(
        `Refusing to overwrite locked fighter(s): ${blocked.join(', ')}. Pass --unlock ${blocked.join(',')} or run --unlock first.`
      );
    }
  }

  const upsertMapEntries = (text, mapName, additions) => {
    if (!additions || !Object.keys(additions).length) return text;
    const re = new RegExp(`(const\\s+${mapName}\\s*=\\s*\\{)([\\s\\S]*?)(\\n\\};)`);
    const match = text.match(re);
    if (!match) throw new Error(`Could not find ${mapName} object in game/portraits.js`);

    const lines = match[2].split('\n').filter((l) => l.trim().length > 0);
    const orderedKeys = [];
    const entryMap = new Map();
    for (const line of lines) {
      const km = line.match(/^\s*([a-z0-9_]+)\s*:/i);
      if (km) {
        orderedKeys.push(km[1]);
        entryMap.set(km[1], line);
      }
    }
    for (const [k, val] of Object.entries(additions)) {
      if (typeof val !== 'string' || !val.startsWith('data:image/') || val.includes('NaN') || val.includes('undefined')) {
        throw new Error(`Invalid portrait payload for ${mapName}.${k}`);
      }
      if (!entryMap.has(k)) orderedKeys.push(k);
      entryMap.set(k, `  ${k}: '${val}',`);
    }
    const rebuilt = orderedKeys.map((k) => entryMap.get(k)).join('\n');
    return text.replace(re, `$1\n${rebuilt}$3`);
  };

  next = upsertMapEntries(next, 'FIGHTER_PHOTOS', results.photos);
  next = upsertMapEntries(next, 'FIGHTER_HEADSHOTS', results.headshots);
  new vm.Script(next, { filename: 'portraits.js' });
  fs.writeFileSync(PORTRAITS_FILE, next, 'utf8');

  if (manifest) {
    const maps = loadPortraitsMaps(next);
    for (const k of affectedKeys) {
      if (!manifest.fighters[k]) continue;
      if (unlockKeys.has(k)) {
        manifest.fighters[k].locked = false;
      }
      if (maps.photos[k]) manifest.fighters[k].fullHash = sha256(maps.photos[k]);
      if (maps.headshots[k]) manifest.fighters[k].headshotHash = sha256(maps.headshots[k]);
    }
    saveManifest(manifest, DEFAULT_MANIFEST_FILE);
  }
}

function resolveStageEntries(manifestArg, onlyKeys, forceStage) {
  const manifestPath =
    manifestArg === true
      ? DEFAULT_MANIFEST_FILE
      : path.resolve(process.cwd(), String(manifestArg));
  const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  if (Array.isArray(raw)) {
    const filtered = onlyKeys.length ? raw.filter((e) => onlyKeys.includes(e.key)) : raw;
    return { entries: filtered, skippedLocked: [] };
  }

  if (!raw || typeof raw !== 'object' || !raw.fighters) {
    throw new Error(`Unrecognized manifest format in ${manifestPath}`);
  }

  const entries = [];
  const skippedLocked = [];
  const blockedLocked = [];

  for (const [key, f] of Object.entries(raw.fighters)) {
    if (onlyKeys.length && !onlyKeys.includes(key)) continue;
    if (f.locked && !forceStage) {
      if (onlyKeys.length) {
        blockedLocked.push(key);
      } else {
        skippedLocked.push(key);
      }
      continue;
    }
    entries.push({
      key,
      src: f.sourcePath,
      fullCrop: f.fullCrop || null,
      crop: f.crop || null,
      backdrop: f.backdrop || undefined,
    });
  }

  if (blockedLocked.length > 0) {
    throw new Error(
      `Requested fighter(s) are locked: ${blockedLocked.join(', ')}. Run --unlock ${blockedLocked.join(',')} or pass --force-stage.`
    );
  }

  return { entries, skippedLocked };
}

function runAudit(outDir, compareRef) {
  fs.mkdirSync(path.join(outDir, 'head'), { recursive: true });
  fs.mkdirSync(path.join(outDir, 'prev'), { recursive: true });

  const headCode = fs.readFileSync(PORTRAITS_FILE, 'utf8');
  const headMaps = loadPortraitsMaps(headCode);

  let prevMaps = { photos: {}, headshots: {} };
  let hasPrev = false;
  if (compareRef) {
    try {
      const prevCode = execSync(`git show ${compareRef}:game/portraits.js`, {
        cwd: ROOT,
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
      });
      prevMaps = loadPortraitsMaps(prevCode);
      hasPrev = true;
    } catch (err) {
      console.warn(`Warning: could not load ${compareRef}:game/portraits.js (${err.message}). Continuing without comparison ref.`);
    }
  }

  const manifest = fs.existsSync(DEFAULT_MANIFEST_FILE) ? loadManifest(DEFAULT_MANIFEST_FILE) : { fighters: {} };
  const keys = Object.keys(headMaps.photos);
  const report = {
    generatedAt: new Date().toISOString(),
    compareRef: hasPrev ? compareRef : null,
    totalFighters: keys.length,
    fighters: [],
  };

  for (const key of keys) {
    const headFullBuf = decodeDataUriJpeg(headMaps.photos[key]);
    const headHsBuf = decodeDataUriJpeg(headMaps.headshots[key]);
    const headFullDim = parseJpegDimensions(headFullBuf);
    const headHsDim = parseJpegDimensions(headHsBuf);

    fs.writeFileSync(path.join(outDir, 'head', `${key}_full.jpg`), headFullBuf);
    fs.writeFileSync(path.join(outDir, 'head', `${key}_headshot.jpg`), headHsBuf);

    let prevFullBytes = null;
    let prevHsBytes = null;
    let fullChanged = null;
    let headshotChanged = null;

    if (hasPrev && prevMaps.photos[key] && prevMaps.headshots[key]) {
      const prevFullBuf = decodeDataUriJpeg(prevMaps.photos[key]);
      const prevHsBuf = decodeDataUriJpeg(prevMaps.headshots[key]);
      prevFullBytes = prevFullBuf.length;
      prevHsBytes = prevHsBuf.length;
      fullChanged = sha256(headMaps.photos[key]) !== sha256(prevMaps.photos[key]);
      headshotChanged = sha256(headMaps.headshots[key]) !== sha256(prevMaps.headshots[key]);
      fs.writeFileSync(path.join(outDir, 'prev', `${key}_full.jpg`), prevFullBuf);
      fs.writeFileSync(path.join(outDir, 'prev', `${key}_headshot.jpg`), prevHsBuf);
    }

    const mEntry = manifest.fighters[key];
    const rawRel = mEntry ? path.relative(outDir, path.join(ROOT, mEntry.sourcePath)).replace(/\\/g, '/') : '';

    report.fighters.push({
      key,
      status: mEntry ? mEntry.status : 'unknown',
      locked: mEntry ? Boolean(mEntry.locked) : false,
      rawRel,
      headFull: { width: headFullDim.width, height: headFullDim.height, bytes: headFullBuf.length },
      headHs: { width: headHsDim.width, height: headHsDim.height, bytes: headHsBuf.length },
      prevFullBytes,
      prevHsBytes,
      fullDeltaBytes: prevFullBytes !== null ? headFullBuf.length - prevFullBytes : null,
      hsDeltaBytes: prevHsBytes !== null ? headHsBuf.length - prevHsBytes : null,
      fullChanged,
      headshotChanged,
    });
  }

  fs.writeFileSync(path.join(outDir, 'audit-report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');

  const rowsHtml = report.fighters
    .map((f) => {
      const changedBadge =
        f.fullChanged || f.headshotChanged
          ? `<span class="badge changed">CHANGED (${f.fullChanged ? 'Full' : ''}${f.fullChanged && f.headshotChanged ? '+' : ''}${f.headshotChanged ? 'HS' : ''})</span>`
          : `<span class="badge same">UNCHANGED</span>`;
      const prevFullCell = f.prevFullBytes !== null
        ? `<img src="prev/${f.key}_full.jpg" loading="lazy"><div class="meta">${(f.prevFullBytes / 1024).toFixed(1)} KB</div>`
        : `<div class="meta">N/A</div>`;
      const prevHsCell = f.prevHsBytes !== null
        ? `<img src="prev/${f.key}_headshot.jpg" loading="lazy"><div class="meta">${(f.prevHsBytes / 1024).toFixed(1)} KB</div>`
        : `<div class="meta">N/A</div>`;
      return `
      <div class="row">
        <div class="row-head">
          <strong>${f.key}</strong>
          ${changedBadge}
          <span class="meta">status=${f.status} | locked=${f.locked} | Full=${f.headFull.width}x${f.headFull.height} (${(f.headFull.bytes / 1024).toFixed(1)} KB${f.fullDeltaBytes !== null ? `, Δ${f.fullDeltaBytes >= 0 ? '+' : ''}${f.fullDeltaBytes}B` : ''}) | HS=${f.headHs.width}x${f.headHs.height} (${(f.headHs.bytes / 1024).toFixed(1)} KB${f.hsDeltaBytes !== null ? `, Δ${f.hsDeltaBytes >= 0 ? '+' : ''}${f.hsDeltaBytes}B` : ''})</span>
        </div>
        <div class="grid">
          <div class="cell"><div class="lbl">Raw Source</div>${f.rawRel ? `<img src="${f.rawRel}" loading="lazy">` : 'Missing'}</div>
          <div class="cell"><div class="lbl">Prev Full</div>${prevFullCell}</div>
          <div class="cell"><div class="lbl">HEAD Full</div><img src="head/${f.key}_full.jpg" loading="lazy"></div>
          <div class="cell"><div class="lbl">Prev Headshot</div>${prevHsCell}</div>
          <div class="cell"><div class="lbl">HEAD Headshot</div><img src="head/${f.key}_headshot.jpg" loading="lazy"></div>
        </div>
      </div>`;
    })
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Exceed Revival — 41-Fighter Portrait Audit</title>
<style>
  body { margin: 0; padding: 20px; background: #08090e; color: #e2e8f0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  h1 { margin: 0 0 8px; font-size: 18px; }
  .summary { color: #94a3b8; font-size: 13px; margin-bottom: 20px; }
  .row { border: 1px solid #1e293b; border-radius: 8px; padding: 12px; margin-bottom: 16px; background: #0f172a; }
  .row-head { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 10px; }
  .badge { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; }
  .badge.changed { background: #7c2d12; color: #fed7aa; }
  .badge.same { background: #1e293b; color: #94a3b8; }
  .meta { font-size: 12px; color: #94a3b8; }
  .grid { display: grid; grid-template-columns: repeat(5, minmax(140px, 1fr)); gap: 10px; align-items: start; }
  .cell { background: #08090e; border: 1px solid #1e293b; border-radius: 6px; padding: 6px; text-align: center; }
  .lbl { font-size: 11px; color: #cbd5e1; margin-bottom: 6px; }
  img { max-width: 100%; max-height: 240px; object-fit: contain; display: block; margin: 0 auto; }
</style>
</head>
<body>
  <h1>41-Fighter Portrait Audit (${compareRef || 'HEAD only'} → HEAD)</h1>
  <div class="summary">Generated ${report.generatedAt} • Changed Full: ${report.fighters.filter((f) => f.fullChanged).length} • Changed Headshots: ${report.fighters.filter((f) => f.headshotChanged).length}</div>
  ${rowsHtml}
</body>
</html>`;

  fs.writeFileSync(path.join(outDir, 'audit.html'), html, 'utf8');
  console.log(`Audit complete: ${report.totalFighters} fighters -> ${path.relative(ROOT, path.join(outDir, 'audit.html'))}`);
}

const args = parseArgs(process.argv.slice(2));

if (args.ingest) {
  const key = String(args.ingest);
  const rawSrc = args._[0];
  if (!rawSrc) {
    console.error('Usage: node scripts/import-portraits.mjs --ingest <key> <rawFilePath>');
    process.exit(1);
  }
  const absSrc = path.resolve(process.cwd(), rawSrc);
  if (!fs.existsSync(absSrc)) {
    console.error(`Missing raw file: ${absSrc}`);
    process.exit(1);
  }
  const ext = path.extname(absSrc).toLowerCase() || '.png';
  fs.mkdirSync(RAW_DIR, { recursive: true });
  const destAbs = path.join(RAW_DIR, `${key}${ext}`);
  fs.copyFileSync(absSrc, destAbs);

  const manifest = loadManifest(DEFAULT_MANIFEST_FILE);
  const prev = manifest.fighters[key] || {
    backdrop: { mode: 'auto', removeInteriorPockets: true, edgeDecontam: true, protectRects: [] },
    fullCrop: null,
    crop: null,
    fullHash: '',
    headshotHash: '',
    notes: '',
  };
  manifest.fighters[key] = {
    ...prev,
    sourcePath: `assets/portraits/raw/${key}${ext}`,
    status: 'unaudited',
    locked: false,
  };
  saveManifest(manifest, DEFAULT_MANIFEST_FILE);
  console.log(`Ingested ${key} -> assets/portraits/raw/${key}${ext} (status=unaudited, locked=false)`);
} else if (args.unlock && !args.apply) {
  const keys = parseKeyList(args.unlock);
  if (!keys.length) {
    console.error('Usage: node scripts/import-portraits.mjs --unlock <k1,k2>');
    process.exit(1);
  }
  const manifest = loadManifest(DEFAULT_MANIFEST_FILE);
  for (const k of keys) {
    if (!manifest.fighters[k]) throw new Error(`Unknown fighter key: ${k}`);
    manifest.fighters[k].locked = false;
  }
  saveManifest(manifest, DEFAULT_MANIFEST_FILE);
  console.log(`Unlocked: ${keys.join(', ')}`);
} else if (args.lock) {
  const manifest = loadManifest(DEFAULT_MANIFEST_FILE);
  const keys = args.lock === 'all' ? Object.keys(manifest.fighters) : parseKeyList(args.lock);
  if (!keys.length) {
    console.error('Usage: node scripts/import-portraits.mjs --lock <k1,k2|all>');
    process.exit(1);
  }
  const maps = loadPortraitsMaps(fs.readFileSync(PORTRAITS_FILE, 'utf8'));
  for (const k of keys) {
    if (!manifest.fighters[k]) throw new Error(`Unknown fighter key: ${k}`);
    if (!maps.photos[k] || !maps.headshots[k]) {
      throw new Error(`Missing portrait data in game/portraits.js for ${k}`);
    }
    manifest.fighters[k].fullHash = sha256(maps.photos[k]);
    manifest.fighters[k].headshotHash = sha256(maps.headshots[k]);
    manifest.fighters[k].status = 'approved';
    manifest.fighters[k].locked = true;
  }
  saveManifest(manifest, DEFAULT_MANIFEST_FILE);
  console.log(`Locked (${keys.length}): ${keys.join(', ')}`);
} else if (args['mark-needs-source']) {
  const keys = parseKeyList(args['mark-needs-source']);
  if (!keys.length) {
    console.error('Usage: node scripts/import-portraits.mjs --mark-needs-source <k1,k2>');
    process.exit(1);
  }
  const manifest = loadManifest(DEFAULT_MANIFEST_FILE);
  for (const k of keys) {
    if (!manifest.fighters[k]) throw new Error(`Unknown fighter key: ${k}`);
    manifest.fighters[k].status = 'needs-source';
    manifest.fighters[k].locked = false;
  }
  saveManifest(manifest, DEFAULT_MANIFEST_FILE);
  console.log(`Marked needs-source: ${keys.join(', ')}`);
} else if (args.audit) {
  const outDir = path.resolve(process.cwd(), String(args.out || '../.scratch/portrait-audit'));
  const compareRef = args['compare-ref'] ? String(args['compare-ref']) : 'adc29ad~1';
  runAudit(outDir, compareRef);
} else if (args['restore-from']) {
  const gitRef = String(args['restore-from']);
  const keys = parseKeyList(args.only);
  const part = String(args.part || 'both');
  if (!keys.length || !['full', 'headshot', 'both'].includes(part)) {
    console.error('Usage: node scripts/import-portraits.mjs --restore-from <gitRef> --only <k1,k2> [--part full|headshot|both]');
    process.exit(1);
  }
  const prevCode = execSync(`git show ${gitRef}:game/portraits.js`, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });
  const prevMaps = loadPortraitsMaps(prevCode);
  const photos = {};
  const headshots = {};
  for (const k of keys) {
    if (part === 'full' || part === 'both') {
      if (!prevMaps.photos[k]) throw new Error(`Missing FIGHTER_PHOTOS.${k} at ${gitRef}`);
      photos[k] = prevMaps.photos[k];
    }
    if (part === 'headshot' || part === 'both') {
      if (!prevMaps.headshots[k]) throw new Error(`Missing FIGHTER_HEADSHOTS.${k} at ${gitRef}`);
      headshots[k] = prevMaps.headshots[k];
    }
  }
  const unlockKeys = new Set(parseKeyList(args.unlock));
  updatePortraitsFile({ photos, headshots }, unlockKeys);
  console.log(`Restored (${part}) from ${gitRef} for: ${keys.join(', ')}`);
} else if (args.stage) {
  const onlyKeys = parseKeyList(args.only);
  const forceStage = Boolean(args['force-stage']);
  const runHeadless = Boolean(args['run-headless']);
  const { entries, skippedLocked } = resolveStageEntries(args.stage, onlyKeys, forceStage);
  if (skippedLocked.length) {
    console.log(`Skipped ${skippedLocked.length} locked fighter(s): ${skippedLocked.join(', ')}`);
  }
  if (!entries.length) {
    console.log('No unlocked fighters to stage.');
    process.exit(0);
  }
  const outDir = path.resolve(process.cwd(), String(args.out || '.playwright-cli/portrait-batch'));
  fs.mkdirSync(outDir, { recursive: true });
  const htmlPath = path.join(outDir, 'processor.html');
  const currentMaps = loadPortraitsMaps(fs.readFileSync(PORTRAITS_FILE, 'utf8'));
  fs.writeFileSync(htmlPath, buildProcessorHTML(entries, currentMaps, runHeadless), 'utf8');
  console.log(`Staged ${entries.length} portrait(s) at ${path.relative(ROOT, htmlPath)}`);

  if (runHeadless) {
    const outJson = path.join(outDir, 'results.json');
    if (fs.existsSync(outJson)) fs.unlinkSync(outJson);
    const chromeCandidates = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ];
    const browserBin = chromeCandidates.find((p) => fs.existsSync(p));
    if (!browserBin) {
      throw new Error('No headless Chrome/Edge binary found.');
    }

    let browserProc = null;
    let timeoutId = null;
    const server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/save') {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          fs.writeFileSync(outJson, body, 'utf8');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ saved: path.relative(ROOT, outJson) }));
          clearTimeout(timeoutId);
          console.log(`Headless processing complete -> ${path.relative(ROOT, outJson)}`);
          if (browserProc && !browserProc.killed) browserProc.kill();
          server.close(() => process.exit(0));
        });
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(htmlPath));
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const url = `http://127.0.0.1:${addr.port}/processor.html`;
      browserProc = spawn(
        browserBin,
        ['--headless=new', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=30000', url],
        { stdio: 'ignore' }
      );
      timeoutId = setTimeout(() => {
        console.error('Timed out waiting for headless portrait processing (45s).');
        if (browserProc && !browserProc.killed) browserProc.kill();
        server.close(() => process.exit(1));
      }, 45000);
    });
  } else if (args.serve) {
    const port = Number(args.port || 3099);
    const server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/save') {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          const outJson = path.join(outDir, 'results.json');
          fs.writeFileSync(outJson, body, 'utf8');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ saved: path.relative(ROOT, outJson) }));
        });
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(htmlPath));
    });
    server.listen(port, '127.0.0.1', () => {
      console.log(`Serving processor at http://127.0.0.1:${port}/processor.html`);
    });
  }
} else if (args.apply) {
  const resultsPath = path.resolve(process.cwd(), String(args.apply));
  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
  const unlockKeys = new Set(parseKeyList(args.unlock));
  updatePortraitsFile(results, unlockKeys);
  console.log(`Updated game/portraits.js (${Object.keys(results.photos || {}).length} full, ${Object.keys(results.headshots || {}).length} headshots).`);
} else {
  console.log(
    'Usage:\n' +
    '  node scripts/import-portraits.mjs --ingest <key> <rawFilePath>\n' +
    '  node scripts/import-portraits.mjs --unlock <k1,k2>\n' +
    '  node scripts/import-portraits.mjs --stage [manifestPath] [--only k1,k2] [--force-stage] [--out .playwright-cli/portrait-batch] [--serve --port 3099]\n' +
    '  node scripts/import-portraits.mjs --apply <results.json> [--unlock k1,k2]\n' +
    '  node scripts/import-portraits.mjs --lock <k1,k2|all>\n' +
    '  node scripts/import-portraits.mjs --mark-needs-source <k1,k2>\n' +
    '  node scripts/import-portraits.mjs --audit [--out ../.scratch/portrait-audit] [--compare-ref adc29ad~1]'
  );
  process.exit(1);
}

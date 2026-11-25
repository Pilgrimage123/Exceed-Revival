#!/usr/bin/env node
/**
 * Automated Portrait Ingestion Pipeline for Exceed
 * ------------------------------------------------
 * Prepares raw, uncropped, inconsistently named fighter uploads (RGBA PNGs,
 * white-matte images, or baked-checkerboard PNGs) into:
 *   1. Full-card portraits (`480px` wide JPEG -> FIGHTER_PHOTOS)
 *   2. Auto face/upper-center cropped headshots (`480x600` 4:5 JPEG -> FIGHTER_HEADSHOTS)
 *   3. A side-by-side QA contact sheet (`3:4` Card | `4:5` Bust | `1:1` HUD | `5:6` Token)
 *
 * Usage:
 *   node scripts/import-portraits.mjs --stage <manifest.json> [--out .playwright-cli/portrait-batch]
 *     manifest.json: [{ "key": "cammy", "src": "public/assets/aistudio/image_xxx.png", "crop": null }, ...]
 *     Then inspect processor.html + contact sheet via `playwright-cli`, extract `window.__PORTRAIT_RESULTS`
 *     to `<out>/results.json`, and run:
 *   node scripts/import-portraits.mjs --apply <out>/results.json
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const PORTRAITS_FILE = path.join(ROOT, 'game', 'portraits.js');

function parseArgs(argv) {
  const args = {};
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
    }
  }
  return args;
}

function mimeForPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}

function buildProcessorHTML(entries) {
  const embedded = entries.map((entry) => {
    const abs = path.isAbsolute(entry.src) ? entry.src : path.join(ROOT, entry.src);
    if (!fs.existsSync(abs)) {
      throw new Error(`Missing source image: ${entry.src}`);
    }
    const b64 = fs.readFileSync(abs).toString('base64');
    return {
      key: entry.key,
      crop: entry.crop || null,
      dataUrl: `data:${mimeForPath(abs)};base64,${b64}`,
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
  // Measure high-frequency neutral checkerboard alternation in a 10px cross
  let minL = 255, maxL = 0, neutral = 0, total = 0;
  for (let d = -10; d <= 10; d += 5) {
    for (const [nx, ny] of [[x + d, y], [x, y + d]]) {
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
  }
  if (requireAlternation) {
    return total >= 4 && neutral >= total - 1 && minL <= 232 && maxL >= 242 && (maxL - minL >= 18);
  }
  return total >= 4 && neutral >= total - 1 && (maxL - minL >= 18 || lum >= 244);
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
    if (mx - mn <= 18 && lum >= 242) whiteEdge++;
    if (isCheckerPixel(data, w, h, x, y, true)) checkerEdge++;
  };
  for (let x = 0; x < w; x += step) { checkPt(x, 0); checkPt(x, h - 1); }
  for (let y = 0; y < h; y += step) { checkPt(0, y); checkPt(w - 1, y); }
  if (transparentEdge / edgeSamples > 0.03) return 'alpha';
  if (checkerEdge / edgeSamples > 0.20) return 'checkerboard';
  if (whiteEdge / edgeSamples > 0.35) return 'white-matte';
  return 'opaque-dark';
}

function removeBackdrop(imgData) {
  const { data, width: w, height: h } = imgData;
  const mode = detectBackdropMode(data, w, h);
  if (mode === 'alpha' || mode === 'opaque-dark') return { imgData, mode };

  const total = w * h;
  const bg = new Uint8Array(total);
  const q = new Int32Array(total);
  let head = 0, tail = 0;

  const isBgPixel = (p) => {
    const i = p * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    const lum = r * 0.299 + g * 0.587 + b * 0.114;
    if (mode === 'white-matte') {
      return (sat <= 24 && lum >= 230) || (sat <= 34 && lum >= 242);
    }
    if (sat > 20) return false;
    const x = p % w, y = (p - x) / w;
    // Strict luminance threshold + local checkerboard confirmation protects smooth grey/white cloth folds
    return lum >= 238 || (lum >= 186 && isCheckerPixel(data, w, h, x, y, false));
  };

  const trySeed = (x, y) => {
    const p = y * w + x;
    if (!bg[p] && isBgPixel(p)) {
      bg[p] = 1;
      q[tail++] = p;
    }
  };

  // Seed outer border
  for (let x = 0; x < w; x++) { trySeed(x, 0); trySeed(x, h - 1); }
  for (let y = 0; y < h; y++) { trySeed(0, y); trySeed(w - 1, y); }

  // Seed enclosed interior pockets using genuine alternating checkerboard confirmation (safe on white cloth!)
  if (mode === 'checkerboard') {
    for (let y = 12; y < h - 12; y += 12) {
      for (let x = 12; x < w - 12; x += 12) {
        const p = y * w + x;
        if (!bg[p]) {
          // Require BOTH a ~195-225 grey square and ~245-255 white square nearby in neutral hues
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

  // Enclosed interior pure-white pocket removal for solid white-matte artwork.
  // Distinguishes flat #ffffff backdrop pockets (trapped between hair, limbs, and swirling aura ribbons)
  // from painted white cloth/teeth/eyes via pure-white core area and sharp dark/colored boundary contrast.
  if (mode === 'white-matte') {
    const visited = new Uint8Array(total);
    const compQ = new Int32Array(total);
    for (let startP = 0; startP < total; startP++) {
      if (bg[startP] || visited[startP]) continue;
      const si = startP * 4;
      const sr = data[si], sg = data[si + 1], sb = data[si + 2];
      if (sr < 248 || sg < 248 || sb < 248 || Math.max(sr, sg, sb) - Math.min(sr, sg, sb) > 6) continue;

      let ch = 0, ct = 0;
      visited[startP] = 1;
      compQ[ct++] = startP;
      let pureWhiteCount = 0;
      let borderTotal = 0;
      let borderSoftNeutral = 0;
      let borderDarkOrSaturated = 0;
      let borderDarkInk = 0;
      let borderLumSum = 0;
      let minCx = w, maxCx = 0, minCy = h, maxCy = 0;

      while (ch < ct) {
        const cp = compQ[ch++];
        const cx = cp % w;
        const cy = (cp - cx) / w;
        if (cx < minCx) minCx = cx;
        if (cx > maxCx) maxCx = cx;
        if (cy < minCy) minCy = cy;
        if (cy > maxCy) maxCy = cy;
        const ci = cp * 4;
        const cr = data[ci], cg = data[ci + 1], cb = data[ci + 2];
        if (cr >= 250 && cg >= 250 && cb >= 250 && Math.max(cr, cg, cb) - Math.min(cr, cg, cb) <= 5) {
          pureWhiteCount++;
        }
        const nbrs = [
          cx > 0 ? cp - 1 : -1,
          cx + 1 < w ? cp + 1 : -1,
          cy > 0 ? cp - w : -1,
          cy + 1 < h ? cp + w : -1,
        ];
        for (const np of nbrs) {
          if (np < 0 || bg[np] || visited[np]) continue;
          if (isBgPixel(np)) {
            visited[np] = 1;
            compQ[ct++] = np;
          } else {
            // Sample 2px outward from boundary to see if it fades into white cloth/skin highlight or hits ink/colored aura
            const nx = np % w, ny = (np - nx) / w;
            const sx = Math.max(0, Math.min(w - 1, nx + (nx - cx)));
            const sy = Math.max(0, Math.min(h - 1, ny + (ny - cy)));
            const bi = (sy * w + sx) * 4;
            const br = data[bi], bgc = data[bi + 1], bb = data[bi + 2];
            const bsat = Math.max(br, bgc, bb) - Math.min(br, bgc, bb);
            const blum = br * 0.299 + bgc * 0.587 + bb * 0.114;
            borderTotal++;
            borderLumSum += blum;
            if (bsat <= 20 && blum >= 180 && blum < 235) borderSoftNeutral++;
            if (blum < 165 || bsat >= 30) borderDarkOrSaturated++;
            if (blum < 120) borderDarkInk++;
          }
        }
      }

      const compArea = ct;
      const softNeutralFrac = borderTotal > 0 ? borderSoftNeutral / borderTotal : 0;
      const crispEdgeFrac = borderTotal > 0 ? borderDarkOrSaturated / borderTotal : 0;
      const darkInkFrac = borderTotal > 0 ? borderDarkInk / borderTotal : 0;
      const avgBorderLum = borderTotal > 0 ? borderLumSum / borderTotal : 255;
      // Only remove interior pure-white pockets that have genuine flat #ffffff cores, dark ink/outline
      // boundaries (protecting bright skin specular highlights and yellow flame cores), and non-cloth edges.
      const isPocket =
        pureWhiteCount >= 24 &&
        compArea >= 45 &&
        softNeutralFrac < 0.30 &&
        crispEdgeFrac > 0.55 &&
        (darkInkFrac >= 0.16 || (compArea >= 450 && avgBorderLum <= 178));

      if (isPocket) {
        for (let k = 0; k < ct; k++) bg[compQ[k]] = 1;
      }
    }
  }

  // Compute 1px and 2px distance from background for clean halo removal & white-matte decontamination
  const dist = new Uint8Array(total);
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

  for (let p = 0; p < total; p++) {
    const i = p * 4;
    if (bg[p]) {
      data[i + 3] = 0;
      continue;
    }
    if (dist[p] === 0) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const sat = mx - mn;
    const lum = r * 0.299 + g * 0.587 + b * 0.114;

    if (mode === 'white-matte') {
      if (dist[p] === 1) {
        if (sat <= 28 && lum >= 135) {
          const alpha = Math.max(0.06, Math.min(1, (234 - lum) / 99));
          data[i] = Math.max(0, Math.min(255, Math.round((r - (1 - alpha) * 255) / Math.max(alpha, 0.2))));
          data[i + 1] = Math.max(0, Math.min(255, Math.round((g - (1 - alpha) * 255) / Math.max(alpha, 0.2))));
          data[i + 2] = Math.max(0, Math.min(255, Math.round((b - (1 - alpha) * 255) / Math.max(alpha, 0.2))));
          data[i + 3] = Math.round(alpha * 255);
        } else if (mn >= 155) {
          // Pale white-contaminated colored aura/flame edge: recover vivid color and fade alpha cleanly
          const alpha = Math.max(0.12, Math.min(1, 1 - (mn - 145) / 108));
          data[i] = Math.max(0, Math.min(255, Math.round((r - (1 - alpha) * 255) / Math.max(alpha, 0.2))));
          data[i + 1] = Math.max(0, Math.min(255, Math.round((g - (1 - alpha) * 255) / Math.max(alpha, 0.2))));
          data[i + 2] = Math.max(0, Math.min(255, Math.round((b - (1 - alpha) * 255) / Math.max(alpha, 0.2))));
          data[i + 3] = Math.round(alpha * 255);
        }
      } else if (dist[p] === 2) {
        if (sat <= 22 && lum >= 195) {
          const alpha = Math.max(0.25, Math.min(1, (242 - lum) / 52));
          data[i] = Math.max(0, Math.min(255, Math.round((r - (1 - alpha) * 255) / Math.max(alpha, 0.35))));
          data[i + 1] = Math.max(0, Math.min(255, Math.round((g - (1 - alpha) * 255) / Math.max(alpha, 0.35))));
          data[i + 2] = Math.max(0, Math.min(255, Math.round((b - (1 - alpha) * 255) / Math.max(alpha, 0.35))));
          data[i + 3] = Math.round(alpha * 255);
        } else if (mn >= 195) {
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
  const cropH = Math.round(cropW * 1.25); // 4:5 (480x600)
  const cropX = Math.max(0, Math.min(w - cropW, Math.round(bestCx - cropW / 2)));
  // Anchor directly to detected face center bestCy (~34% down in 4:5 frame -> ~42.5% in 1:1 HUD)
  // so swirling background aura/flames touching y=0 never push the face toward the bottom of HUD squares.
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
  sheet.width = 900;
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
    const { imgData, mode } = removeBackdrop(rawData);
    wctx.putImageData(imgData, 0, 0);

    // 1. Full portrait (480px wide)
    const fullW = 480;
    const fullH = Math.round(work.height * (fullW / work.width));
    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = fullW;
    fullCanvas.height = fullH;
    const fctx = fullCanvas.getContext('2d');
    paintRadialBackdrop(fctx, fullW, fullH);
    fctx.drawImage(work, 0, 0, fullW, fullH);
    const fullEnc = encodeSafeJpeg(fullCanvas);
    photos[entry.key] = fullEnc.url;

    // 2. Headshot (480x600 4:5 auto-cropped unless explicit override provided)
    const crop = entry.crop || computeAutoHeadshotCrop(imgData);
    const hsCanvas = document.createElement('canvas');
    hsCanvas.width = 480;
    hsCanvas.height = 600;
    const hctx = hsCanvas.getContext('2d');
    paintRadialBackdrop(hctx, 480, 600);
    hctx.drawImage(work, crop.x, crop.y, crop.w, crop.h, 0, 0, 480, 600);
    const hsEnc = encodeSafeJpeg(hsCanvas);
    headshots[entry.key] = hsEnc.url;

    // 3. Draw Contact Sheet row: Full 3:4 | Headshot 4:5 | HUD 1:1 (top slice) | Token 5:6
    const ry = i * rowH + 16;
    sctx.fillStyle = '#9aa4bf';
    sctx.font = 'bold 14px monospace';
    sctx.fillText(entry.key + ' [' + mode + ' crop=' + crop.x + ',' + crop.y + ',' + crop.w + 'x' + crop.h + ']', 16, ry);
    // Card 3:4 (165x220)
    sctx.drawImage(fullCanvas, 0, 0, fullW, Math.min(fullH, Math.round(fullW * 4 / 3)), 16, ry + 10, 165, 220);
    // Headshot 4:5 (176x220)
    sctx.drawImage(hsCanvas, 0, 0, 480, 600, 200, ry + 10, 176, 220);
    // HUD 1:1 top slice (140x140)
    sctx.drawImage(hsCanvas, 0, 0, 480, 480, 400, ry + 10, 140, 140);
    // Token 5:6 (150x180)
    sctx.drawImage(hsCanvas, 0, 0, 480, 576, 565, ry + 10, 150, 180);

    meta.push({ key: entry.key, mode, crop, fullQuality: fullEnc.quality, hsQuality: hsEnc.quality });
  }

  window.__PORTRAIT_RESULTS = { photos, headshots, meta };
  document.getElementById('status').textContent = 'ready:' + ENTRIES.length;
})();
</script>
</body>
</html>`;
}

function updatePortraitsFile(results) {
  const src = fs.readFileSync(PORTRAITS_FILE, 'utf8');
  let next = src;

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
}

const args = parseArgs(process.argv.slice(2));
if (args.stage) {
  const manifestPath = path.resolve(process.cwd(), String(args.stage));
  const outDir = path.resolve(process.cwd(), String(args.out || '.playwright-cli/portrait-batch'));
  const entries = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  fs.mkdirSync(outDir, { recursive: true });
  const htmlPath = path.join(outDir, 'processor.html');
  fs.writeFileSync(htmlPath, buildProcessorHTML(entries), 'utf8');
  console.log(`Staged ${entries.length} portrait(s) at ${path.relative(ROOT, htmlPath)}`);
  if (args.serve) {
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
  updatePortraitsFile(results);
  console.log(`Updated game/portraits.js (${Object.keys(results.photos || {}).length} full, ${Object.keys(results.headshots || {}).length} headshots).`);
} else {
  console.log('Usage:\n  node scripts/import-portraits.mjs --stage <manifest.json> [--out .playwright-cli/portrait-batch] [--serve --port 3099]\n  node scripts/import-portraits.mjs --apply <results.json>');
  process.exit(1);
}

# AI Portrait Pipeline Playbook & Fighter Portrait Inventory

This document is an **operational playbook for the AI** when processing **Source Art** into **Fighter Portraits** (`FIGHTER_PHOTOS` **Full Portraits** and `480×600` `FIGHTER_HEADSHOTS` **Headshots** in `game/portraits.js`). For creating new or replacement **Source Art** (art direction, Cammy benchmark proportions, archetype scaling, AI prompt templates, and pre-ingestion QA), see [`docs/character-portrait-creation-guide.md`](./character-portrait-creation-guide.md). See `docs/adr/0010-manifest-locked-fighter-portrait-pipeline.md` for the architecture and `GLOSSARY.md` for canonical terminology.

---

## 1. Canonical Storage & Portrait Manifest

- **Immutable Source Art:** `assets/portraits/raw/<key>.<ext>` (all 41 fighters; runtime standees and UI art remain in `public/assets/aistudio/`).
- **Portrait Manifest:** `assets/portraits/manifest.json` (single source of truth for `sourcePath`, `status`, `locked`, `backdrop` controls, `fullCrop`/`crop` boxes, and SHA-256 `fullHash`/`headshotHash`).
- **Status lifecycle:**
  - `unaudited`: Not yet visually verified against **Source Art** (`locked: false`).
  - `approved`: Visually verified across all 4 UI aspect ratios (`3:4`, `4:5`, `1:1`, `5:6`) and locked (`locked: true` + SHA-256 hashes enforced by `npm test`).
  - `needs-source`: **Source-Damaged** fighter keeping its best available portrait while awaiting replacement **Source Art** (`locked: false`).

---

## 2. Pending Source Replacements

_Pending 41-fighter audit._ Any fighter classified as **Source-Damaged** during audit is marked `status: "needs-source"` in `assets/portraits/manifest.json` and tracked here:

| Key | Fighter | Issue Summary | Target Replacement |
| :--- | :--- | :--- | :--- |
| _(none yet — pending audit)_ | — | — | — |

---

## 3. What Went Wrong & Lessons Learned

1. **Baked checkerboards + white mattes break naive keying:**
   - Global brightness keying eats white shirts, belts, gi fabric, and aura lightning. Even border flood-fill must validate **local neutral alternating checkerboard periodicity** (`isCheckerPixel` in `scripts/import-portraits.mjs`) rather than keying smooth `lum >= 170` cloth folds.
2. **Enclosed flat white-matte interior pockets (`isFlatMatteInteriorPocket`):**
   - Outer-edge flood fill misses `#ffffff` background islands sealed off by raised arms, fans, guitars, wings, or halo rings, but aggressive interior pocket passes can also eat white garments or teeth if applied globally without `protectRects` or `removeInteriorPockets: false`.
3. **One asset must work cleanly across 4 UI aspect ratios (whole-face centering):**
   - `fighterSilhouette()` -> `fighterPhotoSrc()` feeds `3:4` Select cards (bottom ~23% darkened by `.fighter-card-scrim`), `5:6` Board tokens (mirrored via `scaleX(-1)`), `1:1` HUD thumbnails (`22–30px`, taking the top `480×480` slice of `480×600`), and `80px` Fighter Info modal busts.
4. **Literal `"NaN"` / `"undefined"` substrings inside Base64 JPEGs:**
   - `tests/howtoplay.test.ts`, `tests/strike-preview.test.ts`, and `tests/portraits.test.ts` assert zero `'NaN'` or `'undefined'` strings in rendered output. Stepping JPEG quality (`[0.87, 0.86, 0.88, 0.85, ...]`) eliminates it deterministically.
5. **Unchecked global re-processing caused silent regressions:**
   - Tweaking `removeBackdrop` for one fighter previously re-encoded or damaged other fighters without detection. Locking `approved` fighters in `assets/portraits/manifest.json` + `tests/portraits.test.ts` prevents silent drift.

---

## 4. Automated Pipeline & Portrait QA Gate (SOP)

1. **Ingest new Source Art (archives to `assets/portraits/raw/<key>.<ext>` and sets `status: "unaudited"`, `locked: false`):**
   ```bash
   node scripts/import-portraits.mjs --ingest <key> <rawFilePath>
   ```
2. **Unlock an existing `approved` fighter if repairing a Pipeline-Damaged portrait:**
   ```bash
   node scripts/import-portraits.mjs --unlock <key>
   ```
   Optionally tune per-fighter `backdrop` settings in `assets/portraits/manifest.json`:
   - `mode`: `'auto' | 'none' | 'alpha' | 'checkerboard' | 'white-matte'`
   - `removeInteriorPockets`: `boolean`
   - `edgeDecontam`: `boolean`
   - `protectRects`: `[{ "x": 0, "y": 0, "w": 100, "h": 100 }]` (keep-foreground boxes never erased or edge-decontaminated)
3. **Stage, auto-crop, and inspect the `Raw | Previous | New` diff contact sheet:**
   ```bash
   node scripts/import-portraits.mjs --stage --only <key> --out .playwright-cli/portrait-batch --serve --port 3099
   ```
   - `--stage` skips `locked: true` fighters by default (unless `--force-stage` is passed).
   - Open `http://127.0.0.1:3099/processor.html` via `playwright-cli`, save `window.__PORTRAIT_RESULTS` to `results.json` (or `POST /save`), and visually inspect `Raw Source | Prev Full | New Full (3:4) | Prev Headshot | New Headshot (4:5) | New HUD (1:1) | New Token (5:6)`.
4. **Apply, lock, and verify:**
   ```bash
   node scripts/import-portraits.mjs --apply .playwright-cli/portrait-batch/results.json
   node scripts/import-portraits.mjs --lock <key>
   npm run build && npm test && npm run lint
   ```
   - `--apply` **hard-fails** if `results.json` contains any `locked: true` fighter (unless `--unlock <keys>` is passed).
   - `--lock <key>` records SHA-256 `fullHash`/`headshotHash` and sets `status: "approved"`, `locked: true`.
5. **Run a full 41-fighter audit against any git ref:**
   ```bash
   node scripts/import-portraits.mjs --audit --out ../.scratch/portrait-audit --compare-ref adc29ad~1
   ```

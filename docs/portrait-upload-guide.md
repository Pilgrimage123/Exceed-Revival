# AI Portrait Pipeline Playbook & Replaced Fighter Inventory

This document is an **operational playbook for the AI** when processing future raw fighter art uploads. The user drops raw, uncropped, inconsistently named images (`image.png`, etc.) — **the AI owns fighter identification, background extraction, upper-center/face cropping, contact-sheet QA, and bundle integration.**

> **Workspace assumption:** No `.git` history is present after session compaction, so the inventory below reflects the verified current files in `game/portraits.js` and `public/assets/aistudio/` (prior overwritten artwork bytes are no longer on disk).

---

## 1. Replaced & Generated Fighter Graphics (41 Slots)

`FIGHTER_PHOTOS` (default full-body) and `FIGHTER_HEADSHOTS` (`480×600` zoomed headshots) in `game/portraits.js` are populated for all 41 fighters:

| Key | Fighter | Uploaded / Generated Source (`public/assets/aistudio/` or `src/assets/images/`) | Input Characteristics | `FIGHTER_PHOTOS` | `FIGHTER_HEADSHOTS` (`480×600`) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `ryu` | Ryu | `image_81c89d1e.png` | `1027×1531` solid white matte / alpha | 139 KB JPEG | 106 KB JPEG |
| `zangief` | Zangief | `image_69586153.png` | `1028×1530` baked grey/white checkerboard | 133 KB JPEG | 114 KB JPEG |
| `chunli` | Chun-Li | `image_9206acf7.png` | `1024×1535` baked grey/white checkerboard | 141 KB JPEG | 120 KB JPEG |
| `ken` | Ken | `image_c7e88ca9.png` | `1028×1529` baked grey/white checkerboard | 127 KB JPEG | 108 KB JPEG |
| `axl` | Axl Low | `image_c2c26411.png` | `1024×1535` baked grey/white checkerboard | 163 KB JPEG | 131 KB JPEG |
| `giovanna` | Giovanna | `image_0e8b2d7c.png` | `1007×1562` baked grey/white checkerboard | 159 KB JPEG | 115 KB JPEG |
| `cviper` | C. Viper | `image_b01ac92c.png` | `1033×1522` baked grey/white checkerboard | 118 KB JPEG | 105 KB JPEG |
| `cammy` | Cammy | `image_a0963f8a.png` | Solid white matte + enclosed aura pockets | 143 KB JPEG | 111 KB JPEG |
| `vega` | Vega | `image_01964528.png` | Solid white matte + white shirt/mask protection | 112 KB JPEG | 101 KB JPEG |
| `akuma` | Akuma | `image_bb301da6.png` | Baked grey/white checkerboard + aura pockets | 182 KB JPEG | 109 KB JPEG |
| `dan` | Dan | `dan_hibiki_portrait_1795612409135.jpg` | `848×1264` solid white matte + enclosed aura pockets + fringe decontam | 126 KB JPEG | 96 KB JPEG |
| `potemkin` | Potemkin | `potemkin_portrait_1795613188272.jpg` | `848×1264` solid white matte + enclosed aura pockets + helmet-centered crop | 130 KB JPEG | 95 KB JPEG |
| `ragna` | Ragna the Bloodedge | `ragna_portrait_1795614274925.jpg` | `848×1264` solid white matte + headroom-tuned crop | 138 KB JPEG | 123 KB JPEG |
| `jin` | Jin Kisaragi | `jin_portrait_1795614274376.jpg` | `848×1264` solid white matte | 167 KB JPEG | 110 KB JPEG |
| `noel` | Noel Vermillion | `noel_portrait_1795614433525.jpg` | `848×1264` solid white matte + beret headroom crop | 129 KB JPEG | 116 KB JPEG |
| `taokaka` | Taokaka | `taokaka_portrait_1795614274113.jpg` | `848×1264` solid white matte | 140 KB JPEG | 100 KB JPEG |
| `tager` | Iron Tager | `tager_portrait_1795614436018.jpg` | `848×1264` solid white matte | 164 KB JPEG | 121 KB JPEG |
| `nu13` | ν-No. 13 | `nu13_portrait_1795614435625.jpg` | `848×1264` solid white matte | 130 KB JPEG | 108 KB JPEG |
| `bang` | Bang Shishigami | `bang_portrait_1795614437805.jpg` | `848×1264` solid white matte | 159 KB JPEG | 105 KB JPEG |
| `hakumen` | Hakumen | `hakumen_portrait_1795614274555.jpg` | `848×1264` solid white matte + white armor protection | 167 KB JPEG | 116 KB JPEG |
| `platinum` | Platinum the Trinity | `platinum_portrait_1795614274410.jpg` | `848×1264` solid white matte | 177 KB JPEG | 111 KB JPEG |
| `testament` | Testament | `image_07476102.png` | `1025×1535` subtle off-white checkerboard + top-hat headroom crop | 204 KB JPEG | 135 KB JPEG |
| `leo` | Leo Whitefang | `leo_portrait_1795614273796.jpg` | `848×1264` solid white matte | 177 KB JPEG | 129 KB JPEG |
| `guile` | Guile | `image_26d39d3a.png` | `1083×1453` baked grey/white checkerboard + green-swirl interior pockets | 191 KB JPEG | 152 KB JPEG |
| `chipp` | Chipp Zanuff | `chipp_portrait_1795614440142.jpg` | `848×1264` solid white matte + hair headroom crop | 146 KB JPEG | 116 KB JPEG |
| `anji` | Anji Mito | `anji_portrait_1795614274179.jpg` | `848×1264` solid white matte | 152 KB JPEG | 107 KB JPEG |
| `may` | May | `may_portrait_1795614275059.jpg` | `848×1264` solid white matte | 155 KB JPEG | 104 KB JPEG |
| `ramlethal` | Ramlethal Valentine | `ramlethal_portrait_1795614275235.jpg` | `848×1264` solid white matte + white cloak protection + hat crop | 153 KB JPEG | 138 KB JPEG |
| `nagoriyuki` | Nagoriyuki | `nagoriyuki_portrait_1795614441329.jpg` | `848×1264` solid white matte + horns/dreads headroom crop | 119 KB JPEG | 114 KB JPEG |
| `baiken` | Baiken | `baiken_portrait_1795614273977.jpg` | `848×1264` solid white matte + white haori protection | 152 KB JPEG | 109 KB JPEG |
| `faust` | Faust | `faust_portrait_1795614274382.jpg` | `848×1264` solid white matte + lab-coat protection | 137 KB JPEG | 113 KB JPEG |
| `ino` | I-No | `ino_portrait_1795614273762.jpg` | `848×1264` solid white matte + witch-hat headroom crop | 134 KB JPEG | 94 KB JPEG |
| `jacko` | Jack-O | `jacko_portrait_1795614274277.jpg` | `848×1264` solid white matte + mask headroom crop | 147 KB JPEG | 122 KB JPEG |
| `happychaos` | Happy Chaos | `happychaos_portrait_1795614274145.jpg` | `848×1264` solid white matte + halo headroom crop | 140 KB JPEG | 121 KB JPEG |
| `zato1` | Zato-1 | `zato1_portrait_1795614274145.jpg` | `848×1264` solid white matte | 146 KB JPEG | 109 KB JPEG |
| `goldlewis` | Goldlewis Dickinson | `goldlewis_portrait_1795614274718.jpg` | `848×1264` solid white matte | 165 KB JPEG | 107 KB JPEG |
| `mbison` | M. Bison | `image_0b670002.png` | `1073×1466` subtle off-white checkerboard + enclosed flame pockets | 173 KB JPEG | 124 KB JPEG |
| `ky` | Ky Kiske | `image_68ecae23.png` | `1024×1536` solid white matte + hair-gap pockets + white cloak protection | 199 KB JPEG | 128 KB JPEG |
| `sagat` | Sagat | `image_b5a4cd27.png` | `1199×1312` subtle off-white checkerboard + enclosed flame pockets | 174 KB JPEG | 159 KB JPEG |
| `millia` | Millia Rage | `image_ae197dc9.png` | `985×1597` subtle off-white checkerboard + hair-gap pockets | 188 KB JPEG | 139 KB JPEG |
| `sol` | Sol Badguy | `image_7aa39be7.png` | `1052×1494` subtle off-white checkerboard + enclosed flame pockets | 200 KB JPEG | 144 KB JPEG |

**Unchanged roster slots:**
- **0 remaining legacy full-only slots** and **0 remaining SVG silhouettes:** All `41` fighters in `CHARACTERS` now have cleaned `FIGHTER_PHOTOS` full artwork and dedicated `480×600` `FIGHTER_HEADSHOTS` zoomed headshots.

---

## 2. What Went Wrong & Lessons Learned

1. **Baked checkerboards + white mattes break naive keying:**
   - 6 of 7 uploads had a flattened RGB checkerboard; `ryu` had an opaque white backdrop.
   - Global brightness keying eats white shirts, belts, gi fabric, and aura lightning. Even border flood-fill must validate **local neutral alternating checkerboard periodicity** (`isCheckerPixel` in `scripts/import-portraits.mjs`) rather than keying smooth `lum >= 170` cloth folds — otherwise white sleeves touching the frame edge (e.g., `giovanna`) erode.
2. **One asset must work cleanly across 4 UI aspect ratios:**
   - `fighterSilhouette()` -> `fighterPhotoSrc()` feeds `3:4` Select cards (bottom half darkened by `.fighter-card-scrim`), `5:6` Board tokens (mirrored via `scaleX(-1)`), `1:1` HUD thumbnails (`22–30px`), and `80px` Fighter Info modal busts.
   - `object-position: top center` keeps heads inside `1:1` HUD crops on full art, while `4:5` (`480×600`) headshots must anchor `cropY` to the **detected face center** (`bestCy - 0.34 * cropH`, so eyes sit ~42% down inside the top `480×480` `1:1` slice) rather than raw top-of-alpha (`y = 0`), because aura flames touching `y = 0` (e.g., `chunli`) pull top-anchored crops upward and clip the chin.
3. **Literal `"NaN"` / `"undefined"` substrings inside Base64 JPEGs:**
   - `tests/howtoplay.test.ts` and `tests/strike-preview.test.ts` assert zero `'NaN'` or `'undefined'` strings in rendered output. At ~120–160 KB per JPEG, Base64 randomly hits `"NaN"` occasionally; stepping JPEG quality (`[0.87, 0.86, 0.88, 0.85, ...]`) eliminates it deterministically.
4. **In-file portrait bloat slows inspection:**
   - Keeping ~5.3 MB of Base64 inline inside `game/render.js` stalled `grep` and truncated `view_file` reads. Extracting `FIGHTER_PHOTOS` and `FIGHTER_HEADSHOTS` into `game/portraits.js` (bundled before `render.js` in `scripts/build-game.mjs`) shrank `game/render.js` from `5.47 MB` to `126 KB`.

---

## 3. Ready-To-Run Automated Pipeline (AI SOP for Next Batch)

The repository now includes `game/portraits.js` + `scripts/import-portraits.mjs` so future uploads require **zero manual naming, framing, or pre-processing from the user**:

1. **AI visually identifies every raw upload** (via `view_file` if omitted from attachment context) and maps it to its exact `characterKey` in `game/cards.js`.
   - Write a batch manifest JSON with optional `fullCrop` / `crop` boxes normalized to **Ken (`ken`)** (`~30%` head-to-card height & waist-up cutoff for `FIGHTER_PHOTOS`; `~65%` head-to-box height & collarbone cutoff for `480×600` `FIGHTER_HEADSHOTS`):
     ```json
     [
       {
         "key": "cammy",
         "src": "public/assets/aistudio/image_xxx.png",
         "fullCrop": { "x": 40, "y": 25, "w": 940, "h": 1398 },
         "crop": { "x": 230, "y": 30, "w": 452, "h": 565 }
       }
     ]
     ```
3. **Stage, auto-crop, and inspect the 4-ratio contact sheet in one command:**
   - `node scripts/import-portraits.mjs --stage <manifest.json> --out .playwright-cli/portrait-batch --serve --port 3099`
   - Open `http://127.0.0.1:3099/processor.html` via `playwright-cli` (`file://` is blocked in headless Chromium, so always use `--serve`).
   - The browser canvas worker automatically:
     - Detects `alpha` (>25% border transparency) vs `checkerboard` (periodicity + enclosed-pocket guard) vs `white-matte` vs `opaque-dark`.
     - Computes **automated face / upper-center crop** (`computeAutoHeadshotCrop`) scoring skin-hue + facial detail variance + upper-center spatial prior (`y ∈ [minY, minY + 0.42 * fgH]`) so side kicks or companion creatures don't steal center X.
     - Composites onto the `#1c2438 → #08090e` radial gradient backdrop (via `drawCropped`, safely supporting negative/padded coordinates), encodes `480w` Full + `480×600` Headshot JPEGs with `NaN`/`undefined`-free quality stepping, `POST`s `/save` to `results.json`, and renders a `[3:4 Card | 4:5 Headshot | 1:1 HUD | 5:6 Token]` contact sheet.
   - Review the single contact-sheet screenshot; add `"fullCrop"` / `"crop": { "x", "y", "w", "h" }` to `manifest.json` for any frame that needs Ken-benchmark scale or headroom tuning.
4. **Apply & verify:**
   - Run `node scripts/import-portraits.mjs --apply .playwright-cli/portrait-batch/results.json`.
   - Update `CHANGELOG.md`, remove temporary `.playwright-cli/portrait-batch` artifacts, run `npm run build && npm test`, co-execute `compile_applet` + `lint_applet`, and run a quick `playwright-cli` smoke capture against `http://localhost:3000`.


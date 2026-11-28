# Character Portrait Creation Guide (Cammy Benchmark Model)

This guide defines the canonical visual style, anatomical proportions, framing safe-zones, AI prompting system, and pre-ingestion quality standards for creating **Source Art** in *Exceed Revival*. Every rule in this document is anchored to **Cammy** (`assets/portraits/raw/cammy.png`) — our gold-standard **Fighter Portrait** benchmark.

> **Companion Docs:**
> - **Operational Ingestion & Locking SOP:** [`docs/portrait-upload-guide.md`](./portrait-upload-guide.md) (CLI staging, 4-ratio diff sheets, `manifest.json` overrides, and hash locking)
> - **Pipeline Architecture:** [`docs/adr/0010-manifest-locked-fighter-portrait-pipeline.md`](./adr/0010-manifest-locked-fighter-portrait-pipeline.md)
> - **Canonical Terminology:** [`GLOSSARY.md`](../GLOSSARY.md) (`Source Art`, `Fighter Portrait`, `Full Portrait`, `Headshot`, `Portrait Manifest`, `Source-Damaged`, `Pipeline-Damaged`)

---

## 1. Why Cammy Is the Benchmark Model (And What Not to Replicate)

Cammy (`assets/portraits/raw/cammy.png`) is our reference model for **proportions, pose energy, ink weight, and lighting drama** across the 41-fighter roster — **not** a flawless cutout to copy blindly:

| Benchmark Metric | Cammy Actual Value | Why It Matters |
| :--- | :--- | :--- |
| **Raw Dimensions & Ratio** | `1027 × 1532 px` (`0.6704`, `~2:3` vertical) | Scales cleanly to `480 × 714` **Full Portrait** and `480 × 600` (`4:5`) **Headshot** with ample detail headroom. |
| **Backdrop Type** | Pure flat studio white (`#FFFFFF`) | Auto-detected cleanly as `white-matte` with zero baked checkerboard patterns. |
| **Manifest Recipe** | Default (`protectRects: []`, no `extraSeeds`, `fullCrop: null`, `crop: null`) | Demonstrates how clean `2:3` framing aligns natively with `scripts/import-portraits.mjs` — **yet** inspecting her dark-matte output reveals specific cutout artifacts we must prevent in all future portraits (see Section 1.5). |
| **4-Surface Survival** | Strong composition across `3:4`, `4:5`, `1:1`, and mirrored `5:6` | Face centers cleanly in the HUD square, bottom scrim lands over shorts/thighs, and left/right mirroring reads naturally. |
| **Visual Readability** | Crisp black ink contours + bold painterly lighting + dual-tone energy ribbons | Pops immediately against *Exceed Revival*'s dark radial card backdrop (`#1c2438` → `#08090e`) at both full card size (`230 × 300 px`) and tiny HUD scale (`22–36 px`). |

### 1.5 Cammy Cutout Artifact Post-Mortem — Defects Never to Replicate

Inspecting Cammy's processed **Full Portrait** (`480 × 714`) and zoomed **`4:5` Headshot** (`480 × 600`) against the dark `#1c2438 → #08090e` backdrop exposes **four concrete cutout defects** (plus two minor surface/framing flaws). Future portraits must adopt Cammy's proportions and visual punch while **explicitly designing out every error below**:

| # | Bad Cutout / Visual Artifact on Cammy | Exact Location on Processed Cammy | Root Cause in Automated Matting (`scripts/import-portraits.mjs`) | Mandatory Rule for Future Portraits |
| :-: | :--- | :--- | :--- | :--- |
| **1** | **Trapped `#FFFFFF` Background Islands (Enclosed Pockets)** | Glaring white triangles stuck between her left golden hair wisps, left braid, and red flames — and between her right braid, neck, and collar in the `480 × 600` Headshot. | Outer flood-fill cannot reach sealed pockets. `isFlatMatteInteriorPocket` / `isHairGapPocket` skip pockets bordered by bright blonde hair (`lum > 180`) or white-yellow fire (`darkInkFrac ≈ 0`) or smaller than `140 px`. | **Sculpt cohesive, closed hair locks** anchored cleanly against the neck/shoulders; forbid lacy flyaway hair webs and narrow `#FFFFFF` eyelets pinched between hair, limbs, and energy ribbons. |
| **2** | **Chalky White Fringe Halos on Flames & Pale Hair** | Bright white/chalky rims clinging to the outer edges of the red-orange flames (upper-left behind beret) and thin blonde hair strands against `#08090e`. | `edgeDecontam` only strips white spill within **`dist ≤ 2 px`**, and its warm-skin guard (`r > g && g >= b && (r - b) < 95`) skips golden-blonde hair and warm pale-orange flame fringes. | Paint outer energy ribbon edges with **deep, saturated opaque pigment or dark ink seals** (zero `>2 px` fade-to-white glows or white-hot outer borders); seal blonde/white hair tips with crisp dark ink contours. |
| **3** | **Border Bleed Risk on Light Details & White Garments** | Any pure-white cloth, bright metallic glint, or pale highlight touching `#FFFFFF` without an ink seal gets chewed inward (or forces `protectRects` hacks on fighters like Chun-Li, Giovanna, M. Bison). | `white-matte` flood-fill erases every border-connected pixel with `minRGB ≥ 243` and `sat ≤ 8`. | Shade all white garments well below pure white (`lum < 235`) and **seal 100% of the outer silhouette with unbroken dark ink (`1.5–2.5 px`)**. |
| **4** | **Stray Foreground Streaks & Extra Cutout Clutter** | Thin neon-green laser lines cutting across Cammy's olive tank top and shorts, plus `0 px` top headroom where the beret touches the upper edge and subtle AI crackle noise on skin/cloth in Headshot zoom. | Foreground laser scratches add visual noise; `0 px` headroom flattens the crown on `4:5` crops; "micro-pore" prompts trigger Voronoi skin/cloth crackle. | Keep **energy ribbons strictly 100% behind the fighter** (zero crossing streaks), leave **`2–4%` clean `#FFFFFF` top headroom**, and use **smooth painterly skin and clean cloth surfaces**. |

> [!IMPORTANT]
> **Critical Pipeline Boundary — Fighter Portraits vs. Arena Standees**
>
> - **Fighter Portraits (This Guide):** Include **signature dual-tone energy swirls** positioned **strictly behind** the character on a pure `#FFFFFF` backdrop, engineered with hard saturated/inked edges so they cut out cleanly onto `#08090e`.
> - **Arena Standees (`docs/standee-animation-lessons-learned.md`):** Strictly enforce `vfxPolicy: 'procedural_exceed_only'` (**zero baked-in VFX**), because standees deform on a `4×6` WebGL2 mesh and ignite procedural auras only in Exceed Mode.
>
> **Never** mix the two rulesets: portraits get cutout-safe energy ribbons strictly behind the figure; standees remain 100% VFX-free.

---

## 2. Visual Style Bible — The Cammy Formula

Whether painting by hand or steering an AI image generator, every new **Source Art** piece must match five core stylistic pillars observed in Cammy's portrait.

### 2.1 Linework, Ink Contour Seal & Pocket-Free Silhouette Discipline
- **Unbroken Weighted Outer Silhouette Ink (`1.5–2.5 px` at `1024 px` width):** Every boundary where the fighter meets `#FFFFFF` — headgear, hair locks, shoulder deltoids, gauntlets, garments, weapons, and legs — must be sealed by a crisp, continuous dark charcoal-black ink contour. This gives the portrait unmistakable arcade punch and gives `edgeDecontam` (`dist ≤ 2 px`) a hard stop line with zero white fringe bleed.
- **Fine Internal Detail Ink (`0.5–1.0 px`):** Secondary linework carves facial features (eyelashes, brow ridge, nose bridge, scars), hair lock overlaps, muscle separation, garment seams, and knuckle ridges without turning the image into flat cel-art.
- **Zero Lacy Flyaway Loops (Cutout Pocket Prevention):** Never paint loose, spiderweb-like flyaway hair strands looping out over the white backdrop or crossing over background flames. Sculpt hair into **cohesive, solid tapering locks** anchored cleanly against the head, neck, and shoulders so zero tiny `#FFFFFF` triangles get trapped inside hair gaps.
- **No Soft Painterly Fade-Outs at the Silhouette:** Never let skin, fabric, hair, or energy blur softly into `#FFFFFF` over more than `1–2 px`.

### 2.2 Smooth Painterly Shading & Clean Surface Craft
Match Cammy's rich comic-painterly depth while **eliminating** the AI Voronoi crackle and scaly texture artifacts visible on Cammy's forehead, deltoids, thighs, beret, and tank top:
- **Smooth Painterly Skin:** Rich, warm dimensional color gradients, clean athletic muscle planes (clavicles, deltoids, obliques, quadriceps), and crisp specular highlights along high planes. **Never** prompt for "skin pores", "micro-pored", or "weathered skin texture" — on comic-inked illustrations, diffusion models render those cues as cracked dried-mud or reptilian scale noise.
- **Clean, Supple Fabric & Cloth:** Render shirts, hats, cloaks, and shorts with crisp tension folds, clean seam stitching, and bold directional shading — avoiding noisy weave/crackle patterns. Shade white/ivory garments cleanly below pure white (`lum < 235`) and seal every outer edge in dark ink.
- **Leather, Metal & Emblems:** Render gauntlets, belts, buckles, and armor plates with clean specular highlights and bold, legible geometric emblems (avoid tiny garbled filigree).
- **Cohesive Sculpted Hair:** Render hair as lush, volumetric ribbon-like locks with rich internal strand highlights and solid dark shadow backing — never detached wispy threads floating against `#FFFFFF`.

### 2.3 Lighting & Color Architecture
- **Three-Part Studio Lighting Rig:**
  1. **Warm Golden Key Light (Upper Front-Side):** Illuminates the forehead, bridge of the nose, front deltoid, torso, and upper thighs with warm directional contrast.
  2. **Deep High-Contrast Shadow Core:** Grounds the underside of headgear, neck hollow, under-bicep curves, and ribcage with rich dark shadows (never muddy flat grey).
  3. **Chromatic Energy Rim Light:** Vivid highlights matching the background energy hues trace the outer contour of the fighter's shoulders, forearms, jaw, and thighs.
- **Palette Discipline:** Pair a grounded, recognizable character costume palette (2–3 dominant costume hues) against **two high-saturation contrasting energy hues** so the portrait vibrates cleanly once composited onto the dark `#1c2438 → #08090e` game card background.

### 2.4 Facial Proportions, Expression & Gaze
- **Semi-Realistic Fighting-Game Hybrid:** Slightly heightened heroic features — sharp, focused eyes (`~1.15×` realistic scale) with intensely saturated irises and crisp white specular catchlights, defined cheekbones, subtle signature markings (freckles/scars), and natural lips. Avoid both overly cartoonish moe/chibi proportions (unless adapted via the Petite archetype below) and stiff photographic uncanny-valley realism.
- **Fighter-Select Eye Contact:** Slight downward chin tuck (`5–10°`) with eyes locked directly onto the viewer. This creates immediate confrontation energy and keeps the brow, eyes, and jawline legible even when scaled down to a `22 px` HUD thumbnail.
- **Unobstructed Face Rule:** Never allow hair bangs, raised fists, weapons, or energy ribbons to cover both eyes or obscure the nose/mouth triangle.

### 2.5 Cutout-Safe Dual-Tone Energy Swirl Grammar
Background energy ribbons are the **#1 source of bad cutout halos and trapped white islands** if painted carelessly. Enforce four strict cutout rules:
- **Strictly 100% Behind the Fighter (Zero Crossing Streaks):** All energy ribbons must sweep **completely behind** the fighter's head, torso, arms, and legs. **Never** paint stray laser streaks or accent lines cutting across the chest, abs, shorts, or face — behind-only layering keeps the character silhouette clean and eliminates extraneous cutout intersections.
- **Saturated or Ink-Sealed Outer Edges (Zero White-Hot Borders):** Every outer edge of a flame, lightning arc, or plasma ribbon touching `#FFFFFF` must end in **deep, high-saturation pigment** (e.g., deep crimson, rich emerald, vivid cobalt, dark amber) or a crisp dark ink stroke — **never** a white-hot core or pale yellow-white aura bleeding directly into `#FFFFFF`. Bright inner cores may appear *only* inside the center of a ribbon, completely wrapped by dark saturated outer bands.
- **Zero Fog, Mist, or Wide Glow Blooms (`≤ 2 px` Edge Transition):** Paint energy ribbons as bold, opaque calligraphic brush strokes with razor-sharp edges. Any translucent smoke, outer airbrush glow, or white-blended gradient wider than `2 px` exceeds `edgeDecontam`'s reach and leaves a permanent chalky white halo against `#08090e`.
- **Zero Pinched White Eyelets Between Ribbons & Hair/Limbs:** Curve ribbons cleanly around the silhouette without weaving narrow, sealed `#FFFFFF` pockets between the ribbon edge and hair strands, braids, necks, or elbows. Where a ribbon passes closely behind hair or arms, overlap it solidly behind the body so no tiny white gaps remain trapped.

---

## 3. Proportions, Framing & 4-Surface Safe-Zone Blueprint

Every **Source Art** asset is a single `2:3` vertical image (`1024 × 1536 px` target; minimum `848 × 1264 px`) that must survive **four different UI aspect ratios** simultaneously without manual per-fighter cropping.

### 3.1 Cammy's Normalized Vertical Proportion Ruler

```text
0%   ┌───────────────────────────────┐ ◄── Top Edge (2–4% clean #FFFFFF margin; crown NEVER touches 0px)
2%   │        [ BERET / CROWN ]      │
14%  ├───────────────────────────────┤ ◄── Brow / Hairline
     │     ╔═══════════════════╗     │ ──┐
21%  ├─────╢  ●  EYE LINE  ●   ╟─────┤   │  AUTO-HEADSHOT TARGET ZONE (relY ≈ 0.21)
     │     ║  (1:1 HUD Center) ║     │   │  computeAutoHeadshotCrop() centers face here
32%  ├─────╨─────[ CHIN ]──────╨─────┤   │  with 34% headroom above eye center.
34%  ├───────────────────────────────┤   │
     │   [LEAD]   SHOULDERS  [REAR]  │   ├─► 1:1 HUD TOP SLICE (480×480 of Headshot)
     │   [FIST]   & COLLAR   [BRAID] │   │   Rendered at 22–36px in match HUD
50%  ├───────────────────────────────┤ ──┘
     │        UPPER TORSO /          │
     │     RIBCAGE & GUARD ARMS      │ ──► 4:5 HEADSHOT (480×600) & 5:6 PLAQUE
62%  ├───────────────────────────────┤     Bottom edge of Headshot ends ~58–68%
     │        WAIST / NAVEL          │
68%  ├───────────────────────────────┤ ──┐
     │      BELT / HIPS / SHORTS     │   │  3:4 FIGHTER SELECT CARD (230×300)
78%  ├ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤   │  .fighter-card-scrim darkens bottom 22%
     │   UPPER / MID-THIGH CROP      │   │  at rest (38% on hover) for Name + Blurb.
100% └───────────────────────────────┘ ──┘  Bottom Edge: clean mid-thigh termination
```

### 3.2 Exact Measurements from Cammy's Benchmark Framing

| Landmark | Target Vertical Band (`%` of Height) | Horizontal Alignment (`%` of Width) | Pipeline / UI Impact |
| :--- | :--- | :--- | :--- |
| **Top of Head / Headgear** | `2% – 14%` (improved from Cammy's `0.5%`) | Centered (`32% – 72%`) | Leaves `2–4%` clean `#FFFFFF` headroom so the crown/hat never clips flat at `y = 0` in `4:5` Headshots. |
| **Eyes & Face Center** | `18% – 25%` (Eye line at `~21–23%`) | Centered (`44% – 58%`) | Hits the exact peak of `computeAutoHeadshotCrop()`'s vertical prior (`relY = 0.21`) and horizontal center prior (`0.50`). |
| **Chin & Jawline** | `30% – 33%` | Centered (`46% – 56%`) | Guarantees the entire head + collar fits inside the `1:1` HUD top slice (`480 × 480`). |
| **Shoulders & Guard Fists** | `34% – 58%` | Wide frame (`5% – 96%`) | Gives the `4:5` Headshot and `5:6` Board Plaque dynamic fighting-stance energy without blocking the face. |
| **Waist & Midriff / Torso Core** | `58% – 68%` | Centered (`36% – 74%`) | Visible cleanly above the Fighter Select card title scrim. |
| **Hips, Belt & Upper Thighs** | `68% – 100%` | Grounded stance (`12% – 96%`) | Absorbs the bottom `22–38%` `.fighter-card-scrim` on Fighter Select cards so text never covers key anatomy or face. |

### 3.3 How One Portrait Feeds All 4 In-Game UI Surfaces

| UI Surface | CSS / Canvas Spec | Source Map Used | Framing Requirement |
| :--- | :--- | :--- | :--- |
| **Fighter Select Card** | `230 × 300 px` (`~3:4`), `object-fit: cover; object-position: top center` | `FIGHTER_PHOTOS` (`480 × 714` default) or `FIGHTER_HEADSHOTS` (Headshot mode) | Top-anchored crop shows crown through hips/upper thighs; bottom `22%` darkened at rest (`38%` on hover) by `.fighter-card-scrim` for fighter name & blurb. |
| **Headshot View / Info Modal** | `480 × 600 px` (`4:5`), modal bust rendered at `80 px` wide | `FIGHTER_HEADSHOTS` | Auto-cropped to `42%–72%` of source width around detected face center (`bestCy - cropH * 0.34`). Must include complete head, headgear, neck, and upper shoulders. |
| **HUD Life Panel Avatar** | `1:1` square (`36 px` desktop / `22–30 px` compact), top `480 × 480` slice of Headshot | `FIGHTER_HEADSHOTS` / `FIGHTER_PHOTOS` | Eyes and face must remain centered horizontally and sit in the upper-middle third so the square crop never slices the chin or forehead. |
| **Arena Board Plaque Token** | `5:6` framed plaque (`--plaque-w × --plaque-h`), **horizontally mirrored via `scaleX(-1)`** when facing left | `FIGHTER_HEADSHOTS` / `FIGHTER_PHOTOS` | Pose must read naturally when flipped left-to-right; avoid asymmetric text, legible letters on clothing, or extreme side profiles. |

### 3.4 Pose & Mirror-Resilience Rules
- **3/4 Heroic Stance:** Angle the torso `15–30°` off-axis while turning the head back toward the camera for direct eye contact (just like Cammy's raised lead gauntlet + angled hips).
- **Hands Frame, Never Hide:** Position fists, claws, or grips beside the shoulders/chest (`x < 35%` or `x > 65%`, or below the chin `y > 35%`) so the face and jawline remain 100% open.
- **The Horizontal Flip Test:** Mentally or visually mirror the raw image horizontally (`scaleX(-1)`). Any fighter who looks awkward, off-balance, or displays backwards lettering on badges/hats fails the Arena Plaque check.

---

## 4. Roster Archetype Scaling Matrix

*Exceed Revival* spans **41 fighters** across *Street Fighter*, *Guilty Gear*, and *BlazBlue*. Do **not** force Zangief, May, or Axl into Cammy's exact waist/shoulder anatomy — instead, **lock Cammy's rendering style, `#FFFFFF` backdrop, and `18–25%` eye-line band**, while scaling silhouette width and crop terminus per archetype:

| Parameter | 1. Standard / Athletic *(Benchmark)* | 2. Heavyweight / Grappler | 3. Petite / Agile | 4. Weapon / Prop-Heavy |
| :--- | :--- | :--- | :--- | :--- |
| **Roster Examples** | **Cammy**, Ryu, Chun-Li, Ken, Ky, Sol, Giovanna, C. Viper, Guile, Vega, Jin, Noel, Millia, Chipp, Anji | **Zangief**, Potemkin, Tager, Goldlewis, Sagat, M. Bison, Leo, Nagoriyuki, Hakumen | **May**, Platinum, Taokaka, Jack-O', Dan, Bang, Happy Chaos | **Axl**, Faust, Ramlethal, Testament, Baiken, I-No, Nu-13, Ragna, Zato-1 |
| **Vertical Crop Terminus** | **Mid-thigh up** (`100%` at upper/mid thigh) | **Upper-thigh to hip-up** (wider torso fills horizontal width earlier) | **Mid-thigh up** (matching Cammy so figure fills the `2:3` card generously) | **Mid-hip to upper-thigh up** (leaves vertical budget for prop arcs) |
| **Eye-Line Safe Zone** | **`20% – 24%`** from top | **`18% – 24%`** from top (keep head slightly smaller relative to massive traps/delts, never push eyes below `26%`) | **`22% – 26%`** from top (allows hats/ears/hoods like May's pirate hat or Taokaka's hood in `0–18%`) | **`19% – 24%`** from top (never push face down below `26%` to make room for an overhead weapon) |
| **Head Width vs. Canvas** | `~22% – 26%` of canvas width | `~18% – 22%` (massive traps, shoulders, and fists span `92–98%` of width) | `~24% – 28%` (youthful proportions with slightly larger expressive eyes) | `~20% – 24%` (weapon silhouette arcs cleanly behind shoulders/head) |
| **Signature Pose Formula** | 3/4 dynamic combat guard; lead fist forward, chin tucked, intense forward stare | Forward-leaning power roar or clenched-fists grapple surge; massive deltoids framing chest | Energetic tilted stance or over-the-shoulder prop hold; expressive grin or sharp focus | Weapon angled diagonally **behind** shoulders or held cleanly to one side; foreground hand adds foreshortened depth (like Axl's chain) |
| **Energy Ribbon Strategy** | S-curve dual-tone ribbons sweeping behind shoulders, waist, and gauntlets | Heavy radial shockwave arcs + floating rock debris/sparks orbiting the wide silhouette | Sweeping playful elemental arcs (water, starlight, wind) echoing hair/coat flow | Circular halo or braided ribbon trails linking weapon tip to foreground hand |
| **Matting & Cutout Hazards** | **Blonde/light hair + bright fire** (as seen on Cammy): avoid wispy hair loops and tight `#FFFFFF` gaps between braids, neck, and ribbons; seal outer hair and ribbon edges darkly. | Wide shoulders can touch side edges cleanly; avoid enclosed `#FFFFFF` eyelets tucked under raised forearms or between fists and flaming shockwaves. | Large hats/hoods + flowing hair easily trap small `#FFFFFF` pockets — keep hair silhouettes solid/cohesive with dark backing and zero lacy detached strands. | **Highest cutout risk:** chains, scythes, guitars, anchors, and floating swords trap enclosed `#FFFFFF` loops — keep weapon silhouettes bold/ink-sealed and back narrow gaps solidly with saturated energy. |

### Archetype Adaptation Notes
- **Heavyweights (Zangief / Potemkin / Tager / Goldlewis):** Let their immense shoulders and forearms press close to the left and right canvas edges (`2–98%` width) to communicate sheer mass, while keeping the head squarely centered near `20%` Y so the `1:1` HUD square still reads as an unmistakable portrait rather than a chest crop.
- **Petite / Agile (May / Platinum / Taokaka / Jack-O'):** Never shrink the character to half the canvas height just because they are canonically short. Fill the `2:3` frame from head-to-mid-thigh just like Cammy, expressing their petite build through slightly larger eye-to-face ratio, narrower shoulders, oversized attire/hats, and buoyant posture.
- **Weapon / Prop-Heavy (Axl / Ramlethal / Faust / Testament):** Treat the weapon as a **framing arch behind or flanking the torso** (see May's anchor or Axl's sickle-chain). Never let a sword blade, hat brim, or guitar neck slice horizontally across the eyes or nose, and back enclosed chain/weapon loops with solid saturated energy ribbons or dark ink shadow so the backdrop remover does not leave floating `#FFFFFF` islands.

---

## 5. AI Image Generation Playbook & Modular Prompt Templates

To reproduce Cammy's exact visual DNA reliably across image generation models, build every prompt from **5 modular blocks**. Never edit the Style Lock or Backdrop/Technical blocks lightly — swap only the Archetype Frame, Fighter Identity, and Dual-Tone Energy blocks.

### 5.1 The 5-Block Master Prompt Architecture

```text
[BLOCK 1: MASTER STYLE LOCK — KEEP INVARIANT]
High-craft arcade fighting-game character portrait illustration matching modern Capcom/Street Fighter comic-painterly realism. Bold, unbroken crisp charcoal-black ink outer silhouette contours sealing every outer edge (skin, hair, white clothing, weapons) with fine internal anatomical and seam ink detail, combined with richly shaded smooth painterly rendering: clean smooth athletic skin with crisp specular highlights (zero pore noise or crackle), clean supple cloth folds, ribbed stitched leather, brushed metal, cohesive sculpted hair locks anchored cleanly without loose wispy flyaways, dramatic warm golden directional key lighting, deep high-contrast shadows, and vivid colored rim highlights along the body edges.

[BLOCK 2: ARCHETYPE CAMERA & PROPORTION FRAME — SELECT FROM MATRIX]
Vertical 2:3 portrait framing (1024x1536), mid-thigh-up heroic three-quarter combat stance, top of head/headgear sitting neatly 2-4% below the top edge with clean white margin above (never touching or clipping the top border), eyes centered horizontally and positioned at 21% from the top of the frame, direct intense forward eye contact with the viewer, clean unobstructed face and jawline, hands and weapon framing torso without covering the face.

[BLOCK 3: FIGHTER IDENTITY, ANATOMY & MATERIALS — CUSTOMIZE PER FIGHTER]
<Character name/archetype, facial features, expression, eye color, cohesive hair style, authentic costume materials (any white clothing shaded warm-ivory/cool-grey below pure white and sealed in dark ink), and signature combat pose.>

[BLOCK 4: CUTOUT-SAFE DUAL-TONE ENERGY RIBBONS (STRICTLY BEHIND) — CUSTOMIZE 2 HUES]
Dynamic high-saturation dual-tone painterly energy ribbons (<PRIMARY COLOR + ELEMENT> and <SECONDARY ACCENT COLOR + ELEMENT>) swirling strictly 100% BEHIND the fighter's shoulders, arms, and hips in a bold calligraphic S-curve, with ZERO energy streaks crossing in front of the chest, torso, legs, or face. Paint ribbon outer edges with deep saturated opaque pigment and crisp hard edges (zero white-hot outer borders, zero foggy white haze, zero wide airbrushed glow fading into white) and zero narrow trapped white background gaps pinched between hair, limbs, and energy ribbons.

[BLOCK 5: PIPELINE-SAFE BACKDROP & TECHNICAL CONSTRAINTS — KEEP INVARIANT]
Isolated cleanly on a pure solid flat white (#FFFFFF) studio background designed for razor-sharp automated cutout onto a dark background. No environment, no grey studio gradient, no drop shadow on the background, no checkerboard transparency grid, no wispy detached hair loops trapping white gaps, no text, no logos, no watermarks, no frame borders.
```

### 5.2 Mandatory Negative Prompt Guardrails

Always supply these exclusions (either in the model's negative-prompt field or appended as a strict `AVOID:` clause):

```text
AVOID: baked transparency checkerboard pattern, grey-and-white grid background, grey or dark gradient background, scenic environment background, trapped white background islands between hair strands/braids/neck/ribbons, wispy spiderweb flyaway hair loops, chalky white fringe halos around flames or hair, white-hot flame edges touching white background, soft cloudy white mist or wide outer glow blooms fading into white, energy streaks or laser lines crossing in front of the torso/chest/legs/face, cracked skin, Voronoi crackle texture, scaly fabric, pore noise, full-body zoomed-out shot, top of head touching or clipped by top border, face positioned below upper third, extreme side profile, hands or weapons blocking eyes or mouth, flat anime cel-shading, plastic 3D CGI render, soft lineless edges bleeding into white, extra fingers, distorted anatomy, mirrored/illegible text on clothes, watermarks, UI frames, card borders.
```

> [!WARNING]
> **Using `cammy.png` as a Multimodal Image Reference (`ImagePaths`) Safely**
>
> When passing `assets/portraits/raw/cammy.png` as a reference image to lock proportions, ink weight, and lighting contrast, **always prepend this explicit anti-inheritance override** to your prompt so the generator does **not** copy Cammy's cutout artifacts:
>
> ```text
> Use the attached reference image ONLY for heroic 2:3 mid-thigh proportions, eye-line height (~21%), weighted black outer ink contours, and warm-key/chromatic-rim lighting contrast. DO NOT replicate its cutout defects or surface flaws: keep hair in solid cohesive locks with zero loose wispy flyaway loops trapping white background gaps, keep all energy ribbons strictly behind the body with deep saturated outer edges and zero white-rimmed flame halos, zero laser streaks crossing the torso, leave 2-4% clean white margin above the crown, and render smooth clean painterly skin and cloth with zero crackle or pore noise.
> ```

---

### 5.3 Ready-to-Use Archetype Starter Templates

#### Template A — Standard / Athletic (Cammy-Calibrated, Cutout-Safe)
Use as a verified baseline for Ryu, Chun-Li, Ken, Ky, Sol, Giovanna, C. Viper, Guile, Vega, Jin, Noel, Millia, Chipp, Anji, or a future Cammy refresh by swapping the bracketed `<SLOTS>`.

```text
High-craft arcade fighting-game character portrait illustration in comic-painterly realism: bold unbroken charcoal-black ink outer silhouette contours sealing every edge and fine internal detail ink paired with richly shaded smooth painterly rendering, clean smooth athletic skin with crisp specular highlights (zero pore noise or crackle), clean supple fabric folds, stitched ribbed leather, cohesive sculpted hair locks anchored cleanly with zero loose wispy flyaway loops, and high-contrast warm golden studio key lighting with vivid chromatic rim light. Vertical 2:3 composition, mid-thigh-up heroic three-quarter combat guard stance, top of headgear sitting 2-4% below the top border with clean white margin above (never clipped), eyes centered horizontally at 21% from top, chin slightly tucked with intense direct forward eye contact. <FIGHTER NAME & DESCRIPTION: facial features, piercing eyes with crisp catchlights, cohesive sculpted hairstyle, authentic fitted tactical/martial attire (any white cloth shaded below pure white and sealed in dark ink), coiled fighting guard framing the torso without blocking the face.> Dynamic high-saturation dual-tone calligraphic energy ribbons of <PRIMARY ELEMENTAL COLOR> and <SECONDARY ACCENT COLOR> swirling strictly 100% BEHIND the shoulders, arms, and hips with zero streaks crossing in front of the torso, painted with deep saturated opaque outer edges, crisp hard strokes, and zero trapped white background gaps between hair, limbs, and ribbons. Isolated cleanly on a pure solid flat white (#FFFFFF) background for dark-matte cutout. No checkerboard grid, no grey backdrop gradient, no white outer glow halos or foggy mist, no wispy hair webs, no cracked skin texture, no background scenery, no text, no watermarks.
```

#### Template B — Heavyweight / Grappler (Zangief / Potemkin / Tager / Goldlewis)
Shifts vertical crop slightly higher (upper-thigh/hips), widens deltoids and fists to `~95%` width, anchors the head near `20%` Y, and prevents trapped white gaps beneath massive raised forearms.

```text
High-craft arcade fighting-game character portrait illustration in comic-painterly realism: bold unbroken charcoal-black ink outer silhouette contours sealing every edge and fine internal detail ink paired with richly shaded smooth painterly rendering, sculpted muscular skin with clean anatomical planes and crisp highlights (zero Voronoi crackle or noisy pore texture), clean rugged leather/metal/fabric folds, and dramatic warm directional key lighting with intense chromatic rim highlights. Vertical 2:3 composition, upper-thigh-to-hips powerhouse three-quarter grapple stance, massive shoulders and coiled forearms filling 90-95% of frame width, top of head/hair/helmet sitting 2-4% below top border with clean white margin above (never clipped), eyes centered horizontally at 20% from top, fierce roaring or iron-willed forward eye contact with unobstructed face. <FIGHTER NAME & DESCRIPTION: colossal broad-shouldered grappler, facial features/beard/helmet, signature wrestling singlet or heavy armored coat (any white trim shaded below pure white and ink-sealed), massive clenched fists raised at chest height flanking the torso without blocking the chin or trapping tiny white gaps under the arms.> High-saturation dual-tone signature energy ribbons (<PRIMARY ELEMENTAL COLOR> and <ACCENT SPARK/DEBRIS COLOR>) erupting strictly 100% BEHIND the shoulders and fists in a bold circular cyclone arc with deep saturated hard-inked outer edges and sharp flying stone/spark accents, zero streaks crossing in front of the chest, and zero white glow halos. Isolated cleanly on a pure solid flat white (#FFFFFF) background. No checkerboard grid, no grey backdrop gradient, no foggy white haze, no background scenery, no text, no watermarks.
```

#### Template C — Petite / Agile (May / Platinum / Taokaka / Jack-O')
Preserves full `2:3` card presence (mid-thigh-up) and Cammy's crisp ink + smooth painterly craft while preventing lacy hair/hat white-pocket traps.

```text
High-craft arcade fighting-game character portrait illustration in comic-painterly realism: bold unbroken charcoal-black ink outer silhouette contours sealing every edge and fine internal detail ink paired with richly shaded smooth painterly rendering, clean warm lifelike skin with crisp specular highlights, smooth stitched fabric/hoodie/ribbon folds, cohesive voluminous hair locks with solid shadow backing (zero wispy detached flyaway loops trapping white gaps), and bright warm golden key lighting with vivid chromatic rim light. Vertical 2:3 composition, mid-thigh-up energetic three-quarter action stance filling the full vertical frame, oversized headgear/hat/hood sitting 2-4% below top border with clean white margin above (never clipped), eyes centered horizontally at 23% from top, bright expressive forward eye contact with lively smile or sharp determined focus, completely unobstructed face. <FIGHTER NAME & DESCRIPTION: agile petite fighter, expressive slightly enlarged eyes with crisp catchlights, signature oversized hat/hood/cohesive hair silhouette, detailed vibrant jacket/outfit with zippers, buckles, or straps (any white parts shaded below pure white and ink-sealed), dynamic confident hand pose or prop rested cleanly behind shoulders.> Crisp high-saturation dual-tone painterly energy ribbons (<PRIMARY ELEMENTAL COLOR> and <SECONDARY ACCENT COLOR>) sweeping strictly 100% BEHIND the figure in an energetic oval swirl with deep saturated opaque outer edges, sharp brush-stroke contours, zero streaks crossing the torso, and zero white glow halos. Isolated cleanly on a pure solid flat white (#FFFFFF) background. No checkerboard grid, no grey gradient, no foggy white mist, no background scenery, no text, no watermarks.
```

#### Template D — Weapon / Prop-Heavy (Axl / Faust / Ramlethal / Testament / Baiken)
Frames oversized weapons in a diagonal or arched halo behind the shoulders, seals light garments/blades in dark ink, and eliminates white-matte island traps inside chains or weapon cutouts.

```text
High-craft arcade fighting-game character portrait illustration in comic-painterly realism: bold unbroken charcoal-black ink outer silhouette contours sealing every edge and fine internal detail ink paired with richly shaded smooth painterly rendering, forged steel and engraved metal with clean specular highlights, smooth worn leather coats/wraps, clean smooth athletic skin (zero crackle or pore noise), cohesive sculpted hair locks without wispy loops, and dramatic warm directional key lighting with crisp chromatic rim light. Vertical 2:3 composition, hip-to-upper-thigh heroic three-quarter combat stance, top of head/bandana/hat sitting 2-4% below top border with clean white margin above (never clipped), eyes centered horizontally at 21% from top, intense direct forward eye contact with unobstructed face and jawline. <FIGHTER NAME & DESCRIPTION: signature attire (any white hat/cloak/cloth shaded in warm ivory/cool slate well below pure white and sealed in crisp dark ink), detailed belts/buckles/cloth folds, iconic weapon angled cleanly behind the shoulders or gripped vertically along one flank so it frames the silhouette without crossing the eyes or mouth, foreground hand adding dynamic arcade depth.> High-saturation dual-tone painterly energy ribbons (<PRIMARY ENERGY RING/ARC COLOR> and <SECONDARY ELECTRIC/FLAME ACCENT COLOR>) curving strictly 100% BEHIND the weapon, chains, and shoulders with deep saturated hard-inked outer edges (backing narrow gaps near weapon loops solidly so zero tiny white pockets are trapped), zero streaks crossing in front of the chest, and zero white outer glow halos. Isolated cleanly on a pure solid flat white (#FFFFFF) background with crisp dark ink outer edges. No checkerboard grid, no grey gradient, no soft white haze, no background scenery, no text, no watermarks.
```

### 5.4 Common Cutout & AI Failure Modes — Fast Iteration Fixes

| Defect Observed in Raw or Staged Dark-Matte Output | Root Cause | Fast Prompt / Art Fix |
| :--- | :--- | :--- |
| **Trapped `#FFFFFF` triangles between hair wisps, braids, neck, or flames** *(Cammy defect #1)* | Loose flyaway hair strands or bright ribbons pinched small white holes bordered by bright blonde/yellow pixels (`darkInkFrac ≈ 0`). | Regenerate with *"cohesive solid sculpted hair locks anchored against neck/shoulders, zero wispy flyaway loops, zero narrow white gaps between hair and energy ribbons"*. |
| **Chalky white/grey halo clinging to flames or blonde hair on `#08090e`** *(Cammy defect #2)* | Soft glow or bright yellow-white outer flame gradient exceeded `2 px` `edgeDecontam` reach or triggered warm-skin protection. | Enforce *"deep saturated opaque outer edges on all flames/ribbons with crisp hard ink edges, zero white-hot outer borders, zero airbrushed glow or white mist fading into white"*. |
| **Eaten / chewed holes in white hats, cloaks, shirts, or gloves** | Pure `#FFFFFF` clothing (`minRGB ≥ 243`) touched the border without an unbroken dark ink seal. | Shade white garments in warm ivory / cool slate (`lum < 235`) and mandate *"bold unbroken dark charcoal-black ink outline sealing all white clothing"*. |
| **Fake grey-and-white checkerboard behind fighter** | Mentioned "transparent background" or "PNG cutout" in prompt. | Remove all mentions of "transparent" or "PNG". Specify *"isolated on a pure solid flat white (#FFFFFF) studio background"*. |
| **Stray laser lines cutting across chest/shorts** *(Cammy defect #4)* | Model wrapped thin energy streaks over the front of the torso. | Mandate *"all energy ribbons strictly 100% BEHIND the character silhouette, zero streaks crossing in front of the chest, torso, or legs"*. |
| **Voronoi crackle / reptilian scale noise on forehead, thighs, or cloth** | Prompt requested "micro-pores", "skin grain", or "woven micro-texture". | Replace with *"smooth clean painterly skin with crisp specular highlights, clean supple cloth folds, zero pore noise or crackle texture"*. |
| **Head / hat clipped flat at top edge** | Crown sat at `0 px` (`y = 0`) instead of leaving headroom. | Add *"top of headgear sitting 2–4% below top edge with clean white margin above, never touching or clipping top border"*. |
| **Eyes sit too low (`> 30%` Y) or hidden by fist/weapon** | Tall overhead weapon, oversized headroom, or over-rotated guard arm. | Tighten crop to *"mid-thigh-up portrait, eyes centered at 21% from top; both eyes, nose, and jawline 100% unobstructed"*. |

---

## 6. Pipeline Compatibility, Cutout QA Scorecard & Repair Decision Tree

Understanding the exact cutout mechanics inside `scripts/import-portraits.mjs` lets artists and prompters design **Source Art** that composites onto `#1c2438 → #08090e` with **zero white pockets, zero chalky halos, and zero manifest hacks**.

### 6.1 The 3 Cutout Mechanisms Every Creator Must Design For
1. **Outer Border Flood-Fill (`white-matte` — `minRGB ≥ 243`, `sat ≤ 8`):**
   - `detectBackdropMode` activates `white-matte` when `>35%` of sampled border pixels are neutral bright white (`lum ≥ 238`, `sat ≤ 18`). Flood-fill then removes only `#FFFFFF` pixels **connected to the canvas perimeter**.
   - *Cutout Rule:* Seal every white garment (gi, shirt, hat, cape, glove) with an **unbroken dark ink outer contour** and shade interior cloth folds well below pure white (`lum < 235`) so flood-fill cannot bleed into the fighter.
2. **Interior Pocket Clearing (`isFlatMatteInteriorPocket` & `isHairGapPocket`) — Why Cammy Still Has White Islands:**
   - Enclosed `#FFFFFF` pockets sealed off by hair, braids, arms, weapons, or energy ribbons are **only** cleared automatically if they pass strict guardrails:
     - `isFlatMatteInteriorPocket`: requires `compArea ≥ 140 px`, `pureFrac ≥ 0.85`, `softNeutralFrac ≤ 0.11`, and dark/saturated surrounding borders (`darkInkFrac ≥ 0.18` or `satEdgeFrac ≥ 0.28`).
     - `isHairGapPocket`: only runs in the top `24%` (`maxCompY < h * 0.24`) and requires heavy dark borders (`darkInkFrac ≥ 0.41`, `avgBorderLum ≤ 160`).
   - *Why This Fails on Cammy:* Tiny enclosed `#FFFFFF` gaps (`< 140 px`, or below `24%` Y) bordered by **pale blonde hair wisps** (`lum > 180`) and **white-yellow fire cores** (`darkInkFrac ≈ 0`, `avgBorderLum > 190`) fail both classifiers and remain glaring solid white islands on the dark card!
   - *Cutout Rule:* **Never** rely on interior pocket clearing to rescue wispy hair webs or flame-to-braid eyelets. Design cohesive hair masses and solid overlapping ribbon edges so enclosed white islands never exist in the raw art.
3. **2-Pixel Edge Decontamination (`edgeDecontam`) + Warm-Skin Shield — Why Bright Flames & Blonde Hair Get White Halos:**
   - `edgeDecontam` unpremultiplies white spill **strictly within `dist ≤ 2 px`** of the masked background (`dist === 1` and `dist === 2`), AND explicitly skips warm skin-like hues (`isWarmSkin = r > g && g >= b && (r - b) < 95`) so faces and shoulders don't turn dark or translucent.
   - *Why This Fails on Cammy:* Soft outer flame glows wider than `2 px` survive untouched, AND golden-blonde hair tips / warm orange-peach flame fringes satisfy the `isWarmSkin` RGB ratio — dodging decontamination completely and leaving a chalky white rim against `#08090e`!
   - *Cutout Rule:* Keep outer silhouette transitions **razor-sharp (`≤ 1–2 px`)**, and terminate flames, lightning, and pale hair in **dark ink outlines or deep saturated outer pigment** (never pale warm glow fading gradually into `#FFFFFF`).
4. **Automated Headshot Crop (`computeAutoHeadshotCrop`) & Test Invariants (`tests/portraits.test.ts`):**
   - Auto-crop scans the top `42%` of foreground mass using a vertical prior peaking at **`relY = 0.21`** and horizontal center `0.50`, cutting a `4:5` (`480 × 600`) frame with `34%` headroom above the detected face center.
   - `tests/portraits.test.ts` enforces valid JPEG headers/EOI, `480 px` wide **Full Portrait** (`height ≥ 480`), exact `480 × 600` **Headshot**, zero `'NaN'` / `'undefined'` Base64 substrings, valid `manifest.json` status invariants, and zero SHA-256 hash drift on locked fighters.

### 6.2 Pre-Ingestion & Dark-Matte Cutout QA Scorecard (Binary Pass/Fail)

Inspect every new portrait twice: first on the raw **Source Art**, then at **`200%` zoom on the staged `#08090e` dark-matte contact sheet** (`New Full 3:4` and `New Headshot 4:5`). Any **Fail** blocks locking:

| # | Gate | Pass Criterion | Fail Example (What to Catch) |
| :-: | :--- | :--- | :--- |
| 1 | **Aspect Ratio & Size** | `~2:3` vertical (`0.64–0.70`), minimum `848 × 1264 px` (`1024 × 1536 px` preferred). | Square `1:1`, landscape, or blurry `< 600 px` wide image. |
| 2 | **Pure White Backdrop** | Solid flat `#FFFFFF` edges; zero scenery, gradients, drop shadows, or fake checkerboards. | Grey studio gradient or baked transparency grid. |
| 3 | **Unbroken Ink Contour Seal** | Crisp dark ink outline (`1.5–2.5 px`) seals skin, blonde/white hair, clothing, and props cleanly against `#FFFFFF`. | Soft airbrushed edges melting into white or unsealed white cloth. |
| 4 | **Zero Trapped `#FFFFFF` Islands *(Dark-Matte Check)*** | Zero unmatted white triangles/slivers between hair wisps, braids, neck, arms, weapons, or ribbons when viewed at `200%` zoom on `#08090e`. | White holes trapped inside hair-to-flame or braid-to-neck gaps *(Cammy Headshot defect)*. |
| 5 | **Zero Chalky White Halos *(Dark-Matte Check)*** | Outer edges of flames, energy ribbons, and light hair separate cleanly onto `#08090e` with zero chalky white/grey fringe. | `>2 px` white-to-orange flame haze or white-rimmed blonde wisps *(Cammy flame/hair defect)*. |
| 6 | **Smooth Painterly Surfaces** | Clean smooth painterly skin and supple cloth folds with crisp specular highlights at `200%` Headshot zoom. | Voronoi dried-mud crackle on forehead/thighs, scaly cloth noise, flat cel-art, or plastic 3D CGI. |
| 7 | **Headroom & Unclipped Crown** | Top of head/hat sits cleanly `2–4%` below the top edge with pure `#FFFFFF` above — unclipped in both Full and `4:5` Headshot. | Hat/crown touching `y = 0` and slicing flat in the Headshot. |
| 8 | **Eye-Line Safe Zone & Unobstructed Gaze** | Eyes centered horizontally (`40–60%` X) and vertically (`18–25%` Y); both eyes, nose, and jawline 100% open and legible at `28 px`. | Tiny distant face, eyes below `30%` Y, or fist/weapon/bangs crossing eyes. |
| 9 | **Strictly-Behind Dual-Tone Energy** | Crisp saturated primary + accent ribbons sweep **100% behind** the body, casting matching rim light. | Random laser streaks crossing the chest/shorts/face, monochrome smoke, or missing energy. |
| 10 | **Bottom Scrim Clearance** | Lower `22–38%` contains lower torso/hips/thighs — not the face or signature hand gesture. | Tight bust-only crop where card title covers chin/chest. |
| 11 | **Mirror Resilience** | Flipping horizontally (`scaleX(-1)`) still reads naturally with no reversed text/logos. | Legible English text on shirt/hat or awkward edge-facing profile. |
| 12 | **White-Garment & Anatomy Integrity** | All white garments shaded (`lum < 235`) and intact after cutout (zero chewed holes); accurate hands/fingers and canonical fighter fidelity. | Flood-fill chewing into a white shirt/hat, 6-fingered hands, or off-model face. |

### 6.3 Cutout Repair Decision Tree & Pipeline Handoff SOP

When the staged `#08090e` contact sheet exposes a cutout defect, use this decision tree before applying or locking:

| Cutout Defect Seen on Staged `#08090e` Diff Sheet | Classification | Right Action |
| :--- | :--- | :--- |
| **Many tiny `#FFFFFF` slivers tangled in wispy hair/flames** OR **wide (`>2 px`) chalky white halos around flames/hair** | **Source-Damaged** | **Regenerate or paint-over Source Art** using Section 5.4 fixes (cohesive hair locks, saturated/inked outer flame edges). Never try to chase dozens of hair-web pixels with `extraSeeds`. |
| **1–3 clean, isolated enclosed `#FFFFFF` pockets** (e.g., inside a weapon chain loop, guitar fret gap, or between crossed arms with dark ink borders) | **Pipeline-Damaged** | Add targeted `{ "x", "y" }` pixel coordinates to `backdrop.extraSeeds` for that fighter only in `assets/portraits/manifest.json` and re-stage. |
| **A shaded white garment / pale collar eroded near the canvas border** | **Pipeline-Damaged** | Add a surgical `{ "x", "y", "w", "h" }` box to `backdrop.protectRects` for that fighter only in `assets/portraits/manifest.json` (or seal the contour in Source Art) and re-stage. |
| **Headshot auto-crop clips headgear or shifts eyes off-center** | **Pipeline-Damaged** | Set an explicit `4:5` `"crop": { "x", "y", "w", "h" }` box in `assets/portraits/manifest.json` and re-stage. |

> **Golden Rule:** Never loosen global matting thresholds in `scripts/import-portraits.mjs` to fix one fighter — fix cutout hazards in **Source Art** first, or isolate per-fighter recipes inside `assets/portraits/manifest.json`.

Once the raw **Source Art** passes all 12 gates above, follow [`docs/portrait-upload-guide.md`](./portrait-upload-guide.md) to archive, stage, inspect at `200%` dark-matte zoom across all 4 UI aspect ratios, and hash-lock the asset:

```bash
# 1. Archive raw Source Art into assets/portraits/raw/<key>.<ext> (sets status: "unaudited", locked: false)
node scripts/import-portraits.mjs --ingest <key> <path-to-raw-file>

# 2. Stage and render the Raw | Prev | New 4-ratio contact sheet (3:4, 4:5, 1:1, 5:6) on #08090e
node scripts/import-portraits.mjs --stage --only <key> --out .playwright-cli/portrait-batch --serve --port 3099

# 3. Inspect New Full (3:4) & New Headshot (4:5) at 200% zoom for zero white pockets/halos, then apply, lock & verify
node scripts/import-portraits.mjs --apply .playwright-cli/portrait-batch/results.json
node scripts/import-portraits.mjs --lock <key>
npm run build && npm test && npm run lint
```

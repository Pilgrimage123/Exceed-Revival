# Exceed Revival — Character Standee Animation Architecture & Upgrade Pipeline

> **Expert Assumptions & Repo-Grounded Scope**
> 1. **Canonical Domain Model (`GLOSSARY.md`)**: Fighters occupy discrete **Arena Spaces** `0..8` internally (displayed `1..9`, `BOARD_SIZE = 9`), with **Range** `1..8` measured between fighters (or from Zato-1's `eddiePos` for Specials/Ultras). Movement (`Advance`, `Retreat`, `Close`, `Cross-Up`, `Push`, `Pull`) and Strike resolution (`Range`, `Speed`, `Power`, `Armor`, `Guard`, `Stun`) must bridge discrete integer space transitions with continuous `60 FPS` kinematics.
> 2. **Runtime & Packaging Reality (`scripts/build-game.mjs`, `ADR-0007`)**: The game ships as a zero-dependency vanilla JS/CSS single-file bundle (`exceed_poc.html`) rendered inside a viewport-locked (`100dvh`) horizontal stage (`.arena-board-frame`). `paint()` (`game/render.js`) replaces `#app` wholesale on state transitions, so persistent FX canvases and animation loops **must** mount outside `#app` (e.g., `#fx-overlay-root`), and all Strike choreography **must** remain a read-only consumer of `engine.lastStrikeInfo.timeline` and `EventBus` (`ADR-0006`).
> 3. **Current Asset Baseline vs. Target Architecture**: Today, `FIGHTER_STANDEES` (`game/standees.js`) holds single-pose full-body artwork (`ryu`, `ken`, `cviper`) with runtime `matteStandeeRgba` keying and CSS/DOM FLIP + impact classes, while the remaining 38 fighters render as `.has-plaque` tokens (`FIGHTER_PHOTOS`). Because **no multi-pose sprite sheets exist in the repo yet**, **Paradigm 1 (Mesh-Warped Single/Low-Pose Keyframes)** is the immediate upgrade path for existing static standees, while **Paradigm 2 (Crisp-Cut Multi-Pose Atlases)** defines the contract if multi-frame sheets (`8–16` poses) are introduced later.

---

## 1. First-Principles Decomposition: Bridging Current Codebase to `60 FPS` Standees

In **Exceed Revival**, a standee is simultaneously a **readable board token anchored to an integer Arena Space** and a **fighting-game combatant executing high-impact Strikes**. Treating it as a rigid DOM `<img>` limits combat expression to whole-box CSS keyframes (`tokenRecoilRight`, `tokenLungeRight`); replacing it naively with heavy 60-frame sprite sheets breaks single-bundle size limits and creates massive asset overhead across 41 fighters.

The system decomposes into five orthogonal layers, mapped directly to existing modules and target upgrades:

| Layer | Responsibility | Live Baseline (`exceed-revival`) | Target `60 FPS` Upgrade Primitive |
| :--- | :--- | :--- | :--- |
| **L0 — Asset Matting & Calibration** | Background keying, pelvis-centroid `footCenterPct`/`anchorX`, sole grounding, VFX origin landmarks | Runtime `matteStandeeRgba` + `StandeeAssets` (`game/standees.js`) on `ryu`, `ken`, `cviper` | Offline pre-baking via `scripts/bake-standees.mjs` (browser-worker pattern from `scripts/import-portraits.mjs`) → pre-matted PNGs + `standee-manifest.json` |
| **L1 — Frame & Pose Authority** | Selecting/warping poses without double-exposure limb ghosting | Single static image per fighter (`FIGHTER_STANDEES` or `FIGHTER_PHOTOS` plaque) | **Paradigm 1** (34-triangle affine/UV warp + C2 solidity blend) for 1–5 pose art; **Paradigm 2** (`blendDuration = 0` crisp cuts) for 8–16 pose sheets |
| **L2 — Arena-Space & Cross-Up Kinematics** | Bridging integer `Arena Space` deltas (`ΔS`) and Cross-Ups at `60 FPS` | `captureFlipPositions()` / `applyFlip()` DOM FLIP (`game/render.js`) + instant CSS `scaleX(-1)` | Monotone cubic Hermite translation + `2.5D` Paper-Mario cosine flip (`stepHorizontalFlip`) + velocity-driven horizontal shear |
| **L3 — Anatomical Rig & Spring Physics** | Sub-frame breathing, windup compression, impact squash/stretch, guard bracing | CSS `@keyframes` (`tokenHitFlash`, `tokenRecoil*`, `tokenLunge*` in `game/shell.html`) | 2-sub-step Symplectic Euler scale spring + WebGL2 `4×6` `MeshSprite` with `4-Knot` Hermite spine (`feet`, `pelvis`, `waist`, `head`) |
| **L4 — Strike Exchange Choreography** | Synchronizing `Speed` clash, `Range` check, `Armor`/`Guard`, `Stun`, `Hitstop`, and callouts | `StrikePlaybackController` + `HitParticleEngine` (`game/playback.js`) in `#fx-overlay-root` | Synchronized 3-layer stage (`Board Canvas2D` + `WebGL2 Standee Stage` + `#fx-overlay-root` VFX) driven by `EventBus` & `lastStrikeInfo.timeline` |

---

## 2. Paradigm Selection Matrix: Dual-Paradigm Animation Law

Never mix unwarped alpha cross-dissolves with moving limbs or shifting weapons. Classify every standee asset into one of two paradigms:

### Paradigm 1: Anatomical Mesh-Warped Keyframes (1–5 Keyframes — Immediate Fit for `FIGHTER_STANDEES`)
Use for existing single-pose standees (`ryu_standee.jpg`, `ken_standee.jpg`, `image_9b961de0.png` for `cviper`, and future 1-pose full-body art) or 2–4 expression/torsion variants sharing one silhouette:
- **Geometric Registration**: Overlay a `25`-vertex, `34`-triangle **Anatomical Warp Lattice** (`16` interior anatomical landmarks: head, neck, shoulders, elbows, hands, pelvis, knees, feet + `9` pinned perimeter/base anchors).
- **Affine Triangle Solve**: For each triangle $(A, B, C)$ between keyframe $K_A$ and $K_B$, interpolate vertex positions $P(u) = (1 - u)P_A + u P_B$ and map source UVs via exact affine transform (expanding Canvas2D clip triangles outward from centroid by `0.6 px` if falling back from WebGL2, preventing `~0.5 px` anti-alias seams).
- **C2 Quintic Solidity Blend (`computeSolidityAlphas`)**:
  $$u(t) = 6t^5 - 15t^4 + 10t^3$$
  $$\alpha_A(u) = \begin{cases} 1.0 & u < 0.55 \\ \frac{1 - u}{0.45} & u \ge 0.55 \end{cases}, \quad \alpha_B(u) = u$$
  Guarantees $\alpha_A(u) + \alpha_B(u) \ge 1.0$ across $t \in [0, 1]$, preventing mid-transition transparency bleed-through of the Arena Space grid.

### Paradigm 2: Crisp-Cut Multi-Pose Sheet + Continuous Rig Physics (8–16 Frames / Fighter)
Use when a fighter has a dedicated multi-pose sheet (`Idle`, `Advance/Dash`, `Strike Windup`, `Strike Active`, `Guard Brace`, `Hit/Stun`, `Exceed Overdrive`) on a `4×4` (`1024×1024` or `2048×2048`) atlas:
- **Strict Crisp-Cut Law (`blendDuration = 0`)**: Whenever limbs, weapons, or stance silhouettes change between poses, enforce `blendDuration = 0` (`frameBlendAlpha = 1.0`). Continuous `60 FPS` fluidity comes from the `4×6` Hermite mesh, symplectic scale springs, and sprint afterimages—never opacity cross-fades.
- **2-Item Cross-Dissolve Allowlist**: `blendDuration ∈ [0.04s, 0.065s]` is permitted **only** for:
  1. **Identical-silhouette sub-features** (eye blink, visor/LED pulse where body pixels are `100%` stationary).
  2. **Intentional spectral/phase effects** (e.g., Zato-1 Eddie summon/dissolve, Chipp/Akuma astral dash cloak).

---

## 2.5. Universal Rule: 100% VFX-Free Standee Frames & Procedural VFX Pipeline

To guarantee visual fidelity, procedural scalability, and dynamic combat state progression across all 41 fighters, the engine enforces a strict separation between **physical fighter anatomy** and **fighting game VFX**:

### 1. Zero Baked Fighting Game VFX on Standee Image Frames
- Every standee frame asset (including idle stances, strike windups, active extensions like `sweep_active` or `cross_strike`, recovery frames, and retreat motions like `ryu_backdash` or `ken_backflip`) **must contain exclusively the fighter's clean anatomical body, clothing, and weapons**.
- **Prohibited in Source Images**: Never bake painted energy auras, ki spheres, dragon flames, lightning bolts, energy trails, or static dust/smoke into standee JPG/PNG files.
- **Rationale**:
  1. **Reusability across Combat Outcomes**: An active strike frame is used for both clean hits and whiffs (`range` phase). Baked contact fire or impact flashes look absurd when an attack whiffs into empty air.
  2. **Dynamic Range & IK Alignment**: Contact points vary continuously with defender distance (`distanceToTargetPx`, `ikReachPx`). Procedural contact arcs align exactly with the opponent; baked effects land in the wrong space.
  3. **Directional Invariance & Flipping**: Fighters mirror horizontally depending on relative board position. Baked directional energy streaks invert unnaturally upon cross-up.
  4. **Dynamic Escalation**: Baked VFX prevent the visual contrast between unboosted Normal attacks and awakened Exceeded attacks.

### 2. Runtime Procedural Synthesis
- All combat energy, projectile objects, and impact feedback are generated at runtime by:
  - **`StandeeStage`**: Real-time WebGL2 contact smears (`sweep_arc`, `strike_slash`), 4-knot spine flexion, symplectic landing squash/stretch, afterimage ghosts (`renderAfterimages`), and floor dust rings.
  - **`HitParticleEngine`**: Multi-tiered radial impact starbursts, directional slash sparks, lightning polyline arcs, and floating combat callouts (`#fx-overlay-root`).

### 3. Normal vs. Exceeded State Escalation Rule
- **Normal State**: Martial contact remains grounded and tactile. Attacks produce physical martial effects: crisp ground dust clouds (`physical_sweep_dust`, `dust`), sharp contact sparks (`clash_spark`), speed streaks, and neutral motion smears (`#d6c7b2`, `#cbd5e1`).
- **Exceeded State**: Awakened fighters channel elemental energy. Procedural VFX escalate dynamically:
  - **Ken**: Roaring dragon flame wheel on backflip (`ken_backflip_fire_wheel`), fiery breakdance sweep ribbon (`ken_flare_fire_sweep`), golden/crimson flame afterimages.
  - **Ryu**: Electric-blue Ashi Barai ki crescent (`ryu_ashi_barai_ki_sweep`), glowing cyan afterimage trails (`#38bdf8`), surging ki spirals.
  - **Universal**: Higher hitstop, intense camera shake, saturated afterimage cascades, and intensified particle burst counts.

---

## 3. Concrete Pipeline & Runtime Architecture

### Phase 1: Offline Asset Matting & Anchor Calibration (`scripts/bake-standees.mjs`)

Currently, `StandeeAssets.ensureLoaded()` (`game/standees.js`) runs `matteStandeeRgba()` on the browser main thread on first render (`MAX_CANVAS_HEIGHT = 960`), and `FIGHTER_STANDEES` relies on manually tuned `heightScale`, `footOffsetPct`, `footCenterPct`, and `shadowWidthPct`. To scale cleanly to all 41 fighters without first-match frame hitches:

1. **Reuse Repo-Native Browser-Worker Pattern (`scripts/import-portraits.mjs`)**:
   - Serve raw standee assets over localhost (`--stage --serve`), process them once offline, and emit lossless pre-matted RGBA PNGs + mirrored directional variants (or metadata JSON) into `public/assets/standees/` + `FIGHTER_STANDEES` entries.
   - Retain `matteStandeeRgba()` in `game/standees.js` as a runtime safety fallback and pure Node-testable kernel (`tests/standees.test.ts`).
2. **Backdrop Keying Rules**:
   - **Dark/Colorful Costumes & Elemental Auras** (e.g., Ryu cyan ki, Ken/C. Viper fire): Run `matteStandeeRgba` 4-connected border flood-fill + enclosed pure-neutral hole clearing (`holeMinSize >= 16`, `holeAvgMin >= 247`, `holeAvgSat <= 6`) + `4 px` distance-band unpremultiplication (`bgRef = 252`) to preserve off-white gi fabric while removing white halo fringes.
   - **White/Silver Costumes** (e.g., Hakumen, Ramlethal cloak, Vega shirt/mask, Faust coat): Author on `#00D856` chroma-green and apply spill suppression $G \leftarrow \min(G, \max(R, B))$ on fringe pixels so flood-fill never erodes bright garments touching cell borders.
3. **Pelvis-Centroid `anchorX` / `footCenterPct` Calibration (Anti-Teleportation Law)**:
   - Compute `anchorX` exclusively from the opaque pixel centroid within the **pelvis/torso vertical band (`35%..65%` of frame height)**:
     $$\text{anchorX} = \frac{\sum_{y = 0.35H}^{0.65H} \sum_{x} x \cdot \mathbb{I}(\alpha(x,y) > 128)}{\sum_{y = 0.35H}^{0.65H} \sum_{x} \mathbb{I}(\alpha(x,y) > 128)}$$
   - **Why**: Centering on full-frame bounding-box midpoint shifts a fighter's hips by `8–19 px` whenever a forward kick, lunge, or extended weapon enters a pose, causing horizontal hip-teleportation on frame cuts.
4. **Sole-Locked `bottomY` (`footOffsetPct`) & Canonical Height (`heightScale`)**:
   - Scan lowest non-shadow opaque pixel row for `bottomY` so feet sit flush on `.standee-ground-ring`.
   - Normalize standing height to `CANONICAL_HEIGHT = 214 px` (at desktop `--standee-h: clamp(162px, 24dvh, 248px)`), scaled by archetype multiplier `archScale` (e.g., `1.02` standard, `1.25–1.32` for Potemkin / Iron Tager / Goldlewis).
5. **Algorithmic VFX Origin Scanning (`*OriginRel`)**:
   - Record `impactOriginRel`, `muzzleRel` (for projectiles like Hadoken / Deus Ex Machina), and `slashOriginRel` in post-flip space relative to `(anchorX, bottomY)`.
   - **Co-Adjustment Invariant**: Any adjustment $\Delta x$ to `anchorX` must shift every `*OriginRel.dx` by $-\Delta x$ in the same baking pass.

---

### Phase 2: WebGL2 `4×6` Deformable Standee Mesh (`MeshSprite`)

To graduate beyond rigid CSS `transform` keyframes on `.standee-sprite` while keeping `Zero-GC` at `60 FPS`, render active standees on a shared WebGL2 `#version 300 es` **`4 × 6` quad grid (`35` vertices, `48` triangles, `144` indices)** backed by a pre-allocated `Float32Array(280)` (`8` floats/vertex: `[xWorld, yWorld, u0, v0, u1, v1, hWeight, alpha]`).

#### 1. The 4-Knot Anatomical Spine (`FourKnotSpine`)
Deform each standee vertically using 4 cubic Hermite knots parameterized by normalized height $h \in [0, 1]$ from sole to crown:
- **`feet` ($h = 0.00$)**: Strictly pinned (`dx = 0, dy = 0, rotRad = 0, scaleX = 1.0`) so standee soles remain locked inside `.standee-ground-ring`.
- **`pelvis` ($h = 0.33$)**: Drives weight shift on `Advance`/`Retreat` and downward brace on `Armor`/`Guard`.
- **`waist` ($h = 0.67$)**: Drives forward Strike lean, breathing expansion, and hit-recoil bucking.
- **`head` ($h = 1.00$)**: Drives secondary follow-through whip and intimidation tilt.

#### 2. `2×` Sub-Stepped Symplectic Euler Squash & Stretch Spring
Drive landing compression, Strike pop, and Exceed awakening around rest scale `(1.0, 1.0)`:
```js
// Zero-GC update inside rAF loop; pause rig spring when hitstopRemaining > 0
const subDt = Math.min(dt, 0.05) * 0.5;
for (let step = 0; step < 2; step++) {
  const accX = -stiffness * (springScaleX - 1) - damping * springVelX;
  const accY = -stiffness * (springScaleY - 1) - damping * springVelY;
  springVelX += accX * subDt;
  springVelY += accY * subDt;
  springScaleX += springVelX * subDt;
  springScaleY += springVelY * subDt;
}
```
- **Volume-Preserving Impulse Presets** (replacing static percentages in `@keyframes tokenRecoil*`/`tokenLunge*`):
  - **Guard / Armor Brace**: `stiffness = 360, damping = 22`, `(scaleX = 1.14, scaleY = 0.88)`
  - **Strike Launch / EX / Ultra**: `stiffness = 380, damping = 20`, `(scaleX = 0.86, scaleY = 1.18)`
  - **Heavy Hit Taken (`damage >= 5` or `guardBroken`)**: `stiffness = 340, damping = 18`, `(scaleX = 1.22, scaleY = 0.82, velImpulseX = +3.5, velImpulseY = -3.5)`

---

### Phase 3: Mapping *Exceed Revival* Mechanics to Standee Kinematics

Every movement and `StrikePlaybackController` timeline beat (`engine.lastStrikeInfo.timeline`) maps deterministically to standee kinematics:

#### 1. Board Movement (`Advance`, `Retreat`, `Close`, `Push`, `Pull`)
Let `X(S)` resolve the pixel center of `.cell[data-space="S"]` ($S \in \{0..8\}$), preserving `.cell.shared-space` horizontal offset when both fighters share an Arena Space (`p1.pos === p2.pos`).
- **Velocity-Driven Horizontal Shear (`stepHorizontalVelocityShear`)**:
  Replace purely rigid FLIP translation (`applyFlip` in `game/render.js`) with top-weighted horizontal shear:
  $$\text{skewPx}(h) = \text{clamp}(v_x \cdot k_{\text{skew}}, -22\text{ px}, +22\text{ px}) \cdot h^{1.35}$$
  - **Voluntary `Advance` / `Close`**: Forward torso lean (`waist.dx = +10 px, head.dx = +16 px`) + 3 additive sprint afterimages at `28 ms` spacing.
  - **Forced `Push` / Knockback**: Reverse shear sign so feet slide backward while upper torso lags forward (`waist.dx = +12 px` counter to travel), spawning floor-skid sparks at `feet`.
- **Phase-Locked Stride Hop (`hopYPx`)**:
  Confine vertical lift strictly to the airborne travel window $u \in [0.22, 0.78]$ (never continuous sine bobbing on grounded spaces):
  $$\text{hopYPx}(u) = \begin{cases} 0 & u \notin [0.22, 0.78] \\ -H_{\text{hop}} \sin\left(\frac{u - 0.22}{0.56}\pi\right) & u \in [0.22, 0.78] \end{cases}$$

#### 2. Cross-Up Movement (`shouldFlipStandee` / `resolveStandeeFacing`)
When `Advance`, `Close`, or a `Before:` move crosses past the opponent's Arena Space (`p1.pos > p2.pos` swap), replace the instant `scaleX(-1)` snap in `.standee-sprite.standee-flipped` with a **`2.5D` Paper-Mario Cosine Flip (`stepHorizontalFlip`)**:
- Duration: `0.18 s` (`minFlipDurationSec = 0.12 s`).
- Horizontal facing scale:
  $$s_{\text{facing}}(u) = s_{\text{start}} + (s_{\text{target}} - s_{\text{start}}) \cdot \frac{1 - \cos(\pi u)}{2}, \quad |s_{\text{facing}}| \ge 0.04$$
- Non-negative vertical arc: $\text{hopYPx}(u) = -\max(0, \sin(\pi u) \cdot 18\text{ px})$ (guaranteed never to clip below the `.cell-floor-pad`).

#### 3. Strike Resolution (`StrikePlaybackController` → `EventBus` → Standee & Camera)
Keep `StrikePlaybackController` (`game/playback.js`) as the single clock authority reading `engine.lastStrikeInfo.timeline`, driving standee poses and `HitParticleEngine` tiers (`guard`, `light`, `medium`, `heavy`, `critical`, `ex`, `ultra`, `stun`, `exceed`):

| `timeline` Phase / `EventBus` Event | Standee Rig & Shader Choreography | Camera & `#fx-overlay-root` (`HitParticleEngine`) |
| :--- | :--- | :--- |
| **`reveal` (`OnStrikeReveal`, `OnSpeedResolved`)** | Faster striker (`speedWinner`) compresses spring `(1.10, 0.91)` and snaps to `windup` (`blendDuration = 0`). Both standees remain anchored on their spaces while `ClashSummaryBanner` / Inspector show live stats. | Stage spotlight dims backdrop (`dimmerAlpha -> 0.55..0.75` outside `#app` or behind tokens), subtle `1.12×–1.25×` focus zoom toward active pair. |
| **`before` (Pre-hit move)** | Executes `stepHorizontalVelocityShear` + `stepHorizontalFlip` if crossing up, synced with `ArenaTelegraphRenderer` movement path. | Camera tracks midpoint smoothly (`35%` pan weight) with zero hitstop. |
| **`range` (Miss / Whiff)** | Attacker lunges `+28..38 px` toward defender, slices air at peak (`u = 0.45`), and recovers with `0.14 s` over-extension wobble (`waist.rotRad = +0.09 rad`). | No hitstop or screen shake; `OUT OF RANGE` badge displays cleanly. |
| **`hit` — Blocked (`damage <= 0` / `tier === 'guard'`)** | Defender snaps to `guard_brace`, pins `feet (0,0)`, compresses `pelvis.dy = +6 px`. Attacker bounces back slightly (`0` knockback on defender). | `HitParticleEngine` draws cyan hexagonal Aegis barrier (`hexShield: true`), `GUARD HELD!` callout, light thud (`hitstop = 0.08 s`), zero screen shake. |
| **`hit` — Clean / `guardBroken` (`OnStrikeHit`)** | Attacker holds active impact frame (`attackerScalePunch = 1.22×–1.28×`). Defender snaps to `recoil_pose`, receives additive white flash (`u_flashColor = [1, 1, 1]` for `65 ms`), and spine buckles (`waist.dx = -16 px, head.rotRad = -0.18 rad`). | Respects `UXSettings.get('reducedHitStop')`. Normal: `hitstop = 0.12 s`, `shake-medium`. `heavy`/`critical`/`ex`/`ultra`: `hitstop = 0.18–0.25 s`, `shake-heavy`/`shake-ultra`, kinetic beam + starbursts + `CHECKMATE` if `confirmedLethal`. |
| **`stunned` (`OnGuardBreak`)** | Slower striker's queued lunge aborts immediately; standee enters a `24 Hz` horizontal shudder (`offsetX = ±4.5 px * exp(-4t)`) with desaturated `u_tintColor` for `0.45 s`. | `STUNNED!!` / `GUARD SHATTERED` callout + `stun` star/triangle shards. |
| **`cleanup`** | Both standees spring back to `Idle` at their final post-`After` Arena Spaces; `dimmerAlpha -> 0`, camera returns to `1.0×`. | `ArenaTelegraphRenderer.clear()`, `StrikePlaybackController` advances to `onComplete`. |

---

## 4. Ansatsuken Normal Attack & Backdash Choreography (`NORMALS` — Ryu vs. Ken)

In the *Exceed Fighting System*, the 8 shared `NORMALS` (`game/cards.js`) represent universal fighting-game fundamentals. Because **Ryu** and **Ken** share Ansatsuken martial-arts roots—Ryu disciplined, grounded, and efficient; Ken flashy, acrobatic, and explosive—their shared Normal Strikes serve as the canonical benchmark for translating card stats and movement hooks (`Before:`, `Hit:`, `After:`) into distinct character standee kinematics.

> **Ground-Truth `NORMALS` Audit (`game/cards.js` vs. Draft Notes)**
> - **Confirmed 8-Card `NORMALS` Pool**: `Grasp`, `Cross`, `Assault`, `Dive`, `Spike`, `Sweep`, `Focus`, `Block` (there is no `Jab` card in `NORMALS`; `Grasp` is the Speed 7 Range 1 punisher, and `Cross` is the Speed 6 Range 1–2 hit-and-run poke).
> - **`Sweep` Printed Stats**: `Range 1–3, Power 6, Speed 2, Armor 0, Guard 6` — `Hit: Opponent discards 1 at random.` (Note: `Guard 6` makes Sweep stun-resistant if the opponent hits for `<= 6` damage, whereas `Armor 0` means Ryu/Ken take full damage and `Speed 2` makes it slow to start up).
> - **`Cross` Printed Stats**: `Range 1–2, Power 3, Speed 6, Armor 0, Guard 0` — `After: Retreat 3.` (Note: `Assault`'s *Boost* is `Retreat up to 4`, while `Cross`'s *After* Strike hook is `Retreat 3` via `engine.retreatSelf(attacker, defender, 3)`).

### 4.1 Deep-Dive: `Sweep` (`Range 1–3, Power 6, Speed 2, Armor 0, Guard 6`)

Because `Sweep` reaches out to **Range 3** and hits for **Power 6** at **Speed 2**, it is not a short-range ankle tap—it is a long-reaching, space-controlling low **Crouching Heavy Kick (`cr.HK`)** / sliding forward sweep that catches opponents walking or jumping in from mid-screen.

- **Why the Mechanics Fit**: In *Street Fighter*, a well-spaced `cr.HK` is a Shoto's longest-reaching low normal to punish whiffs from mid-range (`Range 1–3`) and knock the opponent flat (`Power 6`, forcing a random hand discard on `Hit:`). Its slow startup (`Speed 2`) and `0 Armor` mean fast attacks (`Speed 3–7`) hit you first, while `Guard 6` represents a committed low profile that resists being stunned by light pokes.
- **Ryu — The Textbook Low Karate Sweep**:
  - **Visual**: Ryu drops straight down on his rear support leg and pivots on one plant hand, sliding his lead leg out to maximum horizontal extension (`cr.HK` / low sweeping *Ashi Barai*) with his torso upright, core tight, and eyes locked forward.
  - **Rig & Spine Parameters**:
    - `windup` (`0.00s–0.12s`): Deep vertical drop (`pelvis.dy = +14 px`, `waist.dy = +10 px`), compact center (`springScale = (1.12, 0.86)`).
    - `active` (`Range 1–3` extension): Forward horizontal slide (`+28 px` toward target space), lead foot vertex extends to `1.35×` base width along the floor (`feet.dy = 0 px`), minimal torso tilt (`waist.rotRad = -0.06 rad`, `head.dx = +4 px`).
- **Ken — The Flamboyant Lunging Floor Flare**:
  - **Visual**: Ken throws his entire body weight forward into a wide, sliding **Crouching Heavy Kick** / spinning breakdance floor flare (or lunging *Inazuma* low sweep) that skids across the arena stones to clip shins at `Range 3`.
  - **Rig & Spine Parameters**:
    - `windup` (`0.00s–0.12s`): Aggressive counter-twist (`waist.dx = -10 px`, `waist.rotRad = -0.14 rad`, `springScale = (1.16, 0.84)`).
    - `active`: Deep lunging skid (`+42 px` translation surge with floor dust emitter at `feet`), dramatic backward counterbalance lean (`waist.rotRad = -0.22 rad`, `head.dx = -8 px`), and a `360°` cosine torso whip (`stepHorizontalFlip` micro-spin) on recovery.

---

### 4.2 Deep-Dive: `Cross` (`Range 1–2, Power 3, Speed 6, Armor 0, Guard 0 — After: Retreat 3`) & Backdash Choreography

Because `Cross` resolves an **`After: Retreat 3`** (and `Assault`'s Boost resolves **`Retreat up to 4`**), `"Cross"` in *Exceed* is **not** an aerial cross-up over the opponent's head (that mechanic belongs to **`Dive`: `Before: Advance 3. If side swap, cannot be hit`**). Instead, `Cross` is a **fast hit-and-run counter-poke (`Speed 6, Power 3` at `Range 1–2`) followed immediately by an evasive Backdash (`Back, Back`)** to reset neutral spacing.

#### Phase A — The `Speed 6` Counter-Poke (`Range 1–2` Hit Step)
- **Ryu**: Reads the opponent's approach and snaps out a crisp, defensive **Crouching Medium Kick (`cr.MK`)**, **Standing Light Kick (`st.LK`)**, or **`Back + Heavy Punch`** check-strike to halt their momentum before immediately rebounding backward.
- **Ken**: Tags the opponent's chin with a flashy **Target Combo starter (`st.MP`)**, snapping **Backfist**, or upward **High Kick**, using the kinetic rebound of the impact to spring directly into an acrobatic retreat.

#### Phase B — The `After: Retreat 3` Backdash (`Back, Back` Without Turning Around)
In fighting games, a backdash moves a fighter rapidly backward (`ΔS = 1..4` Arena Spaces away from the opponent) **while maintaining their forward facing orientation** (`shouldFlipStandee` does **not** flip during a retreat). However, Ryu and Ken execute that backward travel with completely different kinematics:

| Attribute | Ryu's Backdash: *"The Disciplined Hop"* | Ken's Backdash: *"The Flashy Backflip"* |
| :--- | :--- | :--- |
| **Martial Arts Silhouette** | Pure, efficient karate footwork. Stays side-on; knees tuck up just a few inches off the stones as he glides backward across the mat. | Dramatic, athletic acrobatics. Springs off his lead foot into a low-altitude hands-free tucked back-somersault (Webster / cartwheel flare). |
| **Guard & Arm Posture** | Hands never drop—both fists stay raised in classic Ansatsuken guard (one by chin, one extended forward), ready to block or fire a *Hadoken* the millisecond his soles touch down. | Whips legs down into a wide, deep crouched landing stance with one arm flung outward for balance and the other cocked back, smirking and ready to sprint back in. |
| **Airborne Trajectory (`hopYPx`)** | Low, flat, ground-skimming hop: $H_{\text{hop}} = 10\text{ px}$ over $u \in [0.18, 0.82]$. Zero wasted vertical arc. | High, punchy acrobatic arc: $H_{\text{hop}} = 34\text{ px}$ over $u \in [0.15, 0.85]$ with peak hang-time compression at $u = 0.50$. |
| **4-Knot Spine & Rotation** | **No full-body rotation**. Controlled defensive forward guard lean (`pelvis.dx = -6 px`, `waist.dx = +8 px`, `head.dx = +10 px` toward opponent, `waist.rotRad = +0.06 rad`). | **Full `-2π` backward somersault pitch** (`rotRad(u) = -2π · facingSign · smoothstep(0.15, 0.82, u)`) around `pelvis` centroid (`h = 0.38`) while compacting spine (`springScale = (0.88, 0.86)` mid-air). |
| **Landing Impulse (`u = 0.85..1.00`)** | Crisp, quiet sole plant: `springScale = (1.06, 0.94)`, `stiffness = 420, damping = 26` (settles in `90 ms`). | Heavy, wide-stance crouch impact: `springScale = (1.20, 0.82)`, `pelvis.dy = +9 px`, `stiffness = 340, damping = 18` + floor dust puff. |
| **Afterimage Trail** | 2 subtle cool-cyan/slate ghost silhouettes (`alpha = 0.24`, `32 ms` spacing). | 3 high-contrast warm-amber/crimson motion-blur arcs (`alpha = 0.36`, `24 ms` spacing). |

---

### 4.3 Complete `NORMALS` Visual & Kinematic Matrix (Ryu vs. Ken)

Every card in the shared 8-card `NORMALS` deck (`game/cards.js`) maps its exact engine stats and hooks to distinct Ryu and Ken standee choreography:

| Normal Card & Ground-Truth Stats (`game/cards.js`) | Engine Hook / Mechanical Identity | Ryu Visual & Standee Kinematics (*Disciplined / Grounded*) | Ken Visual & Standee Kinematics (*Flashy / Aggressive*) |
| :--- | :--- | :--- | :--- |
| **`Grasp`**<br>`Rng 1` · `Pow 3` · `Spd 7`<br>`Arm 0` · `Grd 0`<br>*(Fastest Normal; replaces a generic "Jab" at `Spd 7`)* | `Hit: Move opponent 1–2.` (`interactiveHit: 'grasp_move'` push or pull) | **Classic Shoulder Throw (*Seoi Nage*) / Point-Blank Snap-Grab**: Snaps a `Spd 7` collar/lapel grab (`waist.dx = +14 px`), pivots low (`pelvis.dy = +8 px`), and heaves opponent across or backward (`1–2` spaces). | **Rolling Back-Throw (*Jigoku Guruma*) / Flash Knee-Grab**: Lunges in at `Spd 7`, hooks the opponent with a flashy step-kick/collar yank, and flings them `1–2` spaces with a wide follow-through flourish. |
| **`Cross`**<br>`Rng 1–2` · `Pow 3` · `Spd 6`<br>`Arm 0` · `Grd 0` | `After: Retreat 3.`<br>*(Boost: `Advance up to 3`)* | **Crisp Check-Poke + Disciplined Backdash Hop**: Snaps a `cr.MK` / `Back + HP` stop-poke (`+18 px` jab), then glides backward `3` spaces in a low `10 px` karate hop with fists locked in high guard. | **Target-Combo Tag + Acrobatic Backflip**: Clips chin with a fast `st.MP` / snapping backfist (`+22 px`), then springs into a `-2π` tucked back-somersault (`34 px` arc) across `3` spaces into a wide crouch. |
| **`Assault`**<br>`Rng 1` · `Pow 4` · `Spd 5`<br>`Arm 0` · `Grd 0` | `Before: Close 2.`<br>`Hit: Advantage.`<br>*(Boost: `Retreat up to 4`)* | **Collarbone Breaker (*Forward + MP*, *Sakotsu Wari*)**: Advances `2` spaces with heavy forward shear (`waist.dx = +12 px`), rises slightly (`springScale = (0.92, 1.08)`), and drives a downward double-fist overhead chop onto the opponent's collarbone. | **Thunder Kick (*Forward + MK*, *Inazuma Kakato Wari*)**: Bounds forward `2` spaces (`hopYPx = -14 px`), chambers leg high (`springScale = (0.88, 1.16)`), and brings his heel crashing down in a high-arcing axe kick (`pelvis.dy = +10 px` on impact). |
| **`Dive`**<br>`Rng 1` · `Pow 5` · `Spd 4`<br>`Arm 0` · `Grd 0` | `Before: Advance 3. If side swap, cannot be hit.`<br>*(The true aerial **Cross-Up** card)* | **Disciplined Jumping Heavy/Medium Kick Cross-Up**: Launches into a clean diagonal trajectory (`hopYPx = -38 px` across `3` spaces) with knee/shin chambered forward; if crossing past opponent's space, executes `stepHorizontalFlip` (`0.18 s`) mid-air and taps the back of their head on landing. | **Aerial Slash Kick / Hurricane Kick (*Tatsumaki*) Startup Cross-Up**: Soars across `3` spaces (`hopYPx = -46 px`) with a fiery diagonal flying kick; on side-swap, whips through a rapid mid-air cosine flip + cyan/amber evasion shimmer (`strikeState.unhittable = true`), landing on their blind side. |
| **`Spike`**<br>`Rng 2–3` · `Pow 5` · `Spd 3`<br>`Arm 0` · `Grd 4` | `Ignore Guard, Armor.`<br>*(Mid-range armor-piercing poke)* | **Standing Heavy Side-Kick (*st.HK*)**: Plants rear foot (`feet` pinned) and drives a straight, piston-like side thrust kick (`waist.dx = +16 px`, `waist.rotRad = -0.10 rad`) straight through the opponent's guard at `Range 2–3`. | **Snapping Roundhouse / Step-Kick (*st.HK* / *f+HK*)**: Pivots hips aggressively (`pelvis.rotRad = +0.12 rad`, `waist.dx = +22 px`), whipping a wide, armor-crushing crescent roundhouse across `Range 2–3`. |
| **`Sweep`**<br>`Rng 1–3` · `Pow 6` · `Spd 2`<br>`Arm 0` · `Grd 6` | `Hit: Opponent discards 1 at random.`<br>*(Max-reach low knockdown sweep)* | **Extended Crouching Heavy Kick (*cr.HK*)**: Drops low (`pelvis.dy = +14 px`), pivots on one hand, and slides lead leg out to full `Range 3` reach with tight upright karate posture. | **Lunging Floor-Flare Sweep (*cr.HK*)**: Skids forward (`+42 px` lunge) into a wide, flamboyant two-hand spinning floor kick that takes out the opponent's ankles from half-screen away. |
| **`Focus`**<br>`Rng 1–2` · `Pow 4` · `Spd 1`<br>`Arm 2` · `Grd 5` | `Opponents can't move you. After: Draw 1.` (`movementImmune: true`) | **SFIV Focus Attack — Palm Crumple**: Plants feet into an unmovable horse stance (`pelvis.dy = +8 px`, `springScale = (1.14, 0.88)`, black-ink/cyan charge aura absorbing hits via `Arm 2 / Grd 5`), then unleashes a heavy two-step karate palm thrust. | **SFIV Focus Attack — Spinning Backfist**: Coils low with fiery ink-charge (`waist.rotRad = -0.16 rad`, zero knockback on incoming hit due to `movementImmune`), then uncoils a violent spinning backfist/hook that crumples the opponent. |
| **`Block`**<br>`Rng —` · `Pow 0` · `Spd 0`<br>`Arm 2` · `Grd 3` (`alwaysMiss`) | `When hit, spend Force for +2 Armor each. After: Add to Gauge.` | **High-Tight Ansatsuken Cross-Guard**: Twin forearms locked vertically in front of face/chest (`pelvis.dy = +6 px`, `waist.dx = -6 px`), sliding back `0 px` behind a cyan hexagonal Aegis barrier as Force scales Armor. | **Leaning Parry / Brace Guard**: Crouches into an angled brawler guard (`pelvis.dy = +8 px`, `waist.rotRad = -0.08 rad`), brushing off impact sparks with a sharp shoulder deflection. |

---

## 5. Stage Layering Contract (Respecting `#app` Repaint Isolation & `ADR-0007`)

Because `paint()` in `game/render.js` replaces the entire `#app` DOM subtree on every turn action, persistent animation surfaces **cannot** live inside `boardHTML()`:

1. **DOM Layer (`#app` → `.arena-board-frame`)**:
   - Owns the 9 `.cell` Arena Spaces, `.cell-floor-pad` distance/space badges, `ArenaTelegraphRenderer` SVG splines, `.standee-ground-ring` plinths, and accessibility/test attributes (`data-pid`, `data-char`, `data-facing`, `data-space`).
   - When the WebGL2 standee stage is active, DOM `.standee-img` sets `opacity: 0` (keeping layout bounding boxes intact for `HitParticleEngine.resolveCombatPositions()` and `tests/standees.test.ts` assertions) while WebGL2 renders the deformed standee directly over each `.standee-anchor` bounding rect.
2. **WebGL2 Standee Canvas (mounted inside `#fx-overlay-root` or sibling `#standee-stage-canvas` outside `#app`)**:
   - **Pass 1A (Planar Ground Reflections)**: Inverted vertical pass (`scaleY = -0.35`, `alpha = 0.18`) clipped via `gl.SCISSOR_TEST` to `.board` floor height.
   - **Pass 1B (Afterimages & Standees)**: Sorted by `zPriority`: `0` Reflections → `1` Shared-Space Back Token → `2` Neutral → `3` Defender → `4` Active Striker.
   - Uses premultiplied alpha (`gl.ONE, gl.ONE_MINUS_SRC_ALPHA`) and bounded LRU texture cache (`maxCachedTextures = 96`, populated from pre-decoded `ImageBitmap`s).
3. **Foreground VFX Canvas & Callouts (`#fx-overlay-root` — already live in `HitParticleEngine`)**:
   - Renders `.hit-fx-canvas` (starbursts, slashes, lightning bolts, spark streakers, hex guard shields) and `.hit-fx-callouts` above standees without ever being cleared by `paint()`.

---

## 6. High-Probability Failure Modes & Mitigations

| # | Failure Mode | Root Cause in Practice | Exact Engineering Mitigation |
| :--- | :--- | :--- | :--- |
| **1** | **"Two Heads / Four Legs" Ghosting** | Enabling `blendDuration > 0` opacity cross-dissolve between two unwarped poses where limbs or weapons moved. | Enforce `blendDuration = 0` (`frameBlendAlpha = 1.0`) for all pose transitions in `computeFrameTransitionState`. Guard `if (blendDuration <= 0) return 1.0;` before division to avoid `0 / 0 = NaN` during `dt = 0` hitstop frames. |
| **2** | **Horizontal Hip-Teleportation on Cuts** | Anchoring frames by full bounding-box midpoint `(minX + maxX) / 2` instead of torso mass. | Compute `footCenterPct` / `anchorX` from the `35%..65%` vertical pelvis band during baking, and co-shift every `*OriginRel.dx` by $-\Delta x$. |
| **3** | **Accidental Facing Flip During `Cross` / Backdash Retreat** | Treating any backward movement (`ΔS` away from opponent) as a turnaround or triggering `stepHorizontalFlip` when `p1.pos < p2.pos` has not changed. | Gate `stepHorizontalFlip` strictly on a change in relative board ordering (`(prevMyPos < prevOppPos) !== (nextMyPos < nextOppPos)`). Backdashes (`Cross` `After: Retreat 3`, `Assault` Boost `Retreat up to 4`) preserve facing orientation and invert horizontal shear (`v_x` opposite to `facingSign`). |
| **4** | **First-Render Standee Pop-In / Hitch** | `StandeeAssets.ensureLoaded()` runs `ctx.getImageData` + `matteStandeeRgba` lazily on the main thread when a match starts (`standee-img` fades in from `opacity: 0`). | Pre-bake standees offline into transparent RGBA assets (`matteMode: 'none'`) and decode via `createImageBitmap` during fighter-select preload (`StandeeAssets.preloadForMatch`). |
| **5** | **Eaten White Garments / `NaN` Leaks in Bundle** | White-matte BFS eroding white armor/cloaks (`hakumen`, `ramlethal`, `baiken`, `faust`), or inline data URIs containing `"NaN"`/`"undefined"` failing `tests/howtoplay.test.ts`. | Author white-clad fighters on `#00D856` chroma-green (or use checkerboard-periodicity + dark-ink guard from `scripts/import-portraits.mjs`), and never inline multi-megabyte raw standee PNGs into `exceed_poc.html` if served cleanly from `public/assets/standees/`. |
| **6** | **Persistent Canvas Wiped Mid-Strike** | Mounting `<canvas>` inside `boardHTML()` where `paint()` overwrites `#app.innerHTML`. | Mount all persistent WebGL2/Canvas2D layers inside `#fx-overlay-root` (outside `#app`) and sync positions via `getBoundingClientRect()` of `.board .token[data-pid]`. |
| **7** | **Broken `reducedHitStop` / Accessibility** | Ignoring `UXSettings.get('reducedHitStop')` or `prefers-reduced-motion: reduce`, or breaking `boardHTML()` DOM markers checked by `tests/standees.test.ts`. | Clamp `hitstop = 0`, replace Ken's `-2π` backflip spin with Ryu's low hop under `reducedHitStop`, disable `screen-shake`, and keep `.token.has-standee[data-pid][data-char][data-facing]` in `boardHTML()`. |

---

## 7. Verification & Automated Invariant Checklist

1. **Existing Unit & Regression Gates (`npm test`)**:
   - `tests/standees.test.ts`: Verify `FIGHTER_STANDEES`, `resolveStandeeFacing`, `shouldFlipStandee`, `matteStandeeRgba` (outer clear, hole clear, warm gi preservation, warm/cool aura decontamination), and `boardHTML` facing on opening and crossed-up spaces.
2. **New Kinematics & Mesh Invariants (to add to `tests/standees.test.ts` as WebGL2/kinematics roll out)**:
   - Assert every calibrated standee's `anchorX` lies within `[0.30 * width, 0.70 * width]` and normalized height matches `CANONICAL_HEIGHT * heightScale` within `±0.5 px`.
   - Assert `computeFrameTransitionState` returns `frameBlendAlpha === 1` when `blendDuration === 0` even at `dt === 0` (hitstop safety).
   - Assert `stepHorizontalFlip(u)` produces `hopYPx <= 0` and `Math.abs(scaleX) >= 0.04` for all $u \in [0, 1]$ (never clips below the Arena Space floor or collapses to singular matrix), and never triggers on `Retreat` moves (`Cross` `After: Retreat 3`) where relative side ordering does not swap.
3. **Interactive Strike Lab Verification (`game/howtoplay.js` Clash Lab + Browser Smoke)**:
   - `HitParticleEngine.resolveCombatPositions()` already supports `.htp-clash-corner` inside `#howToPlayOverlay`; use the Strike Clash Lab (`03 Strike Clash Lab`) plus `?autostart=1` live match captures via `playwright-cli` to verify facing flips (`Dive` cross-up vs. `Cross` backdash retreat), shared-space offsets, `Reduced Hit-Stop`, and `100dvh` desktop/mobile layout integrity (`ADR-0007`).

---

## 8. Resolved Repo Answers & Remaining Decisions

The three open questions from the generic draft resolve against the current **Exceed Revival** codebase as follows:
1. **Asset Source Format (Resolved)**: Currently **Single Static Full-Body Standees** (`ryu`, `ken`, `cviper` in `FIGHTER_STANDEES`) plus 38 portrait plaques (`.has-plaque`). **Paradigm 1** (single-pose / low-pose `34`-triangle mesh warp + `FourKnotSpine`) is therefore the primary near-term path; **Paradigm 2** applies only if multi-pose sprite sheets are commissioned later.
2. **Board Perspective (Resolved)**: A **flat horizontal 9-Space duel lane** (`.arena-board-frame` / `.board`) using grounded elliptical **tabletop standee plinths** (`.standee-ground-ring` + `.standee-shadow`).
3. **Strike Reveal UX (Resolved)**: **Simultaneous reveal on the persistent stage** via `StrikePlaybackController` (`ADR-0006`)—cards remain inspectable in the Right Rail Inspector while `timelineBarHTML`, `HitParticleEngine`, and standee motion play out inline without hiding the Arena Spaces.

**Remaining Decisions to Confirm Before Implementation**:
- **Rollout Scope**: Expand `FIGHTER_STANDEES` from `3` fighters (`ryu`, `ken`, `cviper`) to all `41` fighters first (using Paradigm 1 single-pose animation), or commission `8–16`-pose Paradigm 2 sheets for flagship fighters (`ryu`, `ken`) first?
- **Offline Storage Budget**: Keep standee assets as static files under `public/assets/standees/` (loaded over HTTP, keeping `exceed_poc.html` lightweight) or inline compressed WebP/PNG assets into `exceed_poc.html` for `file://` standalone play?

---

## 9. Implementation Post-Mortem: Pitfalls, What We Learned to Do & What to Avoid Next Time

See [`docs/standee-animation-lessons-learned.md`](./standee-animation-lessons-learned.md) for the complete engineering retrospective. Key takeaways from building and verifying the live Ryu & Ken WebGL2 standee engine (`game/standees.js`, `game/standee-stage.js`, `game/playback.js`):

1. **Author VFX Sockets in Texture UV Space `(uCoord, hCoord)`, Never World-Space Offsets**:
   - **Pitfall**: Approximating fist or shoulder emitters via `fx + facingSign * width * 0.27` caused Ken's ignited fist flame to float in the empty air below his raised glove and drift off his hand whenever the 4-Knot Spine crouched, leaned, or flipped.
   - **Rule**: Measure exact normalized `(uCoord, hCoord)` coordinates from the raw standee artwork (`ryu_standee.jpg`: lead glove `(0.88, 0.78)`, rear glove `(0.43, 0.65)`; `ken_standee.jpg`: raised lead glove `(0.85, 0.81)`, rear glove `(0.29, 0.60)`) and transform them through `StandeeRigMath.computeDeformedMeshVertex(uCoord, hCoord, _meshParams, _vertOut)` so VFX stay welded to the deformed mesh across every crouch, lunge, and `-2π` backflip.
2. **Use WebGL2 Fresnel Rim Lighting (`u_rimColor`, `u_rimStrength`), Never Full-Sprite Tints (`u_tintAmount`)**:
   - **Pitfall**: Tinting the whole character sprite or covering the torso in opaque smoke to signal Exceed Mode washes out facial expressions, gi folds, and limb silhouettes.
   - **Rule**: Keep `u_tintAmount = 0` on active fighters and compute a 4-tap neighbor-alpha gradient in the WebGL2 fragment shader (`edge = a * (1.0 - minNeighborAlpha)`) to illuminate only the outer contour, pairing it with character-specific silhouette plumes (Ryu's white-and-cobalt Ki + Denjin fist-to-shoulder lightning + levitating pebbles; Ken's crimson-and-gold dancing flames + ignited gloves + drifting cinders).
3. **Dynamic Lunge-and-Return + 3-Clip Whiff Recovery for Variable Ranges (`Range 1–3`)**:
   - **Pitfall**: Fixed-distance lunges punch empty air on `Range 2–3` Strikes (`Sweep`, `Spike`), and full follow-throughs on misses look disconnected.
   - **Rule**: Compute `computeDynamicLungeOffset` from actual target pixel distance (`distanceToTargetPx`), extend limb reach via `computeIkReachPx` + range-stretching smear arcs, and cancel `Active` frames at `38%` into an off-balance Whiff Recovery stumble (`computeClipEnvelope`) whenever a Strike misses.
4. **3-Track Layering (`Track 0/1/2`), Midpoint X-Crossover Flips & `0.40s` Startup Clash Freeze**:
   - **Pitfall**: Flipping `facingSign` on any backward velocity causes fighters to turn their backs during `Cross` (`After: Retreat 3`), and overwriting Track 1 on non-stunning hits hides whether a defender's `Guard` held.
   - **Rule**: Hold `reveal` for `0.40s` (Startup Clash Freeze with `"VS"` spark and Startup Aura Flare); trigger `stepHorizontalFlip` strictly when relative board ordering swaps and at the exact X-crossover midpoint; and run `Guard Held (damage > 0 && !stunned)` on **Track 2 (Additive Flinch)** while **Track 1 holds the defender's attack startup pose** ("Super Armor" Grit).

---

## 10. Cammy & Zangief Standee Expansion (`FIGHTER_STANDEES` & `resolveStandeeChoreography`)

Following the architecture and lessons learned in Sections 1–9, **Cammy** (`/assets/aistudio/cammy_standee.jpg`) and **Zangief** (`/assets/aistudio/zangief_standee.jpg`) expand `FIGHTER_STANDEES` to five full-body deformable WebGL2 standees (`ryu`, `ken`, `cviper`, `cammy`, `zangief`):

### 10.1 Calibrated Asset & UV Socket Specifications

| Fighter | `heightScale` | `aspectRatio` | `footOffsetPct` | `shadowWidthPct` | Calibrated Texture UV Sockets `(uCoord, hCoord)` | WebGL2 Fresnel Rim & Exceed Aura |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Cammy**<br>*High-Speed Cross-Up & Momentum Assassin* | `1.00` | `896 / 1200` | `2.4%` | `74%` | • `leadFist`: `(0.83, 0.72)`<br>• `rearFist`: `(0.40, 0.63)`<br>• `leadShoulder`: `(0.55, 0.74)`<br>• `rearShoulder`: `(0.42, 0.74)`<br>• **`leadBoot` (Iconic Red Boot)**: `(0.81, 0.14)`<br>• **`rearBoot` (Iconic Red Boot)**: `(0.14, 0.14)` | **Delta Red Emerald-Cyan Rim (`#10b981` / `#6ee7b7`)** + helical wind ribbons + glowing **crimson-red kinetic boot halos (`#ff2a4b`)** welded to `leadBoot` & `rearBoot`. |
| **Zangief**<br>*Unstoppable Wall & Screen-Shaking Grappler* | `1.24` | `896 / 1200` | `2.1%` | `92%` | • `leadFist`: `(0.86, 0.49)`<br>• `rearFist`: `(0.30, 0.47)`<br>• `leadShoulder`: `(0.73, 0.78)`<br>• `rearShoulder`: `(0.31, 0.80)`<br>• `leadBoot`: `(0.76, 0.12)`<br>• `rearBoot`: `(0.21, 0.12)` | **Red Cyclone Crimson-Gold Rim (`#ef4444` / `#fde047`)** + swirling torso cyclone bands + ignited wrestling bracer flares + vibrating arena stone chunks lifting off the floor. |

### 10.2 Cammy Signature Choreography (`cammy`)
- **`Cannon Spike` (`Speed 7 | Hit: Push/Pull 3`)**: Instant green-streaked vertical kick (`hopHeight = 68 px`, `spring = (0.82, 1.24)`) with a dual emerald-and-red-boot (`#10b981` + `#ff2a4b`) `dragon_uppercut` slash column and 4 emerald afterimages.
- **`Dive Kick` (`Before: Advance 2 | After: Range 1 attacks miss`)**: High diagonal cross-up leap (`hopHeight = 50 px`, `dive_kick_leap`) with `evasion_shimmer` phase ring on side-swap and red-boot downward heel strike.
- **`Spiral Arrow` (`Before: Advance 4 | Critical: +1 Armor, +4 Guard`)**: Horizontal torpedo drill (`hopHeight = 22 px`, `2x` full-body corkscrew spin) wrapped in a multi-ring `spiral_vortex` with a central `#ff2a4b` red-boot lance; flashes **gold (`#fde047`)** when `criticalPaid`.
- **`Cannonball` (`Before: Advance 3 | Critical: Ignore Guard | Hit: Pull 3 & Advantage`)**: Mid-air tucked somersault (`hopHeight = 42 px`, `+2π` spin) crashing heel-first; shatters enemy guard (`armor_pierce` + gold flash) when Critical.
- **`Razor's Edge Slicer` (`Before: Advance 4 | Hit: +2 Power at arena edge`)**: Ground-hugging low slide kick (`hopHeight = 0 px`, `pelvis.dy = +16 px`, `waist.dy = +14 px`) into an ankle-pinning `sweep_arc` knee-crush.
- **`Gyro Drive Smasher` (`Ultra — Before: Advance max | Hit: Pull X, +1 Power per tile`)**: Full-screen corkscrew drill (`3x` spin, 5 afterimages, `isUltra: true` `spiral_vortex`, `cameraPunch = 0.055`).
- **`CQC` (`Ultra — Range 1 attacks miss | Hit: Push/Pull X`)**: Close-quarters slip-counter into a `-2π` neck-scissors takedown throw (`cqc_neck_scissors_throw`).

### 10.3 Zangief Signature Choreography (`zangief`)
- **Red Super-Armor Frames (`hit_defend` Track 2 Additive Grit)**: When Zangief absorbs a hit without being stunned, his body flashes **bright super-armor red (`#ff2a2a`)** on Track 2 while holding his active grappler windup on Track 1.
- **`Atomic Suplex` (`Speed 6 | Hit: Push 3 | Critical, After: Close 3`)**: Fast lunging waist-lock into an overhead `-2π` belly-to-belly suplex (`hopHeight = 46 px`) that craters the arena floor (`ground_crater`); when `criticalPaid`, the `after` phase triggers an earth-shaking stomp dash (`zangief_critical_stomp_chase`) right back into Range 1.
- **`Banishing Flat` (`Range 2–3 | Critical: Range 4+ misses | After: Close 2`)**: Emerald-flame backhand (`green_hand_burst` VFX + `#22c55e` flash on Critical) followed by an `after` Close 2 stomp chase.
- **`Double Lariat` (`Opponents cannot move you | Armor 1, Guard 6`)**: Plants boots with Iron Wall chains and spins like a hurricane (`3x` spin + crimson/gold `cyclone` rings).
- **`Flying Power Bomb` (`Before: Close 2 | Critical: Stun Immunity`)**: Outstretched-hands charge (`flying_power_bomb_charge`) glowing bright red (`#ff2a2a`) when Critical, into a sky-high power bomb (`hopHeight = 54 px`) that craters the stone floor (`ground_crater`).
- **`Spinning Piledriver` (`Ignore Armor, Ignore Guard | Hit: Opponent discards 1`)**: Stratosphere command-grab leap (`hopHeight = 84 px`, `3x` drill spin) crashing headfirst into the canvas and visually shattering a queued command card (`spd_card_shatter` VFX).
- **`Siberian Blizzard` (`Ultra — Opponents cannot move past you | Before: Close 1 | Hit: Draw 2`)**: Anti-air intercept leap (`hopHeight = 78 px`, `2x` spin, Iron Wall chains locked) into an inverted bearhug vertical piledriver (`ground_crater`, `isUltra: true`).
- **`Ultimate Atomic Buster` (`Ultra — Power 11 | Hit: Both discard all cards`)**: Multi-stage cinematic suplex-to-sky-high Spinning Piledriver (`hopHeight = 96 px`, `4x` spin, 6 afterimages, `cameraPunch = 0.065`, `isUltra: true` `spd_card_shatter` wiping both hands).

### 10.4 Universal Normals (`Grasp`, `Cross`, `Assault`, `Dive`, `Spike`, `Sweep`, `Focus`, `Block`) & Passive Visual Signals
- **Cammy (`cammy`)**: `cammy_hooligan_neck_scissors` (Grasp), `cammy_spin_knuckle_backfist` + `cammy_hooligan_backflip` (Cross), `cammy_knee_bullet_rush` / `cammy_knee_bullet_strike` (Assault), `cammy_cannon_leap` / `cammy_cannon_leap_heel_drop` (Dive), `cammy_guillotine_axe_kick` (Spike), `cammy_crouching_roundhouse` (Sweep), `cammy_delta_red_counter_strike` (Focus), `cammy_tactical_guard` (Block).
- **Zangief (`zangief`)**: `zangief_headbutt_collar_toss` (Grasp), `zangief_heavy_chest_chop` + `zangief_iron_stepback` (Cross), `zangief_shoulder_tackle_rush` / `zangief_shoulder_tackle_impact` (Assault), `zangief_flying_body_press` / `zangief_flying_body_press_slam` (Dive), `zangief_double_hammer_fist` (Spike), `zangief_crouching_spinning_kick` (Sweep), `zangief_muscle_flex_clothesline` (Focus), `zangief_iron_curtain_block` (Block).
- **Cammy Cross-Up Heel Flash (`cammyCrossUpHeelFlash`)**: Whenever Cammy crosses past an opponent (via `Assault`, `Dive`, Specials, or voluntary movement), both calibrated red-boot sockets (`leadBoot`, `rearBoot`) fire razor-sharp emerald diamond starbursts (`cammy_heel_crossup_flash`) with a crisp floating `CROSS-UP · +1 POW · ADV` (or `+2 POW · ADV` when Exceeded) indicator as she flips behind their back.
- **Zangief "Iron Wall" Chains (`ironWallChains`)**: On `Block`, `Focus`, `Double Lariat`, and `Siberian Blizzard`, forged steel ankle cuffs and interlocking chains lock Zangief's calibrated `leadBoot` & `rearBoot` sockets down to iron floor bolts with an `IRON WALL · LOCKED` ground stamp.

---

## 11. Universal Zero Baked-In VFX Standee Law & Multi-Frame Paradigm 2 `Sweep` / `Cross` Architecture

### 11.1 Universal Standee Artwork Law: Zero Baked-In Fighting Game VFX (`vfxPolicy: 'procedural_exceed_only'`)

All character standees and multi-frame animation assets across every fighter in `FIGHTER_STANDEES` (`ryu`, `ken`, `cviper`, `cammy`, `zangief`, and all future fighters) obey an uncompromising **Universal Zero Baked-In VFX Standee Law**:

1. **Pure Anatomical & Attire Keyframes Only**:
   - Every standee image (`idle`, `sweep_windup`, `sweep_active`, `cross_strike`, `cross_retreat`, etc.) must depict **100% pure character anatomy, facial expression, and clothing/gear** on a solid flat `#FFFFFF` backdrop (or `#00D856` chroma-green for white-costumed fighters).
   - **Strictly Forbidden in Source Artwork**: Baked-in fire ribbons, glowing ki spheres, electricity/lightning bolts, painted speed-lines, motion-blur swoosh arcs, floating rocks, or glowing hands/eyes.
   - **Why**: Baked-in 2D energy trails deform unnaturally when the `4×6` WebGL2 mesh bends or scales, collide with white-background matting (`matteStandeeRgba`), stay frozen in mid-air during idle breathing, and blur the visual distinction between **Normal** state and **Exceeded (Overdrive)** state.

2. **Procedural Runtime VFX Gated by State (`Normal` vs. `Exceeded`)**:
   - **Normal State (`exceeded === false`, unboosted normal combat)**:
     - Standees render with **zero ambient elemental aura** (`u_rimStrength = 0` at rest) and **zero Startup Clash `auraFlare`** during normal Strike reveals.
     - Universal Normal attacks (`Sweep`, `Cross`, `Grasp`, `Assault`, `Dive`, `Spike`) emit **grounded, physical martial-arts feedback only**: floor dust arcs (`physical_sweep_dust`), crisp air-pressure fist/heel snap rings (`physical_cross_snap`), stone dust puffs (`dust`), and directional kinetic hit-sparks (`HitParticleEngine`).
     - *(Exception: Dedicated elemental Special/Ultra cards such as `Hadoken`, `Shoryuken`, `Metsu Hadoken`, or `Shinryuken` still render their signature procedural projectile/dragon energy because the card itself is an elemental technique.)*
   - **Exceeded State (`exceeded === true`)**:
     - Activates persistent WebGL2 Fresnel Rim Lighting (`u_rimColor`, `u_rimStrength`), silhouette-hugging elemental plumes (`renderExceedPersistentAura`), and **Exceed-upgraded procedural Strike VFX** welded to per-frame calibrated texture UV sockets (`leadFist`, `rearFist`, `leadBoot`, `rearBoot`, `leadShoulder`, `rearShoulder`).

---

### 11.2 Ryu & Ken Multi-Frame Paradigm 2 `Sweep` and `Cross` Pipeline

To make **Ryu** and **Ken**'s `Sweep` (`Range 1–3, Power 6, Speed 2, Guard 6`) and `Cross` (`Range 1–2, Power 3, Speed 6 — After: Retreat 3`) read like authentic *Street Fighter* frame data rather than single-pose mesh tilts, both fighters use a **5-frame Paradigm 2 crisp-cut asset set** (`blendDuration = 0`, `frameBlendAlpha = 1.0`) driven by `StandeeRigMath.resolveActiveFrameKey(choreo, u)`:

| Frame Key | Ryu Asset (`896×1200`, VFX-Free) | Ken Asset (`896×1200`, VFX-Free) | Calibrated UV Sockets `(uCoord, hCoord)` |
| :--- | :--- | :--- | :--- |
| **`idle`** | `/assets/aistudio/ryu_standee.jpg`<br>Disciplined Ansatsuken guard stance | `/assets/aistudio/ken_standee.jpg`<br>Brash loose brawler guard stance | • **Ryu**: `leadFist (0.77, 0.72)`, `rearFist (0.44, 0.61)`, `leadBoot (0.72, 0.10)`, `rearBoot (0.31, 0.11)`<br>• **Ken**: `leadFist (0.79, 0.78)`, `rearFist (0.31, 0.61)`, `leadBoot (0.72, 0.10)`, `rearBoot (0.29, 0.11)` |
| **`sweep_windup`** | `/assets/aistudio/ryu_sweep_windup.jpg`<br>Deep drop-crouch on rear leg, torso coiled, plant palm lowering | `/assets/aistudio/ken_sweep_windup.jpg`<br>Low coiled breakdance flare crouch, both palms planting on stone floor | • **Ryu**: `leadFist (0.64, 0.44)`, `rearFist (0.38, 0.34)`, `leadBoot (0.72, 0.12)`, `rearBoot (0.33, 0.11)`<br>• **Ken**: `leadFist (0.58, 0.24)`, `rearFist (0.35, 0.22)`, `leadBoot (0.74, 0.13)`, `rearBoot (0.28, 0.12)` |
| **`sweep_active`** | `/assets/aistudio/ryu_sweep.jpg`<br>Full horizontal `cr.HK` (*Ashi Barai*) low sweep kick, rear hand planted | `/assets/aistudio/ken_sweep.jpg`<br>Explosive two-hand floor-flare low roundhouse sweep kick (`Range 1–3`) | • **Ryu**: `leadFist (0.55, 0.48)`, `rearFist (0.34, 0.18)`, **`leadBoot (0.88, 0.14)`**, `rearBoot (0.33, 0.12)`<br>• **Ken**: `leadFist (0.48, 0.20)`, `rearFist (0.30, 0.16)`, **`leadBoot (0.90, 0.16)`**, `rearBoot (0.27, 0.14)` |
| **`cross_strike`** | `/assets/aistudio/ryu_cross.jpg`<br>Stepping straight right counter-cross punch (`Speed 6`) at full horizontal extension | `/assets/aistudio/ken_cross.jpg`<br>Aggressive leaning whipping counter-cross / backfist punch (`Speed 6`) | • **Ryu**: **`leadFist (0.89, 0.72)`**, `rearFist (0.38, 0.64)`, `leadBoot (0.76, 0.11)`, `rearBoot (0.24, 0.11)`<br>• **Ken**: **`leadFist (0.90, 0.73)`**, `rearFist (0.30, 0.62)`, `leadBoot (0.78, 0.11)`, `rearBoot (0.22, 0.11)` |
| **`cross_retreat`** | `/assets/aistudio/ryu_backdash.jpg`<br>Low ground-skimming defensive karate backdash hop with fists locked in high guard | `/assets/aistudio/ken_backflip.jpg`<br>Airborne hands-free tucked acrobatic back-somersault (`After: Retreat 3`) | • **Ryu**: `leadFist (0.74, 0.73)`, `rearFist (0.46, 0.65)`, `leadBoot (0.68, 0.16)`, `rearBoot (0.32, 0.14)`<br>• **Ken**: `leadFist (0.66, 0.62)`, `rearFist (0.38, 0.58)`, `leadBoot (0.74, 0.36)`, `rearBoot (0.42, 0.32)` |

### 11.3 Frame-Accurate `Sweep` & `Cross` Sequencing and Procedural VFX Differentiation

1. **`Sweep` (`Range 1–3, Power 6, Speed 2, Guard 6`)**:
   - **Startup Reveal (`0.40s`)**: Snaps directly to `sweep_windup` with compressed symplectic spring (`(1.12, 0.86)` for Ryu; `(1.18, 0.82)` for Ken).
   - **Active & Recovery Sequence (`hit_attack` / `range` whiff)**:
     - **Ryu (`ryu_ashi_barai_sweep`)**:
       - `u ∈ [0.00, 0.16)` → `sweep_windup` (coiled drop);
       - `u ∈ [0.16, 0.74)` → `sweep_active` (`+28 px` base lunge + dynamic target-bridging lunge, `4` ghost afterimages);
       - `u ∈ [0.74, 0.90)` → `sweep_windup` (re-chambering lead leg);
       - `u ∈ [0.90, 1.00]` → `idle`.
       - **Normal VFX**: `physical_sweep_dust` (3-layer grounded dust crescent + skidding floor pebbles welded to `leadBoot (0.88, 0.14)`).
       - **Exceeded VFX**: `ryu_ashi_barai_ki_sweep` (pressurized cobalt-and-white vacuum Ki crescent wave + Denjin ground-lightning sparks arcing from `leadBoot` across `Range 1–3`).
     - **Ken (`ken_flare_sweep`)**:
       - `u ∈ [0.00, 0.15)` → `sweep_windup`;
       - `u ∈ [0.15, 0.76)` → `sweep_active` (`+42 px` base lunge + dynamic target-bridging lunge, `5` high-velocity afterimages);
       - `u ∈ [0.76, 0.92)` → `sweep_windup` with **`spinPlane: 'horizontal_flare'`** (`wholeSpinRad = +2π` evaluated as a grounded Y-axis horizontal cosine breakdance spin `cos(rot)` around the vertical axis so Ken spins parallel to the floor without ever cartwheeling his head below the stones);
       - `u ∈ [0.92, 1.00]` → `idle`.
       - **Normal VFX**: `physical_sweep_dust` (warm sandstone skid-sparks and dust plumes kicked up by Ken's sweeping heel).
       - **Exceeded VFX**: `ken_flare_fire_sweep` (searing crimson-and-gold `300°` fire wheel + 10 orbiting flame tongues and hot ember cinders welded to `leadBoot (0.90, 0.16)`).

2. **`Cross` (`Range 1–2, Power 3, Speed 6 — After: Retreat 3`)**:
   - **Startup Reveal (`0.40s`)**: Coils in `idle` with forward-leaning waist torsion (`spring = (0.92, 1.06)`).
   - **Strike Step (`hit_attack` / `range` whiff)**:
     - `u ∈ [0.00, 0.12)` → `idle` (fast `Speed 6` snap);
     - `u ∈ [0.12, 0.78)` → `cross_strike` (`+26 px` Ryu / `+32 px` Ken counter-punch lunge);
     - `u ∈ [0.78, 1.00]` → `cross_retreat` (early rebound coil into backdash/backflip).
     - **Normal VFX**: `physical_cross_snap` (translucent sonic air-pressure shock rings + kinetic punch lines radiating from `leadFist (0.89..0.90, 0.72..0.73)`).
     - **Exceeded VFX**:
       - **Ryu**: `ryu_denjin_cross_lance` (cobalt-cyan Ki vacuum lance + jagged electric Denjin lightning bolt + Mach cone welded to `leadFist (0.89, 0.72)`).
       - **Ken**: `ken_crimson_cross_whip` (blazing crimson-gold fire punch cone + twin whipping flame ribbons + explosive ember burst welded to `leadFist (0.90, 0.73)`).
   - **Retreat Step (`after` / `move` for `Cross — After: Retreat 3`)**:
     - **Ryu (`backdash_hop`)**: Cuts to `cross_retreat` (`u ∈ [0.00, 0.86)`) for a low `10 px` defensive karate glide backward across 3 spaces with zero facing flip, settling into `idle` (`u ∈ [0.86, 1.00]`). Normal state emits `dust`; Exceeded state emits `ryu_backdash_ki_wake` (pulsing cyan afterimage rings + ground lightning skids).
     - **Ken (`backflip`)**: Cuts to `cross_retreat` (`u ∈ [0.00, 0.88)`) for a `34 px` high airborne `-2π` XY-plane tucked somersault (`spinPlane: 'xy'`, `wholeSpinRad = -2π`, suppressed when `reducedHitStop` is active), landing in a wide crouch (`u ∈ [0.88, 1.00]` → `idle`). Normal state emits `dust`; Exceeded state emits `ken_backflip_fire_wheel` (mid-air spiral flame wheel + 8 orbiting fireballs around Ken's pelvis centroid).

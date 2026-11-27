# Standee Animation Creation Experience — Pitfalls, Lessons Learned & What to Avoid Next Time

This document captures the complete engineering retrospective from designing, building, debugging, and visually verifying the **60 FPS WebGL2 Deformable Standee Animation & Fighting-Game VFX Engine** (`game/standees.js`, `game/standee-stage.js`, `game/playback.js`, `tests/standees.test.ts`) for **Ryu** and **Ken** in *Exceed Revival*.

---

## 1. Executive Summary: From Rigid Board Tokens to a 60 FPS Fighting Stage

Turning static full-body standee illustrations (`ryu_standee.jpg`, `ken_standee.jpg`, `image_9b961de0.png`) inside a turn-based tabletop card game into an expressive, 60 FPS arcade fighting experience (*Street Fighter*, *Guilty Gear*, *Dragon Ball FighterZ*) required solving a fundamental tension:
- **Board-Game Truth**: Positions are discrete integers (`Arena Spaces 0..8`), card effects resolve deterministically via a generator (`*resolveStrikeSteps`), and `paint()` (`game/render.js`) replaces the entire `#app` DOM subtree on every state change.
- **Fighting-Game Feel**: Attacks across variable ranges (`Range 1–3`) must make physical contact, `Before:` movements must flow seamlessly into `Hit:` impacts, `Armor` vs. `Guard` vs. `Stun` must read in a split second, and **Exceed Mode** must transform a fighter's presence for the rest of the match without turning their artwork into an unreadable particle blob.

---

## 2. The 10 Major Pitfalls We Hit (And How We Fixed Them)

### Pitfall 1: Persistent Canvases Wiped Mid-Animation by `#app.innerHTML` Repaints
- **What Happened**: In `game/render.js`, `paint()` rebuilds `#app.innerHTML` from scratch on every action, mode transition, and Strike step. Any `<canvas>`, WebGL context, or CSS `@keyframes` state living inside `boardHTML()` is destroyed the instant the player clicks a button or the Strike timeline advances.
- **What We Learned to Do**:
  - Mount the WebGL2 deformable mesh canvas and foreground VFX canvas in a permanent sibling container (`#standee-stage-root` at `z-index: 50`) **outside `#app`**.
  - Keep `.token.has-standee[data-pid][data-char][data-facing]` inside `boardHTML()` as invisible layout/accessibility beacons (`opacity: 0` when WebGL2 takes over) and sync WebGL2 world coordinates via `getBoundingClientRect()` on the `.cell[data-space]` and `.standee-anchor` elements.
- **What to Avoid Next Time**:
  - Never put stateful animation loops, WebGL contexts, or multi-step CSS transitions inside a wholesale-repaint DOM tree (`#app`), and never delete the DOM token markers that accessibility snapshots, `HitParticleEngine`, and headless tests query.

### Pitfall 2: White-Matte Flood-Fill Eating White Garments & Leaving Halos on Elemental Auras
- **What Happened**: Naive brightness thresholding (`R, G, B > 240`) either erodes bright clothing touching the frame or leaves harsh white/gray halos around semi-transparent elemental effects (Ryu's cyan ki swirls and Ken's orange-red fire ribbons blended against a white studio backdrop).
- **What We Learned to Do**:
  - Implement a 3-stage pure RGBA matting kernel (`matteStandeeRgba` in `game/standees.js`):
    1. **4-Connected Border Flood-Fill** on neutral bright pixels (`minRGB >= 232`, `maxRGB - minRGB <= 14`) so enclosed off-white fabric (Ryu's karate gi) is never touched.
    2. **Enclosed Pure-Neutral Hole Clearing** (`holeMinSize >= 16`, `holeAvgMin >= 247`, `holeAvgSat <= 6`) to clear trapped backdrop pockets between limbs and torso.
    3. **4-Pixel Distance-Band Color Unpremultiplication (`bgRef = 252`)** along the alpha boundary to strip white backdrop spill from cyan ki and orange fire fringes while keeping the saturated elemental colors vibrant.
- **What to Avoid Next Time**:
  - Never couple pixel-matting math to browser `CanvasRenderingContext2D` APIs—keep the RGBA buffer kernel pure (`Uint8ClampedArray`) so `node:test` can verify gi preservation and aura decontamination in milliseconds without launching a browser.

### Pitfall 3: Horizontal Hip-Teleportation from Bounding-Box Centering
- **What Happened**: Anchoring a standee's horizontal center at the full image bounding-box midpoint `(minX + maxX) / 2` shifts the fighter's pelvis horizontally by `10–20 px` whenever an extended lead arm, kick, or aura plume extends asymmetrically to one side. When the standee flips facing (`scaleX`), the character visibly teleports sideways off their Arena Space plinth.
- **What We Learned to Do**:
  - Compute `anchorXRatio` exclusively from the opaque pixel centroid inside the **`35%..65%` vertical pelvis/torso band** (`calibrateStandeeRgba`), locking the fighter's center of mass over `.standee-ground-ring` regardless of arm extension or facing direction.
- **What to Avoid Next Time**:
  - Never use full-frame width midpoint `0.5` as a character's pivot when arms, weapons, or elemental ribbons extend past the torso silhouette.

### Pitfall 4: Opacity Cross-Dissolves ("Two Heads / Four Legs") & `0 / 0 = NaN` During Hitstop
- **What Happened**: Attempting to smooth pose changes with opacity cross-fades (`blendDuration > 0`) produces double-exposure limb ghosting. Worse, evaluating `elapsed / blendDuration` when `blendDuration === 0` during a `dt === 0` hitstop freeze produces `0 / 0 = NaN`, corrupting the WebGL vertex buffer and making the standee disappear for a frame.
- **What We Learned to Do**:
  - Enforce **Strict Crisp Cuts (`blendDuration = 0`, `frameBlendAlpha = 1.0`)** with an explicit `if (blendDuration <= 0) return 1.0;` guard before division (`StandeeRigMath.computeFrameTransitionState`).
  - Generate all `60 FPS` fluidity from the **`4×6` WebGL2 Deformable Mesh**, **4-Knot Hermite Spine (`feet`, `pelvis`, `waist`, `head`)**, and **2-sub-step Symplectic Euler squash-and-stretch spring** (paused cleanly whenever `hitstopRemaining > 0`).
- **What to Avoid Next Time**:
  - Never unpin the `feet` knot (`h = 0.00`) during grounded idle, windup, or guard brace poses—sliding feet ruin the grounded tabletop standee illusion.

### Pitfall 5: Punching Empty Air on Variable-Range Moves (`Range 1–3`) & Stiff Whiffs
- **What Happened**: In Exceed, a card like `Sweep` (`Range 1–3`) or `Spike` (`Range 2–3`) can hit from 1, 2, or 3 spaces away. A fixed `+30 px` lunge makes contact at `Range 1` but punches empty air at `Range 3`. Conversely, playing a full attack follow-through when a move misses (`Out of Range`) looks disconnected from the board outcome.
- **What We Learned to Do**:
  - **Dynamic "Lunge-and-Return" Root Motion (`computeDynamicLungeOffset`)**: Measure the exact pixel distance between the attacker's space and the target space (`distanceToTargetPx`) at the start of the Strike, surge `55%–82%` of that distance during Startup/Active frames, add **IK Target Snapping (`computeIkReachPx`)** on the upper spine, and project **Range-Stretching Weapon/Ki Smear Trails** (`sweep_low_arc`, `armor_pierce_lance`, `overhead_drop_arc`) all the way to the target space before returning to the authoritative grid space during Recovery.
  - **Universal 3-Clip (`Startup -> Active -> Recovery`) Whiff Blending (`computeClipEnvelope`)**: If a Strike misses (`whiffed: true`), cancel the `Active` clip at `38%` and blend directly into a shared off-balance **"Whiff Recovery"** stumble (`waist.rotRad = +0.16 rad`, `14 Hz` recovery wobble).
- **What to Avoid Next Time**:
  - Never author separate custom whiff animations for every card, and never mutate engine board positions to fake visual reach.

### Pitfall 6: Accidental Facing Flips on Backdash Retreats (`Cross — After: Retreat 3`)
- **What Happened**: Early movement logic triggered a horizontal turnaround whenever a fighter moved away from the opponent (`vx` opposite to `facingSign`), causing Ryu and Ken to turn their backs to the opponent when retreating with `Cross` (`After: Retreat 3`).
- **What We Learned to Do**:
  - Gate facing changes strictly on a swap in relative board ordering: `(prevMyPos < prevOppPos) !== (nextMyPos < nextOppPos)`.
  - Trigger the **`2.5D` Paper-Mario Cosine Flip (`stepHorizontalFlip`)** at the **exact X-crossover midpoint** during cross-up moves (`Dive — Before: Advance 3`), clamping `|scaleX| >= 0.04` and keeping `hopYPx <= 0` so the standee arcs cleanly above the floor pad.
  - Express character identity through backdash kinematics without flipping facing: Ryu executes a **low `10 px` disciplined karate hop** with high guard, while Ken executes a **flashy `-2π` tucked back-somersault (`34 px` arc)** around his pelvis centroid (`h = 0.38`).
- **What to Avoid Next Time**:
  - Never tie character facing direction to velocity sign (`Math.sign(vx)`); in fighting games, fighters always face their opponent regardless of whether they are advancing or backdashing.

### Pitfall 7: Unreadable Speed Clashes & Indistinguishable `Armor` vs. `Guard` vs. `Stun`
- **What Happened**: When the faster Strike activated immediately at `t = 0`, players couldn't tell what the slower fighter had attempted. Furthermore, playing the same generic flinch for `0-damage Armor tank`, `Guard held (not stunned)`, and `Stunned` hid Exceed's most important tactical distinction: whether the defender survives to counter-attack.
- **What We Learned to Do**:
  - **Startup Clash Freeze (`0.40s` `reveal` step)**: Simultaneously coil both fighters into their startup poses with a `"VS"` clash spark between them and a Startup Aura Flare before the faster attack launches.
  - **3-Way Defensive Choreography (`resolveStandeeChoreography('hit_defend')`)**:
    1. **Armor (`damage <= 0`)**: Golden/metallic flash (`#ffd166`) + hexagonal clang ring + `0 px` knockback (`guard_brace`).
    2. **Guard Held (`damage > 0 && !stunned`) — "Super Armor" Grit**: Run the hit-flinch on **Track 2 (Additive Flinch)** while **Track 1 holds the defender's attack windup pose**, visually proving they absorbed the hit and are still coiled to strike back.
    3. **Stunned (`stunned === true`)**: Heavy hitstop (`0.18s–0.22s`) with `38 Hz` `±5 px` horizontal root shudder, camera zoom punch, desaturation, and full Track 1 abort into `heavy_crumple_reel`.
- **What to Avoid Next Time**:
  - Never overwrite a non-stunned defender's Track 1 startup pose when they take non-stunning damage; use multi-track additive layering (`Track 2`) so the counter-attack transition feels continuous.

### Pitfall 8: Full-Body Tint Mud vs. WebGL2 Fresnel Rim Lighting (The Silhouette Saver)
- **What Happened**: Indicating **Exceed Mode** by tinting the whole sprite (`u_tintAmount > 0`) or covering the torso in opaque smoke washes out facial expressions, gi folds, and limb silhouettes during fast combat.
- **What We Learned to Do**:
  - Keep interior artwork `100%` unmuddied (`u_tintAmount = 0`) and implement a **WebGL2 Fresnel Rim-Light Fragment Shader (`u_rimColor`, `u_rimStrength`)** using a 4-tap neighbor-alpha gradient (`edge = a * (1.0 - minNeighborAlpha)`).
  - Layer character-specific silhouette-hugging VFX behind/around the crisp rim-lit fighter:
    - **Ryu (Focused & Electric)**: Tight white-and-cobalt (`#e0f2fe` / `#38bdf8`) vertical Ki plumes synced to his `1.55 Hz` breathing, sporadic **Denjin lightning arcs** snapping between his fists and shoulders, and levitating courtyard stone pebbles.
    - **Ken (Wild & Fiery)**: Wider crimson-and-gold (`#ff4d2e` / `#fbbf24`) dancing flame plumes, an ignited lead-fist flame cluster, and drifting hot cinders trailing behind his feet on every dash or backflip.
    - **Cammy (High-Velocity Delta Red & Iconic Red Boots)**: Emerald-and-cyan (`#10b981` / `#6ee7b7`) helical spiral wind ribbons + glowing **crimson-red kinetic boot halos (`#ff2a4b`)** welded to her iconic calf-high red combat boots (`leadBoot`/`rearBoot` UV sockets).
    - **Zangief (Colossal Red Cyclone & Super-Armor)**: Swirling crimson-and-gold (`#ef4444` / `#fde047`) cyclone bands around his `heightScale = 1.24` torso, ignited gold wrestling bracer flares, bright `#ff2a2a` red super-armor flashes on Track 2 additive grit, and heavy stone chunks lifting off the floor around his boots.
- **What to Avoid Next Time**:
  - Never use full-sprite color washes for persistent power-up states; rim lighting preserves 100% of interior line art while reading unmistakably at a glance.

### Pitfall 9: World-Space VFX Socket Drift on a Deformable Mesh
- **What Happened**: Calculating VFX emitter sockets (`leadFist`, `leadShoulder`, `leadBoot`, `rearBoot`) with undeformed world-space offsets (`fx + facingSign * width * 0.27`, `fy - height * 0.65`) placed Ken's ignited fist flame in the empty air below his raised glove—and caused fist or boot VFX to detach whenever the 4-Knot Spine crouched (`exceed_idle`), leaned (`Sweep` / `Razor's Edge Slicer`), or backflipped (`Cross`).
- **What We Learned to Do**:
  - Author all anatomical VFX sockets in **normalized texture UV space `(uCoord, hCoord)`** measured directly from the source artwork:
    - `ryu_standee.jpg`: lead glove `(0.88, 0.78)`, rear glove `(0.43, 0.65)`, shoulders `(0.58, 0.77)` / `(0.34, 0.77)`
    - `ken_standee.jpg`: raised lead glove `(0.85, 0.81)`, rear glove `(0.29, 0.60)`, shoulders `(0.52, 0.77)` / `(0.27, 0.76)`
    - `cammy_standee.jpg`: lead gauntlet `(0.83, 0.72)`, rear gauntlet `(0.40, 0.63)`, shoulders `(0.55, 0.74)` / `(0.42, 0.74)`, **iconic red boots** `leadBoot (0.81, 0.14)` / `rearBoot (0.14, 0.14)`
    - `zangief_standee.jpg`: lead fist `(0.86, 0.49)`, rear fist `(0.30, 0.47)`, shoulders `(0.73, 0.78)` / `(0.31, 0.80)`, wrestling boots `leadBoot (0.76, 0.12)` / `rearBoot (0.21, 0.12)`
  - Evaluate every socket through the exact same **`StandeeRigMath.computeDeformedMeshVertex(uCoord, hCoord, _meshParams, _vertOut)`** pipeline used by the WebGL2 vertex buffer.
- **What to Avoid Next Time**:
  - Never approximate anatomical attachment points with static bounding-box offsets when the underlying sprite is deformed by a spine, spring, or rotation matrix.

### Pitfall 10: Cold-Start Server Dependencies, `.gitignore` Generated Artifacts & Partial Test Mocks
- **What Happened**:
  1. `server.ts` imported `express` at top level, which caused cold container starts to fail with `ERR_MODULE_NOT_FOUND` if the dev server launched while `node_modules` was still installing.
  2. `native/generated/` was listed in `.gitignore`, causing `tests/native-protocol.test.ts` (`checked-in card-dsl.json is fresh`) to fail with `ENOENT` after container resets if `export-card-dsl.mjs` hadn't just run.
  3. Pushing mock entries like `{ name: 'Focus' }` into `player.boostsInPlay` during browser visual tests crashed `render.js` because `render.js` expects `{ card: { uid, name, boost }, label }`.
- **What We Learned to Do**:
  - Use Node's built-in `node:http` in `server.ts` and `"dev": "node server.ts"` (Node 22 native TypeScript) so the dev server starts in `<100 ms` with zero external runtime dependencies.
  - Auto-run `ensureCardDslExport()` inside `scripts/build-game.mjs` and keep `native/generated/card-dsl.json` tracked in git.
  - When mocking engine state in Playwright `eval` snippets, match the exact object schema (`{ card: { uid, name, boost }, label }`) and access players via `G.engine.P('p1')` / `G.engine.P('p2')`.

### Pitfall 11: Baked-In Fighting Game VFX Energy in Standee Artwork vs. Universal Procedural Exceed-Only VFX Law
- **What Happened**: Early standee illustrations had painted fire swirls, cyan ki spheres, or motion arcs baked directly into the 2D character JPEG/PNG. That created four compounding problems:
  1. **Mesh Distortion**: When the `4×6` WebGL2 mesh bent or squashed, baked-in energy arcs warped like rubber attached to the fighter's limbs.
  2. **Frozen Energy at Rest**: A fighter standing in neutral `Idle` had frozen mid-air flames or ki ribbons stuck to their silhouette.
  3. **Matting Fringe Artifacts**: Semi-transparent painted glow blended into the `#FFFFFF` backdrop required aggressive fringe decontamination and widened the silhouette bounding box.
  4. **Lost Exceed Progression**: When un-Exceeded characters already had glowing hands and fire in their base sprite, transforming into **Exceed Mode** lacked visual contrast, and basic Normal cards (`Sweep`, `Cross`) looked like magical Supers even in Normal state.
- **What We Learned to Do (`vfxPolicy: 'procedural_exceed_only'`)**:
  - **Universal Standee Artwork Law**: Every standee and animation keyframe (`idle`, `sweep_windup`, `sweep_active`, `cross_strike`, `cross_retreat`, etc.) across **all fighters** (`ryu`, `ken`, `cviper`, `cammy`, `zangief`, and all future additions) must contain **zero baked-in fighting-game VFX/energy**—100% pure character anatomy, facial expression, and attire on a solid `#FFFFFF` backdrop.
  - **State-Gated Procedural VFX**:
    - In **Normal State (`exceeded === false`)**, suppress ambient Fresnel rim glow and Startup Clash `auraFlare`, and render **grounded physical martial-arts effects** on Normal attacks (`physical_sweep_dust` stone dust & pebble skids on `Sweep`; `physical_cross_snap` translucent air-pressure shock rings on `Cross`).
    - In **Exceeded State (`exceeded === true`)**, procedurally ignite the fighter with WebGL2 Fresnel Rim Lighting, persistent elemental plumes, and full elemental Strike VFX welded to per-frame calibrated UV sockets (`ryu_ashi_barai_ki_sweep`, `ken_flare_fire_sweep`, `ryu_denjin_cross_lance`, `ken_crimson_cross_whip`, `ryu_backdash_ki_wake`, `ken_backflip_fire_wheel`).
- **What to Avoid Next Time**:
  - Never prompt or accept character standee artwork with fire, lightning, ki blasts, glowing eyes/hands, or painted swoosh trails baked into the image. Always generate pure anatomical keyframes first and layer procedural VFX at runtime gated by `exceeded` (or explicit elemental Special/Ultra card IDs).

### Pitfall 12: Single-Pose Mesh Tilts vs. Multi-Frame Crisp-Cut `Sweep` & `Cross` (And Grounded Y-Axis Flare Spin vs. XY Cartwheel)
- **What Happened**:
  1. Deforming a single upright `idle` standee via the 4-Knot Spine can express breathing, guard braces, and uppercuts, but cannot turn an upright standing karate stance into a floor-skimming `cr.HK` sweep kick (`Sweep`) or a full-extension horizontal counter-punch (`Cross`) + tucked airborne back-somersault (`After: Retreat 3`).
  2. Applying an XY-plane 2D rotation (`wholeSpinRad = +2π` around the pelvis) to Ken's grounded `Sweep` caused his extended legs and head to cartwheel vertically beneath the stone arena floor.
- **What We Learned to Do**:
  - **Multi-Frame Paradigm 2 Crisp-Cut Sequences (`frameSequence` + `StandeeRigMath.resolveActiveFrameKey`)**: Register dedicated VFX-free keyframes per fighter (`idle`, `sweep_windup`, `sweep_active`, `cross_strike`, `cross_retreat`), calibrate each frame independently via `calibrateStandeeRgba` (`35%..65%` pelvis centroid + sole-locked `footBottomRatio`), and switch textures with strict `blendDuration = 0` crisp cuts while the 4-Knot Spine and symplectic spring provide `60 FPS` sub-frame follow-through.
  - **Per-Frame Calibrated `uvSockets`**: Store per-frame `uvSockets` (`leadFist`, `rearFist`, `leadBoot`, `rearBoot`, `leadShoulder`, `rearShoulder`) on each frame definition so `renderVfxLayer` welds foot sweeps to `sweep_active.uvSockets.leadBoot` (`(0.88..0.90, 0.14..0.16)`) and counter-punches to `cross_strike.uvSockets.leadFist` (`(0.89..0.90, 0.72..0.73)`).
  - **Separate Grounded Horizontal Spin (`spinPlane: 'horizontal_flare'`) from Airborne Somersault (`spinPlane: 'xy'`)**: For Ken's grounded `Sweep` recovery flourish, evaluate `wholeSpinRad = +2π` with `spinPlane: 'horizontal_flare'` (a `2.5D` Y-axis cosine turn `cos(rot)` confined to the recovery window `u ∈ [0.68, 0.94]`), keeping his body horizontal on the arena floor, whereas Ken's airborne `Cross` `After: Retreat 3` backflip uses `spinPlane: 'xy'` at `hopHeight = 34 px`.
- **What to Avoid Next Time**:
  - Never apply an XY-plane full-body rotation (`wholeSpinRad`) to a low grounded pose without either sufficient `hopHeight` clearance or `spinPlane: 'horizontal_flare'`.

### Pitfall 13: Blurry `300×150` Initial Canvas, Hitstop `u` Rewind Flicker, and Empty `after` Steps Stomping Active Attacks
- **What Happened**:
  1. `mount()` in `game/standee-stage.js` called `resize()` **before** setting `mounted = true`, while `resize()` returned early if `!mounted`. Until a window resize occurred, both WebGL2 and VFX canvases stayed at the HTML default `300×150` backing buffer stretched across the full viewport, visibly blurring standees.
  2. Applying `hitstopRemaining` at `choreoElapsed = 0` while temporarily clamping `u = Math.max(0.25, rawU)` during hitstop caused a backward rewind the instant hitstop expired: `u` jumped `0.25 → 0.00 → 0.16`, flickering `sweep_active → sweep_windup → sweep_active` and snapping the lunge backward mid-hit.
  3. Unconditionally calling `startChoreography(att, afterChoreo)` on `step.phase === 'after'` stomped and cut off `Sweep`'s active leg extension and Ken's `360°` breakdance flare follow-through because `Sweep` has no `After:` movement effect and returned a generic `idle` recovery pose.
  4. Showing `cross_strike` (fully extended punch) during `reveal` left no anticipation-to-impact snap when `Cross` actually fired.
- **What We Learned to Do**:
  - Remove the `!mounted` early-return from `resize()` and re-check backing buffer size inside `syncDomMetrics()` so canvases always render at native HiDPI (`viewport × dpr`).
  - Use **Contact-Triggered Monotonic Hitstop (`pendingHitstopSec` + `hitstopTriggerU`)**: advance startup cleanly (`0 → hitstopTriggerU`), freeze at the exact impact frame (`choreoElapsed = hitstopTriggerU * duration`), and resume monotonically forward (`hitstopTriggerU → 1.0`) when hitstop expires.
  - On `step.phase === 'after'`, only trigger a new choreography if the fighter actually moved spaces or has a dedicated non-recovery `after` pose (`Cross` `After: Retreat 3`), and sync `f.moveDuration` to `choreo.durationSec * 0.90` so airborne retreats land cleanly on their destination tile.
  - Author dedicated VFX-free anticipation & follow-through frames (`ryu_cross_windup.jpg`, `ken_cross_windup.jpg`, airborne `ryu_backdash.jpg`, `ken_sweep_flare.jpg`) so every multi-frame Strike flows smoothly from coiled anticipation → crisp contact → follow-through → recovery.

### Pitfall 14: Fixed `210px` Lunge Caps & Origin-Anchored VFX on 3-Space `Sweep` Strikes
- **What Happened**:
  1. `StandeeRigMath.computeDynamicLungeOffset` capped `reachBridge` at `210 px` (`86 px` on whiff). On a `1440 px` viewport where 1 board space is `~157 px`, a Range 3 `Sweep` (`~471 px` separation) stopped more than 1.5 spaces short of the opponent, visually kicking empty air instead of reaching 3 spaces.
  2. Sweep VFX (`physical_sweep_dust`, `ryu_ashi_barai_ki_sweep`, `ken_flare_fire_sweep`) were anchored statically to the starting tile `v.x` instead of following the sliding fighter, stranding dust clouds and Ken's `360°` breakdance flare ring 3 spaces behind the actual impact.
  3. Because `computeDynamicLungeOffset` peaked at `u = 0.24` while contact hitstop froze at `u = 0.17–0.18`, the impact freeze frame locked slightly before full ankle contact.
- **What We Learned to Do**:
  - Add an opt-in **`slideReach`** kinematics profile for Ryu & Ken `Sweep` (`karate_heel_slide` for Ryu, `breakdance_flare_slide` for Ken) that computes uncapped ankle-contact lunge distance (`distanceToTargetPx - fighterWidth * clearanceRatio`) and aligns `peakU` directly with `hitstopTriggerU` (`0.18` Ryu / `0.17` Ken), while holding Ken at the contact zone (`holdEndU: 0.68`) so his `360°` `sweep_flare` spins right under the opponent's ankles before whipping back home.
  - Use **Dual-Anchor Floor Skid VFX (`originX` + live `followPid` + `maxSlideX`)**: draw continuous heel-skid dust streaks (Normal) or Denjin lightning / scorching fire ribbons (Exceeded) from `originX → maxSlideX` across all traversed spaces while centering the contact sweep crescent / breakdance fire vortex on the live sliding fighter `v.x`.

---

## 3. Quick Reference Checklist for Future Standee Additions

| Do This Next Time | Avoid This Next Time |
| :--- | :--- |
| **Enforce the Universal Zero Baked-In VFX Rule (`vfxPolicy: 'procedural_exceed_only'`)** on every standee and animation frame: 100% pure character anatomy & clothing on `#FFFFFF`. | Baking fire, ki, lightning, glowing fists, or motion-blur ribbons into standee JPEGs/PNGs. |
| **Gate elemental Normal-attack VFX and ambient rim glow to Exceeded state (`exceeded: true`)**, keeping Normal-state basic attacks grounded (`physical_sweep_dust`, `physical_cross_snap`). | Turning every un-Exceeded basic punch or sweep into a neon particle explosion that leaves nowhere to escalate when Exceed triggers. |
| **Author multi-frame Paradigm 2 keyframes (`sweep_windup`, `sweep_active`, `cross_strike`, `cross_retreat`) with per-frame `uvSockets`** when limb topology changes radically from `idle`. | Relying solely on 4-Knot Spine shear to fake a horizontal floor sweep or tucked backflip from a standing idle pose. |
| **Use `spinPlane: 'horizontal_flare'` (Y-axis cosine turn)** for grounded spinning kicks/sweeps, and reserve `spinPlane: 'xy'` for high airborne somersaults (`hopHeight >= 30 px`). | Rotating a grounded standee in the 2D XY plane where head and boots clip below the arena floor. |
| **Inspect raw artwork first** (`view_file`) to measure exact `(uCoord, hCoord)` UV sockets for hands, feet, weapons, and shoulders on every frame. | Guessing world-space socket offsets (`width * 0.25`, `height * 0.62`) without checking the actual pose silhouette. |
| **Evaluate all VFX sockets through `computeDeformedMeshVertex`** so flames, lightning, and weapon trails move with the 4-Knot Spine and spring. | Drawing VFX at rigid `(f.x + dx, f.groundY - dy)` coordinates that detach when the character crouches, lunges, or flips. |
| **Compute `anchorXRatio` from the `35%..65%` pelvis/torso band** on every frame and keep the `feet` knot (`h = 0`) strictly pinned on grounded poses. | Centering on the full image bounding box `(minX + maxX) / 2` or letting the feet knot slide off `.standee-ground-ring`. |
| **Decouple pure math kernels (`StandeeRigMath`, `matteStandeeRgba`, `resolveStandeeChoreography`)** and unit-test them via `node:test` (`tests/standees.test.ts`). | Embedding animation math inside DOM/WebGL closures where regressions can only be caught manually in a browser. |


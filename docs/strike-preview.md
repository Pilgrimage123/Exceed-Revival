# Strike Preview Architecture & Specification

The **Strike Preview** system predicts the outcome of playing any candidate card as a Strike (normal, EX, Critical, or Optional spend) against the **current visible board state** — showing effective **Range**, **Movement** (`Before`, `Hit`, `After`), **Expected Hit / Exact Miss Reason**, and **Projected Life Loss** across all HUD and arena surfaces without ever leaking hidden opponent information.

---

## 1. Fog-of-War Guarantee (Information Set Boundary)

`SimulateStrikePreview.run(infoSet, rawCard, opts)` in `game/preview.js` is a **pure function** that consumes **only** `Engine.prototype.getInformationSet(playerId)`:

- **Actor (you)**: position, Eddie position, life/maxLife, Exceeded state, Advantage, hand keys, Gauge, active Continuous Boosts, Discard/Sealed/Overdrive, and own-turn flags (`canceledThisTurn`, `actionStrikeThisTurn`).
- **Opponent (CPU)**: position, Eddie position, life/maxLife, Exceeded state, Advantage, public hand/deck/gauge counts, active Continuous Boosts (and their visible stat/immunity/debuff modifiers), Discard/Sealed/Overdrive.
- **Never read**: opponent hidden hand contents, deck order, or face-down Strike card. All predictions explicitly represent the **public-state baseline** (e.g., `Public Lethal`), noting that the opponent's hidden Strike card may change Speed order, Armor, Guard, or position.

---

## 2. Phase-Ordered Rules Parity

`SimulateStrikePreview.run` mirrors the exact resolution sequence of `Engine.prototype.resolveStrikeSteps` (`game/engine.js`) across all 41 fighters:

| Phase | Rules Modeled in `game/preview.js` | Key Character / Card Parity |
|---|---|---|
| **1. Post-Set Hand & Card Stats** | Removes 1 played card (or 2 for EX) from simulated hand before computing dynamic stats; applies EX `+1` all stats, Continuous Boosts, character innates/Exceeds, opponent `opponentPowMod` debuffs, `canceledThisTurn`, `actionStrikeThisTurn`, `spdBonusPerRangeAtSetTime`, `spdPerGaugeCard`, `selfArmorZero`, and `guardEqualsHandSize`. | Baiken (`hand.length <= 3`), Jin Astral (`guardEqualsHandSize`), Sol Badguy (`canceledThisTurn`), I-No/Giovanna (`actionStrikeThisTurn`), Street Fighter Criticals (`[C]`), Vega free Critical (`forcesFreeCritical`), Zangief Range-1 Critical, Akuma mutual Critical POW. |
| **2. Effective Range** | Evaluates printed `[min, max]` + `rangeMaxBonusIfInitiating` + active boost `rangeMaxBonus` + numeric `normalsRangeBonus` + `attackRangeBonus` + `setOptionRangeBonus` + `dynamicRangeMaxBonus`. | Axl Low (`+2` Normal max range), Chun-Li Exceed, Nu-13 Exceed (`+4`), Ken `Knee Bash`, Zangief `Banishing Flat`, Jack-O. |
| **3. Before Movement** | Simulates boost-granted `Before:` movement, character `attackBeforeHook`, card `hooks.before`, Critical `critical.before`, and optional `[Shift]` `optionalRetreat` via `Engine.simulateMovementPath`. Applies `opponentCannotMove` boost blocks and `selfMoveCap` caps. Tracks exact stepped path, Cross-Up (`didCrossUp`), and corner wall stop (`wallTruncated`). | `Dive`, `Assault`, Iron Tager (`selfMoveCap`), Jin/Nu-13 (`opponentCannotMove`), Ryu Critical `Shoryuken` (`Before: Close 1`). |
| **4. Hit / Miss & Origin Validation** | Measures distance from `eddiePos` for Zato-1 Specials/Ultras (`usesEddie`) or from `postBeforeSpace`. Checks `alwaysMiss`, `noHitWithoutContinuousBoost`, `selfCannotHit`, visible opponent boost `rangeImmuneRanges`, effective range band, and side-swap hit inclusion (`char.sideSwapRangeInclude` / `card.rangeIncludeIfSideSwapped`). | Zato-1 (Eddie origin), Cammy (`sideSwapRangeInclude`), Chun-Li (`Head Stomp`), Cammy Dive Kick boost (`rangeImmuneRanges`), C. Viper (`Burst Time`), Ragna (`Gauntlet Hades`), `Block` (`alwaysMiss`). |
| **5. Hit Hooks & Opponent Push/Pull** | When expected to hit, simulates `hooks.hit`, `critical.hit`, `exceededSideSwapHit`, generator hit hooks (`attackHitHook`, `normalsHitHook`), boost `onHit`, and `[Shift]` optional Force/Gauge branches **before** damage math. Computes deterministic opponent push/pull destination (`oppPostHitSpace`, `oppHitMovePath`), wall-bounce POW bonuses, `ignoreGuardThisHit`, `gainLife`, `grantAdvantage`, and Push/Pull immunity (`movementImmuneGrant`). | Sol `Tyrant Rave` (Push 2 + corner `+2 POW`), Cammy Exceed Cross-Up (`+1 POW` + Advantage), Ragna life gain, Iron Tager Spark Bolt push/pull immunity, C. Viper `Temple Massage` (`optionalForceSpendForPow`), `Grasp` (choice summary). |
| **6. Damage & Life Loss** | Computes `projectedDamage = max(0, effectivePow - (ignoreArmor ? 0 : oppVisibleArm))`, `oppLifeBefore → oppLifeAfter (-oppLifeLoss)`, `damageFormula`, `isPublicStateLethal`, and `breaksVisibleGuard`. Deterministic card draws (`Focus`, `Siberian Blizzard`) record `Draw N` without masking damage as `?`. | `Focus` (shows deterministic `4` DMG + `Draw 1`), `Cross` (shows deterministic `3` DMG), Armor-piercing & Guard-ignoring attacks. |
| **7. After Movement (Even on Whiff)** | Runs `hooks.after`, `critical.after`, and `attackAfterHook` **even when the attack whiffs**, matching `engine.js`. | `Cross` (`After: Retreat 3` previews even when out of range). |
| **8. Cleanup Effects** | Applies `char.cardCleanupFor` and `card.cleanup` non-lethal self-damage and draws, producing `selfLifeBefore`, `selfLifeAfter`, and `selfLifeDelta`. | Nagoriyuki Exceed Normals (`-2 HP` non-lethal cleanup). |

---

## 3. `SimulateStrikePreview.run()` Output Schema

Key fields returned by `SimulateStrikePreview.run(infoSet, rawCard, opts)`:

- **Identity & Toggles**: `cardKey`, `cardName`, `cardType`, `isEX`, `isInitiator`, `criticalActive`, `criticalFree`, `canPreviewCritical`, `optionalBranches`
- **Effective Stats (`effectiveStats`)**: `pow`, `spd`, `arm`, `grd`, `printedPow`, `printedSpd`, `printedArm`, `printedGrd`, `minRange`, `maxRange`, `printedMinRange`, `printedMaxRange`, `ignoreArmor`, `ignoreGuard`, `oppVisibleArm`, `oppVisibleGrd`, `oppStunImmune`, `oppRangeImmune`
- **Spacing & Movement**: `startSpace`, `oppStartSpace`, `initialDist`, `movementPath`, `postBeforeSpace`, `beforeMoveSummary`, `didCrossUp`, `wallTruncated`, `moveBlockedByBoost`, `moveCappedByInnate`, `attackOrigin`, `usesEddie`, `postBeforeDist`, `oppPostHitSpace`, `oppHitMovePath`, `oppHitMoveSummary`, `postAfterSpace`, `afterPath`, `afterMoveSummary`
- **Expected Hit / Miss**: `hitboxSpaces`, `willWhiff`, `expectedHit`, `missReason` (`'out_of_range' | 'range_immune' | 'no_continuous_boost' | 'self_cannot_hit' | 'always_miss' | null`), `missReasonLabel`, `hitByBeforeMove`, `hitBySideSwap`, `hasStochasticVariance`
- **Life Loss & Outcomes**: `projectedDamage`, `damageFormula`, `oppLifeBefore`, `oppLifeAfter`, `oppLifeLoss`, `selfLifeBefore`, `selfLifeAfter`, `selfLifeDelta`, `isPublicStateLethal`, `breaksVisibleGuard`, `effectsSummary`

---

## 4. UI Surfaces & Keyboard Controls

All six Strike Preview surfaces stay synchronized through `StrikePreviewController` (`game/preview.js`) without triggering full `#app` repaints on hover:

1. **Arena Spatial Telegraph (`ArenaTelegraphRenderer`, `game/telegraph.js`)**
   - Highlights `hitboxSpaces` from the post-Before origin (or Eddie's cell with an `EDDIE · RNG` marker).
   - Marks the opponent's space green (`.telegraph-target-hit`) with an overhead impact tag (`✓ HIT -5 HP`, `☠ LETHAL (-6 HP)`, `✓ HIT · 0 DMG`) or red (`.telegraph-target-miss`) with the exact miss tag (`OUT OF RANGE`, `✗ RNG IMMUNE`, `✗ NO BOOST`, `✗ CROSSED PAST`, `✗ CANNOT HIT`).
   - Renders ghost silhouettes and arrow-tipped SVG splines for **Before** movement (cyan / gold on Cross-Up), **Opponent Hit Push/Pull** (orange dashed), and **After** self-movement (blue dashed, even on whiff), plus `WALL` truncation chevrons.
2. **HUD Life Bars (`lifeBar`, `game/render.js` + `ArenaTelegraphRenderer`)**
   - Overlays a striped `.opp-projected-dmg` bar segment, live CPU HP delta (`→ 19 (-5)` or `MISS`), `☠ Public Lethal` skull badge, and self HP delta (`→ 19 (+1)` / `→ 16 (-2)`) when heals or self-damage apply.
3. **Clash Summary Banner (`ClashSummaryBanner`, `game/telegraph.js`)**
   - Top row: `STRIKER`/`DEFENDER` role, card name, `EX`/`CRIT` badges, verdict pill (`✓ EXPECTED HIT`, `✓ HIT (AFTER MOVE)`, `✓ HIT (CROSS-UP)`, `☠ Public Lethal`, or exact miss reason), effective `RNG`/`SPD`/`POW`/`ARM`/`GRD` pills, visible opponent `ARM`/`GRD`/boost effects, guard-break badge, and CPU/Self HP loss readout (`CPU HP: 24→19 (-5)`).
   - Detail row: distance transition (`Dist 4→2 · Rng 1–2`), `Before`/`Hit`/`After` movement summaries, key effects, and clickable `[C] Critical` / `[Shift] Optional` toggles.
4. **Universal Inspector (`inspectorCardViewHTML`, `game/render.js`)**
   - Displays effective stats with `+N`/`-N` delta badges against printed values, Range & Distance breakdown, Movement lines, Life Loss + damage formula, notes, interactive `[C]`/`[Shift]` toggles, and the fog-of-war reminder. Updates live whenever `E` (EX), `C` (Critical), or `Shift` (Optional) is toggled.
5. **Full Card Lightbox (`fullCardLightboxHTML`, `game/render.js`)**
   - Shows live `Strike Preview` strip with effective `RNG`, distance transition, verdict badge, projected life loss, and movement summary.
6. **Hand & EX Range Chips (`PreviewMemo`, `previewToRangeChip`, `game/render.js`)**
   - Batch-evaluates the entire hand on public state changes (using `isInitiator: g.mode !== 'defend_select'`), labeling tiles accurately as `in range ✓`, `hits after move ✓`, `out of range ✗`, `immune ✗`, `no boost ✗`, or `utility`, plus `.lethal-aura` for public-state lethal options.

### Preview Keyboard Shortcuts (`game/input.js`)
- **`E`** (while hovering/selecting a card): toggle **EX (+1 All Stats)** preview.
- **`C`** (while hovering/selecting a card): toggle **Critical** preview (when character is Street Fighter with spare Gauge and a Critical effect).
- **`Shift`** (hold, or click button): toggle **Optional** Force/Gauge/Retreat branch preview.

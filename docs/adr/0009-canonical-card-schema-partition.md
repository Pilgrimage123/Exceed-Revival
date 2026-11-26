# Canonical 3-Bucket Card Schema Partition and Build-Time Validation

## Status
accepted

We keep `game/cards.js` as vanilla JS with live closures in `hooks` and `boost.resolve` (preserving the zero-dependency single-file `exceed_poc.html` bundle without forcing a full 41-fighter **Effect IR** rewrite), while enforcing a strict 3-bucket card schema partition and build/test-time validator across all cards and fighters.

## Considered Options

- **Rewrite all 41 fighters' closures into declarative Effect IR upfront**: Unblocks full native parity sooner, but is a high-risk big-bang rewrite across 292 cards with closures.
- **Leave `cards.js` ad-hoc and fix individual bugs as found**: Allows silent misplaced-field bugs (such as top-level `powBonusIfInitiating`), polymorphic fields (`boolean | number`), and naming drift (`stunImmuneBase` vs `stunImmune` vs `stunImmuneGrant`) to recur.
- **Enforce a strict 3-bucket partition in vanilla JS with automated schema validation**: Eliminates misplaced/polymorphic fields immediately while giving **Card DSL** export a clean, canonical metadata contract.

## Consequences

- **Top-level card fields** hold static printed identity and stats (`key`, `name`, `type`, `owner`, `copies`, `range`, `pow`, `spd`, `arm`, `grd`, `gaugeCost`, `text`, `boostText`, `criticalText`, `isAstral`, `canInitiateFaceUp`, `sealAfterUse`, `neverLeavesPlay`).
- **`hooks` (and `critical` using identical field names)** hold all Strike-time modifiers and triggers (`before`, `hit`, `after`, `afterStunCheck`, `interactiveHit`, `liveStatMods`, `dynamicRangeMaxBonus`, `powBonusIfInitiating`, `spdBonusIfInitiating`, `rangeMaxBonusIfInitiating`, `ignoreArmor`, `ignoreGuard`, `stunImmune`, `movementImmune`, `rangeImmuneRanges`, `blocksOpponentPassThrough`, `hitImmuneToFasterAttacks`, `selfArmorZero`, `goesToGaugeEvenOnMiss`).
- **`boost`** holds boost-side cost, timing, `cancelable`, `continuous`, a single discriminated `choice` object (replacing the 9 `needs*Choice` booleans), unified immunity/ignore grants (`stunImmune`, `movementImmune`, `ignoreArmor`), and `resolve`/`onHit`.
- Any unknown, misplaced, or wrong-typed key fails `npm test` and **Card DSL** export validation.

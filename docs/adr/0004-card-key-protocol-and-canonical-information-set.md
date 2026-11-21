# Card-Key Protocol and Canonical Information Set Boundary

## Status
accepted

We standardize the **Modern Native** protocol boundary on **Card Key** identifiers (resolved deterministically to concrete runtime `uid`s in `game/native-ai.js`), 0-indexed absolute **Arena Space** (`targetSpace: 0..8`) for `Move` actions, a single canonical `Engine.getInformationSet(playerId)` snapshot builder, and the `NativeDecisionResponse` (`{ action, diagnostics? }`) wrapper.

## Considered Options

- **Pass runtime instance `uid`s across the WASM/Native boundary**: Couples the native search state to per-match mutable JS object identities and breaks when snapshots only expose public key arrays (`handKeys`, `boostKeys`).
- **Address cards by `cardKey` and `Move` by `targetSpace: 0..8` over a single `Information Set` builder**: Cards sharing a `cardKey` in hand are rules-identical, `targetSpace` eliminates the ambiguity between relative **Range** (`1..8`) and **Arena Space** (`0..8`), and one builder on `Engine` prevents **Classic JS**, Layer 1, and **Modern Native** from drifting.

## Consequences

- `game/native-ai.js` deterministically maps `cardKey` → concrete `uid` when translating native decisions for `Engine` and `GameController`, and unwraps `NativeDecisionResponse` (`{ action, diagnostics? }`).
- `Engine.getInformationSet(playerId)` is the single source of truth for public + actor-private game state across **Classic JS**, TS Layer 1, and **Modern Native**.

# Run Modern Native in an Anytime Web Worker and Sunset Legacy Duplicates

## Status
accepted

In the browser, Modern Native runs inside an inline Blob Web Worker with a strict anytime millisecond budget (guarded by an `aiThinking` UI lock so clicks cannot race animations), while headless Node differential tests instantiate the exact same `.wasm` synchronously for determinism. Both `src/ai/layer1/*` and `game/ai.js` are temporary scaffolding rather than permanent dual runtimes.

## Consequences

- `src/ai/layer1/*` is deleted as soon as Rust Layer 1 passes the identical `< 1e-12` brute-force, 12,000-sample convergence, and 41-fighter roster parity suite.
- `game/ai.js` (Classic JS) remains in the runtime bundle only until all 41 fighters clear the Differential Promotion Gate and modal prompts are handled natively, after which it is removed and replaced by a minimal legal-action panic guard for WASM instantiation failures.
- All runtime & protocol coordinates standardize on `0..8` (`1..9` is UI/prose display only).

# Exceed native CPU core

`game/cards.js` remains the checked-in roster authority. Run `npm run native:export-roster` to derive a data-only Card DSL snapshot for a native build or audit; the output is intentionally ignored because it is reproducible.

The Rust crate owns deterministic, engine-independent AI primitives:

- Layer 1: conserved belief state and exact hypergeometric hand/EX marginals.
- Layer 2: canonical Force payment selection and zero-sum CFR+ matrix solving.
- Layer 3: availability-normalized PUCT selection for information-set search.
- Cross-runtime protocol: public-only canonical traces with a shared FNV-1a hash.

`cargo test --manifest-path native/Cargo.toml` verifies these primitives. `cargo run --manifest-path native/Cargo.toml -- self-test` exercises the command-line target. `npm run native:wasm` produces the browser-targeted `cdylib` at `native/target/wasm32-unknown-unknown/release/`; a thin generated adapter must register its planner through `NativeCpuAI.registerBackend()` before the UI uses it.

The JS engine is still the rules oracle. A Rust/WASM decision backend may only become the default after the full deterministic differential suite reports zero mismatches for every shipped fighter. The browser's **Modern native** selector therefore falls back to Classic JS when no verified WASM backend has been registered.

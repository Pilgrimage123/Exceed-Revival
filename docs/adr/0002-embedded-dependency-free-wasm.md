# Embed Dependency-Free Rust/WASM Core into the Self-Contained Game Bundle

## Status
accepted

We keep `exceed-ai-core` free of external Rust crates (`wasm-bindgen`, `serde`) and communicate across a minimal linear-memory ABI, base64-embedding the compiled `.wasm` into the bundled `exceed_poc.html` during `build:game`.

## Considered Options

- **External `wasm-bindgen` + `serde` loaded via `fetch()`**: Larger binary, toolchain coupling, and breaks zero-server `file://` playability.
- **Dependency-free Rust + linear-memory ABI + base64 embed**: Preserves standalone `exceed_poc.html`, keeps binary footprint minimal, and leaves headroom for a future pure-Rust quantized Layer 4 neural evaluator behind a pluggable `Evaluator` trait.

## Consequences

- Browser and Node test runners can instantiate the exact same `.wasm` binary without network fetches or bundlers.
- Protocol serialization stays deliberately small and explicit (FNV-1a canonical trace hashing in UTF-8).

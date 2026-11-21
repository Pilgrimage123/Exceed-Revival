# Information Set Strike Preview

We run `SimulateStrikePreview(infoSet, candidateCard, opts)` as a pure function over the active player's `Information Set` sharing extracted pure stat, movement, and range helpers with `engine.js`, rather than deep-cloning `Engine` and running `*resolveStrikeSteps` on a redacted clone. Sharing pure helpers prevents rules drift between the rules oracle and UI telegraphs, enforces fog-of-war structurally by never touching hidden opponent zones, and is fast enough to batch-evaluate the entire hand on public state changes.

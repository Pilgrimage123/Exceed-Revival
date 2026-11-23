# exceed-poc

Exceed Fighting System proof of concept — 2-player (human vs. CPU) single-bundle fighting card game.

- **[How to Play — Command Manual (Markdown)](./HOW_TO_PLAY.md)** — rules, card anatomy, Strike clash order, Speed ladder (`0–7`), season mechanics, combat symbols, and FGC glossary.
- **Architecture & Contributor Notes:** see [`HANDOFF.md`](./HANDOFF.md) and [`CHANGELOG.md`](./CHANGELOG.md).

## Commands

```bash
npm run dev          # Start local server on port 3000
npm run build:game   # Bundle game/* into exceed_poc.html
npm test             # Run all automated test suites
npm run lint         # Run TypeScript typecheck
```

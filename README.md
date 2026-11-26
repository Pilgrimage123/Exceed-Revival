# exceed-poc

Exceed Fighting System proof of concept — 2-player (human vs. CPU) single-bundle fighting card game.

- **[How to Play — Command Manual (Markdown)](./HOW_TO_PLAY.md)** — rules, card anatomy, Strike clash order, Speed ladder (`0–7`), season mechanics, combat symbols, and FGC glossary.
- **[Standee Animation Architecture & Upgrade Pipeline](./docs/standee-animation-architecture.md)** — dual-paradigm standee kinematics, matting/calibration, WebGL2 `4×6` rig architecture, and Strike choreography mapped to `game/standees.js` and `game/playback.js`.
- **[Standee Animation Creation Experience — Pitfalls & Lessons Learned](./docs/standee-animation-lessons-learned.md)** — full engineering retrospective on the 10 pitfalls encountered while building the 60 FPS WebGL2 deformable standee and Exceed Mode aura engine, what we learned to do, and what to avoid next time.
- **Architecture & Contributor Notes:** see [`HANDOFF.md`](./HANDOFF.md) and [`CHANGELOG.md`](./CHANGELOG.md).

## Commands

```bash
npm run dev          # Start local server on port 3000
npm run build:game   # Bundle game/* into exceed_poc.html
npm test             # Run all automated test suites
npm run lint         # Run TypeScript typecheck
```

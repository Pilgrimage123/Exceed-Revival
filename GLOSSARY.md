# Exceed Revival

Digital implementation and AI engine for the Exceed Fighting System card game.

## Language

**Arena Space**:
One of the nine linear positions (`0` through `8` internally, displayed as `1` through `9`) occupied by fighters and board tokens.
_Avoid_: Tile, square, slot

**Card DSL**:
The data-only declarative representation of fighter rosters, card stats, and mechanic primitives derived from the checked-in card catalog.
_Avoid_: Card schema, roster JSON

**Classic JS**:
The legacy JavaScript CPU planner kept temporarily for unverified fighters, modal prompts, and strength benchmarking until retired by the Differential Promotion Gate.
_Avoid_: Legacy AI, old CPU

**Modern Native**:
The compiled Rust/WASM CPU planner implementing belief modeling, game-theoretic Strike resolution, and information-set neutral search.
_Avoid_: New AI, Rust bot

**Differential Promotion Gate**:
The release bar requiring zero rules, legality, or belief-state mismatches against the JS rules oracle across all shipped fighters plus verified play strength before Modern Native replaces Classic JS.
_Avoid_: Action parity check, parity gate

**Effect IR**:
The typed, deterministic set of declarative mechanic opcodes representing card and character abilities without arbitrary script callbacks.
_Avoid_: Card hooks, effect scripts

**DSL Parity**:
The per-fighter verification status (`verified` or `partial`) indicating whether a fighter's Effect IR passes the Differential Promotion Gate against the JS rules oracle.
_Avoid_: Fighter readiness, port status

**Information Set**:
The complete set of public game state plus a player's own private hand and known deck order, excluding all hidden opponent cards.
_Avoid_: Game state, private state

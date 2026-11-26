# Unified Typed Match Event Stream

## Status
accepted

We unify `engine.log`, `engine.fxQueue`, `lastStrikeInfo.events`, and `EventBus` dispatch onto a single typed **Match Event** emitter on `Engine` (`engine.events` bounded buffer with monotonic `seq`, `turn`, `kind`, `playerId`, `payload`, and `text`), while preserving `lastStrikeInfo.timeline` as the dedicated `StrikeTimelineStep` snapshot array defined in ADR-0006.

## Considered Options

- **Keep `log`, `fxQueue`, `lastStrikeInfo.events`, and `EventBus` separate**: Lowest short-term effort, but preserves 4-way duplicated emission logic and inconsistent payload keys (`playerId` vs `actor` vs `winnerId` vs `stunnedPlayerId`).
- **Derive `lastStrikeInfo.timeline` from the event stream too**: Risks coupling Strike playback snapshot granularity to low-level event emission and destabilizing ADR-0006's `StrikePlaybackController`.
- **Unify `log`, `fxQueue`, `lastStrikeInfo.events`, and `EventBus` onto one typed `Engine` event stream while keeping `lastStrikeInfo.timeline` snapshots separate**: Eliminates duplicate event streams and payload drift while keeping ADR-0006's snapshot-driven playback intact.

## Consequences

- `engine.log` is populated from `event.text`, `fxQueue` is replaced by a cursor/drain over `engine.events` driven strictly by `GameController` (never mutated from `render.js`), and `lastStrikeInfo.events` is derived from the Strike's slice of `engine.events`.
- `EventBus` validates against a central event registry using `playerId` consistently across payloads.
- `lastStrikeInfo.timeline` remains the canonical **Trigger Timeline** snapshot sequence consumed by `StrikePlaybackController`.

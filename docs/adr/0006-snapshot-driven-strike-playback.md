# Snapshot-Driven Strike Playback

We keep `engine.js:*resolveStrikeSteps` deterministic and synchronous-between-yields—emitting structured `StrikeTimelineStep` snapshots on `lastStrikeInfo.timeline`—and drive the UI Trigger Timeline, Guard-break animations, and Confirmed Lethal hit-stop via `StrikePlaybackController`, rather than adding animation `yield`s into `engine.js`. This keeps `engine.js`, unit tests, and AI simulations fast and pure while giving the UI full control over pacing, skipping, and reduced-hit-stop accessibility.

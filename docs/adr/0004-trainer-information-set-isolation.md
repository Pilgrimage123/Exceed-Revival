# Strict Information-Set Isolation Between Enemy CPU and Player Trainer

## Status
accepted

Even though the Enemy CPU and the Trainer share the same Modern Native Rust/WASM engine, the Trainer must run on a completely separate, human-perspective Information Set and never read the Enemy CPU's private hand, planned Strike card, or internal belief state. The Trainer always evaluates at full-strength GTO (`Champion`, λ = 0) regardless of Enemy CPU difficulty, covering Neutral hints, Strike/Defense hints, and Post-Strike Review.

## Consequences

- Beginner Coach runs strictly on-demand with plain-language copy; Study Mode runs a cancellable background job in the shared Web Worker during the human's turn, with Enemy CPU turns always taking strict priority.
- Mid-match explanations never reveal the Enemy CPU's hidden hand or internal search tree (citing only publicly observable state); full dual-perspective CPU reasoning unlocks only in Post-Match Review after `game_over`.
- On matchups involving any `partial` fighter (running on Classic JS), Study Mode degrades cleanly to Beginner Coach text with a status note rather than fabricating partial metrics.

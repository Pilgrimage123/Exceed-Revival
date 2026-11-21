# Differential Promotion Gate Measures Rules and Belief Parity, Not Action Parity

## Status
accepted

Modern Native (IS-MCTS + CFR+) is intentionally stronger than Classic JS's 3-turn heuristic, so its chosen actions will legitimately differ from Classic JS. We therefore define the Differential Promotion Gate as zero mismatches against the JS rules oracle on rules transitions, action legality, Force payments, and belief probabilities, combined with zero illegal actions and positive win-rate against Classic Champion.

## Consequences

- Each fighter carries an explicit `dslParity` status (`verified` or `partial`) in the exported Card DSL manifest.
- In normal browser play, matchups involving any `partial` fighter automatically route to Classic JS until that fighter passes the differential suite.
- Action-level comparison against Classic JS is used only for strength benchmarking, never as a correctness failure.

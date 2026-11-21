# Exceed Fighting System — Layer 3: The Neutral Game (IS-MCTS with Heuristic Rollouts & Strike Abstraction)

> **Architecture Series:** [Layer 1: Belief Engine](./exceed-ai-layer1-belief-engine.md) $\rightarrow$ [Layer 2: Strike Resolver](./exceed-ai-layer2-strike-resolver.md) $\rightarrow$ **Layer 3: Neutral IS-MCTS (this document)** $\rightarrow$ [Layer 4: Neural Adaptation & Roadmap](./exceed-ai-layer4-meta-learning-roadmap.md)  
> **Status:** Complete Architectural, Mathematical & Algorithmic Specification  
> **Target Budgets:** Real-time neutral turn $50\text{–}150\text{ ms}$ ($1{,}000\text{–}5{,}000$ IS-MCTS iterations)

### Explicit Domain Reconciliations & Rules Alignment

1. **Deck & Multi-Season Parity:** Aligns strictly with Layer 1 & Layer 2 (`16 Normals + 14 Character cards = 30` baseline, plus multi-season copy counts `0/2/3/4`, dual Normals pools `NORMALS`/`GG_NORMALS`, Season 4 **Cancel** chains for 1 Gauge after `cancelable` Boosts, **Burst / Extra Actions** like Axl's *One Vision*, **Character Actions**, and Season 5 **Overdrive** + manual-reshuffle **Astral Heat**).
2. **Arena Coordinates & Passing Rule:** Arena spaces are $x \in \{1, \dots, 9\}$ (0–8 in `game/engine.js`). Paid `Move` costs `1 Force` per space moved; moving onto/past the opponent's occupied space skips over them per Exceed movement rules (requiring enough Force to land on an unoccupied space beyond them, or blocked by `blocksOpponentPassThrough` effects).
3. **Reshuffle & Deck-Out Timing:** Each player receives one free reshuffle (via `Manual Reshuffle` action OR automatic empty-deck reshuffle during draw). Attempting to draw from an empty deck when `reshuffleUsed === true` (end of Cycle 1) causes an immediate **Deck-Out Loss**. End-of-turn draw (1 card, or Season 5 Astral Heat after Manual Reshuffle) happens after every non-Strike turn, enforcing the soft hand limit of 7 (9 for Goldlewis).

---

## 1. Information Set Monte Carlo Tree Search (IS-MCTS) Architecture

### 1.1 System Integration Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       Root State & Upstream Inputs                      │
│  • GameState s_root (public board 1..9, Gauge, Boosts, AI hand/deck)    │
│  • CompiledBeliefModel (Layer 1: exact Fisher DP hand+deck sampler)     │
│  • StrikeResolver (Layer 2: Zobrist-cached Nash equilibrium solver)     │
│  • Optional Layer 4 Neural Hook (policy prior π_θ + leaf value v_θ)     │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ For iter k = 1 .. K (1,000 - 5,000)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Step 1: Determinize Root World d^(k) via Layer 1                       │
│  • Sample (H_opp^(k), D_opp^(k)) = compiledBelief.sampleDeterminization │
│  • Shuffle unknown AI own-deck bulk (preserving AI knownDeckTop/Bottom) │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Step 2: Selection (Availability-Normalized PUCT over InfoSetNodes)     │
│  • Mask legal macro-actions A_legal(d^(k)) via ForcePruner              │
│  • Increment N_avail(u, a) for all legal a; pick argmax PUCT(u, a)      │
│  • Asymmetric Observability: opp neutral nodes NEVER read AI's hand     │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Step 3: Expansion & Strike Node Coupling (Layer 3 <-> Layer 2)         │
│  • Neutral action -> RulesEngine.step(d^(k), a) + end-of-turn draw      │
│  • Strike action:                                                       │
│      - Depth <= D_sample (2): Sample (a*,b*) ~ (σ*_AI, σ*_opp) via L2   │
│        and continue neutral tree search post-cleanup!                   │
│      - Depth >  D_sample (2): Query L2 cached V_GTO(s) -> immediate     │
│        tactical leaf evaluation (zero NxM tree branching!)              │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Step 4: Heavy Heuristic Rollout / Leaf Eval & Backpropagation          │
│  • ε-greedy safe playout to D_max = 6 plies -> H_neutral(s) / v_θ(s)    │
│  • Backpropagate value v ∈ [-1, 1] along visited InfoSetNode edges      │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Belief-Consistent Determinization & Mitigating Imperfect-Information Pitfalls

At the start of every IS-MCTS iteration $k$, Layer 3 calls Layer 1's rejection-free `CompiledBeliefModel.sampleDeterminization(rng)` ($\sim 6\ \mu\text{s}$), yielding a concrete world $d^{(k)} = (H_{\text{opp}}^{(k)}, D_{\text{opp}}^{(k)})$ strictly satisfying all public zones, `knownHand`, `excludedFromHand`, `knownDeckTop`, `knownDeckBottom`, and Bayesian behavioral weights.

Naive determinized MCTS (Perfect Information Monte Carlo — PIMC) fails catastrophically in fighting card games due to **Strategy Fusion** and **Non-Locality**. Layer 3 eliminates both through three structural mechanisms:

| Pitfall | Mechanism of Failure in Naive PIMC | Concrete Mitigation in Layer 3 |
|---|---|---|
| **Strategy Fusion** | Searching a separate tree per sampled hand lets the AI condition its root/deep moves on knowing $H_{\text{opp}}^{(k)}$ (e.g., walking into Range 1 *only* in worlds where opponent lacks *Grasp*). | **Single-Observer IS-MCTS (SO-ISMCTS):** All determinizations share ONE tree indexed by **AI's Information Set** $I_{\text{AI}}$ (public action history + AI's own private hand/draws). The AI must commit to a single action distribution across all consistent opponent hands. |
| **Opponent Omniscience (Reverse Leakage)** | In standard SO-ISMCTS, opponent tree nodes still simulate inside $d^{(k)}$ where the AI's hand is visible if the opponent uses a greedy lookahead—causing the opponent to miraculously dodge AI's hidden EX attacks. | **Asymmetric Observability + Layer 2 Encapsulation:** (1) Simultaneous Strikes are **never** expanded as sequential card picks inside MCTS—they delegate to Layer 2's belief-weighted Nash solver. (2) Opponent neutral nodes condition strictly on `publicInfoOf(AI)` + $H_{\text{opp}}^{(k)}$, never reading AI's hidden hand! |
| **Non-Locality** | Reaching a sub-tree alters the *posterior* probability over which opponent hands would actually take that path (e.g., if opponent plays `Move -> Range 1` inside the tree, hands without Range-1 cards shouldn't remain equally weighted downstream). | **Inline Bayesian Reweighting at Opponent Tree Moves:** When an opponent neutral action $a_{\text{opp}}$ is traversed at shallow tree depth ($\le 2$), weight the iteration's backpropagation contribution by Layer 1's likelihood weight $\ell(a_{\text{opp}} \mid H_{\text{opp}}^{(k)})$ (or re-sample/filter incompatible determinizations via particle rejuvenation on high-visit opponent branches). |

---

### 1.3 Information-Set Tree Policy (Availability-Normalized PUCT)

Each node $u$ in the search tree represents an **Information Set** (canonical hash of public state + acting player's private knowledge) storing per-action statistics `(N(u, a), W(u, a), N_avail(u, a), P_prior(u, a))`.

During selection on determinization $d^{(k)}$, let $A_{\text{legal}}(u, d^{(k)})$ be the set of macro-actions legal in $d^{(k)}$:

1. **Availability Tracking:** For every $a \in A_{\text{legal}}(u, d^{(k)})$, increment $N_{\text{avail}}(u, a) \leftarrow N_{\text{avail}}(u, a) + 1$.
2. **Selection Score (IS-PUCT):** Select:
   $$a^* = \arg\max_{a \in A_{\text{legal}}(u, d^{(k)})} \left[ Q(u, a) + c_{\text{puct}} \cdot \tilde{P}_{\text{prior}}(u, a) \cdot \frac{\sqrt{N_{\text{avail}}(u, a)}}{1 + N(u, a)} \right]$$
   where:
   - $Q(u, a) = \frac{W(u, a)}{N(u, a)} \in [-1, 1]$ (with First-Play Urgency $Q_{\text{FPU}} = V_{\text{parent}} - 0.15$ when $N(u, a) = 0$ to prevent exploring garbage actions before expanding strong priors),
   - $\tilde{P}_{\text{prior}}(u, a) = \frac{P_{\text{prior}}(u, a)}{\sum_{b \in A_{\text{legal}}} P_{\text{prior}}(u, b)}$ is the masked prior policy (from Layer 4's neural policy head $\pi_\theta(a \mid s)$ when active, or softmax over fast domain heuristic scores $P_{\text{heur}}(u, a)$ in pure-heuristic mode),
   - $c_{\text{puct}} = 1.35$ (tuned slightly below Go/Chess due to stochasticity across determinizations).
3. **Root Action Selection (Post-Search):** Choose the most robust action $\arg\max_a N(u_{\text{root}}, a)$ (with optional temperature $\tau = 0.15$ on near-tied top-2 neutral lines to maintain unpredictability against human pros).

---

### 1.4 Macro-Action & Canonical Force-Spend Abstraction (`ForcePruner`)

A 7-card hand + 3-card Gauge gives up to $\binom{10}{3} = 120$ distinct Force-payment subsets for a single `Move 3` action. Branching on Force subsets destroys MCTS depth without adding strategic value.

Layer 3 collapses the neutral action space into **$\le 16$ canonical macro-actions** per turn:

1. **`InitiateStrike`**: 1 macro-action (invokes Layer 2).
2. **`Move(targetSpace)`**: Up to 4–6 reachable target Arena Spaces (`0..8` internally, `1..9` display only) within affordable Force (pruning strictly dominated positions, e.g., moving backward into corner `0` with no threats). Each target space is bound to its **single canonical minimum-cost Force payment** computed by `ForcePruner`.
3. **`PlayBoost(cardKey)`**: 1 macro-action per distinct playable Boost card in hand (paying canonical minimum-cost Force for non-zero boost costs; if Season 4 `cancelable` and Gauge $\ge 1$, the post-Boost Cancel decision branches cleanly into `{Cancel -> bonus action, Pass}`).
4. **`Prepare`**: 1 macro-action (draw 1 + EoT draw 1).
5. **`ChangeCards(k)`**: Collapsed to $k \in \{1, 2, 3\}$ (or max affordable) using the $k$ lowest-retention cards in hand (never spending Gauge on Change Cards unless character passive grants bonus Force, e.g., Guile's `+2` Force on first Gauge!).
6. **`Exceed`**: 1 macro-action when `Gauge >= exceedCost && !exceeded` (paying canonical lowest-value Gauge cards; automatically chaining `onExceed` `mayStrike` / `mayAction` triggers).
7. **`ManualReshuffle` & `CharacterAction`**: 1 macro-action each when legal (e.g., Ryu Move 1 left/right, Ken Close 1 + Draw 1, M. Bison Hand-to-Gauge).

#### Canonical Force Selection Rule (`ForcePruner.selectCanonicalForce`)

For any target Force cost $F \ge 1$ and intended post-action spacing $d_{\text{target}}$, score every eligible Force source $c \in H_{\text{active}} \cup G_{\text{active}}$ by its **Marginal Retention Value per Force** ($\text{MRV}/f_c$):

$$\text{MRV}(c \mid s, d_{\text{target}}) = \underbrace{2.2 \cdot \mathbb{I}[\text{canReach}(c, d_{\text{target}})] \cdot \text{ThreatScore}(c)}_{\text{Live threat at target spacing}} + \underbrace{1.4 \cdot \mathbb{I}[\text{formsEXPair}(c)] \cdot \text{PairQuality}(c)}_{\text{EX pair preservation guard}} + \underbrace{0.9 \cdot \text{BoostUtility}(c, s)}_{\text{Boost option value}} + \underbrace{1.1 \cdot \mathbb{I}[c \in \{\text{Block}, \text{Focus}\}] \cdot \text{InDanger}(s)}_{\text{Defensive survival value}}$$

- **Gauge Source Valuation:** Spending a Gauge card instead of a hand card has base retention cost:
  $$\text{MRV}_{\text{gauge}}(s) = 1.6 + 2.8 \cdot \mathbb{I}[\neg\text{Exceeded} \land G \le G_{\text{exceed}} + 1]$$
  so the AI preserves Gauge for Exceed/Ultras unless hand size is critically low ($|H| \le 2$) or saving an EX pair.
- **2-Force Ultra Economy:** A card $c$ with `forceValue = 2` (any Ultra) is scored by $\frac{\text{MRV}(c)}{2}$ when $F \ge 2$! If an Ultra is currently unaffordable (`gaugeCost > G + 1`), its threat score is `0.15`, making $\text{MRV}/2 \approx 0.08$—automatically discovering pro-level **2-Force Ultra pitching**!
- **Exact Small-Knapsack Selection:** Because $|H| + |G| \le 12$ and $F \le 4$, solve exact min-MRV subset sum for $\sum f_i \ge F$ in $O(F \cdot (|H| + |G|)) < 1\ \mu\text{s}$ (adding an overspend penalty $+0.8 \cdot (\sum f_i - F)$ so a 2-Force Ultra is never wasted on a 1-Force Move unless no 1-Force source is cheaper!).

---

## 2. Strike Node Coupling (Bridging Layer 3 and Layer 2)

When an IS-MCTS branch selects `InitiateStrike` at tree depth $\delta$ (counting neutral plies from root):

### Mode 1: Outcome Sampling (Shallow Depth: $\delta \le D_{\text{sample}}$, default $D_{\text{sample}} = 2$)

Used near the root so the planner sees **multi-turn combat follow-ups** (e.g., *Play Boost $\rightarrow$ Initiate Strike $\rightarrow$ Win Advantage $\rightarrow$ Lethal Follow-up Strike*, or *Strike $\rightarrow$ Cross Retreat $\rightarrow$ Safe Neutral*):

1. Invoke Layer 2 (`StrikeResolver.solve(s, compiledBelief, mode="mcts_rollout")`) returning equilibrium $(\sigma^*_{\text{AI}}, \sigma^*_{\text{opp}})$.
2. Mask $\sigma^*_{\text{opp}}$ to actions legal in the current determinization $H_{\text{opp}}^{(k)}$ (fallback to `Wild Swing` if unmasked mass is 0) and renormalize.
3. Sample **one** joint pair $(a_i, b_j) \sim (\sigma^*_{\text{AI}}, \sigma^*_{\text{opp}}|_{H_{\text{opp}}^{(k)}})$.
4. Execute `RulesEngine.simulateStrike(d^(k), a_i, b_j)` through full Strike Cleanup (updating Life, positions, Gauge, Discard, Boost expiry, Advantage, and active player).
5. If terminal ($\text{Life} \le 0$ or deck-out), return $\pm 1.0$; otherwise continue neutral IS-MCTS from the post-strike state!

### Mode 2: Fast Analytical Evaluation (Deep / Rollout Depth: $\delta > D_{\text{sample}}$)

Used deeper in the tree and inside rollouts to keep latency strictly inside the $50\text{–}150\text{ ms}$ turn budget:

1. Query Layer 2's Zobrist-cached Availability-Capped CFR+ (or Quantal-BR leaf approximation, $< 0.13\text{ ms}$ uncached / $< 0.005\text{ ms}$ cached) to obtain the exact expected zero-sum strike payoff $V_{\text{GTO}}(s) \in \mathbb{R}$.
2. Convert directly to normalized win-value space:
   $$v_{\text{strike}}(s) = \begin{cases} \operatorname{sign}(V_{\text{GTO}}) & \text{if } |V_{\text{GTO}}| \ge 5{,}000 \text{ (guaranteed lethal)} \\ \tanh\!\left(\dfrac{V_{\text{GTO}}(s)}{14.0}\right) & \text{otherwise} \end{cases}$$
3. Terminate the branch immediately and backpropagate $v_{\text{strike}}(s)$ up the tree—**zero $N \times M$ branching explosion inside IS-MCTS**!

---

## 3. Pro-Level Neutral Evaluation Function ($H_{\text{neutral}}(s)$)

For non-terminal neutral leaf states (and guiding rollout decisions), define antisymmetrized perspective utility $H_{\text{neutral}}(s) = \tanh\!\left(\frac{\Phi_{\text{AI}}(s) - \Phi_{\text{opp}}(s)}{16.0}\right) \in [-1, 1]$, where each player's raw neutral equity $\Phi_p(s)$ decomposes into five normalized, non-overlapping terms:

$$\Phi_p(s) = \Phi_{\text{life}}(p) + \Phi_{\text{cards}}(p) + \Phi_{\text{EX}}(p) + \Phi_{\text{pos}}(p) + \Phi_{\text{tempo}}(p)$$

### 3.1 Life & Nonlinear Lethal Threat ($\Phi_{\text{life}}$)
$$\Phi_{\text{life}}(p) = 1.0 \cdot \text{Life}_p + 4.5 \cdot \ln\!\left(\frac{\text{Life}_p + 4.0}{4.0}\right) - 3.2 \cdot \mathbb{I}[\text{Life}_p \le 7 \land d \in \text{ThreatRanges}(\bar{p})]$$
- Reuses Layer 2's exact concave survival scale so neutral and strike evaluations share a single unified unit (`1.0 ≈ 1 mid-game HP`), plus a sharp `-3.2` danger penalty when standing inside opponent threat range at $\le 7$ HP (one *Sweep*/*Special*/*Ultra* away from death).

### 3.2 Card Advantage vs. Deck Fatigue ($\Phi_{\text{cards}}$)
$$\Phi_{\text{cards}}(p) = \underbrace{\sum_{k=1}^{\min(|H_p|, H_{\max})} \left(0.45 + \frac{1.10}{k}\right)}_{\text{Dual-purpose hand equity}} - \underbrace{\mathbb{I}[\text{reshuffleUsed}_p] \cdot \frac{14.0}{\left(\max(1,\ |D_p|)\right)^{1.35}}}_{\text{Cycle-1 Deck Fatigue Penalty}}$$
- **Calibration check on Deck Fatigue (Cycle 1, `reshuffleUsed = true`):**
  - $|D_p| = 10$ cards left: penalty `-0.62` (mild caution).
  - $|D_p| = 5$ cards left: penalty `-1.59` (avoid unnecessary `Prepare`/`Change Cards`).
  - $|D_p| = 3$ cards left: penalty `-3.18` (high urgency to close game or stop drawing).
  - $|D_p| = 2$ cards left: penalty `-5.49` (critical—`Change Cards 2` is suicidal!).
  - $|D_p| = 1$ card left: penalty `-14.00` (1 end-of-turn draw away from immediate Deck-Out loss!).

### 3.3 EX Pair Preservation Bonus ($\Phi_{\text{EX}}$)
$$\Phi_{\text{EX}}(p) = \sum_{c \in \text{Pairs}(H_p)} \left(0.55 + 0.35 \cdot \mathbb{I}[\text{highImpact}(c)] + 0.25 \cdot \mathbb{I}[\text{canReach}(c, d)]\right)$$
- High-impact pairs (*Focus*, *Cross*, *Sweep*, *Grasp*, character Specials/Ultras) receive `+0.90` to `+1.15` bonus on top of their base marginal hand-card value (`~0.80–1.10`).
- **Pair-Break Threshold $\tau_{\text{EX}}$:** Breaking a live in-range EX pair (e.g., 2× *Focus* at Range 2) as Force incurs an immediate combined penalty of $\tau_{\text{EX}} \approx 1.85\text{–}2.15$ HP-equivalents—so IS-MCTS will **only** break an EX pair if the resulting Boost/Move line generates $> \tau_{\text{EX}}$ net strategic EV!

### 3.4 Positional & Cornering Control ($\Phi_{\text{pos}}$)
$$\Phi_{\text{pos}}(p) = 0.65 \cdot \left(1 - \frac{|x_p - 5|}{4}\right) - \text{CornerPenalty}(p) + 0.90 \cdot \text{RangeFit}(H_p, d)$$
where self-cornering depends explicitly on whether player $p$ holds corner-escape tools (`Dive`, `Cross` away from opposite edge, character teleport, or $\ge 2$ expendable Force to Move past):
$$\text{CornerPenalty}(p) = \begin{cases} 0 & \text{if } x_p \in \{3, 4, 5, 6, 7\} \\ \bigl(1.65 \cdot \mathbb{I}[x_p \in \{1, 9\}] + 0.70 \cdot \mathbb{I}[x_p \in \{2, 8\}]\bigr) \cdot \bigl(1 - 0.55 \cdot \mathbb{I}[\text{hasEscapeTool}(H_p)]\bigr) & \text{otherwise} \end{cases}$$
*(Inverted to a positive edge bonus for edge-advantaged fighters such as Vega with `specialsUltrasStatModsIfAtEdge`.)*

### 3.5 Tempo, Initiative & Active Boost / Exceed Value ($\Phi_{\text{tempo}}$)
$$\Phi_{\text{tempo}}(p) = \underbrace{1.45 \cdot \mathbb{I}[\text{isActive}(p)]}_{\text{Initiative / Speed-tie priority}} - \underbrace{1.85 \cdot \mathbb{I}[\neg\text{isActive}(p) \land d \in \text{OptimalThreat}(\bar{p})]}_{\text{Ending turn in opp threat range!}} + \sum_{b \in \text{Boosts}_p} \text{BoostVal}(b) + 0.55 \cdot G_p + 1.10 \cdot \mathbb{I}[G_p \ge G_{\text{exceed}} \land \neg\text{Exceeded}_p] + 2.20 \cdot \mathbb{I}[\text{Exceeded}_p]$$
- Notice the **Initiative Discipline Term**: ending our turn inside the opponent's optimal threat range without Striking hands the opponent **Active Player Speed-tie priority** (`-1.45` lost + `-1.85` exposed = `-3.30` swing!), directly teaching the AI why walking into Range 2 and passing is a classic beginner blunder in Exceed.

---

## 4. Performance Engineering & Smart Rollout Policy

### 4.1 Iteration Budget & Latency Breakdown ($50\text{–}150\text{ ms}$)

| Phase | Per-Iteration Cost | Budget at 2,500 Iterations |
|---|---|---|
| Layer 1 Determinization (`CompiledBeliefModel.sampleDeterminization`) | $6\ \mu\text{s}$ | $15\text{ ms}$ |
| Tree Selection + `ForcePruner` Macro Generation (depth $\sim 4$) | $8\ \mu\text{s}$ | $20\text{ ms}$ |
| Layer 2 Strike Coupling (85% Zobrist cache hit rate @ $5\ \mu\text{s}$; 15% miss @ $130\ \mu\text{s}$) | $24\ \mu\text{s}$ | $60\text{ ms}$ |
| Heavy Playout (max 4 remaining plies) + $H_{\text{neutral}}$ leaf eval | $10\ \mu\text{s}$ | $25\text{ ms}$ |
| **Total Single-Threaded Wall Time** | **$\sim 48\ \mu\text{s}/\text{iter}$** | **$\sim 120\text{ ms}$** (4-core root-parallel: **$\sim 35\text{ ms}$**) |

### 4.2 Smart Heavy Playout Policy ($\epsilon$-Greedy Domain Playout)

Uniform random rollouts poison MCTS in Exceed (randomly burning EX pairs to walk into Range 1 at 2 HP and passing). Rollouts run up to $D_{\max} = 6$ total plies from root with $\epsilon = 0.12$ exploration and $1 - \epsilon = 0.88$ fast heuristic policy:

1. **Hard Survival Filter (Never Suicidal):** Never choose `Prepare`, `Change Cards`, or `Move-and-pass` into `oppThreatRanges` when $\text{Life}_{\text{self}} \le 7$; never `Prepare`/`Change Cards` when `reshuffleUsed && deckSize <= 2` (immediate self-mill).
2. **Immediate Lethal / High-EV Strike Check:** If quick Strike EV $\ge +2.5$ (or opponent is in lethal range), select `InitiateStrike`.
3. **Exceed Timing Trigger:** If `!exceeded && Gauge >= exceedCost` and safe from immediate lethal, prefer `Exceed` (especially when `onExceed` grants `mayStrike` or draw).
4. **Setup vs. Reposition:** Score remaining `PlayBoost`, `Move(bestRange)`, and `Prepare` via one-step $\Delta \Phi_{\text{pos}} + \Delta \Phi_{\text{tempo}}$ and pick softmax-greedy.
5. **Early Leaf Cutoff:** At depth $D_{\max} = 6$, evaluate immediately with blended leaf value:
   $$v_{\text{leaf}}(s) = (1 - \alpha_{\text{NN}}) \cdot H_{\text{neutral}}(s) + \alpha_{\text{NN}} \cdot v_\theta(s)$$
   ($\alpha_{\text{NN}} = 0$ in pure-heuristic Mode; $\alpha_{\text{NN}} \in [0.7, 1.0]$ once Layer 4 neural network is trained).

### 4.3 Root Parallelization, Tree Reuse & Shared Transposition Caching

- **Tree Reuse Across Turns:** After executing action $a_{\text{AI}}$ and observing opponent's public response $a_{\text{opp}}$, re-root the tree at child node `root -> a_AI -> a_opp` if present, pruning unreachable subtrees and refreshing Layer 1 determinizations at the new root (retains 20–40% of warm visit statistics on predictable neutral exchanges).
- **Root Parallelization (Multi-Core):** Spawn $W = 4$ independent worker threads, each running $K / W$ IS-MCTS iterations on its own thread-local `InfoSetNode` tree (zero lock contention!) while sharing a **read-mostly lock-free Zobrist Strike Cache** (`Layer 2`) and merging root action visit counts $N_{\text{total}}(a) = \sum_{w=1}^W N_w(a)$ at time expiry.

---

## 5. Production-Ready Pseudocode Blueprint

```python
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Dict, List, Literal, Optional, Sequence, Tuple
import math
import random

NeutralKind = Literal[
    "move", "boost", "prepare", "change_cards",
    "exceed", "reshuffle", "character_action", "strike",
]


@dataclass(frozen=True)
class NeutralMacroAction:
    kind: NeutralKind
    target_space: Optional[int] = None           # For move (0..8 internal Arena Space)
    card_key: Optional[str] = None               # For boost
    change_count: int = 0                        # For change_cards (1..3)
    force_payment: Tuple[str, ...] = ()          # Canonical card/gauge keys from ForcePruner
    direction: Optional[str] = None              # For directional character actions


@dataclass
class EdgeStats:
    visits: int = 0
    value_sum: float = 0.0
    avail_visits: int = 0
    prior: float = 0.1

    @property
    def q_value(self) -> float:
        return self.value_sum / self.visits if self.visits > 0 else 0.0


@dataclass
class InfoSetNode:
    info_key: int                                # Hash of public state + acting player's private info
    acting_player: Literal["ai", "opp"]
    edges: Dict[NeutralMacroAction, EdgeStats] = field(default_factory=dict)
    children: Dict[NeutralMacroAction, "InfoSetNode"] = field(default_factory=dict)
    total_visits: int = 0


class ForcePruner:
    """Collapses 2^|H| Force-discard subsets into 1 canonical minimum-MRV payment."""

    @staticmethod
    def card_mrv(card, state, target_dist: int, hand_counts: Dict[str, int]) -> float:
        reaches = 1.0 if state.pool.can_reach(card, target_dist) else 0.0
        threat = (0.4 * card.pow + 0.4 * card.spd) / 4.0 if not card.always_miss else 0.0
        pair_bonus = 1.4 if hand_counts.get(card.key, 0) >= 2 else 0.0
        def_bonus = 1.1 if (card.is_defensive and state.in_opp_threat_range(target_dist)) else 0.0
        boost_bonus = 0.9 * state.quick_boost_value(card)
        return 2.2 * reaches * threat + pair_bonus + def_bonus + boost_bonus

    def select_canonical_force(
        self,
        state,
        force_needed: int,
        target_dist: int,
        exclude_keys: Sequence[str] = (),
        allow_gauge: bool = True,
    ) -> Optional[Tuple[str, ...]]:
        if force_needed <= 0:
            return ()

        hand = list(state.active_hand)
        excluded = list(exclude_keys)
        hand_counts: Dict[str, int] = {}
        for c in hand:
            hand_counts[c.key] = hand_counts.get(c.key, 0) + 1

        # Build candidate (source_id, force_value, mrv_cost) list
        sources: List[Tuple[str, int, float]] = []
        for idx, card in enumerate(hand):
            if card.key in excluded:
                excluded.remove(card.key)
                continue
            mrv = self.card_mrv(card, state, target_dist, hand_counts)
            sources.append((f"hand:{card.key}:{idx}", card.force_value, mrv))

        if allow_gauge:
            g_cnt = len(state.active_gauge)
            g_mrv = 1.6 + (2.8 if (not state.active_exceeded and g_cnt <= state.active_exceed_cost + 1) else 0.0)
            for idx, card in enumerate(state.active_gauge):
                sources.append((f"gauge:{card.key}:{idx}", 1, g_mrv))

        # Exact min-MRV knapsack for sum(force_value) >= force_needed (small F <= 4)
        INF = 1e9
        max_f = force_needed + 1  # Allow at most 1 Force overspend (e.g., 2-Force Ultra)
        dp: List[Tuple[float, Tuple[str, ...]]] = [(INF, ())] * (max_f + 1)
        dp[0] = (0.0, ())

        for src_id, f_val, cost in sources:
            next_dp = list(dp)
            for f in range(max_f + 1):
                if dp[f][0] >= INF:
                    continue
                nf = min(max_f, f + f_val)
                cand_cost = dp[f][0] + cost
                if cand_cost < next_dp[nf][0]:
                    next_dp[nf] = (cand_cost, dp[f][1] + (src_id,))
            dp = next_dp

        best_exact = dp[force_needed]
        best_over = (dp[max_f][0] + 0.8, dp[max_f][1])  # +0.8 penalty for 1 wasted Force
        best = best_exact if best_exact[0] <= best_over[0] else best_over
        return best[1] if best[0] < INF else None


class NeutralEvaluator:
    """Computes H_neutral(s) ∈ [-1, 1] combining life, fatigue, EX pairs, cornering, and tempo."""

    def evaluate(self, state, neural_net=None, nn_weight: float = 0.0) -> float:
        if state.is_terminal:
            return 1.0 if state.winner == "ai" else -1.0

        phi_ai = self._perspective_equity(state, "ai")
        phi_opp = self._perspective_equity(state, "opp")
        h_val = math.tanh((phi_ai - phi_opp) / 16.0)

        if neural_net is not None and nn_weight > 0.0:
            v_nn = neural_net.predict_value(state)
            return (1.0 - nn_weight) * h_val + nn_weight * v_nn
        return h_val

    def _perspective_equity(self, state, pid: Literal["ai", "opp"]) -> float:
        p = state.player(pid)
        opp = state.opponent(pid)
        dist = abs(p.space - opp.space)

        # 1. Nonlinear survival life + lethal-zone exposure
        life_term = 1.0 * p.life + 4.5 * math.log((max(0, p.life) + 4.0) / 4.0)
        if p.life <= 7 and dist in opp.threat_ranges():
            life_term -= 3.2

        # 2. Hand equity vs. Cycle-1 deck fatigue
        hand_val = sum(0.45 + 1.10 / k for k in range(1, min(len(p.hand), p.hand_cap) + 1))
        fatigue = (14.0 / (max(1, len(p.deck)) ** 1.35)) if p.reshuffle_used else 0.0

        # 3. EX pair preservation bonus
        counts: Dict[str, int] = {}
        for c in p.hand:
            counts[c.key] = counts.get(c.key, 0) + 1
        ex_bonus = 0.0
        for key, cnt in counts.items():
            if cnt >= 2:
                card = p.pool.get_by_key(key)
                hi = 0.35 if (card.pow >= 5 or card.is_defensive or card.type != "normal") else 0.0
                reach = 0.25 if p.pool.can_reach(card, dist) else 0.0
                ex_bonus += 0.55 + hi + reach

        # 4. Positional center control & corner penalty (escape-tool aware, 0..8 Arena Space)
        center = 0.65 * (1.0 - abs(p.space - 4) / 4.0)
        raw_corner = 1.65 if p.space in (0, 8) else (0.70 if p.space in (1, 7) else 0.0)
        if p.prefers_edge:  # e.g., Vega
            corner_term = +0.90 if p.space in (0, 8) else 0.0
        else:
            escape_disc = 0.55 if p.has_corner_escape_tool() else 0.0
            corner_term = -raw_corner * (1.0 - escape_disc)
        range_fit = 0.90 * p.fraction_hand_in_range(dist)

        # 5. Initiative, threat-range discipline, active Boosts & Exceed proximity
        is_act = state.active_player == pid
        init_term = 1.45 if is_act else (-1.85 if dist in opp.optimal_threat_ranges() else 0.0)
        boost_term = sum(b.neutral_value() for b in p.boosts_in_play)
        gauge_term = 0.55 * len(p.gauge) + (1.10 if (not p.exceeded and len(p.gauge) >= p.exceed_cost) else 0.0)
        exceed_term = 2.20 if p.exceeded else 0.0

        return (
            life_term + hand_val - fatigue + ex_bonus
            + center + corner_term + range_fit
            + init_term + boost_term + gauge_term + exceed_term
        )


class ISMCTSPlanner:
    """Single-Observer IS-MCTS with Layer 1 determinization & Layer 2 Strike abstraction."""

    def __init__(
        self,
        rules_engine,
        strike_resolver,
        evaluator: NeutralEvaluator,
        force_pruner: ForcePruner,
        c_puct: float = 1.35,
        strike_sample_depth: int = 2,
        max_rollout_depth: int = 6,
    ):
        self.engine = rules_engine
        self.strike_resolver = strike_resolver
        self.evaluator = evaluator
        self.pruner = force_pruner
        self.c_puct = c_puct
        self.strike_sample_depth = strike_sample_depth
        self.max_rollout_depth = max_rollout_depth
        self.root: Optional[InfoSetNode] = None

    def plan_neutral_turn(
        self,
        root_state,
        compiled_belief,
        rng: random.Random,
        iterations: int = 2000,
        neural_net=None,
    ) -> Tuple[NeutralMacroAction, Dict[NeutralMacroAction, EdgeStats]]:
        root_key = root_state.info_set_hash("ai")
        if self.root is None or self.root.info_key != root_key:
            self.root = InfoSetNode(info_key=root_key, acting_player="ai")

        for _ in range(iterations):
            # 1. Sample belief-consistent world from Layer 1
            det = compiled_belief.sample_determinization(rng.random)
            sim_state = self.engine.materialize_world(root_state, det, rng)
            self._simulate(self.root, sim_state, compiled_belief, rng, depth=0, neural_net=neural_net)

        best_action = max(self.root.edges.items(), key=lambda kv: kv[1].visits)[0]
        return best_action, dict(self.root.edges)

    def _simulate(
        self,
        node: InfoSetNode,
        state,
        compiled_belief,
        rng: random.Random,
        depth: int,
        neural_net,
    ) -> float:
        if state.is_terminal:
            return 1.0 if state.winner == "ai" else -1.0
        if depth >= self.max_rollout_depth:
            return self.evaluator.evaluate(state, neural_net, nn_weight=0.8 if neural_net else 0.0)

        # Asymmetric observability: enumerate legal macro-actions using ONLY acting player's private hand
        legal = self._enumerate_macro_actions(state)
        if not legal:
            return self.evaluator.evaluate(state, neural_net)

        # Ensure edges exist & increment availability count N_avail(u, a)
        priors = self._compute_priors(state, legal, neural_net)
        for act, pr in zip(legal, priors):
            if act not in node.edges:
                node.edges[act] = EdgeStats(prior=pr)
            node.edges[act].avail_visits += 1

        # Select action via Availability-Normalized PUCT (sign flipped for opponent minimization)
        sign = 1.0 if node.acting_player == "ai" else -1.0
        prior_sum = sum(node.edges[a].prior for a in legal) or 1.0
        parent_val = (sum(e.value_sum for e in node.edges.values()) / max(1, node.total_visits))

        def puct(act: NeutralMacroAction) -> float:
            e = node.edges[act]
            q = (sign * e.q_value) if e.visits > 0 else (sign * parent_val - 0.15)
            u = self.c_puct * (e.prior / prior_sum) * math.sqrt(e.avail_visits) / (1.0 + e.visits)
            return q + u

        chosen = max(legal, key=puct)
        edge = node.edges[chosen]

        # Handle Strike Node Coupling (Layer 3 <-> Layer 2)
        if chosen.kind == "strike":
            eq = self.strike_resolver.solve(state, compiled_belief, rng, mode="mcts_rollout")
            if depth > self.strike_sample_depth:
                # Mode 2: Fast analytical Nash leaf evaluation
                val = (
                    (1.0 if eq.game_value > 0 else -1.0)
                    if abs(eq.game_value) >= 5000.0
                    else math.tanh(eq.game_value / 14.0)
                )
            else:
                # Mode 1: Outcome sampling -> continue neutral tree post-strike
                ai_atk = self.strike_resolver.sample_action(eq, rng)
                opp_atk = state.sample_legal_opp_strike_from_eq(eq, rng)
                next_state = self.engine.simulate_strike(state, ai_atk, opp_atk)
                val = self._descend_or_rollout(node, chosen, next_state, compiled_belief, rng, depth + 1, neural_net)
        else:
            next_state = self.engine.step_neutral(state, chosen)
            val = self._descend_or_rollout(node, chosen, next_state, compiled_belief, rng, depth + 1, neural_net)

        # Backpropagate AI-perspective value v ∈ [-1, 1]
        node.total_visits += 1
        edge.visits += 1
        edge.value_sum += val
        return val

    def _descend_or_rollout(self, node, chosen, next_state, compiled_belief, rng, next_depth, neural_net) -> float:
        if chosen not in node.children:
            child_actor = next_state.active_player
            node.children[chosen] = InfoSetNode(next_state.info_set_hash(child_actor), child_actor)
            return self._heavy_rollout(next_state, compiled_belief, rng, next_depth, neural_net)
        return self._simulate(node.children[chosen], next_state, compiled_belief, rng, next_depth, neural_net)

    def _heavy_rollout(self, state, compiled_belief, rng, depth, neural_net) -> float:
        cur = state
        d = depth
        while not cur.is_terminal and d < self.max_rollout_depth:
            legal = self._enumerate_macro_actions(cur)
            if not legal:
                break
            # Filter suicidal actions (low-HP pass inside threat range or immediate self-mill)
            safe = [a for a in legal if not cur.is_suicidal_neutral(a)] or legal
            if rng.random() < 0.12:
                act = rng.choice(safe)
            else:
                act = max(safe, key=lambda a: cur.quick_rollout_score(a))
            if act.kind == "strike":
                eq = self.strike_resolver.solve(cur, compiled_belief, rng, mode="mcts_rollout")
                return math.tanh(eq.game_value / 14.0)
            cur = self.engine.step_neutral(cur, act)
            d += 1
        return self.evaluator.evaluate(cur, neural_net, nn_weight=0.8 if neural_net else 0.0)

    def _enumerate_macro_actions(self, state) -> List[NeutralMacroAction]:
        return state.generate_factored_neutral_actions(self.pruner)

    def _compute_priors(self, state, legal, neural_net) -> List[float]:
        if neural_net is not None:
            return neural_net.predict_policy(state, legal)
        scores = [state.quick_rollout_score(a) for a in legal]
        m = max(scores)
        exps = [math.exp(s - m) for s in scores]
        tot = sum(exps) or 1.0
        return [e / tot for e in exps]
```

---

## 6. Strategic Validation Suite (3 Concrete Unit Test Cases)

### Scenario 1: Initiative & Threat-Range Discipline (Range 3, 2 Expendable Force)

- **Board State:** AI (Ryu) at space `3`, Opponent (Ken) at space `6` (**Range 3**), both at `20 HP`, `1 Gauge`, Cycle 0 (`deckSize = 18`). AI holds `[Grasp, Shoryuken, Cross, Sweep, Spike]` (`Hand = 5`; `Grasp`/`Shoryuken` want Range 1, `Cross`/`Sweep`/`Spike` work at Range 2–3). Opponent's optimal threat band is **Range 1–2** (`Cross`, `Assault`, `Donkey Kick`, `Axe Kick`, `Shoryuken`).
- **Competing Neutral Lines:**
  - **Line A (`Move` to space 4 $\rightarrow$ Range 2, spending 1 Force):** Pays 1 card, ends turn at **Range 2** with `isActive = false`! Opponent immediately starts their turn as **Active Player at Range 2** (winning all Speed ties!).
    - One-ply evaluation delta: `-0.82` (card spent) `- 1.45` (lost Active) `- 1.85` (exposed in opp optimal threat range) $+ 0.45$ (`RangeFit` gain) $\approx$ **`-3.67`** (and Layer 2 opponent-initiated Strike at Range 2 scores `V_GTO = -1.95`!).
  - **Line B (`Prepare` at Range 3, or `PlayBoost(Grasp: +2 POW)` at Range 3):** Stays outside Ken's optimal Range 1–2 threat band! If Ken wants Range 2 next turn, *Ken* must spend Force to Move and hand *AI* Active Player initiative!
    - Evaluation delta: `+0.80` (2 cards drawn via Prepare, or `+1.35` continuous `+2 POW` Boost active at Range 3) with **zero** threat-range penalty (`0.0`).
- **Expected IS-MCTS Output:** Over 2,000 iterations, `PlayBoost(Grasp)` (`~54%` visits, `Q = +0.16`) and `Prepare` (`~32%` visits, `Q = +0.11`) dominate; naive `Move(space=4)` collapses to `< 5%` visits (`Q = -0.21`), proving initiative discipline.

---

### Scenario 2: EX Pair Preservation vs. Tempo Boost (Range 2, 2× Focus)

- **Board State:** AI is Active Player at **Range 2** (`18 HP vs 18 HP`, `1 Gauge`, Cycle 0), holding `[Focus, Focus, Cross, Metsu Hadoken (Boost: +2 POW/+2 SPD, Force 1)]` (`Hand = 4`).
- **Competing Neutral Lines:**
  - **Line A (`PlayBoost(Metsu Hadoken)` paying 1× `Focus` as Force):** `ForcePruner` notes `Cross` has lower EX value (`MRV = 1.65`) than breaking the `Focus` pair (`MRV = 2.85`), so canonical Force payment picks `Cross`—or if hand is `[Focus, Focus, Metsu Hadoken]` (`Hand = 3`, forced to pitch `Focus`!):
    - Breaking the `Focus` pair incurs `-1.05` (marginal 3rd-card loss) `- 1.15` (EX Focus pair bonus lost) `= -2.20` ($\tau_{\text{EX}}$) PLUS hands opponent Active Player at Range 2 (`-1.85` threat exposure!), totaling `-4.05` before the Boost pays off (`+2.20` Boost value) $\rightarrow$ net **`-1.85`**!
  - **Line B (`InitiateStrike` with EX `Focus` preserved):** Layer 2 receives `[Focus, EX Focus, Wild Swing]`. `EX Focus` (`RNG 1–2, POW 5, SPD 2, ARM 3, GRD 6, Opponents can't move you, After: Draw 1`) tanks virtually every Ken Normal/Special, deals 5 damage, stays unstunned, draws 1 card, and gains 1 Gauge (`V_GTO = +2.65`, `Q ≈ +0.19`).
- **Expected IS-MCTS Output:** When `Cross` is available, `ForcePruner` strictly forbids pitching `Focus` (`MRV(Cross) < MRV(Focus)`). When `Focus` would have to be broken (`Hand = 3`), IS-MCTS selects `InitiateStrike` (`~78%` visits, preserving EX Focus) over breaking the pair for the Boost (`< 12%` visits).

---

### Scenario 3: Corner Escape vs. Deck Fatigue (Space 1, Cycle 1, 5 Cards Left in Deck)

- **Board State:** AI is cornered at **Space 1**, Opponent at **Space 2** (Range 1), `14 HP vs 14 HP`, **`reshuffleUsed = true` (Cycle 1)**, **`deckSize = 5`**. AI holds `[Hadoken, Spike, Metsu Hadoken (Ultra, 2 Force), Block, Sweep]` (`Hand = 5`, `1 Gauge` — `Metsu Hadoken` unaffordable!).
- **Competing Neutral Lines:**
  - **Line A (`Change Cards 2`, pitching 2 cards to draw 2 + 1 EoT draw = 3 cards drawn):**
    - `deckSize` drops from `5 -> 2` in Cycle 1!
    - Deck fatigue penalty explodes from `-1.59` (`deck=5`) to **`-5.49`** (`deck=2`, delta **`-3.90`**!) while AI remains trapped at Space 1 (`CornerPenalty = -1.65`) with opponent Active at Range 1!
  - **Line B (`Move` to Space 3 — passing through Opponent at Space 2 for 2 Force, paying `Metsu Hadoken` as single 2-Force Ultra!):**
    - `ForcePruner` selects `Metsu Hadoken` (`MRV/2 = 0.08`, exact 2-Force Ultra economy, zero EX pairs broken, keeps `Block` & `Sweep`!).
    - Only 1 EoT card is drawn (`deckSize: 5 -> 4`, fatigue delta only `-0.56` vs `-3.90`!).
    - AI escapes Space 1 to Space 3 (`CornerPenalty: -1.65 -> 0.0`, Center control `+0.33`, Range 1 -> Range 1 on opposite side or Space 4 for Range 2 where `Spike` & `Sweep` come online!).
- **Expected IS-MCTS Output:** `Move(space=3/4, force=[Metsu Hadoken])` captures **`> 70%` of root visits** (`Q = +0.08`), while `Change Cards 2` (`Q = -0.34`) and `Prepare` (`Q = -0.26`, `deckSize: 5 -> 3` while staying cornered) are heavily suppressed by the coupled fatigue + corner-escape terms.

# Exceed Fighting System — Layer 4: Character-Specific Adaptation, Meta-Learning & Production Roadmap

> **Architecture Series:** [Layer 1: Belief Engine](./exceed-ai-layer1-belief-engine.md) $\rightarrow$ [Layer 2: Strike Resolver](./exceed-ai-layer2-strike-resolver.md) $\rightarrow$ [Layer 3: Neutral IS-MCTS](./exceed-ai-layer3-neutral-ismcts.md) $\rightarrow$ **Layer 4: Neural Adaptation & Production Roadmap (this document)**  
> **Status:** Complete Neural Architecture, Training Curriculum, Failure-Mode Matrix & Execution Roadmap  
> **Target Budgets:** Batched inference ($B = 32$) $< 0.5\text{ ms}$ (GPU/TensorRT) · $< 1.2\text{ ms}$ (INT8 ONNX CPU) · Rules Engine $> 15{,}000$ transitions/sec

### Explicit Architectural Assumptions

1. **Zero Character-ID Lookup Tables:** No fighter-specific weights or character-ID embeddings exist anywhere in the neural network. Every character's cards, Innate/Exceed abilities, stances, spatial tokens (e.g., Zato-1's Eddie, Rachel Alucard's Lightning Rods, Shovel Knight's Dirt Piles, Jack-O's Servants), and custom gauges are projected into a **fixed mechanic-primitive schema**, enabling immediate zero-shot transfer to unseen DLC fighters.
2. **Engine Tiering (Prototype vs. Production Training):** The repository's current JS/TS engine (`game/engine.js` + `src/ai/layer1/*`) serves as the authoritative rules oracle and interactive web deliverable, while Milestone 1 specifies a bit-exact, headless **Rust/C++ Rules Engine** validated via differential fuzzing against the JS oracle to achieve $> 15{,}000$ transitions/sec for multi-million-game League self-play.
3. **Hard Conservation Always Owned by Layer 1:** Layer 4's auxiliary Opponent Hand Belief Head outputs *soft log-odds* that replace/blend with Layer 1's manual behavioral heuristics (`BayesianUpdater`), while Layer 1's exact conservation math and Fisher Noncentral DP remain the immutable source of truth for hard zone bounds (`knownHand`, `excludedFromHand`, `knownDeckTop`/`Bottom`).

---

## 1. Character-Agnostic State & Card Feature Encoding ($X(s)$)

Every state $s$ (from the acting/AI player's perspective, canonically oriented so the AI's own corner is always space `1` and opponent's corner is space `9` via horizontal symmetry mirroring!) is encoded into **five fixed-schema tensors**:

### 1.1 Spatial Arena Grid Tensor: $X_{\text{spatial}} \in \mathbb{R}^{9 \times 18}$

Each of the 9 arena spaces $x \in \{1..9\}$ carries 18 normalized channels:

| Channels | Feature Group | Encoding Details |
|---|---|---|
| `0..1` | Fighter Occupancy | `[is_ai_here, is_opp_here]` (binary) |
| `2..4` | Geometry & Edges | `[dist_to_center / 4, is_own_corner (x==1), is_opp_corner (x==9)]` |
| `5..6` | Reachable Threat Map | `[ai_hand_can_hit_space_x, opp_belief_threat_mass_at_space_x]` |
| `7..10` | Spatial Token / Trap Slot A | `[owner (-1/+1/0), trigger_kind_id_norm, dmg_or_push_mag / 5, blocks_or_range_origin]` (e.g., Rachel Lightning Rod, Shovel Knight Dirt Pile, Zato-1 Eddie) |
| `11..14` | Spatial Token / Trap Slot B | Secondary token/trap on space $x$ (supports multi-token fighters like Jack-O / Arakune / Faust items) |
| `15..17` | Space-Specific Modifiers | `[wall_bounce_risk, pass_through_blocked, active_zone_hazard_flag]` |

### 1.2 Global & Character Mechanics Vector: $X_{\text{global}} \in \mathbb{R}^{38}$

- **Life & Lethal Geometry (8):** `life_ai/30`, `life_opp/30`, `(life_ai - life_opp)/30`, `ln((life_ai+4)/4)/2.2`, `ln((life_opp+4)/4)/2.2`, `ai_in_lethal_zone`, `opp_in_lethal_zone`, `dist/8`.
- **Resource & Deck Economy (12):** `hand_ai/9`, `hand_opp/9`, `deck_ai/30`, `deck_opp/30`, `reshuffle_used_ai`, `reshuffle_used_opp`, `fatigue_ai = reshuffle_ai / (deck_ai+1)`, `fatigue_opp = reshuffle_opp / (deck_opp+1)`, `gauge_ai/8`, `gauge_opp/8`, `(gauge_ai - exceed_cost_ai)/4`, `(gauge_opp - exceed_cost_opp)/4`.
- **Turn, Tempo & Cancel State (6):** `is_active_ai`, `advantage_ai`, `advantage_opp`, `canceled_this_turn`, `extra_actions_rem/3`, `turn_number/40`.
- **Transform, Install & Custom Resource Counters (12):** `exceeded_ai`, `exceeded_opp`, `overdrive_ai/6`, `overdrive_opp/6`, `astral_pending_ai`, `astral_pending_opp`, `stance_vector_ai[3]` (encoded by stance effect primitives: `pow_mod`, `spd_mod`, `range_mod`), `stance_vector_opp[3]`.

### 1.3 Card Semantic Embedding Schema: $e(c) \in \mathbb{R}^{48}$

Every card—whether from *Street Fighter*, *Guilty Gear*, *BlazBlue*, *Shovel Knight*, or an unseen future DLC character—is compiled by the Card DSL into the exact same 48-dimensional vector:

| Slice | Dim | Semantic Features |
|---|---:|---|
| `0..11` | 12 | **Base Card Profile:** `[is_normal, is_special, is_ultra, is_astral, range_lo/8, range_hi/8, pow/10, spd/10, arm/6, grd/8, gauge_cost/4, force_val/2]` |
| `12..35` | 24 | **Structured Mechanic Primitives (Zero-Shot Transfer Core):** `[before_adv/4, before_close/4, before_up_to, after_retreat/4, after_push_pull/4, ignore_armor, ignore_guard, stun_immune, movement_immune, range_immune_lo/8, range_immune_hi/8, hit_advantage, hit_draw/3, hit_opp_discard, side_swap_bonus, always_miss, has_critical, crit_pow/4, crit_spd/4, boost_continuous, boost_force/3, boost_triggers_strike, boost_cancelable, goes_to_gauge]` |
| `36..47` | 12 | **Dynamic Board & Layer 1 Belief Context:** `[reaches_cur_dist, affordable_now, forms_ex_pair, copies_in_set/4, layer1_p_ge1, layer1_p_ex, layer1_p_top, is_known_hand, is_excluded_hand, zone_is_hand, zone_is_boost_in_play, zone_is_discard_or_gauge]` |

### 1.4 Permutation-Invariant Card Sets & Fighter Kit Primitives

1. **`AI_Hand_Set` ($[B, L_h \le 9, 48]$):** Exact private hand cards (explicitly setting `forms_ex_pair = 1` when multiplicity $\ge 2$).
2. **`Opp_Belief_Set` ($[B, C \le 18, 48]$):** One token per distinct card key in the opponent's `CardPool`, populated with Layer 1's exact `[P(>=1), P(EX>=2), P(top), knownHand, excluded]`.
3. **`Public_Zones_Set` ($[B, L_p \le 32, 48]$):** Active Continuous Boosts (tagged `zone_is_boost_in_play = 1`), Gauge, Overdrive, Sealed, and top/key Discard cards.
4. **`Fighter_Kit_Primitives` ($[B, 2, 24]$):** Character-agnostic mechanic descriptors for both fighters' Innate/Exceed/Character-Action kits: `[exceed_cost/5, uses_critical, uses_overdrive, uses_cancel, uses_tokens, prefers_edge, action_free_move, action_free_draw, action_triggers_strike, action_force_cost/2, innate_pow_mod, innate_spd_mod, innate_range_mod, exceed_pow_mod, exceed_spd_mod, exceed_range_mod, exceed_may_strike, exceed_draw/3, revert_on_non_strike, wild_swing_bonus, ...]` (24 floats).

---

## 2. Neural Network Architecture & IS-MCTS Integration

### 2.1 Lightweight Set-Transformer + Spatial Conv-ResNet (~440K Parameters)

```
X_spatial [B,18,9]      X_global [B,38]     AI_Hand [B,Lh,48]   Opp_Belief [B,C,48]   Public [B,Lp,48]
       │                       │                    │                    │                    │
  2x 1D-ConvRes           Linear+SiLU        ┌──────┴────────────────────┴────────────────────┴──────┐
  (18->64, k=3)            (38->64)          │   Shared CardEncoder MLP (48->96) + 2-Layer Pre-LN    │
       │                       │             │   Set-Transformer (d=96, 4 heads, FFN=192)            │
  Flatten+Proj                 │             └──────┬────────────────────┬────────────────────┬──────┘
   (576->128)                  │               H_tok [B,Lh,96]     O_tok [B,C,96]       P_tok [B,Lp,96]
       │                       │                    │ (PMA Pool)         │ (PMA Pool)         │ (PMA Pool)
       │                       │               H_vec [B,128]       O_vec [B,128]        P_vec [B,128]
       └───────────┬───────────┴────────────────────┴────────────────────┴────────────────────┘
                   │  + FighterKit MLP (48->64)  ==>  Concat [B, 640]
                   ▼
          3x Residual MLP Blocks (640 -> 256 -> 256, LayerNorm + SiLU)  ==>  z [B, 256]
                   │
     ┌─────────────┼─────────────────────────────┬──────────────────────────────────────┐
     ▼             ▼                             ▼                                      ▼
Value Head    Fixed Neutral Policy       Pointer-Attention Boost Policy     Auxiliary Belief Head
(256->64->1)  (256->128->18)             Dot(Proj(z), H_tok_i) / sqrt(d)    CrossAttn(O_tok, z)->3
  tanh ->     [Move(1..9), Prep,         Dynamic logit per card in hand     Logits over {0,1,>=2}
 v_θ ∈[-1,1]   Change(1..3), Exceed,     for PlayBoost(card_i)              copies per opp card c!
               Reshuffle, Strike, Act]   (Zero fixed card-ID outputs!)
```

- **Why Set-Transformer + Pointer-Attention?**
  - **Permutation invariance:** Hand order never matters in Exceed; Set-Transformer self-attention directly learns cross-card synergies (e.g., *Assault* + *Grasp* close-range overlap, or *Boost* + *Cancel* chains) across arbitrary fighter kits.
  - **Dynamic Boost Policy via Pointer Attention:** Instead of hardcoding a 1,500-class output layer for every boost card in Exceed history, the policy head computes scaled dot-product attention between trunk embedding $z$ and each hand card's contextual embedding `H_tok[i]`, generalizing zero-shot to any new character's Boosts!
  - **Auxiliary Opponent Belief Head ($\hat{p}_\theta(c \mid s_{\text{public}})$):** Takes each card token `O_tok[c]` cross-attended with public state $z$ (strictly zeroing AI private-hand leakage during auxiliary training if deploying inside public-only Layer 1!) and predicts calibrated log-odds over `{0 copies, 1 copy, >=2 copies}` in the opponent's true hand.

### 2.2 Exact Layer 3 & Layer 2 Integration Protocol

1. **PUCT Prior Guidance (Layer 3):** At every newly expanded `InfoSetNode`, mask invalid logits in $\pi_\theta(a \mid s)$ to $-\infty$ and apply softmax to populate `EdgeStats.prior`, replacing ad-hoc heuristic priors.
2. **Leaf Value Evaluation (Layer 3):** At depth $D_{\max}$, evaluate leaf states in GPU/ONNX batches of size $B = 32$ using **Virtual Loss** ($N \leftarrow N + 3,\ W \leftarrow W - 3$ during in-flight batching) so parallel MCTS simulations explore distinct leaves while amortizing neural inference to **$< 0.5\text{ ms}$ per batch** ($15\ \mu\text{s}$/leaf!).
3. **Layer 2 Tactical Ground Truth:** When IS-MCTS expands an `InitiateStrike` edge, Layer 2 (`StrikeResolver` CFR+) still computes the exact simultaneous-reveal equilibrium value $V_{\text{GTO}}(s)$ and mixed strategies $(\sigma^*_{\text{AI}}, \sigma^*_{\text{opp}})$. The neural network **never replaces Layer 2's game-theoretic mixing**—instead, Layer 2's exact tactical equilibria anchor the neural value head during training!
4. **Layer 1 Belief Distillation:** At runtime, the auxiliary belief head's predicted log-odds $\ell_\theta(c)$ blend smoothly with Layer 1's `logWeights`:
   $$\ell_{\text{final}}(c) = (1 - \gamma_{\text{NN}})\,\ell_{\text{heuristic}}(c) + \gamma_{\text{NN}}\,\operatorname{clip}\!\left(\log\frac{\hat{p}_\theta(c \ge 1)}{1 - \hat{p}_\theta(c \ge 1)} - \log\frac{p_{\text{unw}}(c \ge 1)}{1 - p_{\text{unw}}(c \ge 1)},\ -4.0,\ +4.0\right)$$
   preserving Layer 1's exact Fisher Noncentral DP and hard conservation guarantees!

---

## 3. AlphaZero-Style Self-Play & Meta-Learning Curriculum

### 3.1 Three-Phase Training Pipeline

1. **Phase 1 — Supervised Bootstrap (Heuristic + CFR Teacher, 100K Games):**
   - Generate diverse mirror and cross-matchup trajectories using Layer 1 (Exact Counting) + Layer 2 (CFR+ Strike) + Layer 3 (Heuristic IS-MCTS with $H_{\text{neutral}}$).
   - Warm-start $\theta$ on `(state -> final outcome z, MCTS visit policy π_MCTS, Layer 2 V_GTO, ground-truth opp hand y_hand)`. Eliminates the cold-start random-play desert where Exceed games stall into Deck-Out draws.
2. **Phase 2 — Curriculum Self-Play & StarCraft-Style League Training (2M–10M Games):**
   - Maintain a **League Population** (Vinyals et al. 2019):
     - **Main Agents (2):** Trained against all active agents and past checkpoints via **Prioritized Fictitious Self-Play (PFSP)**—sampling harder opponents with probability $P(\text{opp}) \propto (1 - \text{winrate})^2$.
     - **Main Exploiters (2):** Periodically reset to Phase 1 weights and trained strictly against the current Main Agent to expose character-specific weaknesses (e.g., failing to respect Zangief's Range-1 Criticals or Rachel's Lightning Rod traps).
     - **League Exploiters (2):** Trained against the entire historical league to prevent cyclic forgetting across archetypes (Zoners vs. Grapplers vs. Rushdown vs. Setup/Trap).
   - **Curriculum Schedule:** Stage 2A: 8 balanced core fighters (mirrors + cross) $\rightarrow$ Stage 2B: full 41-fighter repository roster (multi-season mechanics: Critical, Cancel, Overdrive, Eddie) $\rightarrow$ Stage 2C: 100+ full Exceed roster with **4 held-out fighters** reserved exclusively for zero-shot generalization eval.
3. **Phase 3 — Opponent Modeling & Behavioral Belief Distillation:**
   - Freeze the self-play policy/value trunk (or low-LR joint fine-tune) and train the **Auxiliary Belief Head** exclusively on public-observable trajectory histories paired with ground-truth opponent hands from high-Elo League games—automatically discovering subtle pro tells (e.g., specific Boost timings, Gauge-holding patterns for Ultras, Exceed baiting) that surpass hand-coded rules.

### 3.2 Composite Loss Function & Stratified Replay Buffer

$$\mathcal{L}(\theta) = \underbrace{(z - v_\theta(s))^2}_{\text{Terminal Value MSE}} + 0.35\,\underbrace{\bigl(\tanh(V_{\text{GTO}}/14) - v_\theta(s_{\text{strike}})\bigr)^2}_{\text{Layer 2 CFR Tactical Anchor}} - \underbrace{\pi_{\text{MCTS}}^\top \log \pi_\theta(\cdot \mid s)}_{\text{Masked Policy Cross-Entropy}} + 0.50\,\underbrace{\frac{1}{|E|}\sum_{c \in E}\text{CE}\bigl(y_c,\ \hat{p}_\theta(c \mid s_{\text{pub}})\bigr)}_{\text{Auxiliary Hand Belief Loss}} + 10^{-4}\|\theta\|_2^2$$

- **Stratified Replay Buffer (2M transitions):** Bucketed by `(matchup_archetype_pair, turn_phase ∈ {early, mid, endgame_fatigue}, is_exceeded)` with uniform sampling across buckets so rare endgames (Cycle-1 Deck-Out races, Astral Heat turns, low-HP corner escapes) never get drowned out by Turn 1–4 neutral openings.

---

## 4. Critical Engineering Pitfalls & Solutions Matrix

| # | Critical Failure Mode | Root Cause & Failure Mechanism | Concrete Architectural Solution |
|---|---|---|---|
| **1** | **Strategy Fusion & Non-Locality in IS-MCTS** | Determinizing $H_{\text{opp}}^{(k)}$ before running separate trees allows AI to "cheat" by choosing different actions per sampled hand, and lets opponent nodes read AI's hidden hand during lookahead. | (1) **SO-ISMCTS** shared information-set root aggregation with per-edge availability counts $N_{\text{avail}}(u, a)$. (2) **Asymmetric Observability**—opponent neutral nodes strictly consume `publicInfoOf(AI)`. (3) Delegate all Strike nodes to **Layer 2 CFR+** so simultaneous hidden combat is never flattened into sequential perfect-information branches. |
| **2** | **Combinatorial Action Explosion (Force & Boost Subsets)** | Choosing which subset of cards to pitch for Move/Change/Boost produces $2^{|H|}$ (up to 128+) redundant edges per neutral intent, starving MCTS visit counts. | **Canonical Action Factoring (`ForcePruner`):** Solve exact 1D min-MRV knapsack over Hand + Gauge sources (scoring EX-pair preservation, target-range reach, defensive value, and 2-Force Ultra efficiency), collapsing each Move distance / Boost / Change-Cards count to **1 canonical macro-action** ($B_{\text{eff}} \le 16$). |
| **3** | **Meta-Cycling & Matchup Overfitting (100+ Fighters)** | Naive self-play oscillates in RPS cycles (e.g., rushdown beats zoner beats grappler beats rushdown) and overfits to dominant high-winrate fighters. | **League Training + PFSP** (`P(opp) ∝ (1 - winrate)^2`), Elo-stratified matchup sampling across archetype clusters, Main/League Exploiters, and zero character-ID inputs so parameter updates transfer structurally across fighters. |
| **4** | **Rules Engine Timing & Priority Bugs** | Exceed's simultaneous trigger stack (`Before` / `Hit` / `After`, Active Player priority, `selfArmorZero` ordering, `sealAfterUse`, mid-draw auto-reshuffle, Astral Heat timing) causes silent RL reward-hacking if buggy. | (1) **Property-based invariant assertions** checked after every transition (card conservation across all 7 zones, valid space `1..9`, legal Gauge/Force totals). (2) **Differential fuzzing** comparing the fast Rust/C++ engine bit-for-bit against the JS reference engine over 1M seeded games. (3) Regression suite built from real tournament replays & `EXdata.xlsx` parity tests. |
| **5** | **Inference Latency Bottlenecks (Python GIL vs. C++/Rust)** | Invoking PyTorch per MCTS leaf across the Python GIL caps throughput at ~200 evals/sec, reducing IS-MCTS to shallow ~50-iteration play. | Decouple search and inference: **Rust/C++ multi-threaded IS-MCTS workers** accumulate $B = 32$ pending leaves using Virtual Loss, write packed float32 tensors into a **lock-free shared-memory ring buffer**, and a dedicated **C++ ONNX Runtime / TensorRT (FP16/INT8)** inference thread returns batched `(v, π, p_belief)` in $< 0.5\text{ ms}$. |

---

## 5. Phased Engineering & Implementation Roadmap

| Milestone | Scope & Core Deliverables | Quantitative KPIs & Acceptance Gates | Primary Risks & Mitigations |
|---|---|---|---|
| **M1: Headless Rules Engine & Card DSL** *(Weeks 1–4)* | • Declarative Card DSL compiling `EXdata.xlsx` / `game/cards.js` into static mechanic primitives<br>• Headless Rust/C++ state engine + differential fuzzer against JS reference engine | • **$> 15{,}000$** full state transitions/sec per core<br>• **$0$ invariant violations** & **$0$ differential mismatches** across $1\text{M}$ random fuzz games covering all 41 repo fighters<br>• 100% pass on existing `tests/exceed.test.ts` parity suite | *Risk:* Subtle trigger-stack divergences (e.g., Nagoriyuki/Leo cleanup, Zato-1 Eddie range).<br>*Mitigation:* Auto-generated differential test harness comparing canonical state hashes after every Strike & turn. |
| **M2: Exact Card Counting (L1) + CFR Strike Bot (L2)** *(Weeks 5–8)* | • Port verified Layer 1 Fisher DP & `BeliefState` (`src/ai/layer1/*`) to native engine<br>• Implement Layer 2 `PayoffMatrixBuilder`, Zobrist cache, Dominance Pruning & Dual CFR+ (`Harsanyi` + `Water-Fill`) | • **$> 85\%$ win rate** against deterministic highest-EV baseline across 2,000 cross-matchup games<br>• **$< 5\text{ ms}$** p99 real-time Strike solve ($K=48$); **$< 0.2\text{ ms}$** IS-MCTS rollout Strike call<br>• Exact DP marginals verified to $< 10^{-12}$ vs. brute force | *Risk:* Lethal $\pm 10{,}000$ cells stalling CFR+ convergence.<br>*Mitigation:* Terminal-scale compression ($\pm 5\cdot\max_{\text{non-term}}$) + exploitability duality-gap monitor ($\epsilon_{\text{Nash}} \le 10^{-3}$). |
| **M3: IS-MCTS Neutral Planner (L3) + Action Factoring** *(Weeks 9–12)* | • Implement SO-ISMCTS with Availability-Normalized PUCT, `ForcePruner`, Dual-Mode Strike Coupling, Heavy Playouts, and 4-thread Root Parallelization | • **$50\text{–}150\text{ ms}$** turn latency ($1{,}500\text{–}4{,}000$ iterations)<br>• **$> 70\%$ win rate** over M2 bot + existing 3-turn planner (`game/ai.js`)<br>• Quantified pro discipline: $> 80\%$ EX-pair retention on low-EV boosts, $< 1\%$ Cycle-1 self-mill losses | *Risk:* Strategy fusion / opponent omniscience in deep rollouts.<br>*Mitigation:* Enforce asymmetric `publicInfoOf()` masking on all opponent tree nodes + Layer 2 Strike encapsulation. |
| **M4: Feature-Encoded Neural Evaluator & League Self-Play (L4)** *(Weeks 13–20)* | • Implement `StateEncoder` & Set-Transformer `ExceedValuePolicyNet`<br>• Run Phase 1 bootstrap $\rightarrow$ Phase 2 PFSP League training $\rightarrow$ Phase 3 Belief Head distillation<br>• Export FP16/INT8 ONNX Runtime batched worker | • **$+200$ Elo** ($\ge 76\%$ win rate) over pure-heuristic M3 IS-MCTS across full roster<br>• **$< 15\%$ win-rate drop** on **4 held-out unseen test fighters** (zero-shot generalization gate)<br>• Auxiliary Belief Head beats manual Layer 1 tells in Strike-reveal cross-entropy by $\ge 12\%$<br>• **$< 0.5\text{ ms}$** GPU / **$< 1.2\text{ ms}$** CPU batch-32 inference | *Risk:* Meta-cycling or overfitting to core roster.<br>*Mitigation:* PFSP + Main/League Exploiters + stratified replay buffer + zero character-ID inputs enforced by architecture tests. |

---

## 6. Production-Ready Pseudocode Blueprint (PyTorch)

```python
from __future__ import annotations
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple
import torch
import torch.nn as nn
import torch.nn.functional as F

SPATIAL_CH = 18
GLOBAL_DIM = 38
CARD_DIM = 48
KIT_DIM = 24
FIXED_NEUTRAL_ACTIONS = 18  # Move(1..9), Prepare, Change(1..3), Exceed, Reshuffle, Strike, CharAct(L/R)


@dataclass
class EncodedBatch:
    spatial: torch.Tensor       # [B, 18, 9]
    global_vec: torch.Tensor    # [B, 38]
    kit_vec: torch.Tensor       # [B, 2, 24]
    hand_set: torch.Tensor      # [B, Lh, 48]
    hand_mask: torch.Tensor     # [B, Lh] (True = valid token)
    belief_set: torch.Tensor    # [B, C, 48]
    belief_mask: torch.Tensor   # [B, C]
    public_set: torch.Tensor    # [B, Lp, 48]
    public_mask: torch.Tensor   # [B, Lp]


class StateEncoder:
    """Projects arbitrary Exceed fighter states into canonical AI-left-oriented tensors."""

    def encode_single(self, state, compiled_belief) -> EncodedBatch:
        # Mirror coordinates if AI stands to the right of opponent so spatial features are symmetric
        mirror = state.ai.space > state.opp.space
        map_x = (lambda x: 10 - x) if mirror else (lambda x: x)

        spatial = torch.zeros(SPATIAL_CH, 9, dtype=torch.float32)
        ai_x, opp_x = map_x(state.ai.space) - 1, map_x(state.opp.space) - 1
        spatial[0, ai_x] = 1.0
        spatial[1, opp_x] = 1.0
        for s in range(9):
            spatial[2, s] = abs((s + 1) - 5) / 4.0
        spatial[3, 0] = 1.0  # Own corner
        spatial[4, 8] = 1.0  # Opponent corner

        # Encode spatial tokens/traps (Rachel Rods, Shovel Knight Dirt, Zato-1 Eddie, Jack-O Servants)
        for tok in state.arena_tokens:
            tx = map_x(tok.space) - 1
            slot = 7 if spatial[7, tx] == 0.0 else 11
            spatial[slot, tx] = 1.0 if tok.owner == "ai" else -1.0
            spatial[slot + 1, tx] = tok.trigger_type_norm
            spatial[slot + 2, tx] = tok.magnitude / 5.0
            spatial[slot + 3, tx] = 1.0 if tok.is_attack_origin else 0.0

        global_vec = torch.tensor(state.extract_global_38(), dtype=torch.float32)
        kit_vec = torch.tensor([state.ai.kit_primitives_24(), state.opp.kit_primitives_24()], dtype=torch.float32)

        hand_vecs = [state.encode_card_48(c, zone="hand") for c in state.ai.hand]
        belief_vecs = [
            state.encode_opp_belief_card_48(c, compiled_belief.query_card_index(c.index))
            for c in compiled_belief.state.pool.cards
        ]
        public_vecs = [state.encode_card_48(c, zone=z) for (c, z) in state.iter_public_zone_cards()]

        return EncodedBatch(
            spatial=spatial.unsqueeze(0),
            global_vec=global_vec.unsqueeze(0),
            kit_vec=kit_vec.unsqueeze(0),
            hand_set=self._pad_set(hand_vecs, max_len=9),
            hand_mask=self._make_mask(len(hand_vecs), 9),
            belief_set=self._pad_set(belief_vecs, max_len=18),
            belief_mask=self._make_mask(len(belief_vecs), 18),
            public_set=self._pad_set(public_vecs, max_len=32),
            public_mask=self._make_mask(len(public_vecs), 32),
        )

    @staticmethod
    def _pad_set(vecs: List[List[float]], max_len: int) -> torch.Tensor:
        out = torch.zeros(1, max_len, CARD_DIM, dtype=torch.float32)
        for i, v in enumerate(vecs[:max_len]):
            out[0, i] = torch.tensor(v, dtype=torch.float32)
        return out

    @staticmethod
    def _make_mask(length: int, max_len: int) -> torch.Tensor:
        m = torch.zeros(1, max_len, dtype=torch.bool)
        m[0, : min(length, max_len)] = True
        return m


class SetTransformerBlock(nn.Module):
    """Pre-LN Multi-Head Self-Attention block with PMA pooling over permutation-invariant card sets."""

    def __init__(self, d_model: int = 96, n_heads: int = 4, out_dim: int = 128):
        super().__init__()
        self.proj = nn.Linear(CARD_DIM, d_model)
        enc_layer = nn.TransformerEncoderLayer(
            d_model=d_model, nhead=n_heads, dim_feedforward=d_model * 2,
            activation="gelu", batch_first=True, norm_first=True, dropout=0.0,
        )
        self.encoder = nn.TransformerEncoder(enc_layer, num_layers=2)
        self.seed_query = nn.Parameter(torch.randn(1, 1, d_model) * 0.02)
        self.pma = nn.MultiheadAttention(d_model, n_heads, batch_first=True)
        self.out_proj = nn.Linear(d_model, out_dim)

    def forward(self, x: torch.Tensor, mask: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        # mask: True = valid, key_padding_mask expects True = PAD
        pad_mask = ~mask
        # Guard against all-empty sets (e.g., empty hand or empty public zones)
        empty_rows = pad_mask.all(dim=1)
        safe_pad = pad_mask.clone()
        if empty_rows.any():
            safe_pad[empty_rows, 0] = False

        h = self.encoder(self.proj(x), src_key_padding_mask=safe_pad)
        q = self.seed_query.expand(x.size(0), -1, -1)
        pooled, _ = self.pma(q, h, h, key_padding_mask=safe_pad)
        pooled = self.out_proj(pooled.squeeze(1))
        if empty_rows.any():
            pooled = pooled.masked_fill(empty_rows.unsqueeze(1), 0.0)
        return h, pooled


class ResidualMLPBlock(nn.Module):
    def __init__(self, dim: int):
        super().__init__()
        self.net = nn.Sequential(
            nn.LayerNorm(dim), nn.SiLU(), nn.Linear(dim, dim),
            nn.LayerNorm(dim), nn.SiLU(), nn.Linear(dim, dim),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return x + self.net(x)


class ExceedValuePolicyNet(nn.Module):
    """Unified character-agnostic Value + Neutral Policy + Pointer Boost + Aux Belief network."""

    def __init__(self):
        super().__init__()
        # 1. Spatial 1D ConvResNet over spaces 1..9
        self.spatial_in = nn.Conv1d(SPATIAL_CH, 64, kernel_size=3, padding=1)
        self.spatial_res1 = nn.Sequential(nn.SiLU(), nn.Conv1d(64, 64, 3, padding=1))
        self.spatial_res2 = nn.Sequential(nn.SiLU(), nn.Conv1d(64, 64, 3, padding=1))
        self.spatial_proj = nn.Linear(64 * 9, 128)

        # 2. Global + Fighter Kit Encoders
        self.global_enc = nn.Sequential(nn.Linear(GLOBAL_DIM, 64), nn.SiLU())
        self.kit_enc = nn.Sequential(nn.Linear(KIT_DIM * 2, 64), nn.SiLU())

        # 3. Shared Set-Transformer Card Encoder (Hand, Opponent Belief, Public Zones)
        self.card_set_enc = SetTransformerBlock(d_model=96, n_heads=4, out_dim=128)

        # 4. Fusion Trunk (128 + 64 + 64 + 128*3 = 640 -> 256)
        self.trunk_in = nn.Linear(640, 256)
        self.trunk_blocks = nn.Sequential(ResidualMLPBlock(256), ResidualMLPBlock(256), ResidualMLPBlock(256))

        # 5. Output Heads
        self.value_head = nn.Sequential(nn.LayerNorm(256), nn.SiLU(), nn.Linear(256, 64), nn.SiLU(), nn.Linear(64, 1))
        self.fixed_policy_head = nn.Sequential(nn.LayerNorm(256), nn.SiLU(), nn.Linear(256, FIXED_NEUTRAL_ACTIONS))
        self.boost_query_proj = nn.Linear(256, 96)  # Pointer attention against hand card tokens
        # Auxiliary opponent hand belief head: predicts {0, 1, >=2} copies per opponent card token
        self.aux_belief_head = nn.Sequential(nn.Linear(96 + 256, 96), nn.SiLU(), nn.Linear(96, 3))

    def forward(self, batch: EncodedBatch) -> Dict[str, torch.Tensor]:
        s = self.spatial_in(batch.spatial)
        s = s + self.spatial_res1(s)
        s = s + self.spatial_res2(s)
        s_vec = F.silu(self.spatial_proj(s.flatten(1)))

        g_vec = self.global_enc(batch.global_vec)
        k_vec = self.kit_enc(batch.kit_vec.flatten(1))

        h_tok, h_vec = self.card_set_enc(batch.hand_set, batch.hand_mask)
        o_tok, o_vec = self.card_set_enc(batch.belief_set, batch.belief_mask)
        _, p_vec = self.card_set_enc(batch.public_set, batch.public_mask)

        z = self.trunk_blocks(self.trunk_in(torch.cat([s_vec, g_vec, k_vec, h_vec, o_vec, p_vec], dim=-1)))

        value = torch.tanh(self.value_head(z)).squeeze(-1)             # [B]
        fixed_logits = self.fixed_policy_head(z)                       # [B, 18]

        # Dynamic Pointer-Attention logits for PlayBoost(hand_card_i)
        q_boost = self.boost_query_proj(z).unsqueeze(1)                # [B, 1, 96]
        boost_logits = torch.bmm(q_boost, h_tok.transpose(1, 2)).squeeze(1) / (96 ** 0.5)  # [B, Lh]
        boost_logits = boost_logits.masked_fill(~batch.hand_mask, -1e9)

        # Auxiliary Belief Head logits [B, C, 3]
        z_exp = z.unsqueeze(1).expand(-1, o_tok.size(1), -1)
        belief_logits = self.aux_belief_head(torch.cat([o_tok, z_exp], dim=-1))

        return {
            "value": value,
            "fixed_policy_logits": fixed_logits,
            "boost_policy_logits": boost_logits,
            "belief_logits": belief_logits,
        }


class BatchedISMCTSWorker:
    """Collects B=32 leaf evaluations via Virtual Loss for sub-0.5ms batched GPU/ONNX inference."""

    def __init__(self, planner, encoder: StateEncoder, model: ExceedValuePolicyNet, batch_size: int = 32):
        self.planner = planner
        self.encoder = encoder
        self.model = model
        self.batch_size = batch_size

    @torch.inference_mode()
    def run_batched_step(self, root_state, compiled_belief, rng) -> None:
        pending_paths = []
        encoded_items: List[EncodedBatch] = []

        # 1. Traverse B parallel simulations down to unexpanded leaves applying Virtual Loss (-3)
        for _ in range(self.batch_size):
            det = compiled_belief.sample_determinization(rng.random)
            path, leaf_state = self.planner.select_to_leaf_with_virtual_loss(root_state, det, vloss=3.0)
            if leaf_state.is_terminal:
                self.planner.revert_vloss_and_backup(path, 1.0 if leaf_state.winner == "ai" else -1.0, vloss=3.0)
            else:
                pending_paths.append(path)
                encoded_items.append(self.encoder.encode_single(leaf_state, compiled_belief))

        if not encoded_items:
            return

        # 2. Single batched forward pass (<0.5ms GPU / <1.2ms INT8 ONNX CPU)
        batch = self._collate(encoded_items)
        out = self.model(batch)
        values = out["value"].cpu().tolist()
        fixed_logits = out["fixed_policy_logits"].cpu()
        boost_logits = out["boost_policy_logits"].cpu()

        # 3. Expand leaves with masked neural priors & backpropagate values (removing virtual loss)
        for idx, path in enumerate(pending_paths):
            self.planner.expand_with_neural_priors(path[-1], fixed_logits[idx], boost_logits[idx])
            self.planner.revert_vloss_and_backup(path, values[idx], vloss=3.0)

    @staticmethod
    def _collate(items: List[EncodedBatch]) -> EncodedBatch:
        return EncodedBatch(
            spatial=torch.cat([x.spatial for x in items], dim=0),
            global_vec=torch.cat([x.global_vec for x in items], dim=0),
            kit_vec=torch.cat([x.kit_vec for x in items], dim=0),
            hand_set=torch.cat([x.hand_set for x in items], dim=0),
            hand_mask=torch.cat([x.hand_mask for x in items], dim=0),
            belief_set=torch.cat([x.belief_set for x in items], dim=0),
            belief_mask=torch.cat([x.belief_mask for x in items], dim=0),
            public_set=torch.cat([x.public_set for x in items], dim=0),
            public_mask=torch.cat([x.public_mask for x in items], dim=0),
        )
```

---

## 7. Generalization & Adaptation Validation Suite (3 Concrete Scenarios)

### Case 1: Spatial Trap / Token Control Fighter (Rachel Alucard / Zato-1 Eddie)

- **State:** Opponent (Rachel Alucard / Zato-1) at space `7`, AI at space `4` (Range 3). A spatial token (Lightning Rod / Eddie) sits on space `5` (`X_spatial[7, 4] = -1.0`, `X_spatial[8, 4] = trigger_norm`, `X_spatial[10, 4] = 1.0` indicating attack-origin / trap hazard).
- **Tensor & Network Activation:**
  - The 1D Spatial ConvResNet detects the adjacency of AI (`space 4`) and enemy token (`space 5`, distance `1` from token even though opponent's body is at distance `3`!).
  - `Opp_Belief_Set` cards with `uses_tokens` / Eddie-range reach have `reaches_cur_dist = 1.0` at distance `1` from the token.
- **Predicted Output & Strategic Decision:**
  - `value` drops from `+0.12` (naive fighter-only Range 3) to **`-0.28`** if AI passes on space `4`.
  - `fixed_policy_logits` sharply elevates `Move(space=2)` (`π = 0.48`, stepping outside token trigger radius) and `PlayBoost(Dive: Discard/disrupt)` (`π = 0.31`), suppressing `Prepare` on space `4` (`π < 0.04`).
  - **Verification Gate:** Removing the token channels from `X_spatial[7..10]` flips the top policy action back to `Prepare`/`Boost` at space `4`, proving spatial-token sensitivity without hardcoded character rules.

---

### Case 2: Transform / Install Economy Fighter (Ragna / Sol Badguy Exceed vs. Ultra)

- **State:** AI (Ragna — Season 5 Overdrive, `exceedCost = 4`) at Range 2, `17 HP vs 19 HP`, **`Gauge = 4`**, `exceeded = false`, holding a `3-Gauge` Ultra (`Carnage Scissors`, `RNG 1–3, POW 7, SPD 4`) alongside `Cross`, `Focus`, `Sweep`.
- **Tensor & Network Activation:**
  - `X_global` encodes `(gauge_ai - exceed_cost_ai) / 4 = 0.0` (exact Exceed threshold reached!), `exceeded_ai = 0.0`, and `Fighter_Kit_Primitives` encodes `uses_overdrive = 1.0, exceed_pow_mod = +2, exceed_spd_mod = +1, overdrive_ticks = 4`.
  - Spending 3 Gauge on the immediate Ultra drops `(gauge - exceed_cost)/4` to `-0.75` (delaying Exceed by 3+ exchanges!) whereas taking `Exceed` immediately converts all 4 Gauge into 4 turns of Overdrive buffs + tempo.
- **Predicted Output & Strategic Decision:**
  - At `19` opponent HP (non-lethal Ultra), `fixed_policy_logits` assigns `Exceed` **`π = 0.64`** (`v_θ = +0.24`) vs. `InitiateStrike` **`π = 0.22`** (`v_θ = +0.06`).
  - **Control Mutation:** Lowering opponent HP from `19 -> 6` sets `opp_in_lethal_zone = 1.0` in `X_global` and triggers Layer 2's lethal `V_GTO`, flipping policy instantaneously to **`InitiateStrike` (`π = 0.89`)** to close out the game with the Ultra!

---

### Case 3: Zero-Shot Generalization to an Unseen Held-Out DLC Fighter

- **Setup:** Hold out 4 mechanically distinct fighters completely from Phase 1–3 training (e.g., *Shovel Knight* [Dirt Pile tokens + Relics], *Baiken* [Parry/Cancel + Force-paid Action], *Hakumen* [End-of-turn Gauge-from-deck + Exceed reshuffle], *Platinum* [Cleanup top-deck Boost reveal]).
- **Zero-Shot Encoding (Zero Retraining):**
  - The Card DSL compiles the held-out fighter's 30-card deck directly into `e(c) ∈ R^48` mechanic primitives and `Fighter_Kit_Primitives ∈ R^24` (e.g., for *Baiken*, setting `boost_cancelable = 1.0`, `action_triggers_strike = 1.0`, `action_force_cost = 0.5`, plus exact `Before/Hit/After` primitives).
  - The Pointer-Attention Boost Head automatically scores every new character Boost from its contextual card token `H_tok[i]` without ever having seen its card name.
- **Acceptance Gate & Expected Metrics:**
  - Evaluate 1,000 games per held-out fighter against pure-heuristic M3 IS-MCTS:
    - **Zero-Shot Win Rate Drop:** `< 15%` relative to trained roster peers (still achieving **`+110 to +160 Elo`** zero-shot over pure-heuristic M3 IS-MCTS).
    - **Few-Shot Adaptation (5K self-play fine-tuning games on the new fighter):** Recovers to within `< 3%` of full-league parity without catastrophic forgetting on the original roster (verified via EWC / replay rehearsal).

/**
 * Exceed Fighting System — Layer 1: Bayesian Behavioral Update Module
 *
 * Updates per-card hand occupancy log-weights from publicly observable neutral and
 * combat actions without ever violating hard zone conservation constraints.
 *
 * Implements concrete likelihood heuristics for four pro-level Exceed tells:
 *  1. Paid Move into Range 1 instead of Striking (close-range commitment tell)
 *  2. Prepare or Change Cards while standing inside our threat range (bricked-hand tell)
 *  3. Force Discard of a specific card (Block/Focus defense discard, EX-pair preservation,
 *     and 2-Force Ultra economy tells)
 *  4. Strike Initiation at a specific distance (effective-range & Gauge affordability tell)
 */

import { BeliefState } from './belief-state.ts';
import { BoardState, CardDescriptor, ObservedAction } from './types.ts';

export interface BayesianTellParams {
  // Tell 1: Paid Move (especially into Range 1) instead of Striking
  readonly moveTargetRangeBoost: number;
  readonly moveRange1FinishBonus: number;
  readonly movePrevRangePenalty: number;
  readonly moveForceCommitmentScale: number;

  // Tell 2: Prepare / Change Cards inside our threat range
  readonly passiveInThreatViablePenalty: number;
  readonly passiveInThreatDefensePenalty: number;
  readonly passiveInThreatDeadRangeBoost: number;
  readonly passiveOutOfThreatScale: number;

  // Tell 3: Force Discard of specific card X
  readonly discardBlockThreatAltBoost: number;
  readonly discardViableExBreakPenalty: number;
  readonly discardDeadSingletonNudge: number;
  readonly discardUltraEconomyNudge: number;
  readonly discardDefensiveDuplicateBoost: number;

  // Tell 4: Strike Initiation at specific distance d
  readonly strikeInRangeBoost: number;
  readonly strikeFastPowerBonus: number;
  readonly strikeOutOfRangePenalty: number;
  readonly strikeAlwaysMissPenalty: number;
  readonly strikeUnaffordableUltraPenalty: number;

  // Bonus Tell: Non-strike Boost played
  readonly boostPlayedCurrentRangePenalty: number;
}

export const DEFAULT_TELL_PARAMS: BayesianTellParams = Object.freeze({
  moveTargetRangeBoost: 0.65,
  moveRange1FinishBonus: 0.25,
  movePrevRangePenalty: -0.55,
  moveForceCommitmentScale: 0.2,

  passiveInThreatViablePenalty: -0.75,
  passiveInThreatDefensePenalty: -0.4,
  passiveInThreatDeadRangeBoost: 0.35,
  passiveOutOfThreatScale: 0.35,

  discardBlockThreatAltBoost: 0.45,
  discardViableExBreakPenalty: -0.6,
  discardDeadSingletonNudge: -0.1,
  discardUltraEconomyNudge: -0.08,
  discardDefensiveDuplicateBoost: 0.2,

  strikeInRangeBoost: 0.95,
  strikeFastPowerBonus: 0.2,
  strikeOutOfRangePenalty: -1.35,
  strikeAlwaysMissPenalty: -1.85,
  strikeUnaffordableUltraPenalty: -1.65,

  boostPlayedCurrentRangePenalty: -0.35,
});

export interface BeliefUpdateReport {
  /** Cloned and updated BeliefState (input state is never mutated). */
  readonly state: BeliefState;
  /** Per-card log-weight deltas actually applied (key -> delta). */
  readonly logDeltas: Readonly<Record<string, number>>;
  /** Human-readable diagnostic summary of the tell applied. */
  readonly summary: string;
}

function isStrongThreatCard(card: CardDescriptor): boolean {
  return !card.alwaysMiss && (card.pow >= 5 || card.spd >= 5 || card.type === 'ultra');
}

function isDefensiveStaple(card: CardDescriptor): boolean {
  return card.isDefensive || card.alwaysMiss;
}

export class BayesianUpdater {
  readonly params: BayesianTellParams;

  constructor(params: Partial<BayesianTellParams> = {}) {
    this.params = Object.freeze({ ...DEFAULT_TELL_PARAMS, ...params });
  }

  /**
   * Pure Bayesian behavioral likelihood update: clones `state`, adjusts log-weights
   * ONLY on unconstrained, non-excluded unknown cards, and validates invariants.
   */
  updateBeliefs(
    state: BeliefState,
    action: ObservedAction,
    board: BoardState,
  ): BeliefUpdateReport {
    const next = state.clone();
    const unknown = next.computeUnknownPool();
    const logDeltas: Record<string, number> = {};

    const applyDelta = (idx: number, delta: number) => {
      if (delta === 0) return;
      if (unknown[idx] === 0 || next.excludedFromHand[idx] === 1) return;
      const before = next.logWeights[idx];
      next.adjustLogWeight(idx, delta);
      const applied = next.logWeights[idx] - before;
      if (Math.abs(applied) > 1e-12) {
        const key = next.pool.cards[idx].key;
        logDeltas[key] = (logDeltas[key] ?? 0) + applied;
      }
    };

    let summary = '';

    switch (action.type) {
      case 'move_paid':
        summary = this.applyMovePaidTell(next, action, board, applyDelta);
        break;
      case 'prepare':
        summary = this.applyPassiveNeutralTell(next, 'prepare', board, applyDelta);
        break;
      case 'change_cards':
        summary = this.applyPassiveNeutralTell(next, 'change_cards', board, applyDelta);
        break;
      case 'force_discard':
        summary = this.applyForceDiscardTell(next, action, board, unknown, applyDelta);
        break;
      case 'strike_initiated':
        summary = this.applyStrikeInitiatedTell(next, action, board, applyDelta);
        break;
      case 'boost_played':
        summary = this.applyBoostPlayedTell(next, action, board, applyDelta);
        break;
    }

    next.assertInvariants();
    return { state: next, logDeltas, summary };
  }

  // =========================================================================
  // Tell 1: Paid Move (e.g., spending Force to Move into Range 1 instead of Striking)
  // =========================================================================
  private applyMovePaidTell(
    state: BeliefState,
    action: Extract<ObservedAction, { type: 'move_paid' }>,
    board: BoardState,
    applyDelta: (idx: number, delta: number) => void,
  ): string {
    const p = this.params;
    const pool = state.pool;
    // Higher Force spent signals stronger hand commitment to the destination distance.
    const commitmentMult = 1 + p.moveForceCommitmentScale * Math.max(0, action.forceSpent - 1);
    const isRange1Commitment = action.toDist === 1 && action.fromDist > 1;

    for (let i = 0; i < pool.size; i++) {
      const card = pool.cards[i];
      if (!pool.isStrikeAffordableAndValid(card, board)) {
        // Unaffordable Ultra: cannot justify spending Force for an immediate Range-1 Strike.
        continue;
      }

      const reachesTarget = pool.canReach(card, action.toDist, {
        isInitiating: true,
        boostMods: board.oppBoostMods,
        oppEddiePos: board.oppEddiePos,
        ourPos: board.ourPos,
      });
      const reachedPrev = pool.canReach(card, action.fromDist, {
        isInitiating: true,
        boostMods: board.oppBoostMods,
        oppEddiePos: board.oppEddiePos,
        ourPos: board.ourPos,
      });

      if (reachesTarget && !reachedPrev) {
        // Primary signal: card was dead at fromDist and becomes live at toDist.
        let boost = p.moveTargetRangeBoost * commitmentMult;
        if (isRange1Commitment && (card.spd >= 5 || card.pow >= 5 || card.range?.[1] === 1)) {
          boost += p.moveRange1FinishBonus;
        }
        applyDelta(i, boost);
      } else if (reachesTarget && reachedPrev) {
        // Mildly positive if entering Range 1 improves pressure (e.g. Grasp/Assault/Sweep overlap),
        // otherwise neutral since they could have struck before moving.
        if (isRange1Commitment && card.spd >= 5) {
          applyDelta(i, p.moveRange1FinishBonus * 0.6);
        }
      } else if (!reachesTarget && reachedPrev) {
        // Strong negative evidence: they paid Force to walk OUT of this card's range
        // instead of striking with it from fromDist.
        applyDelta(i, p.movePrevRangePenalty * commitmentMult);
      }
    }

    return (
      `Tell 1 [move_paid]: Force=${action.forceSpent}, Range ${action.fromDist} -> ${action.toDist}` +
      (isRange1Commitment ? ' (Range 1 close-combat commitment)' : '')
    );
  }

  // =========================================================================
  // Tell 2: Prepare or Change Cards while standing inside our threat range
  // =========================================================================
  private applyPassiveNeutralTell(
    state: BeliefState,
    kind: 'prepare' | 'change_cards',
    board: BoardState,
    applyDelta: (idx: number, delta: number) => void,
  ): string {
    const p = this.params;
    const pool = state.pool;
    const inOurThreatRange = board.ourThreatRanges.includes(board.currentDist);
    // Taking a passive turn INSIDE our threat range is far more informative than at safe distance.
    const threatScale = inOurThreatRange ? 1.0 : p.passiveOutOfThreatScale;
    // Change Cards is an even stronger admission of a bricked hand than Prepare.
    const actionScale = kind === 'change_cards' ? 1.15 : 1.0;

    for (let i = 0; i < pool.size; i++) {
      const card = pool.cards[i];
      const affordable = pool.isStrikeAffordableAndValid(card, board);
      const reachesNow =
        affordable &&
        pool.canReach(card, board.currentDist, {
          isInitiating: true,
          boostMods: board.oppBoostMods,
          oppEddiePos: board.oppEddiePos,
          ourPos: board.ourPos,
        });

      if (reachesNow) {
        const threatWeight = isStrongThreatCard(card) ? 1.15 : 0.85;
        applyDelta(i, p.passiveInThreatViablePenalty * threatWeight * threatScale * actionScale);
      } else if (isDefensiveStaple(card)) {
        // If standing in threat range and spending Change Cards, slightly less likely they're
        // comfortably sitting on defensive answers (more modest for Prepare, which may bait us).
        const defScale = kind === 'change_cards' ? 1.0 : 0.5;
        applyDelta(i, p.passiveInThreatDefensePenalty * threatScale * defScale);
      } else {
        // Off-range attacks or unaffordable Ultras explain why they couldn't initiate.
        applyDelta(i, p.passiveInThreatDeadRangeBoost * threatScale * actionScale);
      }
    }

    return (
      `Tell 2 [${kind}]: dist=${board.currentDist}, ` +
      (inOurThreatRange
        ? 'inside our threat range (strong bricked-hand signal)'
        : 'outside our threat range (mild setup signal)')
    );
  }

  // =========================================================================
  // Tell 3: Discarding a specific card X as Force (Block pitch / EX break / Ultra economy)
  // =========================================================================
  private applyForceDiscardTell(
    state: BeliefState,
    action: Extract<ObservedAction, { type: 'force_discard' }>,
    board: BoardState,
    unknown: Uint8Array,
    applyDelta: (idx: number, delta: number) => void,
  ): string {
    const p = this.params;
    const pool = state.pool;
    const discIdx = pool.indexOf(action.discardedKey);
    const discCard = pool.cards[discIdx];
    const evalDist = action.targetDist ?? board.currentDist;
    const inThreat = board.ourThreatRanges.includes(evalDist);
    const remainingUnknownCopies = unknown[discIdx];

    const notes: string[] = [];

    // Sub-case A: Discarding a premium defensive staple (Block / Focus)
    if (isDefensiveStaple(discCard)) {
      if (inThreat || board.oppLife <= 12) {
        // Pitching Block/Focus under pressure signals either a redundant 2nd copy or a fast/lethal threat.
        if (remainingUnknownCopies > 0) {
          applyDelta(discIdx, p.discardDefensiveDuplicateBoost);
          notes.push('redundant defensive copy plausible');
        }
        for (let i = 0; i < pool.size; i++) {
          if (i === discIdx) continue;
          const other = pool.cards[i];
          if (
            pool.isStrikeAffordableAndValid(other, board) &&
            pool.canReach(other, evalDist, {
              isInitiating: true,
              boostMods: board.oppBoostMods,
              oppEddiePos: board.oppEddiePos,
              ourPos: board.ourPos,
            }) &&
            isStrongThreatCard(other)
          ) {
            applyDelta(i, p.discardBlockThreatAltBoost);
          }
        }
        notes.push(`pitched ${discCard.name} under pressure -> boosted Range-${evalDist} threats`);
      } else {
        applyDelta(discIdx, p.discardDeadSingletonNudge);
        notes.push(`pitched ${discCard.name} safely out of threat`);
      }
    }
    // Sub-case B: 2-Force Ultra efficiency pitch
    else if (discCard.forceValue === 2 && (action.forceNeeded >= 2 || discCard.gaugeCost > board.oppGaugeCount)) {
      // Pro players routinely pitch an unaffordable Ultra for 2 Force; minimal negative read on 2nd copy.
      applyDelta(discIdx, p.discardUltraEconomyNudge);
      notes.push(`2-Force Ultra economy pitch (${discCard.name})`);
    }
    // Sub-case C: EX-pair preservation read on a live attack card
    else {
      const discWasViable =
        pool.isStrikeAffordableAndValid(discCard, board) &&
        pool.canReach(discCard, evalDist, {
          isInitiating: true,
          boostMods: board.oppBoostMods,
          oppEddiePos: board.oppEddiePos,
          ourPos: board.ourPos,
        });

      if (discWasViable && remainingUnknownCopies > 0) {
        // Pitching a live threat at evalDist strongly argues against breaking an EX pair.
        applyDelta(discIdx, p.discardViableExBreakPenalty);
        notes.push(
          `pitched live ${discCard.name} -> penalized remaining copy (unlikely to break EX pair)`,
        );
      } else {
        applyDelta(discIdx, p.discardDeadSingletonNudge);
        notes.push(`pitched off-range/low-priority ${discCard.name}`);
      }
    }

    return `Tell 3 [force_discard:${discCard.key} for ${action.purpose}]: ${notes.join('; ')}`;
  }

  // =========================================================================
  // Tell 4: Initiating a Strike at specific distance d (e.g., Range 2–3)
  // =========================================================================
  private applyStrikeInitiatedTell(
    state: BeliefState,
    action: Extract<ObservedAction, { type: 'strike_initiated' }>,
    board: BoardState,
    applyDelta: (idx: number, delta: number) => void,
  ): string {
    if (action.isWildSwing) {
      return `Tell 4 [strike_initiated]: Wild Swing at Range ${action.dist} (no hand-intent update)`;
    }

    const p = this.params;
    const pool = state.pool;

    for (let i = 0; i < pool.size; i++) {
      const card = pool.cards[i];

      if (card.alwaysMiss) {
        // Players almost never initiate a Strike with Block.
        applyDelta(i, p.strikeAlwaysMissPenalty);
        continue;
      }

      if (!pool.isStrikeAffordableAndValid(card, board)) {
        // Setting an unaffordable Ultra forces an involuntary Wild Swing substitution.
        applyDelta(i, p.strikeUnaffordableUltraPenalty);
        continue;
      }

      const reaches = pool.canReach(card, action.dist, {
        isInitiating: true,
        boostMods: board.oppBoostMods,
        oppEddiePos: board.oppEddiePos,
        ourPos: board.ourPos,
      });

      if (reaches) {
        let boost = p.strikeInRangeBoost;
        if (isStrongThreatCard(card)) {
          boost += p.strikeFastPowerBonus;
        }
        applyDelta(i, boost);
      } else {
        applyDelta(i, p.strikeOutOfRangePenalty);
      }
    }

    return `Tell 4 [strike_initiated]: Opponent initiated Strike at Range ${action.dist} (Gauge=${board.oppGaugeCount})`;
  }

  // =========================================================================
  // Supporting Tell: Playing a non-Strike Boost instead of initiating
  // =========================================================================
  private applyBoostPlayedTell(
    state: BeliefState,
    action: Extract<ObservedAction, { type: 'boost_played' }>,
    board: BoardState,
    applyDelta: (idx: number, delta: number) => void,
  ): string {
    const p = this.params;
    const pool = state.pool;
    for (let i = 0; i < pool.size; i++) {
      const card = pool.cards[i];
      if (
        pool.isStrikeAffordableAndValid(card, board) &&
        pool.canReach(card, board.currentDist, {
          isInitiating: true,
          boostMods: board.oppBoostMods,
          oppEddiePos: board.oppEddiePos,
          ourPos: board.ourPos,
        })
      ) {
        applyDelta(i, p.boostPlayedCurrentRangePenalty);
      }
    }
    return `Tell [boost_played:${action.cardKey}]: Setup turn at Range ${board.currentDist}`;
  }
}

/**
 * Convenience functional wrapper matching `update_beliefs(observed_action, board_state)`.
 */
export function updateBeliefs(
  state: BeliefState,
  observedAction: ObservedAction,
  boardState: BoardState,
  params?: Partial<BayesianTellParams>,
): BeliefUpdateReport {
  return new BayesianUpdater(params).updateBeliefs(state, observedAction, boardState);
}

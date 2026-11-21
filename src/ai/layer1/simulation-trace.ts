/**
 * Exceed Fighting System — Layer 1: Deterministic 4-Turn Competitive Simulation Trace
 *
 * Demonstrates all four Layer 1 subsystems in a single reproducible Ryu-opponent trace:
 *  - Turn 1: Opponent discards Block as Force to Move from Range 3 -> Range 1 (Tells 1 & 3)
 *  - Turn 2: Opponent takes Prepare inside our threat range at Range 2 (Tell 2 + Draw tempering)
 *  - Turn 3: Opponent burns remaining deck, triggers Manual Reshuffle (cycle 0 -> 1), then
 *            places a recycled Hadoken on top of deck and draws into a fresh pool
 *  - Turn 4: Opponent initiates a Strike at Range 3 (Tell 4) -> Exact & Bayesian EX query
 *            (EX Hadoken / EX Spike / EX Sweep), Wild Swing top-deck query, and IS-MCTS
 *            rejection-free determinization sampling.
 */

import { BayesianUpdater } from './bayesian-updater.ts';
import { BeliefState } from './belief-state.ts';
import { CompiledBeliefModel, queryCardProbabilities } from './probability-engine.ts';
import { RYU_STANDARD_POOL } from './roster-adapter.ts';
import { BoardState, createMulberry32, Determinization, ProbabilityQueryResult } from './types.ts';

export interface TurnTraceStep {
  readonly turn: number;
  readonly label: string;
  readonly handSize: number;
  readonly deckSize: number;
  readonly discardSize: number;
  readonly reshuffleCycle: number;
  readonly tellSummary: string;
  readonly queries: Readonly<Record<string, ProbabilityQueryResult>>;
  readonly sampleDeterminizations: readonly Determinization[];
}

export interface FourTurnSimulationResult {
  readonly steps: readonly TurnTraceStep[];
  readonly formattedReport: string;
}

function pct(x: number): string {
  return `${(x * 100).toFixed(2)}%`;
}

export function runFourTurnSimulationTrace(seed = 20261121): FourTurnSimulationResult {
  const rng = createMulberry32(seed);
  const updater = new BayesianUpdater();
  const steps: TurnTraceStep[] = [];

  // Initialize opponent (Ryu) with 5-card opening hand, 25-card deck (30 total)
  let state = new BeliefState(RYU_STANDARD_POOL, { openingHandSize: 5 });

  // Pre-seed two realistic prior public plays so the discard pile is non-empty before Turn 1
  // (e.g., an early exchange where Cross went to Gauge and Donkey Kick went to Discard, followed by draws).
  state
    .observeCardFromHandToZone('cross', 'gauge')
    .observeCardFromHandToZone('donkey_kick', 'discard')
    .observeDraw(2); // Hand=5, Deck=23, Discard=1, Gauge=1

  const recordStep = (
    turn: number,
    label: string,
    tellSummary: string,
    focusKeys: readonly string[],
    numSamples = 2,
  ) => {
    const compiled = new CompiledBeliefModel(state, false);
    const queries: Record<string, ProbabilityQueryResult> = {};
    for (const k of focusKeys) {
      queries[k] = queryCardProbabilities(state, k, compiled);
    }
    const samples: Determinization[] = [];
    for (let s = 0; s < numSamples; s++) {
      samples.push(compiled.sampleDeterminization(rng));
    }
    steps.push({
      turn,
      label,
      handSize: state.handSize,
      deckSize: state.deckSize,
      discardSize: state.getDiscardSize(),
      reshuffleCycle: state.reshuffleCycle,
      tellSummary,
      queries,
      sampleDeterminizations: samples,
    });
  };

  // -------------------------------------------------------------------------
  // TURN 1: Force Discard (Block) + Paid Move into Range 1 (Range 3 -> Range 1)
  // -------------------------------------------------------------------------
  const turn1Board: BoardState = {
    currentDist: 1,
    prevDist: 3,
    ourThreatRanges: [1, 2],
    oppGaugeCount: 1,
    oppLife: 24,
    ourLife: 22,
    oppExceeded: false,
  };

  // Opponent discards Block (1 Force) + Dive (1 Force) to Move 2 spaces (Range 3 -> Range 1)
  state
    .observeCardFromHandToZone('block', 'discard')
    .observeCardFromHandToZone('dive', 'discard');

  const t1DiscardBlock = updater.updateBeliefs(
    state,
    {
      type: 'force_discard',
      discardedKey: 'block',
      purpose: 'move',
      forceNeeded: 2,
      targetDist: 1,
    },
    turn1Board,
  );
  state = t1DiscardBlock.state;

  const t1Move = updater.updateBeliefs(
    state,
    {
      type: 'move_paid',
      fromDist: 3,
      toDist: 1,
      forceSpent: 2,
      discardedKeys: ['block', 'dive'],
    },
    turn1Board,
  );
  state = t1Move.state;
  // End-of-turn draw (1 card) -> tempers weights slightly for newly drawn slot
  state.observeEndOfTurnDraw(); // Hand=4, Deck=22, Discard=3, Gauge=1

  recordStep(
    1,
    'Force Discard (Block, Dive) + Paid Move Range 3 -> Range 1 + EoT Draw',
    `${t1DiscardBlock.summary} | ${t1Move.summary}`,
    ['grasp', 'shoryuken_ryu', 'hadoken_ryu', 'block'],
  );

  // -------------------------------------------------------------------------
  // TURN 2: Opponent takes Prepare while standing inside our threat range (Range 2)
  // -------------------------------------------------------------------------
  // Suppose we retreated to Range 2 on our turn; opponent responds with Prepare (draws 1 + EoT draw 1).
  const turn2Board: BoardState = {
    currentDist: 2,
    ourThreatRanges: [1, 2],
    oppGaugeCount: 1,
    oppLife: 24,
    ourLife: 22,
    oppExceeded: false,
  };

  // Apply Prepare tell BEFORE drawing the 2 new cards, then draw (which tempers old evidence)
  const t2Prepare = updater.updateBeliefs(state, { type: 'prepare' }, turn2Board);
  state = t2Prepare.state;
  state.observeDraw(1).observeEndOfTurnDraw(); // Hand=6, Deck=20, Discard=3, Gauge=1

  recordStep(
    2,
    'Prepare inside our Threat Range (Range 2) + Draw 2 (turnover tempering)',
    t2Prepare.summary,
    ['grasp', 'spike', 'hadoken_ryu', 'metsu_hadoken'],
  );

  // -------------------------------------------------------------------------
  // TURN 3: Mid-game attrition + Manual Reshuffle (Cycle 0 -> Cycle 1)
  // -------------------------------------------------------------------------
  // Fast-forward several exchanges into late Cycle 0: opponent played/discarded cards
  // and drew down to 3 cards in deck, 7 cards in discard, 5 cards in hand.
  state
    .observeCardFromHandToZone('grasp', 'discard')
    .observeCardFromHandToZone('sweep', 'discard')
    .observeCardFromHandToZone('one_inch_punch', 'gauge')
    .observeCardFromHandToZone('focus', 'discard')
    .observeCardFromHandToZone('tatsumaki_ryu', 'discard')
    .observeDraw(4); // Hand=5, Deck=16, Discard=7, Gauge=2

  // Suppose opponent also placed a confirmed Hadoken on top of deck earlier (via Hadoken recycle),
  // then executes Manual Reshuffle (clearing knownDeckTop and merging all 7 discards back into deck!).
  state.observeRevealDeckTop('hadoken_ryu');
  const preReshuffleTopHadoken = queryCardProbabilities(state, 'hadoken_ryu').bayesian.probTopOfDeck;
  state.observeManualReshuffle(); // Cycle 0 -> 1, Deck=23, Discard=0, knownDeckTop cleared
  state.observeEndOfTurnDraw(); // Hand=6, Deck=22, Discard=0, Gauge=2

  recordStep(
    3,
    `Manual Reshuffle (Cycle 0 -> 1; pre-reshuffle known top Hadoken=${pct(preReshuffleTopHadoken)} cleared) + EoT Draw`,
    'Reshuffle merged 7 Discard cards into Deck, cleared knownDeckTop, reset Cycle=1, tempered weights on draw',
    ['hadoken_ryu', 'spike', 'sweep', 'metsu_hadoken'],
  );

  // -------------------------------------------------------------------------
  // TURN 4: Opponent initiates a Strike at Range 3 (with 2 Gauge -> Metsu Hadoken unaffordable!)
  // -------------------------------------------------------------------------
  const turn4Board: BoardState = {
    currentDist: 3,
    ourThreatRanges: [1, 2, 3],
    oppGaugeCount: 2, // Metsu Hadoken costs 3 Gauge -> unaffordable!
    oppLife: 18,
    ourLife: 19,
    oppExceeded: false,
  };

  const t4Strike = updater.updateBeliefs(
    state,
    { type: 'strike_initiated', dist: 3 },
    turn4Board,
  );
  state = t4Strike.state;

  recordStep(
    4,
    'Opponent Initiates Strike at Range 3 (Gauge=2) -> EX Attack & Wild Swing Queries',
    t4Strike.summary,
    ['hadoken_ryu', 'spike', 'metsu_hadoken', 'grasp', 'block'],
    3,
  );

  // Format crisp human-readable simulation trace table
  const lines: string[] = [];
  lines.push('=== Exceed Layer 1 Belief Engine — 4-Turn Simulation Trace (Opponent: Ryu) ===');
  for (const step of steps) {
    lines.push('');
    lines.push(
      `[Turn ${step.turn}] ${step.label} | Hand=${step.handSize} Deck=${step.deckSize} Discard=${step.discardSize} Cycle=${step.reshuffleCycle}`,
    );
    lines.push(`  Tell: ${step.tellSummary}`);
    lines.push(
      '  Card             | Unk | P(>=1) Unw -> Bayes | P(==2/EX) Unw -> Bayes | P(Top) Unw -> Bayes',
    );
    lines.push(
      '  -----------------+-----+---------------------+------------------------+--------------------',
    );
    for (const [key, q] of Object.entries(step.queries)) {
      const name = key.padEnd(16);
      const unk = String(q.unknownInPool).padStart(3);
      const p1 = `${pct(q.exactUnweighted.probAtLeastOne).padStart(6)} -> ${pct(q.bayesian.probAtLeastOne).padStart(6)}`;
      const p2 = `${pct(q.exactUnweighted.probExactlyTwo).padStart(6)} -> ${pct(q.bayesian.probExactlyTwo).padStart(6)}`;
      const pt = `${pct(q.exactUnweighted.probTopOfDeck).padStart(6)} -> ${pct(q.bayesian.probTopOfDeck).padStart(6)}`;
      lines.push(`  ${name} | ${unk} | ${p1.padEnd(19)} | ${p2.padEnd(22)} | ${pt}`);
    }
    const sample0 = step.sampleDeterminizations[0];
    lines.push(
      `  Sample IS-MCTS Hand #1: [${sample0.handKeys.join(', ')}] (logP=${sample0.logHandProbability.toFixed(3)}, topDeck=${sample0.deckTopToBottomKeys[0] ?? 'none'})`,
    );
  }

  return {
    steps,
    formattedReport: lines.join('\n'),
  };
}

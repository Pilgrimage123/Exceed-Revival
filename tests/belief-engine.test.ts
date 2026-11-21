import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import {
  BayesianUpdater,
  BeliefState,
  BoardState,
  buildCardPoolFromRawData,
  CardPool,
  CompiledBeliefModel,
  createBeliefStateFromPublicSnapshot,
  createMulberry32,
  EnginePublicSnapshot,
  parseBeforeMoveSpec,
  queryCardProbabilities,
  queryExactUnweighted,
  RawExceedCardDef,
  RawExceedCharacterDef,
  runFourTurnSimulationTrace,
  RYU_STANDARD_POOL,
  sampleDeterminization,
} from '../src/ai/layer1/index.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const HTML_PATH = path.join(ROOT, 'exceed_poc.html');

function loadRosterFromBundle(): {
  CHARACTERS: Record<string, RawExceedCharacterDef>;
  NORMALS: RawExceedCardDef[];
  evalExpr: <T>(expr: string) => T;
} {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const scriptMatches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const code = scriptMatches.map((m) => m[1]).join('\n;\n');
  const stubEl = {
    innerHTML: '',
    textContent: '',
    style: {},
    classList: { add: () => {}, remove: () => {} },
  };
  const sandbox: Record<string, unknown> = {
    console,
    Math,
    Object,
    Array,
    Map,
    Set,
    Number,
    String,
    Boolean,
    RegExp,
    Date,
    Error,
    setTimeout: () => 0,
    clearTimeout: () => {},
    document: {
      getElementById: () => stubEl,
      querySelector: () => null,
      querySelectorAll: () => [],
    },
    window: {},
    location: { reload: () => {} },
    alert: () => {},
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'exceed_poc.html' });
  const evalExpr = <T>(expr: string): T => vm.runInContext(expr, sandbox) as T;
  return {
    CHARACTERS: evalExpr<Record<string, RawExceedCharacterDef>>('CHARACTERS'),
    NORMALS: evalExpr<RawExceedCardDef[]>('NORMALS'),
    evalExpr,
  };
}

/** Brute-force reference enumerator for small decks to validate DP exactness to machine precision. */
function bruteForceNoncentralMarginals(state: BeliefState, useUniform: boolean) {
  const unknown = state.computeUnknownPool();
  const h = state.getUnknownHandSlots();
  const d = state.getUnknownDeckSlots();
  const C = state.pool.size;

  const comb = (n: number, k: number): number => {
    if (k < 0 || k > n) return 0;
    let r = 1;
    for (let i = 1; i <= Math.min(k, n - k); i++) r = (r * (n - i + 1)) / i;
    return r;
  };

  let totalWeight = 0;
  const probGe1 = new Float64Array(C);
  const probEq2 = new Float64Array(C);
  const probGe2 = new Float64Array(C);
  const expUnknown = new Float64Array(C);

  const cur = new Uint8Array(C);
  const dfs = (idx: number, rem: number, weight: number) => {
    if (idx === C) {
      if (rem !== 0) return;
      totalWeight += weight;
      for (let i = 0; i < C; i++) {
        const tot = state.knownHand[i] + cur[i];
        if (tot >= 1) probGe1[i] += weight;
        if (tot === 2) probEq2[i] += weight;
        if (tot >= 2) probGe2[i] += weight;
        expUnknown[i] += cur[i] * weight;
      }
      return;
    }

    const u = unknown[idx];
    const maxR = state.excludedFromHand[idx] === 1 ? 0 : Math.min(u, rem);
    const w = useUniform ? 1 : Math.exp(state.logWeights[idx]);
    for (let r = 0; r <= maxR; r++) {
      cur[idx] = r;
      dfs(idx + 1, rem - r, weight * comb(u, r) * Math.pow(w, r));
    }
    cur[idx] = 0;
  };

  dfs(0, h, 1);

  return Array.from({ length: C }, (_, i) => {
    const expUnk = expUnknown[i] / totalWeight;
    let pTop = 0;
    if (state.deckSize === 0) {
      pTop = !state.reshuffleUsed && state.getDiscardSize() > 0 ? state.discard[i] / state.getDiscardSize() : 0;
    } else if (state.knownDeckTop.length > 0) {
      pTop = state.knownDeckTop[0] === i ? 1 : 0;
    } else if (d === 0) {
      pTop = state.knownDeckBottom[0] === i ? 1 : 0;
    } else {
      pTop = (unknown[i] - expUnk) / d;
    }
    return {
      probAtLeastOne: probGe1[i] / totalWeight,
      probExactlyTwo: probEq2[i] / totalWeight,
      probExReady: probGe2[i] / totalWeight,
      expectedCopiesInHand: state.knownHand[i] + expUnk,
      probTopOfDeck: pTop,
    };
  });
}

test('Exact DP and unweighted hypergeometric match brute-force enumeration to < 1e-12 with hard constraints & custom copies', () => {
  const miniPool = new CardPool({
    characterKey: 'mini',
    characterName: 'Mini Test Fighter',
    cards: [
      { key: 'a', name: 'A', type: 'normal', initialDeckCopies: 2, totalCopies: 2, range: [1, 1], pow: 4, spd: 5, arm: 0, grd: 0, gaugeCost: 0, forceValue: 1, alwaysMiss: false, isAstral: false, isDefensive: false, beforeMove: null, rangeMaxBonusIfInitiating: 0 },
      { key: 'b', name: 'B', type: 'special', initialDeckCopies: 4, totalCopies: 4, range: [1, 3], pow: 5, spd: 4, arm: 0, grd: 0, gaugeCost: 0, forceValue: 1, alwaysMiss: false, isAstral: false, isDefensive: false, beforeMove: null, rangeMaxBonusIfInitiating: 0 },
      { key: 'c', name: 'C', type: 'special', initialDeckCopies: 3, totalCopies: 3, range: [2, 3], pow: 6, spd: 3, arm: 0, grd: 2, gaugeCost: 0, forceValue: 1, alwaysMiss: false, isAstral: false, isDefensive: false, beforeMove: null, rangeMaxBonusIfInitiating: 0 },
      { key: 'd', name: 'D', type: 'normal', initialDeckCopies: 2, totalCopies: 2, range: null, pow: 0, spd: 0, arm: 2, grd: 3, gaugeCost: 0, forceValue: 1, alwaysMiss: true, isAstral: false, isDefensive: true, beforeMove: null, rangeMaxBonusIfInitiating: 0 },
      { key: 'e', name: 'E', type: 'ultra', initialDeckCopies: 2, totalCopies: 2, range: [1, 2], pow: 8, spd: 5, arm: 0, grd: 0, gaugeCost: 3, forceValue: 2, alwaysMiss: false, isAstral: false, isDefensive: false, beforeMove: null, rangeMaxBonusIfInitiating: 0 },
    ],
  });

  // Total 13 cards: Hand=5, Deck=8
  const state = new BeliefState(miniPool, { openingHandSize: 5 });
  // Hard constraints: 1 copy of 'b' known in hand, 'd' excluded from hand, 1 copy of 'c' on deck bottom
  state.observeKnownHandCard('b', 1);
  state.observeNamedCardMiss('d');
  state.observeRevealDeckBottom('c');
  // Non-uniform Bayesian log-weights
  state.adjustLogWeight(miniPool.indexOf('a'), 1.35);
  state.adjustLogWeight(miniPool.indexOf('b'), -0.8);
  state.adjustLogWeight(miniPool.indexOf('c'), 2.1);
  state.adjustLogWeight(miniPool.indexOf('e'), -1.4);

  const exactWeightedRef = bruteForceNoncentralMarginals(state, false);
  const exactUnweightedRef = bruteForceNoncentralMarginals(state, true);
  const compiled = new CompiledBeliefModel(state, false);

  for (let i = 0; i < miniPool.size; i++) {
    const key = miniPool.cards[i].key;
    const res = queryCardProbabilities(state, key, compiled);

    // Weighted DP vs brute force
    assert.ok(Math.abs(res.bayesian.probAtLeastOne - exactWeightedRef[i].probAtLeastOne) < 1e-12);
    assert.ok(Math.abs(res.bayesian.probExactlyTwo - exactWeightedRef[i].probExactlyTwo) < 1e-12);
    assert.ok(Math.abs(res.bayesian.probExReady - exactWeightedRef[i].probExReady) < 1e-12);
    assert.ok(Math.abs(res.bayesian.probTopOfDeck - exactWeightedRef[i].probTopOfDeck) < 1e-12);
    assert.ok(
      Math.abs(res.bayesian.expectedCopiesInHand - exactWeightedRef[i].expectedCopiesInHand) < 1e-12,
    );

    // Unweighted closed-form hypergeometric vs brute force (including excludedFromHand!)
    assert.ok(
      Math.abs(res.exactUnweighted.probAtLeastOne - exactUnweightedRef[i].probAtLeastOne) < 1e-12,
    );
    assert.ok(
      Math.abs(res.exactUnweighted.probExactlyTwo - exactUnweightedRef[i].probExactlyTwo) < 1e-12,
    );
    assert.ok(
      Math.abs(res.exactUnweighted.probExReady - exactUnweightedRef[i].probExReady) < 1e-12,
    );
    assert.ok(
      Math.abs(res.exactUnweighted.probTopOfDeck - exactUnweightedRef[i].probTopOfDeck) < 1e-12,
    );
  }

  // Verify sum of P(top_of_deck) across all cards equals 1.0 exactly
  let sumTopBayes = 0;
  let sumTopUnw = 0;
  for (let i = 0; i < miniPool.size; i++) {
    sumTopBayes += compiled.queryCardIndex(i).probTopOfDeck;
    sumTopUnw += queryExactUnweighted(state, miniPool.cards[i].key).probTopOfDeck;
  }
  assert.ok(Math.abs(sumTopBayes - 1.0) < 1e-12);
  assert.ok(Math.abs(sumTopUnw - 1.0) < 1e-12);
  // For 4-copy 'b' (with 1 known in hand and 3 unknown), P(EX >= 2) must strictly exceed P(== 2)
  assert.ok(compiled.queryCardIndex(miniPool.indexOf('b')).probExReady > compiled.queryCardIndex(miniPool.indexOf('b')).probExactlyTwo);
});

test('BeliefState.clone() enforces zero state mutation across divergent MCTS branches', () => {
  const root = new BeliefState(RYU_STANDARD_POOL, { openingHandSize: 5 });
  root.observeCardFromHandToZone('grasp', 'discard');
  root.observeRevealDeckTop('hadoken_ryu');
  root.adjustLogWeight(RYU_STANDARD_POOL.indexOf('spike'), 1.25);

  const branchA = root.clone();
  const branchB = root.clone();

  branchA.observeDraw(2);
  branchA.observeCardFromHandToZone('block', 'gauge');
  branchA.adjustLogWeight(RYU_STANDARD_POOL.indexOf('spike'), -2.0);

  branchB.observeManualReshuffle();
  branchB.observeNamedCardMiss('sweep');

  // Root must remain completely untouched
  assert.equal(root.handSize, 4);
  assert.equal(root.deckSize, 25);
  assert.equal(root.getDiscardSize(), 1);
  assert.equal(root.reshuffleCycle, 0);
  assert.equal(root.reshuffleUsed, false);
  assert.deepEqual(root.knownDeckTop, [RYU_STANDARD_POOL.indexOf('hadoken_ryu')]);
  assert.equal(root.logWeights[RYU_STANDARD_POOL.indexOf('spike')], 1.25);
  assert.equal(root.excludedFromHand[RYU_STANDARD_POOL.indexOf('sweep')], 0);

  // Branch A and Branch B diverged cleanly
  assert.equal(branchA.knownHand[RYU_STANDARD_POOL.indexOf('hadoken_ryu')], 1);
  assert.equal(branchB.reshuffleCycle, 1);
  assert.equal(branchB.knownDeckTop.length, 0);
  assert.equal(branchB.excludedFromHand[RYU_STANDARD_POOL.indexOf('sweep')], 1);
});

test('Repository roster parity across all 41 fighters + Axl 4-copy, Happy Chaos 0-copy, and Ragna Overdrive/Astral Heat', () => {
  const { CHARACTERS, NORMALS, evalExpr } = loadRosterFromBundle();
  const keys = Object.keys(CHARACTERS);
  assert.ok(keys.length >= 40, `Expected full roster, got ${keys.length}`);

  for (const charKey of keys) {
    const pool = buildCardPoolFromRawData(CHARACTERS[charKey], NORMALS);
    const engineDeckLen = evalExpr<number>(`buildDeck(${JSON.stringify(charKey)}).length`);
    assert.equal(
      pool.totalInitialDeckCopies,
      engineDeckLen,
      `Initial deck copy count mismatch for ${charKey}`,
    );
    const state = new BeliefState(pool, { openingHandSize: 5 });
    state.assertInvariants();
  }

  // 1. Axl Low (GG_NORMALS + 4-copy Sickle Flash)
  const axlPool = buildCardPoolFromRawData(CHARACTERS.axl, NORMALS);
  const sickleFlash = axlPool.getByKey('sickle_flash');
  assert.equal(sickleFlash.initialDeckCopies, 4);
  const axlState = new BeliefState(axlPool, { openingHandSize: 5 });
  const sfQuery = queryCardProbabilities(axlState, 'sickle_flash');
  assert.ok(sfQuery.exactUnweighted.probExReady > sfQuery.exactUnweighted.probExactlyTwo);

  // 2. Happy Chaos (0-copy Deus Ex Machina stays in outOfPlay)
  const hcPool = buildCardPoolFromRawData(CHARACTERS.happychaos, NORMALS);
  const deus = hcPool.getByKey('hc_deus_ex_machina');
  assert.equal(deus.initialDeckCopies, 0);
  assert.equal(deus.totalCopies, 1);
  const hcState = new BeliefState(hcPool, { openingHandSize: 5 });
  assert.equal(hcState.outOfPlay[deus.index], 1);
  assert.equal(
    queryCardProbabilities(hcState, 'hc_deus_ex_machina').exactUnweighted.probAtLeastOne,
    0,
  );

  // 3. Ragna (Season 5 Overdrive + Astral Heat deterministic entry on Manual Reshuffle ONLY)
  const ragnaPool = buildCardPoolFromRawData(CHARACTERS.ragna, NORMALS);
  assert.equal(ragnaPool.usesOverdrive, true);
  assert.ok(ragnaPool.astralIndex !== null);
  const astralKey = ragnaPool.cards[ragnaPool.astralIndex!].key;

  const ragnaState = new BeliefState(ragnaPool, { openingHandSize: 5 });
  assert.equal(queryCardProbabilities(ragnaState, astralKey).exactUnweighted.probAtLeastOne, 0);

  // Put 2 cards in Gauge -> Exceed moves them to Overdrive -> tick 1 Overdrive to Discard
  ragnaState
    .observeCardFromHandToZone('grasp', 'gauge')
    .observeCardFromHandToZone('cross', 'gauge')
    .observePublicZoneMove('grasp', 'gauge', 'overdrive')
    .observePublicZoneMove('cross', 'gauge', 'overdrive')
    .observePublicZoneMove('grasp', 'overdrive', 'discard')
    .observeCardFromHandToZone('sweep', 'sealed');
  assert.equal(ragnaState.overdrive[ragnaPool.indexOf('cross')], 1);
  assert.equal(ragnaState.sealed[ragnaPool.indexOf('sweep')], 1);

  // Manual Reshuffle queues Astral Heat -> End-of-turn draw places Astral directly into knownHand!
  ragnaState.observeManualReshuffle();
  assert.equal(ragnaState.astralPending, true);
  ragnaState.observeEndOfTurnDraw();
  assert.equal(ragnaState.astralPending, false);
  assert.equal(ragnaState.knownHand[ragnaPool.astralIndex!], 1);
  assert.equal(queryCardProbabilities(ragnaState, astralKey).bayesian.probAtLeastOne, 1);

  // Live Engine publicInfoOf() adapter round-trip check
  const snap = evalExpr<EnginePublicSnapshot>(`
    (() => {
      const eng = new Engine('ryu', 'ken');
      eng.draw(eng.P('p1'), 5);
      eng.draw(eng.P('p2'), 5);
      const p2 = eng.P('p2');
      p2.discard.push(p2.hand.pop());
      p2.gauge.push(p2.hand.pop());
      return publicInfoOf(p2);
    })()
  `);
  const kenPool = buildCardPoolFromRawData(CHARACTERS.ken, NORMALS);
  const adapted = createBeliefStateFromPublicSnapshot(kenPool, snap);
  assert.equal(adapted.handSize, 3);
  assert.equal(adapted.deckSize, 25);
  assert.equal(adapted.getDiscardSize(), 1);
});

test('Reshuffle edge cases: mid-draw auto-reshuffle, empty-deck Wild Swing fallback, knownDeckBottom top, and non-consuming effect reshuffle', () => {
  const state = new BeliefState(RYU_STANDARD_POOL, { openingHandSize: 28 }); // 2 cards in deck
  state.observeCardFromHandToZone('spike', 'discard');
  state.observeCardFromHandToZone('sweep', 'discard');
  state.observeCardFromHandToZone('hadoken_ryu', 'discard'); // Hand=25, Deck=2, Discard=3

  // Reveal both cards in deck: top = grasp, bottom = focus (0 unknown deck slots!)
  state.observeRevealDeckTop('grasp');
  state.observeRevealDeckBottom('focus');
  assert.equal(state.getUnknownDeckSlots(), 0);
  assert.equal(queryExactUnweighted(state, 'grasp').probTopOfDeck, 1);

  // Draw 1: consumes knownDeckTop ('grasp'). Now knownDeckTop=[], unknownDeckSlots=0, knownDeckBottom=['focus']!
  state.observeDraw(1);
  assert.equal(state.knownHand[RYU_STANDARD_POOL.indexOf('grasp')], 1);
  assert.equal(queryExactUnweighted(state, 'focus').probTopOfDeck, 1);

  // Draw 2: first draw consumes knownDeckBottom[0] ('focus'), deck empties -> auto-reshuffles 3 discards -> draws 1 unknown!
  state.observeDraw(2);
  assert.equal(state.knownHand[RYU_STANDARD_POOL.indexOf('focus')], 1);
  assert.equal(state.reshuffleUsed, true);
  assert.equal(state.reshuffleCycle, 1);
  assert.equal(state.deckSize, 2);
  assert.equal(state.getDiscardSize(), 0);

  // Test empty-deck Wild Swing auto-reshuffle fallback on a fresh state
  const emptyDeckState = new BeliefState(RYU_STANDARD_POOL, { openingHandSize: 30 }); // Deck=0
  emptyDeckState
    .observeCardFromHandToZone('grasp', 'discard')
    .observeCardFromHandToZone('grasp', 'discard')
    .observeCardFromHandToZone('spike', 'discard'); // Discard: 2 grasp, 1 spike
  assert.ok(Math.abs(queryExactUnweighted(emptyDeckState, 'grasp').probTopOfDeck - 2 / 3) < 1e-12);
  assert.ok(Math.abs(queryExactUnweighted(emptyDeckState, 'spike').probTopOfDeck - 1 / 3) < 1e-12);

  // Non-consuming effect reshuffle (Hakumen Exceed) leaves reshuffleUsed === false
  emptyDeckState.observeEffectReshuffle();
  assert.equal(emptyDeckState.reshuffleUsed, false);
  assert.equal(emptyDeckState.reshuffleCycle, 1);
  assert.equal(emptyDeckState.deckSize, 3);
});

test('All 4 Bayesian behavioral tells shift posteriors directionally without violating hard constraints or Gauge affordability', () => {
  const updater = new BayesianUpdater();
  const base = new BeliefState(RYU_STANDARD_POOL, { openingHandSize: 5 });

  // Tell 1: Move from Range 3 -> Range 1 (with only 1 Gauge -> Metsu Shoryuken [cost 4] unaffordable)
  const boardMove: BoardState = {
    currentDist: 1,
    prevDist: 3,
    ourThreatRanges: [1, 2],
    oppGaugeCount: 1,
    oppLife: 25,
    ourLife: 25,
    oppExceeded: false,
  };
  const r1 = updater.updateBeliefs(
    base,
    { type: 'move_paid', fromDist: 3, toDist: 1, forceSpent: 2 },
    boardMove,
  );
  const qGraspT1 = queryCardProbabilities(r1.state, 'grasp');
  const qHadokenT1 = queryCardProbabilities(r1.state, 'hadoken_ryu');
  const qMetsuShoryuT1 = queryCardProbabilities(r1.state, 'metsu_shoryuken');
  assert.ok(qGraspT1.bayesian.probAtLeastOne > qGraspT1.exactUnweighted.probAtLeastOne);
  assert.ok(qHadokenT1.bayesian.probAtLeastOne < qHadokenT1.exactUnweighted.probAtLeastOne);
  assert.equal(r1.logDeltas['metsu_shoryuken'], undefined, 'Unaffordable Ultra should not get Range-1 strike boost');
  assert.ok(qMetsuShoryuT1.bayesian.probAtLeastOne <= qGraspT1.bayesian.probAtLeastOne);

  // Tell 2: Prepare inside our threat range (Range 2)
  const boardPrep: BoardState = {
    currentDist: 2,
    ourThreatRanges: [1, 2],
    oppGaugeCount: 0,
    oppLife: 20,
    ourLife: 20,
    oppExceeded: false,
  };
  const r2 = updater.updateBeliefs(base, { type: 'prepare' }, boardPrep);
  const qSpikeT2 = queryCardProbabilities(r2.state, 'spike'); // viable at Range 2
  const qHadokenT2 = queryCardProbabilities(r2.state, 'hadoken_ryu'); // dead at Range 2
  assert.ok(qSpikeT2.bayesian.probAtLeastOne < qSpikeT2.exactUnweighted.probAtLeastOne);
  assert.ok(qHadokenT2.bayesian.probAtLeastOne > qHadokenT2.exactUnweighted.probAtLeastOne);

  // Tell 3: Force discard of live Range-1 card ('grasp') -> penalizes remaining copy (EX preservation)
  const afterGraspPitch = base.clone().observeCardFromHandToZone('grasp', 'discard');
  const r3a = updater.updateBeliefs(
    afterGraspPitch,
    { type: 'force_discard', discardedKey: 'grasp', purpose: 'move', forceNeeded: 1, targetDist: 1 },
    boardMove,
  );
  assert.ok((r3a.logDeltas['grasp'] ?? 0) < 0);

  // Tell 3b: Force discard of Block under pressure -> boosts Range-1 threats
  const afterBlockPitch = base.clone().observeCardFromHandToZone('block', 'discard');
  const r3b = updater.updateBeliefs(
    afterBlockPitch,
    { type: 'force_discard', discardedKey: 'block', purpose: 'move', forceNeeded: 1, targetDist: 1 },
    boardMove,
  );
  assert.ok((r3b.logDeltas['grasp'] ?? 0) > 0);

  // Tell 4: Strike initiated at Range 3 with 2 Gauge -> boosts Hadoken/Spike/Sweep & EX Hadoken, crushes Block/Grasp/Metsu Hadoken
  const boardStrike: BoardState = {
    currentDist: 3,
    ourThreatRanges: [1, 2, 3],
    oppGaugeCount: 2, // Metsu Hadoken costs 3
    oppLife: 18,
    ourLife: 18,
    oppExceeded: false,
  };
  const exclState = base.clone().observeNamedCardMiss('sweep');
  const r4 = updater.updateBeliefs(exclState, { type: 'strike_initiated', dist: 3 }, boardStrike);
  const qHadokenT4 = queryCardProbabilities(r4.state, 'hadoken_ryu');
  const qBlockT4 = queryCardProbabilities(r4.state, 'block');
  const qMetsuT4 = queryCardProbabilities(r4.state, 'metsu_hadoken');
  const qSweepT4 = queryCardProbabilities(r4.state, 'sweep');

  assert.ok(qHadokenT4.bayesian.probAtLeastOne > qHadokenT4.exactUnweighted.probAtLeastOne);
  assert.ok(qHadokenT4.bayesian.probExactlyTwo > qHadokenT4.exactUnweighted.probExactlyTwo);
  assert.ok(qBlockT4.bayesian.probAtLeastOne < qBlockT4.exactUnweighted.probAtLeastOne);
  assert.ok(qMetsuT4.bayesian.probAtLeastOne < qMetsuT4.exactUnweighted.probAtLeastOne);
  // Hard exclusion must NEVER be violated by Bayesian updates
  assert.equal(qSweepT4.bayesian.probAtLeastOne, 0);
});

test('Rejection-free sampleDeterminization() obeys all hard constraints and converges to exact DP marginals over 12,000 samples', () => {
  const updater = new BayesianUpdater();
  const state = new BeliefState(RYU_STANDARD_POOL, { openingHandSize: 5 });
  state
    .observeCardFromHandToZone('cross', 'discard')
    .observeCardFromHandToZone('dive', 'gauge')
    .observeDraw(2)
    .observeKnownHandCard('grasp', 1)
    .observeNamedCardMiss('block')
    .observeRevealDeckTop('donkey_kick')
    .observeRevealDeckBottom('focus');

  const updated = updater.updateBeliefs(
    state,
    { type: 'strike_initiated', dist: 3 },
    {
      currentDist: 3,
      ourThreatRanges: [1, 2, 3],
      oppGaugeCount: 2,
      oppLife: 20,
      ourLife: 20,
      oppExceeded: false,
    },
  ).state;

  const compiled = new CompiledBeliefModel(updated, false);
  const rng = createMulberry32(424242);
  const N = 12000;

  const hitsGe1 = new Int32Array(RYU_STANDARD_POOL.size);
  const hitsEq2 = new Int32Array(RYU_STANDARD_POOL.size);
  const hitsTop = new Int32Array(RYU_STANDARD_POOL.size);
  const graspIdx = RYU_STANDARD_POOL.indexOf('grasp');
  const blockIdx = RYU_STANDARD_POOL.indexOf('block');
  const dkIdx = RYU_STANDARD_POOL.indexOf('donkey_kick');
  const focusIdx = RYU_STANDARD_POOL.indexOf('focus');

  for (let s = 0; s < N; s++) {
    const det = compiled.sampleDeterminization(rng);
    assert.equal(det.handIndices.length, updated.handSize);
    assert.equal(det.deckTopToBottomIndices.length, updated.deckSize);
    assert.equal(det.deckTopToBottomIndices[0], dkIdx);
    assert.equal(det.deckTopToBottomIndices[det.deckTopToBottomIndices.length - 1], focusIdx);

    const counts = new Uint8Array(RYU_STANDARD_POOL.size);
    for (const idx of det.handIndices) counts[idx]++;

    // Hard constraints check on every single sample
    assert.ok(counts[graspIdx] >= 1, 'knownHand card must always appear in hand');
    assert.equal(counts[blockIdx], 0, 'excludedFromHand card must never appear in hand');

    for (let i = 0; i < RYU_STANDARD_POOL.size; i++) {
      if (counts[i] >= 1) hitsGe1[i]++;
      if (counts[i] === 2) hitsEq2[i]++;
    }
    hitsTop[det.deckTopToBottomIndices[0]]++;
  }

  for (let i = 0; i < RYU_STANDARD_POOL.size; i++) {
    const exact = compiled.queryCardIndex(i);
    assert.ok(
      Math.abs(hitsGe1[i] / N - exact.probAtLeastOne) < 0.015,
      `P(>=1) drift for ${RYU_STANDARD_POOL.cards[i].key}: emp=${hitsGe1[i] / N}, exact=${exact.probAtLeastOne}`,
    );
    assert.ok(
      Math.abs(hitsEq2[i] / N - exact.probExactlyTwo) < 0.015,
      `P(==2) drift for ${RYU_STANDARD_POOL.cards[i].key}: emp=${hitsEq2[i] / N}, exact=${exact.probExactlyTwo}`,
    );
    assert.ok(Math.abs(hitsTop[i] / N - exact.probTopOfDeck) < 0.015);
  }

  // Also test top-level convenience function
  const oneShot = sampleDeterminization(updated, rng);
  assert.equal(oneShot.handKeys.length, updated.handSize);
});

test('4-turn competitive simulation trace executes cleanly with verified EX & Wild Swing queries', () => {
  const trace = runFourTurnSimulationTrace(20261121);
  assert.equal(trace.steps.length, 4);

  const [t1, t2, t3, t4] = trace.steps;
  // Turn 1: Move into Range 1 lifts Grasp above unweighted prior
  assert.ok(t1.queries.grasp.bayesian.probAtLeastOne > t1.queries.grasp.exactUnweighted.probAtLeastOne);
  // Turn 2: Prepare inside Range 2 threat range suppresses viable Spike
  assert.ok(t2.queries.spike.bayesian.probAtLeastOne < t2.queries.spike.exactUnweighted.probAtLeastOne);
  // Turn 3: Manual Reshuffle advances cycle 0 -> 1 and empties discard
  assert.equal(t3.reshuffleCycle, 1);
  assert.equal(t3.discardSize, 0);
  // Turn 4: Strike initiated at Range 3 boosts EX Hadoken above unweighted and suppresses Block & unaffordable Metsu Hadoken
  assert.ok(
    t4.queries.hadoken_ryu.bayesian.probExactlyTwo >
      t4.queries.hadoken_ryu.exactUnweighted.probExactlyTwo,
  );
  assert.ok(t4.queries.block.bayesian.probAtLeastOne < t4.queries.block.exactUnweighted.probAtLeastOne);
  assert.ok(
    t4.queries.metsu_hadoken.bayesian.probAtLeastOne <
      t4.queries.metsu_hadoken.exactUnweighted.probAtLeastOne,
  );
  assert.ok(trace.formattedReport.includes('=== Exceed Layer 1 Belief Engine'));
});

test('Layer 1 Astral Heat typing/knownHand, Advance-as-far-as-possible reachability, and Overdrive/Sealed snapshot parity', () => {
  const { CHARACTERS, NORMALS, evalExpr } = loadRosterFromBundle();
  const ragnaPool = buildCardPoolFromRawData(CHARACTERS.ragna, NORMALS);

  // Astral Heat keeps type 'ultra' and forceValue 2
  const astralDesc = ragnaPool.cards[ragnaPool.astralIndex!];
  assert.equal(astralDesc.type, 'ultra');
  assert.equal(astralDesc.forceValue, 2);
  assert.equal(astralDesc.isAstral, true);

  // "Before: Advance as far as possible" parses with upTo: true and reaches close range
  const farSpec = parseBeforeMoveSpec('Before: Advance as far as possible.');
  assert.deepEqual(farSpec, { kind: 'advance', amount: 9, upTo: true });

  // Live Ragna + Happy Chaos snapshots with Overdrive, Sealed, and Astral in hand
  const ragnaSnap = evalExpr<EnginePublicSnapshot>(`
    (() => {
      const eng = new Engine('ragna', 'ken');
      const p1 = eng.P('p1');
      eng.draw(p1, 5);
      p1.overdrive.push(p1.hand.pop());
      p1.hand.push(p1.astralCard);
      p1.astralCard = null;
      return publicInfoOf(p1);
    })()
  `);
  const adaptedRagna = createBeliefStateFromPublicSnapshot(ragnaPool, ragnaSnap);
  assert.equal(adaptedRagna.knownHand[ragnaPool.astralIndex!], 1);
  assert.equal(adaptedRagna.outOfPlay[ragnaPool.astralIndex!], 0);

  const ggNormalsRaw = evalExpr<readonly RawExceedCardDef[]>('GG_NORMALS');
  const hcPool = buildCardPoolFromRawData(CHARACTERS.happychaos, ggNormalsRaw);
  const hcSnap = evalExpr<EnginePublicSnapshot>(`
    (() => {
      const eng = new Engine('happychaos', 'ryu');
      const p1 = eng.P('p1');
      eng.draw(p1, 5);
      p1.sealedCards.push(p1.hand.pop());
      return publicInfoOf(p1);
    })()
  `);
  const adaptedHc = createBeliefStateFromPublicSnapshot(hcPool, hcSnap);
  assert.equal(adaptedHc.handSize, 4);
});

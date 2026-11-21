/**
 * Exceed Fighting System — Layer 1: Exact Combinatorial Probability & Sampling Engine
 *
 * Implements:
 *  1. Exact unweighted combinatorial / hypergeometric queries (respecting knownHand,
 *     excludedFromHand, knownDeckTop, knownDeckBottom, and empty-deck auto-reshuffle).
 *  2. Exact Bayesian-weighted marginal probabilities via 1D prefix/suffix polynomial DP
 *     over the Multivariate Fisher's Noncentral Hypergeometric Distribution.
 *  3. Exact rejection-free IS-MCTS determinization sampling (`sampleDeterminization`)
 *     via the backward-DP conditional chain rule.
 */

import { BeliefState } from './belief-state.ts';
import {
  CardProbabilityBreakdown,
  Determinization,
  ProbabilityQueryResult,
  Rng,
} from './types.ts';

const MAX_BINOM_N = 64;
const BINOM_TABLE: Float64Array[] = (() => {
  const table: Float64Array[] = new Array(MAX_BINOM_N + 1);
  for (let n = 0; n <= MAX_BINOM_N; n++) {
    const row = new Float64Array(n + 1);
    row[0] = 1;
    row[n] = 1;
    for (let k = 1; k < n; k++) {
      row[k] = table[n - 1][k - 1] + table[n - 1][k];
    }
    table[n] = row;
  }
  return table;
})();

/** Exact binomial coefficient C(n, k) using Pascal table (exact for n <= 52 in IEEE-754 Float64). */
export function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (n <= MAX_BINOM_N) return BINOM_TABLE[n][k];
  // Multiplicative fallback for unusually large decks
  const m = Math.min(k, n - k);
  let res = 1;
  for (let i = 1; i <= m; i++) {
    res = (res * (n - m + i)) / i;
  }
  return res;
}

/** Exact hypergeometric PMF: P(X = k) when drawing `draws` from `pop` containing `successes`. */
function hypergeometricPMF(
  pop: number,
  successes: number,
  draws: number,
  k: number,
): number {
  if (k < 0 || k > successes || k > draws || draws - k > pop - successes) return 0;
  const denom = binomial(pop, draws);
  if (denom === 0) return 0;
  return (binomial(successes, k) * binomial(pop - successes, draws - k)) / denom;
}

/**
 * Compiled exact DP tables for a BeliefState snapshot.
 * Building this once allows O(h * maxCopies) marginal queries for all cards and
 * O(C * h) rejection-free IS-MCTS determinization sampling.
 */
export class CompiledBeliefModel {
  readonly state: BeliefState;
  readonly unknown: Uint8Array;
  readonly unknownHandSlots: number;
  readonly unknownDeckSlots: number;
  readonly eligibleUnknownTotal: number;
  /** Centered positive weights w_i = exp(logW_i - shift) for hand-eligible cards, 0 for excluded. */
  readonly weights: Float64Array;
  readonly logWeightShift: number;
  /** prefix[i][k] = sum over cards [0..i-1] of ways*weight to place k cards in unknown hand. */
  readonly prefix: Float64Array[];
  /** suffix[i][k] = sum over cards [i..C-1] of ways*weight to place k cards in unknown hand. */
  readonly suffix: Float64Array[];
  /** Total partition function Z = prefix[C][unknownHandSlots]. */
  readonly partitionZ: number;

  constructor(state: BeliefState, useUniformWeights = false, skipSuffix = false) {
    this.state = state;
    this.unknown = state.computeUnknownPool();
    this.unknownHandSlots = state.getUnknownHandSlots();
    this.unknownDeckSlots = state.getUnknownDeckSlots();

    const C = state.pool.size;
    const h = this.unknownHandSlots;
    const weights = new Float64Array(C);

    // Compute mean log-weight across eligible unknown cards for numerical centering.
    // Subtracting a constant mu from every eligible log-weight multiplies Z and every
    // numerator by exp(-h * mu), which cancels identically in all probabilities.
    let logSum = 0;
    let eligibleCards = 0;
    let eligibleTotal = 0;
    for (let i = 0; i < C; i++) {
      if (this.unknown[i] > 0 && state.excludedFromHand[i] === 0) {
        eligibleTotal += this.unknown[i];
        if (!useUniformWeights) {
          logSum += state.logWeights[i];
          eligibleCards++;
        }
      }
    }
    this.eligibleUnknownTotal = eligibleTotal;
    this.logWeightShift = eligibleCards > 0 ? logSum / eligibleCards : 0;

    for (let i = 0; i < C; i++) {
      if (this.unknown[i] === 0 || state.excludedFromHand[i] === 1) {
        weights[i] = 0;
      } else if (useUniformWeights) {
        weights[i] = 1;
      } else {
        weights[i] = Math.exp(state.logWeights[i] - this.logWeightShift);
      }
    }
    this.weights = weights;

    // Prefix DP: flat backing buffer with subarray views
    const stride = h + 1;
    const prefixBuf = new Float64Array((C + 1) * stride);
    const prefix: Float64Array[] = new Array(C + 1);
    for (let i = 0; i <= C; i++) prefix[i] = prefixBuf.subarray(i * stride, (i + 1) * stride);
    prefix[0][0] = 1;

    for (let i = 0; i < C; i++) {
      const prev = prefix[i];
      const next = prefix[i + 1];
      const u = this.unknown[i];
      const w = weights[i];

      if (u === 0 || w === 0) {
        next.set(prev);
      } else {
        const maxR = Math.min(u, h);
        let wPow = 1;
        for (let r = 0; r <= maxR; r++) {
          const factor = binomial(u, r) * wPow;
          for (let k = r; k <= h; k++) {
            next[k] += prev[k - r] * factor;
          }
          wPow *= w;
        }
      }
    }

    // Suffix DP: skipped when only sampling determinizations
    const suffix: Float64Array[] = skipSuffix ? [] : new Array(C + 1);
    if (!skipSuffix) {
      const suffixBuf = new Float64Array((C + 1) * stride);
      for (let i = 0; i <= C; i++) suffix[i] = suffixBuf.subarray(i * stride, (i + 1) * stride);
      suffix[C][0] = 1;

      for (let i = C - 1; i >= 0; i--) {
        const prev = suffix[i + 1];
        const next = suffix[i];
        const u = this.unknown[i];
        const w = weights[i];

        if (u === 0 || w === 0) {
          next.set(prev);
        } else {
          const maxR = Math.min(u, h);
          let wPow = 1;
          for (let r = 0; r <= maxR; r++) {
            const factor = binomial(u, r) * wPow;
            for (let k = r; k <= h; k++) {
              next[k] += prev[k - r] * factor;
            }
            wPow *= w;
          }
        }
      }
    }

    this.prefix = prefix;
    this.suffix = suffix;
    this.partitionZ = prefix[C][h];

    if (h > 0 && !(this.partitionZ > 0)) {
      throw new Error(
        `Zero partition function for h=${h}: hard constraints admit no valid opponent hand`,
      );
    }
  }

  /**
   * Computes exact P(unknownCopiesOfCard[cardIdx] in hand === r) using leave-one-out
   * convolution of prefix[cardIdx] and suffix[cardIdx + 1] (zero division instability).
   */
  probUnknownCopiesInHand(cardIdx: number, r: number): number {
    const h = this.unknownHandSlots;
    const u = this.unknown[cardIdx];
    const w = this.weights[cardIdx];

    if (r < 0 || r > u || r > h) return 0;
    if (h === 0) return r === 0 ? 1 : 0;
    if (w === 0) return r === 0 ? 1 : 0;

    const rem = h - r;
    const pref = this.prefix[cardIdx];
    const suff = this.suffix[cardIdx + 1];

    let withoutCardWays = 0;
    for (let a = 0; a <= rem; a++) {
      withoutCardWays += pref[a] * suff[rem - a];
    }

    const factor = binomial(u, r) * Math.pow(w, r);
    const p = (factor * withoutCardWays) / this.partitionZ;
    return Math.max(0, Math.min(1, p));
  }

  /** Computes exact breakdown: P(>=1), P(==2), P(>=2 / EX), E[handCopies], P(top of deck). */
  queryCardIndex(cardIdx: number): CardProbabilityBreakdown {
    const s = this.state;
    const knownH = s.knownHand[cardIdx];
    const u = this.unknown[cardIdx];
    const maxR = Math.min(u, this.unknownHandSlots);

    let probZeroTotal = 0;
    let probExactlyTwo = 0;
    let probAtLeastTwo = 0;
    let expectedUnknownInHand = 0;

    for (let r = 0; r <= maxR; r++) {
      const p = this.probUnknownCopiesInHand(cardIdx, r);
      const totalCopies = knownH + r;
      if (totalCopies === 0) probZeroTotal += p;
      if (totalCopies === 2) probExactlyTwo += p;
      if (totalCopies >= 2) probAtLeastTwo += p;
      expectedUnknownInHand += r * p;
    }

    const probAtLeastOne = Math.max(0, Math.min(1, 1 - probZeroTotal));
    const probTopOfDeck = this.computeTopOfDeckProb(cardIdx, expectedUnknownInHand);

    return {
      probAtLeastOne,
      probExactlyTwo: Math.max(0, Math.min(1, probExactlyTwo)),
      probExReady: Math.max(0, Math.min(1, probAtLeastTwo)),
      probTopOfDeck: Math.max(0, Math.min(1, probTopOfDeck)),
      expectedCopiesInHand: knownH + expectedUnknownInHand,
    };
  }

  private computeTopOfDeckProb(cardIdx: number, expectedUnknownInHand: number): number {
    const s = this.state;

    // Case 1: Empty deck — Exceed Wild Swing triggers automatic reshuffle if available.
    if (s.deckSize === 0) {
      if (!s.reshuffleUsed) {
        const discardTotal = s.getDiscardSize();
        if (discardTotal > 0) {
          return s.discard[cardIdx] / discardTotal;
        }
      }
      return 0;
    }

    // Case 2: Top of deck is deterministically known.
    if (s.knownDeckTop.length > 0) {
      return s.knownDeckTop[0] === cardIdx ? 1 : 0;
    }

    // Case 3: No unknown deck slots remain — shallowest card of knownDeckBottom IS the top card.
    const d = this.unknownDeckSlots;
    if (d === 0) {
      return s.knownDeckBottom.length > 0 && s.knownDeckBottom[0] === cardIdx ? 1 : 0;
    }

    // Case 4: Exact expectation over unknown deck copies:
    // By exchangeability of unknown deck slots, P(top = X) = E[unknownDeckCopies(X)] / d
    // = (U_X - E[unknownHandCopies(X)]) / d.
    const expectedUnknownInDeck = Math.max(0, this.unknown[cardIdx] - expectedUnknownInHand);
    return expectedUnknownInDeck / d;
  }

  /**
   * Rejection-free exact sampler from the Multivariate Fisher's Noncentral Hypergeometric
   * posterior via backward conditional chain rule over `prefix`.
   *
   * Complexity: O(C * h) time, O(1) retries (never rejects).
   */
  sampleDeterminization(rng: Rng = Math.random): Determinization {
    const s = this.state;
    const C = s.pool.size;
    let rem = this.unknownHandSlots;

    const sampledUnknownHand = new Uint8Array(C);
    let logUnnormWeight = 0;

    // Walk backward i = C-1 .. 0 using prefix[i][rem - r]
    for (let i = C - 1; i >= 0; i--) {
      if (rem === 0) break;
      const u = this.unknown[i];
      const w = this.weights[i];
      if (u === 0 || w === 0) continue;

      const maxR = Math.min(u, rem);
      const denom = this.prefix[i + 1][rem];
      const drawTarget = rng() * denom;

      let cumulative = 0;
      let chosenR = 0;
      let chosenTerm = 0;

      let wPow = 1;
      for (let r = 0; r <= maxR; r++) {
        const factor = binomial(u, r) * wPow;
        const term = factor * this.prefix[i][rem - r];
        if (term > 0) {
          cumulative += term;
          chosenR = r;
          chosenTerm = factor;
          if (drawTarget <= cumulative) {
            break;
          }
        }
        wPow *= w;
      }

      if (chosenR > 0) {
        sampledUnknownHand[i] = chosenR;
        logUnnormWeight += Math.log(chosenTerm);
        rem -= chosenR;
      }
    }

    if (rem !== 0) {
      throw new Error(`Internal sampling invariant failure: ${rem} hand slots unfilled`);
    }

    // Assemble concrete hand (knownHand + sampledUnknownHand)
    const handIndices: number[] = [];
    const handKeys: string[] = [];
    const unknownDeckBag: number[] = [];

    for (let i = 0; i < C; i++) {
      const totalHandCopies = s.knownHand[i] + sampledUnknownHand[i];
      const key = s.pool.cards[i].key;
      for (let c = 0; c < totalHandCopies; c++) {
        handIndices.push(i);
        handKeys.push(key);
      }
      const deckCopies = this.unknown[i] - sampledUnknownHand[i];
      for (let c = 0; c < deckCopies; c++) {
        unknownDeckBag.push(i);
      }
    }

    // Fisher-Yates shuffle the unconstrained unknown deck cards
    for (let i = unknownDeckBag.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = unknownDeckBag[i];
      unknownDeckBag[i] = unknownDeckBag[j];
      unknownDeckBag[j] = tmp;
    }

    // Concrete deck ordered from top (index 0) to bottom:
    // knownDeckTop + shuffled(unknownDeckBag) + knownDeckBottom
    const deckTopToBottomIndices = [
      ...s.knownDeckTop,
      ...unknownDeckBag,
      ...s.knownDeckBottom,
    ];
    const deckTopToBottomKeys = deckTopToBottomIndices.map((idx) => s.pool.cards[idx].key);

    const logHandProbability =
      this.unknownHandSlots === 0 ? 0 : logUnnormWeight - Math.log(this.partitionZ);

    return {
      handIndices,
      handKeys,
      deckTopToBottomIndices,
      deckTopToBottomKeys,
      logHandProbability,
    };
  }
}

/**
 * Exact unweighted combinatorial probability calculations (closed-form hypergeometric,
 * honoring knownHand, excludedFromHand, knownDeckTop, knownDeckBottom, and auto-reshuffle).
 */
export function queryExactUnweighted(
  state: BeliefState,
  cardKey: string,
): CardProbabilityBreakdown {
  const idx = state.pool.indexOf(cardKey);
  const unknown = state.computeUnknownPool();
  const h = state.getUnknownHandSlots();
  const d = state.getUnknownDeckSlots();
  const knownH = state.knownHand[idx];
  const uX = unknown[idx];
  const excluded = state.excludedFromHand[idx] === 1;

  let eligiblePop = 0;
  for (let i = 0; i < state.pool.size; i++) {
    if (state.excludedFromHand[i] === 0) {
      eligiblePop += unknown[i];
    }
  }

  let probAtLeastOne: number;
  let probExactlyTwo: number;
  let probExReady: number;
  let expectedUnknownInHand: number;

  if (h === 0 || excluded || uX === 0) {
    probAtLeastOne = knownH >= 1 ? 1 : 0;
    probExactlyTwo = knownH === 2 ? 1 : 0;
    probExReady = knownH >= 2 ? 1 : 0;
    expectedUnknownInHand = 0;
  } else {
    // Closed-form Hypergeometric(N = eligiblePop, K = uX, n = h)
    probAtLeastOne =
      knownH >= 1 ? 1 : Math.max(0, Math.min(1, 1 - hypergeometricPMF(eligiblePop, uX, h, 0)));

    const needForExact2 = 2 - knownH;
    probExactlyTwo =
      needForExact2 < 0 ? 0 : hypergeometricPMF(eligiblePop, uX, h, needForExact2);

    if (knownH >= 2) {
      probExReady = 1;
    } else {
      const minNeed = 2 - knownH;
      let sum = 0;
      const maxR = Math.min(uX, h);
      for (let r = minNeed; r <= maxR; r++) {
        sum += hypergeometricPMF(eligiblePop, uX, h, r);
      }
      probExReady = Math.max(0, Math.min(1, sum));
    }

    expectedUnknownInHand = (h * uX) / eligiblePop;
  }

  // Exact Wild Swing top-of-deck probability
  let probTopOfDeck: number;
  if (state.deckSize === 0) {
    if (!state.reshuffleUsed) {
      const discardTotal = state.getDiscardSize();
      probTopOfDeck = discardTotal > 0 ? state.discard[idx] / discardTotal : 0;
    } else {
      probTopOfDeck = 0;
    }
  } else if (state.knownDeckTop.length > 0) {
    probTopOfDeck = state.knownDeckTop[0] === idx ? 1 : 0;
  } else if (d === 0) {
    probTopOfDeck =
      state.knownDeckBottom.length > 0 && state.knownDeckBottom[0] === idx ? 1 : 0;
  } else {
    probTopOfDeck = Math.max(0, Math.min(1, (uX - expectedUnknownInHand) / d));
  }

  return {
    probAtLeastOne,
    probExactlyTwo,
    probExReady,
    probTopOfDeck,
    expectedCopiesInHand: knownH + expectedUnknownInHand,
  };
}

/**
 * Convenience query returning BOTH exact unweighted hypergeometric probabilities
 * and exact Bayesian-weighted DP probabilities for `cardKey`.
 */
export function queryCardProbabilities(
  state: BeliefState,
  cardKey: string,
  compiled?: CompiledBeliefModel,
): ProbabilityQueryResult {
  const idx = state.pool.indexOf(cardKey);
  const model = compiled ?? new CompiledBeliefModel(state, false);
  const bayesian = model.queryCardIndex(idx);
  const exactUnweighted = queryExactUnweighted(state, cardKey);

  return {
    cardKey,
    knownInHand: state.knownHand[idx],
    unknownInPool: model.unknown[idx],
    excludedFromHand: state.excludedFromHand[idx] === 1,
    bayesian,
    exactUnweighted,
  };
}

/**
 * Convenience wrapper compiling the exact DP model and sampling one valid determinization.
 * For tight IS-MCTS loops requiring many samples from the same state, instantiate
 * `new CompiledBeliefModel(state)` once and call `model.sampleDeterminization(rng)`.
 */
export function sampleDeterminization(
  state: BeliefState,
  rng: Rng = Math.random,
): Determinization {
  return new CompiledBeliefModel(state, false, true).sampleDeterminization(rng);
}

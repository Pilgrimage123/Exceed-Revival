/**
 * Exceed Fighting System — Layer 1: Exact Card Counting & Belief State Engine
 * Core immutable catalog types, public/hidden zone schemas, and reachability math.
 */

export type CardType = 'normal' | 'special' | 'ultra' | 'astral';

export type PublicZoneName =
  | 'discard'
  | 'gauge'
  | 'boostsInPlay'
  | 'sealed'
  | 'overdrive'
  | 'revealedStrike'
  | 'outOfPlay';

export interface BeforeMoveSpec {
  readonly kind: 'advance' | 'close';
  readonly amount: number;
  readonly upTo: boolean;
}

export interface CardDescriptor {
  /** Dense integer index [0..C-1] used to index typed-array buffers in BeliefState. */
  readonly index: number;
  readonly key: string;
  readonly name: string;
  readonly type: CardType;
  /** Number of copies present in the starting deck (0 for out-of-play Astral / summoned cards). */
  readonly initialDeckCopies: number;
  /** Total copies tracked across all zones including out-of-play (e.g., 1 for BlazBlue Astral Heat). */
  readonly totalCopies: number;
  readonly range: readonly [number, number] | null;
  readonly pow: number;
  readonly spd: number;
  readonly arm: number;
  readonly grd: number;
  readonly gaugeCost: number;
  /** Force generated when discarded from hand (Ultras = 2, Normals/Specials/Astrals = 1). */
  readonly forceValue: 1 | 2;
  readonly alwaysMiss: boolean;
  readonly isAstral: boolean;
  readonly isDefensive: boolean;
  readonly beforeMove: BeforeMoveSpec | null;
  readonly rangeMaxBonusIfInitiating: number;
}

export interface ActiveBoostRangeMods {
  readonly grantsNormalsBeforeAdvance?: number;
  readonly normalsRangeBonus?: number;
  readonly rangeMaxBonus?: number;
}

export interface BoardState {
  /** Current fighter-to-fighter distance on the 9-space arena (1..8). */
  readonly currentDist: number;
  /** Fighter-to-fighter distance immediately prior to the observed action. */
  readonly prevDist?: number;
  /** Distances at which OUR fighter currently poses a strong Strike threat. */
  readonly ourThreatRanges: readonly number[];
  /** Opponent's current public Gauge count (gates Ultra affordability). */
  readonly oppGaugeCount: number;
  readonly oppLife: number;
  readonly ourLife: number;
  readonly oppExceeded: boolean;
  /** Optional absolute board coordinates (0..8) for Zato-1 Eddie or Vega edge checks. */
  readonly oppPos?: number;
  readonly ourPos?: number;
  readonly oppEddiePos?: number | null;
  /** Public continuous-boost range modifiers currently active on the opponent. */
  readonly oppBoostMods?: ActiveBoostRangeMods;
  /** Cards currently invalidated as Strikes by character passives (e.g., Exceeded Nagoriyuki Specials). */
  readonly oppInvalidStrikeKeys?: ReadonlySet<string>;
}

export type ObservedAction =
  | {
      readonly type: 'move_paid';
      readonly fromDist: number;
      readonly toDist: number;
      readonly forceSpent: number;
      readonly discardedKeys?: readonly string[];
    }
  | {
      readonly type: 'prepare';
    }
  | {
      readonly type: 'change_cards';
      readonly forceSpent: number;
      readonly cardsDrawn: number;
      readonly discardedKeys?: readonly string[];
    }
  | {
      readonly type: 'force_discard';
      readonly discardedKey: string;
      readonly purpose: 'move' | 'change_cards' | 'boost' | 'block_armor' | 'character_action';
      readonly forceNeeded: number;
      readonly targetDist?: number;
    }
  | {
      readonly type: 'strike_initiated';
      readonly dist: number;
      readonly isWildSwing?: boolean;
      readonly fromCharacterAction?: boolean;
    }
  | {
      readonly type: 'boost_played';
      readonly cardKey: string;
      readonly forceSpent: number;
    };

export interface CardProbabilityBreakdown {
  readonly probAtLeastOne: number;
  readonly probExactlyTwo: number;
  /** Exact P(copies in hand >= 2) — identical to probExactlyTwo for 2-copy cards, exact for 3–4 copy cards. */
  readonly probExReady: number;
  readonly probTopOfDeck: number;
  readonly expectedCopiesInHand: number;
}

export interface ProbabilityQueryResult {
  readonly cardKey: string;
  readonly knownInHand: number;
  readonly unknownInPool: number;
  readonly excludedFromHand: boolean;
  /** Exact Bayesian-weighted marginal probabilities via Multivariate Fisher's Noncentral Hypergeometric DP. */
  readonly bayesian: CardProbabilityBreakdown;
  /** Exact unweighted combinatorial probabilities (uniform prior over unknown pool, respecting hard constraints). */
  readonly exactUnweighted: CardProbabilityBreakdown;
}

export interface Determinization {
  readonly handIndices: readonly number[];
  readonly handKeys: readonly string[];
  /** Concrete deck ordered from top (index 0, next draw / Wild Swing) to bottom. */
  readonly deckTopToBottomIndices: readonly number[];
  readonly deckTopToBottomKeys: readonly string[];
  /** Natural log of the posterior probability P(unknownHandMultiset | BeliefState) up to deck-order permutation. */
  readonly logHandProbability: number;
}

export type Rng = () => number;

export const BOARD_SIZE = 9;

/** Deterministic Mulberry32 PRNG for reproducible tests, traces, and MCTS rollouts. */
export function createMulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Computes resulting fighter-to-fighter distance after a free Before: Advance/Close move.
 * Mirrors game/ai.js `distanceAfterFreeMove` on the 1D Exceed arena.
 */
export function distanceAfterFreeMove(dist: number, amount: number, kind: 'advance' | 'close'): number {
  if (amount <= 0) return dist;
  if (kind === 'close') {
    return Math.max(1, dist - amount);
  }
  return amount < dist ? dist - amount : amount - dist + 1;
}

/**
 * Parses Exceed card text for Before: Advance/Close self-movement.
 * Mirrors game/ai.js `parseBeforeMoverSpec` / `parseBeforeMoverAmount`.
 */
export function parseBeforeMoveSpec(text: string | undefined): BeforeMoveSpec | null {
  if (!text) return null;
  const farMatch = text.match(/Before:\s*(Advance|Close)\s+as far as possible/i);
  if (farMatch) {
    return {
      kind: farMatch[1].toLowerCase() as 'advance' | 'close',
      amount: BOARD_SIZE,
      upTo: false,
    };
  }
  const match = text.match(
    /Before:\s*(Advance|Close)\s+(?:up to\s+(\d+)|(\d+)\s+or\s+(\d+)|(\d+))/i,
  );
  if (!match) return null;
  const kind = match[1].toLowerCase() as 'advance' | 'close';
  if (match[2]) {
    return { kind, amount: parseInt(match[2], 10), upTo: true };
  }
  if (match[3] && match[4]) {
    return { kind, amount: Math.max(parseInt(match[3], 10), parseInt(match[4], 10)), upTo: true };
  }
  if (match[5]) {
    return { kind, amount: parseInt(match[5], 10), upTo: false };
  }
  return null;
}

/**
 * Immutable static fighter decklist catalog mapping card keys <-> dense indices [0..C-1].
 */
export class CardPool {
  readonly characterKey: string;
  readonly characterName: string;
  readonly cards: readonly CardDescriptor[];
  readonly indexByKey: ReadonlyMap<string, number>;
  readonly totalInitialDeckCopies: number;
  readonly totalTrackedCopies: number;
  readonly astralIndex: number | null;
  readonly specialsRangeFromEddie: boolean;
  readonly usesOverdrive: boolean;
  readonly usesCritical: boolean;

  constructor(params: {
    characterKey: string;
    characterName: string;
    cards: readonly Omit<CardDescriptor, 'index'>[];
    specialsRangeFromEddie?: boolean;
    usesOverdrive?: boolean;
    usesCritical?: boolean;
  }) {
    this.characterKey = params.characterKey;
    this.characterName = params.characterName;
    this.specialsRangeFromEddie = !!params.specialsRangeFromEddie;
    this.usesOverdrive = !!params.usesOverdrive;
    this.usesCritical = !!params.usesCritical;

    const indexed: CardDescriptor[] = [];
    const map = new Map<string, number>();
    let deckTotal = 0;
    let trackedTotal = 0;
    let astralIdx: number | null = null;

    for (let i = 0; i < params.cards.length; i++) {
      const raw = params.cards[i];
      if (map.has(raw.key)) {
        throw new Error(`Duplicate card key "${raw.key}" in CardPool for ${params.characterKey}`);
      }
      if (raw.initialDeckCopies < 0 || raw.totalCopies < raw.initialDeckCopies) {
        throw new Error(`Invalid copy counts for card "${raw.key}"`);
      }
      const desc: CardDescriptor = { ...raw, index: i };
      indexed.push(desc);
      map.set(desc.key, i);
      deckTotal += desc.initialDeckCopies;
      trackedTotal += desc.totalCopies;
      if (desc.isAstral) {
        astralIdx = i;
      }
    }

    this.cards = Object.freeze(indexed);
    this.indexByKey = map;
    this.totalInitialDeckCopies = deckTotal;
    this.totalTrackedCopies = trackedTotal;
    this.astralIndex = astralIdx;
  }

  get size(): number {
    return this.cards.length;
  }

  indexOf(key: string): number {
    const idx = this.indexByKey.get(key);
    if (idx === undefined) {
      throw new Error(`Unknown card key "${key}" for character "${this.characterKey}"`);
    }
    return idx;
  }

  hasKey(key: string): boolean {
    return this.indexByKey.has(key);
  }

  getByKey(key: string): CardDescriptor {
    return this.cards[this.indexOf(key)];
  }

  getByIndex(index: number): CardDescriptor {
    const card = this.cards[index];
    if (!card) {
      throw new RangeError(`Card index ${index} out of bounds [0..${this.cards.length - 1}]`);
    }
    return card;
  }

  /**
   * Computes whether `card` can connect from fighter distance `dist`, accounting for
   * forced/optional Before-movement, active continuous boosts, initiation bonuses,
   * and Zato-1's Eddie range origin.
   */
  canReach(
    card: CardDescriptor,
    dist: number,
    opts?: {
      isInitiating?: boolean;
      boostMods?: ActiveBoostRangeMods;
      oppEddiePos?: number | null;
      ourPos?: number;
    },
  ): boolean {
    if (card.alwaysMiss || !card.range) return false;

    const effectiveDist =
      this.specialsRangeFromEddie &&
      card.type !== 'normal' &&
      opts?.oppEddiePos != null &&
      opts?.ourPos != null
        ? Math.abs(opts.oppEddiePos - opts.ourPos)
        : dist;

    const boostMods = opts?.boostMods;
    const rangeBonus =
      (opts?.isInitiating ? card.rangeMaxBonusIfInitiating : 0) +
      (boostMods?.rangeMaxBonus ?? 0) +
      (card.type === 'normal' ? (boostMods?.normalsRangeBonus ?? 0) : 0);

    const lo = card.range[0];
    const hi = card.range[1] + rangeBonus;

    const boostAdvance =
      card.type === 'normal' ? (boostMods?.grantsNormalsBeforeAdvance ?? 0) : 0;
    const spec = card.beforeMove;

    if (!spec && boostAdvance === 0) {
      return effectiveDist >= lo && effectiveDist <= hi;
    }

    const kind = spec ? spec.kind : 'advance';
    const amount = Math.min(BOARD_SIZE, (spec ? spec.amount : 0) + boostAdvance);
    const optional = spec ? spec.upTo : false;

    if (optional && effectiveDist >= lo && effectiveDist <= hi) {
      return true;
    }
    const startAmt = optional ? 1 : amount;
    for (let a = startAmt; a <= amount; a++) {
      const landed = distanceAfterFreeMove(effectiveDist, a, kind);
      if (landed >= lo && landed <= hi) return true;
    }
    return false;
  }

  /**
   * Checks whether the opponent can legally set `card` as a Strike right now
   * without triggering an involuntary Wild Swing substitution.
   */
  isStrikeAffordableAndValid(card: CardDescriptor, board: BoardState): boolean {
    if (card.gaugeCost > board.oppGaugeCount) return false;
    if (board.oppInvalidStrikeKeys && board.oppInvalidStrikeKeys.has(card.key)) return false;
    return true;
  }
}

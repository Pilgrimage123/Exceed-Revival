/**
 * Exceed Fighting System — Layer 1: BeliefState & Zone Conservation Engine
 *
 * Uses flat typed arrays (Uint8Array / Float64Array) indexed by CardPool dense IDs
 * so clone() executes in sub-microsecond time with zero shared mutable references.
 */

import { CardPool, PublicZoneName } from './types.ts';

/** Clamping bounds for per-card Bayesian log-weights: exp(4) ≈ 54.6x max lean, never hard zero. */
export const MIN_LOG_WEIGHT = -4.0;
export const MAX_LOG_WEIGHT = 4.0;

export interface GameZonesSnapshot {
  readonly discard: Uint8Array;
  readonly gauge: Uint8Array;
  readonly boostsInPlay: Uint8Array;
  readonly sealed: Uint8Array;
  readonly overdrive: Uint8Array;
  readonly revealedStrike: Uint8Array;
  readonly outOfPlay: Uint8Array;
}

export interface BeliefStateInitOptions {
  readonly openingHandSize?: number;
  readonly validateInvariants?: boolean;
}

export class BeliefState {
  readonly pool: CardPool;

  // Public zone counts (each Uint8Array length === pool.size)
  readonly discard: Uint8Array;
  readonly gauge: Uint8Array;
  readonly boostsInPlay: Uint8Array;
  readonly sealed: Uint8Array;
  readonly overdrive: Uint8Array;
  readonly revealedStrike: Uint8Array;
  readonly outOfPlay: Uint8Array;

  // Hard constraints on hidden zones
  readonly knownHand: Uint8Array;
  /** 1 if card key is proven NOT to exist in any unknown hand slot (e.g. 0-match Block/Focus reveal). */
  readonly excludedFromHand: Uint8Array;
  /** Ordered known cards from the top of the opponent's deck (index 0 = very top / next draw). */
  knownDeckTop: number[];
  /** Ordered known cards at the bottom of the opponent's deck (index 0 = shallowest of bottom stack, last = deepest). */
  knownDeckBottom: number[];

  // Hidden zone cardinalities & cycle tracking
  handSize: number;
  deckSize: number;
  reshuffleCycle: number;
  reshuffleUsed: boolean;
  /** True after a Season 5 manual Reshuffle until end-of-turn draw places Astral Heat into knownHand. */
  astralPending: boolean;

  // Bayesian log-odds weights for unknown hand occupancy (clamped to [MIN_LOG_WEIGHT, MAX_LOG_WEIGHT])
  readonly logWeights: Float64Array;

  constructor(pool: CardPool, opts: BeliefStateInitOptions = {}) {
    this.pool = pool;
    const n = pool.size;

    this.discard = new Uint8Array(n);
    this.gauge = new Uint8Array(n);
    this.boostsInPlay = new Uint8Array(n);
    this.sealed = new Uint8Array(n);
    this.overdrive = new Uint8Array(n);
    this.revealedStrike = new Uint8Array(n);
    this.outOfPlay = new Uint8Array(n);

    this.knownHand = new Uint8Array(n);
    this.excludedFromHand = new Uint8Array(n);
    this.knownDeckTop = [];
    this.knownDeckBottom = [];

    // Place out-of-play copies (e.g., Season 5 Astral Heat, 0-copy summoned cards) into outOfPlay.
    for (let i = 0; i < n; i++) {
      const card = pool.cards[i];
      const oop = card.totalCopies - card.initialDeckCopies;
      if (oop > 0) {
        this.outOfPlay[i] = oop;
      }
    }

    const openingHand = opts.openingHandSize ?? 5;
    if (openingHand < 0 || openingHand > pool.totalInitialDeckCopies) {
      throw new RangeError(
        `Opening hand size ${openingHand} exceeds initial deck size ${pool.totalInitialDeckCopies}`,
      );
    }

    this.handSize = openingHand;
    this.deckSize = pool.totalInitialDeckCopies - openingHand;
    this.reshuffleCycle = 0;
    this.reshuffleUsed = false;
    this.astralPending = false;
    this.logWeights = new Float64Array(n);

    if (opts.validateInvariants !== false) {
      this.assertInvariants();
    }
  }

  /**
   * Fast deep copy for MCTS tree search — zero shared mutable state.
   */
  clone(): BeliefState {
    const copy = Object.create(BeliefState.prototype) as BeliefState;
    (copy as { pool: CardPool }).pool = this.pool;
    (copy as { discard: Uint8Array }).discard = this.discard.slice();
    (copy as { gauge: Uint8Array }).gauge = this.gauge.slice();
    (copy as { boostsInPlay: Uint8Array }).boostsInPlay = this.boostsInPlay.slice();
    (copy as { sealed: Uint8Array }).sealed = this.sealed.slice();
    (copy as { overdrive: Uint8Array }).overdrive = this.overdrive.slice();
    (copy as { revealedStrike: Uint8Array }).revealedStrike = this.revealedStrike.slice();
    (copy as { outOfPlay: Uint8Array }).outOfPlay = this.outOfPlay.slice();
    (copy as { knownHand: Uint8Array }).knownHand = this.knownHand.slice();
    (copy as { excludedFromHand: Uint8Array }).excludedFromHand = this.excludedFromHand.slice();
    copy.knownDeckTop = this.knownDeckTop.slice();
    copy.knownDeckBottom = this.knownDeckBottom.slice();
    copy.handSize = this.handSize;
    copy.deckSize = this.deckSize;
    copy.reshuffleCycle = this.reshuffleCycle;
    copy.reshuffleUsed = this.reshuffleUsed;
    copy.astralPending = this.astralPending;
    (copy as { logWeights: Float64Array }).logWeights = this.logWeights.slice();
    return copy;
  }

  getPublicZoneArray(zone: PublicZoneName): Uint8Array {
    switch (zone) {
      case 'discard':
        return this.discard;
      case 'gauge':
        return this.gauge;
      case 'boostsInPlay':
        return this.boostsInPlay;
      case 'sealed':
        return this.sealed;
      case 'overdrive':
        return this.overdrive;
      case 'revealedStrike':
        return this.revealedStrike;
      case 'outOfPlay':
        return this.outOfPlay;
    }
  }

  getPublicCount(cardIdx: number): number {
    return (
      this.discard[cardIdx] +
      this.gauge[cardIdx] +
      this.boostsInPlay[cardIdx] +
      this.sealed[cardIdx] +
      this.overdrive[cardIdx] +
      this.revealedStrike[cardIdx] +
      this.outOfPlay[cardIdx]
    );
  }

  getDiscardSize(): number {
    let sum = 0;
    for (let i = 0; i < this.discard.length; i++) sum += this.discard[i];
    return sum;
  }

  getKnownHandTotal(): number {
    let sum = 0;
    for (let i = 0; i < this.knownHand.length; i++) sum += this.knownHand[i];
    return sum;
  }

  getUnknownHandSlots(): number {
    return this.handSize - this.getKnownHandTotal();
  }

  getUnknownDeckSlots(): number {
    return this.deckSize - this.knownDeckTop.length - this.knownDeckBottom.length;
  }

  /**
   * Computes the exact count of unconstrained unknown copies per card index.
   * UnknownPool[i] = Total[i] - Public[i] - KnownHand[i] - KnownDeckTop[i] - KnownDeckBottom[i].
   */
  computeUnknownPool(): Uint8Array {
    const n = this.pool.size;
    const unknown = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const rem = this.pool.cards[i].totalCopies - this.getPublicCount(i) - this.knownHand[i];
      if (rem < 0) {
        throw new Error(
          `Zone conservation violated for "${this.pool.cards[i].key}": remaining=${rem}`,
        );
      }
      unknown[i] = rem;
    }
    for (const idx of this.knownDeckTop) {
      if (unknown[idx] === 0) {
        throw new Error(
          `knownDeckTop overflow for "${this.pool.cards[idx].key}": no copies left in unknown pool`,
        );
      }
      unknown[idx]--;
    }
    for (const idx of this.knownDeckBottom) {
      if (unknown[idx] === 0) {
        throw new Error(
          `knownDeckBottom overflow for "${this.pool.cards[idx].key}": no copies left in unknown pool`,
        );
      }
      unknown[idx]--;
    }
    return unknown;
  }

  /**
   * Strictly verifies all card conservation & constraint invariants.
   * Throws an explicit diagnostic Error on any violation.
   */
  assertInvariants(): void {
    const unknown = this.computeUnknownPool();
    let unknownTotal = 0;
    let eligibleUnknownTotal = 0;

    for (let i = 0; i < this.pool.size; i++) {
      unknownTotal += unknown[i];
      if (this.excludedFromHand[i] === 0) {
        eligibleUnknownTotal += unknown[i];
      }
    }

    const unknownHandSlots = this.getUnknownHandSlots();
    const unknownDeckSlots = this.getUnknownDeckSlots();

    if (unknownHandSlots < 0) {
      throw new Error(
        `Invalid hand state: knownHandTotal (${this.getKnownHandTotal()}) > handSize (${this.handSize})`,
      );
    }
    if (unknownDeckSlots < 0) {
      throw new Error(
        `Invalid deck state: knownDeckTop (${this.knownDeckTop.length}) + knownDeckBottom (${this.knownDeckBottom.length}) > deckSize (${this.deckSize})`,
      );
    }
    if (unknownHandSlots + unknownDeckSlots !== unknownTotal) {
      throw new Error(
        `Hidden zone mismatch: unknownHand (${unknownHandSlots}) + unknownDeck (${unknownDeckSlots}) !== unknownPool (${unknownTotal})`,
      );
    }
    if (eligibleUnknownTotal < unknownHandSlots) {
      throw new Error(
        `Impossible exclusion constraints: only ${eligibleUnknownTotal} eligible unknown cards for ${unknownHandSlots} unknown hand slots`,
      );
    }
  }

  /** Adjusts Bayesian log-weight for a single card index, clamped strictly to [MIN_LOG_WEIGHT, MAX_LOG_WEIGHT]. */
  adjustLogWeight(cardIdx: number, delta: number): void {
    const next = this.logWeights[cardIdx] + delta;
    this.logWeights[cardIdx] = Math.max(MIN_LOG_WEIGHT, Math.min(MAX_LOG_WEIGHT, next));
  }

  /**
   * Tempers Bayesian log-weights toward 0 (uniform prior) by `retention` in [0, 1].
   * Applied proportionally on draws/reshuffles so stale tells decay gracefully.
   */
  temperLogWeights(retention: number): void {
    const clamped = Math.max(0, Math.min(1, retention));
    for (let i = 0; i < this.logWeights.length; i++) {
      this.logWeights[i] *= clamped;
    }
  }

  // =========================================================================
  // Deterministic Public-Event State Transitions (Zero Hidden-Info Leakage)
  // =========================================================================

  /**
   * Opponent draws `count` cards from top of deck.
   * Correctly resolves:
   *  1. Known top-of-deck cards moving deterministically into `knownHand`
   *  2. Automatic mid-draw reshuffle when deck empties (if reshuffle available)
   *  3. Known bottom-of-deck cards becoming top draws once unknown deck slots hit 0
   *  4. Invalidating negative hand exclusions (`excludedFromHand`) when unknown cards enter hand
   *  5. Proportional Bayesian weight tempering for newly drawn unknown cards
   */
  observeDraw(count: number): this {
    if (count < 0) throw new RangeError(`Cannot draw negative card count: ${count}`);
    let unknownCardsDrawn = 0;
    const prevUnknownHand = this.getUnknownHandSlots();

    for (let i = 0; i < count; i++) {
      if (this.deckSize === 0) {
        if (!this.reshuffleUsed && this.getDiscardSize() > 0) {
          this.performAutoReshuffleInternal();
        } else {
          // Deck-out loss condition in Exceed; no further cards can be drawn.
          break;
        }
      }

      if (this.knownDeckTop.length > 0) {
        const cardIdx = this.knownDeckTop.shift()!;
        this.deckSize--;
        this.handSize++;
        this.knownHand[cardIdx]++;
      } else if (this.getUnknownDeckSlots() === 0 && this.knownDeckBottom.length > 0) {
        // Entire remaining deck consists of knownDeckBottom; index 0 is the shallowest card.
        const cardIdx = this.knownDeckBottom.shift()!;
        this.deckSize--;
        this.handSize++;
        this.knownHand[cardIdx]++;
      } else {
        this.deckSize--;
        this.handSize++;
        unknownCardsDrawn++;
      }
    }

    if (unknownCardsDrawn > 0) {
      // Any card previously proven absent from hand could have just been drawn.
      this.excludedFromHand.fill(0);
      const nextUnknownHand = prevUnknownHand + unknownCardsDrawn;
      const retention = nextUnknownHand > 0 ? prevUnknownHand / nextUnknownHand : 0;
      this.temperLogWeights(retention);
    }

    this.assertInvariants();
    return this;
  }

  /**
   * Exceed end-of-turn draw.
   * For Season 5 BlazBlue fighters with `astralPending === true`, their Astral Heat
   * enters `knownHand` directly from `outOfPlay` instead of drawing from deck.
   */
  observeEndOfTurnDraw(): this {
    if (this.astralPending && this.pool.astralIndex !== null) {
      const aIdx = this.pool.astralIndex;
      if (this.outOfPlay[aIdx] > 0) {
        this.outOfPlay[aIdx]--;
        this.knownHand[aIdx]++;
        this.handSize++;
        this.astralPending = false;
        this.assertInvariants();
        return this;
      }
    }
    return this.observeDraw(1);
  }

  /**
   * Opponent plays or discards a publicly revealed card from Hand into `targetZone`.
   * Decrements `knownHand` first if the card was already confirmed in hand.
   */
  observeCardFromHandToZone(cardKey: string, targetZone: PublicZoneName): this {
    const idx = this.pool.indexOf(cardKey);
    if (this.handSize <= 0) {
      throw new Error(`Cannot move "${cardKey}" from empty hand to ${targetZone}`);
    }

    const wasKnown = this.knownHand[idx] > 0;
    if (wasKnown) {
      this.knownHand[idx]--;
    } else if (this.excludedFromHand[idx] === 1) {
      // Defensive recovery: if a card thought excluded was actually played from hand,
      // clear the stale exclusion rather than crashing.
      this.excludedFromHand[idx] = 0;
    }

    this.handSize--;
    this.getPublicZoneArray(targetZone)[idx]++;
    this.assertInvariants();
    return this;
  }

  /**
   * Opponent commits an EX Attack from Hand (2 identical copies: 1 into revealedStrike, 1 to discard).
   */
  observePlayEXFromHand(
    cardKey: string,
    primaryZone: PublicZoneName = 'revealedStrike',
    exCopyZone: PublicZoneName = 'discard',
  ): this {
    this.observeCardFromHandToZone(cardKey, primaryZone);
    this.observeCardFromHandToZone(cardKey, exCopyZone);
    return this;
  }

  /**
   * Moves a card between two public zones (e.g., revealedStrike -> gauge, gauge -> overdrive,
   * overdrive -> discard, boostsInPlay -> discard, revealedStrike -> sealed).
   */
  observePublicZoneMove(
    cardKey: string,
    fromZone: PublicZoneName,
    toZone: PublicZoneName,
  ): this {
    const idx = this.pool.indexOf(cardKey);
    const src = this.getPublicZoneArray(fromZone);
    if (src[idx] === 0) {
      throw new Error(`Card "${cardKey}" not present in public zone "${fromZone}"`);
    }
    src[idx]--;
    this.getPublicZoneArray(toZone)[idx]++;
    this.assertInvariants();
    return this;
  }

  /**
   * Opponent reveals a Wild Swing from the top of their deck into `targetZone` (default `revealedStrike`).
   * Triggers automatic reshuffle first if deck is empty and reshuffle is available.
   */
  observeWildSwingReveal(
    cardKey: string,
    targetZone: PublicZoneName = 'revealedStrike',
  ): this {
    const idx = this.pool.indexOf(cardKey);
    if (this.deckSize === 0) {
      if (!this.reshuffleUsed && this.getDiscardSize() > 0) {
        this.performAutoReshuffleInternal();
      } else {
        throw new Error(`Cannot Wild Swing "${cardKey}" with empty deck and no reshuffle`);
      }
    }

    if (this.knownDeckTop.length > 0) {
      const topIdx = this.knownDeckTop.shift()!;
      if (topIdx !== idx) {
        throw new Error(
          `Wild Swing mismatch: expected knownDeckTop "${this.pool.cards[topIdx].key}", observed "${cardKey}"`,
        );
      }
    } else if (this.getUnknownDeckSlots() === 0 && this.knownDeckBottom.length > 0) {
      const bottomTopIdx = this.knownDeckBottom.shift()!;
      if (bottomTopIdx !== idx) {
        throw new Error(
          `Wild Swing mismatch: expected knownDeckBottom[0] "${this.pool.cards[bottomTopIdx].key}", observed "${cardKey}"`,
        );
      }
    }

    this.deckSize--;
    this.getPublicZoneArray(targetZone)[idx]++;
    this.assertInvariants();
    return this;
  }

  /**
   * Records a full public hand reveal (e.g., 0-match Block or Focus Reading).
   * Replaces `knownHand` with exact revealed counts and marks all unrevealed cards as
   * excluded from unknown hand slots until the next unknown draw.
   */
  observeFullHandReveal(revealedKeys: readonly string[]): this {
    if (revealedKeys.length !== this.handSize) {
      throw new Error(
        `Hand reveal length (${revealedKeys.length}) does not match tracked handSize (${this.handSize})`,
      );
    }
    this.knownHand.fill(0);
    this.excludedFromHand.fill(1);
    for (const key of revealedKeys) {
      const idx = this.pool.indexOf(key);
      this.knownHand[idx]++;
    }
    // Hand is 100% deterministic; clear stale soft weights.
    this.logWeights.fill(0);
    this.assertInvariants();
    return this;
  }

  /**
   * Records a partial reveal confirming that `count` copies of `cardKey` are in Opponent's Hand.
   */
  observeKnownHandCard(cardKey: string, count = 1): this {
    const idx = this.pool.indexOf(cardKey);
    this.excludedFromHand[idx] = 0;
    this.knownHand[idx] += count;
    this.assertInvariants();
    return this;
  }

  /**
   * Records a negative hard constraint proving Opponent has 0 copies of `cardKey` in hand.
   */
  observeNamedCardMiss(cardKey: string): this {
    const idx = this.pool.indexOf(cardKey);
    if (this.knownHand[idx] > 0) {
      throw new Error(
        `Contradiction: "${cardKey}" is already in knownHand (${this.knownHand[idx]}) but observed missing`,
      );
    }
    this.excludedFromHand[idx] = 1;
    this.logWeights[idx] = 0;
    this.assertInvariants();
    return this;
  }

  /**
   * Moves a card from a public zone onto the top of Opponent's deck (e.g., Ryu's Hadoken recycle).
   */
  observeMovePublicToDeckTop(cardKey: string, fromZone: PublicZoneName): this {
    const idx = this.pool.indexOf(cardKey);
    const src = this.getPublicZoneArray(fromZone);
    if (src[idx] === 0) {
      throw new Error(`Card "${cardKey}" not present in "${fromZone}" to place on deck top`);
    }
    src[idx]--;
    this.deckSize++;
    this.knownDeckTop.unshift(idx);
    this.assertInvariants();
    return this;
  }

  /**
   * Moves a card from a public zone onto the bottom of Opponent's deck.
   */
  observeMovePublicToDeckBottom(cardKey: string, fromZone: PublicZoneName): this {
    const idx = this.pool.indexOf(cardKey);
    const src = this.getPublicZoneArray(fromZone);
    if (src[idx] === 0) {
      throw new Error(`Card "${cardKey}" not present in "${fromZone}" to place on deck bottom`);
    }
    src[idx]--;
    this.deckSize++;
    this.knownDeckBottom.push(idx);
    this.assertInvariants();
    return this;
  }

  /**
   * Records a known top-of-deck card already residing in the unknown deck pool (e.g., public deck reveal).
   */
  observeRevealDeckTop(cardKey: string): this {
    const idx = this.pool.indexOf(cardKey);
    if (this.getUnknownDeckSlots() <= 0) {
      throw new Error(`Cannot reveal unknown deck top "${cardKey}": no unknown deck slots left`);
    }
    this.knownDeckTop.push(idx);
    this.assertInvariants();
    return this;
  }

  /**
   * Records a known bottom-of-deck card already residing in the unknown deck pool.
   */
  observeRevealDeckBottom(cardKey: string): this {
    const idx = this.pool.indexOf(cardKey);
    if (this.getUnknownDeckSlots() <= 0) {
      throw new Error(`Cannot reveal unknown deck bottom "${cardKey}": no unknown deck slots left`);
    }
    this.knownDeckBottom.push(idx);
    this.assertInvariants();
    return this;
  }

  /**
   * Opponent takes the once-per-game Manual Reshuffle action.
   * Merges Discard into Deck, clears deck order constraints, increments reshuffleCycle,
   * marks `reshuffleUsed = true`, and queues Season 5 Astral Heat if still out of play.
   */
  observeManualReshuffle(): this {
    if (this.reshuffleUsed) {
      throw new Error('Manual Reshuffle already used this game');
    }
    const discardTotal = this.getDiscardSize();
    this.discard.fill(0);
    this.deckSize += discardTotal;
    this.knownDeckTop = [];
    this.knownDeckBottom = [];
    this.reshuffleUsed = true;
    this.reshuffleCycle++;
    if (this.pool.astralIndex !== null && this.outOfPlay[this.pool.astralIndex] > 0) {
      this.astralPending = true;
    }
    this.assertInvariants();
    return this;
  }

  /**
   * Non-consuming effect reshuffle (e.g., Hakumen's Exceed `shuffleDiscardIntoDeck`).
   * Merges Discard into Deck and clears deck order constraints WITHOUT consuming
   * `reshuffleUsed` or queuing Astral Heat.
   */
  observeEffectReshuffle(): this {
    const discardTotal = this.getDiscardSize();
    this.discard.fill(0);
    this.deckSize += discardTotal;
    this.knownDeckTop = [];
    this.knownDeckBottom = [];
    this.reshuffleCycle++;
    this.assertInvariants();
    return this;
  }

  /**
   * Opponent performs Mulligan before Turn 1: sets aside `count` cards, draws `count`
   * replacements, then shuffles set-aside back in. In public belief space, the full
   * starting deck remains unknown, any prior order constraints clear, and weights reset.
   */
  observeMulligan(): this {
    this.knownDeckTop = [];
    this.knownDeckBottom = [];
    this.excludedFromHand.fill(0);
    this.logWeights.fill(0);
    this.assertInvariants();
    return this;
  }

  private performAutoReshuffleInternal(): void {
    const discardTotal = this.getDiscardSize();
    this.discard.fill(0);
    this.deckSize += discardTotal;
    this.knownDeckTop = [];
    this.knownDeckBottom = [];
    this.reshuffleUsed = true;
    this.reshuffleCycle++;
    // Note: Exceed rules explicitly exclude automatic empty-deck reshuffles from Astral Heat.
  }
}

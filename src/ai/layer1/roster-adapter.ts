/**
 * Exceed Fighting System — Layer 1: Repository Roster & Public-State Adapter
 *
 * Bridges the repository's game/cards.js CHARACTERS/NORMALS/GG_NORMALS definitions
 * and game/ai.js `publicInfoOf()` snapshots into strongly-typed Layer 1 structures,
 * preserving the strict no-cheating invariant (never reading opponent.hand).
 */

import { BeliefState } from './belief-state.ts';
import { CardDescriptor, CardPool, CardType, parseBeforeMoveSpec } from './types.ts';

/** Raw card shape matching game/cards.js entries. */
export interface RawExceedCardDef {
  readonly key: string;
  readonly name: string;
  readonly type: 'normal' | 'special' | 'ultra';
  readonly range: readonly [number, number] | null;
  readonly pow?: number;
  readonly spd?: number;
  readonly arm?: number;
  readonly grd?: number;
  readonly gaugeCost?: number;
  readonly copies?: number;
  readonly alwaysMiss?: boolean;
  readonly isAstral?: boolean;
  readonly text?: string;
  readonly hooks?: {
    readonly rangeMaxBonusIfInitiating?: number;
  };
}

/** Raw character shape matching game/cards.js CHARACTERS[key]. */
export interface RawExceedCharacterDef {
  readonly key: string;
  readonly name: string;
  readonly specials: readonly RawExceedCardDef[];
  readonly normals?: readonly RawExceedCardDef[];
  readonly isStreetFighter?: boolean;
  readonly specialsRangeFromEddie?: boolean;
  readonly overdrive?: unknown;
}

/**
 * Public-only opponent snapshot matching game/ai.js `publicInfoOf(player)`
 * extended with public sealed / overdrive / revealedStrike / deck-order metadata.
 */
export interface EnginePublicSnapshot {
  readonly characterKey: string;
  readonly handCount: number;
  readonly deckCount: number;
  readonly discard: readonly string[];
  readonly gauge: readonly string[];
  readonly boostsInPlay: readonly string[];
  readonly sealedCards?: readonly string[];
  readonly overdrive?: readonly string[];
  readonly revealedStrike?: readonly string[];
  readonly reshuffleUsed?: boolean;
  readonly astralInPlayOrHand?: boolean;
  readonly astralPending?: boolean;
  readonly astralState?: 'none' | 'out_of_play' | 'pending' | 'in_hand' | 'public';
  readonly revealedHand?: {
    readonly keys: readonly string[];
    readonly handCount: number;
    readonly deckCount: number;
    readonly discardCount: number;
    readonly gaugeCount: number;
    readonly boostsCount: number;
    readonly overdriveCount?: number;
    readonly sealedCount?: number;
  } | null;
  readonly knownDeckTop?: readonly string[];
  readonly knownDeckBottom?: readonly string[];
}

function toCardDescriptorWithoutIndex(
  raw: RawExceedCardDef,
  defaultCopies: number,
): Omit<CardDescriptor, 'index'> {
  const isAstral = !!raw.isAstral;
  const initialDeckCopies = isAstral ? 0 : raw.copies == null ? defaultCopies : raw.copies;
  // Track Astral Heat (1 copy starting outOfPlay) and 0-copy summoned cards (1 copy outOfPlay)
  const totalCopies = isAstral ? 1 : initialDeckCopies === 0 ? 1 : initialDeckCopies;
  const type: CardType = raw.type;
  const forceValue: 1 | 2 = raw.type === 'ultra' ? 2 : 1;
  const isDefensive =
    !!raw.alwaysMiss ||
    raw.key === 'block' ||
    raw.key === 'gg_block' ||
    raw.key === 'focus' ||
    raw.key === 'gg_focus' ||
    (raw.arm ?? 0) >= 2;

  return {
    key: raw.key,
    name: raw.name,
    type,
    initialDeckCopies,
    totalCopies,
    range: raw.range ? ([raw.range[0], raw.range[1]] as const) : null,
    pow: raw.pow ?? 0,
    spd: raw.spd ?? 0,
    arm: raw.arm ?? 0,
    grd: raw.grd ?? 0,
    gaugeCost: raw.gaugeCost ?? 0,
    forceValue,
    alwaysMiss: !!raw.alwaysMiss,
    isAstral,
    isDefensive,
    beforeMove: parseBeforeMoveSpec(raw.text),
    rangeMaxBonusIfInitiating: raw.hooks?.rangeMaxBonusIfInitiating ?? 0,
  };
}

/**
 * Constructs a `CardPool` from raw `game/cards.js` character + default normals definitions.
 * Mirrors `engine.js`'s `buildDeck(characterKey)` exactly across all 41 fighters:
 *  - Selects `charDef.normals || defaultNormals` (2 copies each)
 *  - Honors arbitrary `c.copies` (0, 2, 3, 4)
 *  - Tracks Season 5 `isAstral` cards starting in `outOfPlay`
 */
export function buildCardPoolFromRawData(
  charDef: RawExceedCharacterDef,
  defaultNormals: readonly RawExceedCardDef[],
): CardPool {
  const normalsPool = charDef.normals ?? defaultNormals;
  const cards: Omit<CardDescriptor, 'index'>[] = [];

  for (const c of normalsPool) {
    cards.push(toCardDescriptorWithoutIndex(c, 2));
  }
  for (const c of charDef.specials) {
    cards.push(toCardDescriptorWithoutIndex(c, 2));
  }

  return new CardPool({
    characterKey: charDef.key,
    characterName: charDef.name,
    cards,
    specialsRangeFromEddie: !!charDef.specialsRangeFromEddie,
    usesOverdrive: !!charDef.overdrive,
    usesCritical: !!charDef.isStreetFighter,
  });
}

/**
 * Reconstructs an exact, invariant-verified `BeliefState` from a public-only engine snapshot.
 */
export function createBeliefStateFromPublicSnapshot(
  pool: CardPool,
  snapshot: EnginePublicSnapshot,
): BeliefState {
  const state = new BeliefState(pool, {
    openingHandSize: 0,
    validateInvariants: false,
  });

  // Reset outOfPlay and compute from known zone presence
  state.outOfPlay.fill(0);

  const addKeys = (zone: Uint8Array, keys: readonly string[] | undefined) => {
    if (!keys) return;
    for (const k of keys) {
      if (!pool.hasKey(k)) {
        throw new Error(`Unknown card key "${k}" for fighter "${pool.characterKey}" in public snapshot`);
      }
      zone[pool.indexOf(k)]++;
    }
  };

  addKeys(state.discard, snapshot.discard);
  addKeys(state.gauge, snapshot.gauge);
  addKeys(state.boostsInPlay, snapshot.boostsInPlay);
  addKeys(state.sealed, snapshot.sealedCards);
  addKeys(state.overdrive, snapshot.overdrive);
  addKeys(state.revealedStrike, snapshot.revealedStrike);

  const astralInHandOrPlay = !!snapshot.astralInPlayOrHand || snapshot.astralState === 'in_hand' || snapshot.astralState === 'public';

  // Account for out-of-play cards (Astral Heat / 0-copy summoned cards) unless already visible or in play
  for (let i = 0; i < pool.size; i++) {
    const desc = pool.cards[i];
    const oopDefault = desc.totalCopies - desc.initialDeckCopies;
    if (oopDefault <= 0) continue;
    const alreadyPublic = state.getPublicCount(i);
    if (desc.isAstral && astralInHandOrPlay) {
      state.outOfPlay[i] = 0;
      if (alreadyPublic === 0) {
        // Astral Heat enters hand publicly on Reshuffle -> EoT draw, so it is a known hand card.
        state.knownHand[i] = 1;
      }
    } else {
      state.outOfPlay[i] = Math.max(0, oopDefault - alreadyPublic);
    }
  }

  state.handSize = snapshot.handCount;
  state.deckSize = snapshot.deckCount;
  state.reshuffleUsed = !!snapshot.reshuffleUsed;
  state.reshuffleCycle = snapshot.reshuffleUsed ? 1 : 0;
  state.astralPending = !!snapshot.astralPending || snapshot.astralState === 'pending';

  if (snapshot.knownDeckTop) {
    state.knownDeckTop = snapshot.knownDeckTop.map((k) => pool.indexOf(k));
  }
  if (snapshot.knownDeckBottom) {
    state.knownDeckBottom = snapshot.knownDeckBottom.map((k) => pool.indexOf(k));
  }

  // Honor valid exact hand reveals (same public-count freshness rule as game/ai.js)
  const rev = snapshot.revealedHand;
  const odLen = (snapshot.overdrive || []).length;
  const sealedLen = (snapshot.sealedCards || []).length;
  if (
    rev &&
    rev.handCount === snapshot.handCount &&
    rev.deckCount === snapshot.deckCount &&
    rev.discardCount === snapshot.discard.length &&
    rev.gaugeCount === snapshot.gauge.length &&
    rev.boostsCount === snapshot.boostsInPlay.length &&
    (rev.overdriveCount == null || rev.overdriveCount === odLen) &&
    (rev.sealedCount == null || rev.sealedCount === sealedLen)
  ) {
    state.observeFullHandReveal(rev.keys);
  } else {
    state.assertInvariants();
  }

  return state;
}

// ===========================================================================
// Built-in Canonical Standard Normals & Ryu Decklist (exact game/cards.js data)
// ===========================================================================

const STANDARD_NORMALS_RAW: readonly RawExceedCardDef[] = Object.freeze([
  {
    key: 'assault',
    name: 'Assault',
    type: 'normal',
    range: [1, 1],
    pow: 4,
    spd: 5,
    arm: 0,
    grd: 0,
    text: 'Before: Close 2. Hit: Advantage.',
  },
  {
    key: 'block',
    name: 'Block',
    type: 'normal',
    range: null,
    pow: 0,
    spd: 0,
    arm: 2,
    grd: 3,
    alwaysMiss: true,
    text: 'When hit, spend any amount of Force for +2 Armor for each Force.',
  },
  {
    key: 'cross',
    name: 'Cross',
    type: 'normal',
    range: [1, 2],
    pow: 3,
    spd: 6,
    arm: 0,
    grd: 0,
    text: 'After: Retreat 3.',
  },
  {
    key: 'dive',
    name: 'Dive',
    type: 'normal',
    range: [1, 1],
    pow: 5,
    spd: 4,
    arm: 0,
    grd: 0,
    text: 'Before: Advance 3. If side swap, cannot be hit.',
  },
  {
    key: 'focus',
    name: 'Focus',
    type: 'normal',
    range: [1, 2],
    pow: 4,
    spd: 1,
    arm: 2,
    grd: 5,
    text: "Opponents can't move you. After: Draw 1.",
  },
  {
    key: 'grasp',
    name: 'Grasp',
    type: 'normal',
    range: [1, 1],
    pow: 3,
    spd: 7,
    arm: 0,
    grd: 0,
    text: 'Hit: Move opponent 1-2.',
  },
  {
    key: 'spike',
    name: 'Spike',
    type: 'normal',
    range: [2, 3],
    pow: 5,
    spd: 3,
    arm: 0,
    grd: 4,
    text: 'Ignore Guard, Armor.',
  },
  {
    key: 'sweep',
    name: 'Sweep',
    type: 'normal',
    range: [1, 3],
    pow: 6,
    spd: 2,
    arm: 0,
    grd: 6,
    text: 'Hit: Opponent discards 1 at random.',
  },
]);

const RYU_CHARACTER_RAW: RawExceedCharacterDef = Object.freeze<RawExceedCharacterDef>({
  key: 'ryu',
  name: 'Ryu',
  isStreetFighter: true,
  specials: [
    {
      key: 'donkey_kick',
      name: 'Donkey Kick',
      type: 'special',
      range: [1, 2],
      pow: 6,
      spd: 4,
      arm: 0,
      grd: 4,
      text: 'Hit: Push 2, Advantage.',
    },
    {
      key: 'hadoken_ryu',
      name: 'Hadoken',
      type: 'special',
      range: [3, 6],
      pow: 4,
      spd: 4,
      arm: 0,
      grd: 0,
      text: 'After: If you hit, you may return this card to the top of your Deck.',
    },
    {
      key: 'one_inch_punch',
      name: 'One Inch Punch',
      type: 'special',
      range: [1, 1],
      pow: 5,
      spd: 3,
      arm: 0,
      grd: 6,
      text: 'Ignore Armor. Hit: Push 3.',
    },
    {
      key: 'shoryuken_ryu',
      name: 'Shoryuken',
      type: 'special',
      range: [1, 1],
      pow: 4,
      spd: 5,
      arm: 0,
      grd: 0,
      text: 'If opponent initiated the Strike, +2 Speed.',
    },
    {
      key: 'tatsumaki_ryu',
      name: 'Tatsumaki Senpukyaku',
      type: 'special',
      range: [1, 2],
      pow: 5,
      spd: 3,
      arm: 0,
      grd: 4,
      text: 'Before: Advance 2. Hit: If you moved past the opponent this strike, Advantage.',
    },
    {
      key: 'metsu_hadoken',
      name: 'Metsu Hadoken',
      type: 'ultra',
      gaugeCost: 3,
      range: [3, 5],
      pow: 7,
      spd: 5,
      arm: 0,
      grd: 0,
      text: 'After: Move up to 2.',
    },
    {
      key: 'metsu_shoryuken',
      name: 'Metsu Shoryuken',
      type: 'ultra',
      gaugeCost: 4,
      range: [1, 1],
      pow: 7,
      spd: 5,
      arm: 0,
      grd: 0,
      text: 'If opponent initiated the Strike, +3 Speed.',
    },
  ],
});

/** Pre-built standard 30-card Ryu CardPool (exact match to game/cards.js). */
export const RYU_STANDARD_POOL: CardPool = buildCardPoolFromRawData(
  RYU_CHARACTER_RAW,
  STANDARD_NORMALS_RAW,
);

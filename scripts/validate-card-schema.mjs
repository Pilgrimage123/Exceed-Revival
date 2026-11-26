/**
 * Validates the 3-bucket card schema (ADR-0009) and character metadata in game/cards.js.
 */

export const ALLOWED_CARD_TOP_KEYS = new Set([
  'alwaysMiss',
  'arm',
  'boost',
  'boostText',
  'canInitiateFaceUp',
  'copies',
  'critical',
  'criticalText',
  'gaugeCost',
  'grd',
  'guardEqualsHandSize',
  'hooks',
  'isAstral',
  'keepsEddieOnCleanup',
  'key',
  'name',
  'neverLeavesPlay',
  'noHitWithoutContinuousBoost',
  'notes',
  'owner',
  'pow',
  'range',
  'rangeIncludeIfSideSwapped',
  'sealAfterUse',
  'spd',
  'spdPerGaugeCard',
  'text',
  'type',
]);

export const ALLOWED_CARD_HOOK_KEYS = new Set([
  'after',
  'afterInteractiveMove',
  'afterStunCheck',
  'armBonusIfDefending',
  'before',
  'blocksOpponentPassThrough',
  'dynamicRangeMaxBonus',
  'goesToGaugeEvenOnMiss',
  'hit',
  'hitImmuneToFasterAttacks',
  'ignoreArmor',
  'ignoreGuard',
  'interactiveAfter',
  'interactiveHit',
  'liveStatMods',
  'moveForceDirection',
  'moveMax',
  'moveMin',
  'movementImmune',
  'optionalForceSpendForPow',
  'optionalGaugeSpend',
  'optionalRetreat',
  'powBonusIfInitiating',
  'powBonusIfOwnContinuousBoost',
  'rangeImmuneRanges',
  'rangeMaxBonusIfInitiating',
  'selfArmorZero',
  'selfBoostAndSustainAfterHit',
  'spdBonusIfDefending',
  'spdBonusIfInitiating',
  'spdBonusPerRangeAtSetTime',
  'stunImmune',
]);

export const ALLOWED_CARD_CRITICAL_KEYS = new Set([
  'after',
  'before',
  'hit',
  'ignoreArmor',
  'ignoreGuard',
  'rangeImmuneRanges',
  'statMods',
  'stunImmune',
]);

export const ALLOWED_BOOST_KEYS = new Set([
  'advantageIfOpponentStunnedThisStrike',
  'blocksOpponentPassThrough',
  'bonusAction',
  'cancelable',
  'choice',
  'continuous',
  'drawIfOpponentStunnedThisStrike',
  'expireToGaugeAfterTurns',
  'expireToGaugeAtStartOfNextTurn',
  'force',
  'forcesFreeCritical',
  'forcesOpponentWildSwingOnInitiate',
  'grantsBeforeCloseWithBonus',
  'grantsBurstAction',
  'grantsNormalsBeforeAdvance',
  'ignoreArmor',
  'movementImmune',
  'nowClose',
  'nowDraw',
  'onHit',
  'opponentCannotMove',
  'opponentPowMod',
  'optionalForceSpend',
  'optionalForceSpendForPowOnHit',
  'rangeImmuneRanges',
  'rangeMaxBonus',
  'resolve',
  'statMods',
  'stunImmune',
  'sustainIfNoNormalUsed',
  'sustainIfNotStunned',
  'sustainIfNotStunnedCost',
  'toGaugeIfHitThisStrike',
  'toGaugeInstead',
  'triggersStrike',
]);

export const ALLOWED_BOOST_CHOICE_KINDS = new Set([
  'card_name',
  'normal_name',
  'range_name',
  'boost_target',
  'discard_boost',
  'push_pull',
  'direction',
  'eddie_space',
  'any_space',
  'deck_look',
]);

function validateCard(card, loc, errors) {
  if (!card || typeof card !== 'object') {
    errors.push(`${loc}: card is not an object`);
    return;
  }
  const id = `${loc} (${card.key || 'unknown'})`;

  for (const key of Object.keys(card)) {
    if (!ALLOWED_CARD_TOP_KEYS.has(key)) {
      errors.push(`${id}: disallowed or misplaced top-level key "${key}"`);
    }
  }

  if (card.hooks !== undefined) {
    if (!card.hooks || typeof card.hooks !== 'object' || Array.isArray(card.hooks)) {
      errors.push(`${id}: hooks must be an object`);
    } else {
      for (const key of Object.keys(card.hooks)) {
        if (!ALLOWED_CARD_HOOK_KEYS.has(key)) {
          errors.push(`${id}: disallowed hooks key "${key}"`);
        }
      }
    }
  }

  if (card.critical !== undefined) {
    if (!card.critical || typeof card.critical !== 'object' || Array.isArray(card.critical)) {
      errors.push(`${id}: critical must be an object`);
    } else {
      for (const key of Object.keys(card.critical)) {
        if (!ALLOWED_CARD_CRITICAL_KEYS.has(key)) {
          errors.push(`${id}: disallowed critical key "${key}"`);
        }
      }
    }
  }

  if (card.boost !== undefined) {
    if (!card.boost || typeof card.boost !== 'object' || Array.isArray(card.boost)) {
      errors.push(`${id}: boost must be an object`);
    } else {
      for (const key of Object.keys(card.boost)) {
        if (!ALLOWED_BOOST_KEYS.has(key)) {
          errors.push(`${id}: disallowed boost key "${key}"`);
        }
      }
      if (card.boost.drawIfOpponentStunnedThisStrike !== undefined) {
        const val = card.boost.drawIfOpponentStunnedThisStrike;
        if (!Number.isInteger(val) || val < 1) {
          errors.push(`${id}: boost.drawIfOpponentStunnedThisStrike must be a positive integer (got ${JSON.stringify(val)})`);
        }
      }
      if (card.boost.choice !== undefined) {
        const ch = card.boost.choice;
        if (!ch || typeof ch !== 'object' || Array.isArray(ch) || !ALLOWED_BOOST_CHOICE_KINDS.has(ch.kind)) {
          errors.push(`${id}: boost.choice must be { kind } with a valid kind (got ${JSON.stringify(ch)})`);
        }
      }
    }
  }
}

export function validateCardCatalog({ NORMALS, GG_NORMALS, CHARACTERS }) {
  const errors = [];
  if (!Array.isArray(NORMALS)) errors.push('NORMALS must be an array');
  else NORMALS.forEach((c, i) => validateCard(c, `NORMALS[${i}]`, errors));

  if (!Array.isArray(GG_NORMALS)) errors.push('GG_NORMALS must be an array');
  else GG_NORMALS.forEach((c, i) => validateCard(c, `GG_NORMALS[${i}]`, errors));

  if (!CHARACTERS || typeof CHARACTERS !== 'object') {
    errors.push('CHARACTERS must be an object');
  } else {
    for (const [charKey, charDef] of Object.entries(CHARACTERS)) {
      if (charDef.canGoFaceUp !== undefined && typeof charDef.canGoFaceUp !== 'function') {
        errors.push(`CHARACTERS.${charKey}.canGoFaceUp must be a function when present`);
      }
      if (!Array.isArray(charDef.specials)) {
        errors.push(`CHARACTERS.${charKey}.specials must be an array`);
      } else {
        charDef.specials.forEach((c, i) => validateCard(c, `CHARACTERS.${charKey}.specials[${i}]`, errors));
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

export function assertValidCardCatalog(catalog) {
  const { ok, errors } = validateCardCatalog(catalog);
  if (!ok) {
    throw new Error(`Card catalog schema validation failed (${errors.length} error(s)):\n- ${errors.slice(0, 20).join('\n- ')}`);
  }
}

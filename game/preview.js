// Pure, fog-of-war-safe Strike Preview Engine & Controller.
// Consumes solely Engine.prototype.getInformationSet(playerId) — never reads
// hidden opponent hand, deck order, or face-down strike cards.

const SimulateStrikePreview = (() => {
  let _cardIndex = null;
  function resolveCardByKey(key) {
    if (!key) return null;
    if (typeof CARD_BY_KEY !== 'undefined' && CARD_BY_KEY[key]) return CARD_BY_KEY[key];
    if (!_cardIndex) {
      _cardIndex = Object.create(null);
      if (typeof NORMALS !== 'undefined') for (const c of NORMALS) _cardIndex[c.key] = c;
      if (typeof GG_NORMALS !== 'undefined') for (const c of GG_NORMALS) _cardIndex[c.key] = c;
      if (typeof CHARACTERS !== 'undefined') {
        for (const ch of Object.values(CHARACTERS)) {
          if (ch && Array.isArray(ch.specials)) {
            for (const c of ch.specials) _cardIndex[c.key] = c;
          }
          if (ch && Array.isArray(ch.normals)) {
            for (const c of ch.normals) _cardIndex[c.key] = c;
          }
        }
      }
    }
    return _cardIndex[key] || null;
  }

  function forceValueOfCard(card) {
    return card && card.type === 'ultra' ? 2 : 1;
  }

  function readNumericBonus(val) {
    if (typeof val === 'number' && Number.isFinite(val)) return val;
    if (val && typeof val.max === 'number' && Number.isFinite(val.max)) return val.max;
    return 0;
  }

  function makeSimPlayer(pub, isActor, playedCardKey, isEX) {
    const boosts = (pub.boostKeys || []).map((k) => ({ card: resolveCardByKey(k) || { key: k, boost: {} } }));
    const gauge = (pub.gaugeKeys || []).map((k) => resolveCardByKey(k) || { key: k, type: 'normal' });
    let hand;
    if (isActor && Array.isArray(pub.handKeys)) {
      const keys = pub.handKeys.slice();
      if (playedCardKey) {
        let toRemove = isEX ? 2 : 1;
        for (let i = keys.length - 1; i >= 0 && toRemove > 0; i--) {
          if (keys[i] === playedCardKey) {
            keys.splice(i, 1);
            toRemove--;
          }
        }
      }
      hand = keys.map((k) => resolveCardByKey(k) || { key: k, type: 'normal' });
    } else {
      hand = new Array(pub.handCount || 0).fill({ key: '_hidden', type: 'normal' });
    }
    return {
      id: pub.id,
      name: pub.id === 'p1' ? 'You' : 'CPU',
      characterKey: pub.characterKey,
      life: pub.life,
      maxLife: pub.maxLife || 30,
      pos: pub.pos,
      eddiePos: pub.eddiePos != null ? pub.eddiePos : null,
      exceeded: !!pub.exceeded,
      advantage: !!pub.advantage,
      reshuffleUsed: !!pub.reshuffleUsed,
      hand,
      gauge,
      discard: (pub.discardKeys || []).map((k) => resolveCardByKey(k) || { key: k }),
      boostsInPlay: boosts,
      sealedCards: (pub.sealedKeys || []).map((k) => resolveCardByKey(k) || { key: k }),
      overdrive: (pub.overdriveKeys || []).map((k) => resolveCardByKey(k) || { key: k }),
      canceledThisTurn: isActor ? !!pub.canceledThisTurn : false,
      actionStrikeThisTurn: isActor ? !!pub.actionStrikeThisTurn : false,
      strikeState: {
        focusActive: false,
        rangeImmune: [],
        blocksOpponentPassThrough: false,
        unhittable: false,
        faceUp: false,
        setOptionStatMods: null,
        setOptionRangeBonus: 0,
        setOptionAfter: null,
        wasHit: false,
      },
    };
  }

  function computeVisibleBoostMods(pub) {
    if (pub && pub.activeBoostMods) return { ...pub.activeBoostMods };
    return { pow: 0, spd: 0, arm: 0, grd: 0, ignoreArmor: false, stunImmune: false };
  }

  function computeOppVisibleRangeImmunity(simOpp) {
    const out = [];
    for (const b of (simOpp.boostsInPlay || [])) {
      if (b.card && b.card.boost && Array.isArray(b.card.boost.rangeImmuneRanges)) {
        for (const r of b.card.boost.rangeImmuneRanges) {
          if (!out.includes(r)) out.push(r);
        }
      }
    }
    return out;
  }

  function hasFreeCriticalBoost(simMe) {
    return (simMe.boostsInPlay || []).some((b) => b.card && b.card.boost && b.card.boost.forcesFreeCritical);
  }

  function gaugeCostsAreFree(simMe) {
    const char = (typeof CHARACTERS !== 'undefined' && CHARACTERS[simMe.characterKey]) || {};
    return !!(char.gaugeCostsFree && char.gaugeCostsFree(simMe));
  }

  function buildEffectiveCard(card, isEX) {
    if (!card) return null;
    if (!isEX) return card;
    return {
      ...card,
      pow: (card.pow || 0) + 1,
      spd: (card.spd || 0) + 1,
      arm: (card.arm || 0) + 1,
      grd: (card.grd || 0) + 1,
      isEX: true,
    };
  }

  function computeEffectiveRange(simMe, simOpp, card, fakeEngine, isInitiator) {
    if (!card || !card.range) {
      return {
        minRange: null,
        maxRange: null,
        printedMinRange: null,
        printedMaxRange: null,
      };
    }
    const char = (typeof CHARACTERS !== 'undefined' && CHARACTERS[simMe.characterKey]) || {};
    const printedMin = card.range[0];
    const printedMax = card.range[1];
    let maxR = printedMax;

    if (card.hooks && card.hooks.rangeMaxBonusIfInitiating && isInitiator) {
      maxR += card.hooks.rangeMaxBonusIfInitiating;
    }
    for (const b of (simMe.boostsInPlay || [])) {
      if (b.card && b.card.boost && b.card.boost.rangeMaxBonus) {
        maxR += b.card.boost.rangeMaxBonus;
      }
    }
    if (card.type === 'normal' && char.normalsRangeBonus) {
      maxR += readNumericBonus(char.normalsRangeBonus(simMe));
    }
    if (char.attackRangeBonus) {
      maxR += readNumericBonus(char.attackRangeBonus(simMe, card));
    }
    if (simMe.strikeState && simMe.strikeState.setOptionRangeBonus) {
      maxR += simMe.strikeState.setOptionRangeBonus;
    }
    if (card.hooks && card.hooks.dynamicRangeMaxBonus) {
      maxR += readNumericBonus(card.hooks.dynamicRangeMaxBonus(simMe, simOpp, fakeEngine, isInitiator));
    }

    return {
      minRange: printedMin,
      maxRange: maxR,
      printedMinRange: printedMin,
      printedMaxRange: printedMax,
    };
  }

  function computeVisibleStats(simMe, simOpp, mePub, oppPub, card, opts = {}) {
    const mods = computeVisibleBoostMods(mePub);
    const oppMods = computeVisibleBoostMods(oppPub);
    const char = (typeof CHARACTERS !== 'undefined' && CHARACTERS[simMe.characterKey]) || {};
    const initiator = opts.isInitiator !== false;
    const distNow = Math.abs(simMe.pos - simOpp.pos);
    const criticalActive = !!opts.criticalActive;

    const cm = { ...((criticalActive && card.critical && card.critical.statMods) || {}) };
    if (criticalActive && opts.fromWildSwing && char.wildSwingCriticalStatMods) {
      const b = char.wildSwingCriticalStatMods(simMe) || {};
      cm.pow = (cm.pow || 0) + (b.pow || 0);
      cm.spd = (cm.spd || 0) + (b.spd || 0);
    }
    if (criticalActive && char.extraCriticalStatsIfOpponentAtRange1 && distNow === 1) {
      const b = char.extraCriticalStatsIfOpponentAtRange1(simMe) || {};
      cm.pow = (cm.pow || 0) + (b.pow || 0);
      cm.spd = (cm.spd || 0) + (b.spd || 0);
    }
    if (criticalActive && char.grantsMutualCriticalPow) {
      const b = char.grantsMutualCriticalPow(simMe) || {};
      cm.pow = (cm.pow || 0) + (b.pow || 0);
    }

    const nsm = (card.type === 'normal' && char.normalsStatMods) ? (char.normalsStatMods(simMe) || {}) : {};
    const isAtEdge = simMe.pos === 0 || simMe.pos === BOARD_SIZE - 1;
    const esm = (card.type !== 'normal' && char.specialsUltrasStatModsIfAtEdge && isAtEdge)
      ? (char.specialsUltrasStatModsIfAtEdge(simMe) || {}) : {};
    const rcb = (char.rangeConditionalStatBonus && initiator && distNow === 1)
      ? (char.rangeConditionalStatBonus(simMe) || {}) : {};
    const wsm = (opts.fromWildSwing && char.wildSwingStatMods && simMe.exceeded)
      ? (char.wildSwingStatMods(simMe) || {}) : {};
    const cancelBonus = (char.powBonusIfCanceledThisTurn && simMe.canceledThisTurn)
      ? (char.powBonusIfCanceledThisTurn(simMe) || 0) : 0;
    const actionStrikeBonus = (char.actionStrikePowBonus && simMe.actionStrikeThisTurn && simMe.exceeded)
      ? (char.actionStrikePowBonus || 0) : 0;

    let oppPowDebuff = 0;
    for (const b of simOpp.boostsInPlay) {
      if (b.card && b.card.boost && b.card.boost.opponentPowMod) oppPowDebuff += b.card.boost.opponentPowMod;
    }

    const rangeSpdBonus = (card.hooks && card.hooks.spdBonusPerRangeAtSetTime) ? distNow : 0;
    const gaugeSpdBonus = card.spdPerGaugeCard ? simMe.gauge.length : 0;

    const fakeEngine = {
      BOARD_SIZE,
      range: (a, b) => Math.abs(a.pos - b.pos),
      isAtEdge: (p) => p.pos === 0 || p.pos === BOARD_SIZE - 1,
      gaugeCount: (p) => p.gauge.length,
      activeBoostMods: (p) => (p.id === simMe.id ? mods : oppMods),
    };

    const asm = char.attackStatMods
      ? (char.attackStatMods(simMe, card, { initiator, fromWildSwing: !!opts.fromWildSwing, dist: distNow }) || {})
      : {};
    const cdm = (card.hooks && card.hooks.liveStatMods)
      ? (card.hooks.liveStatMods(simMe, simOpp, fakeEngine, { initiator, fromWildSwing: !!opts.fromWildSwing, dist: distNow }) || {})
      : {};

    const printedPow = card.pow || 0;
    const printedSpd = card.spd || 0;
    const printedArm = card.arm || 0;
    const printedGrd = card.guardEqualsHandSize ? simMe.hand.length : (card.grd || 0);

    const statTotal = {
      pow: printedPow,
      spd: printedSpd,
      arm: printedArm,
      grd: printedGrd,
    };
    const addMods = (m) => {
      if (!m) return;
      statTotal.pow += m.pow || 0;
      statTotal.spd += m.spd || 0;
      statTotal.arm += m.arm || 0;
      statTotal.grd += m.grd || 0;
    };
    for (const m of [cdm, mods, cm, nsm, esm, wsm, rcb, asm]) addMods(m);
    statTotal.pow += cancelBonus + actionStrikeBonus + oppPowDebuff;
    statTotal.spd += rangeSpdBonus + gaugeSpdBonus;

    if (card.hooks) {
      if (card.hooks.spdBonusIfDefending && !initiator) statTotal.spd += card.hooks.spdBonusIfDefending;
      if (card.hooks.spdBonusIfInitiating && initiator) statTotal.spd += card.hooks.spdBonusIfInitiating;
      if (card.hooks.powBonusIfInitiating && initiator) statTotal.pow += card.hooks.powBonusIfInitiating;
      if (card.hooks.armBonusIfDefending && !initiator) statTotal.arm += card.hooks.armBonusIfDefending;
    }
    if (card.hooks && card.hooks.selfArmorZero) statTotal.arm = 0;

    const rangeInfo = computeEffectiveRange(simMe, simOpp, card, fakeEngine, initiator);
    const oppRangeImmune = computeOppVisibleRangeImmunity(simOpp);

    return {
      pow: statTotal.pow,
      spd: statTotal.spd,
      arm: statTotal.arm,
      grd: statTotal.grd,
      printedPow,
      printedSpd,
      printedArm,
      printedGrd,
      minRange: rangeInfo.minRange,
      maxRange: rangeInfo.maxRange,
      printedMinRange: rangeInfo.printedMinRange,
      printedMaxRange: rangeInfo.printedMaxRange,
      ignoreArmor: !!(card.hooks && card.hooks.ignoreArmor) || !!mods.ignoreArmor || !!(criticalActive && card.critical && card.critical.ignoreArmor),
      ignoreGuard: !!(card.hooks && card.hooks.ignoreGuard) || !!(criticalActive && card.critical && card.critical.ignoreGuard),
      oppVisibleArm: oppMods.arm || 0,
      oppVisibleGrd: oppMods.grd || 0,
      oppStunImmune: !!oppMods.stunImmune,
      oppRangeImmune,
    };
  }

  function maxAffordableHandForce(simMe, maxWanted) {
    const cap = Math.max(0, maxWanted | 0);
    if (cap <= 0 || !simMe || !Array.isArray(simMe.hand)) return 0;
    const byCost = [...simMe.hand].sort((a, b) =>
      (forceValueOfCard(a) - forceValueOfCard(b)) || ((a.pow || 0) - (b.pow || 0)));
    let spent = 0;
    for (const c of byCost) {
      const v = forceValueOfCard(c);
      if (spent + v > cap) continue;
      spent += v;
      if (spent >= cap) break;
    }
    return spent;
  }

  function detectOptionalBranches(card, simMe) {
    const branches = [];
    if (!card) return branches;
    const hooks = card.hooks || {};
    if (hooks.optionalRetreat) {
      branches.push({ id: 'optionalRetreat', type: 'before', label: `Retreat ${hooks.optionalRetreat}` });
    }
    const forceSpecs = [];
    if (hooks.optionalForceSpendForPow) forceSpecs.push(hooks.optionalForceSpendForPow);
    if (hooks.optionalForceSpendPow) {
      forceSpecs.push({ max: hooks.optionalForceSpendPow.force || 1, powPerForce: hooks.optionalForceSpendPow.pow || 1 });
    }
    for (const b of (simMe.boostsInPlay || [])) {
      if (b.card && b.card.boost && b.card.boost.optionalForceSpendForPowOnHit) {
        forceSpecs.push(b.card.boost.optionalForceSpendForPowOnHit);
      }
    }
    if (forceSpecs.length > 0) {
      let totalForce = 0;
      let totalPow = 0;
      for (const spec of forceSpecs) {
        const spendable = maxAffordableHandForce(simMe, spec.max || 1);
        totalForce += spendable;
        totalPow += spendable * (spec.powPerForce || 1);
      }
      if (totalForce > 0) {
        branches.push({
          id: 'optionalForceSpendForPow',
          type: 'hit',
          label: `+${totalPow} POW (${totalForce} Force)`,
          force: totalForce,
          pow: totalPow,
        });
      }
    }
    if (hooks.optionalGaugeSpend) {
      const g = hooks.optionalGaugeSpend;
      const amt = g.amount != null ? g.amount : (g.gauge || 1);
      if (simMe.gauge.length >= amt) {
        const benefit = g.grantsAdvantage ? 'Advantage' : 'Effect';
        branches.push({
          id: 'optionalGaugeSpend',
          type: 'hit',
          label: g.label || `${benefit} (${amt} Gauge)`,
          amount: amt,
          grantsAdvantage: !!g.grantsAdvantage,
        });
      }
    }
    return branches;
  }

  function computeHitboxSpaces(sourcePos, minR, maxR, card) {
    if (!card || card.alwaysMiss || minR == null || maxR == null) return [];
    const spaces = [];
    for (let s = 0; s < BOARD_SIZE; s++) {
      const d = Math.abs(s - sourcePos);
      if (d >= minR && d <= maxR) spaces.push(s);
    }
    return spaces;
  }

  function formatRangeBand(minR, maxR) {
    if (minR == null || maxR == null) return '—';
    return minR === maxR ? `${minR}` : `${minR}–${maxR}`;
  }

  function formatMoveLabel(startPos, endPos, kindLabel, didCrossUp, wallTruncated, blocked, capped) {
    if (blocked) return 'Blocked (Cannot Move)';
    const delta = Math.abs(endPos - startPos);
    if (delta === 0) {
      if (wallTruncated) return `Wall Stop (Sp ${startPos + 1})`;
      return null;
    }
    const notes = [];
    if (didCrossUp) notes.push('Cross-Up ⇄');
    if (capped) notes.push('Capped');
    if (wallTruncated) notes.push('Wall');
    const suffix = notes.length ? ` · ${notes.join(', ')}` : '';
    return `${kindLabel} (Sp ${startPos + 1}→${endPos + 1}${suffix})`;
  }

  function run(infoSet, rawCard, opts = {}) {
    if (!infoSet || !infoSet.actor || !infoSet.opponent) return null;
    const isEX = !!opts.isEX;
    const isInitiator = opts.isInitiator !== false;
    const useOptionalBranch = !!opts.useOptionalBranch;
    const mePub = infoSet.actor;
    const oppPub = infoSet.opponent;

    // Wild Swing or missing card is purely stochastic
    if (!rawCard || rawCard.isWildSwing) {
      const oppMods = computeVisibleBoostMods(oppPub);
      const startPos = mePub.pos;
      const oppStartPos = oppPub.pos;
      const initialDist = Math.abs(startPos - oppStartPos);
      return {
        cardKey: 'wild_swing',
        cardName: 'Wild Swing',
        cardType: 'wild_swing',
        isEX: false,
        isInitiator,
        criticalActive: false,
        criticalFree: false,
        canPreviewCritical: false,
        effectiveStats: {
          pow: '?', spd: '?', arm: '?', grd: '?',
          printedPow: '?', printedSpd: '?', printedArm: '?', printedGrd: '?',
          minRange: null, maxRange: null, printedMinRange: null, printedMaxRange: null,
          ignoreArmor: false, ignoreGuard: false,
          oppVisibleArm: oppMods.arm || 0, oppVisibleGrd: oppMods.grd || 0,
          oppStunImmune: !!oppMods.stunImmune, oppRangeImmune: [],
        },
        startSpace: startPos,
        oppStartSpace: oppStartPos,
        initialDist,
        movementPath: [startPos],
        postBeforeSpace: startPos,
        beforeMoveSummary: null,
        didCrossUp: false,
        wallTruncated: false,
        moveBlockedByBoost: false,
        moveCappedByInnate: false,
        attackOrigin: startPos,
        usesEddie: false,
        postBeforeDist: initialDist,
        hitboxSpaces: [],
        willWhiff: false,
        expectedHit: false,
        missReason: null,
        missReasonLabel: null,
        hitBySideSwap: false,
        hitByBeforeMove: false,
        projectedDamage: 0,
        damageFormula: '? (Top of Deck)',
        oppLifeBefore: oppPub.life,
        oppLifeAfter: oppPub.life,
        oppLifeLoss: 0,
        selfLifeBefore: mePub.life,
        selfLifeAfter: mePub.life,
        selfLifeDelta: 0,
        isPublicStateLethal: false,
        breaksVisibleGuard: false,
        oppPostHitSpace: null,
        oppHitMovePath: null,
        oppHitMoveSummary: null,
        postAfterSpace: null,
        afterPath: null,
        afterMoveSummary: null,
        effectsSummary: ['Random top card of deck'],
        hasStochasticVariance: true,
        optionalBranches: [],
      };
    }

    const simMe = makeSimPlayer(mePub, true, rawCard.key, isEX);
    const simOpp = makeSimPlayer(oppPub, false, null, false);
    const card = buildEffectiveCard(rawCard, isEX);
    const char = (typeof CHARACTERS !== 'undefined' && CHARACTERS[simMe.characterKey]) || {};
    const initialDist = Math.abs(simMe.pos - simOpp.pos);

    const ultraCost = (card.type === 'ultra' && !gaugeCostsAreFree(simMe)) ? (card.gaugeCost || 0) : 0;
    const availableGaugeForCrit = Math.max(0, simMe.gauge.length - ultraCost);
    const rawHandCount = Array.isArray(mePub.handKeys) ? mePub.handKeys.filter(k => k === rawCard.key).length : 0;
    const invalidStrikeCard = !!(char && char.invalidStrikeCard && char.invalidStrikeCard(simMe, rawCard));
    const canPreviewEX = !invalidStrikeCard && rawHandCount >= 2 && (rawCard.type !== 'ultra' || simMe.gauge.length >= ultraCost);
    const criticalFree = hasFreeCriticalBoost(simMe);
    const hasCritEffect = !!(
      card.critical ||
      (char.extraCriticalStatsIfOpponentAtRange1 && initialDist === 1) ||
      char.grantsMutualCriticalPow
    );
    const canPreviewCritical = !criticalFree && !!char.isStreetFighter && availableGaugeForCrit >= 1 && hasCritEffect;
    const criticalActive = criticalFree || (!!opts.criticalPaid && !!char.isStreetFighter && availableGaugeForCrit >= 1);

    const stats = computeVisibleStats(simMe, simOpp, mePub, oppPub, card, {
      ...opts,
      isInitiator,
      criticalActive,
    });
    const optionalBranches = detectOptionalBranches(card, simMe);

    let hasStochasticVariance = !!(
      (card.hooks && (card.hooks.wildSwing || card.hooks.stochastic)) ||
      card.type === 'wild_swing'
    );

    const startPos = simMe.pos;
    const oppStartPos = simOpp.pos;
    const movementPath = [startPos];
    let didCrossUp = false;
    let wallTruncated = false;
    let moveBlockedByBoost = false;
    let moveCappedByInnate = false;
    let beforeMoveKind = null;
    let beforeMoveReq = 0;
    let powBonus = 0;

    let oppPostHitSpace = null;
    let oppHitMovePath = null;
    let oppHitMoveKind = null;
    let oppHitMoveAmt = 0;
    let oppHitWall = false;

    const effectsSet = new Set();
    let totalDraws = 0;
    let oppDiscards = 0;

    const isPushPullImmune = (target) => {
      if (target.strikeState && target.strikeState.focusActive) return true;
      return (target.boostsInPlay || []).some((b) => b.card && b.card.boost && b.card.boost.movementImmune);
    };

    const cappedSelfMove = (mover, opponent, amount, forced) => {
      if (forced) return amount;
      for (const b of (opponent.boostsInPlay || [])) {
        if (b.card && b.card.boost && b.card.boost.opponentCannotMove) {
          if (mover.id === simMe.id) moveBlockedByBoost = true;
          return 0;
        }
      }
      const mChar = (typeof CHARACTERS !== 'undefined' && CHARACTERS[mover.characterKey]) || {};
      if (!mChar.selfMoveCap) return amount;
      const cap = mChar.selfMoveCap(mover);
      if (cap != null && amount >= cap.threshold) {
        if (mover.id === simMe.id) moveCappedByInnate = true;
        return cap.instead;
      }
      return amount;
    };

    const applyBeforeMove = (amount, mode) => {
      const cappedAmt = cappedSelfMove(simMe, simOpp, amount, false);
      if (!beforeMoveKind && amount > 0) {
        beforeMoveKind = mode === 'advance' ? 'Advance' : (mode === 'close' ? 'Close' : 'Retreat');
        beforeMoveReq = amount;
      }
      const res = Engine.simulateMovementPath(simMe.pos, simOpp.pos, cappedAmt, mode, {});
      if (res.path.length > 1) {
        for (let i = 1; i < res.path.length; i++) movementPath.push(res.path[i]);
      }
      const prev = simMe.pos;
      simMe.pos = res.endSpace;
      if (res.didCrossUp) didCrossUp = true;
      if (res.wallTruncated) wallTruncated = true;
      return Math.abs(res.endSpace - prev);
    };

    const applyOppHitMove = (target, sourcePos, amount, mode) => {
      if (target.id !== simOpp.id) return 0;
      if (isPushPullImmune(target)) {
        effectsSet.add('CPU Push/Pull Immune');
        return 0;
      }
      const prev = target.pos;
      let res;
      if (mode === 'push') {
        const dir = sourcePos <= target.pos ? 1 : -1;
        const clamped = Math.max(0, Math.min(BOARD_SIZE - 1, target.pos + dir * amount));
        const path = [prev];
        if (clamped !== prev) {
          const step = clamped > prev ? 1 : -1;
          for (let p = prev + step; step > 0 ? p <= clamped : p >= clamped; p += step) path.push(p);
        }
        res = {
          path,
          endSpace: clamped,
          wallTruncated: Math.abs(clamped - prev) < amount,
        };
      } else {
        // Pull toward sourcePos: 'pull_pass' (pushToward) or 'pull_nopass' (pullTowardWithoutPassing)
        res = Engine.simulateMovementPath(target.pos, sourcePos, amount, mode === 'pull_pass' ? 'advance' : 'close', {});
      }
      target.pos = res.endSpace;
      if (!oppHitMovePath) oppHitMovePath = [oppStartPos];
      if (res.path.length > 1) {
        for (let i = 1; i < res.path.length; i++) oppHitMovePath.push(res.path[i]);
      }
      if (target.pos !== oppStartPos) oppPostHitSpace = target.pos;
      if (!oppHitMoveKind) {
        oppHitMoveKind = mode === 'push' ? 'Push CPU' : 'Pull CPU';
        oppHitMoveAmt = amount;
      }
      if (res.wallTruncated) oppHitWall = true;
      return Math.abs(target.pos - prev);
    };

    const attackSourcePosOf = (attacker, c) => {
      const aChar = (typeof CHARACTERS !== 'undefined' && CHARACTERS[attacker.characterKey]) || {};
      if (aChar.specialsRangeFromEddie && aChar.usesEddie && attacker.eddiePos != null && c && (c.type === 'special' || c.type === 'ultra')) {
        return attacker.eddiePos;
      }
      return attacker.pos;
    };

    const makeSimEngine = (moveHandlers) => ({
      BOARD_SIZE,
      spaceWord: (n) => `${n} space${n === 1 ? '' : 's'}`,
      range: (a, b) => Math.abs(a.pos - b.pos),
      isAtEdge: (p) => p.pos === 0 || p.pos === BOARD_SIZE - 1,
      gaugeCount: (p) => (p && p.gauge ? p.gauge.length : 0),
      eddieInPlay: (p) => {
        const pChar = (typeof CHARACTERS !== 'undefined' && CHARACTERS[p.characterKey]) || {};
        return !!(pChar.usesEddie && p.eddiePos != null);
      },
      attackSourcePos: (a, c) => attackSourcePosOf(a, c),
      attackRange: (a, d, c) => Math.abs(attackSourcePosOf(a, c) - d.pos),
      spacesBehindAwayFrom: (target, source) => {
        const dir = source.pos <= target.pos ? 1 : -1;
        return dir === 1 ? (BOARD_SIZE - 1 - target.pos) : target.pos;
      },
      activeBoostMods: (p) => (p.id === simMe.id ? computeVisibleBoostMods(mePub) : computeVisibleBoostMods(oppPub)),
      forceValueOfCard,
      advanceSelf: (m, o, amt, allowPass, forced) => moveHandlers.advanceSelf(m, o, amt, allowPass, forced),
      closeSelf: (m, o, amt) => moveHandlers.closeSelf(m, o, amt),
      retreatSelf: (m, o, amt) => moveHandlers.retreatSelf(m, o, amt),
      advanceAsFarAsPossible: (m, o) => moveHandlers.advanceSelf(m, o, BOARD_SIZE, true, false),
      moveChoice: (m, amt) => moveHandlers.advanceSelf(m, m.id === simMe.id ? simOpp : simMe, amt, true, false),
      pushAway: (target, source, amt) => moveHandlers.pushAway(target, source, amt),
      pushAwayFromAttackSource: (a, d, c, amt) => moveHandlers.pushAway(d, { pos: attackSourcePosOf(a, c) }, amt),
      pushToward: (target, source, amt) => moveHandlers.pushToward(target, source, amt),
      pullTowardWithoutPassing: (target, source, amt) => moveHandlers.pullNoPass(target, source, amt),
      gainLife: (p, amt) => {
        if (!p || !amt) return 0;
        const before = p.life;
        p.life = Math.min(p.maxLife, p.life + amt);
        return p.life - before;
      },
      takeDamageNonLethal: (p, amt) => {
        if (!p || !amt) return;
        p.life = Math.max(1, p.life - amt);
      },
      grantAdvantage: (p) => {
        if (p && p.id === simMe.id) effectsSet.add('+Advantage');
      },
      draw: (p, n) => {
        if (p && p.id === simMe.id) totalDraws += (n || 1);
      },
      randomDiscardFromHand: (p, n) => {
        if (p && p.id === simOpp.id) oppDiscards += (n || 1);
      },
      discardAllHand: (p) => {
        if (p && p.id === simOpp.id) effectsSet.add('CPU discards hand');
        if (p && p.id === simMe.id) effectsSet.add('You discard hand');
      },
      discardFromHand: () => null,
      sealCardFromHand: () => null,
      spendGaugeIfAble: (p, n) => {
        if (!p || p.gauge.length < n) return false;
        p.gauge.splice(p.gauge.length - n, n);
        return true;
      },
      addLowestCardFromHandToGauge: () => null,
      discardOpponentContinuousBoost: () => { effectsSet.add('Discard CPU boost'); },
      reviveBestContinuousBoostFromDiscard: () => null,
      placeEddie: () => 0,
      setReading: () => {},
      recordHandReveal: () => {},
      peekTopN: () => [],
      playForcedBoost: () => {},
      logMsg: () => {},
    });

    const beforeEngine = makeSimEngine({
      advanceSelf: (m, o, amt, allowPass) => { if (m.id === simMe.id) applyBeforeMove(amt, allowPass ? 'advance' : 'close'); },
      closeSelf: (m, o, amt) => { if (m.id === simMe.id) applyBeforeMove(amt, 'close'); },
      retreatSelf: (m, o, amt) => { if (m.id === simMe.id) applyBeforeMove(amt, 'retreat'); },
      pushAway: () => {},
      pushToward: () => {},
      pullNoPass: () => {},
    });

    const simCtx = {
      engine: beforeEngine,
      attacker: simMe,
      defender: simOpp,
      attackerCard: card,
      defenderCard: null,
      strikeInitiator: isInitiator ? simMe : simOpp,
      sideSwapped: false,
      powBonus: 0,
      ignoreGuardThisHit: false,
      hitLanded: false,
      selfCannotHit: false,
      criticalPaid: criticalActive,
      attStats: stats,
      defStats: { pow: 0, spd: 0, arm: stats.oppVisibleArm, grd: stats.oppVisibleGrd },
      advance: (amt) => applyBeforeMove(amt, 'advance'),
      close: (amt) => applyBeforeMove(amt, 'close'),
      retreat: (amt) => applyBeforeMove(amt, 'retreat'),
      push: () => {},
      pull: () => {},
    };

    // 1. Boost-granted Before movement
    for (const b of simMe.boostsInPlay) {
      const bonus = b.card && b.card.boost && b.card.boost.grantsNormalsBeforeAdvance;
      if (bonus && card.type === 'normal') {
        const beforeSide = simMe.pos < simOpp.pos;
        applyBeforeMove(bonus, 'advance');
        if (beforeSide !== (simMe.pos < simOpp.pos)) simCtx.sideSwapped = true;
      }
      const closeBonus = b.card && b.card.boost && b.card.boost.grantsBeforeCloseWithBonus;
      if (closeBonus) {
        const moved = applyBeforeMove(closeBonus.amount, 'close');
        if (moved < closeBonus.amount) powBonus += closeBonus.pow || 0;
      }
    }

    // 2. Character Before hook
    if (char.attackBeforeHook) {
      try {
        char.attackBeforeHook(simCtx, { initiator: isInitiator, fromWildSwing: !!opts.fromWildSwing });
      } catch (_) {}
    }

    // 3. Card Before hook & Critical Before hook
    if (card.hooks && card.hooks.before) {
      try {
        card.hooks.before(simCtx);
      } catch (_) {}
    }
    if (criticalActive && card.critical && card.critical.before) {
      try {
        card.critical.before(simCtx);
      } catch (_) {}
    }

    // 4. Optional Before branch (when toggled on)
    if (useOptionalBranch && card.hooks && card.hooks.optionalRetreat) {
      applyBeforeMove(card.hooks.optionalRetreat, 'retreat');
    }

    if (simCtx.sideSwapped) didCrossUp = true;
    const postBeforeSpace = simMe.pos;
    if (simMe.strikeState.unhittable) effectsSet.add('Unhittable (Cross-Up)');

    // 5. Range & Hit validation (Zato-1 Specials/Ultras measure from Eddie if in play)
    const usesEddie = !!(char.specialsRangeFromEddie && char.usesEddie && simMe.eddiePos != null && (card.type === 'special' || card.type === 'ultra'));
    const attackOrigin = usesEddie ? simMe.eddiePos : postBeforeSpace;
    const postBeforeDist = Math.abs(attackOrigin - simOpp.pos);

    const hitboxSpaces = computeHitboxSpaces(attackOrigin, stats.minRange, stats.maxRange, card);
    const passiveRangeInclude = !!(char.sideSwapRangeInclude && didCrossUp) || !!(card.rangeIncludeIfSideSwapped && didCrossUp);
    const burstTimeBlocked = !!(card.noHitWithoutContinuousBoost && simMe.boostsInPlay.length === 0);
    const rangeImmune = stats.oppRangeImmune.includes(postBeforeDist);

    const inPrintedOrBonusBand = !!(stats.minRange != null && stats.maxRange != null && postBeforeDist >= stats.minRange && postBeforeDist <= stats.maxRange);
    const hitBySideSwap = !inPrintedOrBonusBand && passiveRangeInclude;
    if (hitBySideSwap && !hitboxSpaces.includes(simOpp.pos)) {
      hitboxSpaces.push(simOpp.pos);
    }

    let missReason = null;
    let missReasonLabel = null;
    if (card.alwaysMiss) {
      missReason = 'always_miss';
      missReasonLabel = 'Cannot Hit (Defense/Utility)';
    } else if (burstTimeBlocked) {
      missReason = 'no_continuous_boost';
      missReasonLabel = 'Needs Continuous Boost';
    } else if (simCtx.selfCannotHit) {
      missReason = 'self_cannot_hit';
      missReasonLabel = 'Crossed Past (Cannot Hit)';
    } else if (rangeImmune) {
      missReason = 'range_immune';
      missReasonLabel = `CPU Range Immune at Rng ${postBeforeDist}`;
    } else if (!inPrintedOrBonusBand && !passiveRangeInclude) {
      missReason = 'out_of_range';
      missReasonLabel = `Out of Range (Dist ${postBeforeDist} vs Rng ${formatRangeBand(stats.minRange, stats.maxRange)})`;
    }
    const willWhiff = missReason !== null;

    const initialOrigin = usesEddie ? simMe.eddiePos : startPos;
    const initialOriginDist = Math.abs(initialOrigin - oppStartPos);
    const initiallyInRange = !!(stats.minRange != null && stats.maxRange != null && initialOriginDist >= stats.minRange && initialOriginDist <= stats.maxRange);
    const hitByBeforeMove = !willWhiff && !initiallyInRange && (postBeforeSpace !== startPos || hitBySideSwap);

    // 6. Hit hooks (only when expected to connect) — runs BEFORE damage math in engine.js
    const hitEngine = makeSimEngine({
      advanceSelf: (m, o, amt, allowPass) => {
        if (m.id === simOpp.id) applyOppHitMove(m, o.pos, amt, allowPass ? 'pull_pass' : 'pull_nopass');
      },
      closeSelf: (m, o, amt) => {
        if (m.id === simOpp.id) applyOppHitMove(m, o.pos, amt, 'pull_nopass');
      },
      retreatSelf: () => {},
      pushAway: (target, source, amt) => applyOppHitMove(target, source.pos, amt, 'push'),
      pushToward: (target, source, amt) => applyOppHitMove(target, source.pos, amt, 'pull_pass'),
      pullNoPass: (target, source, amt) => applyOppHitMove(target, source.pos, amt, 'pull_nopass'),
    });

    if (!willWhiff) {
      const hitCtx = {
        ...simCtx,
        engine: hitEngine,
        hitLanded: true,
        push: (amt) => applyOppHitMove(simOpp, simMe.pos, amt, 'push'),
        pull: (amt) => applyOppHitMove(simOpp, simMe.pos, amt, 'pull_pass'),
      };

      if (card.hooks && card.hooks.interactiveHit === 'grasp_move') {
        const mMin = card.hooks.moveMin != null ? card.hooks.moveMin : 1;
        const mMax = card.hooks.moveMax != null ? card.hooks.moveMax : 2;
        const forceDir = card.hooks.moveForceDirection || null;
        if (forceDir && mMin === mMax) {
          const moved = applyOppHitMove(simOpp, simMe.pos, mMax, forceDir === 'advance' ? 'pull_pass' : 'push');
          if (card.hooks.afterInteractiveMove) {
            try { card.hooks.afterInteractiveMove(hitCtx, moved); } catch (_) {}
          }
        } else {
          const dirText = forceDir === 'advance' ? 'Pull' : (forceDir === 'retreat' ? 'Push' : 'Push/Pull');
          const rangeTxt = mMin === mMax ? `${mMax}` : `${mMin}–${mMax}`;
          oppHitMoveKind = `${dirText} CPU ${rangeTxt} (Choice)`;
          effectsSet.add(`${dirText} CPU ${rangeTxt} (Choice)`);
        }
      } else if (card.hooks && card.hooks.hit) {
        try { card.hooks.hit(hitCtx); } catch (_) {}
      }

      if (criticalActive && card.critical && card.critical.hit) {
        try { card.critical.hit(hitCtx); } catch (_) {}
      }

      if (simMe.exceeded && didCrossUp && char.exceededSideSwapHit) {
        try { char.exceededSideSwapHit(hitCtx); } catch (_) {}
      }

      // Safely step generator character hit hooks (e.g. Ragna life gain, Zato-1 Advantage, Testament choice)
      const stepHitGenerator = (genFn) => {
        try {
          const gen = genFn(hitCtx);
          if (gen && typeof gen.next === 'function') {
            const step = gen.next();
            if (!step.done && step.value && step.value.type === 'grasp_move') {
              effectsSet.add('Push/Pull 1 (Choice)');
            }
          }
        } catch (_) {}
      };
      if (card.type === 'normal' && char.normalsHitHook) stepHitGenerator(char.normalsHitHook);
      if (char.attackHitHook) stepHitGenerator(char.attackHitHook);
      if (simMe.actionStrikeThisTurn && char.actionStrikeHitHook) {
        try { char.actionStrikeHitHook(hitCtx); } catch (_) {}
      }

      for (const b of simMe.boostsInPlay) {
        if (b.card && b.card.boost && b.card.boost.onHit) {
          try { b.card.boost.onHit({ engine: hitEngine, player: simMe, opponent: simOpp }); } catch (_) {}
        }
      }

      // Optional Hit branches (when toggled on)
      if (useOptionalBranch) {
        const forceBranch = optionalBranches.find((b) => b.id === 'optionalForceSpendForPow');
        if (forceBranch) powBonus += forceBranch.pow || 0;
        const gaugeBranch = optionalBranches.find((b) => b.id === 'optionalGaugeSpend');
        if (gaugeBranch && gaugeBranch.grantsAdvantage) effectsSet.add('+Advantage (Gauge)');
      }

      simCtx.powBonus = hitCtx.powBonus;
      simCtx.ignoreGuardThisHit = hitCtx.ignoreGuardThisHit;
    }

    // Finalize effective POW & ignore flags after Before + Hit hooks
    stats.pow += powBonus + (simCtx.powBonus || 0);
    if (simCtx.ignoreGuardThisHit) stats.ignoreGuard = true;
    if (stats.ignoreArmor) effectsSet.add('Ignores ARM');
    if (stats.ignoreGuard) effectsSet.add('Ignores GRD');

    // 7. Projected damage, Life Loss, Guard Break, & Public-State Lethal
    const effectiveOppArmor = stats.ignoreArmor ? 0 : stats.oppVisibleArm;
    const effectiveOppGuard = stats.ignoreGuard ? 0 : stats.oppVisibleGrd;
    const projectedDamage = willWhiff ? 0 : Math.max(0, stats.pow - effectiveOppArmor);
    const oppLifeBefore = oppPub.life;
    const oppLifeAfter = Math.max(0, oppLifeBefore - projectedDamage);
    const oppLifeLoss = oppLifeBefore - oppLifeAfter;
    const isPublicStateLethal = !willWhiff && !hasStochasticVariance && projectedDamage >= oppLifeBefore && oppLifeBefore > 0;
    const breaksVisibleGuard = !willWhiff && !stats.oppStunImmune && projectedDamage > effectiveOppGuard;

    let damageFormula;
    if (hasStochasticVariance) {
      damageFormula = '? (Variable)';
    } else if (willWhiff) {
      damageFormula = '0 (Miss)';
    } else if (stats.ignoreArmor && stats.oppVisibleArm > 0) {
      damageFormula = `${stats.pow} POW (Ignores ${stats.oppVisibleArm} ARM) = ${projectedDamage}`;
    } else if (effectiveOppArmor > 0) {
      damageFormula = `${stats.pow} POW − ${effectiveOppArmor} ARM = ${projectedDamage}`;
    } else {
      damageFormula = `${stats.pow} POW = ${projectedDamage}`;
    }

    // 8. Post-After movement preview (runs EVEN ON MISS per Exceed rules!)
    let postAfterSpace = null;
    let afterPath = null;
    let afterMoveKind = null;
    let afterWallTruncated = false;
    let afterCrossUp = false;
    const hasAfterHook = !!(
      (card.hooks && card.hooks.after) ||
      (criticalActive && card.critical && card.critical.after) ||
      char.attackAfterHook
    );
    if (hasAfterHook) {
      const savedPos = simMe.pos;
      const afterSteps = [savedPos];
      const applyAfterMove = (amt, mode) => {
        const cappedAmt = cappedSelfMove(simMe, simOpp, amt, false);
        if (!afterMoveKind && amt > 0) {
          afterMoveKind = mode === 'advance' ? 'Advance' : (mode === 'close' ? 'Close' : 'Retreat');
        }
        const r = Engine.simulateMovementPath(simMe.pos, simOpp.pos, cappedAmt, mode, {});
        simMe.pos = r.endSpace;
        for (let i = 1; i < r.path.length; i++) afterSteps.push(r.path[i]);
        if (r.wallTruncated) afterWallTruncated = true;
        if (r.didCrossUp) afterCrossUp = true;
      };
      const afterEngine = makeSimEngine({
        advanceSelf: (m, o, amt, allowPass) => { if (m.id === simMe.id) applyAfterMove(amt, allowPass ? 'advance' : 'close'); },
        closeSelf: (m, o, amt) => { if (m.id === simMe.id) applyAfterMove(amt, 'close'); },
        retreatSelf: (m, o, amt) => { if (m.id === simMe.id) applyAfterMove(amt, 'retreat'); },
        pushAway: () => {},
        pushToward: () => {},
        pullNoPass: () => {},
      });
      const afterCtx = {
        ...simCtx,
        hitLanded: !willWhiff,
        engine: afterEngine,
        advance: (amt) => applyAfterMove(amt, 'advance'),
        close: (amt) => applyAfterMove(amt, 'close'),
        retreat: (amt) => applyAfterMove(amt, 'retreat'),
      };
      if (card.hooks && card.hooks.after) {
        try { card.hooks.after(afterCtx); } catch (_) {}
      }
      if (criticalActive && card.critical && card.critical.after) {
        try { card.critical.after(afterCtx); } catch (_) {}
      }
      if (char.attackAfterHook) {
        try { char.attackAfterHook(afterCtx); } catch (_) {}
      }
      if (simMe.pos !== savedPos) {
        postAfterSpace = simMe.pos;
        afterPath = afterSteps;
      }
      simMe.pos = savedPos;
    }

    // 9. Card Cleanup preview (e.g. Nagoriyuki Exceed Normals non-lethal self-damage)
    const cleanups = [
      char.cardCleanupFor && char.cardCleanupFor(simMe, card),
      card.cleanup,
    ].filter(Boolean);
    for (const cl of cleanups) {
      if (cl.nonLethalDamage) {
        simMe.life = Math.max(1, simMe.life - cl.nonLethalDamage);
      }
      if (cl.draw) totalDraws += cl.draw;
    }

    const selfLifeBefore = mePub.life;
    const selfLifeAfter = simMe.life;
    const selfLifeDelta = selfLifeAfter - selfLifeBefore;
    if (selfLifeDelta > 0) effectsSet.add(`You +${selfLifeDelta} HP`);
    else if (selfLifeDelta < 0) effectsSet.add(`You ${selfLifeDelta} HP`);
    if (totalDraws > 0) effectsSet.add(`Draw ${totalDraws}`);
    if (oppDiscards > 0) effectsSet.add(`CPU discards ${oppDiscards}`);

    const beforeMoveSummary = beforeMoveKind
      ? formatMoveLabel(startPos, postBeforeSpace, `${beforeMoveKind} ${beforeMoveReq}`, didCrossUp, wallTruncated, moveBlockedByBoost, moveCappedByInnate)
      : null;

    let oppHitMoveSummary = null;
    if (oppPostHitSpace != null && oppHitMoveKind) {
      oppHitMoveSummary = `${oppHitMoveKind} ${oppHitMoveAmt} (Sp ${oppStartPos + 1}→${oppPostHitSpace + 1}${oppHitWall ? ' · Wall' : ''})`;
    } else if (oppHitMoveKind && oppHitMoveKind.includes('(Choice)')) {
      oppHitMoveSummary = oppHitMoveKind;
    }

    const afterMoveSummary = (postAfterSpace != null && afterMoveKind)
      ? formatMoveLabel(postBeforeSpace, postAfterSpace, `${afterMoveKind} ${Math.abs(postAfterSpace - postBeforeSpace)}`, afterCrossUp, afterWallTruncated, false, moveCappedByInnate)
      : null;

    return {
      cardKey: card.key,
      cardName: card.name || card.key,
      cardType: card.type || 'normal',
      isEX,
      canPreviewEX,
      isInitiator,
      criticalActive,
      criticalFree,
      canPreviewCritical,
      effectiveStats: stats,
      startSpace: startPos,
      oppStartSpace: oppStartPos,
      initialDist,
      movementPath,
      postBeforeSpace,
      beforeMoveSummary,
      didCrossUp,
      wallTruncated,
      moveBlockedByBoost,
      moveCappedByInnate,
      attackOrigin,
      usesEddie,
      postBeforeDist,
      hitboxSpaces,
      willWhiff,
      expectedHit: !willWhiff && !hasStochasticVariance,
      missReason,
      missReasonLabel,
      hitBySideSwap,
      hitByBeforeMove,
      projectedDamage,
      damageFormula,
      oppLifeBefore,
      oppLifeAfter,
      oppLifeLoss,
      selfLifeBefore,
      selfLifeAfter,
      selfLifeDelta,
      isPublicStateLethal,
      breaksVisibleGuard,
      oppPostHitSpace,
      oppHitMovePath,
      oppHitMoveSummary,
      postAfterSpace,
      afterPath,
      afterMoveSummary,
      effectsSummary: [...effectsSet],
      hasStochasticVariance,
      optionalBranches,
    };
  }

  return { run, resolveCardByKey, formatRangeBand };
})();

// State-change memoization for hand-wide Lethal Aura, range chips & EX pair checks
const PreviewMemo = (() => {
  let lastFingerprint = '';
  let cachedMap = new Map();

  function fingerprint(infoSet, isInitiator) {
    if (!infoSet || !infoSet.actor || !infoSet.opponent) return '';
    const a = infoSet.actor;
    const o = infoSet.opponent;
    return [
      infoSet.turnNumber,
      isInitiator ? 1 : 0,
      a.pos, o.pos, a.life, o.life,
      a.exceeded ? 1 : 0, o.exceeded ? 1 : 0,
      a.canceledThisTurn ? 1 : 0, a.actionStrikeThisTurn ? 1 : 0,
      a.eddiePos, o.eddiePos,
      (a.handKeys || []).join(','),
      (a.gaugeKeys || []).length,
      (a.boostKeys || []).join(','),
      (o.boostKeys || []).join(','),
    ].join('|');
  }

  function evaluateHand(infoSet, handCards, engine, player, opts = {}) {
    const isInitiator = opts.isInitiator !== false;
    const fp = fingerprint(infoSet, isInitiator);
    if (fp && fp === lastFingerprint && cachedMap.size > 0) return cachedMap;
    const next = new Map();
    const counts = {};
    for (const c of (handCards || [])) counts[c.key] = (counts[c.key] || 0) + 1;

    for (const c of (handCards || [])) {
      const validStrike = !engine || !player || typeof engine.isValidStrikeCard !== 'function' || engine.isValidStrikeCard(player, c);
      const canPayUltra = !engine || !player || (typeof engine.canPayUltra !== 'function' || c.type !== 'ultra' || engine.canPayUltra(player, c));
      const canPlay = validStrike && canPayUltra;
      const base = canPlay ? SimulateStrikePreview.run(infoSet, c, { isEX: false, isInitiator }) : null;
      const exPlayable = validStrike && counts[c.key] >= 2 && canPayUltra;
      const ex = exPlayable ? SimulateStrikePreview.run(infoSet, c, { isEX: true, isInitiator }) : null;
      next.set(c.uid || c.key, { base, ex, canPlay, exPlayable });
    }
    lastFingerprint = fp;
    cachedMap = next;
    return cachedMap;
  }

  function invalidate() {
    lastFingerprint = '';
    cachedMap.clear();
  }

  return { evaluateHand, invalidate };
})();

// Controller subscribing to hover & toggle events and dispatching to renderers
const StrikePreviewController = (() => {
  let activeHover = null; // { card, isEX, useOptionalBranch, criticalPaid }
  let lastTargetLock = null;

  function refresh() {
    if (!activeHover || typeof G === 'undefined' || !G.engine) {
      if (typeof ArenaTelegraphRenderer !== 'undefined') ArenaTelegraphRenderer.clear();
      if (typeof ClashSummaryBanner !== 'undefined') ClashSummaryBanner.clear();
      lastTargetLock = null;
      return;
    }
    const infoSet = G.engine.getInformationSet('p1');
    const result = SimulateStrikePreview.run(infoSet, activeHover.card, {
      isEX: activeHover.isEX,
      useOptionalBranch: activeHover.useOptionalBranch,
      criticalPaid: activeHover.criticalPaid,
      isInitiator: G.mode !== 'defend_select',
    });
    if (typeof ArenaTelegraphRenderer !== 'undefined') {
      ArenaTelegraphRenderer.render(result, infoSet);
    }
    if (typeof ClashSummaryBanner !== 'undefined') {
      ClashSummaryBanner.render(result, infoSet, activeHover);
    }
    if (typeof updateUniversalInspectorSlot === 'function') {
      updateUniversalInspectorSlot();
    }
    const locked = !!(result && !result.willWhiff);
    if (locked !== lastTargetLock) {
      lastTargetLock = locked;
      if (locked && typeof EventBus !== 'undefined') EventBus.emit('OnTargetLockChanged', { locked: true, cardKey: result.cardKey });
    }
  }

  if (typeof EventBus !== 'undefined') {
    EventBus.on('OnCardHoverStart', (payload) => {
      if (!payload || !payload.card) return;
      const sameCard = !!(activeHover && activeHover.card && activeHover.card.key === payload.card.key);
      activeHover = {
        card: payload.card,
        isEX: !!payload.isEX,
        useOptionalBranch: sameCard ? !!activeHover.useOptionalBranch : false,
        criticalPaid: sameCard ? !!activeHover.criticalPaid : false,
      };
      refresh();
    });
    EventBus.on('OnCardHoverEnd', () => {
      activeHover = null;
      refresh();
    });
    EventBus.on('OnToggleEXMode', (payload) => {
      if (!activeHover) return;
      const desired = payload && typeof payload.isEX === 'boolean' ? payload.isEX : !activeHover.isEX;
      if (desired && typeof G !== 'undefined' && G && G.engine && typeof G.human === 'function') {
        const human = G.human();
        const card = activeHover.card;
        if (human && card) {
          const hasDup = human.hand.filter(c => c.key === card.key).length >= 2;
          const valid = typeof G.engine.isValidStrikeCard !== 'function' || G.engine.isValidStrikeCard(human, card);
          const canPayUltra = card.type !== 'ultra' || typeof G.engine.canPayUltra !== 'function' || G.engine.canPayUltra(human, card);
          if (!hasDup || !valid || !canPayUltra) return;
        }
      }
      activeHover.isEX = desired;
      refresh();
    });
    EventBus.on('OnToggleOptionalBranch', (payload) => {
      if (!activeHover) return;
      activeHover.useOptionalBranch = payload && typeof payload.enabled === 'boolean'
        ? payload.enabled
        : !activeHover.useOptionalBranch;
      refresh();
    });
    EventBus.on('OnToggleCriticalPreview', (payload) => {
      if (!activeHover) return;
      activeHover.criticalPaid = payload && typeof payload.enabled === 'boolean'
        ? payload.enabled
        : !activeHover.criticalPaid;
      refresh();
    });
  }

  function syncSelectedCard(card, isEX = false) {
    if (!card) {
      activeHover = null;
      refresh();
      return;
    }
    const sameCard = !!(activeHover && activeHover.card && activeHover.card.key === card.key);
    activeHover = {
      card,
      isEX: !!isEX,
      useOptionalBranch: sameCard ? !!activeHover.useOptionalBranch : false,
      criticalPaid: sameCard ? !!activeHover.criticalPaid : false,
    };
    refresh();
  }

  return {
    refresh,
    syncSelectedCard,
    getActiveHover: () => activeHover,
    clear: () => { activeHover = null; refresh(); },
  };
})();

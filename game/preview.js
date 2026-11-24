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

  function makeSimPlayer(pub, isActor) {
    const boosts = (pub.boostKeys || []).map((k) => ({ card: resolveCardByKey(k) || { key: k, boost: {} } }));
    const gauge = (pub.gaugeKeys || []).map((k) => resolveCardByKey(k) || { key: k, type: 'normal' });
    const hand = isActor && Array.isArray(pub.handKeys)
      ? pub.handKeys.map((k) => resolveCardByKey(k) || { key: k, type: 'normal' })
      : new Array(pub.handCount || 0).fill({ key: '_hidden', type: 'normal' });
    return {
      id: pub.id,
      name: pub.id === 'p1' ? 'You' : 'CPU',
      characterKey: pub.characterKey,
      life: pub.life,
      maxLife: pub.maxLife,
      pos: pub.pos,
      eddiePos: pub.eddiePos,
      exceeded: !!pub.exceeded,
      advantage: !!pub.advantage,
      reshuffleUsed: !!pub.reshuffleUsed,
      hand,
      gauge,
      discard: (pub.discardKeys || []).map((k) => resolveCardByKey(k) || { key: k }),
      boostsInPlay: boosts,
      sealedCards: (pub.sealedKeys || []).map((k) => resolveCardByKey(k) || { key: k }),
      overdrive: (pub.overdriveKeys || []).map((k) => resolveCardByKey(k) || { key: k }),
      canceledThisTurn: false,
      actionStrikeThisTurn: false,
      strikeState: {},
    };
  }

  function computeVisibleBoostMods(pub) {
    if (pub && pub.activeBoostMods) return { ...pub.activeBoostMods };
    return { pow: 0, spd: 0, arm: 0, grd: 0, ignoreArmor: false, stunImmune: false };
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

  function computeVisibleStats(simMe, simOpp, mePub, oppPub, card, opts = {}) {
    const mods = computeVisibleBoostMods(mePub);
    const oppMods = computeVisibleBoostMods(oppPub);
    const char = (typeof CHARACTERS !== 'undefined' && CHARACTERS[simMe.characterKey]) || {};
    const initiator = opts.isInitiator !== false;
    const distNow = Math.abs(simMe.pos - simOpp.pos);

    const nsm = (card.type === 'normal' && char.normalsStatMods) ? (char.normalsStatMods(simMe) || {}) : {};
    const isAtEdge = simMe.pos === 0 || simMe.pos === BOARD_SIZE - 1;
    const esm = (card.type !== 'normal' && char.specialsUltrasStatModsIfAtEdge && isAtEdge)
      ? (char.specialsUltrasStatModsIfAtEdge(simMe) || {}) : {};
    const rcb = (char.rangeConditionalStatBonus && initiator && distNow === 1)
      ? (char.rangeConditionalStatBonus(simMe) || {}) : {};

    let oppPowDebuff = 0;
    for (const b of simOpp.boostsInPlay) {
      if (b.card && b.card.boost && b.card.boost.opponentPowMod) oppPowDebuff += b.card.boost.opponentPowMod;
    }

    const rangeSpdBonus = (card.hooks && card.hooks.spdBonusPerRangeAtSetTime) ? distNow : 0;
    const gaugeSpdBonus = card.spdPerGaugeCard ? simMe.gauge.length : 0;

    const fakeEngine = {
      range: (a, b) => Math.abs(a.pos - b.pos),
      isAtEdge: (p) => p.pos === 0 || p.pos === BOARD_SIZE - 1,
      gaugeCount: (p) => p.gauge.length,
      activeBoostMods: (p) => (p.id === simMe.id ? mods : oppMods),
    };

    const asm = char.attackStatMods
      ? (char.attackStatMods(simMe, card, { initiator, fromWildSwing: !!opts.fromWildSwing, dist: distNow }) || {})
      : {};
    const cdm = card.liveStatMods
      ? (card.liveStatMods(simMe, simOpp, fakeEngine, { initiator, fromWildSwing: !!opts.fromWildSwing, dist: distNow }) || {})
      : {};

    const statTotal = {
      pow: card.pow || 0,
      spd: card.spd || 0,
      arm: card.arm || 0,
      grd: card.guardEqualsHandSize ? simMe.hand.length : (card.grd || 0),
    };
    const addMods = (m) => {
      if (!m) return;
      statTotal.pow += m.pow || 0;
      statTotal.spd += m.spd || 0;
      statTotal.arm += m.arm || 0;
      statTotal.grd += m.grd || 0;
    };
    for (const m of [cdm, mods, nsm, esm, rcb, asm]) addMods(m);
    statTotal.pow += oppPowDebuff;
    statTotal.spd += rangeSpdBonus + gaugeSpdBonus;

    if (card.hooks) {
      if (card.hooks.spdBonusIfDefending && !initiator) statTotal.spd += card.hooks.spdBonusIfDefending;
      if (card.hooks.spdBonusIfInitiating && initiator) statTotal.spd += card.hooks.spdBonusIfInitiating;
      if (card.hooks.powBonusIfInitiating && initiator) statTotal.pow += card.hooks.powBonusIfInitiating;
      if (card.hooks.armBonusIfDefending && !initiator) statTotal.arm += card.hooks.armBonusIfDefending;
    }
    if (card.selfArmorZero) statTotal.arm = 0;

    return {
      pow: statTotal.pow,
      spd: statTotal.spd,
      arm: statTotal.arm,
      grd: statTotal.grd,
      ignoreArmor: !!card.ignoreArmor || !!mods.ignoreArmor,
      ignoreGuard: !!card.ignoreGuard,
      oppVisibleArm: oppMods.arm || 0,
      oppVisibleGrd: oppMods.grd || 0,
      oppStunImmune: !!oppMods.stunImmune,
    };
  }

  function detectOptionalBranches(card, simMe) {
    const branches = [];
    if (!card || !card.hooks) return branches;
    if (card.hooks.optionalRetreat) {
      branches.push({ id: 'optionalRetreat', label: `Retreat ${card.hooks.optionalRetreat}` });
    }
    if (card.hooks.optionalForceSpendPow) {
      const f = card.hooks.optionalForceSpendPow;
      branches.push({ id: 'optionalForceSpendPow', label: `+${f.pow || 0} POW (Spend ${f.force || 1} Force)` });
    }
    if (card.hooks.optionalGaugeSpend) {
      const g = card.hooks.optionalGaugeSpend;
      if (simMe.gauge.length >= (g.gauge || 1)) {
        branches.push({ id: 'optionalGaugeSpend', label: g.label || `Spend ${g.gauge || 1} Gauge` });
      }
    }
    return branches;
  }

  function computeHitboxSpaces(sourcePos, card, simMe) {
    if (!card || card.alwaysMiss || !card.range) return [];
    const char = (typeof CHARACTERS !== 'undefined' && CHARACTERS[simMe.characterKey]) || {};
    let minR = card.range[0];
    let maxR = card.range[1];
    if (card.type === 'normal' && char.normalsRangeBonus) {
      const rb = char.normalsRangeBonus(simMe) || {};
      maxR += rb.max || 0;
    }
    if (char.attackRangeBonus) {
      const rb = char.attackRangeBonus(simMe, card) || {};
      maxR += rb.max || 0;
    }
    const spaces = [];
    for (let s = 0; s < BOARD_SIZE; s++) {
      const d = Math.abs(s - sourcePos);
      if (d >= minR && d <= maxR) spaces.push(s);
    }
    return spaces;
  }

  function run(infoSet, rawCard, opts = {}) {
    if (!infoSet || !infoSet.actor || !infoSet.opponent) return null;
    const isEX = !!opts.isEX;
    const useOptionalBranch = !!opts.useOptionalBranch;
    const mePub = infoSet.actor;
    const oppPub = infoSet.opponent;
    const simMe = makeSimPlayer(mePub, true);
    const simOpp = makeSimPlayer(oppPub, false);

    // Wild Swing or missing card is purely stochastic
    if (!rawCard || rawCard.isWildSwing) {
      return {
        cardKey: 'wild_swing',
        isEX: false,
        effectiveStats: { pow: '?', spd: '?', arm: '?', grd: '?', ignoreArmor: false, ignoreGuard: false, oppVisibleArm: computeVisibleBoostMods(oppPub).arm || 0, oppVisibleGrd: computeVisibleBoostMods(oppPub).grd || 0 },
        movementPath: [simMe.pos],
        postBeforeSpace: simMe.pos,
        didCrossUp: false,
        wallTruncated: false,
        hitboxSpaces: [],
        willWhiff: false,
        projectedDamage: 0,
        isPublicStateLethal: false,
        postAfterSpace: null,
        afterPath: null,
        hasStochasticVariance: true,
        optionalBranches: [],
      };
    }

    const card = buildEffectiveCard(rawCard, isEX);
    const stats = computeVisibleStats(simMe, simOpp, mePub, oppPub, card, opts);
    const optionalBranches = detectOptionalBranches(card, simMe);

    let hasStochasticVariance = !!(
      (card.hooks && (card.hooks.wildSwing || card.hooks.randomDiscard || card.hooks.drawOnHit || card.hooks.stochastic)) ||
      card.type === 'wild_swing'
    );

    const startPos = simMe.pos;
    const movementPath = [startPos];
    let didCrossUp = false;
    let wallTruncated = false;
    let powBonus = 0;

    const applyMove = (amount, mode) => {
      const res = Engine.simulateMovementPath(simMe.pos, simOpp.pos, amount, mode, {});
      if (res.path.length > 1) {
        for (let i = 1; i < res.path.length; i++) movementPath.push(res.path[i]);
      }
      simMe.pos = res.endSpace;
      if (res.didCrossUp) didCrossUp = true;
      if (res.wallTruncated) wallTruncated = true;
      return Math.abs(res.endSpace - (res.path[0] || startPos));
    };

    const simCtx = {
      engine: {
        advanceSelf: (m, o, amt, allowPass) => { if (m.id === simMe.id) applyMove(amt, allowPass ? 'advance' : 'close'); },
        closeSelf: (m, o, amt) => { if (m.id === simMe.id) applyMove(amt, 'close'); },
        retreatSelf: (m, o, amt) => { if (m.id === simMe.id) applyMove(amt, 'retreat'); },
        pushAway: () => {},
        pushToward: () => {},
        pullTowardWithoutPassing: () => {},
        range: (a, b) => Math.abs(a.pos - b.pos),
        draw: () => { hasStochasticVariance = true; },
        logMsg: () => {},
      },
      attacker: simMe,
      defender: simOpp,
      attackerCard: card,
      defenderCard: null,
      sideSwapped: false,
      powBonus: 0,
      ignoreGuardThisHit: false,
      hitLanded: false,
      criticalPaid: !!opts.criticalPaid,
      attStats: stats,
      defStats: { pow: 0, spd: 0, arm: stats.oppVisibleArm, grd: stats.oppVisibleGrd },
      advance: (amt) => applyMove(amt, 'advance'),
      close: (amt) => applyMove(amt, 'close'),
      retreat: (amt) => applyMove(amt, 'retreat'),
      push: () => {},
      pull: () => {},
    };

    // 1. Boost-granted Before movement
    for (const b of simMe.boostsInPlay) {
      const bonus = b.card && b.card.boost && b.card.boost.grantsNormalsBeforeAdvance;
      if (bonus && card.type === 'normal') applyMove(bonus, 'advance');
      const closeBonus = b.card && b.card.boost && b.card.boost.grantsBeforeCloseWithBonus;
      if (closeBonus) {
        const moved = applyMove(closeBonus.amount, 'close');
        if (moved < closeBonus.amount) powBonus += closeBonus.pow || 0;
      }
    }

    // 2. Character Before hook
    const char = (typeof CHARACTERS !== 'undefined' && CHARACTERS[simMe.characterKey]) || {};
    if (char.attackBeforeHook) {
      try {
        char.attackBeforeHook(simCtx, { initiator: opts.isInitiator !== false, fromWildSwing: !!opts.fromWildSwing });
      } catch (_) { hasStochasticVariance = true; }
    }

    // 3. Card Before hook
    if (card.hooks && card.hooks.before) {
      try {
        card.hooks.before(simCtx);
      } catch (_) { hasStochasticVariance = true; }
    }

    // 4. Optional branch (when toggled on)
    if (useOptionalBranch) {
      if (card.hooks && card.hooks.optionalRetreat) {
        applyMove(card.hooks.optionalRetreat, 'retreat');
      }
      if (card.hooks && card.hooks.optionalForceSpendPow) {
        powBonus += card.hooks.optionalForceSpendPow.pow || 0;
      }
    }

    const postBeforeSpace = simMe.pos;
    stats.pow += powBonus + (simCtx.powBonus || 0);

    // 5. Range & Hit validation (Zato-1 Specials/Ultras measure from Eddie if in play)
    const usesEddie = simMe.characterKey === 'zato1' && card.type !== 'normal' && simMe.eddiePos != null;
    const attackOrigin = usesEddie ? simMe.eddiePos : postBeforeSpace;
    const hitboxSpaces = computeHitboxSpaces(attackOrigin, card, simMe);
    let willWhiff = true;
    if (!card.alwaysMiss) {
      if (hitboxSpaces.includes(simOpp.pos)) willWhiff = false;
      else if (card.rangeIncludeIfSideSwapped && didCrossUp) willWhiff = false;
    }

    // 6. Post-After movement preview (only if attack hits and has an after hook)
    let postAfterSpace = null;
    let afterPath = null;
    if (!willWhiff && card.hooks && card.hooks.after) {
      const savedPos = simMe.pos;
      const afterSteps = [savedPos];
      const afterCtx = {
        ...simCtx,
        hitLanded: true,
        engine: {
          ...simCtx.engine,
          advanceSelf: (m, o, amt, allowPass) => {
            if (m.id === simMe.id) {
              const r = Engine.simulateMovementPath(simMe.pos, simOpp.pos, amt, allowPass ? 'advance' : 'close', {});
              simMe.pos = r.endSpace;
              for (let i = 1; i < r.path.length; i++) afterSteps.push(r.path[i]);
            }
          },
          closeSelf: (m, o, amt) => {
            if (m.id === simMe.id) {
              const r = Engine.simulateMovementPath(simMe.pos, simOpp.pos, amt, 'close', {});
              simMe.pos = r.endSpace;
              for (let i = 1; i < r.path.length; i++) afterSteps.push(r.path[i]);
            }
          },
          retreatSelf: (m, o, amt) => {
            if (m.id === simMe.id) {
              const r = Engine.simulateMovementPath(simMe.pos, simOpp.pos, amt, 'retreat', {});
              simMe.pos = r.endSpace;
              for (let i = 1; i < r.path.length; i++) afterSteps.push(r.path[i]);
            }
          },
        },
        advance: (amt) => afterCtx.engine.advanceSelf(simMe, simOpp, amt, true),
        close: (amt) => afterCtx.engine.closeSelf(simMe, simOpp, amt),
        retreat: (amt) => afterCtx.engine.retreatSelf(simMe, simOpp, amt),
      };
      try {
        card.hooks.after(afterCtx);
      } catch (_) { hasStochasticVariance = true; }
      if (simMe.pos !== savedPos) {
        postAfterSpace = simMe.pos;
        afterPath = afterSteps;
      }
      simMe.pos = savedPos;
    }

    // 7. Projected damage & Public-State Lethal
    const effectiveOppArmor = stats.ignoreArmor ? 0 : stats.oppVisibleArm;
    const projectedDamage = willWhiff ? 0 : Math.max(0, stats.pow - effectiveOppArmor);
    const isPublicStateLethal = !willWhiff && !hasStochasticVariance && projectedDamage >= oppPub.life;

    return {
      cardKey: card.key,
      isEX,
      effectiveStats: stats,
      movementPath,
      postBeforeSpace,
      didCrossUp,
      wallTruncated,
      hitboxSpaces,
      willWhiff,
      projectedDamage,
      isPublicStateLethal,
      postAfterSpace,
      afterPath,
      hasStochasticVariance,
      optionalBranches,
      usesEddie,
      attackOrigin,
    };
  }

  return { run, resolveCardByKey };
})();

// State-change memoization for hand-wide Lethal Aura & EX pair checks
const PreviewMemo = (() => {
  let lastFingerprint = '';
  let cachedMap = new Map();

  function fingerprint(infoSet) {
    if (!infoSet || !infoSet.actor || !infoSet.opponent) return '';
    const a = infoSet.actor;
    const o = infoSet.opponent;
    return [
      infoSet.turnNumber,
      a.pos, o.pos, a.life, o.life,
      a.exceeded ? 1 : 0, o.exceeded ? 1 : 0,
      a.eddiePos, o.eddiePos,
      (a.handKeys || []).join(','),
      (a.gaugeKeys || []).length,
      (a.boostKeys || []).join(','),
      (o.boostKeys || []).join(','),
    ].join('|');
  }

  function evaluateHand(infoSet, handCards, engine, player) {
    const fp = fingerprint(infoSet);
    if (fp && fp === lastFingerprint && cachedMap.size > 0) return cachedMap;
    const next = new Map();
    const counts = {};
    for (const c of (handCards || [])) counts[c.key] = (counts[c.key] || 0) + 1;

    for (const c of (handCards || [])) {
      const canPlay = !engine || !player || (typeof engine.canPayUltra !== 'function' || c.type !== 'ultra' || engine.canPayUltra(player, c));
      const base = canPlay ? SimulateStrikePreview.run(infoSet, c, { isEX: false }) : null;
      const exPlayable = counts[c.key] >= 2 && (!engine || !player || c.type !== 'ultra' || (typeof engine.canPayUltra === 'function' ? engine.canPayUltra(player, c) : true));
      const ex = exPlayable ? SimulateStrikePreview.run(infoSet, c, { isEX: true }) : null;
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
  let activeHover = null; // { card, isEX, useOptionalBranch }
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
      isInitiator: G.mode !== 'defend_select',
    });
    if (typeof ArenaTelegraphRenderer !== 'undefined') {
      ArenaTelegraphRenderer.render(result, infoSet);
    }
    if (typeof ClashSummaryBanner !== 'undefined') {
      ClashSummaryBanner.render(result, infoSet, activeHover);
    }
    const locked = !!(result && !result.willWhiff);
    if (locked !== lastTargetLock) {
      lastTargetLock = locked;
      if (locked) EventBus.emit('OnTargetLockChanged', { locked: true, cardKey: result.cardKey });
    }
  }

  if (typeof EventBus !== 'undefined') {
    EventBus.on('OnCardHoverStart', (payload) => {
      if (!payload || !payload.card) return;
      activeHover = {
        card: payload.card,
        isEX: !!payload.isEX,
        useOptionalBranch: !!(activeHover && activeHover.useOptionalBranch),
      };
      refresh();
    });
    EventBus.on('OnCardHoverEnd', () => {
      activeHover = null;
      refresh();
    });
    EventBus.on('OnToggleEXMode', (payload) => {
      if (!activeHover) return;
      activeHover.isEX = payload && typeof payload.isEX === 'boolean' ? payload.isEX : !activeHover.isEX;
      refresh();
    });
    EventBus.on('OnToggleOptionalBranch', (payload) => {
      if (!activeHover) return;
      activeHover.useOptionalBranch = payload && typeof payload.enabled === 'boolean'
        ? payload.enabled
        : !activeHover.useOptionalBranch;
      refresh();
    });
  }

  function syncSelectedCard(card, isEX = false) {
    if (!card) {
      activeHover = null;
      refresh();
      return;
    }
    activeHover = {
      card,
      isEX: !!isEX,
      useOptionalBranch: !!(activeHover && activeHover.card && activeHover.card.key === card.key && activeHover.useOptionalBranch),
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

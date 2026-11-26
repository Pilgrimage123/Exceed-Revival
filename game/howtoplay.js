// ============================================================
// HOW TO PLAY — ARCADE FIGHTER COMMAND MANUAL
// Modular interactive manual (pure logic + accessible DOM UI).
// Reads live card definitions from NORMALS/CHARACTERS and live
// glyphs from fxIcon() so rules stay synced with the engine.
// ============================================================

const HowToPlayLogic = (() => {
  const FALLBACK_CARDS = {
    cross: {
      key: 'cross', name: 'Cross', type: 'normal',
      range: [1, 2], pow: 3, spd: 6, arm: 0, grd: 0,
      text: 'After: Retreat 3.',
      boostText: 'Advance up to 3.',
      boost: { force: 0, continuous: false },
    },
    grasp: {
      key: 'grasp', name: 'Grasp', type: 'normal',
      range: [1, 1], pow: 3, spd: 7, arm: 0, grd: 0,
      text: 'Hit: Move opponent 1-2.',
      boostText: '+2 Power.',
      boost: { force: 0, continuous: true },
    },
    assault: {
      key: 'assault', name: 'Assault', type: 'normal',
      range: [1, 1], pow: 4, spd: 5, arm: 0, grd: 0,
      text: 'Before: Close 2. Hit: Advantage.',
      boostText: 'Retreat up to 4.',
      boost: { force: 0, continuous: false },
    },
    sweep: {
      key: 'sweep', name: 'Sweep', type: 'normal',
      range: [1, 3], pow: 6, spd: 2, arm: 0, grd: 6,
      text: 'Hit: Opponent discards 1 at random.',
      boostText: '+2 Speed.',
      boost: { force: 0, continuous: true },
    },
    spike: {
      key: 'spike', name: 'Spike', type: 'normal',
      range: [2, 3], pow: 5, spd: 3, arm: 0, grd: 4,
      ignoreArmor: true, ignoreGuard: true,
      text: 'Ignore Guard, Armor.',
      boostText: '+1 Armor, +3 Guard.',
      boost: { force: 0, continuous: true },
    },
    focus: {
      key: 'focus', name: 'Focus', type: 'normal',
      range: [1, 2], pow: 4, spd: 1, arm: 2, grd: 5,
      text: "Opponents can't move you. After: Draw 1.",
      boostText: 'Name a Normal and Strike. Opponent must Strike with that card or reveal their hand without it.',
      boost: { force: 0, continuous: false },
    },
    block: {
      key: 'block', name: 'Block', type: 'normal',
      range: null, pow: 0, spd: 0, arm: 2, grd: 3, alwaysMiss: true,
      text: 'When hit, spend any amount of Force for +2 Armor for each Force.\nAfter: Add to Gauge at end of Strike.',
      boostText: 'Name a card. Opponent must discard that card or reveal hand without it.',
      hooks: { goesToGaugeEvenOnMiss: true },
      boost: { force: 0, continuous: false },
    },
    hadoken_ryu: {
      key: 'hadoken_ryu', name: 'Hadoken', type: 'special',
      range: [3, 6], pow: 4, spd: 4, arm: 0, grd: 0,
      text: 'After: If you hit, you may return this card to the top of your Deck; if you do, put the top card of your discard into your Gauge.',
      criticalText: 'Critical: +2 Speed.',
      critical: { statMods: { spd: 2 } },
      boostText: '+2 Power, +1 Armor.',
      boost: { force: 0, continuous: true },
    },
    shoryuken_ryu: {
      key: 'shoryuken_ryu', name: 'Shoryuken', type: 'special',
      range: [1, 1], pow: 4, spd: 5, arm: 0, grd: 0,
      text: 'If opponent initiated the Strike, +2 Speed.',
      criticalText: 'Critical, Before: Close 1.',
      hooks: { spdBonusIfDefending: 2 },
      boostText: 'Ignore Armor. Now: Strike. Hit: this card goes to Gauge.',
      boost: { force: 0, continuous: true },
    },
    metsu_shoryuken: {
      key: 'metsu_shoryuken', name: 'Metsu Shoryuken', type: 'ultra', gaugeCost: 4,
      range: [1, 1], pow: 7, spd: 5, arm: 0, grd: 0,
      text: 'If opponent initiated the Strike, +3 Speed.',
      hooks: { spdBonusIfDefending: 3 },
      boostText: 'Move 2, then Strike.',
      boost: { force: 1, continuous: false, triggersStrike: true },
    },
  };

  function getCatalogCard(key) {
    if (typeof NORMALS !== 'undefined' && Array.isArray(NORMALS)) {
      const n = NORMALS.find(c => c.key === key);
      if (n) return n;
    }
    if (typeof CHARACTERS !== 'undefined' && CHARACTERS.ryu && Array.isArray(CHARACTERS.ryu.specials)) {
      const s = CHARACTERS.ryu.specials.find(c => c.key === key);
      if (s) return s;
    }
    return FALLBACK_CARDS[key] || FALLBACK_CARDS.cross;
  }

  function formatRange(range) {
    if (!range) return 'N/A';
    return range[0] === range[1] ? `${range[0]}` : `${range[0]}\u2013${range[1]}`;
  }

  const RANGE_BENCHMARKS = [
    { key: 'grasp', role: 'Close Throw', range: [1, 1], spd: 7, pow: 3 },
    { key: 'cross', role: 'Fast Poke', range: [1, 2], spd: 6, pow: 3 },
    { key: 'sweep', role: 'Mid Sweep', range: [1, 3], spd: 2, pow: 6 },
    { key: 'hadoken_ryu', role: 'Long Projectile', range: [3, 6], spd: 4, pow: 4 },
  ];

  function evaluateRangeBenchmarks(p1Pos, p2Pos) {
    const clampedP1 = Math.max(0, Math.min(8, p1Pos | 0));
    const clampedP2 = Math.max(0, Math.min(8, p2Pos | 0));
    const distance = Math.abs(clampedP1 - clampedP2);
    return {
      p1Pos: clampedP1,
      p2Pos: clampedP2,
      distance,
      benchmarks: RANGE_BENCHMARKS.map(b => {
        const card = getCatalogCard(b.key);
        const range = card.range || b.range;
        const inRange = distance >= range[0] && distance <= range[1];
        return {
          key: b.key,
          name: card.name,
          type: card.type || 'normal',
          role: b.role,
          range,
          rangeLabel: formatRange(range),
          spd: card.spd,
          pow: card.pow,
          inRange,
        };
      }),
    };
  }

  const CLASH_CARD_KEYS = [
    'cross', 'grasp', 'assault', 'sweep', 'spike', 'focus', 'block',
    'hadoken_ryu', 'shoryuken_ryu', 'metsu_shoryuken',
  ];

  const CLASH_PRESETS = [
    {
      id: 'speed_stun',
      title: 'Speed & Stun',
      subtitle: 'Faster hit shatters 0-Guard attack',
      distance: 1,
      initiator: 'p1',
      p1: { cardKey: 'cross', ex: false, crit: false },
      p2: { cardKey: 'assault', ex: false, crit: false },
    },
    {
      id: 'armor_wall',
      title: 'Armor Wall',
      subtitle: 'Guard holds & slower fighter counters',
      distance: 2,
      initiator: 'p1',
      p1: { cardKey: 'cross', ex: false, crit: false },
      p2: { cardKey: 'focus', ex: false, crit: false },
    },
    {
      id: 'whiff_punish',
      title: 'Whiff & Punish',
      subtitle: 'Fast move whiffs out of range, heavy punishes',
      distance: 3,
      initiator: 'p1',
      p1: { cardKey: 'cross', ex: false, crit: false },
      p2: { cardKey: 'sweep', ex: false, crit: false },
    },
    {
      id: 'crit_reversal',
      title: 'Critical / Reversal',
      subtitle: 'Defender Metsu Shoryuken jumps to SPD 8',
      distance: 1,
      initiator: 'p1',
      p1: { cardKey: 'grasp', ex: false, crit: false },
      p2: { cardKey: 'metsu_shoryuken', ex: false, crit: false },
    },
  ];

  function computeEffectiveFighter(card, opts, isInitiator) {
    const ex = !!(opts && opts.ex);
    const crit = !!(opts && opts.crit && card.criticalText);
    const exBonus = ex ? 1 : 0;
    let pow = (card.pow || 0) + exBonus;
    let spd = (card.spd || 0) + exBonus;
    let arm = (card.arm || 0) + exBonus;
    let grd = (card.grd || 0) + exBonus;
    const notes = [];

    if (ex) notes.push('EX pair (+1 POW/SPD/ARM/GRD)');
    if (!isInitiator && card.hooks && card.hooks.spdBonusIfDefending) {
      spd += card.hooks.spdBonusIfDefending;
      notes.push(`Reversal defense (+${card.hooks.spdBonusIfDefending} SPD)`);
    }
    if (crit && card.critical && card.critical.statMods) {
      if (card.critical.statMods.spd) {
        spd += card.critical.statMods.spd;
        notes.push(`Critical (+${card.critical.statMods.spd} SPD)`);
      }
      if (card.critical.statMods.pow) {
        pow += card.critical.statMods.pow;
        notes.push(`Critical (+${card.critical.statMods.pow} POW)`);
      }
      if (card.critical.statMods.arm) {
        arm += card.critical.statMods.arm;
        notes.push(`Critical (+${card.critical.statMods.arm} ARM)`);
      }
      if (card.critical.statMods.grd) {
        grd += card.critical.statMods.grd;
        notes.push(`Critical (+${card.critical.statMods.grd} GRD)`);
      }
    }

    let beforeClose = 0;
    if (card.key === 'assault') {
      beforeClose = 2;
      notes.push('Before: Close 2');
    } else if (card.key === 'shoryuken_ryu' && crit) {
      beforeClose = 1;
      notes.push('Critical Before: Close 1');
    }

    return {
      key: card.key,
      name: card.name,
      type: card.type || 'normal',
      range: card.range || null,
      rangeLabel: formatRange(card.range),
      pow,
      spd,
      arm,
      grd,
      ex,
      crit,
      hasCritOption: !!card.criticalText,
      ignoreArmor: !!(card.hooks && card.hooks.ignoreArmor) || !!card.ignoreArmor,
      ignoreGuard: !!(card.hooks && card.hooks.ignoreGuard) || !!card.ignoreGuard,
      alwaysMiss: !!card.alwaysMiss,
      goesToGaugeEvenOnMiss: !!(card.hooks && card.hooks.goesToGaugeEvenOnMiss),
      beforeClose,
      gaugeCost: card.gaugeCost || 0,
      notes,
    };
  }

  function evaluateClashScenario(config) {
    const startDist = Math.max(1, Math.min(8, (config && config.distance) ? (config.distance | 0) : 1));
    const initiator = (config && config.initiator === 'p2') ? 'p2' : 'p1';
    const p1Card = getCatalogCard(config && config.p1 ? config.p1.cardKey : 'cross');
    const p2Card = getCatalogCard(config && config.p2 ? config.p2.cardKey : 'assault');

    const fighters = {
      p1: {
        id: 'p1',
        label: 'P1 (You)',
        startHp: 30,
        hp: 30,
        hitLanded: false,
        stunned: false,
        destination: 'discard',
        stats: computeEffectiveFighter(p1Card, config && config.p1, initiator === 'p1'),
      },
      p2: {
        id: 'p2',
        label: 'P2 (CPU)',
        startHp: 30,
        hp: 30,
        hitLanded: false,
        stunned: false,
        destination: 'discard',
        stats: computeEffectiveFighter(p2Card, config && config.p2, initiator === 'p2'),
      },
    };

    const s1 = fighters.p1.stats;
    const s2 = fighters.p2.stats;
    let firstId;
    let speedTie = false;
    if (s1.spd > s2.spd) firstId = 'p1';
    else if (s2.spd > s1.spd) firstId = 'p2';
    else {
      speedTie = true;
      firstId = initiator;
    }
    const secondId = firstId === 'p1' ? 'p2' : 'p1';

    let currentDist = startDist;
    const beats = [];

    beats.push({
      phase: 'speed',
      badge: speedTie ? 'SPEED TIE' : 'SPEED PRIORITY',
      actor: firstId,
      title: speedTie
        ? `Tied at Speed ${fighters[firstId].stats.spd} — Initiator (${fighters[firstId].label}) acts first`
        : `${fighters[firstId].label} acts first (SPD ${fighters[firstId].stats.spd} vs ${fighters[secondId].stats.spd})`,
      detail: `${fighters[firstId].stats.name} resolves before ${fighters[secondId].stats.name}. Only the slower card can be Stunned.`,
    });

    function resolveSide(attId, defId, isFirst) {
      const att = fighters[attId];
      const def = fighters[defId];
      const as = att.stats;
      const ds = def.stats;

      if (!isFirst && att.stunned) {
        beats.push({
          phase: 'stun_skip',
          badge: 'CANCELLED',
          actor: attId,
          title: `${att.label}'s ${as.name} is Stunned and cannot activate`,
          detail: 'Because incoming damage exceeded Guard before this card acted, it deals 0 damage and triggers no effects.',
        });
        return;
      }

      if (as.beforeClose > 0 && currentDist > 1) {
        const nextDist = Math.max(1, currentDist - as.beforeClose);
        const moved = currentDist - nextDist;
        currentDist = nextDist;
        beats.push({
          phase: 'move',
          badge: 'BEFORE EFFECT',
          actor: attId,
          title: `${att.label} closes ${moved} space${moved === 1 ? '' : 's'} to Range ${currentDist}`,
          detail: `${as.name}'s Before movement resolves prior to checking attack Range.`,
        });
      }

      const inRange = !as.alwaysMiss && !!as.range && currentDist >= as.range[0] && currentDist <= as.range[1];
      if (!inRange) {
        const reason = as.alwaysMiss
          ? `${as.name} cannot deal damage (defensive card — adds to Gauge at end of Strike).`
          : `Range ${currentDist} is outside ${as.name}'s Range ${as.rangeLabel} band.`;
        beats.push({
          phase: 'miss',
          badge: as.alwaysMiss ? 'DEFENSIVE' : 'WHIFF',
          actor: attId,
          title: `${att.label}'s ${as.name} ${as.alwaysMiss ? 'stands guard' : 'misses at Range ' + currentDist}`,
          detail: reason,
        });
        return;
      }

      att.hitLanded = true;
      const effArm = as.ignoreArmor ? 0 : ds.arm;
      const effGrd = as.ignoreGuard ? 0 : ds.grd;
      const damage = Math.max(0, as.pow - effArm);
      def.hp = Math.max(0, def.hp - damage);

      const armNote = as.ignoreArmor && ds.arm > 0
        ? `POW ${as.pow} (Ignores ${ds.arm} ARM) = ${damage} DMG`
        : `POW ${as.pow} \u2212 ARM ${effArm} = ${damage} DMG`;

      beats.push({
        phase: 'hit',
        badge: damage > 0 ? `HIT \u2212${damage} HP` : '0 DMG HIT',
        actor: attId,
        target: defId,
        damage,
        title: `${att.label}'s ${as.name} connects at Range ${currentDist}`,
        detail: `${armNote}. ${def.label} Life: ${def.hp}/30.`,
      });

      if (isFirst) {
        const stunned = damage > effGrd;
        if (stunned) {
          def.stunned = true;
          const grdNote = as.ignoreGuard && ds.grd > 0
            ? `${damage} DMG breaks Guard (Ignore Guard treats GRD ${ds.grd} as 0)`
            : `${damage} DMG exceeds ${def.label}'s Guard ${effGrd}`;
          beats.push({
            phase: 'stun',
            badge: 'STUNNED',
            actor: defId,
            title: `${def.label}'s ${ds.name} is STUNNED!`,
            detail: `${grdNote} — ${ds.name} is cancelled and sent to Discard.`,
          });
        } else {
          beats.push({
            phase: 'guard',
            badge: 'GUARD HELD',
            actor: defId,
            title: `${def.label} absorbs the hit (Guard ${effGrd} \u2265 ${damage} DMG)`,
            detail: `${ds.name} is NOT Stunned and gets to strike back!`,
          });
        }
      }
    }

    resolveSide(firstId, secondId, true);
    resolveSide(secondId, firstId, false);

    // Cleanup destinations: Hit -> Gauge, Block -> Gauge, Miss/Stunned -> Discard
    for (const id of ['p1', 'p2']) {
      const f = fighters[id];
      if (!f.stunned && (f.hitLanded || f.stats.goesToGaugeEvenOnMiss)) {
        f.destination = 'gauge';
      } else {
        f.destination = 'discard';
      }
    }

    beats.push({
      phase: 'cleanup',
      badge: 'CLEANUP',
      actor: null,
      title: `P1 ${fighters.p1.stats.name} \u2192 ${fighters.p1.destination === 'gauge' ? 'Gauge' : 'Discard'}  \u00b7  P2 ${fighters.p2.stats.name} \u2192 ${fighters.p2.destination === 'gauge' ? 'Gauge' : 'Discard'}`,
      detail: 'Cards that land a hit go to Gauge to fuel Ultras, Exceed, and Criticals. Whiffed or Stunned cards go to Discard.',
    });

    const summary = fighters.p2.stunned
      ? `P1 clean hit & Stun! P2 loses ${30 - fighters.p2.hp} HP and their attack is cancelled.`
      : fighters.p1.stunned
        ? `P2 wins the clash and Stuns P1! P1 loses ${30 - fighters.p1.hp} HP.`
        : (fighters.p1.hitLanded && fighters.p2.hitLanded)
          ? `Full trade! Both attacks connect — P1 at ${fighters.p1.hp} HP, P2 at ${fighters.p2.hp} HP.`
          : fighters.p1.hitLanded
            ? `P1 lands cleanly for ${30 - fighters.p2.hp} DMG while P2 whiffs.`
            : fighters.p2.hitLanded
              ? `P2 punishes for ${30 - fighters.p1.hp} DMG while P1 whiffs.`
              : `Double whiff at Range ${currentDist} — no damage dealt.`;

    return {
      startDist,
      endDist: currentDist,
      initiator,
      firstId,
      secondId,
      speedTie,
      fighters,
      beats,
      summary,
    };
  }

  const NORMALS_SPEED_LADDER = [
    { spd: 0, name: 'Block', range: 'N/A', pow: 0, note: 'Spend Force for +2 ARM each; goes to Gauge' },
    { spd: 1, name: 'Focus', range: '1\u20132', pow: 4, note: '2 ARM / 5 GRD wall; immune to movement' },
    { spd: 2, name: 'Sweep', range: '1\u20133', pow: 6, note: 'Heavy 6 POW / 6 GRD; hit discards 1' },
    { spd: 3, name: 'Spike', range: '2\u20133', pow: 5, note: 'Ignores Armor & Guard (wall-breaker)' },
    { spd: 4, name: 'Dive', range: '1', pow: 5, note: 'Before: Advance 3; side-swap dodge' },
    { spd: 5, name: 'Assault', range: '1', pow: 4, note: 'Before: Close 2; Hit grants Advantage' },
    { spd: 6, name: 'Cross', range: '1\u20132', pow: 3, note: 'Fast poke; After: Retreat 3' },
    { spd: 7, name: 'Grasp', range: '1', pow: 3, note: 'Fastest Normal; Hit pushes/pulls 1\u20132' },
  ];

  const GLOSSARY_ENTRIES = [
    // Core Rules
    { term: 'Life', category: 'Core Rules', def: 'Your health. Starts at 30. Drop your opponent to 0 Life to win the match.' },
    { term: 'Range', category: 'Core Rules', def: 'The distance between the two fighters on the 9-space arena. Each card only hits within its printed Range band.' },
    { term: 'Power (POW)', category: 'Core Rules', def: 'Damage dealt on a hit before the defender\'s Armor is subtracted.' },
    { term: 'Speed (SPD)', category: 'Core Rules', def: 'Determines who resolves first in a Strike. Higher Speed goes first; on a tie, the Strike initiator resolves first.' },
    { term: 'Armor (ARM)', category: 'Core Rules', def: 'Subtracted from incoming Power. Can reduce a hit all the way to 0 damage.' },
    { term: 'Guard (GRD)', category: 'Core Rules', def: 'Stun threshold. If damage taken exceeds Guard before your card activates, your card is Stunned.' },
    { term: 'Boost', category: 'Core Rules', def: 'Playing a card face-up for the effect below the dashed line (buff, draw, movement) instead of attacking with it.' },
    { term: 'Mulligan', category: 'Core Rules', def: 'Once before Turn 1, set aside any cards from your opening hand, draw replacements, then shuffle the set-aside cards back in.' },
    // Combat Mechanics
    { term: 'Stun', category: 'Combat', def: 'If the slower card takes damage exceeding its Guard before activating, it is discarded immediately without dealing damage or triggering effects (unless Stun Immune).' },
    { term: 'EX Strike', category: 'Combat', def: 'Set two matching copies of the same card together for +1 Power, +1 Speed, +1 Armor, and +1 Guard. The second copy is discarded on reveal.' },
    { term: 'Wild Swing', category: 'Combat', def: 'Set the top card of your deck face-down sight unseen instead of a card from hand. Always legal, and mandatory if your hand is empty.' },
    { term: 'Advantage', category: 'Combat', def: 'Whoever holds Advantage takes the next turn instead of turns alternating. If both players gain it, the latest grant wins.' },
    { term: 'Critical', category: 'Combat', def: 'Street Fighter mechanic: pay 1 Gauge when setting a Strike to unlock that card\'s "Critical:" text. Legal to pay on cards without Critical text as a bluff.' },
    { term: 'Cancel', category: 'Combat', def: 'Guilty Gear mechanic: Boosts marked \u23F1 1 are Cancelable. After resolving one, spend 1 Gauge to immediately take another action — chainable as long as you have Gauge.' },
    // Resources
    { term: 'Force', category: 'Resources', def: 'Paid by discarding cards from Hand or Gauge for Move and Boost costs. Every card is worth 1 Force except Ultras, which are worth 2 Force.' },
    { term: 'Gauge', category: 'Resources', def: 'Built when your attacks hit (and via card/Boost effects). Spent on Ultra Strikes, Exceeding, Criticals, and Cancels.' },
    { term: 'Exceed', category: 'Resources', def: 'Once per game, spend Gauge equal to your fighter\'s Exceed cost to permanently upgrade your Innate into its stronger Exceeded form.' },
    { term: 'Ultra', category: 'Resources', def: 'A fighter\'s strongest attacks. Costs Gauge to Strike with; its Boost side costs Force (or 0), never Gauge.' },
    // FGC Strategy — Archetypes & Combat Concepts
    { term: 'Shoto', category: 'FGC Strategy', def: 'Balanced all-rounder with a projectile, reversal DP, and strong normals across ranges (e.g., Ryu, Ken).' },
    { term: 'Zoner', category: 'FGC Strategy', def: 'Controls space from long range and forces the opponent to fight through projectiles to get in (e.g., Guile, Sagat).' },
    { term: 'Rushdown', category: 'FGC Strategy', def: 'Aggressive close-range style focused on closing distance and keeping relentless pressure.' },
    { term: 'Grappler', category: 'FGC Strategy', def: 'Built around terrifying close-range threats, command grabs, and massive payoff at Range 1 (e.g., Zangief, Potemkin).' },
    { term: 'Footsies', category: 'FGC Strategy', def: 'Mid-range spacing battle of poking, baiting whiffs, and controlling distance without over-committing.' },
    { term: 'Punish', category: 'FGC Strategy', def: 'Hitting the opponent cleanly for a whiffed attack, unsafe option, or bad spacing.' },
    { term: 'Reversal', category: 'FGC Strategy', def: 'Strong defensive answer when the opponent initiates a Strike (often a DP with bonus defending Speed).' },
    { term: 'Poke', category: 'FGC Strategy', def: 'Fast, relatively safe attack used to check approaches and control space.' },
    { term: 'Whiff', category: 'FGC Strategy', def: 'An attack that misses out of range. Still triggers After effects and often leaves an opening to punish.' },
    { term: 'Mix-up / 50/50', category: 'FGC Strategy', def: 'Situation where the defender has no single safe answer and must guess between rival threats.' },
    { term: 'Confirm', category: 'FGC Strategy', def: 'Converting a landed hit, Advantage, or read into stronger damage or positioning.' },
    { term: 'Safe / Unsafe', category: 'FGC Strategy', def: 'Whether a play loses heavily to common responses or leaves you protected.' },
    { term: 'Frame Advantage', category: 'FGC Strategy', def: 'Tempo control — in Exceed this maps to gaining Advantage (next turn) or winning Speed exchanges.' },
    { term: 'Corner', category: 'FGC Strategy', def: 'Edge of the 9-space arena. Limits Retreat options and amplifies pressure.' },
    { term: 'Zoning', category: 'FGC Strategy', def: 'Controlling the track from long range to deny the opponent\'s preferred spacing.' },
    { term: 'Pressure', category: 'FGC Strategy', def: 'Chain of threats that forces the opponent to react defensively and shrinks their good options.' },
    { term: 'Checkmate', category: 'FGC Strategy', def: 'Guaranteed lethal line once every possible opponent card loses to your play.' },
    { term: 'Throw / Command Grab', category: 'FGC Strategy', def: 'High-speed or high-reward Range 1 option that cracks passive defense (e.g., Grasp, Spinning Piledriver).' },
    { term: 'Anti-air', category: 'FGC Strategy', def: 'Tool that stuffs advancing approaches (often a fast reversal or Range 1\u20132 check).' },
    { term: 'Meter', category: 'FGC Strategy', def: 'General fighting-game term for Gauge — spend it for power, speed, or special mechanics.' },
    { term: 'Conversion', category: 'FGC Strategy', def: 'Turning a won exchange into meaningful damage, space, or Gauge.' },
    { term: 'Reset', category: 'FGC Strategy', def: 'Ending a sequence to restart pressure or force a fresh mix-up.' },
    { term: 'Option Select (OS)', category: 'FGC Strategy', def: 'Choosing a single play that covers multiple possible opponent responses at once.' },
    // Shorthand
    { term: 'R#', category: 'Shorthand', def: 'Range shorthand (R1, R2, R1\u20133, R3\u20136, etc.).' },
    { term: '[0\u20137]', category: 'Shorthand', def: 'Normals by Speed: 0=Block, 1=Focus, 2=Sweep, 3=Spike, 4=Dive, 5=Assault, 6=Cross, 7=Grasp (e.g., "732" = Grasp + Spike + Sweep).' },
    { term: 'UA', category: 'Shorthand', def: 'Unique Ability — your fighter\'s Innate / Exceeded ability.' },
    { term: 'DP', category: 'Shorthand', def: 'Dragon Punch-style reversal (e.g., Shoryuken, Metsu Shoryuken).' },
    { term: 'CC / CC#', category: 'Shorthand', def: 'Change Cards — spend Force to draw that many new cards.' },
    { term: 'WS', category: 'Shorthand', def: 'Wild Swing — attacking blind from the top of your deck.' },
    { term: 'EX', category: 'Shorthand', def: 'EX Attack — pairing two matching copies for +1 to all stats.' },
    { term: 'Adv', category: 'Shorthand', def: 'Advantage — taking the next turn immediately.' },
    { term: 'Crit', category: 'Shorthand', def: 'Critical — Street Fighter 1-Gauge Strike bonus.' },
    { term: 'Oki', category: 'Shorthand', def: 'Okizeme — follow-up pressure after knocking the opponent into a bad spot.' },
    { term: 'Meaty', category: 'Shorthand', def: 'Timing an aggressive check right as the opponent has to respond.' },
    { term: 'Fuzzy', category: 'Shorthand', def: 'Overlapping options covering multiple speeds or ranges.' },
  ];

  function filterGlossaryEntries(entries, opts) {
    const query = (opts && opts.query ? String(opts.query) : '').trim().toLowerCase();
    const category = (opts && opts.category) || 'All';
    return entries.filter(item => {
      if (category !== 'All' && item.category !== category) return false;
      if (!query) return true;
      return item.term.toLowerCase().includes(query)
        || item.def.toLowerCase().includes(query)
        || item.category.toLowerCase().includes(query);
    });
  }

  return {
    getCatalogCard,
    formatRange,
    evaluateRangeBenchmarks,
    evaluateClashScenario,
    filterGlossaryEntries,
    CLASH_CARD_KEYS,
    CLASH_PRESETS,
    NORMALS_SPEED_LADDER,
    GLOSSARY_ENTRIES,
  };
})();

// ---------------- Command Manual Interactive UI ----------------
const HowToPlayUI = (() => {
  const TABS = [
    { id: 'basics', num: '01', label: 'Fight Basics', short: 'Basics' },
    { id: 'cards', num: '02', label: 'Card Anatomy', short: 'Cards' },
    { id: 'clash', num: '03', label: 'Strike Clash Lab', short: 'Clash Lab' },
    { id: 'icons', num: '04', label: 'Combat Icons', short: 'Icons' },
    { id: 'glossary', num: '05', label: 'Glossary & FGC', short: 'Glossary' },
  ];

  const LEGACY_TAB_MAP = {
    intro: 'basics',
    keywords: 'glossary',
    icons: 'icons',
  };

  const CARD_ARCHETYPES = {
    cross: {
      cardKey: 'cross',
      label: 'Normal',
      sub: 'Cross',
      frameLabel: 'NORMAL (BLUE)',
      accentClass: 'normal',
      tactical: {
        strike: 'Speed 6, Range 1\u20132 \u2014 Fast spacing poke. Retreats 3 after attacking to escape close pressure or set up long-range Specials. Weaker when your back is against the corner.',
        boost: 'Instant, Free \u2014 Advance up to 3. Primary gap-closer or corner-escape tool. Avoid burning both copies early.',
        gameplan: 'Use Cross up close to slip back into zoning distance, or keep it in your mulligan to protect your spacing.',
      },
    },
    hadoken_ryu: {
      cardKey: 'hadoken_ryu',
      label: 'Special',
      sub: 'Hadoken',
      frameLabel: 'SPECIAL (VIOLET)',
      accentClass: 'special',
      tactical: {
        strike: 'Speed 4, Range 3\u20136 \u2014 Signature zoning projectile. Recycles back to deck top on hit while feeding discard into Gauge. Paying 1 Gauge for Critical boosts it to Speed 6.',
        boost: 'Continuous, Free \u2014 +2 Power, +1 Armor. Strong offensive/defensive stat buff when the opponent slips inside zoning range.',
        gameplan: 'Zone from Range 3\u20136 once you hold 1+ Gauge so the opponent must respect Speed 6 Critical Hadoken.',
      },
    },
    metsu_shoryuken: {
      cardKey: 'metsu_shoryuken',
      label: 'Ultra',
      sub: 'Metsu Shoryuken',
      frameLabel: 'ULTRA (ROSE)',
      accentClass: 'ultra',
      tactical: {
        strike: 'Speed 5, Range 1, 4 Gauge \u2014 Devastating 7-Power reversal. Jumps to Speed 8 when the opponent initiates, punishing reckless close-range Strikes.',
        boost: 'Instant, 1 Force \u2014 Move 2, then Strike. High-tempo gap-closer that forces an immediate follow-up Strike (not Cancelable).',
        gameplan: 'Hold as a Range 1 deterrent once you have 4 Gauge, or spend 1 Force on its Boost to close in for a checkmate.',
      },
    },
  };

  const CARD_ZONES = [
    {
      id: 'frame',
      label: 'Card Frame & Type',
      rule: 'Border color identifies the card pool immediately: Blue = Normal (shared 8-card pool, 2 copies each), Violet = Special (fighter-unique, 2 copies each), Rose = Ultra (fighter-unique finisher costing Gauge to Strike).',
    },
    {
      id: 'header',
      label: 'Card Name & Gauge Cost',
      rule: 'The top title is the Strike headline. Ultras show a [NG] Gauge badge here — you must have that much Gauge to set it as an attack (playing its Boost side never costs Gauge).',
    },
    {
      id: 'stats',
      label: 'Combat Stat Bar (R / P / S / A / G)',
      rule: 'R = Range band (exact or span), P = Power (damage before Armor), S = Speed (higher resolves first), A = Armor (subtracts from incoming Power), G = Guard (damage above this Stuns you if slower).',
    },
    {
      id: 'strikeText',
      label: 'Strike Effects (Before / Hit / After)',
      rule: 'Abilities that trigger when set face-down as an attack. "Before:" runs prior to checking Range (often moving you in!). "Hit:" fires only if you connect. "After:" fires after damage/effects unless you were Stunned.',
    },
    {
      id: 'critical',
      label: 'Critical Line (Street Fighter)',
      rule: 'Street Fighter characters may spend 1 Gauge when setting a Strike to unlock yellow "Critical:" bonuses for that clash. If unpaid, the Critical line does nothing. Cards without one can still pay 1G as a bluff.',
    },
    {
      id: 'split',
      label: 'Dashed Split Divider',
      rule: 'Every card is two tools in one: everything ABOVE the dashed line is its face-down Strike attack; everything BELOW is its face-up Boost action.',
    },
    {
      id: 'boostHeader',
      label: 'Boost Header & Cancel Clock',
      rule: 'Labeled BOOST in violet. Continuous boosts stay in play until your next Strike ends. Guilty Gear boosts showing \u23F1 1 are Cancelable — spend 1 Gauge after resolving to take another action immediately.',
    },
    {
      id: 'boostText',
      label: 'Force Cost & Boost Effect',
      rule: 'A [N Force] badge means you discard cards worth that Force from Hand or Gauge to play the Boost (no badge = free). Every card gives 1 Force except Ultras, which give 2 Force.',
    },
  ];

  const COMMAND_ACTIONS = [
    { name: 'Strike', key: 'S', cost: '1 Card', costKind: 'strike', desc: 'Set a card face-down as your attack. Opponent picks a defense, then both flip simultaneously.' },
    { name: 'Boost', key: 'B', cost: '0\u20132 Force', costKind: 'force', desc: 'Play a card face-up for its bottom Boost effect instead of attacking. Draw 1 at end of turn.' },
    { name: 'Move', key: 'M', cost: 'Force / Space', costKind: 'force', desc: 'Discard cards from Hand or Gauge to Advance, Retreat, or pass through your opponent.' },
    { name: 'Change Cards', key: '\u2014', cost: 'Any Force', costKind: 'force', desc: 'Spend cards from Hand or Gauge and draw cards equal to the Force spent, plus end-of-turn draw.' },
    { name: 'Prepare', key: '\u2014', cost: 'Free', costKind: 'free', desc: 'Draw 1 card (plus 1 end-of-turn draw) to refill your hand and build Force.' },
    { name: 'Exceed', key: 'E', cost: '2\u20134 Gauge', costKind: 'gauge', desc: 'Once per game, spend Gauge to permanently flip your fighter into their stronger Exceeded mode.' },
    { name: 'Reshuffle', key: '\u2014', cost: '1\u00d7 Game', costKind: 'once', desc: 'Shuffle your discard pile back into your deck so you never run dry into forced Wild Swings.' },
    { name: 'Fighter Action', key: '\u2605', cost: 'Varies', costKind: 'special', desc: 'Unique Innate/Exceeded move on select fighters (shown with a star icon in your action bar).' },
  ];

  const ICON_GROUPS = [
    {
      id: 'board',
      heading: 'On-Board Strike Callouts',
      note: 'Float directly above a fighter on the 9-space track as each beat of a Strike resolves. Press Space or click Skip to jump straight to the result.',
      items: [
        ['hit', 'Hit', 'Attack connected. The number indicates Life lost after Armor.'],
        ['miss', 'Miss', 'Attack whiffed out of range or the defender was immune.'],
        ['stun', 'Stun', 'Damage exceeded Guard — the slower card is discarded with no effect.'],
        ['move', 'Move', 'Advance, Retreat, Close, Push, or Pull shifted a fighter on the track.'],
        ['armor', 'Armor', 'Block Force or bonus Armor absorbed incoming damage.'],
        ['damage', 'Non-Lethal', 'Effect damage that cannot reduce Life below 1.'],
        ['ex', 'EX Pair', 'Matching second copy discarded for +1 Power, Speed, Armor, and Guard.'],
      ],
    },
    {
      id: 'log',
      heading: 'Fight Log Event Symbols',
      note: 'Prefix entries inside the scrollable fight log so you can scan turns without reading every word.',
      items: [
        ['draw', 'Draw', 'Cards drawn from Prepare, end-of-turn draw, Mulligan, or card effects.'],
        ['discard', 'Discard', 'Cards moved from hand or play into the discard pile.'],
        ['gauge', 'Gauge', 'Gauge gained, spent, or moved into/out of your Gauge pool.'],
        ['force', 'Force', 'Force paid by discarding cards for Move, Boosts, or card effects.'],
        ['boost', 'Boost', 'Card played face-up for its Boost effect or kept in play.'],
        ['boostexpire', 'Boost Expires', 'Timed Continuous Boost finished and converted into Gauge.'],
        ['sustain', 'Sustain', 'Continuous Boost kept in play past normal cleanup.'],
        ['seal', 'Seal', 'Card removed into a sealed area instead of Discard or Gauge.'],
        ['reshuffle', 'Reshuffle', 'Discard pile shuffled back into the deck.'],
        ['heal', 'Heal', 'Life restored, up to maximum Life.'],
        ['exceed', 'Exceed', 'Fighter flipped into their stronger Exceeded mode.'],
        ['revert', 'Revert', 'Exceeded fighter flipped back to their Innate side.'],
        ['overdrive', 'Overdrive', 'BlazBlue Overdrive card ticked at start of turn, triggering its bonus.'],
        ['advantage', 'Advantage', 'Fighter earned the next turn instead of turns alternating.'],
        ['action', 'Bonus Action', 'Effect granted an extra immediate action this turn.'],
        ['immune', 'Immune / Blocked', 'Stun resisted, movement blocked, or illegal option prevented.'],
      ],
    },
  ];

  const GLOSSARY_CATEGORIES = ['All', 'Core Rules', 'Combat', 'Resources', 'FGC Strategy', 'Shorthand'];

  const state = {
    isOpen: false,
    activeTab: 'basics',
    rangeMover: 'p2',
    p1Pos: 2,
    p2Pos: 5,
    archetype: 'cross',
    activeZone: 'stats',
    clash: {
      presetId: 'speed_stun',
      distance: 1,
      initiator: 'p1',
      p1: { cardKey: 'cross', ex: false, crit: false },
      p2: { cardKey: 'assault', ex: false, crit: false },
      result: null,
    },
    iconsFilter: 'all',
    glossaryQuery: '',
    glossaryCategory: 'All',
  };

  function safeEsc(str) {
    if (typeof esc === 'function') return esc(str);
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function safeFxIcon(kind) {
    if (typeof fxIcon === 'function') return fxIcon(kind);
    return '';
  }

  function playSfx(cueName, arg) {
    try {
      if (typeof AudioManager !== 'undefined' && AudioManager.cues && typeof AudioManager.cues[cueName] === 'function') {
        AudioManager.cues[cueName](arg);
      }
    } catch (_) {
      // Headless or muted context — ignore cleanly
    }
  }

  function ensureInitialClashResult() {
    if (!state.clash.result) {
      state.clash.result = HowToPlayLogic.evaluateClashScenario(state.clash);
    }
  }

  function highlightMatch(text, query) {
    const escaped = safeEsc(text);
    const q = (query || '').trim();
    if (!q) return escaped;
    const safeQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
      return escaped.replace(new RegExp(`(${safeQ})`, 'gi'), '<mark class="htp-mark">$1</mark>');
    } catch (_) {
      return escaped;
    }
  }

  function renderBasicsSection() {
    const rangeInfo = HowToPlayLogic.evaluateRangeBenchmarks(state.p1Pos, state.p2Pos);

    const cellsHTML = Array.from({ length: 9 }, (_, i) => {
      const isP1 = i === rangeInfo.p1Pos;
      const isP2 = i === rangeInfo.p2Pos;
      const minP = Math.min(rangeInfo.p1Pos, rangeInfo.p2Pos);
      const maxP = Math.max(rangeInfo.p1Pos, rangeInfo.p2Pos);
      const inGap = i > minP && i < maxP;
      const cls = [
        'htp-stage-cell',
        isP1 ? 'has-p1' : '',
        isP2 ? 'has-p2' : '',
        inGap ? 'in-gap' : '',
      ].filter(Boolean).join(' ');
      const occupant = isP1
        ? '<span class="htp-fighter-chip p1">P1</span>'
        : isP2
          ? '<span class="htp-fighter-chip p2">P2</span>'
          : `<span class="htp-cell-idx">${i + 1}</span>`;
      const aria = isP1
        ? `Space ${i + 1}, Player 1`
        : isP2
          ? `Space ${i + 1}, Player 2`
          : `Move ${state.rangeMover.toUpperCase()} to space ${i + 1}`;
      return `<button type="button" class="${cls}" aria-label="${aria}" onclick="HowToPlayUI.moveRangeDemo(${i})">${occupant}</button>`;
    }).join('');

    const benchHTML = rangeInfo.benchmarks.map(b => `
      <div class="htp-bench-card ${b.inRange ? 'is-in' : 'is-out'}">
        <div class="htp-bench-top">
          <span class="htp-bench-name">${safeEsc(b.name)}</span>
          <span class="htp-bench-status ${b.inRange ? 'in' : 'out'}">${b.inRange ? 'IN RANGE' : 'OUT'}</span>
        </div>
        <div class="htp-bench-meta">
          <span>RNG ${safeEsc(b.rangeLabel)}</span>
          <span aria-hidden="true">\u00b7</span>
          <span>SPD ${b.spd}</span>
          <span aria-hidden="true">\u00b7</span>
          <span>POW ${b.pow}</span>
        </div>
        <div class="htp-bench-role">${safeEsc(b.role)}</div>
      </div>
    `).join('');

    const actionsHTML = COMMAND_ACTIONS.map(a => `
      <div class="htp-cmd-row">
        <div class="htp-cmd-name-col">
          <span class="htp-keycap">${safeEsc(a.key)}</span>
          <span class="htp-cmd-name">${safeEsc(a.name)}</span>
        </div>
        <div class="htp-cmd-cost cost-${a.costKind}">${safeEsc(a.cost)}</div>
        <div class="htp-cmd-desc">${safeEsc(a.desc)}</div>
      </div>
    `).join('');

    return `
      <div class="htp-pane" data-testid="htp-pane-basics">
        <div class="htp-section-head">
          <div class="htp-kicker">01 \u00b7 60-Second Match Briefing</div>
          <h3 class="htp-title">Control Space, Win the Clash, Fuel Your Gauge</h3>
          <p class="htp-lead">Both fighters start at <strong>30 Life</strong> on a 9-space arena. Drop your rival to 0 Life first. Every card doubles as a face-down attack (Strike) or a face-up utility move (Boost).</p>
        </div>

        <div class="htp-brief-strip">
          <div class="htp-brief-block">
            <div class="htp-brief-num">30 HP</div>
            <div class="htp-brief-label">Match Goal</div>
            <p>Reduce opponent Life to 0. Both fighters deal simultaneous mind-games every Strike.</p>
          </div>
          <div class="htp-brief-block">
            <div class="htp-brief-num">1\u00d7 FREE</div>
            <div class="htp-brief-label">Opening Mulligan</div>
            <p>Before Turn 1, set aside any opening cards, draw replacements, then shuffle the set-aside cards back.</p>
          </div>
          <div class="htp-brief-block">
            <div class="htp-brief-num">7 MAX</div>
            <div class="htp-brief-label">Hand Limit &amp; Draw</div>
            <p>After any non-Strike turn, draw 1 card. If over 7 cards at end of turn, discard down to 7.</p>
          </div>
        </div>

        <div class="htp-panel">
          <div class="htp-panel-head">
            <h4>The Core Resource Loop</h4>
            <span class="htp-panel-sub">Hits build meter \u00b7 Misses cost cards \u00b7 Hand &amp; Gauge pay Force</span>
          </div>
          <div class="htp-loop-grid">
            <div class="htp-loop-node loop-hit">
              <div class="htp-loop-step">STEP 1 \u00b7 CONNECT</div>
              <div class="htp-loop-title">Strike Hits \u2192 Gauge</div>
              <p>Landed attacks go into your <strong>Gauge</strong> instead of Discard, fueling Ultras, Exceed, Criticals, and Cancels.</p>
            </div>
            <div class="htp-loop-arrow" aria-hidden="true">\u279c</div>
            <div class="htp-loop-node loop-miss">
              <div class="htp-loop-step">STEP 2 \u00b7 WHIFF / STUN</div>
              <div class="htp-loop-title">Miss or Stun \u2192 Discard</div>
              <p>Out-of-range or Stunned cards go to Discard \u2014 no Gauge gained until you draw or Reshuffle.</p>
            </div>
            <div class="htp-loop-arrow" aria-hidden="true">\u279c</div>
            <div class="htp-loop-node loop-force">
              <div class="htp-loop-step">STEP 3 \u00b7 CONVERT</div>
              <div class="htp-loop-title">Spend Cards \u2192 Force</div>
              <p>Discard from Hand or Gauge to pay <strong>Force</strong> for Move &amp; Boosts. Normal/Special = 1 Force, Ultra = 2 Force.</p>
            </div>
          </div>
        </div>

        <div class="htp-panel">
          <div class="htp-panel-head">
            <h4>Interactive 9-Space Arena &amp; Range Check</h4>
            <div class="htp-inline-switch" role="group" aria-label="Select fighter to move">
              <button type="button" class="htp-seg-btn ${state.rangeMover === 'p1' ? 'active p1' : ''}" onclick="HowToPlayUI.setRangeMover('p1')">Move P1</button>
              <button type="button" class="htp-seg-btn ${state.rangeMover === 'p2' ? 'active p2' : ''}" onclick="HowToPlayUI.setRangeMover('p2')">Move P2</button>
            </div>
          </div>
          <div class="htp-range-readout-row">
            <span>Click any arena space to reposition <strong>${state.rangeMover === 'p1' ? 'P1 (You)' : 'P2 (CPU)'}</strong></span>
            <span class="htp-range-metric" data-testid="htp-range-distance">CURRENT RANGE: <strong>${rangeInfo.distance}</strong></span>
          </div>
          <div class="htp-stage-track" role="group" aria-label="9-space arena track">
            ${cellsHTML}
          </div>
          <div class="htp-bench-grid">
            ${benchHTML}
          </div>
        </div>

        <div class="htp-panel">
          <div class="htp-panel-head">
            <h4>Turn Command List</h4>
            <span class="htp-panel-sub">Pick 1 action on your turn</span>
          </div>
          <div class="htp-cmd-table">
            <div class="htp-cmd-head-row">
              <span>Command</span>
              <span>Cost</span>
              <span>Effect</span>
            </div>
            ${actionsHTML}
          </div>
        </div>

        <div class="htp-panel">
          <div class="htp-panel-head">
            <h4>Fighter Styles Across Seasons</h4>
            <span class="htp-panel-sub">Your fighter's panel always shows their exact Innate &amp; Exceeded rules</span>
          </div>
          <div class="htp-season-grid">
            <div class="htp-season-box">
              <div class="htp-season-tag sf">Street Fighter</div>
              <h5>Critical (1 Gauge)</h5>
              <p>Street Fighter characters can pay 1 Gauge when setting a Strike to unlock yellow <strong>Critical:</strong> bonuses (or bluff on a card without one). Guilty Gear and BlazBlue fighters do not use the Critical mechanic.</p>
            </div>
            <div class="htp-season-box">
              <div class="htp-season-tag gg">Guilty Gear Strive</div>
              <h5>Cancelable Boosts (\u23F1 1)</h5>
              <p>After resolving a Boost marked <strong>\u23F1 1</strong>, spend 1 Gauge to chain immediately into another action without ending your turn.</p>
            </div>
            <div class="htp-season-box">
              <div class="htp-season-tag bb">BlazBlue</div>
              <h5>Overdrive &amp; Astral Heat</h5>
              <p>Exceeding loads Gauge into Overdrive that ticks each turn for bonus effects; Reshuffling unlocks your hidden Astral Heat finisher.</p>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderCardsSection() {
    const meta = CARD_ARCHETYPES[state.archetype] || CARD_ARCHETYPES.cross;
    const card = HowToPlayLogic.getCatalogCard(meta.cardKey);
    const activeZoneObj = CARD_ZONES.find(z => z.id === state.activeZone) || CARD_ZONES[0];
    const activeIdx = CARD_ZONES.findIndex(z => z.id === activeZoneObj.id);
    const hasCritical = !!card.criticalText;
    const boostForce = card.boost ? (card.boost.force || 0) : 0;
    const isContinuous = !!(card.boost && card.boost.continuous);

    const archetypeBtns = Object.entries(CARD_ARCHETYPES).map(([key, info]) => `
      <button type="button"
        class="htp-arch-btn ${state.archetype === key ? 'active ' + info.accentClass : ''}"
        aria-pressed="${state.archetype === key ? 'true' : 'false'}"
        onclick="HowToPlayUI.setArchetype('${key}')">
        <span class="htp-arch-type">${safeEsc(info.label)}</span>
        <span class="htp-arch-name">${safeEsc(info.sub)}</span>
      </button>
    `).join('');

    const zoneHotspotClass = (id) => `htp-card-zone ${state.activeZone === id ? 'is-active' : ''}`;

    const zoneButtonsHTML = CARD_ZONES.map((z, idx) => `
      <button type="button"
        class="htp-zone-index-btn ${state.activeZone === z.id ? 'active' : ''}"
        onclick="HowToPlayUI.setCardZone('${z.id}')">
        <span class="htp-zone-num">${idx + 1}</span>
        <span>${safeEsc(z.label)}</span>
      </button>
    `).join('');

    return `
      <div class="htp-pane" data-testid="htp-pane-cards">
        <div class="htp-section-head">
          <div class="htp-kicker">02 \u00b7 Interactive Card Anatomy</div>
          <h3 class="htp-title">Two Halves in One: Strike Top, Boost Bottom</h3>
          <p class="htp-lead">Switch between Normal, Special, and Ultra examples, then click any part of the card to inspect what it controls in combat.</p>
        </div>

        <div class="htp-arch-bar" role="group" aria-label="Select card archetype">
          ${archetypeBtns}
        </div>

        <div class="htp-inspector-layout">
          <div class="htp-card-stage">
            <div class="htp-live-card card-${meta.accentClass} ${state.activeZone === 'frame' ? 'frame-focused' : ''}" data-testid="htp-live-card">
              <button type="button" class="htp-frame-tab ${state.activeZone === 'frame' ? 'is-active' : ''}" onclick="HowToPlayUI.setCardZone('frame')">
                <span>${safeEsc(meta.frameLabel)}</span>
                <span class="htp-zone-dot">1</span>
              </button>

              <button type="button" class="${zoneHotspotClass('header')} htp-zone-header" onclick="HowToPlayUI.setCardZone('header')">
                <span class="htp-live-name">${safeEsc(card.name)}</span>
                ${card.gaugeCost ? `<span class="htp-live-gauge">[${card.gaugeCost}G]</span>` : '<span class="htp-live-free-tag">0G Strike</span>'}
                <span class="htp-zone-dot">2</span>
              </button>

              <button type="button" class="${zoneHotspotClass('stats')} htp-zone-stats" onclick="HowToPlayUI.setCardZone('stats')">
                <div class="htp-live-stat-row">
                  <div class="htp-stat-cell stat-rng"><span class="htp-stat-k">${typeof statIconSVG === 'function' ? statIconSVG('rng') : ''}R</span><span class="htp-stat-v">${safeEsc(HowToPlayLogic.formatRange(card.range))}</span></div>
                  <div class="htp-stat-cell stat-pow"><span class="htp-stat-k">${typeof statIconSVG === 'function' ? statIconSVG('pow') : ''}P</span><span class="htp-stat-v">${card.pow}</span></div>
                  <div class="htp-stat-cell stat-spd"><span class="htp-stat-k">${typeof statIconSVG === 'function' ? statIconSVG('spd') : ''}S</span><span class="htp-stat-v">${card.spd}</span></div>
                  <div class="htp-stat-cell stat-arm"><span class="htp-stat-k">${typeof statIconSVG === 'function' ? statIconSVG('arm') : ''}A</span><span class="htp-stat-v">${card.arm}</span></div>
                  <div class="htp-stat-cell stat-grd"><span class="htp-stat-k">${typeof statIconSVG === 'function' ? statIconSVG('grd') : ''}G</span><span class="htp-stat-v">${card.grd}</span></div>
                </div>
                <span class="htp-zone-dot">3</span>
              </button>

              <button type="button" class="${zoneHotspotClass('strikeText')} htp-zone-text" onclick="HowToPlayUI.setCardZone('strikeText')">
                <span class="htp-live-body">${safeEsc(card.text || 'Standard Strike attack.')}</span>
                <span class="htp-zone-dot">4</span>
              </button>

              <button type="button" class="${zoneHotspotClass('critical')} htp-zone-crit ${hasCritical ? 'has-crit' : 'no-crit'}" onclick="HowToPlayUI.setCardZone('critical')">
                <span class="htp-live-crit">${hasCritical ? safeEsc(card.criticalText) : 'No Critical line on this card (1G bluff still legal)'}</span>
                <span class="htp-zone-dot">5</span>
              </button>

              <button type="button" class="${zoneHotspotClass('split')} htp-zone-split" onclick="HowToPlayUI.setCardZone('split')" aria-label="Inspect Strike and Boost divider">
                <span class="htp-split-line"></span>
                <span class="htp-split-tag">STRIKE / BOOST SPLIT</span>
                <span class="htp-split-line"></span>
                <span class="htp-zone-dot">6</span>
              </button>

              <button type="button" class="${zoneHotspotClass('boostHeader')} htp-zone-bhead" onclick="HowToPlayUI.setCardZone('boostHeader')">
                <span class="htp-live-boost-title">BOOST</span>
                <span class="htp-live-boost-kind">${isContinuous ? 'Continuous' : 'Instant'}</span>
                <span class="htp-zone-dot">7</span>
              </button>

              <button type="button" class="${zoneHotspotClass('boostText')} htp-zone-btext" onclick="HowToPlayUI.setCardZone('boostText')">
                <div class="htp-live-btext-wrap">
                  ${boostForce > 0 ? `<span class="htp-live-force">[${boostForce} Force]</span>` : '<span class="htp-live-force free">Free Boost</span>'}
                  <span class="htp-live-bbody">${safeEsc(card.boostText || '')}</span>
                </div>
                <span class="htp-zone-dot">8</span>
              </button>
            </div>
          </div>

          <div class="htp-inspector-readout">
            <div class="htp-readout-card" data-testid="htp-zone-readout">
              <div class="htp-readout-top">
                <span class="htp-readout-step">PART ${activeIdx + 1} OF ${CARD_ZONES.length}</span>
                <div class="htp-readout-nav">
                  <button type="button" class="htp-mini-btn" onclick="HowToPlayUI.stepCardZone(-1)">\u2190 Prev</button>
                  <button type="button" class="htp-mini-btn primary" onclick="HowToPlayUI.stepCardZone(1)">Next Part \u2192</button>
                </div>
              </div>
              <h4 class="htp-readout-title">${safeEsc(activeZoneObj.label)}</h4>
              <p class="htp-readout-rule">${safeEsc(activeZoneObj.rule)}</p>
            </div>

            <div class="htp-tactical-box">
              <div class="htp-tactical-head">Tactical Playbook \u2014 ${safeEsc(card.name)} (${safeEsc(meta.label)})</div>
              <div class="htp-tactical-row">
                <span class="htp-tactical-label">Strike Side</span>
                <p>${safeEsc(meta.tactical.strike)}</p>
              </div>
              <div class="htp-tactical-row">
                <span class="htp-tactical-label">Boost Side</span>
                <p>${safeEsc(meta.tactical.boost)}</p>
              </div>
              <div class="htp-tactical-row">
                <span class="htp-tactical-label">Gameplan</span>
                <p>${safeEsc(meta.tactical.gameplan)}</p>
              </div>
            </div>

            <div class="htp-zone-index" role="group" aria-label="Jump to card part">
              ${zoneButtonsHTML}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderClashSection() {
    ensureInitialClashResult();
    const res = state.clash.result;
    const p1 = res.fighters.p1;
    const p2 = res.fighters.p2;

    const presetsHTML = HowToPlayLogic.CLASH_PRESETS.map(p => `
      <button type="button"
        class="htp-preset-btn ${state.clash.presetId === p.id ? 'active' : ''}"
        onclick="HowToPlayUI.loadClashPreset('${p.id}')">
        <span class="htp-preset-title">${safeEsc(p.title)}</span>
        <span class="htp-preset-sub">${safeEsc(p.subtitle)}</span>
      </button>
    `).join('');

    const cardOptions = (selectedKey) => HowToPlayLogic.CLASH_CARD_KEYS.map(k => {
      const c = HowToPlayLogic.getCatalogCard(k);
      return `<option value="${k}" ${selectedKey === k ? 'selected' : ''}>${safeEsc(c.name)} (R ${HowToPlayLogic.formatRange(c.range)} \u00b7 P${c.pow} \u00b7 S${c.spd})</option>`;
    }).join('');

    const distButtons = [1, 2, 3, 4, 5, 6].map(d => `
      <button type="button"
        class="htp-dist-btn ${state.clash.distance === d ? 'active' : ''}"
        aria-pressed="${state.clash.distance === d ? 'true' : 'false'}"
        onclick="HowToPlayUI.setClashDistance(${d})">R${d}</button>
    `).join('');

    const p1HpPct = Math.round((p1.hp / 30) * 100);
    const p2HpPct = Math.round((p2.hp / 30) * 100);

    const beatsHTML = res.beats.map((b, idx) => `
      <div class="htp-beat-row phase-${b.phase}">
        <div class="htp-beat-num">${idx + 1}</div>
        <div class="htp-beat-main">
          <div class="htp-beat-top">
            <span class="htp-beat-badge phase-${b.phase}">${safeEsc(b.badge)}</span>
            <span class="htp-beat-title">${safeEsc(b.title)}</span>
          </div>
          <p class="htp-beat-detail">${safeEsc(b.detail)}</p>
        </div>
      </div>
    `).join('');

    return `
      <div class="htp-pane" data-testid="htp-pane-clash">
        <div class="htp-section-head">
          <div class="htp-kicker">03 \u00b7 Interactive Strike Clash Lab</div>
          <h3 class="htp-title">Test Speed, Range, Armor &amp; Stun Live</h3>
          <p class="htp-lead">Pick a scenario or mix your own cards below. Higher <strong>Speed</strong> strikes first; damage exceeding <strong>Guard</strong> Stuns and cancels the slower card.</p>
        </div>

        <div class="htp-preset-grid" role="group" aria-label="Strike clash presets">
          ${presetsHTML}
        </div>

        <div class="htp-clash-controls">
          <div class="htp-clash-corner p1">
            <div class="htp-corner-head">
              <span class="htp-corner-tag p1">P1 \u00b7 YOU</span>
              <span class="htp-corner-hp" data-testid="htp-clash-p1-hp">${p1.hp} / 30 HP</span>
            </div>
            <div class="htp-mini-hp-track"><div class="htp-mini-hp-fill p1" style="width:${p1HpPct}%"></div></div>
            <label class="htp-field-label" for="htp-p1-card">P1 Attack Card</label>
            <select id="htp-p1-card" class="htp-select" onchange="HowToPlayUI.setClashCard('p1', this.value)">
              ${cardOptions(state.clash.p1.cardKey)}
            </select>
            <div class="htp-corner-stats">
              ${typeof statPillHTML === 'function' ? statPillHTML('rng', p1.stats.rangeLabel) : `<span class="stat-rng">R ${safeEsc(p1.stats.rangeLabel)}</span>`}
              ${typeof statPillHTML === 'function' ? statPillHTML('pow', p1.stats.pow) : `<span class="stat-pow">P ${p1.stats.pow}</span>`}
              ${typeof statPillHTML === 'function' ? statPillHTML('spd', p1.stats.spd) : `<span class="stat-spd">S ${p1.stats.spd}</span>`}
              ${typeof statPillHTML === 'function' ? statPillHTML('arm', p1.stats.arm) : `<span class="stat-arm">A ${p1.stats.arm}</span>`}
              ${typeof statPillHTML === 'function' ? statPillHTML('grd', p1.stats.grd) : `<span class="stat-grd">G ${p1.stats.grd}</span>`}
            </div>
            <div class="htp-mod-row">
              <button type="button" class="htp-mod-btn ${state.clash.p1.ex ? 'active' : ''}" aria-pressed="${state.clash.p1.ex}" onclick="HowToPlayUI.toggleClashMod('p1','ex')">EX (+1 All)</button>
              <button type="button" class="htp-mod-btn ${state.clash.p1.crit ? 'active' : ''}" ${p1.stats.hasCritOption ? '' : 'disabled'} aria-pressed="${state.clash.p1.crit}" onclick="HowToPlayUI.toggleClashMod('p1','crit')">Critical (1G)</button>
            </div>
          </div>

          <div class="htp-clash-center">
            <div class="htp-vs-mark">VS</div>
            <div class="htp-center-group">
              <span class="htp-center-label">Start Range</span>
              <div class="htp-dist-row" role="group" aria-label="Starting range">${distButtons}</div>
            </div>
            <div class="htp-center-group">
              <span class="htp-center-label">Initiator (Wins Ties)</span>
              <div class="htp-inline-switch" role="group" aria-label="Strike initiator">
                <button type="button" class="htp-seg-btn ${state.clash.initiator === 'p1' ? 'active p1' : ''}" onclick="HowToPlayUI.setClashInitiator('p1')">P1</button>
                <button type="button" class="htp-seg-btn ${state.clash.initiator === 'p2' ? 'active p2' : ''}" onclick="HowToPlayUI.setClashInitiator('p2')">P2</button>
              </div>
            </div>
            <button type="button" class="htp-resolve-btn" onclick="HowToPlayUI.runClash(true)">Resolve Clash</button>
          </div>

          <div class="htp-clash-corner p2">
            <div class="htp-corner-head">
              <span class="htp-corner-tag p2">P2 \u00b7 CPU</span>
              <span class="htp-corner-hp" data-testid="htp-clash-p2-hp">${p2.hp} / 30 HP</span>
            </div>
            <div class="htp-mini-hp-track"><div class="htp-mini-hp-fill p2" style="width:${p2HpPct}%"></div></div>
            <label class="htp-field-label" for="htp-p2-card">P2 Attack Card</label>
            <select id="htp-p2-card" class="htp-select" onchange="HowToPlayUI.setClashCard('p2', this.value)">
              ${cardOptions(state.clash.p2.cardKey)}
            </select>
            <div class="htp-corner-stats">
              ${typeof statPillHTML === 'function' ? statPillHTML('rng', p2.stats.rangeLabel) : `<span class="stat-rng">R ${safeEsc(p2.stats.rangeLabel)}</span>`}
              ${typeof statPillHTML === 'function' ? statPillHTML('pow', p2.stats.pow) : `<span class="stat-pow">P ${p2.stats.pow}</span>`}
              ${typeof statPillHTML === 'function' ? statPillHTML('spd', p2.stats.spd) : `<span class="stat-spd">S ${p2.stats.spd}</span>`}
              ${typeof statPillHTML === 'function' ? statPillHTML('arm', p2.stats.arm) : `<span class="stat-arm">A ${p2.stats.arm}</span>`}
              ${typeof statPillHTML === 'function' ? statPillHTML('grd', p2.stats.grd) : `<span class="stat-grd">G ${p2.stats.grd}</span>`}
            </div>
            <div class="htp-mod-row">
              <button type="button" class="htp-mod-btn ${state.clash.p2.ex ? 'active' : ''}" aria-pressed="${state.clash.p2.ex}" onclick="HowToPlayUI.toggleClashMod('p2','ex')">EX (+1 All)</button>
              <button type="button" class="htp-mod-btn ${state.clash.p2.crit ? 'active' : ''}" ${p2.stats.hasCritOption ? '' : 'disabled'} aria-pressed="${state.clash.p2.crit}" onclick="HowToPlayUI.toggleClashMod('p2','crit')">Critical (1G)</button>
            </div>
          </div>
        </div>

        <div class="htp-clash-verdict ${p1.stunned || (!p1.hitLanded && p2.hitLanded) ? 'verdict-p2' : (p2.stunned || (p1.hitLanded && !p2.hitLanded)) ? 'verdict-p1' : (p1.hitLanded && p2.hitLanded) ? 'verdict-trade' : 'verdict-whiff'}" data-testid="htp-clash-summary">
          <span class="htp-verdict-label">OUTCOME</span>
          <span class="htp-verdict-text">${safeEsc(res.summary)}</span>
        </div>

        <div class="htp-beat-list" data-testid="htp-clash-beats">
          ${beatsHTML}
        </div>
      </div>
    `;
  }

  function renderIconsSection() {
    const groups = ICON_GROUPS.filter(g => state.iconsFilter === 'all' || state.iconsFilter === g.id);

    const groupsHTML = groups.map(group => `
      <div class="htp-panel">
        <div class="htp-panel-head">
          <h4>${safeEsc(group.heading)}</h4>
          <span class="htp-panel-sub">${group.items.length} symbols</span>
        </div>
        <p class="htp-icon-group-note">${safeEsc(group.note)}</p>
        <div class="htp-icon-grid">
          ${group.items.map(([kind, label, def]) => `
            <div class="htp-icon-card ${group.id === 'board' ? 'is-board' : 'is-log'}">
              <div class="htp-icon-token ${group.id === 'board' ? 'board-style kind-' + kind : 'log-style'}" aria-hidden="true">${safeFxIcon(kind)}</div>
              <div class="htp-icon-copy">
                <div class="htp-icon-title">${safeEsc(label)}</div>
                <p>${safeEsc(def)}</p>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

    return `
      <div class="htp-pane" data-testid="htp-pane-icons">
        <div class="htp-section-head">
          <div class="htp-kicker">04 \u00b7 Visual Combat Callouts</div>
          <h3 class="htp-title">Read Every Exchange at a Glance</h3>
          <p class="htp-lead">Board badges float over fighters during Strike playback while log symbols summarize every draw, spend, and state change.</p>
        </div>

        <div class="htp-filter-bar" role="group" aria-label="Filter icon groups">
          <button type="button" class="htp-filter-btn ${state.iconsFilter === 'all' ? 'active' : ''}" onclick="HowToPlayUI.setIconsFilter('all')">All Symbols (23)</button>
          <button type="button" class="htp-filter-btn ${state.iconsFilter === 'board' ? 'active' : ''}" onclick="HowToPlayUI.setIconsFilter('board')">On-Board FX (7)</button>
          <button type="button" class="htp-filter-btn ${state.iconsFilter === 'log' ? 'active' : ''}" onclick="HowToPlayUI.setIconsFilter('log')">Fight Log (16)</button>
        </div>

        ${groupsHTML}
      </div>
    `;
  }

  function renderGlossaryListMarkup() {
    const filtered = HowToPlayLogic.filterGlossaryEntries(HowToPlayLogic.GLOSSARY_ENTRIES, {
      query: state.glossaryQuery,
      category: state.glossaryCategory,
    });

    if (filtered.length === 0) {
      return `
        <div class="htp-empty-state" data-testid="htp-glossary-empty">
          <div class="htp-empty-title">No matching terms for "${safeEsc(state.glossaryQuery)}"</div>
          <p>Try searching for Stun, Force, Critical, DP, Footsies, or 732.</p>
          <button type="button" class="htp-mini-btn primary" onclick="HowToPlayUI.clearGlossaryFilters()">Clear search</button>
        </div>
      `;
    }

    return `
      <div class="htp-glossary-meta" data-testid="htp-glossary-count">
        Showing <strong>${filtered.length}</strong> of ${HowToPlayLogic.GLOSSARY_ENTRIES.length} entries
      </div>
      <div class="htp-glossary-grid">
        ${filtered.map(item => `
          <div class="htp-gloss-card">
            <div class="htp-gloss-top">
              <span class="htp-gloss-term">${highlightMatch(item.term, state.glossaryQuery)}</span>
              <span class="htp-gloss-cat">${safeEsc(item.category)}</span>
            </div>
            <p class="htp-gloss-def">${highlightMatch(item.def, state.glossaryQuery)}</p>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderGlossarySection() {
    const ladderHTML = HowToPlayLogic.NORMALS_SPEED_LADDER.map(n => `
      <div class="htp-ladder-cell">
        <div class="htp-ladder-spd">${typeof statIconSVG === 'function' ? statIconSVG('spd') : ''}S${n.spd}</div>
        <div class="htp-ladder-name">${safeEsc(n.name)}</div>
        <div class="htp-ladder-rng">${typeof statIconSVG === 'function' ? statIconSVG('rng') : ''}R ${safeEsc(n.range)}</div>
      </div>
    `).join('');

    const catButtons = GLOSSARY_CATEGORIES.map(cat => `
      <button type="button"
        class="htp-filter-btn ${state.glossaryCategory === cat ? 'active' : ''}"
        aria-pressed="${state.glossaryCategory === cat ? 'true' : 'false'}"
        onclick="HowToPlayUI.setGlossaryCategory('${cat}')">${safeEsc(cat)}</button>
    `).join('');

    return `
      <div class="htp-pane" data-testid="htp-pane-glossary">
        <div class="htp-section-head">
          <div class="htp-kicker">05 \u00b7 Rules Reference &amp; FGC Lexicon</div>
          <h3 class="htp-title">Every Keyword, Shorthand &amp; Fighting-Game Term</h3>
          <p class="htp-lead">Instant lookup for card keywords, community notation, and fighting-game concepts used in Exceed matchups.</p>
        </div>

        <div class="htp-panel">
          <div class="htp-panel-head">
            <h4>Normals Speed Ladder (0 \u2192 7)</h4>
            <span class="htp-panel-sub">Shared by Street Fighter &amp; core fighters \u00b7 Shorthand e.g. "732" = Grasp, Spike, Sweep</span>
          </div>
          <div class="htp-ladder-strip">
            ${ladderHTML}
          </div>
        </div>

        <div class="htp-search-toolbar">
          <label class="htp-sr-only" for="htp-glossary-search">Search keywords and fighting game terms</label>
          <input
            id="htp-glossary-search"
            type="search"
            class="htp-search-input"
            placeholder="Search terms (e.g. Stun, Force, Critical, DP, Footsies, 732)..."
            value="${safeEsc(state.glossaryQuery)}"
            oninput="HowToPlayUI.setGlossaryQuery(this.value)"
          />
          <button type="button" id="htp-glossary-reset" class="htp-mini-btn" style="display:${state.glossaryQuery ? 'inline-flex' : 'none'}" onclick="HowToPlayUI.clearGlossaryFilters()">Reset</button>
        </div>

        <div class="htp-filter-bar" role="group" aria-label="Glossary categories">
          ${catButtons}
        </div>

        <div id="htp-glossary-results">
          ${renderGlossaryListMarkup()}
        </div>
      </div>
    `;
  }

  function renderActiveBody() {
    switch (state.activeTab) {
      case 'cards': return renderCardsSection();
      case 'clash': return renderClashSection();
      case 'icons': return renderIconsSection();
      case 'glossary': return renderGlossarySection();
      case 'basics':
      default:
        return renderBasicsSection();
    }
  }

  function renderModal() {
    const box = typeof document !== 'undefined' ? document.getElementById('howToPlayBox') : null;
    if (!box) return;

    const currentIdx = TABS.findIndex(t => t.id === state.activeTab);
    const prevTab = currentIdx > 0 ? TABS[currentIdx - 1] : null;
    const nextTab = currentIdx >= 0 && currentIdx < TABS.length - 1 ? TABS[currentIdx + 1] : null;
    const inActiveMatch = typeof G !== 'undefined' && !!G;

    const navHTML = TABS.map(t => `
      <button type="button"
        role="tab"
        aria-selected="${state.activeTab === t.id ? 'true' : 'false'}"
        class="htp-rail-btn ${state.activeTab === t.id ? 'active' : ''}"
        onclick="HowToPlayUI.setTab('${t.id}')">
        <span class="htp-rail-num">${t.num}</span>
        <span class="htp-rail-label">${t.label}</span>
      </button>
    `).join('');

    box.innerHTML = `
      <div class="htp-shell" role="dialog" aria-modal="true" aria-labelledby="htp-dialog-title">
        <div class="htp-topbar">
          <div class="htp-brand">
            <span class="htp-brand-mark">EXCEED</span>
            <h2 id="htp-dialog-title" class="htp-brand-title">Command Manual</h2>
          </div>
          <div class="htp-topbar-actions">
            ${!inActiveMatch ? '<button type="button" class="htp-quick-cta" onclick="HowToPlayUI.launchQuickStart()">Quick Start</button>' : '<button type="button" class="htp-quick-cta" onclick="closeHowToPlay()">Resume</button>'}
            <button type="button" class="htp-close-btn" aria-label="Close Command Manual" onclick="closeHowToPlay()">\u2715</button>
          </div>
        </div>

        <div class="htp-workspace">
          <nav class="htp-rail" role="tablist" aria-label="Command manual sections">
            ${navHTML}
          </nav>
          <div class="htp-stage" id="htp-stage-scroll" tabindex="0">
            ${renderActiveBody()}
          </div>
        </div>

        <div class="htp-footer">
          <div class="htp-keyhints">
            <span>ESC Close</span>
            <span aria-hidden="true">\u00b7</span>
            <span>\u2190 / \u2192 Switch Section</span>
            <span aria-hidden="true">\u00b7</span>
            <span>1\u20135 Jump</span>
            <span aria-hidden="true">\u00b7</span>
            <span>F Fullscreen</span>
          </div>
          <div class="htp-footer-nav">
            <button type="button" class="htp-mini-btn" ${prevTab ? `onclick="HowToPlayUI.setTab('${prevTab.id}')"` : 'disabled'}>${prevTab ? `\u2190 ${prevTab.num}. ${prevTab.short}` : '\u2190 Start'}</button>
            <button type="button" class="htp-mini-btn primary" ${nextTab ? `onclick="HowToPlayUI.setTab('${nextTab.id}')"` : 'onclick="closeHowToPlay()"'}>${nextTab ? `${nextTab.num}. ${nextTab.short} \u2192` : 'Done \u2713'}</button>
          </div>
        </div>
      </div>
    `;

    if (typeof document !== 'undefined' && typeof document.querySelector === 'function') {
      const activeRail = document.querySelector('.htp-rail-btn.active');
      if (activeRail && typeof activeRail.scrollIntoView === 'function') {
        activeRail.scrollIntoView({ inline: 'nearest', block: 'nearest' });
      }
    }
  }

  function open(tab) {
    if (tab) {
      const mapped = LEGACY_TAB_MAP[tab] || tab;
      if (TABS.some(t => t.id === mapped)) state.activeTab = mapped;
    }
    state.isOpen = true;
    const overlay = typeof document !== 'undefined' ? document.getElementById('howToPlayOverlay') : null;
    renderModal();
    if (overlay) {
      if (overlay.style) overlay.style.display = 'flex';
      if (typeof overlay.setAttribute === 'function') overlay.setAttribute('aria-hidden', 'false');
    }
    playSfx('hoverTick');
  }

  function close() {
    state.isOpen = false;
    const overlay = typeof document !== 'undefined' ? document.getElementById('howToPlayOverlay') : null;
    if (overlay) {
      if (overlay.style) overlay.style.display = 'none';
      if (typeof overlay.setAttribute === 'function') overlay.setAttribute('aria-hidden', 'true');
    }
  }

  function setTab(tab) {
    const mapped = LEGACY_TAB_MAP[tab] || tab;
    if (!TABS.some(t => t.id === mapped)) return;
    state.activeTab = mapped;
    renderModal();
    const scroller = typeof document !== 'undefined' ? document.getElementById('htp-stage-scroll') : null;
    if (scroller) scroller.scrollTop = 0;
    playSfx('hoverTick');
  }

  function stepTab(delta) {
    const idx = TABS.findIndex(t => t.id === state.activeTab);
    const next = idx + delta;
    if (next >= 0 && next < TABS.length) {
      setTab(TABS[next].id);
    }
  }

  function jumpTabIndex(oneBasedIndex) {
    const t = TABS[oneBasedIndex - 1];
    if (t) setTab(t.id);
  }

  function setRangeMover(who) {
    state.rangeMover = who === 'p1' ? 'p1' : 'p2';
    renderModal();
  }

  function moveRangeDemo(spaceIdx) {
    const idx = Math.max(0, Math.min(8, spaceIdx | 0));
    if (state.rangeMover === 'p1') {
      if (idx === state.p2Pos) return;
      state.p1Pos = idx;
    } else {
      if (idx === state.p1Pos) return;
      state.p2Pos = idx;
    }
    playSfx('hoverTick');
    renderModal();
  }

  function setArchetype(key) {
    if (!CARD_ARCHETYPES[key]) return;
    state.archetype = key;
    playSfx('targetLock');
    renderModal();
  }

  function setCardZone(zoneId) {
    if (!CARD_ZONES.some(z => z.id === zoneId)) return;
    state.activeZone = zoneId;
    playSfx('hoverTick');
    renderModal();
  }

  function stepCardZone(delta) {
    const idx = CARD_ZONES.findIndex(z => z.id === state.activeZone);
    const next = (idx + delta + CARD_ZONES.length) % CARD_ZONES.length;
    setCardZone(CARD_ZONES[next].id);
  }

  function loadClashPreset(presetId) {
    const preset = HowToPlayLogic.CLASH_PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    state.clash.presetId = preset.id;
    state.clash.distance = preset.distance;
    state.clash.initiator = preset.initiator;
    state.clash.p1 = { ...preset.p1 };
    state.clash.p2 = { ...preset.p2 };
    runClash(true);
  }

  function setClashDistance(dist) {
    state.clash.presetId = null;
    state.clash.distance = Math.max(1, Math.min(6, dist | 0));
    runClash(false);
  }

  function setClashInitiator(who) {
    state.clash.presetId = null;
    state.clash.initiator = who === 'p2' ? 'p2' : 'p1';
    runClash(false);
  }

  function setClashCard(who, cardKey) {
    const side = who === 'p2' ? 'p2' : 'p1';
    state.clash.presetId = null;
    const card = HowToPlayLogic.getCatalogCard(cardKey);
    state.clash[side].cardKey = card.key;
    if (!card.criticalText) state.clash[side].crit = false;
    runClash(false);
  }

  function toggleClashMod(who, mod) {
    const side = who === 'p2' ? 'p2' : 'p1';
    state.clash.presetId = null;
    if (mod === 'ex') state.clash[side].ex = !state.clash[side].ex;
    if (mod === 'crit') {
      const card = HowToPlayLogic.getCatalogCard(state.clash[side].cardKey);
      if (card.criticalText) state.clash[side].crit = !state.clash[side].crit;
    }
    runClash(false);
  }

  function runClash(withSfx) {
    state.clash.result = HowToPlayLogic.evaluateClashScenario(state.clash);
    renderModal();
    if (withSfx) {
      const r = state.clash.result;
      if (r.fighters.p1.stunned || r.fighters.p2.stunned) playSfx('guardBreak');
      else if (r.fighters.p1.hitLanded || r.fighters.p2.hitLanded) playSfx('strikeHit', 4);
      else playSfx('speedResolved', r.speedTie);

      if (typeof HitParticleEngine !== 'undefined' && HitParticleEngine.triggerHit) {
        const f1 = r.fighters.p1;
        const f2 = r.fighters.p2;
        if (f1.hitLanded) {
          const c1 = HowToPlayLogic.getCatalogCard(state.clash.p1.cardKey);
          HitParticleEngine.triggerHit({
            kind: 'hit',
            attackerId: 'p1',
            defenderId: 'p2',
            damage: f1.damageDealt,
            cardName: c1 ? c1.name : f1.cardName,
            cardType: c1 ? c1.type : 'normal',
            isEX: !!state.clash.p1.ex,
            criticalPaid: !!state.clash.p1.crit,
            guardBroken: !!f2.stunned,
            effectiveArmor: f2.stats ? f2.stats.arm : 0,
            skipDedup: true,
          });
        }
        if (f2.hitLanded) {
          const c2 = HowToPlayLogic.getCatalogCard(state.clash.p2.cardKey);
          HitParticleEngine.triggerHit({
            kind: 'hit',
            attackerId: 'p2',
            defenderId: 'p1',
            damage: f2.damageDealt,
            cardName: c2 ? c2.name : f2.cardName,
            cardType: c2 ? c2.type : 'normal',
            isEX: !!state.clash.p2.ex,
            criticalPaid: !!state.clash.p2.crit,
            guardBroken: !!f1.stunned,
            effectiveArmor: f1.stats ? f1.stats.arm : 0,
            skipDedup: true,
          });
        }
      }
    }
  }

  function setIconsFilter(filter) {
    state.iconsFilter = filter;
    playSfx('hoverTick');
    renderModal();
  }

  function setGlossaryQuery(val) {
    state.glossaryQuery = String(val == null ? '' : val);
    // Update only the results list so the search <input> keeps focus & cursor!
    const resultsEl = typeof document !== 'undefined' ? document.getElementById('htp-glossary-results') : null;
    if (resultsEl) {
      resultsEl.innerHTML = renderGlossaryListMarkup();
      const resetBtn = document.getElementById('htp-glossary-reset');
      if (resetBtn && resetBtn.style) {
        resetBtn.style.display = state.glossaryQuery ? 'inline-flex' : 'none';
      }
    } else {
      renderModal();
    }
  }

  function setGlossaryCategory(cat) {
    state.glossaryCategory = cat;
    playSfx('hoverTick');
    renderModal();
  }

  function clearGlossaryFilters() {
    state.glossaryQuery = '';
    state.glossaryCategory = 'All';
    renderModal();
    const input = typeof document !== 'undefined' ? document.getElementById('htp-glossary-search') : null;
    if (input && typeof input.focus === 'function') input.focus();
  }

  function launchQuickStart() {
    close();
    if (typeof quickStart === 'function') quickStart();
  }

  function isOpen() {
    return state.isOpen;
  }

  return {
    open,
    close,
    isOpen,
    setTab,
    stepTab,
    jumpTabIndex,
    setRangeMover,
    moveRangeDemo,
    setArchetype,
    setCardZone,
    stepCardZone,
    loadClashPreset,
    setClashDistance,
    setClashInitiator,
    setClashCard,
    toggleClashMod,
    runClash,
    setIconsFilter,
    setGlossaryQuery,
    setGlossaryCategory,
    clearGlossaryFilters,
    launchQuickStart,
    renderBasicsSection,
  };
})();

// Global entry points preserved for backward compatibility with shell.html, input.js & tests
function openHowToPlay(tab) { HowToPlayUI.open(tab || 'basics'); }
function closeHowToPlay() { HowToPlayUI.close(); }
function showHowToPlayTab(tab) { HowToPlayUI.setTab(tab); }
function isHowToPlayOpen() { return HowToPlayUI.isOpen(); }
const HOWTOPLAY_INTRO = HowToPlayUI.renderBasicsSection();

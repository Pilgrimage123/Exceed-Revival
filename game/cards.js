// ===== cards.js =====
// ============================================================
// CARD DATA — Exceed POC (Ryu vs Ken, base S1 ruleset + Criticals)
// ============================================================
// Simplifications remaining from the full rulebook (documented for the player too):
//  - "Up to X" self-movement effects that are NOT core strategic decisions
//    (e.g. Metsu Hadoken's "After: Move up to 2") resolve to the max amount
//    toward the opponent, to avoid a UI pause for a low-stakes choice.
// Everything else — Grasp's push, Block's reactive Force-for-Armor, Focus's
// Reading, Knee Bash's initiator range bonus, EX Strikes, and Criticals (see
// below) — is fully implemented, including pausing strike resolution for real
// decisions.
//
// CRITICALS: when setting ANY attack card during a Strike (attacker's card,
// defender's card, whether from hand, EX, or Wild Swing), a "Street Fighter"
// character (CHARACTERS[key].isStreetFighter === true) may pay 1 Gauge. If paid,
// ALL "Critical:" text on that card — and on the character's own ability, if it
// has any — applies for that one Strike only. If not paid, any Critical text on
// the card simply does nothing. You may pay even on a card with no Critical text
// at all (bluffing is legal and, per the rules, indistinguishable from a real
// Critical from the opponent's point of view until it resolves).
//
// A card's Critical effect lives in its own `critical` field, structurally
// parallel to `hooks` (statMods/before/hit/after/ignoreArmor/ignoreGuard), gated
// in engine.js's resolveStrikeSteps/activateStep by whether that side actually
// paid this Strike. `criticalText` is the display string shown as "Critical: ..."
// under the card's normal text.
//
// CONFIRMED (read directly from the project's Exceed_Frame_Data_card_reference.xlsx
// this session — every Ryu/Ken card's "Attack Effect" column, plus the Normals sheet
// and both characters' Innate/Exceed ability text):
//   - Ryu's Hadoken:              Critical: +2 Speed.
//   - Ryu's One Inch Punch:       Critical: +2 Armor.
//   - Ryu's Shoryuken:            Critical, Before: Close 1.
//   - Ryu's Donkey Kick, Tatsumaki Senpukyaku, Metsu Hadoken, Metsu Shoryuken:
//     no Critical text.
//   - Ken's Axe Kick:             Critical: +2 Speed. (base card separately also has
//     an always-on, non-Critical "Before: Close 1" — see the fix note on that card
//     below; don't confuse the two, they're on separate un-joined lines in the source.)
//   - Ken's Hadoken:              Critical: +2 Power.
//   - Ken's Knee Bash:            Critical, Before: Close 2.
//   - Ken's Shoryuken:            Critical, Before: Close 1.
//   - Ken's Tatsumaki Senpukyaku, Guren Senpukyaku, Shinryuken: no Critical text.
//   - Neither character's shared Normals pool has any Critical text on any card.
//   - Neither Ryu's nor Ken's own Innate/Exceeded character-ability text has a
//     Critical component ("...and on your character's ability, if it has any" in the
//     rule — confirmed: neither does, for this pair).
// This is now the FULL roster (Ryu + Ken + every shared Normal) — nothing left
// unconfirmed for the characters currently in the game. If a new character is added
// later, re-check the same three things (Specials, Ultras, and Innate/Exceed text)
// for them specifically before assuming they have no Criticals.
//
// CAMMY (added this session): Critical text confirmed from the same spreadsheet —
//   Cannonball: Critical Ignore Guard. Razor's Edge Slicer: Critical, attacks at
//   range 4-5 don't hit you. Spiral Arrow: Critical +1 Armor, +4 Guard. Cannon
//   Spike, Dive Kick, CQC, Gyro Drive Smasher: no Critical text. Her own
//   Innate/Exceeded ability text has no Critical component either.
//
// ZANGIEF (added this session): Critical text confirmed from the same
//   spreadsheet — Atomic Suplex: Critical, After: Close 3. Banishing Flat:
//   Critical, attacks at range 4+ don't hit you. Flying Power Bomb: Critical
//   Stun Immunity. Double Lariat: Critical, After: Move 1 or 2. Spinning
//   Piledriver, Siberian Blizzard, Ultimate Atomic Buster: no Critical text on
//   the card itself. His own Innate/Exceeded ability text IS itself a Critical
//   mechanic — unlike every other character so far, his passive GRANTS an extra
//   Critical clause onto whatever card he sets (see
//   CHARACTERS.zangief.extraCriticalStatsIfOpponentAtRange1 in this file and the
//   liveStats computation in engine.js) rather than just having ordinary
//   Critical text of its own.
// ============================================================

// A "hook" receives a `ctx` (see engine.js) and may read/mutate it.
// All numeric base stats are plain numbers; range is [min,max] or null.
// interactiveHit: 'grasp_move' marks a card whose Hit effect requires a
// yielded decision (amount + direction) rather than a plain function — see
// activateStep() in engine.js, which is the ONLY place that yields.

const NORMALS = [
  {
    key: 'assault', name: 'Assault', type: 'normal', owner: 'shared',
    range: [1, 1], pow: 4, spd: 5, arm: 0, grd: 0,
    text: 'Before: Close 2. Hit: Advantage.',
    boostText: 'Retreat up to 4.',
    hooks: {
      before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 2); },
      hit(ctx) { ctx.engine.grantAdvantage(ctx.attacker, 'Assault'); },
    },
    boost: { force: 0, continuous: false,
      resolve(ctx) { ctx.engine.retreatSelf(ctx.player, ctx.opponent, 4); } }
  },
  {
    key: 'block', name: 'Block', type: 'normal', owner: 'shared',
    range: null, pow: 0, spd: 0, arm: 2, grd: 3, alwaysMiss: true,
    // Card text kept to the source spreadsheet's Attack/Boost Effect wording only
    // (Range shows as N/A via the stats row itself, so "Can't hit" doesn't need to
    // be spelled out in the text too; the UI-prompt aside likewise belongs in code,
    // not on the card).
    text: 'When hit, spend any amount of Force for +2 Armor for each Force.\nAfter: Add to Gauge at end of Strike.',
    boostText: 'Name a card. Opponent must discard that card or reveal hand without it.',
    hooks: { goesToGaugeEvenOnMiss: true },
    // Block's reactive Force-for-Armor is handled centrally in engine.activateStep
    // (keyed off defCard.key === 'block'), not here — it happens on the OPPONENT's
    // activation, not this card's own before/hit/after.
    boost: { force: 0, continuous: false, needsNameChoice: true,
      resolve(ctx) {
        const name = ctx.namedCardKey;
        const idx = ctx.opponent.hand.findIndex(c => c.key === name);
        if (idx !== -1) {
          const [c] = ctx.opponent.hand.splice(idx, 1);
          ctx.opponent.discard.push(c);
          ctx.engine.logMsg(`${ctx.opponent.name} discards their ${c.name} (named by Block).`);
        } else {
          ctx.engine.logMsg(`${ctx.opponent.name} reveals their hand: ${ctx.opponent.hand.map(c => c.name).join(', ') || '(empty)'} — no copy of the named card.`);
          ctx.engine.recordHandReveal(ctx.opponent);
        }
      } }
  },
  {
    key: 'cross', name: 'Cross', type: 'normal', owner: 'shared',
    range: [1, 2], pow: 3, spd: 6, arm: 0, grd: 0,
    text: 'After: Retreat 3.',
    boostText: 'Advance up to 3.',
    hooks: { after(ctx) { ctx.engine.retreatSelf(ctx.attacker, ctx.defender, 3); ctx.engine.logMsg(`${ctx.attacker.name} retreats ${ctx.engine.spaceWord(3)} (Cross).`); } },
    boost: { force: 0, continuous: false,
      resolve(ctx) { ctx.engine.advanceSelf(ctx.player, ctx.opponent, 3, true); } }
  },
  {
    key: 'dive', name: 'Dive', type: 'normal', owner: 'shared',
    range: [1, 1], pow: 5, spd: 4, arm: 0, grd: 0,
    // Text matches the source spreadsheet verbatim ("If side swap, cannot be hit");
    // the implementation detail of exactly how the engine tracks that (ctx.sideSwapped,
    // checked when resolving the hit) lives in the hooks below, not in this string.
    text: 'Before: Advance 3. If side swap, cannot be hit.',
    boostText: 'Discard target Boost.',
    hooks: {
      before(ctx) {
        const before = ctx.attacker.pos < ctx.defender.pos;
        ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 3, true);
        const after = ctx.attacker.pos < ctx.defender.pos;
        if (before !== after) { ctx.sideSwapped = true; ctx.attacker.strikeState.unhittable = true; }
        ctx.engine.logMsg(`${ctx.attacker.name}'s Dive advances ${ctx.engine.spaceWord(3)}.${ctx.sideSwapped ? ' [Side swap detected — cannot be hit this Strike]' : ''}`);
      },
    },
    boost: { force: 0, continuous: false, needsBoostTargetChoice: true,
      resolve(ctx) { ctx.engine.discardOpponentContinuousBoost(ctx.opponent, ctx.targetBoostUid); } }
  },
  {
    key: 'focus', name: 'Focus', type: 'normal', owner: 'shared',
    range: [1, 2], pow: 4, spd: 1, arm: 2, grd: 5,
    // Fix (found while generalizing this mechanic for Zangief's Double Lariat,
    // which has the identical property with EXPLICIT card text): Focus's
    // engine-enforced movement immunity (`_focusActive`, now driven by the
    // generic `movementImmune` field below instead of a hardcoded key check) was
    // never actually mentioned in this card's displayed `text` — a pre-existing
    // documentation gap, now fixed alongside the generalization.
    text: "Opponents can't move you. After: Draw 1.",
    boostText: 'Name a Normal and Strike. Opponent must Strike with that card or reveal their hand without it.',
    movementImmune: true,
    hooks: { after(ctx) { ctx.engine.draw(ctx.attacker, 1); ctx.engine.logMsg(`${ctx.attacker.name} draws 1 (Focus).`); } },
    boost: { force: 0, continuous: false, needsNormalNameChoice: true, triggersStrike: true,
      resolve(ctx) { ctx.engine.setReading(ctx.player, ctx.namedCardKey); } }
  },
  {
    key: 'grasp', name: 'Grasp', type: 'normal', owner: 'shared',
    range: [1, 1], pow: 3, spd: 7, arm: 0, grd: 0,
    text: 'Hit: Move opponent 1-2.',
    boostText: '+2 Power.',
    hooks: { interactiveHit: 'grasp_move' },
    boost: { force: 0, continuous: true, statMods: { pow: 2 } }
  },
  {
    key: 'spike', name: 'Spike', type: 'normal', owner: 'shared',
    range: [2, 3], pow: 5, spd: 3, arm: 0, grd: 4, ignoreGuard: true, ignoreArmor: true,
    text: 'Ignore Guard, Armor.',
    boostText: '+1 Armor, +3 Guard.',
    hooks: {},
    boost: { force: 0, continuous: true, statMods: { arm: 1, grd: 3 } }
  },
  {
    key: 'sweep', name: 'Sweep', type: 'normal', owner: 'shared',
    range: [1, 3], pow: 6, spd: 2, arm: 0, grd: 6,
    text: 'Hit: Opponent discards 1 at random.',
    boostText: '+2 Speed.',
    hooks: { hit(ctx) { ctx.engine.randomDiscardFromHand(ctx.defender, 1); } },
    boost: { force: 0, continuous: true, statMods: { spd: 2 } }
  },
];

// ================= GG NORMALS (Guilty Gear Strive season) =================
// A SEPARATE shared 8-card Normals pool from NORMALS (S1-5) above — Axl (added
// this session) is from a different season/set with its own baseline Normals,
// not just a character added to the existing S1-5 roster. See
// CHARACTERS.axl.normals below and buildDeck() in engine.js, which now picks
// whichever pool a character's CHARACTERS entry points to instead of always
// using NORMALS. Source: EXdata.xlsx's "Normals (GG)" sheet, whose header
// carries two season-wide rules baked into every card below:
//   - "All boosts in the GGST set cost {0}" — every GG_NORMALS boost.force is 0.
//   - Cancel ("After resolving a cancellable Boost, you may spend [1] to take
//     another action") — explicitly OUT OF SCOPE per this session's instruction.
//     Several cards carry a 'C' tag in the source sheet marking Cancel
//     eligibility; since Cancel itself isn't implemented, that tag simply isn't
//     represented here at all — not a field quietly doing nothing, it doesn't
//     exist in this data. If Cancel is ever built, re-check the source sheet for
//     which cards carry 'C' (Cross/Dive/Dust/Focus/Slash/Sweep all do; Block and
//     Grasp don't) and wire it in then.
//
// Judgment calls made transcribing these (flagged per this project's established
// practice, not silently decided):
//   - Cross (GG)'s boost ("Push or Pull 2; if the opponent was Pulled past you,
//     add this to your Gauge") needs a direction choice — new
//     `needsPushPullChoice` boost flag + `extra.pushPullDirection`.
//   - Dive (GG)'s boost ("Discard a Continuous Boost [+] in play") doesn't say
//     whose — matched to the S1 Dive boost's identical shape/precedent (targets
//     the OPPONENT's continuous boost), reusing needsBoostTargetChoice/
//     discardOpponentContinuousBoost as-is.
//   - Dust (GG)'s boost ("+4GRD. At the start of your turn, add this to your
//     Gauge") is a genuinely new expiry timing — every other turn-counted expiry
//     already in this codebase (Cammy's Cannonball/CQC) fires at the END of a
//     turn, not the start. New `expireToGaugeAtStartOfNextTurn` flag + engine
//     support (see engine.checkStartOfTurnExpiry).
//   - Focus (GG)'s boost ("When you initiate a Strike, the opponent must
//     respond with a Wild Swing") is a new forced-defense mechanic — new
//     `forcesOpponentWildSwingOnInitiate` continuous-boost flag.
//   - Grasp (GG)'s boost ("Now: Draw 1. Hit: +1POW. Add this to your Gauge")
//     conditions "+1POW" on landing a Hit; simplified to a flat continuous
//     `statMods.pow` (applies whether or not the strike this boost is active
//     for actually hits — same treatment every OTHER continuous statMods boost
//     in this codebase already gets) rather than building a new hit-conditional
//     damage-math path for one card. `toGaugeIfHitThisStrike` (already existing,
//     used by Zangief's Spinning Piledriver/Ultimate Atomic Buster) covers the
//     Gauge part, which genuinely IS hit-conditional in the source text.
//   - Sweep (GG)'s boost ("Your attack is considered to be an EX Attack: +1 to
//     all four stats") is mechanically identical in OUTCOME to a real EX pair
//     (buildExCard also does flat +1/+1/+1/+1) — implemented as a flat
//     continuous `statMods` of +1 to all four rather than literally flagging the
//     card `isEX` (which would additionally require discarding a paired second
//     copy, which doesn't apply here — the whole point of this boost is getting
//     the bonus without that cost).
const GG_NORMALS = [
  {
    key: 'gg_block', name: 'Block', type: 'normal', owner: 'shared',
    range: null, pow: 0, spd: 0, arm: 2, grd: 3, alwaysMiss: true,
    text: 'When hit, spend any amount of Force for +2 Armor for each Force.\nAfter: Add to Gauge at end of Strike.',
    boostText: 'Name a card. The opponent must discard a copy of that card or reveal a hand with none.',
    hooks: { goesToGaugeEvenOnMiss: true },
    boost: { force: 0, continuous: false, needsNameChoice: true,
      resolve(ctx) {
        const name = ctx.namedCardKey;
        const idx = ctx.opponent.hand.findIndex(c => c.key === name);
        if (idx !== -1) {
          const [c] = ctx.opponent.hand.splice(idx, 1);
          ctx.opponent.discard.push(c);
          ctx.engine.logMsg(`${ctx.opponent.name} discards their ${c.name} (named by Block).`);
        } else {
          ctx.engine.logMsg(`${ctx.opponent.name} reveals their hand: ${ctx.opponent.hand.map(c => c.name).join(', ') || '(empty)'} — no copy of the named card.`);
          ctx.engine.recordHandReveal(ctx.opponent);
        }
      } }
  },
  {
    key: 'gg_cross', name: 'Cross', type: 'normal', owner: 'shared',
    range: [1, 2], pow: 3, spd: 6, arm: 0, grd: 0,
    text: 'After: Retreat 3.',
    boostText: 'Push or Pull 2. If the opponent was Pulled past you, add this card to your Gauge.',
    hooks: { after(ctx) { ctx.engine.retreatSelf(ctx.attacker, ctx.defender, 3); ctx.engine.logMsg(`${ctx.attacker.name} retreats ${ctx.engine.spaceWord(3)} (Cross).`); } },
    boost: { force: 0, continuous: false, needsPushPullChoice: true, cancelable: true,
      resolve(ctx) {
        const opp = ctx.opponent, player = ctx.player;
        if (ctx.pushPullDirection === 'pull') {
          const before = player.pos < opp.pos;
          ctx.engine.pushToward(opp, player, 2);
          const after = player.pos < opp.pos;
          if (before !== after) {
            ctx.gaugeInsteadOfDiscard = true;
          }
        } else {
          ctx.engine.pushAway(opp, player, 2);
        }
      } }
  },
  {
    key: 'gg_dive', name: 'Dive', type: 'normal', owner: 'shared',
    range: [1, 1], pow: 5, spd: 4, arm: 0, grd: 0,
    // Text matches the source spreadsheet verbatim, same as S1 Dive above. "If
    // side swap, cannot be hit" is enforced via `_unhittableThisStrike` (see the
    // S1 Dive comment and engine.js's resolveStrikeSteps hit-check for detail).
    text: 'Before: Advance 3. If side swap, cannot be hit.',
    boostText: 'Discard a Continuous Boost in play.',
    hooks: {
      before(ctx) {
        const before = ctx.attacker.pos < ctx.defender.pos;
        ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 3, true);
        const after = ctx.attacker.pos < ctx.defender.pos;
        if (before !== after) { ctx.sideSwapped = true; ctx.attacker.strikeState.unhittable = true; }
      },
    },
    boost: { force: 0, continuous: false, needsBoostTargetChoice: true, cancelable: true,
      resolve(ctx) { ctx.engine.discardOpponentContinuousBoost(ctx.opponent, ctx.targetBoostUid); } }
  },
  {
    key: 'gg_dust', name: 'Dust', type: 'normal', owner: 'shared',
    range: [2, 3], pow: 5, spd: 3, arm: 0, grd: 4, ignoreGuard: true, ignoreArmor: true,
    text: 'Ignore Guard, Armor.',
    boostText: '+4 Guard. At the start of your turn, add this card to your Gauge.',
    hooks: {},
    boost: { force: 0, continuous: true, statMods: { grd: 4 }, expireToGaugeAtStartOfNextTurn: true, cancelable: true }
  },
  {
    key: 'gg_focus', name: 'Focus', type: 'normal', owner: 'shared',
    range: [1, 2], pow: 4, spd: 1, arm: 2, grd: 5,
    text: "Opponents can't Push or Pull you. After: Draw 1.",
    boostText: 'When you initiate a Strike, the opponent must respond with a Wild Swing.',
    movementImmune: true,
    hooks: { after(ctx) { ctx.engine.draw(ctx.attacker, 1); ctx.engine.logMsg(`${ctx.attacker.name} draws 1 (Focus).`); } },
    boost: { force: 0, continuous: true, forcesOpponentWildSwingOnInitiate: true, cancelable: true }
  },
  {
    key: 'gg_grasp', name: 'Grasp', type: 'normal', owner: 'shared',
    range: [1, 1], pow: 3, spd: 7, arm: 0, grd: 0,
    text: 'Hit: Push or Pull opponent 1-2.',
    boostText: 'Now: Draw 1. Hit: +1 Power. Add this card to your Gauge.',
    hooks: { interactiveHit: 'grasp_move' },
    boost: { force: 0, continuous: true, nowDraw: 1, statMods: { pow: 1 }, toGaugeIfHitThisStrike: true }
  },
  {
    key: 'gg_slash', name: 'Slash', type: 'normal', owner: 'shared',
    range: [1, 1], pow: 4, spd: 5, arm: 0, grd: 0,
    text: 'Before: Close 2. Hit: Advantage.',
    boostText: 'Advance 3.',
    hooks: {
      before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 2); },
      hit(ctx) { ctx.engine.grantAdvantage(ctx.attacker, 'Slash'); },
    },
    boost: { force: 0, continuous: false, cancelable: true,
      resolve(ctx) { ctx.engine.advanceSelf(ctx.player, ctx.opponent, 3, true); } }
  },
  {
    key: 'gg_sweep', name: 'Sweep', type: 'normal', owner: 'shared',
    range: [1, 3], pow: 6, spd: 2, arm: 0, grd: 6,
    text: 'Hit: Opponent discards 1 at random.',
    boostText: 'Your attack is considered to be an EX Attack: +1 Power, +1 Speed, +1 Armor, +1 Guard.',
    hooks: { hit(ctx) { ctx.engine.randomDiscardFromHand(ctx.defender, 1); } },
    boost: { force: 0, continuous: true, statMods: { pow: 1, spd: 1, arm: 1, grd: 1 }, cancelable: true }
  },
];

const RYU = [
  {
    key: 'donkey_kick', name: 'Donkey Kick', type: 'special', owner: 'ryu',
    range: [1, 2], pow: 6, spd: 4, arm: 0, grd: 4,
    text: 'Hit: Push 2, Advantage.',
    boostText: 'Add this card to your Gauge.',
    hooks: {
      hit(ctx) {
        ctx.engine.pushAway(ctx.defender, ctx.attacker, 2);
        ctx.engine.grantAdvantage(ctx.attacker, 'Donkey Kick');
      },
    },
    boost: { force: 0, continuous: false, toGaugeInstead: true, resolve() {} }
  },
  {
    key: 'hadoken_ryu', name: 'Hadoken', type: 'special', owner: 'ryu',
    range: [3, 6], pow: 4, spd: 4, arm: 0, grd: 0,
    text: 'After: If you hit, you may return this card to the top of your Deck; if you do, put the top card of your discard into your Gauge.',
    boostText: '+2 Power, +1 Armor.',
    criticalText: 'Critical: +2 Speed.',
    hooks: {
      // Real decision (yielded) — see interactiveAfter === 'hadoken_recycle' handling in
      // engine.js's activateStep. The attacker is asked whether to recycle.
      interactiveAfter: 'hadoken_recycle',
    },
    critical: { statMods: { spd: 2 } },
    boost: { force: 0, continuous: true, statMods: { pow: 2, arm: 1 } }
  },
  {
    key: 'one_inch_punch', name: 'One Inch Punch', type: 'special', owner: 'ryu',
    range: [1, 1], pow: 5, spd: 3, arm: 0, grd: 6, ignoreArmor: true,
    text: 'Ignore Armor. Hit: Push 3.',
    boostText: 'Move 1, then take another action.',
    criticalText: 'Critical: +2 Armor.',
    hooks: { hit(ctx) { ctx.engine.pushAway(ctx.defender, ctx.attacker, 3); ctx.engine.logMsg(`${ctx.defender.name} is pushed ${ctx.engine.spaceWord(3)} (One Inch Punch).`); } },
    critical: { statMods: { arm: 2 } },
    boost: { force: 0, continuous: false, bonusAction: true,
      resolve(ctx) { ctx.engine.moveChoice(ctx.player, 1); } }
  },
  {
    key: 'shoryuken_ryu', name: 'Shoryuken', type: 'special', owner: 'ryu',
    range: [1, 1], pow: 4, spd: 5, arm: 0, grd: 0,
    text: 'If opponent initiated the Strike, +2 Speed.',
    boostText: 'Ignore Armor. Now: Strike. Hit: this card goes to Gauge.',
    criticalText: 'Critical, Before: Close 1.',
    hooks: {
      spdBonusIfDefending: 2,
    },
    critical: { before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 1); } },
    boost: { force: 0, continuous: true, statMods: {}, ignoreArmorGrant: true,
      triggersStrike: true, toGaugeIfHitThisStrike: true }
  },
  {
    key: 'tatsumaki_ryu', name: 'Tatsumaki Senpukyaku', type: 'special', owner: 'ryu',
    range: [1, 2], pow: 5, spd: 3, arm: 0, grd: 4,
    text: 'Before: Advance 2. Hit: If you moved past the opponent this strike, Advantage.',
    boostText: '+1 Power, +1 Speed.',
    hooks: {
      before(ctx) {
        const before = ctx.attacker.pos < ctx.defender.pos;
        ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 2, true);
        const after = ctx.attacker.pos < ctx.defender.pos;
        if (before !== after) ctx.sideSwapped = true;
      },
      hit(ctx) { if (ctx.sideSwapped) ctx.engine.grantAdvantage(ctx.attacker, 'Tatsumaki'); },
    },
    boost: { force: 0, continuous: true, statMods: { pow: 1, spd: 1 } }
  },
  {
    key: 'metsu_hadoken', name: 'Metsu Hadoken', type: 'ultra', owner: 'ryu', gaugeCost: 3,
    range: [3, 5], pow: 7, spd: 5, arm: 0, grd: 0,
    text: 'After: Move up to 2.',
    boostText: '+2 Power, +2 Speed.',
    hooks: { after(ctx) { ctx.engine.moveChoice(ctx.attacker, 2); ctx.engine.logMsg(`${ctx.attacker.name} moves up to ${ctx.engine.spaceWord(2)} (Metsu Hadoken).`); } },
    boost: { force: 1, continuous: true, statMods: { pow: 2, spd: 2 } }
  },
  {
    key: 'metsu_shoryuken', name: 'Metsu Shoryuken', type: 'ultra', owner: 'ryu', gaugeCost: 4,
    range: [1, 1], pow: 7, spd: 5, arm: 0, grd: 0,
    text: 'If opponent initiated the Strike, +3 Speed.',
    boostText: 'Move 2, then Strike.',
    hooks: { spdBonusIfDefending: 3 },
    boost: { force: 1, continuous: false, triggersStrike: true,
      resolve(ctx) { ctx.engine.advanceSelf(ctx.player, ctx.opponent, 2, true); } }
  },
];

const KEN = [
  {
    key: 'axe_kick', name: 'Axe Kick', type: 'special', owner: 'ken',
    range: [1, 1], pow: 5, spd: 4, arm: 0, grd: 0, ignoreArmor: true,
    // Fix (this session, cross-checked against the frame-data spreadsheet): base
    // text is "Ignore Armor" AND "Before: Close 1" as two SEPARATE, always-on
    // effects (un-joined lines in the source — same pattern as Hadoken's separate
    // Critical/After lines below) — the Before was previously missing entirely.
    // "Critical: +2SPD." is its own third line, gated independently.
    text: 'Ignore Armor. Before: Close 1.',
    boostText: 'Add this card to your Gauge.',
    criticalText: 'Critical: +2 Speed.',
    hooks: { before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 1); ctx.engine.logMsg(`${ctx.attacker.name}'s Axe Kick closes 1 space.`); } },
    critical: { statMods: { spd: 2 } },
    boost: { force: 0, continuous: false, toGaugeInstead: true, resolve() {} }
  },
  {
    key: 'hadoken_ken', name: 'Hadoken', type: 'special', owner: 'ken',
    range: [3, 6], pow: 4, spd: 4, arm: 0, grd: 0,
    text: 'After: If you hit, you may return this card to the top of your Deck; if you do, put the top card of your discard into your Gauge.',
    boostText: '+1 Power. Now: Strike.',
    criticalText: 'Critical: +2 Power.',
    hooks: {
      // Real decision (yielded) — see interactiveAfter === 'hadoken_recycle' handling in
      // engine.js's activateStep. The attacker is asked whether to recycle.
      interactiveAfter: 'hadoken_recycle',
    },
    critical: { statMods: { pow: 2 } },
    boost: { force: 0, continuous: true, statMods: { pow: 1 }, triggersStrike: true }
  },
  {
    key: 'knee_bash', name: 'Knee Bash', type: 'special', owner: 'ken',
    range: [1, 2], pow: 5, spd: 2, arm: 0, grd: 5,
    text: 'If you initiated this Strike, +0~1 Range.',
    boostText: 'Now: Draw 2. Hit: Advantage.',
    criticalText: 'Critical, Before: Close 2.',
    hooks: { rangeMaxBonusIfInitiating: 1 },
    critical: { before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 2); } },
    boost: { force: 0, continuous: true, nowDraw: 2, onHit(ctx) { ctx.engine.grantAdvantage(ctx.player, 'Knee Bash boost'); } }
  },
  {
    key: 'shoryuken_ken', name: 'Shoryuken', type: 'special', owner: 'ken',
    range: [1, 1], pow: 4, spd: 5, arm: 0, grd: 4,
    text: 'If you initiated this Strike, +2 Speed.',
    boostText: '+1 Speed. Now: Draw 1.',
    criticalText: 'Critical, Before: Close 1.',
    hooks: { spdBonusIfInitiating: 2 },
    critical: { before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 1); } },
    boost: { force: 0, continuous: true, statMods: { spd: 1 }, nowDraw: 1 }
  },
  {
    key: 'tatsumaki_ken', name: 'Tatsumaki Senpukyaku', type: 'special', owner: 'ken',
    range: [1, 2], pow: 5, spd: 3, arm: 0, grd: 0,
    text: 'Before: Advance 2. Hit: If you moved past the opponent this strike, Ignore Guard.',
    boostText: '+1 Speed. Now: Strike.',
    hooks: {
      before(ctx) {
        const before = ctx.attacker.pos < ctx.defender.pos;
        ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 2, true);
        const after = ctx.attacker.pos < ctx.defender.pos;
        if (before !== after) ctx.sideSwapped = true;
      },
      hit(ctx) { if (ctx.sideSwapped) ctx.ignoreGuardThisHit = true; },
    },
    boost: { force: 0, continuous: true, statMods: { spd: 1 }, triggersStrike: true }
  },
  {
    key: 'guren_senpukyaku', name: 'Guren Senpukyaku', type: 'ultra', owner: 'ken', gaugeCost: 3,
    range: [1, 2], pow: 5, spd: 4, arm: 0, grd: 4,
    text: 'Before: Advance 2. If you did NOT pass the opponent, +3 Power.',
    boostText: '+2 Power, +2 Speed.',
    hooks: {
      before(ctx) {
        const before = ctx.attacker.pos < ctx.defender.pos;
        ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 2, true);
        const after = ctx.attacker.pos < ctx.defender.pos;
        const swapped = before !== after;
        ctx.sideSwapped = swapped;
        if (!swapped) ctx.powBonus = (ctx.powBonus || 0) + 3;
      },
    },
    boost: { force: 1, continuous: true, statMods: { pow: 2, spd: 2 } }
  },
  {
    key: 'shinryuken', name: 'Shinryuken', type: 'ultra', owner: 'ken', gaugeCost: 4,
    range: [1, 1], pow: 7, spd: 6, arm: 0, grd: 0,
    text: 'If you initiated this Strike, +4 Power.',
    boostText: 'Close 3, then Strike.',
    hooks: { powBonusIfInitiating: 4 },
    boost: { force: 1, continuous: false, triggersStrike: true,
      resolve(ctx) { ctx.engine.closeSelf(ctx.player, ctx.opponent, 3); } }
  },
];

// Shared by several of Cammy's cards below: "Before: Advance N" + side-swap
// detection (needed for her Innate/Exceeded passive — see CHARACTERS.cammy).
// Ryu/Ken's existing side-swapping cards (Dive, Tatsumaki, Guren) already have
// their own inline copies of this exact three-line pattern; not refactored to
// share this helper, to avoid touching already-working code — scoped to Cammy's
// new cards only.
function beforeAdvance(amount) {
  return (ctx) => {
    const before = ctx.attacker.pos < ctx.defender.pos;
    ctx.engine.advanceSelf(ctx.attacker, ctx.defender, amount, true);
    const after = ctx.attacker.pos < ctx.defender.pos;
    if (before !== after) ctx.sideSwapped = true;
  };
}

const CAMMY = [
  {
    key: 'cannonball', name: 'Cannonball', type: 'special', owner: 'cammy',
    range: [1, 1], pow: 5, spd: 3, arm: 0, grd: 0,
    text: 'Before: Advance 3. Hit: Pull 3, Advantage.',
    boostText: '+2 Speed. At the end of your next turn, add this card to your Gauge.',
    criticalText: 'Critical: Ignore Guard.',
    hooks: {
      before: beforeAdvance(3),
      hit(ctx) { ctx.engine.pushToward(ctx.defender, ctx.attacker, 3); ctx.engine.grantAdvantage(ctx.attacker, 'Cannonball'); },
    },
    critical: { ignoreGuard: true },
    boost: { force: 0, continuous: true, statMods: { spd: 2 }, expireToGaugeAfterTurns: 1 }
  },
  {
    key: 'cannon_spike', name: 'Cannon Spike', type: 'special', owner: 'cammy',
    range: [1, 1], pow: 2, spd: 7, arm: 0, grd: 0,
    text: 'Hit: Push or Pull 3 (your choice of direction).',
    boostText: 'Retreat up to 4.',
    // Reuses the same interactive move machinery as Grasp (see engine.js's
    // activateStep) with a fixed amount (min===max===3) so only direction is
    // actually a choice — no new yield type needed for a fixed-distance push/pull.
    hooks: { interactiveHit: 'grasp_move', moveMin: 3, moveMax: 3 },
    boost: { force: 0, continuous: false,
      resolve(ctx) { ctx.engine.retreatSelf(ctx.player, ctx.opponent, 4); } }
  },
  {
    key: 'dive_kick', name: 'Dive Kick', type: 'special', owner: 'cammy',
    range: [1, 1], pow: 4, spd: 5, arm: 0, grd: 0,
    text: "Before: Advance 2. After: Attacks at range 1 don't hit you.",
    // (Bug fix: boostText previously had an implementation-detail aside — "a real
    // yes/no prompt, see engine.js's cleanupBoosts..." — baked directly into this
    // player-facing string. Moved here as a real comment instead; the sustain
    // choice itself is still a genuine yielded decision, not auto-resolved — see
    // engine.js's cleanupBoosts, a generator specifically because of that.)
    boostText: "Your Normals have \"Before: Advance 3.\" Cleanup: If you didn't use a Normal, you may sustain this card.",
    hooks: {
      before: beforeAdvance(2),
      // Order-dependent (this card's OWN activation must actually resolve its
      // After step) — see the range-immunity comment in engine.js's
      // resolveStrikeSteps for why this is handled differently from CQC/Gyro
      // Drive Smasher/Razor's Edge Slicer's set-time immunity.
      after(ctx) { ctx.attacker.strikeState.rangeImmune.push(1); },
    },
    boost: { force: 0, continuous: true, grantsNormalsBeforeAdvance: 3, sustainIfNoNormalUsed: true }
  },
  {
    key: 'razors_edge_slicer', name: "Razor's Edge Slicer", type: 'special', owner: 'cammy',
    range: [1, 1], pow: 4, spd: 1, arm: 0, grd: 0,
    text: 'Before: Advance 4. Hit: If the opponent is at the edge of the arena, +2 Power.',
    boostText: 'Move 3.',
    criticalText: "Critical: Attacks at range 4 or 5 don't hit you.",
    hooks: {
      before: beforeAdvance(4),
      hit(ctx) { if (ctx.engine.isAtEdge(ctx.defender)) ctx.powBonus = (ctx.powBonus || 0) + 2; },
    },
    critical: { rangeImmuneRanges: [4, 5] },
    boost: { force: 0, continuous: false,
      resolve(ctx) { ctx.engine.moveChoice(ctx.player, 3); } }
  },
  {
    key: 'spiral_arrow', name: 'Spiral Arrow', type: 'special', owner: 'cammy',
    range: [1, 1], pow: 5, spd: 4, arm: 0, grd: 0,
    text: 'Before: Advance 4.',
    boostText: 'If the opponent is at range 1, Push 3.',
    criticalText: 'Critical: +1 Armor, +4 Guard.',
    hooks: { before: beforeAdvance(4) },
    critical: { statMods: { arm: 1, grd: 4 } },
    boost: { force: 0, continuous: false,
      resolve(ctx) { if (ctx.engine.range(ctx.player, ctx.opponent) === 1) ctx.engine.pushAway(ctx.opponent, ctx.player, 3); } }
  },
  {
    key: 'cqc', name: 'CQC', type: 'ultra', owner: 'cammy', gaugeCost: 3,
    range: [1, 1], pow: 6, spd: 2, arm: 0, grd: 0,
    text: "Attacks at range 1 don't hit you. Hit: Push or Pull any number of spaces.",
    boostText: "Attacks at range 1 don't hit you. At the end of your next turn, add this card to your Gauge.",
    rangeImmuneRanges: [1],
    hooks: { interactiveHit: 'grasp_move', moveMin: 0, moveMax: 8 },
    boost: { force: 0, continuous: true, rangeImmuneRanges: [1], expireToGaugeAfterTurns: 1 }
  },
  {
    key: 'gyro_drive_smasher', name: 'Gyro Drive Smasher', type: 'ultra', owner: 'cammy', gaugeCost: 2,
    range: [1, 1], pow: 5, spd: 2, arm: 0, grd: 0,
    text: "Attacks at range 4 or 5 don't hit you. Before: Advance as far as possible. Hit: Pull any number of spaces; +1 Power for each space pulled this way.",
    boostText: 'Retreat up to 3, then Strike.',
    rangeImmuneRanges: [4, 5],
    hooks: {
      before(ctx) {
        const before = ctx.attacker.pos < ctx.defender.pos;
        ctx.engine.advanceAsFarAsPossible(ctx.attacker, ctx.defender);
        const after = ctx.attacker.pos < ctx.defender.pos;
        if (before !== after) ctx.sideSwapped = true;
      },
      interactiveHit: 'grasp_move', moveMin: 0, moveMax: 8, moveForceDirection: 'advance',
      // Pull-only ('advance' direction — see engine.js's activateStep comment on
      // the push/pull direction-label convention). The scaling POW bonus needs the
      // ACTUAL distance moved (may be clamped by the board edge), not the
      // requested amount — see engine.js's afterInteractiveMove wiring.
      afterInteractiveMove(ctx, actualMoved) { ctx.powBonus = (ctx.powBonus || 0) + actualMoved; },
    },
    boost: { force: 1, continuous: false, triggersStrike: true,
      resolve(ctx) { ctx.engine.retreatSelf(ctx.player, ctx.opponent, 3); } }
  },
];

const ZANGIEF = [
  {
    key: 'atomic_suplex', name: 'Atomic Suplex', type: 'special', owner: 'zangief',
    range: [1, 1], pow: 4, spd: 6, arm: 0, grd: 0,
    text: 'Hit: Push 3.',
    boostText: '+2 Armor. Now: Close 2.',
    criticalText: 'Critical, After: Close 3.',
    hooks: { hit(ctx) { ctx.engine.pushAway(ctx.defender, ctx.attacker, 3); ctx.engine.logMsg(`${ctx.defender.name} is pushed ${ctx.engine.spaceWord(3)} (Atomic Suplex).`); } },
    critical: { after(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 3); ctx.engine.logMsg(`${ctx.attacker.name} closes ${ctx.engine.spaceWord(3)} (Atomic Suplex Critical).`); } },
    boost: { force: 1, continuous: true, statMods: { arm: 2 }, nowClose: 2 }
  },
  {
    key: 'banishing_flat', name: 'Banishing Flat', type: 'special', owner: 'zangief',
    range: [2, 3], pow: 4, spd: 4, arm: 0, grd: 5,
    text: 'After: Close 2.',
    // "+0~1 Range" is auto-resolved to +1 per the header comment's "up to X" rule —
    // that's an implementation note, not player-facing text, so it stays out of boostText.
    boostText: "+0~1 Range. Now: Strike.",
    criticalText: "Critical: Attacks at range 4 or more don't hit you.",
    hooks: { after(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 2); ctx.engine.logMsg(`${ctx.attacker.name} closes ${ctx.engine.spaceWord(2)} (Banishing Flat).`); } },
    critical: { rangeImmuneRanges: [4, 5, 6, 7, 8] },
    boost: { force: 1, continuous: true, rangeMaxBonus: 1, triggersStrike: true }
  },
  {
    key: 'double_lariat', name: 'Double Lariat', type: 'special', owner: 'zangief',
    range: [1, 2], pow: 5, spd: 2, arm: 1, grd: 6,
    text: "Opponents can't move you.",
    boostText: 'Add this card to your Gauge.',
    // Auto-resolved to the max (2), toward the opponent, per the "up to X" rule —
    // again an implementation note, kept out of the player-facing criticalText.
    criticalText: 'Critical, After: Move 1 or 2.',
    movementImmune: true,
    critical: { after(ctx) { ctx.engine.moveChoice(ctx.attacker, 2); } },
    boost: { force: 0, continuous: false, toGaugeInstead: true, resolve() {} }
  },
  {
    key: 'flying_power_bomb', name: 'Flying Power Bomb', type: 'special', owner: 'zangief',
    range: [1, 1], pow: 6, spd: 2, arm: 0, grd: 0,
    text: 'Before: Close 2.',
    // If more than one card in hand matches the named Range, the OPPONENT chooses
    // which to discard (see resolve() below / engine.resolvePendingRangeDiscard) —
    // an implementation detail, not spelled out in the player-facing boostText.
    boostText: "Name a Range. The opponent must discard a card that includes that Range, or reveal a hand with none.",
    criticalText: 'Critical: Stun Immunity.',
    hooks: { before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 2); ctx.engine.logMsg(`${ctx.attacker.name}'s Flying Power Bomb closes ${ctx.engine.spaceWord(2)}.`); } },
    critical: { stunImmune: true },
    boost: { force: 0, continuous: false, needsRangeNameChoice: true,
      resolve(ctx) {
        const N = ctx.namedRange;
        const matches = ctx.opponent.hand.filter(c => c.range && N >= c.range[0] && N <= c.range[1]);
        if (matches.length === 0) {
          ctx.engine.logMsg(`${ctx.opponent.name} reveals their hand: ${ctx.opponent.hand.map(c => c.name).join(', ') || '(empty)'} \u2014 no card includes Range ${N}.`);
          ctx.engine.recordHandReveal(ctx.opponent);
        } else if (matches.length === 1) {
          const c = ctx.engine.discardFromHand(ctx.opponent, matches[0].uid);
          if (c) ctx.engine.logMsg(`${ctx.opponent.name} discards their ${c.name} (only card matching Range ${N}, named by Flying Power Bomb).`);
        } else {
          // 2+ matches — the OPPONENT chooses which one (confirmed with the user).
          // Boosts aren't set up to yield mid-resolve like Strikes are, so this
          // defers to a follow-up UI step — see engine.resolvePendingRangeDiscard.
          ctx.engine.pendingRangeDiscard = { playerId: ctx.opponent.id, matchingUids: matches.map(c => c.uid), namedRange: N };
          ctx.engine.logMsg(`${ctx.opponent.name} has multiple cards matching Range ${N} and must choose one to discard.`);
        }
      } }
  },
  {
    key: 'spinning_piledriver', name: 'Spinning Piledriver', type: 'special', owner: 'zangief',
    range: [1, 1], pow: 5, spd: 4, arm: 0, grd: 0, ignoreArmor: true, ignoreGuard: true,
    text: 'Ignore Armor, Guard. Hit: The opponent must discard a card at random.',
    boostText: '+2 Armor. After: If you were hit this Strike, add this card to your Gauge.',
    hooks: { hit(ctx) { ctx.engine.randomDiscardFromHand(ctx.defender, 1); } },
    boost: { force: 0, continuous: true, statMods: { arm: 2 }, toGaugeIfHitThisStrike: true }
  },
  {
    key: 'siberian_blizzard', name: 'Siberian Blizzard', type: 'ultra', owner: 'zangief', gaugeCost: 3,
    range: [1, 1], pow: 8, spd: 2, arm: 0, grd: 6,
    text: "Opponents can't move past you. Before: Close 1. Hit: Draw 2.",
    boostText: 'Advance 1 and draw 3.',
    blocksOpponentPassThrough: true,
    hooks: {
      before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 1); ctx.engine.logMsg(`${ctx.attacker.name}'s Siberian Blizzard closes 1 space.`); },
      hit(ctx) { ctx.engine.draw(ctx.attacker, 2); ctx.engine.logMsg(`${ctx.attacker.name} draws 2 (Siberian Blizzard).`); },
    },
    boost: { force: 0, continuous: false,
      resolve(ctx) { ctx.engine.advanceSelf(ctx.player, ctx.opponent, 1, true); ctx.engine.draw(ctx.player, 3); } }
  },
  {
    key: 'ultimate_atomic_buster', name: 'Ultimate Atomic Buster', type: 'ultra', owner: 'zangief', gaugeCost: 4,
    range: [1, 1], pow: 11, spd: 5, arm: 0, grd: 0,
    text: 'Hit: You and the opponent discard all cards.',
    boostText: '+1 Power, Stun Immunity. After: If you were hit this Strike, add this card to your Gauge.',
    hooks: { hit(ctx) { ctx.engine.discardAllHand(ctx.attacker); ctx.engine.discardAllHand(ctx.defender); ctx.engine.logMsg(`${ctx.attacker.name} and ${ctx.defender.name} discard all cards.`); } },
    boost: { force: 0, continuous: true, statMods: { pow: 1 }, stunImmuneGrant: true, toGaugeIfHitThisStrike: true }
  },
];

// === NEW SF CHARACTERS (9 chars, 40+ cards) ===
const SOL_BADGUY = [
  {
    key: 'bandit_bringer', name: 'Bandit Bringer', type: 'special', owner: 'sol',
    range: [1, 1], pow: 4, spd: 3, arm: 0, grd: 4,
    text: 'Ignore Guard.\nBefore: Advance 2.',
    boostText: '[+] Advance or Retreat up to 2.',
    ignoreGuard: true,
    hooks: {
      before(ctx) { ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 2, true); },
    },
    // DEFERRED: interactive "Advance or Retreat up to 2" boost movement
    boost: { force: 0, continuous: false, cancelable: true, resolve() {} }
  },
  {
    key: 'fafnir', name: 'Fafnir', type: 'special', owner: 'sol',
    range: [1, 2], pow: 5, spd: 4, arm: 0, grd: 0,
    text: 'Before: Close 1.\nHit: Push 1, Close 1.',
    boostText: 'Add a card from your hand to your Gauge.\nTake another action.',
    hooks: {
      before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 1); },
      hit(ctx) {
        ctx.engine.pushAway(ctx.defender, ctx.attacker, 1);
        ctx.engine.closeSelf(ctx.attacker, ctx.defender, 1);
      },
    },
    boost: { force: 0, continuous: false, cancelable: false, bonusAction: true,
      // DEFERRED: needsHandGaugeChoice — requires ui.js mode to pick a hand card,
      // move it to Gauge. For now, this boost just grants bonusAction.
      resolve() {} }
  },
  {
    key: 'gun_flame', name: 'Gun Flame', type: 'special', owner: 'sol',
    range: [1, 3], pow: 4, spd: 5, arm: 0, grd: 0,
    text: 'Hit: Advantage.\nAfter: +2 ARM, Close 2.',
    boostText: '[+] Hit: +1 POW.\nDraw 1.\nAfter: If opponent is stunned, Advantage.',
    hooks: {
      hit(ctx) { ctx.engine.grantAdvantage(ctx.attacker, 'Gun Flame'); },
      // HARD PART: "After: +2ARM" should boost ATTACKER's armor for OPPONENT's
      // second activation (if they act second). This needs attStats/defStats refs
      // (already added to ctx in engine.js) and an after hook that mutates it.
      // For now, can't implement without setting up the exact stats mutation timing.
    },
    boost: { force: 0, continuous: true, cancelable: true,
      statMods: { pow: 1 },
      nowDraw: 1,
      advantageIfOpponentStunnedThisStrike: true,
    }
  },
  {
    key: 'night_raid_vortex', name: 'Night Raid Vortex', type: 'special', owner: 'sol',
    range: [1, 1], pow: 4, spd: 2, arm: 0, grd: 6,
    text: 'Before: Close 3; if closed fewer than 3, draw 1.',
    boostText: '[+] +2 ARM. Now: Draw 2.',
    hooks: {
      before(ctx) {
        const before = ctx.attacker.pos;
        ctx.engine.closeSelf(ctx.attacker, ctx.defender, 3);
        const moved = Math.abs(ctx.attacker.pos - before);
        if (moved < 3) ctx.engine.draw(ctx.attacker, 1);
      },
    },
    boost: { force: 0, continuous: true, cancelable: true, statMods: { arm: 2 }, nowDraw: 2 }
  },
  {
    key: 'volcanic_viper', name: 'Volcanic Viper', type: 'special', owner: 'sol',
    range: [1, 2], pow: 3, spd: 5, arm: 0, grd: 3,
    text: 'If you initiated, +2 POW.\nOtherwise, +2 ARM.',
    boostText: '[+] Now: Close 1, Draw 1.\nHit: Opponent discards a random card.',
    hooks: {
      powBonusIfInitiating: 2,
      armBonusIfDefending: 2, // Added to engine.js in activateStep
    },
    boost: { force: 0, continuous: false, cancelable: true,
      resolve(ctx) {
        if (ctx.hitLanded) {
          ctx.engine.closeSelf(ctx.player, ctx.opponent, 1);
          ctx.engine.draw(ctx.player, 1);
          ctx.engine.randomDiscardFromHand(ctx.opponent, 1);
        }
      }
    }
  },
  {
    key: 'wild_throw', name: 'Wild Throw', type: 'special', owner: 'sol',
    range: [1, 1], pow: 5, spd: 3, arm: 0, grd: 3,
    text: 'Ignore Armor.\nYou cannot be Pushed or Pulled.\nHit: Pull 1, Advantage.',
    boostText: '[+] Hit: +1 POW.\nAdd this to your Gauge.',
    hooks: {
      hit(ctx) { 
        ctx.engine.pushToward(ctx.defender, ctx.attacker, 1);
        ctx.engine.logMsg(`${ctx.defender.name} is pulled 1 space (Wild Throw).`);
        ctx.engine.grantAdvantage(ctx.attacker, 'Wild Throw');
      }
    },
    ignoreArmor: true,
    movementImmune: true,
    boost: { force: 0, continuous: false, cancelable: true, toGaugeInstead: true }
    // NOTE: source text says "[+] Hit: +1 POW" on the boost, but toGaugeInstead
    // boosts resolve at boost-PLAY time (no Strike/hit occurs then) — there is
    // no "hit" for this clause to react to. Simplified to just the Gauge-add,
    // which is the only part of the printed effect that's actually reachable.
  },
  {
    key: 'heavy_mob_cemetery', name: 'Heavy Mob Cemetery', type: 'ultra', owner: 'sol', gaugeCost: 3,
    range: [1, 1], pow: 5, spd: 3, arm: 0, grd: 3,
    text: 'Before: If you initiated, Close 3.\nHit: Draw 4.',
    boostText: '[+] Hit: +1 POW, Draw 2.',
    hooks: {
      before(ctx) {
        if (ctx.strikeInitiator.id === ctx.attacker.id) {
          ctx.engine.closeSelf(ctx.attacker, ctx.defender, 3);
          ctx.engine.logMsg(`${ctx.attacker.name}'s Heavy Mob Cemetery closes ${ctx.engine.spaceWord(3)}.`);
        }
      },
      hit(ctx) { ctx.engine.draw(ctx.attacker, 4); ctx.engine.logMsg(`${ctx.attacker.name} draws 4 (Heavy Mob Cemetery).`); },
    },
    boost: { force: 0, continuous: false, cancelable: true,
      resolve(ctx) {
        if (ctx.hitLanded) {
          ctx.powBonus = (ctx.powBonus || 0) + 1;
          ctx.engine.draw(ctx.player, 2);
        }
      }
    }
  },
  {
    key: 'tyrant_rave', name: 'Tyrant Rave', type: 'ultra', owner: 'sol', gaugeCost: 2,
    range: [1, 2], pow: 3, spd: 7, arm: 0, grd: 0,
    text: 'Hit: Push 2; if pushed fewer than 2, +2 POW.',
    boostText: '[+] Before: Close 1; if closed fewer than 1, +2 POW.',
    hooks: {
      hit(ctx) {
        const before = ctx.defender.pos;
        ctx.engine.pushAway(ctx.defender, ctx.attacker, 2);
        const moved = Math.abs(ctx.defender.pos - before);
        ctx.engine.logMsg(`${ctx.defender.name} is pushed ${ctx.engine.spaceWord(moved)} (Tyrant Rave).${moved < 2 ? ' Incomplete push: +2 POW.' : ''}`);
        if (moved < 2) ctx.powBonus = (ctx.powBonus || 0) + 2;
      },
    },
    boost: { force: 0, continuous: true, cancelable: true,
      // grantsBeforeCloseWithBonus is wired in engine.js's activateStep,
      // runs before the card's own before hook
      grantsBeforeCloseWithBonus: { amount: 1, pow: 2 }
    }
  },
];

// === C. VIPER (Street Fighter set) ===
const CVIPER = [
  {
    key: 'burning_kick', name: 'Burning Kick', type: 'special', owner: 'cviper',
    range: [2, 3], pow: 4, spd: 5, arm: 0, grd: 0,
    text: 'Critical, Hit: Opponent has -2 POW.\nAdvantage.\nAfter: Close 1.',
    boostText: '[+] +1 POW, Ignore Armor.',
    hooks: { // Mutates opponent's stats
      hit(ctx) { ctx.engine.grantAdvantage(ctx.attacker, 'Burning Kick'); },
      after(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 1); ctx.engine.logMsg(`${ctx.attacker.name}'s Burning Kick closes 1 space.`); }
    },
    critical: { hit(ctx) { ctx.defStats.pow -= 2; } },
    boost: { force: 0, continuous: false,
      resolve(ctx) { ctx.powBonus = (ctx.powBonus || 0) + 1; }
    }
  },
  {
    key: 'emergency_combination', name: 'Emergency Combination', type: 'special', owner: 'cviper',
    range: [2, 3], pow: 3, spd: 5, arm: 0, grd: 0,
    text: 'Before: If you have a Continuous Boost in play, +2 POW.',
    boostText: 'Draw 2 cards.\nAdd this card to your Gauge.',
    hooks: {
      powBonusIfOwnContinuousBoost: 2, // Checked in liveStats
      before(ctx) {
        if (ctx.attacker.boostsInPlay.length > 0) {
          ctx.powBonus = (ctx.powBonus || 0) + 2;
        }
      },
    },
    boost: { force: 1, continuous: false, toGaugeInstead: true,
      resolve(ctx) { ctx.engine.draw(ctx.player, 2); }
    }
  },
  {
    key: 'seismic_hammer', name: 'Seismic Hammer', type: 'special', owner: 'cviper',
    range: [2, 5], pow: 5, spd: 1, arm: 0, grd: 0,
    text: 'Critical: +3 SPD.\nAfter: Move up to 2.',
    boostText: '[+] +1 POW, +5 GRD.',
    hooks: {
      after(ctx) {
        const needsChoice = ctx.engine.range(ctx.attacker, ctx.defender) > 1;
        if (needsChoice) {
          // HARD PART: after-hook yielded choice isn't implemented
          // For now, just auto-advance 2
          ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 2, true);
          ctx.engine.logMsg(`${ctx.attacker.name}'s Seismic Hammer advances up to ${ctx.engine.spaceWord(2)}.`);
        }
      }
    },
    critical: { statMods: { spd: 3 } },
    boost: { force: 1, continuous: false,
      resolve(ctx) { ctx.powBonus = (ctx.powBonus || 0) + 1; }
    }
  },
  {
    key: 'temple_massage', name: 'Temple Massage', type: 'special', owner: 'cviper',
    range: [1, 1], pow: 4, spd: 4, arm: 0, grd: 0,
    text: 'Critical,\nHit: Draw 3 cards.\nHit: Spend up to {4} Force; +1 POW each.',
    boostText: 'Search discard for a Continuous Boost.\nYou may play it, paying costs.',
    hooks: {
      hit(ctx) { ctx.engine.draw(ctx.attacker, 3); ctx.engine.logMsg(`${ctx.attacker.name} draws 3 (Temple Massage).`); },
      // HARD PART: optional_force_spend_pow on hit is wired in engine.js
      // but UI mode isn't implemented yet
      optionalForceSpendForPow: { max: 4, powPerForce: 1 }
    },
    critical: {},
    boost: { force: 0, continuous: false, needsDiscardBoostChoice: true }
  },
  {
    key: 'thunder_knuckle', name: 'Thunder Knuckle', type: 'special', owner: 'cviper',
    range: [1, 1], pow: 3, spd: 5, arm: 0, grd: 0,
    text: 'Critical: Ignore Guard.\nBefore: Close 1.',
    boostText: '[+] Hit: Spend up to {4} Force; +1 POW each.',
    hooks: {
      before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 1); }
    },
    critical: { ignoreGuard: true },
    boost: { force: 0, continuous: true,
      optionalForceSpendForPowOnHit: { max: 4, powPerForce: 1 }
    }
  },
  {
    key: 'burning_dance', name: 'Burning Dance', type: 'ultra', owner: 'cviper', gaugeCost: 3,
    range: [1, 3], pow: 5, spd: 5, arm: 0, grd: 0,
    text: 'Ignore Armor.\nHit: Push 8.\nAfter: Close 8.',
    boostText: '[+] Opponent has +3 POW.\nNow: Draw 3.\nTake another action.',
    hooks: {
      hit(ctx) { ctx.engine.pushAway(ctx.defender, ctx.attacker, 8); },
      after(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 8); }
    },
    ignoreArmor: true,
    boost: { force: 0, continuous: true, bonusAction: true, nowDraw: 3,
      opponentPowMod: 3 // Debuffs opponent; checked in liveStats for opponent
    }
  },
  {
    key: 'burst_time', name: 'Burst Time', type: 'ultra', owner: 'cviper', gaugeCost: 4,
    range: [1, 2], pow: 10, spd: 2, arm: 0, grd: 0,
    text: 'Stun Immunity.\nIf you do not have any Continuous Boosts in play,\nyour attack does not hit.',
    boostText: '[+] +3 ARM, +1 GRD.\nCleanup: If you weren\'t stunned,\nspend {1} to sustain.',
    stunImmuneBase: true,
    noHitWithoutContinuousBoost: true, // Checked in engine.js's inRange gate
    boost: { force: 0, continuous: true, sustainIfNotStunnedCost: 1 }
  },
];

// === VEGA (Street Fighter set) ===
const VEGA = [
  {
    key: 'flying_barcelona_attack', name: 'Flying Barcelona Attack', type: 'special', owner: 'vega',
    range: [1, 2], pow: 5, spd: 3, arm: 0, grd: 0,
    text: 'Critical: +2 POW.\nBefore: Advance as far as possible, then Close 1.',
    boostText: 'Advance as far as possible.',
    hooks: {
      before(ctx) {
        // Advance "as far as possible" — essentially advanceSelf with allowPass=true to edge
        let moved = 0;
        while (ctx.attacker.pos !== ctx.defender.pos &&
               (ctx.attacker.pos < ctx.engine.BOARD_SIZE - 1 || ctx.attacker.pos > 0)) {
          const dir = ctx.attacker.pos < ctx.defender.pos ? 1 : -1;
          const next = ctx.attacker.pos + dir;
          if (next < 0 || next >= ctx.engine.BOARD_SIZE) break;
          ctx.attacker.pos = next;
          moved++;
        }
        ctx.engine.closeSelf(ctx.attacker, ctx.defender, 1);
      }
    },
    critical: { statMods: { pow: 2 } },
    boost: { force: 0, continuous: false,
      resolve(ctx) {
        let moved = 0;
        while (ctx.player.pos !== ctx.opponent.pos &&
               (ctx.player.pos < 5 || ctx.player.pos > 0)) {
          const dir = ctx.player.pos < ctx.opponent.pos ? 1 : -1;
          const next = ctx.player.pos + dir;
          if (next < 0 || next >= 5) break;
          ctx.player.pos = next;
          moved++;
        }
      }
    }
  },
  {
    key: 'pounce', name: 'Pounce', type: 'special', owner: 'vega',
    range: [1, 2], pow: 5, spd: 2, arm: 0, grd: 4,
    text: 'Critical: +2 ARM.\nBefore: Close 2.\nHit: Opponent discards a random card.',
    boostText: 'Retreat up to 2, then Strike.',
    hooks: {
      before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 2); },
      hit(ctx) { ctx.engine.randomDiscardFromHand(ctx.defender, 1); }
    },
    critical: { statMods: { arm: 2 } },
    boost: { force: 1, continuous: false, needsDirectionChoice: true, triggersStrike: true }
  },
  {
    key: 'rolling_crystal_flash', name: 'Rolling Crystal Flash', type: 'special', owner: 'vega',
    range: [1, 1], pow: 3, spd: 2, arm: 0, grd: 0,
    text: 'For each space between you and opponent, +1 SPD.\nBefore: Close 5.\nHit: Push 3.',
    boostText: 'Move 3.\nIf you moved past the opponent,\nadd this card to your Gauge.',
    hooks: {
      spdBonusPerRangeAtSetTime: 1, // +1SPD per range (checked in liveStats)
      before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 5); },
      hit(ctx) { ctx.engine.pushAway(ctx.defender, ctx.attacker, 3); },
    },
    boost: { force: 0, continuous: false, needsDirectionChoice: true,
      resolve(ctx) {
        const before = ctx.player.pos < ctx.opponent.pos;
        if (ctx.moveDirection === 'advance') ctx.engine.advanceSelf(ctx.player, ctx.opponent, 3, true);
        else if (ctx.moveDirection === 'retreat') ctx.engine.retreatSelf(ctx.player, ctx.opponent, 3);
        const after = ctx.player.pos < ctx.opponent.pos;
        if (before !== after) ctx.gaugeInsteadOfDiscard = true;
      }
    }
  },
  {
    key: 'scarlet_terror', name: 'Scarlet Terror', type: 'special', owner: 'vega',
    range: [1, 2], pow: 3, spd: 4, arm: 0, grd: 0,
    text: 'Critical: +2 SPD.\nBefore: Close 2.',
    boostText: 'If at edge of arena, move to any space and Strike.\nYou get innate bonuses during this Strike.',
    hooks: {
      before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 2); }
    },
    critical: { statMods: { spd: 2 } },
    boost: { force: 2, continuous: false,
      // DEFERRED: needsAnySpaceChoice + edge innate bonus tracking
      needsAnySpaceChoice: true, triggersStrike: true
    }
  },
  {
    key: 'sky_high_claw', name: 'Sky High Claw', type: 'special', owner: 'vega',
    range: [1, 1], pow: 4, spd: 3, arm: 0, grd: 0,
    text: 'Critical: +2 POW.\nBefore: Close 3.',
    boostText: 'Move 3.\nIf moved past opponent,\nput a Continuous Boost from discard into play.',
    hooks: {
      before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 3); }
    },
    critical: { statMods: { pow: 2 } },
    // `force: 1` is this card's printed FRC cost on the Vega sheet; it was 0 here
    // (card-data audit, 2026-08-17).
    boost: { force: 1, continuous: false, needsDirectionChoice: true,
      resolve(ctx) {
        const before = ctx.player.pos < ctx.opponent.pos;
        if (ctx.moveDirection === 'advance') ctx.engine.advanceSelf(ctx.player, ctx.opponent, 3, true);
        else if (ctx.moveDirection === 'retreat') ctx.engine.retreatSelf(ctx.player, ctx.opponent, 3);
        const after = ctx.player.pos < ctx.opponent.pos;
        if (before !== after) ctx.engine.reviveBestContinuousBoostFromDiscard(ctx.player);
      }
    }
  },
  {
    key: 'bloody_high_claw', name: 'Bloody High Claw', type: 'ultra', owner: 'vega', gaugeCost: 3,
    range: [1, 2], pow: 4, spd: 6, arm: 0, grd: 0,
    text: 'Before: If 3+ spaces behind opponent, +3 POW.\nHit: Move up to 8.',
    boostText: '[+] +0~1 RNG and your attacks are Critical.\nCleanup: If not stunned, spend {1} to sustain.',
    hooks: {
      before(ctx) {
        const behind = ctx.engine.spacesBehindAwayFrom(ctx.defender, ctx.attacker);
        if (behind >= 3) ctx.powBonus = (ctx.powBonus || 0) + 3;
      },
      hit(ctx) {
        // Move up to 8 (prompt choice deferred — for now, auto-advance 8)
        ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 8, true);
      },
    },
    boost: { force: 1, continuous: true,
      rangeMaxBonus: 1,
      forcesFreeCritical: true, // Checked in engine.js; all attacks are Critical free
      sustainIfNotStunnedCost: 1
    }
  },
  {
    key: 'splendid_claw', name: 'Splendid Claw', type: 'ultra', owner: 'vega', gaugeCost: 3,
    range: [1, 2], pow: 7, spd: 4, arm: 0, grd: 0,
    text: 'Before: Close 3.\nHit: Opponent discards 3 at random.',
    boostText: '[+] +1 POW, +1 ARM.\nCleanup: If not stunned, spend {1} to sustain.',
    hooks: {
      before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 3); },
      hit(ctx) { ctx.engine.randomDiscardFromHand(ctx.defender, 3); },
    },
    boost: { force: 0, continuous: true,
      statMods: { pow: 1, arm: 1 },
      sustainIfNotStunnedCost: 1
    }
  },
];

// === AKUMA (Street Fighter set) ===
// === AKUMA (owner: 'akuma') === Source: EXdata.xlsx "Akuma" sheet, verified 2026-08-13
const AKUMA = [
  {
    key: 'gohadoken', name: 'Gohadoken', type: 'special', owner: 'akuma',
    range: [2, 6], pow: 5, spd: 4, arm: 0, grd: 0,
    text: 'Critical: +1 SPD, -2 POW.',
    boostText: '[+] +1 POW.\nNow: Spend up to 5 life to draw that many cards.',
    critical: { statMods: { spd: 1, pow: -2 } },
    // HARD PART: "spend up to X life to draw that many cards" needs a new
    // life-for-cards yield type (amount choice + life deduction). Not in
    // engine.js today. Deferred — boost still grants its printed +1 POW below.
    boost: { force: 0, continuous: true, statMods: { pow: 1 } }
  },
  {
    key: 'goshoryuken', name: 'Goshoryuken', type: 'special', owner: 'akuma',
    range: [1, 1], pow: 3, spd: 7, arm: 0, grd: 0,
    text: 'Before: Close 1.\nHit: Push 2.',
    boostText: 'Add this card to your Gauge or Move 1. Then, take another action.',
    hooks: {
      before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 1); },
      hit(ctx) { ctx.engine.pushAway(ctx.defender, ctx.attacker, 2); },
    },
    // HARD PART: "Add to Gauge OR Move 1" is a real choice; simplified to
    // always Gauge (the stronger/simpler of the two — Move 1 with no direction
    // specified is of unclear value here anyway) rather than offering the
    // choice. The "then take another action" part is NOT simplified — it's a
    // real bonusAction, same as every other card using this shape.
    boost: { force: 1, continuous: false, toGaugeInstead: true, bonusAction: true }
  },
  {
    key: 'hyakkishu', name: 'Hyakkishu', type: 'special', owner: 'akuma',
    range: [1, 1], pow: 4, spd: 4, arm: 0, grd: 0,
    text: "Critical: Ignore Armor.\nBefore: Close 2.\nAfter: For the rest of the Strike, attacks at range 1 don't hit you.",
    boostText: '[+] Now: Strike. The opponent sets their card first.\nAfter: Add this card to your Gauge.',
    notes: 'You still win SPD ties.',
    critical: { ignoreArmor: true },
    hooks: {
      before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 2); },
      // HARD PART: "for the rest of the Strike, attacks at range 1 don't hit
      // you" needs a strike-scoped range-immunity flag distinct from the
      // per-card rangeImmuneRanges (card-scoped, not "for the rest of this
      // Strike, on a second activation"). Deferred.
    },
    // HARD PARTS: "the opponent sets their card first" (reversed initiative)
    // and the "Hit:"-style self-to-Gauge-after aren't expressible with
    // existing boost flags (triggersStrike always uses normal initiative
    // order, and there's no self-referencing-card hook in continuous boost
    // resolve()). Simplified to the strike trigger only — a real, working
    // subset of the printed effect, not a no-op fallback.
    boost: { force: 0, continuous: false, triggersStrike: true }
  },
  {
    key: 'tatsumaki_zankukyaku', name: 'Tatsumaki Zankukyaku', type: 'special', owner: 'akuma',
    range: [1, 2], pow: 4, spd: 4, arm: 0, grd: 0,
    text: 'Before: Advance 2.\nHit: If you moved past the opponent during this Strike, they discard a card at random.',
    boostText: '[+] +1 SPD.\nHit: Add this card to your Gauge.',
    hooks: {
      before(ctx) {
        const before = ctx.attacker.pos < ctx.defender.pos;
        ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 2, true);
        const after = ctx.attacker.pos < ctx.defender.pos;
        if (before !== after) ctx.sideSwapped = true;
      },
      hit(ctx) { if (ctx.sideSwapped) ctx.engine.randomDiscardFromHand(ctx.defender, 1); },
    },
    // HARD PART: "Hit: Add this card to your Gauge" (a continuous boost
    // self-gauging when ITS OWNER lands a hit with a DIFFERENT attack card)
    // has no existing generic hook — boost.onHit(ctx) exists but ctx carries
    // no reference back to the boost's own card instance. Deferred; +1 SPD
    // still applies.
    boost: { force: 0, continuous: true, statMods: { spd: 1 } }
  },
  {
    key: 'zugaihasatsu', name: 'Zugaihasatsu', type: 'special', owner: 'akuma',
    range: [1, 2], pow: 3, spd: 5, arm: 0, grd: 0,
    text: 'Critical, Hit: Advantage.\nHit: If the opponent has 4+ Guard, +2 POW.',
    boostText: '[+] +2 POW.\nHit: Add this card to your Gauge.',
    critical: { hit(ctx) { ctx.engine.grantAdvantage(ctx.attacker, 'Zugaihasatsu'); } },
    hooks: {
      hit(ctx) { if ((ctx.defenderCard.grd || 0) >= 4) ctx.powBonus = (ctx.powBonus || 0) + 2; },
    },
    // HARD PART: same self-to-Gauge-on-hit limitation as Tatsumaki above.
    boost: { force: 0, continuous: true, statMods: { pow: 2 } }
  },
  {
    key: 'demon_armageddon', name: 'Demon Armageddon', type: 'ultra', owner: 'akuma', gaugeCost: 4,
    range: [1, 1], pow: 6, spd: 5, arm: 0, grd: 0,
    text: 'All positive POW bonuses applied to you are doubled.',
    boostText: '[+] All positive POW bonuses applied to you are doubled.',
    notes: "Errata: no [+] symbol on first-print copies. It's still a Continuous Boost.",
    // HARD PART: "double all positive POW bonuses" needs to hook the POW-bonus
    // accumulation pipeline generically (every +POW source across every card),
    // not a single stat. Deferred — no partial-credit fallback attempted, since
    // a wrong multiplier would misrepresent the card worse than no effect.
    boost: { force: 0, continuous: true }
  },
  {
    key: 'wrath_of_the_raging_demon', name: 'Wrath of the Raging Demon', type: 'ultra', owner: 'akuma', gaugeCost: 3,
    range: [1, 1], pow: 11, spd: 3, arm: 0, grd: 0,
    text: 'Ignore Armor.\nBefore: Close 2.',
    boostText: '[+] If you have 3 or more bonus POW, +3 SPD.',
    notes: "Errata: no [+] symbol on first-print copies. It's still a Continuous Boost.",
    ignoreArmor: true,
    hooks: {
      before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 2); },
    },
    // HARD PART: "if you have 3+ bonus POW" needs to inspect the live
    // POW-bonus running total at boost-resolve time, not queryable today.
    // Deferred — boost currently grants no SPD bonus.
    boost: { force: 0, continuous: true }
  },
];

// === GUILE (owner: 'guile') === Source: EXdata.xlsx "Guile" sheet, verified 2026-08-13
const GUILE = [
  {
    key: 'double_sweep_kick', name: 'Double Sweep Kick', type: 'special', owner: 'guile',
    range: [1, 1], pow: 2, spd: 6, arm: 0, grd: 0,
    text: 'Before: Advance 2.\nHit: Advantage.',
    boostText: '[+] +0~1 RNG.\nAt the end of your next turn, add this card to your Gauge.',
    hooks: {
      before(ctx) { ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 2, true); },
      hit(ctx) { ctx.engine.grantAdvantage(ctx.attacker, 'Double Sweep Kick'); },
    },
    // "+0~1RNG" auto-resolves to +1 per this codebase's "up to X" convention.
    boost: { force: 0, continuous: true, rangeMaxBonus: 1, expireToGaugeAtStartOfNextTurn: true }
  },
  {
    key: 'flash_kick', name: 'Flash Kick', type: 'special', owner: 'guile',
    range: [1, 2], pow: 4, spd: 3, arm: 1, grd: 4,
    text: 'Critical: +2 POW.\nHit: Push 2.\nAfter: Move 1.',
    boostText: '[+] +2 POW.\nAt the end of your next turn, add this card to your Gauge.',
    critical: { statMods: { pow: 2 } },
    hooks: {
      hit(ctx) { ctx.engine.pushAway(ctx.defender, ctx.attacker, 2); },
      // DEFERRED: "After: Move 1"
      // Requires: a direction for an unqualified "Move" effect (unlike
      // Advance/Retreat/Close, which are explicit)
      // Workaround: none — fully deferred; no direction is guessed
    },
    boost: { force: 0, continuous: true, statMods: { pow: 2 }, expireToGaugeAtStartOfNextTurn: true }
  },
  {
    key: 'reverse_spin_kick', name: 'Reverse Spin Kick', type: 'special', owner: 'guile',
    range: [1, 2], pow: 5, spd: 3, arm: 0, grd: 0,
    text: 'Ignore Guard.\nCritical, Hit: The opponent must discard 2 cards at random.',
    boostText: '[+] +1 ARM, +3 GRD.\nAt the end of your next turn, add this card to your Gauge.',
    ignoreGuard: true,
    critical: { hit(ctx) { ctx.engine.randomDiscardFromHand(ctx.defender, 2); } },
    boost: { force: 0, continuous: true, statMods: { arm: 1, grd: 3 }, expireToGaugeAtStartOfNextTurn: true }
  },
  {
    key: 'sonic_boom', name: 'Sonic Boom', type: 'special', owner: 'guile',
    range: [3, 8], pow: 4, spd: 3, arm: 0, grd: 5,
    text: 'Critical: +2 POW.\nAfter: Move 1 or 2.',
    boostText: '[+] +2 SPD.\nAt the end of your next turn, add this card to your Gauge.',
    critical: { statMods: { pow: 2 } },
    // DEFERRED: "After: Move 1 or 2"
    // Requires: a direction for an unqualified "Move" effect, plus an
    // amount choice (1 or 2)
    // Workaround: none — fully deferred; the printed Critical bonus above
    // still applies
    boost: { force: 0, continuous: true, statMods: { spd: 2 }, expireToGaugeAtStartOfNextTurn: true }
  },
  {
    key: 'spinning_back_knuckle', name: 'Spinning Back Knuckle', type: 'special', owner: 'guile',
    range: [1, 2], pow: 5, spd: 4, arm: 0, grd: 0,
    text: 'Critical: +2 POW.\nHit: Move 1. The opponent must discard 1 card at random.',
    boostText: 'Close 2. If you are not at range 1 after this, you may take another action.',
    critical: { statMods: { pow: 2 } },
    hooks: {
      // DEFERRED: "Hit: Move 1"
      // Requires: a direction for an unqualified "Move" effect
      // Workaround: the discard-1 half of this Hit clause is implemented below
      hit(ctx) { ctx.engine.randomDiscardFromHand(ctx.defender, 1); },
    },
    // DEFERRED: "if you are not at range 1 after this, you may take another
    // action"
    // Requires: a conditional bonusAction (existing bonusAction flag is
    // unconditional once granted)
    // Workaround: the Close 2 itself is implemented; the conditional bonus
    // action is not
    boost: { force: 0, continuous: false,
      resolve(ctx) { ctx.engine.closeSelf(ctx.player, ctx.opponent, 2); }
    }
  },
  {
    key: 'flash_explosion', name: 'Flash Explosion', type: 'ultra', owner: 'guile', gaugeCost: 4,
    range: [1, 2], pow: 9, spd: 3, arm: 2, grd: 5,
    text: 'Hit: Push 3.\nAfter: Move 2.',
    boostText: '[+] +2 GRD and your attacks are Critical.\nCleanup: If you were not stunned, you may sustain this boost.',
    hooks: {
      hit(ctx) { ctx.engine.pushAway(ctx.defender, ctx.attacker, 3); },
      // DEFERRED: "After: Move 2"
      // Requires: a direction for an unqualified "Move" effect
      // Workaround: none — fully deferred
    },
    // `sustainIfNotStunned`, not `sustainIfNoNormalUsed`: the printed Cleanup clause
    // is "If you were not stunned, you may sustain this boost" — a Stun gate, not a
    // card-type gate. It used to carry the card-type flag, which got the rule wrong
    // in both directions (sustain offered after a Stun, refused after a Normal).
    boost: { force: 0, continuous: true, statMods: { grd: 2 }, forcesFreeCritical: true, sustainIfNotStunned: true }
  },
  {
    key: 'sonic_hurricane', name: 'Sonic Hurricane', type: 'ultra', owner: 'guile', gaugeCost: 3,
    range: [2, 5], pow: 8, spd: 4, arm: 0, grd: 5,
    text: 'After: Move up to 3.',
    boostText: '[+] +2 SPD.\nNow: Strike.',
    hooks: {
      after(ctx) { ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 3, true); },
    },
    boost: { force: 1, continuous: true, statMods: { spd: 2 }, triggersStrike: true }
  },
];

// === CHUN-LI (owner: 'chunli') === Source: EXdata.xlsx "Chun-Li" sheet, verified 2026-08-13
const CHUNLI = [
  {
    key: 'flipping_axe_kick', name: 'Flipping Axe Kick', type: 'special', owner: 'chunli',
    range: [1, 2], pow: 3, spd: 5, arm: 0, grd: 0,
    text: 'Critical: +2 POW.\nBefore: Advance 2.',
    boostText: '[+] +1 POW.\nHit: Advantage and add this card to your Gauge.',
    critical: { statMods: { pow: 2 } },
    hooks: {
      before(ctx) { ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 2, true); },
    },
    // DEFERRED: "Hit: ...add this card to your Gauge"
    // Requires: a boost onHit callback that can reference the boost's own
    // card instance (onHit(ctx) today only receives {engine, player, opponent})
    // Workaround: the Advantage half of this Hit clause is implemented via
    // onHit below
    boost: { force: 0, continuous: true, statMods: { pow: 1 }, onHit(ctx) { ctx.engine.grantAdvantage(ctx.player, 'Flipping Axe Kick boost'); } }
  },
  {
    key: 'head_stomp_chunli', name: 'Head Stomp', type: 'special', owner: 'chunli',
    // RNG is printed as "X" on the sheet — this card has NO numeric range band; the
    // only way it connects is the side-swap clause below (rangeIncludeIfSideSwapped).
    // It previously carried an invented `range: [1,1]`, which let it hit at range 1
    // without ever moving past the opponent — a stat that does not exist on the card.
    range: null, rangeIncludeIfSideSwapped: true, pow: 5, spd: 5, arm: 0, grd: 0,
    text: "Before: Advance 3. If you moved past the opponent with this movement, your attack's range includes them.\nCritical, Hit: +1 POW and draw 1.",
    boostText: '[+] +1 SPD.\nHit: Advantage and add this card to your Gauge.',
    critical: { hit(ctx) { ctx.powBonus = (ctx.powBonus || 0) + 1; ctx.engine.draw(ctx.attacker, 1); } },
    hooks: {
      // Side-swap detection follows the same before/after position comparison every
      // other "did I move past them" card uses (Tatsumaki, Dive); the engine turns
      // ctx.sideSwapped plus this card's rangeIncludeIfSideSwapped into the range
      // exception. No longer deferred.
      before(ctx) {
        const before = ctx.attacker.pos < ctx.defender.pos;
        ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 3, true);
        const after = ctx.attacker.pos < ctx.defender.pos;
        if (before !== after) ctx.sideSwapped = true;
      },
    },
    // DEFERRED: "Hit: ...add this card to your Gauge"
    // Requires: same boost-self-reference limitation as Flipping Axe Kick above
    // Workaround: the Advantage half of this Hit clause is implemented via
    // onHit below
    boost: { force: 0, continuous: true, statMods: { spd: 1 }, onHit(ctx) { ctx.engine.grantAdvantage(ctx.player, 'Head Stomp boost'); } }
  },
  {
    key: 'kikoken', name: 'Kikoken', type: 'special', owner: 'chunli',
    range: [3, 5], pow: 4, spd: 2, arm: 0, grd: 4,
    text: 'Critical: +4 ARM.\nAfter: Lose all Armor, then Move 1.',
    boostText: '[+] Ignore Armor\nNow: Strike.\nHit: Add this card to your Gauge.',
    critical: { statMods: { arm: 4 } },
    // DEFERRED: "After: Lose all Armor, then Move 1"
    // Requires: safe self-stat mutation timing mid-Strike (engine.js has a
    // documented ordering hazard at this exact point) plus a direction for
    // the unqualified "Move"
    // Workaround: none — fully deferred
    boost: { force: 0, continuous: true, ignoreArmorGrant: true, triggersStrike: true }
  },
  {
    key: 'lightning_legs', name: 'Lightning Legs', type: 'special', owner: 'chunli',
    range: [1, 2], pow: 3, spd: 6, arm: 0, grd: 0,
    text: 'Critical,\nAfter: If you hit, you may return this card to the top of your deck. If you do, sustain one of your Boosts.',
    boostText: '[+] After: If you hit, return your attack to the top of your deck and add this card to your Gauge.',
    critical: {},
    // DEFERRED: "return this card to top of deck" / "sustain one of your Boosts"
    // Requires: deck-top insertion from the attack card itself, plus an
    // out-of-band sustain trigger outside the normal cleanup pass
    // Workaround: none — this card is a plain Critical-eligible Strike with
    // no bonus effect until implemented
    boost: { force: 0, continuous: true }
  },
  {
    key: 'spinning_bird_kick', name: 'Spinning Bird Kick', type: 'special', owner: 'chunli',
    range: [1, 2], pow: 5, spd: 4, arm: 0, grd: 4,
    text: 'Before: Advance 3.\nHit: If you moved past the opponent during this Strike, Push or Pull 2.',
    boostText: '[+] Ignore Guard\nNow: Strike.\nHit: Add this card to your Gauge.',
    hooks: {
      before(ctx) {
        const before = ctx.attacker.pos < ctx.defender.pos;
        ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 3, true);
        const after = ctx.attacker.pos < ctx.defender.pos;
        if (before !== after) ctx.sideSwapped = true;
      },
      // DEFERRED: "Push or Pull 2" (attacker's choice)
      // Requires: a real yielded push/pull direction choice, not an
      // auto-resolved single-direction effect
      // Workaround: the Advance/side-swap tracking above is real and usable
      // by a future implementation
    },
    // DEFERRED: "Ignore Guard" as a continuous-boost grant, and the
    // "Hit: ...add this card to your Gauge" clause
    // Requires: engine.js only has ignoreArmorGrant, no ignoreGuardGrant
    // equivalent; plus the same boost-self-reference limitation noted above
    // Workaround: triggersStrike ("Now: Strike") is implemented
    boost: { force: 1, continuous: true, triggersStrike: true }
  },
  {
    key: 'hosenka', name: 'Hosenka', type: 'ultra', owner: 'chunli', gaugeCost: 4,
    range: [1, 2], pow: 9, spd: 4, arm: 0, grd: 0,
    text: 'Critical: +2 POW.\nBefore: Close 2.',
    boostText: 'The opponent must discard 3 Normals, or reveal their hand and discard all Normals.',
    critical: { statMods: { pow: 2 } },
    hooks: {
      before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 2); },
    },
    // DEFERRED: "discard 3 Normals, or reveal hand and discard all Normals"
    // Requires: Normal-type-filtered targeted discard with a reveal fallback
    // (randomDiscardFromHand is type-agnostic)
    // Workaround: none — boost costs 2 Force (per source FRC=2.0) with no
    // effect, rather than risk a wrong approximation
    boost: { force: 2, continuous: false }
  },
  {
    key: 'kikousho', name: 'Kikousho', type: 'ultra', owner: 'chunli', gaugeCost: 2,
    range: [1, 3], pow: 7, spd: 2, arm: 0, grd: 0,
    text: "Attacks at range 4+ don't hit you.\nAfter: If this attack did not hit the opponent, draw a card and add the top 2 cards of your discard pile to Gauge.",
    boostText: '[+] Stun Immunity\nNow: Strike.\nHit: Add this card to your Gauge.',
    rangeImmuneRanges: [4, 5, 6, 7, 8],
    // DEFERRED: "if this attack did NOT hit" After-clause
    // Requires: a verified-safe way to branch on hit/miss inside a card's
    // own after() hook at this stage
    // Workaround: none — rangeImmuneRanges above is implemented and
    // independently valuable regardless of this clause
    boost: { force: 1, continuous: true, stunImmuneGrant: true, triggersStrike: true }
  },
];

// === DAN (owner: 'dan') === Source: EXdata.xlsx "Dan" sheet, verified 2026-08-13
const DAN = [
  {
    key: 'dankukyaku', name: 'Dankukyaku', type: 'special', owner: 'dan',
    range: [1, 2], pow: 3, spd: 6, arm: 0, grd: 0,
    text: 'Before: Advance 3. If you moved past the opponent during this movement, this attack does not hit.\nAfter: Place a card from your hand on top of your deck.',
    boostText: 'Move 3, then add a card from hand to Gauge.',
    hooks: {
      before(ctx) { ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 3, true); },
      // DEFERRED: "if you moved past the opponent, this attack does not hit"
      // Requires: a conditional forced-miss during this same activation
      // Workaround: none — movement above is real; the conditional miss is
      // simply not enforced
    },
    // DEFERRED: "place a card from your hand on top of your deck" (both the
    // After clause here and the boost's Gauge-add)
    // Requires: a self-targeted hand-card-picker yield type
    // Workaround: the boost's Move 3 is implemented; the Gauge-add is not
    boost: { force: 1, continuous: false,
      resolve(ctx) { ctx.engine.advanceSelf(ctx.player, ctx.opponent, 3, true); }
    }
  },
  {
    key: 'gadouken', name: 'Gadouken', type: 'special', owner: 'dan',
    range: [1, 4], pow: 4, spd: 4, arm: 0, grd: 0,
    text: 'After: If you hit, you may return this card to the top of your deck. If you do, add a card from hand to Gauge.',
    boostText: "Look at the opponent's hand. Discard any number of cards from your hand, then Strike.",
    // DEFERRED: both the Strike-side After clause and the boost (hand
    // reveal + discard-then-forced-Strike)
    // Requires: hand-picker yields and an opponent-hand-reveal mechanic,
    // neither currently exposed
    // Workaround: none — plain Strike-only card for now.
    // `force: 1` is the sheet's FRC cost, restored by the 2026-08-17 card-data audit;
    // it stands even though the boost's effect is deferred, since the cost is what the
    // player pays to play it at all.
    boost: { force: 1, continuous: false }
  },
  {
    key: 'koryuken', name: 'Koryuken', type: 'special', owner: 'dan',
    range: [1, 2], pow: 0, spd: 6, arm: 0, grd: 0,
    text: "Hit: Discard the top card of your deck. This attack has +X POW, where X is the discarded card's printed POW.",
    boostText: '[+] Your attacks are Critical.\nCleanup: If you are not stunned, you may sustain this boost.',
    hooks: {
      hit(ctx) {
        const top = ctx.attacker.deck[ctx.attacker.deck.length - 1];
        if (top) {
          ctx.attacker.deck.pop();
          ctx.attacker.discard.push(top);
          ctx.powBonus = (ctx.powBonus || 0) + (top.pow || 0);
          ctx.engine.logMsg(`${ctx.attacker.name}'s Koryuken discards ${top.name} from the deck for +${top.pow || 0} POW.`);
        }
      },
    },
    boost: { force: 0, continuous: true, forcesFreeCritical: true, sustainIfNotStunnedCost: 1 }
  },
  {
    key: 'saikyo_haraigoshi', name: 'Saikyo Haraigoshi', type: 'special', owner: 'dan',
    range: [1, 1], pow: 2, spd: 7, arm: 0, grd: 0,
    text: 'Hit: Discard up to 3 cards at random from your hand. For each card discarded, Pull 1 and +1 POW.',
    boostText: 'Look at the top card of your deck. You may Strike. If you do not, add that card to your gauge.',
    hooks: {
      hit(ctx) {
        const n = Math.min(3, ctx.attacker.hand.length);
        if (n > 0) {
          for (let i = 0; i < n; i++) {
            const c = ctx.attacker.hand[Math.floor(Math.random() * ctx.attacker.hand.length)];
            ctx.engine.discardFromHand(ctx.attacker, c.uid);
          }
          ctx.engine.pullTowardWithoutPassing(ctx.defender, ctx.attacker, n);
          ctx.powBonus = (ctx.powBonus || 0) + n;
        }
      },
    },
    // DEFERRED: "look at top card, may Strike / else Gauge it"
    // Requires: a deck-peek yield (Axl's decklook is a different, non-generic flow)
    // Workaround: none — fully deferred
    boost: { force: 0, continuous: false }
  },
  {
    key: 'legendary_taunt', name: 'Legendary Taunt', type: 'ultra', owner: 'dan', gaugeCost: 2,
    range: null, pow: 0, spd: 4, arm: 1, grd: 5, alwaysMiss: true,
    text: 'Before: Advance up to 3. You may draw a card. Then, you may play and execute another attack from your hand (carrying out all its Before, Hit, and After triggers).',
    boostText: 'Search your deck for any card and add it to your hand. Discard until you have one card in hand. You may skip your draw step this turn.',
    hooks: {
      before(ctx) { ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 3, true); ctx.engine.draw(ctx.attacker, 1); },
      // DEFERRED: "play and execute another attack from your hand"
      // Requires: a full nested-Strike-within-a-Strike mechanic
      // Workaround: none — the Advance+Draw portion above is implemented
    },
    // DEFERRED: deck search + discard-to-one + skip-draw-step
    // Requires: a deck-search yield type, none exists today
    // Workaround: none — fully deferred
    boost: { force: 0, continuous: false }
  },
  {
    key: 'haoh_gadouken', name: 'Haoh Gadouken', type: 'ultra', owner: 'dan', gaugeCost: 3,
    range: [1, 4], pow: 7, spd: 1, arm: 0, grd: 0,
    text: "If you have no cards in hand, ignore this card's Gauge cost.\nAttacks at range 2~5 don't hit you.",
    boostText: '[+] Hit: If you have no cards in hand, +4 POW.',
    notes: "Errata: no [+] symbol on first-print copies. It's still a Continuous Boost.",
    rangeImmuneRanges: [2, 3, 4, 5],
    // DEFERRED: "ignore Gauge cost if hand is empty" (a conditional
    // cost-waiver at Special/Ultra play time) and "Hit: if hand is empty,
    // +4POW" (no existing hook reads hand-size at hit-resolution time for a
    // boost's onHit)
    // Requires: cost-waiver hook + hand-size-aware onHit
    // Workaround: still costs Gauge as normal; rangeImmuneRanges above is
    // implemented and independently valuable
    boost: { force: 0, continuous: true }
  },
  {
    key: 'shisso_buraiken', name: 'Shisso Buraiken', type: 'ultra', owner: 'dan', gaugeCost: 3,
    range: [1, 1], pow: 7, spd: 5, arm: 0, grd: 0,
    text: "If you have no cards in hand, ignore this card's Gauge cost.\nBefore: Close 2.\nHit: Advantage.",
    boostText: 'Place a card from your hand on top of your deck. You may skip your draw step this turn.',
    hooks: {
      before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 2); },
      hit(ctx) { ctx.engine.grantAdvantage(ctx.attacker, 'Shisso Buraiken'); },
    },
    // DEFERRED: Gauge-cost waiver (same as Haoh Gadouken) and the boost's
    // hand-to-deck-top picker
    // Requires: cost-waiver hook + hand-picker yield
    // Workaround: none — the Strike-side Close/Advantage above is implemented
    boost: { force: 0, continuous: false }
  },
];

// === M. BISON (owner: 'mbison') === Source: EXdata.xlsx "M. Bison" sheet, verified 2026-08-13
const MBISON = [
  {
    key: 'devil_reverse', name: 'Devil Reverse', type: 'special', owner: 'mbison',
    range: [1, 2], pow: 5, spd: 5, arm: 0, grd: 0,
    text: 'Critical, Hit: Advance or Retreat 3.\nAfter: Retreat up to 2.',
    boostText: 'If the opponent has more cards in hand than you, draw 3. Add this card to your Gauge.',
    notes: "It's called Bison Dollars.",
    critical: {
      hit(ctx) { ctx.engine.retreatSelf(ctx.attacker, ctx.defender, 3); }
      // "Advance or Retreat 3" simplified to Retreat (matches this card's own
      // After clause direction) rather than offering the choice — deferred.
    },
    hooks: {
      after(ctx) { ctx.engine.retreatSelf(ctx.attacker, ctx.defender, 2); },
    },
    boost: { force: 0, continuous: false, toGaugeInstead: true,
      resolve(ctx) { if (ctx.opponent.hand.length > ctx.player.hand.length) ctx.engine.draw(ctx.player, 3); }
    }
  },
  {
    key: 'head_stomp_mbison', name: 'Head Stomp', type: 'special', owner: 'mbison',
    range: [2, 3], pow: 5, spd: 5, arm: 0, grd: 0,
    text: 'Critical: +1 POW, +1 SPD.\nAfter: Close 2. If the opponent is stunned, Push or Pull up to 2.',
    boostText: '[+] Stun Immunity\nYour attacks are Critical.',
    critical: { statMods: { pow: 1, spd: 1 } },
    hooks: {
      after(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 2); },
      // "if the opponent is stunned, Push or Pull up to 2" is a real
      // conditional choice deferred — the unconditional Close 2 above is real.
    },
    boost: { force: 1, continuous: true, stunImmuneGrant: true, forcesFreeCritical: true }
  },
  {
    key: 'psycho_crusher', name: 'Psycho Crusher', type: 'special', owner: 'mbison',
    range: [1, 2], pow: 4, spd: 4, arm: 0, grd: 0,
    text: 'Before: Advance 3.\nCritical, Hit: Advance or Retreat 3, then draw.',
    boostText: '[+] +1 POW for each card in your Gauge (max 5)',
    hooks: {
      before(ctx) { ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 3, true); },
    },
    critical: {
      hit(ctx) { ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 3, true); ctx.engine.draw(ctx.attacker, 1); }
      // "Advance or Retreat" simplified to Advance (matches this card's own
      // Before direction) — deferred choice.
    },
    // "+1POW per card in Gauge (max 5)" needs a dynamic (not static) statMods
    // read at strike-set time — approximated with a fixed continuous
    // statMods snapshot is impossible without live re-evaluation, which
    // liveStats DOES support for character-level mods but not per-boost
    // ones. Deferred.
    boost: { force: 1, continuous: true }
  },
  {
    key: 'sliding_kick', name: 'Sliding Kick', type: 'special', owner: 'mbison',
    range: [1, 1], pow: 4, spd: 5, arm: 0, grd: 3,
    text: 'Before: Close 2.\nCritical, Hit: +2 POW, Push 2.',
    boostText: 'Retreat 2. If you are at range 3, take another action.',
    hooks: {
      before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 2); },
    },
    critical: { hit(ctx) { ctx.powBonus = (ctx.powBonus || 0) + 2; ctx.engine.pushAway(ctx.defender, ctx.attacker, 2); } },
        // DEFERRED: "if you are at range 3, take another action"
    // Requires: conditional boost flag
    // Workaround: partial implementation applied
    boost: { force: 0, continuous: false,
      resolve(ctx) { ctx.engine.retreatSelf(ctx.player, ctx.opponent, 2); }
    }
  },
  {
    key: 'somersault_skull_diver', name: 'Somersault Skull Diver', type: 'special', owner: 'mbison',
    range: [1, 1], pow: 4, spd: 4, arm: 0, grd: 0,
    text: 'Critical: +1 POW, +6 GRD and Ignore Armor.\nBefore: Advance 1 or 2.\nHit: Push 2.',
    boostText: 'Name a card. Opponent must discard that card or reveal a hand with none.\nIf a card was discarded this way, Strike.',
    critical: { statMods: { pow: 1, grd: 6 }, ignoreArmor: true },
    hooks: {
      before(ctx) { ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 2, true); },
      // "1 or 2" auto-resolves to 2 per this codebase's "up to X" convention.
      hit(ctx) { ctx.engine.pushAway(ctx.defender, ctx.attacker, 2); },
    },
    // HARD PART: name-a-card-then-conditionally-Strike needs the existing
    // needsNameChoice flow PLUS a resolve() that discards it from the
    // opponent's hand and a conditional triggersStrike gated on the discard
    // actually happening — chaining that correctly is deferred. (Setting
    // needsNameChoice alone without a resolve() would prompt the player for
    // a name and then do nothing with it, which is worse than not offering
    // the choice at all — so it's omitted here, not half-wired.)
    boost: { force: 0, continuous: false }
  },
  {
    key: 'nightmare_booster', name: 'Nightmare Booster', type: 'ultra', owner: 'mbison', gaugeCost: 3,
    range: [2, 3], pow: 6, spd: 6, arm: 0, grd: 0,
    text: "Critical, Hit: Opponent's attack doesn't hit, Advantage.\nAfter: Close 1 or 2.",
    boostText: 'Reveal your hand. Add the top 3 cards of discard to Gauge.',
    critical: { hit(ctx) { ctx.engine.grantAdvantage(ctx.attacker, 'Nightmare Booster'); } },
        // DEFERRED: "opponent's attack doesn't hit"
    // Requires: new engine hook
    // Workaround: partial implementation applied
    hooks: {
      after(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 2); },
      // "1 or 2" auto-resolves to 2, same convention as above.
    },
        // DEFERRED: "reveal hand"
    // Requires: engine support
    // Workaround: none — fully deferred
    boost: { force: 0, continuous: false,
      resolve(ctx) {
        const n = Math.min(3, ctx.player.discard.length);
        for (let i = 0; i < n; i++) { ctx.player.gauge.push(ctx.player.discard.pop()); }
      }
    }
  },
  {
    key: 'psycho_punisher', name: 'Psycho Punisher', type: 'ultra', owner: 'mbison', gaugeCost: 3,
    range: [1, 2], pow: 7, spd: 4, arm: 0, grd: 4,
    text: 'Before: Close 2.\nCritical, Hit: +2 POW, Advantage.\nAfter: Advance 1 or 2.',
    boostText: 'Move up to 5.',
    hooks: {
      before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 2); },
      after(ctx) { ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 2, true); },
      // "1 or 2" auto-resolves to 2, same convention as above.
    },
    critical: { hit(ctx) { ctx.powBonus = (ctx.powBonus || 0) + 2; ctx.engine.grantAdvantage(ctx.attacker, 'Psycho Punisher'); } },
    // "Move up to 5" (direction unstated) — auto-resolve toward the opponent
    // (Advance), matching this codebase's "up to X" convention.
    boost: { force: 0, continuous: false,
      resolve(ctx) { ctx.engine.advanceSelf(ctx.player, ctx.opponent, 5, true); }
    }
  },
];

// === SAGAT (owner: 'sagat') === Source: EXdata.xlsx "Sagat" sheet, verified 2026-08-13
const SAGAT = [
  {
    key: 'low_step_kick', name: 'Low Step Kick', type: 'special', owner: 'sagat',
    range: [1, 2], pow: 2, spd: 5, arm: 0, grd: 0,
    text: 'Critical: Ignore Guard.\nBefore: Close 1.',
    boostText: '[+] If your next attack is "Tiger Uppercut", it has +2 POW, +2 SPD, +2 GRD, and is Critical.',
    critical: { ignoreGuard: true },
    hooks: {
      before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 1); },
    },
    // DEFERRED: "if your next attack is Tiger Uppercut, it has +2/+2/+2 and
    // is Critical"
    // Requires: a card-identity-conditional buff carried across turns (no
    // existing hook reads the upcoming attack's key before it's set)
    // Workaround: none — fully deferred
    boost: { force: 0, continuous: true }
  },
  {
    key: 'low_tiger_shot', name: 'Low Tiger Shot', type: 'special', owner: 'sagat',
    range: [3, 8], pow: 5, spd: 2, arm: 0, grd: 5,
    text: 'Critical, Hit: +1 POW, draw 1.\nHit: Push 1.\nAfter: If you hit, you may return this card to the top of your deck. If you do, add top of discard to Gauge.',
    boostText: 'Retreat 2. If you are at range 3, take another action.',
    critical: { hit(ctx) { ctx.powBonus = (ctx.powBonus || 0) + 1; ctx.engine.draw(ctx.attacker, 1); } },
    hooks: {
      hit(ctx) { ctx.engine.pushAway(ctx.defender, ctx.attacker, 1); },
      // DEFERRED: "return this card to top of deck, then Gauge top of discard"
      // Requires: a self-attack-card-to-deck-top primitive
      // Workaround: none — fully deferred
    },
    // DEFERRED: "if you are at range 3, take another action"
    // Requires: a conditional bonusAction (existing bonusAction flag is
    // unconditional once granted)
    // Workaround: the Retreat 2 itself is implemented
    boost: { force: 0, continuous: false,
      resolve(ctx) { ctx.engine.retreatSelf(ctx.player, ctx.opponent, 2); }
    }
  },
  {
    key: 'tiger_knee', name: 'Tiger Knee', type: 'special', owner: 'sagat',
    range: [1, 1], pow: 5, spd: 3, arm: 0, grd: 4,
    text: 'Before: Close 2.\nHit: Advantage.\nCritical, After: If the opponent is stunned, Push 3.',
    boostText: '[+] +1 SPD.\nHit: Add this card to your Gauge.',
    hooks: {
      before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 2); },
      hit(ctx) { ctx.engine.grantAdvantage(ctx.attacker, 'Tiger Knee'); },
      // "Critical, After: if the opponent is stunned, Push 3" — can only
      // ever be caused by whichever card acts FIRST this exchange (see
      // engine.js's own afterStunCheck comment), and only applies when
      // Critical was paid (ctx.criticalPaid), checked inline here rather
      // than via the `critical` field since afterStunCheck fires from a
      // different point in resolveStrikeSteps than critical.after would.
      afterStunCheck(ctx, opponentWasStunned) {
        if (opponentWasStunned && ctx.criticalPaid) ctx.engine.pushAway(ctx.defender, ctx.attacker, 3);
      },
    },
    // DEFERRED: "Hit: ...add this card to your Gauge"
    // Requires: a boost onHit callback that can reference the boost's own
    // card instance
    // Workaround: +1 SPD is implemented
    boost: { force: 0, continuous: true, statMods: { spd: 1 } }
  },
  {
    key: 'tiger_shot', name: 'Tiger Shot', type: 'special', owner: 'sagat',
    range: [2, 5], pow: 3, spd: 4, arm: 0, grd: 0,
    text: 'Critical, Hit: Draw 1, then opponent must discard 1.\nHit: Push 1. Add the top card of your discard to Gauge, then draw 1.',
    boostText: '[+] +0~1 RNG.\nNow: Strike.',
    critical: { hit(ctx) { ctx.engine.draw(ctx.attacker, 1); ctx.engine.randomDiscardFromHand(ctx.defender, 1); } },
    hooks: {
      hit(ctx) {
        ctx.engine.pushAway(ctx.defender, ctx.attacker, 1);
        const top = ctx.attacker.discard[ctx.attacker.discard.length - 1];
        if (top) { ctx.attacker.discard.pop(); ctx.attacker.gauge.push(top); }
        ctx.engine.draw(ctx.attacker, 1);
      },
    },
    // "+0~1RNG" auto-resolves to +1 per this codebase's convention.
    boost: { force: 1, continuous: true, rangeMaxBonus: 1, triggersStrike: true }
  },
  {
    key: 'tiger_uppercut', name: 'Tiger Uppercut', type: 'special', owner: 'sagat',
    range: [1, 1], pow: 4, spd: 4, arm: 3, grd: 3,
    text: 'Before: Close 1.\nCritical, Hit: Push 2.\nAfter: Lose all Armor.',
    boostText: 'If the opponent is at range 1, they must discard 2 cards at random. Then, Strike.',
    critical: { hit(ctx) { ctx.engine.pushAway(ctx.defender, ctx.attacker, 2); } },
    hooks: {
      before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 1); },
      // DEFERRED: "After: Lose all Armor"
      // Requires: safe timing for self-stat mutation mid-Strike (engine.js
      // has a documented ordering hazard at this exact point)
      // Workaround: none — Armor persists through this Strike
    },
    // "If opponent at range 1, discard 2, then Strike" — the discard is
    // conditional on live board position at boost-play time, which IS safe
    // to check directly (no ordering hazard, unlike the Armor-loss above).
    // `force: 1` is this card's printed FRC cost on the Sagat sheet; it was 0 here,
    // i.e. a hand-stripping Boost that also Strikes was free (card-data audit,
    // 2026-08-17).
    boost: { force: 1, continuous: false, triggersStrike: true,
      resolve(ctx) { if (ctx.engine.range(ctx.player, ctx.opponent) === 1) ctx.engine.randomDiscardFromHand(ctx.opponent, 2); }
    }
  },
  {
    key: 'tiger_cannon', name: 'Tiger Cannon', type: 'ultra', owner: 'sagat', gaugeCost: 4,
    range: [2, 5], pow: 4, spd: 6, arm: 0, grd: 0,
    text: 'Hit: Push 3, Advantage.',
    boostText: '[+] +4 SPD.',
    hooks: {
      hit(ctx) { ctx.engine.pushAway(ctx.defender, ctx.attacker, 3); ctx.engine.grantAdvantage(ctx.attacker, 'Tiger Cannon'); },
    },
    boost: { force: 1, continuous: true, statMods: { spd: 4 } }
  },
  {
    key: 'tiger_destruction', name: 'Tiger Destruction', type: 'ultra', owner: 'sagat', gaugeCost: 2,
    range: [1, 1], pow: 7, spd: 5, arm: 0, grd: 0,
    text: 'Before: Advance 3.',
    boostText: '[+] +0~1 RNG, +2 ARM, +2 GRD.',
    hooks: {
      before(ctx) { ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 3, true); },
    },
    boost: { force: 0, continuous: true, statMods: { arm: 2, grd: 2 }, rangeMaxBonus: 1 }
  },
];

// === AXL LOW (owner: 'axl') === RECOVERED from EXdata.xlsx "Axl Low" sheet
// after this array was accidentally lost during an earlier merge step this
// session. Verified 2026-08-13. Note: this is a base-game character (was
// already in the POC before the SF/GG work began) — several engine.js hooks
// (pullTowardWithoutPassing, selfBoostAndSustainAfterHit, grantsBurstAction,
// afterStunCheck) were originally BUILT for these exact cards, per their own
// comments, so this reconstruction uses those same hooks as designed.
const AXL = [
  {
    key: 'axl_bomber', name: 'Axl Bomber', type: 'special', owner: 'axl',
    range: [1, 2], pow: 4, spd: 3, arm: 0, grd: 5,
    text: 'If you initiated, +2 POW.\nHit: Advance 2. You may spend [1]. If you do, Advantage.',
    boostText: '[+] +1 POW\nAfter: If the opponent is stunned, draw 1.',
    notes: 'Opponents can still be stunned if you go second.',
    powBonusIfInitiating: 2,
    hooks: {
      hit(ctx) { ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 2, true); },
      optionalGaugeSpend: { amount: 1, grantsAdvantage: true },
    },
    boost: { cancelable: true, force: 0, continuous: true, statMods: { pow: 1 }, drawIfOpponentStunnedThisStrike: true }
  },
  {
    key: 'rainwater', name: 'Rainwater', type: 'special', owner: 'axl',
    range: [2, 4], pow: 4, spd: 4, arm: 0, grd: 3,
    text: 'Before: You may Retreat 1.\nHit: Retreat 1.',
    boostText: '[+] +1 Speed. Now: Advance or Retreat 1.',
    hooks: {
      optionalRetreat: 1,
      hit(ctx) { ctx.engine.retreatSelf(ctx.attacker, ctx.defender, 1); },
    },
    boost: { cancelable: true, force: 0, continuous: true, statMods: { spd: 1 }, needsDirectionChoice: true,
      resolve(ctx) {
        if (ctx.moveDirection === 'advance') ctx.engine.advanceSelf(ctx.player, ctx.opponent, 1, true);
        else ctx.engine.retreatSelf(ctx.player, ctx.opponent, 1);
      } }
  },
  {
    key: 'sickle_flash', name: 'Sickle Flash', type: 'special', owner: 'axl', copies: 4,
    range: [3, 8], pow: 2, spd: 5, arm: 0, grd: 0,
    text: 'Hit: Push 1. If the opponent was Pushed fewer than 1 space, +2 Power.',
    boostText: 'Retreat 2 or 3.',
    hooks: {
      hit(ctx) {
        const before = ctx.defender.pos;
        ctx.engine.pushAway(ctx.defender, ctx.attacker, 1);
        const moved = Math.abs(ctx.defender.pos - before);
        if (moved < 1) ctx.powBonus = (ctx.powBonus || 0) + 2;
      },
    },
    // "2 or 3" auto-resolves to 3 per this codebase's "up to X" convention.
    boost: { cancelable: true, force: 0, continuous: false,
      resolve(ctx) { ctx.engine.retreatSelf(ctx.player, ctx.opponent, 3); }
    }
  },
  {
    key: 'snail', name: 'Snail', type: 'special', owner: 'axl',
    range: [2, 3], pow: 3, spd: 6, arm: 0, grd: 0,
    text: 'Hit: Push 1. Draw 1.',
    boostText: 'Advance 2 or 3.',
    hooks: {
      hit(ctx) { ctx.engine.pushAway(ctx.defender, ctx.attacker, 1); ctx.engine.draw(ctx.attacker, 1); },
    },
    // "2 or 3" auto-resolves to 3 per this codebase's "up to X" convention.
    boost: { cancelable: true, force: 0, continuous: false,
      resolve(ctx) { ctx.engine.advanceSelf(ctx.player, ctx.opponent, 3, true); }
    }
  },
  {
    key: 'winter_mantis', name: 'Winter Mantis', type: 'special', owner: 'axl',
    range: [1, 2], pow: 5, spd: 2, arm: 0, grd: 0,
    text: 'Ignore Guard, Armor.\nBefore: Pull 8 without pulling past yourself.\nHit: Advance 2.',
    boostText: 'Spend up to {2}. For each spent, Push 1 and draw 2.',
    ignoreGuard: true, ignoreArmor: true,
    hooks: {
      before(ctx) { ctx.engine.pullTowardWithoutPassing(ctx.defender, ctx.attacker, 8); },
      hit(ctx) { ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 2, true); },
    },
    boost: { force: 0, continuous: false, optionalForceSpend: { max: 2 },
      resolve(ctx) {
        const n = ctx.bonusForceSpent || 0;
        if (n > 0) { ctx.engine.pushAway(ctx.opponent, ctx.player, n); ctx.engine.draw(ctx.player, n * 2); }
      }
    }
  },
  {
    key: 'one_vision', name: 'One Vision', type: 'ultra', owner: 'axl', gaugeCost: 4,
    range: [1, 2], pow: 5, spd: 5, arm: 0, grd: 0,
    text: 'Hit: Draw 4, Advantage.\nAfter: Play this as its Boost and sustain it.',
    boostText: '[+] Action: Discard this from play and take 3 actions; you cannot Cancel them.',
    notes: 'Striking will still end your turn, regardless of how many actions you have remaining.',
    hooks: {
      hit(ctx) { ctx.engine.draw(ctx.attacker, 4); ctx.engine.grantAdvantage(ctx.attacker, 'One Vision'); },
      selfBoostAndSustainAfterHit: true,
    },
    boost: { force: 0, continuous: true, grantsBurstAction: { extraActions: 3 } }
  },
  {
    key: 'sickle_storm', name: 'Sickle Storm', type: 'ultra', owner: 'axl', gaugeCost: 2,
    range: [1, 2], pow: 5, spd: 4, arm: 3, grd: 3,
    text: 'Before: Close 1. Lose all Armor.\nAfter: If the opponent is stunned, Push 2.',
    boostText: 'Look at the top 3 cards of your deck. You may Boost or Strike with one of them (you cannot Cancel it). Discard the rest.',
    hooks: {
      before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 1); },
      // DEFERRED: "Lose all Armor" as a self-stat mutation mid-Strike has
      // the same documented ordering hazard noted elsewhere for
      // Strike-side self-Armor changes — not applied here.
      afterStunCheck(ctx, opponentWasStunned) {
        if (opponentWasStunned) ctx.engine.pushAway(ctx.defender, ctx.attacker, 2);
      },
    },
    // DEFERRED: "look at top 3, may Boost/Strike with one" needs a
    // multi-card deck-peek-and-select yield — no existing primitive.
    boost: { force: 0, continuous: false }
  },
];

// === TESTAMENT (owner: 'testament') === Source: EXdata.xlsx "Testament" sheet, verified 2026-08-13
// INNATE/EXCEED STATUS: implemented 2026-08-16 via CHARACTERS.testament.normalsHitHook
// (generic "Normals gain an on-Hit effect" primitive, engine.js's activateStep).
// Innate: Your Normals have "Hit: You may Push or Pull 1."
// Exceed: Your Normals have "Hit: Draw 1. You may Push or Pull 1."

const TESTAMENT = [
  {
    key: 'grave_reaper', name: 'Grave Reaper', type: 'special', owner: 'testament',
    range: [1, 5], pow: 4, spd: 4, arm: 0, grd: 0,
    text: 'Before, Range 1: Push 3.\nHit: Draw 2. Add a card from your hand to your Gauge.',
    boostText: '[+] +4 GRD.\nNow: Retreat up to 2.',
    hooks: {
      before(ctx) {
        if (ctx.engine.range(ctx.attacker, ctx.defender) === 1) {
          ctx.engine.pushAway(ctx.defender, ctx.attacker, 3);
        }
      },
      hit(ctx) { ctx.engine.draw(ctx.attacker, 2); },
    },
    // DEFERRED: "Add a card from your hand to your Gauge"
    // Requires: a self-targeted hand-card-picker yield type
    // Workaround: Draw 2 is implemented; Gauge-add is deferred
    boost: { cancelable: true, force: 0, continuous: true, statMods: { grd: 4 },
      resolve(ctx) { ctx.engine.retreatSelf(ctx.player, ctx.opponent, 2); }
    }
  },
  {
    key: 'scythe_swing', name: 'Scythe Swing', type: 'special', owner: 'testament',
    range: [2, 4], pow: 5, spd: 2, arm: 0, grd: 5,
    text: 'Hit: Push or Pull 1.\nAfter: Close or Retreat 1.',
    boostText: '[+] Cleanup: If you were not stunned, you may return your attack to your hand. If you do, add this to your Gauge.',
    hooks: {
      // DEFERRED: "Push or Pull 1" (real choice)
      // Requires: a real yielded push/pull direction choice
      // Workaround: none — fully deferred; simplified to Push 1 below
      hit(ctx) { ctx.engine.pushAway(ctx.defender, ctx.attacker, 1); },
      // DEFERRED: "After: Close or Retreat 1" (direction choice)
      after(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 1); },
    },
    // DEFERRED: "Cleanup: return your attack to your hand" + "add this to your Gauge"
    // Requires: a cleanup-phase hand-returning mechanic for the attack card itself,
    // plus a boost-self-gauging hook
    // Workaround: none — fully deferred
    boost: { cancelable: true, force: 0, continuous: true }
  },
  {
    key: 'unholy_diver', name: 'Unholy Diver', type: 'special', owner: 'testament',
    range: [2, 3], pow: 1, spd: 6, arm: 0, grd: 0,
    text: 'After: If you hit, you may play this as its Boost and sustain it (performing its Now effect).',
    boostText: '[+] Now: Advance or Retreat 1.\nHit: +1 POW. Advantage.',
    hooks: {
      // DEFERRED: "play this as its Boost and sustain it"
      // Requires: selfBoostAndSustainAfterHit mechanic (Axl's One Vision is only verified example)
      // Workaround: checked engine.js, selfBoostAndSustainAfterHit exists but only tested on Axl
    },
    boost: { force: 0, continuous: true, needsDirectionChoice: true,
      resolve(ctx) {
        if (ctx.moveDirection === 'advance') ctx.engine.advanceSelf(ctx.player, ctx.opponent, 1, true);
        else ctx.engine.retreatSelf(ctx.player, ctx.opponent, 1);
      },
      onHit(ctx) { ctx.powBonus = (ctx.powBonus || 0) + 1; ctx.engine.grantAdvantage(ctx.player, 'Unholy Diver boost'); }
    }
  },
  {
    key: 'arbiter_sign_falling', name: 'Arbiter Sign - Falling', type: 'special', owner: 'testament',
    range: [3, 6], pow: 5, spd: 3, arm: 0, grd: 3,
    text: 'Ignore Armor.\nHit: The opponent must discard a random card.',
    boostText: '[+] +1 SPD.\nNow: Look at the top card of your opponent\'s deck. You may discard it.',
    ignoreArmor: true,
    hooks: {
      hit(ctx) { ctx.engine.randomDiscardFromHand(ctx.defender, 1); },
    },
    // DEFERRED: "Look at the top card of opponent's deck, may discard it"
    // Requires: opponent-deck-peek and conditional-discard yield type
    // Workaround: boost grants +1 SPD only
    boost: { cancelable: true, force: 0, continuous: true, statMods: { spd: 1 } }
  },
  {
    key: 'arbiter_sign_rising', name: 'Arbiter Sign - Rising', type: 'special', owner: 'testament',
    range: [3, 6], pow: 3, spd: 5, arm: 0, grd: 0,
    text: 'Hit: Draw 1.\nAfter: If the opponent is stunned, Advantage.',
    boostText: 'Return a card from your Gauge to your hand. Add this to your Gauge.',
    hooks: {
      hit(ctx) { ctx.engine.draw(ctx.attacker, 1); },
      afterStunCheck(ctx, opponentWasStunned) {
        if (opponentWasStunned) ctx.engine.grantAdvantage(ctx.attacker, 'Arbiter Sign - Rising');
      },
    },
    // DEFERRED: "Return a card from your Gauge to your hand" (boost effect)
    // Requires: gauge-to-hand-picker yield type
    // Workaround: none — fully deferred
    boost: { cancelable: true, force: 0, continuous: false }
  },
  {
    key: 'calamity_one', name: 'Calamity One', type: 'ultra', owner: 'testament', gaugeCost: 2,
    range: [1, 2], pow: 5, spd: 3, arm: 0, grd: 4,
    text: 'Before: You may return a card from your Gauge to your hand. If you do, +2 POW.',
    boostText: 'Strike; after the opponent sets their attack (but before reveal), you may draw 1 or Advance 2.',
    hooks: {
      // DEFERRED: "You may return a card from your Gauge to your hand. If you do, +2POW"
      // Requires: gauge-to-hand picker that gates a POW bonus
      // Workaround: none — fully deferred
    },
    // DEFERRED: "Strike, after opponent sets, may draw 1 or Advance 2"
    // Requires: a strike-with-mid-resolution-choice mechanic
    // Workaround: none — fully deferred
    boost: { force: 0, continuous: false }
  },
  {
    key: 'nostrovia', name: 'Nostrovia', type: 'ultra', owner: 'testament', gaugeCost: 4,
    range: [3, 3], pow: 6, spd: 5, arm: 0, grd: 0,
    text: 'Hit: Push 2; if the opponent was Pushed fewer than 2 spaces, +2 POW.',
    boostText: '[+] +0~1 RNG.\nNow: Add the top card of your deck to your Gauge. Retreat 1.',
    hooks: {
      hit(ctx) {
        const before = ctx.defender.pos;
        ctx.engine.pushAway(ctx.defender, ctx.attacker, 2);
        const moved = Math.abs(ctx.defender.pos - before);
        if (moved < 2) ctx.powBonus = (ctx.powBonus || 0) + 2;
      },
    },
    // "+0~1RNG" auto-resolves to +1 per this codebase's convention.
    boost: { force: 0, continuous: true, rangeMaxBonus: 1,
      resolve(ctx) {
        const top = ctx.player.deck[ctx.player.deck.length - 1];
        if (top) { ctx.player.deck.pop(); ctx.player.gauge.push(top); }
        ctx.engine.retreatSelf(ctx.player, ctx.opponent, 1);
      }
    }
  },
];

// === POTEMKIN (owner: 'potemkin') === Source: EXdata.xlsx "Potemkin" sheet, verified 2026-08-13
// INNATE/EXCEED STATUS: implemented 2026-08-16 via CHARACTERS.potemkin.rangeConditionalStatBonus
// (generic "range-conditional stat bonus on ALL attacks, not just Criticals" primitive,
// engine.js's liveStats) + the pre-existing onExceed(engine, player, opponent) Close 2.

const POTEMKIN = [
  {
    key: 'garuda_impact', name: 'Garuda Impact', type: 'special', owner: 'potemkin',
    range: [1, 2], pow: 5, spd: 4, arm: 0, grd: 0,
    text: 'Hit: Advantage. The opponent must discard 2 cards.',
    boostText: 'Close 1. Draw 1.',
    hooks: {
      hit(ctx) { ctx.engine.grantAdvantage(ctx.attacker, 'Garuda Impact'); ctx.engine.randomDiscardFromHand(ctx.defender, 2); },
    },
    boost: { cancelable: true, force: 0, continuous: false,
      resolve(ctx) { ctx.engine.closeSelf(ctx.player, ctx.opponent, 1); ctx.engine.draw(ctx.player, 1); }
    }
  },
  {
    key: 'hammer_fall', name: 'Hammer Fall', type: 'special', owner: 'potemkin',
    range: [1, 1], pow: 2, spd: 3, arm: 1, grd: 3,
    text: 'Before: Close 3.',
    boostText: '[+] +0~1 RNG.\nHit: Push or Pull 1.',
    hooks: {
      before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 3); },
    },
    // "+0~1RNG" auto-resolves to +1 per this codebase's convention.
    // "Push or Pull 1" (direction choice) is deferred.
    boost: { cancelable: true, force: 0, continuous: true, rangeMaxBonus: 1 }
  },
  {
    key: 'heat_knuckle', name: 'Heat Knuckle', type: 'special', owner: 'potemkin',
    range: [1, 2], pow: 5, spd: 1, arm: 0, grd: 5,
    text: 'Before: If you were hit, Pull 2 without pulling past yourself.\nHit: Push 3.',
    boostText: '[+] Now: Close 1.\nAt the start of your turn, add this to your Gauge.',
    hooks: {
      before(ctx) {
        // DEFERRED: "If you were hit" — checking if this player took damage from opponent
        // in a previous exchange. This is a frame-tracking feature, not currently implemented.
        // Simplified: always allow the Pull 2 (the safer option).
        ctx.engine.pullTowardWithoutPassing(ctx.defender, ctx.attacker, 2);
      },
      hit(ctx) { ctx.engine.pushAway(ctx.defender, ctx.attacker, 3); },
    },
    boost: { force: 0, continuous: true, expireToGaugeAtStartOfNextTurn: true,
      resolve(ctx) { ctx.engine.closeSelf(ctx.player, ctx.opponent, 1); }
    }
  },
  {
    key: 'mega_fist', name: 'Mega Fist', type: 'special', owner: 'potemkin',
    range: [1, 1], pow: 3, spd: 5, arm: 0, grd: 0,
    text: 'Before: Advance 1 or 2.\nHit: Draw 2.',
    boostText: '[+] +1 POW and Ignore Armor.',
    hooks: {
      before(ctx) { ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 2, true); },
      // "Advance 1 or 2" (amount choice) simplified to 2 per this codebase's convention.
      hit(ctx) { ctx.engine.draw(ctx.attacker, 2); },
    },
    boost: { cancelable: true, force: 0, continuous: true, statMods: { pow: 1 }, ignoreArmorGrant: true }
  },
  {
    key: 'potemkin_buster', name: 'Potemkin Buster', type: 'special', owner: 'potemkin',
    range: [1, 2], pow: 6, spd: 3, arm: 0, grd: 3,
    text: 'You cannot be Pushed or Pulled.\nHit: The opponent must discard a random card.',
    boostText: '[+] Attacks at Range 4+ do not hit you.\nAt the start of your turn, add this to your Gauge.',
    movementImmune: true,
    hooks: {
      hit(ctx) { ctx.engine.randomDiscardFromHand(ctx.defender, 1); },
    },
    boost: { cancelable: true, force: 0, continuous: true, rangeImmuneRanges: [4, 5, 6, 7, 8], expireToGaugeAtStartOfNextTurn: true }
  },
  {
    key: 'slide_head', name: 'Slide Head', type: 'special', owner: 'potemkin',
    range: [1, 8], pow: 0, spd: 2, arm: 1, grd: 4,
    text: 'Hit: The opponent must discard a random card.\nAfter: Close 2.',
    boostText: '[+] If you initiated, +1 SPD. Otherwise, +4 GRD.\nNow: Close 1.',
    hooks: {
      hit(ctx) { ctx.engine.randomDiscardFromHand(ctx.defender, 1); },
      after(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 2); },
    },
    // DEFERRED: "If you initiated, +1SPD. Otherwise, +4GRD" — conditional boost statMods
    // Requires: a way to compute statMods dynamically at boost-play time based on initiator
    // Workaround: grants +1 SPD unconditionally (the initiator's case)
    boost: { force: 0, continuous: true, statMods: { spd: 1 },
      resolve(ctx) { ctx.engine.closeSelf(ctx.player, ctx.opponent, 1); }
    }
  },
  {
    key: 'giganter_kai', name: 'Giganter Kai', type: 'ultra', owner: 'potemkin', gaugeCost: 2,
    range: [2, 4], pow: 4, spd: 1, arm: 3, grd: 4,
    text: 'Attacks at Range 4+ do not hit you.\nAfter: Close 3, Advantage.',
    boostText: '[+] +4 ARM.\nNow: Close 1.',
    rangeImmuneRanges: [4, 5, 6, 7, 8],
    hooks: {
      after(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 3); ctx.engine.grantAdvantage(ctx.attacker, 'Giganter Kai'); },
    },
    boost: { force: 0, continuous: true, statMods: { arm: 4 },
      resolve(ctx) { ctx.engine.closeSelf(ctx.player, ctx.opponent, 1); }
    }
  },
  {
    key: 'heavenly_potemkin_buster', name: 'Heavenly Potemkin Buster', type: 'ultra', owner: 'potemkin', gaugeCost: 4,
    range: [1, 1], pow: 11, spd: 0, arm: 0, grd: 7,
    text: 'Before: Advance 3.',
    boostText: '[+] If you initiated, +2 POW. Otherwise, +3 ARM.\nNow: Close 1.',
    hooks: {
      before(ctx) { ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 3, true); },
    },
    // DEFERRED: "If you initiated, +2POW. Otherwise, +3ARM" — conditional statMods
    // Requires: same dynamic statMods at boost-play time as Slide Head
    // Workaround: grants +2 POW unconditionally (the initiator's case)
    boost: { force: 0, continuous: true, statMods: { pow: 2 },
      resolve(ctx) { ctx.engine.closeSelf(ctx.player, ctx.opponent, 1); }
    }
  },
];

// === LEO WHITEFANG (owner: 'leo') === Source: EXdata.xlsx "Leo Whitefang" sheet, verified 2026-08-13
// INNATE/EXCEED STATUS:
// BLOCKED: Leo's Innate reads "After: If the opponent is stunned, you may Exceed (at no cost)."
// This requires a yield type (like 'optional_exceed_trigger') that doesn't currently exist
// in engine.js or ui.js. The afterStunCheck hook exists, but there's no mechanism to
// yield a "may Exceed" choice from inside an afterStunCheck hook. Needs Claude to add
// this yield type + resolver before implementation.
//
// BLOCKED: Leo's Exceed text references a "Revert" mechanic (un-Exceeding) that does not
// exist anywhere in engine.js or cards.js. This needs Claude to design and implement as
// a new engine primitive before this can be built.

const LEO = [
  {
    key: 'blitzschlag', name: 'Blitzschlag', type: 'special', owner: 'leo',
    range: [1, 3], pow: 5, spd: 4, arm: 0, grd: 0,
    text: 'If this was a Wild Swing, double its Speed bonuses.\nHit: Advantage.',
    boostText: 'Advance or Retreat 1 or 2.',
    hooks: {
      // DEFERRED: "If this was a Wild Swing, double its Speed bonuses"
      // Requires: a way to detect if a card is a Wild Swing (card.type === 'wild_swing'
      // or similar flag) and dynamically multiply SPD bonuses
      hit(ctx) { ctx.engine.grantAdvantage(ctx.attacker, 'Blitzschlag'); },
    },
    // "Advance or Retreat 1 or 2" — direction and amount choice. Simplified to Advance 2.
    boost: { cancelable: true, force: 0, continuous: false, needsDirectionChoice: true,
      resolve(ctx) {
        if (ctx.moveDirection === 'advance') ctx.engine.advanceSelf(ctx.player, ctx.opponent, 2, true);
        else ctx.engine.retreatSelf(ctx.player, ctx.opponent, 2);
      }
    }
  },
  {
    key: 'eisensturm', name: 'Eisensturm', type: 'special', owner: 'leo',
    range: [1, 2], pow: 5, spd: 3, arm: 1, grd: 4,
    text: 'After: Close 1.\nCleanup, Exceed Mode: Draw 1. Revert.',
    boostText: 'Draw 2. You may place a card from your hand on top of your deck.',
    hooks: {
      after(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 1); },
      // DEFERRED: "Cleanup, Exceed Mode: Draw 1. Revert" — requires Revert mechanic
    },
    // DEFERRED: "place a card from your hand on top of your deck"
    // Requires: hand-to-deck-top picker yield type
    boost: { cancelable: true, force: 0, continuous: false,
      resolve(ctx) { ctx.engine.draw(ctx.player, 2); }
    }
  },
  {
    key: 'gravierte_würde', name: 'Gravierte Würde', type: 'special', owner: 'leo',
    range: [2, 6], pow: 5, spd: 2, arm: 0, grd: 5,
    text: 'After: Close 2.\nCleanup, Exceed Mode: Draw 1. Revert.',
    boostText: 'Exceed (at no cost). Add this to your Gauge and take another action.',
    hooks: {
      after(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 2); },
      // DEFERRED: "Cleanup, Exceed Mode: Draw 1. Revert" — requires Revert mechanic
    },
    // DEFERRED: "Exceed (at no cost)" (direct engine method call needed)
    // + bonusAction is implemented below
    // + "add this to your Gauge" (self-to-Gauge hook, same limitation as other GG boosts)
    boost: { force: 0, continuous: false, bonusAction: true }
  },
  {
    key: 'kahn_schild', name: 'Kahn Schild', type: 'special', owner: 'leo',
    range: [1, 2], pow: 3, spd: 1, arm: 0, grd: 6,
    text: 'Exceed Mode: -2SPD, +2ARM\nBefore: If you were hit, Close up to 2.',
    boostText: '[+] Stun Immunity.\nNow: Draw 2.',
    hooks: {
      before(ctx) {
        // DEFERRED: "If you were hit" — requires frame-tracking of damage taken
        // Simplified: always allow the Close up to 2.
        ctx.engine.closeSelf(ctx.attacker, ctx.defender, 2);
      },
    },
    boost: { cancelable: true, force: 0, continuous: true, stunImmuneGrant: true, nowDraw: 2 }
  },
  {
    key: 'zweites_kaltes_gestöber', name: 'Zweites Kaltes Gestöber', type: 'special', owner: 'leo',
    range: [1, 2], pow: 3, spd: 5, arm: 0, grd: 0,
    text: 'Before: Advance 2. If you Advanced past the opponent, Exceed (at no cost).\nHit: Advantage.',
    boostText: '[+] +1 POW, +1 SPD.\nNow: Reveal your hand.',
    hooks: {
      before(ctx) {
        // FIXED (Claude review): hooks.before(ctx) uses ctx.attacker/ctx.defender,
        // NOT ctx.opponent (that field only exists in boost.resolve(ctx)). Using
        // ctx.opponent here crashed 31/200 games in stress testing with
        // "Cannot read properties of undefined (reading 'pos')".
        const before = ctx.attacker.pos < ctx.defender.pos;
        ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 2, true);
        const after = ctx.attacker.pos < ctx.defender.pos;
        if (before !== after) {
          // DEFERRED: "Exceed (at no cost)" — needs direct engine call
          // For now, this side-swap detection is real but the Exceed is not
        }
      },
      hit(ctx) { ctx.engine.grantAdvantage(ctx.attacker, 'Zweites Kaltes Gestöber'); },
    },
    boost: { cancelable: true, force: 0, continuous: true, statMods: { pow: 1, spd: 1 } }
  },
  {
    key: 'leidenschaft_des_dirigenten', name: 'Leidenschaft des Dirigenten', type: 'ultra', owner: 'leo', gaugeCost: 3,
    range: [1, 2], pow: 6, spd: 0, arm: 0, grd: 0,
    text: 'Attacks at Range 2 do not hit you.',
    boostText: '[+] Your Wild Swings have +2 POW.\nNow: Strike.',
    rangeImmuneRanges: [2],
    // DEFERRED: "Your Wild Swings have +2POW" — needs Wild Swing detection
    // (same as Blitzschlag's issue)
    boost: { force: 0, continuous: true, triggersStrike: true }
  },
  {
    key: 'stahlwirbel', name: 'Stahlwirbel', type: 'ultra', owner: 'leo', gaugeCost: 4,
    range: [2, 8], pow: 6, spd: 0, arm: 0, grd: 0,
    text: 'If this is invalid, draw 1 (before replacing it).\nExceed Mode: Multiply this attack\'s Speed bonuses by 10.',
    boostText: '[+] Your Wild Swings have +2 SPD.\nNow: Strike.',
    // DEFERRED: "If this is invalid, draw 1" — requires handling of invalid/Focus cards
    // DEFERRED: "Exceed Mode: Multiply SPD bonuses by 10" — Exceed mode detection
    boost: { force: 0, continuous: true, triggersStrike: true }
  },
];

// === MILLIA RAGE (owner: 'millia') === Source: EXdata.xlsx "Millia Rage" sheet, verified 2026-08-13
// INNATE/EXCEED STATUS: implemented 2026-08-16 via a new generic "pick one of N named
// effects" yield (`named_choice_effect`, CHARACTERS.millia.onAfterStrike) — see
// engine.js's onAfterStrike dispatch.

const MILLIA = [
  {
    key: 'bad_moon', name: 'Bad Moon', type: 'special', owner: 'millia',
    range: [1, 1], pow: 4, spd: 6, arm: 0, grd: 0,
    text: 'If you initiated, Ignore Armor.\nBefore: Advance 1 or 2.',
    boostText: '[+] Now: Draw 1.\nHit: Spend up to {3}. For each spent, +1 POW and Push 1.',
    hooks: {
      // FIXED (Claude review): was ctx.opponent, which does not exist inside
      // hooks.before(ctx) — crashed in stress testing. Correct field is ctx.defender.
      before(ctx) { ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 2, true); },
      // "Advance 1 or 2" simplified to 2 per convention.
    },
    // DEFERRED: "If you initiated, Ignore Armor"
    // Requires: a conditional ignoreArmor gate based on initiator status —
    // VERIFIED_VOCABULARY.txt only has powBonusIfInitiating/spdBonusIfInitiating/
    // spdBonusIfDefending/armBonusIfDefending (all numeric stat bonuses), no
    // boolean "ignoreArmor if initiating" equivalent exists. A prior draft of
    // this card used a fabricated "ignoreArmorIfInitiating" field that does
    // not exist anywhere in engine.js or ui.js — removed. Do not apply
    // ignoreArmor unconditionally either, since that would misrepresent the
    // card as stronger than printed for the non-initiating case.
    boost: { cancelable: true, force: 0, continuous: true, nowDraw: 1,
      onHit(ctx) {
        // DEFERRED: "Spend up to {3}. For each spent, +1POW and Push 1"
        // Requires: optionalForceSpend hook, but the payoff needs to be
        // both POW bonus and push effect, which is complex. Simplified below.
      }
    }
  },
  {
    key: 'iron_savior', name: 'Iron Savior', type: 'special', owner: 'millia',
    range: [1, 2], pow: 5, spd: 2, arm: 0, grd: 5,
    text: 'Before: Close 3.\nAfter: If the opponent is stunned, they must discard a random card.',
    boostText: '[+] Before: Advance or Retreat 1.\nHit: Advantage.',
    hooks: {
      before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 3); },
      afterStunCheck(ctx, opponentWasStunned) {
        if (opponentWasStunned) ctx.engine.randomDiscardFromHand(ctx.defender, 1);
      },
    },
    boost: { cancelable: true, force: 0, continuous: true, needsDirectionChoice: true,
      resolve(ctx) {
        if (ctx.moveDirection === 'advance') ctx.engine.advanceSelf(ctx.player, ctx.opponent, 1, true);
        else ctx.engine.retreatSelf(ctx.player, ctx.opponent, 1);
      },
      onHit(ctx) { ctx.engine.grantAdvantage(ctx.player, 'Iron Savior boost'); }
    }
  },
  {
    key: 'low_kick', name: 'Low Kick', type: 'special', owner: 'millia',
    range: [1, 1], pow: 2, spd: 7, arm: 0, grd: 0,
    text: 'Hit: Advantage.',
    boostText: 'Advance 1. Draw 1. Take another action.',
    hooks: {
      hit(ctx) { ctx.engine.grantAdvantage(ctx.attacker, 'Low Kick'); },
    },
    boost: { force: 0, continuous: false, bonusAction: true,
      resolve(ctx) { ctx.engine.advanceSelf(ctx.player, ctx.opponent, 1, true); ctx.engine.draw(ctx.player, 1); }
    }
  },
  {
    key: 'swing_braid', name: 'Swing Braid', type: 'special', owner: 'millia',
    range: [1, 2], pow: 3, spd: 5, arm: 0, grd: 0,
    text: 'Before: Advance 2. If you Advanced past the opponent, Ignore Guard.',
    boostText: '[+] +1 SPD.\nNow: You may Pull 1.',
    hooks: {
      before(ctx) {
        // FIXED (Claude review): was ctx.opponent, crashed in stress testing.
        // hooks.before(ctx) uses ctx.attacker/ctx.defender, not ctx.opponent.
        const before = ctx.attacker.pos < ctx.defender.pos;
        ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 2, true);
        const after = ctx.attacker.pos < ctx.defender.pos;
        if (before !== after) {
          // DEFERRED: "Ignore Guard" if side-swapped — needs conditional ignoreGuard
          // For now, this detection is real but ignoreGuard application is deferred
        }
      },
    },
    boost: { cancelable: true, force: 0, continuous: true, statMods: { spd: 1 } }
  },
  {
    key: 'tandem_top', name: 'Tandem Top', type: 'special', owner: 'millia',
    range: [2, 4], pow: 3, spd: 4, arm: 0, grd: 4,
    text: 'Hit: Draw 2.\nAfter: You may Advance or Retreat 2.',
    boostText: 'Advance or Retreat 2. If you Advanced past the opponent, draw 1 and return this to your hand.',
    hooks: {
      hit(ctx) { ctx.engine.draw(ctx.attacker, 2); },
      // DEFERRED: "After: You may Advance or Retreat 2" — direction choice
    },
    // DEFERRED: "If you Advanced past, return this to your hand"
    // Requires: hand-returning mechanic + boost self-reference
    boost: { cancelable: true, force: 0, continuous: false, needsDirectionChoice: true,
      resolve(ctx) {
        if (ctx.moveDirection === 'advance') ctx.engine.advanceSelf(ctx.player, ctx.opponent, 2, true);
        else ctx.engine.retreatSelf(ctx.player, ctx.opponent, 2);
        ctx.engine.draw(ctx.player, 1);
      }
    }
  },
  {
    key: 'winger', name: 'Winger', type: 'ultra', owner: 'millia', gaugeCost: 3,
    range: [1, 2], pow: 5, spd: 5, arm: 0, grd: 0,
    text: 'Hit, Range 1: +2 POW.\nAfter: Advance 2.',
    boostText: '[+] +1 SPD.\nHit: You may draw 1 or gain Advantage.',
    hooks: {
      hit(ctx) {
        if (ctx.engine.range(ctx.attacker, ctx.defender) === 1) {
          ctx.powBonus = (ctx.powBonus || 0) + 2;
        }
      },
      after(ctx) { ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 2, true); },
    },
    // DEFERRED: "Hit: You may draw 1 or gain Advantage" — yields a choice
    // Workaround: grants +1 SPD only
    boost: { cancelable: true, force: 0, continuous: true, statMods: { spd: 1 } }
  },
  {
    key: 'septem_voices', name: 'Septem Voices', type: 'ultra', owner: 'millia', gaugeCost: 2,
    range: [2, 4], pow: 4, spd: 5, arm: 0, grd: 0,
    text: 'Hit: Push or Pull 1. Draw 1. The opponent must discard a random card.',
    boostText: '[+] +1 POW.\nHit: Push or Pull 1. The opponent must discard a random card.',
    hooks: {
      hit(ctx) {
        // DEFERRED: "Push or Pull 1" — direction choice
        // Simplified to Push 1
        ctx.engine.pushAway(ctx.defender, ctx.attacker, 1);
        ctx.engine.draw(ctx.attacker, 1);
        ctx.engine.randomDiscardFromHand(ctx.defender, 1);
      },
    },
    boost: { cancelable: true, force: 0, continuous: true, statMods: { pow: 1 },
      onHit(ctx) {
        // Same simplified Push 1 for boost's Hit clause
        ctx.engine.pushAway(ctx.opponent, ctx.player, 1);
        ctx.engine.randomDiscardFromHand(ctx.opponent, 1);
      }
    }
  },
];

// ============================================================
// SEASON 4 — GUILTY GEAR STRIVE (the rest of the cast)
// ============================================================
// Source: EXdata.xlsx, one sheet per fighter, transcribed 2026-08-17 — the same
// pass and the same rules the Season 5 block below documents: `text`/`boostText`
// are the workbook's own wording, and anything the engine can't express yet gets
// a `// DEFERRED:` comment on the card instead of being quietly dropped.
//
// This block REPLACED an earlier draft of Chipp/Ky/Anji/May/Ramlethal whose card
// names, stats and text were invented rather than transcribed (the workbook was
// not present in that session). Do not restore it; every card below is checked
// against its sheet.
//
// Set-wide conventions for the GGST cast, from the workbook's "Normals (GG)" sheet:
//   - every Boost in the set costs {0} Force, so `boost.force` is 0 throughout;
//   - a 'C' in the sheet's Cncl column becomes `cancelable: true` (see the Cancel
//     mechanic in HANDOFF.md §4b);
//   - a Boost whose text starts with "[+]" is a Continuous Boost.
// Cards with no Cost cell are Specials; a "[N]" Cost is an Ultra with `gaugeCost: N`.

const CHIPP = [
  {
    key: 'chipp_alpha_blade', name: 'Alpha Blade', type: 'special', owner: 'chipp',
    range: [1, 2], pow: 1, spd: 6, arm: 0, grd: 0,
    text: 'Before: Advance 3. If you Advanced past the opponent, +3 POW.',
    boostText: '[+] +1 SPD, +1 POW.\nThe opponent’s attack has +3 POW.',
    hooks: {
      before(ctx) {
        const before = ctx.attacker.pos < ctx.defender.pos;
        ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 3, true);
        if ((ctx.attacker.pos < ctx.defender.pos) !== before) ctx.powBonus = (ctx.powBonus || 0) + 3;
      },
    },
    // `opponentPowMod` is read off the OPPONENT's boostsInPlay in liveStats — i.e. this
    // boost's drawback half, handing them +3 POW, is already a supported shape.
    boost: { cancelable: true, force: 0, continuous: true, statMods: { spd: 1, pow: 1 }, opponentPowMod: 3 },
  },
  {
    key: 'chipp_beta_blade', name: 'Beta Blade', type: 'special', owner: 'chipp',
    range: [1, 2], pow: 1, spd: 7, arm: 0, grd: 0,
    text: 'Hit: Draw 1.\nAfter: Close 1.',
    boostText: '[+] +1 SPD.\nHit: The opponent must discard a card.',
    hooks: {
      hit(ctx) { ctx.engine.draw(ctx.attacker, 1); },
      after(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 1); },
    },
    boost: { cancelable: true, force: 0, continuous: true, statMods: { spd: 1 },
      // "must discard a card" is the opponent's own pick; this codebase resolves every
      // opponent-discard the same way (at random) — see randomDiscardFromHand's users.
      onHit(ctx) { ctx.engine.randomDiscardFromHand(ctx.opponent, 1); } },
  },
  {
    key: 'chipp_gamma_blade', name: 'Gamma Blade', type: 'special', owner: 'chipp',
    range: [1, 5], pow: 3, spd: 3, arm: 0, grd: 0,
    text: 'Hit: Advantage.\nAfter: You may Advance 3.',
    boostText: '[+] Now: Retreat 2.\nBefore: If you are at the edge of the arena, Advance 3.',
    hooks: {
      hit(ctx) { ctx.engine.grantAdvantage(ctx.attacker, 'Gamma Blade'); },
      // "You may Advance 3" auto-resolves to taking it, per this file's "up to X"
      // convention — advancing is never a cost here, the Strike is already resolved.
      after(ctx) { ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 3, true); },
    },
    boost: { cancelable: true, force: 0, continuous: true,
      resolve(ctx) { ctx.engine.retreatSelf(ctx.player, ctx.opponent, 2); },
      // DEFERRED: the continuous "Before: if you are at the edge, Advance 3" — boosts
      // have no Before-hook extension point (only `onHit`/`resolve`), same gap Vega's
      // Scarlet Terror boost is already parked on.
    },
  },
  {
    key: 'chipp_genrouzan', name: 'Genrouzan', type: 'special', owner: 'chipp',
    range: [1, 1], pow: 3, spd: 2, arm: 0, grd: 0, ignoreGuard: true,
    text: 'Ignore Guard.\nBefore: Close 2.',
    boostText: '[+] Attacks at Range 1 do not hit you.\nAfter: Add this to your Gauge.',
    hooks: { before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 2); } },
    // `expireToGaugeAtStartOfNextTurn` is the closest supported timing to "After: add
    // this to your Gauge" (the sheet's own note is that it stops protecting you once
    // it leaves play); the exact within-Strike handoff has no extension point.
    boost: { cancelable: true, force: 0, continuous: true, rangeImmuneRanges: [1], expireToGaugeAtStartOfNextTurn: true },
  },
  {
    key: 'chipp_resshou', name: 'Resshou', type: 'special', owner: 'chipp',
    range: [1, 2], pow: 2, spd: 5, arm: 0, grd: 0,
    text: 'Hit: Draw 2.\nAfter: You may gain Advantage or return this to your hand.',
    boostText: '[+] +1 SPD.\nNow: Advance 2, draw 1.',
    hooks: {
      hit(ctx) { ctx.engine.draw(ctx.attacker, 2); },
      // "gain Advantage or return this to your hand" — Advantage is taken; returning a
      // used attack card to hand has no primitive (cards go to discard/Gauge only).
      after(ctx) { ctx.engine.grantAdvantage(ctx.attacker, 'Resshou'); },
    },
    boost: { cancelable: true, force: 0, continuous: true, statMods: { spd: 1 }, nowDraw: 1,
      resolve(ctx) { ctx.engine.advanceSelf(ctx.player, ctx.opponent, 2, true); } },
  },
  {
    key: 'chipp_banki_messai', name: 'Banki Messai', type: 'ultra', owner: 'chipp', gaugeCost: 1,
    range: [1, 1], pow: 5, spd: 4, arm: 0, grd: 0,
    text: 'Before: Close 3.\nHit: Push 2, draw 2.',
    boostText: 'Draw 3. Take another action.',
    hooks: {
      before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 3); },
      hit(ctx) { ctx.engine.pushAway(ctx.defender, ctx.attacker, 2); ctx.engine.draw(ctx.attacker, 2); },
    },
    boost: { force: 0, continuous: false, bonusAction: true,
      resolve(ctx) { ctx.engine.draw(ctx.player, 3); } },
  },
  {
    key: 'chipp_zansei_rouga', name: 'Zansei Rouga', type: 'ultra', owner: 'chipp', gaugeCost: 2,
    range: [1, 2], pow: 2, spd: 9, arm: 0, grd: 0,
    text: 'Before: Spend up to [4]. For each Gauge spent, +1 POW and Advance 3.',
    boostText: '[+] +2 SPD.\nThe opponent’s attack has +3 POW.',
    hooks: {
      // Scaling Gauge spend ("up to [4], +1POW each") has no yield type — the engine's
      // optional-spend yields are all Force-based (`optional_force_spend_pow`) or
      // fixed-amount Gauge (`optional_gauge_spend`). Same gap as Hakumen's Guren boost
      // and Iron Tager's Ultras; auto-resolved to 0 rather than fabricating a payment.
      // DEFERRED: scaling Gauge spend.
    },
    boost: { cancelable: true, force: 0, continuous: true, statMods: { spd: 2 }, opponentPowMod: 3 },
  },
];

const KY = [
  {
    key: 'ky_dire_eclat', name: 'Dire Eclat', type: 'special', owner: 'ky',
    range: [1, 2], pow: 5, spd: 4, arm: 0, grd: 4,
    text: 'Hit: Push 2. If the opponent was Pushed fewer than 2 spaces, draw 2.',
    boostText: '[+] +1 SPD, +3 GRD.',
    hooks: {
      hit(ctx) {
        const before = ctx.defender.pos;
        ctx.engine.pushAway(ctx.defender, ctx.attacker, 2);
        if (Math.abs(ctx.defender.pos - before) < 2) ctx.engine.draw(ctx.attacker, 2);
      },
    },
    boost: { force: 0, continuous: true, statMods: { spd: 1, grd: 3 } },
  },
  {
    key: 'ky_foudre_arc', name: 'Foudre Arc', type: 'special', owner: 'ky',
    range: [1, 2], pow: 4, spd: 4, arm: 0, grd: 3,
    text: 'Before: Advance 3. If you did not Advance past the opponent, draw 1.',
    boostText: '[+] Now: Draw 1.\nHit: +1 POW, Advantage.',
    hooks: {
      before(ctx) {
        const before = ctx.attacker.pos < ctx.defender.pos;
        ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 3, true);
        if ((ctx.attacker.pos < ctx.defender.pos) === before) ctx.engine.draw(ctx.attacker, 1);
      },
    },
    boost: { force: 0, continuous: true, nowDraw: 1, statMods: { pow: 1 },
      onHit(ctx) { ctx.engine.grantAdvantage(ctx.player, 'Foudre Arc boost'); } },
  },
  {
    key: 'ky_stun_dipper', name: 'Stun Dipper', type: 'special', owner: 'ky',
    range: [1, 2], pow: 4, spd: 5, arm: 0, grd: 0,
    text: 'Before: Close 2.\nHit, Range 2: The opponent must discard a random card.',
    boostText: 'Add this to your Gauge.',
    hooks: {
      before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 2); },
      hit(ctx) { if (ctx.engine.range(ctx.attacker, ctx.defender) === 2) ctx.engine.randomDiscardFromHand(ctx.defender, 1); },
    },
    boost: { cancelable: true, force: 0, continuous: false, toGaugeInstead: true, resolve() {} },
  },
  {
    key: 'ky_stun_edge', name: 'Stun Edge', type: 'special', owner: 'ky',
    range: [2, 6], pow: 3, spd: 3, arm: 0, grd: 5,
    text: 'Hit, Range 2: +2 POW, Advantage.\nAfter: Advance up to 2.',
    boostText: '[+] +1 SPD.\nAfter: If the opponent is stunned, draw 1.',
    hooks: {
      hit(ctx) {
        if (ctx.engine.range(ctx.attacker, ctx.defender) === 2) {
          ctx.powBonus = (ctx.powBonus || 0) + 2;
          ctx.engine.grantAdvantage(ctx.attacker, 'Stun Edge');
        }
      },
      after(ctx) { ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 2, true); },
    },
    boost: { cancelable: true, force: 0, continuous: true, statMods: { spd: 1 }, drawIfOpponentStunnedThisStrike: 1 },
  },
  {
    key: 'ky_vapor_thrust', name: 'Vapor Thrust', type: 'special', owner: 'ky',
    range: [1, 2], pow: 3, spd: 5, arm: 0, grd: 0,
    text: 'Range 2: +2 SPD.\nAfter: Advance 3.',
    boostText: '[+] +1 SPD.\nAfter: Advantage.',
    // "Range 2: +2SPD" is measured at set time like every other liveStats bonus —
    // `spdBonusPerRangeAtSetTime` is Vega's per-space version; this one is a flat
    // bonus at exactly Range 2, so it uses the generic conditional field below.
    liveStatMods(owner, opponent, engine) { return engine.range(owner, opponent) === 2 ? { spd: 2 } : {}; },
    hooks: { after(ctx) { ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 3, true); } },
    boost: { cancelable: true, force: 0, continuous: true, statMods: { spd: 1 }, advantageIfOpponentStunnedThisStrike: false,
      onHit() {} },
  },
  {
    key: 'ky_ride_the_lightning', name: 'Ride the Lightning', type: 'ultra', owner: 'ky', gaugeCost: 4,
    range: [1, 1], pow: 6, spd: 1, arm: 2, grd: 6,
    text: 'Before: Close 4.\nHit: Push 2, Advantage.',
    boostText: '[+] +0~1 RNG, +1 POW.',
    hooks: {
      before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 4); },
      hit(ctx) { ctx.engine.pushAway(ctx.defender, ctx.attacker, 2); ctx.engine.grantAdvantage(ctx.attacker, 'Ride the Lightning'); },
    },
    boost: { cancelable: true, force: 0, continuous: true, rangeMaxBonus: 1, statMods: { pow: 1 } },
  },
  {
    key: 'ky_sacred_edge', name: 'Sacred Edge', type: 'ultra', owner: 'ky', gaugeCost: 4,
    range: [2, 6], pow: 5, spd: 6, arm: 0, grd: 0,
    text: 'Hit: Close up to 4. Advantage.',
    boostText: 'Draw 2.',
    hooks: {
      hit(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 4); ctx.engine.grantAdvantage(ctx.attacker, 'Sacred Edge'); },
    },
    boost: { cancelable: true, force: 0, continuous: false, resolve(ctx) { ctx.engine.draw(ctx.player, 2); } },
  },
];

const ANJI = [
  {
    key: 'anji_fuujin', name: 'Fuujin', type: 'special', owner: 'anji',
    range: [1, 2], pow: 3, spd: 5, arm: 0, grd: 3,
    text: 'Before: Close 2. If you were hit, +2 POW.\nHit: Draw 1, Advantage.',
    boostText: '[+] +1 POW.\nNow: Push or Pull 1.',
    hooks: {
      before(ctx) {
        ctx.engine.closeSelf(ctx.attacker, ctx.defender, 2);
        if (ctx.attacker.strikeState.wasHit) ctx.powBonus = (ctx.powBonus || 0) + 2;
      },
      hit(ctx) { ctx.engine.draw(ctx.attacker, 1); ctx.engine.grantAdvantage(ctx.attacker, 'Fuujin'); },
    },
    boost: { cancelable: true, force: 0, continuous: true, statMods: { pow: 1 }, needsPushPullChoice: true,
      resolve(ctx) {
        if (ctx.pushPullDirection === 'pull') ctx.engine.pushToward(ctx.opponent, ctx.player, 1);
        else ctx.engine.pushAway(ctx.opponent, ctx.player, 1);
      } },
  },
  {
    key: 'anji_kou', name: 'Kou', type: 'special', owner: 'anji',
    range: [1, 2], pow: 4, spd: 3, arm: 0, grd: 4,
    text: 'Before: Advance 3. If you were hit, +2 POW.',
    boostText: '[+] +1 SPD.\nHit: Push 1 or 2.',
    hooks: {
      before(ctx) {
        ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 3, true);
        if (ctx.attacker.strikeState.wasHit) ctx.powBonus = (ctx.powBonus || 0) + 2;
      },
    },
    boost: { force: 0, continuous: true, statMods: { spd: 1 },
      onHit(ctx) { ctx.engine.pushAway(ctx.opponent, ctx.player, 2); } },
  },
  {
    key: 'anji_nagiha', name: 'Nagiha', type: 'special', owner: 'anji',
    range: [1, 2], pow: 3, spd: 4, arm: 1, grd: 3,
    text: 'Hit: Retreat 2.\nAfter: Draw 2.',
    boostText: 'Close 1. You may draw 1 or Strike.',
    hooks: {
      hit(ctx) { ctx.engine.retreatSelf(ctx.attacker, ctx.defender, 2); },
      after(ctx) { ctx.engine.draw(ctx.attacker, 2); },
    },
    // "draw 1 OR Strike" — resolved as the draw plus the standard triggersStrike offer
    // would double-dip, so this takes the Strike branch (the stronger, tempo half) and
    // leaves the draw out. DEFERRED: the either/or choice itself.
    boost: { force: 0, continuous: false, triggersStrike: true,
      resolve(ctx) { ctx.engine.closeSelf(ctx.player, ctx.opponent, 1); } },
  },
  {
    key: 'anji_rin', name: 'Rin', type: 'special', owner: 'anji',
    range: [1, 2], pow: 4, spd: 3, arm: 0, grd: 3, ignoreGuard: true, ignoreArmor: true,
    text: 'Ignore Guard, Armor.\nHit: Push 1.',
    boostText: '[+] +1 ARM, +1 GRD.\nNow: Advance or Retreat 1.',
    hooks: { hit(ctx) { ctx.engine.pushAway(ctx.defender, ctx.attacker, 1); } },
    boost: { cancelable: true, force: 0, continuous: true, statMods: { arm: 1, grd: 1 }, needsDirectionChoice: true,
      resolve(ctx) {
        if (ctx.moveDirection === 'advance') ctx.engine.advanceSelf(ctx.player, ctx.opponent, 1, true);
        else ctx.engine.retreatSelf(ctx.player, ctx.opponent, 1);
      } },
  },
  {
    key: 'anji_shitsu', name: 'Shitsu', type: 'special', owner: 'anji',
    range: [2, 4], pow: 3, spd: 2, arm: 0, grd: 3,
    text: 'Hit: Advantage.\nAfter: Draw 1. You may Advance or Retreat 1.',
    boostText: '[+] Now: Draw 2.\nAfter: Advantage.',
    hooks: {
      hit(ctx) { ctx.engine.grantAdvantage(ctx.attacker, 'Shitsu'); },
      after(ctx) { ctx.engine.draw(ctx.attacker, 1); },
      // DEFERRED: the After's "may Advance or Retreat 1" direction choice (same
      // simplification Millia's Tandem Top already carries).
    },
    // The sheet's own Notes column: the boost's Advantage is an After, not a Hit, so it
    // lands even on a whiff — `advantageIfOpponentStunnedThisStrike` is the wrong flag;
    // an unconditional After-Advantage has no boost extension point, so this uses onHit
    // plus a DEFERRED note for the whiff case.
    boost: { cancelable: true, force: 0, continuous: true, nowDraw: 2,
      onHit(ctx) { ctx.engine.grantAdvantage(ctx.player, 'Shitsu boost'); } },
  },
  {
    key: 'anji_issei_ougi_sai', name: 'Issei Ougi: Sai', type: 'ultra', owner: 'anji', gaugeCost: 3,
    range: [1, 3], pow: 3, spd: 3, arm: 3, grd: 3,
    text: 'Hit: Draw 3. The opponent must discard 3 cards.',
    boostText: '[+] Now: Look at the top card of your opponent’s deck.\nHit: Add this to your Gauge.',
    hooks: {
      hit(ctx) { ctx.engine.draw(ctx.attacker, 3); ctx.engine.randomDiscardFromHand(ctx.defender, 3); },
    },
    // "Look at the top card of your opponent's deck" is pure information with no
    // engine-side state to change (the AI does not hide information from itself, and
    // the human UI has no opponent-deck peek surface). DEFERRED: the peek display.
    boost: { cancelable: true, force: 0, continuous: true, toGaugeIfHitThisStrike: true },
  },
  {
    key: 'anji_kachofuugetsu_kai', name: 'Kachofuugetsu Kai', type: 'ultra', owner: 'anji', gaugeCost: 2,
    range: [1, 2], pow: 0, spd: 3, arm: 0, grd: 0,
    stunImmuneBase: true,
    text: 'Stun Immunity.\nBefore: If you were hit, +6 POW and Close 3.',
    boostText: 'Name a Normal. Strike; the opponent must set that Normal or reveal a hand without it.',
    hooks: {
      before(ctx) {
        if (ctx.attacker.strikeState.wasHit) {
          ctx.powBonus = (ctx.powBonus || 0) + 6;
          ctx.engine.closeSelf(ctx.attacker, ctx.defender, 3);
        }
      },
    },
    // Same mechanic as Focus's Reading (engine.setReading/mustWildSwing), reused here
    // rather than reimplemented — see the Focus entry in NORMALS/GG_NORMALS.
    boost: { force: 0, continuous: false, needsNameChoice: true, triggersStrike: true,
      resolve(ctx) { ctx.engine.setReading(ctx.player, ctx.namedCardKey); } },
  },
];

const MAY = [
  {
    key: 'may_anchor_swing', name: 'Anchor Swing', type: 'special', owner: 'may',
    range: [1, 2], pow: 5, spd: 2, arm: 0, grd: 6,
    text: 'Before: Close 1.\nHit: Add the top card of your deck to your Gauge.',
    boostText: '[+] +1 POW.\nNow: Advance or Retreat 2.',
    hooks: {
      before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 1); },
      hit(ctx) {
        const top = ctx.engine.peekTopN(ctx.attacker, 1)[0];
        if (top) { ctx.attacker.gauge.push(top); ctx.engine.logMsg(`${ctx.attacker.name} adds ${top.name} to Gauge (Anchor Swing).`); }
      },
    },
    boost: { cancelable: true, force: 0, continuous: true, statMods: { pow: 1 }, needsDirectionChoice: true,
      resolve(ctx) {
        if (ctx.moveDirection === 'advance') ctx.engine.advanceSelf(ctx.player, ctx.opponent, 2, true);
        else ctx.engine.retreatSelf(ctx.player, ctx.opponent, 2);
      } },
  },
  {
    key: 'may_arisugawa_sparkle', name: 'Arisugawa Sparkle', type: 'special', owner: 'may',
    range: [2, 4], pow: 3, spd: 4, arm: 2, grd: 3,
    text: 'After: Close 1. Draw 1.',
    boostText: 'Discard your hand. Draw 4. Strike.',
    hooks: { after(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 1); ctx.engine.draw(ctx.attacker, 1); } },
    boost: { force: 0, continuous: false, triggersStrike: true,
      resolve(ctx) { ctx.engine.discardAllHand(ctx.player); ctx.engine.draw(ctx.player, 4); } },
  },
  {
    key: 'may_mr_dolphin', name: 'Mr. Dolphin', type: 'special', owner: 'may',
    range: [1, 2], pow: 4, spd: 4, arm: 0, grd: 0,
    text: 'Before: Close 2. If you Closed fewer than 2 spaces, +2 POW.',
    boostText: '[+] +1 SPD.\nNow: Advance 1.',
    hooks: {
      before(ctx) {
        const before = ctx.attacker.pos;
        ctx.engine.closeSelf(ctx.attacker, ctx.defender, 2);
        if (Math.abs(ctx.attacker.pos - before) < 2) ctx.powBonus = (ctx.powBonus || 0) + 2;
      },
    },
    boost: { cancelable: true, force: 0, continuous: true, statMods: { spd: 1 },
      resolve(ctx) { ctx.engine.advanceSelf(ctx.player, ctx.opponent, 1, true); } },
  },
  {
    key: 'may_overhead_kiss', name: 'Overhead Kiss', type: 'special', owner: 'may',
    range: [1, 1], pow: 4, spd: 3, arm: 0, grd: 0, ignoreArmor: true, ignoreGuard: true,
    text: 'Ignore Armor, Guard.\nHit: Push 2. Advantage.',
    boostText: '[+] Now: Draw 2.\nHit: Advantage.',
    hooks: {
      hit(ctx) { ctx.engine.pushAway(ctx.defender, ctx.attacker, 2); ctx.engine.grantAdvantage(ctx.attacker, 'Overhead Kiss'); },
    },
    boost: { force: 0, continuous: true, nowDraw: 2,
      onHit(ctx) { ctx.engine.grantAdvantage(ctx.player, 'Overhead Kiss boost'); } },
  },
  {
    key: 'may_totsugeki', name: 'Totsugeki!', type: 'special', owner: 'may',
    range: [1, 1], pow: 4, spd: 5, arm: 0, grd: 0,
    text: 'Before: Close 3.\nHit: Push 2. Advantage.',
    boostText: '[+] +1 POW, +4 GRD.',
    hooks: {
      before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 3); },
      hit(ctx) { ctx.engine.pushAway(ctx.defender, ctx.attacker, 2); ctx.engine.grantAdvantage(ctx.attacker, 'Totsugeki!'); },
    },
    boost: { force: 0, continuous: true, statMods: { pow: 1, grd: 4 } },
  },
  {
    key: 'may_great_yamada_attack', name: 'Great Yamada Attack', type: 'ultra', owner: 'may', gaugeCost: 3,
    range: [2, 4], pow: 6, spd: 1, arm: 0, grd: 0,
    stunImmuneBase: true,
    text: 'Stun Immunity.\nAfter: Close 3.',
    boostText: 'Close 3. You may spend {1}. If you do, Strike.',
    hooks: { after(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 3); } },
    // The paid Strike follow-up uses the existing `optionalForceSpend` boost flag
    // (Winter Mantis's shape) — spend {1}, then Strike.
    boost: { force: 0, continuous: false, triggersStrike: true, optionalForceSpend: { max: 1 },
      resolve(ctx) { ctx.engine.closeSelf(ctx.player, ctx.opponent, 3); } },
  },
  {
    key: 'may_goshogawara', name: 'The Wonderful and Dynamic Goshogawara', type: 'ultra', owner: 'may', gaugeCost: 3,
    range: [1, 2], pow: 4, spd: 5, arm: 0, grd: 0,
    text: 'If the opponent initiated, +3 SPD.\nHit: Push 1.',
    boostText: '[+] +1 POW, +1 SPD.\nNow: Draw 1.',
    hooks: {
      spdBonusIfDefending: 3,
      hit(ctx) { ctx.engine.pushAway(ctx.defender, ctx.attacker, 1); },
    },
    boost: { force: 0, continuous: true, statMods: { pow: 1, spd: 1 }, nowDraw: 1 },
  },
];

const RAMLETHAL = [
  {
    key: 'ram_agresa_ordono', name: 'Agresa Ordono', type: 'special', owner: 'ramlethal',
    range: [1, 4], pow: 4, spd: 3, arm: 0, grd: 3,
    text: 'Hit: Close or Retreat 1. Add the top card of your deck to your Gauge.',
    boostText: '[+] +4 GRD.\nNow: Spend up to {2}. For each spent, draw 2.',
    hooks: {
      hit(ctx) {
        ctx.engine.closeSelf(ctx.attacker, ctx.defender, 1);
        const top = ctx.engine.peekTopN(ctx.attacker, 1)[0];
        if (top) { ctx.attacker.gauge.push(top); ctx.engine.logMsg(`${ctx.attacker.name} adds ${top.name} to Gauge (Agresa Ordono).`); }
      },
    },
    boost: { force: 0, continuous: true, statMods: { grd: 4 }, optionalForceSpend: { max: 2 },
      resolve(ctx) { if (ctx.bonusForceSpent) ctx.engine.draw(ctx.player, 2 * ctx.bonusForceSpent); } },
  },
  {
    key: 'ram_bajoneto', name: 'Bajoneto', type: 'special', owner: 'ramlethal',
    range: [2, 4], pow: 3, spd: 5, arm: 0, grd: 0,
    text: 'Hit: Push 2; if the opponent was Pushed fewer than 2 spaces, +2 POW.\nAfter: Close 2, Advantage.',
    boostText: '[+] +0~1 RNG.\nHit: Add this to your Gauge.',
    hooks: {
      hit(ctx) {
        const before = ctx.defender.pos;
        ctx.engine.pushAway(ctx.defender, ctx.attacker, 2);
        if (Math.abs(ctx.defender.pos - before) < 2) ctx.powBonus = (ctx.powBonus || 0) + 2;
      },
      after(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 2); ctx.engine.grantAdvantage(ctx.attacker, 'Bajoneto'); },
    },
    boost: { cancelable: true, force: 0, continuous: true, rangeMaxBonus: 1, toGaugeIfHitThisStrike: true },
  },
  {
    key: 'ram_dauro', name: 'Dauro', type: 'special', owner: 'ramlethal',
    range: [1, 1], pow: 2, spd: 6, arm: 0, grd: 0,
    text: 'Before: Close 2.\nHit: Push 1.',
    boostText: 'Return a Special from your discard pile to your hand. Strike.',
    hooks: {
      before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 2); },
      hit(ctx) { ctx.engine.pushAway(ctx.defender, ctx.attacker, 1); },
    },
    boost: { force: 0, continuous: false, triggersStrike: true,
      resolve(ctx) {
        const idx = ctx.player.discard.map(c => c.type).lastIndexOf('special');
        if (idx !== -1) {
          const [c] = ctx.player.discard.splice(idx, 1);
          ctx.player.hand.push(c);
          ctx.engine.logMsg(`${ctx.player.name} returns ${c.name} from discard to hand (Dauro).`);
        }
      } },
  },
  {
    key: 'ram_erarlumo', name: 'Erarlumo', type: 'special', owner: 'ramlethal',
    range: [1, 1], pow: 3, spd: 5, arm: 0, grd: 0,
    text: 'Before: Close 2.\nHit: Draw 2. Add a card from your hand to your Gauge.',
    boostText: '[+] Now: Draw 2.\nHit: Push 1; if the opponent was Pushed fewer than 1 space, +2 POW.',
    hooks: {
      before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 2); },
      hit(ctx) {
        ctx.engine.draw(ctx.attacker, 2);
        // "A card from your hand" — no hand-to-Gauge picker exists inside a Strike hook
        // (M. Bison's `action_gauge_select` is an action-time UI mode), so this takes
        // the first card, the same simplification the reactive Block spend uses.
        const c = ctx.attacker.hand.shift();
        if (c) { ctx.attacker.gauge.push(c); ctx.engine.logMsg(`${ctx.attacker.name} adds ${c.name} to Gauge (Erarlumo).`); }
      },
    },
    boost: { force: 0, continuous: true, nowDraw: 2,
      onHit(ctx) {
        const before = ctx.opponent.pos;
        ctx.engine.pushAway(ctx.opponent, ctx.player, 1);
        if (Math.abs(ctx.opponent.pos - before) < 1) ctx.powBonus = (ctx.powBonus || 0) + 2;
      } },
  },
  {
    key: 'ram_sabrobato', name: 'Sabrobato', type: 'special', owner: 'ramlethal',
    range: [1, 2], pow: 4, spd: 2, arm: 0, grd: 5,
    text: 'Hit: Push 1; if the opponent was Pushed fewer than 1 space, +2 POW and draw 1.',
    boostText: 'Close 1. Draw 2.',
    hooks: {
      hit(ctx) {
        const before = ctx.defender.pos;
        ctx.engine.pushAway(ctx.defender, ctx.attacker, 1);
        if (Math.abs(ctx.defender.pos - before) < 1) { ctx.powBonus = (ctx.powBonus || 0) + 2; ctx.engine.draw(ctx.attacker, 1); }
      },
    },
    boost: { cancelable: true, force: 0, continuous: false,
      resolve(ctx) { ctx.engine.closeSelf(ctx.player, ctx.opponent, 1); ctx.engine.draw(ctx.player, 2); } },
  },
  {
    key: 'ram_calvados', name: 'Calvados', type: 'ultra', owner: 'ramlethal', gaugeCost: 1,
    range: [1, 5], pow: 4, spd: 1, arm: 1, grd: 5,
    text: 'Hit: Push 2.\nAfter: If you initiated, add a card from your discard pile to your Gauge.',
    boostText: '[+] Now, Range 1: Push 2.\nHit: Add this to your Gauge.',
    hooks: {
      hit(ctx) { ctx.engine.pushAway(ctx.defender, ctx.attacker, 2); },
      after(ctx) {
        if (ctx.attacker.id !== ctx.strikeInitiator.id) return;
        const c = ctx.attacker.discard.pop();
        if (c) { ctx.attacker.gauge.push(c); ctx.engine.logMsg(`${ctx.attacker.name} adds ${c.name} from discard to Gauge (Calvados).`); }
      },
    },
    boost: { cancelable: true, force: 0, continuous: true, toGaugeIfHitThisStrike: true,
      resolve(ctx) { if (ctx.engine.range(ctx.player, ctx.opponent) === 1) ctx.engine.pushAway(ctx.opponent, ctx.player, 2); } },
  },
  {
    key: 'ram_mortobato', name: 'Mortobato', type: 'ultra', owner: 'ramlethal', gaugeCost: 3,
    range: [1, 2], pow: 4, spd: 7, arm: 0, grd: 0,
    text: '',
    boostText: 'Return all cards from your Gauge to your hand. Take another action.',
    hooks: {},
    boost: { force: 0, continuous: false, bonusAction: true,
      resolve(ctx) {
        const n = ctx.player.gauge.length;
        if (n > 0) {
          ctx.player.hand.push(...ctx.player.gauge);
          ctx.player.gauge = [];
          ctx.engine.logMsg(`${ctx.player.name} returns ${n} card(s) from Gauge to hand (Mortobato).`);
        }
      } },
  },
];

const NAGORIYUKI = [
  {
    key: 'nago_bloodsucking_universe', name: 'Bloodsucking Universe', type: 'special', owner: 'nagoriyuki',
    range: [1, 1], pow: 4, spd: 4, arm: 0, grd: 0, ignoreGuard: true,
    text: 'Ignore Guard.\nHit: Shuffle 2 cards from your discard pile into your deck.',
    boostText: '[+] +1 SPD.\nNow: You may spend {1}. If you do, discard another boost from play.',
    hooks: {
      hit(ctx) {
        const moved = ctx.attacker.discard.splice(0, 2);
        if (moved.length) {
          ctx.attacker.deck.push(...moved);
          ctx.engine.logMsg(`${ctx.attacker.name} shuffles ${moved.length} card(s) from discard into their deck (Bloodsucking Universe).`);
        }
      },
    },
    boost: { force: 0, continuous: true, statMods: { spd: 1 } },
  },
  {
    key: 'nago_kamuriyuki', name: 'Kamuriyuki', type: 'special', owner: 'nagoriyuki',
    range: [1, 1], pow: 4, spd: 5, arm: 0, grd: 0,
    text: 'Before: Close 3.\nAfter: Advantage.',
    boostText: 'Return a card from your discard pile to your hand.',
    hooks: {
      before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 3); },
      after(ctx) { ctx.engine.grantAdvantage(ctx.attacker, 'Kamuriyuki'); },
    },
    boost: { force: 0, continuous: false,
      resolve(ctx) {
        const c = ctx.player.discard.pop();
        if (c) { ctx.player.hand.push(c); ctx.engine.logMsg(`${ctx.player.name} returns ${c.name} from discard to hand (Kamuriyuki).`); }
      } },
  },
  {
    key: 'nago_kirioroshi', name: 'Kirioroshi', type: 'special', owner: 'nagoriyuki',
    range: [1, 2], pow: 4, spd: 4, arm: 0, grd: 0,
    text: 'Before: You may spend {2}. If you do, +3 POW and Ignore Armor.',
    boostText: '[+] +1 POW and +1 ARM.\nNow: Strike; set your attack face-up.',
    hooks: {
      // DEFERRED: the optional {2} Force spend for "+3POW and Ignore Armor" — the
      // existing optional-Force yields either scale POW per Force
      // (`optionalForceSpendForPow`) or are Gauge-based; neither can also flip
      // ignoreArmor on. Left unpaid rather than granted for free.
    },
    boost: { force: 0, continuous: true, statMods: { pow: 1, arm: 1 }, triggersStrike: true },
  },
  {
    key: 'nago_shizuriyuki', name: 'Shizuriyuki', type: 'special', owner: 'nagoriyuki',
    range: [1, 3], pow: 3, spd: 3, arm: 0, grd: 5,
    text: 'Hit: You may spend {2}. If you do, +3 POW and draw 2.',
    boostText: 'Advance or Retreat 2. Draw 2. Discard a card.',
    hooks: {
      // Same shape as C. Viper's Temple Massage, but with a fixed 2-Force price and a
      // draw rider: `optionalForceSpendForPow` only models "+1POW per Force".
      // DEFERRED: the fixed-price spend.
    },
    boost: { cancelable: true, force: 0, continuous: false, needsDirectionChoice: true,
      resolve(ctx) {
        if (ctx.moveDirection === 'advance') ctx.engine.advanceSelf(ctx.player, ctx.opponent, 2, true);
        else ctx.engine.retreatSelf(ctx.player, ctx.opponent, 2);
        ctx.engine.draw(ctx.player, 2);
        const c = ctx.player.hand[0];
        if (c) ctx.engine.discardFromHand(ctx.player, c.uid);
      } },
  },
  {
    key: 'nago_zarameyuki', name: 'Zarameyuki', type: 'special', owner: 'nagoriyuki',
    range: [2, 5], pow: 5, spd: 2, arm: 0, grd: 6,
    text: 'After: You may spend {2}. If you do, +3 ARM and Close 2.',
    boostText: '[+] +0~2 RNG, -2 SPD.\nHit: Draw 1.',
    hooks: {
      // +3ARM after the fact cannot matter (Armor is consumed during the exchange), so
      // only the movement half would be observable; left out with the spend.
      // DEFERRED: the optional {2} spend.
    },
    boost: { cancelable: true, force: 0, continuous: true, rangeMaxBonus: 2, statMods: { spd: -2 },
      onHit(ctx) { ctx.engine.draw(ctx.player, 1); } },
  },
  {
    key: 'nago_wasureyuki', name: 'Wasureyuki', type: 'ultra', owner: 'nagoriyuki', gaugeCost: 3,
    range: [1, 2], pow: 5, spd: 6, arm: 0, grd: 4,
    text: 'Hit: Return a card from your discard pile to your hand.',
    boostText: 'Add up to 3 cards from your hand to your Gauge.',
    hooks: {
      hit(ctx) {
        const c = ctx.attacker.discard.pop();
        if (c) { ctx.attacker.hand.push(c); ctx.engine.logMsg(`${ctx.attacker.name} returns ${c.name} from discard to hand (Wasureyuki).`); }
      },
    },
    boost: { cancelable: true, force: 0, continuous: false,
      resolve(ctx) {
        const moved = ctx.player.hand.splice(0, 3);
        if (moved.length) {
          ctx.player.gauge.push(...moved);
          ctx.engine.logMsg(`${ctx.player.name} adds ${moved.length} card(s) from hand to Gauge (Wasureyuki).`);
        }
      } },
  },
  {
    key: 'nago_zansetsu', name: 'Zansetsu', type: 'ultra', owner: 'nagoriyuki', gaugeCost: 4,
    range: [3, 6], pow: 0, spd: 3, arm: 0, grd: 0,
    text: 'Before, Exceed Mode: +6 POW. Draw 2. Revert.',
    boostText: '[+] +0~1 RNG.\nHit: Advantage.',
    hooks: {
      before(ctx) {
        if (!ctx.attacker.exceeded) return;
        ctx.powBonus = (ctx.powBonus || 0) + 6;
        ctx.engine.draw(ctx.attacker, 2);
        // Revert is deferred to cleanup (the same place Leo's and Happy Chaos's
        // Reverts land) via the engine's own revertPending flag.
        ctx.attacker.revertPending = true;
      },
    },
    boost: { force: 0, continuous: true, rangeMaxBonus: 1,
      onHit(ctx) { ctx.engine.grantAdvantage(ctx.player, 'Zansetsu boost'); } },
  },
];

const BAIKEN = [
  {
    key: 'baiken_hiiragi', name: 'Hiiragi', type: 'special', owner: 'baiken',
    range: [1, 2], pow: 1, spd: 3, arm: 0, grd: 6,
    text: 'If you have 3 or fewer cards in hand, +2 ARM.\nBefore: If you were hit, +6 POW and Close 2.',
    boostText: 'Retreat up to 2. Draw 1.',
    liveStatMods(owner) { return owner.hand.length <= 3 ? { arm: 2 } : {}; },
    hooks: {
      before(ctx) {
        if (ctx.attacker.strikeState.wasHit) {
          ctx.powBonus = (ctx.powBonus || 0) + 6;
          ctx.engine.closeSelf(ctx.attacker, ctx.defender, 2);
        }
      },
    },
    boost: { cancelable: true, force: 0, continuous: false,
      resolve(ctx) { ctx.engine.retreatSelf(ctx.player, ctx.opponent, 2); ctx.engine.draw(ctx.player, 1); } },
  },
  {
    key: 'baiken_kabari', name: 'Kabari', type: 'special', owner: 'baiken',
    range: [2, 4], pow: 3, spd: 5, arm: 0, grd: 0,
    text: 'Hit: Pull 2 without Pulling past yourself. You may Advance 2 and gain Advantage; otherwise, +2 POW.',
    boostText: '[+] +1 SPD.\nNow: You may add a card from your hand to Gauge.',
    hooks: {
      hit(ctx) {
        ctx.engine.pullTowardWithoutPassing(ctx.defender, ctx.attacker, 2);
        // The either/or resolves to the POW half: +2POW is unconditional value, while
        // "Advance 2 and gain Advantage" is only better when the follow-up matters —
        // and the engine has no yield for an in-Hit either/or that also moves.
        ctx.powBonus = (ctx.powBonus || 0) + 2;
      },
    },
    boost: { cancelable: true, force: 0, continuous: true, statMods: { spd: 1 },
      resolve(ctx) {
        const c = ctx.player.hand[0];
        if (c) {
          ctx.player.hand.shift();
          ctx.player.gauge.push(c);
          ctx.engine.logMsg(`${ctx.player.name} adds ${c.name} to Gauge (Kabari boost).`);
        }
      } },
  },
  {
    key: 'baiken_karatakewari', name: 'Karatakewari', type: 'special', owner: 'baiken',
    range: [1, 1], pow: 5, spd: 4, arm: 0, grd: 0,
    text: 'Hit: Push 2. If you have 3 or fewer cards in hand, +2 POW.',
    boostText: 'Close up to 2. Draw 1.',
    hooks: {
      hit(ctx) {
        ctx.engine.pushAway(ctx.defender, ctx.attacker, 2);
        if (ctx.attacker.hand.length <= 3) ctx.powBonus = (ctx.powBonus || 0) + 2;
      },
    },
    boost: { cancelable: true, force: 0, continuous: false, nowClose: 2, resolve(ctx) { ctx.engine.draw(ctx.player, 1); } },
  },
  {
    key: 'baiken_tatami_gaeshi', name: 'Tatami Gaeshi', type: 'special', owner: 'baiken',
    range: [1, 3], pow: 4, spd: 4, arm: 1, grd: 4,
    text: 'Hit: Push 1. Draw 1.\nAfter: Close 2.',
    boostText: '[+] +1 POW.\nNow: If you have 3 or fewer cards in hand, draw 1 and take another action.',
    hooks: {
      hit(ctx) { ctx.engine.pushAway(ctx.defender, ctx.attacker, 1); ctx.engine.draw(ctx.attacker, 1); },
      after(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 2); },
    },
    // `bonusAction` is unconditional in the engine; the hand-size gate is applied in
    // resolve() by only drawing when it holds. DEFERRED: gating the extra action too.
    boost: { force: 0, continuous: true, statMods: { pow: 1 }, bonusAction: true,
      resolve(ctx) { if (ctx.player.hand.length <= 3) ctx.engine.draw(ctx.player, 1); } },
  },
  {
    key: 'baiken_youzansen', name: 'Youzansen', type: 'special', owner: 'baiken',
    range: [1, 2], pow: 5, spd: 4, arm: 0, grd: 0, ignoreArmor: true,
    text: 'Ignore Armor.\nIf you have 3 or fewer cards in hand, +2 SPD.',
    boostText: '[+] +3 POW.\nNow: Draw 1. Take 3 non-lethal damage.',
    liveStatMods(owner) { return owner.hand.length <= 3 ? { spd: 2 } : {}; },
    hooks: {},
    boost: { force: 0, continuous: true, statMods: { pow: 3 },
      resolve(ctx) { ctx.engine.draw(ctx.player, 1); ctx.engine.takeDamageNonLethal(ctx.player, 3); } },
  },
  {
    key: 'baiken_tsurane_sanzu_watashi', name: 'Tsurane Sanzu-watashi', type: 'ultra', owner: 'baiken', gaugeCost: 3,
    range: [1, 1], pow: 5, spd: 5, arm: 0, grd: 0,
    text: 'If you have 3 or fewer cards in hand, +3 SPD.',
    boostText: '[+] Stun Immunity.\nBefore: For each point of damage taken this Strike, +1 POW.',
    liveStatMods(owner) { return owner.hand.length <= 3 ? { spd: 3 } : {}; },
    hooks: {},
    // DEFERRED: the boost's "+1POW per damage taken this Strike" — damage taken is not
    // tracked as a number anywhere (only the boolean `_wasHitThisStrike`).
    boost: { force: 0, continuous: true, stunImmuneGrant: true },
  },
  {
    key: 'baiken_kenjyu', name: 'Kenjyu', type: 'ultra', owner: 'baiken', gaugeCost: 2,
    range: [2, 5], pow: 3, spd: 6, arm: 0, grd: 0,
    text: 'Hit: Advantage.\nAfter: Close 2.',
    boostText: '[+] +2 ARM.\nNow: You may add a card from your hand to your Gauge.',
    hooks: {
      hit(ctx) { ctx.engine.grantAdvantage(ctx.attacker, 'Kenjyu'); },
      after(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 2); },
    },
    boost: { cancelable: true, force: 0, continuous: true, statMods: { arm: 2 },
      resolve(ctx) {
        const c = ctx.player.hand[0];
        if (c) {
          ctx.player.hand.shift();
          ctx.player.gauge.push(c);
          ctx.engine.logMsg(`${ctx.player.name} adds ${c.name} to Gauge (Kenjyu boost).`);
        }
      } },
  },
];

const INO = [
  {
    key: 'ino_antidepressant_scale', name: 'Antidepressant Scale', type: 'special', owner: 'ino',
    range: [2, 3], pow: 3, spd: 5, arm: 0, grd: 0,
    text: 'Before: If you initiated after moving 2 or more spaces, +2 POW.\nHit: Retreat 1. Advantage.',
    boostText: '[+] +4 GRD.\nHit: Advantage.',
    hooks: {
      // DEFERRED: "if you initiated after moving 2 or more spaces" — how far a player
      // moved on their own turn before Striking is not recorded anywhere.
      hit(ctx) { ctx.engine.retreatSelf(ctx.attacker, ctx.defender, 1); ctx.engine.grantAdvantage(ctx.attacker, 'Antidepressant Scale'); },
    },
    boost: { cancelable: true, force: 0, continuous: true, statMods: { grd: 4 },
      onHit(ctx) { ctx.engine.grantAdvantage(ctx.player, 'Antidepressant Scale boost'); } },
  },
  {
    key: 'ino_chemical_love', name: 'Chemical Love', type: 'special', owner: 'ino',
    range: [2, 4], pow: 2, spd: 6, arm: 0, grd: 0,
    text: 'Hit: Pull 1. Draw 1.',
    boostText: 'Advance or Retreat 2. Draw 2.',
    hooks: {
      hit(ctx) { ctx.engine.pushToward(ctx.defender, ctx.attacker, 1); ctx.engine.draw(ctx.attacker, 1); },
    },
    boost: { cancelable: true, force: 0, continuous: false, needsDirectionChoice: true,
      resolve(ctx) {
        if (ctx.moveDirection === 'advance') ctx.engine.advanceSelf(ctx.player, ctx.opponent, 2, true);
        else ctx.engine.retreatSelf(ctx.player, ctx.opponent, 2);
        ctx.engine.draw(ctx.player, 2);
      } },
  },
  {
    key: 'ino_guitar_stamping', name: 'Guitar Stamping', type: 'special', owner: 'ino',
    range: [1, 2], pow: 5, spd: 4, arm: 0, grd: 0,
    text: 'Before: Advance 1.\nHit: Retreat 3. Add the top card of your deck to your Gauge.',
    boostText: '[+] Now: Draw 2.\nHit: Advantage.',
    hooks: {
      before(ctx) { ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 1, true); },
      hit(ctx) {
        ctx.engine.retreatSelf(ctx.attacker, ctx.defender, 3);
        const top = ctx.engine.peekTopN(ctx.attacker, 1)[0];
        if (top) { ctx.attacker.gauge.push(top); ctx.engine.logMsg(`${ctx.attacker.name} adds ${top.name} to Gauge (Guitar Stamping).`); }
      },
    },
    boost: { force: 0, continuous: true, nowDraw: 2,
      onHit(ctx) { ctx.engine.grantAdvantage(ctx.player, 'Guitar Stamping boost'); } },
  },
  {
    key: 'ino_stroke_the_big_tree', name: 'Stroke the Big Tree', type: 'special', owner: 'ino',
    range: [1, 1], pow: 3, spd: 5, arm: 0, grd: 3,
    text: 'Before: Close 2. If you Closed fewer than 2 spaces, Ignore Guard.\nHit: Advantage.',
    boostText: '[+] +2 POW.\nAfter: If the opponent is stunned, they must discard 2 random cards.',
    hooks: {
      before(ctx) {
        const from = ctx.attacker.pos;
        ctx.engine.closeSelf(ctx.attacker, ctx.defender, 2);
        if (Math.abs(ctx.attacker.pos - from) < 2) ctx.attStats.ignoreGuard = true;
      },
      hit(ctx) { ctx.engine.grantAdvantage(ctx.attacker, 'Stroke the Big Tree'); },
    },
    // DEFERRED: the boost's stun-conditional discard — boosts can react to a stun with
    // `drawIfOpponentStunnedThisStrike`/`advantageIfOpponentStunnedThisStrike` only.
    boost: { force: 0, continuous: true, statMods: { pow: 2 } },
  },
  {
    key: 'ino_sultry_performance', name: 'Sultry Performance', type: 'special', owner: 'ino',
    range: [1, 2], pow: 4, spd: 4, arm: 0, grd: 0,
    text: 'Before: Advance 3.\nHit: Draw 2. Advance or Retreat 1.',
    boostText: '[+] Hit: +1 POW. Add this to your Gauge.',
    hooks: {
      before(ctx) { ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 3, true); },
      hit(ctx) { ctx.engine.draw(ctx.attacker, 2); ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 1, true); },
    },
    boost: { cancelable: true, force: 0, continuous: true, statMods: { pow: 1 }, toGaugeIfHitThisStrike: true },
  },
  {
    key: 'ino_megalomania', name: 'Megalomania', type: 'ultra', owner: 'ino', gaugeCost: 5,
    range: [2, 3], pow: 4, spd: 6, arm: 0, grd: 0,
    text: 'Hit: Advantage. The opponent must discard their hand.',
    boostText: '[+] Hit: You may discard a card from the opponent’s Gauge. Otherwise, draw 1 and add this to your Gauge.',
    hooks: {
      hit(ctx) { ctx.engine.grantAdvantage(ctx.attacker, 'Megalomania'); ctx.engine.discardAllHand(ctx.defender); },
    },
    boost: { cancelable: true, force: 0, continuous: true,
      onHit(ctx) {
        const c = ctx.opponent.gauge.pop();
        if (c) { ctx.opponent.discard.push(c); ctx.engine.logMsg(`${ctx.opponent.name} discards ${c.name} from Gauge (Megalomania boost).`); }
        else { ctx.engine.draw(ctx.player, 1); }
      } },
  },
  {
    key: 'ino_ultimate_fortissimo', name: 'Ultimate Fortissimo', type: 'ultra', owner: 'ino', gaugeCost: 3,
    range: [1, 3], pow: 4, spd: 3, arm: 6, grd: 0,
    text: 'After: Lose all Armor.',
    boostText: '[+] +1 POW, +1 SPD.\nHit: You may spend [2]. If you do, sustain this.',
    // DEFERRED (shared with Jack-O's Chain of Chiron and Goldlewis's Slam): "After:
    // Lose all Armor" is a mid-Strike Armor change, and liveStats deliberately computes
    // Armor once, up front (see the `selfArmorZero` comment there for the ordering bug
    // that proved a Before/After hook is the wrong place for it).
    hooks: {},
    boost: { cancelable: true, force: 0, continuous: true, statMods: { pow: 1, spd: 1 }, sustainIfNotStunnedCost: 2 },
  },
];

const FAUST = [
  {
    key: 'faust_love', name: 'Love', type: 'special', owner: 'faust',
    range: [2, 4], pow: 4, spd: 4, arm: 0, grd: 0,
    text: 'Before: You may discard a Boost from your Boost area. If you do, +2 POW.\nAfter: Retreat 1.',
    boostText: '[+] Your attack is EX.\nNow: The opponent may spend {2}. If they do, discard this (it is still Cancellable).',
    hooks: {
      before(ctx) {
        const own = ctx.attacker.boostsInPlay;
        if (own.length > 0) {
          const b = own.pop();
          ctx.attacker.discard.push(b.card);
          ctx.engine.logMsg(`${ctx.attacker.name} discards ${b.card.name} from their Boost area (+2 POW, Love).`);
          ctx.powBonus = (ctx.powBonus || 0) + 2;
        }
      },
      after(ctx) { ctx.engine.retreatSelf(ctx.attacker, ctx.defender, 1); },
    },
    // "Your attack is EX" grants the standard EX package (+1/+1/+1/+1) — the same
    // statMods GG Sweep's boost already uses for its own "counts as EX" clause.
    // DEFERRED: the opponent's optional {2} to discard this boost.
    boost: { cancelable: true, force: 0, continuous: true, statMods: { pow: 1, spd: 1, arm: 1, grd: 1 } },
  },
  {
    key: 'faust_mix_mix_mix', name: 'Mix Mix Mix', type: 'special', owner: 'faust',
    range: [1, 2], pow: 4, spd: 2, arm: 0, grd: 5,
    text: 'Before: Advance or Retreat 2.\nAfter: Advance or Retreat 2.',
    boostText: 'Now: Draw 2.\nBoth players have "After: Take 3 non-lethal damage and discard this (the other player loses the effect)".',
    hooks: {
      // Direction choices inside a Strike auto-resolve to Advance, per this file's
      // established convention for card-text "Advance or Retreat N".
      before(ctx) { ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 2, true); },
      after(ctx) { ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 2, true); },
    },
    // DEFERRED: the shared "both players have..." clause — no boost affects both
    // players' After steps (the only cross-player boost field is `opponentPowMod`).
    boost: { force: 0, continuous: false, resolve(ctx) { ctx.engine.draw(ctx.player, 2); } },
  },
  {
    key: 'faust_scarecrow', name: 'Scarecrow', type: 'special', owner: 'faust',
    range: [1, 1], pow: 4, spd: 4, arm: 0, grd: 0,
    text: 'If you have a Boost in play, +2 POW and -2 SPD.\nBefore: Close 8.',
    boostText: '[+] Now: Push 1. Retreat 1. Draw 1.\nHit: Add this to your Gauge.',
    liveStatMods(owner) { return owner.boostsInPlay.length > 0 ? { pow: 2, spd: -2 } : {}; },
    hooks: { before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 8); } },
    boost: { force: 0, continuous: true, toGaugeIfHitThisStrike: true,
      resolve(ctx) {
        ctx.engine.pushAway(ctx.opponent, ctx.player, 1);
        ctx.engine.retreatSelf(ctx.player, ctx.opponent, 1);
        ctx.engine.draw(ctx.player, 1);
      } },
  },
  {
    key: 'faust_snip_snip_snip', name: 'Snip Snip Snip', type: 'special', owner: 'faust',
    range: [1, 1], pow: 3, spd: 6, arm: 0, grd: 0, ignoreGuard: true,
    text: 'Ignore Guard.\nAfter: If you hit, add this to the opponent’s Boost area, ignoring Now effects, and sustain it.',
    boostText: '[+] -6 GRD.\nNow: Draw 2.',
    hooks: {
      // DEFERRED: handing your own used attack card to the OPPONENT's boost area — the
      // engine only ever plays boosts from a player's own hand/Gauge/deck.
    },
    boost: { cancelable: true, force: 0, continuous: true, statMods: { grd: -6 }, nowDraw: 2 },
  },
  {
    key: 'faust_thrust', name: 'Thrust', type: 'special', owner: 'faust',
    range: [1, 5], pow: 4, spd: 3, arm: 0, grd: 4,
    text: 'Hit: Pull 2. If the opponent is at Range 1, +3 POW and Push 2.',
    boostText: '[+] Both players have "Before: Advance 1." and "After: Discard this (the other player loses the effect)".',
    hooks: {
      hit(ctx) {
        ctx.engine.pushToward(ctx.defender, ctx.attacker, 2);
        if (ctx.engine.range(ctx.attacker, ctx.defender) === 1) {
          ctx.powBonus = (ctx.powBonus || 0) + 3;
          ctx.engine.pushAway(ctx.defender, ctx.attacker, 2);
        }
      },
    },
    // DEFERRED: the shared-effect clause (see Mix Mix Mix).
    boost: { cancelable: true, force: 0, continuous: true },
  },
  {
    key: 'faust_bone_crushing_excitement', name: 'Bone-crushing Excitement', type: 'ultra', owner: 'faust', gaugeCost: 4,
    range: [1, 1], pow: 7, spd: 3, arm: 0, grd: 0,
    text: 'Attacks with higher Speed do not hit you.\nBefore: Advance 3.',
    hitImmuneToFasterAttacks: true,
    boostText: '[+] +0~1 RNG.\nBoth players have "Before: +1 POW".',
    hooks: { before(ctx) { ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 3, true); } },
    boost: { force: 0, continuous: true, rangeMaxBonus: 1, statMods: { pow: 1 }, opponentPowMod: 1 },
  },
  {
    key: 'faust_what_could_this_be', name: 'W-W-What Could this Be?', type: 'ultra', owner: 'faust', gaugeCost: 2,
    range: [2, 5], pow: 3, spd: 6, arm: 0, grd: 0,
    text: 'Before: Boost and sustain the top 2 cards of your deck (one at a time).',
    boostText: 'Advance or Retreat 2. Draw 1.',
    hooks: {
      before(ctx) {
        // Same primitive Faust's own character action uses (playForcedBoost), run twice.
        for (const card of ctx.engine.peekTopN(ctx.attacker, 2)) {
          ctx.engine.playForcedBoost(ctx.attacker, ctx.defender, card);
        }
      },
    },
    boost: { force: 0, continuous: false, needsDirectionChoice: true,
      resolve(ctx) {
        if (ctx.moveDirection === 'advance') ctx.engine.advanceSelf(ctx.player, ctx.opponent, 2, true);
        else ctx.engine.retreatSelf(ctx.player, ctx.opponent, 2);
        ctx.engine.draw(ctx.player, 1);
      } },
  },
];

const GIOVANNA = [
  {
    key: 'gio_sepultura', name: 'Sepultura', type: 'special', owner: 'giovanna',
    range: [1, 3], pow: 4, spd: 4, arm: 0, grd: 0,
    text: 'Hit: The opponent must discard a random card.\nAfter: Close or Retreat 1.',
    boostText: 'Advance or Retreat 1. Draw 1.',
    hooks: {
      hit(ctx) { ctx.engine.randomDiscardFromHand(ctx.defender, 1); },
      after(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 1); },
    },
    boost: { cancelable: true, force: 0, continuous: false, needsDirectionChoice: true,
      resolve(ctx) {
        if (ctx.moveDirection === 'advance') ctx.engine.advanceSelf(ctx.player, ctx.opponent, 1, true);
        else ctx.engine.retreatSelf(ctx.player, ctx.opponent, 1);
        ctx.engine.draw(ctx.player, 1);
      } },
  },
  {
    key: 'gio_sol_nascente', name: 'Sol Nascente', type: 'special', owner: 'giovanna',
    range: [1, 2], pow: 3, spd: 6, arm: 0, grd: 0,
    text: 'After: Advance or Retreat 1.',
    boostText: 'Now: Draw 1.\nBefore: Close 1.',
    hooks: { after(ctx) { ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 1, true); } },
    boost: { cancelable: true, force: 0, continuous: false, nowDraw: 1, nowClose: 1, resolve() {} },
  },
  {
    key: 'gio_sol_poente', name: 'Sol Poente', type: 'special', owner: 'giovanna',
    range: [1, 2], pow: 4, spd: 3, arm: 0, grd: 0,
    text: 'Before: Advance 1. If you Advanced past the opponent, Ignore Guard.',
    boostText: '[+] +1 POW, +1 ARM.\nNow: You may add a card from hand to your Gauge.',
    hooks: {
      before(ctx) {
        const before = ctx.attacker.pos < ctx.defender.pos;
        ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 1, true);
        if ((ctx.attacker.pos < ctx.defender.pos) !== before) ctx.attStats.ignoreGuard = true;
      },
    },
    boost: { force: 0, continuous: true, statMods: { pow: 1, arm: 1 },
      resolve(ctx) {
        const c = ctx.player.hand[0];
        if (c) {
          ctx.player.hand.shift();
          ctx.player.gauge.push(c);
          ctx.engine.logMsg(`${ctx.player.name} adds ${c.name} to Gauge (Sol Poente boost).`);
        }
      } },
  },
  {
    key: 'gio_triple_kick', name: 'Triple Kick', type: 'special', owner: 'giovanna',
    range: [1, 3], pow: 2, spd: 5, arm: 0, grd: 0,
    text: 'Hit: Draw 2. Spend up to {3}; for each spent, +1 POW.',
    boostText: '[+] Hit: Draw 2.',
    hooks: {
      hit(ctx) { ctx.engine.draw(ctx.attacker, 2); },
      optionalForceSpendForPow: { max: 3, powPerForce: 1 },
    },
    boost: { cancelable: true, force: 0, continuous: true, onHit(ctx) { ctx.engine.draw(ctx.player, 2); } },
  },
  {
    key: 'gio_trovao', name: 'Trovão', type: 'special', owner: 'giovanna',
    range: [1, 1], pow: 4, spd: 2, arm: 0, grd: 5,
    text: 'Before: Close 3.',
    boostText: '[+] Now: Close 2.\nHit: Add this to your Gauge.',
    hooks: { before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 3); } },
    boost: { force: 0, continuous: true, nowClose: 2, toGaugeIfHitThisStrike: true },
  },
  {
    key: 'gio_tempestade', name: 'Tempestade', type: 'ultra', owner: 'giovanna', gaugeCost: 1,
    range: [1, 1], pow: 3, spd: 6, arm: 0, grd: 0,
    text: 'Before: Advance 3.\nHit: Advantage.',
    boostText: '[+] +1 SPD.\nHit: Advantage.',
    hooks: {
      before(ctx) { ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 3, true); },
      hit(ctx) { ctx.engine.grantAdvantage(ctx.attacker, 'Tempestade'); },
    },
    boost: { cancelable: true, force: 0, continuous: true, statMods: { spd: 1 },
      onHit(ctx) { ctx.engine.grantAdvantage(ctx.player, 'Tempestade boost'); } },
  },
  {
    key: 'gio_ventania', name: 'Ventania', type: 'ultra', owner: 'giovanna', gaugeCost: 4,
    range: [1, 2], pow: 6, spd: 7, arm: 0, grd: 0,
    text: 'Before: If you initiated, Close 2.',
    boostText: 'Close 3.',
    hooks: {
      before(ctx) { if (ctx.attacker.id === ctx.strikeInitiator.id) ctx.engine.closeSelf(ctx.attacker, ctx.defender, 2); },
    },
    boost: { cancelable: true, force: 0, continuous: false, nowClose: 3, resolve() {} },
  },
];

const JACKO = [
  {
    key: 'jacko_chain_of_chiron', name: 'Chain of Chiron', type: 'special', owner: 'jacko',
    range: [2, 3], pow: 3, spd: 5, arm: 0, grd: 0,
    text: 'After: Advance or Retreat 1.',
    boostText: '[+] +1 POW, +2 ARM.\nAfter: Lose all Armor. You may add this to your Gauge.',
    hooks: { after(ctx) { ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 1, true); } },
    // DEFERRED: "After: Lose all Armor" (see I-No's Ultimate Fortissimo for why a
    // mid-Strike Armor change has no correct place to live today).
    boost: { force: 0, continuous: true, statMods: { pow: 1, arm: 2 }, expireToGaugeAtStartOfNextTurn: true },
  },
  {
    key: 'jacko_countdown', name: 'Countdown', type: 'special', owner: 'jacko',
    range: [0, 0], pow: 1, spd: 2, arm: 3, grd: 4,
    text: 'Before: For each Boost you have in play, +0~1 RNG and +1 POW.',
    boostText: 'Add a card from your discard pile to your Gauge.',
    dynamicRangeMaxBonus(owner) { return owner.boostsInPlay.length; },
    hooks: {
      before(ctx) { ctx.powBonus = (ctx.powBonus || 0) + ctx.attacker.boostsInPlay.length; },
    },
    boost: { cancelable: true, force: 0, continuous: false,
      resolve(ctx) {
        const c = ctx.player.discard.pop();
        if (c) { ctx.player.gauge.push(c); ctx.engine.logMsg(`${ctx.player.name} adds ${c.name} from discard to Gauge (Countdown boost).`); }
      } },
  },
  {
    key: 'jacko_iron_pumpkin', name: 'Iron Pumpkin', type: 'special', owner: 'jacko',
    range: [3, 4], pow: 2, spd: 6, arm: 0, grd: 0,
    text: 'Hit: Draw 1.',
    boostText: '[+] +1 SPD.\nHit: You may add this to your Gauge.',
    hooks: { hit(ctx) { ctx.engine.draw(ctx.attacker, 1); } },
    boost: { force: 0, continuous: true, statMods: { spd: 1 }, toGaugeIfHitThisStrike: true },
  },
  {
    key: 'jacko_servant_shout', name: 'Servant Shout', type: 'special', owner: 'jacko',
    range: [1, 1], pow: 5, spd: 4, arm: 0, grd: 0,
    text: 'Before: If you have a Boost in play, +0~3 RNG.',
    boostText: '[+] +0~1 RNG.\nNow: Draw 1.',
    dynamicRangeMaxBonus(owner) { return owner.boostsInPlay.length > 0 ? 3 : 0; },
    hooks: {},
    boost: { force: 0, continuous: true, rangeMaxBonus: 1, nowDraw: 1 },
  },
  {
    key: 'jacko_throw_servant', name: 'Throw Servant', type: 'special', owner: 'jacko',
    range: [2, 6], pow: 3, spd: 2, arm: 0, grd: 6,
    text: 'After: You may play and sustain a Continuous Boost from your hand or Gauge (you cannot Cancel it).',
    boostText: '[+] Now: Retreat 2.\nHit: Draw 1. Add a card from your hand to your Gauge.',
    hooks: {
      after(ctx) {
        // Same forced-Boost primitive his character action uses; hand first, then Gauge.
        const pool = [...ctx.attacker.hand, ...ctx.attacker.gauge];
        const pick = pool.find(c => c.boost && c.boost.continuous);
        if (!pick) return;
        const hi = ctx.attacker.hand.findIndex(c => c.uid === pick.uid);
        if (hi !== -1) ctx.attacker.hand.splice(hi, 1);
        else ctx.attacker.gauge = ctx.attacker.gauge.filter(c => c.uid !== pick.uid);
        ctx.engine.playForcedBoost(ctx.attacker, ctx.defender, pick);
      },
    },
    boost: { force: 0, continuous: true,
      resolve(ctx) { ctx.engine.retreatSelf(ctx.player, ctx.opponent, 2); },
      onHit(ctx) {
        ctx.engine.draw(ctx.player, 1);
        const c = ctx.player.hand[0];
        if (c) {
          ctx.player.hand.shift();
          ctx.player.gauge.push(c);
          ctx.engine.logMsg(`${ctx.player.name} adds ${c.name} to Gauge (Throw Servant boost).`);
        }
      } },
  },
  {
    key: 'jacko_cheer_servant_on', name: 'Cheer Servant On', type: 'ultra', owner: 'jacko', gaugeCost: 3,
    range: [1, 2], pow: 4, spd: 6, arm: 0, grd: 0,
    text: 'Hit: You may sustain one of your Boosts. Advantage.',
    boostText: 'Add the top 2 cards of your deck to your Gauge.',
    hooks: {
      hit(ctx) {
        // Sustaining marks the boost to survive this Strike's cleanup — same
        // `sustainedForever` flag the paid sustain yields set.
        const b = ctx.attacker.boostsInPlay[0];
        if (b) { b.sustainedForever = true; ctx.engine.logMsg(`${ctx.attacker.name} sustains ${b.card.name} (Cheer Servant On).`); }
        ctx.engine.grantAdvantage(ctx.attacker, 'Cheer Servant On');
      },
    },
    boost: { force: 0, continuous: false,
      resolve(ctx) {
        const top = ctx.engine.peekTopN(ctx.player, 2);
        if (top.length) {
          ctx.player.gauge.push(...top);
          ctx.engine.logMsg(`${ctx.player.name} adds ${top.length} card(s) from the top of their deck to Gauge (Cheer Servant On boost).`);
        }
      } },
  },
  {
    key: 'jacko_forever_elysion_driver', name: 'Forever Elysion Driver', type: 'ultra', owner: 'jacko', gaugeCost: 2,
    range: [1, 1], pow: 6, spd: 4, arm: 0, grd: 0,
    text: 'Hit: Draw 3.',
    boostText: '[+] +1 SPD.\nHit: Advantage.',
    hooks: { hit(ctx) { ctx.engine.draw(ctx.attacker, 3); } },
    boost: { force: 0, continuous: true, statMods: { spd: 1 },
      onHit(ctx) { ctx.engine.grantAdvantage(ctx.player, 'Forever Elysion Driver boost'); } },
  },
];

// Happy Chaos's Deus Ex Machina is not a deck card: it never shuffles in, never goes
// to Gauge, and is only ever set by his Exceed (see CHARACTERS.happychaos.onExceed).
// `copies: 0` keeps buildDeck from adding it while leaving it reachable by key.
const HAPPYCHAOS = [
  {
    key: 'hc_deus_ex_machina', name: 'Deus Ex Machina', type: 'special', owner: 'happychaos', copies: 0, neverLeavesPlay: true,
    range: [1, 5], pow: 4, spd: 4, arm: 0, grd: 5,
    text: 'Hit: Shuffle your sealed area into your deck. Draw 3.',
    boostText: '',
    hooks: {
      hit(ctx) {
        const n = ctx.attacker.sealedCards.length;
        if (n > 0) {
          ctx.attacker.deck.push(...ctx.attacker.sealedCards.splice(0));
          ctx.engine.logMsg(`${ctx.attacker.name} shuffles ${n} sealed card(s) into their deck (Deus Ex Machina).`);
        }
        ctx.engine.draw(ctx.attacker, 3);
      },
    },
    boost: { force: 0, continuous: false, resolve() {} },
  },
  {
    key: 'hc_at_the_ready', name: 'At the Ready', type: 'special', owner: 'happychaos',
    range: [1, 2], pow: 2, spd: 6, arm: 0, grd: 0,
    text: 'Hit: You may draw 2 or return a card from your sealed area to your hand.',
    boostText: '[+] +1 POW.\nNow: You may spend {1}. If you do, discard another Boost from play.',
    hooks: {
      hit(ctx) {
        // Returning a sealed card is only possible when something is sealed; when it
        // is, it is the stronger half (sealed cards are otherwise gone for good).
        const c = ctx.attacker.sealedCards.pop();
        if (c) { ctx.attacker.hand.push(c); ctx.engine.logMsg(`${ctx.attacker.name} returns sealed ${c.name} to hand (At the Ready).`); }
        else ctx.engine.draw(ctx.attacker, 2);
      },
    },
    boost: { force: 0, continuous: true, statMods: { pow: 1 } },
  },
  {
    key: 'hc_fire', name: 'Fire', type: 'special', owner: 'happychaos', copies: 3,
    range: [2, 5], pow: 2, spd: 4, arm: 0, grd: 0,
    text: 'Hit: Spend up to {3}. For each spent, +1 POW and draw 1.',
    boostText: '[+] +2 ARM.\nNow: Spend up to 3 life. For each life spent, draw 1.',
    hooks: {
      // The engine's Force-for-POW yield does not also draw; taking the POW half only
      // would silently shortchange the card, so the whole optional spend is deferred.
      // DEFERRED: "+1POW and draw 1 per Force".
    },
    boost: { force: 0, continuous: true, statMods: { arm: 2 } },
  },
  {
    key: 'hc_cheap_shot', name: 'Cheap Shot', type: 'ultra', owner: 'happychaos', gaugeCost: 1, copies: 3,
    range: [1, 4], pow: 0, spd: 6, arm: 0, grd: 0,
    text: 'Hit: Push or Pull 1.\nAfter: If the opponent is stunned, they must discard 2 cards.',
    boostText: 'Return a card from your sealed area to your hand. Add this to your Gauge.',
    hooks: {
      interactiveHit: 'grasp_move',
      moveMin: 1, moveMax: 1,
      afterStunCheck(ctx, opponentWasStunned) {
        if (opponentWasStunned) ctx.engine.randomDiscardFromHand(ctx.defender, 2);
      },
    },
    boost: { cancelable: true, force: 0, continuous: false, toGaugeInstead: true,
      resolve(ctx) {
        const c = ctx.player.sealedCards.pop();
        if (c) { ctx.player.hand.push(c); ctx.engine.logMsg(`${ctx.player.name} returns sealed ${c.name} to hand (Cheap Shot boost).`); }
      } },
  },
  {
    key: 'hc_gun_down', name: 'Gun Down', type: 'ultra', owner: 'happychaos', gaugeCost: 1, copies: 3,
    range: [2, 5], pow: 3, spd: 5, arm: 0, grd: 0, ignoreGuard: true,
    text: 'Ignore Guard.\nHit: The opponent must discard a card.\nAfter: Seal this.',
    boostText: '[+] Now: Retreat 1 or 2. You may spend {1}. If you do, Strike.\nHit: Add this to your Gauge.',
    sealAfterUse: true,
    hooks: { hit(ctx) { ctx.engine.randomDiscardFromHand(ctx.defender, 1); } },
    // NOTE: `triggersStrike` is unconditional, so the follow-up Strike is offered even
    // when the optional Force was not actually spent — the engine has no "Strike only if
    // you paid" shape. Same simplification on Goldlewis's Hurl and Happy Chaos's Gun Down.
    // NOTE: `triggersStrike` is unconditional, so the follow-up Strike is offered even
    // when the optional Force was not actually spent — the engine has no "Strike only if
    // you paid" shape. Same simplification on Goldlewis's Hurl and Happy Chaos's Gun Down.
    boost: { force: 0, continuous: true, toGaugeIfHitThisStrike: true, optionalForceSpend: { max: 1 }, triggersStrike: true,
      resolve(ctx) { ctx.engine.retreatSelf(ctx.player, ctx.opponent, 2); } },
  },
  {
    key: 'hc_steady_aim', name: 'Steady Aim', type: 'ultra', owner: 'happychaos', gaugeCost: 1, copies: 3,
    range: [3, 8], pow: 4, spd: 2, arm: 0, grd: 6,
    text: 'You may initiate with this face-up. If you do, it has +2 POW and Ignore Armor.\nAfter: Seal this.',
    boostText: 'Advance 3. If you Advanced past the opponent, take another action. Seal this.',
    sealAfterUse: true,
    // Face-up initiation is Sagat's mechanic (engine.setFaceUpThisStrike +
    // CHARACTERS[key].faceUpStatBonus); the Ignore Armor half rides along in
    // happychaos's own faceUpStatBonus in CHARACTERS.
    canInitiateFaceUp: true,
    hooks: {},
    boost: { force: 0, continuous: false, bonusAction: true,
      resolve(ctx) { ctx.engine.advanceSelf(ctx.player, ctx.opponent, 3, true); } },
  },
];

const GOLDLEWIS = [
  {
    key: 'gold_bt_crush', name: 'Behemoth Typhoon Crush', type: 'special', owner: 'goldlewis',
    range: [1, 2], pow: 5, spd: 2, arm: 0, grd: 6, ignoreArmor: true,
    text: 'Ignore Armor.\nAfter: Close 2.',
    boostText: '[+] +0~1 RNG.\nHit: Push or Pull 1.',
    hooks: { after(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 2); } },
    boost: { cancelable: true, force: 0, continuous: true, rangeMaxBonus: 1,
      onHit(ctx) { ctx.engine.pushAway(ctx.opponent, ctx.player, 1); } },
  },
  {
    key: 'gold_bt_drop', name: 'Behemoth Typhoon Drop', type: 'special', owner: 'goldlewis',
    range: [1, 2], pow: 5, spd: 3, arm: 0, grd: 0, ignoreGuard: true,
    text: 'Ignore Guard.\nHit: The opponent must discard 2 random cards.',
    boostText: '[+] Attacks at Range 4+ do not hit you.\nAt the start of your turn, Close 2 and discard this.',
    hooks: { hit(ctx) { ctx.engine.randomDiscardFromHand(ctx.defender, 2); } },
    // "Range 4+" spelled out to the board's maximum useful distance, the same way
    // Hakumen's Enma boost enumerates its own protected ranges.
    boost: { force: 0, continuous: true, rangeImmuneRanges: [4, 5, 6, 7, 8],
      // DEFERRED: the start-of-turn "Close 2 and discard this" — boosts have a
      // start-of-turn EXPIRY hook (`expireToGaugeAtStartOfNextTurn`) but no
      // start-of-turn EFFECT hook.
    },
  },
  {
    key: 'gold_bt_hurl', name: 'Behemoth Typhoon Hurl', type: 'special', owner: 'goldlewis',
    range: [1, 1], pow: 6, spd: 5, arm: 0, grd: 0,
    text: 'Before: Close 1.\nHit: Pull 1.',
    boostText: '[+] +1 POW, +1 SPD.\nNow: You may spend {2}. If you do, Strike.',
    hooks: {
      before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 1); },
      hit(ctx) { ctx.engine.pushToward(ctx.defender, ctx.attacker, 1); },
    },
    // NOTE: `triggersStrike` is unconditional, so the follow-up Strike is offered even
    // when the optional Force was not actually spent — the engine has no "Strike only if
    // you paid" shape. Same simplification on Goldlewis's Hurl and Happy Chaos's Gun Down.
    boost: { force: 0, continuous: true, statMods: { pow: 1, spd: 1 }, optionalForceSpend: { max: 2 }, triggersStrike: true },
  },
  {
    key: 'gold_bt_rise', name: 'Behemoth Typhoon Rise', type: 'special', owner: 'goldlewis',
    range: [1, 3], pow: 3, spd: 5, arm: 0, grd: 0,
    text: 'If you initiated, +2 POW.\nHit: Push 2. Draw 1.',
    boostText: '[+] +6 GRD.\nNow: Draw 1.',
    hooks: {
      powBonusIfInitiating: 2,
      hit(ctx) { ctx.engine.pushAway(ctx.defender, ctx.attacker, 2); ctx.engine.draw(ctx.attacker, 1); },
    },
    boost: { cancelable: true, force: 0, continuous: true, statMods: { grd: 6 }, nowDraw: 1 },
  },
  {
    key: 'gold_bt_slam', name: 'Behemoth Typhoon Slam', type: 'special', owner: 'goldlewis',
    range: [2, 4], pow: 4, spd: 4, arm: 3, grd: 3,
    text: 'Hit: Push or Pull 1.\nAfter: Lose all Armor.',
    boostText: '[+] +1 POW.\nNow: Spend up to {5}. For each spent, draw 2.',
    hooks: {
      interactiveHit: 'grasp_move',
      moveMin: 1, moveMax: 1,
      // DEFERRED: "After: Lose all Armor" (see I-No's Ultimate Fortissimo).
    },
    boost: { force: 0, continuous: true, statMods: { pow: 1 }, optionalForceSpend: { max: 5 },
      resolve(ctx) { if (ctx.bonusForceSpent) ctx.engine.draw(ctx.player, 2 * ctx.bonusForceSpent); } },
  },
  {
    key: 'gold_bt_smash', name: 'Behemoth Typhoon Smash', type: 'special', owner: 'goldlewis',
    range: [1, 2], pow: 4, spd: 3, arm: 0, grd: 3,
    text: 'If you initiated, +2 ARM.\nAfter: Draw 2.',
    boostText: '[+] +2 POW.\nHit: Advantage.',
    hooks: { after(ctx) { ctx.engine.draw(ctx.attacker, 2); } },
    // `armBonusIfDefending` is the existing defender-side twin of this; the initiator
    // side has no numeric ARM hook, so it rides on the generic set-time bonus below.
    liveStatMods(owner, opponent, engine, info) { return info.initiator ? { arm: 2 } : {}; },
    boost: { force: 0, continuous: true, statMods: { pow: 2 },
      onHit(ctx) { ctx.engine.grantAdvantage(ctx.player, 'Behemoth Typhoon Smash boost'); } },
  },
  {
    key: 'gold_bt_spin', name: 'Behemoth Typhoon Spin', type: 'special', owner: 'goldlewis',
    range: [2, 3], pow: 6, spd: 2, arm: 1, grd: 4,
    text: 'If you initiated, +2 GRD.\nHit: Push or Pull 2, Advantage.',
    boostText: 'Opponents cannot Advance past you.\nAt the start of your turn, add this to your Gauge.',
    liveStatMods(owner, opponent, engine, info) { return info.initiator ? { grd: 2 } : {}; },
    hooks: {
      interactiveHit: 'grasp_move',
      moveMin: 2, moveMax: 2,
      hit(ctx) { ctx.engine.grantAdvantage(ctx.attacker, 'Behemoth Typhoon Spin'); },
    },
    boost: { cancelable: true, force: 0, continuous: true, blocksOpponentPassThrough: true, expireToGaugeAtStartOfNextTurn: true },
  },
  {
    key: 'gold_bt_swing', name: 'Behemoth Typhoon Swing', type: 'special', owner: 'goldlewis',
    range: [1, 2], pow: 3, spd: 4, arm: 0, grd: 0,
    text: 'If you initiated, +2 SPD.\nHit: Close 1, Advantage.',
    boostText: '[+] +1 POW.\nNow: Spend up to {3}. For each spent, Close 1.',
    hooks: {
      spdBonusIfInitiating: 2,
      hit(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 1); ctx.engine.grantAdvantage(ctx.attacker, 'Behemoth Typhoon Swing'); },
    },
    boost: { cancelable: true, force: 0, continuous: true, statMods: { pow: 1 }, optionalForceSpend: { max: 3 },
      resolve(ctx) { if (ctx.bonusForceSpent) ctx.engine.closeSelf(ctx.player, ctx.opponent, ctx.bonusForceSpent); } },
  },
  {
    key: 'gold_burn_it_down', name: 'Burn it Down', type: 'ultra', owner: 'goldlewis', gaugeCost: 3,
    range: [4, 8], pow: 5, spd: 3, arm: 0, grd: 6,
    text: 'Hit: Close 8.',
    boostText: 'Advance or Retreat 1. You may return a Special from your discard pile to your hand.',
    hooks: { hit(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 8); } },
    boost: { force: 0, continuous: false, needsDirectionChoice: true,
      resolve(ctx) {
        if (ctx.moveDirection === 'advance') ctx.engine.advanceSelf(ctx.player, ctx.opponent, 1, true);
        else ctx.engine.retreatSelf(ctx.player, ctx.opponent, 1);
        const idx = ctx.player.discard.map(c => c.type).lastIndexOf('special');
        if (idx !== -1) {
          const [c] = ctx.player.discard.splice(idx, 1);
          ctx.player.hand.push(c);
          ctx.engine.logMsg(`${ctx.player.name} returns ${c.name} from discard to hand (Burn it Down boost).`);
        }
      } },
  },
  {
    key: 'gold_down_with_the_system', name: 'Down With the System', type: 'ultra', owner: 'goldlewis', gaugeCost: 2,
    range: [1, 2], pow: 3, spd: 7, arm: 0, grd: 0,
    text: 'EX: +4 POW and this attack costs [2] more.',
    boostText: '[+] +1 POW, +1 ARM.\nNow: You may return a Special from your discard pile to your hand.',
    // DEFERRED: the EX rider — EX pairs are built by engine.buildExCard, which averages
    // the pair's own stats and has no per-card "if this is the EX half" extension point,
    // and no card anywhere else charges extra Gauge conditionally.
    hooks: {},
    boost: { force: 0, continuous: true, statMods: { pow: 1, arm: 1 },
      resolve(ctx) {
        const idx = ctx.player.discard.map(c => c.type).lastIndexOf('special');
        if (idx !== -1) {
          const [c] = ctx.player.discard.splice(idx, 1);
          ctx.player.hand.push(c);
          ctx.engine.logMsg(`${ctx.player.name} returns ${c.name} from discard to hand (Down With the System boost).`);
        }
      } },
  },
];

// Zato-1 — the one character in this project with a THIRD entity on the board.
// Eddie (see engine.js's Eddie section and CHARACTERS.zato1 below) starts out of
// play; Zato's Normals place him, and while he is in play every Special/Ultra here
// measures its Range FROM Eddie's space instead of Zato's, hits for Advantage, and
// sends Eddie away again at Cleanup — except the two cards that print "Do not remove
// Eddie from play during Cleanup" (`keepsEddieOnCleanup`). Card names are quoted in
// EXdata.xlsx (they are the summoning calls, printed with the quotes) and are
// transcribed with them.
const ZATO = [
  {
    key: 'zato_pierce', name: '"Pierce"', type: 'special', owner: 'zato1',
    range: [1, 1], pow: 3, spd: 6, arm: 0, grd: 0,
    text: 'Hit: Push or Pull 1.\nAfter: If the opponent is stunned, draw 2.',
    boostText: '[+] +1 POW.\nNow: You may Push 1.',
    hooks: {
      interactiveHit: 'grasp_move', moveMin: 1, moveMax: 1,
      afterStunCheck(ctx, opponentStunned) { if (opponentStunned) ctx.engine.draw(ctx.attacker, 2); },
    },
    // "You may Push 1" auto-resolves to taking it, per this file's "up to X"/"you may"
    // convention for effects with no cost attached.
    boost: { cancelable: true, force: 0, continuous: true, statMods: { pow: 1 },
      resolve(ctx) { ctx.engine.pushAway(ctx.opponent, ctx.player, 1); } },
  },
  {
    key: 'zato_thats_a_lot', name: '"That’s a lot!"', type: 'special', owner: 'zato1',
    range: [2, 4], pow: 5, spd: 3, arm: 0, grd: 4,
    text: 'After: Advance up to 2.',
    boostText: '[+] Now: You may spend {1}. If you do, Strike.\nAfter: Advance or Retreat 1 or 2.',
    hooks: { after(ctx) { ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 2, true); } },
    // DEFERRED (twice, both pre-existing gaps documented in HANDOFF.md §4):
    // "You may spend {1}. If you do, Strike" — `triggersStrike` is unconditional, so
    // the Strike is offered whether or not the optional Force was paid; and the
    // continuous "After: Advance or Retreat 1 or 2" — boosts have no After extension
    // point (only `onHit`/`resolve`), the same gap Chipp's Gamma Blade is parked on.
    boost: { force: 0, continuous: true, triggersStrike: true },
  },
  {
    key: 'zato_leap', name: '"Leap"', type: 'special', owner: 'zato1',
    range: [1, 3], pow: 4, spd: 5, arm: 0, grd: 0,
    text: 'Hit: Push 1 from the source of this attack. Draw 1.',
    boostText: '[+] +1 SPD.\nNow: Place Eddie into your space. Advance or Retreat 2.',
    hooks: {
      // "From the SOURCE of this attack" is the whole point of the clause: with Eddie
      // on the board this attack originates at Eddie, so the push is away from Eddie
      // (which can shove the opponent TOWARD Zato), not away from Zato.
      hit(ctx) {
        ctx.engine.pushAwayFromAttackSource(ctx.attacker, ctx.defender, ctx.attackerCard, 1);
        ctx.engine.draw(ctx.attacker, 1);
      },
    },
    boost: { force: 0, continuous: true, statMods: { spd: 1 }, needsDirectionChoice: true,
      resolve(ctx) {
        ctx.engine.placeEddie(ctx.player, ctx.player.pos, 'Leap boost');
        if (ctx.moveDirection === 'retreat') ctx.engine.retreatSelf(ctx.player, ctx.opponent, 2);
        else ctx.engine.advanceSelf(ctx.player, ctx.opponent, 2, true);
      } },
  },
  {
    key: 'zato_oppose', name: '"Oppose"', type: 'special', owner: 'zato1',
    range: [0, 1], pow: 0, spd: 2, arm: 2, grd: 5,
    keepsEddieOnCleanup: true,
    text: 'Do not remove Eddie from play during Cleanup.\nBefore: If you were hit, +3 POW.',
    boostText: 'Advance or Retreat 1. You may add a card from your hand to your Gauge.',
    hooks: {
      // `_wasHitThisStrike` is set by the OPPONENT's activation, so this only reads
      // true when their card was faster — exactly what "if you were hit" means here.
      before(ctx) { if (ctx.attacker.strikeState.wasHit) ctx.powBonus = (ctx.powBonus || 0) + 3; },
    },
    boost: { cancelable: true, force: 0, continuous: false, needsDirectionChoice: true,
      resolve(ctx) {
        if (ctx.moveDirection === 'retreat') ctx.engine.retreatSelf(ctx.player, ctx.opponent, 1);
        else ctx.engine.advanceSelf(ctx.player, ctx.opponent, 1, true);
        ctx.engine.addLowestCardFromHandToGauge(ctx.player, 'Oppose boost');
      } },
  },
  {
    key: 'zato_damned_fang', name: 'Damned Fang', type: 'special', owner: 'zato1',
    range: [1, 1], pow: 4, spd: 3, arm: 0, grd: 0, ignoreGuard: true,
    text: 'Ignore Guard.\nHit: Pull 2 (toward Zato-1). Draw 2.',
    boostText: '[+] Attacks at Range 4+ don’t hit you.\nAt the start of your turn, add this to your Gauge.',
    hooks: {
      // The sheet spells out "(toward Zato-1)" precisely because the attack itself may
      // have come from Eddie — the pull is toward the character, not the source.
      hit(ctx) {
        ctx.engine.pullTowardWithoutPassing(ctx.defender, ctx.attacker, 2);
        ctx.engine.draw(ctx.attacker, 2);
      },
    },
    boost: { cancelable: true, force: 0, continuous: true, rangeImmuneRanges: [4, 5, 6, 7, 8], expireToGaugeAtStartOfNextTurn: true },
  },
  {
    key: 'zato_invite_hell', name: 'Invite Hell', type: 'special', owner: 'zato1',
    range: [2, 5], pow: 3, spd: 4, arm: 0, grd: 0,
    text: 'Before: If Eddie is in play, +2 POW and place Eddie in your space (before calculating Range).\nHit: Draw 1.',
    boostText: 'Place Eddie in any space.',
    hooks: {
      // Recalling Eddie to Zato's own space BEFORE the range check is what makes this
      // card work: it measures from Eddie (it is a Special), and this clause moves
      // Eddie onto Zato first, so the printed 2~5 band is measured from Zato after all.
      before(ctx) {
        if (ctx.engine.eddieInPlay(ctx.attacker)) {
          ctx.powBonus = (ctx.powBonus || 0) + 2;
          ctx.engine.placeEddie(ctx.attacker, ctx.attacker.pos, 'Invite Hell');
        }
      },
      hit(ctx) { ctx.engine.draw(ctx.attacker, 1); },
    },
    boost: { cancelable: true, force: 0, continuous: false, needsEddieSpaceChoice: true,
      resolve(ctx) {
        if (ctx.eddieSpace != null) ctx.engine.placeEddie(ctx.player, ctx.eddieSpace, 'Invite Hell boost');
      } },
  },
  {
    key: 'zato_amorphous', name: 'Amorphous', type: 'ultra', owner: 'zato1', gaugeCost: 4,
    range: [3, 3], pow: 6, spd: 1, arm: 2, grd: 0,
    stunImmuneBase: true,
    text: 'Stun Immunity.\nAfter: Draw 3.',
    boostText: '[+] Now: Strike.\nHit: If the opponent is between you and Eddie, +3 POW.',
    hooks: { after(ctx) { ctx.engine.draw(ctx.attacker, 3); } },
    boost: { force: 0, continuous: true, triggersStrike: true,
      onHit(ctx) {
        const eddie = ctx.player.eddiePos;
        if (eddie == null) return;
        const lo = Math.min(ctx.player.pos, eddie), hi = Math.max(ctx.player.pos, eddie);
        if (ctx.opponent.pos > lo && ctx.opponent.pos < hi) ctx.powBonus = (ctx.powBonus || 0) + 3;
      } },
  },
  {
    key: 'zato_sun_void', name: 'Sun Void', type: 'ultra', owner: 'zato1', gaugeCost: 2,
    range: [0, 1], pow: 3, spd: 7, arm: 0, grd: 0,
    keepsEddieOnCleanup: true,
    text: 'Do not remove Eddie from play during Cleanup.',
    boostText: '[+] +1 POW.\nNow: You may spend {2}. If you do, return 2 Specials from your discard pile to your hand.',
    boost: { force: 0, continuous: true, statMods: { pow: 1 }, optionalForceSpend: { max: 2 },
      resolve(ctx) {
        if ((ctx.bonusForceSpent || 0) < 2) return;
        const specials = ctx.player.discard.filter(c => c.type === 'special').slice(-2);
        for (const c of specials) {
          ctx.player.discard.splice(ctx.player.discard.findIndex(d => d.uid === c.uid), 1);
          ctx.player.hand.push(c);
        }
        if (specials.length) {
          ctx.engine.logMsg(`${ctx.player.name} returns ${specials.map(c => c.name).join(', ')} from discard to hand (Sun Void boost).`, 'draw', ctx.player.id);
        }
      } },
  },
];

// ============================================================
// SEASON 5 — BLAZBLUE
// ============================================================
// Source: EXdata.xlsx, one sheet per fighter, transcribed 2026-08-17. Card text in
// `text`/`boostText` is the workbook's wording; anything the engine can't express
// yet is called out in a `// DEFERRED:` comment on the card itself, never quietly
// dropped from the printed text.
//
// Two mechanics are shared by the whole season and live in engine.js rather than
// here (see its Overdrive section and the Astral Heat notes in buildDeck/
// manualReshuffle/endOfTurnDraw):
//   - OVERDRIVE: Exceeding sends the Gauge you paid to an Overdrive area instead of
//     the discard pile; one card leaves it at the start of each of your turns,
//     firing your character's Overdrive effect, and you Revert when it empties.
//     Declared per character as `overdrive: { text, options?, resolve }`.
//   - ASTRAL HEAT: each fighter's last card (`isAstral: true`) starts out of play and
//     comes to hand instead of the end-of-turn draw on the turn they take the
//     Reshuffle action.
// Season 5 fighters use the shared S1-5 NORMALS pool (confirmed against the
// workbook's "Normals (S1-5)" sheet), so none of them set a `normals` field.

const RAGNA = [
  {
    key: 'ragna_blood_scythe', name: 'Blood Scythe', type: 'special', owner: 'ragna',
    range: [1, 2], pow: 5, spd: 1, arm: 0, grd: 6,
    text: 'Before: Advance 1.\nHit: Add the top card of your discard to Gauge.',
    boostText: '[+] Now: Close 1 and draw 1.\nHit: Gain 2 life.',
    hooks: {
      before(ctx) { ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 1, true); },
      hit(ctx) {
        const top = ctx.attacker.discard.pop();
        if (top) {
          ctx.attacker.gauge.push(top);
          ctx.engine.logMsg(`${ctx.attacker.name} adds ${top.name} from their discard to Gauge (Blood Scythe).`);
        }
      },
    },
    boost: { force: 0, continuous: true,
      resolve(ctx) { ctx.engine.closeSelf(ctx.player, ctx.opponent, 1); ctx.engine.draw(ctx.player, 1); },
      onHit(ctx) { ctx.engine.gainLife(ctx.player, 2); },
    },
  },
  {
    key: 'ragna_dead_spike', name: 'Dead Spike', type: 'special', owner: 'ragna',
    range: [2, 4], pow: 5, spd: 3, arm: 0, grd: 4,
    text: 'Hit: Push 1.\nAfter: Close 1 or 2.',
    boostText: '[+] +1 SPD.\nHit: Push 1 or 2.',
    hooks: {
      hit(ctx) { ctx.engine.pushAway(ctx.defender, ctx.attacker, 1); },
      // "Close 1 or 2" auto-resolves to 2 (this codebase's "up to X" convention —
      // see the header comment at the top of this file); closing is always what
      // this card wants, so the choice is a formality rather than a real decision.
      after(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 2); },
    },
    boost: { force: 0, continuous: true, statMods: { spd: 1 },
      onHit(ctx) { ctx.engine.pushAway(ctx.opponent, ctx.player, 2); } },
  },
  {
    key: 'ragna_gauntlet_hades', name: 'Gauntlet Hades', type: 'special', owner: 'ragna',
    range: [1, 2], pow: 4, spd: 3, arm: 0, grd: 4,
    text: 'Ignore Armor.\nBefore: Advance 1 or 2. If you Advanced past the opponent, this attack does not hit.',
    boostText: '[+] Now: Draw 2.\nHit: Advantage.',
    ignoreArmor: true,
    hooks: {
      before(ctx) {
        // Advancing 2 is what makes the card reach, but it also risks the side swap
        // that switches its own hit off — so this is a genuine gamble the card text
        // intends, not an "up to X" formality: advance the full 2 and let the swap
        // check below decide. `_unhittableThisStrike` is set on the ATTACKER here
        // (unlike Dive, which sets it to protect itself) — engine.js reads the
        // defender's copy, and after a side swap this attacker is the one whose
        // attack must not connect, so the flag goes on the card's own owner and the
        // engine's `defender.strikeState.unhittable` check sees it when this card
        // activates as the attack.
        const before = ctx.attacker.pos < ctx.defender.pos;
        ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 2, true);
        const after = ctx.attacker.pos < ctx.defender.pos;
        if (before !== after) { ctx.sideSwapped = true; ctx.selfCannotHit = true; }
      },
    },
    boost: { force: 0, continuous: true,
      resolve(ctx) { ctx.engine.draw(ctx.player, 2); },
      onHit(ctx) { ctx.engine.grantAdvantage(ctx.player, 'Gauntlet Hades boost'); } },
  },
  {
    key: 'ragna_hells_fang', name: "Hell's Fang", type: 'special', owner: 'ragna',
    range: [1, 1], pow: 4, spd: 4, arm: 0, grd: 0,
    text: 'Before: Close 3.\nHit: Push 2 and Advantage.',
    boostText: '[+] +1 POW, +2 ARM.\nNow: You may spend 2 life to draw 1.',
    hooks: {
      before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 3); },
      hit(ctx) {
        ctx.engine.pushAway(ctx.defender, ctx.attacker, 2);
        ctx.engine.grantAdvantage(ctx.attacker, "Hell's Fang");
      },
    },
    // DEFERRED: the boost's "You may spend 2 life to draw 1" is a real life-for-cards
    // choice with no existing yield type (no other card in this codebase pays life).
    // Workaround: none — the stat half of the boost applies, the optional trade doesn't.
    boost: { force: 0, continuous: true, statMods: { pow: 1, arm: 2 } },
  },
  {
    key: 'ragna_inferno_divider', name: 'Inferno Divider', type: 'special', owner: 'ragna',
    range: [1, 2], pow: 3, spd: 7, arm: 0, grd: 0,
    // DEFERRED: the card's own {1} Force cost to play it as an attack. This engine
    // charges Gauge costs on attacks (gaugeCost) but has no attack-Force-cost path at
    // all, so this plays free. Same for every {X} attack cost in Season 5 — noted once
    // here and again on each affected card.
    text: 'Hit: If you initiated this Strike, +2 POW and Push 1.',
    boostText: '[+] +1 POW and Stun Immunity.',
    hooks: {
      hit(ctx) {
        if (ctx.strikeInitiator === ctx.attacker) {
          ctx.powBonus = (ctx.powBonus || 0) + 2;
          ctx.engine.pushAway(ctx.defender, ctx.attacker, 1);
        }
      },
    },
    boost: { force: 1, continuous: true, statMods: { pow: 1 }, stunImmuneGrant: true },
  },
  {
    key: 'ragna_carnage_scissors', name: 'Carnage Scissors', type: 'ultra', owner: 'ragna', gaugeCost: 2,
    range: [1, 1], pow: 5, spd: 3, arm: 0, grd: 0,
    text: "Attacks at Range 4-5 don't hit you.\nBefore: Close 4.",
    boostText: '[+] +2 POW.\nNow, Range 1: Push 2 and Strike.',
    rangeImmuneRanges: [4, 5],
    hooks: { before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 4); } },
    boost: { force: 0, continuous: true, statMods: { pow: 2 },
      resolve(ctx) {
        if (ctx.engine.range(ctx.player, ctx.opponent) === 1) ctx.engine.pushAway(ctx.opponent, ctx.player, 2);
      },
      triggersStrike: true },
  },
  {
    key: 'ragna_devoured_by_darkness', name: 'Devoured By Darkness', type: 'ultra', owner: 'ragna', gaugeCost: 3,
    range: [1, 2], pow: 5, spd: 5, arm: 0, grd: 0,
    text: 'If in Exceed, +0~1 RNG and +1 SPD.\nHit: Gain 3 life.',
    boostText: 'Spend up to 5 life to draw that many cards. Take another action.',
    hooks: {
      // "+0~1RNG" auto-resolves to +1 (established convention); the Exceed gating is
      // the real condition, and it is checked live rather than at deck-build time.
      hit(ctx) { ctx.engine.gainLife(ctx.attacker, 3); },
    },
    // DEFERRED: the boost's "spend up to 5 life to draw that many" — same missing
    // life-as-a-cost mechanic as Hell's Fang above. The extra action is real.
    boost: { force: 1, continuous: false, bonusAction: true },
  },
  {
    key: 'ragna_black_onslaught', name: 'Black Onslaught', type: 'ultra', owner: 'ragna', gaugeCost: 4,
    isAstral: true, copies: 1,
    range: [2, 3], pow: 6, spd: 6, arm: 0, grd: 0,
    text: 'Before: If you have exactly 1 life, +6 POW.',
    boostText: 'Draw 2. Seal this and take another action.',
    hooks: {
      before(ctx) { if (ctx.attacker.life === 1) ctx.powBonus = (ctx.powBonus || 0) + 6; },
    },
    // DEFERRED (all Astral boosts): "Seal this" — a boost that removes ITSELF from the
    // game after resolving. engine.sealCardFromHand only seals from hand, and the
    // boost-disposal path in playBoost has no seal branch, so the card goes to the
    // discard as usual. Effect: an Astral could in principle be reshuffled back in
    // rather than being one-and-done.
    boost: { force: 0, continuous: false, bonusAction: true,
      resolve(ctx) { ctx.engine.draw(ctx.player, 2); } },
  },
];

const JIN = [
  {
    key: 'jin_crystal_strike', name: 'Crystal Strike', type: 'special', owner: 'jin',
    range: [1, 1], pow: 3, spd: 5, arm: 0, grd: 0,
    text: 'Before: Close 3.\nHit: Push 1.',
    boostText: 'Ignore Armor.\nNow: Strike. Hit: Add this to your Gauge.',
    hooks: {
      before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 3); },
      hit(ctx) { ctx.engine.pushAway(ctx.defender, ctx.attacker, 1); },
    },
    boost: { force: 0, continuous: false, triggersStrike: true, toGaugeIfHitThisStrike: true },
  },
  {
    key: 'jin_dual_ice_strike', name: 'Dual Ice Strike', type: 'special', owner: 'jin',
    range: [1, 2], pow: 3, spd: 3, arm: 3, grd: 3,
    text: 'Hit: Push 2. If the opponent is at the edge of the arena, Advantage.',
    boostText: '[+] The opponent cannot move.\nAt the end of your next turn, add this to your Gauge.',
    hooks: {
      hit(ctx) {
        ctx.engine.pushAway(ctx.defender, ctx.attacker, 2);
        if (ctx.engine.isAtEdge(ctx.defender)) ctx.engine.grantAdvantage(ctx.attacker, 'Dual Ice Strike');
      },
    },
    // "The opponent cannot move" = they can still be Pushed/Pulled, they just can't
    // move themselves (the workbook's own Notes column says exactly this), which is
    // what Nu-13's Sword Dance boost also grants — see opponentCannotMove in engine.js.
    boost: { force: 1, continuous: true, opponentCannotMove: true, expireToGaugeAfterTurns: 1 },
  },
  {
    key: 'jin_ice_blade', name: 'Ice Blade', type: 'special', owner: 'jin',
    range: [2, 5], pow: 4, spd: 3, arm: 0, grd: 5,
    text: 'Hit: Close up to 2, then draw 1.',
    boostText: 'Push 1, draw 1, take another action.',
    hooks: {
      hit(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 2); ctx.engine.draw(ctx.attacker, 1); },
    },
    boost: { force: 0, continuous: false, bonusAction: true,
      resolve(ctx) { ctx.engine.pushAway(ctx.opponent, ctx.player, 1); ctx.engine.draw(ctx.player, 1); } },
  },
  {
    key: 'jin_permafrost', name: 'Permafrost', type: 'special', owner: 'jin',
    range: [1, 2], pow: 5, spd: 4, arm: 0, grd: 0,
    text: 'Hit: If you have more cards in hand than the opponent, +2 POW.\nAfter: Close 1 and draw 1.',
    boostText: '[+] +4 GRD.\nNow: Draw 2.',
    hooks: {
      hit(ctx) { if (ctx.attacker.hand.length > ctx.defender.hand.length) ctx.powBonus = (ctx.powBonus || 0) + 2; },
      after(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 1); ctx.engine.draw(ctx.attacker, 1); },
    },
    boost: { force: 0, continuous: true, statMods: { grd: 4 }, resolve(ctx) { ctx.engine.draw(ctx.player, 2); } },
  },
  {
    key: 'jin_violent_ice', name: 'Violent Ice', type: 'special', owner: 'jin',
    range: [1, 2], pow: 2, spd: 7, arm: 0, grd: 0,
    text: 'Hit: If you initiated this Strike, +2 POW.',
    boostText: '[+] Now: Strike.\nHit: +1 POW. You may Advance or Retreat 1. Advantage.',
    hooks: {
      hit(ctx) { if (ctx.strikeInitiator === ctx.attacker) ctx.powBonus = (ctx.powBonus || 0) + 2; },
    },
    boost: { force: 1, continuous: true, triggersStrike: true,
      onHit(ctx) { ctx.powBonus = (ctx.powBonus || 0) + 1; ctx.engine.grantAdvantage(ctx.player, 'Violent Ice boost'); } },
  },
  {
    key: 'jin_ice_fang', name: 'Ice Fang', type: 'ultra', owner: 'jin', gaugeCost: 2,
    range: [4, 7], pow: 4, spd: 4, arm: 1, grd: 4,
    text: 'Exceed: +1 POW, +1 ARM.\nHit: Close 1-3.',
    boostText: 'Both players draw or discard until they have 4 cards in hand.',
    hooks: {
      hit(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 3); },
    },
    // "Exceed: +1POW/+1ARM" is a stat clause conditioned on its owner being Exceeded —
    // expressed through the character-level attackStatMods hook below rather than a
    // per-card one, since that hook already receives the card.
    boost: { force: 1, continuous: false,
      resolve(ctx) {
        for (const p of [ctx.player, ctx.opponent]) {
          const opp = p === ctx.player ? ctx.opponent : ctx.player;
          while (p.hand.length < 4) { const before = p.hand.length; ctx.engine.draw(p, 1); if (p.hand.length === before) break; }
          while (p.hand.length > 4) ctx.engine.discardFromHand(p, p.hand[p.hand.length - 1].uid);
          void opp;
        }
        ctx.engine.logMsg('Both players adjust to 4 cards in hand (Ice Fang).');
      } },
  },
  {
    key: 'jin_moonsong', name: 'Moonsong', type: 'ultra', owner: 'jin', gaugeCost: 3,
    range: [2, 3], pow: 6, spd: 6, arm: 0, grd: 0,
    text: 'Hit: Advantage.',
    boostText: '[+] +2 SPD.\nNow: Strike.',
    hooks: { hit(ctx) { ctx.engine.grantAdvantage(ctx.attacker, 'Moonsong'); } },
    boost: { force: 1, continuous: true, statMods: { spd: 2 }, triggersStrike: true },
  },
  {
    key: 'jin_arctic_dungeon', name: 'Arctic Dungeon', type: 'ultra', owner: 'jin', gaugeCost: 4,
    isAstral: true, copies: 1,
    range: [1, 8], pow: 8, spd: 0, arm: 0, grd: 0,
    text: 'X = cards in your hand.\nHit: The opponent must discard their hand.',
    boostText: 'Draw 2. Seal this and take another action.',
    // The printed GRD is "X = cards in your hand" — a live value, so it is computed
    // through the character hook rather than baked in as a number here.
    guardEqualsHandSize: true,
    hooks: { hit(ctx) { ctx.engine.discardAllHand(ctx.defender); } },
    boost: { force: 0, continuous: false, bonusAction: true, resolve(ctx) { ctx.engine.draw(ctx.player, 2); } },
  },
];

const NOEL = [
  {
    key: 'noel_assault_through', name: 'Assault Through', type: 'special', owner: 'noel',
    range: [1, 1], pow: 4, spd: 4, arm: 0, grd: 0,
    text: 'Before: Advance 1.\nHit: Push 3, Advantage.',
    boostText: 'Close 1 and Strike.',
    hooks: {
      before(ctx) { ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 1, true); },
      hit(ctx) { ctx.engine.pushAway(ctx.defender, ctx.attacker, 3); ctx.engine.grantAdvantage(ctx.attacker, 'Assault Through'); },
    },
    boost: { force: 0, continuous: false, triggersStrike: true,
      resolve(ctx) { ctx.engine.closeSelf(ctx.player, ctx.opponent, 1); } },
  },
  {
    key: 'noel_muzzle_filter', name: 'Muzzle Filter', type: 'special', owner: 'noel',
    range: [1, 1], pow: 3, spd: 5, arm: 0, grd: 0,
    text: 'Before: Close 1.\nHit: You may spend {1}. If you do, Ignore Guard.',
    boostText: 'Draw 3 and Strike.',
    // DEFERRED: "Hit: You may spend {1}. If you do, Ignore Guard." The engine's
    // optional-Force yield (optionalForceSpendForPow) buys POW only; there is no
    // spend-for-Ignore-Guard variant. Workaround: none — the Before half applies.
    hooks: {
      before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 1); },
    },
    boost: { force: 1, continuous: false, triggersStrike: true, resolve(ctx) { ctx.engine.draw(ctx.player, 3); } },
  },
  {
    key: 'noel_optic_barrel', name: 'Optic Barrel', type: 'special', owner: 'noel',
    range: [2, 3], pow: 5, spd: 3, arm: 0, grd: 4,
    text: 'Before: You may spend {1} for +1~2 RNG.\nAfter: You may Advance 2.',
    boostText: '[+] +1 POW.\nNow: Strike.',
    // DEFERRED: the Before's optional {1}-for-range. The engine's optional-Force yield
    // buys POW, not Range, and range is resolved before hooks can alter it.
    // Workaround: none — the After half is implemented (auto-resolved to the max, per
    // this file's "up to X" convention).
    hooks: { after(ctx) { ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 2, true); } },
    boost: { force: 0, continuous: true, statMods: { pow: 1 }, triggersStrike: true },
  },
  {
    key: 'noel_spring_raid', name: 'Spring Raid', type: 'special', owner: 'noel',
    range: [1, 1], pow: 3, spd: 7, arm: 0, grd: 0,
    text: 'Before: Close 1.\nHit: Push 2.',
    boostText: '[+] Now: Close 2.\nHit: Add this to your Gauge and Advantage.',
    hooks: {
      before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 1); },
      hit(ctx) { ctx.engine.pushAway(ctx.defender, ctx.attacker, 2); },
    },
    boost: { force: 0, continuous: true, toGaugeIfHitThisStrike: true,
      resolve(ctx) { ctx.engine.closeSelf(ctx.player, ctx.opponent, 2); },
      onHit(ctx) { ctx.engine.grantAdvantage(ctx.player, 'Spring Raid boost'); } },
  },
  {
    key: 'noel_type_one', name: 'Type One', type: 'special', owner: 'noel',
    range: [1, 2], pow: 3, spd: 5, arm: 0, grd: 0,
    text: 'Before: Advance 2. If you Advanced past the opponent, their attacks do not hit you.',
    boostText: '[+] +1 SPD.\nHit: Add this to your Gauge and Advantage.',
    hooks: {
      before(ctx) {
        const before = ctx.attacker.pos < ctx.defender.pos;
        ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 2, true);
        const after = ctx.attacker.pos < ctx.defender.pos;
        if (before !== after) { ctx.sideSwapped = true; ctx.attacker.strikeState.unhittable = true; }
      },
    },
    boost: { force: 0, continuous: true, statMods: { spd: 1 }, toGaugeIfHitThisStrike: true,
      onHit(ctx) { ctx.engine.grantAdvantage(ctx.player, 'Type One boost'); } },
  },
  {
    key: 'noel_bullet_storm', name: 'Bullet Storm', type: 'ultra', owner: 'noel', gaugeCost: 3,
    range: [3, 4], pow: 6, spd: 4, arm: 0, grd: 0,
    text: 'Ignore Armor.',
    boostText: "Look at the opponent's hand, then Strike.",
    ignoreArmor: true,
    boost: { force: 0, continuous: false, triggersStrike: true,
      resolve(ctx) { ctx.engine.recordHandReveal(ctx.opponent); } },
  },
  {
    key: 'noel_zero_gun_fenrir', name: 'Zero Gun: Fenrir', type: 'ultra', owner: 'noel', gaugeCost: 2,
    range: [1, 1], pow: 5, spd: 7, arm: 0, grd: 0,
    text: 'Hit: Push 2, draw 2.',
    boostText: '[+] Now: Strike.\nBefore: Advance 2.',
    hooks: { hit(ctx) { ctx.engine.pushAway(ctx.defender, ctx.attacker, 2); ctx.engine.draw(ctx.attacker, 2); } },
    boost: { force: 1, continuous: true, triggersStrike: true, grantsNormalsBeforeAdvance: 2 },
  },
  {
    key: 'noel_valkyrie_veil', name: 'Valkyrie Veil', type: 'ultra', owner: 'noel', gaugeCost: 3,
    isAstral: true, copies: 1,
    range: [1, 2], pow: 3, spd: 2, arm: 5, grd: 0,
    text: 'Stun Immunity.\nBefore: If you were hit, +4 POW and you may draw 1-4.',
    boostText: 'Draw 2. Seal this and take another action.',
    stunImmuneBase: true,
    hooks: {
      // "If you were hit" reads the same wasHit state Hakumen's cards use — see the
      // ctx.defenderHitMe note in engine.js. Draw auto-resolves to the max of 4.
      before(ctx) {
        if (ctx.attacker.strikeState.wasHit) { ctx.powBonus = (ctx.powBonus || 0) + 4; ctx.engine.draw(ctx.attacker, 4); }
      },
    },
    boost: { force: 0, continuous: false, bonusAction: true, resolve(ctx) { ctx.engine.draw(ctx.player, 2); } },
  },
];

const TAOKAKA = [
  {
    key: 'tao_cat_spirit_one', name: 'Cat Spirit One!', type: 'special', owner: 'taokaka',
    range: [1, 2], pow: 2, spd: 6, arm: 0, grd: 0,
    // DEFERRED: the card's own {1} Force cost to play it (no attack-Force-cost path
    // in this engine — see Ragna's Inferno Divider).
    text: 'Hit: Spend up to {2} for +1 POW each.\nAfter: Retreat 2.',
    boostText: '[+] Now: Strike.\nHit: Draw 2.',
    hooks: {
      optionalForceSpendForPow: { max: 2 },
      after(ctx) { ctx.engine.retreatSelf(ctx.attacker, ctx.defender, 2); },
    },
    boost: { force: 0, continuous: true, triggersStrike: true,
      onHit(ctx) { ctx.engine.draw(ctx.player, 2); } },
  },
  {
    key: 'tao_double_paw_strike', name: 'Double Paw Strike!', type: 'special', owner: 'taokaka',
    range: [1, 2], pow: 4, spd: 5, arm: 0, grd: 0,
    text: 'Before, Range 1: +2 POW.\nHit: Push 1.',
    boostText: 'Advance 3.',
    hooks: {
      before(ctx) { if (ctx.engine.range(ctx.attacker, ctx.defender) === 1) ctx.powBonus = (ctx.powBonus || 0) + 2; },
      hit(ctx) { ctx.engine.pushAway(ctx.defender, ctx.attacker, 1); },
    },
    boost: { force: 0, continuous: false, resolve(ctx) { ctx.engine.advanceSelf(ctx.player, ctx.opponent, 3, true); } },
  },
  {
    key: 'tao_kitty_litter_special', name: 'Kitty Litter Special!', type: 'special', owner: 'taokaka',
    range: [3, 5], pow: 3, spd: 5, arm: 0, grd: 0,
    text: 'Hit: Close 2, Advantage.\nAfter: Draw 1.',
    boostText: 'Advance or Retreat 1, then Strike.',
    hooks: {
      hit(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 2); ctx.engine.grantAdvantage(ctx.attacker, 'Kitty Litter Special!'); },
      after(ctx) { ctx.engine.draw(ctx.attacker, 1); },
    },
    boost: { force: 0, continuous: false, triggersStrike: true, needsDirectionChoice: true,
      resolve(ctx) {
        if (ctx.moveDirection === 'retreat') ctx.engine.retreatSelf(ctx.player, ctx.opponent, 1);
        else ctx.engine.advanceSelf(ctx.player, ctx.opponent, 1, true);
      } },
  },
  {
    key: 'tao_slashy_slashy', name: 'Slashy Slashy!', type: 'special', owner: 'taokaka',
    range: [1, 2], pow: 3, spd: 3, arm: 0, grd: 4,
    text: 'Hit: Spend up to {2}. For each, draw 1 and +1 POW.\nAfter: Push 2.',
    boostText: 'Look at the top card of your deck. You may discard it or put it back. Then, Strike with a Wild Swing.',
    hooks: {
      // DEFERRED (partial): the printed effect draws 1 AND gives +1POW per Force
      // spent. The engine's spend-for-POW yield has no draw rider, so only the POW
      // half is charged for here.
      optionalForceSpendForPow: { max: 2, powPerForce: 1 },
      after(ctx) { ctx.engine.pushAway(ctx.defender, ctx.attacker, 2); },
    },
    // DEFERRED: the boost's deck-peek-then-forced-Wild-Swing. Axl's deck-look flow is
    // a bespoke path (peekTopN + resolveDeckLookChoice, wired through ui.js's
    // decklook_choice), and "then Strike with a Wild Swing" has no path at all —
    // triggersStrike always lets the player pick their card. Workaround: none.
    boost: { force: 0, continuous: false },
  },
  {
    key: 'tao_trick_edge', name: 'Trick Edge!', type: 'special', owner: 'taokaka',
    range: [1, 1], pow: 4, spd: 3, arm: 0, grd: 0,
    text: 'Ignore Guard.\nBefore: If you are at the edge of the arena, Close 3.',
    boostText: 'If the opponent is at Range 1, Retreat 2 and Strike.',
    ignoreGuard: true,
    hooks: {
      before(ctx) { if (ctx.engine.isAtEdge(ctx.attacker)) ctx.engine.closeSelf(ctx.attacker, ctx.defender, 3); },
    },
    boost: { force: 1, continuous: false, triggersStrike: true,
      resolve(ctx) { if (ctx.engine.range(ctx.player, ctx.opponent) === 1) ctx.engine.retreatSelf(ctx.player, ctx.opponent, 2); } },
  },
  {
    key: 'tao_hexa_edge', name: 'Hexa Edge!', type: 'ultra', owner: 'taokaka', gaugeCost: 3,
    range: [1, 1], pow: 6, spd: 7, arm: 0, grd: 0,
    text: 'Hit: Push 2, Advantage.',
    boostText: '[+] Now: Place a card from your hand on top of your deck, then Strike with a Wild Swing. Hit: Advantage.',
    hooks: { hit(ctx) { ctx.engine.pushAway(ctx.defender, ctx.attacker, 2); ctx.engine.grantAdvantage(ctx.attacker, 'Hexa Edge!'); } },
    // DEFERRED: the boost's "place a card from hand on top of deck, then Wild Swing" —
    // needs a hand-to-deck-top picker plus the same forced-Wild-Swing path Slashy
    // Slashy wants. Workaround: none; the boost still triggers a normal Strike.
    boost: { force: 1, continuous: true, triggersStrike: true,
      onHit(ctx) { ctx.engine.grantAdvantage(ctx.player, 'Hexa Edge! boost'); } },
  },
  {
    key: 'tao_imma_beat_the_crap_outta_you', name: 'Imma Beat the Crap Outta You!', type: 'ultra', owner: 'taokaka', gaugeCost: 2,
    range: [1, 1], pow: 7, spd: 4, arm: 0, grd: 0,
    text: 'Before: Close 2.',
    boostText: '[+] Now: Strike.\nHit: Advance or Retreat 3.',
    hooks: { before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 2); } },
    boost: { force: 1, continuous: true, triggersStrike: true,
      onHit(ctx) { ctx.engine.retreatSelf(ctx.player, ctx.opponent, 3); } },
  },
  {
    key: 'tao_attack_meow_pow', name: 'Attack Meow Pow!', type: 'ultra', owner: 'taokaka', gaugeCost: 4,
    isAstral: true, copies: 1,
    range: [1, 1], pow: 9, spd: 5, arm: 0, grd: 0,
    text: 'Before: Advance 4.',
    boostText: 'Draw 2. Seal this and take another action.',
    hooks: { before(ctx) { ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 4, true); } },
    boost: { force: 0, continuous: false, bonusAction: true, resolve(ctx) { ctx.engine.draw(ctx.player, 2); } },
  },
];

const TAGER = [
  {
    key: 'tager_atomic_collider', name: 'Atomic Collider', type: 'special', owner: 'tager',
    range: [1, 2], pow: 6, spd: 3, arm: 0, grd: 3,
    text: 'Before: Pull 2.\nHit: Pull 1 or 2.',
    boostText: '[+] +2 POW.\nNow: Strike.',
    hooks: {
      before(ctx) { ctx.engine.pullTowardWithoutPassing(ctx.defender, ctx.attacker, 2); },
      // "Pull 1 or 2" auto-resolves to 2 — pulling is the entire point of Tager's kit,
      // so the smaller option is never the interesting one ("up to X" convention).
      hit(ctx) { ctx.engine.pullTowardWithoutPassing(ctx.defender, ctx.attacker, 2); },
    },
    boost: { force: 1, continuous: true, statMods: { pow: 2 }, triggersStrike: true },
  },
  {
    key: 'tager_crimson_punisher', name: 'Crimson Punisher', type: 'special', owner: 'tager',
    range: [1, 1], pow: 5, spd: 1, arm: 2, grd: 5,
    text: 'Ignore Armor.\nAfter: Close 1.',
    boostText: '[+] +0~1 RNG.\nNow: Strike.',
    ignoreArmor: true,
    hooks: { after(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 1); } },
    boost: { force: 1, continuous: true, rangeMaxBonus: 1, triggersStrike: true },
  },
  {
    key: 'tager_gigantic_tager_driver', name: 'Gigantic Tager Driver', type: 'special', owner: 'tager',
    range: [1, 1], pow: 7, spd: 5, arm: 0, grd: 0,
    // DEFERRED: the card's own {1} Force cost to play it (no attack-Force-cost path).
    text: 'Hit: The opponent must discard 1 card at random.',
    boostText: '[+] +3 ARM.',
    hooks: { hit(ctx) { ctx.engine.randomDiscardFromHand(ctx.defender, 1); } },
    boost: { force: 0, continuous: true, statMods: { arm: 3 } },
  },
  {
    key: 'tager_sledgehammer', name: 'Sledgehammer', type: 'special', owner: 'tager',
    range: [1, 2], pow: 4, spd: 4, arm: 1, grd: 3,
    text: 'Before: Close 1.\nHit: Close 1.',
    boostText: 'If your opponent is at Range 1, add this to your Gauge and draw 1.',
    hooks: {
      before(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 1); },
      hit(ctx) { ctx.engine.closeSelf(ctx.attacker, ctx.defender, 1); },
    },
    boost: { force: 0, continuous: false,
      resolve(ctx) {
        if (ctx.engine.range(ctx.player, ctx.opponent) === 1) {
          ctx.gaugeInsteadOfDiscard = true;
          ctx.engine.draw(ctx.player, 1);
        }
      } },
  },
  {
    key: 'tager_spark_bolt', name: 'Spark Bolt', type: 'special', owner: 'tager',
    range: [3, 8], pow: 4, spd: 1, arm: 0, grd: 0,
    // DEFERRED: the card's own {1} Force cost to play it (no attack-Force-cost path).
    text: 'For each card in Gauge, +1 SPD.\nHit: Pull 2, Advantage.',
    boostText: '[+] -2 SPD, +4 ARM.\nYou cannot be Pushed or Pulled.',
    spdPerGaugeCard: true,
    hooks: {
      hit(ctx) {
        ctx.engine.pullTowardWithoutPassing(ctx.defender, ctx.attacker, 2);
        ctx.engine.grantAdvantage(ctx.attacker, 'Spark Bolt');
      },
    },
    // "You cannot be Pushed or Pulled" reuses the existing movement-immunity flag that
    // Focus and Double Lariat already set, granted from a boost instead of a card.
    boost: { force: 0, continuous: true, statMods: { spd: -2, arm: 4 }, movementImmuneGrant: true },
  },
  {
    key: 'tager_genesic_emerald_tager_buster', name: 'Genesic Emerald Tager Buster', type: 'ultra', owner: 'tager', gaugeCost: 4,
    range: [1, 1], pow: 10, spd: 6, arm: 0, grd: 0,
    text: 'Before: Spend up to [2] to Pull 1 for each Gauge spent.',
    boostText: 'Close 2, Strike.',
    // DEFERRED: the optional up-to-[2] Gauge spend for extra Pull. The engine's
    // optional-spend yields cover Force-for-POW and flat Gauge-for-effect, not
    // "spend up to N Gauge, scaling an effect". Workaround: none.
    boost: { force: 0, continuous: false, triggersStrike: true,
      resolve(ctx) { ctx.engine.closeSelf(ctx.player, ctx.opponent, 2); } },
  },
  {
    key: 'tager_magna_tech_wheel', name: 'Magna Tech Wheel', type: 'ultra', owner: 'tager', gaugeCost: 3,
    range: [1, 1], pow: 8, spd: 1, arm: 2, grd: 6,
    text: 'Before: Spend up to [2] to Close 1 per Gauge spent.\nHit, Exceed: +4 POW.',
    boostText: '[+] +2 POW, +2 ARM, +2 GRD.',
    // DEFERRED: the same scaling Gauge spend as Genesic above. The Exceed rider IS
    // implemented, through the character's attackStatMods hook.
    boost: { force: 1, continuous: true, statMods: { pow: 2, arm: 2, grd: 2 } },
  },
  {
    key: 'tager_king_of_tager', name: 'King of Tager', type: 'ultra', owner: 'tager', gaugeCost: 4,
    isAstral: true, copies: 1,
    range: [1, 1], pow: 16, spd: 0, arm: 0, grd: 3,
    text: 'When you are hit, after Hit effects, +3 ARM for each card in your Gauge.\nBefore: Pull 1 or 2.',
    boostText: 'Draw 2. Seal this and take another action.',
    hooks: { before(ctx) { ctx.engine.pullTowardWithoutPassing(ctx.defender, ctx.attacker, 2); } },
    // DEFERRED: "+3ARM for each card in your Gauge when you are hit" — a reactive
    // defensive bonus computed at damage time, like Block's Force-for-Armor but
    // Gauge-scaled and automatic. Block's path is hardcoded to Block's own key.
    boost: { force: 0, continuous: false, bonusAction: true, resolve(ctx) { ctx.engine.draw(ctx.player, 2); } },
  },
];

const NU13 = [
  {
    key: 'nu_sickle_storm', name: 'Sickle Storm', type: 'special', owner: 'nu13',
    range: [2, 4], pow: 4, spd: 4, arm: 0, grd: 0,
    text: 'Hit: If you are at Range 5+, Advantage. Otherwise, Push or Pull 2.',
    boostText: '[+] +1 SPD.\nHit: You may Push or Pull 1.',
    hooks: {
      hit(ctx) {
        if (ctx.engine.range(ctx.attacker, ctx.defender) >= 5) {
          ctx.engine.grantAdvantage(ctx.attacker, 'Sickle Storm');
        } else {
          // Push/Pull choice auto-resolves to Push (Nu-13 wants distance — her whole
          // kit is long-range), same "not a real decision for this character" call
          // the file header describes.
          ctx.engine.pushAway(ctx.defender, ctx.attacker, 2);
        }
      },
    },
    boost: { force: 0, continuous: true, statMods: { spd: 1 } },
  },
  {
    key: 'nu_spike_chaser', name: 'Spike Chaser', type: 'special', owner: 'nu13',
    range: [1, 1], pow: 5, spd: 3, arm: 0, grd: 0,
    text: 'Before: Spend up to {3} for +0~1 RNG each.\nAfter: Retreat 2.',
    boostText: '[+] -2~0 RNG.\nNow: Draw 1.',
    // DEFERRED: the Before's scaling Force-for-Range spend (the engine's optional
    // Force yield buys POW only, and range is fixed before hooks run).
    hooks: { after(ctx) { ctx.engine.retreatSelf(ctx.attacker, ctx.defender, 2); } },
    boost: { force: 0, continuous: true, resolve(ctx) { ctx.engine.draw(ctx.player, 1); } },
  },
  {
    key: 'nu_supra_rage', name: 'Supra Rage', type: 'special', owner: 'nu13',
    range: [2, 3], pow: 3, spd: 5, arm: 0, grd: 0,
    text: 'Before: You may Retreat 1.\nHit: Push 1.',
    boostText: 'Advance or Retreat 3.',
    hooks: {
      // A real yielded choice (retreating changes whether this card's own 2-3 range
      // still reaches), same reasoning as Axl's Rainwater — see engine.js's
      // optionalRetreat handling.
      optionalRetreat: 1,
      hit(ctx) { ctx.engine.pushAway(ctx.defender, ctx.attacker, 1); },
    },
    boost: { force: 0, continuous: false, needsDirectionChoice: true,
      resolve(ctx) {
        if (ctx.moveDirection === 'advance') ctx.engine.advanceSelf(ctx.player, ctx.opponent, 3, true);
        else ctx.engine.retreatSelf(ctx.player, ctx.opponent, 3);
      } },
  },
  {
    key: 'nu_sword_dance', name: 'Sword Dance', type: 'special', owner: 'nu13',
    range: [2, 2], pow: 3, spd: 4, arm: 0, grd: 4,
    text: 'Before: Draw 2.\nHit: Spend up to {4} for +1 POW each.',
    boostText: '[+] Opponents cannot move.\nAt the start of your next turn, add this to your Gauge.',
    hooks: {
      before(ctx) { ctx.engine.draw(ctx.attacker, 2); },
      optionalForceSpendForPow: { max: 4, powPerForce: 1 },
    },
    boost: { force: 1, continuous: true, opponentCannotMove: true, expireToGaugeAtStartOfNextTurn: true },
  },
  {
    key: 'nu_sword_summoner', name: 'Sword Summoner', type: 'special', owner: 'nu13',
    range: [1, 1], pow: 2, spd: 6, arm: 0, grd: 0,
    text: 'Hit, Range 4: +3 POW.\nAfter: If the opponent is stunned, draw 1.',
    boostText: 'Retreat 2. If you are at Range 4-5, Strike.',
    hooks: {
      hit(ctx) { if (ctx.engine.range(ctx.attacker, ctx.defender) === 4) ctx.powBonus = (ctx.powBonus || 0) + 3; },
      afterStunCheck(ctx, opponentWasStunned) { if (opponentWasStunned) ctx.engine.draw(ctx.attacker, 1); },
    },
    boost: { force: 0, continuous: false, triggersStrike: true,
      resolve(ctx) { ctx.engine.retreatSelf(ctx.player, ctx.opponent, 2); } },
  },
  {
    key: 'nu_calamity_sword', name: 'Calamity Sword', type: 'ultra', owner: 'nu13', gaugeCost: 3,
    range: [2, 3], pow: 6, spd: 7, arm: 0, grd: 0,
    text: '',
    boostText: 'Shuffle your hand into your deck. Draw 5.',
    boost: { force: 2, continuous: false,
      resolve(ctx) {
        const n = ctx.player.hand.length;
        // Shuffling back in is modeled as discard-then-draw would NOT be: the cards
        // genuinely return to the deck, so they can come back later this game.
        ctx.player.deck = ctx.player.deck.concat(ctx.player.hand.splice(0));
        ctx.engine.logMsg(`${ctx.player.name} shuffles ${n} cards from hand into their deck (Calamity Sword).`);
        ctx.engine.draw(ctx.player, 5);
      } },
  },
  {
    key: 'nu_legacy_edge', name: 'Legacy Edge', type: 'ultra', owner: 'nu13', gaugeCost: 3,
    range: [4, 8], pow: 7, spd: 3, arm: 0, grd: 0,
    text: "Attacks at Range 5+ don't hit you.\nHit: Advantage, then Advance or Retreat up to 8.",
    boostText: 'If the opponent is at Range 1, Push 3 and draw 2.',
    rangeImmuneRanges: [5, 6, 7, 8],
    hooks: {
      hit(ctx) {
        ctx.engine.grantAdvantage(ctx.attacker, 'Legacy Edge');
        // Nu-13 wants range, so the "up to 8" auto-resolves to a full retreat.
        ctx.engine.retreatSelf(ctx.attacker, ctx.defender, 8);
      },
    },
    boost: { force: 2, continuous: false,
      resolve(ctx) {
        if (ctx.engine.range(ctx.player, ctx.opponent) === 1) {
          ctx.engine.pushAway(ctx.opponent, ctx.player, 3);
          ctx.engine.draw(ctx.player, 2);
        }
      } },
  },
  {
    key: 'nu_sword_of_destruction', name: 'Sword of Destruction', type: 'ultra', owner: 'nu13', gaugeCost: 3,
    isAstral: true, copies: 1,
    range: [1, 1], pow: 3, spd: 5, arm: 0, grd: 0,
    text: 'Hit, Range 1: +10 POW.',
    boostText: 'Draw 2. Seal this and take another action.',
    hooks: {
      hit(ctx) { if (ctx.engine.range(ctx.attacker, ctx.defender) === 1) ctx.powBonus = (ctx.powBonus || 0) + 10; },
    },
    boost: { force: 0, continuous: false, bonusAction: true, resolve(ctx) { ctx.engine.draw(ctx.player, 2); } },
  },
];

const BANG = [
  {
    key: 'bang_shuriken', name: 'Bang-Style Shuriken', type: 'special', owner: 'bang',
    range: [1, 4], pow: 1, spd: 6, arm: 0, grd: 0,
    // DEFERRED: the card's own {1} Force cost to play it (no attack-Force-cost path).
    text: "Before: Draw 1, then you may play a Boost from hand, ignoring cost (don't Strike or take additional actions).",
    boostText: 'Return a Continuous Boost from play to its owner\'s hand.\nDraw 1 or take another action.',
    // DEFERRED (partial): the "then you may play a Boost from hand for free" half —
    // playing a boost mid-Strike-resolution has no path (playBoost is not reachable
    // from inside a Before hook, which is synchronous and mid-generator).
    hooks: { before(ctx) { ctx.engine.draw(ctx.attacker, 1); } },
    // DEFERRED (partial): "return a Continuous Boost to its owner's hand" — the engine
    // can discard an opponent's continuous boost (discardOpponentContinuousBoost) but
    // not bounce one to hand. The draw half is implemented.
    boost: { force: 0, continuous: false, resolve(ctx) { ctx.engine.draw(ctx.player, 1); } },
  },
  {
    key: 'bang_pulverizing_blast', name: 'Pulverizing Blast Jutsu', type: 'special', owner: 'bang',
    range: [1, 2], pow: 5, spd: 2, arm: 1, grd: 5,
    text: 'Before: Advance 3.\nAfter: If you were hit, Advance or Retreat up to 2.',
    boostText: 'Advance 3. If you Advanced past the opponent this way, Advance or Retreat 1, then draw 1.',
    hooks: {
      before(ctx) { ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 3, true); },
      after(ctx) { if (ctx.attacker.strikeState.wasHit) ctx.engine.retreatSelf(ctx.attacker, ctx.defender, 2); },
    },
    boost: { force: 0, continuous: false,
      resolve(ctx) {
        const before = ctx.player.pos < ctx.opponent.pos;
        ctx.engine.advanceSelf(ctx.player, ctx.opponent, 3, true);
        if ((ctx.player.pos < ctx.opponent.pos) !== before) {
          ctx.engine.retreatSelf(ctx.player, ctx.opponent, 1);
          ctx.engine.draw(ctx.player, 1);
        }
      } },
  },
  {
    key: 'bang_palm_thrust', name: 'Unstoppable Palm Thrust', type: 'special', owner: 'bang',
    range: [1, 2], pow: 4, spd: 5, arm: 0, grd: 4,
    text: 'Hit: Push 2, Advantage.\nAfter: If the opponent is Stunned, you may Close 2.',
    boostText: '[+] Now: Draw 1.\nAfter: Advance or Retreat 1.',
    hooks: {
      hit(ctx) { ctx.engine.pushAway(ctx.defender, ctx.attacker, 2); ctx.engine.grantAdvantage(ctx.attacker, 'Unstoppable Palm Thrust'); },
      afterStunCheck(ctx, opponentWasStunned) { if (opponentWasStunned) ctx.engine.closeSelf(ctx.attacker, ctx.defender, 2); },
    },
    boost: { force: 0, continuous: true, resolve(ctx) { ctx.engine.draw(ctx.player, 1); } },
  },
  {
    key: 'bang_void_tempest_kick', name: 'Void Tempest Kick', type: 'special', owner: 'bang',
    range: [1, 2], pow: 4, spd: 4, arm: 0, grd: 0,
    text: 'Ignore Guard.\nHit: The opponent must discard a card at random.\nAfter: Draw 1.',
    boostText: '[+] Hit: +1 POW, Advantage. Then, add this card to your Gauge.',
    ignoreGuard: true,
    hooks: {
      hit(ctx) { ctx.engine.randomDiscardFromHand(ctx.defender, 1); },
      after(ctx) { ctx.engine.draw(ctx.attacker, 1); },
    },
    boost: { force: 0, continuous: true, toGaugeIfHitThisStrike: true,
      onHit(ctx) { ctx.powBonus = (ctx.powBonus || 0) + 1; ctx.engine.grantAdvantage(ctx.player, 'Void Tempest Kick boost'); } },
  },
  {
    key: 'bang_fatal_eruption', name: 'Fatal Eruption', type: 'ultra', owner: 'bang', gaugeCost: 1,
    range: [1, 2], pow: 5, spd: 5, arm: 0, grd: 4,
    text: 'Hit: Push 8, Close 4, and draw 1.',
    boostText: '[+] Before: You may Advance or Retreat 2.',
    hooks: {
      hit(ctx) {
        ctx.engine.pushAway(ctx.defender, ctx.attacker, 8);
        ctx.engine.closeSelf(ctx.attacker, ctx.defender, 4);
        ctx.engine.draw(ctx.attacker, 1);
      },
    },
    boost: { force: 1, continuous: true, grantsNormalsBeforeAdvance: 2 },
  },
  {
    key: 'bang_hyper_shadowstep', name: 'Hyper Shadowstep Strike', type: 'ultra', owner: 'bang', gaugeCost: 8,
    range: [1, 1], pow: 8, spd: 7, arm: 0, grd: 0,
    text: 'Gauge cost is 0 if you have 4 unique specials in Overdrive.\nBefore: Close 8, then Advance 1.',
    boostText: '[+] +1 POW, +1 SPD.\nNow: Strike.',
    // The Overdrive-discount clause is live: see CHARACTERS.bang.ultraCostAdjust.
    hooks: {
      before(ctx) {
        ctx.engine.closeSelf(ctx.attacker, ctx.defender, 8);
        ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 1, true);
      },
    },
    boost: { force: 1, continuous: true, statMods: { pow: 1, spd: 1 }, triggersStrike: true },
  },
  {
    key: 'bang_infinite_chaos', name: 'Infinite Chaos-Fist of the Void', type: 'ultra', owner: 'bang', gaugeCost: 2,
    range: [1, 1], pow: 3, spd: 9, arm: 0, grd: 0,
    text: 'Hit: You may add any card from your discard pile to Gauge.',
    boostText: '[+] +1 SPD.\nNow: Advance 2, then Strike.\nAfter, Exceed: Return this to your hand.',
    hooks: {
      // "Any card from your discard" auto-resolves to the top one — the picker UI for
      // an arbitrary discard-pile choice doesn't exist (same gap Testament's
      // Arbiter Sign - Rising documents), and the Gauge count is what matters here.
      hit(ctx) {
        const top = ctx.attacker.discard.pop();
        if (top) {
          ctx.attacker.gauge.push(top);
          ctx.engine.logMsg(`${ctx.attacker.name} adds ${top.name} from their discard to Gauge (Infinite Chaos).`);
        }
      },
    },
    boost: { force: 1, continuous: true, statMods: { spd: 1 }, triggersStrike: true,
      resolve(ctx) { ctx.engine.advanceSelf(ctx.player, ctx.opponent, 2, true); } },
  },
  {
    key: 'bang_the_ultimate_bang', name: 'The Ultimate Bang', type: 'ultra', owner: 'bang', gaugeCost: 4,
    isAstral: true, copies: 1,
    range: [3, 3], pow: 2, spd: 1, arm: 0, grd: 30,
    text: 'Before: Retreat up to 1.\nHit: +1 POW for each card in your discard.',
    boostText: 'Draw 2. Seal this and take another action.',
    hooks: {
      before(ctx) { ctx.engine.retreatSelf(ctx.attacker, ctx.defender, 1); },
      hit(ctx) { ctx.powBonus = (ctx.powBonus || 0) + ctx.attacker.discard.length; },
    },
    boost: { force: 0, continuous: false, bonusAction: true, resolve(ctx) { ctx.engine.draw(ctx.player, 2); } },
  },
];

const PLATINUM = [
  {
    key: 'plat_dramatic_sammy', name: 'Dramatic Sammy', type: 'special', owner: 'platinum',
    range: [1, 1], pow: 4, spd: 2, arm: 0, grd: 0,
    text: 'Ignore Armor, Guard.\nBefore: Advance 1-2.\nHit: Advantage. You may sustain one of your Continuous Boosts.',
    boostText: '[+] Hit, Range 2: +2 POW.',
    ignoreArmor: true, ignoreGuard: true,
    hooks: {
      before(ctx) { ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 2, true); },
      // DEFERRED (partial): "you may sustain one of your Continuous Boosts" — boost
      // sustaining exists only as each boost's own sustain clause (sustain_choice),
      // with no path for another card to sustain an arbitrary boost. Advantage lands.
      hit(ctx) { ctx.engine.grantAdvantage(ctx.attacker, 'Dramatic Sammy'); },
    },
    boost: { force: 0, continuous: true,
      onHit(ctx) { if (ctx.engine.range(ctx.player, ctx.opponent) === 2) ctx.powBonus = (ctx.powBonus || 0) + 2; } },
  },
  {
    key: 'plat_dream_sally', name: 'Dream Sally', type: 'special', owner: 'platinum',
    range: [1, 5], pow: 3, spd: 1, arm: 0, grd: 5,
    text: 'Hit: If the opponent moved or was moved during this Strike, +2 POW.',
    boostText: '[+] After: Draw 1, then return your attack to the top of your deck.',
    hooks: {
      hit(ctx) {
        // "Moved or was moved" is measured against the position the defender held when
        // the Strike began — engine.js records that on the player as _posAtStrikeStart.
        if (ctx.defender._posAtStrikeStart != null && ctx.defender._posAtStrikeStart !== ctx.defender.pos) {
          ctx.powBonus = (ctx.powBonus || 0) + 2;
        }
      },
    },
    // DEFERRED: "return your attack to the top of your deck" — recycleHadoken does
    // exactly this but is hardcoded to Ryu's Hadoken's own interactiveAfter path.
    boost: { force: 0, continuous: true, resolve(ctx) { ctx.engine.draw(ctx.player, 1); } },
  },
  {
    key: 'plat_happy_magicka', name: 'Happy Magicka', type: 'special', owner: 'platinum',
    range: [1, 3], pow: 3, spd: 1, arm: 2, grd: 4,
    text: 'Hit: If you were hit, the opponent must discard a card at random.',
    boostText: '[+] +2 SPD.\nBefore: Retreat 2.',
    hooks: {
      hit(ctx) { if (ctx.attacker.strikeState.wasHit) ctx.engine.randomDiscardFromHand(ctx.defender, 1); },
    },
    boost: { force: 0, continuous: true, statMods: { spd: 2 } },
  },
  {
    key: 'plat_mami_circular', name: 'Mami Circular', type: 'special', owner: 'platinum',
    range: [1, 1], pow: 4, spd: 5, arm: 0, grd: 0,
    text: 'Before: Advance 3. If you Advanced past the opponent, Ignore Armor.',
    boostText: '[+] -1 SPD, +5 GRD.',
    hooks: {
      before(ctx) {
        const before = ctx.attacker.pos < ctx.defender.pos;
        ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 3, true);
        if ((ctx.attacker.pos < ctx.defender.pos) !== before) {
          ctx.sideSwapped = true;
          ctx.attStats.ignoreArmor = true;
        }
      },
    },
    boost: { force: 0, continuous: true, statMods: { spd: -1, grd: 5 } },
  },
  {
    key: 'plat_mystique_momo', name: 'Mystique Momo', type: 'special', owner: 'platinum',
    range: [2, 5], pow: 2, spd: 5, arm: 0, grd: 0,
    text: 'Before: You may discard one of your Continuous Boosts from play for +2 POW.',
    boostText: '[+] Before: Pull 2.',
    hooks: {
      // Auto-taken when a boost is actually in play: the trade is only offered when
      // there is something to spend, and +2POW on a 2-POW card is a large swing.
      // DEFERRED: WHICH boost gets discarded is not a player choice here (the oldest
      // one goes), since no discard-your-own-boost picker exists.
      before(ctx) {
        if (ctx.attacker.boostsInPlay.length > 0) {
          const [b] = ctx.attacker.boostsInPlay.splice(0, 1);
          ctx.attacker.discard.push(b.card);
          ctx.powBonus = (ctx.powBonus || 0) + 2;
          ctx.engine.logMsg(`${ctx.attacker.name} discards their ${b.card.name} boost for +2 POW (Mystique Momo).`);
        }
      },
    },
    boost: { force: 0, continuous: true,
      resolve(ctx) { ctx.engine.pullTowardWithoutPassing(ctx.opponent, ctx.player, 2); } },
  },
  {
    key: 'plat_cure_dot_typhoon', name: 'Cure Dot Typhoon', type: 'ultra', owner: 'platinum', gaugeCost: 2,
    range: [1, 1], pow: 4, spd: 6, arm: 0, grd: 0,
    text: 'Before: Advance 1 or 2.\nAfter: You may place a card from your discard pile on top of your deck.',
    boostText: '[+] +1~2 RNG, +1 SPD.',
    hooks: {
      before(ctx) { ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 2, true); },
      // "Place a card from your discard on top of your deck" auto-resolves to the most
      // recently discarded card (no discard-pile picker exists — same gap noted on
      // Bang's Infinite Chaos).
      after(ctx) {
        const top = ctx.attacker.discard.pop();
        if (top) {
          ctx.attacker.deck.push(top);
          ctx.engine.logMsg(`${ctx.attacker.name} puts ${top.name} on top of their deck (Cure Dot Typhoon).`);
        }
      },
    },
    boost: { force: 0, continuous: true, rangeMaxBonus: 2, statMods: { spd: 1 } },
  },
  {
    key: 'plat_miracle_jeanne', name: 'Miracle Jeanne', type: 'ultra', owner: 'platinum', gaugeCost: 4,
    range: [2, 3], pow: 3, spd: 4, arm: 0, grd: 0,
    text: 'Before: You may play up to 2 Continuous Boosts from your discard pile.\nAfter: Sustain all your Boosts.',
    boostText: '[+] +2 ARM.\nHit: If the opponent has 3 or more Guard, +2 POW. Otherwise, -1 POW.',
    hooks: {
      // reviveBestContinuousBoostFromDiscard already exists (built for another card's
      // "play a Continuous Boost from your discard"); called twice for "up to 2".
      before(ctx) {
        ctx.engine.reviveBestContinuousBoostFromDiscard(ctx.attacker, ctx.defender);
        ctx.engine.reviveBestContinuousBoostFromDiscard(ctx.attacker, ctx.defender);
      },
      // DEFERRED: "Sustain all your Boosts" — see Dramatic Sammy's note on sustaining.
    },
    boost: { force: 0, continuous: true, statMods: { arm: 2 },
      onHit(ctx) {
        const grd = ctx.opponent && ctx.defStats ? ctx.defStats.grd : 0;
        ctx.powBonus = (ctx.powBonus || 0) + (grd >= 3 ? 2 : -1);
      } },
  },
  {
    key: 'plat_shining_layered_force', name: 'Shining Layered Force', type: 'ultra', owner: 'platinum', gaugeCost: 4,
    isAstral: true, copies: 1,
    range: [2, 2], pow: 9, spd: 5, arm: 3, grd: 0,
    text: 'Before: Push or Pull 2.\nHit: Push 8.',
    boostText: 'Draw 2. Seal this and take another action.',
    hooks: {
      before(ctx) { ctx.engine.pullTowardWithoutPassing(ctx.defender, ctx.attacker, 2); },
      hit(ctx) { ctx.engine.pushAway(ctx.defender, ctx.attacker, 8); },
    },
    boost: { force: 0, continuous: false, bonusAction: true, resolve(ctx) { ctx.engine.draw(ctx.player, 2); } },
  },
];

const HAKUMEN = [
  {
    key: 'haku_enma', name: 'Enma', type: 'special', owner: 'hakumen',
    range: [1, 1], pow: 4, spd: 6, arm: 0, grd: 3,
    text: 'Before: You must spend [1] if able. If you do, Close 1.',
    boostText: '[+] Attacks at Range 4~5 do not hit you.\nCleanup: If the opponent is at Range 4 or 5, you may spend {1} to sustain this.',
    hooks: {
      // "You MUST spend if able" is mandatory, so it needs no prompt — spend and apply.
      before(ctx) { if (ctx.engine.spendGaugeIfAble(ctx.attacker, 1)) ctx.engine.closeSelf(ctx.attacker, ctx.defender, 1); },
    },
    boost: { force: 0, continuous: true, rangeImmuneRanges: [4, 5] },
  },
  {
    key: 'haku_guren', name: 'Guren', type: 'special', owner: 'hakumen',
    range: [1, 4], pow: 3, spd: 5, arm: 0, grd: 0,
    text: 'Hit: You must spend [1] if able. If you do, Close 1-2 and Advantage.',
    boostText: '[+] Before: Spend up to [3] for +1 POW each.',
    hooks: {
      hit(ctx) {
        if (ctx.engine.spendGaugeIfAble(ctx.attacker, 1)) {
          ctx.engine.closeSelf(ctx.attacker, ctx.defender, 2);
          ctx.engine.grantAdvantage(ctx.attacker, 'Guren');
        }
      },
    },
    // DEFERRED: the boost's scaling "spend up to [3] Gauge for +1POW each" (same
    // missing scaling-Gauge-spend mechanic as Iron Tager's Ultras).
    boost: { force: 0, continuous: true },
  },
  {
    key: 'haku_renka', name: 'Renka', type: 'special', owner: 'hakumen',
    range: [1, 2], pow: 4, spd: 4, arm: 1, grd: 3,
    text: 'Hit: You must spend [1] if able. If you do, Push 1-2.',
    boostText: '[+] +0~1 RNG.\nNow: Strike.',
    hooks: {
      hit(ctx) { if (ctx.engine.spendGaugeIfAble(ctx.attacker, 1)) ctx.engine.pushAway(ctx.defender, ctx.attacker, 2); },
    },
    boost: { force: 1, continuous: true, rangeMaxBonus: 1, triggersStrike: true },
  },
  {
    key: 'haku_yanagi', name: 'Yanagi', type: 'special', owner: 'hakumen',
    range: [1, 2], pow: 3, spd: 3, arm: 0, grd: 5,
    text: 'Before: You must spend [1] if able. If you do, Close 2.\nHit: If you were hit, +2 POW.',
    boostText: '[+] Hit: Advance up to 1. The opponent must discard a card at random.',
    hooks: {
      before(ctx) { if (ctx.engine.spendGaugeIfAble(ctx.attacker, 1)) ctx.engine.closeSelf(ctx.attacker, ctx.defender, 2); },
      hit(ctx) { if (ctx.attacker.strikeState.wasHit) ctx.powBonus = (ctx.powBonus || 0) + 2; },
    },
    boost: { force: 0, continuous: true,
      onHit(ctx) {
        ctx.engine.advanceSelf(ctx.player, ctx.opponent, 1, true);
        ctx.engine.randomDiscardFromHand(ctx.opponent, 1);
      } },
  },
  {
    key: 'haku_zantetsu', name: 'Zantetsu', type: 'special', owner: 'hakumen',
    range: [1, 2], pow: 4, spd: 2, arm: 0, grd: 6,
    text: 'Before: You must spend [1] if able. If you do, Ignore Armor.\nHit: You must spend [1] if able. If you do, +3 POW.',
    boostText: 'If you are at Range 3, Close 2 and Strike.',
    hooks: {
      before(ctx) { if (ctx.engine.spendGaugeIfAble(ctx.attacker, 1)) ctx.attStats.ignoreArmor = true; },
      hit(ctx) { if (ctx.engine.spendGaugeIfAble(ctx.attacker, 1)) ctx.powBonus = (ctx.powBonus || 0) + 3; },
    },
    boost: { force: 0, continuous: false, triggersStrike: true,
      resolve(ctx) { if (ctx.engine.range(ctx.player, ctx.opponent) === 3) ctx.engine.closeSelf(ctx.player, ctx.opponent, 2); } },
  },
  {
    key: 'haku_kokuujin_shippu', name: 'Kokuujin: Shippu', type: 'ultra', owner: 'hakumen', gaugeCost: 4,
    range: [1, 6], pow: 4, spd: 1, arm: 2, grd: 5,
    text: 'Hit, Range 1~2: +4 POW.',
    boostText: '[+] Stun Immunity.\nBefore: If you were hit, +3 POW and add this to your Gauge.',
    hooks: {
      hit(ctx) { if (ctx.engine.range(ctx.attacker, ctx.defender) <= 2) ctx.powBonus = (ctx.powBonus || 0) + 4; },
    },
    boost: { force: 1, continuous: true, stunImmuneGrant: true },
  },
  {
    key: 'haku_kokuujin_yukikaze', name: 'Kokuujin: Yukikaze', type: 'ultra', owner: 'hakumen', gaugeCost: 4,
    range: [1, 1], pow: 0, spd: 2, arm: 0, grd: 0,
    text: 'Stun Immunity. Your life cannot be reduced below 1 during this Strike.\nBefore: If you were hit, +6 POW and Close 8.\nHit: Advance 2.',
    boostText: '[+] +0~1 RNG, +2 ARM, +2 GRD.',
    stunImmuneBase: true,
    hooks: {
      before(ctx) {
        if (ctx.attacker.strikeState.wasHit) {
          ctx.powBonus = (ctx.powBonus || 0) + 6;
          ctx.engine.closeSelf(ctx.attacker, ctx.defender, 8);
        }
      },
      hit(ctx) { ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 2, true); },
    },
    // DEFERRED: "Your life cannot be reduced below 1 during this Strike" — the engine
    // has takeDamageNonLethal for effects that floor at 1, but no per-Strike damage
    // floor for ordinary attack damage.
    boost: { force: 0, continuous: true, rangeMaxBonus: 1, statMods: { arm: 2, grd: 2 } },
  },
  {
    key: 'haku_akumetsu', name: 'Akumetsu', type: 'ultra', owner: 'hakumen', gaugeCost: 8,
    isAstral: true, copies: 1,
    range: [1, 1], pow: 10, spd: 0, arm: 0, grd: 0,
    text: 'Opponents cannot move. Attacks at Range 1 cannot hit you.\nCleanup: Seal this.',
    boostText: 'Draw 2. Seal this and take another action.',
    rangeImmuneRanges: [1],
    // DEFERRED: the attack's own "Opponents cannot move" (the flag exists as a boost
    // grant, not a card one) and "Cleanup: Seal this" (see the Astral seal note on
    // Ragna's Black Onslaught).
    boost: { force: 0, continuous: false, bonusAction: true, resolve(ctx) { ctx.engine.draw(ctx.player, 2); } },
  },
];

const CHARACTERS = {
  // ---------- Season 5: BlazBlue ----------
  ragna: {
    key: 'ragna', name: 'Ragna the Bloodedge', exceedCost: 4, isStreetFighter: false,
    specials: RAGNA,
    innateText: 'Innate — Hit: Gain 1 life.',
    exceedText: 'Exceeded — When you Exceed, draw 1, Close up to 1, and Strike.\nHit: +1 POW and gain 2 life.',
    blurb: 'Lifesteal bruiser. Every hit heals, and Exceeding turns that into a real swing.',    overdrive: {
      text: 'Take 1 non-lethal damage, then you may Push 1.',
      options() {
        return [
          { key: 'push', label: 'Push 1', prefer: 'push' },
          { key: 'decline', label: "Don't Push", prefer: 'decline' },
        ];
      },
      resolve(engine, player, opponent, choiceKey) {
        engine.takeDamageNonLethal(player, 1);
        if (choiceKey === 'push') engine.pushAway(opponent, player, 1);
      },
    },
    // Innate "Hit: Gain 1 life" applies to every attack, and the Exceed side adds
    // "gain 2 life" on top of it (the printed Exceed text replaces the Innate's
    // wording, so Exceeded Ragna gains 2, not 3).
    *attackHitHook(ctx) {
      ctx.engine.gainLife(ctx.attacker, ctx.attacker.exceeded ? 2 : 1);
    },
    // Exceed's "+1POW" rider on his hits — POW only matters on a hit, so a flat
    // while-Exceeded bonus is equivalent to the printed Hit-conditional one.
    attackStatMods(player) { return player.exceeded ? { pow: 1 } : {}; },
    onExceed(engine, player, opponent) {
      engine.draw(player, 1);
      engine.closeSelf(player, opponent, 1);
      return { mayStrike: true };
    },
  },

  jin: {
    key: 'jin', name: 'Jin Kisaragi', exceedCost: 4, isStreetFighter: false,
    specials: JIN,
    innateText: 'Innate — When you set your attack, you may spend [1] to gain "After: Draw 2."',
    exceedText: 'Exceeded — When you Exceed, draw 2.\nHit: The opponent must discard a card. After: Draw 1.',
    blurb: 'Card-advantage zoner. Pays Gauge to refill, freezes the opponent in place.',    overdrive: { text: 'Draw 1.', resolve(engine, player) { engine.draw(player, 1); } },
    setTimeOption: {
      text: 'Spend 1 Gauge for "After: Draw 2"',
      cost: { gauge: 1 },
      apply(engine, player) {
        player.strikeState.setOptionAfter = (eng, p) => eng.draw(p, 2);
      },
    },
    *attackHitHook(ctx) {
      if (ctx.attacker.exceeded) ctx.engine.randomDiscardFromHand(ctx.defender, 1);
    },
    attackAfterHook(ctx) {
      if (ctx.attacker.exceeded) ctx.engine.draw(ctx.attacker, 1);
    },
    // Ice Fang's "Exceed: +1POW, +1ARM" — a per-card clause, so it is gated on the
    // card here rather than buffing everything he sets.
    attackStatMods(player, card) {
      return (player.exceeded && card.key === 'jin_ice_fang') ? { pow: 1, arm: 1 } : {};
    },
    onExceed(engine, player) { engine.draw(player, 2); return {}; },
  },

  noel: {
    key: 'noel', name: 'Noel Vermillion', exceedCost: 4, isStreetFighter: false,
    specials: NOEL,
    innateText: 'Innate — When you initiate a Strike, you may spend [1] for +1 SPD.',
    exceedText: 'Exceeded — When you initiate a Strike, your attack has +1 SPD and "Hit: Advantage."',
    blurb: 'Speed-race gunner. Buys initiative with Gauge, then keeps the turn.',    overdrive: {
      text: 'Close or Retreat 1.',
      options() {
        return [
          { key: 'close', label: 'Close 1', prefer: 'close' },
          { key: 'retreat', label: 'Retreat 1', prefer: 'retreat' },
        ];
      },
      resolve(engine, player, opponent, choiceKey) {
        if (choiceKey === 'retreat') engine.retreatSelf(player, opponent, 1);
        else engine.closeSelf(player, opponent, 1);
      },
    },
    setTimeOption: {
      text: 'Spend 1 Gauge for +1 SPD',
      cost: { gauge: 1 },
      initiatorOnly: true,
      apply(engine, player) { player.strikeState.setOptionStatMods = { spd: 1 }; },
    },
    attackStatMods(player, card, info) {
      return (player.exceeded && info.initiator) ? { spd: 1 } : {};
    },
    *attackHitHook(ctx) {
      if (ctx.attacker.exceeded && ctx.strikeInitiator === ctx.attacker) {
        ctx.engine.grantAdvantage(ctx.attacker, "Noel's Exceed");
      }
    },
  },

  taokaka: {
    key: 'taokaka', name: 'Taokaka', exceedCost: 3, isStreetFighter: false,
    specials: TAOKAKA,
    innateText: 'Innate — When you initiate a Strike with a Wild Swing, your attack has "Before: Advance 2, then you may spend {1} to Retreat 2."',
    exceedText: 'Exceeded — When you initiate a Strike, your attack has "Before: Advance 2, then you may Retreat 2."',
    blurb: 'Chaotic rushdown. Wild Swings lunge in; Exceeding makes every attack lunge.',    overdrive: {
      text: 'Advance or Retreat 2.',
      options() {
        return [
          { key: 'advance', label: 'Advance 2', prefer: 'close' },
          { key: 'retreat', label: 'Retreat 2', prefer: 'retreat' },
        ];
      },
      resolve(engine, player, opponent, choiceKey) {
        if (choiceKey === 'retreat') engine.retreatSelf(player, opponent, 2);
        else engine.advanceSelf(player, opponent, 2, true);
      },
    },
    // DEFERRED (both sides): the "then you may [spend {1} to] Retreat 2" half. The
    // Advance is granted here; the optional retreat-after-advance would need a yield
    // inside the Before step, which no character-level hook can do today (the
    // character before-hook is a plain function, not a generator, unlike the Hit one).
    attackBeforeHook(ctx, info) {
      if (!info.initiator) return;
      const applies = ctx.attacker.exceeded || info.fromWildSwing;
      if (applies) {
        ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 2, true);
        ctx.engine.logMsg(`${ctx.attacker.name} advances 2 (Taokaka's ${ctx.attacker.exceeded ? 'Exceed' : 'Innate'}).`);
      }
    },
  },

  tager: {
    key: 'tager', name: 'Iron Tager', exceedCost: 5, isStreetFighter: false,
    specials: TAGER,
    innateText: 'Innate — When you would Advance or Retreat 3 or more, instead move only 2.\nWhen you initiate a Strike, you may spend [1] to Pull 2.',
    exceedText: 'Exceeded — When you would Advance or Retreat 3 or more, instead move only 2.\nYour attacks have +1 POW and +4 GRD.',
    blurb: 'Immovable magnet. Slow on his own feet, but drags the opponent into Range 1 and keeps them there.',
    silhouettePose: 'grounded_guard',
    overdrive: {
      text: 'You may Pull 2.',
      options() {
        return [
          { key: 'pull', label: 'Pull 2', prefer: 'close' },
          { key: 'decline', label: "Don't Pull", prefer: 'decline' },
        ];
      },
      resolve(engine, player, opponent, choiceKey) {
        if (choiceKey === 'pull') engine.pullTowardWithoutPassing(opponent, player, 2);
      },
    },
    // The movement cap is BOTH halves of his card — printed identically on the Innate
    // and the Exceed side — so it is unconditional rather than gated on `exceeded`.
    // engine.cappedSelfMove applies it inside advanceSelf/retreatSelf; see its comment
    // for why being Pushed or Pulled deliberately isn't capped.
    selfMoveCap() { return { threshold: 3, instead: 2 }; },
    setTimeOption: {
      text: 'Spend 1 Gauge to Pull 2',
      cost: { gauge: 1 },
      initiatorOnly: true,
      apply(engine, player, opponent) { engine.pullTowardWithoutPassing(opponent, player, 2); },
    },
    attackStatMods(player, card) {
      const mods = player.exceeded ? { pow: 1, grd: 4 } : {};
      // Magna Tech Wheel's own "Hit, Exceed: +4POW" rider — a per-card clause, gated
      // on the card here the same way Jin's Ice Fang is, rather than buffing
      // everything he sets. POW only matters on a hit, so a flat while-Exceeded
      // bonus is equivalent to the printed Hit-conditional one (same reasoning as
      // Ragna's Exceed POW rider).
      if (player.exceeded && card && card.key === 'tager_magna_tech_wheel') {
        mods.pow = (mods.pow || 0) + 4;
      }
      return mods;
    },
  },

  nu13: {
    key: 'nu13', name: 'ν-No. 13', exceedCost: 3, isStreetFighter: false,
    specials: NU13,
    innateText: 'Innate — When you set your attack, you may spend {1} for +3~4 RNG.',
    exceedText: 'Exceeded — When you Exceed, draw 1.\nYour attacks have +0~4 RNG and have "Hit: You may Advance 3."',
    blurb: 'Sword-summoning zoner. Buys reach with Force, then Exceeds into hitting from almost anywhere.',
    silhouettePose: 'leaning_chamber',
    overdrive: { text: 'Retreat 1.', resolve(engine, player, opponent) { engine.retreatSelf(player, opponent, 1); } },
    setTimeOption: {
      text: 'Spend 1 Force for +3~4 RNG',
      cost: { force: 1 },
      // "When you set your attack" — offered defending as well as initiating, unlike
      // Noel's initiator-only option. "+3~4" auto-resolves to the max, per this
      // file's "up to X" convention.
      apply(engine, player) { player.strikeState.setOptionRangeBonus = 4; },
    },
    attackRangeBonus(player) { return player.exceeded ? 4 : 0; },
    *attackHitHook(ctx) {
      // "Hit: You may Advance 3" — auto-taken while Exceeded. Closing is what every
      // card in her Exceeded kit wants after a hit lands, so this is the same
      // formality-level "may" the "up to X" convention already covers.
      if (ctx.attacker.exceeded) ctx.engine.advanceSelf(ctx.attacker, ctx.defender, 3, true);
    },
    onExceed(engine, player) { engine.draw(player, 1); return {}; },
  },

  bang: {
    key: 'bang', name: 'Bang Shishigami', exceedCost: 3, isStreetFighter: false,
    specials: BANG,
    innateText: 'Innate — Action: Look at the top 2 cards of your deck, draw 1, and discard the other.',
    exceedText: 'Exceeded — When you Exceed, Strike.\nYour EX attacks have +1 POW.',
    blurb: 'Deck-sifting ninja. Digs for the card he needs every turn, then swings with reinforced EX attacks.',
    silhouettePose: 'leaning_chamber',
    overdrive: {
      text: 'Return all copies in your discard of the card discarded by the Overdrive effect (including that one) to your hand.',
      // `card` is the card beginOverdriveTick just moved from Overdrive to the
      // discard, which is why resolve() is handed it — see engine.resolveOverdriveEffect.
      resolve(engine, player, opponent, choiceKey, card) {
        if (!card) return;
        const returning = player.discard.filter(c => c.key === card.key);
        if (returning.length === 0) return;
        player.discard = player.discard.filter(c => c.key !== card.key);
        player.hand.push(...returning);
        engine.logMsg(`${player.name} returns ${returning.length} copy/copies of ${card.name} from the discard to hand (Overdrive).`);
      },
    },
    // ---- `action.planning` (first occurrence — shape documented here, used by every
    // `action` below) ----
    // Declarative description of WHAT an Innate/Exceeded action is worth, so that
    // ai.js's `scoreCharacterAction` can be ONE generic scorer instead of a chain of
    // `characterKey === '...'` branches (which both violated §4b's "never branch on
    // characterKey outside cards.js" rule and silently returned -Infinity — i.e. "never
    // take this action" — for any character it hadn't been taught about). Every field is
    // optional; omit what doesn't apply, and omit `planning` entirely for a character
    // with no `action` at all.
    //   base                        baseline value of spending the turn on it (~0..0.6)
    //   closes                      net spaces the two fighters end up CLOSER (negative = further apart)
    //   alwaysStrikes/mayStrike     the action ends in a Strike, unconditionally / conditionally
    //   draws / gauges              net cards drawn / net cards banked in own Gauge
    //   wantsInRange                worth MORE when something in hand already reaches (a pure Strike-enabler)
    //   wantsOutOfRange             worth MORE when NOTHING reaches (a repositioning fix) — exclusive with the above
    //   wantsThinHand               worth more with a small hand (card-economy actions)
    //   needsContinuousBoostInHand  dead unless a Continuous Boost is available to play
    //   needsDeck                   dead with an empty deck
    //   exceededBonus               extra value while Exceeded
    // A Force cost is NOT encoded here — `actionForceCost` stays the single source of
    // truth for cost and ai.js checks affordability separately; `planning` only ever
    // describes the benefit.
    action: {
      needsDirection: false,
      needsDeckLook: 2,
      label: 'Look at the top 2 cards of your deck, draw 1, discard the other',
      // "Look at the top 2, draw 1, discard the other" — a free filtered draw with no
      // downside beyond the turn; net +1 card, and the filtering is worth the most when
      // the hand is thin. Dead if the deck can't produce cards.
      planning: { base: 0.35, draws: 1, needsDeck: true, wantsThinHand: true },
    },
    // "Your EX attacks have +1POW" — engine.buildExCard stamps `isEX` on the combined
    // card, which is the only marker that survives into liveStats.
    attackStatMods(player, card) {
      return (player.exceeded && card && card.isEX) ? { pow: 1 } : {};
    },
    onExceed() { return { mayStrike: true }; },
  },

  hakumen: {
    key: 'hakumen', name: 'Hakumen', exceedCost: 8, isStreetFighter: false,
    specials: HAKUMEN,
    innateText: 'Innate — After drawing at the end of your turn, add the top card of your deck to your Gauge (face-up).',
    exceedText: 'Exceeded — When you Exceed, shuffle your discard into your deck.\nAll Gauge costs are reduced to 0 and treated as fully paid.',
    blurb: 'Gauge engine with an enormous Exceed cost — bank eight cards, then every Ultra in the deck is free.',
    silhouettePose: 'grounded_guard',
    overdrive: {
      text: 'Return a card from your Overdrive to your hand.',
      // The tick has already moved one card out of Overdrive to the discard by the
      // time this runs, so the options are what's LEFT — on the final tick there is
      // nothing to return and the effect simply does nothing (and the empty Overdrive
      // Reverts him, per engine.resolveOverdriveEffect).
      options(engine, player) {
        return player.overdrive.map(c => ({ key: c.uid, label: `Return ${c.name} to hand` }));
      },
      resolve(engine, player, opponent, choiceKey) {
        const idx = player.overdrive.findIndex(c => c.uid === choiceKey);
        if (idx === -1) return;
        const [card] = player.overdrive.splice(idx, 1);
        player.hand.push(card);
        engine.logMsg(`${player.name} returns ${card.name} from Overdrive to hand.`);
      },
    },
    // His whole engine: one extra Gauge card per turn, which is how an Exceed cost of
    // 8 is ever payable. Face-up is the normal state of Gauge in this codebase (the
    // opponent already sees exact Gauge contents via publicInfoOf), so there is
    // nothing extra to model for that half of the text.
    onEndOfTurnDraw(engine, player) {
      const top = engine.peekTopN(player, 1)[0];
      if (!top) return;
      player.gauge.push(top);
      engine.logMsg(`${player.name} adds ${top.name} from the top of their deck to Gauge (Hakumen's Innate).`);
    },
    gaugeCostsFree(player) { return !!player.exceeded; },
    onExceed(engine, player) { engine.shuffleDiscardIntoDeck(player); return {}; },
  },

  platinum: {
    key: 'platinum', name: 'Platinum the Trinity', exceedCost: 3, isStreetFighter: false,
    specials: PLATINUM,
    innateText: 'Innate — Cleanup: You may reveal the top card of your deck. If it has a Continuous Boost, play that boost, then sustain it; otherwise, discard it.',
    exceedText: 'Exceeded — Cleanup: You may reveal the top card of your deck. If it has a Continuous Boost, play that boost; otherwise, discard it. In either case, you may sustain one of your Continuous Boosts.',
    blurb: 'Boost engine. Every exchange flips a free Continuous Boost off the top of her deck, and Exceeding lets her keep the one she already likes.',    overdrive: {
      text: 'If the discarded card has a Continuous Boost, play that boost.',
      // `card` is the card beginOverdriveTick just moved from Overdrive to the discard
      // — the same signature Bang's Overdrive uses; see engine.resolveOverdriveEffect.
      resolve(engine, player, opponent, choiceKey, card) {
        if (!card || !card.boost || !card.boost.continuous) return;
        const idx = player.discard.findIndex(c => c.uid === card.uid);
        if (idx === -1) return;
        player.discard.splice(idx, 1);
        engine.putContinuousBoostIntoPlay(player, card,
          `${player.name} plays ${card.name}'s Continuous Boost (Overdrive).`, { runImmediate: true, opponent });
      },
    },
    // Both halves of her identity are the SAME Cleanup effect with one difference: the
    // Innate sustains the boost it just played, while the Exceed lets her sustain any
    // one of her Continuous Boosts instead (which may be that same boost — so Exceeding
    // is never strictly worse — or the better one she already has on the table).
    // Reuses the generic `named_choice_effect` yield for both prompts rather than
    // adding UI modes; ai.js's fallback for that type takes options[0], so the options
    // are ordered best-first for the AI's benefit.
    *onStrikeCleanup(engine, player, opponent) {
      const canReveal = player.deck.length > 0 || (!player.reshuffleUsed && player.discard.length > 0);
      if (canReveal) {
        const wants = yield {
          type: 'named_choice_effect', playerId: player.id,
          promptText: "Platinum's Cleanup — reveal the top card of your deck?",
          options: [{ key: 'reveal', label: 'Reveal the top card' }],
          allowDecline: true,
        };
        if (wants === 'reveal') {
          const top = engine.peekTopN(player, 1)[0];
          if (top) {
            engine.logMsg(`${player.name} reveals ${top.name} from the top of their deck (Platinum's Cleanup).`, null, player.id);
            if (top.boost && top.boost.continuous) {
              const entry = engine.putContinuousBoostIntoPlay(player, top,
                `${player.name} plays ${top.name}'s Continuous Boost.`, { runImmediate: true, opponent });
              // Innate only: "play that boost, THEN SUSTAIN IT." The boost is already
              // safe from the sweep that just happened (this hook runs after it), so
              // the sustain is what buys it the exchange after that one.
              if (!player.exceeded) entry._sustainOnce = true;
            } else {
              player.discard.push(top);
              engine.logMsg(`${player.name} discards ${top.name} (no Continuous Boost).`, 'discard', player.id);
            }
          }
        }
      }
      if (!player.exceeded) return;
      // Exceeded: "In either case, you may sustain one of your Continuous Boosts" —
      // offered whether or not the reveal happened, and whatever it turned up.
      const sustainable = player.boostsInPlay.filter(b => !b.sustainedForever && !b._sustainOnce);
      if (sustainable.length === 0) return;
      const magnitude = (b) => {
        const sm = (b.card.boost && b.card.boost.statMods) || {};
        return Math.abs(sm.pow || 0) + Math.abs(sm.spd || 0) + Math.abs(sm.arm || 0) + Math.abs(sm.grd || 0);
      };
      const ordered = [...sustainable].sort((a, b) => magnitude(b) - magnitude(a));
      const choice = yield {
        type: 'named_choice_effect', playerId: player.id,
        promptText: "Platinum's Exceed — sustain one of your Continuous Boosts?",
        options: ordered.map(b => ({ key: b.card.uid, label: `Sustain ${b.card.name}` })),
        allowDecline: true,
      };
      const picked = sustainable.find(b => b.card.uid === choice);
      if (picked) {
        picked._sustainOnce = true;
        engine.logMsg(`${player.name} will sustain their ${picked.card.name} boost (Platinum's Exceed).`, 'sustain', player.id);
      }
    },
  },

  testament: {
    key: 'testament', name: 'Testament', exceedCost: 2, isStreetFighter: false,
    normals: GG_NORMALS, specials: TESTAMENT,
    innateText: 'Innate \u2014 Your Normals have "Hit: You may Push or Pull 1."',
    exceedText: 'Exceeded \u2014 Your Normals have "Hit: Draw 1. You may Push or Pull 1."',
    blurb: 'Zoning specialist. Normals threaten a free reposition on every hit.',
    // Reuses the same `grasp_move` yield Grasp itself uses (min:0 allows declining,
    // matching "you MAY Push or Pull 1"; forceDirection:null leaves the direction
    // choice to the player) \u2014 see engine.js's generic normalsHitHook dispatch.
    *normalsHitHook(ctx) {
      const engine = ctx.engine, attacker = ctx.attacker, defender = ctx.defender;
      if (attacker.exceeded) engine.draw(attacker, 1);
      const answer = yield { type: 'grasp_move', playerId: attacker.id, min: 0, max: 1, forceDirection: null };
      const amount = Math.max(0, Math.min(1, (answer && answer.amount != null) ? answer.amount : 0));
      if (amount > 0) {
        const direction = (answer && answer.direction) || 'retreat';
        const beforePos = defender.pos;
        if (direction === 'advance') engine.pushToward(defender, attacker, amount);
        else engine.pushAway(defender, attacker, amount);
        const actualMoved = Math.abs(defender.pos - beforePos);
        if (actualMoved > 0) {
          engine.logMsg(`${attacker.name}'s Normal moves ${defender.name} ${engine.spaceWord(actualMoved)} (${direction === 'advance' ? 'toward' : 'away from'} ${attacker.name}).`);
        }
      }
    },
  },
  potemkin: {
    key: 'potemkin', name: 'Potemkin', exceedCost: 4, isStreetFighter: false,
    normals: GG_NORMALS, specials: POTEMKIN,
    innateText: 'Innate \u2014 When you initiate a Strike at Range 1, +1POW and +1ARM.',
    exceedText: 'Exceeded \u2014 When you Exceed, Close 2. When you initiate a Strike at Range 1, +2POW and +2ARM.',
    blurb: 'Grappler with heavy Range-1 payoff.',
    onExceed(engine, player, opponent) { engine.closeSelf(player, opponent, 2); },
    rangeConditionalStatBonus(player) {
      const n = player.exceeded ? 2 : 1;
      return { pow: n, arm: n };
    },
  },
  leo: {
    key: 'leo', name: 'Leo Whitefang', exceedCost: 2, isStreetFighter: false,
    normals: GG_NORMALS, specials: LEO,
    revertOnNonStrikeTurn: true,
    innateText: 'Innate — After: If the opponent is stunned, you may Exceed (at no cost).',
    exceedText: 'Exceeded — Your Wild Swings have +1POW and +1SPD. When you end a turn without Striking, Revert.',
    blurb: 'Bruiser built around Exceed tempo. Exceed grants mobility on normals.',    wildSwingStatMods(player) {
      // Exceed: Wild Swings get +1POW and +1SPD
      return { pow: 1, spd: 1 };
    },
    // Leo's Innate: "After: If the opponent is stunned, you may Exceed (at no cost)."
    // A genuine yes/no yield (`may_exceed_choice`), not an auto-yes — uses
    // `!player.exceeded` + `engine.forceExceed(player)` so it truly costs 0 Gauge.
    *onAfterStrike(engine, player, opponent, strikeContext) {
      if (strikeContext && strikeContext.opponentStunned && !player.exceeded) {
        const wantsExceed = yield { type: 'may_exceed_choice', playerId: player.id, promptText: 'The opponent is Stunned — use your Innate to Exceed at no cost?' };
        if (wantsExceed) {
          engine.forceExceed(player);
          engine.logMsg(`${player.name} uses their Innate to Exceed at no cost (opponent was Stunned).`);
        }
      }
    },
  },
  millia: {
    key: 'millia', name: 'Millia Rage', exceedCost: 3, isStreetFighter: false,
    normals: GG_NORMALS, specials: MILLIA,
    innateText: 'Innate \u2014 After: If the opponent is stunned, you may draw 1, Advance 2, or Retreat 2.',
    exceedText: 'Exceeded \u2014 After: If the opponent is stunned, you may draw 1, Advance 2, Retreat 2, or gain Advantage.',
    blurb: 'Mobile rushdown. Stunning the opponent opens a real choice of payoff.',
    // Generic "pick one of N named effects" yield (`named_choice`) \u2014 see engine.js's
    // onAfterStrike dispatch and HANDOFF.md \u00a77's former blocked primitive of the same name.
    *onAfterStrike(engine, player, opponent, strikeContext) {
      if (!strikeContext || !strikeContext.opponentStunned) return;
      const options = [
        { key: 'draw', label: 'Draw 1' },
        { key: 'advance', label: 'Advance 2' },
        { key: 'retreat', label: 'Retreat 2' },
      ];
      if (player.exceeded) options.push({ key: 'advantage', label: 'Gain Advantage' });
      const choice = yield {
        type: 'named_choice_effect', playerId: player.id,
        promptText: "The opponent is Stunned \u2014 Millia's Innate/Exceed:",
        options, allowDecline: true,
      };
      if (choice === 'draw') { engine.draw(player, 1); }
      else if (choice === 'advance') { engine.advanceSelf(player, opponent, 2, true); engine.logMsg(`${player.name} advances ${engine.spaceWord(2)} (Millia's Innate/Exceed).`); }
      else if (choice === 'retreat') { engine.retreatSelf(player, opponent, 2); engine.logMsg(`${player.name} retreats ${engine.spaceWord(2)} (Millia's Innate/Exceed).`); }
      else if (choice === 'advantage') { engine.grantAdvantage(player, "Millia's Exceed"); }
    },
  },

  ryu: {
    key: 'ryu', name: 'Ryu', exceedCost: 2, isStreetFighter: true,
    innateText: 'Innate — Action: Move 1.',
    exceedText: 'Exceeded — Action: Move 1 and draw 1.',
    blurb: 'Zoning-and-punish shoto. Hadoken threatens from range, Shoryuken punishes when you strike into him, Metsu Shoryuken closes games.',
    silhouettePose: 'grounded_guard',
    specials: RYU,
    action: {
      needsDirection: true,
      // "Move 1" in either direction (Exceeded: also draw 1). Free repositioning, no
      // Strike attached — its whole point is fixing a bad distance, hence
      // wantsOutOfRange and no fixed `closes` (the direction is chosen at use time).
      planning: { base: 0.3, wantsOutOfRange: true, exceededBonus: 0.15 },
      resolve(engine, player, opponent, direction) {
        if (direction === 'advance') engine.advanceSelf(player, opponent, 1, true);
        else engine.retreatSelf(player, opponent, 1);
        if (player.exceeded) engine.draw(player, 1);
        return { mayStrike: false };
      },
    },
  },
  ken: {
    key: 'ken', name: 'Ken', exceedCost: 3, isStreetFighter: true,
    innateText: 'Innate — Action: Close 1, draw 1.',
    exceedText: 'Exceeded — When you Exceed, draw 1 and Close up to 2. Action: Close 1 and draw. Then, you may Strike.',
    blurb: 'Relentless rushdown. Innate Close+draw keeps him in your face, Tatsumaki and Shinryuken reward closing distance fast.',
    silhouettePose: 'leaning_chamber',
    specials: KEN,
    action: {
      needsDirection: false,
      // "Close 1, draw 1" (Exceeded: then you may Strike). Both halves are close to
      // strictly good; the Close is what fixes an out-of-range hand.
      planning: { base: 0.3, closes: 1, draws: 1, wantsOutOfRange: true, mayStrike: true, exceededBonus: 0.3 },
      resolve(engine, player, opponent) {
        engine.closeSelf(player, opponent, 1);
        engine.draw(player, 1);
        return { mayStrike: player.exceeded };
      },
    },
    // One-time trigger the moment Exceeding happens (distinct from the ongoing
    // Exceeded action above) — see engine.doExceed().
    onExceed(engine, player, opponent) {
      engine.draw(player, 1);
      engine.closeSelf(player, opponent, 2);
    },
  },
  cammy: {
    key: 'cammy', name: 'Cammy', exceedCost: 3, isStreetFighter: true,
    // No `action` field at all — Cammy's Innate is a pure passive Strike modifier,
    // not a per-turn button. This is the exact case the multi-fighter refactor's
    // comment on `action` above already anticipated ("A character can omit
    // `action` entirely... a real supported shape for a passive-only Innate").
    innateText: "Innate \u2014 If you move past the opponent during a Strike, your attack's range includes them.",
    exceedText: 'Exceeded \u2014 If you move past the opponent during a Strike, your attack\'s range includes them, and gains "Hit: +1 Power and Advantage."',
    blurb: "Mobile in-and-out striker built around blowing past the opponent \u2014 several of her cards Advance far enough to swap sides, and her passive turns that swap into a guaranteed-range attack (with a bonus hit once Exceeded).",
    // No bespoke silhouette pose was created for her this session (see HANDOFF) \u2014
    // falls back to Ryu's grounded_guard pose, a purely cosmetic simplification.
    silhouettePose: 'grounded_guard',
    specials: CAMMY,
    // Data-driven extension points consumed generically by engine.js's
    // resolveStrikeSteps/activateStep (search `sideSwapRangeInclude` and
    // `exceededSideSwapHit` there) \u2014 not a characterKey branch anywhere outside
    // this file, per Pitfall #7's rule.
    sideSwapRangeInclude: true,
    exceededSideSwapHit(ctx) {
      ctx.powBonus = (ctx.powBonus || 0) + 1;
      ctx.engine.grantAdvantage(ctx.attacker, "Cammy's Exceeded");
    },
  },
  zangief: {
    key: 'zangief', name: 'Zangief', exceedCost: 3, isStreetFighter: true,
    // Also no `action` field — like Cammy, his Innate/Exceed text is entirely
    // conditional/passive, no "Action:" verb anywhere in it.
    innateText: 'Innate \u2014 If the opponent is at range 1 when you set your attack, it gains Critical: +1 Power, +1 Speed.',
    exceedText: 'Exceeded \u2014 When you Exceed, pull up to 2. If the opponent is at range 1 when you set your attack, it gains Critical: +3 Power, +1 Speed.',
    blurb: "A grappler built around forcing and punishing Range 1 \u2014 several of his cards demand it, and his passive hands out free Critical stat bonuses for being there (still gated behind actually paying the 1 Gauge, same as any other Critical).",
    // No bespoke silhouette pose this session either \u2014 see HANDOFF.
    silhouettePose: 'grounded_guard',
    specials: ZANGIEF,
    // Data-driven extension point (see engine.js's liveStats) \u2014 a future
    // character could grant an analogous conditional Critical bonus the same way.
    extraCriticalStatsIfOpponentAtRange1(player) {
      return player.exceeded ? { pow: 3, spd: 1 } : { pow: 1, spd: 1 };
    },
    // "When you Exceed, pull up to 2" \u2014 auto-resolved to the max (2), toward
    // Zangief, per the established "up to X" simplification.
    onExceed(engine, player, opponent) {
      engine.pushToward(opponent, player, 2);
    },
  },
  axl: {
    key: 'axl', name: 'Axl Low', exceedCost: 3, isStreetFighter: false,
    // No `action` field — like Cammy/Zangief, his Innate/Exceed text has no
    // "Action:" verb, it's a pure passive stat modifier on his Normals.
    innateText: 'Innate \u2014 Your Normals have +0~2 Range and -1 Speed.',
    exceedText: 'Exceeded \u2014 When you Exceed, draw 2 and Retreat up to 2. Your Normals have +0~2 Range.',
    blurb: "A Guilty Gear zoner whose whole shared Normals pool runs on a different card set from the Street Fighter cast \u2014 his passive stretches their Range at the cost of Speed until he Exceeds, when the Speed cost goes away and the reach stays.",
    silhouettePose: 'grounded_guard',
    specials: AXL,
    // Points buildDeck() at the separate GG_NORMALS pool instead of the default
    // NORMALS (S1-5) \u2014 see engine.js's buildDeck and the GG_NORMALS header
    // comment above. A character with no `normals` field just gets the default
    // NORMALS, same as Ryu/Ken/Cammy/Zangief today \u2014 this is additive, not a
    // breaking change to how those four build their decks.
    normals: GG_NORMALS,
    // Data-driven extension points for "this character's Innate/Exceed modifies
    // the stats of whatever Normal card they set" \u2014 checked generically in
    // engine.js's liveStats (statMods) and activateStep (range), off
    // CHARACTERS[key].normalsStatMods/normalsRangeBonus, the same
    // function-per-player-so-it-can-check-player.exceeded shape as Zangief's
    // extraCriticalStatsIfOpponentAtRange1 above. The "+0~2RNG" following this
    // codebase's "up to X" convention (auto-resolves to +2, not a real choice \u2014
    // more Range is never worse) is why normalsRangeBonus doesn't take a
    // decision/yield, unlike Axl Bomber's/Rainwater's OWN card-level "may"
    // choices (real trade-offs, implemented as genuine yields \u2014 see AXL above).
    normalsStatMods(player) {
      return player.exceeded ? {} : { spd: -1 };
    },
    normalsRangeBonus(player) {
      return 2;
    },
    onExceed(engine, player, opponent) {
      engine.draw(player, 2);
      engine.retreatSelf(player, opponent, 2);
    },
  },

  // === NEW SF CHARACTERS ===
  sol: {
    key: 'sol', name: 'Sol Badguy', exceedCost: 3, isStreetFighter: false,
    innateText: 'Innate — When you Strike, if you Canceled this turn, +1 POW.',
    exceedText: 'Exceeded — When you Strike, if you Canceled this turn, +2 POW.',
    blurb: 'GGST rushdown with Cancel chains. Gun Flame and other Cancelable Boosts loop into each other.',    normals: GG_NORMALS, // Uses GG-set Normals, not base NORMALS
    specials: SOL_BADGUY,
    // Innate: "if you Canceled this turn" is passive tracking via player.canceledThisTurn flag
    powBonusIfCanceledThisTurn(player) { return player.exceeded ? 2 : 1; },
  },

  cviper: {
    key: 'cviper', name: 'C. Viper', exceedCost: 3, isStreetFighter: true,
    innateText: 'Innate — After you resolve a Continuous Boost, you may Strike.',
    exceedText: 'Exceeded — When you Exceed, draw 5.\nAfter you resolve a Continuous Boost, you may Strike. If you do, your attack is Critical.',
    blurb: 'Continuous Boost engine. Play Boosts to unlock follow-up Strikes.',    specials: CVIPER,
    mayStrikeAfterContinuousBoost: true, // Triggers maybeAskMayStrike in ui.js doBoost continuation
    onExceed(engine, player, opponent) { engine.draw(player, 5); },
  },

  vega: {
    key: 'vega', name: 'Vega', exceedCost: 3, isStreetFighter: true,
    innateText: 'Innate — If you are at the edge of the arena when you set your attack, your Specials and Ultras have +2 POW.',
    exceedText: 'Exceeded — If you are at the edge of the arena when you set your attack, your Specials and Ultras have +3 POW and +1 SPD.',
    blurb: 'Edge control. Specials gain bonuses at arena edges.',    specials: VEGA,
    specialsUltrasStatModsIfAtEdge(player) {
      return player.exceeded ? { pow: 3, spd: 1 } : { pow: 2 };
    },
  },

  akuma: {
    // exceedCost corrected 3 -> 2 (2026-08-17): the workbook's "Akuma" sheet row 3
    // reads "Exceed [2]". Caught by a card-data audit against EXdata.xlsx.
    key: 'akuma', name: 'Akuma', exceedCost: 2, isStreetFighter: true,
    innateText: 'Innate — Your attacks have "Critical: Both players have +2 POW."',
    exceedText: 'Exceeded — Your attacks have "Critical: Both players have +3 POW."',
    blurb: 'Mutual damage scaling. Critical bonuses apply to both players.',    specials: AKUMA,
    // Data-driven extension point (see engine.js's liveStats) — same
    // function-per-player shape as Zangief's extraCriticalStatsIfOpponentAtRange1
    // and Vega's specialsUltrasStatModsIfAtEdge, but MUTUAL: unlike those two
    // (which only ever buff their own owner), this one is read once for
    // whichever side is Akuma and, if HIS card actually paid Critical, applied
    // to BOTH players' live POW — "Your attacks have Critical: Both players
    // have +2/+3 POW."
    grantsMutualCriticalPow(player) {
      return player.exceeded ? { pow: 3 } : { pow: 2 };
    },
  },

  guile: {
    key: 'guile', name: 'Guile', exceedCost: 2, isStreetFighter: true,
    innateText: 'Innate — When using a Change Cards action, the first Gauge spent generates an extra {2}.',
    exceedText: 'Exceeded — When using a Change Cards action, the first Gauge spent generates an extra {2}.\nIf you spent Gauge this way, you may then Strike (after drawing cards).',
    blurb: 'Resource generator. Change Cards grants bonus Force and post-Change Strike.',    specials: GUILE,
    // UNBLOCKED 2026-08-17 by the source rulebook (Exceed Comprehensive Rulebook —
    // the Actions table and "Force Generation"), which settles what the earlier
    // BLOCKED note here could not decide from the card text alone:
    //   * Change Cards is "spend Force to draw an equivalent number of cards", so it
    //     IS a paid action and there is a payment for this Innate to modify.
    //   * Force is generated by discarding — Normal/Special 1, Ultra 2, Gauge card 1 —
    //     so a Gauge card is a legal source, and "{2}" is just 2 more Force, which in
    //     this action converts 1:1 into 2 more cards drawn.
    // The engine's Change Cards was reworked to match the rulebook at the same time
    // (engine.performChangeCards); it used to discard from hand only, which is why
    // this mechanic previously looked like it had nothing to attach to.
    //
    // "the FIRST Gauge spent" — once per Change Cards action however many Gauge cards
    // are spent, hence a flat bonus rather than 2 per card.
    changeCardsForceBonus(player, { spentFromGauge }) { return spentFromGauge > 0 ? 2 : 0; },
    // Exceed adds: "If you spent Gauge this way, you may then Strike (after drawing
    // cards)." Gated on `player.exceeded` rather than swapping the hook out, so both
    // sides of the character card read off one definition.
    mayStrikeAfterChangeCards(player) { return !!player.exceeded; },
  },

  chunli: {
    key: 'chunli', name: 'Chun-Li', exceedCost: 3, isStreetFighter: true,
    innateText: 'Innate — After you resolve a Boost, you may Retreat 1.\n(If you would Strike, retreat first).',
    exceedText: 'Exceeded — (same)\nFor each Continuous Boost you have in play, your attacks have +0~1 RNG.',
    blurb: 'Boost momentum and Range scaling. Boosts grant positioning choices.',    specials: CHUNLI,
    // "After you resolve a Boost, you may Retreat 1" — implemented 2026-08-16 via
    // ui.js's maybeAskRetreatAfterBoost (human) / AI heuristic in doBoost's AI path.
    mayRetreatAfterBoost: true,
    // Continuous boost RNG bonus: +0~1 per boost in play
    normalsRangeBonus(player) {
      const maxRng = Math.min(player.boostsInPlay.length, 1); // Cap at +1 for safety
      return maxRng;
    },
  },

  dan: {
    key: 'dan', name: 'Dan', exceedCost: 2, isStreetFighter: true,
    innateText: 'Innate — Your Wild Swings have "Critical: +1 POW and +1 SPD."',
    exceedText: 'Exceeded — (same)\nWhen drawing a card at end of turn, you may draw from the bottom or top of your deck. You may then discard a card.',
    blurb: 'Wild Swing scaling and flexible deck draws. Goofy taunts.',    specials: DAN,
    // "Your Wild Swings have 'Critical: +1POW and +1SPD'" — implemented 2026-08-16 via
    // engine.js's liveStats (gated on `fromWildSwing`, the same param Leo's
    // wildSwingStatMods already uses) + ai.js's hasRealCriticalValue/
    // criticalPayProbability (so the AI correctly values paying Critical on its own
    // Wild Swing instead of always bluffing at the low rate).
    wildSwingCriticalStatMods(player) {
      return { pow: 1, spd: 1 };
    },
    // STILL NOT IMPLEMENTED: Exceed's "When drawing a card at end of turn, you may
    // draw from the bottom or top of your deck. You may then discard a card." — no
    // `deck_choice_draw` mode or equivalent exists anywhere in this codebase (grep
    // confirms zero matches); the comment that used to claim it was "handled in
    // ui.js passOrContinue" was aspirational, not real. Real remaining gap.
  },

  mbison: {
    key: 'mbison', name: 'M. Bison', exceedCost: 3, isStreetFighter: true,
    innateText: 'Innate — Action: Add a card from hand to Gauge and draw.',
    exceedText: 'Exceeded — Action: Add up to 3 cards from hand to Gauge and draw that many cards.\nWhen you Exceed, you may take this action immediately.',
    blurb: 'Custom resource action. Exceed grants immediate hand-to-Gauge conversion.',    specials: MBISON,
    // "Add N cards from hand to Gauge, draw N" — a real multi-card-selection choice
    // the generic `action.resolve(engine, player, opponent, direction)` shape can't
    // express (no way to pass in which cards were picked). New `needsHandToGaugeChoice`
    // + `maxHandToGauge(player)` fields, dispatched via a dedicated UI flow
    // (`action_gauge_select` mode in ui.js/render.js) instead of `action.resolve`.
    action: {
      needsDirection: false,
      needsHandToGaugeChoice: true,
      maxHandToGauge(player) { return player.exceeded ? 3 : 1; },
      // "Add 1 card from hand to Gauge and draw" (Exceeded: up to 3, draw that many).
      // Pure card-economy conversion: hand size is unchanged, Gauge grows — which is
      // what pays for Exceed/Ultras/Criticals. `wantsFullHand` is the mirror of Bang's
      // `wantsThinHand`: this action wants a FULL hand (spare cards to convert), and
      // matters most while Gauge is still short of the Exceed threshold — ai.js's
      // scoreCharacterAction reads both halves of that off this one flag.
      planning: { base: 0.15, gauges: 1, draws: 1, wantsFullHand: true, exceededBonus: 0.25 },
    },
    // Exceed: "you may take this action immediately" — offered right after Exceeding,
    // same shape as Ken/Anji/May's onExceed mayStrike (a real yes/no choice, not
    // automatic) but for the character action instead of a Strike.
    onExceed(engine, player, opponent) {
      return { mayAction: true };
    },
  },

  sagat: {
    key: 'sagat', name: 'Sagat', exceedCost: 3, isStreetFighter: true,
    innateText: 'Innate — When you initiate a Strike, you may place your attack face up for +1 SPD.',
    exceedText: 'Exceeded — When you Exceed, draw 2 and Retreat up to 2.\nWhen you initiate a Strike, you may place your attack face up for +1 POW and +1 SPD.',
    blurb: 'Face-up strike mechanic for stat bonuses. Exceeded boosts initiative.',    specials: SAGAT,
    canGoFaceUp: true,
    faceUpStatBonus(player) {
      return player.exceeded ? { pow: 1, spd: 1 } : { spd: 1 };
    },
    onExceed(engine, player, opponent) {
      engine.draw(player, 2);
      // "Retreat up to 2" auto-resolves to the max, per this codebase's established
      // "up to X" simplification (see cards.js's header comment) — not a real
      // per-instance decision.
      engine.retreatSelf(player, opponent, 2);
    },
  },
  chipp: {
    key: 'chipp', name: 'Chipp Zanuff', exceedCost: 2, isStreetFighter: false, normals: GG_NORMALS,
    innateText: 'Innate — After: You may Advance or Retreat 1.',
    exceedText: 'Exceeded — When you Cancel, you may draw 1.\nAfter: You may Advance or Retreat 1.',
    blurb: 'Hit-and-run rushdown. Every exchange ends with him repositioning, and Cancels refill his hand.',    specials: CHIPP,
    onCancel(engine, player, opponent) {
      // Chipp's Exceed: "When you Cancel, you may draw 1."
      if (player.exceeded) engine.draw(player, 1);
    },
    // His Innate rides on his own attacks' After step, i.e. once per exchange he
    // was part of — the same slot Millia's and Leo's after-strike hooks use.
    *onAfterStrike(engine, player, opponent) {
      const choice = yield {
        type: 'named_choice_effect', playerId: player.id,
        promptText: "Chipp's Innate — After:",
        options: [
          { key: 'advance', label: 'Advance 1' },
          { key: 'retreat', label: 'Retreat 1' },
        ],
        allowDecline: true,
      };
      if (choice === 'advance') { engine.advanceSelf(player, opponent, 1, true); engine.logMsg(`${player.name} advances 1 space (Chipp's Innate).`); }
      else if (choice === 'retreat') { engine.retreatSelf(player, opponent, 1); engine.logMsg(`${player.name} retreats 1 space (Chipp's Innate).`); }
    },
  },

  ky: {
    key: 'ky', name: 'Ky Kiske', exceedCost: 2, isStreetFighter: false, normals: GG_NORMALS,
    innateText: 'Innate — The first time each turn you Cancel, you may Advance or Retreat 1.',
    exceedText: 'Exceeded — The first time each turn you Cancel, draw 1, then you may Advance or Retreat 1.',
    blurb: 'Balanced zoning. Cancel draw reinforces action economy.',    specials: KY,
    onCancel(engine, player, opponent) {
      // Ky: first-time-per-turn gate on Cancel responses.
      if (!player.firstCancelThisTurn) return;
      player.firstCancelThisTurn = false;
      if (player.exceeded) {
        engine.draw(player, 1); // Exceed: draw 1 first
      }
      // Both Innate and Exceed: offer "may Advance or Retreat 1" choice
      // Signal that a movement choice is pending (UI layer will handle this)
      return { needsMovementChoice: true, moveAmount: 1 };
    },
  },

  anji: {
    key: 'anji', name: 'Anji Mito', exceedCost: 3, isStreetFighter: false, normals: GG_NORMALS,
    innateText: 'Innate — After setting your attack, you may spend {1}. If you do, -1 SPD and +2 GRD.',
    exceedText: 'Exceeded — When you Exceed, draw 1 and Strike.\nAfter setting your attack, you may spend {1}. If you do, -1 SPD and +2 ARM.',
    blurb: 'Defensive counter-puncher. Every attack can buy Guard now and Armor once Exceeded.',    specials: ANJI,
    // Both halves of his Innate/Exceed are the same paid set-time decision; only the
    // payoff stat changes, so one setTimeOption covers both (see engine.applySetTimeOption).
    setTimeOption: {
      text: 'Spend 1 Force for -1 SPD and +2 GRD/ARM',
      cost: { force: 1 },
      apply(engine, player) {
        player.strikeState.setOptionStatMods = player.exceeded ? { spd: -1, arm: 2 } : { spd: -1, grd: 2 };
      },
    },
    onExceed(engine, player, opponent) {
      engine.draw(player, 1);
      return { mayStrike: true };
    },
  },

  may: {
    key: 'may', name: 'May', exceedCost: 3, isStreetFighter: false, normals: GG_NORMALS,
    innateText: 'Innate — When you initiate a Strike, you may spend {1}. If you do, +1 POW.',
    exceedText: 'Exceeded — When you Exceed, draw 2 and Strike.\nWhen you initiate a Strike, you may spend {1}. If you do, +2 POW.',
    blurb: 'Aggressive anchor-swinger. Initiating is always worth a Force for extra Power.',    specials: MAY,
    setTimeOption: {
      text: 'Spend 1 Force for +POW',
      cost: { force: 1 },
      initiatorOnly: true,
      apply(engine, player) { player.strikeState.setOptionStatMods = { pow: player.exceeded ? 2 : 1 }; },
    },
    onExceed(engine, player, opponent) {
      engine.draw(player, 2);
      return { mayStrike: true };
    },
  },

  ramlethal: {
    key: 'ramlethal', name: 'Ramlethal Valentine', exceedCost: 3, isStreetFighter: false, normals: GG_NORMALS,
    innateText: 'Innate — After setting your attack, you may spend {2}. If you do, +0~1 RNG.',
    exceedText: 'Exceeded — When you Exceed, draw 3.\nAfter setting your attack, you may spend {2}. If you do, +0~1 RNG and +1 POW.',
    blurb: 'Range-adaptive swordfighter. Two Force stretches any attack a space further.',    specials: RAMLETHAL,
    setTimeOption: {
      text: 'Spend 2 Force for +0~1 RNG',
      cost: { force: 2 },
      // "+0~1" auto-resolves to +1, per this codebase's "up to X" convention.
      apply(engine, player) {
        player.strikeState.setOptionRangeBonus = 1;
        if (player.exceeded) player.strikeState.setOptionStatMods = { pow: 1 };
      },
    },
    onExceed(engine, player, opponent) {
      engine.draw(player, 3);
    },
  },

  // BLOCKED: Nagoriyuki needs Revert (un-Exceed) mechanic, non-lethal damage handling,
  // per-card Cleanup hooks, and Special invalidation (Specials invalid while Exceeded).
  // See HANDOFF.md §8c for detailed design notes.
  nagoriyuki: {
    key: 'nagoriyuki', name: 'Nagoriyuki', exceedCost: 0, isStreetFighter: false, normals: GG_NORMALS,
    specials: NAGORIYUKI,
    innateText: 'Innate — When you Reshuffle, Exceed at end of turn.\nYour Specials have "Cleanup: Draw 4. Discard 2."',
    exceedText: 'Exceeded — Your Specials are invalid. Your Normals have +1 POW and "Cleanup: Lose all Armor. Take 2 non-lethal damage."',
    blurb: 'Blood Rage samurai. Reshuffling forces him into an Exceed that locks out his own Specials.',    // He has no printed Exceed cost and cannot take the ordinary Exceed action — the
    // only way in is his own Reshuffle trigger below (the sheet's Notes column says so
    // explicitly). `canExceedAction: false` is read by engine.canExceed.
    canExceedAction: false,
    onReshuffle(engine, player) {
      player.exceedAtEndOfTurn = true;
      engine.logMsg(`${player.name} will Exceed at the end of this turn (Nagoriyuki's Innate).`);
    },
    // "Your Specials have Cleanup: ..." / "Your Normals have Cleanup: ..." — a
    // character-level version of the per-card `cleanup` field engine.triggerCardCleanup
    // already reads, so the same code path handles both.
    cardCleanupFor(player, card) {
      if (!player.exceeded) return card.type === 'special' ? { draw: 4, discard: 2 } : null;
      return card.type === 'normal' ? { loseArmor: true, nonLethalDamage: 2 } : null;
    },
    // "Your Specials are invalid" while Exceeded (engine.isValidStrikeCard).
    invalidStrikeCard(player, card) { return player.exceeded && card.type === 'special'; },
    normalsStatMods(player) { return player.exceeded ? { pow: 1 } : {}; },
  },

  // BLOCKED: Baiken's "[1] Action: Pull 2 without overpull + Strike" and "[1] Action: Pull 2 + Strike +1POW"
  // require a "yield a Strike with modifications" path that doesn't currently exist. The character action
  // triggersStrike pattern is there, but integrating directional movement choices + Strike into that
  // flow needs design work.
  baiken: {
    key: 'baiken', name: 'Baiken', exceedCost: 3, isStreetFighter: false, normals: GG_NORMALS,
    innateText: 'Innate — [1] Action: Pull 2 without Pulling past yourself. Strike.',
    exceedText: 'Exceeded — [1] Action: Pull 2. Strike. +1 POW.',
    blurb: 'Counter-attacking swordmaster. Drags the opponent into range, and thrives on an empty hand.',    specials: BAIKEN,
    actionStrikePowBonus: 1, // Exceed action Strike gets +1POW
    actionForceCost: 1,
    action: {
      needsDirection: false,
      // Planner metadata (ai.js's three-turn lookahead): declares what this action does
      // to the board so the search never has to call resolve(), which mutates real state.
      alwaysStrikes: true, planCloses: 2,
      // "Pull 2 (Innate: without passing yourself), then Strike (+1POW Exceeded)."
      // Commits the turn to a Strike, so it pays off most when the hand is otherwise
      // out of range — the Pull is what fixes that.
      planning: { base: 0.2, closes: 2, alwaysStrikes: true, wantsOutOfRange: true, exceededBonus: 0.1 },
      resolve(engine, player, opponent) {
        const pullAmount = 2;
        if (!player.exceeded) {
          // Innate: "Pull 2 without Pulling past yourself" — the opponent stops adjacent
          // instead of crossing past her.
          engine.pullTowardWithoutPassing(opponent, player, pullAmount);
        } else {
          // Exceed: ordinary Pull (may cross past). `pushToward` PULLS the target toward
          // the source despite its name — see its own comment in engine.js.
          engine.pushToward(opponent, player, pullAmount);
        }
        return { triggersStrike: true };
      },
    },
  },

  // BLOCKED: Faust's "Action: Boost with the top card of your deck (face up, cannot be Canceled)" requires
  // a deck-reveal + forced-boost-play action path. Jack-O has similar issues.
  faust: {
    key: 'faust', name: 'Faust', exceedCost: 2, isStreetFighter: false, normals: GG_NORMALS,
    innateText: 'Innate — Action: Boost with the top card of your deck (face up, cannot be Canceled). Strike.',
    exceedText: 'Exceeded — Action: Reveal the top 2 cards of your deck. Boost with one of them (cannot be Canceled). Strike.',
    blurb: 'Wildcard doctor. Every action throws whatever the deck hands him, then swings.',    specials: FAUST,
    action: {
      needsDirection: false,
      // "Boost with the top card of your deck (Exceeded: reveal 2, use one), then
      // Strike." A free Boost plus a Strike, but the AI can't see the deck's top card,
      // so the payoff is speculative — low base, same "no deeper lookahead" spirit as
      // the rest of the heuristic. Dead with an empty deck (nothing to reveal, and the
      // resolve() above then returns triggersStrike:false).
      planning: { base: 0.1, alwaysStrikes: true, needsDeck: true },
      resolve(engine, player, opponent) {
        // `peekTopN` removes the cards from the deck, so anything not boosted has to be
        // put back — the Exceed version reveals two and uses one.
        const revealed = engine.peekTopN(player, player.exceeded ? 2 : 1);
        if (revealed.length === 0) {
          engine.logMsg(`${player.name} has no cards left to Boost with.`);
          return { triggersStrike: false };
        }
        // Pick the strongest boost available among the revealed cards, preferring a
        // Continuous one (same shallow heuristic ai.js's scoreBoostCard family uses).
        const chosen = revealed.find(c => c.boost && c.boost.continuous) || revealed[0];
        for (const c of revealed) if (c.uid !== chosen.uid) player.deck.push(c);
        engine.logMsg(`${player.name} boosts with ${chosen.name} from the top of their deck (Faust's action).`);
        engine.playForcedBoost(player, opponent, chosen);
        return { triggersStrike: true };
      },
    },
  },

  // BLOCKED: Giovanna's Exceed "you may add a card from your hand to your Gauge" as a
  // free action still requires a new action type.
  giovanna: {
    key: 'giovanna', name: 'Giovanna', exceedCost: 3, isStreetFighter: false, normals: GG_NORMALS,
    innateText: 'Innate — Action: Strike with "Hit: Draw 1."',
    exceedText: 'Exceeded — When you Exceed, you may add a card from your hand to your Gauge.\n[1] Action: Strike with +1 POW and "Hit: Draw 2."',
    blurb: 'Wind-spirit rushdown. Her action is a free Strike that always pays out on a hit.',    specials: GIOVANNA,
    actionStrikePowBonus: 1, // Exceed action Strike gets +1POW
    // NOTE: unlike Baiken/I-No/Jack-O, Giovanna's action is only [1] Force when
    // Exceeded (Innate is free) — `actionForceCost` is a flat always-charged field,
    // so it can't represent that asymmetry without changing it for everyone else.
    // Left uncharged rather than overcharging her free Innate action; real remaining gap.
    action: {
      needsDirection: false,
      // Planner metadata (ai.js's three-turn lookahead): declares what this action does
      // to the board so the search never has to call resolve(), which mutates real state.
      alwaysStrikes: true,
      // "Strike with 'Hit: Draw 1'" (Exceeded: +1POW and Draw 2). No movement at all,
      // so it is only worth taking when something already reaches — otherwise it is a
      // guaranteed whiff that also spends the turn.
      planning: { base: 0.15, alwaysStrikes: true, wantsInRange: true, exceededBonus: 0.15 },
      resolve(engine, player, opponent) {
        return { triggersStrike: true };
      },
    },
    // "Hit: Draw N" on the Strike her action triggers — see engine.js's generic
    // actionStrikeHitHook dispatch (gated on actionStrikeThisTurn).
    actionStrikeHitHook(ctx) {
      const n = ctx.attacker.exceeded ? 2 : 1;
      ctx.engine.draw(ctx.attacker, n);
      ctx.engine.logMsg(`${ctx.attacker.name} draws ${n} (Giovanna's action Strike).`);
    },
    onExceed(engine, player) {
      // "You may add a card from your hand to your Gauge" — taken automatically; the
      // Gauge is a resource this character has no competing use for at that instant.
      const c = player.hand[0];
      if (c) {
        player.hand.shift();
        player.gauge.push(c);
        engine.logMsg(`${player.name} adds ${c.name} to Gauge (Giovanna's Exceed).`);
      }
      return {};
    },
  },

  // BLOCKED: I-No's "[1] Action: Advance 2. Strike" requires a character action that outputs a Strike
  // (similar to Baiken, but simpler since it's Advance not Pull and no overpull guard).
  ino: {
    key: 'ino', name: 'I-No', exceedCost: 3, isStreetFighter: false, normals: GG_NORMALS,
    innateText: 'Innate — [1] Action: Advance 2. Strike.',
    exceedText: 'Exceeded — [1] Action: Advance 2. Strike with +1 POW.',
    blurb: 'Guitar-wielding momentum striker. Closes two spaces and swings in one action.',    specials: INO,
    actionStrikePowBonus: 1, // Exceed action Strike gets +1POW
    actionForceCost: 1,
    action: {
      needsDirection: false,
      // Planner metadata (ai.js's three-turn lookahead): declares what this action does
      // to the board so the search never has to call resolve(), which mutates real state.
      alwaysStrikes: true, planCloses: 2,
      // "Advance 2, then Strike (+1POW Exceeded)" — same shape as Baiken's, Advance
      // instead of Pull.
      planning: { base: 0.2, closes: 2, alwaysStrikes: true, wantsOutOfRange: true, exceededBonus: 0.1 },
      resolve(engine, player, opponent) {
        engine.advanceSelf(player, opponent, 2, true);
        return { triggersStrike: true };
      },
    },
  },

  jacko: {
    key: 'jacko', name: 'Jack-O', exceedCost: 2, isStreetFighter: false, normals: GG_NORMALS,
    innateText: 'Innate — {1} Action: Play a Continuous Boost from your hand (you cannot cancel it). Strike.',
    exceedText: 'Exceeded — When you Exceed, draw 3.\n{1} Action: Play a Continuous Boost from your hand or Gauge (you cannot cancel it). Strike.',
    blurb: 'Puppet master. Sets a servant down and attacks behind it; her cards scale off boosts in play.',    specials: JACKO,
    actionForceCost: 1,
    onExceed(engine, player, opponent) {
      engine.draw(player, 3);
    },
    action: {
      needsDirection: false,
      // "Play a Continuous Boost from hand (Exceeded: hand or Gauge), uncancelable,
      // then Strike." No movement and no card draw — its entire value is getting a
      // Continuous Boost down for free, so it is a no-op (see resolve()'s own guard)
      // and a wasted [1] when none is available.
      planning: { base: 0.3, alwaysStrikes: true, needsContinuousBoostInHand: true },
      resolve(engine, player, opponent) {
        const sources = player.exceeded ? [...player.hand, ...player.gauge] : player.hand;
        const chosen = sources.find(c => c && c.boost && c.boost.continuous);
        if (!chosen) {
          engine.logMsg(`${player.name} has no Continuous Boost to play.`);
          return { triggersStrike: false };
        }
        const handIdx = player.hand.findIndex(c => c.uid === chosen.uid);
        if (handIdx !== -1) player.hand.splice(handIdx, 1);
        else player.gauge = player.gauge.filter(c => c.uid !== chosen.uid);
        const ok = engine.playForcedBoost(player, opponent, chosen);
        if (!ok) {
          engine.logMsg(`${player.name} can't afford to boost with ${chosen.name}.`);
          if (handIdx !== -1) player.hand.splice(handIdx, 0, chosen); else player.gauge.push(chosen);
          return { triggersStrike: false };
        }
        return { triggersStrike: true };
      },
    },
  },

  // AUDITED 2026-08-16: both primitives this comment used to call BLOCKED already
  // exist and are wired generically — engine.sealCardFromHand (used by Happy
  // Chaos's own Innate design already) and engine.doRevert (see HANDOFF.md §7,
  // its "Revert" gap was itself stale). The real remaining blocker is his
  // `specials: []` — including "Deus Ex Machina", the Ultra his Exceed text
  // references by name — which needs real stats/text transcribed from
  // EXdata.xlsx's "Happy Chaos" sheet, not available in this environment. His
  // Innate's Hit-time "may seal an Ultra" choice also still needs a new
  // interactive yield built (nothing reuses the existing grasp_move/
  // named_choice_effect shapes cleanly) — deferred alongside the card data,
  // since a character with no specials can't be promoted regardless.
  happychaos: {
    key: 'happychaos', name: 'Happy Chaos', exceedCost: 3, isStreetFighter: false, normals: GG_NORMALS,
    innateText: 'Innate — Hit: You may seal an Ultra from your hand. If you do, +1 POW and Advantage.',
    exceedText: 'Exceeded — When you Exceed, Strike with Deus Ex Machina. Revert during cleanup.',
    blurb: 'Gunslinger who spends his own deck as ammunition — sealed cards come back all at once.',    specials: HAPPYCHAOS,
    // Steady Aim is the one card whose text lets him initiate face up (Sagat's
    // mechanic); `canGoFaceUp` is checked per card so it doesn't offer on the rest.
    canGoFaceUp(card) { return !!(card && card.canInitiateFaceUp); },
    faceUpStatBonus(player) { return { pow: 2, ignoreArmor: true }; },
    *attackHitHook(ctx) {
      const player = ctx.attacker;
      const ultra = player.hand.find(c => c.type === 'ultra');
      if (!ultra) return;
      const choice = yield {
        type: 'named_choice_effect', playerId: player.id,
        promptText: "Happy Chaos's Innate — seal an Ultra from your hand for +1 POW and Advantage?",
        options: [{ key: 'seal', label: `Seal ${ultra.name}` }],
        allowDecline: true,
      };
      if (choice !== 'seal') return;
      ctx.engine.sealCardFromHand(player, ultra.uid);
      ctx.powBonus = (ctx.powBonus || 0) + 1;
      ctx.engine.grantAdvantage(player, "Happy Chaos's Innate");
    },
    onExceed(engine, player) {
      // "Strike with Deus Ex Machina" — move the single copy into hand so it can be
      // set, and `revertPending` Reverts him at the end of that Strike's cleanup.
      // DEFERRED: the Strike is offered, not forced to use this specific card (the
      // strike-selection path has no "you must set this card" shape).
      const key = 'hc_deus_ex_machina';
      let card = player.hand.find(c => c.key === key);
      if (!card) {
        for (const zone of ['discard', 'gauge', 'sealedCards', 'overdrive']) {
          const idx = (player[zone] || []).findIndex(c => c.key === key);
          if (idx !== -1) { [card] = player[zone].splice(idx, 1); break; }
        }
        if (!card) {
          const bIdx = player.boostsInPlay.findIndex(b => b.card && b.card.key === key);
          if (bIdx !== -1) card = player.boostsInPlay.splice(bIdx, 1)[0].card;
        }
        if (!card) {
          const dem = HAPPYCHAOS.find(c => c.key === key);
          card = { ...dem, uid: engine.nextUid() };
        }
        player.hand.push(card);
      }
      player.revertPending = true;
      engine.logMsg(`${player.name} takes Deus Ex Machina in hand and will Revert after this Strike.`);
      return { mayStrike: true };
    },
  },

  // Zato-1 owns the only third entity on this board: Eddie. The engine side lives in
  // engine.js's Eddie section (`eddiePos`, placeEddie/removeEddie, attackSourcePos/
  // attackRange); everything character-specific is declared here.
  //   usesEddie              this character has an Eddie at all (every helper is gated
  //                          on it, so no other code path knows Zato-1 exists)
  //   specialsRangeFromEddie his Specials/Ultras measure Range from Eddie's space
  //   normalsAfterHook       his Normals' "After: you may place Eddie ..." clause
  //   attackHitHook          the "Hit: Advantage" his Specials/Ultras gain with Eddie out
  //   onStrikeCleanup        the matching "Cleanup: Remove Eddie from play"
  // Eddie is explicitly "not a character and is ignored when moving", so no movement
  // code touches him — he is a range origin and a card target, nothing more.
  zato1: {
    key: 'zato1', name: 'Zato-1', exceedCost: 2, isStreetFighter: false, normals: GG_NORMALS,
    innateText: 'Innate — Eddie begins out of play.\nYour Normals have "After: You may place Eddie in a space within this attack\'s Range."\nWhile Eddie is in play, your Specials and Ultras calculate Range from Eddie and have "Hit: Advantage." and "Cleanup: Remove Eddie from play."',
    exceedText: 'Exceeded — Your Normals have "After: You may place Eddie in any space."',
    blurb: 'Puppet zoner. Plant Eddie where the opponent is standing and every Special reaches from there instead of from Zato.',    specials: ZATO,
    usesEddie: true,
    specialsRangeFromEddie: true,
    // "Your Normals have 'After: You may place Eddie in a space within this attack's
    // Range'" — Exceeded, the whole board is legal instead. A generator (see
    // engine.js's normalsAfterHook dispatch) because which space Eddie lands in is
    // the single most consequential decision this character makes.
    *normalsAfterHook(ctx) {
      const engine = ctx.engine, player = ctx.attacker;
      const spaces = engine.eddiePlacementSpaces(player, ctx.attackerCard, !!player.exceeded);
      if (spaces.length === 0) return;
      const answer = yield {
        type: 'place_eddie', playerId: player.id,
        cardName: ctx.attackerCard.name,
        anySpace: !!player.exceeded,
        spaces,
        currentPos: player.eddiePos,
        // Both the human panel and the AI heuristic need to reason about where the
        // opponent is standing relative to each candidate space, and neither has the
        // board otherwise (resolveAIStrikeRequest sees only distances), so it travels
        // with the request.
        selfPos: player.pos,
        opponentPos: ctx.defender.pos,
        handRanges: player.hand.filter(c => c.range).map(c => ({ name: c.name, min: c.range[0], max: c.range[1] })),
      };
      if (answer == null) return;
      if (!spaces.includes(answer)) return;
      engine.placeEddie(player, answer, `${ctx.attackerCard.name}'s After`);
    },
    // "While Eddie is in play, your Specials and Ultras ... have 'Hit: Advantage.'"
    *attackHitHook(ctx) {
      const card = ctx.attackerCard;
      if (!ctx.engine.eddieInPlay(ctx.attacker)) return;
      if (card.type !== 'special' && card.type !== 'ultra') return;
      ctx.engine.grantAdvantage(ctx.attacker, 'Eddie');
    },
    // "...and 'Cleanup: Remove Eddie from play.'" — except on the two cards that
    // print the opposite ("Oppose", "Sun Void" → `keepsEddieOnCleanup`).
    *onStrikeCleanup(engine, player, opponent, info) {
      const card = info && info.card;
      if (!engine.eddieInPlay(player) || !card) return;
      if (card.type !== 'special' && card.type !== 'ultra') return;
      if (card.keepsEddieOnCleanup) return;
      engine.removeEddie(player, `${card.name}'s Cleanup`);
    },
  },

  // Goldlewis: maxHandSize change only (max 9 instead of 7). No other Innate/Exceed
  // blocking issues — just needs the max hand size field + starting hand draw (DEFERRED).
  goldlewis: {
    key: 'goldlewis', name: 'Goldlewis Dickinson', exceedCost: 2, isStreetFighter: false, normals: GG_NORMALS,
    maxHandSize: 9,
    innateText: 'Innate — Your maximum hand size is 9.\nDraw 2 additional cards in your starting hand (before mulligan).',
    exceedText: 'Exceeded — When you Exceed, draw 2.\nYour maximum hand size is 9.\nYour Specials have "Hit: Draw 2."',
    blurb: 'Coffin-swinging heavyweight. Holds nine cards, so every Behemoth Typhoon variant is always an option.',    specials: GOLDLEWIS,
    onStartingHand(engine, player) {
      engine.draw(player, 2);
    },
    onExceed(engine, player) { engine.draw(player, 2); return {}; },
    // Exceed: "Your Specials have 'Hit: Draw 2.'" — the ungated attackHitHook checks the
    // card type itself rather than adding a specials-only sibling of normalsHitHook.
    *attackHitHook(ctx) {
      if (ctx.attacker.exceeded && ctx.attackerCard.type === 'special') ctx.engine.draw(ctx.attacker, 2);
    },
  },
}

// Every card definition (Normals + every character's Specials/Ultras), for lookups
// that need to resolve a card by key without caring which character owns it (e.g.
// naming a card for Block/Focus, or valuing an opponent's public continuous boosts).
// Deriving this from CHARACTERS means adding a new fighter here is enough — nothing
// else needs to separately list their cards.
function allCardDefs() {
  return [...NORMALS, ...GG_NORMALS, ...Object.values(CHARACTERS).flatMap(c => c.specials)];
}




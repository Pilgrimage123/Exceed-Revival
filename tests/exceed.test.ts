import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dirname, '..');
const HTML_PATH = path.join(ROOT, 'exceed_poc.html');

function createDomStub() {
  const elements = new Map<string, { innerHTML: string; textContent: string; style: Record<string, string>; classList: { add: () => void; remove: () => void } }>();
  const getOrCreate = (id: string) => {
    let el = elements.get(id);
    if (!el) {
      el = {
        innerHTML: '',
        textContent: '',
        style: {},
        classList: { add: () => {}, remove: () => {} },
      };
      elements.set(id, el);
    }
    return el;
  };
  return {
    elements,
    document: {
      getElementById: (id: string) => getOrCreate(id),
      querySelector: () => null,
      querySelectorAll: () => [],
    },
  };
}

function loadGameSandbox() {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const scriptMatches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const code = scriptMatches.map((m) => m[1]).join('\n;\n');
  const dom = createDomStub();
  let alertCalled = false;

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
    document: dom.document,
    window: {},
    location: { reload: () => {} },
    alert: () => {
      alertCalled = true;
    },
  };

  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'exceed_poc.html' });

  const evalExpr = <T = unknown>(expr: string): T =>
    vm.runInContext(expr, sandbox) as T;

  return {
    sandbox,
    dom,
    evalExpr,
    wasAlertCalled: () => alertCalled,
  };
}

test('bundled exceed_poc.html contains no alert(), dead NORMAL_KEYS, Windows paths, or player.armor mutations', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.equal(/\balert\s*\(/.test(html), false, 'Should not call window.alert()');
  assert.equal(/\bconst NORMAL_KEYS\b/.test(html), false, 'Dead NORMAL_KEYS constant should be removed');
  assert.equal(/D:\\programy/.test(html), false, 'Machine-local Windows paths should be removed');
  assert.equal(/player\.armor\s*=/.test(html), false, 'Should not write non-existent player.armor property');
});

test('native CPU bridge is opt-in, validates its protocol, and falls back cleanly', () => {
  const { evalExpr } = loadGameSandbox();
  const result = evalExpr<{
    initiallyReady: boolean;
    fallbackWasNull: boolean;
    registeredAction: string;
    moveZeroLegal: boolean;
    snapshotSeed: number;
    hash: string;
    utf8Hash: string;
  }>(`
    (() => {
      const initiallyReady = NativeCpuAI.status().ready;
      NativeCpuAI.setMode('modern');
      const fallbackWasNull = NativeCpuAI.chooseNeutralAction({ protocolVersion: 1 }) === null;
      NativeCpuAI.registerBackend({ protocolVersion: 1, chooseNeutralAction: () => ({ type: 'prepare' }) });
      const registeredAction = NativeCpuAI.chooseNeutralAction({ protocolVersion: 1 }).type;
      const moveZeroLegal = isNativeActionLegal(
        { type: 'move', targetSpace: 0 },
        { characterKey: 'ryu', pos: 1, hand: [{ uid: 'c1', key: 'sweep', type: 'normal' }], gauge: [], boostsInPlay: [] },
        { pos: 6 },
        false
      );
      const snap = NativeCpuAI.decisionSnapshot(
        { characterKey: 'ryu', life: 30, pos: 2, hand: [], deck: [], gauge: [], discard: [], boostsInPlay: [] },
        { characterKey: 'ken', life: 30, pos: 6, handCount: 5, deckCount: 25, gauge: [], discard: [], boostsInPlay: [] },
        false,
        { seed: 42 }
      );
      return {
        initiallyReady,
        fallbackWasNull,
        registeredAction,
        moveZeroLegal,
        snapshotSeed: snap.seed,
        hash: NativeCpuAI.canonicalTraceHash({ a: 1 }),
        utf8Hash: NativeCpuAI.canonicalTraceHash({ name: 'Chun-Li—é' }),
      };
    })()
  `);
  assert.equal(result.initiallyReady, false);
  assert.equal(result.fallbackWasNull, true);
  assert.equal(result.registeredAction, 'prepare');
  assert.equal(result.moveZeroLegal, true);
  assert.equal(result.snapshotSeed, 42);
  assert.equal(result.hash, '9c3e82dd6fcae8b1');
  assert.equal(result.utf8Hash, '75575cda03f23a7c');
});

test('AI deckKeysForCharacter matches Engine buildDeck identically for all 41 fighters', () => {
  const { evalExpr } = loadGameSandbox();
  const mismatches = evalExpr<string[]>(`
    (() => {
      const bad = [];
      for (const k of Object.keys(CHARACTERS)) {
        const deckKeys = buildDeck(k).map(c => c.key).sort();
        const aiKeys = deckKeysForCharacter(k).slice().sort();
        if (deckKeys.length !== aiKeys.length || deckKeys.join(',') !== aiKeys.join(',')) {
          bad.push(k + ': buildDeck=' + deckKeys.length + ' vs ai=' + aiKeys.length);
        }
      }
      return bad;
    })()
  `);
  assert.deepEqual(Array.from(mismatches), []);
});

test('Exceed persists across non-Strike turns for standard and Overdrive fighters, and only reverts for Leo', () => {
  const { evalExpr } = loadGameSandbox();
  const res = evalExpr<{
    ryuStaysExceeded: boolean;
    ragnaStaysExceeded: boolean;
    ragnaOverdriveTicked: boolean;
    leoRevertsHuman: boolean;
    leoRevertsAi: boolean;
  }>(`
    (() => {
      // 1. Standard fighter (Ryu) exceeds -> must stay Exceeded after finishNonStrikeAction
      const gRyu = new GameController('ryu', 'ken', 'champion');
      G = gRyu;
      gRyu.confirmMulligan();
      const ryu = gRyu.human();
      ryu.gauge.push(ryu.deck.pop(), ryu.deck.pop());
      gRyu.actionExceed();
      const ryuStaysExceeded = ryu.exceeded === true;

      // 2. BlazBlue Overdrive fighter (Ragna) exceeds -> stays Exceeded & ticks Overdrive
      const gRagna = new GameController('ragna', 'jin', 'champion');
      G = gRagna;
      gRagna.confirmMulligan();
      const ragna = gRagna.human();
      for (let i = 0; i < 4; i++) ragna.gauge.push(ragna.deck.pop());
      gRagna.actionExceed();
      const ragnaStaysExceeded = ragna.exceeded === true && ragna.overdrive.length === 4;
      const tick = gRagna.engine.beginOverdriveTick(ragna);
      const ragnaOverdriveTicked = !!tick && ragna.overdrive.length === 3;

      // 3. Leo reverts when ending a non-Strike turn without striking (human & AI)
      const gLeo = new GameController('leo', 'leo', 'champion');
      G = gLeo;
      gLeo.confirmMulligan();
      const leoH = gLeo.human();
      const leoA = gLeo.ai();
      gLeo.engine.forceExceed(leoH);
      leoH.strikeThisTurn = false;
      gLeo.finishNonStrikeAction();
      const leoRevertsHuman = leoH.exceeded === false;

      gLeo.engine.forceExceed(leoA);
      leoA.strikeThisTurn = false;
      gLeo.aiFinishNonStrike();
      const leoRevertsAi = leoA.exceeded === false;

      return { ryuStaysExceeded, ragnaStaysExceeded, ragnaOverdriveTicked, leoRevertsHuman, leoRevertsAi };
    })()
  `);
  assert.equal(res.ryuStaysExceeded, true);
  assert.equal(res.ragnaStaysExceeded, true);
  assert.equal(res.ragnaOverdriveTicked, true);
  assert.equal(res.leoRevertsHuman, true);
  assert.equal(res.leoRevertsAi, true);
});

test('Leo Innate allows zero-cost Exceed with 0 Gauge when opponent is Stunned', () => {
  const { evalExpr } = loadGameSandbox();
  const res = evalExpr<{ yielded: boolean; exceeded: boolean; gaugeAfter: number }>(`
    (() => {
      const eng = new Engine('leo', 'ryu');
      const leo = eng.P('p1'), ryu = eng.P('p2');
      leo.gauge = [];
      const gen = CHARACTERS.leo.onAfterStrike(eng, leo, ryu, { opponentStunned: true });
      const first = gen.next();
      const yielded = !first.done && first.value && first.value.type === 'may_exceed_choice';
      gen.next(true);
      return { yielded, exceeded: leo.exceeded, gaugeAfter: leo.gauge.length };
    })()
  `);
  assert.equal(res.yielded, true);
  assert.equal(res.exceeded, true);
  assert.equal(res.gaugeAfter, 0);
});

test('Critical mechanic is restricted to Street Fighter in engine, AI probability, and How to Play copy', () => {
  const { evalExpr } = loadGameSandbox();
  const res = evalExpr<{
    sfCanPay: boolean;
    ggCanPay: boolean;
    bbCanPay: boolean;
    sfProb: number;
    ggProb: number;
    bbProb: number;
    guideMentionsSfOnly: boolean;
  }>(`
    (() => {
      const eng = new Engine('ryu', 'sol');
      const ryu = eng.P('p1'), sol = eng.P('p2');
      ryu.gauge.push(ryu.deck.pop());
      sol.gauge.push(sol.deck.pop());
      const engBb = new Engine('ragna', 'jin');
      const ragna = engBb.P('p1');
      ragna.gauge.push(ragna.deck.pop());
      const normalCard = NORMALS[0];
      return {
        sfCanPay: eng.canPayCritical(ryu),
        ggCanPay: eng.canPayCritical(sol),
        bbCanPay: engBb.canPayCritical(ragna),
        sfProb: criticalPayProbability(normalCard, 'ryu', 1, false, 1),
        ggProb: criticalPayProbability(normalCard, 'sol', 1, false, 1),
        bbProb: criticalPayProbability(normalCard, 'ragna', 1, false, 1),
        guideMentionsSfOnly: HOWTOPLAY_INTRO.includes('Street Fighter characters can pay 1 Gauge')
          && HOWTOPLAY_INTRO.includes('Guilty Gear and BlazBlue fighters do not use the Critical mechanic'),
      };
    })()
  `);
  assert.equal(res.sfCanPay, true);
  assert.equal(res.ggCanPay, false);
  assert.equal(res.bbCanPay, false);
  assert.ok(res.sfProb > 0);
  assert.equal(res.ggProb, 0);
  assert.equal(res.bbProb, 0);
  assert.equal(res.guideMentionsSfOnly, true);
});

test('CPU character actions with triggersStrike actually initiate a Strike (Baiken)', () => {
  const { evalExpr } = loadGameSandbox();
  const res = evalExpr<{ mode: string; actionStrikeThisTurn: boolean; hasPendingAttack: boolean }>(`
    (() => {
      const g = new GameController('ryu', 'baiken', 'champion');
      G = g;
      g.confirmMulligan();
      const origChooseAction = chooseAction;
      chooseAction = () => ({ type: 'action' });
      try {
        g.engine.active = g.aiId;
        g.runAITurn();
      } finally {
        chooseAction = origChooseAction;
      }
      return {
        mode: g.mode,
        actionStrikeThisTurn: g.ai().actionStrikeThisTurn,
        hasPendingAttack: !!g.pendingAiAttack,
      };
    })()
  `);
  assert.equal(res.mode, 'defend_select');
  assert.equal(res.actionStrikeThisTurn, true);
  assert.equal(res.hasPendingAttack, true);
});

test('playBoost optionalForceSpend never overspends Force when an Ultra (2 Force) is included', () => {
  const { evalExpr } = loadGameSandbox();
  const res = evalExpr<{ ok: boolean; handRemaining: number; normalStillInHand: boolean }>(`
    (() => {
      const eng = new Engine('axl', 'ryu');
      const axl = eng.P('p1'), ryu = eng.P('p2');
      // Find Winter Mantis (optionalForceSpend max: 2, base force: 0)
      const mantis = axl.deck.find(c => c.boost && c.boost.optionalForceSpend);
      const ultra = axl.deck.find(c => c.type === 'ultra');
      const normal = axl.deck.find(c => c.type === 'normal');
      axl.deck = axl.deck.filter(c => c !== mantis && c !== ultra && c !== normal);
      axl.hand = [mantis, ultra, normal];
      const preDeckLen = axl.deck.length;
      // Pass [ultra (2 Force), normal (1 Force)] when maxAllowed is 2 -> must ONLY discard ultra!
      const out = eng.playBoost(axl, ryu, mantis.uid, [], { bonusForceUids: [ultra.uid, normal.uid] });
      const normalStillInHand = axl.hand.some(c => c.uid === normal.uid);
      return { ok: out.ok, handRemaining: axl.hand.length, normalStillInHand };
    })()
  `);
  assert.equal(res.ok, true);
  assert.equal(res.normalStillInHand, true);
});

test('Nagoriyuki Exceed cleanup deals non-lethal damage without writing bogus player.armor', () => {
  const { evalExpr } = loadGameSandbox();
  const res = evalExpr<{ hasArmorProp: boolean; lifeAfter: number }>(`
    (() => {
      const eng = new Engine('nagoriyuki', 'ryu');
      const nago = eng.P('p1');
      eng.forceExceed(nago);
      const normal = nago.deck.find(c => c.type === 'normal');
      eng.triggerCardCleanup(nago, normal);
      return {
        hasArmorProp: Object.prototype.hasOwnProperty.call(nago, 'armor'),
        lifeAfter: nago.life,
      };
    })()
  `);
  assert.equal(res.hasArmorProp, false);
  assert.equal(res.lifeAfter, 28);
});

test('Renderer respects Goldlewis 9-card hand limit, deckReferenceHTML exact copy counts, and Exceed button labels', () => {
  const { evalExpr, dom, wasAlertCalled } = loadGameSandbox();
  const res = evalExpr<{
    goldlewisDiscardText: string;
    hcDeckRef: string;
    ragnaDeckRef: string;
    nagoButtons: string;
    ryuExceededButtons: string;
  }>(`
    (() => {
      const gGold = new GameController('goldlewis', 'ryu', 'champion');
      G = gGold;
      gGold.confirmMulligan();
      while (gGold.human().hand.length < 10) gGold.engine.draw(gGold.human(), 1);
      gGold.mode = 'discard_to_seven';
      gGold.sel = { chosen: [] };
      paint();
      const goldlewisDiscardText = document.getElementById('app').innerHTML;

      const hcDeckRef = deckReferenceHTML('happychaos');
      const ragnaDeckRef = deckReferenceHTML('ragna');

      const gNago = new GameController('nagoriyuki', 'ryu', 'champion');
      G = gNago;
      const nagoButtons = actionButtons(gNago);

      const gRyu = new GameController('ryu', 'ken', 'champion');
      G = gRyu;
      gRyu.engine.forceExceed(gRyu.human());
      const ryuExceededButtons = actionButtons(gRyu);

      return { goldlewisDiscardText, hcDeckRef, ragnaDeckRef, nagoButtons, ryuExceededButtons };
    })()
  `);

  assert.match(res.goldlewisDiscardText, /Hand size limit is 9 — discard 1 card\(s\)/);
  assert.match(res.hcDeckRef, /×0 \(starts in play\)/);
  assert.match(res.ragnaDeckRef, /×1 \(Astral Heat\)/);
  assert.match(res.nagoButtons, /Exceed \[—\]/);
  assert.match(res.nagoButtons, /Via Reshuffle only/);
  assert.match(res.ryuExceededButtons, /Already Exceeded/);
  assert.equal(wasAlertCalled(), false);
});

test('Headless full-match simulation across Street Fighter, Guilty Gear, and BlazBlue completes cleanly', () => {
  const { evalExpr } = loadGameSandbox();
  const res = evalExpr<{ completed: number; total: number; violations: string[]; unfinished: string[] }>(`
    (() => {
      // Deterministic PRNG so test runs are 100% reproducible
      let seed = 0x517cc1b7;
      Math.random = () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const matchups = [
        ['ryu', 'ken'],
        ['baiken', 'nagoriyuki'],
        ['leo', 'goldlewis'],
        ['ragna', 'hakumen'],
        ['zato1', 'happychaos'],
        ['axl', 'cviper'],
      ];
      const violations = [];
      const unfinished = [];
      let completed = 0;
      for (const [c1, c2] of matchups) {
        const g = new GameController(c1, c2, 'champion');
        G = g;
        g.confirmMulligan();
        let steps = 0;
        while (g.mode !== 'game_over' && !g.engine.winner && steps++ < 800) {
          if (g.engine.active === g.aiId && g.mode === 'awaiting_action') {
            g.runAITurn();
          } else if (g.engine.active === g.humanId && g.mode === 'awaiting_action') {
            g.suggestMove();
            const me = g.human(), opp = g.ai();
            const act = chooseAction({ me, mePublicFull: me, oppPublic: publicInfoOf(opp), canExceed: g.engine.canExceed(me), rng: Math.random, randomness: 0, myBoostMods: g.engine.activeBoostMods(me) });
            if (act.type === 'strike') g.startStrike();
            else if (act.type === 'move') {
              const sim = act.direction === 'retreat'
                ? g.engine.simulateRetreat(me, opp, act.amount || 1)
                : g.engine.simulateAdvance(me, opp, act.amount || 1);
              if (sim.moved > 0 && g.engine.totalForceInHandOrGauge(me) >= sim.forceCost) {
                g.startMove();
                g.pickMove(act.direction || 'advance', act.amount || 1);
              } else {
                g.actionPrepare();
              }
            }
            else if (act.type === 'exceed' && g.engine.canExceed(me)) g.actionExceed();
            else if (act.type === 'reshuffle' && !me.reshuffleUsed) g.actionReshuffle();
            else if (act.type === 'action' && CHARACTERS[me.characterKey].action) g.actionSpecial();
            else if (act.type === 'boost' && act.uid) g.pickBoostCard(act.uid);
            else g.actionPrepare();
          } else if (g.mode === 'move_force_select') {
            const p = g.human();
            const needed = g.sel.forceCost || 0;
            const pool = [...p.hand, ...p.gauge];
            const chosen = [];
            let sum = 0;
            for (const c of pool) {
              if (sum >= needed) break;
              chosen.push(c.uid);
              sum += g.engine.forceValueOfCard(c);
            }
            g.sel.chosen = chosen;
            g.confirmMove();
          } else if (g.mode === 'boost_force_select') {
            const p = g.human();
            const needed = g.sel.cost || 0;
            const exclude = g.sel.cardUid;
            const pool = [...p.hand.filter(c => c.uid !== exclude), ...p.gauge];
            const chosen = [];
            let sum = 0;
            for (const c of pool) {
              if (sum >= needed) break;
              chosen.push(c.uid);
              sum += g.engine.forceValueOfCard(c);
            }
            g.sel.chosen = chosen;
            g.confirmBoostForce();
          } else if (g.mode === 'boost_bonus_force_select') {
            g.sel.bonusChosen = [];
            g.confirmBonusForce();
          } else if (g.mode === 'name_choice') {
            const opts = (g.sel && g.sel.pool) || [];
            if (opts.length) g.pickNamedKey(opts[0]); else { g.mode = 'awaiting_action'; g.actionPrepare(); }
          } else if (g.mode === 'range_name_choice') {
            g.pickNamedRange(1);
          } else if (g.mode === 'boost_target_choice') {
            const t = (g.sel && g.sel.targets && g.sel.targets[0]);
            if (t) g.pickBoostTarget(t.uid); else { g.mode = 'awaiting_action'; g.actionPrepare(); }
          } else if (g.mode === 'decklook_choice') {
            g.confirmDeckLookChoice('skip');
          } else if (g.mode === 'strike_select') {
            const p = g.human();
            const valid = p.hand.find(c => g.engine.isValidStrikeCard(p, c) && (c.type !== 'ultra' || g.engine.gaugeCount(p) >= (c.gaugeCost || 0)));
            if (valid) g.pickStrikeCard(valid.uid); else g.pickWildSwing();
          } else if (g.mode === 'defend_select') {
            const p = g.human();
            const forcedUid = g.sel && g.sel.forcedUid;
            if (forcedUid) g.humanDefend({ type: 'hand', uid: forcedUid });
            else {
              const valid = p.hand.find(c => g.engine.isValidStrikeCard(p, c) && (c.type !== 'ultra' || g.engine.gaugeCount(p) >= (c.gaugeCost || 0)));
              if (valid) g.humanDefend({ type: 'hand', uid: valid.uid }); else g.humanDefend({ type: 'wildswing' });
            }
          } else if (g.mode === 'critical_choice') g.resolveCriticalChoice(false);
          else if (g.mode === 'face_up_choice') g.resolveFaceUpChoice(false);
          else if (g.mode === 'set_time_option_choice') g.resolveSetTimeOption(false);
          else if (g.mode === 'strike_result') g.continueAfterStrikeResult();
          else if (g.mode === 'discard_to_seven') {
            const p = g.human();
            const maxH = g.engine.getMaxHandSize(p.characterKey);
            g.sel.chosen = p.hand.slice(0, p.hand.length - maxH).map(c => c.uid);
            g.confirmDiscardToSeven();
          } else if (g.mode === 'overdrive_choice') g.resolveOverdriveChoice(((g.sel.options || [])[0] || {}).key || 'skip');
          else if (g.mode === 'grasp_choice') g.resolveGraspChoice(1, 'retreat');
          else if (g.mode === 'block_force_choice') { g.sel.chosen = []; g.confirmBlockForce(); }
          else if (g.mode === 'named_choice_effect') g.resolveNamedChoiceEffect(((g.sel.request.options || [])[0] || {}).key || null);
          else if (g.mode === 'may_exceed_choice') g.resolveMayExceedChoice(true);
          else if (g.mode === 'hadoken_recycle_choice') g.resolveHadokenRecycle(false);
          else if (g.mode === 'sustain_choice') g.resolveSustainChoice(true);
          else if (g.mode === 'sustain_choice_paid') g.resolveSustainChoicePaid(false);
          else if (g.mode === 'optional_force_spend_pow_choice') g.resolveOptionalForceSpendPow(0);
          else if (g.mode === 'optional_gauge_spend_choice') g.resolveOptionalGaugeSpend(false);
          else if (g.mode === 'optional_retreat_choice') g.resolveOptionalRetreat(false);
          else if (g.mode === 'push_pull_choice') g.pickPushPullDirection('push');
          else if (g.mode === 'move_direction_choice') g.pickMoveDirection('advance');
          else if (g.mode === 'place_eddie_choice') g.resolvePlaceEddie(null);
          else if (g.mode === 'eddie_space_choice') g.pickEddieSpace(g.sel.spaces[0]);
          else if (g.mode === 'cancel_choice') g.resolveCancelChoice(false);
          else if (g.mode === 'may_strike_choice') g.resolveMayStrikeChoice(false);
          else if (g.mode === 'retreat_after_boost_choice') g.resolveRetreatAfterBoostChoice(false);
          else if (g.mode === 'char_exceed_strike_choice' || g.mode === 'char_exceed_action_choice') g.finishNonStrikeAction();
          else if (g.mode === 'range_discard_choice') g.resolveRangeDiscardChoice(g.sel.matchingCards[0].uid);
          else if (g.mode === 'special_move1') g.resolveSpecialMove1('advance');
          else { g.mode = 'awaiting_action'; g.actionPrepare(); }

          const p1 = g.engine.P('p1'), p2 = g.engine.P('p2');
          if (Number.isNaN(p1.life) || Number.isNaN(p2.life)) violations.push(c1 + ' vs ' + c2 + ': NaN life');
          if (p1.pos === p2.pos) violations.push(c1 + ' vs ' + c2 + ': overlapping tokens');
          if (p1.pos < 0 || p1.pos >= BOARD_SIZE || p2.pos < 0 || p2.pos >= BOARD_SIZE) violations.push(c1 + ' vs ' + c2 + ': OOB pos');
        }
        if (g.engine.winner) completed++;
        else unfinished.push(c1 + ' vs ' + c2 + ' (mode=' + g.mode + ', life=' + g.engine.P('p1').life + '/' + g.engine.P('p2').life + ')');
      }
      return { completed, total: matchups.length, violations, unfinished };
    })()
  `);
  assert.deepEqual(Array.from(res.violations), []);
  assert.deepEqual(Array.from(res.unfinished), []);
  assert.equal(res.completed, res.total);
});

test('Core engine & card-rule regression fixes (Anji ARM/GRD, playForcedBoost, EX self-pair, payUltra, KO, One Vision, Vega/Ryu/Sol/HC)', () => {
  const { evalExpr } = loadGameSandbox();
  const res = evalExpr<{
    anjiArmDelta: number;
    anjiGrdDelta: number;
    forcedBoostDiscarded: boolean;
    exSelfPairRejected: boolean;
    emptyDeckWildSwingHandled: boolean;
    koStoppedDefender: boolean;
    oneVisionSustainedOnMiss: boolean;
    vegaFreeCrit: boolean;
    vegaRangeBonus: number;
    vegaSplendidPow: number;
    vegaSplendidArm: number;
    ryuShoryuToGauge: boolean;
    solGunFlameContinuous: boolean;
    solBanditIgnoreGuard: boolean;
    hcSingleDemCopy: boolean;
  }>(`
    (() => {
      // 1. Anji set-time +2 GRD (normal) and +2 ARM (exceeded)
      const eAnji = new Engine('anji', 'ryu');
      const p1 = eAnji.P('p1'), p2 = eAnji.P('p2');
      p1.pos = 2; p2.pos = 3;
      const sweep = p1.hand.find(c => c.key === 'gg_sweep') || { ...GG_NORMALS.find(c => c.key === 'gg_sweep'), uid: eAnji.nextUid() };
      const p2Sweep = { ...NORMALS.find(c => c.key === 'sweep'), uid: eAnji.nextUid() };
      p1.hand.push({ ...NORMALS[0], uid: eAnji.nextUid() });
      CHARACTERS.anji.setTimeOption.apply(eAnji, p1, true);
      eAnji.runStrikeAuto({
        initiator: 'p1',
        attackerSel: { card: sweep, fromWildSwing: false },
        defenderSel: { card: { ...p2Sweep, pow: 2 }, fromWildSwing: false },
        gaugePay: {},
      }, () => ({}));
      const anjiGrdDelta = eAnji.lastStrikeInfo.sides.p1.live.grd - sweep.grd;

      p1.exceeded = true;
      CHARACTERS.anji.setTimeOption.apply(eAnji, p1, true);
      eAnji.runStrikeAuto({
        initiator: 'p1',
        attackerSel: { card: { ...sweep, uid: eAnji.nextUid() }, fromWildSwing: false },
        defenderSel: { card: { ...p2Sweep, pow: 2 }, fromWildSwing: false },
        gaugePay: {},
      }, () => ({}));
      const anjiArmDelta = eAnji.lastStrikeInfo.sides.p1.live.arm - sweep.arm;

      // 2. playForcedBoost discards non-continuous boosts instead of deleting them
      const eFb = new Engine('ryu', 'ken');
      const fbP1 = eFb.P('p1'), fbP2 = eFb.P('p2');
      const oneShot = { ...NORMALS.find(c => c.key === 'cross'), uid: eFb.nextUid() };
      fbP1.hand.push(oneShot);
      const fbOk = eFb.playForcedBoost(fbP1, fbP2, oneShot);
      const forcedBoostDiscarded = fbOk && fbP1.discard.some(c => c.uid === oneShot.uid);

      // 3. EX Strike rejects pairing a card with itself
      const eEx = new Engine('ryu', 'ken');
      const exP1 = eEx.P('p1');
      const cA = { ...NORMALS[0], uid: 'dup1' };
      exP1.hand = [cA];
      const exSelfPairRejected = eEx.resolveStrikeCardSelection(exP1, { type: 'ex', uid1: 'dup1', uid2: 'dup1' }) === null;

      // 4. payUltra on empty deck+discard (reshuffle already used) sets gameOver cleanly without double-discarding
      const ePu = new Engine('ryu', 'ken');
      const puA = ePu.P('p1');
      puA.deck = []; puA.discard = []; puA.gauge = []; puA.reshuffleUsed = true;
      const ultra = { ...CHARACTERS.ryu.specials.find(c => c.type === 'ultra'), uid: 'u1' };
      ePu.runStrikeAuto({
        initiator: 'p1',
        attackerSel: { card: ultra, fromWildSwing: false },
        defenderSel: { card: { ...NORMALS[0], uid: 'd1' }, fromWildSwing: false },
        gaugePay: {},
      }, () => ({}));
      const emptyDeckWildSwingHandled = ePu.gameOver === true && puA.discard.filter(c => c.uid === 'u1').length === 1;

      // 5. Immediate 0-HP KO stops slower defender from activating
      const eKo = new Engine('ryu', 'ken');
      const koA = eKo.P('p1'), koD = eKo.P('p2');
      koA.pos = 2; koD.pos = 3;
      koA.life = 1; koD.life = 2;
      eKo.runStrikeAuto({
        initiator: 'p1',
        attackerSel: { card: { ...NORMALS[0], pow: 5, spd: 8, uid: 'koA' }, fromWildSwing: false },
        defenderSel: { card: { ...NORMALS[0], pow: 5, spd: 1, stunImmuneBase: true, uid: 'koD' }, fromWildSwing: false },
        gaugePay: {},
      }, () => ({}));
      const koStoppedDefender = eKo.gameOver === true && eKo.winner === 'p1' && koA.life === 1;

      // 6. One Vision After: self-boost fires even when it misses
      const eOv = new Engine('axl', 'ryu');
      const ovA = eOv.P('p1'), ovD = eOv.P('p2');
      ovA.pos = 0; ovD.pos = 8; // out of range -> miss
      const ovCard = { ...CHARACTERS.axl.specials.find(c => c.key === 'one_vision'), uid: 'ov1' };
      ovA.gauge = [
        { ...NORMALS[0], uid: 'g1' }, { ...NORMALS[0], uid: 'g2' },
        { ...NORMALS[0], uid: 'g3' }, { ...NORMALS[0], uid: 'g4' },
      ];
      eOv.runStrikeAuto({
        initiator: 'p1',
        attackerSel: { card: ovCard, fromWildSwing: false },
        defenderSel: { card: { ...NORMALS[0], uid: 'ovD' }, fromWildSwing: false },
        gaugePay: {},
      }, () => ({}));
      const oneVisionSustainedOnMiss = ovA.boostsInPlay.some(b => b.card.uid === 'ov1' && b.sustainedForever);

      // 7. Card data fixes: Vega, Ryu, Sol, Happy Chaos
      const eVega = new Engine('vega', 'ryu');
      const bhc = CHARACTERS.vega.specials.find(c => c.key === 'bloody_high_claw');
      const sc = CHARACTERS.vega.specials.find(c => c.key === 'splendid_claw');
      eVega.P('p1').boostsInPlay.push({ card: bhc, ownerId: 'p1' });
      const vegaFreeCrit = eVega.hasFreeCriticalBoost(eVega.P('p1'));
      const vegaRangeBonus = bhc.boost.rangeMaxBonus || 0;
      const vegaSplendidPow = (sc.boost.statMods && sc.boost.statMods.pow) || 0;
      const vegaSplendidArm = (sc.boost.statMods && sc.boost.statMods.arm) || 0;
      const ryuShoryuToGauge = !!CHARACTERS.ryu.specials.find(c => c.key === 'shoryuken_ryu').boost.toGaugeIfHitThisStrike;
      const solGunFlame = CHARACTERS.sol.specials.find(c => c.key === 'gun_flame');
      const solBandit = CHARACTERS.sol.specials.find(c => c.key === 'bandit_bringer');

      const eHc = new Engine('happychaos', 'ryu');
      const hcP1 = eHc.P('p1');
      CHARACTERS.happychaos.onExceed(eHc, hcP1);
      CHARACTERS.happychaos.onExceed(eHc, hcP1);
      const hcSingleDemCopy = hcP1.hand.filter(c => c.key === 'hc_deus_ex_machina').length === 1;

      return {
        anjiArmDelta, anjiGrdDelta, forcedBoostDiscarded, exSelfPairRejected,
        emptyDeckWildSwingHandled, koStoppedDefender, oneVisionSustainedOnMiss,
        vegaFreeCrit, vegaRangeBonus, vegaSplendidPow, vegaSplendidArm,
        ryuShoryuToGauge,
        solGunFlameContinuous: !!solGunFlame.boost.continuous && !!solGunFlame.boost.advantageIfOpponentStunnedThisStrike,
        solBanditIgnoreGuard: !!solBandit.ignoreGuard,
        hcSingleDemCopy,
      };
    })()
  `);
  assert.equal(res.anjiGrdDelta, 2);
  assert.equal(res.anjiArmDelta, 2);
  assert.equal(res.forcedBoostDiscarded, true);
  assert.equal(res.exSelfPairRejected, true);
  assert.equal(res.emptyDeckWildSwingHandled, true);
  assert.equal(res.koStoppedDefender, true);
  assert.equal(res.oneVisionSustainedOnMiss, true);
  assert.equal(res.vegaFreeCrit, true);
  assert.equal(res.vegaRangeBonus, 1);
  assert.equal(res.vegaSplendidPow, 1);
  assert.equal(res.vegaSplendidArm, 1);
  assert.equal(res.ryuShoryuToGauge, true);
  assert.equal(res.solGunFlameContinuous, true);
  assert.equal(res.solBanditIgnoreGuard, true);
  assert.equal(res.hcSingleDemCopy, true);
});

test('Information Set, publicInfoOf overdrive/sealedCards exclusion, and Card-Key NativeCpuAI bridge', () => {
  const { evalExpr } = loadGameSandbox();
  const res = evalExpr<{
    poolExcludesOverdrive: boolean;
    poolExcludesSealed: boolean;
    infoSetHasNoOppHand: boolean;
    nativeEnvelopeAction: string;
    nativeBoostUid: string;
    nativeStrikeUid: string;
    nativeExUidsOk: boolean;
    illegalMoveRejected: boolean;
  }>(`
    (() => {
      // 1. Overdrive & sealedCards excluded from unseenPoolForOpponent
      const e1 = new Engine('ragna', 'happychaos');
      const ragna = e1.P('p1'), hc = e1.P('p2');
      const odCard = ragna.hand.pop() || ragna.deck.pop();
      ragna.overdrive.push(odCard);
      const sealCard = hc.hand.pop() || hc.deck.pop();
      hc.sealedCards.push(sealCard);
      const ragnaPub = publicInfoOf(ragna);
      const hcPub = publicInfoOf(hc);
      const ragnaPool = unseenPoolForOpponent(ragnaPub);
      const hcPool = unseenPoolForOpponent(hcPub);
      const totalRagnaOdCopies = deckKeysForCharacter('ragna').filter(k => k === odCard.key).length;
      const totalHcSealCopies = deckKeysForCharacter('happychaos').filter(k => k === sealCard.key).length;
      const poolExcludesOverdrive = ragnaPool.filter(k => k === odCard.key).length === totalRagnaOdCopies - 1;
      const poolExcludesSealed = hcPool.filter(k => k === sealCard.key).length === totalHcSealCopies - 1;

      const info = e1.getInformationSet('p1');
      const infoSetHasNoOppHand = info.opponent.handKeys === undefined && Array.isArray(info.actor.handKeys) &&
        info.opponent.sealedKeys.includes(sealCard.key);

      // 2. NativeCpuAI Card-Key + NativeDecisionResponse + tightened legality
      NativeCpuAI.setMode('modern');
      const e2 = new Engine('ryu', 'ken');
      const me = e2.P('p1'), opp = e2.P('p2');
      const boostCard = { ...NORMALS.find(c => c.key === 'focus'), uid: 'b_uid_1' };
      const sweep1 = { ...NORMALS.find(c => c.key === 'sweep'), uid: 's_uid_1' };
      const sweep2 = { ...NORMALS.find(c => c.key === 'sweep'), uid: 's_uid_2' };
      me.hand = [boostCard, sweep1, sweep2];
      NativeCpuAI.registerBackend({
        protocolVersion: 1,
        chooseNeutralAction: () => ({
          action: { type: 'boost', cardKey: 'focus' },
          diagnostics: { topLines: [{ label: 'boost focus', visits: 10, qValue: 0.5 }] },
        }),
        chooseStrikeAction: () => ({ action: { kind: 'single', cardKey: 'sweep' } }),
        chooseDefenseAction: () => ({ action: { kind: 'ex', cardKey: 'sweep' } }),
      });
      const chosen = chooseAction({
        me, mePublicFull: me, oppPublic: publicInfoOf(opp), canExceed: false, rng: () => 0.5, turnNumber: 3,
      });
      const strikeSel = chooseStrikeSelection({
        hand: me.hand, myPos: me.pos, oppPublic: publicInfoOf(opp), iAmInitiator: true,
        rng: () => 0.5, myBoostMods: e2.activeBoostMods(me), meFull: me, turnNumber: 3,
      });
      const defSel = chooseStrikeSelection({
        hand: me.hand, myPos: me.pos, oppPublic: publicInfoOf(opp), iAmInitiator: false,
        rng: () => 0.5, myBoostMods: e2.activeBoostMods(me), meFull: me, turnNumber: 3,
      });
      const illegalMoveRejected = isNativeActionLegal({ type: 'move', targetSpace: 6 }, me, opp, false);
      return {
        poolExcludesOverdrive,
        poolExcludesSealed,
        infoSetHasNoOppHand,
        nativeEnvelopeAction: chosen.type,
        nativeBoostUid: chosen.uid,
        nativeStrikeUid: strikeSel.selection.uid,
        nativeExUidsOk: defSel.selection.type === 'ex' && defSel.selection.uid1 === 's_uid_1' && defSel.selection.uid2 === 's_uid_2',
        illegalMoveRejected,
      };
    })()
  `);
  assert.equal(res.poolExcludesOverdrive, true);
  assert.equal(res.poolExcludesSealed, true);
  assert.equal(res.infoSetHasNoOppHand, true);
  assert.equal(res.nativeEnvelopeAction, 'boost');
  assert.equal(res.nativeBoostUid, 'b_uid_1');
  assert.equal(res.nativeStrikeUid, 's_uid_1');
  assert.equal(res.nativeExUidsOk, true);
  assert.equal(res.illegalMoveRejected, false);
});

test('Trainer & Study Mode degrade cleanly on partial matchups and render NativeDiagnostics when advised', () => {
  const { evalExpr } = loadGameSandbox();
  const res = evalExpr<{
    studyToggled: boolean;
    partialSource: string;
    partialHasNote: boolean;
    partialStrikeHintOk: boolean;
    modernSource: string;
    modernTopLinesCount: number;
    renderedHasDiagnostics: boolean;
    renderedHasUndefined: boolean;
  }>(`
    (() => {
      G = new GameController('ryu', 'ken', 'champion', {});
      G.mode = 'awaiting_action';
      G.engine.active = G.humanId;
      G.toggleStudyMode();
      const studyToggled = G.studyMode === true;

      // 1. Partial/classic fallback degrades cleanly with a status note
      G.suggestMove();
      const partialSource = G.trainerReport.source;
      const partialHasNote = typeof G.trainerReport.note === 'string' && G.trainerReport.note.length > 0;
      G.suggestStrike(false);
      const partialStrikeHintOk = typeof G.hintText === 'string' && G.hintText.length > 0 && G.trainerReport.kind === 'strike';

      // 2. Registered Modern Native backend with advise() populates NativeDiagnostics
      NativeCpuAI.registerBackend({
        protocolVersion: 1,
        chooseNeutralAction: () => ({ type: 'prepare' }),
        advise: (kind, snap) => ({
          action: { type: 'prepare' },
          diagnostics: {
            topLines: [{ label: 'Prepare', visits: 120, qValue: 0.42 }],
            nashMix: [{ label: 'Sweep', probability: 0.6 }, { label: 'Grasp', probability: 0.4 }],
            beliefThreats: [{ cardKey: 'hadoken', probAtLeastOne: 0.75, probExReady: 0.15 }],
          },
        }),
      });
      G.suggestMove();
      const modernSource = G.trainerReport.source;
      const modernTopLinesCount = G.trainerReport.diagnostics.topLines.length;
      const html = trainerPanelHTML(G);
      const renderedHasDiagnostics = html.includes('Top lines:') && html.includes('Nash mix:') && html.includes('Opponent threats:');
      const renderedHasUndefined = html.includes('undefined') || html.includes('NaN');
      return {
        studyToggled,
        partialSource,
        partialHasNote,
        partialStrikeHintOk,
        modernSource,
        modernTopLinesCount,
        renderedHasDiagnostics,
        renderedHasUndefined,
      };
    })()
  `);
  assert.equal(res.studyToggled, true);
  assert.equal(res.partialSource, 'classic');
  assert.equal(res.partialHasNote, true);
  assert.equal(res.partialStrikeHintOk, true);
  assert.equal(res.modernSource, 'modern');
  assert.equal(res.modernTopLinesCount, 1);
  assert.equal(res.renderedHasDiagnostics, true);
  assert.equal(res.renderedHasUndefined, false);
});

test('Recommended beginner roster includes 6 fighters (adding Giovanna and Potemkin) in 3x2 grid and CPU select order', () => {
  const { evalExpr, dom } = loadGameSandbox();
  const res = evalExpr<{
    recKeys: string[];
    allValid: boolean;
    allHavePhotos: boolean;
    allHaveHeadshots: boolean;
    hasRecGridClass: boolean;
    recCardCount: number;
    collapsedToggleShows41: boolean;
    expandedCardCount: number;
    aiFirstSixKeys: string[];
    aiTotalCount: number;
  }>(`
    (() => {
      const recKeys = [...RECOMMENDED_BEGINNER_KEYS];
      const allValid = recKeys.every(k => Boolean(CHARACTERS[k]));
      const allHavePhotos = recKeys.every(k => Boolean(FIGHTER_PHOTOS[k]));
      const allHaveHeadshots = recKeys.every(k => Boolean(FIGHTER_HEADSHOTS[k]));

      rosterExpanded = false;
      renderCharSelect();
      const charCardsHtml = document.getElementById('charCards').innerHTML;
      const hasRecGridClass = charCardsHtml.includes('char-cards char-cards-recommended');
      const recCardCount = (charCardsHtml.match(/class="fighter-card"/g) || []).length;
      const collapsedToggleShows41 = charCardsHtml.includes('Show all 41 fighters');

      toggleRosterExpanded();
      const expandedHtml = document.getElementById('charCards').innerHTML;
      const expandedCardCount = (expandedHtml.match(/class="fighter-card"/g) || []).length;

      renderAiCharSelect();
      const aiHtml = document.getElementById('aiCharCards').innerHTML;
      const aiPicks = [...aiHtml.matchAll(/selectAiCharacter\\('([^']+)'\\)/g)].map(m => m[1]);

      return {
        recKeys,
        allValid,
        allHavePhotos,
        allHaveHeadshots,
        hasRecGridClass,
        recCardCount,
        collapsedToggleShows41,
        expandedCardCount,
        aiFirstSixKeys: aiPicks.slice(0, 6),
        aiTotalCount: aiPicks.length,
      };
    })()
  `);

  assert.deepEqual([...res.recKeys], ['ryu', 'ken', 'cammy', 'zangief', 'giovanna', 'potemkin']);
  assert.equal(res.allValid, true);
  assert.equal(res.allHavePhotos, true);
  assert.equal(res.allHaveHeadshots, true);
  assert.equal(res.hasRecGridClass, true);
  assert.equal(res.recCardCount, 6);
  assert.equal(res.collapsedToggleShows41, true);
  assert.equal(res.expandedCardCount, 41);
  assert.deepEqual([...res.aiFirstSixKeys], ['ryu', 'ken', 'cammy', 'zangief', 'giovanna', 'potemkin']);
  assert.equal(res.aiTotalCount, 41);
  assert.ok(dom);
});


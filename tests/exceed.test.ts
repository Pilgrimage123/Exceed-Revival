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
      const moveZeroLegal = isNativeActionLegal({ type: 'move', target: 0 }, { hand: [], boostsInPlay: [] }, false);
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

      // Selecting unfinished character uses inline notice, never alert()
      selectCharacter('seth');

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
  assert.match(dom.elements.get('charSelectNotice')?.textContent ?? '', /not yet fully implemented/);
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

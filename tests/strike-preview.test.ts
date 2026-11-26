import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dirname, '..');
const HTML_PATH = path.join(ROOT, 'exceed_poc.html');

function loadGameSandbox() {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const scriptMatches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const code = scriptMatches.map((m) => m[1]).join('\n;\n');
  const sandbox: Record<string, unknown> = {
    console,
    Math,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Set,
    Map,
    JSON,
    Date,
    RegExp,
    Error,
    setTimeout,
    clearTimeout,
    document: {
      getElementById: () => ({ innerHTML: '', textContent: '', style: {}, classList: { add: () => {}, remove: () => {} } }),
      querySelector: () => null,
      querySelectorAll: () => [],
    },
    window: undefined,
    localStorage: undefined,
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(code, ctx);
  return ctx;
}

test('SimulateStrikePreview respects fog-of-war, Close vs Advance cross-up, and wall clamping', () => {
  const ctx = loadGameSandbox();
  const result = vm.runInContext(`(() => {
    const engine = new Engine('ryu', 'ken', () => 0.5);
    const p1 = engine.P('p1');
    const p2 = engine.P('p2');
    p1.pos = 3;
    p2.pos = 4;
    p2.hand = [SimulateStrikePreview.resolveCardByKey('block')];

    const infoSet = engine.getInformationSet('p1');
    const divePreview = SimulateStrikePreview.run(infoSet, SimulateStrikePreview.resolveCardByKey('dive'), { isEX: false });
    const assaultPreview = SimulateStrikePreview.run(infoSet, SimulateStrikePreview.resolveCardByKey('assault'), { isEX: false });

    // Wall clamp check at space 8
    p1.pos = 7;
    p2.pos = 8;
    const edgeInfo = engine.getInformationSet('p1');
    const edgeDive = SimulateStrikePreview.run(edgeInfo, SimulateStrikePreview.resolveCardByKey('dive'), { isEX: false });

    return { divePreview, assaultPreview, edgeDive };
  })()`, ctx) as any;

  assert.equal(result.divePreview.didCrossUp, true);
  assert.equal(result.divePreview.postBeforeSpace, 7);
  assert.equal(result.divePreview.effectiveStats.oppVisibleArm, 0);

  assert.equal(result.assaultPreview.didCrossUp, false);
  assert.equal(result.assaultPreview.postBeforeSpace, 3);

  assert.equal(result.edgeDive.wallTruncated, true);
  assert.equal(result.edgeDive.postBeforeSpace, 7);
});

test('SimulateStrikePreview applies EX +1 all stats, Continuous Boosts, WillWhiff, Public-State Lethal, and stochastic ?', () => {
  const ctx = loadGameSandbox();
  const result = vm.runInContext(`(() => {
    const engine = new Engine('ryu', 'ken', () => 0.5);
    const p1 = engine.P('p1');
    const p2 = engine.P('p2');
    p1.pos = 2;
    p2.pos = 4; // Range 2 (within Spike's 2-3 range)
    p2.life = 5;

    const infoSet = engine.getInformationSet('p1');
    const baseSpike = SimulateStrikePreview.run(infoSet, SimulateStrikePreview.resolveCardByKey('spike'), { isEX: false });
    const exSpike = SimulateStrikePreview.run(infoSet, SimulateStrikePreview.resolveCardByKey('spike'), { isEX: true });

    p2.pos = 8; // out of range
    const whiffInfo = engine.getInformationSet('p1');
    const whiffSpike = SimulateStrikePreview.run(whiffInfo, SimulateStrikePreview.resolveCardByKey('spike'), { isEX: false });

    const wildPreview = SimulateStrikePreview.run(whiffInfo, { isWildSwing: true }, {});
    return { baseSpike, exSpike, whiffSpike, wildPreview };
  })()`, ctx) as any;

  assert.equal(result.exSpike.effectiveStats.pow, result.baseSpike.effectiveStats.pow + 1);
  assert.equal(result.exSpike.effectiveStats.spd, result.baseSpike.effectiveStats.spd + 1);
  assert.equal(result.exSpike.isPublicStateLethal, true);
  assert.equal(result.whiffSpike.willWhiff, true);
  assert.equal(result.whiffSpike.projectedDamage, 0);
  assert.equal(result.wildPreview.hasStochasticVariance, true);
});

test('Normal Matrix tracks GG_NORMALS and resets discard on reshuffle; deckWarningState handles reshuffleUsed', () => {
  const ctx = loadGameSandbox();
  const result = vm.runInContext(`(() => {
    const engine = new Engine('ryu', 'sol', () => 0.5);
    const opp = engine.P('p2');
    opp.discard = [
      SimulateStrikePreview.resolveCardByKey('gg_slash'),
      SimulateStrikePreview.resolveCardByKey('gg_slash'),
      SimulateStrikePreview.resolveCardByKey('gg_dust'),
    ];
    const before = normalMatrixData(opp);
    engine.manualReshuffle(opp);
    const after = normalMatrixData(opp);

    const healthy = deckWarningState({ deck: new Array(10), discard: new Array(5), reshuffleUsed: false });
    const amber = deckWarningState({ deck: new Array(3), discard: new Array(5), reshuffleUsed: false });
    const redPost = deckWarningState({ deck: new Array(2), discard: new Array(10), reshuffleUsed: true });
    return { before, after, healthy, amber, redPost };
  })()`, ctx) as any;

  const slashBefore = result.before.rows.find((r: any) => r.key === 'gg_slash');
  const slashAfter = result.after.rows.find((r: any) => r.key === 'gg_slash');
  assert.ok(slashBefore, 'Sol Badguy Normal Matrix should include gg_slash');
  assert.equal(slashBefore.rem, 0);
  assert.equal(slashAfter.rem, 2);

  assert.equal(result.healthy.cls, 'deck-healthy');
  assert.equal(result.amber.cls, 'deck-amber');
  assert.equal(result.redPost.cls, 'deck-red');
});

test('pickExactForceCards handles 1-Force + 2-Force parity and UI action/board handlers guard active human turn', () => {
  const ctx = loadGameSandbox();
  const result = vm.runInContext(`(() => {
    const ctrl = new GameController('ryu', 'ken', 'champion');
    G = ctrl;
    ctrl.mode = 'awaiting_action';
    const p1 = ctrl.human();
    const p2 = ctrl.ai();
    p1.pos = 2;
    p2.pos = 6;

    // Parity test: one 1-Force normal + one 2-Force Ultra paying cost 2 must select the Ultra
    const hadoken = SimulateStrikePreview.resolveCardByKey('hadoken_ryu');
    const metsu = SimulateStrikePreview.resolveCardByKey('metsu_hadoken');
    const normal = { ...SimulateStrikePreview.resolveCardByKey('cross'), uid: 'u_norm' };
    const ultra = { ...metsu, uid: 'u_ultra' };
    p1.hand = [normal, ultra];
    p1.gauge = [];
    const exact2 = ctrl.engine.pickExactForceCards(p1, 2);

    // Overpayment: 1-Force cost when holding only a 2-Force Ultra must succeed
    p1.hand = [ultra];
    const overpay1 = ctrl.engine.pickExactForceCards(p1, 1);

    // Direct-move with only an Ultra to a 1-space target opens move_force_select via overpayment
    ctrl.engine.active = 'p1';
    ctrl.clickBoardSpace(3);
    const modeAfterOverpayMove = ctrl.mode;

    // During CPU's turn, human card selection and direct board-click must be ignored
    p1.hand = [normal, ultra];
    ctrl.mode = 'awaiting_action';
    ctrl.engine.active = 'p2';
    ctrl.selectActionCard('u_norm');
    const selectedDuringCpuTurn = ctrl.selectedActionCardUid;
    ctrl.clickBoardSpace(3);
    const modeDuringCpuTurn = ctrl.mode;

    return {
      hadokenName: hadoken && hadoken.name,
      metsuType: metsu && metsu.type,
      exact2,
      impossible1: overpay1,
      modeAfterImpossibleMove: modeAfterOverpayMove,
      selectedDuringCpuTurn,
      modeDuringCpuTurn,
    };
  })()`, ctx) as any;

  assert.equal(result.hadokenName, 'Hadoken');
  assert.equal(result.metsuType, 'ultra');
  assert.deepEqual(Array.from(result.exact2), ['u_ultra']);
  assert.deepEqual(Array.from(result.impossible1), ['u_ultra']);
  assert.equal(result.modeAfterImpossibleMove, 'move_force_select');
  assert.equal(result.selectedDuringCpuTurn, null);
  assert.equal(result.modeDuringCpuTurn, 'awaiting_action');
});

function createTrackedSandbox() {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const scriptMatches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const code = scriptMatches.map((m) => m[1]).join('\n;\n');
  const elements = new Map<string, { innerHTML: string; textContent: string; style: Record<string, string>; classList: { add: (c: string) => void; remove: (c: string) => void; has: (c: string) => boolean } }>();
  const getOrCreate = (id: string) => {
    let el = elements.get(id);
    if (!el) {
      const classes = new Set<string>();
      el = {
        innerHTML: '',
        textContent: '',
        style: {},
        classList: {
          add: (c: string) => { classes.add(c); },
          remove: (c: string) => { classes.delete(c); },
          has: (c: string) => classes.has(c),
        },
      };
      elements.set(id, el);
    }
    return el;
  };
  const bodyClasses = new Set<string>();
  const sandbox: Record<string, unknown> = {
    console,
    Math,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Set,
    Map,
    JSON,
    Date,
    RegExp,
    Error,
    setTimeout,
    clearTimeout,
    document: {
      body: {
        classList: {
          add: (c: string) => { bodyClasses.add(c); },
          remove: (c: string) => { bodyClasses.delete(c); },
          contains: (c: string) => bodyClasses.has(c),
        },
      },
      getElementById: (id: string) => getOrCreate(id),
      querySelector: () => null,
      querySelectorAll: () => [],
    },
    window: undefined,
    localStorage: undefined,
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(code, ctx);
  return { ctx, elements, bodyClasses };
}

test('Horizontal Compact Stage: two-column shell, slim Fighter HUD pills, and Fighter Info modal trigger', () => {
  const { ctx, elements, bodyClasses } = createTrackedSandbox();
  const res = vm.runInContext(`(() => {
    const g = new GameController('ryu', 'ken', 'champion');
    G = g;
    g.confirmMulligan();
    const ryu = g.human();
    const boostCard = { ...SimulateStrikePreview.resolveCardByKey('focus'), uid: 'b_test' };
    ryu.boostsInPlay.push({ card: boostCard, ownerId: 'p1', turnsUntilExpire: 2 });
    g.toggleRightRail();
    const appHtml = document.getElementById('app').innerHTML;
    g.openInfo('human');
    const modalHtml = document.getElementById('app').innerHTML;
    g.closeInfo();
    return { appHtml, modalHtml };
  })()`, ctx) as { appHtml: string; modalHtml: string };

  assert.equal(bodyClasses.has('gameplay-active'), true);
  assert.ok(res.appHtml.includes('class="gameplay-stage"'));
  assert.ok(res.appHtml.includes('class="main-stage"'));
  assert.ok(res.appHtml.includes('class="right-rail drawer-open"'));
  assert.ok(res.appHtml.includes('class="rail-utility-strip"'));
  assert.ok(res.appHtml.includes('slim-hud-bar'));
  assert.ok(res.appHtml.includes('innate-pill'));
  assert.ok(res.appHtml.includes('boost-pill'));
  assert.equal(res.appHtml.includes('class="boosts-active"'), false, 'Multi-line boost list should be replaced by pills');
  assert.ok(res.modalHtml.includes('modal-overlay'));
  assert.equal(elements.get('app')?.innerHTML.includes('undefined'), false);
});

test('Universal Inspector updates in-place for card hover/selection, HUD pills, and idle Beginner Coach fallback', () => {
  const { ctx, elements } = createTrackedSandbox();
  const res = vm.runInContext(`(() => {
    const g = new GameController('ryu', 'ken', 'champion', { beginner: true });
    G = g;
    g.confirmMulligan();
    const ryu = g.human();
    const hadoken = { ...SimulateStrikePreview.resolveCardByKey('hadoken_ryu'), uid: 'h_insp' };
    const focusBoost = { ...SimulateStrikePreview.resolveCardByKey('focus'), uid: 'b_insp' };
    ryu.hand = [hadoken];
    ryu.boostsInPlay.push({ card: focusBoost, ownerId: 'p1', turnsUntilExpire: 1 });
    g.toggleRightRail();
    const idleInspector = document.getElementById('app').innerHTML;
    const appMarkerBefore = document.getElementById('app').innerHTML;

    // Hover card -> updates #universal-inspector-slot without wiping #app
    g.onCardHover('h_insp', false);
    const cardHoverInspector = document.getElementById('universal-inspector-slot').innerHTML;
    const appUnchangedAfterHover = document.getElementById('app').innerHTML === appMarkerBefore;

    // Hover Innate pill
    g.onHudPillHover('innate', 'human');
    const innateInspector = document.getElementById('universal-inspector-slot').innerHTML;

    // Hover Boost pill
    g.onHudPillHover('boost', 'human', 'b_insp');
    const boostInspector = document.getElementById('universal-inspector-slot').innerHTML;

    // Clear hover -> returns to idle Beginner Coach
    g.onHudPillHoverEnd();
    const afterEndInspector = document.getElementById('universal-inspector-slot').innerHTML;

    return { idleInspector, cardHoverInspector, appUnchangedAfterHover, innateInspector, boostInspector, afterEndInspector };
  })()`, ctx) as any;

  assert.ok(res.idleInspector.includes('Choose your action'));
  assert.ok(res.cardHoverInspector.includes('Hadoken'));
  assert.ok(res.cardHoverInspector.includes('Strike Preview'));
  assert.equal(res.appUnchangedAfterHover, true, 'Hovering must update #universal-inspector-slot in-place without repainting #app');
  assert.ok(res.innateInspector.includes('Normal Innate:'));
  assert.ok(res.boostInspector.includes('Focus'));
  assert.ok(res.boostInspector.includes('Expires in 1 turn'));
  assert.ok(res.afterEndInspector.includes('Choose your action'));
  assert.equal(elements.get('universal-inspector-slot')?.innerHTML.includes('undefined'), false);
});

test('Unified Hand Dock renders compact tiles with zero duplicate .hand-row across all card-picking modes and tags GAUGE cards', () => {
  const { ctx } = createTrackedSandbox();
  const res = vm.runInContext(`(() => {
    const g = new GameController('ryu', 'ken', 'champion');
    G = g;
    const p = g.human();
    const cardA = { ...SimulateStrikePreview.resolveCardByKey('cross'), uid: 'u1' };
    const cardB = { ...SimulateStrikePreview.resolveCardByKey('sweep'), uid: 'u2' };
    const cardG = { ...SimulateStrikePreview.resolveCardByKey('grasp'), uid: 'g1' };
    p.hand = [cardA, cardB];
    p.gauge = [cardG];

    const modes = [
      ['mulligan_select', { chosen: [] }],
      ['awaiting_action', {}],
      ['strike_select', {}],
      ['defend_select', {}],
      ['boost_select', {}],
      ['move_force_select', { dir: 'advance', spaces: 1, force: 1, chosen: [] }],
      ['boost_force_select', { cardUid: 'u1', need: 1, chosen: [] }],
      ['action_force_select', { need: 1, chosen: [] }],
      ['boost_bonus_force_select', { cardUid: 'u1', bonusMax: 1, bonusChosen: [] }],
      ['changecards_select', { n: 1, chosen: [] }],
      ['discard_to_seven', { chosen: [] }],
      ['block_force_choice', { request: { attackerPow: 4, defenderArmBase: 0, defenderGuard: 3, maxForce: 2 }, chosen: [] }],
      ['action_gauge_select', { max: 1, chosen: [] }],
      ['range_discard_choice', { matchingCards: [cardA], namedRange: 1 }],
    ];

    const counts = {};
    const htmlByMode = {};
    for (const [m, sel] of modes) {
      g.mode = m;
      g.sel = sel;
      paint();
      const html = document.getElementById('app').innerHTML;
      const handRowCount = (html.match(/class="hand-row/g) || []).length;
      counts[m] = handRowCount;
      htmlByMode[m] = html;
    }
    return { counts, moveForceHtml: htmlByMode.move_force_select, strikeHtml: htmlByMode.strike_select };
  })()`, ctx) as any;

  for (const [mode, count] of Object.entries(res.counts)) {
    assert.equal(count, 1, `Mode ${mode} must render exactly 1 .hand-row, got ${count}`);
  }
  assert.ok(res.moveForceHtml.includes('hand-gauge-divider'));
  assert.ok(res.moveForceHtml.includes('gauge-source-badge'));
  assert.ok(res.strikeHtml.includes('compact-card-tile'));
  assert.equal(res.strikeHtml.includes('class="card-text"'), false, 'Compact tiles must omit inline multi-line prose');
});

test('Single-Row Action Bar swaps to contextual pre-commit bar and keeps drag drop zone transient', () => {
  const { ctx, elements } = createTrackedSandbox();
  const res = vm.runInContext(`(() => {
    const g = new GameController('ryu', 'ken', 'champion');
    G = g;
    g.confirmMulligan();
    const card = g.human().hand[0];
    paint();
    const neutralHtml = document.getElementById('app').innerHTML;

    g.selectActionCard(card.uid);
    const precommitHtml = document.getElementById('app').innerHTML;
    g.cancelActionCard();

    g.onCardDragStart(null, card.uid);
    const dragActive = document.getElementById('boost-drop-zone').classList.has('drag-active');
    g.onCardDragEnd();
    const dragEnded = document.getElementById('boost-drop-zone').classList.has('drag-active');

    return { neutralHtml, precommitHtml, dragActive, dragEnded };
  })()`, ctx) as any;

  assert.ok(res.neutralHtml.includes('action-bar-row'));
  assert.equal(res.neutralHtml.includes('precommit-bar'), false);
  assert.equal(res.neutralHtml.includes('drag-active'), false);
  assert.ok(res.precommitHtml.includes('precommit-bar'));
  assert.ok(res.precommitHtml.includes('Play as Strike'));
  assert.ok(res.precommitHtml.includes('Play as Boost'));
  assert.equal(res.dragActive, true);
  assert.equal(res.dragEnded, false);
  assert.equal(elements.get('app')?.innerHTML.includes('undefined'), false);
});

test('strike_result (when pauseAfterStrike enabled) renders Trigger Timeline in Stage Prompt Bar and dual revealed cards in Universal Inspector', () => {
  const { ctx } = createTrackedSandbox();
  const res = vm.runInContext(`(() => {
    UXSettings.set('pauseAfterStrike', true);
    const g = new GameController('ryu', 'ken', 'champion', { beginner: true });
    G = g;
    g.confirmMulligan();
    g.toggleRightRail();
    const p1 = g.human(), p2 = g.ai();
    p1.pos = 3; p2.pos = 4;
    const c1 = { ...SimulateStrikePreview.resolveCardByKey('cross'), uid: 'sr1' };
    const c2 = { ...SimulateStrikePreview.resolveCardByKey('sweep'), uid: 'sr2' };
    const gen = g.engine.resolveStrikeSteps({
      initiator: 'p1',
      attackerSel: { card: c1, fromWildSwing: false },
      defenderSel: { card: c2, fromWildSwing: false },
      gaugePay: {},
    });
    g.driveStrikeGen(gen, undefined);
    const html = document.getElementById('app').innerHTML;

    // Quick-choice / stepper sub-mode renders inside #stage-prompt-bar
    g.mode = 'move_setup';
    g.sel = { dir: 'advance', spaces: 1, maxSpaces: 2 };
    paint();
    const moveSetupHtml = document.getElementById('app').innerHTML;
    return { mode: g.mode, html, moveSetupHtml };
  })()`, ctx) as any;

  assert.equal(res.mode, 'move_setup');
  assert.ok(res.html.includes('id="stage-prompt-bar"'));
  assert.ok(res.html.includes('id="trigger-timeline-slot"'));
  assert.ok(res.html.includes('trigger-timeline'));
  assert.ok(res.html.includes('inspector-dual-cards'));
  assert.ok(res.html.includes('Cross'));
  assert.ok(res.html.includes('Sweep'));
  assert.ok(res.html.includes('G.continueAfterStrikeResult()'), 'strike_result must place Continue action in Band 3');
  assert.equal(res.html.includes('Resolve prompt above to continue'), false, 'strike_result must not show fallback placeholder');
  assert.ok(res.moveSetupHtml.includes('stage-prompt-inline'));
  assert.ok(res.moveSetupHtml.includes('Confirm Move'));
});

test('Right Rail tabs switch between Log, Normals, and Coach, auto-switch on Coach actions, and collapse cleanly', () => {
  const { ctx } = createTrackedSandbox();
  const res = vm.runInContext(`(() => {
    const g = new GameController('ryu', 'ken', 'champion');
    G = g;
    g.confirmMulligan();
    g.toggleRightRail();
    const defaultTab = g.rightRailTab;

    g.setRightRailTab('normals');
    const normalsHtml = document.getElementById('app').innerHTML;

    // Background suggestion sets unread dot without switching away from normals
    g.suggestMove({ background: true });
    const dotWhenOnNormals = g.coachUnreadDot;
    const tabAfterBg = g.rightRailTab;

    // Explicit suggestMove auto-switches to coach and clears unread dot
    g.suggestMove();
    const tabAfterExplicit = g.rightRailTab;
    const dotAfterExplicit = g.coachUnreadDot;

    // Switching back to log then toggling Study Mode ON auto-switches to coach
    g.setRightRailTab('log');
    g.toggleStudyMode();
    const tabAfterStudyOn = g.rightRailTab;

    // Collapse rail
    g.toggleRightRail();
    const collapsedHtml = document.getElementById('app').innerHTML;

    return { defaultTab, normalsHtml, dotWhenOnNormals, tabAfterBg, tabAfterExplicit, dotAfterExplicit, tabAfterStudyOn, collapsedHtml };
  })()`, ctx) as any;

  assert.equal(res.defaultTab, 'log');
  assert.ok(res.normalsHtml.includes('Opponent Normals'));
  assert.equal(res.dotWhenOnNormals, true);
  assert.equal(res.tabAfterBg, 'normals');
  assert.equal(res.tabAfterExplicit, 'coach');
  assert.equal(res.dotAfterExplicit, false);
  assert.equal(res.tabAfterStudyOn, 'coach');
  assert.ok(res.collapsedHtml.includes('rail-collapsed'));
  assert.equal(res.collapsedHtml.includes('right-rail drawer-open'), false);
});

test('HitParticleEngine classifies fighting-game hit tiers, spawns multi-layered particle bursts, deduplicates Strike events, and respects reducedHitStop', () => {
  const { ctx } = createTrackedSandbox();
  const res = vm.runInContext(`(() => {
    HitParticleEngine.clear();

    const tiers = {
      guard: HitParticleEngine.classifyHitTier({ damage: 0, effectiveArmor: 2 }),
      light: HitParticleEngine.classifyHitTier({ damage: 2, cardName: 'Spike' }),
      medium: HitParticleEngine.classifyHitTier({ damage: 4, cardName: 'Cross', effectiveArmor: 1 }),
      heavy: HitParticleEngine.classifyHitTier({ damage: 5, cardName: 'Shoryuken' }),
      crit: HitParticleEngine.classifyHitTier({ damage: 4, cardName: 'Hadoken', criticalPaid: true }),
      ex: HitParticleEngine.classifyHitTier({ damage: 4, cardName: 'Assault', isEX: true }),
      guardBreak: HitParticleEngine.classifyHitTier({ damage: 5, cardName: 'Sweep', guardBroken: true }),
      ultra: HitParticleEngine.classifyHitTier({ damage: 7, cardName: 'Metsu Hadoken', cardType: 'ultra' }),
      lethal: HitParticleEngine.classifyHitTier({ damage: 6, cardName: 'Metsu Shoryuken', confirmedLethal: true }),
      stun: HitParticleEngine.classifyHitTier({ kind: 'stun', damage: 5 }),
      exceed: HitParticleEngine.classifyHitTier({ kind: 'exceed', characterName: 'Ryu' }),
    };

    // Trigger an Ultra hit and inspect active particle state
    const burst1 = HitParticleEngine.triggerHit({
      roundNum: 7,
      attackerId: 'p1',
      defenderId: 'p2',
      damage: 8,
      cardName: 'Metsu Hadoken',
      cardType: 'ultra',
      criticalPaid: true,
      guardBroken: true,
      x: 560,
      y: 260,
    });
    const stateAfterSpawn = HitParticleEngine.getState();

    // Duplicate trigger for the same round/attacker/defender/damage within window is deduplicated
    const dupBurst = HitParticleEngine.triggerHit({
      roundNum: 7,
      attackerId: 'p1',
      defenderId: 'p2',
      damage: 8,
      cardName: 'Metsu Hadoken',
      cardType: 'ultra',
    });
    const stateAfterDup = HitParticleEngine.getState();

    // Step physics forward until all particles decay
    let steps = 0;
    while (HitParticleEngine.getState().activeCount > 0 && steps < 80) {
      HitParticleEngine.stepFrame(32);
      steps++;
    }
    const stateAfterDecay = HitParticleEngine.getState();

    // Verify reducedHitStop scales down particle counts and disables shake
    UXSettings.set('reducedHitStop', true);
    const reducedHeavy = HitParticleEngine.classifyHitTier({ damage: 6, cardName: 'Shoryuken' });
    UXSettings.set('reducedHitStop', false);

    return {
      tiers,
      burst1,
      dupId: dupBurst && dupBurst.id,
      stateAfterSpawn,
      stateAfterDup,
      stateAfterDecay,
      steps,
      reducedHeavy,
    };
  })()`, ctx) as any;

  assert.equal(res.tiers.guard.tier, 'guard');
  assert.equal(res.tiers.guard.headline, 'GUARD HELD!');
  assert.equal(res.tiers.light.tier, 'light');
  assert.equal(res.tiers.medium.tier, 'medium');
  assert.equal(res.tiers.medium.headline, 'ARMOR CRUSH!');
  assert.equal(res.tiers.heavy.tier, 'heavy');
  assert.equal(res.tiers.crit.headline, 'CRITICAL HIT!!');
  assert.equal(res.tiers.ex.headline, 'EX IMPACT!!');
  assert.equal(res.tiers.guardBreak.headline, 'GUARD BREAK!!');
  assert.equal(res.tiers.ultra.tier, 'ultra');
  assert.equal(res.tiers.ultra.headline, 'ULTRA FINISH!!');
  assert.equal(res.tiers.lethal.headline, 'DESTRUCTIVE FINISH!!');
  assert.equal(res.tiers.stun.tier, 'stun');
  assert.equal(res.tiers.exceed.tier, 'exceed');

  assert.equal(res.burst1.tier, 'ultra');
  assert.ok(res.stateAfterSpawn.particles > 80, 'Ultra hit should spawn a large burst of particles & shards');
  assert.ok(res.stateAfterSpawn.slashes >= 5, 'Ultra hit should spawn multi-angle slash streaks + attack beam');
  assert.ok(res.stateAfterSpawn.rings >= 4, 'Ultra hit should spawn concentric shockwave rings');
  assert.ok(res.stateAfterSpawn.bolts >= 5, 'Ultra hit should spawn jagged lightning bolts');
  assert.equal(res.stateAfterDup.totalBursts, res.stateAfterSpawn.totalBursts, 'Duplicate hit event should be deduplicated');
  assert.equal(res.stateAfterDecay.activeCount, 0, 'All particles and effects should cleanly decay to 0');
  assert.ok(res.reducedHeavy.particleCount < res.tiers.heavy.particleCount, 'reducedHitStop should scale down particle count');
  assert.equal(res.reducedHeavy.shakeLevel, 'none', 'reducedHitStop should disable screen shake');
});

test('Selected card keeps StrikePreviewController synced across repaints and hover-out, and HUD pill tap expands collapsed rail', () => {
  const { ctx } = createTrackedSandbox();
  const res = vm.runInContext(`(() => {
    const g = new GameController('ryu', 'ken', 'champion');
    G = g;
    g.confirmMulligan();
    const ryu = g.human();
    const sweep = { ...SimulateStrikePreview.resolveCardByKey('sweep'), uid: 'sel_sweep' };
    const cross = { ...SimulateStrikePreview.resolveCardByKey('cross'), uid: 'hov_cross' };
    ryu.hand = [sweep, cross];
    paint();

    g.selectActionCard('sel_sweep');
    const afterSelectKey = StrikePreviewController.getActiveHover()?.card?.key || null;

    // Hover another card then leave -> restores selected card preview instead of clearing
    g.onCardHover('hov_cross', false);
    const duringHoverKey = StrikePreviewController.getActiveHover()?.card?.key || null;
    g.onCardHoverEnd();
    const afterHoverEndKey = StrikePreviewController.getActiveHover()?.card?.key || null;

    // Cancel clears preview
    g.cancelActionCard();
    const afterCancel = StrikePreviewController.getActiveHover();

    // Collapsed rail expands when tapping a HUD pill
    g.rightRailCollapsed = true;
    g.onHudPillClick('innate', 'human');
    const collapsedAfterPillClick = g.rightRailCollapsed;
    const inspectorAfterPillClick = document.getElementById('universal-inspector-slot').innerHTML;

    return {
      afterSelectKey,
      duringHoverKey,
      afterHoverEndKey,
      afterCancel,
      collapsedAfterPillClick,
      inspectorAfterPillClick,
    };
  })()`, ctx) as any;

  assert.equal(res.afterSelectKey, 'sweep');
  assert.equal(res.duringHoverKey, 'cross');
  assert.equal(res.afterHoverEndKey, 'sweep');
  assert.equal(res.afterCancel, null);
  assert.equal(res.collapsedAfterPillClick, false);
  assert.ok(res.inspectorAfterPillClick.includes('Normal Innate:'));
});

test('HitParticleEngine.computeCalloutPosition keeps floating callouts inside short horizontal viewports', () => {
  const { ctx } = createTrackedSandbox();
  const res = vm.runInContext(`(() => {
    const shortTop = HitParticleEngine.computeCalloutPosition({ x: 30, y: 20 }, { width: 844, height: 390 });
    const shortBottom = HitParticleEngine.computeCalloutPosition({ x: 900, y: 410 }, { width: 667, height: 375 });
    const desktop = HitParticleEngine.computeCalloutPosition({ x: 720, y: 280 }, { width: 1440, height: 900 });
    return { shortTop, shortBottom, desktop };
  })()`, ctx) as any;

  assert.equal(res.shortTop.x, 110);
  assert.equal(res.shortTop.y, 80);
  assert.equal(res.shortBottom.x, 667 - 84);
  assert.equal(res.shortBottom.y, 375 - 22);
  assert.equal(res.desktop.x, 720);
  assert.equal(res.desktop.y, 280 - 34);
});

test('Bundled shell includes single settings popover base rule, landscape mobile layout query, autostart hook, and fullscreen toggle button', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const settingsBaseMatches = html.match(/#settings-popover\{position:fixed;/g) || [];
  assert.equal(settingsBaseMatches.length, 1, 'Duplicate #settings-popover base CSS rules should be consolidated');
  assert.ok(html.includes('@media (orientation: landscape) and (min-width: 560px) and (max-height: 600px)'));
  assert.ok(html.includes('data-start="true"'));
  assert.ok(html.includes("get('autostart') === '1'"));
  assert.ok(html.includes('data-fullscreen-btn="true"'));
  assert.ok(html.includes('onclick="toggleFullscreen()"'));
});

test('Fullscreen key (F), Right Rail expanded/collapsed Fullscreen buttons, Escape fallback exit, and Engine.canPayUltra work cleanly', () => {
  const { ctx, bodyClasses } = createTrackedSandbox();
  const res = vm.runInContext(`(() => {
    // 1. Before G exists, pressing F toggles viewport-fullscreen fallback cleanly in headless sandbox
    let prevented = false;
    InputManager.handleKeyDown({ key: 'f', preventDefault: () => { prevented = true; } });
    const activeAfterF = isFullscreenActive();
    const fallbackClassAfterF = document.body.classList.contains('viewport-fullscreen');

    // Ctrl+F must NOT toggle fullscreen
    InputManager.handleKeyDown({ key: 'f', ctrlKey: true, preventDefault: () => {} });
    const stillActiveAfterCtrlF = isFullscreenActive();

    // Typing 'f' in INPUT must NOT toggle fullscreen
    InputManager.handleKeyDown({ key: 'f', target: { tagName: 'INPUT' }, preventDefault: () => {} });
    const stillActiveAfterInput = isFullscreenActive();

    // Escape exits viewport-fullscreen fallback
    InputManager.handleKeyDown({ key: 'Escape' });
    const activeAfterEsc = isFullscreenActive();

    // 2. Gameplay Right Rail (collapsed by default -> expanded drawer) renders Fullscreen button and reflects active state
    const g = new GameController('ryu', 'ken', 'champion');
    G = g;
    g.confirmMulligan();
    g.toggleRightRail();
    const expandedInactiveHtml = document.getElementById('app').innerHTML;

    InputManager.handleKeyDown({ key: 'F', preventDefault: () => {} });
    paint();
    const expandedActiveHtml = document.getElementById('app').innerHTML;

    g.toggleRightRail();
    const collapsedActiveHtml = document.getElementById('app').innerHTML;

    // Escape while Info Modal is open closes Info Modal first, then second Escape exits fallback fullscreen
    g.openInfo('human');
    InputManager.handleKeyDown({ key: 'Escape' });
    const modalAfterFirstEsc = g.infoModal;
    const activeAfterFirstEsc = isFullscreenActive();
    InputManager.handleKeyDown({ key: 'Escape' });
    const activeAfterSecondEsc = isFullscreenActive();

    // 3. Engine.canPayUltra checks Gauge vs cost
    const metsu = SimulateStrikePreview.resolveCardByKey('metsu_hadoken'); // gaugeCost 3
    const p = g.human();
    p.gauge = [];
    const canPay0 = g.engine.canPayUltra(p, metsu);
    p.gauge = [metsu, metsu, metsu];
    const canPay3 = g.engine.canPayUltra(p, metsu);

    return {
      prevented,
      activeAfterF,
      fallbackClassAfterF,
      stillActiveAfterCtrlF,
      stillActiveAfterInput,
      activeAfterEsc,
      expandedInactiveHtml,
      expandedActiveHtml,
      collapsedActiveHtml,
      modalAfterFirstEsc,
      activeAfterFirstEsc,
      activeAfterSecondEsc,
      canPay0,
      canPay3,
    };
  })()`, ctx) as any;

  assert.equal(res.prevented, true);
  assert.equal(res.activeAfterF, true);
  assert.equal(res.fallbackClassAfterF, true);
  assert.equal(res.stillActiveAfterCtrlF, true);
  assert.equal(res.stillActiveAfterInput, true);
  assert.equal(res.activeAfterEsc, false);
  assert.equal(bodyClasses.has('viewport-fullscreen'), false);

  assert.ok(res.expandedInactiveHtml.includes('data-fullscreen-btn="true"'));
  assert.ok(res.expandedInactiveHtml.includes('aria-pressed="false"'));
  assert.ok(res.expandedActiveHtml.includes('aria-pressed="true"'));
  assert.ok(res.collapsedActiveHtml.includes('data-fullscreen-btn="true"'));
  assert.ok(res.collapsedActiveHtml.includes('aria-pressed="true"'));

  assert.equal(res.modalAfterFirstEsc, null);
  assert.equal(res.activeAfterFirstEsc, true, 'First Escape closes Info Modal before exiting fullscreen');
  assert.equal(res.activeAfterSecondEsc, false, 'Second Escape exits viewport fallback fullscreen');
  assert.equal(res.canPay0, false);
  assert.equal(res.canPay3, true);
});

test('Keyboard activation, focus collision guards, ARIA attributes, reduced-flash CSS, and HTP shortcut hint', () => {
  const { ctx } = createTrackedSandbox();
  const res = vm.runInContext(`(() => {
    const g = new GameController('ryu', 'ken', 'champion');
    G = g;
    g.confirmMulligan();
    g.toggleRightRail();
    const appHtml = document.getElementById('app').innerHTML;

    // Select a card, then simulate pressing Enter while focus is on a native <button> (should NOT fire strike)
    g.selectActionCard(g.human().hand[0].uid);
    let strikeConfirmCalled = false;
    const origConfirm = g.confirmActionCard.bind(g);
    g.confirmActionCard = (t) => { if (t === 'strike') strikeConfirmCalled = true; return origConfirm(t); };
    InputManager.handleKeyDown({
      key: 'Enter',
      target: { tagName: 'BUTTON' },
      preventDefault: () => {},
    });
    const strikeAfterButtonEnter = strikeConfirmCalled;

    // Simulate pressing Enter on a focused custom card tile (role=button) -> invokes target.click() without firing strike
    let tileClicked = false;
    let tilePrevented = false;
    InputManager.handleKeyDown({
      key: 'Enter',
      target: {
        tagName: 'DIV',
        getAttribute: (a) => a === 'role' ? 'button' : null,
        classList: { contains: (c) => c === 'card-tile' },
        click: () => { tileClicked = true; },
      },
      preventDefault: () => { tilePrevented = true; },
    });

    // Disabled custom tile must NOT trigger click
    let disabledClicked = false;
    InputManager.handleKeyDown({
      key: ' ',
      target: {
        tagName: 'DIV',
        getAttribute: () => null,
        classList: { contains: (c) => c === 'card-tile' || c === 'disabled' },
        click: () => { disabledClicked = true; },
      },
      preventDefault: () => {},
    });

    // Space on a focused native button during strike_result must NOT skip/continue automatically
    g.mode = 'strike_result';
    let continued = false;
    g.continueAfterStrikeResult = () => { continued = true; };
    InputManager.handleKeyDown({
      key: ' ',
      target: { tagName: 'BUTTON' },
      preventDefault: () => {},
    });
    const continuedAfterBtnSpace = continued;

    // Command Manual footer contains F Fullscreen hint
    openHowToPlay();
    const htpHtml = document.getElementById('howToPlayBox').innerHTML;
    closeHowToPlay();

    return {
      appHtml,
      strikeAfterButtonEnter,
      tileClicked,
      tilePrevented,
      disabledClicked,
      continuedAfterBtnSpace,
      htpHtml,
    };
  })()`, ctx) as any;

  assert.equal(res.strikeAfterButtonEnter, false, 'Enter on focused <button> must not trigger confirmActionCard(strike)');
  assert.equal(res.tileClicked, true, 'Enter on focused custom interactive tile invokes click()');
  assert.equal(res.tilePrevented, true);
  assert.equal(res.disabledClicked, false, 'Disabled card tile must ignore Space/Enter activation');
  assert.equal(res.continuedAfterBtnSpace, false, 'Space on focused <button> in strike_result must not bypass button action');
  assert.ok(res.appHtml.includes('class="cell cell-movable"') || res.appHtml.includes('cell-movable" data-dist='), 'Board renders movable cells');
  assert.ok(res.appHtml.includes('role="button" tabindex="0" aria-label="Move to space'), 'Movable cells are keyboard-accessible buttons');
  assert.ok(res.appHtml.includes('aria-selected="true" data-rail-tab="log"'), 'Active rail tab exposes aria-selected="true"');
  assert.ok(res.appHtml.includes('aria-expanded="true"'), 'Expanded rail collapse button exposes aria-expanded="true"');
  assert.ok(res.htpHtml.includes('F Fullscreen'), 'Command Manual footer keyhints document F Fullscreen');

  const shellHtml = fs.readFileSync(path.join(ROOT, 'game/shell.html'), 'utf8');
  assert.ok(shellHtml.includes('class="fighter-card" role="button" tabindex="0"'), 'Fighter cards are keyboard focusable');
  assert.ok(shellHtml.includes('class="char-card" role="button" tabindex="0"'), 'Difficulty cards are keyboard focusable');
  assert.ok(shellHtml.includes('body.reduced-flash #app.screen-shake'), 'shell.html implements body.reduced-flash motion reduction CSS');
  assert.ok(shellHtml.includes('.center-screen .log-panel{max-height:calc(100dvh - 150px)'), 'shell.html fits game_over screen on horizontal mobile');
});

test('Mobile space optimization: Enriched Arena Frame, Range Ruler, mobilePanelTab sync, and portrait mobile layout CSS', () => {
  const { ctx } = createTrackedSandbox();
  const res = vm.runInContext(`(() => {
    const g = new GameController('ryu', 'ken', 'champion');
    G = g;
    g.mode = 'awaiting_action';
    g.engine.active = 'p1';
    g.toggleRightRail();

    const appHtml = document.getElementById('app').innerHTML;
    const defaultMobileTab = g.mobilePanelTab;
    const defaultRailTab = g.rightRailTab;

    // Switching right rail tab syncs mobilePanelTab
    g.setRightRailTab('normals');
    const afterNormals = { rail: g.rightRailTab, mobile: g.mobilePanelTab };

    // Switching mobile tab to inspector leaves desktop rightRailTab intact
    g.setMobilePanelTab('inspector');
    const afterMobileInspect = { rail: g.rightRailTab, mobile: g.mobilePanelTab };

    // Trainer / Study Mode switches mobilePanelTab to coach
    g.toggleStudyMode();
    const afterStudyOn = { rail: g.rightRailTab, mobile: g.mobilePanelTab };

    // Selecting a card or clicking a HUD pill focuses inspector on mobile
    const firstCard = g.human().hand[0];
    g.selectActionCard(firstCard.uid);
    const afterSelectCard = g.mobilePanelTab;

    g.setMobilePanelTab('log');
    g.onHudPillClick('ryu_innate');
    const afterHudPill = g.mobilePanelTab;

    // ClashSummaryBanner toggles .has-clash-banner on parent .arena-top-strip
    const parentClasses = new Set();
    const fakeParent = {
      classList: {
        contains: (c) => c === 'arena-top-strip' || parentClasses.has(c),
        add: (c) => { parentClasses.add(c); },
        remove: (c) => { parentClasses.delete(c); },
      },
    };
    const fakeSlot = {
      innerHTML: '',
      parentElement: fakeParent,
      classList: { add: () => {}, remove: () => {} },
    };
    const origGetById = document.getElementById;
    document.getElementById = (id) => (id === 'clash-banner-slot' ? fakeSlot : origGetById(id));
    ClashSummaryBanner.render({
      willWhiff: false,
      isPublicStateLethal: false,
      projectedDamage: 5,
      effectiveStats: { minRange: 1, maxRange: 2, pow: 5, spd: 5, arm: 0, grd: 0, oppVisibleArm: 0, oppVisibleGrd: 0 },
      cardName: 'Sweep',
    }, g.engine.getInformationSet('p1'), {});
    const hasBannerAfterRender = parentClasses.has('has-clash-banner');
    ClashSummaryBanner.clear();
    const hasBannerAfterClear = parentClasses.has('has-clash-banner');
    if (typeof StrikePreviewController !== 'undefined' && StrikePreviewController.clear) {
      StrikePreviewController.clear();
    }
    document.getElementById = origGetById;

    return {
      appHtml,
      defaultMobileTab,
      defaultRailTab,
      afterNormals,
      afterMobileInspect,
      afterStudyOn,
      afterSelectCard,
      afterHudPill,
      hasBannerAfterRender,
      hasBannerAfterClear,
    };
  })()`, ctx) as any;

  // Enriched Arena Stage Frame & Range Ruler structure
  assert.ok(res.appHtml.includes('class="arena-board-frame"'), 'Board is wrapped in .arena-board-frame');
  assert.ok(res.appHtml.includes('class="arena-top-strip"'), 'Arena frame includes .arena-top-strip');
  assert.ok(res.appHtml.includes('class="arena-status-bar"'), 'Arena top strip includes live .arena-status-bar');
  assert.ok(res.appHtml.includes('class="cell-space-num"'), 'Arena cells show 1..9 space indices');
  assert.ok(res.appHtml.includes('cell-corner'), 'Edge arena cells mark corners');
  assert.ok(res.appHtml.includes('cell-between'), 'Arena highlights spaces between fighters');
  assert.ok(res.appHtml.includes('class="range-readout arena-range-bar"'), 'Arena frame includes live .arena-range-bar');
  assert.ok(res.appHtml.includes('You · Sp'), 'Range bar displays player space');
  assert.ok(res.appHtml.includes('CPU · Sp'), 'Range bar displays CPU space');
  assert.ok(res.appHtml.includes('data-mobile-tab="inspector"'), 'Gameplay stage exposes mobile panel tab state');
  assert.ok(res.appHtml.includes('data-mobile-tab-btn="inspector"'), 'Mobile-only Inspect tab button is rendered');
  assert.ok(!res.appHtml.includes('undefined') && !res.appHtml.includes('NaN'), 'Rendered arena contains no undefined/NaN');

  // Mobile panel tab synchronization
  assert.equal(res.defaultMobileTab, 'inspector', 'mobilePanelTab defaults to inspector');
  assert.equal(res.defaultRailTab, 'log', 'desktop rightRailTab still defaults to log');
  assert.equal(res.afterNormals.rail, 'normals');
  assert.equal(res.afterNormals.mobile, 'normals');
  assert.equal(res.afterMobileInspect.rail, 'normals');
  assert.equal(res.afterMobileInspect.mobile, 'inspector');
  assert.equal(res.afterStudyOn.rail, 'coach');
  assert.equal(res.afterStudyOn.mobile, 'coach');
  assert.equal(res.afterSelectCard, 'inspector');
  assert.equal(res.afterHudPill, 'inspector');

  // Clash banner strip toggle
  assert.equal(res.hasBannerAfterRender, true, 'ClashSummaryBanner.render marks .arena-top-strip with .has-clash-banner');
  assert.equal(res.hasBannerAfterClear, false, 'ClashSummaryBanner.clear removes .has-clash-banner');

  // CSS rules in shell.html & built bundle
  const bundledHtml = fs.readFileSync(HTML_PATH, 'utf8');
  assert.ok(
    bundledHtml.includes('@media (max-width: 1023px) and (orientation: portrait), (max-width: 559px)'),
    'Bundled HTML includes portrait mobile zero-scroll layout query',
  );
  assert.ok(bundledHtml.includes('.arena-board-frame{'), 'Bundled HTML includes .arena-board-frame styles');
  assert.ok(bundledHtml.includes('.mobile-only-tab{display:none;'), 'Bundled HTML hides .mobile-only-tab on desktop');
  assert.ok(bundledHtml.includes('height:100%;min-height:74px;max-height:none'), 'Landscape mobile expands arena board cells to use available height');
});

test('Inline Fighter Innates, Adaptive Card View Modes, Full Card Lightbox Modal, and Icon+Color Stat Pills work end-to-end', () => {
  const { ctx } = createTrackedSandbox();
  const res = vm.runInContext(`(() => {
    const lightboxEl = {
      innerHTML: '',
      style: { display: 'none' },
      attrs: {},
      setAttribute(k, v) { this.attrs[k] = String(v); },
    };
    const origGetById = document.getElementById;
    document.getElementById = (id) => (id === 'card-lightbox-overlay' ? lightboxEl : origGetById(id));

    const g = new GameController('ryu', 'ken', 'student');
    G = g;
    g.confirmMulligan();
    g.toggleRightRail();
    const initialHtml = document.getElementById('app').innerHTML;

    // Exceed Ryu and re-render to verify inline Innate updates to Exceeded text
    const ryu = g.human();
    ryu.exceeded = true;
    paint();
    const exceededHtml = document.getElementById('app').innerHTML;
    ryu.exceeded = false;
    paint();

    // Card view density cycling: auto -> full -> compact -> auto
    const defaultMode = g.getCardViewMode();
    g.cycleCardViewMode();
    const modeAfter1 = g.getCardViewMode();
    const fullStageHtml = document.getElementById('app').innerHTML;
    g.cycleCardViewMode();
    const modeAfter2 = g.getCardViewMode();
    const compactStageHtml = document.getElementById('app').innerHTML;
    g.cycleCardViewMode();
    const modeAfter3 = g.getCardViewMode();

    // Opening Full Card Lightbox via right-click / double-click does NOT repaint #app
    const appBeforeModal = document.getElementById('app').innerHTML;
    const card = g.human().hand[0];
    g.onCardContextMenu({ preventDefault() {}, stopPropagation() {} }, card.uid, false);
    const appAfterOpen = document.getElementById('app').innerHTML;
    const modalOpenDisplay = lightboxEl.style.display;
    const modalOpenHtml = lightboxEl.innerHTML;
    const isModalOpen = g.isCardModalOpen();

    // Closing Full Card Lightbox clears overlay without repainting #app
    g.closeCardModal();
    const appAfterClose = document.getElementById('app').innerHTML;
    const modalClosedDisplay = lightboxEl.style.display;
    const isModalClosed = g.isCardModalOpen();

    // Double-click opens modal and suppresses immediate single-click selection toggle
    g.selectedActionCardUid = null;
    g.onCardDoubleClick({ preventDefault() {}, stopPropagation() {} }, card.uid, false);
    const modalAfterDbl = g.isCardModalOpen();
    g.selectActionCard(card.uid);
    const selectedAfterSuppressedClick = g.selectedActionCardUid;
    g.closeCardModal();

    // Keyboard shortcut 'v' opens modal for selected/hovered card; 'Escape' closes it
    g.selectActionCard(card.uid);
    g.openActiveCardModal();
    const modalAfterV = g.isCardModalOpen();
    g.closeCardModal();

    // ClashSummaryBanner uses icon+color stat pills
    const fakeBannerSlot = { innerHTML: '', parentElement: null, classList: { add() {}, remove() {} } };
    document.getElementById = (id) => (
      id === 'clash-banner-slot' ? fakeBannerSlot :
      id === 'card-lightbox-overlay' ? lightboxEl : origGetById(id)
    );
    ClashSummaryBanner.render({
      willWhiff: false,
      isPublicStateLethal: false,
      projectedDamage: 4,
      effectiveStats: { minRange: 1, maxRange: 2, pow: 4, spd: 5, arm: 1, grd: 2, oppVisibleArm: 1, oppVisibleGrd: 0 },
      cardName: card.name,
    }, g.engine.getInformationSet('p1'), {});
    const clashBannerHtml = fakeBannerSlot.innerHTML;
    ClashSummaryBanner.clear();
    document.getElementById = origGetById;

    return {
      initialHtml,
      exceededHtml,
      ryuNormalInnate: CHARACTERS.ryu.innateText,
      ryuExceedInnate: CHARACTERS.ryu.exceedText,
      defaultMode,
      modeAfter1,
      modeAfter2,
      modeAfter3,
      fullStageHtml,
      compactStageHtml,
      sameAppOnOpen: appBeforeModal === appAfterOpen,
      sameAppOnClose: appBeforeModal === appAfterClose,
      modalOpenDisplay,
      modalOpenHtml,
      isModalOpen,
      modalClosedDisplay,
      isModalClosed,
      modalAfterDbl,
      selectedAfterSuppressedClick,
      modalAfterV,
      clashBannerHtml,
      cardName: card.name,
    };
  })()`, ctx) as any;

  // 1. Inline Fighter HUD Innate (Normal & Exceeded)
  assert.ok(res.initialHtml.includes('class="hud-innate-inline"'), 'Fighter stripe renders .hud-innate-inline');
  assert.ok(res.initialHtml.includes(res.ryuNormalInnate.slice(0, 24)), 'Inline HUD shows active Normal Innate text');
  assert.ok(res.exceededHtml.includes('hud-innate-inline is-exceeded'), 'Exceeded fighter applies .is-exceeded inline class');
  assert.ok(res.exceededHtml.includes(res.ryuExceedInnate.slice(0, 24)), 'Exceeded fighter inline HUD updates to Exceed text');

  // 2. Adaptive card view mode cycling & markup
  assert.equal(res.defaultMode, 'auto');
  assert.equal(res.modeAfter1, 'full');
  assert.equal(res.modeAfter2, 'compact');
  assert.equal(res.modeAfter3, 'auto');
  assert.ok(res.fullStageHtml.includes('data-card-view="full"'), 'Full mode reflects on .gameplay-stage');
  assert.ok(res.fullStageHtml.includes('Cards: </span>Full'), 'Utility strip shows Cards: Full label');
  assert.ok(res.compactStageHtml.includes('data-card-view="compact"'), 'Compact mode reflects on .gameplay-stage');
  assert.ok(res.initialHtml.includes('class="card-face-attack"'), 'Card tiles include adaptive attack text container');
  assert.ok(res.initialHtml.includes('class="card-face-boost-full"'), 'Card tiles include adaptive full boost container');
  assert.equal(res.initialHtml.includes('class="card-text"'), false, 'Compact/adaptive tiles never reintroduce legacy class="card-text"');

  // 3. Full Card Lightbox modal lifecycle without repainting #app
  assert.equal(res.isModalOpen, true);
  assert.equal(res.modalOpenDisplay, 'flex');
  assert.equal(res.sameAppOnOpen, true, 'Opening Full Card Lightbox must not repaint #app');
  assert.equal(res.sameAppOnClose, true, 'Closing Full Card Lightbox must not repaint #app');
  assert.equal(res.isModalClosed, false);
  assert.equal(res.modalClosedDisplay, 'none');
  assert.ok(res.modalOpenHtml.includes('class="full-card-modal'), 'Lightbox renders .full-card-modal');
  assert.ok(res.modalOpenHtml.includes(res.cardName), 'Lightbox displays full card name');
  assert.ok(res.modalOpenHtml.includes('full-card-stats-grid'), 'Lightbox displays 5-stat pill grid');
  assert.ok(res.modalOpenHtml.includes('BOOST HALF'), 'Lightbox displays split Boost half');
  assert.equal(res.modalAfterDbl, true, 'Double-click opens Full Card Lightbox');
  assert.equal(res.selectedAfterSuppressedClick, null, 'Double-click suppresses accidental single-click selection');
  assert.equal(res.modalAfterV, true, 'openActiveCardModal (V shortcut) opens lightbox for selected card');

  // 4. Unified Icon + Color Stat Pills across cards, arena range bar, clash banner, and lightbox
  for (const statKey of ['rng', 'pow', 'spd', 'arm', 'grd']) {
    assert.ok(res.initialHtml.includes(`stat-pill stat-${statKey}`), `Hand cards render color-coded stat-${statKey} pill`);
    assert.ok(res.modalOpenHtml.includes(`stat-pill stat-${statKey}`), `Full Card modal renders color-coded stat-${statKey} pill`);
  }
  assert.ok(res.initialHtml.includes('class="stat-ico"'), 'Stat pills embed crisp inline SVG icons');
  assert.ok(res.initialHtml.includes('arena-range-core"><span class="stat stat-pill stat-rng'), 'Arena Range Ruler uses color+icon RNG pill');
  assert.ok(res.clashBannerHtml.includes('stat-pill stat-spd'), 'Clash Summary Banner uses color+icon SPD pill');
  assert.ok(res.clashBannerHtml.includes('stat-pill stat-pow'), 'Clash Summary Banner uses color+icon POW pill');

  // 5. CSS rules present in built bundle
  const bundledHtml = fs.readFileSync(HTML_PATH, 'utf8');
  assert.ok(bundledHtml.includes('id="card-lightbox-overlay"'), 'Built bundle mounts #card-lightbox-overlay outside #app');
  assert.ok(bundledHtml.includes('id="set-cardview"'), 'Settings popover includes Hand Card Display selector');
  assert.ok(bundledHtml.includes('--stat-rng:#f7c65a'), 'Built bundle defines semantic stat palette variables');
});

test('Zoomed Headshot Portraits option applies to all 41 fighters across HUD, tokens, and Fighter Info modals, and all 41 fighters have portraits', () => {
  const { ctx } = createTrackedSandbox();
  const res = vm.runInContext(`(() => {
    const allCharKeys = Object.keys(CHARACTERS).sort();
    const photoKeys = Object.keys(FIGHTER_PHOTOS).sort();
    const hsKeys = Object.keys(FIGHTER_HEADSHOTS).sort();
    const validPhotoData = allCharKeys.every(k => {
      const u = FIGHTER_PHOTOS[k];
      return typeof u === 'string' && u.startsWith('data:image/jpeg;base64,') && u.length > 1000;
    });
    const newKeysChecked = ['ragna', 'jin', 'noel', 'taokaka', 'tager', 'nu13', 'bang', 'hakumen', 'platinum', 'testament', 'leo', 'guile', 'chipp', 'anji', 'may', 'ramlethal', 'nagoriyuki', 'baiken', 'faust', 'ino', 'jacko', 'happychaos', 'zato1', 'goldlewis', 'mbison', 'ky', 'sagat', 'millia', 'sol'];
    const cleanNewPhotos = newKeysChecked.every(k => {
      const u = FIGHTER_PHOTOS[k];
      return typeof u === 'string' && u.startsWith('data:image/jpeg;base64,') && !u.includes('NaN') && !u.includes('undefined');
    });
    const validHsData = allCharKeys.every(k => {
      const u = FIGHTER_HEADSHOTS[k];
      return typeof u === 'string' && u.startsWith('data:image/jpeg;base64,') && !u.includes('NaN') && !u.includes('undefined');
    });

    const defaultSetting = UXSettings.get('headshotPortraits');
    const ryuFullSrc = fighterPhotoSrc('ryu');
    const sagatFullSrc = fighterPhotoSrc('sagat');

    // Toggle headshot mode ON
    UXSettings.set('headshotPortraits', true);
    const ryuHsSrc = fighterPhotoSrc('ryu');
    const sagatHsSrc = fighterPhotoSrc('sagat');

    // Verify in-match HUD, board tokens, and Fighter Info modal reflect headshot for both ryu and sagat
    const g = new GameController('ryu', 'sagat', 'student');
    G = g;
    g.confirmMulligan();
    const matchHsHtml = document.getElementById('app').innerHTML;
    g.openInfo('human');
    const modalHsHtml = document.getElementById('app').innerHTML;
    g.closeInfo();

    // Toggle headshot mode OFF and confirm live repaint reverts to full portrait
    UXSettings.set('headshotPortraits', false);
    const ryuRevertedSrc = fighterPhotoSrc('ryu');
    const sagatRevertedSrc = fighterPhotoSrc('sagat');
    paint();
    const matchFullHtml = document.getElementById('app').innerHTML;

    return {
      allCharKeys,
      photoKeys,
      hsKeys,
      validPhotoData,
      cleanNewPhotos,
      validHsData,
      defaultSetting,
      ryuChanged: ryuFullSrc !== ryuHsSrc && ryuHsSrc === FIGHTER_HEADSHOTS.ryu && ryuRevertedSrc === ryuFullSrc,
      sagatChanged: sagatFullSrc !== sagatHsSrc && sagatHsSrc === FIGHTER_HEADSHOTS.sagat && sagatRevertedSrc === sagatFullSrc,
      matchHsHtml,
      modalHsHtml,
      matchFullHtml,
    };
  })()`, ctx) as any;

  assert.deepEqual([...res.photoKeys], [...res.allCharKeys], 'Every fighter in CHARACTERS (41/41) has a FIGHTER_PHOTOS portrait');
  assert.equal(res.validPhotoData, true, 'All 41 full portraits are valid base64 JPEGs');
  assert.equal(res.cleanNewPhotos, true, 'All newly integrated full portraits are valid base64 JPEGs without NaN/undefined');
  assert.deepEqual([...res.hsKeys], [...res.allCharKeys], 'FIGHTER_HEADSHOTS covers all 41 fighters in CHARACTERS');
  assert.equal(res.validHsData, true, 'All 41 headshot JPEGs are valid base64 without NaN/undefined');
  assert.equal(res.defaultSetting, false, 'headshotPortraits defaults to false (Full Portraits)');
  assert.equal(res.ryuChanged, true, 'fighterPhotoSrc switches cleanly between full and headshot and back without stale cache for Ryu');
  assert.equal(res.sagatChanged, true, 'fighterPhotoSrc switches cleanly between full and headshot and back without stale cache for Sagat');
  assert.ok(res.matchHsHtml.includes('data-portrait-kind="headshot" data-fighter-key="ryu"'), 'In-match HUD/token renders Ryu as headshot when enabled');
  assert.ok(res.matchHsHtml.includes('data-portrait-kind="headshot" data-fighter-key="sagat"'), 'In-match HUD/token renders Sagat as headshot when enabled');
  assert.ok(res.modalHsHtml.includes('class="modal-silhouette-wrap"><img class="fighter-silhouette fighter-photo accent-you" data-portrait-kind="headshot" data-fighter-key="ryu"'), 'Fighter Info modal renders zoomed headshot when enabled');
  assert.ok(!res.matchFullHtml.includes('data-portrait-kind="headshot"'), 'Disabling headshot mode reverts all in-match portraits back to full');

  const bundledHtml = fs.readFileSync(HTML_PATH, 'utf8');
  assert.ok(bundledHtml.includes('id="set-headshots"'), 'Settings popover includes Zoomed Headshots checkbox');
  assert.ok(bundledHtml.includes('data-portrait-choice="headshot"'), 'Fighter Select & Opponent Select include Zoomed Headshots toggle');
  assert.ok(bundledHtml.includes('FIGHTER_HEADSHOTS'), 'Built bundle includes FIGHTER_HEADSHOTS');
  assert.ok(
    bundledHtml.includes('max-height:0;opacity:0') && bundledHtml.includes('.fighter-card:hover .fighter-card-blurb'),
    'Fighter card descriptions stay hidden at rest and reveal on mouseover/focus-visible'
  );
});

test('Arena cleanup: Right Panel defaults collapsed, Strike jumps straight to next turn while keeping Last Strike Recap modal', () => {
  const { ctx } = createTrackedSandbox();
  const res = vm.runInContext(`(() => {
    const g = new GameController('ryu', 'ken', 'champion', { beginner: true });
    G = g;
    g.confirmMulligan();
    const defaultCollapsed = g.rightRailCollapsed;
    const defaultPauseAfter = UXSettings.get('pauseAfterStrike');
    const idleHtml = document.getElementById('app').innerHTML;

    const p1 = g.human(), p2 = g.ai();
    p1.pos = 3; p2.pos = 4;
    const c1 = { ...SimulateStrikePreview.resolveCardByKey('cross'), uid: 'ls1' };
    const c2 = { ...SimulateStrikePreview.resolveCardByKey('sweep'), uid: 'ls2' };
    const gen = g.engine.resolveStrikeSteps({
      initiator: 'p1',
      attackerSel: { card: c1, fromWildSwing: false },
      defenderSel: { card: c2, fromWildSwing: false },
      gaugePay: {},
    });
    g.driveStrikeGen(gen, undefined);
    const postStrikeMode = g.mode;
    const afterStrikeHtml = document.getElementById('app').innerHTML;
    g.toggleLastStrikeModal();
    const modalHtml = document.getElementById('app').innerHTML;
    g.closeLastStrikeModal();
    const afterCloseModalHtml = document.getElementById('app').innerHTML;
    return { defaultCollapsed, defaultPauseAfter, idleHtml, postStrikeMode, afterStrikeHtml, modalHtml, afterCloseModalHtml };
  })()`, ctx) as any;

  assert.equal(res.defaultCollapsed, true);
  assert.equal(res.defaultPauseAfter, false);
  assert.equal(res.postStrikeMode, 'awaiting_action', 'Strike should jump straight to next turn by default even in beginner mode');
  assert.ok(res.idleHtml.includes('class="top-utility-strip"'));
  assert.ok(res.idleHtml.includes('◀ Panel'));
  assert.equal(res.idleHtml.includes('right-rail drawer-open'), false);
  assert.equal(res.afterStrikeHtml.includes('Resolving Strike…'), false);
  assert.ok(res.afterStrikeHtml.includes('Last Strike'));
  assert.ok(res.modalHtml.includes('<b>Last Strike Recap</b>'));
  assert.ok(res.modalHtml.includes('G.closeLastStrikeModal()'));
  assert.equal(res.modalHtml.includes('breakdown-beat pending'), false, 'Last Strike modal must show all beats without beginner gating');
  assert.equal(res.afterCloseModalHtml.includes('<b>Last Strike Recap</b>'), false);
});

test('Quick-Commit defaults ON with split card halves and inline EX button, and toggling OFF restores two-step confirm', () => {
  const { ctx } = createTrackedSandbox();
  const res = vm.runInContext(`(() => {
    const defaultQuickCommit = UXSettings.get('quickCommit');
    const g = new GameController('ryu', 'ken', 'champion');
    G = g;
    g.confirmMulligan();
    const p = g.human();
    const baseCross = SimulateStrikePreview.resolveCardByKey('cross');
    const baseSweep = SimulateStrikePreview.resolveCardByKey('sweep');
    p.hand = [
      { ...baseCross, uid: 'qc_c1' },
      { ...baseCross, uid: 'qc_c2' },
      { ...baseSweep, uid: 'qc_s1' },
    ];
    paint();
    const qcHandHtml = document.getElementById('app').innerHTML;

    // Clicking upper half commits Strike immediately
    g.quickCommitCard('qc_s1', 'strike');
    const afterQuickStrikeActive = g.engine.active;
    const hadStrikeInfo = !!g.engine.lastStrikeInfo;

    // Reset human turn and test instant EX commit
    g.engine.active = 'p1';
    g.mode = 'awaiting_action';
    p.hand.push({ ...baseCross, uid: 'qc_c3' }, { ...baseCross, uid: 'qc_c4' });
    g.quickCommitEx('qc_c3', 'qc_c4');
    if (g.mode === 'critical_choice') g.resolveCriticalChoice(false);
    const lastExUsed = !!(g.engine.lastStrikeInfo && g.engine.lastStrikeInfo.sides && g.engine.lastStrikeInfo.sides.p1 && g.engine.lastStrikeInfo.sides.p1.isEX);

    // Reset human turn and test instant Boost commit (0 Force boost Sweep -> Continuous)
    g.engine.active = 'p1';
    g.mode = 'awaiting_action';
    const freeBoostCard = { ...SimulateStrikePreview.resolveCardByKey('focus'), uid: 'qc_f1' };
    p.hand.push(freeBoostCard);
    g.quickCommitCard('qc_f1', 'boost');
    const modeAfterBoost = g.mode;

    // Toggling quickCommit OFF switches hand tiles back to two-step selectActionCard
    UXSettings.set('quickCommit', false);
    g.engine.active = 'p1';
    g.mode = 'awaiting_action';
    paint();
    const twoStepHtml = document.getElementById('app').innerHTML;

    return {
      defaultQuickCommit,
      qcHandHtml,
      afterQuickStrikeActive,
      hadStrikeInfo,
      lastExUsed,
      modeAfterBoost,
      twoStepHtml,
    };
  })()`, ctx) as any;

  assert.equal(res.defaultQuickCommit, true);
  assert.ok(res.qcHandHtml.includes('quick-commit-tile'));
  assert.ok(res.qcHandHtml.includes(`G.quickCommitCard('qc_c1', 'strike')`));
  assert.ok(res.qcHandHtml.includes(`G.quickCommitCard('qc_c1', 'boost')`));
  assert.ok(res.qcHandHtml.includes(`G.quickCommitEx('qc_c1', 'qc_c2')`));
  assert.equal(res.hadStrikeInfo, true);
  assert.equal(res.afterQuickStrikeActive, 'p2');
  assert.equal(res.lastExUsed, true);
  assert.notEqual(res.modeAfterBoost, 'boost_select');
  assert.equal(res.twoStepHtml.includes('quick-commit-tile'), false);
  assert.ok(res.twoStepHtml.includes('G.selectActionCard('));
});

test('Inline card modification preview renders stat deltas in prompt bar and masks Wild Swing identity', () => {
  const { ctx } = createTrackedSandbox();
  const res = vm.runInContext(`(() => {
    const g = new GameController('ryu', 'ken', 'champion');
    G = g;
    g.confirmMulligan();
    const ryuHandoken = { ...SimulateStrikePreview.resolveCardByKey('hadoken_ryu'), uid: 'h1' };

    // 1. Standard critical_choice shows card name, base stats, critical deltas & text
    g.mode = 'critical_choice';
    g.sel = { card: ryuHandoken, hideCardName: false };
    paint();
    const critNormalHtml = document.getElementById('app').innerHTML;

    // 2. Wild Swing critical_choice masks card identity & base stats while showing public Dan critical bonus
    const gDan = new GameController('dan', 'ken', 'champion');
    G = gDan;
    gDan.confirmMulligan();
    gDan.human().pos = 3;
    gDan.ai().pos = 5;
    gDan.mode = 'critical_choice';
    gDan.sel = { card: ryuHandoken, hideCardName: true };
    paint();
    const critWildHtml = document.getElementById('app').innerHTML;

    // 3. face_up_choice for Sagat shows +SPD delta
    const gSagat = new GameController('sagat', 'ken', 'champion');
    G = gSagat;
    gSagat.confirmMulligan();
    const spike = { ...SimulateStrikePreview.resolveCardByKey('spike'), uid: 'sp1' };
    gSagat.mode = 'face_up_choice';
    gSagat.sel = { card: spike };
    paint();
    const faceUpHtml = document.getElementById('app').innerHTML;

    // 4. block_force_choice shows live ARM and projected damage delta when Force card selected
    const gBlk = new GameController('ryu', 'ken', 'champion');
    G = gBlk;
    gBlk.confirmMulligan();
    const blockCard = { ...SimulateStrikePreview.resolveCardByKey('block'), uid: 'blk1' };
    const forcePayCard = gBlk.human().hand.find(c => c.type !== 'ultra') || gBlk.human().hand[0];
    gBlk.mode = 'block_force_choice';
    gBlk.sel = {
      request: { type: 'block_force', attackerPow: 6, defenderArmBase: 2, defenderGuard: 4, maxForce: 2, cardKey: 'block', cardName: 'Block' },
      chosen: [forcePayCard.uid],
      resolvingCard: blockCard,
    };
    paint();
    const blockForceHtml = document.getElementById('app').innerHTML;

    return { critNormalHtml, critWildHtml, faceUpHtml, blockForceHtml };
  })()`, ctx) as any;

  assert.ok(res.critNormalHtml.includes('stage-prompt-mod-preview'));
  assert.ok(res.critNormalHtml.includes('Hadoken'));
  assert.ok(res.critNormalHtml.includes('mod-delta-pill'));
  assert.ok(res.critWildHtml.includes('is-masked'));
  assert.ok(res.critWildHtml.includes('Wild Swing (Unrevealed Card)'));
  assert.equal(res.critWildHtml.includes('Hadoken'), false, 'Wild Swing Critical prompt must NOT leak top card name');
  assert.ok(res.critWildHtml.includes('+1 POW'));
  assert.ok(res.critWildHtml.includes('+1 SPD'));
  assert.ok(res.faceUpHtml.includes('stage-prompt-mod-preview'));
  assert.ok(res.faceUpHtml.includes('SPD'));
  assert.ok(res.blockForceHtml.includes('ARM 2 → 4 (+2)'));
});

test('Boost HUD pills and ClashSummaryBanner display boost effects directly instead of card names', () => {
  const { ctx } = createTrackedSandbox();
  const res = vm.runInContext(`(() => {
    const g = new GameController('ryu', 'ken', 'champion');
    G = g;
    g.confirmMulligan();
    const cross = { ...SimulateStrikePreview.resolveCardByKey('cross'), uid: 'b_cross' };
    const assault = { ...SimulateStrikePreview.resolveCardByKey('assault'), uid: 'b_assault' };
    g.human().boostsInPlay.push({ card: cross, turnsUntilExpire: null });
    g.ai().boostsInPlay.push({ card: assault, turnsUntilExpire: null });
    paint();
    const hudHtml = document.getElementById('app').innerHTML;
    const expectedHumanEffect = boostEffectSummary(cross);
    const expectedCpuEffect = boostEffectSummary(assault);
    return { hudHtml, expectedHumanEffect, expectedCpuEffect };
  })()`, ctx) as any;

  assert.ok(res.hudHtml.includes(`⚡ ${res.expectedHumanEffect}`), 'Human boost pill must render effect text directly');
  assert.ok(res.hudHtml.includes(`⚡ ${res.expectedCpuEffect}`), 'CPU boost pill must render effect text directly');
  assert.ok(res.hudHtml.includes(`title="Cross:`), 'Boost pill keeps card name inside tooltip title');
  assert.equal(res.hudHtml.includes('>⚡ Cross<'), false, 'Boost pill text must not just be card name');
});

test('HitParticleEngine renders overhead Strike reveal card names with collision separation and action callouts', () => {
  const { ctx } = createTrackedSandbox();
  const res = vm.runInContext(`(() => {
    const g = new GameController('ryu', 'ken', 'champion');
    G = g;
    g.confirmMulligan();
    HitParticleEngine.clear();

    // Action callout on Prepare
    g.actionPrepare();
    const afterPrepare = HitParticleEngine.getState();

    // Adjacent fighters Strike reveal produces separated dual callouts
    const p1 = g.human(), p2 = g.ai();
    p1.pos = 4; p2.pos = 4;
    const c1 = { ...SimulateStrikePreview.resolveCardByKey('cross'), uid: 'ov1' };
    const c2 = { ...SimulateStrikePreview.resolveCardByKey('sweep'), uid: 'ov2' };
    const gen = g.engine.resolveStrikeSteps({
      initiator: 'p1',
      attackerSel: { card: c1, fromWildSwing: false },
      defenderSel: { card: c2, fromWildSwing: false },
      gaugePay: {},
    });
    g.driveStrikeGen(gen, undefined);
    const afterStrike = HitParticleEngine.getState();

    return { afterPrepare, afterStrike };
  })()`, ctx) as any;

  assert.ok(res.afterPrepare.overheadCalloutCount >= 1);
  assert.ok(res.afterPrepare.lastOverheadCallouts.some((c: any) => c.html.includes('PREPARE!')));
  assert.ok(res.afterStrike.overheadCalloutCount >= 3);
  const reveals = res.afterStrike.lastOverheadCallouts.slice(-2);
  assert.equal(reveals.length, 2);
  assert.ok(Math.abs(reveals[0].x - reveals[1].x) >= 120, 'Adjacent/shared-space reveal callouts must separate horizontally');
  assert.ok(reveals.some((c: any) => c.html.includes('Cross')));
  assert.ok(reveals.some((c: any) => c.html.includes('Sweep')));
});

test('Strike Preview rules parity: range bonuses, Before/Hit/After movement, immunities, Critical/Optional, Eddie, and life loss', () => {
  const ctx = loadGameSandbox();
  const res = vm.runInContext(`(() => {
    // 1. Cross: deterministic 3 dmg (no false '?'), After: Retreat 3 runs on BOTH hit AND whiff
    const e1 = new Engine('ryu', 'ken', () => 0.5);
    e1.P('p1').pos = 4; e1.P('p2').pos = 5; e1.P('p2').life = 20;
    const crossHit = SimulateStrikePreview.run(e1.getInformationSet('p1'), SimulateStrikePreview.resolveCardByKey('cross'), {});
    e1.P('p1').pos = 4; e1.P('p2').pos = 8; // dist 4, out of range 1-2
    const crossWhiff = SimulateStrikePreview.run(e1.getInformationSet('p1'), SimulateStrikePreview.resolveCardByKey('cross'), {});

    // 2. Focus: deterministic 4 dmg (Draw 1 does NOT set hasStochasticVariance), Public Lethal at 4 HP
    e1.P('p1').pos = 4; e1.P('p2').pos = 5; e1.P('p2').life = 4;
    const focusLethal = SimulateStrikePreview.run(e1.getInformationSet('p1'), SimulateStrikePreview.resolveCardByKey('focus'), {});

    // 3. Dive at Dist 4: connects via Before Advance 3 (hitByBeforeMove), initialDist 4 -> postBeforeDist 1
    e1.P('p1').pos = 1; e1.P('p2').pos = 5; e1.P('p2').life = 24;
    const diveMoveHit = SimulateStrikePreview.run(e1.getInformationSet('p1'), SimulateStrikePreview.resolveCardByKey('dive'), {});

    // 4. Axl Low normalsRangeBonus (+2 max range) & Nu-13 Exceed attackRangeBonus (+4 max range)
    const eAxl = new Engine('axl', 'ryu', () => 0.5);
    eAxl.P('p1').pos = 1; eAxl.P('p2').pos = 4; // dist 3; gg_slash printed 1-2, Axl boosts to 1-4
    const axlSlash = SimulateStrikePreview.run(eAxl.getInformationSet('p1'), SimulateStrikePreview.resolveCardByKey('gg_slash'), {});

    const eNu = new Engine('nu13', 'ryu', () => 0.5);
    eNu.P('p1').exceeded = true; eNu.P('p1').pos = 0; eNu.P('p2').pos = 6; // dist 6; sweep printed 1-3, Nu-13 Exceed -> 1-7
    const nuSweep = SimulateStrikePreview.run(eNu.getInformationSet('p1'), SimulateStrikePreview.resolveCardByKey('sweep'), {});

    // 5. Ken Knee Bash rangeMaxBonusIfInitiating (Striker vs Defender)
    const eKen = new Engine('ken', 'ryu', () => 0.5);
    eKen.P('p1').pos = 2; eKen.P('p2').pos = 5; // dist 3
    const kneeStriker = SimulateStrikePreview.run(eKen.getInformationSet('p1'), SimulateStrikePreview.resolveCardByKey('knee_bash'), { isInitiator: true });
    const kneeDefender = SimulateStrikePreview.run(eKen.getInformationSet('p1'), SimulateStrikePreview.resolveCardByKey('knee_bash'), { isInitiator: false });

    // 6. Opponent visible boost rangeImmuneRanges (Cammy CQC boost gives Range 1 immunity)
    const eImm = new Engine('ryu', 'cammy', () => 0.5);
    eImm.P('p1').pos = 3; eImm.P('p2').pos = 4; // dist 1
    eImm.P('p2').boostsInPlay.push({ card: SimulateStrikePreview.resolveCardByKey('cqc'), turnsUntilExpire: 1 });
    const blockedByImmunity = SimulateStrikePreview.run(eImm.getInformationSet('p1'), SimulateStrikePreview.resolveCardByKey('grasp'), {});

    // 7. C. Viper Burst Time (noHitWithoutContinuousBoost) & Temple Massage (optionalForceSpendForPow)
    const eCv = new Engine('cviper', 'ryu', () => 0.5);
    eCv.P('p1').pos = 3; eCv.P('p2').pos = 5; // dist 2
    eCv.P('p1').gauge = [SimulateStrikePreview.resolveCardByKey('cross'), SimulateStrikePreview.resolveCardByKey('cross'), SimulateStrikePreview.resolveCardByKey('cross'), SimulateStrikePreview.resolveCardByKey('cross')];
    const burstNoBoost = SimulateStrikePreview.run(eCv.getInformationSet('p1'), SimulateStrikePreview.resolveCardByKey('burst_time'), {});
    eCv.P('p1').boostsInPlay.push({ card: SimulateStrikePreview.resolveCardByKey('focus'), turnsUntilExpire: 1 });
    const burstWithBoost = SimulateStrikePreview.run(eCv.getInformationSet('p1'), SimulateStrikePreview.resolveCardByKey('burst_time'), {});
    eCv.P('p1').pos = 3; eCv.P('p2').pos = 4; // dist 1 for Temple Massage
    eCv.P('p1').hand = [
      SimulateStrikePreview.resolveCardByKey('temple_massage'),
      SimulateStrikePreview.resolveCardByKey('cross'),
      SimulateStrikePreview.resolveCardByKey('sweep'),
    ];
    const templeBase = SimulateStrikePreview.run(eCv.getInformationSet('p1'), SimulateStrikePreview.resolveCardByKey('temple_massage'), { useOptionalBranch: false });
    const templeOpt = SimulateStrikePreview.run(eCv.getInformationSet('p1'), SimulateStrikePreview.resolveCardByKey('temple_massage'), { useOptionalBranch: true });

    // 8. Ragna Gauntlet Hades (selfCannotHit on cross-up) & Ragna Innate life gain on hit
    const eRag = new Engine('ragna', 'ryu', () => 0.5);
    eRag.P('p1').life = 20; eRag.P('p1').pos = 3; eRag.P('p2').pos = 4; // Gauntlet Hades advances 2 -> crosses past CPU -> selfCannotHit
    const ragnaCrossMiss = SimulateStrikePreview.run(eRag.getInformationSet('p1'), SimulateStrikePreview.resolveCardByKey('ragna_gauntlet_hades'), {});
    eRag.P('p1').pos = 3; eRag.P('p2').pos = 4;
    const ragnaHealHit = SimulateStrikePreview.run(eRag.getInformationSet('p1'), SimulateStrikePreview.resolveCardByKey('cross'), {});

    // 9. Nagoriyuki Exceed Normal cleanup non-lethal self-damage
    const eNago = new Engine('nagoriyuki', 'ryu', () => 0.5);
    eNago.P('p1').exceeded = true; eNago.P('p1').life = 18; eNago.P('p1').pos = 3; eNago.P('p2').pos = 4;
    const nagoNormal = SimulateStrikePreview.run(eNago.getInformationSet('p1'), SimulateStrikePreview.resolveCardByKey('gg_slash'), {});

    // 10. Iron Tager selfMoveCap (Dive Advance 3 -> capped to 2) & Jin opponentCannotMove boost
    const eTag = new Engine('tager', 'jin', () => 0.5);
    eTag.P('p1').pos = 1; eTag.P('p2').pos = 6;
    const tagerDive = SimulateStrikePreview.run(eTag.getInformationSet('p1'), SimulateStrikePreview.resolveCardByKey('dive'), {});
    eTag.P('p2').boostsInPlay.push({ card: SimulateStrikePreview.resolveCardByKey('jin_dual_ice_strike'), turnsUntilExpire: 1 });
    const tagerFrozen = SimulateStrikePreview.run(eTag.getInformationSet('p1'), SimulateStrikePreview.resolveCardByKey('dive'), {});

    // 11. Sol Badguy canceledThisTurn (+POW) & Tyrant Rave corner wall-bounce (+2 POW & oppPostHitSpace)
    const eSol = new Engine('sol', 'ryu', () => 0.5);
    eSol.P('p1').pos = 6; eSol.P('p2').pos = 7; // 1 space behind CPU -> Push 2 hits wall (+2 POW)
    eSol.P('p1').gauge = [SimulateStrikePreview.resolveCardByKey('gg_slash'), SimulateStrikePreview.resolveCardByKey('gg_slash')];
    const tyrantCorner = SimulateStrikePreview.run(eSol.getInformationSet('p1'), SimulateStrikePreview.resolveCardByKey('tyrant_rave'), {});
    eSol.P('p1').turnState.canceledThisTurn = true;
    const tyrantCanceled = SimulateStrikePreview.run(eSol.getInformationSet('p1'), SimulateStrikePreview.resolveCardByKey('tyrant_rave'), {});

    // 12. Vega Bloody High Claw boost (rangeMaxBonus +1 & free Critical) + Ryu Critical Shoryuken (Close 1 turns miss into hit)
    const eVega = new Engine('vega', 'ryu', () => 0.5);
    eVega.P('p1').pos = 2; eVega.P('p2').pos = 5; // dist 3
    eVega.P('p1').boostsInPlay.push({ card: SimulateStrikePreview.resolveCardByKey('bloody_high_claw'), turnsUntilExpire: null });
    const vegaFreeCrit = SimulateStrikePreview.run(eVega.getInformationSet('p1'), SimulateStrikePreview.resolveCardByKey('cross'), {});

    const eRyuCrit = new Engine('ryu', 'ken', () => 0.5);
    eRyuCrit.P('p1').pos = 2; eRyuCrit.P('p2').pos = 4; // dist 2; Shoryuken printed rng 1 -> misses without Crit, hits with Crit (Before: Close 1)
    eRyuCrit.P('p1').gauge = [SimulateStrikePreview.resolveCardByKey('cross')];
    const shoryuBase = SimulateStrikePreview.run(eRyuCrit.getInformationSet('p1'), SimulateStrikePreview.resolveCardByKey('shoryuken_ryu'), { criticalPaid: false });
    const shoryuCrit = SimulateStrikePreview.run(eRyuCrit.getInformationSet('p1'), SimulateStrikePreview.resolveCardByKey('shoryuken_ryu'), { criticalPaid: true });

    // 13. Zato-1 Eddie attack origin for Specials
    const eZato = new Engine('zato1', 'ryu', () => 0.5);
    eZato.P('p1').pos = 0; eZato.P('p1').eddiePos = 5; eZato.P('p2').pos = 6; // Zato dist 6, Eddie dist 1
    const zatoEddie = SimulateStrikePreview.run(eZato.getInformationSet('p1'), SimulateStrikePreview.resolveCardByKey('zato_pierce'), {});

    // 14. Chun-Li Head Stomp (range: null, rangeIncludeIfSideSwapped: true)
    const eChun = new Engine('chunli', 'ryu', () => 0.5);
    eChun.P('p1').pos = 3; eChun.P('p2').pos = 4; // Advance 2 crosses past CPU -> hits via side swap
    const headStomp = SimulateStrikePreview.run(eChun.getInformationSet('p1'), SimulateStrikePreview.resolveCardByKey('head_stomp_chunli'), {});

    return {
      crossHit, crossWhiff, focusLethal, diveMoveHit, axlSlash, nuSweep,
      kneeStriker, kneeDefender, blockedByImmunity, burstNoBoost, burstWithBoost,
      templeBase, templeOpt, ragnaCrossMiss, ragnaHealHit, nagoNormal,
      tagerDive, tagerFrozen, tyrantCorner, tyrantCanceled,
      vegaFreeCrit, shoryuBase, shoryuCrit, zatoEddie, headStomp,
    };
  })()`, ctx) as any;

  // Cross
  assert.equal(res.crossHit.hasStochasticVariance, false);
  assert.equal(res.crossHit.willWhiff, false);
  assert.equal(res.crossHit.projectedDamage, 3);
  assert.equal(res.crossHit.oppLifeBefore, 20);
  assert.equal(res.crossHit.oppLifeAfter, 17);
  assert.equal(res.crossHit.oppLifeLoss, 3);
  assert.equal(res.crossHit.postAfterSpace, 1);
  assert.equal(res.crossWhiff.willWhiff, true);
  assert.equal(res.crossWhiff.missReason, 'out_of_range');
  assert.equal(res.crossWhiff.postAfterSpace, 1, 'Cross After: Retreat 3 must preview even on whiff');

  // Focus
  assert.equal(res.focusLethal.hasStochasticVariance, false, 'Draw 1 must not falsely flag Focus as stochastic');
  assert.equal(res.focusLethal.projectedDamage, 4);
  assert.equal(res.focusLethal.isPublicStateLethal, true);
  assert.ok(res.focusLethal.effectsSummary.includes('Draw 1'));

  // Dive Before-move hit
  assert.equal(res.diveMoveHit.willWhiff, false);
  assert.equal(res.diveMoveHit.hitByBeforeMove, true);
  assert.equal(res.diveMoveHit.initialDist, 4);
  assert.equal(res.diveMoveHit.postBeforeDist, 1);
  assert.equal(res.diveMoveHit.postBeforeSpace, 4);
  assert.ok(res.diveMoveHit.beforeMoveSummary && res.diveMoveHit.beforeMoveSummary.includes('Advance 3'));

  // Axl & Nu-13 range bonuses
  assert.equal(res.axlSlash.effectiveStats.printedMaxRange, 1);
  assert.equal(res.axlSlash.effectiveStats.maxRange, 3, 'Axl Low normalsRangeBonus should add +2 max range (1 -> 3)');
  assert.equal(res.axlSlash.willWhiff, false);
  assert.equal(res.nuSweep.effectiveStats.maxRange, 7, 'Nu-13 Exceed attackRangeBonus should add +4 max range');
  assert.equal(res.nuSweep.willWhiff, false);

  // Ken Knee Bash initiating range bonus
  assert.ok(res.kneeStriker.effectiveStats.maxRange > res.kneeDefender.effectiveStats.maxRange);
  assert.equal(res.kneeStriker.willWhiff, false);
  assert.equal(res.kneeDefender.willWhiff, true);

  // Range immunity
  assert.equal(res.blockedByImmunity.willWhiff, true);
  assert.equal(res.blockedByImmunity.missReason, 'range_immune');
  assert.equal(res.blockedByImmunity.projectedDamage, 0);

  // C. Viper Burst Time & Temple Massage
  assert.equal(res.burstNoBoost.willWhiff, true);
  assert.equal(res.burstNoBoost.missReason, 'no_continuous_boost');
  assert.equal(res.burstWithBoost.willWhiff, false);
  assert.ok(res.templeOpt.effectiveStats.pow > res.templeBase.effectiveStats.pow);
  assert.ok(res.templeOpt.projectedDamage > res.templeBase.projectedDamage);

  // Ragna Gauntlet Hades & heal
  assert.equal(res.ragnaCrossMiss.willWhiff, true);
  assert.equal(res.ragnaCrossMiss.missReason, 'self_cannot_hit');
  assert.ok(res.ragnaHealHit.selfLifeDelta > 0, 'Ragna hitting should preview self life gain');

  // Nagoriyuki Exceed cleanup self-damage
  assert.ok(res.nagoNormal.selfLifeDelta < 0, 'Nagoriyuki Exceed normal should preview cleanup self-damage');

  // Iron Tager selfMoveCap & Jin opponentCannotMove
  assert.equal(res.tagerDive.moveCappedByInnate, true);
  assert.equal(res.tagerDive.postBeforeSpace, 3, 'Tager Dive Advance 3 must be capped to 2 (Sp 2 -> Sp 4)');
  assert.equal(res.tagerFrozen.moveBlockedByBoost, true);
  assert.equal(res.tagerFrozen.postBeforeSpace, 1, 'Jin opponentCannotMove boost must block Before movement');

  // Sol Tyrant Rave corner bounce + canceledThisTurn
  assert.equal(res.tyrantCorner.oppPostHitSpace, 8, 'Tyrant Rave should preview CPU pushed to corner Sp 9');
  assert.equal(res.tyrantCorner.projectedDamage, 5, 'Tyrant Rave corner wall-bounce should be 3 base + 2 incomplete push = 5');
  assert.ok(res.tyrantCanceled.projectedDamage > res.tyrantCorner.projectedDamage, 'Sol canceledThisTurn should add POW');

  // Vega free critical + rangeMaxBonus, Ryu Critical Shoryuken
  assert.equal(res.vegaFreeCrit.criticalFree, true);
  assert.equal(res.vegaFreeCrit.criticalActive, true);
  assert.equal(res.vegaFreeCrit.effectiveStats.maxRange, 3, 'Bloody High Claw boost adds +1 max range to Cross (1-2 -> 1-3)');
  assert.equal(res.vegaFreeCrit.willWhiff, false);
  assert.equal(res.shoryuBase.canPreviewCritical, true);
  assert.equal(res.shoryuBase.willWhiff, true);
  assert.equal(res.shoryuCrit.criticalActive, true);
  assert.equal(res.shoryuCrit.willWhiff, false, 'Ryu Shoryuken Critical Before: Close 1 should make Dist 2 connect');

  // Zato-1 Eddie origin
  assert.equal(res.zatoEddie.usesEddie, true);
  assert.equal(res.zatoEddie.attackOrigin, 5);
  assert.equal(res.zatoEddie.postBeforeDist, 1);
  assert.equal(res.zatoEddie.willWhiff, false);

  // Chun-Li Head Stomp side-swap hit
  assert.equal(res.headStomp.willWhiff, false);
  assert.equal(res.headStomp.hitBySideSwap, true);
  assert.ok(res.headStomp.hitboxSpaces.includes(4));
});

test('Differential parity: SimulateStrikePreview matches Engine.resolveStrikeSteps on hit/miss, life loss, and positions', () => {
  const ctx = loadGameSandbox();
  const cases = vm.runInContext(`(() => {
    function checkCase(label, setupFn, cardKey, opts = {}) {
      const e = new Engine(opts.p1Char || 'ryu', opts.p2Char || 'ken', () => 0.5);
      setupFn(e);
      const p1 = e.P('p1'), p2 = e.P('p2');
      const card = { ...SimulateStrikePreview.resolveCardByKey(cardKey), uid: 'diff_p1' };
      const preview = SimulateStrikePreview.run(e.getInformationSet('p1'), card, { isInitiator: true });

      const defCard = {
        key: '_dummy_whiff', name: 'Dummy', type: 'normal',
        range: [8, 8], pow: 0, spd: 0, arm: 0, grd: 0, alwaysMiss: true,
        text: '', boostText: '',
      };
      const oppLifeBefore = p2.life;
      const selfLifeBefore = p1.life;
      const gen = e.resolveStrikeSteps({
        initiator: 'p1',
        attackerSel: { card, fromWildSwing: false },
        defenderSel: { card: defCard, fromWildSwing: false },
        gaugePay: {},
      });
      let step = gen.next();
      while (!step.done) {
        step = gen.next(false);
      }
      const actualOppLoss = oppLifeBefore - p2.life;
      const actualSelfDelta = p1.life - selfLifeBefore;
      return {
        label,
        previewDmg: preview.oppLifeLoss,
        actualOppLoss,
        previewSelfDelta: preview.selfLifeDelta,
        actualSelfDelta,
        previewFinalPos: preview.postAfterSpace != null ? preview.postAfterSpace : preview.postBeforeSpace,
        actualFinalPos: p1.pos,
        previewOppPos: preview.oppPostHitSpace != null ? preview.oppPostHitSpace : preview.oppStartSpace,
        actualOppPos: p2.pos,
      };
    }

    return [
      checkCase('Cross hit + After retreat', (e) => { e.P('p1').pos = 4; e.P('p2').pos = 5; e.P('p2').life = 20; }, 'cross'),
      checkCase('Cross whiff + After retreat', (e) => { e.P('p1').pos = 4; e.P('p2').pos = 8; e.P('p2').life = 20; }, 'cross'),
      checkCase('Focus hit + Draw', (e) => { e.P('p1').pos = 4; e.P('p2').pos = 5; e.P('p2').life = 20; }, 'focus'),
      checkCase('Dive Before Advance hit', (e) => { e.P('p1').pos = 1; e.P('p2').pos = 5; e.P('p2').life = 20; }, 'dive'),
      checkCase('Axl gg_slash range +2', (e) => { e.P('p1').pos = 1; e.P('p2').pos = 4; e.P('p2').life = 20; }, 'gg_slash', { p1Char: 'axl' }),
      checkCase('Sol Tyrant Rave corner wall-bounce', (e) => {
        e.P('p1').pos = 6; e.P('p2').pos = 7; e.P('p2').life = 20;
        e.P('p1').gauge = [SimulateStrikePreview.resolveCardByKey('gg_slash'), SimulateStrikePreview.resolveCardByKey('gg_slash')];
      }, 'tyrant_rave', { p1Char: 'sol' }),
      checkCase('Nagoriyuki Exceed Normal cleanup damage', (e) => {
        e.P('p1').exceeded = true; e.P('p1').pos = 3; e.P('p2').pos = 4; e.P('p1').life = 18; e.P('p2').life = 20;
      }, 'gg_slash', { p1Char: 'nagoriyuki' }),
    ];
  })()`, ctx) as any[];

  for (const c of cases) {
    assert.equal(c.previewDmg, c.actualOppLoss, `${c.label}: projected oppLifeLoss (${c.previewDmg}) must match Engine (${c.actualOppLoss})`);
    assert.equal(c.previewSelfDelta, c.actualSelfDelta, `${c.label}: projected selfLifeDelta (${c.previewSelfDelta}) must match Engine (${c.actualSelfDelta})`);
    assert.equal(c.previewFinalPos, c.actualFinalPos, `${c.label}: projected final self pos (${c.previewFinalPos}) must match Engine (${c.actualFinalPos})`);
    assert.equal(c.previewOppPos, c.actualOppPos, `${c.label}: projected final opp pos (${c.previewOppPos}) must match Engine (${c.actualOppPos})`);
  }
});

test('Strike Preview UI surfaces: Clash Banner, Inspector, Lightbox, Hand chips, and [C] Critical shortcut stay synced', () => {
  const { ctx } = createTrackedSandbox();
  const res = vm.runInContext(`(() => {
    const g = new GameController('ryu', 'ken', 'champion');
    G = g;
    g.confirmMulligan();
    g.toggleRightRail();
    const p1 = g.human(), p2 = g.ai();
    p1.pos = 1; p2.pos = 5; p2.life = 24;
    const dive = { ...SimulateStrikePreview.resolveCardByKey('dive'), uid: 'ui_dive' };
    const shoryu = { ...SimulateStrikePreview.resolveCardByKey('shoryuken_ryu'), uid: 'ui_shoryu' };
    p1.hand = [dive, shoryu];
    p1.gauge = [SimulateStrikePreview.resolveCardByKey('cross')];
    paint();
    const dockHtml = document.getElementById('app').innerHTML;

    // ClashSummaryBanner & Inspector for Dive (Before Advance 3 -> connects at Dist 1, CPU 24->19 (-5))
    const bannerSlot = { innerHTML: '', parentElement: { classList: { add() {}, remove() {} } } };
    const origGetById = document.getElementById;
    document.getElementById = (id) => (id === 'clash-banner-slot' ? bannerSlot : origGetById(id));

    g.onCardHover('ui_dive', false);
    const diveBannerHtml = bannerSlot.innerHTML;
    const diveInspectorHtml = document.getElementById('universal-inspector-slot').innerHTML;

    // Hover Shoryuken at Dist 2 -> misses without Crit, pressing 'c' toggles Critical preview -> connects!
    p1.pos = 2; p2.pos = 4;
    g.onCardHover('ui_shoryu', false);
    const shoryuBeforeCritBanner = bannerSlot.innerHTML;
    const shoryuBeforeCritInsp = document.getElementById('universal-inspector-slot').innerHTML;

    InputManager.handleKeyDown({ key: 'c', preventDefault: () => {} });
    const shoryuAfterCritBanner = bannerSlot.innerHTML;
    const shoryuAfterCritInsp = document.getElementById('universal-inspector-slot').innerHTML;

    // Lightbox live strip for Dive
    p1.pos = 1; p2.pos = 5;
    g.cardModal = { card: dive, rawCard: dive, isEX: false, sourceLabel: 'In Hand' };
    const lightboxHtml = fullCardLightboxHTML(g);
    g.cardModal = null;

    g.onCardHoverEnd();
    document.getElementById = origGetById;

    return {
      dockHtml,
      diveBannerHtml,
      diveInspectorHtml,
      shoryuBeforeCritBanner,
      shoryuBeforeCritInsp,
      shoryuAfterCritBanner,
      shoryuAfterCritInsp,
      lightboxHtml,
    };
  })()`, ctx) as any;

  assert.ok(res.dockHtml.includes('hits after move ✓'), 'Hand tile for Dive at Dist 4 must show "hits after move ✓"');
  assert.ok(res.diveBannerHtml.includes('stat-pill stat-rng'), 'Clash banner renders effective RNG pill');
  assert.ok(res.diveBannerHtml.includes('HIT (AFTER MOVE)'), 'Clash banner flags Dive as HIT (AFTER MOVE)');
  assert.ok(res.diveBannerHtml.includes('Dist 4→1'), 'Clash banner shows distance transition Dist 4→1');
  assert.ok(res.diveBannerHtml.includes('Advance 3'), 'Clash banner shows Before movement summary');
  assert.ok(res.diveBannerHtml.includes('24→19') && res.diveBannerHtml.includes('-5'), 'Clash banner shows CPU life loss 24→19 (-5)');
  assert.equal(res.diveBannerHtml.includes('undefined') || res.diveBannerHtml.includes('NaN'), false);

  assert.ok(res.diveInspectorHtml.includes('Strike Preview'));
  assert.ok(res.diveInspectorHtml.includes('Advance 3'));
  assert.ok(res.diveInspectorHtml.includes('24 → 19') && res.diveInspectorHtml.includes('-5 HP'));
  assert.equal(res.diveInspectorHtml.includes('undefined') || res.diveInspectorHtml.includes('NaN'), false);

  assert.ok(res.shoryuBeforeCritBanner.includes('OUT OF RANGE'));
  assert.ok(res.shoryuBeforeCritBanner.includes('[C] Critical'));
  assert.ok(res.shoryuAfterCritBanner.includes('CRIT') && res.shoryuAfterCritBanner.includes('HIT (AFTER MOVE)'), 'Pressing C toggles Critical preview and updates Clash Banner to hit');
  assert.ok(res.shoryuAfterCritInsp.includes('HIT (AFTER MOVE)'), 'Pressing C syncs Universal Inspector preview');

  assert.ok(res.lightboxHtml.includes('Dist 4→1') && res.lightboxHtml.includes('24→19'));
  assert.equal(res.lightboxHtml.includes('undefined') || res.lightboxHtml.includes('NaN'), false);
});





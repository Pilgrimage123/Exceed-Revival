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

    // Unpayable exact Force 1 when holding only an Ultra
    p1.hand = [ultra];
    const impossible1 = ctrl.engine.pickExactForceCards(p1, 1);

    // Direct-move with only an Ultra to a 1-space target must NOT trap in move_force_select
    ctrl.engine.active = 'p1';
    ctrl.clickBoardSpace(3);
    const modeAfterImpossibleMove = ctrl.mode;

    // During CPU's turn, human card selection and direct board-click must be ignored
    p1.hand = [normal, ultra];
    ctrl.engine.active = 'p2';
    ctrl.selectActionCard('u_norm');
    const selectedDuringCpuTurn = ctrl.selectedActionCardUid;
    ctrl.clickBoardSpace(3);
    const modeDuringCpuTurn = ctrl.mode;

    return {
      hadokenName: hadoken && hadoken.name,
      metsuType: metsu && metsu.type,
      exact2,
      impossible1,
      modeAfterImpossibleMove,
      selectedDuringCpuTurn,
      modeDuringCpuTurn,
    };
  })()`, ctx) as any;

  assert.equal(result.hadokenName, 'Hadoken');
  assert.equal(result.metsuType, 'ultra');
  assert.deepEqual(Array.from(result.exact2), ['u_ultra']);
  assert.equal(result.impossible1, null);
  assert.equal(result.modeAfterImpossibleMove, 'awaiting_action');
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
    paint();
    const appHtml = document.getElementById('app').innerHTML;
    g.openInfo('human');
    const modalHtml = document.getElementById('app').innerHTML;
    g.closeInfo();
    return { appHtml, modalHtml };
  })()`, ctx) as { appHtml: string; modalHtml: string };

  assert.equal(bodyClasses.has('gameplay-active'), true);
  assert.ok(res.appHtml.includes('class="gameplay-stage"'));
  assert.ok(res.appHtml.includes('class="main-stage"'));
  assert.ok(res.appHtml.includes('class="right-rail"'));
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
    paint();
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

test('strike_result renders Trigger Timeline in Stage Prompt Bar and dual revealed cards in Universal Inspector', () => {
  const { ctx } = createTrackedSandbox();
  const res = vm.runInContext(`(() => {
    const g = new GameController('ryu', 'ken', 'champion');
    G = g;
    g.confirmMulligan();
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

  assert.ok(res.html.includes('id="stage-prompt-bar"'));
  assert.ok(res.html.includes('id="trigger-timeline-slot"'));
  assert.ok(res.html.includes('trigger-timeline'));
  assert.ok(res.html.includes('inspector-dual-cards'));
  assert.ok(res.html.includes('Cross'));
  assert.ok(res.html.includes('Sweep'));
  assert.ok(res.moveSetupHtml.includes('stage-prompt-inline'));
  assert.ok(res.moveSetupHtml.includes('Confirm Move'));
});

test('Right Rail tabs switch between Log, Normals, and Coach, auto-switch on Coach actions, and collapse cleanly', () => {
  const { ctx } = createTrackedSandbox();
  const res = vm.runInContext(`(() => {
    const g = new GameController('ryu', 'ken', 'champion');
    G = g;
    g.confirmMulligan();
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
  assert.ok(res.collapsedHtml.includes('right-rail collapsed'));
});



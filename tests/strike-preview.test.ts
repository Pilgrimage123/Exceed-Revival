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

test('strike_result renders Trigger Timeline in Stage Prompt Bar and dual revealed cards in Universal Inspector', () => {
  const { ctx } = createTrackedSandbox();
  const res = vm.runInContext(`(() => {
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

test('Zoomed Headshot Portraits option applies to all 36 headshot-enabled portraits across HUD, tokens, and Fighter Info modals, and all 41 fighters have portraits', () => {
  const { ctx } = createTrackedSandbox();
  const res = vm.runInContext(`(() => {
    const legacyKeys = ['sagat', 'ky', 'sol', 'mbison', 'millia'];
    const allCharKeys = Object.keys(CHARACTERS).sort();
    const photoKeys = Object.keys(FIGHTER_PHOTOS).sort();
    const newKeys = allCharKeys.filter(k => !legacyKeys.includes(k));
    const otherKeys = Object.keys(FIGHTER_PHOTOS).filter(k => !newKeys.includes(k));
    const hsKeys = Object.keys(FIGHTER_HEADSHOTS).sort();
    const validPhotoData = allCharKeys.every(k => {
      const u = FIGHTER_PHOTOS[k];
      return typeof u === 'string' && u.startsWith('data:image/jpeg;base64,') && u.length > 1000;
    });
    const new24Keys = ['ragna', 'jin', 'noel', 'taokaka', 'tager', 'nu13', 'bang', 'hakumen', 'platinum', 'testament', 'leo', 'guile', 'chipp', 'anji', 'may', 'ramlethal', 'nagoriyuki', 'baiken', 'faust', 'ino', 'jacko', 'happychaos', 'zato1', 'goldlewis'];
    const cleanNew24Photos = new24Keys.every(k => {
      const u = FIGHTER_PHOTOS[k];
      return typeof u === 'string' && u.startsWith('data:image/jpeg;base64,') && !u.includes('NaN') && !u.includes('undefined');
    });
    const validHsData = newKeys.every(k => {
      const u = FIGHTER_HEADSHOTS[k];
      return typeof u === 'string' && u.startsWith('data:image/jpeg;base64,') && !u.includes('NaN') && !u.includes('undefined');
    });

    const defaultSetting = UXSettings.get('headshotPortraits');
    const ryuFullSrc = fighterPhotoSrc('ryu');
    const sagatFullSrc = fighterPhotoSrc('sagat');

    // Toggle headshot mode ON
    UXSettings.set('headshotPortraits', true);
    const ryuHsSrc = fighterPhotoSrc('ryu');
    const sagatAfterSrc = fighterPhotoSrc('sagat');

    // Verify in-match HUD, board tokens, and Fighter Info modal reflect headshot for ryu + unchanged full for sagat
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
    paint();
    const matchFullHtml = document.getElementById('app').innerHTML;

    return {
      allCharKeys,
      photoKeys,
      newKeysSorted: [...newKeys].sort(),
      otherKeysCount: otherKeys.length,
      hsKeys,
      validPhotoData,
      cleanNew24Photos,
      validHsData,
      defaultSetting,
      ryuChanged: ryuFullSrc !== ryuHsSrc && ryuHsSrc === FIGHTER_HEADSHOTS.ryu && ryuRevertedSrc === ryuFullSrc,
      sagatUnchanged: sagatFullSrc === sagatAfterSrc && sagatFullSrc === FIGHTER_PHOTOS.sagat,
      matchHsHtml,
      modalHsHtml,
      matchFullHtml,
    };
  })()`, ctx) as any;

  assert.deepEqual([...res.photoKeys], [...res.allCharKeys], 'Every fighter in CHARACTERS (41/41) has a FIGHTER_PHOTOS portrait');
  assert.equal(res.validPhotoData, true, 'All 41 full portraits are valid base64 JPEGs');
  assert.equal(res.cleanNew24Photos, true, 'All 24 newly generated full portraits are valid base64 JPEGs without NaN/undefined');
  assert.deepEqual([...res.hsKeys], [...res.newKeysSorted], 'FIGHTER_HEADSHOTS contains exclusively the 36 headshot-enabled fighters');
  assert.equal(res.otherKeysCount, 5, 'Other 5 legacy photo fighters remain scoped out of headshots');
  assert.equal(res.validHsData, true, 'All 36 headshot JPEGs are valid base64 without NaN/undefined');
  assert.equal(res.defaultSetting, false, 'headshotPortraits defaults to false (Full Portraits)');
  assert.equal(res.ryuChanged, true, 'fighterPhotoSrc switches cleanly between full and headshot and back without stale cache');
  assert.equal(res.sagatUnchanged, true, 'Other photo fighters (Sagat) remain on FIGHTER_PHOTOS when headshot mode is enabled');
  assert.ok(res.matchHsHtml.includes('data-portrait-kind="headshot" data-fighter-key="ryu"'), 'In-match HUD/token renders Ryu as headshot when enabled');
  assert.ok(res.matchHsHtml.includes('data-portrait-kind="full" data-fighter-key="sagat"'), 'In-match HUD/token keeps Sagat as full when enabled');
  assert.ok(res.modalHsHtml.includes('class="modal-silhouette-wrap"><img class="fighter-silhouette fighter-photo accent-you" data-portrait-kind="headshot" data-fighter-key="ryu"'), 'Fighter Info modal renders zoomed headshot when enabled');
  assert.ok(!res.matchFullHtml.includes('data-portrait-kind="headshot"'), 'Disabling headshot mode reverts all in-match portraits back to full');

  const bundledHtml = fs.readFileSync(HTML_PATH, 'utf8');
  assert.ok(bundledHtml.includes('id="set-headshots"'), 'Settings popover includes Zoomed Headshots checkbox');
  assert.ok(bundledHtml.includes('data-portrait-choice="headshot"'), 'Fighter Select & Opponent Select include Zoomed Headshots toggle');
  assert.ok(bundledHtml.includes('FIGHTER_HEADSHOTS'), 'Built bundle includes FIGHTER_HEADSHOTS');
});

test('Arena cleanup: Right Panel defaults collapsed as optional drawer, Last Strike recap is optional, and pauseAfterStrike defaults false', () => {
  const { ctx } = createTrackedSandbox();
  const res = vm.runInContext(`(() => {
    const g = new GameController('ryu', 'ken', 'champion');
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
    const resolvingHtml = document.getElementById('app').innerHTML;
    g.continueAfterStrikeResult();
    const afterContinueHtml = document.getElementById('app').innerHTML;
    g.toggleLastStrikeModal();
    const modalHtml = document.getElementById('app').innerHTML;
    g.closeLastStrikeModal();
    return { defaultCollapsed, defaultPauseAfter, idleHtml, resolvingHtml, afterContinueHtml, modalHtml };
  })()`, ctx) as any;

  assert.equal(res.defaultCollapsed, true);
  assert.equal(res.defaultPauseAfter, false);
  assert.ok(res.idleHtml.includes('class="top-utility-strip"'));
  assert.ok(res.idleHtml.includes('◀ Panel'));
  assert.equal(res.idleHtml.includes('right-rail drawer-open'), false);
  assert.ok(res.resolvingHtml.includes('Resolving Strike…'));
  assert.ok(res.afterContinueHtml.includes('Last Strike'));
  assert.ok(res.modalHtml.includes('Last Strike Recap'));
});




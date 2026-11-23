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


import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dirname, '..');
const HTML_PATH = path.join(ROOT, 'exceed_poc.html');

interface StubElement {
  innerHTML: string;
  textContent: string;
  style: Record<string, string>;
  attrs: Record<string, string>;
  scrollTop: number;
  focused: boolean;
  setAttribute: (k: string, v: string) => void;
  getAttribute: (k: string) => string | null;
  focus: () => void;
  classList: { add: () => void; remove: () => void };
}

function createDomStub() {
  const elements = new Map<string, StubElement>();
  const getOrCreate = (id: string): StubElement => {
    let el = elements.get(id);
    if (!el) {
      el = {
        innerHTML: '',
        textContent: '',
        style: {},
        attrs: {},
        scrollTop: 0,
        focused: false,
        setAttribute(k: string, v: string) {
          this.attrs[k] = String(v);
        },
        getAttribute(k: string) {
          return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null;
        },
        focus() {
          this.focused = true;
        },
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

function loadHowToPlaySandbox() {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const scriptMatches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const code = scriptMatches.map((m) => m[1]).join('\n;\n');
  const dom = createDomStub();

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
  };

  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'exceed_poc.html' });

  const evalExpr = <T = unknown>(expr: string): T =>
    vm.runInContext(expr, sandbox) as T;

  return { dom, evalExpr };
}

test('HowToPlayLogic.evaluateRangeBenchmarks computes exact distance, clamping, and in-range status', () => {
  const { evalExpr } = loadHowToPlaySandbox();

  const r1 = evalExpr<{
    p1Pos: number;
    p2Pos: number;
    distance: number;
    benchmarks: Array<{ key: string; inRange: boolean }>;
  }>('HowToPlayLogic.evaluateRangeBenchmarks(2, 3)');

  assert.equal(r1.distance, 1);
  const byKey1 = Object.fromEntries(r1.benchmarks.map((b) => [b.key, b.inRange]));
  assert.equal(byKey1.grasp, true, 'Grasp (R1) should hit at distance 1');
  assert.equal(byKey1.cross, true, 'Cross (R1-2) should hit at distance 1');
  assert.equal(byKey1.sweep, true, 'Sweep (R1-3) should hit at distance 1');
  assert.equal(byKey1.hadoken_ryu, false, 'Hadoken (R3-6) should miss at distance 1');

  const r4 = evalExpr<{
    distance: number;
    benchmarks: Array<{ key: string; inRange: boolean }>;
  }>('HowToPlayLogic.evaluateRangeBenchmarks(1, 5)');
  assert.equal(r4.distance, 4);
  const byKey4 = Object.fromEntries(r4.benchmarks.map((b) => [b.key, b.inRange]));
  assert.equal(byKey4.grasp, false);
  assert.equal(byKey4.cross, false);
  assert.equal(byKey4.sweep, false);
  assert.equal(byKey4.hadoken_ryu, true, 'Hadoken (R3-6) should hit at distance 4');

  // Clamping out-of-bounds positions into 0..8
  const clamped = evalExpr<{ p1Pos: number; p2Pos: number; distance: number }>(
    'HowToPlayLogic.evaluateRangeBenchmarks(-5, 99)',
  );
  assert.equal(clamped.p1Pos, 0);
  assert.equal(clamped.p2Pos, 8);
  assert.equal(clamped.distance, 8);
});

test('HowToPlayLogic.evaluateClashScenario resolves speed priority, ties, armor, guard, stun, before-move, ignore flags, EX, Critical, and reversal bonuses', () => {
  const { evalExpr } = loadHowToPlaySandbox();

  type ClashResult = {
    startDist: number;
    endDist: number;
    firstId: 'p1' | 'p2';
    speedTie: boolean;
    fighters: {
      p1: { hp: number; hitLanded: boolean; stunned: boolean; destination: string; stats: { spd: number; pow: number; arm: number; grd: number } };
      p2: { hp: number; hitLanded: boolean; stunned: boolean; destination: string; stats: { spd: number; pow: number; arm: number; grd: number } };
    };
    beats: Array<{ phase: string; badge: string }>;
  };

  // 1. Speed & Stun: Cross (S6 P3 R1-2) vs Assault (S5 P4 R1 G0) at R1
  const stunCase = evalExpr<ClashResult>(
    `HowToPlayLogic.evaluateClashScenario({ distance: 1, initiator: 'p1', p1: { cardKey: 'cross' }, p2: { cardKey: 'assault' } })`,
  );
  assert.equal(stunCase.firstId, 'p1');
  assert.equal(stunCase.fighters.p1.hitLanded, true);
  assert.equal(stunCase.fighters.p2.hp, 27);
  assert.equal(stunCase.fighters.p2.stunned, true);
  assert.equal(stunCase.fighters.p2.hitLanded, false);
  assert.equal(stunCase.fighters.p1.destination, 'gauge');
  assert.equal(stunCase.fighters.p2.destination, 'discard');

  // 2. Speed tie won by initiator
  const tieP1 = evalExpr<ClashResult>(
    `HowToPlayLogic.evaluateClashScenario({ distance: 1, initiator: 'p1', p1: { cardKey: 'cross' }, p2: { cardKey: 'cross' } })`,
  );
  assert.equal(tieP1.speedTie, true);
  assert.equal(tieP1.firstId, 'p1');
  assert.equal(tieP1.fighters.p2.stunned, true);

  const tieP2 = evalExpr<ClashResult>(
    `HowToPlayLogic.evaluateClashScenario({ distance: 1, initiator: 'p2', p1: { cardKey: 'cross' }, p2: { cardKey: 'cross' } })`,
  );
  assert.equal(tieP2.speedTie, true);
  assert.equal(tieP2.firstId, 'p2');
  assert.equal(tieP2.fighters.p1.stunned, true);

  // 3. Armor Wall: Cross (P3) vs Focus (A2 G5 P4) at R2 -> deals 1 dmg <= 5 GRD -> Focus counters for 4 dmg
  const wallCase = evalExpr<ClashResult>(
    `HowToPlayLogic.evaluateClashScenario({ distance: 2, initiator: 'p1', p1: { cardKey: 'cross' }, p2: { cardKey: 'focus' } })`,
  );
  assert.equal(wallCase.fighters.p1.hitLanded, true);
  assert.equal(wallCase.fighters.p2.hp, 29);
  assert.equal(wallCase.fighters.p2.stunned, false);
  assert.equal(wallCase.fighters.p2.hitLanded, true);
  assert.equal(wallCase.fighters.p1.hp, 26);

  // 4. Whiff & Punish: Cross (R1-2) vs Sweep (R1-3 P6) at R3
  const whiffCase = evalExpr<ClashResult>(
    `HowToPlayLogic.evaluateClashScenario({ distance: 3, initiator: 'p1', p1: { cardKey: 'cross' }, p2: { cardKey: 'sweep' } })`,
  );
  assert.equal(whiffCase.fighters.p1.hitLanded, false);
  assert.equal(whiffCase.fighters.p1.destination, 'discard');
  assert.equal(whiffCase.fighters.p2.hitLanded, true);
  assert.equal(whiffCase.fighters.p1.hp, 24);
  assert.equal(whiffCase.fighters.p2.destination, 'gauge');

  // 5. Before: Close 2 on Assault starting at R3 closes to R1 and hits!
  const assaultClose = evalExpr<ClashResult>(
    `HowToPlayLogic.evaluateClashScenario({ distance: 3, initiator: 'p1', p1: { cardKey: 'assault' }, p2: { cardKey: 'focus' } })`,
  );
  assert.equal(assaultClose.endDist, 1);
  assert.equal(assaultClose.fighters.p1.hitLanded, true);
  assert.equal(assaultClose.fighters.p2.hp, 28); // POW 4 - ARM 2 = 2 dmg

  // 6. Spike ignores Armor & Guard against Focus at R2 -> full 5 dmg + Stun!
  const spikeWallBreak = evalExpr<ClashResult>(
    `HowToPlayLogic.evaluateClashScenario({ distance: 2, initiator: 'p1', p1: { cardKey: 'spike' }, p2: { cardKey: 'focus' } })`,
  );
  assert.equal(spikeWallBreak.fighters.p1.hitLanded, true);
  assert.equal(spikeWallBreak.fighters.p2.hp, 25);
  assert.equal(spikeWallBreak.fighters.p2.stunned, true);

  // 7. Block alwaysMiss + goesToGaugeEvenOnMiss when not stunned
  const blockCase = evalExpr<ClashResult>(
    `HowToPlayLogic.evaluateClashScenario({ distance: 1, initiator: 'p1', p1: { cardKey: 'cross' }, p2: { cardKey: 'block' } })`,
  );
  assert.equal(blockCase.fighters.p2.hp, 29); // POW 3 - ARM 2 = 1 <= GRD 3
  assert.equal(blockCase.fighters.p2.stunned, false);
  assert.equal(blockCase.fighters.p2.hitLanded, false);
  assert.equal(blockCase.fighters.p2.destination, 'gauge');

  // 8. EX (+1 all) & Critical (+2 SPD on Hadoken) & Defending Metsu Shoryuken (+3 SPD -> SPD 8 beats Grasp SPD 7)
  const critExHadoken = evalExpr<ClashResult>(
    `HowToPlayLogic.evaluateClashScenario({ distance: 4, initiator: 'p1', p1: { cardKey: 'hadoken_ryu', ex: true, crit: true }, p2: { cardKey: 'hadoken_ryu' } })`,
  );
  assert.equal(critExHadoken.fighters.p1.stats.spd, 7); // 4 base + 1 EX + 2 Crit
  assert.equal(critExHadoken.fighters.p1.stats.pow, 5); // 4 base + 1 EX
  assert.equal(critExHadoken.fighters.p2.stunned, true);

  const reversalCase = evalExpr<ClashResult>(
    `HowToPlayLogic.evaluateClashScenario({ distance: 1, initiator: 'p1', p1: { cardKey: 'grasp' }, p2: { cardKey: 'metsu_shoryuken' } })`,
  );
  assert.equal(reversalCase.fighters.p2.stats.spd, 8); // 5 base + 3 defending
  assert.equal(reversalCase.firstId, 'p2');
  assert.equal(reversalCase.fighters.p1.hp, 23);
  assert.equal(reversalCase.fighters.p1.stunned, true);
});

test('HowToPlayLogic.filterGlossaryEntries matches queries, shorthand, and categories accurately', () => {
  const { evalExpr } = loadHowToPlaySandbox();

  const total = evalExpr<number>('HowToPlayLogic.GLOSSARY_ENTRIES.length');
  assert.ok(total >= 45, `Expected comprehensive glossary (>=45 entries), got ${total}`);

  const stunMatches = evalExpr<Array<{ term: string }>>(
    `HowToPlayLogic.filterGlossaryEntries(HowToPlayLogic.GLOSSARY_ENTRIES, { query: 'STUN', category: 'All' })`,
  );
  assert.ok(stunMatches.some((e) => e.term === 'Stun'));

  const shorthand732 = evalExpr<Array<{ term: string }>>(
    `HowToPlayLogic.filterGlossaryEntries(HowToPlayLogic.GLOSSARY_ENTRIES, { query: '732', category: 'Shorthand' })`,
  );
  assert.equal(shorthand732.length, 1);
  assert.equal(shorthand732[0].term, '[0\u20137]');

  const empty = evalExpr<Array<{ term: string }>>(
    `HowToPlayLogic.filterGlossaryEntries(HowToPlayLogic.GLOSSARY_ENTRIES, { query: 'nonexistent_xyz_term', category: 'All' })`,
  );
  assert.equal(empty.length, 0);
});

test('HowToPlayUI lifecycle renders all 5 sections cleanly with zero undefined/NaN and supports legacy tab names', () => {
  const { dom, evalExpr } = loadHowToPlaySandbox();

  evalExpr('openHowToPlay()');
  assert.equal(evalExpr<boolean>('isHowToPlayOpen()'), true);
  assert.equal(dom.document.getElementById('howToPlayOverlay').style.display, 'flex');
  assert.equal(dom.document.getElementById('howToPlayOverlay').getAttribute('aria-hidden'), 'false');

  const tabsToVerify = ['basics', 'cards', 'clash', 'icons', 'glossary', 'intro', 'keywords'];
  for (const tab of tabsToVerify) {
    evalExpr(`showHowToPlayTab('${tab}')`);
    const html = dom.document.getElementById('howToPlayBox').innerHTML;
    assert.ok(html.length > 500, `Tab '${tab}' rendered unexpectedly short markup`);
    assert.equal(/\bundefined\b/.test(html), false, `Tab '${tab}' rendered literal 'undefined'`);
    assert.equal(/\bNaN\b/.test(html), false, `Tab '${tab}' rendered literal 'NaN'`);
  }

  // Test in-place glossary search update
  evalExpr(`showHowToPlayTab('glossary')`);
  evalExpr(`HowToPlayUI.setGlossaryQuery('footsies')`);
  const resultsHtml = dom.document.getElementById('htp-glossary-results').innerHTML;
  assert.ok(resultsHtml.includes('Footsies'), 'Expected Footsies in filtered glossary results');
  assert.equal(dom.document.getElementById('htp-glossary-reset').style.display, 'inline-flex');

  evalExpr('closeHowToPlay()');
  assert.equal(evalExpr<boolean>('isHowToPlayOpen()'), false);
  assert.equal(dom.document.getElementById('howToPlayOverlay').style.display, 'none');
  assert.equal(dom.document.getElementById('howToPlayOverlay').getAttribute('aria-hidden'), 'true');
});

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
    Uint8Array,
    Uint8ClampedArray,
    Int32Array,
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

test('FIGHTER_STANDEES registers Ryu, Ken, and C. Viper and supports both left and right facing', () => {
  const ctx = loadGameSandbox();
  const res = vm.runInContext(`(() => {
    const ryu = getStandeeSpec('ryu');
    const ken = getStandeeSpec('ken');
    const cv = getStandeeSpec('cviper');
    const cammy = getStandeeSpec('cammy');
    return {
      hasRyu: !!ryu,
      ryuSrc: ryu && ryu.src,
      ryuFacings: ryu && ryu.supportedFacings,
      hasKen: !!ken,
      kenSrc: ken && ken.src,
      kenFacings: ken && ken.supportedFacings,
      hasCviper: !!cv,
      hasCammy: !!cammy,
      ryuRight: resolveStandeeFacing('ryu', 'facing-right'),
      ryuLeft: resolveStandeeFacing('ryu', 'facing-left'),
      kenRight: resolveStandeeFacing('ken', 'right'),
      kenLeft: resolveStandeeFacing('ken', 'left'),
      flipRR: shouldFlipStandee('right', 'facing-right'),
      flipRL: shouldFlipStandee('right', 'facing-left'),
      flipLR: shouldFlipStandee('left', 'facing-right'),
      flipLL: shouldFlipStandee('left', 'facing-left'),
    };
  })()`, ctx);

  assert.equal(res.hasRyu, true);
  assert.equal(res.ryuSrc, '/assets/aistudio/ryu_standee.jpg');
  assert.deepEqual(Array.from(res.ryuFacings), ['left', 'right']);
  assert.equal(res.hasKen, true);
  assert.equal(res.kenSrc, '/assets/aistudio/ken_standee.jpg');
  assert.deepEqual(Array.from(res.kenFacings), ['left', 'right']);
  assert.equal(res.hasCviper, true);
  assert.equal(res.hasCammy, false);

  assert.equal(res.ryuRight.facing, 'right');
  assert.equal(res.ryuRight.flipped, false);
  assert.equal(res.ryuLeft.facing, 'left');
  assert.equal(res.ryuLeft.flipped, true);
  assert.equal(res.kenRight.facing, 'right');
  assert.equal(res.kenRight.flipped, false);
  assert.equal(res.kenLeft.facing, 'left');
  assert.equal(res.kenLeft.flipped, true);

  assert.equal(res.flipRR, false);
  assert.equal(res.flipRL, true);
  assert.equal(res.flipLR, true);
  assert.equal(res.flipLL, false);
});

test('matteStandeeRgba clears outer backdrop and enclosed holes while preserving off-white gi and decontaminating both warm fire and cool cyan ki fringes', () => {
  const ctx = loadGameSandbox();
  const res = vm.runInContext(`(() => {
    const w = 24, h = 24;
    const d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 4;
        const checker = ((x + y) & 1) === 0 ? 253 : 249;
        d[p] = checker; d[p+1] = checker; d[p+2] = checker; d[p+3] = 255;
      }
    }
    // Dark outline box 4..19
    for (let y = 4; y <= 19; y++) for (let x = 4; x <= 19; x++) {
      const p = (y * w + x) * 4;
      d[p] = 28; d[p+1] = 30; d[p+2] = 48; d[p+3] = 255;
    }
    // Enclosed pure-white leg-gap hole 9..14 (36px, avgMin=252, avgSat=0)
    for (let y = 9; y <= 14; y++) for (let x = 9; x <= 14; x++) {
      const p = (y * w + x) * 4;
      d[p] = 252; d[p+1] = 252; d[p+2] = 252; d[p+3] = 255;
    }
    // Ryu off-white warm gi patch inside dark outline at 6..7, 6..7 (warm cream: sat=10, min=238)
    for (let y = 6; y <= 7; y++) for (let x = 6; x <= 7; x++) {
      const p = (y * w + x) * 4;
      d[p] = 248; d[p+1] = 244; d[p+2] = 238; d[p+3] = 255;
    }
    // Warm fire fringe pixel (Ken / C. Viper) at (3, 8)
    const fpWarm = (8 * w + 3) * 4;
    d[fpWarm] = 252; d[fpWarm+1] = 185; d[fpWarm+2] = 170; d[fpWarm+3] = 255;
    // Cool cyan ki fringe pixel (Ryu Hadoken) at (3, 12)
    const fpCool = (12 * w + 3) * 4;
    d[fpCool] = 170; d[fpCool+1] = 232; d[fpCool+2] = 252; d[fpCool+3] = 255;

    const r = matteStandeeRgba(d, w, h);
    const alphaAt = (x, y) => d[(y * w + x) * 4 + 3];
    const rgbaAt = (x, y) => {
      const p = (y * w + x) * 4;
      return [d[p], d[p+1], d[p+2], d[p+3]];
    };
    return {
      r,
      cornerAlpha: alphaAt(0, 0),
      holeAlpha: alphaAt(11, 11),
      giAlpha: alphaAt(6, 6),
      warmRgba: rgbaAt(3, 8),
      coolRgba: rgbaAt(3, 12),
    };
  })()`, ctx);

  assert.equal(res.r.matted, true);
  assert.equal(res.cornerAlpha, 0);
  assert.equal(res.holeAlpha, 0);
  assert.equal(res.giAlpha, 255, 'Ryu warm off-white gi interior must remain opaque');
  assert.ok(res.warmRgba[3] > 20 && res.warmRgba[3] < 240);
  assert.ok(res.warmRgba[0] > res.warmRgba[2] + 80, 'Warm fire fringe decontaminated');
  assert.ok(res.coolRgba[3] > 20 && res.coolRgba[3] < 240);
  assert.ok(res.coolRgba[2] > res.coolRgba[0] + 80, 'Cool cyan ki fringe decontaminated');
});

test('boardHTML renders Ryu and Ken standees in both right-facing and left-facing orientations on normal and crossed-up spaces', () => {
  const ctx = loadGameSandbox();
  const res = vm.runInContext(`(() => {
    G = new GameController('ryu', 'ken', 'student', {});
    const engine = G.engine;
    const p1 = engine.P('p1');
    const p2 = engine.P('p2');
    // Standard opening: Ryu (p1) on left facing right, Ken (p2) on right facing left
    p1.pos = 2;
    p2.pos = 6;
    const htmlOpening = boardHTML(engine);

    // Cross-up: Ryu (p1) on right facing left, Ken (p2) on left facing right
    p1.pos = 7;
    p2.pos = 3;
    const htmlCrossed = boardHTML(engine);

    return { htmlOpening, htmlCrossed };
  })()`, ctx);

  // Opening: Ryu faces right (unflipped), Ken faces left (flipped)
  assert.match(res.htmlOpening, /data-pid="p1" data-char="ryu" data-facing="right"/);
  assert.match(res.htmlOpening, /data-pid="p2" data-char="ken" data-facing="left"/);
  assert.match(res.htmlOpening, /class="standee-sprite" data-native-facing="right" data-facing="right"/);
  assert.match(res.htmlOpening, /class="standee-sprite standee-flipped" data-native-facing="right" data-facing="left"/);

  // Crossed-up: Ryu faces left (flipped), Ken faces right (unflipped)
  assert.match(res.htmlCrossed, /data-pid="p1" data-char="ryu" data-facing="left"/);
  assert.match(res.htmlCrossed, /data-pid="p2" data-char="ken" data-facing="right"/);
});

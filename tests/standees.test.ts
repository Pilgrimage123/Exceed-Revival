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

test('FIGHTER_STANDEES registers Ryu, Ken, C. Viper, Cammy, and Zangief and supports both left and right facing', () => {
  const ctx = loadGameSandbox();
  const res = vm.runInContext(`(() => {
    const ryu = getStandeeSpec('ryu');
    const ken = getStandeeSpec('ken');
    const cv = getStandeeSpec('cviper');
    const cammy = getStandeeSpec('cammy');
    const zangief = getStandeeSpec('zangief');
    return {
      hasRyu: !!ryu,
      ryuSrc: ryu && ryu.src,
      ryuFacings: ryu && ryu.supportedFacings,
      hasKen: !!ken,
      kenSrc: ken && ken.src,
      kenFacings: ken && ken.supportedFacings,
      hasCviper: !!cv,
      hasCammy: !!cammy,
      cammySrc: cammy && cammy.src,
      cammyFacings: cammy && cammy.supportedFacings,
      hasZangief: !!zangief,
      zangiefSrc: zangief && zangief.src,
      zangiefFacings: zangief && zangief.supportedFacings,
      zangiefScale: zangief && zangief.heightScale,
      ryuRight: resolveStandeeFacing('ryu', 'facing-right'),
      ryuLeft: resolveStandeeFacing('ryu', 'facing-left'),
      kenRight: resolveStandeeFacing('ken', 'right'),
      kenLeft: resolveStandeeFacing('ken', 'left'),
      cammyRight: resolveStandeeFacing('cammy', 'right'),
      cammyLeft: resolveStandeeFacing('cammy', 'left'),
      zangiefRight: resolveStandeeFacing('zangief', 'right'),
      zangiefLeft: resolveStandeeFacing('zangief', 'left'),
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
  assert.equal(res.hasCammy, true);
  assert.equal(res.cammySrc, '/assets/aistudio/cammy_standee.jpg');
  assert.deepEqual(Array.from(res.cammyFacings), ['left', 'right']);
  assert.equal(res.hasZangief, true);
  assert.equal(res.zangiefSrc, '/assets/aistudio/zangief_standee.jpg');
  assert.deepEqual(Array.from(res.zangiefFacings), ['left', 'right']);
  assert.ok(res.zangiefScale > 1.2, 'Zangief standee towers over standard fighters');

  assert.equal(res.ryuRight.facing, 'right');
  assert.equal(res.ryuRight.flipped, false);
  assert.equal(res.ryuLeft.facing, 'left');
  assert.equal(res.ryuLeft.flipped, true);
  assert.equal(res.kenRight.facing, 'right');
  assert.equal(res.kenRight.flipped, false);
  assert.equal(res.kenLeft.facing, 'left');
  assert.equal(res.kenLeft.flipped, true);
  assert.equal(res.cammyRight.facing, 'right');
  assert.equal(res.cammyRight.flipped, false);
  assert.equal(res.cammyLeft.facing, 'left');
  assert.equal(res.cammyLeft.flipped, true);
  assert.equal(res.zangiefRight.facing, 'right');
  assert.equal(res.zangiefRight.flipped, false);
  assert.equal(res.zangiefLeft.facing, 'left');
  assert.equal(res.zangiefLeft.flipped, true);

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

test('calibrateStandeeRgba extracts pelvis-centroid anchorX within [0.30, 0.70] and preserves co-adjustment invariant', () => {
  const ctx = loadGameSandbox();
  const res = vm.runInContext(`(() => {
    const w = 100, h = 100;
    const d = new Uint8ClampedArray(w * h * 4);
    // Pelvis/torso block shifted right: x in [55..69], y in [35..65] -> centroid ~ 62 (0.62)
    for (let y = 35; y <= 65; y++) {
      for (let x = 55; x <= 69; x++) {
        const p = (y * w + x) * 4;
        d[p] = 200; d[p+1] = 200; d[p+2] = 200; d[p+3] = 255;
      }
    }
    // Extended front foot at y = 96, x in [20..80] (should not pull pelvis anchorX out of [0.30, 0.70])
    for (let x = 20; x <= 80; x++) {
      const p = (96 * w + x) * 4;
      d[p] = 100; d[p+1] = 100; d[p+2] = 100; d[p+3] = 255;
    }
    const calRight = calibrateStandeeRgba(d, w, h);

    // Centered dummy: x in [45..54], y in [35..65] -> centroid ~ 49.5
    const d2 = new Uint8ClampedArray(w * h * 4);
    for (let y = 35; y <= 65; y++) {
      for (let x = 45; x <= 54; x++) {
        const p = (y * w + x) * 4;
        d2[p] = 200; d2[p+1] = 200; d2[p+2] = 200; d2[p+3] = 255;
      }
    }
    const calCenter = calibrateStandeeRgba(d2, w, h);
    return { calRight, calCenter };
  })()`, ctx);

  assert.ok(res.calRight.anchorXRatio >= 0.30 && res.calRight.anchorXRatio <= 0.70);
  assert.ok(res.calRight.anchorXRatio > 0.58, 'pelvis centroid tracks torso shift');
  assert.ok(Math.abs(res.calRight.footBottomRatio - 0.97) < 0.02);
  // Co-adjustment invariant: anchorX + muzzleRel.dx stays constant relative to frame center
  const sumRight = res.calRight.anchorXRatio + res.calRight.muzzleRel.dx;
  const sumCenter = res.calCenter.anchorXRatio + res.calCenter.muzzleRel.dx;
  assert.ok(Math.abs(sumRight - sumCenter) < 1e-6);
});

test('StandeeRigMath enforces solidity, crisp-cut hitstop safety, 2.5D flip bounds, pinned feet, and paused springs', () => {
  const ctx = loadGameSandbox();
  const res = vm.runInContext(`(() => {
    const soliditySamples = [0, 0.2, 0.5, 0.55, 0.75, 1.0].map(t => StandeeRigMath.computeSolidityAlphas(t));
    const crispHitstop = StandeeRigMath.computeFrameTransitionState(0, 0);

    const flipSamples = [];
    for (let i = 0; i <= 20; i++) {
      flipSamples.push(StandeeRigMath.stepHorizontalFlip(i / 20, 1, -1, 18));
    }

    const hopBefore = StandeeRigMath.hopYPx(0.15, 20);
    const hopMid = StandeeRigMath.hopYPx(0.5, 20);
    const hopAfter = StandeeRigMath.hopYPx(0.85, 20);

    const shearFeet = StandeeRigMath.stepHorizontalVelocityShear(900, 0);
    const shearHead = StandeeRigMath.stepHorizontalVelocityShear(900, 1);

    // Four-knot spine keeps feet pinned even if knot[0] was mutated
    const knots = StandeeRigMath.createFourKnotSpine();
    knots[0].dx = 99; knots[0].dy = 99; knots[0].rotRad = 1; knots[0].scaleX = 2;
    knots[2].dx = 16; knots[2].rotRad = 0.15;
    const feetEval = StandeeRigMath.evalFourKnotSpine(knots, 0);
    const waistEval = StandeeRigMath.evalFourKnotSpine(knots, 0.67);

    // Symplectic spring pauses under hitstopRemaining > 0, advances when 0
    const sp = StandeeRigMath.createSpringState();
    StandeeRigMath.applySpringImpulse(sp, 1.22, 0.82, 3.5, -3.5);
    const frozenBefore = { ...sp };
    StandeeRigMath.stepSpring(sp, 0.016, 340, 18, 0.12);
    const frozenAfter = { ...sp };
    StandeeRigMath.stepSpring(sp, 0.016, 340, 18, 0);
    const activeAfter = { ...sp };

    return {
      soliditySamples,
      crispHitstop,
      flipSamples,
      hopBefore,
      hopMid,
      hopAfter,
      shearFeet,
      shearHead,
      feetEval,
      waistEval,
      frozenBefore,
      frozenAfter,
      activeAfter,
    };
  })()`, ctx);

  for (const s of res.soliditySamples) {
    assert.ok(s.alphaA + s.alphaB >= 1.0 - 1e-9, 'C2 solidity blend never dips below 1.0 opacity sum');
  }
  assert.equal(res.crispHitstop.frameBlendAlpha, 1.0);
  assert.equal(Number.isNaN(res.crispHitstop.frameBlendAlpha), false);

  for (const f of res.flipSamples) {
    assert.ok(Math.abs(f.scaleX) >= 0.04 - 1e-9, '2.5D flip never collapses to singular 0 matrix');
    assert.ok(f.hopYPx <= 0, '2.5D flip arc never sinks below arena floor');
  }

  assert.equal(res.hopBefore, 0);
  assert.ok(res.hopMid < -19);
  assert.equal(res.hopAfter, 0);

  assert.equal(res.shearFeet, 0);
  assert.ok(Math.abs(res.shearHead) <= 22 && res.shearHead > 0);

  assert.equal(res.feetEval.dx, 0);
  assert.equal(res.feetEval.dy, 0);
  assert.equal(res.feetEval.rotRad, 0);
  assert.equal(res.feetEval.scaleX, 1);
  assert.ok(Math.abs(res.waistEval.dx - 16) < 1e-6);

  assert.equal(res.frozenAfter.scaleX, res.frozenBefore.scaleX, 'Spring must freeze while hitstopRemaining > 0');
  assert.equal(res.frozenAfter.scaleY, res.frozenBefore.scaleY, 'Spring must freeze while hitstopRemaining > 0');
  assert.notEqual(res.activeAfter.scaleX, res.frozenAfter.scaleX, 'Spring integrates once hitstop expires');
});

test('resolveStandeeChoreography distinguishes Ryu vs Ken across Cross backdash, Sweep, Hadoken, Shoryuken, Tatsumaki, and reducedHitStop', () => {
  const ctx = loadGameSandbox();
  const res = vm.runInContext(`(() => {
    return {
      ryuCrossAfter: resolveStandeeChoreography('ryu', 'cross', 'after', {}),
      kenCrossAfter: resolveStandeeChoreography('ken', 'cross', 'after', {}),
      kenCrossReduced: resolveStandeeChoreography('ken', 'cross', 'after', { reducedHitStop: true }),
      ryuSweep: resolveStandeeChoreography('ryu', 'sweep', 'hit_attack', { damageDealt: 6 }),
      kenSweep: resolveStandeeChoreography('ken', 'sweep', 'hit_attack', { damageDealt: 6 }),
      ryuHadoken: resolveStandeeChoreography('ryu', 'hadoken_ryu', 'hit_attack', { damageDealt: 4 }),
      kenHadoken: resolveStandeeChoreography('ken', 'hadoken_ken', 'hit_attack', { damageDealt: 4 }),
      ryuMetsu: resolveStandeeChoreography('ryu', 'metsu_hadoken', 'hit_attack', { damageDealt: 7 }),
      kenShinryu: resolveStandeeChoreography('ken', 'shinryuken', 'hit_attack', { damageDealt: 7 }),
      ryuTatsu: resolveStandeeChoreography('ryu', 'tatsumaki_ryu', 'before', { sideSwapped: true }),
      kenGuren: resolveStandeeChoreography('ken', 'guren_senpukyaku', 'hit_attack', { damageDealt: 8 }),
      defGuard: resolveStandeeChoreography('ryu', 'block', 'hit_defend', { damageDealt: 0 }),
      defGrit: resolveStandeeChoreography('ryu', 'cross', 'hit_defend', { damageDealt: 4, guardBroken: false, effectiveArmor: 2 }),
      defClean: resolveStandeeChoreography('ken', 'grasp', 'hit_defend', { damageDealt: 6, guardBroken: true }),
      stunned: resolveStandeeChoreography('ken', 'sweep', 'stunned', {}),
    };
  })()`, ctx);

  // Cross After: Retreat 3 — Ryu disciplined 10px hop vs Ken -2pi 34px backflip
  assert.equal(res.ryuCrossAfter.poseKind, 'backdash_hop');
  assert.equal(res.ryuCrossAfter.hopHeight, 10);
  assert.equal(res.ryuCrossAfter.wholeSpinRad, 0);

  assert.equal(res.kenCrossAfter.poseKind, 'backflip');
  assert.equal(res.kenCrossAfter.hopHeight, 34);
  assert.ok(Math.abs(res.kenCrossAfter.wholeSpinRad + Math.PI * 2) < 1e-6);

  // Accessibility: reducedHitStop suppresses -2pi backflip spin
  assert.equal(res.kenCrossReduced.wholeSpinRad, 0);

  // Sweep: Ryu planted vs Ken lunging flare + 360 spin
  assert.equal(res.ryuSweep.lungePx, 28);
  assert.equal(res.ryuSweep.wholeSpinRad, 0);
  assert.equal(res.kenSweep.lungePx, 42);
  assert.ok(res.kenSweep.wholeSpinRad > 6);

  // Hadoken / Metsu Hadoken projectiles
  assert.equal(res.ryuHadoken.projectile.style, 'cyan_hadoken');
  assert.equal(res.kenHadoken.projectile.style, 'fire_hadoken');
  assert.equal(res.ryuMetsu.projectile.style, 'metsu_denjin');

  // Shinryuken & Tatsumaki
  assert.ok(res.kenShinryu.hopHeight >= 70);
  assert.equal(res.kenShinryu.vfx.type, 'dragon_uppercut');
  assert.ok(res.ryuTatsu.wholeSpinRad > 6);
  assert.equal(res.kenGuren.vfx.type, 'cyclone');

  // 3-Way Hit Defend: Armor Gold Brace vs Super-Armor Grit (Track 2) vs Heavy Crumple Reel (Stun)
  assert.equal(res.defGuard.poseKind, 'guard_brace');
  assert.equal(res.defGuard.flashColorHex, '#ffd166');
  assert.equal(res.defGuard.lungePx, 0);
  assert.equal(res.defGrit.poseKind, 'super_armor_grit');
  assert.equal(res.defGrit.track, 2);
  assert.equal(res.defClean.poseKind, 'heavy_crumple_reel');
  assert.ok(res.defClean.flashWhiteMs >= 65);
  assert.ok(res.stunned.shudderHz >= 24);
});

test('Dynamic Lunge-and-Return, 3-Clip Whiff Recovery, Kinetic Neutral Turns, and Exceed Mode Stance/Awakening', () => {
  const ctx = loadGameSandbox();
  const res = vm.runInContext(`(() => {
    const lungeStart = StandeeRigMath.computeDynamicLungeOffset(0, 28, 220, false, false);
    const lungeActive = StandeeRigMath.computeDynamicLungeOffset(0.30, 28, 220, false, false);
    const lungeEnd = StandeeRigMath.computeDynamicLungeOffset(1.0, 28, 220, false, false);
    const reachR1 = StandeeRigMath.computeIkReachPx(85, 1, 36);
    const reachR3 = StandeeRigMath.computeIkReachPx(260, 3, 36);
    const clipHit = StandeeRigMath.computeClipEnvelope(0.50, false);
    const clipWhiff = StandeeRigMath.computeClipEnvelope(0.55, true);

    const ryuPrepare = resolveStandeeChoreography('ryu', null, 'prepare', {});
    const kenBoost = resolveStandeeChoreography('ken', 'focus', 'boost', {});
    const wildReveal = resolveStandeeChoreography('ryu', 'sweep', 'reveal', { isFaster: true, fromWildSwing: true });
    const ryuIdleNormal = resolveStandeeChoreography('ryu', null, 'idle', { exceeded: false });
    const ryuIdleExceed = resolveStandeeChoreography('ryu', null, 'idle', { exceeded: true });
    const kenExceedAct = resolveStandeeChoreography('ken', null, 'exceed', {});

    return {
      lungeStart,
      lungeActive,
      lungeEnd,
      reachR1,
      reachR3,
      clipHit,
      clipWhiff,
      ryuPrepare,
      kenBoost,
      wildReveal,
      ryuIdleNormal,
      ryuIdleExceed,
      kenExceedAct,
    };
  })()`, ctx);

  assert.equal(res.lungeStart, 0);
  assert.ok(res.lungeActive > 110, 'Dynamic lunge bridges pixel gap to Range 2-3 target during active window');
  assert.ok(Math.abs(res.lungeEnd) < 1e-6, 'Dynamic lunge returns smoothly to origin space at end of recovery');
  assert.ok(res.reachR3 > res.reachR1 * 2, 'IK reach scales up at Range 3 compared to Range 1');

  assert.equal(res.clipHit.clip, 'active');
  assert.equal(res.clipHit.poseWeight, 1.0);
  assert.equal(res.clipWhiff.clip, 'whiff_recovery');
  assert.ok(Math.abs(res.clipWhiff.stumbleWeight) > 0, 'Whiff recovery introduces off-balance stumble oscillation');

  assert.equal(res.ryuPrepare.poseKind, 'ryu_headband_focus');
  assert.equal(res.kenBoost.poseKind, 'ken_flame_install');
  assert.equal(res.wildReveal.durationSec, 0.40);
  assert.equal(res.wildReveal.wildSwingHazard, true);

  assert.equal(res.ryuIdleNormal.poseKind, 'idle');
  assert.equal(res.ryuIdleExceed.poseKind, 'exceed_idle');
  assert.ok(res.ryuIdleExceed.idleFreqHz > res.ryuIdleNormal.idleFreqHz, 'Exceeded idle breathes faster and harder');
  assert.ok(res.ryuIdleExceed.pelvis.dy > res.ryuIdleNormal.pelvis.dy, 'Exceeded idle crouches lower and tenser');
  assert.equal(res.kenExceedAct.battleCry, 'SHORYU FLAME!!');
  assert.ok(res.kenExceedAct.durationSec >= 1.5);
});

test('resolveStandeeChoreography implements Cammy high-speed cross-up assassin kit (with red-boot accents) and Zangief unstoppable grappler kit', () => {
  const ctx = loadGameSandbox();
  const res = vm.runInContext(`(() => {
    return {
      // Cammy kit
      cammyCrossAfter: resolveStandeeChoreography('cammy', 'cross', 'after', {}),
      cammyCannonSpike: resolveStandeeChoreography('cammy', 'cannon_spike', 'hit_attack', { damageDealt: 5 }),
      cammyDiveKickBefore: resolveStandeeChoreography('cammy', 'dive_kick', 'before', { sideSwapped: true }),
      cammyDiveKickHit: resolveStandeeChoreography('cammy', 'dive_kick', 'hit_attack', { damageDealt: 4 }),
      cammySpiralBeforeNorm: resolveStandeeChoreography('cammy', 'spiral_arrow', 'before', { sideSwapped: true, criticalPaid: false }),
      cammySpiralBeforeCrit: resolveStandeeChoreography('cammy', 'spiral_arrow', 'before', { sideSwapped: true, criticalPaid: true }),
      cammySpiralHitCrit: resolveStandeeChoreography('cammy', 'spiral_arrow', 'hit_attack', { damageDealt: 5, criticalPaid: true }),
      cammyCannonballBefore: resolveStandeeChoreography('cammy', 'cannonball', 'before', { sideSwapped: true, criticalPaid: true }),
      cammyCannonballHitCrit: resolveStandeeChoreography('cammy', 'cannonball', 'hit_attack', { damageDealt: 5, criticalPaid: true }),
      cammyRazorsBefore: resolveStandeeChoreography('cammy', 'razors_edge_slicer', 'before', {}),
      cammyRazorsHit: resolveStandeeChoreography('cammy', 'razors_edge_slicer', 'hit_attack', { damageDealt: 6 }),
      cammyGyroBefore: resolveStandeeChoreography('cammy', 'gyro_drive_smasher', 'before', { sideSwapped: true }),
      cammyGyroHit: resolveStandeeChoreography('cammy', 'gyro_drive_smasher', 'hit_attack', { damageDealt: 9 }),
      cammyCqcHit: resolveStandeeChoreography('cammy', 'cqc', 'hit_attack', { damageDealt: 6 }),
      cammyExceed: resolveStandeeChoreography('cammy', null, 'exceed', {}),

      // Zangief kit
      zangiefAtomicHit: resolveStandeeChoreography('zangief', 'atomic_suplex', 'hit_attack', { damageDealt: 5 }),
      zangiefAtomicAfterCrit: resolveStandeeChoreography('zangief', 'atomic_suplex', 'after', { criticalPaid: true }),
      zangiefBanishingHitCrit: resolveStandeeChoreography('zangief', 'banishing_flat', 'hit_attack', { damageDealt: 4, criticalPaid: true }),
      zangiefBanishingAfter: resolveStandeeChoreography('zangief', 'banishing_flat', 'after', {}),
      zangiefLariatHit: resolveStandeeChoreography('zangief', 'double_lariat', 'hit_attack', { damageDealt: 3 }),
      zangiefPowerBombBeforeCrit: resolveStandeeChoreography('zangief', 'flying_power_bomb', 'before', { criticalPaid: true }),
      zangiefPowerBombHit: resolveStandeeChoreography('zangief', 'flying_power_bomb', 'hit_attack', { damageDealt: 6 }),
      zangiefSpdHit: resolveStandeeChoreography('zangief', 'spinning_piledriver', 'hit_attack', { damageDealt: 7 }),
      zangiefBlizzardBefore: resolveStandeeChoreography('zangief', 'siberian_blizzard', 'before', {}),
      zangiefBlizzardHit: resolveStandeeChoreography('zangief', 'siberian_blizzard', 'hit_attack', { damageDealt: 6 }),
      zangiefBusterHit: resolveStandeeChoreography('zangief', 'ultimate_atomic_buster', 'hit_attack', { damageDealt: 11 }),
      zangiefArmorGrit: resolveStandeeChoreography('zangief', 'double_lariat', 'hit_defend', { damageDealt: 3, guardBroken: false, effectiveArmor: 2 }),
      zangiefExceed: resolveStandeeChoreography('zangief', null, 'exceed', {}),
    };
  })()`, ctx);

  // Cammy: Hooligan backflip on Cross After, Cannon Spike emerald + red-boot uppercut, Dive Kick side-swap evasion
  assert.equal(res.cammyCrossAfter.poseKind, 'cammy_hooligan_backflip');
  assert.ok(res.cammyCrossAfter.hopHeight >= 38);
  assert.equal(res.cammyCannonSpike.poseKind, 'cannon_spike_kick');
  assert.equal(res.cammyCannonSpike.vfx.type, 'dragon_uppercut');
  assert.equal(res.cammyCannonSpike.vfx.accent, '#ff2a4b', 'Cannon Spike highlights Cammy iconic red boots');
  assert.equal(res.cammyDiveKickBefore.poseKind, 'dive_kick_leap');
  assert.equal(res.cammyDiveKickBefore.vfx.type, 'evasion_shimmer');
  assert.equal(res.cammyDiveKickHit.vfx.accent, '#ff2a4b');

  // Cammy: Spiral Arrow horizontal torpedo vortex flashes gold when Critical
  assert.equal(res.cammySpiralBeforeNorm.vfx.type, 'spiral_vortex');
  assert.equal(res.cammySpiralBeforeNorm.vfx.color, '#10b981');
  assert.equal(res.cammySpiralBeforeCrit.vfx.color, '#fde047');
  assert.equal(res.cammySpiralHitCrit.vfx.type, 'spiral_vortex');
  assert.equal(res.cammySpiralHitCrit.vfx.color, '#fde047');

  // Cammy: Cannonball mid-air somersault & Critical guard shatter
  assert.equal(res.cammyCannonballBefore.poseKind, 'cannonball_somersault');
  assert.equal(res.cammyCannonballHitCrit.vfx.type, 'armor_pierce');

  // Cammy: Razor's Edge Slicer ground-hugging low slide (hopHeight 0)
  assert.equal(res.cammyRazorsBefore.poseKind, 'razors_edge_slide');
  assert.equal(res.cammyRazorsBefore.hopHeight, 0);
  assert.equal(res.cammyRazorsHit.vfx.type, 'sweep_arc');

  // Cammy: Gyro Drive Smasher & CQC Ultras
  assert.equal(res.cammyGyroBefore.poseKind, 'gyro_drive_drill');
  assert.ok(res.cammyGyroBefore.wholeSpinRad > Math.PI * 4);
  assert.equal(res.cammyGyroHit.vfx.type, 'spiral_vortex');
  assert.equal(res.cammyGyroHit.vfx.isUltra, true);
  assert.equal(res.cammyCqcHit.poseKind, 'cqc_neck_scissors_throw');
  assert.equal(res.cammyExceed.battleCry, 'KILLER BEE ASSAULT!!');

  // Zangief: Atomic Suplex overhead slam + Critical After Close 3 earth-shaking dash
  assert.equal(res.zangiefAtomicHit.poseKind, 'atomic_suplex_slam');
  assert.equal(res.zangiefAtomicHit.vfx.type, 'ground_crater');
  assert.equal(res.zangiefAtomicAfterCrit.poseKind, 'zangief_critical_stomp_chase');
  assert.equal(res.zangiefAtomicAfterCrit.vfx.type, 'ground_crater');

  // Zangief: Banishing Flat ("Green Hand") emerald flame backhand + After Close 2 stomp
  assert.equal(res.zangiefBanishingHitCrit.poseKind, 'banishing_flat_green_hand');
  assert.equal(res.zangiefBanishingHitCrit.vfx.type, 'green_hand_burst');
  assert.equal(res.zangiefBanishingAfter.poseKind, 'zangief_critical_stomp_chase');

  // Zangief: Double Lariat hurricane spin, Flying Power Bomb red super-armor charge & crater
  assert.equal(res.zangiefLariatHit.poseKind, 'double_lariat_cyclone');
  assert.equal(res.zangiefLariatHit.vfx.type, 'cyclone');
  assert.equal(res.zangiefPowerBombBeforeCrit.poseKind, 'flying_power_bomb_charge');
  assert.equal(res.zangiefPowerBombBeforeCrit.flashColorHex, '#ff2a2a');
  assert.equal(res.zangiefPowerBombHit.poseKind, 'flying_power_bomb_crater');
  assert.equal(res.zangiefPowerBombHit.vfx.type, 'ground_crater');

  // Zangief: Spinning Piledriver & Ultimate Atomic Buster stratosphere drill + command card shatter
  assert.equal(res.zangiefSpdHit.poseKind, 'spinning_piledriver_impact');
  assert.ok(res.zangiefSpdHit.hopHeight >= 80);
  assert.equal(res.zangiefSpdHit.vfx.type, 'spd_card_shatter');
  assert.equal(res.zangiefBlizzardBefore.poseKind, 'siberian_blizzard_intercept');
  assert.equal(res.zangiefBlizzardHit.poseKind, 'siberian_blizzard_slam');
  assert.equal(res.zangiefBusterHit.poseKind, 'ultimate_atomic_buster_cataclysm');
  assert.ok(res.zangiefBusterHit.hopHeight >= 90);
  assert.equal(res.zangiefBusterHit.vfx.type, 'spd_card_shatter');
  assert.equal(res.zangiefBusterHit.vfx.isUltra, true);

  // Zangief: Red Super-Armor flash on Track 2 additive grit
  assert.equal(res.zangiefArmorGrit.poseKind, 'super_armor_grit');
  assert.equal(res.zangiefArmorGrit.track, 2);
  assert.equal(res.zangiefArmorGrit.flashColorHex, '#ff2a2a');
  assert.equal(res.zangiefExceed.battleCry, 'RED CYCLONE MUSCLE!!');
});

test('Universal Normals (Grasp, Cross, Assault, Dive, Spike, Sweep, Focus, Block) and Passive VFX differentiate Cammy vs Zangief', () => {
  const ctx = loadGameSandbox();
  const res = vm.runInContext(`(() => {
    return {
      // Cammy Universal Normals
      cammyGrasp: resolveStandeeChoreography('cammy', 'grasp', 'hit_attack', { damageDealt: 3 }),
      cammyCrossHit: resolveStandeeChoreography('cammy', 'cross', 'hit_attack', { damageDealt: 3 }),
      cammyCrossAfter: resolveStandeeChoreography('cammy', 'cross', 'after', {}),
      cammyAssaultBeforeSwap: resolveStandeeChoreography('cammy', 'assault', 'before', { sideSwapped: true }),
      cammyAssaultHitSwap: resolveStandeeChoreography('cammy', 'assault', 'hit_attack', { damageDealt: 4, sideSwapped: true }),
      cammyDiveBeforeSwap: resolveStandeeChoreography('cammy', 'dive', 'before', { sideSwapped: true }),
      cammyDiveHitSwap: resolveStandeeChoreography('cammy', 'dive', 'hit_attack', { damageDealt: 5, sideSwapped: true }),
      cammySpike: resolveStandeeChoreography('cammy', 'spike', 'hit_attack', { damageDealt: 5 }),
      cammySweep: resolveStandeeChoreography('cammy', 'sweep', 'hit_attack', { damageDealt: 6 }),
      cammyFocus: resolveStandeeChoreography('cammy', 'focus', 'hit_attack', { damageDealt: 4 }),
      cammyBlock: resolveStandeeChoreography('cammy', 'block', 'hit_attack', { damageDealt: 0 }),
      cammyBlockDefend: resolveStandeeChoreography('cammy', 'block', 'hit_defend', { damageDealt: 0 }),

      // Zangief Universal Normals
      zangiefGrasp: resolveStandeeChoreography('zangief', 'grasp', 'hit_attack', { damageDealt: 3 }),
      zangiefCrossHit: resolveStandeeChoreography('zangief', 'cross', 'hit_attack', { damageDealt: 3 }),
      zangiefCrossAfter: resolveStandeeChoreography('zangief', 'cross', 'after', {}),
      zangiefAssaultBefore: resolveStandeeChoreography('zangief', 'assault', 'before', {}),
      zangiefAssaultHit: resolveStandeeChoreography('zangief', 'assault', 'hit_attack', { damageDealt: 4 }),
      zangiefDiveBefore: resolveStandeeChoreography('zangief', 'dive', 'before', {}),
      zangiefDiveHit: resolveStandeeChoreography('zangief', 'dive', 'hit_attack', { damageDealt: 5 }),
      zangiefSpike: resolveStandeeChoreography('zangief', 'spike', 'hit_attack', { damageDealt: 5 }),
      zangiefSweep: resolveStandeeChoreography('zangief', 'sweep', 'hit_attack', { damageDealt: 6 }),
      zangiefFocusReveal: resolveStandeeChoreography('zangief', 'focus', 'reveal', {}),
      zangiefFocusHit: resolveStandeeChoreography('zangief', 'focus', 'hit_attack', { damageDealt: 4 }),
      zangiefBlockReveal: resolveStandeeChoreography('zangief', 'block', 'reveal', {}),
      zangiefBlockHit: resolveStandeeChoreography('zangief', 'block', 'hit_attack', { damageDealt: 0 }),
      zangiefBlockDefend: resolveStandeeChoreography('zangief', 'block', 'hit_defend', { damageDealt: 0 }),
      zangiefLariatHit: resolveStandeeChoreography('zangief', 'double_lariat', 'hit_attack', { damageDealt: 3 }),
      zangiefBlizzardBefore: resolveStandeeChoreography('zangief', 'siberian_blizzard', 'before', {}),
    };
  })()`, ctx);

  // Cammy Universal Normals + Red Boot Accents + Cross-Up Heel Flash
  assert.equal(res.cammyGrasp.poseKind, 'cammy_hooligan_neck_scissors');
  assert.equal(res.cammyGrasp.vfx.accent, '#ff2a4b');
  assert.equal(res.cammyCrossHit.poseKind, 'cammy_spin_knuckle_backfist');
  assert.equal(res.cammyCrossAfter.poseKind, 'cammy_hooligan_backflip');
  assert.equal(res.cammyAssaultBeforeSwap.poseKind, 'cammy_knee_bullet_rush');
  assert.equal(res.cammyAssaultBeforeSwap.cammyCrossUpHeelFlash, true);
  assert.equal(res.cammyAssaultBeforeSwap.vfx.type, 'cammy_heel_crossup_flash');
  assert.equal(res.cammyAssaultHitSwap.poseKind, 'cammy_knee_bullet_strike');
  assert.equal(res.cammyAssaultHitSwap.cammyCrossUpHeelFlash, true);
  assert.equal(res.cammyDiveBeforeSwap.poseKind, 'cammy_cannon_leap');
  assert.equal(res.cammyDiveBeforeSwap.cammyCrossUpHeelFlash, true);
  assert.equal(res.cammyDiveBeforeSwap.vfx.type, 'cammy_heel_crossup_flash');
  assert.equal(res.cammyDiveHitSwap.poseKind, 'cammy_cannon_leap_heel_drop');
  assert.equal(res.cammySpike.poseKind, 'cammy_guillotine_axe_kick');
  assert.equal(res.cammySpike.vfx.accent, '#ff2a4b');
  assert.equal(res.cammySweep.poseKind, 'cammy_crouching_roundhouse');
  assert.equal(res.cammySweep.vfx.accent, '#ff2a4b');
  assert.equal(res.cammyFocus.poseKind, 'cammy_delta_red_counter_strike');
  assert.equal(res.cammyBlock.poseKind, 'cammy_tactical_guard');
  assert.equal(res.cammyBlockDefend.poseKind, 'cammy_tactical_guard');

  // Zangief Universal Normals + Iron Wall Chains Presence
  assert.equal(res.zangiefGrasp.poseKind, 'zangief_headbutt_collar_toss');
  assert.equal(res.zangiefCrossHit.poseKind, 'zangief_heavy_chest_chop');
  assert.equal(res.zangiefCrossAfter.poseKind, 'zangief_iron_stepback');
  assert.equal(res.zangiefAssaultBefore.poseKind, 'zangief_shoulder_tackle_rush');
  assert.equal(res.zangiefAssaultHit.poseKind, 'zangief_shoulder_tackle_impact');
  assert.equal(res.zangiefDiveBefore.poseKind, 'zangief_flying_body_press');
  assert.equal(res.zangiefDiveHit.poseKind, 'zangief_flying_body_press_slam');
  assert.equal(res.zangiefSpike.poseKind, 'zangief_double_hammer_fist');
  assert.equal(res.zangiefSweep.poseKind, 'zangief_crouching_spinning_kick');
  assert.equal(res.zangiefFocusReveal.poseKind, 'zangief_iron_wall_lock');
  assert.equal(res.zangiefFocusReveal.ironWallChains, true);
  assert.equal(res.zangiefFocusReveal.vfx.type, 'iron_wall_chains');
  assert.equal(res.zangiefFocusHit.poseKind, 'zangief_muscle_flex_clothesline');
  assert.equal(res.zangiefFocusHit.ironWallChains, true);
  assert.equal(res.zangiefBlockReveal.ironWallChains, true);
  assert.equal(res.zangiefBlockHit.poseKind, 'zangief_iron_curtain_block');
  assert.equal(res.zangiefBlockHit.ironWallChains, true);
  assert.equal(res.zangiefBlockDefend.poseKind, 'zangief_iron_curtain_block');
  assert.equal(res.zangiefBlockDefend.ironWallChains, true);
  assert.equal(res.zangiefLariatHit.ironWallChains, true);
  assert.equal(res.zangiefBlizzardBefore.ironWallChains, true);
});

test('Universal procedural_exceed_only VFX policy and Multi-Frame Paradigm 2 Ryu & Ken Sweep and Cross (Normal vs Exceeded)', () => {
  const ctx = loadGameSandbox();
  const res = vm.runInContext(`(() => {
    const keys = ['ryu', 'ken', 'cviper', 'cammy', 'zangief'];
    const policies = keys.map(k => getStandeeSpec(k).vfxPolicy);
    const ryuFrames = Object.keys(getStandeeSpec('ryu').frames || {});
    const kenFrames = Object.keys(getStandeeSpec('ken').frames || {});
    const ryuSweepActiveSpec = getStandeeFrameSpec('ryu', 'sweep_active');
    const kenCrossStrikeSpec = getStandeeFrameSpec('ken', 'cross_strike');

    // Reveal step for Sweep
    const ryuSweepReveal = resolveStandeeChoreography('ryu', 'sweep', 'reveal', { exceeded: false });
    const kenSweepReveal = resolveStandeeChoreography('ken', 'sweep', 'reveal', { exceeded: false });

    // Sweep Hit in Normal vs Exceeded
    const ryuSweepNorm = resolveStandeeChoreography('ryu', 'sweep', 'hit_attack', { damageDealt: 6, exceeded: false });
    const ryuSweepEx = resolveStandeeChoreography('ryu', 'sweep', 'hit_attack', { damageDealt: 6, exceeded: true });
    const kenSweepNorm = resolveStandeeChoreography('ken', 'sweep', 'hit_attack', { damageDealt: 6, exceeded: false });
    const kenSweepEx = resolveStandeeChoreography('ken', 'sweep', 'hit_attack', { damageDealt: 6, exceeded: true });

    // Cross Hit & After Retreat in Normal vs Exceeded
    const ryuCrossNorm = resolveStandeeChoreography('ryu', 'cross', 'hit_attack', { damageDealt: 3, exceeded: false });
    const ryuCrossEx = resolveStandeeChoreography('ryu', 'cross', 'hit_attack', { damageDealt: 3, exceeded: true });
    const kenCrossNorm = resolveStandeeChoreography('ken', 'cross', 'hit_attack', { damageDealt: 3, exceeded: false });
    const kenCrossEx = resolveStandeeChoreography('ken', 'cross', 'hit_attack', { damageDealt: 3, exceeded: true });

    const ryuCrossAfterNorm = resolveStandeeChoreography('ryu', 'cross', 'after', { exceeded: false });
    const ryuCrossAfterEx = resolveStandeeChoreography('ryu', 'cross', 'after', { exceeded: true });
    const kenCrossAfterNorm = resolveStandeeChoreography('ken', 'cross', 'after', { exceeded: false });
    const kenCrossAfterEx = resolveStandeeChoreography('ken', 'cross', 'after', { exceeded: true });

    // Evaluate crisp-cut frameSequence transitions across u in [0, 1]
    const ryuSweepFramesAt = [0.05, 0.35, 0.80, 0.95].map(u => StandeeRigMath.resolveActiveFrameKey(ryuSweepNorm, u));
    const kenCrossFramesAt = [0.05, 0.45, 0.85].map(u => StandeeRigMath.resolveActiveFrameKey(kenCrossNorm, u));
    const kenAfterFramesAt = [0.20, 0.95].map(u => StandeeRigMath.resolveActiveFrameKey(kenCrossAfterNorm, u));

    return {
      policies,
      ryuFrames,
      kenFrames,
      ryuSweepActiveSpec,
      kenCrossStrikeSpec,
      ryuSweepReveal,
      kenSweepReveal,
      ryuSweepNorm,
      ryuSweepEx,
      kenSweepNorm,
      kenSweepEx,
      ryuCrossNorm,
      ryuCrossEx,
      kenCrossNorm,
      kenCrossEx,
      ryuCrossAfterNorm,
      ryuCrossAfterEx,
      kenCrossAfterNorm,
      kenCrossAfterEx,
      ryuSweepFramesAt,
      kenCrossFramesAt,
      kenAfterFramesAt,
    };
  })()`, ctx);

  // Every standee enforces universal procedural_exceed_only VFX policy
  assert.deepEqual(Array.from(res.policies), [
    'procedural_exceed_only',
    'procedural_exceed_only',
    'procedural_exceed_only',
    'procedural_exceed_only',
    'procedural_exceed_only',
  ]);

  // Multi-frame registry for Ryu and Ken
  assert.deepEqual(Array.from(res.ryuFrames), ['idle', 'sweep_windup', 'sweep_active', 'cross_strike', 'cross_retreat']);
  assert.deepEqual(Array.from(res.kenFrames), ['idle', 'sweep_windup', 'sweep_active', 'cross_strike', 'cross_retreat']);
  assert.equal(res.ryuSweepActiveSpec.src, '/assets/aistudio/ryu_sweep.jpg');
  assert.ok(res.ryuSweepActiveSpec.uvSockets.leadFoot.normX > 0.80, 'Ryu sweep_active leadFoot UV tracks extended sweeping foot');
  assert.equal(res.kenCrossStrikeSpec.src, '/assets/aistudio/ken_cross.jpg');
  assert.ok(res.kenCrossStrikeSpec.uvSockets.leadHand.normX > 0.85, 'Ken cross_strike leadHand UV tracks extended counter-punch fist');

  // Sweep reveal coils in sweep_windup frame
  assert.equal(res.ryuSweepReveal.frameKey, 'sweep_windup');
  assert.equal(res.kenSweepReveal.frameKey, 'sweep_windup');

  // Crisp-cut frame progression across Sweep, Cross Strike, and Cross Retreat
  assert.deepEqual(Array.from(res.ryuSweepFramesAt), ['sweep_windup', 'sweep_active', 'sweep_windup', 'idle']);
  assert.deepEqual(Array.from(res.kenCrossFramesAt), ['idle', 'cross_strike', 'cross_retreat']);
  assert.deepEqual(Array.from(res.kenAfterFramesAt), ['cross_retreat', 'idle']);

  // Ken Sweep uses horizontal_flare spinPlane so he spins parallel to the floor instead of cartwheeling underground
  assert.equal(res.kenSweepNorm.spinPlane, 'horizontal_flare');
  assert.equal(res.kenCrossAfterNorm.spinPlane, 'xy');

  // Normal vs Exceeded procedural VFX gating on Sweep and Cross
  assert.equal(res.ryuSweepNorm.vfx.type, 'physical_sweep_dust');
  assert.equal(res.ryuSweepNorm.vfx.isExceeded, false);
  assert.equal(res.ryuSweepEx.vfx.type, 'ryu_ashi_barai_ki_sweep');
  assert.equal(res.ryuSweepEx.vfx.isExceeded, true);

  assert.equal(res.kenSweepNorm.vfx.type, 'physical_sweep_dust');
  assert.equal(res.kenSweepNorm.vfx.isExceeded, false);
  assert.equal(res.kenSweepEx.vfx.type, 'ken_flare_fire_sweep');
  assert.equal(res.kenSweepEx.vfx.isExceeded, true);

  assert.equal(res.ryuCrossNorm.vfx.type, 'physical_cross_snap');
  assert.equal(res.ryuCrossNorm.vfx.isExceeded, false);
  assert.equal(res.ryuCrossEx.vfx.type, 'ryu_denjin_cross_lance');
  assert.equal(res.ryuCrossEx.vfx.isExceeded, true);

  assert.equal(res.kenCrossNorm.vfx.type, 'physical_cross_snap');
  assert.equal(res.kenCrossNorm.vfx.isExceeded, false);
  assert.equal(res.kenCrossEx.vfx.type, 'ken_crimson_cross_whip');
  assert.equal(res.kenCrossEx.vfx.isExceeded, true);

  assert.equal(res.ryuCrossAfterNorm.vfx.type, 'dust');
  assert.equal(res.ryuCrossAfterEx.vfx.type, 'ryu_backdash_ki_wake');
  assert.equal(res.kenCrossAfterNorm.vfx.type, 'dust');
  assert.equal(res.kenCrossAfterEx.vfx.type, 'ken_backflip_fire_wheel');
});





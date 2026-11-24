// Snapshot-driven Strike Playback Controller & Trigger Timeline UI.
// Reads Engine's deterministic lastStrikeInfo.timeline without mutating Engine.

const UXSettings = (() => {
  const STORAGE_KEY = 'exceed_ux_settings_v1';
  const defaults = {
    muted: false,
    volume: 0.65,
    reducedHitStop: false,
    colorblindPatterns: false,
    quickCommit: false,
  };
  let state = { ...defaults };

  function load() {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) state = { ...defaults, ...JSON.parse(raw) };
      }
    } catch (_) {}
    applyBodyFlags();
    return state;
  }

  function save() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      }
    } catch (_) {}
    applyBodyFlags();
  }

  function applyBodyFlags() {
    if (typeof document === 'undefined' || !document.body || !document.body.classList) return;
    if (state.colorblindPatterns) document.body.classList.add('cb-patterns');
    else document.body.classList.remove('cb-patterns');
    if (state.reducedHitStop) document.body.classList.add('reduced-flash');
    else document.body.classList.remove('reduced-flash');
  }

  function get(k) { return state[k]; }
  function set(k, v) { state[k] = v; save(); }
  function all() { return { ...state }; }

  load();
  return { get, set, all, load };
})();

const StrikePlaybackController = (() => {
  let timer = null;
  let activeStepIdx = -1;
  let activeStrikeInfo = null;
  let skipped = false;

  function stop() {
    if (timer) { clearTimeout(timer); timer = null; }
    skipped = true;
    const callout = typeof document !== 'undefined' ? document.getElementById('callout-overlay') : null;
    if (callout) callout.innerHTML = '';
  }

  function timelineBarHTML(strikeInfo, currentStepIdx) {
    if (!strikeInfo || !Array.isArray(strikeInfo.timeline) || strikeInfo.timeline.length === 0) return '';
    const tl = strikeInfo.timeline;
    const cur = tl[Math.min(Math.max(0, currentStepIdx), tl.length - 1)] || tl[tl.length - 1];
    const firstId = strikeInfo.firstId;
    const secondId = strikeInfo.secondId;
    const firstLabel = firstId === 'p1' ? 'You (Faster)' : 'CPU (Faster)';
    const secondLabel = secondId === 'p1' ? 'You (Slower)' : 'CPU (Slower)';
    const wasStunned = tl.some(s => s.phase === 'stunned');

    const pill = (label, isActive, extraCls = '') =>
      `<span class="tl-node${isActive ? ' active' : ''}${extraCls ? ' ' + extraCls : ''}">${label}</span>`;

    const isPhase = (p, actor) => cur.phase === p && (!actor || cur.actor === actor);

    const guardShield = (cur.phase === 'hit' || cur.phase === 'stunned')
      ? `<span class="guard-shield ${cur.guardBroken ? 'cracked' : 'held'}" title="${cur.guardBroken ? 'Guard Broken (Stun!)' : 'Guard Held'}">${cur.guardBroken ? '🛡💥 GUARD BREAK' : '🛡 GUARD HELD'}</span>`
      : '';

    return `<div class="trigger-timeline">
      ${pill('Reveal & Speed', isPhase('reveal'))}
      <span class="tl-arrow">→</span>
      <span class="tl-group">
        <span class="tl-actor">${firstLabel}:</span>
        ${pill('Before', isPhase('before', firstId))}
        ${pill('Range', isPhase('range', firstId))}
        ${pill('Hit', isPhase('hit', firstId))}
        ${pill('After', isPhase('after', firstId))}
      </span>
      <span class="tl-arrow">→</span>
      <span class="tl-group">
        <span class="tl-actor">${secondLabel}:</span>
        ${wasStunned
          ? pill('STUNNED / SKIPPED', cur.phase === 'stunned', 'stunned')
          : `${pill('Before', isPhase('before', secondId))}
             ${pill('Range', isPhase('range', secondId))}
             ${pill('Hit', isPhase('hit', secondId))}
             ${pill('After', isPhase('after', secondId))}`
        }
      </span>
      <span class="tl-arrow">→</span>
      ${pill('Cleanup', isPhase('cleanup'))}
      ${guardShield}
      ${!skipped && currentStepIdx < tl.length - 1 ? '<button type="button" class="tl-skip-btn" onclick="StrikePlaybackController.skip()">Skip ⏭</button>' : ''}
    </div>`;
  }

  function showConfirmedLethalCallout(label) {
    if (typeof document === 'undefined') return;
    const callout = document.getElementById('callout-overlay');
    if (!callout) return;
    const reduced = UXSettings.get('reducedHitStop');
    callout.innerHTML = `<div class="checkmate-flash${reduced ? ' reduced' : ''}">${label || 'CHECKMATE'}</div>`;
    setTimeout(() => {
      if (callout) callout.innerHTML = '';
    }, reduced ? 450 : 1200);
  }

  function start(strikeInfo) {
    stop();
    if (!strikeInfo || !Array.isArray(strikeInfo.timeline) || strikeInfo.timeline.length === 0) return;
    activeStrikeInfo = strikeInfo;
    activeStepIdx = 0;
    skipped = false;

    const advance = () => {
      if (skipped || !activeStrikeInfo) return;
      const tl = activeStrikeInfo.timeline;
      if (activeStepIdx >= tl.length) return;
      const step = tl[activeStepIdx];

      const slot = typeof document !== 'undefined' ? document.getElementById('trigger-timeline-slot') : null;
      if (slot) slot.innerHTML = timelineBarHTML(activeStrikeInfo, activeStepIdx);

      if (typeof EventBus !== 'undefined') {
        if (step.phase === 'reveal') {
          EventBus.emit('OnStrikeReveal', { strikeInfo: activeStrikeInfo });
          EventBus.emit('OnSpeedResolved', { winnerId: step.speedWinner, tie: !!step.speedTie });
        } else if (step.phase === 'hit') {
          EventBus.emit('OnStrikeHit', {
            actor: step.actor,
            defenderId: step.defenderId,
            damage: step.damageDealt || 0,
            effectivePower: step.effectivePower || 0,
            effectiveArmor: step.effectiveArmor || 0,
            effectiveGuard: step.effectiveGuard || 0,
            guardBroken: !!step.guardBroken,
            confirmedLethal: !!step.confirmedLethal,
            cardName: step.cardName || '',
            cardType: step.cardType || 'normal',
            isEX: !!step.isEX,
            criticalPaid: !!step.criticalPaid,
          });
          if (step.confirmedLethal) {
            EventBus.emit('OnLethalDetected', { winnerId: step.actor });
            showConfirmedLethalCallout('CHECKMATE');
          }
        } else if (step.phase === 'stunned') {
          EventBus.emit('OnGuardBreak', {
            stunnedPlayerId: step.actor,
            damageDealt: step.damageDealt || 0,
            effectiveGuard: step.effectiveGuard || 0,
          });
        }
      }

      activeStepIdx++;
      if (activeStepIdx < tl.length) {
        const delay = (step.confirmedLethal && !UXSettings.get('reducedHitStop')) ? 850 : 320;
        timer = setTimeout(advance, delay);
      }
    };

    advance();
  }

  function skip() {
    if (!activeStrikeInfo || !activeStrikeInfo.timeline) return;
    stop();
    if (typeof HitParticleEngine !== 'undefined' && HitParticleEngine.clearCallouts) {
      HitParticleEngine.clearCallouts();
    }
    activeStepIdx = activeStrikeInfo.timeline.length - 1;
    const slot = typeof document !== 'undefined' ? document.getElementById('trigger-timeline-slot') : null;
    if (slot) slot.innerHTML = timelineBarHTML(activeStrikeInfo, activeStepIdx);
  }

  function getCurrentStepIdx(strikeInfo) {
    if (activeStrikeInfo && strikeInfo && activeStrikeInfo === strikeInfo && activeStepIdx > 0) {
      return Math.min(activeStepIdx - 1, (strikeInfo.timeline || []).length - 1);
    }
    return Math.max(0, ((strikeInfo && strikeInfo.timeline) || []).length - 1);
  }

  return { start, stop, skip, timelineBarHTML, getCurrentStepIdx };
})();

// ============================================================
// OVER-THE-TOP FIGHTING GAME HIT PARTICLE & IMPACT FX ENGINE
// ============================================================
// Renders high-energy arcade hit sparks, anime starbursts, directional slash
// beams, shockwave rings, jagged lightning arcs, tumbling polygon shards, and
// stylized FGC damage callouts inside #fx-overlay-root (outside #app so
// paint() re-renders never wipe active animations).
const HitParticleEngine = (() => {
  const PALETTES = {
    guard: {
      core: '#ffffff',
      primary: '#4de6d1',
      secondary: '#38bdf8',
      accent: '#93c5fd',
      glow: 'rgba(77, 230, 209, 0.75)',
    },
    light: {
      core: '#ffffff',
      primary: '#ffe066',
      secondary: '#4de6d1',
      accent: '#ff9270',
      glow: 'rgba(255, 224, 102, 0.8)',
    },
    medium: {
      core: '#ffffff',
      primary: '#ff7b54',
      secondary: '#f7c65a',
      accent: '#ff3b5c',
      glow: 'rgba(255, 107, 87, 0.85)',
    },
    heavy: {
      core: '#ffffff',
      primary: '#ff2a55',
      secondary: '#f7c65a',
      accent: '#ff6f8f',
      glow: 'rgba(255, 42, 85, 0.9)',
    },
    critical: {
      core: '#ffffff',
      primary: '#ffd166',
      secondary: '#ff2a55',
      accent: '#ff9e00',
      glow: 'rgba(255, 209, 102, 0.92)',
    },
    ex: {
      core: '#ffffff',
      primary: '#ffe066',
      secondary: '#ab8ff2',
      accent: '#4de6d1',
      glow: 'rgba(171, 143, 242, 0.92)',
    },
    ultra: {
      core: '#ffffff',
      primary: '#ff1e56',
      secondary: '#ab8ff2',
      accent: '#f7c65a',
      glow: 'rgba(255, 30, 86, 0.95)',
    },
    stun: {
      core: '#ffffff',
      primary: '#f7c65a',
      secondary: '#ff5f6d',
      accent: '#93c5fd',
      glow: 'rgba(247, 198, 90, 0.9)',
    },
    exceed: {
      core: '#ffffff',
      primary: '#ab8ff2',
      secondary: '#f7c65a',
      accent: '#ff6f8f',
      glow: 'rgba(171, 143, 242, 0.92)',
    },
  };

  let canvas = null;
  let ctx2d = null;
  let calloutLayer = null;
  let rafId = null;
  let lastFrameTs = 0;
  let totalBursts = 0;
  let lastBurst = null;
  let shakeTimer = null;

  const particles = [];
  const starbursts = [];
  const slashes = [];
  const rings = [];
  const speedLines = [];
  const bolts = [];
  const flashes = [];
  const recentTriggers = new Map();

  function isReducedMotion() {
    if (typeof UXSettings !== 'undefined' && UXSettings.get('reducedHitStop')) return true;
    try {
      if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        if (mq && mq.matches) return true;
      }
    } catch (_) {}
    return false;
  }

  function classifyHitTier(opts = {}) {
    const kind = opts.kind || 'hit';
    const dmg = Math.max(0, Number(opts.damage != null ? opts.damage : (opts.amount != null ? opts.amount : 0)) || 0);
    const cardType = String(opts.cardType || 'normal').toLowerCase();
    const isEX = !!opts.isEX;
    const criticalPaid = !!opts.criticalPaid;
    const guardBroken = !!opts.guardBroken;
    const confirmedLethal = !!opts.confirmedLethal;
    const effArm = Math.max(0, Number(opts.effectiveArmor != null ? opts.effectiveArmor : (opts.effArm || 0)) || 0);
    const cardName = opts.cardName ? String(opts.cardName) : '';
    const reduced = isReducedMotion();
    const scale = reduced ? 0.42 : 1;

    if (kind === 'stun') {
      return {
        tier: 'stun',
        palette: PALETTES.stun,
        headline: 'STUNNED!!',
        subline: 'GUARD SHATTERED',
        dmgLabel: 'CRUSH!',
        badgeClass: 'tier-stun',
        particleCount: Math.max(12, Math.round(54 * scale)),
        shardCount: Math.max(8, Math.round(18 * scale)),
        slashCount: Math.max(1, Math.round(2 * scale)),
        ringCount: 2,
        rayCount: Math.max(6, Math.round(14 * scale)),
        boltCount: reduced ? 1 : 4,
        starSpikes: 10,
        starRadius: 68,
        shakeLevel: reduced ? 'none' : 'heavy',
      };
    }

    if (kind === 'exceed') {
      return {
        tier: 'exceed',
        palette: PALETTES.exceed,
        headline: 'EXCEED AWAKENED!!',
        subline: opts.characterName ? String(opts.characterName).toUpperCase() : 'OVERDRIVE POWER',
        dmgLabel: '★ EXCEED',
        badgeClass: 'tier-exceed',
        particleCount: Math.max(16, Math.round(64 * scale)),
        shardCount: Math.max(6, Math.round(14 * scale)),
        slashCount: 2,
        ringCount: 3,
        rayCount: Math.max(8, Math.round(16 * scale)),
        boltCount: reduced ? 1 : 5,
        starSpikes: 12,
        starRadius: 78,
        shakeLevel: reduced ? 'none' : 'medium',
      };
    }

    if (kind === 'armor' || dmg <= 0) {
      return {
        tier: 'guard',
        palette: PALETTES.guard,
        headline: kind === 'armor' ? 'ARMOR FORTIFIED!' : 'GUARD HELD!',
        subline: effArm > 0 ? `ARMOR ${effArm} ABSORBED` : 'ZERO DAMAGE',
        dmgLabel: kind === 'armor' ? `+${dmg || effArm} ARM` : 'BLOCKED',
        badgeClass: 'tier-guard',
        particleCount: Math.max(10, Math.round(24 * scale)),
        shardCount: Math.max(4, Math.round(8 * scale)),
        slashCount: 1,
        ringCount: 2,
        rayCount: Math.max(4, Math.round(8 * scale)),
        boltCount: 0,
        starSpikes: 6,
        starRadius: 42,
        shakeLevel: 'none',
      };
    }

    if (confirmedLethal || cardType === 'ultra' || dmg >= 7) {
      const headline = confirmedLethal
        ? 'DESTRUCTIVE FINISH!!'
        : (cardType === 'ultra' ? 'ULTRA FINISH!!' : 'MAXIMUM IMPACT!!');
      const subParts = [];
      if (cardName) subParts.push(cardName.toUpperCase());
      if (criticalPaid) subParts.push('CRITICAL');
      if (isEX) subParts.push('EX');
      if (guardBroken) subParts.push('GUARD BREAK');
      return {
        tier: 'ultra',
        palette: PALETTES.ultra,
        headline,
        subline: subParts.join(' · ') || 'SUPERNOVA SLASH',
        dmgLabel: `-${dmg}!!`,
        badgeClass: 'tier-ultra',
        particleCount: Math.max(24, Math.round(96 * scale)),
        shardCount: Math.max(10, Math.round(24 * scale)),
        slashCount: reduced ? 2 : 5,
        ringCount: reduced ? 2 : 4,
        rayCount: Math.max(10, Math.round(22 * scale)),
        boltCount: reduced ? 2 : 7,
        starSpikes: 16,
        starRadius: 98,
        shakeLevel: reduced ? 'none' : 'ultra',
      };
    }

    if (dmg >= 5 || isEX || criticalPaid || guardBroken) {
      const palette = (criticalPaid && !isEX)
        ? PALETTES.critical
        : (isEX ? PALETTES.ex : PALETTES.heavy);
      const headline = guardBroken
        ? 'GUARD BREAK!!'
        : (criticalPaid && isEX
            ? 'EX CRITICAL!!'
            : (criticalPaid ? 'CRITICAL HIT!!' : (isEX ? 'EX IMPACT!!' : 'HEAVY SLASH!!')));
      const subParts = [];
      if (cardName) subParts.push(cardName.toUpperCase());
      if (effArm > 0) subParts.push(`PIERCED ${effArm} ARM`);
      return {
        tier: 'heavy',
        palette,
        headline,
        subline: subParts.join(' · ') || 'HIGH-VOLTAGE IMPACT',
        dmgLabel: `-${dmg}!`,
        badgeClass: isEX ? 'tier-ex' : (criticalPaid ? 'tier-critical' : 'tier-heavy'),
        particleCount: Math.max(18, Math.round(68 * scale)),
        shardCount: Math.max(7, Math.round(16 * scale)),
        slashCount: reduced ? 2 : 3,
        ringCount: reduced ? 2 : 3,
        rayCount: Math.max(8, Math.round(16 * scale)),
        boltCount: reduced ? 1 : 4,
        starSpikes: 12,
        starRadius: 76,
        shakeLevel: reduced ? 'none' : 'heavy',
      };
    }

    if (dmg >= 3) {
      return {
        tier: 'medium',
        palette: PALETTES.medium,
        headline: effArm > 0 ? 'ARMOR CRUSH!' : 'SOLID HIT!',
        subline: cardName ? cardName.toUpperCase() : 'CLEAN CONNECT',
        dmgLabel: `-${dmg}`,
        badgeClass: 'tier-medium',
        particleCount: Math.max(14, Math.round(42 * scale)),
        shardCount: Math.max(5, Math.round(10 * scale)),
        slashCount: 2,
        ringCount: 2,
        rayCount: Math.max(6, Math.round(11 * scale)),
        boltCount: reduced ? 0 : 2,
        starSpikes: 8,
        starRadius: 56,
        shakeLevel: reduced ? 'none' : 'medium',
      };
    }

    return {
      tier: 'light',
      palette: PALETTES.light,
      headline: 'HIT!',
      subline: cardName ? cardName.toUpperCase() : 'QUICK STRIKE',
      dmgLabel: `-${dmg}`,
      badgeClass: 'tier-light',
      particleCount: Math.max(10, Math.round(26 * scale)),
      shardCount: Math.max(3, Math.round(6 * scale)),
      slashCount: 1,
      ringCount: 1,
      rayCount: Math.max(4, Math.round(7 * scale)),
      boltCount: 0,
      starSpikes: 6,
      starRadius: 42,
      shakeLevel: reduced ? 'none' : 'light',
    };
  }

  function ensureOverlaySurface() {
    if (typeof document === 'undefined' || !document.getElementById) return false;
    const root = document.getElementById('fx-overlay-root');
    if (!root || !root.appendChild || typeof document.createElement !== 'function') return false;

    const vw = (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : 1024;
    const vh = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : 768;
    const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);

    if (!canvas || !canvas.isConnected) {
      canvas = document.createElement('canvas');
      canvas.className = 'hit-fx-canvas';
      root.appendChild(canvas);
      ctx2d = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
    }
    if (!calloutLayer || !calloutLayer.isConnected) {
      calloutLayer = document.createElement('div');
      calloutLayer.className = 'hit-fx-callouts';
      root.appendChild(calloutLayer);
    }
    if (canvas && ctx2d) {
      const targetW = Math.round(vw * dpr);
      const targetH = Math.round(vh * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
    }
    return !!ctx2d;
  }

  function resolveCombatPositions(defenderId, attackerId) {
    const vw = (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : 1024;
    const vh = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : 768;
    const fallbackDef = {
      x: defenderId === 'p1' ? vw * 0.34 : vw * 0.62,
      y: vh * 0.34,
    };
    const fallbackAtt = {
      x: attackerId === 'p1' ? vw * 0.34 : vw * 0.62,
      y: vh * 0.34,
    };

    if (typeof document === 'undefined' || typeof document.querySelector !== 'function') {
      const dirX = Math.sign(fallbackDef.x - fallbackAtt.x) || (defenderId === 'p2' ? 1 : -1);
      return { x: fallbackDef.x, y: fallbackDef.y, attX: fallbackAtt.x, attY: fallbackAtt.y, dirX, defToken: null, attToken: null, defCell: null };
    }

    // Check if How to Play Clash Lab is open first
    const htpOverlay = document.getElementById && document.getElementById('howToPlayOverlay');
    const htpOpen = htpOverlay && htpOverlay.style && htpOverlay.style.display === 'flex';
    if (htpOpen) {
      const defCorner = document.querySelector(`.htp-clash-corner.${defenderId || 'p2'}`);
      const attCorner = document.querySelector(`.htp-clash-corner.${attackerId || 'p1'}`);
      if (defCorner && typeof defCorner.getBoundingClientRect === 'function') {
        const dr = defCorner.getBoundingClientRect();
        const ar = (attCorner && typeof attCorner.getBoundingClientRect === 'function') ? attCorner.getBoundingClientRect() : null;
        if (dr.width > 0 && dr.height > 0) {
          const x = dr.left + dr.width * 0.5;
          const y = dr.top + dr.height * 0.38;
          const attX = ar && ar.width > 0 ? ar.left + ar.width * 0.5 : (defenderId === 'p2' ? x - 240 : x + 240);
          const attY = ar && ar.height > 0 ? ar.top + ar.height * 0.38 : y;
          const dirX = Math.sign(x - attX) || (defenderId === 'p2' ? 1 : -1);
          return { x, y, attX, attY, dirX, defToken: defCorner, attToken: attCorner, defCell: defCorner };
        }
      }
    }

    const defToken = defenderId ? document.querySelector(`.board .token[data-pid="${defenderId}"]`) : null;
    const attToken = attackerId ? document.querySelector(`.board .token[data-pid="${attackerId}"]`) : null;
    const defCell = defToken && defToken.closest ? defToken.closest('.cell') : null;

    let x = fallbackDef.x;
    let y = fallbackDef.y;
    let attX = fallbackAtt.x;
    let attY = fallbackAtt.y;

    if (defToken && typeof defToken.getBoundingClientRect === 'function') {
      const r = defToken.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        x = r.left + r.width / 2;
        y = r.top + r.height / 2;
      }
    } else if (typeof G !== 'undefined' && G && G.engine && defenderId) {
      const p = G.engine.P(defenderId);
      const cell = p ? document.querySelector(`.board .cell[data-space="${p.pos}"]`) : null;
      if (cell && typeof cell.getBoundingClientRect === 'function') {
        const r = cell.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          x = r.left + r.width / 2;
          y = r.top + r.height / 2;
        }
      }
    }

    if (attToken && typeof attToken.getBoundingClientRect === 'function') {
      const r = attToken.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        attX = r.left + r.width / 2;
        attY = r.top + r.height / 2;
      }
    } else {
      attX = x + (defenderId === 'p2' ? -140 : 140);
      attY = y;
    }

    const dirX = Math.sign(x - attX) || (defenderId === 'p2' ? 1 : -1);
    return { x, y, attX, attY, dirX, defToken, attToken, defCell };
  }

  function buildLightningPoints(x1, y1, x2, y2, jitter = 14, segments = 6) {
    const pts = [{ x: x1, y: y1 }];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      const offset = (Math.random() * 2 - 1) * jitter * (1 - Math.abs(t - 0.5));
      pts.push({
        x: x1 + dx * t + nx * offset,
        y: y1 + dy * t + ny * offset,
      });
    }
    pts.push({ x: x2, y: y2 });
    return pts;
  }

  function spawnCanvasBurst(x, y, attX, attY, dirX, spec) {
    const pal = spec.palette;
    const colors = [pal.core, pal.primary, pal.secondary, pal.accent];

    // 1. Core Impact Flash & Bloom
    flashes.push({
      x,
      y,
      radius: spec.starRadius * 1.45,
      color: pal.primary,
      glow: pal.glow,
      age: 0,
      duration: spec.tier === 'ultra' ? 280 : (spec.tier === 'heavy' ? 220 : 165),
      screenTint: spec.tier === 'ultra' ? 0.22 : (spec.tier === 'heavy' ? 0.12 : 0),
    });

    // 2. Multi-Point Anime Starburst
    starbursts.push({
      x,
      y,
      spikes: spec.starSpikes,
      outerRadius: spec.starRadius,
      innerRadius: spec.starRadius * 0.22,
      rotation: (Math.random() - 0.5) * 0.5,
      rotSpeed: dirX * 1.8,
      primary: pal.primary,
      secondary: pal.secondary,
      core: pal.core,
      age: 0,
      duration: spec.tier === 'ultra' ? 380 : 290,
    });

    // Secondary counter-rotating starburst for Heavy / Ultra / Exceed
    if (spec.tier === 'heavy' || spec.tier === 'ultra' || spec.tier === 'exceed') {
      starbursts.push({
        x,
        y,
        spikes: Math.max(6, spec.starSpikes - 4),
        outerRadius: spec.starRadius * 1.28,
        innerRadius: spec.starRadius * 0.16,
        rotation: Math.PI / spec.starSpikes,
        rotSpeed: -dirX * 2.4,
        primary: pal.accent,
        secondary: pal.primary,
        core: pal.core,
        age: 0,
        duration: spec.tier === 'ultra' ? 440 : 340,
      });
    }

    // 3. Directional Fighting-Game Slash Streaks
    const baseAngle = dirX >= 0 ? -0.38 : (-Math.PI + 0.38);
    const slashAngles = [baseAngle];
    if (spec.slashCount >= 2) slashAngles.push(baseAngle + (dirX >= 0 ? 0.82 : -0.82));
    if (spec.slashCount >= 3) slashAngles.push(baseAngle + (dirX >= 0 ? -0.65 : 0.65));
    if (spec.slashCount >= 4) {
      slashAngles.push(0.18 * dirX);
      slashAngles.push(Math.PI * 0.5 + 0.15 * dirX);
    }
    for (let i = 0; i < slashAngles.length; i++) {
      slashes.push({
        x: x + (i === 0 ? 0 : (Math.random() - 0.5) * 18),
        y: y + (i === 0 ? 0 : (Math.random() - 0.5) * 18),
        angle: slashAngles[i],
        length: spec.starRadius * (i === 0 ? 2.65 : 2.15),
        thickness: spec.tier === 'ultra' ? 14 : (spec.tier === 'heavy' ? 10.5 : 7.5),
        color: i % 2 === 0 ? pal.primary : pal.accent,
        core: pal.core,
        age: -i * 22,
        duration: 240 + i * 30,
      });
    }

    // Attack-vector kinetic beam connecting attacker to defender on Heavy / Ultra hits
    const distBetween = Math.hypot(x - attX, y - attY);
    if ((spec.tier === 'heavy' || spec.tier === 'ultra') && distBetween > 45 && distBetween < 950) {
      slashes.push({
        x: (x + attX) / 2,
        y: (y + attY) / 2,
        angle: Math.atan2(y - attY, x - attX),
        length: distBetween * 1.08,
        thickness: spec.tier === 'ultra' ? 16 : 10,
        color: pal.secondary,
        core: pal.core,
        age: 0,
        duration: 210,
      });
    }

    // 4. Concentric Shockwave Rings
    for (let i = 0; i < spec.ringCount; i++) {
      rings.push({
        x,
        y,
        startRadius: 10 + i * 8,
        endRadius: spec.starRadius * (1.35 + i * 0.48),
        lineWidth: (spec.tier === 'ultra' ? 7 : 5) - i * 0.9,
        color: i === 0 ? pal.core : (i % 2 === 1 ? pal.primary : pal.accent),
        dashed: i === 1 || spec.tier === 'stun',
        hexShield: spec.tier === 'guard',
        age: -i * 38,
        duration: 340 + i * 55,
      });
    }

    // 5. Radial Anime Speed Lines
    for (let i = 0; i < spec.rayCount; i++) {
      const a = (i / spec.rayCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.22;
      const bias = Math.cos(a) * dirX > 0 ? 1.28 : 0.85;
      speedLines.push({
        x,
        y,
        angle: a,
        innerR: spec.starRadius * (0.35 + Math.random() * 0.25),
        outerR: spec.starRadius * (1.35 + Math.random() * 0.95) * bias,
        width: 1.8 + Math.random() * 2.4,
        color: colors[i % colors.length],
        age: Math.random() * -25,
        duration: 210 + Math.random() * 110,
      });
    }

    // 6. Jagged Procedural Lightning Arcs
    for (let i = 0; i < spec.boltCount; i++) {
      const a = (i / Math.max(1, spec.boltCount)) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
      const reach = spec.starRadius * (1.1 + Math.random() * 0.85);
      const tx = x + Math.cos(a) * reach;
      const ty = y + Math.sin(a) * reach;
      bolts.push({
        points: buildLightningPoints(x, y, tx, ty, 15, 6),
        color: i % 2 === 0 ? pal.primary : pal.accent,
        core: pal.core,
        age: -i * 18,
        duration: 220 + Math.random() * 90,
      });
    }

    // 7. Physics-Driven Spark Streakers & Embers
    for (let i = 0; i < spec.particleCount; i++) {
      const isExceed = spec.tier === 'exceed';
      const spreadAngle = isExceed
        ? (-Math.PI * 0.5 + (Math.random() - 0.5) * 1.15)
        : (Math.random() * Math.PI * 2);
      const directionalBoost = (!isExceed && Math.cos(spreadAngle) * dirX > 0) ? 1.45 : 0.85;
      const speed = (160 + Math.random() * (spec.tier === 'ultra' ? 620 : (spec.tier === 'heavy' ? 490 : 340))) * directionalBoost;
      const vx = Math.cos(spreadAngle) * speed + (isExceed ? 0 : dirX * 55);
      const vy = Math.sin(spreadAngle) * speed - (isExceed ? 140 : 45);
      const isEmber = i % 4 === 0;
      const sx = x + (Math.random() - 0.5) * (isExceed ? 44 : 16);
      const sy = y + (Math.random() - 0.5) * 16;

      particles.push({
        kind: isEmber ? 'ember' : 'streak',
        x: sx,
        y: sy,
        prevX: sx,
        prevY: sy,
        vx,
        vy,
        gravity: isExceed ? -120 : (isEmber ? -45 : 460),
        drag: isEmber ? 0.94 : 0.91,
        size: isEmber ? (3 + Math.random() * 4.5) : (2.2 + Math.random() * 3.2),
        tailMul: spec.tier === 'ultra' ? 2.4 : 1.75,
        color: colors[i % colors.length],
        glow: pal.glow,
        age: 0,
        duration: (isEmber ? 540 : 380) + Math.random() * 240,
      });
    }

    // 8. Tumbling Polygon Shards (Diamonds / Guard Triangles / Stun Stars)
    for (let i = 0; i < spec.shardCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 130 + Math.random() * 380;
      const shape = spec.tier === 'stun'
        ? (i % 2 === 0 ? 'star' : 'triangle')
        : (spec.tier === 'guard' ? 'triangle' : 'diamond');
      particles.push({
        kind: 'shard',
        shape,
        x: x + (Math.random() - 0.5) * 18,
        y: y + (Math.random() - 0.5) * 18,
        prevX: x,
        prevY: y,
        vx: Math.cos(a) * speed + dirX * 45,
        vy: Math.sin(a) * speed - 65,
        gravity: 360,
        drag: 0.93,
        size: (spec.tier === 'ultra' ? 9 : 7) + Math.random() * 6,
        rotation: Math.random() * Math.PI * 2,
        angularVel: (Math.random() - 0.5) * 16,
        color: colors[(i + 1) % colors.length],
        core: pal.core,
        age: 0,
        duration: 450 + Math.random() * 220,
      });
    }
  }

  function computeCalloutPosition(pos, viewport = {}) {
    const vw = viewport.width != null
      ? viewport.width
      : ((typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : 1024);
    const vh = viewport.height != null
      ? viewport.height
      : ((typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : 768);
    const edgePadX = vw < 700 ? 84 : 110;
    const clampedX = Math.max(edgePadX, Math.min(vw - edgePadX, pos.x));
    const isShortViewport = vh < 540;
    // Callout translates upward (-105% to -152% of ~52-68px height), so keep anchor >= 78px on short landscape screens
    const minY = Math.min(Math.max(40, vh - 36), isShortViewport ? 80 : 68);
    const maxY = Math.max(minY, vh - (isShortViewport ? 22 : 30));
    const offsetY = isShortViewport ? 10 : 34;
    const clampedY = Math.max(minY, Math.min(maxY, pos.y - offsetY));
    return { x: clampedX, y: clampedY };
  }

  function applyDomImpactChoreography(pos, spec, defenderId, attackerId) {
    if (typeof document === 'undefined') return;
    const reduced = isReducedMotion();

    // 1. Floating Arcade Callout Banner in #fx-overlay-root
    if (calloutLayer && typeof document.createElement === 'function') {
      const { x: clampedX, y: clampedY } = computeCalloutPosition(pos);

      const el = document.createElement('div');
      el.className = `hit-fx-callout ${spec.badgeClass}${reduced ? ' reduced' : ''}`;
      el.style.left = `${Math.round(clampedX)}px`;
      el.style.top = `${Math.round(clampedY)}px`;
      el.innerHTML = `
        <div class="hit-fx-callout-inner">
          <div class="hit-fx-headline-row">
            <span class="hit-fx-headline">${spec.headline}</span>
            <span class="hit-fx-dmg">${spec.dmgLabel}</span>
          </div>
          ${spec.subline ? `<div class="hit-fx-subline">${spec.subline}</div>` : ''}
        </div>
      `;
      calloutLayer.appendChild(el);
      if (typeof requestAnimationFrame === 'function') {
        setTimeout(() => {
          if (el && el.remove) el.remove();
        }, reduced ? 520 : 950);
      } else {
        // Keep at most 4 callouts in headless/non-rAF sandboxes
        while (calloutLayer.children && calloutLayer.children.length > 4) {
          calloutLayer.children[0].remove();
        }
      }
    }

    // 2. Token Impact Flash, Recoil & Attacker Lunge
    if (pos.defToken && pos.defToken.classList) {
      const recoilCls = pos.dirX >= 0 ? 'token-hit-recoil-right' : 'token-hit-recoil-left';
      pos.defToken.classList.remove('token-hit-flash', 'token-hit-recoil-right', 'token-hit-recoil-left');
      pos.defToken.classList.add('token-hit-flash', recoilCls);
      if (typeof requestAnimationFrame === 'function') {
        setTimeout(() => {
          if (pos.defToken && pos.defToken.classList) {
            pos.defToken.classList.remove('token-hit-flash', recoilCls);
          }
        }, 420);
      }
    }

    if (pos.defCell && pos.defCell.classList) {
      pos.defCell.classList.remove('cell-hit-impact');
      pos.defCell.classList.add('cell-hit-impact');
      if (typeof requestAnimationFrame === 'function') {
        setTimeout(() => {
          if (pos.defCell && pos.defCell.classList) {
            pos.defCell.classList.remove('cell-hit-impact');
          }
        }, 440);
      }
    }

    if (pos.attToken && pos.attToken.classList && pos.attToken !== pos.defToken) {
      const lungeCls = pos.dirX >= 0 ? 'token-attack-lunge-right' : 'token-attack-lunge-left';
      pos.attToken.classList.remove('token-attack-lunge-right', 'token-attack-lunge-left');
      pos.attToken.classList.add(lungeCls);
      if (typeof requestAnimationFrame === 'function') {
        setTimeout(() => {
          if (pos.attToken && pos.attToken.classList) {
            pos.attToken.classList.remove(lungeCls);
          }
        }, 360);
      }
    }

    // 3. HUD Life Panel Hit Jolt
    if (typeof document.querySelector === 'function' && defenderId) {
      const hudSelector = defenderId === 'p1' ? '.slim-hud-bar.you-accent' : '.slim-hud-bar.cpu-accent';
      const hud = document.querySelector(hudSelector);
      if (hud && hud.classList && spec.tier !== 'guard') {
        hud.classList.remove('hud-hit-jolt');
        hud.classList.add('hud-hit-jolt');
        if (typeof requestAnimationFrame === 'function') {
          setTimeout(() => {
            if (hud && hud.classList) hud.classList.remove('hud-hit-jolt');
          }, 420);
        }
      }
    }

    // 4. Scaled Screen Shake on #app
    if (!reduced && spec.shakeLevel && spec.shakeLevel !== 'none' && typeof document.getElementById === 'function') {
      const app = document.getElementById('app');
      if (app && app.classList) {
        if (shakeTimer) { clearTimeout(shakeTimer); shakeTimer = null; }
        app.classList.remove('screen-shake', 'shake-light', 'shake-medium', 'shake-heavy', 'shake-ultra');
        void app.offsetWidth;
        const shakeCls = `shake-${spec.shakeLevel}`;
        app.classList.add('screen-shake', shakeCls);
        if (typeof requestAnimationFrame === 'function') {
          shakeTimer = setTimeout(() => {
            shakeTimer = null;
            app.classList.remove('screen-shake', shakeCls);
          }, spec.shakeLevel === 'ultra' ? 560 : 420);
        }
      }
    }
  }

  function drawStarPolygon(c, cx, cy, spikes, outerR, innerR, rotation) {
    c.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const isOuter = i % 2 === 0;
      const spikeFactor = isOuter ? ((i % 4 === 0) ? 1.0 : 0.72) : 1.0;
      const r = (isOuter ? outerR : innerR) * spikeFactor;
      const a = rotation + (i * Math.PI) / spikes;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (i === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
    c.closePath();
  }

  function drawHexagon(c, cx, cy, r) {
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 - Math.PI / 6;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (i === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
    c.closePath();
  }

  function renderCanvasFrame() {
    if (!ctx2d || !canvas) return;
    const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2);
    ctx2d.save();
    ctx2d.setTransform(1, 0, 0, 1, 0, 0);
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    ctx2d.scale(dpr, dpr);

    const vw = canvas.width / dpr;
    const vh = canvas.height / dpr;

    // 1. Impact Flashes & Radial Blooms
    ctx2d.globalCompositeOperation = 'lighter';
    for (const f of flashes) {
      if (f.age < 0) continue;
      const t = Math.min(1, f.age / f.duration);
      const alpha = Math.pow(1 - t, 1.8);
      if (f.screenTint > 0 && t < 0.35) {
        ctx2d.fillStyle = f.color;
        ctx2d.globalAlpha = f.screenTint * (1 - t / 0.35);
        ctx2d.fillRect(0, 0, vw, vh);
      }
      const rad = Math.max(4, f.radius * (0.45 + 0.75 * Math.sin(t * Math.PI * 0.65)));
      const grad = ctx2d.createRadialGradient(f.x, f.y, 2, f.x, f.y, rad);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.35, f.color);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx2d.globalAlpha = alpha;
      ctx2d.fillStyle = grad;
      ctx2d.beginPath();
      ctx2d.arc(f.x, f.y, rad, 0, Math.PI * 2);
      ctx2d.fill();
    }

    // 2. Shockwave Rings / Hexagonal Guard Barrier
    for (const r of rings) {
      if (r.age < 0) continue;
      const t = Math.min(1, r.age / r.duration);
      const easeOut = 1 - Math.pow(1 - t, 3);
      const rad = r.startRadius + (r.endRadius - r.startRadius) * easeOut;
      const alpha = Math.pow(1 - t, 1.4);

      ctx2d.save();
      ctx2d.globalAlpha = alpha;
      ctx2d.strokeStyle = r.color;
      ctx2d.lineWidth = Math.max(1, r.lineWidth * (1 - t * 0.65));
      if (r.dashed) ctx2d.setLineDash([12, 8]);
      if (r.hexShield) {
        drawHexagon(ctx2d, r.x, r.y, rad);
      } else {
        ctx2d.beginPath();
        ctx2d.arc(r.x, r.y, rad, 0, Math.PI * 2);
      }
      ctx2d.stroke();
      ctx2d.restore();
    }

    // 3. Radial Speed Lines
    for (const l of speedLines) {
      if (l.age < 0) continue;
      const t = Math.min(1, l.age / l.duration);
      const ease = 1 - Math.pow(1 - t, 2.4);
      const r1 = l.innerR + (l.outerR - l.innerR) * Math.min(1, t * 1.25);
      const r2 = l.innerR + (l.outerR - l.innerR) * ease;
      ctx2d.globalAlpha = (1 - t) * 0.9;
      ctx2d.strokeStyle = l.color;
      ctx2d.lineWidth = l.width * (1 - t * 0.5);
      ctx2d.lineCap = 'round';
      ctx2d.beginPath();
      ctx2d.moveTo(l.x + Math.cos(l.angle) * r1, l.y + Math.sin(l.angle) * r1);
      ctx2d.lineTo(l.x + Math.cos(l.angle) * r2, l.y + Math.sin(l.angle) * r2);
      ctx2d.stroke();
    }

    // 4. Directional Slash Streaks
    for (const s of slashes) {
      if (s.age < 0) continue;
      const t = Math.min(1, s.age / s.duration);
      const expand = t < 0.25 ? (t / 0.25) : 1;
      const decay = t < 0.25 ? 1 : (1 - (t - 0.25) / 0.75);
      const halfL = (s.length * 0.5) * (0.4 + 0.6 * expand);
      const halfW = s.thickness * Math.pow(decay, 1.3);

      ctx2d.save();
      ctx2d.translate(s.x, s.y);
      ctx2d.rotate(s.angle);
      ctx2d.globalAlpha = Math.max(0, decay);

      // Outer colored blade
      ctx2d.fillStyle = s.color;
      ctx2d.beginPath();
      ctx2d.moveTo(-halfL, 0);
      ctx2d.quadraticCurveTo(0, -halfW, halfL, 0);
      ctx2d.quadraticCurveTo(0, halfW, -halfL, 0);
      ctx2d.closePath();
      ctx2d.fill();

      // Inner white-hot spine
      ctx2d.fillStyle = s.core;
      ctx2d.beginPath();
      ctx2d.moveTo(-halfL * 0.82, 0);
      ctx2d.quadraticCurveTo(0, -halfW * 0.42, halfL * 0.82, 0);
      ctx2d.quadraticCurveTo(0, halfW * 0.42, -halfL * 0.82, 0);
      ctx2d.closePath();
      ctx2d.fill();
      ctx2d.restore();
    }

    // 5. Anime Starbursts
    for (const b of starbursts) {
      if (b.age < 0) continue;
      const t = Math.min(1, b.age / b.duration);
      const pop = t < 0.22 ? (t / 0.22) : (1 - (t - 0.22) / 0.78);
      const outer = b.outerRadius * (0.35 + 0.75 * Math.sin(Math.min(1, t * 1.4) * Math.PI * 0.5));
      const inner = b.innerRadius * Math.max(0.08, pop);

      ctx2d.save();
      ctx2d.globalAlpha = Math.max(0, Math.pow(1 - t, 1.2));
      ctx2d.fillStyle = b.primary;
      drawStarPolygon(ctx2d, b.x, b.y, b.spikes, outer, inner, b.rotation);
      ctx2d.fill();

      ctx2d.fillStyle = b.core;
      drawStarPolygon(ctx2d, b.x, b.y, b.spikes, outer * 0.58, inner * 0.55, b.rotation);
      ctx2d.fill();
      ctx2d.restore();
    }

    // 6. Jagged Lightning Bolts
    for (const bolt of bolts) {
      if (bolt.age < 0 || !bolt.points || bolt.points.length < 2) continue;
      const t = Math.min(1, bolt.age / bolt.duration);
      ctx2d.save();
      ctx2d.globalAlpha = Math.pow(1 - t, 1.3);
      ctx2d.lineJoin = 'miter';
      ctx2d.lineCap = 'round';

      ctx2d.strokeStyle = bolt.color;
      ctx2d.lineWidth = 4.2 * (1 - t * 0.5);
      ctx2d.beginPath();
      bolt.points.forEach((pt, idx) => {
        if (idx === 0) ctx2d.moveTo(pt.x, pt.y);
        else ctx2d.lineTo(pt.x, pt.y);
      });
      ctx2d.stroke();

      ctx2d.strokeStyle = bolt.core;
      ctx2d.lineWidth = 1.6 * (1 - t * 0.4);
      ctx2d.stroke();
      ctx2d.restore();
    }

    // 7. Particles (Spark Streakers, Embers, Tumbling Polygon Shards)
    for (const p of particles) {
      if (p.age < 0) continue;
      const t = Math.min(1, p.age / p.duration);
      const alpha = Math.pow(1 - t, 1.35);
      ctx2d.save();
      ctx2d.globalAlpha = alpha;

      if (p.kind === 'streak') {
        const dx = p.x - p.prevX;
        const dy = p.y - p.prevY;
        const tailX = p.x - dx * p.tailMul;
        const tailY = p.y - dy * p.tailMul;
        ctx2d.strokeStyle = p.color;
        ctx2d.lineWidth = Math.max(1, p.size * (1 - t * 0.55));
        ctx2d.lineCap = 'round';
        ctx2d.beginPath();
        ctx2d.moveTo(tailX, tailY);
        ctx2d.lineTo(p.x, p.y);
        ctx2d.stroke();

        ctx2d.fillStyle = '#ffffff';
        ctx2d.beginPath();
        ctx2d.arc(p.x, p.y, Math.max(0.8, p.size * 0.45), 0, Math.PI * 2);
        ctx2d.fill();
      } else if (p.kind === 'ember') {
        const r = Math.max(1, p.size * (1 - t * 0.4));
        ctx2d.fillStyle = p.color;
        ctx2d.beginPath();
        ctx2d.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx2d.fill();
      } else if (p.kind === 'shard') {
        ctx2d.translate(p.x, p.y);
        ctx2d.rotate(p.rotation);
        const s = Math.max(1.5, p.size * (1 - t * 0.45));
        ctx2d.fillStyle = p.color;
        ctx2d.strokeStyle = p.core;
        ctx2d.lineWidth = 1.1;

        if (p.shape === 'star') {
          drawStarPolygon(ctx2d, 0, 0, 5, s, s * 0.42, 0);
        } else if (p.shape === 'triangle') {
          ctx2d.beginPath();
          ctx2d.moveTo(0, -s);
          ctx2d.lineTo(s * 0.88, s * 0.72);
          ctx2d.lineTo(-s * 0.88, s * 0.72);
          ctx2d.closePath();
        } else {
          ctx2d.beginPath();
          ctx2d.moveTo(0, -s);
          ctx2d.lineTo(s * 0.62, 0);
          ctx2d.lineTo(0, s);
          ctx2d.lineTo(-s * 0.62, 0);
          ctx2d.closePath();
        }
        ctx2d.fill();
        ctx2d.stroke();
      }
      ctx2d.restore();
    }

    ctx2d.restore();
  }

  function advanceCollection(list, dtMs) {
    for (let i = list.length - 1; i >= 0; i--) {
      const item = list[i];
      item.age += dtMs;
      if (item.age >= item.duration) {
        list.splice(i, 1);
      }
    }
  }

  function stepFrame(dtMsInput) {
    const dtMs = Math.max(1, Math.min(64, Number(dtMsInput) || 16.67));
    const dtSec = dtMs / 1000;
    const frameDragScale = dtMs / 16.67;

    advanceCollection(flashes, dtMs);
    advanceCollection(rings, dtMs);
    advanceCollection(speedLines, dtMs);
    advanceCollection(slashes, dtMs);
    advanceCollection(bolts, dtMs);

    for (let i = starbursts.length - 1; i >= 0; i--) {
      const b = starbursts[i];
      b.age += dtMs;
      b.rotation += (b.rotSpeed || 0) * dtSec;
      if (b.age >= b.duration) starbursts.splice(i, 1);
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dtMs;
      if (p.age >= p.duration) {
        particles.splice(i, 1);
        continue;
      }
      p.prevX = p.x;
      p.prevY = p.y;
      const damp = Math.pow(p.drag || 0.92, frameDragScale);
      p.vx *= damp;
      p.vy = p.vy * damp + (p.gravity || 0) * dtSec;
      p.x += p.vx * dtSec;
      p.y += p.vy * dtSec;
      if (p.rotation != null && p.angularVel) {
        p.rotation += p.angularVel * dtSec;
      }
    }

    renderCanvasFrame();
    return activeObjectCount();
  }

  function activeObjectCount() {
    return particles.length + starbursts.length + slashes.length + rings.length + speedLines.length + bolts.length + flashes.length;
  }

  function ensureAnimationLoop() {
    if (typeof requestAnimationFrame !== 'function') {
      renderCanvasFrame();
      return;
    }
    if (rafId != null) return;
    lastFrameTs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const tick = (nowTs) => {
      const now = nowTs || ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now());
      const dt = Math.max(4, Math.min(50, now - lastFrameTs));
      lastFrameTs = now;
      const remaining = stepFrame(dt);
      if (remaining > 0) {
        rafId = requestAnimationFrame(tick);
      } else {
        rafId = null;
        if (ctx2d && canvas) {
          ctx2d.save();
          ctx2d.setTransform(1, 0, 0, 1, 0, 0);
          ctx2d.clearRect(0, 0, canvas.width, canvas.height);
          ctx2d.restore();
        }
      }
    };
    rafId = requestAnimationFrame(tick);
  }

  function isDuplicateTrigger(dedupKey, windowMs = 1350) {
    if (!dedupKey) return false;
    const now = Date.now();
    for (const [k, ts] of recentTriggers.entries()) {
      if (now - ts > 3000) recentTriggers.delete(k);
    }
    const prev = recentTriggers.get(dedupKey);
    if (prev && (now - prev) < windowMs) return true;
    recentTriggers.set(dedupKey, now);
    return false;
  }

  function enrichFromLastStrikeInfo(opts = {}) {
    const out = { ...opts };
    const engine = opts.engine || (typeof G !== 'undefined' && G && G.engine) || null;
    const info = engine && engine.lastStrikeInfo;
    const attackerId = out.attackerId || out.actor || null;
    if (!out.defenderId && attackerId) {
      out.defenderId = attackerId === 'p1' ? 'p2' : 'p1';
    }
    if (!out.roundNum && engine) {
      out.roundNum = engine.roundNum || 0;
    }
    if (info && info.sides && attackerId && info.sides[attackerId]) {
      const side = info.sides[attackerId];
      if (!out.cardName && side.cardName) out.cardName = side.cardName;
      if (out.isEX == null) out.isEX = !!side.isEX;
      if (out.criticalPaid == null) out.criticalPaid = !!side.criticalPaid;
      if (!out.cardType && side.cardKey && typeof SimulateStrikePreview !== 'undefined' && SimulateStrikePreview.resolveCardByKey) {
        const def = SimulateStrikePreview.resolveCardByKey(side.cardKey);
        if (def && def.type) out.cardType = def.type;
      }
    }
    if (info && Array.isArray(info.timeline) && attackerId) {
      const tlHit = info.timeline.find(s => s.phase === 'hit' && s.actor === attackerId);
      if (tlHit) {
        if (out.guardBroken == null) out.guardBroken = !!tlHit.guardBroken;
        if (out.confirmedLethal == null) out.confirmedLethal = !!tlHit.confirmedLethal;
        if (out.effectiveArmor == null && tlHit.effectiveArmor != null) out.effectiveArmor = tlHit.effectiveArmor;
      }
    }
    return out;
  }

  function triggerHit(rawOpts = {}) {
    const opts = enrichFromLastStrikeInfo(rawOpts);
    const kind = opts.kind || 'hit';
    const defenderId = opts.defenderId || opts.who || (opts.actor === 'p1' ? 'p2' : 'p1');
    const attackerId = opts.attackerId || opts.actor || (defenderId === 'p1' ? 'p2' : 'p1');
    const dmg = Math.max(0, Number(opts.damage != null ? opts.damage : (opts.amount != null ? opts.amount : 0)) || 0);

    if (!opts.skipDedup) {
      const dedupKey = `${opts.roundNum || 0}:${kind}:${attackerId}:${defenderId}:${dmg}`;
      if (isDuplicateTrigger(dedupKey)) return lastBurst;
    }

    const spec = classifyHitTier({ ...opts, kind, damage: dmg });
    ensureOverlaySurface();
    const pos = (opts.x != null && opts.y != null)
      ? {
          x: Number(opts.x),
          y: Number(opts.y),
          attX: Number(opts.attX != null ? opts.attX : opts.x - 140),
          attY: Number(opts.attY != null ? opts.attY : opts.y),
          dirX: opts.dirX || (defenderId === 'p2' ? 1 : -1),
          defToken: null,
          attToken: null,
          defCell: null,
        }
      : resolveCombatPositions(defenderId, attackerId);

    spawnCanvasBurst(pos.x, pos.y, pos.attX, pos.attY, pos.dirX, spec);
    applyDomImpactChoreography(pos, spec, defenderId, attackerId);
    ensureAnimationLoop();

    totalBursts++;
    lastBurst = {
      id: totalBursts,
      kind,
      tier: spec.tier,
      headline: spec.headline,
      subline: spec.subline,
      dmgLabel: spec.dmgLabel,
      damage: dmg,
      attackerId,
      defenderId,
      x: pos.x,
      y: pos.y,
      dirX: pos.dirX,
      particleCount: spec.particleCount,
      shardCount: spec.shardCount,
      slashCount: spec.slashCount,
      ringCount: spec.ringCount,
      boltCount: spec.boltCount,
    };
    return lastBurst;
  }

  function triggerGuardBreak(opts = {}) {
    const stunnedId = opts.stunnedPlayerId || opts.who || 'p2';
    const attackerId = stunnedId === 'p1' ? 'p2' : 'p1';
    return triggerHit({
      ...opts,
      kind: 'stun',
      defenderId: stunnedId,
      attackerId,
      damage: opts.damageDealt || opts.amount || 0,
      guardBroken: true,
    });
  }

  function triggerExceed(opts = {}) {
    const playerId = opts.playerId || opts.who || 'p1';
    let characterName = '';
    if (opts.characterKey && typeof CHARACTERS !== 'undefined' && CHARACTERS[opts.characterKey]) {
      characterName = CHARACTERS[opts.characterKey].name || '';
    }
    return triggerHit({
      ...opts,
      kind: 'exceed',
      defenderId: playerId,
      attackerId: playerId,
      characterName,
    });
  }

  function triggerFromFx(fx, engine) {
    if (!fx || !fx.kind) return null;
    if (fx.kind === 'hit' || fx.kind === 'damage') {
      return triggerHit({
        ...fx,
        kind: 'hit',
        defenderId: fx.defenderId || fx.who,
        attackerId: fx.attackerId || (fx.who === 'p1' ? 'p2' : 'p1'),
        damage: fx.amount != null ? fx.amount : fx.damage,
        engine,
      });
    }
    if (fx.kind === 'stun') {
      return triggerGuardBreak({
        ...fx,
        stunnedPlayerId: fx.who,
        engine,
      });
    }
    if (fx.kind === 'armor') {
      return triggerHit({
        ...fx,
        kind: 'armor',
        defenderId: fx.who,
        attackerId: fx.who,
        damage: fx.amount || 0,
        engine,
      });
    }
    if (fx.kind === 'exceed') {
      return triggerExceed({
        ...fx,
        playerId: fx.who,
        engine,
      });
    }
    return null;
  }

  function clearCallouts() {
    if (calloutLayer) calloutLayer.innerHTML = '';
  }

  function clear() {
    if (rafId != null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(rafId);
    }
    rafId = null;
    particles.length = 0;
    starbursts.length = 0;
    slashes.length = 0;
    rings.length = 0;
    speedLines.length = 0;
    bolts.length = 0;
    flashes.length = 0;
    recentTriggers.clear();
    clearCallouts();
    if (ctx2d && canvas) {
      ctx2d.save();
      ctx2d.setTransform(1, 0, 0, 1, 0, 0);
      ctx2d.clearRect(0, 0, canvas.width, canvas.height);
      ctx2d.restore();
    }
  }

  function getState() {
    return {
      totalBursts,
      lastBurst,
      activeCount: activeObjectCount(),
      particles: particles.length,
      starbursts: starbursts.length,
      slashes: slashes.length,
      rings: rings.length,
      speedLines: speedLines.length,
      bolts: bolts.length,
      flashes: flashes.length,
    };
  }

  if (typeof EventBus !== 'undefined') {
    EventBus.on('OnStrikeHit', (payload) => {
      if (!payload) return;
      triggerHit({
        kind: 'hit',
        actor: payload.actor,
        attackerId: payload.actor,
        defenderId: payload.defenderId || (payload.actor === 'p1' ? 'p2' : 'p1'),
        damage: payload.damage != null ? payload.damage : 0,
        effectivePower: payload.effectivePower,
        effectiveArmor: payload.effectiveArmor,
        effectiveGuard: payload.effectiveGuard,
        guardBroken: payload.guardBroken,
        confirmedLethal: payload.confirmedLethal,
        cardName: payload.cardName,
        cardType: payload.cardType,
        isEX: payload.isEX,
        criticalPaid: payload.criticalPaid,
      });
    });
    EventBus.on('OnGuardBreak', (payload) => {
      if (!payload) return;
      triggerGuardBreak(payload);
    });
    EventBus.on('OnExceedActivated', (payload) => {
      if (!payload) return;
      triggerExceed(payload);
    });
  }

  return {
    classifyHitTier,
    computeCalloutPosition,
    triggerHit,
    triggerGuardBreak,
    triggerExceed,
    triggerFromFx,
    stepFrame,
    clear,
    clearCallouts,
    getState,
  };
})();

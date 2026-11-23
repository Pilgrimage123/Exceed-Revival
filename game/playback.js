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
          EventBus.emit('OnStrikeHit', { actor: step.actor, damage: step.damageDealt || 0 });
          if (step.confirmedLethal) {
            EventBus.emit('OnLethalDetected', { winnerId: step.actor });
            showConfirmedLethalCallout('CHECKMATE');
          }
        } else if (step.phase === 'stunned') {
          EventBus.emit('OnGuardBreak', { stunnedPlayerId: step.actor });
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

// Procedural Web Audio API SFX synthesizer + swappable asset-override registry.
// Subscribes to EventBus; zero external audio assets required to run offline.

const AudioManager = (() => {
  let ctx = null;
  let masterGain = null;
  let bgmEl = null;
  const assetOverrides = new Map();
  const lastCueTime = new Map();

  function ensureCtx() {
    if (typeof window === 'undefined') return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      masterGain = ctx.createGain();
      masterGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const muted = typeof UXSettings !== 'undefined' && UXSettings.get('muted');
    const vol = typeof UXSettings !== 'undefined' ? (UXSettings.get('volume') ?? 0.65) : 0.65;
    if (masterGain) masterGain.gain.value = muted ? 0 : vol;
    return ctx;
  }

  function isDebounced(cueId, cooldownMs = 65) {
    const now = Date.now();
    const prev = lastCueTime.get(cueId) || 0;
    if (now - prev < cooldownMs) return true;
    lastCueTime.set(cueId, now);
    return false;
  }

  function registerAudioAsset(cueId, urlOrAudio) {
    assetOverrides.set(cueId, urlOrAudio);
  }

  function playOverride(cueId) {
    const item = assetOverrides.get(cueId);
    if (!item) return false;
    try {
      const a = typeof item === 'string' ? new Audio(item) : item.cloneNode();
      const muted = typeof UXSettings !== 'undefined' && UXSettings.get('muted');
      const vol = typeof UXSettings !== 'undefined' ? (UXSettings.get('volume') ?? 0.65) : 0.65;
      a.volume = muted ? 0 : vol;
      a.play().catch(() => {});
      return true;
    } catch (_) {
      return false;
    }
  }

  function tone(freq, dur, type = 'sine', gainVal = 0.25, endFreq = null, delay = 0) {
    const c = ensureCtx();
    if (!c || !masterGain) return;
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq != null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + dur);
    g.gain.setValueAtTime(gainVal, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noiseBurst(dur, gainVal = 0.2, filterFreq = 1200, delay = 0) {
    const c = ensureCtx();
    if (!c || !masterGain) return;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    const g = c.createGain();
    g.gain.value = gainVal;
    src.connect(filter);
    filter.connect(g);
    g.connect(masterGain);
    src.start(c.currentTime + delay);
  }

  function duckBgm(seconds = 0.3) {
    if (!bgmEl) return;
    const baseVol = typeof UXSettings !== 'undefined' ? (UXSettings.get('volume') ?? 0.65) : 0.65;
    bgmEl.volume = baseVol * 0.25;
    setTimeout(() => {
      if (bgmEl) bgmEl.volume = (typeof UXSettings !== 'undefined' && UXSettings.get('muted')) ? 0 : baseVol;
    }, seconds * 1000);
  }

  function setBgmTrack(url) {
    if (typeof Audio === 'undefined') return;
    if (bgmEl) { bgmEl.pause(); bgmEl = null; }
    if (!url) return;
    bgmEl = new Audio(url);
    bgmEl.loop = true;
    bgmEl.volume = (typeof UXSettings !== 'undefined' && UXSettings.get('muted')) ? 0 : (UXSettings.get('volume') ?? 0.65);
    bgmEl.play().catch(() => {});
  }

  const cues = {
    hoverTick() {
      if (isDebounced('hoverTick', 60)) return;
      if (!playOverride('hoverTick')) tone(720, 0.035, 'triangle', 0.08, 520);
    },
    targetLock() {
      if (isDebounced('targetLock', 70)) return;
      if (!playOverride('targetLock')) {
        tone(880, 0.06, 'sine', 0.14);
        tone(1320, 0.08, 'sine', 0.12, null, 0.045);
      }
    },
    forcePitch(hasUltra) {
      if (!playOverride('forcePitch')) {
        const base = hasUltra ? 660 : 440;
        tone(base, 0.14, 'triangle', 0.18, base * 1.5);
        if (hasUltra) tone(990, 0.18, 'sine', 0.14, 1320, 0.05);
      }
    },
    exceedActivate() {
      if (!playOverride('exceedActivate')) {
        noiseBurst(0.18, 0.25, 2400);
        tone(220, 0.35, 'sawtooth', 0.16, 440);
        tone(330, 0.4, 'triangle', 0.16, 660, 0.08);
        tone(440, 0.45, 'sine', 0.2, 880, 0.16);
      }
    },
    deckReshuffle() {
      if (!playOverride('deckReshuffle')) {
        tone(110, 0.6, 'sine', 0.28, 75);
        tone(165, 0.45, 'triangle', 0.14, 110, 0.04);
      }
    },
    strikeReveal() {
      if (!playOverride('strikeReveal')) noiseBurst(0.12, 0.18, 1600);
    },
    speedResolved(tie) {
      if (!playOverride('speedResolved')) {
        if (tie) {
          tone(1040, 0.16, 'square', 0.14, 780);
          tone(1380, 0.14, 'triangle', 0.14, 920, 0.03);
        } else {
          tone(600, 0.11, 'sawtooth', 0.14, 1400);
        }
      }
    },
    guardHeld() {
      if (!playOverride('guardHeld')) {
        tone(130, 0.14, 'triangle', 0.24, 80);
        tone(260, 0.16, 'sine', 0.1, 320, 0.04);
      }
    },
    guardBreak() {
      if (!playOverride('guardBreak')) {
        noiseBurst(0.24, 0.32, 2800);
        tone(120, 0.35, 'sawtooth', 0.28, 38);
      }
    },
    strikeHit(dmg) {
      if (dmg <= 0) { cues.guardHeld(); return; }
      if (!playOverride('strikeHit')) {
        if (dmg <= 3) {
          noiseBurst(0.08, 0.18, 1100);
          tone(190, 0.09, 'triangle', 0.2, 80);
        } else if (dmg <= 6) {
          noiseBurst(0.14, 0.26, 900);
          tone(140, 0.16, 'sawtooth', 0.25, 55);
        } else {
          noiseBurst(0.22, 0.35, 700);
          tone(95, 0.35, 'sine', 0.35, 32);
          duckBgm(0.3);
        }
      }
    },
    koFinish() {
      if (!playOverride('koFinish')) {
        tone(80, 0.7, 'sawtooth', 0.3, 28);
        tone(523, 0.45, 'triangle', 0.2, 261, 0.08);
      }
      if (bgmEl) { bgmEl.pause(); }
    },
  };

  if (typeof EventBus !== 'undefined') {
    EventBus.on('OnCardHoverStart', () => cues.hoverTick());
    EventBus.on('OnTargetLockChanged', (p) => { if (p && p.locked) cues.targetLock(); });
    EventBus.on('OnForcePitched', (p) => cues.forcePitch(!!(p && p.hasUltra)));
    EventBus.on('OnExceedActivated', () => cues.exceedActivate());
    EventBus.on('OnDeckReshuffled', () => cues.deckReshuffle());
    EventBus.on('OnStrikeReveal', () => cues.strikeReveal());
    EventBus.on('OnSpeedResolved', (p) => cues.speedResolved(!!(p && p.tie)));
    EventBus.on('OnGuardBreak', () => cues.guardBreak());
    EventBus.on('OnStrikeHit', (p) => cues.strikeHit(p ? p.damage : 1));
    EventBus.on('OnLethalDetected', () => cues.koFinish());
  }

  return { registerAudioAsset, setBgmTrack, duckBgm, cues };
})();

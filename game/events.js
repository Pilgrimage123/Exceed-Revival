// Decoupled Event Bus / Observer Pattern for UI telegraphs, playback, and audio cues.
// Loaded in global script scope before engine.js, preview.js, and UI modules.

const EventBus = (() => {
  const EVENT_SCHEMAS = Object.freeze({
    OnCardHoverStart: { required: [] },
    OnCardHoverEnd: { required: [] },
    OnTargetLockChanged: { required: [] },
    OnToggleEXMode: { required: [] },
    OnToggleOptionalBranch: { required: [] },
    OnToggleCriticalPreview: { required: [] },
    OnNeutralAction: { required: ['playerId'] },
    OnForcePitched: { required: ['playerId'] },
    OnExceedActivated: { required: ['playerId'] },
    OnDeckReshuffled: { required: ['playerId'] },
    OnStrikePhase: { required: ['phase'] },
    OnStrikeReveal: { required: ['strikeInfo'] },
    OnSpeedResolved: { required: ['playerId'] },
    OnStrikeHit: { required: ['playerId'] },
    OnLethalDetected: { required: ['playerId'] },
    OnGuardBreak: { required: ['playerId'] },
    OnStrikePlaybackEnd: { required: [] },
  });
  const EVENT_NAMES = Object.freeze(Object.keys(EVENT_SCHEMAS));
  const listeners = new Map();

  function isKnownEvent(event) {
    return Object.prototype.hasOwnProperty.call(EVENT_SCHEMAS, event);
  }

  function on(event, handler) {
    if (typeof handler !== 'function') return () => {};
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(handler);
    return () => off(event, handler);
  }

  function off(event, handler) {
    const set = listeners.get(event);
    if (set) set.delete(handler);
  }

  function emit(event, payload) {
    const set = listeners.get(event);
    if (!set || set.size === 0) return;
    for (const fn of [...set]) {
      try {
        fn(payload);
      } catch (err) {
        if (typeof console !== 'undefined' && console.error) {
          console.error(`[EventBus:${event}]`, err);
        }
      }
    }
  }

  function clear(event) {
    if (event) listeners.delete(event);
    else listeners.clear();
  }

  return { EVENT_SCHEMAS, EVENT_NAMES, isKnownEvent, on, off, emit, clear };
})();

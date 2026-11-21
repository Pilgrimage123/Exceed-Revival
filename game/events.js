// Decoupled Event Bus / Observer Pattern for UI telegraphs, playback, and audio cues.
// Loaded in global script scope before engine.js, preview.js, and UI modules.

const EventBus = (() => {
  const listeners = new Map();

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

  return { on, off, emit, clear };
})();

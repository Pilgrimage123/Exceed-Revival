// Native CPU bridge. It is intentionally synchronous at the decision boundary: the
// WASM module is loaded before a match starts, and a missing/failed module always
// falls straight through to the battle-tested JS planner.
//
// The backend contract is deliberately tiny so the browser, native CLI, and fuzz
// harness share a protocol without leaking mutable Engine/Player objects across it.
const NativeCpuAI = (() => {
  const PROTOCOL_VERSION = 1;
  let mode = 'classic';
  let backend = null;
  let lastError = null;

  const validActions = new Set(['strike', 'exceed', 'burst', 'action', 'changecards', 'move', 'boost', 'prepare', 'reshuffle']);

  function setMode(nextMode) {
    if (nextMode !== 'classic' && nextMode !== 'modern') throw new Error(`Unknown CPU mode: ${nextMode}`);
    mode = nextMode;
    return status();
  }

  function registerBackend(candidate) {
    if (!candidate || candidate.protocolVersion !== PROTOCOL_VERSION || typeof candidate.chooseNeutralAction !== 'function') {
      throw new Error(`Native CPU backend must implement protocol v${PROTOCOL_VERSION}`);
    }
    backend = candidate;
    lastError = null;
    return status();
  }

  function status() {
    return Object.freeze({ mode, ready: !!backend, protocolVersion: PROTOCOL_VERSION, lastError });
  }

  function chooseNeutralAction(snapshot) {
    if (mode !== 'modern' || !backend) return null;
    try {
      const action = backend.chooseNeutralAction(snapshot);
      if (!action || !validActions.has(action.type)) throw new Error('backend returned an invalid neutral action');
      return action;
    } catch (error) {
      // The fallback is intentional product behavior, not an exceptional game state.
      lastError = String(error && error.message || error);
      return null;
    }
  }

  function decisionSnapshot(me, opp, canExceed) {
    return Object.freeze({
      protocolVersion: PROTOCOL_VERSION,
      actor: {
        characterKey: me.characterKey, life: me.life, maxLife: me.maxLife || 30,
        pos: me.pos, handCount: me.hand.length, handKeys: me.hand.map(card => card.key),
        deckCount: me.deck.length, gaugeKeys: me.gauge.map(card => card.key),
        discardKeys: me.discard.map(card => card.key), boostKeys: me.boostsInPlay.map(entry => entry.card.key),
        exceeded: !!me.exceeded, reshuffleUsed: !!me.reshuffleUsed,
      },
      opponent: {
        characterKey: opp.characterKey, life: opp.life, maxLife: opp.maxLife || 30,
        pos: opp.pos, handCount: opp.handCount, deckCount: opp.deckCount,
        gaugeKeys: opp.gauge.slice(), discardKeys: opp.discard.slice(), boostKeys: opp.boostsInPlay.slice(),
        exceeded: !!opp.exceeded, reshuffleUsed: !!opp.reshuffleUsed,
      },
      canExceed: !!canExceed,
    });
  }

  // Canonical state traces are the only input to differential fuzzing. They contain
  // public state plus the acting player's private cards, never the opponent's hand.
  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === 'object') {
      const out = {};
      for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
      return out;
    }
    return value;
  }

  function canonicalTraceHash(trace) {
    const json = JSON.stringify(canonicalize(trace));
    let hash = 0xcbf29ce484222325n;
    for (let i = 0; i < json.length; i++) {
      hash ^= BigInt(json.charCodeAt(i));
      hash = BigInt.asUintN(64, hash * 0x100000001b3n);
    }
    return hash.toString(16).padStart(16, '0');
  }

  return Object.freeze({ PROTOCOL_VERSION, setMode, registerBackend, status, decisionSnapshot, chooseNeutralAction, canonicalize, canonicalTraceHash });
})();

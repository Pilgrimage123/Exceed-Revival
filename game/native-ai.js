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

  function chooseStrikeAction(snapshot) {
    if (mode !== 'modern' || !backend || typeof backend.chooseStrikeAction !== 'function') return null;
    try {
      const action = backend.chooseStrikeAction(snapshot);
      if (!action || (action.kind !== 'single' && action.kind !== 'ex' && action.kind !== 'wild_swing')) {
        throw new Error('backend returned an invalid strike action');
      }
      return action;
    } catch (error) {
      lastError = String(error && error.message || error);
      return null;
    }
  }

  function chooseDefenseAction(snapshot) {
    if (mode !== 'modern' || !backend || typeof backend.chooseDefenseAction !== 'function') return null;
    try {
      const action = backend.chooseDefenseAction(snapshot);
      if (!action || (action.kind !== 'single' && action.kind !== 'ex' && action.kind !== 'wild_swing')) {
        throw new Error('backend returned an invalid defense action');
      }
      return action;
    } catch (error) {
      lastError = String(error && error.message || error);
      return null;
    }
  }

  function mapPublicPlayer(p, isActor) {
    const overdrive = Array.isArray(p.overdrive) ? p.overdrive.map(c => (typeof c === 'string' ? c : c.key)) : [];
    const sealed = Array.isArray(p.sealed) ? p.sealed.map(c => (typeof c === 'string' ? c : c.key)) : [];
    const base = {
      characterKey: p.characterKey,
      life: p.life,
      maxLife: p.maxLife || 30,
      pos: p.pos,
      handCount: isActor ? p.hand.length : p.handCount,
      deckCount: isActor ? p.deck.length : p.deckCount,
      gaugeKeys: (p.gauge || []).map(c => (typeof c === 'string' ? c : c.key)),
      discardKeys: (p.discard || []).map(c => (typeof c === 'string' ? c : c.key)),
      boostKeys: (p.boostsInPlay || []).map(entry => (typeof entry === 'string' ? entry : entry.card.key)),
      exceeded: !!p.exceeded,
      reshuffleUsed: !!p.reshuffleUsed,
      overdriveKeys: overdrive,
      sealedKeys: sealed,
      eddiePos: p.eddiePos !== undefined ? p.eddiePos : null,
    };
    if (isActor) {
      base.handKeys = (p.hand || []).map(c => c.key);
      base.knownDeckTop = Array.isArray(p.knownDeckTop) ? p.knownDeckTop.slice() : [];
      base.knownDeckBottom = Array.isArray(p.knownDeckBottom) ? p.knownDeckBottom.slice() : [];
    }
    return base;
  }

  function decisionSnapshot(me, opp, canExceed, opts) {
    const extra = opts || {};
    return Object.freeze({
      protocolVersion: PROTOCOL_VERSION,
      seed: Number.isInteger(extra.seed) ? extra.seed : 0,
      turnNumber: Number.isInteger(extra.turnNumber) ? extra.turnNumber : 0,
      activePlayer: extra.activePlayer === 'opponent' ? 'opponent' : 'actor',
      actor: mapPublicPlayer(me, true),
      opponent: mapPublicPlayer(opp, false),
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

  function encodeUtf8(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
      let code = str.charCodeAt(i);
      if (code < 0x80) { bytes.push(code); }
      else if (code < 0x800) { bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f)); }
      else if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
        const next = str.charCodeAt(++i);
        code = 0x10000 + (((code & 0x3ff) << 10) | (next & 0x3ff));
        bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      } else {
        bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      }
    }
    return bytes;
  }

  function canonicalTraceHash(trace) {
    const bytes = encodeUtf8(JSON.stringify(canonicalize(trace)));
    let hash = 0xcbf29ce484222325n;
    for (let i = 0; i < bytes.length; i++) {
      hash ^= BigInt(bytes[i]);
      hash = BigInt.asUintN(64, hash * 0x100000001b3n);
    }
    return hash.toString(16).padStart(16, '0');
  }

  return Object.freeze({
    PROTOCOL_VERSION,
    setMode,
    registerBackend,
    status,
    decisionSnapshot,
    chooseNeutralAction,
    chooseStrikeAction,
    chooseDefenseAction,
    canonicalize,
    canonicalTraceHash,
  });
})();

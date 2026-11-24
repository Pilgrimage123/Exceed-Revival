// ============================================================
// UI CONTROLLER — wires engine + ai to the DOM
// ============================================================
// `var` (not `let`) is deliberate: classic <script> tags share one global lexical
// scope in real browsers either way, but `var` also attaches to the global object,
// which matters for Node vm-based testing (see /docs/HANDOFF.md — Pitfall #1).
var G = null; // global game controller instance

function cardNameForKey(key) {
  const c = (typeof _cardByKeyMap !== 'undefined' && _cardByKeyMap.get(key)) || allCardDefs().find(x => x.key === key);
  return c ? c.name : key;
}

// Roster helper — every playable character key, in a stable order (object key order,
// which is insertion order for string keys). Used anywhere the code needs "the full
// roster" instead of assuming exactly two characters exist.
function rosterKeys() { return Object.keys(CHARACTERS); }

// Sagat's Innate/Exceed applies to any attack he sets; Happy Chaos's Steady Aim is the
// one card in the GG set whose own text grants it, so the character field may be a
// predicate instead of a boolean.
function canGoFaceUpWith(char, card) {
  if (!char || !char.canGoFaceUp) return false;
  return typeof char.canGoFaceUp === 'function' ? !!char.canGoFaceUp(card) : true;
}

// ---------------- Coach tips: per-decision help, shown once ----------------
// Every human decision in this game is a named `G.mode` (see paint() in render.js),
// which makes the mode name the natural key for "explain this decision" help. These
// three functions own whether a given tip is currently expanded; render.js only reads
// coachExpanded() and calls toggleCoach() from a click, because render.js must stay
// pure (HANDOFF.md §3 — no state mutation inside paint).
//
// "Seen" is persisted in localStorage so the tips stop reappearing across sessions,
// with an in-memory mirror as the fallback: the headless test DOM stub has no
// localStorage at all, and a real browser can still throw on access to it (private
// mode, disabled storage), so every access is wrapped rather than feature-detected once.
const COACH_STORAGE_PREFIX = 'exceedCoachSeen:';
const _coachSeenMemory = {};
const _coachOverride = {};    // explicit player toggles this session; beats both rules below
let _coachActiveKey = null;   // the mode whose tip is currently on screen

function _coachStorage() {
  try { return (typeof localStorage !== 'undefined' && localStorage) ? localStorage : null; }
  catch (e) { return null; }
}
function coachSeen(key) {
  if (_coachSeenMemory[key]) return true;
  const store = _coachStorage();
  if (!store) return false;
  try { return !!store.getItem(COACH_STORAGE_PREFIX + key); } catch (e) { return false; }
}
function markCoachSeen(key) {
  if (!key) return;
  _coachSeenMemory[key] = true;
  const store = _coachStorage();
  if (!store) return;
  try { store.setItem(COACH_STORAGE_PREFIX + key, '1'); } catch (e) { /* storage full/blocked — memory mirror is enough */ }
}
// A tip is marked seen when the player LEAVES that mode, not when it is first painted.
// Painting is not reading: several modes repaint many times while the player is still
// deciding (selecting cards, stepping a stepper), and collapsing the explanation
// underneath them mid-decision is exactly the wrong moment.
function coachExpanded(key) {
  if (_coachActiveKey !== key) {
    markCoachSeen(_coachActiveKey);
    _coachActiveKey = key;
  }
  if (Object.prototype.hasOwnProperty.call(_coachOverride, key)) return _coachOverride[key];
  if (G && G.beginner) return true;
  return !coachSeen(key);
}
function toggleCoach(key) {
  const wasExpanded = coachExpanded(key);
  _coachOverride[key] = !wasExpanded;
  if (wasExpanded) markCoachSeen(key);
  if (typeof render === 'function') render();
}

class GameController {
  // aiChar: explicit opponent character key. If omitted, picks randomly from the rest
  // of the roster (excluding humanChar) — this is what makes adding a new playable
  // character to CHARACTERS "just work" as a CPU opponent with no ui.js changes.
  // opts: `{ beginner: true }` from shell.html's Quick Start. Defaulted, so every
  // pre-existing 3-argument call site (and HANDOFF.md §8's documented "3 args, in
  // this order" invariant) keeps working unchanged.
  constructor(humanChar, aiChar, difficultyKey, opts = {}) {
    this.humanId = 'p1';
    this.aiId = 'p2';
    if (!aiChar) {
      const others = rosterKeys().filter(k => k !== humanChar);
      aiChar = others.length ? others[Math.floor(Math.random() * others.length)] : humanChar;
    }
    this.difficulty = AI_DIFFICULTIES[difficultyKey] || AI_DIFFICULTIES.champion;
    this.randomness = this.difficulty.randomness;
    this.engine = new Engine(humanChar, aiChar, { p1Name: 'You', p2Name: 'CPU' });
    this.engine.draw(this.engine.P('p1'), 5);
    this.engine.draw(this.engine.P('p2'), 6);
    // Starting-hand bonuses (e.g., Goldlewis draws 2 extra before mulligan)
    const p1Char = CHARACTERS[humanChar];
    const p2Char = CHARACTERS[aiChar];
    if (p1Char && p1Char.onStartingHand) p1Char.onStartingHand(this.engine, this.engine.P('p1'));
    if (p2Char && p2Char.onStartingHand) p2Char.onStartingHand(this.engine, this.engine.P('p2'));
    // Opening-hand mulligan (see engine.performMulligan): human chooses first, via a
    // real UI step; the AI's own mulligan runs automatically right after, before the
    // game's first turn starts.
    this.mode = 'mulligan_select';
    this.sel = { chosen: [] };
    this.infoModal = null; // 'human' | 'ai' | null
    this.deckRefOpen = false;
    // Paced FX playback (see engine.js's fxQueue/FX_ICONS) — deliberately plain
    // fields, not a `G.mode`, so test_headless.js's driver switch (which throws
    // `Unhandled mode:` on anything it doesn't recognize — see HANDOFF.md §5)
    // stays untouched by this feature.
    this.fxPlaying = false;
    this.currentFx = null;
    this._fxTimer = null;
    // ---- Beginner onboarding state ----
    // `beginner` is set by shell.html's Quick Start (startGame's opts argument). It
    // only ever changes PRESENTATION and prompt gating, never a rule: the engine runs
    // the same game either way, so a beginner-mode game is still a real game and
    // nothing here can produce a state the normal path couldn't.
    this.beginner = !!opts.beginner;
    this.studyMode = !!opts.studyMode;
    this.hintText = null;   // filled by suggestMove()/suggestStrike(), shown by render.js
    this.trainerReport = null; // structured Trainer payload for Study Mode
    this.beatIndex = 0;     // how many strike-breakdown beats are revealed
    // Criticals are offered on EVERY set attack, which is one prompt too many before
    // a player has seen a hit land. In beginner mode the prompt is auto-declined
    // until they have both dealt and taken damage — at which point Power, Armor and
    // Guard mean something concrete and "pay 1 Gauge to unlock the red text" can
    // actually be understood. Both flags are needed, so the unlock happens after a
    // real exchange rather than a one-sided one.
    this.beginnerHasDealtDamage = false;
    this.beginnerHasTakenDamage = false;
    this.selectedActionCardUid = null;
    this.showNormalMatrix = false;
    this.rightRailTab = 'log'; // 'log' | 'normals' | 'coach'
    this.mobilePanelTab = 'inspector'; // 'inspector' | 'log' | 'normals' | 'coach' (portrait mobile dock)
    this.rightRailCollapsed = false;
    this.inspectorTarget = null; // { kind: 'card' | 'innate' | 'boost', ... } | null
    this.coachUnreadDot = false;
    this.draggingCardUid = null;
  }

  // True once the beginner-mode Critical prompt should start appearing (always true
  // outside beginner mode — an experienced player gets every prompt from turn one).
  criticalPromptUnlocked() {
    if (!this.beginner) return true;
    return this.beginnerHasDealtDamage && this.beginnerHasTakenDamage;
  }

  // Reads the exchange that just resolved (engine.lastStrikeInfo) to decide whether
  // the beginner has now both dealt and taken damage, which is what unlocks the
  // Critical prompt. Driven off the recorded damage events rather than comparing life
  // totals, because a life change can also come from a Boost or a card effect, and the
  // thing being taught here is specifically what a connecting attack does.
  noteBeginnerDamage() {
    if (!this.beginner) return;
    const info = this.engine.lastStrikeInfo;
    if (!info || !info.events) return;
    for (const evt of info.events) {
      if (evt.type !== 'damage' || !evt.dealt) continue;
      if (evt.attackerId === this.humanId) this.beginnerHasDealtDamage = true;
      if (evt.defenderId === this.humanId) this.beginnerHasTakenDamage = true;
    }
  }

  // ---- Beginner-mode strike breakdown pacing ----
  revealNextBeat() { this.beatIndex++; render(); }
  revealAllBeats() { this.beatIndex = Number.MAX_SAFE_INTEGER; render(); }

  // ---- Trainer & Study Mode ("Suggest a move" / "Suggest a card") ----
  // Runs on a strict human-perspective Information Set (never reading opp.hand).
  // Queries NativeCpuAI.advise() when a Modern Native backend is registered, and
  // otherwise falls back to Classic JS chooseAction/chooseStrikeSelection at randomness=0.
  toggleStudyMode() {
    this.studyMode = !this.studyMode;
    if (this.studyMode) {
      this.rightRailCollapsed = false;
      this.rightRailTab = 'coach';
      this.mobilePanelTab = 'coach';
      this.coachUnreadDot = false;
    }
    render();
  }

  suggestMove(opts = {}) {
    const p = this.human(), opp = this.ai();
    const oppPublic = publicInfoOf(opp);
    const nativeAdvice = (typeof NativeCpuAI !== 'undefined' && NativeCpuAI.advise)
      ? NativeCpuAI.advise('neutral', NativeCpuAI.decisionSnapshot(p, oppPublic, this.engine.canExceed(p), {
          turnNumber: this.engine.turn,
          activePlayer: 'actor',
          myBoostMods: this.engine.activeBoostMods(p),
          oppBoostMods: this.engine.activeBoostMods(opp),
        }))
      : null;
    let action = (nativeAdvice && nativeAdvice.available && nativeAdvice.action && NativeCpuAI.resolveNativeActionToEngineAction)
      ? NativeCpuAI.resolveNativeActionToEngineAction(nativeAdvice.action, p)
      : null;
    if (!action) {
      action = chooseAction({
        me: p, mePublicFull: p, oppPublic,
        canExceed: this.engine.canExceed(p), rng: Math.random, randomness: 0,
        myBoostMods: this.engine.activeBoostMods(p),
      });
    }
    this.hintText = this.describeSuggestion(action, p, opp);
    this.trainerReport = {
      kind: 'neutral',
      text: this.hintText,
      source: (nativeAdvice && nativeAdvice.source) || 'classic',
      diagnostics: (nativeAdvice && nativeAdvice.diagnostics) || null,
      note: (nativeAdvice && nativeAdvice.note) || null,
    };
    if (opts && opts.background) {
      if (this.rightRailTab !== 'coach') this.coachUnreadDot = true;
    } else {
      this.rightRailCollapsed = false;
      this.rightRailTab = 'coach';
      this.mobilePanelTab = 'coach';
      this.coachUnreadDot = false;
    }
    render();
  }

  suggestStrike(isDefense, opts = {}) {
    const p = this.human(), opp = this.ai();
    const oppPublic = publicInfoOf(opp);
    const kind = isDefense ? 'defense' : 'strike';
    const nativeAdvice = (typeof NativeCpuAI !== 'undefined' && NativeCpuAI.advise)
      ? NativeCpuAI.advise(kind, NativeCpuAI.decisionSnapshot(p, oppPublic, this.engine.canExceed(p), {
          turnNumber: this.engine.turn,
          activePlayer: isDefense ? 'opponent' : 'actor',
          myBoostMods: this.engine.activeBoostMods(p),
          oppBoostMods: this.engine.activeBoostMods(opp),
        }))
      : null;
    let selection = (nativeAdvice && nativeAdvice.available && nativeAdvice.action && NativeCpuAI.resolveNativeStrikeToEngineSelection)
      ? NativeCpuAI.resolveNativeStrikeToEngineSelection(nativeAdvice.action, p)
      : null;
    if (!selection) {
      if (p.hand.length === 0) {
        selection = { type: 'wildswing' };
      } else {
        const res = chooseStrikeSelection({
          hand: p.hand, myPos: p.pos, oppPublic, iAmInitiator: !isDefense, rng: Math.random,
          samples: 100, buildExCardFn: (a, b) => this.engine.buildExCard(a, b),
          myBoostMods: this.engine.activeBoostMods(p), randomness: 0,
          myGaugeCount: this.engine.gaugeCount(p), myExceeded: p.exceeded,
          myCharacterKey: p.characterKey, myEddiePos: p.eddiePos,
          meFull: p, turnNumber: this.engine.turn,
        });
        selection = res && res.selection;
      }
    }
    let text = 'Wild Swing (top of deck) — your hand has no stronger Strike option right now.';
    if (selection && selection.type === 'ex') {
      const c = p.hand.find(x => x.uid === selection.uid1);
      text = `Set EX ${c ? c.name : 'pair'} — committing two matching copies for +1 to all stats gives the strongest expected exchange.`;
    } else if (selection && selection.type === 'hand') {
      const c = p.hand.find(x => x.uid === selection.uid);
      text = `Set ${c ? c.name : 'your card'} — best expected Strike value against the opponent's public range and Gauge.`;
    }
    this.hintText = text;
    this.trainerReport = {
      kind,
      text,
      source: (nativeAdvice && nativeAdvice.source) || 'classic',
      diagnostics: (nativeAdvice && nativeAdvice.diagnostics) || null,
      note: (nativeAdvice && nativeAdvice.note) || null,
    };
    if (opts && opts.background) {
      if (this.rightRailTab !== 'coach') this.coachUnreadDot = true;
    } else {
      this.rightRailCollapsed = false;
      this.rightRailTab = 'coach';
      this.mobilePanelTab = 'coach';
      this.coachUnreadDot = false;
    }
    render();
  }

  // Turns chooseAction's `{type, ...}` into a sentence that says WHY, not just what —
  // the reasons are read off the same live state the planner scored, so they stay true
  // as the position changes. Every branch must produce a string with no `undefined` in
  // it (test_headless.js fails the build on a literal "undefined" in rendered HTML).
  describeSuggestion(action, p, opp) {
    const dist = this.engine.range(p, opp);
    switch (action && action.type) {
      case 'strike': {
        const mods = this.engine.activeBoostMods(p);
        const inRange = p.hand.filter(c => isEffectivelyInRange(c, dist, mods)).length;
        return `Strike. At range ${dist} you have ${inRange} card${inRange === 1 ? '' : 's'} that can reach, and a card that hits goes to your Gauge.`;
      }
      case 'move': {
        const target = action.target != null ? action.target : dist;
        return `Move to range ${target} (you are at ${dist}). Moving costs Force — cards out of your hand — so it is buying a better attack, not a free reposition.`;
      }
      case 'boost': {
        const card = p.hand.find(c => c.uid === action.uid);
        return `Boost${card ? ` with ${card.name}` : ''}. Playing it face up for its Boost effect is worth more right now than setting it as an attack.`;
      }
      case 'changecards': {
        const n = Math.min(action.n || 1, p.hand.length);
        return `Change Cards — discard ${n} and draw ${n}. Your hand has no strong answer at range ${dist}, so trade it for one that might.`;
      }
      case 'prepare':
        return `Prepare — just draw a card. Nothing here is worth committing at range ${dist}, and a bigger hand is more Force and more options.`;
      case 'exceed':
        return `Exceed. You can afford it, and your Exceeded ability is stronger for the rest of the game than the Gauge is.`;
      case 'reshuffle':
        return `Reshuffle — your deck is nearly out; shuffle your discard back in before you are forced to Wild Swing off an empty deck.`;
      case 'action':
        return `Use your character action (the ★ button)${action.direction ? ` — ${action.direction}` : ''}. It is free this turn and your other options are worse.`;
      case 'burst':
        return `Use your Burst action — it converts one card into several actions before the opponent moves again.`;
      default:
        return `No clear best move here — Prepare is the safe default.`;
    }
  }

  human() { return this.engine.P(this.humanId); }
  ai() { return this.engine.P(this.aiId); }
  log(msg, kind, who, extra) { this.engine.logMsg(msg, kind, who, extra); }

  // Steps through engine.fxQueue one event at a time, re-rendering (with the
  // board-badge + FLIP-move treatment) between each so the player has a beat to
  // see what happened rather than the whole exchange resolving to its final
  // state in one paint. Under the headless test DOM stub (no querySelectorAll —
  // see test_headless.js) this drains the whole queue synchronously in one
  // paint instead: 200+ scripted games waiting real setTimeout delays for every
  // Strike would make the suite unusably slow, and the stub can't render the
  // animation anyway (see render.js's captureFlipPositions guard).
  playFx() {
    const q = this.engine.fxQueue;
    if (typeof document === 'undefined' || !document.querySelectorAll) {
      q.length = 0;
      this.currentFx = null;
      render();
      return;
    }
    if (this.fxPlaying) return; // a step is already in flight; it will pick up the rest
    this.fxPlaying = true;
    const step = () => {
      if (q.length === 0) {
        this.fxPlaying = false;
        this.currentFx = null;
        this._fxTimer = null;
        render();
        if (this._pendingAiCallback) {
          const cb = this._pendingAiCallback;
          this._pendingAiCallback = null;
          cb();
        }
        return;
      }
      this.currentFx = q.shift();
      render();
      if (typeof HitParticleEngine !== 'undefined' && HitParticleEngine.triggerFromFx) {
        HitParticleEngine.triggerFromFx(this.currentFx, this.engine);
      }
      // Hits get a slightly longer beat than everything else — it's the
      // headline event of an exchange and deserves the extra hold.
      const dur = this.currentFx.kind === 'hit' ? 780 : 520;
      this._fxTimer = setTimeout(step, dur);
    };
    step();
  }

  // Drains the rest of the queue instantly — the "Skip" control render.js's
  // boardHTML shows while fxPlaying is true, for players who don't want to
  // wait out a long exchange's full step-by-step playback.
  skipFx() {
    if (this._fxTimer) { clearTimeout(this._fxTimer); this._fxTimer = null; }
    if (typeof HitParticleEngine !== 'undefined' && HitParticleEngine.clearCallouts) {
      HitParticleEngine.clearCallouts();
    }
    this.engine.fxQueue.length = 0;
    this.fxPlaying = false;
    this.currentFx = null;
    render();
    if (this._pendingAiCallback) {
      const cb = this._pendingAiCallback;
      this._pendingAiCallback = null;
      cb();
    }
  }

  scheduleAITurn(delay) {
    if (this._aiTimer) { clearTimeout(this._aiTimer); this._aiTimer = null; }
    this._pendingAiCallback = null;
    this._aiTimer = setTimeout(() => {
      this._aiTimer = null;
      if (this.fxPlaying) {
        this._pendingAiCallback = () => this.runAITurn();
        return;
      }
      this.runAITurn();
    }, delay);
  }

  // ----- opening-hand mulligan (human) -----
  toggleMulliganCard(uid) {
    this.sel.chosen = this.sel.chosen || [];
    const idx = this.sel.chosen.indexOf(uid);
    if (idx !== -1) this.sel.chosen.splice(idx, 1); else this.sel.chosen.push(uid);
    render();
  }
  confirmMulligan() {
    const uids = this.sel.chosen || [];
    this.engine.performMulligan(this.human(), uids);
    const aiHand = this.ai();
    const aiSetAside = chooseMulliganSetAside(aiHand.hand, Math.random, this.randomness);
    this.engine.performMulligan(aiHand, aiSetAside);
    this.mode = 'awaiting_action';
    this.sel = {};
    render();
  }

  // Used for "name a card" prompts (Block/GG Block's "opponent must discard a
  // copy or reveal") — the pool of card KEYS the opponent could possibly have,
  // which is their own Normals pool (NOT always the base NORMAL_KEYS — Axl uses
  // a totally different set, GG_NORMALS, see cards.js) plus their own Specials/
  // Ultras.
  opponentUniqueKeys(charKey) {
    const char = CHARACTERS[charKey];
    const keys = (char.normals || NORMALS).map(c => c.key);
    for (const c of char.specials) if (!keys.includes(c.key)) keys.push(c.key);
    return keys;
  }

  // ----- fighter info modal -----
  openInfo(who) { this.infoModal = who; render(); }
  closeInfo() { this.infoModal = null; this.deckRefOpen = false; render(); }
  toggleDeckRef() { this.deckRefOpen = !this.deckRefOpen; render(); }

  // Data-driven end-of-turn Revert check (Leo's Exceed: "When you end a turn without Striking, Revert.")
  // Gated strictly on CHARACTERS[key].revertOnNonStrikeTurn so other fighters never revert on non-Strike turns.
  maybeRevertOnNonStrikeEnd(player, isHuman) {
    const char = CHARACTERS[player.characterKey];
    if (char && char.revertOnNonStrikeTurn && player.exceeded && !player.strikeThisTurn) {
      this.engine.doRevert(player);
      this.log(isHuman
        ? 'You Revert to Innate mode (ended turn without Striking).'
        : 'CPU Reverts to Innate mode (ended turn without Striking).');
    }
  }

  // ----- end-of-turn helpers (human) -----
  finishNonStrikeAction() {
    const player = this.human();
    const maxHand = this.engine.getMaxHandSize(player.characterKey);
    this.engine.checkBoostExpiry(player);
    this.engine.endOfTurnDraw(player); // Astral Heat swap / Hakumen's Gauge add live here
    this.log('You end your turn (draw a card).');
    if (player.hand.length > maxHand) {
      this.mode = 'discard_to_seven';
      this.sel = { who: 'human' };
      render();
      return;
    }
    this.maybeRevertOnNonStrikeEnd(player, true);
    this.passOrContinue();
  }

  passOrContinue() {
    const player = this.human();
    // Axl's One Vision burst action: "take 3 actions" — checked BEFORE advantage/
    // alternation, since it means "the SAME player keeps going," overriding
    // whatever would otherwise happen next. Consumed one at a time (not all at
    // once) so each of the 3 actions goes through the normal single-action flow,
    // including its own hand-size check, boost-expiry check, etc. — same as any
    // other turn.
    if (player.extraActionsRemaining > 0) {
      player.extraActionsRemaining -= 1;
      this.engine.checkStartOfTurnExpiry(player);
      this.mode = 'awaiting_action';
      render();
      return;
    }
    if (player.advantage) {
      player.advantage = false;
      this.engine.checkStartOfTurnExpiry(player);
      this.mode = 'awaiting_action';
      render();
    } else {
      this.engine.clearAdvantage();
      this.engine.resetPerTurnFlags(this.ai());
      this.engine.active = this.aiId;
      this.engine.checkStartOfTurnExpiry(this.ai());
      this.startTurnFor(this.aiId, () => {
        this.mode = 'awaiting_action';
        render();
        this.scheduleAITurn(500);
      });
    }
  }

  afterStrike(result) {
    if (this.engine.gameOver) { this.mode = 'game_over'; render(); return; }
    const player = this.engine.P(result.nextActive);
    const maxHand = this.engine.getMaxHandSize(player.characterKey);
    if (player.hand.length > maxHand) {
      this.mode = 'discard_to_seven';
      this.sel = { who: player.id === this.humanId ? 'human' : 'ai' };
      this.pendingNext = result.nextActive;
      render();
      if (player.id === this.aiId) this.aiDiscardToSeven(() => this.continueAfterStrikeDiscard(result.nextActive));
      return;
    }
    this.continueAfterStrikeDiscard(result.nextActive);
  }

  continueAfterStrikeDiscard(nextActive) {
    const player = this.engine.P(nextActive);
    this.engine.resetPerTurnFlags(player); // Reset per-turn one-shot flags (Ky's firstCancelThisTurn, Sol's canceledThisTurn, Leo's strikeThisTurn)
    this.engine.active = nextActive;
    this.startTurnFor(nextActive, () => {
      this.mode = 'awaiting_action';
      render();
      if (nextActive === this.aiId) this.scheduleAITurn(500);
    });
  }

  // Season 5 Overdrive tick (see engine.js's Overdrive section): fires at the top of
  // a player's turn, before they choose an action. Only pauses when the effect is a
  // real choice AND it is the human's turn; every other case resolves inline, so the
  // continuation runs synchronously and the turn flow is unchanged for the other
  // ~20 non-BlazBlue characters.
  startTurnFor(playerId, cont) {
    const player = this.engine.P(playerId);
    const opp = this.engine.P(this.engine.other(playerId));
    const tick = this.engine.beginOverdriveTick(player);
    if (!tick) { cont(); return; }
    if (tick.options && playerId === this.humanId) {
      this.mode = 'overdrive_choice';
      this.sel = { options: tick.options, card: tick.card };
      this.pendingOverdriveDone = cont;
      render();
      return;
    }
    const choiceKey = tick.options
      ? chooseOverdriveOption({ options: tick.options, me: player, oppPublic: publicInfoOf(opp), engine: this.engine, rng: Math.random })
      : null;
    this.engine.resolveOverdriveEffect(player, opp, choiceKey, tick.card);
    if (tick.options) this.log(`CPU's Overdrive: ${(tick.options.find(o => o.key === choiceKey) || {}).label || choiceKey}.`);
    cont();
  }

  resolveOverdriveChoice(choiceKey) {
    const done = this.pendingOverdriveDone;
    this.pendingOverdriveDone = null;
    const card = this.sel && this.sel.card;
    this.engine.resolveOverdriveEffect(this.human(), this.ai(), choiceKey, card);
    this.sel = {};
    if (done) done();
    else { this.mode = 'awaiting_action'; render(); }
  }

  aiDiscardToSeven(cb) {
    const player = this.ai();
    const maxHand = this.engine.getMaxHandSize(player.characterKey);
    const discarded = [];
    while (player.hand.length > maxHand) {
      let worst = player.hand[0];
      for (const c of player.hand) if ((c.pow || 0) < (worst.pow || 0)) worst = c;
      const c = this.engine.discardFromHand(player, worst.uid);
      if (c) discarded.push(c);
    }
    if (discarded.length > 0) this.log(`CPU discards down to ${maxHand} cards: ${discarded.map(c => c.name).join(', ')}.`);
    cb && cb();
  }

  // ----- human action handlers -----
  actionPrepare() {
    const player = this.human();
    this.engine.startRound();
    this.engine.draw(player, 1);
    this.log('You Prepare (draw a card).');
    this.finishNonStrikeAction();
  }

  actionReshuffle() {
    this.engine.startRound();
    this.engine.manualReshuffle(this.human());
    this.finishNonStrikeAction();
  }

  actionExceed() {
    this.engine.startRound();
    const res = this.engine.doExceed(this.human());
    if (res.mayStrike) {
      this.mode = 'char_exceed_strike_choice';
      render();
      return;
    }
    // M. Bison's Exceed: "you may take this action immediately" — same shape as
    // mayStrike above, but for the character action instead of a Strike.
    if (res.mayAction) {
      this.mode = 'char_exceed_action_choice';
      render();
      return;
    }
    this.finishNonStrikeAction();
  }

  // Data-driven "burst" action — see cards.js's `grantsBurstAction` boost flag
  // (currently just Axl's One Vision) and render.js's actionButtons(), which
  // shows this button whenever ANY of the player's own boostsInPlay has it, not
  // hardcoded to Axl or One Vision by key. `boostUid` identifies WHICH boost
  // grants it, in case a player somehow ever had two such boosts active at once.
  actionBurst(boostUid) {
    this.engine.startRound();
    this.engine.useBurstAction(this.human(), boostUid);
    this.finishNonStrikeAction();
  }

  // ----- character action (fully data-driven — see CHARACTERS[key].action in cards.js) -----
  actionSpecial() {
    const player = this.human();
    const char = CHARACTERS[player.characterKey];
    if (!char.action) { this.finishNonStrikeAction(); return; } // no action defined — button shouldn't be reachable, but stay safe
    if (char.action.needsDirection) {
      this.mode = 'special_move1';
      render();
      return;
    }
    if (char.action.needsHandToGaugeChoice) {
      const max = char.action.maxHandToGauge(player);
      this.mode = 'action_gauge_select';
      this.sel = { max, chosen: [] };
      render();
      return;
    }
    // Bang's Innate action: "Look at the top N cards of your deck, draw 1, and
    // discard the other." Reuses the existing deck-look panel in its draw variant
    // (see render.js's decklook_choice and engine.resolveDeckLookChoice's 'draw' mode).
    if (char.action.needsDeckLook) {
      this.engine.startRound();
      const peeked = this.engine.peekTopN(player, char.action.needsDeckLook);
      if (peeked.length === 0) { this.finishNonStrikeAction(); return; }
      if (peeked.length === 1) {
        this.engine.resolveDeckLookChoice(player, this.ai(), peeked, peeked[0].uid, 'draw');
        this.finishNonStrikeAction();
        return;
      }
      this.mode = 'decklook_choice';
      this.sel = { peeked, drawMode: true, title: char.action.label || 'Look at the top cards of your deck', fromCharacterAction: true };
      render();
      return;
    }
    this.runCharacterAction(null);
  }
  toggleActionGaugeCard(uid) {
    const idx = this.sel.chosen.indexOf(uid);
    if (idx !== -1) { this.sel.chosen.splice(idx, 1); render(); return; }
    if (this.sel.chosen.length < this.sel.max) this.sel.chosen.push(uid);
    render();
  }
  confirmActionGaugeSelect() {
    const player = this.human();
    const uids = this.sel.chosen || [];
    if (uids.length === 0) { this.mode = 'awaiting_action'; render(); return; }
    this.engine.startRound();
    const moved = [];
    for (const uid of uids) {
      const idx = player.hand.findIndex(c => c.uid === uid);
      if (idx === -1) continue;
      const [card] = player.hand.splice(idx, 1);
      player.gauge.push(card);
      moved.push(card);
    }
    this.log(`You use your Innate/Exceed action: add ${moved.map(c => c.name).join(', ')} to Gauge, draw ${moved.length}.`);
    this.engine.draw(player, moved.length);
    this.finishNonStrikeAction();
  }

  resolveSpecialMove1(direction) {
    this.runCharacterAction(direction);
  }

  // Some character actions (Baiken, I-No, Jack-O) cost Force to activate (see
  // `CHARACTERS[key].actionForceCost`, paid from hand or Gauge same as Boost/Move) —
  // pause for a picker before actually resolving the action, mirroring
  // pickBoostCard/confirmMove's force-select pattern.
  runCharacterAction(direction) {
    const player = this.human();
    const char = CHARACTERS[player.characterKey];
    const need = char.actionForceCost || 0;
    if (need > 0) {
      this.sel = { direction, need, chosen: [] };
      this.mode = 'action_force_select';
      render();
      return;
    }
    this.executeCharacterAction(direction);
  }
  toggleActionForceCard(uid) {
    const player = this.human();
    const idx = this.sel.chosen.indexOf(uid);
    if (idx !== -1) { this.sel.chosen.splice(idx, 1); render(); return; }
    const card = this.engine.findCardInHandOrGauge(player, uid);
    const val = this.engine.forceValueOfCard(card);
    const current = this.engine.sumForceValue(player, this.sel.chosen);
    if (current + val <= this.sel.need) this.sel.chosen.push(uid);
    render();
  }
  confirmActionForce() {
    const player = this.human();
    const chosen = this.sel.chosen || [];
    if (this.engine.sumForceValue(player, chosen) !== this.sel.need) return;
    this.engine.startRound();
    this.engine.payForceFromHandOrGauge(player, chosen, 'your character action');
    this.executeCharacterAction(this.sel.direction, true);
  }
  executeCharacterAction(direction, roundAlreadyStarted) {
    const player = this.human(), opp = this.ai();
    const char = CHARACTERS[player.characterKey];
    if (!roundAlreadyStarted) this.engine.startRound();
    const res = char.action.resolve(this.engine, player, opp, direction) || {};
    this.log(`You use ${player.exceeded ? 'Exceeded' : 'Innate'} action: ${charActionLabel(player)}${direction ? ` (${direction})` : ''}`);
    if (res.mayStrike) { this.mode = 'char_exceed_strike_choice'; render(); return; }
    if (res.triggersStrike) {
      player.actionStrikeThisTurn = true; // Mark that this Strike came from a character action
      this.startStrike();
      return;
    }
    this.finishNonStrikeAction();
  }

  // ----- Move action -----
  startMove() { this.selectedActionCardUid = null; this.mode = 'move_setup'; this.sel = { dir: null, spaces: 0 }; render(); }
  setMoveDir(dir) {
    const player = this.human(), opp = this.ai();
    const maxSpaces = this.engine.maxUsefulSpaces(player, opp, dir);
    this.sel = { dir, spaces: Math.min(1, maxSpaces), maxSpaces };
    render();
  }
  adjustMoveSpaces(delta) {
    const player = this.human(), opp = this.ai();
    let s = this.sel.spaces + delta;
    s = Math.max(1, Math.min(this.sel.maxSpaces, s));
    const forceNeeded = this.forceForMove(player, opp, this.sel.dir, s);
    if (forceNeeded > player.hand.length + player.gauge.length) return;
    this.sel.spaces = s;
    render();
  }
  forceForMove(player, opp, dir, spaces) {
    if (dir === 'advance') return this.engine.simulateAdvance(player.pos, opp.pos, spaces).force;
    return spaces;
  }
  // Confirming direction+spaces moves into a force-payment picker (cards can come from
  // hand OR gauge, player's choice) rather than auto-discarding the first N hand cards.
  confirmMove() {
    const player = this.human(), opp = this.ai();
    const force = this.forceForMove(player, opp, this.sel.dir, this.sel.spaces);
    this.sel = { ...this.sel, force, chosen: [] };
    if (force > 0) { this.mode = 'move_force_select'; render(); return; }
    this.executeMove();
  }
  toggleMoveForceCard(uid) {
    const player = this.human();
    const idx = this.sel.chosen.indexOf(uid);
    if (idx !== -1) { this.sel.chosen.splice(idx, 1); render(); return; }
    const card = this.engine.findCardInHandOrGauge(player, uid);
    const val = this.engine.forceValueOfCard(card);
    const current = this.engine.sumForceValue(player, this.sel.chosen);
    if (current + val <= this.sel.force) this.sel.chosen.push(uid);
    render();
  }
  confirmMoveForce() { this.executeMove(); }
  executeMove() {
    const player = this.human(), opp = this.ai();
    const chosen = this.sel.chosen || [];
    if (this.engine.sumForceValue(player, chosen) !== this.sel.force) { this.mode = 'awaiting_action'; render(); return; }
    this.engine.startRound();
    this.engine.payForceFromHandOrGauge(player, chosen, 'your Move');
    if (this.sel.dir === 'advance') this.engine.advanceSelfPaid(player, opp, this.sel.spaces);
    else this.engine.retreatSelfPaid(player, opp, this.sel.spaces);
    this.log(`You ${this.sel.dir} ${this.engine.spaceWord(this.sel.spaces)}, spending ${this.sel.force} Force.`, 'move', this.humanId, { amount: this.sel.spaces });
    this.finishNonStrikeAction();
  }

  // ----- Change Cards -----
  // The pool is hand + Gauge, not hand alone: Change Cards pays Force, and Gauge is a
  // legal Force source (rulebook, "Force Generation"). `n` counts CARDS to spend; how
  // many are DRAWN is their Force value, which is not the same number once an Ultra
  // (worth 2) or Guile's Innate is involved — render.js shows the projected draw.
  changeCardsPoolSize() { const p = this.human(); return p.hand.length + p.gauge.length; }
  startChangeCards() { this.selectedActionCardUid = null; this.mode = 'changecards_setup'; this.sel = { n: Math.min(1, this.changeCardsPoolSize()) }; render(); }
  adjustChangeCards(delta) {
    this.sel.n = Math.max(1, Math.min(this.changeCardsPoolSize(), this.sel.n + delta));
    render();
  }
  // Confirming the count moves into a picker (mirrors Move/Boost's force-select
  // pattern) rather than auto-discarding whichever n cards happen to be first in
  // hand-array order.
  confirmChangeCards() {
    this.sel = { n: this.sel.n, chosen: [] };
    this.mode = 'changecards_select';
    render();
  }
  toggleChangeCard(uid) {
    const idx = this.sel.chosen.indexOf(uid);
    if (idx !== -1) { this.sel.chosen.splice(idx, 1); render(); return; }
    if (this.sel.chosen.length < this.sel.n) this.sel.chosen.push(uid);
    render();
  }
  confirmChangeCardsSelect() {
    const player = this.human();
    const n = this.sel.n;
    const uids = this.sel.chosen || [];
    if (uids.length !== n) return;
    this.engine.startRound();
    // Single shared implementation in the engine (see performChangeCards) — this used
    // to be duplicated here and in the AI branch, which is how the two drifted from
    // the rulebook in the same way twice.
    const res = this.engine.performChangeCards(player, uids);
    this.log(`You Change Cards: spend ${res.forceValue} Force (${res.spent.map(c => c.name).join(', ')}), draw ${res.drawn}.`);
    // Guile's Exceed: "If you spent Gauge this way, you may then Strike (after drawing
    // cards)." Offered as a real choice through the existing may_strike_choice mode
    // rather than auto-Striking, since Striking ends the turn and can be wrong.
    const char = CHARACTERS[player.characterKey];
    if (res.spentFromGauge > 0 && char && char.mayStrikeAfterChangeCards && char.mayStrikeAfterChangeCards(player)) {
      this.sel = {};
      this.mode = 'may_strike_choice';
      render();
      return;
    }
    this.finishNonStrikeAction();
  }

  // ----- Critical (see engine.canPayCritical / cards.js's header comment for the
  // full rule) — human-facing prompt. `hideCardName` is used for Wild Swing: the
  // player is committing to pay (or not) on an unrevealed top-of-deck card, exactly
  // as blind as the real rule requires, so the prompt must not name it.
  maybeAskCritical(player, card, hideCardName, onDone) {
    // Vega's Bloody High Claw boost ("your attacks are Critical", always-on
    // free) and C. Viper's Exceeded Innate rider ("If you [Strike after a
    // Continuous Boost], your attack is Critical", one-shot, set via
    // this.pendingFreeCritical right before the triggering startStrike()
    // call) both bypass the normal pay-1-Gauge prompt entirely.
    if (this.pendingFreeCritical || this.engine.hasFreeCriticalBoost(player)) {
      this.pendingFreeCritical = false;
      onDone(true);
      return;
    }
    if (!this.engine.canPayCritical(player)) { onDone(false); return; }
    // Beginner mode: decline silently until the player has been through a real
    // exchange (see criticalPromptUnlocked). Declining is the no-op answer — not
    // paying is what "Critical" costs nothing and does nothing — so skipping the
    // prompt cannot change the game state, only how many questions turn 1 asks.
    if (!this.criticalPromptUnlocked()) { onDone(false); return; }
    this.mode = 'critical_choice';
    this.sel = { card, hideCardName: !!hideCardName };
    this.pendingCriticalDone = onDone;
    render();
  }
  resolveCriticalChoice(pay) {
    const done = this.pendingCriticalDone;
    this.pendingCriticalDone = null;
    if (pay) {
      const player = this.human();
      const spent = this.engine.spendGauge(player, 1);
      player.discard.push(...spent);
      const named = (this.sel && this.sel.card && !this.sel.hideCardName) ? ` on ${this.sel.card.name}` : '';
      this.log(`You pay 1 Gauge for Critical${named}.`);
    }
    if (done) done(!!pay);
  }

  // ----- Boost action (handles Block/Focus naming) -----
  startBoost() { this.selectedActionCardUid = null; this.mode = 'boost_select'; this.sel = {}; render(); }
  pickBoostCard(uid) {
    const player = this.human();
    const card = player.hand.find(c => c.uid === uid);
    if (!card || !card.boost) { this.mode = 'awaiting_action'; render(); return; }
    const need = this.engine.cardBoostForce(card);
    this.sel = { cardUid: uid, need, chosen: [] };
    if (need > 0) { this.mode = 'boost_force_select'; render(); return; }
    this.afterBoostForcePaid();
  }
  toggleForceCard(uid) {
    const player = this.human();
    const idx = this.sel.chosen.indexOf(uid);
    if (idx !== -1) { this.sel.chosen.splice(idx, 1); render(); return; }
    const card = this.engine.findCardInHandOrGauge(player, uid);
    const val = this.engine.forceValueOfCard(card);
    const current = this.engine.sumForceValue(player, this.sel.chosen);
    if (current + val <= this.sel.need) this.sel.chosen.push(uid);
    render();
  }
  confirmBoostForce() { this.afterBoostForcePaid(); }

  afterBoostForcePaid() {
    const player = this.human();
    const card = player.hand.find(c => c.uid === this.sel.cardUid);
    if (card.boost.needsNameChoice) {
      const pool = this.opponentUniqueKeys(this.ai().characterKey);
      this.mode = 'name_choice';
      this.sel = { ...this.sel, namePool: pool, promptText: `Name a card (Block): if ${this.ai().name} has it, it's discarded.` };
      return render();
    }
    if (card.boost.needsNormalNameChoice) {
      // Named card must come from the DEFENDER's (the opponent, who'll be forced
      // to Strike with it) own Normals pool — not always the base NORMAL_KEYS;
      // see the opponentUniqueKeys comment above for why (Axl's is a completely
      // different set, GG_NORMALS).
      const pool = (CHARACTERS[this.ai().characterKey].normals || NORMALS).map(c => c.key);
      this.mode = 'name_choice';
      this.sel = { ...this.sel, namePool: pool, promptText: 'Name a Normal (Focus Reading): your opponent must defend with it, or reveal their hand.' };
      return render();
    }
    if (card.boost.needsRangeNameChoice) {
      this._namedRange = 1;
      this.mode = 'name_range_choice';
      this.sel = { ...this.sel, promptText: 'Name a Range (Flying Power Bomb): opponent must discard a card that includes it, or reveal their hand.' };
      return render();
    }
    if (card.boost.needsBoostTargetChoice) {
      // Only actually prompt when there's a real choice — 0 targets means Dive does
      // nothing (doBoost proceeds, engine.discardOpponentContinuousBoost no-ops on an
      // empty array), 1 target means there's nothing to choose between, matching the
      // "up to X auto-resolves" convention used elsewhere for degenerate single-option
      // cases in this codebase.
      const targets = this.ai().boostsInPlay;
      if (targets.length > 1) {
        this.mode = 'boost_target_choice';
        this.sel = { ...this.sel, boostTargets: targets.map(b => ({ uid: b.card.uid, name: b.card.name })) };
        return render();
      }
    }
    // GG Cross's boost: "Push or Pull 2..." — a genuine direction choice (unlike
    // most Push/Pull-2 effects elsewhere in this codebase, which are Hit-time and
    // already yield-based; this is a Boost-time choice, resolved up front via
    // `extra` the same way namedCardKey/namedRange/targetBoostUid above are).
    if (card.boost.needsPushPullChoice) {
      this.mode = 'push_pull_choice';
      this.sel = { ...this.sel, promptText: `Push or Pull 2 (${card.name})?` };
      return render();
    }
    // Zato-1's Invite Hell boost: "Place Eddie in any space." — same up-front-choice
    // shape again, answered with a board space instead of a direction.
    if (card.boost.needsEddieSpaceChoice) {
      this.mode = 'eddie_space_choice';
      this.sel = { ...this.sel, spaces: this.engine.eddiePlacementSpaces(player, card, true), promptText: `Place Eddie (${card.name}).` };
      return render();
    }
    // Rainwater's boost: "Now: Advance or Retreat 1." — same up-front-choice shape.
    if (card.boost.needsDirectionChoice) {
      this.mode = 'move_direction_choice';
      this.sel = { ...this.sel, promptText: `Advance or Retreat 1 (${card.name})?` };
      return render();
    }
    // Winter Mantis's boost: "Spend up to 2 Force. For each spent, Push 1 and
    // draw 2." — a SEPARATE, optional force picker from the normal boost-cost
    // one above (which already ran, and for this card is always 0 — see
    // GG_NORMALS/AXL's header comments on the GGST set's {0}-cost boosts). Only
    // actually prompts if the player has any spendable Force at all; 0 available
    // just skips straight through with nothing spent, same "don't prompt for a
    // degenerate choice" precedent as needsBoostTargetChoice above.
    if (card.boost.optionalForceSpend) {
      const maxAllowed = card.boost.optionalForceSpend.max;
      const pool = [...player.hand, ...player.gauge];
      const capacity = pool.reduce((s, c) => s + this.engine.forceValueOfCard(c), 0);
      if (capacity > 0) {
        this.mode = 'boost_bonus_force_select';
        this.sel = { ...this.sel, bonusMax: Math.min(maxAllowed, capacity), bonusChosen: [] };
        return render();
      }
    }
    // Sickle Storm's boost: "Look at the top 3 cards of your deck..." — a whole
    // separate flow (see startDeckLookChoice) rather than the `extra`-param
    // pattern the others above use, since it needs to peek cards from the deck
    // BEFORE presenting any choice at all, and its resolution can lead to either
    // a Boost OR a Strike rather than always finishing the same way.
    if (card.boost.needsDeckLookChoice) {
      return this.startDeckLookChoice(card.boost.peekCount || 3);
    }
    this.doBoost(this.sel.cardUid, this.sel.chosen, null);
  }
  pickNamedKey(key) { this.doBoost(this.sel.cardUid, this.sel.chosen, key); }
  pickNamedRange(n) { this.doBoost(this.sel.cardUid, this.sel.chosen, null, n); }
  pickBoostTarget(uid) { this.doBoost(this.sel.cardUid, this.sel.chosen, null, null, uid); }
  pickPushPullDirection(dir) { this.doBoost(this.sel.cardUid, this.sel.chosen, null, null, null, dir); }
  pickMoveDirection(dir) {
    // Check if this is a Cancel-triggered movement (from Ky) or a boost movement
    if (this.sel.pendingCancelDone !== undefined) {
      // Cancel-from-Ky case: just apply the movement and return to awaiting_action
      const player = this.human(), opp = this.ai();
      if (dir === 'advance') this.engine.advanceSelf(player, opp, 1, true);
      else this.engine.retreatSelf(player, opp, 1);
      this.log(`You ${dir} 1.`, 'move', this.humanId, { amount: 1 });
      this.mode = 'awaiting_action';
      delete this.sel.pendingCancelDone;
      render();
      return;
    }
    // Normal boost case
    this.doBoost(this.sel.cardUid, this.sel.chosen, null, null, null, null, dir);
  }
  toggleBonusForceCard(uid) {
    const player = this.human();
    const idx = this.sel.bonusChosen.indexOf(uid);
    if (idx !== -1) { this.sel.bonusChosen.splice(idx, 1); render(); return; }
    const card = player.hand.find(c => c.uid === uid) || player.gauge.find(c => c.uid === uid);
    const val = this.engine.forceValueOfCard(card);
    const current = this.engine.sumForceValue(player, this.sel.bonusChosen);
    if (current + val <= this.sel.bonusMax) this.sel.bonusChosen.push(uid);
    render();
  }
  confirmBonusForce() { this.doBoost(this.sel.cardUid, this.sel.chosen, null, null, null, null, null, this.sel.bonusChosen); }
  pickEddieSpace(pos) { this.doBoost(this.sel.cardUid, this.sel.chosen, null, null, null, null, null, null, Number(pos)); }

  doBoost(uid, forceUids, namedKey, namedRange, targetBoostUid, pushPullDirection, moveDirection, bonusForceUids, eddieSpace) {
    const player = this.human(), opp = this.ai();
    this.engine.startRound();
    const extra = { namedCardKey: namedKey, namedRange, targetBoostUid, pushPullDirection, moveDirection, bonusForceUids, eddieSpace };
    const res = this.engine.playBoost(player, opp, uid, forceUids, extra);
    if (!res.ok) {
      // nothing actually happened — drop the empty round header we just logged.
      this.engine.log.pop();
      this.engine.roundNum--;
      this.mode = 'awaiting_action'; render(); return;
    }
    const afterRetreatChoice = () => {
      if (res.bonusAction) { this.log('You get to take another action.'); this.mode = 'awaiting_action'; render(); return; }
      if (res.triggersStrike) { this.startStrike(); return; }
      if (res.mayTriggerStrike) { this.maybeAskMayStrike(res.freeCriticalOnFollowupStrike, () => this.maybeAskCancel(player, res.card, () => this.finishNonStrikeAction())); return; }
      this.maybeAskCancel(player, res.card, () => this.finishNonStrikeAction());
    };
    // Chun-Li's Innate: "After you resolve a Boost, you may Retreat 1" — before any
    // follow-up Strike this Boost might trigger, per her own printed clarification
    // ("If you would Strike, retreat first").
    const continuation = () => this.maybeAskRetreatAfterBoost(player, opp, afterRetreatChoice);
    if (this.handlePendingRangeDiscard(continuation)) return; // paused, waiting on human choice
    continuation();
  }
  maybeAskRetreatAfterBoost(player, opp, onDone) {
    const char = CHARACTERS[player.characterKey];
    if (!char.mayRetreatAfterBoost) { onDone(); return; }
    this.mode = 'retreat_after_boost_choice';
    this.pendingRetreatAfterBoostDone = onDone;
    render();
  }
  resolveRetreatAfterBoostChoice(wantsRetreat) {
    const done = this.pendingRetreatAfterBoostDone;
    this.pendingRetreatAfterBoostDone = null;
    if (wantsRetreat) {
      const player = this.human(), opp = this.ai();
      this.engine.retreatSelf(player, opp, 1);
      this.log('You retreat 1 (Innate).', 'move', this.humanId, { amount: 1 });
    }
    if (done) done();
  }

  // ----- C. Viper's Innate/Exceed: "After you resolve a Continuous Boost,
  // you may Strike [; if Exceeded, that attack is Critical]." -----
  maybeAskMayStrike(freeCritical, onDecline) {
    this.mode = 'may_strike_choice';
    this.sel = { freeCritical };
    this.pendingMayStrikeDecline = onDecline;
    render();
  }
  resolveMayStrikeChoice(wantsStrike) {
    const decline = this.pendingMayStrikeDecline;
    this.pendingMayStrikeDecline = null;
    if (wantsStrike) {
      if (this.sel && this.sel.freeCritical) this.pendingFreeCritical = true;
      this.startStrike();
      return;
    }
    if (decline) decline(); else this.finishNonStrikeAction();
  }

  // ----- Cancel (GGST-set mechanic — see cards.js's GG_NORMALS/AXL header
  // comments for the exact source wording) — "After resolving a cancellable
  // Boost, you may spend 1 Gauge to take another action." Only offered when
  // `card.boost.cancelable` is set AND the player actually has Gauge to spend;
  // otherwise skips straight to `onDone` with no prompt, same "don't ask about
  // a choice that isn't really available" precedent as
  // needsBoostTargetChoice's 0/1-target skip elsewhere in this file. Modeled
  // directly on the pre-existing `bonusAction` mechanism (Ryu's One Inch Punch:
  // "Move 1, then take another action") — Cancel is the SAME "loop straight
  // back to awaiting_action, skip the normal end-of-turn draw/expiry-check/
  // hand-limit housekeeping for this hop" behavior, just gated behind paying
  // Gauge instead of being unconditional. Deliberately NOT built on the
  // `extraActionsRemaining` mechanism One Vision's burst action uses — that
  // one explicitly runs the normal single-action housekeeping between each of
  // its 3 chained actions (matching "take 3 actions" reading as 3 real turns'
  // worth), which is a different behavior from One Inch Punch's existing
  // precedent that Cancel is deliberately kept consistent with instead.
  // Because this just loops back to 'awaiting_action' without any counter, a
  // NEW cancelable Boost played next re-enters this same check on its own —
  // chaining an unlimited number of Cancels falls out for free, matching "no
  // hard limit... as long as you have Gauge for each one."
  maybeAskCancel(player, card, onDone) {
    if (!card.boost.cancelable || this.engine.gaugeCount(player) < 1) { onDone(); return; }
    this.mode = 'cancel_choice';
    this.sel = { cardName: card.name };
    this.pendingCancelDone = onDone;
    render();
  }
  resolveCancelChoice(wantsCancel) {
    const done = this.pendingCancelDone;
    this.pendingCancelDone = null;
    if (wantsCancel) {
      const player = this.human();
      const opponent = this.ai();
      const spent = this.engine.spendGauge(player, 1);
      player.discard.push(...spent);
      player.canceledThisTurn = true; // Sol Badguy's Innate/Exceed cares about this
      const hookResult = this.engine.triggerOnCancelHooks(player, opponent); // Chipp, Ky: respond to Cancel
      this.log('You spend 1 Gauge to Cancel \u2014 take another action.');
      // Ky's Cancel may offer a movement choice
      if (hookResult && hookResult.needsMovementChoice) {
        this.mode = 'move_direction_choice';
        this.sel = { ...this.sel, promptText: `Advance or Retreat ${hookResult.moveAmount}?`, pendingCancelDone: done };
        render();
        return;
      }
      this.mode = 'awaiting_action';
      render();
      return;
    }
    if (done) done(); else this.finishNonStrikeAction();
  }

  // ----- Zangief's Flying Power Bomb: "Name a Range" boost follow-up -----
  // When 2+ opponent cards match the named Range, `engine.pendingRangeDiscard`
  // gets set (see engine.playBoost/cards.js's resolve()) instead of resolving
  // immediately, because boosts (unlike Strikes) aren't generator/yield-based.
  // This bridges that gap at the UI layer: if it's the AI's own hand to choose
  // from, resolve it immediately via a heuristic (no pause needed — the AI has no
  // "waiting for input" concept); if it's the HUMAN's hand, pause the flow (same
  // shape as the discard-to-seven follow-up) and show a real choice, resuming
  // `continuation` only after they pick. Returns true if the flow was paused.
  handlePendingRangeDiscard(continuation) {
    const pending = this.engine.pendingRangeDiscard;
    if (!pending) return false;
    if (pending.playerId === this.aiId) {
      const aiPlayer = this.ai();
      const matchingCards = pending.matchingUids.map(uid => aiPlayer.hand.find(c => c.uid === uid)).filter(Boolean);
      const uid = chooseRangeDiscard(matchingCards, Math.random);
      if (uid) this.engine.resolvePendingRangeDiscard(uid);
      else this.engine.pendingRangeDiscard = null; // matching card already gone somehow — don't get stuck
      return false;
    }
    const humanPlayer = this.human();
    const matchingCards = pending.matchingUids.map(uid => humanPlayer.hand.find(c => c.uid === uid)).filter(Boolean);
    this.mode = 'range_discard_choice';
    this.sel = { matchingCards, namedRange: pending.namedRange };
    this.pendingRangeDiscardContinuation = continuation;
    render();
    return true;
  }
  resolveRangeDiscardChoice(uid) {
    this.engine.resolvePendingRangeDiscard(uid);
    const cont = this.pendingRangeDiscardContinuation;
    this.pendingRangeDiscardContinuation = null;
    if (cont) cont(); else this.finishNonStrikeAction();
  }

  // ----- Sickle Storm's boost: deck-peek-and-choose -----
  // "Look at the top 3 cards of your deck. You may Boost or Strike with one of
  // them. Discard the rest." Sickle Storm ITSELF is played as a normal one-shot
  // boost first (its own `resolve()` doesn't exist — `needsDeckLookChoice` is
  // the whole effect — so this just pays its always-{0} Force cost and discards
  // the card, same as any other bare one-shot boost with nothing bespoke to do).
  // THEN the peek/choice happens as a follow-up, independent of that.
  startDeckLookChoice(n) {
    const player = this.human(), opp = this.ai();
    const res = this.engine.playBoost(player, opp, this.sel.cardUid, this.sel.chosen, null);
    if (!res.ok) {
      this.engine.log.pop();
      this.engine.roundNum--;
      this.mode = 'awaiting_action'; render(); return;
    }
    const peeked = this.engine.peekTopN(player, n);
    this.mode = 'decklook_choice';
    this.sel = { peeked };
    render();
  }
  // `chosenUid` null means "discard all"; `mode` is 'boost'|'strike'|null.
  confirmDeckLookChoice(chosenUid, mode) {
    const player = this.human(), opp = this.ai();
    const peeked = this.sel.peeked;
    const result = this.engine.resolveDeckLookChoice(player, opp, peeked, chosenUid, mode);
    if (result.struckWith) {
      // Reuses doHumanStrike as-is via the `{type:'decklook', card}` selection
      // shape resolveStrikeCardSelection already supports (see engine.js) — same
      // critical-payment prompt, same aiChooseDefense call, same everything a
      // normal hand-picked Strike gets.
      this.doHumanStrike({ type: 'decklook', card: result.struckWith });
      return;
    }
    const bRes = result.boostResult;
    if (bRes && bRes.ok) {
      // Mirror doBoost's full continuation order (range discard -> retreat -> bonusAction -> triggersStrike -> mayTriggerStrike -> cancel).
      const afterRetreatChoice = () => {
        if (bRes.bonusAction) { this.log('You get to take another action.'); this.mode = 'awaiting_action'; render(); return; }
        if (bRes.triggersStrike) { this.startStrike(); return; }
        if (bRes.mayTriggerStrike) { this.maybeAskMayStrike(bRes.freeCriticalOnFollowupStrike, () => this.maybeAskCancel(player, bRes.card, () => this.finishNonStrikeAction())); return; }
        this.maybeAskCancel(player, bRes.card, () => this.finishNonStrikeAction());
      };
      const continuation = () => this.maybeAskRetreatAfterBoost(player, opp, afterRetreatChoice);
      if (this.handlePendingRangeDiscard(continuation)) return;
      continuation();
      return;
    }
    this.finishNonStrikeAction();
  }

  // ----- Strike action (with EX support + Reading constraint) -----
  startStrike() { this.selectedActionCardUid = null; this.mode = 'strike_select'; this.sel = {}; render(); }
  pickStrikeCard(uid) { this.doHumanStrike({ type: 'hand', uid }); }
  pickExStrike(uid1, uid2) { this.doHumanStrike({ type: 'ex', uid1, uid2 }); }
  pickWildSwing() { this.doHumanStrike({ type: 'wildswing' }); }

  doHumanStrike(choice) {
    const human = this.human(), ai = this.ai();
    const aSel = this.engine.resolveStrikeCardSelection(human, choice);
    if (!aSel) {
      if (this.engine.gameOver) { this.mode = 'game_over'; render(); return; }
      this.mode = 'strike_select'; render(); return;
    }
    const hideCardName = choice.type === 'wildswing';
    const afterFaceUp = () => {
      this.maybeAskCritical(human, aSel.card, hideCardName, (paid) => {
        aSel.criticalPaid = paid;
        const dSel = this.aiChooseDefense(ai, human);
        if (!dSel) { this.mode = 'game_over'; render(); return; }
        const gaugePay = { [this.humanId]: !!aSel.criticalPaid, [this.aiId]: !!dSel.criticalPaid };
        human.strikeThisTurn = true; // Leo's Exceed: track that player struck this turn (for "Revert when you end a turn without Striking")
        const gen = this.engine.resolveStrikeSteps({ initiator: this.humanId, attackerSel: aSel, defenderSel: dSel, gaugePay });
        this.driveStrikeGen(gen, undefined);
      });
    };
    // Sagat's Innate/Exceed: "may place your attack face up for +SPD[/+POW]" — a
    // real choice made at strike-set time (before Critical, same ordering the AI
    // side uses in aiInitiateStrike). Skipped for a Wild Swing, same reasoning as
    // maybeAskCritical's hideCardName.
    const char = CHARACTERS[human.characterKey];
    const askFaceUp = () => {
      // `canGoFaceUp` is either a flat true (Sagat — any attack) or a predicate on the
      // card (Happy Chaos — only Steady Aim says you may initiate with it face up).
      if (canGoFaceUpWith(char, aSel.card) && !hideCardName) {
        this.mode = 'face_up_choice';
        this.sel = { card: aSel.card };
        this.pendingFaceUpDone = (wantsFaceUp) => {
          aSel.faceUp = !!wantsFaceUp;
          if (wantsFaceUp) {
            this.engine.setFaceUpThisStrike(human, true);
            this.log(`You set ${aSel.card.name} face up.`);
          }
          afterFaceUp();
        };
        render();
        return;
      }
      afterFaceUp();
    };
    // Season 5 set-time option (Jin/Noel/Nu-13/Iron Tager's Innates: "when you set
    // your attack / initiate a Strike, you may spend [1]/{1} to ..."). Offered first
    // in the set-time chain, then Sagat's face-up choice, then Critical — the order
    // those decisions are printed in.
    this.maybeAskSetTimeOption(human, ai, aSel.card, true, askFaceUp);
  }

  // Shared by the initiating and defending paths; `isInitiator` gates the options
  // whose text says "when you initiate".
  maybeAskSetTimeOption(player, opponent, card, isInitiator, onDone) {
    const offer = this.engine.setTimeOptionFor(player, card, isInitiator);
    if (!offer) { onDone(); return; }
    if (player.id === this.aiId) {
      // The CPU takes a set-time option whenever it can afford it and still keeps a
      // Gauge in reserve — these are all small, reliably-positive buffs, so this is
      // the same shallow-heuristic level as chooseFaceUp rather than a deep model.
      // Checked in whichever resource the option actually costs: Jin's, Noel's and
      // Tager's are Gauge, Nu-13's is Force (paid from hand or gauge). Reading the
      // Gauge count for a Force cost would both mis-gate her option and let the CPU
      // "take" it with nothing to pay it with.
      let keepsReserve;
      if (offer.cost.force) {
        keepsReserve = !!this.engine.pickExactForceCards(player, offer.cost.force) && player.hand.length > 2;
      } else {
        keepsReserve = this.engine.gaugeCount(player) - (offer.cost.gauge || 0) >= 1;
      }
      if (keepsReserve && Math.random() < 0.7) {
        this.engine.applySetTimeOption(player, opponent, card);
        this.log(`CPU pays for its Innate: ${offer.text}.`);
      }
      onDone();
      return;
    }
    this.mode = 'set_time_option_choice';
    this.sel = { card, text: offer.text };
    this.pendingSetTimeDone = () => onDone();
    render();
  }

  resolveSetTimeOption(accept) {
    const done = this.pendingSetTimeDone;
    this.pendingSetTimeDone = null;
    if (accept) {
      const card = this.sel && this.sel.card;
      if (this.engine.applySetTimeOption(this.human(), this.ai(), card)) {
        this.log(`You use your Innate: ${this.sel.text}.`);
      }
    }
    if (done) done();
  }
  resolveFaceUpChoice(wantsFaceUp) {
    const done = this.pendingFaceUpDone;
    this.pendingFaceUpDone = null;
    if (done) done(!!wantsFaceUp);
  }

  aiChooseDefense(aiPlayer, humanPlayer) {
    const reading = this.engine.consumeReading();
    let dSel;
    // GG Focus's boost, symmetric case to aiInitiateStrike's above: the HUMAN
    // initiated, so if THEY have this boost active, the AI (defender) must
    // Wild Swing — overriding Reading the same way, for the same reason.
    if (this.engine.mustWildSwing(humanPlayer, aiPlayer)) {
      this.log(`Your Focus forces ${aiPlayer.name} to respond with a Wild Swing.`);
      dSel = this.engine.resolveStrikeCardSelection(aiPlayer, { type: 'wildswing' });
    } else if (reading && reading.boosterId === this.humanId) {
      const forced = aiPlayer.hand.find(c => c.key === reading.cardKey);
      if (forced) {
        this.log(`${aiPlayer.name} is forced by Reading to defend with ${forced.name}.`);
        dSel = this.engine.resolveStrikeCardSelection(aiPlayer, { type: 'hand', uid: forced.uid });
      } else {
        this.log(`${aiPlayer.name} reveals their hand (no copy of the named card): ${aiPlayer.hand.map(c => c.name).join(', ') || '(empty)'}`);
        this.engine.recordHandReveal(aiPlayer);
      }
    }
    if (!dSel) {
      const oppPublic = publicInfoOf(humanPlayer);
      if (aiPlayer.hand.length === 0) {
        dSel = this.engine.resolveStrikeCardSelection(aiPlayer, { type: 'wildswing' });
      } else {
        const { selection } = chooseStrikeSelection({
          hand: aiPlayer.hand, myPos: aiPlayer.pos, oppPublic, iAmInitiator: false, rng: Math.random,
          samples: 100, buildExCardFn: (a, b) => this.engine.buildExCard(a, b),
          myBoostMods: this.engine.activeBoostMods(aiPlayer), randomness: this.randomness,
          myGaugeCount: this.engine.gaugeCount(aiPlayer), myExceeded: aiPlayer.exceeded,
          myCharacterKey: aiPlayer.characterKey, myEddiePos: aiPlayer.eddiePos,
          meFull: aiPlayer, turnNumber: this.engine.turn,
        });
        dSel = this.engine.resolveStrikeCardSelection(aiPlayer, selection);
      }
    }
    if (!dSel && !this.engine.gameOver) {
      // Selected card was rejected as invalid (e.g., Reading forced a Nagoriyuki
      // Special while Exceeded) — fall back to a legal Wild Swing rather than
      // treating a non-exhaustion null as game over.
      dSel = this.engine.resolveStrikeCardSelection(aiPlayer, { type: 'wildswing' });
    }
    if (!dSel) return null;
    // Season 5 set-time option on the CPU's defense (Jin's Innate is not
    // initiator-only) — resolves inline, see maybeAskSetTimeOption.
    this.maybeAskSetTimeOption(aiPlayer, humanPlayer, dSel.card, false, () => {});
    dSel.criticalPaid = this.aiDecideCritical(aiPlayer, humanPlayer, dSel.card, dSel.fromWildSwing);
    return dSel;
  }

  // ----- Critical, AI side: synchronous heuristic decision (see
  // ai.js's chooseCriticalPayment) — pays gauge immediately if it decides to. Shared
  // by both aiChooseDefense (AI defending) and aiInitiateStrike (AI attacking).
  // `opponent` is needed (not just `aiPlayer`) so chooseCriticalPayment can see the
  // current range — that's how it knows whether Zangief's Innate/Exceeded is live on
  // a card that has no `critical` field of its own (see hasRealCriticalValue's
  // comment in ai.js).
  aiDecideCritical(aiPlayer, opponent, card, fromWildSwing) {
    if (this.pendingFreeCritical || this.engine.hasFreeCriticalBoost(aiPlayer)) {
      this.pendingFreeCritical = false;
      return true;
    }
    if (!this.engine.canPayCritical(aiPlayer)) return false;
    // Exceed reserve. The 1 Gauge a Critical burns is the same Gauge the AI needs to
    // Exceed, and Exceeding is usually the bigger swing — so if paying would leave it
    // unable to afford its Exceed cost, normally decline. Same reserve discipline as
    // `aiShouldCancel` below (the sibling pattern), just expressed as a floor rather
    // than a strict-greater-than, since a Critical spends exactly 1. The exception is
    // a nearly-finished game: with the opponent at 6 or less life, closing the game
    // out beats banking Gauge for an Exceed that may never pay off.
    const char = CHARACTERS[aiPlayer.characterKey];
    if (!aiPlayer.exceeded
        && this.engine.gaugeCount(aiPlayer) <= (char.exceedCost || 0)
        && opponent.life > 6) {
      return false;
    }
    const dist = this.engine.range(aiPlayer, opponent);
    const pay = chooseCriticalPayment({
      card, rng: Math.random, randomness: this.randomness,
      ownerCharacterKey: aiPlayer.characterKey, dist, fromWildSwing: !!fromWildSwing,
    });
    if (pay) {
      const spent = this.engine.spendGauge(aiPlayer, 1);
      aiPlayer.discard.push(...spent);
    }
    return pay;
  }

  // ----- generator driver (Grasp / Block interactivity) -----
  driveStrikeGen(gen, sendVal) {
    let res = gen.next(sendVal);
    while (!res.done) {
      const req = res.value;
      if (req.playerId === this.humanId) {
        this.pendingGen = gen;
        // `chosen` is used by the yields that present a card picker (block_force);
        // harmless for the ones that don't.
        this.sel = { request: req, chosen: [] };
        if (req.type === 'grasp_move') {
          this._graspAmount = req.max != null ? req.max : 2;
          this._graspDir = req.forceDirection || 'retreat';
        } else if (req.type === 'optional_force_spend_pow') {
          this._forcePowSpend = 0;
        }
        this.mode = req.type === 'grasp_move' ? 'grasp_choice'
          : req.type === 'hadoken_recycle' ? 'hadoken_recycle_choice'
          : req.type === 'sustain_choice' ? 'sustain_choice'
          : req.type === 'sustain_choice_paid' ? 'sustain_choice_paid'
          : req.type === 'optional_gauge_spend' ? 'optional_gauge_spend_choice'
          : req.type === 'optional_retreat' ? 'optional_retreat_choice'
          : req.type === 'optional_force_spend_pow' ? 'optional_force_spend_pow_choice'
          : req.type === 'block_force' ? 'block_force_choice'
          : req.type === 'named_choice_effect' ? 'named_choice_effect'
          : req.type === 'may_exceed_choice' ? 'may_exceed_choice'
          : req.type === 'place_eddie' ? 'place_eddie_choice'
          : (() => { throw new Error('driveStrikeGen: unhandled yield type ' + req.type); })();
        render();
        return;
      }
      // Board context for the AI's strike-resolution answers. Without it,
      // resolveAIStrikeRequest falls back to fixed constants (always push away at
      // maximum, always spend all the Force, always retreat) — answers that never look
      // at the board and are therefore a free read for a human who notices. The AI's
      // own hand is its own information; the opponent side is a publicInfoOf snapshot
      // and a sampled plausible hand, never their real cards (ai.js header invariant).
      const aiP = this.ai(), oppP = this.human();
      const oppPublicForReq = publicInfoOf(oppP);
      const answer = resolveAIStrikeRequest(req, Math.random, this.randomness, {
        hand: aiP.hand,
        dist: this.engine.range(aiP, oppP),
        boostMods: this.engine.activeBoostMods(aiP),
        characterKey: aiP.characterKey,
        oppPublic: oppPublicForReq,
        oppBoostMods: boostModsFromKeys(oppPublicForReq.boostsInPlay),
        oppHandSample: sampleOpponentHand(oppPublicForReq, Math.random),
      });
      res = gen.next(answer);
    }
    this.pendingGen = null;
    this.mode = 'strike_result';
    this.mobilePanelTab = 'inspector';
    this.pendingStrikeResult = res.value;
    // Breakdown pacing: beginner mode reveals the resolution one beat at a time
    // (see render.js's `.breakdown`), so start from the first beat on every new
    // Strike; outside beginner mode render.js shows everything at once and this
    // index is simply ignored.
    this.beatIndex = this.beginner ? 1 : Number.MAX_SAFE_INTEGER;
    this.hintText = null;  // a suggestion from before this exchange is stale now
    this.noteBeginnerDamage();
    // Screenshake trigger: a single hit landing for 5+ damage this exchange. Consumed
    // (and cleared) by render() the next time it runs, so it fires exactly once per
    // strike rather than replaying on every subsequent re-render while still on this
    // strike_result screen.
    this.shakeOnRender = !!(res.value && res.value.maxSingleHitDamage >= 5);
    render();
    if (typeof StrikePlaybackController !== 'undefined' && typeof document !== 'undefined') {
      StrikePlaybackController.start(this.engine.lastStrikeInfo);
    }
  }
  resolveGraspChoice(amount, direction) { this.driveStrikeGen(this.pendingGen, { amount, direction }); }
  // Block's reactive Force-for-Armor now genuinely picks WHICH cards pay (same
  // shape as move_force_select/action_force_select) instead of taking hand[0]
  // repeatedly, which could silently eat the player's Ultra. Ultras count as 2
  // Force here like everywhere else.
  toggleBlockForceCard(uid) {
    const chosen = this.sel.chosen = this.sel.chosen || [];
    const idx = chosen.indexOf(uid);
    if (idx !== -1) chosen.splice(idx, 1); else chosen.push(uid);
    render();
  }
  confirmBlockForce() { this.driveStrikeGen(this.pendingGen, { uids: this.sel.chosen || [] }); }
  resolveHadokenRecycle(wantsRecycle) { this.driveStrikeGen(this.pendingGen, wantsRecycle); }
  resolveSustainChoice(wantsSustain) { this.driveStrikeGen(this.pendingGen, wantsSustain); }
  resolveSustainChoicePaid(wantsSustain) { this.driveStrikeGen(this.pendingGen, wantsSustain); }
  resolveOptionalGaugeSpend(wantsSpend) { this.driveStrikeGen(this.pendingGen, wantsSpend); }
  resolveOptionalRetreat(wantsRetreat) { this.driveStrikeGen(this.pendingGen, wantsRetreat); }
  resolveOptionalForceSpendPow(n) { this.driveStrikeGen(this.pendingGen, n); }
  resolveNamedChoiceEffect(key) { this.driveStrikeGen(this.pendingGen, key); }
  resolveMayExceedChoice(wantsExceed) { this.driveStrikeGen(this.pendingGen, wantsExceed); }
  // Zato-1's Normals: "After: You may place Eddie ..." — `pos` is a board space, or
  // null to decline (leaving Eddie exactly where he already was, in or out of play).
  resolvePlaceEddie(pos) { this.driveStrikeGen(this.pendingGen, pos == null ? null : Number(pos)); }

  continueAfterStrikeResult() { this.afterStrike(this.pendingStrikeResult); }

  // ----- discard-to-7 (human) -----
  toggleDiscardChoice(uid) {
    this.sel.chosen = this.sel.chosen || [];
    const idx = this.sel.chosen.indexOf(uid);
    if (idx !== -1) this.sel.chosen.splice(idx, 1); else this.sel.chosen.push(uid);
    render();
  }
  confirmDiscardToSeven() {
    const player = this.human();
    const maxHand = this.engine.getMaxHandSize(player.characterKey);
    const need = player.hand.length - maxHand;
    const chosen = (this.sel.chosen || []).slice(0, need);
    const discarded = chosen.map(uid => this.engine.discardFromHand(player, uid)).filter(Boolean);
    if (discarded.length > 0) this.log(`You discard down to ${maxHand} cards: ${discarded.map(c => c.name).join(', ')}.`);
    if (player.hand.length > maxHand) { render(); return; }
    if (this.pendingNext !== undefined) { this.continueAfterStrikeDiscard(this.pendingNext); this.pendingNext = undefined; }
    else { this.maybeRevertOnNonStrikeEnd(player, true); this.passOrContinue(); }
  }

  // Cancel (see cards.js's GG_NORMALS/AXL header comments and maybeAskCancel's
  // comment for the full mechanic) — close to free value (another action for
  // 1 Gauge) but Gauge is also needed for Exceeding/Ultras/Criticals, so this
  // keeps a small reserve rather than blindly chaining away every point it
  // has. No richer resource-tradeoff lookahead here, same simplification
  // level as this file's other single-value heuristics.
  // C. Viper's Innate/Exceed, AI side: worth Striking right after a
  // Continuous Boost if the AI is actually holding something usable at the
  // current range — uses isEffectivelyInRange with activeBoostMods so Before-movers
  // and range-granting boosts are counted properly.
  aiWantsFollowupStrike(player, opp) {
    const dist = this.engine.range(player, opp);
    const boostMods = this.engine.activeBoostMods(player);
    return player.hand.some(c => isEffectivelyInRange(c, dist, boostMods) && (c.pow || 0) > 0);
  }

  aiShouldCancel(player) {
    const char = CHARACTERS[player.characterKey];
    const reserve = player.exceeded ? 1 : Math.max(1, char.exceedCost);
    return this.engine.gaugeCount(player) > reserve;
  }

  // Greedily pick hand/gauge uids whose Force VALUE (see engine.forceValueOfCard —
  // Ultras are worth 2) sums to exactly `target`. Prefers Ultras first purely to
  // conserve card economy (fewer physical cards spent for the same Force); returns
  // null if `target` isn't achievable exactly with what's available (e.g. an odd
  // target with only Ultras left). `excludeUids` accepts a single uid, Array, or Set.
  pickForceUidsForTarget(player, target, excludeUids) {
    const excluded = excludeUids instanceof Set ? excludeUids
      : Array.isArray(excludeUids) ? new Set(excludeUids)
      : (excludeUids ? new Set([excludeUids]) : new Set());
    const pool = [...player.hand, ...player.gauge].filter(c => !excluded.has(c.uid));
    const twos = pool.filter(c => this.engine.forceValueOfCard(c) === 2);
    const ones = pool.filter(c => this.engine.forceValueOfCard(c) === 1);
    const chosen = [];
    let remaining = target;
    for (const c of twos) { if (remaining >= 2) { chosen.push(c.uid); remaining -= 2; } }
    for (const c of ones) { if (remaining >= 1) { chosen.push(c.uid); remaining -= 1; } }
    return remaining === 0 ? chosen : null;
  }

  // M. Bison's action: "Add [up to N] card(s) from hand to Gauge, draw that many."
  // AI side of the needsHandToGaugeChoice flow — picks the lowest-POW cards (same
  // "weakest first" convention the AI's ChangeCards action already uses).
  aiRunHandToGaugeAction(player) {
    const max = CHARACTERS[player.characterKey].action.maxHandToGauge(player);
    const n = Math.min(max, player.hand.length);
    if (n === 0) { this.aiFinishNonStrike(); return; }
    this.engine.startRound();
    const sorted = [...player.hand].sort((a, b) => (a.pow || 0) - (b.pow || 0));
    const moved = [];
    for (let i = 0; i < n; i++) {
      const idx = player.hand.findIndex(c => c.uid === sorted[i].uid);
      if (idx === -1) continue;
      const [card] = player.hand.splice(idx, 1);
      player.gauge.push(card);
      moved.push(card);
    }
    this.log(`CPU uses character action: adds ${moved.map(c => c.name).join(', ')} to Gauge, draws ${moved.length}.`);
    this.engine.draw(player, moved.length);
    this.aiFinishNonStrike();
  }

  // =================== AI TURN ===================
  runAITurn() {
    if (this.engine.gameOver) { this.mode = 'game_over'; render(); return; }
    const player = this.ai(), opp = this.human();
    const oppPublic = publicInfoOf(opp);
    const action = chooseAction({ me: player, mePublicFull: player, oppPublic, canExceed: this.engine.canExceed(player), rng: Math.random, randomness: this.randomness, myBoostMods: this.engine.activeBoostMods(player), turnNumber: this.engine.turn });

    if (action.type === 'strike') { this.aiInitiateStrike(); return; }
    if (action.type === 'exceed') {
      this.engine.startRound();
      const res = this.engine.doExceed(player);
      // Follow through on a real "you may Strike/act immediately upon Exceeding"
      // bonus (Anji/May's onExceed mayStrike, M. Bison's onExceed mayAction) — a
      // pre-existing gap: this branch used to ignore doExceed's return value
      // entirely, so the AI never took this follow-up even though the human-side
      // actionExceed() already did.
      if (res.mayStrike && Math.random() < 0.7) {
        const dist = this.engine.range(player, opp);
        const mods = this.engine.activeBoostMods(player);
        const inRangeCount = player.hand.filter(c => isEffectivelyInRange(c, dist, mods)).length;
        if (inRangeCount > 0) { this.aiInitiateStrike(); return; }
      }
      if (res.mayAction && Math.random() < 0.7) { this.aiRunHandToGaugeAction(player); return; }
      this.aiFinishNonStrike();
      return;
    }
    if (action.type === 'burst') { this.engine.startRound(); this.engine.useBurstAction(player, action.boostUid); this.aiFinishNonStrike(); return; }
    if (action.type === 'action') {
      const char = CHARACTERS[player.characterKey];
      if (char.action.needsHandToGaugeChoice) { this.aiRunHandToGaugeAction(player); return; }
      // Bang's deck-look action, CPU side: peek and keep the higher-Power card. Same
      // shallow keep-the-better-card heuristic chooseRangeDiscard uses for its mirror
      // decision, rather than a full evaluation of each card's situational value.
      if (char.action.needsDeckLook) {
        this.engine.startRound();
        const peeked = this.engine.peekTopN(player, char.action.needsDeckLook);
        if (peeked.length) {
          const best = peeked.reduce((a, b) => ((b.pow || 0) > (a.pow || 0) ? b : a), peeked[0]);
          this.engine.resolveDeckLookChoice(player, opp, peeked, best.uid, 'draw');
          this.log(`CPU uses its Innate action: looks at the top ${peeked.length} cards and draws one.`);
        }
        this.aiFinishNonStrike();
        return;
      }
      const actionCost = char.actionForceCost || 0;
      if (actionCost > 0) {
        const uids = this.pickForceUidsForTarget(player, actionCost);
        if (!uids) { this.aiFinishNonStrike(); return; } // can't pay exactly — skip the action this turn
        this.engine.startRound();
        this.engine.payForceFromHandOrGauge(player, uids, "CPU's character action");
      } else {
        this.engine.startRound();
      }
      const res = char.action.resolve(this.engine, player, opp, action.direction) || {};
      this.log(`CPU uses character action.`);
      // Mandatory Strike triggered by character actions (Baiken, Faust, Giovanna, I-No, Jack-O):
      // mirrors human executeCharacterAction so CPU actually executes the Strike and gets
      // actionStrikePowBonus / actionStrikeHitHook.
      if (res && res.triggersStrike) {
        player.actionStrikeThisTurn = true;
        this.aiInitiateStrike();
        return;
      }
      // Check if the action's result allows an optional follow-up Strike (Ken's Exceeded action).
      if (res && res.mayStrike && Math.random() < 0.7) {
        // Ken's exceeded action: Close 1, draw 1, then may Strike.
        // Decide whether to chain the Strike (favorable, close range, etc.) or end turn.
        const dist = this.engine.range(player, opp);
        const mods = this.engine.activeBoostMods(player);
        const inRangeCount = player.hand.filter(c => isEffectivelyInRange(c, dist, mods)).length;
        if (inRangeCount > 0) {
          this.aiInitiateStrike();
          return;
        }
      }
      this.aiFinishNonStrike();
      return;
    }
    if (action.type === 'changecards') {
      this.engine.startRound();
      const n = Math.min(action.n || 1, player.hand.length);
      const sorted = [...player.hand].sort((a, b) => (a.pow || 0) - (b.pow || 0));
      const uids = sorted.slice(0, n).map(c => c.uid);
      // Guile spends one Gauge card as well when he has one, because his Innate turns
      // that single card into 3 Force (1 + the extra 2). Kept as a narrow, character-
      // driven addition rather than teaching the general AI to weigh Gauge-vs-hand
      // payment: for everyone else, a Gauge card and a hand card are both worth 1
      // Force here, and Gauge has other uses, so spending hand cards stays correct.
      const char = CHARACTERS[player.characterKey];
      if (char && char.changeCardsForceBonus && player.gauge.length > 0) uids.push(player.gauge[0].uid);
      const res = this.engine.performChangeCards(player, uids);
      this.log(`CPU changes cards: spends ${res.forceValue} Force (${res.spent.map(c => c.name).join(', ')}), draws ${res.drawn}.`);
      if (res.spentFromGauge > 0 && char && char.mayStrikeAfterChangeCards && char.mayStrikeAfterChangeCards(player)) {
        // Same 70% follow-through the AI's other "you may Strike" bonuses use
        // (onExceed mayStrike, Ken's Exceeded action), and only when something in
        // hand can actually reach.
        const dist = this.engine.range(player, opp);
        const mods = this.engine.activeBoostMods(player);
        if (Math.random() < 0.7 && player.hand.some(c => isEffectivelyInRange(c, dist, mods))) { this.aiInitiateStrike(); return; }
      }
      this.aiFinishNonStrike();
      return;
    }
    if (action.type === 'move') {
      if (Number.isInteger(action.targetSpace)) {
        const targetSpace = action.targetSpace;
        const movingTowardOpp = (player.pos < opp.pos && targetSpace > player.pos) || (player.pos > opp.pos && targetSpace < player.pos);
        const dir = movingTowardOpp ? 'advance' : (targetSpace !== player.pos ? 'retreat' : null);
        if (dir) {
          const crossed = (player.pos < opp.pos && targetSpace > opp.pos) || (player.pos > opp.pos && targetSpace < opp.pos);
          const steps = Math.abs(targetSpace - player.pos) - (crossed ? 1 : 0);
          const force = dir === 'advance' ? this.engine.simulateAdvance(player.pos, opp.pos, steps).force : steps;
          const uids = this.pickForceUidsForTarget(player, force);
          if (uids && steps > 0) {
            this.engine.startRound();
            this.engine.payForceFromHandOrGauge(player, uids, "CPU's Move");
            if (dir === 'advance') this.engine.advanceSelfPaid(player, opp, steps);
            else this.engine.retreatSelfPaid(player, opp, steps);
            this.log(`CPU moves (${dir}).`, 'move', this.aiId, { amount: steps });
            this.aiFinishNonStrike();
            return;
          }
        }
      }
      const dist = this.engine.range(player, opp);
      const dir = dist > action.target ? 'advance' : (dist < action.target ? 'retreat' : null);
      if (dir) {
        const max = this.engine.maxUsefulSpaces(player, opp, dir);
        const pool = [...player.hand, ...player.gauge];
        const payCapacity = pool.reduce((s, c) => s + this.engine.forceValueOfCard(c), 0);
        const desired = Math.min(max, Math.abs(dist - action.target));
        // Try the biggest distance first, backing off until we find one whose Force
        // cost can be paid EXACTLY (Ultras are worth 2, so not every total is reachable).
        for (let d = desired; d > 0; d--) {
          const force = dir === 'advance' ? this.engine.simulateAdvance(player.pos, opp.pos, d).force : d;
          if (force > payCapacity) continue;
          const uids = this.pickForceUidsForTarget(player, force);
          if (uids) {
            this.engine.startRound();
            this.engine.payForceFromHandOrGauge(player, uids, "CPU's Move");
            if (dir === 'advance') this.engine.advanceSelfPaid(player, opp, d);
            else this.engine.retreatSelfPaid(player, opp, d);
            this.log(`CPU moves (${dir}).`, 'move', this.aiId, { amount: d });
            break;
          }
        }
      }
      this.aiFinishNonStrike();
      return;
    }
    if (action.type === 'boost' && player.hand.length > 0) {
      const card = player.hand.find(c => c.uid === action.uid) || player.hand[0];
      const need = this.engine.cardBoostForce(card);
      const uids = need > 0 ? this.pickForceUidsForTarget(player, need, card.uid) : [];
      if (uids) {
        let namedKey = null, namedRange = null, targetBoostUid = null, pushPullDirection = null, moveDirection = null, bonusForceUids = null, eddieSpace = null;
        if (card.boost.needsNameChoice) namedKey = chooseNamedCardKey({ oppPublic, pool: this.opponentUniqueKeys(opp.characterKey), rng: Math.random, randomness: this.randomness });
        else if (card.boost.needsNormalNameChoice) namedKey = chooseNamedCardKey({ oppPublic, pool: (CHARACTERS[opp.characterKey].normals || NORMALS).map(c => c.key), rng: Math.random, randomness: this.randomness });
        else if (card.boost.needsRangeNameChoice) namedRange = chooseRangeToName({ rng: Math.random, randomness: this.randomness, oppPublic: publicInfoOf(opp) });
        else if (card.boost.needsBoostTargetChoice) {
          const bestKey = chooseBoostTargetToDiscard({ oppBoostsInPlayKeys: oppPublic.boostsInPlay, rng: Math.random, randomness: this.randomness });
          const entry = bestKey ? opp.boostsInPlay.find(b => b.card.key === bestKey) : null;
          if (entry) targetBoostUid = entry.card.uid;
        } else if (card.boost.needsPushPullChoice) {
          // Simple heuristic: pull the opponent closer if this player is a
          // "get in range" character (favors low current range), otherwise
          // push away for tempo/breathing room. No deeper lookahead — same
          // simplification level as this file's other direction-choice defaults.
          pushPullDirection = this.engine.range(player, opp) > 3 ? 'pull' : 'push';
        } else if (card.boost.needsDirectionChoice) {
          const dist = this.engine.range(player, opp);
          moveDirection = dist <= 2 ? 'retreat' : 'advance';
        } else if (card.boost.needsEddieSpaceChoice) {
          eddieSpace = chooseEddieSpace({
            spaces: this.engine.eddiePlacementSpaces(player, card, true),
            opponentPos: opp.pos, selfPos: player.pos,
            handRanges: player.hand.filter(c => c.range).map(c => ({ min: c.range[0], max: c.range[1] })),
            rng: Math.random, randomness: this.randomness,
          });
        } else if (card.boost.needsDeckLookChoice) {
          this.aiHandleDeckLook(card, uids);
          return;
        }
        if (card.boost.optionalForceSpend) {
          // Exclude both the boost card itself AND cards already committed to its base Force cost.
          const excluded = new Set([card.uid, ...uids]);
          const maxAllowed = card.boost.optionalForceSpend.max;
          const pool = [...player.hand, ...player.gauge].filter(c => !excluded.has(c.uid));
          const capacity = pool.reduce((s, c) => s + this.engine.forceValueOfCard(c), 0);
          bonusForceUids = [];
          for (let spend = Math.min(maxAllowed, capacity); spend > 0; spend--) {
            const picked = this.pickForceUidsForTarget(player, spend, excluded);
            if (picked) { bonusForceUids = picked; break; }
          }
        }
        this.engine.startRound();
        const extra = { namedCardKey: namedKey, namedRange, targetBoostUid, pushPullDirection, moveDirection, bonusForceUids, eddieSpace };
        const res = this.engine.playBoost(player, opp, card.uid, uids, extra);
        if (!res.ok) { this.engine.log.pop(); this.engine.roundNum--; this.aiFinishNonStrike(); return; }
        if (namedKey) this.log(`CPU's ${card.name} names ${cardNameForKey(namedKey)}.`);
        if (namedRange != null) this.log(`CPU's ${card.name} names Range ${namedRange}.`);
        // Chun-Li's Innate: "After you resolve a Boost, you may Retreat 1" — no real
        // downside identified (same shallow-heuristic level as this file's other
        // yes/no defaults), so the AI always takes it, before any follow-up Strike
        // per her own printed clarification.
        if (CHARACTERS[player.characterKey].mayRetreatAfterBoost) {
          this.engine.retreatSelf(player, opp, 1);
          this.log(`CPU retreats 1 (Innate).`, 'move', this.aiId, { amount: 1 });
        }
        const continuation = () => {
          if (res.triggersStrike) { this.aiInitiateStrike(); return; }
          if (res.bonusAction) { this.scheduleAITurn(400); render(); return; }
          if (res.mayTriggerStrike && this.aiWantsFollowupStrike(player, opp)) {
            if (res.freeCriticalOnFollowupStrike) this.pendingFreeCritical = true;
            this.aiInitiateStrike();
            return;
          }
          if (card.boost.cancelable && this.engine.gaugeCount(player) >= 1 && this.aiShouldCancel(player)) {
            const spent = this.engine.spendGauge(player, 1);
            player.discard.push(...spent);
            player.canceledThisTurn = true; // Sol Badguy's Innate/Exceed cares about this
            const hookResult = this.engine.triggerOnCancelHooks(player, opp); // Chipp, Ky: respond to Cancel
            this.log(`CPU spends 1 Gauge to Cancel (${card.name}) \u2014 takes another action.`);
            if (hookResult && hookResult.needsMovementChoice) {
              const dir = Math.random() < 0.5 ? 'advance' : 'retreat';
              if (dir === 'advance') this.engine.advanceSelf(player, opp, hookResult.moveAmount, true);
              else this.engine.retreatSelf(player, opp, hookResult.moveAmount);
              this.log(`CPU ${dir}s ${hookResult.moveAmount}.`, 'move', this.aiId, { amount: hookResult.moveAmount });
            }
            render();
            this.scheduleAITurn(400);
            return;
          }
          this.aiFinishNonStrike();
        };
        if (this.handlePendingRangeDiscard(continuation)) return; // paused, waiting on human choice
        continuation();
        return;
      }
      this.aiFinishNonStrike();
      return;
    }
    if (action.type === 'reshuffle') {
      this.engine.startRound();
      this.engine.manualReshuffle(player);
      this.aiFinishNonStrike();
      return;
    }
    this.engine.startRound();
    this.engine.draw(player, 1);
    this.log('CPU prepares (draws a card).');
    this.aiFinishNonStrike();
  }

  // Axl's Sickle Storm boost, AI side. Plays Sickle Storm itself first (same as
  // the human path's startDeckLookChoice), then a simple heuristic over the
  // peeked cards: Strike with the best in-range attacker if one looks good
  // (POW-based, matching this file's other lightweight heuristics rather than a
  // full chooseStrikeSelection-style search — reusing that here would need
  // opponent public info threaded through differently than this call site has
  // it), else Boost with the best continuous stat-boost found, else discard all.
  aiHandleDeckLook(card, uids) {
    const player = this.ai(), opp = this.human();
    this.engine.startRound();
    const res = this.engine.playBoost(player, opp, card.uid, uids, null);
    if (!res.ok) { this.engine.log.pop(); this.engine.roundNum--; this.aiFinishNonStrike(); return; }
    const peeked = this.engine.peekTopN(player, card.boost.peekCount || 3);
    const dist = this.engine.range(player, opp);
    const boostMods = this.engine.activeBoostMods(player);
    const inRangeAttackers = peeked.filter(c => isEffectivelyInRange(c, dist, boostMods) && (c.pow || 0) > 0);
    let chosenUid = null, mode = null;
    if (inRangeAttackers.length > 0) {
      const best = inRangeAttackers.reduce((a, b) => (b.pow || 0) > (a.pow || 0) ? b : a);
      chosenUid = best.uid; mode = 'strike';
    } else {
      const boostables = peeked.filter(c => c.boost && c.boost.continuous);
      if (boostables.length > 0) { chosenUid = boostables[0].uid; mode = 'boost'; }
    }
    const result = this.engine.resolveDeckLookChoice(player, opp, peeked, chosenUid, mode);
    if (result.struckWith) {
      const aSel = this.engine.resolveStrikeCardSelection(player, { type: 'decklook', card: result.struckWith });
      if (!aSel) { this.mode = 'game_over'; render(); return; }
      this.maybeAskSetTimeOption(player, opp, aSel.card, true, () => {});
      aSel.criticalPaid = this.aiDecideCritical(player, opp, aSel.card, false);
      const aiChar = CHARACTERS[player.characterKey];
      if (canGoFaceUpWith(aiChar, aSel.card)) {
        aSel.faceUp = chooseFaceUp({ card: aSel.card, myExceeded: player.exceeded, myCharacterKey: player.characterKey, rng: Math.random, randomness: this.randomness });
      }
      this.pendingAiAttack = aSel;
      const rc = this.engine.readingConstraintFor(opp);
      const forced = rc ? opp.hand.find(c => c.key === rc.namedKey) : null;
      this.sel = forced ? { forcedUid: forced.uid, forcedName: forced.name } : {};
      this.mode = 'defend_select';
      render();
      return;
    }
    const bRes = result.boostResult;
    if (bRes && bRes.ok) {
      if (CHARACTERS[player.characterKey].mayRetreatAfterBoost) {
        this.engine.retreatSelf(player, opp, 1);
        this.log('CPU retreats 1 (Innate).', 'move', this.aiId, { amount: 1 });
      }
      const continuation = () => {
        if (bRes.triggersStrike) { this.aiInitiateStrike(); return; }
        if (bRes.bonusAction) { this.scheduleAITurn(400); render(); return; }
        if (bRes.mayTriggerStrike && this.aiWantsFollowupStrike(player, opp)) {
          if (bRes.freeCriticalOnFollowupStrike) this.pendingFreeCritical = true;
          this.aiInitiateStrike();
          return;
        }
        if (bRes.card.boost.cancelable && this.engine.gaugeCount(player) >= 1 && this.aiShouldCancel(player)) {
          const spent = this.engine.spendGauge(player, 1);
          player.discard.push(...spent);
          player.canceledThisTurn = true;
          const hookResult = this.engine.triggerOnCancelHooks(player, opp);
          this.log(`CPU spends 1 Gauge to Cancel (${bRes.card.name}) \u2014 takes another action.`);
          if (hookResult && hookResult.needsMovementChoice) {
            const dir = Math.random() < 0.5 ? 'advance' : 'retreat';
            if (dir === 'advance') this.engine.advanceSelf(player, opp, hookResult.moveAmount, true);
            else this.engine.retreatSelf(player, opp, hookResult.moveAmount);
            this.log(`CPU ${dir}s ${hookResult.moveAmount}.`, 'move', this.aiId, { amount: hookResult.moveAmount });
          }
          render();
          this.scheduleAITurn(400);
          return;
        }
        this.aiFinishNonStrike();
      };
      if (this.handlePendingRangeDiscard(continuation)) return;
      continuation();
      return;
    }
    this.aiFinishNonStrike();
  }

  aiFinishNonStrike() {
    const player = this.ai();
    const maxHand = this.engine.getMaxHandSize(player.characterKey);
    this.engine.checkBoostExpiry(player);
    this.engine.endOfTurnDraw(player); // Astral Heat swap / Hakumen's Gauge add live here
    this.log('CPU ends its turn (draws a card).');
    if (player.hand.length > maxHand) this.aiDiscardToSeven();
    this.maybeRevertOnNonStrikeEnd(player, false);
    // Same extraActionsRemaining precedence as passOrContinue's human side above.
    if (player.extraActionsRemaining > 0) {
      player.extraActionsRemaining -= 1;
      this.engine.checkStartOfTurnExpiry(player);
      render();
      this.scheduleAITurn(500);
      return;
    }
    if (player.advantage) {
      player.advantage = false;
      this.engine.checkStartOfTurnExpiry(player);
      render();
      this.scheduleAITurn(500);
    } else {
      this.engine.clearAdvantage();
      this.engine.resetPerTurnFlags(this.human());
      this.engine.active = this.humanId;
      this.engine.checkStartOfTurnExpiry(this.human());
      // A suggestion is only valid for the position it was asked about, so it is
      // dropped at the start of each of the player's turns rather than lingering as
      // advice about a board state that no longer exists.
      this.hintText = null;
      this.startTurnFor(this.humanId, () => { this.mode = 'awaiting_action'; render(); });
    }
  }

  aiInitiateStrike() {
    const player = this.ai(), human = this.human();
    let aSel;
    if (player.hand.length === 0) {
      aSel = this.engine.resolveStrikeCardSelection(player, { type: 'wildswing' });
    } else {
      const oppPublic = publicInfoOf(human);
      const { selection } = chooseStrikeSelection({
        hand: player.hand, myPos: player.pos, oppPublic, iAmInitiator: true, rng: Math.random,
        samples: 100, buildExCardFn: (a, b) => this.engine.buildExCard(a, b),
        myBoostMods: this.engine.activeBoostMods(player), randomness: this.randomness,
        myGaugeCount: this.engine.gaugeCount(player), myExceeded: player.exceeded,
        myCharacterKey: player.characterKey, myEddiePos: player.eddiePos,
        meFull: player, turnNumber: this.engine.turn,
      });
      aSel = this.engine.resolveStrikeCardSelection(player, selection);
    }
    if (!aSel && !this.engine.gameOver) {
      aSel = this.engine.resolveStrikeCardSelection(player, { type: 'wildswing' });
    }
    if (!aSel) { this.mode = 'game_over'; render(); return; }
    // Season 5 set-time option (see maybeAskSetTimeOption) — the CPU side resolves
    // inline, so the callback runs synchronously here.
    this.maybeAskSetTimeOption(player, human, aSel.card, true, () => {});
    aSel.criticalPaid = this.aiDecideCritical(player, human, aSel.card, aSel.fromWildSwing);
    // Sagat's Innate/Exceed: "may place your attack face up for +SPD[/+POW]" —
    // a real information-for-stats trade, so skip it on a Wild Swing (the
    // engine treats even the owner as not knowing that card yet — see
    // maybeAskCritical's hideCardName precedent for the same reasoning).
    const char = CHARACTERS[player.characterKey];
    if (canGoFaceUpWith(char, aSel.card) && !aSel.fromWildSwing) {
      aSel.faceUp = chooseFaceUp({ card: aSel.card, rng: Math.random, randomness: this.randomness });
      if (aSel.faceUp) this.engine.setFaceUpThisStrike(player, true);
    }
    this.pendingAiAttack = aSel;

    // Reading constraint on the HUMAN (defender) if the AI boosted Focus naming a card
    const reading = this.engine.consumeReading();
    this.sel = {};
    // GG Focus's boost: "When you initiate a Strike, the opponent must respond
    // with a Wild Swing." Checked here (attacker = AI, defender = human) — if
    // active, this OVERRIDES the Reading branch below entirely: Reading forces
    // a specific HAND card, which is meaningless if hand cards aren't a legal
    // choice at all right now.
    if (this.engine.mustWildSwing(player, human)) {
      this.log(`CPU's Focus forces you to respond with a Wild Swing.`);
      this.sel = { forcedWildSwingOnly: true };
    } else if (reading && reading.boosterId === this.aiId) {
      const human2 = this.human();
      const forced = human2.hand.find(c => c.key === reading.cardKey);
      if (forced) {
        this.log(`CPU's Reading names ${cardNameForKey(reading.cardKey)} — you must defend with it if you have it.`);
        this.sel = { forcedUid: forced.uid, forcedName: forced.name };
      } else {
        this.log(`CPU's Reading names ${cardNameForKey(reading.cardKey)} — you don't have it, your hand is revealed but you may defend freely.`);
        this.engine.recordHandReveal(human2);
      }
    }
    this.mode = 'defend_select';
    render();
  }

  humanDefend(choice) {
    const human = this.human(), aiP = this.ai();
    if (this.sel && this.sel.forcedWildSwingOnly) {
      if (choice.type !== 'wildswing') return; // ignore illegal picks while forced
    } else if (this.sel && this.sel.forcedUid) {
      if (!(choice.type === 'hand' && choice.uid === this.sel.forcedUid)) return; // ignore illegal picks while forced
    }
    const dSel = this.engine.resolveStrikeCardSelection(human, choice);
    if (!dSel) {
      if (this.engine.gameOver) { this.mode = 'game_over'; render(); return; }
      this.mode = 'defend_select'; render(); return;
    }
    const hideCardName = choice.type === 'wildswing';
    // Jin's Innate says "when you set your attack", which includes defending — so the
    // set-time option is offered here too (the initiator-only ones filter themselves
    // out via setTimeOptionFor's `initiatorOnly`).
    this.maybeAskSetTimeOption(human, aiP, dSel.card, false, () => {
    this.maybeAskCritical(human, dSel.card, hideCardName, (paid) => {
      dSel.criticalPaid = paid;
      const gaugePay = { [this.aiId]: !!this.pendingAiAttack.criticalPaid, [this.humanId]: !!dSel.criticalPaid };
      this.ai().strikeThisTurn = true; // Leo's Exceed: track that AI struck this turn
      const gen = this.engine.resolveStrikeSteps({ initiator: this.aiId, attackerSel: this.pendingAiAttack, defenderSel: dSel, gaugePay });
      this.driveStrikeGen(gen, undefined);
    });
    });
  }

  setRightRailTab(tab) {
    if (!['log', 'normals', 'coach'].includes(tab)) return;
    this.rightRailTab = tab;
    this.mobilePanelTab = tab;
    this.showNormalMatrix = (tab === 'normals');
    if (tab === 'coach') this.coachUnreadDot = false;
    render();
  }

  setMobilePanelTab(tab) {
    if (!['inspector', 'log', 'normals', 'coach'].includes(tab)) return;
    this.mobilePanelTab = tab;
    if (tab !== 'inspector') {
      this.rightRailTab = tab;
      this.showNormalMatrix = (tab === 'normals');
      if (tab === 'coach') this.coachUnreadDot = false;
    }
    render();
  }

  syncMobilePanelTabDOM() {
    if (typeof document === 'undefined' || !document.querySelector) return;
    const tab = this.mobilePanelTab || 'inspector';
    const stage = document.querySelector('.gameplay-stage');
    if (stage && stage.dataset) stage.dataset.mobileTab = tab;
    const rail = document.querySelector('.right-rail');
    if (rail && rail.dataset) rail.dataset.mobileTab = tab;
    if (document.querySelectorAll) {
      for (const btn of document.querySelectorAll('[data-mobile-tab-btn]')) {
        if (!btn.classList || !btn.setAttribute) continue;
        const isActive = btn.dataset && btn.dataset.mobileTabBtn === tab;
        btn.classList.toggle('active', !!isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      }
    }
  }

  toggleRightRail() {
    this.rightRailCollapsed = !this.rightRailCollapsed;
    render();
  }

  toggleMute() {
    if (typeof UXSettings !== 'undefined') {
      UXSettings.set('muted', !UXSettings.get('muted'));
    }
    render();
  }

  findInspectableCard(uid) {
    if (!uid) return null;
    const human = this.human();
    const ai = this.ai();
    const pools = [
      (human && human.hand) || [],
      (human && human.gauge) || [],
      (this.sel && this.sel.peeked) || [],
      (this.sel && this.sel.matchingCards) || [],
      ((human && human.boostsInPlay) || []).map(b => b.card).filter(Boolean),
      ((ai && ai.boostsInPlay) || []).map(b => b.card).filter(Boolean),
    ];
    for (const pool of pools) {
      const found = pool.find(c => c && (c.uid === uid || c.key === uid));
      if (found) return found;
    }
    return (typeof SimulateStrikePreview !== 'undefined' && SimulateStrikePreview.resolveCardByKey)
      ? SimulateStrikePreview.resolveCardByKey(uid)
      : null;
  }

  onCardHover(uid, isEX) {
    const baseCard = this.findInspectableCard(uid);
    if (!baseCard) return;
    const card = isEX
      ? { ...baseCard, isEX: true, pow: (baseCard.pow || 0) + 1, spd: (baseCard.spd || 0) + 1, arm: (baseCard.arm || 0) + 1, grd: (baseCard.grd || 0) + 1 }
      : baseCard;
    this.inspectorTarget = { kind: 'card', card, rawCard: baseCard, uid, isEX: !!isEX };
    if (typeof updateUniversalInspectorSlot === 'function') updateUniversalInspectorSlot();
    if (typeof EventBus !== 'undefined') {
      EventBus.emit('OnCardHoverStart', { card: baseCard, isEX: !!isEX });
    }
  }

  onCardHoverEnd() {
    this.inspectorTarget = null;
    if (typeof updateUniversalInspectorSlot === 'function') updateUniversalInspectorSlot();
    const selCard = (this.mode === 'awaiting_action' && this.selectedActionCardUid && this.human())
      ? this.human().hand.find(c => c.uid === this.selectedActionCardUid)
      : null;
    if (selCard) {
      if (typeof StrikePreviewController !== 'undefined' && StrikePreviewController.syncSelectedCard) {
        StrikePreviewController.syncSelectedCard(selCard, false);
      } else if (typeof EventBus !== 'undefined') {
        EventBus.emit('OnCardHoverStart', { card: selCard, isEX: false });
      }
      return;
    }
    if (typeof EventBus !== 'undefined') {
      EventBus.emit('OnCardHoverEnd', {});
    }
  }

  onHudPillHover(kind, who, boostUid) {
    const player = who === 'human' ? this.human() : this.ai();
    if (!player) return;
    if (kind === 'innate') {
      this.inspectorTarget = { kind: 'innate', who, player };
    } else if (kind === 'boost') {
      const entry = (player.boostsInPlay || []).find(b => b.card && (b.card.uid === boostUid || b.card.key === boostUid));
      if (!entry) return;
      this.inspectorTarget = { kind: 'boost', who, player, boostEntry: entry, card: entry.card };
    }
    if (typeof updateUniversalInspectorSlot === 'function') updateUniversalInspectorSlot();
  }

  onHudPillClick(kind, who, boostUid) {
    this.mobilePanelTab = 'inspector';
    if (this.rightRailCollapsed) {
      this.rightRailCollapsed = false;
      this.onHudPillHover(kind, who, boostUid);
      render();
      return;
    }
    this.onHudPillHover(kind, who, boostUid);
    this.syncMobilePanelTabDOM();
  }

  onHudPillHoverEnd() {
    this.inspectorTarget = null;
    if (typeof updateUniversalInspectorSlot === 'function') updateUniversalInspectorSlot();
  }

  toggleNormalMatrix() {
    if (this.rightRailTab === 'normals' && !this.rightRailCollapsed) {
      this.rightRailTab = 'log';
      this.mobilePanelTab = 'log';
      this.showNormalMatrix = false;
    } else {
      this.rightRailCollapsed = false;
      this.rightRailTab = 'normals';
      this.mobilePanelTab = 'normals';
      this.showNormalMatrix = true;
    }
    render();
  }

  selectActionCard(uid) {
    if (this.mode !== 'awaiting_action' || this.engine.active !== this.humanId || this.engine.gameOver) return;
    this.selectedActionCardUid = (this.selectedActionCardUid === uid) ? null : uid;
    if (this.selectedActionCardUid) this.mobilePanelTab = 'inspector';
    render();
  }

  cancelActionCard() {
    this.selectedActionCardUid = null;
    render();
  }

  confirmActionCard(actionType) {
    const uid = this.selectedActionCardUid;
    this.selectedActionCardUid = null;
    if (!uid || this.mode !== 'awaiting_action' || this.engine.active !== this.humanId || this.engine.gameOver) return;
    const p = this.human();
    if (actionType === 'strike') {
      this.mode = 'strike_select';
      this.pickStrikeCard(uid);
    } else if (actionType === 'boost') {
      this.mode = 'boost_select';
      this.pickBoostCard(uid);
    } else if (actionType === 'ex') {
      const card = p.hand.find(c => c.uid === uid);
      const other = card && p.hand.find(c => c.key === card.key && c.uid !== uid);
      if (card && other) {
        this.mode = 'strike_select';
        this.pickExStrike(uid, other.uid);
      }
    }
  }

  onCardDragStart(ev, uid) {
    if (this.mode !== 'awaiting_action' || this.engine.active !== this.humanId) return;
    this.draggingCardUid = uid;
    if (ev && ev.dataTransfer) {
      ev.dataTransfer.setData('text/plain', uid);
      ev.dataTransfer.effectAllowed = 'move';
    }
    if (typeof setDragZoneActive === 'function') setDragZoneActive(true);
  }

  onCardDragEnd() {
    this.draggingCardUid = null;
    if (typeof setDragZoneActive === 'function') setDragZoneActive(false);
  }

  onBoardDrop(ev) {
    this.draggingCardUid = null;
    if (typeof setDragZoneActive === 'function') setDragZoneActive(false);
    if (this.mode !== 'awaiting_action' || this.engine.active !== this.humanId || !ev || !ev.dataTransfer) return;
    ev.preventDefault();
    const uid = ev.dataTransfer.getData('text/plain');
    if (!uid) return;
    if (typeof UXSettings !== 'undefined' && UXSettings.get('quickCommit')) {
      this.selectedActionCardUid = uid;
      this.confirmActionCard('strike');
    } else {
      this.selectedActionCardUid = uid;
      render();
    }
  }

  onBoostDrop(ev) {
    this.draggingCardUid = null;
    if (typeof setDragZoneActive === 'function') setDragZoneActive(false);
    if (this.mode !== 'awaiting_action' || this.engine.active !== this.humanId || !ev || !ev.dataTransfer) return;
    ev.preventDefault();
    const uid = ev.dataTransfer.getData('text/plain');
    if (!uid) return;
    if (typeof UXSettings !== 'undefined' && UXSettings.get('quickCommit')) {
      this.selectedActionCardUid = uid;
      this.confirmActionCard('boost');
    } else {
      this.selectedActionCardUid = uid;
      render();
    }
  }

  clickBoardSpace(spaceIdx) {
    if (this.mode !== 'awaiting_action' || this.engine.active !== this.humanId || this.engine.gameOver) return;
    const player = this.human(), opp = this.ai();
    if (spaceIdx === player.pos || spaceIdx === opp.pos) return;

    const dirToOpp = player.pos < opp.pos ? 1 : -1;
    const delta = spaceIdx - player.pos;
    const isAdvance = (delta * dirToOpp) > 0;
    const dir = isAdvance ? 'advance' : 'retreat';
    let spaces = Math.abs(delta);

    if (isAdvance) {
      const crossedOpp = (opp.pos - player.pos) * dirToOpp > 0 && (spaceIdx - opp.pos) * dirToOpp > 0;
      if (crossedOpp) spaces = Math.abs(delta) - 1;
      const sim = this.engine.simulateAdvance(player.pos, opp.pos, spaces);
      if (sim.pos !== spaceIdx) return;
    }
    const force = this.forceForMove(player, opp, dir, spaces);
    if (force <= 0) return;
    const suggested = this.engine.pickExactForceCards(player, force);
    if (!suggested) return;

    this.selectedActionCardUid = null;
    this.sel = { dir, spaces, force, chosen: suggested };
    this.mode = 'move_force_select';
    render();
  }
}


// ===== engine.js =====
// ============================================================
// ENGINE — Exceed POC rules engine (pure logic, no rendering)
// ============================================================

const BOARD_SIZE = 9; // spaces 0..8

// Graphical-effects vocabulary (see HANDOFF.md's "graphical FX" section).
// One glyph per event kind, reused everywhere: prefixed onto the text log line
// AND carried on the parallel fxQueue entry render.js/ui.js consume for board
// badges + paced playback. Emoji picked with FE0F variation selectors where the
// glyph defaults to text presentation on Segoe UI Emoji (Windows) — see the
// render.js FX_CSS comment for the font-family fallback that makes them color.
const FX_ICONS = {
  hit: '\u{1F4A5}', miss: '❌', damage: '\u{1FA79}', armor: '\u{1F6E1}️',
  stun: '\u{1F4AB}', move: '➡️', critical: '⭐', ex: '✨',
  draw: '\u{1F0CF}', discard: '\u{1F5D1}️', gauge: '\u{1FAAB}', force: '⚡',
  boost: '⬆', boostexpire: '⌛', sustain: '\u{1F4CC}', seal: '\u{1F512}',
  reshuffle: '\u{1F500}', heal: '\u{1F49A}', exceed: '\u{1F525}', revert: '⤵️',
  overdrive: '\u{1F300}', advantage: '\u{1F501}', action: '➕', immune: '\u{1F6AB}',
  // Reserved extension points: defined here so a future card/hook can adopt them
  // with no plumbing change (see HOWTOPLAY_ICONS in shell.html, which lists only
  // the kinds actually passed to logMsg today) — no call site tags 'critical',
  // 'wildswing', or 'reveal' yet, so these three currently never appear in-game.
  wildswing: '\u{1F3B2}', reveal: '\u{1F441}️',
};

function fxIcon(kind) { return FX_ICONS[kind] || ''; }

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor((rng ? rng() : Math.random()) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildDeck(characterKey, uidFn) {
  const char = CHARACTERS[characterKey];
  const cards = [];
  // A character's own `normals` field (see cards.js's GG_NORMALS/CHARACTERS.axl)
  // picks which shared Normals pool they draw from — defaults to the base
  // NORMALS (S1-5) set when omitted, so Ryu/Ken/Cammy/Zangief are unaffected by
  // this becoming per-character instead of hardcoded to NORMALS.
  const normalsPool = char.normals || NORMALS;
  for (const c of normalsPool) { cards.push({ ...c }); cards.push({ ...c }); }
  // `copies` on a card definition overrides the default 2-per-deck count (see
  // Axl's Sickle Flash, which the source spreadsheet explicitly calls out as
  // having four copies instead of the usual two) — everything else keeps
  // pushing exactly twice, same as before this field existed.
  for (const c of char.specials) {
    // Season 5 Astral Heat cards never start in the deck — they sit out of play
    // until their owner takes the Reshuffle action (see Engine's constructor, which
    // sets them aside, and manualReshuffle/endOfTurnDraw, which bring them in).
    if (c.isAstral) continue;
    // `copies: 0` is a real value (Happy Chaos's Deus Ex Machina is never in the deck),
    // so this cannot use `||` — that would silently turn 0 back into the default 2.
    const n = c.copies == null ? 2 : c.copies;
    for (let i = 0; i < n; i++) cards.push({ ...c });
  }
  let localUid = 1;
  const next = uidFn || (() => 'c' + (localUid++));
  return cards.map(c => ({ ...c, uid: next() }));
}

function makeStrikeState() {
  return {
    focusActive: false,
    rangeImmune: [],
    blocksOpponentPassThrough: false,
    unhittable: false,
    faceUp: false,
    setOptionStatMods: null,
    setOptionRangeBonus: 0,
    setOptionAfter: null,
    wasHit: false,
  };
}

function resetStrikeState(player) {
  const s = player.strikeState;
  s.focusActive = false;
  s.rangeImmune = [];
  s.blocksOpponentPassThrough = false;
  s.unhittable = false;
  s.faceUp = false;
  s.setOptionStatMods = null;
  s.setOptionRangeBonus = 0;
  s.setOptionAfter = null;
  s.wasHit = false;
}

function makePlayer(id, name, characterKey, startPos) {
  return {
    id, name, characterKey,
    life: 30, maxLife: 30,
    pos: startPos,
    hand: [],
    deck: [],
    discard: [],
    gauge: [],
    boostsInPlay: [], // continuous boosts {card, ownerId}
    exceeded: false,
    reshuffleUsed: false,
    advantage: false,
    sealedTopOfDeckNote: null,
    sealedCards: [], // cards sealed from hand (can't be played, but not discarded/gauged)
    strikeState: makeStrikeState(),
    // Axl's One Vision boost: "Action: Discard this from play and take 3
    // actions." See engine.useBurstAction and ui.js's finishNonStrikeAction/
    // aiFinishNonStrike (which check this instead of passing the turn when
    // it's > 0) and resolveStrikeSteps' end-of-strike reset above.
    extraActionsRemaining: 0,
    // Sol Badguy's Innate/Exceed: "When you Strike, if you Canceled this
    // turn, +1/+2POW." Set true the moment this player pays for a Cancel
    // (see ui.js's resolveCancelChoice/runAITurn's Cancel branch/
    // aiHandleDeckLook's Cancel branch), reset false at every point the
    // engine hands turn control TO this player (see every
    // `this.engine.active = ...` assignment in ui.js) — i.e. it covers the
    // whole run of actions a player takes before passing the turn (Cancel
    // chains, Advantage continuations, burst actions all count as "this
    // turn"), not just a single action.
    canceledThisTurn: false,
    // Revert support (un-Exceeding): Exceed state that can be toggled mid-turn.
    // See doRevert().
    revertPending: false,
    // Set by an effect that says "Exceed at end of turn" (Nagoriyuki's Innate); consumed
    // by endOfTurnDraw.
    exceedAtEndOfTurn: false,
    // Per-turn one-shot flags for mechanics like Ky's "first time each turn you Cancel".
    firstCancelThisTurn: true,
    // Strike tracking for Leo's Exceed: "When you end a turn without Striking, Revert."
    strikeThisTurn: false,
    // Character action that triggered a Strike this turn (for Baiken/I-No Exceed bonus POW)
    actionStrikeThisTurn: false,
    // Overdrive area (Season 5 / BlazBlue). Empty and unused for every other
    // season's characters. See the Overdrive section further down for the rules.
    overdrive: [],
    // Season 5 Astral Heat: the single copy waiting out of play, and the flag saying
    // this turn's end-of-turn draw should hand it over instead (see endOfTurnDraw).
    astralCard: null,
    _astralPending: false,
    // Zato-1's Eddie (Season 4). A THIRD entity on the board, owned by a player but
    // not a character: `null` means "out of play" (where he starts and where his
    // owner's Specials/Ultras send him back at Cleanup), otherwise a board space.
    // Every other character leaves this null forever. Eddie is explicitly "not a
    // character and is ignored when moving" (EXdata.xlsx's Zato-1 sheet), so NO
    // movement code reads this field — he never blocks, is never passed "through",
    // and is never pushed; the only things that read him are Zato's own range
    // calculation and his cards' text.
    eddiePos: null,
  };
}

class Engine {
  constructor(p1Char, p2Char, opts = {}) {
    this.log = [];
    // Parallel to `log`: structured events for board badges + paced playback
    // (see logMsg's optional kind/who/extra args). Never read by game logic —
    // purely a rendering feed. Drained by ui.js's playFx(), one entry per step.
    this.fxQueue = [];
    // Structured record of the most recent Strike, for the UI's step-by-step
    // breakdown (written in resolveStrikeSteps; never read by game logic). Declared
    // here so it is always a defined field — the UI reads it before any Strike has
    // happened, and `null` is a state it must handle, `undefined` is a bug.
    this.lastStrikeInfo = null;
    this.rng = opts.rng || Math.random;
    this._nextUid = 1;
    this.turn = 0;
    this.gameOver = false;
    this.winner = null;

    this.players = {
      p1: makePlayer('p1', opts.p1Name || CHARACTERS[p1Char].name, p1Char, 2),
      p2: makePlayer('p2', opts.p2Name || CHARACTERS[p2Char].name, p2Char, 6),
    };
    this.players.p1.deck = shuffle(buildDeck(p1Char, () => this.nextUid()), this.rng);
    this.players.p2.deck = shuffle(buildDeck(p2Char, () => this.nextUid()), this.rng);
    // Season 5 Astral Heat: one copy, out of play, claimed by the Reshuffle action.
    for (const pid of ['p1', 'p2']) {
      const p = this.players[pid];
      const astral = CHARACTERS[p.characterKey].specials.find(c => c.isAstral);
      p.astralCard = astral ? { ...astral, uid: 'astral_' + pid } : null;
    }

    this.active = 'p1'; // whose turn it is to choose an action
    this.pendingWinner = null;
  }

  nextUid() { return 'c' + (this._nextUid++); }

  other(pid) { return pid === 'p1' ? 'p2' : 'p1'; }
  P(pid) { return this.players[pid]; }

  // `kind` (optional) prefixes the matching FX_ICONS glyph onto the log line AND
  // pushes a parallel fxQueue entry for board-badge/paced-playback rendering.
  // `who` is the acting player's id ('p1'/'p2'), needed for board badges (they
  // read the player's CURRENT position at playback time rather than capturing
  // pos here — see FX section of HANDOFF.md). Omit kind entirely for log-only
  // lines that should never appear as an fx event (e.g. round headers).
  logMsg(msg, kind, who, extra) {
    this.log.push(kind ? `${fxIcon(kind)} ${msg}`.trim() : msg);
    if (this.log.length > 400) this.log.splice(0, this.log.length - 400);
    if (kind) {
      this.fxQueue.push({ kind, who: who || null, ...extra });
      if (this.fxQueue.length > 200) this.fxQueue.splice(0, this.fxQueue.length - 200);
    }
  }

  // Pluralization helper for movement log messages — "1 space" vs "3 spaces" —
  // used everywhere a card/action logs a distance moved, instead of the
  // ungrammatical "space(s)" placeholder that was previously hardcoded at each
  // call site.
  spaceWord(n) { return `${n} space${n === 1 ? '' : 's'}`; }

  // Numbers EVERY round — strike exchanges number themselves inline (see
  // resolveStrikeSteps), but a "round" also covers single non-strike actions
  // (Prepare/Move/Boost/Change Cards/Exceed/character actions) so the fight log can
  // group and number them the same way. Call this once, before logging anything else
  // for that action.
  startRound() {
    this.roundNum = (this.roundNum || 0) + 1;
    this.logMsg(`\u2014\u2014\u2014 Round ${this.roundNum} \u2014\u2014\u2014`);
    return this.roundNum;
  }

  // Axl's Sickle Storm boost: "Look at the top 3 cards of your deck..." — pops N
  // cards off the top (same LIFO direction as draw(), reshuffling the discard in
  // first if the deck runs out mid-peek, same as draw() does) and returns them
  // WITHOUT deciding their fate yet — that's resolveDeckLookChoice's job. A
  // player can genuinely have fewer than N cards left between their deck and
  // discard combined; this just returns as many as it can find (possibly 0).
  peekTopN(player, n) {
    const peeked = [];
    for (let i = 0; i < n; i++) {
      if (player.deck.length === 0) {
        if (!player.reshuffleUsed && player.discard.length > 0) {
          player.deck = shuffle(player.discard, this.rng);
          player.discard = [];
          player.reshuffleUsed = true;
        } else {
          break;
        }
      }
      if (player.deck.length === 0) break;
      peeked.push(player.deck.pop());
    }
    return peeked;
  }

  // Resolves what happens to the cards peekTopN returned: `chosenUid` (or null
  // for "discard all") picks one, `mode` is 'boost'|'strike'|null deciding what
  // to do with it. The other peeked cards are always discarded. Returns
  // `{ struckWith: card|null }` — if mode==='strike', the caller (ui.js) still
  // has to actually run the Strike using that card (via
  // resolveStrikeCardSelection's `{type:'decklook', card}`); this method only
  // handles the deck-look bookkeeping itself, same separation of concerns as
  // every other "resolve a boost, `triggersStrike` tells the caller to follow up
  // with an actual Strike" case already in this codebase (e.g. Focus).
  resolveDeckLookChoice(player, opponent, peekedCards, chosenUid, mode) {
    const chosen = chosenUid ? peekedCards.find(c => c.uid === chosenUid) : null;
    const rest = peekedCards.filter(c => !chosen || c.uid !== chosen.uid);
    for (const c of rest) player.discard.push(c);
    if (rest.length > 0) {
      this.logMsg(`${player.name} discards ${rest.map(c => c.name).join(', ')} (Sickle Storm).`, 'discard', player.id);
    }
    if (!chosen) return { struckWith: null };
    if (mode === 'strike') {
      this.logMsg(`${player.name} will Strike with ${chosen.name} (Sickle Storm).`);
      return { struckWith: chosen };
    }
    if (mode === 'boost') {
      // Reuses playBoost as-is by temporarily making the chosen card look like
      // it's "in hand" (playBoost's very first line is a hand lookup) — it never
      // actually WAS in hand, but playBoost's own splice() call removes it right
      // back out again immediately, so this is a one-tick detour, not a lasting
      // state change. Force cost (if any) is still paid normally from hand/gauge
      // — Axl's own deck only ever contains {0}-cost boosts (see cards.js's
      // GG_NORMALS header comment), so this is always free in practice today,
      // but isn't hardcoded to assume that for whatever a future character's
      // deck-peek card might cost.
      player.hand.push(chosen);
      const need = this.cardBoostForce(chosen);
      // No way to pause mid-resolution and ask the player how to pay a nonzero
      // Force cost here (this whole method is synchronous, not a generator) —
      // a real gap if a future character's deck-peek card ever has boost.force
      // > 0. Axl's own deck never does (see the comment above), so this always
      // resolves correctly today; if `need > 0` ever happens, playBoost's own
      // "incorrect force payment" check below will simply reject it as `!ok`
      // rather than silently doing something wrong.
      const uids = [];
      const res = this.playBoost(player, opponent, chosen.uid, uids, null);
      return { struckWith: null, boostResult: res };
    }
    if (mode === 'draw') {
      // Bang's Innate action: "Look at the top 2 cards of your deck, draw 1, and
      // discard the other." Same peek-and-pick machinery, with the picked card going
      // to hand instead of being struck/boosted with.
      player.hand.push(chosen);
      this.logMsg(`${player.name} draws ${chosen.name} from the top of their deck.`, 'draw', player.id);
      return { struckWith: null };
    }
    // mode === null / anything else: chosen card just gets discarded like the rest.
    player.discard.push(chosen);
    this.logMsg(`${player.name} discards ${chosen.name}.`, 'discard', player.id);
    return { struckWith: null };
  }

  // ---------- deck / hand management ----------
  draw(player, n) {
    const drawn = [];
    for (let i = 0; i < n; i++) {
      if (player.deck.length === 0) {
        if (!player.reshuffleUsed && player.discard.length > 0) {
          this.logMsg(`${player.name}'s deck is empty — automatic reshuffle.`, 'reshuffle', player.id);
          player.deck = shuffle(player.discard, this.rng);
          player.discard = [];
          player.reshuffleUsed = true;
          if (typeof EventBus !== 'undefined') {
            EventBus.emit('OnDeckReshuffled', {
              playerId: player.id,
              auto: true,
              reshuffleUsed: true,
              deckCount: player.deck.length,
              discardCount: 0,
            });
          }
        } else if (player.discard.length > 0) {
          // already used the automatic reshuffle
          this.logMsg(`${player.name} has no cards left to draw and no reshuffle left — LOSS.`);
          this.gameOver = true;
          this.winner = this.other(player.id);
          return;
        } else {
          this.logMsg(`${player.name} has no cards anywhere left to draw — LOSS.`);
          this.gameOver = true;
          this.winner = this.other(player.id);
          return;
        }
      }
      if (player.deck.length === 0) continue;
      const card = player.deck.pop();
      player.hand.push(card);
      drawn.push(card);
    }
    // "Loud draw" (mirrors the "loud discard" invariant): the human ("You") sees
    // their own drawn cards' names — this is their own deck, not hidden info, so
    // naming them isn't a no-cheating violation. Deliberately NOT done for the
    // opponent's draws (player.name !== 'You'), which would leak their hand.
    if (drawn.length > 0 && player.name === 'You') {
      this.logMsg(`You draw: ${drawn.map(c => c.name).join(', ')}.`, 'draw', player.id);
    }
  }

  // Sagat's Innate/Exceed: "may place your attack face up for +SPD[/+POW]" — sets
  // the per-strike flag `liveStats` reads via CHARACTERS[key].faceUpStatBonus. Set
  // by ui.js at strike-commit time (human or AI), before resolveStrikeSteps runs.
  setFaceUpThisStrike(player, val) {
    player.strikeState.faceUp = !!val;
  }

  // Shuffle a player's discard pile back into their deck. The mechanical core of the
  // once-per-game Reshuffle action below, split out because Hakumen's Exceed ("When
  // you Exceed, shuffle your discard into your deck") does the same thing WITHOUT
  // consuming that once-per-game use, without the Astral Heat trigger, and without
  // the reshuffleUsed gate — so it cannot just call manualReshuffle.
  shuffleDiscardIntoDeck(player) {
    if (player.discard.length === 0) return 0;
    const n = player.discard.length;
    player.deck = shuffle([...player.deck, ...player.discard], this.rng);
    player.discard = [];
    this.logMsg(`${player.name} shuffles ${n} card(s) from their discard into their deck.`, 'reshuffle', player.id);
    return n;
  }

  manualReshuffle(player) {
    if (player.reshuffleUsed) return false;
    player.deck = shuffle([...player.deck, ...player.discard], this.rng);
    player.discard = [];
    player.reshuffleUsed = true;
    this.logMsg(`${player.name} reshuffles their discard into their deck.`, 'reshuffle', player.id);
    if (typeof EventBus !== 'undefined') {
      EventBus.emit('OnDeckReshuffled', {
        playerId: player.id,
        auto: false,
        reshuffleUsed: true,
        deckCount: player.deck.length,
        discardCount: 0,
      });
      EventBus.emit('OnNeutralAction', {
        playerId: player.id,
        kind: 'reshuffle',
      });
    }
    // Season 5 Astral Heat: a BlazBlue fighter's Astral starts out of play entirely
    // and comes to hand instead of the end-of-turn draw on the turn they take the
    // Reshuffle ACTION. Deliberately here and not in draw()'s own empty-deck
    // reshuffle: the rule explicitly excludes automatic reshuffles.
    if (player.astralCard) player._astralPending = true;
    // Nagoriyuki's Innate ("When you Reshuffle, Exceed at end of turn") — a character
    // hook rather than a Season-5-style flag, since the effect is his alone.
    const char = CHARACTERS[player.characterKey];
    if (char && char.onReshuffle) char.onReshuffle(this, player);
    return true;
  }

  // The end-of-turn draw. Split out into its own method because two Season 5
  // mechanics change it: the Astral Heat swap above, and Hakumen's Innate ("After
  // drawing at the end of your turn, add the top card of your deck to your Gauge").
  // Every turn-ending path (ui.js's finishNonStrikeAction/aiFinishNonStrike and both
  // AI-only test harnesses) goes through here instead of calling draw(player, 1).
  endOfTurnDraw(player) {
    if (player._astralPending && player.astralCard) {
      const card = player.astralCard;
      player.astralCard = null;
      player._astralPending = false;
      player.hand.push(card);
      this.logMsg(`${player.name} takes ${card.name} (Astral Heat) into hand instead of drawing.`, 'draw', player.id);
    } else {
      this.draw(player, 1);
    }
    const char = CHARACTERS[player.characterKey];
    if (char && char.onEndOfTurnDraw) char.onEndOfTurnDraw(this, player);
    // "Exceed at end of turn" (Nagoriyuki's Reshuffle trigger) — deferred to here so the
    // Reshuffle turn itself plays out un-Exceeded, exactly as the card text reads.
    if (player.exceedAtEndOfTurn) {
      player.exceedAtEndOfTurn = false;
      this.forceExceed(player);
    }
  }

  // ---------- opening-hand mulligan ----------
  // Once per game, before the first turn: set aside any number of opening-hand cards
  // face-down, draw that many new cards, then shuffle the set-aside cards back into the
  // deck. Free, no penalty, no limit on how many can be set aside (0 up to the whole
  // hand). Deliberately NOT built on manualReshuffle — that's the separate once-per-game
  // mid-game "reshuffle your discard into your deck" action; this is a same-count
  // hand-replacement that happens before the game's first turn and doesn't touch the
  // discard pile at all. `setAsideUids` may be empty (keeping the whole hand is legal).
  performMulligan(player, setAsideUids) {
    const uids = setAsideUids || [];
    if (uids.length === 0) {
      this.logMsg(`${player.name} keeps their opening hand.`);
      return;
    }
    const setAside = [];
    for (const uid of uids) {
      const idx = player.hand.findIndex(c => c.uid === uid);
      if (idx !== -1) setAside.push(player.hand.splice(idx, 1)[0]);
    }
    // Draw the replacements BEFORE shuffling the set-aside cards back in, so the new
    // draw can't immediately re-deal the exact cards just set aside.
    this.draw(player, setAside.length);
    player.deck = shuffle([...player.deck, ...setAside], this.rng);
    this.logMsg(`${player.name} mulligans ${setAside.length} card(s): drew ${setAside.length} new, shuffled the rest back into their deck.`, 'draw', player.id);
  }

  discardFromHand(player, uid) {
    const idx = player.hand.findIndex(c => c.uid === uid);
    if (idx === -1) return null;
    const [card] = player.hand.splice(idx, 1);
    player.discard.push(card);
    return card;
  }

  randomDiscardFromHand(player, n) {
    for (let i = 0; i < n; i++) {
      if (player.hand.length === 0) break;
      const idx = Math.floor(this.rng() * player.hand.length);
      const [card] = player.hand.splice(idx, 1);
      player.discard.push(card);
      this.logMsg(`${player.name} discards ${card.name} at random.`, 'discard', player.id);
    }
  }

  // Zangief's Ultimate Atomic Buster: "Hit: You and the opponent discard all
  // cards." Order/randomness don't matter since it's the whole hand.
  discardAllHand(player) {
    if (player.hand.length === 0) return;
    this.logMsg(`${player.name} discards their entire hand: ${player.hand.map(c => c.name).join(', ')}.`, 'discard', player.id);
    player.discard.push(...player.hand);
    player.hand = [];
  }

  // ---------- movement helpers ----------
  clampPos(p) { return Math.max(0, Math.min(BOARD_SIZE - 1, p)); }

  // Pure movement path simulator shared with SimulateStrikePreview.
  // mode: 'advance' | 'close' | 'retreat'
  // Returns { path: number[], endSpace: number, didCrossUp: boolean, wallTruncated: boolean }
  static simulateMovementPath(fromSpace, oppSpace, amount, mode, opts = {}) {
    const n = Math.max(0, amount | 0);
    const blocksPassThrough = !!opts.blocksPassThrough;
    const allowPass = mode === 'advance' && !blocksPassThrough;
    const path = [fromSpace];
    if (n === 0) {
      return { path, endSpace: fromSpace, didCrossUp: false, wallTruncated: false };
    }
    const dirToOpp = fromSpace <= oppSpace ? 1 : -1;
    const dir = mode === 'retreat' ? -dirToOpp : dirToOpp;
    let pos = fromSpace;
    let remaining = n;
    let didCrossUp = false;
    let wallTruncated = false;

    while (remaining > 0) {
      const next = pos + dir;
      if (next < 0 || next >= BOARD_SIZE) {
        wallTruncated = true;
        break;
      }
      if (next === oppSpace && mode !== 'retreat') {
        if (!allowPass) {
          // Close stops adjacent; wall/pass-block also stops adjacent
          break;
        }
        const landing = next + dir;
        if (landing < 0 || landing >= BOARD_SIZE) {
          wallTruncated = true;
          break;
        }
        pos = landing;
        didCrossUp = true;
        path.push(pos);
        remaining -= 1;
        continue;
      }
      pos = next;
      path.push(pos);
      remaining -= 1;
    }

    return { path, endSpace: pos, didCrossUp, wallTruncated };
  }

  // Advance: move toward opponent, may pass through/switch sides. amount = max spaces.
  // `forced` = "this is the opponent Pulling the mover, not the mover moving under
  // their own power". Pull is implemented as an advance of the TARGET (pushToward /
  // pullTowardWithoutPassing below), so without this flag every self-movement
  // restriction — Iron Tager's cap, Jin's/Nu-13's "the opponent cannot move" — would
  // wrongly apply to being Pulled as well, which both of those cards' own text (and
  // cappedSelfMove's own comment) explicitly says it must not.
  advanceSelf(mover, opponent, amount, allowPass, forced) {
    if (!forced) amount = this.cappedSelfMove(mover, amount); // Iron Tager's "move only 2 instead"
    const mode = allowPass ? 'advance' : 'close';
    const res = Engine.simulateMovementPath(mover.pos, opponent.pos, amount, mode, {
      blocksPassThrough: !!opponent.strikeState.blocksOpponentPassThrough,
    });
    mover.pos = res.endSpace;
  }

  // Close: like advance but stops at range 1, never passes.
  closeSelf(mover, opponent, amount) {
    this.advanceSelf(mover, opponent, amount, false);
  }

  retreatSelf(mover, opponent, amount) {
    amount = this.cappedSelfMove(mover, amount); // Iron Tager's "move only 2 instead"
    const res = Engine.simulateMovementPath(mover.pos, opponent.pos, amount, 'retreat');
    mover.pos = res.endSpace;
  }

  // ---- PAID movement (the "Move" action) ----
  // Passing through the opponent's space costs 2 Force for that one space; all other
  // space-transitions cost 1 Force. Free card-effect movement (advanceSelf/closeSelf/
  // retreatSelf above) does NOT have this extra pass cost, per the rulebook clarification.
  simulateAdvance(fromPos, oppPos, requestedSpaces) {
    const dir = fromPos <= oppPos ? 1 : -1;
    let pos = fromPos, spacesLeft = requestedSpaces, force = 0;
    while (spacesLeft > 0) {
      const next = pos + dir;
      if (next < 0 || next > BOARD_SIZE - 1) break;
      if (next === oppPos) {
        const landing = next + dir;
        if (landing < 0 || landing > BOARD_SIZE - 1) break;
        pos = landing; force += 2; spacesLeft -= 1;
      } else { pos = next; force += 1; spacesLeft -= 1; }
    }
    return { pos, force };
  }

  // ---- Observable-behaviour log (opponent modelling, see ai.js's handLikelihood) ----
  // A short, rolling record of the PUBLICLY VISIBLE things a player chose to do. This
  // is not hidden information by any reading of it — anyone sitting at the table watches
  // their opponent walk to Range 4 and decline an exchange. The AI's hand sampler was
  // previously a uniform draw over everything not visibly out of the opponent's deck,
  // and nothing the opponent DID ever updated it; a human who has seen you retreat
  // twice and pass knows a great deal more than that.
  // Capped at the last few entries: the point is a read on the CURRENT hand, and a hand
  // from eight turns ago has been drawn and discarded past.
  recordObservation(player, obs) {
    if (!player) return;
    if (!player.aiObs) player.aiObs = [];
    player.aiObs.push(obs);
    if (player.aiObs.length > 5) player.aiObs.shift();
  }

  advanceSelfPaid(mover, opponent, requestedSpaces) {
    const { pos, force } = this.simulateAdvance(mover.pos, opponent.pos, requestedSpaces);
    mover.pos = pos;
    this.recordObservation(mover, { type: 'move', dist: Math.abs(pos - opponent.pos) });
    return force;
  }

  retreatSelfPaid(mover, opponent, requestedSpaces) {
    const dir = mover.pos <= opponent.pos ? -1 : 1;
    const target = this.clampPos(mover.pos + dir * requestedSpaces);
    const force = Math.abs(target - mover.pos);
    mover.pos = target;
    this.recordObservation(mover, { type: 'move', dist: Math.abs(target - opponent.pos) });
    return force;
  }

  // Max spaces worth pursuing in a direction from the CURRENT state (for capping UI force selection
  // so the player physically cannot overspend Force beyond what's useful).
  // The paid Move action only ever offers Advance/Retreat (see the "Close removed from
  // Move" note where these lived before) — a paid "Close" direction was provably a
  // strict, degenerate subset of Advance: `simulateClose` and `simulateAdvance` computed
  // the exact same position and Force cost in every case where the requested spaces
  // didn't reach/cross the opponent, and Advance additionally supports actually crossing
  // (at extra Force) where Close simply refused. A player who wants to stop at range 1
  // gets identical cost and position by choosing Advance for that many spaces — Close
  // added a second UI button with zero reachable outcome Advance didn't already cover,
  // so it was removed rather than kept as a redundant third choice. (This is unrelated
  // to card-text "Close" — e.g. Ken's Innate action, Ryu's Shoryuken's Critical "Before:
  // Close 1" — which is FREE movement via `closeSelf`/`advanceSelf`, not this PAID
  // Move-action path, and is untouched: those are meaningful rules distinctions on
  // specific cards, not a redundant player-facing choice.)
  maxUsefulSpaces(mover, opponent, mode) {
    let n = 0;
    if (mode === 'advance') {
      for (let s = 1; s <= 8; s++) {
        const sim = this.simulateAdvance(mover.pos, opponent.pos, s);
        if (sim.pos === mover.pos && s > 1) break;
        n = s;
        const check = this.simulateAdvance(mover.pos, opponent.pos, s + 1);
        if (check.pos === sim.pos) break;
      }
    } else if (mode === 'retreat') {
      n = Math.abs(this.clampPos(mover.pos + (mover.pos <= opponent.pos ? -8 : 8)) - mover.pos);
    }
    return n;
  }

  // Iron Tager's Spark Bolt boost: "You cannot be Pushed or Pulled" (the boost's
  // `movementImmuneGrant` flag). Unlike Focus (`movementImmune`, a per-Strike property
  // of the attack card being resolved) this is a continuous boost, so it is read off
  // boostsInPlay and lasts as long as the boost does. Both are the same question at
  // every call site, so they share one check.
  isPushPullImmune(target) {
    if (target.strikeState.focusActive) return `${target.name}'s Focus prevents them from being moved.`;
    for (const b of target.boostsInPlay) {
      if (b.card.boost && b.card.boost.movementImmuneGrant) {
        return `${target.name} cannot be Pushed or Pulled (${b.card.name}).`;
      }
    }
    return null;
  }

  pushAway(target, source, amount) {
    const immune = this.isPushPullImmune(target);
    if (immune) { this.logMsg(immune); return; }
    const dir = source.pos <= target.pos ? 1 : -1;
    target.pos = this.clampPos(target.pos + dir * amount);
  }

  // "Move up to N" self-movement effects that aren't core strategic decisions (e.g.
  // Metsu Hadoken's After, One Inch Punch's boost) — auto-resolve to the max amount
  // toward the opponent, per the conscious scope decision documented in cards.js's
  // header comment (avoids a UI pause for a low-stakes choice).
  moveChoice(mover, amount) {
    const opp = this.P(this.other(mover.id));
    this.advanceSelf(mover, opp, amount, true);
  }

  // Dive's Tech: discard one of the opponent's active continuous boosts. `targetUid`
  // (the card.uid of a specific boostsInPlay entry) lets the caller choose WHICH one
  // when 2+ are active — a player can genuinely have multiple continuous boosts in
  // play at once (nothing here auto-replaces an older one when a new one is played;
  // each just persists until consumed by that player's own next Strike or an expiry
  // clause), so "target a specific boost" is a real choice, not just theoretical.
  // Falls back to the most-recently-played one if no (or an unmatched) targetUid is
  // given — safe default for the common 0-or-1-boost case, where there's nothing to
  // actually choose between.
  discardOpponentContinuousBoost(opponent, targetUid) {
    if (opponent.boostsInPlay.length === 0) return;
    let idx = opponent.boostsInPlay.length - 1;
    if (targetUid) {
      const found = opponent.boostsInPlay.findIndex(b => b.card.uid === targetUid);
      if (found !== -1) idx = found;
    }
    const [b] = opponent.boostsInPlay.splice(idx, 1);
    opponent.discard.push(b.card);
    this.logMsg(`${opponent.name}'s ${b.card.name} boost is discarded.`, 'discard', opponent.id);
  }

  // Axl's One Vision boost: "Action: Discard this from play and take 3
  // actions." A per-turn action (like Prepare/Move/Boost/etc.) generically
  // available whenever ANY of a player's own boostsInPlay has
  // `card.boost.grantsBurstAction` (see render.js's actionButtons(), which
  // shows a button for it the same data-driven way) — not hardcoded to Axl or
  // to One Vision by key. Discards that specific boost entry and grants its
  // `extraActions` count; ui.js's finishNonStrikeAction/aiFinishNonStrike
  // check `player.extraActionsRemaining` afterward and loop the SAME player
  // back to choosing another action instead of passing the turn, once per
  // remaining count.
  useBurstAction(player, boostUid) {
    const idx = player.boostsInPlay.findIndex(b => b.card.uid === boostUid && b.card.boost && b.card.boost.grantsBurstAction);
    if (idx === -1) return false;
    const [entry] = player.boostsInPlay.splice(idx, 1);
    player.discard.push(entry.card);
    const extra = entry.card.boost.grantsBurstAction.extraActions || 0;
    player.extraActionsRemaining = (player.extraActionsRemaining || 0) + extra;
    this.logMsg(`${player.name} discards ${entry.card.name} from play to take ${extra} extra actions.`, 'action', player.id);
    return true;
  }

  range(a, b) { return Math.abs(a.pos - b.pos); }

  // "Advance as far as possible" (Cammy's Gyro Drive Smasher) — reuses advanceSelf
  // with an amount guaranteed to exceed the board's longest possible distance;
  // advanceSelf's own edge-clamping/jump-over logic naturally caps the real result,
  // so no new movement primitive is actually needed, just this thin named wrapper
  // (keeps BOARD_SIZE-derived magic numbers out of cards.js).
  advanceAsFarAsPossible(mover, opponent) {
    this.advanceSelf(mover, opponent, BOARD_SIZE, true);
  }

  // "At the edge of the arena" (Cammy's Razor's Edge Slicer) — kept as an engine
  // method rather than inlined in a cards.js hook so BOARD_SIZE stays owned by
  // engine.js, matching every other board-geometry concern in this codebase.
  isAtEdge(player) { return player.pos === 0 || player.pos === BOARD_SIZE - 1; }

  // ---------- Eddie (Zato-1's token) ----------
  // Eddie is a board position owned by a player, not a character: he never moves on
  // his own, never blocks anyone, and is only ever placed or removed by card text.
  // Everything below is data-driven off CHARACTERS[key].usesEddie, so no other code
  // path has to know Zato-1 exists.
  usesEddie(player) { return !!(CHARACTERS[player.characterKey] && CHARACTERS[player.characterKey].usesEddie); }
  eddieInPlay(player) { return this.usesEddie(player) && player.eddiePos != null; }
  placeEddie(player, pos, sourceName) {
    const clamped = Math.max(0, Math.min(BOARD_SIZE - 1, pos));
    const wasOut = player.eddiePos == null;
    player.eddiePos = clamped;
    this.logMsg(`${player.name} ${wasOut ? 'places' : 'moves'} Eddie ${wasOut ? 'into' : 'to'} space ${clamped + 1}${sourceName ? ` (${sourceName})` : ''}.`, 'boost', player.id);
    return clamped;
  }
  removeEddie(player, sourceName) {
    if (player.eddiePos == null) return false;
    player.eddiePos = null;
    this.logMsg(`Eddie is removed from play${sourceName ? ` (${sourceName})` : ''}.`, 'boostexpire', player.id);
    return true;
  }
  // Every space Eddie may legally be placed in for a given effect. "Any space" is the
  // whole board; "within this attack's Range" is measured from the ATTACKER (the
  // attack's own origin — Eddie is where the attack is being sent, not where it came
  // from), using the card's printed band, and can therefore be empty for a card with
  // no printed Range at all, in which case the placement simply isn't offered.
  eddiePlacementSpaces(player, card, anySpace) {
    const spaces = [];
    for (let i = 0; i < BOARD_SIZE; i++) {
      if (anySpace) { spaces.push(i); continue; }
      if (!card || !card.range) continue;
      const d = Math.abs(i - player.pos);
      if (d >= card.range[0] && d <= card.range[1]) spaces.push(i);
    }
    return spaces;
  }
  // Where an attack is measured FROM. Normally the attacker; for a character whose
  // Specials/Ultras "calculate Range from Eddie" (Zato-1's Innate) it is Eddie's
  // space while he is in play. Used both by the Strike's own range check and by
  // "from the source of this attack" card text (Zato's Leap).
  attackSourcePos(attacker, card) {
    const char = CHARACTERS[attacker.characterKey];
    if (char && char.specialsRangeFromEddie && this.eddieInPlay(attacker) &&
        card && (card.type === 'special' || card.type === 'ultra')) {
      return attacker.eddiePos;
    }
    return attacker.pos;
  }
  // Distance an attack actually has to cover — `range(attacker, defender)` for
  // everyone except a Zato-1 measuring a Special/Ultra from Eddie.
  attackRange(attacker, defender, card) {
    return Math.abs(this.attackSourcePos(attacker, card) - defender.pos);
  }

  // "Push N from the source of this attack" (Zato-1's Leap) — the push is measured
  // from wherever the attack came FROM, which for a Zato-1 Special/Ultra is Eddie,
  // not Zato himself. pushAway only ever reads `source.pos`, so a bare position
  // stand-in is all this needs.
  pushAwayFromAttackSource(attacker, defender, card, amount) {
    this.pushAway(defender, { pos: this.attackSourcePos(attacker, card) }, amount);
  }

  // "You may add a card from your hand to your Gauge" printed on a BOOST (Zato-1's
  // Oppose), where there is no picker to pause for — auto-takes it with the
  // lowest-POW card, the same convention the AI's hand-to-Gauge action uses, per this
  // codebase's "don't pause the UI for a low-stakes choice" rule. Banking Gauge is
  // never a cost here, so the "may" auto-resolves to yes.
  addLowestCardFromHandToGauge(player, sourceName) {
    if (player.hand.length === 0) return null;
    const worst = player.hand.reduce((a, b) => ((b.pow || 0) < (a.pow || 0) ? b : a));
    player.hand.splice(player.hand.findIndex(c => c.uid === worst.uid), 1);
    player.gauge.push(worst);
    this.logMsg(`${player.name} adds ${worst.name} from hand to Gauge${sourceName ? ` (${sourceName})` : ''}.`, 'gauge', player.id);
    return worst;
  }

  // Vega's Bloody High Claw: "if there are 3 or more spaces behind the
  // opponent" — spaces on the far side of `target`, away from `source`
  // (i.e. the room `target` would have to retreat into before hitting the
  // edge). Direction mirrors advanceSelf's own convention (source moves
  // toward target using this same sign).
  spacesBehindAwayFrom(target, source) {
    const dir = source.pos <= target.pos ? 1 : -1;
    return dir === 1 ? (BOARD_SIZE - 1 - target.pos) : target.pos;
  }

  // Vega's Bloody High Claw / Splendid Claw boosts: "Cleanup: If you weren't
  // stunned, you may spend {1} to sustain this card." A genuinely different
  // sustain shape from Cammy's Dive Kick (sustainIfNoNormalUsed, free) — this
  // one costs Force to take. Greedily prefers 1-Force-value cards first (so an
  // odd/small cost like 1 doesn't get forced to overpay with a 2-Force Ultra),
  // falling back to Ultras only if the remaining cost is still even. Returns
  // null if `cost` can't be paid exactly with what's on hand/gauge.
  pickExactForceCards(player, cost, excludeUid = null) {
    if (cost <= 0) return [];
    const pool = [...player.hand, ...player.gauge].filter(c => c.uid !== excludeUid);
    const ones = pool.filter(c => this.forceValueOfCard(c) === 1);
    const twos = pool.filter(c => this.forceValueOfCard(c) === 2);
    let useOnes = Math.min(ones.length, cost);
    if ((cost - useOnes) % 2 !== 0) useOnes--;
    if (useOnes < 0) return null;
    const needTwos = (cost - useOnes) / 2;
    if (needTwos > twos.length) return null;
    return [
      ...ones.slice(0, useOnes).map(c => c.uid),
      ...twos.slice(0, needTwos).map(c => c.uid),
    ];
  }

  // Vega's Bloody High Claw boost: "your attacks are Critical" — a continuous
  // boost that makes EVERY attack card this player sets Critical for free
  // (no Gauge spent, no prompt). Checked by ui.js's maybeAskCritical/
  // resolveCriticalChoice and aiDecideCritical BEFORE the normal pay-1-Gauge
  // flow, so this bypasses that entirely rather than just changing its cost.
  hasFreeCriticalBoost(player) {
    return player.boostsInPlay.some(b => b.card.boost && b.card.boost.forcesFreeCritical);
  }

  // Vega's Sky High Claw boost: "put a Continuous Boost from your discard
  // into play" — no target is specified in the card text when multiple are
  // eligible, so (matching this codebase's "avoid a UI pause for a low-
  // stakes choice" convention already used for several "up to X" effects)
  // this auto-picks the one with the largest total |statMods|, a reasonable
  // proxy for "best," rather than prompting. Costs nothing to put into play
  // (the card doesn't say "paying its costs" the way Temple Massage's near-
  // identical effect does), so this bypasses playBoost entirely and pushes
  // straight into boostsInPlay.
  reviveBestContinuousBoostFromDiscard(player) {
    const candidates = player.discard.filter(c => c.boost && c.boost.continuous);
    if (candidates.length === 0) return null;
    const score = (c) => {
      const sm = c.boost.statMods || {};
      return Math.abs(sm.pow || 0) + Math.abs(sm.spd || 0) + Math.abs(sm.arm || 0) + Math.abs(sm.grd || 0);
    };
    const best = candidates.reduce((a, b) => (score(b) > score(a) ? b : a));
    const idx = player.discard.findIndex(c => c.uid === best.uid);
    player.discard.splice(idx, 1);
    this.putContinuousBoostIntoPlay(player, best,
      `${player.name} puts their ${best.name} boost from discard back into play (Sky High Claw).`);
    return best;
  }

  // Shared tail of every "a Continuous Boost enters play WITHOUT being played as a
  // Boost action" effect (Sky High Claw's revive above, Platinum's Cleanup reveal) —
  // no Force is paid and no `triggersStrike` follow-up is possible, so this
  // deliberately bypasses playBoost and just constructs the in-play entry, wiring up
  // the same expiry bookkeeping playBoost does. Returns the entry so the caller can
  // mark it (e.g. `_sustainOnce`).
  //
  // `opts.runImmediate` additionally fires the boost's one-off "Now:" clauses
  // (`nowDraw`/`nowClose`/`resolve`) — what "PLAY that boost" means (Platinum), as
  // opposed to "put it into play" (Sky High Claw, which is why that caller leaves it
  // off and keeps its long-standing behaviour). Only safe for boosts whose `resolve`
  // needs nothing but `{engine, player, opponent}`: a boost that asks the UI for a
  // target up front (`needsNameChoice`/`needsBoostTargetChoice`/`pushPullDirection`
  // and friends) has no one to ask from here, so its resolve is skipped rather than
  // run with an undefined target. None of them is continuous today.
  putContinuousBoostIntoPlay(player, card, logLine, opts = {}) {
    const entry = { card, ownerId: player.id };
    if (card.boost.expireToGaugeAfterTurns) { entry.turnsUntilExpire = card.boost.expireToGaugeAfterTurns; entry._skipNextExpiryCheck = true; }
    if (card.boost.expireToGaugeAtStartOfNextTurn) entry.turnsUntilStartExpire = 1;
    player.boostsInPlay.push(entry);
    if (logLine) this.logMsg(logLine, 'boost', player.id);
    if (opts.runImmediate) {
      const needsUiTarget = card.boost.needsNameChoice || card.boost.needsNormalNameChoice ||
        card.boost.needsRangeNameChoice || card.boost.needsBoostTargetChoice ||
        card.boost.needsDiscardBoostChoice || card.boost.needsPushPullChoice ||
        card.boost.needsDirectionChoice || card.boost.needsMovementChoice ||
        card.boost.needsAnySpaceChoice || card.boost.optionalForceSpend;
      if (card.boost.nowDraw) this.draw(player, card.boost.nowDraw);
      if (card.boost.nowClose) this.closeSelf(player, opts.opponent, card.boost.nowClose);
      if (card.boost.resolve && !needsUiTarget) {
        card.boost.resolve({ engine: this, player, opponent: opts.opponent, gaugeInsteadOfDiscard: false });
      }
    }
    return entry;
  }

  // ---------- gauge / force ----------
  gaugeCount(player) { return player.gauge.length; }

  // Zangief's Flying Power Bomb boost ("Name a Range. The opponent must discard a
  // card that includes that Range, or reveal a hand with none — confirmed with the
  // user directly: if multiple cards match, the OPPONENT chooses which one"). When
  // exactly 0 or 1 opponent cards match the named Range, this resolves immediately
  // and deterministically inside the card's own `resolve(ctx)` (see cards.js) —
  // same pattern as Block's naming. When 2+ match, there's a genuine choice to make
  // that boosts aren't set up to yield for (unlike Strikes), so `resolve(ctx)`
  // instead stashes it here for the caller (ui.js) to resolve as a follow-up step,
  // the same "resolve now, finish via a follow-up UI mode" shape already used for
  // discard-to-seven.
  resolvePendingRangeDiscard(uid) {
    const pending = this.pendingRangeDiscard;
    if (!pending) return false;
    const player = this.P(pending.playerId);
    const card = this.discardFromHand(player, uid);
    if (card) this.logMsg(`${player.name} chooses to discard their ${card.name} (matched Range ${pending.namedRange}, named by Flying Power Bomb).`, 'discard', player.id);
    this.pendingRangeDiscard = null;
    return true;
  }

  // Critical eligibility (see cards.js's header comment for the full rule): only
  // "Street Fighter" characters can use Criticals at all, and only if they can
  // actually afford the 1 Gauge. Centralized here so ui.js (human prompt) and
  // ai.js (AI decision) agree on the same check.
  canPayCritical(player) {
    return !!CHARACTERS[player.characterKey].isStreetFighter && this.gaugeCount(player) >= 1;
  }

  // Hakumen's cards: "You must spend [1] if able. If you do, <effect>." Mandatory, so
  // there is nothing to prompt for — spend when the Gauge is there, report whether it
  // happened so the caller can gate its effect on it. Deliberately NOT affected by his
  // Exceed's `gaugeCostsFree`: that reduces COSTS (paying for an Ultra, Exceeding),
  // while this is the card spending Gauge as its own effect, which the Exceed text
  // doesn't touch. Spent cards go to the discard, same as spendGauge's Force path.
  spendGaugeIfAble(player, n) {
    if (this.gaugeCount(player) < n) return false;
    const spent = this.spendGauge(player, n);
    player.discard.push(...spent);
    this.logMsg(`${player.name} spends ${n} Gauge.`, 'gauge', player.id);
    return true;
  }

  spendGauge(player, n) {
    // gauge is unordered; discard any n cards from gauge (to the discard pile per rules
    // when spent as Force; when spent for costs like Exceed/Ultra they're just removed)
    const removed = [];
    for (let i = 0; i < n && player.gauge.length > 0; i++) {
      removed.push(player.gauge.pop());
    }
    return removed;
  }

  // ---------- Change Cards ----------
  // The rulebook defines this action as "spend Force to draw an equivalent number of
  // cards", and Force generation is per-card VALUE, not per card: Normal/Special 1,
  // Ultra 2, and a card taken from Gauge is a legal source (Comprehensive Rulebook,
  // "Force Generation"). Both call sites used to implement it separately as
  // "discard N cards from HAND, draw N (Ultras count 2)" — the Ultra half was right,
  // but Gauge could never be spent, which is not a simplification anyone chose; it is
  // simply a missing source. Routed through payForceFromHandOrGauge so this action
  // pays exactly the way Move, Boost and character actions already do.
  //
  // Returns `{ spent, forceValue, drawn, spentFromGauge }` so the caller can log it
  // and so a character whose Innate keys off Gauge spending (Guile) can see what
  // happened without re-deriving it.
  performChangeCards(player, uids) {
    const cards = (uids || []).map(uid => this.findCardInHandOrGauge(player, uid)).filter(Boolean);
    const spentFromGauge = cards.filter(c => player.gauge.some(g => g.uid === c.uid)).length;
    const spent = this.payForceFromHandOrGauge(player, uids, 'a Change Cards action');
    let forceValue = spent.reduce((s, c) => s + this.forceValueOfCard(c), 0);
    // Guile's Innate/Exceed: "When using a Change Cards action, the first Gauge spent
    // generates an extra {2}." Data-driven off the character rather than a key check,
    // per this file's established extension-point convention. It reads how many cards
    // came from Gauge (not how much Force they were worth) because the card text is
    // about the first Gauge CARD spent.
    const char = CHARACTERS[player.characterKey];
    if (char && char.changeCardsForceBonus) {
      const bonus = char.changeCardsForceBonus(player, { spent, spentFromGauge }) || 0;
      if (bonus > 0) {
        forceValue += bonus;
        this.logMsg(`${player.name}'s Innate generates an extra ${bonus} Force from the Gauge card spent.`, 'force', player.id);
      }
    }
    this.draw(player, forceValue);
    if (typeof EventBus !== 'undefined') {
      EventBus.emit('OnNeutralAction', {
        playerId: player.id,
        kind: 'change_cards',
        drawn: forceValue,
      });
    }
    return { spent, forceValue, drawn: forceValue, spentFromGauge };
  }

  // ---------- Exceed ----------
  // A character's Exceed cost can be dynamic (Arakune's Innate reduces his by 1
  // for each card in his Overdrive), so read it through here rather than off
  // `char.exceedCost` directly — every caller that quotes or charges the cost
  // must agree on the same number.
  exceedCostFor(player) {
    const char = CHARACTERS[player.characterKey];
    const base = char.exceedCost;
    return char.exceedCostAdjust ? Math.max(0, char.exceedCostAdjust(this, player, base)) : base;
  }

  // `canExceed` gates the Exceed ACTION. A character can opt out of it entirely with
  // `CHARACTERS[key].canExceedAction: false` (Nagoriyuki, whose only route into Exceed
  // Mode is his own Reshuffle trigger) — `forceExceed` below is the internal path that
  // ignores that gate.
  canExceed(player) {
    const char = CHARACTERS[player.characterKey];
    if (char && char.canExceedAction === false) return false;
    return !player.exceeded && this.gaugeCount(player) >= this.exceedCostFor(player);
  }

  // Exceed without the action's cost or availability check — used by effects that say
  // "Exceed" rather than offering the Exceed action (Nagoriyuki's Innate).
  forceExceed(player) {
    if (player.exceeded) return;
    const char = CHARACTERS[player.characterKey];
    player.exceeded = true;
    this.logMsg(`${player.name} Exceeds! (${char.name} — ${char.exceedText})`, 'exceed', player.id);
    if (typeof EventBus !== 'undefined') {
      EventBus.emit('OnExceedActivated', { playerId: player.id, characterKey: player.characterKey });
    }
    if (char.onExceed) char.onExceed(this, player, this.P(this.other(player.id)));
  }

  doExceed(player) {
    const char = CHARACTERS[player.characterKey];
    if (!this.canExceed(player)) return { mayStrike: false };
    const spent = this.spendGauge(player, this.exceedCostFor(player));
    // Season 5 (BlazBlue): the Gauge spent to Exceed goes to the Overdrive area
    // instead of the discard pile, and drains one card per turn from there —
    // see the Overdrive section below.
    if (this.usesOverdrive(player)) player.overdrive.push(...spent);
    else player.discard.push(...spent);
    player.exceeded = true;
    this.logMsg(`${player.name} Exceeds! (${char.name} — ${char.exceedText})`, 'exceed', player.id);
    if (typeof EventBus !== 'undefined') {
      EventBus.emit('OnExceedActivated', { playerId: player.id, characterKey: player.characterKey });
    }
    let mayStrike = false, mayAction = false;
    if (char.onExceed) {
      const result = char.onExceed(this, player, this.P(this.other(player.id))) || {};
      mayStrike = result.mayStrike || false;
      mayAction = result.mayAction || false;
    }
    return { mayStrike, mayAction };
  }

  // Revert: un-Exceed the player, returning them to Innate mode. Note: cards
  // that are Exceed-only (type: 'ultra_exceeded' or similar) become unplayable.
  // Any Exceed-only continuous boosts in play stay in play but become
  // functionally unmanageable (can't be Canceled, cleanup may reference
  // non-existent effects). This is a design limitation of Phase 1 — a full
  // Revert would need to sweep boosts in play and handle them properly.
  // For now, revert is mostly used at cleanup time (Leo, Happy Chaos) to end
  // Exceed state, not mid-turn, so the dangling-boost issue is rare.
  doRevert(player) {
    if (!player.exceeded) return false;
    player.exceeded = false;
    player.revertPending = false;
    this.logMsg(`${player.name} Reverts to Innate mode.`, 'revert', player.id);
    return true;
  }

  // ---------- Overdrive (Season 5 / BlazBlue) ----------
  // Rules (confirmed against two independent public rules references, 2026-08-16):
  //   1. When a BlazBlue fighter Exceeds, the Gauge they spend goes to their
  //      Overdrive area instead of straight to the discard pile (doExceed above).
  //   2. At the start of each of their FOLLOWING turns, they discard 1 card from
  //      Overdrive and perform their character's Overdrive effect (the bottom
  //      section of the Exceed side of the character card).
  //   3. When the last card leaves Overdrive, they flip back — i.e. Revert.
  // The turn on which they Exceed does not tick: the tick fires at turn start,
  // and Exceeding happens as an action after that point.
  //
  // A character opts in by defining `CHARACTERS[key].overdrive = { text,
  // options?(engine, player, opponent), resolve(engine, player, opponent, choiceKey) }`.
  // `options` is what makes a directional Overdrive ("Close or Retreat 1") a real
  // choice: return `[{key, label}, ...]` and the caller pauses for it (ui.js's
  // `overdrive_choice` mode for a human, ai.js's chooseOverdriveOption for the CPU);
  // omit it and the effect resolves immediately with no prompt.
  usesOverdrive(player) {
    const char = CHARACTERS[player.characterKey];
    return !!(char && char.overdrive);
  }

  // Step 1 of the start-of-turn tick: discard one Overdrive card and report what
  // the effect needs. Returns null when there is nothing to tick, so the caller
  // can carry on with the turn unchanged.
  beginOverdriveTick(player) {
    if (!player.exceeded || !this.usesOverdrive(player) || player.overdrive.length === 0) return null;
    const char = CHARACTERS[player.characterKey];
    const card = player.overdrive.pop();
    player.discard.push(card);
    this.logMsg(`${player.name} discards ${card.name} from Overdrive (${player.overdrive.length} left) — Overdrive: ${char.overdrive.text}`, 'overdrive', player.id);
    const opponent = this.P(this.other(player.id));
    const options = char.overdrive.options ? char.overdrive.options(this, player, opponent) : null;
    return { card, options: (options && options.length) ? options : null };
  }

  // Step 2: run the effect, then Revert if that was the last Overdrive card.
  // `card` is the card the tick discarded — Bang's and Platinum's Overdrives both
  // read it ("the card discarded by the Overdrive effect"), so it is passed through.
  resolveOverdriveEffect(player, opponent, choiceKey, card) {
    const char = CHARACTERS[player.characterKey];
    if (char && char.overdrive && char.overdrive.resolve) {
      char.overdrive.resolve(this, player, opponent, choiceKey, card);
    }
    if (player.overdrive.length === 0 && player.exceeded) {
      this.doRevert(player);
      this.logMsg(`${player.name}'s Overdrive is empty.`, 'revert', player.id);
    }
  }

  // Seal a card from hand (remove from play but don't discard/gauge it).
  // Used by Happy Chaos's Innate.
  sealCardFromHand(player, uid) {
    const idx = player.hand.findIndex(c => c.uid === uid);
    if (idx === -1) return null;
    const [card] = player.hand.splice(idx, 1);
    player.sealedCards.push(card);
    this.logMsg(`${player.name} seals ${card.name}.`, 'seal', player.id);
    return card;
  }

  // Gain life, capped at the character's starting maximum (Ragna's whole game plan
  // is built on this: "Innate — Hit: Gain 1 life", and more of it while Exceeded).
  gainLife(player, amount) {
    const before = player.life;
    player.life = Math.min(player.maxLife, player.life + amount);
    const gained = player.life - before;
    if (gained > 0) this.logMsg(`${player.name} gains ${gained} life (now ${player.life}/${player.maxLife}).`, 'heal', player.id, { amount: gained });
    return gained;
  }

  // Iron Tager's Innate AND Exceed: "When you would Advance or Retreat 3 or more,
  // instead move only 2." A blanket cap on this character's own self-movement,
  // applied inside advanceSelf/retreatSelf so it covers every source — card
  // Before/After movement, the Move action, boosts — without each of them knowing
  // about it. Does NOT cap being Pushed or Pulled by the opponent, which the card
  // text doesn't mention and which goes through pushAway/pullTowardWithoutPassing.
  cappedSelfMove(mover, amount) {
    // Jin's Dual Ice Strike / Nu-13's Sword Dance boosts: "The opponent cannot move."
    // Per those cards' own Notes column they can still be Pushed or Pulled — which go
    // through pushAway/pushToward/pullTowardWithoutPassing and never reach here — but
    // they cannot move under their own power, which is exactly what this path is.
    const opp = this.P(this.other(mover.id));
    for (const b of opp.boostsInPlay) {
      if (b.card.boost && b.card.boost.opponentCannotMove) {
        this.logMsg(`${mover.name} cannot move (${b.card.name}).`, 'immune', mover.id);
        return 0;
      }
    }
    const char = CHARACTERS[mover.characterKey];
    if (!char || !char.selfMoveCap) return amount;
    const cap = char.selfMoveCap(mover);
    if (cap == null || amount < cap.threshold) return amount;
    return cap.instead;
  }

  // Set-time options (Season 5): "When you set your attack / initiate a Strike, you
  // may spend [1]/{1} to <effect>" — Jin, Noel, Nu-13 and Iron Tager all have one as
  // their Innate. Offered right after the attack card is chosen and before the
  // Critical prompt (the same slot Sagat's face-up choice uses), because that is when
  // the card text says the decision happens. The character defines the option in
  // cards.js; this just charges it and applies the effect, so the per-Strike state it
  // sets is swept with all the other per-Strike flags at the end of the Strike.
  setTimeOptionFor(player, card, isInitiator) {
    const char = CHARACTERS[player.characterKey];
    const opt = char && char.setTimeOption;
    if (!opt) return null;
    if (opt.initiatorOnly && !isInitiator) return null;
    if (opt.available && !opt.available(this, player, card)) return null;
    const cost = opt.cost || {};
    if (cost.gauge && this.gaugeCount(player) < cost.gauge) return null;
    if (cost.force && this.sumForceValue(player, [...player.hand, ...player.gauge].map(c => c.uid)) < cost.force) return null;
    return { text: opt.text, cost };
  }

  applySetTimeOption(player, opponent, card) {
    const char = CHARACTERS[player.characterKey];
    const opt = char && char.setTimeOption;
    if (!opt) return false;
    const cost = opt.cost || {};
    if (cost.gauge) {
      if (this.gaugeCount(player) < cost.gauge) return false;
      const spent = this.spendGauge(player, cost.gauge);
      player.discard.push(...spent);
      this.logMsg(`${player.name} spends ${cost.gauge} Gauge (${opt.text}).`, 'gauge', player.id);
    }
    if (cost.force) {
      // Force is paid from hand first, then Gauge — same order payForceFromHandOrGauge
      // uses; "which cards" is not a strategic decision for a 1-Force cost.
      const uids = this.pickExactForceCards(player, cost.force);
      if (!uids) return false;
      this.payForceFromHandOrGauge(player, uids);
      this.logMsg(`${player.name} spends ${cost.force} Force (${opt.text}).`, 'force', player.id);
    }
    opt.apply(this, player, opponent, card);
    return true;
  }

  // Hakumen's Exceed: "All Gauge costs are reduced to 0 and treated as fully paid."
  gaugeCostsAreFree(player) {
    const char = CHARACTERS[player.characterKey];
    return !!(char && char.gaugeCostsFree && char.gaugeCostsFree(player));
  }

  canPayUltra(player, card) {
    if (!card || card.type !== 'ultra') return true;
    const cost = this.gaugeCostsAreFree(player) ? 0 : (card.gaugeCost || 0);
    return this.gaugeCount(player) >= cost;
  }

  // Take non-lethal damage (damage that floors at 1 life, can't cause a loss).
  // Used by Nagoriyuki's Exceed Normals.
  takeDamageNonLethal(player, amount) {
    player.life = Math.max(1, player.life - amount);
    this.logMsg(`${player.name} takes ${amount} non-lethal damage (now ${player.life} life).`, 'damage', player.id, { amount });
  }

  // Get a character's max hand size (default 7 for all base-game characters,
  // but Goldlewis uses 9). Read from character definition or default to 7.
  getMaxHandSize(characterKey) {
    const char = CHARACTERS[characterKey];
    return (char && char.maxHandSize) || 7;
  }

  // Trigger "on Cancel" hooks for a character's Innate/Exceed. Called by
  // ui.js whenever a Cancel action is taken (see resolveCancelChoice).
  // This allows characters like Chipp and Ky to respond to Cancels.
  triggerOnCancelHooks(player, opponent) {
    const char = CHARACTERS[player.characterKey];
    if (!char) return null;
    // Exceeded characters fall back to their ordinary onCancel when they don't declare a
    // separate onCancelExceed — Chipp and Ky both branch on `player.exceeded` INSIDE
    // onCancel, so picking onCancelExceed and finding nothing used to silently disable
    // both of their Exceeds.
    const hook = (player.exceeded && char.onCancelExceed) || char.onCancel;
    if (hook) return hook(this, player, opponent);
    return null;
  }

  // Reset per-turn one-shot flags (like firstCancelThisTurn) when a player
  // gains control of a turn. Called when switching active player.
  resetPerTurnFlags(player) {
    player.firstCancelThisTurn = true;
    player.canceledThisTurn = false; // Sol Badguy: fresh "this turn" starts now
    player.strikeThisTurn = false; // Reset for Leo's Exceed "Revert when you end a turn without Striking"
    player.actionStrikeThisTurn = false; // Reset for Baiken/I-No Exceed POW bonus
  }

  // Trigger card-level cleanup effects (distinct from boost cleanup). Called after
  // each Strike, for cards that were used in that Strike and have cleanup text.
  // Example: Nagoriyuki's Innate modifies Specials to have "Cleanup: Draw 4. Discard 2."
  triggerCardCleanup(player, card) {
    if (!card) return;
    // Run both character-granted cleanup (Nagoriyuki's Innate/Exceed) and any
    // printed card.cleanup clause without one silently shadowing the other.
    const char = CHARACTERS[player.characterKey];
    const cleanups = [
      char && char.cardCleanupFor && char.cardCleanupFor(player, card),
      card.cleanup,
    ].filter(Boolean);
    for (const cleanup of cleanups) {
      if (cleanup.draw) this.draw(player, cleanup.draw);
      if (cleanup.discard) {
        const toDiscard = Math.min(cleanup.discard, player.hand.length);
        if (toDiscard > 0) {
          const discarding = player.hand.slice(0, toDiscard);
          for (const c of discarding) {
            player.hand = player.hand.filter(x => x.uid !== c.uid);
            player.discard.push(c);
          }
          this.logMsg(`${player.name} discards ${toDiscard} card(s) from hand (${card.name} cleanup).`, 'discard', player.id);
        }
      }
      if (cleanup.loseArmor) {
        // Armor is per-Strike in this engine (no persistent player.armor pool),
        // so log the clause without mutating an unused property on player state.
        this.logMsg(`${player.name} loses all Armor (${card.name} cleanup).`, 'armor', player.id);
      }
      if (cleanup.nonLethalDamage) {
        // Nagoriyuki Exceed Normals: "Take 2 non-lethal damage"
        this.takeDamageNonLethal(player, cleanup.nonLethalDamage);
      }
    }
  }

  // ---------- boosts ----------
  cardBoostForce(card) { return (card.boost && card.boost.force) || 0; }

  // Ultras count as 2 Force when used to pay a Force cost (Move, Boost, etc.) — per the
  // rulebook, everything else is worth 1. Centralized here so every payment surface
  // (Move's force picker, Boost's force picker, the AI's equivalents) agrees.
  forceValueOfCard(card) { return (card && card.type === 'ultra') ? 2 : 1; }

  findCardInHandOrGauge(player, uid) {
    return player.hand.find(c => c.uid === uid) || player.gauge.find(c => c.uid === uid) || null;
  }

  // Sum the Force value (see forceValueOfCard) of a set of hand/gauge uids — this is
  // what a Force cost is actually checked against now, not raw card count.
  sumForceValue(player, uids) {
    return (uids || []).reduce((s, uid) => {
      const c = this.findCardInHandOrGauge(player, uid);
      return s + (c ? this.forceValueOfCard(c) : 0);
    }, 0);
  }

  // pay a Force cost by discarding the given uids, checked against hand first then
  // gauge (per the rulebook: Force costs may be paid from either pile). `reason` is a
  // short descriptive phrase (e.g. "your Move", "the Metsu Hadoken boost") for the
  // log line — every caller pays a Force cost, so centralizing the message here (and
  // naming exactly which cards were spent) keeps it consistent instead of leaving
  // each call site to remember to log it separately, which they weren't.
  payForceFromHandOrGauge(player, uids, reason) {
    const spent = [];
    for (const fUid of (uids || [])) {
      let fIdx = player.hand.findIndex(c => c.uid === fUid);
      if (fIdx !== -1) { const [c] = player.hand.splice(fIdx, 1); player.discard.push(c); spent.push(c); continue; }
      fIdx = player.gauge.findIndex(c => c.uid === fUid);
      if (fIdx !== -1) { const [c] = player.gauge.splice(fIdx, 1); player.discard.push(c); spent.push(c); }
    }
    if (spent.length > 0) {
      // Force VALUE spent, not raw card count — an Ultra spent this way is worth 2
      // Force on its own (see forceValueOfCard), so a single Ultra correctly logs
      // as "2 Force", not "1 Force" (the bug this comment replaced: the log used to
      // report spent.length, silently under-counting whenever an Ultra was among
      // the cards paid).
      const forceValue = spent.reduce((s, c) => s + this.forceValueOfCard(c), 0);
      // "You" needs first-person grammar ("pay"); every other player.name (a CPU
      // or a character name) takes third-person ("pays"). `reason` is expected to
      // already be phrased correctly for whichever player is paying (see call
      // sites — e.g. ui.js passes "your Move" for the human, "CPU's Move" for AI).
      const verb = player.name === 'You' ? 'pay' : 'pays';
      this.logMsg(`${player.name} ${verb} ${forceValue} Force for ${reason || 'a cost'}: ${spent.map(c => c.name).join(', ')} discarded.`, 'force', player.id);
      if (typeof EventBus !== 'undefined') {
        EventBus.emit('OnForcePitched', {
          playerId: player.id,
          forceValue,
          hasUltra: spent.some(c => c && c.type === 'ultra'),
          reason: reason || 'cost',
        });
      }
    }
    return spent;
  }

  // Play a Boost card without UI interaction (for forced Boost plays in character actions).
  // Attempts to pay the Force cost from available hand/gauge. Returns success/failure.
  playForcedBoost(player, opponent, card) {
    const need = this.cardBoostForce(card);
    const available = [...player.hand, ...player.gauge].filter(c => c.uid !== card.uid);
    const pool = available.filter(c => this.forceValueOfCard(c) === 2);
    const ones = available.filter(c => this.forceValueOfCard(c) === 1);
    const chosen = [];
    let remaining = need;
    for (const c of pool) { if (remaining >= 2) { chosen.push(c.uid); remaining -= 2; } }
    for (const c of ones) { if (remaining >= 1) { chosen.push(c.uid); remaining -= 1; } }
    if (remaining !== 0) return false; // Can't afford the Boost
    // Play it
    const forceUids = chosen;
    player.hand = player.hand.filter(c => c.uid !== card.uid);
    this.payForceFromHandOrGauge(player, forceUids, `the ${card.name} boost`);
    this.logMsg(`${player.name} boosts with ${card.name}.`, 'boost', player.id);
    const ctx = {
      engine: this, player, opponent,
      namedCardKey: null, namedRange: null,
      targetBoostUid: null,
      pushPullDirection: null,
      moveDirection: null,
      gaugeInsteadOfDiscard: false,
    };
    if (card.boost.toGaugeInstead) {
      player.gauge.push(card);
      this.logMsg(`${card.name} is added directly to ${player.name}'s Gauge.`, 'gauge', player.id);
      if (card.boost.resolve) card.boost.resolve(ctx);
    } else if (card.boost.continuous) {
      const entry = { card, ownerId: player.id };
      if (card.boost.expireToGaugeAfterTurns) {
        entry.turnsUntilExpire = card.boost.expireToGaugeAfterTurns;
        entry._skipNextExpiryCheck = true;
      }
      if (card.boost.expireToGaugeAtStartOfNextTurn) {
        entry.turnsUntilStartExpire = 1;
      }
      player.boostsInPlay.push(entry);
      this.logMsg(`${card.name} is now in play (continuous).`, 'boost', player.id);
      if (card.boost.nowDraw) this.draw(player, card.boost.nowDraw);
      if (card.boost.nowClose) this.closeSelf(player, opponent, card.boost.nowClose);
      if (card.boost.resolve) card.boost.resolve(ctx);
    } else {
      if (card.boost.resolve) card.boost.resolve(ctx);
      if (ctx.gaugeInsteadOfDiscard) player.gauge.push(card);
      else player.discard.push(card);
    }
    return true;
  }

  playBoost(player, opponent, uid, forceCardsUids, extra) {
    const idx = player.hand.findIndex(c => c.uid === uid);
    if (idx === -1) return { ok: false, reason: 'not in hand' };
    const card = player.hand[idx];
    const need = this.cardBoostForce(card);
    const paidValue = this.sumForceValue(player, forceCardsUids);
    if (paidValue !== need) return { ok: false, reason: 'incorrect force payment' };
    // Boosting instead of attacking is itself a read: it says this hand was not ready to
    // start an exchange from here (see recordObservation).
    this.recordObservation(player, { type: 'boost', dist: Math.abs(player.pos - (opponent ? opponent.pos : player.pos)) });
    // pay force (discard the extra cards, can come from hand or gauge)
    player.hand.splice(idx, 1);
    this.payForceFromHandOrGauge(player, forceCardsUids, `the ${card.name} boost`);
    this.logMsg(`${player.name} boosts with ${card.name}.`, 'boost', player.id);
    if (typeof EventBus !== 'undefined') {
      EventBus.emit('OnNeutralAction', {
        playerId: player.id,
        kind: 'boost',
        cardKey: card.key,
        cardName: card.name,
      });
    }
    const ctx = {
      engine: this, player, opponent,
      namedCardKey: extra && extra.namedCardKey, namedRange: extra && extra.namedRange,
      targetBoostUid: extra && extra.targetBoostUid,
      // GG Cross's push/pull choice and Rainwater's advance/retreat choice — same
      // "UI resolves the choice up front, passes the answer through `extra`"
      // pattern already established for namedCardKey/namedRange/targetBoostUid
      // above, not a new mechanism.
      pushPullDirection: extra && extra.pushPullDirection,
      moveDirection: extra && extra.moveDirection,
      // Zato-1's Invite Hell boost ("Place Eddie in any space") — the space is chosen
      // up front by the UI/AI and passed through `extra`, same as every other
      // boost-time target above.
      eddieSpace: extra && extra.eddieSpace,
      gaugeInsteadOfDiscard: false,
    };
    let triggersStrike = false;
    let bonusAction = false;
    let mayTriggerStrike = false;
    let freeCriticalOnFollowupStrike = false;

    // Winter Mantis's "Spend up to 2 Force. For each spent, Push 1 and draw 2." —
    // a SEPARATE, optional Force cost layered on top of (not instead of) the
    // card's own normal boost.force cost above — paid the same way (hand or
    // gauge), amount chosen by the UI ahead of time (`extra.bonusForceUids`,
    // capped server-side at optionalForceSpend.max regardless of what the UI
    // sends, so a compromised/buggy client can't overspend).
    if (card.boost.optionalForceSpend) {
      const uids = (extra && extra.bonusForceUids) || [];
      const maxAllowed = card.boost.optionalForceSpend.max;
      // Select only unique cards whose cumulative Force value stays within maxAllowed
      // (Ultras count as 2 Force, so slicing by card count would overspend).
      const toPay = [];
      let spend = 0;
      const seen = new Set();
      for (const fUid of uids) {
        if (seen.has(fUid)) continue;
        const c = this.findCardInHandOrGauge(player, fUid);
        if (!c) continue;
        const val = this.forceValueOfCard(c);
        if (spend + val <= maxAllowed) {
          seen.add(fUid);
          toPay.push(fUid);
          spend += val;
        }
      }
      if (toPay.length > 0) {
        this.payForceFromHandOrGauge(player, toPay, `the ${card.name} boost's optional spend`);
      }
      ctx.bonusForceSpent = spend;
    }

    if (card.boost.toGaugeInstead) {
      player.gauge.push(card);
      this.logMsg(`${card.name} is added directly to ${player.name}'s Gauge.`, 'gauge', player.id);
      // C. Viper's Emergency Combination: goes to Gauge (like Axe Kick/Double
      // Lariat before it) BUT also has a real boost effect (Draw 2) — the two
      // existing toGaugeInstead users both have empty resolve()s, so this
      // branch never needed to call resolve() before now.
      if (card.boost.resolve) card.boost.resolve(ctx);
    } else if (card.boost.continuous) {
      const entry = { card, ownerId: player.id };
      // Cammy's Cannonball/CQC boosts: "At the end of your next turn, add this
      // card to your Gauge [if it hasn't already been consumed by a Strike]." A
      // genuinely new lifecycle beyond "lasts until your next Strike" (which is
      // what EVERY continuous boost already does via cleanupBoosts, called at the
      // end of resolveStrikeSteps) — this is a SEPARATE turn-counted expiry that
      // can trigger even if the player never strikes at all. See
      // engine.checkBoostExpiry(), called from ui.js at the end of that player's
      // own non-strike turns only (a Strike ends the boost's life via the normal
      // path first, before this would ever fire).
      if (card.boost.expireToGaugeAfterTurns) {
        entry.turnsUntilExpire = card.boost.expireToGaugeAfterTurns;
        // The very first checkBoostExpiry() call for this boost happens moments
        // from now, in the SAME action (doBoost's/aiFinishNonStrike's continuation
        // calls finishNonStrikeAction right after playBoost returns) — i.e. at the
        // end of the turn the boost was just played on, not "your next turn" yet.
        // Without this flag that call would immediately decrement
        // turnsUntilExpire to 0 and expire the boost before it ever did anything,
        // which is exactly the bug reported: "At the end of your next turn, add
        // this card to your Gauge" was firing at the end of THIS turn instead.
        // Skip exactly that one same-turn call; every later call is a genuine
        // subsequent turn and should count normally.
        entry._skipNextExpiryCheck = true;
      }
      // GG Dust's boost: "At the start of your turn, add this to your Gauge" —
      // a DIFFERENT expiry timing from the above (start, not end, of a turn — see
      // engine.checkStartOfTurnExpiry, called from ui.js right as a player's turn
      // begins, mirroring checkBoostExpiry's call sites but at the opposite edge).
      // No same-turn-call guard needed here the way expireToGaugeAfterTurns needed
      // one above: checkStartOfTurnExpiry only ever runs BEFORE a turn's action is
      // chosen, and this boost can only come into existence AS the result of a
      // turn's action (a Boost play) — so by the time it exists, that turn's
      // start-of-turn check has already happened and won't run again until this
      // player's genuinely NEXT turn begins.
      if (card.boost.expireToGaugeAtStartOfNextTurn) {
        entry.turnsUntilStartExpire = 1;
      }
      player.boostsInPlay.push(entry);
      // C. Viper's Innate/Exceed: "After you resolve a Continuous Boost, you
      // may Strike [; if Exceeded, that attack is Critical]." A genuine
      // per-instance choice (not the mandatory `triggersStrike`), so it's
      // surfaced as its own result flag rather than folded into that one —
      // see ui.js's doBoost/runAITurn continuations, which prompt (human) or
      // heuristically decide (AI) whether to take it.
      mayTriggerStrike = !!CHARACTERS[player.characterKey].mayStrikeAfterContinuousBoost;
      freeCriticalOnFollowupStrike = mayTriggerStrike && player.exceeded;
      if (card.boost.nowDraw) this.draw(player, card.boost.nowDraw);
      // Zangief's Atomic Suplex boost: "Now: Close 2." — mirrors nowDraw's shape.
      if (card.boost.nowClose) this.closeSelf(player, opponent, card.boost.nowClose);
      if (card.boost.resolve) card.boost.resolve(ctx);
      triggersStrike = !!card.boost.triggersStrike;
      // C. Viper's Burning Dance boost: continuous AND "Now: ...Take another
      // action" — bonusAction was previously only read in the one-shot branch
      // below (every prior continuous boost with bonusAction was hypothetical
      // until this card), so it fell through unread here.
      bonusAction = !!card.boost.bonusAction;
    } else {
      if (card.boost.resolve) card.boost.resolve(ctx);
      // GG Cross: "if the opponent was Pulled past you, add this card to your
      // Gauge" instead of the normal discard-after-a-one-shot-boost fate — the
      // card's own resolve() sets ctx.gaugeInsteadOfDiscard when that happened.
      if (ctx.gaugeInsteadOfDiscard) player.gauge.push(card);
      else player.discard.push(card);
      bonusAction = !!card.boost.bonusAction;
      triggersStrike = !!card.boost.triggersStrike;
    }
    return { ok: true, triggersStrike, bonusAction, card, mayTriggerStrike, freeCriticalOnFollowupStrike };
  }

  // aggregate continuous-boost stat bonuses currently active for a player
  activeBoostMods(player) {
    const mods = {
      pow: 0, spd: 0, arm: 0, grd: 0, ignoreArmor: false, rangeImmuneRanges: [], stunImmune: false,
      opponentPowMod: 0,
      // boostsInPlay only ever holds continuous boosts, so non-empty means "has a
      // Continuous Boost in play" — feeds C. Viper's noHitWithoutContinuousBoost/
      // powBonusIfOwnContinuousBoost in ai.js's evalMatchup.
      hasOwnContinuousBoost: player.boostsInPlay.length > 0,
    };
    for (const b of player.boostsInPlay) {
      const sm = (b.card.boost && b.card.boost.statMods) || {};
      mods.pow += sm.pow || 0; mods.spd += sm.spd || 0;
      mods.arm += sm.arm || 0; mods.grd += sm.grd || 0;
      if (b.card.boost.ignoreArmorGrant) mods.ignoreArmor = true;
      // Mirrors ai.js's boostModsFromKeys (same shape, kept in sync deliberately) —
      // this is the AI's-own-boosts path (full info); that one is the public,
      // opponent-facing path (boost keys only). Cammy's CQC boost / Zangief's
      // Ultimate Atomic Buster boost are the current examples of each.
      if (b.card.boost.rangeImmuneRanges) mods.rangeImmuneRanges = mods.rangeImmuneRanges.concat(b.card.boost.rangeImmuneRanges);
      if (b.card.boost.stunImmuneGrant) mods.stunImmune = true;
      // C. Viper's Burning Dance boost: "[+] Opponent has +3 POW" (see the
      // cross-player oppPowDebuff aggregation in liveStats above for the other
      // half of this field's usage).
      if (b.card.boost.opponentPowMod) mods.opponentPowMod += b.card.boost.opponentPowMod;
    }
    return mods;
  }

  // Turn-boundary boost expiry (see the `expireToGaugeAfterTurns` comment in
  // playBoost above) — call once at the end of THIS player's own non-strike turn
  // only (a Strike already ends every continuous boost's life via cleanupBoosts
  // before this would ever run for that boost). Decrements any boost carrying a
  // `turnsUntilExpire` counter; at 0, converts it straight to Gauge instead of
  // waiting for a Strike that may never come.
  // `_skipNextExpiryCheck` (set once, in playBoost, at creation time) absorbs the
  // very first call — the one that fires in the same action the boost was played
  // in — so the countdown genuinely starts on the NEXT turn, matching the card's
  // own "At the end of your next turn..." text rather than firing immediately.
  checkBoostExpiry(player) {
    const keep = [];
    for (const b of player.boostsInPlay) {
      if (b.turnsUntilExpire == null) { keep.push(b); continue; }
      if (b._skipNextExpiryCheck) { b._skipNextExpiryCheck = false; keep.push(b); continue; }
      b.turnsUntilExpire -= 1;
      if (b.turnsUntilExpire <= 0) {
        player.gauge.push(b.card);
        this.logMsg(`${player.name}'s ${b.card.name} boost expires and goes to Gauge.`, 'boostexpire', player.id);
      } else {
        keep.push(b);
      }
    }
    player.boostsInPlay = keep;
  }

  // GG Dust's boost: "At the start of your turn, add this card to your Gauge" —
  // the START-of-turn counterpart to checkBoostExpiry above (which only ever
  // fires at the END of a turn). Call once, right as a player's turn begins —
  // see ui.js's passOrContinue (human)/runAITurn (AI) — before that turn's
  // action is chosen, so a boost played on turn N is still fully active for the
  // entirety of turn N and expires right when turn N+1 (this same player's next
  // turn) starts, matching the card text precisely.
  checkStartOfTurnExpiry(player) {
    const keep = [];
    for (const b of player.boostsInPlay) {
      if (b.turnsUntilStartExpire == null) { keep.push(b); continue; }
      b.turnsUntilStartExpire -= 1;
      if (b.turnsUntilStartExpire <= 0) {
        player.gauge.push(b.card);
        this.logMsg(`${player.name}'s ${b.card.name} boost expires and goes to Gauge.`, 'boostexpire', player.id);
      } else {
        keep.push(b);
      }
    }
    player.boostsInPlay = keep;
  }

  // `usedNormalCardType` — the type ('normal'/'special'/'ultra') of the card THIS
  // player set for the Strike that just resolved, or null if they didn't strike
  // this exchange at all (shouldn't happen — cleanupBoosts is only called from
  // resolveStrikeSteps — but guarded anyway). A generator (not a plain function)
  // because "sustain" (Cammy's Dive Kick boost: "Cleanup: If you didn't use a
  // Normal, you MAY sustain this card") is a real per-instance player choice, not
  // an auto-resolved one — confirmed with the user directly rather than assumed.
  // `wasHitThisStrike` — did this player get hit by the opponent this Strike (see
  // Zangief's Spinning Piledriver/Ultimate Atomic Buster boosts, both mandatory —
  // no "may" — so handled inline here, no yield needed).
  // `opponentWasStunned` — did the OPPONENT get Stunned this Strike (see Axl
  // Bomber's boost) — also mandatory, no yield needed, same shape as wasHitThisStrike.
  // `wasThisPlayerStunned` — was THIS player (the boost's owner) themselves
  // Stunned this Strike (see Vega's Bloody High Claw/Splendid Claw boosts'
  // "Cleanup: If you weren't stunned...") — distinct from opponentWasStunned,
  // which is about the OTHER player.
  *cleanupBoosts(player, usedNormalCardType, wasHitThisStrike, opponentWasStunned, wasThisPlayerStunned) {
    const keep = [];
    for (const b of player.boostsInPlay) {
      // Axl's One Vision: "Play this as its Boost and sustain it" — stays in
      // play indefinitely, immune to the normal end-of-strike sweep entirely,
      // until spent via its own granted action (see grantsBurstAction handling
      // in playBoost/ui.js). Checked FIRST, before sustainIfNoNormalUsed/
      // toGaugeIfHitThisStrike, since none of those should ever have a chance to
      // discard/gauge it out from under that action.
      if (b.sustainedForever) { keep.push(b); continue; }
      // One-shot sustain (Platinum the Trinity's Innate "play that boost, then sustain
      // it", and her Exceed's "you may sustain one of your Continuous Boosts"). Unlike
      // every sustain below, nothing about the BOOST decides this — an outside effect
      // marked this one instance to survive exactly one sweep — so the flag is consumed
      // here and the boost dies normally next Strike unless something marks it again.
      if (b._sustainOnce) {
        b._sustainOnce = false;
        keep.push(b);
        this.logMsg(`${player.name}'s ${b.card.name} boost is sustained.`, 'sustain', player.id);
        continue;
      }
      // Two different "may sustain" gates exist because two different card texts do:
      // Cammy's Dive Kick gates on whether a Normal was used this Strike, while
      // Guile's Flash Explosion gates on whether you were STUNNED ("Cleanup: If you
      // were not stunned, you may sustain this boost") and costs nothing. Flash
      // Explosion previously reused the card-type flag, which is a different rule
      // entirely — it would allow the sustain after a Stun and forbid it after a
      // Normal, i.e. exactly backwards from the printed text in both directions.
      const sustainEligible = (b.card.boost.sustainIfNoNormalUsed && usedNormalCardType !== 'normal') ||
        (b.card.boost.sustainIfNotStunned && !wasThisPlayerStunned);
      // Vega's Bloody High Claw/Splendid Claw: "Cleanup: If you weren't
      // stunned, you may spend {1} to sustain this card" — same "may sustain"
      // shape as sustainIfNoNormalUsed above but gated on Stun instead of
      // card type, AND costs Force to take (paid via pickExactForceCards'
      // ones-first greedy pick, same simplification Block's reactive spend
      // already uses for "which specific cards don't matter strategically").
      const paidSustainEligible = !!(b.card.boost.sustainIfNotStunnedCost && !wasThisPlayerStunned);
      if (sustainEligible) {
        const wantsSustain = yield { type: 'sustain_choice', playerId: player.id, cardName: b.card.name };
        if (wantsSustain) {
          keep.push(b);
          this.logMsg(`${player.name} sustains their ${b.card.name} boost.`, 'sustain', player.id);
          continue;
        }
      } else if (paidSustainEligible) {
        const cost = b.card.boost.sustainIfNotStunnedCost;
        const uids = this.pickExactForceCards(player, cost);
        if (uids) {
          const wantsSustain = yield { type: 'sustain_choice_paid', playerId: player.id, cardName: b.card.name, cost };
          if (wantsSustain) {
            this.payForceFromHandOrGauge(player, uids, `sustaining ${b.card.name}`);
            keep.push(b);
            this.logMsg(`${player.name} sustains their ${b.card.name} boost.`, 'sustain', player.id);
            continue;
          }
        }
      } else if (b.card.boost.toGaugeIfHitThisStrike && wasHitThisStrike) {
        player.gauge.push(b.card);
        this.logMsg(`${player.name}'s ${b.card.name} boost goes to Gauge (was hit this Strike).`, 'gauge', player.id);
        continue;
      }
      if (b.card.boost.drawIfOpponentStunnedThisStrike && opponentWasStunned) {
        this.draw(player, 1);
        this.logMsg(`${player.name}'s ${b.card.name} boost draws 1 (opponent was Stunned this Strike).`, 'draw', player.id);
      }
      // Sol Badguy's Gun Flame boost: "After: If your opponent is stunned,
      // Advantage" — same trigger shape as drawIfOpponentStunnedThisStrike
      // above (a continuous boost caring about ANY stun this Strike, not just
      // one this card itself caused), but grants Advantage instead of a draw.
      if (b.card.boost.advantageIfOpponentStunnedThisStrike && opponentWasStunned) {
        this.grantAdvantage(player, `${b.card.name} boost`);
      }
      player.discard.push(b.card);
    }
    player.boostsInPlay = keep;
  }

  recycleHadoken(player) {
    // the Hadoken itself is the current attack card, handled by caller (not in discard yet)
    if (player.discard.length > 0) {
      const top = player.discard.pop();
      player.gauge.push(top);
      this.logMsg(`${player.name} puts the top card of their discard (${top.name}) into Gauge.`, 'gauge', player.id);
    }
  }

  // ---------- strike ----------
  // cardChoice: {type:'hand', uid} | {type:'wildswing'} | {type:'ex', uid1, uid2}
  // Check if a card is a valid attack choice for the player's current state.
  // Returns false if the card is invalid (e.g., Nagoriyuki Exceeded and trying to use a Special).
  isValidStrikeCard(player, card) {
    // Data-driven off CHARACTERS[key].invalidStrikeCard(player, card) — Nagoriyuki's
    // Exceed ("Your Specials are invalid") is the only user today, but this is the same
    // no-character-identity-branches rule every other extension point here follows.
    const char = CHARACTERS[player.characterKey];
    if (char && char.invalidStrikeCard && char.invalidStrikeCard(player, card)) return false;
    return true;
  }

  resolveStrikeCardSelection(player, choice) {
    if (choice.type === 'wildswing') {
      if (player.deck.length === 0) {
        if (!player.reshuffleUsed && player.discard.length > 0) {
          player.deck = shuffle(player.discard, this.rng);
          player.discard = [];
          player.reshuffleUsed = true;
        } else {
          this.gameOver = true; this.winner = this.other(player.id);
          return null;
        }
      }
      let card = player.deck.pop();
      if (!this.isValidStrikeCard(player, card)) {
        const skipped = [card];
        let found = null;
        while (player.deck.length > 0) {
          const cand = player.deck.pop();
          if (this.isValidStrikeCard(player, cand)) { found = cand; break; }
          skipped.push(cand);
        }
        // Return skipped invalid cards and reshuffle deck so no cards are lost.
        if (skipped.length > 0) {
          player.deck.push(...skipped);
          player.deck = shuffle(player.deck, this.rng);
        }
        if (!found && !player.reshuffleUsed && player.discard.length > 0) {
          player.deck = shuffle([...player.deck, ...player.discard], this.rng);
          player.discard = [];
          player.reshuffleUsed = true;
          const validIdx = player.deck.findIndex(c => this.isValidStrikeCard(player, c));
          if (validIdx !== -1) [found] = player.deck.splice(validIdx, 1);
        }
        if (!found) {
          // Deck contains only invalid cards (e.g. Exceeded Nagoriyuki with only Specials left)
          found = player.deck.pop();
          if (!found) { this.gameOver = true; this.winner = this.other(player.id); return null; }
        }
        return { card: found, fromWildSwing: true };
      }
      return { card, fromWildSwing: true };
    } else if (choice.type === 'ex') {
      const idxA = player.hand.findIndex(c => c.uid === choice.uid1);
      if (idxA === -1) return null;
      const cardA = player.hand[idxA];
      const idxB = player.hand.findIndex(c => c.uid === choice.uid2 && c.uid !== cardA.uid && c.key === cardA.key);
      if (idxB === -1) return null;
      const cardB = player.hand[idxB];
      if (!this.isValidStrikeCard(player, cardA)) return null; // EX card invalid
      // remove both (careful with index shift)
      player.hand = player.hand.filter(c => c.uid !== cardA.uid && c.uid !== cardB.uid);
      const ex = this.buildExCard(cardA, cardB);
      return { card: ex, fromWildSwing: false, exSecondCard: cardB };
    } else if (choice.type === 'decklook') {
      // Axl's Sickle Storm boost: "...you may Boost or Strike with one of
      // them..." — the card was already removed from the deck by peekTopN, and
      // (unlike wildswing) is already fully REVEALED to its owner (they looked
      // at it on purpose) — but not to the opponent, same as any other hand
      // card, so `fromWildSwing` stays false (that flag specifically means
      // "hide the name from the owner too," which doesn't apply here).
      if (!this.isValidStrikeCard(player, choice.card)) return null;
      return { card: choice.card, fromWildSwing: false };
    } else {
      const idx = player.hand.findIndex(c => c.uid === choice.uid);
      if (idx === -1) return null;
      const [card] = player.hand.splice(idx, 1);
      if (!this.isValidStrikeCard(player, card)) {
        // Put the card back if it's invalid
        player.hand.push(card);
        return null;
      }
      return { card, fromWildSwing: false };
    }
  }

  // GG Focus's boost: "When you initiate a Strike, the opponent must respond
  // with a Wild Swing." Checked at strike-initiation time (see ui.js's
  // doHumanStrike/aiInitiateStrike, which call this to decide whether the
  // DEFENDER's normal hand/EX/WildSwing choice gets bypassed entirely) —
  // `initiator` is whoever is ABOUT to Strike, `defender` is whoever would
  // otherwise be freely choosing how to respond.
  mustWildSwing(initiator, defender) {
    return initiator.boostsInPlay.some(b => b.card.boost && b.card.boost.forcesOpponentWildSwingOnInitiate);
  }

  // Full strike, step-based: returns a GENERATOR. It only yields for the two
  // decisions that actually require a choice (Grasp's push, Block's reactive
  // Force-for-Armor). Every other card resolves in the same synchronous tick —
  // driving the generator to the next yield (or to `done`) costs one JS
  // event-loop turn regardless of how many non-interactive cards are involved.
  //
  // Yielded requests: {type:'grasp_move', playerId, min:1, max:2}
  //                    {type:'block_force', playerId, maxForce, attackerPow, defenderArmBase,
  //                     defenderGuard, hand:[{uid,name,forceValue}]}
  // Resume with:       grasp_move  -> {amount, direction:'advance'|'retreat'}
  //                    block_force -> {uids:[...]} (the exact hand cards to spend — the
  //                                  human picker's answer), OR an integer N meaning
  //                                  "spend N Force worth, engine's choice" (kept for
  //                                  ai.js's resolveAIStrikeRequest and the test harnesses,
  //                                  which answer with a bare number).
  *resolveStrikeSteps({ initiator, attackerSel, defenderSel, gaugePay }) {
    const other = this.other(initiator);
    const A = this.P(initiator), D = this.P(other);
    this.roundNum = (this.roundNum || 0) + 1;
    const roundNum = this.roundNum;
    // Who chose to start an exchange, and from how far away — the strongest public read
    // available on what a player is holding (see recordObservation).
    this.recordObservation(A, { type: 'strike', dist: Math.abs(A.pos - D.pos) });

    // Critical (see cards.js's header comment for the full rule): gaugePay is
    // `{ [playerId]: true|false }`, decided and already PAID (1 Gauge deducted to
    // discard) by the caller at card-setting time, before this generator even
    // starts — mirrors the real rule's timing ("when setting any attack ... you
    // may pay 1 Gauge"). This function only reads the flag to gate `critical.*`
    // hooks/statMods; it never spends Gauge itself. Edge case: if an Ultra later
    // turns out unaffordable and gets force-Wild-Swung below (see payUltra), the
    // already-spent Critical payment simply carries over to whatever card ends up
    // set instead (doing nothing if that card has no critical text) — the
    // Gauge was already spent at setting time and isn't refunded, same as a real
    // bluffed Critical would work.
    const gp = gaugePay || {};

    this._advantageOrder = [];
    let aCard = attackerSel.card, dCard = defenderSel.card;

    // EX: discard the paired second card immediately upon reveal.
    if (attackerSel.exSecondCard) { A.discard.push(attackerSel.exSecondCard); this.logMsg(`${A.name}'s paired EX card is discarded.`, 'ex', A.id); }
    if (defenderSel.exSecondCard) { D.discard.push(defenderSel.exSecondCard); this.logMsg(`${D.name}'s paired EX card is discarded.`, 'ex', D.id); }

    this.logMsg(`\u2014\u2014\u2014 Round ${roundNum}: ${A.name} plays ${aCard.name}${aCard.isEX ? ' (EX)' : ''}${attackerSel.fromWildSwing ? ' [Wild Swing]' : ''}${gp[A.id] ? ' [Critical]' : ''}, ${D.name} plays ${dCard.name}${dCard.isEX ? ' (EX)' : ''}${defenderSel.fromWildSwing ? ' [Wild Swing]' : ''}${gp[D.id] ? ' [Critical]' : ''} \u2014\u2014\u2014`);

    // pay gauge for ultras (fully automatic — forced invalidation only, no voluntary choice)
    const payUltra = (player, card, sel) => {
      if (card.type !== 'ultra') return true;
      // Hakumen's Exceed zeroes every Gauge cost and treats it as fully paid, so his
      // Ultras are never invalidated for lack of Gauge while he is Exceeded.
      const cost = this.gaugeCostsAreFree(player) ? 0 : (card.gaugeCost || 0);
      const avail = this.gaugeCount(player);
      if (avail < cost) {
        this.logMsg(`${player.name}'s ${card.name} is INVALID (can't pay ${cost} Gauge) \u2014 must Wild Swing.`, 'immune', player.id);
        player.discard.push(card);
        const rs = this.resolveStrikeCardSelection(player, { type: 'wildswing' });
        if (!rs) return false;
        if (player.id === A.id) { aCard = rs.card; attackerSel.card = rs.card; attackerSel.fromWildSwing = true; }
        else { dCard = rs.card; defenderSel.card = rs.card; defenderSel.fromWildSwing = true; }
        return payUltra(player, (player.id === A.id ? aCard : dCard), (player.id === A.id ? attackerSel : defenderSel));
      } else if (cost > 0) {
        const spent = this.spendGauge(player, cost);
        player.discard.push(...spent);
        this.logMsg(`${player.name} pays ${cost} Gauge for ${card.name}.`, 'gauge', player.id);
      }
      return true;
    };
    if (!payUltra(A, aCard, attackerSel) || !payUltra(D, dCard, defenderSel)) {
      return {
        roundNum,
        nextActive: this.other(initiator),
        p1Life: this.players.p1.life, p2Life: this.players.p2.life,
        maxSingleHitDamage: 0,
      };
    }
    aCard = attackerSel.card; dCard = defenderSel.card;

    // Focus protects its player from being moved by the opponent's effects this
    // activation (Grasp's push, Donkey Kick's push, One Inch Punch's push, etc.) —
    // see pushAway()/pushToward() above, which check this flag. Generalized off
    // `card.movementImmune` (Focus and Zangief's Double Lariat both set it) rather
    // than hardcoded to Focus's key specifically.
    A.strikeState.focusActive = !!(aCard && aCard.movementImmune);
    D.strikeState.focusActive = !!(dCard && dCard.movementImmune);

    // Zangief's Siberian Blizzard: "Opponents can't move past you" — confirmed
    // with the user: scoped to the OPPONENT's own Before-movement during this
    // Strike only (not Zangief's own push/pull effects). See advanceSelf()'s
    // jump-over branch, which checks the TARGET's (not the mover's) flag.
    A.strikeState.blocksOpponentPassThrough = !!(aCard && aCard.blocksOpponentPassThrough);
    D.strikeState.blocksOpponentPassThrough = !!(dCard && dCard.blocksOpponentPassThrough);

    // Range immunity (Cammy's Dive Kick/CQC/Gyro Drive Smasher/Razor's Edge
    // Slicer — "Attacks at range X don't hit you"): computed once here from
    // whatever's SET this Strike (own card's base `rangeImmuneRanges`, the card's
    // `critical.rangeImmuneRanges` if Critical was paid, and any active
    // continuous boost's `rangeImmuneRanges`) — this is the "immune as soon as
    // revealed" family. A card whose immunity is instead worded as an "After:"
    // effect (Dive Kick) adds to this same array reactively from its own `after`
    // hook instead — see activateStep below — since that's order-dependent on the
    // card's own activation actually completing, unlike the set-time family here.
    const computeRangeImmunity = (owner, card, criticalPaid) => {
      const ranges = [];
      if (card.rangeImmuneRanges) ranges.push(...card.rangeImmuneRanges);
      if (criticalPaid && card.critical && card.critical.rangeImmuneRanges) ranges.push(...card.critical.rangeImmuneRanges);
      for (const b of owner.boostsInPlay) {
        if (b.card.boost && b.card.boost.rangeImmuneRanges) ranges.push(...b.card.boost.rangeImmuneRanges);
      }
      return ranges;
    };
    A.strikeState.rangeImmune = computeRangeImmunity(A, aCard, !!gp[A.id]);
    D.strikeState.rangeImmune = computeRangeImmunity(D, dCard, !!gp[D.id]);

    // Folds in `critical.statMods`/`critical.ignoreArmor`/`critical.ignoreGuard` when
    // that side actually paid — applied here (not deeper in activateStep) so a
    // Critical Speed bonus (e.g. Hadoken's) can still affect the first/second
    // determination just below, same as any other stat mod.
    const liveStats = (owner, opponent, card, criticalPaid, fromWildSwing) => {
      const mods = this.activeBoostMods(owner);
      const cm = { ...((criticalPaid && card.critical && card.critical.statMods) || {}) };
      const char = CHARACTERS[owner.characterKey];
      // Dan's Innate: "Your Wild Swings have 'Critical: +1POW and +1SPD.'" — grants a
      // synthetic Critical clause onto a Wild Swing card the same way Zangief's grant
      // just below does for range-1, gated on `fromWildSwing` (already threaded through
      // this function for Leo's wildSwingStatMods) instead of range.
      if (criticalPaid && fromWildSwing && char.wildSwingCriticalStatMods) {
        const bonus = char.wildSwingCriticalStatMods(owner) || {};
        cm.pow = (cm.pow || 0) + (bonus.pow || 0);
        cm.spd = (cm.spd || 0) + (bonus.spd || 0);
      }
      // Zangief's Innate/Exceed: "If the opponent is at range 1 when you set your
      // attack, it gains Critical: +X Power, +Y Speed" — this GRANTS an extra
      // Critical clause onto whatever card he sets (still gated behind actually
      // paying the 1 Gauge, same as any other Critical text), conditioned on range
      // AT SET TIME — i.e. using positions as they are right now, before this
      // Strike's Before-movement has run (liveStats is computed before
      // activateStep). Data-driven off
      // CHARACTERS[key].extraCriticalStatsIfOpponentAtRange1(player) so a future
      // character could have an analogous "grants extra Critical text" passive
      // without engine changes.
      if (criticalPaid && char.extraCriticalStatsIfOpponentAtRange1 && this.range(owner, opponent) === 1) {
        const bonus = char.extraCriticalStatsIfOpponentAtRange1(owner) || {};
        cm.pow = (cm.pow || 0) + (bonus.pow || 0);
        cm.spd = (cm.spd || 0) + (bonus.spd || 0);
      }
      // Potemkin's Innate/Exceed: "When you initiate a Strike at Range 1,
      // +XPOW/+XARM" — unlike Zangief's grant just above, this is NOT gated
      // behind paying a Critical; it's a flat, always-on bonus whenever the
      // condition holds. Measured at the same SET-time range as every other
      // conditional bonus here. Data-driven off
      // CHARACTERS[key].rangeConditionalStatBonus(player) so a future character
      // could have an analogous non-Critical range-conditional bonus without
      // further engine changes.
      const rcb = (char.rangeConditionalStatBonus && owner.id === initiator && this.range(owner, opponent) === 1)
        ? (char.rangeConditionalStatBonus(owner) || {}) : {};
      // Sagat's Innate/Exceed: "may place your attack face up for +SPD[/+POW]" —
      // set via `owner.strikeState.faceUp` (see setFaceUpThisStrike above).
      const fub = (char.faceUpStatBonus && owner.strikeState.faceUp) ? (char.faceUpStatBonus(owner) || {}) : {};
      // Axl's Innate/Exceed: "Your Normals have +0~2 Range and -1 Speed" (the
      // Speed part lives here; the Range part is a maxR extension applied where
      // range is actually checked, further down in activateStep — see
      // normalsRangeBonus). Data-driven off CHARACTERS[key].normalsStatMods(player),
      // gated on card.type === 'normal' so it only ever touches this character's
      // shared Normals, never their own Specials/Ultras, matching the card text.
      const nsm = (card.type === 'normal' && char.normalsStatMods) ? (char.normalsStatMods(owner) || {}) : {};
      // Vega's Innate/Exceed: "If you are at the edge of the arena when you
      // set your attack, your Specials and Ultras have +X Power[, +Y Speed]."
      // Mirrors normalsStatMods's shape exactly but inverted (gated on
      // card.type !== 'normal' instead of === 'normal', and on board position
      // instead of the opponent's) — set-time (isAtEdge uses `owner.pos` as it
      // stands right now, before this Strike's own Before-movement), same
      // timing guarantee as every other liveStats-time bonus here.
      const esm = (card.type !== 'normal' && char.specialsUltrasStatModsIfAtEdge && this.isAtEdge(owner))
        ? (char.specialsUltrasStatModsIfAtEdge(owner) || {}) : {};
      // Leo's Exceed: "Your Wild Swings have +1POW and +1SPD"
      const wsm = (fromWildSwing && char.wildSwingStatMods && owner.exceeded)
        ? (char.wildSwingStatMods(owner) || {}) : {};
      // Sol Badguy's Innate/Exceed: "When you Strike, if you Canceled this
      // turn, +1/+2POW" — unconditional on card type (applies to ANY card he
      // sets), driven entirely by the `canceledThisTurn` state flag (already
      // fixed by the time a Strike happens — a Cancel chain always resolves
      // to completion before the eventual Strike/turn-pass), so this is safe
      // in the initial liveStats pass same as every other unconditional
      // modifier here.
      const cancelBonus = (char.powBonusIfCanceledThisTurn && owner.canceledThisTurn)
        ? (char.powBonusIfCanceledThisTurn(owner) || 0) : 0;
      // Character action POW bonus: Baiken/I-No Exceed "+1POW when you action Strike"
      const actionStrikeBonus = (char.actionStrikePowBonus && owner.actionStrikeThisTurn && owner.exceeded)
        ? (char.actionStrikePowBonus || 0) : 0;
      // C. Viper's Burning Dance boost: "The opponent has +3POW" — a
      // continuous boost that debuffs the OPPONENT's stats (the one
      // cross-player case in this codebase; every other continuous boost only
      // ever affects its own owner). Aggregated from `opponent`'s own
      // boostsInPlay here rather than `owner`'s.
      let oppPowDebuff = 0;
      for (const b of opponent.boostsInPlay) {
        if (b.card.boost && b.card.boost.opponentPowMod) oppPowDebuff += b.card.boost.opponentPowMod;
      }
      // Vega's Rolling Crystal Flash: "For each space between you and the
      // opponent, +1 Speed" — measured at SET time (before this Strike's own
      // Before-movement), same timing family as every other set-time bonus
      // above.
      const rangeSpdBonus = (card.hooks && card.hooks.spdBonusPerRangeAtSetTime) ? this.range(owner, opponent) : 0;
      // Iron Tager's Spark Bolt: "For each card in Gauge, +1 SPD" — same live-value
      // shape as guardEqualsHandSize below, read here rather than baked into the
      // card's printed `spd`. A flat card-level flag (not a hook) so it is computed
      // in this one pass, before Speed order is decided, like every other stat mod.
      const gaugeSpdBonus = card.spdPerGaugeCard ? this.gaugeCount(owner) : 0;
      // General character-level stat modifier on ANY attack (Season 5 / BlazBlue
      // needed a shape the existing hooks couldn't express: Tager's Exceed buffs
      // every attack, Bang's Exceed buffs only EX ones, Noel's Exceed only the
      // ones she initiates). It receives the card and the context flags rather
      // than being gated by the engine, so each character decides its own
      // condition in cards.js instead of adding another narrow hook here.
      const asm = char.attackStatMods
        ? (char.attackStatMods(owner, card, { initiator: owner.id === initiator, fromWildSwing: !!fromWildSwing, dist: this.range(owner, opponent) }) || {})
        : {};
      // Set-time option (Noel's "+1SPD for [1]" — see setTimeOption in cards.js and
      // applySetTimeOption below): a per-Strike stat grant the player paid for when
      // they set this attack.
      const sto = owner.strikeState.setOptionStatMods || {};
      // Per-card conditional stat modifier, the card-level sibling of char.attackStatMods
      // above: the card itself decides its own condition in cards.js (Baiken's hand-size
      // clauses, Ky's "Range 2: +2SPD", Faust's "if you have a Boost in play", Goldlewis's
      // "if you initiated"), so the engine keeps exactly one extension point for all of them.
      // Read here, in the same single pass, so it lands before Speed order is decided.
      const cdm = card.liveStatMods
        ? (card.liveStatMods(owner, opponent, this, { initiator: owner.id === initiator, fromWildSwing: !!fromWildSwing, dist: this.range(owner, opponent) }) || {})
        : {};
      const statTotal = { pow: card.pow, spd: card.spd, arm: card.arm, grd: card.guardEqualsHandSize ? owner.hand.length : card.grd };
      const addStatMods = (m) => {
        if (!m) return;
        statTotal.pow += m.pow || 0;
        statTotal.spd += m.spd || 0;
        statTotal.arm += m.arm || 0;
        statTotal.grd += m.grd || 0;
      };
      for (const m of [cdm, mods, cm, nsm, esm, wsm, rcb, fub, asm, sto]) addStatMods(m);
      statTotal.pow += cancelBonus + actionStrikeBonus + oppPowDebuff;
      statTotal.spd += rangeSpdBonus + gaugeSpdBonus;
      if (card.selfArmorZero) statTotal.arm = 0;
      return {
        pow: statTotal.pow,
        spd: statTotal.spd,
        // Sickle Storm's "Lose all Armor" — an UNCONDITIONAL self-modifier (no
        // "if X" clause), so it belongs here in the initial liveStats pass,
        // computed once before speed order is even determined — same timing
        // guarantee ignoreArmor/ignoreGuard below already have. This was
        // originally built as a Before-hook (`ctx.selfArmorOverride`, still
        // present further down for any future CONDITIONAL case that genuinely
        // needs Before-movement to have already happened) but that turned out to
        // be a real bug for this card specifically: a before-hook only runs
        // during THAT card's own activateStep call, which — depending on
        // Speed — can happen AFTER the opponent's activation already checked
        // this card's Armor as the defender. Caught by direct testing (faster
        // opponent, e.g. Cross's SPD 6 vs Sickle Storm's SPD 4, dealt damage
        // using the un-reduced ARM 3 instead of the correct ARM 0). `selfArmorZero`
        // is a plain static field, not a hook, so it can't have that problem.
        arm: statTotal.arm,
        // Jin's Astral prints its Guard as "X = cards in your hand" — a live value,
        // read here rather than baked into the card's `grd` number.
        grd: statTotal.grd,
        // `fub` is the face-up bonus (Sagat's Innate; Happy Chaos's Steady Aim also
        // grants Ignore Armor there, so this reads a boolean out of it as well as stats).
        ignoreArmor: !!card.ignoreArmor || mods.ignoreArmor || !!fub.ignoreArmor || !!(criticalPaid && card.critical && card.critical.ignoreArmor),
        ignoreGuard: !!card.ignoreGuard || !!(criticalPaid && card.critical && card.critical.ignoreGuard),
      };
    };
    let aStats = liveStats(A, D, aCard, !!gp[A.id], attackerSel.fromWildSwing);
    let dStats = liveStats(D, A, dCard, !!gp[D.id], defenderSel.fromWildSwing);

    // Akuma's Innate/Exceed: "Your attacks have Critical: Both players have
    // +2/+3 POW." Unlike extraCriticalStatsIfOpponentAtRange1 (Zangief) and
    // specialsUltrasStatModsIfAtEdge (Vega), which only ever buff their own
    // owner, this one is MUTUAL — gated on it being AKUMA's own card that
    // actually paid Critical (attCriticalPaid for whichever side he is), but
    // applied to BOTH aStats and dStats. Folded in here, right after both
    // sides' liveStats are independently computed and still before Speed
    // order is determined just below, so it can affect the Speed order
    // exactly like every other liveStats-time bonus (it currently only
    // touches POW, but keeping this before the speed-order check matches the
    // established timing convention for all Critical/passive stat mods).
    // Data-driven off CHARACTERS[key].grantsMutualCriticalPow(player) so a
    // future character could grant an analogous mutual bonus without further
    // engine changes.
    const applyMutualCriticalGrant = (owner, ownerCriticalPaid) => {
      const ownerChar = CHARACTERS[owner.characterKey];
      if (ownerCriticalPaid && ownerChar.grantsMutualCriticalPow) {
        const bonus = ownerChar.grantsMutualCriticalPow(owner) || {};
        aStats.pow += (bonus.pow || 0);
        dStats.pow += (bonus.pow || 0);
      }
    };
    applyMutualCriticalGrant(A, !!gp[A.id]);
    applyMutualCriticalGrant(D, !!gp[D.id]);

    if (aCard.hooks) {
      if (aCard.hooks.spdBonusIfDefending && A.id !== initiator) aStats.spd += aCard.hooks.spdBonusIfDefending;
      if (aCard.hooks.spdBonusIfInitiating && A.id === initiator) aStats.spd += aCard.hooks.spdBonusIfInitiating;
      if (aCard.hooks.powBonusIfInitiating && A.id === initiator) aStats.pow += aCard.hooks.powBonusIfInitiating;
      // Sol Badguy's Volcanic Viper: "If you initiated, +2POW. Otherwise,
      // +2ARM." — the "otherwise" half, symmetric to spdBonusIfDefending's
      // existing shape but on Armor instead of Speed.
      if (aCard.hooks.armBonusIfDefending && A.id !== initiator) aStats.arm += aCard.hooks.armBonusIfDefending;
    }
    if (dCard.hooks) {
      if (dCard.hooks.spdBonusIfDefending && D.id !== initiator) dStats.spd += dCard.hooks.spdBonusIfDefending;
      if (dCard.hooks.spdBonusIfInitiating && D.id === initiator) dStats.spd += dCard.hooks.spdBonusIfInitiating;
      if (dCard.hooks.powBonusIfInitiating && D.id === initiator) dStats.pow += dCard.hooks.powBonusIfInitiating;
      if (dCard.hooks.armBonusIfDefending && D.id !== initiator) dStats.arm += dCard.hooks.armBonusIfDefending;
    }

    // Faust's Bone-crushing Excitement: "Attacks with higher Speed do not hit you."
    // Reuses the existing per-Strike `_unhittableThisStrike` flag (Dive's side-swap
    // protection) rather than adding a second miss condition to the range check — it is
    // decided here, right after both sides' Speed is final and before anything acts on it.
    if (aCard.hitImmuneToFasterAttacks && dStats.spd > aStats.spd) A.strikeState.unhittable = true;
    if (dCard.hitImmuneToFasterAttacks && aStats.spd > dStats.spd) D.strikeState.unhittable = true;

    let first = 'A', second = 'D';
    if (dStats.spd > aStats.spd) { first = 'D'; second = 'A'; }
    else if (dStats.spd === aStats.spd) { first = (A.id === initiator) ? 'A' : 'D'; second = first === 'A' ? 'D' : 'A'; }

    // ---- lastStrikeInfo: this exchange as DATA, for the UI to narrate ----
    // The fight log is prose; this is the same exchange structured, so render.js can
    // show the arithmetic the engine actually did (printed stat vs live stat, the
    // range check, POW-ARM, the Stun gate, where each card ended up) instead of
    // asking a new player to reverse-engineer it out of log sentences. Recorded
    // here rather than recomputed UI-side deliberately: every conditional modifier
    // above (Criticals, Boosts, character passives, EX, face-up, Wild Swing grants)
    // has already been folded into aStats/dStats at this point, and any second
    // implementation of that fold would immediately drift from this one.
    // Only ever appended to below, and read only after resolution finishes, so a
    // partially-filled record is never observable by the UI.
    const printedOf = (card, liveStats_) => ({
      range: card.range ? [card.range[0], card.range[1]] : [0, 0],
      pow: card.pow || 0,
      spd: card.spd || 0,
      arm: card.arm || 0,
      // Cards whose Guard is a formula ("X = cards in your hand") have no printed
      // number to show; echoing the live value in both columns is honest, where
      // printing 0 would read as a real stat the card doesn't have.
      grd: card.guardEqualsHandSize ? liveStats_.grd : (card.grd || 0),
    });
    const sideInfoOf = (player, card, stats, sel) => ({
      playerId: player.id,
      cardKey: card ? card.key : null,
      cardType: card ? (card.type || 'normal') : null,
      cardName: card ? card.name : '—',
      isEX: !!(card && card.isEX),
      fromWildSwing: !!(sel && sel.fromWildSwing),
      criticalPaid: !!gp[player.id],
      faceUp: !!player.strikeState.faceUp,
      printed: card ? printedOf(card, stats) : { range: [0, 0], pow: 0, spd: 0, arm: 0, grd: 0 },
      live: {
        pow: stats.pow, spd: stats.spd, arm: stats.arm, grd: stats.grd,
        ignoreArmor: !!stats.ignoreArmor, ignoreGuard: !!stats.ignoreGuard,
      },
    });
    this._resolvingCards = { [A.id]: aCard, [D.id]: dCard };
    this.lastStrikeInfo = {
      roundNum,
      initiatorId: initiator,
      distanceAtSet: this.range(A, D),
      firstId: (first === 'A' ? A : D).id,
      secondId: (second === 'A' ? A : D).id,
      sides: {
        [A.id]: sideInfoOf(A, aCard, aStats, attackerSel),
        [D.id]: sideInfoOf(D, dCard, dStats, defenderSel),
      },
      events: [],
      timeline: [],
    };
    const strikeInfo = this.lastStrikeInfo;
    const recordStrikeEvent = (evt) => { strikeInfo.events.push(evt); };
    const pushTimeline = (step) => {
      strikeInfo.timeline.push({
        p1Pos: this.P('p1').pos,
        p2Pos: this.P('p2').pos,
        p1Life: this.P('p1').life,
        p2Life: this.P('p2').life,
        ...step,
      });
    };
    pushTimeline({
      phase: 'reveal',
      actor: strikeInfo.firstId,
      speedWinner: strikeInfo.firstId,
      speedTie: aStats.spd === dStats.spd,
    });

    const engine = this;
    function* activateStep(whoTag) {
      const attacker = whoTag === 'A' ? A : D;
      const defender = whoTag === 'A' ? D : A;
      const attCard = whoTag === 'A' ? aCard : dCard;
      const defCard = whoTag === 'A' ? dCard : aCard;
      const attStats = whoTag === 'A' ? aStats : dStats;
      const defStats = whoTag === 'A' ? dStats : aStats;
      const attCriticalPaid = !!gp[attacker.id];
      // Hoisted up from further down this function (was previously declared
      // right before its one use, passiveRangeInclude) since normalsRangeBonus
      // below needs it too, earlier in this same function.
      const attChar = CHARACTERS[attacker.characterKey];
      const ctx = {
        engine, attacker, defender, attackerCard: attCard, defenderCard: defCard,
        sideSwapped: false, powBonus: 0, ignoreGuardThisHit: false, hitLanded: false,
        strikeInitiator: A.id === initiator ? A : D, attackGoesToGauge: true,
        criticalPaid: attCriticalPaid,
        // C. Viper's Burning Kick: "Critical, Hit: The opponent has -2POW." —
        // needs to mutate the DEFENDER's own live stats object in place (not
        // just ctx.powBonus, which only affects THIS card's own damage) so
        // that when the opponent's card activates second, it reads the
        // reduced value as its own attStats. Safe to expose on every ctx —
        // `attStats`/`defStats` are the exact same outer-scope objects the
        // damage math below already reads from, just aliased for hooks.
        attStats, defStats,
      };
      if (attCard.alwaysMiss) engine.logMsg(`${attacker.name}'s ${attCard.name} cannot connect as an attack.`, 'miss', attacker.id);
      // Cammy's Dive Kick boost: "Your Normals have 'Before: Advance 3.'" — a blanket
      // rule modifier on OTHER cards, checked generically off an active continuous
      // boost's `grantsNormalsBeforeAdvance` field rather than special-cased per
      // character. Applies before the card's own `before` hook (order doesn't
      // functionally matter here since both are pure movement, but keeps this
      // consistently "first" for readability).
      for (const b of attacker.boostsInPlay) {
        const bonus = b.card.boost && b.card.boost.grantsNormalsBeforeAdvance;
        if (bonus && attCard.type === 'normal') {
          const before = attacker.pos < defender.pos;
          engine.advanceSelf(attacker, defender, bonus, true);
          const after = attacker.pos < defender.pos;
          if (before !== after) ctx.sideSwapped = true;
        }
        // Sol Badguy's Tyrant Rave boost: "[+] Before: Close 1; if you Closed
        // fewer than 1 space, +2POW" — same shape as grantsNormalsBeforeAdvance
        // above but applies to ANY card this player sets (not gated on
        // card.type === 'normal') and adds a shortfall-POW bonus, mirroring
        // Sickle Flash's "if Pushed fewer than 1, +2POW" measurement pattern.
        const closeBonus = b.card.boost && b.card.boost.grantsBeforeCloseWithBonus;
        if (closeBonus) {
          const beforePos = attacker.pos;
          engine.closeSelf(attacker, defender, closeBonus.amount);
          const moved = Math.abs(attacker.pos - beforePos);
          if (moved < closeBonus.amount) ctx.powBonus += closeBonus.pow;
        }
      }
      // Taokaka's Innate/Exceed grants a Before clause onto the attack she
      // initiates ("Before: Advance 2..."), so it has to run alongside the card's
      // own Before hook rather than as a stat modifier. Character-level sibling of
      // attackHitHook below; the flags it needs (is this her initiation? was it a
      // Wild Swing?) are passed in, since only she cares about them.
      if (attChar.attackBeforeHook) {
        attChar.attackBeforeHook(ctx, {
          initiator: attacker.id === initiator,
          fromWildSwing: !!(whoTag === 'A' ? attackerSel.fromWildSwing : defenderSel.fromWildSwing),
        });
      }
      if (attCard.hooks && attCard.hooks.before) attCard.hooks.before(ctx);
      if (attCriticalPaid && attCard.critical && attCard.critical.before) attCard.critical.before(ctx);
      // Rainwater's "Before: You may Retreat 1." — a real yielded choice, not
      // auto-resolved, since retreating changes whether THIS card's own Hit
      // (range 2-4) ends up in range at all — see cards.js's AXL header comment
      // for why this isn't treated as an "up to X" cosmetic auto-resolve.
      if (attCard.hooks && attCard.hooks.optionalRetreat) {
        const wantsRetreat = yield {
          type: 'optional_retreat', playerId: attacker.id, cardName: attCard.name,
          amount: attCard.hooks.optionalRetreat,
        };
        if (wantsRetreat) {
          engine.retreatSelf(attacker, defender, attCard.hooks.optionalRetreat);
          engine.logMsg(`${attacker.name} retreats ${engine.spaceWord(attCard.hooks.optionalRetreat)} (${attCard.name}).`);
        }
      }
      pushTimeline({ phase: 'before', actor: attacker.id, sideSwapped: !!ctx.sideSwapped });
      // Note: a `ctx.selfArmorOverride` field applied here (mutating attStats.arm
      // right after the Before-hook) used to exist for Sickle Storm's "Lose all
      // Armor". Removed — see the `selfArmorZero` comment in liveStats above:
      // that's the WRONG timing for an unconditional self-Armor modifier, since
      // this point only runs during THIS card's own activateStep call, which the
      // OPPONENT's activation may already have passed if they're faster. A
      // future card with a genuinely CONDITIONAL self-Armor change (depending on
      // this card's own Before-movement outcome) could still reuse this exact
      // spot — just be aware of that ordering hazard before doing so.

      // range check (with Knee Bash-style initiator bonus). `attackRange` is
      // `range(attacker, defender)` for everyone except Zato-1 measuring a
      // Special/Ultra from Eddie while Eddie is on the board (see attackSourcePos).
      const rng = engine.attackRange(attacker, defender, attCard);
      let maxR = attCard.range ? attCard.range[1] : null;
      if (attCard.hooks && attCard.hooks.rangeMaxBonusIfInitiating && attacker.id === initiator) {
        maxR += attCard.hooks.rangeMaxBonusIfInitiating;
      }
      // Zangief's Banishing Flat boost: "+0~1RNG" (a continuous max-range bonus,
      // always active while the boost persists — unlike Knee Bash's above, which
      // is card-hook-driven and initiator-conditional). "Up to 1" auto-resolves to
      // +1, per this codebase's established "up to X" simplification (see cards.js
      // header comment) — it's not a real per-strike decision.
      if (maxR != null) {
        for (const b of attacker.boostsInPlay) {
          if (b.card.boost && b.card.boost.rangeMaxBonus) maxR += b.card.boost.rangeMaxBonus;
        }
        // Axl's Innate/Exceed: "Your Normals have +0~2 Range" — a character-level
        // (not card-hook, not boost) max-range bonus, gated on card.type ===
        // 'normal'. Data-driven off CHARACTERS[key].normalsRangeBonus(player);
        // see the matching normalsStatMods comment in liveStats above for why
        // this is split into two extension points instead of one.
        if (attCard.type === 'normal' && attChar.normalsRangeBonus) {
          maxR += attChar.normalsRangeBonus(attacker) || 0;
        }
        // Nu-13's Exceed ("your attacks have +0~4RNG") — the ungated sibling of
        // normalsRangeBonus just above, applying to any card she sets. "+0~N"
        // auto-resolves to the max, per this codebase's "up to X" convention.
        if (attChar.attackRangeBonus) maxR += attChar.attackRangeBonus(attacker, attCard) || 0;
        // Set-time option (Nu-13's Innate: "spend {1} for +3~4RNG") — see
        // applySetTimeOption; cleared at the end of the Strike.
        maxR += attacker.strikeState.setOptionRangeBonus || 0;
        // Card-level dynamic max-range bonus (Jack-O's "+0~1RNG per Boost you have in
        // play" / "+0~3RNG if you have a Boost in play") — the per-card sibling of
        // normalsRangeBonus/attackRangeBonus above, computed live rather than declared.
        if (attCard.dynamicRangeMaxBonus) maxR += attCard.dynamicRangeMaxBonus(attacker, defender, engine, attacker.id === initiator) || 0;
      }
      // Range immunity (see engine.computeRangeImmunity — Cammy's Dive Kick/CQC/
      // Gyro Drive Smasher/Razor's Edge Slicer): if the DEFENDER is immune to
      // attacks at exactly this range this Strike, the attack cannot connect no
      // matter what the attacking card's own range band says.
      const rangeImmune = defender.strikeState.rangeImmune && defender.strikeState.rangeImmune.includes(rng);
      // Cammy's passive (Innate/Exceeded): if her Before-movement carried her past
      // the opponent this Strike (ctx.sideSwapped, already set by the `before` hook
      // above by the time we get here), her attack's range "includes them" —
      // i.e. it connects regardless of the card's printed range band. Data-driven
      // off CHARACTERS[key].sideSwapRangeInclude (see cards.js) rather than an
      // identity check, per the project's established extension-point pattern.
      // Two sources for the same exception: Cammy's is a CHARACTER passive that
      // applies to everything she sets, while Chun-Li's Head Stomp prints the clause
      // on the card itself ("If you moved past the opponent with this movement, your
      // attack's range includes them") — and that card has no printed range at all
      // (the workbook shows RNG "X"), so this is its only way to connect.
      const passiveRangeInclude = !!(attChar.sideSwapRangeInclude && ctx.sideSwapped) ||
        !!(attCard.rangeIncludeIfSideSwapped && ctx.sideSwapped);
      // C. Viper's Burst Time: "If you do not have any Continuous Boosts in
      // play, your attack does not hit" — an extra miss condition alongside
      // range/rangeImmune, checked against the ATTACKER's own boostsInPlay.
      const burstTimeBlocked = !!(attCard.noHitWithoutContinuousBoost && attacker.boostsInPlay.length === 0);
      // Dive/GG Dive's "If side swap, cannot be hit": set on the DEFENDER's own
      // player object by their card's `before` hook when IT side-swapped earlier
      // this Strike (see cards.js) — read here regardless of which card is
      // currently activating, so it protects against the opponent's attack too.
      // Ragna's Gauntlet Hades: "If you Advanced past the opponent, this attack does
      // not hit." Unlike Dive's `_unhittableThisStrike` (which protects the mover from
      // the OPPONENT's attack), this switches off the moving card's OWN attack, so it
      // is a per-activation ctx flag set by that card's Before hook just above.
      const inRange = !rangeImmune && !attCard.alwaysMiss && !burstTimeBlocked && !ctx.selfCannotHit && !defender.strikeState.unhittable &&
        ((attCard.range && rng >= attCard.range[0] && rng <= maxR) || passiveRangeInclude);
      pushTimeline({ phase: 'range', actor: attacker.id, hitLanded: !!inRange, range: rng });
      if (burstTimeBlocked) engine.logMsg(`${attacker.name}'s ${attCard.name} does not hit \u2014 no Continuous Boost in play.`, 'miss', defender.id, { attackerId: attacker.id });

      // Range check as data (see lastStrikeInfo above). Recorded HERE, not at
      // set time, because `rng` is the distance as it stands after this card's
      // own Before-movement has already run \u2014 which is exactly the point a
      // beginner misses when a card that looked out of range connects anyway.
      recordStrikeEvent({
        type: 'activate',
        attackerId: attacker.id, defenderId: defender.id,
        cardName: attCard.name, rng,
        bandMin: attCard.range ? attCard.range[0] : 0,
        bandMax: attCard.range ? maxR : 0,
        inRange,
        missReason: inRange ? null : (rangeImmune ? 'range_immune'
          : (attCard.alwaysMiss || burstTimeBlocked || ctx.selfCannotHit || defender.strikeState.unhittable) ? 'cannot_hit'
            : 'out_of_range'),
      });

      if (inRange) {
        if (attCard.hooks && attCard.hooks.interactiveHit === 'grasp_move') {
          // Generalized: Grasp is min:1/max:2/either-direction (the original card),
          // but this same yield/UI machinery is reused as-is for any card needing an
          // interactive "move the defender N spaces, attacker's choice" Hit — e.g.
          // Cammy's Cannon Spike (fixed amount, direction-only choice: set
          // moveMin===moveMax) and her CQC/Gyro Drive Smasher (0..8 "any number of
          // spaces", optionally direction-locked via moveForceDirection). Defaults
          // preserve Grasp's exact original behavior when a card doesn't set them.
          const mMin = attCard.hooks.moveMin != null ? attCard.hooks.moveMin : 1;
          const mMax = attCard.hooks.moveMax != null ? attCard.hooks.moveMax : 2;
          const forceDir = attCard.hooks.moveForceDirection || null;
          const answer = yield { type: 'grasp_move', playerId: attacker.id, min: mMin, max: mMax, forceDirection: forceDir, cardName: attCard.name, cardKey: attCard.key };
          const amount = Math.max(mMin, Math.min(mMax, (answer && answer.amount != null) ? answer.amount : mMax));
          const direction = forceDir || (answer && answer.direction) || 'retreat';
          const beforePos = defender.pos;
          if (direction === 'advance') engine.pushToward(defender, attacker, amount);
          else engine.pushAway(defender, attacker, amount);
          const actualMoved = Math.abs(defender.pos - beforePos);
          if (actualMoved > 0) {
            engine.logMsg(`${attacker.name}'s ${attCard.name} moves ${defender.name} ${engine.spaceWord(actualMoved)} (${direction === 'advance' ? 'toward' : 'away from'} ${attacker.name}).`, 'move', defender.id, { amount: actualMoved });
          }
          // Optional per-card follow-up that needs to know the ACTUAL distance moved
          // (may be less than requested if clamped by the board edge) — e.g. Gyro
          // Drive Smasher's "+1POW for each space pulled this way."
          if (attCard.hooks.afterInteractiveMove) attCard.hooks.afterInteractiveMove(ctx, actualMoved);
        } else if (attCard.hooks && attCard.hooks.hit) {
          attCard.hooks.hit(ctx);
        }
        if (attCriticalPaid && attCard.critical && attCard.critical.hit) attCard.critical.hit(ctx);
        // Axl Bomber's "Hit: ... You may spend 1 Gauge. If you do, Advantage." —
        // a genuine cost/benefit yielded choice (see cards.js's AXL header
        // comment), same treatment as Block's reactive Force-for-Armor: a real
        // pause for player input, not an auto-resolve. Generalized off
        // `hooks.optionalGaugeSpend` (amount + whether it grants Advantage)
        // rather than hardcoded to this one card, in case a future card reuses
        // the same shape.
        if (attCard.hooks && attCard.hooks.optionalGaugeSpend) {
          const spec = attCard.hooks.optionalGaugeSpend;
          if (engine.gaugeCount(attacker) >= spec.amount) {
            const wantsSpend = yield {
              type: 'optional_gauge_spend', playerId: attacker.id, cardName: attCard.name, cardKey: attCard.key,
              amount: spec.amount, grantsAdvantage: !!spec.grantsAdvantage,
            };
            if (wantsSpend) {
              const spent = engine.spendGauge(attacker, spec.amount);
              attacker.discard.push(...spent);
              engine.logMsg(`${attacker.name} spends ${spec.amount} Gauge (${attCard.name}).`, 'gauge', attacker.id);
              if (spec.grantsAdvantage) engine.grantAdvantage(attacker, attCard.name);
            }
          }
        }
        // Cammy's Exceeded rider: "...and has 'Hit: +1POW and Advantage.'" — an
        // extra Hit-time effect layered onto ANY attack card she uses, but ONLY
        // when Exceeded AND the passive above actually triggered (moved past the
        // opponent this Strike). Data-driven off CHARACTERS[key].exceededSideSwapHit
        // (see cards.js) rather than a character-identity branch here.
        if (attacker.exceeded && ctx.sideSwapped && attChar.exceededSideSwapHit) attChar.exceededSideSwapHit(ctx);
        // Testament/Giovanna's Innate/Exceed: "Your Normals have 'Hit: ...'" — an extra
        // Hit-time effect layered onto any NORMAL (not Special/Ultra) this character
        // sets. Data-driven off CHARACTERS[key].normalsHitHook (mirrors
        // normalsStatMods/normalsRangeBonus's "gate on card.type === 'normal'" pattern
        // above) rather than a character-identity branch here. A generator (not a plain
        // function) so it can `yield` for a genuine choice (Testament's "may Push or
        // Pull 1") the same way Grasp does — see `attCard.hooks.interactiveHit` above.
        if (attCard.type === 'normal' && attChar.normalsHitHook) yield* attChar.normalsHitHook(ctx);
        // Season 5 / BlazBlue needed the ungated version of the same idea: a
        // character-level Hit effect on ANY attack ("Hit: Gain 1 life" is Ragna's
        // whole Innate; Noel's and Nu-13's Exceeds add one too). Also a generator,
        // for the same reason normalsHitHook is one.
        if (attChar.attackHitHook) yield* attChar.attackHitHook(ctx);
        // Giovanna's "[Action] Strike with 'Hit: Draw N'": an extra Hit-time effect
        // that only applies to the ONE Strike triggered by a character action (any
        // card, not just Normals) — gated on the same `actionStrikeThisTurn` flag
        // `liveStats`'s `actionStrikePowBonus` (Baiken/I-No/Giovanna's Exceed +POW)
        // already uses. Data-driven off CHARACTERS[key].actionStrikeHitHook.
        if (attacker.actionStrikeThisTurn && attChar.actionStrikeHitHook) attChar.actionStrikeHitHook(ctx);
        // C. Viper's Temple Massage ("Hit: Spend up to {4}. For each Force
        // spent, +1POW.") and Thunder Knuckle's boost (identical shape, but
        // from a continuous boost active on a LATER Strike rather than the
        // card's own text) — a genuine cost/benefit trade like Block's
        // reactive Force-for-Armor, so it's a real yield, not an auto-max.
        // One shared yield type reused for both sources.
        //
        // Force is counted by VALUE, not by card count (forceValueOfCard — an Ultra is
        // worth 2), matching every other Force payment in this engine, and the cards
        // spent are chosen cheapest-first instead of taken off the front of the hand.
        // The old version did neither: `maxForce` was `hand.length`, and it discarded
        // `hand[0]` repeatedly, so a player could lose an Ultra to buy +1POW. Those are
        // the same two bugs Block's reactive spend had. The comment here used to claim
        // "which specific cards isn't a strategically meaningful choice", which isn't
        // true once the cards differ in both Force value and play value.
        function* spendForPow(spec) {
          const byCost = [...attacker.hand].sort((a, b) =>
            (engine.forceValueOfCard(a) - engine.forceValueOfCard(b)) || ((a.pow || 0) - (b.pow || 0)));
          const capacity = byCost.reduce((s, c) => s + engine.forceValueOfCard(c), 0);
          const maxForce = Math.min(spec.max, capacity);
          if (maxForce <= 0) return;
          const ans = yield { type: 'optional_force_spend_pow', playerId: attacker.id, max: maxForce, cardName: attCard.name, cardKey: attCard.key };
          const want = Math.max(0, Math.min(maxForce, ans | 0));
          if (want > 0) {
            const spentCards = [];
            let spent = 0;
            for (const c of byCost) {
              const v = engine.forceValueOfCard(c);
              if (spent + v > want) continue; // never overshoot what was actually asked for
              const taken = engine.discardFromHand(attacker, c.uid);
              if (taken) { spentCards.push(taken); spent += v; }
              if (spent >= want) break;
            }
            const gained = spent * (spec.powPerForce || 1);
            ctx.powBonus += gained;
            engine.logMsg(`${attacker.name} spends ${spent} Force for +${gained}POW (${attCard.name}): discards ${spentCards.map(c => c.name).join(', ')}.`, 'force', attacker.id);
          }
        }
        if (attCard.hooks && attCard.hooks.optionalForceSpendForPow) {
          yield* spendForPow(attCard.hooks.optionalForceSpendForPow);
        }
        for (const b of attacker.boostsInPlay) {
          if (b.card.boost.optionalForceSpendForPowOnHit) {
            yield* spendForPow(b.card.boost.optionalForceSpendForPowOnHit);
          }
        }
        ctx.hitLanded = true;
        const effPow = attStats.pow + (ctx.powBonus || 0);
        const baseDef = { arm: defStats.arm, grd: defStats.grd };
        let bonusArm = 0;
        // Block's reactive Force-for-Armor: only relevant if defender's set card is Block
        // Block's reactive Force-for-Armor — also matches GG Block ('gg_block',
        // Axl's version of this same card, identical mechanic per cards.js).
        if (defCard.key === 'block' || defCard.key === 'gg_block') {
          // maxForce is the defender's total spendable Force VALUE from hand (an Ultra is
          // worth 2 — see forceValueOfCard), NOT the raw card count. Block used to count
          // every card as exactly 1 Force, which disagreed with every other Force-payment
          // surface in this engine (Move, Boost, character actions).
          const maxForce = defender.hand.reduce((s, c) => s + engine.forceValueOfCard(c), 0);
          if (maxForce > 0) {
            const rawPow = effPow;
            const ans = yield {
              type: 'block_force', playerId: defender.id, maxForce,
              cardName: defCard.name, cardKey: defCard.key,
              attackerPow: rawPow, defenderArmBase: baseDef.arm, defenderGuard: baseDef.grd,
              // The defender's own hand, for the picker (this yield is only ever routed to
              // the defender themselves, so this leaks nothing — invariant #1 is about the
              // OPPONENT's hand).
              hand: defender.hand.map(c => ({ uid: c.uid, name: c.name, forceValue: engine.forceValueOfCard(c) })),
            };
            const spentCards = [];
            if (ans && typeof ans === 'object' && Array.isArray(ans.uids)) {
              // The player (or a caller that cares) picked exactly which cards pay.
              for (const uid of ans.uids) {
                const c = engine.discardFromHand(defender, uid);
                if (c) spentCards.push(c);
              }
            } else {
              // Backwards-compatible integer answer ("spend N Force worth"): ai.js's
              // resolveAIStrikeRequest and several test harnesses answer with a bare
              // number. The engine then chooses, cheapest first — lowest Force value,
              // then lowest POW — so a bare number can never eat an Ultra while a
              // 1-Force card was available.
              let need = Math.max(0, Math.min(maxForce, ans | 0));
              const order = [...defender.hand].sort((a, b) =>
                (engine.forceValueOfCard(a) - engine.forceValueOfCard(b)) || ((a.pow || 0) - (b.pow || 0)));
              for (const c of order) {
                const val = engine.forceValueOfCard(c);
                if (val > need) continue; // never overshoot the requested amount
                const got = engine.discardFromHand(defender, c.uid);
                if (got) { spentCards.push(got); need -= val; }
                if (need <= 0) break;
              }
            }
            if (spentCards.length > 0) {
              // Armor comes from the Force VALUE spent, capped at what the rules allow.
              const forceValue = spentCards.reduce((s, c) => s + engine.forceValueOfCard(c), 0);
              bonusArm = 2 * Math.min(forceValue, maxForce);
              engine.logMsg(`${defender.name} spends ${forceValue} Force from Block for +${bonusArm} Armor (discards ${spentCards.map(c => c.name).join(', ')}).`, 'armor', defender.id, { amount: bonusArm });
            }
          }
        }
        const effArm = (attStats.ignoreArmor) ? 0 : (baseDef.arm + bonusArm);
        const effGrd = (ctx.ignoreGuardThisHit || attStats.ignoreGuard) ? 0 : baseDef.grd;
        const dealt = Math.max(0, effPow - effArm);
        defender.life = Math.max(0, defender.life - dealt);
        // "If you were hit" (Noel's Astral, four of Hakumen's cards): readable during
        // the SECOND activation of a Strike, since the slower card resolves after this
        // damage has already been applied. Swept with the other per-Strike flags.
        defender.strikeState.wasHit = true;
        engine.logMsg(`${attacker.name}'s ${attCard.name} HITS for ${dealt} damage (POW ${effPow} \u2212 ARM ${effArm}). ${defender.name}: ${defender.life}/${defender.maxLife} life.`, 'hit', defender.id, {
          amount: dealt,
          attackerId: attacker.id,
          defenderId: defender.id,
          cardName: attCard.name,
          cardType: attCard.type || 'normal',
          isEX: !!attCard.isEX,
          criticalPaid: !!attCriticalPaid,
          effPow,
          effArm,
          effGrd,
          guardBroken: dealt > effGrd,
          confirmedLethal: defender.life <= 0,
        });
        ctx._effGrd = effGrd; ctx._dealt = dealt;
        // The damage math, with Block's reactive Armor already folded into effArm —
        // so the UI can show the same subtraction the engine performed rather than
        // the card's printed POW against the card's printed ARM, which would not
        // add up whenever anything modified either side.
        recordStrikeEvent({
          type: 'damage',
          attackerId: attacker.id, defenderId: defender.id, cardName: attCard.name,
          effPow, effArm, effGrd, dealt, defenderLifeAfter: defender.life,
        });
        pushTimeline({
          phase: 'hit',
          actor: attacker.id,
          defenderId: defender.id,
          damageDealt: dealt,
          effectivePower: effPow,
          effectiveArmor: effArm,
          effectiveGuard: effGrd,
          guardBroken: dealt > effGrd,
          confirmedLethal: defender.life <= 0,
          cardName: attCard.name,
          cardType: attCard.type || 'normal',
          isEX: !!attCard.isEX,
          criticalPaid: !!attCriticalPaid,
        });
      } else {
        if (rangeImmune) {
          engine.logMsg(`${attacker.name}'s ${attCard.name} misses \u2014 ${defender.name} is immune to attacks at range ${rng} this Strike.`, 'miss', defender.id, { attackerId: attacker.id });
        } else {
          engine.logMsg(`${attacker.name}'s ${attCard.name} misses (range ${rng}, needs ${attCard.range ? attCard.range[0] + '-' + maxR : 'N/A'}).`, 'miss', defender.id, { attackerId: attacker.id });
        }
      }
      if (attCard.hooks && attCard.hooks.interactiveAfter === 'hadoken_recycle') {
        if (ctx.hitLanded) {
          const wantsRecycle = yield { type: 'hadoken_recycle', playerId: attacker.id, cardName: attCard.name };
          if (wantsRecycle) {
            engine.recycleHadoken(attacker);
            ctx.attackGoesToGauge = false; // returned to deck instead of gauge
          }
        }
      } else if (attCard.hooks && attCard.hooks.after) {
        attCard.hooks.after(ctx);
      }
      if (attCriticalPaid && attCard.critical && attCard.critical.after) attCard.critical.after(ctx);
      // Character-level After clause (Jin's Exceed "After: Draw 1"), and the
      // After granted by a paid set-time option (Jin's Innate buys "After: Draw 2").
      // Both are ungated by card type, matching their printed text.
      if (attChar.attackAfterHook) attChar.attackAfterHook(ctx);
      // Zato-1's Innate/Exceed: "Your Normals have 'After: You may place Eddie in a
      // space within this attack's Range [in any space, while Exceeded].'" The
      // Normals-gated, generator sibling of attackAfterHook above — a generator
      // because choosing the space is a real decision, exactly like normalsHitHook's
      // Push/Pull choice.
      if (attCard.type === 'normal' && attChar.normalsAfterHook) yield* attChar.normalsAfterHook(ctx);
      if (attacker.strikeState.setOptionAfter) { attacker.strikeState.setOptionAfter(engine, attacker, defender, ctx); }
      // One Vision's "After: Play this as its Boost and sustain it." — self-
      // applies its OWN boost effect immediately and for free (this is the
      // card's own printed effect, not a paid Boost action — no Force cost, no
      // separate player decision to play it), then keeps it in boostsInPlay
      // indefinitely (`sustainedForever` — see cleanupBoosts, which skips
      // discarding/gauging any entry with that flag during the normal
      // end-of-strike sweep) until spent via the action its boost text grants
      // (see grantsBurstAction, handled in ui.js/render.js). Mirrors playBoost's
      // own continuous-boost branch closely on purpose — same ctx shape, same
      // nowDraw/nowClose support if a future card like this needs them — but
      // duplicated rather than calling playBoost() itself, since this card was
      // never "in hand" to remove/pay Force for; it's already mid-resolution as
      // the current Strike's attack card.
      if (attCard.hooks && attCard.hooks.selfBoostAndSustainAfterHit) {
        const boostCtx = { engine, player: attacker, opponent: defender, gaugeInsteadOfDiscard: false };
        if (attCard.boost.nowDraw) engine.draw(attacker, attCard.boost.nowDraw);
        if (attCard.boost.nowClose) engine.closeSelf(attacker, defender, attCard.boost.nowClose);
        if (attCard.boost.resolve) attCard.boost.resolve(boostCtx);
        attacker.boostsInPlay.push({ card: attCard, ownerId: attacker.id, sustainedForever: true });
        engine.logMsg(`${attacker.name}'s ${attCard.name} is played as its own Boost and sustained.`, 'boost', attacker.id);
        ctx.attackGoesToGauge = false; // stays in boostsInPlay, not gauge/discard
      }
      for (const b of attacker.boostsInPlay) {
        if (ctx.hitLanded && b.card.boost.onHit) b.card.boost.onHit({ engine, player: attacker, opponent: defender });
      }
      pushTimeline({ phase: 'after', actor: attacker.id, hitLanded: !!ctx.hitLanded });
      return ctx;
    }

    const firstCtx = yield* activateStep(first);
    const firstAttacker = first === 'A' ? A : D;
    const firstDefender = first === 'A' ? D : A;
    let secondHappens = true;
    let stunnedPlayerId = null;
    let koWinnerId = null;
    if (firstDefender.life <= 0) {
      // Exceed rule: dropping a fighter to 0 life ends the game immediately;
      // the slower player does not activate even if Stun Immune.
      secondHappens = false;
      koWinnerId = firstAttacker.id;
    }
    if (secondHappens && firstCtx.hitLanded) {
      const dmg = firstCtx._dealt;
      const grd = firstCtx._effGrd;
      const secondPlayer = second === 'A' ? A : D;
      const secondCard = second === 'A' ? aCard : dCard;
      const secondCritPaid = !!gp[secondPlayer.id];
      // Zangief's Flying Power Bomb (Critical) / Ultimate Atomic Buster (continuous
      // boost): Stun Immunity — checked at the moment Stun would apply, from either
      // source, rather than baked into liveStats (Stun isn't a stat, it's a
      // pass/fail gate on this specific check).
      const stunImmune = !!(secondCard && secondCard.critical && secondCard.critical.stunImmune && secondCritPaid) ||
        !!(secondCard && secondCard.stunImmuneBase) ||
        secondPlayer.boostsInPlay.some(b => b.card.boost && b.card.boost.stunImmuneGrant);
      if (dmg > grd && !stunImmune) {
        secondHappens = false;
        stunnedPlayerId = secondPlayer.id;
        pushTimeline({
          phase: 'stunned',
          actor: secondPlayer.id,
          stunned: true,
          guardBroken: true,
          damageDealt: dmg,
          effectiveGuard: grd,
        });
        this.logMsg(`${secondPlayer.name} is STUNNED (took ${dmg} > Guard ${grd}) \u2014 their ${secondCard.name} is discarded.`, 'stun', secondPlayer.id);
        secondPlayer.discard.push(secondCard);
        if (second === 'A') aCard = null; else dCard = null;
      } else if (dmg > grd && stunImmune) {
        this.logMsg(`${secondPlayer.name} would be Stunned (took ${dmg} > Guard ${grd}) but is immune this Strike.`, 'immune', secondPlayer.id);
      }
      // Recorded whenever the first card connected, INCLUDING the no-stun case
      // (dmg <= grd) — "your Guard held" is the half of this rule a player never
      // sees explained, and omitting the event would make Guard look decorative.
      recordStrikeEvent({
        type: 'stun',
        playerId: secondPlayer.id,
        cardName: secondCard ? secondCard.name : '—',
        dmg, grd, immune: !!(dmg > grd && stunImmune),
      });
    }
    // Axl's Sickle Storm: "After: If the opponent is stunned, Push 2." Only the
    // FIRST-acting card can ever be the CAUSE of a stun this exchange (only the
    // second-to-act can be stunned at all, and only by the first's hit) — so this
    // only fires for whichever card activated first, with whether a stun actually
    // happened now known (computed just above, which is why this can't live
    // inside activateStep's own `after` handling — that runs BEFORE this check).
    const firstCard = first === 'A' ? aCard : dCard;
    if (firstCard && firstCard.hooks && firstCard.hooks.afterStunCheck) {
      firstCard.hooks.afterStunCheck(firstCtx, stunnedPlayerId === (first === 'A' ? D.id : A.id));
    }
    let secondCtx = null;
    if (secondHappens) {
      secondCtx = yield* activateStep(second);
      const secondAttacker = second === 'A' ? A : D;
      const secondDefender = second === 'A' ? D : A;
      if (secondDefender.life <= 0) koWinnerId = secondAttacker.id;
    }

    const cleanupOne = (whoTag, ctx, card) => {
      if (!card) return;
      const player = whoTag === 'A' ? A : D;
      // Where a used card ends up IS the game's central economy rule (hit -> Gauge,
      // miss -> discard), so every disposal branch below reports itself rather than
      // only the two common ones — a card vanishing to `sealed`/`inplay` with no
      // explanation is exactly the kind of thing that makes the loop look arbitrary.
      const recordDest = (dest) => recordStrikeEvent({
        type: 'cleanup', playerId: player.id, cardName: card.name, dest,
      });
      // Happy Chaos's "After: Seal this" cards go to his sealed area instead of the
      // discard/Gauge — the whole point of his deck is that they come back in bulk later.
      if (card.sealAfterUse) {
        player.sealedCards.push(card);
        this.logMsg(`${player.name}'s ${card.name} is sealed.`, 'seal', player.id);
        recordDest('sealed');
        return;
      }
      // Deus Ex Machina "never leaves play and cannot be added to your Gauge" — it is
      // not a deck card at all, so it simply ceases to exist after the Strike it was set in.
      if (card.neverLeavesPlay) { recordDest('inplay'); return; }
      if (card.hooks && card.hooks.goesToGaugeEvenOnMiss) { player.gauge.push(card); recordDest('gauge'); return; }
      if (ctx && ctx.hitLanded && ctx.attackGoesToGauge !== false) { player.gauge.push(card); recordDest('gauge'); }
      else if (ctx && ctx.hitLanded && ctx.attackGoesToGauge === false) {
        // Two different cards clear attackGoesToGauge for two different reasons —
        // Hadoken recycles itself to the top of the deck, while a
        // selfBoostAndSustainAfterHit card stays on the table as its own Boost — so
        // the destination is read off where the card actually is now, not assumed.
        recordDest(player.boostsInPlay.some(b => b.card === card) ? 'inplay' : 'deck');
      }
      else {
        player.discard.push(card);
        this.logMsg(`${player.name}'s ${card.name} is discarded (missed).`, 'discard', player.id);
        recordDest('discard');
      }
    };
    cleanupOne(first, firstCtx, first === 'A' ? aCard : dCard);
    if (secondHappens) cleanupOne(second, secondCtx, second === 'A' ? aCard : dCard);

    // Zangief's Spinning Piledriver / Ultimate Atomic Buster boosts: "After: If you
    // were hit this Strike, add this card to your Gauge" (mandatory, not a choice —
    // no "may" in the text, unlike sustain — so no yield needed here).
    const wasHit = (player) => (firstCtx && firstCtx.hitLanded && firstCtx.defender.id === player.id) ||
      (secondCtx && secondCtx.hitLanded && secondCtx.defender.id === player.id);
    // Axl Bomber's boost: "After: If the opponent is stunned, draw 1" — unlike
    // Sickle Storm above (a card's OWN after-effect, conditioned on ITS causing a
    // stun), this is a continuous BOOST that cares whether the opponent got
    // stunned by ANYTHING this Strike, regardless of which cards were actually
    // set — so it's checked generically here in cleanupBoosts, the same place
    // toGaugeIfHitThisStrike already is, rather than tied to one card's hooks.
    yield* this.cleanupBoosts(A, aCard ? aCard.type : null, wasHit(A), stunnedPlayerId === D.id, stunnedPlayerId === A.id);
    yield* this.cleanupBoosts(D, dCard ? dCard.type : null, wasHit(D), stunnedPlayerId === A.id, stunnedPlayerId === D.id);
    // Card-level cleanup effects (Nagoriyuki's Specials have "Cleanup: Draw 4. Discard 2.")
    this.triggerCardCleanup(A, aCard);
    this.triggerCardCleanup(D, dCard);
    pushTimeline({ phase: 'cleanup', actor: null, confirmedLethal: this.gameOver || this.P('p1').life <= 0 || this.P('p2').life <= 0 });
    // Character-level CLEANUP hooks (Platinum the Trinity's Innate/Exceed are both
    // "Cleanup: You may reveal the top card of your deck..."). Distinct from
    // onAfterStrike below, and deliberately ordered here — after the boost sweep and
    // the card-level Cleanup clauses — so a boost this hook puts into play is not
    // immediately swept by the same cleanup, and so "sustain one of your Continuous
    // Boosts" sees the boosts that actually survived. Generators, same as
    // onAfterStrike, so they can pause for a real choice.
    const charCleanupA = CHARACTERS[A.characterKey];
    const charCleanupD = CHARACTERS[D.characterKey];
    if (charCleanupA && charCleanupA.onStrikeCleanup) {
      yield* charCleanupA.onStrikeCleanup(this, A, D, { card: aCard, opponentStunned: stunnedPlayerId === D.id, wasStunned: stunnedPlayerId === A.id });
    }
    if (charCleanupD && charCleanupD.onStrikeCleanup) {
      yield* charCleanupD.onStrikeCleanup(this, D, A, { card: dCard, opponentStunned: stunnedPlayerId === A.id, wasStunned: stunnedPlayerId === D.id });
    }
    // Character-level After-Strike hooks (e.g., Leo's "may Exceed if opponent stunned",
    // Millia's "may draw 1/Advance 2/Retreat 2[/gain Advantage]"). Generators (`yield*`,
    // not a plain call) so they can pause for a genuine player choice — see the
    // `named_choice`/`may_exceed_choice` yield types.
    const charA = CHARACTERS[A.characterKey];
    const charD = CHARACTERS[D.characterKey];
    if (charA && charA.onAfterStrike) {
      yield* charA.onAfterStrike(this, A, D, { opponentStunned: stunnedPlayerId === D.id });
    }
    if (charD && charD.onAfterStrike) {
      yield* charD.onAfterStrike(this, D, A, { opponentStunned: stunnedPlayerId === A.id });
    }
    resetStrikeState(A);
    resetStrikeState(D);
    // "Revert during cleanup" (Happy Chaos's Exceed, Nagoriyuki's Zansetsu): the effect
    // sets `revertPending` when it happens; the Revert itself lands here, once the Strike
    // is fully resolved, so nothing mid-Strike sees the Exceed state change under it.
    if (A.revertPending) this.doRevert(A);
    if (D.revertPending) this.doRevert(D);
    // One Vision's burst action ("take 3 actions"): per its own Notes column —
    // "Striking will still end your turn, regardless of how many actions you
    // have remaining" — any leftover extraActionsRemaining is forfeited the
    // instant a Strike happens, whether or not this Strike is what USED the
    // burst action in the first place. Reset unconditionally here rather than
    // only when it was actually nonzero, so a stale count can never survive
    // into a later, unrelated turn.
    A.extraActionsRemaining = 0;
    D.extraActionsRemaining = 0;

    if (koWinnerId || D.life <= 0 || A.life <= 0) {
      this.gameOver = true;
      this.winner = koWinnerId || ((A.life <= 0) ? D.id : A.id);
    }

    this.logMsg(`HP \u2014 ${this.players.p1.name}: ${this.players.p1.life}/${this.players.p1.maxLife}  |  ${this.players.p2.name}: ${this.players.p2.life}/${this.players.p2.maxLife}`);

    // Biggest single hit dealt this strike (either side) — used by the UI to trigger a
    // screenshake on big hits. Not "total damage this exchange" — a single card's hit.
    const dealtValues = [firstCtx, secondCtx].filter(c => c && c.hitLanded).map(c => c._dealt || 0);
    const maxSingleHitDamage = dealtValues.length ? Math.max(...dealtValues) : 0;

    this._resolvingCards = null;
    const viaAdvantage = this._advantageOrder.length > 0;
    const result = {
      roundNum,
      nextActive: viaAdvantage ? this._advantageOrder[this._advantageOrder.length - 1] : this.other(initiator),
      p1Life: this.players.p1.life, p2Life: this.players.p2.life,
      maxSingleHitDamage,
    };
    // Turn order is the one consequence of a Strike that isn't visible anywhere on
    // screen: normally the non-initiator acts next, but Advantage overrides that, and
    // a player who doesn't know the rule just sees the CPU take two turns in a row.
    recordStrikeEvent({ type: 'next', playerId: result.nextActive, viaAdvantage });
    this.players.p1.advantage = false;
    this.players.p2.advantage = false;
    return result;
  }

  // convenience: run a strike generator to completion with an auto-resolver for both
  // sides (used by headless tests / AI-vs-AI). UI code drives the generator itself.
  runStrikeAuto(args, autoResolver) {
    const gen = this.resolveStrikeSteps(args);
    let res = gen.next();
    while (!res.done) { res = gen.next(autoResolver(res.value)); }
    return res.value;
  }

  // Moving one character toward another via a card effect must never let them land on
  // the same square — reuse the same jump-over logic as advanceSelf (free movement,
  // no pass-through cost, matching the rulebook's "movement from effects" clarification).
  pushToward(target, source, amount) {
    const immune = this.isPushPullImmune(target);
    if (immune) { this.logMsg(immune); return; }
    this.advanceSelf(target, source, amount, true, true);
  }

  // Winter Mantis's "Pull 8 without pulling past yourself" — every OTHER Pull in
  // this codebase (pushToward above, used by Grasp/Cannonball/CQC/Gyro Drive
  // Smasher/GG Grasp/GG Cross) allows the pulled target to cross past the puller
  // (side-swap), matching ordinary Pull rules. This card's text explicitly opts
  // OUT of that — the target stops adjacent instead, mirroring closeSelf's
  // stop-at-range-1 semantics but for a THIRD PARTY being pulled rather than the
  // mover moving themselves.
  pullTowardWithoutPassing(target, source, amount) {
    const immune = this.isPushPullImmune(target);
    if (immune) { this.logMsg(immune); return; }
    this.advanceSelf(target, source, amount, false, true);
  }

  setReading(player, normalCardKey) {
    this._reading = { boosterId: player.id, cardKey: normalCardKey };
  }
  consumeReading() { const r = this._reading; this._reading = null; return r; }

  // Records an exact, timestamped snapshot of a player's current hand — called
  // from the three "reveal your hand" resolution points (Focus's Reading, Block's
  // naming, Flying Power Bomb's Name-a-Range) whenever a name/range check comes up
  // with ZERO matches, which is the one case the rules actually force a full hand
  // reveal. ai.js's sampleOpponentHand() uses this to skip statistical sampling
  // entirely and use the real hand, for as long as nothing about the player's
  // public state has changed since (see that function's comment for why
  // "public counts unchanged" is treated as "the reveal is still valid" instead of
  // hooking every single hand-mutating call site directly to invalidate it).
  recordHandReveal(player) {
    player.revealedHand = {
      keys: player.hand.map(c => c.key),
      handCount: player.hand.length,
      deckCount: player.deck.length,
      discardCount: player.discard.length,
      gaugeCount: player.gauge.length,
      boostsCount: player.boostsInPlay.length,
      overdriveCount: (player.overdrive || []).length,
      sealedCount: (player.sealedCards || []).length,
    };
  }

  astralStateOf(player) {
    const char = CHARACTERS[player.characterKey];
    const astralDef = char && char.specials ? char.specials.find(c => c.isAstral) : null;
    if (!astralDef) return 'none';
    if (player._astralPending) return 'pending';
    if (player.astralCard) return 'out_of_play';
    const key = astralDef.key;
    if (
      player.discard.some(c => c.key === key) ||
      player.gauge.some(c => c.key === key) ||
      player.boostsInPlay.some(b => b.card && b.card.key === key) ||
      (player.overdrive || []).some(c => c.key === key) ||
      (player.sealedCards || []).some(c => c.key === key)
    ) {
      return 'public';
    }
    return 'in_hand';
  }

  /**
   * Canonical Information Set for a player: public board/zone state for both players
   * plus the acting player's own private hand and known deck order, excluding all
   * hidden opponent cards.
   */
  getInformationSet(playerId) {
    const me = this.P(playerId);
    const opp = this.P(this.other(playerId));
    const mapZoneKeys = (arr) => (arr || []).map(c => (typeof c === 'string' ? c : c.key));
    const mapPublic = (p, isActor) => {
      const base = {
        id: p.id,
        characterKey: p.characterKey,
        life: p.life,
        maxLife: p.maxLife,
        pos: p.pos,
        handCount: p.hand.length,
        deckCount: p.deck.length,
        gaugeKeys: mapZoneKeys(p.gauge),
        discardKeys: mapZoneKeys(p.discard),
        boostKeys: (p.boostsInPlay || []).map(b => (typeof b === 'string' ? b : b.card.key)),
        overdriveKeys: mapZoneKeys(p.overdrive),
        sealedKeys: mapZoneKeys(p.sealedCards),
        exceeded: !!p.exceeded,
        reshuffleUsed: !!p.reshuffleUsed,
        advantage: !!p.advantage,
        astralState: this.astralStateOf(p),
        eddiePos: p.eddiePos != null ? p.eddiePos : null,
        activeBoostMods: this.activeBoostMods(p),
      };
      if (isActor) {
        base.handKeys = mapZoneKeys(p.hand);
        base.knownDeckTop = Array.isArray(p.knownDeckTop) ? p.knownDeckTop.slice() : [];
        base.knownDeckBottom = Array.isArray(p.knownDeckBottom) ? p.knownDeckBottom.slice() : [];
      } else {
        base.revealedHand = p.revealedHand ? { ...p.revealedHand, keys: p.revealedHand.keys.slice() } : null;
        base.observations = p.aiObs ? p.aiObs.slice() : null;
      }
      return base;
    };
    return {
      turnNumber: this.turn || 0,
      activePlayer: this.active === playerId ? 'actor' : 'opponent',
      actor: mapPublic(me, true),
      opponent: mapPublic(opp, false),
      canExceed: this.canExceed(me),
    };
  }

  buildExCard(cardA, cardB) {
    return {
      ...cardA,
      uid: cardA.uid + '+' + cardB.uid,
      isEX: true,
      pow: cardA.pow + 1, spd: cardA.spd + 1, arm: cardA.arm + 1, grd: cardA.grd + 1,
    };
  }

  grantAdvantage(player, why) {
    player.advantage = true;
    if (this._advantageOrder) this._advantageOrder.push(player.id);
    this.logMsg(`${player.name} gains Advantage!${why ? ' (' + why + ')' : ''}`, 'advantage', player.id);
  }

  clearAdvantage() { this.players.p1.advantage = false; this.players.p2.advantage = false; }
}



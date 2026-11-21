// ===== ai.js =====
// ============================================================
// AI — heuristic action policy + Monte Carlo strike selection
// ============================================================
// IMPORTANT (fairness / "no cheating"): every function in this file that
// reasons about the OPPONENT only receives a `PublicInfo` snapshot built by
// publicInfoOf() below. That snapshot never includes opponent.hand contents,
// only its length. The AI reconstructs a plausible opponent hand by
// sampling uniformly from cards that are still "unseen" to it (i.e. not in
// the opponent's own discard/gauge/boosts-in-play, which ARE public per the
// rulebook). This mirrors what a competent human opponent could infer.


function publicInfoOf(player) {
  const astralDef = CHARACTERS[player.characterKey] && CHARACTERS[player.characterKey].specials
    ? CHARACTERS[player.characterKey].specials.find(c => c.isAstral) : null;
  let astralState = 'none';
  if (astralDef) {
    if (player._astralPending) astralState = 'pending';
    else if (player.astralCard) astralState = 'out_of_play';
    else {
      const ak = astralDef.key;
      const inPub = player.discard.some(c => c.key === ak) || player.gauge.some(c => c.key === ak) ||
        player.boostsInPlay.some(b => b.card && b.card.key === ak) ||
        (player.overdrive || []).some(c => c.key === ak) || (player.sealedCards || []).some(c => c.key === ak);
      astralState = inPub ? 'public' : 'in_hand';
    }
  }
  return {
    id: player.id,
    characterKey: player.characterKey,
    handCount: player.hand.length,
    deckCount: player.deck.length,
    discard: player.discard.map(c => c.key),
    gauge: player.gauge.map(c => c.key),
    boostsInPlay: player.boostsInPlay.map(b => b.card.key),
    overdrive: (player.overdrive || []).map(c => c.key),
    sealedCards: (player.sealedCards || []).map(c => c.key),
    astralCard: player.astralCard ? player.astralCard.key : null,
    _astralPending: !!player._astralPending,
    astralState,
    life: player.life,
    maxLife: player.maxLife,
    pos: player.pos,
    // Eddie (Zato-1) stands on the board in front of everyone — as public as either
    // fighter's own position, and the number that decides whether his Specials reach.
    eddiePos: player.eddiePos != null ? player.eddiePos : null,
    exceeded: player.exceeded,
    reshuffleUsed: player.reshuffleUsed,
    advantage: player.advantage,
    // Legitimately public once set: a genuine 0-match Reading/Block/Name-a-Range
    // check forces a REAL hand reveal by the rules themselves — see
    // engine.recordHandReveal and this same field's use in sampleOpponentHand below.
    revealedHand: player.revealedHand || null,
    // The publicly visible actions this player has chosen recently (engine.
    // recordObservation). Nothing hidden: it is what anyone at the table would have
    // watched them do. Consumed by handLikelihood below.
    observations: player.aiObs ? player.aiObs.slice() : null,
  };
}

// How consistent is a candidate hand with what this player has actually been DOING?
//
// The hand sampler draws uniformly from everything not visibly out of the opponent's
// deck, which is a correct prior and a poor belief: it never updated on anything the
// opponent did. Someone who chose to start an exchange from Range 4 is holding
// something that works at Range 4; someone who walked to Range 4 wanted to be there;
// someone who spent their turn on a Boost was, more often than not, holding a hand that
// couldn't start one from where they stood. None of that is hidden information — it is
// the ordinary read every human player makes automatically.
//
// Returns a multiplicative weight (never zero, so no hand is ever ruled out entirely by
// a heuristic — this is a lean, not a deduction).
function handLikelihood(hand, observations, boostMods) {
  if (!observations || !observations.length || !hand.length) return 1;
  let w = 1;
  // Recent actions say more about the current hand than older ones.
  const n = observations.length;
  for (let i = 0; i < n; i++) {
    const obs = observations[i];
    if (obs.dist == null) continue;
    const recency = 0.5 + 0.5 * ((i + 1) / n);
    const frac = hand.filter(c => isEffectivelyInRange(c, obs.dist, boostMods)).length / hand.length;
    if (obs.type === 'strike' || obs.type === 'move') {
      // They committed to this distance: hands that work there are likelier.
      w *= 1 + recency * (frac - 0.35);
    } else if (obs.type === 'boost') {
      // They spent the turn setting up instead: mild evidence the hand was not ready.
      w *= 1 + recency * 0.5 * (0.35 - frac);
    }
  }
  return Math.max(0.05, w);
}

// ---------------- Difficulty tiers ----------------
// `randomness` is the fraction of individual AI decisions (non-strike action, strike
// card selection, defense card selection, boost naming, and Grasp/Block/Hadoken
// strike-resolution choices) that get replaced with a uniform-random legal choice
// instead of the evaluated/heuristic one. Champion never does this (randomness: 0) —
// it's the fully "fixed" AI described in HANDOFF.md. Warrior and Student are Champion
// plus an extra 20%/40% chance per decision of just picking something at random.
const AI_DIFFICULTIES = {
  champion: { key: 'champion', label: 'Champion', randomness: 0 },
  warrior: { key: 'warrior', label: 'Warrior', randomness: 0.20 },
  student: { key: 'student', label: 'Student', randomness: 0.40 },
};

// Build the set of card "keys seen" for an opponent (things no longer possibly in hand OR deck as unknown)
// Deck composition is static per character (it never changes over a game) —
// `buildDeck()` deep-clones every card object and assigns a fresh uid on every
// call, which is correct for actually dealing a real deck but wasteful when this
// file only ever wants the STATIC set of card keys/definitions a character's deck
// contains (this Monte Carlo sampling runs `unseenPoolForOpponent`/`cardByKey` many
// times per turn). Cached here since it's pure, static data derived from
// NORMALS/CHARACTERS — never mutated, so memoizing is safe.
const _allCardDefsCache = allCardDefs();
const _cardByKeyMap = new Map(_allCardDefsCache.map(c => [c.key, c]));
const _deckKeysCache = new Map();
function deckKeysForCharacter(characterKey) {
  let keys = _deckKeysCache.get(characterKey);
  if (keys) return keys;
  keys = [];
  const char = CHARACTERS[characterKey];
  // Mirror engine.js's buildDeck(characterKey) exactly:
  // - Use character's own Normals pool (NORMALS or GG_NORMALS), 2 copies each.
  // - Skip Season 5 Astral Heat cards (they start out of play, not in deck).
  // - Honor per-card `copies` (0 for Happy Chaos's Deus Ex Machina, 3 for
  //   Goldlewis/Happy Chaos cards, 4 for Axl's Sickle Flash; default 2).
  const normalsPool = (char && char.normals) || NORMALS;
  for (const c of normalsPool) {
    keys.push(c.key, c.key);
  }
  for (const c of (char ? char.specials : [])) {
    if (c.isAstral) continue;
    const n = c.copies == null ? 2 : c.copies;
    for (let i = 0; i < n; i++) keys.push(c.key);
  }
  _deckKeysCache.set(characterKey, keys);
  return keys;
}

function unseenPoolForOpponent(oppPublic) {
  const fullDeckKeys = deckKeysForCharacter(oppPublic.characterKey);
  const counts = new Map();
  const addRemoved = (arr) => {
    if (!arr) return;
    for (let i = 0; i < arr.length; i++) {
      const k = arr[i];
      counts.set(k, (counts.get(k) || 0) + 1);
    }
  };
  addRemoved(oppPublic.discard);
  addRemoved(oppPublic.gauge);
  addRemoved(oppPublic.boostsInPlay);
  addRemoved(oppPublic.overdrive);
  addRemoved(oppPublic.sealedCards);
  if (counts.size === 0) return fullDeckKeys.slice();
  const pool = [];
  for (let i = 0; i < fullDeckKeys.length; i++) {
    const k = fullDeckKeys[i];
    const rem = counts.get(k) || 0;
    if (rem > 0) counts.set(k, rem - 1);
    else pool.push(k);
  }
  return pool; // this represents "hand + deck" combined unknown composition
}

function cardByKey(characterKey, key) {
  // Card definitions are globally unique by key regardless of which character's
  // deck they conceptually belong to (Normals are shared, Specials are
  // character-exclusive) — `characterKey` is kept in the signature for clarity at
  // call sites but isn't actually needed to disambiguate the lookup.
  return _cardByKeyMap.get(key);
}

function sampleOpponentHand(oppPublic, rng, precomputedPool = null) {
  const rev = oppPublic.revealedHand;
  const odLen = (oppPublic.overdrive || []).length;
  const sealedLen = (oppPublic.sealedCards || []).length;
  if (rev && rev.handCount === oppPublic.handCount && rev.deckCount === oppPublic.deckCount &&
      rev.discardCount === oppPublic.discard.length && rev.gaugeCount === oppPublic.gauge.length &&
      rev.boostsCount === oppPublic.boostsInPlay.length &&
      (rev.overdriveCount == null || rev.overdriveCount === odLen) &&
      (rev.sealedCount == null || rev.sealedCount === sealedLen)) {
    return rev.keys.map(k => cardByKey(oppPublic.characterKey, k));
  }
  const pool = precomputedPool ? precomputedPool.slice() : unseenPoolForOpponent(oppPublic);
  const k = Math.min(oppPublic.handCount, pool.length);
  const out = new Array(k);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rng() * (pool.length - i));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
    out[i] = cardByKey(oppPublic.characterKey, pool[i]);
  }
  return out;
}

// Sum the continuous-boost stat bonuses represented by a list of boost card keys
// (this is legitimate to compute for the OPPONENT too — boostsInPlay is public info,
// and each key's boost text is static card data, not hidden information).
function boostModsFromKeys(keys) {
  const mods = {
    pow: 0, spd: 0, arm: 0, grd: 0, ignoreArmor: false, rangeImmuneRanges: [], stunImmune: false,
    grantsNormalsBeforeAdvance: 0, grantsBeforeCloseWithBonus: 0, opponentPowMod: 0,
    // Does this player have at least one Continuous Boost currently in play?
    // boostsInPlay only ever holds continuous boosts (non-continuous ones resolve
    // and discard immediately), so a non-empty key list is exactly this condition —
    // feeds C. Viper's `noHitWithoutContinuousBoost`/`powBonusIfOwnContinuousBoost`
    // (Burst Time / Emergency Combination) in evalMatchup below.
    hasOwnContinuousBoost: !!(keys && keys.length > 0),
  };
  for (const key of (keys || [])) {
    const c = _cardByKeyMap.get(key);
    if (!c || !c.boost) continue;
    const sm = c.boost.statMods || {};
    mods.pow += sm.pow || 0; mods.spd += sm.spd || 0; mods.arm += sm.arm || 0; mods.grd += sm.grd || 0;
    if (c.boost.ignoreArmorGrant) mods.ignoreArmor = true;
    // Cammy's CQC boost ("Attacks at range 1 don't hit you") — a continuous boost
    // can grant the same range-immunity a base card can print; public info (the
    // boost key is visible), so legitimate to use the same way ignoreArmorGrant is.
    if (c.boost.rangeImmuneRanges) mods.rangeImmuneRanges = mods.rangeImmuneRanges.concat(c.boost.rangeImmuneRanges);
    // Zangief's Ultimate Atomic Buster boost ("Stun Immunity").
    if (c.boost.stunImmuneGrant) mods.stunImmune = true;
    // Cammy's Dive Kick boost: "Your Normals have 'Before: Advance 3.'"
    if (c.boost.grantsNormalsBeforeAdvance) mods.grantsNormalsBeforeAdvance = Math.max(mods.grantsNormalsBeforeAdvance, c.boost.grantsNormalsBeforeAdvance);
    // Sol Badguy's Tyrant Rave boost: "[+] Before: Close 1; if you Closed fewer than 1 space, +2POW"
    if (c.boost.grantsBeforeCloseWithBonus) mods.grantsBeforeCloseWithBonus = Math.max(mods.grantsBeforeCloseWithBonus, c.boost.grantsBeforeCloseWithBonus.amount || 0);
    // C. Viper's Burning Dance boost: "[+] Opponent has +3 POW" — mirrors
    // engine.js's liveStats `oppPowDebuff` aggregation (see its comment there for
    // why this is the one cross-player continuous-boost field in the codebase).
    if (c.boost.opponentPowMod) mods.opponentPowMod += c.boost.opponentPowMod;
  }
  return mods;
}

// How far a card's own "Before: Advance N" self-movement can carry its owner, used
// to approximate Cammy's Innate ("If you move past the opponent during a Strike,
// your attack's range includes them"). Delegates to parseBeforeMoverAmount for a
// single source of truth.
function moverAdvanceAmount(card) {
  if (!card || !card.text) return 0;
  // Only care about Advance (not Close) for crossing logic, so filter to that subset.
  if (!card.text.includes('Before: Advance')) return 0;
  return parseBeforeMoverAmount(card.text);
}

// Cammy-only: does setting this card at this distance let her move past the
// opponent (a genuine side-swap), triggering her Innate's guaranteed range
// inclusion? Approximated as "the Before-Advance amount strictly exceeds the
// current distance" — crossing, not just closing to adjacent.
function cammyCrossesOpponent(card, dist) {
  if (!card || card.owner !== 'cammy') return false;
  return moverAdvanceAmount(card) > dist;
}

// ---------------- Critical payment modeling (shared by evalMatchup AND the
// actual pay/don't-pay decision in chooseCriticalPayment, so the strike
// evaluator and the real decision never disagree about the same card) ----------------
// A Critical is "real" (worth paying 1 Gauge for almost always) if the card has its
// own printed `critical` clause, OR — this is the part a naive `!!card.critical`
// check misses — if the SETTING character has a passive that grants Critical text
// onto whatever card they set (Zangief's Innate/Exceeded: "If the opponent is at
// range 1 when you set your attack, it gains Critical: +Power, +Speed", range-1
// gated; Akuma's Innate/Exceeded: "Your attacks have Critical: Both players have
// +2/+3 POW", unconditional on range — every attack he sets carries it), which
// can be live even on a card with no `critical` field of its own (Zangief's
// Ultimate Atomic Buster/Spinning Piledriver/Siberian Blizzard; all 4 of Akuma's
// no-`critical`-field cards — goshoryuken, tatsumaki_zankukyaku,
// demon_armageddon, wrath_of_the_raging_demon).
// Missing this case would make chooseCriticalPayment treat a genuinely valuable
// Critical as a pure bluff for those cards specifically.
function hasRealCriticalValue(card, ownerCharacterKey, dist, fromWildSwing) {
  if (card && card.critical) return true;
  const char = CHARACTERS[ownerCharacterKey];
  if (char && char.extraCriticalStatsIfOpponentAtRange1 && dist === 1) return true;
  if (char && char.wildSwingCriticalStatMods && fromWildSwing) return true;
  return !!(char && char.grantsMutualCriticalPow);
}

// Same 0.85 / 0.08 constants chooseCriticalPayment already used — named here so
// evalMatchup's expected-value blending and the actual pay decision can't drift
// apart if one gets tuned later without the other.
const CRITICAL_PAY_PROB_REAL = 0.85;
const CRITICAL_PAY_PROB_BLUFF = 0.08;
// Akuma-specific nudge: his mutual Critical grant is unique among every source
// of "real Critical value" in this file (Zangief's range-1 grant, every card's
// own printed `critical` text) in that it ALSO buffs the OPPONENT's live POW by
// the same amount, not just the payer's — the flat 85% "always pay a real
// Critical" heuristic has no notion of that. Paying is still usually correct
// (his own +2/+3 POW is real value, and any card that ALSO has its own printed
// Critical text — gohadoken/hyakkishu/zugaihasatsu — already justifies paying
// on that text alone), so this is a modest discount, not a reversal: only
// applied when the mutual grant is the SOLE source of real value on the card
// (his 4 cards with no `critical` field of their own — goshoryuken,
// tatsumaki_zankukyaku, demon_armageddon, wrath_of_the_raging_demon). This is
// deliberately not a full game-theoretic model of "does paying help me more
// than it helps them this exchange" (would need live hit/speed-order
// information chooseCriticalPayment doesn't have at this call site) — see
// HANDOFF.md's pre-existing "evalMatchup doesn't model Criticals" gap for why
// a deeper fix is out of scope here.
const CRITICAL_PAY_PROB_AKUMA_MUTUAL_ONLY = 0.70;
function criticalPayProbability(card, ownerCharacterKey, dist, fromWildSwing, gaugeCount) {
  // Only Street Fighter characters (Season 3) can pay 1 Gauge for Critical —
  // matches engine.canPayCritical() so non-SF fighters never accrue phantom bluff
  // costs in evalMatchupDetail.
  const char = CHARACTERS[ownerCharacterKey];
  if (!char || !char.isStreetFighter) return 0;
  // A Critical costs 1 Gauge. Someone with none cannot pay one, and the evaluator used
  // to model every opponent as if they always could — which quietly inflated the
  // apparent strength of every card in a Gauge-starved opponent's sampled hand. Passing
  // a known Gauge count (own side always, opponent side from the fully-public
  // publicInfoOf().gauge) collapses that to zero; omitting it keeps the old behaviour.
  if (gaugeCount != null && gaugeCount <= 0) return 0;
  if (!hasRealCriticalValue(card, ownerCharacterKey, dist, fromWildSwing)) return CRITICAL_PAY_PROB_BLUFF;
  if ((!card || !card.critical) && char.grantsMutualCriticalPow) {
    return CRITICAL_PAY_PROB_AKUMA_MUTUAL_ONLY;
  }
  return CRITICAL_PAY_PROB_REAL;
}

// ---------------- Resource pricing ----------------
// Gauge is the only real currency in this game: it pays for Ultras, for Criticals, and
// for Exceed — and Exceed is half of every character's kit. Before this constant
// existed, NOTHING in this file ever subtracted the cost of spending it: `gaugeCost`
// was read once, as an affordability filter in buildStrikeCandidates, and a 4-Gauge
// Ultra scored exactly the same as a free Normal that dealt the same damage. Measured
// consequence over 100 AI-vs-AI games: 1.73 Gauge held on average, and Exceed taken at
// only 84 of the 528 decisions where it was legal (0.84 Exceeds per GAME across both
// sides). This is the exchange rate between one Gauge card and one point of net damage,
// in the same units evalMatchup returns.
const GAUGE_POINT_VALUE = 0.45;
// Extra penalty per Gauge when spending would drop the player below their Exceed
// threshold — the difference between "this Gauge is a resource" and "this Gauge is the
// game plan". Applied by chooseStrikeSelection, which knows the live count.
const GAUGE_SCARCITY_MULTIPLIER = 1.8;
// An EX Strike pairs two copies of a card for +1/+1/+1/+1 and DISCARDS the second one.
// buildStrikeCandidates used to hand the synthetic card to the evaluator with no cost
// attached at all, so EX was pure upside and got used ~2x per game per side. This is
// the baseline value of the copy that goes away; chooseStrikeSelection scales it up as
// the hand gets thin, because the last spare card costs far more than the fifth.
const EX_DISCARD_COST = 0.55;

// Everything a PAID Critical could add to this card: its own printed `critical`
// clause's stat mods / ignoreArmor / ignoreGuard / rangeImmuneRanges / stunImmune,
// plus the character-passive grant described above (which can stack onto a card
// that also has its own `critical` text — Zangief's Innate never replaces a card's
// own Critical, only adds to it). Mirrors engine.js's `liveStats`/
// `computeRangeImmunity` critical-paid branches, kept in sync deliberately (see
// their comments) — this is the static, no-live-Gauge-count version used for
// evaluation instead of actual resolution.
// NOT modeled: `critical.before`/`.hit`/`.after` side-effect hooks (e.g. Double
// Lariat's "Critical, After: Move 2", Atomic Suplex's "Critical, After: Close 3")
// — those are positional, not stat/damage effects, same class of gap the base
// hasMover() approximation below already accepts for ordinary Before-movement.
function criticalGrant(card, ownerCharacterKey, dist, exceeded) {
  const grant = { pow: 0, spd: 0, arm: 0, grd: 0, ignoreArmor: false, ignoreGuard: false, rangeImmuneRanges: [], stunImmune: false };
  if (card && card.critical) {
    const sm = card.critical.statMods || {};
    grant.pow += sm.pow || 0; grant.spd += sm.spd || 0; grant.arm += sm.arm || 0; grant.grd += sm.grd || 0;
    if (card.critical.ignoreArmor) grant.ignoreArmor = true;
    if (card.critical.ignoreGuard) grant.ignoreGuard = true;
    if (card.critical.rangeImmuneRanges) grant.rangeImmuneRanges = grant.rangeImmuneRanges.concat(card.critical.rangeImmuneRanges);
    if (card.critical.stunImmune) grant.stunImmune = true;
  }
  const char = CHARACTERS[ownerCharacterKey];
  if (char && char.extraCriticalStatsIfOpponentAtRange1 && dist === 1) {
    const bonus = char.extraCriticalStatsIfOpponentAtRange1({ exceeded: !!exceeded }) || {};
    grant.pow += bonus.pow || 0; grant.spd += bonus.spd || 0;
  }
  // Akuma's Innate/Exceeded mutual Critical grant: credits at least the
  // OWNER's own +2/+3 POW here (same "my own card gets stronger" shape every
  // other branch in this function already models). The opponent-side half of
  // the grant is a genuinely different, cross-player effect that this
  // single-card evaluation helper isn't shaped to express — same pre-existing,
  // documented limitation as "evalMatchup() doesn't model Criticals" fully
  // (see HANDOFF.md §6); not modeling it here doesn't make the AI overvalue
  // anything, only undervalue the opponent's matching gain, which is the
  // safe direction to be wrong in for a card-selection heuristic.
  if (char && char.grantsMutualCriticalPow) {
    const bonus = char.grantsMutualCriticalPow({ exceeded: !!exceeded }) || {};
    grant.pow += bonus.pow || 0;
  }
  return grant;
}

// Quick static evaluation of "how good is cardA (mine) vs cardB (theirs)" from my perspective,
// used inside Monte Carlo sampling. Doesn't run the full engine (too slow at scale) — approximates
// the same priority/range/damage math the engine uses. myBoostMods/oppBoostMods are the sum of
// each side's currently-active continuous boosts (see boostModsFromKeys) — critical so the AI
// correctly rates a strike into (or out of) an opponent who's sitting on a live power/speed boost.
// myExceeded/oppExceeded (both public/self-known — Exceeded status is visible on the life panel)
// feed Cammy's Exceeded bonus and Zangief's Exceeded Critical grant; default false is safe for any
// call site that hasn't been updated to pass them. myCharacterKey/oppCharacterKey identify who's
// actually WIELDING each card — not always the same as card.owner, since Normals are shared across
// characters and a character passive (Zangief's Innate) can apply to a Normal he sets too — default
// null is safe (just skips character-passive Critical grants, never over-values).
// Critical payment itself is never modeled as a hard yes/no here (evalMatchup has no live Gauge
// count to check against, same limitation `chooseCriticalPayment` has) — instead every Critical
// effect is blended in as an expected value, weighted by `criticalPayProbability` (the same ~85%
// real / ~8% bluff acceptance rates the actual AI decision uses), so a card with a strong printed
// Critical is correctly rated as stronger than its base stats alone even before anyone's actually
// decided to pay for it.
// evalMatchup returns just the scalar (every existing call site wants exactly that).
// evalMatchupDetail below returns the full record it is derived from.
//
// The scalar is a NET number: my damage minus their damage, plus a flat tempo bonus for
// connecting, plus a few riders. That is fine for ranking cards against each other, and
// it is badly wrong as a substitute for the underlying damage figures — the three-turn
// planner used to derive BOTH players' life totals from this one number
// (`oppLife -= max(0, ev)`, `myLife -= max(0, -ev)`), which books a 6-for-5 trade as
// "opponent loses 1, I lose 0" and makes every mutual exchange look like a clean win.
// Races — the decisive phase of expert play — were invisible. Callers that care about
// life must use evalMatchupDetail and read myDmg/oppDmg separately.
function evalMatchup(opts) {
  return evalMatchupDetail(opts).value;
}

// `eddiePositions` (optional, `{ mine, theirs }` board spaces or null) exists for the
// one character whose attacks are not measured from where he is standing: Zato-1's
// Specials/Ultras measure from Eddie (see engine.attackSourcePos). Omitting it — which
// every caller that isn't evaluating a live board does — reproduces the old behaviour
// exactly, since it only ever changes the two reachability checks below.
function evalMatchupDetail({
  myCard, myPos, myBoostMods,
  oppCard, oppPos, oppBoostMods,
  iInitiated,
  myExceeded, oppExceeded,
  myCharacterKey, oppCharacterKey,
  myGaugeCount = 0, oppGaugeCount = 0,
  eddiePositions = null,
}) {
  const mb = myBoostMods || { pow: 0, spd: 0, arm: 0, grd: 0, ignoreArmor: false, rangeImmuneRanges: [], stunImmune: false, opponentPowMod: 0, hasOwnContinuousBoost: false };
  const ob = oppBoostMods || { pow: 0, spd: 0, arm: 0, grd: 0, ignoreArmor: false, rangeImmuneRanges: [], stunImmune: false, opponentPowMod: 0, hasOwnContinuousBoost: false };
  const dist = Math.abs(myPos - oppPos);
  // Vega's Innate/Exceed: "If you are at the edge of the arena when you set your
  // attack, your Specials and Ultras have +2 POW" (Exceeded: +3 POW/+1 SPD).
  // Mirrors extraCriticalStatsIfOpponentAtRange1's pattern (character-level
  // extension field, read via CHARACTERS[key], no-op default when absent) but
  // gated on the ACTING side's own board position instead of the opponent's
  // range. `myPos`/`oppPos` here are the plain pre-strike position numbers
  // evalMatchup already receives — engine.isAtEdge(player) isn't callable from
  // here (no engine instance), so this is a local JS-side equivalent using the
  // shared BOARD_SIZE constant. Only Specials/Ultras (card.type !== 'normal')
  // qualify, matching the printed text; Normals never get this bonus.
  const isAtEdgePos = (pos) => pos === 0 || pos === BOARD_SIZE - 1;
  const vegaEdgeGrant = (card, characterKey, pos, exceeded) => {
    if (!card || card.type === 'normal') return { pow: 0, spd: 0 };
    const char = CHARACTERS[characterKey];
    if (char && char.specialsUltrasStatModsIfAtEdge && isAtEdgePos(pos)) {
      return char.specialsUltrasStatModsIfAtEdge({ exceeded: !!exceeded }) || {};
    }
    return { pow: 0, spd: 0 };
  };
  const myEdge = vegaEdgeGrant(myCard, myCharacterKey, myPos, myExceeded);
  const oppEdge = vegaEdgeGrant(oppCard, oppCharacterKey, oppPos, oppExceeded);
  const mySpd = myCard.spd + mb.spd + (myEdge.spd || 0) + (myCard.hooks?.spdBonusIfDefending && !iInitiated ? myCard.hooks.spdBonusIfDefending : 0)
    + (myCard.hooks?.spdBonusIfInitiating && iInitiated ? myCard.hooks.spdBonusIfInitiating : 0);
  const oppSpd = oppCard.spd + ob.spd + (oppEdge.spd || 0) + (oppCard.hooks?.spdBonusIfDefending && iInitiated ? oppCard.hooks.spdBonusIfDefending : 0)
    + (oppCard.hooks?.spdBonusIfInitiating && !iInitiated ? oppCard.hooks.spdBonusIfInitiating : 0);
  // powBonusIfOwnContinuousBoost (C. Viper's Emergency Combination: "Before: If you
  // have a Continuous Boost in play, +2 POW") is unconditional on who initiated —
  // it only cares whether the setting player currently has a live continuous boost,
  // gated on the same hasOwnContinuousBoost flag boostModsFromKeys/activeBoostMods
  // now compute. opponentPowMod (Burning Dance's "[+] Opponent has +3 POW") is the
  // one cross-player continuous-boost field in the codebase (see engine.js liveStats'
  // oppPowDebuff comment) — MY boost mods affect the OPPONENT's pow and vice versa.
  const myPow = myCard.pow + mb.pow + (myEdge.pow || 0) + (myCard.hooks?.powBonusIfInitiating && iInitiated ? myCard.hooks.powBonusIfInitiating : 0)
    + (myCard.hooks?.powBonusIfOwnContinuousBoost && mb.hasOwnContinuousBoost ? myCard.hooks.powBonusIfOwnContinuousBoost : 0)
    + (ob.opponentPowMod || 0);
  const oppPow = oppCard.pow + ob.pow + (oppEdge.pow || 0) + (oppCard.hooks?.powBonusIfInitiating && !iInitiated ? oppCard.hooks.powBonusIfInitiating : 0)
    + (oppCard.hooks?.powBonusIfOwnContinuousBoost && ob.hasOwnContinuousBoost ? oppCard.hooks.powBonusIfOwnContinuousBoost : 0)
    + (mb.opponentPowMod || 0);
  const myArm = myCard.arm + mb.arm, oppArm = oppCard.arm + ob.arm;
  const myGrd = myCard.grd + mb.grd, oppGrd = oppCard.grd + ob.grd;
  const myIgnoreArmor = !!myCard.ignoreArmor || mb.ignoreArmor;
  const oppIgnoreArmor = !!oppCard.ignoreArmor || ob.ignoreArmor;

  // Critical, evaluated at the ACTUAL pre-strike distance ("when you set your
  // attack"), not the post-movement effective distance computed below.
  const myCritProb = criticalPayProbability(myCard, myCharacterKey, dist, false, myGaugeCount);
  const oppCritProb = criticalPayProbability(oppCard, oppCharacterKey, dist, false, oppGaugeCount);
  const myCrit = criticalGrant(myCard, myCharacterKey, dist, myExceeded);
  const oppCrit = criticalGrant(oppCard, oppCharacterKey, dist, oppExceeded);
  // Stat mods (pow/spd/arm/grd) blend continuously by pay probability — a fine-
  // grained expected value, cheap to compute and averages out correctly across
  // the many Monte Carlo samples this function is called from.
  const myPowFull = myPow + myCrit.pow * myCritProb, mySpdFull = mySpd + myCrit.spd * myCritProb;
  const oppPowFull = oppPow + oppCrit.pow * oppCritProb, oppSpdFull = oppSpd + oppCrit.spd * oppCritProb;
  const myArmFull = myArm + myCrit.arm * myCritProb, oppArmFull = oppArm + oppCrit.arm * oppCritProb;
  const myGrdFull = myGrd + myCrit.grd * myCritProb, oppGrdFull = oppGrd + oppCrit.grd * oppCritProb;
  // Structural (non-numeric) Critical effects — ignoring guard/armor as a hard
  // gate, range immunity, Stun Immunity — don't blend continuously the same way,
  // so they're gated by "is this likely a real Critical" (probability > 0.5,
  // i.e. exactly the real/bluff split above) rather than a fractional weight.
  const myCritLikely = myCritProb > 0.5, oppCritLikely = oppCritProb > 0.5;

  // Range check accounting for Before: Advance/Close self-movement on each card.
  // Cards that move adjust the effective range they can reach: "Before: Close 2"
  // means you can set from 2 spaces farther than the printed range, etc.
  // Also includes boost-granted movement (e.g., Cammy's Dive Kick granting
  // "Before: Advance 3" to all Normals).
  // Reachability is now decided over the full set of distances each card's Before-step
  // can produce (see reachableDistsForCard) rather than a single "distance minus slack"
  // figure floored at zero. The old form could not express "this forced Advance carries
  // me PAST them and out of my own range", so it credited close-range movers with reach
  // they don't have.
  const iGoFirst = mySpdFull > oppSpdFull || (mySpdFull === oppSpdFull && iInitiated);

  // Range immunity: a card (or a continuous boost, or — new — a paid Critical) can
  // grant "attacks at range X don't hit you". boostsInPlay is public info either
  // way; the Critical branch uses the "likely paid" gate above.
  const oppRangeImmune = [...((oppCard.rangeImmuneRanges) || []), ...(ob.rangeImmuneRanges || []), ...(oppCritLikely ? oppCrit.rangeImmuneRanges : [])];
  const myRangeImmune = [...((myCard.rangeImmuneRanges) || []), ...(mb.rangeImmuneRanges || []), ...(myCritLikely ? myCrit.rangeImmuneRanges : [])];

  // The ONE place a side's attack is not measured from where that side is standing:
  // a Zato-1 Special/Ultra reaches from Eddie's space. Everything else in this
  // function — Criticals, edge bonuses, Cammy's crossing — still reads the real
  // fighter-to-fighter `dist`, because those clauses are about the fighters.
  const attackSourceDist = (card, characterKey, ownPos, eddiePos, targetPos) => {
    const char = CHARACTERS[characterKey];
    if (char && char.specialsRangeFromEddie && eddiePos != null && card && card.type !== 'normal') {
      return Math.abs(eddiePos - targetPos);
    }
    return Math.abs(ownPos - targetPos);
  };
  const myAttackDist = attackSourceDist(myCard, myCharacterKey, myPos, eddiePositions && eddiePositions.mine, oppPos);
  const oppAttackDist = attackSourceDist(oppCard, oppCharacterKey, oppPos, eddiePositions && eddiePositions.theirs, myPos);

  let myHits = cardReachesFrom(myCard, myAttackDist, mb,
    myCard.hooks?.rangeMaxBonusIfInitiating && iInitiated ? myCard.hooks.rangeMaxBonusIfInitiating : 0);
  let oppHits = cardReachesFrom(oppCard, oppAttackDist, ob,
    oppCard.hooks?.rangeMaxBonusIfInitiating && !iInitiated ? oppCard.hooks.rangeMaxBonusIfInitiating : 0);

  // Cammy's Innate: crossing the opponent during her own Before-Advance guarantees
  // her attack's range includes them, regardless of the card's printed range band.
  // Exceeded adds "Hit: +1 Power and Advantage" on top, but only when the swap
  // itself is what's granting the hit (matches the card text's own conditioning).
  let myPowBonus = 0, myAdvantageBonus = false, oppPowBonus = 0, oppAdvantageBonus = false;
  if (cammyCrossesOpponent(myCard, dist)) {
    if (!myHits && myExceeded) { myPowBonus += 1; myAdvantageBonus = true; }
    myHits = true;
  }
  if (cammyCrossesOpponent(oppCard, dist)) {
    if (!oppHits && oppExceeded) { oppPowBonus += 1; oppAdvantageBonus = true; }
    oppHits = true;
  }
  // Immunity still applies on top of a guaranteed hit — it's a separate defensive layer.
  if (oppRangeImmune.includes(dist)) myHits = false;
  if (myRangeImmune.includes(dist)) oppHits = false;
  // C. Viper's Burst Time: "If you do not have any Continuous Boosts in play, your
  // attack does not hit" — a guaranteed miss regardless of range, mirroring
  // engine.js's `burstTimeBlocked` gate exactly (attacker.boostsInPlay.length === 0).
  // Without this, evalMatchup could score a 4-Gauge Ultra as a normal ~10-POW hit
  // when it's actually unable to connect at all.
  if (myCard.noHitWithoutContinuousBoost && !mb.hasOwnContinuousBoost) myHits = false;
  if (oppCard.noHitWithoutContinuousBoost && !ob.hasOwnContinuousBoost) oppHits = false;

  const myPowTotal = myPowFull + myPowBonus, oppPowTotal = oppPowFull + oppPowBonus;
  // Armor-ignore and Guard-ignore, whether printed on the base card or granted by
  // a paid Critical, both reduce the defender's effective stat — the base-card
  // grant is a hard 0 (certain), the Critical grant is an expected-value
  // reduction weighted by pay probability, so a card that only sometimes bypasses
  // Armor (because paying Critical is only sometimes worth it) is rated between
  // "always bypasses" and "never bypasses" rather than snapping to one extreme.
  const effOppArmForMyHit = myIgnoreArmor ? 0 : oppArmFull * (1 - (myCrit.ignoreArmor ? myCritProb : 0));
  const effMyArmForOppHit = oppIgnoreArmor ? 0 : myArmFull * (1 - (oppCrit.ignoreArmor ? oppCritProb : 0));
  const effOppGrdForMyHit = myCard.ignoreGuard ? 0 : oppGrdFull * (1 - (myCrit.ignoreGuard ? myCritProb : 0));
  const effMyGrdForOppHit = oppCard.ignoreGuard ? 0 : myGrdFull * (1 - (oppCrit.ignoreGuard ? oppCritProb : 0));
  // stunImmuneBase (C. Viper's Burst Time: innate "Stun Immunity" printed on the
  // card itself, not granted by a boost or a paid Critical) feeds the same flags
  // boost/Critical-granted immunity already feed.
  const myStunImmune = !!mb.stunImmune || (myCritLikely && myCrit.stunImmune) || !!myCard.stunImmuneBase;
  const oppStunImmune = !!ob.stunImmune || (oppCritLikely && oppCrit.stunImmune) || !!oppCard.stunImmuneBase;

  let myDmg = 0, oppDmg = 0, oppStunned = false, iStunned = false;
  if (iGoFirst) {
    if (myHits) {
      myDmg = Math.max(0, myPowTotal - effOppArmForMyHit);
      if (myDmg > effOppGrdForMyHit && !oppStunImmune) oppStunned = true;
    }
    if (!oppStunned && oppHits) {
      oppDmg = Math.max(0, oppPowTotal - effMyArmForOppHit);
    }
  } else {
    if (oppHits) {
      oppDmg = Math.max(0, oppPowTotal - effMyArmForOppHit);
      if (oppDmg > effMyGrdForOppHit && !myStunImmune) iStunned = true;
    }
    if (!iStunned && myHits) {
      myDmg = Math.max(0, myPowTotal - effOppArmForMyHit);
    }
  }
  // value: damage dealt minus damage taken, small bonus for hitting (gauge/tempo), penalty for whiffing an ultra
  let value = myDmg - oppDmg;
  if (myHits) value += 1.0; // tempo/gauge value of connecting
  if (myAdvantageBonus) value += 0.5; // Cammy's Exceeded side-swap also grants Advantage
  if (myCard.type === 'ultra' && !myHits) value -= 3; // wasted resource
  // Movement immunity (e.g. Zangief's Double Lariat, "Opponents can't move you") denies
  // the opponent's own repositioning/tempo tools — small flat nudge rather than a full
  // simulation of whatever push/pull the opponent's card would otherwise have done.
  if (myCard.movementImmune) value += 0.3;
  // ---- resource cost (see GAUGE_POINT_VALUE) ----
  // Setting an Ultra spends its Gauge cost whether or not it connects, and paying a
  // Critical spends one more. Neither was ever charged. Both sides are priced the same
  // way, so this stays symmetric: an opponent holding an expensive Ultra is correctly
  // seen as paying for it too.
  value -= GAUGE_POINT_VALUE * (myCard.gaugeCost || 0);
  value -= GAUGE_POINT_VALUE * myCritProb;
  value += GAUGE_POINT_VALUE * (oppCard.gaugeCost || 0) * 0.5;
  return {
    value,
    // The raw figures the scalar is built from, for callers that must not conflate them
    // (the three-turn planner's life bookkeeping above all).
    myDmg, oppDmg, myHits, oppHits, iStunned, oppStunned, iGoFirst,
  };
}

// (`chooseStrikeCard` used to live here: the original Monte Carlo strike picker, which
// assumed a single locally-best opponent response and sampled via softmax. It was
// superseded by `chooseStrikeSelection` below — which also weighs EX pairs and solves a
// real mixed strategy — and kept exported long after its last caller disappeared. Removed
// once a search confirmed nothing in the project called it.)

// (`shouldWildSwing` used to live here: a fixed `bestHandScore < -1.5` threshold followed
// by a flat 15% dice roll. It was removed once `wildSwingExpectedValue` below made Wild
// Swing a real, priced option — the two ran in series inside chooseStrikeSelection, so the
// dice roll could override a principled comparison that had just decided against swinging.
// Don't reintroduce a random override on top of the payoff comparison.)

function isCardValidForStrike(characterKey, exceeded, card) {
  if (!card) return false;
  const char = characterKey && CHARACTERS[characterKey];
  if (char && char.invalidStrikeCard && char.invalidStrikeCard({ exceeded: !!exceeded }, card)) return false;
  return true;
}

// Build EX-strike candidates: pairs of same-key cards in hand, each producing a
// synthetic +1/+1/+1/+1 card. The AI is allowed to see and use these — it's fully
// legitimate since they're built from the AI's own hand.
function buildStrikeCandidates(hand, buildExCardFn, gaugeCount, characterKey = null, exceeded = false) {
  // An Ultra the player can't currently pay the Gauge cost for is INVALID as a strike —
  // setting it just forces an automatic Wild Swing substitution (see payUltra() in
  // engine.js), discarding whatever tactical value the AI thought it was getting. A
  // human might deliberately do this as a bluff, but the AI's evaluator has no concept
  // of bluffing and would just be misvaluing a card that can't actually deliver the
  // stats it's being scored on — so unaffordable Ultras and character-invalidated cards
  // (e.g. Nagoriyuki's Specials while Exceeded) are excluded from the AI's candidate
  // pool entirely, at every difficulty.
  const usableHand = hand.filter(c => {
    if (!isCardValidForStrike(characterKey, exceeded, c)) return false;
    if (gaugeCount != null && c.type === 'ultra' && (c.gaugeCost || 0) > gaugeCount) return false;
    return true;
  });
  const candidates = usableHand.map(c => ({ displayCard: c, selection: { type: 'hand', uid: c.uid } }));
  const seenPairs = new Set();
  for (let i = 0; i < usableHand.length; i++) {
    for (let j = i + 1; j < usableHand.length; j++) {
      if (usableHand[i].key === usableHand[j].key && !seenPairs.has(usableHand[i].key)) {
        seenPairs.add(usableHand[i].key);
        candidates.push({
          displayCard: buildExCardFn(usableHand[i], usableHand[j]),
          selection: { type: 'ex', uid1: usableHand[i].uid, uid2: usableHand[j].uid },
        });
      }
    }
  }
  return candidates;
}

// ---------------- Simultaneous-move strike selection ----------------
// Setting a Strike in Exceed is a SIMULTANEOUS, hidden-information decision: both
// players commit face-down and reveal together. Every earlier version of this file
// solved a sequential game instead — chooseStrikeCard/chooseStrikeSelection sampled a
// plausible opponent hand, let the opponent pick their best answer to each of my cards
// *as if they could see it*, and then scored my card against that answer. The planner
// made the mirror-image assumption with the opposite sign (min over my value instead of
// max over theirs), so the two disagreed about what the opponent was even trying to do.
//
// Assuming the opponent sees your card makes the agent permanently, structurally
// pessimistic: it always plays the most robust card, never the exploitative one. It
// cannot bluff, cannot punish a pattern, and cannot be made to mix — the old softmax
// over collapsed scores randomised AWAY from the best response rather than randomising
// BETWEEN best responses at meaningful frequencies.
//
// What replaces it is the actual game: a payoff matrix over my candidate strikes and
// their plausible answers, solved for a mixed strategy by regret matching, then sampled.
// It is also cheaper — the matrix is ~10x12 evaluations instead of samples x candidates
// x handSize, which was ~7,200.

// The opponent's plausible ANSWER SET: distinct cards they could set, each with a prior
// probability from how often it turns up across sampled hands. Still strictly public
// information (see this file's header) — sampleOpponentHand does the fair sampling; this
// just aggregates it into a distribution instead of throwing the samples away.
function buildOpponentAnswerSet(oppPublic, rng, samples = 48, maxCards = 12) {
  const counts = new Map();
  let hands = 0;
  // Each sampled hand carries a weight from how well it explains the opponent's recent
  // visible behaviour (handLikelihood). Weighting the samples rather than re-sampling
  // costs nothing extra — the draws already happened — and turns a fixed prior into a
  // belief that actually updates during the game.
  const oppMods = boostModsFromKeys(oppPublic.boostsInPlay);
  const oppPool = unseenPoolForOpponent(oppPublic);
  for (let s = 0; s < samples; s++) {
    const h = sampleOpponentHand(oppPublic, rng, oppPool);
    if (!h.length) continue;
    const w = handLikelihood(h, oppPublic.observations, oppMods);
    hands += w;
    const seen = new Set();
    for (const c of h) {
      if (!c || seen.has(c.key)) continue;
      seen.add(c.key);
      counts.set(c.key, (counts.get(c.key) || 0) + w);
    }
  }
  if (!hands) return [];
  const oppGauge = (oppPublic.gauge || []).length;
  const entries = [];
  for (const [key, n] of counts) {
    const card = cardByKey(oppPublic.characterKey, key);
    if (!card) continue;
    // An Ultra they cannot pay for is not a legal answer — the engine substitutes a Wild
    // Swing (payUltra), so scoring it as a live threat overstates their hand. This is the
    // same filter buildStrikeCandidates applies to our own side, finally applied to
    // theirs; their Gauge is fully public (publicInfoOf lists exact card keys), so
    // reading it breaks no fairness invariant. HANDOFF §8 invariant #13 forbids using
    // THEIR gauge to filter MY candidates, which is a different thing and still holds.
    if (!isCardValidForStrike(oppPublic.characterKey, oppPublic.exceeded, card)) continue;
    if (card.type === 'ultra' && (card.gaugeCost || 0) > oppGauge) continue;
    entries.push({ card, prior: n / hands });
  }
  entries.sort((a, b) => b.prior - a.prior);
  const top = entries.slice(0, maxCards);
  const total = top.reduce((s, e) => s + e.prior, 0) || 1;
  for (const e of top) e.prior /= total;
  return top;
}

// Regret matching (Hart & Mas-Colell) on a two-player payoff matrix. `A[i][j]` is my
// value when I play i and they play j; `B[i][j]` is THEIR value in the same cell — the
// game is general-sum here (evalMatchup gives both sides a tempo bonus for connecting,
// so both can score positively in one exchange), so both sides get their own regret
// vector rather than assuming zero-sum. `priors` weights their actions by how likely
// they are to actually hold that card. Returns the time-average strategies, which is
// the quantity that converges — never the final iterate.
function solveMixedStrategy(A, B, priors, iters = 300) {
  const n = A.length, m = n ? A[0].length : 0;
  if (!n || !m) return { my: [], opp: [] };
  const regA = new Float64Array(n), regB = new Float64Array(m);
  const sumA = new Float64Array(n), sumB = new Float64Array(m);
  const sa = new Float64Array(n), sb = new Float64Array(m);
  const uA = new Float64Array(n), uB = new Float64Array(m);
  const fillStrat = (reg, out) => {
    let tot = 0;
    for (let i = 0; i < reg.length; i++) {
      const v = reg[i] > 0 ? reg[i] : 0;
      out[i] = v;
      tot += v;
    }
    if (tot <= 0) {
      const u = 1 / reg.length;
      for (let i = 0; i < reg.length; i++) out[i] = u;
    } else {
      const inv = 1 / tot;
      for (let i = 0; i < reg.length; i++) out[i] *= inv;
    }
  };
  for (let t = 0; t < iters; t++) {
    fillStrat(regA, sa);
    fillStrat(regB, sb);
    if (priors) {
      let tot = 0;
      for (let j = 0; j < m; j++) {
        const w = sb[j] * (priors[j] || 0);
        sb[j] = w;
        tot += w;
      }
      if (tot > 0) {
        const inv = 1 / tot;
        for (let j = 0; j < m; j++) sb[j] *= inv;
      } else {
        for (let j = 0; j < m; j++) sb[j] = priors[j] || 0;
      }
    }
    for (let i = 0; i < n; i++) sumA[i] += sa[i];
    for (let j = 0; j < m; j++) sumB[j] += sb[j];
    let evA = 0;
    for (let i = 0; i < n; i++) {
      let v = 0;
      const rowA = A[i];
      for (let j = 0; j < m; j++) v += sb[j] * rowA[j];
      uA[i] = v; evA += sa[i] * v;
    }
    for (let i = 0; i < n; i++) regA[i] += uA[i] - evA;
    let evB = 0;
    for (let j = 0; j < m; j++) {
      let v = 0;
      for (let i = 0; i < n; i++) v += sa[i] * B[i][j];
      uB[j] = v; evB += sb[j] * v;
    }
    for (let j = 0; j < m; j++) regB[j] += uB[j] - evB;
  }
  const normArr = (sum) => {
    let t = 0;
    for (let i = 0; i < sum.length; i++) t += sum[i];
    const inv = t > 0 ? 1 / t : 1;
    const out = new Array(sum.length);
    for (let i = 0; i < sum.length; i++) out[i] = sum[i] * inv;
    return out;
  };
  return { my: normArr(sumA), opp: normArr(sumB) };
}

// What a candidate costs in resources beyond whatever evalMatchup already charged.
// evalMatchup prices an Ultra's flat Gauge cost symmetrically for both sides; this adds
// the part that depends on MY live situation and therefore can't live in there: an EX
// pair permanently discards its second copy, and spending Gauge hurts far more when it
// is the Gauge that was going to pay for Exceed.
function candidateResourceCost(candidate, handSize, myGaugeCount, myCharacterKey, myExceeded) {
  let cost = 0;
  if (candidate.selection.type === 'ex') {
    // The last spare card costs much more than the fifth.
    const thin = Math.max(0, 5 - handSize);
    cost += EX_DISCARD_COST * (1 + thin * 0.35);
  }
  const gaugeCost = (candidate.displayCard && candidate.displayCard.gaugeCost) || 0;
  if (gaugeCost > 0 && !myExceeded) {
    const exceedCost = (CHARACTERS[myCharacterKey] || {}).exceedCost || 2;
    const after = (myGaugeCount || 0) - gaugeCost;
    const shortfall = Math.max(0, Math.min(exceedCost, exceedCost - after));
    cost += GAUGE_POINT_VALUE * (GAUGE_SCARCITY_MULTIPLIER - 1) * shortfall;
  }
  return cost;
}

// What an unknown top-of-deck card is worth against the opponent's solved answer mix.
// shouldWildSwing used to guess at this with a fixed threshold and a 15% dice roll, so
// Wild Swing as a deliberate play — protecting a hand you want to keep, or swinging
// when every card you hold is dead at this range — effectively did not exist. Sampling
// the character's own static card pool is a fair approximation of "what might come off
// the top" (deck composition is public knowledge; see deckKeysForCharacter).
function wildSwingExpectedValue({ myCharacterKey, myPos, mb, answers, oppMix, oppPublic, ob, iAmInitiator, myExceeded, oppExceeded, myGaugeCount, eddiePositions = null, rng, picks = 8 }) {
  const keys = deckKeysForCharacter(myCharacterKey);
  if (!keys.length || !answers.length) return 0;
  let total = 0, n = 0;
  for (let p = 0; p < picks; p++) {
    const card = cardByKey(myCharacterKey, keys[Math.floor(rng() * keys.length)]);
    if (!card) continue;
    let v = 0;
    for (let j = 0; j < answers.length; j++) {
      v += (oppMix[j] || 0) * evalMatchup({
        myCard: card, myPos, myBoostMods: mb,
        oppCard: answers[j].card, oppPos: oppPublic.pos, oppBoostMods: ob,
        iInitiated: iAmInitiator, myExceeded, oppExceeded,
        myCharacterKey, oppCharacterKey: oppPublic.characterKey,
        myGaugeCount, oppGaugeCount: (oppPublic.gauge || []).length,
        eddiePositions,
      });
    }
    total += v; n++;
  }
  return n ? total / n : 0;
}

// Monte Carlo strike SELECTION (extends chooseStrikeCard to also weigh EX pairs).
// Returns {selection, displayCard, scores} — `selection` is what you pass straight
// into engine.resolveStrikeCardSelection(). myBoostMods should be computed from the
// AI's OWN boostsInPlay (full info about itself); oppBoostMods is derived from
// oppPublic.boostsInPlay (public, so still fair — see boostModsFromKeys above).
// `randomness` (see AI_DIFFICULTIES): with that probability, skip evaluation entirely
// and pick uniformly among {hand cards, EX pairs, Wild Swing}. `myGaugeCount` (the
// caller's OWN Gauge, always fully known to them) gates out unaffordable Ultras — see
// buildStrikeCandidates.
function chooseStrikeSelection({ hand, myPos, oppPublic, iAmInitiator, rng, samples = 120, buildExCardFn, myBoostMods, randomness = 0, myGaugeCount = 0, myExceeded = false, myCharacterKey = null, myEddiePos = null, meFull = null, turnNumber = 0 }) {
  if (typeof NativeCpuAI !== 'undefined' && NativeCpuAI.isModernActive() && meFull && oppPublic) {
    const snap = NativeCpuAI.decisionSnapshot(meFull, oppPublic, false, {
      turnNumber,
      seed: Math.floor(rng() * 0x7fffffff),
      activePlayer: iAmInitiator ? 'actor' : 'opponent',
    });
    const nativeStrike = iAmInitiator ? NativeCpuAI.chooseStrikeAction(snap) : NativeCpuAI.chooseDefenseAction(snap);
    if (nativeStrike) {
      const sel = NativeCpuAI.resolveNativeStrikeToEngineSelection(nativeStrike, meFull);
      if (sel) {
        if (sel.type === 'wildswing') return { selection: sel, displayCard: null, scores: null };
        const chosenCard = hand.find(c => c.uid === (sel.uid || sel.uid1));
        const gaugeFree = CHARACTERS[myCharacterKey] && CHARACTERS[myCharacterKey].gaugeCostsFreeWhenExceeded && myExceeded;
        const gCost = chosenCard && chosenCard.type === 'ultra' && !gaugeFree ? (chosenCard.gaugeCost || 0) : 0;
        if (chosenCard && isCardValidForStrike(myCharacterKey, myExceeded, chosenCard) && gCost <= myGaugeCount) {
          const displayCard = sel.type === 'ex' && buildExCardFn
            ? buildExCardFn(chosenCard, hand.find(c => c.uid === sel.uid2))
            : chosenCard;
          return { selection: sel, displayCard, scores: null };
        }
      }
    }
  }
  const candidates = buildStrikeCandidates(hand, buildExCardFn, myGaugeCount, myCharacterKey, myExceeded);

  // Everything in hand was an unaffordable Ultra (rare, but possible) — the only legal,
  // sensible option left is a Wild Swing.
  if (candidates.length === 0) {
    return { selection: { type: 'wildswing' }, displayCard: null, scores: [] };
  }

  if (rng() < randomness) {
    const pool = [...candidates.map(c => c.selection), { type: 'wildswing' }];
    const selection = pool[Math.floor(rng() * pool.length)];
    return { selection, displayCard: null, scores: null };
  }

  const mb = myBoostMods || boostModsFromKeys([]);
  const ob = boostModsFromKeys(oppPublic.boostsInPlay);
  const oppExceeded = !!oppPublic.exceeded;
  const oppCharacterKey = oppPublic.characterKey;
  const oppGaugeCount = (oppPublic.gauge || []).length;

  const answers = buildOpponentAnswerSet(oppPublic, rng, Math.max(16, Math.min(64, samples)));
  if (!answers.length) {
    // The opponent has nothing to answer with (empty hand). No matrix to solve — just
    // take the hardest thing that reaches them.
    let bestIdx = 0, best = -Infinity;
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i].displayCard;
      const v = (isEffectivelyInRange(c, Math.abs(myPos - oppPublic.pos), mb) ? 10 : 0) + (c.pow || 0);
      if (v > best) { best = v; bestIdx = i; }
    }
    return { selection: candidates[bestIdx].selection, displayCard: candidates[bestIdx].displayCard, scores: null };
  }

  // ---- the payoff matrix ----
  // Both sides' Eddie positions, if either side is a Zato-1 (his own is passed in;
  // the opponent's is public board state — see publicInfoOf).
  const eddiePositions = { mine: myEddiePos, theirs: oppPublic.eddiePos != null ? oppPublic.eddiePos : null };
  const eddiePositionsSwapped = { mine: eddiePositions.theirs, theirs: eddiePositions.mine };
  const n = candidates.length, m = answers.length;
  const A = [], B = [];
  for (let i = 0; i < n; i++) {
    const my = candidates[i].displayCard;
    const penalty = candidateResourceCost(candidates[i], hand.length, myGaugeCount, myCharacterKey, myExceeded);
    const rowA = new Array(m), rowB = new Array(m);
    for (let j = 0; j < m; j++) {
      const opp = answers[j].card;
      // `eddiePositions` is `{mine, theirs}` from the acting side's point of view, so
      // it swaps along with everything else on the opponent's row.
      rowA[j] = evalMatchup({
        myCard: my, myPos, myBoostMods: mb,
        oppCard: opp, oppPos: oppPublic.pos, oppBoostMods: ob,
        iInitiated: iAmInitiator, myExceeded, oppExceeded,
        myCharacterKey, oppCharacterKey,
        myGaugeCount, oppGaugeCount, eddiePositions,
      }) - penalty;
      rowB[j] = evalMatchup({
        myCard: opp, myPos: oppPublic.pos, myBoostMods: ob,
        oppCard: my, oppPos: myPos, oppBoostMods: mb,
        iInitiated: !iAmInitiator, oppExceeded, myExceeded,
        myCharacterKey: oppCharacterKey, oppCharacterKey: myCharacterKey,
        myGaugeCount: oppGaugeCount, oppGaugeCount: myGaugeCount, eddiePositions: eddiePositionsSwapped,
      });
    }
    A.push(rowA); B.push(rowB);
  }

  const priors = answers.map(a => a.prior);
  const { my: mix, opp: oppMix } = solveMixedStrategy(A, B, priors);
  // Each candidate's expected value against the answer distribution the solver settled
  // on — the honest version of the old `scores` array, and what the Wild Swing
  // comparison below is measured against.
  const scores = A.map(row => row.reduce((s, v, j) => s + v * (oppMix[j] || 0), 0));
  const bestScore = scores.length ? Math.max(...scores) : -Infinity;

  // ---- Wild Swing as a real option, not a desperation dice roll ----
  const wsValue = wildSwingExpectedValue({
    myCharacterKey, myPos, mb, answers, oppMix, oppPublic, ob, iAmInitiator, myExceeded,
    oppExceeded, myGaugeCount, eddiePositions, rng,
  });
  // Swinging blind also keeps the whole hand, which is worth something on its own; the
  // margin stops it being taken on a rounding difference.
  if (wsValue > bestScore + 0.35) {
    return { selection: { type: 'wildswing' }, displayCard: null, scores };
  }
  // Sample from the solved mixed strategy. This is the deliberate, meaningful
  // unpredictability the softmax was standing in for: actions that are genuinely
  // interchangeable at equilibrium get played at their equilibrium frequencies, and an
  // action that is simply worse gets weight ~0 instead of the softmax's steady trickle.
  let r = rng();
  let chosenIdx = mix.length - 1;
  for (let i = 0; i < mix.length; i++) { r -= mix[i]; if (r <= 0) { chosenIdx = i; break; } }
  if (chosenIdx < 0 || chosenIdx >= candidates.length) chosenIdx = 0;
  return { selection: candidates[chosenIdx].selection, displayCard: candidates[chosenIdx].displayCard, scores };
}

// Resolve a yielded strike-resolution request for the AI (Grasp push, Block Force spend,
// Hadoken recycle). Only ever sees the request's own numeric fields — never a hand array.
// `randomness` (see AI_DIFFICULTIES): with that probability, answer with a random legal
// value instead of the heuristic one.
// How good a resulting distance is: how much of my hand reaches from there, net of how
// much of the opponent's plausible hand reaches me. The same question bestMoveTarget
// answers for the paid Move action — the machinery already existed, it just was never
// called from the strike-resolution answers.
function graspPositionScore(ctx, dist) {
  const hand = ctx.hand || [];
  const mine = hand.length ? hand.filter(c => isEffectivelyInRange(c, dist, ctx.boostMods)).length / hand.length : 0;
  let theirs = 0;
  if (ctx.oppHandSample && ctx.oppHandSample.length) {
    theirs = ctx.oppHandSample.filter(c => isEffectivelyInRange(c, dist, ctx.oppBoostMods)).length / ctx.oppHandSample.length;
  }
  return mine - 0.5 * theirs;
}
function bestGraspAmount(ctx, direction, min, max) {
  if (!ctx || !ctx.hand || ctx.dist == null) return max;
  let best = null;
  for (let amount = min; amount <= max; amount++) {
    const d = direction === 'retreat'
      ? Math.min(BOARD_SIZE - 1, ctx.dist + amount)
      : Math.max(1, ctx.dist - amount);
    const score = graspPositionScore(ctx, d);
    if (!best || score > best.score) best = { score, amount };
  }
  return best.amount;
}

// `ctx` (optional) is what turns several of these from constants into decisions:
//   { hand, dist, boostMods, characterKey, oppPublic }
// Every heuristic below still works without it — omitting it reproduces the old fixed
// answers exactly — but a caller that supplies it gets positional reasoning instead of
// a constant. The problem being fixed: this table WAS a list of constants. Always push
// away at maximum. Always sustain. Always recycle. Always spend the maximum Force.
// Individually defensible; collectively a free read for any opponent paying attention,
// because none of them ever look at the board.
function resolveAIStrikeRequest(request, rng, randomness = 0, ctx = null) {
  if (rng() < randomness) {
    if (request.type === 'grasp_move') {
      const min = request.min != null ? request.min : 1, max = request.max != null ? request.max : 2;
      const amount = min + Math.floor(rng() * (max - min + 1));
      const direction = request.forceDirection || (rng() < 0.5 ? 'advance' : 'retreat');
      return { amount, direction };
    }
    if (request.type === 'block_force') return Math.floor(rng() * (request.maxForce + 1));
    if (request.type === 'hadoken_recycle') return rng() < 0.5;
    if (request.type === 'sustain_choice') return rng() < 0.5;
    if (request.type === 'optional_gauge_spend') return rng() < 0.5;
    if (request.type === 'optional_retreat') return rng() < 0.5;
    if (request.type === 'sustain_choice_paid') return rng() < 0.5;
    if (request.type === 'optional_force_spend_pow') return Math.floor(rng() * (request.max + 1));
    if (request.type === 'may_exceed_choice') return rng() < 0.5;
    if (request.type === 'named_choice_effect') {
      const opts = request.options || [];
      return opts.length ? opts[Math.floor(rng() * opts.length)].key : null;
    }
    if (request.type === 'place_eddie') {
      return chooseEddieSpace({ ...request, rng, randomness: 1 });
    }
    return null;
  }
  if (request.type === 'grasp_move') {
    const max = request.max != null ? request.max : 2;
    const min = request.min != null ? request.min : 1;
    // Direction-locked cards (e.g. Cammy's Gyro Drive Smasher, which can only Pull)
    // have nothing to decide about direction.
    if (request.forceDirection) {
      return { amount: bestGraspAmount(ctx, request.forceDirection, min, max), direction: request.forceDirection };
    }
    if (!ctx || !ctx.hand || ctx.dist == null) {
      // No board context supplied — fall back to the old constant.
      return { amount: max, direction: 'retreat' };
    }
    // Pick the push/pull that leaves the board where MY hand works best and, as a
    // tiebreak, where theirs works worst. "Always shove them as far away as possible"
    // is actively wrong for a close-range character, and it was the single most
    // predictable thing this AI did.
    let best = null;
    for (const direction of ['advance', 'retreat']) {
      for (let amount = min; amount <= max; amount++) {
        const d = direction === 'retreat'
          ? Math.min(BOARD_SIZE - 1, ctx.dist + amount)
          : Math.max(1, ctx.dist - amount);
        const score = graspPositionScore(ctx, d);
        if (!best || score > best.score) best = { score, amount, direction };
      }
    }
    return { amount: best.amount, direction: best.direction };
  }
  if (request.type === 'block_force') {
    // Two DIFFERENT objectives, which the old single formula silently conflated:
    //
    //   zero the damage — each Force spent is +2 Armor and damage is
    //                     max(0, POW - ARM), so it takes ceil((POW - ARM) / 2).
    //   avoid the Stun  — Guard does NOT reduce damage. The engine stuns on
    //                     `dealt > effGrd` and computes `dealt` from Armor alone
    //                     (engine.js's `effArm`/`effGrd` split), so ducking under
    //                     Guard takes only ceil((POW - ARM - GRD) / 2).
    //
    // The stun figure is always the SMALLER of the two, and the old code computed
    // exactly it — `ceil((attackerPow - defenderArmBase - defenderGuard) / 2)` — and
    // then used it as though it were the damage figure. So whenever the defender had
    // any Guard at all, the AI bought stun-immunity only and ate damage it could have
    // prevented outright.
    const toZeroDamage = Math.max(0, Math.ceil((request.attackerPow - request.defenderArmBase) / 2));
    const toAvoidStun = Math.max(0, Math.ceil((request.attackerPow - request.defenderArmBase - request.defenderGuard) / 2));
    const want = Math.max(toZeroDamage, toAvoidStun);
    // What the hand can afford to lose. One Force prevents two damage, and the planner
    // prices a card at w.hand 0.3 against a life point at w.life 0.85 — so trading a
    // card for 2 damage is clearly right, while emptying the hand is not, because those
    // cards are also the next attack. Hold a small reserve (in Force VALUE, matching
    // maxForce, not card count) and waive it only for the stun-avoiding spend, since
    // being Stunned discards the attack anyway.
    const HAND_RESERVE = 2;
    const cap = Math.max(0, request.maxForce - HAND_RESERVE);
    return Math.max(Math.min(toAvoidStun, request.maxForce), Math.min(want, cap));
  }
  if (request.type === 'hadoken_recycle') {
    // recycling (Deck-return + Gauge gain) is almost always correct — keep the AI's
    // prior always-true behavior as its heuristic.
    return true;
  }
  if (request.type === 'sustain_choice') {
    // sustaining a boost is close to strictly beneficial (free extra turn of a
    // buff you already paid for) — no real downside case identified, so the AI
    // always takes it, same as its hadoken_recycle heuristic above.
    return true;
  }
  if (request.type === 'optional_gauge_spend') {
    // Axl Bomber's "spend 1 Gauge for Advantage" — the engine only yields this
    // at all once it's already confirmed the player can afford it, and Advantage
    // (an extra turn) is close to always worth 1 Gauge, so the AI takes it
    // unconditionally. Doesn't weigh "is this Gauge more valuable saved for an
    // Exceed/Ultra/Critical instead" — no richer resource-tradeoff lookahead
    // here, same simplification level as this codebase's other single-value
    // AI heuristics (e.g. sustain_choice/hadoken_recycle above).
    return true;
  }
  if (request.type === 'optional_retreat') {
    // Rainwater's "Before: You may Retreat 1." Retreating is usually right for a ranged
    // card, but "usually" is not "always" — with board context, compare the two
    // resulting distances properly instead of answering yes unconditionally.
    if (ctx && ctx.hand && ctx.dist != null) {
      return graspPositionScore(ctx, Math.min(BOARD_SIZE - 1, ctx.dist + 1)) >= graspPositionScore(ctx, ctx.dist);
    }
    return true;
  }
  if (request.type === 'sustain_choice_paid') {
    // Same "free extra turn of a buff already paid for" logic as sustain_choice
    // above, but this one costs Force — engine only offers it once affordability
    // is already confirmed, so the AI still takes it unconditionally (no
    // resource-tradeoff lookahead, matching this file's other heuristics).
    return true;
  }
  if (request.type === 'optional_force_spend_pow') {
    // Temple Massage/Thunder Knuckle's "spend up to N Force for +1POW each". Spending
    // the maximum was the old answer, and it ignores that every point of Force is a
    // CARD out of hand — emptying the hand for +3 POW on one exchange leaves nothing to
    // defend or strike with next turn. Keep a working hand where one exists.
    if (ctx && ctx.hand) {
      const keep = 2;
      return Math.max(0, Math.min(request.max, ctx.hand.length - keep));
    }
    return request.max;
  }
  if (request.type === 'may_exceed_choice') {
    // Leo's Innate: a free Exceed is close to strictly good (no cost, no downside
    // identified), same "no real downside case" logic as sustain_choice above.
    return true;
  }
  if (request.type === 'named_choice_effect') {
    // Millia's Innate/Exceed "may draw 1/Advance 2/Retreat 2[/gain Advantage]" —
    // simple fixed preference order (no board-state weighing, matching this file's
    // other single-value heuristics): Advantage (free extra turn) > Draw (card
    // economy) > Advance/Retreat (pure positioning, least valuable of the four
    // with no immediate follow-up planned). Always takes an option — allowDecline
    // exists for a future card that has a genuine downside to accepting, which
    // this one doesn't.
    const byKey = {};
    for (const o of request.options) byKey[o.key] = o;
    if (byKey.advantage) return 'advantage';
    if (byKey.draw) return 'draw';
    if (byKey.advance) return 'advance';
    if (byKey.retreat) return 'retreat';
    return request.options[0] ? request.options[0].key : null;
  }
  if (request.type === 'place_eddie') {
    // Zato-1's "After: You may place Eddie ..." — always takes the placement (Eddie
    // out of play does nothing at all, so there is no downside case), choosing the
    // space his own hand reaches best. See chooseEddieSpace.
    return chooseEddieSpace({ ...request, rng, randomness: 0 });
  }
  return null;
}

// Sagat's Innate/Exceed: "may place your attack face up for +SPD[/+POW]" — a real
// information-for-stats trade (the opponent gets to see the card before choosing
// their own defense). No deeper game-theoretic modeling of "is this card worth
// revealing" here, same shallow-heuristic level as this file's other yes/no
// decisions (sustain_choice, may_exceed_choice) — the AI takes the guaranteed stat
// bonus most of the time.
function chooseFaceUp({ card, rng, randomness = 0 }) {
  if (rng() < randomness) return rng() < 0.5;
  // Was a flat 65% coin flip that ignored the card entirely. What you are actually
  // trading is information for stats, and how bad that trade is depends on the card:
  // a fast, armoured attack loses little by being seen (they can't out-speed it and
  // there's no surprise to give away), while an Ultra or a low-Speed attack is exactly
  // what a defender wants advance warning of.
  let p = 0.55;
  if ((card.spd || 0) >= 5) p += 0.15;
  if ((card.arm || 0) >= 2) p += 0.1;
  if (card.type === 'ultra') p -= 0.3;
  if ((card.spd || 0) <= 2) p -= 0.15;
  return rng() < Math.max(0.05, Math.min(0.9, p));
}

// Season 5 Overdrive tick (see engine.js's Overdrive section): most BlazBlue
// Overdrive effects are directional — "Close or Retreat 1", "Advance or Retreat 2",
// "you may Push 1" — so the option list they offer is scored here rather than taken
// blind. The only public, non-cheating signal worth using is distance: a fighter
// whose deck wants to be close should close, one that wants space should back off.
// Each option carries a `prefer` tag from the character definition ('close',
// 'retreat', 'decline', or none) and this weighs those against the current Range,
// which keeps the whole roster's Overdrives on one shared heuristic instead of
// sixteen bespoke ones.
function chooseOverdriveOption({ options, me, oppPublic, engine, rng, randomness = 0 }) {
  if (!options || options.length === 0) return null;
  if (rng && rng() < randomness) return options[Math.floor(rng() * options.length)].key;
  const dist = Math.abs((me.pos || 0) - (oppPublic && oppPublic.pos != null ? oppPublic.pos : 0));
  const scored = options.map(o => {
    let w = 0;
    // "Close" is worth more the further away the opponent is, and actively bad in
    // their face; "retreat"/"push" is the mirror image. Anything untagged scores
    // neutral, so a character can add an option without touching this function.
    if (o.prefer === 'close') w = dist - 2;
    else if (o.prefer === 'retreat' || o.prefer === 'push') w = 2 - dist;
    else if (o.prefer === 'decline') w = -0.5; // only taken when nothing else looks good
    else w = 0.25;
    return { key: o.key, w: w + (rng ? rng() * 0.01 : 0) };
  });
  scored.sort((a, b) => b.w - a.w);
  return scored[0].key;
}

// Score how much denying/forcing a card would matter — used by chooseNamedCardKey.
// Higher power and resource-cost cards are worth more to take out of an opponent's hand.
function scoreNamedCardKey(key, characterKey) {
  const c = cardByKey(characterKey, key);
  if (!c) return 0;
  let score = c.pow || 0;
  if (c.type === 'ultra') score += 3; // ultras are the biggest tempo/damage swings to deny
  if (c.type === 'special') score += 1;
  return score;
}

// Naming a card with Block's boost or a Normal with Focus's boost: actually score by
// how much it'd hurt the opponent to be missing that card (was previously fully random
// despite a comment claiming it preferred high-power cards — now it really does).
// `randomness`: with that probability, pick uniformly at random instead (old behavior).
function chooseNamedCardKey({ oppPublic, pool, rng, randomness = 0 }) {
  if (!pool || pool.length === 0) return null;
  if (rng() < randomness) return pool[Math.floor(rng() * pool.length)];
  const scored = pool.map(key => ({ key, w: scoreNamedCardKey(key, oppPublic.characterKey) + rng() * 0.01 }));
  scored.sort((a, b) => b.w - a.w);
  // Deliberate mixing, not noise. Always naming the single highest-Power card is a free
  // read: a human who has seen it twice simply stops holding that card when a Reading or
  // a Block naming is on the table. Naming the second-best a real fraction of the time
  // costs almost nothing in expectation (the top two are usually close) and makes the
  // guess genuinely unpredictable. Distinct from the difficulty `randomness` above,
  // which is a uniform blunder — this is a bounded, intentional strategy mix.
  if (scored.length > 1 && rng() < 0.25) return scored[1].key;
  return scored[0].key;
}

// Zangief's Flying Power Bomb boost: "Name a Range." No-cheating constraint means
// this can't read the opponent's actual hand — instead it weighs range values by
// how common they are across ALL card definitions in the game (a fair, public
// piece of game knowledge, same spirit as evalMatchup's use of public info only),
// on the theory that a commonly-printed range is more likely to hit *something* in
// any given hand. `randomness` (see AI_DIFFICULTIES) can override with a uniform
// random pick instead, same pattern as every other AI decision point.
function chooseRangeToName({ rng, randomness = 0, oppPublic = null }) {
  const freq = {};
  // With an opponent to look at, weight by the ranges THEIR plausible hand actually
  // occupies rather than by a global frequency table over every card in the game. The
  // old version named a range without ever looking at the board or at who it was
  // playing against, which made it both weaker and completely predictable. Falls back
  // to the global table when no opponent snapshot is supplied.
  const source = oppPublic
    ? sampleOpponentHand(oppPublic, rng).concat(sampleOpponentHand(oppPublic, rng))
    : Array.from(_cardByKeyMap.values());
  const pool = source.length ? source : Array.from(_cardByKeyMap.values());
  for (const card of pool) {
    if (!card || !card.range) continue;
    for (let r = card.range[0]; r <= card.range[1]; r++) freq[r] = (freq[r] || 0) + 1;
  }
  const values = Object.keys(freq).map(Number);
  if (values.length === 0) return 1;
  if (rng() < randomness) return values[Math.floor(rng() * values.length)];
  let total = 0;
  for (const v of values) total += freq[v];
  let roll = rng() * total;
  for (const v of values) { roll -= freq[v]; if (roll <= 0) return v; }
  return values[values.length - 1];
}

// Zangief's Flying Power Bomb boost, the OTHER side of the same mechanic: when 2+
// of THIS player's own hand cards match the named Range and they must choose which
// to discard (see engine.pendingRangeDiscard), keep the highest-Power card and give
// up the weakest matching one — a simple, defensible heuristic, not a full
// evaluation of each card's situational value.
function chooseRangeDiscard(matchingCards, rng) {
  if (!matchingCards || matchingCards.length === 0) return null;
  const scored = matchingCards.map(c => ({ c, w: (c.pow || 0) + rng() * 0.01 }));
  scored.sort((a, b) => a.w - b.w);
  return scored[0].c.uid;
}

// A card's *effective* reachable range band, accounting for its own free "Before"
// self-movement (Assault/Dive/Tatsumaki/Guren all close ~2-3 before the range check).
// This mirrors what the strike-selection evaluator already assumes, so the movement
// heuristic and the strike heuristic agree on what counts as "in range."
// Parse the amount a Before: Advance/Close movement adds to effective range. Extracted
// from card text so different cards' actual movement amounts are honored (Close 1 ≠ Close 3).
// Returns a number if found (0 for "before something else but no quantified movement"),
// falls back to defaultSlack if not parseable, so no card loses its coverage entirely.
// The richer sibling of parseBeforeMoverAmount below: as well as HOW FAR a card's own
// "Before" step moves its owner, this reports WHICH KIND of movement it is and whether
// the amount is optional ("up to N") or forced ("Advance 3").
//
// That distinction matters and used to be thrown away. The old model collapsed every
// mover to `Math.max(0, dist - slack)` — a single number, floored at zero — which says
// a Close 3 card set at Range 1 ends up at distance 0 and can therefore reach anything.
// The real rules say something quite different: Close STOPS adjacent and never crosses,
// while Advance CAN cross the opponent and come out the other side (engine.advanceSelf,
// HANDOFF §9's movement-helper family note). A forced "Advance 3" from Range 1 does not
// leave you at Range 0, it leaves you at Range 3 on the far side — which can take a
// short-range card OUT of range rather than into it. Close-range characters were
// mis-scored in both directions by this.
const _beforeMoverSpecCache = new Map();
function parseBeforeMoverSpec(text) {
  if (!text) return null;
  const hit = _beforeMoverSpecCache.get(text);
  if (hit !== undefined) return hit;
  let spec = null;
  if (/Before: (Advance|Close) as far as possible/i.test(text)) {
    spec = { kind: /Before: Close as far as possible/i.test(text) ? 'close' : 'advance', amount: BOARD_SIZE, upTo: true };
  } else {
    const m = text.match(/Before: (Advance|Close)\s+(?:up to\s+(\d+)|(\d+)\s+or\s+(\d+)|(\d+))/i);
    if (m) {
      const kind = m[1].toLowerCase();
      if (m[2]) spec = { kind, amount: parseInt(m[2], 10), upTo: true };
      else if (m[3] && m[4]) spec = { kind, amount: Math.max(parseInt(m[3], 10), parseInt(m[4], 10)), upTo: true };
      else spec = { kind, amount: parseInt(m[5], 10), upTo: false };
    }
  }
  _beforeMoverSpecCache.set(text, spec);
  return spec;
}

// Where a free (card-effect) move of `amount` spaces leaves you, in DISTANCE terms.
// Advance may jump over the opponent — the jump costs one unit of the movement, so
// advancing exactly `dist` lands you adjacent on the far side (distance 1), matching
// engine.advanceSelf. Close is the pull-up-short version: it never crosses.
function distanceAfterFreeMove(dist, amount, kind) {
  if (kind === 'close') return Math.max(1, dist - amount);
  return amount < dist ? dist - amount : amount - dist + 1;
}

// Every distance the owner of `card` could be standing at when its range check happens.
// A forced mover cannot decline, so the pre-move distance is NOT included for one;
// an "up to N" mover can always choose 0, so for those it is.
function reachableDistsForCard(card, dist, boostMods) {
  if (!card) return [dist];
  const spec = card.text ? parseBeforeMoverSpec(card.text) : null;
  const boostAdvance = (boostMods && card.type === 'normal' && boostMods.grantsNormalsBeforeAdvance)
    ? boostMods.grantsNormalsBeforeAdvance : 0;
  if (!spec && !boostAdvance) return [dist];
  const kind = spec ? spec.kind : 'advance';
  // A boost-granted "Before: Advance N" stacks with the card's own Before step; treating
  // the total as one move is the same approximation getMoverSlack always made.
  const amount = Math.min(BOARD_SIZE, (spec ? spec.amount : 0) + boostAdvance);
  const optional = spec ? spec.upTo : false;
  const out = optional ? [dist] : [];
  const from = optional ? 1 : amount;
  for (let a = from; a <= amount; a++) out.push(distanceAfterFreeMove(dist, a, kind));
  return out.length ? out : [dist];
}

// Can this card connect, set from `dist`, once its own Before-movement is taken into
// account? Replaces the "widen range[1] by the movement amount" approximation, which
// silently assumed movement only ever helps.
function cardReachesFrom(card, dist, boostMods, rangeMaxBonus) {
  if (!card || !card.range) return false;
  const lo = card.range[0], hi = card.range[1] + (rangeMaxBonus || 0);
  for (const d of reachableDistsForCard(card, dist, boostMods)) {
    if (d >= lo && d <= hi) return true;
  }
  return false;
}

function parseBeforeMoverAmount(text, defaultSlack = 2) {
  if (!text) return 0;
  // "as far as possible" is special — treated as board-spanning (same as moverAdvanceAmount).
  if (/Before: (?:Advance|Close) as far as possible/.test(text)) return 99;
  // Match "Before: Advance N", "Before: Close N", "Before: Advance/Close N or M" (take max),
  // "Before: Advance/Close up to N", etc.
  const match = text.match(/Before: (?:Advance|Close)\s+(?:up to\s+(\d+)|(\d+)\s+or\s+(\d+)|(\d+))/i);
  if (!match) return 0; // Found "Before: Advance/Close" but no number = can't quantify, skip.
  if (match[1]) return parseInt(match[1], 10); // "up to N"
  if (match[2] && match[3]) return Math.max(parseInt(match[2], 10), parseInt(match[3], 10)); // "N or M"
  if (match[4]) return parseInt(match[4], 10); // "N"
  return 0; // Unparseable, already handled above or fallback
}

function isEffectivelyInRange(card, dist, boostMods) {
  if (!card || !card.range) return false;
  const rangeMaxBonus = card.hooks && card.hooks.rangeMaxBonusIfInitiating ? card.hooks.rangeMaxBonusIfInitiating : 0;
  return cardReachesFrom(card, dist, boostMods, rangeMaxBonus);
}

// Find the distance that brings the most hand cards into (effective) range, so movement
// is purposeful instead of a fixed "always go to range 2" guess.
// Vega-specific positional nudge (deliberately narrow, not a generic positional-
// value system). His Innate/Exceed rewards setting a Special/Ultra while at the
// edge of the arena (BOARD_SIZE-1 or 0), but bestMoveTarget otherwise only
// reasons in relative distance, with no notion of absolute board position at
// all — so without this the AI would never deliberately retreat into a corner
// to unlock the bonus. Only the RETREAT direction maps unambiguously from
// distance back to an absolute resulting position (advancing can cross the
// opponent, so "distance X" doesn't pin down one position); this returns the
// distance that retreating to your own back edge would produce, or null if not
// applicable (not Vega, positions unknown, hand doesn't favor Specials/Ultras,
// or already on the same square).
function vegaEdgeTargetDistance(myCharacterKey, hand, currentDist, myPos, oppPos) {
  if (myCharacterKey !== 'vega' || myPos == null || oppPos == null || myPos === oppPos) return null;
  const specialsUltrasCount = hand.filter(c => c.type !== 'normal').length;
  if (hand.length === 0 || specialsUltrasCount * 2 < hand.length) return null; // hand must favor Specials/Ultras
  return myPos > oppPos
    ? currentDist + ((BOARD_SIZE - 1) - myPos) // retreat toward the high edge
    : currentDist + myPos;                     // retreat toward the low edge (position 0)
}

function bestMoveTarget(hand, currentDist, boostMods, myCharacterKey, myPos, oppPos) {
  const edgeTargetDist = vegaEdgeTargetDistance(myCharacterKey, hand, currentDist, myPos, oppPos);
  let best = null, bestCount = -1;
  for (let d = 1; d <= 8; d++) {
    let count = 0;
    for (const c of hand) if (isEffectivelyInRange(c, d, boostMods)) count++;
    // Small flat nudge toward the edge-retreat distance, on top of (never
    // instead of) actual in-range value — a distance with real reachable cards
    // still wins outright; this only breaks ties/near-ties in Vega's favor.
    if (edgeTargetDist === d) count += 1.5;
    if (count > bestCount || (count === bestCount && Math.abs(d - currentDist) < Math.abs(best - currentDist))) {
      bestCount = count; best = d;
    }
  }
  return { target: best, count: bestCount };
}

// Score a boost card's value (used when actually deciding which boost to play, instead
// of picking uniformly at random among every force-0 boost). Weighs continuous stat
// mods, card draw, and the tempo value of Focus's Reading / Block's naming.
// Deliberately does NOT value Cross's Run, Assault's Backstep, or Dive's Tech — those
// three have no stat mods, no draw, no naming clause, so this returns exactly 0 for
// them and they'd only ever get picked by tie-breaking noise. That's not a case of
// "these boosts have no value," it's that their value is entirely positional/
// situational and can't be read off the card in isolation — see
// scoreBoostCardContextual below, which is what call sites should actually use.
function scoreBoostCard(card) {
  const b = card.boost || {};
  const sm = b.statMods || {};
  let score = (sm.pow || 0) * 1.2 + (sm.spd || 0) * 0.8 + (sm.arm || 0) * 1.0 + (sm.grd || 0) * 0.8;
  if (b.ignoreArmorGrant) score += 2;
  if (b.nowDraw) score += b.nowDraw * 0.7;
  if (b.needsNormalNameChoice) score += 2.2; // Focus's Reading: forces a defense, strong tempo swing
  if (b.needsNameChoice) score += 1.6; // Block's naming: denies/reveals a card
  return score;
}

// The reachable resulting DISTANCES for Cross's Run ("Advance up to 3") or Assault's
// Backstep ("Retreat up to 4") from the current distance — null for anything else.
// Both are free (0 Force) movement, same as a card's own "Before: Advance"/"Close"
// hooks, so Run reuses the exact crossing arithmetic those already assume elsewhere
// in this file: advancing `amt` toward an opponent `dist` away stays on the same side
// (dist - amt) while amt < dist, then — since free movement's jump-over never costs
// extra, unlike the PAID Move action's simulateAdvance — lands on the opposite side
// (amt - dist + 1) once amt >= dist. Backstep has no crossing case; distance only
// grows. "Up to N" always includes 0 (not moving), so the current distance is
// included as a baseline reachable option in both cases.
function movementBoostReachableDist(cardKey, dist) {
  if (cardKey === 'cross') {
    const reachable = [dist];
    for (let amt = 1; amt <= 3; amt++) reachable.push(amt < dist ? dist - amt : amt - dist + 1);
    return reachable;
  }
  if (cardKey === 'assault') {
    const reachable = [dist];
    for (let amt = 1; amt <= 4; amt++) reachable.push(dist + amt);
    return reachable;
  }
  return null;
}

// Cross's Run / Assault's Backstep reposition for free but have no stat mods, draw,
// or naming clause for scoreBoostCard to read — their entire value is WHERE they put
// you, which needs the hand and current distance to evaluate at all. Mirrors
// bestMoveTarget's "which distance gets the most of my hand into range" logic,
// restricted to distances this specific boost can actually reach. Returns the
// IMPROVEMENT over staying put (not the raw in-range count), so a boost that
// wouldn't actually change anything correctly scores ~0, same baseline as every
// other boost. Returns null for any card that isn't one of these two, so callers can
// tell "not a movement boost" apart from "a movement boost worth 0 right now."
function scoreMovementBoostCard(card, hand, dist, boostMods) {
  const reachable = movementBoostReachableDist(card.key, dist);
  if (!reachable) return null;
  const countAt = (d) => hand.filter(c => isEffectivelyInRange(c, d, boostMods)).length;
  const currentCount = countAt(dist);
  let bestCount = currentCount;
  for (const d of reachable) { const c = countAt(d); if (c > bestCount) bestCount = c; }
  return Math.max(0, bestCount - currentCount) * 1.5;
}

// Dive's Tech (discard the opponent's active Continuous Boost) is worthless if they
// don't have one active right now — purely situational, valued off whatever's
// actually being denied. A player can have MULTIPLE continuous boosts active at once
// (nothing in this engine auto-replaces an older one when a new one is played, and
// boosts persist until consumed by that player's own next Strike or an expiry clause)
// — engine.discardOpponentContinuousBoost can target any of them by uid, so both this
// (valuing whether to play Dive at all) and chooseBoostTargetToDiscard below (choosing
// WHICH one, once Dive is being played) care about the same question: which currently-
// active opponent boost is most valuable to deny? Shared here so they can't disagree.
function bestOpponentBoostKey(oppBoostsInPlayKeys) {
  if (!oppBoostsInPlayKeys || oppBoostsInPlayKeys.length === 0) return null;
  let bestKey = null, bestScore = -Infinity;
  for (const key of oppBoostsInPlayKeys) {
    const targetCard = _cardByKeyMap.get(key);
    if (!targetCard) continue;
    const s = scoreBoostCard(targetCard);
    if (s > bestScore) { bestScore = s; bestKey = key; }
  }
  return bestKey;
}
function scoreTechBoostCard(oppBoostsInPlayKeys) {
  const key = bestOpponentBoostKey(oppBoostsInPlayKeys);
  if (!key) return 0;
  const targetCard = _cardByKeyMap.get(key);
  return targetCard ? scoreBoostCard(targetCard) * 1.1 : 0; // denying is at least as good as having it, small premium for tempo/information
}

// Dive's Tech target choice — which of the opponent's (possibly several) active
// continuous boosts to discard, once Dive is actually being played. Reuses
// bestOpponentBoostKey (same "which one's most valuable" logic scoreTechBoostCard
// uses to decide whether Dive is worth playing at all). Returns a card KEY, not a
// uid — this only ever sees PUBLIC info (oppPublic.boostsInPlay is a key list, not
// full entries with uids), so the caller (ui.js, which has full access to both
// players) is responsible for resolving the chosen key back to an actual
// boostsInPlay entry's uid before calling engine.playBoost. `randomness` (see
// AI_DIFFICULTIES) occasionally picks uniformly at random instead, same pattern as
// every other AI decision point.
function chooseBoostTargetToDiscard({ oppBoostsInPlayKeys, rng, randomness = 0 }) {
  if (!oppBoostsInPlayKeys || oppBoostsInPlayKeys.length === 0) return null;
  if (randomness > 0 && rng() < randomness) {
    return oppBoostsInPlayKeys[Math.floor(rng() * oppBoostsInPlayKeys.length)];
  }
  return bestOpponentBoostKey(oppBoostsInPlayKeys);
}

// Zato-1's Eddie placement ("place Eddie in a space within this attack's Range" /
// "in any space"). Eddie is what his Specials and Ultras are measured FROM, so the
// question is purely "from which space would my hand reach?" — every candidate space
// is scored by how many cards in hand cover the distance from it to the opponent,
// tie-broken toward standing next to the opponent (which keeps the short-range cards
// live even after they move a space, and is where the printed ranges cluster).
// Returns null when there is nothing to choose from; callers treat that as declining.
function chooseEddieSpace({ spaces, opponentPos, selfPos, handRanges, rng = Math.random, randomness = 0 }) {
  if (!spaces || spaces.length === 0) return null;
  if (randomness > 0 && rng() < randomness) return spaces[Math.floor(rng() * spaces.length)];
  const ranges = handRanges || [];
  let best = null;
  for (const space of spaces) {
    const d = Math.abs(space - opponentPos);
    let covered = 0;
    for (const r of ranges) if (d >= r.min && d <= r.max) covered++;
    // Distance 0 means Eddie is standing ON the opponent, which only the 0~1 cards can
    // use — hence the tie-break toward 1 rather than toward 0.
    const proximity = -Math.abs(d - 1) * 0.1;
    const score = covered + proximity + (selfPos != null ? -Math.abs(space - selfPos) * 0.001 : 0);
    if (!best || score > best.score) best = { score, space };
  }
  return best ? best.space : null;
}

// Context-aware boost scoring — the entry point call sites should actually use.
// scoreBoostCard alone can't value Run/Backstep/Tech (see their comments above): it
// has no visibility into the player's hand/distance or the opponent's active boosts.
// Strict superset of scoreBoostCard, not a separate path — everything else (Focus,
// Block, every character's continuous boosts) falls straight through unchanged.
function scoreBoostCardContextual(card, { hand, dist, oppBoostsInPlay, boostMods }) {
  const movement = scoreMovementBoostCard(card, hand, dist, boostMods);
  if (movement !== null) return movement;
  if (card.key === 'dive') return scoreTechBoostCard(oppBoostsInPlay);
  return scoreBoostCard(card);
}

// ---------------- Critical (see cards.js's header comment + engine.canPayCritical
// for the full rule) ----------------
// Decide whether to pay 1 Gauge for Critical on a card that's about to be set (either
// as the attacker's card or the defender's — both call this the same way). Only ever
// called after the caller has already confirmed eligibility via
// `engine.canPayCritical(player)`, so this doesn't re-check Street-Fighter/affordability
// itself. A real Critical effect is usually worth paying for; an empty one (no
// confirmed `critical` field on this card — see cards.js's "NOT YET CONFIRMED" list)
// is a pure bluff and only worth it rarely, for the deception value. `randomness` (see
// AI_DIFFICULTIES) occasionally overrides with a coin flip instead, same pattern as
// every other AI decision point. `ownerCharacterKey`/`dist` (both optional — omitting
// them just falls back to the old `!!card.critical` check) let `hasRealCriticalValue`
// also catch character-passive Critical grants that don't live on the card itself, e.g.
// Zangief's Innate/Exceeded at range 1 — see that function's comment for why this
// matters (Ultimate Atomic Buster/Spinning Piledriver/Siberian Blizzard have no
// `critical` field of their own but ARE a real Critical for him at range 1).
function chooseCriticalPayment({ card, rng, randomness = 0, ownerCharacterKey = null, dist = null, fromWildSwing = false }) {
  if (randomness > 0 && rng() < randomness) return rng() < 0.5;
  return rng() < criticalPayProbability(card, ownerCharacterKey, dist, fromWildSwing);
}

// ---------------- opening-hand mulligan (see engine.performMulligan) ----------------
// Score a card's raw stand-alone value — pow/spd/arm/grd weighted similarly to
// scoreBoostCard, a small bonus for a wide range band (easier to actually land), and a
// penalty for Ultras since they're dead weight against a starting Gauge of 0.
function scoreMulliganCard(card) {
  let score = (card.pow || 0) * 1.0 + (card.spd || 0) * 0.6 + (card.arm || 0) * 0.8 + (card.grd || 0) * 0.5;
  if (card.range) score += (card.range[1] - card.range[0]) * 0.4;
  if (card.type === 'ultra') score -= 3;
  return score;
}

// Decide which opening-hand cards to set aside. Sets aside anything scoring below a
// soft threshold, capped at half the hand (never mulligans the whole hand away — this
// stays a real, bounded decision rather than a coin flip that could reduce quality
// hand to a random one). `randomness` (see AI_DIFFICULTIES) occasionally replaces this
// with a random subset instead, same pattern as every other AI decision point.
function chooseMulliganSetAside(hand, rng, randomness = 0) {
  if (hand.length === 0) return [];
  if (randomness > 0 && rng() < randomness) {
    return hand.filter(() => rng() < 0.3).map(c => c.uid);
  }
  const scored = hand.map(c => ({ uid: c.uid, score: scoreMulliganCard(c) }));
  scored.sort((a, b) => a.score - b.score);
  const maxSetAside = Math.floor(hand.length / 2);
  const threshold = 3.5;
  const setAside = [];
  for (const s of scored) {
    if (setAside.length >= maxSetAside) break;
    if (s.score < threshold) setAside.push(s.uid);
  }
  return setAside;
}

// Fully-random legal action — used both as the difficulty "randomness" override and as
// the literal baseline a Warrior/Student sometimes falls back to. Mirrors the actions
// chooseAction can return (same shapes runAITurn expects).
function pickRandomLegalAction({ mePublicFull, canExceed, rng }) {
  const opts = ['prepare', 'move', 'changecards', 'strike'];
  if (mePublicFull.hand.length > 0) opts.push('boost');
  if (canExceed) opts.push('exceed');
  const pick = opts[Math.floor(rng() * opts.length)];
  if (pick === 'move') return { type: 'move', target: Math.floor(rng() * 9) };
  if (pick === 'changecards') return { type: 'changecards', n: 1 + Math.floor(rng() * Math.max(1, mePublicFull.hand.length)) };
  if (pick === 'boost') return { type: 'boost', uid: mePublicFull.hand[Math.floor(rng() * mePublicFull.hand.length)].uid };
  return { type: pick };
}

// ---------------- Boost-vs-strike timing ----------------
// A much cheaper stand-in for chooseStrikeCard's full nested best-response search
// (which is O(samples * myCandidates * sampledOpponentHandSize) — too expensive to
// run twice per chooseAction decision, see estimateBoostTimingValue below). Instead
// of finding the opponent's best response to each of my cards, this samples a
// single random plausible opponent card per draw and averages — a noisier,
// non-adversarial estimate, but since baseline and boosted both use the identical
// method, the bias mostly cancels out in the DELTA between them, which is all this
// is used for. O(samples * myCandidates) — no inner search over the opponent's hand.
function quickBestStrikeValue({ hand, myPos, oppPublic, rng, myBoostMods, myExceeded, myCharacterKey, samples }) {
  const validHand = hand.filter(c => isCardValidForStrike(myCharacterKey, myExceeded, c));
  if (!validHand.length) return 0;
  const ob = boostModsFromKeys(oppPublic.boostsInPlay);
  const oppExceeded = !!oppPublic.exceeded;
  const totals = validHand.map(() => 0);
  let n = 0;
  for (let s = 0; s < samples; s++) {
    const sampledHand = sampleOpponentHand(oppPublic, rng);
    if (!sampledHand.length) continue;
    const opp = sampledHand[Math.floor(rng() * sampledHand.length)];
    n++;
    for (let i = 0; i < validHand.length; i++) {
      totals[i] += evalMatchup({
        myCard: validHand[i], myPos, myBoostMods,
        oppCard: opp, oppPos: oppPublic.pos, oppBoostMods: ob,
        iInitiated: true, myExceeded, oppExceeded,
        myCharacterKey, oppCharacterKey: oppPublic.characterKey,
      });
    }
  }
  if (n === 0) return 0;
  let best = -Infinity;
  for (let i = 0; i < validHand.length; i++) {
    const avg = totals[i] / n;
    if (avg > best) best = avg;
  }
  return best;
}

// For a CONTINUOUS boost specifically (its value is entirely about improving a
// FUTURE strike, unlike a one-shot boost like Focus's Reading or Block's naming,
// whose value is direct and already captured by scoreBoostCard below), estimate
// whether playing it now is actually worth trading away — or delaying — this
// turn's strike. Compares "my best strike score with this card still in hand,
// unboosted" against "my best strike score with the card gone from hand (it's
// consumed into boostsInPlay) but its continuous effect now live" — via
// quickBestStrikeValue above rather than the full chooseStrikeCard machinery, since
// this runs on every non-strike decision where a continuous boost is in hand (not
// once per actual strike) and the full nested search measurably slowed the test
// suite by roughly an order of magnitude when tried directly.
// `iAmInitiator: true` is a simplifying assumption (this estimates "how good my
// next self-initiated strike looks," which is the natural planning frame for
// deciding whether to invest a turn in setup — it doesn't try to model whether
// the opponent strikes first before that happens). Returns a signed delta:
// positive means boosting looks like a real upgrade over striking with the hand
// as-is; negative means the card was doing more work staying in hand.
function estimateBoostTimingValue({ card, hand, myPos, oppPublic, rng, myBoostMods, myExceeded, myCharacterKey, samples = 12 }) {
  const boost = card.boost || {};
  const restHand = hand.filter(c => c.uid !== card.uid);
  if (restHand.length === 0) return 0; // nothing left to strike with afterward — not modeled, don't credit it
  const baseMods = myBoostMods || { pow: 0, spd: 0, arm: 0, grd: 0, ignoreArmor: false, rangeImmuneRanges: [], stunImmune: false, opponentPowMod: 0, hasOwnContinuousBoost: false };
  const dist = Math.abs(myPos - oppPublic.pos);

  // Cross's Run / Assault's Backstep change WHERE I strike from, not my stats — a
  // different shape of "what does boosting set up" than continuous boosts below, but
  // still exactly the question quickBestStrikeValue answers: my best achievable
  // strike, now from a different distance instead of with different stat mods.
  // Evaluates every distance the boost could reach (see movementBoostReachableDist)
  // and keeps the best, since "up to N" is the player's choice of amount.
  const reachable = movementBoostReachableDist(card.key, dist);
  if (reachable) {
    const baselineBest = quickBestStrikeValue({ hand, myPos, oppPublic, rng, myBoostMods: baseMods, myExceeded, myCharacterKey, samples });
    let bestAcrossReach = -Infinity;
    for (const d of reachable) {
      // Only the resulting DISTANCE matters to evalMatchup/quickBestStrikeValue (never
      // which side of the opponent it's on) — reconstructing a position at that
      // distance is enough, board-edge clamping isn't modeled here, same simplification
      // bestMoveTarget already accepts for the plain Move action.
      const simPos = oppPublic.pos + d;
      const v = quickBestStrikeValue({ hand: restHand, myPos: simPos, oppPublic, rng, myBoostMods: baseMods, myExceeded, myCharacterKey, samples });
      if (v > bestAcrossReach) bestAcrossReach = v;
    }
    return bestAcrossReach - baselineBest;
  }

  if (!boost.continuous) return 0;
  const baselineBest = quickBestStrikeValue({ hand, myPos, oppPublic, rng, myBoostMods: baseMods, myExceeded, myCharacterKey, samples });
  const sm = boost.statMods || {};
  const boostedMods = {
    pow: baseMods.pow + (sm.pow || 0), spd: baseMods.spd + (sm.spd || 0),
    arm: baseMods.arm + (sm.arm || 0), grd: baseMods.grd + (sm.grd || 0),
    ignoreArmor: baseMods.ignoreArmor || !!boost.ignoreArmorGrant,
    rangeImmuneRanges: [...(baseMods.rangeImmuneRanges || []), ...(boost.rangeImmuneRanges || [])],
    stunImmune: baseMods.stunImmune || !!boost.stunImmuneGrant,
    opponentPowMod: (baseMods.opponentPowMod || 0) + (boost.opponentPowMod || 0),
    // Playing THIS continuous boost now means the hypothetical post-boost state has
    // at least one Continuous Boost in play, regardless of what was already active —
    // unlocks C. Viper's Burst Time (noHitWithoutContinuousBoost) and Emergency
    // Combination (powBonusIfOwnContinuousBoost) in the simulated boostedBest strike
    // below, same as the real hasOwnContinuousBoost flag boostModsFromKeys computes.
    hasOwnContinuousBoost: true,
  };
  const boostedBest = quickBestStrikeValue({ hand: restHand, myPos, oppPublic, rng, myBoostMods: boostedMods, myExceeded, myCharacterKey, samples });
  return boostedBest - baselineBest;
}

// ================= three-turn lookahead planner =================
// The action policy below (`chooseAction`) is a one-turn heuristic: it scores what is
// good RIGHT NOW and rolls dice between the options. This planner sits on top of it and
// answers the harder question — "which action leaves me best off after my turn, the
// opponent's answer, and my turn after that?" — i.e. a real 3-turn (my/theirs/mine)
// search over the same abstract state the rest of this file already reasons about.
//
// HANDOFF.md §6 previously argued against building this, on the grounds that a deeper
// Monte Carlo search stacked on an already-noisy per-ply evaluator amplifies noise. That
// objection is answered structurally rather than ignored: the Monte Carlo part runs
// ONCE per decision, up front, producing a small table of expected exchange values
// ("what is my best Strike worth at distance d, initiating or defending"), and the tree
// search itself is then pure arithmetic over that table. So depth costs a few dozen
// table lookups, not a few dozen nested samplings — the failure mode that analysis
// warned about (noise compounding per ply) can't happen, because there is only one
// sampling stage total.
//
// Fairness is unchanged (see this file's header): the opponent is modelled from
// `publicInfoOf` plus `sampleOpponentHand`, never from their real hand.
const PLAN_CONFIG = {
  // Master switch, so a session can A/B the planner against the legacy one-turn policy
  // without editing call sites (tests/planner benchmarks flip this).
  enabled: true,
  oppHandSamples: 6,      // plausible opponent hands drawn once per decision
  oppResponseCap: 3,      // opponent cards considered as a best response to each of mine
  myCardCap: 6,           // my own candidate attacks per exchange evaluation
  moveTargets: 2,         // how far either way a Move is considered on THIS turn
  boostCandidates: 4,     // distinct Boost cards evaluated as separate first-turn actions
  // How hard to press when behind on life. The one-turn heuristic below the planner had
  // a `desperation` term that measured this and is unreachable in practice (the planner
  // answers on essentially every decision), so the idea is carried here instead. It is
  // applied to the whole LINE in planThreeTurns, never inside planEvaluate, because
  // test_ai_planner.js pins the life term to being exactly linear in the life lead.
  aggression: 0.22,
  // Third-turn Moves are held to one space either way. This is the search's main
  // pruning lever and it is deliberately on distance rather than on action type: every
  // new distance forces a fresh Monte Carlo table entry (the only expensive thing in
  // here), while the third turn's real question is "can I Strike well from roughly
  // here", which one space of slack answers.
  ply3MoveTargets: 2,
  discount: 0.8,          // a turn from now is worth slightly less than this turn
  // Terminal-state weights, all on the same scale as an exchange value (roughly
  // "net damage this exchange"), so the search never trades 6 damage for a tidier hand.
  w: {
    // Life is the win condition and the ONLY place damage is priced, so this weight sets
    // the exchange rate between "deal 1 more damage" and every positional term below.
    // At 0.5, a 5-damage exchange (2.5) is worth about what entering Exceed Mode is,
    // which is roughly the trade a strong player makes.
    // Re-tuned when the exchange table started reporting REAL damage instead of a net
    // scalar inflated by a flat "you connected" tempo bonus. Under the old numbers a
    // connecting strike scored about 1.0 while playing a continuous Boost scored about
    // 1.75, because a Boost collects `boost` + a persistent `strikeSetup` improvement
    // while a Strike has to pay for the damage it takes. The planner responded exactly
    // as the arithmetic told it to: 37% of all turns were Boosts, Strikes fell to 12%,
    // and games ran ~60% longer. Setup is POTENTIAL and only life is REALISED, so life
    // now outweighs setup rather than the other way round.
    life: 0.85,           // per point of life lead
    strikeSetup: 0.5,     // quality of the best Strike available from the final state
    range: 0.9,           // fraction of hand that can actually connect
    gauge: 0.35,          // per Gauge card (Ultras/Criticals/Exceed all draw on it)
    canExceed: 1.0,       // reaching a bankable Exceed threshold
    hand: 0.3,            // per card in hand, up to the character's max hand size
    overdraw: -0.6,       // per card above it (they get discarded at end of turn)
    boost: 0.3,           // per continuous Boost in play, ON TOP of its modelled grants
    // Exceed Mode is worth more than the stat deltas evalMatchup can see: most Innate/
// Exceed upgrades are hooks (extra draws, Advantage riders, free repositioning) that
    // the exchange table doesn't model at all, so the flat term carries that weight.
    exceeded: 2.5,        // being in Exceed Mode
    advantage: 1.5,       // acting again before the opponent does
    deckRisk: -1.5,       // deck about to run out with the Reshuffle already spent
    multiUse: 0.25,       // per card that is worth having as attack AND boost AND Force
    // What handing the opponent a turn is worth TO THEM when they don't attack with it.
    // Without this the model prices their turn only as a Strike risk, so a turn they
    // spend improving their position costs me nothing — which makes my own stalling
    // look free while theirs is harmless. Both players then have every incentive to set
    // up forever, and they did: average game length went from 32 turns to 45.
    oppTempo: 0.5,
  },
};

// A stable key for a set of boost modifiers, so the exchange-value table can memoize.
function planModsKey(m) {
  if (!m) return '0';
  return [m.pow | 0, m.spd | 0, m.arm | 0, m.grd | 0, m.ignoreArmor ? 1 : 0,
    m.stunImmune ? 1 : 0, m.opponentPowMod | 0, m.hasOwnContinuousBoost ? 1 : 0,
    (m.rangeImmuneRanges || []).join('.')].join(',');
}

// Merge a continuous Boost's grants into a set of modifiers — the same merge
// estimateBoostTimingValue does for its own one-card lookahead, factored out so both
// use identical semantics.
function planApplyBoostMods(base, boost) {
  const sm = (boost && boost.statMods) || {};
  return {
    pow: (base.pow || 0) + (sm.pow || 0), spd: (base.spd || 0) + (sm.spd || 0),
    arm: (base.arm || 0) + (sm.arm || 0), grd: (base.grd || 0) + (sm.grd || 0),
    ignoreArmor: !!base.ignoreArmor || !!(boost && boost.ignoreArmorGrant),
    rangeImmuneRanges: [...(base.rangeImmuneRanges || []), ...((boost && boost.rangeImmuneRanges) || [])],
    stunImmune: !!base.stunImmune || !!(boost && boost.stunImmuneGrant),
    opponentPowMod: (base.opponentPowMod || 0) + ((boost && boost.opponentPowMod) || 0),
    hasOwnContinuousBoost: true,
  };
}

// The single sampling stage. Builds the opponent-hand samples and the memoized
// exchange-value table every node in the tree reads from.
function buildPlanContext({ mePublicFull, oppPublic, myBoostMods, rng }) {
  const cfg = PLAN_CONFIG;
  const oppMods = boostModsFromKeys(oppPublic.boostsInPlay);
  const oppHands = [];
  const oppHandWeights = [];
  let oppWeightTotal = 0;
  for (let i = 0; i < cfg.oppHandSamples; i++) {
    const h = sampleOpponentHand(oppPublic, rng);
    if (!h.length) continue;
    // Same behaviour-conditioned weighting buildOpponentAnswerSet uses, so the planner
    // and the strike selector believe the same things about the opponent's hand.
    const w = handLikelihood(h, oppPublic.observations, oppMods);
    oppHands.push(h); oppHandWeights.push(w); oppWeightTotal += w;
  }
  if (!oppWeightTotal) oppWeightTotal = 1;
  const myHand = mePublicFull.hand.slice(0, cfg.myCardCap);
  const memo = new Map();
  const rangeMemo = new Map();
  const oppExceeded = !!oppPublic.exceeded;

  // Expected value (from MY point of view, in net-damage units) of an exchange at
  // `dist`, with me picking my best attack and the opponent picking their best answer
  // to it — a real max-min, not the noisier single-random-card estimate
  // quickBestStrikeValue uses, because here the result is reused across the whole tree
  // instead of being computed per candidate.
  // Returns the full record — value plus the damage figures the value was built from —
  // because the planner's life bookkeeping must not be derived from the net scalar (see
  // evalMatchup's header for why: a 6-for-5 trade nets +1 and used to be booked as
  // "opponent loses 1, I lose nothing", which made every race look like a clean win).
  const myGaugeCount = (mePublicFull.gauge || []).length;
  const oppGaugeCount = (oppPublic.gauge || []).length;
  function exchangeDetail(dist, mods, myExceeded, iInitiate) {
    const zero = { value: 0, myDmg: 0, oppDmg: 0 };
    if (!oppHands.length || !myHand.length) return zero;
    const key = dist + '|' + planModsKey(mods) + '|' + (myExceeded ? 1 : 0) + '|' + (iInitiate ? 1 : 0);
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    // Only the DISTANCE matters to evalMatchup, never which side of the opponent I am
    // on — reconstruct any position at that distance (the same simplification
    // estimateBoostTimingValue's movement branch already makes).
    const myPos = (oppPublic.pos + dist <= BOARD_SIZE - 1) ? oppPublic.pos + dist : oppPublic.pos - dist;
    let best = null;
    for (const myCard of myHand) {
      // Resource cost of committing this card, on the same terms chooseStrikeSelection
      // charges — otherwise the planner keeps valuing a 4-Gauge Ultra as free damage and
      // plans lines around a strike the strike-selector would never actually make.
      const gaugeCost = myCard.gaugeCost || 0;
      if (gaugeCost > myGaugeCount) continue; // can't pay: not a real option
      let totalV = 0, totalMy = 0, totalOpp = 0;
      for (let hi = 0; hi < oppHands.length; hi++) {
        const oppHand = oppHands[hi], hw = oppHandWeights[hi];
        let worst = null;
        const n = Math.min(cfg.oppResponseCap, oppHand.length);
        for (let i = 0; i < n; i++) {
          const d = evalMatchupDetail({
            myCard, myPos, myBoostMods: mods,
            oppCard: oppHand[i], oppPos: oppPublic.pos, oppBoostMods: oppMods,
            iInitiated: iInitiate, myExceeded, oppExceeded,
            myCharacterKey: mePublicFull.characterKey, oppCharacterKey: oppPublic.characterKey,
            myGaugeCount, oppGaugeCount,
          });
          if (!worst || d.value < worst.value) worst = d;
        }
        if (!worst) continue;
        totalV += worst.value * hw; totalMy += worst.myDmg * hw; totalOpp += worst.oppDmg * hw;
      }
      const k = oppWeightTotal;
      const rec = { value: totalV / k, myDmg: totalMy / k, oppDmg: totalOpp / k };
      if (!best || rec.value > best.value) best = rec;
    }
    if (!best) best = zero;
    memo.set(key, best);
    return best;
  }
  function exchangeValue(dist, mods, myExceeded, iInitiate) {
    // Kept returning a plain number: it is compared with === in test_ai_planner.js's
    // "opponent modelling stays inside public information" check, and several call sites
    // only ever want the scalar.
    return exchangeDetail(dist, mods, myExceeded, iInitiate).value;
  }

  // What the opponent's OWN best Strike at this distance is worth TO THEM. This has to
  // be measured from their side of the table, not as the negative of my defensive
  // number: evalMatchup adds a flat tempo bonus for connecting, so both players can
  // score positively in the same exchange — using my own defensive value as the
  // opponent-turn term made "stand where they can hit me" look like a BONUS, which is
  // exactly backwards and was the planner's single biggest error before this.
  function oppInitiateDetail(dist, myMods, myExceeded) {
    const zero = { value: 0, dmgToMe: 0 };
    if (!oppHands.length || !myHand.length) return zero;
    const key = 'O' + dist + '|' + planModsKey(myMods) + '|' + (myExceeded ? 1 : 0);
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    const myPos = (oppPublic.pos + dist <= BOARD_SIZE - 1) ? oppPublic.pos + dist : oppPublic.pos - dist;
    let total = 0, totalDmg = 0, seen = 0;
    for (let hi = 0; hi < oppHands.length; hi++) {
      const oppHand = oppHands[hi], hw = oppHandWeights[hi];
      let bestForThem = null;
      const n = Math.min(cfg.oppResponseCap, oppHand.length);
      for (let i = 0; i < n; i++) {
        // For each attack of theirs, I answer with my best defence — so this is their
        // max over my min, the mirror image of exchangeValue above.
        let worstForThem = null;
        for (const myCard of myHand) {
          const d = evalMatchupDetail({
            myCard: oppHand[i], myPos: oppPublic.pos, myBoostMods: oppMods,
            oppCard: myCard, oppPos: myPos, oppBoostMods: myMods,
            iInitiated: true, myExceeded: oppExceeded, oppExceeded: myExceeded,
            myCharacterKey: oppPublic.characterKey, oppCharacterKey: mePublicFull.characterKey,
            myGaugeCount: oppGaugeCount, oppGaugeCount: myGaugeCount,
          });
          if (!worstForThem || d.value < worstForThem.value) worstForThem = d;
        }
        if (worstForThem && (!bestForThem || worstForThem.value > bestForThem.value)) bestForThem = worstForThem;
      }
      // `myDmg` here is THEIR damage (they are in the "my" slot of this call), so the
      // damage that lands on me is what this side of the exchange deals.
      if (bestForThem) { total += bestForThem.value * hw; totalDmg += bestForThem.myDmg * hw; seen += hw; }
    }
    const rec = seen ? { value: total / seen, dmgToMe: totalDmg / seen } : zero;
    memo.set(key, rec);
    return rec;
  }
  function oppInitiateValue(dist, myMods, myExceeded) {
    return oppInitiateDetail(dist, myMods, myExceeded).value;
  }

  // How likely the opponent is to have something that connects at `dist` — drives both
  // "will they Strike on their turn" and "where will they try to stand".
  function oppInRangeFraction(dist) {
    const hit = rangeMemo.get(dist);
    if (hit !== undefined) return hit;
    let inRange = 0, total = 0;
    for (const h of oppHands) {
      for (const c of h) { total++; if (isEffectivelyInRange(c, dist, oppMods)) inRange++; }
    }
    const frac = total ? inRange / total : 0;
    rangeMemo.set(dist, frac);
    return frac;
  }

  // The mirror of oppInRangeFraction for my own hand — how many of MY cards connect
  // from a given distance. Uses the same effective-range test (which accounts for a
  // card's own Before-movement, e.g. a Close 2 attack really does reach further).
  const myRangeMemo = new Map();
  function myInRangeFraction(dist) {
    const hit = myRangeMemo.get(dist);
    if (hit !== undefined) return hit;
    let n = 0;
    for (const c of myHand) if (isEffectivelyInRange(c, dist, myBoostMods)) n++;
    const frac = myHand.length ? n / myHand.length : 0;
    myRangeMemo.set(dist, frac);
    return frac;
  }

  // The distance the opponent would most like to be at, within one turn's reach.
  let oppPreferredDist = Math.abs(mePublicFull.pos - oppPublic.pos);
  {
    let bestFrac = -1;
    const cur = oppPreferredDist;
    for (let d = Math.max(0, cur - 2); d <= Math.min(BOARD_SIZE - 1, cur + 2); d++) {
      const f = oppInRangeFraction(d);
      if (f > bestFrac) { bestFrac = f; oppPreferredDist = d; }
    }
  }

  return { cfg, exchangeValue, exchangeDetail, oppInitiateValue, oppInitiateDetail, oppInRangeFraction, myInRangeFraction, oppPreferredDist, oppMods, myHand, oppHands };
}

// The abstract state the search moves through. Deliberately small: everything the
// weights below read, and nothing else. Hand CONTENTS are not tracked per node — the
// exchange table is built from the root hand and `handFactor` discounts it as the hand
// shrinks, which is far cheaper than re-sampling per node and (unlike re-sampling)
// cannot introduce fresh noise deeper in the tree.
function planRootState(mePublicFull, oppPublic, myBoostMods) {
  const maxHand = (CHARACTERS[mePublicFull.characterKey] || {}).maxHandSize || 7;
  return {
    dist: Math.abs(mePublicFull.pos - oppPublic.pos),
    myLife: mePublicFull.life, oppLife: oppPublic.life,
    maxLife: mePublicFull.maxLife || 30, oppMaxLife: oppPublic.maxLife || 30,
    hand: mePublicFull.hand.length,
    maxHand,
    deck: mePublicFull.deck.length,
    gauge: mePublicFull.gauge.length,
    exceeded: !!mePublicFull.exceeded,
    advantage: !!mePublicFull.advantage,
    reshuffleUsed: !!mePublicFull.reshuffleUsed,
    continuous: mePublicFull.boostsInPlay.length,
    mods: myBoostMods || boostModsFromKeys([]),
    rootHandSize: Math.max(1, mePublicFull.hand.length),
    // How many attacks this line has already spent. The exchange table is built from
    // the root hand and always reports my BEST attack, so without this a plan that
    // Strikes twice would be credited with its best card twice over — Striking would
    // look free, which is precisely the bias that made an earlier draft of this planner
    // Strike on half of all turns and lose to the one-turn heuristic it replaced.
    usedAttacks: 0,
    exceedCost: (CHARACTERS[mePublicFull.characterKey] || {}).exceedCost || 2,
    // Cards that pull double or triple duty (a real attack, a real Boost, and Force
    // fodder) — counted once at the root, since the search doesn't track which
    // specific cards leave the hand.
    multiUse: mePublicFull.hand.filter(c => c.boost && (c.pow || 0) >= 3 && scoreBoostCard(c) >= 1.5).length,
    // Average Force per card across everything that can pay for a move (hand + Gauge).
    // Counted once at the root, like `multiUse` — the search doesn't know WHICH cards
    // leave the hand, so a per-card figure is the honest resolution available here.
    forcePerCard: (() => {
      const payers = [...mePublicFull.hand, ...mePublicFull.gauge];
      if (!payers.length) return 1;
      return payers.reduce((s, c) => s + planForceValueOf(c), 0) / payers.length;
    })(),
  };
}
function planClone(st) { return { ...st, mods: st.mods }; }

// A shrinking hand makes every "my best attack" number optimistic (the table was built
// from the root hand), so scale exchange values by how much of that hand is left.
function planHandFactor(st) {
  const size = Math.max(0.55, Math.min(1, st.hand / st.rootHandSize));
  return size * Math.pow(0.78, st.usedAttacks || 0);
}

// FORCE cost of moving to `target`: one Force per space, the same amount
// engine.simulateAdvance/retreatSelfPaid charge for a straight move. (Its extra charge for
// advancing THROUGH the opponent isn't reachable here — this search works in distances,
// and every candidate target stays on the near side.)
//
// Force is not the same as cards. An Ultra pays 2 Force (engine.js's forceValueOfCard),
// so a hand holding Ultras can afford moves that a card count says it can't, and pays for
// the ones it can with fewer cards. This function's return value was previously compared
// against, and subtracted from, raw card counts — mispricing every move made by a hand
// that wasn't all 1-Force cards. Callers must convert via planAvailableForce/planCardsForForce.
function planMoveCost(st, target) {
  return Math.abs(st.dist - target);
}

// The search tracks resources as card COUNTS (and deliberately lets them go fractional —
// see the `st.gauge += 0.7` for a banked attack), so Force is derived from those counts via
// the root's average Force-per-card rather than tracked as a second, separately-maintained
// field that every hand-size change would have to remember to update.
function planForceValueOf(card) { return card && card.type === 'ultra' ? 2 : 1; }
function planAvailableForce(st) { return (st.hand + st.gauge) * (st.forcePerCard || 1); }
function planCardsForForce(st, force) { return force / (st.forcePerCard || 1); }

// Candidate actions from a "my turn" node. Deliberately the same action vocabulary
// chooseAction already returns, so a plan can be handed straight back to ui.js.
// `boosts` is a LIST of candidate boosts, each `{card, reposition?, staticValue?}`.
// It used to be a single `topBoost`, drawn only from the "timing relevant" set
// (continuous boosts plus Run/Backstep) — so Focus's Reading and Block's naming could
// never be a planner candidate at all, and, worse, chooseAction then re-picked WHICH
// card to boost with from the full hand afterwards. The planner therefore decided to
// Boost because of card X's modelled stat grants and then played card Y, whose effects
// the plan had never evaluated. A single `topBoost` object is still accepted (and
// `null`), because test_ai_planner.js calls this directly with one.
function planCandidateActions(st, ctx, mePublicFull, canExceed, boosts, windowOverride) {
  const acts = [{ type: 'strike' }]; // with an empty hand this is the forced Wild Swing
  const window = windowOverride === undefined ? ctx.cfg.moveTargets : windowOverride;
  // Distance 0 is not a legal board state (two fighters never share a space), so the
  // closest a Move can ever target is 1.
  for (let d = Math.max(1, st.dist - window); d <= Math.min(BOARD_SIZE - 1, st.dist + window); d++) {
    if (d === st.dist) continue;
    const cost = planMoveCost(st, d);
    if (cost > 0 && cost <= planAvailableForce(st)) acts.push({ type: 'move', target: d });
  }
  acts.push({ type: 'prepare' });
  if (st.hand > 0) acts.push({ type: 'changecards', n: Math.min(2, st.hand) });
  const boostList = !boosts ? [] : (Array.isArray(boosts) ? boosts : [boosts]);
  if (st.hand > 0) {
    for (const b of boostList.slice(0, ctx.cfg.boostCandidates)) {
      acts.push({ type: 'boost', uid: b.card.uid, _boost: b });
    }
  }
  if (canExceed && !st.exceeded && st.gauge >= st.exceedCost) acts.push({ type: 'exceed' });
  const char = CHARACTERS[mePublicFull.characterKey];
  if (char && char.action) {
    const cost = char.actionForceCost || 0;
    if (cost <= planAvailableForce(st)) acts.push({ type: 'action', _spec: char.action, _forceCost: cost });
  }
  return acts;
}

// Apply one of my actions. Returns the immediate expected score of taking it plus the
// resulting state. Life changes are approximated from the exchange value's sign (the
// table returns a net swing, not separate damage figures) — good enough for the terms
// that actually read life here (kill proximity and the life-lead weight).
function planApplyMyAction(st0, act, ctx, extra) {
  const st = planClone(st0);
  let gain = 0;
  if (act.type === 'strike') {
    // Both sides of the exchange are applied from the real damage figures. Deriving
    // both life totals from the single net scalar (the previous implementation) deleted
    // every mutual trade: a 6-for-5 became "opponent loses 1, I lose 0", so the search
    // could not tell a safe poke from a race it was losing.
    // No `gain` here on purpose: an exchange's whole effect is the life swing, and life
    // is priced exactly once, by planEvaluate's `life` weight, at the leaf.
    const ex = ctx.exchangeDetail(st.dist, st.mods, st.exceeded, true);
    const f = planHandFactor(st);
    st.oppLife = Math.max(0, st.oppLife - ex.myDmg * f);
    st.myLife = Math.max(0, st.myLife - ex.oppDmg * f);
    st.gauge += 0.7;      // a connecting attack banks itself; a miss discards
    st.usedAttacks = (st.usedAttacks || 0) + 1;
    st.deck = Math.max(0, st.deck - 1);
    st.advantage = false; // whoever wins the exchange is resolved by the engine, not guessed here
  } else if (act.type === 'move') {
    // `cost` is in Force; what leaves hand/Gauge is CARDS, which is fewer whenever the
    // payers average more than 1 Force each (Ultras).
    const cards = Math.min(st.hand + st.gauge, planCardsForForce(st, planMoveCost(st, act.target)));
    const fromHand = Math.min(cards, st.hand);
    st.hand -= fromHand;
    st.gauge = Math.max(0, st.gauge - (cards - fromHand));
    st.dist = act.target;
    st.hand += 1; st.deck = Math.max(0, st.deck - 1); // end-of-turn draw
  } else if (act.type === 'prepare') {
    st.hand += 2; st.deck = Math.max(0, st.deck - 2); // Prepare draws 1, plus the end-of-turn draw
  } else if (act.type === 'changecards') {
    st.hand += 1; st.deck = Math.max(0, st.deck - (act.n + 1));
    // Trading dead cards for live ones is real but small — priced well under a point of
    // life so it can never outbid an actual exchange.
    //
    // Booked into `st.quality`, which planEvaluate reads at the LEAF, rather than as an
    // immediate `gain`. That asymmetry is why the planner never once chose Prepare: an
    // immediate gain is undiscounted while Prepare's whole benefit (two extra cards) is
    // a leaf term multiplied by d^2 = 0.64, so Change Cards' 0.30 always beat Prepare's
    // 0.19 on where the reward was booked rather than on merit. Measured: 0 Prepares in
    // 400 sampled planner decisions before this, and 514 Change Cards in 100 real games.
    st.quality = (st.quality || 0) + 0.15 * act.n;
  } else if (act.type === 'boost') {
    st.hand -= 1;
    const boost = act._boost && act._boost.card.boost;
    if (boost && boost.continuous) {
      st.mods = planApplyBoostMods(st.mods, boost);
      st.continuous += 1;
    }
    // A movement Boost (Cross's Run, Assault's Backstep) buys position, not stats — the
    // planner has to actually move for it, or "boost" scores as a wasted turn and the
    // whole class is invisible to the search.
    if (act._boost && act._boost.reposition != null) st.dist = act._boost.reposition;
    // Focus's Reading and Block's naming have no stat effect at all; their value is
    // information and denial. Priced through the same leaf-evaluated quality channel as
    // Change Cards so it can't jump the discount queue.
    if (act._boost && act._boost.staticValue) st.quality = (st.quality || 0) + act._boost.staticValue * 0.2;
    // The card spent on a Boost is one the hand no longer has as an attack. The
    // end-of-turn draw replaces the COUNT (so st.hand is unchanged) but not necessarily
    // the quality, and the exchange table always reports the root hand's best attack —
    // so charge Boosting a partial share of the same decay a Strike pays in full.
    st.usedAttacks = (st.usedAttacks || 0) + 0.5;
    // NOTE: no separate credit for the boost's timing delta here — playing it merges its
    // grants into st.mods, which every downstream exchangeValue lookup already reads.
    // Adding estimateBoostTimingValue on top double-counted the same benefit and made
    // the planner buy Boosts roughly a third of all turns.
    st.hand += 1; st.deck = Math.max(0, st.deck - 1);
  } else if (act.type === 'exceed') {
    st.gauge = Math.max(0, st.gauge - st.exceedCost);
    st.exceeded = true;
    st.hand += 1; st.deck = Math.max(0, st.deck - 1);
  } else if (act.type === 'action') {
    // Same leaf-booking as Change Cards above, for the same reason.
    st.quality = (st.quality || 0) + ((extra && extra.actionScore) || 0);
    // Character actions that reposition and then always Strike (Baiken's Pull, I-No's
    // Advance, Giovanna's free Strike) are modelled as exactly that — declared on the
    // action itself in cards.js rather than inferred here, so the planner never has to
    // call a resolve() that mutates real game state. `planning` (added to every
    // character action in cards.js) is the current home for this; the older top-level
    // `planCloses`/`alwaysStrikes` fields are still read as a fallback so the two can't
    // silently disagree.
    const spec = act._spec || {};
    const plan = spec.planning || {};
    // The paid actions ([1] for Baiken/I-No/Jack-O') cost Force, which this branch used to
    // ignore entirely — so in the plan they were free, and a hand that could barely afford
    // one looked identical to a hand that could. Same conversion as the move branch.
    if (act._forceCost > 0) {
      const cards = Math.min(st.hand + st.gauge, planCardsForForce(st, act._forceCost));
      const fromHand = Math.min(cards, st.hand);
      st.hand -= fromHand;
      st.gauge = Math.max(0, st.gauge - (cards - fromHand));
    }
    const closes = plan.closes != null ? plan.closes : spec.planCloses;
    const alwaysStrikes = plan.alwaysStrikes != null ? plan.alwaysStrikes : spec.alwaysStrikes;
    if (closes) st.dist = Math.max(1, st.dist - closes);
    if (plan.draws) { st.hand += plan.draws; st.deck = Math.max(0, st.deck - plan.draws); }
    if (plan.gauges) st.gauge += plan.gauges;
    if (alwaysStrikes) {
      const ex = ctx.exchangeDetail(st.dist, st.mods, st.exceeded, true);
      const f = planHandFactor(st);
      st.oppLife = Math.max(0, st.oppLife - ex.myDmg * f);
      st.myLife = Math.max(0, st.myLife - ex.oppDmg * f);
      st.gauge += 0.7;
      st.usedAttacks = (st.usedAttacks || 0) + 1;
    }
    st.hand += 1; st.deck = Math.max(0, st.deck - 1);
  }
  return { st, gain };
}

// The opponent's turn, folded into a single expected-value step rather than a branch:
// they Strike with a probability driven by how much of their plausible hand reaches me
// at this distance, otherwise they reposition toward the range they want. Keeping this
// as an expectation (instead of two child nodes) is what keeps a 3-turn search cheap
// without losing the thing that matters — that a state which hands them a free Strike
// is scored as the liability it is.
function planApplyOppTurn(st0, ctx) {
  const st = planClone(st0);
  if (st.advantage) { st.advantage = false; return { st, gain: 0 }; } // I act again first
  // Their turn is worth to me exactly minus what it is worth to them. `planHandFactor`
  // cuts the other way here: a thinner hand of mine means worse answers, so their
  // Strike is worth MORE.
  const theirDetail = ctx.oppInitiateDetail(st.dist, st.mods, st.exceeded);
  const theirEv = theirDetail.value / planHandFactor(st);
  // How likely they are to take the Strike: they need something that reaches me AND a
  // reason to want the exchange. Modelling only the first half (as an earlier draft did)
  // treats a hopeless attack into my best defence as just as likely as a winning one.
  const appetite = Math.max(0.15, Math.min(1, 0.35 + theirEv * 0.25));
  const pStrike = Math.max(0, Math.min(0.9, ctx.oppInRangeFraction(st.dist) * 0.85 * appetite));
  // Never credit myself for a Strike they would decline: an opponent turn is at best
  // neutral for me, so this term is a cost or nothing. Without the clamp, a distance
  // where their attacks are bad scores as a BONUS for standing there, which is the
  // opposite of how Range works in this game.
  // Same accounting as my own Strike: the cost of their turn is the life it takes off
  // me, priced at the leaf, not a separate bonus/penalty here.
  const gain = 0;
  // The life this costs me is the DAMAGE their best attack deals, not the net value of
  // the exchange to them — the same separation the strike branch above now makes.
  st.myLife = Math.max(0, st.myLife - pStrike * Math.max(0, theirDetail.dmgToMe) / planHandFactor(st));
  // A turn they spend NOT attacking is a turn they spend improving — priced through the
  // same leaf-evaluated channel as every other non-life term, so it can't jump the
  // discount queue. `gain` deliberately stays 0 (test_ai_planner.js pins an opponent
  // turn to never being scored as a gift, and this is a cost, not a gift).
  st.quality = (st.quality || 0) - ctx.cfg.w.oppTempo * (1 - pStrike);
  // If they don't Strike they close/back off toward their preferred band.
  const drift = (1 - pStrike) * 0.5;
  st.dist = Math.round(st.dist + (ctx.oppPreferredDist - st.dist) * drift);
  st.dist = Math.max(0, Math.min(BOARD_SIZE - 1, st.dist));
  return { st, gain };
}

// Static evaluation of a leaf state. Everything the brief asks the AI to care about —
// Range, Gauge efficiency, hand quality, continuous Boosts, Exceed Mode, Advantage and
// Strike setup — is a term here, and each is weighted in the same net-damage units the
// exchange table produces so they trade against each other honestly.
function planEvaluate(st, ctx) {
  const w = ctx.cfg.w;
  let v = 0;
  v += w.life * ((st.myLife - st.oppLife));
  if (st.oppLife <= 0) v += 25;
  if (st.myLife <= 0) v -= 25;
  v += w.strikeSetup * ctx.exchangeValue(st.dist, st.mods, st.exceeded, true) * planHandFactor(st);
  // Range quality is deliberately separate from the Strike term above: strikeSetup
  // rewards having ONE good attack here, this rewards having OPTIONS — a distance where
  // most of the hand can connect is far harder for the opponent to play around. Net of
  // how much of THEIR hand reaches me from the same spot, which is the other half of
  // what "good Range" means in this game.
  v += w.range * (ctx.myInRangeFraction(st.dist) - 0.5 * ctx.oppInRangeFraction(st.dist));
  const usefulGauge = Math.min(st.gauge, st.exceedCost);
  v += w.gauge * usefulGauge + w.gauge * 0.4 * Math.max(0, st.gauge - st.exceedCost);
  if (!st.exceeded && st.gauge >= st.exceedCost) v += w.canExceed;
  const withinHand = Math.min(st.hand, st.maxHand);
  v += w.hand * withinHand + w.overdraw * Math.max(0, st.hand - st.maxHand);
  v += w.boost * st.continuous;
  if (st.exceeded) v += w.exceeded;
  if (st.advantage) v += w.advantage;
  if (st.deck <= 2 && st.reshuffleUsed) v += w.deckRisk;
  v += w.multiUse * Math.min(st.multiUse, st.hand);
  // Everything an action was worth beyond its state change — hand quality traded up by
  // Change Cards, a character action's own merit, the denial value of Reading/naming.
  // All of it is booked here, at the leaf, so no action can win by having its reward
  // credited earlier in the tree than a rival's (see planApplyMyAction's changecards
  // branch for the Prepare-never-chosen bug this fixes).
  v += (st.quality || 0);
  return v;
}

// The search itself: my turn -> their answer -> my turn -> evaluate. Pure arithmetic
// over the tables built once in buildPlanContext, so the whole thing is a few dozen
// lookups; the third turn is beam-limited to the actions that looked best on the first,
// which is where the pruning the brief asks for lives.
function planThreeTurns({ mePublicFull, oppPublic, canExceed, rng, myBoostMods, topBoost, boosts, actionScore }) {
  const ctx = buildPlanContext({ mePublicFull, oppPublic, myBoostMods, rng });
  if (!ctx.oppHands.length || !ctx.myHand.length) return null;
  const root = planRootState(mePublicFull, oppPublic, myBoostMods);
  const extra = { actionScore };
  const boostCandidates = boosts || topBoost;
  const first = planCandidateActions(root, ctx, mePublicFull, canExceed, boostCandidates);
  if (!first.length) return null;
  const d = ctx.cfg.discount;
  // Press harder when behind, bank resources when ahead — the life-awareness the
  // unreachable one-turn heuristic used to carry. Applied to the LINE's total damage
  // swing rather than inside planEvaluate, so the leaf evaluation stays exactly linear
  // in the life lead (pinned by test_ai_planner.js).
  const maxLife = root.maxLife || 30, oppMaxLife = root.oppMaxLife || 30;
  const desperation = Math.max(-1, Math.min(1, ((root.oppLife / oppMaxLife) - (root.myLife / maxLife)) * 2));

  let bestAct = null, bestScore = -Infinity;
  for (const a1 of first) {
    const r1 = planApplyMyAction(root, a1, ctx, extra);
    const r2 = planApplyOppTurn(r1.st, ctx);
    // Third turn: expand the same vocabulary again, beam-limited by a cheap static
    // pre-score so the branching factor stays flat instead of squaring.
    const third = planCandidateActions(r2.st, ctx, mePublicFull, canExceed && !r2.st.exceeded,
      boostCandidates, ctx.cfg.ply3MoveTargets);
    let bestThird = -Infinity, bestLeafState = null;
    for (const a3 of third) {
      const r3 = planApplyMyAction(r2.st, a3, ctx, extra);
      const leaf = r3.gain + planEvaluate(r3.st, ctx);
      if (leaf > bestThird) { bestThird = leaf; bestLeafState = r3.st; }
    }
    if (bestThird === -Infinity) { bestThird = planEvaluate(r2.st, ctx); bestLeafState = r2.st; }
    let total = r1.gain + d * r2.gain + d * d * bestThird;
    if (bestLeafState) {
      const dealt = root.oppLife - bestLeafState.oppLife;
      const taken = root.myLife - bestLeafState.myLife;
      total += ctx.cfg.aggression * desperation * (dealt - taken);
    }
    if (total > bestScore) { bestScore = total; bestAct = a1; }
  }
  if (!bestAct) return null;
  // Strip the planner's own bookkeeping before handing the action back to ui.js.
  const out = { type: bestAct.type };
  if (bestAct.type === 'move') out.target = bestAct.target;
  if (bestAct.type === 'changecards') out.n = bestAct.n;
  // The uid is the planner's own choice now, not a hint to be re-decided downstream.
  if (bestAct.type === 'boost') out.uid = bestAct.uid;
  return { action: out, score: bestScore };
}

// ---------------- non-strike action heuristic (full info about itself, public info about opponent) ----------------
// `randomness` (see AI_DIFFICULTIES): with that probability, skip all evaluation below
// and just take a uniform-random legal action instead. `myBoostMods` (the AI's OWN
// currently-active continuous boosts, full info about itself like everything else this
// function receives) feeds the boost-timing lookahead above — defaults to a zeroed set
// so any call site that hasn't been updated still works (just skips crediting stacking
// with existing boosts, never over-values).
// Generic, data-driven scorer for a character's per-turn Innate/Exceeded action.
//
// This used to be a chain of `characterKey === '...'` branches — which violates the
// project's own architecture rule (HANDOFF §4b: never branch on characterKey outside
// cards.js) and, more practically, meant every new character with an action needed a
// matching edit here or scored -Infinity forever. The per-character knowledge now lives
// on `CHARACTERS[key].action.planning` in cards.js; this reads it.
//
// (Worth recording, because the opposite was assumed at the start of this work: only 9
// of the 40 characters in CHARACTERS have an `action` at all, and they are exactly the 9
// the old chain covered. The -Infinity default only ever fired for genuinely passive
// characters, where it is correct — render.js's actionButtons() doesn't even draw a
// button for them. So this is an architecture fix, not a coverage fix.)
function scoreCharacterAction(characterKey, ctx) {
  const { mePublicFull, dist, handCount, inRangeCount } = ctx;
  const char = CHARACTERS[characterKey];
  if (!char || !char.action) return -Infinity;
  const plan = char.action.planning;
  if (!plan) return scoreCharacterActionLegacy(characterKey, ctx);

  // Affordability first: an action the AI can't pay for must never be chosen, or
  // ui.js's runAITurn picks 'action' and then silently skips the turn.
  const cost = char.actionForceCost || 0;
  if (cost > 0 && (mePublicFull.hand.length + mePublicFull.gauge.length) < cost) return -Infinity;

  // Hard preconditions — an action whose effect can't happen is a wasted turn (and, for
  // the paid ones, a wasted Force payment too).
  if (plan.needsDeck && mePublicFull.deck.length === 0 && mePublicFull.discard.length === 0) return -Infinity;
  if (plan.needsContinuousBoostInHand) {
    const sources = mePublicFull.exceeded ? [...mePublicFull.hand, ...mePublicFull.gauge] : mePublicFull.hand;
    if (!sources.some(c => c && c.boost && c.boost.continuous)) return -Infinity;
  }
  if (plan.wantsFullHand && handCount === 0) return -Infinity;
  // An action that commits to a Strike with nothing that can connect, and no
  // repositioning of its own to fix that, is a guaranteed whiff.
  if (plan.alwaysStrikes && !plan.closes && inRangeCount === 0) return -Infinity;

  let value = plan.base != null ? plan.base : 0.2;
  if (plan.wantsOutOfRange && inRangeCount === 0) value += 0.4;
  if (plan.wantsInRange) value += inRangeCount > 0 ? 0.15 : -0.4;
  if (plan.wantsThinHand && handCount <= 3) value += 0.2;
  if (plan.wantsFullHand) {
    if (handCount >= 4) value += 0.15;
    // Gauge-conversion actions matter most when Exceed is still out of reach.
    if (mePublicFull.gauge.length < (char.exceedCost || 2)) value += 0.25;
  }
  if (plan.mayStrike && mePublicFull.exceeded) value += 0.15;
  if (plan.exceededBonus && mePublicFull.exceeded) value += plan.exceededBonus;
  return value;
}

// The pre-`planning` scoring chain, kept as a fallback for any character whose action
// has no metadata yet (adding one should be a cards.js edit, not an ai.js one).
function scoreCharacterActionLegacy(characterKey, { mePublicFull, oppPublic, dist, life, maxLife, oppLife, oppMaxLife, handCount, inRangeCount }) {
  const char = CHARACTERS[characterKey];
  if (!char || !char.action) return -Infinity;

  // Ryu's action: Move 1 (free repositioning every turn).
  if (characterKey === 'ryu') {
    const { target: bestMove } = bestMoveTarget(mePublicFull.hand, dist);
    // Value increases if this move gets more cards in range, decreases if we'd be moving away from that target.
    // Simple heuristic: moving toward bestMove distance is almost always worth it (free card advantage potential).
    const moveValue = Math.abs(dist - bestMove) > 0 ? 0.4 : -0.1;
    return moveValue;
  }

  // Ken's action: Close 1, draw 1. Enhanced by Exceed: Close 1 + draw 1, then may Strike.
  if (characterKey === 'ken') {
    // Close is almost always useful (get in range faster), draw is always good (more options).
    let actionValue = 0.3;
    // Bonus if we're out of range (Close gets us in).
    if (inRangeCount === 0) actionValue += 0.4;
    // Big bonus if exceeded and we can chain into a Strike (mayStrike: true).
    if (mePublicFull.exceeded) actionValue += 0.3;
    return actionValue;
  }

  // Actions with a real [1] Force cost (Baiken/I-No/Jack-O, see HANDOFF.md §6) are only
  // worth scoring if the AI can actually pay it — otherwise ui.js's runAITurn would pick
  // 'action' and then silently skip the turn when it can't afford it. Same shallow
  // "any single card works" affordability check the rest of this heuristic uses (actual
  // Force-value accounting happens later, in ui.js's pickForceUidsForTarget).
  const cost = char.actionForceCost || 0;
  if (cost > 0 && (mePublicFull.hand.length + mePublicFull.gauge.length) < cost) return -Infinity;

  // Baiken's action: Pull 2 (Innate stops adjacent; Exceed may cross), then always
  // Strike (+1POW if Exceeded — actionStrikePowBonus). Unlike Ryu/Ken, this always
  // commits to a Strike this turn, so it's most valuable when the hand is otherwise
  // out of range (the Pull fixes that) — same "no deeper lookahead" simplification
  // level as Ryu/Ken above.
  if (characterKey === 'baiken') {
    let actionValue = 0.2;
    if (inRangeCount === 0) actionValue += 0.4;
    if (mePublicFull.exceeded) actionValue += 0.1;
    return actionValue;
  }

  // I-No's action: Advance 2, then always Strike (+1POW if Exceeded) — same shape as
  // Baiken's above, just Advance instead of Pull.
  if (characterKey === 'ino') {
    let actionValue = 0.2;
    if (inRangeCount === 0) actionValue += 0.4;
    if (mePublicFull.exceeded) actionValue += 0.1;
    return actionValue;
  }

  // Jack-O's action: forced Continuous Boost play (uncancelable) from hand (or hand+
  // Gauge if Exceeded), then always Strike. Only worth taking when a Continuous Boost
  // is actually available — mirrors the action's own no-op-if-none check in cards.js,
  // otherwise it burns the [1] Force for nothing.
  if (characterKey === 'jacko') {
    const sources = mePublicFull.exceeded ? [...mePublicFull.hand, ...mePublicFull.gauge] : mePublicFull.hand;
    const hasContinuousBoost = sources.some(c => c && c.boost && c.boost.continuous);
    if (!hasContinuousBoost) return -Infinity;
    return 0.3;
  }

  // Giovanna's action: Strike with "Hit: Draw N" (wired via actionStrikeHitHook). No
  // repositioning component (unlike Baiken/I-No), so it's only worth it when something's
  // already in range — otherwise it's just a guaranteed whiff.
  if (characterKey === 'giovanna') {
    if (inRangeCount === 0) return -Infinity;
    return mePublicFull.exceeded ? 0.3 : 0.15;
  }

  // Bang's action: "Look at the top 2 cards of your deck, draw 1, discard the other."
  // Free selective card draw with no downside beyond spending the turn — worth about
  // as much as Ryu's free Move, and worth slightly more when the hand is thin or
  // nothing is in range (a filtered draw is the best fix available for both).
  if (characterKey === 'bang') {
    if (mePublicFull.deck.length === 0 && mePublicFull.discard.length === 0) return -Infinity;
    let actionValue = 0.35;
    if (handCount <= 3) actionValue += 0.2;
    if (inRangeCount === 0) actionValue += 0.1;
    return actionValue;
  }

  // Faust's action: forced Boost from the top of the deck (uncancelable), then Strike
  // if a Boost card came up. Value is speculative (the AI can't see the deck's top
  // card ahead of time), so scored modestly — same "no deeper lookahead" spirit as
  // this function's other branches — and only when there's a card left to reveal.
  if (characterKey === 'faust') {
    if (mePublicFull.deck.length === 0) return -Infinity;
    return 0.1;
  }

  // M. Bison's action: "Add [up to N] card(s) from hand to Gauge, draw that many" —
  // pure card-economy conversion (Gauge is valuable for Exceed/Ultras/Criticals), no
  // Force cost. Worth more with a fuller hand (more spare cards to convert) and when
  // Gauge is running low relative to Exceed cost.
  if (characterKey === 'mbison') {
    if (handCount === 0) return -Infinity;
    const gaugeLow = mePublicFull.gauge.length < (char.exceedCost || 2);
    let actionValue = 0.15;
    if (gaugeLow) actionValue += 0.25;
    if (handCount >= 4) actionValue += 0.15;
    return actionValue;
  }

  // Default: unknown action type, don't score it.
  return -Infinity;
}

// Prepare (draw 1, free) vs ChangeCards (discard N, draw N) both put a fresh card in
// hand, but ChangeCards actually gets rid of dead weight first — cards that are neither
// boosts nor currently reachable. Prepare is only the smarter pick when the hand doesn't
// have much dead weight to shed; otherwise it's strictly worse than ChangeCards for the
// same "get a new card" goal, since it leaves the dead card sitting in hand.
function preferChangeCardsOverPrepare(hand, dist, boostMods) {
  const handCount = hand.length;
  if (handCount < 2) return false;
  const deadCount = hand.filter(c => !c.boost && !isEffectivelyInRange(c, dist, boostMods)).length;
  return deadCount >= Math.ceil(handCount / 2);
}

// Is there a strike from here that kills through the opponent's best answer? Uses the
// same evaluator the strike selector uses, so "the AI thinks this is lethal" and "the AI
// would actually pick this card" cannot disagree. Deliberately conservative: it takes
// the MINIMUM damage across their plausible answers, so a maybe-kill doesn't fire it.
function certainLethal({ mePublicFull, oppPublic, dist, myBoostMods, rng }) {
  if (!mePublicFull.hand.length || oppPublic.life <= 0) return false;
  const mb = myBoostMods || boostModsFromKeys([]);
  const myGauge = (mePublicFull.gauge || []).length;
  // Fast-path: if no affordable card can possibly reach oppPublic.life even with boost/edge/critical headroom, skip sampling.
  let maxUpperPow = -Infinity;
  for (const card of mePublicFull.hand) {
    if ((card.gaugeCost || 0) > myGauge) continue;
    const upper = (card.pow || 0) + (mb.pow || 0) + 5;
    if (upper > maxUpperPow) maxUpperPow = upper;
  }
  if (maxUpperPow < oppPublic.life) return false;
  const ob = boostModsFromKeys(oppPublic.boostsInPlay);
  const oppGauge = (oppPublic.gauge || []).length;
  const answers = buildOpponentAnswerSet(oppPublic, rng, 16);
  if (!answers.length) return false;
  for (const card of mePublicFull.hand) {
    if ((card.gaugeCost || 0) > myGauge) continue; // an Ultra we can't pay for isn't a strike
    let worst = Infinity;
    for (const a of answers) {
      const d = evalMatchupDetail({
        myCard: card, myPos: mePublicFull.pos, myBoostMods: mb,
        oppCard: a.card, oppPos: oppPublic.pos, oppBoostMods: ob,
        iInitiated: true, myExceeded: !!mePublicFull.exceeded, oppExceeded: !!oppPublic.exceeded,
        myCharacterKey: mePublicFull.characterKey, oppCharacterKey: oppPublic.characterKey,
        myGaugeCount: myGauge, oppGaugeCount: oppGauge,
      });
      if (d.myDmg < worst) worst = d.myDmg;
      if (worst < oppPublic.life) break;
    }
    if (worst >= oppPublic.life) return true;
  }
  return false;
}

// Every zero-Force Boost in hand, ranked, annotated with what the three-turn planner
// needs to model it as a distinct candidate action:
//   `reposition`  — the distance a movement Boost (Run/Backstep) would move me to
//   `staticValue` — the non-positional, non-stat value of the card (Reading's forced
//                   defence, Block's naming, Tech's denial), which has no state effect
//                   for the planner to simulate and would otherwise score as zero.
function buildBoostCandidates(mePublicFull, dist, oppPublic, myBoostMods, hand) {
  const ctx = { hand, dist, oppBoostsInPlay: oppPublic.boostsInPlay, boostMods: myBoostMods };
  const out = [];
  for (const card of hand) {
    if (!card.boost || card.boost.force !== 0) continue;
    const score = scoreBoostCardContextual(card, ctx);
    const entry = { card, score };
    const reachable = movementBoostReachableDist(card.key, dist);
    if (reachable) {
      // Pick the distance that brings the most of the rest of the hand into range —
      // the same question bestMoveTarget answers for the paid Move action.
      let best = dist, bestCount = -1;
      for (const d of reachable) {
        const count = hand.filter(c => c.uid !== card.uid && isEffectivelyInRange(c, d, myBoostMods)).length;
        if (count > bestCount) { bestCount = count; best = d; }
      }
      entry.reposition = best;
    } else if (!card.boost.continuous) {
      entry.staticValue = score;
    }
    out.push(entry);
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

function canPayExactForce(cards, targetForce, excludeUid = null) {
  if (targetForce <= 0) return targetForce === 0;
  let ones = 0, twos = 0;
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    if (c.uid === excludeUid) continue;
    if (c.type === 'ultra') twos++;
    else ones++;
  }
  return targetForce <= ones + 2 * twos && (targetForce % 2 === 0 || ones > 0);
}

// `usePlanner` defaults to the global switch; a caller can force it off for one side to
// A/B the three-turn planner against the legacy one-turn heuristic in the same game.
function isNativeActionLegal(action, me, opp, canExceed) {
  if (!action || !action.type) return false;
  const pool = [...(me.hand || []), ...(me.gauge || [])];
  if (action.type === 'exceed') return !!canExceed;
  if (action.type === 'reshuffle') return !me.reshuffleUsed;
  if (action.type === 'action') {
    const char = CHARACTERS[me.characterKey];
    if (!char || !char.action) return false;
    const cost = char.actionForceCost || 0;
    return cost === 0 || canPayExactForce(pool, cost);
  }
  if (action.type === 'boost') {
    if (typeof action.cardKey !== 'string') return false;
    const card = (me.hand || []).find(c => c.key === action.cardKey && c.boost);
    if (!card) return false;
    const cost = card.boost.force || 0;
    return cost === 0 || canPayExactForce(pool, cost, card.uid);
  }
  if (action.type === 'move') {
    if (!Number.isInteger(action.targetSpace) || action.targetSpace < 0 || action.targetSpace > 8) return false;
    if (action.targetSpace === me.pos || (opp && action.targetSpace === opp.pos)) return false;
    const forceCost = Math.abs(action.targetSpace - me.pos);
    return canPayExactForce(pool, forceCost);
  }
  if (action.type === 'changecards') {
    return Number.isInteger(action.n) && action.n >= 1 && canPayExactForce(pool, action.n);
  }
  if (action.type === 'burst') {
    return typeof action.cardKey === 'string' &&
      (me.boostsInPlay || []).some(entry => entry.card && entry.card.key === action.cardKey && entry.card.boost && entry.card.boost.grantsBurstAction);
  }
  return action.type === 'strike' || action.type === 'prepare';
}

function chooseAction({ me, mePublicFull, oppPublic, canExceed, rng, randomness = 0, myBoostMods, usePlanner = PLAN_CONFIG.enabled, turnNumber = 0 }) {
  // Native/WASM planning is opt-in until it clears the differential promotion gate.
  // It receives a detached, canonical snapshot only; a bad or unavailable backend
  // returns null and this established JS policy remains the safe fallback.
  if (typeof NativeCpuAI !== 'undefined' && NativeCpuAI.isModernActive()) {
    const snap = NativeCpuAI.decisionSnapshot(mePublicFull, oppPublic, canExceed, {
      turnNumber,
      seed: Math.floor(rng() * 0x7fffffff),
      activePlayer: 'actor',
    });
    const nativeAction = NativeCpuAI.chooseNeutralAction(snap);
    if (nativeAction && isNativeActionLegal(nativeAction, mePublicFull, oppPublic, canExceed)) {
      const resolved = NativeCpuAI.resolveNativeActionToEngineAction(nativeAction, mePublicFull);
      if (resolved) return resolved;
    }
  }
  if (rng() < randomness) return pickRandomLegalAction({ mePublicFull, canExceed, rng });

  const dist = Math.abs(mePublicFull.pos - oppPublic.pos);
  const life = mePublicFull.life;
  const maxLife = mePublicFull.maxLife || 30;
  const oppLife = oppPublic.life;
  const oppMaxLife = oppPublic.maxLife || 30;
  const handCount = mePublicFull.hand.length;

  if (certainLethal({ mePublicFull, oppPublic, dist, myBoostMods, rng })) return { type: 'strike' };

  const burstBoost = mePublicFull.boostsInPlay.find(b => b.card.boost && b.card.boost.grantsBurstAction);
  if (burstBoost) return { type: 'burst', boostUid: burstBoost.card.uid };

  if (!mePublicFull.reshuffleUsed && mePublicFull.deck.length <= 1 && mePublicFull.discard.length >= 3) {
    return { type: 'reshuffle' };
  }

  if (handCount === 0) return { type: 'strike' }; // forced wild swing

  const inRangeCount = mePublicFull.hand.filter(c => isEffectivelyInRange(c, dist, myBoostMods)).length;
  const actionScore = scoreCharacterAction(mePublicFull.characterKey, {
    mePublicFull, oppPublic, dist, life, maxLife, oppLife, oppMaxLife, handCount, inRangeCount,
  });

  if (usePlanner) {
    const planned = planThreeTurns({
      mePublicFull, oppPublic, canExceed, rng, myBoostMods,
      boosts: buildBoostCandidates(mePublicFull, dist, oppPublic, myBoostMods, mePublicFull.hand),
      actionScore: actionScore > -Infinity ? actionScore : 0,
    });
    if (planned) {
      const act = planned.action;
      if (act.type === 'action' && mePublicFull.characterKey === 'ryu') {
        const { target: bestMove } = bestMoveTarget(mePublicFull.hand, dist);
        act.direction = dist > bestMove ? 'advance' : (dist < bestMove ? 'retreat' : (rng() < 0.5 ? 'advance' : 'retreat'));
      }
      if (act.type === 'boost' && !mePublicFull.hand.some(c => c.uid === act.uid)) {
        return { type: 'prepare' };
      }
      if (act.type === 'action' && actionScore === -Infinity) return { type: 'prepare' };
      return act;
    }
  }

  // Minimal safe fallback when planner is disabled or no opponent samples are available
  if (inRangeCount === 0) {
    const { target, count } = bestMoveTarget(mePublicFull.hand, dist, myBoostMods, mePublicFull.characterKey, mePublicFull.pos, oppPublic.pos);
    if (count > 0 && target !== dist) return { type: 'move', target };
    if (preferChangeCardsOverPrepare(mePublicFull.hand, dist, myBoostMods)) {
      return { type: 'changecards', n: Math.min(2, handCount) };
    }
    return { type: 'prepare' };
  }
  return { type: 'strike' };
}



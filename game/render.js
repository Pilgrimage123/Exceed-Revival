// ============================================================
// RENDER — pure DOM rendering, no game logic
// ============================================================
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

// ---------------- Beginner onboarding copy (MODE_HELP / TERM_HELP) ----------------
// Every human decision in this game is a named G.mode (see ui.js). MODE_HELP gives
// each mode a short, plain-language explanation of what's being asked and what the
// trade-off is — rendered as a `.coach-panel` immediately above the bottom panel by
// coachPanelHTML() below. Kept here (not in ui.js) because it's presentation copy,
// not game state — same reasoning as every other player-facing string in this file.
// Three entries get extra care per the shared onboarding contract: grasp_choice and
// block_force_choice are the shared Normals every fighter has (a beginner meets them
// before any character-specific card), and name_choice covers Focus naming a Normal
// to force a defense or a reveal.
const MODE_HELP = {
  mulligan_select: {
    title: 'Mulligan: swap out cards you don’t want',
    body: 'Before the game starts, set aside any cards from your opening hand and draw fresh replacements — it’s free, one-time, and there’s no downside except giving up cards you might have wanted after all. Set-aside cards are shuffled back into your deck, not lost.',
  },
  awaiting_action: {
    title: 'Choose your action',
    body: 'Each turn you pick exactly one action: draw a card (Prepare), reposition (Move), refresh your hand (Change Cards), play a card face up for its effect (Boost), or set a card face down to attack (Strike). There’s no “do nothing” and normally no second action, so pick what your hand needs most right now.',
  },
  strike_select: {
    title: 'Set your attack face down',
    body: 'Pick one card to set face down — your opponent won’t see it until both cards flip together. Watch each card’s range chip: it checks the card’s printed range against your CURRENT distance, but a card with a Before: move can be out of range now and in range once it actually activates.',
  },
  defend_select: {
    title: 'Choose your defense',
    body: 'The CPU already set its attack face down. Pick a card to set as your defense — both cards reveal together and resolve by Speed, so you’re guessing blind just like the CPU is. A lower-Guard or slower card can still work if it out-ranges or out-races theirs, but a bad mismatch can leave you Stunned.',
  },
  strike_result: {
    title: 'See how the Strike played out',
    body: 'This walks through the engine’s actual resolution order: reveal, compare live stats against printed stats, decide who activates first by Speed, check range, apply damage, check Stun, then send both cards to Gauge (hit) or Discard (miss). Step through it to see exactly why the numbers came out the way they did.',
  },
  discard_to_seven: {
    title: 'Hand size limit: 7',
    body: 'You can never hold more than 7 cards, so when you go over you must discard down to the limit. Pick whatever you’re least likely to use — a discarded card just goes to your discard pile, it isn’t removed from the game.',
  },
  move_setup: {
    title: 'Move: reposition for Force',
    body: 'Move lets you Advance toward or Retreat away from your opponent, paying Force per space from cards in hand or Gauge. Good positioning decides which of your OTHER cards are even in range next Strike, so it’s rarely a wasted turn.',
  },
  move_force_select: {
    title: 'Pay for your Move',
    body: 'Choose which cards pay the Force cost — hand or Gauge both work, and an Ultra counts as 2 Force instead of 1. Whatever you select here is spent (discarded), so weigh a card’s usefulness against needing this repositioning now.',
  },
  boost_select: {
    title: 'Boost: play a card for its effect',
    body: 'Boost plays a card face up for its ongoing or one-time effect instead of attacking with it. A Continuous Boost keeps helping every future Strike until it’s discarded or expires, but any Force cost on the boost text still has to be paid separately.',
  },
  boost_force_select: {
    title: 'Pay for your Boost',
    body: 'Choose which cards pay this Boost’s Force cost, from hand or Gauge — an Ultra is worth 2 Force, everything else 1. Cards spent this way are discarded once you confirm.',
  },
  changecards_setup: {
    title: 'Change Cards: refresh your hand',
    body: 'Spend cards as Force and draw one card per Force spent — useful when your hand is full of cards that are out of range or situationally dead. An Ultra is worth 2 Force, so spending one draws 2. Choose how many cards to spend first, then pick which.',
  },
  changecards_select: {
    title: 'Pick which cards to spend',
    body: 'These are the cards you’re trading away, from hand or Gauge; replacements are drawn sight unseen. Keep whatever is still useful at your current range, and remember an Ultra spent here is worth 2 cards drawn.',
  },
  grasp_choice: {
    title: 'Grasp: push or pull your opponent',
    body: 'This is one of the four Normals every fighter shares — it doesn’t attack, it repositions your opponent by force. Pushing them away opens up your longer-range cards; pulling them in sets up your close-range ones, so pick the direction that puts your OTHER cards back in range next turn.',
  },
  block_force_choice: {
    title: 'Block: pay Force for Armor',
    body: 'Another shared Normal — instead of attacking, Block spends Force (discarding cards from hand) for extra Armor, reducing the damage of whatever your opponent set. Each Force spent is +2 Armor; spend enough to avoid a Stun-level hit, but every card spent here is a card you can’t use later.',
  },
  name_choice: {
    title: 'Name a card',
    body: 'This forces a specific outcome tied to one exact card by name — usually a shared Normal like Grasp, Block, or Dodge. If the CPU used Focus to name one of YOUR cards, you’re now required to defend with exactly that card (or reveal you don’t have it); naming a card yourself works the other way, constraining the CPU’s options instead.',
  },
  cancel_choice: {
    title: 'Cancel: chain another action?',
    body: 'This Boost is Cancelable — pay 1 Gauge to immediately take another action instead of ending your turn. Chaining has no built-in limit as long as each Boost you play is also Cancelable and you keep affording the Gauge, but every Gauge spent here is Gauge you don’t have for a Critical or Ultra later.',
  },
  sustain_choice: {
    title: 'Sustain your Boost?',
    body: 'A Continuous Boost normally gets discarded once you use a Normal card, but you didn’t use one this Strike — so you get the option to keep it active instead. There’s no cost to sustain; the only reason to decline is if you’d rather see it go to discard on purpose.',
  },
  place_eddie_choice: {
    title: 'Place Eddie',
    body: 'Eddie is a second marker on the board that belongs to you but isn’t a fighter — nothing collides with him and he never moves on his own. While he is in play your Specials and Ultras measure their Range from HIS space instead of yours, so put him where your attacks need to reach from, usually right next to the opponent. Your Specials also send him away again during Cleanup, so most turns start by placing him again with a Normal.',
  },
  eddie_space_choice: {
    title: 'Place Eddie',
    body: 'This Boost places Eddie anywhere on the board. He is where your Specials and Ultras measure their Range from, so the space next to the opponent is usually the strongest choice — it keeps your short-range cards live even if they step away.',
  },
  face_up_choice: {
    title: 'Set your attack face up?',
    body: 'Setting face up reveals your card to the CPU BEFORE it chooses its defense — a real information disadvantage — in exchange for a stat bonus from your character’s Innate. Only take it if that bonus is worth giving away the surprise.',
  },
  may_strike_choice: {
    title: 'Strike right now?',
    body: 'You’re being offered a bonus Strike outside the normal turn flow. Take it if you have a good card in range and the tempo is worth it — declining costs you nothing, it just skips the chance.',
  },
  critical_choice: {
    title: 'Pay 1 Gauge for Critical?',
    body: 'Paying 1 Gauge activates ALL of this card’s “Critical:” text for this Strike only — extra stats, extra effects, sometimes immunities. You can pay even on a card with no Critical text at all, purely to bluff the opponent into thinking you have one.',
  },
  name_range_choice: {
    title: 'Name a Range',
    body: 'Pick a range number rather than a specific card — the effect applies to every card whose printed range includes that number. Think about which range band actually matters for this exchange.',
  },
  set_time_option_choice: {
    title: 'Innate option — pay now?',
    body: 'Your character’s Innate lets you pay a small cost right as you set this attack for an extra effect, applying only to this one Strike. It’s optional — skip it if you’d rather save the resource.',
  },
};

// One glossary, used everywhere a stat/keyword/resource tooltip is shown — driven
// off card data behavior, not a paraphrase of the rules text (HANDOFF.md invariant
// #5: player-facing card text comes from the card data, never a new invented string).
const TERM_HELP = {
  'Range': 'How far apart (in spaces) the fighters must be for this card to be able to hit — checked against the card’s printed range when it activates.',
  'Power': 'This card’s damage output before the defender’s Armor is subtracted.',
  'Speed': 'Decides which card activates first this Strike — higher Speed goes first.',
  'Armor': 'Subtracted from the attacker’s Power to find the actual damage taken.',
  'Guard': 'If the damage taken exceeds this, the defender is Stunned and their set card is discarded without resolving.',
  'Gauge cost': 'Ultra Strikes cost Gauge to set — paid from cards already sitting in your Gauge pile.',
  'Force cost': 'Force to Boost this card is paid by discarding cards from your hand or Gauge — an Ultra counts as 2 Force, everything else as 1.',
  'Cancelable': 'After this Boost resolves, you may spend 1 Gauge to immediately take another action instead of ending your turn.',
  'Hand': 'Cards you’re currently holding and can play.',
  'Deck': 'Cards left to draw — empties into your discard pile via Reshuffle, once per game.',
  'Gauge': 'Cards a Strike sent here after landing a hit — spend them on Force costs, Criticals, and Ultra Strikes.',
  'Discard': 'Cards a Strike sent here after missing, or that were discarded to pay a cost.',
  'Overdrive': 'A BlazBlue resource that loses one card at the start of each of this fighter’s turns; when it empties, they Revert.',
  'Actions': 'Extra actions this fighter can still take this turn before it ends.',
  'Before': 'Runs when this card activates, before the range/hit check — often a move.',
  'Hit': 'Runs only if this card actually connects.',
  'After': 'Runs after this card’s Hit step, whether or not it hit.',
  'Now': 'Runs immediately when this card is set, before anything else in the Strike.',
  'Cleanup': 'Runs at the very end of the Strike, once both cards have fully resolved.',
  'Critical': 'Street Fighter fighters only: applies if you paid 1 Gauge for Critical when setting this attack.',
};

// Renders one mode's coach tip as a `.coach-panel`, expanded/collapsed per ui.js's
// coachExpanded(key) (first-view-expanded, collapsed-after, toggle overrides — see
// the shared onboarding contract). Pure read: no mutation happens here, the toggle
// itself is a ui.js onclick handler (toggleCoach) that re-renders afterward. Modes
// with no MODE_HELP entry (the many rare/character-specific yields not worth a tip)
// simply render nothing, rather than a blank/placeholder panel.
function coachPanelHTML(modeKey) {
  const help = MODE_HELP[modeKey];
  if (!help) return '';
  const expanded = typeof isCoachExpanded === 'function' ? isCoachExpanded(modeKey) : coachExpanded(modeKey);
  return `<div class="coach-panel${expanded ? '' : ' collapsed'}">
    <div class="coach-head" onclick="toggleCoach('${modeKey}')">
      <span class="coach-title">${esc(help.title)}</span>
      <span class="coach-toggle">${expanded ? '▾' : '?'}</span>
    </div>
    ${expanded ? `<div class="coach-body">${esc(help.body)}</div>` : ''}
  </div>`;
}

// Pure read of G.hintText / G.trainerReport / G.studyMode populated by ui.js.
// Beginner Coach shows plain-language advice; Study Mode additionally renders
// NativeDiagnostics (topLines, nashMix, beliefThreats) or a clean partial-matchup note.
function trainerPanelHTML(G) {
  if (!G || (!G.hintText && !G.trainerReport)) return '';
  const report = G.trainerReport;
  const text = G.hintText || (report && report.text) || '';
  let out = text ? `<div class="hint-panel"><b>Hint:</b> ${esc(text)}</div>` : '';
  if (G.studyMode && report) {
    const d = report.diagnostics;
    if (d) {
      const parts = [];
      if (Array.isArray(d.topLines) && d.topLines.length) {
        parts.push('<b>Top lines:</b> ' + d.topLines.map(l => `${esc(l.label)} (${l.visits || 0}v, Q=${Number(l.qValue || 0).toFixed(2)})`).join(' · '));
      }
      if (Array.isArray(d.nashMix) && d.nashMix.length) {
        parts.push('<b>Nash mix:</b> ' + d.nashMix.map(m => `${esc(m.label)} ${Math.round(Number(m.probability || 0) * 100)}%`).join(' · '));
      }
      if (Array.isArray(d.beliefThreats) && d.beliefThreats.length) {
        parts.push('<b>Opponent threats:</b> ' + d.beliefThreats.map(t => `${esc(t.cardKey)} (${Math.round(Number(t.probAtLeastOne || 0) * 100)}% hold, ${Math.round(Number(t.probExReady || 0) * 100)}% EX)`).join(' · '));
      }
      if (parts.length) out += `<div class="hint-panel">${parts.join('<br>')}</div>`;
    } else if (report.note) {
      out += `<div class="hint-panel">${esc(report.note)}</div>`;
    }
  }
  return out;
}

// Original, generic fighting-stance silhouettes (NOT derived from any character's
// actual artwork — simple geometric "action figure" pictograms, distinguished only by
// pose). Poses are a named registry here in render.js (the "how to draw" concern);
// which pose a character uses is a data field (CHARACTERS[key].silhouettePose in
// cards.js — the "which pose" concern), so adding a new fighter needs at most a new
// one-line pose entry here (or none — it falls back to a default pose automatically).
const SILHOUETTE_STROKE = 'fill="none" stroke="currentColor" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"';
const SILHOUETTE_POSES = {
  // Grounded, roughly symmetric low guard stance.
  grounded_guard: `
    <circle cx="50" cy="15" r="11" fill="currentColor"/>
    <path d="M38,26 L62,26 L58,74 L42,74 Z" fill="currentColor"/>
    <path d="M45,74 L28,110 L18,146" ${SILHOUETTE_STROKE}/>
    <path d="M55,74 L72,110 L82,146" ${SILHOUETTE_STROKE}/>
    <path d="M40,32 L20,46 L30,24" ${SILHOUETTE_STROKE}/>
    <path d="M60,32 L80,46 L70,24" ${SILHOUETTE_STROKE}/>
  `,
  // Leaning stance, front leg chambered up/out, asymmetric guard.
  leaning_chamber: `
    <circle cx="50" cy="16" r="11" fill="currentColor"/>
    <path d="M40,26 L64,24 L58,72 L44,74 Z" fill="currentColor"/>
    <path d="M48,74 L44,112 L40,146" ${SILHOUETTE_STROKE}/>
    <path d="M56,72 L76,63 L90,78" ${SILHOUETTE_STROKE}/>
    <path d="M42,30 L20,38 L14,20" ${SILHOUETTE_STROKE}/>
    <path d="M62,32 L78,50 L70,60" ${SILHOUETTE_STROKE}/>
  `,
};
const SILHOUETTE_DEFAULT_POSE = 'grounded_guard';

// FIGHTER_PHOTOS and FIGHTER_HEADSHOTS live in game/portraits.js (bundled before render.js).
function isHeadshotPortraitMode() {
  return typeof UXSettings !== 'undefined' && typeof UXSettings.get === 'function' && !!UXSettings.get('headshotPortraits');
}
const _fighterPhotoUrlCache = {};
function fighterPhotoSrc(characterKey, opts) {
  const forceFull = !!(opts && opts.forceFull);
  const useHeadshot = !forceFull && isHeadshotPortraitMode() && !!FIGHTER_HEADSHOTS[characterKey];
  const raw = useHeadshot ? FIGHTER_HEADSHOTS[characterKey] : FIGHTER_PHOTOS[characterKey];
  if (!raw) return null;
  const cacheKey = characterKey + (useHeadshot ? ':headshot' : ':full');
  if (_fighterPhotoUrlCache[cacheKey]) return _fighterPhotoUrlCache[cacheKey];
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && typeof Blob !== 'undefined' && typeof atob === 'function') {
    const comma = raw.indexOf(',');
    if (comma !== -1) {
      const mimeMatch = raw.slice(0, comma).match(/data:([^;]+)/);
      const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      const bin = atob(raw.slice(comma + 1));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
      _fighterPhotoUrlCache[cacheKey] = url;
      return url;
    }
  }
  _fighterPhotoUrlCache[cacheKey] = raw;
  return raw;
}
function fighterSilhouette(characterKey, extraClass) {
  const src = fighterPhotoSrc(characterKey);
  if (src) {
    const useHeadshot = isHeadshotPortraitMode() && !!FIGHTER_HEADSHOTS[characterKey];
    const kind = useHeadshot ? 'headshot' : 'full';
    return `<img class="fighter-silhouette fighter-photo ${extraClass || ''}" data-portrait-kind="${kind}" data-fighter-key="${characterKey || ''}" src="${src}" alt="" aria-hidden="true"/>`;
  }
  const char = CHARACTERS[characterKey];
  const poseKey = (char && char.silhouettePose && SILHOUETTE_POSES[char.silhouettePose]) ? char.silhouettePose : SILHOUETTE_DEFAULT_POSE;
  const body = SILHOUETTE_POSES[poseKey];
  return `<svg class="fighter-silhouette ${extraClass || ''}" viewBox="0 0 100 150" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
}

const STAT_META = {
  rng: { short: 'R', label: 'RNG', full: 'Range', helpKey: 'Range' },
  pow: { short: 'P', label: 'POW', full: 'Power', helpKey: 'Power' },
  spd: { short: 'S', label: 'SPD', full: 'Speed', helpKey: 'Speed' },
  arm: { short: 'A', label: 'ARM', full: 'Armor', helpKey: 'Armor' },
  grd: { short: 'G', label: 'GRD', full: 'Guard', helpKey: 'Guard' },
};

function statIconSVG(key) {
  switch (key) {
    case 'rng': // Crosshair / Target
      return '<svg class="stat-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="4.5"/><path d="M8 1.5v2.2M8 12.3v2.2M1.5 8h2.2M12.3 8h2.2"/><circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none"/></svg>';
    case 'pow': // Impact Sword
      return '<svg class="stat-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.5 2.5L6.2 9.8M13.5 2.5L10.5 2.8M13.5 2.5L13.2 5.5M4.8 8.4l2.8 2.8M2.5 13.5l2.8-2.8"/></svg>';
    case 'spd': // Lightning Bolt
      return '<svg class="stat-ico" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M9.4 1.5L3.2 9h4.1l-1.1 5.5L12.8 7H8.6l.8-5.5z"/></svg>';
    case 'arm': // Shield
      return '<svg class="stat-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.8l5 2v4.3c0 3.1-2.1 5.2-5 6.2-2.9-1-5-3.1-5-6.2V3.8l5-2z"/></svg>';
    case 'grd': // Bastion Crest (Stun Resistance)
      return '<svg class="stat-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.8 3.2h2.2v1.8h2V3.2h2v1.8h2V3.2h2.2v4.8c0 3-2.1 5.2-5.2 6.2-3.1-1-5.2-3.2-5.2-6.2V3.2z"/><path d="M5.6 8.8l1.6 1.6 3.2-3.2"/></svg>';
    default:
      return '';
  }
}

function statPillHTML(key, val, opts = {}) {
  const meta = STAT_META[key] || { short: key.toUpperCase(), label: key.toUpperCase(), full: key, helpKey: '' };
  const label = opts.showFullLabel ? meta.label : meta.short;
  const helpTitle = opts.title || (meta.helpKey && TERM_HELP[meta.helpKey]) || meta.full;
  const extra = opts.extraClass ? ` ${opts.extraClass}` : '';
  return `<span class="stat stat-pill stat-${key} ${key}${extra}" data-stat="${key}" title="${esc(helpTitle)}">${statIconSVG(key)}<span class="stat-k">${label}</span><span class="stat-v">${esc(String(val))}</span></span>`;
}

function statLine(c, opts = {}) {
  const rng = c.range ? (c.range[0] === c.range[1] ? c.range[0] : `${c.range[0]}\u2013${c.range[1]}`) : '\u2014';
  const bits = [
    statPillHTML('rng', rng, opts),
    statPillHTML('pow', c.pow, opts),
    statPillHTML('spd', c.spd, opts),
    statPillHTML('arm', c.arm, opts),
    statPillHTML('grd', c.grd, opts),
  ];
  return bits.join('');
}

// Cost badges shown directly on a card — Gauge cost (paying to STRIKE with an
// Ultra) sits next to the name, Force cost (paying to BOOST with this card) sits
// next to the boost text, since that's the half of the card each cost actually
// belongs to. A zero cost is never displayed (a free boost shows no badge at all,
// same "don't show a cost that isn't real" rule as an Ultra's absent gaugeCost on
// every non-Ultra card) — spelled out ("3 Gauge"/"1 Force") rather than a bare
// number since both badges can appear close together and a bare "[1]" wouldn't say
// which currency it's in.
function gaugeCostBadge(c) {
  return c.type === 'ultra' ? ` <span class="gauge-cost" title="${esc(TERM_HELP['Gauge cost'])}">[${c.gaugeCost} Gauge]</span>` : '';
}
function forceCostBadge(c) {
  const force = (c.boost && c.boost.force) || 0;
  return force > 0 ? `<span class="force-cost" title="${esc(TERM_HELP['Force cost'])}">[${force} Force]</span> ` : '';
}

// Bolds the inline "keyword:" clauses a card's own text uses as mini-headers —
// Before:/Hit:/After:/Now:/Cleanup:/Critical: (plus the compound "Critical, Before:"/
// "Critical, After:" forms) — so a card's structure is easier to scan at a glance.
// Runs on the ALREADY-esc()'d string, so it only needs to match plain keyword text,
// never touches attribute/tag content, and can't introduce any new unescaped input.
const CARD_KEYWORD_RE = /\b((?:Critical,\s*)?(?:Before|Hit|After|Now|Cleanup|Critical)\s*:)/g;
function boldCardKeywords(escapedText) {
  return escapedText.replace(CARD_KEYWORD_RE, (whole) => {
    // Strip the compound "Critical, " prefix and the trailing colon to get the
    // base keyword ("Before"/"Hit"/.../"Critical") that TERM_HELP is keyed on —
    // the compound form ("Critical, Before:") is still explained by the Before
    // definition, since that's the clause actually being introduced.
    const base = whole.replace(/^Critical,\s*/, '').replace(/:$/, '');
    const def = TERM_HELP[base];
    return def ? `<b class="term" title="${esc(def)}">${whole}</b>` : `<b>${whole}</b>`;
  });
}

// The two section headlines that sit atop a card's Strike side (the card's own
// name — e.g. "Block" — doubles as that headline, since every card only has one
// name) and Boost side ("Boost", styled to nearly the same size/weight as the
// name so the two halves read as equally real sections rather than one being an
// afterthought — see the "Reading a card" diagram in shell.html, which mirrors
// this same treatment). "(continuous)" is driven off c.boost.continuous, not
// baked into boostText, so it can't drift out of sync with the actual game rule.
function boostHeadline(c) {
  const tag = (c.boost && c.boost.continuous) ? ' <span class="boost-continuous-tag">(continuous)</span>' : '';
  // Cancel (GGST-set mechanic — see cards.js's GG_NORMALS/AXL header comments):
  // a small clock badge on any Boost marked `cancelable`, per the real game's
  // own "Cancelable icon (a clock-like symbol, often shown with a '1')" —
  // matches the source game's own information design rather than inventing a
  // new visual language for this one flag.
  const cancelTag = (c.boost && c.boost.cancelable)
    ? ` <span class="cancelable-tag" title="${esc(TERM_HELP['Cancelable'])}">\u23F1 1</span>`
    : '';
  return `<div class="card-headline boost-headline">Boost${tag}${cancelTag}</div>`;
}

// Renders the `.range-chip` (✓/✗) reflecting projected hit/miss from SimulateStrikePreview
// (accounting for Before-movement, cross-ups, Eddie origin, character/boost range bonuses,
// and visible opponent range immunities). Accepts boolean or semantic state strings.
function rangeChipHTML(inRange) {
  if (inRange == null) return '';
  if (inRange === true || inRange === 'hit') {
    return '<span class="range-chip in">in range \u2713</span>';
  }
  if (inRange === 'after_move') {
    return '<span class="range-chip in move-hit" title="Connects after Before movement or Cross-Up">hits after move \u2713</span>';
  }
  if (inRange === 'immune') {
    return '<span class="range-chip out" title="Opponent has visible Range Immunity at projected distance">immune \u2717</span>';
  }
  if (inRange === 'no_boost') {
    return '<span class="range-chip out" title="Requires a Continuous Boost in play to hit">no boost \u2717</span>';
  }
  if (inRange === 'always_miss') {
    return '<span class="range-chip out" title="Defense/utility card cannot hit">utility</span>';
  }
  return '<span class="range-chip out">out of range \u2717</span>';
}

function previewToRangeChip(preview, fallbackCard, dist) {
  if (preview) {
    if (preview.hasStochasticVariance) return null;
    if (!preview.willWhiff) {
      return (preview.hitByBeforeMove || preview.hitBySideSwap) ? 'after_move' : 'hit';
    }
    if (preview.missReason === 'range_immune') return 'immune';
    if (preview.missReason === 'no_continuous_boost') return 'no_boost';
    if (preview.missReason === 'always_miss') return 'always_miss';
    return 'miss';
  }
  return (dist != null && fallbackCard && fallbackCard.range)
    ? (dist >= fallbackCard.range[0] && dist <= fallbackCard.range[1])
    : null;
}

// Hover attributes that light up a card's range band on the board (see
// highlightBand/clearBand below) \u2014 only added when the caller supplies a band
// (strike_select/defend_select tile builders), so ordinary hand displays
// elsewhere (Change Cards, discard-to-seven, Move's Force picker, etc.) don't
// grow dead hover handlers for a distance concept that doesn't apply there.
function rangeHoverAttrs(band, uid, isEX) {
  const enterParts = [];
  const leaveParts = [];
  if (uid) {
    const u = esc(uid);
    enterParts.push(`G && G.onCardHover('${u}', ${!!isEX})`);
    leaveParts.push(`G && G.onCardHoverEnd()`);
  }
  if (band && (!uid || typeof EventBus === 'undefined')) {
    enterParts.push(`highlightBand(${band[0]},${band[1]})`);
    leaveParts.push(`clearBand()`);
  }
  if (!enterParts.length) return '';
  return ` onmouseenter="${enterParts.join('; ')}" onmouseleave="${leaveParts.join('; ')}" onfocus="${enterParts.join('; ')}" onblur="${leaveParts.join('; ')}"`;
}

function compactBoostTagHTML(c) {
  if (!c || !c.boost) return '<span class="boost-tag-summary">No Boost</span>';
  const force = (c.boost && c.boost.force) || 0;
  const contTag = c.boost.continuous ? '<span class="boost-continuous-tag">[Cont]</span>' : '';
  const cancelTag = c.boost.cancelable ? `<span class="cancelable-tag" title="${esc(TERM_HELP['Cancelable'])}">\u23F11</span>` : '';
  const summary = boostEffectSummary(c);
  const shortSummary = summary.length > 48 ? summary.slice(0, 46) + '\u2026' : summary;
  return `<div class="boost-tag-line">${force > 0 ? `<span class="force-cost">[${force}F]</span>` : ''}${contTag}${cancelTag} <span class="boost-tag-summary">${esc(shortSummary)}</span></div>`;
}

function cardTile(c, opts = {}) {
  const cls = ['card-tile', 'compact-card-tile', c.type];
  if (opts.selected) cls.push('selected');
  if (opts.disabled) cls.push('disabled');
  if (opts.lethalAura) cls.push('lethal-aura');
  if (opts.quickCommit) cls.push('quick-commit-tile');
  if (opts.highlight === 'strike') cls.push('highlight-strike');
  else if (opts.highlight === 'boost') cls.push('highlight-boost');
  const isEX = !!(c.isEX || opts.isEX);
  if (isEX) cls.push('ex-tile');
  if (opts.fromSource === 'gauge') cls.push('from-gauge');
  const inspectId = c.uid || c.key;
  const escInspectId = esc(inspectId);
  const escUid = esc(c.uid || '');
  const exBadge = isEX ? '<span class="ex-chip">EX</span>' : '';
  const exClickHandler = opts.exOnClick || `G.quickCommitEx('${escUid}', '${esc(opts.exOtherUid)}')`;
  const exActionBtn = ((opts.quickCommit || opts.exOnClick) && opts.exOtherUid && !isEX && !opts.disabled)
    ? `<button type="button" class="card-ex-btn" title="Pair duplicate cards for EX Strike (+1 All Stats)" aria-label="EX Strike with ${esc(c.name)}" onmouseenter="event.stopPropagation(); G && G.onCardHover('${escUid}', true)" onmouseleave="G && G.onCardHover('${escUid}', false)" onclick="event.stopPropagation(); ${exClickHandler}">EX</button>`
    : '';
  const gaugeBadge = opts.fromSource === 'gauge' ? '<span class="card-source-badge gauge-source-badge">GAUGE</span>' : '';
  const dragAttrs = opts.draggable
    ? `draggable="true" ondragstart="G.onCardDragStart(event, '${escUid}')" ondragend="G.onCardDragEnd()"`
    : '';
  const tabAttr = !opts.quickCommit && (opts.onclick || opts.draggable) ? ' tabindex="0"' : '';
  const rootClickAttr = !opts.quickCommit && opts.onclick ? ` onclick="${opts.onclick}"` : '';
  const inspectGestures = inspectId
    ? ` oncontextmenu="return G ? G.onCardContextMenu(event, '${escInspectId}', ${isEX}) : false" ondblclick="return G ? G.onCardDoubleClick(event, '${escInspectId}', ${isEX}) : false" onpointerup="G && G.onCardPointerUp(event, '${escInspectId}', ${isEX})" ontouchstart="G && G.onCardTouchStart(event, '${escInspectId}', ${isEX})" ontouchend="G && G.onCardTouchEnd()" ontouchcancel="G && G.onCardTouchEnd()" ontouchmove="G && G.onCardTouchEnd()"`
    : '';
  const attackTextHTML = `<div class="card-face-attack">${boldCardKeywords(esc(c.text || 'Standard strike.'))}</div>`;
  const critTextHTML = c.criticalText
    ? `<div class="card-face-crit">${boldCardKeywords(esc(c.criticalText))}</div>`
    : '';
  const fullBoostHTML = `<div class="card-face-boost-full">${boostHeadline(c)}<div class="card-face-boost-body">${forceCostBadge(c)}${boldCardKeywords(esc(c.boostText || 'No Boost effect.'))}</div></div>`;
  const strikeClickAttrs = opts.quickCommit
    ? ` onclick="G.quickCommitCard('${escUid}', 'strike')" title="Click to Strike with ${esc(c.name)}"`
    : '';
  const strikePartRoleAttrs = opts.quickCommit
    ? ` role="button" tabindex="0" aria-label="Strike with ${esc(c.name)}" onclick="G.quickCommitCard('${escUid}', 'strike')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();G.quickCommitCard('${escUid}','strike');}" title="Click upper half to Strike with ${esc(c.name)}"`
    : '';
  const hasBoost = !!c.boost;
  const boostCls = opts.quickCommit
    ? (hasBoost ? ' boost-clickable' : ' boost-empty')
    : '';
  const boostAttrs = (opts.quickCommit && hasBoost)
    ? ` role="button" tabindex="0" aria-label="Boost with ${esc(c.name)}" title="Click bottom half to Boost with ${esc(c.name)}" onclick="event.stopPropagation(); G.quickCommitCard('${escUid}', 'boost')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();G.quickCommitCard('${escUid}','boost');}"`
    : (opts.quickCommit ? ' onclick="event.stopPropagation();"' : '');
  return `<div class="${cls.join(' ')}" data-uid="${escUid}" ${dragAttrs}${tabAttr}${rootClickAttr}${inspectGestures}${rangeHoverAttrs(opts.band, inspectId, isEX)}>
    <div class="card-header-row">
      <span class="card-name${opts.quickCommit ? ' strike-clickable' : ''}"${strikeClickAttrs}>${esc(c.name)}${c.isEX ? ' (EX)' : ''}</span>
      <span class="card-chips">${gaugeBadge}${exActionBtn}${exBadge}${gaugeCostBadge(c)}${rangeChipHTML(opts.rangeChip)}</span>
    </div>
    <div class="strike-part${opts.quickCommit ? ' strike-clickable' : ''}"${strikePartRoleAttrs}>
      <div class="card-stats">${statLine(c)}</div>
      ${attackTextHTML}
      ${critTextHTML}
    </div>
    <div class="card-boost card-boost-tag${boostCls}"${boostAttrs}>
      ${compactBoostTagHTML(c)}
      ${fullBoostHTML}
    </div>
  </div>`;
}

// Build "make EX" candidate tiles: one per unique duplicated key in hand.
// highlight: pass 'strike' when shown in a strike-selection context (EX pairs are
// always a strike-time choice, so this defaults to highlighting the strike part).
// `dist`: current board distance, when known \u2014 drives the same range-chip/hover-band
// treatment as cardTile() (see strike_select/defend_select below), using the base
// card's printed range since pairing for EX doesn't change range, only pow/spd/arm/grd.
function exPairTiles(hand, onClickFn, highlight = 'strike', dist = null, engine = null, player = null, opts = {}) {
  const seen = new Set();
  const tiles = [];
  const isInitiator = opts.isInitiator !== false;
  const infoSet = (engine && typeof engine.getInformationSet === 'function' && player)
    ? engine.getInformationSet(player.id || 'p1')
    : null;
  const onlyKey = opts.onlyKey || null;
  for (let i = 0; i < hand.length; i++) {
    for (let j = i + 1; j < hand.length; j++) {
      if (hand[i].key === hand[j].key && !seen.has(hand[i].key)) {
        if (onlyKey && hand[i].key !== onlyKey) continue;
        seen.add(hand[i].key);
        const a = hand[i], b = hand[j];
        if (engine && player && typeof engine.isValidStrikeCard === 'function' && !engine.isValidStrikeCard(player, a)) {
          continue;
        }
        if (engine && player && a.type === 'ultra' && typeof engine.canPayUltra === 'function' && !engine.canPayUltra(player, a)) {
          continue;
        }
        const exCard = { ...a, name: a.name, pow: a.pow + 1, spd: a.spd + 1, arm: a.arm + 1, grd: a.grd + 1, isEX: true };
        const exPreview = (infoSet && typeof SimulateStrikePreview !== 'undefined')
          ? SimulateStrikePreview.run(infoSet, a, { isEX: true, isInitiator })
          : null;
        const rangeChip = previewToRangeChip(exPreview, a, dist);
        tiles.push(cardTile(exCard, {
          onclick: onClickFn(a.uid, b.uid),
          highlight,
          band: a.range,
          rangeChip,
          lethalAura: !!(exPreview && exPreview.isPublicStateLethal),
          isEX: true,
        }));
      }
    }
  }
  return tiles.join('');
}

// FX badge shown floating above a fighter's cell while ui.js's playFx() is
// stepping through engine.fxQueue — see FX_ICONS in engine.js for the glyph
// vocabulary. `evt.extra` (the label text under the icon) is deliberately
// terse — the log panel underneath the board carries the full sentence, this
// is just enough to read the shape of what just happened at a glance without
// having to look away from the board.
function fxBadgeLabel(evt) {
  switch (evt.kind) {
    case 'hit': return String(evt.amount);
    case 'damage': return String(evt.amount);
    case 'armor': return evt.amount != null ? `+${evt.amount}` : '';
    case 'move': return evt.amount != null ? String(evt.amount) : '';
    case 'heal': return evt.amount != null ? `+${evt.amount}` : '';
    default: return '';
  }
}

function fxBadgeHTML(currentFx, pid) {
  if (!currentFx || currentFx.who !== pid) return '';
  const label = fxBadgeLabel(currentFx);
  return `<div class="fx-badge fx-${esc(currentFx.kind)}">${fxIcon(currentFx.kind)}${label ? `<span class="fx-amt">${esc(label)}</span>` : ''}</div>`;
}

function boardFighterTokenHTML(player, sideCls, facingCls, currentFx) {
  const title = sideCls === 'you' ? 'You' : 'CPU';
  const spec = (typeof getStandeeSpec === 'function') ? getStandeeSpec(player.characterKey) : null;
  const standeeFailed = typeof StandeeAssets !== 'undefined' && StandeeAssets.isFailed && StandeeAssets.isFailed(player.characterKey);
  if (spec && !standeeFailed) {
    if (typeof StandeeAssets !== 'undefined' && StandeeAssets.ensureLoaded) {
      StandeeAssets.ensureLoaded(player.characterKey);
    }
    const facingState = (typeof resolveStandeeFacing === 'function')
      ? resolveStandeeFacing(player.characterKey, facingCls)
      : {
          facing: facingCls === 'facing-left' ? 'left' : 'right',
          nativeFacing: spec.nativeFacing || 'right',
          src: spec.src,
          flipped: (typeof shouldFlipStandee === 'function')
            ? shouldFlipStandee(spec.nativeFacing, facingCls)
            : (facingCls === 'facing-left'),
        };
    const readyUrl = (typeof StandeeAssets !== 'undefined' && StandeeAssets.getReadySrc)
      ? StandeeAssets.getReadySrc(player.characterKey)
      : facingState.src;
    const isReady = !!readyUrl;
    const flipped = !!facingState.flipped;
    const styleVars = `--standee-scale:${spec.heightScale || 1};--standee-foot-offset:${spec.footOffsetPct || 0}%;--standee-shadow-w:${spec.shadowWidthPct || 70}%;`;
    return `<div class="token ${sideCls} ${facingCls} has-standee" data-pid="${player.id}" data-char="${esc(player.characterKey)}" data-facing="${esc(facingState.facing)}" title="${title}">${fxBadgeHTML(currentFx, player.id)}<div class="standee-anchor" style="${styleVars}"><div class="standee-ground-ring" aria-hidden="true"></div><div class="standee-shadow" aria-hidden="true"></div><div class="standee-sprite${flipped ? ' standee-flipped' : ''}" data-native-facing="${esc(facingState.nativeFacing)}" data-facing="${esc(facingState.facing)}"><img class="standee-img${isReady ? ' standee-ready' : ''}" data-standee-key="${esc(player.characterKey)}" data-standee-matted="${isReady ? 'true' : 'false'}" src="${esc(readyUrl || facingState.src)}" alt="${esc(player.name)}" referrerpolicy="no-referrer"/></div></div></div>`;
  }
  return `<div class="token ${sideCls} ${facingCls} has-plaque" data-pid="${player.id}" data-char="${esc(player.characterKey)}" title="${title}">${fxBadgeHTML(currentFx, player.id)}<div class="plaque-anchor"><div class="plaque-ground-ring" aria-hidden="true"></div><div class="plaque-shadow" aria-hidden="true"></div><div class="plaque-frame">${fighterSilhouette(player.characterKey)}</div></div></div>`;
}

// Distance is always measured from the HUMAN's own token — that's the number a
// player actually needs while picking a card, and it's what the hover band-lit
// highlight (highlightBand/clearBand below) needs on every cell via data-dist.
// humanId is always 'p1' (see ui.js's constructor) but read it off G rather than
// hardcoding, in case that ever stops being true.
function boardHTML(engine) {
  const p1 = engine.P('p1'), p2 = engine.P('p2');
  const humanId = G ? G.humanId : 'p1';
  const humanPos = (G ? G.human() : p1).pos;
  const currentFx = G && G.currentFx;
  const p1Facing = p1.pos <= p2.pos ? 'facing-right' : 'facing-left';
  const p2Facing = p2.pos < p1.pos ? 'facing-right' : 'facing-left';
  const distBetween = engine.range(p1, p2);
  const isHumanTurn = engine.active === humanId;
  const roundNum = Math.max(1, engine.turn || 1);
  const spacingLabel = distBetween <= 1 ? 'Point-Blank' : distBetween <= 2 ? 'Close' : distBetween <= 4 ? 'Mid' : 'Long';
  const humanCorner = (p1.pos === 0 || p1.pos === BOARD_SIZE - 1);
  const cpuCorner = (p2.pos === 0 || p2.pos === BOARD_SIZE - 1);
  const cornerText = humanCorner ? ' · You Cornered' : (cpuCorner ? ' · CPU Cornered' : '');
  const midPct = Math.round((((p1.pos + p2.pos) / 2 + 0.5) / BOARD_SIZE) * 100);
  const canTapMoveNow = !!(G && G.mode === 'awaiting_action' && isHumanTurn && !engine.gameOver);
  let cells = '';
  for (let i = 0; i < BOARD_SIZE; i++) {
    let occupant = '';
    const sharedSpace = (p1.pos === i && p2.pos === i);
    if (sharedSpace) {
      occupant = boardFighterTokenHTML(p1, 'you', p1Facing, currentFx) + boardFighterTokenHTML(p2, 'cpu', p2Facing, currentFx);
    } else if (p1.pos === i) {
      occupant = boardFighterTokenHTML(p1, 'you', p1Facing, currentFx);
    } else if (p2.pos === i) {
      occupant = boardFighterTokenHTML(p2, 'cpu', p2Facing, currentFx);
    }
    // Eddie (Zato-1) is a third thing that can be standing here — never a fighter
    // token, since he isn't a character and nothing collides with him, so he renders
    // as a marker layered alongside whoever else is in the space.
    for (const p of [p1, p2]) {
      if (p.eddiePos === i) occupant += `<div class="token eddie" data-pid="${p.id}" title="Eddie (${p.name})">👁</div>`;
    }
    const dist = Math.abs(i - humanPos);
    const selfCls = i === humanPos ? ' band-self' : '';
    const cornerCls = (i === 0 || i === BOARD_SIZE - 1) ? ' cell-corner' : '';
    const betweenCls = (i > Math.min(p1.pos, p2.pos) && i < Math.max(p1.pos, p2.pos)) ? ' cell-between' : '';
    const sharedCls = sharedSpace ? ' shared-space' : '';
    const canClickMove = canTapMoveNow && i !== p1.pos && i !== p2.pos;
    const cellClick = canClickMove ? ` role="button" tabindex="0" aria-label="Move to space ${i + 1} (distance ${dist})" onclick="G.clickBoardSpace(${i})"` : '';
    const moveCls = canClickMove ? ' cell-movable' : '';
    cells += `<div class="cell${selfCls}${cornerCls}${betweenCls}${sharedCls}${moveCls}" data-dist="${dist}" data-space="${i}"${cellClick}><div class="cell-floor-pad"><span class="cell-space-num" aria-hidden="true">${i + 1}</span><span class="cell-dist">${dist}</span></div>${occupant}</div>`;
  }
  const skipBtn = (G && G.fxPlaying) ? `<button class="fx-skip-btn" onclick="G.skipFx()">Skip ⏭</button>` : '';
  // A Zato-1 in the match gets a second readout: with Eddie on the board his
  // Specials/Ultras are measured from Eddie, so the plain fighter-to-fighter Range
  // is no longer the number that decides whether his attacks connect.
  const eddieOwner = [p1, p2].find(p => p.eddiePos != null);
  const eddieDist = eddieOwner ? Math.abs(eddieOwner.eddiePos - (eddieOwner.id === p1.id ? p2 : p1).pos) : 0;
  const eddieReadout = eddieOwner
    ? `<span class="arena-eddie-readout">· Eddie (${eddieOwner.id === humanId ? 'yours' : 'CPU'}): Sp ${eddieOwner.eddiePos + 1} ${statPillHTML('rng', eddieDist, { showFullLabel: true, extraClass: 'stat-inline' })}</span>`
    : '';
  const moveHint = canTapMoveNow && !eddieOwner && !skipBtn
    ? '<span class="arena-move-hint">Tap open space to Move</span>'
    : '';
  return `<div class="arena-board-frame" style="--arena-focus-x:${midPct}%">
    <div class="arena-top-strip">
      <div id="clash-banner-slot" class="clash-banner-reserved"></div>
      <div class="arena-status-bar">
        <div class="arena-status-left">
          <span class="arena-turn-state ${isHumanTurn ? 'is-you' : 'is-cpu'}">${isHumanTurn ? 'Your Turn · Striker' : 'CPU Turn'}</span>
          <span class="arena-meta-sep" aria-hidden="true">·</span>
          <span class="arena-round-label">Round ${roundNum}</span>
        </div>
        <div class="arena-status-right">
          <span class="arena-spacing-meta">${spacingLabel}${cornerText}</span>
        </div>
      </div>
    </div>
    <div class="board" ondragover="event.preventDefault()" ondrop="G && G.onBoardDrop(event)">${cells}</div>
    <div class="range-readout arena-range-bar">
      <span class="arena-coord you-coord">You · Sp ${p1.pos + 1}</span>
      <span class="arena-range-track" aria-hidden="true"></span>
      <span class="arena-range-core">${statPillHTML('rng', distBetween, { showFullLabel: true, extraClass: 'stat-inline' })}</span>
      <span class="arena-range-track" aria-hidden="true"></span>
      <span class="arena-coord cpu-coord">CPU · Sp ${p2.pos + 1}</span>
      ${eddieReadout}${moveHint}${skipBtn}
    </div>
  </div>`;
}

// Hover band highlighting for range bands (see rangeHoverAttrs above, wired onto
// strike/defend card tiles) — toggles `.band-lit` directly on the existing board
// cells rather than triggering a re-render, since paint() replaces the whole
// #app subtree on every call (see its own header comment) and would kill both
// the hover state and the in-flight FLIP animation on every mouse move. Guarded
// for the headless test DOM stub exactly like captureFlipPositions()/
// applyPendingShake() above: it has no querySelectorAll and no classList.
function highlightBand(min, max) {
  if (typeof document === 'undefined' || !document.querySelectorAll) return;
  const cells = document.querySelectorAll('.cell[data-dist]');
  for (const cell of cells) {
    if (!cell.classList || !cell.dataset) continue;
    const d = Number(cell.dataset.dist);
    if (d >= min && d <= max) cell.classList.add('band-lit');
  }
}
function clearBand() {
  if (typeof document === 'undefined' || !document.querySelectorAll) return;
  const cells = document.querySelectorAll('.cell.band-lit');
  for (const cell of cells) {
    if (cell.classList) cell.classList.remove('band-lit');
  }
}

function charInnateLine(player) {
  const char = CHARACTERS[player.characterKey];
  return player.exceeded ? char.exceedText : char.innateText;
}

// The actual effect of an active continuous boost, for display next to "Active" —
// strips the "Boost (continuous): " (or plain "Boost: ") prefix since that's already
// implied by context, leaving just what it's doing. `full: true` (fighter-info modal)
// returns the complete text; the default (compact life-panel, where multiple
// simultaneous boosts — see engine.discardOpponentContinuousBoost's rework — need to
// fit without overwhelming the panel) trims to the first sentence only, the same
// "first sentence for a concise label" pattern charActionLabel already uses below.
function boostEffectSummary(card, { full = false } = {}) {
  const text = (card.boostText || '').replace(/^Boost(\s*\(continuous\))?:\s*/, '');
  if (full) return text;
  const firstSentence = text.match(/^[^.]+\./);
  return firstSentence ? firstSentence[0] : text;
}

// Concrete action text for the "character action" button — e.g. "Move 1." or
// "Close 1, draw 1." — instead of just the word "Innate"/"Exceeded" (which is what
// naively taking the text before the first em-dash gives you).
function charActionLabel(player) {
  const char = CHARACTERS[player.characterKey];
  const text = player.exceeded ? char.exceedText : char.innateText;
  const afterDash = text.split(' \u2014 ')[1] || text; // "Action: Move 1."
  const withoutPrefix = afterDash.replace(/^Action:\s*/, ''); // "Move 1."
  // keep just the first sentence for a concise button label (Ken's exceeded text has
  // extra trailing clauses — the full text is still shown in the fighter info modal).
  const firstSentence = withoutPrefix.match(/^[^.]+\./);
  return (firstSentence ? firstSentence[0] : withoutPrefix).trim();
}

function deckWarningState(player) {
  const deck = player.deck.length;
  const discard = player.discard.length;
  const used = !!player.reshuffleUsed;
  if ((used && deck <= 2) || (!used && (deck + discard) <= 3)) {
    return { cls: 'deck-red', icon: '⚠ ', title: used ? 'Reshuffle already used — emptying Deck loses immediately!' : 'Critically low Deck + Discard!' };
  }
  if ((used && deck <= 5) || (!used && deck <= 3)) {
    return { cls: 'deck-amber', icon: '', title: used ? 'Low deck (no reshuffle remaining)' : 'Reshuffle imminent' };
  }
  return { cls: 'deck-healthy', icon: '', title: TERM_HELP['Deck'] };
}

function normalMatrixData(opp) {
  const char = CHARACTERS[opp.characterKey] || {};
  const pool = char.normals || NORMALS;
  const publicCards = [
    ...(opp.discard || []),
    ...(opp.gauge || []),
    ...(opp.sealedCards || []),
    ...(opp.overdrive || []),
    ...((opp.boostsInPlay || []).map(b => b.card)),
  ];
  if (opp.strikeState && opp.strikeState.faceUp && opp.strikeState.card) {
    publicCards.push(opp.strikeState.card);
  }
  const counts = {};
  for (const c of publicCards) {
    if (c && c.key) counts[c.key] = (counts[c.key] || 0) + 1;
  }
  let totalRemaining = 0;
  const rows = pool.map(n => {
    const used = Math.min(2, counts[n.key] || 0);
    const rem = 2 - used;
    totalRemaining += rem;
    return { key: n.key, name: n.name, used, rem };
  });
  return { rows, totalRemaining, totalMax: pool.length * 2 };
}

function normalMatrixHTML(opp) {
  const data = normalMatrixData(opp);
  return `<div class="normal-matrix-panel">
    <div class="nm-header"><span>Opponent Normals (${data.totalRemaining}/${data.totalMax} hidden)</span></div>
    <div class="nm-grid">
      ${data.rows.map(r => `<div class="nm-cell ${r.rem === 0 ? 'nm-exhausted' : ''}">
        <span class="nm-name">${esc(r.name)}</span>
        <span class="nm-pips">${r.used >= 1 ? '☑' : '☐'}${r.used >= 2 ? '☑' : '☐'}</span>
      </div>`).join('')}
    </div>
  </div>`;
}

function lifeBar(g, who) {
  const player = who === 'human' ? g.human() : g.ai();
  const label = (CHARACTERS[player.characterKey].name) + (who === 'human' ? ' (You)' : ` (CPU \u2014 ${g.difficulty.label})`);
  const accentClass = who === 'human' ? 'you-accent' : 'cpu-accent';
  const silhouetteAccent = who === 'human' ? 'accent-you' : 'accent-cpu';
  const pct = Math.max(0, Math.round((player.life / player.maxLife) * 100));
  const lowHpCls = player.life > 0 && player.life <= 6 ? ' low-hp' : '';
  const exceedAuraCls = who === 'human' && g.engine.canExceed(player) ? ' exceed-ready-aura' : '';
  const deckState = deckWarningState(player);
  const isStriker = g.engine.active === player.id;
  const strikerBadge = isStriker ? '<span class="striker-hud-badge" title="Active turn / Wins Speed Ties">STRIKER</span>' : '';
  const innateLabel = player.exceeded ? '★ Exceed' : '✦ Innate';
  const activeInnateText = charInnateLine(player) || '';
  const hasBoosts = player.boostsInPlay && player.boostsInPlay.length > 0;
  const boostPills = player.boostsInPlay.map(b => {
    const bId = esc(b.card.uid || b.card.key);
    const exp = b.turnsUntilExpire != null ? ` <em class="pill-expiry">${b.turnsUntilExpire}T</em>` : '';
    const effectText = boostEffectSummary(b.card) || b.card.name;
    const fullEffectText = boostEffectSummary(b.card, { full: true }) || effectText;
    const pillTitle = `${b.card.name}: ${fullEffectText}`;
    return `<span class="hud-pill boost-pill" role="button" tabindex="0" data-boost-uid="${bId}" title="${esc(pillTitle)}" onmouseenter="G.onHudPillHover('boost','${who}','${bId}')" onmouseleave="G.onHudPillHoverEnd()" onfocus="G.onHudPillHover('boost','${who}','${bId}')" onblur="G.onHudPillHoverEnd()" oncontextmenu="return G ? G.onCardContextMenu(event,'${bId}',false) : false" ondblclick="return G ? G.onCardDoubleClick(event,'${bId}',false) : false" onclick="event.stopPropagation(); (G.onHudPillClick ? G.onHudPillClick('boost','${who}','${bId}') : G.onHudPillHover('boost','${who}','${bId}'))">⚡ ${esc(effectText)}${exp}</span>`;
  }).join('');
  return `<div class="life-panel slim-hud-bar ${accentClass}${lowHpCls}${exceedAuraCls}" onclick="G.openInfo('${who}')" role="button" tabindex="0" aria-label="${esc(label)} details">
    <div class="life-top-row">
      ${fighterSilhouette(player.characterKey, silhouetteAccent)}
      <div class="life-main">
        <div class="life-header">
          <span class="pname">${esc(label)} ${strikerBadge} ${player.exceeded ? '<span class="exceeded-badge">EXCEEDED</span>' : ''}</span>
          <span class="life-num">${player.life}/${player.maxLife}${who === 'ai' ? '<span class="opp-projected-life"></span><span class="opp-public-lethal-skull" title="Lethal vs. current board state">☠ Public Lethal</span>' : '<span class="you-projected-life"></span>'}</span>
        </div>
        <div class="life-bar-track"><div class="life-bar-fill" style="width:${pct}%"></div>${who === 'ai' ? '<div class="opp-projected-dmg"></div>' : ''}</div>
      </div>
    </div>
    <div class="resource-row">
      <span title="${esc(TERM_HELP['Hand'])}">Hand ${player.hand.length}</span>
      <span class="deck-pill ${deckState.cls}" title="${esc(deckState.title)}">${deckState.icon}Deck ${player.deck.length}</span>
      <span title="${esc(TERM_HELP['Gauge'])}">Gauge ${player.gauge.length}</span>
      <span title="${esc(TERM_HELP['Discard'])}">Discard ${player.discard.length}</span>
      ${player.overdrive && player.overdrive.length
        ? `<span title="${esc(TERM_HELP['Overdrive'])}">OD ${player.overdrive.length}</span>`
        : ''}
      ${player.extraActionsRemaining > 0 ? `<span title="${esc(TERM_HELP['Actions'])}">Act ${player.extraActionsRemaining}</span>` : ''}
    </div>
    <div class="hud-innate-inline${player.exceeded ? ' is-exceeded' : ''}" role="button" tabindex="0" title="${esc(activeInnateText)}" onmouseenter="G.onHudPillHover('innate','${who}')" onmouseleave="G.onHudPillHoverEnd()" onfocus="G.onHudPillHover('innate','${who}')" onblur="G.onHudPillHoverEnd()" onclick="event.stopPropagation(); (G.onHudPillClick ? G.onHudPillClick('innate','${who}') : G.onHudPillHover('innate','${who}'))"><span class="hud-innate-badge">${player.exceeded ? '★' : '✦'}</span><span class="hud-innate-text">${esc(activeInnateText)}</span></div>
    <div class="hud-pills-row${hasBoosts ? ' has-boosts' : ''}">
      <span class="hud-pill innate-pill" role="button" tabindex="0" onmouseenter="G.onHudPillHover('innate','${who}')" onmouseleave="G.onHudPillHoverEnd()" onfocus="G.onHudPillHover('innate','${who}')" onblur="G.onHudPillHoverEnd()" onclick="event.stopPropagation(); (G.onHudPillClick ? G.onHudPillClick('innate','${who}') : G.onHudPillHover('innate','${who}'))">${innateLabel}</span>
      ${boostPills}
    </div>
  </div>`;
}

function actionButtons(g) {
  const p = g.human();
  const canExceed = g.engine.canExceed(p);
  const char = CHARACTERS[p.characterKey];
  const actions = [
    { fn: 'G.startStrike()', icon: '\u2694', label: 'Strike', sub: 'Set a card face down', disabled: false, primary: true },
    { fn: 'G.startBoost()', icon: '\u2B06', label: 'Boost', sub: 'Play card face up', disabled: p.hand.length === 0 },
    { fn: 'G.startMove()', icon: '\u21C4', label: 'Move', sub: 'Spend Force', disabled: false },
    { fn: 'G.actionPrepare()', icon: '\u{1F0CF}', label: 'Prepare', sub: 'Draw a card', disabled: false },
    { fn: 'G.startChangeCards()', icon: '\u{1F504}', label: 'Change', sub: 'Spend Force \u2192 Draw', disabled: false },
    {
      fn: 'G.actionExceed()', icon: '\u{1F525}',
      label: char.canExceedAction === false ? 'Exceed [\u2014]' : `Exceed [${g.engine.exceedCostFor(p)}]`,
      sub: p.exceeded ? 'Already Exceeded' : (char.canExceedAction === false ? 'Via Reshuffle only' : (canExceed ? 'Flip your character' : 'Not enough Gauge')),
      disabled: !canExceed,
      extraCls: canExceed ? 'exceed-btn-ready' : '',
    },
    ...(char.action ? [{ fn: 'G.actionSpecial()', icon: '\u2605', label: charActionLabel(p), sub: p.exceeded ? 'Exceeded action' : 'Innate action', disabled: false }] : []),
    ...p.boostsInPlay.filter(b => b.card.boost && b.card.boost.grantsBurstAction).map(b => ({
      fn: `G.actionBurst('${b.card.uid}')`, icon: '\u{1F4A5}',
      label: `Burst: ${b.card.name}`,
      sub: `Discard \u2192 ${b.card.boost.grantsBurstAction.extraActions} actions`, disabled: false,
    })),
    { fn: 'G.actionReshuffle()', icon: '\u267B', label: 'Reshuffle', sub: p.reshuffleUsed ? 'Already used' : 'Once per game', disabled: p.reshuffleUsed },
    { fn: 'G.suggestMove()', icon: '\u{1F4A1}', label: 'Coach', sub: 'Suggest a move', disabled: false, extraCls: 'coach-suggest-btn' },
  ];
  return `<div class="action-grid action-bar-row">${actions.map(a => `
    <button class="action-btn ${a.primary ? 'action-primary' : ''} ${a.extraCls || ''}" onclick="${a.fn}" ${a.disabled ? 'disabled' : ''} title="${esc(a.sub)}">
      <span class="action-icon">${a.icon}</span>
      <span class="action-label">${esc(a.label)}</span>
      <span class="action-sub">${esc(a.sub)}</span>
    </button>`).join('')}</div>`;
}

function handHTML(g, opts = {}) {
  const p = g.human();
  let memoMap = null;
  if (typeof PreviewMemo !== 'undefined' && g && g.engine && typeof g.engine.getInformationSet === 'function') {
    const infoSet = g.engine.getInformationSet(g.humanId || 'p1');
    memoMap = PreviewMemo.evaluateHand(infoSet, p.hand, g.engine, p, { isInitiator: g.mode !== 'defend_select' });
  }
  const hasScroll = p.hand.length > 7 || !!opts.exTiles;
  return `<div class="hand-row${hasScroll ? ' hand-row-scroll' : ''}">${p.hand.map(c => {
    const memo = memoMap && memoMap.get(c.uid || c.key);
    const baseOpts = opts.tileOpts ? opts.tileOpts(c, memo) : {};
    const lethalAura = !!(memo && memo.base && memo.base.isPublicStateLethal && !baseOpts.disabled);
    return cardTile(c, { ...baseOpts, lethalAura });
  }).join('')}${opts.exTiles || ''}</div>`;
}

// ---------------- Fight log: rounds grouped, HP shown, newest first ----------------
function buildLogEntries(engine, maxEntries = 10) {
  const lines = engine.log;
  const entries = [];
  // Scan backward from the tail so logHTML only parses the most recent rounds/lines.
  let end = lines.length;
  while (end > 0 && entries.length < maxEntries) {
    let idx = end - 1;
    // Walk back to the start of the current round block if we're inside one, or emit a plain line
    let scan = idx;
    while (scan >= 0 && !/^\u2014{3} Round \d+/.test(lines[scan])) {
      if (scan < idx && /^HP \u2014/.test(lines[scan])) break;
      scan--;
    }
    if (scan >= 0 && /^\u2014{3} Round \d+/.test(lines[scan])) {
      const block = { type: 'round', header: lines[scan], body: [], hp: null };
      for (let j = scan + 1; j < end; j++) {
        if (/^HP \u2014/.test(lines[j])) block.hp = lines[j];
        else block.body.push(lines[j]);
      }
      entries.push(block);
      end = scan;
    } else {
      entries.push({ type: 'line', text: lines[idx] });
      end = idx;
    }
  }
  entries.reverse();
  return entries;
}

function logHTML(engine) {
  const entries = buildLogEntries(engine, 10).reverse();
  const html = entries.map(e => {
    if (e.type === 'round') {
      return `<div class="round-card">
        <div class="round-header">${esc(e.header.replace(/^\u2014+\s*/, '').replace(/\s*\u2014+$/, ''))}</div>
        <div class="round-body">${e.body.map(l => `<div class="log-line">${esc(l)}</div>`).join('')}</div>
        ${e.hp ? `<div class="round-hp">${esc(e.hp)}</div>` : ''}
      </div>`;
    }
    return `<div class="log-line plain">${esc(e.text)}</div>`;
  }).join('');
  return `<div class="log-panel">${html}</div>`;
}

// ---------------- Fighter info modal ----------------
function groupCounts(cards) {
  const map = new Map();
  for (const c of cards) map.set(c.name, (map.get(c.name) || 0) + 1);
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function deckReferenceHTML(charKey) {
  const char = CHARACTERS[charKey];
  // `c.copies` overrides the default-2 count (0 = starts in play like Deus Ex Machina,
  // 1 with isAstral = starts out of play, 3-4 for multi-copy cards).
  const qtyBadge = (c) => {
    const qty = c.copies == null ? 2 : c.copies;
    if (c.isAstral) return `<span class="ref-qty">\u00d7${qty} (Astral Heat)</span>`;
    if (qty === 0) return `<span class="ref-qty">\u00d70 (starts in play)</span>`;
    return `<span class="ref-qty">\u00d7${qty}</span>`;
  };
  const rows = (cards) => cards.map(c => `
    <div class="ref-card-row">
      <div class="ref-card-title">${esc(c.name)} ${qtyBadge(c)}${gaugeCostBadge(c)}</div>
      <div class="card-stats">${statLine(c)}</div>
      <div class="card-text">${boldCardKeywords(esc(c.text || ''))}</div>
      ${c.criticalText ? `<div class="card-critical">${boldCardKeywords(esc(c.criticalText))}</div>` : ''}
      <div class="card-boost">
        ${boostHeadline(c)}
        ${forceCostBadge(c)}${boldCardKeywords(esc(c.boostText || ''))}
      </div>
    </div>`).join('');
  // `char.normals` (falling back to the base NORMALS set) — NOT a hardcoded
  // reference to NORMALS — since Axl's shared pool is GG_NORMALS, a completely
  // different set of 8 cards (see cards.js). This was a real bug: caught by
  // actually opening this exact modal for Axl and seeing "Assault" (a base-set
  // card his deck doesn't contain at all) listed as one of his Normals.
  const normalsPool = char.normals || NORMALS;
  return `<div class="deck-ref">
    <h4>Normals (shared, \u00d72 each)</h4>
    ${rows(normalsPool)}
    <h4>${esc(char.name)} Specials &amp; Ultras (\u00d72 each unless noted)</h4>
    ${rows(char.specials)}
  </div>`;
}

function infoModalHTML(g) {
  const who = g.infoModal;
  const player = who === 'human' ? g.human() : g.ai();
  const label = CHARACTERS[player.characterKey].name + (who === 'human' ? ' (You)' : ' (CPU)');
  const char = CHARACTERS[player.characterKey];
  const gaugeGroups = groupCounts(player.gauge);
  const discardGroups = groupCounts(player.discard);
  return `<div class="modal-overlay" onclick="if(event.target===this) G.closeInfo()">
    <div class="modal-panel">
      <div class="modal-header">
        <h2>${esc(label)}</h2>
        <button class="modal-close" onclick="G.closeInfo()">\u2715</button>
      </div>
      <div class="modal-body">
        <div class="modal-silhouette-wrap">${fighterSilhouette(player.characterKey, who === 'human' ? 'accent-you' : 'accent-cpu')}</div>
        <div class="info-row"><b>Life:</b> ${player.life}/${player.maxLife}</div>
        <div class="info-row"><b>Position:</b> space ${player.pos + 1} of ${BOARD_SIZE}</div>
        <div class="info-row"><b>Hand:</b> ${player.hand.length} card(s) &nbsp; <b>Deck:</b> ${player.deck.length} &nbsp; <b>Reshuffle used:</b> ${player.reshuffleUsed ? 'Yes' : 'No'}</div>
        <div class="info-row"><b>Currently:</b> ${player.exceeded ? '<span class="exceeded-badge">EXCEEDED</span>' : 'Normal form'}</div>

        <h4>Character Action</h4>
        <div class="info-row char-ability ${!player.exceeded ? 'active-ability' : ''}"><b>Normal:</b> ${esc(char.innateText)}</div>
        <div class="info-row char-ability ${player.exceeded ? 'active-ability' : ''}"><b>Exceeded [${char.exceedCost} Gauge]:</b> ${esc(char.exceedText)}</div>

        <h4>Active Boosts (${player.boostsInPlay.length})</h4>
        ${player.boostsInPlay.length ? player.boostsInPlay.map(b => {
          const expiry = b.turnsUntilExpire != null
            ? `<span class="pile-qty">expires in ${b.turnsUntilExpire} turn${b.turnsUntilExpire === 1 ? '' : 's'}</span>` : '';
          return `<div class="pile-row"><span><b>${esc(b.card.name)}:</b> ${esc(boostEffectSummary(b.card, { full: true }))}</span>${expiry}</div>`;
        }).join('') : '<div class="pile-row empty">None active</div>'}

        <h4>Gauge (${player.gauge.length})</h4>
        ${gaugeGroups.length ? gaugeGroups.map(([name, n]) => `<div class="pile-row">${esc(name)} <span class="pile-qty">\u00d7${n}</span></div>`).join('') : '<div class="pile-row empty">Empty</div>'}

        <h4>Discard (${player.discard.length})</h4>
        ${discardGroups.length ? discardGroups.map(([name, n]) => `<div class="pile-row">${esc(name)} <span class="pile-qty">\u00d7${n}</span></div>`).join('') : '<div class="pile-row empty">Empty</div>'}

        <button class="big-btn" onclick="G.toggleDeckRef()">${g.deckRefOpen ? 'Hide' : 'Show'} full starting deck (all cards &amp; text)</button>
        ${g.deckRefOpen ? deckReferenceHTML(player.characterKey) : ''}
      </div>
    </div>
  </div>`;
}

// ---------------- main render ----------------
// Triggers a brief CSS screenshake on `#app` — consumes (clears) G.shakeOnRender so it
// fires exactly once per strike, not on every re-render while the result is showing.
let _shakeTimer = null;
function applyPendingShake(app) {
  if (!G || !G.consumeShakeOnRender()) return;
  if (!app || !app.classList) return; // headless/test DOM stub without real classList support
  if (_shakeTimer) { clearTimeout(_shakeTimer); _shakeTimer = null; }
  app.classList.remove('screen-shake'); // restart the animation even if it's still mid-play
  void app.offsetWidth; // force reflow so the re-added class replays the keyframes
  app.classList.add('screen-shake');
  _shakeTimer = setTimeout(() => { _shakeTimer = null; app.classList.remove('screen-shake'); }, 450);
}

// ---------------- fx queue + fluent stand movement (FLIP) ----------------
// `paint()` below is the real DOM-replacing render (renamed from the project's
// original `render()`); every caller in ui.js/shell.html still calls `render()`,
// which now decides whether to paint immediately or hand off to ui.js's
// playFx() first — see engine.js's fxQueue/FX_ICONS for the event vocabulary
// this drives. Kept as a thin dispatcher (not folded into paint) so the
// FLIP position-capture below wraps every paint uniformly, including each
// step of a multi-event playback.
function render() {
  if (!G) { paint(); return; }
  // A finished-but-undrained queue means an action just happened; hand off to
  // playFx() to step through it one event at a time. While already draining
  // (G.fxPlaying), fall through to paint — playFx's own loop calls render()
  // once per step, after shifting that step's entry off the queue.
  if (!G.fxPlaying && G.engine.hasPendingFx()) { G.playFx(); return; }
  paintWithFlip();
}

// FLIP (First/Last/Invert/Play): `paint()` fully replaces #app's innerHTML on
// every call (documented as deliberate — see render.js's own header comment),
// so a plain CSS transition on `.token` can never fire, the browser only ever
// sees a brand-new element at the new cell. Capture each token's screen
// position before the repaint, then animate FROM there back to zero after —
// see HANDOFF.md's "fluent stand movement"
// section for why this wrapper approach was chosen over hoisting the tokens
// out of the grid. No-ops safely under the headless test DOM stub (see
// test_headless.js's minimal `document`, which has no querySelectorAll) —
// same guard style as applyPendingShake's classList check just above.
function captureFlipPositions() {
  if (typeof document === 'undefined' || !document.querySelectorAll) return null;
  const before = {};
  for (const t of document.querySelectorAll('.token[data-pid]')) {
    if (!t.getBoundingClientRect) continue;
    const cell = t.closest ? t.closest('.cell[data-space]') : null;
    before[t.dataset.pid] = {
      left: t.getBoundingClientRect().left,
      space: cell ? Number(cell.getAttribute('data-space')) : null,
      facing: t.dataset.facing || null,
    };
  }
  return before;
}

function applyFlip(before) {
  if (!before) return;
  const moves = [];
  const engine = (typeof G !== 'undefined' && G) ? G.engine : null;
  const p1Pos = engine && engine.P ? engine.P('p1').pos : null;
  const p2Pos = engine && engine.P ? engine.P('p2').pos : null;
  const fxKind = (typeof G !== 'undefined' && G && G.currentFx) ? G.currentFx.kind : 'move';

  for (const t of document.querySelectorAll('.token[data-pid]')) {
    if (!t.getBoundingClientRect) continue;
    const prev = before[t.dataset.pid];
    if (!prev || prev.left == null) continue;
    const nextLeft = t.getBoundingClientRect().left;
    const dx = prev.left - nextLeft;
    const cell = t.closest ? t.closest('.cell[data-space]') : null;
    const nextSpace = cell ? Number(cell.getAttribute('data-space')) : null;
    if (dx) moves.push({ t, dx });
    if ((dx || prev.space !== nextSpace) && typeof StandeeStage !== 'undefined' && StandeeStage.notifyBoardMove) {
      StandeeStage.notifyBoardMove({
        pid: t.dataset.pid,
        prevSpace: prev.space,
        nextSpace,
        prevLeft: prev.left,
        nextLeft,
        p1Pos,
        p2Pos,
        fxKind,
      });
    }
  }
  if (moves.length === 0) return;
  for (const { t, dx } of moves) {
    t.style.transition = 'none';
    t.style.transform = `translateX(${dx}px)`;
  }
  if (typeof requestAnimationFrame !== 'function') {
    for (const { t } of moves) t.style.transform = '';
    return;
  }
  void moves[0].t.offsetWidth;
  requestAnimationFrame(() => {
    for (const { t } of moves) {
      if (!t.isConnected) continue;
      t.style.transition = 'transform .32s cubic-bezier(.4,0,.2,1)';
      t.style.transform = '';
    }
  });
}

function paintWithFlip() {
  const before = captureFlipPositions();
  paint();
  applyFlip(before);
}

// ---------------- Strike breakdown (G.mode === 'strike_result') ----------------
// Turns engine.lastStrikeInfo (see the shared onboarding contract's shape) into
// player-facing sentences, one per beat of the engine's OWN resolution order —
// not a paraphrase, a narration of exactly what resolveStrikeSteps actually did.
// `label()` reads G directly rather than taking a param since every beat builder
// below is already only ever called from inside this file with G already set.
function sideLabel(pid) { return pid === G.humanId ? 'You' : 'CPU'; }

// Markers shown next to a revealed card name (beat 1) — EX/Wild Swing/Critical/
// Face Up — each driven off the exact flags the contract's `sides[pid]` shape
// guarantees are present (never undefined), so no `!= null` guard is needed here.
function sideMarkers(side) {
  const marks = [];
  if (side.isEX) marks.push('EX');
  if (side.fromWildSwing) marks.push('Wild Swing');
  if (side.criticalPaid) marks.push('Critical');
  if (side.faceUp) marks.push('Face Up');
  return marks.length ? ` (${marks.join(', ')})` : '';
}

// Beat 2's printed→live stat table for one side — up/down classes only fire when
// live actually differs from printed, so an unmodified stat renders with neither,
// matching the CSS classes SHELL provides (`.stat-live.up`/`.stat-live.down`).
function statCompareHTML(label, side) {
  const statKeys = [['pow', 'POW'], ['spd', 'SPD'], ['arm', 'ARM'], ['grd', 'GRD']];
  const rows = statKeys.map(([k, name]) => {
    const printed = side.printed[k], live = side.live[k];
    const cls = live > printed ? ' up' : (live < printed ? ' down' : '');
    return `<div class="stat-compare-row"><span class="stat-name stat-compare-tag stat-${k}">${statIconSVG(k)}<span>${name}</span></span><span class="stat-printed">${printed}</span><span class="stat-live${cls}">${live}</span></div>`;
  }).join('');
  const flags = [];
  if (side.live.ignoreArmor) flags.push('ignores Armor');
  if (side.live.ignoreGuard) flags.push('ignores Guard');
  const flagRow = flags.length
    ? `<div class="stat-compare-row"><span class="stat-name">Note</span><span class="stat-printed"></span><span class="stat-live">${esc(flags.join(', '))}</span></div>` : '';
  const head = `<div class="stat-compare-row stat-compare-head"><span class="stat-name"></span><span class="stat-printed">printed</span><span class="stat-live">actual</span></div>`;
  return `<div class="stat-compare"><div class="stat-compare-label">${esc(label)}</div>${head}${rows}${flagRow}</div>`;
}

// One event -> one beat sentence, in the engine's own order. Each case narrates
// the ACTUAL rule (range check against the card's own band; POW − ARM = damage;
// only the second-activating card can be Stunned, and only past its Guard; hit
// goes to Gauge, miss goes to discard) rather than a generic "something happened."
function strikeEventBeatHTML(evt) {
  switch (evt.type) {
    case 'activate': {
      const who = sideLabel(evt.attackerId);
      const bandText = `needs ${evt.bandMin}–${evt.bandMax}`;
      if (evt.inRange) {
        return `${who}'s <b>${esc(evt.cardName)}</b> activates — in range (${bandText}, distance was ${evt.rng}).`;
      }
      const reasonText = evt.missReason === 'range_immune' ? 'the defender is immune to this range'
        : evt.missReason === 'cannot_hit' ? 'this card cannot hit under these conditions'
        : 'out of range';
      return `${who}'s <b>${esc(evt.cardName)}</b> activates — misses (${reasonText}; ${bandText}, distance was ${evt.rng}).`;
    }
    case 'damage': {
      const who = sideLabel(evt.attackerId);
      return `${who}'s <b>${esc(evt.cardName)}</b> hits: ${evt.effPow} POW − ${evt.effArm} ARM = <b>${evt.dealt}</b> damage. (Life remaining: ${evt.defenderLifeAfter})`;
    }
    case 'stun': {
      const who = sideLabel(evt.playerId);
      if (evt.immune) {
        return `${who}'s <b>${esc(evt.cardName)}</b> took enough damage to Stun (${evt.dmg} vs ${evt.grd} Guard) but is immune — not Stunned.`;
      }
      return `${who}'s <b>${esc(evt.cardName)}</b> is Stunned — only the SECOND card to activate can be Stunned, and only when the first card's damage (${evt.dmg}) exceeds its Guard (${evt.grd}). It's discarded without resolving.`;
    }
    case 'cleanup': {
      const who = sideLabel(evt.playerId);
      const destText = {
        gauge: 'Gauge (it hit)', discard: 'Discard (it missed)',
        sealed: 'sealed away, out of the game', deck: 'back on top of the deck',
        inplay: 'staying in play',
      }[evt.dest] || evt.dest;
      return `${who}'s <b>${esc(evt.cardName)}</b> goes to ${destText}.`;
    }
    case 'next': {
      const who = sideLabel(evt.playerId);
      return evt.viaAdvantage ? `${who} acts next — Advantage carries over from this Strike.` : `${who} acts next.`;
    }
    default: return '';
  }
}

// Assembles the full ordered beat list. Tolerates `info === null` (never Struck
// yet) and an empty/missing `events` array (contract's explicit tolerance
// requirement) — both render a single explanatory beat instead of an empty panel.
function buildStrikeBeats(info) {
  if (!info || !info.sides || !info.sides[G.humanId] || !info.sides[G.aiId]) {
    return ['No Strike has resolved yet this game.'];
  }
  const you = info.sides[G.humanId], cpu = info.sides[G.aiId];
  const beats = [];
  beats.push(`You set <b>${esc(you.cardName)}</b>${sideMarkers(you)}. CPU set <b>${esc(cpu.cardName)}</b>${sideMarkers(cpu)}.`);
  beats.push(`${statCompareHTML('You', you)}${statCompareHTML('CPU', cpu)}`);
  const firstSide = info.sides[info.firstId], secondSide = info.sides[info.secondId];
  const firstLabel = sideLabel(info.firstId), secondLabel = sideLabel(info.secondId);
  const firstSpd = firstSide ? firstSide.live.spd : '?', secondSpd = secondSide ? secondSide.live.spd : '?';
  beats.push(`Speed decides who activates first: ${firstLabel} (Speed ${firstSpd}) goes before ${secondLabel} (Speed ${secondSpd}).`);
  for (const evt of (info.events || [])) {
    const html = strikeEventBeatHTML(evt);
    if (html) beats.push(html);
  }
  return beats;
}

// Renders the `.breakdown` panel. In beginner mode, beats beyond G.beatIndex render
// as `.breakdown-beat.pending` placeholders and Continue stays disabled until every
// beat is revealed (via G.revealNextBeat()/G.revealAllBeats(), both ui.js methods
// that just bump G.beatIndex and re-render — no mutation happens in this file).
// Outside beginner mode every beat shows at once and Continue is live immediately,
// so an experienced player sees no change from the pre-existing bare panel.
function strikeBreakdownHTML(opts = {}) {
  const isModal = !!(opts && opts.modal);
  const beats = buildStrikeBeats(G.engine.lastStrikeInfo);
  const beginner = !isModal && !!G.beginner;
  const beatIndex = beginner ? Math.max(0, Math.min(beats.length, G.beatIndex || 0)) : beats.length;
  const beatsHTML = beats.map((text, i) => {
    const revealed = i < beatIndex;
    return `<div class="breakdown-beat${revealed ? '' : ' pending'}">
      <span class="beat-num">${i + 1}</span>
      <span class="beat-text">${revealed ? text : '…'}</span>
    </div>`;
  }).join('');
  const allRevealed = beatIndex >= beats.length;
  if (isModal) {
    return `<div class="breakdown">${beatsHTML}</div><button type="button" class="big-btn" onclick="G.closeLastStrikeModal()">Close</button>`;
  }
  const controls = beginner
    ? `<div class="beat-controls">
        ${allRevealed ? '' : `<button onclick="G.revealNextBeat()">Next</button><button onclick="G.revealAllBeats()">Show all</button>`}
        <button class="big-btn" onclick="G.continueAfterStrikeResult()" ${allRevealed ? '' : 'disabled'}>Continue</button>
      </div>`
    : `<button class="big-btn" onclick="G.continueAfterStrikeResult()">Continue</button>`;
  return `<div class="breakdown">${beatsHTML}</div>${controls}`;
}

function resolveCardDef(cardKeyOrName) {
  if (!cardKeyOrName) return null;
  if (typeof SimulateStrikePreview !== 'undefined' && SimulateStrikePreview.resolveCardByKey) {
    const byKey = SimulateStrikePreview.resolveCardByKey(cardKeyOrName);
    if (byKey) return byKey;
  }
  if (typeof allCardDefs === 'function') {
    const defs = allCardDefs();
    return defs.find(c => c.key === cardKeyOrName || c.name === cardKeyOrName) || null;
  }
  return null;
}

function previewDeltaBadgeHTML(liveVal, printedVal) {
  if (typeof liveVal !== 'number' || typeof printedVal !== 'number' || liveVal === printedVal) return '';
  const diff = liveVal - printedVal;
  return `<span class="insp-pv-delta ${diff > 0 ? 'up' : 'down'}">${diff > 0 ? '+' : ''}${diff}</span>`;
}

function previewVerdictTagHTML(preview) {
  if (preview.hasStochasticVariance) {
    return '<span class="insp-tag var">🎲 RANDOM</span>';
  }
  if (preview.isPublicStateLethal) {
    return '<span class="insp-tag lethal">☠ PUBLIC LETHAL</span>';
  }
  if (preview.willWhiff) {
    const shortTxt = preview.missReason === 'range_immune'
      ? '✗ RANGE IMMUNE'
      : (preview.missReason === 'no_continuous_boost'
        ? '✗ NEEDS BOOST'
        : (preview.missReason === 'self_cannot_hit'
          ? '✗ CROSSED PAST'
          : (preview.missReason === 'always_miss' ? '✗ CANNOT HIT' : '✗ OUT OF RANGE')));
    return `<span class="insp-tag whiff" title="${esc(preview.missReasonLabel || shortTxt)}">${esc(shortTxt)}</span>`;
  }
  if (preview.hitBySideSwap) {
    return '<span class="insp-tag in-range">✓ HIT (CROSS-UP)</span>';
  }
  if (preview.hitByBeforeMove) {
    return '<span class="insp-tag in-range">✓ HIT (AFTER MOVE)</span>';
  }
  return '<span class="insp-tag in-range">✓ EXPECTED HIT</span>';
}

function inspectorCardViewHTML(g, card, rawCard, isEX) {
  const hoverState = (typeof StrikePreviewController !== 'undefined' && StrikePreviewController.getActiveHover)
    ? StrikePreviewController.getActiveHover()
    : null;
  const sameHovered = !!(hoverState && hoverState.card && hoverState.card.key === (rawCard || card).key);
  const effectiveIsEX = sameHovered ? !!hoverState.isEX : !!(isEX || card.isEX);
  const useOptionalBranch = sameHovered ? !!hoverState.useOptionalBranch : false;
  const criticalPaid = sameHovered ? !!hoverState.criticalPaid : false;

  const displayCard = effectiveIsEX && !card.isEX
    ? { ...card, isEX: true, pow: (card.pow || 0) + 1, spd: (card.spd || 0) + 1, arm: (card.arm || 0) + 1, grd: (card.grd || 0) + 1 }
    : card;
  let previewHTML = '';
  if (typeof SimulateStrikePreview !== 'undefined' && g && g.engine && typeof g.engine.getInformationSet === 'function') {
    const infoSet = g.engine.getInformationSet(g.humanId || 'p1');
    const preview = SimulateStrikePreview.run(infoSet, rawCard || card, {
      isEX: effectiveIsEX,
      isInitiator: g.mode !== 'defend_select',
      useOptionalBranch,
      criticalPaid,
    });
    if (preview && preview.effectiveStats) {
      const s = preview.effectiveStats;
      const rangeStr = (s.minRange != null && s.maxRange != null)
        ? (s.minRange === s.maxRange ? String(s.minRange) : `${s.minRange}\u2013${s.maxRange}`)
        : '\u2014';
      const rangeDelta = previewDeltaBadgeHTML(s.maxRange, s.printedMaxRange);
      const roleTag = `<span class="insp-pv-role">${preview.isInitiator ? 'Striker' : 'Defender'}</span>`;
      const distText = preview.initialDist === preview.postBeforeDist
        ? `Dist ${preview.postBeforeDist}`
        : `Dist ${preview.initialDist}\u2192${preview.postBeforeDist}`;
      const rangeDetail = preview.willWhiff
        ? esc(preview.missReasonLabel || `Dist ${preview.postBeforeDist} vs Rng ${rangeStr}`)
        : `${preview.usesEddie ? `Eddie\u2192CPU Dist ${preview.postBeforeDist}` : distText} vs Rng ${esc(rangeStr)}${preview.hitBySideSwap ? ' (Cross-Up)' : (preview.hitByBeforeMove ? ' (After Before move)' : '')}`;

      const moveLines = [];
      if (preview.beforeMoveSummary) moveLines.push(`Before: ${preview.beforeMoveSummary}`);
      if (preview.oppHitMoveSummary) moveLines.push(`Hit: ${preview.oppHitMoveSummary}`);
      if (preview.afterMoveSummary) moveLines.push(`After: ${preview.afterMoveSummary}`);

      let lifeText;
      if (preview.hasStochasticVariance) {
        lifeText = '<b>?</b> (Random top of deck)';
      } else if (preview.willWhiff) {
        lifeText = `CPU <b>${preview.oppLifeBefore}</b> HP <span class="insp-pv-muted">(0 dmg)</span>`;
      } else {
        const lethalCls = preview.isPublicStateLethal ? ' is-lethal' : '';
        lifeText = `CPU <b>${preview.oppLifeBefore} \u2192 ${preview.oppLifeAfter}</b> <span class="insp-pv-loss${lethalCls}">(-${preview.oppLifeLoss} HP)</span> <span class="insp-pv-formula">[${esc(preview.damageFormula)}]</span>`;
      }
      if (preview.breaksVisibleGuard && (s.oppVisibleGrd || 0) > 0) {
        lifeText += ' <span class="insp-pv-gb">Breaks GRD</span>';
      }
      if (preview.selfLifeDelta) {
        const sign = preview.selfLifeDelta > 0 ? '+' : '';
        lifeText += ` \u00B7 You <b>${preview.selfLifeBefore}\u2192${preview.selfLifeAfter}</b> <span class="insp-pv-self ${preview.selfLifeDelta > 0 ? 'heal' : 'dmg'}">(${sign}${preview.selfLifeDelta} HP)</span>`;
      }

      const cleanEffects = (preview.effectsSummary || []).filter((e) => !/^You [+-]\d+ HP$/.test(e));
      const toggles = [];
      if (preview.canPreviewEX) {
        toggles.push(`<button type="button" class="clash-toggle ex-toggle${preview.isEX ? ' active' : ''}" onclick="EventBus.emit('OnToggleEXMode', {})">[E] EX +1</button>`);
      }
      if (preview.criticalFree) {
        toggles.push('<span class="insp-tag crit">CRIT (Free)</span>');
      } else if (preview.canPreviewCritical) {
        toggles.push(`<button type="button" class="clash-toggle crit-toggle${preview.criticalActive ? ' active' : ''}" onclick="EventBus.emit('OnToggleCriticalPreview', {})">[C] Critical</button>`);
      }
      if (preview.optionalBranches && preview.optionalBranches.length > 0) {
        toggles.push(`<button type="button" class="clash-toggle${useOptionalBranch ? ' active' : ''}" onclick="EventBus.emit('OnToggleOptionalBranch', {})">[Shift] ${esc(preview.optionalBranches[0].label)}</button>`);
      }

      previewHTML = `<div class="inspector-preview-box${preview.willWhiff ? ' is-miss' : (preview.isPublicStateLethal ? ' is-lethal' : '')}">
        <div class="inspector-preview-head">
          <span>Strike Preview</span>
          ${roleTag}
          ${previewVerdictTagHTML(preview)}
        </div>
        <div class="inspector-preview-stats">
          <span class="insp-stat-wrap">${statPillHTML('rng', rangeStr, { showFullLabel: true, extraClass: 'stat-inline' })}${rangeDelta}</span>
          <span class="insp-stat-wrap">${statPillHTML('spd', s.spd, { showFullLabel: true, extraClass: 'stat-inline' })}${previewDeltaBadgeHTML(s.spd, s.printedSpd)}</span>
          <span class="insp-stat-wrap">${statPillHTML('pow', s.pow, { showFullLabel: true, extraClass: 'stat-inline' })}${previewDeltaBadgeHTML(s.pow, s.printedPow)}</span>
          <span class="insp-stat-wrap">${statPillHTML('arm', s.arm, { showFullLabel: true, extraClass: 'stat-inline' })}${previewDeltaBadgeHTML(s.arm, s.printedArm)}</span>
          <span class="insp-stat-wrap">${statPillHTML('grd', s.grd, { showFullLabel: true, extraClass: 'stat-inline' })}${previewDeltaBadgeHTML(s.grd, s.printedGrd)}</span>
        </div>
        <div class="insp-pv-rows">
          <div class="insp-pv-row"><span class="insp-pv-k">Range</span><span class="insp-pv-v">${rangeDetail}</span></div>
          ${moveLines.length ? `<div class="insp-pv-row"><span class="insp-pv-k">Move</span><span class="insp-pv-v">${esc(moveLines.join(' \u00B7 '))}</span></div>` : ''}
          <div class="insp-pv-row"><span class="insp-pv-k">Life</span><span class="insp-pv-v">${lifeText}</span></div>
          ${cleanEffects.length ? `<div class="insp-pv-row"><span class="insp-pv-k">Notes</span><span class="insp-pv-v">${esc(cleanEffects.join(' \u00B7 '))}</span></div>` : ''}
        </div>
        ${toggles.length ? `<div class="insp-pv-toggles">${toggles.join('')}</div>` : ''}
        <div class="insp-pv-note">Based on visible board &amp; boosts (CPU card hidden).</div>
      </div>`;
    }
  }
  const typeLabel = (displayCard.type || 'normal').toUpperCase();
  const modalId = esc((rawCard && rawCard.uid) || displayCard.uid || displayCard.key || '');
  const modalEX = !!(isEX || displayCard.isEX);
  return `<div class="inspector-card-view">
    <div class="inspector-head">
      <span class="inspector-title">${esc(displayCard.name)}${displayCard.isEX ? ' (EX)' : ''}</span>
      <span class="inspector-badges"><span class="insp-type-badge ${esc(displayCard.type || 'normal')}">${typeLabel}</span>${gaugeCostBadge(displayCard)}${modalId ? `<button type="button" class="insp-full-btn" onclick="G && G.openCardModal('${modalId}', { isEX: ${modalEX} })" title="View full playing card (V, double-tap, or right-click)">Full Card</button>` : ''}</span>
    </div>
    <div class="card-stats inspector-stats">${statLine(displayCard)}</div>
    <div class="inspector-attack-text">${boldCardKeywords(esc(displayCard.text || 'Standard strike (no additional effect text).'))}</div>
    ${displayCard.criticalText ? `<div class="inspector-critical-text">${boldCardKeywords(esc(displayCard.criticalText))}</div>` : ''}
    <div class="inspector-boost-box">
      ${boostHeadline(displayCard)}
      ${forceCostBadge(displayCard)}<span class="inspector-boost-text">${boldCardKeywords(esc(displayCard.boostText || 'No Boost effect.'))}</span>
    </div>
    ${previewHTML}
  </div>`;
}

function inspectorStrikeResultHTML(g) {
  const info = g.engine.lastStrikeInfo;
  if (!info || !info.sides || !info.sides[g.humanId] || !info.sides[g.aiId]) {
    return '<div class="inspector-idle-view"><div class="inspector-idle-prompt">No Strike has resolved yet this game.</div></div>';
  }
  const you = info.sides[g.humanId];
  const cpu = info.sides[g.aiId];
  const youDef = resolveCardDef(you.cardKey || you.cardName);
  const cpuDef = resolveCardDef(cpu.cardKey || cpu.cardName);
  const beats = buildStrikeBeats(info);
  const beginner = !!g.beginner;
  const beatIndex = beginner ? Math.max(0, Math.min(beats.length, g.beatIndex || 0)) : beats.length;
  const beatsHTML = beats.map((text, i) => {
    const revealed = i < beatIndex;
    return `<div class="breakdown-beat${revealed ? '' : ' pending'}">
      <span class="beat-num">${i + 1}</span>
      <span class="beat-text">${revealed ? text : '…'}</span>
    </div>`;
  }).join('');
  return `<div class="inspector-strike-result-view">
    <div class="inspector-dual-cards">
      <div class="inspector-dual-col you-col">
        <div class="dual-col-head">You: <b>${esc(you.cardName)}</b>${esc(sideMarkers(you))}</div>
        ${statCompareHTML('You', you)}
        ${youDef && youDef.text ? `<div class="dual-card-text">${boldCardKeywords(esc(youDef.text))}</div>` : ''}
      </div>
      <div class="inspector-dual-col cpu-col">
        <div class="dual-col-head">CPU: <b>${esc(cpu.cardName)}</b>${esc(sideMarkers(cpu))}</div>
        ${statCompareHTML('CPU', cpu)}
        ${cpuDef && cpuDef.text ? `<div class="dual-card-text">${boldCardKeywords(esc(cpuDef.text))}</div>` : ''}
      </div>
    </div>
    <div class="breakdown inspector-breakdown">${beatsHTML}</div>
  </div>`;
}

function universalInspectorContentHTML(g) {
  if (!g) return '';
  const target = g.inspectorTarget;
  if (target) {
    if (target.kind === 'card' && target.card) {
      return inspectorCardViewHTML(g, target.card, target.rawCard || target.card, !!target.isEX);
    }
    if (target.kind === 'innate' && target.player) {
      const p = target.player;
      const char = CHARACTERS[p.characterKey] || {};
      const whoLabel = target.who === 'human' ? 'You' : 'CPU';
      return `<div class="inspector-ability-view">
        <div class="inspector-head">
          <span class="inspector-title">${esc(char.name || p.name)} (${whoLabel})</span>
          <span class="insp-type-badge">${p.exceeded ? 'EXCEEDED' : 'INNATE'}</span>
        </div>
        <div class="info-row char-ability ${!p.exceeded ? 'active-ability' : ''}"><b>Normal Innate:</b> ${esc(char.innateText || '')}</div>
        <div class="info-row char-ability ${p.exceeded ? 'active-ability' : ''}"><b>Exceeded [${char.exceedCost || 0} Gauge]:</b> ${esc(char.exceedText || '')}</div>
      </div>`;
    }
    if (target.kind === 'boost' && target.boostEntry && target.card) {
      const b = target.boostEntry;
      const c = target.card;
      const whoLabel = target.who === 'human' ? 'You' : 'CPU';
      const expiry = b.turnsUntilExpire != null
        ? `Expires in ${b.turnsUntilExpire} turn${b.turnsUntilExpire === 1 ? '' : 's'}`
        : 'Sustained in play';
      const bId = esc(c.uid || c.key || '');
      return `<div class="inspector-boost-view">
        <div class="inspector-head">
          <span class="inspector-title">⚡ ${esc(c.name)} (${whoLabel})</span>
          <span class="inspector-badges"><span class="insp-type-badge special">${esc(expiry)}</span>${bId ? `<button type="button" class="insp-full-btn" onclick="G && G.openCardModal('${bId}', { isEX: false, sourceLabel: 'Active Boost (${whoLabel})' })">Full Card</button>` : ''}</span>
        </div>
        <div class="inspector-boost-box">
          ${boostHeadline(c)}
          ${forceCostBadge(c)}<span class="inspector-boost-text">${boldCardKeywords(esc(c.boostText || ''))}</span>
        </div>
      </div>`;
    }
  }

  if (g.mode === 'awaiting_action' && g.selectedActionCardUid) {
    const selCard = g.human().hand.find(c => c.uid === g.selectedActionCardUid);
    if (selCard) return inspectorCardViewHTML(g, selCard, selCard, false);
  }

  if (g.mode === 'strike_result') {
    return inspectorStrikeResultHTML(g);
  }

  const help = MODE_HELP[g.mode];
  return `<div class="inspector-idle-view">
    ${help ? `<div class="inspector-coach-summary"><div class="coach-title">${esc(help.title)}</div><div class="coach-body">${esc(help.body)}</div></div>` : ''}
    <div class="inspector-idle-prompt">Hover or focus any card tile, Innate pill, or Boost pill to inspect full rules text &amp; live Strike Preview.</div>
  </div>`;
}

function updateUniversalInspectorSlot() {
  if (typeof document === 'undefined' || !G) return;
  const slot = document.getElementById('universal-inspector-slot');
  if (slot) slot.innerHTML = universalInspectorContentHTML(G);
}

function setDragZoneActive(active) {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('boost-drop-zone');
  if (el && el.classList) {
    if (active) el.classList.add('drag-active');
    else el.classList.remove('drag-active');
  }
}

function rightRailHTML(g) {
  const tab = g.rightRailTab || 'log';
  const mobileTab = g.mobilePanelTab || 'inspector';
  const collapsed = !!g.rightRailCollapsed;
  const nmInfo = normalMatrixData(g.ai());
  const isMuted = typeof UXSettings !== 'undefined' && !!UXSettings.get('muted');
  const isFs = typeof isFullscreenActive === 'function' && isFullscreenActive();
  const fsLabel = isFs ? 'Exit Fullscreen (F)' : 'Toggle Fullscreen (F)';
  const fsBtnHTML = `<button type="button" class="util-mini-btn fullscreen-btn${isFs ? ' active' : ''}" data-fullscreen-btn="true" onclick="toggleFullscreen()" aria-pressed="${isFs ? 'true' : 'false'}" aria-label="${fsLabel}" title="${fsLabel}">${isFs ? '\u2922' : '\u26F6'}</button>`;

  if (collapsed) {
    return '';
  }

  let tabBody = '';
  if (tab === 'normals') {
    tabBody = normalMatrixHTML(g.ai());
  } else if (tab === 'coach') {
    const hint = trainerPanelHTML(g);
    tabBody = `<div class="rail-coach-panel">
      <div class="btn-row rail-coach-actions">
        <button type="button" onclick="G.suggestMove()">Suggest a move</button>
        <button type="button" class="study-toggle-btn${g.studyMode ? ' active' : ''}" onclick="G.toggleStudyMode()">Study Mode: ${g.studyMode ? 'ON' : 'OFF'}</button>
      </div>
      ${hint || '<div class="hint-panel">Click <b>Suggest a move</b> or <b>Ask Coach</b> for Trainer advice, or turn on <b>Study Mode</b> for search diagnostics.</div>'}
      ${coachPanelHTML(g.mode)}
    </div>`;
  } else {
    tabBody = logHTML(g.engine);
  }

  const cardMode = (typeof g.getCardViewMode === 'function') ? g.getCardViewMode() : 'auto';
  const cardModeLabel = cardMode === 'full' ? 'Full' : (cardMode === 'compact' ? 'Compact' : 'Auto');
  const cardViewBtnHTML = `<button type="button" class="util-mini-btn card-view-btn${cardMode !== 'auto' ? ' active' : ''}" data-card-view-btn="true" onclick="G.cycleCardViewMode()" title="Hand card display: Auto (expands when space permits), Full, or Compact. Double-tap or right-click any card for full view."><span class="cv-prefix">Cards: </span>${cardModeLabel}</button>`;

  return `<div class="rail-drawer-backdrop" onclick="G.toggleRightRail()"></div>
  <aside class="right-rail drawer-open" data-mobile-tab="${mobileTab}" aria-label="Tactical Right Rail">
    <div class="rail-utility-strip">
      <button type="button" class="util-mini-btn${isMuted ? ' muted' : ''}" onclick="G.toggleMute()" title="Toggle Audio">${isMuted ? '🔇' : '🔊'}</button>
      <button type="button" class="settings-btn" onclick="toggleSettingsPopover()" title="Settings">⚙</button>
      ${fsBtnHTML}
      ${cardViewBtnHTML}
      <button type="button" class="study-toggle-btn${g.studyMode ? ' active' : ''}" onclick="G.toggleStudyMode()">Study: ${g.studyMode ? 'ON' : 'OFF'}</button>
      <button type="button" class="rules-btn" aria-label="Open How to Play Command Manual" onclick="openHowToPlay()">Rules</button>
      <button type="button" class="rail-collapse-btn" onclick="G.toggleRightRail()" title="Collapse Right Rail" aria-label="Collapse Right Rail" aria-expanded="true">▶</button>
    </div>
    <div id="universal-inspector-slot" class="universal-inspector">
      ${universalInspectorContentHTML(g)}
    </div>
    <div class="rail-lower-tabs">
      <div class="rail-tab-bar" role="tablist">
        <button type="button" role="tab" aria-selected="${mobileTab === 'inspector' ? 'true' : 'false'}" data-mobile-tab-btn="inspector" class="rail-tab-btn mobile-only-tab${mobileTab === 'inspector' ? ' active' : ''}" onclick="G.setMobilePanelTab('inspector')">Inspect</button>
        <button type="button" role="tab" aria-selected="${tab === 'log' ? 'true' : 'false'}" data-rail-tab="log" data-mobile-tab-btn="log" class="rail-tab-btn${tab === 'log' ? ' active' : ''}" onclick="G.setRightRailTab('log')">Log</button>
        <button type="button" role="tab" aria-selected="${tab === 'normals' ? 'true' : 'false'}" data-rail-tab="normals" data-mobile-tab-btn="normals" class="rail-tab-btn${tab === 'normals' ? ' active' : ''}" onclick="G.setRightRailTab('normals')">Normals [${nmInfo.totalRemaining}/${nmInfo.totalMax}]</button>
        <button type="button" role="tab" aria-selected="${tab === 'coach' ? 'true' : 'false'}" data-rail-tab="coach" data-mobile-tab-btn="coach" class="rail-tab-btn${tab === 'coach' ? ' active' : ''}" onclick="G.setRightRailTab('coach')">Coach${g.coachUnreadDot ? '<span class="coach-unread-dot" aria-label="Unread coach advice">●</span>' : ''}</button>
      </div>
      <div class="rail-tab-content">
        ${tabBody}
      </div>
    </div>
  </aside>`;
}

function modDeltaPillHTML(label, baseVal, delta) {
  if (!delta) return '';
  const afterVal = baseVal + delta;
  const sign = delta > 0 ? `+${delta}` : String(delta);
  const cls = delta > 0 ? 'up' : 'down';
  return `<span class="mod-delta-pill ${cls}">${esc(label)} ${baseVal} → ${afterVal} (${sign})</span>`;
}

function promptCardModPreviewHTML(g) {
  if (!g || !g.engine) return '';
  const engine = g.engine;
  const p = g.human();
  const opp = g.ai();
  const char = CHARACTERS[p.characterKey] || {};
  const mode = g.mode;
  const req = g.sel && g.sel.request;
  let card = (g.sel && (g.sel.card || g.sel.resolvingCard)) || null;
  if (!card && req && (req.cardKey || req.cardName)) {
    card = resolveCardDef(req.cardKey || req.cardName);
  }

  let masked = false;
  let titleText = '';
  let typeKey = (card && card.type) || 'normal';
  let baseStatsHTML = '';
  let bodyNoteHTML = '';
  const deltas = { pow: 0, spd: 0, arm: 0, grd: 0 };
  let rangeMaxDelta = 0;
  const tags = [];

  if (mode === 'critical_choice') {
    masked = !!(g.sel && g.sel.hideCardName);
    const dist = engine.range(p, opp);
    if (masked) {
      titleText = 'Wild Swing (Unrevealed Card)';
      typeKey = 'masked';
      if (char.wildSwingCriticalStatMods) {
        const b = char.wildSwingCriticalStatMods(p) || {};
        deltas.pow += b.pow || 0;
        deltas.spd += b.spd || 0;
        deltas.arm += b.arm || 0;
        deltas.grd += b.grd || 0;
      }
      if (char.extraCriticalStatsIfOpponentAtRange1 && dist === 1) {
        const b = char.extraCriticalStatsIfOpponentAtRange1(p) || {};
        deltas.pow += b.pow || 0;
        deltas.spd += b.spd || 0;
        deltas.arm += b.arm || 0;
        deltas.grd += b.grd || 0;
      }
      if (char.grantsMutualCriticalPow) {
        const b = char.grantsMutualCriticalPow(p) || {};
        if (b.pow) tags.push(`Both Players +${b.pow} POW`);
      }
      bodyNoteHTML = '<div class="prompt-mod-note masked">Top of deck remains hidden until reveal — only public Critical bonuses are shown.</div>';
    } else if (card) {
      titleText = card.name + (card.isEX ? ' (EX)' : '');
      const crit = card.critical || {};
      const sm = crit.statMods || {};
      deltas.pow += sm.pow || 0;
      deltas.spd += sm.spd || 0;
      deltas.arm += sm.arm || 0;
      deltas.grd += sm.grd || 0;
      if (char.extraCriticalStatsIfOpponentAtRange1 && dist === 1) {
        const b = char.extraCriticalStatsIfOpponentAtRange1(p) || {};
        deltas.pow += b.pow || 0;
        deltas.spd += b.spd || 0;
        deltas.arm += b.arm || 0;
        deltas.grd += b.grd || 0;
      }
      if (char.grantsMutualCriticalPow) {
        const b = char.grantsMutualCriticalPow(p) || {};
        if (b.pow) tags.push(`Mutual +${b.pow} POW`);
      }
      if (crit.ignoreArmor) tags.push('Ignores Armor');
      if (crit.ignoreGuard) tags.push('Ignores Guard');
      if (crit.stunImmune) tags.push('Stun Immune');
      const ultraCost = (card.type === 'ultra' && !(typeof engine.gaugeCostsAreFree === 'function' && engine.gaugeCostsAreFree(p)))
        ? (card.gaugeCost || 0) : 0;
      if (ultraCost > 0 && (engine.gaugeCount(p) - 1) < ultraCost) {
        tags.push('Warning: Paying 1 Gauge leaves too little Gauge for this Ultra (will Wild Swing)');
      }
      if (card.criticalText) {
        bodyNoteHTML = `<div class="prompt-mod-crit">${boldCardKeywords(esc(card.criticalText))}</div>`;
      }
    }
  } else if (mode === 'face_up_choice' && card) {
    titleText = card.name + (card.isEX ? ' (EX)' : '');
    const bonus = (char.faceUpStatBonus && char.faceUpStatBonus(p)) || {};
    deltas.pow += bonus.pow || 0;
    deltas.spd += bonus.spd || 0;
    deltas.arm += bonus.arm || 0;
    deltas.grd += bonus.grd || 0;
    if (bonus.ignoreArmor) tags.push('Ignores Armor');
    if (card.text) bodyNoteHTML = `<div class="prompt-mod-note">${boldCardKeywords(esc(card.text))}</div>`;
  } else if (mode === 'set_time_option_choice' && card) {
    titleText = card.name + (card.isEX ? ' (EX)' : '');
    const key = p.characterKey;
    if (key === 'noel') deltas.spd += 1;
    else if (key === 'may') deltas.pow += p.exceeded ? 2 : 1;
    else if (key === 'anji') {
      deltas.spd -= 1;
      if (p.exceeded) deltas.arm += 2;
      else deltas.grd += 2;
    } else if (key === 'nu13') {
      rangeMaxDelta = 4;
    } else if (key === 'ramlethal') {
      rangeMaxDelta = 1;
      if (p.exceeded) deltas.pow += 1;
    } else if (key === 'jin') {
      tags.push('After: Draw 2');
    } else if (key === 'tager') {
      tags.push('Before: Pull 2');
    } else if (g.sel && g.sel.text) {
      tags.push(g.sel.text);
    }
    if (card.text) bodyNoteHTML = `<div class="prompt-mod-note">${boldCardKeywords(esc(card.text))}</div>`;
  } else if (mode === 'block_force_choice' && req) {
    titleText = (card && card.name) || req.cardName || 'Block';
    const spend = engine.sumForceValue(p, g.sel.chosen || []);
    const baseArm = card && card.arm != null ? card.arm : (req.defenderArmBase || 0);
    if (spend > 0) {
      tags.push(`ARM ${baseArm} → ${baseArm + spend * 2} (+${spend * 2})`);
    } else {
      tags.push(`+2 ARM per Force (max ${req.maxForce}F)`);
    }
    const projDmg = Math.max(0, (req.attackerPow || 0) - (req.defenderArmBase || 0) - spend * 2);
    tags.push(`Proj. DMG ${projDmg}`);
    if (card && card.text) bodyNoteHTML = `<div class="prompt-mod-note">${boldCardKeywords(esc(card.text))}</div>`;
  } else if (mode === 'optional_force_spend_pow_choice' && req) {
    titleText = (card && card.name) || req.cardName || 'Attack';
    const spend = Math.min(g._forcePowSpend == null ? 0 : g._forcePowSpend, req.max || 0);
    const perForce = req.powPerForce || 1;
    if (card && spend > 0) {
      deltas.pow += spend * perForce;
    } else {
      tags.push(`+${perForce} POW per Force (up to ${req.max || 0}F)`);
    }
    if (card && card.text) bodyNoteHTML = `<div class="prompt-mod-note">${boldCardKeywords(esc(card.text))}</div>`;
  } else if (
    (mode === 'optional_gauge_spend_choice' ||
     mode === 'optional_retreat_choice' ||
     mode === 'hadoken_recycle_choice' ||
     mode === 'grasp_choice' ||
     mode === 'place_eddie_choice' ||
     mode === 'may_exceed_choice' ||
     mode === 'named_choice_effect') && card
  ) {
    titleText = card.name + (card.isEX ? ' (EX)' : '');
    if (mode === 'grasp_choice' && req) {
      const min = req.min != null ? req.min : 1;
      const max = req.max != null ? req.max : 2;
      const amt = g._graspAmount == null ? max : Math.max(min, Math.min(max, g._graspAmount));
      const dir = req.forceDirection || g._graspDir || 'retreat';
      tags.push(`${dir === 'advance' ? 'Pull' : 'Push'} ${amt}`);
    } else if (mode === 'hadoken_recycle_choice') {
      tags.push('Hit: Deck Top vs Keep in Gauge');
    } else if (mode === 'optional_gauge_spend_choice' && req) {
      tags.push(`Optional: Spend ${req.amount} Gauge`);
    } else if (mode === 'optional_retreat_choice' && req) {
      tags.push(`Optional: Retreat ${req.amount}`);
    } else if (mode === 'place_eddie_choice') {
      tags.push('After: Place Eddie');
    } else if (mode === 'may_exceed_choice') {
      tags.push('After: Free Exceed');
    } else if (mode === 'named_choice_effect' && req && req.promptText) {
      tags.push(req.promptText);
    }
    if (card.text) bodyNoteHTML = `<div class="prompt-mod-note">${boldCardKeywords(esc(card.text))}</div>`;
  } else {
    return '';
  }

  if (!masked && !card) return '';
  if (!masked && card) {
    baseStatsHTML = `<div class="prompt-mod-base-stats">${statLine(card, { extraClass: 'stat-inline' })}</div>`;
  }

  const deltaChips = [];
  if (!masked && card) {
    if (rangeMaxDelta && Array.isArray(card.range)) {
      const lo = card.range[0], hi = card.range[1];
      deltaChips.push(`<span class="mod-delta-pill up">RNG ${lo}~${hi} → ${lo}~${hi + rangeMaxDelta} (+${rangeMaxDelta})</span>`);
    }
    if (deltas.spd) deltaChips.push(modDeltaPillHTML('SPD', card.spd || 0, deltas.spd));
    if (deltas.pow) deltaChips.push(modDeltaPillHTML('POW', card.pow || 0, deltas.pow));
    if (deltas.arm) deltaChips.push(modDeltaPillHTML('ARM', card.arm || 0, deltas.arm));
    if (deltas.grd) deltaChips.push(modDeltaPillHTML('GRD', card.grd || 0, deltas.grd));
  } else if (masked) {
    if (deltas.spd) deltaChips.push(`<span class="mod-delta-pill up">${deltas.spd > 0 ? '+' : ''}${deltas.spd} SPD</span>`);
    if (deltas.pow) deltaChips.push(`<span class="mod-delta-pill up">${deltas.pow > 0 ? '+' : ''}${deltas.pow} POW</span>`);
    if (deltas.arm) deltaChips.push(`<span class="mod-delta-pill up">${deltas.arm > 0 ? '+' : ''}${deltas.arm} ARM</span>`);
    if (deltas.grd) deltaChips.push(`<span class="mod-delta-pill up">${deltas.grd > 0 ? '+' : ''}${deltas.grd} GRD</span>`);
  }
  for (const t of tags) {
    deltaChips.push(`<span class="mod-delta-pill tag">${esc(t)}</span>`);
  }

  return `<div class="stage-prompt-mod-preview ${esc(typeKey)}${masked ? ' is-masked' : ''}" data-preview-mode="${esc(mode)}">
    <div class="prompt-mod-head">
      <span class="prompt-mod-name">${esc(titleText)}</span>
      <span class="insp-type-badge ${esc(typeKey)}">${masked ? 'HIDDEN' : esc((typeKey || 'normal').toUpperCase())}</span>
    </div>
    ${baseStatsHTML}
    ${deltaChips.length ? `<div class="prompt-mod-deltas">${deltaChips.join('')}</div>` : ''}
    ${bodyNoteHTML}
  </div>`;
}

function stagePromptBarHTML(g) {
  const engine = g.engine;
  if (g.mode === 'strike_result') {
    const info = engine.lastStrikeInfo;
    const tlStepIdx = (info && typeof StrikePlaybackController !== 'undefined' && typeof StrikePlaybackController.getCurrentStepIdx === 'function')
      ? StrikePlaybackController.getCurrentStepIdx(info)
      : ((info && info.timeline) || []).length - 1;
    const tlSlot = (info && typeof StrikePlaybackController !== 'undefined')
      ? StrikePlaybackController.timelineBarHTML(info, tlStepIdx)
      : '';
    return `<div id="stage-prompt-bar" class="stage-prompt-bar strike-result-bar">
      <div id="trigger-timeline-slot">${tlSlot}</div>
    </div>`;
  }

  let content = '';
  if (g.mode === 'move_setup') {
    const p = g.human(), opp = g.ai();
    const dirs = ['advance', 'retreat'];
    content = `<div class="stage-prompt-inline">
      <span class="stage-prompt-title">Move</span>
      <div class="btn-row">${dirs.map(d => `<button type="button" onclick="G.setMoveDir('${d}')" class="${g.sel.dir === d ? 'active' : ''}">${d[0].toUpperCase() + d.slice(1)}</button>`).join('')}</div>
      ${g.sel.dir ? `
        <div class="stepper-row">
          <button type="button" onclick="G.adjustMoveSpaces(-1)">\u2212</button>
          <span class="stepper-val">${g.sel.spaces} space(s) (${g.forceForMove(p, opp, g.sel.dir, g.sel.spaces)}F)</span>
          <button type="button" onclick="G.adjustMoveSpaces(1)">+</button>
        </div>
        <button type="button" class="big-btn" onclick="G.confirmMove()">Confirm Move</button>
      ` : ''}
      <button type="button" class="cancel-btn" onclick="G.setMode('awaiting_action', {}); render();">Cancel</button>
    </div>`;
  } else if (g.mode === 'changecards_setup') {
    content = `<div class="stage-prompt-inline">
      <span class="stage-prompt-title">Change Cards</span>
      <div class="stepper-row">
        <button type="button" onclick="G.adjustChangeCards(-1)">\u2212</button>
        <span class="stepper-val">Spend ${g.sel.n} card(s) as Force</span>
        <button type="button" onclick="G.adjustChangeCards(1)">+</button>
      </div>
      <button type="button" class="big-btn" onclick="G.confirmChangeCards()">Choose cards\u2026</button>
      <button type="button" class="cancel-btn" onclick="G.setMode('awaiting_action', {}); render();">Cancel</button>
    </div>`;
  } else if (g.mode === 'set_time_option_choice') {
    const card = g.sel && g.sel.card;
    content = `<div class="stage-prompt-inline">
      <span class="stage-prompt-title">${esc((g.sel && g.sel.text) || 'Use your Innate?')} (${esc(card ? card.name : 'attack')})</span>
      <div class="btn-row">
        <button type="button" class="big-btn" onclick="G.resolveSetTimeOption(true)">${esc((g.sel && g.sel.text) || 'Pay')}</button>
        <button type="button" class="cancel-btn" onclick="G.resolveSetTimeOption(false)">Skip</button>
      </div>
    </div>`;
  } else if (g.mode === 'overdrive_choice') {
    const opts = (g.sel && g.sel.options) || [];
    content = `<div class="stage-prompt-inline">
      <span class="stage-prompt-title">Overdrive</span>
      <div class="btn-row">${opts.map(o => `<button type="button" class="big-btn" onclick="G.resolveOverdriveChoice('${o.key}')">${esc(o.label)}</button>`).join('')}</div>
    </div>`;
  } else if (g.mode === 'retreat_after_boost_choice') {
    content = `<div class="stage-prompt-inline">
      <span class="stage-prompt-title">Retreat 1? (Innate)</span>
      <div class="btn-row">
        <button type="button" class="big-btn" onclick="G.resolveRetreatAfterBoostChoice(true)">Retreat 1</button>
        <button type="button" class="cancel-btn" onclick="G.resolveRetreatAfterBoostChoice(false)">Don't retreat</button>
      </div>
    </div>`;
  } else if (g.mode === 'name_choice') {
    content = `<div class="stage-prompt-inline">
      <span class="stage-prompt-title">${esc(g.sel.promptText || 'Name a card')}</span>
      <div class="btn-row name-choice-inline">${(g.sel.namePool || []).map(key => `<button type="button" onclick="G.pickNamedKey('${key}')">${esc(cardNameForKey(key))}</button>`).join('')}</div>
      <button type="button" class="cancel-btn" onclick="G.setMode('awaiting_action', {}); render();">Cancel</button>
    </div>`;
  } else if (g.mode === 'name_range_choice') {
    const namedRange = g._namedRange == null ? 1 : Math.max(1, Math.min(8, g._namedRange));
    content = `<div class="stage-prompt-inline">
      <span class="stage-prompt-title">${esc(g.sel.promptText || 'Name a Range')}</span>
      <div class="stepper-row">
        <button type="button" onclick="G.setNamedRange(${namedRange}-1);">\u2212</button>
        <span class="stepper-val">Range ${namedRange}</span>
        <button type="button" onclick="G.setNamedRange(${namedRange}+1);">+</button>
      </div>
      <button type="button" class="big-btn" onclick="G.pickNamedRange(${namedRange});">Confirm</button>
      <button type="button" class="cancel-btn" onclick="G.setMode('awaiting_action', {}); render();">Cancel</button>
    </div>`;
  } else if (g.mode === 'boost_target_choice') {
    const targets = g.sel.boostTargets || [];
    content = `<div class="stage-prompt-inline">
      <span class="stage-prompt-title">Discard opponent boost:</span>
      <div class="btn-row">${targets.map(t => `<button type="button" onclick="G.pickBoostTarget('${t.uid}')">${esc(t.name)}</button>`).join('')}</div>
      <button type="button" class="cancel-btn" onclick="G.setMode('awaiting_action', {}); render();">Cancel</button>
    </div>`;
  } else if (g.mode === 'face_up_choice') {
    const card = g.sel.card;
    const char = CHARACTERS[g.human().characterKey];
    const bonus = (char.faceUpStatBonus && card) ? (char.faceUpStatBonus(g.human()) || {}) : {};
    const bonusText = [bonus.pow ? `+${bonus.pow}POW` : '', bonus.spd ? `+${bonus.spd}SPD` : '', bonus.ignoreArmor ? 'Ignores ARM' : ''].filter(Boolean).join(' and ');
    content = `<div class="stage-prompt-inline">
      <span class="stage-prompt-title">Set ${esc(card ? card.name : 'attack')} face up?</span>
      <div class="btn-row">
        <button type="button" class="big-btn" onclick="G.resolveFaceUpChoice(true)">Face Up (${esc(bonusText)})</button>
        <button type="button" class="cancel-btn" onclick="G.resolveFaceUpChoice(false)">Face Down</button>
      </div>
    </div>`;
  } else if (g.mode === 'critical_choice') {
    const gauge = g.human().gauge.length;
    const card = g.sel.card;
    const shown = g.sel.hideCardName ? 'Wild Swing' : (card ? card.name + (card.isEX ? ' (EX)' : '') : 'this card');
    content = `<div class="stage-prompt-inline">
      <span class="stage-prompt-title">Pay 1 Gauge for Critical on ${esc(shown)}? (Gauge: ${gauge})</span>
      <div class="btn-row">
        <button type="button" class="big-btn" onclick="G.resolveCriticalChoice(true)">Pay 1 Gauge</button>
        <button type="button" class="cancel-btn" onclick="G.resolveCriticalChoice(false)">Don't pay</button>
      </div>
    </div>`;
  } else if (g.mode === 'grasp_choice') {
    const req = g.sel.request;
    const min = req.min != null ? req.min : 1;
    const max = req.max != null ? req.max : 2;
    const graspAmount = (g._graspAmount == null) ? max : Math.max(min, Math.min(max, g._graspAmount));
    const graspDir = req.forceDirection || g._graspDir || 'retreat';
    content = `<div class="stage-prompt-inline">
      <span class="stage-prompt-title">${min === max ? `Grasp (${min})` : 'Move opponent'}</span>
      ${min === max ? '' : `<div class="stepper-row">
        <button type="button" onclick="G.setGraspAmount(Math.max(${min},${graspAmount}-1));">\u2212</button>
        <span class="stepper-val">${graspAmount} space(s)</span>
        <button type="button" onclick="G.setGraspAmount(Math.min(${max},${graspAmount}+1));">+</button>
      </div>`}
      ${req.forceDirection ? '' : `<div class="btn-row">
        <button type="button" class="${graspDir === 'advance' ? 'active' : ''}" onclick="G.setGraspDir('advance');">Pull</button>
        <button type="button" class="${graspDir === 'retreat' ? 'active' : ''}" onclick="G.setGraspDir('retreat');">Push</button>
      </div>`}
      <button type="button" class="big-btn" onclick="G.resolveGraspChoice(${graspAmount}, '${graspDir}');">Confirm</button>
    </div>`;
  } else if (g.mode === 'named_choice_effect') {
    const req = g.sel.request;
    content = `<div class="stage-prompt-inline">
      <span class="stage-prompt-title">${esc(req.promptText || 'Choose an effect')}</span>
      <div class="btn-row">
        ${(req.options || []).map(o => `<button type="button" class="big-btn" onclick="G.resolveNamedChoiceEffect('${o.key}')">${esc(o.label)}</button>`).join('')}
        ${req.allowDecline ? `<button type="button" class="cancel-btn" onclick="G.resolveNamedChoiceEffect(null)">Decline</button>` : ''}
      </div>
    </div>`;
  } else if (g.mode === 'may_exceed_choice') {
    const req = g.sel.request;
    content = `<div class="stage-prompt-inline">
      <span class="stage-prompt-title">${esc(req.promptText || 'Exceed?')}</span>
      <div class="btn-row">
        <button type="button" class="big-btn" onclick="G.resolveMayExceedChoice(true)">Exceed</button>
        <button type="button" class="cancel-btn" onclick="G.resolveMayExceedChoice(false)">Don't Exceed</button>
      </div>
    </div>`;
  } else if (g.mode === 'hadoken_recycle_choice') {
    content = `<div class="stage-prompt-inline">
      <span class="stage-prompt-title">Hadoken hit — recycle to top of Deck?</span>
      <div class="btn-row">
        <button type="button" class="big-btn" onclick="G.resolveHadokenRecycle(true)">Recycle to Deck</button>
        <button type="button" class="cancel-btn" onclick="G.resolveHadokenRecycle(false)">Keep in Gauge</button>
      </div>
    </div>`;
  } else if (g.mode === 'sustain_choice') {
    const req = g.sel.request;
    content = `<div class="stage-prompt-inline">
      <span class="stage-prompt-title">Sustain ${esc(req.cardName)} boost?</span>
      <div class="btn-row">
        <button type="button" class="big-btn" onclick="G.resolveSustainChoice(true)">Sustain it</button>
        <button type="button" class="cancel-btn" onclick="G.resolveSustainChoice(false)">Let it go</button>
      </div>
    </div>`;
  } else if (g.mode === 'sustain_choice_paid') {
    const req = g.sel.request;
    content = `<div class="stage-prompt-inline">
      <span class="stage-prompt-title">Sustain ${esc(req.cardName)} (${req.cost} Force)?</span>
      <div class="btn-row">
        <button type="button" class="big-btn" onclick="G.resolveSustainChoicePaid(true)">Spend ${req.cost} Force</button>
        <button type="button" class="cancel-btn" onclick="G.resolveSustainChoicePaid(false)">Let it go</button>
      </div>
    </div>`;
  } else if (g.mode === 'optional_force_spend_pow_choice') {
    const req = g.sel.request;
    const forcePowSpend = Math.min(g._forcePowSpend == null ? 0 : g._forcePowSpend, req.max);
    content = `<div class="stage-prompt-inline">
      <span class="stage-prompt-title">${esc(req.cardName)}: spend Force for +POW?</span>
      <div class="stepper-row">
        <button type="button" onclick="G.setForcePowSpend(${forcePowSpend}-1);">\u2212</button>
        <span class="stepper-val">${forcePowSpend}F (+${forcePowSpend} POW)</span>
        <button type="button" onclick="G.setForcePowSpend(Math.min(${req.max},${forcePowSpend}+1));">+</button>
      </div>
      <button type="button" class="big-btn" onclick="G.resolveOptionalForceSpendPow(${forcePowSpend});">Confirm</button>
    </div>`;
  } else if (g.mode === 'cancel_choice') {
    const gauge = g.human().gauge.length;
    content = `<div class="stage-prompt-inline">
      <span class="stage-prompt-title">Cancel (${esc(g.sel.cardName)}) — spend 1 Gauge for another action? (Gauge: ${gauge})</span>
      <div class="btn-row">
        <button type="button" class="big-btn" onclick="G.resolveCancelChoice(true)">Cancel (1 Gauge)</button>
        <button type="button" class="cancel-btn" onclick="G.resolveCancelChoice(false)">End turn</button>
      </div>
    </div>`;
  } else if (g.mode === 'optional_gauge_spend_choice') {
    const req = g.sel.request;
    content = `<div class="stage-prompt-inline">
      <span class="stage-prompt-title">${esc(req.cardName)} — spend ${req.amount} Gauge?</span>
      <div class="btn-row">
        <button type="button" class="big-btn" onclick="G.resolveOptionalGaugeSpend(true)">Spend ${req.amount} Gauge</button>
        <button type="button" class="cancel-btn" onclick="G.resolveOptionalGaugeSpend(false)">Don't spend</button>
      </div>
    </div>`;
  } else if (g.mode === 'optional_retreat_choice') {
    const req = g.sel.request;
    content = `<div class="stage-prompt-inline">
      <span class="stage-prompt-title">${esc(req.cardName)} — Retreat ${req.amount}?</span>
      <div class="btn-row">
        <button type="button" class="big-btn" onclick="G.resolveOptionalRetreat(true)">Retreat ${req.amount}</button>
        <button type="button" class="cancel-btn" onclick="G.resolveOptionalRetreat(false)">Stay put</button>
      </div>
    </div>`;
  } else if (g.mode === 'may_strike_choice') {
    content = `<div class="stage-prompt-inline">
      <span class="stage-prompt-title">Strike?${g.sel.freeCritical ? ' (Free Critical)' : ''}</span>
      <div class="btn-row">
        <button type="button" class="big-btn" onclick="G.resolveMayStrikeChoice(true)">Strike</button>
        <button type="button" class="cancel-btn" onclick="G.resolveMayStrikeChoice(false)">Don't Strike</button>
      </div>
    </div>`;
  } else if (g.mode === 'push_pull_choice') {
    content = `<div class="stage-prompt-inline">
      <span class="stage-prompt-title">${esc(g.sel.promptText || 'Push or Pull?')}</span>
      <div class="btn-row">
        <button type="button" class="big-btn" onclick="G.pickPushPullDirection('pull')">Pull</button>
        <button type="button" class="big-btn" onclick="G.pickPushPullDirection('push')">Push</button>
      </div>
    </div>`;
  } else if (g.mode === 'move_direction_choice') {
    content = `<div class="stage-prompt-inline">
      <span class="stage-prompt-title">${esc(g.sel.promptText || 'Advance or Retreat?')}</span>
      <div class="btn-row">
        <button type="button" class="big-btn" onclick="G.pickMoveDirection('advance')">Advance</button>
        <button type="button" class="big-btn" onclick="G.pickMoveDirection('retreat')">Retreat</button>
      </div>
    </div>`;
  } else if (g.mode === 'eddie_space_choice') {
    const p = g.human(), o = g.ai();
    content = `<div class="stage-prompt-inline">
      <span class="stage-prompt-title">${esc(g.sel.promptText || 'Place Eddie')}</span>
      <div class="btn-row">${(g.sel.spaces || []).map(s => `<button type="button" onclick="G.pickEddieSpace(${s})">Sp ${s + 1}${s === o.pos ? ' (CPU)' : (s === p.pos ? ' (You)' : '')}</button>`).join('')}</div>
    </div>`;
  } else if (g.mode === 'place_eddie_choice') {
    const req = g.sel.request;
    const p = g.human(), o = g.ai();
    content = `<div class="stage-prompt-inline">
      <span class="stage-prompt-title">${esc(req.cardName)} — place Eddie?</span>
      <div class="btn-row">
        ${(req.spaces || []).map(s => `<button type="button" onclick="G.resolvePlaceEddie(${s})">Sp ${s + 1}${s === o.pos ? ' (CPU)' : (s === p.pos ? ' (You)' : '')}</button>`).join('')}
        <button type="button" class="cancel-btn" onclick="G.resolvePlaceEddie(null)">Leave Eddie</button>
      </div>
    </div>`;
  } else if (g.mode === 'special_move1') {
    content = `<div class="stage-prompt-inline">
      <span class="stage-prompt-title">Move 1 space:</span>
      <div class="btn-row">
        <button type="button" onclick="G.resolveSpecialMove1('advance')">Toward opponent</button>
        <button type="button" onclick="G.resolveSpecialMove1('retreat')">Away from opponent</button>
      </div>
    </div>`;
  } else if (g.mode === 'char_exceed_strike_choice') {
    const player = g.human();
    content = `<div class="stage-prompt-inline">
      <span class="stage-prompt-title">Exceeded ${esc(CHARACTERS[player.characterKey].name)}: Strike now?</span>
      <div class="btn-row">
        <button type="button" class="big-btn" onclick="G.startStrike()">Strike now</button>
        <button type="button" class="cancel-btn" onclick="G.finishNonStrikeAction()">Skip — end turn</button>
      </div>
    </div>`;
  } else if (g.mode === 'char_exceed_action_choice') {
    const player = g.human();
    content = `<div class="stage-prompt-inline">
      <span class="stage-prompt-title">Exceeded ${esc(CHARACTERS[player.characterKey].name)}: take action now?</span>
      <div class="btn-row">
        <button type="button" class="big-btn" onclick="G.actionSpecial()">Take action now</button>
        <button type="button" class="cancel-btn" onclick="G.finishNonStrikeAction()">Skip — end turn</button>
      </div>
    </div>`;
  }

  const modPreview = promptCardModPreviewHTML(g);
  const combined = modPreview
    ? `<div class="stage-prompt-with-preview">${modPreview}${content || ''}</div>`
    : content;

  return `<div id="stage-prompt-bar" class="stage-prompt-bar${combined ? ' active' : ''}">
    <div id="trigger-timeline-slot"></div>
    ${combined}
  </div>`;
}

function actionPromptBarHTML(g) {
  const engine = g.engine;
  const p = g.human();
  const isMainAction = g.mode === 'awaiting_action' && engine.active === g.humanId;

  if (g.mode === 'awaiting_action') {
    if (!isMainAction) {
      return `<div class="action-prompt-row"><h3 class="thinking">CPU is thinking\u2026</h3></div>`;
    }
    const selCard = g.selectedActionCardUid ? p.hand.find(c => c.uid === g.selectedActionCardUid) : null;
    if (selCard) {
      const validStrike = typeof engine.isValidStrikeCard !== 'function' || engine.isValidStrikeCard(p, selCard);
      const canPayUltra = selCard.type !== 'ultra' || typeof engine.canPayUltra !== 'function' || engine.canPayUltra(p, selCard);
      const hasEXPair = validStrike && canPayUltra && p.hand.filter(c => c.key === selCard.key).length >= 2;
      return `<div class="precommit-bar">
        <span>Selected: <b>${esc(selCard.name)}</b></span>
        <button type="button" class="big-btn" onclick="G.confirmActionCard('strike')" ${validStrike ? '' : 'disabled'}>Play as Strike</button>
        ${hasEXPair ? `<button type="button" class="big-btn" onclick="G.confirmActionCard('ex')">EX Strike (+1 All)</button>` : ''}
        ${selCard.boost ? `<button type="button" class="big-btn" onclick="G.confirmActionCard('boost')">Play as Boost (${engine.cardBoostForce(selCard)} Force)</button>` : ''}
        <button type="button" class="cancel-btn" onclick="G.cancelActionCard()">Cancel</button>
      </div>`;
    }
    return actionButtons(g);
  }

  if (g.mode === 'strike_result') {
    const pauseAfter = (typeof UXSettings !== 'undefined' && !!UXSettings.get('pauseAfterStrike'));
    if (!pauseAfter) {
      return `<div class="action-prompt-row">
        <span class="prompt-label">Resolving Strike…</span>
        <button type="button" class="big-btn" onclick="if(typeof StrikePlaybackController!=='undefined') StrikePlaybackController.skip(); else G.continueAfterStrikeResult();">Skip ⏭</button>
      </div>`;
    }
    const beats = buildStrikeBeats(engine.lastStrikeInfo);
    const beginner = !!g.beginner;
    const beatIndex = beginner ? Math.max(0, Math.min(beats.length, g.beatIndex || 0)) : beats.length;
    const allRevealed = beatIndex >= beats.length;
    const progress = beginner && !allRevealed
      ? `Strike breakdown (${beatIndex}/${beats.length})`
      : 'Strike resolved';
    return `<div class="action-prompt-row">
      <span class="prompt-label">${progress}</span>
      ${beginner && !allRevealed ? `<button type="button" onclick="G.revealNextBeat()">Next</button><button type="button" onclick="G.revealAllBeats()">Show all</button>` : ''}
      <button type="button" class="big-btn" onclick="G.continueAfterStrikeResult()" ${(!beginner || allRevealed) ? '' : 'disabled'}>Continue</button>
    </div>`;
  }

  if (g.mode === 'mulligan_select') {
    const chosen = g.sel.chosen || [];
    return `<div class="action-prompt-row">
      <span class="prompt-label">Mulligan — tap cards to swap (free, one-time)</span>
      <span class="prompt-counter">Setting aside: ${chosen.length}</span>
      <button type="button" class="big-btn" onclick="G.confirmMulligan()">${chosen.length === 0 ? 'Keep hand' : `Swap ${chosen.length}`}</button>
    </div>`;
  }
  if (g.mode === 'strike_select') {
    return `<div class="action-prompt-row">
      <span class="prompt-label">Strike — pick a card to set face down</span>
      <button type="button" class="big-btn wildswing-btn" onclick="G.pickWildSwing()">Wild Swing (top of deck)</button>
      <button type="button" onclick="G.suggestStrike(false)">Ask Coach</button>
      <button type="button" class="cancel-btn" onclick="G.mode='awaiting_action'; render();">Cancel</button>
    </div>`;
  }
  if (g.mode === 'defend_select') {
    const forcedWildSwing = !!(g.sel && g.sel.forcedWildSwingOnly);
    const forcedUid = g.sel && g.sel.forcedUid;
    const forcedCard = forcedUid ? p.hand.find(c => c.uid === forcedUid) : null;
    const forcedKey = (g.sel && g.sel.forcedKey) || (forcedCard && forcedCard.key) || null;
    const cpuWildSwung = !!(g.pendingAiAttack && g.pendingAiAttack.fromWildSwing);
    const wildSwingNote = cpuWildSwung ? ' (Wild Swing)' : '';
    const faceUpNote = (g.pendingAiAttack && g.pendingAiAttack.faceUp)
      ? ` — face up: <b>${esc(g.pendingAiAttack.card.name)}</b>` : '';
    if (forcedWildSwing) {
      return `<div class="action-prompt-row">
        <span class="prompt-label">CPU struck${wildSwingNote}${faceUpNote}! CPU's Focus forces a <b>Wild Swing</b>.</span>
        <button type="button" class="big-btn wildswing-btn" onclick="G.humanDefend({type:'wildswing'})">Wild Swing</button>
      </div>`;
    }
    if (forcedKey || forcedUid) {
      const matchCount = forcedKey ? p.hand.filter(c => c.key === forcedKey).length : 1;
      const exHint = matchCount >= 2 ? ' (or EX with both copies)' : '';
      return `<div class="action-prompt-row">
        <span class="prompt-label">CPU struck${wildSwingNote}${faceUpNote}! Must defend with <b>${esc(g.sel.forcedName)}</b>${exHint}.</span>
      </div>`;
    }
    return `<div class="action-prompt-row">
      <span class="prompt-label">CPU struck${wildSwingNote}${faceUpNote}! Choose defense:</span>
      <button type="button" class="big-btn wildswing-btn" onclick="G.humanDefend({type:'wildswing'})">Wild Swing</button>
      <button type="button" onclick="G.suggestStrike(true)">Ask Coach</button>
    </div>`;
  }
  if (g.mode === 'boost_select') {
    return `<div class="action-prompt-row">
      <span class="prompt-label">Boost — pick a card to play face up</span>
      <button type="button" class="cancel-btn" onclick="G.mode='awaiting_action'; render();">Cancel</button>
    </div>`;
  }
  if (g.mode === 'move_force_select') {
    const chosen = g.sel.chosen || [];
    const selectedValue = engine.sumForceValue(p, chosen);
    return `<div class="action-prompt-row">
      <span class="prompt-label">Pay ${g.sel.force} Force for Move (Hand or Gauge)</span>
      <span class="prompt-counter">${selectedValue}/${g.sel.force} Force</span>
      <button type="button" class="big-btn" ${selectedValue === g.sel.force ? '' : 'disabled'} onclick="G.confirmMoveForce()">Confirm</button>
      <button type="button" class="cancel-btn" onclick="G.mode='awaiting_action'; render();">Cancel</button>
    </div>`;
  }
  if (g.mode === 'boost_force_select') {
    const card = p.hand.find(c => c.uid === g.sel.cardUid);
    const selectedValue = engine.sumForceValue(p, g.sel.chosen);
    return `<div class="action-prompt-row">
      <span class="prompt-label">Pay ${g.sel.need} Force for ${esc(card ? card.name : 'Boost')} (Hand or Gauge)</span>
      <span class="prompt-counter">${selectedValue}/${g.sel.need} Force</span>
      <button type="button" class="big-btn" ${selectedValue === g.sel.need ? '' : 'disabled'} onclick="G.confirmBoostForce()">Confirm</button>
      <button type="button" class="cancel-btn" onclick="G.mode='awaiting_action'; render();">Cancel</button>
    </div>`;
  }
  if (g.mode === 'action_force_select') {
    const selectedValue = engine.sumForceValue(p, g.sel.chosen);
    return `<div class="action-prompt-row">
      <span class="prompt-label">Pay ${g.sel.need} Force for character action (Hand or Gauge)</span>
      <span class="prompt-counter">${selectedValue}/${g.sel.need} Force</span>
      <button type="button" class="big-btn" ${selectedValue === g.sel.need ? '' : 'disabled'} onclick="G.confirmActionForce()">Confirm</button>
      <button type="button" class="cancel-btn" onclick="G.mode='awaiting_action'; render();">Cancel</button>
    </div>`;
  }
  if (g.mode === 'boost_bonus_force_select') {
    const card = p.hand.find(c => c.uid === g.sel.cardUid) || { name: 'boost' };
    const selectedValue = engine.sumForceValue(p, g.sel.bonusChosen);
    return `<div class="action-prompt-row">
      <span class="prompt-label">${esc(card.name)} — optional extra Force (up to ${g.sel.bonusMax})</span>
      <span class="prompt-counter">${selectedValue}/${g.sel.bonusMax} Force</span>
      <button type="button" class="big-btn" onclick="G.confirmBonusForce()">Confirm (${selectedValue} spent)</button>
    </div>`;
  }
  if (g.mode === 'changecards_select') {
    const chosen = g.sel.chosen || [];
    const projected = engine.sumForceValue(p, chosen);
    return `<div class="action-prompt-row">
      <span class="prompt-label">Choose ${g.sel.n} card(s) to spend as Force (Hand or Gauge)</span>
      <span class="prompt-counter">${chosen.length}/${g.sel.n} (draws ${projected})</span>
      <button type="button" class="big-btn" ${chosen.length === g.sel.n ? '' : 'disabled'} onclick="G.confirmChangeCardsSelect()">Confirm</button>
      <button type="button" class="cancel-btn" onclick="G.mode='awaiting_action'; render();">Cancel</button>
    </div>`;
  }
  if (g.mode === 'discard_to_seven') {
    const maxHand = engine.getMaxHandSize(p.characterKey);
    const need = Math.max(0, p.hand.length - maxHand);
    const chosen = g.sel.chosen || [];
    return `<div class="action-prompt-row">
      <span class="prompt-label">Hand size limit is ${maxHand} — discard ${need} card(s)</span>
      <span class="prompt-counter">${chosen.length}/${need}</span>
      <button type="button" class="big-btn" ${chosen.length === need ? '' : 'disabled'} onclick="G.confirmDiscardToSeven()">Confirm</button>
    </div>`;
  }
  if (g.mode === 'block_force_choice') {
    const req = g.sel.request;
    const chosen = g.sel.chosen || [];
    const spendValue = engine.sumForceValue(p, chosen);
    const potentialDmg = Math.max(0, req.attackerPow - req.defenderArmBase - (spendValue * 2));
    return `<div class="action-prompt-row">
      <span class="prompt-label">Block — spend Force for Armor (Proj. DMG: <b>${potentialDmg}</b> ${potentialDmg > req.defenderGuard ? 'STUN' : 'safe'})</span>
      <span class="prompt-counter">${spendValue}/${req.maxForce}F (+${spendValue * 2} ARM)</span>
      <button type="button" class="big-btn" onclick="G.confirmBlockForce()">Confirm</button>
    </div>`;
  }
  if (g.mode === 'action_gauge_select') {
    const chosen = g.sel.chosen || [];
    const max = g.sel.max;
    return `<div class="action-prompt-row">
      <span class="prompt-label">Choose up to ${max} card${max === 1 ? '' : 's'} to add to Gauge</span>
      <span class="prompt-counter">${chosen.length}/${max}</span>
      <button type="button" class="big-btn" ${chosen.length > 0 ? '' : 'disabled'} onclick="G.confirmActionGaugeSelect()">Confirm</button>
      <button type="button" class="cancel-btn" onclick="G.mode='awaiting_action'; render();">Cancel</button>
    </div>`;
  }
  if (g.mode === 'range_discard_choice') {
    return `<div class="action-prompt-row">
      <span class="prompt-label">Choose a card matching Range ${g.sel.namedRange} to discard</span>
    </div>`;
  }
  if (g.mode === 'decklook_choice') {
    const peeked = g.sel.peeked || [];
    const drawMode = !!g.sel.drawMode;
    return `<div class="action-prompt-row">
      <span class="prompt-label">${drawMode ? esc(g.sel.title || 'Draw 1 from top of deck') : `Sickle Storm — pick 1 of top ${peeked.length} to Boost or Strike`}</span>
      ${!drawMode ? `<button type="button" class="cancel-btn" onclick="G.confirmDeckLookChoice(null, null)">Discard all</button>` : ''}
    </div>`;
  }

  return `<div class="action-prompt-row"><span class="prompt-label">Resolve prompt above to continue</span></div>`;
}

function transientBoostDropZoneHTML(g) {
  const isMainAction = g.mode === 'awaiting_action' && g.engine.active === g.humanId;
  if (!isMainAction) return '';
  return `<div id="boost-drop-zone" class="boost-drop-zone transient-drop-zone${g.draggingCardUid ? ' drag-active' : ''}" ondragover="event.preventDefault()" ondrop="G.onBoostDrop(event)">Drop card here to <b>Boost</b> (or drag onto Arena to <b>Strike</b>)</div>`;
}

function renderUnifiedTilesWithGauge(g, handCards, gaugeCards, tileOptsFn) {
  let memoMap = null;
  if (typeof PreviewMemo !== 'undefined' && g && g.engine && typeof g.engine.getInformationSet === 'function') {
    const infoSet = g.engine.getInformationSet(g.humanId || 'p1');
    memoMap = PreviewMemo.evaluateHand(infoSet, handCards, g.engine, g.human());
  }
  const handHTMLPart = handCards.map(c => {
    const baseOpts = tileOptsFn ? tileOptsFn(c, 'hand') : {};
    const memo = memoMap && memoMap.get(c.uid || c.key);
    const lethalAura = !!(memo && memo.base && memo.base.isPublicStateLethal && !baseOpts.disabled);
    return cardTile(c, { ...baseOpts, lethalAura, fromSource: 'hand' });
  }).join('');
  const gaugeDivider = gaugeCards.length > 0
    ? '<div class="hand-gauge-divider" role="separator" aria-label="Gauge Cards"><span class="gauge-divider-label">GAUGE</span></div>'
    : '';
  const gaugeHTMLPart = gaugeCards.map(c => {
    const baseOpts = tileOptsFn ? tileOptsFn(c, 'gauge') : {};
    return cardTile(c, { ...baseOpts, fromSource: 'gauge' });
  }).join('');
  const totalCount = handCards.length + gaugeCards.length;
  return `<div class="hand-row${totalCount > 7 ? ' hand-row-scroll' : ''}">${handHTMLPart}${gaugeDivider}${gaugeHTMLPart}</div>`;
}

function unifiedHandDockHTML(g) {
  const engine = g.engine;
  const p = g.human();
  const opp = g.ai();
  const dist = engine.range(p, opp);
  const isMainAction = g.mode === 'awaiting_action' && engine.active === g.humanId;

  if (g.mode === 'decklook_choice') {
    const peeked = g.sel.peeked || [];
    const drawMode = !!g.sel.drawMode;
    const inner = peeked.map(c => `<div class="decklook-tile-wrap">
      ${cardTile(c, {})}
      <div class="btn-row decklook-tile-btns">
        ${drawMode
          ? `<button type="button" onclick="G.confirmDeckLookChoice('${c.uid}','draw')">Draw</button>`
          : `<button type="button" onclick="G.confirmDeckLookChoice('${c.uid}','boost')">Boost</button><button type="button" onclick="G.confirmDeckLookChoice('${c.uid}','strike')">Strike</button>`}
      </div>
    </div>`).join('');
    return `<div id="unified-hand-dock" class="hand-dock-band"><div class="hand-row${peeked.length > 7 ? ' hand-row-scroll' : ''}">${inner}</div></div>`;
  }

  if (g.mode === 'move_force_select') {
    const chosen = g.sel.chosen || [];
    return `<div id="unified-hand-dock" class="hand-dock-band">${renderUnifiedTilesWithGauge(g, p.hand, p.gauge, (c) => ({
      selected: chosen.includes(c.uid),
      onclick: `G.toggleMoveForceCard('${c.uid}')`,
    }))}</div>`;
  }
  if (g.mode === 'boost_force_select') {
    const handPool = p.hand.filter(c => c.uid !== g.sel.cardUid);
    return `<div id="unified-hand-dock" class="hand-dock-band">${renderUnifiedTilesWithGauge(g, handPool, p.gauge, (c) => ({
      selected: (g.sel.chosen || []).includes(c.uid),
      onclick: `G.toggleForceCard('${c.uid}')`,
    }))}</div>`;
  }
  if (g.mode === 'action_force_select') {
    return `<div id="unified-hand-dock" class="hand-dock-band">${renderUnifiedTilesWithGauge(g, p.hand, p.gauge, (c) => ({
      selected: (g.sel.chosen || []).includes(c.uid),
      onclick: `G.toggleActionForceCard('${c.uid}')`,
    }))}</div>`;
  }
  if (g.mode === 'changecards_select') {
    const chosen = g.sel.chosen || [];
    return `<div id="unified-hand-dock" class="hand-dock-band">${renderUnifiedTilesWithGauge(g, p.hand, p.gauge, (c) => ({
      selected: chosen.includes(c.uid),
      onclick: `G.toggleChangeCard('${c.uid}')`,
    }))}</div>`;
  }
  if (g.mode === 'boost_bonus_force_select') {
    const handPool = p.hand.filter(c => c.uid !== g.sel.cardUid);
    return `<div id="unified-hand-dock" class="hand-dock-band">${renderUnifiedTilesWithGauge(g, handPool, p.gauge, (c) => ({
      selected: (g.sel.bonusChosen || []).includes(c.uid),
      onclick: `G.toggleBonusForceCard('${c.uid}')`,
    }))}</div>`;
  }

  if (g.mode === 'strike_select') {
    const dupMap = new Map();
    for (const c of p.hand) {
      if (!dupMap.has(c.key)) dupMap.set(c.key, []);
      dupMap.get(c.key).push(c.uid);
    }
    const exTiles = exPairTiles(p.hand, (u1, u2) => `G.pickExStrike('${u1}','${u2}')`, 'strike', dist, engine, p, { isInitiator: true });
    return `<div id="unified-hand-dock" class="hand-dock-band">${handHTML(g, {
      tileOpts: (c, memo) => {
        const validStrike = typeof engine.isValidStrikeCard !== 'function' || engine.isValidStrikeCard(p, c);
        if (!validStrike) return { disabled: true };
        const canPayUltra = c.type !== 'ultra' || typeof engine.canPayUltra !== 'function' || engine.canPayUltra(p, c);
        const sameKeyUids = dupMap.get(c.key) || [];
        const otherUid = (sameKeyUids.length >= 2 && canPayUltra) ? sameKeyUids.find(u => u !== c.uid) : null;
        return {
          onclick: `G.pickStrikeCard('${c.uid}')`,
          highlight: 'strike',
          band: c.range,
          hoverPreview: true,
          exOtherUid: otherUid,
          exOnClick: otherUid ? `G.pickExStrike('${c.uid}','${otherUid}')` : null,
          rangeChip: previewToRangeChip(memo && memo.base, c, dist),
        };
      },
      exTiles,
    })}</div>`;
  }

  if (g.mode === 'defend_select') {
    const forcedWildSwing = !!(g.sel && g.sel.forcedWildSwingOnly);
    if (forcedWildSwing) {
      return `<div id="unified-hand-dock" class="hand-dock-band">${handHTML(g, {
        tileOpts: () => ({ disabled: true }),
      })}</div>`;
    }
    const dupMap = new Map();
    for (const c of p.hand) {
      if (!dupMap.has(c.key)) dupMap.set(c.key, []);
      dupMap.get(c.key).push(c.uid);
    }
    const forcedUid = g.sel && g.sel.forcedUid;
    const forcedCard = forcedUid ? p.hand.find(c => c.uid === forcedUid) : null;
    const forcedKey = (g.sel && g.sel.forcedKey) || (forcedCard && forcedCard.key) || null;
    const defendTileOpts = (c, memo) => {
      const validStrike = typeof engine.isValidStrikeCard !== 'function' || engine.isValidStrikeCard(p, c);
      if (!validStrike) return { disabled: true };
      const canPayUltra = c.type !== 'ultra' || typeof engine.canPayUltra !== 'function' || engine.canPayUltra(p, c);
      const sameKeyUids = dupMap.get(c.key) || [];
      const otherUid = (sameKeyUids.length >= 2 && canPayUltra) ? sameKeyUids.find(u => u !== c.uid) : null;
      return {
        onclick: `G.humanDefend({type:'hand', uid:'${c.uid}'})`,
        highlight: 'strike',
        band: c.range,
        hoverPreview: true,
        exOtherUid: otherUid,
        exOnClick: otherUid ? `G.humanDefend({type:'ex', uid1:'${c.uid}', uid2:'${otherUid}'})` : null,
        rangeChip: previewToRangeChip(memo && memo.base, c, dist),
      };
    };
    if (forcedKey || forcedUid) {
      const exTiles = forcedKey
        ? exPairTiles(p.hand, (u1, u2) => `G.humanDefend({type:'ex', uid1:'${u1}', uid2:'${u2}'})`, 'strike', dist, engine, p, { isInitiator: false, onlyKey: forcedKey })
        : '';
      return `<div id="unified-hand-dock" class="hand-dock-band">${handHTML(g, {
        tileOpts: (c, memo) => ((forcedKey ? c.key === forcedKey : c.uid === forcedUid) ? defendTileOpts(c, memo) : { disabled: true }),
        exTiles,
      })}</div>`;
    }
    const exTiles = exPairTiles(p.hand, (u1, u2) => `G.humanDefend({type:'ex', uid1:'${u1}', uid2:'${u2}'})`, 'strike', dist, engine, p, { isInitiator: false });
    return `<div id="unified-hand-dock" class="hand-dock-band">${handHTML(g, {
      tileOpts: defendTileOpts,
      exTiles,
    })}</div>`;
  }

  if (g.mode === 'boost_select') {
    return `<div id="unified-hand-dock" class="hand-dock-band">${handHTML(g, {
      tileOpts: (c) => ({ onclick: `G.pickBoostCard('${c.uid}')`, highlight: 'boost' }),
    })}</div>`;
  }

  if (g.mode === 'mulligan_select') {
    const chosen = g.sel.chosen || [];
    return `<div id="unified-hand-dock" class="hand-dock-band">${handHTML(g, {
      tileOpts: (c) => ({ selected: chosen.includes(c.uid), onclick: `G.toggleMulliganCard('${c.uid}')` }),
    })}</div>`;
  }

  if (g.mode === 'discard_to_seven') {
    const chosen = g.sel.chosen || [];
    return `<div id="unified-hand-dock" class="hand-dock-band">${handHTML(g, {
      tileOpts: (c) => ({ selected: chosen.includes(c.uid), onclick: `G.toggleDiscardChoice('${c.uid}')` }),
    })}</div>`;
  }

  if (g.mode === 'block_force_choice') {
    const chosen = g.sel.chosen || [];
    return `<div id="unified-hand-dock" class="hand-dock-band">${handHTML(g, {
      tileOpts: (c) => ({ selected: chosen.includes(c.uid), onclick: `G.toggleBlockForceCard('${c.uid}')` }),
    })}</div>`;
  }

  if (g.mode === 'action_gauge_select') {
    const chosen = g.sel.chosen || [];
    return `<div id="unified-hand-dock" class="hand-dock-band">${handHTML(g, {
      tileOpts: (c) => ({ selected: chosen.includes(c.uid), onclick: `G.toggleActionGaugeCard('${c.uid}')` }),
    })}</div>`;
  }

  if (g.mode === 'range_discard_choice') {
    const matchUids = new Set((g.sel.matchingCards || []).map(c => c.uid));
    return `<div id="unified-hand-dock" class="hand-dock-band">${handHTML(g, {
      tileOpts: (c) => (matchUids.has(c.uid) ? { onclick: `G.resolveRangeDiscardChoice('${c.uid}')` } : { disabled: true }),
    })}</div>`;
  }

  const isQuickCommit = isMainAction && typeof UXSettings !== 'undefined' && !!UXSettings.get('quickCommit');
  const dupMap = new Map();
  if (isMainAction) {
    for (const c of p.hand) {
      if (!dupMap.has(c.key)) dupMap.set(c.key, []);
      dupMap.get(c.key).push(c.uid);
    }
  }
  return `<div id="unified-hand-dock" class="hand-dock-band">${handHTML(g, {
    tileOpts: isMainAction
      ? (c, memo) => {
          const sameKeyUids = dupMap.get(c.key) || [];
          const validStrike = typeof engine.isValidStrikeCard !== 'function' || engine.isValidStrikeCard(p, c);
          const canPayUltra = c.type !== 'ultra' || (typeof engine.canPayUltra !== 'function') || engine.canPayUltra(p, c);
          const otherUid = (sameKeyUids.length >= 2 && validStrike && canPayUltra) ? sameKeyUids.find(u => u !== c.uid) : null;
          return {
            selected: !isQuickCommit && g.selectedActionCardUid === c.uid,
            hoverPreview: true,
            draggable: true,
            quickCommit: isQuickCommit,
            exOtherUid: otherUid,
            rangeChip: (validStrike && canPayUltra) ? previewToRangeChip(memo && memo.base, c, dist) : null,
            onclick: isQuickCommit ? null : `G.selectActionCard('${c.uid}')`,
          };
        }
      : () => ({ disabled: true }),
  })}</div>`;
}

function setGameplayBodyClass(active, gameStateName) {
  if (typeof document === 'undefined') return;
  if (document.body) {
    if (document.body.classList) {
      if (active) document.body.classList.add('gameplay-active');
      else document.body.classList.remove('gameplay-active');
    }
    if (document.body.dataset) {
      document.body.dataset.state = gameStateName || (active ? 'playing' : 'title');
    }
  }
  const app = document.getElementById('app');
  if (app && app.classList) {
    if (active) app.classList.add('gameplay-stage-active');
    else app.classList.remove('gameplay-stage-active');
  }
}

function topUtilityStripHTML(g) {
  const isMuted = typeof UXSettings !== 'undefined' && !!UXSettings.get('muted');
  const isFs = typeof isFullscreenActive === 'function' && isFullscreenActive();
  const fsLabel = isFs ? 'Exit Fullscreen (F)' : 'Toggle Fullscreen (F)';
  const hasLastStrike = !!(g.engine && g.engine.lastStrikeInfo);
  return `<div class="top-utility-strip">
    ${hasLastStrike ? `<button type="button" class="util-mini-btn" onclick="G.toggleLastStrikeModal()" title="View Last Strike Recap">Last Strike</button>` : ''}
    <button type="button" class="util-mini-btn${isMuted ? ' muted' : ''}" onclick="G.toggleMute()" title="Toggle Audio">${isMuted ? '🔇' : '🔊'}</button>
    <button type="button" class="util-mini-btn settings-btn" onclick="toggleSettingsPopover()" title="Settings">⚙</button>
    <button type="button" class="util-mini-btn${isFs ? ' active' : ''}" data-fullscreen-btn="true" onclick="toggleFullscreen()" aria-pressed="${isFs ? 'true' : 'false'}" aria-label="${fsLabel}" title="${fsLabel}">${isFs ? '\u2922' : '\u26F6'}</button>
    <button type="button" class="util-mini-btn" onclick="openHowToPlay()" title="How to Play">Rules</button>
    <button type="button" class="util-mini-btn panel-toggle-btn${!g.rightRailCollapsed ? ' active' : ''}" onclick="G.toggleRightRail()" aria-expanded="${!g.rightRailCollapsed ? 'true' : 'false'}" title="Toggle Log, Normals & Coach Panel">${g.rightRailCollapsed ? '◀ Panel' : '✕ Panel'}</button>
  </div>`;
}

function lastStrikeModalHTML(g) {
  const info = g && g.engine && g.engine.lastStrikeInfo;
  const you = info && info.sides && info.sides[g.humanId];
  const cpu = info && info.sides && info.sides[g.aiId];
  const youDef = you ? resolveCardDef(you.cardKey || you.cardName) : null;
  const cpuDef = cpu ? resolveCardDef(cpu.cardKey || cpu.cardName) : null;
  const headSummary = (you && cpu)
    ? `<div class="inspector-dual-cards">
        <div class="inspector-dual-col you-col">
          <div class="dual-col-head">You: <b>${esc(you.cardName)}</b>${esc(sideMarkers(you))}</div>
          ${youDef && youDef.text ? `<div class="dual-card-text">${boldCardKeywords(esc(youDef.text))}</div>` : ''}
        </div>
        <div class="inspector-dual-col cpu-col">
          <div class="dual-col-head">CPU: <b>${esc(cpu.cardName)}</b>${esc(sideMarkers(cpu))}</div>
          ${cpuDef && cpuDef.text ? `<div class="dual-card-text">${boldCardKeywords(esc(cpuDef.text))}</div>` : ''}
        </div>
      </div>`
    : '';
  return `<div class="modal-overlay" onclick="if(event.target===this) G.closeLastStrikeModal()">
    <div class="modal-panel">
      <div class="modal-header">
        <b>Last Strike Recap</b>
        <button type="button" class="modal-close" onclick="G.closeLastStrikeModal()">✕</button>
      </div>
      <div class="modal-body">${headSummary}${strikeBreakdownHTML({ modal: true })}</div>
    </div>
  </div>`;
}

function paint() {
  const app = document.getElementById('app');
  if (!G) {
    setGameplayBodyClass(false, 'title');
    return;
  }
  const engine = G.engine;

  if (G.mode === 'game_over') {
    setGameplayBodyClass(false, 'gameover');
    if (typeof StrikePreviewController !== 'undefined' && StrikePreviewController.clear) {
      StrikePreviewController.clear();
    }
    const winnerName = engine.winner === G.humanId ? 'You win!' : 'CPU wins!';
    app.innerHTML = `<div class="center-screen">
      <h1>${winnerName}</h1>
      <button class="big-btn" onclick="location.reload()">Play again</button>
      ${logHTML(engine)}
    </div>`;
    applyPendingShake(app);
    return;
  }

  setGameplayBodyClass(true, 'playing');

  const mobileTab = G.mobilePanelTab || 'inspector';
  const cardViewMode = (typeof G.getCardViewMode === 'function') ? G.getCardViewMode() : 'auto';
  app.innerHTML = `
    <div class="gameplay-stage${G.rightRailCollapsed ? ' rail-collapsed' : ''}" data-mobile-tab="${mobileTab}" data-card-view="${cardViewMode}">
      <main class="main-stage">
        ${topUtilityStripHTML(G)}
        <div class="top-bar slim-hud-row">
          ${lifeBar(G, 'human')}
          ${lifeBar(G, 'ai')}
        </div>
        <div class="arena-stage-band">
          ${boardHTML(engine)}
          ${stagePromptBarHTML(G)}
        </div>
        <div class="action-bar-band">
          ${actionPromptBarHTML(G)}
          ${transientBoostDropZoneHTML(G)}
        </div>
        ${unifiedHandDockHTML(G)}
      </main>
      ${rightRailHTML(G)}
    </div>
    ${G.infoModal ? infoModalHTML(G) : ''}
    ${G.showLastStrikeModal && engine.lastStrikeInfo ? lastStrikeModalHTML(G) : ''}
  `;
  applyPendingShake(app);
  if (typeof StrikePreviewController !== 'undefined') {
    if (G.mode === 'awaiting_action' && G.selectedActionCardUid && G.human && G.human()) {
      const selCard = G.human().hand.find(c => c.uid === G.selectedActionCardUid) || null;
      if (StrikePreviewController.syncSelectedCard) StrikePreviewController.syncSelectedCard(selCard, false);
    } else if (StrikePreviewController.clear) {
      StrikePreviewController.clear();
    }
  }
  const vig = typeof document !== 'undefined' ? document.getElementById('vignette-overlay') : null;
  if (vig && vig.classList) {
    const human = G.human();
    const isLow = !!(human && human.life > 0 && human.life <= 6 && !engine.gameOver);
    if (isLow) vig.classList.add('active');
    else vig.classList.remove('active');
  }
  renderCardLightboxModal();
  if (typeof StandeeStage !== 'undefined' && StandeeStage.syncAfterRender) {
    StandeeStage.syncAfterRender();
  }
}

function fullCardLightboxHTML(g) {
  if (!g || !g.cardModal || !g.cardModal.card) return '';
  const { card: displayCard, rawCard, isEX, sourceLabel } = g.cardModal;
  const typeKey = displayCard.type || 'normal';
  const typeLabel = typeKey.toUpperCase();
  const human = g.human ? g.human() : null;
  const ai = g.ai ? g.ai() : null;
  const engine = g.engine;
  const inHand = !!(human && rawCard && rawCard.uid && human.hand.some(c => c.uid === rawCard.uid));
  const isMyTurn = !!(engine && engine.active === g.humanId && !engine.gameOver);

  let liveStripHTML = '';
  if (engine && typeof SimulateStrikePreview !== 'undefined' && typeof engine.getInformationSet === 'function') {
    const infoSet = engine.getInformationSet(g.humanId || 'p1');
    const preview = SimulateStrikePreview.run(infoSet, rawCard || displayCard, {
      isEX: !!isEX,
      isInitiator: g.mode !== 'defend_select',
    });
    if (preview && preview.effectiveStats) {
      const s = preview.effectiveStats;
      const rangeStr = (s.minRange != null && s.maxRange != null)
        ? (s.minRange === s.maxRange ? String(s.minRange) : `${s.minRange}\u2013${s.maxRange}`)
        : '\u2014';
      const distLabel = preview.initialDist === preview.postBeforeDist
        ? `Dist ${preview.postBeforeDist}`
        : `Dist ${preview.initialDist}\u2192${preview.postBeforeDist}`;
      const moveParts = [preview.beforeMoveSummary, preview.oppHitMoveSummary, preview.afterMoveSummary].filter(Boolean);
      const lifeReadout = preview.hasStochasticVariance
        ? 'Proj. DMG <b>?</b>'
        : (preview.willWhiff
          ? `CPU HP <b>${preview.oppLifeBefore}</b> (0 dmg)`
          : `CPU HP <b>${preview.oppLifeBefore}\u2192${preview.oppLifeAfter}</b> <span class="insp-pv-loss${preview.isPublicStateLethal ? ' is-lethal' : ''}">(-${preview.oppLifeLoss})</span>`);
      const selfReadout = preview.selfLifeDelta
        ? ` \u00B7 You <b>${preview.selfLifeDelta > 0 ? '+' : ''}${preview.selfLifeDelta} HP</b>`
        : '';
      liveStripHTML = `<div class="full-card-live-strip">
        <div class="full-card-live-top">
          <span class="full-card-live-label">Strike Preview \u00B7 ${preview.usesEddie ? `Eddie Dist ${preview.postBeforeDist}` : distLabel}</span>
          <span class="full-card-live-tags">${previewVerdictTagHTML(preview)}</span>
        </div>
        <div class="full-card-live-stats">
          ${statPillHTML('rng', rangeStr, { showFullLabel: true, extraClass: 'stat-inline' })}
          ${statPillHTML('spd', s.spd, { showFullLabel: true, extraClass: 'stat-inline' })}
          ${statPillHTML('pow', s.pow, { showFullLabel: true, extraClass: 'stat-inline' })}
          ${statPillHTML('arm', s.arm, { showFullLabel: true, extraClass: 'stat-inline' })}
          ${statPillHTML('grd', s.grd, { showFullLabel: true, extraClass: 'stat-inline' })}
          <span class="full-card-live-dmg">${lifeReadout}${selfReadout}</span>
        </div>
        ${moveParts.length ? `<div class="full-card-live-move">${esc(moveParts.join(' \u00B7 '))}</div>` : ''}
      </div>`;
    }
  }

  const actions = [];
  if (inHand && human && engine && !engine.gameOver) {
    const validStrike = typeof engine.isValidStrikeCard !== 'function' || engine.isValidStrikeCard(human, rawCard);
    const canPayUltra = displayCard.type !== 'ultra' || (typeof engine.canPayUltra !== 'function') || engine.canPayUltra(human, rawCard);
    const canStrikeCard = validStrike && canPayUltra;
    const hasDup = human.hand.filter(c => c.key === rawCard.key).length >= 2;
    if (g.mode === 'awaiting_action' && isMyTurn) {
      actions.push(`<button type="button" class="full-card-action-btn strike-btn" onclick="G.modalPlayCard('strike')" ${canStrikeCard ? '' : 'disabled'}>⚔ Play as Strike</button>`);
      if (rawCard.boost) {
        actions.push(`<button type="button" class="full-card-action-btn boost-btn" onclick="G.modalPlayCard('boost')">⬆ Play as Boost</button>`);
      }
      if (hasDup && canStrikeCard) {
        actions.push(`<button type="button" class="full-card-action-btn ex-btn" onclick="G.modalPlayCard('ex')">★ EX Strike</button>`);
      }
    } else if (g.mode === 'strike_select') {
      actions.push(`<button type="button" class="full-card-action-btn strike-btn" onclick="G.modalPlayCard('strike')" ${canStrikeCard ? '' : 'disabled'}>⚔ Select Strike</button>`);
      if (hasDup && canStrikeCard) {
        actions.push(`<button type="button" class="full-card-action-btn ex-btn" onclick="G.modalPlayCard('ex')">★ Select EX</button>`);
      }
    } else if (g.mode === 'defend_select') {
      const forcedWildSwing = !!(g.sel && g.sel.forcedWildSwingOnly);
      const forcedUid = g.sel && g.sel.forcedUid;
      const forcedCard = forcedUid ? human.hand.find(c => c.uid === forcedUid) : null;
      const forcedKey = (g.sel && g.sel.forcedKey) || (forcedCard && forcedCard.key) || null;
      const allowedByConstraint = !forcedWildSwing && (!forcedKey || rawCard.key === forcedKey);
      if (allowedByConstraint) {
        actions.push(`<button type="button" class="full-card-action-btn strike-btn" onclick="G.modalPlayCard('strike')" ${canStrikeCard ? '' : 'disabled'}>⚔ Select Strike</button>`);
        if (hasDup && canStrikeCard) {
          actions.push(`<button type="button" class="full-card-action-btn ex-btn" onclick="G.modalPlayCard('ex')">★ Select EX</button>`);
        }
      }
    } else if (g.mode === 'boost_select' && rawCard.boost) {
      actions.push(`<button type="button" class="full-card-action-btn boost-btn" onclick="G.modalPlayCard('boost')">⬆ Select Boost</button>`);
    }
  }
  actions.push(`<button type="button" class="full-card-action-btn close-btn" onclick="G.closeCardModal()">Close</button>`);

  return `<div class="full-card-modal ${esc(typeKey)}${isEX ? ' ex-card' : ''}" role="dialog" aria-modal="true" aria-label="${esc(displayCard.name)} full card">
    <div class="full-card-top-bar">
      <div class="full-card-type-group">
        <span class="full-card-type-pill ${esc(typeKey)}">${typeLabel}</span>
        ${isEX ? '<span class="ex-chip">EX +1 ALL</span>' : ''}
        ${sourceLabel ? `<span class="full-card-source">${esc(sourceLabel)}</span>` : ''}
      </div>
      <button type="button" class="full-card-close-x" onclick="G.closeCardModal()" aria-label="Close full card">✕</button>
    </div>

    <div class="full-card-strike-half">
      <div class="full-card-title-row">
        <h2 class="full-card-name">${esc(displayCard.name)}${isEX ? ' (EX)' : ''}</h2>
        ${gaugeCostBadge(displayCard)}
      </div>
      <div class="full-card-stats-grid">${statLine(displayCard, { showFullLabel: true, extraClass: 'stat-pill-lg' })}</div>
      <div class="full-card-strike-body">
        ${boldCardKeywords(esc(displayCard.text || 'Standard strike (no additional effect text).'))}
      </div>
      ${displayCard.criticalText ? `<div class="full-card-crit-box">${boldCardKeywords(esc(displayCard.criticalText))}</div>` : ''}
      ${liveStripHTML}
    </div>

    <div class="full-card-split" aria-hidden="true">
      <span class="full-card-split-line"></span>
      <span class="full-card-split-tag">BOOST HALF</span>
      <span class="full-card-split-line"></span>
    </div>

    <div class="full-card-boost-half">
      ${boostHeadline(displayCard)}
      <div class="full-card-boost-body">
        ${forceCostBadge(displayCard)}${boldCardKeywords(esc(displayCard.boostText || 'No Boost effect.'))}
      </div>
    </div>

    <div class="full-card-footer">
      <div class="full-card-actions">${actions.join('')}</div>
      <div class="full-card-hint">Double-tap or right-click any card · Press <b>V</b> or <b>Esc</b></div>
    </div>
  </div>`;
}

function renderCardLightboxModal() {
  if (typeof document === 'undefined') return;
  const overlay = document.getElementById('card-lightbox-overlay');
  if (!overlay) return;
  if (typeof G !== 'undefined' && G && G.cardModal && G.cardModal.card) {
    overlay.innerHTML = fullCardLightboxHTML(G);
    overlay.style.display = 'flex';
    if (overlay.setAttribute) overlay.setAttribute('aria-hidden', 'false');
  } else {
    overlay.innerHTML = '';
    overlay.style.display = 'none';
    if (overlay.setAttribute) overlay.setAttribute('aria-hidden', 'true');
  }
}

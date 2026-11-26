// ============================================================
// FIGHTER PREVIEW CARD — Arcade VFX Dossier, Full Unzoomed
// Portrait, Strategy, Fighter Complexity Stat, Full Combat
// Stats, and Clickable Deck Review
// ============================================================

var FighterPreview = (() => {
  const state = {
    isOpen: false,
    charKey: null,
    role: 'human', // 'human' | 'ai'
    activeTab: 'profile', // 'profile' | 'deck'
    deckFilter: 'all', // 'all' | 'special' | 'ultra' | 'normal'
    inspectedCardKey: null,
    inspectedDeckFilter: null,
  };

  // Canonical complexity ratings for all 41 playable fighters (from fighter_rating.md)
  const FIGHTER_COMPLEXITY = {
    zato1:      { score: 5.0, stars: '★★★★★', rank: 1,  tier: 'Master',       hook: 'Eddie — a third board token every Special measures Range from' },
    happychaos: { score: 4.5, stars: '★★★★½', rank: 2,  tier: 'Very High',    hook: 'A sealed-card zone that eats his own deck as ammunition' },
    cviper:     { score: 4.0, stars: '★★★★',  rank: 3,  tier: 'Very High',    hook: 'Optional bonus Strike after every Continuous Boost' },
    platinum:   { score: 4.0, stars: '★★★★',  rank: 4,  tier: 'Very High',    hook: 'Reveal-and-play a free boost each exchange; a whole boost board to maintain' },
    nagoriyuki: { score: 4.0, stars: '★★★★',  rank: 5,  tier: 'Very High',    hook: 'Reshuffle force-Exceeds him and permanently bricks all seven Specials' },
    anji:       { score: 3.5, stars: '★★★½',  rank: 6,  tier: 'High',         hook: 'Buy Guard with Force on every attack you set, attacking or defending' },
    nu13:       { score: 3.5, stars: '★★★½',  rank: 7,  tier: 'High',         hook: 'Rent +4 Range at set time — on offense and defense' },
    hakumen:    { score: 3.5, stars: '★★★½',  rank: 8,  tier: 'High',         hook: 'Gauge is both the Exceed clock (cost 8) and every Special’s mid-Strike fuel' },
    bang:       { score: 3.5, stars: '★★★½',  rank: 9,  tier: 'High',         hook: 'Deck-sifting Action plus Overdrive that rakes back every copy of a card' },
    jacko:      { score: 3.5, stars: '★★★½',  rank: 10, tier: 'High',         hook: 'Boosts-in-play are a live counter her cards scale off' },
    faust:      { score: 3.5, stars: '★★★½',  rank: 11, tier: 'High',         hook: 'Every Action force-boosts a random card off his own deck' },
    cammy:      { score: 3.5, stars: '★★★½',  rank: 12, tier: 'High',         hook: 'Side-swapping guarantees range; stacked range-immunity windows' },
    baiken:     { score: 3.0, stars: '★★★',   rank: 13, tier: 'Intermediate', hook: 'Four cards check a live "3 or fewer cards in hand" threshold' },
    tager:      { score: 3.0, stars: '★★★',   rank: 14, tier: 'Intermediate', hook: 'Hard movement cap: he can never self-move more than 2 spaces' },
    jin:        { score: 3.0, stars: '★★★',   rank: 15, tier: 'Intermediate', hook: 'Pay Gauge at set time for Draw 2; delayed boosts and hand-size Guard' },
    mbison:     { score: 3.0, stars: '★★★',   rank: 16, tier: 'Intermediate', hook: 'Bespoke multi-select hand-to-Gauge conversion Action' },
    axl:        { score: 3.0, stars: '★★★',   rank: 17, tier: 'Intermediate', hook: '+2 Range welded onto the whole Normals pool, plus four paid prompts' },
    testament:  { score: 3.0, stars: '★★★',   rank: 18, tier: 'Intermediate', hook: 'A free reposition prompt on every Normal that connects' },
    chunli:     { score: 3.0, stars: '★★★',   rank: 19, tier: 'Intermediate', hook: 'Retreat prompt after every Boost and a range-less Head Stomp' },
    vega:       { score: 3.0, stars: '★★★',   rank: 20, tier: 'Intermediate', hook: 'Edge-of-arena zoning his own cards keep walking him out of' },
    zangief:    { score: 3.0, stars: '★★★',   rank: 21, tier: 'Intermediate', hook: 'Character-level bonus stapled onto every Critical paid at Range 1' },
    sol:        { score: 2.5, stars: '★★½',   rank: 22, tier: 'Moderate',     hook: 'Cancel-chaining into +POW — Gauge split between Cancels and Ultras' },
    millia:     { score: 2.5, stars: '★★½',   rank: 23, tier: 'Moderate',     hook: 'Stunning the opponent opens a four-option tactical menu' },
    chipp:      { score: 2.5, stars: '★★½',   rank: 24, tier: 'Moderate',     hook: 'An unconditional reposition prompt after every exchange' },
    leo:        { score: 2.5, stars: '★★½',   rank: 25, tier: 'Moderate',     hook: 'Free Exceed on stun — then oscillating in and out of Exceed' },
    ramlethal:  { score: 2.5, stars: '★★½',   rank: 26, tier: 'Moderate',     hook: 'Pay 2 Force at set time to stretch any attack one space further' },
    noel:       { score: 2.5, stars: '★★½',   rank: 27, tier: 'Moderate',     hook: 'Buy initiative: spend Gauge for +1 SPD at set time' },
    taokaka:    { score: 2.5, stars: '★★½',   rank: 28, tier: 'Moderate',     hook: 'Two optional Force-for-POW spends and a mandatory lunge' },
    goldlewis:  { score: 2.5, stars: '★★½',   rank: 29, tier: 'Moderate',     hook: 'Ten distinct kit cards, 9-card hand limit, and a 36-card deck' },
    akuma:      { score: 2.5, stars: '★★½',   rank: 30, tier: 'Moderate',     hook: 'Symmetric Critical: +POW to both players on Strike' },
    sagat:      { score: 2.5, stars: '★★½',   rank: 31, tier: 'Moderate',     hook: 'Optional face-up Strike — reveal your attack to buy initiative' },
    guile:      { score: 2.5, stars: '★★½',   rank: 32, tier: 'Moderate',     hook: 'Change Cards as an engine: first Gauge spent generates 2 extra Force' },
    dan:        { score: 2.5, stars: '★★½',   rank: 33, tier: 'Moderate',     hook: 'High-risk Wild Swing gambling on random discards and deck rolls' },
    ino:        { score: 2.0, stars: '★★',    rank: 34, tier: 'Moderate',     hook: '1-Force Action: Advance 2 and initiate a Strike immediately' },
    ky:         { score: 2.0, stars: '★★',    rank: 35, tier: 'Moderate',     hook: 'The first Cancel each turn is free tempo' },
    may:        { score: 2.0, stars: '★★',    rank: 36, tier: 'Moderate',     hook: 'Spend 1 Force when initiating a Strike for direct +POW burst' },
    ken:        { score: 2.0, stars: '★★',    rank: 37, tier: 'Moderate',     hook: 'Close-and-draw Action every turn with initiator-conditional burst' },
    ragna:      { score: 2.0, stars: '★★',    rank: 38, tier: 'Moderate',     hook: 'Aggressive lifesteal sustain on every hit that connects' },
    ryu:        { score: 1.5, stars: '★½',    rank: 39, tier: 'Low',          hook: 'Textbook shoto — clean stat bands and straightforward Criticals' },
    potemkin:   { score: 1.5, stars: '★½',    rank: 40, tier: 'Low',          hook: 'A flat, promptless +POW/+ARM tax for standing at Range 1' },
    giovanna:   { score: 1.5, stars: '★½',    rank: 41, tier: 'Low',          hook: 'Direct rushdown Action: initiate a Strike and draw on hit' },
  };

  function resolveComplexity(charKey, char) {
    if (FIGHTER_COMPLEXITY[charKey]) {
      const entry = FIGHTER_COMPLEXITY[charKey];
      const level = entry.score >= 4.0 ? 'high' : (entry.score >= 3.0 ? 'mid' : 'low');
      return {
        ...entry,
        scoreFormatted: entry.score.toFixed(1),
        pct: Math.round((entry.score / 5) * 100),
        level,
      };
    }
    // Fallback heuristic if an unlisted character key is ever inspected
    let score = 2.0;
    if (char && char.usesEddie) score = 5.0;
    else if (char && (char.exceedCost === 0 || char.overdrive)) score = 3.5;
    else if (char && char.action) score = 2.5;
    const starsFull = Math.floor(score);
    const hasHalf = score - starsFull >= 0.5;
    const stars = '★'.repeat(starsFull) + (hasHalf ? '½' : '');
    const tier = score >= 4.0 ? 'Very High' : (score >= 3.0 ? 'Intermediate' : (score >= 2.0 ? 'Moderate' : 'Low'));
    const level = score >= 4.0 ? 'high' : (score >= 3.0 ? 'mid' : 'low');
    return {
      score,
      scoreFormatted: score.toFixed(1),
      stars,
      rank: null,
      tier,
      hook: (char && char.blurb) ? char.blurb : 'Balanced tactical kit',
      pct: Math.round((score / 5) * 100),
      level,
    };
  }

  function complexitySegmentsHTML(score, level) {
    const segs = [];
    for (let i = 1; i <= 5; i++) {
      let fill = 'empty';
      if (score >= i) fill = 'full';
      else if (score >= i - 0.5) fill = 'half';
      segs.push(`<span class="fp-cplx-seg is-${fill} level-${level}"><i></i></span>`);
    }
    return `<div class="fp-complexity-meter" aria-hidden="true">${segs.join('')}</div>`;
  }

  function cardCopies(c) {
    return c && c.copies != null ? c.copies : 2;
  }

  function cardCopyLabel(c) {
    const qty = cardCopies(c);
    if (c.isAstral) return `×${qty} Astral Heat`;
    if (qty === 0) return 'Starts in play';
    return `×${qty}`;
  }

  function getDeckEntries(charKey) {
    const char = CHARACTERS[charKey];
    if (!char) return [];
    const normalsPool = char.normals || NORMALS;
    const specials = (char.specials || []).filter(c => c.type !== 'ultra');
    const ultras = (char.specials || []).filter(c => c.type === 'ultra');
    return [
      ...specials.map(c => ({ card: c, category: 'special' })),
      ...ultras.map(c => ({ card: c, category: 'ultra' })),
      ...normalsPool.map(c => ({ card: c, category: 'normal' })),
    ];
  }

  function getFilteredDeckEntries(charKey, filter) {
    const entries = getDeckEntries(charKey);
    if (!filter || filter === 'all') return entries;
    return entries.filter(e => e.category === filter);
  }

  function computeFighterStats(charKey) {
    const char = CHARACTERS[charKey];
    if (!char) return null;

    const normalsPool = char.normals || NORMALS;
    const kit = char.specials || [];
    const specials = kit.filter(c => c.type !== 'ultra');
    const ultras = kit.filter(c => c.type === 'ultra');
    const allCards = [...normalsPool, ...kit];

    const sumCopies = (list) => list.reduce((acc, c) => acc + cardCopies(c), 0);
    const normalsCopies = sumCopies(normalsPool);
    const specialsCopies = sumCopies(specials);
    const ultrasCopies = sumCopies(ultras);
    const totalCards = normalsCopies + specialsCopies + ultrasCopies;
    const startsInPlay = kit.filter(c => cardCopies(c) === 0).length;
    const hasAstral = ultras.some(c => c.isAstral);

    let season = 'Street Fighter';
    let seasonMechanic = 'Criticals (1 Gauge)';
    let seasonKey = 'sf';
    if (char.overdrive) {
      season = 'BlazBlue';
      seasonMechanic = 'Overdrive & Astral Heat';
      seasonKey = 'bb';
    } else if (!char.isStreetFighter && typeof GG_NORMALS !== 'undefined' && char.normals === GG_NORMALS) {
      season = 'Guilty Gear Strive';
      seasonMechanic = 'Cancelable Boosts';
      seasonKey = 'gg';
    }

    const complexity = resolveComplexity(charKey, char);

    const rangedKit = kit.filter(c => Array.isArray(c.range) && c.range.length === 2);
    const rangeMin = rangedKit.length ? Math.min(...rangedKit.map(c => c.range[0])) : 1;
    const rangeMax = rangedKit.length ? Math.max(...rangedKit.map(c => c.range[1])) : 1;
    const rangeStart = rangeMin === 0 ? 0 : 1;

    const rangeCoverage = [];
    let maxCov = 0;
    for (let r = rangeStart; r <= 8; r++) {
      let count = 0;
      for (const c of rangedKit) {
        if (r >= c.range[0] && r <= c.range[1]) count += 1;
      }
      if (count > maxCov) maxCov = count;
      rangeCoverage.push({ range: r, count });
    }
    const sweetSpotRanges = maxCov > 0
      ? rangeCoverage.filter(x => x.count === maxCov).map(x => x.range)
      : [];
    let sweetSpotLabel = '—';
    if (sweetSpotRanges.length === 1) {
      sweetSpotLabel = `R${sweetSpotRanges[0]}`;
    } else if (sweetSpotRanges.length > 1) {
      const first = sweetSpotRanges[0];
      const last = sweetSpotRanges[sweetSpotRanges.length - 1];
      const contiguous = sweetSpotRanges.length === (last - first + 1);
      sweetSpotLabel = contiguous ? `R${first}–${last}` : `R${sweetSpotRanges.join(',')}`;
    }

    const numCards = kit.filter(c => typeof c.pow === 'number');
    const powMax = numCards.length ? Math.max(...numCards.map(c => c.pow)) : 0;
    const powAvg = numCards.length
      ? (numCards.reduce((s, c) => s + c.pow, 0) / numCards.length).toFixed(1)
      : '0.0';
    const spdMax = numCards.length ? Math.max(...numCards.map(c => c.spd)) : 0;
    const spdAvg = numCards.length
      ? (numCards.reduce((s, c) => s + c.spd, 0) / numCards.length).toFixed(1)
      : '0.0';
    const armMax = numCards.length ? Math.max(...numCards.map(c => c.arm || 0)) : 0;
    const armCards = numCards.filter(c => (c.arm || 0) > 0).length;
    const grdMax = numCards.length ? Math.max(...numCards.map(c => c.grd || 0)) : 0;
    const grdCards = numCards.filter(c => (c.grd || 0) > 0).length;

    const continuousBoostCount = allCards.filter(c => c.boost && c.boost.continuous).length;
    const cancelableBoostCount = allCards.filter(c => c.boost && c.boost.cancelable).length;
    const criticalCardCount = kit.filter(c => !!c.criticalText).length;

    const traits = [];
    if (char.action) traits.push('Character Action');
    if (char.usesEddie) traits.push('Puppet Token (Eddie)');
    if (char.canGoFaceUp) traits.push('Face-Up Strikes');
    if (char.selfMoveCap != null) traits.push(`Self-Move Cap: ${char.selfMoveCap}`);
    if (char.maxHandSize && char.maxHandSize !== 7) traits.push(`${char.maxHandSize}-Card Hand Limit`);
    if (char.gaugeCostsFree) traits.push('Free Gauge Costs (Exceed)');
    if (char.revertOnNonStrikeTurn) traits.push('Reverts Without Striking');
    if (char.exceedCost === 0) traits.push('Auto-Exceeds on Reshuffle');
    if (continuousBoostCount > 0) traits.push(`${continuousBoostCount} Continuous Boosts`);
    if (cancelableBoostCount > 0) traits.push(`${cancelableBoostCount} Cancelable Boosts`);
    if (criticalCardCount > 0) traits.push(`${criticalCardCount} Critical Kit Cards`);
    if (hasAstral) traits.push('Astral Heat Ultra');
    if (startsInPlay > 0) traits.push(`${startsInPlay} Card Starts in Play`);

    const life = (typeof START_LIFE !== 'undefined' && START_LIFE) ? START_LIFE : 30;
    const exceedCostLabel = char.exceedCost > 0 ? `${char.exceedCost} Gauge` : 'Reshuffle';
    const maxHand = char.maxHandSize || 7;
    const startHandSub = char.onStartingHand ? 'Starts with +2 cards' : 'Standard draw';
    const rangeDisplay = rangeMin === rangeMax ? `${rangeMin}` : `${rangeMin}–${rangeMax}`;

    return {
      char,
      season,
      seasonMechanic,
      seasonKey,
      complexity,
      life,
      exceedCostLabel,
      maxHand,
      startHandSub,
      normalsPool,
      specials,
      ultras,
      kit,
      normalsCopies,
      specialsCopies,
      ultrasCopies,
      totalCards,
      startsInPlay,
      hasAstral,
      rangeMin,
      rangeMax,
      rangeDisplay,
      rangeCoverage,
      maxCov,
      sweetSpotLabel,
      powMax,
      powAvg,
      spdMax,
      spdAvg,
      armMax,
      armCards,
      grdMax,
      grdCards,
      traits,
    };
  }

  function formatAbilityText(text) {
    if (!text) return '';
    return boldCardKeywords(esc(text)).replace(/\n/g, '<br>');
  }

  function formatRangeValue(c) {
    if (!Array.isArray(c.range) || c.range.length < 2) return '—';
    return c.range[0] === c.range[1] ? String(c.range[0]) : `${c.range[0]}–${c.range[1]}`;
  }

  function portraitMarkup(charKey, charName) {
    const src = typeof fighterPhotoSrc === 'function'
      ? fighterPhotoSrc(charKey, { forceFull: true })
      : (typeof FIGHTER_PHOTOS !== 'undefined' ? FIGHTER_PHOTOS[charKey] : null);
    if (src) {
      return `<img class="fp-full-portrait" data-portrait-kind="full" data-fighter-key="${esc(charKey)}" src="${src}" alt="${esc(charName)} full unzoomed portrait" referrerpolicy="no-referrer"/>`;
    }
    return `<div class="fp-portrait-fallback">${typeof fighterSilhouette === 'function' ? fighterSilhouette(charKey) : ''}</div>`;
  }

  function portraitStageHTML(stats) {
    const c = stats.char;
    const cplx = stats.complexity;
    return `
      <div class="fp-portrait-frame">
        <div class="fp-vfx-aura" aria-hidden="true"></div>
        <div class="fp-vfx-grid" aria-hidden="true"></div>
        <div class="fp-vfx-sparks" aria-hidden="true">
          <span class="fp-spark s1"></span>
          <span class="fp-spark s2"></span>
          <span class="fp-spark s3"></span>
          <span class="fp-spark s4"></span>
          <span class="fp-spark s5"></span>
          <span class="fp-spark s6"></span>
        </div>
        <span class="fp-corner-bracket tl" aria-hidden="true"></span>
        <span class="fp-corner-bracket tr" aria-hidden="true"></span>
        <span class="fp-corner-bracket bl" aria-hidden="true"></span>
        <span class="fp-corner-bracket br" aria-hidden="true"></span>
        ${portraitMarkup(c.key, c.name)}
        <div class="fp-portrait-hud">
          <div class="fp-portrait-hud-row">
            <span class="fp-portrait-season">${esc(stats.season)}</span>
            <span class="fp-dot" aria-hidden="true">·</span>
            <span class="fp-portrait-cplx level-${cplx.level}" title="Fighter Complexity: ${cplx.scoreFormatted} / 5.0 (${esc(cplx.tier)})">Complexity ${cplx.scoreFormatted}/5 ${esc(cplx.stars)}</span>
          </div>
          ${complexitySegmentsHTML(cplx.score, cplx.level)}
        </div>
      </div>
    `;
  }

  function profileTabHTML(stats) {
    const c = stats.char;
    const cplx = stats.complexity;
    const deckSub = `${stats.normalsCopies}N · ${stats.specialsCopies}S · ${stats.ultrasCopies}U`;
    const signatureRows = stats.kit.map((card) => {
      const typeLabel = card.type === 'ultra' ? 'Ultra' : 'Special';
      const costText = card.type === 'ultra' && card.gaugeCost != null ? `${card.gaugeCost}G` : '';
      return `<button type="button" class="fp-sig-row type-${esc(card.type || 'special')}" onclick="FighterPreview.inspectCard('${esc(card.key)}', 'all')">
        <span class="fp-sig-left">
          <span class="fp-sig-name">${esc(card.name)}</span>
          <span class="fp-sig-meta">${typeLabel} · ${esc(cardCopyLabel(card))}${costText ? ` · ${costText}` : ''}</span>
        </span>
        <span class="fp-sig-stats">
          ${statPillHTML('rng', formatRangeValue(card), { extraClass: 'stat-inline' })}
          ${statPillHTML('pow', card.pow, { extraClass: 'stat-inline' })}
          ${statPillHTML('spd', card.spd, { extraClass: 'stat-inline' })}
        </span>
        <span class="fp-sig-arrow" aria-hidden="true">›</span>
      </button>`;
    }).join('');

    const rangeBars = stats.rangeCoverage.map((cell) => {
      const pct = stats.maxCov > 0 ? Math.round((cell.count / stats.maxCov) * 100) : 0;
      const peakCls = cell.count > 0 && cell.count === stats.maxCov ? ' is-peak' : (cell.count === 0 ? ' is-zero' : '');
      return `<div class="fp-range-col${peakCls}" title="Range ${cell.range}: ${cell.count} unique Special/Ultra card${cell.count === 1 ? '' : 's'}">
        <span class="fp-range-count">${cell.count}</span>
        <div class="fp-range-track"><div class="fp-range-fill" style="height:${pct}%"></div></div>
        <span class="fp-range-lbl">R${cell.range}</span>
      </div>`;
    }).join('');

    return `
      <section class="fp-section">
        <div class="fp-section-head">
          <h3 class="fp-section-title">Strategy &amp; Playstyle</h3>
          <span class="fp-section-note">Kit threatens Range ${esc(stats.rangeDisplay)} · Peak at ${esc(stats.sweetSpotLabel)}</span>
        </div>
        <p class="fp-blurb">${esc(c.blurb || '')}</p>
        <div class="fp-abilities-grid">
          <div class="fp-ability-card">
            <div class="fp-ability-head">
              <span class="fp-ability-label">Innate Ability</span>
              <span class="fp-ability-sub">Normal Form</span>
            </div>
            <div class="fp-ability-text">${formatAbilityText(c.innateText)}</div>
          </div>
          <div class="fp-ability-card is-exceed">
            <div class="fp-ability-head">
              <span class="fp-ability-label">Exceeded Ability</span>
              <span class="fp-ability-sub">${esc(stats.exceedCostLabel)}</span>
            </div>
            <div class="fp-ability-text">${formatAbilityText(c.exceedText)}</div>
          </div>
          ${c.overdrive ? `
          <div class="fp-ability-card is-overdrive">
            <div class="fp-ability-head">
              <span class="fp-ability-label">Overdrive Trigger</span>
              <span class="fp-ability-sub">Start of Exceeded Turn</span>
            </div>
            <div class="fp-ability-text">${formatAbilityText(c.overdrive.text)}</div>
          </div>` : ''}
        </div>
      </section>

      <section class="fp-section">
        <div class="fp-section-head">
          <h3 class="fp-section-title">Full Fighter Stats</h3>
          <span class="fp-section-note">Computed from ${stats.kit.length} unique kit cards</span>
        </div>
        <div class="fp-core-stats">
          <div class="fp-core-cell is-complexity level-${cplx.level}" data-stat="complexity">
            <div class="fp-core-top">
              <span class="fp-core-k">Complexity</span>
              <span class="fp-cplx-stars" aria-label="${cplx.scoreFormatted} out of 5 stars">${esc(cplx.stars)}</span>
            </div>
            <div class="fp-core-v">${cplx.scoreFormatted}<span class="fp-core-unit">/5</span></div>
            ${complexitySegmentsHTML(cplx.score, cplx.level)}
            <span class="fp-core-sub">${esc(cplx.tier)} Pilot Load</span>
          </div>
          <div class="fp-core-cell">
            <span class="fp-core-k">Life</span>
            <span class="fp-core-v">${stats.life}</span>
            <span class="fp-core-sub">Starting HP</span>
          </div>
          <div class="fp-core-cell">
            <span class="fp-core-k">Exceed Cost</span>
            <span class="fp-core-v">${esc(stats.exceedCostLabel)}</span>
            <span class="fp-core-sub">${c.exceedCost === 0 ? 'Forced on reshuffle' : 'To flip Exceed'}</span>
          </div>
          <div class="fp-core-cell">
            <span class="fp-core-k">Hand Limit</span>
            <span class="fp-core-v">${stats.maxHand}</span>
            <span class="fp-core-sub">${esc(stats.startHandSub)}</span>
          </div>
          <div class="fp-core-cell">
            <span class="fp-core-k">Deck Size</span>
            <span class="fp-core-v">${stats.totalCards}</span>
            <span class="fp-core-sub">${esc(deckSub)}</span>
          </div>
        </div>

        <div class="fp-complexity-banner level-${cplx.level}">
          <div class="fp-complexity-banner-head">
            <span class="fp-complexity-title">Fighter Complexity · ${esc(cplx.tier)} (${cplx.scoreFormatted} / 5.0 ${esc(cplx.stars)})</span>
            ${cplx.rank ? `<span class="fp-complexity-rank">Rank #${cplx.rank} / 41</span>` : ''}
          </div>
          <div class="fp-complexity-hook">${esc(cplx.hook)}</div>
        </div>

        <div class="fp-kit-stats">
          <div class="fp-stat-box stat-rng">
            <div class="fp-stat-head">${statIconSVG('rng')}<span>RNG</span></div>
            <div class="fp-stat-val">${esc(stats.rangeDisplay)}</div>
            <div class="fp-stat-sub">Best ${esc(stats.sweetSpotLabel)}</div>
          </div>
          <div class="fp-stat-box stat-pow">
            <div class="fp-stat-head">${statIconSVG('pow')}<span>POW</span></div>
            <div class="fp-stat-val">${stats.powMax} <span class="fp-stat-unit">max</span></div>
            <div class="fp-stat-sub">Avg ${stats.powAvg}</div>
          </div>
          <div class="fp-stat-box stat-spd">
            <div class="fp-stat-head">${statIconSVG('spd')}<span>SPD</span></div>
            <div class="fp-stat-val">${stats.spdMax} <span class="fp-stat-unit">max</span></div>
            <div class="fp-stat-sub">Avg ${stats.spdAvg}</div>
          </div>
          <div class="fp-stat-box stat-arm">
            <div class="fp-stat-head">${statIconSVG('arm')}<span>ARM</span></div>
            <div class="fp-stat-val">${stats.armMax} <span class="fp-stat-unit">max</span></div>
            <div class="fp-stat-sub">${stats.armCards}/${stats.kit.length} cards</div>
          </div>
          <div class="fp-stat-box stat-grd">
            <div class="fp-stat-head">${statIconSVG('grd')}<span>GRD</span></div>
            <div class="fp-stat-val">${stats.grdMax} <span class="fp-stat-unit">max</span></div>
            <div class="fp-stat-sub">${stats.grdCards}/${stats.kit.length} cards</div>
          </div>
        </div>

        <div class="fp-range-chart">
          <div class="fp-range-chart-head">
            <span class="fp-range-chart-title">Special &amp; Ultra Range Coverage</span>
            <span class="fp-range-chart-sub">Unique attacks reaching each space</span>
          </div>
          <div class="fp-range-cols" style="grid-template-columns:repeat(${stats.rangeCoverage.length},minmax(0,1fr));">
            ${rangeBars}
          </div>
        </div>

        ${stats.traits.length ? `<div class="fp-traits-line">${stats.traits.map(t => `<span>${esc(t)}</span>`).join('<span class="fp-dot" aria-hidden="true">·</span>')}</div>` : ''}
      </section>

      <section class="fp-section">
        <div class="fp-section-head">
          <h3 class="fp-section-title">Signature Cards</h3>
          <button type="button" class="fp-inline-link-btn" onclick="FighterPreview.setTab('deck')">Review Full Deck (${stats.totalCards}) →</button>
        </div>
        <div class="fp-sig-list">${signatureRows}</div>
      </section>
    `;
  }

  function deckTabHTML(stats) {
    const filter = state.deckFilter || 'all';
    const entries = getFilteredDeckEntries(stats.char.key, filter);
    const filters = [
      { key: 'all', label: `All (${stats.totalCards})` },
      { key: 'special', label: `Specials (${stats.specialsCopies})` },
      { key: 'ultra', label: `Ultras (${stats.ultrasCopies})` },
      { key: 'normal', label: `Normals (${stats.normalsCopies})` },
    ];

    const filterButtons = filters.map(f => `
      <button type="button" class="fp-filter-btn${filter === f.key ? ' active' : ''}" aria-pressed="${filter === f.key ? 'true' : 'false'}" onclick="FighterPreview.setDeckFilter('${f.key}')">${esc(f.label)}</button>
    `).join('');

    const cardsHTML = entries.map(({ card, category }) => {
      const typeLabel = category === 'ultra' ? 'Ultra' : (category === 'special' ? 'Special' : 'Normal');
      const boostSummary = card.boost
        ? (typeof boostEffectSummary === 'function' ? boostEffectSummary(card) : (card.boostText || ''))
        : 'No Boost';
      const boostCost = (card.boost && card.boost.force) ? `[${card.boost.force}F] ` : '';
      const boostFlags = [
        card.boost && card.boost.continuous ? 'Continuous' : '',
        card.boost && card.boost.cancelable ? 'Cancelable' : '',
      ].filter(Boolean).join(' · ');
      return `<button type="button" class="fp-deck-card type-${esc(category)}" onclick="FighterPreview.inspectCard('${esc(card.key)}', '${esc(filter)}')">
        <div class="fp-deck-card-head">
          <div class="fp-deck-card-title-wrap">
            <span class="fp-deck-card-name">${esc(card.name)}</span>
            <span class="fp-deck-card-meta">${typeLabel} · ${esc(cardCopyLabel(card))}${card.type === 'ultra' && card.gaugeCost != null ? ` · ${card.gaugeCost} Gauge` : ''}</span>
          </div>
          <span class="fp-deck-inspect-cue">Full card ›</span>
        </div>
        <div class="fp-deck-card-stats">${statLine(card)}</div>
        <div class="fp-deck-card-text">${boldCardKeywords(esc(card.text || 'Standard strike.'))}</div>
        ${card.criticalText ? `<div class="fp-deck-card-crit">${boldCardKeywords(esc(card.criticalText))}</div>` : ''}
        <div class="fp-deck-card-boost">
          <span class="fp-deck-boost-head">Boost${boostFlags ? ` (${boostFlags})` : ''}</span>
          <span class="fp-deck-boost-body">${esc(boostCost + boostSummary)}</span>
        </div>
      </button>`;
    }).join('');

    return `
      <section class="fp-section fp-deck-section">
        <div class="fp-deck-toolbar">
          <div class="fp-filter-group" role="group" aria-label="Filter deck cards">${filterButtons}</div>
          <span class="fp-deck-hint">Click any card for full Strike &amp; Boost text</span>
        </div>
        <div class="fp-deck-grid">${cardsHTML}</div>
      </section>
    `;
  }

  function cardDetailLightboxHTML() {
    if (!state.inspectedCardKey || !state.charKey) return '';
    const filter = state.inspectedDeckFilter || 'all';
    const entries = getFilteredDeckEntries(state.charKey, filter);
    const idx = entries.findIndex(e => e.card.key === state.inspectedCardKey);
    if (idx === -1) return '';
    const entry = entries[idx];
    const c = entry.card;
    const typeKey = c.type || entry.category || 'normal';
    const typeLabel = typeKey.toUpperCase();
    const charName = CHARACTERS[state.charKey] ? CHARACTERS[state.charKey].name : '';
    const hasPrev = entries.length > 1;
    const hasNext = entries.length > 1;

    return `<div class="fp-card-detail-backdrop" onclick="if(event.target===this) FighterPreview.closeCardDetail()">
      <div class="full-card-modal ${esc(typeKey)}" role="dialog" aria-modal="true" aria-label="${esc(c.name)} full card details">
        <div class="full-card-top-bar">
          <div class="full-card-type-group">
            <span class="full-card-type-pill ${esc(typeKey)}">${typeLabel}</span>
            <span class="full-card-source">${esc(charName)} · ${esc(cardCopyLabel(c))}</span>
          </div>
          <button type="button" class="full-card-close-x" onclick="FighterPreview.closeCardDetail()" aria-label="Close card detail">✕</button>
        </div>

        <div class="full-card-strike-half">
          <div class="full-card-title-row">
            <h2 class="full-card-name">${esc(c.name)}</h2>
            ${gaugeCostBadge(c)}
          </div>
          <div class="full-card-stats-grid">${statLine(c, { showFullLabel: true, extraClass: 'stat-pill-lg' })}</div>
          <div class="full-card-strike-body">
            ${boldCardKeywords(esc(c.text || 'Standard strike (no additional effect text).'))}
          </div>
          ${c.criticalText ? `<div class="full-card-crit-box">${boldCardKeywords(esc(c.criticalText))}</div>` : ''}
        </div>

        <div class="full-card-split" aria-hidden="true">
          <span class="full-card-split-line"></span>
          <span class="full-card-split-tag">BOOST HALF</span>
          <span class="full-card-split-line"></span>
        </div>

        <div class="full-card-boost-half">
          ${boostHeadline(c)}
          <div class="full-card-boost-body">
            ${forceCostBadge(c)}${boldCardKeywords(esc(c.boostText || 'No Boost effect.'))}
          </div>
        </div>

        <div class="full-card-footer">
          <div class="full-card-actions">
            <button type="button" class="full-card-action-btn close-btn" onclick="FighterPreview.stepCardDetail(-1)" ${hasPrev ? '' : 'disabled'}>← Prev</button>
            <span class="fp-card-counter">${idx + 1} / ${entries.length}</span>
            <button type="button" class="full-card-action-btn close-btn" onclick="FighterPreview.stepCardDetail(1)" ${hasNext ? '' : 'disabled'}>Next →</button>
            <button type="button" class="full-card-action-btn strike-btn" onclick="FighterPreview.closeCardDetail()">Back to Fighter</button>
          </div>
          <div class="full-card-hint">Use <b>←</b> / <b>→</b> to browse deck · <b>Esc</b> to return</div>
        </div>
      </div>
    </div>`;
  }

  function getOrderedRosterKeys() {
    if (typeof CHARACTERS === 'undefined' || !CHARACTERS) return [];
    const allKeys = Object.keys(CHARACTERS);
    const rec = (typeof RECOMMENDED_BEGINNER_KEYS !== 'undefined' && Array.isArray(RECOMMENDED_BEGINNER_KEYS))
      ? RECOMMENDED_BEGINNER_KEYS.filter(k => CHARACTERS[k])
      : [];
    const recSet = new Set(rec);
    const rest = allKeys
      .filter(k => !recSet.has(k))
      .sort((a, b) => (CHARACTERS[a].name || a).localeCompare(CHARACTERS[b].name || b));
    return [...rec, ...rest];
  }

  function renderPreview() {
    if (typeof document === 'undefined') return;
    const overlay = document.getElementById('fighterPreviewOverlay');
    if (!overlay) return;

    if (!state.isOpen || !state.charKey || !CHARACTERS[state.charKey]) {
      overlay.style.display = 'none';
      if (overlay.setAttribute) overlay.setAttribute('aria-hidden', 'true');
      overlay.innerHTML = '';
      return;
    }

    const stats = computeFighterStats(state.charKey);
    const c = stats.char;
    const cplx = stats.complexity;
    const isAi = state.role === 'ai';
    const isRecommended = typeof RECOMMENDED_BEGINNER_KEYS !== 'undefined' && RECOMMENDED_BEGINNER_KEYS.includes(c.key);
    const matchupText = isAi && typeof pendingChar !== 'undefined' && pendingChar && CHARACTERS[pendingChar]
      ? `Opponent vs. ${CHARACTERS[pendingChar].name}`
      : (isAi ? 'CPU Opponent' : 'Your Fighter');
    const kickerParts = [
      matchupText,
      stats.season,
      stats.seasonMechanic,
      `Complexity ${cplx.scoreFormatted}/5 (${cplx.tier})`,
    ];
    if (isRecommended) kickerParts.push('Recommended');

    const rosterOrder = getOrderedRosterKeys();
    const rosterIdx = Math.max(0, rosterOrder.indexOf(c.key));
    const prevKey = rosterOrder.length > 0
      ? rosterOrder[(rosterIdx - 1 + rosterOrder.length) % rosterOrder.length]
      : c.key;
    const nextKey = rosterOrder.length > 0
      ? rosterOrder[(rosterIdx + 1) % rosterOrder.length]
      : c.key;
    const prevFighterName = (CHARACTERS[prevKey] && CHARACTERS[prevKey].name) || prevKey;
    const nextFighterName = (CHARACTERS[nextKey] && CHARACTERS[nextKey].name) || nextKey;

    const confirmLabel = isAi
      ? `Select ${c.name} as Opponent →`
      : `Select ${c.name} →`;
    const backLabel = isAi ? '← Back to Opponents' : '← Back to Roster';
    const switchBtnLabel = state.activeTab === 'profile'
      ? `Review Deck (${stats.totalCards})`
      : '← Profile & Stats';
    const switchTarget = state.activeTab === 'profile' ? 'deck' : 'profile';

    overlay.innerHTML = `
      <div class="fp-modal role-${isAi ? 'ai' : 'human'} season-${stats.seasonKey} cplx-level-${cplx.level}" role="dialog" aria-modal="true" aria-label="${esc(c.name)} fighter card">
        <div class="fp-top-energy-beam" aria-hidden="true"></div>
        <div class="fp-portrait-col">
          ${portraitStageHTML(stats)}
        </div>

        <div class="fp-dossier-col">
          <header class="fp-header">
            <div class="fp-header-watermark" aria-hidden="true">${esc(c.name)}</div>
            <div class="fp-header-main">
              <div class="fp-kicker">${kickerParts.map(p => `<span>${esc(p)}</span>`).join('<span class="fp-dot" aria-hidden="true">·</span>')}</div>
              <h2 class="fp-name">${esc(c.name)}</h2>
            </div>
            <div class="fp-header-actions">
              <div class="fp-fighter-stepper" role="group" aria-label="Browse fighters">
                <button type="button" class="fp-step-fighter-btn fp-prev-fighter-btn" data-action="prev-fighter" onclick="FighterPreview.prevFighter()" aria-label="Previous Fighter: ${esc(prevFighterName)}" title="Previous Fighter: ${esc(prevFighterName)} (←)">← Previous Fighter</button>
                <span class="fp-roster-counter" aria-label="Fighter ${rosterIdx + 1} of ${rosterOrder.length}">${rosterIdx + 1} / ${rosterOrder.length}</span>
                <button type="button" class="fp-step-fighter-btn fp-next-fighter-btn" data-action="next-fighter" onclick="FighterPreview.nextFighter()" aria-label="Next Fighter: ${esc(nextFighterName)}" title="Next Fighter: ${esc(nextFighterName)} (→)">Next Fighter →</button>
              </div>
              <button type="button" class="fp-close-btn" onclick="FighterPreview.close()" aria-label="Close fighter card">✕</button>
            </div>
          </header>

          <div class="fp-tabs" role="tablist" aria-label="Fighter card sections">
            <button type="button" class="fp-tab-btn${state.activeTab === 'profile' ? ' active' : ''}" role="tab" aria-selected="${state.activeTab === 'profile' ? 'true' : 'false'}" onclick="FighterPreview.setTab('profile')">Profile &amp; Stats</button>
            <button type="button" class="fp-tab-btn${state.activeTab === 'deck' ? ' active' : ''}" role="tab" aria-selected="${state.activeTab === 'deck' ? 'true' : 'false'}" onclick="FighterPreview.setTab('deck')">Deck Review (${stats.totalCards})</button>
          </div>

          <div class="fp-body" id="fpBodyScroll">
            ${state.activeTab === 'deck' ? deckTabHTML(stats) : profileTabHTML(stats)}
          </div>

          <footer class="fp-footer">
            <div class="fp-footer-left">
              <button type="button" class="fp-btn fp-btn-back" onclick="FighterPreview.close()">${backLabel}</button>
            </div>
            <div class="fp-footer-right">
              <button type="button" class="fp-btn fp-btn-deck" onclick="FighterPreview.setTab('${switchTarget}')">${esc(switchBtnLabel)}</button>
              <button type="button" class="fp-btn fp-btn-confirm" onclick="FighterPreview.confirm()">${esc(confirmLabel)}</button>
            </div>
          </footer>
        </div>
      </div>
      ${cardDetailLightboxHTML()}
    `;

    overlay.style.display = 'flex';
    if (overlay.setAttribute) overlay.setAttribute('aria-hidden', 'false');
  }

  function open(charKey, role = 'human') {
    if (!CHARACTERS[charKey]) return false;
    state.isOpen = true;
    state.charKey = charKey;
    state.role = role === 'ai' ? 'ai' : 'human';
    state.activeTab = 'profile';
    state.deckFilter = 'all';
    state.inspectedCardKey = null;
    state.inspectedDeckFilter = null;
    if (typeof StandeeAssets !== 'undefined' && StandeeAssets.ensureLoaded) {
      StandeeAssets.ensureLoaded(charKey);
    }
    renderPreview();
    return true;
  }

  function stepFighter(delta) {
    if (!state.isOpen || !state.charKey) return false;
    const order = getOrderedRosterKeys();
    if (order.length < 2) return false;
    const cur = order.indexOf(state.charKey);
    const idx = cur === -1 ? 0 : cur;
    const nextKey = order[(idx + delta + order.length) % order.length];
    if (!nextKey || !CHARACTERS[nextKey]) return false;
    state.charKey = nextKey;
    state.inspectedCardKey = null;
    state.inspectedDeckFilter = null;
    if (typeof StandeeAssets !== 'undefined' && StandeeAssets.ensureLoaded) {
      StandeeAssets.ensureLoaded(nextKey);
    }
    renderPreview();
    if (typeof document !== 'undefined') {
      const body = document.getElementById('fpBodyScroll');
      if (body) body.scrollTop = 0;
    }
    return true;
  }

  function prevFighter() {
    return stepFighter(-1);
  }

  function nextFighter() {
    return stepFighter(1);
  }

  function close() {
    state.isOpen = false;
    state.inspectedCardKey = null;
    state.inspectedDeckFilter = null;
    renderPreview();
  }

  function setTab(tab) {
    state.activeTab = tab === 'deck' ? 'deck' : 'profile';
    state.inspectedCardKey = null;
    renderPreview();
    if (typeof document !== 'undefined') {
      const body = document.getElementById('fpBodyScroll');
      if (body) body.scrollTop = 0;
    }
  }

  function setDeckFilter(filter) {
    const valid = ['all', 'special', 'ultra', 'normal'];
    state.deckFilter = valid.includes(filter) ? filter : 'all';
    state.inspectedCardKey = null;
    renderPreview();
  }

  function inspectCard(cardKey, filter) {
    if (!state.charKey || !cardKey) return;
    state.inspectedCardKey = cardKey;
    state.inspectedDeckFilter = filter || state.deckFilter || 'all';
    renderPreview();
  }

  function closeCardDetail() {
    if (!state.inspectedCardKey) return false;
    state.inspectedCardKey = null;
    renderPreview();
    return true;
  }

  function stepCardDetail(delta) {
    if (!state.inspectedCardKey || !state.charKey) return;
    const filter = state.inspectedDeckFilter || 'all';
    const entries = getFilteredDeckEntries(state.charKey, filter);
    if (entries.length < 2) return;
    const cur = entries.findIndex(e => e.card.key === state.inspectedCardKey);
    if (cur === -1) return;
    const next = (cur + delta + entries.length) % entries.length;
    state.inspectedCardKey = entries[next].card.key;
    renderPreview();
  }

  function confirm() {
    const key = state.charKey;
    const role = state.role;
    if (!key || !CHARACTERS[key]) return;
    close();
    if (role === 'ai') {
      if (typeof commitAiCharacterSelection === 'function') commitAiCharacterSelection(key);
    } else {
      if (typeof commitCharacterSelection === 'function') commitCharacterSelection(key);
    }
  }

  function isOpen() { return !!state.isOpen; }
  function isCardDetailOpen() { return !!(state.isOpen && state.inspectedCardKey); }
  function getState() { return { ...state }; }

  return {
    open,
    close,
    confirm,
    stepFighter,
    prevFighter,
    nextFighter,
    getOrderedRosterKeys,
    setTab,
    setDeckFilter,
    inspectCard,
    closeCardDetail,
    stepCardDetail,
    isOpen,
    isCardDetailOpen,
    getState,
    computeFighterStats,
    getDeckEntries,
    FIGHTER_COMPLEXITY,
  };
})();

function openFighterPreview(charKey, role) {
  return FighterPreview.open(charKey, role);
}
function closeFighterPreview() {
  FighterPreview.close();
}
function confirmFighterPreview() {
  FighterPreview.confirm();
}
function isFighterPreviewOpen() {
  return FighterPreview.isOpen();
}
function nextFighterPreview() {
  return FighterPreview.nextFighter();
}
function prevFighterPreview() {
  return FighterPreview.prevFighter();
}

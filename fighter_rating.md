# Fighter Rating

Ratings for every playable fighter in this Exceed implementation, on two axes:

- **Complexity** — how heavy the fighter's mechanics are: how many forced decision
  points they add per turn, how much persistent state the player must track, and how
  far they deviate from the plain move / strike / prepare / change-cards baseline.
- **Win Rate** — how often they actually win.

Each axis is rated twice: **stars** (1–5, half-stars possible) and an **order**
(1 = highest, out of 41).

**Roster size:** this file covers **41** fighters — every key in `CHARACTERS`
(`cards.js:5109`), which is exactly what `rosterKeys()` (`ui.js:19`) treats as playable.

**Basis:** all judgements below come from the mechanics as *implemented* — `cards.js`
character entries and card definitions, `engine.js` (turn loop, `resolveStrikeSteps`,
stat resolution), and the `G.mode` prompts in `ui.js` that a human player is actually
asked about. Printed-but-deferred card text is treated as absent, because it is.

---

## 1. Complexity

Scale anchor: **1.0** = vanilla-shaped specials and a passive that never asks you
anything. **5.0** = a fighter that demands constant tracking and several branching
choices every single turn.

| # | Fighter | Stars | Score | Signature mechanic |
|---|---|---|---|---|
| 1 | Zato-1 | ★★★★★ | 5.0 | Eddie — a third board token every Special measures Range from |
| 2 | Happy Chaos | ★★★★½ | 4.5 | A sealed-card zone that eats his own deck as ammunition |
| 3 | C. Viper | ★★★★ | 4.0 | Optional bonus Strike after *every* Continuous Boost |
| 4 | Platinum | ★★★★ | 4.0 | Reveal-and-play a free boost each exchange; a whole boost board to maintain |
| 5 | Nagoriyuki | ★★★★ | 4.0 | Reshuffle force-Exceeds him and permanently bricks all seven Specials |
| 6 | Anji Mito | ★★★½ | 3.5 | Buy Guard with Force on every attack you set, attacking or defending |
| 7 | ν-No. 13 | ★★★½ | 3.5 | Rent +4 Range at set time — on offence *and* defence |
| 8 | Hakumen | ★★★½ | 3.5 | Gauge is both the exceed clock (cost 8) and every Special's mid-Strike fuel |
| 9 | Bang | ★★★½ | 3.5 | Deck-sifting Action plus Overdrive that rakes back every copy of a card |
| 10 | Jack-O | ★★★½ | 3.5 | Boosts-in-play are a live counter her cards scale off |
| 11 | Faust | ★★★½ | 3.5 | Every Action force-boosts a random card off his own deck |
| 12 | Cammy | ★★★½ | 3.5 | Side-swapping guarantees range; stacked range-immunity windows |
| 13 | Baiken | ★★★ | 3.0 | Four cards check a live "3 or fewer cards in hand" threshold |
| 14 | Tager | ★★★ | 3.0 | Hard cap: he can never self-move more than 2 |
| 15 | Jin | ★★★ | 3.0 | Pay Gauge at set time for Draw 2; delayed boosts and hand-size Guard |
| 16 | M. Bison | ★★★ | 3.0 | Bespoke multi-select hand-to-Gauge Action |
| 17 | Axl | ★★★ | 3.0 | +2 Range welded onto the whole Normals pool, plus four paid prompts |
| 18 | Testament | ★★★ | 3.0 | A free reposition prompt on every Normal that connects |
| 19 | Chun-Li | ★★★ | 3.0 | Retreat prompt after every Boost; a range-less Head Stomp |
| 20 | Vega | ★★★ | 3.0 | Edge-of-arena zoning his own cards keep walking him out of |
| 21 | Zangief | ★★★ | 3.0 | Character-level bonus stapled onto every Critical paid at Range 1 |
| 22 | Sol Badguy | ★★½ | 2.5 | Cancel-chaining into +POW — Gauge split between Cancels and Ultras |
| 23 | Millia | ★★½ | 2.5 | Stunning the opponent opens a four-option menu |
| 24 | Chipp | ★★½ | 2.5 | An unconditional reposition prompt after *every* exchange |
| 25 | Leo | ★★½ | 2.5 | Free Exceed on stun — then oscillating in and out of Exceed |
| 26 | Ramlethal | ★★½ | 2.5 | Pay {2} at set time to stretch any attack one space further |
| 27 | Noel | ★★½ | 2.5 | Buy initiative: Gauge for +1 SPD at set time |
| 28 | Taokaka | ★★½ | 2.5 | Two optional Force-for-POW spends and a mandatory lunge |
| 29 | Goldlewis | ★★½ | 2.5 | Ten distinct cards and a 36-card deck — breadth, not depth |
| 30 | Akuma | ★★½ | 2.5 | Symmetric Critical: +POW to *both* players |
| 31 | Sagat | ★★½ | 2.5 | Optional face-up Strike — reveal your attack to buy initiative |
| 32 | Guile | ★★½ | 2.5 | Change Cards as an engine: first Gauge spent generates {2} extra |
| 33 | Dan | ★★½ | 2.5 | Self-destructive gambling on random discards and deck rolls |
| 34 | I-No | ★★ | 2.0 | {1} Action: Advance 2 and Strike |
| 35 | Ky Kiske | ★★ | 2.0 | The first Cancel each turn is free tempo |
| 36 | May | ★★ | 2.0 | One Force, always, for +POW when initiating |
| 37 | Ken | ★★ | 2.0 | Close-and-draw every turn, with initiator-conditional burst |
| 38 | Ragna | ★★ | 2.0 | Lifesteal on literally every hit |
| 39 | Ryu | ★½ | 1.5 | Textbook shoto — the baseline the file is written against |
| 40 | Potemkin | ★½ | 1.5 | A flat, promptless +POW/+ARM tax for standing at Range 1 |
| 41 | Giovanna | ★½ | 1.5 | An Action that is simply "Strike, and draw on hit" |

### Notes on the complexity extremes

**Zato-1 (5.0)** is the only fighter with an extra board entity: `eddiePos`
(`engine.js:120`), placed via a `place_eddie` prompt on every Normal hit
(`cards.js:6284` → `ui.js:1297`), with `attackSourcePos` (`engine.js:704`) rerouting
Special range origin to Eddie and `onStrikeCleanup` (`cards.js:6315`) removing him
after most Specials. The plant-with-Normals / spend-with-Specials cycle is a second
game running alongside the first.

**Happy Chaos (4.5)** carries a `sealedCards` zone (`engine.js:80`) fed by an on-hit
`named_choice_effect` yield (`cards.js:6232`), three cards that read the pile back,
Sagat-style face-up initiation, and an Exceed that immediately Reverts.

**Giovanna, Potemkin, Ryu (1.5)** each add essentially one thing to the baseline and
never prompt: Giovanna's `resolve` is a bare `{ triggersStrike: true }`
(`cards.js:6121`), Potemkin is a single `rangeConditionalStatBonus` (`cards.js:5524`),
and Ryu has exactly one interactive hook in his whole kit (`cards.js:361`).

---

## 2. Win Rate

**Methodology:** deterministic 164-game Champion AI-vs-AI round-robin sample run
through the real `GameController` and bundled `exceed_poc.html` (8 scheduled games per
fighter — 4 as P1, 4 as P2 — against rotated roster opponents; undecided turn-cap
draws are excluded from the denominator). Because this measures **in-engine AI-vs-AI**
performance rather than human tournament play, straightforward stat-pressure and
high-value passive kits tend to outperform kits whose edge depends on multi-turn human
setup.

Scale anchor: **5.0** = ≥ 80% decided win rate, **3.0** = 45–54%, **1.0** = < 10%.

| # | Fighter | Stars | Score | Decided W–L (Rate) | AI-vs-AI strength profile |
|---|---|---|---|---|---|
| 1 | Guile | ★★★★★ | 5.0 | 7–1 (87.5%) | Gauge-into-Force Change Cards engine plus Exceed follow-up Strikes snowball card advantage |
| 2 | Happy Chaos | ★★★★★ | 5.0 | 7–1 (87.5%) | High-impact face-up specials and sealed-deck ammo pressure overwhelm standard trades |
| 3 | Ryu | ★★★★★ | 5.0 | 7–1 (87.5%) | Clean stat bands, reliable Street Fighter Criticals, and zero awkward AI decision traps |
| 4 | Faust | ★★★★★ | 5.0 | 6–1 (85.7%) | Free deck-top Boosts plus Action-triggered Strikes generate constant tempo and stat boosts |
| 5 | Nagoriyuki | ★★★★★ | 5.0 | 4–1 (80.0%) | Massive Exceed-state Ultra/Normal stats dominate once forced Exceed triggers (3 draws) |
| 6 | Dan | ★★★★½ | 4.5 | 6–2 (75.0%) | Wild Swing Critical stat bonuses and cheap Exceed swing close exchanges |
| 7 | Giovanna | ★★★★½ | 4.5 | 6–2 (75.0%) | Action-triggered Strikes with on-hit card draw keep hand and tempo full |
| 8 | Goldlewis Dickinson | ★★★★½ | 4.5 | 6–2 (75.0%) | 9-card hand limit and initiator bonuses produce consistently strong Attack selection |
| 9 | Jin Kisaragi | ★★★★½ | 4.5 | 6–2 (75.0%) | Overdrive ticking plus efficient set-time draws sustain late-game hand quality |
| 10 | Platinum the Trinity | ★★★★½ | 4.5 | 6–2 (75.0%) | Free cleanup Continuous Boosts and Overdrive boost triggers build huge stat stacks |
| 11 | Potemkin | ★★★★½ | 4.5 | 6–2 (75.0%) | Promptless Range 1 +POW/+ARM passive wins point-blank brawls reliably |
| 12 | Zangief | ★★★★½ | 4.5 | 6–2 (75.0%) | Street Fighter Critical bonus at Range 1 punishes close-range trades brutally |
| 13 | Bang Shishigami | ★★★★ | 4.0 | 5–3 (62.5%) | Deck-sifting Action and Overdrive recursion keep high-value specials circulating |
| 14 | Ky Kiske | ★★★★ | 4.0 | 5–3 (62.5%) | Free first Cancel tempo and Range 2 speed spikes convert cleanly under AI heuristics |
| 15 | May | ★★★★ | 4.0 | 5–3 (62.5%) | Direct Force-for-POW initiator bursts match the AI planner's exchange math well |
| 16 | Ragna the Bloodedge | ★★★★ | 4.0 | 5–3 (62.5%) | Consistent lifesteal on hit and Overdrive persistence win attrition races |
| 17 | Sagat | ★★★★ | 4.0 | 5–3 (62.5%) | Face-up Strike speed bonuses and SF Criticals give strong initiative control |
| 18 | Ramlethal Valentine | ★★★½ | 3.5 | 4–3 (57.1%) | Set-time range extension converts midrange hands into reliable hits |
| 19 | Akuma | ★★★ | 3.0 | 4–4 (50.0%) | High-variance mutual Critical POW spikes cut both ways equally |
| 20 | Cammy | ★★★ | 3.0 | 4–4 (50.0%) | Side-swapping and range immunity trade evenly across mixed matchups |
| 21 | Hakumen | ★★★ | 3.0 | 4–4 (50.0%) | Expensive 8-Gauge Exceed clock delays Overdrive, offset by strong Gauge-fueled Strikes |
| 22 | Ken | ★★★ | 3.0 | 4–4 (50.0%) | Reliable close-and-draw Action and SF Criticals produce balanced results |
| 23 | M. Bison | ★★★ | 3.0 | 4–4 (50.0%) | Hand-to-Gauge engine accelerates Exceed and Ultras cleanly |
| 24 | Testament | ★★★ | 3.0 | 4–4 (50.0%) | Normal-hit reposition gives steady spacing without explosive burst |
| 25 | Axl Low | ★★½ | 2.5 | 3–5 (37.5%) | Long-range Normals pressure at distance, but AI struggles to protect spacing under rushdown |
| 26 | Chun-Li | ★★½ | 2.5 | 3–5 (37.5%) | Post-boost Retreat helps spacing, though lower raw damage trails heavier hitters |
| 27 | Iron Tager | ★★½ | 2.5 | 3–5 (37.5%) | Self-movement cap of 2 limits AI approach options against mobile kits |
| 28 | Taokaka | ★★½ | 2.5 | 3–5 (37.5%) | Optional Force spends and mandatory lunges occasionally misalign range |
| 29 | Zato-1 | ★★½ | 2.5 | 3–5 (37.5%) | Eddie placement adds range reach, but AI under-optimizes plant-then-spend sequencing |
| 30 | ν-No. 13 | ★★½ | 2.5 | 3–5 (37.5%) | Set-time +4 Range rental shines at distance, but Gauge/spacing upkeep is fragile |
| 31 | I-No | ★★ | 2.0 | 2–5 (28.6%) | Action-triggered Advance-2 Strike helps close in, but fragile defense loses races |
| 32 | Leo Whitefang | ★★ | 2.0 | 2–5 (28.6%) | Free Exceed on Stun spikes output, but mandatory non-Strike Revert breaks momentum |
| 33 | C. Viper | ★★ | 2.0 | 2–6 (25.0%) | Continuous-Boost chaining is potent when aligned, but AI often strikes before setting up |
| 34 | Millia Rage | ★★ | 2.0 | 2–6 (25.0%) | Stun-gated four-option passive triggers too infrequently in evenly traded AI strikes |
| 35 | Vega | ★★ | 2.0 | 2–6 (25.0%) | Edge-of-arena bonuses conflict with attack movement that pulls him off the wall |
| 36 | Baiken | ★½ | 1.5 | 1–6 (14.3%) | Low-hand-size ("3 or fewer") triggers conflict with AI's preference for healthy hand counts |
| 37 | Chipp Zanuff | ★½ | 1.5 | 1–6 (14.3%) | Reposition-heavy low-guard kit suffers when AI trades directly into high-POW hitters |
| 38 | Jack-O | ★½ | 1.5 | 1–6 (14.3%) | Boost-count scaling requires multi-turn setup that generic AI heuristics rarely sustain |
| 39 | Noel Vermillion | ★½ | 1.5 | 1–7 (12.5%) | Spending Gauge for +1 SPD starves her Overdrive/Ultra tempo in AI play |
| 40 | Sol Badguy | ★½ | 1.5 | 1–7 (12.5%) | Gauge competition between Cancel chains and Ultras depresses AI conversion |
| 41 | Anji Mito | ★ | 1.0 | 0–8 (0.0%) | Defensive Guard-buying at set time drains hand resources faster than AI recovers tempo |

### Notes on the win-rate extremes

**Top tier (Guile, Happy Chaos, Ryu, Faust, Nagoriyuki — 80–87.5%)** share high floor
value on every action: their passives either fire automatically (Ryu, Nagoriyuki),
piggyback on core actions the AI already prioritizes (Guile's Change Cards, Faust's
Action-Strike), or turn every Strike into above-rate stats (Happy Chaos).

**Bottom tier (Anji Mito, Sol Badguy, Noel, Jack-O, Chipp, Baiken — 0–14.3%)** mostly
represent **AI-piloting friction rather than broken card math**: Baiken's ≤3-hand
threshold actively fights the AI's hand-hoarding heuristic, Jack-O needs sustained
Continuous Boost boards, and Anji's set-time Force-for-Guard trades hand economy for
defensive survival that requires human read accuracy to convert.


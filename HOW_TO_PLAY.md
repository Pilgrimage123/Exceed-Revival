# EXCEED — Command Manual (How to Play)

> **Goal:** Drop your opponent from **30 Life** to **0 Life** on a 9-space linear arena before they drop you. Every card in your deck works both as a **face-down Strike** (attack) and a **face-up Boost** (buff, movement, or utility).

---

## Quick Start & Controls

| Shortcut | Action |
| --- | --- |
| `?` | Toggle Command Manual overlay (`Escape` closes) |
| `S` | Initiate **Strike** |
| `B` | Play a **Boost** |
| `M` | **Move** on the arena |
| `E` | **Exceed** your fighter (when Gauge is ready) |
| `Space` / `Enter` | Advance / skip Strike playback |
| `1`–`5` / `←` `→` | Navigate Command Manual tabs while open |

---

## 01 · 60-Second Match Briefing

- **Starting Setup:** Each fighter begins with **30 Life**, a shuffled deck, an opening hand, and one **free Mulligan** before Turn 1 (set aside any opening cards, draw replacements, then shuffle the set-aside cards back).
- **The 9-Space Arena:** Positions are `1` through `9`. **Range** is the distance between the two fighters (`1`–`8`). An attack only connects if the current Range falls inside its printed **Range (`R`)** band.
- **Hand Limit & Draw:** At the end of any **non-Strike** turn, draw **1 card**. If you end a turn with more than **7 cards** (9 for Goldlewis), discard down to your limit.
- **Core Resource Loop:**
  1. **Connect (`Hit → Gauge`):** Attacks that connect go to your **Gauge** instead of Discard, fueling Ultras, Exceeding, Criticals, and Cancels.
  2. **Whiff or Stun (`Miss/Stun → Discard`):** Out-of-range or Stunned attacks go to **Discard** (no Gauge gained).
  3. **Convert (`Cards → Force`):** Discard cards from **Hand or Gauge** to pay **Force** for Movement and Boosts (**Normal / Special = 1 Force**, **Ultra = 2 Force** from both Hand and Gauge). You may **overpay** a Force cost (e.g., pitching a 2-Force Ultra for a 1-Force cost); any excess Force is lost.

### Turn Command List

On your turn, choose **one** action:

| Command | Hotkey | Cost | Effect |
| --- | --- | --- | --- |
| **Strike** | `S` | 1 Card (or Blind Wild Swing) | Set a card face-down as your attack. Opponent picks a defense, then both reveal simultaneously. |
| **Boost** | `B` | `0–2 Force` | Play a card face-up for its bottom Boost effect instead of attacking. Draw 1 at end of turn. |
| **Move** | `M` | `1 Force / space` | Discard cards from Hand or Gauge to Advance, Retreat, or pass through your opponent. |
| **Change Cards** | — | Any `Force` | Spend cards from Hand or Gauge, draw cards equal to Force spent, plus end-of-turn draw. |
| **Prepare** | — | Free | Draw 1 card (plus end-of-turn draw) to refill your hand and build Force. |
| **Exceed** | `E` | `2–4 Gauge` | Once per game, spend Gauge to permanently flip your fighter into their stronger Exceeded mode. |
| **Reshuffle** | — | `1× / Game` | Shuffle your discard pile back into your deck before running dry into forced Wild Swings. |
| **Fighter Action** | `★` | Varies | Unique Innate/Exceeded move available on select fighters. |

---

## 02 · Card Anatomy (Two Halves in One)

```text
┌─────────────────────────────────────────┐
│ [BORDER COLOR] Normal / Special / Ultra │  ← Blue = Normal · Violet = Special · Rose = Ultra
│ Card Name                       [4G]    │  ← Strike Title & Gauge Cost (0G if omitted)
├───────┬───────┬───────┬────────┬────────┤
│  R    │  P    │  S    │   A    │   G    │  ← Combat Stat Bar
│ 3–6   │  4    │  4    │   0    │   0    │
├───────┴───────┴───────┴────────┴────────┤
│ Before / Hit / After Strike effects     │  ← Triggers only when used as an Attack
│ [Critical: +2 Speed.]                   │  ← Street Fighter only (unlock with 1 Gauge)
├ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤  ← STRIKE (top) / BOOST (bottom) SPLIT
│ BOOST                  Continuous / ⏱ 1 │  ← Continuous stays until Strike ends; ⏱ 1 = Cancelable
│ [1 Force] Boost effect text             │  ← Never costs Gauge (only Force if badged)
└─────────────────────────────────────────┘
```

### Stat Breakdown

| Stat | Meaning |
| --- | --- |
| **R (Range)** | Required distance between fighters to hit (`1`, `1–2`, `3–6`, or `N/A` for defensive `Block`). |
| **P (Power)** | Base damage dealt on hit before subtracting the defender's Armor. |
| **S (Speed)** | Activation priority. Higher Speed resolves first; **ties are won by the Strike initiator**. |
| **A (Armor)** | Subtracted from incoming Power (`Damage = max(0, Power − Armor)`). Can reduce hits to `0`. |
| **G (Guard)** | Stun threshold. If damage taken exceeds Guard before your card activates (`Damage > Guard`), your card is **Stunned**. |

### Example Archetypes

| Type | Example | Strike Side | Boost Side |
| --- | --- | --- | --- |
| **Normal** | **Cross** | `R 1–2 · P 3 · S 6 · A 0 · G 0` — *After: Retreat 3.* | Free Instant — *Advance up to 3.* |
| **Special** | **Hadoken** *(Ryu)* | `R 3–6 · P 4 · S 4 · A 0 · G 0` — *After: On hit, recycle to deck top & send discard top to Gauge.* **Critical:** *+2 Speed.* | Free Continuous — *+2 Power, +1 Armor.* |
| **Ultra** | **Metsu Shoryuken** *(Ryu)* | `4G · R 1 · P 7 · S 5 · A 0 · G 0` — *+3 Speed if opponent initiated.* | `1 Force` Instant — *Move 2, then Strike.* |

---

## 03 · Strike Clash Resolution & Speed Ladder

### Exact Clash Order

1. **Reveal & Speed Check:** Both cards flip face-up. Higher total **Speed** acts first (ties go to the **Initiator**).
2. **Faster Card Resolves:**
   - **Before:** Pre-hit movement or setup triggers before checking Range (e.g., `Assault` closes 2).
   - **Range Check:** If current distance is within `Range`, the attack **Hits**; otherwise it **Whiffs**.
   - **Damage & Armor:** `Damage = max(0, Attacker Power − Defender Armor)` (`Ignore Armor` treats Armor as `0`).
   - **Stun Check:** If `Damage > Defender Guard` (`Ignore Guard` treats Guard as `0`), the slower card is **STUNNED** and cancelled unless Stun Immune.
   - **Hit / After:** Trigger in order.
3. **Slower Card Resolves (if not Stunned):** Follows the exact same `Before → Range → Damage → Hit → After` sequence.
4. **Cleanup:**
   - Cards that **landed a hit** (or `Block` if not Stunned) go to **Gauge**.
   - Cards that **whiffed** or were **Stunned** go to **Discard**.
   - Continuous Boosts expire (or convert per card rules).

### Normals Speed Ladder (`0 → 7`)

Shared across core / Street Fighter decks (community shorthand refers to Normals by Speed, e.g., `"732"` = Grasp, Spike, Sweep):

| Speed | Card | Range | Power | Armor | Guard | Key Effect |
| --- | --- | --- | --- | --- | --- | --- |
| **S0** | **Block** | `N/A` | `0` | `2` | `3` | Spend Force for +2 ARM each; adds to Gauge if not Stunned |
| **S1** | **Focus** | `1–2` | `4` | `2` | `5` | Immune to opponent movement; *After: Draw 1* |
| **S2** | **Sweep** | `1–3` | `6` | `0` | `6` | Heavy hit + 6 Guard wall; *Hit: Opponent discards 1 at random* |
| **S3** | **Spike** | `2–3` | `5` | `0` | `4` | **Ignores Armor & Guard** (dedicated wall-breaker) |
| **S4** | **Dive** | `1` | `5` | `0` | `0` | *Before: Advance 3* (can cross up past opponent) |
| **S5** | **Assault** | `1` | `4` | `0` | `0` | *Before: Close 2*; *Hit: Advantage* (take next turn) |
| **S6** | **Cross** | `1–2` | `3` | `0` | `0` | Fast poke; *After: Retreat 3* |
| **S7** | **Grasp** | `1` | `3` | `0` | `0` | Fastest Normal; *Hit: Push/Pull opponent 1–2* |

---

## 04 · Season Mechanics

- **Street Fighter — Critical (`1 Gauge`):** Street Fighter fighters may pay **1 Gauge** when setting a Strike to unlock yellow **Critical:** bonuses (or pay `1G` on a card without Critical text as a bluff). *Guilty Gear and BlazBlue fighters do not use Critical.*
- **Guilty Gear Strive — Cancel (`⏱ 1`):** Boosts marked `⏱ 1` are **Cancelable**. After resolving one, spend **1 Gauge** to immediately take another action without ending your turn (chainable while you have Gauge).
- **BlazBlue — Overdrive & Astral Heat:** Exceeding loads your remaining Gauge into **Overdrive**, ticking each turn for passive bonuses. Taking **Reshuffle** unlocks your hidden **Astral Heat** finisher into play.

---

## 05 · Visual Combat Icons

### On-Board Strike Callouts

| Symbol | Label | Meaning |
| --- | --- | --- |
| 💥 | **Hit** | Attack connected; number indicates Life lost after Armor |
| ❌ | **Miss** | Attack whiffed out of range or target was immune |
| 💫 | **Stun** | Damage exceeded Guard — slower card discarded with no effect |
| ➡️ | **Move** | Advance, Retreat, Close, Push, or Pull shifted fighter position |
| 🛡️ | **Armor** | Block Force or bonus Armor absorbed incoming damage |
| 🩹 | **Non-Lethal** | Effect damage that cannot reduce Life below 1 |
| ✨ | **EX Pair** | Matching second copy discarded for `+1 POW / SPD / ARM / GRD` |

### Fight Log Event Symbols

| Symbol | Label | Meaning |
| --- | --- | --- |
| 🃏 | **Draw** | Cards drawn from Prepare, end-of-turn draw, Mulligan, or effects |
| 🗑️ | **Discard** | Cards sent to Discard |
| 🪫 | **Gauge** | Gauge gained, spent, or moved |
| ⚡ | **Force** | Force paid via Hand or Gauge discards |
| ⬆ | **Boost** | Face-up Boost played or sustained in play |
| ⌛ | **Boost Expires** | Continuous Boost ended and converted to Gauge |
| 📌 | **Sustain** | Continuous Boost retained past normal cleanup |
| 🔒 | **Seal** | Card removed to sealed zone |
| 🔀 | **Reshuffle** | Discard pile shuffled back into deck |
| 💚 | **Heal** | Life restored |
| 🔥 | **Exceed** | Fighter transformed into Exceeded form |
| ⤵️ | **Revert** | Exceeded fighter reverted to Innate side |
| 🌀 | **Overdrive** | BlazBlue Overdrive turn-start tick |
| 🔁 | **Advantage** | Fighter earned the immediate next turn |
| ➕ | **Bonus Action** | Effect granted an extra immediate action |
| 🚫 | **Immune / Blocked** | Stun resisted, movement blocked, or option prevented |

---

## 06 · Rules & FGC Glossary

### Core Exceed Terms

- **Advantage (`Adv`):** Whoever holds Advantage takes the next turn instead of turns alternating. If both gain it, the latest grant wins.
- **Wild Swing (`WS`):** Set the top card of your deck face-down sight unseen instead of a card from hand. Always legal; mandatory if your hand is empty.
- **EX Strike (`EX`):** Pair two matching copies of the same card face-down for **+1 Power, +1 Speed, +1 Armor, and +1 Guard** (second copy is discarded on reveal).
- **Change Cards (`CC#`):** Spend Force to draw that many replacement cards, plus end-of-turn draw.
- **Unique Ability (`UA`):** Your fighter's Innate / Exceeded passive and character ability.

### FGC Strategy Terms

- **Shoto:** Balanced all-rounder with projectile, DP reversal, and solid normals (Ryu, Ken).
- **Zoner:** Controls long range and forces approaches through projectiles (Guile, Sagat, Nu-13).
- **Rushdown:** Aggressive close-range pressure focused on closing space and maintaining Advantage.
- **Grappler:** Threatens terrifying Range 1 throws and high-reward close exchanges (Zangief, Potemkin, Iron Tager).
- **Footsies:** Mid-range spacing battle of poking, baiting whiffs, and controlling Range.
- **Punish:** Landing a clean hit against a whiffed or out-positioned attack.
- **Reversal / DP:** High-speed defensive answer when the opponent initiates a Strike (e.g., *Shoryuken*, *Metsu Shoryuken*).
- **Checkmate:** Guaranteed win line where every legal opponent card loses to your play.
- **Option Select (OS):** A single play that safely covers multiple rival responses at once.

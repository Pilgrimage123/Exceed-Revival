//! Native, deterministic primitives shared by the command-line, server, and WASM CPU AI.
//!
//! This crate deliberately owns no hidden game state.  Browser and native adapters send
//! canonical public snapshots, which keeps the JS engine usable as a differential oracle.

use std::cmp::Ordering;

pub const PROTOCOL_VERSION: u32 = 1;
pub const BOARD_SPACES: u8 = 9;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CardType { Normal, Special, Ultra }

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CardCount {
    pub key: String,
    pub copies: u8,
    pub force: u8,
    pub range: Option<(u8, u8)>,
    pub card_type: CardType,
    pub gauge_cost: u8,
    pub is_astral: bool,
}

impl CardCount {
    pub fn new(
        key: impl Into<String>,
        copies: u8,
        force: u8,
        range: Option<(u8, u8)>,
        card_type: CardType,
        gauge_cost: u8,
        is_astral: bool,
    ) -> Self {
        Self { key: key.into(), copies, force, range, card_type, gauge_cost, is_astral }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CardBelief {
    pub card: CardCount,
    pub public: u8,
    pub known_hand: u8,
    pub out_of_play: u8,
    pub excluded_from_hand: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BeliefState {
    entries: Vec<CardBelief>,
    hand_size: u8,
    deck_size: u8,
}

impl BeliefState {
    pub fn new(entries: Vec<CardBelief>, hand_size: u8, deck_size: u8) -> Result<Self, String> {
        let state = Self { entries, hand_size, deck_size };
        state.assert_invariants()?;
        Ok(state)
    }

    pub fn entries(&self) -> &[CardBelief] { &self.entries }
    pub fn hand_size(&self) -> u8 { self.hand_size }
    pub fn deck_size(&self) -> u8 { self.deck_size }

    pub fn set_excluded_from_hand(&mut self, index: usize, excluded: bool) -> Result<(), String> {
        let entry = self.entries.get_mut(index).ok_or_else(|| "card index out of range".to_string())?;
        let prev = entry.excluded_from_hand;
        entry.excluded_from_hand = excluded;
        if let Err(err) = self.assert_invariants() {
            self.entries[index].excluded_from_hand = prev;
            return Err(err);
        }
        Ok(())
    }

    pub fn assert_invariants(&self) -> Result<(), String> {
        let known: u16 = self.entries.iter().map(|e| e.known_hand as u16).sum();
        if known > self.hand_size as u16 { return Err("known hand exceeds public hand size".into()); }
        let mut unknown = 0u16;
        for e in &self.entries {
            let used = e.public as u16 + e.known_hand as u16 + e.out_of_play as u16;
            if used > e.card.copies as u16 { return Err(format!("card conservation violated for {}", e.card.key)); }
            unknown += e.card.copies as u16 - used;
        }
        if unknown != self.hand_size as u16 + self.deck_size as u16 - known {
            return Err("unknown cards do not equal unknown hand plus deck slots".into());
        }
        let eligible: u16 = self.entries.iter()
            .filter(|e| !e.excluded_from_hand)
            .map(|e| e.card.copies as u16 - e.public as u16 - e.known_hand as u16 - e.out_of_play as u16)
            .sum();
        if eligible < self.hand_size as u16 - known { return Err("not enough eligible cards for unknown hand slots".into()); }
        Ok(())
    }

    pub fn unknown_hand_slots(&self) -> u8 {
        let known: u16 = self.entries.iter().map(|e| e.known_hand as u16).sum();
        (self.hand_size as u16).saturating_sub(known) as u8
    }

    pub fn unknown_copies(&self, index: usize) -> u8 {
        let e = &self.entries[index];
        e.card.copies.saturating_sub(e.public.saturating_add(e.known_hand).saturating_add(e.out_of_play))
    }

    /// Exact uniform-prior P(the opponent holds at least one copy of `index`).
    /// Behavioral log-odds belong in the adapter layer; conservation always stays here.
    pub fn probability_at_least_one(&self, index: usize) -> f64 {
        let entry = &self.entries[index];
        if entry.known_hand > 0 { return 1.0; }
        let hand = self.unknown_hand_slots() as u64;
        if entry.excluded_from_hand || hand == 0 { return 0.0; }
        let target = self.unknown_copies(index) as u64;
        if target == 0 { return 0.0; }
        let eligible: u64 = (0..self.entries.len())
            .filter(|&i| !self.entries[i].excluded_from_hand)
            .map(|i| self.unknown_copies(i) as u64)
            .sum();
        if eligible < hand { return 0.0; }
        if eligible - target < hand { return 1.0; }
        // Product ratio avoids binomial overflow (inf / inf -> NaN) for large decks.
        let mut p_none = 1.0;
        for j in 0..hand {
            p_none *= (eligible - target - j) as f64 / (eligible - j) as f64;
        }
        (1.0 - p_none).clamp(0.0, 1.0)
    }

    pub fn probability_ex_ready(&self, index: usize) -> f64 {
        let entry = &self.entries[index];
        let required = 2i32 - entry.known_hand as i32;
        if required <= 0 { return 1.0; }
        if entry.excluded_from_hand { return 0.0; }
        let target = self.unknown_copies(index) as u64;
        let hand = self.unknown_hand_slots() as u64;
        if target < required as u64 || hand < required as u64 { return 0.0; }
        let eligible: u64 = (0..self.entries.len())
            .filter(|&i| !self.entries[i].excluded_from_hand)
            .map(|i| self.unknown_copies(i) as u64)
            .sum();
        if eligible < hand { return 0.0; }

        let p_zero = if eligible - target < hand {
            0.0
        } else {
            let mut prod = 1.0;
            for j in 0..hand {
                prod *= (eligible - target - j) as f64 / (eligible - j) as f64;
            }
            prod
        };
        if required == 1 {
            return (1.0 - p_zero).clamp(0.0, 1.0);
        }

        // required == 2: P(X >= 2) = 1 - P(X = 0) - P(X = 1) via overflow-safe product ratio.
        let p_one = if eligible - target < hand - 1 {
            0.0
        } else {
            let mut prod = (target as f64 * hand as f64) / (eligible - hand + 1) as f64;
            for j in 0..(hand - 1) {
                prod *= (eligible - target - j) as f64 / (eligible - j) as f64;
            }
            prod
        };
        (1.0 - p_zero - p_one).clamp(0.0, 1.0)
    }
}

pub fn choose(n: u64, k: u64) -> f64 {
    if k > n { return 0.0; }
    let k = k.min(n - k);
    let mut result = 1.0;
    for i in 1..=k { result = result * (n - k + i) as f64 / i as f64; }
    result
}

/// Canonical Force payment selection allowing overpayment (`total_force >= min_force`).
/// Lower `discard_cost` means more disposable; ties prefer less wasted Force.
#[derive(Clone, Debug, PartialEq)]
pub struct ForceCard { pub id: String, pub force: u8, pub discard_cost: f64 }

pub fn choose_force_payment(cards: &[ForceCard], min_force: u8, forbidden_ids: &[&str]) -> Option<Vec<String>> {
    let target = min_force as usize;
    let mut dp: Vec<Option<(f64, usize, Vec<usize>)>> = vec![None; target + 1];
    dp[0] = Some((0.0, 0, Vec::new()));
    for (i, card) in cards.iter().enumerate() {
        if forbidden_ids.contains(&card.id.as_str()) { continue; }
        let f = card.force as usize;
        if f == 0 && target > 0 { continue; }
        for prev in (0..=target).rev() {
            if let Some((prev_cost, prev_force, ref prev_indices)) = dp[prev] {
                let next_s = prev.saturating_add(f).min(target);
                let next_cost = prev_cost + card.discard_cost;
                let next_force = prev_force + f;
                let better = dp[next_s].as_ref().map_or(true, |(old_cost, old_force, _)| {
                    next_cost < *old_cost || (next_cost == *old_cost && next_force < *old_force)
                });
                if better {
                    let mut next_indices = prev_indices.clone();
                    next_indices.push(i);
                    dp[next_s] = Some((next_cost, next_force, next_indices));
                }
            }
        }
    }
    dp[target].as_ref().map(|(_, _, indices)| {
        indices.iter().map(|&i| cards[i].id.clone()).collect()
    })
}

#[derive(Clone, Debug, PartialEq)]
pub struct MixedStrategy { pub probabilities: Vec<f64>, pub value: f64, pub exploitability: f64 }

/// Regret-matching+ for a zero-sum matrix whose rows are the AI's actions.
pub fn solve_zero_sum_cfr(payoffs: &[Vec<f64>], iterations: usize) -> Result<MixedStrategy, String> {
    let rows = payoffs.len();
    let cols = payoffs.first().map_or(0, Vec::len);
    if rows == 0 || cols == 0 || payoffs.iter().any(|row| row.len() != cols) { return Err("payoff matrix must be rectangular and non-empty".into()); }
    let mut row_regret = vec![0.0; rows];
    let mut col_regret = vec![0.0; cols];
    let mut average = vec![0.0; rows];
    let mut col_average = vec![0.0; cols];
    let mut row = vec![0.0; rows];
    let mut col = vec![0.0; cols];
    let mut row_values = vec![0.0; rows];
    let mut col_values = vec![0.0; cols];
    for _ in 0..iterations.max(1) {
        fill_regret_strategy(&row_regret, &mut row);
        fill_regret_strategy(&col_regret, &mut col);
        row_values.fill(0.0);
        col_values.fill(0.0);
        let mut value = 0.0;
        for r in 0..rows {
            let p_row = &payoffs[r];
            let r_prob = row[r];
            for c in 0..cols {
                let pay = p_row[c];
                row_values[r] += col[c] * pay;
                col_values[c] += r_prob * pay;
                value += r_prob * col[c] * pay;
            }
        }
        for r in 0..rows { row_regret[r] = (row_regret[r] + row_values[r] - value).max(0.0); average[r] += row[r]; }
        for c in 0..cols { col_regret[c] = (col_regret[c] + value - col_values[c]).max(0.0); col_average[c] += col[c]; }
    }
    let probabilities = normalize(&average);
    let col_probs = normalize(&col_average);
    let worst = (0..cols).map(|c| (0..rows).map(|r| probabilities[r] * payoffs[r][c]).sum::<f64>()).fold(f64::INFINITY, f64::min);
    let best_response = (0..rows).map(|r| (0..cols).map(|c| col_probs[c] * payoffs[r][c]).sum::<f64>()).fold(f64::NEG_INFINITY, f64::max);
    Ok(MixedStrategy { probabilities, value: worst, exploitability: (best_response - worst).max(0.0) })
}

fn fill_regret_strategy(regret: &[f64], out: &mut [f64]) {
    let mut total = 0.0;
    for (i, &r) in regret.iter().enumerate() {
        let v = r.max(0.0);
        out[i] = v;
        total += v;
    }
    if total <= f64::EPSILON {
        let u = 1.0 / out.len() as f64;
        out.fill(u);
    } else {
        let inv = 1.0 / total;
        for v in out.iter_mut() { *v *= inv; }
    }
}
fn normalize(values: &[f64]) -> Vec<f64> { let total: f64 = values.iter().sum(); if total <= f64::EPSILON { vec![1.0 / values.len() as f64; values.len()] } else { values.iter().map(|v| v / total).collect() } }

#[derive(Clone, Debug, PartialEq)]
pub struct PuctEdge { pub prior: f64, pub visits: u32, pub availability: u32, pub value_sum: f64 }

/// Availability-normalized IS-PUCT prevents an action from looking bad merely because a
/// determinization did not make it legal.
pub fn select_puct(edges: &[PuctEdge], exploration: f64, fpu: f64) -> Option<usize> {
    edges.iter().enumerate().filter(|(_, edge)| edge.availability > 0).max_by(|(_, a), (_, b)| {
        let score = |edge: &PuctEdge| {
            let q = if edge.visits == 0 { fpu } else { edge.value_sum / edge.visits as f64 };
            q + exploration * edge.prior * ((edge.availability as f64).sqrt() / (1.0 + edge.visits as f64))
        };
        score(a).partial_cmp(&score(b)).unwrap_or(Ordering::Equal)
    }).map(|(index, _)| index)
}

/// FNV-1a is intentionally simple to implement identically in the JS trace adapter.
pub fn canonical_hash(canonical_json: &str) -> String {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in canonical_json.as_bytes() { hash ^= *byte as u64; hash = hash.wrapping_mul(0x100000001b3); }
    format!("{hash:016x}")
}

#[unsafe(no_mangle)]
pub extern "C" fn exceed_ai_protocol_version() -> u32 { PROTOCOL_VERSION }

#[cfg(test)]
mod tests {
    use super::*;
    fn belief() -> BeliefState {
        BeliefState::new(vec![
            CardBelief { card: CardCount::new("a", 2, 1, Some((1, 1)), CardType::Normal, 0, false), public: 0, known_hand: 0, out_of_play: 0, excluded_from_hand: false },
            CardBelief { card: CardCount::new("b", 2, 1, Some((1, 2)), CardType::Normal, 0, false), public: 0, known_hand: 0, out_of_play: 0, excluded_from_hand: false },
            CardBelief { card: CardCount::new("block", 2, 1, None, CardType::Normal, 0, false), public: 2, known_hand: 0, out_of_play: 0, excluded_from_hand: false },
        ], 2, 2).unwrap()
    }
    #[test] fn belief_probability_is_exact() { assert!((belief().probability_at_least_one(0) - 5.0 / 6.0).abs() < 1e-12); assert!((belief().probability_ex_ready(0) - 1.0 / 6.0).abs() < 1e-12); assert_eq!(belief().probability_at_least_one(2), 0.0); }
    #[test] fn exclusion_is_hard_constraint() { let mut state = belief(); state.set_excluded_from_hand(0, true).unwrap(); assert_eq!(state.probability_at_least_one(0), 0.0); }
    #[test] fn astral_out_of_play_and_large_deck_ex_ready() {
        let state = BeliefState::new(vec![
            CardBelief { card: CardCount::new("astral", 1, 2, Some((1, 2)), CardType::Ultra, 3, true), public: 0, known_hand: 0, out_of_play: 1, excluded_from_hand: true },
            CardBelief { card: CardCount::new("filler", 200, 1, Some((1, 2)), CardType::Normal, 0, false), public: 0, known_hand: 0, out_of_play: 0, excluded_from_hand: false },
            CardBelief { card: CardCount::new("target", 4, 1, Some((1, 2)), CardType::Special, 0, false), public: 0, known_hand: 0, out_of_play: 0, excluded_from_hand: false },
        ], 150, 54).unwrap();
        assert_eq!(state.probability_at_least_one(0), 0.0);
        let p_ex = state.probability_ex_ready(2);
        assert!(p_ex.is_finite() && p_ex > 0.0 && p_ex < 1.0, "expected finite p_ex, got {p_ex}");
    }
    #[test] fn force_pruner_preserves_expensive_cards() { let cards = vec![ForceCard { id: "cheap".into(), force: 1, discard_cost: 1.0 }, ForceCard { id: "pair".into(), force: 1, discard_cost: 9.0 }, ForceCard { id: "ultra".into(), force: 2, discard_cost: 3.0 }]; assert_eq!(choose_force_payment(&cards, 2, &[]), Some(vec!["ultra".into()])); }
    #[test] fn force_pruner_allows_overpayment_with_ultra() {
        let cards = vec![ForceCard { id: "ultra".into(), force: 2, discard_cost: 3.0 }];
        assert_eq!(choose_force_payment(&cards, 1, &[]), Some(vec!["ultra".into()]));
    }
    #[test] fn force_pruner_respects_forbidden_at_u8_max_and_ex_pair() {
        let cards = vec![
            ForceCard { id: "ex1".into(), force: 2, discard_cost: 0.1 },
            ForceCard { id: "ex2".into(), force: 2, discard_cost: 0.1 },
            ForceCard { id: "ok".into(), force: 1, discard_cost: 1.0 },
        ];
        assert_eq!(choose_force_payment(&cards, 2, &["ex1", "ex2"]), None);
        assert_eq!(choose_force_payment(&cards, 1, &["ex1", "ex2"]), Some(vec!["ok".into()]));
        let many: Vec<ForceCard> = (0..70).map(|i| ForceCard { id: format!("c{i}"), force: 1, discard_cost: 1.0 }).collect();
        assert_eq!(choose_force_payment(&many, 2, &[]).map(|v| v.len()), Some(2));
    }
    #[test] fn cfr_finds_matching_pennies_mix() {
        let result = solve_zero_sum_cfr(&vec![vec![1.0, -1.0], vec![-1.0, 1.0]], 10_000).unwrap();
        assert!((result.probabilities[0] - 0.5).abs() < 0.03);
        assert!(result.exploitability < 0.05, "exploitability was {}", result.exploitability);
    }
    #[test] fn puct_uses_availability_and_fpu() {
        let edges = vec![
            PuctEdge { prior: 0.4, visits: 0, availability: 100, value_sum: 0.0 },
            PuctEdge { prior: 0.6, visits: 0, availability: 4, value_sum: 0.0 },
        ];
        assert_eq!(select_puct(&edges, 1.35, -0.15), Some(0));
        let unvisited_vs_good = vec![
            PuctEdge { prior: 0.5, visits: 10, availability: 10, value_sum: 8.0 },
            PuctEdge { prior: 0.1, visits: 0, availability: 10, value_sum: 0.0 },
        ];
        assert_eq!(select_puct(&unvisited_vs_good, 1.35, -0.15), Some(0));
    }
    #[test] fn hash_is_stable() {
        assert_eq!(canonical_hash("{\"a\":1}"), "9c3e82dd6fcae8b1");
        assert_eq!(canonical_hash("{\"name\":\"Chun-Li—é\"}"), canonical_hash("{\"name\":\"Chun-Li\u{2014}\u{00e9}\"}"));
        println!("utf8_hash={}", canonical_hash("{\"name\":\"Chun-Li—é\"}"));
    }
}

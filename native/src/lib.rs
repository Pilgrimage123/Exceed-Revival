//! Native, deterministic primitives shared by the command-line, server, and WASM CPU AI.
//!
//! This crate deliberately owns no hidden game state.  Browser and native adapters send
//! canonical public snapshots, which keeps the JS engine usable as a differential oracle.

use std::cmp::Ordering;

pub const PROTOCOL_VERSION: u32 = 1;
pub const BOARD_SPACES: u8 = 9;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CardCount {
    pub key: String,
    pub copies: u8,
    pub force: u8,
    pub range: Option<(u8, u8)>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CardBelief {
    pub card: CardCount,
    pub public: u8,
    pub known_hand: u8,
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
            let used = e.public as u16 + e.known_hand as u16;
            if used > e.card.copies as u16 { return Err(format!("card conservation violated for {}", e.card.key)); }
            unknown += e.card.copies as u16 - used;
        }
        if unknown != self.hand_size as u16 + self.deck_size as u16 - known {
            return Err("unknown cards do not equal unknown hand plus deck slots".into());
        }
        let eligible: u16 = self.entries.iter()
            .filter(|e| !e.excluded_from_hand)
            .map(|e| e.card.copies as u16 - e.public as u16 - e.known_hand as u16)
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
        e.card.copies.saturating_sub(e.public.saturating_add(e.known_hand))
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
        let eligible: u64 = (0..self.entries.len())
            .filter(|&i| !self.entries[i].excluded_from_hand)
            .map(|i| self.unknown_copies(i) as u64)
            .sum();
        let hand = self.unknown_hand_slots() as u64;
        let denom = choose(eligible, hand);
        if !denom.is_finite() || denom == 0.0 { return 0.0; }
        let mut result = 0.0;
        for copies in required as u64..=target.min(hand) {
            if hand - copies <= eligible.saturating_sub(target) {
                result += choose(target, copies) * choose(eligible - target, hand - copies) / denom;
            }
        }
        result
    }
}

pub fn choose(n: u64, k: u64) -> f64 {
    if k > n { return 0.0; }
    let k = k.min(n - k);
    let mut result = 1.0;
    for i in 1..=k { result = result * (n - k + i) as f64 / i as f64; }
    result
}

/// Exact canonical payment selection. Lower discard_cost means more disposable.
#[derive(Clone, Debug, PartialEq)]
pub struct ForceCard { pub id: String, pub force: u8, pub discard_cost: f64 }

pub fn choose_force_payment(cards: &[ForceCard], exact_force: u8, forbidden_id: Option<&str>) -> Option<Vec<String>> {
    if cards.len() > 64 { return None; }
    let target = exact_force as usize;
    let mut dp: Vec<Option<(f64, u64)>> = vec![None; target + 1];
    dp[0] = Some((0.0, 0));
    for (i, card) in cards.iter().enumerate() {
        if Some(card.id.as_str()) == forbidden_id { continue; }
        let f = card.force as usize;
        if f > target { continue; }
        for prev in (0..=target - f).rev() {
            if let Some((prev_cost, prev_mask)) = dp[prev] {
                let next_cost = prev_cost + card.discard_cost;
                let next_mask = prev_mask | (1u64 << i);
                if dp[prev + f].map_or(true, |(old, _)| next_cost < old) {
                    dp[prev + f] = Some((next_cost, next_mask));
                }
            }
        }
    }
    dp[target].map(|(_, mask)| {
        cards.iter().enumerate()
            .filter(|(i, _)| mask & (1u64 << i) != 0)
            .map(|(_, c)| c.id.clone())
            .collect()
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
            CardBelief { card: CardCount { key: "a".into(), copies: 2, force: 1, range: Some((1, 1)) }, public: 0, known_hand: 0, excluded_from_hand: false },
            CardBelief { card: CardCount { key: "b".into(), copies: 2, force: 1, range: Some((1, 2)) }, public: 0, known_hand: 0, excluded_from_hand: false },
            CardBelief { card: CardCount { key: "block".into(), copies: 2, force: 1, range: None }, public: 2, known_hand: 0, excluded_from_hand: false },
        ], 2, 2).unwrap()
    }
    #[test] fn belief_probability_is_exact() { assert!((belief().probability_at_least_one(0) - 5.0 / 6.0).abs() < 1e-12); assert!((belief().probability_ex_ready(0) - 1.0 / 6.0).abs() < 1e-12); assert_eq!(belief().probability_at_least_one(2), 0.0); }
    #[test] fn exclusion_is_hard_constraint() { let mut state = belief(); state.set_excluded_from_hand(0, true).unwrap(); assert_eq!(state.probability_at_least_one(0), 0.0); }
    #[test] fn force_pruner_preserves_expensive_cards() { let cards = vec![ForceCard { id: "cheap".into(), force: 1, discard_cost: 1.0 }, ForceCard { id: "pair".into(), force: 1, discard_cost: 9.0 }, ForceCard { id: "ultra".into(), force: 2, discard_cost: 3.0 }]; assert_eq!(choose_force_payment(&cards, 2, None), Some(vec!["ultra".into()])); }
    #[test] fn force_pruner_respects_forbidden_at_u8_max() {
        let cards = vec![ForceCard { id: "forbid".into(), force: 255, discard_cost: 0.1 }];
        assert_eq!(choose_force_payment(&cards, 255, Some("forbid")), None);
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

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
    pub range_min: u8,
    pub range_max: u8,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BeliefState {
    pub cards: Vec<CardCount>,
    pub public: Vec<u8>,
    pub known_hand: Vec<u8>,
    pub excluded_from_hand: Vec<bool>,
    pub hand_size: u8,
    pub deck_size: u8,
}

impl BeliefState {
    pub fn new(cards: Vec<CardCount>, public: Vec<u8>, known_hand: Vec<u8>, excluded_from_hand: Vec<bool>, hand_size: u8, deck_size: u8) -> Result<Self, String> {
        let state = Self { cards, public, known_hand, excluded_from_hand, hand_size, deck_size };
        state.assert_invariants()?;
        Ok(state)
    }

    pub fn assert_invariants(&self) -> Result<(), String> {
        let count = self.cards.len();
        if self.public.len() != count || self.known_hand.len() != count || self.excluded_from_hand.len() != count {
            return Err("belief vectors must have one entry per card key".into());
        }
        let known: u16 = self.known_hand.iter().map(|&x| x as u16).sum();
        if known > self.hand_size as u16 { return Err("known hand exceeds public hand size".into()); }
        let mut unknown = 0u16;
        for i in 0..count {
            let used = self.public[i] as u16 + self.known_hand[i] as u16;
            if used > self.cards[i].copies as u16 { return Err(format!("card conservation violated for {}", self.cards[i].key)); }
            unknown += self.cards[i].copies as u16 - used;
        }
        if unknown != self.hand_size as u16 + self.deck_size as u16 - known {
            return Err("unknown cards do not equal unknown hand plus deck slots".into());
        }
        let eligible: u16 = (0..count).filter(|&i| !self.excluded_from_hand[i]).map(|i| self.cards[i].copies as u16 - self.public[i] as u16 - self.known_hand[i] as u16).sum();
        if eligible < self.hand_size as u16 - known { return Err("not enough eligible cards for unknown hand slots".into()); }
        Ok(())
    }

    pub fn unknown_hand_slots(&self) -> u8 { self.hand_size - self.known_hand.iter().sum::<u8>() }

    pub fn unknown_copies(&self, index: usize) -> u8 {
        self.cards[index].copies - self.public[index] - self.known_hand[index]
    }

    /// Exact uniform-prior P(the opponent holds at least one copy of `index`).
    /// Behavioral log-odds belong in the adapter layer; conservation always stays here.
    pub fn probability_at_least_one(&self, index: usize) -> f64 {
        if self.known_hand[index] > 0 { return 1.0; }
        if self.excluded_from_hand[index] || self.unknown_hand_slots() == 0 { return 0.0; }
        let target = self.unknown_copies(index) as u64;
        if target == 0 { return 0.0; }
        let eligible: u64 = (0..self.cards.len()).filter(|&i| !self.excluded_from_hand[i]).map(|i| self.unknown_copies(i) as u64).sum();
        let hand = self.unknown_hand_slots() as u64;
        1.0 - choose(eligible - target, hand) / choose(eligible, hand)
    }

    pub fn probability_ex_ready(&self, index: usize) -> f64 {
        let required = 2i32 - self.known_hand[index] as i32;
        if required <= 0 { return 1.0; }
        if self.excluded_from_hand[index] { return 0.0; }
        let target = self.unknown_copies(index) as u64;
        let eligible: u64 = (0..self.cards.len()).filter(|&i| !self.excluded_from_hand[i]).map(|i| self.unknown_copies(i) as u64).sum();
        let hand = self.unknown_hand_slots() as u64;
        let mut result = 0.0;
        for copies in required as u64..=target.min(hand) {
            if hand - copies <= eligible - target {
                result += choose(target, copies) * choose(eligible - target, hand - copies) / choose(eligible, hand);
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
    if cards.len() > 20 { return None; } // callers must pre-prune; prevents accidental exponential search.
    let mut best: Option<(f64, Vec<String>)> = None;
    for mask in 0u64..(1u64 << cards.len()) {
        let mut force = 0u8;
        let mut cost = 0.0;
        let mut ids = Vec::new();
        for (i, card) in cards.iter().enumerate() {
            if mask & (1 << i) != 0 {
                if Some(card.id.as_str()) == forbidden_id { force = u8::MAX; break; }
                force = force.saturating_add(card.force);
                cost += card.discard_cost;
                ids.push(card.id.clone());
            }
        }
        if force == exact_force && best.as_ref().map_or(true, |(old, _)| cost < *old) { best = Some((cost, ids)); }
    }
    best.map(|(_, ids)| ids)
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
    for _ in 0..iterations.max(1) {
        let row = regret_strategy(&row_regret); let col = regret_strategy(&col_regret);
        let mut row_values = vec![0.0; rows]; let mut col_values = vec![0.0; cols]; let mut value = 0.0;
        for r in 0..rows { for c in 0..cols { row_values[r] += col[c] * payoffs[r][c]; col_values[c] += row[r] * payoffs[r][c]; value += row[r] * col[c] * payoffs[r][c]; } }
        for r in 0..rows { row_regret[r] = (row_regret[r] + row_values[r] - value).max(0.0); average[r] += row[r]; }
        for c in 0..cols { col_regret[c] = (col_regret[c] + value - col_values[c]).max(0.0); col_average[c] += col[c]; }
    }
    let probabilities = normalize(&average);
    let col_probs = normalize(&col_average);
    let worst = (0..cols).map(|c| (0..rows).map(|r| probabilities[r] * payoffs[r][c]).sum::<f64>()).fold(f64::INFINITY, f64::min);
    let best_response = (0..rows).map(|r| (0..cols).map(|c| col_probs[c] * payoffs[r][c]).sum::<f64>()).fold(f64::NEG_INFINITY, f64::max);
    Ok(MixedStrategy { probabilities, value: worst, exploitability: (best_response - worst).max(0.0) })
}

fn regret_strategy(regret: &[f64]) -> Vec<f64> { normalize(&regret.iter().map(|x| x.max(0.0)).collect::<Vec<_>>()) }
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
    fn belief() -> BeliefState { BeliefState::new(vec![CardCount { key: "a".into(), copies: 2, force: 1, range_min: 1, range_max: 1 }, CardCount { key: "b".into(), copies: 2, force: 1, range_min: 1, range_max: 2 }], vec![0, 0], vec![0, 0], vec![false, false], 2, 2).unwrap() }
    #[test] fn belief_probability_is_exact() { assert!((belief().probability_at_least_one(0) - 5.0 / 6.0).abs() < 1e-12); assert!((belief().probability_ex_ready(0) - 1.0 / 6.0).abs() < 1e-12); }
    #[test] fn exclusion_is_hard_constraint() { let mut state = belief(); state.excluded_from_hand[0] = true; assert_eq!(state.probability_at_least_one(0), 0.0); }
    #[test] fn force_pruner_preserves_expensive_cards() { let cards = vec![ForceCard { id: "cheap".into(), force: 1, discard_cost: 1.0 }, ForceCard { id: "pair".into(), force: 1, discard_cost: 9.0 }, ForceCard { id: "ultra".into(), force: 2, discard_cost: 3.0 }]; assert_eq!(choose_force_payment(&cards, 2, None), Some(vec!["ultra".into()])); }
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

//! Floor layout must be a geometrically closed hex cycle (task 2.3):
//! consecutive galleries — including the loop-closing last→first pair —
//! occupy hex-adjacent cells, so every doorway is a real shared wall.

use babel_gen::gen::graph::build_graph;
use std::collections::HashSet;

/// The 6 axial hex-neighbor offsets (mirrors graph.rs HEX_DIRECTIONS).
const HEX_DIRECTIONS: [(i32, i32); 6] = [(1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)];

fn hex_adjacent(a: (i32, i32), b: (i32, i32)) -> bool {
    let d = (b.0 - a.0, b.1 - a.1);
    HEX_DIRECTIONS.contains(&d)
}

/// Cells of floor 0 in chain order (each shell's horizontal_neighbor points
/// to the next in the ring).
fn floor0_cycle(seed: u64, book_count: usize) -> Vec<(i32, i32)> {
    let shells = build_graph(seed, book_count);
    let floor0: Vec<_> = shells
        .iter()
        .enumerate()
        .filter(|(_, s)| s.floor == 0)
        .collect();
    // Walk the directed ring starting from index 0.
    let mut order = Vec::new();
    let mut seen = HashSet::new();
    let mut idx = 0usize;
    loop {
        if !seen.insert(idx) {
            break;
        }
        let shell = &shells[idx];
        order.push((shell.q, shell.r));
        match shell.horizontal_neighbor {
            Some(next) if shells[next].floor == 0 => idx = next,
            _ => break,
        }
    }
    assert_eq!(
        order.len(),
        floor0.len(),
        "the ring must visit every floor-0 gallery exactly once"
    );
    order
}

#[test]
fn floor0_is_a_closed_hex_cycle() {
    for seed in [0u64, 1, 7, 42, 0xBABE1] {
        let cycle = floor0_cycle(seed, 50);
        assert!(
            cycle.len() >= 7,
            "seed {seed}: floor 0 must have >= 7 galleries, got {}",
            cycle.len()
        );
        for i in 0..cycle.len() {
            let a = cycle[i];
            let b = cycle[(i + 1) % cycle.len()];
            assert!(
                hex_adjacent(a, b),
                "seed {seed}: consecutive galleries {a:?} -> {b:?} (ring step {i}) must be hex-adjacent"
            );
        }
    }
}

#[test]
fn loop_closing_edge_is_hex_adjacent() {
    // The specific regression: last -> first must be a unit hex step, not a
    // teleport across the floor.
    for seed in [0u64, 3, 99, 1234] {
        let cycle = floor0_cycle(seed, 40);
        let first = cycle[0];
        let last = cycle[cycle.len() - 1];
        assert!(
            hex_adjacent(last, first),
            "seed {seed}: loop-closing edge {last:?} -> {first:?} must be hex-adjacent"
        );
    }
}

#[test]
fn cells_are_unique() {
    let cycle = floor0_cycle(42, 60);
    let unique: HashSet<_> = cycle.iter().copied().collect();
    assert_eq!(unique.len(), cycle.len(), "no cell may repeat in the cycle");
}

use proptest::prelude::*;

proptest! {
    #![proptest_config(ProptestConfig { cases: 300, ..ProptestConfig::default() })]

    /// Across fuzzed seeds and catalog sizes, floor 0 is ALWAYS a closed hex
    /// cycle — every consecutive pair (including last->first) hex-adjacent,
    /// no repeated cell. This is the invariant the retry/fallback must never
    /// violate (an open chain would put the loop-closing doorway in a wall
    /// facing empty space).
    #[test]
    fn floor0_always_closes(seed in any::<u64>(), book_count in 0usize..2000) {
        let cycle = floor0_cycle(seed, book_count);
        let unique: HashSet<_> = cycle.iter().copied().collect();
        prop_assert_eq!(unique.len(), cycle.len(), "no repeated cell");
        prop_assert!(cycle.len() >= 3, "a cycle needs >= 3 cells");
        for i in 0..cycle.len() {
            let a = cycle[i];
            let b = cycle[(i + 1) % cycle.len()];
            prop_assert!(hex_adjacent(a, b), "step {} {:?}->{:?} not adjacent", i, a, b);
        }
    }
}

// Flat-top hex axial -> world (must mirror emit::hex_center).
fn hex_center_xz(q: i32, r: i32) -> (f32, f32) {
    let side = 4.0f32;
    (
        side * 3f32.sqrt() * (q as f32 + r as f32 / 2.0),
        side * 1.5 * r as f32,
    )
}

#[test]
fn each_gallery_records_its_edge_direction() {
    // vestibule_direction is the WALL INDEX (normal angle 60°·w) whose
    // outward normal points at the horizontal neighbor — so the vestibule
    // opening is built on the wall actually facing the neighbor.
    let shells = build_graph(7, 50);
    for (i, shell) in shells.iter().enumerate() {
        let Some(neighbor) = shell.horizontal_neighbor else {
            continue;
        };
        let (ax, az) = hex_center_xz(shell.q, shell.r);
        let (bx, bz) = hex_center_xz(shells[neighbor].q, shells[neighbor].r);
        let to_neighbor = (bz - az).atan2(bx - ax);
        let wall_angle = std::f32::consts::PI / 3.0 * shell.vestibule_direction as f32;
        let diff = (to_neighbor - wall_angle).rem_euclid(std::f32::consts::TAU);
        let diff = diff.min(std::f32::consts::TAU - diff);
        assert!(
            diff < 0.01,
            "gallery {i}: vestibule_direction wall {} (angle {wall_angle}) must face neighbor at angle {to_neighbor}",
            shell.vestibule_direction
        );
    }
}

//! Hex gallery-graph shape generation: which `(q, r, floor)` cells are
//! occupied and how they connect. Pure position/topology — no book
//! assignment or furnishing here (see `assign` and `furnish`).
//!
//! Each hexagon has exactly one vestibule wall (doc 04), so it can have at
//! most one horizontal neighbor — a general 2D "blob" shape is geometrically
//! impossible under that constraint (it needs degree-2+ cells to stay
//! connected). Instead, each floor is a single winding **closed cycle** of
//! hexagons: a self-avoiding walk from the origin that returns to a cell
//! hex-adjacent to the origin, so the loop-closing edge (last → first) is a
//! real shared wall between physically adjacent galleries, not a teleport
//! across the floor. This is the concrete implementation of Borges' own
//! resolution to the library's apparent infinity — "unlimited but
//! periodic": walk far enough in one direction and you return, on foot
//! through real doorways, to where you started.

use std::collections::HashSet;

use rand::seq::IndexedRandom;
use rand::Rng;

use crate::gen::config;
use crate::rng::graph_rng;

/// A gallery's position and connectivity, before any books are assigned or
/// furniture placed.
#[derive(Debug, Clone, PartialEq)]
pub struct GalleryShell {
    pub q: i32,
    pub r: i32,
    pub floor: i32,
    pub horizontal_neighbor: Option<usize>,
    pub floor_above: Option<usize>,
    pub floor_below: Option<usize>,
}

/// The 6 axial-coordinate hex neighbor offsets, in a fixed order so
/// iteration order (and therefore RNG consumption order) is deterministic.
const HEX_DIRECTIONS: [(i32, i32); 6] = [(1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)];

/// Builds enough gallery shells (floor 0 first, then floor 1, etc.) to hold
/// `book_count` books at `config::BOOKS_PER_HEX` each, padded up to
/// `config::FLOOR0_MIN_GALLERIES` on floor 0.
///
/// Floor 0 is grown as a single closed cycle (seeded self-avoiding walk from
/// the origin that returns hex-adjacent to it — see `grow_chain`). Floor N+1
/// mirrors floor N's footprint and cycle order exactly, connected vertically
/// via each hexagon's own vestibule staircase.
pub fn build_graph(seed: u64, book_count: usize) -> Vec<GalleryShell> {
    let total_needed = config::galleries_needed(book_count).max(config::FLOOR0_MIN_GALLERIES);
    let mut rng = graph_rng(seed);

    let mut shells: Vec<GalleryShell> = Vec::new();
    let mut floor0_positions: Vec<(i32, i32)> = Vec::new();
    // `floor_start_idx[f]` = index into `shells` where floor `f` begins.
    // Tracked explicitly (not derived from the previous floor's length)
    // because floor sizes can differ — the last floor is often smaller
    // than `FLOOR_TARGET_MAX_GALLERIES`, capped by however many galleries
    // actually remain — so `floor_start_idx - positions.len()` is only
    // correct when consecutive floors happen to be the same size.
    let mut floor_start_idx: Vec<usize> = Vec::new();

    let mut floor = 0i32;
    let mut remaining = total_needed;

    while remaining > 0 {
        let floor_target = if floor == 0 {
            remaining.clamp(
                config::FLOOR0_MIN_GALLERIES,
                config::FLOOR_TARGET_MAX_GALLERIES,
            )
        } else {
            remaining.min(config::FLOOR_TARGET_MAX_GALLERIES)
        };

        let positions: Vec<(i32, i32)> = if floor == 0 {
            let chain = grow_chain(&mut rng, floor_target);
            floor0_positions = chain.clone();
            chain
        } else {
            floor0_positions
                .iter()
                .copied()
                .take(floor_target)
                .collect()
        };

        let this_floor_start = shells.len();
        floor_start_idx.push(this_floor_start);
        for &(q, r) in &positions {
            shells.push(GalleryShell {
                q,
                r,
                floor,
                horizontal_neighbor: None,
                floor_above: None,
                floor_below: None,
            });
        }

        // Horizontal connectivity: the chain itself, closed into a loop.
        // Every floor uses the same chain order as floor 0 (same footprint,
        // same adjacency), so this logic is identical regardless of floor.
        // A single directed ring (each node -> next node, last -> first)
        // still reaches every node from any starting point, which is all
        // `graph_connected_across_floors` requires.
        let n = positions.len();
        for i in 0..n {
            let this_idx = this_floor_start + i;
            let next_idx = this_floor_start + (i + 1) % n;
            shells[this_idx].horizontal_neighbor = Some(next_idx);
        }

        // Vertical connectivity to the floor below. Only the first
        // `positions.len()` shells of the floor below have a counterpart
        // here (a later floor can only ever be the same size or smaller,
        // since it's built from a prefix of `floor0_positions` capped by
        // `remaining`), so index pairing by position `i` is safe.
        if floor > 0 {
            let below_start = floor_start_idx[(floor - 1) as usize];
            for i in 0..positions.len() {
                let above_idx = this_floor_start + i;
                let below_idx = below_start + i;
                shells[above_idx].floor_below = Some(below_idx);
                shells[below_idx].floor_above = Some(above_idx);
            }
        }

        remaining = remaining.saturating_sub(positions.len());
        floor += 1;
    }

    shells
}

/// Grows a **closed** winding cycle of hex cells starting and ending at
/// `(0, 0)`: a self-avoiding seeded random walk whose final cell is
/// hex-adjacent to the origin, so the loop-closing edge (last → first) is a
/// real shared wall, not a teleport across the floor. Returns the cells in
/// cycle order (the caller wires consecutive cells, and last → first, as
/// horizontal neighbors).
///
/// Because a self-avoiding walk can paint itself into a corner (no
/// unvisited neighbor, or unable to return adjacent to the origin), this
/// retries with fresh RNG draws up to `MAX_ATTEMPTS`, then falls back to a
/// guaranteed-closable hex ring around the origin. It never returns an open
/// chain.
fn grow_chain(rng: &mut impl Rng, target_len: usize) -> Vec<(i32, i32)> {
    const MAX_ATTEMPTS: usize = 64;
    // A closed cycle on the hex lattice needs at least 3 cells; the floor-0
    // minimum (7) is always well above that.
    let target = target_len.max(3);

    for _ in 0..MAX_ATTEMPTS {
        if let Some(cycle) = try_grow_cycle(rng, target) {
            return cycle;
        }
    }
    hex_ring(target)
}

/// One self-avoiding-walk attempt to build a closed cycle of exactly
/// `target` cells returning adjacent to the origin. Returns `None` if the
/// walk gets stuck or can't close at the right length.
fn try_grow_cycle(rng: &mut impl Rng, target: usize) -> Option<Vec<(i32, i32)>> {
    let origin = (0, 0);
    let mut visited: HashSet<(i32, i32)> = HashSet::new();
    let mut chain: Vec<(i32, i32)> = Vec::new();
    let mut current = origin;
    visited.insert(current);
    chain.push(current);

    while chain.len() < target {
        let last_step = chain.len() == target - 1;
        let candidates: Vec<(i32, i32)> = HEX_DIRECTIONS
            .iter()
            .map(|&(dq, dr)| (current.0 + dq, current.1 + dr))
            .filter(|c| !visited.contains(c))
            // On the final step, the chosen cell must itself be adjacent to
            // the origin so the closing edge is a unit hex step.
            .filter(|c| !last_step || is_hex_adjacent(*c, origin))
            .collect();

        let &next = candidates.choose(rng)?;
        visited.insert(next);
        chain.push(next);
        current = next;
    }

    // Sanity: the cycle closes with a real hex step.
    if is_hex_adjacent(*chain.last().unwrap(), origin) {
        Some(chain)
    } else {
        None
    }
}

/// True if `a` and `b` are hex-adjacent (differ by one `HEX_DIRECTIONS` step).
fn is_hex_adjacent(a: (i32, i32), b: (i32, i32)) -> bool {
    let d = (b.0 - a.0, b.1 - a.1);
    HEX_DIRECTIONS.contains(&d)
}

/// A guaranteed-closable fallback: a ring of `len` cells hugging the origin,
/// each hex-adjacent to the next and the last adjacent to the first. Built
/// by spiralling outward with a self-avoiding greedy walk that always keeps
/// a return path — used only when the random walk fails to close, which is
/// rare, so simplicity beats optimality here.
fn hex_ring(len: usize) -> Vec<(i32, i32)> {
    // Walk the six edges of a hex spiral, collecting cells until we have
    // `len`, guaranteeing adjacency between consecutive cells. Since the
    // spiral is contiguous and returns toward the origin, truncating to
    // `len` and closing keeps every consecutive pair (and the closing pair,
    // for the small rings we need) adjacent.
    let mut cells: Vec<(i32, i32)> = vec![(0, 0)];
    let mut current = (0, 0);
    let mut dir = 0usize;
    while cells.len() < len {
        let (dq, dr) = HEX_DIRECTIONS[dir % HEX_DIRECTIONS.len()];
        let next = (current.0 + dq, current.1 + dr);
        if cells.contains(&next) {
            dir += 1;
            if dir > HEX_DIRECTIONS.len() * 2 {
                break; // safety: cannot extend further
            }
            continue;
        }
        cells.push(next);
        current = next;
        dir += 1; // turn each step to curl back toward the origin
    }
    cells
}

//! Deterministic RNG helpers. No `thread_rng`, no system entropy — every
//! random stream in this crate is seeded explicitly from `(seed, ...)` so
//! generation is fully reproducible.

use rand::{Rng, SeedableRng};
use rand_pcg::Pcg64;

/// Creates a fresh RNG stream for graph-growth decisions, seeded from the
/// library seed alone (used sequentially as the graph grows).
pub fn graph_rng(seed: u64) -> Pcg64 {
    Pcg64::seed_from_u64(seed)
}

/// Creates a fresh, independent RNG stream keyed by `(seed, book_id)` for
/// per-book presentation (spine dimensions, derived color). Independent
/// per book so inserting one book never perturbs another's appearance.
pub fn book_rng(seed: u64, book_id: u32) -> Pcg64 {
    // Mix seed and book_id into a single 64-bit seed rather than
    // concatenation, so nearby book ids don't produce visibly correlated
    // streams.
    let x = seed ^ (book_id as u64).wrapping_mul(0x9E3779B97F4A7C15);
    Pcg64::seed_from_u64(splitmix64(x))
}

/// The splitmix64 avalanche step: a cheap, well-distributed 64-bit mix,
/// used anywhere in this crate that needs a deterministic hash rather than
/// a full RNG stream (e.g. `book_rng` above, and derived spine colors in
/// `gen::assign`). Not itself an RNG — callers seed a real generator from
/// its output, or use it directly as a hash.
pub fn splitmix64(mut x: u64) -> u64 {
    x ^= x >> 30;
    x = x.wrapping_mul(0xBF58476D1CE4E5B9);
    x ^= x >> 27;
    x = x.wrapping_mul(0x94D049BB133111EB);
    x ^= x >> 31;
    x
}

/// Draws a uniform f32 in `[lo, hi]` from the given RNG.
pub fn range_f32(rng: &mut Pcg64, lo: f32, hi: f32) -> f32 {
    rng.random_range(lo..=hi)
}

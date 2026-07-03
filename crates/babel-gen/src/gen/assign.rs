//! Per-book presentation data (spine dimensions + color), deterministic per
//! (seed, book id) — independent of every other book's presence, so
//! inserting a book doesn't reshuffle anyone else's spine (doc 04
//! "Determinism note").

use crate::rng::{book_rng, range_f32, splitmix64};

/// Spine width/height/depth bounds, meters.
pub const SPINE_WIDTH_RANGE_M: (f32, f32) = (0.030, 0.060);
pub const SPINE_HEIGHT_RANGE_M: (f32, f32) = (0.180, 0.260);
pub const SPINE_DEPTH_RANGE_M: (f32, f32) = (0.120, 0.160);

/// Computes a book's spine dimensions and linear-space RGB color from
/// (seed, book_id), using the catalog color hint (0xRRGGBB) when present.
/// Pure function — no shared RNG stream, no dependency on other books or
/// slot position.
pub fn presentation_for(
    seed: u64,
    book_id: u32,
    color_hint: Option<u32>,
) -> ((f32, f32, f32), (f32, f32, f32)) {
    let mut rng = book_rng(seed, book_id);

    let dims = (
        range_f32(&mut rng, SPINE_WIDTH_RANGE_M.0, SPINE_WIDTH_RANGE_M.1),
        range_f32(&mut rng, SPINE_HEIGHT_RANGE_M.0, SPINE_HEIGHT_RANGE_M.1),
        range_f32(&mut rng, SPINE_DEPTH_RANGE_M.0, SPINE_DEPTH_RANGE_M.1),
    );

    let color = match color_hint {
        Some(hint) => hex_to_linear_rgb(hint),
        None => derived_color(book_id),
    };

    (dims, color)
}

fn hex_to_linear_rgb(hex: u32) -> (f32, f32, f32) {
    let r = ((hex >> 16) & 0xFF) as f32 / 255.0;
    let g = ((hex >> 8) & 0xFF) as f32 / 255.0;
    let b = (hex & 0xFF) as f32 / 255.0;
    (r, g, b)
}

/// Muted, bookish HSL-derived color from a hash of the book id — deliberately
/// not from the same RNG stream as spine dimensions, so a hint-vs-no-hint
/// change never perturbs dimensions.
fn derived_color(book_id: u32) -> (f32, f32, f32) {
    let hash = splitmix64(book_id as u64);
    let hue = (hash % 360) as f32;
    let sat = 0.45 + ((hash >> 16) % 26) as f32 / 100.0; // 0.45..=0.70
    let light = 0.35 + ((hash >> 32) % 26) as f32 / 100.0; // 0.35..=0.60
    hsl_to_rgb(hue, sat, light)
}

fn hsl_to_rgb(h: f32, s: f32, l: f32) -> (f32, f32, f32) {
    let c = (1.0 - (2.0 * l - 1.0).abs()) * s;
    let h_prime = h / 60.0;
    let x = c * (1.0 - (h_prime % 2.0 - 1.0).abs());
    let (r1, g1, b1) = match h_prime as u32 {
        0 => (c, x, 0.0),
        1 => (x, c, 0.0),
        2 => (0.0, c, x),
        3 => (0.0, x, c),
        4 => (x, 0.0, c),
        _ => (c, 0.0, x),
    };
    let m = l - c / 2.0;
    (r1 + m, g1 + m, b1 + m)
}

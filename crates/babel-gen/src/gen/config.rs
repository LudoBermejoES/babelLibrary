//! World-model constants — the single source of truth for every fixed
//! number in the generated library. Nothing outside this module should
//! contain a world-geometry numeric literal; derive it from here instead.
//! See doc/04-wasm-generator.md "World constants: one module, everything
//! derives" for the full rationale.

/// Shelf walls per hexagon (of 6 total; the rest are 1 vestibule + 1 shaft).
pub const SHELF_WALLS_PER_HEX: usize = 4;

/// Shelves per shelf wall.
pub const SHELVES_PER_WALL: usize = 5;

/// Book slots per shelf. Borges' text says 32; we deliberately use 8 so a
/// real, modest-sized catalog spreads across more galleries and each spine
/// is a larger interaction target (see doc 04's source-fidelity table).
pub const SLOTS_PER_SHELF: usize = 8;

/// Lamps per hexagon, placed crosswise, always on and deliberately dim.
pub const LAMPS_PER_HEX: usize = 2;

/// Hexagon side length, meters.
pub const HEX_SIDE_M: f32 = 4.0;

/// Ceiling height, meters — also the vertical rise per full staircase turn.
pub const CEILING_HEIGHT_M: f32 = 3.2;

/// Central shaft radius, meters.
pub const SHAFT_RADIUS_M: f32 = 1.0;

/// Spiral-staircase helix radius, meters — the walkable footprint inside the
/// vestibule. A distinct object from the central shaft; sized to roughly the
/// vestibule opening so the whole doorway path counts as "on the stairs".
pub const STAIRCASE_RADIUS_M: f32 = 1.2;

/// Central shaft railing height, meters.
pub const RAILING_HEIGHT_M: f32 = 0.9;

/// Shelf bay width, meters (fits inside the hex wall).
pub const SHELF_BAY_WIDTH_M: f32 = 3.2;

/// Vestibule opening clear width, meters.
pub const VESTIBULE_OPENING_M: f32 = 1.2;

/// Minimum number of galleries generated on floor 0, regardless of catalog
/// size, so small catalogs still feel like a library.
pub const FLOOR0_MIN_GALLERIES: usize = 7;

/// Target gallery count per floor before the next floor starts filling.
pub const FLOOR_TARGET_MAX_GALLERIES: usize = 19;

/// Response/generation cap safeguard, shared conceptually with the server's
/// own book-count cap (doc 03); not currently enforced here but documented
/// for symmetry — the generator itself has no hard upper bound.
pub const SHELVES_PER_HEX: usize = SHELF_WALLS_PER_HEX * SHELVES_PER_WALL;

/// Fixed book capacity per hexagon — the number every other size derives
/// from. Never write this as a literal outside this module.
pub const BOOKS_PER_HEX: usize = SHELVES_PER_HEX * SLOTS_PER_SHELF;

/// Nominal center-to-center slot spacing along a shelf, meters.
pub const SLOT_PITCH_M: f32 = SHELF_BAY_WIDTH_M / SLOTS_PER_SHELF as f32;

/// Given a catalog size, how many galleries are needed to hold it (before
/// the floor-0 minimum is applied).
pub fn galleries_needed(book_count: usize) -> usize {
    book_count.div_ceil(BOOKS_PER_HEX).max(1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fidelity_defaults() {
        // Deliberately pins literal values. This test is SUPPOSED to break
        // if config.rs changes — that's the point: it forces a conscious
        // review of doc 01's and doc 04's constant tables alongside any
        // world-model change, rather than letting the numbers drift apart
        // silently.
        assert_eq!(SHELF_WALLS_PER_HEX, 4);
        assert_eq!(SHELVES_PER_WALL, 5);
        assert_eq!(SLOTS_PER_SHELF, 8);
        assert_eq!(LAMPS_PER_HEX, 2);
        assert_eq!(SHELVES_PER_HEX, 20);
        assert_eq!(BOOKS_PER_HEX, 160);
    }

    #[test]
    fn staircase_radius_is_its_own_constant() {
        // The staircase helix is a distinct object from the central shaft;
        // it must not silently track SHAFT_RADIUS_M (the frontend borrowed
        // the shaft radius before this constant existed).
        assert_eq!(STAIRCASE_RADIUS_M, 1.2);
    }

    #[test]
    fn galleries_needed_matches_capacity() {
        assert_eq!(galleries_needed(0), 1);
        assert_eq!(galleries_needed(1), 1);
        assert_eq!(galleries_needed(BOOKS_PER_HEX), 1);
        assert_eq!(galleries_needed(BOOKS_PER_HEX + 1), 2);
        assert_eq!(galleries_needed(BOOKS_PER_HEX * 3), 3);
    }
}

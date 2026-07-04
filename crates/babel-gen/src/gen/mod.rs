pub mod assign;
pub mod config;
pub mod emit;
pub mod furnish;
pub mod graph;

use furnish::Vestibule;

/// One book from the catalog, as the generator consumes it. The frontend
/// pre-sorts by (author, title, id) before calling in — order here IS the
/// slot-fill order.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct InputBook {
    pub id: u32,
    /// 0xRRGGBB catalog hint, or `None` if the catalog has no hint for this book.
    pub color_hint: Option<u32>,
}

/// A book placed in a specific slot, with its full presentation baked in.
/// `None` represents an empty (surplus) slot.
pub type Slot = Option<PlacedBook>;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PlacedBook {
    pub book_id: u32,
    /// Spine dimensions in meters: (width, height, depth).
    pub dims: (f32, f32, f32),
    /// Linear-space RGB, 0.0..=1.0 each.
    pub color: (f32, f32, f32),
}

/// A fully generated, immutable library. Construction is deterministic:
/// same `seed` + same `books` (order matters) always yields an equal `Layout`.
#[derive(Debug, Clone, PartialEq)]
pub struct Layout {
    pub galleries: Vec<Gallery>,
    pub spawn_gallery: usize,
}

/// One hexagonal gallery. Shape (shelf-wall count, shelf count, lamp count,
/// vestibule presence) is always the same — see `config` — but contents
/// (which books, which neighbors exist) vary.
#[derive(Debug, Clone, PartialEq)]
pub struct Gallery {
    pub q: i32,
    pub r: i32,
    pub floor: i32,
    /// Index of the horizontally-adjacent gallery reachable through this
    /// gallery's vestibule, if any.
    pub horizontal_neighbor: Option<usize>,
    /// `HEX_DIRECTIONS` index of the wall facing `horizontal_neighbor` — the
    /// vestibule/doorway wall (see `GalleryShell::vestibule_direction`).
    pub vestibule_direction: usize,
    /// Index of the gallery at `(q, r, floor + 1)`, if generated.
    pub floor_above: Option<usize>,
    /// Index of the gallery at `(q, r, floor - 1)`, if generated.
    pub floor_below: Option<usize>,
    pub vestibule: Vestibule,
    /// One entry per slot, in the fixed traversal order (shelf-wall
    /// `0..SHELF_WALLS_PER_HEX`, row `0..SHELVES_PER_WALL`, slot
    /// `0..SLOTS_PER_SHELF`). Always exactly `config::BOOKS_PER_HEX` long.
    pub slots: Vec<Slot>,
}

impl Gallery {
    /// Total slot count — always `config::BOOKS_PER_HEX`, exposed as a
    /// method so tests assert the relationship rather than the literal.
    pub fn slot_count(&self) -> usize {
        self.slots.len()
    }
}

/// Generate a complete, deterministic layout for the given seed and ordered
/// catalog. Pure and target-independent — no wasm-bindgen involvement.
pub fn generate(seed: u64, books: &[InputBook]) -> Layout {
    let shells = graph::build_graph(seed, books.len());
    furnish::furnish(seed, shells, books)
}

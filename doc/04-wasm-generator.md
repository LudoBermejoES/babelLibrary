# 04 — `babel-gen`: the wasm layout generator

The generator is a Rust crate that turns `(seed, ordered book list)` into a complete library layout. It is the canonical owner of the world's geometry *data* (where every wall, shelf, slot, and collider is); the frontend owns geometry *meshes*. This doc defines the world model, the algorithm, the wasm API, and the exact buffer layouts.

## Crate structure

```text
crates/babel-gen/
├── Cargo.toml            # crate-type = ["cdylib", "rlib"]
├── src/
│   ├── lib.rs            # wasm-bindgen facade (thin; no logic)
│   ├── gen/
│   │   ├── config.rs     # ALL world-model constants (single source of truth, see below)
│   │   ├── mod.rs        # generate(seed, books) -> Layout   (pure, target-independent)
│   │   ├── graph.rs      # hex gallery graph
│   │   ├── furnish.rs    # shelf bays, slots, tables, lamps
│   │   ├── assign.rs     # book → slot assignment + spine presentation
│   │   └── collide.rs    # AABB emission
│   └── rng.rs            # SplitMix64/PCG wrapper
└── tests/determinism.rs  # native tests (cargo test, no wasm needed)
```

Everything under `gen/` compiles natively — determinism tests run with plain `cargo test`. Only `lib.rs` touches wasm-bindgen.

**RNG**: `rand_pcg::Pcg64` seeded explicitly (or a hand-rolled SplitMix64 — no `rand` default `thread_rng`, no floats from system entropy, no `HashMap` iteration order reaching output). Anything ordered that feeds output uses `Vec` or `BTreeMap`.

## World constants: one module, everything derives

Every world-model number lives as a compile-time constant in `crates/babel-gen/src/gen/config.rs` — changing a value there and recompiling adapts the entire system (generation, capacity math, buffer sizes, colliders, tests, and the frontend) with no other edits:

```rust
// gen/config.rs — the ONLY place world-model numbers are written as literals.
pub const SHELF_WALLS_PER_HEX: usize = 4;
pub const SHELVES_PER_WALL: usize = 5;
pub const SLOTS_PER_SHELF: usize = 8;      // Borges says 32; deliberately reduced (see fidelity table)
pub const LAMPS_PER_HEX: usize = 2;
pub const HEX_SIDE_M: f32 = 4.0;
pub const CEILING_HEIGHT_M: f32 = 3.2;     // also the staircase rise per full turn
pub const SHAFT_RADIUS_M: f32 = 1.0;
pub const RAILING_HEIGHT_M: f32 = 0.9;
pub const SHELF_BAY_WIDTH_M: f32 = 3.2;
pub const VESTIBULE_OPENING_M: f32 = 1.2;
pub const FLOOR0_MIN_GALLERIES: usize = 7;
pub const FLOOR_TARGET_MAX_GALLERIES: usize = 19;

// Derived — never written as a literal anywhere else:
pub const SHELVES_PER_HEX: usize = SHELF_WALLS_PER_HEX * SHELVES_PER_WALL;       // 20
pub const BOOKS_PER_HEX: usize = SHELVES_PER_HEX * SLOTS_PER_SHELF;              // 160
pub const SLOT_PITCH_M: f32 = SHELF_BAY_WIDTH_M / SLOTS_PER_SHELF as f32;        // 0.40
```

Rules that make this actually hold:

- **No magic numbers outside `config.rs`**: generation code, buffer emission, and collider math all reference the constants. Grep-auditable — a numeric literal like `160` or `4.0` appearing in `gen/*.rs` outside `config.rs` is a review defect.
- **Tests assert relationships, not literals**: the native suite checks `gallery.slot_count() == config::BOOKS_PER_HEX` and `galleries_needed(n) == n.div_ceil(config::BOOKS_PER_HEX)` — not `== 160` — so changing a constant doesn't orphan the tests. One dedicated test (`fidelity_defaults`) pins the current default values and exists precisely to fail loudly when someone changes `config.rs`, forcing a conscious update of that one test plus the doc tables.
- **The frontend never duplicates these**: `graph_json` includes a `config` block (`hexSide`, `ceilingHeight`, `shaftRadius`, `booksPerHex`, …) so the renderer, streaming, and floor-banding math read the constants through the wasm boundary. `web/src/controls/constants.ts` keeps only player-feel constants (walk speed, capsule radius, eye height) that the generator has no stake in.
- The numbers documented in this file and doc 01's table are the *defaults*; `config.rs` is the operative source of truth in code. Changing a value means updating `config.rs` + the `fidelity_defaults` test + the two doc tables — nothing else.

## World model

This world model follows Borges' "The Library of Babel" (1941) closely — not just in spirit (hexagonal galleries, endless shelves) but in its specific, textually-stated numbers and structure. See the summary table at the end of this section for the exact figures and their source. Deviating from a well-known text invites "that's not how the library works" bug reports; matching it is free correctness.

### Gallery graph (three dimensions: `q, r, floor`)

- Galleries are hexagons (side 4.0 m, flat-to-flat ≈ 6.93 m, ceiling 3.2 m) on an axial-coordinate hex grid, now addressed by **`(q, r, floor)`** — the library has multiple vertical levels, exactly as the text describes ("from any hexagon one can see the floors above and below... endlessly").
- **Wall roles, fixed by the source text**: of a hexagon's 6 walls, exactly **4 are shelf walls** and **2 are open** — one open wall leads to a **vestibule** (small anteroom, see below) that connects horizontally to a neighboring hexagon at the same floor; the other open wall faces the **central shaft** (see below). This is fixed per hexagon, not randomized — every hexagon has this same 4-shelf/2-open shape.
- **Why a chain, not a blob (periodicity, not boundedness)**: because each hexagon has exactly **one** vestibule wall, it can have at most **one** horizontal neighbor — a hexagon cannot branch to multiple neighbors. A general 2D "blob" (e.g. a hex ring) needs several cells with 2+ neighbors to stay connected, which is geometrically impossible under that constraint. Borges' own text resolves the analogous paradox (an unlimited-seeming library built from finite material) by declaring the library **"unlimited but periodic"**: walk far enough in one direction and you eventually encounter the same arrangement again. We implement that literally — the player is never "on floor 0" in an absolute sense; each floor is a single winding chain of hexagons that **loops back on itself**, so walking forward long enough returns you to where you started, mirror-like.
- **Growth algorithm**: fill floor 0 as one winding chain via seeded random walk (start at origin, repeatedly extend to a not-yet-visited neighbor cell chosen by seeded RNG — never branching, since each hexagon can only ever use its single vestibule wall once) until the chain reaches a target length (7–19 hexagons). The **last hexagon's free vestibule wall connects back to the first hexagon**, closing the loop — this is the concrete "periodic" resolution, not an infinite unbounded structure. Once a floor's chain is closed, start floor 1 directly above the same `(q, r)` footprint (each floor-0 cell gets a floor-1 counterpart in the same chain order), and so on, until `gallery_count = ceil(book_count / BOOKS_PER_HEX)` hexagons (default `BOOKS_PER_HEX` = 160, from `gen/config.rs`) exist across all floors. A **minimum of 7 galleries** (a small closed loop) on floor 0 is enforced so small catalogs still feel like a library, with surplus book slots left empty.
- **Horizontal connectivity** (within a floor): exactly the chain's edges — each hexagon's single vestibule wall connects to the next hexagon in the chain, and the last connects back to the first. No hexagon has more than one horizontal neighbor; there are no extra "loop" doorways beyond the one that closes the chain, since there's no spare wall to put them on.
- **Vertical connectivity**: every hexagon that has a floor-`+1` counterpart is connected to it via its vestibule's **spiral staircase** (up), and to its floor-`-1` counterpart (down) if one exists. The staircase occupies the same vestibule as the horizontal doorway (Borges: "through this space, too, there passes a spiral staircase") — one vestibule serves both horizontal and vertical traversal.
- The spawn gallery is `(0, 0, 0)`. The player starts partway between the central shaft and a shelf wall — not at the exact hex center, which sits inside the shaft's collider radius and would spawn the player floating in the shaft void — facing outward toward that shelf wall, so arrival shows shelves rather than the shaft opening (`emit::spawn_pose`; corrected after an early frontend build spawned in the shaft with no facing direction and rendered mostly black).

### Central shaft

- Every hexagon has, at its center, a **ventilation shaft**: a circular void (radius 1.0 m) bounded by a low railing (height 0.9 m), open through the floor and ceiling so the shaft is a continuous vertical column through every floor of the library at that `(q, r)`.
- Rendering: looking down or up through the shaft from a hexagon reveals the floor above/below at the same `(q, r)` if it exists in the generated layout (or open darkness if it doesn't — the library implies more floors than are ever generated, matching the text's "endlessly"). This is a real visual feature, not just flavor — see doc 05.
- Collision: the railing is a ring of small AABB segments (matching the existing wall-approximation technique) preventing the player from falling in; no gameplay penalty for v1 (no fall damage/death), but per Borges the shaft is implied bottomless.

### Vestibule

- One open wall per hexagon leads to a small vestibule (2.0 m × 1.5 m antechamber) between the hexagon and its horizontal neighbor (if any) and/or the vertical staircase.
- Contents, per the text: a **spiral staircase** (if a vertical neighbor exists — up, down, or both), **two small closets** flanking the passage (non-functional set dressing: one implies a sleeping alcove, one a lavatory — closed doors, not enterable), and a **mirror** on the wall opposite the hexagon entrance ("faithfully duplicates appearances" — rendered as a real reflective-material plane in v1, a cheap `MeshStandardMaterial` with high metalness/low roughness and an environment map, not a full planar-reflection render pass).
- If a hexagon has no horizontal neighbor and no vertical neighbor on a given side, its vestibule is still generated (per the text, every hexagon has one) but the staircase/doorway it would lead to is simply absent — the vestibule becomes a small dead-end alcove with the mirror and closets, still walkable.

### Shelves and slots (fixed capacity, not variable)

- **Exactly 20 shelves per hexagon**: 4 shelf walls × 5 shelves each (Borges: "each wall of each hexagon is furnished with five bookshelves").
- **Exactly 8 books per shelf** — a **deliberate deviation** from the text (Borges says 32 per shelf; the Spanish original and Hurley translation both confirm 32, and "35" seen in some web copies of the Irby translation is a transcription artifact). We use 8 so that a real, modest-sized catalog spreads across more galleries (more library to wander) and each spine is a larger, easier interaction target. **Fixed capacity: 160 books per hexagon** (20 shelves × 8), no variable row-packing math — this replaces the old "pack by width until the row is full" model entirely. Slot width is computed backward from the fixed count: shelf width 3.2 m / 8 = 0.40 m nominal slot pitch, with each book's rendered width (see Spine presentation) centered in its slot rather than determining slot count.
- Shelf bay per shelf wall: bay width 3.2 m, 5 rows, row height 0.55 m, first row bottom at 0.30 m, depth 0.30 m (unchanged from the original plan; only the slot-count model changed).
- Each gallery also gets 0–2 tables (seeded), placed in the ring between the central shaft and the shelf walls, away from doorway/vestibule paths; they emit colliders.

### Lighting (fixed, not a rendering-only decision — generator emits placement)

- **Exactly 2 lamps per hexagon**, positioned crosswise (opposite corners of the hexagon, not adjacent) per the text ("two of these bulbs in each hexagon, set crosswise"). The generator emits lamp prop transforms; doc 05 covers the actual light emission (always-on, deliberately dim, per Borges: "the light they give is insufficient, and unceasing").

### Spine presentation

Per book: width 30–60 mm, height 180–260 mm, depth 120–160 mm (uniform draws from the seeded RNG keyed by book id — see determinism note below). Color: catalog hint if valid, else HSL derived from `hash(id)` (hue = hash mod 360, s 0.45–0.7, l 0.35–0.6) — muted, bookish tones.

### Assignment

Input books arrive **already sorted by the frontend** (author, title, id). Assignment fills slots in a fixed traversal order: floor 0→N → gallery chain order within a floor (starting from the spawn hexagon, following the loop) → shelf-wall index 0–3 → row bottom-to-top → left-to-right (8 slots). Result: alphabetical-by-author flow through the library, deterministic given the input order — a reader who takes the stairs down a floor and keeps walking finds the alphabetical sequence continuing.

**Determinism note**: per-book values are drawn from `rng(seed, book_id)` (a fresh stream keyed by both), *not* from a shared sequential stream — so inserting a book into the catalog changes placement (unavoidable) but not every other book's spine appearance.

## Wasm API

`lib.rs` facade (all heavy data crosses as typed arrays; graph metadata, which is tiny, crosses as JSON once):

```rust
#[wasm_bindgen]
pub struct Library { layout: Layout }

#[wasm_bindgen]
impl Library {
    /// books_ids: catalog ids in display order (frontend pre-sorted).
    /// color_hints: 0xRRGGBB per book, u32::MAX = no hint. Same length as ids.
    #[wasm_bindgen(constructor)]
    pub fn new(seed: u64, book_ids: &[u32], color_hints: &[u32]) -> Library;

    /// Small JSON: galleries (now 3D-addressed), centers, doorway/staircase
    /// graph, spawn point — plus the world constants (gen/config.rs) so the
    /// frontend derives geometry from them instead of duplicating numbers.
    /// { config: { hexSide, ceilingHeight, shaftRadius, railingHeight,
    ///     booksPerHex, slotsPerShelf, shelvesPerWall, shelfWallsPerHex,
    ///     vestibuleOpening },
    ///   galleries: [{ index, q, r, floor, center: [x,y,z],
    ///     vestibuleWall: 0-5,
    ///     horizontalNeighbor: index | null,
    ///     floorAbove: index | null, floorBelow: index | null }...],
    ///   spawn: { gallery, position: [x,y,z], yaw } }
    pub fn graph_json(&self) -> String;

    pub fn gallery_count(&self) -> u32;

    // Per-gallery buffers (layouts below). Caller copies these immediately.
    pub fn book_transforms(&self, gallery: u32) -> js_sys::Float32Array; // 16/instance
    pub fn book_colors(&self, gallery: u32) -> js_sys::Float32Array;    // 3/instance
    pub fn book_ids(&self, gallery: u32) -> js_sys::Uint32Array;        // 1/instance
    pub fn shelf_transforms(&self, gallery: u32) -> js_sys::Float32Array; // bays, 16/inst
    pub fn prop_transforms(&self, gallery: u32) -> js_sys::Float32Array;  // interleaved [kind,f32x16]
    pub fn wall_segments(&self, gallery: u32) -> js_sys::Float32Array;    // for wall/arch meshes
    pub fn vestibule(&self, gallery: u32) -> js_sys::Float32Array;        // fixed-layout struct, see below
    pub fn shaft_colliders(&self, gallery: u32) -> js_sys::Float32Array;  // railing AABBs, 6/box
    pub fn colliders(&self, gallery: u32) -> js_sys::Float32Array;        // 6/AABB
}
```

### Buffer layouts (canonical)

| Buffer | Stride | Contents |
|---|---|---|
| `book_transforms` | 16 f32 | column-major 4×4 world matrix per spine, ready for `InstancedMesh.instanceMatrix` (`setMatrixAt` bypassed by writing the array directly) |
| `book_colors` | 3 f32 | linear-space RGB per instance for `InstancedMesh.instanceColor` |
| `book_ids` | 1 u32 | catalog id per instance, index-aligned with the two above — the raycast hit's `instanceId` indexes straight into this |
| `shelf_transforms` | 16 f32 | one matrix per shelf-bay GLB instance (always 4 per hexagon) |
| `prop_transforms` | 17 f32 | `[kind, m0..m15]`; kind 0 = table, 1 = lamp (always 2 lamps, crosswise) |
| `wall_segments` | 8 f32 | `[x1,z1,x2,z2,height,kind,doorCenter,doorWidth]`; kind 0 = solid (shelf wall), 1 = vestibule opening (frontend builds wall meshes with a hole) |
| `vestibule` | fixed 25 f32 (single record, not instanced) | `[hasStairUp, hasStairDown, hasHorizontalNeighbor, mirrorTransform(16), closetLeftPos(3), closetRightPos(3)]` = 3 + 16 + 3 + 3 — one per gallery; the frontend builds the vestibule room, mirror plane, closet doors, and staircase mesh (present only where `hasStairUp`/`hasStairDown` is set) from this |
| `shaft_colliders` | 6 f32 | `minX,minY,minZ,maxX,maxY,maxZ` AABBs forming the central shaft's railing ring (staircase-approximated, same technique as curved walls) |
| `colliders` | 6 f32 | `minX,minY,minZ,maxX,maxY,maxZ` static AABBs: wall pieces (vestibule opening emits two flanking boxes + lintel), shelf bays, tables |

Spine matrices already include: slot position on the shelf row, spine-out orientation toward the room, and per-book scale (w/h/d). The frontend never re-derives book geometry math. All hexagons have identical shelf-wall/prop counts (4 shelf bays, 2 lamps) since the shape is fixed by the source text, not derived per-gallery — `shelf_transforms` and `prop_transforms` lengths are therefore constant across every gallery, which the native test suite asserts directly.

### TypeScript facade

`web/src/wasm/index.ts` — the only importer of the generated pkg:

```ts
export interface GalleryBuffers {
  bookTransforms: Float32Array;  // copies (sliced out of wasm memory)
  bookColors: Float32Array;
  bookIds: Uint32Array;
  shelfTransforms: Float32Array;
  propTransforms: Float32Array;
  wallSegments: Float32Array;
  colliders: Float32Array;
}
export interface LibraryGraph { /* mirrors graph_json */ }

export async function createLibrary(seed: bigint, books: BookMeta[]): Promise<{
  graph: LibraryGraph;
  getGallery(index: number): GalleryBuffers;  // copies on every call
}>;
```

`getGallery` calls each buffer method and immediately `slice()`s the result — **wasm memory views are invalidated whenever wasm memory grows**, and slicing is the cheap insurance (a gallery's buffers total ~100–300 KB).

## Source fidelity: exact numbers from the text

| Element | Value used here | Notes |
|---|---|---|
| Shelf walls per hexagon | 4 of 6 | Matches the text. Remaining 2 walls: one vestibule, one central shaft |
| Shelves per shelf wall | 5 | Matches the text |
| Total shelves per hexagon | 20 | 4 × 5 |
| Books per shelf | **8 (deviation — Borges says 32)** | Spanish original + Hurley confirm 32 ("35" is a web-transcription artifact of some Irby copies). We deliberately use 8: real catalogs are far smaller than Babel's, so fewer books per gallery spreads the collection across more galleries (more library to wander) and makes each spine a bigger interaction target |
| Fixed capacity per hexagon | 160 books | 20 × 8 — replaces the old variable-packing model |
| Lamps per hexagon | 2, crosswise, always dim | Matches the text. Never fully dark, never bright |
| Vestibule contents | spiral staircase (up/down where present), 2 closets, 1 mirror | Matches the text. One vestibule per hexagon serves both horizontal and vertical connectivity |
| Central shaft | railinged void, open through all floors | Matches the text. Visual + collision element, no fall damage in v1 |

This table is the source of truth for "why these numbers"; if it ever needs to change, change it here and re-derive the rest of this document, not the other way around. Deviations from Borges are called out explicitly — everything not marked as a deviation follows the text.

## Sizing / performance envelope

160 books/hexagon is now a hard per-gallery ceiling, so a 3,000-book catalog spans ⌈3000/160⌉ = 19 hexagons minimum, padded up to the 7-hexagon floor-0 minimum. Per-gallery buffer sizes are now bounded and predictable: at most 160×16×4 B ≈ 10 KB of book transforms per gallery (vs. the old unbounded-per-gallery estimate). Generation is O(n log n) (sort is done JS-side; assignment is linear; graph is small — floors and hexagon counts scale with `book_count / 160`, not with book count directly). Expected wall-clock < 20 ms for a few-thousand-book catalog; budget 100 ms before it needs `console.time` attention. Wasm binary target < 200 KB post `wasm-opt` (no serde in the hot path helps; `graph_json` may use serde_json — acceptable, or hand-format).

## Native test suite (`tests/determinism.rs`)

- `same_inputs_same_layout`: two runs, seed 42, 500 fake books → assert full `Layout` equality (derive `PartialEq`).
- `all_books_placed_once`: N books → exactly N slot assignments, no duplicate ids, every id present.
- `different_seeds_differ`: seed 1 vs 2 → graphs differ.
- `catalog_hint_wins`: book with hint 0x336699 → spine color matches exactly.
- `spine_bounds`: all dims within configured min/max.
- `fixed_hexagon_shape`: every generated hexagon has exactly `config::SHELF_WALLS_PER_HEX` shelf walls, `config::SHELVES_PER_HEX` shelves, `config::LAMPS_PER_HEX` lamps, 1 vestibule — regardless of position in the graph (asserted against the constants module, not literals, so a `config.rs` change adapts the test).
- `shelf_capacity_matches_config`: every hexagon's total slot count equals `config::BOOKS_PER_HEX`; galleries needed for N books equals `N.div_ceil(config::BOOKS_PER_HEX)`.
- `fidelity_defaults`: pins the current default values (4 walls, 5 shelves/wall, 8 slots/shelf → 160/hexagon, 2 lamps) as literals — the one test that intentionally breaks when `config.rs` changes, forcing a conscious doc-table update.
- `graph_connected`: BFS (using both horizontal-neighbor and vertical-staircase edges) from spawn reaches every gallery, on every floor.
- `floors_align_vertically`: every hexagon with a floor-`+1` counterpart has an identical `(q, r)`; the vestibule's `hasStairUp`/`hasStairDown` flags match whether that counterpart actually exists in the layout.
- `doorway_clearance`: every vestibule opening ≥ 0.9 m between flanking collider AABBs.
- `min_galleries`: 10-book catalog still yields ≥ 7 galleries on floor 0 before any floor 1 hexagon is created.
- `floor_fills_before_next_floor_starts`: no floor-N+1 hexagon exists unless floor N has reached its target size.

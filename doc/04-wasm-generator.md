# 04 — `babel-gen`: the wasm layout generator

The generator is a Rust crate that turns `(seed, ordered book list)` into a complete library layout. It is the canonical owner of the world's geometry *data* (where every wall, shelf, slot, and collider is); the frontend owns geometry *meshes*. This doc defines the world model, the algorithm, the wasm API, and the exact buffer layouts.

## Crate structure

```text
crates/babel-gen/
├── Cargo.toml            # crate-type = ["cdylib", "rlib"]
├── src/
│   ├── lib.rs            # wasm-bindgen facade (thin; no logic)
│   ├── gen/
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

## World model

### Gallery graph

- Galleries are hexagons (side 4.0 m, flat-to-flat ≈ 6.93 m, ceiling 3.2 m) on an axial-coordinate hex grid `(q, r)`.
- Count: `gallery_count = ceil(book_count / slots_per_gallery)` galleries, laid out as a contiguous "blob": start at origin, repeatedly add the unoccupied neighbor cell (chosen by seeded RNG among the frontier) — guarantees a connected graph.
- Each pair of adjacent occupied cells gets a doorway with probability 1 if it's the spanning-tree edge that connected them (guaranteeing full connectivity), plus extra doorways on remaining shared walls with p = 0.4 (loops make it feel like a library, not a maze).
- Wall roles per hexagon edge: `Doorway` (1.2 m opening centered in the wall, with frame) or `ShelfWall` (one shelf bay). The spawn gallery's center is the player start, facing the +q doorway.

### Shelves and slots

- One shelf bay per shelf wall: bay width 3.2 m (fits inside the 4.0 m wall), 5 rows, row height 0.55 m, first row bottom at 0.30 m; depth 0.30 m.
- Slot capacity per row: variable — books have random widths, packed left-to-right until the row is full (see assignment). Nominal capacity ≈ 3.2 m / 0.045 m ≈ 70 spines/row, ~350/bay; with up to 5 shelf walls per gallery, `slots_per_gallery` ≈ 1,200–1,700. For a few-thousand-book catalog this yields a handful of galleries; a **minimum of 7 galleries** (center + ring) is enforced so small catalogs still feel like a library, with surplus slots left empty (empty slots render nothing).
- Each gallery also gets 0–2 tables and 1–2 lamp props (seeded), placed in the center area, away from doorway paths; they emit colliders.

### Spine presentation

Per book: width 30–60 mm, height 180–260 mm, depth 120–160 mm (uniform draws from the seeded RNG keyed by book id — see determinism note below). Color: catalog hint if valid, else HSL derived from `hash(id)` (hue = hash mod 360, s 0.45–0.7, l 0.35–0.6) — muted, bookish tones.

### Assignment

Input books arrive **already sorted by the frontend** (author, title, id). Assignment fills slots in a fixed traversal order: gallery blob order → wall index 0–5 → row bottom-to-top → left-to-right. Result: alphabetical-by-author flow through the library, deterministic given the input order.

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

    /// Small JSON: galleries, centers, doorway graph, spawn point.
    /// { galleries: [{ index, center: [x,z], doorways: [{wall, toGallery}] }...],
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
    pub fn colliders(&self, gallery: u32) -> js_sys::Float32Array;        // 6/AABB
}
```

### Buffer layouts (canonical)

| Buffer | Stride | Contents |
|---|---|---|
| `book_transforms` | 16 f32 | column-major 4×4 world matrix per spine, ready for `InstancedMesh.instanceMatrix` (`setMatrixAt` bypassed by writing the array directly) |
| `book_colors` | 3 f32 | linear-space RGB per instance for `InstancedMesh.instanceColor` |
| `book_ids` | 1 u32 | catalog id per instance, index-aligned with the two above — the raycast hit's `instanceId` indexes straight into this |
| `shelf_transforms` | 16 f32 | one matrix per shelf-bay GLB instance |
| `prop_transforms` | 17 f32 | `[kind, m0..m15]`; kind 0 = table, 1 = lamp |
| `wall_segments` | 8 f32 | `[x1,z1,x2,z2,height,kind,doorCenter,doorWidth]`; kind 0 = solid, 1 = doorway (frontend builds wall meshes with a hole) |
| `colliders` | 6 f32 | `minX,minY,minZ,maxX,maxY,maxZ` static AABBs: wall pieces (doorways emit two flanking boxes + lintel), shelf bays, tables |

Spine matrices already include: slot position on the shelf row, spine-out orientation toward the room, and per-book scale (w/h/d). The frontend never re-derives book geometry math.

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

## Sizing / performance envelope

3,000 books ≈ 3,000×16×4 B ≈ 200 KB of transforms — trivial. Generation is O(n log n) (sort is done JS-side; assignment is linear; graph is tiny). Expected wall-clock < 20 ms for 3k books; budget 100 ms before it needs `console.time` attention. Wasm binary target < 200 KB post `wasm-opt` (no serde in the hot path helps; `graph_json` may use serde_json — acceptable, or hand-format).

## Native test suite (`tests/determinism.rs`)

- `same_inputs_same_layout`: two runs, seed 42, 500 fake books → assert full `Layout` equality (derive `PartialEq`).
- `all_books_placed_once`: N books → exactly N slot assignments, no duplicate ids, every id present.
- `different_seeds_differ`: seed 1 vs 2 → graphs differ.
- `catalog_hint_wins`: book with hint 0x336699 → spine color matches exactly.
- `spine_bounds`: all dims within configured min/max.
- `graph_connected`: BFS from spawn reaches every gallery.
- `doorway_clearance`: every doorway opening ≥ 0.9 m between flanking collider AABBs.
- `min_galleries`: 10-book catalog still yields ≥ 7 galleries.

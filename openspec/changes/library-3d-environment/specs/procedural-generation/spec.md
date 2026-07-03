# procedural-generation

> Implementation details: [doc/04-wasm-generator.md](../../../../../doc/04-wasm-generator.md) (world model, algorithm, wasm API, canonical buffer layouts) and [doc/01-overview.md](../../../../../doc/01-overview.md) (canonical constants).

## ADDED Requirements

### Requirement: Deterministic library layout from catalog and seed
The Rust/wasm module SHALL generate the library structure (hexagonal galleries addressed by `(q, r, floor)`, walls, vestibules, shelves, and shelf slots) as pure data, deterministically derived from a 64-bit seed and the ordered catalog. The layout MUST provide at least one slot per catalog book, MUST form a fully connected gallery graph across all floors (via horizontal vestibule connections and vertical staircase connections), and the same (seed, catalog) input MUST always produce an identical library.

#### Scenario: Same inputs produce same library
- **WHEN** the generator is invoked twice with seed `42` and the same ordered catalog
- **THEN** both invocations return identical layout data (same gallery graph across all floors, shelf positions, and slot assignments)

#### Scenario: Library sized to catalog
- **WHEN** the catalog contains N books
- **THEN** the generated layout contains at least N shelf slots and every book is assigned to exactly one slot

#### Scenario: Small catalogs still feel like a library
- **WHEN** the catalog contains only 10 books
- **THEN** floor 0 alone still contains at least 7 connected galleries, with surplus slots left empty, before any floor 1 gallery is generated

#### Scenario: Additional floors start only after a floor fills
- **WHEN** the catalog is large enough to exceed floor 0's target size
- **THEN** floor 1 galleries exist only at `(q, r)` positions that have an occupied floor-0 counterpart, and no floor 1 gallery exists while floor 0 has remaining unfilled positions within its target size

#### Scenario: Every gallery is reachable
- **WHEN** any layout is generated
- **THEN** every gallery is reachable from the spawn gallery through vestibule connections (horizontal) and staircases (vertical)

### Requirement: Fixed hexagon shape from compile-time constants
Every generated gallery SHALL have an identical shape derived from "The Library of Babel", defined entirely by compile-time constants in a single configuration module (`crates/babel-gen/src/gen/config.rs`) with these defaults: exactly 4 of its 6 walls are shelf walls (5 shelves each, 20 shelves total; 8 book slots per shelf — 160 book slots per gallery, a deliberate reduction from Borges' 32/shelf documented in doc 04's source-fidelity table), exactly 1 wall leads to a vestibule, and exactly 1 wall faces the gallery's central shaft. The shape MUST NOT vary at runtime — not by gallery position, catalog size, or seed — and all derived values (capacity, gallery count, slot pitch, buffer sizes) MUST be computed from the constants so that changing a constant and recompiling adapts the whole system with no other code edits.

#### Scenario: Uniform shape regardless of position
- **WHEN** any two galleries are generated, anywhere in the layout
- **THEN** both have exactly the configured number of shelf walls, shelves, book slots, lamps (defaults: 4, 20, 160, 2), 1 vestibule wall, and 1 shaft wall

#### Scenario: Capacity is fixed, not derived
- **WHEN** the generator computes how many galleries are needed for a catalog of N books
- **THEN** it computes `ceil(N / booksPerHex)` galleries (default `booksPerHex` = 160, padded up to the floor-0 minimum), never a variable per-gallery capacity

#### Scenario: Changing a constant adapts the system
- **WHEN** a world constant (e.g., slots per shelf) is changed in the configuration module and the crate is recompiled
- **THEN** generation, capacity math, buffer sizes, and the relationship-based tests all reflect the new value with no other source edits (only the single defaults-pinning test and the doc tables need a conscious update)

#### Scenario: Frontend reads constants from the generator
- **WHEN** the frontend needs a world-geometry value (hex side, ceiling height, shaft radius, capacity)
- **THEN** it reads it from the generator's graph metadata `config` block rather than from a duplicated JavaScript constant

### Requirement: Vestibule and staircase connectivity
Each gallery's vestibule SHALL contain: a mirror, two closets, and — where a horizontal neighbor or vertical (floor above/below) counterpart exists in the layout — the connecting doorway and/or spiral staircase. A gallery's vertical neighbors, if present, MUST be at the identical `(q, r)` on the adjacent floor.

#### Scenario: Vestibule always present
- **WHEN** any gallery is generated
- **THEN** its vestibule buffer indicates a mirror and two closets are present, regardless of whether any neighbor exists

#### Scenario: Staircase reflects real floor neighbors
- **WHEN** a gallery at `(q, r, floor)` has a generated counterpart at `(q, r, floor+1)`
- **THEN** its vestibule's "stair up" flag is set, and the reverse gallery's "stair down" flag is set

#### Scenario: Dead-end vestibule
- **WHEN** a gallery has no horizontal neighbor and no vertical neighbor on either side
- **THEN** its vestibule still contains the mirror and closets, with no doorway or staircase rendered

### Requirement: Seed selection
The application SHALL use a canonical default seed (`0xBABE1`) so all visitors see the same library, and SHALL accept a `?seed=<u64>` URL parameter overriding it for that session.

#### Scenario: Default seed
- **WHEN** the app loads with no seed parameter
- **THEN** the layout is generated with the canonical default seed

#### Scenario: Seed override
- **WHEN** the app loads with `?seed=123`
- **THEN** the layout is generated with seed 123 and differs from the default library

### Requirement: Book-to-slot assignment
The generator SHALL deterministically assign each catalog book (by id) to a shelf slot, filling slots in a fixed traversal order from the input list (which the frontend pre-sorts by author, then title, then id — so shelves read alphabetically by author): floor ascending, then gallery blob order within a floor, then shelf-wall index 0–3, then row bottom-to-top, then slot 0–7 left-to-right. Within a floor, galleries are visited in chain order starting from the spawn hexagon. The generator SHALL produce per-book presentation data: spine dimensions within realistic bounds and a spine color (from the catalog hint when present, otherwise derived deterministically from the book id). Per-book values are keyed by (seed, book id) so adding a book does not change other books' appearance.

#### Scenario: Every book is placed and renderable
- **WHEN** the layout is generated for a catalog
- **THEN** every book id appears in exactly one slot with spine width/height/depth within the configured bounds and an RGB spine color

#### Scenario: Catalog hint wins
- **WHEN** a book row includes a spine color hint
- **THEN** the generated presentation data uses that color instead of a derived one

#### Scenario: Alphabetical shelf flow
- **WHEN** the frontend passes the catalog sorted by (author, title, id)
- **THEN** walking the slot traversal order encounters books in that same order

### Requirement: JavaScript-consumable API
The wasm module SHALL expose its API through wasm-bindgen with TypeScript type definitions, and SHALL return bulk geometry-driving data in flat typed arrays following the canonical buffer layouts in [doc/04-wasm-generator.md](../../../../../doc/04-wasm-generator.md): per-instance transforms and colors for books/shelves/props, wall segments, vestibule/staircase data, shaft-railing colliders, and general collision AABBs, plus an index mapping instance index → book id so raycast hits resolve back to catalog entries. The graph metadata returned to JavaScript SHALL include each gallery's `(q, r, floor)` address and its horizontal and vertical neighbor references.

#### Scenario: Frontend consumes typed arrays
- **WHEN** the frontend requests instance data for a gallery
- **THEN** it receives flat typed arrays directly usable to fill Three.js `InstancedMesh` buffers, plus an instance→book-id index aligned with them

#### Scenario: Types available at compile time
- **WHEN** the TypeScript app imports the generated wasm package
- **THEN** all exported functions and data shapes are typed and the app compiles with `tsc --noEmit` without `any` casts around the wasm boundary

# procedural-generation

> Implementation details: [doc/04-wasm-generator.md](../../../../../doc/04-wasm-generator.md) (world model, algorithm, wasm API, canonical buffer layouts) and [doc/01-overview.md](../../../../../doc/01-overview.md) (canonical constants).

## ADDED Requirements

### Requirement: Deterministic library layout from catalog and seed
The Rust/wasm module SHALL generate the library structure (hexagonal galleries, walls, doorways, shelves, and shelf slots) as pure data, deterministically derived from a 64-bit seed and the ordered catalog. The layout MUST provide at least one slot per catalog book, MUST form a fully connected gallery graph, and the same (seed, catalog) input MUST always produce an identical library.

#### Scenario: Same inputs produce same library
- **WHEN** the generator is invoked twice with seed `42` and the same ordered catalog
- **THEN** both invocations return identical layout data (same gallery graph, shelf positions, and slot assignments)

#### Scenario: Library sized to catalog
- **WHEN** the catalog contains N books
- **THEN** the generated layout contains at least N shelf slots and every book is assigned to exactly one slot

#### Scenario: Small catalogs still feel like a library
- **WHEN** the catalog contains only 10 books
- **THEN** the layout still contains at least 7 connected galleries, with surplus slots left empty

#### Scenario: Every gallery is reachable
- **WHEN** any layout is generated
- **THEN** every gallery is reachable from the spawn gallery through doorways

### Requirement: Seed selection
The application SHALL use a canonical default seed (`0xBABE1`) so all visitors see the same library, and SHALL accept a `?seed=<u64>` URL parameter overriding it for that session.

#### Scenario: Default seed
- **WHEN** the app loads with no seed parameter
- **THEN** the layout is generated with the canonical default seed

#### Scenario: Seed override
- **WHEN** the app loads with `?seed=123`
- **THEN** the layout is generated with seed 123 and differs from the default library

### Requirement: Book-to-slot assignment
The generator SHALL deterministically assign each catalog book (by id) to a shelf slot, filling slots in a fixed traversal order from the input list (which the frontend pre-sorts by author, then title, then id — so shelves read alphabetically by author), and SHALL produce per-book presentation data: spine dimensions within realistic bounds and a spine color (from the catalog hint when present, otherwise derived deterministically from the book id). Per-book values are keyed by (seed, book id) so adding a book does not change other books' appearance.

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
The wasm module SHALL expose its API through wasm-bindgen with TypeScript type definitions, and SHALL return bulk geometry-driving data in flat typed arrays following the canonical buffer layouts in [doc/04-wasm-generator.md](../../../../../doc/04-wasm-generator.md): per-instance transforms and colors for books/shelves/props, wall segments, collision AABBs, plus an index mapping instance index → book id so raycast hits resolve back to catalog entries.

#### Scenario: Frontend consumes typed arrays
- **WHEN** the frontend requests instance data for a gallery
- **THEN** it receives flat typed arrays directly usable to fill Three.js `InstancedMesh` buffers, plus an instance→book-id index aligned with them

#### Scenario: Types available at compile time
- **WHEN** the TypeScript app imports the generated wasm package
- **THEN** all exported functions and data shapes are typed and the app compiles with `tsc --noEmit` without `any` casts around the wasm boundary

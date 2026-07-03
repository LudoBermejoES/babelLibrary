# Design: library-3d-environment

## Context

Greenfield project (this repo contains only OpenSpec scaffolding). Goal: a library — an interconnected set of galleries full of books — walkable in first-person from a browser. The books are real: a SQLite catalog holds each book's title, author, synopsis, and the URL of its EPUB; clicking a book in the 3D scene opens that EPUB in an in-browser reader. Built with Rust and Three.js.

Research (July 2026) verified the current ecosystem: three.js r185 (`three@0.185.1`), Vite 8, wasm-bindgen 0.2.126, wasm-pack 0.15.0, vite-plugin-wasm 3.6.0, Rapier (`@dimforge/rapier3d-compat` 0.19.3 / `rapier3d` crate 0.33.0), gltf-transform 4.4.1, meshoptimizer 1.2.0.

## Goals / Non-Goals

**Goals:**
- Walkable first-person 3D library at 60 FPS target / 30 FPS floor on a mid-range laptop.
- Books driven by a SQLite catalog (title, author, synopsis, EPUB URL); shelves populated from it, EPUBs readable in an overlay.
- Rust in two roles it is genuinely good at: an Axum server owning the catalog and asset serving, and a wasm module doing deterministic library layout generation in the client.
- One-command build; containerized deployment to any host.
- Simple, debuggable interop: coarse calls, flat typed-array buffers across the JS↔wasm boundary.

**Non-Goals:**
- Multiplayer, accounts, catalog editing UI, or reading-progress persistence (v1 is read-only).
- Truly infinite world (Borges' "unlimited but periodic" resolution) or a bottomless shaft with real fall consequences — the library is sized to the catalog (`ceil(book_count / BOOKS_PER_HEX)` hexagons across as many floors as needed), and the central shaft's implied infinite depth is a visual/atmospheric detail (D11), not a simulated one.
- Full rigid-body physics (only player collision).
- WebGPU/TSL renderer, wasm threads/SharedArrayBuffer, mobile/touch controls — deferred.

## Decisions

### D1 — Architecture: three tiers, each in its natural language
- **Rust server (Axum)**: reads the SQLite catalog (`rusqlite`, read-only in v1), exposes `GET /api/books` and `GET /api/books/{id}`, serves locally hosted EPUBs (`application/epub+zip`, range requests) and, in production, the built frontend (`tower-http` `ServeDir` sets `application/wasm` correctly).
- **Rust wasm module** (wasm-bindgen/wasm-pack): given the ordered catalog (ids + presentation hints) and a seed, generates the library layout and book-to-slot assignment client-side.
- **Three.js frontend** (TypeScript + Vite): render loop, scene graph, controls, raycasting, and the EPUB reader UI.

*Why a server at all (vs the earlier static-only plan)?* The catalog is a SQLite file and EPUBs need hosting with correct content types; a small Axum server is the simplest Rust-native answer and gives one origin for everything. *Why not query SQLite in the browser (sql.js / sql.js-httpvfs over static hosting)?* Adds a second sqlite-wasm payload (~1 MB+), read-only hacks over HTTP range requests, and no clean home for locally hosted EPUBs — a server is simpler and was already the designated fallback. *Why not a pure-Rust engine (Bevy 0.19 wasm)?* Web target still second-class: 10–30 MB binaries, no GLTFLoader/meshopt/KTX2-class asset ecosystem, slow iteration vs Vite HMR. rend3 unmaintained.

### D2 — Data flow: catalog → layout → instances
On load: frontend fetches `/api/books` (stable id order) → passes ids + hints and a seed to the wasm generator → generator returns gallery graph, per-gallery instance buffers (flat `Float32Array` transforms + colors), collision AABBs, and an instance-index→book-id map → frontend builds `InstancedMesh`es per gallery. Raycast hit → instance index → book id → metadata already in memory; EPUB fetched only when the book is opened.

Interop rule: the JS↔wasm call itself is ~ns-cheap but data copies run ~1–2 GB/s, so the API is coarse ("give me gallery N's buffers"), nothing crosses the boundary per frame, and buffers are copied out at load time — `Float32Array` views over wasm memory are invalidated when wasm memory grows, so no long-lived views.

The layout is deterministic per (seed, ordered catalog): same catalog and seed ⇒ every visitor sees each book in the same place. Catalog for a v1 is expected in the hundreds-to-thousands of books; the generator sizes the gallery count to fit.

### D3 — Rendering: WebGLRenderer + InstancedMesh, few real-time lights
- `WebGLRenderer` (not `WebGPURenderer`) — lowest risk, fully sufficient indoors; WebGPU is a later swap.
- Books: a handful of book geometry archetypes × `InstancedMesh` with per-instance transform + color (spec target: <100 draw calls with 2,000+ books in view). `BatchedMesh` avoided in v1 — known CPU-side sharp edges (three.js #28776).
- Shelves/walls: repeated GLTF shelf-bay + architecture modules, also instanced. Every hexagon has the identical fixed shape (D11: 4 shelf walls, 1 vestibule, 1 shaft) — no per-gallery variance in these counts, which simplifies instancing bookkeeping.
- Book spines show color + dimensions only in v1; legible spine-title textures (canvas-generated, one texture atlas per shelf) are a stretch goal — titles are always available via the crosshair HUD.
- Lighting: exactly 2 dim point lights per gallery (Borges: "insufficient, and unceasing") + warm ambient floor, `ACESFilmicToneMapping`; baked lightmaps deferred.
- Culling: current gallery + its horizontal neighbor + shaft-visible floor above/below live in the scene graph; rooms swap on vestibule/staircase crossing (satisfies the seamless-transition spec).
- Pin `three` and `@types/three` to the same r-version (monthly minors move addons with core).

### D4 — EPUB reader: foliate-js overlay (revised during implementation)
`epubjs` (npm `epubjs@0.3.93`) was the original plan but was rejected during M0 scaffolding: it's unmaintained and pulls a vulnerable, unmaintained `@xmldom/xmldom@0.7.13` (multiple open high-severity CVEs, no fix in that branch). The npm "upgrade" path (`0.4.2`) is actually an older 2018 release with worse dependencies; the maintained rewrite (`0.5.0-alpha.3`) has been stalled since 2023.

Instead: **foliate-js** (github.com/johnfactotum/foliate-js, MIT), vendored as source into `web/src/reader/vendor/` at a pinned commit. It has zero runtime npm dependencies (it vendors its own zip/inflate handling), is actively maintained, and is purpose-built for paginated EPUB rendering with TOC/CFI/search support — the `<foliate-view>` custom element replaces the `epubjs` `Rendition` API. `npm audit` is clean (0 vulnerabilities) with this substitution. Trade-off accepted: not an npm package, so upgrades mean re-vendoring and diffing against upstream (documented in `web/src/reader/vendor/VENDORED.md`); the upstream API has no stability guarantee, which is fine for a single pinned-commit integration.

DOM overlay above the canvas: paginated flow, TOC from the EPUB spine, arrow-key + button paging. Loading state while fetching; error state (book title + close) on failure so a bad EPUB never kills the 3D session. Pointer lock is released on open and re-requested on close, restoring the exact player pose. External EPUB URLs load directly (subject to the remote host's CORS); locally hosted ones come from our server, same origin.

### D5 — Collision & movement: capsule-vs-AABB, no physics engine
The wasm generator emits static collision AABBs (walls, shelves, tables, shaft railing) per gallery; the TypeScript controller integrates WASD velocity (delta-time based, eye height 1.7 m, ~3 m/s) and resolves capsule-vs-AABB with slide response. *Why not Rapier?* ~1–2 MB extra wasm for axis-aligned box sliding. If interactions grow, adopt prebuilt `@dimforge/rapier3d-compat` (SIMD builds, three.js sync helpers) rather than compiling the `rapier3d` crate into our module. Collision *solving* stays in TypeScript (trivial math, zero per-frame boundary traffic); Rust supplies the data.

The one exception is the spiral staircase (D11): a self-contained 1D helical ramp within the vestibule, not a general 3D navmesh — the flat 2D circle-vs-AABB model still covers everywhere else in the library. See doc 06 for the parametric ramp model.

### D6 — Toolchain & repo layout
```
babelLibrary/
├── crates/babel-gen/        # Rust: layout generation (wasm-bindgen)
├── server/                  # Rust: Axum catalog/API/static server
├── web/                     # Vite + TypeScript + three + foliate-js (vendored)
│   ├── src/                 # scene/, controls/, interact/, reader/, wasm/, api/
│   └── public/assets/       # .glb models
├── data/                    # books.sqlite (seeded), epubs/
├── scripts/                 # seed + build orchestration
└── openspec/
```
- Cargo workspace over `crates/babel-gen` + `server`; shared types (book presentation hints) in a small common crate if needed.
- `wasm-pack build --target web` → consumed by Vite via `vite-plugin-wasm` (+ `build.target: 'esnext'`, so no top-level-await plugin). Escape hatch if wasm-pack misbehaves (yearly release cadence; pin 0.15.0): `cargo build --target wasm32-unknown-unknown` + `wasm-bindgen-cli`. Trunk not used (it targets all-Rust frontends).
- Dev: `cargo run -p server` (API + epubs) + `npm run dev` (Vite, proxying `/api` and `/epubs`); `npm run wasm` rebuilds the generator. Build: one script → wasm, `vite build`, `cargo build --release -p server`.
- Determinism unit tests run natively via `cargo test` (generation logic target-independent; the wasm-bindgen layer is a thin shim). Server gets endpoint tests against a fixture database.

### D7 — Catalog schema and seeding
SQLite table `books(id INTEGER PRIMARY KEY, title TEXT NOT NULL, author TEXT NOT NULL, synopsis TEXT, epub_url TEXT NOT NULL, spine_color TEXT NULL, page_count INTEGER NULL, created_at TEXT)` — schema created by an idempotent migration on server start. Seed script loads a sample set of public-domain EPUBs (Project Gutenberg) into `data/` so a fresh checkout runs end-to-end. DB opened read-only by the server in v1; catalog edits happen with any SQLite tool.

### D8 — Assets: CC0 GLB + gltf-transform/meshopt pipeline
Poly Haven / Kenney / Quaternius (CC0) for shelf bay, table, lamp, and ~5 book archetypes; keep the modeled set tiny — variety comes from instancing. Pipeline: `gltf-transform optimize --compress meshopt` (meshopt ≈ Draco after brotli, far faster decode, tiny decoder). KTX2 textures deferred. Record source + license per asset in `web/public/assets/CREDITS.md`.

### D9 — Deployment: single container
Multi-stage Dockerfile: (1) Rust stage builds wasm + server, (2) Node stage builds the frontend, (3) minimal runtime (distroless/debian-slim) with the server binary, `dist/`, and `data/` mount points. Configurable via env/flags: port, DB path, EPUB dir. Runs on any container host (Fly.io, a VPS, etc.). Single-threaded wasm keeps us free of COOP/COEP headers.

### D11 — Borges fidelity: fixed hexagon shape, verticality, vestibules (added mid-implementation, before M2)

Before writing the generator's actual algorithm (M2), we researched Jorge Luis Borges' "The Library of Babel" (1941) directly rather than continuing from the flattened, numerically-invented hex-grid sketched in early planning. The source text is specific and quotable, and matching it is free correctness for a project literally named after it. Verified against the Spanish original and the Hurley translation (a "35 books per shelf" figure circulating in some web transcriptions of the Irby translation is an artifact, not textually supported — the correct figure is 32).

Changes from the original (pre-research) world model:

- **Fixed hexagon shape, not derived per-gallery**: every hexagon has exactly 4 shelf walls (20 shelves total) and 2 open walls (one vestibule, one central shaft) — previously "up to 5 shelf walls" with room count driving variable shelf-wall counts.
- **Fixed capacity, not variable packing**: 20 shelves × 8 books = 160 books per hexagon, always. Previously slot count was computed from variable book-width packing (~1,200–1,700 slots/gallery) — that math is deleted, not adjusted. (Borges' own figure is 32 books/shelf = 640/hexagon; we deliberately use 8/shelf so real, modest catalogs spread across more galleries and each spine is a larger interaction target — the one explicitly-marked numeric deviation from the text, see doc 04's source-fidelity table.)
- **All world numbers are compile-time constants in one module** (`crates/babel-gen/src/gen/config.rs`): shelf walls, shelves, slots per shelf, hex side, ceiling height, shaft radius, lamp count, floor sizes — everything derives from them (capacity, gallery count, slot pitch, buffer sizes, tests), and the frontend reads them via a `config` block in the generator's graph JSON rather than duplicating any. Changing a constant + recompiling adapts the entire system; only one deliberately literal-pinning test (`fidelity_defaults`) and the doc tables need a conscious follow-up edit. "Fixed shape" means fixed *at runtime* (never varies by position/seed/catalog), not unchangeable at build time.
- **Verticality**: galleries are now addressed `(q, r, floor)`. Floor 0 is a single winding **chain** of hexagons grown via seeded random walk to a target length (7–19 hexagons), with the last hexagon looping back to the first — not a 2D blob, because each hexagon's single vestibule wall can only support one horizontal neighbor, so a general blob (which needs degree-2+ cells) is geometrically impossible under that constraint. The loop is the concrete implementation of Borges' own resolution to the library's apparent infinity: **"unlimited but periodic"** — walk far enough and you return to where you started. Floor 1 starts directly above the same footprint (same chain order), and so on, until enough capacity exists for the catalog (`ceil(book_count / BOOKS_PER_HEX)` hexagons). A hexagon's vestibule staircase connects it to its floor+1/floor-1 counterpart at the same `(q, r)`.
- **Vestibule** (new world object): the single non-shelf, non-shaft wall leads to a small anteroom containing a mirror, two closets, and the spiral staircase (serving both horizontal and vertical connectivity — one vestibule does both jobs, per the text).
- **Central shaft** (new world object): a railinged circular void at each hexagon's center, open through the floor/ceiling, giving a real "see the floors above and below" visual (and a bottomless-drop implication per the text, no fall damage in v1).
- **Fixed lighting**: exactly 2 lamps per hexagon, crosswise, deliberately dim and always on ("insufficient, and unceasing") — previously an unconstrained "a few point lights."
- **Vertical movement model**: the spiral staircase is a self-contained parametric helix (fixed radius, rise-per-turn = ceiling height), not a general 3D navmesh — WASD movement reprojects onto the helix tangent while within its footprint. Everywhere else in the library remains flat 2D collision.

Why this is worth the added scope, decided explicitly rather than defaulted into: a generic hex-maze-with-bookshelves has no particular claim to the name "babelLibrary"; the vestibule/shaft/staircase/fixed-capacity details are exactly what make the source recognizable, and they compose cleanly with the existing architecture (the vertical dimension is additional graph structure and one new movement mode, not a rewrite of the rendering or collision approach). Rejected alternative: ship v1 single-floor with corrected numbers only, defer verticality to a post-v1 milestone — rejected because the vestibule and shaft are cheap to build now (M2/M3 haven't started rendering yet) and retrofitting verticality after the flat-world assumption is baked into the collision/streaming code (doc 05/06) would cost more than building it right the first time.

### D10 — Methodology: TDD everywhere
All implementation is test-first (red → green → refactor), per the `development-workflow` spec. Practical shape per layer: generator logic is target-independent Rust precisely so its tests run natively before any wasm/browser plumbing exists; server endpoints are written against `oneshot` integration tests on fixture DBs; frontend logic that can be pure (collision, dwell, parsing) is kept pure so vitest covers it without a browser; user-visible flows get Playwright tests derived from the spec scenarios. Where a test genuinely can't lead (exploratory shader/lighting tweaks, asset sourcing), the acceptance test is written immediately after the exploration settles and before the task is checked off. Test types, tooling, and the spec-scenario → test mapping: [doc/09-testing.md](../../../doc/09-testing.md).

## Risks / Trade-offs

- [Chatty interop creeps in as features grow] → rule: no wasm calls inside the render loop; bulk data only as typed arrays, copied out at load; wasm façade confined to `web/src/wasm/`.
- [Frame-rate collapse with thousands of books] → instancing from day one; gallery-level scene swapping; profile with 2k+ books before feature work (spec: <100 draw calls, ≥30 FPS).
- [Custom collision feels janky (snags on vestibule openings)] → slide response + capsule margin; spec covers 0.9 m openings; fallback is Rapier's kinematic character controller via `@dimforge/rapier3d-compat`.
- [Staircase movement (D11) feels wrong — snapping, wrong turn direction, jarring transition on/off the helix] → it's a small, fully-specified parametric shape (fixed radius + rise-per-turn); test it in isolation before wiring it into full navigation; fallback is a plain ramp (no visual spiral, same helix radius collapsed to a straight incline) if the helix math proves fiddly under playtesting.
- [Fixed 160-book-per-hexagon capacity (D11) leaves shelves sparse — 8 books per 3.2 m shelf is a 0.40 m slot pitch, far wider than a real book spine] → deliberate: books read as individually distinct, clickable objects rather than a dense texture; the `min_galleries` floor-0 minimum (7 hexagons) covers the "small catalog still feels like a library" concern, and if sparseness looks wrong in practice the lever is shortening the shelf bay or centering books in groups, not changing capacity.
- [External EPUB URLs blocked by CORS] → the reader fetches the EPUB with `fetch`; remote hosts must send CORS headers. Mitigation: prefer locally hosted EPUBs; document the constraint; optional server-side proxy endpoint as a follow-up.
- [Huge catalogs (10k+ books) blow up layout size or load time] → v1 targets ≤ a few thousand; guard with a server-side cap and log; per-gallery lazy generation is the follow-up if needed.
- [Toolchain skew (three monthly minors, wasm-pack yearly releases)] → pin exact versions of `three`/`@types/three` and wasm tooling; document in README.
- [Asset licensing] → CC0-only model sources; public-domain EPUBs for seed data; CREDITS.md per asset.
- [`emit.rs`'s `vestibule_wall_index`/`shaft_wall_index` are hardcoded to wall 0/3 for every gallery, rather than derived from which of the 6 hex directions a `horizontal_neighbor` edge actually uses] → harmless today: orientation has no gameplay or fidelity consequence since the shape is always the same. But it's a bandaid, not a real fix — `GalleryShell`/`Gallery` don't retain the edge direction, so `emit.rs` has no data to derive a geometrically correct (opposite-facing) vestibule wall between two real neighbors if that ever becomes necessary (e.g. rendering hallway connectors between hexagons, or minimap edges that must point the right way). Follow-up if needed: add a direction field to `GalleryShell`/`Gallery` and thread it through `furnish.rs`/`emit.rs`.

## Migration Plan

Greenfield — no migration. Order: local dev → seeded sample catalog → production Docker image verified locally → deploy to container host. Rollback = redeploy previous image; the SQLite file is external state and versioned/backed up separately.

## Resolved Questions

Decided during detailed planning (see `doc/`):

- **Seed exposure**: canonical default `0xBABE1` with `?seed=<u64>` URL override (doc 01/04; now a spec requirement in `procedural-generation`).
- **Shelf organization**: frontend pre-sorts the catalog by (author, title, id); the generator fills slots in a fixed traversal order, so shelves read alphabetically by author (doc 04; spec scenario added).
- **Spine-title textures**: HUD-first in v1; canvas texture atlases are deferred polish (doc 05, doc 10 deferred list).

## Plan documents

The detailed implementation plan lives in [doc/](../../../doc/README.md). Mapping from decisions to docs:

| Decision | Detailed in |
|---|---|
| D1 architecture, interop rules | [doc/02-architecture.md](../../../doc/02-architecture.md) |
| D2 data flow | [doc/02-architecture.md](../../../doc/02-architecture.md) + [doc/04-wasm-generator.md](../../../doc/04-wasm-generator.md) (world model, buffer layouts) |
| D3 rendering | [doc/05-rendering.md](../../../doc/05-rendering.md) |
| D4 EPUB reader | [doc/07-interaction-reader.md](../../../doc/07-interaction-reader.md) |
| D5 collision/movement | [doc/06-navigation-collision.md](../../../doc/06-navigation-collision.md) |
| D6 toolchain/layout | [doc/02-architecture.md](../../../doc/02-architecture.md) + [doc/08-build-deployment.md](../../../doc/08-build-deployment.md) |
| D7 catalog schema/API | [doc/03-data-and-api.md](../../../doc/03-data-and-api.md) (canonical contracts) |
| D8 assets | [doc/05-rendering.md](../../../doc/05-rendering.md) |
| D9 deployment | [doc/08-build-deployment.md](../../../doc/08-build-deployment.md) |
| Testing strategy | [doc/09-testing.md](../../../doc/09-testing.md) (spec scenario → test mapping) |
| D10 TDD methodology | [doc/09-testing.md](../../../doc/09-testing.md) §0 (red→green→refactor workflow, rules of engagement) |
| D11 Borges fidelity (verticality, vestibules, fixed shape) | [doc/04-wasm-generator.md](../../../doc/04-wasm-generator.md) (world model, source-fidelity table), [doc/05-rendering.md](../../../doc/05-rendering.md) (vestibule/shaft rendering), [doc/06-navigation-collision.md](../../../doc/06-navigation-collision.md) (staircase movement model) |
| Milestones/sequencing | [doc/10-roadmap.md](../../../doc/10-roadmap.md) |

Shared constants (eye height, speeds, ranges, budgets, seed) are canonical in [doc/01-overview.md](../../../doc/01-overview.md); API/JSON shapes in doc 03; wasm buffer layouts in doc 04. If a contract changes, update those docs first, then dependent code.

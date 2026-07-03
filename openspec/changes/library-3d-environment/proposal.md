# Proposal: library-3d-environment

## Why

We want a browsable 3D library: a virtual library the user can walk through in a first-person view, directly in the browser with no install. The books on the shelves are *real* books from a SQLite catalog (title, author, synopsis, and the URL of an EPUB file); clicking a book opens it and displays the EPUB for reading. The project combines Rust (a WebAssembly module that procedurally lays out the library, and a small Rust server for the catalog) with Three.js (rendering and interaction).

## What Changes

- Bootstrap a new web application: TypeScript + Vite + Three.js frontend rendering a walkable indoor library scene (shelves, books, tables, lighting).
- Add a SQLite-backed book catalog: a database holding per-book metadata (title, author, synopsis, etc.) and the URL of the book's EPUB file, served to the frontend by a Rust (Axum) API.
- Add a Rust crate compiled to WebAssembly (via `wasm-bindgen`/`wasm-pack`) that procedurally generates the library structure — gallery/room layout and shelf placement — and deterministically assigns every catalog book to a shelf slot, so the same catalog always produces the same library.
- Implement first-person navigation: pointer-lock mouse look, WASD movement, collision against walls and furniture.
- Implement book interaction: look at a book to see its title/author (and synopsis), click it to open an in-browser EPUB reader loading the book's EPUB from the URL in the catalog.
- Add an asset and build pipeline: GLTF/GLB models with instanced rendering for thousands of book spines, wasm bundling into the Vite build.
- Add deployment: a single Rust server binary serving the built frontend, the catalog API, and EPUB files, deployable with Docker to any host.
- Adopt test-driven development for the whole build: every task starts with a failing test, all test types (unit, property, integration, e2e, performance, static checks) are maintained from the first milestone, and CI blocks merges on any failure.

## Capabilities

### New Capabilities

- `book-catalog`: SQLite database schema for books (title, author, synopsis, EPUB URL, plus cover/spine hints) and a Rust API exposing the catalog to the frontend.
- `procedural-generation`: Rust/wasm module that deterministically generates the library structure (galleries, shelves, slots) sized to the catalog, and maps each catalog book to a specific shelf slot, exposed to JavaScript through a typed wasm-bindgen API.
- `scene-rendering`: Three.js scene construction from the generated layout — geometry, instanced meshes for books/shelves, materials, lighting, and frame-rate targets for large indoor scenes.
- `first-person-navigation`: pointer-lock first-person controls with WASD movement, collision detection, and traversal between library galleries.
- `book-interaction`: raycast-based book targeting showing catalog metadata, and an in-browser EPUB reader that opens the selected book's EPUB.
- `web-deployment`: production build (Vite + wasm) served by the Rust server together with the catalog API and EPUB files, reachable at a public URL.
- `development-workflow`: test-driven development discipline — test-first for every task, full test-type coverage per layer, and CI gates that keep every merge releasable.

### Modified Capabilities

None — this is a greenfield project with no existing specs.

## Plan

A detailed implementation plan (architecture, canonical data/API/buffer contracts, algorithms, build/deploy, testing, milestones) lives in [doc/](../../../doc/README.md); the specs in this change reference the relevant doc per capability, and [doc/10-roadmap.md](../../../doc/10-roadmap.md) sequences `tasks.md` into milestones M0–M6.

## Impact

- New codebase in this repository: `web/` (TypeScript/Three.js app), `crates/` (Rust wasm crate), and `server/` (Rust Axum server) — exact layout decided in design.
- New toolchain dependencies: Node.js + Vite + Three.js + an EPUB rendering library; Rust stable + `wasm32-unknown-unknown` target + `wasm-pack`; SQLite.
- New data asset: the books SQLite database and the EPUB files it references (user-provided content).
- New deployment target: a host able to run the Rust server (container-friendly), replacing a pure static-hosting setup.
- No existing code, APIs, or users are affected.

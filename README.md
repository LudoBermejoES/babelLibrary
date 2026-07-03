# babelLibrary

A first-person, walkable 3D library in the browser. Every book on the shelves is real: a SQLite catalog holds each book's title, author, synopsis, and EPUB URL — walk up to a spine, click it, and read the actual EPUB without leaving the page.

Built with **Rust** and **Three.js**:

- **Three.js + TypeScript + Vite** — rendering, first-person controls, HUD, and the epub.js reading overlay.
- **Rust → WebAssembly** (`crates/babel-gen`) — deterministic procedural generation of the library itself: hexagonal galleries, shelves, and the assignment of every catalog book to its slot, derived from a seed so all visitors find each book in the same place.
- **Rust server** (`server/`, Axum) — serves the catalog API, EPUB files, and the built frontend from a single binary; deploys as one container.

The name honors Borges' *Library of Babel* — hexagonal galleries, endless shelves — except every book here is real and readable.

## Status

**In progress.** Milestones M0 (toolchain + CI) and M1 (book catalog API) are implemented and tested; the procedural generator (M2) is next.

| Where | What |
|---|---|
| [doc/](doc/README.md) | The complete implementation plan: architecture, data/API contracts, generation algorithm, rendering, navigation, reader, build/deploy, testing, roadmap |
| [openspec/changes/library-3d-environment/](openspec/changes/library-3d-environment/) | The OpenSpec change: proposal, testable requirement specs (7 capabilities), design decisions, and the implementation checklist ([tasks.md](openspec/changes/library-3d-environment/tasks.md)) |

Development follows **TDD end to end** — every task starts with a failing test, and CI gates every merge (see [doc/09-testing.md](doc/09-testing.md)).

## Planned architecture

```text
Browser ──────────────────────────────────────────────
  Three.js frontend (TS/Vite): render loop · controls · HUD · epub.js reader
  babel-gen.wasm (Rust): gallery graph · book→slot assignment · collision data
──────────────── one origin (HTTPS) ──────────────────
  Axum server (Rust): /api/books · /epubs/* · static dist/
  SQLite catalog (read-only) · EPUB files
```

Key properties: no wasm or network calls inside the render loop (bulk data crosses the boundary once, as flat typed arrays), instanced rendering for thousands of book spines under a <100 draw-call budget, and a layout that is a pure function of `(seed, catalog)`.

## Roadmap

Seven milestones, each ending demonstrable — walking skeleton + CI, catalog API, generator, rendered library, navigation, book reading, deployment. See [doc/10-roadmap.md](doc/10-roadmap.md).

## Toolchain (once implementation lands)

Rust stable + `wasm32-unknown-unknown` + wasm-pack 0.15 · Node 22 LTS · three@0.185 · Vite 8 · SQLite. Exact commands and dev workflow: [doc/08-build-deployment.md](doc/08-build-deployment.md).

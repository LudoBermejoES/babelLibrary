# 01 — Overview

## Vision

An atmospheric virtual library you visit at a URL. You walk between hexagonal, shelf-lined galleries in first person. Every spine on every shelf is a real book from your catalog. Look at a spine and its title and author appear; linger and you get the synopsis; click and the book opens — the actual EPUB, readable page by page — then you close it and keep wandering.

The name honors Borges' *Library of Babel*: hexagonal galleries, endless shelves. Unlike Borges, every book here is real and readable.

## User experience walkthrough

1. **Arrival.** The page loads to a dimly warm library interior with a centered prompt: *"Click to enter — WASD to walk, mouse to look."* Behind the prompt the scene is already rendered.
2. **Entering.** Click → pointer lock engages, cursor disappears, a small crosshair appears at screen center.
3. **Walking.** WASD/arrows to move at a walking pace, mouse to look. You collide with walls, shelves, and tables; you slide along them rather than stopping dead. Doorways in the gallery walls lead to neighboring galleries; crossing one is seamless.
4. **Browsing.** Aim the crosshair at a book within reach (~2.5 m): the spine highlights and a HUD line shows *Title — Author*. Hold your gaze ~0.5 s and the synopsis fades in.
5. **Reading.** Click the highlighted book: movement stops, an overlay opens with a loading state, then the EPUB renders paginated. Arrow keys or on-screen buttons page; a table-of-contents menu jumps chapters.
6. **Returning.** `Esc` (or the close button) drops you back exactly where you stood, pointer lock re-engaged on click.
7. **Pausing.** `Esc` while walking shows a help/pause overlay with the controls.

## Goals

- 60 FPS target / 30 FPS floor on a mid-range laptop (integrated GPU, e.g. Apple M-series or recent Intel Iris).
- Catalog-driven: the SQLite database is the single source of truth for which books exist; the 3D placement is a pure deterministic function of (seed, catalog), so every visitor finds each book in the same place.
- Rust where it earns its place: an Axum server owning the catalog and file serving; a wasm module doing layout generation client-side.
- One-command build; single-container deployment.

## Non-goals (v1)

- Multiplayer/presence, accounts, bookmarks, or reading-progress persistence.
- Catalog editing UI (edit the SQLite file with any tool; restart not required — see 03).
- Infinite/streaming world — the library is sized to the catalog (target ≤ a few thousand books).
- Physics beyond player collision (no picking up or knocking over books).
- Mobile/touch controls, VR, WebGPU renderer, wasm threads.

## Glossary

| Term | Meaning |
|---|---|
| **Catalog** | The SQLite database of books (metadata + EPUB URL). |
| **Gallery** | One hexagonal room. Six walls; each wall is either a shelf wall or contains a doorway. |
| **Shelf bay** | One modeled bookcase unit occupying a wall segment; has a fixed number of shelf rows. |
| **Slot** | A position on a shelf row that holds exactly one book spine. |
| **Layout** | The full generated structure: gallery graph + shelf placements + slot→book assignment. |
| **Generator** | The `babel-gen` Rust crate compiled to wasm that produces the layout. |
| **Instance buffers** | Flat typed arrays (transforms, colors, book ids) the generator emits per gallery for `InstancedMesh`. |
| **HUD** | The 2D DOM overlay: crosshair, book metadata line, hints. |
| **Reader** | The foliate-js (`<foliate-view>`, vendored) overlay that displays an opened book. |

## Key constants (canonical values, referenced across docs)

| Constant | Value |
|---|---|
| Eye height | 1.70 m |
| Walk speed | 3.0 m/s |
| Player capsule radius | 0.30 m |
| Interaction range | 2.5 m |
| Synopsis dwell time | 0.5 s |
| Doorway clear width | ≥ 0.9 m (design uses 1.2 m) |
| Gallery hex side length | 4.0 m |
| Ceiling height | 3.2 m |
| Shelf rows per bay | 5 |
| Draw-call budget in view | < 100 |
| FPS target / floor | 60 / 30 |
| Default seed | `0xBABE1` (URL-overridable via `?seed=`) |

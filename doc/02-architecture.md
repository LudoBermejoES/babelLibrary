# 02 — Architecture

## System shape

Three tiers, each in its natural language:

```text
┌────────────────────────── Browser ──────────────────────────┐
│  Three.js frontend (TypeScript, Vite)                       │
│  render loop · scene graph · controls · raycast · HUD       │
│  foliate-js reader overlay (vendored)                       │
│        │ coarse calls, flat typed arrays (no per-frame IO)  │
│  babel-gen.wasm (Rust, wasm-bindgen)                        │
│  layout generation · slot assignment · collision AABBs      │
└───────────────┬──────────────────────────────────────────────┘
                │ HTTPS (one origin)
┌───────────────┴──────────────────────────────────────────────┐
│  Rust server (Axum)                                          │
│  /api/books (JSON) · /epubs/* (application/epub+zip)         │
│  static frontend dist/ (application/wasm for .wasm)          │
│        │                                                     │
│  SQLite (books.sqlite, read-only) · data/epubs/ files        │
└──────────────────────────────────────────────────────────────┘
```

Rationale (researched July 2026, see design.md in the OpenSpec change for alternatives considered):

- **Three.js over a pure-Rust engine (Bevy wasm)**: Bevy's web target remains second-class — 10–30 MB binaries, no GLTFLoader/meshopt/KTX2-class pipeline, full recompiles vs Vite HMR.
- **Server over static-only**: the catalog is SQLite and EPUBs need correct content types; an Axum server is the simplest Rust-native answer and gives one origin (no CORS for our own EPUBs). Client-side sql.js was rejected (extra ~1 MB wasm, HTTP-range hacks, still no EPUB host).
- **Wasm generator client-side rather than layout-from-server**: generation is chunky one-shot compute — the exact profile where wasm shines — and keeps the server a dumb data host. It also keeps the door open to a static-hosting fallback (bake the catalog to JSON) without touching frontend code.

## Tech stack (pinned)

| Layer | Choice | Version pin |
|---|---|---|
| Renderer | three.js `WebGLRenderer` | `three@0.185.x` + `@types/three@0.185.x` (keep in lockstep) |
| Frontend tooling | Vite + TypeScript strict | Vite 8.x, TS 5.x |
| Wasm bridge | wasm-bindgen / wasm-pack | 0.2.126 / 0.15.x |
| Vite wasm loading | `vite-plugin-wasm` + `build.target: 'esnext'` | 3.6.x |
| EPUB rendering | `foliate-js` (vendored source, not npm) | pinned commit, see `web/src/reader/vendor/VENDORED.md` |
| Server | Axum + tokio + tower-http | Axum 0.8.x |
| DB access | rusqlite (bundled SQLite) | 0.37.x |
| Asset pipeline | @gltf-transform/cli (meshopt) | 4.4.x |
| Rust | stable + `wasm32-unknown-unknown` | pin via `rust-toolchain.toml` |

Escape hatch if wasm-pack misbehaves (slow release cadence): `cargo build --target wasm32-unknown-unknown` + `wasm-bindgen-cli` directly. Trunk is not used (it targets all-Rust frontends).

## Repository layout

```text
babelLibrary/
├── Cargo.toml                 # workspace: crates/babel-gen, server
├── rust-toolchain.toml
├── crates/
│   └── babel-gen/             # layout generator → wasm (doc 04)
│       ├── src/lib.rs         # wasm-bindgen facade (thin)
│       ├── src/gen/           # target-independent generation logic
│       └── tests/             # native determinism tests
├── server/                    # Axum server (doc 03)
│   └── src/main.rs, routes/, db.rs
├── web/
│   ├── index.html
│   ├── vite.config.ts         # wasm plugin, /api + /epubs proxy
│   ├── src/
│   │   ├── main.ts            # boot: fetch catalog → generate → start loop
│   │   ├── api/               # typed API client (doc 03 shapes)
│   │   ├── wasm/              # ONLY module allowed to import babel-gen pkg
│   │   ├── scene/             # renderer, galleries, instancing, lights (doc 05)
│   │   ├── controls/          # pointer lock, movement, collision (doc 06)
│   │   ├── interact/          # raycast, highlight, HUD (doc 07)
│   │   ├── reader/            # foliate-js overlay + vendor/ (doc 07)
│   │   └── ui/                # overlays: enter, pause, error
│   └── public/assets/         # .glb models + CREDITS.md
├── data/                      # books.sqlite, epubs/   (gitignored except sample)
├── scripts/                   # seed.ts / build.sh
├── doc/                       # these documents
└── openspec/
```

## Data flow (boot sequence)

1. `main.ts` fetches `GET /api/books` → `BookMeta[]` (stable id order; shapes in doc 03).
2. Frontend sorts by `(author, title, id)` — browsable shelves — and builds the generator input arrays (ids, spine-color hints).
3. Calls `Library.generate(seed, ids, colorHints)` in the wasm module (API in doc 04). Seed = `0xBABE1` unless `?seed=` is present.
4. For the spawn gallery and its neighbors, pulls instance buffers + collision AABBs, **copies them out of wasm memory immediately** (views are invalidated when wasm memory grows), and builds `InstancedMesh`es (doc 05).
5. Render loop starts. Per frame: controls → collision → raycast → render. **No wasm or network calls occur inside the render loop.**
6. On doorway crossing: dispose the gallery now two hops away, build the newly adjacent one from generator buffers (again: pull, copy, build — outside the frame's hot path, spread over idle callbacks if needed).
7. On book click: metadata is already in memory; the EPUB is fetched only now, by the reader overlay.

## Interop contract (the rule that keeps this fast)

- JS↔wasm **calls** are ~nanoseconds; **data copies** run ~1–2 GB/s. Therefore: coarse calls ("give me gallery N's buffers"), flat typed arrays, never per-book calls, never per-frame calls.
- All wasm access is confined to `web/src/wasm/` behind a typed facade. Code review rule: any `import` of the wasm pkg outside that directory is a defect.
- Buffers are copied out at load time; no long-lived `Float32Array` views over `wasm.memory.buffer`.

## Configuration

| Variable / flag | Default | Used by |
|---|---|---|
| `BABEL_DB` | `data/books.sqlite` | server |
| `BABEL_EPUB_DIR` | `data/epubs` | server |
| `BABEL_STATIC_DIR` | `web/dist` (prod only) | server |
| `PORT` | `8080` | server |
| `?seed=<u64>` URL param | `0xBABE1` | frontend |

## Failure modes and where they're handled

| Failure | Behavior | Doc |
|---|---|---|
| WebGL2 unavailable | Static error page instead of canvas | 05 |
| `/api/books` unreachable | Blocking error overlay with retry | 03 |
| Empty catalog | Friendly "library is empty" screen with seeding hint | 03 |
| EPUB 404 / unparseable / CORS-blocked | Error state inside reader; 3D session survives | 07 |
| wasm fails to load | Error overlay (same path as API failure) | 08 |

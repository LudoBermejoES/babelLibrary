# Tasks: library-3d-environment

> Milestone sequencing and exit criteria: [doc/10-roadmap.md](../../../doc/10-roadmap.md) (M0–M6). Test mapping: [doc/09-testing.md](../../../doc/09-testing.md).
>
> **TDD rule (applies to every task, per the `development-workflow` spec):** each task is red → green → refactor. Write the failing test(s) named in the task first, watch them fail, implement minimally, refactor green. A task may only be checked off with its layer's full suite passing. Where a task is exploratory (asset sourcing, lighting feel), its acceptance test is written the moment the exploration settles — before the checkbox.

## 1. Project scaffolding & toolchain + CI (M0 — doc [02](../../../doc/02-architecture.md), [08](../../../doc/08-build-deployment.md))

- [x] 1.1 Verify/install toolchain: Rust stable + `wasm32-unknown-unknown` target, `wasm-pack` 0.15.x, Node LTS; record exact versions for the README
- [x] 1.2 Create Cargo workspace (`crates/babel-gen` lib + `server` bin) with one placeholder failing→passing `cargo test` per crate, proving the test harness runs
- [x] 1.3 Scaffold `web/` (Vite 8 + TS strict + `three@0.185.x` + `@types/three` + EPUB reader + `vite-plugin-wasm`, `build.target: 'esnext'`) with vitest wired and one placeholder test green
- [x] 1.4 Wire `npm run wasm`, `npm run dev` (proxy `/api` + `/epubs`), root build script (wasm + `dist/` + release server); Playwright installed with a first smoke test asserting the dev page serves
- [x] 1.5 **CI pipeline up front** (GitHub Actions, doc 09 §CI): fmt + clippy `-D warnings` + `cargo test` + `tsc --noEmit` + vitest + build + Playwright, red blocks merge — running against the placeholder tests from day one. Docker build lives in a separate release-only workflow (published release or `v*.*.*` tag), not on every PR/push.
- [x] 1.6 Smoke test (automated): blank Three.js scene renders (Playwright: canvas present, zero console errors) and a trivial typed wasm export is asserted from a vitest test

## 2. Book catalog (M1 — doc [03](../../../doc/03-data-and-api.md))

- [x] 2.1 RED: write failing server integration tests (fixture DB per test): migration idempotence, `GET /api/books` id order + camelCase shape, nulls for missing optional fields, `GET /api/books/{id}` 200 + 404 JSON error shape, `/healthz` book count
- [x] 2.2 GREEN: implement schema + idempotent migration (env/flag config, read-only reopen), both book endpoints (10k cap with warning, per-request reads), and `/healthz`, until 2.1 passes
- [x] 2.3 RED→GREEN: failing tests for EPUB serving (`application/epub+zip`, `Accept-Ranges: bytes`, external absolute URLs passed through untouched) → implement `/epubs` static serving
- [x] 2.4 Seed script (Gutenberg list in doc 03, `--with-broken` flag) with its own tests: idempotence (re-run safe), row shape, broken row present only with the flag
- [x] 2.5 REFACTOR: extract row→JSON mapping, error helper; suite stays green; clippy clean

## 3. Procedural layout generator (M2 — doc [04](../../../doc/04-wasm-generator.md))

- [ ] 3.1 RED: write the native determinism suite first (doc 04 list): identical output for same (seed, catalog); N books ⇒ N unique slots; seeds differ; hint wins; spine bounds; graph connectivity; ≥0.9 m doorway clearance; ≥7 galleries minimum — all failing against stub types
- [ ] 3.2 GREEN: hex gallery-graph generation (blob growth, spanning-tree + extra doorways, walls/shelf placement) until graph tests pass
- [ ] 3.3 GREEN: book→slot assignment (fixed traversal order over pre-sorted input; per-book dims/colors keyed by (seed, book id)) until assignment tests pass
- [ ] 3.4 RED→GREEN: buffer-emission tests (stride/length/alignment of transforms, colors, id map, wall segments, AABBs per doc 04 layouts) → implement emission
- [ ] 3.5 Add `proptest` property tests: placement totality, uniqueness, in-bounds across fuzzed (seed, catalog size)
- [ ] 3.6 RED→GREEN: vitest tests against the real wasm build via the `web/src/wasm/` facade (buffer shapes for a 100-book catalog, immediate copy-out, no `any` at the boundary via `tsc --noEmit`) → implement wasm-bindgen bindings + facade

## 4. Scene rendering (M3 — doc [05](../../../doc/05-rendering.md))

- [ ] 4.1 RED→GREEN: Playwright tests for boot (canvas + zero console errors) and WebGL2-missing error page (flag-disabled context) → renderer setup (ACESFilmic, pixel-ratio cap, resize, context-lost handler)
- [ ] 4.2 RED→GREEN: boot-integration test — seeded fixture catalog renders N galleries, `?seed=` override changes layout (Playwright reads `window.__babel` debug hook) → catalog fetch → generator → gallery architecture from wall segments
- [ ] 4.3 Assets: source CC0 GLBs (shelf bay, table, lamp, ~5 unit book archetypes; box placeholders first), meshopt pipeline, CREDITS.md; acceptance test: assets load without console errors, budget test still green
- [ ] 4.4 RED→GREEN: instance-count test (books rendered == books in fixture catalog, via debug hook) → `InstancedMesh` book rendering (archetype = id % 5, direct buffer writes)
- [ ] 4.5 Lighting + fog (exploratory) → acceptance test written when settled: screenshot-based luminance check that no traversable position renders fully dark
- [ ] 4.6 RED→GREEN: streaming test (crossing a doorway: entered gallery already populated — no pop-in; two-hop gallery disposed; draw calls bounded) → gallery streaming + buffer cache
- [ ] 4.7 Performance gate (`@perf` Playwright, doc 09 §5): scripted 60 s walk over 3 galleries with 2,000+ books in view asserts ≥30 FPS floor and <100 draw calls via `?debug` HUD stats

## 5. First-person navigation (M4 — doc [06](../../../doc/06-navigation-collision.md))

- [ ] 5.1 RED: vitest suite for pure movement/collision first: wall block + slide (tangential velocity preserved), 1.2 m doorway pass at multiple angles, deep-penetration fallback, dt cap, frame-rate independence (30 vs 120 FPS distance within 5%)
- [ ] 5.2 GREEN: movement model (exponential smoothing, eye 1.7 m, 3 m/s, no vertical) + capsule-vs-AABB push-out with y-band prefilter until 5.1 passes
- [ ] 5.3 RED→GREEN: Playwright tests (pointer lock on click, WASD moves camera, `Esc` shows pause overlay, `pointerlockchange` as truth) → input-mode state machine + PointerLockControls integration
- [ ] 5.4 RED→GREEN: gallery-tracking test (hysteresis: no flip-flop at doorway plane; collider set + streaming swap on change) → tracking implementation

## 6. Book interaction & EPUB reader (M5 — doc [07](../../../doc/07-interaction-reader.md))

- [ ] 6.1 RED: vitest for dwell timer (book-id keyed, instance flicker ignored) and raycast→id resolution (mock hit → catalog metadata); Playwright specs for HUD (title/author in range, synopsis at 0.5 s, nothing beyond 2.5 m)
- [ ] 6.2 GREEN: center-screen raycast (far 2.5 m, current gallery, alternate frames), instanceColor highlight, HUD — until 6.1 passes
- [ ] 6.3 RED: Playwright reader specs — open shows loading then pages; arrows + buttons page and stop at ends; TOC jumps; `correct_book` (targeted id == reader title); close restores exact pose; `lazy_epubs` (zero `/epubs/`/external requests during a 20 s no-click walk)
- [ ] 6.4 GREEN: foliate-js overlay (loading state, pagination, TOC, `view.close()` cleanup) + open/close lifecycle (pose store, pointer-lock release, click-to-relock catcher) — until 6.3 passes
- [ ] 6.5 RED→GREEN: failure-path tests using the `--with-broken` seed row + a CORS-blocked mock + a 20 s-timeout mock → error card (named book, close returns to walkable scene)
- [ ] 6.6 REFACTOR: interaction/reader module boundaries; all suites green; no wasm/network calls in the render loop verified by the facade lint rule

## 7. Deployment & docs (M6 — doc [08](../../../doc/08-build-deployment.md))

- [ ] 7.1 RED→GREEN: production-wiring tests (release server serves `dist/` with `application/wasm`, `model/gltf-binary`, SPA fallback; API + EPUBs same origin) → implement, then run the full Playwright suite against the release build
- [ ] 7.2 Multi-stage Dockerfile (doc 08 sketch) with port/DB/EPUB-dir config + `/healthz` healthcheck; verification: `docker run` with mounted data passes the smoke subset of the e2e suite
- [ ] 7.3 Deploy to chosen container host (default: Fly.io with `/data` volume); run the doc 08 verification checklist on the public URL (Chrome + Firefox, clean console) + performance gate on reference hardware
- [ ] 7.4 README (toolchain versions, seed/dev/test/build/deploy commands, env vars, TDD workflow note, architecture overview linking doc/); validate by fresh-machine run-through incl. running all test suites

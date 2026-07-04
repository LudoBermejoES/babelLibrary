# Tasks: fix-rendering-and-infinite-periodicity

Order is deliberate: the pure-logic correctness fixes (no buffer-contract
change, fully testable headless) land and commit first; then the
generator/rendering redesign lands as its own buffer-contract-bump commit.
Every task is RED→GREEN (write the failing test first) unless noted. After
each group: `cargo fmt --all --check`, `cargo clippy --workspace
--all-targets -- -D warnings`, `cargo test --workspace`, `npm test`,
`npm run build`, headless Playwright. Version-bump + tag + push per CLAUDE.md
at each commit.

## 1. Correctness fixes — pure movement/streaming/boot (no buffer-contract change)

- [x] 1.1 Strafe inversion: extract pure `worldStepFromYaw` (RED unit test in `tests/movement.test.ts` first), wire into `PlayerController` with a reused scratch Vector3.
- [x] 1.2 Boot-failure error panel: RED `e2e/boot-failure.spec.ts` (route `/api/books` → 500), add `showBootError` in `main.ts`, route from `entry.ts`.
- [x] 1.3 Dispose keeps shared instanced geometry: RED test in `tests/streaming-streamer.test.ts` (shared geometry never fires `dispose`, per-gallery geometry + InstancedMesh do), fix `GalleryStreamer.dispose()`.
- [x] 1.4 Bidirectional horizontal adjacency: extract `horizontalNeighborsOf` to `web/src/graph.ts`; RED tests in `tests/streaming.test.ts` (reverse neighbor is `full`) and `tests/gallery-tracking.test.ts` (walk back re-tracks); wire into `neededGalleryMembership` and `trackGallery`.
- [x] 1.5 Staircase eye-height band + radial exit: RED tests in `tests/stairs.test.ts` (landings at eye height; enter/climb/descend cross floors; radial strafe exits to flat without snap). Fix `helixFor` to derive the band from `floorY + EYE_HEIGHT`, and the `PlayerController` stairs branch to route only forward/back through the helix and step off on radial input.
- [x] 1.6 Neighbor collider union + per-frame cache: RED test (new `tests/player-collision.test.ts`, node env, real wasm) — in the hysteresis band the neighbor's facing wall blocks movement. Add a streamer accessor for the union of `full`-set colliders; `PlayerController` caches the parsed `Aabb[]` and rebuilds it only on tracked-gallery change (removing the per-frame `Float32Array` concat + `Array.from` churn).
- [x] 1.7 `setCurrentGallery` desync: make the `?e2e` hook teleport the camera, set the player's tracked gallery, and drive `streamer.update` through the player (one source of truth). RED test: after `setCurrentGallery(N)`, tracked gallery is `N` and colliders come from `N`.
- [x] 1.8 Cleanups (no behavior change, existing suites stay green): deleted `placeholderReady` + `web/tests/harness.test.ts`; fixed the vacuous assertion in `e2e/shaft-visibility.spec.ts` (now asserts the own-gallery-live invariant, and flagged that task 3.4's vertical wrap will replace it); extracted a shared `scene/props.ts` (`forEachProp`/`countPropsOfKind`/`LAMP_KIND`/`PROP_STRIDE`) reused by `instancing.ts` + `lighting.ts`; extracted a shared `appendAabbs` AABB decoder in `collide.ts` reused by the streamer's `activeColliders`. **Skipped** removing `InputModeMachine.click()`: it marks a real doc-06 diagram edge and is the "user clicked" step in 9 unit tests; removing it means rewriting those tests for zero behavior change, so the churn isn't worth it — the no-op is documented.
- [ ] 1.9 Commit group 1 (`fix:` → patch bump), tag, push, verify CI green.

## 2. Generator redesign — closed cycles, edge direction, spawn at floor level

- [ ] 2.1 Add `STAIRCASE_RADIUS_M` to `gen/config.rs`; emit it in the graph-JSON config block; `stairs`/`helixFor` read it instead of borrowing `shaftRadius`. (RED: a config test + a facade test that the field is present.)
- [ ] 2.2 Spawn at floor level: RED update to the Rust spawn test (spawn `y` == floor height, no `+1.70`); remove the eye offset from `lib.rs`; frontend adds `EYE_HEIGHT` when posing the camera.
- [ ] 2.3 Closed-cycle floor growth: RED `cargo test` (last cell hex-adjacent to first; every step is a unit hex direction) + proptest over seeds (always closes, with retry/fallback). Rewrite `grow_chain` in `graph.rs` as a seeded closed hex cycle.
- [ ] 2.4 Edge direction on the graph: RED tests — each `GalleryShell`/`Gallery` records the `HEX_DIRECTIONS` index of its horizontal edge; the reverse cell stores the opposite; graph JSON exposes it. Thread through `graph.rs` → `furnish.rs` → `emit.rs` and `lib.rs`'s `GraphJson`.
- [ ] 2.5 Direction-aware vestibule wall + buffer-contract bump: RED buffer tests — the vestibule opening is on the wall for the edge direction; two neighbors' openings face each other. Update `emit::vestibule`/`wall_segments`/`spawn_pose` to stop hardcoding wall 0/3; bump the doc-04 buffer layout; update the wasm facade + all TS consumers (`gallery.ts`, `vestibule.ts`, `debug.ts`) in the same commit; rebuild wasm.
- [ ] 2.6 Commit group 2 (`feat:` → minor bump; it's a buffer-contract change), tag, push, verify CI green.

## 3. Rendering redesign — anteroom, wall-3 railing, vertical wrap, no-void gate

- [ ] 3.1 Shared floor/ceiling-with-shaft-hole builder: extract from `gallery.ts`, reuse in `shaft-visibility.ts` (removes the confirmed duplication) with shared module-level materials.
- [ ] 3.2 Anteroom geometry behind the vestibule opening: build the small antechamber (mirror + closets already there) so a sightline through the opening lands on geometry and leads toward the neighbor. RED: the no-void survey's "through vestibule opening" view drops from ~86% near-black to small.
- [ ] 3.3 Wall-3 railed shaft opening + replicated interior: render a railing at the shaft-facing wall and a cheap replicated gallery interior beyond it (reuse the glimpse builder, offset horizontally). RED: the no-void survey's "wall 3" view drops from ~41% near-black to small.
- [ ] 3.4 Vertical visual wrap: when `floorAbove`/`floorBelow` is null (top/bottom floor), the streamer renders the wrapped floor's counterpart glimpse offset by ±ceiling height. RED: `tests/streaming-streamer.test.ts` (bottom-floor gallery has a wrapped down-glimpse) + the no-void survey's up/down shaft views drop from ~39–45% near-black to small.
- [ ] 3.5 No-void regression gate: `e2e/no-void.spec.ts` — the full survey (vestibule opening, wall 3, shaft up, shaft down) asserts each view is under the near-black threshold on a multi-floor catalog. Must be RED before 3.2–3.4 and GREEN after.
- [ ] 3.6 Docs: update doc 04 (world model, buffer layouts, spawn), doc 05 (wall-3 railing, vertical wrap, disposal), doc 06 (strafe, staircase band, bidirectional tracking, collider union) to match the shipped behavior.
- [ ] 3.7 Commit group 3 (`feat:` → minor bump), tag, push, verify CI green; run the manual-QA pointer-lock + feel + no-void walkthrough (doc 09 §6) in a real browser.

# Design: fix-rendering-and-infinite-periodicity

## Context

M3 (scene rendering) and M4 (first-person navigation) are complete and
tagged (v0.14.0). A high-recall `/code-review` plus a scripted visual survey
found the confirmed navigation bugs and the black-void rendering listed in
the proposal. This design records how each is fixed and how each is tested.
Values referenced (hex side 4.0 m, ceiling 3.2 m, shaft radius 1.0 m,
capsule 0.30 m, eye 1.70 m, hysteresis 0.30 m) are the canonical constants
in `crates/babel-gen/src/gen/config.rs` and `web/src/controls/constants.ts`.

## Goals / Non-Goals

**Goals:**

- No traversable sightline shows a black void: every direction shows library.
- The confirmed movement/streaming/boot bugs are fixed, each with a test that
  fails before the fix and passes after (RED→GREEN), using pure vitest units
  wherever the logic can be made pure.
- The generator produces a geometrically closed, direction-aware floor layout
  so vestibule openings face real neighbors and the loop closes on a real
  shared wall.

**Non-Goals:**

- Traversable vertical wrap (walking above the top floor to emerge on floor 0)
  — vertical periodicity is **visual only** in v1.
- Real EPUB reader / book interaction (that is M5, unaffected).
- Replacing placeholder box art with real GLBs (still deferred).
- Portal-style non-Euclidean rendering — we make the world geometrically
  closed instead, which keeps the existing renderer/collision model valid.

## Decisions

### D1 — Pure functions for every headless-untestable movement bug

The strafe/staircase/tracking bugs live under pointer-lock+WASD, which
headless Chromium can't drive. Rather than leave them uncovered, extract the
math into pure functions unit-tested in vitest, leaving `PlayerController` a
thin wiring layer:

- **Strafe** → `worldStepFromYaw(yaw, strafe, forward, dt)` in
  `controls/movement.ts`. Camera-right is `forward × up`; with
  `yaw = atan2(fwd.x, fwd.z)` the world step is
  `x = fwd·sinθ − strafe·cosθ`, `z = fwd·cosθ + strafe·sinθ`. (Done.)
- **Staircase band** → `helixFor` derives `bottomY/topY` from the landing
  eye-height (`floorY + EYE_HEIGHT`), not floor level, so `isWithinHelixFootprint`
  engages at the height the camera actually is and `advanceOnHelix` tops out
  at the next floor's eye height, which `trackGallery` then recognizes.
- **Staircase radial exit** → the stairs branch only routes motion through the
  helix while the player's *horizontal* distance from the helix axis is within
  the staircase radius AND they are moving forward/back; a strafe (radial)
  input steps them off the helix onto the flat floor at their current y (the
  landing floors match the helix y at both ends by construction, so no snap).
- **Bidirectional adjacency** → `horizontalNeighborsOf(galleries, i)` in
  `web/src/graph.ts` returns the forward edge plus any gallery whose forward
  edge points at `i`; both `neededGalleryMembership` and `trackGallery`
  consume it. (Done.)

### D2 — Collision uses the live full-membership union, cached at gallery change

`PlayerController` collides against the union of AABBs across the streamer's
`full` set (current + horizontal neighbors), not just `tracked.index`. The
parsed `Aabb[]` is rebuilt only in `retrackFromCameraPosition()` when the
tracked gallery changes (and stored on the controller), not per frame — this
also removes the confirmed per-frame `Float32Array`-concat and
`Array.from(subarray)` allocations from the hot path.

### D3 — Dispose frees per-gallery geometry + instance buffers, never shared geometry

`GalleryStreamer.dispose()` calls `InstancedMesh.dispose()` on instanced
meshes (frees only their own instance matrix/color buffers, leaves the shared
module-level geometry intact) and `geometry.dispose()` only on plain per-
gallery meshes (walls, floor, closets, glimpse floor/ceiling). Materials stay
shared and undisposed as before. (Done.)

### D4 — Boot failures show an error panel

`entry.ts` routes `boot()` rejections to `showBootError`, which appends the
same-styled panel used for the WebGL2-missing case (`data-testid="boot-error"`).
(Done.)

### D5 — `setCurrentGallery` debug hook routes through the player

The `?e2e` `setCurrentGallery(i)` becomes: teleport the camera to gallery
`i`'s standing pose, set the player's tracked gallery to `i`, then let the
player drive `streamer.update(i)` — one owner of "current gallery" state
instead of the streamer and player disagreeing.

### D6 — Floor layout is a geometrically closed hex cycle

`graph.rs` grows floor 0 as a **closed cycle on the hex lattice**: a seeded
random walk that must return to the origin cell via hex-adjacent steps
(length 7–19, even parity as the hex ring requires), so the last cell is hex-
adjacent to the first and the loop-closing doorway is a real shared wall.
Each directed edge `i → next` records the `HEX_DIRECTIONS` index used; the
reverse cell stores the opposite direction. This replaces the open random
walk whose ends were arbitrarily far apart.

### D7 — Direction-aware vestibule + anteroom, and wall-3 railing

`furnish.rs`/`emit.rs` place the vestibule opening on the wall whose hex
direction matches the gallery's neighbor edge (no longer hardcoded wall 0),
and emit a short **anteroom** box behind the opening (with the mirror/closets)
so the sightline through the doorway lands on geometry. Hex wall **3** (or
whichever wall is neither a shelf wall nor the vestibule) becomes a **railed
opening** with a lightweight replicated gallery interior rendered beyond it
(reuse the shaft-glimpse builder, offset horizontally), so that sightline
shows library, not void. The buffer layouts in doc 04 gain the direction
field; the wasm facade and consumers update together.

### D8 — Vertical visual wrap

The streamer's glimpse tier, when the real `floorAbove`/`floorBelow` is
`null` (top/bottom floor), instead renders the **wrapped** floor's gallery at
the same `(q,r)`: above the top floor shows floor 0's counterpart offset up
by one ceiling height; below floor 0 shows the top floor's counterpart offset
down. Purely a render-time glimpse — no new graph edges, no traversal, no
collision change.

## How each change is tested

Every item below is RED→GREEN: the test is written first and shown to fail
before the fix.

| # | Change | Test (file) | What it asserts |
|---|---|---|---|
| 1 | Strafe direction | vitest `tests/movement.test.ts` (`worldStepFromYaw`) | facing −Z, D→+X and A→−X; facing +X, D→+Z; y stays 0; scales by dt. (done) |
| 2 | Staircase eye-height band | vitest `tests/stairs.test.ts` | with landings at eye height, entering at camera eye y engages stairs; climbing tops out at next floor's eye height; a down-only staircase is enterable from eye height. |
| 3 | Staircase radial exit | vitest `tests/stairs.test.ts` | a radial (strafe) step while on the helix returns `verticalMode: flat` at the same y; forward-only stays on the helix. |
| 4 | Bidirectional streamer membership | vitest `tests/streaming.test.ts` | in a directed ring 0→1→2→0, membership for gallery 1 includes 0 (reverse edge) as `full`. (done) |
| 5 | Bidirectional gallery tracking | vitest `tests/gallery-tracking.test.ts` | standing in 1, walking to 0's center re-tracks to 0. (done) |
| 6 | Neighbor collider union | vitest (new `tests/player-collision.test.ts` against real wasm, node env) | with the player in the hysteresis band, the neighbor's facing wall AABB is in the active set and blocks movement. |
| 7 | Dispose keeps shared geometry | vitest `tests/streaming-streamer.test.ts` | disposing a gallery never fires `dispose` on the shared instanced geometry, but does dispose per-gallery geometry and the InstancedMesh. (done) |
| 8 | Boot error panel | Playwright `e2e/boot-failure.spec.ts` | with `/api/books` routed to 500, a `boot-error` panel is visible, no silent black canvas. (done) |
| 9 | setCurrentGallery no desync | vitest/Playwright | after `setCurrentGallery(N)`, the player's tracked gallery is `N` and `collidersFor` returns N's colliders. |
| 10 | Closed-cycle floor layout | Rust `cargo test -p babel-gen` | the floor-0 chain's last cell is hex-adjacent to the first (loop edge is a unit hex step); every edge direction is one of the 6 hex directions; reverse direction is the opposite. |
| 11 | Direction-aware vestibule | Rust `cargo test -p babel-gen` | the vestibule wall index equals the hex direction of the gallery's neighbor edge; two neighbors' openings face each other. |
| 12 | No black-void survey (regression gate) | Playwright `e2e/no-void.spec.ts` | standing in the spawn gallery (multi-floor catalog), looking through the vestibule opening, at wall 3, and up/down the shaft each render **< ~15% near-black** pixels (the survey that currently reports 41–86%). |
| 13 | Vertical visual wrap | vitest `tests/streaming-streamer.test.ts` + the no-void survey | on the bottom floor a shaft-down glimpse group exists (wrapped), and the down-shaft survey view is not black. |
| 14 | Cleanups (dead code, dupes, staircase radius, eye-height ownership) | existing suites stay green; `tsc`/`clippy` clean | no behavior change; `harness.test.ts` deleted; `STAIRCASE_RADIUS_M` in config; generator spawn emitted at floor level with the frontend adding `EYE_HEIGHT`. |

Full-suite gates after every task: `cargo fmt --all --check`,
`cargo clippy --workspace --all-targets -- -D warnings`,
`cargo test --workspace`, `npm test` (tsc + vitest), `npm run build`, and the
headless Playwright suite. Pointer-lock-gated behaviors remain manual QA
(doc 09 §6) since headless can't grant Pointer Lock.

## Risks / Trade-offs

- **Closed-cycle hex growth can fail to close** for some seeds/lengths (a
  random walk may paint itself into a corner). Mitigation: retry with a fresh
  RNG sub-seed, and fall back to a known-closable shape (e.g. a hex ring of
  the target size) if N retries fail — never emit an open chain. Covered by a
  proptest over seeds asserting closure.
- **Buffer-layout change** (adding edge direction) is a breaking change to the
  wasm↔JS contract; must land generator + facade + consumers + doc 04 in one
  commit or the frontend mis-reads buffers. The `fidelity_defaults`-style
  pinning test and the facade vitest guard catch drift.
- **Wall-3 replicated interior + vertical wrap add draw calls.** Keep them at
  the cheap glimpse tier (floor/ceiling/railing + instanced books only, no
  vestibule) and re-run the perf gate; if the budget is threatened, downgrade
  the replicated interior to a static impostor (doc 05 already lists this
  lever).
- **Visual-only vertical wrap can look wrong up close** (you see a floor you
  can't reach). Accepted for v1 per the shaft being non-traversable anyway;
  the fog + railing sell it as depth.
- **Scope**: this is a large change touching the generator's core graph
  algorithm and the buffer contract. It is sequenced in tasks.md so the
  pure-logic correctness fixes (safe, well-tested, no contract change) land
  and commit first, then the generator/rendering redesign lands as its own
  buffer-contract-bump commit.

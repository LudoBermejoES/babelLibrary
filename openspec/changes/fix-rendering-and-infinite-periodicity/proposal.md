# Proposal: fix-rendering-and-infinite-periodicity

## Why

A `/code-review` pass over the M3+M4 work (scene rendering + first-person
navigation) plus a direct visual survey of the running app surfaced two
classes of problem:

1. **The "infinite library" illusion is broken — the player sees black voids
   in every direction.** Borges' library is unlimited but periodic: walk far
   enough and you return where you started, and you never see an edge — only
   more library. The current build shows large black areas instead. A
   scripted survey standing in the spawn gallery and looking in each
   direction measured the near-black fraction of the frame:

   | View | mean luminance | near-black % |
   |---|---|---|
   | wall 1 (shelf) | 0.120 | 1.3% |
   | wall 5 (shelf) | 0.104 | 1.2% |
   | wall 2 (shelf) | 0.083 | 22% |
   | wall 4 (shelf) | 0.094 | 22% |
   | **wall 3 (shaft wall)** | 0.088 | **41%** |
   | **straight up (shaft)** | 0.079 | **39%** |
   | **straight down (shaft)** | 0.063 | **45%** |
   | **through vestibule opening** | 0.045 | **86%** |

   Root causes: the vestibule opening is hardcoded to hex wall 0 (+x) for
   every gallery regardless of which direction its actual chain neighbor lies
   in, and there is no anteroom/corridor geometry behind the opening, so
   looking through it shows void; hex wall 3 is left fully open ("the shaft
   wall") with nothing rendered beyond it; the central shaft has no vertical
   periodic wrap, so at the top/bottom floors looking up/down the shaft shows
   nothing; and the floor-0 chain's loop-closing edge (last→first) joins two
   galleries that are far apart in world space, so that doorway can never be
   seamless.

2. **Confirmed correctness bugs in the navigation/streaming code**, several of
   which make the game unplayable and none of which the automated suite can
   catch today (they live under the pointer-lock/WASD path that is
   manual-QA-only). The review confirmed: inverted strafe (A/D swapped); the
   staircase "traps" the player in an endless orbit with no radial exit; the
   staircase helix band is computed at floor height but compared against
   eye-height, so floors can never actually change; walking back through a
   doorway drops you into a disposed, collider-free void (directed-ring
   tracking + streamer membership only ever look forward); collision only uses
   the current gallery's AABBs, so you can clip through a neighbor's wall in
   the hysteresis band; disposing a gallery destroys the *shared* instanced
   geometry still used by every other live gallery; a boot failure (catalog
   fetch / wasm init) leaves a silent black canvas; and the `?e2e`
   `setCurrentGallery` hook desyncs the streamer from the player's tracked
   gallery.

This change fixes the confirmed bugs and reworks the world model so the
library reads as genuinely infinite in all directions.

## What Changes

**Correctness fixes (movement / streaming / boot):**

- Fix inverted strafe by extracting a pure, unit-tested `worldStepFromYaw`.
- Fix the staircase: derive the helix band from eye height (not floor height)
  so climbing/descending actually crosses floors, and give it a real radial
  exit so the player can step off instead of orbiting forever.
- Make horizontal adjacency bidirectional for both streaming membership and
  gallery tracking (a doorway is walkable both ways even though the generator
  stores a one-way ring edge), so walking back the way you came re-tracks and
  the previous gallery stays live.
- Collide against the union of the current gallery + its live horizontal
  neighbors, not just the tracked gallery, closing the hysteresis-band clip
  gap; cache the parsed collider set at the gallery-change boundary instead of
  rebuilding it every frame.
- Fix `GalleryStreamer.dispose()` to free per-gallery geometry and each
  `InstancedMesh`'s own instance buffers while never disposing the shared
  module-level instanced geometry.
- Show a boot-error panel (not a black canvas) when the catalog fetch or wasm
  init fails.
- Make the `?e2e` `setCurrentGallery` debug hook route through the player so
  the streamer and `PlayerController.tracked` cannot desync.

**Infinite-periodicity redesign (world model + rendering):**

- Generate floor 0 (and thus every floor's footprint) as a **geometrically
  closed cycle** of hex-adjacent galleries, so the loop-closing doorway is a
  real shared wall and walking the loop physically returns you to the start.
- Record, per gallery, **which of the 6 hex directions** its vestibule /
  horizontal-neighbor edge uses, and thread that direction through
  furnishing and buffer emission so the vestibule opening actually faces its
  neighbor. Build **anteroom/corridor geometry** behind the opening so
  looking through it shows the connected gallery, not void.
- Turn hex wall 3 (the shaft wall) into a **railed opening onto the central
  shaft** with a replicated gallery interior rendered beyond it, so that
  sightline shows more library rather than black.
- Add **vertical visual periodicity**: at the top and bottom generated floors,
  the shaft glimpse renders the wrapped floor's content (top+1 → floor 0's
  content, bottom−1 → the top floor's content) offset to the physically
  adjacent height, so looking up/down the shaft never shows an edge.
  (Traversable vertical wrap — actually climbing past the top floor — is
  explicitly out of scope for v1; wrap is visual only.)

**Cleanups (from the review):**

- Delete dead scaffolding: `placeholderReady` + `harness.test.ts`, and the
  no-op `InputModeMachine.click()`.
- Extract shared helpers to remove confirmed duplication: one
  floor/ceiling-with-shaft-hole builder shared by the full and glimpse tiers;
  one lamp/prop-record iterator shared across instancing and lighting; one
  `horizontalNeighborsOf` graph helper (done).
- Give the staircase its own `STAIRCASE_RADIUS_M` config constant instead of
  borrowing the shaft radius, and stop duplicating eye height between the
  generator and the frontend (generator emits floor-level spawn; frontend
  adds `EYE_HEIGHT`).
- Fix the vacuous `shaft-visibility` test whose only assertion was
  `result.found === true`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `procedural-generation`: floor layout becomes a geometrically closed cycle
  of hex-adjacent galleries; each gallery records the hex direction of its
  vestibule/horizontal edge; the spawn pose is emitted at floor level (eye
  height added by the frontend).
- `scene-rendering`: vestibule openings face their real neighbor and have
  anteroom geometry; hex wall 3 becomes a railed shaft opening showing a
  replicated interior; shaft glimpses wrap vertically at the top/bottom
  floors so no sightline shows black; gallery disposal never frees shared
  instanced geometry.
- `first-person-navigation`: strafe direction corrected; staircase band uses
  eye height and has a radial exit; horizontal adjacency is bidirectional for
  tracking; collision uses the current + neighbor collider union; boot
  failures show an error panel.

## Impact

- **Rust generator** (`crates/babel-gen/src/gen/`): `graph.rs` (closed-cycle
  growth + edge direction), `furnish.rs` / `emit.rs` (direction-aware
  vestibule wall, wall-3 railing, anteroom), `config.rs`
  (`STAIRCASE_RADIUS_M`), `lib.rs` (spawn at floor level). Buffer layout in
  doc 04 changes (vestibule/wall records gain a direction; graph JSON gains
  per-gallery edge direction), so the wasm facade and all buffer consumers
  update in lockstep.
- **Frontend** (`web/src/`): `controls/` (movement, gallery-tracking, player,
  input-mode), `scene/` (streaming, gallery, shaft-visibility, vestibule,
  instancing, lighting), `main.ts` / `entry.ts` / `debug.ts`, new
  `graph.ts`.
- **Tests**: new vitest units for the pure fixes; new/《fixed》 e2e specs for
  boot failure and the black-void survey becoming a regression gate; the perf
  and lighting e2e gates continue to apply.
- **Docs**: doc 04 (world model, buffer layouts, spawn), doc 05 (wall-3
  railing, vertical wrap, disposal), doc 06 (strafe, staircase band,
  bidirectional tracking, collider union) updated to match.
- No deployment/API/server changes.

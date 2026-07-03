# 06 — Navigation & collision

## Input modes (single state machine, shared with doc 07)

```text
ENTER_OVERLAY ──click──▶ WALKING ──Esc──▶ PAUSE_OVERLAY ──click──▶ WALKING
                            │ click on highlighted book
                            ▼
                          READER ──Esc/close──▶ WALKING (same pose)
```

One `InputMode` enum owns this; controls, raycasting, and the reader all check it. Pointer lock is *requested* only from a user gesture (click), *released* on entering `PAUSE_OVERLAY`/`READER`. The browser fires `pointerlockchange` asynchronously — treat that event (not our request) as the source of truth for mode transitions into/out of WALKING.

## Look

`PointerLockControls` (three/addons) provides yaw/pitch from mouse deltas. Clamp pitch to ±87°. Sensitivity constant, no user setting in v1.

## Movement

- State: `position` (camera at eye height 1.70 m above the local floor), `yaw` from controls, horizontal `velocity`, plus `verticalMode: 'flat' | 'stairs'` (see below).
- Input: WASD + arrows → a wish direction in the camera's yaw frame (pitch ignored — no flying), normalized so diagonals aren't faster.
- Model: velocity moves toward `wishDir * WALK_SPEED (3.0 m/s)` with exponential smoothing, frame-rate independent:

```ts
const ACCEL = 12;                                  // 1/s
const k = 1 - Math.exp(-ACCEL * dt);
velocity.lerp(wishVelocity, k);
const step = velocity.clone().multiplyScalar(dt);
position.copy(collide(position, step));            // below
```

- `dt` capped at 0.1 s. Spec check: equal travel distance at 30 vs 120 FPS within 5% — the exponential form guarantees it; the test exists to catch regressions (someone "simplifying" to `velocity += accel` per frame).
- **No jump/fly input ever** — the only way `position.y` changes is by walking along a staircase (below). This keeps the control scheme identical to the original flat-world design; verticality is a property of *where* you walk, not a new input.

## Vertical movement: the spiral staircase

Each vestibule with a staircase (doc 04: `hasStairUp`/`hasStairDown`) defines a walkable helical path, not a flat plane. Modeled as a **1D parametric ramp**, not a general 3D navmesh (the only non-flat walkable surface in the whole library is this one recurring, identical staircase shape):

- The staircase occupies a fixed-radius cylinder (radius 1.0 m) in the vestibule, rising `CEILING_HEIGHT` (3.2 m) per full turn, matching one floor-to-floor gap.
- While the player's horizontal position is within the staircase's radius and their y is between the two floors it connects, `verticalMode` is `'stairs'`: horizontal movement (WASD forward/back) is reprojected onto the helix's tangent direction, and `position.y` advances proportionally to the horizontal distance traveled along the helix (rise/run fixed by the geometry — no separate "climb speed" constant). Stepping off the helix's footprint (radially, e.g. walking sideways off the stairs) returns to `verticalMode: 'flat'` at whatever y the player was at — there's no snapping, since the vestibule floor at both the top and bottom landings is flat and matches the helix's y at those ends by construction.
- This keeps the core collision model (2D circle vs AABB, described below) valid for the other 99% of the space, with the staircase as a self-contained, well-understood exception rather than a general-purpose 3D physics system.

## Collision: capsule vs static AABBs

The generator supplies per-gallery static AABBs (walls incl. vestibule-opening flanks + lintel, shelf bays, tables, shaft railing — doc 04). The active collider set = current gallery + adjacent galleries' (horizontal + vertical) AABBs, swapped by the streaming system; typically < 150 boxes, so brute force is fine (no spatial index in v1).

While `verticalMode === 'flat'` (i.e., not currently on a staircase — the overwhelming majority of movement), the capsule test degenerates to a **2D circle (radius 0.30 m) vs rectangle** test per AABB, using only boxes whose y-range overlaps the player's torso `[position.y - 1.5, position.y + 0.1]` (pre-filtered once per gallery swap, not per frame). While `verticalMode === 'stairs'`, collision only needs to check the helix's own radius bound and the shaft railing (nothing else is reachable mid-staircase by construction — the vestibule is a small, fully-modeled space).

Resolution — iterative push-out (3 iterations), which produces natural wall sliding without explicit velocity projection:

```ts
function collide(pos: Vector3, step: Vector3): Vector3 {
  const p = pos.clone().add(step);
  for (let iter = 0; iter < 3; iter++) {
    for (const box of activeColliders) {
      const cx = clamp(p.x, box.minX, box.maxX);
      const cz = clamp(p.z, box.minZ, box.maxZ);
      const dx = p.x - cx, dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= R * R || d2 === 0) continue;      // d2===0: deep penetration → push along last step dir
      const d = Math.sqrt(d2);
      p.x += (dx / d) * (R - d);
      p.z += (dz / d) * (R - d);
    }
  }
  return p;
}
```

Properties:

- Head-on into a wall: push-out cancels the normal component, tangential motion survives → **slide** (spec scenario).
- Vestibule openings: opening 1.2 m vs capsule diameter 0.6 m leaves 0.3 m clearance per side; flanking AABBs are axis-aligned to the wall segment. Non-axis-aligned hex walls: the generator emits wall colliders as **multiple small axis-aligned boxes approximating the diagonal wall** (a "staircase" box approximation, 0.2 m steps — an unrelated use of the word "staircase" from the real spiral staircase described above) — cheap, robust, invisible at capsule scale. (Alternative — oriented boxes — rejected for v1 complexity.)
- Deep-penetration fallback (spawning inside geometry, `d2 === 0`): push opposite to `step`; the determinism tests assert the spawn point is clear anyway.

## Gallery tracking

After movement, `playerGallery` = nearest gallery whose `(q, r, floor)` hex contains the player's horizontal position at the player's current floor-height band — floor-height bands are known upfront from `graph_json` (each floor is a fixed `CEILING_HEIGHT` apart), so the vertical component is a simple banding lookup, not a full 3D point-in-volume test. A change (horizontal, via the vestibule, or vertical, via the staircase reaching the next floor's height band) triggers the streaming update (doc 05) and the collider-set swap. Hysteresis: only switch when the player is ≥ 0.3 m past the vestibule threshold plane (horizontal) or past the floor-height boundary (vertical), avoiding flip-flop.

## Pause overlay

`Esc` in WALKING → browser exits pointer lock → we show the pause/help overlay (controls legend, seed display, "click to continue"). This is the same overlay as first entry (`ENTER_OVERLAY`), with the heading swapped.

## Tuning defaults (single constants module `web/src/controls/constants.ts`)

| Constant | Value |
|---|---|
| `WALK_SPEED` | 3.0 m/s |
| `ACCEL` | 12 s⁻¹ |
| `CAPSULE_RADIUS` | 0.30 m |
| `EYE_HEIGHT` | 1.70 m |
| `PITCH_CLAMP` | ±87° |
| `DT_CAP` | 0.1 s |
| `GALLERY_HYSTERESIS` | 0.3 m |

All *player-feel* constants live in this one module — tuning sessions touch one file. World-geometry values this system also depends on (ceiling height / staircase rise-per-turn, shaft radius, vestibule opening width, hex side) are **not** duplicated here: they come from the generator's `graph_json.config` block at boot (single source of truth is `crates/babel-gen/src/gen/config.rs`; see doc 04 "World constants"), so a compile-time change to the world adapts navigation automatically.

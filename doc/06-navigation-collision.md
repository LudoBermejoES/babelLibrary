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

- State: `position` (camera at eye height 1.70 m), `yaw` from controls, horizontal `velocity`.
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
- No vertical input; y is constant (single-story library, flat floor).

## Collision: capsule vs static AABBs

The generator supplies per-gallery static AABBs (walls incl. doorway flanks + lintel, shelf bays, tables — doc 04). The active collider set = current gallery + adjacent galleries' AABBs, swapped by the streaming system; typically < 150 boxes, so brute force is fine (no spatial index in v1).

Since y is fixed and the player is upright, the capsule test degenerates to a **2D circle (radius 0.30 m) vs rectangle** test per AABB, using only boxes whose y-range overlaps the player's torso `[position.y - 1.5, position.y + 0.1]` (pre-filtered once per gallery swap, not per frame).

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
- Doorways: opening 1.2 m vs capsule diameter 0.6 m leaves 0.3 m clearance per side; flanking AABBs are axis-aligned to the wall segment. Non-axis-aligned hex walls: the generator emits wall colliders as **multiple small axis-aligned boxes approximating the diagonal wall** (staircase, 0.2 m steps) — cheap, robust, invisible at capsule scale. (Alternative — oriented boxes — rejected for v1 complexity.)
- Deep-penetration fallback (spawning inside geometry, `d2 === 0`): push opposite to `step`; the determinism tests assert the spawn point is clear anyway.

## Gallery tracking

After movement, `playerGallery` = nearest gallery center within its hex (point-in-hex test from `graph_json`). A change triggers the streaming update (doc 05) and the collider-set swap. Hysteresis: only switch when the player is ≥ 0.3 m past the doorway plane, avoiding flip-flop on the boundary.

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

All movement/collision constants live in this one module — tuning sessions touch one file.

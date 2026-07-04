import { CAPSULE_RADIUS } from './constants';

/** `[minX, minY, minZ, maxX, maxY, maxZ]` — a static collider AABB (doc 04 buffer layout). */
export type Aabb = [number, number, number, number, number, number];

/** Decodes a flat stride-6 AABB buffer (doc 04) into `Aabb` tuples, appending to `out`. Shared decoder so collision, railing visuals, and the streamer agree on the record shape. */
export function appendAabbs(out: Aabb[], buffer: Float32Array): void {
  for (let i = 0; i + 6 <= buffer.length; i += 6) {
    out.push([buffer[i]!, buffer[i + 1]!, buffer[i + 2]!, buffer[i + 3]!, buffer[i + 4]!, buffer[i + 5]!]);
  }
}

const ITERATIONS = 3;

/**
 * Resolves `pos + step` against `colliders` via iterative push-out
 * (doc 06 "Collision: capsule vs static AABBs"). While `verticalMode ===
 * 'flat'` the capsule test degenerates to a 2D circle (radius
 * `CAPSULE_RADIUS`) vs rectangle test in the XZ plane — only colliders
 * whose Y-range overlaps the player's torso band participate. Produces
 * natural wall sliding: the push-out cancels the wall-normal velocity
 * component while leaving the tangential component untouched, with no
 * explicit velocity projection needed.
 */
export function collide(
  pos: readonly [number, number, number],
  step: readonly [number, number, number],
  colliders: readonly Aabb[],
): [number, number, number] {
  const [px, py, pz] = pos;
  const [sx, sy, sz] = step;
  let x = px + sx;
  const y = py + sy;
  let z = pz + sz;

  const torsoMin = py - 1.5;
  const torsoMax = py + 0.1;
  const active = colliders.filter(([, minY, , , maxY]) => maxY >= torsoMin && minY <= torsoMax);

  const stepLength = Math.hypot(sx, sz);
  const fallbackDirX = stepLength > 0 ? -sx / stepLength : 0;
  const fallbackDirZ = stepLength > 0 ? -sz / stepLength : 0;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    for (const [minX, , minZ, maxX, , maxZ] of active) {
      const cx = clamp(x, minX, maxX);
      const cz = clamp(z, minZ, maxZ);
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= CAPSULE_RADIUS * CAPSULE_RADIUS) continue;

      if (d2 === 0) {
        // Deep penetration (e.g. spawned inside geometry): push opposite
        // the intended step direction rather than dividing by zero.
        x += fallbackDirX * CAPSULE_RADIUS;
        z += fallbackDirZ * CAPSULE_RADIUS;
        continue;
      }

      const d = Math.sqrt(d2);
      x += (dx / d) * (CAPSULE_RADIUS - d);
      z += (dz / d) * (CAPSULE_RADIUS - d);
    }
  }

  return [x, y, z];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

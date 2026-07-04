import { describe, expect, it } from 'vitest';
import { collide, type Aabb } from '../src/controls/collide';
import { CAPSULE_RADIUS } from '../src/controls/constants';

describe('collide', () => {
  it('leaves the position unchanged when there are no colliders', () => {
    const pos: [number, number, number] = [0, 1.7, 0];
    const step: [number, number, number] = [0.1, 0, 0];
    const result = collide(pos, step, []);
    expect(result[0]).toBeCloseTo(0.1);
    expect(result[2]).toBeCloseTo(0);
  });

  it('blocks head-on movement into a wall but allows tangential sliding', () => {
    // A wall running along Z at x=1, spanning z in [-5, 5], with a y-range
    // that overlaps the player.
    const wall: Aabb = [0.9, 0, -5, 1.1, 3, 5];

    // Walking straight into the wall (toward +x) over many realistic
    // per-frame steps (max ~0.3 m/frame at WALK_SPEED * DT_CAP): should
    // stop short of it, never tunnel through.
    let pos: [number, number, number] = [0.5, 1.7, 0];
    for (let i = 0; i < 20; i++) {
      pos = collide(pos, [0.05, 0, 0], [wall]);
    }
    expect(pos[0]).toBeLessThan(0.9 - CAPSULE_RADIUS + 0.01);

    // Walking along the wall (parallel, +z): should NOT be blocked.
    let alongPos: [number, number, number] = [0.5, 1.7, 0];
    for (let i = 0; i < 20; i++) {
      alongPos = collide(alongPos, [0, 0, 0.05], [wall]);
    }
    expect(alongPos[2]).toBeCloseTo(1.0, 1);
  });

  it('passes a 1.2 m vestibule opening (two flanking boxes) at multiple approach angles', () => {
    // Two flanking boxes around a 1.2 m gap centered at x=0, wall at z=1.
    const flankLeft: Aabb = [-3, 0, 0.9, -0.6, 3, 1.1];
    const flankRight: Aabb = [0.6, 0, 0.9, 3, 3, 1.1];
    const colliders = [flankLeft, flankRight];

    const approachAngles = [0, 0.2, -0.2, 0.4, -0.4]; // radians off straight-through
    for (const angle of approachAngles) {
      let pos: [number, number, number] = [0, 1.7, -1];
      const dx = Math.sin(angle) * 0.05;
      const dz = Math.cos(angle) * 0.05;
      // Steep angles slide along a flank's face before clearing its corner
      // (correct behavior — doc 06 requires sliding, not stopping dead —
      // just slower progress than a head-on approach), so budget enough
      // steps for the steepest angle tested here to actually get through.
      for (let i = 0; i < 250; i++) {
        pos = collide(pos, [dx, 0, dz], colliders);
      }
      // The real spec requirement (doc 06 "Passing a vestibule opening"):
      // the player is not permanently snagged on the door frame — they
      // reach the far side within a bounded number of steps.
      expect(pos[2]).toBeGreaterThan(1.1);
      // Never actually inside either flank's collider (would mean tunneling
      // through solid geometry rather than sliding around it).
      for (const [minX, , minZ, maxX, , maxZ] of colliders) {
        const inside = pos[0] > minX && pos[0] < maxX && pos[2] > minZ && pos[2] < maxZ;
        expect(inside).toBe(false);
      }
    }
  });

  it('falls back to pushing opposite the step direction on deep penetration (spawned inside geometry)', () => {
    const box: Aabb = [-5, 0, -5, 5, 3, 5]; // large box; naive step lands deep inside it
    const pos: [number, number, number] = [0, 1.7, 0];
    const step: [number, number, number] = [1, 0, 0];
    const naiveResultX = pos[0] + step[0];
    const result = collide(pos, step, [box]);
    // Deep-penetration fallback pushes opposite `step` — the resolved
    // position must be corrected back toward the start, not left at (or
    // past) the naive unclamped step target.
    expect(result[0]).toBeLessThan(naiveResultX);
  });

  it('only tests colliders whose y-range overlaps the player torso band', () => {
    // A box far below the player's feet must not block movement.
    const farBelow: Aabb = [0.5, -10, -5, 1.5, -9, 5];
    const pos: [number, number, number] = [0, 1.7, 0];
    const result = collide(pos, [1.0, 0, 0], [farBelow]);
    expect(result[0]).toBeCloseTo(1.0);
  });
});

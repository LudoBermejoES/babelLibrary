import { describe, expect, it } from 'vitest';
import { integrateVelocity, worldStepFromYaw } from '../src/controls/movement';
import { ACCEL, DT_CAP, WALK_SPEED } from '../src/controls/constants';

describe('integrateVelocity', () => {
  it('moves the same distance at 30 FPS and 120 FPS within 5% (frame-rate independence)', () => {
    const wishVelocity: [number, number] = [0, WALK_SPEED]; // straight forward

    let velocity30: [number, number] = [0, 0];
    let distance30 = 0;
    const dt30 = 1 / 30;
    for (let i = 0; i < 30 * 2; i++) {
      velocity30 = integrateVelocity(velocity30, wishVelocity, dt30);
      distance30 += Math.hypot(velocity30[0], velocity30[1]) * dt30;
    }

    let velocity120: [number, number] = [0, 0];
    let distance120 = 0;
    const dt120 = 1 / 120;
    for (let i = 0; i < 120 * 2; i++) {
      velocity120 = integrateVelocity(velocity120, wishVelocity, dt120);
      distance120 += Math.hypot(velocity120[0], velocity120[1]) * dt120;
    }

    const ratio = distance30 / distance120;
    expect(ratio).toBeGreaterThan(0.95);
    expect(ratio).toBeLessThan(1.05);
  });

  it('caps dt at DT_CAP so a tab-switch stall does not produce a huge single step', () => {
    const wishVelocity: [number, number] = [0, WALK_SPEED];
    const hugeDt = 5; // e.g. tab was backgrounded for 5s
    const velocity = integrateVelocity([0, 0], wishVelocity, hugeDt);
    // With dt capped at DT_CAP, velocity should not have fully snapped to
    // wishVelocity in one step the way an uncapped exponential-smoothing
    // step this large effectively would.
    const kAtCap = 1 - Math.exp(-ACCEL * DT_CAP);
    expect(velocity[1]).toBeCloseTo(WALK_SPEED * kAtCap, 3);
  });

  it('approaches wishVelocity asymptotically but never overshoots it', () => {
    const wishVelocity: [number, number] = [WALK_SPEED, 0];
    let velocity: [number, number] = [0, 0];
    for (let i = 0; i < 100; i++) {
      velocity = integrateVelocity(velocity, wishVelocity, 1 / 60);
      expect(velocity[0]).toBeLessThanOrEqual(WALK_SPEED + 1e-6);
    }
    expect(velocity[0]).toBeCloseTo(WALK_SPEED, 2);
  });

  it('normalizes diagonal input so diagonals are not faster than cardinal directions', () => {
    // A raw diagonal wish direction (1,1) normalized to WALK_SPEED length.
    const rawDiagonal: [number, number] = [1, 1];
    const length = Math.hypot(rawDiagonal[0], rawDiagonal[1]);
    const wishVelocity: [number, number] = [
      (rawDiagonal[0] / length) * WALK_SPEED,
      (rawDiagonal[1] / length) * WALK_SPEED,
    ];
    let velocity: [number, number] = [0, 0];
    for (let i = 0; i < 200; i++) {
      velocity = integrateVelocity(velocity, wishVelocity, 1 / 60);
    }
    const speed = Math.hypot(velocity[0], velocity[1]);
    expect(speed).toBeCloseTo(WALK_SPEED, 1);
  });
});

describe('worldStepFromYaw', () => {
  // yaw convention: yaw = atan2(forward.x, forward.z), i.e. forward = (sin yaw, cos yaw) in (x, z).
  it('facing -Z (yaw = PI): forward W moves toward -Z, strafe D moves toward +X (camera right)', () => {
    const yaw = Math.PI; // camera forward = (0, -1) = -Z
    const forwardStep = worldStepFromYaw(yaw, 0, 1, 1);
    expect(forwardStep[0]).toBeCloseTo(0);
    expect(forwardStep[2]).toBeCloseTo(-1);

    const strafeStep = worldStepFromYaw(yaw, 1, 0, 1);
    // Facing -Z, the camera's right hand points toward +X.
    expect(strafeStep[0]).toBeCloseTo(1);
    expect(strafeStep[2]).toBeCloseTo(0);
  });

  it('facing +X (yaw = PI/2): strafe D moves toward +Z (camera right = forward x up)', () => {
    const yaw = Math.PI / 2; // forward = (1, 0) = +X
    const strafeStep = worldStepFromYaw(yaw, 1, 0, 1);
    // right = forward x up: (1,0,0) x (0,1,0) = (0,0,1) = +Z — consistent
    // with the canonical case (facing -Z, right = +X) the first test pins.
    expect(strafeStep[0]).toBeCloseTo(0);
    expect(strafeStep[2]).toBeCloseTo(1);
  });

  it('scales by dt and keeps y at zero (no flying)', () => {
    const step = worldStepFromYaw(0, 0, 2, 0.5);
    expect(step[1]).toBe(0);
    expect(Math.hypot(step[0], step[2])).toBeCloseTo(1);
  });
});

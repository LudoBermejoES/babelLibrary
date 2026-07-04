import { describe, expect, it } from 'vitest';
import { integrateVelocity } from '../src/controls/movement';
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

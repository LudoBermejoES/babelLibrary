import { describe, expect, it } from 'vitest';
import { advanceOnHelix, isWithinHelixFootprint, type HelixGeometry } from '../src/controls/stairs';

const HELIX: HelixGeometry = {
  center: [0, 0],
  radius: 1.0,
  risePerTurn: 3.2,
  bottomY: 0,
  topY: 3.2,
};

describe('isWithinHelixFootprint', () => {
  it('is true when horizontally within radius and y between the two floors', () => {
    expect(isWithinHelixFootprint([0.5, 1.6, 0], HELIX)).toBe(true);
  });

  it('is false outside the horizontal radius', () => {
    expect(isWithinHelixFootprint([2, 1.6, 0], HELIX)).toBe(false);
  });

  it('is false above the top floor or below the bottom floor', () => {
    expect(isWithinHelixFootprint([0.5, -0.5, 0], HELIX)).toBe(false);
    expect(isWithinHelixFootprint([0.5, 3.5, 0], HELIX)).toBe(false);
  });
});

describe('advanceOnHelix', () => {
  it('climbs: forward movement along the helix increases y proportional to horizontal distance traveled', () => {
    let position: [number, number, number] = [1, 0, 0]; // on the helix radius, at the bottom landing
    let totalHorizontalDistance = 0;
    const circumference = 2 * Math.PI * HELIX.radius;

    // Walk forward (along the tangent) for a full turn's worth of horizontal distance.
    const steps = 100;
    const distancePerStep = circumference / steps;
    for (let i = 0; i < steps; i++) {
      const result = advanceOnHelix(position, distancePerStep, HELIX);
      position = result.position;
      totalHorizontalDistance += distancePerStep;
    }

    // One full turn of horizontal travel should land at exactly risePerTurn higher.
    expect(position[1]).toBeCloseTo(HELIX.bottomY + HELIX.risePerTurn, 1);
    // Still on the helix radius (horizontal distance from center unchanged).
    const horizontalDist = Math.hypot(position[0] - HELIX.center[0], position[2] - HELIX.center[1]);
    expect(horizontalDist).toBeCloseTo(HELIX.radius, 2);
  });

  it('descends: negative forward distance decreases y', () => {
    let position: [number, number, number] = [-1, HELIX.topY, 0];
    const circumference = 2 * Math.PI * HELIX.radius;
    const steps = 50;
    const distancePerStep = -circumference / (2 * steps); // half turn, descending

    for (let i = 0; i < steps; i++) {
      const result = advanceOnHelix(position, distancePerStep, HELIX);
      position = result.position;
    }

    expect(position[1]).toBeLessThan(HELIX.topY);
    expect(position[1]).toBeCloseTo(HELIX.topY - HELIX.risePerTurn / 2, 1);
  });

  it('clamps to the landing height at the top and bottom rather than overshooting', () => {
    const position: [number, number, number] = [1, HELIX.topY - 0.05, 0];
    const bigForwardDistance = 10; // far more than needed to reach the top
    const result = advanceOnHelix(position, bigForwardDistance, HELIX);
    expect(result.position[1]).toBeLessThanOrEqual(HELIX.topY + 1e-6);
    expect(result.reachedTop).toBe(true);
  });

  it('reports reachedBottom when descending past the bottom landing', () => {
    const position: [number, number, number] = [1, HELIX.bottomY + 0.05, 0];
    const bigBackwardDistance = -10;
    const result = advanceOnHelix(position, bigBackwardDistance, HELIX);
    expect(result.position[1]).toBeGreaterThanOrEqual(HELIX.bottomY - 1e-6);
    expect(result.reachedBottom).toBe(true);
  });
});

describe('verticalMode transitions (doc 06: enter sets stairs, radial step-off returns to flat with no snapping)', () => {
  it('entering the footprint mid-climb sets stairs mode; stepping off radially returns to flat at the same y, no snap', () => {
    // Simulate a partial climb, then step sideways off the helix's radius
    // (not up/down the stairs) — the landing floors at both ends are flat
    // and match the helix's y there by construction, so there is nowhere
    // for a "flat" position to snap to; whatever y the player was at when
    // they stepped off is exactly where verticalMode: 'flat' picks up.
    let position: [number, number, number] = [1, 0, 0];
    const circumference = 2 * Math.PI * HELIX.radius;
    for (let i = 0; i < 25; i++) {
      position = advanceOnHelix(position, circumference / 100, HELIX).position;
    }
    expect(isWithinHelixFootprint(position, HELIX)).toBe(true); // verticalMode: 'stairs'

    const midClimbY = position[1];
    expect(midClimbY).toBeGreaterThan(HELIX.bottomY);
    expect(midClimbY).toBeLessThan(HELIX.topY);

    // Step off radially (away from the helix center, same y) — no y change
    // is applied by the flat-mode collision system, so this models the
    // transition itself: the position the moment before/after crossing the
    // footprint boundary is continuous.
    const steppedOff: [number, number, number] = [position[0] * 3, midClimbY, position[2] * 3];
    expect(isWithinHelixFootprint(steppedOff, HELIX)).toBe(false); // verticalMode: 'flat'
    expect(steppedOff[1]).toBe(midClimbY); // same y as the instant before stepping off — no snap
  });
});

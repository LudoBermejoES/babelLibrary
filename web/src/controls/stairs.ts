/**
 * Parametric spiral-staircase geometry (doc 06 "Vertical movement: the
 * spiral staircase") — a fixed-radius cylinder rising `risePerTurn` per
 * full turn, connecting `bottomY` to `topY` (exactly one floor's worth of
 * rise). `center` is the helix's horizontal (x, z) center — the vestibule
 * position, world-space.
 */
export interface HelixGeometry {
  center: [number, number];
  radius: number;
  risePerTurn: number;
  bottomY: number;
  topY: number;
}

/** True while the player's horizontal position is within the helix's radius and their y is between the two floors it connects — the condition for `verticalMode: 'stairs'` (doc 06). */
export function isWithinHelixFootprint(position: readonly [number, number, number], helix: HelixGeometry): boolean {
  const [x, y, z] = position;
  const dx = x - helix.center[0];
  const dz = z - helix.center[1];
  const horizontalDist = Math.hypot(dx, dz);
  return horizontalDist <= helix.radius && y >= helix.bottomY && y <= helix.topY;
}

export interface HelixAdvanceResult {
  position: [number, number, number];
  reachedTop: boolean;
  reachedBottom: boolean;
}

/**
 * Reprojects `forwardDistance` (signed arc-length along the helix tangent;
 * positive = climbing, negative = descending) onto the helix, advancing
 * both the horizontal angle and `y` together — rise is proportional to
 * horizontal distance traveled, with no separate "climb speed" constant
 * (doc 06). Clamps to the landing height at either end rather than
 * overshooting past `topY`/`bottomY`.
 */
export function advanceOnHelix(
  position: readonly [number, number, number],
  forwardDistance: number,
  helix: HelixGeometry,
): HelixAdvanceResult {
  const [x, y, z] = position;
  const dx = x - helix.center[0];
  const dz = z - helix.center[1];
  const currentAngle = Math.atan2(dz, dx);

  const deltaAngle = forwardDistance / helix.radius;
  const deltaY = (forwardDistance * helix.risePerTurn) / (2 * Math.PI * helix.radius);

  const newAngle = currentAngle + deltaAngle;
  let newY = y + deltaY;

  let reachedTop = false;
  let reachedBottom = false;
  if (newY >= helix.topY) {
    newY = helix.topY;
    reachedTop = true;
  } else if (newY <= helix.bottomY) {
    newY = helix.bottomY;
    reachedBottom = true;
  }

  const newX = helix.center[0] + helix.radius * Math.cos(newAngle);
  const newZ = helix.center[1] + helix.radius * Math.sin(newAngle);

  return { position: [newX, newY, newZ], reachedTop, reachedBottom };
}

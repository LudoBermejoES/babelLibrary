import { ACCEL, DT_CAP } from './constants';

/**
 * Frame-rate-independent exponential smoothing toward `wishVelocity`
 * (doc 06 "Movement"): `velocity.lerp(wishVelocity, 1 - exp(-ACCEL*dt))`.
 * The exponential form guarantees equal travel distance regardless of
 * frame rate — a linear `velocity += accel * dt` step does not.
 */
export function integrateVelocity(
  velocity: readonly [number, number],
  wishVelocity: readonly [number, number],
  dt: number,
): [number, number] {
  const clampedDt = Math.min(dt, DT_CAP);
  const k = 1 - Math.exp(-ACCEL * clampedDt);
  return [velocity[0] + (wishVelocity[0] - velocity[0]) * k, velocity[1] + (wishVelocity[1] - velocity[1]) * k];
}

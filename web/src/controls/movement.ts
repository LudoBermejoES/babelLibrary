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

/**
 * Converts camera-relative (strafe, forward) velocity into a world-space
 * XZ step for one frame. Yaw convention: `yaw = atan2(forward.x,
 * forward.z)`, i.e. camera forward = (sin yaw, cos yaw) in (x, z); the
 * camera's right hand (forward × up, right-handed Y-up) is then
 * (-cos yaw, sin yaw). Pitch is ignored — no flying (doc 06). Pure and
 * unit-tested: this mapping shipped inverted once (D moved left) because
 * it lived untested inside the controller.
 */
export function worldStepFromYaw(
  yaw: number,
  strafeVelocity: number,
  forwardVelocity: number,
  dt: number,
): [number, number, number] {
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const worldX = forwardVelocity * sin - strafeVelocity * cos;
  const worldZ = forwardVelocity * cos + strafeVelocity * sin;
  return [worldX * dt, 0, worldZ * dt];
}

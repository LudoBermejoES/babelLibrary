/**
 * Player-feel constants (doc 06 "Tuning defaults"). World-geometry values
 * this system depends on (ceiling height, shaft radius, vestibule opening
 * width, hex side) are NOT duplicated here — they come from the generator's
 * `graph_json.config` block at boot (single source of truth is
 * `crates/babel-gen/src/gen/config.rs`).
 */
export const WALK_SPEED = 3.0; // m/s
export const ACCEL = 12; // 1/s
export const CAPSULE_RADIUS = 0.3; // m
export const EYE_HEIGHT = 1.7; // m
export const PITCH_CLAMP = (87 * Math.PI) / 180; // radians
export const DT_CAP = 0.1; // s
export const GALLERY_HYSTERESIS = 0.3; // m

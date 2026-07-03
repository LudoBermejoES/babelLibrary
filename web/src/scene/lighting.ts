import * as THREE from 'three';

/** Warm base ambient so nothing is pitch black (spec: all traversable areas readable) while staying true to Borges' "insufficient" light. Added once, scene-global. */
export function createAmbientLight(): THREE.AmbientLight {
  return new THREE.AmbientLight(0xfff2e0, 0.35);
}

/** Depth cue through vestibule openings and the shaft; also explains why "endless" floors above/below fade to darkness rather than needing to render arbitrarily far (doc 05). */
export function createFog(): THREE.FogExp2 {
  return new THREE.FogExp2(0x14100c, 0.045);
}

/** World-space positions of every lamp-kind (`kind === 1`) record in a `prop_transforms` buffer (`[kind, m0..m15]`, 17 f32 per doc 04). */
export function lampWorldPositions(propTransforms: Float32Array): Array<[number, number, number]> {
  const positions: Array<[number, number, number]> = [];
  const matrix = new THREE.Matrix4();
  for (let i = 0; i + 17 <= propTransforms.length; i += 17) {
    if (propTransforms[i] !== 1) continue;
    matrix.fromArray(propTransforms, i + 1);
    const position = new THREE.Vector3().setFromMatrixPosition(matrix);
    positions.push([position.x, position.y, position.z]);
  }
  return positions;
}

/**
 * Exactly `LAMPS_PER_HEX` (2) dim, always-on point lights per gallery, at
 * the lamp prop positions — Borges: "the light they give is insufficient,
 * and unceasing." Deliberately dim; resist brightening for readability at
 * the cost of atmosphere (doc 05) — use the ambient floor light instead.
 * Belongs to a group so it can be added/removed with the gallery (only
 * current + adjacent galleries' lights should ever exist).
 */
export function buildGalleryLights(propTransforms: Float32Array): THREE.Group {
  const group = new THREE.Group();
  group.name = 'lights';

  for (const [x, y, z] of lampWorldPositions(propTransforms)) {
    const light = new THREE.PointLight(0xffd9a0, 8, 10, 2);
    light.position.set(x, y, z);
    group.add(light);
  }

  return group;
}

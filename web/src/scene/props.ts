import * as THREE from 'three';

/**
 * `prop_transforms` record layout (doc 04): `[kind, m0..m15]`, 17 f32 each.
 * `kind` 1 = lamp. Shared here so the instancing, lighting, and any future
 * prop consumer agree on the stride and kind codes — they were duplicated
 * across three loops in two files, so a kind renumbering in the Rust emitter
 * risked lamps with no light or lights with no fixture.
 */
export const PROP_STRIDE = 17;
export const LAMP_KIND = 1;

/** Calls `cb` with a reused `Matrix4` (the record's transform) for each prop of `kind`. The matrix is reused between calls — copy it if you need to retain it. */
export function forEachProp(
  propTransforms: Float32Array,
  kind: number,
  cb: (matrix: THREE.Matrix4, instanceIndex: number) => void,
): void {
  const matrix = new THREE.Matrix4();
  let instanceIndex = 0;
  for (let i = 0; i + PROP_STRIDE <= propTransforms.length; i += PROP_STRIDE) {
    if (propTransforms[i] !== kind) continue;
    matrix.fromArray(propTransforms, i + 1);
    cb(matrix, instanceIndex);
    instanceIndex++;
  }
}

/** Number of prop records of the given `kind` in the buffer. */
export function countPropsOfKind(propTransforms: Float32Array, kind: number): number {
  let count = 0;
  for (let i = 0; i + PROP_STRIDE <= propTransforms.length; i += PROP_STRIDE) {
    if (propTransforms[i] === kind) count++;
  }
  return count;
}

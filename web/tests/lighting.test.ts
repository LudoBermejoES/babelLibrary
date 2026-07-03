import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildGalleryLights, lampWorldPositions } from '../src/scene/lighting';

function fakePropTransforms(positions: Array<[number, number, number]>): Float32Array {
  const out: number[] = [];
  for (const [x, y, z] of positions) {
    out.push(1); // kind: lamp
    const m = new THREE.Matrix4().makeTranslation(x, y, z);
    out.push(...m.toArray());
  }
  return new Float32Array(out);
}

describe('lampWorldPositions', () => {
  it('extracts one position per lamp-kind record, ignoring other kinds', () => {
    const buffer = fakePropTransforms([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    const positions = lampWorldPositions(buffer);
    expect(positions).toHaveLength(2);
    expect(positions[0]).toEqual([1, 2, 3]);
    expect(positions[1]).toEqual([4, 5, 6]);
  });

  it('skips non-lamp prop records (kind !== 1)', () => {
    const out: number[] = [0, ...new THREE.Matrix4().toArray()]; // kind 0: table
    const positions = lampWorldPositions(new Float32Array(out));
    expect(positions).toHaveLength(0);
  });
});

describe('buildGalleryLights', () => {
  it('creates exactly LAMPS_PER_HEX (2) point lights at the lamp positions, dim per Borges', () => {
    const buffer = fakePropTransforms([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    const group = buildGalleryLights(buffer);

    const lights = group.children.filter((c) => (c as THREE.PointLight).isPointLight) as THREE.PointLight[];
    expect(lights).toHaveLength(2);
    for (const light of lights) {
      expect(light.intensity).toBeGreaterThan(0);
      expect(light.intensity).toBeLessThan(20); // "insufficient" — not a bright fixture
      expect(light.decay).toBeGreaterThan(0);
    }
  });
});

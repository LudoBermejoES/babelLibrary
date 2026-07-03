import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BOOK_ARCHETYPE_COUNT, createAsset } from '../src/scene/assets';

describe('placeholder asset registry', () => {
  it('provides every doc-05 asset kind as a procedural placeholder', () => {
    const kinds = ['shelfBay', 'table', 'lamp', 'mirror', 'closetDoor', 'staircase'] as const;
    for (const kind of kinds) {
      const object = createAsset(kind);
      expect(object).toBeInstanceOf(THREE.Object3D);
    }
  });

  it('provides BOOK_ARCHETYPE_COUNT unit-sized book archetypes', () => {
    expect(BOOK_ARCHETYPE_COUNT).toBe(5);
    for (let i = 0; i < BOOK_ARCHETYPE_COUNT; i++) {
      const book = createAsset('book', i);
      expect(book).toBeInstanceOf(THREE.Object3D);
    }
  });

  it('rejects an out-of-range book archetype index', () => {
    expect(() => createAsset('book', BOOK_ARCHETYPE_COUNT)).toThrow();
  });
});

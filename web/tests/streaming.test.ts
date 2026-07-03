import { describe, expect, it } from 'vitest';
import { neededGallerySet } from '../src/scene/streaming';
import type { LibraryGallery } from '../src/wasm';

function gallery(overrides: Partial<LibraryGallery>): LibraryGallery {
  return {
    index: 0,
    q: 0,
    r: 0,
    floor: 0,
    center: [0, 0, 0],
    horizontalNeighbor: null,
    floorAbove: null,
    floorBelow: null,
    ...overrides,
  };
}

describe('neededGallerySet', () => {
  it('includes only the current gallery when it has no neighbors', () => {
    const galleries = [gallery({ index: 0 })];
    expect(neededGallerySet(galleries, 0)).toEqual(new Set([0]));
  });

  it('includes the horizontal neighbor', () => {
    const galleries = [
      gallery({ index: 0, horizontalNeighbor: 1 }),
      gallery({ index: 1, horizontalNeighbor: 0 }),
    ];
    expect(neededGallerySet(galleries, 0)).toEqual(new Set([0, 1]));
  });

  it('includes floor-above and floor-below neighbors', () => {
    const galleries = [
      gallery({ index: 0, floorAbove: 1, floorBelow: 2 }),
      gallery({ index: 1, floorBelow: 0 }),
      gallery({ index: 2, floorAbove: 0 }),
    ];
    expect(neededGallerySet(galleries, 0)).toEqual(new Set([0, 1, 2]));
  });

  it('combines horizontal and vertical neighbors', () => {
    const galleries = [
      gallery({ index: 0, horizontalNeighbor: 1, floorAbove: 2 }),
      gallery({ index: 1, horizontalNeighbor: 0 }),
      gallery({ index: 2, floorBelow: 0 }),
    ];
    expect(neededGallerySet(galleries, 0)).toEqual(new Set([0, 1, 2]));
  });
});

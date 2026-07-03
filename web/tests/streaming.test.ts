import { describe, expect, it } from 'vitest';
import { neededGalleryMembership } from '../src/scene/streaming';
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

describe('neededGalleryMembership', () => {
  it('includes only the current gallery (full) when it has no neighbors', () => {
    const galleries = [gallery({ index: 0 })];
    const membership = neededGalleryMembership(galleries, 0);
    expect(membership.full).toEqual(new Set([0]));
    expect(membership.glimpse).toEqual(new Set());
  });

  it('treats the horizontal neighbor as full (walkable through the vestibule)', () => {
    const galleries = [
      gallery({ index: 0, horizontalNeighbor: 1 }),
      gallery({ index: 1, horizontalNeighbor: 0 }),
    ];
    const membership = neededGalleryMembership(galleries, 0);
    expect(membership.full).toEqual(new Set([0, 1]));
    expect(membership.glimpse).toEqual(new Set());
  });

  it('treats floor-above/floor-below neighbors as glimpse-only (shaft-visible, not walked into yet)', () => {
    const galleries = [
      gallery({ index: 0, floorAbove: 1, floorBelow: 2 }),
      gallery({ index: 1, floorBelow: 0 }),
      gallery({ index: 2, floorAbove: 0 }),
    ];
    const membership = neededGalleryMembership(galleries, 0);
    expect(membership.full).toEqual(new Set([0]));
    expect(membership.glimpse).toEqual(new Set([1, 2]));
  });

  it('combines a full horizontal neighbor with glimpse-only vertical neighbors', () => {
    const galleries = [
      gallery({ index: 0, horizontalNeighbor: 1, floorAbove: 2 }),
      gallery({ index: 1, horizontalNeighbor: 0 }),
      gallery({ index: 2, floorBelow: 0 }),
    ];
    const membership = neededGalleryMembership(galleries, 0);
    expect(membership.full).toEqual(new Set([0, 1]));
    expect(membership.glimpse).toEqual(new Set([2]));
  });

  it('never puts the same gallery in both full and glimpse sets', () => {
    // A gallery could in principle be both the horizontal neighbor of one
    // gallery and a vertical neighbor's target in a denser graph; full
    // always wins since a fully-built gallery already shows through the
    // shaft (no need for a redundant glimpse).
    const galleries = [
      gallery({ index: 0, horizontalNeighbor: 1, floorAbove: 1 }),
      gallery({ index: 1, horizontalNeighbor: 0, floorBelow: 0 }),
    ];
    const membership = neededGalleryMembership(galleries, 0);
    expect(membership.full).toEqual(new Set([0, 1]));
    expect(membership.glimpse).toEqual(new Set());
  });
});

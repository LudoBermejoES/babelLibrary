import { describe, expect, it } from 'vitest';
import { trackGallery, type TrackedGallery } from '../src/controls/gallery-tracking';
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

const CEILING_HEIGHT = 3.2;
const HEX_SIDE = 4.0;

describe('trackGallery', () => {
  it('stays on the current gallery when the player has not crossed the hysteresis threshold', () => {
    const galleries = [
      gallery({ index: 0, center: [0, 0, 0], horizontalNeighbor: 1 }),
      gallery({ index: 1, center: [HEX_SIDE * 1.5, 0, 0], horizontalNeighbor: 0 }),
    ];
    const current: TrackedGallery = { index: 0, floor: 0 };
    // Just barely across the midpoint but within the 0.3 m hysteresis band.
    const midpointX = HEX_SIDE * 1.5 * 0.5;
    const position: [number, number, number] = [midpointX + 0.1, 1.7, 0];
    const result = trackGallery(position, current, galleries, CEILING_HEIGHT);
    expect(result.index).toBe(0);
  });

  it('switches to the horizontal neighbor once past the hysteresis threshold', () => {
    const galleries = [
      gallery({ index: 0, center: [0, 0, 0], horizontalNeighbor: 1 }),
      gallery({ index: 1, center: [HEX_SIDE * 1.5, 0, 0], horizontalNeighbor: 0 }),
    ];
    const current: TrackedGallery = { index: 0, floor: 0 };
    // Clearly closer to gallery 1's center now.
    const position: [number, number, number] = [HEX_SIDE * 1.5 - 0.1, 1.7, 0];
    const result = trackGallery(position, current, galleries, CEILING_HEIGHT);
    expect(result.index).toBe(1);
  });

  it('switches floor via the height band once the player is well past the floor boundary', () => {
    const galleries = [
      gallery({ index: 0, center: [0, 0, 0], floor: 0, floorAbove: 1 }),
      gallery({ index: 1, center: [0, CEILING_HEIGHT, 0], floor: 1, floorBelow: 0 }),
    ];
    const current: TrackedGallery = { index: 0, floor: 0 };
    const position: [number, number, number] = [0, CEILING_HEIGHT + 1.7, 0];
    const result = trackGallery(position, current, galleries, CEILING_HEIGHT);
    expect(result.index).toBe(1);
  });

  it('does not flip-flop for a position within the hysteresis band of a floor boundary', () => {
    const galleries = [
      gallery({ index: 0, center: [0, 0, 0], floor: 0, floorAbove: 1 }),
      gallery({ index: 1, center: [0, CEILING_HEIGHT, 0], floor: 1, floorBelow: 0 }),
    ];
    const current: TrackedGallery = { index: 0, floor: 0 };
    // Just above the floor boundary but within the hysteresis band.
    const position: [number, number, number] = [0, CEILING_HEIGHT + 0.1, 0];
    const result = trackGallery(position, current, galleries, CEILING_HEIGHT);
    expect(result.index).toBe(0);
  });
});

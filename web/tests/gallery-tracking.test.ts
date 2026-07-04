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
    vestibuleDirection: 0,
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

  it('switches back to the reverse horizontal neighbor in a directed ring (walking back the way you came)', () => {
    // One-way ring 0->1->2->0. Standing in gallery 1 (whose own neighbor is
    // 2), walk back toward gallery 0's center. Gallery 0 points at 1, so the
    // shared doorway is walkable both ways — tracking must flip back to 0.
    const galleries = [
      gallery({ index: 0, center: [0, 0, 0], horizontalNeighbor: 1 }),
      gallery({ index: 1, center: [HEX_SIDE * 1.5, 0, 0], horizontalNeighbor: 2 }),
      gallery({ index: 2, center: [HEX_SIDE * 3, 0, 0], horizontalNeighbor: 0 }),
    ];
    const current: TrackedGallery = { index: 1, floor: 0 };
    const position: [number, number, number] = [0.1, 1.7, 0]; // essentially at gallery 0's center
    const result = trackGallery(position, current, galleries, CEILING_HEIGHT);
    expect(result.index).toBe(0);
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

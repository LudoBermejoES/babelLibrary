import type { LibraryGallery } from '../wasm';
import { GALLERY_HYSTERESIS } from './constants';

export interface TrackedGallery {
  index: number;
  floor: number;
}

/**
 * Determines which gallery the player is "in" after moving (doc 06
 * "Gallery tracking"): nearest gallery whose `(q, r, floor)` hex contains
 * the player's horizontal position at the player's current floor-height
 * band. Floor-height bands come from `ceilingHeight` (each floor is a
 * fixed `ceilingHeight` apart), so the vertical component is a banding
 * lookup, not a full 3D point-in-volume test.
 *
 * Hysteresis: only switches once the player is >= `GALLERY_HYSTERESIS`
 * past the boundary (horizontal: past the midpoint toward a neighbor;
 * vertical: past the floor-height boundary) — avoids flip-flop right at a
 * vestibule threshold or floor line.
 */
export function trackGallery(
  position: readonly [number, number, number],
  current: TrackedGallery,
  galleries: readonly LibraryGallery[],
  ceilingHeight: number,
): TrackedGallery {
  const currentGallery = galleries[current.index];
  if (!currentGallery) return current;

  let candidateFloor = current.floor;
  const upperBoundaryY = current.floor * ceilingHeight + ceilingHeight;
  const lowerBoundaryY = current.floor * ceilingHeight;
  if (position[1] - upperBoundaryY >= GALLERY_HYSTERESIS) {
    candidateFloor = current.floor + 1;
  } else if (lowerBoundaryY - position[1] >= GALLERY_HYSTERESIS) {
    candidateFloor = current.floor - 1;
  }

  if (candidateFloor !== current.floor) {
    const neighborIndex = candidateFloor > current.floor ? currentGallery.floorAbove : currentGallery.floorBelow;
    if (neighborIndex !== null) {
      return { index: neighborIndex, floor: candidateFloor };
    }
  }

  // Horizontal: only the current gallery and its one horizontal neighbor
  // are ever candidates (each hexagon has at most one horizontal
  // neighbor — doc 04) — compare distance-to-center with hysteresis
  // rather than a full nearest-of-all-galleries search.
  if (currentGallery.horizontalNeighbor !== null) {
    const neighbor = galleries[currentGallery.horizontalNeighbor];
    if (neighbor) {
      const distToCurrent = Math.hypot(position[0] - currentGallery.center[0], position[2] - currentGallery.center[2]);
      const distToNeighbor = Math.hypot(position[0] - neighbor.center[0], position[2] - neighbor.center[2]);
      if (distToNeighbor + GALLERY_HYSTERESIS < distToCurrent) {
        return { index: neighbor.index, floor: current.floor };
      }
    }
  }

  return current;
}

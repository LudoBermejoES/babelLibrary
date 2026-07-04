import type { LibraryGallery } from '../wasm';
import { horizontalNeighborsOf } from '../graph';
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

  // Horizontal: candidates are BOTH horizontal neighbors — the current
  // gallery's forward edge and any gallery whose forward edge points at it
  // (the directed ring is walkable both ways; see horizontalNeighborsOf).
  // Switch to the nearest neighbor that is closer than the current gallery
  // by more than the hysteresis margin, so walking back the way you came
  // re-tracks instead of leaving you in a disposed gallery.
  const distToCurrent = Math.hypot(position[0] - currentGallery.center[0], position[2] - currentGallery.center[2]);
  let best: { index: number; dist: number } | null = null;
  for (const neighborIndex of horizontalNeighborsOf(galleries, current.index)) {
    const neighbor = galleries[neighborIndex];
    if (!neighbor) continue;
    const dist = Math.hypot(position[0] - neighbor.center[0], position[2] - neighbor.center[2]);
    if (dist + GALLERY_HYSTERESIS < distToCurrent && (best === null || dist < best.dist)) {
      best = { index: neighborIndex, dist };
    }
  }
  if (best !== null) return { index: best.index, floor: current.floor };

  return current;
}

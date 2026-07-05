import type { LibraryGallery } from './wasm';

/**
 * Both horizontal neighbors of `currentIndex`: its own forward edge
 * (`horizontalNeighbor`) AND any gallery whose forward edge points at it.
 * The generator builds a *directed* ring (i → i+1, last → first), but every
 * doorway is a shared wall walkable in both directions — so a gallery you
 * can walk into is reachable whether the edge is stored on your side or the
 * neighbor's. Considering only the forward edge is what let a player walk
 * back through a doorway into a disposed, collider-free void.
 *
 * Neutral graph helper (depends on neither scene/ nor controls/) so both
 * the streamer's membership calc and the movement layer's gallery tracking
 * share one definition of "which galleries are horizontally adjacent."
 */
export function horizontalNeighborsOf(galleries: readonly LibraryGallery[], currentIndex: number): number[] {
  const neighbors: number[] = [];
  const forward = galleries[currentIndex]?.horizontalNeighbor;
  if (forward !== null && forward !== undefined) neighbors.push(forward);
  for (const g of galleries) {
    if (g.horizontalNeighbor === currentIndex && !neighbors.includes(g.index)) neighbors.push(g.index);
  }
  return neighbors;
}

/** One end of the vertical visual wrap: the counterpart gallery to glimpse through the shaft, plus how many ceiling-heights to offset its render. */
export interface WrapGlimpse {
  /** Gallery index to render (its own `(q, r)`, a different floor). */
  index: number;
  /** Signed floor delta to apply to the render position: +1 shows it one ceiling-height ABOVE (through the up shaft), −1 one below. */
  floorOffset: 1 | -1;
}

/**
 * Vertical visual wrap (design D8): the library is periodic in the vertical
 * axis too, so the top floor's up-shaft shows floor 0's counterpart and the
 * bottom floor's down-shaft shows the top floor's counterpart — offset by one
 * ceiling height so it reads as "the next floor up/down" rather than a
 * teleport. Returns the wrap glimpses a gallery needs *in addition* to its
 * real `floorAbove`/`floorBelow` neighbors:
 *
 * - `floorAbove === null` (top floor) → glimpse the same `(q, r)` on floor 0,
 *   offset +1 (rendered above).
 * - `floorBelow === null` (floor 0) → glimpse the same `(q, r)` on the top
 *   floor, offset −1 (rendered below).
 *
 * Purely a render-time glimpse: no graph edges, no traversal (vertical wrap is
 * visual-only in v1, a stated non-goal for walking). Empty when the gallery
 * has real neighbors on both sides, or when no counterpart exists at that
 * `(q, r)` on the wrapped floor (that shaft genuinely dead-ends visually, but
 * the counterpart lookup usually succeeds since every floor reuses the same
 * `(q, r)` cycle).
 */
export function verticalWrapGlimpses(galleries: readonly LibraryGallery[], currentIndex: number): WrapGlimpse[] {
  const current = galleries[currentIndex];
  if (!current) return [];

  const floors = galleries.map((g) => g.floor);
  const minFloor = Math.min(...floors);
  const maxFloor = Math.max(...floors);
  if (minFloor === maxFloor) return []; // single floor: nothing to wrap to

  const counterpartOn = (floor: number): number | undefined =>
    galleries.find((g) => g.floor === floor && g.q === current.q && g.r === current.r)?.index;

  const wraps: WrapGlimpse[] = [];
  if (current.floorAbove === null && current.floor === maxFloor) {
    const idx = counterpartOn(minFloor);
    if (idx !== undefined && idx !== currentIndex) wraps.push({ index: idx, floorOffset: 1 });
  }
  if (current.floorBelow === null && current.floor === minFloor) {
    const idx = counterpartOn(maxFloor);
    if (idx !== undefined && idx !== currentIndex) wraps.push({ index: idx, floorOffset: -1 });
  }
  return wraps;
}

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

import * as THREE from 'three';
import type { LibraryConfig, LibraryGallery } from '../wasm';
import { buildFloorAndCeiling } from './hex-shell';

/**
 * Cheap "glimpse" geometry for a shaft-visible neighbor gallery: just the
 * floor/ceiling hex (with the shaft hole), no shelves, books, or vestibule
 * — doc 05 "shaft-visible only" streaming tier. Looking down/up a gallery's
 * shaft reveals this for its floor-below/floor-above counterpart, if one
 * was generated; the `GalleryStreamer` upgrades it to a full build the
 * moment the player actually starts climbing/descending into it.
 *
 * `center` defaults to the gallery's own center but can be overridden so the
 * vertical visual wrap (doc 05 / design D8) can render the wrapped floor's
 * counterpart offset by ±one ceiling height.
 *
 * Deliberately NO shaft well here: the current gallery's own well already
 * spans many floors up and down (hex-shell.SHAFT_WELL_FLOORS), covering every
 * glimpse's shaft. A well per glimpse would be a second cylinder at the same
 * (x, z) and radius, offset by only one floor from the current gallery's — the
 * two coincident DoubleSide surfaces z-fight down the whole shaft.
 */
export function buildShaftGlimpse(
  gallery: LibraryGallery,
  config: LibraryConfig,
  center: readonly [number, number, number] = gallery.center,
): THREE.Group {
  const group = new THREE.Group();
  group.name = `shaft-glimpse-${gallery.index}`;

  const { floor, ceiling } = buildFloorAndCeiling(center, config);
  group.add(floor);
  group.add(ceiling);

  return group;
}

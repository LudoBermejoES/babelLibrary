import init, { Library, ping } from './pkg/babel-gen.js';
import type { BookMeta } from '../api/types';

let ready: Promise<void> | undefined;

async function ensureReady(): Promise<void> {
  ready ??= init().then(() => undefined);
  return ready;
}

export async function smokeTestPing(n: number): Promise<number> {
  await ensureReady();
  return ping(n);
}

export interface GalleryBuffers {
  bookTransforms: Float32Array;
  bookColors: Float32Array;
  bookIds: Uint32Array;
  shelfTransforms: Float32Array;
  propTransforms: Float32Array;
  wallSegments: Float32Array;
  vestibule: Float32Array;
  shaftColliders: Float32Array;
  colliders: Float32Array;
}

export interface LibraryConfig {
  hexSide: number;
  ceilingHeight: number;
  shaftRadius: number;
  staircaseRadius: number;
  railingHeight: number;
  booksPerHex: number;
  slotsPerShelf: number;
  shelvesPerWall: number;
  shelfWallsPerHex: number;
  vestibuleOpening: number;
}

export interface LibraryGallery {
  index: number;
  q: number;
  r: number;
  floor: number;
  center: [number, number, number];
  horizontalNeighbor: number | null;
  floorAbove: number | null;
  floorBelow: number | null;
}

export interface LibrarySpawn {
  gallery: number;
  position: [number, number, number];
  yaw: number;
}

export interface LibraryGraph {
  config: LibraryConfig;
  galleries: LibraryGallery[];
  spawn: LibrarySpawn;
}

// Wire shape from Rust's `graph_json()` (serde's default snake_case rename
// is NOT applied there — `GraphJson`'s fields are already camelCase-free
// Rust names, so this mirrors them 1:1 before we relabel to camelCase).
interface RawGraphJson {
  config: {
    hex_side: number;
    ceiling_height: number;
    shaft_radius: number;
    staircase_radius: number;
    railing_height: number;
    books_per_hex: number;
    slots_per_shelf: number;
    shelves_per_wall: number;
    shelf_walls_per_hex: number;
    vestibule_opening: number;
  };
  galleries: Array<{
    index: number;
    q: number;
    r: number;
    floor: number;
    center: [number, number, number];
    horizontal_neighbor: number | null;
    floor_above: number | null;
    floor_below: number | null;
  }>;
  spawn: {
    gallery: number;
    position: [number, number, number];
    yaw: number;
  };
}

function parseGraph(json: string): LibraryGraph {
  const raw: RawGraphJson = JSON.parse(json);
  return {
    config: {
      hexSide: raw.config.hex_side,
      ceilingHeight: raw.config.ceiling_height,
      shaftRadius: raw.config.shaft_radius,
      staircaseRadius: raw.config.staircase_radius,
      railingHeight: raw.config.railing_height,
      booksPerHex: raw.config.books_per_hex,
      slotsPerShelf: raw.config.slots_per_shelf,
      shelvesPerWall: raw.config.shelves_per_wall,
      shelfWallsPerHex: raw.config.shelf_walls_per_hex,
      vestibuleOpening: raw.config.vestibule_opening,
    },
    galleries: raw.galleries.map((g) => ({
      index: g.index,
      q: g.q,
      r: g.r,
      floor: g.floor,
      center: g.center,
      horizontalNeighbor: g.horizontal_neighbor,
      floorAbove: g.floor_above,
      floorBelow: g.floor_below,
    })),
    spawn: {
      gallery: raw.spawn.gallery,
      position: raw.spawn.position,
      yaw: raw.spawn.yaw,
    },
  };
}

const NO_HINT = 0xffffffff;

/**
 * Builds the library layout for the given seed and ordered catalog.
 * `getGallery` copies (slices) every buffer out of wasm memory immediately
 * — required since wasm memory views are invalidated whenever wasm memory
 * grows (doc 04 "TypeScript facade").
 */
export async function createLibrary(
  seed: bigint,
  books: BookMeta[],
): Promise<{ graph: LibraryGraph; getGallery(index: number): GalleryBuffers }> {
  await ensureReady();

  const ids = new Uint32Array(books.length);
  const hints = new Uint32Array(books.length);
  books.forEach((book, i) => {
    ids[i] = book.id;
    hints[i] = book.spineColor ? parseHexColor(book.spineColor) : NO_HINT;
  });

  const library = new Library(seed, ids, hints);
  const graph = parseGraph(library.graph_json());

  return {
    graph,
    getGallery(index: number): GalleryBuffers {
      return {
        bookTransforms: library.book_transforms(index).slice(),
        bookColors: library.book_colors(index).slice(),
        bookIds: library.book_ids(index).slice(),
        shelfTransforms: library.shelf_transforms(index).slice(),
        propTransforms: library.prop_transforms(index).slice(),
        wallSegments: library.wall_segments(index).slice(),
        vestibule: library.vestibule(index).slice(),
        shaftColliders: library.shaft_colliders(index).slice(),
        colliders: library.colliders(index).slice(),
      };
    },
  };
}

function parseHexColor(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

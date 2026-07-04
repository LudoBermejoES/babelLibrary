// @vitest-environment node
//
// Exercises the real src/wasm/index.ts facade (not just the raw pkg) against
// the real wasm build. Node has no dev server to fetch the .wasm asset from
// (see tests/wasm.test.ts), so the wasm module is pre-initialized here via
// initSync + a direct file read; the facade's own init() call is a safe
// no-op afterward (the generated __wbg_init short-circuits once `wasm` is
// already set — see web/src/wasm/pkg/babel-gen.js).
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { initSync } from '../src/wasm/pkg/babel-gen.js';
import { createLibrary } from '../src/wasm';
import type { BookMeta } from '../src/api/types';

beforeAll(async () => {
  const wasmPath = resolve(process.cwd(), 'src/wasm/pkg/babel-gen_bg.wasm');
  const bytes = await readFile(wasmPath);
  initSync({ module: bytes });
});

function fakeBooks(n: number): BookMeta[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    title: `Book ${i}`,
    author: `Author ${i}`,
    synopsis: null,
    epubUrl: `/epubs/book-${i}.epub`,
    spineColor: null,
    pageCount: null,
  }));
}

describe('createLibrary (wasm facade)', () => {
  it('returns a graph and per-gallery buffers for a 100-book catalog', async () => {
    const books = fakeBooks(100);
    const { graph, getGallery } = await createLibrary(42n, books);

    expect(graph.galleries.length).toBeGreaterThan(0);
    expect(graph.config.booksPerHex).toBe(160);
    expect(graph.config.shelfWallsPerHex).toBe(4);
    expect(graph.config.staircaseRadius).toBe(1.2); // distinct from shaftRadius (1.0)
    expect(graph.config.shaftRadius).toBe(1.0);

    // Spawn is emitted at FLOOR level (feet on the floor), not eye height —
    // eye height is a player-feel value owned by the frontend (constants.ts
    // EYE_HEIGHT), added when posing the camera, not baked into world data.
    const spawnGallery = graph.galleries[graph.spawn.gallery]!;
    expect(graph.spawn.position[1]).toBeCloseTo(spawnGallery.floor * graph.config.ceilingHeight);

    const gallery0 = getGallery(0);
    expect(gallery0.bookTransforms.length % 16).toBe(0);
    expect(gallery0.bookColors.length % 3).toBe(0);
    expect(gallery0.bookIds.length).toBe(gallery0.bookTransforms.length / 16);
    expect(gallery0.shelfTransforms.length).toBe(4 * 16);
    expect(gallery0.propTransforms.length).toBe(2 * 17);
    expect(gallery0.wallSegments.length).toBe(5 * 8);
    expect(gallery0.vestibule.length).toBe(25);
    expect(gallery0.shaftColliders.length % 6).toBe(0);
    expect(gallery0.colliders.length % 6).toBe(0);
  });

  it('copies buffers out immediately — repeated calls do not alias the same memory', async () => {
    const books = fakeBooks(50);
    const { getGallery } = await createLibrary(7n, books);

    const first = getGallery(0);
    const second = getGallery(0);
    expect(first.bookTransforms).not.toBe(second.bookTransforms);
    expect(Array.from(first.bookTransforms)).toEqual(Array.from(second.bookTransforms));
  });

  it('graph includes (q, r, floor) and neighbor refs for every gallery', async () => {
    const books = fakeBooks(2500); // force multiple floors
    const { graph } = await createLibrary(11n, books);

    const hasFloorAbove = graph.galleries.some((g) => g.floorAbove !== null);
    expect(hasFloorAbove).toBe(true);

    for (const gallery of graph.galleries) {
      expect(typeof gallery.q).toBe('number');
      expect(typeof gallery.r).toBe('number');
      expect(typeof gallery.floor).toBe('number');
      expect(gallery.center).toHaveLength(3);
    }
  });
});

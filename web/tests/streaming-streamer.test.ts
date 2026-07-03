// @vitest-environment node
//
// Exercises GalleryStreamer against the real wasm build (same pattern as
// wasm-facade.test.ts) since it needs real GalleryBuffers shaped correctly
// for buildGalleryArchitecture/buildGalleryInstances/buildVestibule to
// succeed — hand-faking those buffers would just re-encode the same
// buffer-layout knowledge the generator already tests.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { initSync } from '../src/wasm/pkg/babel-gen.js';
import { createLibrary } from '../src/wasm';
import { GalleryStreamer, neededGallerySet } from '../src/scene/streaming';
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

describe('GalleryStreamer', () => {
  it('builds exactly the needed set on first update and nothing else', async () => {
    const books = fakeBooks(50);
    const { graph, getGallery } = await createLibrary(7n, books);
    const scene = new THREE.Scene();
    const streamer = new GalleryStreamer(scene, graph, getGallery);

    streamer.update(0);

    const expected = neededGallerySet(graph.galleries, 0);
    expect(streamer.liveGalleryIndices).toEqual(expected);
    for (const index of expected) {
      expect(scene.getObjectByName(`gallery-${index}`)).toBeDefined();
    }
  });

  it('disposes a gallery that is no longer needed when the current gallery changes', async () => {
    const books = fakeBooks(2500); // force multiple floors, real horizontal+vertical neighbors
    const { graph, getGallery } = await createLibrary(11n, books);
    const scene = new THREE.Scene();
    const streamer = new GalleryStreamer(scene, graph, getGallery);

    streamer.update(0);
    const initiallyLive = new Set(streamer.liveGalleryIndices);

    // Find a gallery far from 0 in the graph (last one) to force a real membership change.
    const farIndex = graph.galleries.length - 1;
    streamer.update(farIndex);

    const nowNeeded = neededGallerySet(graph.galleries, farIndex);
    expect(streamer.liveGalleryIndices).toEqual(nowNeeded);

    const droppedSomewhere = [...initiallyLive].some((i) => !streamer.liveGalleryIndices.has(i));
    expect(droppedSomewhere).toBe(true);
    for (const index of initiallyLive) {
      if (!nowNeeded.has(index)) {
        expect(scene.getObjectByName(`gallery-${index}`)).toBeUndefined();
      }
    }
  });

  it('re-crossing back to a previously-visited gallery still works (buffer cache path)', async () => {
    const books = fakeBooks(2500);
    const { graph, getGallery } = await createLibrary(11n, books);
    const scene = new THREE.Scene();
    const streamer = new GalleryStreamer(scene, graph, getGallery);

    streamer.update(0);
    const farIndex = graph.galleries.length - 1;
    streamer.update(farIndex);
    streamer.update(0);

    const expected = neededGallerySet(graph.galleries, 0);
    expect(streamer.liveGalleryIndices).toEqual(expected);
    for (const index of expected) {
      expect(scene.getObjectByName(`gallery-${index}`)).toBeDefined();
    }
  });
});

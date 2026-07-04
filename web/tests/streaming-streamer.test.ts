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
    const books = fakeBooks(3500); // force multiple floors, real horizontal+vertical neighbors
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
    const books = fakeBooks(3500);
    const { graph, getGallery } = await createLibrary(11n, books);
    const scene = new THREE.Scene();
    const streamer = new GalleryStreamer(scene, graph, getGallery);

    streamer.update(0);
    const farIndex = graph.galleries.length - 1;
    streamer.update(farIndex);
    streamer.update(0);

    const expected = neededGallerySet(graph.galleries, 0);
    expect(streamer.liveGalleryIndices).toEqual(expected);
    for (const index of streamer.fullyBuiltGalleryIndices) {
      expect(scene.getObjectByName(`gallery-${index}`)).toBeDefined();
    }
  });

  it('builds a vertical neighbor as a shaft-glimpse (not fully), and upgrades it when it becomes current', async () => {
    const books = fakeBooks(3500);
    const { graph, getGallery } = await createLibrary(11n, books);
    const withVertical = graph.galleries.find((g) => g.floorAbove !== null || g.floorBelow !== null);
    expect(withVertical).toBeDefined();
    const verticalNeighborIndex = (withVertical!.floorAbove ?? withVertical!.floorBelow)!;

    const scene = new THREE.Scene();
    const streamer = new GalleryStreamer(scene, graph, getGallery);
    streamer.update(withVertical!.index);

    expect(streamer.liveGalleryIndices.has(verticalNeighborIndex)).toBe(true);
    expect(streamer.fullyBuiltGalleryIndices.has(verticalNeighborIndex)).toBe(false);
    expect(scene.getObjectByName(`shaft-glimpse-${verticalNeighborIndex}`)).toBeDefined();
    expect(scene.getObjectByName(`gallery-${verticalNeighborIndex}`)).toBeUndefined();

    streamer.update(verticalNeighborIndex);

    expect(streamer.fullyBuiltGalleryIndices.has(verticalNeighborIndex)).toBe(true);
    expect(scene.getObjectByName(`gallery-${verticalNeighborIndex}`)).toBeDefined();
    expect(scene.getObjectByName(`shaft-glimpse-${verticalNeighborIndex}`)).toBeUndefined();
  });

  it('downgrades a fully-built gallery to a shaft-glimpse once it is only a vertical neighbor again', async () => {
    const books = fakeBooks(3500);
    const { graph, getGallery } = await createLibrary(11n, books);
    const withVertical = graph.galleries.find((g) => g.floorAbove !== null || g.floorBelow !== null)!;
    const verticalNeighborIndex = (withVertical.floorAbove ?? withVertical.floorBelow)!;

    const scene = new THREE.Scene();
    const streamer = new GalleryStreamer(scene, graph, getGallery);

    // Start at withVertical.index (fully built, since it's "current")...
    streamer.update(withVertical.index);
    expect(streamer.fullyBuiltGalleryIndices.has(withVertical.index)).toBe(true);

    // ...then walk into its vertical neighbor. withVertical.index is now
    // only a vertical neighbor of the new current gallery — it must
    // downgrade to a glimpse, not stay fully built forever (that would
    // blow the draw-call budget).
    streamer.update(verticalNeighborIndex);

    expect(streamer.fullyBuiltGalleryIndices.has(withVertical.index)).toBe(false);
    expect(scene.getObjectByName(`shaft-glimpse-${withVertical.index}`)).toBeDefined();
    expect(scene.getObjectByName(`gallery-${withVertical.index}`)).toBeUndefined();
  });

  it('activeColliders unions the current gallery AND its live horizontal neighbors (doc 06: adjacent galleries in the active set)', async () => {
    const books = fakeBooks(3500);
    const { graph, getGallery } = await createLibrary(11n, books);
    // A gallery with a horizontal neighbor (essentially all of them — the
    // ring gives each one a forward edge).
    const withHorizontal = graph.galleries.find((g) => g.horizontalNeighbor !== null)!;
    const neighborIndex = withHorizontal.horizontalNeighbor!;

    const scene = new THREE.Scene();
    const streamer = new GalleryStreamer(scene, graph, getGallery);
    streamer.update(withHorizontal.index);

    // Expected count = sum over the entire live full-membership set (current
    // + every horizontal neighbor, forward and reverse), which is what the
    // active collider union must cover.
    const fullyBuilt = [...streamer.fullyBuiltGalleryIndices];
    const expectedAABBs = fullyBuilt.reduce((sum, i) => {
      const b = getGallery(i);
      return sum + (b.colliders.length + b.shaftColliders.length) / 6;
    }, 0);

    const active = streamer.activeColliders(withHorizontal.index);
    // The active set must include the current gallery's colliders AND its
    // horizontal neighbor's — colliding against only the current gallery let
    // the player clip through the neighbor's facing wall in the tracking
    // hysteresis band. There must be more than one gallery's worth.
    expect(streamer.hasLiveBuffers(neighborIndex)).toBe(true);
    expect(fullyBuilt.length).toBeGreaterThan(1);
    expect(active.length).toBe(expectedAABBs);
    for (const box of active) expect(box).toHaveLength(6);
  });
});

describe('GalleryStreamer.dispose', () => {
  it('never disposes the shared instanced geometries still used by other live galleries, but does dispose per-gallery geometry and instance buffers', async () => {
    const books = fakeBooks(50);
    const { graph, getGallery } = await createLibrary(7n, books);
    const scene = new THREE.Scene();
    const streamer = new GalleryStreamer(scene, graph, getGallery);

    streamer.update(0);
    const gallery0 = scene.getObjectByName('gallery-0')!;

    // Grab references before disposal: a shared instanced geometry (books/
    // shelves/lamps use module-level singletons) and a per-gallery wall
    // geometry (built fresh per gallery).
    let sharedGeometry: THREE.BufferGeometry | null = null;
    let perGalleryGeometry: THREE.BufferGeometry | null = null;
    let instancedMesh: THREE.InstancedMesh | null = null;
    gallery0.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if ((mesh as THREE.InstancedMesh).isInstancedMesh && !sharedGeometry) {
        sharedGeometry = mesh.geometry;
        instancedMesh = mesh as THREE.InstancedMesh;
      } else if (mesh.isMesh && !perGalleryGeometry) {
        perGalleryGeometry = mesh.geometry;
      }
    });
    expect(sharedGeometry).not.toBeNull();
    expect(perGalleryGeometry).not.toBeNull();

    let sharedDisposed = false;
    let perGalleryDisposed = false;
    let instancedMeshDisposed = false;
    sharedGeometry!.addEventListener('dispose', () => {
      sharedDisposed = true;
    });
    perGalleryGeometry!.addEventListener('dispose', () => {
      perGalleryDisposed = true;
    });
    instancedMesh!.addEventListener('dispose', () => {
      instancedMeshDisposed = true;
    });

    // Move current to mid-ring so gallery 0 leaves the needed set (the last
    // gallery won't do: its ring neighbor wraps back to 0, keeping it live).
    streamer.update(3);
    expect(scene.getObjectByName('gallery-0')).toBeUndefined();

    expect(sharedDisposed).toBe(false); // shared singleton must survive
    expect(perGalleryDisposed).toBe(true); // per-gallery geometry must be freed
    expect(instancedMeshDisposed).toBe(true); // instance buffers must be freed
  });
});

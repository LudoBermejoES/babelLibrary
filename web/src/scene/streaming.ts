import * as THREE from 'three';
import type { GalleryBuffers, LibraryConfig, LibraryGallery } from '../wasm';
import { buildGalleryArchitecture } from './gallery';
import { buildGalleryInstances } from './instancing';
import { buildShaftRailing, buildVestibule, type VestibuleCounts } from './vestibule';

/**
 * The set of gallery indices that must be present in the scene for a given
 * "current gallery": itself, its horizontal neighbor (through the
 * vestibule), and its vertical neighbors (floor above/below, if present) —
 * doc 05 "Gallery streaming". Pure function of the graph, independent of
 * Three.js, so it's cheaply unit-testable.
 */
export function neededGallerySet(galleries: LibraryGallery[], currentIndex: number): Set<number> {
  const current = galleries[currentIndex];
  const needed = new Set<number>([currentIndex]);
  if (!current) return needed;
  if (current.horizontalNeighbor !== null) needed.add(current.horizontalNeighbor);
  if (current.floorAbove !== null) needed.add(current.floorAbove);
  if (current.floorBelow !== null) needed.add(current.floorBelow);
  return needed;
}

const BUFFER_CACHE_SIZE = 4;

export interface StreamedGalleryCounts {
  books: number;
  shelves: number;
  lamps: number;
}

/**
 * Owns the scene's per-gallery groups, swapping them in/out as the "current
 * gallery" changes: builds missing groups from `getGallery`, disposes
 * groups no longer needed, and keeps up to `BUFFER_CACHE_SIZE` disposed
 * galleries' buffers cached so back-and-forth crossing is cheap (doc 05
 * "GalleryCache"). Materials are never disposed (shared, process-lifetime).
 */
export class GalleryStreamer {
  private readonly scene: THREE.Scene;
  private readonly graph: { galleries: LibraryGallery[]; config: LibraryConfig };
  private readonly getGallery: (index: number) => GalleryBuffers;
  private readonly liveGroups = new Map<number, THREE.Group>();
  private readonly liveBuffers = new Map<number, GalleryBuffers>();
  private readonly bufferCache = new Map<number, GalleryBuffers>();
  private readonly instanceCounts = new Map<number, StreamedGalleryCounts>();
  private readonly vestibuleCounts = new Map<number, VestibuleCounts>();

  constructor(
    scene: THREE.Scene,
    graph: { galleries: LibraryGallery[]; config: LibraryConfig },
    getGallery: (index: number) => GalleryBuffers,
  ) {
    this.scene = scene;
    this.graph = graph;
    this.getGallery = getGallery;
  }

  /** Which gallery indices currently have a live (built) scene group. */
  get liveGalleryIndices(): ReadonlySet<number> {
    return new Set(this.liveGroups.keys());
  }

  instanceCountsFor(index: number): StreamedGalleryCounts | undefined {
    return this.instanceCounts.get(index);
  }

  vestibuleCountsFor(index: number): VestibuleCounts | undefined {
    return this.vestibuleCounts.get(index);
  }

  /** Recomputes membership for `currentIndex` and builds/disposes to match. No-op if the needed set hasn't changed (doc 05 frame-loop note). */
  update(currentIndex: number): void {
    const needed = neededGallerySet(this.graph.galleries, currentIndex);

    for (const index of [...this.liveGroups.keys()]) {
      if (!needed.has(index)) this.dispose(index);
    }
    for (const index of needed) {
      if (!this.liveGroups.has(index)) this.build(index);
    }
  }

  private build(index: number): void {
    const gallery = this.graph.galleries[index];
    if (!gallery) return;

    const buffers = this.bufferCache.get(index) ?? this.getGallery(index);
    this.bufferCache.delete(index);

    const architecture = buildGalleryArchitecture(gallery, buffers, this.graph.config);
    const { group: instances, bookCount, shelfCount, lampCount } = buildGalleryInstances(buffers);
    architecture.add(instances);

    const { group: vestibule, counts } = buildVestibule(buffers);
    architecture.add(vestibule);
    this.vestibuleCounts.set(index, counts);

    architecture.add(buildShaftRailing(buffers));

    this.scene.add(architecture);
    this.liveGroups.set(index, architecture);
    this.liveBuffers.set(index, buffers);
    this.instanceCounts.set(index, { books: bookCount, shelves: shelfCount, lamps: lampCount });
  }

  private dispose(index: number): void {
    const group = this.liveGroups.get(index);
    if (!group) return;

    group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
      // Materials are shared across galleries (module-level singletons in
      // assets.ts) and never disposed here — disposing them would break
      // every other live gallery using the same material instance.
    });

    this.scene.remove(group);
    this.liveGroups.delete(index);
    this.instanceCounts.delete(index);
    this.vestibuleCounts.delete(index);

    const buffers = this.liveBuffers.get(index);
    this.liveBuffers.delete(index);
    if (buffers) {
      this.bufferCache.set(index, buffers);
      if (this.bufferCache.size > BUFFER_CACHE_SIZE) {
        const oldest = this.bufferCache.keys().next().value;
        if (oldest !== undefined) this.bufferCache.delete(oldest);
      }
    }
  }
}

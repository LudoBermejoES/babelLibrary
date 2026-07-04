import * as THREE from 'three';
import type { GalleryBuffers, LibraryConfig, LibraryGallery } from '../wasm';
import { horizontalNeighborsOf } from '../graph';
import { appendAabbs, type Aabb } from '../controls/collide';
import { buildGalleryArchitecture } from './gallery';
import { buildGalleryInstances } from './instancing';
import { buildGalleryLights } from './lighting';
import { buildShaftGlimpse } from './shaft-visibility';
import { buildShaftRailing, buildVestibule, type VestibuleCounts } from './vestibule';

export interface GalleryMembership {
  /** Fully built (architecture + shelves + books + vestibule): the current gallery and its horizontal neighbor — both walkable without a floor change. */
  full: Set<number>;
  /** Shaft-visible only (floor/ceiling + railing, no shelves/books): floor-above/below neighbors, glimpsed through the shaft but not yet walked into (doc 05 "shaft-visible only" streaming tier). */
  glimpse: Set<number>;
}

/**
 * Gallery membership for a given "current gallery" — doc 05 "Gallery
 * streaming". Pure function of the graph, independent of Three.js, so it's
 * cheaply unit-testable. A gallery already in `full` is never duplicated
 * into `glimpse` (a fully-built gallery already satisfies "visible through
 * the shaft").
 */
export function neededGalleryMembership(galleries: LibraryGallery[], currentIndex: number): GalleryMembership {
  const current = galleries[currentIndex];
  const full = new Set<number>([currentIndex]);
  const glimpse = new Set<number>();
  if (!current) return { full, glimpse };

  for (const neighbor of horizontalNeighborsOf(galleries, currentIndex)) full.add(neighbor);
  if (current.floorAbove !== null && !full.has(current.floorAbove)) glimpse.add(current.floorAbove);
  if (current.floorBelow !== null && !full.has(current.floorBelow)) glimpse.add(current.floorBelow);

  return { full, glimpse };
}

/** Convenience union of `full` and `glimpse` — every gallery index that must have *some* scene presence, regardless of fidelity tier. */
export function neededGallerySet(galleries: LibraryGallery[], currentIndex: number): Set<number> {
  const { full, glimpse } = neededGalleryMembership(galleries, currentIndex);
  return new Set([...full, ...glimpse]);
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
type Fidelity = 'full' | 'glimpse';

export class GalleryStreamer {
  private readonly scene: THREE.Scene;
  private readonly graph: { galleries: LibraryGallery[]; config: LibraryConfig };
  private readonly getGallery: (index: number) => GalleryBuffers;
  private readonly liveGroups = new Map<number, THREE.Group>();
  private readonly liveFidelity = new Map<number, Fidelity>();
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

  /** Which gallery indices currently have a live (built) scene group, at any fidelity. */
  get liveGalleryIndices(): ReadonlySet<number> {
    return new Set(this.liveGroups.keys());
  }

  /** Which gallery indices are currently fully built (shelves/books/vestibule), as opposed to shaft-glimpse-only. */
  get fullyBuiltGalleryIndices(): ReadonlySet<number> {
    const full = new Set<number>();
    for (const [index, fidelity] of this.liveFidelity) if (fidelity === 'full') full.add(index);
    return full;
  }

  instanceCountsFor(index: number): StreamedGalleryCounts | undefined {
    return this.instanceCounts.get(index);
  }

  /** The raw `vestibule` buffer (doc 04, 25 f32) for a fully-built gallery — lets the controls layer derive the staircase helix from the same data the vestibule mesh uses, without recomputing it. `undefined` for a glimpse-tier or not-live gallery. */
  vestibuleBufferFor(index: number): Float32Array | undefined {
    return this.liveBuffers.get(index)?.vestibule;
  }

  vestibuleCountsFor(index: number): VestibuleCounts | undefined {
    return this.vestibuleCounts.get(index);
  }

  /**
   * Parsed collider AABBs for the full walkable membership of `currentIndex`
   * — the current gallery AND its live horizontal neighbors (doc 06: "the
   * active collider set = current gallery + adjacent galleries' AABBs").
   * Colliding against only the current gallery let a player in the tracking
   * hysteresis band clip through a neighbor's facing wall. Returned as ready
   * `Aabb` tuples so the caller can cache them at the gallery-change
   * boundary rather than re-parsing the flat buffers every frame.
   */
  activeColliders(currentIndex: number): Aabb[] {
    const { full } = neededGalleryMembership(this.graph.galleries, currentIndex);
    const boxes: Aabb[] = [];
    for (const index of full) {
      const buffers = this.liveBuffers.get(index);
      if (!buffers) continue;
      appendAabbs(boxes, buffers.colliders);
      appendAabbs(boxes, buffers.shaftColliders);
    }
    return boxes;
  }

  /** Whether a gallery is currently fully built with live buffers — used by tests to assert collider availability. */
  hasLiveBuffers(index: number): boolean {
    return this.liveBuffers.has(index);
  }

  /** Recomputes membership for `currentIndex` and builds/disposes/upgrades/downgrades to match. No-op if nothing changed (doc 05 frame-loop note). */
  update(currentIndex: number): void {
    const { full, glimpse } = neededGalleryMembership(this.graph.galleries, currentIndex);

    for (const index of [...this.liveGroups.keys()]) {
      if (!full.has(index) && !glimpse.has(index)) this.dispose(index);
    }
    for (const index of full) {
      const current = this.liveFidelity.get(index);
      if (current === undefined || current === 'glimpse') {
        if (current === 'glimpse') this.dispose(index); // upgrade: rebuild at full fidelity
        this.build(index, 'full');
      }
    }
    for (const index of glimpse) {
      const current = this.liveFidelity.get(index);
      if (current === undefined) {
        this.build(index, 'glimpse');
      } else if (current === 'full') {
        this.dispose(index); // downgrade: no longer adjacent, only shaft-visible
        this.build(index, 'glimpse');
      }
    }
  }

  private build(index: number, fidelity: Fidelity): void {
    const gallery = this.graph.galleries[index];
    if (!gallery) return;

    if (fidelity === 'glimpse') {
      const group = buildShaftGlimpse(gallery, this.graph.config);
      this.scene.add(group);
      this.liveGroups.set(index, group);
      this.liveFidelity.set(index, 'glimpse');
      return;
    }

    const buffers = this.bufferCache.get(index) ?? this.getGallery(index);
    this.bufferCache.delete(index);

    const architecture = buildGalleryArchitecture(gallery, buffers, this.graph.config);
    const { group: instances, bookCount, shelfCount, lampCount } = buildGalleryInstances(buffers);
    architecture.add(instances);

    const { group: vestibule, counts } = buildVestibule(buffers);
    architecture.add(vestibule);
    this.vestibuleCounts.set(index, counts);

    architecture.add(buildShaftRailing(buffers));
    architecture.add(buildGalleryLights(buffers.propTransforms));

    this.scene.add(architecture);
    this.liveGroups.set(index, architecture);
    this.liveFidelity.set(index, 'full');
    this.liveBuffers.set(index, buffers);
    this.instanceCounts.set(index, { books: bookCount, shelves: shelfCount, lamps: lampCount });
  }

  private dispose(index: number): void {
    const group = this.liveGroups.get(index);
    if (!group) return;

    group.traverse((obj) => {
      const instanced = obj as THREE.InstancedMesh;
      if (instanced.isInstancedMesh) {
        // InstancedMeshes (books/shelves/lamps) share module-level singleton
        // geometry from instancing.ts — disposing that geometry would rip
        // the GPU buffers out from under every OTHER live gallery's
        // instanced meshes (that was the bug). InstancedMesh.dispose() frees
        // only this mesh's own per-instance matrix/color buffers, which is
        // exactly what we want, and leaves the shared geometry intact.
        instanced.dispose();
        return;
      }
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose(); // per-gallery geometry (walls, floor, closets)
      // Materials are shared across galleries (module-level singletons in
      // assets.ts / gallery.ts) and never disposed here — disposing them
      // would break every other live gallery using the same material.
    });

    this.scene.remove(group);
    this.liveGroups.delete(index);
    this.liveFidelity.delete(index);
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

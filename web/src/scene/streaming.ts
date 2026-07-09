import * as THREE from 'three';
import type { GalleryBuffers, LibraryConfig, LibraryGallery } from '../wasm';
import { horizontalNeighborsOf, verticalWrapGlimpses } from '../graph';
import { appendAabbs, type Aabb } from '../controls/collide';
import { buildGalleryArchitecture } from './gallery';
import { buildEnclosingShell } from './hex-shell';
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
  /**
   * Vertical-wrap glimpses (design D8), keyed by their unique group name. These
   * render a wrapped-floor counterpart at an OFFSET position (not the
   * gallery's canonical center), so they can't share the `liveGroups` map
   * (which is keyed by canonical gallery index and assumes canonical
   * placement). Rebuilt wholesale each `update` since the set is tiny (0–2).
   */
  private readonly liveWrapGlimpses = new Map<string, THREE.Group>();

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

  /** Live vertical-wrap glimpse group names (design D8) — used by tests/debug to assert an edge floor's void shaft is filled by a wrapped counterpart. */
  get wrapGlimpseNames(): ReadonlySet<string> {
    return new Set(this.liveWrapGlimpses.keys());
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

    this.reconcileWrapGlimpses(currentIndex);
  }

  /**
   * Rebuilds the current gallery's extra "no-void" geometry — the pieces that
   * live outside the canonical per-gallery `liveGroups` map because they render
   * at non-canonical positions:
   *
   * - Vertical-wrap glimpses (design D8): a top-floor gallery shows floor 0's
   *   counterpart above, a bottom-floor gallery shows the top floor's below,
   *   offset one ceiling height so an otherwise-void up/down shaft lands on the
   *   wrapped floor's hex.
   * - The enclosing shell (design D7, generalized): one large inward-facing
   *   shell around the neighborhood at fog distance so every open horizontal /
   *   oblique sightline (vestibule doorway, shaft-opposite gap, edge-gallery
   *   directions with no neighbor) terminates on dim library, never void.
   *
   * All are keyed by unique name and rebuilt wholesale on gallery change (the
   * set is tiny), so we dispose all and re-add rather than diffing.
   */
  private reconcileWrapGlimpses(currentIndex: number): void {
    for (const [name, group] of this.liveWrapGlimpses) {
      this.disposeGroupGeometry(group);
      this.scene.remove(group);
      this.liveWrapGlimpses.delete(name);
    }

    const { config, galleries } = this.graph;
    for (const wrap of verticalWrapGlimpses(galleries, currentIndex)) {
      const counterpart = galleries[wrap.index];
      if (!counterpart) continue;
      // Render the counterpart at the CURRENT gallery's (q, r) column, offset
      // one ceiling height up/down — so it appears directly through this
      // gallery's shaft, not at the counterpart's own (identical q, r but the
      // same world x/z anyway) canonical spot.
      const [cx, , cz] = galleries[currentIndex]!.center;
      const baseY = galleries[currentIndex]!.center[1];
      const center: [number, number, number] = [cx, baseY + wrap.floorOffset * config.ceilingHeight, cz];
      const name = `wrap-glimpse-${currentIndex}-${wrap.index}`;
      const group = buildShaftGlimpse(counterpart, config, center);
      group.name = name;
      this.scene.add(group);
      this.liveWrapGlimpses.set(name, group);
    }

    // Enclosing horizontal backdrop (design D7, generalized): the library is
    // infinite in every horizontal direction, so every OPEN sightline out of
    // the current hexagon must terminate on dim library, never void. A hexagon's
    // 4 shelf walls are solid, but the vestibule doorway and the shaft-opposite
    // gap are open, and on edge galleries the doorway may face an unrendered
    // cell — leaving a sightline straight to void. Per-direction replicas leaked
    // (aligned openings chain into a tube) and cost too many draw calls. Instead
    // we drop ONE large inward-facing shell around the whole current-gallery
    // neighborhood at fog distance: any ray that escapes the real geometry hits
    // it and reads as the library continuing into the dark. One draw call, can
    // never leak, and matches the "fade into warm darkness" look. Centered on
    // the current gallery, its own floor level.
    const current = galleries[currentIndex];
    if (current) {
      const shell = buildEnclosingShell(current.center, config);
      shell.name = `enclosing-shell-${currentIndex}`;
      this.scene.add(shell);
      this.liveWrapGlimpses.set(shell.name, shell);
    }
  }

  /** Frees per-gallery geometry + instance buffers in a group without touching the live-gallery bookkeeping — used for the wrap/replica glimpses, which live outside the `liveGroups` map. Mirrors `dispose()`'s rule: InstancedMesh.dispose() (own buffers only, never the shared geometry), geometry.dispose() for plain per-gallery meshes. */
  private disposeGroupGeometry(group: THREE.Group): void {
    group.traverse((obj) => {
      const instanced = obj as THREE.InstancedMesh;
      if (instanced.isInstancedMesh) {
        // InstancedMeshes (books/shelves/lamps) share module-level singleton
        // geometry from instancing.ts — disposing that geometry would rip the
        // GPU buffers out from under every OTHER live gallery's instanced
        // meshes (that was the original bug). InstancedMesh.dispose() frees only
        // this mesh's own per-instance matrix/color buffers and leaves the
        // shared geometry intact.
        instanced.dispose();
        return;
      }
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose(); // per-gallery geometry (walls, floor, closets)
      // Materials are shared across galleries (module-level singletons in
      // assets.ts / hex-shell.ts) and never disposed here — disposing them would
      // break every other live gallery using the same material.
    });
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

    this.disposeGroupGeometry(group);

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

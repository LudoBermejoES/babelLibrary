import type * as THREE from 'three';
import type { LibraryGraph } from './wasm';

export interface InstanceCounts {
  books: number;
  shelves: number;
  lamps: number;
}

export interface BabelDebugHook {
  galleryCount: number;
  seed: string;
  wallMeshCountForGallery(index: number): number;
  instanceCountsForGallery(index: number): InstanceCounts;
}

declare global {
  interface Window {
    __babel?: BabelDebugHook;
  }
}

const ZERO_COUNTS: InstanceCounts = { books: 0, shelves: 0, lamps: 0 };

/** Exposes generator/scene state for Playwright (behind `?e2e`, doc 09 debug hooks). Never installed otherwise, so production builds carry no e2e surface. */
export function installDebugHook(
  seed: bigint,
  graph: LibraryGraph,
  scene: THREE.Scene,
  instanceCounts: Map<number, InstanceCounts>,
): void {
  if (!isE2eMode()) return;
  window.__babel = {
    galleryCount: graph.galleries.length,
    seed: seed.toString(),
    wallMeshCountForGallery(index: number): number {
      const group = scene.getObjectByName(`gallery-${index}`);
      if (!group) return 0;
      let count = 0;
      // Direct children only: the nested "instances" group (shelves/lamps/
      // books) is a different concern, covered by instanceCountsForGallery.
      for (const child of group.children) {
        if ((child as THREE.Mesh).isMesh) count++;
      }
      return count;
    },
    instanceCountsForGallery(index: number): InstanceCounts {
      return instanceCounts.get(index) ?? ZERO_COUNTS;
    },
  };
}

export function isE2eMode(): boolean {
  return new URLSearchParams(window.location.search).has('e2e');
}

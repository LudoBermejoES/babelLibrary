import type * as THREE from 'three';
import type { LibraryGraph } from './wasm';

export interface BabelDebugHook {
  galleryCount: number;
  seed: string;
  wallMeshCountForGallery(index: number): number;
}

declare global {
  interface Window {
    __babel?: BabelDebugHook;
  }
}

/** Exposes generator/scene state for Playwright (behind `?e2e`, doc 09 debug hooks). Never installed otherwise, so production builds carry no e2e surface. */
export function installDebugHook(seed: bigint, graph: LibraryGraph, scene: THREE.Scene): void {
  if (!isE2eMode()) return;
  window.__babel = {
    galleryCount: graph.galleries.length,
    seed: seed.toString(),
    wallMeshCountForGallery(index: number): number {
      const group = scene.getObjectByName(`gallery-${index}`);
      if (!group) return 0;
      let count = 0;
      group.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) count++;
      });
      return count;
    },
  };
}

export function isE2eMode(): boolean {
  return new URLSearchParams(window.location.search).has('e2e');
}

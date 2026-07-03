import type * as THREE from 'three';
import type { LibraryGraph } from './wasm';
import type { FpsTracker } from './scene/perf-stats';
import type { GalleryStreamer, StreamedGalleryCounts } from './scene/streaming';
import type { VestibuleCounts } from './scene/vestibule';

export interface PerfStats {
  /** Minimum instantaneous FPS since the tracker was last reset, or `null` if fewer than 2 frames have rendered. */
  fps30sMin: number | null;
  /** `renderer.info.render.calls` at the moment of the read (doc 09 §5 draw-call budget). */
  drawCalls: number;
}

export interface BabelDebugHook {
  galleryCount: number;
  seed: string;
  liveGalleryIndices(): number[];
  setCurrentGallery(index: number): void;
  wallMeshCountForGallery(index: number): number;
  instanceCountsForGallery(index: number): StreamedGalleryCounts;
  vestibuleMeshCountsForGallery(index: number): { mirrors: number; closets: number };
  shaftRailingMeshCount(index: number): number;
  staircaseMatchesFlags(index: number): boolean;
  floorNeighborOf(index: number, direction: 'above' | 'below'): number | null;
  shaftGlimpseExists(galleryIndex: number): boolean;
  /** Doc 09 §5 perf gate: resets the rolling FPS-minimum window. Call before starting a scripted walk. */
  resetStats(): void;
  stats: PerfStats;
}

declare global {
  interface Window {
    __babel?: BabelDebugHook;
  }
}

const ZERO_COUNTS: StreamedGalleryCounts = { books: 0, shelves: 0, lamps: 0 };
const ZERO_VESTIBULE: VestibuleCounts = { mirrors: 0, closets: 0, staircases: 0 };

/** Exposes generator/scene state for Playwright (behind `?e2e`, doc 09 debug hooks). Never installed otherwise, so production builds carry no e2e surface. */
export function installDebugHook(
  seed: bigint,
  graph: LibraryGraph,
  scene: THREE.Scene,
  streamer: GalleryStreamer,
  renderer: THREE.WebGLRenderer,
  fpsTracker: FpsTracker,
): void {
  if (!isE2eMode()) return;
  window.__babel = {
    galleryCount: graph.galleries.length,
    seed: seed.toString(),
    resetStats(): void {
      fpsTracker.reset();
    },
    get stats(): PerfStats {
      return {
        fps30sMin: fpsTracker.min(),
        drawCalls: renderer.info.render.calls,
      };
    },
    liveGalleryIndices(): number[] {
      return [...streamer.liveGalleryIndices].sort((a, b) => a - b);
    },
    setCurrentGallery(index: number): void {
      streamer.update(index);
    },
    wallMeshCountForGallery(index: number): number {
      const group = scene.getObjectByName(`gallery-${index}`);
      if (!group) return 0;
      let count = 0;
      // Direct children only: the nested "instances"/"vestibule"/
      // "shaft-railing" groups are different concerns, covered by their
      // own debug-hook methods below.
      for (const child of group.children) {
        if ((child as THREE.Mesh).isMesh) count++;
      }
      return count;
    },
    instanceCountsForGallery(index: number): StreamedGalleryCounts {
      return streamer.instanceCountsFor(index) ?? ZERO_COUNTS;
    },
    vestibuleMeshCountsForGallery(index: number): { mirrors: number; closets: number } {
      const { mirrors, closets } = streamer.vestibuleCountsFor(index) ?? ZERO_VESTIBULE;
      return { mirrors, closets };
    },
    shaftRailingMeshCount(index: number): number {
      const gallery = scene.getObjectByName(`gallery-${index}`);
      const railing = gallery?.getObjectByName('shaft-railing');
      return railing?.children.length ?? 0;
    },
    staircaseMatchesFlags(index: number): boolean {
      const expectsStaircase = (streamer.vestibuleCountsFor(index) ?? ZERO_VESTIBULE).staircases > 0;
      const gallery = scene.getObjectByName(`gallery-${index}`);
      const vestibule = gallery?.getObjectByName('vestibule');
      const meshCount = vestibule?.children.length ?? 0;
      // 1 mirror + 2 closets always; a 4th child is the staircase.
      const hasStaircaseMesh = meshCount > 3;
      return hasStaircaseMesh === expectsStaircase;
    },
    floorNeighborOf(index: number, direction: 'above' | 'below'): number | null {
      const gallery = graph.galleries[index];
      if (!gallery) return null;
      return direction === 'above' ? gallery.floorAbove : gallery.floorBelow;
    },
    shaftGlimpseExists(galleryIndex: number): boolean {
      return scene.getObjectByName(`shaft-glimpse-${galleryIndex}`) !== undefined;
    },
  };
}

export function isE2eMode(): boolean {
  return new URLSearchParams(window.location.search).has('e2e');
}

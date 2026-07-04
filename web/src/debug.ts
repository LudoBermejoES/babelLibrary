import type * as THREE from 'three';
import type { LibraryGraph } from './wasm';
import type { PlayerController } from './controls/player';
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
  /** The player's currently tracked gallery index — must stay in sync with setCurrentGallery (they desynced before the fix). */
  trackedGalleryIndex(): number;
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
  /** Moves the camera to a world position and re-runs gallery-tracking from it — doc 06 "Gallery tracking" wiring, exercised directly since it's normally driven by real WASD movement (blocked by headless Pointer Lock, see doc 09 §6). */
  teleportAndTrack(x: number, y: number, z: number): { galleryIndex: number; floor: number };
  galleryCenter(index: number): [number, number, number] | null;
  /** Points the camera at a world position — lets e2e/visual checks control the view direction, since real mouse-look needs pointer lock (headless-blocked). */
  lookAt(x: number, y: number, z: number): void;
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
  camera: THREE.PerspectiveCamera,
  player: PlayerController,
): void {
  if (!isE2eMode()) return;

  // Every hexagon has the identical fixed shape/orientation, so gallery 0's
  // spawn offset from its own center is the correct standing pose for any
  // gallery — no generator constants duplicated here.
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
      // Route entirely through the player so there is ONE owner of "current
      // gallery" state — teleport the camera to the gallery's standing pose,
      // then set the player's tracked gallery (which drives the streamer and
      // the collider cache). Previously this called streamer.update directly
      // and left player.tracked stale, so the next movement tick collided
      // against a disposed gallery and re-ripped the scene out.
      const pose = player.standingPoseFor(index);
      if (!pose) return;
      camera.position.set(pose.position[0], pose.position[1], pose.position[2]);
      camera.lookAt(
        camera.position.x + Math.cos(pose.yaw),
        camera.position.y,
        camera.position.z + Math.sin(pose.yaw),
      );
      player.setTrackedGallery(index);
    },
    trackedGalleryIndex(): number {
      return player.trackedGallery.index;
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
    teleportAndTrack(x: number, y: number, z: number): { galleryIndex: number; floor: number } {
      camera.position.set(x, y, z);
      player.retrackFromCameraPosition();
      const tracked = player.trackedGallery;
      return { galleryIndex: tracked.index, floor: tracked.floor };
    },
    galleryCenter(index: number): [number, number, number] | null {
      return graph.galleries[index]?.center ?? null;
    },
    lookAt(x: number, y: number, z: number): void {
      camera.lookAt(x, y, z);
    },
  };
}

export function isE2eMode(): boolean {
  return new URLSearchParams(window.location.search).has('e2e');
}

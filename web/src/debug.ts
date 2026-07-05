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
  /**
   * No-void survey (doc 09 §6, design D7/D8): stand in gallery `index`, aim the
   * camera at one of the four sightlines that used to reveal black void, render
   * a frame, and return the fraction (0..1) of near-black pixels in the canvas.
   * The infinite library must show geometry down every sightline — a high
   * fraction means a hole in the world.
   */
  surveyNearBlackFraction(index: number, view: SurveyView): number;
}

/** The four sightlines the no-void survey checks (design D7/D8). */
export type SurveyView = 'vestibule' | 'wall3' | 'shaftUp' | 'shaftDown';

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
    surveyNearBlackFraction(index: number, view: SurveyView): number {
      const gallery = graph.galleries[index];
      if (!gallery) return 1;
      const pose = player.standingPoseFor(index);
      if (!pose) return 1;

      // Stand at the gallery's eye pose (routes streaming + collider cache
      // through the player like real entry does).
      camera.position.set(pose.position[0], pose.position[1], pose.position[2]);
      player.setTrackedGallery(index);

      const [cx, , cz] = gallery.center;
      const eyeY = pose.position[1];
      const far = graph.config.hexSide * 6;

      // Aim down the requested sightline. Horizontal views target a point one
      // hex-width away along the wall normal; vertical views target straight
      // up/down the shaft.
      if (view === 'shaftUp') {
        camera.lookAt(cx, eyeY + far, cz);
      } else if (view === 'shaftDown') {
        camera.lookAt(cx, eyeY - far, cz);
      } else {
        // Wall normal angle: vestibule wall for 'vestibule', the opposite wall
        // (shaft-facing "wall 3") for 'wall3'. Wall w faces angle 60°·w in the
        // (cos→x, sin→z) convention the generator emits.
        const wall = view === 'vestibule' ? gallery.vestibuleDirection : (gallery.vestibuleDirection + 3) % 6;
        const angle = (Math.PI / 3) * wall;
        camera.lookAt(cx + Math.cos(angle) * far, eyeY, cz + Math.sin(angle) * far);
      }

      renderer.render(scene, camera);
      return readNearBlackFraction(renderer);
    },
  };
}

/**
 * Fraction (0..1) of near-black pixels in the renderer's current framebuffer.
 * Reads the WebGL canvas back through a 2D canvas (headless SwiftShader renders
 * to it fine) and counts pixels whose max channel is below the near-black
 * threshold. Fog is dark but non-black, so lit geometry — even a distant
 * glimpse — reads well above it; true void (clear color) reads at/near 0.
 */
function readNearBlackFraction(renderer: THREE.WebGLRenderer): number {
  const source = renderer.domElement;
  const w = source.width;
  const h = source.height;
  const readback = document.createElement('canvas');
  readback.width = w;
  readback.height = h;
  const ctx = readback.getContext('2d');
  if (!ctx) return 1;
  ctx.drawImage(source, 0, 0);
  const { data } = ctx.getImageData(0, 0, w, h);

  // The clear color is set to the fog color (renderer.ts), so far distance and
  // genuine holes both fade to warm darkness — never pure black. Only pixels
  // DARKER than that fog floor are true void (a hole the fog never tinted). The
  // fog color 0x14100c is (20,16,12); a threshold of 6 sits well below every
  // channel, so lit-but-dim and fogged-distant geometry never trip it, but an
  // untinted pure-black hole (nothing rendered, no clear-color fill) would.
  const NEAR_BLACK = 6;
  let dark = 0;
  const pixels = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i]! <= NEAR_BLACK && data[i + 1]! <= NEAR_BLACK && data[i + 2]! <= NEAR_BLACK) dark++;
  }
  return pixels === 0 ? 1 : dark / pixels;
}

export function isE2eMode(): boolean {
  return new URLSearchParams(window.location.search).has('e2e');
}

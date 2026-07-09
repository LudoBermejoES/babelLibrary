import * as THREE from 'three';
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
   * camera at one of the four sightlines that used to reveal void, render a
   * frame against a bright magenta sentinel clear color, and return the
   * fraction (0..1) of the canvas that came back sentinel-colored — i.e.
   * genuine void where a sightline hit no geometry. The infinite library must
   * show geometry down every sightline, so a high fraction means a hole in the
   * world. (Measures void directly via the sentinel, NOT darkness — production
   * renders dark-but-real geometry that a brightness test could not tell from a
   * fog-filled hole.)
   */
  surveyVoidFraction(index: number, view: SurveyView): number;
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
    surveyVoidFraction(index: number, view: SurveyView): number {
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

      // Render this survey frame with a bright SENTINEL clear color instead of
      // production's fog clear color. Any pixel that comes back sentinel-colored
      // is genuine void — a sightline that hit NO geometry — regardless of how
      // dark the (intentionally dim, fog-tinted) real geometry is. This is what
      // makes the gate meaningful: with the production fog clear color a hole
      // fills with fog and is indistinguishable from dark-but-real geometry, so
      // the survey could never see it. The sentinel is restored immediately.
      const prevClear = new THREE.Color();
      renderer.getClearColor(prevClear);
      const prevAlpha = renderer.getClearAlpha();
      renderer.setClearColor(SURVEY_SENTINEL, 1);
      renderer.render(scene, camera);
      const fraction = readSentinelFraction(renderer);
      renderer.setClearColor(prevClear, prevAlpha);
      return fraction;
    },
  };
}

/** Bright magenta — a color no lit library surface (browns, warm lamp light, muted book spines) or dark fog ever produces, so a sentinel-matching pixel is unambiguously void. */
const SURVEY_SENTINEL = 0xff00ff;

/**
 * Fraction (0..1) of VOID pixels in the renderer's current framebuffer, where
 * the frame was rendered with the bright magenta {@link SURVEY_SENTINEL} clear
 * color. A pixel that comes back magenta hit no geometry (the sentinel shows
 * through) and is genuine void; everything else — lit stone, book spines, even
 * distant fog-darkened geometry — is not magenta and counts as "filled".
 * Reads the WebGL canvas back through a 2D canvas (headless SwiftShader renders
 * to it fine). Tolerant match: tone mapping / sRGB shift the exact channel
 * values, but sentinel void stays strongly red+blue with near-zero green,
 * which no library surface reproduces.
 */
function readSentinelFraction(renderer: THREE.WebGLRenderer): number {
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

  let voidPixels = 0;
  const pixels = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    // Magenta sentinel: high red AND high blue AND low green. Lamp light is
    // warm (high red/green, low blue); stone/spines never combine high blue
    // with near-zero green. Generous bounds absorb tone-map/sRGB drift.
    if (r > 180 && b > 180 && g < 80) voidPixels++;
  }
  return pixels === 0 ? 1 : voidPixels / pixels;
}

export function isE2eMode(): boolean {
  return new URLSearchParams(window.location.search).has('e2e');
}

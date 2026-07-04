import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import type { LibraryGraph } from '../wasm';
import type { GalleryStreamer } from '../scene/streaming';
import { parseVestibule, staircaseCenter } from '../scene/vestibule';
import { collide, type Aabb } from './collide';
import { DT_CAP, EYE_HEIGHT, PITCH_CLAMP, WALK_SPEED } from './constants';
import { trackGallery, type TrackedGallery } from './gallery-tracking';
import { InputModeMachine } from './input-mode';
import { integrateVelocity, worldStepFromYaw } from './movement';
import { advanceOnHelix, helixBand, isWithinHelixFootprint, type HelixGeometry } from './stairs';

interface KeyState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
}

/**
 * Wires the pure math modules (collide/movement/stairs/gallery-tracking)
 * and the InputModeMachine to real DOM events and a live Three.js scene —
 * doc 06 end to end. `PointerLockControls` supplies mouse look; this class
 * owns WASD → velocity → collision → position, staircase mode switching,
 * and gallery-tracking-driven streaming updates.
 */
export class PlayerController {
  readonly inputMode = new InputModeMachine();

  private readonly camera: THREE.PerspectiveCamera;
  private readonly pointerLockControls: PointerLockControls;
  private readonly graph: LibraryGraph;
  private readonly streamer: GalleryStreamer;

  private readonly keys: KeyState = { forward: false, backward: false, left: false, right: false };
  private velocity: [number, number] = [0, 0]; // (strafe, forward), camera-relative
  private tracked: TrackedGallery;
  /** Collider AABBs for the current full membership (current + horizontal neighbors), rebuilt only when the tracked gallery changes — not per frame. */
  private activeColliders: Aabb[] = [];

  /**
   * `domElement` locks the pointer to the canvas (required by
   * `PointerLockControls`); `clickTarget` is where the click-to-enter
   * gesture is actually listened for — the overlay sits visually on top of
   * the canvas while ENTER_OVERLAY/PAUSE_OVERLAY are shown, so it (or a
   * shared ancestor container) must be the click target, not the canvas
   * itself, which the overlay would otherwise intercept every click from.
   */
  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    clickTarget: HTMLElement,
    graph: LibraryGraph,
    streamer: GalleryStreamer,
  ) {
    this.camera = camera;
    this.graph = graph;
    this.streamer = streamer;
    this.tracked = { index: graph.spawn.gallery, floor: graph.galleries[graph.spawn.gallery]?.floor ?? 0 };
    this.activeColliders = streamer.activeColliders(this.tracked.index);

    this.pointerLockControls = new PointerLockControls(camera, domElement);
    this.pointerLockControls.minPolarAngle = Math.PI / 2 - PITCH_CLAMP;
    this.pointerLockControls.maxPolarAngle = Math.PI / 2 + PITCH_CLAMP;

    this.pointerLockControls.addEventListener('lock', () => this.inputMode.pointerLockAcquired());
    this.pointerLockControls.addEventListener('unlock', () => this.inputMode.pointerLockLost());

    clickTarget.addEventListener('click', () => {
      const mode = this.inputMode.mode;
      if (mode === 'ENTER_OVERLAY' || mode === 'PAUSE_OVERLAY') {
        this.inputMode.click();
        this.pointerLockControls.lock();
      }
    });

    window.addEventListener('keydown', (event) => this.onKeyChange(event, true));
    window.addEventListener('keyup', (event) => this.onKeyChange(event, false));
  }

  private onKeyChange(event: KeyboardEvent, pressed: boolean): void {
    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.keys.forward = pressed;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.keys.backward = pressed;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.keys.left = pressed;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.keys.right = pressed;
        break;
      default:
        break;
    }
  }

  /** Advances movement/collision/streaming by `dt` seconds. No-op outside WALKING (doc 06 input-mode gating). */
  update(dt: number): void {
    if (this.inputMode.mode !== 'WALKING') return;

    const clampedDt = Math.min(dt, DT_CAP);
    this.velocity = integrateVelocity(this.velocity, this.wishVelocity(), clampedDt);

    const helix = this.helixFor(this.tracked.index);
    const position: [number, number, number] = [
      this.camera.position.x,
      this.camera.position.y,
      this.camera.position.z,
    ];
    const [strafe, forward] = this.velocity;

    // Stairs mode engages only when on the footprint AND actually moving
    // forward/back along the stairs. A radial (strafe) push is a step OFF
    // the staircase — handled by the flat branch below — so the player is
    // never trapped orbiting the helix (advanceOnHelix snaps onto the exact
    // radius circle, so without this a captured player could never leave).
    const climbing = Math.abs(forward) > Math.abs(strafe);
    if (helix && isWithinHelixFootprint(position, helix) && climbing) {
      const forwardDistance = forward * clampedDt;
      const result = advanceOnHelix(position, forwardDistance, helix);
      this.camera.position.set(...result.position);
    } else {
      const step = this.velocityToWorldStep(clampedDt);
      const resolved = collide(position, step, this.activeColliders);
      this.camera.position.set(...resolved);
    }

    this.retrackFromCameraPosition();
  }

  /**
   * Recomputes `trackGallery` from the camera's current position and, if
   * it changed, updates the streamer. Split out of `update()` so tests
   * (and the `?e2e` debug hook) can drive gallery-tracking directly after
   * teleporting the camera, without needing the WALKING-mode gate or a
   * full movement/collision tick.
   */
  retrackFromCameraPosition(): void {
    const newPosition: [number, number, number] = [
      this.camera.position.x,
      this.camera.position.y,
      this.camera.position.z,
    ];
    const nextTracked = trackGallery(newPosition, this.tracked, this.graph.galleries, this.graph.config.ceilingHeight);
    if (nextTracked.index !== this.tracked.index) {
      this.tracked = nextTracked;
      this.streamer.update(nextTracked.index);
      // Refresh the cached collider union for the new membership — done here
      // (on gallery change) rather than every frame in update().
      this.activeColliders = this.streamer.activeColliders(nextTracked.index);
    }
  }

  get trackedGallery(): TrackedGallery {
    return this.tracked;
  }

  /**
   * Directly sets the tracked gallery and syncs the streamer + collider
   * cache to it — for teleporting to an arbitrary (possibly non-adjacent)
   * gallery, where `retrackFromCameraPosition`'s neighbor-only search can't
   * converge. Keeps the player as the single owner of "current gallery"
   * state so the `?e2e` debug hook can't desync the streamer from tracking.
   */
  setTrackedGallery(index: number): void {
    const gallery = this.graph.galleries[index];
    if (!gallery) return;
    this.tracked = { index, floor: gallery.floor };
    this.streamer.update(index);
    this.activeColliders = this.streamer.activeColliders(index);
  }

  /** Standing pose (feet-on-floor + eye height, facing spawn yaw) for a gallery — every hexagon shares the same fixed shape, so the spawn offset is valid for any gallery. */
  standingPoseFor(index: number): { position: [number, number, number]; yaw: number } | null {
    const gallery = this.graph.galleries[index];
    if (!gallery) return null;
    const spawnCenter = this.graph.galleries[this.graph.spawn.gallery]!.center;
    const offset: [number, number, number] = [
      this.graph.spawn.position[0] - spawnCenter[0],
      this.graph.spawn.position[1] - spawnCenter[1],
      this.graph.spawn.position[2] - spawnCenter[2],
    ];
    return {
      position: [gallery.center[0] + offset[0], gallery.center[1] + offset[1], gallery.center[2] + offset[2]],
      yaw: this.graph.spawn.yaw,
    };
  }

  private wishVelocity(): [number, number] {
    let forward = 0;
    let strafe = 0;
    if (this.keys.forward) forward += 1;
    if (this.keys.backward) forward -= 1;
    if (this.keys.right) strafe += 1;
    if (this.keys.left) strafe -= 1;

    const length = Math.hypot(forward, strafe);
    if (length === 0) return [0, 0];
    return [(strafe / length) * WALK_SPEED, (forward / length) * WALK_SPEED];
  }

  /** Reused scratch vector — getWorldDirection runs every walking frame; allocating a fresh Vector3 per frame is pure GC churn. */
  private readonly scratchDirection = new THREE.Vector3();

  /** Converts the camera-relative (strafe, forward) velocity into a world-space XZ step using the camera's current yaw (pitch ignored — no flying, doc 06). The actual mapping lives in the pure, unit-tested `worldStepFromYaw` — it shipped inverted once (D moved left) while it was inline here. */
  private velocityToWorldStep(dt: number): [number, number, number] {
    this.camera.getWorldDirection(this.scratchDirection);
    const yaw = Math.atan2(this.scratchDirection.x, this.scratchDirection.z);
    const [strafe, forward] = this.velocity;
    return worldStepFromYaw(yaw, strafe, forward, dt);
  }

  private helixFor(index: number): HelixGeometry | null {
    const buffer = this.streamer.vestibuleBufferFor(index);
    if (!buffer) return null;

    const record = parseVestibule(buffer);
    if (!record.hasStairUp && !record.hasStairDown) return null;

    const [cx, cy, cz] = staircaseCenter(record); // cy is floor level (emit.rs vestibule())
    const ceilingHeight = this.graph.config.ceilingHeight;
    // Band anchored at EYE height, not floor level — the camera stands at
    // floorY + EYE, so a floor-level band would never engage (down) or would
    // top out a floor short of the tracking boundary (up). See helixBand.
    const { bottomY, topY } = helixBand(cy, EYE_HEIGHT, ceilingHeight, record.hasStairUp, record.hasStairDown);
    return {
      center: [cx, cz],
      // TODO(group 2): use a dedicated STAIRCASE_RADIUS_M config field rather
      // than borrowing the shaft radius (see fix-rendering-and-infinite-periodicity 2.1).
      radius: this.graph.config.shaftRadius,
      risePerTurn: ceilingHeight,
      bottomY,
      topY,
    };
  }
}

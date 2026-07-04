import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import type { LibraryGraph } from '../wasm';
import type { GalleryStreamer } from '../scene/streaming';
import { parseVestibule, staircaseCenter } from '../scene/vestibule';
import { collide, type Aabb } from './collide';
import { DT_CAP, PITCH_CLAMP, WALK_SPEED } from './constants';
import { trackGallery, type TrackedGallery } from './gallery-tracking';
import { InputModeMachine } from './input-mode';
import { integrateVelocity } from './movement';
import { advanceOnHelix, isWithinHelixFootprint, type HelixGeometry } from './stairs';

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

    if (helix && isWithinHelixFootprint(position, helix)) {
      // On the staircase: only forward/back (not strafe) drives the climb,
      // reprojected onto the helix tangent (doc 06).
      const forwardDistance = this.velocity[1] * clampedDt;
      const result = advanceOnHelix(position, forwardDistance, helix);
      this.camera.position.set(...result.position);
    } else {
      const step = this.velocityToWorldStep(clampedDt);
      const colliders = this.collidersFor(this.tracked.index);
      const resolved = collide(position, step, colliders);
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
    }
  }

  get trackedGallery(): TrackedGallery {
    return this.tracked;
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

  /** Converts the camera-relative (strafe, forward) velocity into a world-space XZ step using the camera's current yaw (pitch ignored — no flying, doc 06). */
  private velocityToWorldStep(dt: number): [number, number, number] {
    const forwardDir = new THREE.Vector3();
    this.camera.getWorldDirection(forwardDir);
    const yaw = Math.atan2(forwardDir.x, forwardDir.z);

    const [strafe, forward] = this.velocity;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const worldX = forward * sin + strafe * cos;
    const worldZ = forward * cos - strafe * sin;
    return [worldX * dt, 0, worldZ * dt];
  }

  private collidersFor(index: number): Aabb[] {
    const flat = this.streamer.collidersFor(index);
    if (!flat) return [];
    const boxes: Aabb[] = [];
    for (let i = 0; i + 6 <= flat.length; i += 6) {
      boxes.push(Array.from(flat.subarray(i, i + 6)) as Aabb);
    }
    return boxes;
  }

  private helixFor(index: number): HelixGeometry | null {
    const buffer = this.streamer.vestibuleBufferFor(index);
    if (!buffer) return null;

    const record = parseVestibule(buffer);
    if (!record.hasStairUp && !record.hasStairDown) return null;

    const [cx, cy, cz] = staircaseCenter(record);
    const ceilingHeight = this.graph.config.ceilingHeight;
    const bottomY = record.hasStairDown ? cy - ceilingHeight : cy;
    const topY = record.hasStairUp ? cy + ceilingHeight : cy;
    return {
      center: [cx, cz],
      radius: this.graph.config.shaftRadius,
      risePerTurn: ceilingHeight,
      bottomY,
      topY,
    };
  }
}

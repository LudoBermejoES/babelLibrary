import * as THREE from 'three';
import './style.css';
import { createRenderer, isWebGL2Available } from './scene/renderer';
import { createAmbientLight, createFog } from './scene/lighting';
import { FpsTracker } from './scene/perf-stats';
import { GalleryStreamer } from './scene/streaming';
import { PlayerController } from './controls/player';
import { Overlay } from './ui/overlay';
import { fetchBooks } from './api/books';
import type { BookMeta } from './api/types';
import { createLibrary } from './wasm';
import { installDebugHook, isE2eMode } from './debug';

/** Default seed (doc 01/02): `?seed=<u64>` overrides it. */
const DEFAULT_SEED = 0xbabe1n;

function seedFromUrl(): bigint {
  const raw = new URLSearchParams(window.location.search).get('seed');
  if (raw === null) return DEFAULT_SEED;
  try {
    return BigInt(raw);
  } catch {
    return DEFAULT_SEED;
  }
}

function showWebglUnavailable(app: HTMLDivElement): void {
  const panel = document.createElement('div');
  panel.dataset.testid = 'webgl-error';
  panel.className = 'webgl-error';
  panel.textContent =
    'babelLibrary needs WebGL2, which this browser cannot provide right now. Try a recent version of Chrome, Firefox, or Safari, and make sure hardware acceleration is enabled.';
  app.appendChild(panel);
}

/**
 * Shown when boot fails after the canvas exists (catalog fetch, wasm init)
 * — the same graceful-degradation rule as the WebGL2-missing path: a
 * failure must never leave a silent black canvas.
 */
export function showBootError(err: unknown): void {
  console.error('boot failed', err);
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) return;
  const panel = document.createElement('div');
  panel.dataset.testid = 'boot-error';
  panel.className = 'webgl-error';
  panel.textContent =
    'babelLibrary could not load — the book catalog or the layout generator failed to start. Check that the server is running and seeded, then reload.';
  app.appendChild(panel);
}

/**
 * Test-only catalog padding: `?e2e&e2eBookCount=N` synthesizes ids beyond
 * the real catalog so e2e tests can exercise multi-floor layouts (task 4.6)
 * without needing a large seeded fixture DB. Inert without `?e2e` — the
 * override is parsed but never applied unless e2e mode is on, so production
 * boots are unaffected regardless of query string.
 */
function applyE2eBookCountOverride(books: BookMeta[]): BookMeta[] {
  if (!isE2eMode()) return books;
  const raw = new URLSearchParams(window.location.search).get('e2eBookCount');
  if (raw === null) return books;
  const targetCount = Number(raw);
  if (!Number.isFinite(targetCount) || targetCount <= books.length) return books;

  const synthetic: BookMeta[] = [...books];
  for (let id = books.length + 1; synthetic.length < targetCount; id++) {
    synthetic.push({
      id,
      title: `Synthetic Book ${id}`,
      author: 'e2e',
      synopsis: null,
      epubUrl: '',
      spineColor: null,
      pageCount: null,
    });
  }
  return synthetic;
}

export async function boot(): Promise<void> {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) throw new Error('#app container missing');

  if (!isWebGL2Available()) {
    showWebglUnavailable(app);
    return;
  }

  const { renderer, scene, camera } = createRenderer(app);
  camera.position.set(0, 1.7, 3);
  if (!isE2eMode() || !new URLSearchParams(window.location.search).has('noLighting')) {
    scene.add(createAmbientLight());
    scene.fog = createFog();
  }

  const seed = seedFromUrl();
  const books = applyE2eBookCountOverride(await fetchBooks());
  const { graph, getGallery } = await createLibrary(seed, books);

  const streamer = new GalleryStreamer(scene, graph, getGallery);
  streamer.update(graph.spawn.gallery);

  const [spawnX, spawnY, spawnZ] = graph.spawn.position;
  camera.position.set(spawnX, spawnY, spawnZ);
  // spawn.yaw is a world-space direction angle matching the generator's
  // wall_normal convention: (cos(yaw), sin(yaw)) = (x, z). Look at a point
  // along that direction rather than juggling Euler/rotation.y sign
  // conventions directly.
  camera.lookAt(spawnX + Math.cos(graph.spawn.yaw), spawnY, spawnZ + Math.sin(graph.spawn.yaw));

  const player = new PlayerController(camera, renderer.domElement, app, graph, streamer);
  const overlay = new Overlay(app);
  player.inputMode.onModeChange((mode) => {
    if (mode === 'WALKING') overlay.hide();
    else if (mode === 'ENTER_OVERLAY') overlay.showEnter();
    else if (mode === 'PAUSE_OVERLAY') overlay.showPause();
  });

  const fpsTracker = new FpsTracker();
  installDebugHook(seed, graph, scene, streamer, renderer, fpsTracker, camera, player);

  const timer = new THREE.Timer();
  renderer.setAnimationLoop((now) => {
    fpsTracker.recordFrame(now);
    timer.update(now);
    player.update(timer.getDelta());
    renderer.render(scene, camera);
  });
}

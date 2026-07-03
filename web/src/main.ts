import './style.css';
import { createRenderer, isWebGL2Available } from './scene/renderer';
import { createAmbientLight, createFog } from './scene/lighting';
import { FpsTracker } from './scene/perf-stats';
import { GalleryStreamer } from './scene/streaming';
import { fetchBooks } from './api/books';
import type { BookMeta } from './api/types';
import { createLibrary } from './wasm';
import { installDebugHook, isE2eMode } from './debug';

export function placeholderReady(): boolean {
  return true;
}

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

  camera.position.set(graph.spawn.position[0], graph.spawn.position[1], graph.spawn.position[2]);

  const fpsTracker = new FpsTracker();
  installDebugHook(seed, graph, scene, streamer, renderer, fpsTracker);

  renderer.setAnimationLoop((now) => {
    fpsTracker.recordFrame(now);
    renderer.render(scene, camera);
  });
}

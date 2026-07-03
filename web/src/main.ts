import './style.css';
import { createRenderer, isWebGL2Available } from './scene/renderer';
import { buildGalleryArchitecture } from './scene/gallery';
import { buildGalleryInstances } from './scene/instancing';
import { buildShaftRailing, buildVestibule, type VestibuleCounts } from './scene/vestibule';
import { fetchBooks } from './api/books';
import { createLibrary } from './wasm';
import { installDebugHook } from './debug';

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

export async function boot(): Promise<void> {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) throw new Error('#app container missing');

  if (!isWebGL2Available()) {
    showWebglUnavailable(app);
    return;
  }

  const { renderer, scene, camera } = createRenderer(app);
  camera.position.set(0, 1.7, 3);

  const seed = seedFromUrl();
  const books = await fetchBooks();
  const { graph, getGallery } = await createLibrary(seed, books);

  const instanceCounts = new Map<number, { books: number; shelves: number; lamps: number }>();
  const vestibuleCounts = new Map<number, VestibuleCounts>();
  for (const gallery of graph.galleries) {
    const buffers = getGallery(gallery.index);
    const architecture = buildGalleryArchitecture(gallery, buffers, graph.config);
    const { group: instances, bookCount, shelfCount, lampCount } = buildGalleryInstances(buffers);
    architecture.add(instances);

    const { group: vestibule, counts } = buildVestibule(buffers);
    architecture.add(vestibule);
    vestibuleCounts.set(gallery.index, counts);

    architecture.add(buildShaftRailing(buffers));

    scene.add(architecture);
    instanceCounts.set(gallery.index, { books: bookCount, shelves: shelfCount, lamps: lampCount });
  }
  camera.position.set(graph.spawn.position[0], graph.spawn.position[1], graph.spawn.position[2]);

  installDebugHook(seed, graph, scene, instanceCounts, vestibuleCounts);

  renderer.setAnimationLoop(() => {
    renderer.render(scene, camera);
  });
}

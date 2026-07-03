import './style.css';
import { createRenderer } from './scene/renderer';

export function placeholderReady(): boolean {
  return true;
}

export function boot(): void {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) throw new Error('#app container missing');

  const { renderer, scene, camera } = createRenderer(app);
  camera.position.set(0, 1.7, 3);

  renderer.setAnimationLoop(() => {
    renderer.render(scene, camera);
  });
}

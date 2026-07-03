import * as THREE from 'three';

export interface AppRenderer {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
}

/** True if the browser can create a WebGL2 context (spec: graceful degradation). */
export function isWebGL2Available(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!canvas.getContext('webgl2');
  } catch {
    return false;
  }
}

/**
 * Creates the renderer/scene/camera. Throws if WebGL2 is unavailable —
 * callers must check `isWebGL2Available()` first (see `boot()` in main.ts)
 * so the failure path never reaches an uncaught exception or blank canvas.
 */
export function createRenderer(container: HTMLElement): AppRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    window.location.reload();
  });

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    70,
    container.clientWidth / container.clientHeight,
    0.05,
    60,
  );

  window.addEventListener('resize', () => {
    const { clientWidth: width, clientHeight: height } = container;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  });

  return { renderer, scene, camera };
}

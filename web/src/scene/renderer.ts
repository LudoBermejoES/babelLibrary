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
  // `preserveDrawingBuffer` only under e2e mode: the no-void survey
  // (debug.ts surveyNearBlackFraction) reads the canvas back through a 2D
  // context after a manual render, which needs the drawing buffer to survive
  // past the render call. Production leaves it off (the default) so the
  // compositor can discard the buffer for performance.
  const preserveDrawingBuffer = new URLSearchParams(window.location.search).has('e2e');
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // Clear color = the fog color (see lighting.ts createFog, 0x14100c). The
  // library is infinite: any sightline that reaches beyond the rendered
  // geometry must fade into the same warm darkness the fog produces, never a
  // jarring pure-black hole. With this, "void" and "far distance" are visually
  // identical dark — which is the intended endless-library look, not a bug.
  renderer.setClearColor(0x14100c, 1);
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

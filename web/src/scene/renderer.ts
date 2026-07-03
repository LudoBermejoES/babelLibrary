import * as THREE from 'three';

export interface AppRenderer {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
}

export function createRenderer(container: HTMLElement): AppRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

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

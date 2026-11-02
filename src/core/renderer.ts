import * as THREE from 'three';

/** Never render above this device pixel ratio; high-DPI laptops would otherwise render 4x the pixels. */
const MAX_PIXEL_RATIO = 1.5;

export function createRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.6;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);

  const resize = () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize);
  resize();

  return { renderer, scene, camera };
}

/** scale < 1 renders fewer pixels and lets the browser upscale (the cheapest quality knob). */
export function setRenderScale(renderer: THREE.WebGLRenderer, scale: number) {
  renderer.setPixelRatio(Math.min(devicePixelRatio, MAX_PIXEL_RATIO) * scale);
}

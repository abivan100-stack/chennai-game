import * as THREE from 'three';

const CAMERA_FAR = 200;

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
  // Far plane just past the fog's end (sky.ts fog.far <= 170): anything further is fog-coloured anyway,
  // and culling it saves ~80 draw calls looking down a long road. The sky draws at max depth regardless.
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, CAMERA_FAR);

  const resize = () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize);
  document.addEventListener('fullscreenchange', () => requestAnimationFrame(resize)); // sizes settle a frame later
  resize();

  return { renderer, scene, camera };
}

/** scale < 1 renders fewer pixels and lets the browser upscale (the cheapest quality knob). */
export function setRenderScale(renderer: THREE.WebGLRenderer, scale: number) {
  renderer.setPixelRatio(Math.min(devicePixelRatio, MAX_PIXEL_RATIO) * scale);
}

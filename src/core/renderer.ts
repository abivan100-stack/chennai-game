import * as THREE from 'three';

const CAMERA_FAR = 200;

/** Never render above this device pixel ratio; high-DPI laptops would otherwise render 4x the pixels. */
const MAX_PIXEL_RATIO = 1.5;

/**
 * Colour grade: ACES, then a little more colour (Chennai is saturated, the plain ACES look is
 * washed out), cool shadows and warm highlights (the sun-baked look), and a gentle contrast curve.
 * Without post-processing it runs inside the tone-mapping step every material already has (no extra
 * pass); with post-processing (core/post.ts) the same function runs once in the final pass.
 */
const SATURATION = 1.18;
const SHADOW_TINT = '0.93, 0.99, 1.07';
const HIGHLIGHT_TINT = '1.06, 1.0, 0.91';
const CONTRAST = 0.12; // 0 = none
/** GLSL: `vec3 gradeColor( vec3 linearHdr, float exposure )` -> display-linear 0..1. */
export const GRADE_GLSL = /* glsl */ `
  vec3 gradeColor( vec3 color, float exposure ) {
    const mat3 gIn = mat3( vec3( 0.59719, 0.07600, 0.02840 ), vec3( 0.35458, 0.90834, 0.13383 ), vec3( 0.04823, 0.01566, 0.83777 ) );
    const mat3 gOut = mat3( vec3( 1.60475, -0.10208, -0.00327 ), vec3( -0.53108, 1.10813, -0.07276 ), vec3( -0.07367, -0.00605, 1.07602 ) );
    vec3 c = gIn * ( color * exposure / 0.6 ); // three's ACES fit
    c = ( c * ( c + 0.0245786 ) - 0.000090537 ) / ( c * ( 0.983729 * c + 0.4329510 ) + 0.238081 );
    c = clamp( gOut * c, 0.0, 1.0 );
    float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
    c = max( mix( vec3( l ), c, ${SATURATION.toFixed(3)} ), 0.0 );
    c *= mix( vec3( ${SHADOW_TINT} ), vec3( ${HIGHLIGHT_TINT} ), smoothstep( 0.02, 0.5, l ) );
    vec3 s = c * c * ( 3.0 - 2.0 * c ); // smoothstep curve on 0..1
    return clamp( mix( c, s, ${CONTRAST.toFixed(3)} ), 0.0, 1.0 );
  }`;
THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(
  'vec3 CustomToneMapping( vec3 color ) { return color; }',
  `${GRADE_GLSL}\nvec3 CustomToneMapping( vec3 color ) { return gradeColor( color, toneMappingExposure ); }`,
);

export function createRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.CustomToneMapping;
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

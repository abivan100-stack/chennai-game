import * as THREE from 'three';

/**
 * Night sky (the Preetham sky goes black after dusk): zenith -> city-glow horizon that matches the
 * fog, a moon disc with a halo opposite the sun, and slow clouds lit orange from below by the city.
 * Drawn at the far plane on sky pixels only, faded in through twilight; skipped by day.
 */
const MOON_SIZE = 0.99978; // cos of the disc's angular radius (drawn ~4x the real moon: it's a game)
const NIGHT_ZENITH = new THREE.Color(0.012, 0.018, 0.045);

export class NightSky {
  readonly mesh: THREE.Mesh;
  private readonly u: Record<string, THREE.IUniform>;

  constructor(scene: THREE.Scene) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        horizon: { value: new THREE.Color() },
        zenith: { value: NIGHT_ZENITH.clone() },
        moonDir: { value: new THREE.Vector3(0, 1, 0) },
        cloud: { value: 0.3 },
        time: { value: 0 },
        opacity: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
          gl_Position = p.xyww; // at the far plane: behind everything
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 horizon, zenith, moonDir;
        uniform float cloud, time, opacity;
        varying vec3 vDir;
        float h21( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
        float vnoise( vec2 p ) {
          vec2 i = floor( p ), f = fract( p );
          f = f * f * ( 3.0 - 2.0 * f );
          return mix( mix( h21( i ), h21( i + vec2( 1, 0 ) ), f.x ), mix( h21( i + vec2( 0, 1 ) ), h21( i + vec2( 1, 1 ) ), f.x ), f.y );
        }
        void main() {
          vec3 d = normalize( vDir );
          float up = max( d.y, 0.0 );
          vec3 c = mix( horizon, zenith, pow( up, 0.42 ) );
          // moon: disc + soft halo (the halo stays small so it reads as haze, not a lamp)
          float m = dot( d, moonDir );
          c += vec3( 0.95, 0.96, 1.0 ) * smoothstep( ${MOON_SIZE - 0.00008}, ${MOON_SIZE}, m ) * 1.6;
          c += vec3( 0.18, 0.21, 0.3 ) * pow( max( m, 0.0 ), 600.0 ) + vec3( 0.04, 0.05, 0.08 ) * pow( max( m, 0.0 ), 40.0 );
          // clouds on a plane overhead, lit by the city: brighter and warmer towards the horizon
          if ( d.y > 0.0 ) {
            vec2 uv = d.xz / ( d.y + 0.12 ) * 1.4 + vec2( time * 0.006, time * 0.002 );
            float n = vnoise( uv ) * 0.55 + vnoise( uv * 2.3 ) * 0.3 + vnoise( uv * 5.1 ) * 0.15;
            float cm = smoothstep( 0.62 - 0.35 * cloud, 0.9, n ) * smoothstep( 0.0, 0.12, d.y );
            vec3 lit = horizon * ( 1.35 - 0.6 * up ) + vec3( 0.01 );
            c = mix( c, lit, cm * 0.85 );
          }
          gl_FragColor = vec4( c, opacity );
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      fog: false,
      side: THREE.BackSide,
    });
    this.u = mat.uniforms;
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(100, 24, 12), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -2; // before the stars
    scene.add(this.mesh);
  }

  /** twilight: 0 = day (hidden) .. 1 = full night. */
  update(dt: number, twilight: number, horizon: THREE.Color, moonDir: THREE.Vector3, cloud: number, focus: THREE.Vector3) {
    this.mesh.visible = twilight > 0.001;
    if (!this.mesh.visible) return;
    this.mesh.position.copy(focus);
    this.u.opacity.value = twilight;
    (this.u.horizon.value as THREE.Color).copy(horizon);
    (this.u.moonDir.value as THREE.Vector3).copy(moonDir);
    this.u.cloud.value = cloud;
    this.u.time.value += dt;
  }
}

/**
 * Image-based light that follows the sky: a small vertex-coloured dome (zenith, horizon, ground,
 * a warm glow round the sun; overcast grey; the city's orange glow at night) re-baked into a PMREM
 * at most every REBAKE_EVERY seconds, and only when it has visibly changed (one small cube target, re-filtered in place: ~15 ms in a slow preview pane, a few ms on a laptop GPU; a few dozen times a game day, mostly at dawn / dusk). Paint, glass and
 * puddles then reflect a sunset at sunset and a dark sky at night. A bake is ~1-3 ms on an iGPU.
 */
const REBAKE_EVERY = 15; // s (real)
const CHANGE = 0.05; // largest colour channel change that triggers a rebake
const BAKE_SIZE = 32; // cube face px: a smooth gradient needs no more

const DAY_ZENITH = new THREE.Color(0.32, 0.5, 0.95);
const DAY_HORIZON = new THREE.Color(1.5, 1.5, 1.45);
const DAY_GROUND = new THREE.Color(0.34, 0.3, 0.26);
const DUSK_ZENITH = new THREE.Color(0.22, 0.26, 0.55);
const DUSK_HORIZON = new THREE.Color(1.3, 0.75, 0.45);
const NIGHT_ENV_ZENITH = new THREE.Color(0.05, 0.07, 0.14);
const NIGHT_ENV_HORIZON = new THREE.Color(0.32, 0.24, 0.17); // street lights on the haze
const NIGHT_GROUND = new THREE.Color(0.06, 0.05, 0.04);
const OVERCAST = new THREE.Color(0.85, 0.88, 0.9);
const SUN_GLOW = new THREE.Color(1.8, 1.2, 0.7);

export interface SkyState { day: number; dusk: number; cloud: number; rain: number; sunDir: THREE.Vector3 }

export class EnvBaker {
  private readonly renderer: THREE.WebGLRenderer;
  /** One small cube target, reused: three re-filters it in place (needsPMREMUpdate), no new buffers. */
  private readonly cube = new THREE.WebGLCubeRenderTarget(BAKE_SIZE, { type: THREE.HalfFloatType });
  private readonly cam = new THREE.CubeCamera(0.1, 100, this.cube);
  private baked = false;
  private readonly geo = new THREE.SphereGeometry(10, 32, 16);
  private readonly dome: THREE.Scene;
  private wait = 0;
  private readonly last = { zen: new THREE.Color(-1, 0, 0), hor: new THREE.Color(), glow: 0 };
  private readonly zen = new THREE.Color();
  private readonly hor = new THREE.Color();
  private readonly gnd = new THREE.Color();
  private readonly c = new THREE.Color();
  private readonly v = new THREE.Vector3();

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.geo.attributes.position.count * 3), 3));
    this.dome = new THREE.Scene().add(new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  }

  /** Call every frame; returns the environment texture (re-baked when the sky has changed). */
  update(dt: number, s: SkyState) {
    this.wait -= dt;
    if (this.baked && this.wait > 0) return this.cube.texture;
    this.wait = REBAKE_EVERY;
    // Colours for this moment of the day.
    this.zen.copy(NIGHT_ENV_ZENITH).lerp(DAY_ZENITH, s.day).lerp(DUSK_ZENITH, s.dusk * 0.7);
    this.hor.copy(NIGHT_ENV_HORIZON).lerp(DAY_HORIZON, s.day).lerp(DUSK_HORIZON, s.dusk * 0.8);
    this.gnd.copy(NIGHT_GROUND).lerp(DAY_GROUND, s.day);
    const grey = Math.max(s.cloud * 0.7, s.rain);
    const bright = 0.2 + 0.8 * s.day;
    this.c.copy(OVERCAST).multiplyScalar(bright * (1 - 0.35 * s.rain));
    this.zen.lerp(this.c, grey);
    this.hor.lerp(this.c, grey * 0.8);
    const glow = Math.max(s.day, s.dusk) * (1 - grey);
    const changed = Math.max(Math.abs(this.zen.r - this.last.zen.r), Math.abs(this.zen.b - this.last.zen.b), Math.abs(this.hor.r - this.last.hor.r), Math.abs(this.hor.g - this.last.hor.g), Math.abs(glow - this.last.glow));
    if (this.baked && changed < CHANGE) return this.cube.texture;
    this.last.zen.copy(this.zen);
    this.last.hor.copy(this.hor);
    this.last.glow = glow;

    const p = this.geo.attributes.position;
    const col = this.geo.attributes.color as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      this.v.fromBufferAttribute(p, i).multiplyScalar(0.1); // unit direction
      const h = this.v.y;
      if (h >= 0) this.c.lerpColors(this.hor, this.zen, Math.pow(h, 0.5));
      else this.c.lerpColors(this.hor, this.gnd, Math.min(1, -h * 6));
      const toSun = Math.max(0, this.v.dot(s.sunDir));
      this.c.r += SUN_GLOW.r * glow * Math.pow(toSun, 6);
      this.c.g += SUN_GLOW.g * glow * Math.pow(toSun, 6);
      this.c.b += SUN_GLOW.b * glow * Math.pow(toSun, 6);
      col.setXYZ(i, this.c.r, this.c.g, this.c.b);
    }
    col.needsUpdate = true;
    this.cam.update(this.renderer, this.dome);
    this.cube.texture.needsPMREMUpdate = true;
    this.baked = true;
    return this.cube.texture;
  }
}

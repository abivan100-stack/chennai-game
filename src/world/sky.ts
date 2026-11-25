import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { istClock, sunDirection } from './solar';
import { NightSky, type SkyState } from './skyDome';

/** Holding T: game hours that pass per real second. */
const FAST_FORWARD_HOURS_PER_SEC = 1;
/** Game time runs this much faster than real time: 3 real seconds = 1 game minute (a day in 72 min). */
export const TIME_SCALE = 20;
/** Half-size of the shadow camera box around the player, metres. Small = sharp + cheap. */
const SHADOW_RANGE = 25;
const LIGHT_DISTANCE = 60;

const RAIN_FOG = new THREE.Color(0x9aa3ab);
const NIGHT_FOG = new THREE.Color(0x1c2644);
const DAY_FOG = new THREE.Color(0xbfd0da);
const DUSK_FOG = new THREE.Color(0xd08a62);
const NIGHT_SKY = new THREE.Color(0x8496d8);
const STREETLIGHT_BOUNCE = new THREE.Color(0x6a5238);
const DAY_SKY = new THREE.Color(0xcfe3ff);
const SUN_LOW = new THREE.Color(0xff9a55);
const SUN_HIGH = new THREE.Color(0xfff2e0);
const MOON = new THREE.Color(0x8fa8ff);

const STAR_COUNT = 700;
const STAR_DIST = 185; // inside the camera's 200 m far plane, beyond the fog
const UP = new THREE.Vector3(0, 1, 0);

/** Smoothstep that also works with edge0 > edge1. */
function smooth(edge0: number, edge1: number, x: number) {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Sky, sun/moon light, ambient and fog, all driven by real Chennai time (IST)
 * plus a debug offset. One directional light; its shadow box follows the player.
 */
/** Brightest the sky may get (linear): the sun disc is capped here. */
const SKY_MAX = 5;

export class DayNight {
  readonly sun = new THREE.DirectionalLight();
  private readonly hemi = new THREE.HemisphereLight();
  private readonly sky = new Sky();
  private readonly nightSky: NightSky;
  private readonly moonDir = new THREE.Vector3();
  /** For the reflection baker (skyDome.EnvBaker). */
  readonly skyState: SkyState = { day: 1, dusk: 0, cloud: 0, rain: 0, sunDir: new THREE.Vector3(0, 1, 0) };
  private readonly fog = new THREE.Fog(0xffffff, 50, 170);
  private readonly sunDir = new THREE.Vector3();
  private readonly stars: THREE.Points;
  private readonly snapPos = new THREE.Vector3();
  private readonly lightX = new THREE.Vector3();
  private readonly lightY = new THREE.Vector3();
  /** 0 = daylight, 1 = full night (drives windows, street lamps, headlights). */
  night = 0;
  /** Weather inputs (0..1), set by Weather each frame. */
  rain = 0;
  cloud = 0;
  /** In-game clock (ms timestamp). Starts at the real Chennai time; a save can set it. */
  timeMs = Date.now();
  private effects = true;

  constructor(scene: THREE.Scene) {
    scene.fog = this.fog;
    scene.background = this.fog.color; // same Color object, so it tracks the fog
    this.sky.scale.setScalar(1000);
    // The sun disc is thousands of times brighter than the sky: bloom (core/post.ts) would smear it
    // over half the screen. Capped just over the bloom threshold, it keeps a small glow.
    this.sky.material.fragmentShader = this.sky.material.fragmentShader.replace(
      'gl_FragColor = vec4( texColor, 1.0 );',
      `gl_FragColor = vec4( min( texColor, vec3( ${SKY_MAX.toFixed(1)} ) ), 1.0 );`,
    );
    const u = this.sky.material.uniforms;
    u.turbidity.value = 8; // Chennai haze
    u.rayleigh.value = 2;
    u.mieCoefficient.value = 0.005;
    u.mieDirectionalG.value = 0.8;
    scene.add(this.sky, this.hemi, this.sun, this.sun.target);
    this.nightSky = new NightSky(scene);

    // Stars: one draw call of points on the upper dome, faded in at night and out under cloud.
    const pts = new Float32Array(STAR_COUNT * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < STAR_COUNT; i++) {
      v.set(Math.random() * 2 - 1, Math.random() * 0.95 + 0.05, Math.random() * 2 - 1).normalize().multiplyScalar(STAR_DIST);
      v.toArray(pts, i * 3);
    }
    const starGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pts, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xdfe6ff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, depthWrite: false }));
    this.stars.frustumCulled = false; // it follows the player; its bounds don't
    this.stars.renderOrder = -1;
    scene.add(this.stars);

    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -SHADOW_RANGE;
    cam.right = cam.top = SHADOW_RANGE;
    cam.near = 1;
    cam.far = LIGHT_DISTANCE * 2;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.03;
  }

  get clockLabel() {
    return `${istClock(this.timeMs)} IST`;
  }

  update(dt: number, fastForward: boolean, focus: THREE.Vector3) {
    this.timeMs += dt * 1000 * (fastForward ? FAST_FORWARD_HOURS_PER_SEC * 3600 : TIME_SCALE);
    const d = sunDirection(this.timeMs);
    this.sunDir.set(d.x, d.y, d.z);
    const e = d.y; // sin(elevation)

    const day = smooth(-0.1, 0.3, e);
    this.night = 1 - smooth(-0.06, 0.1, e); // street lights come on around sunset
    const dusk = 1 - smooth(0, 0.25, Math.abs(e + 0.02)); // peaks around sunrise/sunset

    // Sun by day, a dim bluish "moon" from the opposite side by night.
    const sunI = 3.8 * smooth(-0.02, 0.12, e);
    const moonI = 1.0 * smooth(0, -0.12, e);
    if (sunI > 0) {
      this.sun.intensity = sunI * (1 - 0.65 * this.cloud); // overcast dims the sun
      this.sun.color.lerpColors(SUN_LOW, SUN_HIGH, smooth(0, 0.4, e));
      this.sun.position.copy(this.sunDir);
    } else {
      this.sun.intensity = moonI;
      this.sun.color.copy(MOON);
      this.sun.position.copy(this.sunDir).negate();
    }
    // Move the shadow box in whole shadow-map texels (in the light's own axes), so shadow edges
    // don't crawl as the player moves.
    const dir = this.sun.position; // unit, towards the light
    this.snapPos.copy(focus);
    if (this.lightX.crossVectors(UP, dir).lengthSq() > 1e-4) {
      this.lightX.normalize();
      this.lightY.crossVectors(dir, this.lightX);
      const texel = (2 * SHADOW_RANGE) / this.sun.shadow.mapSize.x;
      const fx = focus.dot(this.lightX);
      const fy = focus.dot(this.lightY);
      this.snapPos.addScaledVector(this.lightX, Math.round(fx / texel) * texel - fx).addScaledVector(this.lightY, Math.round(fy / texel) * texel - fy);
    }
    this.sun.target.position.copy(this.snapPos);
    this.sun.position.multiplyScalar(LIGHT_DISTANCE).add(this.snapPos);

    this.stars.position.copy(focus);
    const starI = this.night * (1 - this.cloud);
    this.stars.visible = starI > 0.02;
    (this.stars.material as THREE.PointsMaterial).opacity = starI;

    // Day: strong sun over a low sky fill, so shadows read and shapes have depth.
    // Night: brighter moonlit sky fill plus a warm bounce from the street lights off the ground.
    this.hemi.intensity = 2.3 - 1.5 * day;
    this.hemi.color.lerpColors(NIGHT_SKY, DAY_SKY, day);
    this.hemi.groundColor.setHex(0x3a3328).multiplyScalar(0.3 + 0.7 * day).lerp(STREETLIGHT_BOUNCE, 1 - day);

    this.fog.color.lerpColors(NIGHT_FOG, DAY_FOG, day).lerp(DUSK_FOG, dusk * 0.6);
    // Rain: grey, closer fog.
    this.fog.color.lerp(RAIN_FOG.clone().multiplyScalar(0.3 + 0.7 * day), this.rain * 0.7);
    this.fog.near = 50 - 35 * this.rain;
    this.fog.far = 170 - 90 * this.rain;

    // The Preetham sky goes pitch black after dusk: the night dome (skyDome.ts) fades in over it.
    this.sky.visible = this.effects && e > -0.1;
    this.moonDir.copy(this.sunDir).negate(); // the "moon" light shines from opposite the sun
    this.nightSky.update(dt, this.effects ? smooth(0, -0.1, e) : 0, this.fog.color, this.moonDir, this.cloud, focus);
    const st = this.skyState;
    st.day = day;
    st.dusk = dusk;
    st.cloud = this.cloud;
    st.rain = this.rain;
    st.sunDir.copy(this.sunDir);
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(this.sunDir);
    u.time.value += dt;
    u.cloudCoverage.value = 0.3 + 0.6 * this.cloud;
    u.cloudDensity.value = 0.4 + 0.5 * this.cloud;
  }

  /** Effects off = skip the per-pixel sky/cloud shader; the fog-coloured background shows instead. */
  setEffects(on: boolean) {
    this.effects = on;
  }

  setShadowMapSize(size: number) {
    this.sun.castShadow = size > 0;
    if (size > 0 && this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null; // three re-creates it at the new size
    }
  }
}

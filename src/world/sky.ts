import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { istClock, sunDirection } from './solar';

/** Holding T: game hours that pass per real second. */
const FAST_FORWARD_HOURS_PER_SEC = 1;
/** Half-size of the shadow camera box around the player, metres. Small = sharp + cheap. */
const SHADOW_RANGE = 25;
const LIGHT_DISTANCE = 60;

const NIGHT_FOG = new THREE.Color(0x1c2644);
const DAY_FOG = new THREE.Color(0xbfd0da);
const DUSK_FOG = new THREE.Color(0xd08a62);
const NIGHT_SKY = new THREE.Color(0x7084c8);
const DAY_SKY = new THREE.Color(0xcfe3ff);
const SUN_LOW = new THREE.Color(0xff9a55);
const SUN_HIGH = new THREE.Color(0xfff2e0);
const MOON = new THREE.Color(0x8fa8ff);

/** Smoothstep that also works with edge0 > edge1. */
function smooth(edge0: number, edge1: number, x: number) {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Sky, sun/moon light, ambient and fog, all driven by real Chennai time (IST)
 * plus a debug offset. One directional light; its shadow box follows the player.
 */
export class DayNight {
  readonly sun = new THREE.DirectionalLight();
  private readonly hemi = new THREE.HemisphereLight();
  private readonly sky = new Sky();
  private readonly fog = new THREE.Fog(0xffffff, 50, 170);
  private readonly sunDir = new THREE.Vector3();
  /** 0 = daylight, 1 = full night (drives windows, street lamps, headlights). */
  night = 0;
  private offsetMs = 0;
  private effects = true;

  constructor(scene: THREE.Scene) {
    scene.fog = this.fog;
    scene.background = this.fog.color; // same Color object, so it tracks the fog
    this.sky.scale.setScalar(1000);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 8; // Chennai haze
    u.rayleigh.value = 2;
    u.mieCoefficient.value = 0.005;
    u.mieDirectionalG.value = 0.8;
    scene.add(this.sky, this.hemi, this.sun, this.sun.target);

    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -SHADOW_RANGE;
    cam.right = cam.top = SHADOW_RANGE;
    cam.near = 1;
    cam.far = LIGHT_DISTANCE * 2;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.03;
  }

  /** In-game time: real time + debug fast-forward. */
  get timeMs() {
    return Date.now() + this.offsetMs;
  }

  get clockLabel() {
    return `${istClock(this.timeMs)} IST`;
  }

  update(dt: number, fastForward: boolean, focus: THREE.Vector3) {
    if (fastForward) this.offsetMs += dt * FAST_FORWARD_HOURS_PER_SEC * 3600_000;
    const d = sunDirection(this.timeMs);
    this.sunDir.set(d.x, d.y, d.z);
    const e = d.y; // sin(elevation)

    const day = smooth(-0.1, 0.3, e);
    this.night = 1 - smooth(-0.06, 0.1, e); // street lights come on around sunset
    const dusk = 1 - smooth(0, 0.25, Math.abs(e + 0.02)); // peaks around sunrise/sunset

    // Sun by day, a dim bluish "moon" from the opposite side by night.
    const sunI = 3 * smooth(-0.02, 0.12, e);
    const moonI = 0.7 * smooth(0, -0.12, e);
    if (sunI > 0) {
      this.sun.intensity = sunI;
      this.sun.color.lerpColors(SUN_LOW, SUN_HIGH, smooth(0, 0.4, e));
      this.sun.position.copy(this.sunDir);
    } else {
      this.sun.intensity = moonI;
      this.sun.color.copy(MOON);
      this.sun.position.copy(this.sunDir).negate();
    }
    this.sun.position.multiplyScalar(LIGHT_DISTANCE).add(focus);
    this.sun.target.position.copy(focus);
    // ponytail: no texel snapping, so shadow edges may shimmer slightly while moving. Snap if it bothers.

    // Night stays readable: moonlit blue ambient, not black. Streetlights come later.
    this.hemi.intensity = 1.6 - 0.35 * day;
    this.hemi.color.lerpColors(NIGHT_SKY, DAY_SKY, day);
    this.hemi.groundColor.setHex(0x3a3328).multiplyScalar(0.3 + 0.7 * day);

    this.fog.color.lerpColors(NIGHT_FOG, DAY_FOG, day).lerp(DUSK_FOG, dusk * 0.6);

    // The Preetham sky goes pitch black after dusk; below that, the flat fog-coloured background reads better.
    this.sky.visible = this.effects && e > -0.05;
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(this.sunDir);
    u.time.value += dt;
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

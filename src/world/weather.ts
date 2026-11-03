import * as THREE from 'three';

/** Chennai (Mylapore). */
const LAT = 13.03;
const LON = 80.27;
const URL = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,precipitation,weather_code,cloud_cover&timezone=Asia%2FKolkata`;
const REFRESH_MS = 10 * 60 * 1000;
const RAIN_DROPS = 2500;
const RAIN_BOX = 40; // metres around the camera
const FALL_SPEED = 18; // m/s
const ROOF_CELL = 2; // m: roof heights are looked up (and cached) per cell of this size
const ROOF_CACHE_MAX = 20000;

/** WMO weather codes -> short English + Tanglish-ish description. */
function describe(code: number) {
  if (code >= 95) return 'Thunderstorm';
  if (code >= 80) return 'Rain showers';
  if (code >= 61) return 'Rain';
  if (code >= 51) return 'Drizzle';
  if (code >= 45) return 'Fog';
  if (code >= 3) return 'Cloudy';
  if (code >= 1) return 'Partly cloudy';
  return 'Clear';
}

/**
 * Real Chennai weather from Open-Meteo (no API key; CORS-friendly). Falls back to clear skies
 * if offline. `rain` (0..1) and `cloud` (0..1) drive the sky, fog, wet roads and rain streaks.
 * R (debug) cycles: live -> heavy rain -> clear -> live.
 */
export class Weather {
  tempC: number | null = null;
  description = 'Loading…';
  /** 0 = dry .. 1 = heavy rain, smoothed. */
  rain = 0;
  cloud = 0;
  private liveRain = 0;
  private liveCloud = 0;
  private override: 'rain' | 'clear' | null = null;
  private readonly drops: THREE.LineSegments;
  private readonly positions: Float32Array;
  /** Height each drop stops at (the ground, or a roof / flyover above it). */
  private readonly floors = new Float32Array(RAIN_DROPS);
  /** Topmost static surface at (x, z) (set by main once physics exists); null = open sky everywhere. */
  roofAt: ((x: number, z: number) => number) | null = null;
  private readonly roofCache = new Map<number, number>();

  constructor(scene: THREE.Scene) {
    // Rain: short vertical streaks recycled inside a box that follows the camera.
    this.positions = new Float32Array(RAIN_DROPS * 6);
    for (let i = 0; i < RAIN_DROPS; i++) this.resetDrop(i, new THREE.Vector3(), Math.random() * RAIN_BOX);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.drops = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xaab8c8, transparent: true, opacity: 0, depthWrite: false }));
    this.drops.frustumCulled = false;
    this.drops.visible = false;
    scene.add(this.drops);
    this.fetch();
    setInterval(() => this.fetch(), REFRESH_MS);
  }

  /** Short label for the phone status bar. */
  get label() {
    const t = this.tempC === null ? '' : `${Math.round(this.tempC)}°C `;
    return `${t}${this.override ? (this.override === 'rain' ? 'Rain (test)' : 'Clear (test)') : this.description}`;
  }

  cycleOverride() {
    this.override = this.override === null ? 'rain' : this.override === 'rain' ? 'clear' : null;
    console.log(`[weather] override: ${this.override ?? 'live'}`);
  }

  private async fetch() {
    try {
      const res = await fetch(URL);
      const j = await res.json();
      const c = j.current;
      this.tempC = c.temperature_2m;
      this.description = describe(c.weather_code);
      // 4 mm/h and up counts as heavy.
      this.liveRain = Math.min(1, (c.precipitation ?? 0) / 4) || (c.weather_code >= 51 ? 0.3 : 0);
      this.liveCloud = (c.cloud_cover ?? 0) / 100;
      console.log(`[weather] ${this.description}, ${this.tempC}°C, rain ${c.precipitation} mm, cloud ${c.cloud_cover}%`);
    } catch {
      this.description = 'Clear (offline)';
    }
  }

  update(dt: number, camera: THREE.Vector3) {
    const wantRain = this.override === 'rain' ? 1 : this.override === 'clear' ? 0 : this.liveRain;
    const wantCloud = this.override === 'rain' ? 1 : this.override === 'clear' ? 0.1 : Math.max(this.liveCloud, wantRain);
    const k = 1 - Math.exp(-0.5 * dt); // weather changes over a few seconds
    this.rain += (wantRain - this.rain) * k;
    this.cloud += (wantCloud - this.cloud) * k;

    const mat = this.drops.material as THREE.LineBasicMaterial;
    mat.opacity = Math.min(0.55, this.rain * 0.7);
    this.drops.visible = this.rain > 0.02;
    if (!this.drops.visible) return;
    const active = Math.floor(RAIN_DROPS * this.rain);
    const p = this.positions;
    for (let i = 0; i < RAIN_DROPS; i++) {
      const o = i * 6;
      if (i >= active) {
        p[o + 1] = p[o + 4] = -1000; // parked below the ground
        continue;
      }
      p[o + 1] -= FALL_SPEED * dt;
      p[o + 4] -= FALL_SPEED * dt;
      if (p[o + 4] < this.floors[i] || Math.abs(p[o] - camera.x) > RAIN_BOX / 2 || Math.abs(p[o + 2] - camera.z) > RAIN_BOX / 2) {
        this.resetDrop(i, camera, RAIN_BOX * 0.6);
      }
    }
    this.drops.geometry.attributes.position.needsUpdate = true;
  }

  /** Cached roof height for the cell holding (x, z). */
  private roof(x: number, z: number) {
    if (!this.roofAt) return 0;
    const cx = Math.floor(x / ROOF_CELL);
    const cz = Math.floor(z / ROOF_CELL);
    const key = cx * 100003 + cz;
    let h = this.roofCache.get(key);
    if (h === undefined) {
      if (this.roofCache.size > ROOF_CACHE_MAX) this.roofCache.clear();
      h = this.roofAt((cx + 0.5) * ROOF_CELL, (cz + 0.5) * ROOF_CELL);
      this.roofCache.set(key, h);
    }
    return h;
  }

  private resetDrop(i: number, around: THREE.Vector3, top: number) {
    const o = i * 6;
    const x = around.x + (Math.random() - 0.5) * RAIN_BOX;
    const z = around.z + (Math.random() - 0.5) * RAIN_BOX;
    const floor = this.roof(x, z);
    this.floors[i] = floor;
    // Rain can't start below a roof: under cover, drops are born on the roof and die at once.
    const y = Math.max(around.y + Math.random() * top, floor);
    this.positions.set([x, y, z, x + 0.03, y + 0.6, z], o);
  }
}

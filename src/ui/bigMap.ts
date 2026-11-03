import type { Input } from '../core/input';
import { BOUNDS } from '../world/layout';
import { MAP_LAND, MAP_PPM, MAP_SEA, drawCrop, drawOverlay, drawPin, drawRoute, mapPx, type Dest, type Poi, type TownMap } from './mapArt';

const ZOOM = { min: 0.9, max: 9, start: 2.6, step: 1.18 }; // screen px per metre
const PAN_SPEED = 320; // screen px per second
const PICK_PX = 16; // how close a click has to be to an icon
/** Legend rows: badge colour, icon, meaning. */
const LEGEND: [string, string, string][] = [
  ['#d84315', '⛽', 'Petrol bunk'],
  ['#37474f', '🔧', 'Mechanic'],
  ['#0d47a1', '₹', 'ATM / bank'],
  ['#1b5e20', '+', 'Medicals'],
  ['#d32f2f', 'H', 'Hospital'],
  ['#1c3f8f', 'P', 'Police'],
  ['#2e7d32', 'S', 'Supermarket'],
  ['#7a4a2a', '☕', 'Cafe'],
  ['#f4a000', 'M', 'MRTS / Metro'],
  ['#1565c0', 'B', 'Ride stop'],
];

export interface BigMapState {
  player: { x: number; z: number; yaw: number };
  auto: { x: number; z: number } | null;
  marker: { x: number; z: number; kind: 'pickup' | 'drop' } | null;
  guide: { x: number; z: number }[] | null;
  police: { x: number; z: number }[];
  /** Where the navigation is taking you (chosen on this map or the phone). */
  dest: Dest | null;
  /** Metres left on the route to dest. */
  destLeft: number;
}

const el = (tag: string, css: string, text = '') => {
  const e = document.createElement(tag);
  e.style.cssText = css;
  e.textContent = text;
  return e;
};

/**
 * Full-screen map (Tab). Drag or WASD to pan, wheel / + - to zoom (towards the cursor), C to
 * centre on yourself. Click a place (or anywhere) to navigate there; right-click or X clears it.
 * Place icons and names are drawn at screen size and never pile on top of each other.
 */
export class BigMap {
  isOpen = false;
  /** Called with a new destination, or null to stop navigating. */
  onNavigate: (d: Dest | null) => void = () => {};
  private readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly town: TownMap;
  private readonly navCard: HTMLDivElement;
  private readonly legend: HTMLDivElement;
  private zoom = ZOOM.start;
  private cx = 0;
  private cz = 0;
  private wheel = 0;
  private wheelAt = { x: 0, y: 0 };
  private mouse = { x: -1, y: -1 };
  private drag: { x: number; y: number; moved: boolean } | null = null;
  private icons: { poi: Poi; x: number; y: number }[] = [];
  private hover: Poi | null = null;

  constructor(town: TownMap) {
    this.town = town;
    this.root = el('div', 'position:fixed;inset:0;z-index:7;display:none;background:' + MAP_LAND + ';font:14px system-ui,sans-serif;user-select:none') as HTMLDivElement;
    this.canvas = el('canvas', 'position:absolute;inset:0;width:100%;height:100%;cursor:grab') as HTMLCanvasElement;
    const card = 'position:absolute;background:#fffffff2;color:#222;border-radius:14px;box-shadow:0 4px 18px #0003;';
    const title = el('div', card + 'left:16px;top:16px;padding:10px 16px;');
    title.append(el('div', 'font:800 18px system-ui,sans-serif', 'Chennai · Mylapore & around'), el('div', 'color:#666;font-size:12px;margin-top:2px', 'Click a place to go there · drag to move · wheel to zoom'));
    this.navCard = el('div', card + 'left:50%;top:16px;transform:translateX(-50%);padding:10px 16px;display:none;align-items:center;gap:12px;font-weight:700;') as HTMLDivElement;
    this.legend = el('div', card + 'right:16px;top:16px;padding:10px 14px;display:grid;grid-template-columns:auto auto;gap:4px 14px;font-size:12px;') as HTMLDivElement;
    for (const [c, s, t] of LEGEND) {
      const row = el('div', 'display:flex;align-items:center;gap:6px');
      row.append(el('span', `display:inline-grid;place-items:center;width:18px;height:18px;border-radius:50%;background:${c};color:#fff;font:700 11px system-ui;border:1.5px solid #fff;box-shadow:0 1px 2px #0005`, s), t);
      this.legend.append(row);
    }
    const keys = el('div', card + 'left:16px;bottom:16px;padding:8px 14px;color:#555;font-size:12px', 'WASD / drag pan · + − zoom · C centre · L legend · X clear route · right-click clear · Tab close');
    const zoomBox = el('div', 'position:absolute;right:16px;bottom:16px;display:flex;flex-direction:column;gap:6px');
    const btn = (t: string, f: () => void) => {
      const b = el('button', 'width:40px;height:40px;border:0;border-radius:10px;background:#fff;box-shadow:0 2px 8px #0003;font:700 20px system-ui;cursor:pointer;color:#333', t);
      b.onclick = f;
      return b;
    };
    zoomBox.append(btn('+', () => this.zoomBy(1)), btn('−', () => this.zoomBy(-1)), btn('◎', () => (this.recentre = true)));
    this.root.append(this.canvas, title, this.navCard, this.legend, keys, zoomBox);
    document.body.append(this.root);
    this.g = this.canvas.getContext('2d')!;

    const pos = (e: MouseEvent) => ({ x: e.clientX, y: e.clientY });
    this.canvas.addEventListener('wheel', (e) => {
      this.wheel += Math.sign(e.deltaY);
      this.wheelAt = pos(e);
    }, { passive: true });
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.drag = { ...pos(e), moved: false };
    });
    window.addEventListener('mousemove', (e) => {
      this.mouse = pos(e);
      if (!this.drag || !this.isOpen) return;
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) this.drag.moved = true;
      if (this.drag.moved) {
        this.cx -= dx / this.zoom;
        this.cz -= dy / this.zoom;
        this.drag.x = e.clientX;
        this.drag.y = e.clientY;
      }
    });
    window.addEventListener('mouseup', (e) => {
      const d = this.drag;
      this.drag = null;
      if (!this.isOpen || !d || d.moved || e.button !== 0) return;
      // A click (not a drag): go to the place under the cursor, or drop a pin there.
      if (this.hover) this.onNavigate({ name: this.hover.name, x: this.hover.x, z: this.hover.z });
      else this.onNavigate({ name: 'Dropped pin', ...this.toWorld(e.clientX, e.clientY) });
    });
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.onNavigate(null);
    });
  }

  private recentre = false;

  private toWorld(sx: number, sy: number) {
    return { x: this.cx + (sx - window.innerWidth / 2) / this.zoom, z: this.cz + (sy - window.innerHeight / 2) / this.zoom };
  }

  /** Zoom in / out by `steps`, keeping the world point under (sx, sy) where it is. */
  private zoomBy(steps: number, sx = window.innerWidth / 2, sy = window.innerHeight / 2) {
    const before = this.toWorld(sx, sy);
    this.zoom = Math.min(ZOOM.max, Math.max(ZOOM.min, this.zoom * Math.pow(ZOOM.step, steps)));
    const after = this.toWorld(sx, sy);
    this.cx += before.x - after.x;
    this.cz += before.z - after.z;
  }

  toggle(around: { x: number; z: number }) {
    this.isOpen = !this.isOpen;
    this.root.style.display = this.isOpen ? 'block' : 'none';
    if (this.isOpen) {
      document.exitPointerLock(); // free the mouse for clicking places
      this.cx = around.x;
      this.cz = around.z;
    }
  }

  update(dt: number, input: Input, s: BigMapState) {
    if (!this.isOpen) return;
    if (this.wheel) this.zoomBy(-this.wheel, this.wheelAt.x, this.wheelAt.y);
    this.wheel = 0;
    if (input.wasPressed('Equal') || input.wasPressed('NumpadAdd') || input.wasPressed('KeyE')) this.zoomBy(1);
    if (input.wasPressed('Minus') || input.wasPressed('NumpadSubtract') || input.wasPressed('KeyQ')) this.zoomBy(-1);
    const pan = (PAN_SPEED * dt) / this.zoom;
    if (input.isDown('KeyW') || input.isDown('ArrowUp')) this.cz -= pan;
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) this.cz += pan;
    if (input.isDown('KeyA') || input.isDown('ArrowLeft')) this.cx -= pan;
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) this.cx += pan;
    if (input.wasPressed('KeyC') || this.recentre) {
      this.cx = s.player.x;
      this.cz = s.player.z;
      this.recentre = false;
    }
    if (input.wasPressed('KeyL')) this.legend.style.display = this.legend.style.display === 'none' ? 'grid' : 'none';
    if (input.wasPressed('KeyX')) this.onNavigate(null);
    this.cx = Math.min(BOUNDS.x1 + 60, Math.max(BOUNDS.x0, this.cx));
    this.cz = Math.min(BOUNDS.z1, Math.max(BOUNDS.z0, this.cz));
    // Hover: the nearest icon under the cursor.
    this.hover = null;
    let best = PICK_PX;
    for (const ic of this.icons) {
      const d = Math.hypot(ic.x - this.mouse.x, ic.y - this.mouse.y);
      if (d < best) {
        best = d;
        this.hover = ic.poi;
      }
    }
    this.canvas.style.cursor = this.drag?.moved ? 'grabbing' : this.hover ? 'pointer' : 'crosshair';
    this.navCard.style.display = s.dest ? 'flex' : 'none';
    if (s.dest) this.navCard.textContent = `🧭 ${s.dest.name} · ${fmtDist(s.destLeft)} · X / right-click to clear`;
    this.draw(s);
  }

  private draw(s: BigMapState) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.round(window.innerWidth * dpr);
    const H = Math.round(window.innerHeight * dpr);
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
    }
    const g = this.g;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = W / dpr;
    const h = H / dpr;
    const k = this.zoom;
    const S = (x: number, z: number) => ({ x: w / 2 + (x - this.cx) * k, y: h / 2 + (z - this.cz) * k });
    g.fillStyle = MAP_LAND;
    g.fillRect(0, 0, w, h);
    // The sea carries on past the edge of the town picture.
    const east = S(BOUNDS.x1, 0).x;
    g.fillStyle = MAP_SEA;
    if (east < w) g.fillRect(east - 1, 0, w - east + 1, h);
    const sw = (w / k) * MAP_PPM;
    const sh = (h / k) * MAP_PPM;
    g.imageSmoothingQuality = 'high';
    drawCrop(g, this.town.canvas, mapPx(this.cx) - sw / 2, mapPx(this.cz) - sh / 2, sw, sh, 0, 0, w, h);
    if (s.guide) drawRoute(g, s.guide, S, Math.max(4, k * 1.8));
    this.icons = drawOverlay(g, this.town, { k, w, h, toScreen: S, rotateStreets: true, highlight: this.hover });

    const dot = (x: number, z: number, fill: string, r: number) => {
      const p = S(x, z);
      g.fillStyle = fill;
      g.strokeStyle = '#fff';
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(p.x, p.y, r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    };
    if (s.auto) {
      const a = S(s.auto.x, s.auto.z);
      g.fillStyle = '#f5c400';
      g.strokeStyle = '#000';
      g.lineWidth = 2;
      g.beginPath();
      g.roundRect(a.x - 8, a.y - 8, 16, 16, 4);
      g.fill();
      g.stroke();
    }
    if (s.marker) dot(s.marker.x, s.marker.z, s.marker.kind === 'pickup' ? '#ffcc00' : '#2ecc71', 9);
    if (s.dest) {
      const d = S(s.dest.x, s.dest.z);
      drawPin(g, d.x, d.y, 1.1);
    }
    const flash = Math.floor(performance.now() / 250) % 2 === 0;
    s.police.forEach((p, i) => dot(p.x, p.z, (i % 2 === 0) === flash ? '#e53935' : '#1e5bff', 7));
    // You: a blue location dot with a heading cone, like a nav app.
    const p = S(s.player.x, s.player.z);
    g.save();
    g.translate(p.x, p.y);
    g.rotate(-s.player.yaw);
    const cone = g.createRadialGradient(0, 0, 0, 0, 0, 34);
    cone.addColorStop(0, '#2f7bffaa');
    cone.addColorStop(1, '#2f7bff00');
    g.fillStyle = cone;
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, 34, Math.PI / 2 - 0.5, Math.PI / 2 + 0.5);
    g.fill();
    g.restore();
    dot(s.player.x, s.player.z, '#2f7bff', 8);
    // Scale bar.
    const metres = k > 4 ? 25 : k > 2 ? 50 : k > 1.2 ? 100 : 200;
    g.fillStyle = '#333';
    g.fillRect(w - 80 - metres * k, h - 26, metres * k, 4);
    g.font = '700 12px system-ui, sans-serif';
    g.textAlign = 'right';
    g.fillText(`${metres} m`, w - 80, h - 34);
  }
}

export const fmtDist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`);

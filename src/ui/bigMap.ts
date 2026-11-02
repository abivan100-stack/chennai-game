import type { Input } from '../core/input';
import { BOUNDS } from '../world/layout';
import { MAP_LAND, MAP_PPM, drawCrop, drawLabel, drawRoute, mapPx, type TownMap } from './mapArt';

const ZOOM = { min: 1.2, max: 9, start: 2.6, step: 1.18 }; // screen px per metre
const PAN_SPEED = 260; // screen px per second
const LEGEND: [string, string, string][] = [
  ['#f5c400', '■', "Uncle's auto"],
  ['#ffcc00', '●', 'Pickup'],
  ['#2ecc71', '●', 'Drop-off'],
  ['#e53935', '●', 'Police'],
  ['#1565c0', 'B', 'Ride stop'],
  ['#2e7d32', 'S', 'Supermarket'],
  ['#1c3f8f', 'P', 'Police station'],
  ['#d32f2f', 'H', 'Isabel Hospital'],
  ['#d84315', '⛽', 'Petrol bunk'],
  ['#37474f', '🔧', 'Mechanic'],
  ['#0d47a1', '₹', 'Bank · ATM'],
  ['#1b5e20', '+', 'Pharmacy'],
  ['#222222', 'A', 'Auto stand · tea'],
  ['#7b1fa2', '🎬', 'Cinema'],
  ['#1d4fa8', 'D', 'MTC bus depot'],
  ['#f4a000', 'M', 'MRTS station'],
  ['#c62828', 'L', 'Lighthouse'],
  ['#c0472f', 'T', 'Kapaleeshwarar Temple'],
];

export interface BigMapState {
  player: { x: number; z: number; yaw: number };
  auto: { x: number; z: number } | null;
  marker: { x: number; z: number; kind: 'pickup' | 'drop' } | null;
  guide: { x: number; z: number }[] | null;
  police: { x: number; z: number }[];
}

/**
 * Full-screen map (Tab): the whole town, zoom with the wheel / + - / Q E, pan with WASD or the
 * arrows, C to centre on yourself. Street names and landmarks stay upright; you, the auto, the
 * job and the police are marked; a legend explains the icons.
 */
export class BigMap {
  isOpen = false;
  private readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly town: TownMap;
  private zoom = ZOOM.start;
  private cx = 0;
  private cz = 0;
  private wheel = 0;

  constructor(town: TownMap) {
    this.town = town;
    this.root = document.createElement('div');
    this.root.style.cssText = 'position:fixed;inset:0;z-index:7;display:none;background:#000c;';
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
    const legend = document.createElement('div');
    legend.style.cssText = 'position:absolute;right:20px;top:20px;padding:12px 16px;border-radius:12px;background:#fffaf0e8;color:#222;font:13px/1.7 system-ui,sans-serif;box-shadow:0 6px 20px #0006;';
    legend.innerHTML = '<b style="font-size:15px">Map</b><br>' + LEGEND.map(([c, s, t]) => `<span style="display:inline-block;width:18px;text-align:center;font-weight:800;color:${c}">${s}</span> ${t}`).join('<br>')
      + '<div style="margin-top:8px;color:#666;font-size:12px">Wheel / + − zoom · WASD pan · C centre · Tab close</div>';
    const title = document.createElement('div');
    title.style.cssText = 'position:absolute;left:24px;top:18px;color:#fff;font:800 22px system-ui,sans-serif;text-shadow:0 2px 6px #000;';
    title.textContent = 'Mylapore · Santhome · Mandaveli · Alwarpet · R.A. Puram · Adyar · Taramani';
    this.root.append(this.canvas, legend, title);
    document.body.append(this.root);
    this.g = this.canvas.getContext('2d')!;
    window.addEventListener('wheel', (e) => {
      if (this.isOpen) this.wheel += Math.sign(e.deltaY);
    }, { passive: true });
  }

  toggle(around: { x: number; z: number }) {
    this.isOpen = !this.isOpen;
    this.root.style.display = this.isOpen ? 'block' : 'none';
    if (this.isOpen) {
      this.cx = around.x;
      this.cz = around.z;
    }
  }

  update(dt: number, input: Input, s: BigMapState) {
    if (!this.isOpen) return;
    // Zoom (wheel, + / -, Q / E) and pan (WASD / arrows); C re-centres on the player.
    let z = -this.wheel;
    this.wheel = 0;
    if (input.wasPressed('Equal') || input.wasPressed('NumpadAdd') || input.wasPressed('KeyE')) z++;
    if (input.wasPressed('Minus') || input.wasPressed('NumpadSubtract') || input.wasPressed('KeyQ')) z--;
    if (z) this.zoom = Math.min(ZOOM.max, Math.max(ZOOM.min, this.zoom * Math.pow(ZOOM.step, z)));
    const pan = (PAN_SPEED * dt) / this.zoom;
    if (input.isDown('KeyW') || input.isDown('ArrowUp')) this.cz -= pan;
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) this.cz += pan;
    if (input.isDown('KeyA') || input.isDown('ArrowLeft')) this.cx -= pan;
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) this.cx += pan;
    if (input.wasPressed('KeyC')) {
      this.cx = s.player.x;
      this.cz = s.player.z;
    }
    this.cx = Math.min(BOUNDS.x1, Math.max(BOUNDS.x0, this.cx));
    this.cz = Math.min(BOUNDS.z1, Math.max(BOUNDS.z0, this.cz));
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
    // The pre-drawn town, cropped and scaled to the view.
    const sw = (w / k) * MAP_PPM;
    const sh = (h / k) * MAP_PPM;
    g.imageSmoothingQuality = 'high';
    drawCrop(g, this.town.canvas, mapPx(this.cx) - sw / 2, mapPx(this.cz) - sh / 2, sw, sh, 0, 0, w, h);
    if (s.guide) drawRoute(g, s.guide, S, Math.max(3, k * 1.6));
    // Labels: streets only when zoomed in enough to read them.
    for (const l of this.town.labels) {
      if (l.kind === 'street' && k < 2) continue;
      const p = S(l.x, l.z);
      if (p.x > -80 && p.x < w + 80 && p.y > -20 && p.y < h + 20) drawLabel(g, l, p.x, p.y);
    }
    const dot = (x: number, z: number, fill: string, r: number) => {
      const p = S(x, z);
      g.fillStyle = fill;
      g.strokeStyle = '#000';
      g.lineWidth = 2;
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
      g.fillRect(a.x - 7, a.y - 7, 14, 14);
      g.strokeRect(a.x - 7, a.y - 7, 14, 14);
    }
    if (s.marker) dot(s.marker.x, s.marker.z, s.marker.kind === 'pickup' ? '#ffcc00' : '#2ecc71', 9);
    const flash = Math.floor(performance.now() / 250) % 2 === 0;
    s.police.forEach((p, i) => dot(p.x, p.z, (i % 2 === 0) === flash ? '#e53935' : '#1e5bff', 7));
    // You: arrow pointing the way you face (yaw 0 = +z = down the map).
    const p = S(s.player.x, s.player.z);
    g.save();
    g.translate(p.x, p.y);
    g.rotate(-s.player.yaw);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#111';
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(0, 14);
    g.lineTo(10, -10);
    g.lineTo(0, -4);
    g.lineTo(-10, -10);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    // Scale bar.
    const metres = k > 4 ? 25 : k > 2 ? 50 : 100;
    g.fillStyle = '#222';
    g.fillRect(24, h - 34, metres * k, 5);
    g.font = '700 13px system-ui, sans-serif';
    g.fillText(`${metres} m`, 24, h - 42);
  }
}

import { MAP_LAND, MAP_PPM, drawLabel, drawRoute, mapPx, type MapLabel, type TownMap } from './mapArt';

const SIZE = 200; // px on screen
const VIEW_M = 80; // metres across the minimap
const REFRESH_MS = 40;

export interface MapMarker {
  x: number;
  z: number;
  kind: 'pickup' | 'drop';
}

export interface MinimapState {
  player: { x: number; z: number; yaw: number };
  /** Camera yaw: the map turns so "up" is where you're looking (heading-up, like GTA). */
  view: number;
  auto: { x: number; z: number };
  marker: MapMarker | null;
  guide: { x: number; z: number }[] | null;
  police: { x: number; z: number }[];
}

/**
 * Round heading-up minimap: centred on the player, rotated with the camera, cropped from the
 * pre-drawn town map. Labels stay upright. Job marker and police blips off the edge are pinned
 * to the rim, so you always know which way to go (or which way they're coming from).
 */
export class Minimap {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly town: HTMLCanvasElement;
  private readonly labels: MapLabel[];
  private last = 0;

  constructor(town: TownMap) {
    const canvas = document.getElementById('minimap') as HTMLCanvasElement;
    canvas.width = canvas.height = SIZE;
    this.ctx = canvas.getContext('2d')!;
    this.town = town.canvas;
    this.labels = town.labels;
  }

  update(now: number, s: MinimapState) {
    if (now - this.last < REFRESH_MS) return;
    this.last = now;
    const g = this.ctx;
    const k = SIZE / VIEW_M; // screen px per metre
    const R = SIZE / 2;
    const cos = Math.cos(s.view);
    const sin = Math.sin(s.view);
    // World -> screen: offset from the player, rotated so the camera's forward points up.
    const toScreen = (x: number, z: number) => {
      const dx = (x - s.player.x) * k;
      const dz = (z - s.player.z) * k;
      return { x: R + dx * cos - dz * sin, y: R + dx * sin + dz * cos };
    };
    const rim = (p: { x: number; y: number }, inset: number) => {
      const dx = p.x - R;
      const dy = p.y - R;
      const r = Math.hypot(dx, dy);
      return r > R - inset ? { x: R + (dx / r) * (R - inset), y: R + (dy / r) * (R - inset) } : p;
    };

    g.save();
    g.clearRect(0, 0, SIZE, SIZE);
    g.beginPath();
    g.arc(R, R, R, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = MAP_LAND;
    g.fillRect(0, 0, SIZE, SIZE);
    // Map image, rotated about the centre.
    g.save();
    g.translate(R, R);
    g.rotate(s.view);
    const src = VIEW_M * 1.5 * MAP_PPM; // a bit extra so corners stay filled while rotating
    const dst = VIEW_M * 1.5 * k;
    g.drawImage(this.town, mapPx(s.player.x) - src / 2, mapPx(s.player.z) - src / 2, src, src, -dst / 2, -dst / 2, dst, dst);
    g.restore();

    if (s.guide) drawRoute(g, s.guide, toScreen, 5);

    for (const l of this.labels) {
      const p = toScreen(l.x, l.z);
      if (p.x > -40 && p.x < SIZE + 40 && p.y > 0 && p.y < SIZE) drawLabel(g, l, p.x, p.y);
    }

    // The auto.
    const a = rim(toScreen(s.auto.x, s.auto.z), 8);
    g.fillStyle = '#f5c400';
    g.strokeStyle = '#000';
    g.lineWidth = 1.5;
    g.fillRect(a.x - 5, a.y - 5, 10, 10);
    g.strokeRect(a.x - 5, a.y - 5, 10, 10);

    if (s.marker) {
      const m = rim(toScreen(s.marker.x, s.marker.z), 9);
      g.fillStyle = s.marker.kind === 'pickup' ? '#ffcc00' : '#2ecc71';
      g.beginPath();
      g.arc(m.x, m.y, 7 + Math.sin(now / 150) * 1.5, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }

    // Police: flashing red/blue blips.
    const flash = Math.floor(now / 250) % 2 === 0;
    s.police.forEach((pol, i) => {
      const p = rim(toScreen(pol.x, pol.z), 7);
      g.fillStyle = (i % 2 === 0) === flash ? '#e53935' : '#1e5bff';
      g.beginPath();
      g.arc(p.x, p.y, 6, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#fff';
      g.stroke();
    });

    // The player: arrow (yaw 0 = facing +z = south on an unrotated map).
    g.translate(R, R);
    g.rotate(s.view - s.player.yaw);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#1a1a1a';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, 10);
    g.lineTo(7, -7);
    g.lineTo(0, -3);
    g.lineTo(-7, -7);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();

    // North marker riding the rim.
    const n = rim(toScreen(s.player.x, s.player.z - 1000), 12);
    g.fillStyle = '#1a1a1a';
    g.beginPath();
    g.arc(n.x, n.y, 9, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.font = '700 11px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('N', n.x, n.y + 0.5);
  }
}

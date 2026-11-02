import { MAP_PPM, drawRoute, mapPx } from './mapArt';

const SIZE = 180; // px on screen
const VIEW_M = 75; // metres across the minimap
const REFRESH_MS = 50;

export interface MapMarker {
  x: number;
  z: number;
  kind: 'pickup' | 'drop';
}

/**
 * Round minimap in the bottom-left, centred on the player, north up. Crops the pre-drawn town
 * map (buildings, shops, street names) and draws the auto, the player and the job marker; a
 * marker that is off the edge is pinned to the rim so you always know which way to go.
 */
export class Minimap {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly town: HTMLCanvasElement;
  private last = 0;

  constructor(town: HTMLCanvasElement) {
    const canvas = document.getElementById('minimap') as HTMLCanvasElement;
    canvas.width = canvas.height = SIZE;
    this.ctx = canvas.getContext('2d')!;
    this.town = town;
  }

  update(now: number, player: { x: number; z: number; yaw: number }, auto: { x: number; z: number }, marker: MapMarker | null, guide: { x: number; z: number }[] | null) {
    if (now - this.last < REFRESH_MS) return;
    this.last = now;
    const g = this.ctx;
    const k = SIZE / VIEW_M; // screen px per metre
    const src = VIEW_M * MAP_PPM;
    const toScreen = (x: number, z: number) => ({ x: SIZE / 2 + (x - player.x) * k, y: SIZE / 2 + (z - player.z) * k });

    g.save();
    g.clearRect(0, 0, SIZE, SIZE);
    g.beginPath();
    g.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#d9cfb6';
    g.fillRect(0, 0, SIZE, SIZE);
    g.drawImage(this.town, mapPx(player.x) - src / 2, mapPx(player.z) - src / 2, src, src, 0, 0, SIZE, SIZE);

    if (guide) drawRoute(g, guide, (x, z) => toScreen(x, z), 4);

    // The auto.
    const a = toScreen(auto.x, auto.z);
    g.fillStyle = '#f5c400';
    g.strokeStyle = '#000';
    g.lineWidth = 1.5;
    g.fillRect(a.x - 4, a.y - 4, 8, 8);
    g.strokeRect(a.x - 4, a.y - 4, 8, 8);

    // Job marker, clamped to the rim when off-map.
    if (marker) {
      let m = toScreen(marker.x, marker.z);
      const dx = m.x - SIZE / 2;
      const dy = m.y - SIZE / 2;
      const r = Math.hypot(dx, dy);
      const max = SIZE / 2 - 8;
      if (r > max) m = { x: SIZE / 2 + (dx / r) * max, y: SIZE / 2 + (dy / r) * max };
      g.fillStyle = marker.kind === 'pickup' ? '#ffd21f' : '#35e06b';
      g.beginPath();
      g.arc(m.x, m.y, 6 + Math.sin(now / 150) * 1.5, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }

    // The player: arrow (yaw 0 = facing +z = down on the map).
    g.translate(SIZE / 2, SIZE / 2);
    g.rotate(-player.yaw);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#000';
    g.beginPath();
    g.moveTo(0, 8);
    g.lineTo(6, -6);
    g.lineTo(0, -2);
    g.lineTo(-6, -6);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();

    g.fillStyle = '#fff';
    g.strokeStyle = '#000';
    g.font = '700 12px system-ui, sans-serif';
    g.lineWidth = 3;
    g.strokeText('N', SIZE / 2 - 4, 14);
    g.fillText('N', SIZE / 2 - 4, 14);
  }
}

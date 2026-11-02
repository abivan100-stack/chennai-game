import { HALF, ROAD_HALF, ROAD_LINES, TANK_BLOCK, TEMPLE_BLOCK, WORLD_SIZE } from '../world/layout';

const SIZE = 180; // px
const SCALE = SIZE / WORLD_SIZE; // px per metre
const REFRESH_MS = 66; // ~15 fps is plenty for a map

export interface MapMarker {
  x: number;
  z: number;
  kind: 'pickup' | 'drop';
}

/**
 * North-up map of the whole town in the bottom-left corner. The streets are drawn once to an
 * offscreen canvas; each refresh only stamps that and draws the markers on top.
 */
export class Minimap {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly base: HTMLCanvasElement;
  private last = 0;
  private t = 0;

  constructor() {
    const canvas = document.getElementById('minimap') as HTMLCanvasElement;
    canvas.width = canvas.height = SIZE;
    this.ctx = canvas.getContext('2d')!;
    this.base = drawBase();
  }

  update(now: number, player: { x: number; z: number; yaw: number }, auto: { x: number; z: number }, target: MapMarker | null) {
    if (now - this.last < REFRESH_MS) return;
    this.t += now - this.last;
    this.last = now;
    const g = this.ctx;
    g.drawImage(this.base, 0, 0);

    if (target) {
      const pulse = 4 + Math.sin(this.t / 150) * 1.5;
      g.fillStyle = target.kind === 'pickup' ? '#ffd21f' : '#35e06b';
      g.strokeStyle = '#000';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(px(target.x), px(target.z), pulse, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }

    // The auto: small yellow square.
    g.fillStyle = '#f5c400';
    g.strokeStyle = '#000';
    g.fillRect(px(auto.x) - 3, px(auto.z) - 3, 6, 6);
    g.strokeRect(px(auto.x) - 3, px(auto.z) - 3, 6, 6);

    // The player: arrow pointing where they face (yaw 0 = +z = down on the map).
    g.save();
    g.translate(px(player.x), px(player.z));
    g.rotate(-player.yaw);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#000';
    g.beginPath();
    g.moveTo(0, 7);
    g.lineTo(5, -5);
    g.lineTo(0, -2);
    g.lineTo(-5, -5);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }
}

const px = (metres: number) => (metres + HALF) * SCALE;

function drawBase() {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d')!;
  g.fillStyle = '#c9bfa8'; // building blocks
  g.fillRect(0, 0, SIZE, SIZE);
  const rect = (b: { x0: number; x1: number; z0: number; z1: number }, colour: string) => {
    g.fillStyle = colour;
    g.fillRect(px(b.x0), px(b.z0), (b.x1 - b.x0) * SCALE, (b.z1 - b.z0) * SCALE);
  };
  rect(TEMPLE_BLOCK(), '#e89a3c');
  rect(TANK_BLOCK(), '#3f8fb0');
  g.fillStyle = '#4a4a4f';
  for (const c of ROAD_LINES) {
    g.fillRect(px(c - ROAD_HALF), 0, ROAD_HALF * 2 * SCALE, SIZE);
    g.fillRect(0, px(c - ROAD_HALF), SIZE, ROAD_HALF * 2 * SCALE);
  }
  g.fillStyle = '#fff';
  g.font = '700 10px system-ui, sans-serif';
  g.fillText('N', SIZE - 12, 12);
  return c;
}

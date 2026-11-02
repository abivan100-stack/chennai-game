import type { Footprint } from '../world/buildings';
import { HALF, ROAD_HALF, ROAD_LINES, SETBACK, TANK_BLOCK, TEMPLE_BLOCK, WORLD_SIZE, X_ROADS, Z_ROADS, roadSpans } from '../world/layout';
import { SHOP_SIGNS } from '../world/textures';

/** Pixels per metre of the pre-drawn town map. Minimap and phone map crop/scale from it. */
export const MAP_PPM = 4;

export interface MapData {
  footprints: Footprint[];
  trees: { x: number; z: number }[];
}

/** Metres -> map pixels (x right = east, y down = south). */
export const mapPx = (m: number) => (m + HALF) * MAP_PPM;

/**
 * Draw the whole town once: ground, sidewalks, roads with centre lines, building footprints in
 * their wall colours, shop boards with names, trees, the temple and tank, street names.
 */
export function drawTownMap(data: MapData) {
  const size = WORLD_SIZE * MAP_PPM;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const P = mapPx;
  const M = (m: number) => m * MAP_PPM;

  g.fillStyle = '#d9cfb6';
  g.fillRect(0, 0, size, size);

  // Sidewalks, then roads, then dashed centre lines.
  g.fillStyle = '#ebe6dc';
  for (const l of ROAD_LINES) {
    g.fillRect(P(l - SETBACK), 0, M(SETBACK * 2), size);
    g.fillRect(0, P(l - SETBACK), size, M(SETBACK * 2));
  }
  g.fillStyle = '#5b5c62';
  for (const l of ROAD_LINES) {
    g.fillRect(P(l - ROAD_HALF), 0, M(ROAD_HALF * 2), size);
    g.fillRect(0, P(l - ROAD_HALF), size, M(ROAD_HALF * 2));
  }
  g.strokeStyle = '#f2f2f2';
  g.lineWidth = 1;
  g.setLineDash([M(3), M(3)]);
  for (const l of ROAD_LINES) {
    for (const [a, b] of roadSpans()) {
      g.beginPath();
      g.moveTo(P(l), P(a));
      g.lineTo(P(l), P(b));
      g.moveTo(P(a), P(l));
      g.lineTo(P(b), P(l));
      g.stroke();
    }
  }
  g.setLineDash([]);

  // Temple: paved court, striped wall, gopurams, shrine.
  const t = TEMPLE_BLOCK();
  g.fillStyle = '#efe3c9';
  g.fillRect(P(t.x0), P(t.z0), M(t.x1 - t.x0), M(t.z1 - t.z0));
  g.strokeStyle = '#b8352a';
  g.lineWidth = 3;
  g.strokeRect(P(t.x0) + 2, P(t.z0) + 2, M(t.x1 - t.x0) - 4, M(t.z1 - t.z0) - 4);
  g.fillStyle = '#e89a3c';
  g.fillRect(P(t.x1 - 9), P(-7), M(9), M(14)); // east gopuram
  g.fillRect(P(t.x0), P(-4.5), M(6), M(9)); // west gopuram
  g.fillStyle = '#a8957a';
  g.fillRect(P(-7), P(-4), M(8), M(8)); // shrine
  label(g, 'Kapaleeshwarar Temple', P(0), P(t.z0 + 4), 13, '#7a2b10');

  // Tank: steps, water, mandapam.
  const k = TANK_BLOCK();
  g.fillStyle = '#c9b89a';
  g.fillRect(P(k.x0 + 2), P(k.z0 + 2), M(k.x1 - k.x0 - 4), M(k.z1 - k.z0 - 4));
  g.fillStyle = '#3f8fb0';
  g.fillRect(P(k.x0 + 6), P(k.z0 + 6), M(k.x1 - k.x0 - 12), M(k.z1 - k.z0 - 12));
  g.fillStyle = '#efe3c9';
  const kx = (k.x0 + k.x1) / 2;
  const kz = (k.z0 + k.z1) / 2;
  g.fillRect(P(kx - 3), P(kz - 3), M(6), M(6));
  label(g, 'Temple Tank', P(kx), P(k.z0 + 4), 12, '#123c55');

  // Buildings (rotated rectangles in wall colour; old tiled houses get a terracotta roof).
  for (const f of data.footprints) {
    g.save();
    g.translate(P(f.cx), P(f.cz));
    g.rotate(-f.yaw);
    g.fillStyle = f.oldHouse ? '#c0643f' : f.color;
    g.fillRect(-M(f.w / 2), -M(f.d / 2), M(f.w), M(f.d));
    g.strokeStyle = '#00000055';
    g.lineWidth = 1;
    g.strokeRect(-M(f.w / 2), -M(f.d / 2), M(f.w), M(f.d));
    g.restore();
  }

  // Trees.
  g.fillStyle = '#4f8a3a';
  for (const tr of data.trees) {
    g.beginPath();
    g.arc(P(tr.x), P(tr.z), M(1.6), 0, Math.PI * 2);
    g.fill();
  }

  // Shops: their board colour at the shop front, with the name.
  for (const f of data.footprints) {
    if (f.shop === null) continue;
    const s = SHOP_SIGNS[f.shop];
    // Shop front = centre + (d/2 - 1) along the facing direction.
    const fx = f.cx + Math.sin(f.yaw) * (f.d / 2 - 1.5);
    const fz = f.cz + Math.cos(f.yaw) * (f.d / 2 - 1.5);
    g.fillStyle = s.bg;
    g.strokeStyle = '#fff';
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(P(fx), P(fz), 4, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    if (f.w >= 6) label(g, s.en, P(fx), P(fz) - 8, 8, '#222', f.yaw);
  }

  // Street names, along the roads.
  for (const l of ROAD_LINES) {
    for (const [a, b] of roadSpans()) {
      if (b - a < 25) continue;
      const mid = (a + b) / 2;
      label(g, X_ROADS[l][0], P(l), P(mid), 10, '#fff', Math.PI / 2, '#222');
      label(g, Z_ROADS[l][0], P(mid), P(l), 10, '#fff', 0, '#222');
    }
  }
  return c;
}

/** Centred text, optionally rotated so it reads along a street / facade. */
function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill: string, rot = 0, halo = '#ffffffcc') {
  g.save();
  g.translate(x, y);
  // keep text upright: flip if it would read upside-down
  let r = -rot;
  if (Math.cos(r) < -0.01) r += Math.PI;
  if (Math.abs(Math.cos(r)) < 0.01) r = -Math.PI / 2;
  g.rotate(r);
  g.font = `700 ${size}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 3;
  g.strokeStyle = halo;
  g.strokeText(text, 0, 0);
  g.fillStyle = fill;
  g.fillText(text, 0, 0);
  g.restore();
}

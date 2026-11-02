import type { Footprint } from '../world/buildings';
import { HALF, POLICE_LOT, SUPERMARKET_LOTS, ROAD_HALF, ROAD_LINES, SETBACK, TANK_BLOCK, TEMPLE_BLOCK, WORLD_SIZE, X_ROADS, Z_ROADS, roadSpans } from '../world/layout';
import { STOPS, stopPoint } from '../missions/data';
import { SHOP_SIGNS } from '../world/textures';

/** Pixels per metre of the pre-drawn town map. Minimap and phone map crop/scale from it. */
export const MAP_PPM = 4;

export interface MapData {
  footprints: Footprint[];
  trees: { x: number; z: number }[];
}

/** A label drawn upright on top of the (possibly rotated) map. */
export interface MapLabel {
  text: string;
  x: number;
  z: number;
  kind: 'street' | 'landmark';
}

export interface TownMap {
  canvas: HTMLCanvasElement;
  labels: MapLabel[];
}

/** Metres -> map pixels (x right = east, y down = south). */
export const mapPx = (m: number) => (m + HALF) * MAP_PPM;

// Navigation-app palette.
const C = {
  land: '#ece6da',
  sidewalk: '#f8f6f1',
  roadEdge: '#c9c2b4',
  road: '#ffffff',
  mainRoad: '#fde3a0',
  building: '#ddd5c6',
  buildingEdge: '#b3aa98',
  oldHouse: '#e0b9a2',
  tree: '#b5d39c',
  temple: '#f6d6aa',
  templeWall: '#c0472f',
  water: '#a6d1ec',
  police: '#cfdcf3',
};
export const MAP_LAND = C.land;
/** The outer roads are the big ones (yellow, like a main road on a nav app). */
const MAIN = new Set([ROAD_LINES[0], ROAD_LINES[ROAD_LINES.length - 1]]);

/**
 * Draw the town once, without text (labels come back separately, so a rotating minimap can
 * keep them upright): white streets with grey casing (main roads yellow), muted building
 * outlines, shop dots, trees, the temple, tank and police station, and bus-stop markers.
 */
export function drawTownMap(data: MapData): TownMap {
  const size = WORLD_SIZE * MAP_PPM;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const P = mapPx;
  const M = (m: number) => m * MAP_PPM;
  const labels: MapLabel[] = [];

  g.fillStyle = C.land;
  g.fillRect(0, 0, size, size);

  const bands = (half: number, colour: string, only?: boolean) => {
    g.fillStyle = colour;
    for (const l of ROAD_LINES) {
      if (only !== undefined && MAIN.has(l) !== only) continue;
      g.fillRect(P(l - half), 0, M(half * 2), size);
      g.fillRect(0, P(l - half), size, M(half * 2));
    }
  };
  bands(SETBACK, C.sidewalk);
  bands(ROAD_HALF + 0.5, C.roadEdge);
  bands(ROAD_HALF, C.road, false);
  bands(ROAD_HALF, C.mainRoad, true);
  // Side roads cross the main roads: keep the junction squares white-over-yellow consistent.
  g.fillStyle = C.mainRoad;
  for (const a of MAIN) for (const b of ROAD_LINES) {
    g.fillRect(P(a - ROAD_HALF), P(b - ROAD_HALF), M(ROAD_HALF * 2), M(ROAD_HALF * 2));
    g.fillRect(P(b - ROAD_HALF), P(a - ROAD_HALF), M(ROAD_HALF * 2), M(ROAD_HALF * 2));
  }

  // Temple: court, striped wall, gopurams, shrine.
  const t = TEMPLE_BLOCK();
  g.fillStyle = C.temple;
  g.fillRect(P(t.x0), P(t.z0), M(t.x1 - t.x0), M(t.z1 - t.z0));
  g.strokeStyle = C.templeWall;
  g.lineWidth = 3;
  g.strokeRect(P(t.x0) + 2, P(t.z0) + 2, M(t.x1 - t.x0) - 4, M(t.z1 - t.z0) - 4);
  g.fillStyle = '#e8a766';
  g.fillRect(P(t.x1 - 9), P(-7), M(9), M(14));
  g.fillRect(P(t.x0), P(-4.5), M(6), M(9));
  g.fillStyle = '#d4ad84';
  g.fillRect(P(-7), P(-4), M(8), M(8));
  badge(g, P(-3), P(10), '#c0472f', 'T');
  labels.push({ text: 'Kapaleeshwarar Temple', x: 0, z: t.z0 + 5, kind: 'landmark' });

  // Tank: steps, water, mandapam.
  const k = TANK_BLOCK();
  const kx = (k.x0 + k.x1) / 2;
  const kz = (k.z0 + k.z1) / 2;
  g.fillStyle = '#e6dccb';
  g.fillRect(P(k.x0 + 2), P(k.z0 + 2), M(k.x1 - k.x0 - 4), M(k.z1 - k.z0 - 4));
  g.fillStyle = C.water;
  g.fillRect(P(k.x0 + 6), P(k.z0 + 6), M(k.x1 - k.x0 - 12), M(k.z1 - k.z0 - 12));
  g.fillStyle = '#efe3c9';
  g.fillRect(P(kx - 3), P(kz - 3), M(6), M(6));
  labels.push({ text: 'Temple Tank', x: kx, z: k.z0 + 5, kind: 'landmark' });

  // Police station.
  const ps = POLICE_LOT();
  g.fillStyle = C.police;
  g.fillRect(P(ps.x0), P(ps.z0), M(ps.x1 - ps.x0), M(ps.z1 - ps.z0));
  g.fillStyle = '#9fb3dc';
  g.fillRect(P(ps.x0 + 2), P(ps.z0 + 1), M(16), M(9));
  badge(g, P(ps.x0 + 10), P(ps.z0 + 5.5), '#1c3f8f', 'P');
  labels.push({ text: 'Police Station', x: (ps.x0 + ps.x1) / 2, z: ps.z1 - 3, kind: 'landmark' });

  // Supermarkets.
  for (const lot of SUPERMARKET_LOTS()) {
    g.fillStyle = '#c8e6c9';
    g.fillRect(P(lot.x0), P(lot.z0), M(lot.x1 - lot.x0), M(lot.z1 - lot.z0));
    g.strokeStyle = '#2e7d32';
    g.lineWidth = 2;
    g.strokeRect(P(lot.x0), P(lot.z0), M(lot.x1 - lot.x0), M(lot.z1 - lot.z0));
    const mx = (lot.x0 + lot.x1) / 2;
    const mz = (lot.z0 + lot.z1) / 2;
    badge(g, P(mx), P(mz), '#2e7d32', 'S');
    labels.push({ text: 'Supermarket', x: mx, z: mz + 4, kind: 'landmark' });
  }

  // Buildings, then trees, then shop dots on top.
  for (const f of data.footprints) {
    g.save();
    g.translate(P(f.cx), P(f.cz));
    g.rotate(-f.yaw);
    g.fillStyle = f.oldHouse ? C.oldHouse : C.building;
    g.fillRect(-M(f.w / 2), -M(f.d / 2), M(f.w), M(f.d));
    g.strokeStyle = C.buildingEdge;
    g.lineWidth = 1.5;
    g.strokeRect(-M(f.w / 2), -M(f.d / 2), M(f.w), M(f.d));
    g.restore();
  }
  g.fillStyle = C.tree;
  for (const tr of data.trees) {
    g.beginPath();
    g.arc(P(tr.x), P(tr.z), M(1.4), 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = '#fff';
  g.lineWidth = 1.5;
  for (const f of data.footprints) {
    if (f.shop === null) continue;
    const fx = f.cx + Math.sin(f.yaw) * (f.d / 2 - 1.5);
    const fz = f.cz + Math.cos(f.yaw) * (f.d / 2 - 1.5);
    g.fillStyle = SHOP_SIGNS[f.shop].bg;
    g.beginPath();
    g.arc(P(fx), P(fz), 3, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }

  // Ride stops.
  for (const s of STOPS) {
    const p = stopPoint(s, 'sidewalk');
    badge(g, P(p.x), P(p.z), '#1565c0', 'B', 7);
  }

  // Street names: one per stretch of road, at its middle.
  for (const l of ROAD_LINES) {
    for (const [a, b] of roadSpans()) {
      if (b - a < 25) continue;
      const mid = (a + b) / 2;
      labels.push({ text: X_ROADS[l][0], x: l, z: mid, kind: 'street' });
      labels.push({ text: Z_ROADS[l][0], x: mid, z: l, kind: 'street' });
    }
  }
  return { canvas: c, labels };
}

/** Round map icon with a letter (no emoji: they render differently on every OS). */
function badge(g: CanvasRenderingContext2D, x: number, y: number, colour: string, letter: string, r = 10) {
  g.fillStyle = colour;
  g.strokeStyle = '#fff';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = '#fff';
  g.font = `700 ${Math.round(r * 1.2)}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(letter, x, y + 0.5);
}

/** Upright label with a white halo at screen point (x, y). */
export function drawLabel(g: CanvasRenderingContext2D, l: MapLabel, x: number, y: number) {
  g.font = l.kind === 'street' ? '600 10px system-ui, sans-serif' : '700 11px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 3;
  g.strokeStyle = '#ffffffe6';
  g.strokeText(l.text, x, y);
  g.fillStyle = l.kind === 'street' ? '#55524c' : '#7a2b10';
  g.fillText(l.text, x, y);
}

/** Guide line along the roads to the current pickup / drop-off (white casing, blue core). */
export function drawRoute(g: CanvasRenderingContext2D, pts: { x: number; z: number }[], toScreen: (x: number, z: number) => { x: number; y: number }, width: number) {
  if (pts.length < 2) return;
  g.save();
  g.lineJoin = g.lineCap = 'round';
  g.beginPath();
  pts.forEach((p, i) => {
    const s = toScreen(p.x, p.z);
    if (i === 0) g.moveTo(s.x, s.y);
    else g.lineTo(s.x, s.y);
  });
  g.strokeStyle = '#ffffff';
  g.lineWidth = width + 3;
  g.stroke();
  g.strokeStyle = '#2f7bff';
  g.lineWidth = width;
  g.stroke();
  g.restore();
}

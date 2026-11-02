import type { Footprint } from '../world/buildings';
import { BEACH_FAIR, BEACH_ROAD, BEACH_X, BOUNDS, DEPOT_LOT, FISH_MARKET, HOSPITAL_LOT, PLACE_LOTS, POLICE_LOT, SEA_X, SUPERMARKET_LOTS, ROAD_HALF, SETBACK, TANK_BLOCK, TEMPLE_BLOCK, X_ROADS, Z_ROADS, block, roadSpans, roads, type RoadLine } from '../world/layout';
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

/** Metres -> map pixels (x right = east, y down = south). The world's west and north edges are both at -100, so one function serves both axes. */
export const mapPx = (m: number) => (m - BOUNDS.x0) * MAP_PPM;
export const MAP_W = (BOUNDS.x1 - BOUNDS.x0) * MAP_PPM;
export const MAP_H = (BOUNDS.z1 - BOUNDS.z0) * MAP_PPM;

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
  sand: '#f3e2b3',
  sea: '#8cc4e8',
};
export const MAP_LAND = C.land;
/** The outer roads and the Beach Road are the big ones (yellow, like a main road on a nav app). */
const isMain = (r: RoadLine) => Math.abs(r.c) === 70 || r.c === BEACH_ROAD;

/**
 * Draw the town once, without text (labels come back separately, so a rotating minimap can
 * keep them upright): white streets with grey casing (main roads yellow), muted building
 * outlines, shop dots, trees, the temple, tank and police station, and bus-stop markers.
 */
export function drawTownMap(data: MapData): TownMap {
  const c = document.createElement('canvas');
  c.width = MAP_W;
  c.height = MAP_H;
  const g = c.getContext('2d')!;
  const P = mapPx;
  const M = (m: number) => m * MAP_PPM;
  const labels: MapLabel[] = [];

  g.fillStyle = C.land;
  g.fillRect(0, 0, MAP_W, MAP_H);
  // Santhome beach and the sea.
  g.fillStyle = C.sand;
  g.fillRect(P(BEACH_X), 0, M(SEA_X - BEACH_X), MAP_H);
  g.fillStyle = C.sea;
  g.fillRect(P(SEA_X), 0, MAP_W - P(SEA_X), MAP_H);
  labels.push({ text: 'Santhome Beach', x: (BEACH_X + SEA_X) / 2, z: 15, kind: 'landmark' });
  labels.push({ text: 'Bay of Bengal', x: (SEA_X + BOUNDS.x1) / 2, z: -40, kind: 'landmark' });

  /** A band `half` wide either side of each road's centre line, over the road's length. */
  const bands = (half: number, colour: string, only?: boolean) => {
    g.fillStyle = colour;
    for (const r of roads()) {
      if (only !== undefined && isMain(r) !== only) continue;
      if (r.axis === 'z') g.fillRect(P(r.c - half), P(r.from), M(half * 2), M(r.to - r.from));
      else g.fillRect(P(r.from), P(r.c - half), M(r.to - r.from), M(half * 2));
    }
  };
  bands(SETBACK, C.sidewalk);
  bands(ROAD_HALF + 0.5, C.roadEdge);
  bands(ROAD_HALF, C.road, false);
  bands(ROAD_HALF, C.mainRoad, true);

  // San Thome Basilica (built by world/santhome.ts on the church block) and the lighthouse.
  const ch = block(4, 2);
  g.fillStyle = '#f7f5ef';
  g.fillRect(P(ch.x0), P(ch.z0), M(ch.x1 - ch.x0), M(ch.z1 - ch.z0));
  g.fillStyle = '#e4e0d6';
  g.fillRect(P(ch.x0 + 7), P(-7), M(28), M(14));
  badge(g, P(ch.x0 + 21), P(0), '#5c6bc0', '✝');
  labels.push({ text: 'San Thome Basilica', x: (ch.x0 + ch.x1) / 2, z: ch.z0 + 4, kind: 'landmark' });
  badge(g, P(150), P(-80), '#c62828', 'L');
  labels.push({ text: 'Lighthouse', x: 150, z: -73, kind: 'landmark' });

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

  // Mandaveli: the MTC depot yard, and the MRTS line along the south edge.
  const dep = DEPOT_LOT();
  g.fillStyle = '#d6dbe8';
  g.fillRect(P(dep.x0), P(dep.z0), M(dep.x1 - dep.x0), M(dep.z1 - dep.z0));
  badge(g, P((dep.x0 + dep.x1) / 2), P((dep.z0 + dep.z1) / 2), '#1d4fa8', 'D');
  labels.push({ text: 'MTC Bus Depot', x: (dep.x0 + dep.x1) / 2, z: dep.z0 + 22, kind: 'landmark' });
  // The MRTS runs north-south just past the west edge, along the Buckingham Canal.
  g.fillStyle = '#7fb3c8';
  g.fillRect(0, 0, M(2.5), MAP_H);
  g.fillStyle = '#9a9488';
  g.fillRect(M(2.5), 0, M(1.5), MAP_H);
  for (const [z, name] of [[-26, 'Thirumayilai MRTS'], [160, 'Mandaveli MRTS']] as const) {
    badge(g, P(BOUNDS.x0 + 6), P(z), '#f4a000', 'M');
    labels.push({ text: name, x: BOUNDS.x0 + 16, z: z + 7, kind: 'landmark' });
  }
  labels.push({ text: 'MANDAVELI', x: -48, z: 150, kind: 'landmark' });
  labels.push({ text: 'SANTHOME', x: 100, z: -90, kind: 'landmark' });
  labels.push({ text: 'MYLAPORE', x: -48, z: -90, kind: 'landmark' });

  // Isabel Hospital.
  const hos = HOSPITAL_LOT();
  g.fillStyle = '#fde0e0';
  g.fillRect(P(hos.x0), P(hos.z0), M(hos.x1 - hos.x0), M(hos.z1 - hos.z0));
  badge(g, P((hos.x0 + hos.x1) / 2), P(hos.z0 + 11), '#d32f2f', 'H');
  labels.push({ text: 'Isabel Hospital', x: (hos.x0 + hos.x1) / 2, z: hos.z0 + 19, kind: 'landmark' });

  // Neighbourhood places: a tinted lot, a badge and a label each.
  const pl = PLACE_LOTS();
  const placeMarks: [{ x0: number; x1: number; z0: number; z1: number }, string, string, string, string][] = [
    [pl.park, '#a5d6a7', '#2e7d32', '❀', 'Nageswara Rao Park'],
    [pl.church, '#e3f2fd', '#1b3a6b', '✝', 'Luz Church'],
    [pl.market, '#ffecb3', '#ef6c00', 'V', 'Vegetable market'],
    [pl.stand, '#fff9c4', '#222222', 'A', 'Auto stand · tea'],
    [pl.bunk, '#ffccbc', '#d84315', '⛽', 'Petrol bunk'],
    [pl.mechanic, '#cfd8dc', '#37474f', '🔧', 'Mechanic'],
    [pl.cinema, '#e1bee7', '#7b1fa2', '🎬', 'Kamadhenu Cinemas'],
    [pl.bank, '#bbdefb', '#0d47a1', '₹', 'Bank · ATM'],
    [pl.pharmacy, '#c8e6c9', '#1b5e20', '+', 'Pharmacy'],
    [FISH_MARKET, '#b3e5fc', '#0277bd', 'F', 'Fish market'],
    [BEACH_FAIR, '#f8bbd0', '#ad1457', '★', 'Beach fair'],
  ];
  for (const [lot, fill, colour, letter, name] of placeMarks) {
    g.fillStyle = fill;
    g.fillRect(P(lot.x0), P(lot.z0), M(lot.x1 - lot.x0), M(lot.z1 - lot.z0));
    const cx = (lot.x0 + lot.x1) / 2;
    const cz = (lot.z0 + lot.z1) / 2;
    badge(g, P(cx), P(cz), colour, letter);
    labels.push({ text: name, x: cx, z: cz + 7, kind: 'landmark' });
  }

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
  for (const r of roads()) {
    for (const [a, b] of roadSpans(r)) {
      if (b - a < 25) continue;
      const mid = (a + b) / 2;
      if (r.axis === 'z') labels.push({ text: X_ROADS[r.c][0], x: r.c, z: mid, kind: 'street' });
      else labels.push({ text: Z_ROADS[r.c][0], x: mid, z: r.c, kind: 'street' });
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

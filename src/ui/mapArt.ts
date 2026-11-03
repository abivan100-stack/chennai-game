import type { Footprint } from '../world/buildings';
import { CAFE_SPOTS } from '../world/cafeSpots';
import { CHEPAUK_LOT, PRESIDENCY_LOT, BESANT, CAFE_LOTS, COMPLEX_LOTS, TIDEL_LOT, LANDMARK_LOTS, BOAT_CLUB_LOT, CAMPUS_LOT, COLLEGE_LOT, CANAL, MRTS_STATIONS, MRTS_X, RIVER, waterRects } from '../world/layout';
import { BEACH_FAIR, BEACH_ROAD, BEACH_X, BOUNDS, DEPOT_LOT, FISH_MARKET, HOSPITAL_LOT, PLACE_LOTS, POLICE_LOT, SEA_X, SUPERMARKET_LOTS, ROAD_HALF, streetName, SETBACK, TANK_BLOCK, TEMPLE_BLOCK, X_ROADS, block, roadSpans, roads, type RoadLine } from '../world/layout';
import { STOPS, stopPoint } from '../missions/data';
import { frame } from '../world/kit';
import { BEACHFRONT_LOTS, HOME_LOTS, HOTEL_LOTS, RAIL_HALF, RAIL_X, TNAGAR, SERVICE_HUBS, SHOWROOM_LOTS } from '../world/layout';
import { BEACHFRONT } from '../world/beachfront';
import { HOMES } from '../world/homes';
import { SHOWROOMS } from '../world/showrooms';
import { HOTELS } from '../world/hotels';
import { SHOP_SIGNS } from '../world/textures';

/** Pixels per metre of the pre-drawn town map. Minimap and phone map crop/scale from it. */
export const MAP_PPM = 3;

export interface MapData {
  footprints: Footprint[];
  trees: { x: number; z: number }[];
}

/** A label drawn upright on top of the (possibly rotated) map. */
export interface MapLabel {
  text: string;
  x: number;
  z: number;
  kind: 'street' | 'landmark' | 'area';
}

/**
 * drawImage of a crop of the map that may run past its edges: clip the source rectangle to the
 * canvas and shrink the destination to match (browsers don't all do this the same way).
 */
export function drawCrop(g: CanvasRenderingContext2D, img: HTMLCanvasElement, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number) {
  const kx = dw / sw;
  const ky = dh / sh;
  const x0 = Math.max(0, sx);
  const y0 = Math.max(0, sy);
  const x1 = Math.min(img.width, sx + sw);
  const y1 = Math.min(img.height, sy + sh);
  if (x1 <= x0 || y1 <= y0) return;
  g.drawImage(img, x0, y0, x1 - x0, y1 - y0, dx + (x0 - sx) * kx, dy + (y0 - sy) * ky, (x1 - x0) * kx, (y1 - y0) * ky);
}

export interface TownMap {
  canvas: HTMLCanvasElement;
  labels: MapLabel[];
  pois: Poi[];
}

export type PoiCat = 'fuel' | 'mechanic' | 'atm' | 'medical' | 'police' | 'transport' | 'food' | 'shop' | 'place' | 'stop';
/** A place on the map: an icon drawn at screen size over the town picture, and a navigation destination. */
export interface Poi {
  name: string;
  x: number;
  z: number;
  colour: string;
  icon: string;
  cat: PoiCat;
  /** 1 = always shown, 2 = from a medium zoom, 3 = only close up. */
  rank: 1 | 2 | 3;
}
/** Places big enough to show at any zoom. */
const MAJOR = ['Tidel Park', 'Chepauk Stadium', 'Presidency College', 'Nageswara Rao Park', 'Kamadhenu Cinemas', 'Velankanni Church', 'Ashtalakshmi Temple', 'Grand Lake Residences', 'Semmozhi Poonga', 'Music Academy'];

/** Cafes / boutiques on the CAFE_LOTS, in order (names and whether they serve food). */
const CAFE_NAMES = CAFE_SPOTS;

/** The map's top-left corner, the same on both axes so one function serves x and z. */
const MAP_ORIGIN = Math.min(BOUNDS.x0, BOUNDS.z0);
/** Metres -> map pixels (x right = east, y down = south). */
export const mapPx = (m: number) => (m - MAP_ORIGIN) * MAP_PPM;
export const MAP_W = (BOUNDS.x1 - MAP_ORIGIN) * MAP_PPM;
export const MAP_H = (BOUNDS.z1 - MAP_ORIGIN) * MAP_PPM;

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
export const MAP_SEA = C.sea;
/** A navigation destination (a place from the map, an eatery, or a dropped pin). */
export interface Dest {
  name: string;
  x: number;
  z: number;
}
/** The outer roads and the Beach Road are the big ones (yellow, like a main road on a nav app). */
const MAIN_ROADS = [-70, 70, BEACH_ROAD, -145, -265, -130, 300];
const isMain = (r: RoadLine) => MAIN_ROADS.includes(r.c);

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
  const pois: Poi[] = [];
  const poi = (name: string, x: number, z: number, colour: string, icon: string, cat: PoiCat, rank: 1 | 2 | 3) => pois.push({ name, x, z, colour, icon, cat, rank });

  g.fillStyle = C.land;
  g.fillRect(0, 0, MAP_W, MAP_H);
  // Santhome beach and the sea.
  g.fillStyle = C.sand;
  g.fillRect(P(BEACH_X), 0, M(SEA_X - BEACH_X), MAP_H);
  g.fillStyle = C.sea;
  g.fillRect(P(SEA_X), 0, MAP_W - P(SEA_X), MAP_H);
  labels.push({ text: 'Santhome Beach', x: (BEACH_X + SEA_X) / 2, z: 15, kind: 'landmark' });
  labels.push({ text: 'Bay of Bengal', x: (SEA_X + BOUNDS.x1) / 2, z: -40, kind: 'landmark' });

  // The Buckingham Canal and the Adyar river (the roads drawn next bridge them).
  g.fillStyle = C.water;
  for (const w of waterRects()) g.fillRect(P(w.x0), P(w.z0), M(w.x1 - w.x0), M(w.z1 - w.z0));
  labels.push({ text: 'Adyar River', x: -180, z: (RIVER.z0 + RIVER.z1) / 2, kind: 'landmark' });
  labels.push({ text: 'Adyar River', x: 40, z: (RIVER.z0 + RIVER.z1) / 2, kind: 'landmark' });
  labels.push({ text: 'Buckingham Canal', x: (CANAL.x0 + CANAL.x1) / 2, z: 100, kind: 'landmark' });
  labels.push({ text: 'ALWARPET', x: -175, z: -45, kind: 'area' });
  labels.push({ text: 'TEYNAMPET', x: -235, z: 50, kind: 'area' });
  labels.push({ text: 'R.A. PURAM', x: -48, z: 270, kind: 'area' });
  labels.push({ text: 'ADYAR', x: -48, z: 375, kind: 'area' });
  labels.push({ text: 'TARAMANI', x: -48, z: 440, kind: 'area' });
  labels.push({ text: 'PERUNGUDI', x: 0, z: 630, kind: 'area' });
  labels.push({ text: 'TRIPLICANE', x: -20, z: -260, kind: 'area' });
  labels.push({ text: 'Marina Beach', x: 165, z: -300, kind: 'landmark' });
  labels.push({ text: 'BESANT NAGAR', x: 97, z: 470, kind: 'area' });
  labels.push({ text: "Elliot's Beach", x: 165, z: 540, kind: 'landmark' });
  poi('Music stage (6-10 pm)', 170, 600, '#14213d', '♫', 'place', 2);
  labels.push({ text: 'VELACHERY', x: -205, z: 610, kind: 'area' });

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
  poi('San Thome Basilica', ch.x0 + 21, 0, '#5c6bc0', '✝', 'place', 1);
  poi('Lighthouse', 150, -80, '#c62828', 'L', 'place', 1);

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
  poi('Kapaleeshwarar Temple', -3, 10, '#c0472f', 'T', 'place', 1);

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
  poi('Mylapore Police Station', ps.x0 + 10, ps.z0 + 5.5, '#1c3f8f', 'P', 'police', 1);

  // Mandaveli: the MTC depot yard, and the MRTS line along the south edge.
  const dep = DEPOT_LOT();
  g.fillStyle = '#d6dbe8';
  g.fillRect(P(dep.x0), P(dep.z0), M(dep.x1 - dep.x0), M(dep.z1 - dep.z0));
  poi('MTC Bus Depot', (dep.x0 + dep.x1) / 2, (dep.z0 + dep.z1) / 2, '#1d4fa8', 'D', 'transport', 2);
  // The MRTS viaduct runs north-south over the Buckingham Canal.
  g.fillStyle = '#9a9488';
  g.fillRect(P(MRTS_X - 16.5), P(BOUNDS.z0), M(3), MAP_H);
  for (const [z, name] of MRTS_STATIONS) {
    poi(name, MRTS_X - 6, z, '#f4a000', 'M', 'transport', 1);
  }
  labels.push({ text: 'MANDAVELI', x: -48, z: 150, kind: 'area' });
  labels.push({ text: 'SANTHOME', x: 100, z: -90, kind: 'area' });
  labels.push({ text: 'MYLAPORE', x: -48, z: -90, kind: 'area' });

  // Isabel Hospital.
  const hos = HOSPITAL_LOT();
  g.fillStyle = '#fde0e0';
  g.fillRect(P(hos.x0), P(hos.z0), M(hos.x1 - hos.x0), M(hos.z1 - hos.z0));
  poi('Isabel Hospital', (hos.x0 + hos.x1) / 2, hos.z0 + 11, '#d32f2f', 'H', 'medical', 1);

  // Neighbourhood places: a tinted lot, a badge and a label each.
  const pl = PLACE_LOTS();
  const lm = LANDMARK_LOTS();
  const placeMarks: [{ x0: number; x1: number; z0: number; z1: number }, string, string, string, string][] = [
    [pl.park, '#a5d6a7', '#2e7d32', '❀', 'Nageswara Rao Park'],
    [pl.church, '#e3f2fd', '#1b3a6b', '✝', 'Luz Church'],
    [pl.market, '#ffecb3', '#ef6c00', 'V', 'Vegetable market'],
    [pl.stand, '#fff9c4', '#222222', 'A', 'Auto stand · tea'],
    [pl.bunk, '#ffccbc', '#d84315', '⛽', 'Mylai Fuels'],
    [pl.mechanic, '#cfd8dc', '#37474f', '🔧', 'Murugan Auto Works'],
    [pl.cinema, '#e1bee7', '#7b1fa2', '🎬', 'Kamadhenu Cinemas'],
    [pl.bank, '#bbdefb', '#0d47a1', '₹', 'Mylapore Co-op Bank ATM'],
    [pl.pharmacy, '#c8e6c9', '#1b5e20', '+', 'Sri Ram Medicals'],
    [FISH_MARKET, '#b3e5fc', '#0277bd', 'F', 'Santhome Fish Market'],
    [BEACH_FAIR, '#f8bbd0', '#ad1457', '★', 'Santhome Beach Fair'],
    [COLLEGE_LOT(), '#f3d9cf', '#8d2b1e', '🎓', 'Vivekananda College'],
    [BOAT_CLUB_LOT(), '#c8e6c9', '#0d3b66', '⛵', 'Madras Boat Club'],
    [CAMPUS_LOT(), '#a5d6a7', '#33691e', '🌳', 'Adyar Banyan Campus'],
    [lm.musicAcademy, '#f3e9d6', '#7a1f1f', '♪', 'Music Academy'],
    [lm.naradaGanaSabha, '#f3e9d6', '#7a1f1f', '♪', 'Narada Gana Sabha'],
    [lm.semmozhiPoonga, '#a5d6a7', '#2e7d32', '❀', 'Semmozhi Poonga'],
    [lm.metro, '#bbdefb', '#1d4fa8', 'M', 'Teynampet Metro'],
    [lm.ramakrishnaMath, '#f6e3c8', '#8a3b12', '॥', 'Ramakrishna Math'],
    [lm.vivekanandarIllam, '#f8dde3', '#8a1c3b', 'V', 'Vivekanandar Illam'],
    [lm.ambedkarManimandapam, '#c5cae9', '#1a3c8f', 'A', 'Ambedkar Manimandapam'],
    [lm.tholkappiaPoonga, '#a5d6a7', '#33691e', '🌿', 'Tholkappia Poonga'],
    [TIDEL_LOT(), '#cfe3ee', '#0d3b66', '💻', 'Tidel Park'],
    [CHEPAUK_LOT(), '#e6f2d9', '#0b3d91', '🏏', 'Chepauk Stadium'],
    [PRESIDENCY_LOT(), '#f3d9cf', '#7a1f1f', '🎓', 'Presidency College'],
    [BESANT.church(), '#eef2f7', '#1d3557', '✝', 'Velankanni Church'],
    [BESANT.temple, '#f6dfb0', '#8a2b1f', 'ॐ', 'Ashtalakshmi Temple'],
    [COMPLEX_LOTS()[0], '#e8e0cc', '#1b2a41', '🏢', 'Grand Lake Residences'],
    [COMPLEX_LOTS()[1], '#e8e0cc', '#1b2a41', '🏢', 'Grand Lake Ph. 2'],
    ...CAFE_LOTS().map((lot, i): [typeof lot, string, string, string, string] => [lot, '#f3e3d3', '#7a4a2a', CAFE_NAMES[i].cafe ? '☕' : '🛍', CAFE_NAMES[i].name]),
  ];
  for (const [lot, fill, colour, letter, name] of placeMarks) {
    g.fillStyle = fill;
    g.fillRect(P(lot.x0), P(lot.z0), M(lot.x1 - lot.x0), M(lot.z1 - lot.z0));
    const cx = (lot.x0 + lot.x1) / 2;
    const cz = (lot.z0 + lot.z1) / 2;
    const cat: PoiCat = letter === '⛽' ? 'fuel' : letter === '🔧' ? 'mechanic' : letter === '₹' ? 'atm' : letter === '+' ? 'medical' : letter === '☕' || letter === 'F' ? 'food' : letter === '🛍' ? 'shop' : 'place';
    poi(name, cx, cz, colour, letter, cat, cat === 'food' || cat === 'shop' ? 3 : MAJOR.includes(name) || cat === 'fuel' ? 1 : 2);
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
    poi('Kapali Supermarket', mx, mz, '#2e7d32', 'S', 'shop', 2);
  }

  // Service stops in every area: forecourt tint + four POIs each (same spots as world/serviceHubs.ts).
  for (const hub of SERVICE_HUBS) {
    const lot = hub.lot();
    const f = frame(lot);
    g.fillStyle = '#ffe0d2';
    g.fillRect(P(lot.x0), P(lot.z0), M(lot.x1 - lot.x0), M(lot.z1 - lot.z0));
    const add = (u: number, v: number, name: string, colour: string, icon: string, cat: PoiCat, rank: 1 | 2 | 3) => {
      const q = f.at(u, v);
      poi(name, q.x, q.z, colour, icon, cat, rank);
    };
    add(-8, 6, `${hub.area} Fuels`, '#d84315', '⛽', 'fuel', 1);
    add(5.5, 6, `${hub.area} Auto Works`, '#37474f', '🔧', 'mechanic', 2);
    add(11, 3, `${hub.area} ATM`, '#0d47a1', '₹', 'atm', 3);
    add(15, 5, `${hub.area} Medicals`, '#1b5e20', '+', 'medical', 3);
  }

  // Silk street showrooms and the luxury hotels.
  SHOWROOM_LOTS().forEach((lot, i) => {
    g.fillStyle = '#f3d6e0';
    g.fillRect(P(lot.x0), P(lot.z0), M(lot.x1 - lot.x0), M(lot.z1 - lot.z0));
    const sr = SHOWROOMS[i % SHOWROOMS.length];
    const name = `${sr.en.charAt(0).toUpperCase()}${sr.en.slice(1).toLowerCase()} fashion store`;
    poi(name, (lot.x0 + lot.x1) / 2, (lot.z0 + lot.z1) / 2, '#ad1457', '👗', 'shop', 2);
  });
  labels.push({ text: 'Fashion street', x: -205, z: -185, kind: 'landmark' });
  BEACHFRONT_LOTS().forEach((lot, i) => {
    g.fillStyle = '#ffe3c8';
    g.fillRect(P(lot.x0), P(lot.z0), M(lot.x1 - lot.x0), M(lot.z1 - lot.z0));
    const b = BEACHFRONT[i % BEACHFRONT.length];
    poi(b.name, (lot.x0 + lot.x1) / 2, (lot.z0 + lot.z1) / 2, b.menu ? '#ef6c00' : '#ad1457', b.menu ? '🍽' : '🛍', b.menu ? 'food' : 'shop', 2);
  });
  // T. Nagar: the suburban railway, Ranganathan Street, Panagal Park, Pondy Bazaar.
  g.fillStyle = '#b9b2a6';
  g.fillRect(P(RAIL_X - RAIL_HALF), P(BOUNDS.z0), M(RAIL_HALF * 2), MAP_H);
  g.fillStyle = '#7d756b';
  for (const dx of [-3, 3]) g.fillRect(P(RAIL_X + dx - 0.8), P(BOUNDS.z0), M(1.6), MAP_H);
  {
    const rg = TNAGAR.ranganathan();
    g.fillStyle = '#f6d7c0';
    g.fillRect(P(rg.x0), P(rg.z0), M(rg.x1 - rg.x0), M(rg.z1 - rg.z0));
    g.fillStyle = '#efe6d6';
    g.fillRect(P(rg.x0), P(TNAGAR.lane.z0), M(rg.x1 - rg.x0), M(TNAGAR.lane.z1 - TNAGAR.lane.z0));
    g.fillRect(P(TNAGAR.stationLane.x0), P(TNAGAR.stationLane.z0), M(TNAGAR.stationLane.x1 - TNAGAR.stationLane.x0), M(TNAGAR.stationLane.z1 - TNAGAR.stationLane.z0));
    poi('Ranganathan Street', (rg.x0 + rg.x1) / 2, (TNAGAR.lane.z0 + TNAGAR.lane.z1) / 2, '#b71c1c', '🛍', 'shop', 1);
    const pk = TNAGAR.panagal();
    g.fillStyle = '#a5d6a7';
    g.fillRect(P(pk.x0), P(pk.z0), M(pk.x1 - pk.x0), M(pk.z1 - pk.z0));
    poi('Panagal Park', (pk.x0 + pk.x1) / 2, (pk.z0 + pk.z1) / 2, '#2e7d32', '❀', 'place', 1);
    poi('Mambalam station', RAIL_X + 8, 47, '#f4a000', 'M', 'transport', 1);
    poi('Pondy Bazaar', -390, TNAGAR.pondy.z - 7, '#0d3b66', '★', 'shop', 1);
    labels.push({ text: 'T. NAGAR', x: -400, z: 100, kind: 'area' });
    labels.push({ text: 'WEST MAMBALAM', x: -560, z: -100, kind: 'area' });
    labels.push({ text: 'KODAMBAKKAM', x: -450, z: -270, kind: 'area' });
    labels.push({ text: 'SAIDAPET', x: -450, z: 260, kind: 'area' });
  }
  HOME_LOTS().forEach((lot, i) => {
    g.fillStyle = '#e6f0d8';
    g.fillRect(P(lot.x0), P(lot.z0), M(lot.x1 - lot.x0), M(lot.z1 - lot.z0));
    const h = HOMES[i];
    poi(h.price ? `${h.name} (₹${(h.price / 100000).toFixed(1)} lakh)` : h.name, (lot.x0 + lot.x1) / 2, (lot.z0 + lot.z1) / 2, h.price ? '#558b2f' : '#2e7d32', '⌂', 'place', h.price ? 2 : 1);
  });
  HOTEL_LOTS().forEach((lot, i) => {
    g.fillStyle = '#e8dcc0';
    g.fillRect(P(lot.x0), P(lot.z0), M(lot.x1 - lot.x0), M(lot.z1 - lot.z0));
    const name = HOTELS[i % HOTELS.length].en.split(' ·')[0].replace(/(\w)(\w*)/g, (_, a: string, b: string) => a + b.toLowerCase());
    poi(name, (lot.x0 + lot.x1) / 2, (lot.z0 + lot.z1) / 2, '#14213d', '🏨', 'place', 1);
  });

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
    poi(s.name, p.x, p.z, '#1565c0', 'B', 'stop', 3);
  }

  // Street names: one per stretch of road, at its middle.
  for (const r of roads()) {
    for (const [a, b] of roadSpans(r)) {
      if (b - a < 25) continue;
      const mid = (a + b) / 2;
      if (r.axis === 'z') labels.push({ text: X_ROADS[r.c][0], x: r.c, z: mid, kind: 'street' });
      else labels.push({ text: streetName('x', r.c, mid)[0], x: mid, z: r.c, kind: 'street' });
    }
  }
  return { canvas: c, labels, pois };
}

type Rect = [number, number, number, number];
const hits = (a: Rect, list: Rect[]) => list.some((b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]);

/** How a map view wants its icons and labels drawn. */
export interface Overlay {
  /** Screen px per metre. */
  k: number;
  w: number;
  h: number;
  toScreen: (x: number, z: number) => { x: number; y: number };
  /** North-up maps: names of north-south roads run along the road instead of across it. */
  rotateStreets?: boolean;
  /** Always drawn, bigger, with its name (hovered / chosen place). */
  highlight?: Poi | null;
}

/** Is this place shown at zoom k? */
export const poiVisible = (p: Poi, k: number) => p.rank === 1 || (p.rank === 2 && k >= 1.6) || k >= 3.2;

/** Round icon (white rim, soft shadow) at a screen point. */
export function drawBadge(g: CanvasRenderingContext2D, x: number, y: number, colour: string, icon: string, r: number) {
  g.save();
  g.shadowColor = '#0006';
  g.shadowBlur = 4;
  g.shadowOffsetY = 1;
  g.fillStyle = colour;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.restore();
  g.strokeStyle = '#fff';
  g.lineWidth = 2;
  g.stroke();
  g.fillStyle = '#fff';
  g.font = `700 ${Math.round(r * 1.15)}px system-ui, "Segoe UI Emoji", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(icon, x, y + 1);
}

function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, font: string, fill: string, halo = '#ffffffee') {
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 3.5;
  g.strokeStyle = halo;
  g.strokeText(s, x, y);
  g.fillStyle = fill;
  g.fillText(s, x, y);
}

/**
 * Icons and names on top of the town picture, in priority order (area names, places, street
 * names, the rest); anything that would overlap something already drawn is skipped, so the map
 * stays readable at every zoom. Returns where each place icon landed (for clicks / hover).
 */
export function drawOverlay(g: CanvasRenderingContext2D, town: TownMap, o: Overlay) {
  const placed: Rect[] = [];
  const icons: { poi: Poi; x: number; y: number }[] = [];
  const on = (p: { x: number; y: number }, m: number) => p.x > -m && p.x < o.w + m && p.y > -m && p.y < o.h + m;
  const label = (s: string, x: number, y: number, font: string, fill: string, force = false, angle = 0) => {
    g.font = font;
    const tw = g.measureText(s).width / 2 + 3;
    const th = 8;
    const r: Rect = angle ? [x - th, y - tw, x + th, y + tw] : [x - tw, y - th, x + tw, y + th];
    if (!force && hits(r, placed)) return;
    placed.push(r);
    if (angle) {
      g.save();
      g.translate(x, y);
      g.rotate(angle);
      text(g, s, 0, 0, font, fill);
      g.restore();
    } else text(g, s, x, y, font, fill);
  };

  // Area names: big and faint, mostly for the zoomed-out view.
  const areaPx = Math.round(Math.min(20, Math.max(12, 10 + o.k * 2.2)));
  for (const l of town.labels) {
    if (l.kind !== 'area') continue;
    const p = o.toScreen(l.x, l.z);
    if (on(p, 60)) label(l.text, p.x, p.y, `800 ${areaPx}px system-ui, sans-serif`, '#5d4e3fb0');
  }
  // Places: the highlighted one first, then by rank.
  const r = o.k >= 3 ? 10 : 8;
  const order = town.pois.filter((p) => p === o.highlight || poiVisible(p, o.k)).sort((a, b) => (a === o.highlight ? -1 : b === o.highlight ? 1 : a.rank - b.rank));
  for (const p of order) {
    const s = o.toScreen(p.x, p.z);
    if (!on(s, 20)) continue;
    const hi = p === o.highlight;
    const rr = hi ? r + 3 : r;
    const box: Rect = [s.x - rr, s.y - rr, s.x + rr, s.y + rr];
    if (!hi && hits(box, placed)) continue;
    placed.push(box);
    drawBadge(g, s.x, s.y, p.colour, p.icon, rr);
    icons.push({ poi: p, x: s.x, y: s.y });
    if (hi || p.rank === 1 || o.k >= 2.2) label(p.name, s.x, s.y + rr + 9, `700 ${hi ? 13 : 11}px system-ui, sans-serif`, hi ? '#0b3d91' : '#6a2a12', hi);
  }
  // Street names, once zoomed in enough to read them.
  if (o.k >= 1.8) {
    for (const l of town.labels) {
      if (l.kind !== 'street') continue;
      const p = o.toScreen(l.x, l.z);
      if (!on(p, 40)) continue;
      const along = o.rotateStreets && X_ROADS[l.x]?.[0] === l.text; // a north-south road
      label(l.text, p.x, p.y, '600 10px system-ui, sans-serif', '#55524c', false, along ? -Math.PI / 2 : 0);
    }
  }
  for (const l of town.labels) {
    if (l.kind !== 'landmark') continue;
    const p = o.toScreen(l.x, l.z);
    if (on(p, 60)) label(l.text, p.x, p.y, 'italic 600 11px system-ui, sans-serif', l.text.includes('River') || l.text.includes('Canal') || l.text.includes('Bay') ? '#2a6f9e' : '#7a5a2a');
  }
  return icons;
}

/** Destination pin (red teardrop) standing on a screen point. */
export function drawPin(g: CanvasRenderingContext2D, x: number, y: number, s = 1) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.shadowColor = '#0007';
  g.shadowBlur = 5;
  g.fillStyle = '#e53935';
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(-4, -8, -11, -12, -11, -20);
  g.arc(0, -20, 11, Math.PI, 0);
  g.bezierCurveTo(11, -12, 4, -8, 0, 0);
  g.fill();
  g.shadowBlur = 0;
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(0, -20, 4.5, 0, Math.PI * 2);
  g.fill();
  g.restore();
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

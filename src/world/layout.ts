/**
 * Street grid of the town: a stylised Mylapore around the Kapaleeshwarar temple.
 * Every world builder (ground, buildings, temple, props) and the NPC paths read these numbers,
 * so changing the layout here keeps everything lined up.
 *
 *   - Centre block: the temple, main gopuram facing east onto East Mada Street.
 *   - Block west of it: the temple tank, with R.K. Mutt Road beyond.
 *   - The four Mada Streets ring the temple; Luz Church Road (north), Kutchery Road (south)
 *     and San Thome High Road (east) form the outer roads.
 *   - South of Kutchery Road: Mandaveli (MTC bus depot; the MRTS line and Buckingham Canal
 *     run just past the south edge, world/mandaveli.ts).
 *   - East of San Thome High Road: Santhome. The San Thome Basilica block, then Kamarajar
 *     Salai (Beach Road), then the beach and the sea (world/santhome.ts).
 *   - West of R.K. Mutt Road: the Buckingham Canal (MRTS above it, bridges where the roads
 *     cross), then Alwarpet (TTK Road, bungalows) and Teynampet (Eldams Road, Anna Salai).
 *   - North: Dr. Radhakrishnan Salai, then Triplicane (Wallajah Road, Bharathi Salai) with Chepauk
 *     stadium and Presidency College on the Beach Road, and Marina Beach along the sand. South of Mandaveli: R.A. Puram, Greenways Road, the Adyar
 *     river (bridges on every north-south road, the boat club on its bank) and Adyar beyond it;
 *     then Taramani: Tidel Park on Taramani Road, where the OMR IT corridor begins; then
 *     Perungudi (east) and Velachery (west, a big gated apartment community).
 * Block grid indices keep the original Mylapore numbering (temple = [2, 2]); the new areas to
 * the west and north get negative indices.
 * Directions: -z = north, +x = east.
 *
 * Cross-section from a road centre line outwards:
 *   road (5 m) | curb | sidewalk (2.5 m, raised 0.15 m) | building frontage
 */
/** World rectangle (metres). Mylapore is the square around the origin; Santhome extends it east. */
export const BOUNDS = { x0: -300, x1: 250, z0: -400, z1: 660 };
/** Roads running north-south (centre line x = c). 125 = Kamarajar Salai (Beach Road). */
export const X_LINES = [-265, -205, -145, -70, -25, 25, 70, 125];
/** Roads running east-west (centre line z = c). They end at the Beach Road. */
export const Z_LINES = [-310, -220, -130, -70, -25, 25, 70, 125, 180, 240, 300, 390, 480, 600];
/** Water the roads cross on bridges: the canal (north-south strip) and the Adyar river (east-west). */
export const CANAL = { x0: -121, x1: -109 };
export const RIVER = { z0: 318, z1: 346 };
/** The MRTS line's reference x (its frame starts here; the canal lies 9-21 m west of it). */
export const MRTS_X = -100;
/** MRTS stations: centre (world z) and name; each sits between two cross roads. */
export const MRTS_STATIONS: [number, string][] = [[0, 'Thirumayilai MRTS'], [152.5, 'Mandaveli MRTS'], [-265, 'Chepauk MRTS']];
export const BEACH_ROAD = X_LINES[X_LINES.length - 1];
export const ROAD_HALF = 5;
export const SIDEWALK_WIDTH = 2.5;
export const SIDEWALK_HEIGHT = 0.15;
export const SETBACK = ROAD_HALF + SIDEWALK_WIDTH; // road centre -> building front
export const WORLD_MARGIN = 2; // buildings stop this far from the world edge
/** Sand starts at the Beach Road's east building line; the shoreline is at SEA_X. */
export const BEACH_X = BEACH_ROAD + ROAD_HALF + 2.5;
export const SEA_X = 205;
/** Every road: which axis it runs along ('z' = north-south at x = c), its centre line and where it starts / ends. */
export interface RoadLine {
  axis: 'x' | 'z';
  c: number;
  from: number;
  to: number;
}
export function roads(): RoadLine[] {
  return [
    ...X_LINES.map((c) => ({ axis: 'z' as const, c, from: BOUNDS.z0, to: BOUNDS.z1 })),
    ...Z_LINES.map((c) => ({ axis: 'x' as const, c, from: BOUNDS.x0, to: BEACH_ROAD + ROAD_HALF })),
  ];
}

/** Street names (English, Tamil). X_ROADS run north-south at x = line; Z_ROADS run east-west at z = line. */
export const X_ROADS: Record<number, [string, string]> = {
  [-265]: ['Anna Salai (Mount Road)', 'அண்ணா சாலை'],
  [-205]: ['Eldams Road', 'எல்டாம்ஸ் சாலை'],
  [-145]: ['TTK Road', 'டி.டி.கே. சாலை'],
  [-70]: ['R.K. Mutt Road', 'ஆர்.கே. மடம் சாலை'],
  [-25]: ['West Mada Street', 'மேற்கு மாட வீதி'],
  [25]: ['East Mada Street', 'கிழக்கு மாட வீதி'],
  [70]: ['San Thome High Road', 'சாந்தோம் நெடுஞ்சாலை'],
  [125]: ['Kamarajar Salai (Beach Road)', 'காமராஜர் சாலை'],
};
export const Z_ROADS: Record<number, [string, string]> = {
  [-310]: ['Bharathi Salai (Triplicane)', 'பாரதி சாலை'],
  [-220]: ['Wallajah Road', 'வாலாஜா சாலை'],
  [-130]: ['Dr. Radhakrishnan Salai', 'டாக்டர் ராதாகிருஷ்ணன் சாலை'],
  [-70]: ['Luz Church Road', 'லஸ் சர்ச் சாலை'],
  [-25]: ['North Mada Street', 'வடக்கு மாட வீதி'],
  [25]: ['South Mada Street', 'தெற்கு மாட வீதி'],
  [70]: ['Kutchery Road', 'கச்சேரி சாலை'],
  [125]: ['Venkatakrishna Road', 'வெங்கடகிருஷ்ணா சாலை'],
  [180]: ["St. Mary's Road", 'செயின்ட் மேரீஸ் சாலை'],
  [240]: ['R.A. Puram 2nd Main Road', 'ஆர்.ஏ. புரம் 2வது பிரதான சாலை'],
  [300]: ['Greenways Road', 'கிரீன்வேஸ் சாலை'],
  [390]: ['Adyar Main Road', 'அடையார் பிரதான சாலை'],
  [480]: ['Taramani Road (to OMR)', 'தரமணி சாலை'],
  [600]: ['Perungudi Main Road', 'பெருங்குடி பிரதான சாலை'],
};

/**
 * Stretches of a road between crossings: [start, end] pairs along it. A north-south road is
 * crossed by the east-west ones and vice versa; the outermost spans run to the road's ends.
 */
export function roadSpans(r: RoadLine): [number, number][] {
  const crossing = (r.axis === 'z' ? Z_LINES : X_LINES).filter((c) => c > r.from && c < r.to);
  const spans: [number, number][] = [];
  const edges = [r.from, ...crossing, r.to];
  for (let i = 0; i < edges.length - 1; i++) {
    const start = i === 0 ? r.from : edges[i] + ROAD_HALF;
    const end = i === edges.length - 2 ? r.to : edges[i + 1] - ROAD_HALF;
    if (end > start) spans.push([start, end]);
  }
  return spans;
}

export type BlockKind = 'shops' | 'houses' | 'temple' | 'tank' | 'church' | 'beach';
export interface Block {
  i: number; // column (west -> east)
  j: number; // row (north -> south)
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  kind: BlockKind;
  /** Which sides face a road: n = -z, s = +z, w = -x, e = +x. */
  road: { w: boolean; e: boolean; n: boolean; s: boolean };
}

const CENTRE = 2; // block index of the temple (both axes)
const SANTHOME = 4; // block column between San Thome High Road and the Beach Road
/** Grid index offsets: the original Mylapore grid started at R.K. Mutt Road / Luz Church Road. */
const I0 = X_LINES.filter((c) => c < -70).length;
const J0 = Z_LINES.filter((c) => c < -70).length;
/** Alwarpet (just past the canal) and R.A. Puram / Adyar are leafy: houses behind compound walls. */
const housesAt = (i: number, j: number) => i === -1 || (j >= 6 && j <= 8 && i <= SANTHOME); // Taramani (j >= 9) is offices

/** City blocks between roads: lot rectangles (inside the sidewalks) + what goes there. */
export function blocks(): Block[] {
  const ex = [BOUNDS.x0, ...X_LINES, BOUNDS.x1];
  const ez = [BOUNDS.z0, ...Z_LINES, BOUNDS.z1];
  const out: Block[] = [];
  const lo = (e: number[], i: number) => (i === 0 ? e[0] + WORLD_MARGIN : e[i] + SETBACK);
  const hi = (e: number[], i: number) => (i === e.length - 2 ? e[e.length - 1] - WORLD_MARGIN : e[i + 1] - SETBACK);
  for (let ii = 0; ii < ex.length - 1; ii++) {
    for (let jj = 0; jj < ez.length - 1; jj++) {
      const i = ii - I0;
      const j = jj - J0;
      const kind: BlockKind = i > SANTHOME ? 'beach'
        : housesAt(i, j) ? 'houses'
        : j !== CENTRE ? 'shops'
        : i === CENTRE ? 'temple' : i === CENTRE - 1 ? 'tank' : i === SANTHOME ? 'church' : 'shops';
      out.push({
        i, j, x0: lo(ex, ii), x1: hi(ex, ii), z0: lo(ez, jj), z1: hi(ez, jj), kind,
        road: { w: ii > 0, e: ii < ex.length - 2, n: jj > 0, s: jj < ez.length - 2 },
      });
    }
  }
  return out;
}

/** The block at grid position (i, j). */
export function block(i: number, j: number) {
  return blocks().find((b) => b.i === i && b.j === j)!;
}

export const TEMPLE_BLOCK = () => block(CENTRE, CENTRE);
export const TANK_BLOCK = () => block(CENTRE - 1, CENTRE);

/**
 * Mylapore Police Station: a lot on the north side of Kutchery Road, south of the temple
 * (block [2, 3]). Building rows leave it empty; world/policeStation.ts builds it.
 */
/**
 * Walk-in supermarkets (world/supermarket.ts): one across East Mada Street from the temple's
 * main gopuram (entrance facing west), one on North Mada Street (entrance facing south).
 * 16 m frontage x 14 m deep. Building rows leave these lots empty.
 */
export const SUPERMARKET_LOTS = () => {
  const east = block(CENTRE + 1, CENTRE);
  const north = block(CENTRE, CENTRE - 1);
  return [
    { x0: east.x0, x1: east.x0 + 14, z0: -8, z1: 8, facing: 'w' as const },
    { x0: -8, x1: 8, z0: north.z1 - 14, z1: north.z1, facing: 's' as const },
  ];
};

/** MTC Mandaveli bus depot: a walled yard on Venkatakrishna Road (block [2, 5]), gate facing north. */
export const DEPOT_LOT = () => {
  const b = block(CENTRE, CENTRE + 3);
  return { x0: b.x0 + 2, x1: b.x1 - 2, z0: b.z0, z1: b.z0 + 30 };
};

/** Isabel Hospital: on the south side of Luz Church Road (block [3, 1]), front facing north. */
export const HOSPITAL_LOT = () => {
  const b = block(CENTRE + 1, CENTRE - 1);
  return { x0: b.x0 + 1, x1: b.x1 - 1, z0: b.z0, z1: b.z0 + 22 };
};

/**
 * Neighbourhood places (world/places.ts). Each lot has a `front`: the side facing its road.
 *   park (Nageswara Rao Park) north of Luz Church Road, Luz Church opposite it;
 *   vegetable market + auto stand on South Mada Street, south of the tank;
 *   petrol bunk + mechanic on R.K. Mutt Road; cinema, bank and pharmacy on Kutchery Road.
 */
export type Front = 'n' | 's' | 'e' | 'w';
export interface Lot { x0: number; x1: number; z0: number; z1: number; front: Front }
export const PLACE_LOTS = () => {
  const luzN = block(CENTRE - 1, CENTRE - 2);
  const luzS = block(CENTRE - 1, CENTRE - 1);
  const tankS = block(CENTRE - 1, CENTRE + 1);
  const rkm = block(CENTRE - 2, CENTRE + 1);
  const kutW = block(CENTRE - 1, CENTRE + 2);
  const kutE = block(CENTRE + 1, CENTRE + 2);
  const lot = (x0: number, x1: number, z0: number, z1: number, front: Front): Lot => ({ x0, x1, z0, z1, front });
  return {
    park: lot(luzN.x0, luzN.x1, luzN.z0, luzN.z1, 's'),
    church: lot(luzS.x0 + 1, luzS.x1 - 1, luzS.z0, luzS.z0 + 24, 'n'),
    market: lot(tankS.x0, tankS.x0 + 17.5, tankS.z0, tankS.z0 + 20, 'n'),
    stand: lot(tankS.x0 + 17.5, tankS.x1, tankS.z0, tankS.z0 + 14, 'n'),
    bunk: lot(rkm.x1 - 20.5, rkm.x1, rkm.z0, rkm.z0 + 17, 'e'),
    mechanic: lot(rkm.x1 - 20.5, rkm.x1, rkm.z0 + 18, rkm.z1, 'e'),
    cinema: lot(kutE.x0, kutE.x1, kutE.z0, kutE.z0 + 24, 'n'),
    bank: lot(kutW.x0, kutW.x0 + 14, kutW.z0, kutW.z0 + 14, 'n'),
    pharmacy: lot(kutW.x0 + 15, kutW.x0 + 26, kutW.z0, kutW.z0 + 12, 'n'),
  };
};

/** On Santhome beach: the fish market by the fishermen's huts and the evening fair further south. */
export const FISH_MARKET = { x0: 144, x1: 162, z0: 56, z1: 80 };
export const BEACH_FAIR = { x0: 144, x1: 186, z0: 100, z1: 138 };

/** Rectangles of open water (canal and river), leaving out the road bands that bridge them. */
export function waterRects() {
  const out: { x0: number; x1: number; z0: number; z1: number }[] = [];
  /** Split [a, b] around the road bands (centre lines `lines`, half-width SETBACK). */
  const gaps = (a: number, b: number, lines: number[]) => {
    const cuts = lines.filter((c) => c + SETBACK > a && c - SETBACK < b).sort((m, n) => m - n);
    const res: [number, number][] = [];
    let s = a;
    for (const c of cuts) {
      if (c - SETBACK > s) res.push([s, c - SETBACK]);
      s = Math.max(s, c + SETBACK);
    }
    if (b > s) res.push([s, b]);
    return res;
  };
  // The canal meets the river; the river runs east until the Beach Road (a sand bar beyond it).
  for (const [a, b] of [[BOUNDS.z0, RIVER.z0], [RIVER.z1, BOUNDS.z1]]) {
    for (const [z0, z1] of gaps(a, b, Z_LINES)) out.push({ x0: CANAL.x0, x1: CANAL.x1, z0, z1 });
  }
  for (const [x0, x1] of gaps(BOUNDS.x0, BEACH_ROAD + SETBACK, X_LINES)) out.push({ x0, x1, z0: RIVER.z0, z1: RIVER.z1 });
  return out;
}

/** Strips kept free of buildings: the canal + MRTS ticket halls, and the river with its banks. */
export const WATER_LOTS = () => [
  { x0: CANAL.x0 - 5, x1: MRTS_X, z0: BOUNDS.z0, z1: BOUNDS.z1 },
  { x0: BOUNDS.x0, x1: BEACH_X, z0: RIVER.z0 - 2, z1: RIVER.z1 + 2 },
];

/** True if (x, z) is in open water (or within `margin` of it). */
export function inWater(x: number, z: number, margin = 0) {
  return waterRects().some((r) => x > r.x0 - margin && x < r.x1 + margin && z > r.z0 - margin && z < r.z1 + margin);
}

/**
 * Vivekananda College (north of Luz Church Road, block [2, 0], gate facing south), the Madras
 * Boat Club on the Adyar's north bank, and a green campus (banyans, lawns) across the river.
 */
export const COLLEGE_LOT = (): Lot => {
  const b = block(CENTRE, 0);
  return { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, front: 's' };
};
export const BOAT_CLUB_LOT = (): Lot => {
  const b = block(CENTRE + 1, 8);
  return { x0: b.x0, x1: b.x1, z0: b.z0, z1: RIVER.z0, front: 'n' };
};
export const CAMPUS_LOT = (): Lot => {
  const b = block(CENTRE, 8);
  return { x0: b.x0, x1: b.x1, z0: RIVER.z1 + 2, z1: b.z1, front: 's' };
};

/**
 * Real landmarks (world/landmarks.ts), stylised: Music Academy and Narada Gana Sabha on TTK Road,
 * Semmozhi Poonga and the Teynampet Metro entrance on Anna Salai, Ramakrishna Math on R.K. Mutt
 * Road, Vivekanandar Illam (Ice House) on the Beach Road, Ambedkar Manimandapam on Greenways Road
 * and Tholkappia Poonga (Adyar Eco Park) by the river.
 */
export const LANDMARK_LOTS = () => {
  const lot = (x0: number, x1: number, z0: number, z1: number, front: Front): Lot => ({ x0, x1, z0, z1, front });
  const ttkN = block(-1, 0);
  const ttkS = block(-1, 3);
  const anna = block(-2, 0);
  const metro = block(-2, 2);
  const rkm = block(CENTRE - 1, CENTRE + 3);
  const ice = block(SANTHOME, -1);
  const green = block(-1, 7);
  const eco = block(SANTHOME, 7);
  return {
    musicAcademy: lot(ttkN.x1 - 30, ttkN.x1, ttkN.z0, ttkN.z0 + 30, 'e'),
    naradaGanaSabha: lot(ttkS.x1 - 22, ttkS.x1, ttkS.z0, ttkS.z0 + 22, 'e'),
    semmozhiPoonga: lot(anna.x0, anna.x1, anna.z0, anna.z1, 'w'),
    metro: lot(metro.x0, metro.x0 + 14, -9, 9, 'w'),
    ramakrishnaMath: lot(rkm.x0, rkm.x1, rkm.z0, rkm.z1, 'w'),
    vivekanandarIllam: lot(ice.x1 - 28, ice.x1, ice.z1 - 28, ice.z1, 'e'),
    ambedkarManimandapam: lot(green.x0, green.x1, green.z1 - 28, green.z1, 's'),
    tholkappiaPoonga: lot(eco.x0, eco.x1, eco.z0, eco.z1, 's'),
  };
};

/** Tidel Park, Taramani: the glass IT park, facing Taramani Road (block [2, 9]). */
/**
 * Tidel Park spans three blocks ([1..3, 9], ~125 m wide); West and East Mada Street's south ends
 * pass under it through tall gateways (TIDEL_ROADS: the x of each road it bridges).
 */
export const TIDEL_LOT = (): Lot => {
  const a = block(CENTRE - 1, 9);
  const b = block(CENTRE + 1, 9);
  return { x0: a.x0, x1: b.x1, z0: a.z0, z1: a.z1, front: 's' };
};
export const TIDEL_ROADS = [-25, 25];

/**
 * The gated apartment community in Velachery (south-west, by Anna Salai), well away from Tidel
 * Park: Phase 1 with its gate on Anna Salai, Phase 2 next to it with its gate on Taramani Road.
 */
export const COMPLEX_LOTS = (): Lot[] => {
  const p1 = block(-2, 10);
  const p2 = block(-1, 10);
  return [
    { x0: p1.x0, x1: p1.x1, z0: p1.z0, z1: p1.z1, front: 'w' }, // Phase 1, gate on Anna Salai
    { x0: p2.x0, x1: p2.x1, z0: p2.z0, z1: p2.z1, front: 'n' }, // Phase 2, gate on Taramani Road
  ];
};

/**
 * Small lots for the aesthetic cafes and boutiques (world/cafes.ts): TTK Road, Luz, the Beach
 * Road, R.A. Puram, Adyar, Taramani, Anna Salai. 14 m frontage x 13 m deep each.
 */
export const CAFE_LOTS = () => {
  const at = (i: number, j: number, front: Front, along: number): Lot => {
    const b = block(i, j);
    const W = 14;
    const D = 13;
    if (front === 'e') return { x0: b.x1 - D, x1: b.x1, z0: b.z0 + along, z1: b.z0 + along + W, front };
    if (front === 'w') return { x0: b.x0, x1: b.x0 + D, z0: b.z0 + along, z1: b.z0 + along + W, front };
    if (front === 'n') return { x0: b.x0 + along, x1: b.x0 + along + W, z0: b.z0, z1: b.z0 + D, front };
    return { x0: b.x0 + along, x1: b.x0 + along + W, z0: b.z1 - D, z1: b.z1, front };
  };
  return [
    at(-1, 1, 'e', 3), // TTK Road
    at(-1, 4, 'e', 6),
    at(CENTRE + 1, 0, 's', 8), // Luz Church Road
    at(SANTHOME, 3, 'e', 2), // Beach Road
    at(SANTHOME, 5, 'e', 8),
    at(1, 6, 'n', 7), // R.A. Puram
    at(1, 9, 'n', 7), // Adyar Main Road
    at(SANTHOME, 8, 's', 12),
    at(SANTHOME, 9, 's', 6), // Taramani, by Tidel Park
    at(-2, 3, 'w', 4), // Anna Salai
    at(-2, 1, 'w', 6),
    at(SANTHOME, 1, 'e', 4), // Beach Road, by the lighthouse
    at(SANTHOME, 9, 'e', 4), // Besant Nagar food street
    at(SANTHOME, 9, 'e', 22),
    at(SANTHOME, 9, 'e', 40),
  ];
};

/**
 * Besant Nagar (south-east, by the sea): Annai Velankanni church on the Beach Road, and on
 * Elliot's Beach the Ashtalakshmi temple by the shore, the Karl Schmidt memorial and snack carts.
 */
export const BESANT = {
  church: (): Lot => {
    const b = block(SANTHOME, 10);
    return { x0: b.x1 - 30, x1: b.x1, z0: b.z0 + 6, z1: b.z0 + 52, front: 'e' };
  },
  temple: { x0: 158, x1: 182, z0: 430, z1: 456, front: 'w' } as Lot,
  memorial: { x: 174, z: 505 },
  /** Elliot's Beach runs along the sand east of the Beach Road, from the river mouth south. */
  beach: { x0: 138, x1: 190, z0: 360, z1: 600 },
};

/** Chepauk: the M.A. Chidambaram stadium (block [4, -2]) and Presidency College (block [4, -1], north part), both on the Beach Road. */
export const CHEPAUK_LOT = (): Lot => {
  const b = block(SANTHOME, -2);
  return { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, front: 'e' };
};
export const PRESIDENCY_LOT = (): Lot => {
  const b = block(SANTHOME, -1);
  return { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z0 + 40, front: 'e' };
};

export const POLICE_LOT = () => {
  const b = block(CENTRE, CENTRE + 1);
  const mid = (b.x0 + b.x1) / 2;
  return { x0: mid - 10, x1: mid + 10, z0: b.z1 - 18, z1: b.z1 };
};

/**
 * Roadside service stops (world/serviceHubs.ts) spread over the map so you're never far from
 * petrol: each has a petrol bunk, a mechanic shed, an ATM and a medical shop on one 34 x 16 m lot.
 */
export const HUB_W = 34;
export const HUB_D = 16;
export const SERVICE_HUBS: { area: string; ta: string; lot: () => Lot }[] = (() => {
  const at = (i: number, j: number, front: Front, along: number) => (): Lot => {
    const b = block(i, j);
    if (front === 'e') return { x0: b.x1 - HUB_D, x1: b.x1, z0: b.z0 + along, z1: b.z0 + along + HUB_W, front };
    if (front === 'w') return { x0: b.x0, x1: b.x0 + HUB_D, z0: b.z0 + along, z1: b.z0 + along + HUB_W, front };
    if (front === 'n') return { x0: b.x0 + along, x1: b.x0 + along + HUB_W, z0: b.z0, z1: b.z0 + HUB_D, front };
    return { x0: b.x0 + along, x1: b.x0 + along + HUB_W, z0: b.z1 - HUB_D, z1: b.z1, front };
  };
  return [
    { area: 'Triplicane', ta: 'திருவல்லிக்கேணி', lot: at(1, -2, 'w', 10) },
    { area: 'Chepauk', ta: 'சேப்பாக்கம்', lot: at(3, -1, 'e', 30) },
    { area: 'Gopalapuram', ta: 'கோபாலபுரம்', lot: at(-1, -2, 'e', 30) },
    { area: 'Teynampet', ta: 'தேனாம்பேட்டை', lot: at(-2, 4, 'w', 3) },
    { area: 'Alwarpet', ta: 'ஆழ்வார்பேட்டை', lot: at(-1, 6, 'e', 5) },
    { area: 'Santhome', ta: 'சாந்தோம்', lot: at(4, 4, 'e', 3) },
    { area: 'Mandaveli', ta: 'மந்தைவெளி', lot: at(3, 5, 'e', 3) },
    { area: 'R.A. Puram', ta: 'ஆர்.ஏ. புரம்', lot: at(2, 7, 'n', 0.5) },
    { area: 'Adyar', ta: 'அடையார்', lot: at(-1, 9, 'e', 20) },
    { area: 'Taramani', ta: 'தரமணி', lot: at(0, 10, 'e', 10) },
    { area: 'Perungudi', ta: 'பெருங்குடி', lot: at(3, 11, 'e', 5) },
    { area: 'Velachery', ta: 'வேளச்சேரி', lot: at(-2, 11, 'w', 5) },
  ];
})();

/** A lot of frontage w x depth d on one side of block (i, j), `along` metres from its start. */
const sideLot = (i: number, j: number, front: Front, along: number, w: number, d: number): Lot => {
  const b = block(i, j);
  if (front === 'e') return { x0: b.x1 - d, x1: b.x1, z0: b.z0 + along, z1: b.z0 + along + w, front };
  if (front === 'w') return { x0: b.x0, x1: b.x0 + d, z0: b.z0 + along, z1: b.z0 + along + w, front };
  if (front === 'n') return { x0: b.x0 + along, x1: b.x0 + along + w, z0: b.z0, z1: b.z0 + d, front };
  return { x0: b.x0 + along, x1: b.x0 + along + w, z0: b.z1 - d, z1: b.z1, front };
};

/**
 * Silk street: big multi-storey textile / clothing showrooms facing each other along Eldams Road
 * (world/showrooms.ts). Index order = SHOWROOMS data order.
 */
export const SHOWROOM_LOTS = (): Lot[] => [
  sideLot(-2, -1, 'e', 3, 34, 22),
  sideLot(-2, -1, 'e', 39, 34, 22),
  sideLot(-1, -1, 'w', 3, 34, 22),
  sideLot(-1, -1, 'w', 39, 34, 22),
  sideLot(-2, -2, 'e', 20, 34, 22),
  sideLot(-1, -2, 'w', 20, 34, 22),
];

/** Luxury hotels (world/hotels.ts): Anna Salai (Teynampet), TTK Road (Alwarpet), Anna Salai (Adyar end). */
export const HOTEL_LOTS = (): Lot[] => [
  sideLot(-2, 6, 'w', 0, 45, 42),
  sideLot(-1, 5, 'e', 0, 40, 40),
  sideLot(-2, 9, 'w', 6, 64, 42),
];

/** Beachfront shops / restaurants on the Beach Road's west side, facing the sand (world/beachfront.ts). */
export const BEACHFRONT_LOTS = (): Lot[] => [
  sideLot(4, 10, 'e', 56, 22, 20),
  sideLot(4, 10, 'e', 80, 22, 20),
  sideLot(4, 11, 'e', 2, 22, 20),
  sideLot(4, 11, 'e', 26, 22, 20),
  sideLot(4, 6, 'e', 1, 21, 20),
  sideLot(4, 6, 'e', 23.5, 21, 20),
];

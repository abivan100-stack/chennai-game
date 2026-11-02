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
 * Directions: -z = north, +x = east.
 *
 * Cross-section from a road centre line outwards:
 *   road (5 m) | curb | sidewalk (2.5 m, raised 0.15 m) | building frontage
 */
/** World rectangle (metres). Mylapore is the square around the origin; Santhome extends it east. */
export const BOUNDS = { x0: -100, x1: 250, z0: -100, z1: 220 }; // z 100..220: Mandaveli (south)
/** Roads running north-south (centre line x = c). 125 = Kamarajar Salai (Beach Road). */
export const X_LINES = [-70, -25, 25, 70, 125];
/** Roads running east-west (centre line z = c). They end at the Beach Road. */
export const Z_LINES = [-70, -25, 25, 70, 125, 180];
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
  [-70]: ['R.K. Mutt Road', 'ஆர்.கே. மடம் சாலை'],
  [-25]: ['West Mada Street', 'மேற்கு மாட வீதி'],
  [25]: ['East Mada Street', 'கிழக்கு மாட வீதி'],
  [70]: ['San Thome High Road', 'சாந்தோம் நெடுஞ்சாலை'],
  [125]: ['Kamarajar Salai (Beach Road)', 'காமராஜர் சாலை'],
};
export const Z_ROADS: Record<number, [string, string]> = {
  [-70]: ['Luz Church Road', 'லஸ் சர்ச் சாலை'],
  [-25]: ['North Mada Street', 'வடக்கு மாட வீதி'],
  [25]: ['South Mada Street', 'தெற்கு மாட வீதி'],
  [70]: ['Kutchery Road', 'கச்சேரி சாலை'],
  [125]: ['Venkatakrishna Road', 'வெங்கடகிருஷ்ணா சாலை'],
  [180]: ["St. Mary's Road", 'செயின்ட் மேரீஸ் சாலை'],
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

export type BlockKind = 'shops' | 'temple' | 'tank' | 'church' | 'beach';
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
const SANTHOME = X_LINES.length - 1; // block column between San Thome High Road and the Beach Road

/** City blocks between roads: lot rectangles (inside the sidewalks) + what goes there. */
export function blocks(): Block[] {
  const ex = [BOUNDS.x0, ...X_LINES, BOUNDS.x1];
  const ez = [BOUNDS.z0, ...Z_LINES, BOUNDS.z1];
  const out: Block[] = [];
  const lo = (e: number[], i: number) => (i === 0 ? e[0] + WORLD_MARGIN : e[i] + SETBACK);
  const hi = (e: number[], i: number) => (i === e.length - 2 ? e[e.length - 1] - WORLD_MARGIN : e[i + 1] - SETBACK);
  for (let i = 0; i < ex.length - 1; i++) {
    for (let j = 0; j < ez.length - 1; j++) {
      const kind: BlockKind = i > SANTHOME ? 'beach'
        : j !== CENTRE ? 'shops'
        : i === CENTRE ? 'temple' : i === CENTRE - 1 ? 'tank' : i === SANTHOME ? 'church' : 'shops';
      out.push({
        i, j, x0: lo(ex, i), x1: hi(ex, i), z0: lo(ez, j), z1: hi(ez, j), kind,
        road: { w: i > 0, e: i < ex.length - 2, n: j > 0, s: j < ez.length - 2 },
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

export const POLICE_LOT = () => {
  const b = block(CENTRE, CENTRE + 1);
  const mid = (b.x0 + b.x1) / 2;
  return { x0: mid - 10, x1: mid + 10, z0: b.z1 - 18, z1: b.z1 };
};

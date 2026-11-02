/**
 * Street grid of the town: a stylised Mylapore around the Kapaleeshwarar temple.
 * Every world builder (ground, buildings, temple, props) and the NPC paths read these numbers,
 * so changing the layout here keeps everything lined up.
 *
 *   - Centre block: the temple, main gopuram facing east onto East Mada Street.
 *   - Block west of it: the temple tank, with R.K. Mutt Road beyond.
 *   - The four Mada Streets ring the temple; Luz Church Road (north), Kutchery Road (south)
 *     and San Thome High Road (east) form the outer roads.
 * Directions: -z = north, +x = east.
 *
 * Cross-section from a road centre line outwards:
 *   road (5 m) | curb | sidewalk (2.5 m, raised 0.15 m) | building frontage
 */
export const WORLD_SIZE = 200; // metres, square, centred on the origin
export const HALF = WORLD_SIZE / 2;
export const ROAD_LINES = [-70, -25, 25, 70]; // centre lines, same on both axes
export const ROAD_HALF = 5;
export const SIDEWALK_WIDTH = 2.5;
export const SIDEWALK_HEIGHT = 0.15;
export const SETBACK = ROAD_HALF + SIDEWALK_WIDTH; // road centre -> building front
export const WORLD_MARGIN = 2; // buildings stop this far from the world edge

/** Street names (English, Tamil). X_ROADS run north-south at x = line; Z_ROADS run east-west at z = line. */
export const X_ROADS: Record<number, [string, string]> = {
  [-70]: ['R.K. Mutt Road', 'ஆர்.கே. மடம் சாலை'],
  [-25]: ['West Mada Street', 'மேற்கு மாட வீதி'],
  [25]: ['East Mada Street', 'கிழக்கு மாட வீதி'],
  [70]: ['San Thome High Road', 'சாந்தோம் நெடுஞ்சாலை'],
};
export const Z_ROADS: Record<number, [string, string]> = {
  [-70]: ['Luz Church Road', 'லஸ் சர்ச் சாலை'],
  [-25]: ['North Mada Street', 'வடக்கு மாட வீதி'],
  [25]: ['South Mada Street', 'தெற்கு மாட வீதி'],
  [70]: ['Kutchery Road', 'கச்சேரி சாலை'],
};

/**
 * Stretches of road between crossings, along either axis: [start, end] pairs.
 * The outermost spans run to the world edge.
 */
export function roadSpans(): [number, number][] {
  const spans: [number, number][] = [];
  const edges = [-HALF, ...ROAD_LINES, HALF];
  for (let i = 0; i < edges.length - 1; i++) {
    const start = i === 0 ? -HALF : edges[i] + ROAD_HALF;
    const end = i === edges.length - 2 ? HALF : edges[i + 1] - ROAD_HALF;
    spans.push([start, end]);
  }
  return spans;
}

export type BlockKind = 'shops' | 'temple' | 'tank';
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

const CENTRE = Math.floor(ROAD_LINES.length / 2); // block index of the temple (both axes)

/** City blocks between roads: lot rectangles (inside the sidewalks) + what goes there. */
export function blocks(): Block[] {
  const edges = [-HALF, ...ROAD_LINES, HALF];
  const out: Block[] = [];
  const lo = (i: number) => (i === 0 ? -HALF + WORLD_MARGIN : edges[i] + SETBACK);
  const hi = (i: number) => (i === edges.length - 2 ? HALF - WORLD_MARGIN : edges[i + 1] - SETBACK);
  for (let i = 0; i < edges.length - 1; i++) {
    for (let j = 0; j < edges.length - 1; j++) {
      const kind: BlockKind = j !== CENTRE ? 'shops' : i === CENTRE ? 'temple' : i === CENTRE - 1 ? 'tank' : 'shops';
      out.push({
        i, j, x0: lo(i), x1: hi(i), z0: lo(j), z1: hi(j), kind,
        road: { w: i > 0, e: i < edges.length - 2, n: j > 0, s: j < edges.length - 2 },
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
export const POLICE_LOT = () => {
  const b = block(CENTRE, CENTRE + 1);
  const mid = (b.x0 + b.x1) / 2;
  return { x0: mid - 10, x1: mid + 10, z0: b.z1 - 18, z1: b.z1 };
};

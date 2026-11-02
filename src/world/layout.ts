/**
 * Street grid of the test town. Every world builder (ground, buildings, props) and the NPC
 * paths read these numbers, so changing the layout here keeps everything lined up.
 *
 * Cross-section from a road centre line outwards:
 *   road (5 m) | curb | sidewalk (2.5 m, raised 0.15 m) | building frontage
 */
export const WORLD_SIZE = 200; // metres, square, centred on the origin
export const HALF = WORLD_SIZE / 2;
export const ROAD_LINES = [-50, 0, 50]; // centre lines, same on both axes
export const ROAD_HALF = 5;
export const SIDEWALK_WIDTH = 2.5;
export const SIDEWALK_HEIGHT = 0.15;
export const SETBACK = ROAD_HALF + SIDEWALK_WIDTH; // road centre -> building front
export const WORLD_MARGIN = 2; // buildings stop this far from the world edge

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

/** City blocks between roads: building lot rectangles + which sides face a road. */
export function blocks() {
  const edges = [-HALF, ...ROAD_LINES, HALF];
  const out: { x0: number; x1: number; z0: number; z1: number; road: { w: boolean; e: boolean; n: boolean; s: boolean } }[] = [];
  const lo = (i: number) => (i === 0 ? -HALF + WORLD_MARGIN : edges[i] + SETBACK);
  const hi = (i: number) => (i === edges.length - 2 ? HALF - WORLD_MARGIN : edges[i + 1] - SETBACK);
  for (let i = 0; i < edges.length - 1; i++) {
    for (let j = 0; j < edges.length - 1; j++) {
      out.push({
        x0: lo(i),
        x1: hi(i),
        z0: lo(j),
        z1: hi(j),
        // n = -z side, s = +z side, w = -x side, e = +x side
        road: { w: i > 0, e: i < edges.length - 2, n: j > 0, s: j < edges.length - 2 },
      });
    }
  }
  return out;
}

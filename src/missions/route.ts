/**
 * Shortest route along the street grid, for the map's guide line. Pure logic (no three.js) so
 * scripts/check.ts can test it.
 *
 * Every road is a straight line (x = c running north-south, z = c running east-west, for c in
 * `lines`). Junctions are graph nodes; the start and end points are snapped onto their nearest
 * road and joined to the junctions either side of them.
 */
export interface Pt {
  x: number;
  z: number;
}

interface Snap {
  p: Pt;
  axis: 'x' | 'z'; // road runs along z at x = line ('x'), or along x at z = line ('z')
  line: number;
}

/** Nearest road to p. East-west roads end at the last north-south road (the Beach Road), so beyond it only north-south roads count. */
function snap(p: Pt, xLines: number[], zLines: number[]): Snap {
  let best: Snap = { p, axis: 'x', line: xLines[0] };
  let bestD = Infinity;
  for (const c of xLines) {
    if (Math.abs(p.x - c) < bestD) {
      bestD = Math.abs(p.x - c);
      best = { p: { x: c, z: p.z }, axis: 'x', line: c };
    }
  }
  const eastEnd = Math.max(...xLines);
  for (const c of zLines) {
    if (p.x <= eastEnd && Math.abs(p.z - c) < bestD) {
      bestD = Math.abs(p.z - c);
      best = { p: { x: p.x, z: c }, axis: 'z', line: c };
    }
  }
  return best;
}

const key = (p: Pt) => `${p.x},${p.z}`;
const dist = (a: Pt, b: Pt) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);

/** Junctions on the same road just before and after a snapped point. */
function neighbours(s: Snap, xs: number[], zs: number[]): Pt[] {
  const along = s.axis === 'x' ? s.p.z : s.p.x;
  const cross = s.axis === 'x' ? zs : xs;
  const before = [...cross].reverse().find((c) => c <= along);
  const after = cross.find((c) => c >= along);
  return [before, after]
    .filter((c): c is number => c !== undefined)
    .map((c) => (s.axis === 'x' ? { x: s.line, z: c } : { x: c, z: s.line }));
}

/**
 * Route from `from` to `to` along the roads: [from, onto road, junctions..., off road, to].
 * xLines: north-south roads (x = c); zLines: east-west roads (z = c), which span the xLines.
 */
export function route(from: Pt, to: Pt, xLines: number[], zLines: number[]): Pt[] {
  const xs = [...xLines].sort((m, n) => m - n);
  const zs = [...zLines].sort((m, n) => m - n);
  const a = snap(from, xs, zs);
  const b = snap(to, xs, zs);
  // Same road: straight along it.
  if (a.axis === b.axis && a.line === b.line) return [from, a.p, b.p, to];

  // Graph: all junctions + the two snapped points.
  const edges = new Map<string, Pt[]>();
  const link = (p: Pt, q: Pt) => {
    if (!edges.has(key(p))) edges.set(key(p), []);
    if (!edges.has(key(q))) edges.set(key(q), []);
    edges.get(key(p))!.push(q);
    edges.get(key(q))!.push(p);
  };
  for (const x of xs) for (let i = 0; i < zs.length - 1; i++) link({ x, z: zs[i] }, { x, z: zs[i + 1] });
  for (const z of zs) for (let i = 0; i < xs.length - 1; i++) link({ x: xs[i], z }, { x: xs[i + 1], z });
  for (const n of neighbours(a, xs, zs)) link(a.p, n);
  for (const n of neighbours(b, xs, zs)) link(b.p, n);

  // Dijkstra (a few dozen nodes: a plain array scan is plenty).
  const best = new Map<string, number>([[key(a.p), 0]]);
  const prev = new Map<string, Pt>();
  const open: Pt[] = [a.p];
  const done = new Set<string>();
  while (open.length) {
    open.sort((p, q) => best.get(key(p))! - best.get(key(q))!);
    const cur = open.shift()!;
    if (done.has(key(cur))) continue;
    done.add(key(cur));
    if (key(cur) === key(b.p)) break;
    for (const nb of edges.get(key(cur)) ?? []) {
      const d = best.get(key(cur))! + dist(cur, nb);
      if (d < (best.get(key(nb)) ?? Infinity)) {
        best.set(key(nb), d);
        prev.set(key(nb), cur);
        open.push(nb);
      }
    }
  }
  const path: Pt[] = [b.p];
  let k = key(b.p);
  while (prev.has(k)) {
    const p = prev.get(k)!;
    path.unshift(p);
    k = key(p);
  }
  return [from, ...path, to];
}

/** Total length of a route (for the phone: "420 m to go"). */
export function routeLength(pts: Pt[]) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return d;
}

export interface Turn {
  /** What to do at `at`: turn, or arrive (the destination is on that side of the road). */
  kind: 'left' | 'right' | 'arrive';
  /** Metres along the route to `at`. */
  dist: number;
  at: Pt;
  /** The stretch after the turn (to name the road you turn onto). */
  next: Pt | null;
  /** For 'arrive': which side of the road the destination is on. */
  side?: 'left' | 'right';
}

/** Ignore the short hop from the player onto the road (lane offset), it isn't a turn. */
const JOIN_HOP = 8;

/**
 * The next instruction along a route() result, like a nav app: "turn right in 120 m" or
 * "arrive, on your left". Screen-style axes (x east, z south), so cross > 0 is a right turn.
 */
export function nextTurn(route: Pt[]): Turn | null {
  const pts = route.filter((p, i) => i === 0 || Math.hypot(p.x - route[i - 1].x, p.z - route[i - 1].z) > 0.5);
  if (pts.length >= 3 && Math.hypot(pts[1].x - pts[0].x, pts[1].z - pts[0].z) < JOIN_HOP) pts.shift();
  if (pts.length < 2) return null;
  let dist = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    dist += Math.hypot(b.x - a.x, b.z - a.z);
    const c = pts[i + 1];
    if (!c) return { kind: 'arrive', dist, at: b, next: null };
    const ix = b.x - a.x;
    const iz = b.z - a.z;
    const ox = c.x - b.x;
    const oz = c.z - b.z;
    const cross = ix * oz - iz * ox;
    const len = Math.hypot(ix, iz) * Math.hypot(ox, oz);
    if (Math.abs(cross) < len * 0.5) continue; // carrying straight on
    const side = cross > 0 ? 'right' : 'left';
    // The last bend is the hop off the road to the door: that's "arrive, on your <side>".
    if (i === pts.length - 2) return { kind: 'arrive', side, dist, at: b, next: null };
    return { kind: side, dist, at: b, next: c };
  }
  return null;
}

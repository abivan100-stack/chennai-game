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

function snap(p: Pt, lines: number[]): Snap {
  let best: Snap = { p, axis: 'x', line: lines[0] };
  let bestD = Infinity;
  for (const c of lines) {
    if (Math.abs(p.x - c) < bestD) {
      bestD = Math.abs(p.x - c);
      best = { p: { x: c, z: p.z }, axis: 'x', line: c };
    }
    if (Math.abs(p.z - c) < bestD) {
      bestD = Math.abs(p.z - c);
      best = { p: { x: p.x, z: c }, axis: 'z', line: c };
    }
  }
  return best;
}

const key = (p: Pt) => `${p.x},${p.z}`;
const dist = (a: Pt, b: Pt) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);

/** Junctions on the same road just before and after a snapped point. */
function neighbours(s: Snap, lines: number[]): Pt[] {
  const along = s.axis === 'x' ? s.p.z : s.p.x;
  const before = [...lines].reverse().find((c) => c <= along);
  const after = lines.find((c) => c >= along);
  return [before, after]
    .filter((c): c is number => c !== undefined)
    .map((c) => (s.axis === 'x' ? { x: s.line, z: c } : { x: c, z: s.line }));
}

/** Route from `from` to `to` along the roads: [from, onto road, junctions..., off road, to]. */
export function route(from: Pt, to: Pt, lines: number[]): Pt[] {
  const a = snap(from, lines);
  const b = snap(to, lines);
  // Same road: straight along it.
  if (a.axis === b.axis && a.line === b.line) return [from, a.p, b.p, to];

  // Graph: all junctions + the two snapped points.
  const nodes: Pt[] = [];
  for (const x of lines) for (const z of lines) nodes.push({ x, z });
  const edges = new Map<string, Pt[]>();
  const link = (p: Pt, q: Pt) => {
    if (!edges.has(key(p))) edges.set(key(p), []);
    if (!edges.has(key(q))) edges.set(key(q), []);
    edges.get(key(p))!.push(q);
    edges.get(key(q))!.push(p);
  };
  const sorted = [...lines].sort((m, n) => m - n);
  for (const c of sorted) {
    for (let i = 0; i < sorted.length - 1; i++) {
      link({ x: c, z: sorted[i] }, { x: c, z: sorted[i + 1] });
      link({ x: sorted[i], z: c }, { x: sorted[i + 1], z: c });
    }
  }
  for (const n of neighbours(a, sorted)) link(a.p, n);
  for (const n of neighbours(b, sorted)) link(b.p, n);

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

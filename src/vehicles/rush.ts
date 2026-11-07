/**
 * How busy the roads are by the clock (game hour, IST): the share of traffic that's out.
 * Full at the morning (8-10) and evening (17-20:30) rush, thinner through the day, nearly empty
 * at 3-4 am. Piecewise linear between these points. Pure (scripts/check.ts tests it).
 */
const CURVE: [number, number][] = [
  [0, 0.25], [3, 0.1], [4, 0.1], [5, 0.25], [6, 0.5], [7, 0.8], [8, 1], [10, 1], [11, 0.7],
  [16, 0.7], [17, 1], [20.5, 1], [22, 0.6], [23, 0.4], [24, 0.25],
];

export function trafficDensity(hour: number) {
  const h = ((hour % 24) + 24) % 24;
  for (let i = 1; i < CURVE.length; i++) {
    const [h1, d1] = CURVE[i];
    if (h <= h1) {
      const [h0, d0] = CURVE[i - 1];
      return d0 + ((d1 - d0) * (h - h0)) / (h1 - h0);
    }
  }
  return CURVE[0][1];
}

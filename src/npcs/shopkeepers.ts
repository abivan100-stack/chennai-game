import type { PoseClip } from './npc';

/**
 * Shopkeepers standing at the doorway of the town's signboard shops (world/buildings.ts
 * footprints: each signed shop's shopfront middle and facing). Every SHOP_EVERY-th shop gets one,
 * at most MAX of them; only the nearest are ever drawn (crowd.ts MAX_POSED_DRAWN), so this is cheap.
 */
const SHOP_EVERY = 3;
const MAX = 150;
const OUT = 0.75; // m in front of the shopfront, on the pavement
const SIDEWALK_Y = 0.15;
/** Most shops open from morning till late. */
const HOURS: [number, number][] = [[8, 22]];
const NAMES = ['Murugan anna', 'Selvi akka', 'Ganesan', 'Lakshmi akka', 'Kannan', 'Rafiq bhai', 'Pandian', 'Meena akka', 'Shankar', 'Valli akka', 'Sekar', 'Joseph anna', 'Kumaresan', 'Bhuvana akka', 'Iqbal', 'Raghavan'];

export type Posed = { name: string; x: number; y: number; z: number; yaw: number; clip: PoseClip; hours: [number, number][] };

export function shopkeepers(footprints: { shops: { x: number; z: number; yaw: number }[] }[]): Posed[] {
  const out: Posed[] = [];
  // Spread over the whole map: every `step`-th shop, so the cap doesn't fill up in one area.
  const total = footprints.reduce((n, f) => n + f.shops.length, 0);
  const step = Math.max(SHOP_EVERY, Math.ceil(total / MAX));
  let n = 0;
  for (const f of footprints) {
    for (const s of f.shops) {
      if (n++ % step !== 0 || out.length >= MAX) continue;
      out.push({
        name: `${NAMES[out.length % NAMES.length]} (kadai)`,
        x: s.x + Math.sin(s.yaw) * OUT,
        y: SIDEWALK_Y,
        z: s.z + Math.cos(s.yaw) * OUT,
        yaw: s.yaw,
        clip: 'idle',
        hours: HOURS,
      });
    }
  }
  return out;
}

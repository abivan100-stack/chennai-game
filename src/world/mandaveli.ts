import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { busModel } from '../vehicles/models';
import { GeoBuilder } from './geo';
import { BEACH_X, BOUNDS, DEPOT_LOT } from './layout';

/**
 * Mandaveli and the MRTS. The MTC bus depot sits on Venkatakrishna Road. Like the real city, the
 * Buckingham Canal and the elevated MRTS line run NORTH-SOUTH just west of town (past the
 * west wall), with Thirumayilai station west of Mylapore and Mandaveli station further south;
 * a suburban train runs along it, stopping at both. The canal is beyond the wall, so you can
 * see it but not walk into the water. Plain land fills the space past the north and south
 * edges so the town doesn't end in a void.
 */

// The line is built in its own frame: x = along the line (becomes world z, north -> south),
// z = across it (0 at the town's west wall, growing westwards).
const CANAL = { z0: 9, z1: 21, y: -1.1 }; // water strip, sunk below the banks
const FAR_BANK = 320; // land beyond the canal
const RAIL_Z = 15; // the viaduct runs right over the canal
const DECK_Y = 9; // rail level
const SPAN = 16; // m between viaduct piers
const LINE_X = [-460, 560]; // the line runs well past both ends of town
const STATIONS = [
  { x0: -58, x1: 6, ta: 'திருமயிலை', en: 'THIRUMAYILAI  ·  MRTS' },
  { x0: 128, x1: 192, ta: 'மந்தைவெளி', en: 'MANDAVELI  ·  MRTS' },
];
const TRAIN = { coaches: 4, coachLen: 20, gap: 0.8, speed: 13, wait: 25, dwell: 12 }; // m/s, s
const OUTSKIRTS = 600; // m of plain land past the north and south edges

const CONCRETE = new THREE.Color(0xd8d2c4);
const CONCRETE_DARK = new THREE.Color(0xa8a194);
const EARTH = new THREE.Color(0x6f6754);
const ROOF = new THREE.Color(0x8a2b2b);
const DEPOT_WALL = new THREE.Color(0xe9dfc8);
const DEPOT_BAND = new THREE.Color(0x1d4fa8);

function signTexture(lines: [string, string], bg: string, fg: string) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 192;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 1024, 192);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '700 54px "Nirmala UI", "Latha", "Noto Sans Tamil", sans-serif';
  g.fillText(lines[0], 512, 60);
  g.font = '800 62px system-ui, sans-serif';
  g.fillText(lines[1], 512, 138);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The suburban EMU: white-and-blue coaches with a window band, one merged mesh. */
function trainGeometry() {
  const b = new GeoBuilder();
  const white = new THREE.Color(0xf1f1ec);
  const blue = new THREE.Color(0x24489a);
  const glass = new THREE.Color(0x253038);
  const under = new THREE.Color(0x2b2b2b);
  for (let i = 0; i < TRAIN.coaches; i++) {
    const x = i * (TRAIN.coachLen + TRAIN.gap);
    b.box(TRAIN.coachLen, 3.2, 3.1, x, 2.4, 0, white);
    b.box(TRAIN.coachLen + 0.02, 0.45, 3.14, x, 1.25, 0, blue);
    b.box(TRAIN.coachLen - 1.5, 0.9, 3.16, x, 2.75, 0, glass);
    b.box(TRAIN.coachLen - 1, 0.6, 2.6, x, 0.5, 0, under);
    for (const d of [-6, 0, 6]) b.box(1.3, 2.1, 3.18, x + d, 2.05, 0, blue); // doors
  }
  return b.build();
}

export function createMandaveli(scene: THREE.Scene, world: RAPIER.World) {
  const geo = new GeoBuilder();
  const solid = (w: number, h: number, d: number, x: number, y: number, z: number, c: THREE.Color) => {
    geo.box(w, h, d, x, y + h / 2, z, c);
    world.createCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(x, y + h / 2, z));
  };

  // ---- MTC bus depot ------------------------------------------------------------------------
  const lot = DEPOT_LOT();
  const cx = (lot.x0 + lot.x1) / 2;
  const w = lot.x1 - lot.x0;
  const d = lot.z1 - lot.z0;
  const gate = 10;
  // Compound wall: back and sides, front either side of the gate (gate faces Venkatakrishna Road).
  solid(w, 2.2, 0.3, cx, 0, lot.z1, DEPOT_WALL);
  solid(0.3, 2.2, d, lot.x0, 0, (lot.z0 + lot.z1) / 2, DEPOT_WALL);
  solid(0.3, 2.2, d, lot.x1, 0, (lot.z0 + lot.z1) / 2, DEPOT_WALL);
  const side = (w - gate) / 2;
  solid(side, 2.2, 0.3, lot.x0 + side / 2, 0, lot.z0, DEPOT_WALL);
  solid(side, 2.2, 0.3, lot.x1 - side / 2, 0, lot.z0, DEPOT_WALL);
  geo.box(w + 0.1, 0.35, 0.34, cx, 2.0, lot.z1, DEPOT_BAND);
  // Concrete yard and a long open shed on pillars at the back.
  geo.box(w - 0.4, 0.02, d - 0.4, cx, 0.01, (lot.z0 + lot.z1) / 2, CONCRETE_DARK);
  const shedZ = lot.z1 - 7;
  for (let x = lot.x0 + 3; x <= lot.x1 - 3; x += 6) for (const dz of [-5, 5]) solid(0.4, 5.5, 0.4, x, 0, shedZ + dz, CONCRETE);
  geo.box(w - 2, 0.3, 13, cx, 5.65, shedZ, ROOF);
  // Gate pillars + arch board.
  solid(0.8, 4.2, 0.8, cx - gate / 2 - 0.4, 0, lot.z0, DEPOT_WALL);
  solid(0.8, 4.2, 0.8, cx + gate / 2 + 0.4, 0, lot.z0, DEPOT_WALL);
  const depotSign = new THREE.Mesh(new THREE.PlaneGeometry(gate + 2, 1.7), new THREE.MeshStandardMaterial({ map: signTexture(['மாநகர் போக்குவரத்துக் கழகம்', 'MTC MANDAVELI DEPOT'], '#1d4fa8', '#ffffff') }));
  depotSign.position.set(cx, 4.9, lot.z0 - 0.45);
  depotSign.rotation.y = Math.PI; // faces the road (north)
  scene.add(depotSign);
  // Parked buses under the shed (two: each is a detailed model, ~7 draw calls).
  for (const [i, route, to] of [[0, '12B', 'T.NAGAR'], [1, '21G', 'BROADWAY']] as const) {
    const g = new THREE.Group();
    busModel(g, route, to);
    g.position.set(cx - 5 + i * 10, 0, shedZ);
    g.rotation.y = Math.PI; // nose out towards the gate
    scene.add(g);
    world.createCollider(RAPIER.ColliderDesc.cuboid(1.25, 1.6, 5).setTranslation(g.position.x, 1.6, g.position.z));
  }

  // ---- Land past the north and south edges (the beach covers the east, the canal the west) --
  for (const [z0, z1] of [[BOUNDS.z1, BOUNDS.z1 + OUTSKIRTS], [BOUNDS.z0 - OUTSKIRTS, BOUNDS.z0]]) {
    geo.box(BEACH_X - BOUNDS.x0, 0.6, z1 - z0, (BOUNDS.x0 + BEACH_X) / 2, -0.3, (z0 + z1) / 2, EARTH);
  }

  const town = new THREE.Mesh(geo.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  town.castShadow = town.receiveShadow = true;
  scene.add(town);

  // ---- Canal, banks, MRTS viaduct and stations, in the line's own frame ---------------------
  const line = new THREE.Group();
  line.rotation.y = -Math.PI / 2; // line x -> world +z (south), line z -> world -x (west)
  line.position.set(BOUNDS.x0, 0, 0);
  scene.add(line);
  const lg = new GeoBuilder();
  const len = LINE_X[1] - LINE_X[0];
  const mid = (LINE_X[0] + LINE_X[1]) / 2;
  lg.box(len, 0.6, CANAL.z0, mid, -0.6, CANAL.z0 / 2, EARTH); // town-side bank
  lg.box(len, 0.6, FAR_BANK - CANAL.z1, mid, -0.6, (CANAL.z1 + FAR_BANK) / 2, EARTH);
  for (let x = LINE_X[0]; x <= LINE_X[1]; x += SPAN) {
    lg.box(1.4, DECK_Y - 0.6, 1.4, x, (DECK_Y - 0.6) / 2 + CANAL.y, RAIL_Z, CONCRETE); // piers standing in the canal
    lg.box(1.6, 0.8, 6.5, x, DECK_Y - 0.6, RAIL_Z, CONCRETE_DARK); // pier caps
  }
  lg.box(len, 1.0, 6.2, mid, DECK_Y - 0.5, RAIL_Z, CONCRETE); // deck
  lg.box(len, 0.9, 0.2, mid, DECK_Y + 0.45, RAIL_Z - 3.0, CONCRETE_DARK); // parapets
  lg.box(len, 0.9, 0.2, mid, DECK_Y + 0.45, RAIL_Z + 3.0, CONCRETE_DARK);
  const signs: THREE.MeshStandardMaterial[] = [];
  for (const st of STATIONS) {
    const sx = (st.x0 + st.x1) / 2;
    const sw = st.x1 - st.x0;
    for (const s of [-1, 1]) lg.box(sw, 1.0, 3.5, sx, DECK_Y - 0.5, RAIL_Z + s * 4.8, CONCRETE); // platforms
    for (let x = st.x0 + 2; x <= st.x1 - 2; x += 8) for (const s of [-1, 1]) lg.box(0.3, 4, 0.3, x, DECK_Y + 2, RAIL_Z + s * 6.2, CONCRETE_DARK);
    lg.box(sw + 2, 0.35, 14, sx, DECK_Y + 4.1, RAIL_Z, ROOF);
    lg.box(18, DECK_Y - 1, 8, sx, (DECK_Y - 1) / 2 - 0.3, RAIL_Z - 9.5, CONCRETE); // ticket hall on the town bank
    lg.box(18.2, 0.6, 8.2, sx, DECK_Y - 1.5, RAIL_Z - 9.5, ROOF);
    const mat = new THREE.MeshStandardMaterial({ map: signTexture([st.ta, st.en], '#f4c20d', '#1a1a1a'), emissive: 0xffffff, emissiveIntensity: 0 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(12, 2.2), mat);
    sign.position.set(sx, DECK_Y + 5.4, RAIL_Z - 7.1);
    sign.rotation.y = Math.PI; // faces the town (east)
    line.add(sign);
    signs.push(mat);
  }
  const lineMesh = new THREE.Mesh(lg.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  lineMesh.castShadow = lineMesh.receiveShadow = true;
  line.add(lineMesh);
  line.add(new THREE.Mesh(
    new THREE.PlaneGeometry(len, CANAL.z1 - CANAL.z0).rotateX(-Math.PI / 2).translate(mid, CANAL.y, (CANAL.z0 + CANAL.z1) / 2),
    new THREE.MeshStandardMaterial({ color: 0x3e5a4a, roughness: 0.15, metalness: 0.2 }),
  ));

  // ---- The train: runs north to south, stopping at each station ---------------------------
  const train = new THREE.Mesh(trainGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 }));
  train.castShadow = true;
  line.add(train);
  const trainLen = TRAIN.coaches * (TRAIN.coachLen + TRAIN.gap);
  const stops = STATIONS.map((st) => (st.x0 + st.x1) / 2 - trainLen / 2 + TRAIN.coachLen / 2); // front coach origin when berthed
  let tx = LINE_X[0] - trainLen;
  let hold = 0;
  const place = () => train.position.set(tx, DECK_Y, RAIL_Z + 1.6);
  place();

  return {
    update(dt: number) {
      if (hold > 0) {
        hold -= dt;
        return;
      }
      const before = tx;
      tx += TRAIN.speed * dt;
      const stop = stops.find((x) => before < x && tx >= x);
      if (stop !== undefined) {
        tx = stop;
        hold = TRAIN.dwell; // passengers on and off
      }
      if (tx > LINE_X[1]) {
        tx = LINE_X[0] - trainLen;
        hold = TRAIN.wait;
      }
      place();
    },
    setNight(f: number) {
      for (const m of signs) m.emissiveIntensity = f * 0.6;
    },
  };
}

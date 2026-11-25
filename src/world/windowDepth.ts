import * as THREE from 'three';
import { FACADE_TILE, FACADE_WIN, SHOP_ROWS, SHOP_TILE } from './textures';

/** Light on the recess faces: underside of the lintel, sides, top of the sill. */
const REVEAL_SHADE = { soffit: 0.5, side: 0.72, sill: 0.95 };
/** How far the window glass sits back in the wall (m). */
const WINDOW_RECESS = 0.25;
/** How far a shop's goods / shutter sit back behind the pillars (m). */
const SHOP_RECESS = 0.5;

/**
 * Openings painted in a tiling texture, in tile-local UV (0..1 after `cellV` rows per v unit):
 * two columns centred at u 0.25 / 0.75, and one centre per half of the tile in v
 * (cv[0] for v < 0.5, cv[1] above).
 */
type Openings = { cellV: number; hu: number; hv: number; cv: [number, number]; depth: number; glass?: boolean };
/** Window glass: smooth and a little metallic, so it mirrors the sky (scene.environment) at an angle. */
const GLASS_ROUGHNESS = 0.06;
const GLASS_METALNESS = 0.35;
/** Share of windows dark at night; of the lit ones, a cool tube light / a blue TV glow. */
const WIN_DARK = 0.5;
const WIN_TUBE = 0.25;
const WIN_TV = 0.08;

/**
 * Recessed openings without geometry. For a pixel inside an opening, the view ray is followed into
 * the wall (UV gradients from screen derivatives, so it works however the tile is stretched): it
 * either reaches the back (sampled where the ray lands, so the glass / goods slide as you walk
 * past) or first hits a side of the opening, drawn in the colour just outside it (frame, pillar,
 * lintel) and shaded by which face it is. Night glow follows the back. A few dozen ALU ops on
 * opening pixels; no triangles, no draw calls. Static meshes only (chunk.ts won't chunk it, so
 * apply after chunkStaticMeshes for anything that should be chunked).
 */
function recess(m: THREE.MeshStandardMaterial, o: Openings, key: string) {
  const f = (x: number) => x.toFixed(5);
  // Glass windows at night: which room is lit (and how) per window, seeded by the tile cell, the
  // window and the building's wall colour, so buildings and floors don't repeat one pattern.
  const rooms = o.glass
    ? `{
          vec2 rc = floor( vMapUv * vec2( 1.0, ${f(o.cellV)} ) );
          vec2 rw = step( 0.5, vMapUv * vec2( 1.0, ${f(o.cellV)} ) - rc );
          float seed = dot( vec4( rc, rw ), vec4( 12.9898, 78.233, 37.719, 4.581 ) );
          #ifdef USE_COLOR
            seed += dot( vColor.rgb, vec3( 91.7, 53.1, 27.3 ) );
          #endif
          float h = fract( sin( seed ) * 43758.5453 );
          float k = ( h - ${f(WIN_DARK)} ) / ${f(1 - WIN_DARK)}; // 0..1 among the lit rooms
          winLight = h < ${f(WIN_DARK)} ? vec3( 0.0 )
            : k < ${f(WIN_TV)} ? vec3( 0.25, 0.4, 0.9 )
            : k < ${f(WIN_TV + WIN_TUBE)} ? vec3( 0.85, 1.0, 1.25 )
            : vec3( 1.0, 0.95 - 0.2 * fract( h * 7.0 ), 0.9 );
        }`
    : '';
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <map_fragment>',
        `vec2 winUv = vMapUv;
        float winShade = 1.0;
        float winGlass = 0.0;
        vec3 winLight = vec3( 1.0 );
        ${rooms}
        {
          vec2 sc = vec2( 1.0, ${f(o.cellV)} );
          vec2 uvS = vMapUv * sc;
          vec2 cell = floor( uvS );
          vec2 fr = uvS - cell;
          vec2 hs = vec2( ${f(o.hu)}, ${f(o.hv)} );
          vec2 c = vec2( fr.x < 0.5 ? 0.25 : 0.75, fr.y < 0.5 ? ${f(o.cv[0])} : ${f(o.cv[1])} );
          vec2 q = fr - c;
          // Derivatives outside the branch: inside non-uniform control flow they are undefined
          // (garbage / NaN at window edges, which the bloom blur spread into big black squares).
          vec3 p = - vViewPosition;
          vec3 dp1 = dFdx( p ), dp2 = dFdy( p );
          vec2 du1 = dFdx( uvS ), du2 = dFdy( uvS );
          if ( abs( q.x ) < hs.x && abs( q.y ) < hs.y ) {
            vec3 n = normalize( vNormal );
            vec3 dp2perp = cross( dp2, n ), dp1perp = cross( n, dp1 );
            float det = dot( dp1, dp2perp );
            if ( abs( det ) > 1e-12 ) {
              vec3 gu = ( dp2perp * du1.x + dp1perp * du2.x ) / det; // grad of u, per metre
              vec3 gv = ( dp2perp * du1.y + dp1perp * du2.y ) / det;
              vec3 d = normalize( p );
              float into = max( - dot( n, d ), 0.05 );
              vec2 duv = vec2( dot( gu, d ), dot( gv, d ) ) / into; // uv per metre of depth
              vec2 back = q + duv * ${f(o.depth)};
              if ( abs( back.x ) < hs.x && abs( back.y ) < hs.y ) {
                winUv = ( cell + c + back ) / sc;
                winGlass = 1.0;
              } else {
                vec2 sgn = sign( duv );
                vec2 depth = vec2(
                  abs( duv.x ) > 1e-6 ? ( sgn.x * hs.x - q.x ) / duv.x : 1e9,
                  abs( duv.y ) > 1e-6 ? ( sgn.y * hs.y - q.y ) / duv.y : 1e9 );
                bool sideHit = depth.x < depth.y;
                vec2 hit = q + duv * min( depth.x, depth.y );
                if ( sideHit ) hit.x = sgn.x * ( hs.x + 0.004 ); else hit.y = sgn.y * ( hs.y + 0.004 ); // just outside: frame / pillar
                winUv = ( cell + c + hit ) / sc;
                winShade = sideHit ? ${f(REVEAL_SHADE.side)} : ( sgn.y > 0.0 ? ${f(REVEAL_SHADE.soffit)} : ${f(REVEAL_SHADE.sill)} );
              }
            }
          }
        }
        #ifdef USE_MAP
          vec4 sampledDiffuseColor = texture2D( map, winUv );
          diffuseColor *= sampledDiffuseColor;
        #endif
        diffuseColor.rgb *= winShade;`,
      )
      .replace('texture2D( emissiveMap, vEmissiveMapUv )', 'texture2D( emissiveMap, winUv ) * step( 0.99, winShade ) * vec4( winLight, 1.0 )');
    if (o.glass) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix( roughnessFactor, ${f(GLASS_ROUGHNESS)}, winGlass );`)
        .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = mix( metalnessFactor, ${f(GLASS_METALNESS)}, winGlass );`);
    }
  };
  m.customProgramCacheKey = () => key;
  m.needsUpdate = true;
}

/** The facade tile's four windows (textures.FACADE_WIN): 1024 px span FACADE_TILE.w both ways. */
export function facadeWindowDepth(m: THREE.MeshStandardMaterial) {
  recessFacade(m);
  return m;
}
function recessFacade(m: THREE.MeshStandardMaterial) {
  const k = 1 / FACADE_TILE.w;
  const cvLow = (FACADE_WIN.sill + FACADE_WIN.h / 2) * k; // lower floor of the tile (v 0..0.5)
  recess(m, { cellV: 1, hu: (FACADE_WIN.w / 2) * k, hv: (FACADE_WIN.h / 2) * k, cv: [cvLow, cvLow + 0.5], depth: WINDOW_RECESS, glass: true }, 'window-depth');
}

/**
 * The shop atlas's openings (textures.shopTextures: 256 x 136 px rows, two shops per row between
 * pillars at x 7..121 / 135..249, under the lintel band, above the 2.5 px step).
 */
export function shopfrontDepth(m: THREE.MeshStandardMaterial) {
  const W = 256;
  const H = 136;
  const lintel = 0.6 * (W / SHOP_TILE.w);
  const v0 = 2.5 / H;
  const v1 = 1 - lintel / H;
  const cv = (v0 + v1) / 2;
  recess(m, { cellV: SHOP_ROWS, hu: 57 / W, hv: (v1 - v0) / 2, cv: [cv, cv], depth: SHOP_RECESS }, 'shop-depth');
}

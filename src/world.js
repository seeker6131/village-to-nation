// v0.9 layered, seed-generated region map ("tilemap").
// Every village region = { seed, biome } -> deterministic layers:
//   ground  : terrain id per tile (grass, forest floor, dirt, water, sand, rocky, ford)
//   decor   : small non-blocking ground details per tile (flowers, tufts, pebbles, mushrooms)
//   objects : trees, rocks, bushes, logs (y-sorted at render time; trees/rocks block + are harvestable)
//   static  : leader house, tents, region edge
//   collision: derived each time the world changes (water, trunks, rocks, buildings)
// Player edits (felled trees, stumps, mined rocks) live in save state `s.world.n`, so an online server
// would only need to send seed + edits, not a painted image.
export const TILE = 16, WORLD_W = 144, WORLD_H = 96;
import { LAYOUTS, ZONE_SHAPES } from './worldLayouts.js';
import { MAPS } from './maps/index.js';
import { ART10 } from './artManifest.js';
export const T = { GRASS: 0, FOREST: 1, DIRT: 2, WATER: 3, SAND: 4, ROCKY: 5, FORD: 6, MEADOW: 7 };
export const BIOMES = {
  forest:    { th: 'ป่าทึบ', treeDensity: 0.62, rockChance: 0.02, rivers: 1, lakes: 1, rocky: 0.18, pines: 0.25, fruit: 0.05, meadow: 0.12 },
  riverside: { th: 'ริมแม่น้ำ', treeDensity: 0.38, rockChance: 0.015, rivers: 2, lakes: 2, rocky: 0.08, pines: 0.1, fruit: 0.08, meadow: 0.3 },
  highland:  { th: 'ที่สูง', treeDensity: 0.34, rockChance: 0.06, rivers: 1, lakes: 0, rocky: 0.45, pines: 0.75, fruit: 0.02, meadow: 0.15 },
  coast:     { th: 'ชายฝั่ง', treeDensity: 0.3, rockChance: 0.02, rivers: 1, lakes: 0, rocky: 0.1, pines: 0.05, fruit: 0.12, meadow: 0.25, sea: true },
};
export const DEFAULT_SEED = 20261029;
// Starting layout is the same relative to the centre in every region (the leader's clearing).
export const CENTER = { x: 40, y: 50 };
export const CLEARING_R = 7;
export const VILLAGE_RADIUS = 26;
export const LEADER_HOUSE = { tx: 37, ty: 44, w: 7, h: 3 }; // collision footprint (v0.10 art is wider)
const LEADER_HOUSE_GEN = { tx: 38, ty: 44, w: 5, h: 3 };      // v0.9 footprint, kept for tree generation so saved tree ids stay valid
export const TENTS = [{ tx: 34, ty: 42 }, { tx: 45, ty: 43 }, { tx: 47, ty: 47 }]; // v0.25: off the streets
export const POINTS = {
  camp: { x: 40, y: 48, name: 'ครูอุ่น · บ้านผู้นำ', type: 'camp' },
  board: { x: 44, y: 48, name: 'กระดานประกาศ', type: 'board' },
  study: { x: 35, y: 48, name: 'ขอนไม้นั่งเรียน', type: 'study' },
  delivery: { x: 45, y: 50, name: 'ลังแลกของ', type: 'delivery' },
  home: { x: 54, y: 45, name: 'ที่ดินบ้านพักหลังแรก', type: 'project', project: 'home', w: 8, h: 6 },
  farm: { x: 27, y: 46, name: 'ที่ดินสวนอาหาร', type: 'project', project: 'farm', w: 9, h: 8 },
  market: { x: 52, y: 57, name: 'ที่ดินตลาด', type: 'project', project: 'market', w: 10, h: 7 },
  hall: { x: 40, y: 33, name: 'ที่ดินศาลาประชาคม', type: 'project', project: 'hall', w: 12, h: 8 },
};
export const SPAWN = { x: (CENTER.x + 2.5) * TILE, y: (CENTER.y + 3.5) * TILE };
// v0.27 maps drawn in the Map Maker put the village somewhere else: ORIGIN = shift of the whole village core
// (leader house, interaction points, plots, tents, NPC homes, plan props) from its default place around (40, 50).
export const ORIGIN = { x: 0, y: 0 };
const DEF = JSON.parse(JSON.stringify({ CENTER, LEADER_HOUSE, LEADER_HOUSE_GEN, TENTS, POINTS, SPAWN }));
function setOrigin(ox, oy, custom = null) {
  ORIGIN.x = ox; ORIGIN.y = oy;
  Object.assign(CENTER, { x: DEF.CENTER.x + ox, y: DEF.CENTER.y + oy });
  Object.assign(LEADER_HOUSE, { ...DEF.LEADER_HOUSE, tx: DEF.LEADER_HOUSE.tx + ox, ty: DEF.LEADER_HOUSE.ty + oy });
  Object.assign(LEADER_HOUSE_GEN, { ...DEF.LEADER_HOUSE_GEN, tx: DEF.LEADER_HOUSE_GEN.tx + ox, ty: DEF.LEADER_HOUSE_GEN.ty + oy });
  TENTS.length = 0; if (!custom) TENTS.push(...DEF.TENTS.map(t => ({ tx: t.tx + ox, ty: t.ty + oy })));
  for (const [id, p] of Object.entries(DEF.POINTS)) Object.assign(POINTS[id], { x: p.x + ox, y: p.y + oy });
  if (custom?.spawn) Object.assign(SPAWN, { x: (custom.spawn.x + .5) * TILE, y: (custom.spawn.y + .9) * TILE });
  else Object.assign(SPAWN, { x: (CENTER.x + 2.5) * TILE, y: (CENTER.y + 3.5) * TILE });
}
export const REGIONS = [ // the "huge scale" roadmap: regions unlock after the village grows (online later)
  { id: 'wildwood', th: 'ป่าบุกเบิก (หมู่บ้านแรก)', status: 'playable' },
  { id: 'river', th: 'ลุ่มแม่น้ำ (หมู่บ้านอื่น / ผู้เล่นอื่น)', status: 'locked' },
  { id: 'highland', th: 'ที่สูงเหมืองแร่', status: 'locked' },
  { id: 'coast', th: 'ชายฝั่งท่าเรือ', status: 'locked' },
  { id: 'capital', th: 'เมืองหลวงของประเทศ', status: 'locked' },
];

// v0.18 authored region layout (the reference map): every level develops in its OWN zone instead of a ring around
// the village. Ellipses in tiles. `tier` = the level that opens the zone (cleared + paved then).
export const WORLD_LAYOUT = 6;
export const ZONES = [];   // filled from the current layout (worldLayouts.js)
// the 10 generated layouts + the maps drawn in the Map Maker (src/maps, imported with scripts/import-map.mjs)
for (const m of MAPS) if (!LAYOUTS.some(l => l.id === m.id)) LAYOUTS.push({ id: m.id, th: m.th, map: m, zones: {}, river: null, lake: null });
export const BRIDGES = []; // filled during generation where a path crosses the river
export const PLANS = LAYOUTS;
function applyLayout(plan) {
  const L = LAYOUTS[plan] || LAYOUTS[0];
  WORLD.custom = L.map || null;
  if (L.map) setOrigin(L.map.leader.tx - DEF.LEADER_HOUSE.tx, L.map.leader.ty - DEF.LEADER_HOUSE.ty, L.map); else setOrigin(0, 0);
  ZONES.length = 0;
  ZONES.push({ id: 'village', x: CENTER.x, y: CENTER.y, ...ZONE_SHAPES.village });
  for (const [id, [x, y]] of Object.entries(L.zones)) { const S = ZONE_SHAPES[id]; ZONES.push({ id, x, y: y + (S.cy || 0), cx: x, cy: y, rx: S.rx, ry: S.ry, tier: S.tier, th: S.th, row: S.row }); }
  if (L.lake) ZONES.push({ id: 'lake', x: L.lake.x, y: L.lake.y, rx: L.lake.rx, ry: L.lake.ry, tier: 1, th: ZONE_SHAPES.lake.th });
  return L;
}
export function zoneAt(x, y) { for (const z of ZONES) if (z.id !== 'lake' && ((x - z.x) / z.rx) ** 2 + ((y - z.y) / z.ry) ** 2 < 1) return z; return null; }
export function zoneById(id) { return ZONES.find(z => z.id === id) || null; }

// ------------------------------------------------------------------------------------- RNG / noise
export function hash(x, y, seed = 71) { let h = ((x * 374761393 + y * 668265263 + seed * 1442695041) >>> 0); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function smooth(t) { return t * t * (3 - 2 * t); }
function vnoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = smooth(x - xi), yf = smooth(y - yi);
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed), c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}
function fbm(x, y, seed) { return vnoise(x / 18, y / 18, seed) * 0.6 + vnoise(x / 7, y / 7, seed + 9) * 0.3 + vnoise(x / 3, y / 3, seed + 17) * 0.1; }
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// ------------------------------------------------------------------------------------- region state
// Arrays/objects are mutated in place (never reassigned) so every module sees the current region.
export const WORLD = { seed: DEFAULT_SEED, biome: 'forest', ground: new Uint8Array(WORLD_W * WORLD_H), decor: new Uint8Array(WORLD_W * WORLD_H), occ: new Uint8Array(WORLD_W * WORLD_H), elevation: new Uint8Array(WORLD_W * WORLD_H), stairs: new Uint8Array(WORLD_W * WORLD_H), hasElevation: false, occKey: '', version: 0 };
export const TREES = [], ROCKS = [], NODES = [], PROPS = [];
const nodeAt = new Map();
const idx = (x, y) => y * WORLD_W + x;
const inside = (x, y) => x >= 0 && y >= 0 && x < WORLD_W && y < WORLD_H;
export function elevationAt(x, y) { return inside(x, y) ? WORLD.elevation[idx(x, y)] : 255; }
export function stairAt(x, y) { return inside(x, y) ? WORLD.stairs[idx(x, y)] : 0; }
/** Cross a height boundary only by a marked staircase. No diagonal ledge hopping. */
export function canStepElevation(ax, ay, bx, by) {
  if (!inside(ax, ay) || !inside(bx, by) || Math.abs(ax - bx) + Math.abs(ay - by) > 1) return false;
  const delta = Math.abs(elevationAt(ax, ay) - elevationAt(bx, by));
  return delta === 0 || (delta === 1 && !!(stairAt(ax, ay) || stairAt(bx, by)));
}
export function groundAt(x, y) { return inside(x, y) ? WORLD.ground[idx(x, y)] : T.WATER; }
const isWater = t => t === T.WATER;

function inRect(x, y, r, pad = 0) { return x >= r.tx - pad && x < r.tx + r.w + pad && y >= r.ty - pad && y < r.ty + r.h + pad; }
export function plotRect(id) { const p = POINTS[id]; return { tx: p.x - Math.floor(p.w / 2), ty: p.y - Math.floor(p.h / 2), w: p.w, h: p.h }; }
const PLOT_IDS = ['home', 'farm', 'market', 'hall'];
// trail end rows from v0.9 (plots grew in v0.10; trails/ground must stay identical so saved tree ids keep matching)
const TRAIL_END = { home: 49, farm: 51, market: 62, hall: 41 };
function reserved(x, y) {
  if (Math.hypot(x - CENTER.x, y - CENTER.y) < CLEARING_R) return true;
  if (inRect(x, y, LEADER_HOUSE_GEN, 1)) return true;
  if (TENTS.some(t => inRect(x, y, { tx: t.tx, ty: t.ty, w: 2, h: 2 }, 1))) return true;
  for (const [id, p] of Object.entries(POINTS)) if (!PLOT_IDS.includes(id) && Math.abs(x - p.x) <= 1 && Math.abs(y - p.y) <= 1) return true;
  return false;
}

/** Build all layers for a region. Pure function of (seed, biome). */
export function generateRegion(seed = DEFAULT_SEED, biome = 'forest', plan = 0) {
  const B = BIOMES[biome] || BIOMES.forest;
  WORLD.paths = []; WORLD.seed = seed; WORLD.biome = BIOMES[biome] ? biome : 'forest'; WORLD.plan = LAYOUTS[plan] ? plan : 0;
  const LAY = applyLayout(WORLD.plan); BRIDGES.length = 0;
  if (LAY.map) return generateCustom(LAY.map, seed);
  const G = WORLD.ground, D = WORLD.decor, R = rng(seed);
  G.fill(T.GRASS); D.fill(0); WORLD.elevation.fill(0); WORLD.stairs.fill(0); WORLD.hasElevation = false;
  // 1) base terrain from noise: forest floor, rocky ground, meadows
  for (let y = 0; y < WORLD_H; y++) for (let x = 0; x < WORLD_W; x++) {
    const f = fbm(x, y, seed), r = fbm(x + 300, y + 300, seed + 5), m = fbm(x + 600, y, seed + 11);
    let t = f > 0.5 - B.treeDensity * 0.25 ? T.FOREST : T.GRASS;
    if (r > 1 - B.rocky * 0.7) t = T.ROCKY;
    if (m > 1 - B.meadow * 0.6 && t !== T.ROCKY) t = T.MEADOW;
    G[idx(x, y)] = t;
  }
  const farFromCenter = (x, y, d) => Math.hypot(x - CENTER.x, y - CENTER.y) > d;
  const authored = WORLD.biome === 'forest';
  if (authored) { // zones are open land (grass / meadow), between them the forest; rocky mine + snow mountain
    for (let y = 0; y < WORLD_H; y++) for (let x = 0; x < WORLD_W; x++) {
      const z = zoneAt(x, y), f = fbm(x, y, seed), m = fbm(x + 600, y, seed + 11);
      let t = z && z.id !== 'deep' ? (m > .55 ? T.MEADOW : T.GRASS) : f > .32 ? T.FOREST : T.GRASS;
      if (z?.id === 'mine' || z?.id === 'snow') t = T.ROCKY;
      G[idx(x, y)] = t;
    }
    const line = (pts, w, t, skip) => { for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1], n = Math.ceil(Math.hypot(bx - ax, by - ay) * 2);
      for (let k = 0; k <= n; k++) { const x = Math.round(ax + (bx - ax) * k / n + (vnoise(k / 4, i, seed + 41) - .5) * (t === T.WATER ? 1.4 : 0)), y = Math.round(ay + (by - ay) * k / n);
        for (let dy = 0; dy < w; dy++) for (let dx = 0; dx < w; dx++) if (inside(x + dx, y + dy) && !(skip && skip(G[idx(x + dx, y + dy)]))) G[idx(x + dx, y + dy)] = t; } } };
    if (LAY.river) line(LAY.river, 3, T.WATER);
    WORLD.sea = WORLD.sea || new Uint8Array(WORLD_W * WORLD_H); WORLD.sea.fill(0);
    if (LAY.sea === 'east') for (let y = 0; y < WORLD_H; y++) { const shore = 128 + Math.round((vnoise(0, y / 7, seed + 5) - .5) * 6); for (let x = shore; x < WORLD_W; x++) { G[idx(x, y)] = T.WATER; WORLD.sea[idx(x, y)] = 1; } for (let x = shore - 2; x < shore; x++) if (G[idx(x, y)] !== T.WATER) G[idx(x, y)] = T.SAND; }
    if (LAY.sea === 'south') for (let x = 0; x < WORLD_W; x++) { const shore = 88 + Math.round((vnoise(x / 7, 0, seed + 5) - .5) * 5); for (let y = shore; y < WORLD_H; y++) { G[idx(x, y)] = T.WATER; WORLD.sea[idx(x, y)] = 1; } for (let y = shore - 2; y < shore; y++) if (G[idx(x, y)] !== T.WATER) G[idx(x, y)] = T.SAND; }
    const L = LAY.lake;
    if (L) for (let y = L.y - L.ry - 2; y <= L.y + L.ry + 2; y++) for (let x = L.x - L.rx - 2; x <= L.x + L.rx + 2; x++) {
      if (!inside(x, y)) continue;
      const d = ((x - L.x) / L.rx) ** 2 + ((y - L.y) / L.ry) ** 2 + (vnoise(x / 3, y / 3, seed + 3) - .5) * .35;
      if (d < 1 && !(L.island && Math.hypot(x - L.x - 2, y - L.y) <= 2.2)) G[idx(x, y)] = T.WATER; // a little island with a pavilion spot
    }
    // water snaps to the 2x2 ground-tile cells, so what you SEE as water is exactly what blocks you (no walking on the drawn river)
    for (let cy = 0; cy < WORLD_H; cy += 2) for (let cx = 0; cx < WORLD_W; cx += 2) {
      let w = 0; for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (G[idx(cx + dx, cy + dy)] === T.WATER) w++;
      if (w === 0 || w === 4) continue;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) G[idx(cx + dx, cy + dy)] = w >= 2 ? T.WATER : (G[idx(cx + dx, cy + dy)] === T.WATER ? T.GRASS : G[idx(cx + dx, cy + dy)]);
    }
    // paths: village gate -> straight to the zone's front row -> across to the zone (so river crossings are horizontal)
    const paths = [];
    for (const z of ZONES) {
      if (z.id === 'village' || z.id === 'lake') continue;
      const zx = z.cx ?? z.x, zy = z.cy ?? z.y, row = Math.round(zy + (z.row || 0));
      const side = Math.abs(zx - CENTER.x) >= Math.abs(zy - CENTER.y) * 1.2;
      // v0.25 town gates = the ends of the village streets (villageLayout.js): W 12,50 · E 62,50 · N 32,28 · S 40,74
      const gx = side ? (zx > CENTER.x ? 62 : 12) : (zy > CENTER.y ? 40 : 32), gy = side ? 50 : (zy > CENTER.y ? 74 : 28);
      const ev = v => Math.round(v / 2) * 2; // even tiles: paths sit on the 2x2 ground cells (2 tiles wide, not 4)
      paths.push([[gx, gy], [gx, ev(row)], [ev(zx), ev(row)]]); paths[paths.length - 1].tier = z.tier;
    }
    if (L && Math.hypot(L.x - CENTER.x, L.y - CENTER.y) < 45) paths.push([[40, 74], [40, L.y - L.ry + 1]]); // to the lake shore
    for (const p of paths) line(p, 2, T.DIRT, g => g === T.WATER);
    WORLD.paths = paths.filter(p => p.tier); // v0.25 roads to the districts: paved once that district opens (villageLayout.roadTiles)
    // bridges: every horizontal path segment that crosses a narrow strip of water gets a deck
    for (const p of paths) for (let i = 0; i < p.length - 1; i++) {
      const [ax, ay] = p[i], [bx, by] = p[i + 1]; if (ay !== by) continue;
      const y = ay; let x = Math.min(ax, bx);
      while (x <= Math.max(ax, bx)) {
        if (G[idx(x, y)] !== T.WATER) { x++; continue; }
        let e = x; while (e < WORLD_W - 1 && G[idx(e + 1, y)] === T.WATER) e++;
        if (e - x <= 10 && !BRIDGES.some(b => b.y === y && Math.abs(b.x0 - x) < 4)) BRIDGES.push({ x0: x, x1: e, y });
        x = e + 1;
      }
    }
    for (const b of BRIDGES) {
      for (let x = b.x0 - 3; x <= b.x1 + 3; x++) if (G[idx(x, b.y)] === T.WATER) G[idx(x, b.y)] = T.FORD; // planks: deck row only, water stays water under/around it
      // the path runs right up to both ends of the bridge (no grass gap)
      for (const y of [b.y]) {
        let a = b.x0 - 3; while (a < b.x1 && G[idx(a, y)] !== T.FORD) a++;
        let e = b.x1 + 3; while (e > b.x0 && G[idx(e, y)] !== T.FORD) e--;
        for (let x = a - 1; x >= a - 6 && G[idx(x, y)] !== T.DIRT && G[idx(x, y)] !== T.WATER; x--) G[idx(x, y)] = T.DIRT;
        for (let x = e + 1; x <= e + 6 && G[idx(x, y)] !== T.DIRT && G[idx(x, y)] !== T.WATER; x++) G[idx(x, y)] = T.DIRT;
      }
    }
  }
  // 2) sea (coast biome) on the east edge
  if (B.sea && !authored) for (let y = 0; y < WORLD_H; y++) { const shore = WORLD_W - 22 + Math.round(Math.sin(y / 9 + seed) * 4 + vnoise(0, y / 5, seed) * 5); for (let x = shore; x < WORLD_W; x++) G[idx(x, y)] = T.WATER; }
  // 3) lakes away from the village
  for (let i = 0; i < (authored ? 0 : B.lakes); i++) {
    let cx, cy, tries = 0;
    do { cx = 12 + Math.floor(R() * (WORLD_W - 24)); cy = 10 + Math.floor(R() * (WORLD_H - 20)); } while (!farFromCenter(cx, cy, 30) && ++tries < 50);
    const rx = 7 + R() * 8, ry = 5 + R() * 5;
    for (let y = Math.floor(cy - ry - 2); y <= cy + ry + 2; y++) for (let x = Math.floor(cx - rx - 2); x <= cx + rx + 2; x++) {
      if (!inside(x, y)) continue;
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + (vnoise(x / 3, y / 3, seed + i) - 0.5) * 0.5;
      if (d < 1) G[idx(x, y)] = T.WATER;
    }
  }
  // 4) rivers: meander from the north edge to the south edge, never through the village core
  for (let i = 0; i < (authored ? 0 : B.rivers); i++) {
    let x = Math.floor(70 + R() * 50 + i * 20) % (WORLD_W - 10) + 5;
    if (Math.abs(x - CENTER.x) < 22) x = CENTER.x + 26 + i * 18;
    const fords = [Math.floor(20 + R() * 15), Math.floor(55 + R() * 20)];
    for (let y = 0; y < WORLD_H; y++) {
      x += Math.round((vnoise(i * 50, y / 6, seed + 31) - 0.5) * 2.2);
      x = Math.max(4, Math.min(WORLD_W - 5, x));
      if (Math.abs(x - CENTER.x) < 20 && Math.abs(y - CENTER.y) < 24) x = CENTER.x + 20;
      const w = 2 + (vnoise(y / 8, i, seed) > 0.6 ? 1 : 0);
      for (let k = -1; k < w; k++) { const t = fords.includes(y) || fords.includes(y - 1) ? T.FORD : T.WATER; G[idx(x + k, y)] = t; }
    }
  }
  // 5) sand shores
  const copy = G.slice();
  for (let y = 0; y < WORLD_H; y++) for (let x = 0; x < WORLD_W; x++) {
    if (isWater(copy[idx(x, y)]) || copy[idx(x, y)] === T.FORD) continue;
    let nearW = false; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inside(x + dx, y + dy) && isWater(copy[idx(x + dx, y + dy)])) nearW = true;
    if (nearW && hash(x, y, seed + 3) < (B.sea ? 0.95 : 0.7)) G[idx(x, y)] = T.SAND;
  }
  // 6) the leader's clearing, dirt yard and trails to every plot (no water there)
  for (let y = 0; y < WORLD_H; y++) for (let x = 0; x < WORLD_W; x++) {
    const d = Math.hypot(x - CENTER.x, y - CENTER.y);
    if (d < 20 && (isWater(G[idx(x, y)]) || G[idx(x, y)] === T.FORD)) G[idx(x, y)] = T.GRASS;
    if (d < CLEARING_R) G[idx(x, y)] = d < 3.2 && !authored ? T.DIRT : T.GRASS;
  }
  if (!authored) { // v0.25 the authored map has planned streets instead of random stair-step trails to every plot
    for (const id of PLOT_IDS) trail(CENTER.x, CENTER.y + 1, POINTS[id].x, TRAIL_END[id], seed);
    trail(CENTER.x, CENTER.y, CENTER.x, LEADER_HOUSE.ty + LEADER_HOUSE.h, seed);
  }
  // 7) decor layer (non-blocking details drawn into the ground chunks)
  for (let y = 0; y < WORLD_H; y++) for (let x = 0; x < WORLD_W; x++) {
    const t = G[idx(x, y)], h = hash(x, y, seed + 77);
    if (t === T.MEADOW && h < 0.45) D[idx(x, y)] = 1 + Math.floor(h * 8) % 4;          // flowers
    else if (t === T.GRASS && h < 0.14) D[idx(x, y)] = 5 + Math.floor(h * 30) % 2;     // tufts
    else if (t === T.FOREST && h < 0.18) D[idx(x, y)] = 7 + Math.floor(h * 30) % 3;    // leaves, mushrooms, fern
    else if (t === T.ROCKY && h < 0.25) D[idx(x, y)] = 10;                             // pebbles
  }
  // 8) objects: trees on a 2x2 jittered grid (keeps trunks apart), rocks, bushes, logs
  TREES.length = 0; ROCKS.length = 0; PROPS.length = 0; nodeAt.clear();
  for (let cy = 0; cy < WORLD_H; cy += 2) for (let cx = 0; cx < WORLD_W; cx += 2) {
    const x = cx + (hash(cx, cy, seed + 1) < 0.5 ? 0 : 1), y = cy + (hash(cx, cy, seed + 2) < 0.5 ? 0 : 1);
    if (!inside(x, y) || reserved(x, y)) continue;
    const t = G[idx(x, y)];
    if (isWater(t) || t === T.FORD || t === T.SAND || t === T.DIRT) continue;
    const d = Math.hypot(x - CENTER.x, y - CENTER.y);
    const zz = authored ? zoneAt(x, y) : null;
    const ring = d < 9 ? 0.22 : d < 14 ? 0.55 : zz && zz.id !== 'deep' && zz.id !== 'village' ? 0.3 : 1;
    const base = t === T.FOREST ? 0.92 : t === T.ROCKY ? 0.18 : t === T.MEADOW ? 0.1 : 0.32;
    const roll = hash(x, y, seed + 4);
    // authored map: trees grow in groves (patches with clearings between), bushes along the grove edges, ore only in pits
    const grove = authored ? vnoise(x / 8, y / 8, seed + 71) : 1;
    if (authored) {
      if (x < 1 || y < 1 || x >= WORLD_W - 1 || y >= WORLD_H - 1) continue;
      if (grove > .47 && roll < base * B.treeDensity * 1.1 * ring) { const k = hash(x, y, seed + 6); addNode(TREES, { id: 't' + TREES.length, type: 'wood', kind: k < B.fruit ? 3 : (k < B.fruit + B.pines + (t === T.ROCKY ? 0.4 : 0) ? 4 : Math.floor(hash(x, y, seed + 8) * 3)), x, y }); }
      else if (grove > .4 && grove <= .47 && roll > .5 && roll < .62 && t !== T.ROCKY) PROPS.push({ kind: 'bush', v: Math.floor(hash(x, y, seed) * 5), x, y });
      else if (roll > 1 - (t === T.ROCKY ? 0.2 : 0.012) * ring) addNode(ROCKS, { id: 'r' + ROCKS.length, type: 'stone', kind: 0, x, y });
      continue;
    }
    if (roll < base * B.treeDensity * 1.25 * ring) {
      const k = hash(x, y, seed + 6);
      const kind = k < B.fruit ? 3 : (k < B.fruit + B.pines + (t === T.ROCKY ? 0.4 : 0) ? 4 : Math.floor(hash(x, y, seed + 8) * 3));
      addNode(TREES, { id: 't' + TREES.length, type: 'wood', kind, x, y });
    } else if (roll > 1 - (t === T.ROCKY ? 0.32 : B.rockChance) * ring) {
      addNode(ROCKS, { id: 'r' + ROCKS.length, type: 'stone', kind: hash(x, y, seed + 9) < 0.15 ? 1 : 0, x, y });
    } else if (t !== T.ROCKY && roll > 0.55 && roll < 0.58) PROPS.push({ kind: 'bush', v: Math.floor(hash(x, y, seed) * 5), x, y });
    else if (t === T.FOREST && roll > 0.6 && roll < 0.605) PROPS.push({ kind: 'log', x, y });
  }
  // guarantee early stone: a few rocks just outside the clearing
  const want = [[CENTER.x - 10, CENTER.y + 5], [CENTER.x + 9, CENTER.y - 7], [CENTER.x + 12, CENTER.y + 3], [CENTER.x - 6, CENTER.y - 10], [CENTER.x + 3, CENTER.y + 12]];
  for (const [x, y] of want) if (!nodeAt.has(idx(x, y)) && !reserved(x, y) && !isWater(G[idx(x, y)])) addNode(ROCKS, { id: 'r' + ROCKS.length, type: 'stone', kind: 0, x, y });
  // ore pits ("เหมืองแร่"): rare ore only in a few clusters deep in the forest + one in the mine zone
  if (WORLD.biome === 'forest') {
    const pits = [[7, 36]], R2 = rng(seed + 991);
    for (let tries = 0; pits.length < 6 && tries < 400; tries++) {
      const x = 4 + Math.floor(R2() * (WORLD_W - 8)), y = 4 + Math.floor(R2() * (WORLD_H - 8)), z = zoneAt(x, y);
      if (G[idx(x, y)] !== T.FOREST || (z && z.id !== 'deep') || pits.some(([a, b]) => Math.hypot(a - x, b - y) < 22)) continue;
      let clear = true; for (let dy = -5; dy <= 5 && clear; dy++) for (let dx = -5; dx <= 5; dx++) { const g = G[idx(Math.max(0, Math.min(WORLD_W - 1, x + dx)), Math.max(0, Math.min(WORLD_H - 1, y + dy)))]; if (g === T.DIRT || g === T.WATER || g === T.FORD) { clear = false; break; } }
      if (!clear) continue; // deep in the woods, away from paths and water
      pits.push([x, y]);
    }
    for (const [px, py] of pits) for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const x = px + dx, y = py + dy, d = Math.hypot(dx, dy); if (!inside(x, y) || d > 3.2 || reserved(x, y)) continue;
      const g = G[idx(x, y)]; if (g === T.WATER || g === T.FORD || g === T.DIRT) continue;
      const h = hash(x, y, seed + 993); if (h > (d < 1.6 ? .85 : .45)) continue;
      const old = nodeAt.get(idx(x, y)); if (old && old.type === 'wood') { TREES.splice(TREES.indexOf(old), 1); nodeAt.delete(idx(x, y)); TREES.forEach((n, i) => { n.id = 't' + i; }); }
      if (nodeAt.has(idx(x, y))) { const r = nodeAt.get(idx(x, y)); if (r.type === 'stone') r.kind = d < 2.2 ? 1 : r.kind; continue; }
      addNode(ROCKS, { id: 'r' + ROCKS.length, type: 'stone', kind: d < 2.2 || h < .2 ? 1 : 0, x, y });
      if (d >= 1.6) G[idx(x, y)] = T.ROCKY;
    }
    for (let i = PROPS.length - 1; i >= 0; i--) if (pits.some(([a, b]) => Math.hypot(a - PROPS[i].x, b - PROPS[i].y) < 4)) PROPS.splice(i, 1);
    WORLD.orePits = pits;
  }
  NODES.length = 0; NODES.push(...TREES, ...ROCKS);
  if (!authored) trail(CENTER.x, TRAIL_END.hall, POINTS.hall.x, POINTS.hall.y + POINTS.hall.h / 2, seed); // v0.10 hall plot moved north: extend its trail AFTER placing objects (ids unchanged)
  WORLD.version++; WORLD.occKey = '';
  return WORLD;
}
/** v0.27 a map from the Map Maker: ground, trees (exact sprites), solid props and plots come from the file. */
const MAP_T = { g: T.GRASS, m: T.MEADOW, r: T.ROCKY, d: T.DIRT, f: T.DIRT, s: T.SAND, w: T.WATER, S: T.WATER };
function generateCustom(M, seed) {
  const G = WORLD.ground, D = WORLD.decor;
  WORLD.elevation.fill(0); WORLD.stairs.fill(0); WORLD.hasElevation = false;
  for (let y = 0; y < WORLD_H; y++) for (let x = 0; x < WORLD_W; x++) {
    const i = idx(x, y), height = Math.max(0, Math.min(2, Number(M.heightRows?.[y]?.[x]) || 0));
    WORLD.elevation[i] = height;
    WORLD.stairs[i] = M.stairRows?.[y]?.[x] === 'S' ? 1 : 0;
    if (height || WORLD.stairs[i]) WORLD.hasElevation = true;
  }
  WORLD.sea = WORLD.sea || new Uint8Array(WORLD_W * WORLD_H); WORLD.sea.fill(0);
  for (let y = 0; y < WORLD_H; y++) for (let x = 0; x < WORLD_W; x++) {
    const ch = M.ground[y]?.[x] || 'g', i = idx(x, y); G[i] = MAP_T[ch] ?? T.GRASS; if (ch === 'S') WORLD.sea[i] = 1;
    const t = G[i], h = hash(x, y, seed + 77);
    D[i] = t === T.MEADOW && h < .45 ? 1 + Math.floor(h * 8) % 4 : t === T.GRASS && h < .14 ? 5 + Math.floor(h * 30) % 2 : t === T.ROCKY && h < .25 ? 10 : 0;
  }
  TREES.length = 0; ROCKS.length = 0; PROPS.length = 0; nodeAt.clear();
  const PINE = /pine/, SMALL = /small|bamboo|banana|rubber|coconut/;
  for (const [x, y, sp] of M.trees) {
    if (!inside(x, y) || G[idx(x, y)] === T.WATER || inRect(x, y, LEADER_HOUSE, 0)) continue;
    const stump = /^stump_/.test(sp), name = stump ? sp.replace('stump_', 'tree_') : sp;
    addNode(TREES, { id: 't' + TREES.length, type: 'wood', kind: PINE.test(name) ? 4 : SMALL.test(name) ? 1 : 0, x, y, sprite: name, init: stump ? 's' : undefined });
  }
  // v0.28 areas that open at a later level are forest until then (cleared by villageLayout.openRoads when the area grows)
  if (M.tiers) for (let cy = 0; cy < WORLD_H; cy += 2) for (let cx = 0; cx < WORLD_W; cx += 2) {
    const x = cx + (hash(cx, cy, seed + 1) < .5 ? 0 : 1), y = cy + (hash(cx, cy, seed + 2) < .5 ? 0 : 1), lt = +(M.tiers[y]?.[x] || 1);
    if (lt < 2 || !inside(x, y) || G[idx(x, y)] === T.WATER || nodeAt.has(idx(x, y)) || inRect(x, y, LEADER_HOUSE, 1) || hash(x, y, seed + 4) > .62) continue;
    addNode(TREES, { id: 't' + TREES.length, type: 'wood', kind: hash(x, y, seed + 6) < .2 ? 4 : Math.floor(hash(x, y, seed + 8) * 3), x, y, lockTier: lt });
  }
  // early stone: a few rocks just outside the village (the map has none; the pickaxe quest needs them)
  for (const [dx, dy] of [[-10, 5], [9, -7], [12, 3], [-6, -10], [3, 12], [-12, -3]]) { const x = CENTER.x + dx, y = CENTER.y + dy; if (inside(x, y) && !nodeAt.has(idx(x, y)) && G[idx(x, y)] !== T.WATER && !inRect(x, y, LEADER_HOUSE, 1)) addNode(ROCKS, { id: 'r' + ROCKS.length, type: 'stone', kind: 0, x, y }); }
  placePlots(M);
  // keep the interaction points in front of the leader house free (fire, board, study log, delivery crate)
  for (const id of ['camp', 'board', 'study', 'delivery']) { const p = POINTS[id]; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const n = nodeAt.get(idx(p.x + dx, p.y + dy)); if (n) { nodeAt.delete(idx(n.x, n.y)); (n.type === 'wood' ? TREES : ROCKS).splice((n.type === 'wood' ? TREES : ROCKS).indexOf(n), 1); } } }
  TREES.forEach((n, i) => { n.id = 't' + i; }); ROCKS.forEach((n, i) => { n.id = 'r' + i; });
  WORLD.orePits = []; WORLD.paths = [];
  NODES.length = 0; NODES.push(...TREES, ...ROCKS);
  WORLD.version++; WORLD.occKey = '';
  return WORLD;
}
/** Public plots (home, farm, market, hall): the map's "public" markers, else the nearest free land to the village
 *  centre — not on water, roads, house plots, the leader house, the workshop, props or another plot. */
function placePlots(M) {
  const used = new Set(), mark = (x0, y0, w, h, pad = 0) => { for (let y = y0 - pad; y < y0 + h + pad; y++) for (let x = x0 - pad; x < x0 + w + pad; x++) used.add(x + ',' + y); };
  for (const sl of [...M.npcSlots, ...M.lots]) mark(sl.tx, sl.ty, 4, 3, 1);
  if (M.workshop) mark(M.workshop.tx, M.workshop.ty, 4, 3, 1);
  for (const p of M.props) { // the whole picture, not just its base: a palace / tower is far taller than its footprint
    const a = ART10[p.name], sc = p.scale || 1, hT = a ? Math.ceil(a[1] * sc / 16) + 1 : p.fh + 3, wT = a ? Math.ceil(a[0] * sc / 16) : p.fw;
    mark(Math.floor(p.x + p.fw / 2 - Math.max(wT, p.fw) / 2), p.y + p.fh - Math.max(hT, p.fh), Math.max(wT, p.fw), Math.max(hT, p.fh), 1);
  }
  if (M.workshop) mark(M.workshop.tx, M.workshop.ty - 3, 4, 6, 1);
  mark(LEADER_HOUSE.tx, LEADER_HOUSE.ty - 7, LEADER_HOUSE.w, LEADER_HOUSE.h + 7, 2); // the house sprite is ~8 tiles tall: nothing right behind it
  for (const id of ['camp', 'board', 'study', 'delivery']) mark(POINTS[id].x, POINTS[id].y, 1, 1, 1);
  PLOT_IDS.forEach((id, k) => {
    const P = POINTS[id], pub = M.publics?.[k] || null;
    if (pub) { P.x = pub.x + Math.floor(pub.w / 2); P.y = pub.y + Math.floor(pub.h / 2); mark(pub.x, pub.y, pub.w, pub.h, 1); return; }
    let best = null;
    for (let cy = CENTER.y - 30; cy <= CENTER.y + 30; cy++) for (let cx = CENTER.x - 34; cx <= CENTER.x + 34; cx++) {
      const x0 = cx - Math.floor(P.w / 2), y0 = cy - Math.floor(P.h / 2); let ok = true, trees = 0;
      for (let y = y0; y < y0 + P.h && ok; y++) for (let x = x0; x < x0 + P.w; x++) {
        if (!inside(x, y) || x < 2 || y < 2 || used.has(x + ',' + y) || WORLD.ground[idx(x, y)] === T.WATER || (M.roads[y]?.[x] || '.') !== '.' || +(M.tiers?.[y]?.[x] || 1) > 1) { ok = false; break; } // only land that is open from the start
        if (nodeAt.has(idx(x, y))) trees++;
      }
      if (!ok) continue;
      const score = Math.hypot(cx - CENTER.x, cy - CENTER.y) + trees * .25;
      if (!best || score < best.score) best = { cx, cy, x0, y0, score };
    }
    if (best) { P.x = best.cx; P.y = best.cy; mark(best.x0, best.y0, P.w, P.h, 1); }
    else console.warn(`map ${M.id}: no free land for the ${id} plot — pin it with a public marker`);
  });
}
function addNode(list, n) { if (nodeAt.has(idx(n.x, n.y))) return; list.push(n); nodeAt.set(idx(n.x, n.y), n); }
function trail(x0, y0, x1, y1, seed) {
  let x = x0, y = y0, guard = 0;
  while ((x !== x1 || y !== y1) && guard++ < 400) {
    if (Math.abs(x1 - x) > Math.abs(y1 - y) || (Math.abs(x1 - x) === Math.abs(y1 - y) && hash(x, y, seed) < 0.5)) x += Math.sign(x1 - x); else y += Math.sign(y1 - y);
    for (const [dx, dy] of [[0, 0], [hash(x, y, seed + 2) < 0.5 ? 1 : -1, 0]]) if (inside(x + dx, y + dy)) WORLD.ground[idx(x + dx, y + dy)] = T.DIRT;
  }
}
export function nodeById(id) { return (id?.[0] === 't' ? TREES : ROCKS)[Number(id?.slice(1))] || null; }
export function nodeOnTile(x, y) { return nodeAt.get(idx(x, y)) || null; }

// ------------------------------------------------------------------------------------- live state
// s.world = { seed, biome, n: { [nodeId]: 1|2 (hits) | 's' (stump) | 'x' (gone) }, ver }
export function ensureWorld(s) {
  s.world = s.world && typeof s.world === 'object' ? s.world : {};
  if (!Number.isFinite(s.world.seed)) s.world.seed = DEFAULT_SEED;
  if (!BIOMES[s.world.biome]) s.world.biome = 'forest';
  if (s.world.layout !== WORLD_LAYOUT) { s.world.n = {}; s.world.felled = {}; s.world.layout = WORLD_LAYOUT; s.world.relaid = true; } // v0.18: new authored map, old tree ids are meaningless
  s.world.n = s.world.n && typeof s.world.n === 'object' ? s.world.n : {};
  s.world.ver = s.world.ver || 0;
  if (!Number.isInteger(s.world.plan) || !LAYOUTS[s.world.plan]) s.world.plan = 0;
  if ((s.world.planOf ?? 0) !== s.world.plan) { s.world.n = {}; s.world.felled = {}; s.world.planOf = s.world.plan; s.world.relaid = true; } // another town layout: new forest
  if (WORLD.seed !== s.world.seed || WORLD.biome !== s.world.biome || WORLD.plan !== s.world.plan || !TREES.length) generateRegion(s.world.seed, s.world.biome, s.world.plan);
  current = s;
  return s;
}
let current = null;
export function nodeState(s, id) { return s?.world?.n?.[id]; }
/** 'standing' | 'stump' | 'gone' */
export function nodeStatus(s, n) {
  const v = nodeState(s, n.id);
  if (v === 'x') return 'gone';
  if (v === 's') return 'stump';
  if (v === undefined && n.init === 's') return 'stump'; // a stump drawn in the Map Maker
  return 'standing';
}
export function setNode(s, id, v) { s.world.n[id] = v; s.world.ver++; WORLD.occKey = ''; }

export const OCC = { WATER: 1, TRUNK: 2, ROCK: 4, STUMP: 8, BUILDING: 16 };
/** Collision/occupancy layer for the current state (cached until something changes). */
export function occupancy(s = current) {
  const key = `${WORLD.version}:${s?.world?.ver ?? 0}:${s ? s.__structVer || 0 : 0}`;
  if (WORLD.occKey === key && s === occOwner) return WORLD.occ;
  const O = WORLD.occ; O.fill(0);
  for (let i = 0; i < O.length; i++) if (WORLD.ground[i] === T.WATER || (WORLD.biome === 'forest' && WORLD.ground[i] === T.FORD)) O[i] |= OCC.WATER; // authored map: planks are walkable only via the bridge deck
  for (let y = LEADER_HOUSE.ty; y < LEADER_HOUSE.ty + LEADER_HOUSE.h; y++) for (let x = LEADER_HOUSE.tx; x < LEADER_HOUSE.tx + LEADER_HOUSE.w; x++) O[idx(x, y)] |= OCC.BUILDING;
  for (const t of TENTS) for (let y = t.ty; y < t.ty + 2; y++) for (let x = t.tx; x < t.tx + 2; x++) O[idx(x, y)] |= OCC.BUILDING;
  for (const n of TREES) { const st = nodeStatus(s, n); if (st === 'standing') O[idx(n.x, n.y)] |= OCC.TRUNK; else if (st === 'stump') O[idx(n.x, n.y)] |= OCC.STUMP; }
  for (const n of ROCKS) if (nodeStatus(s, n) === 'standing') O[idx(n.x, n.y)] |= OCC.ROCK;
  WORLD.occKey = key; occOwner = s;
  return O;
}
let occOwner = null;
export function occAt(tx, ty, s = current) { return inside(tx, ty) ? occupancy(s)[idx(tx, ty)] : 255; }

/** Static + natural collision (used by movement, pathfinding and placement). Buildings are added by the game. */
export function blocked(tx, ty, s = current) {
  if (tx < 1 || ty < 1 || tx >= WORLD_W - 1 || ty >= WORLD_H - 1) return true;
  return (occAt(tx, ty, s) & (OCC.WATER | OCC.TRUNK | OCC.ROCK | OCC.BUILDING)) !== 0;
}
/** Placement needs open, cleared ground (no stumps) inside the village land and outside reserved plots. */
export function buildableGround(tx, ty, s = current) {
  if (blocked(tx, ty, s)) return { ok: false, code: 'blocked' };
  if (occAt(tx, ty, s) & OCC.STUMP) return { ok: false, code: 'stump' };
  if (Math.hypot(tx - CENTER.x, ty - CENTER.y) > VILLAGE_RADIUS) return { ok: false, code: 'zone' };
  if (Math.hypot(tx - CENTER.x, ty - CENTER.y) < 4) return { ok: false, code: 'reserved' };
  for (const id of PLOT_IDS) if (inRect(tx, ty, plotRect(id))) return { ok: false, code: 'plot' };
  if (WORLD.ground[idx(tx, ty)] === T.FORD) return { ok: false, code: 'blocked' };
  return { ok: true, code: 'ok' };
}
/** Trees, stumps and rocks that still sit inside a public plot (must be cleared before building). */
export function plotObstacles(s, id) {
  const r = plotRect(id), out = [];
  for (let y = r.ty; y < r.ty + r.h; y++) for (let x = r.tx; x < r.tx + r.w; x++) {
    const n = nodeOnTile(x, y);
    if (n && nodeStatus(s, n) !== 'gone') out.push(n);
  }
  return out;
}
/** Nodes near a world-pixel position (cheap spatial query for interaction/rendering). */
export function nodesNear(wx, wy, rTiles) {
  const out = [], cx = Math.floor(wx / TILE), cy = Math.floor(wy / TILE);
  for (let y = cy - rTiles; y <= cy + rTiles; y++) for (let x = cx - rTiles; x <= cx + rTiles; x++) { const n = nodeAt.get(idx(x, y)); if (n) out.push(n); }
  return out;
}
export function regionLabel(tx, ty) {
  const d = Math.hypot(tx - CENTER.x, ty - CENTER.y);
  if (d < CLEARING_R + 2) return '🏡 ลานบ้านผู้นำ';
  if (d < VILLAGE_RADIUS) return '🌱 ที่ดินหมู่บ้าน';
  const g = groundAt(tx, ty);
  return g === T.ROCKY ? '⛰️ ลานหิน' : g === T.FOREST ? '🌲 ป่าลึก' : g === T.SAND || g === T.FORD ? '🏞️ ริมน้ำ' : '🌿 ทุ่งป่า';
}
// legacy name kept for older modules/tests
export const SCENE_W = 0;

generateRegion(DEFAULT_SEED, 'forest');

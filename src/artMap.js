// Which v0.10 sprite (assets/v10/*, see src/artManifest.js) represents each world thing. Pure: no DOM,
// so tests can check every reachable state has art and the renderer stays a thin drawing layer.
import { ART10 } from './artManifest.js';
import { WORLD, WORLD_W, WORLD_H, T, hash, groundAt, CENTER } from './world.js';

export const has = name => Object.prototype.hasOwnProperty.call(ART10, name);

// ---- trees: world kinds (0-2 generic, 3 fruit, 4 conifer) -> species with matching stump art
export const TREE_SPECIES = {
  0: ['broadleaf', 'raintree', 'teak', 'broadleaf', 'rubber'],
  1: ['broadleaf', 'rubber', 'teak', 'raintree'],
  2: ['bamboo', 'teak', 'broadleaf', 'bamboo', 'goldenshower', 'teak', 'broadleaf', 'rubber', 'pinkshower', 'teak', 'broadleaf', 'raintree'],
  3: ['mango', 'banana', 'coconut', 'tamarind'],
  4: ['pine', 'pine', 'pinesmall'],
};
export function treeSpecies(n) { if (n.sprite) return n.sprite.replace(/^tree_/, ''); const l = TREE_SPECIES[n.kind] || TREE_SPECIES[0]; return l[Math.floor(hash(n.x, n.y, 913) * l.length) % l.length]; }

// ---- rocks: 3 looks per rock (intact, cracked after 1 hit, rubble after 2)
export function rockSprite(n, hits = 0) {
  const h = hash(n.x, n.y, 517);
  const kind = n.kind === 1 ? (h < 0.3 ? 'crystal' : 'copper') : (h < 0.35 ? 'mossy' : 'stone');
  return `rock_${kind}_${Math.max(0, Math.min(2, hits | 0))}`;
}

// ---- buildings: 5 eras x 4 construction stages (s0 staked plot + materials, s1 frame, s2 roofing, s3 finished)
export const ERA_NAMES = ['', 'กระท่อมไม้ไผ่', 'เรือนไม้ใต้ถุนสูง', 'เรือนไม้ครึ่งตึก', 'เรือนสองชั้น', 'อาคารสมัยใหม่'];
export const ERAS = { house: 5, market: 5, hall: 5, leader: 4 };
/** obj = public site or placed building ({status, level, upgradingTo}); progress 0..1 while building. */
export function buildingFrame(kind, obj, progress = 1) {
  const max = ERAS[kind] || 5;
  if (obj.status === 'building' && obj.upgradingTo) { // rebuilding into the next era: frame first, then roof
    const era = Math.min(max, obj.upgradingTo);
    return `${kind}_e${era}_s${progress < 0.5 ? 1 : 2}`;
  }
  if (obj.status === 'building' || !(obj.level >= 1)) return `${kind}_e1_s${progress < 0.3 ? 0 : progress < 0.65 ? 1 : 2}`;
  return `${kind}_e${Math.min(max, obj.level)}_s3`;
}
// villager houses: every plot gets its own size (s/m/l), design family and mirroring, so no two neighbours match
export const COT_SIZES = { s: { eras: 5, th: 'บ้านหลังเล็ก' }, m: { eras: 5, th: 'บ้านขนาดกลาง' }, l: { eras: 4, th: 'เรือนไม้หลังใหญ่' } };
// v0.16 era houses: which sizes exist per era (missing art falls back to the nearest size)
export const HOUSE_ERAS = ['บุกเบิก', 'หมู่บ้าน', 'อำเภอ', 'จังหวัด', 'ประเทศ'];
export const HOUSE_SIZES = { small: 'บ้านหลังเล็ก', medium: 'บ้านขนาดกลาง', large: 'บ้านหลังใหญ่', shop: 'บ้านทำร้านค้า' };
export const HS_AVAIL = { 1: ['small', 'medium', 'shop'], 2: ['small', 'medium', 'large', 'shop'], 3: ['small', 'medium', 'large', 'shop'], 4: ['small', 'shop'], 5: ['small', 'medium', 'large', 'shop'] };
const FALLBACK = { large: ['large', 'medium', 'small'], medium: ['medium', 'large', 'small'], small: ['small', 'medium'], shop: ['shop', 'small'] };
export function houseSizeOf(p) { if (p.size && HOUSE_SIZES[p.size]) return p.size; const h = hash(p.tx * 7 + 3, p.ty * 13 + 5, 4711); return h < .3 ? 'small' : h < .62 ? 'medium' : h < .82 ? 'large' : 'shop'; }
// v0.24 one-style houses: house level = wealth tier (1 cabin … 5 mansion), each tier has several designs (a-d).
// A design is picked by the owner (p.style) or, for villagers, from the plot position; flipping doubles the variety.
export const HZ_TIERS = { 1: 'กระท่อม', 2: 'บ้านหลังเล็ก', 3: 'บ้านกลาง', 4: 'บ้านสองชั้น', 5: 'บ้านหรู' };
export const HZ_DESIGNS = {};
for (const k of Object.keys(ART10)) { const m = /^hz(\d)([a-z])_s3$/.exec(k); if (m) (HZ_DESIGNS[m[1]] = HZ_DESIGNS[m[1]] || []).push(m[2]); }
for (const t of Object.keys(HZ_DESIGNS)) HZ_DESIGNS[t].sort();
export function houseDesign(p, tier) {
  const l = HZ_DESIGNS[tier] || []; if (!l.length) return null;
  return l.includes(p.style) ? p.style : l[Math.floor(hash(p.tx * 7 + 3, p.ty * 13 + 5, 4711) * l.length) % l.length];
}
export function eraHouseFrame(p, progress = 1) {
  { const base = buildingFrame('house', p, progress), m = /e(\d)_s(\d)/.exec(base);
    let tier = Math.min(5, +m[1]); while (tier > 1 && !HZ_DESIGNS[tier]) tier--;
    const d = houseDesign(p, tier);
    if (d) return { name: `hz${tier}${d}_s${m[2]}`, flip: hash(p.ty, p.tx, 99) < .5, size: d, era: tier }; }
  const base = buildingFrame('house', p, progress), m = /e(\d)_s(\d)/.exec(base), era = Math.min(5, +m[1]), size = houseSizeOf(p);
  const avail = HS_AVAIL[era], pick = FALLBACK[size].find(z => avail.includes(z)) || avail[0];
  return { name: `hs${era}_${pick}_s${m[2]}`, flip: hash(p.ty, p.tx, 99) < .5, size: pick, era };
}
export function cottageStyle(p) {
  const h = hash(p.tx * 7 + 3, p.ty * 13 + 5, 4711), size = p.size || (h < .34 ? 's' : h < .72 ? 'm' : 'l');
  return { size, flip: hash(p.ty, p.tx, 99) < .5, eraOffset: Math.floor(hash(p.tx, p.ty, 7) * 2) }; // eraOffset: some families start one style ahead
}
export function cottageFrame(p, progress = 1) {
  const st = cottageStyle(p), max = COT_SIZES[st.size].eras;
  const base = buildingFrame('house', p, progress).replace('house_', ''); // e{era}_s{stage}
  const m = /e(\d)_s(\d)/.exec(base); let era = Math.min(max, +m[1]), stage = +m[2];
  if (stage === 3 && era < max && st.eraOffset && era === 1) era = 1; // keep the first era humble
  return { name: `cot${st.size}_e${era}_s${stage}`, ...st };
}
/** The leader's house grows with the village itself (town stage 0..3 -> eras 1..4). */
export function leaderHouseFrame(stage = 0) { return `leader_e${Math.min(4, Math.max(0, stage) + 1)}_s3`; }

// ---- ground era (roads, private paths)
export const ROAD_ERAS = ['cobble']; // One fantasy stone road at every progression tier
export function roadTexture(stage = 0) { return 'tx_road_cobble'; }

// ---- crops & fences
export const CROPS = ['rice', 'cabbage', 'chili', 'corn', 'pumpkin', 'mango'];
export function cropStage(progress) { return progress < 0 ? -1 : progress < 0.34 ? 0 : progress < 0.67 ? 1 : progress < 1 ? 2 : 3; }
export function cropFor(key) { let h = 0; for (const c of String(key)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return CROPS[h % CROPS.length]; }
export const FENCE_MATERIALS = ['bamboo', 'wood', 'stone', 'plaster', 'iron'];

// ---- decor sprites (plants/flowers) layered over the ground, derived from the decor layer of the region
const DECOR_SETS = {
  meadow: ['flowers_yellow', 'flowers_rose', 'flowers_violet', 'flowers_white', 'marigold', 'sunflower', 'hibiscus', 'flowers_pink'],
  grass: ['tuft_a', 'tuft_b', 'clover', 'tuft_a', 'reed_gold'],
  forest: ['fern_a', 'fern_b', 'shrub_a', 'shrub_b', 'shrub_c', 'fern_a', 'orchid_log', 'reed_white'],
  shore: ['cattail', 'reed_pink', 'pampas', 'cattail'],
  water: ['lotus_pink', 'lotus_white'],
};
export const DECOR_LIST = [...new Set(Object.values(DECOR_SETS).flat())].map(n => 'pl_' + n);
let decorKey = '', decorIdx = new Uint8Array(0);
/** Uint8Array per tile: 0 = no plant sprite, else 1 + index into DECOR_LIST. Cached per region. */
export function decorSprites() {
  const key = `${WORLD.seed}:${WORLD.biome}:${WORLD.version}`;
  if (key === decorKey) return decorIdx;
  decorKey = key; decorIdx = new Uint8Array(WORLD_W * WORLD_H);
  const pick = (set, x, y) => 1 + DECOR_LIST.indexOf('pl_' + set[Math.floor(hash(x, y, WORLD.seed + 404) * set.length) % set.length]);
  for (let y = 0; y < WORLD_H; y++) for (let x = 0; x < WORLD_W; x++) {
    const i = y * WORLD_W + x, d = WORLD.decor[i], t = WORLD.ground[i], h = hash(x, y, WORLD.seed + 303);
    const nearWater = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => groundAt(x + dx, y + dy) === T.WATER);
    const nearLand = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const g = groundAt(x + dx, y + dy); return g !== T.WATER && g !== T.FORD; });
    // flower borders along village paths (the widened path covers the tile next to the trail -> plant one further out)
    const isDirt = (X, Y) => groundAt(X, Y) === T.DIRT;
    const ring2 = !isDirt(x, y) && t !== T.WATER && Math.hypot(x - CENTER.x, y - CENTER.y) < 27 && Math.hypot(x - CENTER.x, y - CENTER.y) > 4.5
      && ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => isDirt(x + dx, y + dy))
      && [[2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [-1, 1], [1, -1], [-1, -1]].some(([dx, dy]) => isDirt(x + dx, y + dy));
    if (ring2 && h < 0.06) decorIdx[i] = pick(h < 0.3 ? DECOR_SETS.meadow : DECOR_SETS.forest, x, y);
    else if (d >= 1 && d <= 4 && h < 0.14) decorIdx[i] = pick(DECOR_SETS.meadow, x, y);   // v0.18: fewer plants scattered everywhere
    else if ((d === 5 || d === 6) && h < 0.07) decorIdx[i] = pick(DECOR_SETS.grass, x, y);
    else if (d >= 7 && d <= 9 && h < 0.1) decorIdx[i] = pick(DECOR_SETS.forest, x, y);
    else if (t === T.SAND && nearWater && h < 0.16) decorIdx[i] = pick(DECOR_SETS.shore, x, y);
    else if (t === T.WATER && nearLand && h < 0.07) decorIdx[i] = pick(DECOR_SETS.water, x, y);
  }
  return decorIdx;
}

/** Where a river enters from the north edge (for the waterfall), or null. */
export function waterfallSpot() {
  for (let x = 6; x < WORLD_W - 6; x++) {
    if (groundAt(x, 1) !== T.WATER || groundAt(x - 1, 1) === T.WATER) continue;
    let w = 0; while (x + w < WORLD_W && groundAt(x + w, 1) === T.WATER) w++; // out-of-bounds groundAt returns water
    if (w >= 2 && w <= 5) return { x: x + w / 2, y: 4 };
  }
  return null;
}

/** Every sprite name the renderer can ask for (tests check they all exist). */
export function allReachableSprites() {
  const out = new Set();
  for (const l of Object.values(TREE_SPECIES)) for (const sp of l) { out.add('tree_' + sp); out.add('stump_' + sp); }
  for (const k of ['stone', 'mossy', 'copper', 'crystal']) for (let i = 0; i < 3; i++) out.add(`rock_${k}_${i}`);
  for (const [kind, max] of Object.entries(ERAS)) for (let e = 1; e <= max; e++) for (let st = 0; st < 4; st++) out.add(`${kind}_e${e}_s${st}`);
  for (const [e, l] of Object.entries(HS_AVAIL)) for (const z of l) for (let st = 0; st < 4; st++) out.add(`hs${e}_${z}_s${st}`);
  for (const [t, l] of Object.entries(HZ_DESIGNS)) for (const d of l) for (let st = 0; st < 4; st++) out.add(`hz${t}${d}_s${st}`);
  for (const [k, v] of Object.entries(COT_SIZES)) for (let e = 1; e <= v.eras; e++) for (let st = 0; st < 4; st++) out.add(`cot${k}_e${e}_s${st}`);
  for (const r of ROAD_ERAS) out.add('tx_road_' + r);
  for (const c of CROPS) for (let i = 0; i < 4; i++) out.add(`crop_${c}_${i}`);
  for (const m of FENCE_MATERIALS) { out.add(`fence_${m}_line`); out.add(`fence_${m}_post`); }
  for (const d of DECOR_LIST) out.add(d);
  for (let i = 0; i < 4; i++) out.add('waterfall_' + i);
  // v0.12 village props / animals / pens / water structures
  for (const n of Object.keys(ART10)) if (/^(pp|pf|pc|pw|an|fb)_/.test(n)) out.add(n);
  for (const t of ['grass_0', 'grass_1', 'grass_2', 'forest_0', 'forest_1', 'forestfloor_0', 'forestfloor_1', 'dirt_0', 'dirt_1', 'sand_0', 'sand_1', 'rocky_0', 'rocky_1', 'meadow_0', 'meadow_1', 'meadow_2', 'farm_0', 'farm_1', 'water_0', 'water_1', 'water_2', 'ford_0']) out.add('tx_' + t);
  return [...out];
}

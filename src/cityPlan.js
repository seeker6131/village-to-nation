// v0.18 town districts for the upper levels, laid out like the reference map (world.ZONES). Pure (no DOM).
// Each level develops its OWN zone instead of a ring around the village:
//   อำเภอ   -> the hill (ที่ว่าการอำเภอ, police, school, post office, store) + a temple by the lake
//   จังหวัด -> the hill building becomes the provincial hall; the market quarter across the bridge (hospital, mall, fire station)
//   ประเทศ  -> the hill building becomes the government house; the new town in the east (bank, towers, condo)
// Every district is arranged like a classic pixel town square: a paved square with a fountain in the middle, the main
// building on its north side facing it, the others around it with lamps at the doors, short stone lanes to each door,
// and big trees left around the edge. Positions are tiles; props follow villageProps.js ((x, y) = bottom-centre).
import { ZONES, zoneById, groundAt, T, hash, WORLD } from './world.js';

const B = { // collision rows of each building (front part of the footprint)
  cb_district: 5, cb_police: 4, cb_fire: 4, cb_school: 4, cb_temple: 4, cb_post: 3, cb_market: 4, cb_shophouse: 3, cb_store: 3, cb_apartment: 3,
  cb_province: 6, cb_hospital: 7, cb_mall: 5, cb_condo: 4, cb_tower_teal: 3, cb_tower_glass: 4, cb_bank: 4, cb_parliament: 8,
};
export const CITY_NAMES = { cb_district: 'ที่ว่าการอำเภอ', cb_police: 'สถานีตำรวจ', cb_fire: 'สถานีดับเพลิง', cb_school: 'โรงเรียน', cb_temple: 'วัด', cb_post: 'ไปรษณีย์',
  cb_market: 'ตลาดสด', cb_shophouse: 'ตึกแถว', cb_store: 'ร้านสะดวกซื้อ', cb_apartment: 'อพาร์ตเมนต์', cb_province: 'ศาลากลางจังหวัด', cb_hospital: 'โรงพยาบาล',
  cb_mall: 'ห้างสรรพสินค้า', cb_condo: 'คอนโด', cb_tower_teal: 'ตึกสำนักงาน', cb_tower_glass: 'ตึกระฟ้า', cb_bank: 'ธนาคาร', cb_parliament: 'ทำเนียบรัฐบาล' };

// square: paved rectangle [x0, y0, x1, y1] with a fountain; buildings: [{ tier: sprite }, centre x, bottom y]
// lanes: [x0, y0, x1, y1] stone lanes from the square to the doors / along the front of the buildings
// every coordinate is RELATIVE to the zone centre of the current layout (world.ZONES / worldLayouts.js),
// so each of the 10 town layouts puts the same well-made district wherever its hill / quarter / new town is.
const DISTRICTS = [
  { zone: 'hill', tier: 3, square: [-6, 1, 6, 7],
    buildings: [[{ 3: 'cb_district', 4: 'cb_province', 5: 'cb_parliament' }, 0, .6], [{ 3: 'cb_police' }, -13, 7], [{ 3: 'cb_school' }, 13, 7], [{ 3: 'cb_post' }, -5, 15], [{ 3: 'cb_store' }, 5, 15]],
    lanes: [[-12, 7, -7, 8], [7, 7, 12, 8], [-1, 8, 0, 17], [-9, 16, 9, 17]] },
  { zone: 'temple', tier: 3, square: null, buildings: [[{ 3: 'cb_temple' }, 0, 3]], lanes: [[-1, 4, 2, 5], [3, 4, 8, 5]] },
  { zone: 'quarter', tier: 4, square: [-6, -4, 6, 3],
    buildings: [[{ 4: 'cb_hospital' }, -8, -4.4], [{ 4: 'cb_mall' }, 9, -4.4], [{ 4: 'cb_fire' }, -8, 11], [{ 4: 'cb_shophouse', 5: 'cd_shophouses' }, 3, 11], [{ 4: 'cb_apartment', 5: 'cd_office' }, 11, 11]],
    lanes: [[-11, -4, -7, -3], [7, -4, 10, -3], [-3, 4, -2, 13], [-12, 12, 14, 13]] },
  { zone: 'newtown', tier: 5, square: [-6, -3, 6, 3],
    buildings: [[{ 5: 'cb_tower_glass' }, -8, -3.4], [{ 5: 'cb_bank' }, 0, -3.4], [{ 5: 'cb_tower_teal' }, 8, -3.4], [{ 5: 'cd_shophouses' }, -9, 11], [{ 5: 'cd_hotel' }, 7, 11]],
    lanes: [[-2, 4, -1, 13], [-11, 12, 14, 13]] },
  { zone: 'port', tier: 5, square: null,
    buildings: [[{ 5: 'po_refinery' }, -5, 2], [{ 5: 'po_crane' }, 4, 2], [{ 5: 'po_pier' }, 4, 10]], // the oil rig stands out at sea (offshoreRig)
    lanes: [[-10, 3, 6, 4]] },
];
export function districtFocus(t) { const id = { 3: 'hill', 4: 'quarter', 5: 'newtown' }[t]; const z = id && zoneById(id); return z ? [z.cx ?? z.x, (z.cy ?? z.y) + 5] : null; }
export const DISTRICT_FOCUS = new Proxy({}, { get: (_, t) => districtFocus(Number(t)) });
const SUB = { cb_store: 'sh_conv', cb_shophouse: 'sh_grocery', cd_shophouses: 'sh_rest', cb_bank: 'bz_bank', cd_office: 'bz_office', cb_tower_teal: 'bz_office', cb_tower_glass: 'bz_office' };
for (const [k, th] of Object.entries({ sh_conv: 'ร้านสะดวกซื้อ', sh_grocery: 'ร้านชำ', sh_rest: 'ร้านอาหาร', bz_bank: 'ธนาคาร', bz_office: 'สำนักงาน' })) for (let i = 1; i <= 4; i++) CITY_NAMES[`${k}_${i}`] = th;
const pick = (by, t) => { let n = null; for (const k of Object.keys(by).map(Number).sort((a, b) => a - b)) if (k <= t) n = by[k]; return n; };

let memo = null;
function build(t, sizes) {
  const wet = (x, y) => { const g = groundAt(x, y); return g === T.WATER || g === T.FORD; };
  const streets = [], paved = [], props = [], areas = [];
  const rect = (out, [x0, y0, x1, y1]) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!wet(x, y)) out.push(x + ',' + y); };
  for (const D0 of DISTRICTS) {
    if (D0.tier > t) continue;
    const z = zoneById(D0.zone); if (!z) continue;
    const ox = z.cx ?? z.x, oy = z.cy ?? z.y, mv = r => [r[0] + ox, r[1] + oy, r[2] + ox, r[3] + oy];
    const D = { ...D0, square: D0.square && mv(D0.square), lanes: D0.lanes.map(mv), buildings: D0.buildings.map(([by, x, y]) => [by, x + ox, y + oy]) };
    areas.push(z);
    for (const l of D.lanes) rect(streets, l);
    if (D.square) {
      rect(paved, D.square);
      const [x0, y0, x1, y1] = D.square, cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2;
      props.push({ name: 'cp_fountain', x: cx, y: cy + 1, block: [[Math.floor(cx) - 1, Math.floor(cy)], [Math.floor(cx), Math.floor(cy)]] });
      props.push({ name: 'cp_bench', x: cx - 4, y: cy + 1.2 }, { name: 'cp_bench', x: cx + 4, y: cy + 1.2 });
      for (const [x, y] of [[x0 + .5, y0 + 1], [x1 + .5, y0 + 1], [x0 + .5, y1 + 1], [x1 + .5, y1 + 1]]) props.push({ name: 'cp_planter', x, y });
    }
    for (const [by, cx, bottom] of D.buildings) {
      let n = pick(by, t); if (!n) continue;
      // v0.24 one-style businesses: upgrade level follows the area level (อำเภอ 2 · จังหวัด 3 · ประเทศ 4)
      if (SUB[n] && sizes[`${SUB[n]}_${t - 1}`]) n = `${SUB[n]}_${t - 1}`;
      const w = Math.ceil((sizes[n]?.[0] || 64) / 16), rows = B[n] || 3, x0 = Math.round(cx - w / 2) + 1, x1 = Math.round(cx + w / 2) - 2, blk = [];
      for (let y = Math.floor(bottom) - rows; y < Math.floor(bottom); y++) for (let x = x0; x <= x1; x++) blk.push([x, y]);
      props.push({ name: n, x: cx, y: bottom + .1, block: blk, city: CITY_NAMES[n], big: true });
      // a pair of lamps at the door (like the reference town)
      props.push({ name: 'cp_lamp', x: cx - 2.2, y: bottom + .6, light: true }, { name: 'cp_lamp', x: cx + 2.8, y: bottom + .6, light: true });
      if (n === 'cb_police') props.push({ name: 'cp_policebox', x: x0 - 1.4, y: bottom - .2, block: [[x0 - 2, Math.floor(bottom) - 1]] });
      if (n === 'cb_fire') props.push({ name: 'cp_hydrant', x: x1 + 2.2, y: bottom + .4 });
      if (n === 'cb_school' || n === 'cb_mall') props.push({ name: 'cp_busstop', x: cx + 5, y: bottom + 2.4 });
      if (n === 'cb_post' || n === 'cb_store' || n === 'cb_shophouse') props.push({ name: 'cp_bin', x: x0 - .6, y: bottom + .4 });
    }
  }
  // offshore oil rig: out in the sea beyond the port (only when the art exists and the layout has a sea)
  if (t >= 5 && sizes.po_rig && WORLD.sea) { const z = zoneById('port'); if (z) {
    let best = null;
    for (let y = 4; y < 92; y++) for (let x = 4; x < 140; x++) { const i = y * 144 + x; if (!WORLD.sea[i]) continue;
      let deep = true; for (let d = -6; d <= 6 && deep; d += 2) for (let e = -6; e <= 6; e += 2) { const yy = y + d, xx = x + e; if (yy < 0 || yy > 95 || xx < 0 || xx > 143 || !WORLD.sea[yy * 144 + xx]) { deep = false; break; } }
      if (!deep) continue; const dd = Math.hypot(x - (z.cx ?? z.x), y - (z.cy ?? z.y)); if (!best || dd < best.d) best = { x, y, d: dd }; }
    if (best) props.push({ name: 'po_rig', x: best.x + .5, y: best.y + 3, big: true, city: 'แท่นขุดเจาะน้ำมันกลางทะเล' });
  } }
  if (t >= 3) { const v = zoneById('village'); if (v) areas.push(v); } // a town from อำเภอ up: the village core loses its wild trees too
  const taken = new Set([...streets, ...paved]);
  for (const p of props) for (const [x, y] of p.block || []) taken.add(x + ',' + y);
  return { streets, paved, props, areas, taken, keepTrees: new Set(), blocks: [] };
}
/** District content up to tier t (3..5). `sizes` = sprite sizes (ART10) so footprints match the art. */
export function cityPlan(t, sizes) {
  const key = `${t}:${WORLD.seed}:${WORLD.plan}:${WORLD.version}`;
  if (!memo || memo.key !== key) memo = { key, ...build(t, sizes || {}) };
  return memo;
}
/** Trees that stay when districts open: everything outside the opened zones; inside, ~1 in 7 big trees as shade. */
export function cityKeepsTree(t, x, y, plan) {
  const p = plan || memo; if (!p) return true;
  if (p.taken.has(x + ',' + y)) return false;
  for (const z of p.areas) if (((x - z.x) / z.rx) ** 2 + ((y - z.y) / z.ry) ** 2 < 1) return hash(x, y, 92) < .14;
  return true;
}
export const CITY_RADIUS = {}; // v0.17 name kept for old imports
export function resetCityPlan() { memo = null; }

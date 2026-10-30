// v0.12 pre-designed village layouts ("ผังสำเร็จรูป"). Pure rules, no DOM.
// Each tier of the village has a fixed plan: which building slots exist, where they are, and which roads open.
// The player clears the forest and builds every slot of the current tier; then the LEADER of that tier presses
// "ยกระดับ" and the plan expands (new slots + roads, a bigger village area, a new title on the road to PM).
// Requirements are things that exist in the world — never money. s.town.stage = tier - 1.
import { addHistory } from './gameState.js';
import { CENTER, TILE, nodeOnTile, nodeStatus, setNode, plotObstacles, plotRect, WORLD, WORLD_W, WORLD_H, groundAt, T, zoneAt, zoneById } from './world.js';
import { cityPlan } from './cityPlan.js';
import { ART10 } from './artManifest.js';

/**
 * kind 'public' = one of the four public projects (plot from world.POINTS).
 * kind 'cottage' | 'workshop' = private building that may only be placed on this exact slot (tx, ty = top-left).
 */
export const TIERS = [
  // v0.25 street plan: a main street (W-E, y 50-51) and an avenue (N-S, x 40-41) cross at the plaza; residential lanes
  // run W-E with a row of houses on their north side, every front door 1 tile above the lane (a front yard row between).
  // Coordinates = top-left of the 4x3 house footprint. Roads: [polyline, main?] (main = road with sidewalks).
  { tier: 1, th: 'ค่ายบุกเบิก', title: 'หัวหน้าค่าย', icon: '⛺', radius: 27, minPop: 0, maxNpc: 15,
    slots: [
      { id: 'home', kind: 'public', name: 'บ้านพักหลังแรก' },
      { id: 'farm', kind: 'public', name: 'สวนอาหารชุมชน' },
      { id: 'h0', kind: 'cottage', tx: 15, ty: 54, name: 'ซอย 1 บ้านเลขที่ 1' },
      { id: 'h1', kind: 'cottage', tx: 20, ty: 54, name: 'ซอย 1 บ้านเลขที่ 2' },
      { id: 'h2', kind: 'cottage', tx: 25, ty: 54, name: 'ซอย 1 บ้านเลขที่ 3' },
      { id: 'h7', kind: 'cottage', tx: 30, ty: 54, name: 'ซอย 1 บ้านเลขที่ 4' },
      { id: 'h8', kind: 'cottage', tx: 35, ty: 54, name: 'ซอย 1 บ้านเลขที่ 5' },
      { id: 'h9', kind: 'cottage', tx: 42, ty: 54, name: 'ซอย 1 บ้านเลขที่ 6' },
      { id: 'h10', kind: 'cottage', tx: 22, ty: 37, name: 'ถนนเหนือ บ้านเลขที่ 1' },
      { id: 'h11', kind: 'cottage', tx: 27, ty: 37, name: 'ถนนเหนือ บ้านเลขที่ 2' },
    ],
    // all roads start on even tiles so they sit exactly on the 2x2 ground-tile cells (clean 2-tile-wide streets)
    roads: [[[[12, 50], [62, 50]], true], [[[40, 38], [40, 42]], true], [[[40, 52], [40, 72]], true], [[[32, 28], [32, 38]], true],
      [[[14, 58], [38, 58]]], [[[42, 58], [44, 58]]], [[[20, 40], [58, 40]]]] },
  { tier: 2, th: 'หมู่บ้าน', title: 'ผู้ใหญ่บ้าน', icon: '🏡', radius: 33, minPop: 12, maxNpc: 30, office: { record: 0, knowledge: 3 },
    slots: [
      { id: 'market', kind: 'public', name: 'ตลาดหมู่บ้าน' },
      { id: 'hall', kind: 'public', name: 'ศาลาประชาคม' },
      { id: 'w1', kind: 'workshop', tx: 58, ty: 47, name: 'โรงงานงานฝีมือ' },
      { id: 'h3', kind: 'cottage', tx: 34, ty: 37, name: 'ถนนเหนือ บ้านเลขที่ 3' },
      { id: 'h4', kind: 'cottage', tx: 42, ty: 37, name: 'ถนนเหนือ บ้านเลขที่ 4' },
      { id: 'h5', kind: 'cottage', tx: 47, ty: 37, name: 'ถนนเหนือ บ้านเลขที่ 5' },
      { id: 'h6', kind: 'cottage', tx: 52, ty: 37, name: 'ถนนเหนือ บ้านเลขที่ 6' },
    ],
    roads: [[[[14, 64], [60, 64]]], [[[14, 70], [60, 70]]]] },
  // v0.26 real Thai ladder: elected posts follow the area (ผู้ใหญ่บ้าน → นายก อบต. → ส.ส. → นายกรัฐมนตรี via parliament);
  // นายอำเภอ / ผู้ว่าฯ are civil-service ranks (career.js). From tier 3 the area is raised with the treasury's development
  // fund (`fund`, spent on upgrade) + public buildings + happiness; the candidate needs `office` qualifications to run.
  { tier: 3, th: 'อำเภอ', title: 'นายก อบต.', icon: '🏘️', radius: 36, minPop: 26, maxNpc: 60, fund: 2000, publicLv: 2, happy: 55, office: { record: 60, knowledge: 6 }, slots: [], roads: [] },
  { tier: 4, th: 'จังหวัด', title: 'ส.ส.', icon: '🏙️', radius: 48, minPop: 60, maxNpc: 120, fund: 9000, publicLv: 3, happy: 55, office: { record: 150, knowledge: 10 }, slots: [], roads: [] },
  { tier: 5, th: 'ประเทศ', title: 'ส.ส. ระดับชาติ', icon: '🇹🇭', radius: 60, minPop: 100, maxNpc: 200, fund: 26000, publicLv: 4, happy: 55, office: { record: 260, knowledge: 14 }, slots: [], roads: [] },
];
export const SLOT_KINDS = ['cottage', 'workshop']; // private buildings that need a slot

export function tierOf(s) { return Math.max(1, Math.min(TIERS.length, (s.town?.stage || 0) + 1)); }
export function tierInfo(s) { return TIERS[tierOf(s) - 1]; }
export function villageRadius(s) { return tierInfo(s).radius; }
/** Slots unlocked so far (all tiers up to the current one) + the house lots for online players of every map. */
export function openSlots(s) { const t = tierOf(s); return TIERS.slice(0, t).flatMap(T => T.slots.map(x => ({ ...x, tier: T.tier }))).concat(playerLots(t)); }

// ---- v0.25 house lots for online players ("หมู่บ้านจัดสรร"): rows of 4x3 plots on the north side of a lane, front door
// one row above the lane, 5 tiles apart — like a real residential street. Village rows are hand-planned; from อำเภอ up,
// streets are laid out in the zone that level develops and joined to the nearest road.
export const LOT_TARGET = { 2: 14, 3: 34, 4: 60, 5: 90 };
const LOT_ZONES = { 3: ['hill', 'temple'], 4: ['quarter', 'hill'], 5: ['newtown', 'port', 'quarter'] };
const LOT_TH = { 2: 'หมู่บ้าน', 3: 'อำเภอ', 4: 'จังหวัด', 5: 'ประเทศ' };
const VILLAGE_ROWS = [[60, [15, 20, 25, 30, 35, 42, 57]], [66, [15, 20, 25, 30, 35, 42, 47, 52, 57]]]; // lanes at y 64 / 70 (tier 2 roads)
let lotMemo = { key: '', all: [], lanes: [] };
function allLots() {
  const key = `${WORLD.seed}:${WORLD.plan}:${WORLD.version}`;
  if (lotMemo.key === key) return lotMemo;
  const used = new Set(), all = [], lanes = [];
  const mark = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) used.add(x + ',' + y); };
  const wet = (x, y) => { const g = groundAt(x, y); return g === T.WATER || g === T.FORD || g === T.SAND; };
  // village core: everything the plan already uses
  for (const k of cityPlan(5, ART10).taken) used.add(k);
  for (const Tt of TIERS) for (const sl of Tt.slots) if (sl.tx != null) mark(sl.tx, sl.ty, sl.tx + 3, sl.ty + 3);
  for (const id of ['home', 'farm', 'market', 'hall']) { const r = plotRect(id); mark(r.tx - 1, r.ty - 1, r.tx + r.w, r.ty + r.h); }
  for (const Tt of TIERS) for (const [line] of Tt.roads) for (let i = 0; i < line.length - 1; i++) mark(Math.min(line[i][0], line[i + 1][0]), Math.min(line[i][1], line[i + 1][1]), Math.max(line[i][0], line[i + 1][0]) + 1, Math.max(line[i][1], line[i + 1][1]) + 1);
  let n2 = 0;
  for (const [ty, xs] of VILLAGE_ROWS) for (const tx of xs) {
    if (n2 >= LOT_TARGET[2]) break;
    let ok = true; for (let y = ty; y <= ty + 3; y++) for (let x = tx; x <= tx + 3; x++) if (wet(x, y) || used.has(x + ',' + y)) ok = false;
    if (!ok) continue;
    mark(tx, ty, tx + 3, ty + 3); all.push({ id: `lot2_${n2}`, kind: 'cottage', tx, ty, tier: 2, lot: true, name: `ซอย ${ty === 60 ? 2 : 3} บ้านเลขที่ ${xs.indexOf(tx) + 1}` }); n2++;
  }
  // district streets: find runs of >= 3 free plots along a candidate lane, nearest to the zone first
  const blocked = new Set(['fields', 'mine', 'snow', 'deep', 'village']);
  const plotOk = (tx, laneY) => {
    for (let y = laneY - 4; y <= laneY + 1; y++) for (let x = tx - 1; x <= tx + 4; x++) {
      if (x < 2 || y < 3 || x > WORLD_W - 3 || y > WORLD_H - 3 || used.has(x + ',' + y) || wet(x, y)) return false;
      const z = zoneAt(x, y); if (z && blocked.has(z.id)) return false;
    }
    return true;
  };
  for (const tier of [3, 4, 5]) {
    const zs = LOT_ZONES[tier].map(id => zoneById(id)).filter(Boolean); if (!zs.length) continue;
    const cand = [];
    for (let laneY = 8; laneY < WORLD_H - 4; laneY += 2) for (let x0 = 2; x0 < WORLD_W - 18; x0 += 2) {
      const d = Math.min(...zs.map(z => Math.hypot(x0 + 8 - (z.cx ?? z.x), laneY - (z.cy ?? z.y)))); if (d < 55) cand.push([d, x0, laneY]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    let n = 0;
    for (const [, x0, laneY] of cand) {
      if (n >= LOT_TARGET[tier] - (tier > 3 ? LOT_TARGET[tier - 1] : LOT_TARGET[2])) break;
      const run = []; for (let tx = x0; tx < WORLD_W - 6 && run.length < 6; tx += 5) { if (!plotOk(tx, laneY)) break; run.push(tx); }
      if (run.length < 3) continue;
      // join the lane to the nearest road / path within 14 tiles (left or right), else drop it
      const isRoad = (x, y) => groundAt(x, y) === T.DIRT || lanes.some(l => l.has(x + ',' + y));
      let joinL = null, joinR = null;
      for (let k = 1; k <= 14 && joinL === null; k++) if (isRoad(run[0] - 1 - k, laneY) || isRoad(run[0] - 1 - k, laneY + 1)) joinL = k;
      for (let k = 1; k <= 14 && joinR === null; k++) { const x = run[run.length - 1] + 4 + k; if (isRoad(x, laneY) || isRoad(x, laneY + 1)) joinR = k; }
      if (joinL === null && joinR === null) continue;
      const lx0 = run[0] - 1 - (joinL !== null && (joinR === null || joinL <= joinR) ? joinL : 0), lx1 = run[run.length - 1] + 4 + (joinR !== null && (joinL === null || joinR < joinL) ? joinR : 0);
      let wetLane = false; for (let x = lx0; x <= lx1; x++) if (wet(x, laneY) || wet(x, laneY + 1)) wetLane = true;
      if (wetLane) continue;
      const lane = new Set(); for (let x = lx0; x <= lx1; x++) { lane.add(x + ',' + laneY); lane.add(x + ',' + (laneY + 1)); }
      lane.tier = tier; lanes.push(lane); mark(lx0, laneY, lx1, laneY + 1);
      for (const tx of run) { mark(tx - 1, laneY - 4, tx + 4, laneY - 1); all.push({ id: `lot${tier}_${n}`, kind: 'cottage', tx, ty: laneY - 4, tier, lot: true, name: `ที่ดินผู้เล่น ${LOT_TH[tier]} ${n + 1}` }); n++; }
    }
  }
  lotMemo = { key, all, lanes };
  return lotMemo;
}
export function playerLots(t) { return t >= 2 ? allLots().all.filter(l => l.tier <= t) : []; }
function lotLanes(t) { const out = []; for (const l of allLots().lanes) if (l.tier <= t) out.push(...l); return out; }
export function slotById(id) { for (const T of TIERS) { const x = T.slots.find(q => q.id === id); if (x) return { ...x, tier: T.tier }; } return null; }

/** What stands on a slot: { state: 'empty'|'building'|'done', obj } */
export function slotState(s, slot) {
  if (slot.kind === 'public') {
    const o = s.publicSites?.[slot.id];
    if (!o || o.status === 'none') return { state: 'empty', obj: null };
    return { state: o.status === 'done' || o.level >= 1 ? 'done' : 'building', obj: o };
  }
  const p = (s.placed || []).find(q => q.type === slot.kind && q.tx === slot.tx && q.ty === slot.ty);
  if (!p) return { state: 'empty', obj: null };
  return { state: p.level >= 1 ? 'done' : 'building', obj: p };
}
/** Exact free slot of this kind at (tx, ty), or null. */
export function slotAt(s, kind, tx, ty) { return openSlots(s).find(x => x.kind === kind && x.tx === tx && x.ty === ty) || null; }
/** Nearest unlocked, still-empty slot of a kind to tile (tx, ty). */
export function nearestFreeSlot(s, kind, tx, ty) {
  let best = null, bd = Infinity;
  for (const x of openSlots(s)) if (x.kind === kind && slotState(s, x).state === 'empty') { const d = Math.hypot(x.tx - tx, x.ty - ty); if (d < bd) { bd = d; best = x; } }
  return best;
}
export function publicUnlocked(s, id) { return openSlots(s).some(x => x.kind === 'public' && x.id === id); }
export function publicTier(id) { return TIERS.find(T => T.slots.some(x => x.id === id))?.tier || 1; }

/** Requirements for the next tier (all checks are world state; nothing is for sale). */
export function nextTierCheck(s, population = 0, { npc = false } = {}) {
  const t = tierOf(s), next = TIERS[t];
  if (!next) return { ok: false, next: null, items: [], why: 'ระดับสูงสุดแล้ว' };
  const items = [];
  for (const x of TIERS[t - 1].slots) { const st = slotState(s, x).state; items.push({ label: x.name, ok: st === 'done', note: st === 'building' ? 'กำลังสร้าง' : st === 'empty' ? 'ยังไม่สร้าง' : '' }); }
  items.push({ label: `ประชากร ${next.minPop} คน`, ok: population >= next.minPop, note: `ตอนนี้ ${population}` });
  if (next.publicLv) for (const id of ['home', 'market', 'hall', 'farm']) {
    const need = Math.min(next.publicLv, id === 'farm' ? 3 : 5), lv = s.publicSites?.[id]?.status === 'done' || s.publicSites?.[id]?.upgradingTo ? s.publicSites[id].level : 0;
    items.push({ label: `${PUBLIC_TH[id]} ระดับ ${need}`, ok: lv >= need, note: `ตอนนี้ ${lv}` });
  }
  if (next.happy) items.push({ label: `ความสุขชาวบ้าน ${next.happy}`, ok: (s.town?.happiness ?? 0) >= next.happy, note: `ตอนนี้ ${Math.round(s.town?.happiness ?? 0)}` });
  if (next.fund) items.push({ label: `งบพัฒนาพื้นที่ในคลัง ${next.fund} เหรียญ (จ่ายตอนยกระดับ)`, ok: (s.town?.treasury || 0) >= next.fund, note: `คลังมี ${Math.floor(s.town?.treasury || 0)}` });
  if (!npc) {
    const leader = !!s.leadership?.isLeader || s.election?.leader === 'player';
    items.push({ label: 'คุณเป็นผู้นำของพื้นที่นี้', ok: leader, note: leader ? '' : 'ต้องชนะเลือกตั้งก่อน' });
    for (const q of officeNeeds(s, next.tier)) items.push(q);
  }
  const ok = items.every(i => i.ok) && !next.locked;
  return { ok, next, items, why: next.locked || (ok ? '' : 'ยังทำไม่ครบตามผัง') };
}
const PUBLIC_TH = { home: 'บ้านพักชุมชน', market: 'ตลาด', hall: 'ศาลาประชาคม', farm: 'สวนอาหาร' };
/** Qualifications to hold the elected office of tier t: political track record + education (no money involved). */
export function officeNeeds(s, t) {
  const o = TIERS[t - 1]?.office; if (!o) return [];
  const out = [];
  if (o.knowledge) out.push({ label: `ความรู้ ${o.knowledge} (อ่านหนังสือ/เรียน)`, ok: (s.player?.knowledge || 0) >= o.knowledge, note: `ตอนนี้ ${s.player?.knowledge || 0}` });
  if (o.record) out.push({ label: `ผลงานทางการเมือง ${o.record}`, ok: (s.leadership?.record || 0) >= o.record, note: `ตอนนี้ ${Math.floor(s.leadership?.record || 0)}` });
  return out;
}

/** Leader presses "ยกระดับ". */
export function upgradeVillage(s, population = 0) {
  const c = nextTierCheck(s, population);
  if (!c.ok) return { ok: false, msg: c.why };
  if (c.next.fund) s.town.treasury -= c.next.fund; // the development fund is spent on the new district (roads, offices)
  s.town.stage = c.next.tier - 1;
  if (s.leadership) s.leadership.consecutive = s.leadership.isLeader ? 1 : 0; // a new office: the term count starts again
  const cleared = openRoads(s);
  addHistory(s, `${c.next.icon} ยกระดับเป็น "${c.next.th}" — คุณคือ${c.next.title}`);
  return { ok: true, msg: `${c.next.icon} ยกระดับเป็น${c.next.th}! ผังขยาย มีที่ดินใหม่ ${c.next.slots.length} แปลง${cleared ? ` · ชาวบ้านช่วยกันเปิดถนนใหม่ (ตัดต้นไม้ ${cleared} ต้น)` : ''}`, tier: c.next };
}

/** v0.26 while an NPC holds the office, the area still grows: the NPC leader raises it when the plan, buildings,
 *  happiness and treasury are ready (the player's own qualifications do not matter for that). Once per day. */
export function npcUpgradeVillage(s, population = 0) {
  if (s.leadership?.isLeader) return null;
  if (((s.day * 7919 + 13) % 100) / 100 > .2) return null; // NPC leaders take their time (~1 day in 5)
  const c = nextTierCheck(s, population, { npc: true });
  if (!c.ok) return null;
  if (c.next.fund) s.town.treasury -= c.next.fund;
  s.town.stage = c.next.tier - 1; openRoads(s);
  addHistory(s, `${c.next.icon} ${s.leadership?.leaderName || 'ผู้นำคนปัจจุบัน'} ยกระดับพื้นที่เป็น "${c.next.th}"`);
  return c.next;
}

/** Road tiles of every unlocked tier (tile keys "x,y"), 2 tiles wide. `.main` = the main streets (drawn with sidewalks). */
const roadMemo = new Map();
export function roadTiles(s) {
  const t = tierOf(s), mk = t + ':' + WORLD.seed + ':' + WORLD.plan + ':' + WORLD.version; if (roadMemo.has(mk)) return roadMemo.get(mk);
  const out = new Set(), main = new Set(); out.main = main; roadMemo.set(mk, out);
  const add = (k, m) => { out.add(k); if (m) main.add(k); };
  for (const T of TIERS.slice(0, t)) for (const [line, isMain] of T.roads) for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = line[i], [bx, by] = line[i + 1];
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++)
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) add((x + dx) + ',' + (y + dy), isMain);
  }
  for (const k of lotLanes(t)) add(k, false);                                // lanes of the player housing streets
  if (t >= 3) for (const k of cityPlan(t, ART10).streets) add(k, true);      // district squares
  // v0.25 the country roads to every opened district become real roads (dry tiles only; bridge decks stay planks)
  if (t >= 3) for (const p of WORLD.paths || []) if (p.tier <= t) for (let i = 0; i < p.length - 1; i++) {
    const [ax, ay] = p[i], [bx, by] = p[i + 1];
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++)
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const g = groundAt(x + dx, y + dy); if (g !== T.WATER && g !== T.FORD) add((x + dx) + ',' + (y + dy), false); }
  }
  return out;
}
/** Paved city blocks (tile keys) of the unlocked city levels. */
export function pavedTiles(s) { const t = tierOf(s); return t >= 3 ? new Set(cityPlan(t, ART10).paved) : EMPTY; }
const EMPTY = new Set();
/** v0.18 ground under buildings: a yard 1 tile wider than the sprite's base, so the art's own base sits on matching ground
 *  and the transition to grass is the soft autotile edge instead of the sprite's hard rectangle. Tile keys "x,y". */
let yardMemo = { key: '', set: EMPTY };
export function yardTiles(s) {
  const t = tierOf(s), key = `${t}:${WORLD.version}:${(s.placed || []).filter(p => p.type === 'cottage' || p.type === 'workshop').map(p => p.tx + '.' + p.ty + '.' + p.level).join(',')}:${Object.values(s.publicSites || {}).map(o => o.status).join('')}`;
  if (yardMemo.key === key) return yardMemo.set;
  const out = new Set(), rect = (x0, y0, x1, y1) => { for (let y = Math.floor(y0); y <= Math.floor(y1); y++) for (let x = Math.floor(x0); x <= Math.floor(x1); x++) out.add(x + ',' + y); };
  // v0.25: village buildings stand on lawn (no dirt/concrete blobs under them); only the big city buildings get a forecourt
  if (t >= 3) for (const p of cityPlan(t, ART10).props) if (p.big) { const sz = ART10[p.name] || [64, 64], w = sz[0] / 16; rect(p.x - w / 2 - 1, p.y - Math.min(4, sz[1] / 16 * .3) - 1, p.x + w / 2, p.y + .5); }
  yardMemo = { key, set: out };
  return out;
}
/** Villagers clear trees/rocks standing on the roads of unlocked tiers. Returns how many were removed. */
export function openRoads(s) {
  let n = 0;
  for (const k of roadTiles(s)) {
    const [x, y] = k.split(',').map(Number), node = nodeOnTile(x, y);
    if (node && nodeStatus(s, node) !== 'gone') { setNode(s, node.id, 'x'); n++; }
  }
  return n;
}
/** Trees/stumps/rocks still standing on a private slot (must be cleared before building there). */
export function slotObstacles(s, slot, w, h) {
  const out = [];
  for (let y = slot.ty; y < slot.ty + h; y++) for (let x = slot.tx; x < slot.tx + w; x++) { const n = nodeOnTile(x, y); if (n && nodeStatus(s, n) !== 'gone') out.push(n); }
  return out;
}
export function slotCenterPx(slot, w, h) { return { x: (slot.tx + w / 2) * TILE, y: (slot.ty + h) * TILE }; }
export { CENTER, plotObstacles };

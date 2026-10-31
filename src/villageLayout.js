// v0.12 pre-designed village layouts ("ผังสำเร็จรูป"). Pure rules, no DOM.
// Each tier of the village has a fixed plan: which building slots exist, where they are, and which roads open.
// The player clears the forest and builds every slot of the current tier; then the LEADER of that tier presses
// "ยกระดับ" and the plan expands (new slots + roads, a bigger village area, a new title on the road to PM).
// Requirements are things that exist in the world — never money. s.town.stage = tier - 1.
import { addHistory } from './gameState.js';
import { TREES, CENTER, TILE, nodeOnTile, nodeStatus, setNode, plotObstacles, plotRect, LEADER_HOUSE, WORLD, WORLD_W, WORLD_H, groundAt, T, zoneAt, zoneById } from './world.js';
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

// v0.27 a map from the Map Maker replaces the hand-planned village: its NPC plots become the camp's house slots, its
// workshop the workshop slot, its lots the player lots, its roads the roads. Re-applied whenever the map changes.
const DEF_TIERS = TIERS.map(T => ({ slots: T.slots.map(x => ({ ...x })), roads: T.roads }));
let syncedFor = null;
export function syncPlan() {
  const key = WORLD.custom?.id || '';
  if (syncedFor === key) return; syncedFor = key;
  TIERS.forEach((T, i) => { T.slots = DEF_TIERS[i].slots.map(x => ({ ...x })); T.roads = DEF_TIERS[i].roads; });
  const M = WORLD.custom; if (!M) return;
  const pub = x => x.kind === 'public';
  for (const T of TIERS) T.slots = [];
  TIERS[0].slots = DEF_TIERS[0].slots.filter(pub);
  M.npcSlots.forEach((p, k) => TIERS[Math.max(1, Math.min(5, p.tier || 1)) - 1].slots.push({ id: 'h' + k, kind: 'cottage', tx: p.tx, ty: p.ty, name: `บ้านชาวบ้านหลังที่ ${k + 1}` })); // NPC plots open with their area level
  TIERS[1].slots.push(...DEF_TIERS[1].slots.filter(pub), ...(M.workshop ? [{ id: 'w1', kind: 'workshop', tx: M.workshop.tx, ty: M.workshop.ty, name: 'โรงงานงานฝีมือ' }] : []));
  for (const T of TIERS) T.roads = [];
}
export function tierOf(s) { syncPlan(); return Math.max(1, Math.min(TIERS.length, (s.town?.stage || 0) + 1)); }
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
  syncPlan();
  if (WORLD.custom) { // the map's own lots, open from the start (online players claim them)
    lotMemo = { key, lanes: [], all: WORLD.custom.lots.map((p, k) => ({ id: `lot1_${k}`, kind: 'cottage', tx: p.tx, ty: p.ty, tier: p.tier || 1, lot: true, name: `ที่ดินผู้เล่น แปลงที่ ${k + 1}` })) };
    return lotMemo;
  }
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
export function playerLots(t) { return t >= 2 || WORLD.custom ? allLots().all.filter(l => l.tier <= t) : []; }
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
  const out = new Set(), main = new Set(), auto = new Set(); out.main = main; out.auto = auto; roadMemo.set(mk, out);
  const add = (k, m) => { out.add(k); if (m) main.add(k); };
  for (const T of TIERS.slice(0, t)) for (const [line, isMain] of T.roads) for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = line[i], [bx, by] = line[i + 1];
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++)
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) add((x + dx) + ',' + (y + dy), isMain);
  }
  for (const k of lotLanes(t)) add(k, false);                                // lanes of the player housing streets
  if (WORLD.custom) WORLD.custom.roads.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] !== '.' && +(WORLD.custom.tiers?.[y]?.[x] || 1) <= t) add(x + ',' + y, row[x] === 'M'); }); // roads drawn in the Map Maker, open with their area level
  if (t >= 3) for (const k of cityPlan(t, ART10).streets) { add(k, true); auto.add(k); } // district squares (built with the development fund: paved)
  // v0.25 the country roads to every opened district become real roads (dry tiles only; bridge decks stay planks)
  if (t >= 3) for (const p of WORLD.paths || []) if (p.tier <= t) for (let i = 0; i < p.length - 1; i++) {
    const [ax, ay] = p[i], [bx, by] = p[i + 1];
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++)
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const g = groundAt(x + dx, y + dy); if (g !== T.WATER && g !== T.FORD) { add((x + dx) + ',' + (y + dy), false); auto.add((x + dx) + ',' + (y + dy)); } }
  }
  return out;
}
// ---- v0.27 road paving: village roads start as dirt; the leader paves them section by section from the treasury
// (ดิน → คอนกรีต from หมู่บ้าน → ลาดยาง + ทางเท้า from อำเภอ). District streets come paved (development fund).
export const PAVE = [
  { th: 'ทางดิน', icon: '🟫', tier: 1, cost: 0 },
  { th: 'ถนนคอนกรีต', icon: '⬜', tier: 2, cost: 4 },
  { th: 'ถนนลาดยาง + ทางเท้า', icon: '⬛', tier: 3, cost: 10 },
];
export function ensurePaving(s) { s.town = s.town || {}; s.town.paved = s.town.paved && typeof s.town.paved === 'object' ? s.town.paved : {}; return s.town.paved; }
/** Paving level of every road tile ("x,y" -> 0..2) for the renderer. */
let paveMemo = { key: '', map: null };
export function paveLevels(s) {
  const R = roadTiles(s), P = ensurePaving(s), key = `${R.size}:${s.town.pavedVer || 0}:${tierOf(s)}`;
  if (paveMemo.key === key && paveMemo.R === R) return paveMemo.map;
  const map = new Map();
  const top = PAVE.reduce((m, p, i) => tierOf(s) >= p.tier ? i : m, 0); // a road never looks newer than its area's era
  for (const k of R) map.set(k, Math.min(top, R.auto?.has(k) ? 2 : P[k] || 0));
  paveMemo = { key, R, map };
  return map;
}
/** Road sections the leader can pave: connected road tiles inside 12x12 blocks (a street splits at block edges). */
const SEG = 12;
let segMemo = { key: '', list: [] };
export function roadSegments(s) {
  const R = roadTiles(s), key = `${R.size}:${WORLD.plan}:${WORLD.version}`;
  if (segMemo.key === key && segMemo.R === R) return segMemo.list;
  const seen = new Set(), list = [];
  for (const k of R) {
    if (seen.has(k) || R.auto?.has(k)) continue;
    const [x0, y0] = k.split(',').map(Number), bx = Math.floor(x0 / SEG), by = Math.floor(y0 / SEG), tiles = [], st = [k]; seen.add(k);
    while (st.length) { const q = st.pop(); tiles.push(q); const [x, y] = q.split(',').map(Number);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = (x + dx) + ',' + (y + dy); if (!seen.has(n) && R.has(n) && !R.auto?.has(n) && Math.floor((x + dx) / SEG) === bx && Math.floor((y + dy) / SEG) === by) { seen.add(n); st.push(n); } } }
    const xs = tiles.map(t => +t.split(',')[0]), ys = tiles.map(t => +t.split(',')[1]);
    const cx = Math.round(xs.reduce((a, b) => a + b, 0) / xs.length), cy = Math.round(ys.reduce((a, b) => a + b, 0) / ys.length);
    const dir = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys) ? 'แนวตะวันออก-ตก' : 'แนวเหนือ-ใต้';
    list.push({ id: `${bx},${by},${tiles[0]}`, tiles, x: cx, y: cy, name: `ถนน${dir} ช่วง ${bx + 1}-${by + 1}`, main: tiles.some(t => R.main.has(t)) });
  }
  list.sort((a, b) => a.y - b.y || a.x - b.x);
  segMemo = { key, R, list };
  return list;
}
export function segmentLevel(s, seg) { const P = ensurePaving(s); return Math.min(...seg.tiles.map(t => P[t] || 0)); }
export function paveCost(s, seg, level) { const P = ensurePaving(s); return seg.tiles.reduce((n, t) => n + Math.max(0, PAVE[level].cost - (P[t] ? PAVE[P[t]].cost : 0)), 0); }
/** Pave one road section to `level` (pays only the difference). Leader only, treasury only. */
export function paveSegment(s, segId, level, isLeader) {
  const seg = roadSegments(s).find(g => g.id === segId), L = PAVE[level];
  if (!seg || !L) return { ok: false, msg: 'ไม่พบถนนช่วงนี้' };
  if (!isLeader) return { ok: false, msg: 'ต้องเป็นผู้นำถึงจะอนุมัติงบปูถนนได้' };
  if (tierOf(s) < L.tier) return { ok: false, msg: `${L.th}ทำได้เมื่อพื้นที่เป็นระดับ ${L.tier} (${TIERS[L.tier - 1].th})` };
  if (segmentLevel(s, seg) >= level) return { ok: false, msg: `ช่วงนี้เป็น${PAVE[segmentLevel(s, seg)].th}แล้ว` };
  const cost = paveCost(s, seg, level);
  if ((s.town.treasury || 0) < cost) return { ok: false, msg: `งบคลังไม่พอ (ต้องใช้ ${cost} มี ${Math.floor(s.town.treasury || 0)})` };
  const P = ensurePaving(s); s.town.treasury -= cost;
  for (const t of seg.tiles) P[t] = Math.max(P[t] || 0, level);
  s.town.pavedVer = (s.town.pavedVer || 0) + 1;
  if (s.leadership?.isLeader) s.leadership.record = (s.leadership.record || 0) + Math.min(3, Math.round(cost / 150)); // visible public works count for the record
  return { ok: true, msg: `${L.icon} ปู${seg.name}เป็น${L.th} ${seg.tiles.length} ช่อง ใช้งบ ${cost}`, cost };
}
/** Share of the village roads that are paved (0..1) — villagers like good roads. */
export function pavedShare(s) { const segs = roadSegments(s); let n = 0, p = 0; const P = ensurePaving(s); for (const g of segs) for (const t of g.tiles) { n++; if (P[t]) p++; } return n ? p / n : 0; }
/** Test mode / migration: pave every village road to the best level the area allows. */
export function paveAll(s, level = null) { const P = ensurePaving(s), lv = level ?? Math.min(2, tierOf(s) - 1); if (lv <= 0) return; for (const g of roadSegments(s)) for (const t of g.tiles) P[t] = Math.max(P[t] || 0, lv); s.town.pavedVer = (s.town.pavedVer || 0) + 1; }

/** Paved city blocks (tile keys) of the unlocked city levels. */
export function pavedTiles(s) { const t = tierOf(s); return t >= 3 ? new Set(cityPlan(t, ART10).paved) : EMPTY; }
const EMPTY = new Set();
/** v0.18 ground under buildings: a yard 1 tile wider than the sprite's base, so the art's own base sits on matching ground
 *  and the transition to grass is the soft autotile edge instead of the sprite's hard rectangle. Tile keys "x,y". */
let yardMemo = { key: '', set: EMPTY };
export function yardTiles(s) {
  const t = tierOf(s), key = `${t}:${WORLD.version}:${WORLD.custom?.id || ''}:${(s.placed || []).filter(p => p.type === 'cottage' || p.type === 'workshop').map(p => p.tx + '.' + p.ty + '.' + p.level + p.status).join(',')}:${Object.values(s.publicSites || {}).map(o => o.status).join('')}`;
  if (yardMemo.key === key) return yardMemo.set;
  const out = new Set(), rect = (x0, y0, x1, y1) => { for (let y = Math.floor(y0); y <= Math.floor(y1); y++) for (let x = Math.floor(x0); x <= Math.floor(x1); x++) out.add(x + ',' + y); };
  // v0.29 every building stands on a ground base (owner: "they look dropped on the grass"): dirt yards in the camp/village,
  // paved forecourts from อำเภอ up (terrain.js draws YARD as dirt below stage 2, pavers above) with soft autotile edges
  rect(LEADER_HOUSE.tx - 1, LEADER_HOUSE.ty - 1, LEADER_HOUSE.tx + LEADER_HOUSE.w, LEADER_HOUSE.ty + LEADER_HOUSE.h);
  const town = (s.town?.stage || 0) >= 2; // camp/village: small packed-earth pads; อำเภอ+: paved forecourts and driveways
  for (const id of ['home', 'market', 'hall']) if (s.publicSites?.[id] && s.publicSites[id].status !== 'none') { const r = plotRect(id); if (town) rect(r.tx, r.ty + 1, r.tx + r.w - 1, r.ty + r.h); else rect(r.tx + 1, r.ty + r.h - 3, r.tx + r.w - 2, r.ty + r.h); }
  for (const p of s.placed || []) if ((p.type === 'cottage' || p.type === 'workshop') && (p.level >= 1 || p.status === 'building')) { if (town) rect(p.tx - 1, p.ty, p.tx + 4, p.ty + 3); else rect(p.tx, p.ty + 1, p.tx + 3, p.ty + 3); }
  if (WORLD.custom) for (const m of WORLD.custom.props) {
    if ((m.tier || 1) > t || m.bridge || /^(pl_|rock_|ore_|cp_|pp_|pf_|an_|fence_|crop_)/.test(m.name)) continue; // buildings only (not bushes, lamps, animals)
    const sz = ART10[m.name], w = sz ? Math.max(m.fw, sz[0] * (m.scale || 1) / 16) : m.fw, cx = m.x + m.fw / 2;
    rect(cx - w / 2 - 1, m.y - 1, cx + w / 2, m.y + m.fh);
  }
  if (t >= 3) for (const p of cityPlan(t, ART10).props) if (p.big) { const sz = ART10[p.name] || [64, 64], w = sz[0] / 16; rect(p.x - w / 2 - 1, p.y - Math.min(4, sz[1] / 16 * .3) - 1, p.x + w / 2, p.y + .5); }
  yardMemo = { key, set: out };
  return out;
}
/** Villagers clear trees/rocks standing on the roads of unlocked tiers. Returns how many were removed. */
/** v0.29 when an area opens its forest is cleared, but ~1/4 stays as scattered groves (chop them for wood, or the
 *  leader hires a crew from the treasury — hireClearing). Deterministic per tile so saves agree. */
const gh = (x, y, k) => (((Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(k, 83492791)) >>> 0) % 1000) / 1000;
export const CLEAR_COST = 4; // coins per tree for a hired crew
export const keepsTree = n => gh(Math.floor(n.x / 6), Math.floor(n.y / 6), 7) < .42 && gh(n.x, n.y, 3) < .62; // groves, not lone dots
export function leftoverTrees(s) { if (!WORLD.custom?.tiers) return []; const t = tierOf(s); return TREES.filter(n => n.lockTier && n.lockTier <= t && keepsTree(n) && nodeStatus(s, n) !== 'gone'); }
export function hireClearing(s, isLeader) {
  if (!isLeader) return { ok: false, msg: 'ต้องเป็นผู้นำถึงจะจ้างคนถางป่าได้' };
  const left = leftoverTrees(s), cost = left.length * CLEAR_COST;
  if (!left.length) return { ok: false, msg: 'ไม่มีป่าเหลือในพื้นที่ที่เปิดแล้ว' };
  if ((s.town.treasury || 0) < cost) return { ok: false, msg: `งบคลังไม่พอ (ต้องใช้ ${cost} มี ${Math.floor(s.town.treasury || 0)})` };
  s.town.treasury -= cost; for (const n of left) setNode(s, n.id, 'x');
  return { ok: true, msg: `🪓 จ้างคนถางป่า ${left.length} ต้น · −${cost} จากคลัง`, n: left.length, cost };
}
export function openRoads(s) {
  let n = 0;
  // v0.28 maps with levels: the forest of every area that is now open is cleared (villagers and the development fund) — v0.29 groves stay
  if (WORLD.custom?.tiers) { const t = tierOf(s); for (const node of TREES) if (node.lockTier && node.lockTier <= t && !keepsTree(node) && nodeStatus(s, node) !== 'gone') { setNode(s, node.id, 'x'); n++; } }
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

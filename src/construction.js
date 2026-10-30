// v0.8 construction system: menu -> preview -> validate (area, obstacles, money, materials) -> confirm/cancel
// -> "building" status with progress over GAME time -> finished structure with effects -> upgrades.
// Pure rules: no DOM. The renderer/UI read this state; NPC builders add work through tickConstruction().
import { PROJECTS, canBuild, completeProject, addHistory, logEvent } from './gameState.js';
import { ensureSystems, gainXp } from './systems.js';
import { buildableGround, plotObstacles, CENTER, VILLAGE_RADIUS } from './world.js';
import { SLOT_KINDS, slotAt, openSlots, TIERS, villageRadius, publicUnlocked, publicTier, tierOf } from './villageLayout.js';

/** Placeable private structures. Footprint in tiles. Work is measured in game-minutes of labour. */
export const BUILDINGS = {
  garden:   { name: 'แปลงผัก', icon: '🌱', width: 3, height: 3, wood: 2, stone: 1, coins: 6, work: 60,
              desc: 'ปลูกเมล็ด รอ 1 วันในเกม แล้วเก็บผักไปขาย', levels: [{ yield: 3 }, { yield: 4, wood: 3, stone: 2, coins: 20, work: 120 }, { yield: 5, wood: 5, stone: 3, coins: 40, work: 180 }] },
  bench:    { name: 'ม้านั่งชุมชน', icon: '🪑', width: 2, height: 1, wood: 2, stone: 0, coins: 4, work: 30,
              desc: 'NPC มานั่งพักช่วงเย็น เพิ่มความสุขของหมู่บ้าน', levels: [{ comfort: 1 }, { comfort: 2, wood: 3, stone: 1, coins: 12, work: 40 }] },
  lamp:     { name: 'โคมไฟถนน', icon: '🏮', tier: 2, width: 1, height: 1, wood: 1, stone: 1, coins: 8, work: 20,
              desc: 'ให้แสงยามค่ำ NPC กลับบ้านดึกขึ้น เพิ่มความเจริญ', levels: [{ light: 1 }, { light: 2, wood: 1, stone: 2, coins: 15, work: 30 }] },
  workshop: { name: 'โรงงานงานฝีมือ', icon: '🛠️', tier: 2, width: 4, height: 3, wood: 5, stone: 4, coins: 25, work: 240,
              desc: 'ปลดล็อกสูตรชุดเครื่องมือ งานกะโรงงาน และช่างไม้ NPC มาผลิตแผ่นไม้ส่งตลาด', levels: [{ planksPerHour: 1 }, { planksPerHour: 2, wood: 8, stone: 6, coins: 60, work: 300 }] },
  path:     { name: 'ทางเดินหิน', icon: '🟫', width: 1, height: 1, wood: 0, stone: 1, coins: 0, work: 8, walkable: true,
              desc: 'ปูทางเดินในหมู่บ้าน (เดินผ่านได้) ช่วยให้หมู่บ้านดูเป็นระเบียบ', levels: [{ road: 1 }] },
  cottage:  { name: 'บ้านพักชาวบ้าน', icon: '🏠', width: 4, height: 3, wood: 8, stone: 4, coins: 30, work: 300,
              desc: 'รองรับผู้อยู่อาศัยใหม่ 2 คน หมู่บ้านเติบโตเร็วขึ้น · อัปเกรดบ้านตามยุคของพื้นที่ (บุกเบิก → หมู่บ้าน → อำเภอ → จังหวัด → ประเทศ) · แต่ละแปลงมีขนาดต่างกัน: เล็ก กลาง ใหญ่ หรือบ้านทำร้านค้า',
              // house level = the era of the house (1 บุกเบิก … 5 ประเทศ); each era unlocks when the area reaches it
              // v0.24: house level = wealth tier, not era — whoever can pay may build a bigger house at any time (in-game money only)
              levels: [{ residents: 2 }, { residents: 3, wood: 10, stone: 6, coins: 120, work: 360, stage: 1 }, { residents: 4, wood: 14, stone: 12, coins: 350, work: 400, stage: 2 },
                { residents: 5, wood: 18, stone: 20, coins: 800, work: 450, stage: 3 }, { residents: 6, wood: 24, stone: 30, coins: 1600, work: 500, stage: 4 }] }, // v0.27 house level N opens with area level N (and still costs money)
  fence:    { name: 'รั้ว', icon: '🚧', width: 1, height: 1, wood: 1, stone: 0, coins: 1, work: 6,
              desc: 'กั้นแนวที่ดิน วางต่อกันเป็นแนวได้ · อัปเกรดวัสดุ ไม้ไผ่ → ไม้ → หิน → ปูน → เหล็ก',
              levels: [{ material: 'bamboo' }, { material: 'wood', wood: 1, coins: 2, work: 6 }, { material: 'stone', stone: 2, coins: 3, work: 8 },
                { material: 'plaster', stone: 2, coins: 6, work: 10, stage: 1 }, { material: 'iron', stone: 1, coins: 12, work: 12, stage: 2 }] },
};
// Public sites are fixed in the world (story). Costs come from PROJECTS (wood/stone); labour defined here.
export const PUBLIC_WORK = { home: 180, farm: 120, market: 240, hall: 360 };
// Levels 1..5 = the five building eras (art: assets/v10/<kind>_e<level>_s<stage>). Eras 4-5 also need the
// village to have grown (town stage), so a rich player can't jump to modern buildings in a pioneer camp.
export const PUBLIC_LEVELS = {
  home:   [{ residents: 4 }, { residents: 6, wood: 6, stone: 4, coins: 40, work: 240 }, { residents: 8, wood: 10, stone: 8, coins: 80, work: 300 },
           { residents: 10, wood: 14, stone: 14, coins: 140, work: 360, stage: 1 }, { residents: 12, wood: 18, stone: 24, coins: 240, work: 420, stage: 2 }],
  farm:   [{ foodPerHour: 1 }, { foodPerHour: 2, wood: 5, stone: 3, coins: 30, work: 180 }, { foodPerHour: 3, wood: 8, stone: 5, coins: 60, work: 240 }],
  market: [{ shoppers: 1 }, { shoppers: 2, wood: 8, stone: 5, coins: 50, work: 300 }, { shoppers: 3, wood: 12, stone: 8, coins: 90, work: 360 },
           { shoppers: 4, wood: 16, stone: 14, coins: 160, work: 420, stage: 1 }, { shoppers: 5, wood: 20, stone: 26, coins: 280, work: 480, stage: 2 }],
  hall:   [{ treasuryPerDay: 6 }, { treasuryPerDay: 12, wood: 10, stone: 10, coins: 80, work: 420 }, { treasuryPerDay: 18, wood: 14, stone: 14, coins: 120, work: 480 },
           { treasuryPerDay: 24, wood: 18, stone: 20, coins: 200, work: 540, stage: 1 }, { treasuryPerDay: 32, wood: 24, stone: 30, coins: 320, work: 600, stage: 2 }],
};
export const STAGE_NAMES = ['ค่ายบุกเบิก', 'หมู่บ้าน', 'อำเภอ', 'จังหวัด', 'ประเทศ'];
/** Why an upgrade entry is locked by village growth ('' = not locked). */
export function stageLock(s, next) { return next?.stage && (s.town?.stage || 0) < next.stage ? `ต้องพัฒนาพื้นที่เป็น "${STAGE_NAMES[next.stage]}" ก่อน` : ''; }
export const BUILD_ZONE = { cx: CENTER.x, cy: CENTER.y, r: VILLAGE_RADIUS }; // village land (circle); ground must be cleared
export const HELP_ENERGY = 8, HELP_WORK = 45;

export function nowMinutes(s) { return ((s.day - 1) * 86400 + s.gameTime) / 60; }

export function ensureConstruction(s) {
  ensureSystems(s);
  s.publicSites = s.publicSites || {};
  for (const id of Object.keys(PROJECTS)) {
    const cur = s.publicSites[id];
    if (!cur) s.publicSites[id] = s.projects?.[id] ? { status: 'done', level: 1, work: PUBLIC_WORK[id], workNeeded: PUBLIC_WORK[id] } : { status: 'none', level: 0, work: 0, workNeeded: PUBLIC_WORK[id] };
  }
  for (const p of s.placed) {
    if (!p.status) { p.status = 'done'; p.level = 1; p.work = BUILDINGS[p.type]?.work || 0; p.workNeeded = p.work; }
    if (p.plantedAt === undefined) p.plantedAt = null;
  }
  return s;
}

const fail = reason => ({ ok: false, reason, msg: reason });
const okr = msg => ({ ok: true, msg, reason: msg });

function costText(c) { return [c.coins ? `${c.coins} เหรียญ` : '', c.wood ? `${c.wood} ไม้` : '', c.stone ? `${c.stone} หิน` : ''].filter(Boolean).join(' · ') || 'ไม่มีค่าใช้จ่าย'; }
// v0.26 public works are paid by the TREASURY (coins); the materials still come from the player (the leader hands them in)
export function hasResources(s, c, fromTreasury = false) { return ((fromTreasury ? s.town?.treasury || 0 : s.player.coins) >= (c.coins || 0)) && (s.player.wood >= (c.wood || 0)) && (s.player.stone >= (c.stone || 0)); }
function pay(s, c, fromTreasury = false) { // never allow negatives: caller checks hasResources first
  if (!hasResources(s, c, fromTreasury)) return false;
  if (fromTreasury) s.town.treasury -= c.coins || 0; else s.player.coins -= c.coins || 0;
  s.player.wood -= c.wood || 0; s.player.stone -= c.stone || 0; return true;
}
export function missingText(s, c) {
  const m = [];
  if (s.player.coins < (c.coins || 0)) m.push(`เหรียญขาด ${(c.coins || 0) - s.player.coins}`);
  if (s.player.wood < (c.wood || 0)) m.push(`ไม้ขาด ${(c.wood || 0) - s.player.wood}`);
  if (s.player.stone < (c.stone || 0)) m.push(`หินขาด ${(c.stone || 0) - s.player.stone}`);
  return m.join(' · ');
}

/** Footprint overlap with another private structure. */
export function occupiedBy(s, tx, ty, ignoreUid = null) {
  return s.placed.find(p => p.uid !== ignoreUid && BUILDINGS[p.type] && tx >= p.tx && tx < p.tx + BUILDINGS[p.type].width && ty >= p.ty && ty < p.ty + BUILDINGS[p.type].height) || null;
}

/**
 * Validate a placement. isBlocked(tx,ty) is the world collision (roads/water/houses/trees/public sites).
 * extraBlocked(tx,ty) lets the UI reject tiles under the player or NPCs.
 */
export function canPlace(s, type, tx, ty, isBlocked, extraBlocked = () => false) {
  ensureConstruction(s);
  const b = BUILDINGS[type];
  if (!b) return { ok: false, reason: 'ไม่มีแบบอาคารนี้', code: 'type' };
  if (b.tier && tierOf(s) < b.tier) return { ok: false, reason: `${b.name}ปลดล็อกเมื่อพื้นที่เป็นระดับ ${b.tier} (${STAGE_NAMES[b.tier - 1]})`, code: 'tier' };
  if (!Number.isInteger(tx) || !Number.isInteger(ty)) return { ok: false, reason: 'ตำแหน่งไม่ถูกต้อง', code: 'zone' };
  // v0.12 layout: houses and workshops go on the slots of the village plan; other things must keep slots free
  const needSlot = SLOT_KINDS.includes(type);
  if (needSlot && !slotAt(s, type, tx, ty)) {
    const later = TIERS.some(T => T.tier > tierOf(s) && T.slots.some(x => x.kind === type));
    return { ok: false, reason: `${b.name}สร้างได้เฉพาะบนแปลงตามผังหมู่บ้าน (หมุดสีเหลือง)${later ? ' · แปลงเพิ่มเมื่อยกระดับหมู่บ้าน' : ''}`, code: 'slot' };
  }
  if (type === 'cottage') { // house plots belong to whoever claimed them (src/housing.js); you build only your own
    const sl = slotAt(s, type, tx, ty), h = s.homes?.[sl.id], mine = s.homes && Object.entries(s.homes).find(([, v]) => v.owner === 'player');
    if (h && h.owner !== 'player') return { ok: false, reason: `แปลงนี้เป็นของ${h.name} — เขาเก็บเงินสร้างบ้านเอง`, code: 'owned' };
    if (!h) return { ok: false, reason: mine ? 'มึงมีที่ดินบ้านแล้ว 1 แปลง สร้างได้เฉพาะแปลงของตัวเอง' : 'จองที่ดินแปลงนี้ก่อน (ค่าโอน 10 เหรียญ)', code: 'claim' };
  }
  if (!needSlot) for (const T of TIERS) for (const x of T.slots) {
    if (x.kind === 'public') continue;
    const w = BUILDINGS[x.kind].width, h = BUILDINGS[x.kind].height;
    if (tx < x.tx + w && tx + b.width > x.tx && ty < x.ty + h && ty + b.height > x.ty) return { ok: false, reason: `ที่ดินนี้จองไว้สำหรับ${x.name}ตามผังหมู่บ้าน`, code: 'slot' };
  }
  const R = villageRadius(s);
  for (let y = ty; y < ty + b.height; y++) for (let x = tx; x < tx + b.width; x++) if (Math.hypot(x - CENTER.x, y - CENTER.y) > R) return { ok: false, reason: `ต้องอยู่ในเขตหมู่บ้าน (รัศมี ${R} ช่อง — ขยายได้เมื่อยกระดับ)`, code: 'zone' };
  const WHY = { zone: 'ต้องอยู่ในที่ดินหมู่บ้าน (วงกลมสีเขียว)', reserved: 'ลานกลางบ้านผู้นำต้องเว้นว่าง', plot: 'ทับที่ดินโครงการสาธารณะ', stump: 'ยังมีตอไม้ ต้องขุดตอออกก่อน', blocked: 'ทับต้นไม้ หิน น้ำ หรืออาคาร — ถางป่าก่อน' };
  for (let y = ty; y < ty + b.height; y++) for (let x = tx; x < tx + b.width; x++) {
    const g = buildableGround(x, y, s);
    if (!g.ok) return { ok: false, reason: WHY[g.code] || 'วางไม่ได้', code: g.code };
    if (isBlocked(x, y)) return { ok: false, reason: WHY.blocked, code: 'blocked' };
    if (occupiedBy(s, x, y)) return { ok: false, reason: 'มีสิ่งปลูกสร้างอยู่แล้ว', code: 'occupied' };
    if (extraBlocked(x, y)) return { ok: false, reason: 'มีคนยืนอยู่ตรงนั้น', code: 'actor' };
  }
  if (!hasResources(s, b)) return { ok: false, reason: `ทรัพยากรไม่พอ: ${missingText(s, b)}`, code: 'cost' };
  return { ok: true, reason: `วางได้ · ใช้ ${costText(b)}`, code: 'ok' };
}

export function placeBuilding(s, type, tx, ty, isBlocked, extraBlocked) {
  const r = canPlace(s, type, tx, ty, isBlocked, extraBlocked);
  if (!r.ok) return { ok: false, msg: r.reason };
  const b = BUILDINGS[type];
  pay(s, b);
  const uid = `p${s.day}_${Math.floor(s.gameTime)}_${s.placed.length}`;
  const style = type === 'cottage' ? Object.values(s.homes || {}).find(h => h.owner === 'player')?.style : undefined; // design chosen before building
  s.placed.push({ uid, type, tx, ty, owner: type === 'cottage' ? 'player' : undefined, style, plantedAt: null, status: 'building', level: 0, work: 0, workNeeded: b.work, startedAt: nowMinutes(s) });
  gainXp(s, 4);
  logEvent(s, `เริ่มก่อสร้าง${b.name}`);
  return { ok: true, msg: `เริ่มก่อสร้าง${b.name} · ใช้เวลาประมาณ ${Math.round(b.work / 60 * 10) / 10} ชม.ในเกม`, uid };
}

/** Start a fixed public project (pays materials now; finishes after labour). */
export function startPublic(s, id) {
  ensureConstruction(s);
  const site = s.publicSites[id];
  if (!site) return { ok: false, msg: 'ไม่พบโครงการ' };
  if (site.status === 'building') return { ok: false, msg: 'กำลังก่อสร้างอยู่' };
  if (!publicUnlocked(s, id)) return { ok: false, msg: `ปลดล็อกเมื่อยกระดับหมู่บ้านเป็นระดับ ${publicTier(id)}` };
  const can = canBuild(s, id);
  if (!can.ok) return { ok: false, msg: can.reason };
  const obstacles = plotObstacles(s, id);
  if (obstacles.length) return { ok: false, msg: `ต้องถางที่ดินก่อน: ยังมีต้นไม้/ตอ/หิน ${obstacles.length} จุดในหมุด` };
  const p = PROJECTS[id];
  s.player.wood -= p.wood; s.player.stone -= p.stone;
  Object.assign(site, { status: 'building', level: 0, work: 0, workNeeded: PUBLIC_WORK[id], startedAt: nowMinutes(s) });
  gainXp(s, 10);
  logEvent(s, `เริ่มก่อสร้าง${p.name}`);
  return { ok: true, msg: `เริ่มก่อสร้าง${p.name}! ช่างและชาวบ้านจะช่วยกันสร้าง` };
}

export function upgradeCost(kind, type, level) {
  const table = kind === 'public' ? PUBLIC_LEVELS[type] : BUILDINGS[type]?.levels;
  return table?.[level] || null; // level is current level (1-based) -> next entry
}

export function upgradeStructure(s, ref) {
  ensureConstruction(s);
  const t = findStructure(s, ref);
  if (!t) return { ok: false, msg: 'ไม่พบสิ่งปลูกสร้าง' };
  if (t.obj.status !== 'done') return { ok: false, msg: 'ต้องสร้างให้เสร็จก่อน' };
  const next = upgradeCost(t.kind, t.type, t.obj.level);
  if (!next) return { ok: false, msg: 'อัปเกรดสูงสุดแล้ว' };
  const lock = stageLock(s, next);
  if (lock) return { ok: false, msg: lock };
  const pub = t.kind === 'public';
  if (pub && !(s.leadership?.isLeader || s.election?.leader === 'player')) return { ok: false, msg: 'อาคารสาธารณะใช้งบคลัง ต้องเป็นผู้นำถึงจะอนุมัติอัปเกรดได้' };
  if (!hasResources(s, next, pub)) return { ok: false, msg: pub && (s.town?.treasury || 0) < (next.coins || 0) ? `งบคลังไม่พอ (ต้องใช้ ${next.coins} มี ${Math.floor(s.town?.treasury || 0)})` : `ทรัพยากรไม่พอ: ${missingText(s, next)}` };
  pay(s, next, pub);
  Object.assign(t.obj, { status: 'building', upgradingTo: t.obj.level + 1, work: 0, workNeeded: next.work, startedAt: nowMinutes(s) });
  return { ok: true, msg: `เริ่มอัปเกรด${t.name}เป็นระดับ ${t.obj.level + 1}` };
}

/** Player lends a hand: costs energy (never money) and adds labour. */
export function helpConstruction(s, ref) {
  ensureConstruction(s);
  const t = findStructure(s, ref);
  if (!t || t.obj.status !== 'building') return { ok: false, msg: 'ไม่มีงานก่อสร้างตรงนี้' };
  if (s.player.stamina < HELP_ENERGY) return { ok: false, msg: 'พลังงานไม่พอ พักหรือกินอาหารก่อน' };
  s.player.stamina -= HELP_ENERGY;
  gainXp(s, 4);
  const done = addWork(s, t, HELP_WORK);
  return { ok: true, msg: done ? `${t.name} เสร็จแล้ว!` : `ช่วยสร้าง${t.name} +${HELP_WORK} นาทีงาน (${Math.floor(progressOf(t.obj) * 100)}%)` };
}

export function findStructure(s, ref) {
  if (s.publicSites?.[ref]) return { kind: 'public', type: ref, id: ref, obj: s.publicSites[ref], name: PROJECTS[ref].name };
  const p = s.placed.find(x => x.uid === ref);
  return p ? { kind: 'private', type: p.type, id: p.uid, obj: p, name: BUILDINGS[p.type]?.name || p.type } : null;
}
export function progressOf(obj) { return obj.workNeeded ? Math.max(0, Math.min(1, obj.work / obj.workNeeded)) : 1; }

function addWork(s, t, amount) {
  const o = t.obj;
  o.work = Math.min(o.workNeeded, o.work + amount);
  if (o.work < o.workNeeded) return false;
  finish(s, t);
  return true;
}
function finish(s, t) {
  const o = t.obj;
  const upgrading = !!o.upgradingTo;
  o.status = 'done';
  o.level = upgrading ? o.upgradingTo : 1;
  delete o.upgradingTo;
  if (t.kind === 'public' && !upgrading) completeProject(s, t.type);
  else addHistory(s, upgrading ? `อัปเกรด${t.name}เป็นระดับ ${o.level}` : `${t.name}สร้างเสร็จ`);
  gainXp(s, t.kind === 'public' ? 18 : 8);
  if (t.kind === 'public' && s.leadership?.isLeader) s.leadership.record = (s.leadership.record || 0) + 3; // v0.26 track record: public works delivered in office
  s.lastCompleted = { id: t.id, name: t.name, at: nowMinutes(s) };
}

/** Called by the game loop with game-minutes elapsed. builders: {[structureId]: extra labour multiplier}. */
export function tickConstruction(s, gameMinutes, builders = {}) {
  ensureConstruction(s);
  const finished = [];
  if (!(gameMinutes > 0)) return finished;
  const all = [...Object.keys(s.publicSites).map(id => findStructure(s, id)), ...s.placed.map(p => findStructure(s, p.uid))];
  for (const t of all) {
    if (!t || t.obj.status !== 'building') continue;
    const rate = 1 + (builders[t.id] || 0); // 1 = the owner's hired help; NPC builders add more
    if (addWork(s, t, gameMinutes * rate)) finished.push(t.name);
  }
  return finished;
}

export function activeSites(s) {
  ensureConstruction(s);
  return [...Object.keys(s.publicSites).filter(id => s.publicSites[id].status === 'building'), ...s.placed.filter(p => p.status === 'building').map(p => p.uid)];
}

export function structureLevel(s, kind, type) {
  ensureConstruction(s);
  if (kind === 'public') { const o = s.publicSites[type]; return o?.status === 'done' || o?.upgradingTo ? o.level : 0; }
  return s.placed.filter(p => p.type === type && (p.status === 'done' || p.upgradingTo)).reduce((m, p) => Math.max(m, p.level), 0);
}
export function countBuilt(s, type) { ensureConstruction(s); return s.placed.filter(p => p.type === type && p.level >= 1).length; }

export function publicEffect(s, id, key) {
  const lv = structureLevel(s, 'public', id);
  return lv ? PUBLIC_LEVELS[id][lv - 1][key] || 0 : 0;
}

export function gardenYield(p) { return BUILDINGS.garden.levels[Math.max(0, (p.level || 1) - 1)].yield; }
export { costText };

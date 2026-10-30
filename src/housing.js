// v0.12 "everyone wants their own home": house slots in the village plan belong to whoever claims them.
// The player claims ONE plot ("บ้านของฉัน") and builds it with their own money/materials. NPC villagers (stand-ins
// for other online players) claim plots too, save part of their daily wage and build their own houses over time.
// s.homes = { [slotId]: { owner: 'player' | npcId, name, savings, claimedDay } }
import { openSlots, slotState, slotObstacles } from './villageLayout.js';
import { BUILDINGS, ensureConstruction, nowMinutes } from './construction.js';
import { allNpcDefs } from './npcs.js';
import { setNode } from './world.js';
import { addHistory } from './gameState.js';

export const CLAIM_FEE = 10;          // in-game coins (land transfer fee to the village treasury)
export const NPC_DAILY_SAVING = 12;   // coins an NPC household puts aside per day from its wage
const HOUSE = BUILDINGS.cottage;
const NO_HOME = new Set(['mentor']);  // the mentor lives in the leader's house

export function ensureHomes(s) { s.homes = s.homes && typeof s.homes === 'object' ? s.homes : {}; return s.homes; }
export function houseSlots(s) { return openSlots(s).filter(x => x.kind === 'cottage'); }
export function ownerOf(s, slotId) { return ensureHomes(s)[slotId]?.owner || null; }
export function myHome(s) { const H = ensureHomes(s); const id = Object.keys(H).find(k => H[k].owner === 'player'); return id ? houseSlots(s).find(x => x.id === id) || null : null; }

export function claimPlot(s, slotId) {
  const H = ensureHomes(s), slot = houseSlots(s).find(x => x.id === slotId);
  if (!slot) return { ok: false, msg: 'แปลงนี้ยังไม่เปิดในผังระดับนี้' };
  if (H[slotId]) return { ok: false, msg: `แปลงนี้มีเจ้าของแล้ว (${H[slotId].name})` };
  if (myHome(s)) return { ok: false, msg: 'มึงมีที่ดินบ้านแล้ว 1 แปลง (คนละ 1 แปลง)' };
  if (slotState(s, slot).state !== 'empty') return { ok: false, msg: 'แปลงนี้มีสิ่งปลูกสร้างอยู่แล้ว' };
  if (s.player.coins < CLAIM_FEE) return { ok: false, msg: `ต้องมีค่าโอนที่ดิน ${CLAIM_FEE} เหรียญ` };
  s.player.coins -= CLAIM_FEE; s.town.treasury += CLAIM_FEE;
  H[slotId] = { owner: 'player', name: s.character?.name || s.player.name, savings: 0, claimedDay: s.day };
  addHistory(s, `จองที่ดิน "${slot.name}" เป็นบ้านของตัวเอง`);
  return { ok: true, msg: `🏠 ได้ที่ดิน "${slot.name}" แล้ว! ถางต้นไม้ในแปลงแล้วสร้างบ้านของตัวเอง (เมนูก่อสร้าง)` };
}

/** Start the house on a slot for an NPC owner (pays from the household savings, villagers clear the plot). */
export function buildHouseFor(s, slotId, owner = null) {
  ensureConstruction(s);
  const H = ensureHomes(s), slot = houseSlots(s).find(x => x.id === slotId); if (!slot) return false;
  if (owner) H[slotId] = H[slotId] || { owner, name: owner, savings: HOUSE.coins, claimedDay: s.day };
  // villagers clear the plot plus a 1-tile yard around it (tidy rows of houses, no trees growing through roofs)
  for (const n of slotObstacles(s, { tx: slot.tx - 1, ty: slot.ty - 2 }, HOUSE.width + 2, HOUSE.height + 3)) setNode(s, n.id, 'x');
  const uid = `h_${slotId}_${s.day}`;
  s.placed.push({ uid, type: 'cottage', tx: slot.tx, ty: slot.ty, owner: H[slotId].owner, plantedAt: null, status: 'building', level: 0, work: 0, workNeeded: HOUSE.work, startedAt: nowMinutes(s) });
  H[slotId].savings = Math.max(0, (H[slotId].savings || 0) - HOUSE.coins);
  return true;
}

/** Once per game day: homeless NPCs claim free plots, households save, and start building when they can afford it. */
export function homesDay(s) {
  const H = ensureHomes(s), events = [];
  const owners = new Set(Object.values(H).map(h => h.owner));
  const free = () => houseSlots(s).filter(x => !H[x.id] && slotState(s, x).state === 'empty');
  for (const npc of allNpcDefs(s)) {
    if (NO_HOME.has(npc.id) || owners.has(npc.id)) continue;
    const slot = free()[0]; if (!slot) break;
    H[slot.id] = { owner: npc.id, name: npc.name, savings: 0, claimedDay: s.day }; owners.add(npc.id);
    events.push(`${npc.name} จองที่ดิน "${slot.name}" ไว้สร้างบ้าน`);
  }
  for (const slot of houseSlots(s)) {
    const h = H[slot.id]; if (!h || h.owner === 'player' || slotState(s, slot).state !== 'empty') continue;
    h.savings = (h.savings || 0) + NPC_DAILY_SAVING;
    if (h.savings >= HOUSE.coins) { buildHouseFor(s, slot.id); events.push(`🏗️ ${h.name} เก็บเงินครบ เริ่มสร้างบ้านของตัวเองแล้ว`); }
  }
  // households also renovate their house into the current era of the area, once they have saved enough
  const era = (s.town?.stage || 0) + 1;
  for (const p of s.placed) {
    if (p.type !== 'cottage' || p.owner === 'player' || p.status !== 'done' || p.level >= era) continue;
    const h = Object.values(H).find(x => x.owner === p.owner), next = HOUSE.levels[p.level];
    if (!h || !next) continue;
    h.savings = (h.savings || 0) + NPC_DAILY_SAVING;
    if (h.savings >= next.coins) { h.savings -= next.coins; Object.assign(p, { status: 'building', upgradingTo: p.level + 1, work: 0, workNeeded: next.work }); events.push(`🔨 ${h.name} รีโนเวทบ้านเป็นแบบยุค${['', 'บุกเบิก', 'หมู่บ้าน', 'อำเภอ', 'จังหวัด', 'ประเทศ'][p.level + 1]}`); }
  }
  for (const e of events) addHistory(s, e);
  return events;
}
export const HOUSE_COST = HOUSE;

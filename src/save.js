// Save/load with migrations. Same localStorage key as v0.3-v0.5 so old progress is kept.
// v0.7 (single-file build) used a different key; its character is imported once if present.
import { SAVE_KEY, createInitialState, safeLoad } from './gameState.js';
import { ensureSystems } from './systems.js';
import { ensureConstruction } from './construction.js';
import { ensureTown } from './npcs.js';
import { ensureJobs } from './jobs.js';
import { ensureQuests } from './quests.js';
import { ensureShop } from './shop.js';
import { normalizeAppearance, validateName, fromV07Character } from './character/model.js';
import { ensureWorld, plotObstacles, setNode, SPAWN, DEFAULT_SEED, nodeOnTile } from './world.js';
import { BUILDINGS } from './construction.js';
import { ensureLeadership } from './leadership.js';
import { computeStage } from './progression.js';
import { openRoads, paveAll } from './villageLayout.js';
import { clearPropTiles } from './villageProps.js';
import { openSlots as openSlotsV } from './villageLayout.js';

export const SCHEMA = 4;
export const V07_KEY = 'v2n-inline-06';
export const BACKUP_KEY = SAVE_KEY + '-backup-schema1';

/** Bring any v0.3–v0.8 save object up to schema 2 without losing progress. */
export function migrate(raw) {
  let s = raw && typeof raw === 'object' ? raw : createInitialState();
  if (s.schema === 1 || s.schema === undefined) {
    s.schema = 1;
    s = safeLoad(JSON.stringify(s));
  }
  const preForest = !s.world; // v0.3–v0.8 used the painted map; v0.9 starts in a generated forest
  ensureSystems(s); ensureConstruction(s); ensureTown(s); ensureJobs(s); ensureQuests(s); ensureShop(s);
  ensureWorld(s);
  const hadLeader = s.election?.leader === 'player'; ensureLeadership(s); if (preForest && !hadLeader && s.election?.completed) { /* old save lost a mock election: keep founder status anyway */ }
  if (preForest && (s.day > 1 || s.placed.length || Object.values(s.projects).some(Boolean) || s.player.coins !== 35)) {
    // move an old village into the forest region: keep progress, refund private buildings, clear finished plots
    const refund = { coins: 0, wood: 0, stone: 0 };
    for (const p of s.placed) { const b = BUILDINGS[p.type]; if (b) { refund.coins += b.coins; refund.wood += b.wood; refund.stone += b.stone; } }
    s.player.coins += refund.coins; s.player.wood += refund.wood; s.player.stone += refund.stone;
    s.placed = [];
    for (const id of Object.keys(s.publicSites)) if (s.publicSites[id].status !== 'none') for (const n of plotObstacles(s, id)) setNode(s, n.id, 'x');
    s.player.x = SPAWN.x; s.player.y = SPAWN.y;
    s.job = null; if (s.deliveries) s.deliveries.holding = false;
    s.migrationNotes = [`ย้ายหมู่บ้านเดิมเข้าป่าบุกเบิก v0.9: เก็บเงิน/ของ/เลเวล/โครงการไว้ทั้งหมด${refund.coins + refund.wood + refund.stone ? ` คืนค่าอาคารส่วนตัว (🪙${refund.coins} 🪵${refund.wood} 🪨${refund.stone}) ให้สร้างใหม่ในที่ดินป่า` : ''}`];
  }
  void DEFAULT_SEED;
  // v0.12 village plan: the area level is explicit (leader upgrades it). Old saves keep what they had grown into
  // (capped at หมู่บ้าน, the highest plan that exists), new games start as a pioneer camp. Plan roads are opened.
  if (!Number.isInteger(s.town.stage)) s.town.stage = Math.min(1, computeStage(s));
  s.town.stage = Math.max(0, Math.min(5, s.town.stage));
  if (s.world.relaid) { // v0.18 re-laid map: re-clear what is built, put the player back at the village
    // v0.25 street plan moved the plots: every house follows its owner's plot, workshops follow their slot
    const OLD = { '24,57': 'h0', '29,57': 'h1', '34,57': 'h2', '39,57': 'h7', '23,52': 'h8', '28,52': 'h9', '46,38': 'h10', '51,38': 'h11', '52,62': 'h3', '29,38': 'h4', '39,61': 'h5', '19,57': 'h6', '49,34': 'w1' };
    const slots = openSlotsV(s), byId = Object.fromEntries(slots.map(x => [x.id, x]));
    for (const p of s.placed || []) {
      if (!['cottage', 'workshop'].includes(p.type) || slots.some(x => x.kind === p.type && x.tx === p.tx && x.ty === p.ty)) continue;
      const own = p.type === 'cottage' && Object.entries(s.homes || {}).find(([id, h]) => h.owner === p.owner && byId[id]);
      const to = own ? byId[own[0]] : byId[OLD[p.tx + ',' + p.ty]];
      if (to && !(s.placed || []).some(q => q !== p && q.tx === to.tx && q.ty === to.ty)) { p.tx = to.tx; p.ty = to.ty; }
    }
    delete s.world.relaid; s.town.roadsOpened = 0; s.player.x = SPAWN.x; s.player.y = SPAWN.y;
    for (const id of Object.keys(s.publicSites || {})) if (s.publicSites[id].status !== 'none') for (const n of plotObstacles(s, id)) setNode(s, n.id, 'x');
    for (const p of s.placed || []) for (let y = p.ty - 2; y < p.ty + 4; y++) for (let x = p.tx - 1; x < p.tx + 6; x++) { const n = nodeOnTile(x, y); if (n) setNode(s, n.id, 'x'); }
    (s.migrationNotes = s.migrationNotes || []).push('v0.18 แผนที่ใหม่ตามผังต้นแบบ: เก็บเงิน ของ อาคาร และความคืบหน้าไว้ทั้งหมด ป่าถูกวางใหม่');
  }
  if (s.town.roadsOpened !== 2) { openRoads(s); clearPropTiles(s); s.town.roadsOpened = 2; }
  if (!s.town.paved && (s.town.stage || 0) >= 1) paveAll(s); // v0.27 roads are paved by the leader now; older towns keep the roads they already had
  // money/resources must never be negative (v0.5 had paths that could not enforce this)
  for (const k of ['coins', 'wood', 'stone', 'knowledge', 'civic']) s.player[k] = Math.max(0, Math.floor(Number(s.player[k]) || 0));
  s.player.stamina = Math.max(0, Math.min(100, Number(s.player.stamina) || 0));
  for (const k of Object.keys(s.inventory)) s.inventory[k] = Math.max(0, Math.floor(Number(s.inventory[k]) || 0));
  s.town.treasury = Math.max(0, s.town.treasury);
  // character
  if (s.character && typeof s.character === 'object') {
    const v = validateName(s.character.name);
    s.character = v.ok ? { name: v.name, lang: s.character.lang === 'en' ? 'en' : 'th', appearance: normalizeAppearance(s.character.appearance, allUnlocked(s)), created: true } : null;
  } else s.character = null;
  if (s.character) s.player.name = s.character.name;
  s.schema = SCHEMA;
  return s;
}

export function allUnlocked(s) {
  const fromShop = (s.entitlements || []).map(e => ({ outfit_festival: 'festival', outfit_sailor: 'sailor', outfit_night: 'night', supporter_founder: 'festival' })[e.sku]).filter(Boolean);
  const role = [];
  if (s.civilService?.examPassed) role.push('civil');
  if (s.election?.leader === 'player') role.push('leader');
  return [...new Set([...(s.unlockedOutfits || []), ...fromShop, ...role])];
}

/** Load from a Storage-like object. Returns {state, notes[]} — notes explain migrations to the player. */
export function loadGame(storage) {
  const notes = [];
  let text = null;
  try { text = storage.getItem(SAVE_KEY); } catch { notes.push('เบราว์เซอร์ไม่อนุญาตให้อ่านเซฟ (โหมดส่วนตัว/ไฟล์ในเครื่อง) — เล่นได้แต่อาจไม่บันทึก'); }
  let parsed = null;
  if (text) { try { parsed = JSON.parse(text); } catch { notes.push('ไฟล์เซฟเสียหาย เริ่มเกมใหม่ (ไฟล์เดิมเก็บสำรองไว้)'); try { storage.setItem(SAVE_KEY + '-corrupt', text); } catch { /* ignore */ } } }
  if (parsed && parsed.schema === 1) {
    try { storage.setItem(BACKUP_KEY, text); } catch { /* ignore */ }
    notes.push('อัปเกรดเซฟจาก v0.5 แล้ว (สำรองไฟล์เดิมไว้)');
  }
  const state = migrate(parsed || createInitialState());
  if (state.migrationNotes) { notes.push(...state.migrationNotes); delete state.migrationNotes; }
  if (!state.character) {
    try {
      const v07 = JSON.parse(storage.getItem(V07_KEY) || 'null');
      const c = fromV07Character(v07?.character);
      if (c) { state.character = { ...c, created: true }; state.player.name = c.name; notes.push(`นำตัวละคร "${c.name}" จาก v0.7 มาใช้ต่อ`); }
    } catch { /* no v0.7 save */ }
  }
  return { state, notes, fresh: !parsed };
}

export function saveGame(storage, state) {
  try { storage.setItem(SAVE_KEY, JSON.stringify(state)); return true; } catch { return false; }
}

// "ดูเมืองเต็มระดับ": builds a throw-away copy of the save where a village level is completely finished at its
// highest building era, so the player can see what they are working towards. Never saved, never touches the real state.
import { deepClone } from './gameState.js';
import { ensureWorld, setNode, plotObstacles } from './world.js';
import { ensureConstruction, PUBLIC_LEVELS, BUILDINGS, PUBLIC_WORK } from './construction.js';
import { TIERS, openSlots, openRoads, slotObstacles } from './villageLayout.js';
import { clearPropTiles } from './villageProps.js';
import { settlerArrivals, population, allNpcDefs } from './npcs.js';
import { ensureLeadership } from './leadership.js';

/** Showcases: the playable plans, plus a peek at the top building era (what the next level will look like). */
export const SHOWCASES = [
  { id: 1, th: 'บุกเบิก', title: 'หัวหน้าค่าย', icon: '⛺', stage: 0, era: 1 },
  { id: 2, th: 'หมู่บ้าน', title: 'ผู้ใหญ่บ้าน', icon: '🏡', stage: 1, era: 2 },
  { id: 3, th: 'อำเภอ', title: 'นายอำเภอ', icon: '🏘️', stage: 2, era: 3, preview: true },
  { id: 4, th: 'จังหวัด', title: 'ผู้ว่าฯ', icon: '🏙️', stage: 3, era: 4, preview: true },
  { id: 5, th: 'ประเทศ', title: 'นายกรัฐมนตรี', icon: '🇹🇭', stage: 4, era: 5, preview: true },
];

export function buildShowcase(base, id) {
  const sc = SHOWCASES.find(x => x.id === id) || SHOWCASES[0];
  const s = deepClone(base);
  s.__showcase = sc.id;
  s.town.stage = sc.stage;
  s.gameTime = 10.5 * 3600;
  fillLevel(s, sc.era);
  return { state: s, info: sc, population: population(s), npcs: allNpcDefs(s).length };
}

/** Test mode "พัฒนาจนตัน": finish every slot of the plan at the current era, fill the houses, clear roads/forest.
 *  Mutates s (the sandbox save). era defaults to the area's own era. */
export function fillLevel(s, era = (s.town?.stage || 0) + 1) {
  ensureWorld(s); ensureConstruction(s); ensureLeadership(s);
  s.leadership.isLeader = true; s.election.leader = 'player';
  const cap = (table, lv) => Math.min(table.length, lv);
  // public buildings of every open plan, at the top era allowed
  for (const sl of openSlots(s)) {
    if (sl.kind === 'public') {
      for (const n of plotObstacles(s, sl.id)) setNode(s, n.id, 'x');
      Object.assign(s.publicSites[sl.id], { status: 'done', level: cap(PUBLIC_LEVELS[sl.id], sl.id === 'farm' ? 3 : era), work: PUBLIC_WORK[sl.id], workNeeded: PUBLIC_WORK[sl.id] });
      delete s.publicSites[sl.id].upgradingTo; s.projects[sl.id] = true;
    } else {
      const b = BUILDINGS[sl.kind];
      for (const n of slotObstacles(s, sl.kind === 'cottage' ? { tx: sl.tx - 1, ty: sl.ty - 2 } : sl, sl.kind === 'cottage' ? 6 : b.width, sl.kind === 'cottage' ? 6 : b.height)) setNode(s, n.id, 'x'); // house + yard
      const old = s.placed.find(p => p.tx === sl.tx && p.ty === sl.ty && p.type === sl.kind);
      if (old) { Object.assign(old, { status: 'done', level: Math.max(old.level || 0, cap(b.levels, era)), work: b.work, workNeeded: b.work }); delete old.upgradingTo; continue; } // keep the owner
      s.placed.push({ uid: `show_${sl.id}`, type: sl.kind, tx: sl.tx, ty: sl.ty, owner: s.homes?.[sl.id]?.owner || 'npc', plantedAt: null, status: 'done', level: cap(b.levels, era), work: b.work, workNeeded: b.work });
      if (sl.kind === 'cottage') { s.homes = s.homes || {}; s.homes[sl.id] = s.homes[sl.id] || { owner: 'npc', name: 'ชาวบ้าน', savings: 0, claimedDay: s.day }; }
    }
  }
  openRoads(s); clearPropTiles(s);
  // fill the houses with villagers
  for (let i = 0; i < 260; i++) { s.day++; if (!settlerArrivals(s)) break; }
  // every family moves into a house of its own (owners stand in for online players)
  const owned = new Set(s.placed.filter(p => p.type === 'cottage').map(p => p.owner));
  const free = s.placed.filter(p => p.type === 'cottage' && (p.owner === 'npc' || !p.owner));
  for (const npc of allNpcDefs(s)) {
    if (npc.id === 'mentor' || owned.has(npc.id)) continue;
    const p = free.shift(); if (!p) break;
    p.owner = npc.id; owned.add(npc.id);
    const slot = openSlots(s).find(x => x.kind === 'cottage' && x.tx === p.tx && x.ty === p.ty);
    if (slot) s.homes[slot.id] = { owner: npc.id, name: npc.name, savings: 0, claimedDay: s.day };
  }
  s.town.happiness = 90; s.__structVer = (s.__structVer || 0) + 1;
  // the clock moved on: everyone fed and rested, the hourly economy starts from now (no backlog)
  s.town.lastEconomyHour = Math.floor(((s.day - 1) * 86400 + s.gameTime) / 3600);
  if (s.town.life) for (const v of Object.values(s.town.life)) { v.hunger = Math.min(v.hunger, 35); v.energy = Math.max(v.energy, 70); }
  return s;
}
/** Test mode "อัพยุค" / "ลดยุค": move the area level directly (bypasses the plan / population / leader checks). */
export function setLevel(s, stage) {
  s.town.stage = Math.max(0, Math.min(4, stage));
  openRoads(s); clearPropTiles(s); s.__structVer = (s.__structVer || 0) + 1;
  return s.town.stage;
}
export { TIERS };

/** Switch the town to another of the 10 layouts (founder's choice / test mode). Keeps every building and the progress;
 *  the forest is re-grown for the new map and built plots are cleared again. */
export function applyPlan(s, plan) {
  s.world.plan = plan; ensureWorld(s); delete s.world.relaid;
  // v0.27 maps from the Map Maker have their own plots: houses/workshops that are not on a plot of this map are taken down
  const slots = openSlots(s);
  s.placed = (s.placed || []).filter(p => !['cottage', 'workshop'].includes(p.type) || slots.some(x => x.kind === p.type && x.tx === p.tx && x.ty === p.ty));
  if (s.homes) for (const k of Object.keys(s.homes)) if (!slots.some(x => x.id === k)) delete s.homes[k];
  for (const id of Object.keys(s.publicSites || {})) if (s.publicSites[id].status !== 'none') for (const n of plotObstacles(s, id)) setNode(s, n.id, 'x');
  for (const p of s.placed || []) for (const n of slotObstacles(s, { tx: p.tx - 1, ty: p.ty - 2 }, 6, 6)) setNode(s, n.id, 'x');
  openRoads(s); clearPropTiles(s); s.__structVer = (s.__structVer || 0) + 1;
  return s.world.plan;
}

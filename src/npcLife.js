// v0.22 people who live like people. Pure rules (no DOM).
//  • Needs per villager: hunger and energy go up/down every game hour with what they do; their own money comes from
//    their work (wages) and goes on food (to the market / treasury). Very hungry -> they go and eat; exhausted -> home to bed.
//  • Civil service jobs appear once the town has the buildings: police (police station), district/provincial officials
//    (district office -> provincial hall -> government house), teachers (school), nurses (hospital). They wear the uniform,
//    commute to that building, hold an afternoon meeting at the government office, patrol, etc.
//  • Walking all over the map: free time strolls go to the district squares and housing estates too, not only the plaza.
// Life state lives in s.town.life[id] = { hunger, energy, coins } (all numbers, 0..100 for needs).
import { hash, zoneById } from './world.js';
import { tierOf } from './villageLayout.js';
import { cityPlan } from './cityPlan.js';
import { ART10 } from './artManifest.js';

export const CIVIL_JOBS = {
  police: { th: 'ทหารยาม', outfit: 'soldier', at: ['barracks'], from: 3 },
  official: { th: 'เสมียนราชสำนัก', outfit: 'civil', at: ['town_hall'], from: 3 },
  teacher: { th: 'ปราชญ์หลวง', outfit: 'civil', at: ['town_hall'], from: 3 },
  nurse: { th: 'หมอยา', outfit: 'cream', at: ['inn'], from: 4 },
  clerk: { th: 'พนักงานสมาคมพ่อค้า', outfit: 'merchant', at: ['merchant_guild','bank'], from: 5 },
};
const WAGE = { police: 9, official: 10, teacher: 8, nurse: 9, clerk: 11, builder: 7, trader: 6, farmer: 5, courier: 6, mentor: 0, explorer: 4 };
const WORKING = new Set(['work', 'build', 'farm', 'sell', 'craft', 'chop', 'gather', 'forage', 'patrol', 'office', 'meeting']);

export function lifeOf(s, id) {
  const L = s.town.life = s.town.life && typeof s.town.life === 'object' ? s.town.life : {};
  const v = L[id] = L[id] || { hunger: 20 + Math.round(hash(id.length, id.charCodeAt(0) || 1, 5) * 30), energy: 80, coins: 20 };
  return v;
}
/** Buildings in town by sprite name -> [door tile x, y]. */
let wpMemo = { k: '', v: {} }, spMemo = { k: '', v: [] };
const memoKey = s => `${tierOf(s)}:${(s.placed || []).length}:${s.world?.plan}:${s.world?.seed}:${s.__structVer || 0}`;
function workplaces(s) {
  const t = tierOf(s); if (t < 3) return {};
  const k = memoKey(s); if (wpMemo.k === k) return wpMemo.v;
  const out = {};
  for (const p of cityPlan(t, ART10).props) if (p.big) (out[p.family || p.name] = out[p.family || p.name] || []).push([Math.round(p.x), Math.round(p.y + 1)]);
  wpMemo = { k, v: out };
  return out;
}
/** Effective job: from อำเภอ up about a third of the settlers work for the state / offices where those buildings exist. */
export function jobOf(s, npc) {
  if (!npc.id?.startsWith?.('settler') && npc.job !== 'teacher') return npc.job;
  const t = tierOf(s), wp = workplaces(s), h = hash(Number(npc.id.replace(/\D/g, '')) || 7, 3, 77);
  const avail = Object.entries(CIVIL_JOBS).filter(([, j]) => t >= j.from && j.at.some(n => wp[n]));
  if (!avail.length || h > .42) return npc.job;
  return avail[Math.floor(h / .42 * avail.length) % avail.length][0];
}
export function roleOf(s, npc) { const j = jobOf(s, npc); return CIVIL_JOBS[j]?.th || npc.role; }
export function outfitOf(s, npc) { const j = jobOf(s, npc); return CIVIL_JOBS[j]?.outfit || npc.look?.outfit; }

/** Overrides for planFor: needs first, then civil-service work. Returns a plan or null (= normal schedule). */
export function lifePlan(s, npc, hour, index, home) {
  const v = lifeOf(s, npc.id), job = jobOf(s, npc), wp = workplaces(s);
  const awake = hour >= 6 && hour < 21.5;
  if (awake && v.energy < 12) return { activity: 'sleep', target: home, need: 'tired' };
  if (awake && v.hunger > 78) {
    const food = (wp.market || wp.inn || [])[0];
    const q = zoneById('village');
    return { activity: 'lunch', target: food ? off(food, index) : off([q.x + 2, q.y + 3], index), place: 'market', need: 'hungry' };
  }
  const C = CIVIL_JOBS[job];
  if (C && hour >= 8 && hour < 16.5 && !(hour >= 12 && hour < 13)) {
    const site = C.at.map(n => wp[n]?.[0]).find(Boolean); if (!site) return null;
    if (job === 'police' && hour >= 13) { // afternoon patrol around the whole town
      const spots = strollSpots(s); return { activity: 'patrol', target: spots[(index + Math.floor(hour * 2)) % spots.length] };
    }
    if (hour >= 15 && hour < 16 && job !== 'nurse') { const gov = (wp.town_hall || [])[0]; return { activity: 'meeting', target: off(gov, index), place: 'gov' }; }
    return { activity: 'office', target: off(site, index) };
  }
  return null;
}
/** Places to wander to: the plaza, every district square, the housing estates. */
export function strollSpots(s) {
  const k = memoKey(s); if (spMemo.k === k) return spMemo.v;
  const out = [], t = tierOf(s), v = zoneById('village');
  out.push([v.x, v.y + 3], [v.x - 6, v.y + 6], [v.x + 6, v.y + 6]);
  for (const id of ['hill', 'quarter', 'newtown', 'temple', 'port']) { const z = zoneById(id); if (z && z.tier <= t) out.push([(z.cx ?? z.x), (z.cy ?? z.y) + 5]); }
  for (const p of (s.placed || []).filter(q => q.type === 'cottage' && q.level >= 1).slice(0, 40)) if (hash(p.tx, p.ty, 9) < .25) out.push([p.tx + 2, p.ty + 4]);
  spMemo = { k, v: out };
  return out;
}
function off([x, y], i) { return [x + Math.round((hash(i, 11, 3) - .5) * 8), y + Math.round(hash(i, 12, 3) * 3)]; }

/** Once per game hour for every villager on the map: needs and money follow what they did. */
export function lifeHour(s, present) {
  const ev = [];
  for (const { npc, plan } of present) {
    if (npc.special) continue;
    const v = lifeOf(s, npc.id), a = plan?.activity;
    if (a === 'sleep') { v.energy += 14; v.hunger += 2; }
    else if (WORKING.has(a)) { v.energy -= 7; v.hunger += 7; v.coins += WAGE[jobOf(s, npc)] ?? 5; }
    else if (a === 'lunch') {
      if (v.coins >= 5) { v.coins -= 5; v.hunger -= 60; s.town.treasury = (s.town.treasury || 0) + 1; } // food money -> market tax
      else { v.hunger -= 25; } // eats at home, cheaper and less filling
    } else { v.energy -= 3; v.hunger += 4; }
    v.hunger = Math.max(0, Math.min(100, v.hunger)); v.energy = Math.max(0, Math.min(100, v.energy)); v.coins = Math.max(0, Math.min(9999, v.coins));
  }
  return ev;
}

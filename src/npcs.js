// v0.8 NPC life simulation (rules only; movement/pathfinding lives in the game controller).
// Every NPC has a job, a home, a daily schedule, hunger and money. Where they go depends on what the
// village has built: e.g. the farmer works the community farm once it exists, traders move to the
// market, builders walk to active construction sites and speed them up, everyone eats at the market.
import { POINTS, CENTER, TENTS, hash, ORIGIN } from './world.js';
import { clearingTargets, npcWork } from './resources.js';
import { ensureConstruction, activeSites, structureLevel, publicEffect, BUILDINGS, findStructure } from './construction.js';
import { ensureSystems, MARKET, STOCK_CAP } from './systems.js';
import { addHistory } from './gameState.js';
import { tierInfo } from './villageLayout.js';
import { lifePlan, strollSpots, lifeHour, jobOf, CIVIL_JOBS } from './npcLife.js';
import { townDay, policyHappy, hasPolicy } from './economy.js';
import { npcUpgradeVillage, roadSegments, segmentLevel, paveCost, paveSegment, PAVE, pavedShare, tierOf } from './villageLayout.js';

// Appearance uses the same modular character system as the player (see src/character/model.js).
export const NPC_DEFS = [
  { id: 'mentor', start: true, name: 'ครูอุ่น', role: 'ที่ปรึกษาผู้ก่อตั้ง (NPC)', job: 'mentor', home: [40, 48], look: { hair: 'pony', hairColor: 'ash', skin: 's2', eyes: 'brown', outfit: 'leader' },
    phrase: 'ที่ดินผืนนี้เป็นของเธอแล้ว แต่ยังเป็นป่าทั้งหมด เอาขวานเล่มนี้ไปถางก่อน เธอเป็นผู้นำรักษาการได้ แต่ถ้าชาวบ้านไม่สุขสบาย พอหมดวาระเขาจะเลือกคนใหม่นะ' },
  { id: 'chai', start: true, name: 'ช่างชัย', role: 'ช่างไม้', job: 'builder', home: [34, 53], look: { hair: 'short', hairColor: 'black', skin: 's3', outfit: 'builder' },
    phrase: 'ฉันจะช่วยโค่นต้นไม้ในหมุดที่ดินให้ก่อน ไม้ที่ได้จะเอาไปไว้ที่ลังแลกของ' },
  { id: 'saeng', start: true, name: 'ป้าแสง', role: 'แม่ค้า', job: 'trader', home: [47, 54], look: { hair: 'pony', hairColor: 'black', skin: 's3', outfit: 'trader' },
    phrase: 'ถ้ามีตลาด ป้าจะย้ายแผงไปขายที่นั่น คนจะได้มีที่กินข้าวกลางวัน' },
  { id: 'fah', name: 'น้องฟ้า', role: 'คุณครู', job: 'teacher', home: [40, 48], look: { hair: 'swept', hairColor: 'chestnut', skin: 's1', eyes: 'hazel', outfit: 'civil' },
    phrase: 'อ่านหนังสือที่โต๊ะเรียนรู้ได้ทุกวัน ความรู้ใช้สอบได้ทั้งสายราชการและสายผู้นำ' },
  { id: 'mee', start: true, name: 'ลุงมี', role: 'ชาวสวน', job: 'farmer', home: [36, 57], look: { hair: 'short', hairColor: 'ash', skin: 's4', outfit: 'farmer' },
    phrase: 'สร้างสวนอาหารชุมชนเสร็จเมื่อไหร่ ลุงจะไปปลูกผักส่งตลาดทุกวัน' },
  { id: 'nid', name: 'นิด', role: 'คนส่งของ', job: 'courier', home: [40, 48], look: { hair: 'swept', hairColor: 'brown', skin: 's2', outfit: 'blue' },
    phrase: 'รับงานส่งของที่กระดานประกาศได้นะ' },
  { id: 'phian', name: 'ตาเพียร', role: 'ช่างหิน', job: 'builder', home: [40, 48], look: { hair: 'short', hairColor: 'ash', skin: 's3', outfit: 'builder' },
    phrase: 'ก้อนหินทางตะวันออกใช้สร้างศาลาประชาคมได้ ฉันจะไปช่วยก่อเอง' },
  { id: 'mali', name: 'มะลิ', role: 'คนขายอาหาร', job: 'trader', home: [40, 48], look: { hair: 'pony', hairColor: 'chestnut', skin: 's1', outfit: 'red' },
    phrase: 'ฉันอยากเปิดร้านอาหารในตลาดใหม่ ทุกคนจะได้ไม่หิว' },
  { id: 'win', name: 'วิน', role: 'คนส่งสินค้า', job: 'courier', home: [40, 48], look: { hair: 'short', hairColor: 'brown', skin: 's4', outfit: 'green' },
    phrase: 'ชุมชนโตได้เพราะทุกคนช่วยกัน' },
  { id: 'da', name: 'ดา', role: 'นักสำรวจ', job: 'explorer', home: [40, 48], look: { hair: 'swept', hairColor: 'navy', skin: 's2', eyes: 'blue', outfit: 'cream' },
    phrase: 'ทิศตะวันออกยังมีที่ว่างอีกเยอะ สร้างบ้านเพิ่มแล้วจะมีคนย้ายมาอยู่' },
];
const SETTLER_POOL = [
  ['บุญมี', 'farmer'], ['สมใจ', 'trader'], ['ต้นข้าว', 'builder'], ['ปลา', 'courier'], ['แก้ว', 'farmer'], ['โจ้', 'builder'],
  ['พลอย', 'trader'], ['ภูมิ', 'teacher'], ['เอื้อ', 'farmer'], ['ฝน', 'trader'], ['ก้อง', 'builder'], ['นุ่น', 'courier'],
  ['บัว', 'farmer'], ['เต้ย', 'builder'], ['หนิง', 'trader'], ['ชาติ', 'farmer'], ['ส้ม', 'courier'], ['เหน่ง', 'builder'],
  ['จันทร์', 'trader'], ['ทอง', 'farmer'], ['ปุ้ย', 'teacher'], ['อ้น', 'builder'], ['มุก', 'trader'], ['ต่อ', 'farmer'],
  ['ใบเตย', 'courier'], ['ยอด', 'builder'], ['น้ำ', 'trader'], ['เพชร', 'farmer'], ['กล้วย', 'builder'], ['แป้ง', 'trader'],
  ['ลำดวน', 'farmer'], ['สิงห์', 'builder'], ['ขวัญ', 'trader'], ['บิว', 'courier'], ['ดาว', 'farmer'], ['ตั้ม', 'builder'],
  ['แพร', 'trader'], ['กร', 'farmer'], ['อุ๋ม', 'teacher'], ['เก่ง', 'builder'], ['หญิง', 'trader'], ['บอย', 'farmer'],
  ['ฟาง', 'farmer'], ['เบิร์ด', 'builder'], ['มด', 'trader'], ['ไผ่', 'farmer'], ['นก', 'courier'], ['เอ', 'builder'],
];
export const SETTLE_EVERY_HOURS = 3; // a new family arrives every 3 game hours while below the level's cap
const JOB_OUTFIT = { farmer: 'farmer', trader: 'trader', builder: 'builder', courier: 'blue', teacher: 'civil', explorer: 'green' };
const JOB_ROLE = { farmer: 'ชาวสวน', trader: 'แม่ค้า/พ่อค้า', builder: 'ช่าง', courier: 'คนส่งของ', teacher: 'คุณครู', explorer: 'นักสำรวจ' };

export const STARTERS = NPC_DEFS.filter(n => n.start);
export const BASE_POPULATION = STARTERS.length;

export function ensureTown(s) {
  ensureSystems(s); ensureConstruction(s);
  s.town.settlers = Array.isArray(s.town.settlers) ? s.town.settlers : [];
  s.town.happiness = Number.isFinite(s.town.happiness) ? s.town.happiness : 60;
  s.town.lastEconomyHour = Number.isFinite(s.town.lastEconomyHour) ? s.town.lastEconomyHour : Math.floor(((s.day - 1) * 86400 + s.gameTime) / 3600);
  s.town.mealsServed = s.town.mealsServed || 0;
  s.town.hungryMeals = s.town.hungryMeals || 0;
  s.town.rentEarned = s.town.rentEarned || 0;
  return s;
}

export function housingCapacity(s) {
  ensureTown(s);
  const cottages = s.placed.filter(p => p.type === 'cottage' && p.level >= 1)
    .reduce((n, p) => n + BUILDINGS.cottage.levels[p.level - 1].residents, 0);
  return BASE_POPULATION + publicEffect(s, 'home', 'residents') + cottages;
}
export function population(s) { ensureTown(s); return BASE_POPULATION + s.town.settlers.length; }
export function populationCap(s) { return tierInfo(s).maxNpc || 15; }
/** Where an NPC lives: its own finished house if it built one, otherwise its tent/camp spot. */
export function homeOf(s, npc) {
  const slot = s.homes && Object.keys(s.homes).find(k => s.homes[k].owner === npc.id);
  if (slot) { const p = s.placed.find(q => q.type === 'cottage' && q.owner === npc.id && q.level >= 1); if (p) return [p.tx + 2, p.ty + BUILDINGS.cottage.height]; }
  // no house of their own yet: lodge with a family (spread over every finished house) instead of all camping on one spot
  if (npc.id !== 'mentor') { const hs = s.placed.filter(q => q.type === 'cottage' && q.level >= 1); if (hs.length) { const p = hs[Math.floor(hash(npc.id.length * 31 + (Number(npc.id.replace(/\D/g, '')) || 0), 5, 61) * hs.length)]; return [p.tx + 2, p.ty + BUILDINGS.cottage.height]; } }
  return npc.home;
}
export function ownHouseSite(s, npc) { return s.placed.find(q => q.type === 'cottage' && q.owner === npc.id && q.status === 'building') || null; }

/**
 * v0.13: villagers keep arriving (one family every few game hours) up to the cap of the village level
 * (ค่ายบุกเบิก 15, หมู่บ้าน 30 …). Newcomers live in the camp until they have saved up and built their own house.
 */
export function settlerArrivals(s) {
  ensureTown(s);
  const absHour = (s.day - 1) * 24 + Math.floor(s.gameTime / 3600);
  if (Number.isFinite(s.town.lastSettlerHour) && absHour - s.town.lastSettlerHour < SETTLE_EVERY_HOURS) return null;
  if (population(s) >= populationCap(s)) return null;
  const used = new Set(s.town.settlers.map(x => x.id));
  const homes = [...s.placed.filter(p => p.type === 'cottage' && p.level >= 1).map(p => [p.tx + 1, p.ty + BUILDINGS.cottage.height]),
    ...(s.publicSites?.home?.level >= 1 ? [[POINTS.home.x, POINTS.home.y + Math.ceil(POINTS.home.h / 2) + 1]] : [])];
  const i = s.town.settlers.length, camp = [[33, 53], [46, 54], [37, 57], [31, 50], [49, 50], [43, 57]].map(([x, y]) => [x + ORIGIN.x, y + ORIGIN.y]), home = camp[i % camp.length]; void homes; // newcomers camp until they build their own house
  let settler;
  const named = NPC_DEFS.find(n => !n.start && !used.has(n.id));
  if (named) settler = { ...named, home, arrivedDay: s.day };
  else {
    // after the named pool: generated names (online players stand-ins) so big towns can fill up
    let pick = SETTLER_POOL.find(([n]) => !s.town.settlers.some(x => x.name === n));
    if (!pick) { const F = ['สมศักดิ์', 'มาลี', 'ประยูร', 'วันดี', 'ชาตรี', 'สุนีย์', 'อนันต์', 'ปิยะ', 'กมล', 'รัตนา', 'วิชัย', 'นภา'], L = ['ใจดี', 'มั่นคง', 'รุ่งเรือง', 'ศรีสุข', 'บุญมา', 'ทองดี', 'แสงทอง', 'พูลผล'];
      const jobs = ['farmer', 'builder', 'trader', 'farmer', 'trader']; pick = [`${F[i % F.length]} ${L[Math.floor(i / F.length) % L.length]}`, jobs[i % jobs.length]]; }
    const [name, job] = pick;
    settler = {
      id: 'settler' + i, name, job, role: JOB_ROLE[job], home,
      look: { hair: ['messy', 'pony', 'swept', 'short', 'messy'][i % 5], hairColor: ['brown', 'black', 'chestnut', 'blonde'][i % 4], skin: ['s1', 's2', 's3', 's4', 's5'][i % 5], eyes: 'brown', outfit: JOB_OUTFIT[job] },
      phrase: ['เพิ่งย้ายมาอยู่ที่นี่ กำลังเก็บเงินสร้างบ้านของตัวเอง', 'ได้ยินว่าหมู่บ้านนี้มีงานเยอะ เลยย้ายมาอยู่', 'อีกไม่นานฉันจะมีบ้านเป็นของตัวเองแล้ว!'][i % 3], arrivedDay: s.day,
    };
  }
  s.town.settlers.push(settler);
  s.town.lastSettlerDay = s.day; s.town.lastSettlerHour = absHour;
  addHistory(s, `${settler.name} (${settler.role}) ย้ายเข้ามาอยู่ในหมู่บ้าน`);
  return settler;
}

// v0.27 the starters' homes follow the village origin (maps from the Map Maker put the village elsewhere)
const HOME0 = new Map(NPC_DEFS.map(d => [d, [...d.home]])); let homeOrigin = '0,0';
function syncHomes() { const k = ORIGIN.x + ',' + ORIGIN.y; if (k === homeOrigin) return; homeOrigin = k; for (const [d, h] of HOME0) d.home = [h[0] + ORIGIN.x, h[1] + ORIGIN.y]; }
export function allNpcDefs(s) { ensureTown(s); syncHomes(); return [...STARTERS, ...s.town.settlers]; }

function siteFront(id) { const p = POINTS[id]; return [p.x, p.y + Math.ceil((p.h || 2) / 2) + 1]; }
export function structurePos(s, ref) {
  if (POINTS[ref]?.type === 'project') return siteFront(ref);
  const p = s.placed.find(x => x.uid === ref);
  if (!p) return null;
  const b = BUILDINGS[p.type];
  return [p.tx + Math.floor(b.width / 2), p.ty + b.height];
}
const FALLBACK_WORK = { mentor: [POINTS.camp.x, POINTS.camp.y + 1], builder: [CENTER.x + 3, CENTER.y - 3], trader: [POINTS.delivery.x, POINTS.delivery.y + 1], teacher: [POINTS.study.x, POINTS.study.y + 1], farmer: [CENTER.x - 8, CENTER.y + 4], courier: [POINTS.board.x, POINTS.board.y + 1], explorer: [CENTER.x + 6, CENTER.y + 6] };
const done = (s, id) => s.publicSites?.[id]?.level >= 1;

/**
 * Decide what an NPC does at a given hour. Pure: depends on time, the NPC's job and the village state.
 * Returns { activity, target:[tx,ty], place } where place is a structure id when relevant.
 */
export function planFor(s, npc, rawHour, index = 0) {
  ensureTown(s);
  // personal clock offset (-25..+25 min) so villagers don't all move in the same second
  const hour = (rawHour + (hash(index, 7, 99) - 0.5) * 0.8 + 24) % 24;
  const lamps = s.placed.filter(p => p.type === 'lamp' && p.level >= 1).length;
  const bedtime = (lamps ? 22 : 21) + (hash(index, 3, 31) - .5); // night owls and early sleepers
  const home = homeOf(s, npc);
  const SP = strollSpots(s);
  if (hour < 5.5 + hash(index, 4, 32) || hour >= bedtime) return { activity: 'sleep', target: home };
  if (npc.id !== 'mentor') { const lp = lifePlan(s, npc, hour, index, home); if (lp) return lp; } // hungry / tired / civil-service work
  if (hour < 7) return hash(index, Math.floor(rawHour), 33) < .4 ? { activity: 'stroll', target: offset(SP[(index + Math.floor(rawHour)) % SP.length], index) } : { activity: 'home', target: home };
  // your own house comes first: owners work on it in the morning shift, friends who are builders help
  const own = ownHouseSite(s, npc);
  if (own && hour < 12 && npc.id !== 'mentor') return { activity: 'build', target: offset([own.tx + 2, own.ty + 3], index), place: own.uid, ownHouse: true };
  if (hour >= 12 && hour < 13) {
    if (done(s, 'market')) return { activity: 'lunch', target: offset(siteFront('market'), index), place: 'market' };
    return { activity: 'lunch', target: index % 2 ? home : offset([CENTER.x + (index % 5) - 2, CENTER.y + 3], index) };
  }
  if (hour >= 17) {
    const benches = s.placed.filter(p => p.type === 'bench' && p.level >= 1);
    if (benches.length && index % 3 === 0) { const b = benches[index % benches.length]; return { activity: 'relax', target: [b.tx, b.ty + 1], place: b.uid }; }
    if (done(s, 'hall')) return { activity: 'meeting', target: offset(siteFront('hall'), index), place: 'hall' };
    // free evening: chat around the plaza / well, visit a friend's house, stroll
    const r = hash(index, Math.floor(rawHour), 41);
    if (r < .45) return { activity: 'social', target: offset(SP[index % SP.length], index) };
    if (r < .7) return { activity: 'stroll', target: offset(SP[(index * 3 + Math.floor(rawHour)) % SP.length], index + 1) };
    return { activity: 'home', target: home };
  }
  // working hours 7-12, 13-17
  switch (npc.job) {
    case 'builder': {
      const sites = activeSites(s);
      if (sites.length) { const ref = sites[index % sites.length]; return { activity: 'build', target: offset(structurePos(s, ref), index), place: ref }; }
      const ws = s.placed.find(p => p.type === 'workshop' && p.level >= 1);
      if (ws && index % 2 === 1) return { activity: 'craft', target: structurePos(s, ws.uid), place: ws.uid };
      const trees = (s.market?.wood ?? 0) < 40 ? clearingTargets(s, 8) : [];
      if (trees.length) { const n = trees[index % trees.length]; return { activity: 'chop', target: [n.x, n.y + 1], place: n.id }; }
      return { activity: 'gather', target: [FALLBACK_WORK.builder[0] + Math.round((hash(index, 23, 4) - .5) * 14), FALLBACK_WORK.builder[1] + Math.round((hash(index, 24, 4) - .5) * 10)] };
    }
    case 'farmer':
      if (done(s, 'farm')) return { activity: 'farm', target: offset(siteFront('farm'), index), place: 'farm' };
      return { activity: 'forage', target: [FALLBACK_WORK.farmer[0] + Math.round((hash(index, 21, 4) - .5) * 14), FALLBACK_WORK.farmer[1] + Math.round((hash(index, 22, 4) - .5) * 10)] };
    case 'trader':
      if (done(s, 'market')) return { activity: 'sell', target: offset(siteFront('market'), index + 1), place: 'market' };
      return { activity: 'sell', target: offset(FALLBACK_WORK.trader, index) };
    case 'teacher': return { activity: 'work', target: offset(FALLBACK_WORK.teacher, index) };
    default: // couriers deliver house to house, explorers roam the districts — a new stop every hour
      return { activity: 'work', target: offset(SP[(index * 7 + Math.floor(rawHour)) % SP.length], index) };
  }
}
// places people hang out: plaza, well, notice board, path crossings
const SPOTS = [[CENTER.x, CENTER.y + 3], [CENTER.x - 3, CENTER.y + 2], [CENTER.x + 3, CENTER.y + 2], [CENTER.x + 4, CENTER.y - 2], [CENTER.x - 5, CENTER.y - 1], [CENTER.x - 6, CENTER.y + 6], [CENTER.x + 6, CENTER.y + 6], [CENTER.x, CENTER.y + 6]];
function offset([x, y], i) { return [x + Math.round((hash(i, 11, 3) - .5) * 8), y + Math.round(hash(i, 12, 3) * 3)]; } // spread people out (no crowd on one tile)

/**
 * Economic effects, applied once per completed game hour. `present` = list of {npc, plan, arrived}.
 * Returns a short list of human-readable events (for the log/UI).
 */
export function economyHour(s, present) {
  ensureTown(s);
  const ev = [];
  const cap = (k, n) => { s.market[k] = Math.max(0, Math.min(STOCK_CAP, (s.market[k] || 0) + n)); };
  let hungry = 0, served = 0;
  for (const { npc, plan, arrived } of present) {
    if (!arrived) continue;
    if (plan.activity === 'farm') cap('food', publicEffect(s, 'farm', 'foodPerHour')), cap('vegetables', 1);
    if (plan.activity === 'forage' && s.town.lastEconomyHour % 4 === 0) cap('food', 1); // deterministic: one find every 4 hours
    if (plan.activity === 'gather') cap('wood', 1);
    if (plan.activity === 'chop') { const r = npcWork(s, plan.place); if (r === 'felled') ev.push(`${npc.name} โค่นต้นไม้ได้ 1 ต้น`); }
    if (plan.activity === 'craft') {
      const ws = findStructure(s, plan.place);
      const per = ws ? BUILDINGS.workshop.levels[Math.max(0, ws.obj.level - 1)].planksPerHour : 1;
      if ((s.market.wood || 0) >= per) { cap('wood', -per); cap('planks', per); s.player.coins += 2; s.town.rentEarned += 2; }
    }
    // v0.26 traders' income is taxed once a day in townDay (no extra hourly faucet here)
    if (plan.activity === 'lunch' && plan.place === 'market') {
      if ((s.market.food || 0) > 0) { cap('food', -1); s.town.treasury += 1; served++; }
      else hungry++;
    }
    void npc;
  }
  lifeHour(s, present.filter(p => p.arrived || p.plan?.activity === 'sleep'));
  s.town.mealsServed += served; s.town.hungryMeals += hungry;
  if (served) ev.push(`NPC ซื้ออาหารกลางวัน ${served} มื้อ (ภาษีเข้าคลัง +${served})`);
  if (hungry) { ev.push(`อาหารในตลาดไม่พอ NPC หิว ${hungry} คน`); s.town.hungryToday = (s.town.hungryToday || 0) + (hasPolicy(s, 'lunch') ? Math.ceil(hungry / 2) : hungry); }
  // happiness drifts towards a target based on what exists in the village
  const target = 45 - (tierInfo(s).tier - 1) * 4 + Math.round(pavedShare(s) * (tierInfo(s).tier - 1) * 3) + (done(s, 'farm') ? 10 : 0) + (done(s, 'market') ? 10 : 0) + (done(s, 'hall') ? 8 : 0)
    + Math.min(10, s.placed.filter(p => p.type === 'bench' && p.level >= 1).length * 4)
    + Math.min(8, s.placed.filter(p => p.type === 'lamp' && p.level >= 1).length * 2)
    + policyHappy(s) - hungry * (hasPolicy(s, 'lunch') ? 1.5 : 3);
  s.town.happiness = Math.max(0, Math.min(100, Math.round(s.town.happiness + (target - s.town.happiness) * 0.15)));
  return ev;
}

/** v0.26 once per game day: the town budget (taxes in; upkeep, payroll, policies out) and, while an NPC holds the
 *  office, the NPC leader may raise the area. Returns { events, ledger, grew }. */
export function officialsCount(s) { return allNpcDefs(s).filter(n => CIVIL_JOBS[jobOf(s, n)]).length; }
export function economyDay(s) {
  ensureTown(s);
  const r = townDay(s, population(s), officialsCount(s));
  const grew = npcUpgradeVillage(s, population(s));
  if (grew) r.events.push(`${grew.icon} พื้นที่ยกระดับเป็น${grew.th}`);
  // an NPC leader also paves one road section a day when the treasury is comfortable
  if (!s.leadership?.isLeader && (s.town.treasury || 0) > 600) {
    const top = PAVE.reduce((m, p, i) => tierOf(s) >= p.tier ? i : m, 0), seg = roadSegments(s).find(g => segmentLevel(s, g) < top);
    if (seg && paveCost(s, seg, top) < s.town.treasury - 400) { const pr = paveSegment(s, seg.id, top, true); if (pr.ok) r.events.push(`🛣️ ${s.leadership?.leaderName || 'ผู้นำ'}${pr.msg.slice(2)}`); }
  }
  return { ...r, grew };
}

export function npcPhrase(s, npc) {
  const st = s.publicSites || {};
  if (npc.job === 'farmer' && done(s, 'farm')) return 'สวนอาหารชุมชนให้ผลผลิตดีมาก ลุงส่งอาหารเข้าตลาดทุกชั่วโมงเลย';
  if (npc.job === 'trader' && done(s, 'market')) return `ตลาดคึกคักขึ้นเยอะ ตอนนี้มีอาหาร ${s.market.food} ชุดในตลาด`;
  if (npc.job === 'builder' && activeSites(s).length) return 'กำลังไปช่วยงานก่อสร้าง ถ้าเธอช่วยด้วยจะเสร็จเร็วขึ้น!';
  if (npc.id === 'mentor' && s.leadership && !s.leadership.isLeader) return `ตอนนี้${s.leadership.leaderName || 'คนอื่น'}เป็นผู้นำ เธอยังช่วยหมู่บ้านและลงสมัครสมัยหน้าได้นะ`;
  if (npc.id === 'mentor' && s.leadership) return `ความนิยมตอนนี้ ${s.leadership.popularity} — ดูแลอาหาร บ้าน และความสุขของชาวบ้านให้ดีก่อนหมดวาระ`;
  void st;
  return npc.phrase;
}
export { JOB_ROLE };
export function isDone(s, id) { return done(s, id); }
export function marketItems() { return Object.keys(MARKET); }
export function levelOf(s, id) { return structureLevel(s, 'public', id); }

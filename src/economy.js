// v0.26 economy: where money comes from and where it goes. Pure rules (no DOM). In-game currency only.
//  • Energy is a DAILY budget: it refills when you sleep (better at home), plus a nap and up to 3 meals a day.
//    No passive regen -> about 6-8 jobs a day, so choices matter (work, study, build, campaign).
//  • Taxes: the leader sets the income-tax rate (0-25%). Wages of the player and of the villagers are taxed,
//    houses pay a small property tax. All of it goes to the TREASURY (คลังพื้นที่), never to the leader's pocket.
//  • The treasury pays public works, upkeep of public buildings, NPC civil-servant payroll and running policies.
//    It also funds raising the area (อำเภอ/จังหวัด/ประเทศ). Embezzling it (corruption.js) is a crime.
//  • If the treasury cannot pay its bills, policies stop and the town gets unhappy -> popularity falls.
// Keep this module free of imports from gameState/npcs/leadership (the bundler forbids import cycles).
import { tierOf, TIERS } from './villageLayout.js';
import { structureLevel, PUBLIC_LEVELS } from './construction.js';

export const ECON = {
  TAX: { def: 10, min: 0, max: 25, step: 5 },
  PROPERTY_TAX: [0, 1, 2, 3, 5, 8],            // coins per day by house level (0 = no house)
  NPC_WAGE_DAY: 12,                            // taxable daily income of one working villager at tier 1 (+30% per tier)
  UPKEEP_PER_LEVEL: 3,                         // each public building, per level, per day
  CITY_UPKEEP: { 3: 40, 4: 110, 5: 260 },      // district buildings (police, school, hospital ...) per day
  OFFICIAL_PAY: 3,                             // treasury pays each NPC civil servant per day (from tier 3)
  STATE_GRANT: { 1: 0, 2: 0, 3: 60, 4: 150, 5: 300 }, // central-government grant per day (bigger areas get more)
  SLEEP: { house: 100, leader: 100, lodging: 80, camp: 65 },
  NAP: 30, MEALS_PER_DAY: 3, STUDY_PER_DAY: 3, STUDY_ENERGY: 8,
};

/** Running policies: a daily cost from the treasury, real effects. tier = area level needed. */
export const POLICIES = {
  lanterns: { name: 'ไฟถนนทั้งหมู่บ้าน', icon: '🏮', cost: 5, tier: 1, pop: 2, happy: 2, desc: 'โจรกล้าลงมือน้อยลงครึ่งหนึ่งตอนกลางคืน' },
  park: { name: 'ดูแลสวนหย่อม', icon: '🌷', cost: 6, tier: 1, pop: 3, happy: 4, desc: 'ชาวบ้านมีที่พักผ่อน ความสุขเพิ่ม' },
  library: { name: 'ห้องสมุดชุมชน', icon: '📚', cost: 6, tier: 1, pop: 2, happy: 1, desc: 'อ่านหนังสือได้วันละ 4 ครั้ง (ปกติ 3)' },
  lunch: { name: 'อาหารกลางวันเด็ก', icon: '🍱', cost: 12, tier: 2, pop: 4, happy: 3, desc: 'คนหิวลดลง (นับหิวแค่ครึ่งเดียว)' },
  clinic: { name: 'อนามัยประจำตำบล', icon: '🩺', cost: 16, tier: 2, pop: 4, happy: 4, desc: 'ชาวบ้านสุขภาพดี ทำงานได้มากขึ้น (ค่าแรงชาวบ้าน +10%)' },
  welfare: { name: 'เบี้ยยังชีพผู้สูงอายุ', icon: '👵', cost: 30, tier: 3, pop: 6, happy: 3, desc: 'นโยบายที่คนรักที่สุด แต่แพง' },
  transit: { name: 'รถเมล์ประจำทาง', icon: '🚌', cost: 55, tier: 4, pop: 5, happy: 4, desc: 'คนเดินทางไปทำงานง่ายขึ้น (ค่าแรงชาวบ้าน +10%)' },
  scholarship: { name: 'ทุนการศึกษา', icon: '🎓', cost: 80, tier: 5, pop: 6, happy: 3, desc: 'อนาคตของชาติ ผลงานทางการเมือง +1 ทุกวัน' },
};
export const POLICY_CAP = 12; // max popularity points from policies

export function ensureEconomy(s) {
  s.town = s.town || { treasury: 0, policies: [] };
  s.town.policies = Array.isArray(s.town.policies) ? s.town.policies.filter(id => POLICIES[id]) : [];
  const e = s.econ = s.econ && typeof s.econ === 'object' ? s.econ : {};
  if (!Number.isFinite(e.taxRate)) e.taxRate = ECON.TAX.def;
  e.today = e.today && typeof e.today === 'object' ? e.today : { day: s.day, in: {}, out: {}, meals: 0 }; // ledger since the last townDay
  if (e.today.day !== s.day) { e.today.day = s.day; e.today.meals = 0; e.today.napped = false; } // per-day limits (meals, nap)
  e.last = e.last || null;               // yesterday's town ledger (shown in the budget panel)
  e.unpaidDays = e.unpaidDays || 0;      // days in a row the treasury could not pay its bills
  e.suspended = Array.isArray(e.suspended) ? e.suspended : [];
  return e;
}
const book = (s, dir, key, n) => { if (!n) return; const t = ensureEconomy(s).today[dir]; t[key] = (t[key] || 0) + n; };

export function taxRate(s) { return ensureEconomy(s).taxRate; }
/** Leader sets the income-tax rate. Takes effect for wages from now on; popularity reacts every day. */
export function setTax(s, rate, isLeader) {
  ensureEconomy(s);
  if (!isLeader) return { ok: false, msg: 'ต้องเป็นผู้นำก่อนถึงจะกำหนดอัตราภาษีได้' };
  const r = Math.max(ECON.TAX.min, Math.min(ECON.TAX.max, Math.round(rate / ECON.TAX.step) * ECON.TAX.step));
  if (r === s.econ.taxRate) return { ok: false, msg: `ภาษีเป็น ${r}% อยู่แล้ว` };
  s.econ.taxRate = r;
  return { ok: true, msg: `ตั้งภาษีเงินได้เป็น ${r}% · ${r > ECON.TAX.def ? 'คลังได้เงินมากขึ้น แต่ชาวบ้านไม่ชอบ' : r < ECON.TAX.def ? 'ชาวบ้านชอบ แต่คลังได้น้อยลง' : 'อัตรามาตรฐาน'}` };
}
/** A wage paid to the player: tax goes to the treasury, the rest to the player's pocket. Returns the net amount. */
export function payIncome(s, gross, label = 'ค่าแรง') {
  ensureEconomy(s);
  const tax = Math.round(gross * s.econ.taxRate / 100), net = gross - tax;
  s.player.coins += net; s.town.treasury = (s.town.treasury || 0) + tax;
  book(s, 'in', 'ภาษีเงินได้ (คุณ)', tax); void label;
  return { net, tax };
}

// ---------------------------------------------------------------- energy (daily budget)
export function sleepQuality(s, isLeader) {
  const mine = (s.placed || []).some(p => p.type === 'cottage' && p.owner === 'player' && p.level >= 1);
  if (mine) return { energy: ECON.SLEEP.house, where: 'บ้านของตัวเอง' };
  if (isLeader) return { energy: ECON.SLEEP.leader, where: 'บ้านพักผู้นำ' };
  if ((s.placed || []).some(p => p.type === 'cottage' && p.level >= 1)) return { energy: ECON.SLEEP.lodging, where: 'อาศัยบ้านชาวบ้าน' };
  return { energy: ECON.SLEEP.camp, where: 'เต็นท์' };
}
/** Start of a new day for the player: sleep refills energy, property tax on the player's house. */
export function playerNewDay(s, isLeader) {
  ensureEconomy(s);
  const sl = sleepQuality(s, isLeader);
  s.player.stamina = Math.max(Math.min(100, s.player.stamina), sl.energy);
  const house = (s.placed || []).find(p => p.type === 'cottage' && p.owner === 'player' && p.level >= 1);
  const due = house ? ECON.PROPERTY_TAX[Math.min(5, house.level)] : 0, paid = Math.min(due, s.player.coins);
  if (paid) { s.player.coins -= paid; s.town.treasury += paid; book(s, 'in', 'ภาษีบ้าน (คุณ)', paid); }
  return { ...sl, propertyTax: paid };
}
export function nap(s) {
  const e = ensureEconomy(s);
  if (e.today.napped) return { ok: false, msg: 'วันนี้งีบไปแล้ว พลังงานเต็มอีกครั้งตอนนอนคืนนี้' };
  if (s.player.stamina >= 100) return { ok: false, msg: 'พลังงานเต็มแล้ว' };
  e.today.napped = true; s.player.stamina = Math.min(100, s.player.stamina + ECON.NAP);
  return { ok: true, msg: `งีบพัก +${ECON.NAP} พลังงาน (วันละครั้ง)` };
}
export function canEat(s) { return ensureEconomy(s).today.meals < ECON.MEALS_PER_DAY; }
export function noteMeal(s) { ensureEconomy(s).today.meals++; }
export function studyLimit(s) { return ECON.STUDY_PER_DAY + (s.town?.policies?.includes('library') ? 1 : 0); }

// ---------------------------------------------------------------- the town budget (once per day)
export function activePolicies(s) { ensureEconomy(s); return s.town.policies.filter(id => POLICIES[id]); }
export function policyPop(s) { return Math.min(POLICY_CAP, activePolicies(s).reduce((n, id) => n + POLICIES[id].pop, 0)); }
export function policyHappy(s) { return activePolicies(s).reduce((n, id) => n + POLICIES[id].happy, 0); }
export function hasPolicy(s, id) { return activePolicies(s).includes(id); }
/** Popularity points from the tax rate: +6 at 0%, 0 at the standard 10%, -9 at 25%. */
export function taxPop(s) { return Math.round((ECON.TAX.def - taxRate(s)) * 0.6); }
export function wageBoost(s) { return 1 + (hasPolicy(s, 'clinic') ? .1 : 0) + (hasPolicy(s, 'transit') ? .1 : 0); }

export function togglePolicy(s, id, isLeader) {
  ensureEconomy(s);
  const P = POLICIES[id]; if (!P) return { ok: false, msg: 'ไม่พบนโยบาย' };
  if (!isLeader) return { ok: false, msg: 'ต้องเป็นผู้นำก่อนถึงจะอนุมัตินโยบายได้' };
  const on = s.town.policies.includes(id);
  if (on) { s.town.policies = s.town.policies.filter(x => x !== id); return { ok: true, msg: `ยกเลิก${P.name} (ประหยัด ${P.cost}/วัน)` }; }
  if (tierOf(s) < P.tier) return { ok: false, msg: `เปิดได้เมื่อพื้นที่เป็นระดับ ${P.tier}` };
  if ((s.town.treasury || 0) < P.cost * 3) return { ok: false, msg: `คลังต้องมีเงินพอจ่ายอย่างน้อย 3 วัน (${P.cost * 3})` };
  s.town.policies.push(id); s.econ.suspended = s.econ.suspended.filter(x => x !== id);
  return { ok: true, msg: `อนุมัติ${P.name} · งบ ${P.cost}/วัน จากคลัง` };
}

/** Daily wage income of the whole village (deterministic: does not depend on which NPCs are on screen). */
export function villagersIncome(s, pop) {
  const t = tierOf(s);
  const jobs = ['farm', 'market', 'hall'].reduce((n, id) => n + (structureLevel(s, 'public', id) ? 1 : 0), 0) + ((s.placed || []).some(p => p.type === 'workshop' && p.level >= 1) ? 1 : 0);
  const employment = Math.min(1, .55 + jobs * .1 + (t >= 3 ? .1 : 0));
  const workers = Math.max(0, pop - 1);
  return Math.round(workers * employment * ECON.NPC_WAGE_DAY * (1 + .3 * (t - 1)) * wageBoost(s));
}
export function upkeepOf(s) {
  const t = tierOf(s);
  const lv = Object.keys(PUBLIC_LEVELS).reduce((n, id) => n + structureLevel(s, 'public', id), 0);
  return lv * ECON.UPKEEP_PER_LEVEL + (ECON.CITY_UPKEEP[t] || 0);
}

/**
 * Once per game day. pop = population, officials = NPC civil servants on the payroll.
 * Income: villagers' income tax, property tax of NPC households, central grant, the hall's fees.
 * Bills in priority order: upkeep, payroll, policies. What cannot be paid is skipped (and the town notices).
 */
export function townDay(s, pop, officials = 0) {
  const e = ensureEconomy(s), t = tierOf(s), events = [];
  const gross = villagersIncome(s, pop), wageTax = Math.round(gross * e.taxRate / 100);
  const houses = (s.placed || []).filter(p => p.type === 'cottage' && p.owner !== 'player' && p.level >= 1);
  const propTax = houses.reduce((n, p) => n + ECON.PROPERTY_TAX[Math.min(5, p.level)], 0);
  const grant = ECON.STATE_GRANT[t] || 0, hall = (() => { const lv = structureLevel(s, 'public', 'hall'); return lv ? PUBLIC_LEVELS.hall[lv - 1].treasuryPerDay : 0; })();
  for (const [k, v] of [['ภาษีเงินได้ชาวบ้าน', wageTax], ['ภาษีบ้านชาวบ้าน', propTax], ['เงินอุดหนุนจากรัฐ', grant], ['ค่าธรรมเนียมศาลา', hall]]) { s.town.treasury += v; book(s, 'in', k, v); }
  let unpaid = 0;
  const bill = (key, n) => { const p = Math.min(n, s.town.treasury); s.town.treasury -= p; book(s, 'out', key, p); unpaid += n - p; return p === n; };
  bill('ค่าดูแลอาคารสาธารณะ', upkeepOf(s));
  if (t >= 3) bill('เงินเดือนข้าราชการ', officials * ECON.OFFICIAL_PAY);
  for (const id of activePolicies(s)) {
    const P = POLICIES[id];
    if (!bill(`นโยบาย: ${P.name}`, P.cost)) { s.town.policies = s.town.policies.filter(x => x !== id); e.suspended.push(id); events.push(`⚠️ คลังไม่พอจ่าย "${P.name}" นโยบายหยุดชั่วคราว`); }
  }
  e.unpaidDays = unpaid > 0 ? e.unpaidDays + 1 : 0;
  if (unpaid > 0) { s.town.happiness = Math.max(0, (s.town.happiness ?? 60) - 4); events.push(`⚠️ คลังขาดเงิน ${unpaid} เหรียญ ค้างจ่ายค่าดูแล/เงินเดือน ชาวบ้านไม่พอใจ`); }
  e.last = { day: s.day, in: { ...e.today.in }, out: { ...e.today.out }, treasury: s.town.treasury, gross, pop };
  e.today = { day: s.day, in: {}, out: {}, meals: 0, napped: false };
  return { events, ledger: e.last };
}
/** Budget preview for the panel: what tomorrow's bills will look like. */
export function budgetPreview(s, pop, officials = 0) {
  const e = ensureEconomy(s), t = tierOf(s);
  const gross = villagersIncome(s, pop);
  const houses = (s.placed || []).filter(p => p.type === 'cottage' && p.owner !== 'player' && p.level >= 1);
  const lv = structureLevel(s, 'public', 'hall');
  const income = Math.round(gross * e.taxRate / 100) + houses.reduce((n, p) => n + ECON.PROPERTY_TAX[Math.min(5, p.level)], 0) + (ECON.STATE_GRANT[t] || 0) + (lv ? PUBLIC_LEVELS.hall[lv - 1].treasuryPerDay : 0);
  const spend = upkeepOf(s) + (t >= 3 ? officials * ECON.OFFICIAL_PAY : 0) + activePolicies(s).reduce((n, id) => n + POLICIES[id].cost, 0);
  return { income, spend, net: income - spend, gross };
}
export function devFund(tier) { return TIERS[tier - 1]?.fund || 0; } // treasury coins spent to raise the area (villageLayout TIERS)

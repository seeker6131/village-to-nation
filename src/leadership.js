// v0.9 leadership model (offline prototype of the online design in docs/GDD_TH.md §8b):
//  • Founder path: the player founded this forest village (in OBT this is the paid "land" product) and is ACTING
//    leader from day 1 — but power is NOT permanent: popularity is measured every day, each term ends with an
//    election, and terms are limited.
//  • Citizen path (join another player's village) needs the online server -> shown as locked.
// Money never adds votes: popularity only comes from how the village is doing.
import { addHistory, logEvent, PROJECT_ORDER } from './gameState.js';
import { ensureTown, population, housingCapacity } from './npcs.js';
import { hash } from './world.js';
import { tierInfo, tierOf, officeNeeds } from './villageLayout.js';
import { policyPop, taxPop, ensureEconomy, hasPolicy } from './economy.js';
import { isCivilServant } from './career.js';
import { integrityScore, auditDay, takeBoughtVotes, isBanned, ensureCorruption, BAN_DAYS } from './corruption.js';

export const TERM_DAYS = 7;          // game days per term (prototype; online design: 7 real days)
export const MAX_CONSECUTIVE = 2;    // after 2 terms in a row the leader must sit one term out
export const RIVALS = [{ id: 'saeng', name: 'ป้าแสง' }, { id: 'chai', name: 'ช่างชัย' }, { id: 'mee', name: 'ลุงมี' }];

export function ensureLeadership(s) {
  ensureTown(s);
  if (!s.leadership || typeof s.leadership !== 'object') {
    s.leadership = { path: 'founder', founder: true, isLeader: true, term: 1, termStart: s.day, consecutive: 1, cooldownUntilDay: 0,
      popularity: 60, leaderName: null, results: [], log: [] };
    s.election.leader = 'player';
  }
  const L = s.leadership;
  L.results = Array.isArray(L.results) ? L.results : [];
  if (!Number.isFinite(L.popularity)) L.popularity = 60;
  if (!Number.isFinite(L.record)) L.record = 0;   // v0.26 political track record (ผลงานทางการเมือง): days in office, elections won, public works
  L.pm = !!L.pm; L.seats = L.seats || null;
  s.town.hungryToday = s.town.hungryToday || 0;
  return L;
}

/** Popularity 0..100 with the factors shown to the player (pure). */
export function popularityFactors(s) {
  ensureTown(s);
  const pop = population(s), cap = housingCapacity(s);
  const built = PROJECT_ORDER.filter(k => s.projects[k]).length;
  const f = {
    happiness: Math.round(s.town.happiness * 0.4),
    housing: pop >= cap ? 2 : Math.min(8, 4 + (cap - pop)),
    food: Math.max(0, 8 - (s.town.hungryToday || 0) * 2),
    progress: built * 3,
    policies: policyPop(s),
    tax: taxPop(s),
    budget: ensureEconomy(s).unpaidDays ? -8 : 0,
    integrity: integrityScore(s),
  };
  const total = Math.max(0, Math.min(100, Object.values(f).reduce((a, b) => a + b, 0)));
  return { total, factors: f };
}

/** NPC rivals get stronger in bigger areas (they have their own record and platforms). */
export function rivalScore(s, term) { const t = tierOf(s); return Math.round(44 + (t - 1) * 4 + hash(term, s.day, 4242) * 12); }
export const RECORD = { day: 1, win: 6, build: 3, scandal: 25 };
export const PARLIAMENT = 500;
/** v0.26 general election at the nation level: your party's seats decide whether you become Prime Minister. */
export function parliamentVote(s, score, rival) {
  const L = ensureLeadership(s), C = ensureCorruption(s);
  const share = Math.max(.05, Math.min(.7, .22 + (score - rival) / 100 + L.record / 2000));
  const seats = Math.round(PARLIAMENT * share), clean = !C.scandals.some(x => s.day - x.day < 30);
  const partners = clean ? Math.min(130, Math.round(L.record / 2)) : 0;
  const pm = seats + partners > PARLIAMENT / 2;
  L.seats = { seats, partners, day: s.day, pm };
  return L.seats;
}

/** Called once per new game day. Updates popularity and runs the end-of-term election. Returns an event or null. */
export function leadershipDay(s) {
  const L = ensureLeadership(s);
  const scandal = auditDay(s); // corruption audit (may remove the leader)
  if (scandal) s.lastScandal = scandal;
  const { total } = popularityFactors(s);
  L.popularity = Math.round(L.popularity * 0.5 + total * 0.5);
  if (L.isLeader && L.popularity >= 55) L.record += RECORD.day;
  if (L.isLeader && hasPolicy(s, 'scholarship')) L.record += 1;
  s.town.hungryToday = 0;
  if (s.day - L.termStart < TERM_DAYS) return null;
  return runTermElection(s);
}

export function canRun(s) {
  const L = ensureLeadership(s), why = [];
  if (!s.examPassed) why.push('ยังไม่ผ่านข้อสอบผู้นำชุมชน');
  if (isCivilServant(s)) why.push('เป็นข้าราชการอยู่ ต้องลาออกก่อนลงสมัคร (เมนูราชการ)');
  // education is the qualification to stand for the office of this area; the political record decides how far you can
  // raise the area yourself (villageLayout.nextTierCheck) and how many seats your party wins (parliamentVote)
  for (const q of officeNeeds(s, tierOf(s))) if (!q.ok && q.label.startsWith('ความรู้')) why.push(`${q.label} (${q.note})`);
  if (isBanned(s)) why.push(`ถูกตัดสิทธิ์จากคดีทุจริต (ถึงวันที่ ${ensureCorruption(s).bannedUntil})`);
  else if (L.cooldownUntilDay > s.day) why.push(`ต้องเว้นวาระ (ลงสมัครได้อีกครั้งวันที่ ${L.cooldownUntilDay})`);
  return { ok: why.length === 0, why };
}

export function runTermElection(s) {
  const L = ensureLeadership(s);
  const rival = RIVALS[(L.term + 1) % RIVALS.length];
  const rScore = rivalScore(s, L.term);
  const eligible = canRun(s);
  const limitHit = L.isLeader && L.consecutive >= MAX_CONSECUTIVE;
  let won = false, note = '';
  if (limitHit) note = `ครบ ${MAX_CONSECUTIVE} วาระติดกัน ต้องเว้น 1 วาระตามกติกา`;
  else if (!eligible.ok) note = eligible.why.join(' · ');
  const bought = takeBoughtVotes(s);
  if (!limitHit && eligible.ok) won = L.popularity + bought > rScore;
  const res = { term: L.term, day: s.day, player: eligible.ok && !limitHit ? L.popularity + bought : null, bought, rival: rival.name, rivalScore: rScore, won, note };
  L.results.unshift(res); L.results = L.results.slice(0, 10);
  L.term += 1; L.termStart = s.day;
  if (won) {
    L.consecutive = L.isLeader ? L.consecutive + 1 : 1; L.isLeader = true; L.leaderName = null; s.election.leader = 'player';
    L.record += RECORD.win;
    addHistory(s, `🗳️ ชนะเลือกตั้งสมัยที่ ${res.term + 1} (${res.player} ต่อ ${rScore})`);
    if (tierOf(s) >= 5) { // nation level: the House of Representatives votes for the Prime Minister
      const v = parliamentVote(s, res.player, rScore), was = L.pm; L.pm = v.pm; res.parliament = v;
      addHistory(s, v.pm ? `🏛️ สภาฯ ลงมติ: ได้เป็นนายกรัฐมนตรี! (พรรค ${v.seats} + พรรคร่วม ${v.partners} จาก ${PARLIAMENT} ที่นั่ง)` : `🏛️ พรรคได้ ${v.seats} ที่นั่ง + พรรคร่วม ${v.partners} ยังไม่ถึงครึ่งสภา — เป็นฝ่ายค้าน`);
      if (v.pm && !was) L.pmSince = s.day;
    }
  } else {
    L.pm = false;
    if (L.isLeader) L.cooldownUntilDay = limitHit ? s.day + TERM_DAYS : 0;
    L.isLeader = false; L.consecutive = 0; L.leaderName = rival.name; s.election.leader = 'npc';
    addHistory(s, `🗳️ ${rival.name} ได้เป็นผู้นำหมู่บ้าน${note ? ` (${note})` : res.player !== null ? ` (${rScore} ต่อ ${res.player})` : ''}`);
  }
  s.election.completed = true; s.election.lastResult = `สมัยที่ ${res.term}: คุณ ${res.player ?? '—'} · ${rival.name} ${rScore}`;
  logEvent(s, s.election.lastResult);
  return res;
}

/** v0.26 community service (งานจิตอาสา): the way to build a political record while out of office. Once a day. */
export const VOLUNTEER_ENERGY = 25;
export function volunteer(s) {
  const L = ensureLeadership(s);
  if (L.volunteerDay === s.day) return { ok: false, msg: 'วันนี้ทำงานจิตอาสาแล้ว พรุ่งนี้มาใหม่' };
  if (s.player.stamina < VOLUNTEER_ENERGY) return { ok: false, msg: `งานจิตอาสาใช้พลังงาน ${VOLUNTEER_ENERGY}` };
  s.player.stamina -= VOLUNTEER_ENERGY; L.volunteerDay = s.day; L.record += 1; s.player.civic = (s.player.civic || 0) + 1;
  return { ok: true, msg: `🤝 ช่วยงานชุมชน (เก็บขยะ ซ่อมทาง ดูแลผู้สูงอายุ) ผลงานทางการเมือง +1 (รวม ${L.record})` };
}
export function termDaysLeft(s) { const L = ensureLeadership(s); return Math.max(0, TERM_DAYS - (s.day - L.termStart)); }
export function roleLabel(s) {
  const L = ensureLeadership(s);
  const title = tierInfo(s).title; // the leader's title follows the level of the area (หัวหน้าค่าย -> ผู้ใหญ่บ้าน -> กำนัน ...)
  if (L.isLeader && L.pm) return 'นายกรัฐมนตรี';
  if (L.isLeader) return L.term === 1 && L.results.length === 0 ? `${title} (รักษาการ)` : title;
  return L.founder ? 'ผู้ก่อตั้ง' : 'ชาวบ้าน';
}

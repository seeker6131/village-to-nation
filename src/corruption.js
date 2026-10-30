// v0.12 "โกงกิน": a leader MAY choose to be corrupt — it pays now, but every act leaves evidence, the village
// suffers, and audits / journalists / the anti-corruption commission (ป.ป.ช.) can catch you: money is seized,
// popularity crashes, and serious cases remove you from office and ban you from elections.
// Everything here is in-game currency only. Nothing can be bought with real money (see shop.js rules).
import { addHistory } from './gameState.js';
import { hash } from './world.js';

export const CORRUPT_ACTS = {
  embezzle: { th: 'ยักยอกงบคลังหมู่บ้าน', icon: '💰', desc: 'โอนงบคลัง 40% เข้ากระเป๋าตัวเอง · บริการชาวบ้านแย่ลง' },
  kickback: { th: 'ฮั้วผู้รับเหมา (เงินทอนโครงการ)', icon: '🤝', desc: 'รับเงินทอนจากงานก่อสร้างสาธารณะที่กำลังสร้าง · ใช้วัสดุเกรดต่ำ งานช้าลง 30%' },
  votebuy: { th: 'ซื้อเสียงก่อนเลือกตั้ง', icon: '🗳️', desc: 'แจกเงินชาวบ้าน 30 เหรียญ = คะแนน +3 ในการเลือกตั้งครั้งหน้า (สูงสุด +15) · ถ้าโดนจับ = ใบแดง' },
};
export const BAN_DAYS = 14;

export function ensureCorruption(s) {
  const c = s.corruption && typeof s.corruption === 'object' ? s.corruption : (s.corruption = {});
  c.evidence = Number.isFinite(c.evidence) ? c.evidence : 0;   // 0..100, hidden suspicion
  c.taken = c.taken || 0;                                       // coins taken since the last audit
  c.lifetime = c.lifetime || 0;
  c.voteBuy = c.voteBuy || 0;                                   // bought points for the next election
  c.bannedUntil = c.bannedUntil || 0;
  c.scandals = Array.isArray(c.scandals) ? c.scandals : [];
  c.lastActDay = c.lastActDay || 0;
  return c;
}
const isLeader = s => !!s.leadership?.isLeader;
/** Daily chance (0..1) of being caught, shown to the player as a risk meter. */
export function catchChance(s) {
  const c = ensureCorruption(s);
  if (c.evidence <= 0) return 0;
  const watchdogs = (s.publicSites?.hall?.level >= 1 ? 1.25 : 1) * (s.town?.policies?.length ? 1.1 : 1); // a council hall = more people watching
  return Math.min(0.75, (c.evidence / 220) * watchdogs);
}

export function corruptAct(s, kind) {
  const c = ensureCorruption(s);
  if (!isLeader(s)) return { ok: false, msg: 'ต้องเป็นผู้นำก่อนถึงจะเข้าถึงงบได้' };
  if (c.lastActDay === s.day && kind !== 'votebuy') return { ok: false, msg: 'วันนี้ทำไปแล้ว รอวันพรุ่งนี้ (ทำถี่ = เสี่ยงโดนจับ)' };
  if (kind === 'embezzle') {
    const amt = Math.floor(s.town.treasury * 0.4);
    if (amt < 5) return { ok: false, msg: 'คลังแทบไม่มีเงินให้ยักยอก' };
    s.town.treasury -= amt; s.player.coins += amt; c.taken += amt; c.lifetime += amt;
    c.evidence = Math.min(100, c.evidence + 8 + amt * 0.35); s.town.happiness = Math.max(0, s.town.happiness - 4);
    c.lastActDay = s.day;
    return { ok: true, msg: `💰 ยักยอกงบ ${amt} เหรียญเข้ากระเป๋า · ความเสี่ยงโดนจับ ~${Math.round(catchChance(s) * 100)}%/วัน`, amount: amt };
  }
  if (kind === 'kickback') {
    const site = Object.entries(s.publicSites || {}).find(([, o]) => o.status === 'building' && !o.shoddy);
    if (!site) return { ok: false, msg: 'ไม่มีโครงการสาธารณะที่กำลังสร้าง (หรือฮั้วไปแล้ว)' };
    const [id, o] = site, amt = 18 + 12 * Math.max(1, o.upgradingTo || 1);
    o.shoddy = true; o.workNeeded = Math.round(o.workNeeded * 1.3);
    s.player.coins += amt; c.taken += amt; c.lifetime += amt;
    c.evidence = Math.min(100, c.evidence + 18); c.lastActDay = s.day;
    return { ok: true, msg: `🤝 รับเงินทอน ${amt} เหรียญจากโครงการ ${id} · งานช้าลง วัสดุเกรดต่ำ`, amount: amt };
  }
  if (kind === 'votebuy') {
    if (c.voteBuy >= 15) return { ok: false, msg: 'ซื้อเสียงเต็มเพดานแล้ว (+15)' };
    if (s.player.coins < 30) return { ok: false, msg: 'ต้องมีเงินสด 30 เหรียญ' };
    s.player.coins -= 30; c.voteBuy += 3; c.evidence = Math.min(100, c.evidence + 12);
    return { ok: true, msg: `🗳️ แจกเงินซื้อเสียง (+3 คะแนน รวม +${c.voteBuy}) · ถ้าโดนจับ = ใบแดง ตัดสิทธิ์` };
  }
  return { ok: false, msg: 'ไม่มีการกระทำนี้' };
}

/**
 * Once per game day (before the election check). Evidence fades slowly; an audit may catch the leader.
 * Returns a scandal event or null. `rng` (0..1) can be injected for tests.
 */
export function auditDay(s, rng = null) {
  const c = ensureCorruption(s);
  const roll = rng ?? hash(s.day, Math.floor(c.evidence * 7), 9091);
  const p = catchChance(s);
  c.evidence = Math.max(0, c.evidence - 2);
  if (!p || roll >= p) return null;
  const seized = Math.min(s.player.coins, Math.round(c.taken * 1.5));
  s.player.coins -= seized; s.town.treasury += seized;
  const severe = c.voteBuy > 0 || c.taken >= 80 || c.scandals.length >= 1;
  const L = s.leadership;
  if (L) { L.popularity = Math.max(0, L.popularity - (severe ? 40 : 22)); L.record = Math.max(0, (L.record || 0) - 25); }
  s.town.happiness = Math.max(0, s.town.happiness - 8);
  const ev = { day: s.day, seized, severe, voteBuy: c.voteBuy > 0, by: ['ป.ป.ช. ตรวจบัญชีหมู่บ้าน', 'นักข่าวท้องถิ่นแฉ', 'ชาวบ้านร้องเรียนพร้อมหลักฐาน'][Math.floor(roll * 1000) % 3] };
  if (severe && L) { // removed from office + banned
    L.isLeader = false; L.pm = false; L.consecutive = 0; L.leaderName = L.leaderName || 'ป้าแสง (รักษาการ)'; s.election.leader = 'npc';
    c.bannedUntil = s.day + BAN_DAYS; L.cooldownUntilDay = Math.max(L.cooldownUntilDay || 0, c.bannedUntil);
  }
  c.scandals.unshift(ev); c.scandals = c.scandals.slice(0, 5);
  c.evidence = 0; c.taken = 0; c.voteBuy = 0;
  addHistory(s, `🚨 ${ev.by}: ผู้นำทุจริต · ยึดเงินคืนคลัง ${seized} เหรียญ${severe ? ` · ถูกปลดจากตำแหน่ง ตัดสิทธิ์ลงเลือกตั้ง ${BAN_DAYS} วัน` : ' · ความนิยมร่วง'}`);
  return ev;
}

/** Popularity factor: clean record +6; recent scandals cost a lot. */
export function integrityScore(s) {
  const c = ensureCorruption(s), recent = c.scandals.filter(x => s.day - x.day < 14).length;
  return recent ? -12 * recent : c.lifetime === 0 ? 4 : 1;
}
/** Bought votes are added on election day, then reset. */
export function takeBoughtVotes(s) { const c = ensureCorruption(s), v = c.voteBuy; c.voteBuy = 0; return v; }
export function isBanned(s) { return ensureCorruption(s).bannedUntil > s.day; }

// Fantasy kingdom progression. Pure in-game rules only. No receipt, payment or premium paths.
export const ROYAL_RANKS = Object.freeze([
  { th: 'ทาสรับใช้', reputation: 0, popularity: 0, royalFavor: 0 },
  { th: 'ราษฎรอิสระ', reputation: 7, popularity: 10, royalFavor: 5 },
  { th: 'ผู้ใหญ่บ้าน', reputation: 20, popularity: 30, royalFavor: 15 },
  { th: 'อัศวินหลวง', reputation: 35, popularity: 40, royalFavor: 38 },
  { th: 'เจ้าเมือง (บารอน)', reputation: 50, popularity: 53, royalFavor: 55 },
  { th: 'เจ้าแคว้น (ดยุก)', reputation: 70, popularity: 68, royalFavor: 72 },
  { th: 'อัครมหาเสนาบดี', reputation: 90, popularity: 88, royalFavor: 92 },
]);
export const FANTASY_JOBS = Object.freeze({ woodcutter: 'คนตัดไม้', farmer: 'ชาวนา', fisher: 'ชาวประมง', smith: 'ช่างตีเหล็ก', builder: 'ช่างก่อสร้าง', soldier: 'ทหาร', hunter: 'พราน', trader: 'พ่อค้า', miner: 'คนขุดแร่' });
export const FANTASY_SEASONS = ['ฤดูใบไม้ผลิ', 'ฤดูร้อน', 'ฤดูใบไม้ร่วง', 'ฤดูหนาว'];
const bound = n => Math.max(0, Math.min(100, Math.floor(Number(n) || 0)));
export function seasonAt(day) { return FANTASY_SEASONS[Math.floor((Math.max(1, day | 0) - 1) / 7) % 4]; }
export function ensureKingdom(s) {
  if (!s.fantasy || typeof s.fantasy !== 'object') s.fantasy = {};
  const f = s.fantasy;
  f.rank = Math.max(0, Math.min(6, f.rank | 0));
  for (const key of ['reputation', 'popularity', 'royalFavor']) f[key] = bound(f[key]);
  s.player.gold = Math.max(0, Math.floor(Number(s.player.gold) || 0));
  f.tradeRuns = Math.max(0, f.tradeRuns | 0);
  f.threat = Math.max(0, Math.min(100, f.threat | 0));
  return f;
}
export function awardMerit(s, activity) {
  const f = ensureKingdom(s);
  const gain = { labor: [2, 1, 0], help: [2, 3, 1], royalQuest: [3, 2, 4], defense: [4, 3, 4], trade: [1, 1, 1] }[activity];
  if (!gain) return false;
  ['reputation','popularity','royalFavor'].forEach((k,i) => { f[k] = bound(f[k] + gain[i]); });
  return true;
}
export function canAppoint(s) {
  const f = ensureKingdom(s), next = ROYAL_RANKS[f.rank + 1];
  if (!next) return { ok: false, msg: 'เจ้าเป็นอัครมหาเสนาบดีแล้ว' };
  const missing = ['reputation', 'popularity', 'royalFavor'].filter(k => f[k] < next[k]);
  return missing.length ? { ok: false, msg: 'ยังขาด ' + missing.join(', '), missing, next: next.th } : { ok: true, next: next.th };
}
export function requestRoyalAppointment(s) {
  const result = canAppoint(s); if (!result.ok) return result;
  const f = ensureKingdom(s); f.rank++;
  f.lastAppointmentDay = s.day;
  return { ok: true, rank: f.rank, title: ROYAL_RANKS[f.rank].th };
}
export function exchangeCurrency(s, kind) {
  ensureKingdom(s);
  if (kind === 'buyGold') {
    if ((s.player.coins || 0) < 100) return { ok: false, msg: 'ต้องมีเหรียญเงิน 100' };
    s.player.coins -= 100; s.player.gold += 1;
  } else if (kind === 'sellGold') {
    if (s.player.gold < 1) return { ok: false, msg: 'ทองคำไม่เพียงพอ' };
    s.player.gold -= 1; s.player.coins += 100;
  } else return { ok: false, msg: 'รายการแลกเงินไม่ถูกต้อง' };
  return { ok: true, silver: s.player.coins, gold: s.player.gold };
}
export function tradeWithTown(s, good = 'wood') {
  const f = ensureKingdom(s);
  const amounts = { wood: [8, 18], stone: [5, 18], food: [3, 13] }, a = amounts[good];
  if (!a || !Number.isFinite(s.player[good]) || s.player[good] < a[0]) return { ok: false, msg: 'สินค้าไม่พอสำหรับเกวียนการค้า' };
  const mult = seasonAt(s.day) === 'ฤดูหนาว' && good === 'food' ? 2 : 1;
  s.player[good] -= a[0]; s.player.coins += a[1] * mult; f.tradeRuns++;
  awardMerit(s, 'trade');
  return { ok: true, revenue: a[1] * mult, good, count: a[0] };
}
/** Day-scoped deterministic raid signal; doesn't silently rob the player. Guard investment uses town treasury. */
export function kingdomNewDay(s) {
  const f = ensureKingdom(s);
  if (f.lastDailyDay === s.day) return null;
  f.lastDailyDay = s.day;
  if (s.day % 7 === 1) f.threat = Math.min(100, f.threat + 8);
  if (f.threat < 35 || s.day % 7 !== 0) return { kind: 'season', name: seasonAt(s.day) };
  const safe = (s.town?.treasury || 0) >= 40 && (s.town?.stage || 0) >= 2;
  if (safe) { s.town.treasury -= 15; f.threat = Math.max(0, f.threat - 30); awardMerit(s, 'defense'); }
  else f.threat = Math.max(0, f.threat - 10);
  return { kind: 'raid', defended: safe, msg: safe ? 'ทหารหลวงป้องกันศัตรูได้ ค่าซ่อมป้อม 15 เหรียญเงิน' : 'มีสัตว์ประหลาดแถวชายแดน แต่ยังไม่มีทรัพย์สินเสียหาย' };
}

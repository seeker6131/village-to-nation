// v0.26 civil service ladder (สายข้าราชการ), separate from politics like in real Thailand:
//   เจ้าหน้าที่ฝึกหัด → เจ้าหน้าที่ → ปลัดอำเภอ → นายอำเภอ → ผู้ว่าราชการจังหวัด
// Promotion needs days served + education (knowledge) + the office existing in the area (a district office from
// อำเภอ, a provincial hall from จังหวัด). Salary is paid by the central government and taxed like any wage.
// A civil servant cannot hold an elected office at the same time: to run for election you resign first, and the
// elected leader cannot take civil-service shifts. Nothing here can be bought.
import { addHistory, logEvent } from './gameState.js';
import { tierOf } from './villageLayout.js';
import { payIncome } from './economy.js';

export const CIVIL_RANKS = [
  { th: 'เจ้าหน้าที่ฝึกหัด', shifts: 0, knowledge: 2, tier: 1, pay: 40 },
  { th: 'เจ้าหน้าที่', shifts: 5, knowledge: 3, tier: 1, pay: 55 },
  { th: 'ปลัดอำเภอ', shifts: 14, knowledge: 6, tier: 3, pay: 85 },
  { th: 'นายอำเภอ', shifts: 30, knowledge: 9, tier: 3, pay: 125 },
  { th: 'ผู้ว่าราชการจังหวัด', shifts: 50, knowledge: 13, tier: 4, pay: 180 },
];
export const SHIFT_ENERGY = 35;

export function ensureCivil(s) {
  const c = s.civilService = s.civilService || { rank: 'ประชาชน', examPassed: false, lastShiftDay: 0, shifts: 0 };
  if (!Number.isInteger(c.grade)) c.grade = c.examPassed ? Math.max(0, CIVIL_RANKS.findIndex(r => r.th === c.rank)) : -1;
  if (c.examPassed && c.grade < 0) c.grade = 0;
  c.resigned = !!c.resigned;
  return c;
}
export const isCivilServant = s => { const c = ensureCivil(s); return c.examPassed && !c.resigned; };

/** Next promotion and what is missing (pure). */
export function nextPromotion(s) {
  const c = ensureCivil(s), next = CIVIL_RANKS[c.grade + 1];
  if (!next) return null;
  const t = tierOf(s), miss = [];
  if (c.shifts < next.shifts) miss.push(`วันทำงาน ${c.shifts}/${next.shifts}`);
  if ((s.player.knowledge || 0) < next.knowledge) miss.push(`ความรู้ ${s.player.knowledge}/${next.knowledge}`);
  if (t < next.tier) miss.push(next.tier >= 4 ? 'พื้นที่ต้องเป็นจังหวัด (มีศาลากลาง)' : 'พื้นที่ต้องเป็นอำเภอ (มีที่ว่าการอำเภอ)');
  return { rank: next, missing: miss };
}

export function civilShift(s) {
  const c = ensureCivil(s);
  if (!c.examPassed) return { ok: false, msg: 'ต้องสอบเข้าราชการก่อน' };
  if (c.resigned) return { ok: false, msg: 'ลาออกจากราชการแล้ว (เพื่อเล่นการเมือง) — สอบเข้าใหม่ได้เมื่อไม่ได้ดำรงตำแหน่งการเมือง' };
  if (s.leadership?.isLeader) return { ok: false, msg: 'ดำรงตำแหน่งการเมืองอยู่ ทำงานราชการพร้อมกันไม่ได้ (แยกสายตามกฎหมาย)' };
  if (c.lastShiftDay === s.day) return { ok: false, msg: 'วันนี้เข้าเวรราชการแล้ว กลับมาวันพรุ่งนี้' };
  if (s.player.stamina < SHIFT_ENERGY) return { ok: false, msg: `เข้าเวรเต็มวันต้องใช้พลังงาน ${SHIFT_ENERGY}` };
  s.player.stamina -= SHIFT_ENERGY; c.lastShiftDay = s.day; c.shifts++;
  let promo = '';
  const np = nextPromotion(s);
  if (np && !np.missing.length) { c.grade++; c.rank = CIVIL_RANKS[c.grade].th; promo = ` · 🎖️ เลื่อนตำแหน่งเป็น${c.rank}!`; addHistory(s, `เลื่อนตำแหน่งราชการเป็น${c.rank}`); }
  const R = CIVIL_RANKS[c.grade], { net, tax } = payIncome(s, R.pay, 'เงินเดือนราชการ');
  logEvent(s, `เข้าเวรราชการ +${net} เหรียญ`);
  return { ok: true, msg: `📋 ${R.th} เข้าเวรเต็มวัน เงินเดือน ${R.pay} (หักภาษี ${tax}) รับ ${net}${promo}`, pay: net };
}
/** Leave the civil service (needed before running for an elected office). The record of service is kept. */
export function resignCivil(s) {
  const c = ensureCivil(s);
  if (!c.examPassed || c.resigned) return { ok: false, msg: 'ไม่ได้รับราชการอยู่' };
  c.resigned = true; addHistory(s, `ลาออกจากราชการ (${c.rank}) เพื่อลงสนามการเมือง`);
  return { ok: true, msg: 'ลาออกจากราชการแล้ว ลงสมัครรับเลือกตั้งได้ (เส้นทางราชการกับการเมืองแยกกัน)' };
}
/** Return to the civil service after politics (not while holding an elected office). Keeps rank and days served. */
export function rejoinCivil(s) {
  const c = ensureCivil(s);
  if (!c.resigned) return { ok: false, msg: 'ยังรับราชการอยู่' };
  if (s.leadership?.isLeader) return { ok: false, msg: 'ต้องพ้นจากตำแหน่งการเมืองก่อน' };
  c.resigned = false; addHistory(s, `กลับเข้ารับราชการ (${c.rank})`);
  return { ok: true, msg: `กลับเข้ารับราชการในตำแหน่ง${c.rank}` };
}

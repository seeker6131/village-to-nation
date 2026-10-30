// v0.8 jobs & careers. A job is accepted from the jobs menu / board, then the player must walk to the
// work place and interact there. Pay is earned in-game only; careers give a small pay bonus earned by working.
import { ensureTown, structurePos, isDone } from './npcs.js';
import { activeSites, findStructure, HELP_WORK, ensureConstruction } from './construction.js';
import { gainXp, giveItem, itemCount, spendItem } from './systems.js';
import { POINTS } from './world.js';
import { logEvent, addHistory } from './gameState.js';

export const CAREERS = {
  courier: { th: 'คนส่งของ', icon: '📦', outfit: null },
  farmer: { th: 'เกษตรกร', icon: '🌾', outfit: 'farmer' },
  builder: { th: 'ช่างก่อสร้าง', icon: '🔨', outfit: 'builder' },
  trader: { th: 'พ่อค้าแม่ค้า', icon: '🧺', outfit: 'trader' },
};
export const CAREER_OUTFIT_JOBS = 3; // jobs needed in a career to unlock its work outfit

export const JOBS = {
  delivery: { th: 'ส่งพัสดุ', icon: '📦', career: 'courier', energy: 6, pay: 12, xp: 9, desc: 'รับพัสดุที่กระดานประกาศ แล้วเดินไปส่งที่ร้านค้าในหมู่บ้าน' },
  farmhand: { th: 'ช่วยงานสวนอาหาร', icon: '🌾', career: 'farmer', energy: 10, pay: 14, xp: 8, needs: 'farm', desc: 'ไปที่สวนอาหารชุมชน ช่วยลุงมีเก็บผัก ได้ค่าแรง + ผัก 1' },
  haul: { th: 'ขนวัสดุไปไซต์ก่อสร้าง', icon: '🧱', career: 'builder', energy: 10, pay: 10, xp: 8, needs: 'construction', desc: `เดินไปไซต์ที่กำลังสร้าง ช่วยงาน +${HELP_WORK} นาทีงาน และรับค่าแรง` },
  workshift: { th: 'กะโรงงานงานฝีมือ', icon: '🛠️', career: 'builder', energy: 12, pay: 16, xp: 10, needs: 'workshop', desc: 'ไปที่โรงงานของคุณ แปรรูปไม้ให้ช่าง ได้ค่าแรง + แผ่นไม้ 1' },
  stall: { th: 'ช่วยขายของที่ตลาด', icon: '🧺', career: 'trader', energy: 8, pay: 10, xp: 7, needs: 'market', desc: 'ไปช่วยป้าแสงขายของในตลาด ถ้ามีผักติดตัวจะขายได้ราคาพิเศษ' },
};

export function ensureJobs(s) {
  ensureTown(s); ensureConstruction(s);
  s.career = s.career && typeof s.career === 'object' ? s.career : { id: null, jobs: {} };
  s.career.jobs = s.career.jobs || {};
  if (s.job && !JOBS[s.job.id]) s.job = null;
  s.job = s.job || null;
  s.unlockedOutfits = Array.isArray(s.unlockedOutfits) ? s.unlockedOutfits : [];
  return s;
}

export function jobAvailable(s, id) {
  ensureJobs(s);
  const j = JOBS[id];
  if (!j) return { ok: false, reason: 'ไม่พบงาน' };
  if (j.needs === 'farm' && !isDone(s, 'farm')) return { ok: false, reason: 'ต้องสร้างสวนอาหารชุมชนให้เสร็จก่อน' };
  if (j.needs === 'market' && !isDone(s, 'market')) return { ok: false, reason: 'ต้องสร้างตลาดหมู่บ้านให้เสร็จก่อน' };
  if (j.needs === 'workshop' && !s.placed.some(p => p.type === 'workshop' && p.level >= 1)) return { ok: false, reason: 'ต้องสร้างโรงงานงานฝีมือก่อน (เมนูก่อสร้าง)' };
  if (j.needs === 'construction' && !activeSites(s).length) return { ok: false, reason: 'ตอนนี้ไม่มีไซต์ก่อสร้าง' };
  return { ok: true, reason: 'รับงานได้' };
}

/** Where the active job must be completed: {x,y} tile and a structure ref (if any). */
export function jobTarget(s) {
  ensureJobs(s);
  if (!s.job) return null;
  const id = s.job.id;
  if (id === 'delivery') return s.deliveries?.holding ? { tile: [POINTS.delivery.x, POINTS.delivery.y], ref: 'delivery', label: 'จุดส่งของ' } : { tile: [POINTS.board.x, POINTS.board.y], ref: 'board', label: 'กระดานงาน' };
  if (id === 'farmhand') return { tile: structurePos(s, 'farm'), ref: 'farm', label: 'สวนอาหาร' };
  if (id === 'stall') return { tile: structurePos(s, 'market'), ref: 'market', label: 'ตลาด' };
  if (id === 'workshift') { const w = s.placed.find(p => p.type === 'workshop' && p.level >= 1); return w ? { tile: structurePos(s, w.uid), ref: w.uid, label: 'โรงงาน' } : null; }
  if (id === 'haul') { const ref = s.job.site && findStructure(s, s.job.site)?.obj.status === 'building' ? s.job.site : activeSites(s)[0]; return ref ? { tile: structurePos(s, ref), ref, label: findStructure(s, ref).name } : null; }
  return null;
}

export function acceptJob(s, id) {
  ensureJobs(s);
  if (s.job) return { ok: false, msg: `ทำงาน "${JOBS[s.job.id].th}" อยู่ ทำให้เสร็จหรือยกเลิกก่อน` };
  const a = jobAvailable(s, id);
  if (!a.ok) return { ok: false, msg: a.reason };
  s.job = { id, acceptedDay: s.day };
  if (id === 'haul') s.job.site = activeSites(s)[0];
  if (id === 'delivery') { s.deliveries.holding = true; }
  return { ok: true, msg: id === 'delivery' ? 'รับพัสดุแล้ว! เดินไปจุดส่งของที่ร้านค้า (มีลูกศรนำทาง)' : `รับงาน ${JOBS[id].th} แล้ว เดินไปที่${jobTarget(s)?.label || 'จุดทำงาน'}` };
}
export function cancelJob(s) {
  ensureJobs(s);
  if (!s.job) return { ok: false, msg: 'ไม่มีงานที่รับไว้' };
  if (s.job.id === 'delivery') s.deliveries.holding = false;
  const name = JOBS[s.job.id].th; s.job = null;
  return { ok: true, msg: `ยกเลิกงาน ${name} (ไม่มีบทลงโทษ)` };
}

export function careerBonus(s, jobId) { return s.career?.id && JOBS[jobId]?.career === s.career.id ? 1.2 : 1; }

/** Complete the active job when the player interacts at `ref`. */
export function workAt(s, ref) {
  ensureJobs(s);
  if (!s.job) return { ok: false, msg: 'ยังไม่ได้รับงาน เปิดเมนูงานก่อน' };
  const t = jobTarget(s);
  if (!t) { s.job = null; return { ok: false, msg: 'สถานที่ทำงานหายไปแล้ว ยกเลิกงานให้อัตโนมัติ' }; }
  if (t.ref !== ref) return { ok: false, msg: `งานนี้ต้องทำที่ ${t.label}` };
  const j = JOBS[s.job.id];
  if (s.player.stamina < j.energy) return { ok: false, msg: 'พลังงานไม่พอ พักหรือกินอาหารก่อน' };
  s.player.stamina -= j.energy;
  let pay = Math.round(j.pay * careerBonus(s, s.job.id));
  let extra = '';
  if (s.job.id === 'delivery') { s.deliveries.holding = false; s.stats.deliveries += 1; }
  if (s.job.id === 'farmhand') { giveItem(s, 'vegetables', 1); extra = ' + ผัก 1'; }
  if (s.job.id === 'workshift') { giveItem(s, 'planks', 1); extra = ' + แผ่นไม้ 1'; }
  if (s.job.id === 'stall' && itemCount(s, 'vegetables') > 0) { spendItem(s, 'vegetables', 1); pay += 12; extra = ' (ขายผักราคาพิเศษ +12)'; }
  if (s.job.id === 'haul') { const st = findStructure(s, t.ref); if (st) { st.obj.work = Math.min(st.obj.workNeeded, st.obj.work + HELP_WORK); } extra = ` · ไซต์ +${HELP_WORK} นาทีงาน`; }
  s.player.coins += pay; s.stats.jobsDone += 1;
  gainXp(s, j.xp);
  const c = j.career; s.career.jobs[c] = (s.career.jobs[c] || 0) + 1;
  let unlockMsg = '';
  const outfit = CAREERS[c].outfit;
  if (s.career.id === c && outfit && s.career.jobs[c] >= CAREER_OUTFIT_JOBS && !s.unlockedOutfits.includes(outfit)) {
    s.unlockedOutfits.push(outfit); unlockMsg = ` · ปลดล็อกชุด${CAREERS[c].th}ในห้องแต่งตัว!`;
    addHistory(s, `ได้รับชุดอาชีพ${CAREERS[c].th}`);
  }
  logEvent(s, `${j.th} สำเร็จ +${pay} เหรียญ`);
  s.job = null;
  return { ok: true, msg: `${j.icon} ${j.th} สำเร็จ +${pay} เหรียญ${extra}${unlockMsg}`, pay };
}

export function chooseCareer(s, id) {
  ensureJobs(s);
  if (!CAREERS[id]) return { ok: false, msg: 'ไม่พบอาชีพ' };
  if (s.career.id === id) return { ok: false, msg: 'เป็นอาชีพนี้อยู่แล้ว' };
  s.career.id = id;
  const outfit = CAREERS[id].outfit;
  if (outfit && (s.career.jobs[id] || 0) >= CAREER_OUTFIT_JOBS && !s.unlockedOutfits.includes(outfit)) s.unlockedOutfits.push(outfit);
  return { ok: true, msg: `เลือกอาชีพ ${CAREERS[id].th} · งานสายนี้ได้ค่าแรง +20%` };
}

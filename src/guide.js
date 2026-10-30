// v0.12 main objective line ("เส้นทางสู่นายก"): follows the village plan instead of a fixed list of 4 projects.
// forest -> build every slot of the plan -> exam -> leader upgrades the area -> next plan ... -> PM (online).
import { mentorObjective } from './gameState.js';
import { tierInfo, TIERS, tierOf, slotState, nextTierCheck } from './villageLayout.js';
import { population } from './npcs.js';
import { myHome } from './housing.js';

export function objective(s) {
  const m = mentorObjective(s);
  if (m.stage < 3) return m; // axe -> pickaxe -> first stone
  const mine = myHome(s);
  if (!mine) return { stage: 3, title: 'จองที่ดินบ้านของตัวเอง', detail: 'เมนู 🏠 บ้าน → เลือกแปลงว่างในผัง (ค่าโอน 10 เหรียญ)', progress: 0 };
  if (!s.career?.id) return { stage: 3, title: 'เลือกอาชีพ', detail: 'เมนู 💼 งาน → อาชีพ · ทำงานได้ค่าแรงไว้สร้างบ้าน', progress: .2 };
  if (slotState(s, mine).state === 'empty') return { stage: 3, title: 'สร้างบ้านของตัวเอง', detail: `${mine.name}: ถางแปลงแล้วสร้างบ้าน (เมนู 🏠 บ้าน)`, progress: .4 };
  const T = tierInfo(s), slots = T.slots, done = slots.filter(x => slotState(s, x).state === 'done').length;
  // houses of other villagers are built by their owners; the leader's list is the public buildings
  const todo = slots.filter(x => x.kind !== 'cottage').find(x => slotState(s, x).state !== 'done');
  if (todo) {
    const st = slotState(s, todo).state;
    return { stage: 3, title: `สร้างตามผัง${T.th} ${done}/${slots.length}`, detail: `${todo.name}: ${st === 'building' ? 'กำลังสร้าง — ช่วยสร้างได้ที่ไซต์' : 'ถางหมุดที่ดินแล้วเริ่มสร้าง (เมนูก่อสร้าง)'}`, progress: done / Math.max(1, slots.length) };
  }
  if (s.player.knowledge < 3) return { stage: 4, title: 'อ่านหนังสือเตรียมสอบ', detail: `เพิ่มความรู้ ${s.player.knowledge}/3 ที่ขอนไม้นั่งเรียนหรือเมนู`, progress: s.player.knowledge / 3 };
  if (!s.examPassed) return { stage: 5, title: 'สอบผู้นำก่อนหมดวาระ', detail: 'ไม่ผ่านข้อสอบ = ลงเลือกตั้งสมัยหน้าไม่ได้ (เมนูผู้นำ)', progress: 0 };
  const L = s.leadership;
  if (L && !L.isLeader) return { stage: 6, title: 'ทวงตำแหน่งคืนในการเลือกตั้งครั้งหน้า', detail: `ตอนนี้${L.leaderName || 'NPC'}เป็นผู้นำ · ทำงานจิตอาสาสะสมผลงาน (เมนูผู้นำ) อ่านหนังสือ และช่วยชาวบ้านให้มีความสุข`, progress: 0 };
  if (tierOf(s) >= 5) return L?.pm ? { stage: 9, title: '🇹🇭 คุณคือนายกรัฐมนตรี!', detail: 'รักษาความนิยม บริหารงบประเทศ มือสะอาด — ครบ 2 สมัยติดต้องเว้นวาระ', progress: 1 }
    : { stage: 8, title: 'ชนะเลือกตั้งทั่วไป แล้วให้สภาลงมติเลือกเป็นนายกฯ', detail: `ต้องได้ที่นั่งพรรค + พรรคร่วมเกิน 250 · ผลงานทางการเมือง ${Math.floor(L?.record || 0)} (ยิ่งมากยิ่งได้ที่นั่ง) · มือสะอาด = มีพรรคร่วม`, progress: .8 };
  const c = nextTierCheck(s, population(s));
  if (c.next && !c.next.locked) {
    if (c.ok) return { stage: 6, title: `ยกระดับเป็น${c.next.th}!`, detail: `เมนูก่อสร้าง → ผังหมู่บ้าน → กด "ยกระดับ" แล้วคุณจะเป็น${c.next.title}`, progress: 1 };
    const miss = c.items.find(i => !i.ok);
    return { stage: 6, title: `เตรียมยกระดับเป็น${c.next.th}`, detail: `${miss.label}${miss.note ? ` (${miss.note})` : ''}`, progress: c.items.filter(i => i.ok).length / c.items.length };
  }
  if (m.stage >= 6) return { ...m, detail: m.stage === 8 ? `คุณคือ${tierInfo(s).title} · ขั้นต่อไป: ${TIERS[tierOf(s)]?.th || '—'} (${TIERS[tierOf(s)]?.locked || ''})` : m.detail };
  return m;
}

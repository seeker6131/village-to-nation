// Village growth stages and long-term leadership ladder.
// Stages are earned from what exists in the world, never purchased.
import { ensureTown, population, isDone } from './npcs.js';
import { addHistory, PROJECT_ORDER } from './gameState.js';

export const STAGES = [
  { id: 'camp', th: 'ค่ายบุกเบิก', en: 'Pioneer camp', icon: '⛺' },
  { id: 'village', th: 'หมู่บ้าน', en: 'Village', icon: '🏡', need: 'สร้างทุกแปลงในผังค่ายบุกเบิก · ประชากร 6 · ผู้นำกดยกระดับ' },
  { id: 'community', th: 'อำเภอ', en: 'District', icon: '🏘️', need: 'สร้างทุกแปลงในผังหมู่บ้าน · ประชากร 26 · ผู้ใหญ่บ้านกดยกระดับ (ผังเมืองอำเภอดูได้ที่ 🏙)' },
  { id: 'town', th: 'จังหวัด', en: 'Province', icon: '🏙️', need: 'ต้องมีระบบออนไลน์ (หลายอำเภอรวมกัน)' },
  { id: 'nation', th: 'ประเทศ', en: 'Nation', icon: '🇹🇭', need: 'ต้องมีระบบออนไลน์ หลายจังหวัด และการเลือกตั้งจริง (ยังไม่เปิดในเวอร์ชันนี้)', locked: true },
];

export function computeStage(s) {
  ensureTown(s);
  const pop = population(s);
  const upgrades = Object.values(s.publicSites).reduce((n, o) => n + Math.max(0, (o.level || 0) - 1), 0)
    + s.placed.reduce((n, p) => n + Math.max(0, (p.level || 0) - 1), 0);
  let i = 0;
  if (isDone(s, 'home') && isDone(s, 'farm')) i = 1;
  if (i === 1 && PROJECT_ORDER.every(k => isDone(s, k)) && pop >= 12) i = 2;
  if (i === 2 && pop >= 16 && s.town.happiness >= 70 && upgrades >= 3 && s.election?.leader === 'player') i = 3;
  return i;
}

/**
 * v0.12: the area no longer grows by itself — the leader upgrades it when the village plan is complete
 * (villageLayout.upgradeVillage). This only initialises the stage of saves that never had one.
 * computeStage() is kept as the legacy rule (used for that migration).
 */
export function updateStage(s) {
  ensureTown(s);
  if (!Number.isInteger(s.town.stage)) s.town.stage = 0;
  return null;
}

/** Political ladder. Every rung needs qualifications + track record + an election. Nothing is for sale. */
export const LEADERSHIP_LADDER = [
  { id: 'community', th: 'ผู้นำชุมชน', status: 'playable', req: 'ผ่านข้อสอบผู้นำ · ผลงานชุมชน 12 · โครงการครบ 4 · ชนะเลือกตั้ง (จำลอง NPC)' },
  { id: 'mayor', th: 'นายกเทศมนตรี', status: 'design', req: 'พื้นที่เป็น "เมือง" · ดำรงตำแหน่งผู้นำชุมชนครบวาระ · ผลงานนโยบาย · เลือกตั้งโดยผู้เล่นจริง' },
  { id: 'governor', th: 'ผู้ว่าการภูมิภาค', status: 'design', req: 'หลายเมืองในภูมิภาค · ประวัติบริหารงบ · เลือกตั้งออนไลน์' },
  { id: 'pm', th: 'นายกรัฐมนตรี', status: 'design', req: 'มีประเทศจริงของผู้เล่น · คุณสมบัติ · ผลงาน · การเลือกตั้งระดับประเทศที่ตรวจสอบได้ — ไม่สามารถซื้อหรือจ่ายเงินปลดล็อกได้' },
];

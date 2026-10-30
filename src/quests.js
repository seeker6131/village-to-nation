// v0.8 NPC requests. Accept by talking to the NPC; hand in by talking to the same NPC again.
import { itemCount, spendItem, giveItem, gainXp, MARKET } from './systems.js';
import { addHistory } from './gameState.js';

export const NPC_QUESTS = [
  { id: 'chai_wood', npc: 'chai', title: 'ไม้สำหรับนั่งร้าน', need: { wood: 6 }, reward: { coins: 25, xp: 12, civic: 1 }, text: 'ช่วยหาไม้ 6 ท่อนมาทำนั่งร้านหน่อยได้ไหม' },
  { id: 'saeng_veg', npc: 'saeng', title: 'ผักสดให้แผงป้า', need: { vegetables: 3 }, reward: { coins: 30, xp: 15, civic: 1 }, text: 'ป้าอยากได้ผักสด 3 ชิ้นไปทำกับข้าวขาย ปลูกเองที่แปลงผักก็ได้นะ' },
  { id: 'mee_seed', npc: 'mee', title: 'เมล็ดพันธุ์ใหม่', need: { seed: 3 }, reward: { food: 3, xp: 10 }, text: 'ลุงอยากลองปลูกผักพันธุ์ใหม่ หาเมล็ดมาให้ 3 ถุงได้ไหม' },
  { id: 'fah_study', npc: 'fah', title: 'นักเรียนขยัน', cond: { knowledge: 3 }, reward: { coins: 15, xp: 20 }, text: 'ลองอ่านหนังสือจนความรู้ถึง 3 แล้วมาบอกครูนะ' },
  { id: 'mentor_bench', npc: 'mentor', title: 'ที่นั่งพักของชาวบ้าน', cond: { built: 'bench' }, reward: { coins: 10, civic: 2, xp: 12 }, text: 'ชาวบ้านอยากมีที่นั่งพักตอนเย็น สร้างม้านั่งชุมชนให้สักตัวนะ' },
  { id: 'da_cottage', npc: 'da', title: 'บ้านสำหรับคนใหม่', cond: { built: 'cottage' }, reward: { coins: 40, civic: 2, xp: 20 }, text: 'มีคนอยากย้ายมาอยู่ ถ้ามีบ้านพักชาวบ้านสักหลังคงดี' },
  { id: 'nid_deliver', npc: 'nid', title: 'คนส่งของมือใหม่', cond: { deliveries: 3 }, reward: { coins: 20, xp: 15 }, text: 'ลองส่งพัสดุให้ครบ 3 ครั้ง แล้วพี่จะให้รางวัล' },
  { id: 'mali_food', npc: 'mali', title: 'วัตถุดิบครัว', need: { food: 2, vegetables: 2 }, reward: { coins: 34, xp: 14, civic: 1 }, text: 'ร้านอาหารของฉันขาดวัตถุดิบ ขออาหาร 2 กับผัก 2 นะ' },
];

export function ensureQuests(s) { s.npcQuests = s.npcQuests && typeof s.npcQuests === 'object' ? s.npcQuests : {}; return s; }
export function questsFor(npcId) { return NPC_QUESTS.filter(q => q.npc === npcId); }
export function questStatus(s, id) { ensureQuests(s); return s.npcQuests[id] || 'available'; }

export function questReady(s, q) {
  if (q.need) return Object.entries(q.need).every(([k, v]) => itemCount(s, k) >= v);
  const c = q.cond || {};
  if (c.knowledge && s.player.knowledge < c.knowledge) return false;
  if (c.deliveries && (s.stats.deliveries || 0) < c.deliveries) return false;
  if (c.built && !s.placed.some(p => p.type === c.built && (p.level || 0) >= 1)) return false;
  return true;
}
export function questProgressText(s, q) {
  if (q.need) return Object.entries(q.need).map(([k, v]) => `${MARKET[k]?.icon || ''} ${MARKET[k]?.name || k} ${Math.min(itemCount(s, k), v)}/${v}`).join(' · ');
  const c = q.cond;
  if (c.knowledge) return `ความรู้ ${Math.min(s.player.knowledge, c.knowledge)}/${c.knowledge}`;
  if (c.deliveries) return `ส่งพัสดุ ${Math.min(s.stats.deliveries || 0, c.deliveries)}/${c.deliveries}`;
  if (c.built) return s.placed.some(p => p.type === c.built && (p.level || 0) >= 1) ? 'สร้างแล้ว ✓' : 'ยังไม่ได้สร้าง';
  return '';
}
export function rewardText(r) { return [r.coins ? `🪙${r.coins}` : '', r.food ? `🍞${r.food}` : '', r.xp ? `⭐${r.xp} XP` : '', r.civic ? `🏛 ผลงาน +${r.civic}` : ''].filter(Boolean).join(' '); }

export function acceptQuest(s, id) {
  ensureQuests(s);
  const q = NPC_QUESTS.find(x => x.id === id);
  if (!q) return { ok: false, msg: 'ไม่พบภารกิจ' };
  if (questStatus(s, id) !== 'available') return { ok: false, msg: 'รับภารกิจนี้แล้ว' };
  if (Object.values(s.npcQuests).filter(v => v === 'active').length >= 3) return { ok: false, msg: 'รับภารกิจได้พร้อมกันสูงสุด 3 อย่าง' };
  s.npcQuests[id] = 'active';
  return { ok: true, msg: `รับภารกิจ "${q.title}" แล้ว` };
}
export function turnInQuest(s, id) {
  ensureQuests(s);
  const q = NPC_QUESTS.find(x => x.id === id);
  if (!q || questStatus(s, id) !== 'active') return { ok: false, msg: 'ยังไม่ได้รับภารกิจนี้' };
  if (!questReady(s, q)) return { ok: false, msg: `ยังไม่ครบ: ${questProgressText(s, q)}` };
  if (q.need) for (const [k, v] of Object.entries(q.need)) spendItem(s, k, v);
  const r = q.reward;
  if (r.coins) s.player.coins += r.coins;
  if (r.food) giveItem(s, 'food', r.food);
  if (r.civic) s.player.civic += r.civic;
  if (r.xp) gainXp(s, r.xp);
  s.npcQuests[id] = 'done';
  addHistory(s, `ทำภารกิจ "${q.title}" สำเร็จ`);
  return { ok: true, msg: `ภารกิจสำเร็จ! ${rewardText(r)}` };
}

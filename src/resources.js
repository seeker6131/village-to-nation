// Harvesting the wild: trees (axe) and rocks (pickaxe). Felled trees leave stumps that must be dug out
// before the land can be built on. NPC helpers use npcWork() to clear the forest around the village.
import { villageRadius } from './villageLayout.js';
import { nodeStatus, nodeState, setNode, nodeById, TREES, CENTER, VILLAGE_RADIUS, CLEARING_R, plotObstacles } from './world.js';
import { gather, logEvent } from './gameState.js';
import { gainXp, itemCount, giveItem } from './systems.js';

export const HITS_TO_FELL = 3, HITS_TO_BREAK = 3, DIG_ENERGY = 3;

export function nodeLabel(s, n) {
  const st = nodeStatus(s, n), hits = Number(nodeState(s, n.id)) || 0;
  if (n.type === 'wood') return st === 'stump' ? 'ตอไม้' : n.kind === 3 ? 'ต้นผลไม้' : n.kind === 4 ? 'ต้นสน' : 'ต้นไม้';
  return st === 'gone' ? '' : n.kind === 1 ? 'หินมีแร่' : `ก้อนหิน${hits ? ` (${hits}/${HITS_TO_BREAK})` : ''}`;
}

/** Player hits a tree/rock/stump with the right tool. */
export function hitNode(s, id) {
  const n = nodeById(id);
  if (!n) return { ok: false, msg: 'ไม่พบสิ่งนี้' };
  const st = nodeStatus(s, n);
  if (st === 'gone') return { ok: false, msg: 'ตรงนี้โล่งแล้ว' };
  if (n.type === 'wood' && st === 'stump') {
    if (s.player.stamina < DIG_ENERGY) return { ok: false, msg: 'เหนื่อยแล้ว พักหรือกินอาหารก่อน' };
    s.player.stamina -= DIG_ENERGY; setNode(s, id, 'x'); gainXp(s, 2);
    return { ok: true, msg: 'ขุดตอไม้ออกแล้ว ได้ที่ดินโล่ง 1 ช่อง', cleared: true };
  }
  const tool = n.type === 'wood' ? 'axe' : 'pickaxe';
  if (itemCount(s, tool) < 1) return { ok: false, msg: n.type === 'stone' ? 'ต้องมีอีเต้อก่อน (เมนูผลิต: ไม้ 4 → อีเต้อ)' : 'ต้องมีขวาน' };
  const r = gather(s, n.type);
  if (!r.ok) return r;
  gainXp(s, 3);
  const hits = (Number(nodeState(s, id)) || 0) + 1;
  if (n.type === 'wood') {
    if (hits >= HITS_TO_FELL) {
      const inVillage = inLayout(s, n);
      setNode(s, id, inVillage ? 'x' : 's'); felledAt(s, id, inVillage); giveItem(s, 'wood', 1); s.stats.woodGathered += 1; s.stats.treesFelled = (s.stats.treesFelled || 0) + 1;
      let extra = ''; if (n.kind === 3) { giveItem(s, 'food', 2); extra = ' + ผลไม้ 2'; }
      return { ok: true, msg: inVillage ? `🌳 ต้นไม้ล้ม! ไม้ +2${extra} · ที่ดินในผังหมู่บ้านโล่งถาวร` : `🌳 ต้นไม้ล้ม! ไม้ +2${extra} · นอกเขตหมู่บ้าน ตอไม้จะงอกใหม่ใน ${REGROW_DAYS} วัน (ขุดตอทิ้งได้)`, felled: true };
    }
    setNode(s, id, hits);
    return { ok: true, msg: `🪓 ฟันต้นไม้ ไม้ +1 (${hits}/${HITS_TO_FELL})` };
  }
  if (hits >= HITS_TO_BREAK) {
    setNode(s, id, 'x'); giveItem(s, 'stone', 1); s.stats.stoneGathered += 1;
    let extra = ''; if (n.kind === 1) { s.player.coins += 6; extra = ' + แร่ขายได้ 6 เหรียญ'; }
    return { ok: true, msg: `🪨 หินแตก! หิน +2${extra}`, broken: true };
  }
  setNode(s, id, hits);
  return { ok: true, msg: `⛏️ ขุดหิน หิน +1 (${hits}/${HITS_TO_BREAK})` };
}

/**
 * Trees NPC helpers should clear, in priority order: first anything inside the public plots that are not
 * built yet, then trees around the village (never deep forest). Pure: depends only on state.
 */
export function clearingTargets(s, limit = 12) {
  const out = [], seen = new Set();
  for (const id of ['home', 'farm', 'market', 'hall']) {
    if (s.publicSites?.[id]?.level >= 1 || s.publicSites?.[id]?.status === 'building') continue;
    for (const n of plotObstacles(s, id)) if (n.type === 'wood' && !seen.has(n.id)) { seen.add(n.id); out.push(n); }
  }
  if (out.length < limit) {
    const ring = TREES.filter(n => !seen.has(n.id) && nodeStatus(s, n) !== 'gone')
      .map(n => [n, Math.hypot(n.x - CENTER.x, n.y - CENTER.y)]).filter(([, d]) => d > CLEARING_R && d < VILLAGE_RADIUS - 6)
      .sort((a, b) => a[1] - b[1]).slice(0, limit - out.length).map(([n]) => n);
    out.push(...ring);
  }
  return out.slice(0, limit);
}

/** One hour of NPC woodcutting on a node: fells/digs, wood goes to the village market stock. */
export function npcWork(s, id) {
  const n = nodeById(id); if (!n || n.type !== 'wood') return null;
  const st = nodeStatus(s, n);
  if (st === 'gone') return null;
  if (st === 'stump') { setNode(s, id, 'x'); return 'dug'; }
  const hits = (Number(nodeState(s, id)) || 0) + 1;
  s.market.wood = Math.min(60, (s.market.wood || 0) + 1);
  if (hits >= HITS_TO_FELL) { const inV = inLayout(s, n); setNode(s, id, inV ? 'x' : 's'); felledAt(s, id, inV); s.stats.npcTreesFelled = (s.stats.npcTreesFelled || 0) + 1; logEvent(s, 'ชาวบ้านโค่นต้นไม้ 1 ต้น ไม้เข้าตลาด'); return 'felled'; }
  setNode(s, id, hits); return 'hit';
}

// v0.17: trees cleared inside the village layout are gone for good; outside it the stump regrows into a tree
export const REGROW_DAYS = 3;
export function inLayout(s, n) { return Math.hypot(n.x - CENTER.x, n.y - CENTER.y) <= villageRadius(s) + 1; }
function felledAt(s, id, inVillage) { s.world.felled = s.world.felled || {}; if (inVillage) delete s.world.felled[id]; else s.world.felled[id] = s.day; }
/** Once per game day: stumps (and dug-out spots) outside the layout grow back into trees. Returns how many regrew. */
export function regrowDay(s) {
  const F = s.world?.felled; if (!F) return 0;
  let n = 0;
  for (const [id, day] of Object.entries(F)) {
    const node = nodeById(id);
    if (!node || inLayout(s, node)) { delete F[id]; continue; } // the village grew over it: stays cleared
    if (s.day - day >= REGROW_DAYS) { delete s.world.n[id]; delete F[id]; s.world.ver++; n++; }
  }
  return n;
}

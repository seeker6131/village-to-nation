// v0.20 multi-map world (step 1 of the nation-scale plan): the player's own village is one map; the district has
// other villages (stand-ins for other online players' towns, each with its own layout out of 10) and the district
// seat; later the province seat and the capital. Travel from the bus stop at the village gate (or key G / ☰ menu).
// Other maps are built from (seed, layout, level) and shown fully developed; they are visit-only: what you carry and
// earn (coins, items, xp, energy, time) comes home with you, building and land claims happen only in your own town.
import { G, rebuildNpcs, resetNpcPlans, rebuildAnimals, saveNow } from './game.js';
import { createInitialState, deepClone } from '../gameState.js';
import { ensureWorld, PLANS, TILE, CENTER, SPAWN } from '../world.js';
import { fillLevel } from '../showcase.js';
import { STAGES } from '../progression.js';
import { districtFocus } from '../cityPlan.js';

const FOUNDERS = ['ลุงสมชาย', 'ป้าบุญมี', 'พี่เอก', 'น้องมิว', 'ครูวิไล', 'เฮียหมง', 'ยายจันทร์', 'พี่ต้น'];
const VILLAGE_NAMES = ['บ้านหนองบัว', 'บ้านดอนแดง', 'บ้านท่าน้ำ', 'บ้านโคกสูง', 'บ้านนาเหนือ', 'บ้านห้วยทราย'];
/** Maps of the region around the player's town. need = area level (stage) the player's town must reach to go there. */
export function regionMaps(s) {
  const home = s.world?.plan || 0, seed = s.world?.seed || 1, out = [{ id: 'home', th: 'หมู่บ้านของฉัน', icon: '🏡', kind: 'home' }];
  VILLAGE_NAMES.forEach((th, i) => out.push({ id: 'v' + i, th, icon: '🏘️', kind: 'village', founder: FOUNDERS[i], plan: (home + 1 + i) % PLANS.length, seed: seed + 101 * (i + 1), stage: i < 3 ? 1 : 0, need: 0 }));
  out.push({ id: 'district', th: 'ตัวอำเภอ', icon: '🏛️', kind: 'seat', plan: (home + 7) % PLANS.length, seed: seed + 907, stage: 2, need: 0 });
  out.push({ id: 'province', th: 'ตัวจังหวัด', icon: '🏙️', kind: 'seat', plan: (home + 8) % PLANS.length, seed: seed + 1307, stage: 3, need: 1 });
  out.push({ id: 'capital', th: 'เมืองหลวง', icon: '🇹🇭', kind: 'seat', plan: (home + 9) % PLANS.length, seed: seed + 1907, stage: 4, need: 2 });
  return out;
}
const canGo = (s, m) => m.kind === 'home' || G.sandbox || (s.town?.stage || 0) >= m.need;
const KEEP = ['player', 'inventory', 'character', 'career', 'stats', 'civilService', 'job', 'quests', 'gameTime', 'day', 'tickMultiplier', 'entitlements'];
function carry(from, to) { for (const k of KEEP) if (k in from) to[k] = deepClone(from[k]); }
const cache = new Map();
function buildRemote(real, m) {
  const key = m.id + ':' + real.world.seed + ':' + real.world.plan;
  let s = cache.get(key);
  if (!s) {
    s = createInitialState();
    s.world = { seed: m.seed, biome: 'forest', plan: m.plan, planOf: m.plan, n: {}, ver: 0, layout: real.world.layout };
    s.town = s.town || {}; s.town.stage = m.stage;
    ensureWorld(s); fillLevel(s, m.stage + 1);
    s.leadership.isLeader = false; s.election.leader = 'npc'; s.leadership.leaderName = m.founder || 'ผู้นำท้องถิ่น'; // someone else's town
    s.__remote = m.id; s.__remoteName = m.th;
    cache.set(key, s);
  }
  carry(real, s);
  return s;
}
export function travelTo(id) {
  const real = G.away ? G.away.real : G.state, m = regionMaps(real).find(x => x.id === id);
  if (!m) return;
  if (!canGo(real, m)) return G.toast(`ยังไป${m.th}ไม่ได้: หมู่บ้านของมึงต้องเป็นระดับ${STAGES[m.need + 1]?.th || ''}ก่อน`, true);
  if (G.preview) G.exitShowcase();
  G.closePanel?.();
  if (G.away) { carry(G.state, G.away.real); G.state = G.away.real; G.away = null; }
  if (m.kind === 'home') {
    ensureWorld(G.state); G.state.player.x = SPAWN.x + 20 * TILE; G.state.player.y = SPAWN.y - 3 * TILE;
  } else {
    G.away = { real: G.state, id: m.id, map: m };
    G.state = buildRemote(G.state, m);
    ensureWorld(G.state);
    const f = m.kind === 'seat' ? districtFocus(m.stage + 1) : null; // arrive at the town square of the seat
    G.state.player.x = ((f ? f[0] : CENTER.x + 2) + .5) * TILE; G.state.player.y = ((f ? f[1] + 2 : CENTER.y + 4) + .5) * TILE;
  }
  rebuildNpcs(); resetNpcPlans(); rebuildAnimals();
  G.cam.follow = true; G.route = []; G.waypoint = null;
  document.querySelector('#app').classList.toggle('away', !!G.away);
  G.hud?.(); saveNow();
  G.toast(m.kind === 'home' ? '🏡 กลับถึงหมู่บ้านของตัวเองแล้ว' : `🚌 มาถึง${m.th}${m.founder ? ` (เมืองของ${m.founder})` : ''} · ${STAGES[m.stage].th} · กลับบ้านได้ที่ป้ายรถหรือปุ่ม G`);
}
export function travelBody() {
  const real = G.away ? G.away.real : G.state, here = G.away?.id || 'home';
  const rows = regionMaps(real).map(m => {
    const ok = canGo(real, m), cur = m.id === here;
    const sub = m.kind === 'home' ? `${STAGES[real.town.stage || 0].th} · ผัง${PLANS[real.world.plan || 0].th}` : `${STAGES[m.stage].th} · ผัง${PLANS[m.plan].th}${m.founder ? ` · ผู้ก่อตั้ง ${m.founder}` : ''}`;
    return `<div class="card" style="display:flex;align-items:center;gap:8px;margin:5px 0"><div style="flex:1"><b>${m.icon} ${m.th}</b>${cur ? ' 📍' : ''}<br><small>${sub}${ok ? '' : ` · 🔒 ต้องเป็นระดับ${STAGES[m.need + 1].th}`}</small></div>
      <button class="btn small" data-act="travel" data-id="${m.id}" ${cur || !ok ? 'disabled' : ''}>${cur ? 'อยู่ที่นี่' : '🚌 ไป'}</button></div>`;
  }).join('');
  return `<p>อำเภอของมึงมีหลายหมู่บ้าน แต่ละหมู่บ้านคือเมืองของผู้เล่นคนอื่น (ตอนนี้จำลองด้วย NPC) ผังไม่ซ้ำกัน ไปเที่ยว ทำงาน ซื้อขายได้ แต่สร้าง/จองที่ดินได้เฉพาะเมืองของตัวเอง</p>${rows}`;
}
export function initTravel() {
  G.travelTo = travelTo; G.travelBody = travelBody;
  // while visiting, the real save is what gets saved (player data synced back first)
  G.syncAway = () => { if (G.away) carry(G.state, G.away.real); return G.away?.real || G.state; };
}

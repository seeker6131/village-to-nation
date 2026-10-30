// v0.26 economy simulator: plays N game days with a scripted "dedicated player" using the real pure rules
// (taxes, treasury, upkeep, policies, energy, jobs, construction, settlers, NPC homes, elections, area upgrades).
// Usage: node scripts/sim-economy.mjs [days=160] [--log] [--honest|--lazy]
// 1 game day = 20 real minutes, so day 120 ≈ 40 hours of play.
import * as W from '../src/world.js';
import { createInitialState, takeExam, study, EXAM_QUESTIONS } from '../src/gameState.js';
import { migrate } from '../src/save.js';
import { giveItem, itemCount, buyMarket, eatFood, marketBuyPrice } from '../src/systems.js';
import * as C from '../src/construction.js';
import * as V from '../src/villageLayout.js';
import * as E from '../src/economy.js';
import * as J from '../src/jobs.js';
import * as H from '../src/housing.js';
import * as L from '../src/leadership.js';
import { allNpcDefs, planFor, economyHour, economyDay, settlerArrivals, ensureTown, population } from '../src/npcs.js';

const DAYS = Number(process.argv.find(a => /^\d+$/.test(a)) || 160), LOG = process.argv.includes('--log'), LAZY = process.argv.includes('--lazy');
W.generateRegion(W.DEFAULT_SEED, 'forest', 0);
const s = migrate(createInitialState()); ensureTown(s); C.ensureConstruction(s); L.ensureLeadership(s); E.ensureEconomy(s);
const isLeader = () => !!s.leadership.isLeader;
const clear = (x0, y0, w, h) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const n = W.nodeOnTile(x, y); if (n) W.setNode(s, n.id, 'x'); } };
const ms = {}; const mark = (k) => { if (!ms[k]) ms[k] = s.day; };
const ENERGY_PER = { gather: 15, perUnits: 4 }; // ~1 tree (3 hits + stump) or 1 rock = 15 energy -> ~4 units
const stats = { jobs: 0, gathered: 0, coinsEarned: 0, bought: 0 };

function gatherFor(need) { // spend energy on wood/stone the player needs for a build
  for (const k of ['wood', 'stone']) while (s.player[k] < (need[k] || 0) && s.player.stamina >= ENERGY_PER.gather) { s.player.stamina -= ENERGY_PER.gather; s.player[k] += ENERGY_PER.perUnits; stats.gathered += ENERGY_PER.perUnits; }
}
function bestJob() { for (const id of ['workshift', 'farmhand', 'stall', 'haul', 'delivery']) if (J.jobAvailable(s, id).ok) return id; return 'delivery'; }
function work() { // spend the rest of the day's energy on jobs
  let guard = 30;
  while (guard-- > 0) {
    const id = bestJob(), j = J.JOBS[id];
    if (s.player.stamina < j.energy) {
      if (E.nap(s).ok) continue;
      if (itemCount(s, 'food') < 1 && s.player.coins > 40 && (s.market.food || 0) > 0) buyMarket(s, 'food');
      if (eatFood(s).ok) continue;
      break;
    }
    if (!J.acceptJob(s, id).ok) break;
    const ref = J.jobTarget(s)?.ref; if (id === 'delivery') { s.deliveries.holding = true; }
    const r = J.workAt(s, id === 'delivery' ? 'delivery' : ref);
    if (!r.ok) { J.cancelJob(s); break; }
    stats.jobs++; stats.coinsEarned += r.pay;
  }
}
function playerDay() {
  const t = V.tierOf(s), nextT = V.TIERS[t];
  // 1) education: enough to pass the exam and to qualify for the next office
  const needK = Math.max(3, nextT?.office?.knowledge || 0);
  while (s.player.knowledge < needK && study(s).ok) {}
  if (!s.examPassed && s.player.knowledge >= 3) takeExam(s, EXAM_QUESTIONS.map(q => q.answer));
  if (LAZY) { work(); return; }
  const needR = Math.max(V.TIERS[t - 1]?.office?.record || 0, nextT?.office?.record || 0);
  if (s.leadership.record < needR) L.volunteer(s);
  // 2) leader: public projects + upgrades the next tier needs (treasury pays coins, player brings materials)
  if (isLeader()) {
    for (const id of C.PROJECT_ORDER || ['home', 'farm', 'market', 'hall']) {
      const o = s.publicSites[id]; if (o.status !== 'none' || !V.publicUnlocked(s, id)) continue;
      const P = (await_P)[id]; gatherFor(P); const r = C.plotRect ? null : null; void r;
      const pr = W.plotRect(id); clear(pr.tx, pr.ty, pr.w, pr.h);
      if (C.startPublic(s, id).ok) mark('build_' + id);
    }
    const needLv = nextT?.publicLv || 0;
    for (const id of ['home', 'farm', 'market', 'hall']) {
      const o = s.publicSites[id]; if (o.status !== 'done') continue;
      const cap = Math.min(needLv || 2, id === 'farm' ? 3 : 5); if (o.level >= cap) continue;
      const nx = C.upgradeCost('public', id, o.level); if (!nx || C.stageLock(s, nx)) continue;
      if ((s.town.treasury - (nx.coins || 0)) < 60) continue; // keep a small reserve for the bills
      gatherFor(nx); C.upgradeStructure(s, id);
    }
    // policies: run the cheap ones when the budget is healthy
    const pv = E.budgetPreview(s, population(s));
    for (const id of ['park', 'lanterns', 'library', 'lunch', 'clinic', 'welfare', 'transit', 'scholarship']) {
      const P = E.POLICIES[id]; if (s.town.policies.includes(id) || V.tierOf(s) < P.tier) continue;
      if (pv.net - P.cost > 40 + (nextT?.fund ? 0 : 0) && s.town.treasury > P.cost * 5) E.togglePolicy(s, id, true);
    }
    const ck = V.nextTierCheck(s, population(s));
    if (ck.ok) { V.upgradeVillage(s, population(s)); mark('tier' + V.tierOf(s)); }
  }
  // 3) own house + workshop slot (private money)
  const mine = H.myHome(s);
  if (!mine) { const sl = H.houseSlots(s).find(x => !s.homes?.[x.id] && V.slotState(s, x).state === 'empty'); if (sl && s.player.coins >= H.CLAIM_FEE) H.claimPlot(s, sl.id); }
  const home = H.myHome(s);
  if (home && V.slotState(s, home).state === 'empty' && s.player.coins >= C.BUILDINGS.cottage.coins) {
    gatherFor(C.BUILDINGS.cottage); clear(home.tx - 1, home.ty - 2, 6, 6);
    if (C.placeBuilding(s, 'cottage', home.tx, home.ty, () => false).ok) mark('own_house');
  }
  const myHouse = s.placed.find(p => p.type === 'cottage' && p.owner === 'player' && p.status === 'done');
  if (myHouse) { const nx = C.upgradeCost('private', 'cottage', myHouse.level); if (nx && s.player.coins >= nx.coins + 30) { gatherFor(nx); if (C.upgradeStructure(s, myHouse.uid).ok) mark('house_lv' + (myHouse.level + 1)); } }
  for (const sl of V.openSlots(s).filter(x => x.kind === 'workshop')) if (V.slotState(s, sl).state === 'empty' && s.player.coins >= C.BUILDINGS.workshop.coins) { gatherFor(C.BUILDINGS.workshop); clear(sl.tx - 1, sl.ty - 1, 6, 5); C.placeBuilding(s, 'workshop', sl.tx, sl.ty, () => false); }
  work();
}
import { PROJECTS as await_P } from '../src/gameState.js';

const rows = [];
for (let d = 1; d <= DAYS; d++) {
  // morning
  playerDay();
  for (let h = 0; h < 24; h++) {
    const present = allNpcDefs(s).filter(n => !n.special).map((npc, i) => ({ npc, plan: planFor(s, npc, h, i), arrived: true }));
    economyHour(s, present);
    C.tickConstruction(s, 60, Object.fromEntries(C.activeSites(s).map(id => [id, 2])));
    if (h % 3 === 0) settlerArrivals(s);
    s.gameTime = h * 3600;
  }
  // night -> new day (same order as ui/game.js)
  s.day++; s.gameTime = 6 * 3600;
  economyDay(s); E.playerNewDay(s, isLeader()); H.homesDay(s);
  const el = L.leadershipDay(s);
  if (el && el.parliament?.pm) mark('PM');
  const Ld = s.leadership;
  if (Ld.isLeader && V.tierOf(s) === 2) mark('ผู้ใหญ่บ้าน');
  rows.push({ day: s.day, tier: V.tierOf(s), role: L.roleLabel(s), coins: s.player.coins, treasury: Math.floor(s.town.treasury), pop: population(s), popu: Ld.popularity, happy: s.town.happiness, rec: Ld.record, know: s.player.knowledge, house: s.placed.find(p => p.type === 'cottage' && p.owner === 'player')?.level || 0, net: E.budgetPreview(s, population(s)).net });
  if (Ld.pm) mark('PM');
}
const pick = r => `d${String(r.day).padStart(3)} T${r.tier} ${r.role.padEnd(16)} 🪙${String(r.coins).padStart(6)} คลัง${String(r.treasury).padStart(6)} (${r.net >= 0 ? '+' : ''}${r.net}/วัน) คน${String(r.pop).padStart(4)} นิยม${String(r.popu).padStart(3)} สุข${String(r.happy).padStart(3)} ผลงาน${String(r.rec).padStart(4)} รู้${String(r.know).padStart(3)} บ้าน${r.house}`;
for (const r of rows) if (LOG || r.day % 10 === 0 || r.day <= 3) console.log(pick(r));
console.log('\nmilestones (game day · real hours at 20 min/day):');
for (const [k, d] of Object.entries(ms).sort((a, b) => a[1] - b[1])) console.log(`  ${k.padEnd(14)} day ${String(d).padStart(3)} · ~${(d / 3).toFixed(1)} h`);
console.log(`\njobs ${stats.jobs} · wages net ${stats.coinsEarned} · gathered ${stats.gathered} · elections ${s.leadership.results.length} (won ${s.leadership.results.filter(r => r.won).length})`);
console.log('results:', s.leadership.results.slice(0, 10).reverse().map(r => `T${r.term} ${r.player}v${r.rivalScore}${r.won ? 'W' : 'L'}${r.note ? '(' + r.note + ')' : ''}`).join(' · '));

// v0.26 economy, energy, civil-service ladder and the road to Prime Minister.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, study, takeCivilExam, CIVIL_EXAM_QUESTIONS } from '../src/gameState.js';
import { eatFood, giveItem } from '../src/systems.js';
import * as E from '../src/economy.js';
import * as K from '../src/career.js';
import * as L from '../src/leadership.js';
import * as V from '../src/villageLayout.js';
import { economyDay, ensureTown, population } from '../src/npcs.js';
import { ensureConstruction } from '../src/construction.js';
import { migrate } from '../src/save.js';

const fresh = () => { const s = migrate(createInitialState()); ensureTown(s); ensureConstruction(s); L.ensureLeadership(s); E.ensureEconomy(s); return s; };

test('wages are taxed: the tax goes to the treasury, never to the leader; rate is set by the leader only', () => {
  const s = fresh(); s.town.treasury = 0; const c = s.player.coins;
  const r = E.payIncome(s, 100);
  assert.deepEqual(r, { net: 90, tax: 10 }); assert.equal(s.player.coins, c + 90); assert.equal(s.town.treasury, 10);
  assert.equal(E.setTax(s, 20, false).ok, false, 'not the leader');
  assert.equal(E.setTax(s, 20, true).ok, true); assert.equal(E.taxRate(s), 20);
  assert.equal(E.setTax(s, 99, true).ok, true); assert.equal(E.taxRate(s), E.ECON.TAX.max, 'clamped');
  assert.ok(E.taxPop(s) < 0, 'high tax costs popularity'); E.setTax(s, 0, true); assert.ok(E.taxPop(s) > 0);
});

test('energy is a daily budget: no passive regen; sleep refills by housing; one nap; three meals', () => {
  const s = fresh(); s.player.stamina = 10;
  const sl = E.playerNewDay(s, false); assert.equal(s.player.stamina, sl.energy); assert.ok(sl.energy < 100, 'camping sleeps worse');
  assert.equal(E.playerNewDay(s, true).energy, 100, 'leader house');
  s.player.stamina = 50; assert.equal(E.nap(s).ok, true); assert.equal(s.player.stamina, 80); assert.equal(E.nap(s).ok, false, 'once a day');
  giveItem(s, 'food', 10); s.player.stamina = 0;
  for (let i = 0; i < 3; i++) assert.equal(eatFood(s).ok, true);
  assert.equal(eatFood(s).ok, false, 'max 3 meals'); s.day++; s.player.stamina = 0; assert.equal(eatFood(s).ok, true, 'new day');
});

test('study: +1 knowledge, costs energy, 3 a day (4 with the library policy)', () => {
  const s = fresh(); s.player.stamina = 100; const k = s.player.knowledge;
  for (let i = 0; i < 3; i++) assert.equal(study(s).ok, true);
  assert.equal(study(s).ok, false); assert.equal(s.player.knowledge, k + 3); assert.equal(s.player.stamina, 100 - 24);
  s.day++; s.town.policies.push('library'); for (let i = 0; i < 4; i++) assert.equal(study(s).ok, true);
});

test('town budget: villagers pay tax, the treasury pays upkeep and policies; broke treasury suspends policies', () => {
  const s = fresh(); s.town.treasury = 500; s.election.leader = 'player';
  Object.assign(s.publicSites.hall, { status: 'done', level: 1 });
  assert.equal(E.togglePolicy(s, 'park', true).ok, true); assert.equal(E.togglePolicy(s, 'welfare', true).ok, false, 'tier 3 policy');
  const t0 = s.town.treasury, pv = E.budgetPreview(s, population(s));
  const r = economyDay(s);
  assert.ok(r.ledger.in['ภาษีเงินได้ชาวบ้าน'] > 0); assert.equal(r.ledger.out['นโยบาย: ดูแลสวนหย่อม'], E.POLICIES.park.cost);
  assert.equal(s.town.treasury, t0 + pv.net, 'preview matches the real day');
  s.town.treasury = 0; E.ECON.UPKEEP_PER_LEVEL += 1000; // force a deficit
  try { const r2 = economyDay(s); assert.ok(r2.events.some(e => e.includes('ไม่พอ'))); } finally { E.ECON.UPKEEP_PER_LEVEL -= 1000; }
  assert.equal(s.town.treasury >= 0, true); assert.ok(!s.town.policies.includes('park'), 'policy suspended'); assert.ok(s.econ.unpaidDays > 0);
  assert.equal(L.popularityFactors(s).factors.budget, -8);
});

test('civil service ladder: rank needs days served + education + the office existing in the area; separate from politics', () => {
  const s = fresh(); s.stats.deliveries = 1; s.player.knowledge = 2;
  assert.equal(takeCivilExam(s, CIVIL_EXAM_QUESTIONS.map(q => q.answer)).ok, true);
  s.leadership.isLeader = true; s.player.stamina = 100;
  assert.equal(K.civilShift(s).ok, false, 'an elected leader cannot do civil shifts');
  s.leadership.isLeader = false; s.election.leader = 'npc';
  assert.match(L.canRun(s).why.join(), /ลาออก/, 'a civil servant must resign to run');
  s.player.knowledge = 20;
  for (let d = 0; d < 60; d++) { s.day++; s.player.stamina = 100; assert.equal(K.civilShift(s).ok, true); }
  assert.equal(K.ensureCivil(s).rank, 'เจ้าหน้าที่', 'ปลัดอำเภอ needs a district office (tier 3)');
  s.town.stage = 3; s.day++; s.player.stamina = 100; K.civilShift(s); s.day++; s.player.stamina = 100; K.civilShift(s); s.day++; s.player.stamina = 100; K.civilShift(s);
  assert.equal(K.ensureCivil(s).rank, 'ผู้ว่าราชการจังหวัด');
  assert.equal(K.resignCivil(s).ok, true); assert.ok(!L.canRun(s).why.join().includes('ลาออก'));
  assert.equal(K.civilShift(s).ok, false, 'resigned');
});

test('elected office needs track record + education; nation level: parliament elects the PM', () => {
  const s = fresh(); s.examPassed = true; s.town.stage = 2;
  assert.ok(L.canRun(s).why.some(w => w.includes('ความรู้')), 'นายก อบต. needs education');
  s.player.knowledge = 15; assert.equal(L.canRun(s).ok, true);
  assert.ok(V.nextTierCheck(s, 999).items.some(i => i.label.includes('ผลงานทางการเมือง') && !i.ok), 'raising the area yourself needs a record');
  s.leadership.record = 500;
  s.town.stage = 4; const Ld = s.leadership; Ld.isLeader = true; Ld.consecutive = 0; Ld.popularity = 95;
  const r = L.runTermElection(s);
  assert.equal(r.won, true); assert.ok(r.parliament); assert.equal(Ld.pm, true); assert.equal(L.roleLabel(s), 'นายกรัฐมนตรี');
  Ld.popularity = 10; const r2 = L.runTermElection(s); assert.equal(r2.won, false); assert.equal(Ld.pm, false, 'losing the election ends the premiership');
});

test('while an NPC holds office the area still grows (NPC leader pays the fund); qualifications only gate the player', () => {
  const s = fresh(); s.town.stage = 1; s.leadership.isLeader = false; s.election.leader = 'npc';
  for (const T of V.TIERS.slice(0, 2)) for (const sl of T.slots) if (sl.kind !== 'public') s.placed.push({ uid: 'x' + sl.id, type: sl.kind, tx: sl.tx, ty: sl.ty, status: 'done', level: 1, owner: sl.kind === 'cottage' ? 'npc' : undefined });
  for (const id of ['home', 'market', 'hall', 'farm']) Object.assign(s.publicSites[id], { status: 'done', level: 2 });
  while (population(s) < 26) s.town.settlers.push({ id: 'settler' + s.town.settlers.length, name: 'x', job: 'farmer' });
  s.town.happiness = 80; s.town.treasury = 5000;
  let r; for (let i = 0; i < 30 && !(r && r.grew); i++) { s.day++; s.town.happiness = 80; s.town.treasury = Math.max(s.town.treasury, 5000); r = economyDay(s); }
  assert.ok(r.grew, 'NPC leader raised the area (within a few days)'); assert.equal(V.tierOf(s), 3); assert.ok(s.town.treasury < 5000 + 500, 'fund paid');
});

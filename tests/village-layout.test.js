// v0.12 pre-designed village plans: slots, tier upgrades by the leader, roads, no money shortcut.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/gameState.js';
import { migrate } from '../src/save.js';
import * as W from '../src/world.js';
import * as C from '../src/construction.js';
import * as V from '../src/villageLayout.js';
import { population, settlerArrivals } from '../src/npcs.js';
import { roleLabel } from '../src/leadership.js';
import * as H from '../src/housing.js';
import * as K from '../src/corruption.js';

const fresh = () => { const s = migrate(createInitialState()); s.player.coins = 999; s.player.wood = 300; s.player.stone = 300; return s; };
const blk = s => (x, y) => W.blocked(x, y, s);
function finishTier(s, t) {
  for (const sl of V.TIERS[t - 1].slots) {
    if (sl.kind === 'public') { for (const n of W.plotObstacles(s, sl.id)) W.setNode(s, n.id, 'x'); assert.equal(C.startPublic(s, sl.id).ok, true, sl.id); C.tickConstruction(s, 99999); }
    else if (sl.kind === 'cottage') H.buildHouseFor(s, sl.id, 'npc_' + sl.id);
    else { for (const n of V.slotObstacles(s, sl, 4, 3)) W.setNode(s, n.id, 'x'); assert.equal(C.placeBuilding(s, sl.kind, sl.tx, sl.ty, blk(s)).ok, true, sl.id); }
  }
  C.tickConstruction(s, 99999);
}

test('a new game starts as tier 1 (ค่ายบุกเบิก) with the founder as หัวหน้าค่าย', () => {
  const s = fresh();
  assert.equal(V.tierOf(s), 1); assert.equal(s.town.stage, 0);
  assert.match(roleLabel(s), /หัวหน้าค่าย/);
});

test('plan slots never overlap plots, tents, water or each other in many generated forests', () => {
  const rects = [];
  for (const T of V.TIERS) for (const sl of T.slots) if (sl.kind !== 'public') rects.push({ ...sl, w: 4, h: 3, tier: T.tier });
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    assert.ok(a.tx + a.w <= b.tx || b.tx + b.w <= a.tx || a.ty + a.h <= b.ty || b.ty + b.h <= a.ty, `${a.id} overlaps ${b.id}`);
  }
  for (const seed of [1, 2, 3, 777, 4242, 20261029, 99991]) {
    W.generateRegion(seed, 'forest'); const s = { world: { seed, biome: 'forest', n: {}, ver: 0 } }; W.ensureWorld(s);
    for (const r of rects) for (let y = r.ty; y < r.ty + r.h; y++) for (let x = r.tx; x < r.tx + r.w; x++) {
      assert.equal(W.occAt(x, y, s) & (W.OCC.WATER | W.OCC.BUILDING), 0, `seed ${seed} ${r.id}`);
      assert.ok(Math.hypot(x - W.CENTER.x, y - W.CENTER.y) <= V.TIERS[r.tier - 1].radius, `${r.id} inside its tier radius`);
      for (const id of ['home', 'farm', 'market', 'hall']) { const p = W.plotRect(id); assert.ok(!(x >= p.tx && x < p.tx + p.w && y >= p.ty && y < p.ty + p.h), `${r.id} on ${id} plot`); }
    }
  }
  W.generateRegion(W.DEFAULT_SEED, 'forest');
});

test('houses only on plan slots; decorations keep slots free; tier-2 buildings locked in tier 1', () => {
  const s = fresh(), h1 = V.slotById('h1');
  assert.equal(C.canPlace(s, 'cottage', h1.tx + 1, h1.ty, blk(s)).code, 'slot');
  for (const n of V.slotObstacles(s, h1, 4, 3)) W.setNode(s, n.id, 'x');
  assert.equal(C.canPlace(s, 'cottage', h1.tx, h1.ty, blk(s)).code, 'claim', 'claim the plot first');
  assert.equal(H.claimPlot(s, 'h1').ok, true);
  assert.equal(C.canPlace(s, 'cottage', h1.tx, h1.ty, blk(s)).ok, true);
  assert.equal(H.claimPlot(s, 'h2').ok, false, 'one plot per person');
  assert.equal(C.canPlace(s, 'bench', h1.tx + 1, h1.ty + 1, blk(s)).code, 'slot', 'bench may not sit on a house slot');
  const h3 = V.slotById('h3'); assert.equal(C.canPlace(s, 'cottage', h3.tx, h3.ty, blk(s)).code, 'slot', 'tier-2 slot');
  assert.equal(C.startPublic(s, 'market').ok, false);
});

test('upgrade needs every slot built + population + leader; money alone does nothing; plan grows', () => {
  const s = fresh();
  assert.equal(V.upgradeVillage(s, 99).ok, false, 'nothing built yet');
  s.player.coins = 1e9; assert.equal(V.upgradeVillage(s, 99).ok, false, 'money does not upgrade');
  finishTier(s, 1);
  assert.equal(V.upgradeVillage(s, 2).ok, false, 'population too small');
  while (population(s) < 12) { s.day++; settlerArrivals(s); }
  s.leadership.isLeader = false; s.election.leader = 'npc';
  assert.equal(V.upgradeVillage(s, population(s)).ok, false, 'only the leader can upgrade');
  s.leadership.isLeader = true; s.election.leader = 'player';
  assert.equal(V.upgradeVillage(s, population(s)).ok, false, 'ผู้ใหญ่บ้าน needs education (knowledge 3)');
  s.player.knowledge = 3;
  const r = V.upgradeVillage(s, population(s));
  assert.equal(r.ok, true, r.msg); assert.equal(V.tierOf(s), 2); assert.match(roleLabel(s), /ผู้ใหญ่บ้าน/);
  assert.ok(V.openSlots(s).some(x => x.id === 'h3')); assert.ok(V.villageRadius(s) > V.TIERS[0].radius);
  for (const k of V.roadTiles(s)) { const [x, y] = k.split(',').map(Number), n = W.nodeOnTile(x, y); if (n) assert.equal(W.nodeStatus(s, n), 'gone', 'roads cleared'); }
  finishTier(s, 2);
  while (population(s) < 26) { s.day++; settlerArrivals(s); if (s.day > 400) break; }
  // v0.26 tier 3 (อำเภอ): public buildings Lv2, happiness, a development fund from the treasury, the office's qualifications
  const c = V.nextTierCheck(s, population(s));
  assert.equal(c.ok, false);
  for (const id of ['home', 'market', 'hall', 'farm']) Object.assign(s.publicSites[id], { status: 'done', level: 2 });
  s.town.happiness = 80; s.player.knowledge = 6; s.leadership.record = 60;
  s.town.treasury = 1999; assert.equal(V.upgradeVillage(s, population(s)).ok, false, 'fund short by 1');
  s.player.coins = 1e9; assert.equal(V.upgradeVillage(s, population(s)).ok, false, 'the leader\'s own money does not count');
  s.town.treasury = 2100; assert.equal(V.upgradeVillage(s, population(s)).ok, true);
  assert.equal(V.tierOf(s), 3); assert.equal(s.town.treasury, 100, 'fund spent'); assert.match(roleLabel(s), /นายก อบต/);
});

test('everyone wants a home: NPC villagers claim plots, save daily and build their own houses', () => {
  const s = fresh();
  H.claimPlot(s, 'h0');
  for (let d = 0; d < 6; d++) { s.day++; H.homesDay(s); C.tickConstruction(s, 600); }
  const npcHomes = Object.entries(s.homes).filter(([, h]) => h.owner !== 'player');
  assert.ok(npcHomes.length >= 2, 'starter villagers claimed plots');
  assert.ok(s.placed.some(p => p.type === 'cottage' && p.owner !== 'player' && p.level >= 1), 'an NPC finished their own house');
  const other = npcHomes[0][0], sl = V.slotById(other);
  assert.equal(C.canPlace(s, 'cottage', sl.tx, sl.ty, blk(s)).ok, false, "can't build on someone else's plot");
});

test('corruption pays now but leaves evidence; audits seize money, crash popularity, can remove and ban', () => {
  const s = fresh(); s.town.treasury = 200; const coins = s.player.coins, pop = s.leadership.popularity;
  const r = K.corruptAct(s, 'embezzle'); assert.equal(r.ok, true); assert.equal(s.player.coins, coins + 80); assert.equal(s.town.treasury, 120);
  assert.ok(K.catchChance(s) > 0);
  assert.equal(K.corruptAct(s, 'embezzle').ok, false, 'once per day');
  assert.equal(K.auditDay(s, 0.99), null, 'not caught this time');
  const ev = K.auditDay(s, 0); assert.ok(ev, 'caught'); assert.equal(ev.severe, true, '80 coins = serious');
  assert.ok(s.player.coins < coins + 80, 'money seized'); assert.equal(s.leadership.isLeader, false, 'removed from office');
  assert.ok(s.leadership.popularity < pop); assert.equal(K.isBanned(s), true);
});

test('a non-leader cannot touch the budget; bought votes count once and are illegal', () => {
  const s = fresh(); s.leadership.isLeader = false;
  assert.equal(K.corruptAct(s, 'embezzle').ok, false);
  s.leadership.isLeader = true; s.player.coins = 100;
  assert.equal(K.corruptAct(s, 'votebuy').ok, true); assert.equal(K.ensureCorruption(s).voteBuy, 3);
  assert.equal(K.takeBoughtVotes(s), 3); assert.equal(K.takeBoughtVotes(s), 0);
});

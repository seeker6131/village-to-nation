import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, progressTime, DAY_SECONDS_REAL, PROJECT_ORDER } from '../src/gameState.js';
import { blocked, TILE, WORLD_W, WORLD_H, NODES, POINTS, plotObstacles, setNode, CENTER } from '../src/world.js';
import { buyMarket, sellMarket, marketBuyPrice, eatFood, ensureSystems, plant, harvest } from '../src/systems.js';
import * as C from '../src/construction.js';
import * as N from '../src/npcs.js';
import * as J from '../src/jobs.js';
import * as Q from '../src/quests.js';
import { computeStage, updateStage, LEADERSHIP_LADDER } from '../src/progression.js';
import { CATALOG, validateCatalog, purchase, grantMockEntitlement, FORBIDDEN_EFFECTS } from '../src/shop.js';
import { migrate } from '../src/save.js';
import { tileRoute } from '../src/pathfinding.js';
import { openSlots, slotObstacles } from '../src/villageLayout.js';

const fresh = () => migrate(createInitialState());
const clearPlots = s => { for (const id of ['home', 'farm', 'market', 'hall']) for (const n of plotObstacles(s, id)) setNode(s, n.id, 'x'); return s; };
const rich = () => { const s = fresh(); s.player.coins = 999; s.player.wood = 200; s.player.stone = 200; return clearPlots(s); };
const village = s => { s.town.stage = 1; for (const sl of openSlots(s)) if (sl.kind !== 'public') for (const n of slotObstacles(s, sl, 4, 3)) setNode(s, n.id, 'x'); return s; }; // tier 2 plan open, slots cleared
const firstValid = (s, type) => { for (let y = CENTER.y - 20; y < CENTER.y + 20; y++) for (let x = CENTER.x - 20; x < CENTER.x + 20; x++) if (C.canPlace(s, type, x, y, blocked).ok) return [x, y]; return null; };

test('placement validates zone, obstacles, overlap and cost — and costs are paid only on confirm', () => {
  const s = fresh();
  assert.equal(C.canPlace(s, 'garden', 10, 10, blocked).code, 'zone');
  assert.equal(C.canPlace(s, 'garden', POINTS.home.x - 1, POINTS.home.y - 1, blocked).code, 'plot', 'public plot is reserved');
  const spot = firstValid(rich(), 'garden');
  s.player.wood = 0;
  assert.equal(C.canPlace(s, 'garden', ...spot, blocked).code, 'cost', 'needs wood');
  s.player.wood = 2; s.player.stone = 1;
  const before = { ...s.player };
  assert.equal(C.canPlace(s, 'garden', ...spot, blocked).ok, true);
  assert.equal(s.player.coins, before.coins, 'preview does not charge');
  assert.equal(C.placeBuilding(s, 'garden', ...spot, blocked).ok, true);
  assert.deepEqual([s.player.coins, s.player.wood, s.player.stone], [before.coins - 6, 0, 0]);
  assert.equal(C.canPlace(s, 'bench', ...spot, blocked).ok, false, 'overlap rejected');
  assert.equal(C.canPlace(s, 'bench', spot[0] + 5, spot[1], blocked, () => true).code === 'actor' || !C.canPlace(s, 'bench', spot[0] + 5, spot[1], blocked, () => true).ok, true);
});

test('construction takes game time, NPC builders and player help speed it up, then upgrades work', () => {
  const s = village(rich());
  assert.equal(C.canPlace(s, 'workshop', 10, 40, blocked).code, 'slot', 'workshops only on plan slots');
  const spot = firstValid(s, 'workshop'); C.placeBuilding(s, 'workshop', ...spot, blocked);
  const ws = s.placed[0];
  assert.equal(ws.status, 'building'); assert.equal(ws.level, 0);
  C.tickConstruction(s, 60);
  assert.ok(Math.abs(C.progressOf(ws) - 0.25) < 1e-9, '60/240 min');
  C.tickConstruction(s, 30, { [ws.uid]: 2 }); // two NPC builders => 3x rate
  assert.ok(Math.abs(C.progressOf(ws) - 0.625) < 1e-9);
  const e = s.player.stamina; assert.equal(C.helpConstruction(s, ws.uid).ok, true); assert.equal(s.player.stamina, e - C.HELP_ENERGY);
  C.tickConstruction(s, 999);
  assert.equal(ws.status, 'done'); assert.equal(ws.level, 1);
  assert.equal(C.upgradeStructure(s, ws.uid).ok, true); assert.equal(ws.status, 'building'); assert.equal(ws.level, 1, 'still usable while upgrading');
  C.tickConstruction(s, 999); assert.equal(ws.level, 2);
  assert.equal(C.upgradeStructure(s, ws.uid).ok, false, 'max level');
});

test('public projects: pay at start, finish later, unlock election only when all 4 are finished', () => {
  const s0 = rich(); assert.equal(C.startPublic(s0, 'market').ok, false, 'market is on the tier-2 plan');
  const s = village(rich());
  for (const id of ['home', 'farm', 'market']) assert.equal(C.startPublic(s, id).ok, true);
  assert.equal(C.startPublic(s, 'hall').ok, false, 'hall needs finished home + market');
  assert.equal(s.projects.home, false);
  C.tickConstruction(s, 400);
  assert.equal(s.projects.home && s.projects.farm && s.projects.market, true);
  assert.equal(C.startPublic(s, 'hall').ok, true);
  assert.equal(s.election.opened, false);
  C.tickConstruction(s, 400);
  assert.equal(s.election.opened, true);
});

test('money and resources can never go negative', () => {
  const s = fresh(); s.player.coins = 3;
  assert.equal(buyMarket(s, 'food').ok, false);
  for (let i = 0; i < 50; i++) { sellMarket(s, 'vegetables'); eatFood(s); C.placeBuilding(s, 'cottage', CENTER.x + 6, CENTER.y + 6, blocked); C.upgradeStructure(s, 'home'); C.startPublic(s, 'market'); }
  assert.ok(s.player.coins >= 0 && s.player.wood >= 0 && s.player.stone >= 0);
  for (const v of Object.values(s.inventory)) assert.ok(v >= 0);
  for (const v of Object.values(s.market)) assert.ok(v >= 0);
  const m = migrate({ ...createInitialState(), player: { ...createInitialState().player, coins: -50, wood: -2 } });
  assert.equal(m.player.coins, 0); assert.equal(m.player.wood, 0);
});

test('market prices follow stock; empty stock cannot be bought', () => {
  const s = rich();
  s.market.food = 15; const normal = marketBuyPrice(s, 'food');
  s.market.food = 1; const scarce = marketBuyPrice(s, 'food');
  assert.ok(scarce > normal);
  assert.equal(buyMarket(s, 'food').ok, true); assert.equal(s.market.food, 0);
  assert.equal(buyMarket(s, 'food').ok, false);
});

test('NPC schedules react to the village: farm, market lunch, builders to sites, sleep at night', () => {
  const s = village(rich());
  const mee = N.NPC_DEFS.find(n => n.id === 'mee'), chai = N.NPC_DEFS.find(n => n.id === 'chai');
  assert.equal(N.planFor(s, mee, 9).activity, 'forage');
  const fresh2 = fresh(); assert.equal(N.planFor(fresh2, chai, 9).activity, 'chop', 'before any site exists, builders clear the forest');
  assert.equal(N.planFor(s, mee, 23).activity, 'sleep');
  C.startPublic(s, 'farm');
  assert.equal(N.planFor(s, chai, 9).activity, 'build', 'builders go to the active site');
  C.tickConstruction(s, 999);
  assert.equal(N.planFor(s, mee, 9).activity, 'farm');
  assert.equal(N.planFor(s, mee, 12.5).place, undefined, 'no market yet => lunch at home');
  C.startPublic(s, 'market'); C.startPublic(s, 'home'); C.tickConstruction(s, 999);
  assert.equal(N.planFor(s, mee, 12.5).place, 'market');
});

test('NPC economy: farm produces food, lunch at market consumes it and pays tax', () => {
  const s = village(rich()); C.startPublic(s, 'farm'); C.startPublic(s, 'market'); C.startPublic(s, 'home'); C.tickConstruction(s, 999);
  s.market.food = 0; const t0 = s.town.treasury;
  const farmer = N.NPC_DEFS.find(n => n.id === 'mee');
  N.economyHour(s, [{ npc: farmer, plan: N.planFor(s, farmer, 9), arrived: true }]);
  assert.equal(s.market.food, 1);
  const eaters = N.NPC_DEFS.map((n, i) => ({ npc: n, plan: N.planFor(s, n, 12.5, i), arrived: true }));
  const ev = N.economyHour(s, eaters);
  assert.equal(s.market.food, 0); assert.ok(s.town.treasury > t0); assert.ok(s.town.hungryMeals > 0, 'not enough food => hungry NPCs');
  assert.ok(ev.length >= 1);
});

test('villagers keep arriving every few game hours up to the level cap (15 in the pioneer camp)', () => {
  const s = rich();
  assert.equal(N.BASE_POPULATION, 4, 'founder starts with 4 NPC helpers');
  const first = N.settlerArrivals(s); assert.equal(first.id, 'fah', 'named villagers move in first');
  assert.equal(N.settlerArrivals(s), null, 'not twice in the same hours');
  s.gameTime += N.SETTLE_EVERY_HOURS * 3600; assert.ok(N.settlerArrivals(s));
  for (let i = 0; i < 40; i++) { s.day++; N.settlerArrivals(s); }
  assert.equal(N.population(s), 15, 'capped by the level');
  assert.deepEqual(N.homeOf(s, s.town.settlers.at(-1)), s.town.settlers.at(-1).home, 'newcomers live in the camp');
});

test('village stages grow from what is built, never bought', () => {
  const s = rich();
  assert.equal(computeStage(s), 0);
  C.startPublic(s, 'home'); C.startPublic(s, 'farm'); C.tickConstruction(s, 999);
  assert.equal(computeStage(s), 1, 'legacy rule');
  updateStage(s); assert.equal(s.town.stage, 0, 'v0.12: the village never upgrades by itself — the leader presses ยกระดับ');
  assert.ok(LEADERSHIP_LADDER.find(l => l.id === 'pm').req.includes('ไม่สามารถซื้อ'));
});

test('jobs: accept -> walk to place -> work; wrong place refused; career bonus and outfit unlock', () => {
  const s = rich();
  assert.equal(J.acceptJob(s, 'farmhand').ok, false, 'needs farm');
  assert.equal(J.acceptJob(s, 'delivery').ok, true);
  assert.equal(J.acceptJob(s, 'delivery').ok, false, 'one job at a time');
  assert.equal(J.workAt(s, 'board').ok, false);
  const c0 = s.player.coins; assert.equal(J.workAt(s, 'delivery').ok, true); assert.equal(s.player.coins, c0 + 12);
  C.startPublic(s, 'farm'); C.tickConstruction(s, 999);
  J.chooseCareer(s, 'farmer');
  for (let i = 0; i < 3; i++) { assert.equal(J.acceptJob(s, 'farmhand').ok, true); s.player.stamina = 100; assert.equal(J.workAt(s, 'farm').pay, Math.round(14 * 1.2)); }
  assert.ok(s.unlockedOutfits.includes('farmer'));
});

test('NPC quests: accept, progress, hand in once', () => {
  const s = rich();
  assert.equal(Q.turnInQuest(s, 'chai_wood').ok, false);
  assert.equal(Q.acceptQuest(s, 'chai_wood').ok, true);
  const w = s.player.wood, c = s.player.coins;
  assert.equal(Q.turnInQuest(s, 'chai_wood').ok, true);
  assert.equal(s.player.wood, w - 6); assert.equal(s.player.coins, c + 25);
  assert.equal(Q.turnInQuest(s, 'chai_wood').ok, false);
  assert.equal(Q.acceptQuest(s, 'mentor_bench').ok, true);
  assert.equal(Q.questReady(s, Q.NPC_QUESTS.find(q => q.id === 'mentor_bench')), false);
});

test('OBT shop: cosmetic/convenience only, purchases always refused, mock grant is dev-only', () => {
  assert.deepEqual(validateCatalog(), []);
  assert.ok(validateCatalog([{ sku: 'bad', cat: 'fashion', th: 'x', priceTHB: 10, effects: { votes: 5 } }]).length > 0);
  for (const item of CATALOG) for (const k of Object.keys(item.effects)) assert.ok(!FORBIDDEN_EFFECTS.includes(k));
  const s = fresh(), coins = s.player.coins;
  const r = purchase(s, 'supporter_founder'); assert.equal(r.ok, false); assert.equal(r.code, 'payments_disabled'); assert.equal(s.player.coins, coins);
  assert.equal(grantMockEntitlement(s, 'outfit_sailor', false).ok, false);
  assert.equal(grantMockEntitlement(s, 'outfit_sailor', true).ok, true);
  assert.equal(s.entitlements[0].source, 'mock-test');
});

test('navigation: spawn reaches every point, plot front and NPC home/work target', () => {
  const s = rich(); C.startPublic(s, 'home'); C.startPublic(s, 'farm'); C.startPublic(s, 'market'); C.tickConstruction(s, 999); C.startPublic(s, 'hall'); C.tickConstruction(s, 999);
  const walk = (x, y) => !blocked(x, y, s);
  const from = [42.5 * TILE, 53.5 * TILE];
  const targets = [...Object.keys(POINTS).map(id => N.structurePos(s, id) || [POINTS[id].x, POINTS[id].y])];
  for (const n of N.NPC_DEFS) for (const h of [0, 6.5, 9, 12.5, 18]) targets.push(N.planFor(s, n, h).target);
  for (const [tx, ty] of targets) {
    const r = tileRoute(...from, (tx + .5) * TILE, (ty + .5) * TILE, walk);
    assert.ok(r.length > 0, `route to ${tx},${ty}`);
    const end = r[r.length - 1]; assert.ok(Math.hypot(end.x / TILE - tx - .5, end.y / TILE - ty - .5) <= 3.5, `ends near ${tx},${ty}`);
    for (const p of r) assert.equal(blocked(Math.floor(p.x / TILE), Math.floor(p.y / TILE)), false);
  }
  assert.ok(WORLD_W > 0 && WORLD_H > 0);
});

test('one game day still equals 20 real minutes and gardens follow game time', () => {
  const s = rich(); C.placeBuilding(s, 'garden', ...firstValid(s, 'garden'), blocked); C.tickConstruction(s, 999);
  const g = s.placed[0]; assert.equal(plant(s, g.uid).ok, true);
  progressTime(s, DAY_SECONDS_REAL / 2); assert.equal(harvest(s, g.uid).ok, false);
  progressTime(s, DAY_SECONDS_REAL / 2); assert.equal(harvest(s, g.uid).ok, true);
  void ensureSystems; void PROJECT_ORDER;
});

test('v0.10: modern building eras (Lv4-5) need the village to have grown — money alone is not enough', () => {
  const s = createInitialState(); C.ensureConstruction(s);
  Object.assign(s.publicSites.home, { status: 'done', level: 3 });
  Object.assign(s.player, { coins: 9999, wood: 999, stone: 999 });
  s.town.stage = 0;
  const r = C.upgradeStructure(s, 'home');
  assert.equal(r.ok, false); assert.match(r.msg, /หมู่บ้าน/);
  assert.equal(s.player.coins, 9999, 'nothing paid when locked');
  s.town.stage = 1;
  assert.equal(C.upgradeStructure(s, 'home').ok, true);
});

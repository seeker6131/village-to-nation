// v0.22 villagers' needs, wages and civil-service jobs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/gameState.js';
import { migrate } from '../src/save.js';
import * as W from '../src/world.js';
import { planFor, allNpcDefs, economyHour } from '../src/npcs.js';
import { lifeOf, jobOf, CIVIL_JOBS } from '../src/npcLife.js';
import { fillLevel } from '../src/showcase.js';

const fresh = () => { W.generateRegion(); const s = migrate(createInitialState()); W.ensureWorld(s); return s; };

test('work makes villagers hungry and tired and pays a wage; hungry people go to eat, exhausted people go to bed', () => {
  const s = fresh(), npc = allNpcDefs(s).find(n => n.job === 'farmer');
  const v = lifeOf(s, npc.id); v.hunger = 10; v.energy = 90; const c0 = v.coins;
  for (let h = 0; h < 5; h++) economyHour(s, [{ npc, plan: { activity: 'farm' }, arrived: true }]);
  assert.ok(v.hunger > 40 && v.energy < 70 && v.coins > c0, JSON.stringify(v));
  v.hunger = 90; assert.equal(planFor(s, npc, 10, 1).activity, 'lunch');
  v.hunger = 10; v.energy = 5; assert.equal(planFor(s, npc, 10, 1).activity, 'sleep');
  v.energy = 50; v.coins = 50; v.hunger = 90;
  economyHour(s, [{ npc, plan: { activity: 'lunch', place: 'market' }, arrived: true }]);
  assert.ok(v.hunger < 40 && v.coins === 45, 'eating costs money and fills you up');
});

test('from อำเภอ up some settlers become police / officials / teachers, work at those buildings and meet at the office', () => {
  const s = fresh(); s.town.stage = 2; fillLevel(s);
  const civ = allNpcDefs(s).filter(n => CIVIL_JOBS[jobOf(s, n)]);
  assert.ok(civ.length >= 3, 'civil servants: ' + civ.length);
  const cop = civ.find(n => jobOf(s, n) === 'police') || civ[0];
  lifeOf(s, cop.id).hunger = 10; lifeOf(s, cop.id).energy = 90;
  const a = planFor(s, cop, 9.5, 2).activity; assert.ok(['office', 'patrol'].includes(a), a);
  const village = fresh(); village.town.stage = 1;
  assert.equal(allNpcDefs(village).filter(n => CIVIL_JOBS[jobOf(village, n)]).length, 0, 'no civil servants without the buildings');
});

// v0.17 city plans for the upper levels + crime & police.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/gameState.js';
import { migrate } from '../src/save.js';
import * as W from '../src/world.js';
import * as V from '../src/villageLayout.js';
import * as P from '../src/villageProps.js';
import * as CP from '../src/cityPlan.js';
import * as CR from '../src/crime.js';
import { ART10 } from '../src/artManifest.js';
import { buildShowcase } from '../src/showcase.js';

const fresh = () => { W.generateRegion(); const s = migrate(createInitialState()); W.ensureWorld(s); return s; };

test('city plans: every level adds streets and buildings, civic buildings exist, footprints stay off streets and water', () => {
  W.generateRegion();
  const c3 = CP.cityPlan(3, ART10), c4 = CP.cityPlan(4, ART10), c5 = CP.cityPlan(5, ART10);
  assert.ok(c3.streets.length > 40 && c4.streets.length > c3.streets.length && c5.streets.length > c4.streets.length);
  assert.ok(c5.props.filter(x => x.big).length <= 20, 'a town, not a megacity');
  const names = p => new Set(p.props.filter(x => x.big).map(x => x.name));
  for (const n of ['fantasy/town_hall_1', 'fantasy/barracks_1', 'fantasy/blacksmith_1']) assert.ok(names(c3).has(n), n);
  for (const n of ['fantasy/market_1', 'fantasy/merchant_guild_1', 'fantasy/inn_1', 'fantasy/bank_1']) assert.ok(names(c4).has(n), n);
  // nothing on the village plan: public plots and house slots stay free
  const used = new Set(c5.props.flatMap(p => (p.block || []).map(([x, y]) => x + ',' + y)));
  for (const id of ['home', 'farm', 'market', 'hall']) { const r = W.plotRect(id); for (let y = r.ty; y < r.ty + r.h; y++) for (let x = r.tx; x < r.tx + r.w; x++) { assert.ok(!used.has(x + ',' + y), 'building on plot ' + id); assert.ok(!c5.streets.includes(x + ',' + y), 'street through plot ' + id); } }
  assert.ok(names(c5).has('fantasy/town_hall_3')); assert.ok([...names(c5)].some(n => n.startsWith('fantasy/house_c')), 'noble residences in the kingdom district');
  const streets = new Set(c5.streets);
  for (const p of c5.props) for (const [x, y] of p.block || []) {
    assert.ok(!streets.has(x + ',' + y), `${p.name} blocks a street at ${x},${y}`);
    assert.notEqual(W.groundAt(x, y), W.T.WATER, `${p.name} on water`);
  }
  for (const sl of V.TIERS[0].slots.concat(V.TIERS[1].slots)) if (sl.tx) assert.ok(!streets.has(sl.tx + ',' + sl.ty), 'village plots keep their land ' + sl.id);
  // every art name used exists
  for (const p of c5.props) assert.ok(ART10[p.name], p.name);
});

test('showcase town: forest cleared near town only, streets over water are walkable bridges', () => {
  const s = fresh();
  const r = buildShowcase(s, 5).state;
  const d = buildShowcase(s, 3).state;
  const near = W.TREES.filter(n => Math.hypot(n.x - W.CENTER.x, n.y - W.CENTER.y) < 30 && W.nodeStatus(d, n) !== 'gone').length;
  const far = W.TREES.filter(n => Math.hypot(n.x - W.CENTER.x, n.y - W.CENTER.y) > 50 && W.nodeStatus(d, n) !== 'gone').length;
  assert.ok(far > near, 'district: forest only outside the town');
  const br = P.bridgeTiles(r), wet = [...V.roadTiles(r)].filter(k => { const [x, y] = k.split(',').map(Number); return W.groundAt(x, y) === W.T.WATER; });
  assert.ok(wet.every(k => br.has(k)));
});

test('crime: thieves only at night in a populated village; police catch some; theft never makes money negative', () => {
  const s = fresh();
  s.town.stage = 1; // หมู่บ้าน: volunteer watch
  s.placed.push({ uid: 'h1', type: 'cottage', tx: 24, ty: 57, owner: 'npc_a', status: 'done', level: 2 });
  s.homes = { h0: { owner: 'npc_a', name: 'ลุงมี', savings: 15 } };
  assert.deepEqual(CR.crimeHour(s, 12, 40), [], 'no thieves at noon');
  let spawned = 0, outcomes = 0;
  for (let d = 1; d < 120; d++) {
    s.day = d;
    for (const h of [21, 22, 23, 0, 1, 2, 3, 4, 5]) { const ev = CR.crimeHour(s, h, 40); spawned += ev.filter(e => e.startsWith('🕵️')).length; outcomes += ev.filter(e => e.startsWith('🚨') || e.startsWith('👮')).length; }
  }
  const st = CR.ensureCrime(s).stats;
  assert.ok(spawned > 3, 'thieves show up over 4 months: ' + spawned);
  assert.ok(st.caughtByPolice > 0 && st.thefts > 0, JSON.stringify(st));
  assert.ok(s.homes.h0.savings >= 0 && s.town.treasury >= 0 && s.player.coins >= 0);
  assert.equal(CR.activeThieves(s).length, 0, 'everyone gone after daybreak');
  // tiny camp: no crime
  const c = fresh(); c.town.stage = 0;
  for (let h = 0; h < 24; h++) CR.crimeHour(c, h, 10);
  assert.equal(CR.ensureCrime(c).stats.spawned, 0);
});

test('crime: the player can catch a thief in the act; the reward comes from the treasury only', () => {
  const s = fresh(); s.town.stage = 2;
  const c = CR.ensureCrime(s);
  c.thieves.push({ id: 9, status: 'sneaking', target: 'x', kind: 'home', owner: 'npc_b', targetName: 'บ้านป้าแสง', hours: 0 });
  s.town.treasury = 10; const coins = s.player.coins;
  const r = CR.arrestThief(s, 9);
  assert.equal(r.ok, true); assert.equal(r.reward, 10); assert.equal(s.player.coins, coins + 10); assert.equal(s.town.treasury, 0);
  assert.equal(CR.arrestThief(s, 9).ok, false, 'cannot arrest twice');
  assert.ok(CR.policeOfficers(s) >= 2);
});

test('ten town layouts: every district on dry land off the village plan, every zone reachable (scripts/check-layouts.mjs)', async () => {
  const { execFileSync } = await import('node:child_process');
  const out = execFileSync(process.execPath, [new URL('../scripts/check-layouts.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  assert.ok(out.trim().split('\n').length >= 10, '10 generated layouts + maps from the Map Maker'); assert.ok(!/ISSUES/.test(out), out);
  W.generateRegion();
});

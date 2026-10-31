// Layered, seed-generated forest region ("tilemap") + harvesting.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/gameState.js';
import * as W from '../src/world.js';
import { migrate } from '../src/save.js';
import { hitNode, clearingTargets, npcWork, HITS_TO_FELL } from '../src/resources.js';
import { craft, itemCount } from '../src/systems.js';
import { tileRoute } from '../src/pathfinding.js';
import { snapZoom, setZoom, createCamera } from '../src/ui/camera.js';

const fresh = (seed = W.DEFAULT_SEED, biome = 'forest') => { const s = createInitialState(); s.world = { seed, biome }; return migrate(s); };

test('generation is deterministic per seed and different between seeds/biomes', () => {
  W.generateRegion(111, 'forest'); const a = W.WORLD.ground.slice(), ta = W.TREES.length;
  W.generateRegion(111, 'forest'); assert.deepEqual(W.WORLD.ground, a); assert.equal(W.TREES.length, ta);
  W.generateRegion(222, 'forest'); let diff = 0; for (let i = 0; i < a.length; i++) if (a[i] !== W.WORLD.ground[i]) diff++;
  assert.ok(diff > 500, 'another seed gives another map');
  const counts = {};
  for (const b of Object.keys(W.BIOMES)) { W.generateRegion(333, b); counts[b] = W.TREES.length; }
  assert.ok(counts.forest > 500 && counts.riverside > counts.coast, JSON.stringify(counts)); // v0.18 forest map = groves with clearings
  W.generateRegion(W.DEFAULT_SEED, 'forest');
});

test('the game starts in a dense forest with one leader house clearing', () => {
  const s = fresh();
  assert.ok(W.TREES.length > 500, 'lots of trees: ' + W.TREES.length);
  assert.ok(W.ROCKS.filter(r => r.kind === 1).every(r => W.WORLD.orePits.some(([x, y]) => Math.hypot(x - r.x, y - r.y) < 4)), 'rare ore only in the ore pits');
  for (const n of W.TREES) assert.ok(Math.hypot(n.x - W.CENTER.x, n.y - W.CENTER.y) >= W.CLEARING_R - 0.01);
  let near = 0; for (const n of W.ROCKS) if (Math.hypot(n.x - W.CENTER.x, n.y - W.CENTER.y) < 16) near++;
  assert.ok(near >= 3, 'early stone near the clearing');
  assert.equal(W.blocked(Math.floor(W.SPAWN.x / 16), Math.floor((W.SPAWN.y - 4) / 16), s), false, 'spawn walkable');
  assert.equal(W.blocked(W.LEADER_HOUSE.tx + 1, W.LEADER_HOUSE.ty + 1, s), true, 'leader house is solid');
  assert.equal(s.inventory.axe, 1); assert.equal(s.inventory.pickaxe, 0);
});

test('every plot, point and tent is reachable from spawn on many seeds and every biome', () => {
  for (const [seed, biome] of [[W.DEFAULT_SEED, 'forest'], [7, 'forest'], [99, 'riverside'], [1234, 'highland'], [555, 'coast'], [20261030, 'forest']]) {
    const s = fresh(seed, biome);
    const walk = (x, y) => !W.blocked(x, y, s);
    for (const [id, p] of Object.entries(W.POINTS)) {
      const ty = p.type === 'project' ? p.y + Math.ceil(p.h / 2) + 1 : p.y;
      const r = tileRoute(W.SPAWN.x, W.SPAWN.y, (p.x + .5) * 16, (ty + .5) * 16, walk);
      assert.ok(r.length > 0, `${biome}/${seed}: route to ${id}`);
    }
  }
  W.generateRegion(W.DEFAULT_SEED, 'forest');
});

test('axe fells a tree in 3 hits, stump must be dug; pickaxe is crafted from wood and breaks rocks', () => {
  const s = fresh();
  const t = W.TREES.find(n => n.kind !== 3);
  for (let i = 0; i < HITS_TO_FELL - 1; i++) assert.equal(hitNode(s, t.id).ok, true);
  assert.equal(W.blocked(t.x, t.y, s), true, 'still standing');
  const r = hitNode(s, t.id); assert.equal(r.felled, true);
  assert.equal(W.blocked(t.x, t.y, s), false, 'stump is walkable');
  assert.equal(W.buildableGround(t.x, t.y, s).ok === false, true, 'but not buildable');
  assert.equal(hitNode(s, t.id).cleared, true);
  assert.equal(W.nodeStatus(s, t), 'gone');
  assert.equal(s.player.wood, 4); assert.equal(s.stats.woodGathered, 4);
  const rock = W.ROCKS[0];
  assert.equal(hitNode(s, rock.id).ok, false, 'no pickaxe yet');
  assert.equal(craft(s, 'pickaxe').ok, true); assert.equal(itemCount(s, 'pickaxe'), 1); assert.equal(s.player.wood, 0);
  assert.equal(craft(s, 'pickaxe').ok, false, 'only one needed');
  s.player.stamina = 100;
  for (let i = 0; i < 3; i++) hitNode(s, rock.id);
  assert.equal(W.nodeStatus(s, rock), 'gone'); assert.equal(s.player.stone, 4);
});

test('plots must be cleared; NPC helpers clear plot trees first and feed wood to the market', () => {
  const s = fresh();
  const obstacles = W.plotObstacles(s, 'home');
  assert.ok(obstacles.length > 0, 'home plot starts as forest');
  const targets = clearingTargets(s, 50);
  const inPlots = new Set(['home', 'farm', 'market', 'hall'].flatMap(id => W.plotObstacles(s, id).filter(n => n.type === 'wood').map(n => n.id)));
  assert.ok(inPlots.has(targets[0].id), 'first target is inside a plot');
  const w0 = s.market.wood, id = targets[0].id;
  for (let i = 0; i < HITS_TO_FELL; i++) npcWork(s, id);
  assert.equal(W.nodeStatus(s, W.nodeById(id)), 'gone', 'inside the village layout: no stump left'); assert.equal(s.market.wood, w0 + HITS_TO_FELL);
  npcWork(s, id); assert.equal(W.nodeStatus(s, W.nodeById(id)), 'gone');
});

test('village land: buildable only on cleared ground inside the village circle, not on plots or the yard', () => {
  const s = fresh();
  assert.equal(W.buildableGround(W.CENTER.x, W.CENTER.y, s).code, 'reserved');
  assert.equal(W.buildableGround(W.CENTER.x + 40, W.CENTER.y, s).ok, false);
  const p = W.plotRect('home'); assert.equal(W.buildableGround(p.tx + 1, p.ty + 1, s).ok, false);
  let ok = 0; for (let y = 30; y < 70; y++) for (let x = 20; x < 60; x++) if (W.buildableGround(x, y, s).ok) ok++;
  assert.ok(ok > 40, 'some open land exists at the start (clearing ring, meadows)');
});

test('pixel-perfect zoom: rendered zoom * canvas scale is always a whole number', () => {
  for (const k of [1, 1.5, 2, 2.6, 3, 0.75, 0.5]) for (const z of [1.1, 1.73, 2.4, 3.9]) {
    const v = snapZoom(z, k) * k; assert.ok((Math.abs(v - Math.round(v)) < 1e-9 && v >= 1) || [1 / 2, 1 / 3, 1 / 4].some(f => Math.abs(v - f) < 1e-9), `${z}@${k}`); // far out: whole fractions only
  }
  const c = createCamera(); c.k = 2.6; setZoom(c, 2.31, 844, 390);
  assert.ok(Math.abs(c.zoom * 2.6 - Math.round(c.zoom * 2.6)) < 1e-9);
  assert.equal(c.zoomTarget, 2.31, 'gesture target is kept smooth');
});

test('v0.17: trees felled inside the village layout vanish for good; outside they regrow after a few days', async () => {
  const { hitNode, regrowDay, REGROW_DAYS, inLayout } = await import('../src/resources.js');
  const { migrate } = await import('../src/save.js'); const { createInitialState } = await import('../src/gameState.js');
  const s = migrate(createInitialState()); s.player.stamina = 100;
  const inside = W.TREES.find(t => inLayout(s, t) && W.nodeStatus(s, t) === 'standing'), outside = W.TREES.find(t => !inLayout(s, t) && W.nodeStatus(s, t) === 'standing');
  for (const t of [inside, outside]) for (let i = 0; i < 3; i++) { s.player.stamina = 100; hitNode(s, t.id); }
  assert.equal(W.nodeStatus(s, inside), 'gone'); assert.equal(W.nodeStatus(s, outside), 'stump');
  s.day += REGROW_DAYS; regrowDay(s);
  assert.equal(W.nodeStatus(s, inside), 'gone', 'village land stays cleared');
  assert.equal(W.nodeStatus(s, outside), 'standing', 'forest regrows');
});

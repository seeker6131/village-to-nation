// v0.27-0.28 maps from the Map Maker: the village moves to the map, levels keep later areas as forest until they open.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as W from '../src/world.js';
import * as V from '../src/villageLayout.js';
import { MAP as map1 } from '../src/maps/map1.js';

test('a Map Maker map with levels: later areas are forest with hidden roads/lots until the area opens', () => {
  const M = { ...map1, id: 'tiertest', tiers: map1.ground.map((row, y) => [...row].map((_, x) => (x >= 85 ? '3' : '1')).join('')),
    roads: map1.roads.map((row, y) => y >= 40 && y <= 41 ? row.slice(0, 80) + 'L'.repeat(20) + row.slice(100) : row),
    lots: [...map1.lots, { tx: 90, ty: 44, tier: 3 }] };
  W.PLANS.push({ id: M.id, th: 'test', map: M, zones: {}, river: null, lake: null });
  const plan = W.PLANS.length - 1;
  try {
    W.generateRegion(W.DEFAULT_SEED, 'forest', plan);
    const s = { town: { stage: 0 }, world: { n: {}, plan, ver: 0 }, placed: [] };
    const locked = W.TREES.filter(n => n.lockTier === 3);
    assert.ok(locked.length > 50, 'the level-3 area is forest');
    assert.ok(locked.every(n => n.x >= 85));
    assert.ok(!V.roadTiles(s).has('90,40'), 'its road is hidden'); assert.ok(V.roadTiles(s).has('82,40'));
    assert.ok(!V.openSlots(s).some(x => x.tx === 90 && x.ty === 44), 'its lot is closed');
    s.town.stage = 2; V.openRoads(s);
    const gone = locked.filter(n => W.nodeStatus(s, n) === 'gone').length;
    assert.ok(gone > locked.length * .6 && gone < locked.length, 'opening อำเภอ clears most of that forest; groves stay');
    assert.ok(locked.filter(n => W.nodeStatus(s, n) !== 'gone').every(V.keepsTree));
    s.town.treasury = 0; assert.equal(V.hireClearing(s, true).ok, false, 'no money');
    s.town.treasury = 9999; assert.equal(V.hireClearing(s, false).ok, false, 'leader only');
    const r = V.hireClearing(s, true); assert.ok(r.ok && r.cost === r.n * V.CLEAR_COST);
    assert.ok(locked.every(n => W.nodeStatus(s, n) === 'gone'), 'the hired crew clears the rest');
    assert.ok(V.roadTiles(s).has('90,40')); assert.ok(V.openSlots(s).some(x => x.tx === 90 && x.ty === 44));
  } finally { W.PLANS.pop(); W.generateRegion(); }
});

test('map2 (a finished city drawn in the Map Maker): buildings wait for their era, plots stay off them, the bridge opens', async () => {
  const { villageProps, bridgeTiles } = await import('../src/villageProps.js');
  const { ART10 } = await import('../src/artManifest.js');
  const plan = W.PLANS.findIndex(p => p.id === 'map2'); assert.ok(plan >= 0, 'map2 is registered');
  const M = W.PLANS[plan].map;
  try {
    W.generateRegion(W.DEFAULT_SEED, 'forest', plan);
    const s = { town: { stage: 0 }, world: { n: {}, plan, ver: 0 }, placed: [] };
    const names = () => villageProps(s).map(p => p.name);
    assert.ok(!names().includes('cb_parliament') && !names().some(n => /^cb_tower/.test(n)), 'no palace or towers at the camp');
    s.town.stage = 2; assert.ok(names().includes('cb_district'), 'the district office comes with อำเภอ'); assert.ok(!names().includes('cb_hospital'));
    s.town.stage = 4; assert.ok(names().includes('cb_parliament') && names().includes('cb_hospital'));
    // every prop is a real sprite (images imported into the Map Maker were turned into game art)
    for (const p of M.props) assert.ok(ART10[p.name], `sprite ${p.name}`);
    // the bridge deck is walkable once its level opens
    const br = M.props.find(p => p.bridge); assert.ok(br);
    s.town.stage = br.tier - 2; const before = bridgeTiles(s).size; s.town.stage = br.tier - 1;
    assert.ok(bridgeTiles(s).size > before, 'walk over the bridge');
    // public plots: on open (level-1) land and never under a building picture
    for (const id of ['home', 'farm', 'market', 'hall']) { const P = W.POINTS[id]; assert.equal(+(M.tiers[P.y][P.x]), 1, `${id} on level-1 land`); }
    assert.ok(M.npcSlots.filter(x => x.tier === 1).length >= 6, 'enough villager homes for the camp');
  } finally { W.generateRegion(); }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { ART_USED } from '../src/ui/render.js';
test('every image the renderer uses exists in assets/', () => {
  for (const id of ART_USED) assert.ok(fs.existsSync(new URL(`../assets/${id}.webp`, import.meta.url)), 'missing ' + id);
});
import { ART10 } from '../src/artManifest.js';
import { allReachableSprites, buildingFrame, leaderHouseFrame, treeSpecies, rockSprite, ERAS } from '../src/artMap.js';
import { PUBLIC_LEVELS, BUILDINGS } from '../src/construction.js';
import { TREES, ROCKS } from '../src/world.js';

test('v0.10 art pack: every sprite the renderer can request exists on disk and in the manifest', () => {
  for (const n of allReachableSprites()) {
    assert.ok(ART10[n], 'not in manifest: ' + n);
    assert.ok(fs.existsSync(new URL(`../assets/v10/${n}.webp`, import.meta.url)), 'missing file: ' + n);
  }
  for (const t of TREES.slice(0, 400)) assert.ok(ART10['tree_' + treeSpecies(t)] && ART10['stump_' + treeSpecies(t)]);
  for (const r of ROCKS) for (let h = 0; h < 3; h++) assert.ok(ART10[rockSprite(r, h)]);
});

test('building types have different sizes (house < leader < market < hall) and grow through 4 construction stages', () => {
  const w = k => ART10[`${k}_e1_s3`][0];
  assert.ok(w('house') < w('leader') && w('leader') < w('market') && w('market') < w('hall'), 'each building type has its own size');
  const site = { status: 'building', level: 0 };
  assert.equal(buildingFrame('house', site, 0.1), 'house_e1_s0');
  assert.equal(buildingFrame('house', site, 0.5), 'house_e1_s1');
  assert.equal(buildingFrame('house', site, 0.9), 'house_e1_s2');
  assert.equal(buildingFrame('house', { status: 'done', level: 3 }), 'house_e3_s3');
  assert.equal(buildingFrame('market', { status: 'building', level: 2, upgradingTo: 3 }, 0.7), 'market_e3_s2', 'upgrades rebuild into the next era');
  assert.equal(leaderHouseFrame(0), 'leader_e1_s3'); assert.equal(leaderHouseFrame(9), 'leader_e4_s3');
  for (const id of ['home', 'market', 'hall']) assert.equal(PUBLIC_LEVELS[id].length, ERAS[id === 'home' ? 'house' : id], id + ': one level per art era');
  assert.equal(BUILDINGS.cottage.levels.length, ERAS.house);
});

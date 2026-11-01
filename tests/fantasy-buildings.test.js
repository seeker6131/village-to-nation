import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FANTASY_BUILDINGS, FANTASY_STAIRS, FANTASY_ASSET_NAMES } from '../src/fantasyManifest.js';
test('fantasy castle and housing sheet contains three extracted upgrade levels each', () => {
  for (const f of ['castle','house_a','house_b','house_c','dorm','inn']) {
    assert.equal(FANTASY_BUILDINGS[f].length,3,f);
    for (let i=1;i<=3;i++) {
      const file=`../assets/fantasy/${f}_${i}.webp`;
      assert.ok(fs.statSync(new URL(file,import.meta.url)).size>1000, file);
      assert.ok(FANTASY_BUILDINGS[f][i-1].every(x=>x>20),file);
    }
  }
  assert.equal(FANTASY_STAIRS.length,16);
  assert.ok(FANTASY_ASSET_NAMES.includes('fantasy/castle_3'));
});

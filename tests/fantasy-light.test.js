import test from 'node:test';
import assert from 'node:assert/strict';
import { gentleFlicker, skyAt } from '../src/ui/lighting.js';
test('fantasy light flicker is smooth, deterministic and gentle', () => {
  assert.equal(gentleFlicker(7,10),gentleFlicker(7,10));
  for (let t=0;t<12;t+=.1) {
    const a=gentleFlicker(103,t), b=gentleFlicker(103,t+.01);
    assert.ok(a>=.84&&a<=1.16);
    assert.ok(Math.abs(a-b)<.02);
  }
  assert.ok(skyAt(22).dark>.5);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TILESETS } from '../src/tileManifest.js';
test('fantasy ground strips are in the dual-grid pipeline, not drawn as blurry image overlays', () => {
  for (const f of ['grass','road2','bank','bankmask']) {
    const buf=fs.readFileSync(new URL(`../assets/tiles/${f}.webp`,import.meta.url));
    assert.equal(buf.toString('ascii',0,4),'RIFF');assert.equal(buf.toString('ascii',8,12),'WEBP');
    assert.ok(buf.length>500, `${f} populated`);
  }
  assert.equal(TILESETS.grass.n,16);
  assert.equal(TILESETS.road2.kind,'edge');
  assert.equal(TILESETS.bank.kind,'edge');
});

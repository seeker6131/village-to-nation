import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceCell, frameBounds, magentaToAlpha, layerOffset, blitFrame, fantasyFrameRect, FANTASY_FRAME, FANTASY_COLS } from '../src/character/fantasy.js';

const frame = (w, h, pixels) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (const [x, y, rgb = [40, 70, 80]] of pixels) data.set([...rgb, 255], (y * w + x) * 4);
  return { width: w, height: h, data };
};
test('GPT source directions front/back/left/right map to runtime down/left/right/up', () => {
  assert.deepEqual(['down', 'up', 'left', 'right'].map(d => sourceCell(d, 4)), [[4, 0], [4, 1], [4, 2], [4, 3]]);
  assert.deepEqual(sourceCell('up', 99), [8, 1]);
  assert.deepEqual(sourceCell('left', 5, 'beards', 2), [5, 10]);
  assert.deepEqual(sourceCell('right', 5, 'hats', 1), [5, 7]);
});
test('magenta background is alpha zero and sprite pixels stay binary opaque', () => {
  const a = Uint8ClampedArray.from([255,0,255,255, 252,4,250,255, 64,80,90,180, 100,120,40,20]);
  magentaToAlpha(a);
  assert.deepEqual([a[3],a[7],a[11],a[15]], [0,0,255,0]);
});
test('body feet align on baseline and overlay anchors follow frame rather than fixed offsets', () => {
  const body = frame(40,64,[[12,5],[22,5],[12,58],[22,58]]);
  const top = frame(22,15,[[2,0],[20,0],[2,14],[20,14]]);
  const clothes = frame(41,53,[[3,4],[37,4],[3,52],[37,52]]);
  const b = frameBounds(body);
  assert.equal(b.cx,17);
  const pos = layerOffset(body,body,'body');
  assert.equal(pos.y + b.y1,76);
  const hairPos = layerOffset(body,top,'hair');
  assert.equal(hairPos.y + frameBounds(top).y0, pos.y + b.y0 - 1);
  const clothPos = layerOffset(body,clothes,'outfit');
  assert.equal(clothPos.y + frameBounds(clothes).y1,76);
});
test('binary sprite blit clips safely; atlas uses four rows by nine columns', () => {
  const pixels = new Uint8ClampedArray(80 * 80 * 4);
  blitFrame(pixels, frame(2,2,[[0,0],[1,1]]), {x:79,y:79});
  assert.equal(pixels[(79*80+79)*4+3],255);
  assert.equal(pixels[(79*80+78)*4+3],0);
  assert.deepEqual(fantasyFrameRect('up',8), {x:8*FANTASY_FRAME,y:3*FANTASY_FRAME,w:80,h:80});
  assert.equal(FANTASY_COLS,9);
});

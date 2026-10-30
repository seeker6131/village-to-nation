// Skeletal character rig: atlas layout, feet on the ground every frame, real limb motion, recolours.
import test from 'node:test';
import assert from 'node:assert/strict';
import { composeRigAtlas, RIG_DIRS, RIG_COLS, WALK_FRAMES, rigWalkColumn, pose, RIG_HAIRS, RIG_OUTFITS } from '../src/character/rig.js';
import { HAIR_STYLES } from '../src/character/model.js';

const A = composeRigAtlas({ hair: 'messy', outfit: 'farmer' });
const F = 80;
const alpha = (atl, x, y) => atl.data[(y * atl.width + x) * 4 + 3];
function bbox(atl, row, col, yMin = 0) {
  let x0 = F, y0 = F, x1 = -1, y1 = -1;
  for (let y = yMin; y < F; y++) for (let x = 0; x < F; x++) if (alpha(atl, col * F + x, row * F + y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
}

test('rig atlas: 4 directions × (idle + 8 walk frames), binary alpha', () => {
  assert.equal(A.width, RIG_COLS * F); assert.equal(A.height, RIG_DIRS.length * F);
  assert.equal(RIG_COLS, 1 + WALK_FRAMES);
  for (let i = 3; i < A.data.length; i += 4) assert.ok(A.data[i] === 0 || A.data[i] === 255);
});

test('feet touch the ground line (y≈76, outline 77) in every frame; character ~62 px tall', () => {
  for (let r = 0; r < 4; r++) for (let c = 0; c < RIG_COLS; c++) {
    const b = bbox(A, r, c);
    assert.ok(b.y1 >= 75 && b.y1 <= 77, `row ${r} col ${c}: feet at ${b.y1}`);
    assert.ok(b.y1 - b.y0 >= 56 && b.y1 - b.y0 <= 72, `row ${r} col ${c}: height ${b.y1 - b.y0}`);
  }
});

test('walking really moves the limbs: side frames differ, legs spread and close, right = mirrored left', () => {
  const L = RIG_DIRS.indexOf('left'), R = RIG_DIRS.indexOf('right');
  const widths = []; for (let c = 1; c < RIG_COLS; c++) { const b = bbox(A, L, c, 58); widths.push(b.x1 - b.x0); }
  assert.ok(Math.max(...widths) - Math.min(...widths) >= 5, 'stride opens and closes: ' + widths);
  const idle = bbox(A, L, 0, 58), stride = bbox(A, L, 1 + WALK_FRAMES / 4, 58);
  assert.ok(stride.x1 - stride.x0 > idle.x1 - idle.x0 + 4, 'legs spread on the contact frame');
  for (let y = 0; y < F; y++) for (let x = 0; x < F; x++) assert.equal(alpha(A, 3 * F + x, L * F + y), alpha(A, 3 * F + (F - 1 - x), R * F + y));
  const p = pose('side', 3), q = pose('side', 7);
  assert.ok(Math.sign(p.near.thigh) === -Math.sign(q.near.thigh), 'thigh swings forward then back');
  assert.ok(pose('side', 2).near.thigh !== pose('side', 2).far.thigh, 'legs alternate');
});

test('walk column cycles 1..8 by distance; idle is column 0', () => {
  assert.equal(rigWalkColumn(false, 123, 4.5), 0);
  const cols = new Set(); for (let d = 0; d < 100; d += 1) cols.add(rigWalkColumn(true, d, 4.5));
  assert.deepEqual([...cols].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('every hairstyle and outfit renders on the rig; skin/hair colour changes the pixels', () => {
  assert.ok(RIG_HAIRS.includes('messy') && RIG_OUTFITS.includes('farmer'));
  for (const hair of HAIR_STYLES) { const t = composeRigAtlas({ hair, outfit: 'civil' }); assert.ok(bbox(t, 0, 0).y1 >= 75, hair); }
  const sum = d => { let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s; };
  const a = composeRigAtlas({ hair: 'messy', skin: 's1', outfit: 'cream' }), b = composeRigAtlas({ hair: 'messy', skin: 's5', outfit: 'cream' });
  assert.ok(sum(a.data) > sum(b.data), 'darker skin tone -> darker pixels');
  const c = composeRigAtlas({ hair: 'messy', hairColor: 'blonde', outfit: 'cream' }), d0 = composeRigAtlas({ hair: 'messy', hairColor: 'black', outfit: 'cream' });
  assert.ok(sum(c.data) > sum(d0.data), 'hair colour applies to rig hair');
});

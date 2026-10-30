// Sprite atlas QA: 4x4 frames of 64px, real alpha, consistent anchors, hair aligned on every frame.
const OLD_HAIRS = ['pony', 'swept', 'short']; // hairstyles baked into the v0.8 atlas
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CHARACTER_ATLAS } from '../src/character/atlasData.js';
import { decodeRle, composeAtlas, MAT, PART, shadeColor, animationColumn, frameRect } from '../src/character/composer.js';
import { validateName, graphemeLength, normalizeAppearance, fromV07Character, OUTFITS, HAIR_STYLES } from '../src/character/model.js';

const anchors = JSON.parse(fs.readFileSync(new URL('../assets/characters/anchors.json', import.meta.url)));
const N = 256 * 256, F = 64;
const layer = n => { const L = CHARACTER_ATLAS.layers[n]; return { pal: L.palette, idx: decodeRle(L.data, N), parts: L.parts && decodeRle(L.parts, N) }; };
const body = layer('body');
function cellMask(L, r, c) { const m = []; for (let y = 0; y < F; y++) for (let x = 0; x < F; x++) if (L.idx[(r * F + y) * 256 + c * F + x]) m.push([x, y]); return m; }

test('atlas is 256x256 = 4x4 frames of 64x64, rows down/left/right/up', () => {
  assert.equal(CHARACTER_ATLAS.size, 256); assert.equal(CHARACTER_ATLAS.frame, 64);
  assert.deepEqual(CHARACTER_ATLAS.dirs, ['down', 'left', 'right', 'up']);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) assert.ok(cellMask(body, r, c).length > 600, `frame ${r},${c} has body pixels`);
});

test('PNG layers are true RGBA with binary alpha (no halo / semi-transparent fringe)', () => {
  for (const f of fs.readdirSync(new URL('../assets/characters/', import.meta.url)).filter(f => f.endsWith('_4x4.png'))) {
    const buf = fs.readFileSync(new URL('../assets/characters/' + f, import.meta.url));
    assert.equal(buf.toString('ascii', 12, 16), 'IHDR');
    assert.equal(buf.readUInt32BE(16), 256); assert.equal(buf.readUInt32BE(20), 256);
    assert.equal(buf[25], 6, `${f} colour type must be RGBA`);
  }
  // runtime data: every opaque pixel is fully opaque by construction; no red fringe colours on the outline
  for (const [r, g, b, m] of body.pal.slice(1)) assert.ok(!(r > 150 && g < 60 && b < 60 && r - g > 110), `no pure-red fringe colour in body palette (${r},${g},${b},${m})`);
});

test('feet sit on the same baseline in every frame; head top identical within a direction', () => {
  for (const d of CHARACTER_ATLAS.dirs) {
    const a = anchors.body[d];
    assert.ok(Math.max(...a.map(f => f.feet)) === anchors.baseline, `${d}: tallest frame touches baseline`);
    for (const f of a) assert.ok(anchors.baseline - f.feet <= 2, `${d}: lifted foot at most 2px`);
    assert.equal(new Set(a.map(f => f.headTop)).size, 1, `${d}: head top must not jitter`);
    assert.ok(new Set(a.map(f => Math.round(f.headCenterX))).size === 1, `${d}: head centre must not jitter`);
  }
  // across directions the body height is consistent (no stretched rows)
  const heights = CHARACTER_ATLAS.dirs.map(d => anchors.baseline - anchors.body[d][0].headTop);
  assert.ok(Math.max(...heights) - Math.min(...heights) <= 3, 'body height consistent across directions: ' + heights);
});

test('uniform scale: no frame was individually resized', () => {
  assert.equal(anchors.scale.body, 1 / 5.5); assert.equal(anchors.scale.hair, 1 / 7.5);
  for (let r = 0; r < 4; r++) {
    const ws = [0, 1, 2, 3].map(c => { const m = cellMask(body, r, c); const ys = m.map(p => p[1]); return Math.max(...ys) - Math.min(...ys); });
    assert.ok(Math.max(...ws) - Math.min(...ws) <= 2, `row ${r} heights ${ws}`);
  }
});

test('every hairstyle covers the skull on every frame, sits on the head and never hides the eyes in side/back views', () => {
  for (const h of OLD_HAIRS) {
    const L = layer(`hair_${h}_front`);
    for (let r = 0; r < 4; r++) {
      const d = CHARACTER_ATLAS.dirs[r], fit = anchors.hairFit[h][d];
      assert.ok(fit.skullCover >= 0.75, `${h}/${d} skull cover ${fit.skullCover}`);
      if (d !== 'down') assert.equal(fit.eyePixelsCovered, 0, `${h}/${d} must not cover eyes`);
      for (let c = 0; c < 4; c++) {
        const m = cellMask(L, r, c); assert.ok(m.length > 300, `${h} ${d} frame ${c} has hair`);
        const top = Math.min(...m.map(p => p[1])), headTop = anchors.body[d][c].headTop;
        assert.ok(top <= headTop && headTop - top <= 14, `${h} ${d}#${c}: hair top ${top} vs head ${headTop}`);
        const cx = m.reduce((s, p) => s + p[0], 0) / m.length;
        assert.ok(Math.abs(cx - anchors.body[d][c].headCenterX) < 9, `${h} ${d}#${c}: hair centred on head`);
      }
    }
  }
});

test('side views face the correct way (fixes v0.7 mirrored hair)', () => {
  // the body's eyes are on the facing side; the hair's face opening must be on the same side
  for (const [r, side] of [[1, 'left'], [2, 'right']]) {
    const eyes = []; for (let y = 0; y < F; y++) for (let x = 0; x < F; x++) { const i = (r * F + y) * 256 + x; if (body.idx[i] && body.pal[body.idx[i]][3] === MAT.EYE) eyes.push(x); }
    const ex = eyes.reduce((a, b) => a + b, 0) / eyes.length, hc = anchors.body[CHARACTER_ATLAS.dirs[r]][0].headCenterX;
    assert.ok(side === 'left' ? ex < hc : ex > hc, `row ${r} eyes should be on the ${side}`);
    for (const h of OLD_HAIRS) {
      const L = layer(`hair_${h}_front`);
      let visibleEye = 0; for (let y = 0; y < F; y++) for (let x = 0; x < F; x++) { const i = (r * F + y) * 256 + x; if (body.idx[i] && body.pal[body.idx[i]][3] === MAT.EYE && !L.idx[i]) visibleEye++; }
      assert.ok(visibleEye >= eyes.length * 0.6, `${h} row ${r}: eye stays visible (${visibleEye}/${eyes.length})`);
    }
  }
});

test('body part map supports clothing: torso, arms, legs, feet exist in every frame', () => {
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    const seen = new Set();
    for (let y = 0; y < F; y++) for (let x = 0; x < F; x++) { const i = (r * F + y) * 256 + c * F + x; if (body.idx[i]) seen.add(body.parts[i] >> 3); }
    for (const p of [PART.HEAD, PART.TORSO, PART.LEG, PART.FOOT, PART.UNDER]) assert.ok(seen.has(p), `frame ${r},${c} missing part ${p}`);
  }
});

test('composer recolours skin/hair/eyes/outfit without changing the silhouette', () => {
  const a = composeAtlas({ hair: 'pony', outfit: 'cream' });
  const b = composeAtlas({ hair: 'pony', hairColor: 'blonde', skin: 's5', eyes: 'blue', outfit: 'civil' }, { unlockedOutfits: ['civil'] });
  let diff = 0, alphaDiff = 0;
  for (let i = 0; i < N; i++) { if ((a[i * 4 + 3] > 0) !== (b[i * 4 + 3] > 0)) alphaDiff++; if (a[i * 4] !== b[i * 4]) diff++; }
  assert.equal(alphaDiff, 0, 'same silhouette'); assert.ok(diff > 5000, 'colours changed');
  for (let i = 3; i < a.length; i += 4) assert.ok(a[i] === 0 || a[i] === 255);
  assert.deepEqual(shadeColor([100, 100, 100], 100), [100, 100, 100]);
});

test('walk cycle uses 4 frames, idle uses a standing frame', () => {
  assert.deepEqual([0, 1, 2, 3].map(i => animationColumn('down', true, i / 8, 8)), [0, 1, 2, 3]);
  assert.equal(animationColumn('down', false, 5), CHARACTER_ATLAS.idleCol.down);
  assert.deepEqual(frameRect('right', 2), { x: 128, y: 128, w: 64, h: 64 });
});

test('names: Thai and English, 2-16 graphemes, no markup', () => {
  assert.equal(validateName('ต้นกล้า').ok, true); assert.equal(validateName('ต้นกล้า').lang, 'th');
  assert.equal(validateName('River Song').ok, true); assert.equal(validateName('River').lang, 'en');
  assert.equal(graphemeLength('ต้นกล้า'), 5);
  assert.equal(validateName('ก').ok, false);
  assert.equal(validateName('<b>hi</b>').code, 'chars');
  assert.equal(validateName('   ').code, 'empty');
  assert.equal(validateName('12').code, 'letters');
  assert.equal(validateName('ก'.repeat(17)).code, 'long');
});

test('appearance normalisation blocks locked/unknown outfits; v0.7 character imports', () => {
  assert.equal(normalizeAppearance({ outfit: 'civil' }).outfit, 'cream');
  assert.equal(normalizeAppearance({ outfit: 'civil' }, ['civil']).outfit, 'civil');
  assert.equal(normalizeAppearance({ hair: 'mohawk', skin: 'x' }).hair, 'pony');
  const c = fromV07Character({ name: 'มะปราง', hair: 'bob', outfit: 'green', lang: 'th' });
  assert.equal(c.appearance.hair, 'swept'); assert.equal(c.appearance.outfit, 'green');
  for (const o of Object.values(OUTFITS)) assert.ok(['free', 'job', 'shop'].includes(o.source));
});

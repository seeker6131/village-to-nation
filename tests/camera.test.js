import test from 'node:test';
import assert from 'node:assert/strict';
import { createCamera, clampCamera, zoomLimits, setZoom, screenToWorld, worldToScreen, zoomAt, WORLD_PX_W, WORLD_PX_H, defaultZoom } from '../src/ui/camera.js';
import { canvasResolution, QUALITY_PROFILES } from '../src/performance.js';

test('camera never shows outside the map and zoom is limited', () => {
  const c = createCamera(); setZoom(c, 0.01, 844, 390);
  const k2 = createCamera(); k2.k = 2.6; setZoom(k2, 0.01, 844, 390);
  assert.ok(k2.zoom < 1 / 2.6, 'a phone can zoom out past 1 canvas px per world px');
  assert.ok(k2.zoom * WORLD_PX_W <= 844 + 1 && k2.zoom * WORLD_PX_H <= 390 + 1, 'fully zoomed out the whole map is on screen');
  assert.ok(k2.zoom * WORLD_PX_W >= 844 / 2 || k2.zoom * WORLD_PX_H >= 390 / 2, 'but not a tiny stamp');
  setZoom(c, 99, 844, 390); assert.equal(c.zoom, zoomLimits(844, 390).max);
  c.x = -999; c.y = 99999; clampCamera(c, 844, 390);
  assert.ok(c.x - 844 / c.zoom / 2 >= -1e-6 && c.y + 390 / c.zoom / 2 <= WORLD_PX_H + 1e-6);
});
test('screen/world conversion round-trips and zoomAt keeps focus point', () => {
  const c = createCamera(); c.follow = false; c.zoom = 2; c.x = 600; c.y = 300;
  const w = screenToWorld(c, 100, 50, 844, 390), s = worldToScreen(c, w.x, w.y, 844, 390);
  assert.ok(Math.abs(s.x - 100) < 1e-9 && Math.abs(s.y - 50) < 1e-9);
  zoomAt(c, 1.5, 100, 50, 844, 390);
  const w2 = screenToWorld(c, 100, 50, 844, 390);
  assert.ok(Math.abs(w2.x - w.x) < 1e-6 && Math.abs(w2.y - w.y) < 1e-6);
  assert.ok(defaultZoom(844, 390) >= 1.4);
});
test('graphics quality really changes the internal render resolution', () => {
  const lo = canvasResolution(844, 390, 3, 'low'), md = canvasResolution(844, 390, 3, 'medium'), hi = canvasResolution(844, 390, 3, 'high');
  assert.ok(lo.w < md.w && md.w < hi.w);
  assert.equal(lo.w, 422); assert.equal(hi.w, 2532);
  assert.equal(QUALITY_PROFILES.low.shadow, false); assert.equal(QUALITY_PROFILES.high.animatedWater, true);
  assert.ok(canvasResolution(3000, 2000, 2, 'high').w <= 2560);
});

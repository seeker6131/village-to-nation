import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLD_W, PLANS, T, generateRegion, groundAt } from '../src/world.js';
import { waterfallSpot } from '../src/artMap.js';

test('a lake reaching the eastern world edge never traps the waterfall scanner', () => {
  const plan = PLANS.findIndex(p => p.id === 'fantasy_lake');
  assert.ok(plan >= 0, 'fantasy lake generated');
  generateRegion(20261029, 'forest', plan);
  assert.equal(groundAt(WORLD_W - 1, 1), T.WATER, 'regression fixture has water at the eastern border');
  const now = performance.now();
  assert.equal(waterfallSpot(), null, 'open-edge lake is not a short waterfall');
  assert.ok(performance.now() - now < 300, 'scanner completes without an unbounded loop');
});

test('waterfall scan terminates on all five authored fantasy maps', () => {
  for (const id of ['fantasy_valley', 'fantasy_lake', 'fantasy_pines', 'fantasy_meadow', 'fantasy_pass']) {
    const plan = PLANS.findIndex(p => p.id === id);
    assert.ok(plan >= 0, id + ' generated');
    generateRegion(20261029, 'forest', plan);
    const now = performance.now();
    const spot = waterfallSpot();
    assert.ok(performance.now() - now < 300, id + ' scanner completes');
    if (spot) assert.ok(spot.x >= 0 && spot.x < WORLD_W, id + ' waterfall stays in bounds');
  }
});

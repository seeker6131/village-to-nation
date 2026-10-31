import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/gameState.js';
import { migrate } from '../src/save.js';
import { buildShowcase, SHOWCASES } from '../src/showcase.js';
import { openSlots, slotState } from '../src/villageLayout.js';

test('showcase builds a finished copy of every level and never touches the real save', () => {
  const real = migrate(createInitialState()), before = JSON.stringify(real);
  for (const sc of SHOWCASES) {
    const { state } = buildShowcase(real, sc.id);
    assert.equal(state.town.stage, sc.stage);
    for (const sl of openSlots(state)) assert.equal(slotState(state, sl).state, 'done', `${sc.id} ${sl.id}`);
    assert.ok(state.publicSites.home.level >= Math.min(sc.era, 5) - 0);
  }
  assert.equal(JSON.stringify(real), before, 'real state unchanged');
});

test('test tool: going back an era puts the forest back and houses down to what the era allows', async () => {
  const W = await import('../src/world.js'), S = await import('../src/showcase.js'), { createInitialState } = await import('../src/gameState.js'), { migrate } = await import('../src/save.js');
  const plan = W.PLANS.findIndex(p => p.id === 'map2');
  try {
    const s = migrate(createInitialState()); s.world.plan = plan; W.ensureWorld(s);
    S.setLevel(s, 4); S.fillLevel(s);
    const locked = W.TREES.filter(n => n.lockTier >= 3);
    assert.ok(locked.some(n => W.nodeStatus(s, n) === 'gone'));
    assert.ok(s.placed.some(p => p.type === 'cottage' && p.level >= 4));
    S.setLevel(s, 0);
    assert.ok(locked.every(n => W.nodeStatus(s, n) !== 'gone'), 'future land is forest again');
    assert.ok(s.placed.filter(p => p.type === 'cottage').every(p => p.level <= 1), 'only cabins in the camp');
  } finally { W.generateRegion(); }
});

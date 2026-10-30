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

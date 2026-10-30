import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, SAVE_KEY } from '../src/gameState.js';
import { loadGame, saveGame, migrate, V07_KEY, BACKUP_KEY, SCHEMA } from '../src/save.js';
const store = (init = {}) => { const m = new Map(Object.entries(init)); return { m, getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };

test('v0.5 (schema 1) save keeps progress, gets backed up and upgraded', () => {
  const old = createInitialState(); old.player.coins = 321; old.projects.home = true; old.player.wood = 9;
  old.placed = [{ uid: 'p1', type: 'garden', tx: 60, ty: 5, plantedAt: null }];
  const st = store({ [SAVE_KEY]: JSON.stringify(old) });
  const { state, notes } = loadGame(st);
  assert.equal(state.schema, SCHEMA); assert.equal(state.player.coins, 321 + 6, 'garden cost refunded');
  assert.equal(state.publicSites.home.status, 'done'); assert.equal(state.placed.length, 0, 'old painted-map buildings moved out');
  assert.equal(state.player.wood, 9 + 2);
  assert.ok(st.m.has(BACKUP_KEY)); assert.ok(notes.some(n => n.includes('v0.5'))); assert.ok(notes.some(n => n.includes('ป่าบุกเบิก')));
  assert.ok(state.leadership.founder);
  assert.equal(state.character, null, 'needs the dressing room');
});

test('v0.7 character is imported once into the main save', () => {
  const st = store({ [V07_KEY]: JSON.stringify({ coins: 200, character: { name: 'ฟ้าใส', hair: 'short', outfit: 'red', lang: 'th' } }) });
  const { state } = loadGame(st);
  assert.equal(state.character.name, 'ฟ้าใส'); assert.equal(state.character.appearance.hair, 'short'); assert.equal(state.character.appearance.outfit, 'red');
});

test('save -> load round trip keeps character, construction and economy', () => {
  const st = store();
  const { state } = loadGame(st);
  state.character = { name: 'River', lang: 'en', appearance: { hair: 'swept', hairColor: 'black', skin: 's3', eyes: 'green', outfit: 'blue' } };
  state.player.coins = 77; state.market.food = 3;
  assert.equal(saveGame(st, state), true);
  const again = loadGame(st).state;
  assert.equal(again.character.name, 'River'); assert.equal(again.character.appearance.eyes, 'green');
  assert.equal(again.player.coins, 77); assert.equal(again.market.food, 3);
});

test('corrupt saves never crash and invalid names are dropped', () => {
  const st = store({ [SAVE_KEY]: '{oops' });
  const { state, notes } = loadGame(st);
  assert.equal(state.day, 1); assert.ok(notes.length); assert.ok(st.m.has(SAVE_KEY + '-corrupt'));
  const m = migrate({ ...createInitialState(), schema: 2, character: { name: '<x>', appearance: {} } });
  assert.equal(m.character, null);
});

test('storage failures are tolerated', () => {
  const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const { state, notes } = loadGame(bad);
  assert.equal(state.day, 1); assert.ok(notes.length);
  assert.equal(saveGame(bad, state), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { ENGINE_FORMAT, ENGINE_KEY, MAP_KEY, FAMILIES, newProject, normalizeProject, serializeProject, validConfig } from '../engine/project.js';

test('engine is a separate editor with stable project keys and fantasy catalog', () => {
  assert.equal(ENGINE_FORMAT, 'v2n-engine-project@1');
  assert.notEqual(ENGINE_KEY, MAP_KEY);
  assert.ok(FAMILIES.includes('castle') && FAMILIES.includes('house_c'));
  assert.ok(!FAMILIES.some(s => /modern|office|asphalt/.test(s)));
});

test('engine can export and reimport an existing Map Maker scene', () => {
  const map = { format: 'v2n-map@1', name: 'Castle Town', width: 144, height: 96, ground: [], objects: [{ x: 12, y: 14, asset: 'fantasy/castle_1' }] };
  const json = serializeProject(newProject(), JSON.stringify(map));
  const data = normalizeProject(JSON.parse(json));
  assert.equal(data.name, 'Village to Nation — Fantasy');
  assert.equal(data.map.name, 'Castle Town');
  assert.equal(data.map.objects[0].asset, 'fantasy/castle_1');
  assert.equal(data.config.dayMinutes, 20);
});

test('malformed project archives and invalid tuning values are rejected safely', () => {
  assert.throws(() => normalizeProject(null), /โปรเจกต์|Project/);
  assert.throws(() => normalizeProject({ format: 'v2n-map@1' }), /โปรเจกต์|Project/);
  assert.throws(() => normalizeProject({ ...newProject(), map: { format: 'bad' } }), /แมพ/);
  const p = newProject();
  p.config.dayMinutes = -1;
  assert.equal(validConfig(p.config), false);
  assert.throws(() => normalizeProject(p), /ค่าเกม/);
  p.config.dayMinutes = 20;
  p.config.npcLimit = 0;
  assert.throws(() => normalizeProject(p), /ค่าเกม/);
});

test('project normalization ignores unexpected fields and limits user text', () => {
  const p = normalizeProject({ ...newProject(), name: 'A'.repeat(200), injected: 'do not copy' });
  assert.equal(p.name.length, 100);
  assert.equal('injected' in p, false);
  assert.deepEqual(Object.keys(p.config).sort(), ['dayMinutes', 'npcLimit', 'seasonDays', 'startSilver'].sort());
});

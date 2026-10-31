import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSettings, loadSettings, saveSettings, QUALITY_PROFILES, frameIntervalMs, SETTINGS_KEY } from '../src/performance.js';

test('default frame/quality choice and invalid settings are safe', () => {
  const def={fps:60,quality:'medium',showFps:false,sfx:0.6,ambience:0.3,muted:false,uiScale:1};
  assert.deepEqual(normalizeSettings({ fps: 999, quality: 'ultra', showFps: 1, sfx: 7 }),{...def,sfx:1});
  assert.deepEqual(normalizeSettings(null),def);
  for(const fps of [30,60,120]) assert.equal(normalizeSettings({fps}).fps,fps);
  for(const quality of ['low','medium','high']) assert.equal(normalizeSettings({quality}).quality,quality);
});

test('frame durations correspond to requested maximum FPS', () => {
  assert.ok(Math.abs(frameIntervalMs(30) - 33.33333)<0.001);
  assert.ok(Math.abs(frameIntervalMs(60) - 16.66667)<0.001);
  assert.ok(Math.abs(frameIntervalMs(120) - 8.33333)<0.001);
});

test('quality levels affect decor and animation without gameplay state', () => {
  assert.ok(QUALITY_PROFILES.high.groundDecor > QUALITY_PROFILES.medium.groundDecor);
  assert.ok(QUALITY_PROFILES.medium.groundDecor > QUALITY_PROFILES.low.groundDecor);
  assert.ok(QUALITY_PROFILES.high.particles > QUALITY_PROFILES.low.particles);
});

test('save/load preferences works independently of game save', () => {
  const map=new Map(); const storage={getItem: key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value)};
  saveSettings(storage,{fps:120,quality:'high',showFps:true});
  assert.deepEqual(loadSettings(storage),{fps:120,quality:'high',showFps:true,sfx:0.6,ambience:0.3,muted:false,uiScale:1});
  saveSettings(storage,{uiScale:0.7}); assert.equal(loadSettings(storage).uiScale,0.7,'HUD size is remembered'); saveSettings(storage,{uiScale:3}); assert.equal(loadSettings(storage).uiScale,1,'odd sizes fall back to 100%');
  assert.ok(map.has(SETTINGS_KEY));
  storage.setItem(SETTINGS_KEY,'invalid-json');
  assert.equal(loadSettings(storage).fps,60);
});

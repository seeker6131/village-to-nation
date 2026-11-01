// Village to Nation v0.8 — bootstrap & main loop.
// Modules: ui/game.js (controller & shared context), ui/render.js, ui/panels.js, ui/creator.js, ui/input.js, ui/hud.js.
import { loadSettings, frameIntervalMs } from './performance.js';
import { G, initGame, simulate, saveNow, interactables, interact, fitCamera, resetNpcPlans } from './ui/game.js';
import { initRenderer, loadArt, render, drawStartArt } from './ui/render.js';
import { initPanels } from './ui/panels.js';
import { initCreator } from './ui/creator.js';
import { initInput } from './ui/input.js';
import { initShowcase } from './ui/showcaseUi.js';
import { initTravel } from './ui/travel.js';
import { initIndoor } from './ui/indoor.js';
import { applyPlan } from './showcase.js';
import { PLANS, SPAWN } from './world.js';
import { MAPS } from './maps/index.js';
import { sandboxEnabled, sandboxStorage, ensureSandboxCharacter, topUp, setSandbox } from './sandbox.js';
import { hud, syncBuildBar } from './ui/hud.js';
import { applySettings } from './ui/settingsApply.js';
import { clampCamera, setZoom, defaultZoom } from './ui/camera.js';
import { configureAudio } from './audio.js';
import { applyOrientation, playFullscreenLandscape, isForced } from './ui/orientation.js';

const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);

// localStorage can be unavailable (file://, private mode). Fall back to memory so the game still runs.
function pickStorage() {
  try { const k = '__v2n_probe__'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return localStorage; }
  catch { const m = new Map(); G.memoryOnly = true; return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; }
}

let toastTimer = 0;
function toast(msg, bad = false) {
  const t = $('#toast'); t.textContent = msg; t.classList.toggle('bad', !!bad); t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

function resize() {
  const r = applyOrientation(); // effective size (swapped while the CSS landscape rotation is active)
  const prevW = G.cssW, prevH = G.cssH;
  G.cssW = Math.max(200, r.w); G.cssH = Math.max(150, r.h);
  applySettings();
  if (!G.sized) { fitCamera(); G.sized = true; }
  else if (prevW !== G.cssW || prevH !== G.cssH) { G.cam.baseZoom = defaultZoom(G.cssW, G.cssH); setZoom(G.cam, G.cam.zoomTarget || G.cam.zoom, G.cssW, G.cssH); }
  clampCamera(G.cam, G.cssW, G.cssH);
  const portrait = G.cssH > G.cssW && matchMedia('(pointer:coarse)').matches && !isForced();
  $('#rotate-hint').classList.toggle('hidden', !portrait || !!G.rotateDismissed || G.creatorOpen);
}

// ---------------------------------------------------------------- loop
let prev = 0, frameBudget = 0, simBudget = 0, fpsStart = 0, fpsFrames = 0, hudTimer = 0, autosave = 0;
function loop(ms) {
  const elapsed = prev ? Math.max(0, Math.min(100, ms - prev)) : 0; prev = ms;
  const target = frameIntervalMs(G.settings.fps);
  frameBudget = Math.min(target * 2, frameBudget + elapsed);
  simBudget = Math.min(250, simBudget + elapsed);
  if (frameBudget + 0.5 >= target || !fpsStart) {
    frameBudget = Math.max(0, frameBudget - target);
    const dt = simBudget / 1000; simBudget = 0; G.now = ms / 1000;
    const paused = !!G.panel || G.creatorOpen || !!G.indoor || !G.state.character; // menus pause the world (no missed events while reading)
    if (G.sandbox) topUp(G.state);
    if (!paused) {
      simulate(dt);
      autosave += dt; if (autosave > 8) { saveNow(); autosave = 0; }
      if (G.pendingInteract && !G.waypoint) {
        const e = interactables().find(i => i.id === G.pendingInteract); G.pendingInteract = null;
        if (e && Math.hypot(e.x - G.state.player.x, e.y - G.state.player.y) <= e.r + 6) interact(e);
      }
      if (G.keys.size || G.stick.active) G.pendingInteract = null;
    }
    // camera follows smoothly unless the player is panning / in overview
    if (G.cam.follow && !G.cam.overview) { const k = Math.min(1, dt * 8); G.cam.x += (G.state.player.x - G.cam.x) * k; G.cam.y += (G.state.player.y - 12 - G.cam.y) * k; }
    clampCamera(G.cam, G.cssW, G.cssH);
    if (G.state.character || !G.creatorOpen) render();
    fpsFrames++; if (!fpsStart) fpsStart = ms;
    if (ms - fpsStart >= 1000) { G.measuredFps = Math.round(fpsFrames * 1000 / (ms - fpsStart)); fpsFrames = 0; fpsStart = ms; }
    hudTimer += dt; if (hudTimer > 0.2) { hud(); hudTimer = 0; }
  }
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- start screen
// Every launch: one big button = fullscreen + landscape (CSS rotation where the OS can't lock), or windowed.
function startScreen() {
  const el = $('#start-screen');
  if (params.has('test') && !params.has('start')) return Promise.resolve(); // automated tests skip it unless asked
  el.classList.remove('hidden'); G.creatorOpen = true; drawStartArt($('#ss-art'));
  $('#ss-continue').textContent = G.state.character ? `เล่นต่อ: ${G.state.character.name} · วันที่ ${G.state.day}` : 'เริ่มหมู่บ้านใหม่ในป่า';
  return new Promise(res => {
    const go = async full => {
      if (full) { const r = await playFullscreenLandscape(); G.startMode = r; }
      el.classList.add('hidden'); G.creatorOpen = false; window.removeEventListener('keydown', key); resize(); res();
    };
    $('#ss-play').onclick = () => go(true);
    $('#ss-window').onclick = () => go(false);
    const sb = $('#ss-sandbox'); sb.checked = !!G.sandbox; sb.onchange = () => { setSandbox(G.rawStorage, sb.checked); location.reload(); };
    const key = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.removeEventListener('keydown', key); go(true); } };
    window.addEventListener('keydown', key);
    $('#ss-play').focus();
  });
}

// ---------------------------------------------------------------- boot
async function boot() {
  const rawStorage = pickStorage();
  G.sandbox = sandboxEnabled(rawStorage, params); G.rawStorage = rawStorage;
  const storage = G.sandbox ? sandboxStorage(rawStorage) : rawStorage;
  // every brand-new village gets its own forest seed (?seed= / ?biome= let testers preview other regions)
  const seed = params.has('seed') ? Number(params.get('seed')) : (params.has('test') ? undefined : (Date.now() % 2147483647));
  initGame(storage, { dev: params.has('dev'), newSeed: seed, biome: params.get('biome') });
  G.settings = loadSettings(storage);
  G.canvas = $('#game');
  G.toast = toast; G.hud = hud; G.syncBuildBar = syncBuildBar;
  G.applyZoom = () => setZoom(G.cam, G.cam.zoomTarget || G.cam.zoom, G.cssW, G.cssH);
  G.measuredFps = 0;
  initRenderer(G.canvas);
  initPanels(); initCreator(); initInput(); initShowcase(); initTravel(); initIndoor();
  configureAudio(G.settings);
  new ResizeObserver(resize).observe($('#app'));
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  window.addEventListener('resize', resize);
  resize();
  await loadArt();
  $('#app').classList.remove('booting');
  hud();
  await startScreen();
  // every new town gets its own layout (one of 10) so no two founders' towns look alike; old saves keep theirs
  if (!G.state.world.planPicked) {
    if (G.state.day === 1 && !G.state.placed.length && !params.has('test')) { applyPlan(G.state, PLANS.findIndex(p => p.id === MAPS[2 + Math.floor(Math.random() * 5)].id)); G.state.player.x = SPAWN.x; G.state.player.y = SPAWN.y; }
    G.state.world.planPicked = true; saveNow();
  }
  { // ?map=map1 opens a map drawn in the Map Maker (test link)
    const want = params.get('map'), i = want ? PLANS.findIndex(p => p.id === want) : -1;
    if (i >= 0 && G.state.world.plan !== i) { applyPlan(G.state, i); G.state.player.x = SPAWN.x; G.state.player.y = SPAWN.y; saveNow(); resetNpcPlans(); }
  }
  if (G.sandbox && ensureSandboxCharacter(G.state)) { saveNow(); resetNpcPlans(); toast('🧪 โหมดทดสอบ ∞: เงิน ไม้ หิน พลังงานไม่จำกัด · ไม่ต้องตั้งชื่อ (ปิดได้ที่หน้าเริ่มเกม)'); }
  if (!G.state.character) {
    G.openCreator('first');
    G.onFirstStart = () => {
      if (PLANS[G.state.world.plan]?.id?.startsWith('fantasy_')) {
        G.creatorOpen = false; G.state.leadership.path = 'citizen'; saveNow(); resetNpcPlans();
        toast('⚔️ เริ่มชีวิตทาสรับใช้ในอาณาจักร · ทำงานเก็บชื่อเสียงและเข้าเฝ้าพระราชาเพื่อรับแต่งตั้ง');
        return;
      }
      $('#path-choice').classList.remove('hidden'); G.creatorOpen = true; // keep the world paused while choosing
      $('#path-choice [data-path=founder]').onclick = () => {
        $('#path-choice').classList.add('hidden'); G.creatorOpen = false; G.state.leadership.path = 'founder'; saveNow(); resetNpcPlans();
        toast('🪓 ได้รับขวาน 1 เล่ม · ถางป่ารอบบ้านผู้นำ แตะ ✦ ที่ต้นไม้ · คุยกับครูอุ่นเพื่อดูภารกิจ');
      };
    };
  }
  else toast(`ยินดีต้อนรับกลับ ${G.state.character.name}!`);
  for (const n of G.notes) setTimeout(() => toast(n), 1500);
  if (G.memoryOnly) setTimeout(() => toast('⚠ เบราว์เซอร์นี้บันทึกเซฟไม่ได้ (ไฟล์ในเครื่อง/โหมดส่วนตัว) เปิดผ่าน https เพื่อบันทึก', true), 3200);
  window.addEventListener('pagehide', () => { if (!G.noSave) saveNow(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && !G.noSave) saveNow(); });
  requestAnimationFrame(loop);
  if (params.has('test') || params.has('dev')) window.__V2N__ = { G, saveNow, render, hud };
}
boot().catch(err => { console.error(err); toast('เกิดข้อผิดพลาดตอนเปิดเกม: ' + err.message, true); });

// Input: keyboard (PC), virtual joystick + tap/drag/pinch (touch), mouse wheel zoom, HUD buttons.
import { G, interact, nearestInteractable, setWalkDestination, setBuildPreview, confirmBuild, cancelBuild, interactables } from './game.js';
import { screenToWorld, zoomAt, setZoom, clampCamera, zoomLimits, WORLD_PX_W, WORLD_PX_H } from './camera.js';
import { TILE } from '../world.js';
import { BUILDINGS } from '../construction.js';
import { structurePos } from '../npcs.js';
import { unlockAudio, sfx } from '../audio.js';
import { toLocal } from './orientation.js';

const $ = s => document.querySelector(s);
const MOVE_KEYS = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
const PANEL_KEYS = { h: 'home', i: 'inventory', j: 'jobs', b: 'build', m: 'market', k: 'craft', q: 'quests', r: 'civil', l: 'leader', c: 'wardrobe', o: 'settings' };

function cssPoint(ev) { return toLocal(ev.clientX, ev.clientY); } // canvas fills #app at (0,0); handles CSS-rotated landscape
function worldAt(p) { return screenToWorld(G.cam, p.x, p.y, G.cssW, G.cssH); }

export function zoomBy(f, sx = G.cssW / 2, sy = G.cssH / 2) {
  zoomAt(G.cam, f, sx, sy, G.cssW, G.cssH); clampCamera(G.cam, G.cssW, G.cssH);
  if (!G.cam.overview) try { localStorage.setItem('v2n-zoom', String(G.cam.zoomTarget)); } catch { /* */ } // remember the player's zoom
  const lbl = $('#zoom-label'); lbl.hidden = false; lbl.textContent = `🔍 ${Math.round(G.cam.zoom * G.k)}× พิกเซล`;
  clearTimeout(zoomBy.t); zoomBy.t = setTimeout(() => { lbl.hidden = true; }, 1200);
}
/** Buttons/keys move exactly one crisp pixel step (e.g. 2x -> 3x screen pixels per game pixel). */
export function zoomStep(dir, sx, sy) {
  const steps = Math.round(G.cam.zoom * G.k) + dir;
  zoomBy((Math.max(1, steps) / G.k) / G.cam.zoom, sx, sy);
}
export function toggleOverview() {
  const c = G.cam;
  if (!c.overview) { G.overviewPrev = { zoom: c.zoom }; c.overview = true; c.follow = false; setZoom(c, zoomLimits(G.cssW, G.cssH).min, G.cssW, G.cssH); c.x = WORLD_PX_W / 2; c.y = WORLD_PX_H / 2; G.toast('🗺 โหมดดูเมือง: ลากเพื่อเลื่อน · บีบ/ล้อเมาส์เพื่อซูม · กด 🗺 อีกครั้งเพื่อกลับ'); }
  else { c.overview = false; c.follow = true; setZoom(c, G.overviewPrev?.zoom || c.baseZoom, G.cssW, G.cssH); c.x = G.state.player.x; c.y = G.state.player.y; G.toast('🚶 กลับมาที่ตัวละคร'); }
  $('#overview').classList.toggle('on', c.overview);
  clampCamera(c, G.cssW, G.cssH);
}
export async function toggleFullscreen() {
  const el = document.documentElement;
  try {
    if (document.fullscreenElement || document.webkitFullscreenElement) { await (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) { G.toast('อุปกรณ์นี้ไม่รองรับปุ่มเต็มจอ (iPhone: กดแชร์ → "เพิ่มไปยังหน้าจอโฮม" เพื่อเล่นเต็มจอ)', true); return; }
    await req.call(el);
    try { await screen.orientation?.lock?.('landscape'); } catch { /* not allowed on this platform */ }
  } catch { G.toast('เบราว์เซอร์ไม่อนุญาตให้เต็มจอ', true); }
}

function tapAt(p) {
  const w = worldAt(p);
  if (G.build) {
    const b = BUILDINGS[G.build.type];
    setBuildPreview(Math.floor(w.x / TILE - b.width / 2 + .5), Math.floor(w.y / TILE - b.height / 2 + .5));
    return;
  }
  // tap on something interactable?
  let hit = null, best = 22 / Math.max(.6, G.cam.zoom / 2);
  for (const e of interactables()) {
    const hy = e.kind === 'npc' ? e.y - 16 : e.kind === 'wood' ? e.y - 20 : e.y - 8;
    const d = Math.hypot(e.x - w.x, hy - w.y);
    if (d < best + (e.kind === 'site' ? 30 : e.kind === 'placed' ? 16 : 0)) { best = d; hit = e; }
  }
  if (hit) {
    const P = G.state.player;
    if (Math.hypot(hit.x - P.x, hit.y - P.y) <= hit.r) return interact(hit);
    G.pendingInteract = hit.id; setWalkDestination(hit.x, hit.y + 6);
    G.toast(`เดินไปที่ ${hit.name}`);
    return;
  }
  G.pendingInteract = null;
  setWalkDestination(w.x, w.y);
}

export function initInput() {
  G.toggleFullscreen = toggleFullscreen;
  G.resetZoom = () => { setZoom(G.cam, G.cam.baseZoom, G.cssW, G.cssH); G.cam.follow = true; G.cam.overview = false; };
  G.walkTo = (x, y) => setWalkDestination(x, y);
  G.walkToStructure = id => { const t = structurePos(G.state, id); if (t) { setWalkDestination((t[0] + .5) * TILE, (t[1] + .5) * TILE); G.toast('กำลังเดินไปที่ไซต์'); } };
  const unlock = () => unlockAudio();
  window.addEventListener('pointerdown', unlock, { once: false, passive: true });
  window.addEventListener('keydown', unlock, { passive: true });

  window.addEventListener('keydown', e => {
    if (G.creatorOpen || e.target.matches('input,textarea,select')) return;
    const k = e.key.toLowerCase();
    if (G.build) {
      const d = { arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1], arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0] }[k];
      if (d) { e.preventDefault(); setBuildPreview(G.build.tx + d[0], G.build.ty + d[1]); const b = BUILDINGS[G.build.type]; G.cam.x = (G.build.tx + b.width / 2) * TILE; G.cam.y = (G.build.ty + b.height / 2) * TILE; return; }
      if (k === 'enter') { e.preventDefault(); confirmBuild(); return; }
      if (k === 'escape') { cancelBuild(); return; }
    }
    if (MOVE_KEYS.includes(k)) { e.preventDefault(); if (!G.panel) G.keys.add(k); return; }
    if (k === 'escape') { if (G.panel) G.closePanel(); else if (G.preview) G.exitShowcase(); else if (G.cam.overview) toggleOverview(); return; }
    if (k === 'e' || k === ' ') { e.preventDefault(); if (!G.panel) interact(nearestInteractable()); return; }
    if (k === '+' || k === '=') return zoomStep(1);
    if (k === '-' || k === '_') return zoomStep(-1);
    if (k === 'f') return toggleFullscreen();
    if (k === 't') return cycleSpeed();
    if (k === 'g') return G.openPanel('travel');
    if (G.devAction && (k === 'u' || k === 'y' || k === '[' || k === ']')) return G.devAction(k === 'u' ? 'fill' : k === 'y' ? 'plan' : k === ']' ? 'up' : 'down');
    if (k === 'v') return toggleOverview();
    if (k === 'p') return G.preview ? G.exitShowcase() : G.enterShowcase(Math.min(5, (G.state.town?.stage || 0) + 2));
    if (PANEL_KEYS[k]) { if (G.panel === PANEL_KEYS[k]) G.closePanel(); else G.openPanel(PANEL_KEYS[k]); }
  });
  window.addEventListener('keyup', e => G.keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => { G.keys.clear(); G.stick.active = false; });

  // ---- canvas: tap / drag-pan / pinch / wheel / hover preview
  const pts = new Map(); let gesture = null;
  const cv = G.canvas;
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture?.(e.pointerId);
    pts.set(e.pointerId, cssPoint(e));
    if (pts.size === 1) gesture = { kind: 'tap', start: cssPoint(e), cam: { x: G.cam.x, y: G.cam.y }, t: performance.now() };
    else if (pts.size === 2) { const [a, b] = [...pts.values()]; gesture = { kind: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y) }; }
  });
  cv.addEventListener('pointermove', e => {
    if (G.build && e.pointerType === 'mouse' && !pts.size) { const w = worldAt(cssPoint(e)), b = BUILDINGS[G.build.type]; const tx = Math.floor(w.x / TILE - b.width / 2 + .5), ty = Math.floor(w.y / TILE - b.height / 2 + .5); if (tx !== G.build.tx || ty !== G.build.ty) setBuildPreview(tx, ty); return; }
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, cssPoint(e));
    if (gesture?.kind === 'pinch' && pts.size >= 2) {
      const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (gesture.dist > 0) zoomBy(d / gesture.dist, (a.x + b.x) / 2, (a.y + b.y) / 2);
      gesture.dist = d; return;
    }
    if (gesture && (gesture.kind === 'tap' || gesture.kind === 'drag')) {
      const p = cssPoint(e), dx = p.x - gesture.start.x, dy = p.y - gesture.start.y;
      if (gesture.kind === 'tap' && Math.hypot(dx, dy) > 10) gesture.kind = 'drag';
      if (gesture.kind === 'drag') { G.cam.follow = false; G.cam.x = gesture.cam.x - dx / G.cam.zoom; G.cam.y = gesture.cam.y - dy / G.cam.zoom; clampCamera(G.cam, G.cssW, G.cssH); }
    }
  });
  const up = e => {
    if (!pts.has(e.pointerId)) return;
    const p = pts.get(e.pointerId); pts.delete(e.pointerId);
    if (gesture?.kind === 'tap' && pts.size === 0 && e.type === 'pointerup') tapAt(p);
    if (pts.size === 0) gesture = null;
    else if (gesture?.kind === 'pinch') gesture = { kind: 'pinched' };
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  // mouse wheel / trackpad: every notch (or ~60 px of trackpad scroll) = one crisp zoom step, anywhere on the game
  let wheelAcc = 0;
  window.addEventListener('wheel', e => {
    if (e.target.closest?.('.panel,.creator,.path-choice,.start-screen')) return; // let menus scroll
    e.preventDefault();
    wheelAcc += e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
    if (Math.abs(wheelAcc) < (e.ctrlKey ? 12 : 50)) return; // ctrlKey = trackpad pinch on PC
    const p = cssPoint(e); zoomStep(wheelAcc < 0 ? 1 : -1, p.x, p.y); wheelAcc = 0;
  }, { passive: false });
  // iOS Safari: stop the browser's own page zoom and use its pinch scale for the game
  let gScale = 1;
  document.addEventListener('gesturestart', e => { e.preventDefault(); gScale = 1; }, { passive: false });
  document.addEventListener('gesturechange', e => { e.preventDefault(); if (pts.size >= 2) return; const f = e.scale / gScale; gScale = e.scale; zoomBy(f); }, { passive: false });
  document.addEventListener('gestureend', e => e.preventDefault(), { passive: false });
  // touch fallback for pinch (some webviews never send a 2nd pointer)
  let tDist = 0;
  window.addEventListener('touchstart', e => { if (e.touches.length === 2) { tDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); } }, { passive: true });
  window.addEventListener('touchmove', e => {
    if (e.touches.length !== 2 || e.target.closest?.('.panel,.creator')) return;
    e.preventDefault();
    if (pts.size >= 2) return; // pointer events already handle it
    const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    if (tDist > 0) { const m = toLocal((e.touches[0].clientX + e.touches[1].clientX) / 2, (e.touches[0].clientY + e.touches[1].clientY) / 2); zoomBy(d / tDist, m.x, m.y); }
    tDist = d;
  }, { passive: false });
  cv.addEventListener('contextmenu', e => e.preventDefault());

  // ---- joystick
  const stick = $('#stick'), knob = $('#stick-knob'); let sid = null;
  const setStick = e => {
    const r = stick.getBoundingClientRect(), c = toLocal(r.left + r.width / 2, r.top + r.height / 2), p = toLocal(e.clientX, e.clientY), R = stick.offsetWidth / 2;
    let dx = (p.x - c.x) / R, dy = (p.y - c.y) / R; const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
    G.stick.x = dx; G.stick.y = dy; knob.style.transform = `translate(${dx * R * .55}px,${dy * R * .55}px)`;
  };
  stick.addEventListener('pointerdown', e => { e.preventDefault(); sid = e.pointerId; stick.setPointerCapture(sid); G.stick.active = true; setStick(e); });
  stick.addEventListener('pointermove', e => { if (e.pointerId === sid) setStick(e); });
  const end = e => { if (e.pointerId !== sid) return; sid = null; G.stick.active = false; G.stick.x = G.stick.y = 0; knob.style.transform = ''; };
  stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end); stick.addEventListener('lostpointercapture', end);

  // ---- buttons
  $('#action-btn').addEventListener('click', () => interact(nearestInteractable()));
  $('#zoom-in').addEventListener('click', () => zoomStep(1));
  $('#zoom-out').addEventListener('click', () => zoomStep(-1));
  $('#overview').addEventListener('click', toggleOverview); G.toggleOverview = toggleOverview;
  $('#fullscreen').addEventListener('click', toggleFullscreen);
  $('#speed-btn').addEventListener('click', cycleSpeed);
  $('#hud-avatar').addEventListener('click', () => G.openCreator('edit'));
  $('#bb-confirm').addEventListener('click', confirmBuild);
  $('#bb-cancel').addEventListener('click', () => cancelBuild());
  $('#rotate-dismiss').addEventListener('click', () => { G.rotateDismissed = true; $('#rotate-hint').classList.add('hidden'); });
  document.addEventListener('fullscreenchange', () => $('#fullscreen').classList.toggle('on', !!document.fullscreenElement));
  void sfx;
}

// v0.19 time speed (⏩ button / T): 1x -> 2x -> 5x -> 20x. Speeds up the whole world (NPCs, building, sun) — no shortcut
// to anything that is not already earned by waiting.
export const SPEEDS = [1, 2, 5, 20];
export function cycleSpeed() {
  const s = G.state, i = SPEEDS.indexOf(s.tickMultiplier);
  s.tickMultiplier = SPEEDS[(i + 1) % SPEEDS.length];
  G.toast(s.tickMultiplier === 1 ? '▶️ เวลาปกติ 1x' : `⏩ เร่งเวลา ${s.tickMultiplier}x`); G.hud?.();
}

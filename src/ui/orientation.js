// Landscape handling for phones.
//  • "เล่นเกม (เต็มจอ แนวนอน)" asks for fullscreen + screen.orientation.lock('landscape') (Android Chrome/Edge).
//  • Where the lock is not available (iPhone Safari, some webviews) and the phone is held upright, the whole
//    #app is rotated 90° with CSS ("forced landscape") so the game is always played sideways.
// Everything that reads pointer coordinates goes through toLocal(), and layout uses the EFFECTIVE size
// (viewSize) instead of the window size, so taps, the joystick and the HUD stay correct while rotated.
import { G } from './game.js';

const app = () => document.getElementById('app');
const coarse = () => matchMedia('(pointer:coarse)').matches;
let forced = false;

/** True while the CSS rotation is active. */
export function isForced() { return forced; }

/** Re-evaluate rotation and layout classes. Returns the effective {w, h} of the game area in CSS px. */
export function applyOrientation() {
  const W = window.innerWidth, H = window.innerHeight, el = app();
  forced = !!G.forceLand && H > W && coarse();
  document.body.classList.toggle('force-land', forced);
  if (forced) Object.assign(el.style, { width: H + 'px', height: W + 'px', transform: `translateX(${W}px) rotate(90deg)` });
  else Object.assign(el.style, { width: '', height: '', transform: '' });
  const w = forced ? H : W, h = forced ? W : H;
  el.style.setProperty('--vw', w / 100 + 'px');
  el.style.setProperty('--vh', h / 100 + 'px');
  el.classList.toggle('compact', h <= 430);
  el.classList.toggle('tiny', h <= 360); // phones in landscape (e.g. 360x800 css): smaller HUD so more of the village shows
  el.classList.toggle('portrait', h > w);
  return { w, h };
}

/** Client (viewport) coordinates -> game-area coordinates. */
export function toLocal(clientX, clientY) {
  if (forced) return { x: clientY, y: window.innerWidth - clientX };
  return { x: clientX, y: clientY };
}

/** Start in fullscreen landscape. Must be called from a user gesture (button click). */
export async function playFullscreenLandscape() {
  G.forceLand = true;
  const el = document.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen;
  let full = false, locked = false;
  try { if (req && !document.fullscreenElement) { await req.call(el, { navigationUI: 'hide' }); full = true; } } catch { /* not allowed (iPhone) */ }
  try { await screen.orientation?.lock?.('landscape'); locked = true; } catch { /* no lock: CSS rotation takes over */ }
  return { full, locked };
}

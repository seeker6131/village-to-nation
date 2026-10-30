// Day/night lighting: sky colour keyframes (dawn pink -> day -> golden hour -> sunset -> blue night) and a
// low-resolution light map at night: darkness with soft holes cut by lamps, the campfire, lit windows and the
// player's lantern, plus a warm additive glow. Medium/High only for the light map; Low gets the plain tint.
import { hash } from '../world.js';

// [hour, darkness alpha, darkness rgb, warm tint alpha, warm rgb]
const KEYS = [
  [0, .8, [8, 12, 46], 0, [0, 0, 0]],
  [4.6, .78, [10, 14, 52], 0, [0, 0, 0]],
  [5.4, .42, [58, 34, 96], .08, [255, 120, 160]],
  [6.2, .18, [80, 50, 110], .16, [255, 150, 110]],
  [7.2, .02, [80, 60, 110], .1, [255, 190, 130]],
  [8.5, 0, [0, 0, 0], 0, [255, 200, 140]],
  [16.2, 0, [0, 0, 0], 0, [255, 170, 80]],
  [17.4, .04, [80, 40, 40], .14, [255, 160, 60]],
  [18.3, .16, [90, 40, 70], .2, [255, 110, 60]],
  [19.2, .46, [40, 28, 92], .1, [220, 90, 120]],
  [20.3, .72, [12, 16, 58], 0, [0, 0, 0]],
  [24, .8, [8, 12, 46], 0, [0, 0, 0]],
];
const mix = (a, b, t) => a + (b - a) * t;
export function skyAt(hour) {
  let i = 0; while (i < KEYS.length - 2 && hour >= KEYS[i + 1][0]) i++;
  const A = KEYS[i], B = KEYS[i + 1], t = Math.max(0, Math.min(1, (hour - A[0]) / (B[0] - A[0])));
  return { dark: mix(A[1], B[1], t), dc: A[2].map((v, j) => mix(v, B[2][j], t)), warm: mix(A[3], B[3], t), wc: A[4].map((v, j) => mix(v, B[4][j], t)) };
}
/** Window light schedule: on in the evening and before dawn, each house a little different. */
export function windowLit(hour, seed) { const off = 21.6 + hash(seed, 7, 5) * 1.8, on = 17.6 + hash(seed, 3, 9) * .8; return hour >= on && hour < off || hour >= 4.8 + hash(seed, 1, 2) && hour < 6.3; }

let lm = null;
/**
 * ctx: main canvas context (identity transform). lights: [{x, y (screen px), r (screen px), a (0..1), warm:bool}].
 */
export function drawLighting(ctx, W, H, hour, lights, quality) {
  const sky = skyAt(hour);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (sky.warm > 0.005) { ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = `rgba(${sky.wc.map(Math.round).join(',')},${sky.warm.toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
  if (sky.dark < 0.01) return sky;
  if (!quality) { ctx.fillStyle = `rgba(${sky.dc.map(Math.round).join(',')},${sky.dark.toFixed(3)})`; ctx.fillRect(0, 0, W, H); return sky; }
  const S = 4, w = Math.ceil(W / S), h = Math.ceil(H / S);
  if (!lm || lm.width !== w || lm.height !== h) { lm = document.createElement('canvas'); lm.width = w; lm.height = h; }
  const g = lm.getContext('2d');
  g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, w, h);
  g.fillStyle = `rgba(${sky.dc.map(Math.round).join(',')},${sky.dark.toFixed(3)})`; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'destination-out';
  for (const L of lights) {
    const x = L.x / S, y = L.y / S, r = L.r / S; if (x < -r || y < -r || x > w + r || y > h + r) continue;
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(0,0,0,${L.a * .92})`); gr.addColorStop(.4, `rgba(0,0,0,${L.a * .5})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.save(); ctx.imageSmoothingEnabled = true; ctx.drawImage(lm, 0, 0, w * S, h * S); ctx.restore();
  // warm additive glow around fires/lamps/windows
  ctx.globalCompositeOperation = 'lighter';
  const k = Math.min(1, sky.dark / .5);
  for (const L of lights) {
    if (!L.warm) continue; const r = L.r * .7; if (L.x < -r || L.y < -r || L.x > W + r || L.y > H + r) continue;
    ctx.globalAlpha = Math.min(1, .38 * L.a * k); ctx.drawImage(glowSprite(), L.x - r, L.y - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  return sky;
}
let glow = null;
function glowSprite() { // pre-rendered warm radial glow, stretched per light (no per-frame gradients at full resolution)
  if (glow) return glow;
  glow = document.createElement('canvas'); glow.width = glow.height = 64; const g = glow.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,170,80,1)'); r.addColorStop(1, 'rgba(255,150,60,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return glow;
}

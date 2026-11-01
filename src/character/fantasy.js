// Fantasy paper-doll renderer. No imports from UI or the old rig (prevents import cycles).
// Source art is kept intact. GPT art is sampled at 1/4 size with nearest-neighbour.
import { HAIR_COLORS, SKIN_TONES } from './model.js';

export const FANTASY_DIRS = ['down', 'left', 'right', 'up'];
export const FANTASY_COLS = 9;
export const FANTASY_FRAME = 80;
export const FANTASY_BASELINE = 76;
const SOURCE_DIR = { down: 0, up: 1, left: 2, right: 3 }; // GPT sheets: front/back/left/right
const FILES = {
  body: ['char_base_walk', 9, 4],
  hair_short: ['hair_short', 9, 4],
  hair_ponytail: ['hair_ponytail', 9, 4],
  hair_wavy: ['hair_wavy', 9, 4],
  outfit_poor: ['outfit_poor', 9, 4],
  outfit_noble: ['outfit_noble', 9, 4],
  outfit_smith: ['outfit_smith', 9, 4],
  outfit_soldier: ['outfit_soldier', 9, 4],
  outfit_merchant: ['outfit_merchant', 9, 4],
  beards: ['beards', 9, 12], // 3 beard styles × (4 directions × 9 walk frames)
  hats: ['hats', 9, 12],    // 3 hat styles × (4 directions × 9 walk frames)
};
const HAIR = { messy: 'hair_wavy', pony: 'hair_ponytail', swept: 'hair_wavy', short: 'hair_short', bald: null };
const OUTFIT = {
  cream: 'outfit_poor', blue: 'outfit_poor', green: 'outfit_poor', red: 'outfit_poor',
  farmer: 'outfit_poor', builder: 'outfit_smith', trader: 'outfit_merchant',
  civil: 'outfit_noble', leader: 'outfit_noble', police: 'outfit_soldier',
  thief: 'outfit_poor', festival: 'outfit_noble', sailor: 'outfit_merchant', night: 'outfit_noble',
};

// Pure helpers: used by the browser renderer and independently testable under Node.
export function sourceCell(dir, col, kind = 'walk', variant = 0) {
  const d = SOURCE_DIR[dir] ?? 0;
  if (kind === 'beards' || kind === 'hats') return [Math.max(0, Math.min(8, col | 0)), variant * 4 + d];
  return [Math.max(0, Math.min(8, col | 0)), d];
}
export function frameBounds(frame) {
  const { width: w, height: h, data } = frame;
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] > 127) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  return x1 < 0 ? null : { x0, x1, y0, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}
export function magentaToAlpha(data) {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    // Also catches slightly off-magenta interpolation around generated sprite edges.
    if (r >= 175 && b >= 150 && g <= 115 && r >= g * 1.65 && b >= g * 1.5) data[i + 3] = 0;
    else data[i + 3] = data[i + 3] < 128 ? 0 : 255;
  }
  return data;
}
export function layerOffset(body, layer, kind) {
  const b = body?.bounds || frameBounds(body), l = layer?.bounds || frameBounds(layer);
  if (!b || !l) return null;
  // The body frame is already placed at (40,76). Head is the upper part of its silhouette.
  const ox = Math.round(FANTASY_FRAME / 2 - b.cx);
  const oy = FANTASY_BASELINE - b.y1;
  if (kind === 'body') return { x: ox, y: oy };
  // All overlays are independently centered, rather than assuming the AI output aligns.
  const x = Math.round(FANTASY_FRAME / 2 - l.cx);
  if (kind === 'outfit') return { x, y: oy + b.y1 - l.y1 };
  if (kind === 'hair') return { x, y: oy + b.y0 - l.y0 - 1 };
  if (kind === 'beard') return { x, y: oy + b.y0 + Math.round((b.y1 - b.y0) * 0.30) - l.y0 };
  if (kind === 'hat') return { x, y: oy + b.y0 + Math.round((b.y1 - b.y0) * .22) - l.y1 };
  return { x, y: oy };
}
function imageFrame(img, columns, rows, c, r) {
  const sx = Math.round(c * img.width / columns), sy = Math.round(r * img.height / rows);
  const sw = Math.round((c + 1) * img.width / columns) - sx;
  const sh = Math.round((r + 1) * img.height / rows) - sy;
  const width = Math.max(1, Math.floor(sw / 4)), height = Math.max(1, Math.floor(sh / 4));
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const g = canvas.getContext('2d', { willReadFrequently: true }); g.imageSmoothingEnabled = false;
  g.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
  const data = g.getImageData(0, 0, width, height).data;
  magentaToAlpha(data);
  const frame = { width, height, data }; frame.bounds = frameBounds(frame);
  return frame;
}
function repaintHair(frame, rgb) {
  if (!rgb) rgb = [110, 80, 63]; // neutral brown when old-model hairColor is 'brown'
  const out = { ...frame, data: new Uint8ClampedArray(frame.data) };
  for (let i = 0; i < out.data.length; i += 4) {
    if (!out.data[i + 3]) continue;
    const v = out.data[i] * .299 + out.data[i + 1] * .587 + out.data[i + 2] * .114;
    const scale = Math.max(.20, Math.min(1.48, v / 145));
    for (let k = 0; k < 3; k++) out.data[i + k] = Math.min(255, Math.round(rgb[k] * scale));
  }
  return out;
}
function repaintSkin(frame, rgb) {
  if (!rgb) return frame;
  const out = { ...frame, data: new Uint8ClampedArray(frame.data) };
  for (let i = 0; i < out.data.length; i += 4) {
    if (!out.data[i + 3]) continue;
    const r = out.data[i], g = out.data[i + 1], b = out.data[i + 2];
    // Skin detection only on the naked body layer; do not touch garments or the eyes.
    if (r > 115 && r > g * 1.07 && g >= b * .95 && g > 65 && b < 180 && r - b > 30) {
      const shade = Math.max(.48, Math.min(1.2, (r + g + b) / 525));
      for (let k = 0; k < 3; k++) out.data[i + k] = Math.min(255, Math.round(rgb[k] * shade));
    }
  }
  return out;
}
export function blitFrame(dest, layer, offset, dstW = FANTASY_FRAME, dstH = FANTASY_FRAME) {
  if (!layer || !offset) return;
  for (let sy = 0; sy < layer.height; sy++) {
    const y = sy + offset.y; if (y < 0 || y >= dstH) continue;
    for (let sx = 0; sx < layer.width; sx++) {
      const x = sx + offset.x; if (x < 0 || x >= dstW) continue;
      const si = (sy * layer.width + sx) * 4, di = (y * dstW + x) * 4;
      if (layer.data[si + 3] < 128) continue;
      dest[di] = layer.data[si]; dest[di + 1] = layer.data[si + 1];
      dest[di + 2] = layer.data[si + 2]; dest[di + 3] = 255;
    }
  }
}

const resources = new Map(), atlases = new Map();
let started = false, failed = false, finished = 0;
function assetFinished() {
  finished++;
  if (finished === Object.keys(FILES).length) document.dispatchEvent(new Event('v2n-fantasy-ready'));
}
function startLoad() {
  if (started || typeof Image === 'undefined' || typeof document === 'undefined') return;
  started = true;
  for (const [key, [name, cols, rows]] of Object.entries(FILES)) {
    const img = new Image();
    img.onload = () => {
      const frames = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) frames.push(imageFrame(img, cols, rows, c, r));
      resources.set(key, { frames, cols, rows }); atlases.clear(); assetFinished();
    };
    img.onerror = () => { failed = true; console.warn('Fantasy asset unavailable:', name); assetFinished(); };
    img.src = (typeof window !== 'undefined' && window.__V2N_FANTASY_MAP__?.[name]) || `source_art/fantasy/${name}.png`;
  }
}
const frameAt = (key, dir, col, variant = 0) => {
  const src = resources.get(key); if (!src) return null;
  const [c, r] = sourceCell(dir, col, key === 'beards' ? 'beards' : key === 'hats' ? 'hats' : 'walk', variant);
  return src.frames[r * src.cols + c] || null;
};
export function fantasyAssetState() {
  return { loaded: resources.size, expected: Object.keys(FILES).length, failed };
}

export function composeFantasyAtlas(a) {
  if (!resources.has('body')) return null;
  const canvas = document.createElement('canvas');
  canvas.width = FANTASY_FRAME * FANTASY_COLS;
  canvas.height = FANTASY_FRAME * FANTASY_DIRS.length;
  const g = canvas.getContext('2d'); g.imageSmoothingEnabled = false;
  const atlas = g.createImageData(canvas.width, canvas.height);
  const rgb = HAIR_COLORS[a?.hairColor]?.rgb;
  const skin = SKIN_TONES[a?.skin]?.rgb;
  const hairstyle = HAIR[a?.hair] ?? (a?.hair === 'bald' ? null : 'hair_short');
  const garment = OUTFIT[a?.outfit] || 'outfit_poor';
  const beard = /^(1|2|3)$/.test(String(a?.beard)) ? Number(a.beard) - 1 : -1;
  const hat = /^(1|2|3)$/.test(String(a?.hat)) ? Number(a.hat) - 1 : -1;
  for (let row = 0; row < FANTASY_DIRS.length; row++) for (let col = 0; col < FANTASY_COLS; col++) {
    const dir = FANTASY_DIRS[row], body = frameAt('body', dir, col);
    if (!body) continue;
    const dst = new Uint8ClampedArray(FANTASY_FRAME * FANTASY_FRAME * 4);
    blitFrame(dst, repaintSkin(body, skin), layerOffset(body, body, 'body'));
    const outfit = frameAt(garment, dir, col);
    if (outfit) blitFrame(dst, outfit, layerOffset(body, outfit, 'outfit'));
    const hair = hairstyle && frameAt(hairstyle, dir, col);
    if (hair) blitFrame(dst, repaintHair(hair, rgb), layerOffset(body, hair, 'hair'));
    const beardFrame = beard >= 0 && frameAt('beards', dir, col, beard);
    if (beardFrame) blitFrame(dst, repaintHair(beardFrame, rgb), layerOffset(body, beardFrame, 'beard'));
    const hatFrame = hat >= 0 && frameAt('hats', dir, col, hat);
    if (hatFrame) blitFrame(dst, hatFrame, layerOffset(body, hatFrame, 'hat'));
    for (let y = 0; y < FANTASY_FRAME; y++) {
      const index = ((row * FANTASY_FRAME + y) * atlas.width + col * FANTASY_FRAME) * 4;
      atlas.data.set(dst.subarray(y * FANTASY_FRAME * 4, (y + 1) * FANTASY_FRAME * 4), index);
    }
  }
  g.putImageData(atlas, 0, 0);
  return canvas;
}

/** Returns null while the source images are still loading (the old rig is a safe fallback). */
export function fantasyAtlasReady(a) {
  if (typeof document === 'undefined') return null;
  startLoad();
  if (!resources.has('body')) return null;
  const key = JSON.stringify([a?.hair, a?.hairColor, a?.skin, a?.outfit, a?.beard, a?.hat, resources.size]);
  if (atlases.has(key)) return atlases.get(key);
  const atlas = composeFantasyAtlas(a);
  if (atlas) {
    if (atlases.size >= 48) atlases.delete(atlases.keys().next().value);
    atlases.set(key, atlas);
  }
  return atlas;
}
export function fantasyFrameRect(dir, col) {
  return { x: Math.max(0, Math.min(FANTASY_COLS - 1, col | 0)) * FANTASY_FRAME,
    y: Math.max(0, FANTASY_DIRS.indexOf(dir)) * FANTASY_FRAME, w: FANTASY_FRAME, h: FANTASY_FRAME };
}

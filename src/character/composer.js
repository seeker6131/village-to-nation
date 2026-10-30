// Modular character composer. Pure pixel maths (works in Node tests and the browser).
// Layer order: hair back -> body (skin/eyes/brows) -> clothes (top/bottom/shoes, painted on body regions) -> hair front.
import { CHARACTER_ATLAS } from './atlasData.js';
import { HAIR_COLORS, SKIN_TONES, EYE_COLORS, OUTFITS, normalizeAppearance } from './model.js';

export const MAT = { NONE: 0, FIXED: 1, SKIN: 2, EYE: 3, BROW: 4, HAIR: 5, UNDER: 6, OUTLINE: 7, TIE: 8 };
export const PART = { NONE: 0, HEAD: 1, TORSO: 2, ARM: 3, LEG: 4, FOOT: 5, UNDER: 6 };

const decoded = new Map();
function b64ToBytes(b64) {
  if (typeof atob === 'function') { const s = atob(b64); const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }
  return Uint8Array.from(Buffer.from(b64, 'base64'));
}
export function decodeRle(b64, length) {
  const bytes = b64ToBytes(b64), out = new Uint8Array(length);
  let p = 0;
  for (let i = 0; i < bytes.length; i += 2) { out.fill(bytes[i + 1], p, p + bytes[i]); p += bytes[i]; }
  if (p !== length) throw new Error(`RLE length mismatch ${p} != ${length}`);
  return out;
}
function layer(name) {
  if (decoded.has(name)) return decoded.get(name);
  const L = CHARACTER_ATLAS.layers[name];
  if (!L) return null;
  const n = CHARACTER_ATLAS.size * CHARACTER_ATLAS.size;
  const v = { palette: L.palette, idx: decodeRle(L.data, n), parts: L.parts ? decodeRle(L.parts, n) : null };
  decoded.set(name, v);
  return v;
}

const clamp = v => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
/** Apply a palette entry's relative shade to a new base colour. shade = entry luminance / material base luminance. */
export function shadeColor(base, shade100) {
  const s = shade100 / 100;
  if (s <= 1) return [clamp(base[0] * s), clamp(base[1] * s), clamp(base[2] * s)];
  // compress highlights so light hair/skin tones do not blow out to white
  const k = Math.min(0.85, (Math.pow(s, 0.6) - 1) * 0.6);
  return base.map(c => clamp(c + (255 - c) * k));
}

/**
 * Compose a full 256x256 RGBA atlas (4x4 frames, rows down/left/right/up) for an appearance.
 * @returns {Uint8ClampedArray}
 */
export function composeAtlas(appearanceInput, opts = {}) {
  const a = normalizeAppearance(appearanceInput, opts.unlockedOutfits || Object.keys(OUTFITS));
  const size = CHARACTER_ATLAS.size, n = size * size;
  const out = new Uint8ClampedArray(n * 4);
  const skin = SKIN_TONES[a.skin].rgb;
  const hairRgb = HAIR_COLORS[a.hairColor].rgb;
  const eyeRgb = EYE_COLORS[a.eyes].rgb;
  const outfit = opts.noClothes ? null : OUTFITS[a.outfit];
  const put = (i, rgb) => { out[i * 4] = rgb[0]; out[i * 4 + 1] = rgb[1]; out[i * 4 + 2] = rgb[2]; out[i * 4 + 3] = 255; };

  const paintHair = (L) => {
    if (!L) return;
    for (let i = 0; i < n; i++) {
      const pi = L.idx[i]; if (!pi) continue;
      const [r, g, b, m, sh] = L.palette[pi];
      if (m === MAT.HAIR && hairRgb) put(i, shadeColor(hairRgb, sh));
      else if (m === MAT.SKIN) put(i, shadeColor(skin, sh));
      else put(i, [r, g, b]);
    }
  };
  paintHair(layer(`hair_${a.hair}_back`));

  const body = layer('body');
  const covered = new Uint8Array(n); // 1 top, 2 bottom, 3 shoes
  for (let i = 0; i < n; i++) {
    const pi = body.idx[i]; if (!pi) continue;
    const [r, g, b, m, sh] = body.palette[pi];
    const pv = body.parts[i], part = pv >> 3, frac = pv & 7;
    if (outfit && (m === MAT.SKIN || m === MAT.UNDER)) {
      let target = 0;
      if (part === PART.TORSO || (part === PART.ARM && frac <= outfit.sleeve)) target = 1;
      else if (part === PART.UNDER || (part === PART.LEG && frac <= outfit.pants)) target = 2;
      else if (part === PART.FOOT) target = 3;
      if (target) {
        covered[i] = target;
        const base = target === 1 ? outfit.top : target === 2 ? outfit.bottom : outfit.shoes;
        // underwear pixels are near-white: map their shading around 1.0 so trousers keep folds
        const s = m === MAT.UNDER ? Math.max(70, Math.min(115, sh)) : sh;
        put(i, shadeColor(base, s));
        continue;
      }
    }
    if (m === MAT.SKIN) put(i, shadeColor(skin, sh));
    else if (m === MAT.EYE && eyeRgb) put(i, shadeColor(eyeRgb, sh));
    else if (m === MAT.BROW && hairRgb) put(i, shadeColor(hairRgb.map(c => c * 0.8), sh));
    else put(i, [r, g, b]);
  }
  if (outfit) {
    // hems: darken clothing pixels that sit directly above uncovered skin (sleeve ends, trouser ends)
    for (let i = size; i < n - size; i++) {
      if (!covered[i]) continue;
      const below = i + size, above = i - size;
      const bpi = body.idx[below];
      if (bpi && !covered[below] && body.palette[bpi][3] === MAT.SKIN && (body.parts[below] >> 3) !== PART.HEAD) {
        out[i * 4] = clamp(out[i * 4] * 0.72); out[i * 4 + 1] = clamp(out[i * 4 + 1] * 0.72); out[i * 4 + 2] = clamp(out[i * 4 + 2] * 0.72);
      }
      if (outfit.collar && covered[i] === 1 && body.idx[above] && (body.parts[above] >> 3) === PART.HEAD) put(i, outfit.collar);
    }
  }
  paintHair(layer(`hair_${a.hair}_front`));
  return out;
}

/** One v0.8 hair layer ('back'|'front') alone, recoloured, as a full 256x256 RGBA atlas (used by the rig). */
export function hairLayerRGBA(appearanceInput, which) {
  const a = appearanceInput, L = layer(`hair_${a.hair}_${which}`);
  if (!L) return null;
  const n = CHARACTER_ATLAS.size * CHARACTER_ATLAS.size, out = new Uint8ClampedArray(n * 4);
  const hairRgb = HAIR_COLORS[a.hairColor]?.rgb, skin = SKIN_TONES[a.skin]?.rgb || [235, 180, 135];
  for (let i = 0; i < n; i++) {
    const pi = L.idx[i]; if (!pi) continue;
    const [r, g, b, m, sh] = L.palette[pi];
    if (m !== MAT.HAIR && m !== MAT.OUTLINE && !(m === MAT.TIE && a.hair === 'pony')) continue; // the rig draws its own head (drop baked skin/eyes/ears)
    const c = m === MAT.HAIR && hairRgb ? shadeColor(hairRgb, sh) : [r, g, b];
    out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; out[i * 4 + 3] = 255;
  }
  void skin; return out;
}

export function frameRect(dir, col) {
  const F = CHARACTER_ATLAS.frame;
  const row = Math.max(0, CHARACTER_ATLAS.dirs.indexOf(dir));
  return { x: col * F, y: row * F, w: F, h: F };
}

/** Animation frame for a walking or idle character. `t` in seconds. */
export function animationColumn(dir, walking, t, fps = 8) {
  if (!walking) return CHARACTER_ATLAS.idleCol[dir] ?? 0;
  const cyc = CHARACTER_ATLAS.walkCycle;
  return cyc[Math.floor(t * fps) % cyc.length];
}

// ---- browser cache: appearance key -> canvas
const cache = new Map();
export function atlasCanvas(appearance, opts = {}) {
  if (typeof document === 'undefined') return null;
  const key = JSON.stringify([appearance, !!opts.noClothes]);
  if (cache.has(key)) return cache.get(key);
  const size = CHARACTER_ATLAS.size;
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const g = c.getContext('2d');
  g.putImageData(new ImageData(composeAtlas(appearance, opts), size, size), 0, 0);
  if (cache.size > 40) cache.delete(cache.keys().next().value);
  cache.set(key, c);
  return c;
}

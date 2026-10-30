// Ground layer renderer: 16-bit pixel tiles baked into 32x32-tile chunk canvases (1 world px = 1 px).
// v0.10: base terrain uses the seamless textures cut from the art pack (assets/v10/tx_*, 64x64 = 4x4 tiles,
// variant chosen per 4x4 block). Transitions between terrains stay procedural (pixel-stepped), coloured from
// the textures so they match. Roads near the village follow the era (dirt -> gravel -> cobble -> slab -> asphalt).
// Chunks are drawn with an integer zoom (see camera.snapZoom) so they stay crisp at every zoom level.
import { TILE, WORLD_W, WORLD_H, WORLD, T, hash, groundAt, zoneAt, CENTER } from '../world.js';
import { decorSprites, roadTexture } from '../artMap.js';
import { TILESETS } from '../tileManifest.js';

let TEX = null; // name -> HTMLImageElement (set once art has loaded)
const TEX_SETS = {
  [T.GRASS]: ['tx_grass_0', 'tx_grass_0', 'tx_grass_1', 'tx_grass_0', 'tx_grass_2'], [T.MEADOW]: ['tx_meadow_0', 'tx_meadow_1', 'tx_meadow_2'],
  [T.FOREST]: ['tx_forestfloor_0', 'tx_forestfloor_1', 'tx_forestfloor_0', 'tx_forestfloor_1', 'tx_forestfloor_0'], [T.DIRT]: ['tx_dirt_0', 'tx_dirt_1'], [T.SAND]: ['tx_sand_0', 'tx_sand_1'],
  [T.ROCKY]: ['tx_rocky_0', 'tx_rocky_1'], [T.WATER]: ['tx_water_0', 'tx_water_1', 'tx_water_0', 'tx_water_2'], [T.FORD]: ['tx_ford_0'],
};
export const TEXTURE_NAMES = [...new Set(Object.values(TEX_SETS).flat())];
/** Provide loaded textures; also derives the edge palette from their average colours. */
export function setTextures(images) {
  const ok = n => images[n]?.complete && images[n].naturalWidth > 0;
  if (!Object.values(TEX_SETS).flat().every(ok)) return false;
  TEX = images;
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d', { willReadFrequently: true });
  const hex = v => '#' + v.map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
  for (const [t, names] of Object.entries(TEX_SETS)) {
    g.clearRect(0, 0, 128, 128); g.drawImage(images[names[0]], 0, 0);
    const d = g.getImageData(0, 0, 128, 128).data; const m = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) { m[0] += d[i]; m[1] += d[i + 1]; m[2] += d[i + 2]; }
    const avg = m.map(v => v / 16384);
    PAL[t] = [hex(avg), hex(avg.map(v => v * .9)), hex(avg.map(v => v * 1.08)), hex(avg.map(v => v * .78))];
  }
  cacheKey = '';
  return true;
}

const CH = 32; // tiles per chunk side
const GS = 2;  // chunk canvas px per world px (textures are stored at 2x, so the ground is as sharp as the sprites)
const cache = new Map();
let cacheKey = '';
const PAL = {
  [T.GRASS]: ['#76b84a', '#6cae43', '#82c454', '#5f9e3c'],
  [T.MEADOW]: ['#86c656', '#7cbd4f', '#93cf60', '#6aab45'],
  [T.FOREST]: ['#4f8f3a', '#478533', '#58993f', '#3d742c'],
  [T.DIRT]: ['#c99a62', '#bf8f58', '#d4a670', '#a97a47'],
  [T.SAND]: ['#e6cf92', '#dcc386', '#efd9a0', '#c9b072'],
  [T.ROCKY]: ['#8f9a7e', '#848f73', '#9aa588', '#717b62'],
  [T.WATER]: ['#3f8fc9', '#3786c0', '#4a9bd3', '#2f74aa'],
  [T.FORD]: ['#8fc3d8', '#86bad0', '#9ccde0', '#76a9bf'],
};
// era styles for village trails: stage 0-1 dirt, 2 cobble, 3+ paved
const ROAD = { cobble: ['#b9ad9a', '#a89c88', '#cbbfab', '#8d826f'], paved: ['#8d8f95', '#83858b', '#9a9ca2', '#6f7177'] };

// higher priority terrain spills over the edge of lower priority terrain (grass over a road, never the reverse)
const PRIO = { [T.WATER]: 0, [T.FORD]: 1, [T.SAND]: 2, [T.DIRT]: 3, [T.ROCKY]: 4, [T.GRASS]: 5, [T.MEADOW]: 6, [T.FOREST]: 7 };
function texFor(tx, ty, stage) {
  if (!TEX) return null;
  const t = groundAt(tx, ty);
  if (t === T.DIRT && Math.hypot(tx - CENTER.x, ty - CENTER.y) < 30) return roadTexture(stage);
  const set = TEX_SETS[t]; if (!set) return null;
  return set[Math.floor(hash(tx >> 2, ty >> 2, WORLD.seed + 61) * set.length)];
}
function px(g, x, y, c) { g.fillStyle = c; g.fillRect(x, y, 1, 1); }
function tile(g, tx, ty, ox, oy, stage) {
  const t = WORLD.ground[ty * WORLD_W + tx], seed = WORLD.seed;
  let pal = PAL[t] || PAL[T.GRASS];
  const nearVillage = Math.hypot(tx - CENTER.x, ty - CENTER.y) < 30;
  if (t === T.DIRT && nearVillage && stage >= 3) pal = ROAD.paved; else if (t === T.DIRT && nearVillage && stage >= 2) pal = ROAD.cobble;
  const texName = texFor(tx, ty, stage);
  if (texName && TEX[texName]?.naturalWidth) {
    { const S = TEX[texName].naturalWidth; g.drawImage(TEX[texName], (tx * TILE * GS) % S, (ty * TILE * GS) % S, TILE * GS, TILE * GS, ox, oy, TILE, TILE); }
  } else {
  g.fillStyle = pal[0]; g.fillRect(ox, oy, TILE, TILE);
  // dithered pixel texture (deterministic)
  for (let i = 0; i < 22; i++) {
    const h = hash(tx * 31 + i, ty * 17 - i, seed);
    px(g, ox + Math.floor(h * 16), oy + Math.floor(hash(i, tx + ty * 7, seed) * 16), pal[1 + (i % 3)]);
  }
  if (pal === ROAD.cobble || pal === ROAD.paved) { // stones / slabs
    g.fillStyle = pal[3];
    if (pal === ROAD.cobble) for (let k = 0; k < 4; k++) { g.fillRect(ox + (k % 2) * 8, oy + Math.floor(k / 2) * 8 + 7, 8, 1); g.fillRect(ox + (k % 2) * 8 + 7, oy + Math.floor(k / 2) * 8, 1, 8); }
    else { g.fillRect(ox, oy + 15, 16, 1); g.fillRect(ox + 15, oy, 1, 16); }
  }
  if (t === T.GRASS || t === T.MEADOW || t === T.FOREST) {
    // grass blades
    for (let i = 0; i < 3; i++) { const h = hash(tx + i * 9, ty, seed + 4); if (h < 0.6) { const x = ox + Math.floor(h * 14) + 1, y = oy + Math.floor(hash(tx, ty + i, seed + 5) * 13) + 2; px(g, x, y, pal[3]); px(g, x, y - 1, pal[2]); } }
  }
  } // end procedural fallback
  if (t === T.WATER && !texName) {
    for (let i = 0; i < 2; i++) { const h = hash(tx, ty * 3 + i, seed + 8); if (h < 0.5) g.fillStyle = '#9fd3f0', g.fillRect(ox + Math.floor(h * 10) + 2, oy + 4 + i * 6, 4, 1); }
  }
  // soft edges against different terrain (pixel-stepped blend so tiles don't look like squares)
  const edges = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  for (const [dx, dy] of edges) {
    const n = groundAt(tx + dx, ty + dy);
    if (n === t) continue;
    const np = PAL[n] || PAL[T.GRASS];
    const water = t === T.WATER || n === T.WATER;
    const nTex = texFor(tx + dx, ty + dy, stage), img = nTex && TEX[nTex];
    if (TEX && !water && (PRIO[n] ?? 5) < (PRIO[t] ?? 5)) continue; // the other tile draws the spill
    // wavy edge: depth varies smoothly along the side (noise sampled every 4 px, interpolated)
    const along = dx === 0 ? tx * 16 : ty * 16, side = dx === 0 ? ty * 2 + (dy > 0 ? 1 : 0) : tx * 2 + (dx > 0 ? 1 : 0);
    for (let i = 0; i < 16; i++) {
      const a = (along + i) / 4, a0 = Math.floor(a), f = a - a0;
      const v = hash(a0, side, seed + 9) * (1 - f) + hash(a0 + 1, side, seed + 9) * f;
      const depth = water ? 1 + Math.round(v * 1.4) : 1 + Math.round(v * 3.2);
      for (let d = 0; d < depth; d++) {
        const x = dx === 0 ? ox + i : dx > 0 ? ox + 15 - d : ox + d;
        const y = dy === 0 ? oy + i : dy > 0 ? oy + 15 - d : oy + d;
        if (t === T.WATER && n !== T.WATER) { px(g, x, y, d === depth - 1 ? '#d8eef7' : '#bfe3f2'); continue; }
        const wx = tx * 16 + (x - ox), wy = ty * 16 + (y - oy);
        if (img?.naturalWidth && !water) g.drawImage(img, (wx * GS) % img.naturalWidth, (wy * GS) % img.naturalHeight, GS, GS, x, y, 1, 1);
        else px(g, x, y, np[d % 2 ? 2 : 0]);
      }
    }
    if (t !== T.WATER && n === T.WATER && dy === 1) { g.fillStyle = '#6b5b3a'; g.fillRect(ox, oy + 15, 16, 1); } // little bank shadow
  }
  // decor layer
  const d = WORLD.decor[ty * WORLD_W + tx];
  if (d && !TEX) { // with the art pack loaded, plants are sprites drawn by render.js (decorSprites)
    const h = hash(tx, ty, seed + 41), x = ox + 3 + Math.floor(h * 9), y = oy + 3 + Math.floor(hash(ty, tx, seed + 42) * 9);
    if (d <= 4) { const c = ['#fff6e0', '#ffd34d', '#ff9fc4', '#9fc8ff'][d - 1]; px(g, x, y, c); px(g, x + 1, y, c); px(g, x, y + 1, c); px(g, x + 1, y + 1, '#e2b84a'); px(g, x + 3, y + 3, c); px(g, x + 3, y + 4, '#4f8f3a'); }
    else if (d <= 6) { g.fillStyle = '#4c8e36'; g.fillRect(x, y + 2, 1, 3); g.fillRect(x + 2, y + 1, 1, 4); g.fillRect(x + 4, y + 2, 1, 3); }
    else if (d === 7) { px(g, x, y, '#c98a3a'); px(g, x + 1, y + 1, '#b0702c'); px(g, x + 4, y + 2, '#d9a44e'); }
    else if (d === 8) { g.fillStyle = '#e0dccc'; g.fillRect(x, y + 3, 1, 2); g.fillStyle = '#c94a3a'; g.fillRect(x - 1, y + 2, 3, 1); px(g, x, y + 2, '#fff'); }
    else if (d === 9) { g.fillStyle = '#3f7f34'; g.fillRect(x, y, 1, 5); g.fillRect(x - 2, y + 1, 2, 1); g.fillRect(x + 1, y + 2, 2, 1); }
    else if (d === 10) { px(g, x, y, '#6f7564'); px(g, x + 1, y, '#a6ad98'); px(g, x + 4, y + 2, '#6f7564'); }
  }
}

// ------------------------------------------------------------------ v0.12 organic ground (smooth fields)
// Each terrain layer (low -> high priority) has a coverage field = Gaussian-blurred tile indicator, bilinearly
// interpolated per world pixel + a little value noise, thresholded at 0.5. Higher layers are drawn over lower ones,
// so paths and shores become soft curves instead of 16 px stair steps. Rims: shade under grass on paths, foam on
// shorelines, a darker wet bank. Output is written straight into a 2x ImageData sampled from the 2x textures.
const LAYERS = [T.WATER, T.FORD, T.SAND, T.DIRT, T.ROCKY, T.GRASS, T.MEADOW, T.FOREST];
const RANK = Object.fromEntries(LAYERS.map((t, i) => [t, i]));
let texPx = null; // name -> {w, h, d: Uint8ClampedArray}
function texData(name) {
  texPx = texPx || {};
  if (texPx[name]) return texPx[name];
  const img = TEX?.[name]; if (!img?.naturalWidth) return null;
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  return (texPx[name] = { w: c.width, h: c.height, d: g.getImageData(0, 0, c.width, c.height).data });
}
function smoothNoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed), c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
export const PLAZA_R = 3.6; // tiles: paved round plaza at the village centre once it is a village (stage >= 1)
function buildChunkOrganic(cx, cy, stage) {
  const W = CH * TILE, OUT = W * GS, seed = WORLD.seed;
  const tx0 = cx * CH - 2, ty0 = cy * CH - 2, NT = CH + 4;
  // blurred indicator grids for every layer rank r: cover_r = [rank(tile) >= r]
  const rankAt = (x, y) => ROADS.has(x + ',' + y) ? RANK[T.DIRT] : RANK[groundAt(Math.max(0, Math.min(WORLD_W - 1, x)), Math.max(0, Math.min(WORLD_H - 1, y)))] ?? 5;
  const ranks = new Uint8Array(NT * NT);
  for (let y = 0; y < NT; y++) for (let x = 0; x < NT; x++) ranks[y * NT + x] = rankAt(tx0 + x, ty0 + y);
  // village trails are 2-tile stair steps in the data: widen them by one tile so they render as broad curving paths
  const DR = RANK[T.DIRT], wide = ranks.slice();
  for (let y = 1; y < NT - 1; y++) for (let x = 1; x < NT - 1; x++) {
    const i = y * NT + x; if (ranks[i] <= DR || Math.hypot(tx0 + x - CENTER.x, ty0 + y - CENTER.y) > 28) continue;
    if (ranks[i - 1] === DR || ranks[i + 1] === DR || ranks[i - NT] === DR || ranks[i + NT] === DR) wide[i] = DR;
  }
  ranks.set(wide);
  const fields = LAYERS.map((_, r) => {
    if (r === 0) return null;
    const f = new Float32Array(NT * NT);
    for (let y = 1; y < NT - 1; y++) for (let x = 1; x < NT - 1; x++) {
      let s = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) s += (ranks[(y + j) * NT + x + i] >= r ? 1 : 0) * (i ? 1 : 2) * (j ? 1 : 2);
      f[y * NT + x] = s / 16;
    }
    return f;
  });
  const sample = (f, wx, wy) => { // wx, wy: world px
    const u = wx / TILE - .5 - tx0, v = wy / TILE - .5 - ty0, x = Math.floor(u), y = Math.floor(v);
    let fx = u - x, fy = v - y; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const i = y * NT + x;
    return f[i] * (1 - fx) * (1 - fy) + f[i + 1] * fx * (1 - fy) + f[i + NT] * (1 - fx) * fy + f[i + NT + 1] * fx * fy;
  };
  const out = new ImageData(OUT, OUT), D = out.data;
  const ox = cx * W, oy = cy * W;
  const villageCx = (40 + .5) * TILE, villageCy = (50 + .5) * TILE;
  const plazaR = PLAZA_R * TILE;
  for (let py = 0; py < W; py++) for (let pxx = 0; pxx < W; pxx++) {
    const wx = ox + pxx, wy = oy + py;
    if (wx >= WORLD_W * TILE || wy >= WORLD_H * TILE) continue;
    const n = (smoothNoise(wx / 7, wy / 7, seed + 77) - .5) * .34 + (smoothNoise(wx / 2.5, wy / 2.5, seed + 78) - .5) * .1;
    // topmost covering layer + its field value (for rims)
    let top = 0, val = 1, below = 1;
    for (let r = LAYERS.length - 1; r >= 1; r--) {
      const v = sample(fields[r], wx + .5, wy + .5) + n;
      if (v > .5) { top = r; val = v; break; }
      below = v;
    }
    const t = LAYERS[top], tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
    let name;
    const dPlaza = Math.hypot(wx + .5 - villageCx, wy + .5 - villageCy) + n * 6;
    const plaza = stage >= 1 && dPlaza < plazaR;
    if (plaza) name = 'tx_road_cobble';
    else if (t === T.DIRT && stage >= 1 && Math.hypot(tx - CENTER.x, ty - CENTER.y) < 30) name = roadTexture(stage);
    else if (t === T.WATER) name = 'tx_water_0';
    else { // texture variants in organic blobs (not 4x4-tile squares)
      const set = TEX_SETS[t], v = smoothNoise(wx / 53, wy / 53, seed + 61 + top) * .75 + smoothNoise(wx / 17, wy / 17, seed + 62) * .25;
      name = set[Math.min(set.length - 1, Math.floor(v * set.length))];
    }
    const tex = texData(name) || texData(TEX_SETS[t][0]);
    // shading factors: rims near the edge of this layer, shade under the next layer up
    let k = 1, add = 0;
    if (plaza && dPlaza > plazaR - 2.5) k = .72; // kerb stones around the plaza
    else if (t === T.WATER) {
      const land = below; // coverage of the layer above water (shore)
      if (land > .44) { add = 70; k = 1.05; } else if (land > .36) { add = 26; } // foam then light shallows
    } else {
      if (val < .56) k = t === T.DIRT || t === T.SAND ? .9 : .82;     // this layer's own edge darkens (grass rim)
      if (below > .42 && below <= .5 && top < LAYERS.length - 1) k *= .84; // shadow cast by the higher layer next to it
      if ((t === T.SAND || t === T.DIRT) && fields[1] && sample(fields[1], wx + .5, wy + .5) + n < .58) k *= .82; // wet bank
    }
    // modern eras: roads/plaza painted procedurally — อำเภอ concrete slabs + kerbs, จังหวัด/ประเทศ asphalt with lane lines
    const isRoad = t === T.DIRT && Math.hypot(tx - CENTER.x, ty - CENTER.y) < 30;
    if (stage >= 2 && (plaza || isRoad)) {
      let c;
      const grain = hash(wx, wy, seed + 51), mott = smoothNoise(wx / 9, wy / 9, seed + 52);
      if (plaza) {
        if (stage === 2) { // concrete tiles 8x8 with joints
          c = (wx % 8 === 0 || wy % 8 === 0) ? [168, 166, 158] : mott > .55 ? [214, 212, 204] : [204, 202, 194];
        } else { // brick pavers (running bond), warm red/terracotta
          const row = Math.floor(wy / 4), off = row % 2 ? 4 : 0;
          c = (wy % 4 === 0 || (wx + off) % 8 === 0) ? [150, 92, 70] : hash(Math.floor((wx + off) / 8), row, seed + 53) > .5 ? [196, 120, 88] : [184, 110, 80];
          if (stage >= 4 && dPlaza < plazaR * .45) c = (wx % 6 === 0 || wy % 6 === 0) ? [190, 190, 196] : [228, 228, 232]; // polished stone centre
        }
        if (dPlaza > plazaR - 2.5) c = [236, 234, 226]; // white kerb
      } else if (stage === 2) { // concrete road with expansion joints
        c = mott > .6 ? [206, 204, 196] : [196, 194, 186];
        if (wx % 16 === 0 || wy % 16 === 0) c = [160, 158, 150];
        if (grain > .992) c = [150, 148, 142];
        if (val < .57) c = [232, 230, 222]; // kerb
      } else { // asphalt
        c = stage >= 4 ? (mott > .5 ? [58, 60, 66] : [52, 54, 60]) : (mott > .5 ? [76, 78, 84] : [70, 72, 78]);
        if (grain > .97) c = c.map(q => q + 16);
        if (val < .55) c = [214, 212, 206]; // concrete kerb / footpath edge
        else if (val < .59) c = [236, 236, 230]; // white edge line
        else if (val > .7 && val < .735 && ((wx + wy) >> 2) % 3 !== 0) c = stage >= 4 ? [236, 236, 230] : [232, 190, 64]; // dashed lane line inside each edge
      }
      if (add) c = c.map(q => Math.min(255, q + add * .8));
      const kk = below > .42 && below <= .5 ? .86 : 1; // grass shade on the edge
      for (let j = 0; j < GS; j++) for (let i = 0; i < GS; i++) { const di = ((py * GS + j) * OUT + pxx * GS + i) * 4; D[di] = c[0] * kk; D[di + 1] = c[1] * kk; D[di + 2] = c[2] * kk; D[di + 3] = 255; }
      continue;
    }
    // water and plain dirt are painted procedurally (posterised 16-bit style) — no visible texture squares
    // palette sampled from the reference village map: saturated yellow-greens
    const GREEN = { [T.GRASS]: [[112, 190, 46], [128, 204, 52], [148, 216, 68], [80, 150, 34]], [T.MEADOW]: [[128, 200, 52], [146, 214, 60], [166, 224, 82], [96, 164, 40]],
      [T.FOREST]: [[78, 150, 42], [92, 166, 46], [110, 180, 56], [56, 118, 34]] }[t];
    if ((t === T.WATER || GREEN || (t === T.DIRT && name === 'tx_dirt_0') || (t === T.DIRT && name === 'tx_dirt_1')) && !plaza) {
      let c;
      if (GREEN) {
        const v = smoothNoise(wx / 19, wy / 19, seed + 25) * .55 + smoothNoise(wx / 7, wy / 7, seed + 26) * .3 + smoothNoise(wx / 2.3, wy / 2.3, seed + 27) * .15;
        c = v > .63 ? GREEN[2] : v > .45 ? GREEN[1] : GREEN[0];
        // grass blades: short dark strokes with a light tip, scattered on a jittered grid
        const gx = Math.floor(wx / 4), gy = Math.floor(wy / 5), bh = hash(gx, gy, seed + 28);
        if (bh < .32) {
          const bx = gx * 4 + 1 + Math.floor(hash(gy, gx, seed + 29) * 2), by = gy * 5 + 1;
          if (wx === bx && (wy === by + 1 || wy === by + 2)) c = GREEN[3];
          else if (wx === bx + 1 && wy === by + 2) c = GREEN[3];
          else if (wx === bx && wy === by) c = GREEN[2].map(q => Math.min(255, q + 18));
        }
        if (t === T.MEADOW && hash(wx, wy, seed + 30) > .996) c = [[255, 246, 214], [255, 214, 90], [255, 160, 196]][Math.floor(hash(wy, wx, 3) * 3)];
      } else if (t === T.WATER) {
        const depth = Math.min(1, Math.max(0, (.5 - below) * 2.2)), v = smoothNoise(wx / 13, wy / 6, seed + 5) * .6 + smoothNoise(wx / 5, wy / 3, seed + 6) * .4;
        const wave = smoothNoise(wx / 9 + Math.sin(wy / 7) * .8, wy / 2.6, seed + 7);
        c = depth > .55 ? [36, 104, 196] : depth > .25 ? [52, 128, 214] : [72, 152, 226];
        if (v > .66) c = c.map(q => q + 14);
        if (wave > .8) c = [150, 214, 250]; else if (wave > .74) c = [104, 180, 240];
        if (hash(wx, wy, seed + 8) > .9985) c = [240, 252, 255];
      } else {
        const v = smoothNoise(wx / 11, wy / 11, seed + 15) * .7 + smoothNoise(wx / 4, wy / 4, seed + 16) * .3;
        c = v > .62 ? [226, 178, 112] : v > .4 ? [214, 164, 98] : [200, 150, 88];
        const h = hash(wx, wy, seed + 17);
        if (h > .985) c = [168, 122, 74]; else if (h > .975) c = [236, 196, 136];
      }
      if (add) c = c.map(q => Math.min(255, q + add * .8));
      for (let j = 0; j < GS; j++) for (let i = 0; i < GS; i++) { const di = ((py * GS + j) * OUT + pxx * GS + i) * 4; D[di] = c[0] * k; D[di + 1] = c[1] * k; D[di + 2] = c[2] * k; D[di + 3] = 255; }
      continue;
    }
    // anti-repetition: natural ground samples the texture from one of 3 offsets, chosen by low-frequency noise
    const pick = plaza || t === T.DIRT ? 0 : Math.floor(smoothNoise(wx / 23, wy / 23, seed + 91) * 2.999);
    const offX = [0, 41, 83][pick], offY = [0, 67, 29][pick];
    for (let j = 0; j < GS; j++) for (let i = 0; i < GS; i++) {
      const sx = ((wx + offX) * GS + i) % tex.w, sy = ((wy + offY) * GS + j) % tex.h, si = (sy * tex.w + sx) * 4, di = ((py * GS + j) * OUT + pxx * GS + i) * 4;
      D[di] = tex.d[si] * k + add; D[di + 1] = tex.d[si + 1] * k + add; D[di + 2] = tex.d[si + 2] * k + add; D[di + 3] = 255;
    }
  }
  const c = document.createElement('canvas'); c.width = OUT; c.height = OUT;
  c.getContext('2d').putImageData(out, 0, 0);
  return c;
}

// ------------------------------------------------------------------ v0.16 square tilesets (dual grid)
// Ground is drawn from the GPT tile sheets (scripts/ingest-tiles.py): one tileset tile = 2x2 game tiles (32 world px,
// stored 64 px). Terrain is sampled per 2x2 "cell"; every drawn tile sits between 4 cells and picks the tile whose
// 4 corners match them (16 masks), so roads/water get real drawn borders instead of procedural ones.
// Layers per tile: grass -> dirt/road overlay (grass keyed out) -> pond bank. Water itself is NOT baked: the chunk is
// transparent there and drawWater() paints the 4-frame animation underneath every frame.
export const TILE_NAMES = [...Object.keys(TILESETS), 'bankmask', 'beachmask'].map(n => 'tiles/' + n);
let TL = null;
export function setTileImages(images) {
  const ok = n => images[n]?.complete && images[n].naturalWidth > 0;
  if (!TILE_NAMES.every(ok)) return false;
  TL = Object.fromEntries(TILE_NAMES.map(n => [n.slice(6), images[n]]));
  cacheKey = '';
  return true;
}
export function tilesReady() { return !!TL; }
const CELL = 2, TPX = 64, CW = Math.ceil(WORLD_W / CELL), CHH = Math.ceil(WORLD_H / CELL);
const K = { G: 0, W: 1, R: 2, D: 3, P: 4, MEADOW: 5, ROCKY: 6, M: 7 }; // M = main street (asphalt + sidewalk)
let cellKey = '', cellT = null, cellSub = null, cellStream = null;
function cellGrid(stage) {
  const key = `${WORLD.seed}:${WORLD.plan}:${WORLD.version}:${stage}:${ROADS.size}:${ROADS.main?.size || 0}:${PAVED.size}:${YARD.size}:${yardVer}`;
  if (key === cellKey) return;
  cellKey = key; cellT = new Uint8Array(CW * CHH); cellSub = new Uint8Array(CW * CHH); cellStream = new Uint8Array(CW * CHH);
  const isW = t => t === T.WATER || t === T.FORD;
  // trails become era roads inside the village and inside every district the area has opened (zoneAt tier)
  const road = (x, y) => { if (ROADS.has(x + ',' + y)) return true; if (groundAt(x, y) !== T.DIRT) return false; const z = zoneAt(x, y); return !!z && z.tier >= 3 && z.tier <= stage + 1; }; // v0.25 village streets come only from the plan (no stray gray trails)
  for (let Y = 0; Y < CHH; Y++) for (let X = 0; X < CW; X++) {
    let w = 0, r = 0, d = 0, me = 0, ro = 0, pv = 0, mn = 0;
    for (let j = 0; j < CELL; j++) for (let i = 0; i < CELL; i++) {
      const x = X * CELL + i, y = Y * CELL + j, t = groundAt(x, y);
      if (ROADS.main?.has(x + ',' + y)) mn++;
      if (ROADS.has(x + ',' + y)) r++; else if (isW(t)) w++; else if (road(x, y)) r++; else if (PAVED.has(x + ',' + y)) pv++; else if (YARD.has(x + ',' + y)) { if (stage >= 2) pv++; else d++; } else if (t === T.DIRT) d++;
      if (t === T.MEADOW) me++; if (t === T.ROCKY) ro++;
    }
    const i = Y * CW + X, plaza = stage >= 1 && Math.hypot(X * CELL + 1 - CENTER.x - .5, Y * CELL + 1 - CENTER.y - .5) < PLAZA_R + .6;
    cellT[i] = mn >= 2 ? K.M : r >= 2 ? K.R : w >= 2 ? K.W : plaza || pv >= 2 ? K.P : d >= 2 ? K.D : K.G;
    cellSub[i] = me >= 2 ? K.MEADOW : ro >= 2 ? K.ROCKY : K.G;
    if (cellT[i] === K.W) { // narrow water = flowing stream frames, wide water = lake ripples
      let n = 0, all = 0;
      for (let y = Y * CELL - 3; y <= Y * CELL + 4; y++) for (let x = X * CELL - 3; x <= X * CELL + 4; x++) { all++; if (isW(groundAt(x, y))) n++; }
      cellStream[i] = n / all < .55 ? 1 : 0;
    }
  }
}
const cellAt = (X, Y) => cellT[Math.max(0, Math.min(CHH - 1, Y)) * CW + Math.max(0, Math.min(CW - 1, X))];
function maskOf(X, Y, test) { return (test(cellAt(X, Y)) ? 8 : 0) | (test(cellAt(X + 1, Y)) ? 4 : 0) | (test(cellAt(X, Y + 1)) ? 2 : 0) | (test(cellAt(X + 1, Y + 1)) ? 1 : 0); }
const ROAD_SET = ['road1', 'road2', 'road3', 'road4', 'road5'];
function blit(g, name, idx, dx, dy) { g.drawImage(TL[name], idx * TPX, 0, TPX, TPX, dx, dy, TPX, TPX); }
function buildChunkTiles(cx, cy, stage) {
  cellGrid(stage);
  const OUT = CH * TILE * GS, ox = cx * CH * TILE, oy = cy * CH * TILE, seed = WORLD.seed;
  const c = document.createElement('canvas'); c.width = c.height = OUT;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  const per = CH / CELL, roadSet = ROAD_SET[Math.min(4, stage)];
  const isW = t => t === K.W, isD = t => t === K.D || (stage === 0 && (t === K.R || t === K.P || t === K.M)), isR = t => stage > 0 && (t === K.R || t === K.P || t === K.M), isM = t => stage > 0 && t === K.M;
  const laneSet = 'road2', mainSet = stage >= 2 ? ROAD_SET[Math.min(4, stage)] : 'road3';
  for (let Y = cy * per - 1; Y < (cy + 1) * per; Y++) for (let X = cx * per - 1; X < (cx + 1) * per; X++) {
    const dx = ((X * CELL + 1) * TILE - ox) * GS, dy = ((Y * CELL + 1) * TILE - oy) * GS;
    const wm = maskOf(X, Y, isW);
    if (wm === 15) continue; // open water: animated layer underneath
    // grass base: plain variants, flowers in meadows, pebbles on rocky ground, an odd flower/clover patch elsewhere
    const sub = cellSub[Math.max(0, Math.min(CHH - 1, Y)) * CW + Math.max(0, Math.min(CW - 1, X))], h = hash(X, Y, seed + 301), h2 = hash(Y, X, seed + 302);
    let v = Math.floor(h * 8);
    if (sub === K.MEADOW && h2 < .55) v = 8 + Math.floor(h2 * 7.27) % 4; else if (sub === K.ROCKY && h2 < .45) v = 14 + (h2 < .22 ? 1 : 0); else if (h2 < .07) v = 8 + Math.floor(h2 * 85) % 6;
    blit(g, 'grass', v, dx, dy);
    if (wm) { // pond / river bank (rocks + foam) or sea beach (sand + surf): punch the water out, then draw the shore
      const sea = WORLD.sea && [[0, 0], [1, 0], [0, 1], [1, 1]].some(([a, b]) => WORLD.sea[Math.max(0, Math.min(WORLD_H - 1, (Y + b) * CELL)) * WORLD_W + Math.max(0, Math.min(WORLD_W - 1, (X + a) * CELL))]);
      const set = sea ? 'beach' : 'bank';
      g.globalCompositeOperation = 'destination-out'; blit(g, set + 'mask', wm, dx, dy);
      g.globalCompositeOperation = 'source-over'; blit(g, set, wm, dx, dy);
      continue;
    }
    const dm = maskOf(X, Y, isD);
    if (dm) blit(g, 'road1', dm === 15 && h < .14 ? 16 + Math.floor(h2 * 3) : dm, dx, dy);
    const rm = maskOf(X, Y, isR);
    if (rm === 15) {
      if (maskOf(X, Y, t => t === K.P) === 15) { // village plaza follows the era; paved city blocks are concrete pavers
        const centre = Math.hypot(X * CELL + 2 - CENTER.x - .5, Y * CELL + 2 - CENTER.y - .5) < PLAZA_R + 2;
        blit(g, 'plaza' + (centre ? Math.min(4, stage) : 2), Math.floor(h * 4), dx, dy);
      }
      else { const ex = TILESETS[laneSet].extra; blit(g, laneSet, ex && h < .1 ? 16 + Math.floor(h2 * ex) : 15, dx, dy); }
    } else if (rm) blit(g, laneSet, rm, dx, dy);
    // main streets on top: asphalt with sidewalks; where a lane joins, the sidewalk opens onto it
    const mm = maskOf(X, Y, isM);
    if (mm) blit(g, mainSet, mm, dx, dy);
  }
  return c;
}
/** Animated water (4 frames) under the ground chunks; lily pads / rocks now and then on open water. */
function drawWater(ctx, x0, y0, x1, y1) {
  const f = Math.floor(performance.now() / 280) % 4, S = CELL * TILE;
  const X0 = Math.floor((x0 / TILE - 1) / CELL) - 1, X1 = Math.ceil((x1 / TILE - 1) / CELL), Y0 = Math.floor((y0 / TILE - 1) / CELL) - 1, Y1 = Math.ceil((y1 / TILE - 1) / CELL);
  for (let Y = Math.max(-1, Y0); Y <= Math.min(CHH, Y1); Y++) for (let X = Math.max(-1, X0); X <= Math.min(CW, X1); X++) {
    const wm = maskOf(X, Y, t => t === K.W); if (!wm) continue;
    const wx = (X * CELL + 1) * TILE, wy = (Y * CELL + 1) * TILE;
    const cX = Math.max(0, Math.min(CW - 1, X + (wm & 8 ? 0 : 1))), cY = Math.max(0, Math.min(CHH - 1, Y + (wm & 8 ? 0 : 1)));
    const stream = cellStream[cY * CW + cX];
    // neighbouring tiles run the loop a frame apart so the surface doesn't pulse in lockstep
    const fr = (f + (Math.floor(hash(X, Y, 911) * 4))) % 4;
    ctx.drawImage(TL.water, ((stream ? 4 : 0) + fr) * TPX, 0, TPX, TPX, wx, wy, S, S);
    if (wm === 15 && !stream) { const h = hash(X, Y, WORLD.seed + 77); if (h < .06) ctx.drawImage(TL.bank, (16 + (h < .04 ? 0 : 1)) * TPX, 0, TPX, TPX, wx, wy, S, S); }
  }
}

function buildChunk(cx, cy, stage) {
  if (TL) return buildChunkTiles(cx, cy, stage);
  if (TEX) return buildChunkOrganic(cx, cy, stage);
  const c = document.createElement('canvas'); c.width = CH * TILE * GS; c.height = CH * TILE * GS;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.scale(GS, GS);
  for (let ty = cy * CH; ty < Math.min(WORLD_H, (cy + 1) * CH); ty++) for (let tx = cx * CH; tx < Math.min(WORLD_W, (cx + 1) * CH); tx++) tile(g, tx, ty, (tx - cx * CH) * TILE, (ty - cy * CH) * TILE, stage);
  return c;
}

/** Draw the ground chunks visible in world rect [x0,x1]x[y0,y1]. ctx already has the world transform. */
let ROADS = new Set(), PAVED = new Set(), YARD = new Set(), yardVer = 0;
export function drawGround(ctx, x0, y0, x1, y1, stage = 0, roads = null, paved = null, yards = null) {
  if (roads) ROADS = roads;
  if (paved) PAVED = paved;
  if (yards && yards !== YARD) { YARD = yards; yardVer++; }
  const key = `${WORLD.seed}:${WORLD.biome}:${WORLD.version}:${Math.min(4, stage)}:${TEX ? 1 : 0}:${TL ? 1 : 0}:${WORLD.plan}:${ROADS.size}:${PAVED.size}:${yardVer}`;
  if (key !== cacheKey) { cache.clear(); cacheKey = key; }
  const S = CH * TILE;
  if (TL) { cellGrid(Math.min(4, stage)); drawWater(ctx, x0, y0, x1, y1); }
  for (let cy = Math.max(0, Math.floor(y0 / S)); cy <= Math.min(Math.ceil(WORLD_H / CH) - 1, Math.floor(y1 / S)); cy++)
    for (let cx = Math.max(0, Math.floor(x0 / S)); cx <= Math.min(Math.ceil(WORLD_W / CH) - 1, Math.floor(x1 / S)); cx++) {
      const k = cx + ',' + cy;
      if (!cache.has(k)) cache.set(k, buildChunk(cx, cy, stage));
      ctx.drawImage(cache.get(k), cx * S, cy * S, S, S);
    }
}
export function chunkCount() { return cache.size; }
export { CH };

/** Small ground decal from a tileset (e.g. stepping stones from the front door to the lane). w, h in world px. */
export function drawDecal(ctx, name, x, y, w = 16, h = 16, sx = 0) {
  const im = TL?.[name]; if (!im) return false;
  ctx.drawImage(im, sx, 0, w * 2, h * 2, x, y, w, h); return true;
}

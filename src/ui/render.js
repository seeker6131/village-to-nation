// Canvas renderer — layers: ground chunks (terrain + decor) -> y-sorted objects (trees, rocks, buildings, people)
// with see-through foliage when something covers the player -> night light -> screen-space labels/markers.
import { MAPS } from '../maps/index.js';
import { TILE, WORLD_W, WORLD_H, T, groundAt, hash, POINTS, nodeOnTile, nodeStatus, nodeState, LEADER_HOUSE, TENTS, PROPS, CENTER, VILLAGE_RADIUS, plotRect, plotObstacles } from '../world.js';
import { PROJECTS } from '../gameState.js';
import { BUILDINGS, progressOf, findStructure } from '../construction.js';
import { gardenProgress } from '../systems.js';
import { jobTarget } from '../jobs.js';
import { structurePos } from '../npcs.js';
import { atlasCanvas, frameRect } from '../character/composer.js';
import { rigAtlasReady, rigFrameRect, rigWalkColumn, F as RIG_F, RIG_BASELINE } from '../character/rig.js';
import { allUnlocked } from '../save.js';
import { villageProps, PASTURE, groundLift } from '../villageProps.js';
import { drawLighting, skyAt, windowLit } from './lighting.js';
import { TIERS, tierOf, openSlots, slotState, slotObstacles, publicUnlocked, publicTier, villageRadius, roadTiles, pavedTiles, yardTiles, paveLevels } from '../villageLayout.js';
import { QUALITY_PROFILES } from '../performance.js';
import { G, CHAR_SCALE, OLD_CHAR_SCALE, HEAD_Y, nearestInteractable, FRAME, walkColumn, walkBob, RIG_STRIDE } from './game.js';
import { worldToScreen } from './camera.js';
import { drawGround, setTextures, TEXTURE_NAMES, TILE_NAMES, setTileImages, drawDecal } from './terrain.js';
import { ART10 } from '../artManifest.js';
import { eraHouseFrame as cottageFrame } from '../artMap.js';
import { treeSpecies, rockSprite, buildingFrame, leaderHouseFrame, decorSprites, DECOR_LIST, waterfallSpot, cropFor, cropStage, CROPS, FENCE_MATERIALS, roadTexture, allReachableSprites } from '../artMap.js';

// v0.9 art still in use (props, workshop) + every v0.10 sprite the art map can ask for (assets/v10, stored at 2x)
const ART_NAMES = ['workshop', 'log', 'bush_0', 'bush_1', 'bush_2', 'bush_3', 'bush_4', ...allReachableSprites().map(n => 'v10/' + n), ...Object.keys(ART10).filter(n => /^(c[bpd]|po|gt|bs|sh|bz)_/.test(n)).map(n => 'v10/' + n), ...MAPS.flatMap(m => [...new Set([...m.trees.flatMap(([, , sp]) => [sp.replace('stump_', 'tree_'), sp.replace('tree_', 'stump_')]), ...m.props.map(p => p.name)])]).filter(n => ART10[n]).map(n => 'v10/' + n), ...TILE_NAMES];
const art = {};
export function loadArt() {
  return Promise.all(ART_NAMES.map(id => new Promise(res => {
    const im = new Image();
    im.onload = () => res(); im.onerror = () => { console.warn('missing art', id); res(); };
    im.src = window.__V2N_ASSET_MAP__?.[id] || `./assets/${id}.webp`;
    art[id] = im;
  }))).then(() => { const tex = {}; for (const n of [...TEXTURE_NAMES, 'tx_road_dirt', 'tx_road_gravel', 'tx_road_cobble', 'tx_road_slab', 'tx_road_asphalt']) tex[n] = art['v10/' + n]; setTextures(tex); setTileImages(art); });
}
export const ART_USED = ART_NAMES;
const ready = id => art[id]?.complete && art[id].naturalWidth > 0;
const ready10 = n => ready('v10/' + n);
/** Draw a v10 sprite: centred on cx, bottom on by, at its manifest size × scale. Returns its world rect. */
/** Soft contact shadow (ellipse, multiplied) under a big object: makes buildings/trees sit on the ground. */
let shadowImg = null;
function groundShadow(cx, by, w, h = 7) { // pre-rendered soft ellipse, stretched (no per-frame gradients)
  if (!shadowImg) {
    shadowImg = document.createElement('canvas'); shadowImg.width = 64; shadowImg.height = 64; const g = shadowImg.getContext('2d');
    const r = g.createRadialGradient(32, 32, 1, 32, 32, 32); r.addColorStop(0, 'rgba(20,40,15,.5)'); r.addColorStop(.7, 'rgba(20,40,15,.22)'); r.addColorStop(1, 'rgba(20,40,15,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  }
  ctx.drawImage(shadowImg, cx - w / 2, by - h, w, h * 2);
}
// screen-space cinematic pass: time-of-day grade + vignette (cached gradient canvas per size)
let vig = null;
function gradePass(hour) {
  const W = canvas.width, H = canvas.height;
  // warm morning / neutral noon / golden evening (night is handled by the night tint)
  const warm = hour < 9 ? (9 - hour) / 3.5 : hour > 15.5 ? Math.min(1, (hour - 15.5) / 3) : 0;
  if (warm > 0) { ctx.fillStyle = `rgba(255,150,60,${(0.13 * Math.min(1, warm)).toFixed(3)})`; ctx.fillRect(0, 0, W, H); } // plain alpha: cheap on every GPU
  if (!vig || vig.width !== W || vig.height !== H) {
    vig = document.createElement('canvas'); vig.width = W; vig.height = H; const g = vig.getContext('2d');
    const r = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .45, W / 2, H / 2, Math.hypot(W, H) * .58);
    r.addColorStop(0, 'rgba(10,20,15,0)'); r.addColorStop(1, 'rgba(10,20,15,.38)'); g.fillStyle = r; g.fillRect(0, 0, W, H);
  }
  // (v0.12: vignette removed — players found the darkened screen edges unpleasant)
}
// ---- v0.19 sun shadows: every tree / building / person casts a shadow that follows the sun (physics-ish):
// the sun rises in the east (shadows point west and are long), is high at noon (short), sets in the west (long, east).
// Thailand is north of the equator, so the sun stays a little south and shadows lean slightly north (up the screen).
export function sunAt(hour) {
  if (hour < 6 || hour > 18.2) return null;                   // night: no sun shadows
  const a = (hour - 6) / 12 * Math.PI, el = Math.sin(a);       // 0 at sunrise/sunset, 1 at noon
  const len = Math.max(.3, Math.min(2.4, .32 / Math.max(.13, el)));
  // fades smoothly to nothing at sunrise / sunset (no sudden pop when the sun goes down)
  const fade = Math.min(1, Math.max(0, (el - .02) / .3)), f = fade * fade * (3 - 2 * fade);
  return { dirX: -Math.cos(a), len, alpha: .48 * f };
}
const silCache = new Map();
function silhouette(name) { // black copy of the sprite's alpha (cached once per sprite)
  let c = silCache.get(name); if (c) return c;
  const im = art['v10/' + name]; if (!im?.naturalWidth) return null;
  c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
  const g = c.getContext('2d'); g.drawImage(im, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#0d1a10'; g.fillRect(0, 0, c.width, c.height);
  silCache.set(name, c); return c;
}
function castShadow(g, sun, sh) {
  const c = -sun.dirX * sun.len * .85, d = .22 + .14 * sun.len;
  g.save(); g.translate(sh.cx, sh.by); g.transform(1, 0, c, d, 0, 0);
  if (sh.char) { g.beginPath(); g.ellipse(0, -11, 5, 11, 0, 0, Math.PI * 2); g.fill(); g.restore(); return; }
  const sz = ART10[sh.name], im = sz && silhouette(sh.name); if (!im) { g.restore(); return; }
  if (sh.flip) g.scale(-1, 1);
  const w = sz[0] * (sh.scale || 1), h = sz[1] * (sh.scale || 1);
  g.drawImage(im, -w / 2, -h, w, h);
  g.restore();
}
// all shadows go into one opaque layer first, then that layer is laid down once at the sun's strength:
// overlapping shadows no longer stack into black patches that flicker as they move.
let shadowLayer = null;
function sprFlip(g, name, cx, by, flip) {
  if (!flip) return spr(g, name, cx, by);
  g.save(); g.translate(Math.round(cx), 0); g.scale(-1, 1); const r = spr(g, name, 0, by); g.restore(); return r;
}
function spr(g, name, cx, by, scale = 1) {
  const sz = ART10[name]; if (!sz || !ready10(name)) return null;
  const w = sz[0] * scale, h = sz[1] * scale, x = Math.round(cx - w / 2), y = Math.round(by - h);
  g.drawImage(art['v10/' + name], x, y, Math.round(w), Math.round(h));
  return { x0: x, x1: x + w, y0: y, y1: y + h };
}

let canvas, ctx, k = 1;
export function initRenderer(c) { canvas = c; ctx = c.getContext('2d', { alpha: false }); }
export function setResolution(w, h, scale) { canvas.width = w; canvas.height = h; k = scale; G.k = scale; G.cam.k = scale; ctx.imageSmoothingEnabled = false; }
function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }

// ----------------------------------------------------------------- characters
function playerAppearance() { return G.state.character?.appearance || { hair: 'pony', outfit: 'cream' }; }
/** Skeletal-rig character (8-frame walk); the v0.8 sprite sheet is only a fallback while the rig atlas bakes. */
export function drawCharacter(g, appearance, x, y, dir, walking, dist, unlocked, urgent = false) {
  const rig = rigAtlasReady(appearance, { urgent });
  if (rig) { // snap to the sprite pixel grid (0.5 world px) so pixels never split
    const r = rigFrameRect(dir, rigWalkColumn(walking, dist, RIG_STRIDE)), S = CHAR_SCALE;
    g.drawImage(rig, r.x, r.y, r.w, r.h, Math.round((x - RIG_F / 2 * S) * 2) / 2, Math.round((y - RIG_BASELINE * S) * 2) / 2, RIG_F * S, RIG_F * S);
    return;
  }
  const sheet = atlasCanvas(appearance, { unlockedOutfits: unlocked }); if (!sheet) return;
  const r = frameRect(dir, walkColumn(dir, walking, dist)), S = OLD_CHAR_SCALE;
  g.drawImage(sheet, r.x, r.y, r.w, r.h, Math.round(x - FRAME / 2 * S), Math.round(y - 61 * S + walkBob(walking, dist)), FRAME * S, FRAME * S);
}
function shadow(x, y, w = 8) { ctx.fillStyle = '#1b3a1866'; ctx.beginPath(); ctx.ellipse(x, y + 1, w, 2.6, 0, 0, Math.PI * 2); ctx.fill(); }

// ----------------------------------------------------------------- objects
function drawScaffold(x, y, w, h, prog) {
  rect(x, y + h - 4, w, 4, '#7a5b37');
  rect(x + 2, y + h * (1 - prog) * .6 + 4, w - 4, h * .4 + h * prog * .6 - 8, '#d9b98a');
  ctx.strokeStyle = '#8a5a34'; ctx.lineWidth = 2;
  for (let i = 0; i <= 3; i++) { const xx = x + 2 + i * (w - 4) / 3; ctx.beginPath(); ctx.moveTo(xx, y + h - 2); ctx.lineTo(xx, y + 4); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(x + 2, y + h * .45); ctx.lineTo(x + w - 2, y + h * .45); ctx.moveTo(x + 2, y + 6); ctx.lineTo(x + w - 2, y + 6); ctx.stroke();
}
function tent(x, y) { // 2x2 tiles, procedural canvas tent
  rect(x + 2, y + 26, 28, 4, '#3d5a2c66');
  ctx.fillStyle = '#c99b5f'; ctx.beginPath(); ctx.moveTo(x + 16, y + 2); ctx.lineTo(x + 31, y + 28); ctx.lineTo(x + 1, y + 28); ctx.fill();
  ctx.fillStyle = '#e8c58a'; ctx.beginPath(); ctx.moveTo(x + 16, y + 2); ctx.lineTo(x + 24, y + 28); ctx.lineTo(x + 8, y + 28); ctx.fill();
  ctx.fillStyle = '#5a3d22'; ctx.beginPath(); ctx.moveTo(x + 16, y + 12); ctx.lineTo(x + 20, y + 28); ctx.lineTo(x + 12, y + 28); ctx.fill();
  rect(x + 15, y, 2, 4, '#6b4a2a');
}
// community farm ("สวนอาหาร"): a farmyard on the grass — barn, chicken coop, hay, trough (no tilled-soil field: the owner
// found the veg plots ugly). It still feeds the village through the farmer NPCs (npcs.js), only the look changed.
function drawFarm(r, site) {
  const x = r.tx * TILE, y = r.ty * TILE, prog = site.status === 'building' && !site.upgradingTo ? progressOf(site) : 1;
  const at = (name, fx, fy) => spr(ctx, name, x + fx * r.w * TILE, y + fy * r.h * TILE);
  at('pf_sacks', .15, .95); at('pf_hay', .82, .92);
  if (prog < .5) return;
  at('fb_shed', .34, .78);
  if (prog < 1) return;
  at('fb_coop', .78, .62); at('pf_trough', .62, .97); if (site.level >= 2) at('pf_wheelbarrow', .9, .35);
}
/** One 16x16 world tile of a 2x-stored texture, sampled at world position (wx, wy) so neighbours line up. */
function texTile(img, wx, wy, dx, dy) { const S = img.naturalWidth; ctx.drawImage(img, (wx * 2) % S, (wy * 2) % S, TILE * 2, TILE * 2, dx, dy, TILE, TILE); }
function fenceAt(tx, ty) { return G.state.placed.find(p => p.type === 'fence' && p.tx === tx && p.ty === ty); }

function inVillageUse(tx, ty) {
  for (const id of ['home', 'farm', 'market', 'hall']) { const r = plotRect(id); if (tx >= r.tx - 1 && tx <= r.tx + r.w && ty >= r.ty - 1 && ty <= r.ty + r.h) return true; }
  const s = G.state;
  if (tierOf(s) >= 2 && tx >= PASTURE.x0 - 2 && tx <= PASTURE.x1 && ty >= PASTURE.y0 - 4 && ty <= PASTURE.y1) return true;
  return Math.hypot(tx - CENTER.x, ty - CENTER.y) < 8;
}
// ----------------------------------------------------------------- frame
export function render() {
  const { cam, cssW, cssH } = G, s = G.state;
  const prof = QUALITY_PROFILES[G.settings.quality];
  const scale = cam.zoom * k; // integer by construction (camera.snapZoom)
  const tx0 = Math.round((cssW / 2 - cam.x * cam.zoom) * k), ty0 = Math.round((cssH / 2 - cam.y * cam.zoom) * k);
  const worldT = () => ctx.setTransform(scale, 0, 0, scale, tx0, ty0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  rect(0, 0, canvas.width, canvas.height, '#2f5a2a');
  worldT(); ctx.imageSmoothingEnabled = false;
  const vx0 = cam.x - cssW / 2 / cam.zoom, vx1 = cam.x + cssW / 2 / cam.zoom;
  const vy0 = cam.y - cssH / 2 / cam.zoom, vy1 = cam.y + cssH / 2 / cam.zoom;
  const stage = s.town?.stage || 0;
  drawGround(ctx, vx0, vy0, vx1, vy1, stage, roadTiles(s), pavedTiles(s), yardTiles(s), paveLevels(s));
  if (prof.animatedWater) { // water glints drift over the ground layer
    ctx.fillStyle = '#e4f6ffaa';
    for (let ty = Math.max(0, Math.floor(vy0 / TILE)); ty < Math.min(WORLD_H, vy1 / TILE + 1); ty++) for (let tx = Math.max(0, Math.floor(vx0 / TILE)); tx < Math.min(WORLD_W, vx1 / TILE + 1); tx++) {
      if (groundAt(tx, ty) !== T.WATER || (tx * 7 + ty * 3) % 5) continue;
      const ph = (G.now * .6 + tx * .37 + ty * .53) % 1;
      ctx.fillRect(tx * TILE + Math.floor(ph * 12), ty * TILE + 6 + (tx % 3) * 3, 3, 1);
    }
  }
  // plant sprites (decor layer) — flat, under every standing object
  { const D = decorSprites(), RT = roadTiles(s), PT = pavedTiles(s), YT = yardTiles(s);
    for (let ty = Math.max(0, Math.floor(vy0 / TILE) - 1); ty < Math.min(WORLD_H, vy1 / TILE + 2); ty++) for (let tx = Math.max(0, Math.floor(vx0 / TILE) - 1); tx < Math.min(WORLD_W, vx1 / TILE + 2); tx++) {
      const v = D[ty * WORLD_W + tx]; if (!v || RT.has(tx + ',' + ty) || PT.has(tx + ',' + ty) || YT.has(tx + ',' + ty)) continue; // no weeds on streets / paved city blocks
      const nn = nodeOnTile(tx, ty); if (nn && nodeStatus(s, nn) !== 'gone') continue;
      spr(ctx, DECOR_LIST[v - 1], (tx + .5) * TILE + Math.round((hash(tx, ty, 7) - .5) * 6), (ty + 1) * TILE - 1);
    } }
  // v0.25 front yards: a short stepping-stone path from every front door down to the lane (the rest stays lawn)
  // v0.29 a real path piece (8 stone designs in the camp/village, 8 concrete walkways from อำเภอ up), picked per house
  for (const p of s.placed) if ((p.type === 'cottage' || p.type === 'workshop') && (p.level >= 1 || p.status === 'building')) {
    const x = (p.tx + 2) * TILE, y = (p.ty + 3) * TILE; if (x < vx0 - 30 || x > vx1 + 30 || y < vy0 - 20 || y > vy1 + 40) continue;
    const name = `pf_path_${(s.town?.stage || 0) >= 2 ? 'concrete' : 'stone'}_${1 + Math.floor(hash(p.tx, p.ty, 29) * 8)}`;
    if (!spr(ctx, name, x, y - 2 + ART10[name]?.[1])) drawDecal(ctx, 'stones', x - 8, y, 16, 16, (p.tx * 32) % 128);
  }
  // plots: stakes + rope (always visible so the player knows where to clear)
  const stakes = (x, y, w, h, open) => {
    ctx.globalAlpha = open ? 1 : .45;
    ctx.strokeStyle = open ? '#ffe27acc' : '#e8e2cc88'; ctx.lineWidth = 1; ctx.setLineDash(open ? [3, 3] : [2, 4]); ctx.strokeRect(x + .5, y + .5, w - 1, h - 1); ctx.setLineDash([]);
    if (open) { ctx.fillStyle = '#ffe27a1c'; ctx.fillRect(x, y, w, h); }
    for (const [cx, cy] of [[x, y], [x + w - 3, y], [x, y + h - 3], [x + w - 3, y + h - 3]]) { rect(cx, cy - 6, 3, 9, '#7a5233'); if (open) rect(cx, cy - 7, 3, 2, '#ffd34d'); }
    ctx.globalAlpha = 1;
  };
  for (const id of ['home', 'farm', 'market', 'hall']) {
    const site = s.publicSites[id]; if (site.status !== 'none') continue;
    const r = plotRect(id);
    stakes(r.tx * TILE, r.ty * TILE, r.w * TILE, r.h * TILE, publicUnlocked(s, id));
  }
  // private plan slots: open = yellow stakes, next tier = faint preview of how the village will grow
  for (const T of TIERS.slice(0, tierOf(s) + 1)) for (const sl of T.slots) {
    if (sl.kind === 'public' || slotState(s, sl).state !== 'empty') continue;
    const b = BUILDINGS[sl.kind];
    stakes(sl.tx * TILE, sl.ty * TILE, b.width * TILE, b.height * TILE, T.tier <= tierOf(s));
  }
  if (G.build) {
    ctx.strokeStyle = '#b8ff9acc'; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc((CENTER.x + .5) * TILE, (CENTER.y + .5) * TILE, villageRadius(s) * TILE, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  }

  // ---- collect y-sorted objects in view
  const list = [];
  const add = (y, draw, box, sh) => list.push({ y, draw, box, sh });
  const P = s.player;
  const ptx0 = Math.max(0, Math.floor(vx0 / TILE) - 3), ptx1 = Math.min(WORLD_W - 1, Math.ceil(vx1 / TILE) + 3);
  const pty0 = Math.max(0, Math.floor(vy0 / TILE) - 1), pty1 = Math.min(WORLD_H - 1, Math.ceil(vy1 / TILE) + 5);
  for (let ty = pty0; ty <= pty1; ty++) for (let tx = ptx0; tx <= ptx1; tx++) {
    const n = nodeOnTile(tx, ty); if (!n) continue;
    const st = nodeStatus(s, n); if (st === 'gone') continue;
    const x = (n.x + .5) * TILE, y = (n.y + 1) * TILE - 2;
    if (n.type === 'wood') {
      const sp = treeSpecies(n);
      if (st === 'stump') { add(y, () => { if (!spr(ctx, 'stump_' + sp, x, y + 3)) { rect(x - 5, y - 6, 10, 6, '#7a4f2e'); rect(x - 4, y - 7, 8, 2, '#c99c64'); } }); continue; }
      const [w, h] = ART10['tree_' + sp] || [44, 70], hits = Number(nodeState(s, n.id)) || 0;
      const sway = 0; // v0.19: trees stand still (sway turned off on request)
      add(y, () => {
        if (prof.shadow) groundShadow(x, y + 1, Math.min(40, w * .7), 5);
        const shake = hits && G.now % 1 < .15 ? 1 : 0;
        if (!spr(ctx, 'tree_' + sp, x + sway + shake, y + 4)) { rect(x - 3, y - 14, 6, 14, '#87583c'); rect(x - 14, y - 40, 28, 28, '#438d42'); }
        if (hits) { rect(x - 4, y - 9, 8, 2, '#f2d39b'); }
      }, { x0: x - w / 2 + 4, x1: x + w / 2 - 4, y0: y - h + 6, y1: y - 10 }, { name: 'tree_' + sp, cx: x, by: y + 2 });
    } else {
      const hits = Number(nodeState(s, n.id)) || 0;
      add(y, () => { if (!spr(ctx, rockSprite(n, hits), x, y + 3)) rect(x - 10, y - 10, 20, 10, '#8a8d8f'); }, null, { name: rockSprite(n, hits), cx: x, by: y + 1 });
    }
  }
  for (const pr of PROPS) {
    if (pr.x < ptx0 || pr.x > ptx1 || pr.y < pty0 || pr.y > pty1) continue;
    if (inVillageUse(pr.x, pr.y)) continue; // wild bushes/logs are cleared where the village uses the land
    const x = (pr.x + .5) * TILE, y = (pr.y + 1) * TILE;
    if (pr.kind === 'bush') add(y - 3, () => { if (ready('bush_' + pr.v)) ctx.drawImage(art['bush_' + pr.v], x - 12, y - 22, 24, 25); });
    else add(y - 4, () => { if (ready('log')) ctx.drawImage(art.log, x - 18, y - 14, 36, 18); });
  }
  // leader house, tents and camp props
  { const r = LEADER_HOUSE, cx = (r.tx + r.w / 2) * TILE, y = (r.ty + r.h) * TILE + 6, name = leaderHouseFrame(stage), [w, h] = ART10[name];
    add(y - 6, () => { if (prof.shadow) groundShadow(cx, y - 4, w * .95, 9); spr(ctx, name, cx, y); }, { x0: cx - w / 2 + 6, x1: cx + w / 2 - 6, y0: y - h, y1: y - 22 }, { name, cx, by: y - 4 }); }
  { const wf = waterfallSpot(); if (wf && wf.x * TILE > vx0 - 60 && wf.x * TILE < vx1 + 60 && wf.y * TILE < vy1 + 100) { const f = prof.animatedWater ? Math.floor(G.now * 7) % 4 : 0; add(wf.y * TILE + 8, () => spr(ctx, 'waterfall_' + f, wf.x * TILE, wf.y * TILE + 12)); } }
  // claimed-but-unbuilt house plots: the owner's tent sits on the land while they save up
  for (const sl of openSlots(s)) {
    if (sl.kind !== 'cottage' || !s.homes?.[sl.id] || slotState(s, sl).state !== 'empty') continue;
    const x = (sl.tx + 2) * TILE, y = (sl.ty + 3) * TILE; add(y - 2, () => spr(ctx, 'pc_tent_small', x, y));
  }
  // village props (camp, plaza, farm, pens, bridge) — see src/villageProps.js
  for (const p of villageProps(s)) {
    const x = p.x * TILE, y = p.y * TILE; if (x < vx0 - 80 || x > vx1 + 80 || y < vy0 - 20 || y > vy1 + 90) continue;
    const name = p.anim ? `${p.name}_${Math.floor(G.now * 8 + p.x) % p.anim}` : p.name, sz = ART10[name] || [16, 16];
    add(p.flat ? y - 40 : y - 1, () => { if (prof.shadow && !p.flat && sz[0] > 18 && !p.rot) groundShadow(x, y - 1, sz[0] * (p.big ? 1.02 : .9), p.big ? 10 : 4);
      if (p.rot || p.flip) { const k = p.scale || 1, pv = p.pivot || 0; ctx.save(); ctx.translate(x, y - pv); if (p.rot) ctx.rotate(p.rot * Math.PI / 180); if (p.flip) ctx.scale(-1, 1); spr(ctx, name, 0, pv, k); ctx.restore(); } // v0.28 rotated / mirrored props from the Map Maker
      else spr(ctx, name, x, y, p.scale || 1); },
      sz[1] > 34 && !p.flat ? { x0: x - sz[0] / 2 + 4, x1: x + sz[0] / 2 - 4, y0: y - sz[1], y1: y - 10 } : null, p.flat ? null : { name, cx: x, by: y - (p.big ? 4 : 1) });
  }
  // animals
  for (const a of G.animals || []) {
    if (a.x < vx0 - 40 || a.x > vx1 + 40 || a.y < vy0 - 10 || a.y > vy1 + 40) continue;
    add(a.y, () => {
      const f = a.mode === 'eat' ? 3 : a.mode === 'walk' ? 1 + (Math.floor(a.dist / 5) % 2) : 0, name = `an_${a.kind}_${f}`, sz = ART10[name]; if (!sz) return;
      if (prof.shadow) groundShadow(a.x, a.y, sz[0] * .8, 3);
      if (a.facing > 0) { ctx.save(); ctx.translate(Math.round(a.x * 2) / 2, 0); ctx.scale(-1, 1); spr(ctx, name, 0, a.y + 1); ctx.restore(); } else spr(ctx, name, a.x, a.y + 1);
    });
  }
  // public buildings
  for (const id of Object.keys(PROJECTS)) {
    const site = s.publicSites[id]; if (site.status === 'none') continue;
    const r = plotRect(id), cx = (r.tx + r.w / 2) * TILE, by = (r.ty + r.h - 1) * TILE;
    if (id === 'farm') { add(-1e9, () => drawFarm(r, site)); continue; }
    const kind = id === 'home' ? 'house' : id, name = buildingFrame(kind, site, progressOf(site)), [w, h] = ART10[name], bottom = (r.ty + r.h) * TILE + 2;
    add(by, () => { if (prof.shadow) groundShadow(cx, bottom - 4, w * .95, 10); spr(ctx, name, cx, bottom); }, { x0: cx - w / 2 + 8, x1: cx + w / 2 - 8, y0: bottom - h, y1: bottom - 30 }, { name, cx, by: bottom - 6 });
  }
  // private buildings
  for (const p of s.placed) {
    const b = BUILDINGS[p.type]; if (!b) continue;
    const x = p.tx * TILE, y = p.ty * TILE, w = b.width * TILE, h = b.height * TILE, built = p.level >= 1;
    if (p.type === 'path') { add(-1e9, () => { const t = art['v10/' + roadTexture(stage)]; if (built && t?.naturalWidth) texTile(t, x, y, x, y); else rect(x, y, w, h, built ? '#b9ad9a' : '#cbb68f88'); }); continue; }
    if (p.type === 'fence') {
      const mat = FENCE_MATERIALS[Math.max(0, Math.min(4, (p.upgradingTo || p.level || 1) - 1))], horiz = fenceAt(p.tx - 1, p.ty) || fenceAt(p.tx + 1, p.ty);
      add(y + h - 2, () => { if (!built || p.status === 'building') ctx.globalAlpha *= .55; spr(ctx, `fence_${mat}_${horiz ? 'line' : 'post'}`, x + TILE / 2, y + TILE + 1, horiz ? 0.85 : 1); ctx.globalAlpha = 1; });
      continue;
    }
    if (p.type === 'cottage') {
      const cap = (s.town?.stage || 0) + 1, cf = cottageFrame(p.level > cap ? { ...p, level: cap, upgradingTo: undefined } : p, progressOf(p)), name = cf.name, [sw, sh] = ART10[name] || [80, 70], cx = x + w / 2;
      add(y + h, () => { if (prof.shadow) groundShadow(cx, y + h, sw * .95, 8); sprFlip(ctx, name, cx, y + h + 3, cf.flip); }, { x0: cx - sw / 2 + 4, x1: cx + sw / 2 - 4, y0: y + h + 3 - sh, y1: y + h - 14 }, { name, cx, by: y + h, flip: cf.flip });
      continue;
    }
    add(y + h - (p.type === 'lamp' ? 2 : 0), () => {
      if (!built) { rect(x, y + h - 6, w, 6, '#b08d5f88'); drawScaffold(x, y - h * .3, w, h * 1.2, progressOf(p)); return; }
      switch (p.type) {
        case 'garden': {
          const soil = art['v10/tx_farm_' + (p.level >= 2 ? 1 : 0)];
          rect(x, y, w, h, '#6e4c2e');
          if (soil?.naturalWidth) for (let ty = 0; ty < b.height; ty++) for (let tx = 0; tx < b.width; tx++) texTile(soil, tx * TILE, ty * TILE, x + tx * TILE, y + ty * TILE);
          const stg = cropStage(p.plantedAt === null ? -1 : gardenProgress(G.state, p)), crop = cropFor(p.uid);
          if (stg >= 0) for (let r = 0; r < b.height; r++) for (let c = 0; c < b.width; c++) spr(ctx, `crop_${crop}_${stg}`, x + (c + .5) * TILE, y + (r + 1) * TILE + 1, 0.95);
          break;
        }
        case 'bench': rect(x + 3, y + 3, w - 6, 5, '#9b5f38'); rect(x + 3, y + 9, w - 6, 4, '#c38a56'); rect(x + 5, y + 13, 3, 3, '#5d3a22'); rect(x + w - 8, y + 13, 3, 3, '#5d3a22'); break;
        case 'lamp': rect(x + 7, y - 14, 3, 30, '#5d3a2c'); rect(x + 3, y - 22, 11, 10, '#3d2a22'); rect(x + 4, y - 21, 9, 8, G.state.gameTime / 3600 >= 18 || G.state.gameTime / 3600 < 6 ? '#ffe08a' : '#f0c76a'); break;
        case 'workshop': if (!spr(ctx, `bz_work_${Math.min(4, (p.level || 0) + 1)}`, x + w / 2, y + h + 2)) { if (ready('workshop')) ctx.drawImage(art.workshop, x - 6, y - h * .75, w + 12, h * 1.75); else rect(x, y, w, h, '#8f6d4f'); } break;
      }
      if (p.status === 'building') drawScaffold(x, y - h * .2, w, h, progressOf(p));
    }, ['workshop', 'cottage'].includes(p.type) ? { x0: x, x1: x + w, y0: y - h * .8, y1: y + h - 10 } : null);
  }
  // people
  const unlocked = allUnlocked(s);
  const JOB_OUTFITS = ['farmer', 'builder', 'trader', 'civil', 'leader', 'police', 'thief'];
  for (const n of G.npcs) {
    if (n.hidden || n.x < vx0 - 40 || n.x > vx1 + 40 || n.y < vy0 - 10 || n.y > vy1 + 60) continue;
    add(n.y, () => {
      if (prof.shadow) shadow(n.x, n.y - groundLift(s, n.x, n.y));
      const sw = n.swing > 0 ? Math.sin(n.swing * 40) * 1.2 : 0;
      const dist = prof.npcAnimFps < 8 ? Math.floor(n.animDist / (RIG_STRIDE * 2)) * RIG_STRIDE * 2 : n.animDist; // low = fewer distinct frames
      drawCharacter(ctx, n.def.look, n.x + sw, n.y - groundLift(s, n.x, n.y), n.facing, n.walking, dist, JOB_OUTFITS);
    }, null, { char: true, cx: n.x, by: n.y });
  }
  const playerBox = { x0: P.x - 10, x1: P.x + 10, y0: P.y - HEAD_Y, y1: P.y - 2 };
  add(P.y + .1, () => {
    if (prof.shadow) shadow(P.x, P.y - groundLift(s, P.x, P.y));
    const sw = G.swing > 0 ? Math.sin(G.swing * 45) * 1.5 : 0;
    drawCharacter(ctx, playerAppearance(), P.x + sw, P.y - groundLift(s, P.x, P.y), G.facing, G.walking, G.animDist, unlocked, true);
  }, null, { char: true, cx: P.x, by: P.y });
  if (G.swing > 0) G.swing -= 1 / 60;
  list.sort((a, b) => a.y - b.y);
  // sun shadows first, all on the ground under every object
  const sun = prof.shadow ? sunAt(s.gameTime / 3600) : null;
  if (sun && sun.alpha > .01) {
    if (!shadowLayer || shadowLayer.width !== canvas.width || shadowLayer.height !== canvas.height) { shadowLayer = document.createElement('canvas'); shadowLayer.width = canvas.width; shadowLayer.height = canvas.height; }
    const g = shadowLayer.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, shadowLayer.width, shadowLayer.height);
    g.setTransform(ctx.getTransform()); g.imageSmoothingEnabled = false; g.fillStyle = '#0d1a10';
    for (const o of list) if (o.sh) castShadow(g, sun, o.sh);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = sun.alpha; ctx.drawImage(shadowLayer, 0, 0); ctx.restore();
  }
  // see-through: anything tall drawn in front of the player that overlaps them becomes translucent
  for (const o of list) {
    const covers = o.box && o.y > P.y && o.box.x0 < playerBox.x1 && o.box.x1 > playerBox.x0 && o.box.y0 < playerBox.y1 && o.box.y1 > playerBox.y0;
    if (covers) ctx.globalAlpha = 0.42;
    o.draw();
    if (covers) ctx.globalAlpha = 1;
  }
  // effects (wood chips, dust, falling leaves)
  for (const e of G.effects) {
    const a = Math.max(0, e.t);
    for (let i = 0; i < 6; i++) {
      const ang = i * 1.05 + e.x, r = (0.6 - a) * 30;
      ctx.fillStyle = e.kind === 'dust' ? '#d6d1c4' : e.kind === 'fall' ? (i % 2 ? '#6fb34a' : '#9fd36a') : '#e3b071';
      ctx.fillRect(Math.round(e.x + Math.cos(ang) * r), Math.round(e.y + Math.sin(ang) * r * .6 + (0.6 - a) * 14), 2, 2);
    }
  }
  // build preview ghost
  if (G.build && G.build.tx !== null) {
    const b = BUILDINGS[G.build.type], ok = G.build.check?.ok;
    const x = G.build.tx * TILE, y = G.build.ty * TILE, w = b.width * TILE, h = b.height * TILE;
    ctx.fillStyle = ok ? 'rgba(110,235,120,.32)' : 'rgba(250,90,70,.36)'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = ok ? '#d7ffc4' : '#ffb19f'; ctx.lineWidth = 1.5; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
    ctx.globalAlpha = .55;
    if (G.build.type === 'cottage') { const cf = cottageFrame({ tx: G.build.tx, ty: G.build.ty, status: 'done', level: 1 }); sprFlip(ctx, cf.name, x + w / 2, y + h + 3, cf.flip); }
    else if (G.build.type === 'fence') spr(ctx, 'fence_bamboo_post', x + TILE / 2, y + TILE + 1);
    else if (G.build.type === 'workshop' && ready('workshop')) ctx.drawImage(art.workshop, x - 6, y - h * .75, w + 12, h * 1.75);
    ctx.globalAlpha = 1;
    for (let ty = 0; ty < b.height; ty++) for (let tx = 0; tx < b.width; tx++) { ctx.strokeStyle = '#ffffff40'; ctx.strokeRect(x + tx * TILE + .5, y + ty * TILE + .5, TILE - 1, TILE - 1); }
  }

  // day/night: sky tint + light map (lamps, campfire, lit windows, player lantern) — src/ui/lighting.js
  const hour = s.gameTime / 3600, lights = [];
  if (prof.nightLights && skyAt(hour).dark > .01) {
    const L = (wx, wy, r, a, warm = true, dot = false) => { const p = toScreen(wx, wy); lights.push({ x: p.x, y: p.y, r: r * scale, a, warm, dot }); };
    const flick = 1 + Math.sin(G.now * 11) * .05 + Math.sin(G.now * 17.3) * .04;
    for (const p of villageProps(s)) {
      if (p.light) { p.anim ? L(p.x * TILE, (p.y - .5) * TILE, 80 * flick, 1) : L(p.x * TILE, (p.y - (p.name === 'cp_lamp' ? 1.6 : 2.6)) * TILE, p.street ? 64 : 52, .95); continue; }
      // v0.29 lit windows: a few on a house, many on a tower; they come on through the evening and twinkle
      const A = ART10[p.name]; if (!A || p.flat || !/^(cb_|cd_|bz_|sh_|po_|hz|hs|market_|hall_|house_|leader_|bs_|gt_)/.test(p.name)) continue;
      const sc = p.scale || 1, w = A[0] * sc, h = A[1] * sc, n = Math.max(1, Math.min(16, Math.round(w * h / 1500))), cx = p.x * TILE, by = p.y * TILE;
      for (let i = 0; i < n; i++) {
        const seed = Math.floor(p.x * 7 + p.y * 13) * 31 + i;
        if (!windowLit(hour + (n > 6 ? .6 : 0), seed)) continue; // offices / towers stay lit a little later
        const wx = cx + (hash(seed, 1, 3) - .5) * w * .7, wy = by - h * (.22 + hash(seed, 2, 5) * .6), tw = .55 + .3 * Math.sin(G.now * (1.3 + hash(seed, 4, 7) * 2.2) + seed);
        L(wx, wy, 16 + hash(seed, 5, 9) * 10, tw, true, true);
      }
    }
    for (const p of s.placed) {
      if (p.type === 'lamp' && p.level >= 1) L((p.tx + .5) * TILE, p.ty * TILE - 16, 56 + p.level * 14, .95);
      if (p.type === 'cottage' && p.level >= 1 && windowLit(hour, p.tx * 31 + p.ty)) L((p.tx + 2) * TILE, (p.ty + 2.2) * TILE, 34, .75);
      if (p.type === 'workshop' && p.level >= 1 && windowLit(hour, 77)) L((p.tx + 2) * TILE, (p.ty + 1.5) * TILE, 44, .7);
    }
    if (windowLit(hour, 1)) L((LEADER_HOUSE.tx + LEADER_HOUSE.w / 2) * TILE, (LEADER_HOUSE.ty + 1.5) * TILE, 58, .85);
    for (const id of ['home', 'market', 'hall']) if (s.publicSites[id]?.level >= 1 && windowLit(hour, id.length * 13)) { const r = plotRect(id); L((r.tx + r.w / 2) * TILE, (r.ty + r.h - 2) * TILE, 64, .8); }
    L(P.x, P.y - 10, 42, .5, false); // the player's own lantern so the way stays visible
  }
  drawLighting(ctx, canvas.width, canvas.height, hour, lights, prof.nightLights);
  if (prof.particles && (hour >= 19 || hour < 5)) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let i = 0; i < prof.particles; i++) {
      const px = ((i * 97 + Math.sin(G.now * .8 + i) * 18) % canvas.width + canvas.width) % canvas.width;
      const py = ((i * 61 + Math.cos(G.now * .6 + i * 2) * 14) % canvas.height + canvas.height) % canvas.height;
      ctx.fillStyle = i % 2 ? '#fff2a8' : '#d8ffcf'; ctx.fillRect(px, py, 2 * k, 2 * k);
    }
  }
  drawScreenOverlays(prof);
}

// ----------------------------------------------------------------- screen-space UI on the canvas
function toScreen(x, y) { const p = worldToScreen(G.cam, x, y, G.cssW, G.cssH); return { x: p.x * k, y: p.y * k }; }
function tag(text, x, y, bg = '#1d3b31e8', fg = '#fff6da') {
  ctx.font = `bold ${Math.round((G.cssH <= 360 ? 9 : 11) * k)}px Tahoma, sans-serif`; // smaller labels on short landscape phones
  const w = ctx.measureText(text).width + 10 * k, h = (G.cssH <= 360 ? 13 : 16) * k;
  ctx.fillStyle = bg; ctx.fillRect(Math.round(x - w / 2), Math.round(y - h), Math.round(w), Math.round(h));
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y - h / 2 + k);
}
function bar(x, y, w, prog) { rect(x - w / 2, y, w, 6 * k, '#2b1d10'); rect(x - w / 2 + k, y + k, (w - 2 * k) * prog, 4 * k, '#8fdc6a'); }
function drawScreenOverlays(prof) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const s = G.state, P = s.player, z = G.cam.zoom / 2;
  // plot labels: what still needs clearing
  for (const id of ['home', 'farm', 'market', 'hall']) {
    if (s.publicSites[id].status !== 'none') continue;
    const r = plotRect(id), c = { x: (r.tx + r.w / 2) * TILE, y: r.ty * TILE };
    if (Math.hypot(c.x - P.x, c.y + r.h * 8 - P.y) > 200) continue;
    const left = plotObstacles(s, id).length, sp = toScreen(c.x, c.y);
    if (!publicUnlocked(s, id)) { tag(`🔒 ${PROJECTS[id].name} · ผังระดับ ${publicTier(id)}`, sp.x, sp.y - 2 * k, '#3b3b3bc8'); continue; }
    tag(left ? `🪓 ${PROJECTS[id].name}: ถางอีก ${left} จุด` : `✅ ${PROJECTS[id].name}: ที่ดินพร้อม`, sp.x, sp.y - 2 * k, left ? '#6b4426e8' : '#2f6b3ae8');
  }
  for (const sl of openSlots(s)) {
    if (sl.kind === 'public' || slotState(s, sl).state !== 'empty') continue;
    const b = BUILDINGS[sl.kind], c = { x: (sl.tx + b.width / 2) * TILE, y: sl.ty * TILE };
    if (Math.hypot(c.x - P.x, c.y + 24 - P.y) > 170) continue;
    const left = slotObstacles(s, sl, b.width, b.height).length, sp = toScreen(c.x, c.y);
    const h = s.homes?.[sl.id];
    if (sl.kind === 'cottage' && h && h.owner !== 'player') { tag(`🏕️ ที่ดินของ${h.name} · เก็บเงิน ${h.savings}/${BUILDINGS.cottage.coins}`, sp.x, sp.y - 2 * k, '#2f5b6be8'); continue; }
    if (sl.kind === 'cottage' && !h) { tag(`🏡 ${sl.name}: ว่าง · แตะเพื่อจอง`, sp.x, sp.y - 2 * k, '#8a6a12e8'); continue; }
    tag(left ? `🪓 ${h?.owner === 'player' ? 'บ้านของฉัน' : sl.name}: ถางอีก ${left} จุด` : `🏗️ ${h?.owner === 'player' ? 'บ้านของฉัน' : sl.name}: แตะเพื่อสร้าง`, sp.x, sp.y - 2 * k, left ? '#6b4426e8' : '#8a6a12e8');
  }
  const sites = [...Object.keys(s.publicSites).map(id => findStructure(s, id)), ...s.placed.map(p => findStructure(s, p.uid))];
  for (const t of sites) {
    if (t.obj.status !== 'building') continue;
    const [tx, ty] = structurePos(s, t.id);
    const sp = toScreen((tx + .5) * TILE, (ty - (t.kind === 'public' ? 7 : BUILDINGS[t.type].height + 1.5)) * TILE);
    tag(`🔨 ${t.name} ${Math.floor(progressOf(t.obj) * 100)}%`, sp.x, sp.y - 2 * k, '#5a3f1ee8');
    bar(sp.x, sp.y + k, 70 * k, progressOf(t.obj));
  }
  const job = jobTarget(s);
  if (job?.tile) {
    const wx = (job.tile[0] + .5) * TILE, wy = (job.tile[1] + .5) * TILE, sp = toScreen(wx, wy);
    const bob = Math.sin(G.now * 5) * 3 * k;
    ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.moveTo(sp.x, sp.y - 6 * k + bob); ctx.lineTo(sp.x - 7 * k, sp.y - 18 * k + bob); ctx.lineTo(sp.x + 7 * k, sp.y - 18 * k + bob); ctx.fill();
    tag('📍 ' + job.label, sp.x, sp.y - 20 * k + bob, '#3d7fb0ee');
    const pp = toScreen(P.x, P.y - 30), d = Math.hypot(sp.x - pp.x, sp.y - pp.y);
    if (d > 120 * k) { const a = Math.atan2(sp.y - pp.y, sp.x - pp.x); ctx.save(); ctx.translate(pp.x + Math.cos(a) * 34 * k, pp.y + Math.sin(a) * 34 * k); ctx.rotate(a); ctx.fillStyle = '#ffd34dee'; ctx.beginPath(); ctx.moveTo(10 * k, 0); ctx.lineTo(-6 * k, -7 * k); ctx.lineTo(-6 * k, 7 * k); ctx.fill(); ctx.restore(); }
  }
  const near = G.build ? null : nearestInteractable();
  G.near = near;
  if (near) {
    const sp = toScreen(near.x, near.y);
    ctx.strokeStyle = '#ffe7a6'; ctx.lineWidth = 1.5 * k; ctx.beginPath(); ctx.ellipse(sp.x, sp.y, 10 * k * z, 4 * k * z, 0, 0, Math.PI * 2); ctx.stroke();
    if (prof.labels || near.kind !== 'npc') tag(near.name, sp.x, sp.y - (near.kind === 'npc' ? 42 : near.kind === 'wood' ? 62 : 24) * z * k);
  }
  const pp = toScreen(P.x, P.y - HEAD_Y);
  tag(s.character?.name || s.player.name, pp.x, pp.y, '#244a3ae0', '#ffe9a8');
  for (const n of G.npcs) if (!n.hidden && n.bubble?.t > 0 && n.bubble.txt && Math.hypot(n.x - P.x, n.y - P.y) < 260) { // emoji speech bubbles
    const q = toScreen(n.x, n.y - HEAD_Y - 6); ctx.font = `${Math.round(13 * k)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fffaf0f0'; ctx.beginPath(); ctx.arc(q.x, q.y, 10 * k, 0, Math.PI * 2); ctx.fill(); ctx.fillText(n.bubble.txt, q.x, q.y + k);
  }
  if (prof.labels) for (const n of G.npcs) if (n !== near?.npc && !n.hidden && Math.hypot(n.x - P.x, n.y - P.y) < 70) { const q = toScreen(n.x, n.y - HEAD_Y); tag(n.def.name, q.x, q.y, '#00000080'); }
}

/** Small portrait of the player for the HUD avatar. */
export function drawPortrait(c, appearance, unlocked) {
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.clearRect(0, 0, c.width, c.height);
  const sheet = rigAtlasReady(appearance, { urgent: true }); if (!sheet) return;
  g.drawImage(sheet, 20, 10, 40, 40, 0, 0, c.width, c.height);
}

/** Start-screen banner: "from forest to nation" — the same sprites the game uses, at native (2x) resolution. */
export function drawStartArt(c) {
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  g.setTransform(2, 0, 0, 2, 0, 0);
  const W = c.width / 2, H = c.height / 2, grass = art['v10/tx_grass_0'], road = art['v10/tx_road_cobble'];
  g.fillStyle = '#6cae43'; g.fillRect(0, 0, W, H);
  if (grass?.naturalWidth) for (let y = 0; y < H; y += 64) for (let x = 0; x < W; x += 64) g.drawImage(grass, x, y, 64, 64);
  if (road?.naturalWidth) for (let x = 0; x < W; x += 64) g.drawImage(road, 0, 0, 128, 32, x, H - 22, 64, 16);
  const row = [['tree_pine', 14], ['tree_teak', 34], ['tree_broadleaf', 56], ['stump_broadleaf', 80], ['house_e1_s3', 112, .62], ['house_e2_s3', 168, .66], ['house_e3_s3', 228, .7],
    ['tree_coconut', 268], ['house_e4_s3', 306, .74], ['hall_e5_s3', 384, .66], ['tree_goldenshower', 448], ['tree_pinkshower', 470]];
  for (const [n, x, sc] of row) spr(g, n, x, H - 22, sc || 1);
  g.setTransform(1, 0, 0, 1, 0, 0);
}

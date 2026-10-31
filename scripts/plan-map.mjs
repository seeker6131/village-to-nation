// Auto-plan a "finished city" map from the Map Maker (buildings drawn as objects, no plot markers) into a playable
// plan that scripts/import-map.mjs understands, and write it back as a .v2nmap.json the Map Maker can open for review.
//
//   node scripts/plan-map.mjs maps/map2.v2nmap.json maps/map2.planned.v2nmap.json [--leader=x,y] [--npc1=6]
//
// Common-sense rules (the drawn map is the NATION-level end state; the game starts at the camp and grows into it):
//  • tierRows (painted levels) = the order the land opens. Nothing appears on land before it opens.
//  • houses: small ones (hz1/hz2: huts, village houses) -> NPC villager homes; bigger ones (hz3+) -> player lots.
//    Plot = the game's 4x3 house base at the bottom-centre of the drawn house. The level-1 area gets at least
//    --npc1 NPC homes (default 6) around the camp, added on free land when the drawing has fewer.
//  • leader house (the camp): --leader=x,y, else the free spot in the level-1 land closest to its houses and roads.
//  • other buildings stay as drawn and appear in their era: max(land level, building era) — e.g. district office /
//    police / fire = 3, hospital / condo / oil = 4, towers / parliament / post = 5; "_N" variants = N.
//  • a factory (bz_work) on level-1/2 land becomes the village workshop slot; others stay buildings.
//  • images imported into the Map Maker (data URLs, e.g. a GPT bridge) become game sprites assets/v10/<map>_<n>.webp
//    registered in src/maps/mapArt.js; bridges become walkable decks over the river when their level opens.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2), opt = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => a.slice(2).split('=')));
const [src, dst] = args.filter(a => !a.startsWith('--'));
const mapId = (opt.id || path.basename(dst || src).split('.')[0]).replace(/[^a-z0-9]/gi, '');
const f = JSON.parse(fs.readFileSync(src, 'utf8'));
const W = f.width, H = f.height, A = Object.fromEntries(f.assets.map(a => [a.id, a]));
const tierAt = (x, y) => Math.max(1, Math.min(5, +(f.tierRows?.[Math.max(0, Math.min(H - 1, Math.floor(y)))]?.[Math.max(0, Math.min(W - 1, Math.floor(x)))]) || 1));
const sprite = o => (A[o.asset]?.src || '').replace(/^game:/, '');
const road = (x, y) => (f.roadRows[y]?.[x] || '.') !== '.';
const water = (x, y) => /water|sea|deep/.test(f.groundKey[f.groundRows[y]?.[x]] || '');
const objTier = o => tierAt(o.x + o.fw / 2, o.y + o.fh - 1);
const ERA = [[/^cb_(police|fire|district|shophouse|bank|apartment|store|post_small)/, 3], [/^cb_(hospital|condo|province|mall)/, 4], [/^po_/, 4],
  [/^cb_(tower|parliament|post)/, 5], [/^market_e5/, 5], [/^cb_(school|temple|market)/, 2], [/_(\d)(_s\d)?$/, null]];
const era = sp => { for (const [re, t] of ERA) { const m = sp.match(re); if (m) return t ?? Math.max(1, Math.min(5, +m[1])); } return 1; };

const out = JSON.parse(JSON.stringify(f));
out.markers = (out.markers || []).filter(m => m.type !== 'npc' && m.type !== 'lot');
const keep = [], plots = [], log = [];
const occ = new Set(), mark = (x0, y0, w, h, pad = 0) => { for (let y = y0 - pad; y < y0 + h + pad; y++) for (let x = x0 - pad; x < x0 + w + pad; x++) occ.add(x + ',' + y); };
// 1) classify the drawn objects
for (const o of out.objects) {
  const a = A[o.asset], sp = sprite(o), k = a?.kind, zt = objTier(o);
  if (['tree', 'bush', 'rock'].includes(k)) { keep.push(o); continue; }
  const hz = sp.match(/^hz(\d)[a-d]_s3$/);
  if (hz || k === 'house') {
    const lv = hz ? +hz[1] : 3, type = lv <= 2 ? 'npc' : 'lot';
    plots.push({ type, x: o.x, y: o.y, w: o.fw, h: o.fh, tier: zt, label: `${type === 'npc' ? 'บ้านชาวบ้าน' : 'ที่ดินผู้เล่น'} (เดิม: ${a?.name || sp})` });
    mark(o.x, o.y, o.fw, o.fh, 1); continue;
  }
  if (/^bz_work/.test(sp) && zt <= 2 && !out.objects.some(q => q.__workshop)) { o.__workshop = true; o.tier = 2; keep.push(o); mark(o.x, o.y, o.fw, o.fh, 1); continue; }
  if (k === 'bridge') { let t = 5; for (let y = o.y; y < o.y + o.fh; y++) for (let x = o.x; x < o.x + o.fw; x++) t = Math.min(t, tierAt(x, y)); o.tier = t; keep.push(o); continue; } // a bridge opens with the lowest land it touches
  o.tier = Math.max(zt, era(sp));
  keep.push(o); mark(o.x, o.y - 4, o.fw, o.fh + 4, 1); // + the sprite above its base
}
// 2) images that only live in the Map Maker -> game sprites
const artFile = 'src/maps/mapArt.js';
const ART = fs.existsSync(artFile) ? JSON.parse(fs.readFileSync(artFile, 'utf8').match(/= (\{.*\});/s)[1]) : {};
let n = 0;
for (const a of out.assets) {
  if (!(a.src || '').startsWith('data:') || !out.objects.some(o => o.asset === a.id)) continue;
  const name = `${mapId}_${a.kind || 'art'}_${++n}`, o = out.objects.find(q => q.asset === a.id);
  const tmp = `/tmp/${name}.png`; fs.writeFileSync(tmp, Buffer.from(a.src.split(',')[1], 'base64'));
  const wWorld = Math.round(o.tw * 16); // drawn width in the map = world px
  const dims = JSON.parse(execFileSync('python3', ['-c', `
import sys, json, numpy as np
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGBA'); a = np.array(im).astype(int)
r, g, b, al = a[...,0], a[...,1], a[...,2], a[...,3]
pink = (r > 120) & (b > 90) & (g < r - 45) & (b > g + 30)          # magenta halo left by the background key
a[..., 3] = np.where(pink | (al < 128), 0, 255)
im = Image.fromarray(a.astype('uint8'), 'RGBA')
W = int(sys.argv[2]) * 2; Hh = round(im.height * W / im.width)
im = im.resize((W, Hh), Image.NEAREST if W >= im.width else Image.LANCZOS)
al = np.array(im)[..., 3]; arr = np.array(im); arr[..., 3] = np.where(al > 127, 255, 0)
Image.fromarray(arr, 'RGBA').save(sys.argv[3], 'WEBP', lossless=True)
print(json.dumps([W / 2, Hh / 2]))`, tmp, String(wWorld), `assets/v10/${name}.webp`]).toString());
  ART[name] = dims; a.src = 'game:' + name; a.pw = dims[0]; a.ph = dims[1]; a.tw = o.tw; a.game = true;
  log.push(`🖼️ ${a.name} -> assets/v10/${name}.webp (${dims[0]}x${dims[1]} world px)`);
}
fs.writeFileSync(artFile, `// GENERATED by scripts/plan-map.mjs — sprites that came from images imported into the Map Maker (assets/v10/<name>.webp)\nexport const MAP_ART = ${JSON.stringify(ART)};\n`);
// 3) the camp (leader house) — must sit on level-1 land with room for the camp in front of it
const free = (x0, y0, w, h) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1 || tierAt(x, y) > 1 || road(x, y) || water(x, y) || occ.has(x + ',' + y)) return false; } return true; };
let leader = opt.leader ? opt.leader.split(',').map(Number) : null;
if (!leader) {
  const homes = plots.filter(p => p.tier === 1), cx = homes.length ? homes.reduce((s, p) => s + p.x, 0) / homes.length : W / 2, cy = homes.length ? homes.reduce((s, p) => s + p.y, 0) / homes.length : H / 2;
  let best = null;
  for (let y = 8; y < H - 14; y++) for (let x = 3; x < W - 12; x++) {
    if (!free(x - 2, y - 5, 11, 5 + 3 + 8)) continue; // house + sprite above + camp yard below (fire, log, board, crates)
    let rd = 99; for (let yy = y + 3; yy < y + 16 && yy < H; yy++) for (let xx = x - 4; xx < x + 11; xx++) if (road(xx, yy) || road(xx, Math.max(0, y - 8))) rd = Math.min(rd, Math.abs(yy - y));
    const score = Math.hypot(x - cx, y - cy) * .6 + rd;
    if (!best || score < best.score) best = { x, y, score };
  }
  if (!best) throw new Error('no free level-1 land for the camp — pass --leader=x,y');
  leader = [best.x, best.y];
}
const [lx, ly] = leader;
mark(lx - 2, ly - 5, 11, 16, 0);
const leaderAsset = out.assets.find(a => a.src === 'game:leader_e1_s3') || (out.assets.push({ id: 'auto_leader', name: 'บ้านผู้นำ', kind: 'building', src: 'game:leader_e1_s3', tw: 7, fw: 7, fh: 3, game: true }), out.assets[out.assets.length - 1]);
keep.push({ id: 900001, asset: leaderAsset.id, assetName: 'บ้านผู้นำ', kind: 'building', x: lx, y: ly, fw: 7, fh: 3, tw: 7, flip: false, rot: 0, tier: 1, label: 'บ้านผู้นำ (ค่ายเริ่มต้น)' });
log.push(`⛺ leader house / camp at ${lx},${ly}`);
// 3b) the village's own building plots (home, farm, market, hall) can be pinned: --pub=home:x,y;farm:x,y;...
const PUB = { home: [8, 6], farm: [9, 8], market: [10, 7], hall: [12, 8] };
out.markers = out.markers.filter(m => m.type !== 'public' || !opt.pub);
for (const pr of (opt.pub || '').split(';').filter(Boolean)) {
  const [id, xy] = pr.split(':'), [x, y] = xy.split(',').map(Number), [w, h] = PUB[id];
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (road(xx, yy) || water(xx, yy) || tierAt(xx, yy) > 1 || occ.has(xx + ',' + yy)) throw new Error(`public plot ${id} at ${x},${y} hits a road/water/building/locked land at ${xx},${yy}`);
  out.markers.push({ id: 920000 + Object.keys(PUB).indexOf(id), type: 'public', plot: id, x, y, w, h, label: id }); mark(x, y, w, h, 1);
  log.push(`🏛️ ${id} plot at ${x},${y} (${w}x${h})`);
}
// 4) enough NPC homes for the camp phase (--npcAt=x,y;x,y pins them by hand first)
for (const pr of (opt.npcAt || '').split(';').filter(Boolean)) { const [x, y] = pr.split(',').map(Number); plots.push({ type: 'npc', x, y, w: 4, h: 3, tier: tierAt(x + 2, y + 2), label: 'บ้านชาวบ้าน (เพิ่มให้ค่าย)' }); mark(x, y - 2, 4, 5, 1); }
const need = +(opt.npc1 || 6) - plots.filter(p => p.type === 'npc' && p.tier === 1).length;
if (need > 0) {
  const cand = [];
  for (let y = 4; y < H - 4; y++) for (let x = 2; x < W - 6; x++) {
    if (!free(x - 1, y - 2, 6, 6)) continue; // 4x3 base, roof above, a yard row below
    const d = Math.hypot(x + 2 - (lx + 3), y + 1 - (ly + 2)); if (d > 30) continue; // a village, not scattered huts
    let front = 0; for (let k = 0; k < 4; k++) if (road(x + k, y + 4) || road(x + k, y + 5)) front++; // faces a lane/road (south)
    cand.push({ x, y, d: d + (front >= 2 ? 0 : 9) });
  }
  cand.sort((a, b) => a.d - b.d);
  let added = 0;
  for (const c of cand) {
    if (added >= need) break;
    if (!free(c.x - 1, c.y - 2, 6, 6)) continue;
    plots.push({ type: 'npc', x: c.x, y: c.y, w: 4, h: 3, tier: 1, label: 'บ้านชาวบ้าน (เพิ่มให้ค่าย)' }); mark(c.x, c.y - 2, 4, 5, 1); added++;
  }
  log.push(`🏠 added ${added} NPC homes next to the camp (the level-1 land had ${+(opt.npc1 || 6) - need})`);
}
// 5) no trees on the camp, the plots or the buildings
out.objects = keep.filter(o => { if (!['tree', 'bush', 'rock'].includes(A[o.asset]?.kind)) return true; return !occ.has(o.x + ',' + (o.y + o.fh - 1)); });
for (const o of out.objects) delete o.__workshop;
let id = 910000;
for (const p of plots) out.markers.push({ id: id++, type: p.type, x: p.x, y: p.y, w: p.w, h: p.h, tier: p.tier, label: p.label });
out.name = (f.name || 'แมพ').replace(/ · .*$/, '') + ' (วางแผนแล้ว)';
fs.writeFileSync(dst, JSON.stringify(out));
const c = t => plots.filter(p => p.type === t).reduce((m, p) => (m[p.tier] = (m[p.tier] || 0) + 1, m), {});
console.log(log.join('\n'));
console.log('NPC homes by level', JSON.stringify(c('npc')), '· player lots by level', JSON.stringify(c('lot')));
console.log('buildings by era', JSON.stringify(out.objects.filter(o => !['tree', 'bush', 'rock'].includes(A[o.asset]?.kind)).reduce((m, o) => (m[o.tier] = (m[o.tier] || 0) + 1, m), {})));

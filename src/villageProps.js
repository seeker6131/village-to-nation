// v0.12 village dressing: the props of each plan level (camp fire -> well, rough board -> notice board, lamps,
// benches, farm tools, animal pens, a bridge over the river) placed by hand like the reference village map.
// Pure: returns a list the renderer draws and the game uses for collision. Positions are in TILES; (x, y) is the
// bottom-centre of the sprite. `block` = tiles that become solid.
import { CENTER, TENTS, POINTS, WORLD_W, WORLD_H, groundAt, T, nodeOnTile, nodeStatus, setNode, TREES, ROCKS, BRIDGES, WORLD, ORIGIN, LEADER_HOUSE, plotRect, hash } from './world.js';
import { tierOf, slotState, TIERS, roadTiles, openSlots, allLots } from './villageLayout.js';
import { cityPlan, cityKeepsTree } from './cityPlan.js';
import { ART10 } from './artManifest.js';

const P = (name, x, y, o = {}) => ({ name, x, y, ...o });
const TIER1 = [
  P('pc_fire', CENTER.x + .5, CENTER.y + 1.7, { anim: 4, only: 1, light: true }),
  P('pc_log', POINTS.study.x + .5, POINTS.study.y + 1),
  P('pc_board', POINTS.board.x + .5, POINTS.board.y + 1, { only: 1 }),
  P('pp_crates', POINTS.delivery.x + .5, POINTS.delivery.y + 1),
  P('pf_firewood', 35.3, 47.2),
  P('pf_stump_axe', 32.5, 48.6),
  P('pf_sacks', 44.6, 46.8),
  P('pf_handcart', 47.6, 49.4),
  P('fb_doghouse', 32.6, 48.4, { block: [[32, 47]] }),
  P('pf_clothesline', 34.4, 49.6),
];
const TIER2 = [
  P('pp_well', 37.5, 49.8, { block: [[37, 49], [38, 49]] }),
  P('pp_board', POINTS.board.x + .5, POINTS.board.y + 1.1),
  P('pp_lamp', 36.6, 49.4, { light: true }), P('pp_lamp', 44.4, 49.4, { light: true }), P('pp_lamp', 36.6, 54.6, { light: true }), P('pp_lamp', 44.4, 54.6, { light: true }),
  P('pp_banner', 43.6, 47.6),
  P('pp_planter', 38.6, 47.6), P('pp_pot', 36.4, 47.4), P('pp_pot', 42.6, 47.4),
  P('pp_bench', 37.4, 54.4), P('pp_bench', 43.4, 54.4),
  P('pp_signpost', 46.6, 54.2),
  P('pp_barrels', 46.4, 57.8), P('pp_crates', 57.6, 57.4),
  P('pf_stall', 59.5, 58.6),
  P('pf_scarecrow', 27.5, 45.8), P('pf_tub', 32.6, 44.6), P('pf_wateringcan', 32.4, 45.6), P('pf_wheelbarrow', 48.6, 45.4),
  P('fb_shed', 19.5, 30.4, { block: [[17, 29], [18, 29], [19, 29], [20, 29], [21, 29]] }),
  P('pf_trough', 22.2, 35.6), P('pf_hay', 16.6, 35.6),
  P('fb_coop', 26.4, 33.4, { block: [[25, 32], [26, 32], [27, 32]] }),
];
export const BUS_STOP = { x: 61, y: 54.4 }; // south side of the east road, outside the market plot
export const GATE = { x: 41, y: 75 };      // over the south road, below the village // at the east gate of every village (all 10 layouts share the village core)
export const PASTURE = { x0: 15, y0: 31, x1: 23, y1: 35 }; // tiles where cows/buffalo graze (tier 2)

let memo = { key: '', list: [] };
/** All props visible for the village's current state. */
export function villageProps(s) {
  const t = tierOf(s), built = (s.placed || []).filter(p => p.type === 'cottage' && p.level >= 1).map(p => p.uid).join(',');
  const key = `${t}|${built}|${s.world?.seed}|${s.world?.ver}|${WORLD.plan}`;
  if (memo.key === key) return memo.list;
  const list = [];
  if (WORLD.custom) { const l = customProps(s, t); if (WORLD.custom.id?.startsWith('fantasy_')) l.push(...cityPlan(t, ART10).props); streetLamps(s, t, l); memo = { key, list: l }; return memo.list; }
  for (const p of TIER1) if (!p.only || t <= p.only) list.push(p);
  if (t <= 1) for (let i = 0; i < TENTS.length; i++) list.push(P(i === 0 ? 'pc_tent' : 'pc_tent_small', TENTS[i].tx + 1, TENTS[i].ty + 2));
  if (t >= 2) list.push(...TIER2);
  // Contemporary street props and mailboxes have been retired from the fantasy world.
  list.push(...bridges(t));
  // No bus terminals, metro stations, or modern concrete gates in this kingdom.
  list.push(P('gt_bamboo', GATE.x, GATE.y, { block: [[GATE.x - 2, GATE.y - 1], [GATE.x + 1, GATE.y - 1]].map(([x, y]) => [Math.floor(x), Math.floor(y)]) }));
  if (t >= 3) list.push(...cityPlan(t, ART10).props);
  streetLamps(s, t, list);
  memo = { key, list };
  return list;
}

/** v0.29 street lights along every open road from the village era: lantern posts in the village, modern lamps from
 *  อำเภอ up. One on the verge every ~8 tiles, alternating sides, never on a road, plot, door, tree, water or prop. */
function streetLamps(s, t, list) {
  if (t < 2) return;
  const R = roadTiles(s), name = 'pp_lamp', busy = new Set(), mark = (x0, y0, w, h, pad = 1) => { for (let y = y0 - pad; y < y0 + h + pad; y++) for (let x = x0 - pad; x < x0 + w + pad; x++) busy.add(x + ',' + y); };
  for (const p of list) { for (const [x, y] of p.block || [[Math.floor(p.x), Math.floor(p.y - .01)]]) busy.add(x + ',' + y); if (/lamp/.test(p.name)) mark(Math.floor(p.x), Math.floor(p.y), 1, 1, 5); }
  for (const sl of [...openSlots(s), ...(WORLD.custom ? allLots().all : [])]) mark(sl.tx, sl.ty - 2, 4, 6, 1); // house + roof + yard
  for (const id of ['home', 'farm', 'market', 'hall']) { const r = plotRect(id); mark(r.tx, r.ty - 4, r.w, r.h + 4, 1); }
  mark(LEADER_HOUSE.tx, LEADER_HOUSE.ty - 6, LEADER_HOUSE.w, LEADER_HOUSE.h + 9, 1);
  for (const id of ['camp', 'board', 'study', 'delivery']) mark(POINTS[id].x, POINTS[id].y, 1, 1, 2);
  const out = [], near = (x, y) => out.some(([a, b]) => Math.abs(a - x) + Math.abs(b - y) < 7);
  for (const k of R) {
    const [x, y] = k.split(',').map(Number);
    const horiz = R.has(x - 1 + ',' + y) || R.has(x + 1 + ',' + y), vert = R.has(x + ',' + (y - 1)) || R.has(x + ',' + (y + 1));
    if (horiz === vert) continue; // straight stretches only (no lamps in the middle of crossings)
    if ((horiz ? x : y) % 8) continue;
    const side = hash(horiz ? x : y, 3, 41) < .5 ? -1 : 1;
    for (const d of [side, -side]) {
      let cx = horiz ? x : x + d, cy = horiz ? y + d : y;
      while (R.has(cx + ',' + cy)) { if (horiz) cy += d; else cx += d; if (Math.abs(cx - x) + Math.abs(cy - y) > 4) break; } // wide roads: walk to the verge
      if (R.has(cx + ',' + cy) || cx < 1 || cy < 2 || cx >= WORLD_W - 1 || cy >= WORLD_H - 1 || busy.has(cx + ',' + cy) || near(cx, cy)) continue;
      const g = groundAt(cx, cy); if (g === T.WATER || g === T.FORD) continue;
      const n = nodeOnTile(cx, cy); if (n && nodeStatus(s, n) !== 'gone') continue;
      out.push([cx, cy]); busy.add(cx + ',' + cy); break;
    }
  }
  for (const [x, y] of out) list.push(P(name, x + .5, y + 1, { light: true, block: [[x, y]], street: true }));
}
/** v0.27 a Map Maker map: its own props (solid footprints) + the camp essentials in front of the leader house. */
function customProps(s, t) {
  const sh = p => ({ ...p, x: p.x + ORIGIN.x, y: p.y + ORIGIN.y, block: p.block?.map(([x, y]) => [x + ORIGIN.x, y + ORIGIN.y]) });
  const list = [];
  for (const p of TIER1.slice(0, 4)) if (!p.only || t <= p.only) list.push(sh(p)); // fire, study log, board, delivery crates (TIER1 holds the default positions)
  if (t >= 2) list.push(P('pp_board', POINTS.board.x + .5, POINTS.board.y + 1.1));
  // Contemporary street props and mailboxes have been retired from the fantasy world.
  for (const m of WORLD.custom.props) {
    if ((m.tier || 1) > t) continue; // drawn for a later era: the land waits for it
    if (m.bridge) { // the map's bridge, in this era's style, stretched over its footprint
      const hz = m.fw >= m.fh, name = bridgeSprite(t, hz), A = ART10[name];
      if (A) { const sc = hz ? m.fw * 16 / A[0] : m.fh * 16 / A[1]; list.push(P(name, m.x + m.fw / 2, hz ? m.y + m.fh / 2 + A[1] * sc / 32 : m.y + m.fh + .1, { flat: true, scale: sc, city: m.label })); continue; }
    }
    const blk = []; if (!m.bridge) for (let y = m.y; y < m.y + m.fh; y++) for (let x = m.x; x < m.x + m.fw; x++) blk.push([x, y]);
    list.push(P(m.name, m.x + m.fw / 2, m.y + m.fh + .1, { block: blk, flip: m.flip, rot: m.rot || 0, pivot: m.fh * 8 + 1.6, scale: m.scale || 1, city: m.label, ...(m.bridge ? { flat: true } : {}) })); // pivot: the footprint centre, like the Map Maker
  }
  return list;
}
/** Solid tiles from props ("x,y"). */
export function propBlocks(s) { const out = new Set(); for (const p of villageProps(s)) for (const [x, y] of p.block || []) out.add(x + ',' + y); return out; }

/** v0.18: the map's bridges are fixed (world.BRIDGES, planks over FORD tiles); kept for old callers. */
export function bridgeSpan() { return BRIDGES[0] || null; }
/** v0.29 bridges change with the era: log footbridge (camp/village) -> stone arch (อำเภอ) -> concrete road bridge (จังหวัด+). */
export const bridgeSprite = (t, horizontal = true) => `pw_br_${t <= 2 ? 'log' : 'stone'}_${horizontal ? 'h' : 'v'}`;
function bridges(t = 1) { // centred on the planked (FORD) span so the deck sits exactly over the walkable tiles
  return BRIDGES.map(b => { const xs = []; for (let x = b.x0 - 3; x <= b.x1 + 3; x++) for (let y = b.y - 1; y <= b.y + 2; y++) { const g = groundAt(x, y); if (g === T.FORD || ((g === T.WATER) && (y === b.y - 1 || y === b.y + 2))) { xs.push(x); break; } }
    const c = xs.length ? (xs[0] + xs[xs.length - 1] + 1) / 2 : (b.x0 + b.x1 + 1) / 2, span = xs.length ? xs[xs.length - 1] - xs[0] + 1 : 4;
    const name = ART10[bridgeSprite(t)] ? bridgeSprite(t) : 'pw_bridge_h', W = ART10[name][0], scale = Math.max(1, (span + 2) * 16 / W);
    return P(name, c, b.y + 1.7 + (ART10[name][1] - 40) / 32, { flat: true, walk: b, scale, deck: { x0: c - W / 2 * scale / 16, x1: c + W / 2 * scale / 16, row: b.y } }); }); // deck reaches both banks
}
/** Water tiles a bridge makes walkable ("x,y"). */
export function bridgeTiles(s) {
  const out = new Set(); for (const b of BRIDGES) for (let x = b.x0 - 3; x <= b.x1 + 3; x++) if (groundAt(x, b.y) === T.FORD) out.add(x + ',' + b.y); // only the deck row: you walk ON the bridge, not in the water under it
  if (WORLD.custom) for (const m of WORLD.custom.props) if (m.bridge && (m.tier || 1) <= tierOf(s)) for (let y = m.y; y < m.y + m.fh; y++) for (let x = m.x; x < m.x + m.fw; x++) { const g = groundAt(x, y); if (g === T.WATER || g === T.FORD) out.add(x + ',' + y); } // a bridge drawn in the Map Maker
  if (tierOf(s) >= 3) for (const k of roadTiles(s)) { const [x, y] = k.split(',').map(Number); const g = groundAt(x, y); if (g === T.WATER || g === T.FORD) out.add(k); } // city streets bridge the river
  return out;
}

/** Villagers clear trees/rocks under the props of the unlocked plans (called with openRoads). */
export function clearPropTiles(s) {
  let n = 0;
  if (tierOf(s) >= 2) for (let y = PASTURE.y0 - 4; y <= PASTURE.y1; y++) for (let x = PASTURE.x0 - 2; x <= PASTURE.x1; x++) { // pasture + cow shed yard
    const nd = nodeOnTile(x, y); if (nd && nodeStatus(s, nd) !== 'gone') { setNode(s, nd.id, 'x'); n++; }
  }
  for (const p of villageProps(s)) {
    const cells = p.block || [[Math.floor(p.x), Math.floor(p.y - .01)]];
    for (const [x, y] of cells) { const nd = nodeOnTile(x, y); if (nd && nodeStatus(s, nd) !== 'gone') { setNode(s, nd.id, 'x'); n++; } }
  }
  // a city is not a village in the woods: from อำเภอ up the forest is cleared (parks keep their trees)
  const t = tierOf(s);
  if (t >= 3 && !WORLD.custom) { // (a Map Maker map keeps its own trees and the leftover groves — the leader hires a crew for those)
    const plan = cityPlan(t, ART10);
    for (const nd of [...TREES, ...ROCKS]) if (nodeStatus(s, nd) !== 'gone' && !cityKeepsTree(t, nd.x, nd.y, plan)) { setNode(s, nd.id, 'x'); n++; }
  }
  memo.key = '';
  return n;
}
void slotState; void TIERS;

/** v0.19 height of the ground under a walker (world px) — the arched bridge deck rises towards its middle.
 *  px, py = feet position in world px. Returns how many px to lift the sprite. */
export function groundLift(s, px, py) {
  const row = Math.floor((py - 3) / 16);
  for (const p of villageProps(s)) {
    const d = p.deck; if (!d || row !== d.row) continue;
    const x0 = d.x0 * 16, x1 = d.x1 * 16; if (px < x0 || px > x1) continue;
    const t = (px - x0) / (x1 - x0);
    return Math.round((1 + Math.sin(Math.PI * Math.min(1, Math.max(0, (t - .08) / .84))) * 3.5 * p.scale) * 2) / 2; // ramps up from the banks
  }
  return 0;
}

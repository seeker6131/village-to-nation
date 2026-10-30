// Game controller: owns the shared context `G`, simulation step, movement, NPC behaviour and interaction.
// UI modules (render, panels, input, creator) read/write G; they register callbacks on G to avoid import cycles.
import { TILE, WORLD_W, WORLD_H, POINTS, blocked, nodesNear, nodeStatus, SPAWN, ensureWorld, plotRect, CENTER, VILLAGE_RADIUS, hash } from '../world.js';
import { progressTime, study, logEvent } from '../gameState.js';
import { refreshDaily } from '../systems.js';
import { tickConstruction, BUILDINGS, canPlace, placeBuilding, ensureConstruction, findStructure } from '../construction.js';
import { allNpcDefs, planFor, economyHour, economyDay, settlerArrivals, ensureTown, structurePos, population } from '../npcs.js';
import { jobTarget, workAt, ensureJobs } from '../jobs.js';
import { updateStage } from '../progression.js';
import { propBlocks, bridgeTiles, PASTURE, BUS_STOP, clearPropTiles } from '../villageProps.js';
import { homesDay, ownerOf, myHome, claimPlot } from '../housing.js';
import { SLOT_KINDS, openSlots, slotState, nearestFreeSlot, villageRadius, tierOf } from '../villageLayout.js';
import { hitNode, nodeLabel, regrowDay } from '../resources.js';
import { leadershipDay, ensureLeadership } from '../leadership.js';
import { playerNewDay } from '../economy.js';
import { tileRoute, nearestWalkable } from '../pathfinding.js';
import { outfitOf, roleOf } from '../npcLife.js';
import { crimeHour, activeThieves, arrestThief, policeOfficers, crimeTargets, NIGHT } from '../crime.js';
import { createCamera, clampCamera, defaultZoom } from './camera.js';
import { loadGame, saveGame as persist } from '../save.js';
import { sfx } from '../audio.js';
import { CHARACTER_ATLAS } from '../character/atlasData.js';

export const CHAR_SCALE = 0.5;           // rig sprite px -> world px (2x art like the buildings; ~31px tall in world)
export const OLD_CHAR_SCALE = 0.6;       // v0.8 atlas fallback
export const HEAD_Y = 34;                // feet -> just above the head (labels)
export const PLAYER_SPEED = 100;         // world px per second (v0.8 was 70)
export const RIG_STRIDE = 4.5;             // world px per rig walk frame: 8 frames = one full cycle (two steps) = 36 px
export const STRIDE = 7;                 // world px travelled per animation frame -> legs match ground speed
export const INTERACT_RANGE = 30;

export const G = {
  state: null, storage: null, cam: createCamera(), npcs: [], keys: new Set(), stick: { x: 0, y: 0, active: false },
  facing: 'down', walking: false, animDist: 0, route: [], waypoint: null, panel: null, panelArg: null, build: null,
  creatorOpen: false, now: 0, cssW: 800, cssH: 450, k: 1, dev: false, notes: [], effects: [],
  toast: () => {}, openPanel: () => {}, closePanel: () => {}, refreshPanel: () => {}, hud: () => {}, syncBuildBar: () => {}, openCreator: () => {},
};

export function initGame(storage, opts = {}) {
  G.storage = storage;
  G.dev = !!opts.dev;
  const { state, notes, fresh } = loadGame(storage);
  G.state = state; G.notes = notes; G.fresh = fresh;
  if (fresh && (opts.newSeed || opts.biome)) { if (opts.newSeed) state.world.seed = opts.newSeed; if (opts.biome) state.world.biome = opts.biome; ensureWorld(state); } // every new village gets its own map
  ensureJobs(state); ensureTown(state); refreshDaily(state); ensureWorld(state); ensureLeadership(state);
  if (!walkable(Math.floor(state.player.x / TILE), Math.floor((state.player.y - 4) / TILE))) { state.player.x = SPAWN.x; state.player.y = SPAWN.y; }
  rebuildNpcs();
  G.cam.x = state.player.x; G.cam.y = state.player.y;
  return G;
}
export function saveNow() { if (G.preview) return false; return persist(G.storage, G.syncAway ? G.syncAway() : G.state); } // never save a showcase; while visiting another town the home save is written

// ------------------------------------------------------------- collision
export function placedAt(tx, ty) {
  for (const p of G.state.placed) { const b = BUILDINGS[p.type]; if (b && tx >= p.tx && tx < p.tx + b.width && ty >= p.ty && ty < p.ty + b.height) return p; }
  return null;
}
/** Built / under-construction public buildings block their plot (minus a 1-tile border for paths). */
export function publicAt(tx, ty) {
  for (const id of ['home', 'farm', 'market', 'hall']) {
    const o = G.state.publicSites?.[id]; if (!o || o.status === 'none') continue;
    if (id === 'farm') continue; // the farm is walkable fields
    const r = plotRect(id);
    if (tx > r.tx && tx < r.tx + r.w - 1 && ty > r.ty && ty < r.ty + r.h - 2) return id;
  }
  return null;
}
let psCache = { t: -1 };
function propSets() { if (psCache.t !== G.now || psCache.s !== G.state) psCache = { t: G.now, s: G.state, block: propBlocks(G.state), bridge: bridgeTiles(G.state) }; return psCache; }
export function walkable(tx, ty) {
  const k = tx + ',' + ty, ps = propSets();
  if (ps.bridge.has(k)) return true; // planks over the river
  if (blocked(tx, ty, G.state) || ps.block.has(k)) return false;
  const p = placedAt(tx, ty);
  if (p && !BUILDINGS[p.type]?.walkable) return false;
  return !publicAt(tx, ty);
}
// feet are a small box, so the player can't squeeze diagonally between two trunks
function canStand(x, y) { return walkable(Math.floor((x - 4) / TILE), Math.floor((y - 3) / TILE)) && walkable(Math.floor((x + 4) / TILE), Math.floor((y - 3) / TILE)); }
function lineClear(ax, ay, bx, by) {
  const d = Math.hypot(bx - ax, by - ay), steps = Math.ceil(d / 6);
  for (let i = 1; i <= steps; i++) { const x = ax + (bx - ax) * i / steps, y = ay + (by - ay) * i / steps; if (!canStand(x, y)) return false; }
  return true;
}
/** Remove grid zig-zags: keep only the waypoints needed for straight, walkable lines. */
export function smoothRoute(sx, sy, route) {
  if (route.length < 3) return route;
  const out = []; let ax = sx, ay = sy, i = 0;
  while (i < route.length) {
    let j = route.length - 1;
    while (j > i && !lineClear(ax, ay, route[j].x, route[j].y)) j--;
    out.push(route[j]); ax = route[j].x; ay = route[j].y; i = j + 1;
  }
  return out;
}
function route(ax, ay, bx, by) { return smoothRoute(ax, ay, tileRoute(ax, ay, bx, by, walkable)); }

// ------------------------------------------------------------- NPC runtime
// ------------------------------------------------------------- animals (ambient life; not saved)
export function rebuildAnimals() {
  const t = tierOf(G.state), list = [{ kind: 'dog', home: { x0: CENTER.x - 6, y0: CENTER.y - 2, x1: CENTER.x + 6, y1: CENTER.y + 6 }, speed: 22 }];
  if (t >= 2) list.push({ kind: 'cow', home: PASTURE, speed: 7 }, { kind: 'cow', home: PASTURE, speed: 6 }, { kind: 'buffalo', home: PASTURE, speed: 5 });
  G.animals = list.map((a, i) => { const h = a.home, x = (h.x0 + (h.x1 - h.x0) * hash(i, 7, 3)) * TILE, y = (h.y0 + (h.y1 - h.y0) * hash(i, 9, 4)) * TILE; return { ...a, x, y, tx: x, ty: y, mode: 'idle', t: 1 + i, dist: 0, facing: -1 }; });
  G.animalTier = t;
}
function updateAnimals(dt) {
  if (G.animalTier !== tierOf(G.state)) rebuildAnimals();
  for (const a of G.animals) {
    a.t -= dt;
    if (a.mode === 'walk') {
      const dx = a.tx - a.x, dy = a.ty - a.y, d = Math.hypot(dx, dy), v = a.speed * dt;
      if (d < 1 || a.t < 0) { a.mode = hash(a.x | 0, a.y | 0, 5) < .5 && a.kind !== 'dog' ? 'eat' : 'idle'; a.t = 2 + hash(a.y | 0, a.x | 0, 6) * 4; continue; }
      const nx = a.x + dx / d * v, ny = a.y + dy / d * v;
      if (!walkable(Math.floor(nx / TILE), Math.floor(ny / TILE))) { a.mode = 'idle'; a.t = 1; continue; }
      a.x = nx; a.y = ny; a.dist += v; if (Math.abs(dx) > .5) a.facing = dx > 0 ? 1 : -1;
    } else if (a.t < 0) {
      const h = a.home, r1 = hash(Math.floor(G.now * 10), a.x | 0, 11), r2 = hash(a.y | 0, Math.floor(G.now * 10), 12);
      // the dog likes to trot over to the player now and then
      if (a.kind === 'dog' && r1 < .3) { a.tx = G.state.player.x + (r2 - .5) * 30; a.ty = G.state.player.y + 6; }
      else { a.tx = (h.x0 + (h.x1 - h.x0) * r1) * TILE; a.ty = (h.y0 + (h.y1 - h.y0) * r2) * TILE; }
      a.mode = 'walk'; a.t = 12;
    }
  }
}
// v0.22 performance: the whole population lives on in the rules (houses, money, economy), but only a sample of them
// walk around as actors at once — everyone named + an even spread of the settlers — sized by the graphics setting.
export const ACTOR_CAP = { low: 22, medium: 34, high: 48 };
export function rebuildNpcs() {
  let defs = allNpcDefs(G.state);
  const cap = ACTOR_CAP[G.settings?.quality] || 34;
  if (defs.length > cap) { const named = defs.filter(d => !d.id.startsWith('settler')), rest = defs.filter(d => d.id.startsWith('settler')), k = Math.max(0, cap - named.length); defs = named.concat(Array.from({ length: k }, (_, i) => rest[Math.floor(i * rest.length / k)])); }
  defs = defs.map(d => { const o = outfitOf(G.state, d); return o && o !== d.look?.outfit ? { ...d, look: { ...d.look, outfit: o }, role: roleOf(G.state, d) } : d; }); // uniforms for civil servants
  const old = new Map(G.npcs.map(n => [n.def.id, n]));
  G.npcs = defs.map((def, i) => {
    const o = old.get(def.id);
    if (o) { o.def = def; o.index = i; return o; }
    // appear where they would be at this hour (at home asleep, at work, at lunch...) instead of all at one camp spot
    const now = planFor(G.state, def, G.state.gameTime / 3600, i), at = now?.target || def.home;
    return { def, index: i, x: (at[0] + .5) * TILE, y: (at[1] + .5) * TILE, hidden: now?.activity === 'sleep', fresh: true, route: [], waypoint: null, planKey: '', plan: null,
      facing: 'down', walking: false, arrived: false, animDist: i * 3, speed: 34 + hash(i, 3, 5) * 14, idleT: 1 + hash(i, 1, 1) * 3, workT: 0 };
  }).concat([...old.values()].filter(n => n.def.special)); // thieves / night patrol live outside the villager list
}

// ------------------------------------------------------------- v0.17 thieves & night patrol (rules: src/crime.js)
const THIEF_LOOK = { hair: 'short', hairColor: 'black', skin: 's3', eyes: 'brown', outfit: 'thief' };
const COP_LOOKS = [{ hair: 'short', hairColor: 'black', skin: 's2', eyes: 'brown', outfit: 'police' }, { hair: 'pony', hairColor: 'black', skin: 's3', eyes: 'brown', outfit: 'police' }];
function crimeSpot(s, th) {
  if (th.kind === 'treasury') { const [tx, ty] = structurePos(s, 'market'); return [tx, ty + 1]; }
  const p = s.placed.find(q => q.uid === th.target); return p ? [p.tx + 2, p.ty + 3] : [CENTER.x, CENTER.y];
}
function specialActor(def, x, y) { return { def, index: 900 + (def.n || 0), x, y, route: [], waypoint: null, planKey: '', plan: { activity: def.special, target: [0, 0] }, facing: 'down', walking: false, arrived: false, animDist: 0, speed: 30, idleT: 1, workT: 0 }; }
function syncSpecials() {
  const s = G.state, live = activeThieves(s), hour = s.gameTime / 3600;
  // thieves: one actor per active thief, sneaking in from outside the village to the target's door
  for (const th of live) {
    const id = 'thief_' + th.id; if (G.npcs.some(n => n.def.id === id)) continue;
    const [gx, gy] = crimeSpot(s, th), a = hash(th.id, 5, 31) * Math.PI * 2;
    const sx = Math.max(2, Math.min(WORLD_W - 3, Math.round(gx + Math.cos(a) * 18))), sy = Math.max(2, Math.min(WORLD_H - 3, Math.round(gy + Math.sin(a) * 14)));
    const n = specialActor({ id, special: 'thief', crook: th.id, name: 'โจร', look: THIEF_LOOK, home: [sx, sy] }, (sx + .5) * TILE, (sy + .5) * TILE);
    n.speed = 26; n.goal = [gx, gy]; n.route = route(n.x, n.y, (gx + .5) * TILE, (gy + .5) * TILE); n.waypoint = n.route.shift() || null;
    if (!n.waypoint) { n.x = (gx + 2.5) * TILE; n.y = (gy + .5) * TILE; }
    G.npcs.push(n);
  }
  const liveIds = new Set(live.map(t => 'thief_' + t.id));
  // night patrol: volunteer watch / police officers walk the streets and head for a break-in
  const want = NIGHT(hour) ? policeOfficers(s) : 0;
  G.npcs = G.npcs.filter(n => !n.def.special || (n.def.special === 'thief' ? liveIds.has(n.def.id) : n.def.n < want));
  for (let i = 0; i < want; i++) {
    const id = 'cop_' + i; if (G.npcs.some(n => n.def.id === id)) continue;
    const name = tierOf(s) >= 3 ? 'ตำรวจ' : 'ชรบ.';
    G.npcs.push(specialActor({ id, special: 'cop', n: i, name, look: COP_LOOKS[i % 2], home: [CENTER.x, CENTER.y + 3] }, (CENTER.x + i * 2 + .5) * TILE, (CENTER.y + 4.5) * TILE));
  }
}
/** Movement for thieves (sneak to the door, then lurk) and patrol (wander between houses, rush to a break-in). */
function updateSpecial(n, dt) {
  if (n.waypoint) {
    const dx = n.waypoint.x - n.x, dy = n.waypoint.y - n.y, d = Math.hypot(dx, dy);
    if (d < 2) n.waypoint = n.route.shift() || null;
    else { const v = Math.min(d, n.speed * dt); n.x += dx / d * v; n.y += dy / d * v; n.animDist += v; n.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'); }
    n.walking = !!n.waypoint; return;
  }
  n.walking = false; n.idleT -= dt;
  if (n.idleT > 0) return;
  if (n.def.special === 'thief') { n.idleT = 1.5; n.facing = ['left', 'right', 'up'][Math.floor(hash(n.def.crook, Math.floor(G.now), 3) * 3)]; n.bubble = { txt: '👀', t: 1.2 }; return; }
  // patrol: go to the house being robbed if there is one, else a random house / street
  const s = G.state, th = activeThieves(s)[n.def.n % Math.max(1, activeThieves(s).length)];
  let goal;
  if (th) goal = crimeSpot(s, th);
  else { const ts = crimeTargets(s), pick = ts[Math.floor(hash(n.def.n, Math.floor(G.now / 9), 41) * ts.length)]; goal = pick?.tx ? [pick.tx, pick.ty + 1] : [CENTER.x + Math.round((hash(n.def.n, Math.floor(G.now), 42) - .5) * 20), CENTER.y + Math.round((hash(n.def.n, Math.floor(G.now), 43) - .5) * 14)]; }
  n.idleT = 4 + hash(n.def.n, Math.floor(G.now), 44) * 5; n.speed = th ? 46 : 28;
  if (walkable(goal[0], goal[1] + 1)) { n.route = route(n.x, n.y, (goal[0] + .5) * TILE, (goal[1] + 1.5) * TILE); n.waypoint = n.route.shift() || null; }
  if (th) n.bubble = { txt: '🚨', t: 2 };
}
const WANDER = new Set(['office', 'patrol', 'social', 'work', 'home', 'lunch', 'meeting', 'sell', 'forage', 'gather', 'relax', 'stroll', 'farm']);
const RUN_FOR = new Set(['office', 'patrol', 'build', 'farm', 'sell', 'chop', 'work', 'craft', 'gather', 'forage', 'meeting']);
const BUBBLE = { patrol: '👮', office: '📋', build: '🔨', farm: '🌾', sell: '🧺', lunch: '🍜', chop: '🪓', craft: '🪚', sleep: '💤', meeting: '🗣️', forage: '🍄', relax: '☕' };
const CHAT = ['💬', '😄', '🤣', '👋', '🙂', '💬', '❤️', '🤔'];
function updateNpcs(dt) {
  const hour = G.state.gameTime / 3600;
  syncSpecials();
  for (const n of G.npcs) {
    if (n.def.special) { updateSpecial(n, dt); if (n.bubble?.t > 0) n.bubble.t -= dt; continue; }
    const plan = planFor(G.state, n.def, hour, n.index);
    const key = plan.activity + ':' + plan.target.join(',');
    if (key !== n.planKey) {
      n.planKey = key; n.plan = plan; n.arrived = false; n.slow = false; n.hidden = false;
      if (n.fresh) { // just appeared (game start / travel / new actor): already there, doing it — nobody runs across the map
        n.fresh = false; const spot = nearestWalkable(plan.target[0], plan.target[1], walkable, 6);
        if (spot) { n.x = (spot[0] + .5) * TILE; n.y = (spot[1] + .5) * TILE; }
        n.route = []; n.waypoint = null; n.arrived = true; n.walking = false; n.bubble = { txt: '', t: 0 };
        if (plan.activity === 'sleep') n.hidden = true;
        continue;
      }
      // late for work / far away -> jog; strolling -> slow
      const distT = Math.hypot((plan.target[0] + .5) * TILE - n.x, (plan.target[1] + .5) * TILE - n.y) / TILE;
      n.run = RUN_FOR.has(plan.activity) && distT > 9; n.slow = plan.activity === 'stroll';
      n.bubble = { txt: BUBBLE[plan.activity] || '', t: BUBBLE[plan.activity] ? 2.5 : 0 };
      n.route = route(n.x, n.y, (plan.target[0] + .5) * TILE, (plan.target[1] + .5) * TILE);
      n.waypoint = n.route.shift() || null;
      const far = Math.hypot((plan.target[0] + .5) * TILE - n.x, (plan.target[1] + .5) * TILE - n.y) > 26;
      if (!n.waypoint) n.arrived = !far; // unreachable targets are not "worked" remotely
    }
    if (n.waypoint) {
      const dx = n.waypoint.x - n.x, dy = n.waypoint.y - n.y, d = Math.hypot(dx, dy);
      if (d < 2) { n.waypoint = n.route.shift() || null; if (!n.waypoint) n.arrived = n.slow || Math.hypot((plan.target[0] + .5) * TILE - n.x, (plan.target[1] + .5) * TILE - n.y) < 30; }
      else {
        const v = Math.min(d, n.speed * (n.slow ? 0.55 : n.run ? 1.9 : 1) * dt);
        n.x += dx / d * v; n.y += dy / d * v; n.animDist += v;
        n.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      }
      n.walking = !!n.waypoint;
      continue;
    }
    n.walking = false;
    if (n.bubble?.t > 0) n.bubble.t -= dt;
    // sleeping at home: people with a house go inside (disappear) until morning
    if (plan.activity === 'sleep') { n.hidden = !!G.state.placed.find(q => q.type === 'cottage' && q.owner === n.def.id && q.level >= 1) || n.def.id === 'mentor'; continue; }
    // arrived: behave like a person instead of a statue
    if (plan.activity === 'chop' || plan.activity === 'build') {
      const tx = plan.activity === 'chop' ? plan.target[0] : null;
      if (tx !== null) n.facing = 'up';
      n.workT += dt;
      if (n.workT > 0.9) { n.workT = 0; n.swing = 0.25; if (plan.activity === 'chop' && G.cam && Math.hypot(n.x - G.state.player.x, n.y - G.state.player.y) < 260) G.effects.push({ kind: 'chip', x: n.x, y: n.y - 18, t: 0.5 }); }
    } else if (plan.activity === 'sleep') { /* stays home */ }
    else if (WANDER.has(plan.activity)) {
      n.idleT -= dt;
      if (n.idleT <= 0) {
        n.idleT = 3 + hash(n.index, Math.floor(G.now), 11) * 6;
        const r = hash(n.index, Math.floor(G.now * 3), 13);
        if (r < 0.45) { // stroll to a nearby spot around the activity
          const ox = Math.round((hash(n.index, Math.floor(G.now), 17) - 0.5) * 4), oy = Math.round((hash(n.index, Math.floor(G.now), 19) - 0.5) * 3);
          const tx = plan.target[0] + ox, ty = plan.target[1] + oy;
          if (walkable(tx, ty)) { n.route = route(n.x, n.y, (tx + .5) * TILE, (ty + .5) * TILE); n.waypoint = n.route.shift() || null; n.slow = true; }
        } else n.facing = ['down', 'left', 'right', 'up', 'down'][Math.floor(r * 5) % 5]; // look around
      }
    }
    if (n.swing > 0) n.swing -= dt;
  }
  // chatting: friends who meet while socialising turn to each other and talk
  for (let i = 0; i < G.npcs.length; i++) for (let j = i + 1; j < G.npcs.length; j++) {
    const a = G.npcs[i], b = G.npcs[j];
    if (a.walking || b.walking || a.hidden || b.hidden || !['social', 'lunch', 'stroll', 'relax'].includes(a.plan?.activity) || !['social', 'lunch', 'stroll', 'relax'].includes(b.plan?.activity)) continue;
    const dx = b.x - a.x, dy = b.y - a.y; if (Math.abs(dx) > 28 || Math.abs(dy) > 14) continue;
    a.facing = dx > 0 ? 'right' : 'left'; b.facing = dx > 0 ? 'left' : 'right';
    if (!(a.bubble?.t > 0) && hash(i, j, Math.floor(G.now / 3)) < .35) { a.bubble = { txt: CHAT[(i + j + Math.floor(G.now / 3)) % CHAT.length], t: 2.2 }; a.idleT = Math.max(a.idleT, 3); b.idleT = Math.max(b.idleT, 3); }
  }
  // personal space: villagers gently step apart instead of stacking on one tile
  for (let i = 0; i < G.npcs.length; i++) for (let j = i + 1; j < G.npcs.length; j++) {
    const a = G.npcs[i], b = G.npcs[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    if (d > 0.01 && d < 10) {
      const push = (10 - d) * 0.5 * Math.min(1, dt * 6), ux = dx / d, uy = dy / d;
      if (canStand(a.x - ux * push, a.y - uy * push)) { a.x -= ux * push; a.y -= uy * push; }
      if (canStand(b.x + ux * push, b.y + uy * push)) { b.x += ux * push; b.y += uy * push; }
    }
  }
}

// ------------------------------------------------------------- player movement
export function setWalkDestination(x, y) {
  G.route = route(G.state.player.x, G.state.player.y, x, y);
  G.waypoint = G.route.shift() || null;
  G.cam.follow = true;
  if (!G.waypoint) G.toast('ไปตรงนั้นไม่ได้ (ป่าทึบ/น้ำ) — ถางทางก่อน', true);
}
function updatePlayer(dt) {
  const p = G.state.player, k = G.keys;
  let vx = 0, vy = 0;
  if (k.has('w') || k.has('arrowup')) vy--;
  if (k.has('s') || k.has('arrowdown')) vy++;
  if (k.has('a') || k.has('arrowleft')) vx--;
  if (k.has('d') || k.has('arrowright')) vx++;
  if (G.stick.active && Math.hypot(G.stick.x, G.stick.y) > 0.18) { vx = G.stick.x; vy = G.stick.y; }
  if (vx || vy) { G.route = []; G.waypoint = null; G.cam.follow = true; }
  else if (G.waypoint) {
    const dx = G.waypoint.x - p.x, dy = G.waypoint.y - p.y, d = Math.hypot(dx, dy);
    if (d < 3) G.waypoint = G.route.shift() || null; else { vx = dx / d; vy = dy / d; }
  }
  const m = Math.hypot(vx, vy);
  if (m > 0) {
    const sp = Math.min(1, m); vx /= m; vy /= m;
    G.facing = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'right' : 'left') : (vy > 0 ? 'down' : 'up');
    const ox = p.x, oy = p.y, step = PLAYER_SPEED * sp * dt;
    // axis-separated collision => slide along trunks and walls instead of sticking
    if (canStand(p.x + vx * step, p.y)) p.x += vx * step;
    if (canStand(p.x, p.y + vy * step)) p.y += vy * step;
    p.x = Math.max(16, Math.min(WORLD_W * TILE - 16, p.x)); p.y = Math.max(16, Math.min(WORLD_H * TILE - 8, p.y));
    const moved = Math.hypot(p.x - ox, p.y - oy);
    G.animDist += moved;
    G.walking = moved > 0.01;
  } else G.walking = false;
}

// ------------------------------------------------------------- simulation step
export function simulate(dtReal) {
  const s = G.state;
  const beforeMin = ((s.day - 1) * 86400 + s.gameTime) / 60, dayBefore = s.day;
  progressTime(s, dtReal);
  const afterMin = ((s.day - 1) * 86400 + s.gameTime) / 60;
  updatePlayer(dtReal); updateNpcs(dtReal); updateAnimals(dtReal);
  for (const e of G.effects) e.t -= dtReal;
  G.effects = G.effects.filter(e => e.t > 0).slice(-40);
  const builders = {};
  for (const n of G.npcs) if (n.arrived && n.plan?.activity === 'build') builders[n.plan.place] = (builders[n.plan.place] || 0) + 1;
  const finished = tickConstruction(s, afterMin - beforeMin, builders);
  for (const name of finished) { G.toast(`🎉 ${name} สร้างเสร็จแล้ว!`); sfx('build'); rebuildNpcs(); resetNpcPlans(); }
  let hours = Math.min(24, Math.floor(afterMin / 60) - s.town.lastEconomyHour);
  if (hours > 2) { s.town.lastEconomyHour = Math.floor(afterMin / 60) - 1; hours = 1; } // a jump in time (load / test tools) is not 24 hours of everyone working and starving at once
  while (hours-- > 0) {
    s.town.lastEconomyHour++;
    const events = economyHour(s, G.npcs.filter(n => !n.def.special).map(n => ({ npc: n.def, plan: n.plan || { activity: 'none' }, arrived: n.arrived })));
    for (const e of events) logEvent(s, e);
    for (const e of crimeHour(s, (s.town.lastEconomyHour + 23) % 24, population(s))) { G.toast(e, e.startsWith('🚨')); if (e.startsWith('🚨')) sfx('error'); }
    if (events.length) resetChoppers();
  }
  if (s.day !== dayBefore) {
    { const ed = economyDay(s); for (const e of ed.events) G.toast(e, e.startsWith('⚠️')); if (ed.grew) { clearPropTiles(s); resetNpcPlans(); G.onVillageUpgrade?.(ed.grew); } }
    { const sl = playerNewDay(s, !!s.leadership?.isLeader); G.toast(`😴 นอนที่${sl.where} พลังงาน ${Math.floor(s.player.stamina)}${sl.propertyTax ? ` · ภาษีบ้าน ${sl.propertyTax}` : ''}`); }
    refreshDaily(s); if (regrowDay(s)) G.toast('🌱 ต้นไม้นอกเขตหมู่บ้านงอกขึ้นใหม่');
    for (const e of homesDay(s)) G.toast(e);
    const el = leadershipDay(s);
    if (s.lastScandal) { const sc = s.lastScandal; s.lastScandal = null; G.toast(`🚨 ${sc.by}! ยึดเงิน ${sc.seized} เหรียญ${sc.severe ? ' · ถูกปลดและตัดสิทธิ์ลงเลือกตั้ง' : ' · ความนิยมร่วงหนัก'}`, true); sfx('error'); }
    if (el) { G.toast(el.won ? `🗳️ ชนะเลือกตั้ง! ได้เป็นผู้นำต่อ (${el.player} ต่อ ${el.rivalScore})` : `🗳️ ${el.rival} ได้เป็นผู้นำคนใหม่${el.note ? ' — ' + el.note : ''}`, !el.won); sfx(el.won ? 'level' : 'error'); }
    const settler = settlerArrivals(s);
    if (settler) { rebuildNpcs(); G.toast(`🏡 ${settler.name} ย้ายเข้ามาอยู่ในหมู่บ้าน!`); }
    G.toast(`🌅 วันที่ ${s.day} เริ่มแล้ว`);
  }
  const grew = updateStage(s);
  if (grew) { G.toast(`${grew.icon} หมู่บ้านเติบโตเป็น "${grew.th}"!`); sfx('level'); }
  if (finished.length || grew) G.refreshPanel();
}
function resetChoppers() { for (const n of G.npcs) if (n.plan?.activity === 'chop') n.planKey = ''; }

// ------------------------------------------------------------- interaction
const SITE_LABEL = { camp: 'ครูอุ่น · บ้านผู้นำ', board: 'กระดานงาน', study: 'ขอนไม้นั่งเรียน', delivery: 'ลังแลกของ' };
/** Things the player can interact with near (x,y) — trees/rocks come from a spatial query, not a full scan. */
export function interactables(x = G.state.player.x, y = G.state.player.y) {
  const s = G.state, list = [];
  for (const [id, p] of Object.entries(POINTS)) {
    if (p.type === 'project') { const [tx, ty] = structurePos(s, id); list.push({ kind: 'site', id, name: p.name, x: (tx + .5) * TILE, y: (ty - .5) * TILE, r: 44 }); }
    else list.push({ kind: 'point', id, name: SITE_LABEL[id] || p.name, x: (p.x + .5) * TILE, y: (p.y + .5) * TILE, r: INTERACT_RANGE });
  }
  for (const n of nodesNear(x, y, 5)) {
    const st = nodeStatus(s, n); if (st === 'gone') continue;
    list.push({ kind: st === 'stump' ? 'stump' : n.type, id: n.id, name: nodeLabel(s, n), x: (n.x + .5) * TILE, y: (n.y + 1) * TILE, r: INTERACT_RANGE });
  }
  for (const sl of openSlots(s)) { // empty plan slots: tap / ✦ to start building there
    if (sl.kind === 'public' || slotState(s, sl).state !== 'empty') continue;
    const b = BUILDINGS[sl.kind], h = s.homes?.[sl.id]; list.push({ kind: 'slot', id: sl.id, name: h ? (h.owner === 'player' ? `บ้านของฉัน: ${sl.name}` : `ที่ดินของ${h.name}`) : `${sl.name} (ว่าง)`, x: (sl.tx + b.width / 2) * TILE, y: (sl.ty + b.height) * TILE, r: 40, slot: sl });
  }
  for (const p of s.placed) { const b = BUILDINGS[p.type]; list.push({ kind: 'placed', id: p.uid, name: b.name, x: (p.tx + b.width / 2) * TILE, y: (p.ty + b.height) * TILE, r: Math.max(26, b.width * 9) }); }
  list.push({ kind: 'travel', id: 'bus', name: '🚌 ป้ายรถ · เดินทางไปเมืองอื่น', x: BUS_STOP.x * TILE, y: BUS_STOP.y * TILE + 8, r: 34 });
  for (const n of G.npcs) {
    if (n.hidden || n.def.special === 'cop') continue;
    if (n.def.special === 'thief') list.push({ kind: 'thief', id: n.def.crook, name: 'โจร!', x: n.x, y: n.y, r: INTERACT_RANGE + 6, npc: n });
    else list.push({ kind: 'npc', id: n.def.id, name: n.def.name, x: n.x, y: n.y, r: INTERACT_RANGE, npc: n });
  }
  return list;
}
export function nearestInteractable(x = G.state.player.x, y = G.state.player.y) {
  let best = null;
  const fx = { up: 0, down: 0, left: -6, right: 6 }[G.facing] || 0, fy = { up: -8, down: 6 }[G.facing] || 0; // prefer what you face
  for (const e of interactables(x, y)) { const d = Math.hypot(e.x - x - fx, e.y - y - fy); if (Math.hypot(e.x - x, e.y - y) <= e.r && (!best || d < best.d)) best = { ...e, d }; }
  return best;
}
export function actionLabel(e) {
  if (!e) return 'คุย / ใช้';
  const job = jobTarget(G.state);
  if (job && job.ref === e.id) return 'ทำงานที่นี่';
  if (e.kind === 'wood') return 'ฟันต้นไม้';
  if (e.kind === 'stump') return 'ขุดตอไม้';
  if (e.kind === 'stone') return (G.state.inventory?.pickaxe || 0) > 0 ? 'ขุดหิน' : 'ต้องมีอีเต้อ';
  if (e.kind === 'npc') return 'คุยกับ ' + e.name;
  if (e.kind === 'thief') return 'จับโจร!';
  if (e.kind === 'travel') return 'เดินทาง';
  if (e.kind === 'point') return { camp: 'คุยครูอุ่น', board: 'ดูงาน', study: 'อ่านหนังสือ', delivery: 'ลังแลกของ' }[e.id] || e.name;
  const st = findStructure(G.state, e.id);
  if (st?.obj.status === 'building') return 'ช่วยสร้าง';
  if (e.kind === 'site' && st?.obj.status === 'none') return 'ดูที่ดิน';
  return 'เปิด ' + e.name;
}

export function interact(e) {
  const s = G.state;
  if (!e) { G.toast('เดินเข้าใกล้คน ต้นไม้ หิน หรืออาคาร แล้วกด ✦', true); return; }
  const job = jobTarget(s);
  if (job && job.ref === e.id) { const r = workAt(s, e.id); return result(r, r.ok ? 'coin' : 'error'); }
  if (e.kind === 'wood' || e.kind === 'stone' || e.kind === 'stump') {
    G.facing = Math.abs(e.x - s.player.x) > Math.abs(e.y - 8 - s.player.y) ? (e.x > s.player.x ? 'right' : 'left') : (e.y - 8 > s.player.y ? 'down' : 'up');
    const r = hitNode(s, e.id);
    if (r.ok) { G.swing = 0.22; G.effects.push({ kind: e.kind === 'stone' ? 'dust' : 'chip', x: e.x, y: e.y - 14, t: 0.45 }); if (r.felled) G.effects.push({ kind: 'fall', x: e.x, y: e.y, t: 0.6 }); }
    return result(r, r.ok ? (r.felled || r.broken ? 'build' : 'gather') : 'error');
  }
  if (e.kind === 'npc') return G.openPanel('npc', e.id);
  if (e.kind === 'travel') return G.openPanel('travel');
  if (e.kind === 'thief') { const r = arrestThief(s, e.id); G.npcs = G.npcs.filter(n => n.def.crook !== e.id); return result(r, r.ok ? 'level' : 'error'); }
  if (e.kind === 'point') {
    if (e.id === 'camp') return G.openPanel('quests');
    if (e.id === 'board') return G.openPanel('jobs');
    if (e.id === 'study') return result(study(s), 'click');
    if (e.id === 'delivery') return G.openPanel('market');
  }
  if (e.kind === 'site' || e.kind === 'placed') return G.openPanel('structure', e.id);
  if (e.kind === 'slot') {
    if (e.slot.kind === 'cottage') {
      const owner = ownerOf(s, e.slot.id);
      if (!owner) return G.openPanel('home', e.slot.id);
      if (owner !== 'player') { const h = s.homes[e.slot.id]; return G.toast(`ที่ดินของ${h.name} · กำลังเก็บเงินสร้างบ้าน (${h.savings}/${BUILDINGS.cottage.coins} เหรียญ)`); }
    }
    return enterBuild(e.slot.kind, e.slot);
  }
}
export function result(r, sound) {
  G.toast(r.msg || (r.ok ? 'สำเร็จ' : 'ทำไม่ได้'), !r.ok);
  if (sound) sfx(r.ok ? sound : 'error');
  saveNow(); G.hud(); G.refreshPanel();
  return r;
}

// ------------------------------------------------------------- build mode
export function enterBuild(type, slot = null) {
  if (!BUILDINGS[type]) return;
  const p = G.state.player, b = BUILDINGS[type];
  let tx = Math.floor(p.x / TILE) + 1, ty = Math.floor(p.y / TILE) - b.height;
  if (SLOT_KINDS.includes(type)) { // plan buildings: jump to the chosen / nearest free slot
    const sl = slot || nearestFreeSlot(G.state, type, tx, ty);
    if (!sl) { G.toast(`ไม่มีแปลงว่างสำหรับ${b.name}ในผังระดับนี้ — ยกระดับหมู่บ้านเพื่อเปิดแปลงเพิ่ม`, true); return; }
    tx = sl.tx; ty = sl.ty;
  }
  G.closePanel();
  G.build = { type, tx: null, ty: null, check: null };
  if (!SLOT_KINDS.includes(type) && Math.hypot(tx - CENTER.x, ty - CENTER.y) > villageRadius(G.state) - 2) { tx = CENTER.x + 5; ty = CENTER.y + 3; }
  setBuildPreview(tx, ty);
  G.cam.follow = false; G.cam.x = (tx + b.width / 2) * TILE; G.cam.y = (ty + b.height / 2) * TILE;
  G.syncBuildBar();
  G.toast(SLOT_KINDS.includes(type) ? `${b.name}: สร้างบนแปลงตามผัง (แตะแปลงสีเหลืองอื่นเพื่อเปลี่ยน) แล้วกดยืนยัน` : `เลือกที่วาง${b.name}: แตะ/คลิกพื้นที่โล่ง (ถางป่าก่อน) หรือใช้ปุ่มลูกศร แล้วกดยืนยัน`);
}
function actorBlocks(tx, ty) {
  const inTile = (x, y) => Math.floor(x / TILE) === tx && Math.floor((y - 4) / TILE) === ty;
  return inTile(G.state.player.x, G.state.player.y) || G.npcs.some(n => inTile(n.x, n.y));
}
const buildBlocked = (tx, ty) => !walkable(tx, ty);
export function setBuildPreview(tx, ty) {
  if (!G.build) return;
  const b = BUILDINGS[G.build.type];
  if (SLOT_KINDS.includes(G.build.type)) { // snap to the nearest open slot of this kind (free or not: the check explains)
    let best = null, bd = Infinity;
    for (const sl of openSlots(G.state)) if (sl.kind === G.build.type) { const d = Math.hypot(sl.tx - tx, sl.ty - ty); if (d < bd) { bd = d; best = sl; } }
    if (best) { tx = best.tx; ty = best.ty; }
  }
  G.build.tx = Math.max(0, Math.min(WORLD_W - b.width, tx)); G.build.ty = Math.max(0, Math.min(WORLD_H - b.height, ty));
  G.build.check = canPlace(G.state, G.build.type, G.build.tx, G.build.ty, buildBlocked, actorBlocks);
  const cx = (G.build.tx + b.width / 2) * TILE, cy = (G.build.ty + b.height / 2) * TILE;
  const hw = G.cssW / G.cam.zoom / 2 - 40, hh = G.cssH / G.cam.zoom / 2 - 60;
  if (Math.abs(cx - G.cam.x) > hw || Math.abs(cy - G.cam.y) > hh) { G.cam.follow = false; G.cam.x = cx; G.cam.y = cy; }
  G.syncBuildBar();
}
export function confirmBuild() {
  if (!G.build || G.build.tx === null) return;
  const r = placeBuilding(G.state, G.build.type, G.build.tx, G.build.ty, buildBlocked, actorBlocks);
  if (r.ok) { cancelBuild(false); resetNpcPlans(); }
  else setBuildPreview(G.build.tx, G.build.ty);
  result(r, r.ok ? 'build' : 'error');
}
export function cancelBuild(msg = true) { G.build = null; G.cam.follow = true; G.syncBuildBar(); if (msg) G.toast('ยกเลิกการก่อสร้าง ไม่มีการหักเงินหรือวัตถุดิบ'); }

export function resetNpcPlans() { for (const n of G.npcs) n.planKey = ''; }
export function fitCamera() { let saved = 0; try { saved = Number(localStorage.getItem('v2n-zoom')) || 0; } catch { /* */ } G.cam.baseZoom = defaultZoom(G.cssW, G.cssH); G.cam.zoomTarget = saved || G.cam.baseZoom; G.applyZoom?.(); clampCamera(G.cam, G.cssW, G.cssH); }
export function ensureAll() { ensureConstruction(G.state); }
export const FRAME = CHARACTER_ATLAS.frame;
/** Animation column from distance walked (legs match speed: faster walk = faster steps). */
export function walkColumn(dir, walking, dist) {
  if (!walking) return CHARACTER_ATLAS.idleCol[dir] ?? 0;
  return CHARACTER_ATLAS.walkCycle[Math.floor(dist / STRIDE) % CHARACTER_ATLAS.walkCycle.length];
}
/** Small vertical bounce while walking (in world px) — the "ดุกดิก" step. */
export function walkBob(walking, dist) { return walking ? -Math.abs(Math.sin(dist / STRIDE * Math.PI / 2)) * 1.3 : 0; }

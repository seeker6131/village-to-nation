// Validate the 10 town layouts: district footprints on dry land, off paths of other districts, off the village plan,
// every zone reachable from spawn (water blocks, bridge decks pass). Prints an ASCII map per layout with --map.
import * as W from '../src/world.js';
import * as CP from '../src/cityPlan.js';
import { ART10 } from '../src/artManifest.js';
import { TIERS } from '../src/villageLayout.js';
const show = process.argv.includes('--map'), only = process.argv.find(a => /^\d+$/.test(a));
let bad = 0;
for (let plan = 0; plan < W.PLANS.length; plan++) {
  if (only && Number(only) !== plan) continue;
  W.generateRegion(W.DEFAULT_SEED, 'forest', plan); CP.resetCityPlan();
  const issues = [], c5 = CP.cityPlan(5, ART10);
  const wet = (x, y) => { const g = W.groundAt(x, y); return g === W.T.WATER || g === W.T.FORD; };
  const plots = new Set();
  for (const id of ['home', 'farm', 'market', 'hall']) { const r = W.plotRect(id); for (let y = r.ty; y < r.ty + r.h; y++) for (let x = r.tx; x < r.tx + r.w; x++) plots.add(x + ',' + y); }
  for (const T of TIERS) for (const sl of T.slots) if (sl.tx != null) for (let y = sl.ty + W.ORIGIN.y; y < sl.ty + W.ORIGIN.y + 3; y++) for (let x = sl.tx + W.ORIGIN.x; x < sl.tx + W.ORIGIN.x + 4; x++) plots.add(x + ',' + y);
  const used = new Map();
  for (const p of c5.props) {
    for (const [x, y] of p.block || []) {
      const k = x + ',' + y;
      if (x < 1 || y < 1 || x >= W.WORLD_W - 1 || y >= W.WORLD_H - 1) { issues.push(`${p.name} off map`); break; }
      if (wet(x, y)) { issues.push(`${p.name} on water ${k}`); break; }
      if (plots.has(k)) { issues.push(`${p.name} on village plan ${k}`); break; }
      if (used.has(k) && used.get(k) !== p) { issues.push(`${p.name} overlaps ${used.get(k).name}`); break; }
      used.set(k, p);
    }
    if (p.big) { const sz = ART10[p.name]; if (p.y - sz[1] / 16 < -1) issues.push(`${p.name} top off map`); }
  }
  // reachability (bridge decks walkable)
  const deck = new Set(); for (const b of W.BRIDGES) for (let x = b.x0 - 3; x <= b.x1 + 3; x++) if (W.groundAt(x, b.y) === W.T.FORD) deck.add(x + ',' + b.y);
  const blocked = (x, y) => x < 1 || y < 1 || x >= W.WORLD_W - 1 || y >= W.WORLD_H - 1 || (!deck.has(x + ',' + y) && wet(x, y)) || used.has(x + ',' + y);
  const seen = new Uint8Array(W.WORLD_W * W.WORLD_H), q = [[W.CENTER.x + 2, W.CENTER.y + 3]]; seen[(W.CENTER.y + 3) * W.WORLD_W + W.CENTER.x + 2] = 1;
  while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (blocked(nx, ny) || seen[ny * W.WORLD_W + nx]) continue; seen[ny * W.WORLD_W + nx] = 1; q.push([nx, ny]); } }
  for (const z of W.ZONES) { if (z.id === 'lake') continue; const zx = z.cx ?? z.x, zy = Math.round((z.cy ?? z.y) + (z.row || 0)); let ok = false; for (let r = 0; r < 4 && !ok; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) if (seen[(zy + dy) * W.WORLD_W + zx + dx]) ok = true; if (!ok) issues.push(`zone ${z.id} unreachable`); }
  console.log(`${plan} ${W.PLANS[plan].id.padEnd(9)} bridges ${W.BRIDGES.length} ${issues.length ? 'ISSUES: ' + [...new Set(issues)].join(' | ') : 'ok'}`);
  bad += issues.length ? 1 : 0;
  if (show) {
    const rows = [];
    for (let y = 0; y < W.WORLD_H; y += 2) { let r = ''; for (let x = 0; x < W.WORLD_W; x++) { const k = x + ',' + y, g = W.groundAt(x, y); r += used.has(k) ? '█' : g === W.T.FORD ? '=' : g === W.T.WATER ? '~' : g === W.T.DIRT ? '.' : g === W.T.SAND ? ':' : g === W.T.ROCKY ? '^' : ' '; } rows.push(r); }
    console.log(rows.join('\n'));
  }
}
process.exit(bad ? 1 : 0);

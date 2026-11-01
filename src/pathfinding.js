// Tile BFS pathfinding (4-neighbour). Called only when a destination changes, never per frame.
import { TILE, WORLD_W, WORLD_H } from './world.js';

export function nearestWalkable(tx, ty, walkable, maxR = 10) {
  if (walkable(tx, ty)) return [tx, ty];
  for (let r = 1; r <= maxR; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
    if (walkable(tx + dx, ty + dy)) return [tx + dx, ty + dy];
  }
  return null;
}

/**
 * World-pixel route from (ax,ay) to (bx,by) as tile-centre waypoints. [] when unreachable.
 * The search stops at the first reachable tile within `near` tiles of the target, so a target that is itself
 * blocked (a tree trunk, a building) or sits in a closed pocket still gets the closest reachable approach.
 */
export function tileRoute(ax, ay, bx, by, walkable, near = 1, canStep = () => true) {
  const s = nearestWalkable(Math.floor(ax / TILE), Math.floor(ay / TILE), walkable);
  const gx = Math.floor(bx / TILE), gy = Math.floor(by / TILE);
  if (!s) return [];
  const t = walkable(gx, gy) ? [gx, gy] : null;
  const start = s[1] * WORLD_W + s[0];
  let goal = t ? t[1] * WORLD_W + t[0] : -1;
  if (start === goal || (Math.abs(s[0] - gx) <= near && Math.abs(s[1] - gy) <= near && !t)) return [{ x: (s[0] + .5) * TILE, y: (s[1] + .5) * TILE }];
  const prev = new Int32Array(WORLD_W * WORLD_H).fill(-1), q = new Int32Array(WORLD_W * WORLD_H);
  let head = 0, tail = 0; q[tail++] = start; prev[start] = start;
  const D = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (head < tail) {
    const c = q[head++]; if (c === goal) break;
    const x = c % WORLD_W, y = (c / WORLD_W) | 0;
    if (!t && Math.abs(x - gx) <= near && Math.abs(y - gy) <= near) { goal = c; break; }
    for (const [dx, dy] of D) {
      const nx = x + dx, ny = y + dy, n = ny * WORLD_W + nx;
      if (nx < 0 || nx >= WORLD_W || ny < 0 || ny >= WORLD_H || prev[n] !== -1 || !walkable(nx, ny) || !canStep(x, y, nx, ny)) continue;
      prev[n] = c; q[tail++] = n;
    }
  }
  if (goal < 0 || prev[goal] === -1) return [];
  const out = []; let c = goal;
  while (c !== start) { out.push({ x: ((c % WORLD_W) + .5) * TILE, y: (((c / WORLD_W) | 0) + .5) * TILE }); c = prev[c]; }
  return out.reverse();
}

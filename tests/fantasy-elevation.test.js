import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLD, WORLD_W, generateRegion, canStepElevation, elevationAt } from '../src/world.js';
import { tileRoute } from '../src/pathfinding.js';
test('flat maps remain navigable as before', () => { generateRegion(700, 'forest', 0); assert.equal(WORLD.hasElevation, false); assert.equal(canStepElevation(2,2,3,2), true); });
test('cliff boundaries require a staircase', () => {
  WORLD.elevation.fill(0); WORLD.stairs.fill(0); WORLD.hasElevation = true;
  WORLD.elevation[10 * WORLD_W + 11] = 1;
  assert.equal(elevationAt(11,10),1); assert.equal(canStepElevation(10,10,11,10),false);
  WORLD.stairs[10 * WORLD_W + 11] = 1; assert.equal(canStepElevation(10,10,11,10),true);
  assert.equal(canStepElevation(10,10,12,10),false);
});
test('pathfinding respects elevation and finds a stair instead of crossing cliff', () => {
  const near = (x,y)=>x>=5&&x<=8&&y>=5&&y<=7;
  WORLD.elevation.fill(0); WORLD.stairs.fill(0); WORLD.hasElevation = true;
  for(let y=5;y<=7;y++) for(let x=7;x<=8;x++) WORLD.elevation[y*WORLD_W+x]=1;
  let r=tileRoute(5.5*16,6.5*16,8.5*16,6.5*16,near,0,canStepElevation);
  assert.deepEqual(r, []);
  WORLD.stairs[5*WORLD_W+7]=1;
  r=tileRoute(5.5*16,6.5*16,8.5*16,6.5*16,near,0,canStepElevation);
  assert.ok(r.length>=3); assert.ok(r.some(p=>Math.floor(p.x/16)===7&&Math.floor(p.y/16)===5));
});

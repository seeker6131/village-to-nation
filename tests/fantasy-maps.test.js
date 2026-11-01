import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS } from '../src/maps/index.js';
import { WORLD, WORLD_W, WORLD_H, PLANS, generateRegion, CENTER, LEADER_HOUSE, elevationAt, canStepElevation } from '../src/world.js';
const fantasy = MAPS.filter(m=>m.id.startsWith('fantasy_'));
test('five distinct fantasy maps retain full 144x96 layout and central castle', () => {
 assert.equal(fantasy.length,5); assert.equal(new Set(fantasy.map(m=>m.th)).size,5);
 assert.equal(new Set(fantasy.map(m=>m.ground.join(''))).size,5);
 for(const m of fantasy){ assert.equal(m.ground.length,96); assert.ok(m.ground.every(r=>r.length===144)); assert.equal(m.heightRows.length,96); assert.ok(m.heightRows.every(r=>r.length===144)); assert.ok(Math.abs(m.leader.tx-72)<10); assert.ok(Math.abs(m.leader.ty-48)<10); assert.ok(m.stairRows.some(r=>r.includes('S'))); }
});
test('each fantasy map loads into the world with meaningful elevation and traversable stair boundaries',()=>{
 for(const m of fantasy){const plan=PLANS.findIndex(p=>p.id===m.id); assert.ok(plan>=0); generateRegion(20261101,'forest',plan);
  assert.equal(CENTER.x,71); assert.equal(LEADER_HOUSE.tx,68); assert.equal(WORLD.hasElevation,true);
  let stairConnects=0;
  for(let y=1;y<WORLD_H-1;y++)for(let x=1;x<WORLD_W-1;x++)if(WORLD.stairs[y*WORLD_W+x]){
   for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) if(Math.abs(elevationAt(x,y)-elevationAt(x+dx,y+dy))===1 && canStepElevation(x,y,x+dx,y+dy))stairConnects++;
  }
  assert.ok(stairConnects>=2,m.id+' has actual accessible stairs');
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createInitialState,progressTime} from '../src/gameState.js';
import {blocked} from '../src/world.js';
import {ensureSystems,gainXp,requiredXp,plant,harvest,gardenProgress,buyMarket,sellMarket,craft,claimQuest,refreshDaily,questProgress,upgradeSkill} from '../src/systems.js';
// v0.8: placement moved to construction.js (timed construction)
import {canPlace,placeBuilding} from '../src/construction.js';
import {ensureWorld} from '../src/world.js';
const s=()=>{const a=ensureSystems(createInitialState());ensureWorld(a);return a;};
test('old v0.4 saves are migrated non-destructively',()=>{const a=createInitialState();a.player.coins=123;const x=ensureSystems(JSON.parse(JSON.stringify(a)));assert.equal(x.player.coins,123);assert.equal(x.player.level,1);assert.equal(x.inventory.seed,2);assert.deepEqual(x.placed,[])});
test('experience progresses, level-ups grant skillpoints without affecting elections',()=>{const a=s();gainXp(a,25);assert.equal(a.player.level,2);assert.equal(a.player.skillPoints,1);assert.equal(a.election.opened,false);assert.equal(upgradeSkill(a,'trade').ok,true);assert.equal(a.skills.trade,1);assert.equal(upgradeSkill(a,'trade').ok,false);});
test('market enforces funds and inventory without negative balances',()=>{const a=s();a.player.coins=5;assert.equal(buyMarket(a,'seed').ok,true);assert.equal(buyMarket(a,'seed').ok,false);assert.equal(sellMarket(a,'vegetables').ok,false);assert.ok(a.player.coins>=0);assert.equal(a.inventory.seed,3);});
test('crafting consumes materials and gates toolkit on workshop',()=>{const a=s();a.player.wood=3;a.player.stone=1;assert.equal(craft(a,'toolkit').ok,false);assert.equal(craft(a,'planks').ok,true);assert.equal(a.player.wood,0);assert.equal(a.inventory.planks,2);assert.equal(craft(a,'toolkit').ok,false);a.placed.push({uid:'w',type:'workshop',tx:60,ty:19,plantedAt:null,level:1,status:'done'});assert.equal(craft(a,'toolkit').ok,true);assert.equal(a.inventory.toolkit,1);});
test('construction rejects unreachable, obstructed and duplicate placements',()=>{const a=s();a.player.wood=100;a.player.stone=100;a.player.coins=100;
 assert.equal(canPlace(a,'garden',10,10,blocked).ok,false);assert.equal(canPlace(a,'garden',54,45,blocked).ok,false);
 let selected;for(let y=30;y<70&&!selected;y++)for(let x=20;x<60&&!selected;x++)if(canPlace(a,'garden',x,y,blocked).ok)selected=[x,y];
 assert.ok(selected,'there must be a valid garden site');const [x,y]=selected;assert.equal(placeBuilding(a,'garden',x,y,blocked).ok,true);assert.equal(canPlace(a,'garden',x,y,blocked).ok,false);assert.equal(a.placed.length,1);});
test('garden grows in one in-game day, not frame-rate dependent',()=>{const a=s();a.placed.push({uid:'garden1',type:'garden',tx:62,ty:18,plantedAt:null});assert.equal(harvest(a,'garden1').ok,false);assert.equal(plant(a,'garden1').ok,true);assert.equal(plant(a,'garden1').ok,false);assert.equal(gardenProgress(a,a.placed[0]),0);progressTime(a,1200);assert.equal(gardenProgress(a,a.placed[0]),1);assert.equal(harvest(a,'garden1').ok,true);assert.equal(a.inventory.vegetables,3);assert.equal(harvest(a,'garden1').ok,false);});
test('daily quests cannot be claimed twice or before completion',()=>{const a=s();refreshDaily(a);assert.equal(claimQuest(a,'wood').ok,false);a.stats.woodGathered+=3;assert.equal(questProgress(a,'wood'),3);assert.equal(claimQuest(a,'wood').ok,true);assert.equal(claimQuest(a,'wood').ok,false);a.day++;refreshDaily(a);assert.equal(questProgress(a,'wood'),0);});
// v0.26 civic spending moved to running policies paid daily from the treasury: tests/economy.test.js

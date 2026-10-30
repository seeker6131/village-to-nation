import test from 'node:test';
import assert from 'node:assert/strict';
import {createInitialState, mentorObjective, civilShift} from '../src/gameState.js';
test('mentor gives clear progression objectives that follow the existing game state',()=>{
 const s=createInitialState();
 assert.match(mentorObjective(s).title,/ถางป่า/);
 s.stats.woodGathered=3;assert.match(mentorObjective(s).title,/อีเต้อ/);
 s.stats.stoneGathered=2;
 assert.match(mentorObjective(s).title,/สร้าง/);
 s.projects={home:true,farm:true,market:true,hall:true};s.player.knowledge=3;
 assert.match(mentorObjective(s).title,/สอบ/);
 s.examPassed=true;assert.match(mentorObjective(s).title,/สมัคร/,'legacy (no founder leadership) path');
 s.leadership={popularity:55,results:[]};assert.match(mentorObjective(s).title,/ความนิยม/,'founder path: survive the first term');
});
test('civil servants are promoted by completed workdays, not purchased boosts',()=>{
 const s=createInitialState();s.civilService.examPassed=true;s.civilService.rank='เจ้าหน้าที่ฝึกหัด';
 for(let d=1;d<=15;d++){s.day=d;s.player.stamina=100;assert.equal(civilShift(s).ok,true);}
 assert.equal(s.civilService.shifts,15);
 assert.equal(s.civilService.rank,'ผู้อำนวยการชุมชน');
 assert.equal(civilShift(s).ok,false,'no double shift on one day');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createInitialState,progressTime,DAY_SECONDS_REAL,gather,canBuild,buildProject,PROJECT_ORDER,study,takeExam,takeCivilExam,civilShift,CIVIL_EXAM_QUESTIONS,electionEligibility,registerCandidate,runDemoElection,startDelivery,completeDelivery,safeLoad,EXAM_QUESTIONS} from '../src/gameState.js';

test('one real day length maps to one game day',()=>{
 const s=createInitialState();progressTime(s,DAY_SECONDS_REAL);
 assert.equal(s.day,2);assert.equal(s.gameTime,6*3600);
});
test('resource collection needs stamina',()=>{
 const s=createInitialState();s.player.stamina=5;assert.equal(gather(s,'wood').ok,true);assert.equal(s.player.wood,1);assert.equal(gather(s,'stone').ok,false);
});
test('community projects cost materials and unlock the first election',()=>{
 const s=createInitialState();s.player.wood=100;s.player.stone=100;
 assert.equal(canBuild(s,'hall').ok,false);
 for(const id of PROJECT_ORDER)assert.equal(buildProject(s,id).ok,true);
 assert.equal(s.election.opened,true);assert.equal(s.player.civic,15);assert.equal(s.player.wood,82);
 assert.equal(buildProject(s,'home').ok,false);
});
test('exam requires study and two correct answers',()=>{
 const s=createInitialState();assert.equal(takeExam(s,[1,0,1]).ok,false);
 for(let i=0;i<3;i++)study(s);
 assert.equal(takeExam(s,[1,0,0]).ok,true);assert.equal(s.examPassed,true);
});
test('candidate must qualify; mock election is isolated to offline state',()=>{
 const s=createInitialState();assert.equal(registerCandidate(s).ok,false);
 s.player.wood=50;s.player.stone=50;for(const id of PROJECT_ORDER)buildProject(s,id);
 for(let i=0;i<3;i++)study(s);
 takeExam(s,EXAM_QUESTIONS.map(q=>q.answer));
 assert.equal(electionEligibility(s).eligible,true);
 assert.equal(registerCandidate(s).ok,true);
 assert.equal(runDemoElection(s).won,true);
 assert.equal(s.election.leader,'player');
});
test('delivery cannot be completed twice',()=>{
 const s=createInitialState();assert.equal(completeDelivery(s).ok,false);
 assert.equal(startDelivery(s).ok,true);
 assert.equal(completeDelivery(s).ok,true);
 assert.equal(completeDelivery(s).ok,false);assert.equal(s.player.coins,47);
});
test('corrupted saves are reset',()=>{
 assert.deepEqual(safeLoad('{no'),createInitialState());
});

test('civil service exam is distinct from politics and shift limited per day',()=>{
 const s=createInitialState();
 for(let i=0;i<2;i++)study(s);
 startDelivery(s);completeDelivery(s);
 assert.equal(takeCivilExam(s,CIVIL_EXAM_QUESTIONS.map(q=>q.answer)).ok,true);
 assert.equal(s.examPassed,false); // passing civil service does not make a political leader
 assert.equal(civilShift(s).ok,true);
 assert.equal(civilShift(s).ok,false);
 progressTime(s,DAY_SECONDS_REAL);
 assert.equal(civilShift(s).ok,true);
});

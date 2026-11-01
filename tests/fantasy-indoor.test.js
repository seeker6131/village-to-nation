import test from 'node:test';
import assert from 'node:assert/strict';
import { canSleep, restUntilMorning, roomOf } from '../src/ui/indoor.js';
test('indoors have designated shopkeepers and selective beds', () => { assert.equal(roomOf('castle').sleep,false); assert.equal(roomOf('inn').cost,4); assert.equal(roomOf('fishing').host,'พ่อค้าปลา'); });
test('sleeping requires late hour, silver and only charges once', () => {
  const s = { day:3, gameTime:19*3600, player:{coins:5}, fantasy:{} };
  assert.equal(canSleep(s,'inn').ok,true);
  let used=0; const r=restUntilMorning(s,'inn',secs=>{ used=secs; s.day++; s.gameTime=6*3600; });
  assert.equal(r.ok,true); assert.equal(s.player.coins,1); assert.ok(used>0); assert.equal(s.fantasy.lastSleepDay,3);
  assert.equal(canSleep(s,'inn').ok,false); assert.equal(s.player.coins,1);
});

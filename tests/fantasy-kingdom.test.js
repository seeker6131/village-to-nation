import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureKingdom, seasonAt, ROYAL_RANKS, awardMerit, requestRoyalAppointment, exchangeCurrency, tradeWithTown, kingdomNewDay } from '../src/fantasyKingdom.js';
const s=()=>({day:1,gameTime:20000,player:{coins:120,wood:10,stone:9,food:6,stamina:80},town:{treasury:40,stage:2}});
test('kingdom starts as unprivileged slave with zero paid power',()=>{ const st=s(), f=ensureKingdom(st); assert.equal(f.rank,0); assert.equal(ROYAL_RANKS[f.rank].th,'ทาสรับใช้'); assert.equal(requestRoyalAppointment(st).ok,false); });
test('royal appointments depend on all three earned stats',()=>{const st=s(); for(let i=0;i<6;i++)awardMerit(st,'royalQuest'); assert.equal(requestRoyalAppointment(st).ok,true); assert.equal(st.fantasy.rank,1);});
test('silver/gold trading and cross-city caravans never underflow resources',()=>{const st=s(); assert.equal(exchangeCurrency(st,'buyGold').ok,true); assert.equal(st.player.coins,20); assert.equal(st.player.gold,1); assert.equal(exchangeCurrency(st,'sellGold').ok,true); assert.equal(tradeWithTown(st,'wood').ok,true); assert.equal(st.player.wood,2); assert.equal(tradeWithTown(st,'wood').ok,false); assert.ok(st.player.coins>=0);});
test('season changes every 7 days and raids never create negative treasury',()=>{assert.notEqual(seasonAt(1),seasonAt(8)); const st=s();st.day=7;st.fantasy={threat:80};const e=kingdomNewDay(st);assert.equal(e.kind,'raid');assert.ok(st.town.treasury>=0);});

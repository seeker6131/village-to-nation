import test from 'node:test';
import assert from 'node:assert/strict';
import { generateRegion, PLANS, DEFAULT_SEED } from '../src/world.js';
import { cityPlan, resetCityPlan } from '../src/cityPlan.js';
import { roadTexture, ROAD_ERAS } from '../src/artMap.js';
import { ART_USED } from '../src/ui/render.js';
import { TILE_NAMES } from '../src/ui/terrain.js';
import { createInitialState } from '../src/gameState.js';
import { migrate } from '../src/save.js';
import { villageProps, bridgeSprite } from '../src/villageProps.js';

const retired = /^(cb_|cd_|po_|bz_|sh_|bs_(stop|terminal|metro)|gt_(district|city)|pw_br_concrete|pf_path_concrete|cot[0-9]|leader_e|house_e|market_e|hall_e)/;

test('old asphalt, concrete, offices and towers cannot appear in fantasy rendering catalog', () => {
  for (const name of ART_USED) assert.ok(!retired.test(name.replace('v10/', '')), name);
  for (const name of ART_USED) assert.ok(!/road[1345]|plaza[1234]|tx_road_(asphalt|slab)/.test(name), name);
  for (const name of TILE_NAMES) assert.ok(!/road[1345]|plaza[1234]/.test(name), name);
  assert.deepEqual(ROAD_ERAS, ['cobble']);
  for (let stage=0;stage<=4;stage++) assert.equal(roadTexture(stage),'tx_road_cobble');
  assert.equal(bridgeSprite(4),'pw_br_stone_h');
});

test('five fantasy maps use only medieval architectural props at every level', () => {
  for (const mid of ['fantasy_valley','fantasy_lake','fantasy_pines','fantasy_meadow','fantasy_pass']) {
    const plan=PLANS.findIndex(p=>p.id===mid);
    assert.ok(plan>=0);
    generateRegion(DEFAULT_SEED,'forest',plan);resetCityPlan();
    for (let tier=1;tier<=5;tier++) {
      const c=cityPlan(tier);
      assert.ok(c.props.length>=2,mid+' town has visible architecture');
      for (const p of c.props) {
        assert.match(p.name,/^fantasy\/[a-z_]+_[123]$/);
        assert.ok(!retired.test(p.name),p.name);
      }
    }
    const s=migrate(createInitialState());s.world.plan=plan;
    for (let tier=1;tier<=5;tier++) {
      s.town.stage=tier-1;
      for (const p of villageProps(s)) assert.ok(!retired.test(p.name), p.name);
    }
  }
});

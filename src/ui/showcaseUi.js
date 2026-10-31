// "🏙 ดูเมืองเต็มระดับ" button: swaps in a throw-away fully built copy of the village (src/showcase.js) so the
// player can walk around a finished level. Saving is off while previewing; leaving restores the real game exactly.
import { G, rebuildNpcs, rebuildAnimals, resetNpcPlans } from './game.js';
import { buildShowcase, SHOWCASES, fillLevel, setLevel, applyPlan } from '../showcase.js';
import { PLANS } from '../world.js';
import { saveNow } from './game.js';
import { STAGES } from '../progression.js';
import { DISTRICT_FOCUS } from '../cityPlan.js';
import { ensureWorld, CENTER, TILE, SPAWN } from '../world.js';
import { setZoom, clampCamera } from './camera.js';

const $ = s => document.querySelector(s);
export function enterShowcase(id) {
  if (G.away) return G.toast('ดูเมืองเต็มระดับได้ที่หมู่บ้านของตัวเอง', true);
  if (!G.preview) G.preview = { real: G.state, cam: { x: G.cam.x, y: G.cam.y, zoom: G.cam.zoomTarget, follow: G.cam.follow } };
  G.closePanel?.();
  if (G.preview.plan == null) G.preview.plan = G.preview.real.world.plan || 0;
  const r = buildShowcase(G.preview.real, id, G.preview.plan);
  G.state = r.state; G.preview.id = id;
  $('#sc-map-name').textContent = `🗺 ${PLANS[G.preview.plan]?.th || 'แมพ'} (${G.preview.plan + 1}/${PLANS.length})${G.preview.plan === (G.preview.real.world.plan || 0) ? ' · แมพของคุณ' : ''}`;
  ensureWorld(G.state); rebuildNpcs(); resetNpcPlans(); rebuildAnimals();
  G.state.player.x = (CENTER.x + 2.5) * TILE; G.state.player.y = (CENTER.y + 4.5) * TILE;
  const f = DISTRICT_FOCUS[r.info.stage + 1] || [CENTER.x - 2, CENTER.y - 1]; // look at the district this level opens
  G.cam.follow = false; G.cam.overview = false; G.cam.x = f[0] * TILE; G.cam.y = f[1] * TILE;
  if (DISTRICT_FOCUS[r.info.stage + 1]) { G.state.player.x = (f[0] + .5) * TILE; G.state.player.y = (f[1] + 3) * TILE; }
  setZoom(G.cam, Math.max(1, 2 / G.k), G.cssW, G.cssH); clampCamera(G.cam, G.cssW, G.cssH);
  $('#showcase-bar').classList.remove('hidden'); $('#app').classList.add('showcasing');
  for (const b of document.querySelectorAll('#showcase-bar [data-show]')) b.classList.toggle('on', Number(b.dataset.show) === id);
  $('#showcase-info').textContent = `${r.info.icon} ${r.info.th} · สร้างครบทุกแปลง · ประชากร ${r.population} คน · คุณจะเป็น${r.info.title}${r.info.preview ? ' · (ภาพตัวอย่างอาคารยุคถัดไป)' : ''}`;
  G.toast('โหมดดูตัวอย่าง: เดิน/ลากจอดูได้ · ไม่บันทึกเซฟ · กด ✕ เพื่อกลับเกมจริง');
}
export function exitShowcase() {
  if (!G.preview) return;
  const p = G.preview; G.preview = null;
  G.state = p.real; ensureWorld(G.state); rebuildNpcs(); resetNpcPlans(); rebuildAnimals();
  G.cam.x = p.cam.x; G.cam.y = p.cam.y; G.cam.follow = p.cam.follow !== false; setZoom(G.cam, p.cam.zoom, G.cssW, G.cssH);
  $('#showcase-bar').classList.add('hidden'); $('#app').classList.remove('showcasing');
  G.hud?.(); G.toast('กลับสู่หมู่บ้านจริงแล้ว');
}
export function initShowcase() {
  $('#showcase-bar .sc-tiers').innerHTML = SHOWCASES.map(x => `<button type="button" data-show="${x.id}">${x.icon} ${x.th}</button>`).join('');
  $('#showcase-btn').addEventListener('click', () => (G.preview ? exitShowcase() : enterShowcase(Math.min(SHOWCASES.length, (G.state.town?.stage || 0) + 2))));
  $('#showcase-bar').addEventListener('click', e => {
    const b = e.target.closest('[data-show]'); if (b) enterShowcase(Number(b.dataset.show)); if (e.target.closest('#showcase-exit')) exitShowcase();
    const m = e.target.closest('[data-map]'); if (m && G.preview) { G.preview.plan = (G.preview.plan + Number(m.dataset.map) + PLANS.length) % PLANS.length; enterShowcase(G.preview.id || 2); }
    if (e.target.closest('#sc-overview')) G.toggleOverview?.();
    if (e.target.closest('#sc-min')) { const bar = $('#showcase-bar'), min = bar.classList.toggle('min'); $('#sc-min').textContent = min ? '▸' : '▾'; }
  });
  G.enterShowcase = enterShowcase; G.exitShowcase = exitShowcase;
  // test mode only: build the current level out completely, then step the era up to review the next one
  const bar = $('#devbar'); if (!G.sandbox || !bar) return;
  bar.classList.remove('hidden');
  const label = () => { const st = G.state.town.stage || 0, pl = G.state.world.plan || 0; $('#dev-era').textContent = `${STAGES[st].icon} ${STAGES[st].th} (${st + 1}/5)`; $('#dev-plan').textContent = `🗺 ผัง ${pl + 1}/${PLANS.length}`; $('#dev-plan').title = PLANS[pl].th + ' — กดเพื่อเปลี่ยนผัง (Y)'; };
  G.devAction = act => {
    if (G.preview) return;
    if (G.away) return G.toast('ปุ่มทดสอบใช้ได้ที่หมู่บ้านของตัวเอง', true);
    const s = G.state, st = s.town.stage || 0;
    if (act === 'fill') { fillLevel(s); G.toast(`🏗 พัฒนา${STAGES[st].th}จนเต็มแล้ว: ทุกแปลงสร้างเสร็จ อาคารยุค${STAGES[st].th} คนเต็มเมือง`); }
    else if (act === 'up') { if (st >= 4) return G.toast('ยุคสูงสุดแล้ว (ประเทศ)', true); setLevel(s, st + 1); G.toast(`⏫ อัพเป็นยุค${STAGES[st + 1].th} — กด 🏗 พัฒนาจนตัน เพื่อดูยุคนี้แบบเต็ม`); }
    else if (act === 'plan') { const pl = applyPlan(s, ((s.world.plan || 0) + 1) % PLANS.length); s.player.x = SPAWN.x; s.player.y = SPAWN.y; G.toast(`🗺 ผังเมืองแบบที่ ${pl + 1}: ${PLANS[pl].th}`); }
    else if (act === 'down') { if (st <= 0) return G.toast('ยุคแรกแล้ว', true); setLevel(s, st - 1); G.toast(`⏬ กลับเป็นยุค${STAGES[st - 1].th}`); }
    ensureWorld(s); rebuildNpcs(); resetNpcPlans(); rebuildAnimals(); saveNow(); label(); G.hud?.();
  };
  bar.addEventListener('click', e => { const b = e.target.closest('[data-dev]'); if (b) G.devAction(b.dataset.dev); });
  label();
}

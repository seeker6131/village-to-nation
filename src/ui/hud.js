// HUD (DOM) updates — throttled from the game loop.
import { timeLabel, phase } from '../gameState.js';
import { objective as mentorObjective } from '../guide.js';
import { requiredXp } from '../systems.js';
import { JOBS, jobTarget } from '../jobs.js';
import { STAGES } from '../progression.js';
import { BUILDINGS, missingText } from '../construction.js';
import { appearanceKey } from '../character/model.js';
import { roleLabel } from '../leadership.js';
import { PLANS } from '../world.js';
import { ensureKingdom, seasonAt } from '../fantasyKingdom.js';
import { allUnlocked } from '../save.js';
import { G, actionLabel } from './game.js';
import { drawPortrait } from './render.js';
import { regionLabel, TILE } from '../world.js';

const $ = s => document.querySelector(s);
let lastPortrait = '';
export function hud() {
  const s = G.state, p = s.player;
  const h = s.gameTime / 3600, icon = h >= 19 || h < 5 ? '🌙' : h < 7 ? '🌅' : h >= 17 ? '🌇' : '☀️';
  const stage = STAGES[s.town.stage || 0];
  $('#hud-top').innerHTML = `<span class="pill">${icon} วัน ${s.day} · ${timeLabel(s)}</span><span class="pill">🪙 ${Number(p.coins).toLocaleString('th-TH')}</span><span class="pill">🪵 ${p.wood}</span><span class="pill">🪨 ${p.stone}</span><span class="pill stage">${stage.icon} ${stage.th}</span>`;
  $('#hud-name').textContent = s.character?.name || p.name;
  { const b = document.querySelector('#speed-btn'), m = s.tickMultiplier || 1; if (b) { b.textContent = m === 1 ? '⏩' : m + 'x'; b.classList.toggle('on', m > 1); } }
  $('#hud-level').textContent = `Lv.${p.level}`;
  $('#hud-role').textContent = stage.icon + ' ' + (s.leadership?.isLeader ? `${roleLabel(s).replace(' (รักษาการ)', '')} 👍${s.leadership.popularity}` : s.civilService.examPassed ? s.civilService.rank : s.career?.id ? { courier: 'คนส่งของ', farmer: 'เกษตรกร', builder: 'ช่าง', trader: 'พ่อค้าแม่ค้า' }[s.career.id] : 'ประชาชน');
  if (PLANS[s.world.plan]?.id?.startsWith('fantasy_')) { const f=ensureKingdom(s); $('#hud-role').textContent = `👑 ${roleLabel(s)} · ${seasonAt(s.day)} · 🥈${s.player.coins} 🥇${s.player.gold} · ชื่อเสียง ${f.reputation}`; }
  $('#energy-fill').style.width = Math.max(0, Math.min(100, p.stamina)) + '%';
  $('#energy-text').textContent = `${Math.floor(p.stamina)}/100`;
  $('#xp-fill').style.width = Math.min(100, Math.round(p.xp / requiredXp(p.level) * 100)) + '%';
  $('#xp-text').textContent = `${p.xp}/${requiredXp(p.level)}`;
  const job = s.job ? jobTarget(s) : null;
  const pin = $('#quest-pin');
  if (s.job) { pin.classList.add('job'); $('#quest-icon').textContent = JOBS[s.job.id].icon; $('#quest-text').textContent = `${JOBS[s.job.id].th} → ${job?.label || ''}`; }
  else { pin.classList.remove('job'); const m = mentorObjective(s); $('#quest-icon').textContent = '🎯'; $('#quest-text').textContent = m.stage === 8 ? 'บทนำสำเร็จ · ดูภารกิจ NPC' : `${m.title}: ${m.detail}`; }
  $('#location').textContent = `${regionLabel(Math.floor(p.x / TILE), Math.floor(p.y / TILE))} · ${phase(s)}`;
  const near = G.near;
  $('#action-label').textContent = G.build ? 'วางอาคาร' : actionLabel(near);
  $('#action-btn').classList.toggle('ready', !!near && !G.build);
  $('#fps-counter').textContent = `${G.measuredFps} FPS · ${G.settings.quality.toUpperCase()} · ${G.resolution}`;
  const key = s.character ? appearanceKey(s.character.appearance) : '';
  if (key !== lastPortrait && s.character) { lastPortrait = key; drawPortrait($('#avatar-canvas'), s.character.appearance, allUnlocked(s)); }
  const m = document.querySelector('#measured-fps'); if (m) m.textContent = G.measuredFps;
}

export function syncBuildBar() {
  const bar = $('#buildbar');
  bar.classList.toggle('hidden', !G.build);
  document.querySelector('#app').classList.toggle('building', !!G.build);
  if (!G.build) return;
  const b = BUILDINGS[G.build.type], c = G.build.check;
  $('#bb-name').textContent = `${b.icon} ${b.name} · 🪙${b.coins} 🪵${b.wood} 🪨${b.stone}`;
  const st = $('#bb-status');
  st.textContent = c ? (c.ok ? '✓ ' + c.reason : '✕ ' + c.reason) : 'แตะพื้นที่เพื่อวาง';
  st.className = c ? (c.ok ? 'good' : 'bad') : '';
  $('#bb-confirm').disabled = !c?.ok;
  void missingText;
}

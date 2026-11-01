// Fantasy indoor room: controls isolated from world simulation. Registers actions on G; no import cycle.
import { G, saveNow, simulate } from './game.js';
import { GAME_SECONDS_PER_REAL_SECOND } from '../gameState.js';
import { FANTASY_INTERIORS } from '../fantasyManifest.js';
import { ROYAL_RANKS, ensureKingdom, canAppoint, requestRoyalAppointment, exchangeCurrency, tradeWithTown, seasonAt } from '../fantasyKingdom.js';

const $ = q => document.querySelector(q);
const ROOMS = Object.freeze({
  castle: { name: 'ห้องโถงพระราชา', host: 'มหาดเล็ก', image: null, sleep: false },
  cottage: { name: 'บ้านของเจ้า', host: 'เจ้าของบ้าน', image: null, sleep: true },
  inn: { name: 'โรงเตี๊ยม', host: 'เจ้าของโรงเตี๊ยม', image: 'int_fish', sleep: true, cost: 4 },
  dorm: { name: 'เรือนพักคนงาน', host: 'ผู้ดูแลห้องพัก', image: 'int_hunter', sleep: true, cost: 1 },
  market: { name: 'ร้านขายของ', host: 'พ่อค้า', image: 'int_fish', sleep: false },
  hall: { name: 'ห้องว่าการ', host: 'เสมียน', image: 'int_tailor', sleep: false },
  fishing: { name: 'บ้านชาวประมง', host: 'พ่อค้าปลา', image: 'int_fish', sleep: false },
  blacksmith: { name: 'โรงตีเหล็ก', host: 'ช่างเหล็ก', image: 'int_hunter', sleep: false },
});

export function roomOf(id) { return ROOMS[id] || { name: 'ภายในอาคาร', host: 'ผู้ดูแล', image: 'int_tailor', sleep: false }; }
export function canSleep(s, room) {
  const R = roomOf(room);
  if (!R.sleep) return { ok: false, msg: 'ที่นี่ไม่มีเตียงให้นอน' };
  if (s.gameTime < 17 * 3600) return { ok: false, msg: 'นอนได้ตั้งแต่ 17:00 เป็นต้นไป' };
  if (s.fantasy?.lastSleepDay === s.day) return { ok: false, msg: 'วันนี้พักผ่อนไปแล้ว' };
  if ((s.player.coins || 0) < (R.cost || 0)) return { ok: false, msg: `ต้องใช้เหรียญเงิน ${R.cost}` };
  return { ok: true, cost: R.cost || 0 };
}
export function restUntilMorning(s, room, advance) {
  const check = canSleep(s, room);
  if (!check.ok) return check;
  const day = s.day;
  const seconds = (86400 - s.gameTime + 6 * 3600) / (GAME_SECONDS_PER_REAL_SECOND * Math.max(1, Math.min(20, s.tickMultiplier || 1)));
  s.player.coins -= check.cost;
  s.fantasy = s.fantasy || {};
  s.fantasy.lastSleepDay = day;
  advance(seconds); // game.simulate runs every normal daily hook (economy, welfare, quests, NPCs)
  return { ok: true, day: s.day, cost: check.cost };
}

let scene = null, cx = 182, cy = 228, raf = 0, backdrop = null;
function paint() {
  if (!scene || !$('#in-scene')) return;
  const c = $('#in-scene'), g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, c.width, c.height);
  if (backdrop?.complete && backdrop.naturalWidth) g.drawImage(backdrop, 0, 0, c.width, c.height);
  else {
    g.fillStyle = '#12251e'; g.fillRect(0, 0, 362, 272);
    g.fillStyle = '#526554'; g.fillRect(22, 38, 318, 212);
    g.fillStyle = '#685340'; for (let x = 24; x < 339; x += 16) g.fillRect(x, 46, 1, 202);
    g.fillStyle = '#9a8261'; g.fillRect(112, 75, 138, 39);
    g.fillStyle = '#33261e'; g.fillRect(156, 75, 48, 13);
    g.fillStyle = '#f5c969'; g.fillRect(38, 54, 8, 20); g.fillRect(316, 54, 8, 20);
    g.fillStyle = '#252525'; g.fillRect(151, 248, 58, 24);
  }
  // Shopkeeper behind counter, facing the room.
  g.fillStyle = '#b7a17d'; g.fillRect(174, 99, 16, 11);
  g.fillStyle = '#5a4b67'; g.fillRect(170, 110, 24, 18);
  g.fillStyle = '#3e2a2c'; g.fillRect(171, 95, 20, 5);
  g.fillStyle = '#fff0b2'; g.fillRect(178, 108, 2, 2); g.fillRect(184, 108, 2, 2);
  // Player avatar (walking in-room with WASD or touch controls).
  g.fillStyle = '#20383a'; g.fillRect(Math.round(cx - 7), Math.round(cy + 4), 14, 2);
  g.fillStyle = '#d8ae8a'; g.fillRect(Math.round(cx - 6), Math.round(cy - 20), 12, 10);
  g.fillStyle = '#4a372e'; g.fillRect(Math.round(cx - 7), Math.round(cy - 23), 14, 5);
  g.fillStyle = '#98a68f'; g.fillRect(Math.round(cx - 7), Math.round(cy - 9), 14, 15);
  g.fillStyle = '#493e39'; g.fillRect(Math.round(cx - 6), Math.round(cy + 6), 5, 7); g.fillRect(Math.round(cx + 2), Math.round(cy + 6), 5, 7);
  raf = requestAnimationFrame(paint);
}
function step(dx, dy) {
  if (!scene) return;
  cx = Math.max(29, Math.min(331, cx + dx)); cy = Math.max(136, Math.min(259, cy + dy));
  if (cy >= 258 && cx >= 152 && cx <= 210) leave();
}
function leave() {
  scene = null; cancelAnimationFrame(raf); backdrop = null; G.indoor = null;
  $('#indoor')?.classList.add('hidden'); saveNow();
}
function enter(id) {
  if (scene) return;
  scene = roomOf(id); G.indoor = id; cx = 182; cy = 228;
  $('#in-room-title').textContent = scene.name;
  $('#in-host').textContent = `${scene.host}: ยินดีต้อนรับ! ต้องการพักหรือออกไปข้างนอก?`;
  $('#in-sleep').classList.toggle('hidden', !scene.sleep);
  $('#in-royal').classList.toggle('hidden', id !== 'castle');
  $('#in-trade').classList.toggle('hidden', !['market','inn'].includes(id));
  $('#in-sleep').textContent = scene.cost ? `นอนถึงเช้า (${scene.cost} เหรียญเงิน)` : 'นอนถึงเช้า';
  if (scene.image && FANTASY_INTERIORS[scene.image]) {
    backdrop = new Image();
    const path = 'fantasy/' + scene.image, source = window.__V2N_ASSET_MAP__?.[path] || './assets/' + path + '.webp';
    backdrop.src = source;
  }
  $('#indoor').classList.remove('hidden'); cancelAnimationFrame(raf); paint();
}
export function initIndoor() {
  G.enterIndoor = enter; G.leaveIndoor = leave;
  $('#in-exit').addEventListener('click', leave);
  $('#in-royal').addEventListener('click', () => {
    if (G.indoor !== 'castle') return;
    const result = requestRoyalAppointment(G.state), f = ensureKingdom(G.state);
    $('#in-host').textContent = result.ok ? `พระราชาแต่งตั้งเจ้าเป็น ${result.title}!` : `ยศ ${ROYAL_RANKS[f.rank].th} · ชื่อเสียง ${f.reputation}, ประชาชน ${f.popularity}, พระราชา ${f.royalFavor}. ${result.msg}`;
    if (result.ok) { saveNow(); G.hud(); }
  });
  $('#in-trade').addEventListener('click', () => {
    const r = tradeWithTown(G.state, 'wood');
    $('#in-host').textContent = r.ok ? `ขายไม้ 8 ชิ้น ได้ ${r.revenue} เหรียญเงิน · ${seasonAt(G.state.day)}` : r.msg;
    if (r.ok) { saveNow(); G.hud(); }
  });
  $('#in-sleep').addEventListener('click', () => {
    if (!scene) return;
    const id = G.indoor; G.keys.clear(); G.stick.active = false; G.route = []; G.waypoint = null;
    const res = restUntilMorning(G.state, id, sec => simulate(sec));
    if (!res.ok) { $('#in-host').textContent = res.msg; return; }
    $('#in-host').textContent = `${scene.host}: อรุณสวัสดิ์! วันที่ ${res.day}`;
    G.toast(`🌅 เช้าวันที่ ${res.day} · ค่าพัก ${res.cost} เหรียญเงิน`); G.hud(); saveNow();
  });
  $('#in-scene').addEventListener('click', e => {
    const r = e.currentTarget.getBoundingClientRect(), x = (e.clientX - r.left) * 362 / r.width, y = (e.clientY - r.top) * 272 / r.height;
    if (y > 239 && x > 135 && x < 227) leave(); else step(Math.sign(x - cx) * 12, Math.sign(y - cy) * 12);
  });
  $('#in-controls').addEventListener('click', e => { const b = e.target.closest('[data-step]'); if (b) { const d = b.dataset.step; step(d === 'left' ? -12 : d === 'right' ? 12 : 0, d === 'up' ? -12 : d === 'down' ? 12 : 0); } });
  document.addEventListener('keydown', e => {
    if (!scene) return;
    const k = e.key.toLowerCase();
    if (['escape', 'e'].includes(k)) leave();
    if (k === 'w' || k === 'arrowup') step(0, -12);
    if (k === 's' || k === 'arrowdown') step(0, 12);
    if (k === 'a' || k === 'arrowleft') step(-12, 0);
    if (k === 'd' || k === 'arrowright') step(12, 0);
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);
}

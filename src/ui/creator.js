// Dressing room: first-run character creation (name TH/EN + appearance) and later editing.
import { HAIR_STYLES, HAIR_STYLE_NAMES, HAIR_COLORS, SKIN_TONES, EYE_COLORS, OUTFITS, DEFAULT_APPEARANCE, BEARD_STYLES, HAT_STYLES, validateName, NAME_ERRORS, normalizeAppearance, outfitAvailable } from '../character/model.js';
import { rigAtlasReady, rigFrameRect, WALK_FRAMES } from '../character/rig.js';
import { fantasyAtlasReady, fantasyFrameRect } from '../character/fantasy.js';
import { allUnlocked } from '../save.js';
import { G, saveNow } from './game.js';
import { sfx } from '../audio.js';

const $ = s => document.querySelector(s);
const DIRS = ['down', 'left', 'up', 'right'];
const T = {
  th: { mode1: 'สร้างตัวละคร', mode2: 'ห้องแต่งตัว', title: 'ห้องแต่งตัว', name: 'ชื่อตัวละคร (ไทย / English)', hair: 'ทรงผม', hairColor: 'สีผม', skin: 'สีผิว', eyes: 'สีตา', outfit: 'ชุด', random: 'สุ่ม', cancel: 'ยกเลิก', start: 'เริ่มใช้ชีวิต', save: 'บันทึก', walk: 'ดูท่าเดิน', note: 'บันทึกอัตโนมัติ · แก้ไขได้ภายหลังที่เมนู 👕 แต่งตัว', dirs: { down: 'ด้านหน้า', left: 'ด้านซ้าย', up: 'ด้านหลัง', right: 'ด้านขวา' }, original: 'สีเดิม', lockJob: 'ปลดล็อกจากอาชีพ/ตำแหน่ง', lockShop: 'ของร้าน OBT (ยังไม่เปิดขาย)', tryNote: 'กำลังลองสวมชุดจากร้าน — บันทึกได้เฉพาะชุดที่ปลดล็อกแล้ว', placeholder: 'เช่น ต้นกล้า หรือ River' },
  en: { mode1: 'Create character', mode2: 'Dressing room', title: 'Dressing room', name: 'Character name (Thai / English)', hair: 'Hair style', hairColor: 'Hair colour', skin: 'Skin tone', eyes: 'Eye colour', outfit: 'Outfit', random: 'Random', cancel: 'Cancel', start: 'Start my life', save: 'Save', walk: 'Walk preview', note: 'Saved automatically · edit later from 👕 Wardrobe', dirs: { down: 'Front', left: 'Left', up: 'Back', right: 'Right' }, original: 'Original', lockJob: 'Unlocked by career/role', lockShop: 'OBT store item (not on sale)', tryNote: 'Trying a store outfit — only unlocked outfits can be saved', placeholder: 'e.g. Tonkla or River' },
};
let draft = null, mode = 'first', lang = 'th', dirIndex = 0, tryOutfit = null, raf = 0;

export function openCreator(m = 'edit', opts = {}) {
  mode = G.state.character ? m : 'first';
  const c = G.state.character;
  lang = c?.lang || 'th';
  draft = { name: c?.name || '', appearance: normalizeAppearance(c?.appearance || DEFAULT_APPEARANCE, allUnlocked(G.state)) };
  tryOutfit = opts.tryOutfit || null;
  if (tryOutfit) draft.appearance.outfit = tryOutfit;
  G.closePanel();
  G.creatorOpen = true;
  $('#creator').classList.remove('hidden');
  $('#cr-name').value = draft.name;
  $('#cr-error').textContent = '';
  build(); loop();
  if (mode === 'first') setTimeout(() => $('#cr-name').focus({ preventScroll: true }), 50);
}
function close() { $('#creator').classList.add('hidden'); G.creatorOpen = false; cancelAnimationFrame(raf); }

function unlocked() { return allUnlocked(G.state); }
function preview(appearance) { return { ...appearance }; }

function build() {
  const L = T[lang];
  document.querySelectorAll('.cr-lang button').forEach(b => b.classList.toggle('on', b.dataset.lang === lang));
  $('#cr-mode').textContent = mode === 'first' ? L.mode1 : L.mode2;
  $('#cr-title').textContent = L.title;
  $('#cr-name-label').textContent = L.name; $('#cr-name').placeholder = L.placeholder;
  $('#cr-hair-label').textContent = L.hair; $('#cr-haircolor-label').textContent = L.hairColor;
  $('#cr-skin-label').textContent = L.skin; $('#cr-eyes-label').textContent = L.eyes; $('#cr-outfit-label').textContent = L.outfit;
  $('#cr-random-label').textContent = L.random; $('#cr-cancel').textContent = L.cancel; $('#cr-confirm-label').textContent = mode === 'first' ? L.start : L.save;
  $('#cr-walk-label').textContent = L.walk; $('#cr-note').textContent = tryOutfit ? L.tryNote : L.note;
  $('#cr-cancel').classList.toggle('hidden', mode === 'first');
  const a = draft.appearance;
  // hair styles with mini previews
  $('#cr-hair').innerHTML = HAIR_STYLES.map(h => `<button type="button" data-k="hair" data-v="${h}" class="${a.hair === h ? 'on' : ''}"><canvas width="44" height="44" data-mini="${h}"></canvas><span>${HAIR_STYLE_NAMES[h][lang]}</span></button>`).join('');
  const sw = (key, table) => Object.entries(table).map(([id, c]) => `<button type="button" data-k="${key}" data-v="${id}" title="${c[lang]}" aria-label="${c[lang]}" class="${a[key] === id ? 'on' : ''} ${c.rgb ? '' : 'orig'}" style="--c:rgb(${(c.rgb || [0, 0, 0]).join(',')})"></button>`).join('');
  $('#cr-beard-label').textContent = lang === 'th' ? 'หนวดเครา' : 'Beard';
  $('#cr-hat-label').textContent = lang === 'th' ? 'หมวก' : 'Hat';
  $('#cr-beard').innerHTML = BEARD_STYLES.map(id => `<button type="button" data-k="beard" data-v="${id}" class="${(a.beard || 'none') === id ? 'on' : ''}">${id === 'none' ? '—' : id}</button>`).join('');
  $('#cr-hat').innerHTML = HAT_STYLES.map(id => `<button type="button" data-k="hat" data-v="${id}" class="${(a.hat || 'none') === id ? 'on' : ''}">${id === 'none' ? '—' : id}</button>`).join('');
  $('#cr-haircolor').innerHTML = sw('hairColor', HAIR_COLORS);
  $('#cr-skin').innerHTML = sw('skin', SKIN_TONES);
  $('#cr-eyes').innerHTML = sw('eyes', EYE_COLORS);
  const un = unlocked();
  $('#cr-outfit').innerHTML = Object.entries(OUTFITS).map(([id, o]) => {
    const ok = outfitAvailable(id, un), trying = id === tryOutfit;
    if (o.npcOnly || (!ok && !trying && o.source === 'shop')) return '';
    return `<button type="button" data-k="outfit" data-v="${id}" class="${a.outfit === id ? 'on' : ''} ${ok ? '' : 'locked'}" title="${ok ? o[lang] : o.source === 'shop' ? L.lockShop : L.lockJob}"><canvas width="44" height="44" data-outfit="${id}"></canvas><span>${ok ? '' : '🔒 '}${o[lang]}</span></button>`;
  }).join('');
  for (const c of document.querySelectorAll('#cr-hair canvas')) mini(c, { ...a, hair: c.dataset.mini });
  for (const c of document.querySelectorAll('#cr-outfit canvas')) mini(c, { ...a, outfit: c.dataset.outfit }, 18);
  $('#cr-strip').innerHTML = DIRS.map(d => `<canvas width="80" height="80" data-dir="${d}"></canvas>`).join('');
  for (const c of document.querySelectorAll('#cr-strip canvas')) drawFrame(c, a, c.dataset.dir, 0, false);
  validate(false);
}
function allOutfitsUnlocked() { return [...unlocked(), ...(tryOutfit ? [tryOutfit] : []), ...Object.keys(OUTFITS)]; }
function mini(c, a, yOff = 6) {
  const paper = fantasyAtlasReady(preview(a));
  const sheet = paper || rigAtlasReady(preview(a)); const g = c.getContext('2d');
  g.imageSmoothingEnabled = false; g.clearRect(0, 0, c.width, c.height);
  if (!sheet) { setTimeout(() => G.creatorOpen && mini(c, a, yOff), 120); return; } // still baking
  g.drawImage(sheet, paper ? 18 : 18, paper ? 10 : yOff + 6, 44, 44, 0, 0, c.width, c.height);
}
function drawFrame(c, a, dir, t, walking) {
  const paper = fantasyAtlasReady(preview(a));
  const sheet = paper || rigAtlasReady(preview(a), { urgent: true }); const g = c.getContext('2d');
  g.imageSmoothingEnabled = false; g.clearRect(0, 0, c.width, c.height);
  const r = paper ? fantasyFrameRect(dir, walking ? 1 + Math.floor(t * 10) % WALK_FRAMES : 0) : rigFrameRect(dir, walking ? 1 + Math.floor(t * 10) % WALK_FRAMES : 0);
  g.drawImage(sheet, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
}
function loop() {
  cancelAnimationFrame(raf);
  const step = ms => {
    if (!G.creatorOpen) return;
    const dir = DIRS[dirIndex];
    drawFrame($('#cr-canvas'), draft.appearance, dir, ms / 1000, $('#cr-walk').checked);
    $('#cr-dir').textContent = T[lang].dirs[dir];
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}
function validate(show = true) {
  const v = validateName($('#cr-name').value);
  $('#cr-error').textContent = !v.ok && show ? NAME_ERRORS[v.code][lang] : '';
  return v;
}
function confirm() {
  const v = validate(true);
  if (!v.ok) { sfx('error'); $('#cr-name').focus(); return; }
  const un = unlocked();
  let appearance = { ...draft.appearance };
  let note = '';
  if (!outfitAvailable(appearance.outfit, un)) { appearance.outfit = G.state.character?.appearance?.outfit || DEFAULT_APPEARANCE.outfit; note = lang === 'th' ? ' (ชุดที่ยังไม่ปลดล็อกไม่ถูกบันทึก)' : ' (locked outfit not saved)'; }
  const first = mode === 'first';
  G.state.character = { name: v.name, lang, appearance: normalizeAppearance(appearance, un), created: true };
  G.state.player.name = v.name;
  saveNow(); close(); sfx('level'); G.hud();
  G.toast(first ? (lang === 'th' ? `ยินดีต้อนรับ ${v.name}! ไปคุยกับครูอุ่นที่ศูนย์บุกเบิกได้เลย` : `Welcome, ${v.name}! Talk to Kru Aun at the pioneer centre.`) : (lang === 'th' ? 'บันทึกตัวละครแล้ว' : 'Character saved') + note);
  if (first) G.onFirstStart?.();
}

export function initCreator() {
  G.openCreator = openCreator;
  document.addEventListener('v2n-fantasy-ready', () => { if (G.creatorOpen) build(); });
  $('#creator').addEventListener('click', e => {
    const b = e.target.closest('[data-k]');
    if (b) { draft.appearance = { ...draft.appearance, [b.dataset.k]: b.dataset.v }; sfx('click'); build(); return; }
    const l = e.target.closest('[data-lang]');
    if (l) { lang = l.dataset.lang; build(); }
  });
  $('#cr-prev').addEventListener('click', () => { dirIndex = (dirIndex + 3) % 4; $('#cr-dir').textContent = T[lang].dirs[DIRS[dirIndex]]; });
  $('#cr-next').addEventListener('click', () => { dirIndex = (dirIndex + 1) % 4; $('#cr-dir').textContent = T[lang].dirs[DIRS[dirIndex]]; });
  $('#cr-name').addEventListener('input', () => { draft.name = $('#cr-name').value; validate(true); });
  $('#cr-name').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') confirm(); });
  $('#cr-confirm').addEventListener('click', confirm);
  $('#cr-cancel').addEventListener('click', () => { close(); G.toast(lang === 'th' ? 'ยกเลิก ไม่บันทึกการเปลี่ยนแปลง' : 'Cancelled, nothing changed'); });
  $('#cr-random').addEventListener('click', () => {
    const pick = o => { const k = Object.keys(o); return k[Math.floor(Math.random() * k.length)]; };
    const free = Object.keys(OUTFITS).filter(id => outfitAvailable(id, unlocked()));
    draft.appearance = { hair: HAIR_STYLES[Math.floor(Math.random() * HAIR_STYLES.length)], hairColor: pick(HAIR_COLORS), skin: pick(SKIN_TONES), eyes: pick(EYE_COLORS), beard: BEARD_STYLES[Math.floor(Math.random() * BEARD_STYLES.length)], hat: HAT_STYLES[Math.floor(Math.random() * HAT_STYLES.length)], outfit: free[Math.floor(Math.random() * free.length)] };
    build();
  });
}

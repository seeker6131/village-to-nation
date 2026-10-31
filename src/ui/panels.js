// Side-drawer menus. Every button maps to a real rule function; disabled buttons explain why.
import { PROJECTS, PROJECT_ORDER, EXAM_QUESTIONS, CIVIL_EXAM_QUESTIONS, takeExam, takeCivilExam, electionEligibility, registerCandidate, runDemoElection, study, mentorObjective, timeLabel, phase, SAVE_KEY } from '../gameState.js';
import { TOOLS, MARKET, RECIPES, QUESTS, MEALS_PER_DAY, MEAL_ENERGY, marketLocked, itemCount, marketBuyPrice, marketSellPrice, buyMarket, sellMarket, craft, eatFood, upgradeSkill, requiredXp, plant, harvest, gardenProgress, questProgress, claimQuest, refreshDaily, getTownStats } from '../systems.js';
import { ECON, POLICIES, ensureEconomy, nap, setTax, togglePolicy, budgetPreview, sleepQuality, taxRate } from '../economy.js';
import { CIVIL_RANKS, SHIFT_ENERGY, ensureCivil, isCivilServant, nextPromotion, civilShift, resignCivil, rejoinCivil } from '../career.js';
import { BUILDINGS, PUBLIC_LEVELS, PUBLIC_WORK, stageLock, startPublic, upgradeStructure, upgradeCost, helpConstruction, findStructure, progressOf, hasResources, missingText, costText, HELP_ENERGY, gardenYield } from '../construction.js';
import { JOBS, CAREERS, CAREER_OUTFIT_JOBS, jobAvailable, acceptJob, cancelJob, chooseCareer, jobTarget } from '../jobs.js';
import { NPC_QUESTS, questsFor, questStatus, questReady, questProgressText, rewardText, acceptQuest, turnInQuest } from '../quests.js';
import { CATALOG, SHOP_CATEGORIES, purchase, grantMockEntitlement, owns, validateCatalog } from '../shop.js';
import { STAGES, LEADERSHIP_LADDER } from '../progression.js';
import { ensureLeadership, popularityFactors, termDaysLeft, canRun, roleLabel, volunteer, VOLUNTEER_ENERGY, PARLIAMENT, TERM_DAYS, MAX_CONSECUTIVE } from '../leadership.js';
import { plotObstacles, REGIONS, BIOMES, WORLD, TILE } from '../world.js';
import { population, housingCapacity, npcPhrase, allNpcDefs, isDone, officialsCount } from '../npcs.js';
import { OUTFITS } from '../character/model.js';
import { saveSettings } from '../performance.js';
import { configureAudio, sfx, audioState } from '../audio.js';
import { G, result, saveNow, enterBuild, resetNpcPlans, rebuildNpcs } from './game.js';
import { PAVE, roadSegments, segmentLevel, paveCost, paveSegment, pavedShare, TIERS, tierOf, tierInfo, officeNeeds, slotState, nextTierCheck, leftoverTrees, hireClearing, CLEAR_COST, upgradeVillage, publicUnlocked, publicTier, SLOT_KINDS, openSlots, slotObstacles } from '../villageLayout.js';
import { objective } from '../guide.js';
import { clearPropTiles } from '../villageProps.js';
import { myHome, claimPlot, houseSlots, CLAIM_FEE, HOUSE_COST } from '../housing.js';
import { CORRUPT_ACTS, corruptAct, catchChance, ensureCorruption, BAN_DAYS } from '../corruption.js';
import { applySettings } from './settingsApply.js';
import { HZ_DESIGNS, HZ_TIERS } from '../artMap.js';
import { ensureCrime, policeOfficers, policeLabel } from '../crime.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const fmt = n => Number(n).toLocaleString('th-TH');
const btn = (label, act, id = '', { disabled = false, cls = 'btn small', title = '' } = {}) => `<button class="${cls}" data-act="${act}" data-id="${esc(id)}" ${disabled ? 'disabled' : ''} title="${esc(title)}">${label}</button>`;
const chipCost = c => `${c.coins ? `<span class="chip">🪙 ${c.coins}</span>` : ''}${c.wood ? `<span class="chip">🪵 ${c.wood}</span>` : ''}${c.stone ? `<span class="chip">🪨 ${c.stone}</span>` : ''}`;
const bar = p => `<div class="progress"><div style="width:${Math.round(p * 100)}%"></div></div>`;
const hrs = min => `${Math.round(min / 60 * 10) / 10} ชม.เกม`;

const TITLES = { inventory: '🎒 กระเป๋าและทักษะ', jobs: '💼 งานและอาชีพ', build: '🏗️ ก่อสร้างและอัปเกรด', market: '🛒 ตลาดชุมชน', craft: '🔨 ผลิตสินค้า', quests: '📜 ภารกิจ', civil: '📝 สายข้าราชการ', leader: '🏛️ สายผู้นำ', shop: '🎀 ร้านค้า OBT (ตัวอย่าง)', settings: '⚙️ ตั้งค่ากราฟิกและเสียง', menu: '☰ เมนูและบันทึก', town: '🏘️ สถิติหมู่บ้าน' };

export function openPanel(name, arg = null) {
  if (name === 'wardrobe') { G.openCreator('edit'); return; }
  if (G.away && ['build', 'home', 'leader'].includes(name)) { G.toast(`ที่นี่คือ${G.away.map.th} เมืองของคนอื่น — สร้าง จองที่ดิน และงานผู้นำ ทำได้ที่หมู่บ้านของตัวเอง (🚌 ป้ายรถ / ปุ่ม G)`, true); return; }
  G.panel = name; G.panelArg = arg;
  render();
  $('#panel').classList.remove('hidden');
  document.querySelectorAll('.dock button').forEach(b => b.classList.toggle('on', b.dataset.panel === name));
  $('#settings-btn').classList.toggle('on', name === 'settings'); $('#menu-btn').classList.toggle('on', name === 'menu');
  sfx('open');
}
export function closePanel() {
  if (!G.panel) return;
  G.panel = null; G.panelArg = null; $('#panel').classList.add('hidden');
  document.querySelectorAll('.dock button,.hud-tools button').forEach(b => b.classList.remove('on'));
  saveNow();
}
export function refreshPanel() { if (G.panel) render(); }

function render() {
  const s = G.state, n = G.panel, a = G.panelArg;
  let title = TITLES[n] || 'เมนู', body = '';
  switch (n) {
    case 'inventory': body = inventory(); break;
    case 'jobs': body = jobs(); break;
    case 'build': body = build(); break;
    case 'market': body = market(); break;
    case 'craft': body = crafting(); break;
    case 'quests': body = quests(); break;
    case 'civil': body = civil(); break;
    case 'leader': body = leader(); break;
    case 'shop': body = shop(); break;
    case 'settings': body = settings(); break;
    case 'menu': body = menu(); break;
    case 'town': body = town(); break;
    case 'travel': title = '🚌 เดินทาง · แผนที่อำเภอ'; body = G.travelBody ? G.travelBody() : ''; break;
    case 'home': title = '🏠 บ้านของฉัน'; body = home(a); break;
    case 'npc': { const d = allNpcDefs(s).find(x => x.id === a); title = d ? `💬 ${d.name}` : 'ชาวบ้าน'; body = npc(d); break; }
    case 'structure': { const t = findStructure(s, a); title = t ? `${t.kind === 'public' ? '🏛️' : BUILDINGS[t.type].icon} ${t.name}` : 'สิ่งปลูกสร้าง'; body = structure(t); break; }
  }
  $('#panel-title').textContent = title;
  const scroll = $('#panel-body').scrollTop;
  $('#panel-body').innerHTML = body;
  $('#panel-body').scrollTop = scroll;
}

// ------------------------------------------------------------------ my home + career (everyone wants their own house)
function home(focus) {
  const s = G.state, mine = myHome(s), H = s.homes || {};
  const career = s.career?.id ? `${CAREERS[s.career.id].icon} ${CAREERS[s.career.id].th}` : null;
  let top;
  if (mine) {
    const st = slotState(s, mine).state, left = slotObstacles(s, mine, 4, 3).length, p = s.placed.find(q => q.type === 'cottage' && q.tx === mine.tx && q.ty === mine.ty);
    top = `<div class="card ${st === 'done' ? 'done' : 'active'}"><b>🏠 ${esc(mine.name)}</b><small>${st === 'done' ? `บ้านระดับ ${p.level} — อัปเกรดบ้านให้สวยขึ้นตามยุคได้ที่ปุ่มจัดการ` : st === 'building' ? `กำลังสร้าง ${Math.floor(progressOf(p) * 100)}%` : left ? `ถางต้นไม้/ตอในแปลงอีก ${left} จุด แล้วสร้างบ้าน` : 'ที่ดินพร้อม สร้างบ้านได้เลย'}</small>
      <div>${st === 'empty' ? btn(`🔨 สร้างบ้าน (${costText(HOUSE_COST)})`, 'placeSlot', mine.id, { disabled: left > 0 }) : btn('จัดการบ้าน', 'openStructure', p.uid, { cls: 'btn ghost small' })} ${btn('📍 ไปที่ดิน', 'gotoSlot', mine.id, { cls: 'btn ghost small' })}</div></div>`;
  } else {
    const free = houseSlots(s).filter(x => !H[x.id] && slotState(s, x).state === 'empty');
    top = `<div class="notice info">ทุกคนในหมู่บ้านมีสิทธิ์จองที่ดินบ้าน <b>คนละ 1 แปลง</b> (ค่าโอน ${CLAIM_FEE} เหรียญเข้าคลังหมู่บ้าน) แล้วสร้าง/อัปเกรดบ้านด้วยเงินที่หาเองจากอาชีพ</div>
    ${free.length ? free.map(x => `<div class="card ${x.id === focus ? 'active' : ''}"><div class="row"><div><b>🏡 ${esc(x.name)}</b><small>แปลง 4×3 ช่อง · ผังระดับ ${x.tier}</small></div>${btn(`จอง (${CLAIM_FEE}🪙)`, 'claimPlot', x.id, { disabled: s.player.coins < CLAIM_FEE })} ${btn('📍', 'gotoSlot', x.id, { cls: 'btn ghost small' })}</div></div>`).join('') : '<div class="notice warn">แปลงบ้านเต็มแล้ว — ให้ผู้นำยกระดับหมู่บ้านเพื่อเปิดแปลงใหม่</div>'}`;
  }
  const owners = houseSlots(s).map(x => { const h = H[x.id], st = slotState(s, x).state; return `<span class="chip ${h?.owner === 'player' ? 'now' : h ? '' : 'good'}">${esc(x.name)}: ${h ? esc(h.owner === 'player' ? 'ฉัน' : h.name) + (st === 'done' ? ' 🏠' : st === 'building' ? ' 🔨' : ` 🏕️ ${h.savings}/${HOUSE_COST.coins}`) : 'ว่าง'}</span>`; }).join(' ');
  // v0.24 pick the design of your own house (every tier has several; villagers get theirs from the plot)
  if (mine) {
    const p = s.placed.find(q => q.type === 'cottage' && q.tx === mine.tx && q.ty === mine.ty), tier = Math.max(1, Math.min(5, p?.level || 1)), cur = p?.style || H[mine.id]?.style;
    const url = n => window.__V2N_ASSET_MAP__?.['v10/' + n] || `./assets/v10/${n}.webp`;
    const designs = (HZ_DESIGNS[tier] || []).map(d => `<button class="design ${cur === d ? 'on' : ''}" data-act="houseStyle" data-id="${d}" title="แบบ ${d.toUpperCase()}"><img src="${url(`hz${tier}${d}_s3`)}" alt="แบบ ${d.toUpperCase()}"><small>แบบ ${d.toUpperCase()}</small></button>`).join('');
    top += `<h3>🎨 แบบบ้าน (${HZ_TIERS[tier]})</h3><div class="designs">${designs}</div><p class="help">เลือกแบบได้ฟรี · อัปเกรดบ้านเป็นระดับใหญ่ขึ้นได้ทุกเมื่อถ้ามีเงินในเกมพอ (กระท่อม → บ้านเล็ก → บ้านกลาง → บ้านสองชั้น → บ้านหรู)</p>`;
  }
  return `${top}<h3>🧑‍🔧 อาชีพของฉัน</h3>${career ? `<div class="card done"><b>${career}</b><small>รับงานที่กระดาน/เมนูงาน ได้ค่าแรง +20% ในสายนี้ เก็บเงินไว้สร้างบ้าน</small>${btn('💼 เปิดเมนูงาน', 'panel', 'jobs', { cls: 'btn ghost small' })}</div>` : `<div class="notice warn">ยังไม่มีอาชีพ — เลือกอาชีพก่อน จะได้มีรายได้สร้างบ้าน</div>${btn('💼 เลือกอาชีพ', 'panel', 'jobs')}`}
  <h3>🏘️ ใครอยู่ที่ไหน</h3><div class="chips">${owners}</div><p class="help">แปลงที่ NPC จอง = ผู้เล่นคนอื่น (ตอนออนไลน์จะเป็นคนจริง) เขาเก็บเงินจากงานทุกวันแล้วสร้างบ้านเอง</p>`;
}

// ------------------------------------------------------------------ inventory
function inventory() {
  const s = G.state, p = s.player;
  return `<div class="notice">🎒 <b>${esc(s.character?.name || p.name)}</b> · Lv.${p.level} · ⭐ ${p.xp}/${requiredXp(p.level)} XP<br>🪙 ${fmt(p.coins)} เหรียญ · 📚 ความรู้ ${p.knowledge} · 🏛 ผลงานชุมชน ${p.civic}</div>
  <h3>🧰 เครื่องมือ</h3><div class="chips">${Object.entries(TOOLS).map(([id, tl]) => `<span class="chip ${itemCount(s, id) ? 'good' : 'bad'}">${tl.icon} ${tl.name} ${itemCount(s, id) ? '✓' : '— ยังไม่มี'}</span>`).join('')}</div>
  <p class="help">ขวาน: ฟันต้นไม้ (3 ครั้งล้ม แล้วขุดตอ) · อีเต้อ: ขุดหิน (ทำได้ที่เมนูผลิต) · เครื่องมือไม่สึกหรอ ไม่ขายเงินจริง</p>
  <h3>📦 ของในกระเป๋า</h3><div class="grid2">${Object.entries(MARKET).map(([id, it]) => `<div class="item"><span class="ico">${it.icon}</span><strong>${itemCount(s, id)}</strong><small>${it.name}</small></div>`).join('')}</div>
  <h3>⚡ พลังงาน ${Math.floor(p.stamina)}/100</h3>${bar(p.stamina / 100)}
  ${(() => { const E = ensureEconomy(s), sl = sleepQuality(s, !!s.leadership?.isLeader), meals = E.today.day === s.day ? E.today.meals || 0 : 0, napped = E.today.day === s.day && E.today.napped;
    return `<div class="row-flex">${btn(`🍞 กินอาหาร +${MEAL_ENERGY} (${meals}/${MEALS_PER_DAY} มื้อ)`, 'eat', '', { disabled: itemCount(s, 'food') < 1 || p.stamina >= 100 || meals >= MEALS_PER_DAY, cls: 'btn' })} ${btn(napped ? '😴 งีบแล้ววันนี้' : `😴 งีบ +${ECON.NAP} (วันละครั้ง)`, 'rest', '', { cls: 'btn ghost', disabled: napped || p.stamina >= 100 })}</div>
  <p class="help">พลังงานเป็นงบรายวัน: ไม่ฟื้นเอง · คืนนี้นอนที่<b>${sl.where}</b> ตื่นมามี ${sl.energy} (บ้านของตัวเอง = 100) · งานหนึ่งใช้ 20–28</p>`; })()}
  <p class="help">พลังงานฟื้นเองช้า ๆ ระหว่างเล่น และ +15 ทุกเช้า ไม่มีการขายพลังงานด้วยเงินจริง</p>
  <h3>🧠 ทักษะ (แต้มคงเหลือ ${p.skillPoints})</h3>
  ${[['gather', 'งานเก็บของ', 'ใช้พลังงานเก็บไม้/หินลดลง'], ['trade', 'ค้าขาย', 'ราคาซื้อในตลาดลด 5% ต่อระดับ'], ['craft', 'งานฝีมือ', 'ได้ XP จากการผลิตเพิ่ม']].map(([id, t, d]) => `<div class="card"><div class="row"><div><b>${t} ${s.skills[id]}/3</b><small>${d}</small></div>${btn('+1', 'skill', id, { disabled: !p.skillPoints || s.skills[id] >= 3 })}</div></div>`).join('')}
  <p class="help">แต้มสกิลได้จากการเลเวลอัปเท่านั้น</p>`;
}

// ------------------------------------------------------------------ jobs & careers
function jobs() {
  const s = G.state, t = jobTarget(s);
  const active = s.job ? `<div class="card active"><div class="row"><div><b>${JOBS[s.job.id].icon} กำลังทำ: ${JOBS[s.job.id].th}</b><small>ไปที่ 📍 ${esc(t?.label || '-')} แล้วกด ✦ (มีลูกศรสีเหลืองนำทาง)</small></div>${btn('ยกเลิกงาน', 'cancelJob', '', { cls: 'btn ghost small' })}</div></div>` : '<p class="help">รับงานได้ครั้งละ 1 งาน ทำเสร็จแล้วค่อยรับงานใหม่</p>';
  const list = Object.entries(JOBS).map(([id, j]) => {
    const a = jobAvailable(s, id), bonus = s.career.id === j.career;
    return `<div class="card ${a.ok ? '' : 'lock'}"><div class="row"><div><b>${j.icon} ${j.th}</b><small>${j.desc}</small></div>${btn('รับงาน', 'acceptJob', id, { disabled: !a.ok || !!s.job })}</div>
    <div class="chips"><span class="chip">🪙 ${Math.round(j.pay * (bonus ? 1.2 : 1))}${bonus ? ' (+20%)' : ''}</span><span class="chip">⚡ ${j.energy}</span><span class="chip">⭐ ${j.xp}</span><span class="chip">${CAREERS[j.career].icon} ${CAREERS[j.career].th}</span>${a.ok ? '' : `<span class="chip bad">${esc(a.reason)}</span>`}</div></div>`;
  }).join('');
  const careers = Object.entries(CAREERS).map(([id, c]) => {
    const n = s.career.jobs[id] || 0, on = s.career.id === id;
    return `<div class="card ${on ? 'done' : ''}"><div class="row"><div><b>${c.icon} ${c.th}${on ? ' (อาชีพปัจจุบัน)' : ''}</b><small>ทำงานสายนี้แล้ว ${n} ครั้ง${c.outfit ? ` · ทำครบ ${CAREER_OUTFIT_JOBS} ครั้งขณะเป็นอาชีพนี้ ปลดล็อก${OUTFITS[c.outfit].th}` : ''}</small></div>${btn(on ? 'เลือกแล้ว' : 'เลือกอาชีพ', 'career', id, { disabled: on })}</div></div>`;
  }).join('');
  return `${active}<h3>📋 งานที่รับได้</h3>${list}<h3>🧑‍🔧 อาชีพ</h3><p class="help">อาชีพให้ค่าแรง +20% กับงานสายเดียวกัน เปลี่ยนได้ฟรีตลอด ไม่เกี่ยวกับสายราชการหรือการเมือง</p>${careers}`;
}

// ------------------------------------------------------------------ construction
// village plan: slots of the current tier + requirements for the next one + the leader's upgrade button
function planSection() {
  const s = G.state, T = tierInfo(s), t = tierOf(s), pop = population(s), chk = nextTierCheck(s, pop);
  const path = TIERS.map(x => `<span class="chip ${x.tier < t ? 'good' : x.tier === t ? 'now' : ''}">${x.icon} ${x.th}<small> · ${x.title}</small></span>`).join('<span class="arrow">›</span>');
  const slots = openSlots(s).filter(x => x.tier === t).map(x => {
    const st = slotState(s, x).state, b = x.kind === 'public' ? null : BUILDINGS[x.kind];
    const left = x.kind === 'public' ? plotObstacles(s, x.id).length : slotObstacles(s, x, b.width, b.height).length;
    const own = x.kind === 'cottage' ? s.homes?.[x.id] : null;
    const act = st === 'done' ? '' : x.kind === 'cottage' ? (!own ? btn('จอง', 'panel', 'home', { cls: 'btn ghost small' }) : own.owner === 'player' && st === 'empty' ? btn('สร้างบ้านฉัน', 'placeSlot', x.id, { cls: 'btn small' }) : '') : x.kind === 'public' ? (st === 'none' || st === 'empty' ? btn('📍 ไปที่ดิน', 'goto', x.id, { cls: 'btn ghost small' }) : '') : st === 'empty' ? btn('สร้างที่แปลงนี้', 'placeSlot', x.id, { cls: 'btn small' }) : '';
    return `<div class="slot ${st}"><b>${st === 'done' ? '✅' : st === 'building' ? '🔨' : '⬜'} ${x.name}</b>${x.kind === 'cottage' ? `<small>👤 ${own ? esc(own.owner === 'player' ? 'ของฉัน' : own.name) : 'ยังไม่มีเจ้าของ'}</small>` : ''}<small>${st === 'done' ? 'เสร็จแล้ว' : st === 'building' ? 'กำลังสร้าง' : left ? `🪓 ถางอีก ${left} จุด` : 'ที่ดินพร้อม'}</small>${act}</div>`;
  }).join('');
  const next = chk.next;
  const req = next ? `<div class="card ${chk.ok ? 'active' : next.locked ? 'lock' : ''}"><b>⬆ ยกระดับเป็น ${next.icon} ${next.th} — คุณจะเป็น${next.title}</b>
    ${chk.items.map(i => `<small>${i.ok ? '✅' : '⬜'} ${esc(i.label)}${i.note ? ` <i>(${esc(i.note)})</i>` : ''}</small>`).join('')}
    ${next.locked ? `<div class="notice warn">🔒 ${esc(next.locked)}</div>` : ''}
    ${btn(`${next.icon} ยกระดับเป็น${next.th}`, 'upgradeVillage', '', { disabled: !chk.ok })}${!chk.ok && !next.locked ? '<small>ทำให้ครบทุกข้อก่อน — ใช้เงินซื้อไม่ได้</small>' : ''}</div>` : '';
  return `<div class="plan"><div class="plan-head">${T.icon} <b>ผัง${T.th}</b> · ระดับ ${t}/${TIERS.length} · คุณคือ <b>${esc(roleLabel(s))}</b></div><div class="plan-path">${path}</div>
  <h3>🗺️ แปลงในผังระดับนี้</h3><div class="slots">${slots || '<p class="help">ไม่มีแปลง</p>'}</div>${req}</div>`;
}
function build() {
  const s = G.state;
  const pub = PROJECT_ORDER.map(id => {
    if (!publicUnlocked(s, id)) return `<div class="card lock"><b>🔒 ${PROJECTS[id].name}</b><small>อยู่ในผังระดับ ${publicTier(id)} — ปลดล็อกเมื่อยกระดับหมู่บ้าน</small></div>`;
    const p = PROJECTS[id], site = s.publicSites[id], prog = progressOf(site);
    const st = site.status === 'building' ? `<small>🔨 กำลังสร้าง ${Math.floor(prog * 100)}% (ต้องใช้แรงงาน ${hrs(site.workNeeded)})</small>${bar(prog)}${btn(`🙌 ช่วยสร้าง (−${HELP_ENERGY}⚡)`, 'help', id)} ${btn('📍 ไปที่ไซต์', 'goto', id, { cls: 'btn ghost small' })}`
      : site.level >= 1 ? `<small>✅ ระดับ ${site.level}${upgradeCost('public', id, site.level) ? '' : ' (สูงสุด)'}</small>${upgradeRow('public', id, site.level, id)}`
      : (() => { const c = { wood: p.wood, stone: p.stone }; const hallLock = id === 'hall' && !(s.projects.home && s.projects.market); const left = plotObstacles(s, id).length; return `<div class="chips">${chipCost(c)}<span class="chip">⏱ ${hrs(PUBLIC_WORK[id])}</span><span class="chip good">ผลงาน +${p.civic}</span><span class="chip ${left ? 'bad' : 'good'}">${left ? `🪓 ต้องถางอีก ${left} จุด` : '✅ ถางที่ดินแล้ว'}</span></div>${hallLock ? '<span class="chip bad">ต้องสร้างบ้านพักและตลาดให้เสร็จก่อน</span>' : hasResources(s, c) ? '' : `<span class="chip bad">${missingText(s, c)}</span>`}<div>${btn('เริ่มก่อสร้าง', 'startPublic', id, { disabled: hallLock || !hasResources(s, c) || left > 0 })} ${btn('📍 ไปที่ดิน', 'goto', id, { cls: 'btn ghost small' })}</div>`; })();
    return `<div class="card ${site.level >= 1 ? 'done' : ''}"><b>${site.level >= 1 ? '✅' : '🏗️'} ${p.name}</b><small>${p.desc} · ${publicEffectText(id, Math.max(1, site.level))}</small>${st}</div>`;
  }).join('');
  const priv = Object.entries(BUILDINGS).filter(([, b]) => !b.hidden).map(([id, b]) => `<div class="card"><div class="row"><div><b>${b.icon} ${b.name}</b><small>${b.desc} · พื้นที่ ${b.width}×${b.height} ช่อง · ใช้แรงงาน ${hrs(b.work)}${SLOT_KINDS.includes(id) ? ` · <b>แปลงว่างในผัง ${openSlots(s).filter(x => x.kind === id && slotState(s, x).state === 'empty').length}</b>` : ''}</small></div>${SLOT_KINDS.includes(id) ? btn('เลือกแปลง', 'placeMode', id, { disabled: !openSlots(s).some(x => x.kind === id && slotState(s, x).state === 'empty') }) : btn('เลือกตำแหน่ง', 'placeMode', id)}</div><div class="chips">${chipCost(b)}${hasResources(s, b) ? '<span class="chip good">ทรัพยากรพอ</span>' : `<span class="chip bad">${missingText(s, b)}</span>`}</div></div>`).join('');
  const mine = s.placed.length ? s.placed.map(p => { const b = BUILDINGS[p.type]; return `<div class="card ${p.status === 'building' ? 'active' : ''}"><div class="row"><div><b>${b.icon} ${b.name}</b><small>${p.status === 'building' ? `🔨 ${p.upgradingTo ? 'อัปเกรด' : 'สร้าง'} ${Math.floor(progressOf(p) * 100)}%` : `ระดับ ${p.level}`} · พิกัด ${p.tx},${p.ty}</small></div>${btn('จัดการ', 'openStructure', p.uid, { cls: 'btn ghost small' })}</div></div>`; }).join('') : '<p class="help">ยังไม่มีสิ่งปลูกสร้างส่วนตัว</p>';
  return `${planSection()}<div class="notice info">ทุกระดับมี<b>ผังสำเร็จรูป</b>: บ้าน ตลาด ศาลา โรงงาน สร้างได้เฉพาะบนแปลงตามผัง (หมุดสีเหลืองในแมพ) · ถางต้นไม้/ตอในแปลงก่อน → สร้าง → ครบทุกแปลง + ประชากรพอ → ผู้นำกดยกระดับ แล้วผังจะขยาย · ของตกแต่ง (แปลงผัก ม้านั่ง โคมไฟ รั้ว ทางเดิน) วางอิสระในเขตหมู่บ้าน</div>
  <h3>🏛️ โครงการสาธารณะ</h3>${pub}<h3>🧱 อาคารและของตกแต่ง</h3>${priv}<h3>📋 ของฉัน</h3>${mine}`;
}
function publicEffectText(id, lv) {
  const e = PUBLIC_LEVELS[id][lv - 1];
  return { home: `รองรับผู้อยู่ใหม่ +${e.residents}`, farm: `ลุงมีผลิตอาหาร ${e.foodPerHour}/ชม.`, market: `NPC ซื้อมื้อกลางวัน · แม่ค้าขาย ×${e.shoppers}`, hall: `งบคลังเมือง +${e.treasuryPerDay}/วัน · ที่ประชุมตอนเย็น` }[id];
}
function upgradeRow(kind, type, level, ref) {
  const next = upgradeCost(kind, type, level);
  if (!next) return '';
  const s = G.state;
  const lock = stageLock(s, next);
  return `<div class="chips"><span class="chip">⬆ ระดับ ${level + 1}</span>${chipCost(next)}<span class="chip">⏱ ${hrs(next.work)}</span>${lock ? `<span class="chip bad">🔒 ${lock}</span>` : ''}${hasResources(s, next) ? '' : `<span class="chip bad">${missingText(s, next)}</span>`}</div>${btn('อัปเกรด', 'upgrade', ref, { disabled: !!lock || !hasResources(s, next) })}`;
}
function structure(t) {
  if (!t) return '<p>ไม่พบสิ่งปลูกสร้าง</p>';
  const s = G.state, o = t.obj;
  if (t.kind === 'public' && o.status === 'none') { G.panel = 'build'; return build(); }
  let out = '';
  if (o.status === 'building') out += `<div class="card active"><b>🔨 ${o.upgradingTo ? `อัปเกรดเป็นระดับ ${o.upgradingTo}` : 'กำลังก่อสร้าง'} ${Math.floor(progressOf(o) * 100)}%</b>${bar(progressOf(o))}<small>แรงงานที่เหลือ ${hrs(o.workNeeded - o.work)} · ช่าง NPC ที่มาช่วยจะเร่งให้เร็วขึ้น</small>${btn(`🙌 ช่วยสร้าง (−${HELP_ENERGY}⚡)`, 'help', t.id, { cls: 'btn' })}</div>`;
  if (t.kind === 'public') out += `<div class="card done"><b>ระดับ ${o.level}</b><small>${publicEffectText(t.type, Math.max(1, o.level))}</small></div>${o.status === 'done' ? upgradeRow('public', t.type, o.level, t.id) : ''}`;
  else {
    const b = BUILDINGS[t.type];
    out += `<p>${b.desc}</p><div class="kv"><span>ระดับ</span><b>${o.level || '-'}</b><span>ขนาด</span><b>${b.width}×${b.height}</b></div>`;
    if (t.type === 'garden' && o.level >= 1) {
      const prog = gardenProgress(s, o);
      out += `<div class="card"><b>🌱 แปลงผัก (ผลผลิต ${gardenYield(o)} ต่อรอบ)</b><small>${o.plantedAt === null ? 'ยังไม่ได้ปลูก' : prog >= 1 ? 'โตเต็มที่ เก็บได้แล้ว!' : `กำลังโต ${Math.floor(prog * 100)}% (1 วันในเกม = 20 นาทีจริง)`}</small>${o.plantedAt !== null ? bar(prog) : ''}
      <div>${btn(`ปลูก (เมล็ด ${itemCount(s, 'seed')})`, 'plant', o.uid, { disabled: o.plantedAt !== null || itemCount(s, 'seed') < 1 })} ${btn('เก็บเกี่ยว', 'harvest', o.uid, { disabled: o.plantedAt === null || prog < 1 })}</div></div>`;
    }
    if (o.status === 'done') out += `<h3>⬆ อัปเกรด</h3>${upgradeRow('private', t.type, o.level, t.id) || '<p class="help">ระดับสูงสุดแล้ว</p>'}`;
  }
  return out;
}

// ------------------------------------------------------------------ market & crafting
function market() {
  const s = G.state;
  const open = isDone(s, 'market');
  return `<div class="notice">🛒 ราคาเปลี่ยนตามสต็อก: ของน้อย = ซื้อแพง · ของล้น = ขายได้ถูกลง NPC ผลิต (สวน/โรงงาน) และซื้ออาหารกลางวันจริง ${open ? '' : '<br>💡 สร้าง "ตลาดหมู่บ้าน" แล้ว NPC จะมากินข้าวกลางวันที่ตลาด (ภาษีเข้าคลังเมือง)'}</div>
  ${Object.entries(MARKET).map(([id, it]) => { const bp = marketBuyPrice(s, id), sp = marketSellPrice(s, id), lk = marketLocked(s, id); return `<div class="card ${lk ? 'lock' : ''}"><div class="row"><div><b>${it.icon} ${it.name}</b><small>ของฉัน ${itemCount(s, id)} · สต็อกตลาด ${s.market[id]}${lk ? ` · 🔒 ${lk}` : ''}</small></div><div>${bp ? btn(`ซื้อ ${bp}🪙`, 'buy', id, { disabled: !!lk || s.player.coins < bp || s.market[id] < 1 }) : ''} ${btn(`ขาย ${sp}🪙`, 'sell', id, { disabled: itemCount(s, id) < 1, cls: 'btn ghost small' })}</div></div></div>`; }).join('')}
  <p class="help">เงินในเกมได้จากการทำงานเท่านั้น ไม่มีการซื้อเหรียญด้วยเงินจริง</p>`;
}
function crafting() {
  const s = G.state;
  return Object.entries(RECIPES).map(([id, r]) => {
    const enough = Object.entries(r.input).every(([k, v]) => itemCount(s, k) >= v) && !(r.once && Object.keys(r.output).some(k => itemCount(s, k) > 0));
    const ws = !r.needs || s.placed.some(p => p.type === r.needs && p.level >= 1);
    return `<div class="card ${ws ? '' : 'lock'}"><div class="row"><div><b>🔨 ${r.name}</b><small>${Object.entries(r.input).map(([k, v]) => `${(MARKET[k] || TOOLS[k]).icon}${(MARKET[k] || TOOLS[k]).name} ${itemCount(s, k)}/${v}`).join(' + ')} → ${Object.entries(r.output).map(([k, v]) => `${(MARKET[k] || TOOLS[k]).icon}${(MARKET[k] || TOOLS[k]).name} ${v}`).join(' + ')}${r.once && Object.keys(r.output).some(k => itemCount(s, k) > 0) ? ' · มีแล้ว ✓' : ''}</small></div>${btn('ผลิต', 'craft', id, { disabled: !enough || !ws })}</div>${ws ? '' : '<span class="chip bad">ต้องสร้างโรงงานงานฝีมือให้เสร็จก่อน</span>'}</div>`;
  }).join('') + '<p class="help">ของที่ผลิตขายได้ที่ตลาด ราคาตามสต็อก</p>';
}

// ------------------------------------------------------------------ quests
function quests() {
  const s = G.state; refreshDaily(s);
  const step = objective(s);
  const daily = QUESTS.map(q => { const pr = questProgress(s, q.id), cl = s.daily.claimed.includes(q.id); return `<div class="card ${cl ? 'done' : ''}"><div class="row"><div><b>${cl ? '✅' : '📌'} ${q.name}</b><small>${q.desc} · ${pr}/${q.goal}</small></div>${btn(cl ? 'รับแล้ว' : `รับ ${q.reward}🪙`, 'claim', q.id, { disabled: cl || pr < q.goal })}</div>${bar(pr / q.goal)}</div>`; }).join('');
  const npcq = NPC_QUESTS.map(q => { const st = questStatus(s, q.id), who = allNpcDefs(s).find(d => d.id === q.npc); return `<div class="card ${st === 'done' ? 'done' : st === 'active' ? 'active' : ''}"><b>${st === 'done' ? '✅' : st === 'active' ? '🟦' : '❔'} ${q.title} · ${esc(who?.name)}</b><small>${q.text}</small><div class="chips"><span class="chip">${st === 'available' ? 'ไปคุยกับ ' + esc(who?.name) + ' เพื่อรับ' : st === 'active' ? questProgressText(s, q) : 'สำเร็จแล้ว'}</span><span class="chip good">${rewardText(q.reward)}</span></div>${st === 'active' ? btn('📍 นำทางไปหา NPC', 'gotoNpc', q.npc, { cls: 'btn ghost small' }) : ''}</div>`; }).join('');
  return `<div class="notice">👩‍🏫 <b>ครูอุ่น (ผู้นำชั่วคราว)</b><p>“ทุกคนช่วยกันสร้างหมู่บ้าน เมื่อพร้อมแล้วชาวบ้านจะเลือกผู้นำคนแรกเอง”</p></div>
  <div class="card active"><b>🎯 บทนำขั้น ${step.stage}/8: ${esc(step.title)}</b><small>${esc(step.detail)}</small>${bar(step.progress)}</div>
  <h3>📅 งานประจำวัน</h3>${daily}<h3>💬 คำขอจาก NPC (รับ/ส่งโดยไปคุยกับ NPC)</h3>${npcq}
  <div class="row-flex" style="margin-top:8px">${btn('📖 อ่านหนังสือ +1 ความรู้', 'study', '', { cls: 'btn ghost small' })} ${btn('🏘️ สถิติหมู่บ้าน', 'panel', 'town', { cls: 'btn ghost small' })}</div>`;
}
function npc(d) {
  if (!d) return '<p>ไม่พบ NPC</p>';
  const s = G.state;
  const qs = questsFor(d.id).map(q => { const st = questStatus(s, q.id); return `<div class="card ${st === 'done' ? 'done' : st === 'active' ? 'active' : ''}"><b>${q.title}</b><small>${q.text}</small><div class="chips"><span class="chip good">${rewardText(q.reward)}</span>${st === 'active' ? `<span class="chip">${questProgressText(s, q)}</span>` : ''}</div>${st === 'available' ? btn('รับภารกิจ', 'acceptQuest', q.id) : st === 'active' ? btn('ส่งมอบ', 'turnIn', q.id, { disabled: !questReady(s, q) }) : '<small>✅ เสร็จแล้ว ขอบคุณนะ!</small>'}</div>`; }).join('');
  const runtime = G.npcs.find(n => n.def.id === d.id);
  const life = s.town.life?.[d.id], bar = (v, c) => `<span style="display:inline-block;width:70px;height:7px;border-radius:4px;background:#0003;vertical-align:middle"><i style="display:block;height:100%;width:${Math.round(v)}%;background:${c};border-radius:4px"></i></span> ${Math.round(v)}`;
  const act = { patrol: 'ออกตรวจรอบเมือง', office: 'ทำงานที่ที่ทำงาน', sleep: 'นอนหลับ', home: 'อยู่บ้าน', lunch: 'กินข้าวกลางวัน', relax: 'นั่งพักที่ม้านั่ง', meeting: runtime?.plan?.place === 'gov' ? 'ประชุมที่ที่ว่าการ' : 'ประชุมที่ศาลา', social: 'คุยกับเพื่อนบ้าน', build: 'ไปช่วยก่อสร้าง', craft: 'ทำงานที่โรงงาน', gather: 'หาไม้', chop: 'ถางป่าโค่นต้นไม้', farm: 'ทำสวนอาหารชุมชน', forage: 'หาของป่า', sell: 'ขายของ', work: 'ทำงาน' }[runtime?.plan?.activity] || '—';
  return `<div class="notice">👋 <b>${esc(d.name)}</b> · ${esc(d.role)}<p>“${esc(npcPhrase(s, d))}”</p></div><div class="kv"><span>ตอนนี้</span><b>${act}</b><span>อาชีพ</span><b>${esc(runtime?.def.role || d.role)}</b>${life ? `<span>🍚 หิว</span><b>${bar(life.hunger, '#e8913a')}</b><span>⚡ แรง</span><b>${bar(life.energy, '#5cc46a')}</b><span>🪙 เงินเก็บ</span><b>${life.coins}</b>` : ''}</div>${qs ? `<h3>คำขอ</h3>${qs}` : ''}${d.id === 'mentor' ? `<div style="margin-top:8px">${btn('🎯 ดูบทนำของครูอุ่น', 'panel', 'quests')} ${btn('😴 งีบที่ศูนย์ (วันละครั้ง)', 'rest', '', { cls: 'btn ghost small' })}</div>` : ''}`;
}

// ------------------------------------------------------------------ civil service (career track, separate from politics)
function civil() {
  const s = G.state, c = ensureCivil(s), np = nextPromotion(s);
  const can = s.player.knowledge >= 2 && s.stats.deliveries >= 1, isL = !!s.leadership?.isLeader;
  const ladder = `<div class="ladder">${CIVIL_RANKS.map((r, i) => `<div class="card ${c.examPassed && i < c.grade ? 'done' : c.examPassed && i === c.grade ? 'active' : ''}"><b>${i + 1}. ${r.th}${c.examPassed && i === c.grade ? ' (ตอนนี้)' : ''}</b><small>เงินเดือน ${r.pay}/วัน · วันทำงาน ${r.shifts} · ความรู้ ${r.knowledge}${r.tier >= 3 ? ` · พื้นที่ระดับ${r.tier >= 4 ? 'จังหวัด' : 'อำเภอ'}ขึ้นไป` : ''}</small></div>`).join('')}</div>`;
  const exam = c.examPassed
    ? `<div class="card ${c.resigned ? 'lock' : 'done'}"><b>${c.resigned ? '⏸ ลาออกจากราชการแล้ว' : '✅'} ${c.rank}</b><small>ทำงานแล้ว ${c.shifts} วัน${np ? ` · ขั้นต่อไป ${np.rank.th}: ${np.missing.length ? np.missing.join(' · ') : 'ครบแล้ว เลื่อนตอนเข้าเวรครั้งหน้า'}` : ' · ตำแหน่งสูงสุดของสายราชการ'}</small>
      ${c.resigned ? btn('↩️ กลับเข้ารับราชการ', 'rejoin', '', { disabled: isL, cls: 'btn' }) + (isL ? '<small>ต้องพ้นจากตำแหน่งการเมืองก่อน</small>' : '')
        : `${btn(`📋 เข้าเวรเต็มวัน (−${SHIFT_ENERGY}⚡) +${CIVIL_RANKS[c.grade].pay} ก่อนหักภาษี`, 'civilShift', '', { disabled: c.lastShiftDay === s.day || isL || s.player.stamina < SHIFT_ENERGY, cls: 'btn' })}
        ${isL ? '<small>ดำรงตำแหน่งการเมืองอยู่ ทำงานราชการพร้อมกันไม่ได้</small>' : c.lastShiftDay === s.day ? '<small>วันนี้เข้าเวรแล้ว</small>' : ''}
        ${btn('🚪 ลาออกเพื่อลงการเมือง', 'resign', '', { cls: 'btn ghost small' })}`}</div>`
    : !can ? `<div class="notice warn">คุณสมบัติก่อนสอบ: ความรู้ ${s.player.knowledge}/2 · ส่งพัสดุ ${s.stats.deliveries}/1</div>${btn('📖 อ่านหนังสือ +1', 'study')}`
    : `<form id="civil-form">${CIVIL_EXAM_QUESTIONS.map((q, i) => `<div class="quiz"><b>${i + 1}. ${q.q}</b>${q.choices.map((v, j) => `<label><input type="radio" name="c${i}" value="${j}" ${j === 0 ? 'checked' : ''}/> ${v}</label>`).join('')}</div>`).join('')}<button class="btn" type="submit">ส่งข้อสอบข้าราชการ</button></form>`;
  return `<div class="notice info">สายข้าราชการแบบไทยจริง: สอบเข้า ทำงาน สะสมวัน เรียนเพิ่ม แล้วเลื่อนขั้นถึง<b>นายอำเภอ</b>และ<b>ผู้ว่าราชการจังหวัด</b> · ข้าราชการลงเลือกตั้งไม่ได้ ต้องลาออกก่อน (แยกสายกับการเมือง) · ไม่มีการซื้อผลสอบหรือตำแหน่ง</div>${exam}
  <h3>🪜 ลำดับขั้นราชการ</h3>${ladder}<p class="help">เงินเดือนจ่ายจากรัฐส่วนกลาง หักภาษีเข้าคลังพื้นที่ · ผ่านการสอบแล้วจะปลดล็อก "ชุดข้าราชการ" ในห้องแต่งตัว</p>`;
}

// ------------------------------------------------------------------ leadership (politics, separate track)
function leader() {
  const s = G.state, p = s.player, L = ensureLeadership(s), pf = popularityFactors(s), cr = canRun(s);
  const FN = { happiness: '😊 ความสุขชาวบ้าน', housing: '🏠 ที่อยู่อาศัย', food: '🍱 อาหารพอ', progress: '🏗️ โครงการสาธารณะ', policies: '📜 นโยบาย', tax: '💸 อัตราภาษี', budget: '🏦 คลังจ่ายตรงเวลา', integrity: '🧼 ความซื่อสัตย์' };
  const examBlock = s.examPassed ? '<div class="card done"><b>✅ ผ่านใบรับรองผู้นำชุมชน — ลงเลือกตั้งได้</b></div>'
    : p.knowledge < 3 ? `<div class="notice warn">ต้องมีความรู้ 3 ก่อนสอบผู้นำ (ตอนนี้ ${p.knowledge}/3) — ถ้าไม่ผ่านก่อนหมดวาระ จะลงเลือกตั้งไม่ได้</div>${btn('📖 อ่านหนังสือ +1', 'study')}`
    : `<form id="exam-form">${EXAM_QUESTIONS.map((q, i) => `<div class="quiz"><b>${i + 1}. ${q.q}</b>${q.choices.map((v, j) => `<label><input type="radio" name="q${i}" value="${j}" ${j === 0 ? 'checked' : ''}/> ${v}</label>`).join('')}</div>`).join('')}<button class="btn" type="submit">ส่งข้อสอบผู้นำ</button></form>`;
  const C = ensureCorruption(s), risk = Math.round(catchChance(s) * 100);
  const dark = L.isLeader ? `<h3>🤫 ห้องลับ (ทางเลือกสีเทา)</h3><div class="notice warn">อำนาจอยู่ในมือมึง จะซื่อหรือจะโกงก็ได้ — แต่ทุกครั้งทิ้ง<b>หลักฐาน</b> ป.ป.ช. นักข่าว และชาวบ้านจับตาอยู่ โดนจับ = ยึดเงินคืน ความนิยมร่วง คดีหนัก/ซื้อเสียง = ปลดจากตำแหน่ง + ตัดสิทธิ์ ${BAN_DAYS} วัน · ผู้นำมือสะอาดได้ความนิยม +4</div>
    <div class="range"><span style="min-width:130px">🕵️ ความเสี่ยงโดนจับ</span><div class="progress" style="flex:1"><div style="width:${risk}%;background:${risk > 30 ? '#c8553d' : '#e0a84a'}"></div></div><b>${risk}%/วัน</b></div>
    ${Object.entries(CORRUPT_ACTS).map(([id, a]) => `<div class="card"><div class="row"><div><b>${a.icon} ${a.th}</b><small>${a.desc}</small></div>${btn('ทำ', 'corrupt', id, { cls: 'btn warn small' })}</div></div>`).join('')}
    ${C.voteBuy ? `<small>ซื้อเสียงไว้แล้ว +${C.voteBuy} คะแนน (ใช้ในการเลือกตั้งครั้งหน้า)</small>` : ''}${C.scandals.length ? `<div class="card lock"><b>📰 คดีที่ผ่านมา</b>${C.scandals.map(x => `<small>วันที่ ${x.day}: ${esc(x.by)} · ยึด ${x.seized}${x.severe ? ' · ถูกปลด' : ''}</small>`).join('')}</div>` : ''}` : '';
  const E = ensureEconomy(s), pv = budgetPreview(s, population(s), officialsCount(s)), led = E.last, rate = taxRate(s);
  const ledger = led ? `<div class="card"><b>📒 บัญชีคลังเมื่อวาน (วันที่ ${led.day})</b>${Object.entries(led.in).map(([k, v]) => `<small>➕ ${esc(k)} ${v}</small>`).join('')}${Object.entries(led.out).map(([k, v]) => `<small>➖ ${esc(k)} ${v}</small>`).join('')}</div>` : '';
  const budget = `<h3>🏦 งบประมาณพื้นที่</h3><div class="grid2">${[['🏦', 'คลังตอนนี้', fmt(Math.floor(s.town.treasury))], ['📈', 'รับ/วัน (ประมาณ)', '+' + pv.income], ['📉', 'จ่าย/วัน', '−' + pv.spend], ['⚖️', 'สุทธิ/วัน', (pv.net >= 0 ? '+' : '') + pv.net]].map(([i, n, v]) => `<div class="item"><span class="ico">${i}</span><strong>${v}</strong><small>${n}</small></div>`).join('')}</div>
    <p class="help">คลังได้จากภาษีเงินได้ (ทั้งค่าแรงคุณและชาวบ้าน) ภาษีบ้าน เงินอุดหนุนจากรัฐ · จ่ายค่าดูแลอาคาร เงินเดือนข้าราชการ นโยบาย และ<b>ค่าก่อสร้าง/อัปเกรดอาคารสาธารณะ</b> · เงินคลังไม่ใช่เงินส่วนตัว</p>${ledger}`;
  const office = L.isLeader ? `<h3>🏛️ ห้องทำงานผู้นำ</h3>
    <div class="card"><b>💸 ภาษีเงินได้ ${rate}%</b><small>สูง = คลังรวยแต่คนไม่ชอบ (ความนิยม ${pf.factors.tax >= 0 ? '+' : ''}${pf.factors.tax}) · มาตรฐาน ${ECON.TAX.def}%</small><div class="row-flex">${[0, 5, 10, 15, 20, 25].map(r => btn(`${r}%`, 'setTax', String(r), { disabled: r === rate, cls: r === rate ? 'btn small' : 'btn ghost small' })).join(' ')}</div></div>
    <h3>📜 นโยบาย (จ่ายจากคลังทุกวัน)</h3>${Object.entries(POLICIES).map(([id, P]) => { const on = s.town.policies.includes(id), lock = tierOf(s) < P.tier;
      return `<div class="card ${on ? 'done' : lock ? 'lock' : ''}"><div class="row"><div><b>${P.icon} ${P.name}</b><small>${P.desc} · ${P.cost}/วัน · ความนิยม +${P.pop} · ความสุข +${P.happy}${lock ? ` · 🔒 พื้นที่ระดับ ${P.tier}` : ''}${E.suspended.includes(id) && !on ? ' · ⚠️ ถูกระงับเพราะคลังไม่พอ' : ''}</small></div>${btn(on ? 'ยกเลิก' : 'อนุมัติ', 'policy', id, { disabled: lock || (!on && s.town.treasury < P.cost * 3), cls: on ? 'btn ghost small' : 'btn small' })}</div></div>`; }).join('')}`
    : `<div class="notice warn">ตอนนี้ <b>${esc(L.leaderName || 'NPC')}</b> เป็นผู้นำ คุณยังเป็น${L.founder ? 'ผู้ก่อตั้ง (เก็บป้ายและที่ดินไว้)' : 'ชาวบ้าน'} ทำงานจิตอาสาสะสมผลงาน แล้วลงสมัครสมัยหน้า</div>`;
  const roads = (() => { const segs = roadSegments(s), t = tierOf(s), top = PAVE.reduce((m, p, i) => t >= p.tier ? i : m, 0), P = G.state.player;
    if (!segs.length) return '';
    const near = [...segs].sort((a, b) => Math.hypot(a.x - P.x / TILE, a.y - P.y / TILE) - Math.hypot(b.x - P.x / TILE, b.y - P.y / TILE)).slice(0, 10);
    return `<h3>🛣️ ถนนในพื้นที่ (ปูแล้ว ${Math.round(pavedShare(s) * 100)}%)</h3><p class="help">ถนนเริ่มเป็นทางดิน ผู้นำเลือกปูทีละช่วงด้วยงบคลัง · ${PAVE.map(p => `${p.icon} ${p.th}${p.cost ? ` ${p.cost}/ช่อง (ระดับ ${p.tier}+)` : ''}`).join(' · ')} · ถนนดีทำให้ชาวบ้านมีความสุข · เรียงจากช่วงที่ใกล้ตัวคุณ</p>
    ${near.map(g => { const lv = segmentLevel(s, g); return `<div class="card ${lv >= top ? 'done' : ''}"><div class="row"><div><b>${PAVE[lv].icon} ${esc(g.name)}</b><small>${g.tiles.length} ช่อง · ตอนนี้: ${PAVE[lv].th}</small></div><div>${PAVE.map((p, i) => i > lv && t >= p.tier ? btn(`${p.icon} ${p.th} ${paveCost(s, g, i)}`, 'pave', `${g.id}|${i}`, { disabled: !L.isLeader || s.town.treasury < paveCost(s, g, i) }) : '').join(' ')} ${btn('📍', 'gotoTile', `${g.x},${g.y}`, { cls: 'btn ghost small', title: 'เดินไปดู' })}</div></div></div>`; }).join('')}
    ${segs.length > 10 ? `<small>และอีก ${segs.length - 10} ช่วง — เดินไปใกล้ถนนช่วงนั้นแล้วเปิดเมนูนี้</small>` : ''}`; })();
  const forest = (() => { const left = leftoverTrees(s); if (!left.length) return ''; const cost = left.length * CLEAR_COST;
    return `<div class="card"><div class="row"><div><b>🌳 ป่าที่เหลือในพื้นที่ที่เปิดแล้ว ${left.length} ต้น</b><small>ตัดเองได้ไม้ หรือจ้างคนถางทีเดียว ${CLEAR_COST}/ต้น จากคลัง</small></div><div>${btn(`🪓 จ้างถาง ${cost}`, 'hireClear', '', { disabled: !L.isLeader || (s.town.treasury || 0) < cost })}</div></div></div>`; })();
  const vol = `<div class="card"><div class="row"><div><b>🤝 งานจิตอาสา</b><small>วันละครั้ง −${VOLUNTEER_ENERGY}⚡ · ผลงานทางการเมือง +1 (ทางสะสมผลงานตอนไม่ได้เป็นผู้นำ)</small></div>${btn(L.volunteerDay === s.day ? 'ทำแล้ววันนี้' : 'ไปช่วย', 'volunteer', '', { disabled: L.volunteerDay === s.day || s.player.stamina < VOLUNTEER_ENERGY })}</div></div>`;
  const pmCard = L.seats ? `<div class="card ${L.pm ? 'done' : ''}"><b>🏛️ สภาผู้แทนราษฎร (วันที่ ${L.seats.day})</b><small>พรรคของคุณ ${L.seats.seats} + พรรคร่วม ${L.seats.partners} จาก ${PARLIAMENT} ที่นั่ง → ${L.pm ? '✅ ได้เป็นนายกรัฐมนตรี' : '❌ ไม่ถึงครึ่ง เป็นฝ่ายค้าน'}</small></div>` : '';
  return `<div class="notice info"><b>${L.founder ? '🌲 ผู้ก่อตั้งหมู่บ้าน' : '🏘️ ชาวบ้าน'}</b> · ${roleLabel(s)}<br>ผู้ก่อตั้งเป็น "ผู้นำรักษาการ" วาระแรก แต่ตำแหน่ง<b>ไม่ถาวร</b>: ทุก ${TERM_DAYS} วันในเกมมีเลือกตั้ง ความนิยมมาจากความเป็นอยู่ของชาวบ้านเท่านั้น จำกัด ${MAX_CONSECUTIVE} วาระติดต่อกัน · <b>เงินจริงซื้อคะแนนหรือตำแหน่งไม่ได้</b></div>
  <div class="grid2">${[['🗓️', 'สมัยที่', L.term], ['⏳', 'วันที่เหลือในวาระ', termDaysLeft(s)], ['👍', 'ความนิยม', L.popularity], ['🔁', 'วาระติดต่อกัน', `${L.isLeader ? L.consecutive : 0}/${MAX_CONSECUTIVE}`]].map(([i, n, v]) => `<div class="item"><span class="ico">${i}</span><strong>${v}</strong><small>${n}</small></div>`).join('')}</div>
  <h3>👍 ความนิยมคิดจากอะไร (วันนี้ ${pf.total})</h3>${Object.entries(pf.factors).map(([k, v]) => `<div class="range"><span style="min-width:130px">${FN[k] || k}</span><div class="progress" style="flex:1"><div style="width:${Math.max(0, Math.min(100, v / 40 * 100))}%;${v < 0 ? 'background:#c8553d' : ''}"></div></div><b>${v}</b></div>`).join('')}
  <p class="help">ความนิยมจริงขยับเข้าหาค่าวันนี้ทีละวัน · ชาวบ้านหิว บ้านไม่พอ หรืองานไม่คืบ = คะแนนตก</p>
  <h3>🗳️ สถานะลงสมัครสมัยหน้า</h3>${cr.ok ? '<div class="card done"><b>✅ ลงสมัครได้</b><small>ถึงวันเลือกตั้งระบบจะนับคะแนนอัตโนมัติ (จำลอง NPC — ยังไม่ใช่ผู้เล่นจริง)</small></div>' : `<div class="notice warn"><b>ยังลงสมัครไม่ได้:</b> ${cr.why.map(esc).join(' · ')}</div>`}
  ${L.results.length ? `<div class="card"><b>ผลเลือกตั้งที่ผ่านมา</b>${L.results.map(r => `<small>สมัย ${r.term} (วัน ${r.day}): คุณ ${r.player ?? '—'} · ${esc(r.rival)} ${r.rivalScore} → ${r.won ? '✅ ชนะ' : '❌ ไม่ได้รับเลือก'}${r.note ? ' · ' + esc(r.note) : ''}</small>`).join('')}</div>` : ''}
  <div class="grid2">${[['🏅', 'ผลงานทางการเมือง', Math.floor(L.record)], ['📚', 'ความรู้', p.knowledge]].map(([i, n, v]) => `<div class="item"><span class="ico">${i}</span><strong>${v}</strong><small>${n}</small></div>`).join('')}</div>${vol}${pmCard}
  <h3>📝 ข้อสอบผู้นำ</h3>${examBlock}${budget}${office}${roads}${forest}${dark}
  <h3>🪜 เส้นทางสู่นายกรัฐมนตรี (สายการเมือง)</h3><div class="ladder">${TIERS.map(x => { const need = officeNeeds(s, x.tier);
    return `<div class="card ${x.tier < tierOf(s) ? 'done' : x.tier === tierOf(s) ? 'active' : ''}"><b>${x.icon} ${x.th} → ${x.tier === 5 ? 'ส.ส. → นายกรัฐมนตรี (สภาลงมติ)' : x.title}${x.tier === tierOf(s) ? ' (ตอนนี้)' : ''}</b><small>${x.tier <= tierOf(s) ? 'ปลดล็อกแล้ว' : `ประชากร ${x.minPop}${x.publicLv ? ` · อาคารสาธารณะระดับ ${x.publicLv}` : ''}${x.fund ? ` · งบพัฒนา ${fmt(x.fund)} จากคลัง` : ''}`}${need.length ? ` · คุณสมบัติ: ${need.map(q => `${q.ok ? '✅' : '⬜'} ${q.label}`).join(' ')}` : ''}</small></div>`; }).join('')}</div>
  <p class="help">ทุกขั้นได้จากผลงาน คุณสมบัติ งบที่บริหารเอง และการเลือกตั้งเท่านั้น — ซื้อด้วยเงินจริงไม่ได้ · ระดับประเทศ: ชนะเลือกตั้ง ส.ส. แล้วสภาลงมติ ต้องได้เกินครึ่ง ${PARLIAMENT / 2} ที่นั่ง (ผลงานมาก + มือสะอาด = พรรคร่วมเยอะ)${STAGES.length && LEADERSHIP_LADDER.length ? '' : ''}</p>`;
}

// ------------------------------------------------------------------ OBT shop (mock)
function shop() {
  const s = G.state, errs = validateCatalog();
  return `<div class="notice warn">🎀 <b>ร้านค้าตัวอย่างสำหรับ OBT — ยังไม่มีการชำระเงินจริง</b><p>ปุ่มซื้อจะแจ้งว่ายังไม่เปิดขายเสมอ ไม่มีการตัดเงิน ต้องมีเซิร์ฟเวอร์ตรวจใบเสร็จก่อนเปิดจริง</p><p>สินค้าทั้งหมดเป็นของแต่งตัว/ตกแต่ง/ความสะดวก <b>ไม่ขาย</b> คะแนนเลือกตั้ง ผลสอบ ตำแหน่ง เงินในเกม หรือความเร็วก่อสร้าง</p></div>
  ${errs.length ? `<div class="notice warn">ตรวจพบสินค้าไม่ผ่านกฎ: ${errs.map(esc).join(', ')}</div>` : ''}
  ${Object.entries(SHOP_CATEGORIES).map(([cat, c]) => `<h3>${c.icon} ${c.th}</h3>${CATALOG.filter(i => i.cat === cat).map(i => `<div class="card ${i.planned ? 'lock' : ''}"><div class="row"><div><b>${i.th}</b><small>${Object.entries(i.effects).map(([k, v]) => k === 'outfit' ? `ชุด: ${OUTFITS[v]?.th}` : k === 'badge' ? 'ป้ายโปรไฟล์' : k === 'frame' ? 'กรอบรูป' : k === 'title' ? `ฉายา "${v}"` : k === 'wardrobeSlots' ? `ช่องบันทึกชุด +${v}` : k === 'blueprintSlots' ? `ช่องบันทึกผัง +${v}` : k === 'decor' ? 'ของตกแต่ง' : k).join(' · ')}${i.planned ? ' · (แผนงาน ยังไม่มีของในเกม)' : ''}</small></div><b>฿${i.priceTHB}</b></div>
  <div>${owns(s, i.sku) ? '<span class="chip good">มีแล้ว (mock-test)</span>' : btn('ซื้อ', 'buySku', i.sku)} ${i.effects.outfit ? btn('👕 ลองสวม', 'tryOutfit', i.effects.outfit, { cls: 'btn ghost small' }) : ''} ${G.dev && !i.planned && !owns(s, i.sku) ? btn('🧪 ปลดล็อกทดสอบ (dev)', 'mockGrant', i.sku, { cls: 'btn warn small' }) : ''}</div></div>`).join('')}`).join('')}
  <p class="help">ราคาแสดงเป็นบาทเต็ม ไม่มีกล่องสุ่ม ไม่มี FOMO · รายละเอียดใน docs/OBT_MONETIZATION_TH.md</p>`;
}

// ------------------------------------------------------------------ settings / menu / town
function settings() {
  const st = G.settings, a = audioState();
  const fps = [30, 60, 120].map(f => `<button class="choice ${st.fps === f ? 'on' : ''}" data-act="setFps" data-id="${f}">${f} FPS</button>`).join('');
  const q = [['low', 'Low', 'ความละเอียด 50% · ไม่มีเงา/แสง/หิ่งห้อย'], ['medium', 'Medium', 'ความละเอียด 75% · เงา + แสงไฟกลางคืน'], ['high', 'High', 'ความละเอียดเต็ม · น้ำระยิบ · หิ่งห้อย']].map(([id, n, d]) => `<button class="choice ${st.quality === id ? 'on' : ''}" data-act="setQuality" data-id="${id}">${n}<small>${d}</small></button>`).join('');
  return `<h3>🎞️ เฟรมเรตสูงสุด</h3><div class="setting-row">${fps}</div><p class="help">ตอนนี้วัดได้ ≈ <b id="measured-fps">${G.measuredFps || 0}</b> FPS · 120 เป็นเพดาน ถ้าจอ 60Hz จะได้ ~60 · ความเร็วเกมไม่ขึ้นกับ FPS</p>
  <h3>🖼️ คุณภาพกราฟิก</h3><div class="setting-row">${q}</div><p class="help">ความละเอียดภายในตอนนี้ ${G.resolution || '-'}</p>
  <div class="setting-row"><button class="choice ${st.showFps ? 'on' : ''}" data-act="toggleFps">${st.showFps ? '☑' : '☐'} แสดง FPS</button></div>
  <h3>🔊 เสียง</h3>
  <div class="range"><span>เอฟเฟกต์</span><input type="range" min="0" max="100" value="${Math.round(st.sfx * 100)}" data-range="sfx" /><b>${Math.round(st.sfx * 100)}</b></div>
  <div class="range"><span>บรรยากาศ</span><input type="range" min="0" max="100" value="${Math.round(st.ambience * 100)}" data-range="ambience" /><b>${Math.round(st.ambience * 100)}</b></div>
  <div class="setting-row"><button class="choice ${st.muted ? 'on' : ''}" data-act="toggleMute">${st.muted ? '🔇 ปิดเสียงอยู่' : '🔈 ปิดเสียงทั้งหมด'}</button>${btn('▶ ทดสอบเสียง', 'testSound', '', { cls: 'btn ghost small' })}</div>
  <p class="help">สถานะเสียง: ${a.ready ? a.state : 'รอการแตะครั้งแรก (ข้อกำหนดของเบราว์เซอร์)'} · เสียงเป็นเสียงสังเคราะห์ชั่วคราว</p>
  <h3>🖥️ จอ</h3><div class="setting-row">${btn('⛶ สลับเต็มจอ', 'fullscreen', '', { cls: 'btn ghost small' })} ${btn('🔍 รีเซ็ตซูม', 'resetZoom', '', { cls: 'btn ghost small' })}</div>`;
}
function menu() {
  const s = G.state;
  return `<div class="kv"><span>วัน</span><b>${s.day} · ${timeLabel(s)} (${phase(s)})</b><span>ระดับพื้นที่</span><b>${STAGES[s.town.stage || 0].icon} ${STAGES[s.town.stage || 0].th}</b><span>ความปลอดภัย</span><b>${(() => { const c = ensureCrime(s).stats, n = policeOfficers(s); return `${n ? `👮 ${policeLabel(s)} ${n} คนเข้าเวรกลางคืน` : 'ยังไม่มีเวรยาม'} · จับโจรได้ ${c.caughtByPlayer + c.caughtByPolice} · ถูกขโมย ${c.thefts} ครั้ง`; })()}</b></div>
  <div class="setting-row">${btn('💾 บันทึกทันที', 'save', '', { cls: 'btn' })} ${btn('🏘️ สถิติหมู่บ้าน', 'panel', 'town', { cls: 'btn ghost' })} ${btn('🚌 เดินทาง (G)', 'panel', 'travel', { cls: 'btn ghost' })} ${btn('⚙️ ตั้งค่า', 'panel', 'settings', { cls: 'btn ghost' })} ${btn('👕 ห้องแต่งตัว', 'wardrobe', '', { cls: 'btn ghost' })}</div>
  <h3>📌 บันทึกเหตุการณ์</h3><div class="card">${s.history.slice(0, 12).map(x => `<p style="margin:3px 0">• ${esc(x)}</p>`).join('')}</div>
  <h3>🧪 เครื่องมือทดสอบ (ออฟไลน์เท่านั้น)</h3><div class="setting-row">${btn(`⏱ ความเร็วเวลา ${s.tickMultiplier}x`, 'speed', '', { cls: 'btn ghost small' })} ${btn('📍 เดินไปที่ดินบ้านพัก', 'travel', '', { cls: 'btn ghost small' })} ${btn('🗑 ลบเซฟ เริ่มใหม่', 'reset', '', { cls: 'btn warn small' })}</div>
  <p class="help">การเร่งเวลา/วาร์ปเป็นเครื่องมือดีบัก ต้องถอดออกก่อนทำออนไลน์ · เซฟอยู่ในเครื่องนี้ (localStorage key ${SAVE_KEY})</p>`;
}
function town() {
  const s = G.state, t = getTownStats(s), st = STAGES[s.town.stage || 0], nx = STAGES[(s.town.stage || 0) + 1];
  return `<div class="notice"><b>${st.icon} ${st.th}</b>${nx ? `<p>ขั้นถัดไป ${nx.icon} ${nx.th}: ${nx.need}</p>` : ''}</div>
  <div class="grid2">${[['👥', 'ประชากร', `${population(s)}/${housingCapacity(s)}`], ['😊', 'ความสุข', s.town.happiness], ['💰', 'คลังเมือง', s.town.treasury], ['🏛️', 'โครงการสาธารณะ', t.publicBuilt + '/4'], ['🧱', 'อาคารส่วนตัว', t.privateBuilt], ['🍱', 'มื้อที่ตลาด', s.town.mealsServed], ['😣', 'มื้อที่ขาด', s.town.hungryMeals], ['🛠️', 'ค่าเช่าโรงงานที่ได้', s.town.rentEarned]].map(([i, n, v]) => `<div class="item"><span class="ico">${i}</span><strong>${v}</strong><small>${n}</small></div>`).join('')}</div>
  <h3>🌾 สต็อกตลาด</h3><div class="chips">${Object.entries(MARKET).map(([k, v]) => `<span class="chip">${v.icon} ${s.market[k]}</span>`).join('')}</div>
  <p class="help">ผู้อยู่อาศัยใหม่ย้ายเข้าวันละ 1 คนเมื่อมีบ้านว่าง (บ้านพักหลังแรก / บ้านพักชาวบ้าน)</p>
  <h3>🗺️ แผนที่และภูมิภาค</h3><div class="kv"><span>ภูมิประเทศ</span><b>${BIOMES[WORLD.biome].th}</b><span>seed แผนที่</span><b>${WORLD.seed}</b><span>ต้นไม้ที่ถางแล้ว</span><b>${Object.values(s.world.n).filter(v => v === 's' || v === 'x').length}</b></div>
  ${REGIONS.map(r => `<div class="card ${r.status === 'playable' ? 'done' : 'lock'}"><b>${r.status === 'playable' ? '✅' : '🔒'} ${r.th}</b></div>`).join('')}<p class="help">แต่ละหมู่บ้านสร้างแผนที่จาก seed ของตัวเอง หน้าตาจึงไม่ซ้ำกัน เมื่อออนไลน์ ภูมิภาคอื่นจะเป็นหมู่บ้านของผู้เล่นอื่น</p>`;
}

// ------------------------------------------------------------------ actions
function onClick(e) {
  const go = e.target.closest('[data-act]'); if (!go) return;
  const s = G.state, id = go.dataset.id, act = go.dataset.act;
  let r = null, snd = 'click';
  switch (act) {
    case 'panel': return openPanel(id);
    case 'travel': return G.travelTo(id);
    case 'wardrobe': return G.openCreator('edit');
    case 'openStructure': return openPanel('structure', id);
    case 'eat': r = eatFood(s); break;
    case 'rest': r = nap(s); break;
    case 'volunteer': r = volunteer(s); break;
    case 'hireClear': { r = hireClearing(s, !!s.leadership?.isLeader); snd = r.ok ? 'build' : 'error'; break; }
    case 'pave': { const [sid, lv] = id.split('|'); r = paveSegment(s, sid, Number(lv), !!s.leadership?.isLeader); snd = r.ok ? 'build' : 'error'; break; }
    case 'gotoTile': { const [x, y] = id.split(',').map(Number); closePanel(); G.walkTo((x + .5) * TILE, (y + .5) * TILE); return; }
    case 'resign': r = resignCivil(s); break;
    case 'rejoin': r = rejoinCivil(s); break;
    case 'setTax': r = setTax(s, Number(id), !!s.leadership?.isLeader); break;
    case 'skill': r = upgradeSkill(s, id); break;
    case 'acceptJob': r = acceptJob(s, id); break;
    case 'cancelJob': r = cancelJob(s); break;
    case 'career': r = chooseCareer(s, id); break;
    case 'startPublic': r = startPublic(s, id); snd = 'build'; if (r.ok) resetNpcPlans(); break;
    case 'placeMode': return enterBuild(id);
    case 'claimPlot': r = claimPlot(s, id); snd = 'coin'; break;
    case 'gotoSlot': { const sl = openSlots(s).find(x => x.id === id); closePanel(); if (sl) { G.walkTo((sl.tx + 2) * TILE, (sl.ty + 3.4) * TILE); G.toast(`เดินไปที่ ${sl.name}`); } return; }
    case 'corrupt': r = corruptAct(s, id); snd = r.ok ? 'coin' : 'error'; break;
    case 'houseStyle': { const mine = myHome(s); if (!mine) return; const p = s.placed.find(q => q.type === 'cottage' && q.tx === mine.tx && q.ty === mine.ty);
      if (p) p.style = id; s.homes[mine.id].style = id; r = { ok: true, msg: `🎨 เปลี่ยนเป็นแบบ ${id.toUpperCase()} แล้ว` }; break; }
    case 'placeSlot': { const sl = openSlots(s).find(x => x.id === id); if (sl) enterBuild(sl.kind, sl); return; }
    case 'upgradeVillage': r = upgradeVillage(s, population(s)); snd = r.ok ? 'level' : 'error'; if (r.ok) { clearPropTiles(s); resetNpcPlans(); G.onVillageUpgrade?.(r.tier); } break;
    case 'upgrade': r = upgradeStructure(s, id); snd = 'build'; if (r.ok) resetNpcPlans(); break;
    case 'help': r = helpConstruction(s, id); snd = 'build'; break;
    case 'goto': closePanel(); G.walkToStructure(id); return;
    case 'gotoNpc': { const n = G.npcs.find(x => x.def.id === id); closePanel(); if (n) { G.walkTo(n.x, n.y + 12); G.toast(`กำลังเดินไปหา ${n.def.name}`); } return; }
    case 'plant': r = plant(s, id); break;
    case 'harvest': r = harvest(s, id); snd = 'coin'; break;
    case 'buy': r = buyMarket(s, id); snd = 'coin'; break;
    case 'sell': r = sellMarket(s, id); snd = 'coin'; break;
    case 'craft': r = craft(s, id); break;
    case 'claim': r = claimQuest(s, id); snd = 'coin'; break;
    case 'acceptQuest': r = acceptQuest(s, id); break;
    case 'turnIn': r = turnInQuest(s, id); snd = 'coin'; break;
    case 'study': r = study(s); break;
    case 'civilShift': r = civilShift(s); snd = 'coin'; break;
    case 'register': r = registerCandidate(s); break;
    case 'vote': r = runDemoElection(s); snd = 'level'; break;
    case 'policy': r = togglePolicy(s, id, !!s.leadership?.isLeader); break;
    case 'buySku': r = purchase(s, id); break;
    case 'mockGrant': r = grantMockEntitlement(s, id, G.dev); break;
    case 'tryOutfit': return G.openCreator('edit', { tryOutfit: id });
    case 'setFps': G.settings = saveSettings(G.storage, { ...G.settings, fps: Number(id) }); r = { ok: true, msg: `จำกัด FPS สูงสุด ${G.settings.fps}` }; break;
    case 'setQuality': G.settings = saveSettings(G.storage, { ...G.settings, quality: id }); applySettings(); r = { ok: true, msg: `กราฟิก ${id.toUpperCase()} · ความละเอียด ${G.resolution}` }; break;
    case 'toggleFps': G.settings = saveSettings(G.storage, { ...G.settings, showFps: !G.settings.showFps }); applySettings(); r = { ok: true, msg: G.settings.showFps ? 'แสดง FPS' : 'ซ่อน FPS' }; break;
    case 'toggleMute': G.settings = saveSettings(G.storage, { ...G.settings, muted: !G.settings.muted }); configureAudio(G.settings); r = { ok: true, msg: G.settings.muted ? 'ปิดเสียงแล้ว' : 'เปิดเสียงแล้ว' }; break;
    case 'testSound': sfx('level'); r = { ok: true, msg: audioState().ready ? 'เล่นเสียงทดสอบ' : 'เบราว์เซอร์ยังไม่อนุญาตเสียง แตะหน้าจออีกครั้ง' }; break;
    case 'fullscreen': return G.toggleFullscreen();
    case 'resetZoom': G.resetZoom(); r = { ok: true, msg: 'รีเซ็ตซูมแล้ว' }; break;
    case 'save': { const ok = saveNow(); r = { ok, msg: ok ? 'บันทึกเกมแล้ว' : 'บันทึกไม่ได้ (เบราว์เซอร์ไม่อนุญาต)' }; break; }
    case 'speed': s.tickMultiplier = s.tickMultiplier === 1 ? 2 : s.tickMultiplier === 2 ? 5 : s.tickMultiplier === 5 ? 20 : 1; r = { ok: true, msg: `ความเร็วเวลา (ทดสอบ) ${s.tickMultiplier}x` }; break;
    case 'travel': closePanel(); G.walkToStructure('home'); return;
    case 'reset': if (confirm('ลบเซฟในเครื่องนี้และเริ่มใหม่? (ย้อนกลับไม่ได้)')) { try { G.storage.removeItem(SAVE_KEY); } catch { /* */ } G.noSave = true; location.reload(); } return;
  }
  if (r) { if (act === 'career' && r.ok) rebuildNpcs(); result(r, snd); }
}
function onSubmit(e) {
  const f = e.target; if (!['exam-form', 'civil-form'].includes(f.id)) return;
  e.preventDefault();
  const civilF = f.id === 'civil-form', qs = civilF ? CIVIL_EXAM_QUESTIONS : EXAM_QUESTIONS, fd = new FormData(f);
  const answers = qs.map((_, i) => Number(fd.get(`${civilF ? 'c' : 'q'}${i}`)));
  const r = civilF ? takeCivilExam(G.state, answers) : takeExam(G.state, answers);
  result(r, r.ok ? 'level' : 'error');
  if (!r.ok && !civilF && G.state.player.knowledge >= 3) { const n = document.createElement('div'); n.className = 'notice'; n.textContent = 'คำใบ้: ' + EXAM_QUESTIONS.map((q, i) => `ข้อ ${i + 1} ${q.reason}`).join(' · '); $('#panel-body').prepend(n); }
}
function onInput(e) {
  const r = e.target.closest('[data-range]'); if (!r) return;
  G.settings = saveSettings(G.storage, { ...G.settings, [r.dataset.range]: Number(r.value) / 100 });
  configureAudio(G.settings);
  r.nextElementSibling.textContent = r.value;
}

export function initPanels() {
  G.openPanel = openPanel; G.closePanel = closePanel; G.refreshPanel = refreshPanel;
  $('#panel-body').addEventListener('click', onClick);
  $('#panel-body').addEventListener('submit', onSubmit);
  $('#panel-body').addEventListener('input', onInput);
  $('#panel-close').addEventListener('click', closePanel);
  document.querySelectorAll('.dock button').forEach(b => b.addEventListener('click', () => (G.panel === b.dataset.panel ? closePanel() : openPanel(b.dataset.panel))));
  $('#settings-btn').addEventListener('click', () => (G.panel === 'settings' ? closePanel() : openPanel('settings')));
  $('#menu-btn').addEventListener('click', () => (G.panel === 'menu' ? closePanel() : openPanel('menu')));
  $('#quest-pin').addEventListener('click', () => openPanel(G.state.job ? 'jobs' : 'quests'));
}
export { esc, fmt };
void PUBLIC_WORK; void hasResources; void costText; void OUTFITS;

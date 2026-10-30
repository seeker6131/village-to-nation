// V2N Prototype: pure game rules (no UI, no network). Do not trust this module for multiplayer authority.
export const SAVE_KEY = 'v2n-prototype-v1';
export const DAY_SECONDS_REAL = 1200;
export const GAME_SECONDS_PER_REAL_SECOND = 86400 / DAY_SECONDS_REAL;
export const PROJECTS = {
  home:   { name: 'บ้านพักหลังแรก', wood: 4, stone: 1, civic: 3, desc: 'จากเต็นท์สู่บ้านหลังแรกของหมู่บ้าน' },
  farm:   { name: 'สวนอาหารชุมชน', wood: 3, stone: 2, civic: 3, desc: 'ช่วยให้ชาวบ้านมีอาหารและงานทำ' },
  market: { name: 'ตลาดหมู่บ้าน', wood: 5, stone: 3, civic: 4, desc: 'เปิดพื้นที่ค้าขายให้คนในชุมชน' },
  hall:   { name: 'ศาลาประชาคม', wood: 6, stone: 5, civic: 5, desc: 'สถานที่พบปะและจัดเลือกตั้งครั้งแรก' }
};
export const PROJECT_ORDER = ['home', 'farm', 'market', 'hall'];
export const CIVIL_EXAM_QUESTIONS = [
  { q: 'ประชาชนขอใบรับรอง แต่เอกสารยังไม่ครบ ควรทำอย่างไร?', choices: ['ให้คำแนะนำเอกสารที่ต้องใช้', 'รับเงินพิเศษแล้วออกให้ทันที', 'ปฏิเสธโดยไม่อธิบาย'], answer: 0 },
  { q: 'ทำงานพบข้อมูลส่วนตัวของชาวบ้าน ควรทำอย่างไร?', choices: ['ส่งให้เพื่อนดู', 'เก็บข้อมูลตามหน้าที่และจำกัดการเข้าถึง', 'โพสต์ข้อมูลบนกระดาน'], answer: 1 },
  { q: 'มีคนสองคนมาติดต่อราชการพร้อมกัน ควรทำอย่างไร?', choices: ['ดูแลตามคิวและกรณีเร่งด่วนที่มีหลักเกณฑ์', 'รับเฉพาะคนรู้จัก', 'ปิดร้านแล้วกลับบ้าน'], answer: 0 }
];
export const EXAM_QUESTIONS = [
  { q: 'มีงบพอซ่อมระบบน้ำหรือจัดงานเทศกาลได้อย่างเดียว ชาวบ้านไม่มีน้ำสะอาด ควรเริ่มจากอะไร?', choices: ['จัดงานเทศกาลก่อน', 'แก้ระบบน้ำสะอาดก่อน', 'เก็บเงินไว้เฉย ๆ'], answer: 1, reason: 'ความจำเป็นพื้นฐานของชุมชนต้องได้รับการดูแลก่อน' },
  { q: 'มีประชาชนเสนอเรื่องร้องเรียน แต่ข้อมูลยังไม่ครบ ควรทำอย่างไร?', choices: ['ตรวจสอบข้อมูลและรับฟังหลายฝ่าย', 'ตัดสินทันทีจากข่าวลือ', 'ปิดรับเรื่องทั้งหมด'], answer: 0, reason: 'ตรวจสอบข้อเท็จจริงก่อนตัดสินใจ' },
  { q: 'ร้านของเพื่อนอยากได้สิทธิขายในตลาดเพียงร้านเดียว ควรทำอย่างไร?', choices: ['ให้เพื่อนผูกขาด', 'เปิดกติกาที่เป็นธรรมและตรวจสอบได้', 'ห้ามทุกคนขายของ'], answer: 1, reason: 'ดูแลโอกาสของประชาชนอย่างเป็นธรรม' }
];

export function createInitialState() {
  return {
    schema: 1, day: 1, gameTime: 6 * 3600, tickMultiplier: 1,
    player: { x: 42.5 * 16, y: 53.5 * 16, coins: 35, wood: 0, stone: 0, food: 2, stamina: 100, knowledge: 0, civic: 0, name: 'ผู้บุกเบิก', outfit: 0 },
    projects: { home: false, farm: false, market: false, hall: false },
    stats: { woodGathered: 0, stoneGathered: 0, jobsDone: 0, deliveries: 0 },
    deliveries: { holding: false },
    examPassed: false, civilService: { rank: 'ประชาชน', examPassed: false, lastShiftDay: 0, shifts: 0 },
    election: { opened: false, candidate: false, completed: false, leader: 'npc', lastResult: '' },
    history: ['วันที่ 1: เดินทางมาถึงป่าบุกเบิก ได้รับขวานจากครูอุ่น 1 เล่ม'],
    log: ['ครูอุ่นรออยู่หน้าบ้านผู้นำ พูดคุยกับเธอเพื่อเริ่มต้น']
  };
}
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
export function deepClone(state) { return JSON.parse(JSON.stringify(state)); }
export function logEvent(state, message) {
  state.log.unshift(message); state.log = state.log.slice(0, 8);
}
export function addHistory(state, message) {
  state.history.unshift(`วันที่ ${state.day}: ${message}`); state.history = state.history.slice(0, 30); logEvent(state, message);
}
export function timeLabel(state) {
  const h = Math.floor(state.gameTime / 3600) % 24;
  const m = Math.floor((state.gameTime % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
export function phase(state) {
  const h = state.gameTime / 3600;
  return h >= 5 && h < 11 ? 'เช้า' : h >= 11 && h < 17 ? 'กลางวัน' : h >= 17 && h < 22 ? 'เย็น' : 'กลางคืน';
}
export function progressTime(state, realSeconds) {
  const speed = clamp(Number(state.tickMultiplier) || 1, 1, 20); // ⏩ button: 1 / 2 / 5 / 20x
  const total = state.gameTime + Math.max(0, realSeconds) * GAME_SECONDS_PER_REAL_SECOND * speed;
  const days = Math.floor(total / 86400);
  state.gameTime = total % 86400;
  if (days > 0) {
    state.day += days;
    state.player.stamina = clamp(state.player.stamina + 15 * days, 0, 100);
    logEvent(state, `รุ่งเช้าวันที่ ${state.day}: NPC เริ่มกิจวัตรของวันใหม่แล้ว`);
  }
  // Slowly recover energy so no one needs to buy energy to keep playing.
  state.player.stamina = clamp(state.player.stamina + realSeconds * 0.75, 0, 100);
  return days;
}
export function gather(state, kind) {
  if (!['wood', 'stone'].includes(kind)) return { ok: false, msg: 'ทรัพยากรไม่ถูกต้อง' };
  const energyCost = Math.max(2, 5 - (state.skills?.gather || 0));
  if (state.player.stamina < energyCost) return { ok: false, msg: 'เหนื่อยแล้ว! แวะพักที่ศูนย์บุกเบิกเพื่อฟื้นพลัง' };
  state.player.stamina -= energyCost;
  state.player[kind] += 1;
  state.stats[kind === 'wood' ? 'woodGathered' : 'stoneGathered'] += 1;
  return { ok: true, msg: kind === 'wood' ? 'เก็บไม้ +1 🪵' : 'เก็บหิน +1 🪨' };
}
export function canBuild(state, id) {
  const p = PROJECTS[id];
  if (!p) return { ok: false, reason: 'ไม่พบโครงการ' };
  if (state.projects[id]) return { ok: false, reason: 'สร้างแล้ว' };
  if (id === 'hall' && !(state.projects.home && state.projects.market)) return { ok: false, reason: 'ต้องสร้างบ้านและตลาดก่อน' };
  if (state.player.wood < p.wood || state.player.stone < p.stone) return { ok: false, reason: `ต้องใช้ไม้ ${p.wood} หิน ${p.stone}` };
  return { ok: true, reason: 'พร้อมสร้าง' };
}
/** Legacy instant build (pay + complete). The game uses construction.js (timed build) instead. */
export function buildProject(state, id) {
  const can = canBuild(state, id);
  if (!can.ok) return { ok: false, msg: can.reason };
  const p = PROJECTS[id];
  state.player.wood -= p.wood; state.player.stone -= p.stone;
  return completeProject(state, id);
}
/** Apply the effects of a finished public project (no cost here; costs are paid when construction starts). */
export function completeProject(state, id) {
  const p = PROJECTS[id];
  if (!p || state.projects[id]) return { ok: false, msg: 'สร้างแล้ว' };
  state.player.civic += p.civic;
  if(state.town)state.town.treasury+=p.civic*2; // NPC community donation for the project; not paid currency.
  state.projects[id] = true;
  addHistory(state, `${p.name} สร้างเสร็จ (+${p.civic} ผลงานชุมชน)`);
  if (PROJECT_ORDER.every(k => state.projects[k]) && !state.election.opened) {
    state.election.opened = true;
    addHistory(state, 'ครูอุ่นประกาศเปิดการเลือกตั้งผู้นำชุมชนครั้งแรก!');
  }
  return { ok: true, msg: `${p.name} สร้างเสร็จแล้ว!` };
}
export function rest(state) {
  state.player.stamina = 100;
  return { ok: true, msg: 'พักผ่อนแล้ว พลังงานเต็ม 100 (ไม่เสียเงิน)' };
}
export function study(state) {
  if (state.player.knowledge >= 3) return { ok: true, msg: 'ฝึกครบแล้ว! ไปสอบที่ศูนย์บุกเบิกได้เลย' };
  state.player.knowledge += 1;
  return { ok: true, msg: `ฝึกความรู้ชุมชน +1 (${state.player.knowledge}/3)` };
}
export function takeExam(state, answers) {
  if (state.player.knowledge < 3) return { ok: false, score: 0, msg: 'ต้องอ่านคู่มือชุมชนให้ครบ 3 ครั้งก่อน' };
  if (!Array.isArray(answers) || answers.length !== EXAM_QUESTIONS.length) return { ok: false, score: 0, msg: 'ตอบข้อสอบไม่ครบ' };
  const score = EXAM_QUESTIONS.reduce((sum, q, i) => sum + (q.answer === Number(answers[i]) ? 1 : 0), 0);
  if (score >= 2) { state.examPassed = true; addHistory(state, 'สอบผ่านใบรับรองผู้นำชุมชน'); }
  return { ok: score >= 2, score, msg: score >= 2 ? `สอบผ่าน ${score}/3 ข้อ!` : `ได้ ${score}/3 ข้อ ลองอ่านคำอธิบายและสอบใหม่ได้ฟรี` };
}
export function takeCivilExam(state, answers) {
  if (state.player.knowledge < 2 || state.stats.deliveries < 1) return { ok: false, score: 0, msg: 'ต้องมีความรู้ 2 และทำงานส่งพัสดุอย่างน้อย 1 ครั้ง' };
  if (!Array.isArray(answers) || answers.length !== CIVIL_EXAM_QUESTIONS.length) return { ok: false, score: 0, msg: 'ตอบข้อสอบให้ครบ' };
  const score = CIVIL_EXAM_QUESTIONS.reduce((sum,q,i) => sum + (Number(answers[i]) === q.answer ? 1 : 0), 0);
  if (score >= 2) {
    state.civilService.examPassed = true;
    state.civilService.rank = 'เจ้าหน้าที่ฝึกหัด';
    addHistory(state, 'สอบเข้ารับราชการชุมชนได้สำเร็จ');
  }
  return { ok: score >= 2, score, msg: score >= 2 ? `สอบข้าราชการผ่าน ${score}/3 ข้อ!` : `สอบได้ ${score}/3 ข้อ สอบใหม่ได้ฟรี` };
}
export function civilShift(state) {
  if (!state.civilService.examPassed) return {ok:false,msg:'ต้องสอบเข้าราชการก่อน'};
  if (state.civilService.lastShiftDay === state.day) return {ok:false,msg:'วันนี้ทำงานราชการแล้ว กลับมาทำวันใหม่ได้'};
  if (state.player.stamina < 12) return {ok:false,msg:'พลังงานไม่พอ แวะพักก่อน'};
  state.player.stamina -= 12;
  state.civilService.lastShiftDay = state.day;
  state.civilService.shifts += 1;
  const shifts=state.civilService.shifts;
  const oldRank=state.civilService.rank;
  const newRank=shifts>=15?'ผู้อำนวยการชุมชน':shifts>=8?'หัวหน้าฝ่าย':shifts>=3?'เจ้าหน้าที่ประจำ':'เจ้าหน้าที่ฝึกหัด';
  state.civilService.rank=newRank;
  const salary=shifts>=15?42:shifts>=8?31:shifts>=3?24:18;
  state.player.coins+=salary;
  if(newRank!==oldRank)addHistory(state,`เลื่อนตำแหน่งราชการเป็น${newRank}`);
  logEvent(state,`ทำงานราชการ +${salary} เหรียญ`);
  return {ok:true,msg:`ทำงานราชการ +${salary} เหรียญ (สะสม ${shifts} วัน) · ${newRank}`};
}
export function mentorObjective(state){
  const has=k=>((state.inventory||{})[k]||0)>0;
  if(state.stats.woodGathered<3)return {stage:1,title:'ถางป่าด้วยขวาน',detail:`ฟันต้นไม้รอบลานบ้านผู้นำ เก็บไม้ ${state.stats.woodGathered}/3`,progress:state.stats.woodGathered/3};
  if(state.stats.stoneGathered<2&&!has('pickaxe'))return {stage:2,title:'ทำอีเต้อขุดหิน',detail:'เปิดเมนูผลิต ทำอีเต้อจากไม้ แล้วไปขุดก้อนหิน',progress:0.2};
  if(state.stats.stoneGathered<2)return {stage:2,title:'ขุดหินก้อนแรก',detail:`ใช้อีเต้อขุดหิน ${state.stats.stoneGathered}/2`,progress:0.5+state.stats.stoneGathered/4};
  for(const id of PROJECT_ORDER)if(!state.projects[id])return {stage:3,title:'ถางที่ดินแล้วสร้าง',detail:`${PROJECTS[id].name}: ถางต้นไม้ในหมุดที่ดิน แล้วเริ่มก่อสร้าง (เมนูก่อสร้าง)`,progress:PROJECT_ORDER.filter(k=>state.projects[k]).length/4};
  if(state.player.knowledge<3)return {stage:4,title:'อ่านหนังสือเตรียมสอบ',detail:`เพิ่มความรู้ ${state.player.knowledge}/3 ที่ขอนไม้นั่งเรียนหรือเมนู`,progress:state.player.knowledge/3};
  if(!state.examPassed)return {stage:5,title:'สอบผู้นำก่อนหมดวาระ',detail:'ไม่ผ่านข้อสอบ = ลงเลือกตั้งสมัยหน้าไม่ได้ (เมนูผู้นำ)',progress:0};
  const L=state.leadership;
  if(L&&!(L.results||[]).length)return {stage:6,title:'รักษาความนิยมจนหมดวาระแรก',detail:`ความนิยม ${L.popularity} · ดูแลอาหาร บ้าน ความสุข แล้วชนะเลือกตั้ง`,progress:Math.min(1,L.popularity/100)};
  if(!L&&!state.election.candidate&&!state.election.completed)return {stage:6,title:'สมัครผู้นำชุมชน',detail:'เปิดเมนูผู้นำแล้วสมัครเลือกตั้ง',progress:0};
  if(!L&&!state.election.completed)return {stage:7,title:'การเลือกตั้งจำลอง',detail:'เปิดเมนูผู้นำเพื่อจำลองการลงคะแนน',progress:0};
  return {stage:8,title:'จบบทนำแล้ว!',detail:'ขยายหมู่บ้าน ถางป่าเพิ่ม และพาชุมชนสู่เมือง',progress:1};
}
export function electionEligibility(state) {
  const missing = [];
  if (!state.election.opened) missing.push('พัฒนาหมู่บ้านทั้ง 4 โครงการ');
  if (!state.examPassed) missing.push('ผ่านข้อสอบผู้นำชุมชน');
  if (state.player.civic < 12) missing.push(`ผลงานชุมชน 12 (ปัจจุบัน ${state.player.civic})`);
  return { eligible: missing.length === 0, missing };
}
export function registerCandidate(state) {
  const e = electionEligibility(state);
  if (!e.eligible) return { ok: false, msg: e.missing.join(' · ') };
  if (state.election.completed) return { ok: false, msg: 'การเลือกตั้งต้นแบบครั้งนี้จบแล้ว' };
  state.election.candidate = true;
  addHistory(state, 'ลงสมัครผู้ใหญ่บ้านเป็นครั้งแรก');
  return { ok: true, msg: 'สมัครสำเร็จ! เข้าสู่การจำลองการลงคะแนนได้' };
}
export function runDemoElection(state) {
  if (!state.election.candidate || state.election.completed) return { ok: false, msg: 'ยังลงสมัครไม่ได้ หรือเลือกตั้งไปแล้ว' };
  // Explicitly mocked NPC ballot for single-player only; NOT a real electoral algorithm.
  const votesPlayer = 4 + Math.floor(state.player.civic / 3) + Math.floor(state.stats.jobsDone / 2);
  const votesOther = 7;
  const won = votesPlayer > votesOther;
  state.election.completed = true;
  state.election.leader = won ? 'player' : 'npc';
  state.election.lastResult = `คะแนนจำลอง: ผู้เล่น ${votesPlayer} ต่อ NPC ${votesOther}`;
  addHistory(state, won ? 'ได้รับเลือกเป็นผู้นำชุมชนคนแรก (เฉพาะโหมดต้นแบบ)' : 'จบการเลือกตั้งต้นแบบแล้ว ยังคงเป็นพลเมือง');
  return { ok: true, won, msg: `${state.election.lastResult} — ${won ? 'ได้รับเลือก!' : 'ยังไม่ได้รับเลือก'}` };
}
export function startDelivery(state) {
  if (state.deliveries.holding) return { ok: false, msg: 'รับพัสดุอยู่แล้ว นำไปส่งที่ตลาดก่อน' };
  state.deliveries.holding = true;
  return { ok: true, msg: 'รับพัสดุแล้ว! นำไปส่งที่จุดตลาด 📦' };
}
export function completeDelivery(state) {
  if (!state.deliveries.holding) return { ok: false, msg: 'ยังไม่มีพัสดุ ไปที่กระดานงานก่อน' };
  state.deliveries.holding = false;
  state.player.coins += 12;
  state.stats.jobsDone += 1;
  state.stats.deliveries += 1;
  logEvent(state, 'ส่งของสำเร็จ +12 เหรียญ');
  return { ok: true, msg: 'ส่งของสำเร็จ! +12 เหรียญ 🪙' };
}
export function sellMaterials(state) {
  const wood = Math.min(2, state.player.wood), stone = Math.min(2, state.player.stone);
  if (wood + stone === 0) return { ok: false, msg: 'ไม่มีไม้หรือหินเหลือให้ขาย' };
  state.player.wood -= wood; state.player.stone -= stone;
  const coins = wood * 3 + stone * 4;
  state.player.coins += coins; state.stats.jobsDone += 1;
  logEvent(state, `ขายวัสดุ ${wood} ไม้ + ${stone} หิน รับ ${coins} เหรียญ`);
  return { ok: true, msg: `ขายวัสดุสำเร็จ +${coins} เหรียญ` };
}
export function safeLoad(raw) {
  try {
    const s = JSON.parse(raw);
    if (!s || s.schema !== 1 || !s.player || !s.projects || !s.election) return createInitialState();
    if (!s.civilService) s.civilService = createInitialState().civilService;
    // local offline saves are intentionally NOT authoritative in multiplayer.
    return s;
  } catch { return createInitialState(); }
}

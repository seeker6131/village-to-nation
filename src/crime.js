// v0.17 crime & police. Pure rules (no DOM), deterministic (hash of day/hour), Node-testable.
// At night a thief may sneak into the village and break into a house (or the market strongbox). If nobody stops
// them within THEFT_HOURS they steal: from an NPC household's savings, from the player's coins (only when the
// player's own house is the target) or from the town treasury. Police officers on night patrol (from the police
// station of the อำเภอ city up; a volunteer watch from หมู่บ้าน) may catch them; the player can catch a thief in the
// act (walk up + E). Nothing here can be bought: safety comes from police, lights and a happy town.
import { hash } from './world.js';
import { tierOf } from './villageLayout.js';
import { logEvent } from './gameState.js';

export const THEFT_HOURS = 2;          // game hours a thief needs at the target
export const ARREST_REWARD = 25;       // coins from the treasury to whoever catches a thief (never created from nothing)
export const NIGHT = h => h >= 21 || h < 5;
const MAX_ACTIVE = { 1: 0, 2: 1, 3: 1, 4: 2, 5: 2 };

export function ensureCrime(s) {
  const c = s.crime = s.crime && typeof s.crime === 'object' ? s.crime : {};
  c.thieves = Array.isArray(c.thieves) ? c.thieves : [];
  c.stats = c.stats && typeof c.stats === 'object' ? c.stats : {};
  for (const k of ['spawned', 'caughtByPlayer', 'caughtByPolice', 'thefts', 'stolen']) c.stats[k] = Number.isFinite(c.stats[k]) ? c.stats[k] : 0;
  c.nextId = Number.isFinite(c.nextId) ? c.nextId : 1;
  return c;
}
/** Night patrol strength: volunteer watch (หมู่บ้าน), police station officers (อำเภอ+). */
export function policeOfficers(s) { const t = tierOf(s); return t >= 5 ? 4 : t >= 4 ? 3 : t >= 3 ? 2 : t >= 2 ? 1 : 0; }
export function policeLabel(s) { const t = tierOf(s); return t >= 3 ? 'ตำรวจสายตรวจ' : 'อาสาสมัครเวรยาม (ชรบ.)'; }

/** Houses a thief can target: finished homes + the market strongbox. Returns [{kind, id, name, tx, ty, owner}] */
export function crimeTargets(s) {
  const out = [];
  for (const p of s.placed || []) if (p.type === 'cottage' && p.level >= 1 && p.status === 'done') out.push({ kind: 'home', id: p.uid, owner: p.owner, tx: p.tx + 2, ty: p.ty + 3, name: (s.homes && Object.values(s.homes).find(h => h.owner === p.owner)?.name) || 'ชาวบ้าน' });
  if (s.publicSites?.market && s.publicSites.market.status !== 'none' && (s.publicSites.market.level || 0) >= 1) out.push({ kind: 'treasury', id: 'market', owner: 'town', name: 'ตู้เซฟตลาด' });
  return out;
}

/** Once per game hour. Returns event strings. `hour` = 0..23 of the hour that just ended. */
export function crimeHour(s, hour, population = 0) {
  const c = ensureCrime(s), ev = [], t = tierOf(s), key = (s.day || 1) * 24 + hour;
  // daybreak: thieves still around run off empty-handed
  if (!NIGHT(hour)) { for (const th of c.thieves) if (th.status === 'sneaking') { th.status = 'fled'; } c.thieves = c.thieves.filter(th => th.status === 'sneaking'); return ev; }
  // police patrol: every officer has a chance per hour to catch each thief
  const officers = policeOfficers(s);
  for (const th of c.thieves) {
    if (th.status !== 'sneaking') continue;
    for (let o = 0; o < officers; o++) if (hash(key, th.id * 7 + o, 811) < .22) { th.status = 'caught'; th.by = 'police'; break; }
    if (th.status === 'caught') { c.stats.caughtByPolice++; ev.push(`👮 ${policeLabel(s)}จับโจรได้ที่${th.targetName}`); continue; }
    th.hours = (th.hours || 0) + 1;
    if (th.hours >= THEFT_HOURS) { const r = commitTheft(s, th); if (r) ev.push(r); }
  }
  c.thieves = c.thieves.filter(th => th.status === 'sneaking');
  // a new thief? more likely in a bigger, unhappier town with few police
  if (c.thieves.length < (MAX_ACTIVE[t] || 0) && population >= 12) {
    const happy = Math.max(0, Math.min(100, s.town?.happiness ?? 60));
    const chance = Math.min(.5, .08 + population / 400) * (1.3 - happy / 100) / (1 + officers * .35);
    if (hash(key, 3, 812) < chance) {
      const targets = crimeTargets(s);
      if (targets.length) {
        const tg = targets[Math.floor(hash(key, 4, 813) * targets.length) % targets.length];
        c.thieves.push({ id: c.nextId++, status: 'sneaking', target: tg.id, kind: tg.kind, owner: tg.owner, targetName: tg.name, hours: 0, day: s.day });
        c.stats.spawned++;
        ev.push(`🕵️ มีคนแปลกหน้าด้อม ๆ มอง ๆ แถว${tg.name}…`);
      }
    }
  }
  for (const e of ev) logEvent(s, e);
  return ev;
}

function commitTheft(s, th) {
  const c = ensureCrime(s);
  let amount = 0, who = th.targetName;
  if (th.kind === 'treasury') { amount = Math.min(s.town.treasury || 0, Math.max(5, Math.floor((s.town.treasury || 0) * .05))); s.town.treasury -= amount; who = 'คลังตลาด'; }
  else if (th.owner === 'player') { amount = Math.min(s.player.coins || 0, Math.min(30, Math.floor((s.player.coins || 0) * .1))); s.player.coins -= amount; who = 'บ้านของมึง'; }
  else { const h = s.homes && Object.values(s.homes).find(x => x.owner === th.owner); if (h) { amount = Math.min(h.savings || 0, 20); h.savings -= amount; } }
  th.status = 'stole'; c.stats.thefts++; c.stats.stolen += amount;
  if (s.town) s.town.happiness = Math.max(0, (s.town.happiness ?? 60) - 2);
  return `🚨 ${who}ถูกขโมย${amount ? ` ${amount} เหรียญ` : ' (ไม่มีอะไรให้เอา)'} — โจรหนีไปแล้ว`;
}

/** The player catches a thief in the act. Reward comes out of the treasury (only what it has). */
export function arrestThief(s, id) {
  const c = ensureCrime(s), th = c.thieves.find(x => x.id === id && x.status === 'sneaking');
  if (!th) return { ok: false, msg: 'ไม่มีโจรตรงนี้แล้ว' };
  th.status = 'caught'; th.by = 'player'; c.stats.caughtByPlayer++;
  c.thieves = c.thieves.filter(x => x.status === 'sneaking');
  const reward = Math.min(ARREST_REWARD, Math.max(0, s.town.treasury || 0));
  s.town.treasury -= reward; s.player.coins += reward;
  if (s.town) s.town.happiness = Math.min(100, (s.town.happiness ?? 60) + 2);
  if (s.leadership && (s.leadership.isLeader || s.election?.leader === 'player')) s.leadership.popularity = Math.min(100, (s.leadership.popularity || 0) + 2);
  logEvent(s, `👮 จับโจรได้ที่${th.targetName}`);
  return { ok: true, msg: `👮 จับโจรได้! ส่งตัวให้ตำรวจแล้ว${reward ? ` · รางวัลนำจับ ${reward} เหรียญจากคลังเมือง` : ' · คลังเมืองไม่มีเงินรางวัล'}`, reward };
}
export function activeThieves(s) { return ensureCrime(s).thieves.filter(t => t.status === 'sneaking'); }

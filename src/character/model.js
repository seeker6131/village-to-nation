// Character appearance data model (pure, no DOM). Used by the dressing room, renderer and save migration.
// Appearance never affects money, XP, exams or elections.

export const HAIR_STYLES = ['messy', 'pony', 'swept', 'short', 'bald'];
export const HAIR_STYLE_NAMES = { pony: { th: 'หางม้า', en: 'Ponytail' }, swept: { th: 'ผมปัดข้าง', en: 'Side-swept' }, short: { th: 'ผมสั้นชี้', en: 'Short spiky' }, messy: { th: 'ผมยุ่งปัดข้าง', en: 'Messy fringe' }, bald: { th: 'หัวโล้น', en: 'Shaved' } };

// Colours are recolour targets for the material ramps baked by scripts/build-characters.py.
export const SKIN_TONES = {
  s1: { th: 'ผิวขาวอมชมพู', en: 'Fair', rgb: [246, 205, 170] },
  s2: { th: 'ผิวสองสี', en: 'Light tan', rgb: [235, 180, 135] },
  s3: { th: 'ผิวแทน', en: 'Tan', rgb: [205, 145, 100] },
  s4: { th: 'ผิวคล้ำ', en: 'Brown', rgb: [160, 105, 72] },
  s5: { th: 'ผิวเข้ม', en: 'Deep', rgb: [112, 72, 52] },
};
export const HAIR_COLORS = {
  brown: { th: 'น้ำตาล', en: 'Brown', rgb: null }, // null = keep the original painted colours
  black: { th: 'ดำ', en: 'Black', rgb: [62, 52, 56] },
  chestnut: { th: 'น้ำตาลแดง', en: 'Chestnut', rgb: [150, 74, 48] },
  blonde: { th: 'บลอนด์', en: 'Blonde', rgb: [226, 182, 104] },
  ash: { th: 'เทาเงิน', en: 'Ash', rgb: [176, 176, 186] },
  navy: { th: 'กรมท่า', en: 'Navy', rgb: [70, 86, 140] },
};
export const EYE_COLORS = {
  brown: { th: 'น้ำตาล', en: 'Brown', rgb: null },
  black: { th: 'ดำ', en: 'Black', rgb: [52, 44, 46] },
  hazel: { th: 'อำพัน', en: 'Hazel', rgb: [176, 120, 50] },
  green: { th: 'เขียว', en: 'Green', rgb: [70, 140, 86] },
  blue: { th: 'ฟ้า', en: 'Blue', rgb: [70, 120, 196] },
};

// Outfits = top + bottom + shoes recolour of body regions. Sleeve/pant length are 0..7 body fractions.
// `source` documents how it is obtained: free | job (unlocked by career/role) | shop (OBT cosmetic mock).
export const OUTFITS = {
  cream:   { th: 'เสื้อยืดครีม', en: 'Cream tee', top: [244, 231, 200], bottom: [118, 98, 82], shoes: [92, 66, 50], sleeve: 2, pants: 2, source: 'free' },
  blue:    { th: 'เสื้อฟ้า', en: 'Blue tee', top: [92, 157, 204], bottom: [64, 74, 104], shoes: [70, 56, 50], sleeve: 2, pants: 3, source: 'free' },
  green:   { th: 'เสื้อเขียว', en: 'Green tee', top: [117, 176, 122], bottom: [104, 86, 64], shoes: [80, 60, 44], sleeve: 2, pants: 2, source: 'free' },
  red:     { th: 'เสื้อแดงอิฐ', en: 'Brick tee', top: [208, 112, 96], bottom: [70, 64, 70], shoes: [60, 48, 48], sleeve: 2, pants: 7, source: 'free' },
  farmer:  { th: 'ชุดเกษตรกร', en: 'Farmer', top: [214, 190, 132], bottom: [70, 110, 150], shoes: [88, 70, 52], sleeve: 7, pants: 7, collar: [180, 150, 96], source: 'job', job: 'farmer' },
  builder: { th: 'ชุดช่าง', en: 'Builder', top: [236, 150, 60], bottom: [84, 84, 92], shoes: [60, 50, 44], sleeve: 3, pants: 7, collar: [250, 210, 90], source: 'job', job: 'builder' },
  trader:  { th: 'ชุดพ่อค้าแม่ค้า', en: 'Trader', top: [232, 120, 140], bottom: [96, 70, 92], shoes: [80, 56, 60], sleeve: 4, pants: 7, collar: [255, 230, 236], source: 'job', job: 'trader' },
  civil:   { th: 'ชุดข้าราชการ', en: 'Civil servant', top: [234, 236, 230], bottom: [56, 62, 82], shoes: [40, 36, 40], sleeve: 7, pants: 7, collar: [214, 170, 70], source: 'job', job: 'civil' },
  leader:  { th: 'ชุดผู้นำชุมชน', en: 'Community leader', top: [120, 92, 160], bottom: [52, 52, 66], shoes: [40, 36, 40], sleeve: 7, pants: 7, collar: [238, 206, 110], source: 'job', job: 'leader' },
  // NPC-only uniforms (never offered in the creator): night patrol and thieves (v0.17 crime)
  police:  { th: 'ชุดตำรวจ', en: 'Police', top: [150, 112, 72], bottom: [118, 86, 58], shoes: [30, 28, 30], sleeve: 3, pants: 7, collar: [40, 40, 44], source: 'job', job: 'police', npcOnly: true },
  thief:   { th: 'ชุดโจร', en: 'Thief', top: [46, 46, 56], bottom: [34, 34, 42], shoes: [24, 22, 26], sleeve: 7, pants: 7, collar: [180, 40, 50], source: 'job', job: 'thief', npcOnly: true },
  // OBT cosmetic mocks (no stats). Unlocked only by a server-verified entitlement in the future.
  festival:{ th: 'ชุดงานวัด', en: 'Temple fair', top: [250, 214, 90], bottom: [190, 60, 70], shoes: [90, 50, 40], sleeve: 4, pants: 7, collar: [255, 255, 255], source: 'shop', sku: 'outfit_festival' },
  sailor:  { th: 'ชุดกะลาสี', en: 'Sailor', top: [248, 250, 252], bottom: [40, 70, 130], shoes: [30, 30, 40], sleeve: 3, pants: 7, collar: [40, 70, 130], source: 'shop', sku: 'outfit_sailor' },
  night:   { th: 'ชุดราตรีม่วง', en: 'Night violet', top: [96, 64, 140], bottom: [64, 40, 96], shoes: [40, 30, 50], sleeve: 7, pants: 7, collar: [220, 190, 255], source: 'shop', sku: 'outfit_night' },
};

// Optional paper-doll accessories (kept absent from legacy saved appearances).
export const BEARD_STYLES = ['none', '1', '2', '3'];
export const HAT_STYLES = ['none', '1', '2', '3'];
export const DEFAULT_APPEARANCE = Object.freeze({ hair: 'pony', hairColor: 'brown', skin: 's2', eyes: 'brown', outfit: 'cream' });

/** Count user-perceived characters (Thai combining vowels/tones are part of one grapheme). */
export function graphemeLength(text) {
  const s = String(text ?? '');
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    let n = 0; for (const _ of new Intl.Segmenter('th', { granularity: 'grapheme' }).segment(s)) n++; return n;
  }
  // fallback: drop Thai combining marks
  return s.replace(/[ัิ-ฺ็-๎]/g, '').length;
}

/** Validate a character name. Thai letters, Latin letters, digits, single spaces, . - ' are allowed. */
export function validateName(raw) {
  const name = String(raw ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!name) return { ok: false, code: 'empty', name };
  const len = graphemeLength(name);
  if (len < 2) return { ok: false, code: 'short', name };
  if (len > 16) return { ok: false, code: 'long', name };
  if (!/^[฀-๿A-Za-z0-9 .\-']+$/.test(name)) return { ok: false, code: 'chars', name };
  if (!/[ก-ฮA-Za-z]/.test(name)) return { ok: false, code: 'letters', name };
  const lang = /[฀-๿]/.test(name) ? (/[A-Za-z]/.test(name) ? 'mixed' : 'th') : 'en';
  return { ok: true, code: 'ok', name, lang };
}

export const NAME_ERRORS = {
  empty: { th: 'กรุณาตั้งชื่อตัวละคร', en: 'Please enter a name' },
  short: { th: 'ชื่อต้องยาวอย่างน้อย 2 ตัวอักษร', en: 'Name must be at least 2 characters' },
  long: { th: 'ชื่อยาวได้ไม่เกิน 16 ตัวอักษร', en: 'Name can be at most 16 characters' },
  chars: { th: 'ใช้ได้เฉพาะอักษรไทย อังกฤษ ตัวเลข เว้นวรรค และ . - \'', en: "Use Thai/English letters, digits, space and . - ' only" },
  letters: { th: 'ชื่อต้องมีตัวอักษรอย่างน้อย 1 ตัว', en: 'Name needs at least one letter' },
};

export function normalizeAppearance(a, unlockedOutfits = []) {
  const o = a && typeof a === 'object' ? a : {};
  const pick = (v, table, def) => (Object.hasOwn(table, v) ? v : def);
  let outfit = pick(o.outfit, OUTFITS, DEFAULT_APPEARANCE.outfit);
  if (!outfitAvailable(outfit, unlockedOutfits)) outfit = DEFAULT_APPEARANCE.outfit;
  return {
    hair: HAIR_STYLES.includes(o.hair) ? o.hair : DEFAULT_APPEARANCE.hair,
    hairColor: pick(o.hairColor, HAIR_COLORS, DEFAULT_APPEARANCE.hairColor),
    skin: pick(o.skin, SKIN_TONES, DEFAULT_APPEARANCE.skin),
    eyes: pick(o.eyes, EYE_COLORS, DEFAULT_APPEARANCE.eyes),
    outfit,
    ...(Object.hasOwn(o, 'beard') ? { beard: BEARD_STYLES.includes(o.beard) ? o.beard : 'none' } : {}),
    ...(Object.hasOwn(o, 'hat') ? { hat: HAT_STYLES.includes(o.hat) ? o.hat : 'none' } : {}),
  };
}

export function outfitAvailable(id, unlocked = []) {
  const o = OUTFITS[id];
  if (!o) return false;
  return o.source === 'free' || unlocked.includes(id);
}

/** v0.7 stored {name, hair:'pony'|'bob'|'short', outfit:'cream'|'blue'|'green'|'red', lang}. */
export function fromV07Character(c) {
  if (!c || typeof c !== 'object') return null;
  const v = validateName(c.name);
  if (!v.ok) return null;
  const hair = c.hair === 'bob' ? 'swept' : c.hair;
  return { name: v.name, lang: c.lang === 'en' ? 'en' : 'th', appearance: normalizeAppearance({ hair, outfit: c.outfit }) };
}

export function appearanceKey(a) { return [a.hair, a.hairColor, a.skin, a.eyes, a.outfit, a.beard || 'none', a.hat || 'none'].join('|'); }

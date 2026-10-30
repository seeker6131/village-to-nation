// OBT store STRUCTURE ONLY (mock). There is no payment provider, no checkout and no real money.
// Purchases always fail with `payments_disabled` until a server verifies receipts (see docs/OBT_MONETIZATION_TH.md).
// Every product must be cosmetic or a convenience that gives no competitive advantage.
export const PAYMENTS_ENABLED = false;

export const SHOP_CATEGORIES = {
  land: { th: 'ที่ดินผู้ก่อตั้ง (เริ่มหมู่บ้านของตัวเอง)', icon: '🌲' },
  fashion: { th: 'ชุดแฟชั่นและทรงผม', icon: '👕' },
  furniture: { th: 'เฟอร์นิเจอร์และของตกแต่ง', icon: '🪴' },
  supporter: { th: 'Supporter Pack', icon: '🌟' },
  convenience: { th: 'ความสะดวก (ไม่เพิ่มพลัง)', icon: '🧰' },
};

// effects: allowed keys only -> outfit, hairColor, decor, frame, badge, wardrobeSlots, blueprintSlots, title
export const CATALOG = [
  { sku: 'outfit_festival', cat: 'fashion', th: 'ชุดงานวัด', priceTHB: 59, effects: { outfit: 'festival' } },
  { sku: 'outfit_sailor', cat: 'fashion', th: 'ชุดกะลาสี', priceTHB: 59, effects: { outfit: 'sailor' } },
  { sku: 'outfit_night', cat: 'fashion', th: 'ชุดราตรีม่วง', priceTHB: 79, effects: { outfit: 'night' } },
  { sku: 'hair_palette_pastel', cat: 'fashion', th: 'ชุดสีผมพาสเทล (แผนงาน)', priceTHB: 39, effects: { hairColor: 'pastel-pack' }, planned: true },
  { sku: 'decor_flower_set', cat: 'furniture', th: 'ชุดกระถางดอกไม้หน้าบ้าน', priceTHB: 49, effects: { decor: 'flower_set' }, planned: true },
  { sku: 'decor_lantern_festival', cat: 'furniture', th: 'โคมเทศกาลตกแต่ง (แสงเหมือนโคมปกติ)', priceTHB: 69, effects: { decor: 'festival_lantern' }, planned: true },
  { sku: 'land_founder', cat: 'land', th: 'ที่ดินผู้ก่อตั้ง (ป่าผืนใหม่ 1 แปลง)', priceTHB: 199, effects: { land: 1, badge: 'founder_land', title: 'ผู้ก่อตั้งหมู่บ้าน' } },
  { sku: 'supporter_founder', cat: 'supporter', th: 'Founder Supporter Pack', priceTHB: 149, effects: { badge: 'founder', frame: 'founder', outfit: 'festival', title: 'ผู้บุกเบิกรุ่นแรก' } },
  { sku: 'qol_wardrobe', cat: 'convenience', th: 'ตู้เสื้อผ้าเพิ่ม 3 ชุดบันทึก', priceTHB: 35, effects: { wardrobeSlots: 3 }, planned: true },
  { sku: 'qol_blueprints', cat: 'convenience', th: 'สมุดแบบแปลนตกแต่ง (บันทึกผังวางของ)', priceTHB: 35, effects: { blueprintSlots: 5 }, planned: true },
];

// land: a new forest region to found a village in. It grants an ACTING leadership term only;
// re-election depends on popularity and term limits (src/leadership.js). It never adds votes.
const ALLOWED_EFFECTS = new Set(['land', 'outfit', 'hairColor', 'decor', 'frame', 'badge', 'wardrobeSlots', 'blueprintSlots', 'title']);
// Anything that touches power, economy or politics is forbidden — enforced by tests.
export const FORBIDDEN_EFFECTS = ['coins', 'wood', 'stone', 'xp', 'energy', 'stamina', 'votes', 'examPass', 'leader', 'civic', 'speedUp', 'buildTime', 'treasury', 'skill', 'income'];

export function validateCatalog(catalog = CATALOG) {
  const errors = [];
  const seen = new Set();
  for (const item of catalog) {
    if (seen.has(item.sku)) errors.push(`${item.sku}: duplicate sku`);
    seen.add(item.sku);
    if (!SHOP_CATEGORIES[item.cat]) errors.push(`${item.sku}: unknown category`);
    if (item.effects?.leader || item.effects?.votes) errors.push(`${item.sku}: leadership/votes cannot be sold`);
    if (!(item.priceTHB > 0)) errors.push(`${item.sku}: price must be shown in full THB`);
    for (const k of Object.keys(item.effects || {})) {
      if (!ALLOWED_EFFECTS.has(k)) errors.push(`${item.sku}: effect "${k}" is not cosmetic/convenience`);
      if (FORBIDDEN_EFFECTS.includes(k)) errors.push(`${item.sku}: forbidden pay-to-win effect "${k}"`);
    }
  }
  return errors;
}

export function ensureShop(s) {
  s.entitlements = Array.isArray(s.entitlements) ? s.entitlements.filter(e => e && e.sku && e.source) : [];
  return s;
}

/** Real purchase entry point. Always refuses: there is no verified payment backend. */
export function purchase(_s, sku) {
  const item = CATALOG.find(x => x.sku === sku);
  if (!item) return { ok: false, code: 'unknown_sku', msg: 'ไม่พบสินค้า' };
  return { ok: false, code: 'payments_disabled', msg: 'ยังไม่เปิดขายจริง — ต้องมีระบบชำระเงินและเซิร์ฟเวอร์ตรวจสอบใบเสร็จก่อน (ไม่มีการตัดเงิน)' };
}

/**
 * DEV/QA ONLY: grant a cosmetic locally to test the entitlement -> wardrobe flow.
 * Marked source:'mock-test' so it can be wiped before OBT. Only usable when the page runs with ?dev=1.
 */
export function grantMockEntitlement(s, sku, devMode) {
  ensureShop(s);
  if (!devMode) return { ok: false, msg: 'ใช้ได้เฉพาะโหมดทดสอบนักพัฒนา (?dev=1)' };
  const item = CATALOG.find(x => x.sku === sku);
  if (!item) return { ok: false, msg: 'ไม่พบสินค้า' };
  if (item.planned) return { ok: false, msg: 'สินค้านี้ยังเป็นแผนงาน ยังไม่มีของในเกม' };
  if (item.effects.land) return { ok: false, msg: 'ที่ดินต้องใช้ระบบออนไลน์ (สร้างหมู่บ้านใหม่บนเซิร์ฟเวอร์) — ในเวอร์ชันออฟไลน์ เกมใหม่ทุกเกมคือที่ดินผู้ก่อตั้งฟรี' };
  if (s.entitlements.some(e => e.sku === sku)) return { ok: false, msg: 'มีแล้ว' };
  s.entitlements.push({ sku, source: 'mock-test', grantedDay: s.day });
  return { ok: true, msg: `ทดสอบปลดล็อก ${item.th} (mock — ไม่ใช่การซื้อจริง)` };
}

export function ownedOutfits(s) {
  ensureShop(s);
  return s.entitlements.map(e => CATALOG.find(c => c.sku === e.sku)?.effects.outfit).filter(Boolean);
}
export function owns(s, sku) { ensureShop(s); return s.entitlements.some(e => e.sku === sku); }

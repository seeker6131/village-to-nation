// V2N Engine Studio project interchange. Pure functions, shared by Android UI and tests.
// This project archive is editable data, not a modified/recompiled APK.
export const ENGINE_FORMAT = 'v2n-engine-project@1';
export const ENGINE_KEY = 'v2n-engine-project-v1';
export const MAP_KEY = 'v2n-mapmaker-v1';
export const MAX_MAP_CHARS = 8_000_000;
export const FAMILIES = [
  'castle','town_hall','market','inn','blacksmith','barracks','bank',
  'merchant_guild','lumber_mill','fishing','dorm','house_a','house_b','house_c'
];
export function newProject(now = new Date().toISOString()) {
  return {
    format: ENGINE_FORMAT,
    name: 'Village to Nation — Fantasy',
    version: '0.1',
    description: 'โปรเจกต์แก้ไขเกมแฟนตาซี',
    createdAt: now,
    updatedAt: now,
    selectedAsset: 'castle_1',
    config: { dayMinutes: 20, startSilver: 100, npcLimit: 120, seasonDays: 28 },
    map: null
  };
}
export function validConfig(c) {
  return c && typeof c === 'object' && !Array.isArray(c)
    && Number.isFinite(c.dayMinutes) && c.dayMinutes >= 1 && c.dayMinutes <= 1440
    && Number.isFinite(c.startSilver) && c.startSilver >= 0 && c.startSilver <= 1e9
    && Number.isInteger(c.npcLimit) && c.npcLimit >= 1 && c.npcLimit <= 10000
    && Number.isInteger(c.seasonDays) && c.seasonDays >= 1 && c.seasonDays <= 365;
}
export function normalizeProject(input) {
  if (!input || typeof input !== 'object' || input.format !== ENGINE_FORMAT)
    throw new Error('ไม่ใช่ไฟล์ V2N Engine Project');
  const project = newProject();
  project.name = String(input.name || project.name).slice(0, 100);
  project.version = String(input.version || project.version).slice(0, 40);
  project.description = String(input.description || '').slice(0, 2000);
  project.createdAt = typeof input.createdAt === 'string' ? input.createdAt : project.createdAt;
  project.updatedAt = new Date().toISOString();
  if (typeof input.selectedAsset === 'string' && /^[a-z_]+_[123]$/.test(input.selectedAsset)) {
    project.selectedAsset = input.selectedAsset;
  }
  const c = Object.assign({}, project.config, input.config || {});
  if (!validConfig(c)) throw new Error('ค่าเกมไม่ถูกต้อง (เวลา เงิน ประชากร หรือฤดูกาล)');
  project.config = {
    dayMinutes: c.dayMinutes,
    startSilver: c.startSilver,
    npcLimit: c.npcLimit,
    seasonDays: c.seasonDays
  };
  if (input.map !== null && input.map !== undefined) {
    if (!input.map || typeof input.map !== 'object' || input.map.format !== 'v2n-map@1')
      throw new Error('ไฟล์แมพในโปรเจกต์ไม่ถูกต้อง');
    if (JSON.stringify(input.map).length > MAX_MAP_CHARS) throw new Error('ไฟล์แมพใหญ่เกินขีดจำกัด');
    project.map = input.map;
  }
  return project;
}
export function serializeProject(project, savedMapText = null) {
  const data = normalizeProject(project);
  if (savedMapText !== null) {
    if (savedMapText.length > MAX_MAP_CHARS) throw new Error('แมพใหญ่เกินขีดจำกัด');
    const map = JSON.parse(savedMapText);
    if (!map || map.format !== 'v2n-map@1') throw new Error('ข้อมูล Map Maker ไม่ถูกต้อง');
    data.map = map;
  }
  return JSON.stringify(data, null, 2);
}

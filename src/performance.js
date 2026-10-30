/** Visual + audio settings are client-only; they never influence economic or election outcomes. */
export const SETTINGS_KEY = 'v2n-visual-settings-v1';
export const FPS_OPTIONS = Object.freeze([30, 60, 120]);
export const GRAPHICS_OPTIONS = Object.freeze(['low', 'medium', 'high']);
export const DEFAULT_SETTINGS = Object.freeze({ fps: 60, quality: 'medium', showFps: false, sfx: 0.6, ambience: 0.3, muted: false });

/**
 * Real rendering behaviour per quality level (read by src/ui/render.js every frame):
 *  renderScale   – internal canvas resolution relative to CSS px × devicePixelRatio
 *  maxDpr        – cap on devicePixelRatio used
 *  shadow        – soft shadows under characters/trees/buildings
 *  grade         – time-of-day colour grading + vignette (cinematic look)
 *  particles     – night fireflies count
 *  animatedWater – shimmering pond overlay
 *  nightLights   – glow from lamps/buildings after dark
 *  npcAnimFps    – walk animation rate for NPCs (player always 8)
 *  labels        – floating names over NPCs when close
 */
export const QUALITY_PROFILES = Object.freeze({
  low: Object.freeze({ renderScale: 0.5, maxDpr: 1, foliageDetail: 0, groundDecor: 0, particles: 0, shadow: false, animatedWater: false, nightLights: false, npcAnimFps: 4, labels: false, grade: false }),
  medium: Object.freeze({ renderScale: 0.75, maxDpr: 2, foliageDetail: 1, groundDecor: 1, particles: 4, shadow: true, animatedWater: false, nightLights: true, npcAnimFps: 6, labels: true, grade: true }),
  high: Object.freeze({ renderScale: 1, maxDpr: 3, foliageDetail: 2, groundDecor: 2, particles: 14, shadow: true, animatedWater: true, nightLights: true, npcAnimFps: 8, labels: true, grade: true }),
});

const vol = (v, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : d; };
export function normalizeSettings(input) {
  const obj = input && typeof input === 'object' ? input : {};
  const fps = FPS_OPTIONS.includes(Number(obj.fps)) ? Number(obj.fps) : 60;
  const quality = GRAPHICS_OPTIONS.includes(obj.quality) ? obj.quality : 'medium';
  return { fps, quality, showFps: obj.showFps === true, sfx: vol(obj.sfx, DEFAULT_SETTINGS.sfx), ambience: vol(obj.ambience, DEFAULT_SETTINGS.ambience), muted: obj.muted === true };
}

export function loadSettings(storage) {
  try { return normalizeSettings(JSON.parse(storage.getItem(SETTINGS_KEY))); }
  catch { return { ...DEFAULT_SETTINGS }; }
}

export function saveSettings(storage, next) {
  const normalized = normalizeSettings(next);
  try { storage.setItem(SETTINGS_KEY, JSON.stringify(normalized)); } catch { /* private mode or quota */ }
  return normalized;
}

/** Schedules render frames only. Simulation uses elapsed wall-clock time, not an FPS-dependent speed. */
export function frameIntervalMs(fps) { return 1000 / normalizeSettings({ fps }).fps; }

/** Internal canvas size for a CSS size under a quality profile (pure, tested). */
export function canvasResolution(cssW, cssH, dpr, quality) {
  const p = QUALITY_PROFILES[quality] || QUALITY_PROFILES.medium;
  const k = Math.min(dpr || 1, p.maxDpr) * p.renderScale;
  let w = Math.max(160, Math.round(cssW * k)), h = Math.max(90, Math.round(cssH * k));
  const maxW = 2560; if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
  return { w, h, k: w / Math.max(1, cssW) };
}

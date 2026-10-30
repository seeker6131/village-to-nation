// Test mode ("โหมดทดสอบ ∞"): skip naming/dressing, unlimited coins/wood/stone/energy/treasury.
// Uses its own save slot so the real save is never touched. On by default for now (developer play-testing);
// turned off from the start screen. Real-money purchases stay impossible either way.
import { SAVE_KEY } from './gameState.js';
import { DEFAULT_APPEARANCE } from './character/model.js';

export const SANDBOX_FLAG = 'v2n-sandbox';
export const INF = 999999;
export function sandboxEnabled(rawStorage, params) {
  if (params.has('sandbox')) return params.get('sandbox') !== '0';
  if (params.has('test')) return false; // automated tests play the normal game
  try { return rawStorage.getItem(SANDBOX_FLAG) !== '0'; } catch { return true; }
}
export function setSandbox(rawStorage, on) { try { rawStorage.setItem(SANDBOX_FLAG, on ? '1' : '0'); } catch { /* */ } }
/** Storage view that redirects the main save key to the sandbox slot. */
export function sandboxStorage(raw) {
  const k = key => (key === SAVE_KEY ? SAVE_KEY + '-sandbox' : key);
  return { getItem: key => raw.getItem(k(key)), setItem: (key, v) => raw.setItem(k(key), v), removeItem: key => raw.removeItem(k(key)) };
}
/** Ready-made character so the game starts straight away. */
export function ensureSandboxCharacter(s) {
  if (s.character) return false;
  s.character = { name: 'นักทดสอบ', lang: 'th', appearance: { ...DEFAULT_APPEARANCE, hair: 'messy', outfit: 'farmer' }, created: true };
  s.player.name = s.character.name;
  if (s.leadership) s.leadership.path = 'founder';
  return true;
}
/** Called every frame: keep everything topped up. */
export function topUp(s) {
  const p = s.player; if (!p) return;
  p.coins = INF; p.wood = INF; p.stone = INF; p.stamina = 100; p.food = Math.max(p.food || 0, 99);
  if (s.town) s.town.treasury = Math.max(s.town.treasury || 0, INF);
  if (s.inventory) for (const k of ['seed', 'vegetables', 'planks', 'food']) if (k in s.inventory || k === 'seed') s.inventory[k] = Math.max(s.inventory[k] || 0, 99);
}

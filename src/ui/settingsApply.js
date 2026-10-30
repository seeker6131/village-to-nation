// Applies visual settings to the live renderer (resolution, FPS counter) — real behaviour, not just a stored value.
import { canvasResolution } from '../performance.js';
import { configureAudio } from '../audio.js';
import { setResolution } from './render.js';
import { G } from './game.js';

export function applySettings() {
  const dpr = window.devicePixelRatio || 1;
  const r = canvasResolution(G.cssW, G.cssH, dpr, G.settings.quality);
  setResolution(r.w, r.h, r.k);
  G.resolution = `${r.w}×${r.h}`;
  G.applyZoom?.(); // re-snap zoom to whole canvas pixels for the new resolution
  const fc = document.querySelector('#fps-counter'); if (fc) fc.hidden = !G.settings.showFps;
  configureAudio(G.settings);
}

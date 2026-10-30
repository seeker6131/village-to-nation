// Camera: world-pixel position (centre), zoom = CSS pixels per world pixel.
import { TILE, WORLD_W, WORLD_H } from '../world.js';
export const WORLD_PX_W = WORLD_W * TILE, WORLD_PX_H = WORLD_H * TILE;

export function createCamera() { return { x: 40 * TILE, y: 50 * TILE, zoom: 2, zoomTarget: 2, k: 1, follow: true, overview: false, baseZoom: 2 }; }
/**
 * Pixel-perfect zoom: one world pixel always covers a WHOLE number of canvas pixels (k = canvas px per CSS px),
 * so pixel art never blurs or gets uneven fat/thin pixels at any zoom level. Gestures change zoomTarget smoothly;
 * the rendered zoom snaps to the nearest crisp step.
 */
// v0.12: art is stored at 2 sprite px per world px (buildings, props, characters), so canvas px per world px must be
// EVEN (2, 4, 6 …) for every sprite pixel to cover the same whole number of screen pixels. 1 is allowed only for
// the far-out overview.
// v0.16: every whole canvas px per world px is allowed (more zoom levels); odd steps make 2x sprite pixels
// alternate 1/2 px only at tiny zooms, invisible from 3x up.
export const evenStep = v => Math.max(1, Math.round(v));
export function snapZoom(z, k = 1) { return evenStep(z * k) / k; }

/** Comfortable default: about 15 tiles of height visible, more on big screens. */
export function defaultZoom(cssW, cssH) { const rows = cssH > 600 ? 21 : cssH <= 360 ? 17 : 15; return Math.max(1, Math.min(4, Math.min(cssH / (rows * TILE), cssW / (26 * TILE)))); }
export function zoomLimits(cssW, cssH) {
  const min = Math.max(cssW / WORLD_PX_W, cssH / WORLD_PX_H); // never show outside the map
  return { min: Math.min(min, 4), max: 8 };
}
export function setZoom(cam, z, cssW, cssH) {
  const { min, max } = zoomLimits(cssW, cssH), k = cam.k || 1;
  cam.zoomTarget = Math.max(min, Math.min(max, z));
  let snapped = snapZoom(cam.zoomTarget, k);
  if (snapped < min) snapped = Math.ceil(min * k - 1e-9) / k; // never show outside the map
  if (snapped > max) snapped = Math.max(1, Math.floor(max * k)) / k;
  cam.zoom = snapped;
  return cam.zoom;
}

/** Keep the view inside the map. */
export function clampCamera(cam, cssW, cssH) {
  const halfW = cssW / cam.zoom / 2, halfH = cssH / cam.zoom / 2;
  cam.x = halfW * 2 >= WORLD_PX_W ? WORLD_PX_W / 2 : Math.max(halfW, Math.min(WORLD_PX_W - halfW, cam.x));
  cam.y = halfH * 2 >= WORLD_PX_H ? WORLD_PX_H / 2 : Math.max(halfH, Math.min(WORLD_PX_H - halfH, cam.y));
  return cam;
}
export function screenToWorld(cam, sx, sy, cssW, cssH) { return { x: cam.x + (sx - cssW / 2) / cam.zoom, y: cam.y + (sy - cssH / 2) / cam.zoom }; }
export function worldToScreen(cam, wx, wy, cssW, cssH) { return { x: (wx - cam.x) * cam.zoom + cssW / 2, y: (wy - cam.y) * cam.zoom + cssH / 2 }; }
/** Zoom keeping the world point under (sx,sy) fixed (pinch / wheel focus). */
export function zoomAt(cam, factor, sx, sy, cssW, cssH) {
  const before = screenToWorld(cam, sx, sy, cssW, cssH);
  setZoom(cam, (cam.zoomTarget || cam.zoom) * factor, cssW, cssH);
  const after = screenToWorld(cam, sx, sy, cssW, cssH);
  if (!cam.follow) { cam.x += before.x - after.x; cam.y += before.y - after.y; }
  return cam.zoom;
}

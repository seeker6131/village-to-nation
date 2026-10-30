// Skeletal (cut-out) character rig. Pure pixel maths — runs in Node tests and the browser.
//
// Parts (src/character/rigData.js, built by scripts/build-rig.py) are posed on a skeleton at RIG resolution
// (character 248 px tall, frame 320 px), then baked 4:1 into 80 px pixel-art frames with a 1 px outline.
// Frames are drawn at 2 sprite px per world px (like the buildings), so the character is ~31 world px tall and stays
// crisp at every (even) zoom. Atlas: 4 rows (down, left, right, up) × 9 columns (0 = idle, 1..8 = walk). Feet on y = 76.
//
// Walk cycle (side view): thighs swing ±26°, knees bend during the forward swing, the planted foot stays flat,
// arms counter-swing with an elbow bend, the body height comes from the lowest foot (real contact = natural bob),
// head/hair follow with a small lag. Front/back views: the stepping leg lifts (shin foreshortens), the body sways
// over the standing leg and arms swing outward/inward. Right = mirrored left.
import { RIG_META, RIG_PARTS } from './rigData.js';
import { CHARACTER_ATLAS } from './atlasData.js';
import { HAIR_COLORS, SKIN_TONES, EYE_COLORS, OUTFITS, normalizeAppearance } from './model.js';
import { shadeColor, decodeRle, hairLayerRGBA } from './composer.js';

export const RIG_DIRS = ['down', 'left', 'right', 'up'];
export const RIG_COLS = 9, WALK_FRAMES = 8, F = 80, SS = 4, RIG_BASELINE = 76;
const RF = F * SS, H = RIG_META.rigH, CX = RF / 2, GROUND = RIG_BASELINE * SS, TOP = GROUND - H;
const MAT = RIG_META.materials;
const VIEW = { down: 'front', left: 'side', right: 'side', up: 'back' };
const DEG = Math.PI / 180;
export const RIG_HAIRS = RIG_META.hairs;       // hair drawn for the rig (e.g. 'messy')
export const RIG_OUTFITS = RIG_META.outfits;   // garments drawn for the rig (e.g. 'farmer'); others are recolours
const DEFAULT_RIG_HAIR = [92, 62, 44];
// where rig hair sits on the head (fractions of the head box); fringe must stay above the eyes
const HAIR_FIT = { front: { dx: 0, dy: -.2, s: .94 }, side: { dx: .06, dy: -.2, s: .98 }, back: { dx: 0, dy: -.12, s: .96 } };

// ------------------------------------------------------------------ parts (decode + recolour, cached)
const decoded = new Map();
function rawPart(name) {
  if (decoded.has(name)) return decoded.get(name);
  const P = RIG_PARTS[name]; if (!P) return null;
  const v = { w: P.w, h: P.h, pal: P.palette, idx: decodeRle(P.data, P.w * P.h) };
  decoded.set(name, v); return v;
}

/** Colour context for one appearance. */
function palette(a) {
  const outfit = OUTFITS[a.outfit] || null;
  const garment = outfit && (RIG_OUTFITS.includes(a.outfit) ? a.outfit : RIG_OUTFITS[0]);
  const recolor = outfit && !RIG_OUTFITS.includes(a.outfit);
  return {
    skin: SKIN_TONES[a.skin].rgb, eye: EYE_COLORS[a.eyes].rgb, hair: HAIR_COLORS[a.hairColor].rgb, outfit, garment, recolor,
  };
}
const colored = new Map();
function part(name, C) {
  const key = name + '|' + JSON.stringify(C);
  if (colored.has(key)) return colored.get(key);
  const p = rawPart(name); if (!p) return null;
  const n = p.w * p.h, rgba = new Uint8ClampedArray(n * 4), isHair = name.startsWith('hair_');
  const lut = p.pal.map(([r, g, b, m, sh]) => {
    switch (m) {
      case MAT.SKIN: return shadeColor(C.skin, sh);
      case MAT.EYE: return C.eye ? shadeColor(C.eye, sh) : [r, g, b];
      case MAT.BROW: return shadeColor((C.hair || DEFAULT_RIG_HAIR).map(c => c * 0.75), sh);
      case MAT.HAIR: return shadeColor(C.hair || DEFAULT_RIG_HAIR, Math.min(150, sh));
      case MAT.TOP: return C.recolor ? shadeColor(C.outfit.top, sh) : [r, g, b];
      case MAT.BOTTOM: return C.recolor ? shadeColor(C.outfit.bottom, sh) : [r, g, b];
      case MAT.SHOES: return C.recolor ? shadeColor(C.outfit.shoes, sh) : [r, g, b];
      case MAT.ACCENT: return C.recolor ? shadeColor(C.outfit.collar || C.outfit.bottom.map(c => c * .7), sh > 60 ? 96 : sh) : [r, g, b];
      case MAT.OUTLINE: return isHair ? shadeColor(C.hair || DEFAULT_RIG_HAIR, 30) : [r, g, b];
      default: return [r, g, b];
    }
  });
  for (let i = 0; i < n; i++) { const k = p.idx[i]; if (!k) continue; const c = lut[k]; rgba[i * 4] = c[0]; rgba[i * 4 + 1] = c[1]; rgba[i * 4 + 2] = c[2]; rgba[i * 4 + 3] = 255; }
  const v = { w: p.w, h: p.h, rgba };
  if (colored.size > 600) colored.delete(colored.keys().next().value);
  colored.set(key, v); return v;
}

// v0.8 hairstyles (pony/swept/short) are re-fitted onto the rig head from the old atlas (same recolour rules)
const OLD = { headH: 27, headTop: { down: 11, left: 10, up: 11 }, headCx: { down: 32, left: 31.5, up: 32 }, row: { down: 0, left: 1, up: 3 } };
function oldHair(a, view, which) {
  const key = `old|${a.hair}|${a.hairColor}|${view}|${which}`;
  if (colored.has(key)) return colored.get(key);
  const full = hairLayerRGBA(a, which); if (!full) return null;
  const dir = view === 'front' ? 'down' : view === 'side' ? 'left' : 'up', row = OLD.row[dir], size = CHARACTER_ATLAS.size, OF = CHARACTER_ATLAS.frame;
  const rgba = new Uint8ClampedArray(OF * OF * 4);
  for (let y = 0; y < OF; y++) for (let x = 0; x < OF; x++) {
    const s = ((row * OF + y) * size + x) * 4; if (!full[s + 3]) continue;
    const d = (y * OF + x) * 4; rgba[d] = full[s]; rgba[d + 1] = full[s + 1]; rgba[d + 2] = full[s + 2]; rgba[d + 3] = 255;
  }
  const v = { w: OF, h: OF, rgba, old: { top: OLD.headTop[dir], cx: OLD.headCx[dir] } };
  colored.set(key, v); return v;
}

// ------------------------------------------------------------------ drawing into the rig buffer
/** Inverse-mapped nearest-neighbour blit: pivot (px,py) of the part lands on (x,y), rotated by ang, scaled sx/sy. */
function blit(buf, grp, gid, p, x, y, px, py, ang = 0, sx = 1, sy = 1, flip = false, dark = 1) {
  if (!p) return;
  const c = Math.cos(ang), s = Math.sin(ang);
  // bounding box of the transformed part
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [u, v] of [[0, 0], [p.w, 0], [0, p.h], [p.w, p.h]]) {
    const ux = (flip ? px - u : u - px) * sx, vy = (v - py) * sy;
    const X = x + ux * c - vy * s, Y = y + ux * s + vy * c;
    x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y);
  }
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(RF - 1, Math.ceil(x1)); y1 = Math.min(RF - 1, Math.ceil(y1));
  for (let Y = y0; Y <= y1; Y++) for (let X = x0; X <= x1; X++) {
    const dx = X + .5 - x, dy = Y + .5 - y;
    const u = (dx * c + dy * s) / sx, v = (-dx * s + dy * c) / sy;
    const sxp = Math.floor(flip ? px - u : px + u), syp = Math.floor(py + v);
    if (sxp < 0 || syp < 0 || sxp >= p.w || syp >= p.h) continue;
    const si = (syp * p.w + sxp) * 4; if (!p.rgba[si + 3]) continue;
    const di = (Y * RF + X) * 4;
    buf[di] = p.rgba[si] * dark; buf[di + 1] = p.rgba[si + 1] * dark; buf[di + 2] = p.rgba[si + 2] * dark; buf[di + 3] = 255;
    grp[Y * RF + X] = gid;
  }
}

const U = v => v * H; // H units -> rig px
const rot = (ang, len) => [-Math.sin(ang) * len, Math.cos(ang) * len]; // vector of a limb hanging down, rotated by ang

/** Pose for one frame. col 0 = idle, 1..8 = walk. Returns joint angles/offsets. */
export function pose(view, col) {
  const walking = col > 0, p = walking ? (col - 1) / WALK_FRAMES * Math.PI * 2 : 0;
  const S = Math.sin, Co = Math.cos;
  if (view === 'side') {
    const leg = ph => { const th = walking ? 26 * DEG * S(ph) : 0, knee = walking ? (6 + 40 * Math.max(0, Co(ph))) * DEG : 0; return { thigh: th, shin: th - knee, foot: walking ? -(th - knee) * .8 + (S(ph) < -.3 && Co(ph) > 0 ? 0 : 0) : 0 }; };
    const arm = ph => { const a = walking ? 22 * DEG * S(ph) : 2 * DEG; return { up: a, fore: a + (walking ? (10 + 16 * Math.max(0, S(ph))) * DEG : 6 * DEG) }; };
    return { view, near: leg(p), far: leg(p + Math.PI), armNear: arm(p + Math.PI), armFar: arm(p), lean: walking ? 1 : 0, lag: walking ? S(2 * p - .9) : 0, phase: p, walking };
  }
  // front / back: lift = how much each leg is raised toward/away from the viewer
  const lift = ph => walking ? Math.max(0, S(ph)) : 0;
  const swing = ph => walking ? S(ph) : 0;
  return { view, lift: [lift(p), lift(p + Math.PI)], swing: [swing(p + Math.PI), swing(p)], sway: walking ? .008 * S(p) : 0, lag: walking ? S(2 * p - .9) : 0, phase: p, walking };
}

function drawFrame(buf, grp, view, col, a, C) {
  const P = pose(view, col), pre = `${view}_`;
  const hairName = (layer, v = view) => RIG_HAIRS.includes(a.hair) ? `hair_${a.hair}_${v}_${layer}` : null;
  const G = name => part(name, C);
  const garment = piece => C.garment ? G(`outfit_${C.garment}_${view}_${piece}`) : null;
  const sleeveLong = C.recolor && C.outfit.sleeve >= 5, pantsLong = !C.outfit || C.outfit.pants >= 4;
  const ops = []; // [group, fn]
  // part drawing helpers (pivot: top-centre for limbs)
  const limb = (gid, name, x, y, ang, { sx = 1, sy = 1, flip = false, dark = 1, cap = .1 } = {}) => {
    const p = G(name); if (!p) return;
    blit(buf, grp, gid, p, x, y, p.w / 2, p.h * cap, ang, sx, sy, flip, dark);
  };
  const piece = (gid, p, x, y, ang, { sx = 1, sy = 1, flip = false, dark = 1, cap = .1 } = {}) => p && blit(buf, grp, gid, p, x, y, p.w / 2, p.h * cap, ang, sx, sy, flip, dark);

  if (view === 'side') {
    const lean = P.lean * 1.5 * DEG;
    // leg geometry first, to find the body height that puts the lowest foot on the ground
    const hipX = CX + U(.03), hipY = TOP + U(.655);
    const legPts = L => { const knee = [hipX + rot(L.thigh, U(.2))[0], hipY + rot(L.thigh, U(.2))[1]]; const ank = [knee[0] + rot(L.shin, U(.1))[0], knee[1] + rot(L.shin, U(.1))[1]]; return { knee, ank }; };
    const n = legPts(P.near), f = legPts(P.far);
    const footBottom = Math.max(n.ank[1], f.ank[1]) + U(.045);
    const dy = GROUND - footBottom; // >= 0: body drops when legs spread
    const by = dy + U(.004) * (P.walking ? Math.cos(2 * P.phase) : 0);
    const shoulder = [CX + U(.025) - U(.006) * P.lean, TOP + U(.40) + by];
    const drawArm = (A, gid, dark) => {
      const el = [shoulder[0] + rot(A.up, U(.15))[0], shoulder[1] + rot(A.up, U(.15))[1]];
      limb(gid, pre + 'uarm', shoulder[0], shoulder[1], A.up, { dark, cap: .12 });
      if (C.garment) piece(gid, garment('usleeve'), shoulder[0], shoulder[1], A.up, { dark, cap: .14 });
      limb(gid, pre + 'farm', el[0], el[1], A.fore, { dark, cap: .08 });
      if (C.garment && sleeveLong) { const s = garment('lsleeve'); piece(gid, s, el[0], el[1], A.fore, { dark, cap: .08, sy: (U(.185) * .6) / (s?.h || 1) }); }
    };
    const drawLeg = (L, pts, gid, dark) => {
      const hx = hipX, hy = hipY + dy;
      limb(gid, pre + 'thigh', hx, hy, L.thigh, { dark, cap: .13 });
      if (C.garment) piece(gid, garment('pthigh'), hx, hy, L.thigh, { dark, cap: .12 });
      limb(gid, pre + 'shin', pts.knee[0], pts.knee[1] + dy, L.shin, { dark, cap: .12 });
      if (C.garment && pantsLong) piece(gid, garment('pshin'), pts.knee[0], pts.knee[1] + dy, L.shin, { dark, cap: .1 });
      const foot = G(pre + 'foot'), fx = pts.ank[0], fy = pts.ank[1] + dy - U(.03);
      if (foot) blit(buf, grp, gid, foot, fx, fy, foot.w * .7, 0, L.foot * .5, 1, 1, false, dark);
      const shoe = garment('shoe'); if (shoe) blit(buf, grp, gid, shoe, fx, fy + U(.004), shoe.w * .7, 0, L.foot * .5, 1, 1, false, dark);
    };
    ops.push(['armF', () => drawArm(P.armFar, 1, .78)]);
    ops.push(['legF', () => drawLeg(P.far, f, 2, .8)]);
    // side view: the AI 'front layer' profile is unreliable (strands across the face) -> the solid side helmet (back layer) goes ON TOP of the head
    ops.push(['hairB', () => { oldHairBlit(3, 'back', by); }]);
    ops.push(['pelvis', () => { const x = CX + U(.01), y = TOP + U(.585) + by; if (C.garment) piece(4, garment('seat'), x, y, 0, { cap: 0 }); else limb(4, pre + 'pelvis', x, y, 0, { cap: 0 }); }]);
    ops.push(['legN', () => drawLeg(P.near, n, 5, 1)]);
    ops.push(['torso', () => { const x = CX - U(.004) * P.lean, y = TOP + U(.335) + by; limb(6, pre + 'torso', x, y, -lean, { cap: 0 }); if (C.garment) { const s = garment('shirt'); piece(6, s, x, TOP + U(.597) + by, -lean, { cap: 1 }); } }]);
    ops.push(['head', () => headBlit(7, by)]);
    ops.push(['hairF', () => { const h = hairName('back'); h && hairBlit(8, h, by); oldHairBlit(8, 'front', by); }]);
    ops.push(['armN', () => drawArm(P.armNear, 9, 1)]);
  } else {
    const back = view === 'back';
    const sway = U(P.sway);
    const hip = i => [CX + (i ? 1 : -1) * U(.054) + sway * .4, TOP + U(.655)];
    // stepping leg: thigh/shin foreshorten (lift toward the viewer in front view, away in back view)
    const legDims = i => { const l = P.lift[i]; return { th: 1 - .12 * l, sh: 1 - .42 * l }; };
    const footBottoms = [0, 1].map(i => { const d = legDims(i); return hip(i)[1] + U(.2) * d.th + U(.1) * d.sh + U(.045); });
    const dy = GROUND - Math.max(...footBottoms);
    const by = dy - U(.006) * (P.walking ? Math.abs(Math.sin(P.phase)) : 0) * 0;
    const drawLeg = (i, gid) => {
      const [hx, hy0] = hip(i), hy = hy0 + dy, d = legDims(i), flip = i === 1;
      const kneeY = hy + U(.2) * d.th, ankY = kneeY + U(.1) * d.sh;
      limb(gid, pre + 'thigh', hx, hy, 0, { sy: d.th, flip, cap: .13 });
      if (C.garment) piece(gid, garment('pthigh'), hx, hy, 0, { sy: d.th, flip, cap: .12 });
      limb(gid, pre + 'shin', hx, kneeY, 0, { sy: d.sh, flip, cap: .12 });
      if (C.garment && pantsLong) piece(gid, garment('pshin'), hx, kneeY, 0, { sy: d.sh, flip, cap: .1 });
      limb(gid, pre + 'foot', hx + (i ? 1 : -1) * U(.006), ankY - U(.03), 0, { flip, cap: 0 });
      if (C.garment) piece(gid, garment('shoe'), hx + (i ? 1 : -1) * U(.006), ankY - U(.026), 0, { flip, cap: 0 });
    };
    const shoulder = i => [CX + (i ? 1 : -1) * U(.105) + sway, TOP + U(.40) + by];
    const drawArm = (i, gid) => {
      const sw = P.swing[i], out = (i ? -1 : 1) * (2.5 + 3.5 * Math.abs(sw)) * DEG; // arms flare a little when swinging
      const [sx0, sy0] = shoulder(i), flip = i === 1;
      const fore = (back ? -sw : sw); // + = hand toward the viewer: forearm looks longer, - = shorter
      const el = [sx0 + rot(out, U(.15))[0], sy0 + rot(out, U(.15))[1]];
      limb(gid, pre + 'uarm', sx0, sy0, out, { flip, cap: .12, sy: 1 - .06 * Math.max(0, -fore) });
      if (C.garment) piece(gid, garment('usleeve'), sx0, sy0, out, { flip, cap: .14 });
      limb(gid, pre + 'farm', el[0], el[1], out * 1.4, { flip, cap: .08, sy: 1 - .16 * Math.max(0, -fore) + .05 * Math.max(0, fore) });
      if (C.garment && sleeveLong) { const s = garment('lsleeve'); piece(gid, s, el[0], el[1], out * 1.4, { flip, cap: .08, sy: (U(.185) * .6) / (s?.h || 1) }); }
    };
    if (!back) ops.push(['hairB', () => { const h = hairName('back'); h && hairBlit(1, h, by, sway); oldHairBlit(1, 'back', by, sway); }]);
    // the leg that is lifted toward the viewer is drawn last (in front); away from the viewer in the back view
    const order = P.lift[0] > P.lift[1] !== back ? [1, 0] : [0, 1];
    ops.push(['legA', () => drawLeg(order[0], 2)]);
    ops.push(['legB', () => drawLeg(order[1], 3)]);
    ops.push(['pelvis', () => { const x = CX + sway * .6, y = TOP + U(.585) + by; if (C.garment) piece(4, garment('seat'), x, y, 0, { cap: 0 }); else limb(4, pre + 'pelvis', x, y, 0, { cap: 0 }); }]);
    ops.push(['torso', () => { const x = CX + sway, y = TOP + U(.335) + by; limb(5, pre + 'torso', x, y, 0, { cap: 0 }); if (C.garment) piece(5, garment('shirt'), x, TOP + U(.597) + by, 0, { cap: 1 }); }]);
    ops.push(['armA', () => drawArm(0, 6)]);
    ops.push(['armB', () => drawArm(1, 7)]);
    ops.push(['head', () => headBlit(8, by, sway)]);
    ops.push(['hairF', () => { const h = hairName('front'); h && hairBlit(9, h, by, sway); oldHairBlit(9, 'front', by, sway); }]);
    if (back) ops.push(['hairB', () => { const h = hairName('back'); h && hairBlit(10, h, by, sway); oldHairBlit(10, 'back', by, sway); }]);
  }
  for (const [, fn] of ops) fn();

  // ---- head + hair helpers (closures over view/pose)
  function headPos(by, sway = 0) { const lag = U(.003) * P.lag; return [CX + (view === 'side' ? U(.008) - U(.008) * (P.lean || 0) : sway), TOP + U(.352) + by + lag]; }
  function headBlit(gid, by, sway) { const p = G(pre + 'head'); if (!p) return; const [x, y] = headPos(by, sway); blit(buf, grp, gid, p, x, y, p.w / 2, p.h, 0); }
  function hairBlit(gid, name, by, sway) {
    const p = G(name), head = G(pre + 'head'); if (!p || !head) return;
    const [x, yb] = headPos(by, sway), headTop = yb - head.h, lag = U(.004) * P.lag;
    // centre on the head; the hair crown sits slightly above the skull. Side view: hair hangs toward the back (+x)
    const o = HAIR_FIT[view];
    blit(buf, grp, gid, p, x + head.w * o.dx, headTop + head.h * o.dy + lag, p.w / 2, 0, 0, o.s, o.s);
  }
  function oldHairBlit(gid, which, by, sway) {
    if (RIG_HAIRS.includes(a.hair) || a.hair === 'bald') return;
    const p = oldHair(a, view, which), head = G(pre + 'head'); if (!p || !head) return;
    const [x, yb] = headPos(by, sway), headTop = yb - head.h, s = head.h / OLD.headH * 1.02;
    blit(buf, grp, gid, p, x + (view === 'side' ? head.w * .07 : 0), headTop - s * 1, p.old.cx, p.old.top, 0, s, s, false);
  }
}

// ------------------------------------------------------------------ bake 4:1 + outline
const clamp = v => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
function downsample(buf, grp, out, outW, ox, oy) {
  const g1 = new Uint8Array(F * F), op = new Uint8Array(F * F);
  for (let y = 0; y < F; y++) for (let x = 0; x < F; x++) {
    let n = 0, r = 0, g = 0, b = 0; const cnt = new Uint8Array(16);
    for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) {
      const k = (y * SS + j) * RF + x * SS + i; if (!buf[k * 4 + 3]) continue;
      n++; r += buf[k * 4]; g += buf[k * 4 + 1]; b += buf[k * 4 + 2]; cnt[grp[k]]++;
    }
    if (n < 7) continue;
    let best = 0; for (let q = 1; q < 16; q++) if (cnt[q] > cnt[best]) best = q;
    const o = ((oy + y) * outW + ox + x) * 4;
    out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
    g1[y * F + x] = best; op[y * F + x] = 1;
  }
  // inner edges: the front part of two overlapping groups gets a darker rim (separates arm from torso, hair from face)
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const dark = [];
  for (let y = 0; y < F; y++) for (let x = 0; x < F; x++) {
    const i = y * F + x; if (!op[i]) continue;
    for (const [dx, dy] of N4) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= F || Y >= F) continue; const j = Y * F + X; if (op[j] && g1[j] < g1[i] && g1[i] - g1[j] > 0) { dark.push(i); break; } }
  }
  for (const i of dark) { const o = ((oy + Math.floor(i / F)) * outW + ox + i % F) * 4; out[o] = out[o] * .62; out[o + 1] = out[o + 1] * .62; out[o + 2] = out[o + 2] * .62; }
  // outer outline (1 px, deep shade of the neighbour)
  const ring = [];
  for (let y = 0; y < F; y++) for (let x = 0; x < F; x++) {
    if (op[y * F + x]) continue;
    for (const [dx, dy] of N4) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= F || Y >= F || !op[Y * F + X]) continue; ring.push([x, y, X, Y]); break; }
  }
  for (const [x, y, X, Y] of ring) {
    const s = ((oy + Y) * outW + ox + X) * 4, d = ((oy + y) * outW + ox + x) * 4;
    out[d] = clamp(out[s] * .28); out[d + 1] = clamp(out[s + 1] * .26); out[d + 2] = clamp(out[s + 2] * .3); out[d + 3] = 255;
  }
}

/**
 * Compose the full atlas for an appearance: RGBA, (RIG_COLS*64) x (4*64).
 * @returns {{width:number,height:number,data:Uint8ClampedArray}}
 */
export function composeRigAtlas(appearanceInput, opts = {}) {
  const a = normalizeAppearance(appearanceInput, opts.unlockedOutfits || Object.keys(OUTFITS));
  const C = palette(a);
  const W = RIG_COLS * F, Hh = RIG_DIRS.length * F, out = new Uint8ClampedArray(W * Hh * 4);
  const buf = new Uint8ClampedArray(RF * RF * 4), grp = new Uint8Array(RF * RF);
  for (const [row, dir] of RIG_DIRS.entries()) {
    if (dir === 'right') continue; // mirrored from left below
    for (let col = 0; col < RIG_COLS; col++) {
      buf.fill(0); grp.fill(0);
      drawFrame(buf, grp, VIEW[dir], col, a, C);
      downsample(buf, grp, out, W, col * F, row * F);
    }
  }
  const L = RIG_DIRS.indexOf('left'), R = RIG_DIRS.indexOf('right');
  for (let col = 0; col < RIG_COLS; col++) for (let y = 0; y < F; y++) for (let x = 0; x < F; x++) {
    const s = ((L * F + y) * W + col * F + x) * 4, d = ((R * F + y) * W + col * F + (F - 1 - x)) * 4;
    out[d] = out[s]; out[d + 1] = out[s + 1]; out[d + 2] = out[s + 2]; out[d + 3] = out[s + 3];
  }
  return { width: W, height: Hh, data: out };
}

export function rigFrameRect(dir, col) { return { x: col * F, y: Math.max(0, RIG_DIRS.indexOf(dir)) * F, w: F, h: F }; }
/** Column for a character that has walked `dist` world px (stride = world px per frame). */
export function rigWalkColumn(walking, dist, stride) { return walking ? 1 + (Math.floor(dist / stride) % WALK_FRAMES + WALK_FRAMES) % WALK_FRAMES : 0; }

// ---- browser cache: appearance key -> canvas
const cache = new Map();
export function rigAtlasCanvas(appearance, opts = {}) {
  if (typeof document === 'undefined') return null;
  const key = JSON.stringify(appearance);
  if (cache.has(key)) return cache.get(key);
  const A = composeRigAtlas(appearance, opts);
  const c = document.createElement('canvas'); c.width = A.width; c.height = A.height;
  c.getContext('2d').putImageData(new ImageData(A.data, A.width, A.height), 0, 0);
  if (cache.size > 60) cache.delete(cache.keys().next().value);
  cache.set(key, c); return c;
}

// ---- background baking queue: the first appearance requested (the player) bakes first; others one per tick.
const queue = [], queued = new Set();
let timer = null;
function pump() {
  timer = null;
  const job = queue.shift(); if (!job) return;
  queued.delete(job.key);
  try { rigAtlasCanvas(job.appearance); } catch (e) { console.warn('rig bake failed', e); }
  if (queue.length) timer = setTimeout(pump, 16);
}
/** Cached atlas canvas, or null while it is being baked (caller draws a fallback that frame). */
export function rigAtlasReady(appearance, { urgent = false } = {}) {
  if (typeof document === 'undefined') return null;
  const key = JSON.stringify(appearance);
  if (cache.has(key)) return cache.get(key);
  if (urgent) return rigAtlasCanvas(appearance);
  if (!queued.has(key)) { queued.add(key); queue.push({ key, appearance }); if (!timer) timer = setTimeout(pump, 0); }
  return null;
}

#!/usr/bin/env python3
"""Village to Nation — modular character atlas builder (v0.8).

Input : source_art/characters/*.png  (owner-supplied sheets, untouched)
Output: assets/characters/*.png        (RGBA 256x256, 4x4 frames of 64x64, real alpha)
        assets/characters/anchors.json (per-frame anchors for QA/tests/artists)
        assets/characters/contact_sheet.png (visual QA)
        src/character/atlasData.js     (palette + material + body-part maps for runtime recolour)

Usage : python3 scripts/build-characters.py

Rules followed (see docs/CHARACTER_SYSTEM_TH.md):
  * ONE uniform scale per source sheet (body 1/5.5, hair 1/7.5) — never per-frame stretching.
  * Body frames: head top and head centre identical in every frame of a row; feet on baseline y=61.
  * Hair frames are fitted to the skull of the first frame of each direction, and later frames
    keep the same hair anchor (top + cap centre) so nothing jitters.
  * Rows are re-ordered so every atlas is down/left/right/up (fixes v0.7 mirrored side hair).
  * In the 'down' direction hair below the neck goes to a BACK layer drawn behind the body.
"""
import sys, json, base64
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from charlib import *  # noqa

OUT = ROOT / 'assets' / 'characters'
JS_OUT = ROOT / 'src' / 'character' / 'atlasData.js'
F = 64
BASELINE = 61          # y of the lowest foot pixel inside a 64px frame
HEAD_TOP = 7           # nominal; actual per row is BASELINE-based, recorded in anchors
BODY_FACTOR = 5.5
HAIR_FACTOR = 7.5
HAIR = {  # style id -> (source file, Thai name, English name)
    'pony': ('1000269384.png', 'หางม้า', 'Ponytail'),
    'swept': ('1000269385.png', 'ผมปัดข้าง', 'Side-swept'),
    'short': ('1000269386.png', 'ผมสั้นชี้', 'Short spiky'),
}

# material codes (keep in sync with src/character/materials.js)
M_NONE, M_FIXED, M_SKIN, M_EYE, M_BROW, M_HAIR, M_UNDER, M_OUTLINE, M_TIE = range(9)
# body part codes for skin/under pixels (clothing masks)
P_NONE, P_HEAD, P_TORSO, P_ARM, P_LEG, P_FOOT, P_UNDER = range(7)


def paste(dst, img, x, y, mask=None):
    h, w = img.shape[:2]
    for yy in range(h):
        ty = y + yy
        if not 0 <= ty < dst.shape[0]:
            continue
        for xx in range(w):
            tx = x + xx
            if not 0 <= tx < dst.shape[1] or img[yy, xx, 3] == 0:
                continue
            if mask is not None and not mask[yy, xx]:
                continue
            dst[ty, tx] = img[yy, xx]


def lum(rgb):
    rgb = np.asarray(rgb, float)
    return 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]


# ------------------------------------------------------------------ body
def build_body():
    src = components_full(clean_fringe(load_rgba('1000269387.png')), BODY_FACTOR)
    atlas = np.zeros((4 * F, 4 * F, 4), np.uint8)
    frames, anchors = {}, {}
    for r, d in enumerate(DIRS):
        row = src[SOURCE_ROW_FOR_DIR['body'][d]]
        infos = [head_info(fr) for fr in row]
        # head top shared within the row; feet of the tallest frame touch the baseline
        tallest = max(fr.shape[0] - hi['top'] for fr, hi in zip(row, infos))
        head_y = BASELINE + 1 - tallest
        anchors[d] = []
        for c, (fr, hi) in enumerate(zip(row, infos)):
            ox = int(round(F / 2 - hi['cx'] - 0.5))
            oy = head_y - hi['top']
            paste(atlas[r * F:(r + 1) * F, c * F:(c + 1) * F], fr, ox, oy)
            frames[(d, c)] = (fr, hi, ox, oy)
            al = fr[..., 3] > 0
            anchors[d].append({
                'headTop': int(oy + hi['top']), 'headCenterX': float(ox + hi['cx']),
                'neck': int(oy + hi['neck']), 'feet': int(oy + np.nonzero(al.any(1))[0].max()),
                'eyeTop': None if hi['eye_top'] is None else int(oy + hi['eye_top']),
            })
    return atlas, frames, anchors


def classify_body(atlas, frames):
    """Per-pixel material + body part for the whole body atlas."""
    mat = np.zeros(atlas.shape[:2], np.uint8)
    part = np.zeros(atlas.shape[:2], np.uint8)
    frac = np.zeros(atlas.shape[:2], np.uint8)
    hsv = rgb_to_hsv(atlas[..., :3]).reshape(atlas.shape[0], atlas.shape[1], 3).astype(int)
    H, S, V = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    for r, d in enumerate(DIRS):
        for c in range(4):
            fr, hi, ox, oy = frames[(d, c)]
            y0, x0 = r * F, c * F
            sl = (slice(y0, y0 + F), slice(x0, x0 + F))
            al = atlas[sl][..., 3] > 0
            h, s, v = H[sl], S[sl], V[sl]
            m = np.full((F, F), M_FIXED, np.uint8)
            m[~al] = M_NONE
            outline = al & (v < 75)
            under = al & (s < 55) & (v > 140)
            skin = al & ~outline & ~under & (h <= 25) & (s >= 35) & (v >= 120)
            m[skin] = M_SKIN
            m[under] = M_UNDER
            m[outline] = M_OUTLINE
            # eyes and brows only within the head
            eyes = np.zeros((F, F), bool)
            ey, ex = np.nonzero(hi['eyes'])
            eyes[ey + oy, ex + ox] = True
            # grow eyes by 1px to include the dark iris rim, but never into skin-bright pixels
            grown = cv2.dilate(eyes.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
            eyes = eyes | (grown & al & (v < 170) & ~skin)
            m[eyes & ~outline] = M_EYE
            head_rows = np.zeros((F, F), bool)
            head_rows[: oy + hi['neck'] + 1] = True
            brow = al & head_rows & ~eyes & ~outline & ~skin & ~under & (v < 190) & (s > 60) & (h <= 25)
            if hi['eye_top'] is not None:
                brow &= np.arange(F)[:, None] < oy + hi['eye_top']
            m[brow] = M_BROW
            mat[sl] = m
            # ---- body parts for clothing (skin + underwear pixels only)
            p = np.zeros((F, F), np.uint8)
            fr_ = np.zeros((F, F), np.uint8)
            neck = oy + hi['neck']
            p[head_rows & al] = P_HEAD
            neck = oy + hi['neck']
            under &= np.arange(F)[:, None] > neck + 3      # eye highlights are white too
            m[(m == M_UNDER) & ~under] = M_FIXED
            if under.any():
                ux0, uy0, ux1, uy1 = bbox(under)
            else:
                ux0, uy0, ux1, uy1 = 0, neck + 10, F - 1, neck + 14
            ys = np.arange(F)[:, None].repeat(F, 1)
            xs = np.arange(F)[None, :].repeat(F, 0)
            body_rows = al & (ys > neck)
            torso_band = body_rows & (ys < uy0)
            inside = (xs >= ux0) & (xs <= ux1)
            # arms: torso-band (and down to the hands) pixels outside the underwear columns
            arm = body_rows & ~inside & (ys <= uy1 + 2) & ~under
            # side views: the arm crosses the torso, so use colour-independent column test only
            torso = torso_band & inside
            p[torso] = P_TORSO
            p[arm] = P_ARM
            if arm.any():
                a_rows = np.nonzero(arm.any(1))[0]
                a0, a1 = neck + 1, a_rows.max()
                fr_[arm] = np.clip(((ys[arm] - a0) / max(1, a1 - a0) * 7).round(), 0, 7)
            p[under] = P_UNDER
            leg = body_rows & (ys > uy1) & ~arm & ~under
            if leg.any():
                l_rows = np.nonzero(leg.any(1))[0]
                l0, l1 = uy1 + 1, l_rows.max()
                f = np.clip(((ys - l0) / max(1, l1 - l0) * 7).round(), 0, 7)
                foot = leg & (ys >= l1 - 2)
                p[leg] = P_LEG
                fr_[leg] = f[leg]
                p[foot] = P_FOOT
            part[sl] = p
            frac[sl] = fr_
    return mat, part, frac


# ------------------------------------------------------------------ hair
def build_hair(style, body_frames):
    src_file = HAIR[style][0]
    src = components_full(clean_fringe(load_rgba(src_file)), HAIR_FACTOR)
    front = np.zeros((4 * F, 4 * F, 4), np.uint8)
    back = np.zeros((4 * F, 4 * F, 4), np.uint8)
    fits = {}
    for r, d in enumerate(DIRS):
        row = src[SOURCE_ROW_FOR_DIR['hair'][d]]
        b0, hi0, ox0, oy0 = body_frames[(d, 0)]
        dx, dy, cover, eyes = fit_hair(row[0], hi0)
        ref = row[0]
        ref_top, ref_cx = hair_anchor(ref)
        fits[d] = {'dx': int(dx), 'dy': int(dy), 'skullCover': round(float(cover), 3), 'eyePixelsCovered': int(eyes)}
        for c in range(4):
            hr = row[c]
            t, cx = hair_anchor(hr)
            # same anchor as frame 0 of this direction (relative to the body frame origin)
            hx = ox0 + dx + int(round(ref_cx - cx))
            hy = oy0 + dy + (ref_top - t)
            b, hi, ox, oy = body_frames[(d, c)]
            # body head is identical across the row, so the offset carries over
            hx += (ox - ox0)
            hy += (oy + hi['top']) - (oy0 + hi0['top'])
            cell_f = front[r * F:(r + 1) * F, c * F:(c + 1) * F]
            cell_b = back[r * F:(r + 1) * F, c * F:(c + 1) * F]
            if d == 'down':
                neck = oy + hi['neck']
                ys = np.arange(hr.shape[0])[:, None] + hy
                behind = np.broadcast_to(ys > neck, hr.shape[:2])
                paste(cell_b, hr, hx, hy, behind)
                paste(cell_f, hr, hx, hy, ~behind)
            else:
                paste(cell_f, hr, hx, hy)
    return front, back, fits


def hair_anchor(hr):
    H = hr[..., 3] > 0
    rows = np.nonzero(H.any(1))[0]
    top = int(rows.min())
    cap = H[top:top + max(3, H.shape[0] // 3)]
    cols = np.nonzero(cap.any(0))[0]
    return top, (cols.min() + cols.max()) / 2


def classify_hair(img):
    hsv = rgb_to_hsv(img[..., :3]).reshape(img.shape[0], img.shape[1], 3).astype(int)
    H, S, V = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    al = img[..., 3] > 0
    m = np.zeros(img.shape[:2], np.uint8)
    m[al] = M_HAIR
    r, g, b = [img[..., i].astype(int) for i in range(3)]
    tie = al & (r > 170) & (r - g > 105) & (b > 50)
    m[tie] = M_TIE
    # ears drawn inside the side-view hair art: light peach, close to the body skin colour
    ear = al & ~tie & (H >= 6) & (H <= 22) & (S >= 60) & (S <= 150) & (V >= 205)
    ear[:F] = False; ear[3 * F:] = False          # only side views draw an ear inside the hair art
    n, lbl, st, _ = cv2.connectedComponentsWithStats(ear.astype(np.uint8), 8)
    for i in range(1, n):
        if st[i, 4] >= 5 and st[i, 3] >= 3:           # a real ear blob, not a 1-2px highlight
            m[lbl == i] = M_SKIN
    m[al & (V < 55)] = M_OUTLINE
    return m


# ------------------------------------------------------------------ palette + encoding
def palette_encode(img, mat, max_per_mat=20):
    """Quantise colours separately per material and return (palette, index_map).

    palette entry: [r, g, b, material, shade*100]  (shade = luminance / material base luminance)
    """
    idx = np.zeros(img.shape[:2], np.uint8)
    palette = [[0, 0, 0, M_NONE, 0]]
    bases = {}
    for mcode in sorted(set(np.unique(mat)) - {M_NONE}):
        sel = mat == mcode
        px = img[sel][:, :3]
        if len(px) == 0:
            continue
        k = min(max_per_mat, len(np.unique(px, axis=0)))
        if k > 1:
            crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.5)
            _, labels, centers = cv2.kmeans(px.astype(np.float32), k, None, crit, 3, cv2.KMEANS_PP_CENTERS)
            labels = labels.ravel()
        else:
            labels = np.zeros(len(px), int)
            centers = px[:1].astype(np.float32)
        base = float(np.median(lum(px)))
        bases[int(mcode)] = base
        start = len(palette)
        for cc in centers:
            shade = float(lum(cc)) / max(1.0, base)
            palette.append([int(round(cc[0])), int(round(cc[1])), int(round(cc[2])), int(mcode), int(round(shade * 100))])
        idx[sel] = (labels + start).astype(np.uint8)
    if len(palette) > 255:
        raise RuntimeError('palette overflow')
    # also bake the quantised colours back into the PNG so file == runtime default
    out = img.copy()
    pal = np.array([p[:3] for p in palette], np.uint8)
    on = mat != M_NONE
    out[on, :3] = pal[idx[on]]
    return palette, idx, out, bases


def rle_b64(arr):
    flat = arr.ravel().tolist()
    out = bytearray()
    i = 0
    while i < len(flat):
        v = flat[i]
        n = 1
        while i + n < len(flat) and flat[i + n] == v and n < 255:
            n += 1
        out += bytes((n, v))
        i += n
    return base64.b64encode(bytes(out)).decode()


# ------------------------------------------------------------------ main
def main():
    OUT.mkdir(parents=True, exist_ok=True)
    body, frames, anchors = build_body()
    bmat, bpart, bfrac = classify_body(body, frames)
    bpal, bidx, body_q, bbases = palette_encode(body, bmat)
    save_png(body_q, OUT / 'body_base_4x4.png')
    layers = {'body': {'palette': bpal, 'data': rle_b64(bidx),
                       'parts': rle_b64(bpart * 8 + bfrac)}}
    meta_hair, fits_all = {}, {}
    for style in HAIR:
        front, back, fits = build_hair(style, frames)
        fits_all[style] = fits
        for kind, img in (('front', front), ('back', back)):
            m = classify_hair(img)
            pal, idx, q, _ = palette_encode(img, m)
            save_png(q, OUT / f'hair_{style}_{kind}_4x4.png')
            layers[f'hair_{style}_{kind}'] = {'palette': pal, 'data': rle_b64(idx)}
        meta_hair[style] = {'th': HAIR[style][1], 'en': HAIR[style][2]}
    # idle column: the frame whose feet are closest together (side views only have strides)
    idle = {}
    for r, d in enumerate(DIRS):
        spreads = []
        for c in range(4):
            cell = body[r * F:(r + 1) * F, c * F:(c + 1) * F, 3] > 0
            low = cell[BASELINE - 6:BASELINE + 1]
            cols = np.nonzero(low.any(0))[0]
            spreads.append(int(cols.max() - cols.min()) if len(cols) else 99)
        idle[d] = int(np.argmin(spreads))
    anchor_doc = {
        'frame': F, 'cols': 4, 'rows': 4, 'dirs': DIRS, 'baseline': BASELINE,
        'scale': {'body': 1 / BODY_FACTOR, 'hair': 1 / HAIR_FACTOR},
        'walkCycle': [0, 1, 2, 3], 'idleCol': idle,
        'body': anchors, 'hairFit': fits_all,
        'materials': ['none', 'fixed', 'skin', 'eye', 'brow', 'hair', 'under', 'outline', 'tie'],
        'parts': ['none', 'head', 'torso', 'arm', 'leg', 'foot', 'under'],
        'materialBaseLuma': {k: round(v, 1) for k, v in bbases.items()},
    }
    (OUT / 'anchors.json').write_text(json.dumps(anchor_doc, ensure_ascii=False, indent=1))
    JS_OUT.parent.mkdir(parents=True, exist_ok=True)
    JS_OUT.write_text(
        '// GENERATED by scripts/build-characters.py — do not edit by hand.\n'
        '// Palette entries: [r,g,b,material,shade*100]. Data: RLE pairs (count,value) base64.\n'
        f'export const CHARACTER_ATLAS = {json.dumps({"frame": F, "size": 4 * F, "dirs": DIRS, "idleCol": idle, "walkCycle": [0, 1, 2, 3], "baseline": BASELINE, "hairStyles": meta_hair, "layers": layers}, ensure_ascii=False)};\n')
    contact(body_q)
    print('body frames ok; hair fits:', json.dumps(fits_all))
    print('idle columns:', idle)
    print('wrote', OUT, JS_OUT)


def contact(body_q):
    """Composite every hairstyle over the body for visual QA (default colours)."""
    rows = []
    for style in HAIR:
        f = np.array(Image.open(OUT / f'hair_{style}_front_4x4.png').convert('RGBA'))
        b = np.array(Image.open(OUT / f'hair_{style}_back_4x4.png').convert('RGBA'))
        im = Image.new('RGBA', (4 * F, 4 * F), (74, 128, 92, 255))
        for layer in (b, body_q, f):
            im.alpha_composite(Image.fromarray(layer))
        rows.append(im)
    sheet = Image.new('RGBA', (len(rows) * 4 * F + (len(rows) - 1) * 8, 4 * F), (20, 40, 32, 255))
    for i, im in enumerate(rows):
        sheet.paste(im, (i * (4 * F + 8), 0))
    # frame grid
    g = np.array(sheet)
    for i in range(len(rows)):
        for k in range(1, 4):
            x = i * (4 * F + 8) + k * F
            g[:, x, :3] = (40, 70, 55)
            g[k * F, i * (4 * F + 8):i * (4 * F + 8) + 4 * F, :3] = (40, 70, 55)
    Image.fromarray(g).resize((sheet.width * 3, sheet.height * 3), Image.NEAREST).save(OUT / 'contact_sheet.png')


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Skeletal character rig: source_art/rig/*.png (magenta background) -> src/character/rigData.js

Each body part / hair layer / clothing piece is keyed out, sliced from its grid cell, resized to its TARGET BOX
(taken from the reference turnaround base_1_ref.png, so proportions follow the reference even when GPT drew a limb
too long) at the rig resolution (character = RIG_H px tall), then stored as palette + RLE with a material id and a
relative shade per colour, so skin / hair / eye / outfit colours can be changed at runtime (src/character/rig.js).

    python3 scripts/build-rig.py [--preview]
"""
import json, os, sys, base64
import numpy as np, cv2
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'source_art', 'rig')
RIG_H = 248  # character height (head top -> ground) in rig px; the runtime bakes 4 rig px -> 1 sprite px (62 px tall, drawn at 2 sprite px per world px)

# materials (must match src/character/rig.js)
M = dict(NONE=0, FIXED=1, SKIN=2, EYE=3, BROW=4, HAIR=5, TOP=6, BOTTOM=7, SHOES=8, OUTLINE=9, ACCENT=10, UNDER=11)

# Target boxes in units of character height H, measured on base_1_ref.png (front/back, side).
# (w, h) of the part as it appears assembled.
BOX = {
    'front': dict(head=(.362, .350), torso=(.214, .262), pelvis=(.236, .205), uarm=(.066, .200), farm=(.066, .185),
                  thigh=(.098, .235), shin=(.080, .135), foot=(.100, .075)),
    'side':  dict(head=(.318, .350), torso=(.172, .262), pelvis=(.160, .205), uarm=(.062, .200), farm=(.066, .185),
                  thigh=(.088, .235), shin=(.076, .135), foot=(.155, .072)),
}
BOX['back'] = dict(BOX['front'])
GRID_PARTS = [['head', 'torso', 'pelvis', 'uarm'], ['farm', 'thigh', 'shin', 'foot']]


def key(name):
    a = np.array(Image.open(os.path.join(SRC, name)).convert('RGB')).astype(np.int32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    bg = (r > 150) & (b > 150) & (g < 120) & (np.abs(r - b) < 90)
    m = (~bg).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    # magenta fringe: pixels next to the background that are pinkish get dropped
    edge = (m == 1) & (cv2.dilate((m == 0).astype(np.uint8), np.ones((3, 3), np.uint8)) == 1)
    pink = (r > 140) & (b > 110) & (g < r - 50)
    m[edge & pink] = 0
    return a.astype(np.uint8), m.astype(bool)


def cells(name, rows, cols):
    a, m = key(name)
    h, w = m.shape
    n, lab, st, cen = cv2.connectedComponentsWithStats(m.astype(np.uint8), connectivity=8)
    out = {}
    for i in range(1, n):
        if st[i, 4] < 400: continue
        c, r = int(cen[i][0] / (w / cols)), int(cen[i][1] / (h / rows))
        out[(r, c)] = out.get((r, c), np.zeros_like(m)) | (lab == i)
    res = {}
    for k, mm in out.items():
        ys, xs = np.nonzero(mm)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        rgba = np.zeros((y1 - y0, x1 - x0, 4), np.uint8)
        rgba[..., :3] = a[y0:y1, x0:x1]; rgba[..., 3] = np.where(mm[y0:y1, x0:x1], 255, 0)
        res[k] = rgba
    return res


def resize(rgba, tw, th):
    """Premultiplied area resize to (tw, th) rig px, binary alpha."""
    tw, th = max(2, int(round(tw))), max(2, int(round(th)))
    f = rgba.astype(np.float32) / 255
    pm = f.copy(); pm[..., :3] *= f[..., 3:4]
    r = cv2.resize(pm, (tw, th), interpolation=cv2.INTER_AREA)
    al = r[..., 3:4]
    rgb = np.where(al > 1e-4, r[..., :3] / np.maximum(al, 1e-4), 0)
    out = np.zeros((th, tw, 4), np.uint8)
    out[..., :3] = np.clip(rgb * 255 + .5, 0, 255).astype(np.uint8)
    out[..., 3] = np.where(al[..., 0] >= .5, 255, 0)
    return out


def lum(rgb): return rgb[..., 0] * .299 + rgb[..., 1] * .587 + rgb[..., 2] * .114


def classify(rgba, kind, view=None):
    """Material id per pixel. kind: body part name | 'hair' | garment ('top'|'bottom'|'seat'|'shoes')."""
    rgb = rgba[..., :3].astype(np.uint8)
    hsv = cv2.cvtColor(np.ascontiguousarray(rgb), cv2.COLOR_RGB2HSV).astype(np.int32)
    H, S, V = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    L = lum(rgb.astype(np.float32))
    op = rgba[..., 3] > 0
    mat = np.zeros(op.shape, np.uint8)
    outline = op & (L < 48)
    if kind == 'hair':
        mat[op] = M['HAIR']
    elif kind in ('top', 'bottom', 'shoes'):
        mat[op] = M[kind.upper()]
        if kind == 'top': mat[op & (S < 50) & (V > 150)] = M['FIXED']            # buttons
        if kind == 'bottom':                                                       # sash on the trouser seat
            red = op & (((H < 10) | (H > 165)) & (S > 90) & (V > 120))
            white = op & (S < 45) & (V > 185)
            mat[red | white] = M['ACCENT']
    else:
        skin = op & (H >= 3) & (H <= 26) & (S >= 45) & (V >= 110)
        mat[op] = M['FIXED']
        mat[skin] = M['SKIN']
        if kind == 'torso': mat[op & (S < 55) & (V > 170)] = M['UNDER']            # undershirt
        if kind in ('pelvis', 'thigh'): mat[op & (S < 40) & (V > 40) & (V <= 170)] = M['UNDER']  # shorts
        if kind == 'head' and view != 'back':
            dark = (op & ~skin & (L >= 48) & (L < 150) & (S > 40)).astype(np.uint8)
            n, lab, st, _ = cv2.connectedComponentsWithStats(dark, connectivity=8)
            hh = rgba.shape[0]
            for i in range(1, n):
                x, y, w, h, ar = st[i]
                if ar < 3: continue
                mat[lab == i] = M['BROW'] if h < hh * .05 and w > h * 1.6 else M['EYE']
    mat[outline] = M['OUTLINE']
    mat[~op] = 0
    return mat


def encode(rgba, mat):
    """palette entries [r,g,b,mat,shade100]; shade relative to the median luminance of that material in the part."""
    op = rgba[..., 3] > 0
    L = lum(rgba[..., :3].astype(np.float32))
    base = {}
    for m in np.unique(mat[op]): base[int(m)] = max(8.0, float(np.median(L[op & (mat == m)])))
    pal, index, idx = [[0, 0, 0, 0, 0]], {}, np.zeros(op.shape, np.uint8)
    for y, x in zip(*np.nonzero(op)):
        r, g, b = (int(v) for v in rgba[y, x, :3]); m = int(mat[y, x])
        q = (r >> 2, g >> 2, b >> 2, m)
        if q not in index:
            if len(pal) >= 255: q = min(index, key=lambda k: sum(abs(k[i] - q[i]) for i in range(3)) + (0 if k[3] == m else 999))
            else:
                index[q] = len(pal); pal.append([r, g, b, m, int(round(L[y, x] / base[m] * 100))])
        idx[y, x] = index[q]
    flat = idx.ravel(); runs = bytearray(); i = 0
    while i < len(flat):
        j = i
        while j < len(flat) and flat[j] == flat[i] and j - i < 255: j += 1
        runs += bytes((j - i, int(flat[i]))); i = j
    return dict(w=int(op.shape[1]), h=int(op.shape[0]), palette=pal, data=base64.b64encode(bytes(runs)).decode())


parts, preview = {}, []
def add(name, rgba, kind, view=None):
    mat = classify(rgba, kind, view)
    parts[name] = encode(rgba, mat)
    preview.append((name, rgba, mat))


# ---- body
SHEETS = {'front': 'base_2_front.png', 'side': 'base_3_side.png', 'back': 'base_4_back.png'}
arms = cells('base_5_arms.png', 3, 2)
ARM_ROW = {'front': 0, 'side': 1, 'back': 2}
for view, f in SHEETS.items():
    cs = cells(f, 2, 4)
    for r, row in enumerate(GRID_PARTS):
        for c, p in enumerate(row):
            src = cs[(r, c)]
            if p in ('uarm', 'farm'): src = arms[(ARM_ROW[view], 0 if p == 'uarm' else 1)]  # fixed arm sheet
            w, h = BOX[view][p]
            add(f'{view}_{p}', resize(src, w * RIG_H, h * RIG_H), p, view)

# ---- hair (rows front/side/back, columns back-layer/front-layer); width relative to head width
for hair in [f[5:-4] for f in sorted(os.listdir(SRC)) if f.startswith('hair_')]:
    cs = cells(f'hair_{hair}.png', 3, 2)
    for r, view in enumerate(['front', 'side', 'back']):
        hw = BOX[view]['head'][0] * RIG_H * (1.02 if view != 'side' else 1.1)
        for c, layer in enumerate(['back', 'front']):
            src = cs[(r, c)]; s = hw / src.shape[1] * (1 if c == 0 else src.shape[1] / max(cs[(r, 0)].shape[1], 1))
            add(f'hair_{hair}_{view}_{layer}', resize(src, src.shape[1] * s, src.shape[0] * s), 'hair')

# ---- outfits (rows front/side/back; 7 pieces) fitted to the matching body part box
PIECES = [('shirt', 'torso', 'top', 1.12, .92), ('usleeve', 'uarm', 'top', 1.28, .72), ('lsleeve', 'farm', 'top', 1.22, None),
          ('seat', 'pelvis', 'bottom', 1.06, .62), ('pthigh', 'thigh', 'bottom', 1.18, 1.0), ('pshin', 'shin', 'bottom', 1.18, .86),
          ('shoe', 'foot', 'shoes', 1.1, 1.0)]
for outfit in [f[7:-4] for f in sorted(os.listdir(SRC)) if f.startswith('outfit_') and 'REJECTED' not in f]:
    cs = cells(f'outfit_{outfit}.png', 3, 7)
    for r, view in enumerate(['front', 'side', 'back']):
        for c, (piece, body, kind, kw, kh) in enumerate(PIECES):
            src = cs[(r, c)]; bw, bh = BOX[view][body]
            tw = bw * kw * RIG_H
            th = bh * kh * RIG_H if kh else src.shape[0] * tw / src.shape[1]
            add(f'outfit_{outfit}_{view}_{piece}', resize(src, tw, th), kind)

meta = dict(rigH=RIG_H, box=BOX, materials=M,
            hairs=sorted({k.split('_')[1] for k in parts if k.startswith('hair_')}),
            outfits=sorted({k.split('_')[1] for k in parts if k.startswith('outfit_')}))
with open(os.path.join(ROOT, 'src', 'character', 'rigData.js'), 'w') as f:
    f.write('// GENERATED by scripts/build-rig.py from source_art/rig/*.png — do not edit by hand.\n')
    f.write('export const RIG_META = ' + json.dumps(meta, separators=(',', ':')) + ';\n')
    f.write('export const RIG_PARTS = ' + json.dumps(parts, separators=(',', ':')) + ';\n')
size = os.path.getsize(os.path.join(ROOT, 'src', 'character', 'rigData.js'))
print(f'{len(parts)} parts -> src/character/rigData.js ({size / 1024:.0f} KiB)')

if '--preview' in sys.argv:
    MC = {0: (0, 0, 0), 1: (150, 150, 150), 2: (240, 180, 130), 3: (40, 120, 255), 4: (255, 0, 255), 5: (90, 60, 30), 6: (250, 250, 210),
          7: (60, 160, 60), 8: (150, 90, 40), 9: (0, 0, 0), 10: (255, 40, 40), 11: (120, 220, 255)}
    pad, cw = 4, 1200; x = y = rowh = 0; placed = []
    for name, im, mat in preview:
        h, w = im.shape[:2]
        if x + w * 2 + pad > cw: x = 0; y += rowh + pad; rowh = 0
        placed.append((x, y, im, mat)); x += w * 2 + pad * 2; rowh = max(rowh, h)
    sheet = np.full((y + rowh, cw, 3), 70, np.uint8)
    for x, y, im, mat in placed:
        h, w = im.shape[:2]; a = im[..., 3:4] > 0
        sheet[y:y + h, x:x + w] = np.where(a, im[..., :3], sheet[y:y + h, x:x + w])
        mc = np.array([MC[int(v)] for v in mat.ravel()], np.uint8).reshape(h, w, 3)
        sheet[y:y + h, x + w + pad:x + 2 * w + pad] = np.where(a, mc, sheet[y:y + h, x + w + pad:x + 2 * w + pad])
    Image.fromarray(sheet).save(os.path.join(ROOT, 'qa', 'rig_parts_preview.png')); print('preview -> qa/rig_parts_preview.png')

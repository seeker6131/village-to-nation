#!/usr/bin/env python3
"""v0.16 square tilesets: source_art/tiles/*.png (GPT 4x4 sheets) -> assets/tiles/*.webp + src/tileManifest.js

Each sheet is a 4x4 grid. Edge sheets (dirt, roads, farmland, water banks) are NOT trusted to be in the exact
order asked for: every cell is classified by looking at its 4 corners (terrain or grass/land), so a cell that GPT
put in the wrong slot still lands on the right mask. Masks use the dual-grid convention:
    bit 8 = top-left corner is terrain, 4 = top-right, 2 = bottom-left, 1 = bottom-right.
The two diagonal masks (0b1001, 0b0110) are composed from quadrants of the others.

Overlay sheets get their grass keyed out (transparent) so the grass base drawn underneath shows through; the water
bank sheet gets its WATER keyed out instead, so the animated water drawn under the ground shows through.

Output strip per terrain: index 0..15 = mask tiles (0 = empty), 16.. = extra full-terrain (mask 15) variants.
Tile size: 64 px stored = 32 world px (2x2 game tiles), the same 2x density as every other sprite.
"""
import json, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'source_art', 'tiles')
OUT = os.path.join(ROOT, 'assets', 'tiles')
TS = 64          # stored px per tile
INSET = 6       # px trimmed off every cell at source scale (GPT grid lines + slightly uneven rows)

def cells(path):
    im = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    H, W = im.shape[:2]
    out = []
    for r in range(4):
        for c in range(4):
            y0, y1 = round(r * H / 4) + INSET, round((r + 1) * H / 4) - INSET
            x0, x1 = round(c * W / 4) + INSET, round((c + 1) * W / 4) - INSET
            out.append(im[y0:y1, x0:x1])
    return out

def is_grass(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return (g - r > 12) & (g - b > 40)

def is_water(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return (b - r > 40) & (b - g > 10)

def shrink(cell, keymask=None):
    """Nearest-centre downscale keeps hard pixel edges; alpha comes from the full-res key, box-averaged."""
    h, w = cell.shape[:2]
    ys = ((np.arange(TS) + .5) * h / TS).astype(int)
    xs = ((np.arange(TS) + .5) * w / TS).astype(int)
    rgb = cell[ys][:, xs]
    alpha = np.full((TS, TS), 255, np.uint8)
    if keymask is not None:
        k = Image.fromarray((keymask * 255).astype(np.uint8)).resize((TS, TS), Image.BOX)
        alpha = np.where(np.asarray(k) > 127, 0, 255).astype(np.uint8)
        # drop lonely leftover specks (a grass blade's highlight etc.)
        a = alpha > 0
        p = np.pad(a, 1)
        n = sum(p[1 + dy:TS + 1 + dy, 1 + dx:TS + 1 + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx)
        alpha[a & (n <= 1)] = 0
        # 1-px stray lines left from GPT's grid (opaque pixels with keyed pixels directly above+below or left+right)
        for _ in range(2):
            a = alpha > 0; p = np.pad(a, 1)
            up, dn, lf, rt = p[:-2, 1:-1], p[2:, 1:-1], p[1:-1, :-2], p[1:-1, 2:]
            alpha[a & ~up & ~dn] = 0; alpha[a & ~lf & ~rt] = 0
    return np.dstack([rgb.clip(0, 255).astype(np.uint8), alpha])

def corner_mask(cell, terrain_fn):
    h, w = cell.shape[:2]; q = int(min(h, w) * .16)
    bits = 0
    for bit, (y, x) in zip((8, 4, 2, 1), ((0, 0), (0, w - q), (h - q, 0), (h - q, w - q))):
        if terrain_fn(cell[y:y + q, x:x + q]).mean() > .5: bits |= bit
    return bits

QUAD = {8: (0, 0), 4: (0, 1), 2: (1, 0), 1: (1, 1)}
NEIGH = {8: (4, 2), 4: (8, 1), 2: (8, 1), 1: (4, 2)}
def compose(tiles, mask):
    t = np.zeros((TS, TS, 4), np.uint8); hq = TS // 2
    for c, (qy, qx) in QUAD.items():
        a, b = NEIGH[c]
        m = (mask & (c | a | b))
        if (mask & a) or (mask & b): m |= (15 ^ (c | a | b))   # opposite corner = OR of the neighbours
        src = tiles.get(m)
        if src is None: return None
        t[qy * hq:(qy + 1) * hq, qx * hq:(qx + 1) * hq] = src[qy * hq:(qy + 1) * hq, qx * hq:(qx + 1) * hq]
    return t

# GPT gets the 3x3 block (outer corners, edges, centre) right on every sheet, so those are taken by position.
# The 4th column (inner corners) is unreliable: wrong order and a grass patch that is too big. Each one is
# re-identified by its grass corner and the patch is shifted so its border sits where the edge tiles put it.
POS = {0: 1, 1: 3, 2: 2, 4: 5, 5: 15, 6: 10, 8: 4, 9: 12, 10: 8}
CORNER_YX = {8: (0, 0), 4: (0, 1), 2: (1, 0), 1: (1, 1)}

def band(nt, side):
    """Width (px) of the non-terrain band along one side of an edge tile, measured over its middle columns/rows."""
    a = {'top': nt, 'bottom': nt[::-1], 'left': nt.T, 'right': nt.T[::-1]}[side]
    mid = a[:, TS // 4: 3 * TS // 4]
    first = np.argmin(mid, axis=0)          # first terrain pixel from that side
    first[mid.all(axis=0)] = TS
    return float(np.median(first))

def fix_inner(tile, nt, corner, e_h, e_v, base):
    """Move the corner patch of an inner-corner tile so its borders are e_h (horizontal band) / e_v from the edges."""
    cy, cx = CORNER_YX[corner]
    rows = nt[:TS // 8] if cy == 0 else nt[-TS // 8:]
    cols = nt[:, :TS // 8] if cx == 0 else nt[:, -TS // 8:]
    gx = float(np.median((rows if cx == 0 else rows[:, ::-1]).argmin(axis=1)))   # patch width along that row band
    gy = float(np.median((cols if cy == 0 else cols[::-1]).argmin(axis=0)))
    dx = round(gx - e_v) * (1 if cx else -1)   # push toward the corner when the patch is too big
    dy = round(gy - e_h) * (1 if cy else -1)
    out = base.copy(); h = TS // 2
    for y in range(cy * h, cy * h + h):
        for x in range(cx * h, cx * h + h):
            sy = min(TS - 1, max(0, y - dy)); sx = min(TS - 1, max(0, x - dx))
            out[y, x] = tile[sy, sx]
    return out

def symmetric_from_top_left(tiles, kt, key):
    """tile_water_edges.png: GPT drew the pond's left/top banks on the grid but let the right/bottom banks spill into the
    next cells (the right-edge tile came out as open water -> a straight cut in game). Rebuild every side from the
    good top-left corner / top edge / left edge by mirroring, and every inner corner from the two edges it joins."""
    fx = lambda t: t[:, ::-1].copy(); fy = lambda t: t[::-1].copy()
    c1, e3, e5 = kt[0], kt[1], kt[4]
    tiles.update({1: c1, 2: fx(c1), 4: fy(c1), 8: fy(fx(c1)), 3: e3, 12: fy(e3), 5: e5, 10: fx(e5)})
    h = TS // 2
    land = (lambda t: t[..., 3] > 0) if key == 'water' else (lambda t: t[..., 3] == 0)
    def combine(a, b):
        out = a.copy()
        out[~land(b)] = b[~land(b)]                       # open in either -> open
        ga = is_grass(a[..., :3].astype(np.float32)) & land(a)
        bb = land(b) & ~is_grass(b[..., :3].astype(np.float32))
        out[ga & bb] = b[ga & bb]                          # a bank pixel of either edge wins over grass
        return out
    for g in (8, 4, 2, 1):                                 # g = the one grass corner
        gy, gx = CORNER_YX[g]
        H = tiles[12] if gy == 1 else tiles[3]             # edge with the water on the other row
        V = tiles[10] if gx == 1 else tiles[5]             # edge with the water on the other column
        t = H.copy()
        q = lambda T, y, x: T[y * h:(y + 1) * h, x * h:(x + 1) * h]
        t[gy * h:(gy + 1) * h, gx * h:(gx + 1) * h] = combine(q(H, gy, gx), q(V, gy, gx))
        t[gy * h:(gy + 1) * h, (1 - gx) * h:(2 - gx) * h] = q(V, gy, 1 - gx)   # same row: the vertical bank
        t[(1 - gy) * h:(2 - gy) * h, gx * h:(gx + 1) * h] = q(H, 1 - gy, gx)   # same column: the horizontal bank
        # the open-water quadrant: only where BOTH edges still have bank (the joint near the centre), water elsewhere
        a, b = q(H, 1 - gy, 1 - gx), q(V, 1 - gy, 1 - gx); o = a.copy(); o[~(land(a) & land(b))] = 0
        t[(1 - gy) * h:(2 - gy) * h, (1 - gx) * h:(2 - gx) * h] = o
        tiles[15 ^ g] = t

def edge_sheet(name, src, key='grass', extra=(12, 13, 14), mirror=False):
    keyfn = is_grass if key == 'grass' else is_water
    terrain = (lambda a: ~is_grass(a)) if key == 'grass' else is_water
    cl = cells(os.path.join(SRC, src))
    kt = [shrink(c, keyfn(c)) for c in cl]
    nont = [(t[..., 3] == 0) if key == 'grass' else (t[..., 3] > 0) for t in kt]
    tiles = {m: kt[i] for i, m in POS.items()}
    centre = kt[5] if key == 'water' else shrink(cl[5])
    tiles[15] = centre
    centers = [shrink(cl[i], keyfn(cl[i]) if key == 'water' else None) for i in extra]
    e = {s: band(nont[i], s) for i, s in ((1, 'top'), (9, 'bottom'), (4, 'left'), (6, 'right'))}
    found = {}
    for i in (3, 7, 11, 15):
        q = int(TS * .2)
        frac = {c: nont[i][(0 if yx[0] == 0 else TS - q):(q if yx[0] == 0 else TS), (0 if yx[1] == 0 else TS - q):(q if yx[1] == 0 else TS)].mean() for c, yx in CORNER_YX.items()}
        c = max(frac, key=frac.get)
        if c in found: continue
        cy, cx = CORNER_YX[c]
        found[c] = fix_inner(kt[i], nont[i], c, e['top' if cy == 0 else 'bottom'], e['left' if cx == 0 else 'right'], centre)
    # missing inner corners: mirror one we have
    flips = {8: [(4, 1), (2, 0)], 4: [(8, 1), (1, 0)], 2: [(1, 1), (8, 0)], 1: [(2, 1), (4, 0)]}
    for c in (8, 4, 2, 1):
        if c in found: continue
        for o, ax in flips[c]:
            if o in found: found[c] = found[o][:, ::-1].copy() if ax == 1 else found[o][::-1].copy(); break
    for c, t in found.items(): tiles[15 ^ c] = t
    if mirror: symmetric_from_top_left(tiles, kt, key)
    for m in (6, 9): tiles[m] = compose(tiles, m)
    # a side whose two corners are both grass must be pure grass: clear the outer 4 px there (slivers of the next GPT row)
    B = 4
    for m, t in tiles.items():
        if t is None or m == 15 or key == 'water': continue
        t = t.copy()
        if not (m & 8 or m & 4): t[:B, :, 3] = 0
        if not (m & 2 or m & 1): t[-B:, :, 3] = 0
        if not (m & 8 or m & 2): t[:, :B, 3] = 0
        if not (m & 4 or m & 1): t[:, -B:, 3] = 0
        tiles[m] = t
    strip = np.zeros((TS, TS * (16 + len(centers)), 4), np.uint8)
    for m, t in tiles.items():
        if t is not None: strip[:, m * TS:(m + 1) * TS] = t
    for j, t in enumerate(centers): strip[:, (16 + j) * TS:(17 + j) * TS] = t
    if key == 'water':
        # bank: also key its grass so the shared grass base shows (no lighter squares around ponds), and export the
        # water area as a mask the renderer punches out of the ground (the animated water is drawn underneath)
        water = strip[..., 3] == 0; water[:, :TS] = False
        mask = np.zeros_like(strip); mask[water] = (255, 255, 255, 255)
        save(name + 'mask', mask)
        strip[is_grass(strip[..., :3].astype(np.float32))] = 0
    save(name, strip)
    print(f'{name:10s} bands {dict((k, round(v)) for k, v in e.items())} inner corners found {sorted(found)} missing {[m for m in range(1, 16) if tiles.get(m) is None]}')
    return {'kind': 'edge', 'extra': len(centers)}

def plain_strip(name, tiles):
    strip = np.concatenate(tiles, axis=1); save(name, strip)
    return {'kind': 'plain', 'n': len(tiles)}

def save(name, arr):
    os.makedirs(OUT, exist_ok=True)
    Image.fromarray(arr, 'RGBA').save(os.path.join(OUT, name + '.webp'), 'WEBP', lossless=True, method=4)
    if '--preview' in sys.argv:
        os.makedirs(os.path.join(ROOT, 'qa', 'tiles'), exist_ok=True)
        Image.fromarray(arr, 'RGBA').resize((arr.shape[1] * 2, arr.shape[0] * 2), Image.NEAREST).save(os.path.join(ROOT, 'qa', 'tiles', name + '.png'))

def main():
    man = {}
    g = [shrink(c) for c in cells(os.path.join(SRC, 'tile_grass.png'))]
    man['grass'] = plain_strip('grass', g)
    # forest floor: the same grass, darker and a little cooler
    # tile_dirt.png came back without a clean grid (its 3x3 block is one merged picture) -> natural dirt uses road1
    # v0.23 one art style (docs/ART_DIRECTION_TH.md): camp = dirt trail, village = residential lane, district+ = main road
    for name, src, extra in [('farmland', 'tile_farmland.png', (12, 13, 14)),
                      ('road1', 'tile_dirt_trail.png', (12, 13, 14)), ('road2', 'tile_lane.png', (12, 13, 14)),
                      ('road3', 'tile_road_main.png', ()), ('road4', 'tile_road_main.png', ()), ('road5', 'tile_road_main.png', ())]:
        man[name] = edge_sheet(name, src, extra=extra)
    man['bank'] = edge_sheet('bank', 'tile_water_edges.png', key='water', extra=(12, 13), mirror=True)
    man['beach'] = edge_sheet('beach', 'tile_beach.png', key='water', extra=(12, 13))
    # paving rows: stepping stones / concrete / brick / garden soil -> plaza1 village square (stones), plaza2 yards+city (concrete),
    # plaza3-4 town squares (brick); soil kept for flower beds
    p = [shrink(c) for c in cells(os.path.join(SRC, 'tile_paving.png'))]
    for name, r in [('plaza1', 2), ('plaza2', 1), ('plaza3', 2), ('plaza4', 2), ('soil', 3), ('stones', 0)]: man[name] = plain_strip(name, p[r * 4:r * 4 + 4])
    def seamless(t, b=6):  # GPT water tiles don't wrap: blend each border into the opposite one so the grid disappears
        t = t.astype(np.float32).copy()
        for k in range(b):
            a = (k + 1) / (b + 1) * .5
            for ax in (0, 1):
                lo = [slice(None)] * 2; hi = [slice(None)] * 2; lo[ax] = k; hi[ax] = -1 - k
                L, H = t[tuple(lo)].copy(), t[tuple(hi)].copy()
                t[tuple(lo)] = L * (1 - (.5 - a)) + H * (.5 - a); t[tuple(hi)] = H * (1 - (.5 - a)) + L * (.5 - a)
        return t.clip(0, 255).astype(np.uint8)
    w = [seamless(shrink(c)) for c in cells(os.path.join(SRC, 'tile_water_anim.png'))]
    # rows = frames, columns = type: strip = open water f0..f3, stream f0..f3
    man['water'] = plain_strip('water', [w[f * 4 + 0] for f in range(4)] + [w[f * 4 + 1] for f in range(4)])
    with open(os.path.join(ROOT, 'src', 'tileManifest.js'), 'w') as f:
        f.write('// GENERATED by scripts/ingest-tiles.py — square tilesets (assets/tiles/<name>.webp, 64 px stored = 32 world px per tile)\n')
        f.write('export const TILESETS = ' + json.dumps(man) + ';\n')

if __name__ == '__main__':
    main()

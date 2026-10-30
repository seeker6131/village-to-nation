#!/usr/bin/env python3
"""Ingest AI-generated art sheets (source_art/v010/*.png) into game sprites (assets/v10/*.webp).

What it does, per sheet:
  1. Real alpha: sheets with a painted checkerboard "transparency" get it keyed out (flood fill from the border).
  2. Fringe cleanup: the soft glow / red halo left by background removal is cut (binary alpha, 2 px erode,
     reddish boundary pixels removed, tiny specks dropped).
  3. Slicing: connected parts are grouped into the sheet's grid cells by centroid (sheets are not pixel-exact grids).
  4. Uniform scale per sheet (so the 4 construction stages / tree+stump pairs line up), box-filtered downscale,
     binary alpha again, then saved as lossless WebP at 2x world pixels (the renderer draws them at half size).
Ground tiles are turned into seamless textures covering 4x4 tiles, stored at 2x (128x128) like the sprites.
Writes assets/v10/manifest.json (name -> [w, h] in world px) used by tests and the renderer.

    python3 scripts/ingest-art.py            # all
    python3 scripts/ingest-art.py --preview  # also writes qa/art_ingest_preview.png contact sheet
"""
import json, glob, re, sys, os
import numpy as np, cv2
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'source_art', 'v010')
OUT = os.environ.get('V2N_ART_OUT') or os.path.join(ROOT, 'assets', 'v10')
OUTLINE = int(os.environ.get('V2N_OUTLINE', '2'))  # stored px of dark 'sel-out' stroke around sprites (2 = 1 world px), 0 = off
SS = 2  # stored pixels per world pixel
os.makedirs(OUT, exist_ok=True)
manifest = {}
preview = []


def load(name):
    path = os.path.join(SRC, name)
    if not os.path.exists(path): path = os.path.join(ROOT, 'source_art', 'v012', name)
    if not os.path.exists(path): path = os.path.join(ROOT, 'source_art', 'v016', name)
    if not os.path.exists(path): path = os.path.join(ROOT, 'source_art', 'v023', name)
    im = np.array(Image.open(path).convert('RGBA'))
    if (im[..., 3] < 10).mean() < 0.01:  # opaque background: magenta key (v0.12 sheets) or painted checkerboard
        r, g, b = [im[..., i].astype(int) for i in range(3)]
        mag = (r > 150) & (b > 150) & (g < 120) & (np.abs(r - b) < 90)
        if mag[:8].mean() > .8:
            im = im.copy(); im[..., 3] = np.where(mag, 0, 255)
            # magenta fringe: pinkish pixels touching the background
            edge = (~mag) & (cv2.dilate(mag.astype(np.uint8), np.ones((3, 3), np.uint8)) == 1)
            pink = (r > 140) & (b > 110) & (g < r - 50)
            im[edge & pink, 3] = 0
        else:
            im = key_checker(im)
    return im


def key_checker(im):
    rgb = im[..., :3].astype(int)
    sat = rgb.max(-1) - rgb.min(-1)
    bg_like = ((sat < 12) & (rgb.min(-1) >= 205)).astype(np.uint8)
    h, w = bg_like.shape
    n, lab = cv2.connectedComponents(bg_like, connectivity=4)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    out = im.copy()
    out[..., 3] = np.where(bg, 0, 255).astype(np.uint8)
    return out


def clean_mask(im):
    a = im[..., 3]
    m = (a >= 200).astype(np.uint8)
    k = np.ones((3, 3), np.uint8)
    core = cv2.erode(m, k, iterations=2)
    # boundary band: remove reddish / glowing halo pixels
    band = (m == 1) & (cv2.erode(m, k, iterations=5) == 0)
    r, g, b = [im[..., i].astype(int) for i in range(3)]
    halo = band & (((r - g > 55) & (r - b > 55)) | ((b - r > 80) & (b - g > 10) & (b > 200)))
    core[halo] = 0
    # drop specks
    n, lab, stats, _ = cv2.connectedComponentsWithStats(core, connectivity=8)
    keep = np.zeros(n, bool)
    keep[1:] = stats[1:, cv2.CC_STAT_AREA] >= 60
    return keep[lab]


def cells(im, rows, cols, merge=6, bounds=None, grid=False):
    """Return dict (r,c) -> boolean mask of the parts whose centroid falls in that grid cell.
    grid=True cuts plain rectangles instead (for clean 2x2 building sheets where dilation would merge cells)."""
    m = clean_mask(im)
    h, w = m.shape
    x0, y0, x1, y1 = bounds or (0, 0, w, h)
    if grid:
        out = {}
        for r in range(rows):
            for c in range(cols):
                cm = np.zeros_like(m)
                ya, yb, xa, xb = int(y0 + (y1 - y0) * r / rows), int(y0 + (y1 - y0) * (r + 1) / rows), int(x0 + (x1 - x0) * c / cols), int(x0 + (x1 - x0) * (c + 1) / cols)
                cm[ya:yb, xa:xb] = m[ya:yb, xa:xb]
                n, lab, st, _ = cv2.connectedComponentsWithStats(cm.astype(np.uint8), connectivity=8)
                if n > 1:  # keep the main body + parts at least 3% of it (drops stray bits of neighbours)
                    big = st[1:, cv2.CC_STAT_AREA].max()
                    keep = np.zeros(n, bool); keep[1:] = st[1:, cv2.CC_STAT_AREA] >= big * 0.03
                    out[(r, c)] = keep[lab]
        return out, m
    big = cv2.dilate(m.astype(np.uint8), np.ones((3, 3), np.uint8), iterations=merge)
    n, lab, stats, cent = cv2.connectedComponentsWithStats(big, connectivity=8)
    out = {}
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] < 900: continue
        cx, cy = cent[i]
        c = int((cx - x0) / ((x1 - x0) / cols)); r = int((cy - y0) / ((y1 - y0) / rows))
        if not (0 <= r < rows and 0 <= c < cols): continue
        part = (lab == i) & m
        out[(r, c)] = out.get((r, c), np.zeros_like(m)) | part
    return out, m


def crop(im, mask):
    ys, xs = np.nonzero(mask)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    c = im[y0:y1, x0:x1].copy()
    c[..., 3] = np.where(mask[y0:y1, x0:x1], 255, 0)
    return c


def downscale(rgba, scale):
    """Premultiplied box downscale to `scale` (target px per source px), binary alpha."""
    h, w = rgba.shape[:2]
    tw, th = max(1, round(w * scale)), max(1, round(h * scale))
    f = rgba.astype(np.float32) / 255
    pm = f.copy(); pm[..., :3] *= f[..., 3:4]
    r = cv2.resize(pm, (tw, th), interpolation=cv2.INTER_AREA)
    a = r[..., 3:4]
    rgb = np.where(a > 1e-4, r[..., :3] / np.maximum(a, 1e-4), 0)
    # mild sharpen keeps the pixel-art read after the area filter
    blur = cv2.GaussianBlur(rgb, (0, 0), 0.8)
    rgb = np.clip(rgb + (rgb - blur) * 0.45, 0, 1)
    out = np.zeros((th, tw, 4), np.uint8)
    out[..., :3] = (rgb * 255 + .5).astype(np.uint8)
    out[..., 3] = np.where(a[..., 0] >= 0.5, 255, 0)
    return out


def outline(rgba, px=OUTLINE):
    """Selective outline: a ring just outside the sprite, coloured as a deep shade of the pixels it touches
    (reads crisper than flat black and keeps the warm palette)."""
    if px <= 0: return rgba
    a = (rgba[..., 3] > 0).astype(np.uint8)
    pad = px + 1
    rgba = np.pad(rgba, ((pad, pad), (pad, pad), (0, 0)))
    a = np.pad(a, pad)
    ring = (cv2.dilate(a, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * px + 1, 2 * px + 1))) == 1) & (a == 0)
    col = rgba[..., :3].astype(np.float32) * a[..., None]
    k = np.ones((2 * px + 1, 2 * px + 1), np.float32)
    sumc = cv2.filter2D(col, -1, k, borderType=cv2.BORDER_CONSTANT); cnt = cv2.filter2D(a.astype(np.float32), -1, k, borderType=cv2.BORDER_CONSTANT)
    shade = sumc / np.maximum(cnt, 1)[..., None]
    lum = shade.mean(-1, keepdims=True)
    dark = np.clip((shade * 0.6 + lum * 0.4) * 0.28, 0, 255)  # deep, slightly desaturated shade
    out = rgba.copy()
    out[ring, :3] = dark[ring].astype(np.uint8); out[ring, 3] = 255
    ys, xs = np.nonzero(out[..., 3]); return out[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def save(name, rgba):
    Image.fromarray(rgba, 'RGBA').save(os.path.join(OUT, name + '.webp'), lossless=False, quality=90, alpha_quality=100, method=4)
    manifest[name] = [round(rgba.shape[1] / SS, 1), round(rgba.shape[0] / SS, 1)]  # includes the outline
    preview.append((name, rgba))


# ------------------------------------------------------------------ sheets of sprites
def sprite_sheet(file, rows, cols, names, ref_cell, ref_world_w, merge=6, bounds=None, grid=False, widths=None, groups=None):
    """names[r][c] -> output name (None = skip). One scale for the whole sheet: ref_cell's width -> ref_world_w."""
    im = load(file)
    cs, _ = cells(im, rows, cols, merge, bounds, grid)
    missing = [(r, c) for r in range(rows) for c in range(cols) if names[r][c] and (r, c) not in cs]
    if missing: raise SystemExit(f'{file}: no art found in cells {missing}')
    ref = crop(im, cs[ref_cell])
    scale = ref_world_w * SS / ref.shape[1]
    # per-sprite target widths (GPT draws every item at cell size) / groups sharing one scale (animation frames)
    gscale = {}
    for members, ref, w in (groups or []):
        rr, cc = next((r, c) for r in range(rows) for c in range(cols) if names[r][c] == ref)
        g = w * SS / crop(im, cs[(rr, cc)]).shape[1]
        for m in members: gscale[m] = g
    for r in range(rows):
        for c in range(cols):
            n = names[r][c]
            if not n: continue
            src = crop(im, cs[(r, c)])
            sc = gscale.get(n) or (widths[n] * SS / src.shape[1] if widths and n in widths else scale)
            save(n, outline(downscale(src, sc)))


STAGES = ['s0', 's1', 's2', 's3']  # plot, frame, roofing, finished
# finished-building widths in world px: every building type has its own size (house < leader < market < hall)
BUILD_W = {'house': 128, 'leader': 144, 'market': 168, 'hall': 200}
for kind, eras in [('house', 5), ('leader', 4), ('market', 5), ('hall', 5)]:
    for e in range(1, eras + 1):
        sprite_sheet(f'{kind}_e{e}.png', 2, 2, [[f'{kind}_e{e}_s0', f'{kind}_e{e}_s1'], [f'{kind}_e{e}_s2', f'{kind}_e{e}_s3']], (1, 1), BUILD_W[kind], grid=True)

# villager houses in 3 sizes, pre-scaled so they are drawn at 1:1 (crisp): s/m = villager house design, l = big teak house
COT = {'s': ('house', 5, 64), 'm': ('house', 5, 78), 'l': ('leader', 4, 88)}
for size, (kind, eras, width) in COT.items():
    for e in range(1, eras + 1):
        sprite_sheet(f'{kind}_e{e}.png', 2, 2, [[f'cot{size}_e{e}_s0', f'cot{size}_e{e}_s1'], [f'cot{size}_e{e}_s2', f'cot{size}_e{e}_s3']], (1, 1), width, grid=True)

# v0.16 villager houses: 5 eras (บุกเบิก หมู่บ้าน อำเภอ จังหวัด ประเทศ) x sizes, each 4 construction stages
HOUSE_SETS = {1: ('pioneer', ['small', 'medium', 'shop']), 2: ('village', ['small', 'medium', 'large', 'shop']), 3: ('district', ['small', 'medium', 'large', 'shop']),
              4: ('province', ['small', 'shop']), 5: ('nation', ['small', 'medium', 'large', 'shop'])}
HOUSE_W = {'small': 58, 'medium': 70, 'large': 84, 'shop': 50}
for era, (nm, sizes) in HOUSE_SETS.items():
    for sz in sizes:
        sprite_sheet(f'h{era}_{nm}_{sz}.png', 2, 2, [[f'hs{era}_{sz}_s0', f'hs{era}_{sz}_s1'], [f'hs{era}_{sz}_s2', f'hs{era}_{sz}_s3']], (1, 1), HOUSE_W[sz], grid=True)

FRUIT = ['mango', 'banana', 'coconut', 'raintree', 'bamboo', 'tamarind']
FOREST = ['broadleaf', 'teak', 'pine', 'rubber', 'goldenshower', 'pinkshower']
sprite_sheet('trees_fruit.png', 2, 6, [['tree_' + n for n in FRUIT], ['stump_' + n for n in FRUIT]], (0, 3), 58)
sprite_sheet('trees_forest.png', 2, 6, [['tree_' + n for n in FOREST], ['stump_' + n for n in FOREST]], (0, 0), 46)
ROCK = ['stone', 'mossy', 'copper', 'crystal']
sprite_sheet('rocks.png', 3, 4, [[f'rock_{n}_0' for n in ROCK], [f'rock_{n}_1' for n in ROCK], [f'rock_{n}_2' for n in ROCK]], (0, 0), 26)
PLANTS = [['reed_white', 'reed_gold', 'reed_pink', 'tuft_a', 'tuft_b', 'clover'],
          ['cattail', 'pampas', 'fern_a', 'fern_b', 'shrub_a', 'shrub_b'],
          ['shrub_c', 'hibiscus', 'flowers_pink', 'lotus_pink', 'lotus_white', 'flowers_white'],
          ['flowers_yellow', 'flowers_rose', 'flowers_violet', 'sunflower', 'marigold', 'orchid_log']]
sprite_sheet('plants.png', 4, 6, [['pl_' + n for n in row] for row in PLANTS], (0, 0), 17)
CROPS = ['rice', 'cabbage', 'chili', 'corn', 'pumpkin', 'mango']
sprite_sheet('crops.png', 6, 4, [[f'crop_{n}_{i}' for i in range(4)] for n in CROPS], (0, 0), 15)
FENCE = ['bamboo', 'wood', 'stone', 'plaster', 'iron']
sprite_sheet('fences.png', 5, 4, [[f'fence_{m}_{p}' for p in ['line', 'post', 'corner', 'gate']] for m in FENCE], (0, 0), 20)
# ---- v0.12 village props, animals, water structures (magenta sheets in source_art/v012)
sprite_sheet('props_plaza.png', 3, 4, [['pp_well', 'pp_lamp', 'pp_board', 'pp_banner'], ['pp_bench', 'pp_bench_side', 'pp_planter', 'pp_pot'], ['pp_mailbox', 'pp_signpost', 'pp_barrels', 'pp_crates']], (0, 0), 34,
             widths=dict(pp_well=34, pp_lamp=12, pp_board=30, pp_banner=18, pp_bench=30, pp_bench_side=13, pp_planter=32, pp_pot=13, pp_mailbox=10, pp_signpost=20, pp_barrels=24, pp_crates=22))
sprite_sheet('props_farm.png', 3, 4, [['pf_scarecrow', 'pf_tub', 'pf_firewood', 'pf_stump_axe'], ['pf_hay', 'pf_clothesline', 'pf_wheelbarrow', 'pf_wateringcan'], ['pf_stall', 'pf_trough', 'pf_sacks', 'pf_handcart']], (2, 0), 40,
             widths=dict(pf_scarecrow=24, pf_tub=19, pf_firewood=28, pf_stump_axe=22, pf_hay=28, pf_clothesline=40, pf_wheelbarrow=26, pf_wateringcan=11, pf_stall=44, pf_trough=32, pf_sacks=22, pf_handcart=30))
sprite_sheet('props_camp.png', 2, 4, [['pc_tent', 'pc_tent_small', 'pc_log', 'pc_board'], ['pc_fire_0', 'pc_fire_1', 'pc_fire_2', 'pc_fire_3']], (0, 0), 40,
             widths=dict(pc_tent=40, pc_tent_small=30, pc_log=30, pc_board=26), groups=[([f'pc_fire_{i}' for i in range(4)], 'pc_fire_0', 22)])
sprite_sheet('water_structures.png', 2, 3, [['pw_bridge_h', 'pw_bridge_v', 'pw_pier'], ['pw_stepstones', 'pw_boulders', 'pw_rocks_reeds']], (0, 0), 72,
             widths=dict(pw_bridge_h=76, pw_bridge_v=40, pw_pier=40, pw_stepstones=46, pw_boulders=52, pw_rocks_reeds=28))
sprite_sheet('animals_big.png', 3, 4, [[f'an_cow_{i}' for i in range(4)], [f'an_buffalo_{i}' for i in range(4)], [f'an_dog_{i}' for i in range(4)]], (0, 0), 34,
             groups=[([f'an_cow_{i}' for i in range(4)], 'an_cow_0', 34), ([f'an_buffalo_{i}' for i in range(4)], 'an_buffalo_0', 36), ([f'an_dog_{i}' for i in range(4)], 'an_dog_0', 19)])
sprite_sheet('farm_buildings.png', 1, 3, [['fb_coop', 'fb_shed', 'fb_doghouse']], (0, 1), 64, widths=dict(fb_coop=40, fb_doghouse=22))
# ---- v0.17 city (อำเภอ / จังหวัด / ประเทศ): towers, civic buildings, shops, landmarks, street props (source_art/v016)
sprite_sheet('city_skyscrapers.png', 2, 2, [['cb_tower_glass', 'cb_tower_teal'], ['cb_condo', 'cb_bank']], (0, 0), 92, grid=True,
             widths=dict(cb_tower_glass=92, cb_tower_teal=70, cb_condo=84, cb_bank=104))
sprite_sheet('city_hospital.png', 1, 1, [['cb_hospital']], (0, 0), 210, grid=True)
sprite_sheet('city_government.png', 2, 2, [['cb_police', 'cb_fire'], ['cb_district', 'cb_province']], (0, 0), 128, grid=True,
             widths=dict(cb_police=128, cb_fire=124, cb_district=150, cb_province=176))
sprite_sheet('city_public.png', 2, 2, [['cb_school', 'cb_temple'], ['cb_post', 'cb_market']], (0, 0), 150, grid=True,
             widths=dict(cb_school=150, cb_temple=118, cb_post=96, cb_market=140))
sprite_sheet('city_commercial.png', 2, 2, [['cb_mall', 'cb_store'], ['cb_shophouse', 'cb_apartment']], (0, 0), 170, grid=True,
             widths=dict(cb_mall=170, cb_store=96, cb_shophouse=112, cb_apartment=100))
sprite_sheet('city_parliament.png', 1, 1, [['cb_parliament']], (0, 0), 224, grid=True)
sprite_sheet('city_props.png', 4, 4, [['cp_lamp', 'cp_traffic', 'cp_busstop', 'cp_hydrant'], ['cp_bin', 'cp_bench', 'cp_policebox', 'cp_cones'],
                                      ['cp_barrier', 'cp_billboard', 'cp_phone', 'cp_jail'], ['cp_planter', 'cp_tree', 'cp_moto', 'cp_fountain']], (0, 0), 14,
             widths=dict(cp_lamp=14, cp_traffic=14, cp_busstop=42, cp_hydrant=10, cp_bin=12, cp_bench=28, cp_policebox=24, cp_cones=22, cp_barrier=30,
                         cp_billboard=42, cp_phone=16, cp_jail=30, cp_planter=22, cp_tree=30, cp_moto=34, cp_fountain=36))
# ---- v0.21 travel + nation: gate arches, bus stations per era, capital buildings, port and oil (source_art/v016)
sprite_sheet('gate_arches.png', 2, 2, [['gt_bamboo', 'gt_village'], ['gt_district', 'gt_city']], (0, 0), 60, grid=True, widths=dict(gt_bamboo=56, gt_village=60, gt_district=66, gt_city=70))
sprite_sheet('bus_stations.png', 2, 2, [['bs_sala', 'bs_stop'], ['bs_terminal', 'bs_metro']], (0, 0), 40, grid=True, widths=dict(bs_sala=40, bs_stop=46, bs_terminal=96, bs_metro=80))
sprite_sheet('capital_dense_1.png', 2, 2, [['cd_shophouses', 'cd_office'], ['cd_dept', 'cd_hotel']], (0, 0), 112, grid=True, widths=dict(cd_shophouses=112, cd_office=92, cd_dept=150, cd_hotel=110))
sprite_sheet('capital_dense_2.png', 2, 2, [['cd_skytrain', 'cd_nightmarket'], ['cd_stadium', 'cd_campus']], (0, 0), 150, grid=True, widths=dict(cd_skytrain=150, cd_nightmarket=130, cd_stadium=170, cd_campus=140))
sprite_sheet('port_oil.png', 2, 2, [['po_pier', 'po_crane'], ['po_pumpjack', 'po_refinery']], (0, 0), 110, grid=True, widths=dict(po_pier=110, po_crane=90, po_pumpjack=80, po_refinery=104))
if os.path.exists(os.path.join(ROOT, 'source_art', 'v016', 'oil_rig.png')):  # offshore rig (waiting for art)
    sprite_sheet('oil_rig.png', 1, 1, [['po_rig']], (0, 0), 120, grid=True)
# ---- v0.24 one-style houses: 5 wealth tiers x designs, each 4 construction stages (source_art/v023/house_t<tier>_<v>.png)
HZ_W = {1: 48, 2: 56, 3: 62, 4: 68, 5: 74}
for _f in sorted(glob.glob(os.path.join(ROOT, 'source_art', 'v023', 'house_t*_*.png'))):
    _t, _v = re.match(r'house_t(\d)_([a-z])', os.path.basename(_f)).groups()
    sprite_sheet(os.path.basename(_f), 2, 2, [[f'hz{_t}{_v}_s0', f'hz{_t}{_v}_s1'], [f'hz{_t}{_v}_s2', f'hz{_t}{_v}_s3']], (1, 1), HZ_W[int(_t)], grid=True)
# ---- v0.24 upgradeable shops / businesses: 4 levels per sheet, each a different building
for _f, _n, _w in [('shop_grocery.png', 'sh_grocery', [34, 64, 82, 120]), ('shop_convenience.png', 'sh_conv', [34, 66, 82, 100]), ('shop_restaurant.png', 'sh_rest', [34, 66, 88, 100]),
                   ('biz_workshop.png', 'bz_work', [50, 66, 96, 112]), ('biz_office.png', 'bz_office', [64, 80, 92, 92]), ('biz_bank.png', 'bz_bank', [50, 80, 104, 96])]:
    sprite_sheet(_f, 2, 2, [[f'{_n}_1', f'{_n}_2'], [f'{_n}_3', f'{_n}_4']], (0, 0), _w[0], grid=True, widths={f'{_n}_{i + 1}': w for i, w in enumerate(_w)})
sprite_sheet('waterfall.png', 2, 4, [[f'waterfall_{i}' for i in range(4)], [f'stream_{i}' for i in range(4)]], (0, 0), 54, merge=4)


# ---- v0.23 one art style: new cute trees and small plants replace the old ones under the same names (source_art/v016)
# v0.24 trees: only 2 kinds (round leafy tree + pine), big / small / stump (source_art/v023/trees_v3.png)
_T3 = {'oak': (0, 0), 'oaksmall': (0, 1), 'pine': (1, 0), 'pinesmall': (1, 1)}
_SP = {'broadleaf': 'oak', 'raintree': 'oak', 'teak': 'oak', 'tamarind': 'oak', 'mango': 'oak', 'goldenshower': 'oak', 'pinkshower': 'oak',
       'rubber': 'oaksmall', 'bamboo': 'oaksmall', 'banana': 'oaksmall', 'coconut': 'oaksmall', 'pine': 'pine', 'pinesmall': 'pinesmall'}
_TW = {'oak': 48, 'oaksmall': 32, 'pine': 44, 'pinesmall': 30}
for sp, kind in _SP.items():
    r, c = _T3[kind]; names = [[None] * 3, [None] * 3]; names[r][c] = 'tree_' + sp; names[r][2] = 'stump_' + sp
    sprite_sheet('trees_v3.png', 2, 3, names, (r, c), _TW[kind], grid=True, widths={'stump_' + sp: 22 if 'small' not in kind else 18})
_PL = [['shrub_a', 'shrub_b', 'shrub_c', 'flowers_white'], ['flowers_pink', 'flowers_yellow', 'hibiscus', 'flowers_violet'],
       ['fern_a', 'tuft_a', 'orchid_log', 'sunflower'], ['tuft_b', 'clover', 'reed_white', 'flowers_rose']]
sprite_sheet('bushes_v2.png', 4, 4, [['pl_' + n for n in r] for r in _PL], (0, 0), 16, grid=True)
_PL2 = [['marigold', 'fern_b', 'reed_gold', None], [None, None, None, None], [None, None, None, None], [None, None, None, None]]
sprite_sheet('bushes_v2.png', 4, 4, [['pl_marigold', 'pl_fern_b', 'pl_reed_gold', None], [None, None, None, None], [None, 'pl_tuft_a', None, None], [None, None, None, None]], (0, 0), 16, grid=True)

# ------------------------------------------------------------------ ground textures (seamless, 1x)
def card_interiors(file, rows, cols):
    im = load(file)
    cs, _ = cells(im, rows, cols, merge=3)
    out = {}
    for (r, c), m in cs.items():
        ys, xs = np.nonzero(m)
        y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
        out[(r, c)] = (im, (x0, y0, x1, y1))
    return out


FAMILY = {}


def seamless(img, size):
    """Tileable texture: blend the image with a half-offset copy using a centre-weighted mask."""
    t = cv2.resize(img.astype(np.float32), (size, size), interpolation=cv2.INTER_AREA)
    yy, xx = np.mgrid[0:size, 0:size] / (size - 1)
    w = (np.sin(np.pi * xx) * np.sin(np.pi * yy)) ** 0.7
    w = w[..., None]
    rolled = np.roll(np.roll(t, size // 2, 0), size // 2, 1)
    o = t * w + rolled * (1 - w)
    blur = cv2.GaussianBlur(o, (0, 0), 0.7)
    o = np.clip(o + (o - blur) * 0.6, 0, 255)
    return o.astype(np.uint8)


def texture(name, src, inset=0.16, region=None, size=128, tint=None):
    im, (x0, y0, x1, y1) = src
    if region:  # fractional sub-rect of the card
        fx0, fy0, fx1, fy1 = region
        x0, x1, y0, y1 = x0 + (x1 - x0) * fx0, x0 + (x1 - x0) * fx1, y0 + (y1 - y0) * fy0, y0 + (y1 - y0) * fy1
    else:
        dx, dy = (x1 - x0) * inset, (y1 - y0) * inset
        x0, x1, y0, y1 = x0 + dx, x1 - dx, y0 + dy, y1 - dy
    rgb = im[int(y0):int(y1), int(x0):int(x1), :3]
    h, w = rgb.shape[:2]
    if w > h * 1.4:  # wide strip (road band): keep its aspect, fill the square by mirror-stacking (no stretching)
        sc = size / w; strip = cv2.resize(rgb, (size, max(4, round(h * sc))), interpolation=cv2.INTER_AREA)
        reps = [strip if i % 2 == 0 else strip[::-1] for i in range(size // strip.shape[0] + 2)]
        rgb = np.concatenate(reps, 0)[:size]
    t = seamless(rgb, size)
    if any(k in name for k in ('grass', 'forestfloor')):  # small white flowers repeat visibly every 4 tiles -> inpaint them
        hsv = cv2.cvtColor(t, cv2.COLOR_RGB2HSV); spot = ((hsv[..., 1] < 70) & (hsv[..., 2] > 170)).astype(np.uint8)
        spot = cv2.dilate(spot, np.ones((3, 3), np.uint8)); t = cv2.inpaint(t, spot, 3, cv2.INPAINT_TELEA)
    fam = None if name.startswith('tx_road') else name.rsplit('_', 1)[0]  # variants of one terrain share mean colour/contrast, so 4x4 blocks don't show as patches
    tf = t.astype(np.float32)
    if fam is None: pass
    elif fam in FAMILY: m, sd = FAMILY[fam]; tf = (tf - tf.mean((0, 1))) / (tf.std((0, 1)) + 1e-3) * sd + m; t = np.clip(tf, 0, 255).astype(np.uint8)
    else: FAMILY[fam] = (tf.mean((0, 1)), tf.std((0, 1)))
    if tint: t = np.clip(t.astype(np.float32) * np.array(tint, np.float32), 0, 255).astype(np.uint8)
    rgba = np.dstack([t, np.full(t.shape[:2], 255, np.uint8)])
    Image.fromarray(rgba, 'RGBA').save(os.path.join(OUT, name + '.webp'), lossless=True)
    manifest[name] = [size // SS, size // SS]  # 4x4 tiles, stored at 2x like the sprites
    preview.append((name, np.kron(rgba, np.ones((2, 2, 1), np.uint8))))


gd = card_interiors('tiles_grass_dirt.png', 6, 4)
gr = card_interiors('tiles_ground.png', 5, 4)
wa = card_interiors('tiles_water.png', 5, 4)
rd = card_interiors('tiles_roads.png', 5, 4)
texture('tx_grass_0', gd[(0, 0)]); texture('tx_grass_1', gd[(0, 1)]); texture('tx_grass_2', gd[(0, 2)])
texture('tx_forest_0', gd[(0, 3)]); texture('tx_forest_1', gd[(1, 0)])
# shaded forest floor (calmer than the leaf-litter cards, used for most forest tiles)
texture('tx_forestfloor_0', gd[(0, 0)], tint=(0.93, 0.96, 0.9)); texture('tx_forestfloor_1', gd[(0, 2)], tint=(0.91, 0.95, 0.88))
texture('tx_dirt_0', gd[(1, 1)]); texture('tx_dirt_1', gd[(1, 2)])
texture('tx_sand_0', gr[(0, 0)]); texture('tx_sand_1', gr[(0, 1)])
texture('tx_rocky_0', gr[(1, 0)]); texture('tx_rocky_1', gr[(1, 1)])
texture('tx_meadow_0', gr[(2, 0)]); texture('tx_meadow_1', gr[(2, 1)]); texture('tx_meadow_2', gr[(2, 2)])
texture('tx_farm_0', gr[(3, 0)]); texture('tx_farm_1', gr[(3, 2)])
texture('tx_water_0', wa[(4, 1)]); texture('tx_water_1', wa[(4, 3)]); texture('tx_water_2', wa[(4, 2)])
texture('tx_ford_0', wa[(4, 0)])
# era roads: the straight horizontal piece of each row, road band only (between the verges)
for i, era in enumerate(['dirt', 'gravel', 'cobble', 'slab', 'asphalt']):
    band = {0: (0.08, 0.38, 0.92, 0.6), 1: (0.08, 0.38, 0.92, 0.6), 2: (0.08, 0.39, 0.92, 0.62), 3: (0.08, 0.40, 0.92, 0.6), 4: (0.06, 0.33, 0.94, 0.39)}[i]
    texture(f'tx_road_{era}', rd[(i, 0)], region=band)

json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=0, sort_keys=True)
if not os.environ.get('V2N_ART_OUT'):
  with open(os.path.join(ROOT, 'src', 'artManifest.js'), 'w') as f:  # importable by the renderer, the bundler and tests
    f.write('// GENERATED by scripts/ingest-art.py — sprite name -> [width, height] in world pixels (files: assets/v10/<name>.webp, stored at 2x)\n')
    f.write('export const ART10 = ' + json.dumps(manifest, sort_keys=True, separators=(',', ':')) + ';\n')
total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
print(f'{len(manifest)} sprites -> assets/v10 ({total / 1024:.0f} KiB)')

if '--preview' in sys.argv:
    pad, cw = 6, 1400
    x = y = 0; rowh = 0; placed = []
    for name, im in preview:
        h, w = im.shape[:2]
        if x + w > cw: x = 0; y += rowh + pad; rowh = 0
        placed.append((x, y, im)); x += w + pad; rowh = max(rowh, h)
    sheet = np.zeros((y + rowh, cw, 4), np.uint8); sheet[..., :3] = (60, 70, 90); sheet[..., 3] = 255
    for x, y, im in placed:
        a = im[..., 3:4] / 255
        sheet[y:y + im.shape[0], x:x + im.shape[1], :3] = (im[..., :3] * a + sheet[y:y + im.shape[0], x:x + im.shape[1], :3] * (1 - a)).astype(np.uint8)
    os.makedirs(os.path.join(ROOT, 'qa'), exist_ok=True)
    Image.fromarray(sheet).save(os.path.join(ROOT, 'qa', 'art_ingest_preview.png'))
    print('preview -> qa/art_ingest_preview.png', sheet.shape)

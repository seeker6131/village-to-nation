"""Shared helpers for the modular character pipeline (build-characters.py).

All derivative art is produced from the owner's own source sheets in
source_art/characters/. Nothing here generates new artwork; it only cleans,
downsamples uniformly, aligns and classifies existing pixels.
"""
from pathlib import Path
import numpy as np
import cv2
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'source_art' / 'characters'

# Output row order for every atlas: 0=down, 1=left, 2=right, 3=up.
DIRS = ['down', 'left', 'right', 'up']
# Source sheets do NOT share the same row order (this was the v0.7 left/right bug):
#   body 1000269387: rows down, RIGHT, LEFT, up  (row 1 eyes look to screen-right)
#   hair sheets    : rows down, LEFT, RIGHT, up  (row 1 bangs/face opening on screen-left)
SOURCE_ROW_FOR_DIR = {
    'body': {'down': 0, 'left': 2, 'right': 1, 'up': 3},
    'hair': {'down': 0, 'left': 1, 'right': 2, 'up': 3},
}


def load_rgba(name):
    return np.array(Image.open(SRC / name).convert('RGBA'))


def clean_fringe(a, keep_red_interior=True):
    """Remove the red/semi-transparent halo left by background removal.

    - every pixel with alpha < 200 becomes fully transparent (pixel art must be binary alpha)
    - saturated red pixels that touch the transparent background (within 3px) are removed;
      red pixels deep inside the sprite (e.g. the ponytail tie, which is outlined) are kept.
    """
    a = a.copy()
    alpha = a[..., 3]
    r, g, b = [a[..., i].astype(int) for i in range(3)]
    a[alpha < 200, 3] = 0
    red = (r > 120) & (g < 95) & (b < 110) & (r - g > 70)
    bg = (a[..., 3] == 0).astype(np.uint8)
    near_bg = cv2.dilate(bg, np.ones((7, 7), np.uint8)) > 0
    kill = red & (near_bg if keep_red_interior else True)
    a[kill, 3] = 0
    return a


def downsample(a, factor):
    """Uniform BOX downsample of a whole sheet by `factor` (>1 shrinks).

    One factor per sheet => no per-frame stretching. Alpha is thresholded to keep
    hard pixel-art edges; colour is averaged only over opaque source pixels so the
    transparent background never bleeds into edge colours.
    """
    h, w = a.shape[:2]
    nw, nh = round(w / factor), round(h / factor)
    alpha = (a[..., 3] > 0).astype(np.float32)
    premul = a[..., :3].astype(np.float32) * alpha[..., None]
    small_rgb = cv2.resize(premul, (nw, nh), interpolation=cv2.INTER_AREA)
    small_a = cv2.resize(alpha, (nw, nh), interpolation=cv2.INTER_AREA)
    out = np.zeros((nh, nw, 4), np.uint8)
    on = small_a >= 0.5
    rgb = np.where(small_a[..., None] > 1e-3, small_rgb / np.maximum(small_a[..., None], 1e-3), 0)
    out[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    out[..., 3] = np.where(on, 255, 0)
    out[~on, :3] = 0
    return out


def components_full(a, factor, min_area=15000, expect=16):
    """Find the 16 sprites at source resolution (gaps are reliable there), then
    downsample each one with the SAME global factor and grid origin so every frame
    keeps identical proportions. Returns [row][col] RGBA crops (native pixel size)."""
    mask = (a[..., 3] > 0).astype(np.uint8)
    n, lbl, st, cts = cv2.connectedComponentsWithStats(mask, 8)
    ids = [i for i in range(1, n) if st[i, 4] >= min_area]
    if len(ids) != expect:
        raise RuntimeError(f'expected {expect} sprites, found {len(ids)}')
    # small specks (detached highlights) join the nearest big component
    big = np.isin(lbl, ids)
    if (~big & (mask > 0)).any():
        dist, near = cv2.distanceTransformWithLabels((~big).astype(np.uint8), cv2.DIST_L2, 3, labelType=cv2.DIST_LABEL_PIXEL)
        ys, xs = np.nonzero(big)
        idx_to_label = np.zeros(near.max() + 1, np.int32)
        idx_to_label[near[ys, xs]] = lbl[ys, xs]
        specks = (~big) & (mask > 0) & (dist < 6)
        lbl = np.where(specks, idx_to_label[near], np.where(big, lbl, 0))
    ids.sort(key=lambda i: cts[i, 1])
    grid = []
    for r in range(4):
        row = sorted(ids[r * 4:r * 4 + 4], key=lambda i: cts[i, 0])
        crops = []
        for i in row:
            one = a.copy(); one[lbl != i, 3] = 0
            small = downsample(one, factor)
            bb = bbox(small[..., 3] > 0)
            x0, y0, x1, y1 = bb
            crops.append(small[y0:y1 + 1, x0:x1 + 1].copy())
        grid.append(crops)
    return grid


def components(a, min_area, expect=16):
    """Return 16 sprite crops ordered [row][col] by their centroid."""
    mask = (a[..., 3] > 0).astype(np.uint8)
    # close tiny gaps so a sprite with a detached highlight stays one component
    closed = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    n, lbl, st, cts = cv2.connectedComponentsWithStats(closed, 8)
    ids = [i for i in range(1, n) if st[i, 4] >= min_area]
    if len(ids) != expect:
        raise RuntimeError(f'expected {expect} sprites, found {len(ids)} (areas {sorted(st[1:,4])[-20:]})')
    ids.sort(key=lambda i: cts[i, 1])
    grid = []
    for r in range(4):
        row = sorted(ids[r * 4:r * 4 + 4], key=lambda i: cts[i, 0])
        crops = []
        for i in row:
            x, y, w, h, _ = st[i]
            crop = a[y:y + h, x:x + w].copy()
            crop[lbl[y:y + h, x:x + w] != i, 3] = 0
            # tiny specks that belonged to the closed mask but not the sprite itself
            crops.append(crop)
        grid.append(crops)
    return grid


def bbox(mask):
    ys, xs = np.nonzero(mask)
    if len(ys) == 0:
        return None
    return xs.min(), ys.min(), xs.max(), ys.max()


def rgb_to_hsv(rgb):
    hsv = cv2.cvtColor(rgb.reshape(-1, 1, 3).astype(np.uint8), cv2.COLOR_RGB2HSV).reshape(-1, 3)
    return hsv  # H 0..179, S 0..255, V 0..255


def save_png(a, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(a, 'RGBA').save(path, optimize=True)


# ---------------------------------------------------------------- body analysis
def head_info(frame):
    """Locate head top, head centre, neck row, eye mask and skull mask in a native body frame."""
    al = frame[..., 3] > 0
    h, w = al.shape
    widths = al.sum(1)
    top = int(np.argmax(widths > 0))
    hmax = top + int(np.argmax(widths[top:top + int(h * 0.55)]))
    neck = hmax
    for y in range(hmax, int(h * 0.75)):
        if widths[y] <= widths[neck]:
            neck = y
        elif widths[y] > widths[neck] + 2:
            break
    head = np.zeros_like(al)
    head[top:neck + 1] = al[top:neck + 1]
    xs = np.nonzero(head)[1]
    cx = (xs.min() + xs.max()) / 2
    hsv = rgb_to_hsv(frame[..., :3]).reshape(h, w, 3)
    interior = cv2.erode(np.pad(head.astype(np.uint8), 2), np.ones((3, 3), np.uint8))[2:-2, 2:-2] > 0
    dark = interior & (hsv[..., 2] < 150) & (hsv[..., 1] > 40)
    n, lbl, st, _ = cv2.connectedComponentsWithStats(dark.astype(np.uint8), 8)
    eyes = np.zeros_like(al)
    for i in range(1, n):
        if st[i, 3] >= 3 and st[i, 4] >= 5:
            eyes |= lbl == i
    # whites/highlights inside eyes belong to the eye too
    if eyes.any():
        ex0, ey0, ex1, ey1 = bbox(eyes)
        eye_top = ey0
    else:
        eye_top = None
    skull = head.copy()
    if eye_top is not None:
        skull[eye_top - 1:] = False
    return dict(top=top, cx=cx, neck=neck, head=head, eyes=eyes, skull=skull, eye_top=eye_top)


# ---------------------------------------------------------------- hair fitting
def fit_hair(hair, hi, margin=2, search=14):
    """Best integer offset (dx, dy) of a native hair crop relative to the body frame.

    Hard goals: hair covers the skull (crown above the eyes) and never covers the eyes.
    Soft goals: hair top sits `margin` px above the head top; cap centre near head centre.
    Returns (dx, dy, cover_fraction, eye_pixels_covered).
    """
    H = hair[..., 3] > 0
    hh, hw = H.shape
    skull, eyes = hi['skull'], hi['eyes']
    bh, bw = skull.shape
    cap_rows = H[:max(3, hh // 3)]
    cap_cols = np.nonzero(cap_rows.any(0))[0]
    cap_cx = (cap_cols.min() + cap_cols.max()) / 2
    best = None
    want_top = hi['top'] - margin
    base_dx = round(hi['cx'] - cap_cx)
    for dy in range(want_top - search, want_top + search + 1):
        for dx in range(base_dx - search, base_dx + search + 1):
            canvas = np.zeros((bh, bw), bool)
            # paste H at (dx,dy) clipped
            y0, x0 = max(0, dy), max(0, dx)
            y1, x1 = min(bh, dy + hh), min(bw, dx + hw)
            if y1 <= y0 or x1 <= x0:
                continue
            canvas[y0:y1, x0:x1] = H[y0 - dy:y1 - dy, x0 - dx:x1 - dx]
            cover = (canvas & skull).sum() / max(1, skull.sum())
            eye_cov = int((canvas & eyes).sum())
            cost = (-400 * min(cover, 0.985) + 25 * eye_cov
                    + 3 * abs(dy - want_top) + 1.5 * abs(dx - base_dx))
            if best is None or cost < best[0]:
                best = (cost, dx, dy, cover, eye_cov)
    return best[1], best[2], best[3], best[4]

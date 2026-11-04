#!/usr/bin/env python3
"""Build a non-destructive V2N Reboot skin of MIT-licensed My City.
Do not delete or mutate the original V2N project. Requires Pillow.
"""
import json
import re
import shutil
import sys
from pathlib import Path

from PIL import Image

def recolor_sheet(src: Path, size: tuple[int, int], tier: int = 0) -> Image.Image:
    im = Image.open(src).convert("RGBA")
    width, height = im.size
    # The fantasy building art was produced as three visual tiers arranged left-to-right.
    if width > height:
        cell = width // 3
        im = im.crop((tier * cell, 0, (tier + 1) * cell, height))
    pix = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = pix[x, y]
            if r >= 205 and b >= 185 and g <= 90 and (r - g) > 115:
                pix[x, y] = (r, g, b, 0)
            elif a < 96:
                pix[x, y] = (r, g, b, 0)
    bounds = im.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError(f"No visible pixels after background removal in {src}")
    im = im.crop(bounds)
    target_w, target_h = size
    scale = min((target_w - 2) / im.width, (target_h - 2) / im.height)
    w = max(1, round(im.width * scale))
    h = max(1, round(im.height * scale))
    im = im.resize((w, h), Image.Resampling.NEAREST)
    out = Image.new("RGBA", size, (0, 0, 0, 0))
    out.alpha_composite(im, ((target_w - w) // 2, target_h - h))
    return out

def main():
    if len(sys.argv) != 4:
        raise SystemExit("Usage: build_reboot.py <upstream/game> <original-v2n/source_art/fantasy> <output/public>")
    game = Path(sys.argv[1])
    fantasy = Path(sys.argv[2])
    public = Path(sys.argv[3])
    manifest_file = game / "assets/sprites/manifest.json"
    m = json.loads(manifest_file.read_text(encoding="utf-8"))
    # Actual in-game PNGs are replaced; engine state, collisions, NPC AI and jobs remain My City's.
    swap = {
        "cafe": ("inn", 0),
        "homes": ("house_a", 0),
        "player_home": ("house_b", 0),
        "alma_home": ("house_c", 0),
        "shop": ("market", 0),
        "workshop": ("blacksmith", 0),
    }
    for key, (sheet, tier) in swap.items():
        path = fantasy / (sheet + ".png")
        if not path.exists():
            raise FileNotFoundError(f"Missing V2N art: {path}")
        info = m["assets"][key]
        size = tuple(info["size"])
        dest = game / "assets/sprites" / (key + ".png")
        recolor_sheet(path, size, tier).save(dest, optimize=True)
        # Avoid stale imported textures when running repeated builds.
        (dest.with_name(dest.name + ".import")).unlink(missing_ok=True)
        info["v2n_reboot"] = {"source": "source_art/fantasy/" + sheet + ".png", "tier": tier}
    m["generation"]["v2n_reboot_note"] = "Selected fantasy building sprites supplied by V2N author. Other sprites are from the MIT-licensed My City project."
    manifest_file.write_text(json.dumps(m, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    # Game identity: maintain independent save namespace, so old V2N and My City saves cannot clash.
    project = game / "project.godot"
    p = project.read_text(encoding="utf-8")
    p = p.replace('config/name="My City · Mi Colonia"', 'config/name="V2N Reboot - Fantasy Village"')
    p = p.replace('config/custom_user_dir_name="MyCityPrototype"', 'config/custom_user_dir_name="V2NRebootFantasy"')
    project.write_text(p, encoding="utf-8")
    # Minimal title-screen localisation for a test build. Core UI remains upstream Spanish.
    shell = game / "scripts/shell.gd"
    s = shell.read_text(encoding="utf-8")
    for old, new in {
        '"Mi Colonia"': '"V2N REBOOT"',
        '"Continuar partida"': '"Continue"',
        '"Nueva partida"': '"New Game"',
        '"Iniciar partida"': '"Start Game"',
        '"Volver a la partida"': '"Back to Game"',
        '"Guardar partida"': '"Save Game"',
        '"Empezar de nuevo"': '"Start Over"',
        '"Conservar mi partida"': '"Keep Save"',
    }.items():
        s = s.replace(old, new)
    shell.write_text(s, encoding="utf-8")
    # Exports are single-threaded WebGL2; works on standard HTTPS static hosting.
    (game / "export_presets.cfg").write_text(
        '[preset.0]\n\nname="Web"\nplatform="Web"\nrunnable=true\n'
        'advanced_options=false\ncustom_features=""\nexport_filter="all_resources"\n'
        'include_filter="*.json,*.png,*.ttf"\nexclude_filter=""\n'
        'export_path="../build/index.html"\n'
        'script_export_mode=1\n\n'
        '[preset.0.options]\n\n'
        'custom_template/debug=""\ncustom_template/release=""\n'
        'variant/extensions_support=false\n'
        'vram_texture_compression/for_desktop=false\n'
        'vram_texture_compression/for_mobile=false\n'
        'html/export_icon=true\nhtml/custom_html_shell=""\nhtml/head_include=""\n'
        'html/canvas_resize_policy=2\nhtml/focus_canvas_on_start=true\n'
        'progressive_web_app/enabled=false\n'
        'progressive_web_app/ensure_cross_origin_isolation_headers=false\n',
        encoding="utf-8")
    public.mkdir(parents=True, exist_ok=True)
    cover = recolor_sheet(fantasy / "castle.png", (384, 320), 2)
    cover.save(public / "castle.png", optimize=True)
    print(f"V2N Reboot patched {len(swap)} building sprites; Godot source: {game}")

if __name__ == "__main__":
    main()

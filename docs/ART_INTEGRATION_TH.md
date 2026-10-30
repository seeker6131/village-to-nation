> ⚠️ v0.4 notes. Character art in v0.8 → `docs/CHARACTER_SYSTEM_TH.md`. The old male_/female_/npc_ webp sprites are no longer used at runtime (kept for history/tests).

# VISUAL ASSET INTEGRATION v0.4

## What changed
v0.3 combined a full painted village bitmap with flat frontier terrain and random cropped decorations, which made discontinuous seams obvious. v0.4 removes the baked painted backdrop from the live map and builds a deterministic authored continuous scene instead.

## Files
- `source_art/` all ten original images, untouched.
- `assets/world_map.webp` newly generated full playable terrain and precomposed scenery.
- `assets/project_farm.webp`, `assets/rock_clean.webp` transparent clean patches.
- `scripts/build-map.py`, `scripts/make-farm.py` deterministic authoring scripts, require Pillow. These are development tools only.
- `src/world.js` collision and resource positions; keep matching map authoring scripts.
- `src/main.js` runtime overlays, characters, in-world construction and click/tap navigation.

## Known limitations
- The village map is now visually consistent but is not a full Tiled/LDtk map with physically editable roofs, wall layers, animated pond/waterfall, or a complete occlusion mask.
- Some static buildings are still baked into `world_map.webp` but all static NPC figures have been removed from gameplay scene.
- The source art contains imperfect generated sprite frames. Frame-by-frame QA and normalized pivot points are necessary.
- Online money/state/election enforcement and OBT pay products remain unimplemented.

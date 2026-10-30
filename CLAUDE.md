# CLAUDE — Village to Nation v0.25 handoff

> Playable **single-player offline prototype**. Not OBT, no multiplayer, no payments.
> Read `README.md`, `docs/STATUS_V08_TH.md` (what is real / mock / missing) and `docs/CHARACTER_SYSTEM_TH.md` first.

## Commands
```bash
npm test                  # 85 unit tests — must stay green
npm run build             # regenerate play.html (never edit play.html by hand)
npm run test:e2e          # 18 Playwright browser tests, screenshots -> qa/screens/
npm run build:characters  # rebuild sprite atlases + src/character/atlasData.js
python3 scripts/build-rig.py --preview    # source_art/rig/*.png -> src/character/rigData.js (skeletal character parts)
python3 scripts/ingest-art.py --preview  # source_art/v010/*.png -> assets/v10 + src/artManifest.js (art pack)
python3 scripts/ingest-tiles.py --preview # source_art/tiles/*.png (4x4 GPT sheets) -> assets/tiles + src/tileManifest.js (ground tiles)
```
Serve `index.html` over HTTP for development (ES modules). `?test=1` exposes `window.__V2N__` for tests; `?dev=1` also shows the mock entitlement button in the shop.

## Architecture
- Pure rules (no DOM, Node-testable): `gameState.js`, `systems.js`, `construction.js`, `npcs.js`, `jobs.js`, `quests.js`, `progression.js`, `shop.js`, `save.js`, `performance.js`, `pathfinding.js`, `world.js`, `character/*`.
- UI: `ui/game.js` holds the shared context `G` + simulation step + movement + interaction. Other UI modules register callbacks on `G` (`G.openPanel`, `G.toast`, `G.openCreator`, …) to avoid import cycles. The bundler fails on cycles.
- Render: one world transform (`cam.zoom × resolution k`), y-sorted objects, then screen-space labels.
- Time: 20 real min = 1 game day; simulation uses wall-clock dt, never FPS. Menus/creator pause the world.
- Streets (v0.25): only planned roads are roads — `villageLayout.roadTiles` (tier roads, lot lanes, district streets, `WORLD.paths` to opened districts). Roads must start on even tiles. Houses face south onto a lane.
- Village growth = `villageLayout.js` plans (slots per tier, leader presses ยกระดับ; `s.town.stage = tier-1`). Houses/workshops only on slots. Never make it purchasable.
- Homes: `housing.js` (one claimed plot per person; NPCs save & build). Corruption: `corruption.js` (evidence → daily audit → seize/remove/ban). Props/animals: `villageProps.js` + `ui/game.js` animals.
- City levels: `world.js` ZONES = authored map like the reference (WORLD_LAYOUT bump = save re-lays forest). `cityPlan.js` (one town-square district per level inside its zone; keep it small-town scale, used by villageLayout roads/paved and villageProps). Crime: `crime.js` (thieves at night, patrol, arrest) + actors with `def.special` in `ui/game.js`.
- Layouts: `worldLayouts.js` (10 plans, `s.world.plan`, check with `node scripts/check-layouts.mjs --map N`). Travel: `ui/travel.js` (other towns are rebuilt visit-only states; `G.away`, saveNow writes the home save). Nation-scale plan: docs/GDD_TH.md (แผนอนาคต).
- Ground: `ui/terrain.js` dual-grid tiles (2x2 game tiles per tileset tile, 16 corner masks); water animates under transparent chunk holes.
- Pixel rule: art is 2x; canvas px per world px must stay even (`camera.snapZoom`). Character rig frames 80 px, feet y=76, drawn at 0.5.
- Economy runs per game hour (`economyHour`) and per day (`economyDay`, settlers).

## Non-negotiables
- Keep save key `v2n-prototype-v1`; add migrations in `save.js` instead of wiping data. Never let money/resources go negative (tests enforce).
- No pay-to-win: shop items may only have cosmetic/convenience effects (`validateCatalog` + test). `purchase()` must keep refusing until a server verifies receipts.
- Civil service and politics stay separate tracks; no paid path to leadership/PM.
- Characters are drawn by the skeletal rig (`character/rig.js`); the v0.8 atlas (`composer.js`) is only a fallback while a look bakes and the source of the old hairstyles. Frames: rows down/left/right/up, col 0 idle + 8 walk, feet on y=61, alpha binary. Don't claim sprites are final — side views lack a true idle frame and clothes are recolours.
- Every new button must call a real rule and explain why it is disabled.

## Next sprint (priority)
1. Real-device QA (Android Chrome landscape, iOS Safari, Windows Chrome/Edge); profile Low on a mid-range phone.
2. Artist clothing layers (top/bottom/shoes 4×4 on the same grid) → add an image-layer path in `composer.js`.
3. Layered tilemap (terrain/objects/collision/roof occlusion) to replace hand-tuned rectangles in `world.js`.
4. Short activity minigames for jobs; economy balancing from playtests.
5. Full EN localisation of menus (creator already TH/EN).
6. Server/API design (accounts, authoritative economy, land, elections, entitlements + payment webhooks). Do NOT connect a payment provider without that.

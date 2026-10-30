# Changelog

## v0.25 — real street plan (30 Oct 2026)
- Village redrawn as a street grid: a main street (W–E) with sidewalks crossing an avenue (N–S) at the plaza; residential
  lanes run W–E with one row of houses on their north side, every front door facing the lane over a lawn front yard with a
  stepping-stone path and a mailbox. All roads start on even tiles (clean 2-tile streets).
- Player lots (online housing) follow the same rows: hand-planned rows in the village, generated lanes in the districts.
- Removed: random dirt trails in town, gray stubs where world paths crossed the village, dirt/concrete blobs under
  village buildings. Country roads stay dirt until the district they lead to opens, then they become real roads.
- Houses scaled to fit their 4-tile lot (mansions no longer merge into one wall).
- Pasture, shed, coop, well and stall moved off the streets; camp tents moved off the main street.

## v0.24 — one-style houses, trees, shops (30 Oct 2026)
- 16 house designs in the new style (source_art/v023): 5 wealth tiers (cabin → small → medium → two-storey → mansion), 2–4
  designs each, 4 construction stages. House level = wealth tier (no area-era lock any more: in-game money only).
  Villagers' designs come from the plot, mirrored at random; the player picks a design in 🏠 บ้าน (free).
- Trees: only 2 kinds (round leafy + pine), big and small, with stumps.
- Upgradeable shops/businesses, 4 different buildings each: grocery, convenience store, restaurant, workshop, office, bank.
  District buildings use the level of the area (อำเภอ 2, จังหวัด 3, ประเทศ 4); the player's workshop uses them too.
- Still old style: government buildings, hospital, school, temple, leader house, village market/hall (waiting for art).

## v0.23 — one art style, step B: ground, roads, water, trees, plants (30 Oct 2026)
- New Stardew-style sheets (docs/ART_DIRECTION_TH.md): grass, main road with sidewalk (district+), residential lane (village),
  dirt trail (camp/forest), paving (brick squares, concrete yards, stepping stones, soil), water banks + 4-frame water,
  6 cute trees + stumps, 16 small plants. Old sheets kept in source_art/tiles_v1.
- Ingest: GPT grid slivers removed on grass-sides of edge tiles, water tiles blended to wrap seamlessly.
- Scatter of flowers/ferns cut to about a third — calmer ground. Trees mostly oak/birch/pine; maple/blossom/apple as accents.

## v0.22 — villagers live like people, fewer walkers (30 Oct 2026)
- `src/npcLife.js`: every villager has hunger, energy and their own money. Work pays a wage by job and makes them hungry and
  tired; very hungry -> they go and eat (5 coins, to the market tax), exhausted -> home to bed; sleep restores energy.
- Civil service from อำเภอ up: police (station, afternoon patrol all over town), officials (district office -> provincial hall ->
  government house, 15:00 meeting there), teachers (school), nurses (hospital), office workers (bank/offices) — in uniform.
- Free time strolls go all over the map (district squares, housing estates). NPC panel shows hunger / energy / savings.
- Performance: the whole population lives on in the rules, but only 22 / 34 / 48 (Low / Medium / High) walk around as actors.
  Workplace/stroll lookups cached (district level went from ~13 to ~35 fps on the headless test machine).
- Fix "everyone piles up and runs to one place on entering": families from 🏗 now own a house each (lodgers spread over
  houses instead of 6 camp spots), new actors appear already at their current activity, work targets are spread out, and a jump
  in game time no longer replays 24 hours of work at once (which made the whole town hungry and run to the market together).
- Tests: 87 unit (new tests/npc-life.test.js).

## v0.21 — gates, stations, capital, port, beaches (30 Oct 2026)
- New art (source_art/v016): 4 entrance arches and 4 bus stations by era (bamboo/sala → village → district → city/metro) at
  the village gate and the 🚌 stop; capital buildings (shophouse row, office, department store, hotel, skytrain, night market,
  stadium, campus); port & oil (pier with containers, dock crane, pumpjack, refinery) in the port zone of sea layouts.
- Sea layouts (ชายทะเล, ปากแม่น้ำ) get sandy beaches with surf (tile_beach.png) instead of river banks.
- From อำเภอ up the village core also loses its wild trees (shade trees kept).
- House lots for online players on every map (`playerLots` in villageLayout.js): rows of plots per level in the zone that level
  develops (+14 หมู่บ้าน, +34 อำเภอ, up to ~100 total by จังหวัด/ประเทศ — the 144x96 map is then full). NPCs claim and build
  them like the plan's own plots; 🏗 พัฒนาจนตัน builds every lot and fills the town (generated settler names past the pool,
  population cap 15/30/60/120/200). Old pumpjack-on-land removed (offshore rig waits for art).

## v0.20 — 10 town layouts + travel between towns (30 Oct 2026)
- `src/worldLayouts.js`: 10 different town layouts (river course, lake / sea, hill, market quarter, new town, fields, mine, snow,
  deep forest, temple, future port). The village core is shared; paths and bridges are generated; districts (cityPlan.js) are
  placed relative to each layout's zones. `scripts/check-layouts.mjs` validates all 10 (unit test).
- New towns pick a random layout; old saves keep theirs. Test-mode bar: 🗺 ผัง n/10 (Y) cycles the layout of your own town.
- Travel (step 1 of the nation-scale plan, `src/ui/travel.js`): 🚌 bus stop at the east gate / key G / ☰ menu → the district map:
  6 other villages (other founders' towns, simulated, each a different layout), the district seat, the province seat
  (needs หมู่บ้าน level) and the capital (needs อำเภอ level; test mode: open). Other towns are visit-only: coins, items, xp, energy
  and time come home with you; building, land claims and leader work are only in your own town. Saving while away saves home.
- Tests: 85 unit, 18/18 browser.

## v0.19 — sun shadows + time speed (30 Oct 2026)
- Every tree, rock, building, prop and person casts a shadow that follows the sun (`sunAt` in ui/render.js): long and to the
  west in the morning, short at noon, long and to the east in the evening, leaning slightly north (Thailand); none at night.
  Drawn as a sheared silhouette of the sprite in one pass under all objects (Graphics "shadow" setting turns it off).
- Shadows darker (48%), drawn into one layer then laid down once so overlaps never stack into flickering black patches;
  they fade out smoothly before sunset instead of popping off.
- Test mode bar (🧪 sandbox only, under the player card): 🏗 พัฒนาจนตัน (U) builds out every slot of the current level at its
  era and fills the town; ⏫ อัพยุค (]) / ⏬ ([) step the area level 1→5 directly so each era can be reviewed (`fillLevel` / `setLevel` in showcase.js).
- ⏩ button / T key: time speed 1x → 2x → 5x → 20x (whole world speeds up; nothing is skipped).
- Trees no longer sway. Water snaps to the 2x2 ground cells so the river you see is exactly what blocks you (no standing on
  drawn water); bridges are centred on the planked span, stretched to reach both banks, and the paths run up to both ends.
- Walking over a bridge: only the deck row is walkable (no wading under it) and people rise with the arch of the deck
  (`groundLift` in villageProps.js — shadow moves with them). Fix: the water under/beside a bridge was walkable (planks
  covered 2 rows) — now only the deck row is planks and the river around it is solid.
- Building bases: yards under every building (see v0.18). Tests: 84 unit, 18/18 browser (layout test re-run after HUD fix).

## v0.18 — map laid out like the reference (30 Oct 2026)
- `world.js` forest region is now authored (ZONES): village centre, fields SW, lake S (island), river from the north waterfall into the
  lake with 2 bridges, hill NE (government), market quarter across the east bridge, new town E, rocky mine W, snow mountain NE,
  deep forest SE; forest only between zones; curved dirt paths link every zone. Other biomes stay procedural.
- `cityPlan.js`: each level develops its own district arranged as a town square (fountain, benches, planters, main building facing
  the square, lamp pairs at doors, stone lanes): อำเภอ = hill (district office, police, school, post, store) + lake temple;
  จังหวัด = hill becomes provincial hall + market quarter (hospital, mall, fire station, shophouses, apartment);
  ประเทศ = government house on the hill + new town (bank, towers, condo). Forest cleared only inside opened districts.
- Trails inside opened districts take the era road surface. Showcase camera jumps to the district of that level.
- Save migration: old saves keep everything; the forest is re-laid (felled-tree ids reset, built plots re-cleared, player at spawn).
- Forest is no longer wall-to-wall: trees grow in groves with grassy clearings between, wild bushes only along grove edges,
  fewer scattered flowers/ferns. Rare ore (copper / crystal) only in 6 ore pits ("เหมืองแร่") deep in the woods + the mine zone.
- Building bases blend into the ground: every built house / public building / city building gets a yard under its base
  (dirt in the early eras, pavers from อำเภอ) drawn with the soft autotile edges, plus a bigger contact shadow under city buildings.
- Tests: 84 unit, 18/18 browser.

## v0.17b — normal-scale towns (30 Oct 2026)
- Dropped the map-wide street grid / paved blocks (too big, looked bad). Each level now adds one loop of road around the village and
  a handful of buildings along it: อำเภอ (district office, police + police box, school, temple, post office, store), จังหวัด
  (hospital, provincial hall, mall, fire station, apartment), ประเทศ (government house, bank, 2 towers, condo).
- Forest is only cleared near town (radius 30 / 36 / 42 tiles, ~1 in 8 trees kept for shade); the rest of the map stays natural.
- Tests updated: buildings never on the village plots / house slots / water, at most 20 buildings.

## v0.17 — real cities, police and thieves (30 Oct 2026)
- City plans for อำเภอ / จังหวัด / ประเทศ (`src/cityPlan.js`): a street grid around the old village core, each block gets a building of
  its level — district office, police station (+ police box, jail), fire station, school, temple, post office, fresh market (อำเภอ);
  provincial hall, hospital, mall, condos, apartments (จังหวัด); government house, bank, skyscrapers (ประเทศ). Blocks are paved,
  with street trees, planters, benches, lamps, bus stops, traffic lights; every 5th block / riverside block is a park.
- A city is not a forest: from อำเภอ up the trees around town are cleared (parks keep a third), the nation level clears almost all.
  City streets cross the river as walkable bridges. Weeds/flowers are no longer drawn on streets and paved blocks.
- 25 new city sprites from `source_art/v016` (towers, hospital, government, public, commercial, government house, 16 street props).
- Crime (`src/crime.js`): at night in a town of 12+ people a thief may sneak to a house or the market strongbox; after 2 game hours
  they steal (household savings / up to 10% of the player's coins if it's the player's house / 5% of the treasury). Night patrol:
  volunteer watch (หมู่บ้าน) → police officers (อำเภอ 2, จังหวัด 3, ประเทศ 4) catch some. The player can catch a thief in the act (E):
  reward 25 coins taken from the treasury (only what it has), +happiness, +popularity for a leader. Safety stats in the ☰ menu.
- Police / thief uniforms are NPC-only (hidden from the dressing room). Stage names aligned: ค่ายบุกเบิก → หมู่บ้าน → อำเภอ → จังหวัด → ประเทศ.
- The real game still cannot upgrade past หมู่บ้าน (city construction rules not built yet) — the cities are visible in 🏙.
- Tests: 84 unit (new `tests/city-crime.test.js`); browser 17/18 (dressing-room test flaky once, passes on rerun).

## v0.16 — square tileset ground, modern roads, permanent clearing (30 Oct 2026)
- Ground is now built from the artist's square tile sheets (`source_art/tiles` → `scripts/ingest-tiles.py` → `assets/tiles`, `src/tileManifest.js`).
  Dual grid: one tileset tile = 2x2 game tiles; each drawn tile picks one of 16 corner masks, so roads and water get drawn borders.
  GPT's inner-corner tiles are re-identified by their grass corner and shifted to line up with the edges; diagonal tiles are composed.
- Roads per era: footpath (camp) → laterite (village) → concrete with kerbs (district) → asphalt (province) → modern asphalt + sidewalk (nation);
  plaza paving per era (cobble → concrete pavers → brick → stone). Odd puddles / ruts / drains / manholes.
- Water is animated: 4-frame loop drawn under the ground every frame (lake ripples; narrow rivers use flowing-stream frames), banks with
  rocks and foam, occasional lily pads. The old procedural ground stays as the fallback while tiles load.
- Felled trees inside the village plan are gone for good; outside the plan stumps regrow after 3 days.
- Zoom: integer pixel steps (more zoom levels), mouse wheel, pinch on Android, iOS gestures; zoom remembered. Smaller HUD on short phones.
- Not used yet: `tile_dirt.png` (no clean grid — natural dirt uses the footpath set), `tile_farmland.png` (ingested, fields not switched yet).
- Tests: 79 unit green; browser 17/18 — the FPS test fails on this headless machine with or without the new tiles (uncapped 26–29 fps).

## v0.15 — living villagers (29 Oct 2026)
- Population grows by itself: a new family every 3 game hours up to the level cap (ค่ายบุกเบิก 15 · หมู่บ้าน 30 · ตำบล 60). Newcomers camp first.
- Tier 1 plan = 8 house plots packed in rows along lanes (1 for the player, 7 claimed and BUILT by NPCs: they save, then work on their own house every morning; a 1-tile yard is cleared). Plan minimum population raised (tier 2 needs 12).
- NPC life: own home (sleep inside at night), jog to work when far, morning/evening strolls, chats in pairs with emoji bubbles, lunch at the plaza, work icons above heads, personal sleep/wake times.
- 30+ new villager names. Tests: 79 unit, 18 browser.

## v0.14 — showcase + test mode (29 Oct 2026)
- 🏙 button (key P): walk around a fully built copy of each level (camp / village / modern-era preview) — never saved; ✕ or Esc returns to the real game (`src/showcase.js`, `src/ui/showcaseUi.js`).
- 🧪 Test mode ∞ (default on, checkbox on the start screen): no naming/dressing, unlimited coins/wood/stone/energy/treasury, separate save slot (`src/sandbox.js`). Automated tests (`?test=1`) play the normal game.
- Camp tents disappear once the area is a village. Tests: 79 unit, 18 browser.

## v0.13 — own homes, careers, corruption, village props, crisp pixels (29 Oct 2026)
- **Everyone wants their own home** (`src/housing.js`): house plots in the plan belong to whoever claims them — one per person
  (10-coin transfer fee to the treasury). The player builds/upgrades their own house; NPC villagers (stand-ins for online players)
  claim plots, save 12 coins a day from their wages and build their own houses. New 🏠 บ้าน menu (key H) with my plot, my career
  and who lives where. Objective line: claim a plot → choose a career → build your house → public plan → exam → upgrade.
- **Corruption** (`src/corruption.js`): a leader can embezzle 40% of the treasury, take kickbacks from public construction
  (slower, shoddy work) or buy votes (+3 per 30 coins, max +15). Every act adds hidden evidence; a daily audit (ป.ป.ช. / journalists /
  villagers) may catch you: money seized back to the treasury, popularity crash, serious cases = removed from office and banned
  from elections for 14 days. Clean leaders get +6 popularity ("integrity" factor). In-game coins only.
- **Village props from the art pack**: camp (tents, animated campfire, log seat, rough board, firewood, axe stump, sacks, cart,
  dog house, laundry) → village (well replaces the fire, lamps that light up at night, notice board, banner, planters, benches,
  signpost, barrels, market stall, scarecrow, tub, cow shed, trough, hay, chicken coop, mailboxes at houses, bridge over the river).
  Animals: a dog that trots after the player; cows and a buffalo graze in the pasture from tier 2.
- **Crisp pixels**: zoom snaps to even canvas-px-per-world-px so every 2x sprite pixel is the same size; characters are baked at
  2x (80 px frames, 62 px tall) instead of being scaled by 0.6. Screen-edge vignette removed.
- Tests: 78 unit (+3: claims, NPC houses, corruption), 18 browser.

## v0.12 — pre-designed village plans + organic ground (29 Oct 2026)
- **Village plans per level** (`src/villageLayout.js`): every level has a fixed plan of building slots and roads.
  Tier 1 ค่ายบุกเบิก (หัวหน้าค่าย): home, farm, 2 houses. Tier 2 หมู่บ้าน (ผู้ใหญ่บ้าน): market, hall, workshop, 4 houses, new roads,
  village radius 18 → 26. Tiers 3–6 (ตำบล/กำนัน → อำเภอ → จังหวัด → ประเทศ/นายกรัฐมนตรี) are shown on the path but locked
  (tier 3 waits for its building art; 4+ need online).
- Houses and the workshop can only be built on plan slots (yellow stakes on the map, tap a slot to build); decorations stay free
  but may not cover a slot. Market/hall unlock with tier 2. Next-tier slots are drawn faintly so players see how the village grows.
- The area level no longer grows by itself: when every slot is built, population is enough and you are the leader, the build panel's
  "ยกระดับ" button upgrades it; villagers open the new roads (trees on them are cleared). Money never upgrades. The leader's
  title follows the level. New objective line (`src/guide.js`).
- **Organic ground**: terrain coverage fields are blurred and noise-thresholded per pixel, so paths, shores and meadows are soft
  curves instead of 16 px steps; grass/water/dirt painted in the reference map's palette with blades, foam and ripples; round paved
  plaza from tier 2; flowers and ferns line the paths.
- Saves: schema 4 (old saves keep their level, capped at หมู่บ้าน; existing houses stay where they are).
- Tests: 75 unit (+4 plan tests), 18 browser (+1 full upgrade flow).

## v0.11 — skeletal walk animation (29 Oct 2026)
- **Characters now have bones** (`src/character/rig.js`, data from `scripts/build-rig.py` → `src/character/rigData.js`).
  Body parts (head, torso, pelvis, upper arm, forearm+hand, thigh, shin, foot) × front/side/back are cut from the new
  magenta-background sheets in `source_art/rig/`, fitted to the proportions of the reference turnaround, and posed on a skeleton.
- 8-frame walk cycle (was 4 swapped poses): side view swings the thighs ±26°, bends the knee on the forward swing, keeps the
  planted foot flat, counter-swings the arms with an elbow bend; body height comes from the lowest foot (real contact bob);
  head/hair lag a little. Front/back: the stepping leg lifts (shin foreshortens), body sways over the standing leg, arms flare.
  Legs advance with distance walked (4.5 world px per frame) so feet never slide. Right = mirrored left.
- Baked 4:1 into 64 px frames (feet on y=61, same as before) with part-edge shading and a 1 px outline; atlases bake in the
  background one look per tick (the v0.8 sprite is shown for that instant). Player look bakes first.
- Layers: new rig hair "ผมยุ่งปัดข้าง" + bald; v0.8 hairstyles (pony/swept/short) are re-fitted onto the rig head.
  Farmer outfit is the real mor hom garment set (shirt, sleeves, trouser seat with pha khao ma, trouser legs, sandals);
  every other outfit recolours those garments (sleeve/trouser length from the outfit data). Skin/hair/eye colours recolour by material.
- Tests: 71 unit (+5 rig: layout, feet on ground every frame, stride opens/closes, mirror, recolours), 17 browser.

## v0.10 — art pack in the game + start screen (29 Oct 2026)
- **Real art from the prompt pack** (`scripts/ingest-art.py` → `assets/v10/`, 215 sprites): background/glow/red fringe removed,
  painted checkerboards keyed out, sheets sliced, one scale per sheet, 1-world-px selective outline (dark shade of the edge colour).
  - Buildings: villager house ×5 eras, leader house ×4, market ×5, hall ×5 — each with 4 construction stages (staked plot, frame, roofing, done).
    Sizes differ by type (house 128 < leader 144 < market 168 < hall 200 world px).
  - 12 tree species + matching stumps, 4 rock types × 3 damage states, 24 plants/flowers (decor layer), 6 crops × 4 growth stages,
    5 fence materials, animated waterfall, seamless ground textures (grass, forest floor, dirt, sand, rocky, meadow, farm, water, ford)
    and 5 era roads (dirt → gravel → cobble → slab → asphalt). Ground chunks now render at 2× for sharpness.
- Levels 1–5 of home/market/hall/cottage follow the eras; Lv4–5 need village stage (หมู่บ้าน/ชุมชน) — money alone can't unlock them.
- New private build: **fence** (upgrades bamboo → wood → stone → plaster → iron).
- Characters scaled 0.72 → 0.6 so they are in proportion with buildings.
- Premium pass: soft contact shadows under buildings/trees, golden-hour tint + vignette (Medium/High), cheap enough for 60 fps.
- **Start screen** every launch: "▶ เล่นเกม (เต็มจอ · แนวนอน)" requests fullscreen + orientation lock; when the OS can't lock
  (iPhone, upright phone) the game is rotated 90° in CSS and all pointer input is remapped (`src/ui/orientation.js`). Windowed option kept. Enter = play on PC.
- Layout breakpoints moved from media queries to `#app.compact/.portrait` classes so they follow the rotated size.
- Save compatible: tree/rock ids unchanged (generation footprint kept), plots enlarged without moving generated content.
- Tests: 66 unit (+3: art coverage, building sizes/stages, era stage lock), 17 browser (+1: start screen + rotated touch).

# CHANGELOG

## v0.9.0 — 29 ต.ค. 2026 · Wild Forest Start + Founder Terms
### โลก (layered tilemap จาก seed)
- เลิกใช้ภาพฉากหมู่บ้านวาดสำเร็จ (`world_map.webp`) → แผนที่ 144×96 ช่องสร้างจาก **seed + ภูมิประเทศ** (ป่าทึบ / ริมแม่น้ำ / ที่สูง / ชายฝั่ง) แต่ละเกมใหม่ได้ป่าไม่ซ้ำกัน
- ชั้น: พื้น (หญ้า ป่า ดิน ทราย หิน น้ำ ทางข้าม) → ของตกแต่งพื้น → วัตถุ (ต้นไม้ 1,200+ ต้น หิน พุ่ม ขอนไม้) → อาคาร/คน เรียงความลึก → ชั้นชน → แสงกลางคืน
- พื้นวาดเป็นพิกเซลลงก้อน (chunk) 32×32 ช่อง โหลดเฉพาะที่มองเห็น
- **ซูมไม่แตก**: ล็อกให้ 1 พิกเซลเกม = พิกเซลจอจำนวนเต็มเสมอ (บีบ/ล้อเมาส์ยังลื่น แต่ภาพคม)
- ถนนดินในหมู่บ้านเปลี่ยนเป็นหินกรวด (ชุมชน) และถนนปู (เมือง) ตามระดับพื้นที่
### เริ่มเกมจากป่า
- เริ่มที่ลานเล็กกลางป่า: บ้านผู้นำ 1 หลัง เต็นท์ NPC 3 หลัง กองไฟ กระดาน ขอนไม้นั่งเรียน ลังแลกของ
- ได้ **ขวาน 1 เล่ม**: ฟันต้นไม้ 3 ครั้งล้ม → ตอไม้ → ขุดตอ = ที่ดินโล่ง · ต้นผลไม้ให้ผลไม้ · ทำ **อีเต้อ** จากไม้ 4 เพื่อขุดหิน
- โครงการสาธารณะต้อง **ถางหมุดที่ดินให้หมดก่อน** · อาคารส่วนตัววางได้เฉพาะที่โล่งในวงที่ดินหมู่บ้าน + ทางเดินหิน (เดินผ่านได้)
- ต้นไม้/อาคารที่บังตัวผู้เล่นจะ **โปร่งแสง**
### NPC และการเคลื่อนไหว
- เริ่มด้วย NPC ผู้ช่วย 4 คน (ครูอุ่น ช่างชัย ป้าแสง ลุงมี) คนอื่นย้ายเข้ามาเมื่อมีบ้าน
- ช่าง NPC **ถางป่าเอง** (โค่นต้นไม้ในหมุดที่ดินก่อน) ไม้เข้าตลาด → ป่ารอบหมู่บ้านค่อยๆ เปิด
- NPC ใช้ชีวิตเป็นธรรมชาติขึ้น: นาฬิกาส่วนตัวไม่พร้อมกัน, เดินเล่นรอบจุดหมาย, หันมองรอบตัว, หลบกันไม่ยืนทับ, ทางเดินเรียบไม่หักมุมเป็นตาราง, ท่าทำงาน (ฟันไม้มีเศษไม้กระเด็น)
- ผู้เล่นเดินเร็วขึ้น 70 → 100 · จังหวะขาผูกกับระยะที่เดินจริง (เดินเร็ว = ก้าวเร็ว) + เด้งตัวเล็กน้อยทุกก้าว
### ผู้ก่อตั้งและวาระ (ไม่ Pay-to-Win)
- เส้นทางเริ่มเกม: **ผู้ก่อตั้ง** (เล่นได้) / **ชาวบ้านในหมู่บ้านผู้เล่นอื่น** (ล็อก ต้องออนไลน์)
- ผู้ก่อตั้งเป็นผู้นำรักษาการทันที แต่: ความนิยมคิดจากความสุข/อาหาร/บ้าน/โครงการ/นโยบาย · วาระละ 7 วันเกม · เลือกตั้งแข่ง NPC · จำกัด 2 วาระติด · ต้องสอบผู้นำผ่านก่อนลงสมัคร · แพ้แล้วยังเป็นผู้ก่อตั้ง ลงใหม่สมัยหน้าได้
- ร้าน OBT เพิ่มสินค้า "ที่ดินผู้ก่อตั้ง" (ได้ที่ดิน + ป้าย) ตัวตรวจกฎยืนยันว่าขายคะแนน/ตำแหน่งไม่ได้
### เซฟ
- schema 3: เซฟ v0.5–v0.8 ย้ายเข้าป่าอัตโนมัติ เก็บเงิน/เลเวล/โครงการที่สร้างแล้ว คืนค่าอาคารส่วนตัวให้สร้างใหม่
### งานภาพ
- คลัง prompt 173 การ์ด (`docs/art-prompts/index.html`) + สเปก `docs/ART_PIPELINE_TH.md`

## v0.8.0 — 29 ต.ค. 2026 · Merged Systems Build
รวม v0.5 (โค้ดแยกโมดูล ระบบหลัก) + v0.7 (ห้องแต่งตัว ซูม เต็มจอ แนวนอน) เป็นโปรเจกต์เดียว

### ตัวละคร
- สร้าง pipeline `scripts/build-characters.py` ใหม่จากภาพต้นฉบับ: ลบขอบแดง ย่ออัตราเดียว จัดหัว/เท้าตรงกันทุกเฟรม fit ผมอัตโนมัติ
- แก้บั๊ก v0.7: ผมด้านข้างหันตรงข้ามกับหน้า, เฟรมถูกยืดรายเฟรม, ขอบแดง, ผมหลังทับตัว
- ระบบเปลี่ยนสี: ผม 6 · ผิว 5 · ตา 5 · ชุด 12 (ฟรี 4, อาชีพ 5, ร้าน 3) ด้วย material map
- ห้องแต่งตัวใหม่: ชื่อไทย/อังกฤษ (นับ grapheme), TH/EN, หมุน 4 ทิศ, ดูท่าเดิน, สุ่ม, ลองชุดร้าน
- NPC ทุกตัวใช้ระบบตัวละครเดียวกับผู้เล่น

### UI / แพลตฟอร์ม
- เปลี่ยนเป็นจอแนวนอน: HUD ซ้ายบน (ชื่อ เลเวล พลังงาน EXP) · เวลา/เงิน/วัตถุดิบ · เครื่องมือกล้องขวาบน · จอย/ปุ่ม ✦ · dock 10 เมนู · แผงด้านขวา
- ซูม 2 นิ้ว/ล้อเมาส์/ปุ่ม/คีย์บอร์ด, ลากกล้อง, โหมดดูทั้งเมือง, เต็มจอ + ล็อกแนวนอน
- คีย์ลัดสำหรับ PC ทุกเมนู, ป้ายนำทางไปที่ทำงาน, ชื่อเหนือหัว
- Low/Medium/High เปลี่ยนความละเอียดเรนเดอร์จริง + เงา/แสงไฟกลางคืน/น้ำ/หิ่งห้อย
- เสียงเอฟเฟกต์/บรรยากาศ (สังเคราะห์) + ตั้งค่าระดับเสียง

### ระบบเกม
- ก่อสร้างตามเวลาในเกม + NPC ช่างมาช่วย + ผู้เล่นช่วยด้วยพลังงาน + อัปเกรด 2–3 ระดับ + บ้านพักชาวบ้านใหม่
- ตลาดมีสต็อก ราคาขึ้นลงตามสต็อก; NPC ผลิต/บริโภคทุกชั่วโมงในเกม; คลังเมืองจากภาษี
- NPC ตารางชีวิตตามสิ่งที่หมู่บ้านมี; ผู้อยู่ใหม่ย้ายเข้า; ความสุขหมู่บ้าน
- งาน 5 แบบ + อาชีพ 4 สาย + ชุดอาชีพ; คำขอ NPC 8 เรื่อง
- ระดับพื้นที่ ค่าย → หมู่บ้าน → ชุมชน → เมือง; บันไดการเมืองถึงนายกฯ (ล็อก ไม่ขาย)
- ต้นไม้/หินหมดแล้วงอกใหม่ใน 6 ชม.เกม
- ร้าน OBT: โครงสร้างแค็ตตาล็อก + ตัวตรวจกฎห้าม Pay-to-Win + การซื้อถูกปฏิเสธเสมอ

### โค้ดและทดสอบ
- แตก `main.js` (50KB) เป็น `src/ui/` 8 โมดูล + โมดูลระบบใหม่ 8 ไฟล์
- `save.js`: migrate เซฟ v0.5 (สำรองไฟล์เดิม), import ตัวละคร v0.7, ป้องกันค่าติดลบ, เซฟเสีย/บันทึกไม่ได้ไม่ทำให้พัง
- `build-standalone.mjs` ใหม่: bundle โมดูลตามลำดับ dependency (เดิมต่อไฟล์ดิบ)
- Unit tests 27 → 60, Browser e2e tests 14 ชุด + ภาพหน้าจอใน `qa/screens/`
- ปรับ tests เดิม 2 ไฟล์ตาม API ใหม่ (placement ย้ายไป construction.js, settings มีค่าเสียงเพิ่ม)

## v0.7 — Character Creator (ไฟล์เดียว) · ดู `legacy/v0.7/`
## v0.5 — Systems-First Edition · ดู `docs/SYSTEMS_V05_TH.md`

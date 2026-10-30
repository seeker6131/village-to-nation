> ⚠️ Handoff ของ v0.3–v0.5 (ประวัติ) — ฉบับปัจจุบันคือ `CLAUDE.md` ที่ root

# ข้อกำหนดใหม่สำหรับ Claude — v0.5 PRIORITY (อ่านก่อนรายละเอียด v0.4)

**สโคปล่าสุดจากเจ้าของเกม: ทำระบบ UI, บาร์, ปุ่ม และการก่อสร้างให้ดี แล้วค่อยใส่/ปรับภาพทีหลัง**

อ่าน `../CLAUDE.md` และ `SYSTEMS_V05_TH.md` ก่อนเสมอ ให้เอกสารสองไฟล์นี้มีลำดับความสำคัญเหนือรายการ TODO งานภาพจากรุ่นก่อน

ให้เริ่มจากรักษาความสามารถจริงของ v0.5 ได้แก่ HUD energy/XP, bottom nav, inventory, market, craft, interactive placement mode, farms and harvesting, quests, public construction, civil exams, mock election and office controls. อย่าลบระบบใดโดยไม่ทดสอบ.

## งานต่อที่ควรทำ

1. UI v0.6: ปรับไหลหน้าจอมือถือให้ไม่ต้องปิด/เปิดเมนูบ่อย, แถบ quick item slot, หน้าสร้างมีแผนที่แสดงพื้นที่ว่าง และระบบยกเลิกก่อนหักของ
2. ปรับระบบการชน/วางอาคาร: ตรวจพื้นที่อิสระด้วย tilemap จริง, owner metadata, undo เฉพาะก่อนกดยืนยัน, เซฟเวอร์ชันและ migration
3. ระบบกิจกรรมระยะสั้น: คิวงานและมินิเกมงานช่าง/ตกปลา/ส่งของ เพื่อให้สนุกโดยไม่กดซ้ำหาของอย่างเดียว
4. วางระบบ NPC Simulation แยกส่วนจาก Canvas; NPC ซื้อขาย/ทำงานมีผลกับเมือง และเพิ่ม record event log
5. เพิ่ม integration tests โดยเฉพาะ save migration, construction collision, market transactions, menu on mobile และสิทธิ์ผู้นำ
6. เมื่อ prototype เล่นสนุกแล้วค่อยออกแบบ online authority, election, jobs/land permissions, cosmetics payment backend

**ห้ามอ้างว่ามี OBT ออนไลน์/รับเงินจริง หรือว่านายกประเทศทำงานแล้ว**

---

## บันทึก handoff v0.4

# IMPORTANT: v0.4 REPAIR — READ BEFORE FOLLOWING OLDER NOTES

The v0.3 documentation below is kept for history; some of its technical assumptions are **obsolete**.

- The game now uses one continuous `assets/world_map.webp` (1376×672), not a baked village on the left glued to procedural grass on the right. Built deterministically in `scripts/build-map.py` from transparent sprite art; art original remains in `source_art/`.
- FPS & quality settings and gameplay remain offline only. The `play.html` standalone has all required artwork embedded.
- NPCs and tap-to-walk now use collision-aware tile BFS routes. Check tile collision around doors, corner clipping, props, and waterfall/pond; it is not production navigation yet.
- New build pads have terrain-integrated footprints, not painted rectangle overlays. Construction plots are still a placeholder for building placement tools.
- Portrait canvas logical dimensions match stage aspect ratio, rather than stretching a square canvas to a tall viewport.
- Tests are expanded in `tests/map-v04.test.js`; browser screenshots in `qa`.
- Do NOT restore v0.3 baked background or draw cropped nature tiles over plain grass. For production, **replace map render with genuinely authored tilemap and proper layer/depth management**.
- IMPORTANT HONESTY: This is visual repair + starter systems, not a polished or OBT-ready product. Prioritize visual QA, nav collisions and repeatable fun before adding large online systems.

----

## ⚠️ v0.3 ART + SYSTEM UPDATE (READ FIRST)
- Read `docs/ART_INTEGRATION_TH.md` for source-art ownership and visual QA requirements.
- Art originals live in `source_art/`; derived 79 WebP assets in `assets/`.
- Runtime systems now include deterministic mentor quest hints and 4 civil-service ranks based on shifts.
- Critical next tasks: tile-level collision/passability across painted mentor village and the east bridge, A* NPC pathfinding, sprite frame repair, performance profiling on Android.
- Do NOT replace the original artwork with geometric placeholders; improve consistency using the supplied images.
- Standalone test: `play.html` includes all sprites as data URLs; source game: `index.html` + `src/` + `assets/` over HTTP.
- No multiplayer, money payment, backend authority, production governance or genuine NPC AI yet.

# CLAUDE HANDOFF — กรุณาอ่านไฟล์นี้ก่อนเริ่มแก้โค้ด

## Mission
รับช่วงต่อ Prototype เกม **บ้านเรา ประเทศเรา** เป็นเกม Pixel Art 2D top-down มุมสูงสำหรับมือถือ เริ่มจากพื้นที่รกร้าง มี NPC ผู้นำชั่วคราว สร้างชุมชนด้วยงานและทรัพยากร แล้วปลดล็อกสอบ/ลงสมัครผู้นำ ก่อนเพิ่มออนไลน์และระบบเติมเงิน OBT ในอนาคต

## สิ่งที่มีแล้วและใช้ได้
- `index.html`: shell เกมมือถือและ HUD, ปุ่มสัมผัส, modal
- `src/main.js`: loop / canvas pixel render / camera / NPC 10 คนเดินตามเวลางาน / input / panels
- `src/world.js`: tile world, project plots, NPC/trees/rock positions, deterministic decoration
- `src/gameState.js`: pure offline rules, 20 นาทีต่อวัน, 4 construction projects, job delivery & sell, civil service exam + daily shift, leadership exam, local-only election simulation
- `src/style.css`: responsive UI
- `src/performance.js`: preference normalization, 30/60/120 FPS targets, Low/Medium/High quality presets, separate local preferences
- `tests/state.test.js`: tests สำหรับ game rules
- `docs/GDD_TH.md`: high-level product requirements
- `docs/OBT_MONETIZATION_TH.md`: monetization constraints / operating cost model

## Important technical limitations
1. ตอนนี้เป็น **single-player offline demo** เท่านั้น `localStorage` แก้ไขได้โดยผู้เล่น ไม่สามารถใช้เป็นเศรษฐกิจ/เซฟออนไลน์
2. คะแนนเลือกตั้งเป็น mock: `runDemoElection()` คิดจากผลงานเทียบ NPC คะแนนคงที่ แค่ UI test ไม่ใช่การเลือกตั้งจริง
3. NPC เคลื่อนแบบตรงไปจุดหมายและยังไม่มี A* collision avoidance, inventory/market economy เป็นแบบย่อ
4. ไม่มี backend / authentication / AI API / secure payment integration / real-time networking
5. **v0.3 อัปเดตภาพจากผู้ใช้แล้ว:** หมู่บ้านฝั่งซ้ายเป็นภาพ baked 1536x1152 ที่ย่อวาดบน Canvas (NPC/บ้านที่วาดติดภาพยังเป็นฉาก ไม่ใช่วัตถุจริง) ขณะที่ฉากขยายฝั่งขวาเป็น runtime และมีสไปรต์เดินจริง รูปสไปรต์ AI ที่ส่งมามีกริดไม่เป๊ะ ควรจัด atlas และ collision ใหม่ก่อนใช้ผลิตจริง
6. ไม่มี runtime dependency แต่มี build script สร้าง play.html ที่ฝังภาพ WebP 79 ชิ้น; ชุดภาพเป็นภาพผู้ใช้ส่งมาสำหรับโปรเจกต์นี้ ต้องตรวจสิทธิ์และความสอดคล้องของต้นฉบับก่อนเผยแพร่ภายนอก
7. ตัวปรับ `tickMultiplier` และ `window.__V2N_DEMO__` เป็นเครื่องมือทดสอบ **ต้องปิด/ลบในออนไลน์จริง**

## Runnable
- เปิด terminal ในโฟลเดอร์นี้: `python -m http.server 8000`
- เปิด `http://localhost:8000`
- ทดสอบ logic: `npm test` (Node >=20)
- Deploy static hosting ได้ เช่น GitHub Pages โดยตั้ง root เป็นโฟลเดอร์นี้; ไม่มี server backend
- มือถือที่ต้องการทดสอบให้เปิด URL ของ host หรือใช้ local network server

## Recommended next work (เรียงลำดับ)
**Phase A:** ตรวจบน Android จอแนวนอน/แนวตั้ง, แก้ responsive map, pathfinding click-to-move แบบ A*, collision อาคาร/ทรัพยากร, NPC animations และ sprite sheets ที่ใช้ได้จริง (asset original/license-safe)

**Phase B:** ทำ gameplay 1 วันให้มีแรงดึงดูด: ปลูกผักจริง มี growth time, job variation, citizen relationship & small event chains, daily town news; ลบช่องงาน spam ที่ทำซ้ำได้ไม่จำกัดถ้ามีผลกับ economy

**Phase C:** ระบบ skill/civil service: สอบแยกหลายสายงาน, job grades, career records, civic governance vs bureaucratic promotions, quest chain/achievements

**Phase D:** ย้าย game state เป็น authoritative backend พร้อม authenticated identity, ledger, server-side economy/timers, anti-cheat, tests; เริ่มแบบทดลองออฟไลน์ก่อน อย่าเชื่อ state client

**Phase E:** real-time player visits, residence/citizenship, permissioned shops, elections with verified accounts, safeguards, abuse-report/block/moderation

**Phase F:** payment sandbox end-to-end (test SKU, verified webhook, duplicate order protection, refund); หลังผ่าน QA จึงเปิดเงินจริงใน OBT

## Definition of Done for next milestone
- เวอร์ชันเดิมไม่พัง; `npm test` ผ่าน และเพิ่ม tests สำหรับระบบใหม่
- NPC 10 ตัวใช้ pathfinding ไม่เดินทะลุบ้าน (ปัจจุบันยังเดินตามเส้นตรง)
- Android portrait & landscape UI แตะได้ครบ เห็น character/town ในมุมสูง
- เวลา 20 นาทีต่อวัน เดินตรงตามกติกา (เร่งเวลาเฉพาะ debug)
- หนึ่งการเล่น 10 นาทีมีงานใหม่หรือการเปลี่ยนแปลงที่สังเกตได้
- ระบบเติมเงินยังไม่มี pay-to-win และต้องอยู่หลัง gate ก่อนเปิดเงินจริง

## Prompt ให้ Claude (คัดลอกได้)
> คุณเป็น senior game engineer ร่วมพัฒนาโปรเจกต์ Village to Nation. อ่าน docs/GDD_TH.md, docs/CLAUDE_HANDOFF.md, docs/OBT_MONETIZATION_TH.md และไฟล์ src ทั้งหมดก่อนแก้. รักษาสไตล์ 2D top-down 16-bit pixel art และมือถือเป็นหลัก. พัฒนา Phase A อย่างเป็นขั้นตอน ปรับปรุง pathfinding/collision ของผู้เล่นกับ NPC และทำ map/sprite ให้อ่านง่าย โดยคงระบบงาน โครงการ สอบ และเลือกตั้งจำลอง. ห้ามอ้างว่ามีระบบออนไลน์หรือชำระเงินแล้วถ้ายังไม่ได้ทำ. เพิ่ม tests และสรุปไฟล์ที่เปลี่ยน วิธีรัน และข้อจำกัด. อย่าแก้โปรเจกต์ PixelDeck Battle เดิม.


## Mandatory game graphics settings (added in v0.2)
- Keep **30 / 60 / 120 FPS** selector, **Low / Medium / High** graphics selector and an optional measured FPS counter, available at ☰ → ⚙️ กราฟิกและ FPS.
- `src/performance.js` owns the settings schema; preference storage is separate from main game save. `src/main.js` applies visual profiles and schedules rendering with rAF independently of game-time progression.
- 120 is a requested *cap*, not a promise. Browsers/monitors can restrict real FPS. Do not unlock simulation advantages for high-refresh devices.
- On every code change run `npm test && npm run build`. `play.html` is generated; **never modify it directly**. The generated file can be opened without a module server.
- Next steps: benchmark power usage, frame-time graphs, and landscape/portrait stability on Android. The current quality levels change procedural scenery/effects; detailed 16-bit spritesheets/LOD will replace that later.

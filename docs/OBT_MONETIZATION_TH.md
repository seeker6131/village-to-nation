# OBT Monetization & Operating Costs — Draft

> สถานะ: เอกสารออกแบบเท่านั้น **ไม่มีระบบชำระเงินจริงใน Prototype** ราคาที่เห็นเป็นข้อเสนอ ไม่ใช่สินค้าที่เปิดขายแล้ว

## เป้าหมาย
สร้างรายได้จ่ายค่า hosting, database, bandwidth, real-time servers, backups, moderation, support, payment processing และ AI usage (ถ้ามี) โดยไม่สร้างความได้เปรียบในการสอบราชการ เลือกตั้ง เศรษฐกิจ หรือพัฒนาประเทศ

## แค็ตตาล็อกเสนอสำหรับ OBT
| สินค้า | ราคาเสนอ THB | ประโยชน์ | ความเป็นธรรม |
|---|---:|---|---|
| เสื้อผ้า/หมวก/ชุดอาชีพแบบแฟชั่น | 29–99 | เปลี่ยนรูปลักษณ์ | ไม่มี stat |
| กรอบโปรไฟล์/ป้ายชื่อ/ท่าแสดงความรู้สึก | 29–89 | แสดงตัวตน | ไม่มีผลคะแนน |
| ชุดเฟอร์นิเจอร์บ้าน | 49–149 | ตกแต่งพื้นที่ส่วนตัว | ไม่มีช่องผลิตเพิ่ม |
| ธีมสวนและป้ายร้านตกแต่ง | 79–199 | ความสวยงาม | ไม่เพิ่มยอดขาย NPC |
| Founder Supporter Pack (ครั้งเดียว) | 149 | ป้ายที่ระลึก+ชุด+เฟอร์นิเจอร์ | ไม่เพิ่มสิทธิ์พิเศษ |
| Customization presets (อาจรวมในแพ็ก) | ไม่กำหนด | เซฟชุด/สีบ้าน/การจัดหน้า UI | ไม่ลดเวลาเดินทาง/การผลิต |

**อย่าขาย:** เงินในเกม/ไอเทมผลิต, เครื่องมือทำงานเร็วกว่าฟรี, slots ฟาร์ม/โรงงานเพิ่ม, ลดเวลาสอบ, เพิ่มคะแนนสอบ, ระดับอาชีพ, prestige, ตัวช่วยหาเสียง/คะแนนเลือกตั้ง, ความสามารถขับเคลื่อนงบเมือง, AI gameplay advisor ที่ให้ข้อมูลลับเหนือคนฟรี, บริการย้ายประเทศโดยไม่ผ่านเกณฑ์

## หลักการออกแบบรายการสินค้า
- แสดงราคาบาทเต็ม ไม่เน้นแพ็กเหรียญพรีเมียมที่ทำให้มองราคาไม่ออก
- ไม่มี loot box ชำระเงินจริง / ไม่มี RNG ที่ซื้อเพื่อความได้เปรียบ
- ไม่มี FOMO แบบกดดัน, streak punishment, หรือระบบที่ต้องเข้ามาตอนดึก
- ปิดส่วนร้านหากยังไม่มีระบบรับเงินที่ปลอดภัยและเงื่อนไขคืนเงิน
- ดูแลความเป็นส่วนตัวและการสื่อสารระหว่างผู้เล่น; มีปุ่ม report/block และ moderation ก่อน OBT ออนไลน์

## คิดต้นทุนและจุดคุ้มทุน (สูตร ไม่ใช่ใบเสนอราคาปัจจุบัน)
- `monthly_fixed_cost = hosting + database_base + monitoring + domain + backups + baseline_moderation`
- `monthly_variable_cost = online_minutes * realtime_cost_per_min + DB_ops * db_cost + AI_tokens * ai_cost + bandwidth + payment_fees`
- `net_revenue_per_order = price - taxes_or_VAT_if_applicable - processor_fee - refund_reserve - platform_fees`
- `break_even_orders = ceil((fixed_cost + variable_cost) / average_net_revenue_per_order)`

**ตัวอย่างสมมติ (ไม่ใช่ราคาจริง):** หากค่าใช้จ่ายเดือนหนึ่งเท่ากับ 6,000 บาท และรายได้สุทธิต่อคำสั่งซื้อเฉลี่ย 75 บาท ต้องมี ~80 คำสั่งซื้อ/เดือนถึงจุดคุ้มทุน จำนวนที่แท้จริงต้องแทนค่าจากใบแจ้งหนี้และผู้ให้บริการชำระเงินจริง

## Cost Controls
1. NPC พฤติกรรมพื้นฐานใช้ rules/FSM ไม่เรียก AI ทุกตัวทุกวินาที
2. หากใช้ AI ต้องกำหนด token per session, daily budget, cache, fallback dialogue และแยก AI จากธุรกรรม/การโหวต
3. Server ส่งเฉพาะ entities ใกล้ผู้เล่น และ tick NPC แบบ aggregate นอกจอ
4. Monitor MAU/DAU, peak concurrent players, bandwidth, writes/player/day, AI cost/active user
5. ตั้ง spending alert และ hard limits กับบริการที่รองรับ ก่อนเปิด OBT

## Payment implementation gate (หลังมีเซิร์ฟเวอร์)
- ผู้ใช้กดซื้อ → provider checkout → verified webhook/server receipt → idempotent entitlements ledger → client reads granted cosmetics
- ตรวจ server-side ผู้ซื้อ, SKU, currency, paid amount, unique order ID, signature, refunds
- ไม่ใช้ localStorage เป็นหลักฐานซื้อ และไม่เชื่อค่า paid=true จาก client
- รองรับคืนเงินหรือ revoke cosmetic entitlement ตามกฎอย่างเป็นธรรม

## v0.8: โครงสร้างในโค้ด (`src/shop.js`)
- `CATALOG` สินค้าพร้อมราคาบาทเต็ม แบ่ง 4 หมวด: แฟชั่น/ทรงผม, เฟอร์นิเจอร์/ของตกแต่ง, Supporter Pack, ความสะดวก
- `effects` อนุญาตเฉพาะ outfit, hairColor, decor, frame, badge, title, wardrobeSlots, blueprintSlots — `validateCatalog()` และ unit test ปฏิเสธ coins/xp/votes/examPass/leader/speedUp ฯลฯ
- `purchase()` คืน `payments_disabled` เสมอ ไม่มีการตัดเงิน · `grantMockEntitlement()` ใช้ได้เฉพาะ `?dev=1` และติดป้าย `source:'mock-test'` เพื่อล้างก่อน OBT
- สินค้าที่ยังไม่มีของในเกมติดป้าย `planned` (ปุ่มทดสอบปลดล็อกไม่ทำงาน)
- ขั้นต่อไปตาม Payment implementation gate ด้านบน: server entitlement ledger + webhook ที่ตรวจลายเซ็น

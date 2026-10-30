# HANDOFF TO CLAUDE — Village to Nation v0.7

โปรดอ่าน `README.md` ก่อนแก้ไฟล์ ภารกิจสำคัญคือรักษาระบบเกมจาก v0.6 และห้องแต่งตัว v0.7 ให้ทำงานต่อเนื่อง

## ความสามารถที่มีแล้ว
1. เมื่อไม่พบ `state.character` ที่ถูกต้อง ให้แสดงห้องแต่งตัวก่อนเข้าเกม ไม่มีการข้ามขั้นตอน
2. ภาษา UI `TH/EN`, ตั้งชื่อผู้เล่นที่รองรับทั้งภาษาไทย/อังกฤษ, ตรวจชื่อ 2–20 graphemes และป้องกัน markup
3. เลือก hair `pony/bob/short` และ outfit `cream/blue/green/red` ดูตัวอย่าง 4 ทิศ
4. ใช้ sprite atlas เดียวกันในห้องแต่งตัวและเกม โดยแอนิเมชันเดินใช้ row 0=down,1=left,2=right,3=up; column 0=idle,1–3=step
5. เซฟ `state.character` ร่วมกับเซฟเกมใน `localStorage['v2n-inline-06']` โดยไม่รีเซ็ตความคืบหน้า
6. เมนู `👕 แต่งตัว` แก้ชื่อ ผม และสีชุดได้ภายหลัง (Cancel ไม่บันทึก)
7. โครงสร้างไฟล์ 4×4 ช่องละ 64×64 px ภาพจริง PNG RGBA alpha, ชุด atlases 12 แบบ และแยก layer

## สิ่งที่ยังต้องปรับก่อน OBT
- ปรับ Sprite รายเฟรมด้วย pixel editor: ตัวละครจาก AI ยังไม่ได้ยืนยันความสมบูรณ์ด้านเฟรม, layering หลัง/หน้า, และรายละเอียดการเดิน
- สร้าง Modular system แบบ layer-by-layer จริง (body/face/eyes/hair-front/hair-back/top/pants/shoes/headwear), การสร้างชุดสีตอนนี้เป็นการ pre-compose 12 แบบ
- สร้างชุดเสื้อผ้าอาชีพและการเปลี่ยนชุดเมื่อผู้เล่นเลื่อนตำแหน่ง
- กำหนด art specification/anchors เดียวกัน, เพิ่มชุด NPC ที่ตรงกับสเกลตัวเอก
- ซิงก์สถานะ character เป็น server-authoritative เมื่อทำบัญชีออนไลน์ ตรวจชื่อซ้ำและ moderation ฝั่งเซิร์ฟเวอร์ ไม่เชื่อ localStorage ในเกมออนไลน์
- คงกฎ Pay-to-Win-free ในสินค้า OBT: ขาย cosmetic/convenience เท่านั้น ห้ามขายคะแนนเลือกตั้งหรือสถานะผู้นำ

## วิธี build หลังแก้ asset

```bash
python build_assets.py
python integrate.py
```

เปิด `index.html` จากเว็บเซิร์ฟเวอร์ที่รองรับ static assets หรือเปิด `play_standalone.html` แบบไฟล์เดียว

## Testing

ทดสอบ Chromium emulation 844×390, 390×844, 1220×760. ผ่านการตั้งชื่อไทย, เปลี่ยนทรงผม, บันทึก, mock localStorage reload, กลับเข้าแต่งตัว, ตั้งชื่ออังกฤษ, ชื่อไม่ถูกต้อง และไม่พบ JavaScript errors ใน flow ที่ทดสอบ

อย่าทำให้ UI เดิมของเกมหายไป ระวัง script game เป็น IIFE ที่มี state `s` และ `save()` อยู่ภายใน หากเปลี่ยน engine ควรแยก state, renderer และ creator modules เป็นไฟล์อย่างเป็นระบบ

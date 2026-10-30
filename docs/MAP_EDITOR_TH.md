# V2N Map Maker — แอปสร้างแมพ (v0.26)

เปิด: `editor/index.html` (บนเว็บ: https://seeker6131.github.io/village-to-nation/editor/)

## ใช้ทำอะไร
ปูพื้นเป็นช่อง วาดถนน วางบ้าน/ตึก/ต้นไม้ นำเข้ารูปจาก GPT (ลบพื้นม่วงแดง ตัดชีตเป็นชิ้นอัตโนมัติ) ใส่หมุดบอกที่ดินผู้เล่น จุดเกิด ทางออก โซน และโน้ตถึง Claude แล้วกด 💾 ได้ไฟล์ `.v2nmap.json` ส่งให้ Claude ทำเป็นแมพในเกม

## รูปแบบไฟล์ (format `v2n-map@1`)
- `width`, `height` เป็นช่อง · 1 ช่อง = 16 px · (0,0) มุมซ้ายบน · x ไปขวา y ลงล่าง
- `groundRows[y][x]` = ตัวอักษร → `groundKey` → ชนิดพื้น (`terrains`)
- `roadRows[y][x]` = ตัวอักษร → `roadKey` (`.` = ไม่มีถนน) → ชนิดถนน (`roadTypes`)
- `objects[]`: `asset`, `assetName`, `kind`, `x`, `y` = มุมซ้ายบนของฐาน, `fw`×`fh` = ฐาน (ส่วนที่ชน), `tw` = ความกว้างรูปเป็นช่อง, `flip`, `label`
  รูปวางกึ่งกลางฐาน ยืนบนขอบล่างของฐาน
- `markers[]`: `type` (spawn / lot / public / gate / npc / zone / note), `x`, `y`, `w`, `h`, `label`
- `assets[]`: `src` = `game:<sprite>` (รูปในเกม assets/v10/<sprite>.webp) หรือ data URL (รูปที่นำเข้าเอง), `kind`, `tw`, `fw`, `fh`, `pw`×`ph` = ขนาดต้นฉบับ
- `summary` = นับจำนวนพื้น ถนน วัตถุ

## วิธีแปลงเข้าเกม (สำหรับ Claude)
1. พื้น → `world.js` ground (grass/meadow/forest/dirt/sand/farm/rocky/water/deep) · ถนน → tier roads / lot lanes ใน `villageLayout.js` (ถนนเกมต้องเริ่มช่องคู่ กว้าง 2)
2. บ้าน + หมุด `lot` → slots / playerLots · อาคารอื่น → props / cityPlan · ต้นไม้ → nodes ที่ล็อกตำแหน่ง
3. รูปที่นำเข้าเอง → บันทึกเป็นไฟล์ใน source_art แล้วรัน `scripts/ingest-art.py`

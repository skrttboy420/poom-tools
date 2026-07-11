@AGENTS.md

# CLAUDE.md — poom-tools

> ไฟล์นี้ให้ session ต่อ ๆ ไปอ่านแล้วเข้าใจ context เองได้เลย ไม่ต้องเล่าใหม่
> อ่านให้จบก่อนเริ่มทำงานทุกครั้ง
> หมายเหตุ: repo นี้ใช้ **Next.js 16 + React 19** — มี breaking changes จาก Next 14/15
> (`cookies()`/`headers()` เป็น async, ฯลฯ) ก่อนเขียนโค้ดให้เช็ค `node_modules/next/dist/docs/`

---

## 1. ใครคือเจ้าของ repo นี้

- ชื่อ **ภูม (Poom)** — เดฟที่ดูแลระบบ **Pacred**
- **Pacred** = เว็บ import-export / cargo / logistics (port มาจากระบบเก่า **PCS Cargo**)
  - stack: Next.js + Supabase
  - ภูมทำงานทุกวันกับข้อมูล forwarder / ฝากนำเข้า / ตู้ (container) / tracking
- ภาษาที่คุยกับภูม: **ภาษาพูดไทยเสมอ**

---

## 2. repo นี้คืออะไร

**poom-tools = เครื่องมือส่วนตัวของภูม (personal dev toolbox)**

- **แยกขาดจากงานหลัก Pacred อย่างสมบูรณ์** — คนละ GitHub, คนละ Supabase project,
  ไม่มีอะไรผูกกับ pacred-web เลย
- เอาไว้ช่วยงานเดฟของภูมเอง: เทียบข้อมูล / จัดเรียง-clean ข้อมูลก่อนเอาเข้า Pacred /
  probe DB / reconcile

**แนวคิดหลัก:** เว็บนี้ = **ห้องเตรียม** · Pacred = **ประตูที่เขียนจริง**

---

## 3. เป้าหมายหลักของ tool (use-case จริง)

### งาน #1 = "Reconcile / เทียบข้อมูล" (ทำก่อน — คือ MVP)

flow:
1. โยนไฟล์เข้ามา — Excel packing list (จากพี่แต้ม/iTAM) หรือ export จาก MOMO
   หรือ export จาก Pacred
2. parse → จัดเรียง / clean
3. เทียบว่าตรงกันมั้ย โดยเทียบฟิลด์:
   - เลขพัสดุ (**tracking**)
   - น้ำหนัก (**kg**)
   - ปริมาตร (**CBM / คิว**)
   - จำนวนกล่อง
   - เลขตู้ (**container**)
4. ไฮไลต์ตัวที่ **ตรง / ไม่ตรง / หายไป / ฝั่งไหนมากกว่า**
5. export ผลออกเป็นไฟล์ (CSV/JSON) หรือ paste-format ที่พร้อมเอาไปวางเข้า Pacred

**ปัญหาจริงที่ต้องแก้:** MOMO API ชอบทิ้งข้อมูล 30-40% → tracking หาย / น้ำหนักเป็น 0
→ tool ต้องจับให้เจอ

**หมายเหตุ format:** format ของ Excel พี่แต้ม + format ที่ Pacred ต้องการ
เดี๋ยวภูมจะเอาตัวอย่างจริงมาให้ทีหลัง → ตอนนี้ทำให้ **ยืดหยุ่น (map คอลัมน์เองได้)** ไว้ก่อน

### roadmap (ทำทีหลัง)

- **DB probe runner** — read-only, saved queries
- **table-health** — หา 0-row dead twin (ตารางร้างที่ถูกสร้างซ้ำ)
- **migration tracker** — เทียบ dev vs prod, บอก next free number
- **monitor / alert**

---

## 4. 🔴 กฎความปลอดภัย (ห้ามข้ามเด็ดขาด)

1. **ห้ามเขียน DB ของ Pacred ตรง ๆ เด็ดขาด**
   - tool นี้ทำงานบน **ไฟล์ + staging table ใน Supabase ของภูมเอง** เท่านั้น
   - แล้ว export ออกไป ให้ภูมเป็นคนเอาไปอัพเข้า Pacred ผ่าน UI ของ Pacred เอง
     (Pacred มี guard/validation เขียนของมันเอง)
2. **ห้ามเอา key/credential ของ Pacred (โดยเฉพาะ prod / service-role) มาใส่ใน tool นี้**
   - เริ่มแบบ **file-based** ก่อน = ไม่ต้องต่อ DB Pacred เลย
   - ทีหลังถ้าจะต่อ → ต่อ **Pacred DEV แบบ read-only เท่านั้น**
3. **secret อยู่ใน `.env.local` เท่านั้น** · ห้าม commit · ต้องมี `.gitignore` กัน

---

## 5. Stack + setup

- **Next.js** (App Router, TypeScript) + **Tailwind**
- **Supabase ของภูมเอง** (DB + auth + storage สำหรับไฟล์ที่อัพ)
  - env ที่ใช้:
    - `NEXT_PUBLIC_SUPABASE_URL`
    - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
    - `SUPABASE_SERVICE_ROLE_KEY` (server เท่านั้น — ห้ามหลุดไป client)
- **xlsx (SheetJS)** — parse Excel · **ลงจาก CDN ของ SheetJS (0.20.3)** ไม่ใช่ npm
  (`npm i https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`) → เวอร์ชัน npm 0.18.5 มี vuln + อ่านไฟล์ MOMO ไม่ได้
- **fflate** — unzip/zip zip container เอง ใช้ซ่อมไฟล์ xlsx ที่ header เพี้ยน (เช่น MOMO)
- **papaparse** — parse CSV
- **auth คนเดียว** — แค่ภูมคนเดียว (password เดียว หรือ Supabase auth เฉพาะ account ภูม)
- **deploy:** Vercel (private) หรือรัน localhost ก็ได้
- **GitHub:** `git@github.com:skrttboy420/poom-tools.git`

---

## 6. สไตล์การทำงานที่ภูมชอบ (ทำตามนี้)

- อธิบายเป็น **ภาษาพูดไทย** เสมอ
- ทำ **ทีละสเต็ป** อย่าทำทีเดียวหมด · ถ้าไม่แน่ใจ/มีทางเลือกสำคัญ **ถามก่อน**
- **ห้ามทำงานบัค ห้ามทำงานหาย** · **verify ก่อนเคลมว่าเสร็จ**
  (เช็คว่าข้อมูล render/query คืนแถวจริง ไม่ใช่แค่ build ผ่าน)
- ก่อน commit: ให้ **gate เขียว** (tsc/lint) · push ขึ้น GitHub ตอน save-point
- ตอนจบงานสำคัญ: **อัพเดต CLAUDE.md ให้สด** แล้ว commit (เป็น save-point)

---

## 7. วิธีรัน + ล็อกอิน

- `npm run dev` → เปิด http://localhost:3000
- ล็อกอิน: **email `pasit@poom-tools.local`** / รหัสผ่านที่ตั้งไว้ (ฟอร์ม prefill email ให้แล้ว)
- สร้าง/รีเซ็ต account: `node --env-file=.env.local scripts/create-user.mjs`
  (อ่าน `SEED_USER_EMAIL` / `SEED_USER_PASSWORD` จาก `.env.local`)
- smoke test ว่าล็อกอินได้: `node --env-file=.env.local scripts/smoke-auth.mjs`

โครงไฟล์สำคัญ:
- `src/lib/supabase/{client,server,admin}.ts` — Supabase clients (browser / server / service-role)
- `src/proxy.ts` — auth guard (Next 16 ใช้ `proxy.ts` แทน `middleware.ts`)
- `src/app/login/page.tsx` · `src/app/page.tsx` · `src/components/LogoutButton.tsx`

## 8. สถานะปัจจุบัน (อัพเดตทุก save-point)

- 2026-07-07 — STEP 1 เสร็จ: `CLAUDE.md`
- 2026-07-07 — STEP 2 เสร็จ: scaffold Next.js 16 + Tailwind v4 + Supabase auth (คนเดียว)
  · verify แล้ว: tsc/lint เขียว, `/` เด้ง login เมื่อยังไม่ auth, ล็อกอินจริงผ่าน · push ขึ้น GitHub
- 2026-07-07 — STEP 3 (MVP Reconciler) เสร็จ + verify แล้ว: หน้า `/reconcile` ทำงานทั้งหมด **client-side**
  (ยังไม่แตะ staging table — ทำเป็น phase หน้า)
  · **แก้ vuln xlsx แล้ว**: ย้ายไป SheetJS 0.20.3 จาก CDN (npm audit เหลือแค่ postcss-via-next)
  · **แก้ปัญหาไฟล์ MOMO ได้แล้ว** — ไฟล์ MOMO เป็น zip ที่ local header อันแรกเพี้ยน (ขึ้นต้นไม่ใช่ `PK`)
    ทุก entry เป็นแบบ STORED (ไม่บีบอัด) · SheetJS อ่านตรง ๆ ได้ขยะ →
    **fallback: `fflate.unzipSync` (อ่านผ่าน central directory ที่ยังดี) → `zipSync` → ให้ xlsx อ่านซ้ำ**
    logic อยู่ที่ `src/lib/reconcile/parse.ts` (`readWorkbookRobust`)
  · โครง lib: `src/lib/reconcile/{types,parse,detect,diff,export,columns}.ts` (pure, ไม่พึ่ง DOM/DB)
    - parse = robust reader (xlsx/csv + fflate repair) · detect = เดา header row + auto-map คอลัมน์
    - diff = engine เทียบ (key join, numeric/text compare + tolerance) · export = CSV/JSON
  · UI `src/app/reconcile/page.tsx`: อัปโหลด 2 ฝั่ง → เลือกแถว header เอง → **map คอลัมน์ยืดหยุ่น**
    (เพิ่ม/ลบ field เองได้ · auto-guess ให้ก่อน) → กด "เทียบข้อมูล" → ตารางไฮไลต์สี
    (เขียว=ตรง เหลือง=ไม่ตรง ฟ้า=เฉพาะA แดง=เฉพาะB) + filter + ปุ่ม export
  · verify ใน Chrome จริง: (1) CSV สังเคราะห์ A/B → ครบ 4 สถานะถูกต้อง + export CSV ถูก
    (2) ไฟล์ MOMO จริง → badge "ซ่อมไฟล์เพี้ยนแล้ว" ขึ้น, header เดาได้แถว 5, map Tracking/Weight/CBM ถูก
    · ไม่มี console error
  · **โครงสร้าง 2 format ที่รู้แล้ว:**
    - พี่แต้ม (iTAM): header อยู่แถว 0, container ต่อแถว (คอลัมน์ 0, มีเฉพาะแถวแรก), tracking คอลัมน์ 9
    - MOMO: header อยู่แถว 5, มี summary block แถว 2-3 (CONTAINER NAME อยู่ตรงนี้ ไม่ใช่ต่อแถว),
      มีแถว subtotal/grand total ปน (tracking ว่าง → diff engine ข้ามให้อัตโนมัติ), tracking คอลัมน์ 7
- 2026-07-07 — **fix Reconciler result table**: ตารางผลไม่เลื่อน/ไม่กางทุกแถว → ครอบด้วยกล่อง
  `max-h-[65vh] overflow-auto` + `thead` เป็น `sticky top-0` (หัวตารางค้าง) + ตัวนับ "แสดง N แถว"
  · verify ใน Chrome: เลื่อนดูครบทุกแถว หัวตารางไม่หาย (commit 66cdd2b)
- 2026-07-07 — **STEP 4 (Gap Finder) เสร็จ + verify แล้ว**: หน้า `/gap` — เครื่องมือ **ตรวจไฟล์เดียว**
  หาข้อมูลหาย/เป็น 0 (ตอบโจทย์ปัญหา MOMO ทิ้งข้อมูล 30-40%) · client-side ล้วน ไม่แตะ Supabase
  · engine `src/lib/reconcile/gap.ts` (pure): `findGaps(dataRows, checks, opts)` → หาแต่ละแถว/ช่อง:
    `missing-key` (tracking หาย) · `zero`/`blank`/`invalid` (ตัวเลข 0/ว่าง/ผิดรูป) · `dup-key` (tracking ซ้ำ)
    - ตัดแถวว่างทั้งแถวออกเอง (isDataRow) · เรียงแถวหนักสุดขึ้นก่อน · `gapToCsv` export เฉพาะแถวมีปัญหา
  · UI reuse parse/detect/columns ของ reconcile: อัปโหลด 1 ไฟล์ → เลือก header → ติ๊กฟิลด์ที่จะตรวจ
    (container ปิด default กันสัญญาณลวง) → chips สรุปแยกชนิด + filter + ตารางไฮไลต์ช่องเสีย + CSV
  · verify Chrome จริง 2 ไฟล์: (1) MOMO → 5 แถวจริง, จับ missing-tracking + blank ถูก
    (2) GZE 842 แถว (iTAM) → ตัดแถวว่าง 718 เหลือ 124 แถวจริง, จับ dup ถูก (`KY...-25` ซ้ำ 70 ครั้ง),
    grand-total row (ไม่มี tracking) sort ขึ้นบนสุด · ไม่มี console error
  · เพิ่มลิงก์ในหน้าหลัก `src/app/page.tsx`
- 2026-07-07 — **fix Gap Finder: ปิดตรวจ tracking ซ้ำเป็น default** (commit 31d6cca)
  · ภูมชี้ว่า packing list ปกติ 1 tracking แตกได้หลายกล่อง (หลายแถว, มี `-1`/`-25` หรือ `1/(จำนวนกล่อง)`)
    → tracking ซ้ำ = เรื่องปกติ ไม่ใช่ error · `checkDupKey` default = false, label บอกชัดว่าเปิดเฉพาะไฟล์ 1 tracking/แถว (เช่น MOMO)
  · verify: GZE จาก 100 แถวมีปัญหา → เหลือ 1 (แค่ grand-total row), clean 123/124 (99%)
- 2026-07-07 — **รื้อหน้าแรกใหม่ = intent-based Tool Hub** (ตามบรีฟ `บรีฟเพิ่มเติม.txt`) + verify แล้ว
  · แนวคิด: เลิกแบ่งเมนูตามชนิดไฟล์ (PDF/Excel/AI) → แบ่งตาม **"ผู้ใช้อยากทำอะไร"** + ช่องค้นหาใหญ่ "วันนี้คุณอยากทำอะไร?"
  · `src/lib/tools/registry.ts` (data-driven): `CATEGORIES` 10 หมวด (เรียงตามที่ภูมใช้จริง: เทียบ🔍/จัดระเบียบ🧹/โลจิสติกส์📦/
    excel📊/เอกสาร📄/รูป🖼️/ai🤖/ออฟฟิศ💼/dev💻/คำนวณ🧮) + `TOOLS` = 2 ready (reconcile→/reconcile, gap→/gap) + ~35 soon (seed จากบรีฟ)
    - helper: `searchTools(q)` แตก query เป็น term แล้ว match ทุก term กับ name+desc+keywords · `readyTools()` · `toolsByCategory()`
  · `src/components/ToolHub.tsx` (client): hero + search (autoFocus) → โหมดค้นหาโชว์ grid ผลลัพธ์ / โหมดปกติโชว์ รายการโปรด→พร้อมใช้→แต่ละหมวด
    - **favorites** เก็บใน localStorage ผ่าน `useSyncExternalStore` (เลี่ยง set-state-in-effect ของ React 19 + กัน hydration mismatch)
    - การ์ด ready คลิกทั้งใบ (Link overlay) + hover ยกตัว/เงา · การ์ด soon เป็น dashed opacity-70 · ปุ่มดาว ★/☆ toggle
  · `src/app/page.tsx`: server component เก็บ auth guard ไว้เหมือนเดิม แล้ว render `<ToolHub/>`
  · verify Chrome จริง: search "cbm"→1 รายการ (การ์ด CBM), กดดาว Gap Finder → เกิดหมวด ⭐ รายการโปรด + persist ข้ามการ reload,
    คลิกการ์ด Reconciler → ไป /reconcile · **ไม่มี console error / ไม่มี hydration warning** (โหลดใหม่แล้วเช็ค console สะอาด)
  · gate เขียว (tsc + lint) ก่อน commit
- 2026-07-07 — **เครื่องมือที่ 3 พร้อมใช้: คำนวณ CBM** (`/cbm`) — soon → ready ตัวแรกตามแผนทยอยเปิด
  · engine `src/lib/cbm/calc.ts` (pure): `computeLine`/`computeTotals`/`cbmToCsv` · หน่วย cm/m/inch (แปลงเป็นเมตรก่อนคูณ)
    - CBM = (กว้าง×ยาว×สูง เมตร) × จำนวนกล่อง · น้ำหนักเชิงปริมาตร air = (กxยxส cm)/divisor (6000/5000) × qty
    - W/M ทะเล = max(น้ำหนักจริง, CBM×1000)
  · UI `src/app/cbm/page.tsx` (client, ไม่ต้องอัปไฟล์): ตารางกรอกหลายรายการ (เพิ่ม/ลบแถว) → live totals + คัดลอกสรุป + export CSV
  · verify Chrome จริง: กรอก A(40×30×20 ×10)=0.24, B(50×50×50 ×2 น.15)=0.25 → รวม 0.49 CBM, 12 กล่อง, น้ำหนัก 30,
    ปริมาตร air÷6000 = 81.67, W/M = 490 · ตรงกับคำนวณมือทุกช่อง · export/copy ไม่ error · การ์ดหน้าแรกขึ้น "พร้อมใช้"
- 2026-07-07 — **เครื่องมือที่ 4 พร้อมใช้: Data Cleaner / normalizer** (`/clean`) — ตอบ workflow "clean ก่อนเข้า Pacred"
  · engine `src/lib/clean/clean.ts` (pure): `findCleanResult(dataRows, opts)` → operations:
    trim ช่องว่าง · ยุบช่องว่างซ้ำ · ลบแถวว่างทั้งแถว · จัดรูปตัวเลข (ลบ comma แล้วแปลงเป็น number) ·
    normalize tracking (trim+พิมพ์ใหญ่+ตัดช่องว่างใน) · ลบแถวซ้ำตาม key · คืน stats + ตัวอย่างการแก้ (cap 500) · `cleanToCsv`
    - **ลบแถวซ้ำ = ปิด default** (บทเรียนเดียวกับ Gap): packing list ปกติ 1 tracking หลายกล่อง/หลายแถว → ลบ = ข้อมูลหาย
  · UI `src/app/clean/page.tsx` (client): reuse parse/detect/columns → อัปโหลด → เลือก header → ติ๊ก operations +
    auto-detect คอลัมน์ key/ตัวเลข (แก้เองได้) → ผลลัพธ์ = สรุป (เข้า→ออก, ลบว่าง/ซ้ำ, แก้กี่ช่อง) + chips แยกชนิด +
    ตารางข้อมูลหลัง clean (sticky header) + ตัวอย่างก่อน→หลัง + ดาวน์โหลด CSV
  · verify Chrome จริง (CSV เลอะ 5 แถว): "  ky001  "→KY001, "1,234.5"→1234.5, "0.24 "→0.24, " hello  world "→"hello world",
    ลบแถวว่าง 2, แก้ 7 ช่อง (ยุบ1/ตัวเลข3/key3) · dedup ปิด = KY001-1 + KY002 ซ้ำ อยู่ครบ · เปิด dedup = ลบ KY002 ซ้ำ 1 (KY001-1 ไม่ถูกนับซ้ำกับ KY001) · export ไม่ error
- 2026-07-07 — **เครื่องมือที่ 5 พร้อมใช้: แปลงหน่วย** (`/convert`) — quick-win logistics
  · engine `src/lib/convert/units.ts` (pure): 3 หมวด (น้ำหนัก base kg / ความยาว base m / ปริมาตร base m³=CBM)
    แต่ละหน่วยเก็บ `factor` (= ค่าเทียบหน่วยฐาน) · `convert(v,from,to)` = v*from/to · `convertToAll` แปลงเป็นทุกหน่วยพร้อมกัน
    · `formatResult` ปรับทศนิยมตามขนาด (เล็กมาก 8 ตำแหน่ง, ใหญ่ 2)
  · UI `src/app/convert/page.tsx` (client): แท็บหมวด → พิมพ์ค่า + เลือกหน่วยต้นทาง → ตารางโชว์ทุกหน่วยสด ๆ (ไฮไลต์แถวต้นทาง)
  · verify Chrome จริง: 1kg=1000g/0.001ton/2.2046lb/35.274oz · 1inch=2.54cm/25.4mm/0.0833ft · 1ft³=0.028317CBM/28.317L · ถูกทุกค่า
- 2026-07-07 — **ฟีเจอร์ drag-drop upload เสร็จ + verify แล้ว** (ลดขั้นตอน: ลากไฟล์จาก Explorer มาวางได้เลย)
  · คอมโพเนนต์ใช้ร่วม `src\components\FileDropzone.tsx` (client): `role="button"` + tabindex (คลิก/Enter/Space เปิด dialog),
    handle `onDragOver`/`onDragLeave`/`onDrop` มี state `over` ไฮไลต์เขียว (emerald) + สลับ emoji 📄→📥,
    input file ซ่อนไว้ · เคลียร์ `e.target.value` หลัง onChange เพื่อเลือกไฟล์เดิมซ้ำได้
  · wire เข้าทั้ง 3 เครื่องมือไฟล์ แทน `<label>+<input type=file>` เดิม: `/gap`, `/clean`, `/reconcile` (SideCard ทั้งฝั่ง A/B)
    · accept `.xlsx,.xls,.csv,.tsv,.txt` · label โชว์ชื่อไฟล์ปัจจุบันเมื่อมีไฟล์แล้ว
  · verify Chrome จริงทั้ง 3 หน้า (สร้าง File+DataTransfer แล้ว dispatch DragEvent): dragover → ไฮไลต์ emerald + emoji 📥 ขึ้น,
    drop → parse ไฟล์เข้าจริง (header preview + auto-detect ขึ้นครบ), reconcile รับ drop ได้ทั้งฝั่ง A และ B · console สะอาด ไม่มี error
- 2026-07-07 — **เครื่องมือที่ 6 พร้อมใช้: จัดรูปแบบ JSON** (`/json`) — dev quick-win (เช็ค payload MOMO API / Supabase)
  · engine `src\lib\json\format.ts` (pure): `formatJson(input, indent, sortKeys)` / `minifyJson(input, sortKeys)` → `JsonResult` (ok/error)
    - indent: "2"|"4"|"tab" · `sortKeysDeep` เรียง key ทุกชั้น (array คงลำดับ) · error ดึงบรรทัด/คอลัมน์จากข้อความ JSON.parse
      (รองรับทั้ง "(line L column C)" ใหม่ + "position N" เดิม แล้ว map เป็นบรรทัด/คอลัมน์เอง) · stats: root type/จำนวน key ชั้นบน/key ทั้งหมด/ความลึก/ขนาด
  · UI `src\app\json\page.tsx` (client, ไม่ต้องอัปไฟล์): 2 ช่อง (วาง↔ผล) live · ปุ่มจัดรูป/ย่อ + เลือก indent + เรียง key + ตัวอย่าง/ล้าง/คัดลอก/ดาวน์โหลด .json
    · JSON เสีย = โชว์กล่องแดง + บอกบรรทัด/คอลัมน์
  · verify Chrome จริง: `{"b":2,"a":1,"nested":{"z":[3,1,2]}}` → beautify 2 ช่องถูก, stats (key ชั้นบน 3/ทั้งหมด 4/ลึก 4) ถูก,
    เรียง key → a,b,nested (array คงเดิม), minify → บรรทัดเดียว, JSON comma หาย → "ราวบรรทัด 4 คอลัมน์ 3" ถูก · console สะอาด
- 2026-07-07 — **ฟีเจอร์ปุ่มสลับธีม dark/light เสร็จ + verify แล้ว** (ตามบรีฟ — เลิกตาม system อย่างเดียว)
  · เปลี่ยน dark mode เป็น **class-based**: `globals.css` เพิ่ม `@custom-variant dark (&:where(.dark, .dark *));`
    + ย้าย dark CSS vars จาก `@media (prefers-color-scheme)` ไปที่ `.dark` (class บน `<html>` เป็น source of truth)
  · `src\components\ThemeToggle.tsx` (client): ปุ่มลอยมุมขวาล่าง (`fixed bottom-4 right-4`) วน 3 สถานะ ตามระบบ🖥️→สว่าง☀️→มืด🌙
    - ใช้ `useSyncExternalStore` (อ่าน localStorage `poom-theme`) เลี่ยง hydration mismatch + กฎ set-state-in-effect ของ React 19
    - โหมด system: มี `matchMedia('change')` listener ตามธีม OS แบบสด · `applyTheme` resolve system→มืด/สว่าง แล้ว toggle class `.dark`
  · `src\app\layout.tsx`: ใส่ **inline blocking script** ใน `<head>` (อ่าน localStorage + resolve system ก่อน paint = กันจอกระพริบ/FOUC)
    + `suppressHydrationWarning` บน `<html>` (เพราะ script แก้ class ก่อน React hydrate) + render `<ThemeToggle/>` ระดับ layout (โผล่ทุกหน้า)
  · verify Chrome จริง (ระบบตั้ง dark): เริ่มต้น system→`.dark` bg มืด (พฤติกรรมเดิมคงอยู่), สว่าง→override เป็นขาวแม้ระบบมืด,
    มืด→บังคับมืด, persist หลัง reload (stored 'light' ยังสว่าง ไม่ flash), **ไม่มี console error / hydration warning** · คืน default (ลบ key) หลังเทส
- 2026-07-07 — **เครื่องมือที่ 7 พร้อมใช้: ลบข้อมูลซ้ำ ♻️** (`/dedup`) — ตอบปรัชญา "ห้ามข้อมูลหาย"
  · engine `src\lib\dedup\dedup.ts` (pure): `findDuplicates(dataRows, opts)` → `DedupResult` (groups + uniqueRows + stats)
    - 2 โหมด: **exact-row** (ทั้งแถวเหมือนเป๊ะ — ปลอดภัยสุด) · **by-columns** (ซ้ำตามคอลัมน์ที่เลือก เช่น tracking)
    - `keep: first|last` (เก็บแถวแรก/สุดท้ายของกลุ่ม) · `caseInsensitive`/`trimWhitespace` (normalize ก่อนเทียบ) ·
      `ignoreEmptyKey` (แถวคีย์ว่าง = ไม่นับซ้ำ กัน subtotal/grand-total โดนจับ) · SEP `` กัน signature ปนกัน
    - **ปรัชญา:** โชว์กลุ่มที่ซ้ำให้ดูก่อนแล้วค่อยเลือกลบ (ไม่ลบเงียบ ๆ) · `dedupToCsv` export เฉพาะ uniqueRows
  · UI `src\app\dedup\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → เลือก header → เลือกโหมด
    (by-columns โชว์ chips คอลัมน์ + เตือน amber เรื่อง packing list 1 tracking หลายกล่อง) → ตั้ง keep/normalize →
    ผลลัพธ์ = chips สรุป (แถวเข้า/กลุ่มซ้ำ/แถวที่จะลบ/เหลือหลังลบ/ข้ามคีย์ว่าง) + การ์ดรายกลุ่ม (เขียว=เก็บ แดง=ลบ ขีดฆ่า) + ดาวน์โหลด CSV
  · verify Chrome จริง (CSV `tracking,box,weight` 5 แถวจริง + ซ้ำ): exact-row → กลุ่มซ้ำ 2, ลบ 2, เหลือ 5,
    **แถว multi-box `KY001,2,6` ไม่ถูกจับซ้ำ** (ข้อมูลไม่หาย) · by-columns บน tracking → กลุ่มซ้ำ 2, ลบ 3, เหลือ 4 (KY001 รวมทุกกล่องเพราะผู้ใช้เลือกคีย์ tracking เอง) · console สะอาด
- 2026-07-07 — **เครื่องมือที่ 8 พร้อมใช้: แปลง CSV ↔ Excel 🔄** (`/csv-excel`) — quick-win + โบนัสซ่อมไฟล์ MOMO
  · engine `src\lib\convertfile\convertfile.ts` (pure): reuse `parseFile` robust reader (ซ่อม zip เพี้ยนได้) →
    `rowsToCsv` (papaparse unparse — escape/quote ครบ) · `rowsToXlsx(rows, sheetName)` · `sheetsToXlsx(sheets)` (หลายชีต + กันชื่อชีตซ้ำ/อักขระต้องห้าม/ตัด 31 ตัว) ·
    `sheetStats` (นับ nonEmptyRows กันแถวว่างท้ายไฟล์) · `changeExt`
    - **กับดัก SheetJS:** `XLSX.write({type:"array"})` คืน **ArrayBuffer ไม่ใช่ Uint8Array** → ห่อ `new Uint8Array(out)` ใน `writeXlsxBytes` ให้ type ตรงจริง
    - เพิ่ม `downloadBlob(filename, data, mime)` ใน `export.ts` (normalize เป็น Uint8Array<ArrayBuffer> เลี่ยง strictness ของ TS 5.7) สำหรับดาวน์โหลด binary
  · **โบนัส:** อัปไฟล์ xlsx เพี้ยน (MOMO) → parseFile ซ่อมให้ → export กลับเป็น `.xlsx` มาตรฐานได้เลย
  · UI `src\app\csv-excel\page.tsx` (client): อัปไฟล์ → badge via (ซ่อมไฟล์/csv/xlsx) → เลือกชีต (ถ้าหลายชีต) → ปุ่มดาวน์โหลด
    ทิศทางสลับตามชนิดไฟล์เข้า (csv เข้า→ปุ่มเขียว Excel · xlsx เข้า→ปุ่มเขียว CSV) + "ทั้งไฟล์เป็น Excel" ตอนหลายชีต + พรีวิว 15 แถว (sticky index)
  · verify 2 ชั้น: (1) **Node round-trip test จริง 17/17 ผ่าน** (Node 24 type-strip รัน engine ตรง ๆ): csv→rows→xlsx→อ่านกลับ→csv
    ข้อมูลเดิมเป๊ะ — ไทยไม่เพี้ยน, ตัวเลขยัง number, quote+comma escape ถูก, ชื่อชีต sanitize (`Data:1?`→`Data_1_`), ชีตซ้ำ rename
    (2) **Chrome UI จริง**: CSV เข้า→via csv, nonEmpty 4 (ตัดแถวว่างท้าย), ปุ่มเขียว=Excel · กด export → blob magic `PK\x03\x04` 16KB MIME xlsx ชื่อ `.csv`→`.xlsx` ·
    เอา xlsx ที่ได้ drop กลับ → via xlsx, ข้อมูลครบ (แถว multi-box `KY001,2,6` ไม่หาย), ปุ่มเขียวสลับเป็น CSV · **console สะอาด ไม่มี error/hydration**
- 2026-07-07 — **เครื่องมือที่ 9 พร้อมใช้: แยกไฟล์ Excel ✂️** (`/split`) — ต่อยอด `sheetsToXlsx` · ตรง use-case แยกตามตู้
  · engine `src\lib\split\split.ts` (pure): `splitByColumn(header, data, col, {trim})` (แยกตามค่าคอลัมน์ เช่น container — trim ก่อนจับกลุ่ม,
    คีย์ว่าง→กลุ่ม `(ว่าง)` ไม่ทิ้ง) · `splitByRows(header, data, chunk)` (แบ่งเป็นก้อน chunk, กัน chunk≤0 เป็น 1 ไม่ให้ loop ค้าง,
    ตั้งชื่อก้อน `1-100`) · `groupsToSheets(result)` (แต่ละกลุ่ม→ชีตที่มี header นำหน้า) · stats {inputRows, groups, emptyKeyRows, biggest}
    - **ปรัชญาไม่ทิ้งข้อมูล:** ทุกแถวต้องเข้ากลุ่มใดกลุ่มหนึ่งเสมอ (ผลรวมทุกกลุ่ม = inputRows)
  · UI `src\app\split\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → เลือก header → เลือกโหมด
    (by-column: chips คอลัมน์ auto-guess container ก่อน tracking · by-rows: input จำนวนแถว) → กด "แยกไฟล์" →
    chips สรุป + การ์ดรายกลุ่ม (ชื่อ+จำนวนแถว+ปุ่ม ↓CSV ต่อกลุ่ม) + ปุ่มเขียว "↓ Excel ชีตละกลุ่ม" (ทั้งไฟล์)
  · verify 2 ชั้น: (1) **Node test 15/15 ผ่าน**: splitByColumn (TU-A รวม 3 นับ trim, `(ว่าง)` แยกถูก, ผลรวม = inputRows ไม่หาย),
    splitByRows (2+2+1 = 3 ก้อน, ชื่อ `1-2`/`5-5`), chunk 0 กันเป็น 1 · (2) **Chrome UI**: auto-guess = container, แยก 3 กลุ่ม
    (TU-A 3/TU-B 1/(ว่าง) 2, รวม 6 = แถวเข้า) · Excel ทั้งไฟล์ = PK magic 18KB · CSV ต่อกลุ่มขึ้นต้น header, ชื่อ `packing-TU-A.csv` · console สะอาด
- 2026-07-07 — **เครื่องมือที่ 10 พร้อมใช้: รวมหลายไฟล์ Excel** (`/merge`) — คู่กับ split (split=แยก1→หลาย · merge=รวมหลาย→1)
  · use-case: รวม packing list หลายตู้/หลายไฟล์ (ฟอร์แมตเดียวกัน) เป็นไฟล์มาสเตอร์เดียว
  · engine `src\lib\merge\merge.ts` (pure): `mergeFiles(inputs, {mode, addSource})` → 2 โหมด:
    - **by-header** (default): สร้าง union คอลัมน์ **จับตามชื่อหัวตาราง** (normalize trim+lowercase) → กันไฟล์คอลัมน์สลับ/หัวตารางไม่ตรง
      คอลัมน์ที่บางไฟล์ไม่มี → เติม `null` (ไม่ทำข้อมูลเลื่อน) · นับ `addedColumns` = คอลัมน์ที่ไฟล์แรกไม่มี
    - **by-position**: เรียงตามตำแหน่ง (width = คอลัมน์มากสุด) เหมาะไฟล์ฟอร์แมตเป๊ะ
    - `addSource` = เพิ่มคอลัมน์ "ไฟล์ต้นทาง" หน้าสุด · **invariant: outputRows === inputRows เสมอ (ไม่ทิ้งข้อมูล)**
  · `src\components\FileDropzone.tsx`: เพิ่ม prop `multiple` + `onFiles(File[])` (backward-compat — caller เดิมใช้ `onFile` ได้เหมือนเดิม)
  · UI `src\app\merge\page.tsx` (client): ลากหลายไฟล์พร้อมกัน → ลิสต์ไฟล์ (เลือกชีต/แถวหัวตาราง/ลบรายไฟล์ได้) → เลือกโหมด + ติ๊ก addSource →
    "รวมไฟล์" → chips (ไฟล์/แถวเข้ารวม/แถวออก/คอลัมน์/คอลัมน์เพิ่ม) + ตารางตัวอย่าง (sticky header) + ดาวน์โหลด Excel/CSV
  · verify 2 ชั้น: (1) **Node test 22/22 ผ่าน**: by-header จับตามชื่อ (beta คอลัมน์สลับ→ไม่เลื่อน), union คอลัมน์เพิ่มเติม null,
    addSource, by-position, invariant outputRows===inputRows (สุ่ม 5 ไฟล์) · (2) **Chrome UI**: drop 2 CSV คอลัมน์เรียงต่างกัน
    (alpha `tracking,kg,cbm` · beta `cbm,tracking,kg`) → รวม 3 แถว, header=tracking,kg,cbm, แถว beta = TH003|30|2.0 (จับตามชื่อ ไม่เลื่อน),
    Excel = PK magic 16KB ชื่อ `alpha-รวม.xlsx`, addSource → คอลัมน์ "ไฟล์ต้นทาง" ติดถูก (alpha/beta) · console สะอาด
- 2026-07-07 — **เครื่องมือที่ 11 พร้อมใช้: เข้ารหัส/ถอดรหัส 🔡** (`/encode`) — dev quick-win · ปิด 2 รายการ registry ทีเดียว (base64 + url-encode)
  · use-case: เช็ค payload/token ของ MOMO/Supabase, escape ค่าใส่ query string, อ่าน URL ที่ถูก encode
  · engine `src\lib\encode\encode.ts` (pure): `runEncode(input, mode, dir, opts)` → 2 โหมด (base64/url) × 2 ทิศ (encode/decode)
    - **Base64 เขียนเองด้วย byte table** (ไม่พึ่ง btoa/atob ที่พังกับ non-ASCII) → `TextEncoder`→bytes→base64 · decode ใช้ `TextDecoder(fatal:true)` (UTF-8 พัง = throw บอกชัด ไม่คืนขยะ)
    - รองรับ **Base64URL** (`- _` ไม่มี padding — ใช้ใน JWT/URL) · decode auto-detect ทั้ง standard + url-safe + ตัด whitespace
    - URL: `encodeURIComponent` (default, escape ทั้งค่า) vs `encodeURI` (คงโครง URL) · error → ข้อความไทย, ไม่ throw หลุด UI
  · UI `src\app\encode\page.tsx` (client, ไม่ต้องอัปไฟล์): แท็บ base64/url + toggle เข้ารหัส/ถอดรหัส + ตัวเลือกต่อโหมด · 2 ช่อง input↔output live +
    ปุ่ม "↔ สลับเข้า" (เอาผลกลับเป็น input + สลับทิศ = เช็ค round-trip เร็ว) + ตัวอย่าง/ล้าง/คัดลอก + นับ bytes + กล่องแดงตอน decode พัง
  · verify 2 ชั้น: (1) **Node test 45/45 ผ่าน**: base64 ตรงกับ `Buffer.toString("base64")` ทุกเคส (รวมไทย/emoji 🚛📦),
    round-trip ครบทุก mode, Base64URL ไม่มี +/=, decode เสีย→ok=false, url encode/decode ไทย · (2) **Chrome UI**: `Man`→`TWFu` (3→4 bytes),
    สลับเข้า→ถอดกลับได้ `Man` (ทิศเปลี่ยนเป็นถอดรหัส), base64 เสีย→กล่องแดง "มีอักขระที่ไม่ใช่ Base64" output ว่าง,
    URL encode ไทย: เว้นวรรค→%20 & →%26 ไทย→%E0%B8 round-trip กลับต้นฉบับ · console สะอาด
- 2026-07-07 — **เครื่องมือที่ 12 พร้อมใช้: ทดสอบ Regex 🔤** (`/regex`) — dev quick-win · ตรงกับงาน clean/parse ข้อมูล (ดึงเลข tracking/ตู้)
  · engine `src\lib\regex\regex.ts` (pure): `runRegex(pattern, flags, text)` → list match + capture group (index/named) ·
    auto เติม flag `g` ตอนหา (list ได้ทุก match แต่ UI โชว์ flag ตามผู้ใช้) · cap 1000 match กัน UI หน่วง · pattern เสีย → ok=false + error
    - `runReplace(pattern, flags, text, replacement)` respect flag ผู้ใช้ (ไม่มี g = แทนอันแรก) รองรับ `$1 $<name>`
    - `segmentText(text, matches)` ตัดข้อความเป็นชิ้นปกติ/match เพื่อไฮไลต์ (invariant: ประกอบกลับ = ต้นฉบับ · จัดการ zero-width match ไม่ค้าง)
  · UI `src\app\regex\page.tsx` (client, ไม่ต้องอัปไฟล์): ช่อง pattern `/…/flags` + ปุ่ม flag (g/i/m/s/u มี hint) · 2 ช่อง ข้อความทดสอบ↔ไฮไลต์สด +
    ตัวนับ match + ตาราง match (ตำแหน่ง/ข้อความ/กลุ่ม $1 $2 <name>) + พาเนล replace พับได้ (ดู output สด) · pattern ผิด = กล่องแดง
  · verify 2 ชั้น: (1) **Node test 16/16 ผ่าน**: หา match + auto-global, capture/named group, flag i, pattern เสีย→ok=false,
    replace (g/ไม่ g/$1$2/เสีย), segmentText ประกอบกลับ=ต้นฉบับ + zero-width ไม่ค้าง · (2) **Chrome UI**: sample `([A-Z]{2,})-?(\d+)` บนข้อความจริง →
    4 match (abc พิมพ์เล็กถูกข้าม), กลุ่ม TU/12·KY/345·GZE/2025·TU/12 ถูก, ไฮไลต์ 4 จุด · replace `$2/$1` สลับกลุ่มได้ (TU-12→12/TU) ·
    pattern `([A-Z` → กล่องแดง "Unterminated character class" ไฮไลต์ 0 · console สะอาด
- 2026-07-07 — **เครื่องมือที่ 13 พร้อมใช้: คำนวณ VAT + กำไร 🧮** (`/calc`) — ปิด `vat` + `profit` · ไว้ตั้งราคา/quote งานนำเข้า
  · engine `src\lib\calc\price.ts` (pure): `computeVat(amount, rate=7, inclusive)` → 2 โหมด บวก VAT (ก่อน→รวม) / ถอด VAT (รวม→แยก ด้วย `a/(1+r/100)`) คืน {rate,base,vat,total} ·
    `computeProfit(cost, sell)` → กำไร + มาร์จิ้น (กำไร/ขาย×100) + มาร์กอัป (กำไร/ทุน×100) กัน หาร 0 ·
    `sellFromMargin(cost, m)` = `cost/(1-m/100)` (m≥100 คิดไม่ได้→0) · `sellFromMarkup(cost, m)` = `cost*(1+m/100)` ·
    `safe()` กันค่าเพี้ยน NaN/Infinity→0 · `money()`/`pct()` จัดรูปคอมมา+ทศนิยม 2
  · UI `src\app\calc\page.tsx` (client, ไม่ต้องอัปไฟล์): 3 การ์ดคำนวณสด (useMemo) — VAT (toggle บวก/ถอด + อัตราปรับได้) ·
    กำไร/มาร์จิ้น (ต้นทุน+ขาย → กำไร/มาร์จิ้น/มาร์กอัป, ขาดทุนโชว์แดง) · หาราคาขายจาก % (toggle มาร์จิ้น/มาร์กอัป, margin≥100% เตือนแดง)
  · verify 2 ชั้น: (1) **Node test 29/29 ผ่าน**: VAT excl 100→107 / incl 107→base 100, computeProfit 80→100 = กำไร 20/margin 20%/markup 25%,
    ขาดทุน+หาร 0, sellFromMargin 80@20%=100 / @100%=0, sellFromMarkup 80@25%=100, round-trip margin↔markup, money/pct · (2) **Chrome UI**:
    VAT excl 100→107 · ถอด VAT 107→base 100/vat 7 · กำไร 80/100 = 20 (margin 20%/markup 25%) · sellFromMargin 80@20%=100 · markup 80@25%=100 ·
    margin 100% → ราคา 0 + เตือน "มาร์จิ้น ≥ 100% คิดไม่ได้" · search "กำไร" หน้าแรก → การ์ด "พร้อมใช้" → /calc · console สะอาด ไม่มี hydration
- 2026-07-07 — **เครื่องมือที่ 14 พร้อมใช้: เปรียบเทียบ JSON 🧬** (`/compare-json`) — ปิด `compare-json` · ตรงหมวด "เทียบ" (use-case หลัก)
  · engine `src\lib\jsondiff\jsondiff.ts` (pure): `diffJson(aText, bText)` → deep-diff ไล่ทุกชั้น (object ตาม union key · array ตาม index · leaf = same/changed) →
    `DiffNode[]` {path, kind: added|removed|changed|same, left?, right?} · subtree ที่มีเฉพาะฝั่งเดียว = 1 node (added/removed ทั้งก้อน) · cap 5000 node
    - `joinPath` อ่านง่าย (`o.items[1].cbm` · key อักขระแปลก → `["a b"]`) · `deepEqual` จัดกลุ่ม same · error บอกฝั่ง (A/B เสีย) ·
      `previewValue` ย่อค่า one-line · `diffToCsv(nodes, includeSame=false)` export เฉพาะที่ต่าง
  · UI `src\app\compare-json\page.tsx` (client, ไม่ต้องอัปไฟล์): 2 ช่องวาง JSON (A/B) → chips filter (ต่างทั้งหมด/เปลี่ยน/เพิ่ม/หาย/ทั้งหมด) +
    ตาราง diff ไฮไลต์สี (เหลือง=เปลี่ยน เขียว=เพิ่ม(เฉพาะB) แดง=หาย(เฉพาะA)) sticky header + ปุ่ม export CSV · JSON เสีย = กล่องแดงบอกฝั่ง
  · verify 2 ชั้น: (1) **Node test 35/35 ผ่าน**: primitive changed/same, added/removed key, nested path, array by index (สั้น/ยาวกว่า),
    type mismatch=changed, subtree เท่ากัน=same, key อักขระแปลก→bracket, root primitive, JSON เสียบอกฝั่ง, diffToCsv ตัด same · (2) **Chrome UI**:
    sample A↔B → ต่าง 4 (boxes 12→10, items[1].cbm 0.18→0.2 = เปลี่ยน 2 · note หาย · shipDate เพิ่ม), same 5, ทั้งหมด 9 · filter "ทั้งหมด"=9 แถว ·
    export → `json-diff.csv` 174B type csv · JSON เสียฝั่ง A → กล่องแดง "ฝั่ง A" ซ่อนตาราง · console สะอาด ไม่มี hydration
- 2026-07-07 — **เครื่องมือที่ 15 พร้อมใช้: ค้นหา & กรองข้อมูล 🔎** (`/filter`) — ปิด `smart-filter` · หา/กรองแถวในไฟล์ใหญ่
  · engine `src\lib\filter\filter.ts` (pure): `applyFilter(header, dataRows, conds, {match, quick})` → กรองแบบ live
    - 12 operator: contains/not-contains/equals/not-equals/starts/ends/empty/not-empty + ตัวเลข gt/gte/lt/lte (`OP_LABEL`, `NO_VALUE_OPS`, `NUMERIC_OPS`)
    - `col: -1` = ทุกคอลัมน์ (some) · `match: all|any` = AND/OR ระหว่างเงื่อนไข · `quick` = ค้นเร็วทุกคอลัมน์ (AND เสมอ) ·
      case-insensitive default (ติ๊ก Aa = สนพิมพ์เล็ก/ใหญ่) · ตัดแถวว่างทั้งแถว (total นับเฉพาะแถวจริง) · คงลำดับเดิม + `matchedIndexes`
    - เงื่อนไขที่ยังไม่กรอกค่า = ถูกข้าม (ไม่กรองมั่ว) · **ไม่ทำข้อมูลหาย** (แค่กรองแสดง)
  · UI `src\app\filter\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → เลือก header →
    ช่องค้นเร็ว + ปุ่ม AND/OR + แถวเงื่อนไข (เลือกคอลัมน์/operator/ค่า/ติ๊ก case · เพิ่ม-ลบได้) → ตารางผล live (sticky header, cap 200 แถว) +
    chip "เจอ N/รวม" + ดาวน์โหลดผลกรอง CSV
  · verify 2 ชั้น: (1) **Node test 18/18 ผ่าน**: contains + case, numeric gt/lte, empty (0≠ว่าง), AND/OR, ทุกคอลัมน์, quick+cond,
    ไม่มีเงื่อนไข→คืนทุกแถว, cond ค่าว่างถูกข้าม, starts/ends, not-equals · (2) **Chrome UI** (drop CSV 5 แถว):
    โหลด 5/5 header ถูก · quick "TU-A" → 2 (KY001/KY002) · weight>5 → 3 (12/5.5/340) · export `packing-กรอง.csv` 72B type csv · console สะอาด
- 2026-07-07 — **เครื่องมือที่ 16 พร้อมใช้: เทียบข้อความ 🔀** (`/compare-text`) — tool ใหม่ในหมวด "เทียบ" (คู่กับ compare-json)
  · engine `src\lib\textdiff\textdiff.ts` (pure): `diffLines(aText, bText, {ignoreCase, trim, ignoreBlank})` → LCS diff ทีละบรรทัด →
    `DiffLine[]` {kind: same|added|removed, aLine?, bLine?, text} + stats · DP table Int32Array (O(n·m)) · cap 2000 บรรทัด/ฝั่ง
    - แยกบรรทัดรองรับ CRLF/CR/LF · normalize ตาม option ก่อนเทียบ (แต่โชว์ข้อความจริง) · `diffToText` = unified (+/-/space) copy ได้
    - **invariant:** same+removed = |A|, same+added = |B| (ไม่ทิ้งบรรทัด)
  · UI `src\app\compare-text\page.tsx` (client): 2 ช่องวางข้อความ + toggle (trim default on/ignoreCase/ignoreBlank) →
    chips (+เพิ่ม/−หาย/เหมือน) + ตาราง diff ไฮไลต์สี (เขียว=เพิ่ม แดง=หาย) โชว์เลขบรรทัด A/B + เครื่องหมาย +/− · checkbox "โชว์เฉพาะที่ต่าง" + คัดลอก diff
  · verify 2 ชั้น: (1) **Node test 22/22 ผ่าน**: identical, added/removed กลาง, changed=remove+add, LCS ลำดับถูก (1,3,4),
    ignoreCase/trim/ignoreBlank, ฝั่งเดียวว่าง, invariant same+removed=|A|, diffToText, CRLF · (2) **Chrome UI**: sample A↔B →
    +2/−2/เหมือน 4 (KY003 หาย · KY005 เพิ่ม · 340.5→341.0) เลขบรรทัด A/B ถูก · "โชว์เฉพาะที่ต่าง" → 4 บรรทัด · console สะอาด ไม่มี hydration
- 2026-07-07 — **เครื่องมือที่ 17 พร้อมใช้: จัดรูปแบบ SQL 🗃️** (`/sql`) — dev quick-win (อ่าน query ของ Pacred/Supabase ง่ายขึ้น)
  · **ปรัชญาหลัก = "ปลอดภัยเชิงความหมาย" (semantically safe):** ตัวจัดรูปนี้ **ห้ามแก้ความหมาย query เด็ดขาด**
    → preserve ทุก token ตามเดิม (string/comment/quoted-ident/operator/เลขทศนิยม ไม่แตะเลย) เปลี่ยนแค่ 2 อย่าง:
    (1) ตัวพิมพ์ใหญ่ของ keyword (2) ช่องว่าง/ขึ้นบรรทัด "ระหว่าง" token เท่านั้น
  · engine `src\lib\sql\format.ts` (pure): `formatSql(sql, {uppercaseKeywords?, indent?})` →
    - `tokenize` แตกเป็น token {t: ws|comment|string|ident|word|symbol, v, **glueLeft**} · glueLeft = token นี้ติดตัวหน้า (ไม่มี ws คั่น)
      → **กฎ glue:** เดิมติดกัน (เช่น `3.14`, `->>`, `b::int`) คงติด · เดิมมี ws คั่นใส่ 1 ช่องว่าง (SQL มองช่องว่างกี่ตัวก็เท่ากัน)
    - รู้จัก comment (`--`, `/* */`), string `'...'` (escape `''`), quoted-ident `"..."`/`` `...` ``/`[...]`, word run, symbol ทีละตัว
    - CLAUSE_1 (select/from/where/group/order/having/limit/...) ขึ้นบรรทัดใหม่ · CLAUSE_2 (group by/order by/insert into/delete from)
    - JOIN: ขึ้นบรรทัดก่อน INNER/LEFT/... + **`JOIN_PREFIX` กัน `INNER\nJOIN` แตกบรรทัด** (join ที่ตามหลัง modifier ไม่ขึ้นบรรทัดซ้ำ)
    - AND/OR ขึ้นบรรทัด+ย่อหน้า · comma แตกบรรทัดใน select list · เก็บกวาด ws ท้ายบรรทัด + ยุบบรรทัดว่างซ้อน
  · UI `src\app\sql\page.tsx` (client, ไม่ต้องอัปไฟล์): 2 ช่อง (วาง↔ผล) live + toggle keyword ตัวใหญ่ + เลือกย่อหน้า (2/4/tab) + ตัวอย่าง/ล้าง/คัดลอก/ดาวน์โหลด .sql
  · verify 2 ชั้น: (1) **Node test 39/39 ผ่าน** — เน้น **killer test "เนื้อ token คงเดิม"**: format แล้วตัด whitespace ออก
    ต้องเท่าต้นฉบับเป๊ะ (ปิด upper) / เท่าแบบ case-insensitive (เปิด upper) พิสูจน์ว่าไม่ทำ query เพี้ยน — ครอบ `->>`/`::`/`!=`/`<=`/`3.14`/
    `json->'k'->>'v'`/`arr[1]`/`a||b`/`x%y`/string escape `''`/comment · + INNER JOIN & LEFT OUTER JOIN บรรทัดเดียว
    (2) **Chrome UI จริง**: sample query → semanticSafe=true (เนื้อไม่เพี้ยน), keyword เป็นตัวใหญ่, FROM/WHERE/GROUP/ORDER ขึ้นบรรทัด,
    INNER JOIN บรรทัดเดียว (ไม่แตก), AND ย่อหน้า, string `'active'` ครบ, ดาวน์โหลด .sql blob มีขนาด · **console สะอาด ไม่มี error/hydration**
- 2026-07-07 — **เครื่องมือที่ 18 พร้อมใช้: แปลง/ย่อ/บีบอัดรูป 🖼️** (`/image`) — quick-win · ปลด 3 รายการ roadmap พร้อมกัน
  (resize-image + compress-image + convert-image → ready ชี้ `/image` เพราะ pipeline เดียวกัน)
  · **ทำในเครื่องล้วน (Canvas API) — ไม่มี dep, ไม่อัปโหลดรูปไปไหน** (ปลอดภัย + ตรงปรัชญา pure)
  · engine `src\lib\image\resize.ts` (pure, เทสได้ — แยก "คณิตของขนาด" ออกจาก canvas): `computeTargetSize(w, h, opts)` →
    3 โหมด: `none` (คงเดิม) · `fit` (ย่อพอดีกรอบ maxW×maxH คงอัตราส่วน, ไม่ขยายเกินต้นฉบับเว้น allowUpscale) · `scale` (คูณ %) ·
    ปัดจำนวนเต็ม + min 1px · `formatMime`/`supportsQuality` (png ไม่สน quality) · `changeImageExt` (jpeg→.jpg) · `humanSize`
  · UI `src\app\image\page.tsx` (client): FileDropzone accept image → อ่านขนาดจริง → เลือกรูปแบบ (JPG/PNG/WEBP) + โหมดขนาด +
    quality slider (jpeg/webp) → กด "แปลงรูป" → วาดลง canvas (พื้นขาวสำหรับ jpeg กันพื้นดำ) → `toBlob` → พรีวิวก่อน→หลัง +
    บอก %เล็กลง/ใหญ่ขึ้น + ดาวน์โหลด · revoke object URL กัน memory leak
  · verify 2 ชั้น: (1) **Node test 26/26 ผ่าน**: computeTargetSize (none/scale/fit ครบ — คงอัตราส่วน, ไม่ขยายเกิน,
    เลือกด้านบีบมากสุด, min 1px, ปัดเศษ), changeImageExt (jpeg→jpg, คงจุดในชื่อ), mime/quality/humanSize
    (2) **Chrome UI จริง** (สร้าง PNG 200×100 ผ่าน canvas ป้อน dropzone): แปลง PNG→JPG ได้ (test.jpg, 200×100, blob โชว์),
    เปลี่ยนโหมด scale 50% → 100×50 (ต้นฉบับยังโชว์ 200×100), ดาวน์โหลด blob test.jpg · **console สะอาด ไม่มี error/hydration**
- 2026-07-07 — **เครื่องมือที่ 19 พร้อมใช้: สุ่มรายชื่อ 🎲** (`/random`) — quick-win ตัวสุดท้ายที่ pure + เทสได้แน่นในรอบนี้
  · engine `src\lib\random\pick.ts` (pure): `parseList` (ทีละบรรทัด + dedupe option) · `mulberry32(seed)` (RNG deterministic) ·
    `shuffle` (Fisher-Yates ยุติธรรม ไม่แก้ต้นฉบับ) · `pickN` (สุ่มไม่ซ้ำ n ตัว) · `splitGroups` (แบ่ง k กลุ่ม เกลี่ยเท่า round-robin)
    - **RNG inject ได้** → ใส่ seed แล้วผลซ้ำเดิม (reproducible) + เทส deterministic ได้ · **invariant: splitGroups ผลรวม = จำนวน items (ไม่ทิ้ง/ไม่เพิ่ม)**
  · UI `src\app\random\page.tsx` (client): วางรายชื่อ → 3 โหมด (สุ่มผู้โชคดี N / สลับลำดับ / แบ่งกลุ่ม) + toggle ตัดซ้ำ + toggle seed (ทำซ้ำได้) → คัดลอกผล
  · verify 2 ชั้น: (1) **Node test 26/26 ผ่าน**: parseList (trim/CRLF/dedupe), mulberry32 (seed เดิม→เลขเดิม), shuffle (permutation ไม่แก้ต้นฉบับ),
    pickN (ไม่ซ้ำ/n≥len→ทั้งหมด/n≤0→[]), splitGroups (ผลรวมครบ/เกลี่ยเท่า/k≤0→1กลุ่ม/k>items) · (2) **Chrome UI**: 7 รายชื่อ, seed 42 สุ่ม 3 คน = [D,B,A]
    กดซ้ำได้ผลเดิม (reproducible), แบ่ง 3 กลุ่ม = [3,2,2] รวม 7 ครบไม่ทิ้ง เกลี่ยเท่า · console สะอาด
- 2026-07-10 — **เครื่องมือที่ 20 พร้อมใช้: สรุปยอด & สถิติคอลัมน์ 📊** (`/stats`) — tool ใหม่ (ไม่มีใน registry เดิม) ตอบคำถามรายวัน "ไฟล์นี้รวมน้ำหนัก/CBM/กล่องเท่าไหร่"
  · engine `src\lib\stats\stats.ts` (pure): `computeStats(header, dataRows, cols?)` → ต่อคอลัมน์คืน `ColumnStat`:
    count/filled/blank/numeric/nonNumeric/zero/distinct/sum/avg/min/max + `isNumericCol` (numeric ≥ filled/2 และ filled>0)
    - `parseNumeric` (ตัด comma+trim, boolean/Infinity→null สอดคล้อง toNumber ของ diff) · ตัดแถวว่างทั้งแถวก่อนนับ (ยอดไม่เพี้ยน) ·
      width ขยายตามแถวที่กว้างกว่า header · distinct เทียบแบบ string ที่ trim แล้ว · `fmtNum` (คอมมา, ปัด 1e6 กัน float error, ไม่โชว์ .00) · `statsToCsv`
    - **ปรัชญา:** แค่ "อ่านสรุป" ไม่แก้ข้อมูล (อ่านอย่างเดียว)
  · UI `src\app\stats\page.tsx` (client): reuse parse/detect/FileDropzone → อัปโหลด → เลือก header → การ์ดยอดรวมคอลัมน์ตัวเลข (เด่น) +
    ตารางสถิติทุกคอลัมน์ (badge ตัวเลข/ว่าง) + toggle "เฉพาะคอลัมน์ตัวเลข" + ดาวน์โหลดสรุป CSV
  · verify 2 ชั้น: (1) **Node test 55/55 ผ่าน**: parseNumeric (comma/trim/blank/text/bool/Infinity/negative), computeStats
    (filled/blank/numeric/nonNumeric/sum/avg/min/max, cbm zero, distinct+dup, ตัดแถวว่าง, cols filter, ragged row, width ขยาย, no-numeric→avg null),
    fmtNum (integer คอมมา/decimal/null/float error/Infinity), statsToCsv (sum ว่างเมื่อไม่ใช่ตัวเลข), distinct trim
    (2) **Chrome UI จริง** (CSV 5 แถว): chip "5 แถว · 3 คอลัมน์", การ์ด weight sum 357.5/avg 119.17/min 5.5/max 340,
    cbm sum 2.84/zero 1, tracking distinct 4/ไม่มี badge ตัวเลข · download `packing-สรุป.csv` (blob) · toggle → เหลือ 2 คอลัมน์ตัวเลข · **console สะอาด**
- 2026-07-10 — **เครื่องมือที่ 21 พร้อมใช้: แปลง JSON ↔ ตาราง/CSV 🔧** (`/json-csv`) — dev+cargo · เปลี่ยน response JSON (MOMO API/Supabase) เป็นตารางดูง่าย/เอาไปเทียบต่อ
  · engine `src\lib\jsoncsv\jsoncsv.ts` (pure): 2 ทิศ
    - `jsonToTable(input, {flatten})` → normalize: array-of-objects (union key คงลำดับพบครั้งแรก, key ขาด→null) · single object (ห่อ 1 แถว) ·
      array-of-arrays (คอลัมน์ 1..N, แถวสั้นเติม null) · primitive/ปน (คอลัมน์เดียว "value") · **nested object → JSON string ในช่อง (ไม่ทิ้งข้อมูล)** ·
      `flatten` = แผ่ object ซ้อนเป็น dot notation (`meta.box`) แต่ **array ยังเป็น JSON string** (ไม่แผ่)
    - `tableToJson(csv, {inferTypes, pretty})` → papaparse (`skipEmptyLines:"greedy"`, รองรับ quote+comma) → array of objects · header ว่าง→`col{i}` ·
      `inferTypes`: ""→null, true/false→bool, null→null, ตัวเลข→number **แต่คงเลข 0 นำหน้า (`007` tracking/รหัส) เป็น string** (regex กัน `^-?0\d` ตามปรัชญา no-data-loss)
  · UI `src\app\json-csv\page.tsx` (client, ไม่ต้องอัปไฟล์): 2-panel (วาง↔ผล) live + toggle ทิศ + options (flatten / เดาชนิด / จัดรูปสวย) +
    ปุ่ม "↔ สลับทิศ" (เอาผลไปเป็น input ทิศตรงข้าม เช็ค round-trip) + ตัวอย่าง/ล้าง/คัดลอก/ดาวน์โหลด + พรีวิวตาราง (JSON→ตาราง)
  · verify 2 ชั้น: (1) **Node test 46/46 ผ่าน**: array-of-objects (union/ลำดับ/null), single obj, flatten (ตื้น/ลึก, array คง string), array-of-arrays,
    primitive→value, null/false คงค่า, empty array ok, error (bad/primitive/ว่าง) · tableToJson (infer number/bool/null, no-infer=string, "007"คง string,
    0/0.5/-0.25 ยังเป็น number, empty→null/"", header ว่าง→col, quoted comma, pretty), round-trip · (2) **Chrome UI จริง**:
    JSON nested → CSV union header `tracking,kg,meta,note` (meta=`{"box":2}` ไม่หาย, "a,b" quote ถูก), flatten → `meta.box`, พรีวิว 2 แถว ·
    CSV→JSON: `007` คง string, 12.5→number, true→bool, pretty · bad JSON → error box+output ว่าง · download `data.csv` blob · **console สะอาด**
- 2026-07-10 — **เครื่องมือที่ 22 พร้อมใช้: เทียบ 2 รายการ 🔁** (`/list-compare`) — หมวด "เทียบ" · reconcile เบา ๆ ไม่ต้องอัปไฟล์ (วางลิสต์ tracking 2 ก้อน)
  · engine `src\lib\listcompare\listcompare.ts` (pure): `compareLists(aItems, bItems, {trim, caseInsensitive})` → set diff:
    `onlyA` / `onlyB` / `both` (คงลำดับตามที่พบ, both แสดงค่าจากฝั่ง A) + `countA/countB` (ไม่ซ้ำ) + `dupA/dupB` (บรรทัดซ้ำเกินตัวแรก)
    - `keyOf` normalize (trim default on + caseInsensitive) เพื่อ "จับคู่" แต่ **แสดงค่าจริงตามที่พิมพ์** (ไม่ทำข้อมูลเพี้ยน) · `parseLines` ตัดบรรทัดว่าง+ช่องว่างท้าย ·
      `compareText` (จากข้อความดิบ) · `compareToCsv` (value,status: only-A/only-B/both) · **invariant: countA = onlyA + both**
  · UI `src\app\list-compare\page.tsx` (client, ไม่ต้องอัปไฟล์): 2 textarea (A/B) + toggle (ตัดช่องว่าง default/ไม่สนพิมพ์เล็กใหญ่) +
    chips สรุป 3 สี + 3 คอลัมน์ผล (เฉพาะ A=ฟ้า / มีทั้งคู่=เขียว / เฉพาะ B=เหลือง) คัดลอกรายคอลัมน์ + ปุ่มสลับ A/B + ดาวน์โหลด CSV
    - **บทเรียน Tailwind v4:** JIT อ่าน class จาก literal เท่านั้น → **ห้ามประกอบ string สี** (`bg-${c}-100` = สีไม่ขึ้น) ใช้ class เต็มใน const แทน
  · verify 2 ชั้น: (1) **Node test 44/44 ผ่าน**: parseLines (CRLF/บรรทัดว่าง/คงช่องว่างหน้า), onlyA/onlyB/both คงลำดับ,
    trim จับคู่+แสดงค่า trim, trim off, caseInsensitive, นับ dup+dedup, identical, empty, compareText, invariant, compareToCsv+escape
    (2) **Chrome UI จริง**: A(5, KY001 ซ้ำ) B(3, " KY002 " มีช่องว่าง) → เฉพาะ A [KY001,KY004], ทั้งคู่ [KY002,KY003] (trim จับได้), เฉพาะ B [KY005],
    "ซ้ำ 1", **chip 3 สีต่างกันจริง** (คอนเฟิร์ม dynamic-class fix), download `list-compare.csv` blob · **console สะอาด**
- 2026-07-10 — **เครื่องมือที่ 23 พร้อมใช้: เลือก/จัดเรียงคอลัมน์ 🧲** (`/columns`) — ตรง use-case หลัก "จัดตารางก่อน export เข้า Pacred"
  · engine `src\lib\pluck\pluck.ts` (pure): `pluckColumns(header, dataRows, specs, {dropEmptyRows})` → reshape ตารางตาม `ColumnSpec[]` (เรียงตาม specs เป๊ะ):
    - `{src, name, constant?}` · src ≥ 0 = ดึงคอลัมน์ต้นทาง · **src < 0 = คอลัมน์ค่าคงที่** (ใส่ `constant` ทุกแถว เช่น ติดเลขตู้) · src เกินขอบ → null
    - **แค่จัดรูปคอลัมน์ ไม่แตะค่าจริงในเซลล์** (ยึดค่าตามต้นฉบับ) · เลือกซ้ำคอลัมน์เดิม 2 ครั้งได้ · `defaultSpecs` = ทุกคอลัมน์ตามลำดับเดิม (ชื่อว่าง→"คอลัมน์ N")
    - `dropEmptyRows` **นับเฉพาะคอลัมน์ต้นฉบับ** (src≥0) → **คอลัมน์ค่าคงที่ไม่ช่วยให้แถวว่างรอด** (กันแถว subtotal/ว่างติดมา) · ไม่มี src เลย → ไม่ตัด
  · UI `src\app\columns\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → เลือก header → auto-load ทุกคอลัมน์ →
    จัด spec: เลือก src (หรือ ➕ ค่าคงที่) / เปลี่ยนชื่อหัว / ▲▼ สลับลำดับ / ลบ / เพิ่มคอลัมน์ + toggle ตัดแถวว่าง → ตารางผลสด (sticky header) + ดาวน์โหลด CSV/Excel
  · verify 2 ชั้น: (1) **Node test 27/27 ผ่าน**: subset+reorder, rename (ไทย), constant (src<0 + default ว่าง), src เกินขอบ→null,
    dropEmptyRows นับ src อย่างเดียว (ค่าคงที่ไม่ rescue), empty specs, defaultSpecs identity round-trip, ดึงคอลัมน์ซ้ำ · (2) **Chrome UI จริง** (CSV 4 คอลัมน์ + แถวว่าง):
    default = 4 คอลัมน์ identity · เพิ่มค่าคงที่ container=TU-A + ตัดแถวว่าง → ตัดว่าง 2 เหลือ 3 แถว, TU-A ครบทุกแถว (ค่าคงที่ไม่ช่วยแถวว่างรอด) ·
    ▲ ขยับ container เหนือ note (ค่าเลื่อนตามถูก) · Excel `packing-คอลัมน์.xlsx` 16KB magic PK\x03\x04 · search หน้าแรกเจอการ์ด · **console สะอาด**
- 2026-07-10 — **เครื่องมือที่ 24 พร้อมใช้: สรุปยอดแบบจัดกลุ่ม 🧮** (`/group`) — pivot เบา ๆ · ต่อยอดจาก /stats (ทั้งคอลัมน์ → ต่อกลุ่ม) ตรง use-case "รวมน้ำหนัก/CBM/กล่อง ต่อตู้"
  · engine `src\lib\group\group.ts` (pure): `groupBy(header, dataRows, groupCols, aggs, {trim, ignoreEmptyKey})` → จัดกลุ่มตามคอลัมน์ (หลายชั้นได้) แล้วสรุป
    - 7 ฟังก์ชันสรุป (`AggFn`): sum/avg/min/max (เฉพาะช่องตัวเลข ใช้ `parseNumeric` inline) · count (นับช่องมีค่า) · count-distinct (นับค่าไม่ซ้ำ) · first (ค่าแรกไม่ว่าง)
    - **grand total** = คำนวณจากทุกแถวที่นับเข้ากลุ่มจริง (avg เป็น global sum/global count ไม่ใช่เฉลี่ยของเฉลี่ย) · คีย์ว่างโชว์ "(ว่าง)"
    - `ignoreEmptyKey` (default UI เปิด) = ข้ามแถวคีย์ว่างทั้งหมด (กัน subtotal/grand-total ในไฟล์ปน) · `trim` จับกลุ่ม (default on: "TU-A" = " TU-A ") · ตัดแถวว่างทั้งแถวก่อน
    - **invariant: ผลรวม count ของทุกกลุ่ม = countedRows** (ทุกแถวเข้ากลุ่มเดียว ไม่หาย/ไม่ซ้ำ) · `groupToCsv` (หัว + แถวกลุ่ม + แถวรวมท้าย)
    - **หมายเหตุสถาปัตย์:** pure engine ต้อง self-contained (import แค่ *type* ผ่าน `@/`) → inline `parseNumeric` แทน import ค่าจริงจาก stats (ไม่งั้น Node type-strip test แก้ `@/` alias runtime ไม่ได้)
  · UI `src\app\group\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → auto-guess (คีย์=container/ตู้, sum kg+cbm) →
    เลือกคอลัมน์จัดกลุ่ม (chips หลายชั้น) + แถวสรุป (เลือกฟังก์ชัน×คอลัมน์ เพิ่ม/ลบ) + toggle ข้ามคีย์ว่าง → ตารางผล (sticky header + tfoot แถวรวมเขียวค้างล่าง) + ดาวน์โหลด CSV
  · verify 2 ชั้น: (1) **Node test 48/48 ผ่าน**: sum/avg/min/max ต่อกลุ่ม + grand total, count vs count-distinct (tracking ซ้ำ), first (ข้ามว่าง),
    sum ไม่มีตัวเลข=0/avg=null, คีย์หลายชั้น, trim จับกลุ่ม (+ปิด trim แยก 2), ตัดแถวว่าง, ignoreEmptyKey, invariant count รวม=countedRows, CSV+แถวรวม
    (2) **Chrome UI จริง** (CSV container/kg/cbm 5 แถว + คีย์ว่าง 1): auto-guess = container + sum kg/cbm · เปิดข้ามคีย์ว่าง → 2 กลุ่ม (TU-A 17.5/0.34, TU-B 350/2.5, รวม 367.5/2.84 ข้าม 1) ·
    ปิด → 3 กลุ่ม ((ว่าง) 1 แถว kg 3, รวม 5/370.5/2.94) · เปลี่ยนเป็น เฉลี่ย+นับไม่ซ้ำ → TU-A avg 8.75/distinct 2, total avg 74.1/distinct 5 · CSV `packing-สรุปกลุ่ม.csv` หัว+แถวรวมถูก · **console สะอาด**
- 2026-07-10 — **เครื่องมือที่ 25 พร้อมใช้: เรียงลำดับตาราง ↕️** (`/sort`) — จัดเรียง packing list ก่อน export (เช่น เรียงตามตู้ แล้วน้ำหนักมาก→น้อย)
  · engine `src\lib\sorttable\sort.ts` (pure): `sortRows(header, dataRows, keys, {blanksLast, caseInsensitive})` → เรียงหลายคีย์ (multi-key)
    - **ปรัชญา = แค่สลับลำดับแถว ไม่ทำแถวหาย/ไม่แก้ค่า** → ผลลัพธ์เป็น **permutation ของ input เสมอ** (มี invariant test 200 แถว + เช็ค input ไม่ถูก mutate)
    - **sort เสถียร (stable):** decorate-sort-undecorate ผูก index เดิม tie-break → แถวที่เท่ากันคงลำดับเดิมแน่นอน
    - `SortKey {col, dir: asc|desc, type?: auto|number|text}` · auto = เดา (ตัวเลขทั้งคู่→เทียบเลขจริง "10">"2", ไม่งั้นเทียบข้อความ localeCompare "th") · number = บังคับเลข (ช่องเลขมาก่อนช่องไม่ใช่เลข) · text = บังคับข้อความ
    - `blanksLast` (default on) = ช่องว่างไปท้ายเสมอ **ไม่ขึ้นกับทิศ** (asc/desc ก็อยู่ท้าย) · `caseInsensitive` (default on) · `parseNumeric` inline (ตัด comma+trim) ตามกฎ self-contained
  · UI `src\app\sort\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → เลือก header → แถวคีย์เรียง
    (เลือกคอลัมน์ + ปุ่ม น้อย→มาก↑/มาก→น้อย↓ + ชนิด auto/ตัวเลข/ข้อความ · เพิ่ม/ลบคีย์ได้) + toggle ช่องว่างท้าย/ไม่สนพิมพ์เล็กใหญ่ → ตารางผล (sticky header, พรีวิว 300 แถว) + ดาวน์โหลด CSV/Excel
  · verify 2 ชั้น: (1) **Node test 19/19 ผ่าน**: เลขน้อย→มาก/มาก→น้อย, stable tie, เรียงข้อความ, multi-key, auto เดาเลข vs บังคับ text,
    blanksLast (asc/desc/ปิด), number บังคับเลขมาก่อน, case-insensitive, ไม่มีคีย์→คงเดิม, **invariant permutation 200 แถว**, stability, input ไม่ถูกแก้
    (2) **Chrome UI จริง** (CSV tracking/kg/container 4 แถว): default เรียง tracking = KY001-004 · เปลี่ยนเป็น kg (ตัวเลข) → 2,10,10,100 tie เสถียร ·
    multi-key container↑ + kg↓ → KY003(100,TU-A),KY001(2,TU-A),KY002(10,TU-B),KY004(10,TU-B) ถูก · Excel `packing-เรียง.xlsx` PK magic 16KB · **console สะอาด**
- 2026-07-10 — **เครื่องมือที่ 26 พร้อมใช้: เติมค่าลงล่าง ⬇️** (`/fill`) — แก้ปัญหาจริงฟอร์แมต iTAM: "เลขตู้ (container)" มีเฉพาะแถวแรกของกลุ่ม แถวที่เหลือเว้นว่าง → เติมให้ครบทุกแถว เพื่อให้ /group /split /reconcile จับกลุ่มถูก
  · engine `src\lib\fill\fill.ts` (pure): `fillCells(header, dataRows, cols, {direction, trimBlank, resetOnBlankRow})` → เติมช่องว่างด้วยค่า "ที่มีค่าล่าสุด" ในทิศที่กำหนด
    - **ปรัชญา = เติมเฉพาะช่องว่างเท่านั้น ไม่ทับค่าเดิม, ไม่ทำแถวหาย/ไม่เพิ่มแถว** → จำนวนแถวเท่าเดิม, ทุกช่องมีค่าเดิมคงเป๊ะ (invariant test 100 แถว + input ไม่ mutate)
    - `direction: down` (default, บน→ล่าง) / `up` (ล่าง→บน) · `trimBlank` (default on: ช่องเว้นวรรคล้วน = ว่าง) · หลายคอลัมน์พร้อมกันได้
    - **กันแถวผี:** แถวที่ว่างทั้งแถว (เช่น trailing row จาก CSV / ตัวคั่น section) **ไม่ถูกเติมเสมอ** (ไม่งั้นได้แถวที่มีแต่ค่าที่เติม) · default ยัง carry ค่าข้ามแถวว่างไปแถวถัดไป · `resetOnBlankRow` = ให้แถวว่างรีเซ็ต carry (เริ่มกลุ่มใหม่)
    - `stillBlank` = ช่องว่างที่เติมไม่ได้ (ไม่มีค่าให้พาไป เช่น ว่างตั้งแต่บนสุดตอน fill down)
  · UI `src\app\fill\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → auto-guess คอลัมน์ตู้/container/forwarder → เลือกคอลัมน์ (chips) + ทิศ (ลง/ขึ้น) + toggle →
    ผล = chips (เติมกี่ช่อง / ยังว่างกี่ช่อง) + ตารางไฮไลต์ **เขียวเฉพาะช่องที่ถูกเติม** (เดิมว่าง→มีค่า) + ดาวน์โหลด CSV/Excel
  · verify 2 ชั้น: (1) **Node test 36/36 ผ่าน**: fill down/up, ไม่ทับค่าเดิม, ว่างบนสุด→stillBlank, หลายคอลัมน์, trimBlank on/off, resetOnBlankRow, **แถวว่างไม่ถูกเติม (กันแถวผี) แต่ carry ต่อ**, invariant 100 แถว+input ไม่ mutate, คอลัมน์นอกช่วง, แถวสั้นขยาย, `[]`=แถวว่างข้าม
    (2) **Chrome UI จริง** (CSV container/tracking/kg 5 แถว + trailing row): auto-guess=container · down → เติม 3 (KY002/KY003→TU-A, KY005→TU-B) **แถวว่างท้ายคงว่าง ไม่เกิดแถวผี** ไฮไลต์เขียว 3 ช่อง ·
    up → เติม 2 (KY002/KY003←TU-B), KY005 ยังว่าง 1 · Excel `packing-เติม.xlsx` PK magic 16KB · **console สะอาด**
- 2026-07-10 — **เครื่องมือที่ 27 พร้อมใช้: ดึงข้อมูลข้ามไฟล์ (VLOOKUP) 🔗** (`/lookup`) — หมวด excel · เอาไฟล์หลัก A (เช่น packing list) มาดึงคอลัมน์จากไฟล์อ้างอิง B (เช่น export ที่มีน้ำหนัก/เลขตู้) match ตาม key (tracking) → เติมคอลัมน์เข้า A
  · **ต่างจากเครื่องมือเทียบเดิม:** reconcile = "เทียบ" A↔B แล้วไฮไลต์ตรง/ไม่ตรง/หาย · merge = ต่อแถว A+B (แนวตั้ง) · **lookup = ต่อคอลัมน์ตาม key (แนวนอน) = enrich**
  · engine `src\lib\lookup\lookup.ts` (pure): `lookupJoin(aHeader, aRows, aKeyCol, bHeader, bRows, bKeyCol, specs, opts)` → สร้าง index ของ B (key→row) แล้วเดินทุกแถว A เติมค่าที่ดึงมา
    - **ปรัชญา = ทุกแถวของ A อยู่ครบเสมอ (ไม่หาย/ไม่สลับลำดับ)** — แค่เติมคอลัมน์จาก B · แถวที่ไม่เจอ match → เติมค่าว่าง (invariant: outputRows === dataA.length, matched+unmatched === dataA.length, input ไม่ mutate)
    - `LookupSpec {bCol, name?}` เลือกได้หลายคอลัมน์ · `caseInsensitive`/`trim` (default on, normalize key ก่อนจับคู่) · `onMultiple: first|last` (ถ้า key ใน B ซ้ำ ใช้แถวไหน) · ตัดแถวว่างทั้งแถว 2 ฝั่ง · key ว่าง match ไม่ได้
    - stats: matched/unmatched/matchedKeys/`duplicateKeysB` (บอก key B ที่ซ้ำ = ambiguous)/blankKeyRowsA/addedCols/inputRows
  · UI `src\app\lookup\page.tsx` (client): 2 dropzone (A=ไฟล์หลัก sky · B=ไฟล์อ้างอิง violet) เลือกชีต/แถวหัว/คอลัมน์ key ต่อฝั่ง (auto-guess tracking) → เลือกคอลัมน์ B ที่จะดึง (chips) + toggle ci/trim + onMultiple →
    chips (เจอ/ไม่เจอ/key B ซ้ำ) + ตารางผล (คอลัมน์ที่ดึงมาไฮไลต์ violet + หัวติด "(B)") + ดาวน์โหลด CSV/Excel
  · verify 2 ชั้น: (1) **Node test 35/35 ผ่าน**: match ci/trim, first vs last wins (key B ซ้ำ), unmatched→null, blank key A, หลาย spec, duplicateKeysB นับถูก, invariant outputRows/order, input ไม่ mutate, spec นอกช่วงถูกกรอง
    (2) **Chrome UI จริง** (A `tracking,box` KY001-KY004 · B `tracking,kg,container` มี ky001/KY001 ซ้ำ): auto เลือก B cols kg+container · เจอ 3/ไม่เจอ 1 (KY003 ไม่มีใน B)/key B ซ้ำ 1 ·
    **first-wins** → KY001=10/TU-A · **last-wins** → KY001 พลิกเป็น 99/TU-DUP · KY003 เติมว่าง (ทุกแถว A ครบ ไม่หาย) · Excel `packing-ดึงข้อมูล.xlsx` PK magic 16KB · **console สะอาด**
- 2026-07-10 — **เครื่องมือที่ 28 พร้อมใช้: แยกคอลัมน์ ✂️➡️** (`/split-col`) — หมวด excel · แยกช่องเดียวที่มีค่าปนกันออกเป็นหลายคอลัมน์ตามตัวคั่น
  · use-case จริง: ช่องเดียวปนกัน เช่น "TU-A/123" (ตู้/เลข), "KY001-1" (tracking-กล่อง), "2024-01-15 นครปฐม" → แยกเป็นคอลัมน์แยกเพื่อ /group /sort /reconcile ต่อ
  · **ต่างจาก /split** (แยก "ไฟล์" เป็นหลายชีตตามค่าคอลัมน์) — อันนี้แยก "คอลัมน์" เป็นหลายคอลัมน์ในไฟล์เดิม
  · engine `src\lib\splitcol\splitcol.ts` (pure): `splitColumn(header, dataRows, col, {delimiter, maxParts, keepOriginal, trim, names})` → แตกช่องตาม **ตัวคั่น literal** (ไม่ใช่ regex → คาดเดาผลได้ 100%)
    - **ปรัชญาไม่ทำข้อมูล/แถวหาย:** จำนวนแถวเท่าเดิมเสมอ · จำนวนคอลัมน์ = จำนวนชิ้นมากสุด (auto) แถวสั้นเติม "" · **maxParts cap → ชิ้นเกินต่อกลับด้วยตัวคั่นเดิมใส่คอลัมน์สุดท้าย (ไม่ตัดทิ้ง)**
    - `keepOriginal` เก็บคอลัมน์เดิมไว้ด้วย · `trim` (default on) · error (คอลัมน์นอกช่วง/ตัวคั่นว่าง) → คืนของเดิมไม่แตะ · stats: parts/maxPartsFound/splitRows
  · UI `src\app\split-col\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → **auto-guess คอลัมน์+ตัวคั่น** (สแกนหาช่องที่มีตัวคั่นบ่อยสุด) →
    เลือกคอลัมน์/ตัวคั่น (+ปุ่มลัด / - , | ( - ) เว้นวรรค Tab) + toggle trim/keepOriginal + จำกัดจำนวนคอลัมน์ → ตารางผล (คอลัมน์ใหม่ไฮไลต์ฟ้า +✂️) + ดาวน์โหลด CSV/Excel
  · verify 2 ชั้น: (1) **Node test 43/43 ผ่าน**: แยกพื้นฐาน, keepOriginal, ชื่อ custom, ragged (เติม ""/แถวไม่หาย), maxParts cap ต่อกลับ, pad, trim on/off,
    solo/null→1 ชิ้น, ตัวคั่นหลายตัวอักษร, error (คอลัมน์/ตัวคั่น), **invariant ต่อชิ้นกลับ=ค่าเดิม (200 แถว) + input ไม่ mutate**
    (2) **Chrome UI จริง** (CSV `tracking,combo,note` combo="TU-A/123"..): auto-guess = combo + "/" · แยก 3 คอลัมน์ (KY003 "TU-C/789/extra"→789+extra ไม่หาย, KY004 solo→1 ชิ้น) ·
    maxParts 2 → KY003=TU-C, "789/extra" (ต่อกลับ) · keepOriginal → คอลัมน์ combo เดิมยังอยู่ + คอลัมน์ใหม่ต่อท้าย · Excel `packing-แยกคอลัมน์.xlsx` PK magic 17KB · **console สะอาด**
- 2026-07-10 — **เครื่องมือที่ 29 พร้อมใช้: รวมคอลัมน์ 🔗➡️** (`/combine-col`) — หมวด excel · **คู่กลับกับ /split-col** (แยก↔รวม)
  · use-case จริง: ต่อค่าเป็น key ผสม (tracking+กล่อง เพื่อเทียบ/dedup), ต่อ ตู้+เลข เป็นรหัสเดียว, ต่อวัน/เดือน/ปี → แล้วเอาไป /reconcile /group ต่อ
  · engine `src\lib\combinecol\combinecol.ts` (pure): `combineColumns(header, dataRows, cols, {separator, name, keepOriginals, trim, skipEmpty})` → ต่อค่าหลายคอลัมน์ตาม **ลำดับที่เลือก**
    - **ปรัชญาไม่ทำแถวหาย:** จำนวนแถวเท่าเดิมเสมอ · default `keepOriginals` = เพิ่มคอลัมน์รวมท้าย (เก็บของเดิม ไม่ทิ้ง) · ปิด = โหมดแทนที่ (เอาคอลัมน์รวมไปตำแหน่งคอลัมน์แรกที่เลือก ตัดที่เหลือ)
    - `skipEmpty` (default on) ข้ามชิ้นว่างกันตัวเชื่อมซ้ำ (A--B) · `trim` (default on) · `separator` ว่างได้ (ต่อชิด) · ชื่อ default = ชื่อหัวต้นทางต่อด้วย " + " · error (ไม่เลือกคอลัมน์) → คืนของเดิม
  · UI `src\app\combine-col\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด (เดาเลือก 2 คอลัมน์แรก) → **ลิสต์คอลัมน์ที่เลือกแบบมีลำดับ** (▲▼ สลับ/✕ ลบ) + ปุ่มคอลัมน์ทั้งหมด (กดเพิ่ม) +
    ตัวเชื่อม (+ปุ่มลัด - / _ , เว้นวรรค ไม่มี) + ชื่อหัว + toggle keepOriginals/trim/skipEmpty → ตารางผล (คอลัมน์รวมไฮไลต์ indigo +🔗) + ดาวน์โหลด CSV/Excel
  · verify 2 ชั้น: (1) **Node test 35/35 ผ่าน**: รวมพื้นฐาน, ชื่อ custom+ลำดับกลับ, replace (ติด/ไม่ติดกัน), skipEmpty on/off, separator ว่าง, trim on/off,
    ตัวเลข→string, คอลัมน์เดียว, ซ้ำ 2 ครั้ง, error (ไม่เลือก/นอกช่วง), partial oob, **invariant แถวไม่เปลี่ยน + input ไม่ mutate**, ragged row
    (2) **Chrome UI จริง** (CSV `ตู้,เลข,note`): default เลือก [ตู้,เลข] "-" → คอลัมน์ "ตู้ + เลข" = TU-A-123/TU-B-456/TU-C-789 (เก็บของเดิม) ·
    keepOriginals off → header [ตู้ + เลข, note], TU-A-123 อยู่ตำแหน่งแรก ตัดต้นทาง · Excel `codes-รวมคอลัมน์.xlsx` PK magic 16KB · **console สะอาด**
- 2026-07-10 — **เครื่องมือที่ 30 พร้อมใช้: ค้นหา-แทนที่ 🔁** (`/replace`) — หมวด excel · แก้ค่าซ้ำ ๆ ทั้งไฟล์ (bulk find & replace) · คู่กับ /clean /filter
  · use-case จริง: ตู้พิมพ์ผิด TU-A → TU-01 ทั้งไฟล์, ลบ "-"/"N/A" เป็นว่าง, normalize ค่าซ้ำ ๆ ก่อนเข้า Pacred
  · engine `src\lib\replacecell\replace.ts` (pure): `replaceInTable(header, dataRows, {find, replacement, mode, caseInsensitive, trimCompare, cols})` → 3 โหมด:
    - **contains** (default) = แทนทุก substring ที่เจอในช่อง (regex escape find + `$`→`$$` กัน replacement ตีความ $) · **exact** = ทั้งช่องต้องตรงเป๊ะ (มี trimCompare) → แทนทั้งช่อง · **regex** = ใช้ regex ตรง ๆ + กลุ่มจับ $1 $2
    - **ปรัชญาไม่แก้เงียบ:** คืน `cellsChanged`/`rowsAffected`/`samples` (cap 50 ก่อน→หลัง) ให้ดูก่อน · **แถวไม่หาย** (rows.length เท่าเดิม, input ไม่ mutate) · ข้ามช่องว่าง/null (ไม่สร้างค่าจากที่ว่าง) · `cols` จำกัดเฉพาะบางคอลัมน์
    - error: find ว่าง → "ต้องระบุข้อความที่จะค้นหา" · regex เสีย → "Regex ไม่ถูกต้อง: ..." (คืนของเดิมไม่แตะ)
  · UI `src\app\replace\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → ช่อง find→replacement + เลือกโหมด (มีคำนี้/ตรงทั้งช่อง/regex) +
    toggle ไม่สนพิมพ์เล็กใหญ่/ตัดช่องว่าง(exact)/จำกัดคอลัมน์ → chips (แก้กี่ช่อง/กี่แถว/จากกี่แถว) + ตัวอย่างก่อน→หลัง + ตารางไฮไลต์ช่องที่เปลี่ยน (indigo) + ดาวน์โหลด CSV/Excel
  · verify 2 ชั้น: (1) **Node test 38/38 ผ่าน**: contains (เดี่ยว/หลายครั้ง/ci), exact (+trimCompare, แทนเป็นว่าง), regex (capture $2/$1, ci, เสีย→error คืนเดิม),
    cols จำกัด, `$` ใน contains เป็นตัวอักษรจริง, ช่องว่าง/null ไม่แตะ, ตัวเลข→string, find ว่าง→error, samples cap 50, **invariant input ไม่ mutate + แถวคงเดิม**
    (2) **Chrome UI จริง** (CSV `tracking,container,note`): contains TU-A→TU-01 = แก้ 3 ช่อง/2 แถว (container 2 + note "TU-A test"→"TU-01 test") ·
    exact = แก้ 2 ช่อง (เฉพาะ "TU-A" เป๊ะ, "TU-A test" ไม่โดน) · regex `([A-Z]+)-([A-Z0-9]+)`→`$2/$1` = TU-A→A/TU สลับกลุ่มถูก · regex เสีย `([A-Z` → error chip + ปุ่มดาวน์โหลด disabled + ข้อมูลคืนเดิม ·
    Excel `packing-แทนที่.xlsx` PK magic 16KB · **console สะอาด**
- 2026-07-10 — **เครื่องมือที่ 31 พร้อมใช้: สร้างข้อความจากตาราง 📝** (`/template`) — หมวด excel · **ต่อยอด roadmap "Pacred paste-ready export"** (mail-merge ทั่วไป)
  · use-case จริง: แต่ละแถว packing list → 1 บรรทัดข้อความ (บรรทัด paste เข้า Pacred, ข้อความแจ้งลูกค้ารายกล่อง, SQL VALUES, สรุปต่อ tracking)
  · engine `src\lib\template\template.ts` (pure): `renderTemplate(header, dataRows, template, {joiner, skipEmptyRows, trimValues})` → แทน placeholder ต่อแถว
    - placeholder 2 แบบ: **{ชื่อหัว}** (จับตามชื่อคอลัมน์ — trim + ไม่สนพิมพ์เล็กใหญ่) · **{#N}** (คอลัมน์ลำดับ N, 1-based — กันชื่อหัวว่าง/ซ้ำ) · escape `{{`→`{` `}}`→`}`
    - **ปรัชญาไม่แทนมั่ว/ไม่ทิ้งเงียบ:** placeholder ที่หาไม่เจอ = **คงข้อความ `{x}` ไว้ให้เห็น + คืน `unknownTokens` เตือน** (ไม่แปลงเป็นว่าง) · ช่องว่าง/null → "" · **1 แถว → 1 บล็อก (แถวไม่หาย)**
    - `skipEmptyRows` (default on) ข้ามแถวว่างทั้งแถว (ไม่สร้างบรรทัดเปล่า) · `joiner` คั่นระหว่างแถว (default `\n`) · `trimValues` · error: template ว่าง → "ใส่รูปแบบข้อความ (template) ก่อน"
  · UI `src\app\template\page.tsx` (client): reuse parse/detect/FileDropzone → อัปโหลด (เดา template = ต่อทุกคอลัมน์ด้วย " · ") → **ปุ่มแทรกช่องที่ cursor** + textarea +
    เลือกตัวคั่นแถว/ข้ามแถวว่าง/ตัดช่องว่าง → พาเนลผลลัพธ์สด (chips บรรทัด/ข้ามว่าง/จากกี่แถว) + เตือน unknown token (amber) + คัดลอก/ดาวน์โหลด .txt
  · verify 2 ชั้น: (1) **Node test 38/38 ผ่าน**: จับตามชื่อ+ci+trim token, {#N} (+นอกช่วง→unknown คงไว้), unknown คงไว้+เตือน, escape `{{`/`}}`,
    ช่องว่าง→"", trimValues on/off, joiner กำหนดเอง, skipEmptyRows on/off (rowsUsed/skipped ถูก), template ว่าง→error, literal ล้วน, token ว่าง, multi-line, ตัวเลข/บูลีน→string, header ซ้ำ→ตัวแรก, **invariant input ไม่ mutate**
    (2) **Chrome UI จริง** (CSV `tracking,kg,container`): auto-template `{tracking} · {kg} · {container}` → `KY001 · 12 · TU-A` 2 บรรทัด (ข้ามแถวว่างท้าย 1) ·
    SQL `INSERT INTO pkg VALUES ('{tracking}', {kg}, '{weight}')` → resolve tracking/kg ถูก, `{weight}` ไม่รู้จัก **คงไว้ + amber warning** · ดาวน์โหลด `packing-ข้อความ.txt` ตรงกับ output · **console สะอาด**
- 2026-07-10 — **เครื่องมือที่ 32 พร้อมใช้: แตกแถว ↕️➡️** (`/explode`) — หมวด excel · **คู่กับ /split-col** (แตกเป็น "คอลัมน์" ↔ แตกเป็น "แถว")
  · use-case จริง: บางแถวใส่หลาย tracking ในช่องเดียว ("KY001, KY002, KY003") → แตกเป็น **1 tracking ต่อ 1 แถว** (คอลัมน์อื่นคัดลอกซ้ำ) เพื่อ normalize ก่อนเอาไป /reconcile /dedup /group
  · engine `src\lib\explode\explode.ts` (pure): `explodeRows(header, dataRows, col, {delimiter, trim, skipEmpty})` → split ช่องเป้าหมายด้วยตัวคั่น (literal) แล้ว **ทำซ้ำแถว 1 ชิ้น/แถว**
    - **ปรัชญาไม่ทำแถวหาย:** ทุกแถวออกอย่างน้อย 1 แถว — ช่องว่าง/null → คงแถวเดิม 1 แถว (ไม่แตะค่า) · ช่องที่เป็นตัวคั่นล้วน → คงค่าเดิม 1 แถว · **invariant: outputRows ≥ inputRows เสมอ** (+ input ไม่ mutate)
    - `trim` (default on) trim แต่ละชิ้น · `skipEmpty` (default on) ทิ้งชิ้นว่างจากตัวคั่นซ้อน (A,,B → A,B) · error: คอลัมน์นอกช่วง → "เลือกคอลัมน์ที่จะแตกแถว" · delimiter ว่าง → "ใส่ตัวคั่น..."
  · UI `src\app\explode\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → **auto-guess คอลัมน์+ตัวคั่น** (สแกนหาคอลัมน์ที่มีหลายค่าปนมากสุด) → เลือกคอลัมน์ (chips) + ตัวคั่น (+ปุ่มลัด , / | ; เว้นวรรค ขึ้นบรรทัด) + toggle trim/skipEmpty →
    chips (เข้า→ออก, แตกกี่แถว, +แถวใหม่) + ตารางผล (คอลัมน์เป้าหมายไฮไลต์ indigo +↕️) + ดาวน์โหลด CSV/Excel
  · verify 2 ชั้น: (1) **Node test 33/33 ผ่าน**: แตกพื้นฐาน (คอลัมน์อื่นคัดลอกซ้ำ), trim on/off, skipEmpty on/off (ตัวคั่นซ้อน), ช่องว่าง/null คงแถว, ตัวคั่นล้วน→1 แถว,
    ไม่มีตัวคั่น→1 แถว, แตกคอลัมน์กลาง, ตัวเลข→string, error (นอกช่วง/delimiter ว่าง คืนของเดิม), **invariant outputRows≥inputRows + input ไม่ mutate**, ragged row
    (2) **Chrome UI จริง** (CSV `tracking,box,container`, tracking = `"KY001, KY002, KY003"`): auto-guess = tracking + "," → 3→5 แถว, แตก 1 แถว
    (KY001/KY002/KY003 แต่ละแถว box=3 container=TU-A คัดลอกซ้ำถูก) · แถวว่างท้ายคงไว้ (ไม่หาย) · Excel `packing-แตกแถว.xlsx` PK magic 16KB · **console สะอาด**
- 2026-07-10 — **เครื่องมือที่ 33 พร้อมใช้: แปลงรูปแบบวันที่ 📅** (`/date`) — หมวด excel · normalize คอลัมน์วันที่ก่อนเรียง/เทียบ/เข้า Pacred
  · use-case จริง: packing list/export มีวันที่คนละรูปแบบปนกัน (10/07/2025, 2025-7-1, "68" ปี พ.ศ. 2 หลัก, YYYYMMDD, Excel serial) → อยากได้รูปแบบเดียวทั้งคอลัมน์
  · engine `src\lib\datefmt\datefmt.ts` (pure): `normalizeDates(header, dataRows, col, opts)` + `normalizeOneDate(cell, opts)` (export ไว้เทส/พรีวิว)
    - **ปรัชญา = ห้ามหาย + ห้ามเดามั่ว:** ช่อง parse ไม่ได้ → **คงค่าเดิม** (ไม่ทิ้ง ไม่แทนมั่ว) + นับ `unparsed` + เก็บ `unparsedSamples` (unique cap 50) โชว์เตือน · ช่องว่าง → คงว่าง · **rows.length คงเดิมเสมอ + input ไม่ mutate**
    - **กำกวม DD/MM vs MM/DD = ผู้ใช้เลือกเอง** (`dayFirst` default on) ไม่เดาให้ · ปีมาก่อน (4 หลักหน้า) = ชัดเจน ไม่สน dayFirst
    - parse: ISO ปีก่อน · DD/MM/YYYY (คั่นด้วย / - .) · YYYYMMDD 8 หลัก · Excel serial (typeof number, ช่วง 20000–60000 กันตัวเลขทั่วไปโดนตีความมั่ว, ค.ศ. อยู่แล้วไม่ปรับ พ.ศ.)
    - ปี 2 หลัก: พ.ศ.→2500+yy · ค.ศ.→pivot 70 (yy<70→20xx, ≥70→19xx) · **`buddhistInput` ลบ 543** (2568→2025, "68"→2568→2025) · **`buddhistOutput` บวก 543**
    - validate ช่วงเสมอ (เดือน 1-12, วันในเดือนจริง + leap year) → ผิด = ถือว่า parse ไม่ได้ (เช่น 31/02, 29/02 ปีปกติ) · 6 รูปแบบ output (ISO/DD-MM/MM-DD/DD-MM-/D MMM/YYYYMMDD)
  · UI `src\app\date\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → **auto-guess คอลัมน์วันที่** (จับชื่อหัว date/วันที่/eta/etd ก่อน ไม่งั้นสแกนค่าที่เป็นรูปวันที่) →
    เลือกคอลัมน์ (chips) + เลือกรูปแบบ output (chips มีตัวอย่าง) + toggle วันมาก่อน/พ.ศ.เข้า/พ.ศ.ออก → chips (แปลง/ตรงเดิม/อ่านไม่ออก/ว่าง) + แถบเตือนค่าที่อ่านไม่ออก + ตาราง (คอลัมน์เป้าหมายไฮไลต์ +📅) + ดาวน์โหลด CSV/Excel
  · verify 2 ชั้น: (1) **Node test 48/48 ผ่าน**: ISO/DD-MM/MM-DD/YYYYMMDD/คั่นจุด-ขีด, ปี 2 หลัก pivot, พ.ศ. เข้า/ออก (2568↔2025, "68"→2025), 6 output ครบ,
    validate (เดือน 13/วัน 32/31 ก.พ./29 ก.พ. ปีปกติ = null · 29 ก.พ. อธิกสุรทิน ผ่าน), Excel serial 45848→2025-07-10 (2025/99999 = null), เต็มตาราง (converted/unchanged/blank/unparsed คงค่าเดิม), col นอกช่วง=error, ไม่ mutate
    (2) **Chrome UI จริง** (CSV 6 แถว วันที่ปนรูปแบบ): แปลง 3 (10/07/2025→2025-07-10, 2025-7-1→2025-07-01, 20250710→2025-07-10), ตรงเดิม 1, อ่านไม่ออก 1 ("hello" คงเดิม), ว่างคงว่าง ·
    toggle พ.ศ.ออก → 2025→2568 · Excel `packing-วันที่.xlsx` PK magic 16KB · search "แปลงวันที่" หน้าแรก → การ์ด 📅 → /date · **console สะอาด**
- 2026-07-10 — **เครื่องมือที่ 34 พร้อมใช้: คอลัมน์คำนวณ ➗** (`/calc-col`) — หมวดคำนวณ · **เติมคอลัมน์ใหม่ที่คำนวณจากคอลัมน์เดิม** (computed column)
  · use-case จริง: น้ำหนัง × เรต = ค่าขนส่ง · CBM × 7000 = น้ำหนักคิดเงินขั้นต่ำ · จำนวนกล่อง × ราคาต่อกล่อง · กxยxส (ทำทีละคู่) · แปลงหน่วยด้วยตัวคูณคงที่
  · engine `src\lib\calccol\calccol.ts` (pure): `calcColumn(header, dataRows, opts)` → เติม 1 คอลัมน์ท้ายตาราง = `left op right`
    - **operand 2 แบบ:** `{kind:"col", col}` (ดึงจากคอลัมน์) หรือ `{kind:"const", value}` (ค่าคงที่ เช่น 7000) · op = `+ - * /` (`OP_LABEL`)
    - **ปรัชญาไม่แตะข้อมูลเดิม + ไม่เดามั่ว:** เติมคอลัมน์ใหม่ท้ายสุด ไม่แก้คอลัมน์เดิม · ช่องที่คำนวณไม่ได้ (operand ไม่ใช่ตัวเลข / **หารศูนย์ → null**) = **ปล่อยว่าง ไม่แทน 0** + นับ `skipped` โชว์ให้เห็น · **ทุกแถวออกครบเท่าเข้า** (rows.length คงเดิม, input ไม่ mutate)
    - `parseNumeric` inline (ตัด comma+trim, boolean/Infinity/ว่าง→null) · `round?` ปัดทศนิยม (null=ไม่ปัด, `roundTo` + Number.EPSILON) · error (ไม่ตั้งชื่อ/operand นอกช่วง) → คืนของเดิมไม่แตะ · samples cap 50
  · UI `src\app\calc-col\page.tsx` (client, route `/calc-col` เพราะ `/calc` ถูก VAT/กำไรใช้แล้ว): reuse parse/detect/columns/FileDropzone → อัปโหลด → เลือก operand ซ้าย/ขวา (toggle คอลัมน์/ค่าคงที่ + select คอลัมน์ หรือ input ค่าคงที่) + ปุ่ม operator (+ − × ÷) + ตั้งชื่อหัว + toggle ปัดทศนิยม (กี่ตำแหน่ง) → chips (คำนวณได้/คำนวณไม่ได้) + ตาราง (คอลัมน์ใหม่ไฮไลต์ emerald +➗) + ดาวน์โหลด CSV/Excel
    - **บทเรียน React 19:** `operandPicker(...)` เป็น **plain function เรียก inline** (ไม่ใช่ `<Component/>`) → กัน remount ทำ input เสีย focus ทุกคีย์
  · verify 2 ชั้น: (1) **Node test 32/32 ผ่าน**: บวก/ลบ/คูณ/หาร col×col & col×const, parseNumeric (comma/text/bool/blank), **หารศูนย์→ว่าง+skipped**, operand ไม่ใช่ตัวเลข→ว่าง, round on/off, ชื่อว่าง→error, operand นอกช่วง→error, newColIndex, samples cap 50, **invariant rows.length คงเดิม + input ไม่ mutate**
    (2) **Chrome UI จริง** (CSV `tracking,kg,rate` 4 แถว): kg×rate → KY001 10×50=500, KY002 2.5×40=100, **KY003 abc→ว่าง (skip)**, **KY004 "1,000"×2=2000 (comma)**, แถวว่าง→ว่าง · คำนวณได้ 3 · **หารศูนย์** (÷ const 0)→ทุกช่องว่าง คำนวณได้ 0 · **ปัด 2 ตำแหน่ง** (÷3) 3.33/0.83/333.33 · ปิดปัด→เต็มความละเอียด 3.3333... · Excel `freight-คำนวณ.xlsx` PK magic 16KB · **console สะอาด**
- 2026-07-10 — **เครื่องมือที่ 35 พร้อมใช้: % สัดส่วน & ยอดสะสม 📈** (`/percent`) — คอลัมน์วิเคราะห์ต่อแถว (ต่อจาก /stats ที่เป็นสรุปทั้งคอลัมน์, /group ที่รวมต่อกลุ่ม → อันนี้เติมค่าวิเคราะห์ราย "แถว")
  · use-case จริง: ตู้/tracking นี้คิดเป็นกี่ % ของน้ำหนักรวม · น้ำหนักสะสมไล่ลงมา · จัดอันดับตัวหนักสุด → ดูสัดส่วน/คัดตัวเด่นก่อน export
  · **ต่างจาก /calc-col** (คำนวณ 2 ค่าราย "แถว" อิสระ) — อันนี้ค่าที่คำนวณ **ขึ้นกับทั้งคอลัมน์** (ต้องรู้ยอดรวม/ลำดับ)
  · engine `src\lib\percent\percent.ts` (pure): `analyzeColumn(header, dataRows, opts)` → เติมได้ 4 metric (ตามลำดับที่เลือก):
    - **share** = ค่า ÷ ยอดรวม × 100 · **running** = ยอดสะสมไล่บนลงล่าง · **runningShare** = ยอดสะสม ÷ ยอดรวม × 100 · **rank** = อันดับ (competition 1-2-2-4, เลือกมากสุด/น้อยสุด = 1)
    - **ปรัชญาไม่แตะข้อมูลเดิม + ไม่เดามั่ว:** เติมคอลัมน์ท้ายตาราง · ช่องที่ไม่ใช่ตัวเลข → **เว้นว่าง ไม่นับเข้ายอดรวม/อันดับ** (running สะสมข้ามไป, ช่อง metric ของแถวนั้นว่าง) + นับ `skipped` · **ทุกแถวออกครบ** (rows.length คงเดิม, input ไม่ mutate)
    - `parseNumeric` inline (comma/trim, bool/Infinity/ว่าง→null) · `round?` ปัด % + ยอดสะสม (accumulator เก็บ full precision, ปัดตอนแสดง) · **total 0 → share/runningShare = null (กันหารศูนย์)** · error (col นอกช่วง/ไม่เลือก metric) → คืนของเดิม
  · UI `src\app\percent\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → **auto-guess คอลัมน์ตัวเลข** (นับช่องที่เป็นเลขมากสุด) → เลือกคอลัมน์ + chips เลือก metric (share/running/runningShare/rank) + toggle ทิศอันดับ + ปัดทศนิยม → chips (ยอดรวม/แถวตัวเลข/เว้นว่าง/เติมกี่คอลัมน์) + ตาราง (คอลัมน์ใหม่ไฮไลต์ emerald +📈) + ดาวน์โหลด CSV/Excel
  · verify 2 ชั้น: (1) **Node test 47/47 ผ่าน**: share/running/runningShare, rank desc/asc + ties (1-2-2-4), หลาย metric ตามลำดับ, ช่องไม่ใช่ตัวเลข→ว่าง+ไม่นับ (running ข้าม, rank ข้าม), comma parse, round on/off, **total 0→share null (กันหารศูนย์)**, ค่าติดลบ, error (col นอกช่วง/ไม่เลือก metric คืนของเดิม), **invariant rows.length + input ไม่ mutate + width ถูก + last running = total**, ragged row
    (2) **Chrome UI จริง** (CSV `container,kg` 4 แถว + abc + แถวว่าง): auto-guess = kg · share 10/30/60, สะสม 10/40/100, %สะสม 10/40/100, อันดับ (มากสุด=1) 3/2/1 · **abc→ทุก metric ว่าง (skip)**, แถวว่าง→ว่าง · chips ยอดรวม 100/แถวตัวเลข 3/เว้นว่าง 2 · toggle **น้อยสุด=1** → อันดับพลิก 1/2/3 · Excel `weights-สัดส่วน.xlsx` PK magic 16KB · **console สะอาด**
- 2026-07-10 — **เครื่องมือที่ 36 พร้อมใช้: แปลงเวลา Unix ⏱️** (`/timestamp`) — dev quick-win · เช็ค timestamp ใน payload MOMO API / แถว Supabase (created_at/updated_at เป็น epoch วินาที/มิลลิ) → อ่านเป็นวันเวลาจริง หรือกลับกัน
  · engine `src\lib\timestamp\timestamp.ts` (pure): `parseTimestamp(input, unit="auto")` → `TsResult` (ok/error/ms/unixS/unixMs/iso/utc/utcWeekday/local/localWeekday/localOffset/detected)
    - **ปรัชญาไม่เดามั่ว:** ตัวเลขล้วนกำกวมว่าเป็น s/ms/µs → auto เดาจากจำนวนหลัก (`guessUnit`: ≤11→s, ≤14→ms, else µs) **แต่ผู้ใช้เลือกทับได้** · parse ไม่ได้ = คืน error ชัด ไม่คืนค่ามั่ว (iso="")
    - `buildResult(ms, detected)` = source of truth · UTC คำนวณตรงจาก `getUTC*` (ยืนยันได้) · local จาก `get*` + `localOffsetLabel` (getTimezoneOffset → "UTC+7") · NaN/Invalid Date guard · วันในสัปดาห์ไทย (THAI_WEEKDAYS)
    - `unitToMs`: s→×1000, ms→คงเดิม, µs→floor(/1000) · unixS = floor(ms/1000) (เก็บ ms เต็มใน iso) · ข้อความไม่ใช่ตัวเลข → `Date.parse` (detected "ข้อความวันที่")
    - `nowResult(nowMs)` (detected "เวลาปัจจุบัน") · `formatRelative(ms, nowMs)` → "45 วินาทีที่แล้ว"/"3 ชั่วโมงที่แล้ว"/"ในอีก 5 ชั่วโมง"/"เมื่อกี้นี้" (inject now = เทสได้)
  · UI `src\app\timestamp\page.tsx` (client, ไม่ต้องอัปไฟล์): ช่อง input + ปุ่มหน่วย (auto/s/ms/µs) + ปุ่ม "⏱️ ตอนนี้" + ตัวอย่าง → การ์ดผล (badge detected + relative) + กล่อง UTC/local/epoch (แต่ละแถวมีปุ่มคัดลอก) + **นาฬิกาปัจจุบันสด** (อัพเดตทุกวินาที) · invalid = กล่องแดง
    - **นาฬิกาสด = `useSyncExternalStore`** (server snapshot = 0 → ไม่ render เวลาตอน SSR) เลี่ยงทั้ง hydration mismatch (Date.now() ต่างกัน server/client) + กฎ set-state-in-effect ของ React 19 · **บทเรียน:** ครั้งแรกใช้ `useState(()=>Date.now())`+useEffect → เจอ hydration error จริง (server ms ≠ client ms) → แก้ด้วย external store
  · verify 2 ชั้น: (1) **Node test 42/42 ผ่าน**: epoch 0→1970-01-01 พฤหัสบดี, 1e9 s→2001-09-09 อาทิตย์, 1234567890 s→2009-02-13 ศุกร์, auto 13หลัก→ms/16หลัก→µs, force ms/s override, ISO string/date-only parse, negative epoch, invalid/empty/blank→!ok, NaN guard, nowResult, formatRelative×6, unixS floor สำหรับ ms มีเศษ
    (2) **Chrome UI จริง**: `1700000000` auto→เดา s (badge "epoch วินาที (s) (เดาจาก 10 หลัก)"), 2023-11-14 22:13:20 อังคาร UTC, local 2023-11-15 05:13:20 พุธ (UTC+7), relative "2 ปีที่แล้ว" · ISO `2025-07-10T08:30:00Z`→detected "ข้อความวันที่" unixS 1752136200 · invalid→กล่องแดง ไม่มีการ์ดผล · **force ms** `1700000000`→ISO 1970-01-20T16:13:20 unixS 1700000 · นาฬิกาสด render หลัง mount · **console สะอาด ไม่มี hydration**
- 2026-07-10 — **เครื่องมือที่ 37 พร้อมใช้: ตารางสรุปไขว้ (Pivot) 🔲** (`/pivot`) — หมวด excel · ต่อจาก /group (สรุปมิติเดียว) → สรุป **2 มิติ** ในตารางเดียว · use-case: แถว = เลขตู้ (container), คอลัมน์ = forwarder, ช่อง = รวมน้ำหนัก/นับกล่อง
  · engine `src\lib\pivot\pivot.ts` (pure): `pivotTable(header, dataRows, rowField, colField, valueCol, agg, opts?)` → `PivotResult` (rowKeys/colKeys/cells[r][c]/counts/rowTotals/colTotals/grandTotal/inputRows/countedRows/emptyKeyRows/error)
    - 6 agg (`PivotAgg`): sum/count/avg/min/max/count-distinct · `aggNeedsValue` = false เฉพาะ count (นับจำนวนแถวในช่อง ไม่ใช้คอลัมน์ค่า) · ช่องไม่มีแถว → cell = null (counts = 0)
    - **invariant สำคัญ: ทุกแถวที่นับตกลงช่องเดียว** → ผลรวม counts ทุกช่อง = countedRows (ไม่หาย/ไม่ซ้ำ, มี test พิสูจน์ทุก agg) · **ยอดรวมคิดจากแถวจริงในกลุ่ม ไม่ใช่รวมค่าของช่อง** → avg/min/max ถูก (เช่น avg rowTotal TU-A = (10+20+3)/3 = 11 ไม่ใช่ (6.5+20)/2)
    - คีย์ว่าง → "(ว่าง)" · `ignoreEmptyKey` (default UI เปิด) ข้ามแถวคีย์แถว "หรือ" คอลัมน์ ว่าง (กัน subtotal/grand-total ปน) · `trim` จับกลุ่ม (default on) · ตัดแถวว่างทั้งแถวก่อนนับ · self-contained (inline `parseNumeric` ตามกฎ pure engine) · `pivotToCsv` (หัว `row \ col,...colKeys,รวม` + แถว + แถวรวมท้าย)
  · UI `src\app\pivot\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → auto-guess (แถว=container/ตู้, คอลัมน์=forwarder, ค่า=kg/cbm, sum) → เลือก row/col/agg/value (ซ่อน value เมื่อ count) + toggle ข้ามคีย์ว่าง →
    ตารางไขว้ (มุมหัว `row \ col` sticky, คอลัมน์ "รวม" เขียวขวา = rowTotals, แถว tfoot "รวม" เขียวล่าง = colTotals, grand มุมขวาล่าง) cap 50 คอลัมน์/300 แถว + chips (N แถว × M คอลัมน์) + ดาวน์โหลด CSV
  · verify 2 ชั้น: (1) **Node test 67/67 ผ่าน**: sum crosstab (cell/rowTotals/colTotals/grand/counts), count (นับแถว ช่องว่าง=null), avg (rowTotal จากแถวจริง=11 ไม่ใช่เฉลี่ยช่อง), min/max, count-distinct, คีย์ว่าง→(ว่าง)+emptyKeyRows, ignoreEmptyKey, trim on/off, ตัดแถวว่าง, sum non-numeric→0/avg→null, error (row/col/value นอกช่วง), aggNeedsValue, **invariant Σcounts=countedRows ทุก agg + Σcells=grand + input ไม่ mutate**, pivotToCsv, ragged row
    (2) **Chrome UI จริง** (CSV `container,forwarder,kg` 4 แถว): sum → TU-A [13,20] รวม 33, TU-B [5,ว่าง] รวม 5, colTotals [18,20] grand 38 · count → TU-A [2,1]/3, foot [3,1]/4, value picker ซ่อน+hint ขึ้น · avg → TU-A F1 6.5 **rowTotal 11** (แถวจริง) grand 9.5 · CSV blob `TU-B,5,,5` (ช่องว่าง=ว่าง) ชื่อ `packing-ตารางไขว้.csv` · **console สะอาด ไม่มี hydration**
- 2026-07-10 — **เครื่องมือที่ 38 พร้อมใช้: คลี่ตารางกว้าง → แนวยาว (Unpivot) 🔃** (`/unpivot`) — หมวด excel · **คู่กลับกับ /pivot** (pivot = long→wide สรุปไขว้ · unpivot = wide→long คลี่กลับ = melt/normalize)
  · use-case จริง: report มาแบบกว้าง (แถว = เลขตู้ มีคอลัมน์น้ำหนักแยกตาม forwarder เจ้าละคอลัมน์ หรือแยกตามเดือน) → คลี่เป็น **1 แถวต่อ 1 ค่า** พร้อมคอลัมน์บอกว่ามาจากหัวไหน → normalize ก่อนเอาไป /reconcile /group /pivot ต่อ
  · engine `src\lib\unpivot\unpivot.ts` (pure): `unpivotTable(header, dataRows, idCols, valueCols, opts?)` → `UnpivotResult` (header/rows/idCols/valueCols/inputRows/outputRows/droppedEmpty/error)
    - **ปรัชญาไม่ทิ้งข้อมูล:** แต่ละแถว input → N แถว output (N = จำนวนคอลัมน์ค่า) · คอลัมน์ id (ตรึงไว้) คัดลอกซ้ำครบทุกแถวที่คลี่ · outHeader = `[...ชื่อคอลัมน์ id, varName, valueName]` · **invariant: outputRows = inputRows × valueCols.length** (เมื่อไม่ dropEmpty)
    - `varName` (default "คอลัมน์") = หัวคอลัมน์บอกว่ามาจากหัวไหน · `valueName` (default "ค่า") = หัวคอลัมน์ค่า · ตัดแถวว่างทั้งแถวก่อน (isDataRow) · **ไม่แก้ค่าจริงในเซลล์** · หัวคอลัมน์ว่าง → `คอลัมน์ N`
    - `dropEmpty` = ข้ามแถว output ที่ค่าว่าง (ตารางกว้างมักมีช่องว่างเยอะ) · `trim` (default on) trim เฉพาะตอน "เช็คว่าว่าง" ไม่แตะค่าจริง · **ค่า 0 ไม่ถือว่าว่าง** · valueCols ว่าง → error · output เป็นตารางปกติ → UI ใช้ `rowsToCsv`/`rowsToXlsx` ตรง ๆ
  · UI `src\app\unpivot\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → **auto-guess** (สแกน 20 แถว: คอลัมน์ที่ ≥50% เป็นตัวเลข → คอลัมน์ค่า, ที่เหลือ → id) → เลือก id (chips ฟ้า) / คอลัมน์ค่า (chips เขียว) **แบบ mutually-exclusive** + ตั้งชื่อ varName/valueName + toggle dropEmpty →
    chips (เข้า→ออก, คลี่กี่คอลัมน์, ข้ามช่องว่าง) + ตารางผล (คอลัมน์ตัวแปร indigo, คอลัมน์ค่า เขียว, cap 300 แถว) + ดาวน์โหลด CSV/Excel
  · verify 2 ชั้น: (1) **Node test 39/39 ผ่าน**: คลี่พื้นฐาน, **invariant out=in×cols**, dropEmpty, ชื่อ var/value custom, ชื่อว่าง→default, หลาย id, ไม่มี id, valueCols ว่าง→error, หัวว่าง→`คอลัมน์ N`, ตัดแถวว่างทั้งแถว, แถว id-only เก็บ vs dropEmpty→0, id คัดลอกถูก, ragged row, คอลัมน์นอกช่วง, dropEmpty trim on/off, input ไม่ mutate, **ค่า 0 ไม่ถูก drop**
    (2) **Chrome UI จริง** (CSV `container,F1,F2,F3` 2 แถว, มีช่องว่าง 1): auto-guess = id container, ค่า F1/F2/F3 · คลี่ → "2 แถว → 6 แถว · คลี่ 3 คอลัมน์" (TU-A/F1/10 ถึง TU-B/F3/15, TU-B/F2 ว่างคงไว้) · dropEmpty → 2→5 "ข้ามช่องว่าง 1" · CSV blob `container,คอลัมน์,ค่า` + 5 แถว ชื่อ `widths-คลี่.csv` · Excel PK magic (80,75,3,4) 16KB `widths-คลี่.xlsx` · **console สะอาด**
- 2026-07-10 — **เครื่องมือที่ 39 พร้อมใช้: สลับแถว ↔ คอลัมน์ (Transpose) ↔️** (`/transpose`) — หมวด excel · ตระกูล reshape (pivot/unpivot/split-col/combine-col/explode) · พลิกกริดทั้งก้อน
  · use-case จริง: report บางอันหัวตารางอยู่ **แนวตั้ง** (แต่ละแถว = 1 ฟิลด์ เช่น น้ำหนัก/CBM/จำนวน) แต่ /group /pivot /reconcile ต้องการ "1 แถว = 1 record คอลัมน์ = ฟิลด์" → สลับให้ก่อน · หรือกลับกัน พลิกแนวยาวเป็นแนวกว้างเพื่ออ่านเทียบง่าย
  · engine `src\lib\transpose\transpose.ts` (pure): `transposeGrid(grid, opts?)` → `TransposeResult` (rows/inputRows/inputCols/outputRows/outputCols/droppedBlankRows/error) — `output[c][r] = input[r][c]`
    - **ปรัชญาไม่ทิ้งข้อมูล/ไม่แก้ค่า:** แค่ย้ายตำแหน่งเซลล์ · แถว ragged เติม null ให้เป็นสี่เหลี่ยม (width = คอลัมน์มากสุด) · **invariant: transpose(transpose(grid)) = grid เวอร์ชันสี่เหลี่ยม** (ค่าเดิมทุกช่อง) · outputRows = inputCols, outputCols = inputRows
    - `dropBlankRows` (default on) = ตัดแถวว่างทั้งแถวก่อนสลับ (กันคอลัมน์ว่างในผลลัพธ์ เช่น trailing row จาก CSV) · `trim` (default on) trim เฉพาะตอนเช็คว่าว่าง ไม่แตะค่าจริง · **ค่า 0/false ไม่ถือว่าว่าง** · กริดว่าง/ว่างล้วน→error · output เป็นตารางปกติ → UI ใช้ `rowsToCsv`/`rowsToXlsx` ตรง ๆ
  · UI `src\app\transpose\page.tsx` (client): reuse parse/detect/FileDropzone → อัปโหลด → เลือก "เริ่มจากแถว" (ข้ามหัวรายงาน/บล็อกสรุปด้านบนได้ — กริด = หัวตาราง+ข้อมูลตั้งแต่แถวนั้น) + toggle ตัดแถวว่าง →
    chip (RxC → CxR) + ตารางผล (คอลัมน์แรก = หัวเดิม ไฮไลต์ฟ้า, sticky index ซ้าย, cap 300 แถว × 60 คอลัมน์) + ดาวน์โหลด CSV/Excel
  · verify 2 ชั้น: (1) **Node test 33/33 ผ่าน**: สลับพื้นฐาน 2×3→3×2, **invariant double-transpose = สี่เหลี่ยมเดิม** (ปกติ+ragged), ragged เติม null, dropBlankRows on/off, ค่า 0/false คงไว้, แถวเดียว→คอลัมน์เดียว+กลับกัน, กริดว่าง/ว่างล้วน→error, input ไม่ mutate, trim on/off, mixed types, ลำดับคงเดิม
    (2) **Chrome UI จริง** (CSV `container,forwarder,kg` 3 แถวจริง + trailing blank): dropBlankRows on → 4×3→3×4 "ตัดแถวว่าง 1" ผล `container,TU-A,TU-A,TU-B` / `forwarder,F1,F2,F1` / `kg,10,20,5` (คอลัมน์แรก=หัวเดิม) · toggle off → 5×3→3×5 (trailing blank → คอลัมน์ว่างท้าย) · CSV 3 แถว 4 คอลัมน์ ขึ้นต้น container ชื่อ `widths-สลับ.csv` · Excel PK magic (80,75,3,4) 16KB `widths-สลับ.xlsx` · **console สะอาด**
- 2026-07-10 — **เครื่องมือที่ 40 พร้อมใช้: นับความถี่ค่า (Value Frequency) 🔢** (`/frequency`) — หมวด excel · value_counts / COUNTIF summary / Pareto ต่อ 1 คอลัมน์ · เร็วกว่า /group แบบคลิกเดียว (ไม่ต้องตั้ง agg)
  · use-case จริง: "มีกี่รายการต่อ forwarder / ต่อสถานะ / ต่อเลขตู้" รู้ทันที + ได้ **% และ % สะสม (Pareto 80/20)** เห็นว่าค่าไหนกินสัดส่วนเยอะ
  · engine `src\lib\frequency\frequency.ts` (pure): `computeFrequency(header, dataRows, col, opts?)` → `FreqResult` (items[{value,isBlank,count,percent,cumulativePercent}]/total/distinct/blankCount/inputRows/error) + `frequencyToCsv`
    - **ปรัชญาอ่านอย่างเดียว ไม่แก้ข้อมูล:** จับกลุ่มด้วยค่า normalize (trim/พิมพ์เล็กใหญ่) แต่ **แสดงค่าจริงตามที่พบครั้งแรก** · ตัดแถวว่างทั้งแถวก่อนนับ (กัน trailing row) · **invariant: ผลรวม count ทุกกลุ่ม = total**
    - `trim` (default on) · `caseInsensitive` (default off — logistics code ตัวพิมพ์มีความหมาย) · `ignoreBlank` (default off = ช่องว่าง→กลุ่ม "(ว่าง)") · เลข 10 (number) กับ "10" (string) จับกลุ่มเดียวกัน (valueStr canonical)
    - 4 sort (`FreqSort`): count-desc/count-asc/value-asc/value-desc · count-desc tie แตกด้วยค่า (localeCompare th, numeric) · cumulativePercent สะสมตามลำดับที่จัดเรียง (จบที่ 100)
  · UI `src\app\frequency\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → **auto-guess คอลัมน์** (ชื่อหัวเข้าข่าย container/forwarder/status/เดือน ก่อน ไม่งั้นคอลัมน์ที่ค่าซ้ำเยอะสุด = distinct/filled ต่ำสุด) →
    เลือกคอลัมน์ (chips single-select) + dropdown เรียง + toggle trim/ci/ignoreBlank → chips (นับ N ช่อง/M ค่า/ช่องว่าง/มากสุด) + ตาราง (ค่า/จำนวน/%/แท่งสัดส่วน/% สะสม) sticky header + ดาวน์โหลด CSV
  · verify 2 ชั้น: (1) **Node test 50/50 ผ่าน**: count-desc/asc + value sort, tie แตกด้วยค่า, percent+cumulative (monotonic จบ 100), trim on/off, ci on/off, blank→"(ว่าง)"/ignoreBlank, number+string จับกลุ่ม, ตัดแถวว่างทั้งแถว, col นอกช่วง→error, ragged, input ไม่ mutate, **invariant Σcount=total**, csv (66.67/100 + escape comma)
    (2) **Chrome UI จริง** (CSV `container,kg` 8 แถว: TU-A×4/TU-B×2/TU-C×1/ว่าง×1): auto-เลือก container · count-desc → TU-A 4/50%/50%สะสม, TU-B 2/25%/75%, (ว่าง) 1/12.5%/87.5%, TU-C 1/12.5%/100% (tie เรียงตามค่า, สะสมจบ 100) · ignoreBlank → 7 ช่อง/3 ค่า, % คิดใหม่ (TU-A 57.1%) จบ 100 · CSV 4 บรรทัด หัว `container,จำนวน,%,% สะสม` ชื่อ `packing-ความถี่.csv` · **console สะอาด**
- 2026-07-10 — **เครื่องมือที่ 41 พร้อมใช้: ตาราง → ข้อความ 📋** (`/table-text`) — dev quick-win · แปลงตารางเป็นข้อความพร้อม paste (Markdown/จัดคอลัมน์/TSV)
  · use-case จริง: paste ตารางเข้า PR/README/docs/แชท (Markdown GitHub table) · ทำโน้ตอ่านง่าย (จัดคอลัมน์ monospace) · ก๊อปเข้า Excel/Sheets แล้วแตกคอลัมน์เอง (TSV)
  · engine `src\lib\tabletext\tabletext.ts` (pure): `tableToText(header, dataRows, opts?)` → `TableTextResult` (text/format/outputRows/outputCols/numericCols/droppedBlankRows/error) · 3 รูปแบบ (`TableTextFormat`: markdown/aligned/tsv)
    - **ปรัชญาแค่จัดรูป ไม่แก้ค่า:** ตัดแถวว่างทั้งแถวก่อน (เลือกได้) · **escape ตามรูปแบบกันตารางเพี้ยน:** markdown `|`→`\|` + ขึ้นบรรทัด→`<br>` · TSV tab/newline ในเซลล์→ช่องว่าง · aligned newline→ช่องว่าง · number canonical (ไม่ใส่ comma), 0/false ไม่ถือว่าว่าง
    - **เดาคอลัมน์ตัวเลข** (ในช่องไม่ว่าง เป็นเลข ≥ ครึ่งหนึ่ง, ตัด comma ก่อน) → markdown ใส่ `---:` (ชิดขวา) · aligned pad ชิดขวา · `alignNumericRight` (default on, ปิดได้ · TSV ไม่ใช้)
    - aligned: กว้างคอลัมน์นับ **code point** (`Array.from` กัน emoji/surrogate เกิน) + เส้นคั่นใต้หัว + ตัด trailing space ทุกบรรทัด · `includeHeader` (default on) · ragged row เติมช่องว่างให้เต็ม width
  · UI `src\app\table-text\page.tsx` (client): reuse parse/detect/FileDropzone → อัปโหลด → เลือกแถวหัวตาราง → เลือกรูปแบบ (3 ปุ่ม) + toggle (รวมหัว/ชิดขวาตัวเลข/ตัดแถวว่าง) → พาเนล `<pre>` โชว์ผลสด + chips (แถว×คอลัมน์/คอลัมน์ตัวเลข/ตัดแถวว่าง) + คัดลอก/ดาวน์โหลด (.md/.txt/.tsv)
  · verify 2 ชั้น: (1) **Node test 43/43 ผ่าน**: markdown (sep `---:` เฉพาะคอลัมน์ตัวเลข, escape `|`/newline, no-header, align off), aligned (pad+ชิดขวาเลข, เส้นคั่น, ไม่มี trailing ws, no-header), tsv (tab-join, escape tab/newline),
    ตัดแถวว่าง (on/off), เดาตัวเลข (majority rule, comma numbers, minority→text), ragged เติมช่อง, empty→error, 0/false ไม่ drop, number ไม่ใส่ comma, input ไม่ mutate
    (2) **Chrome UI จริง** (CSV `tracking,kg,container` 3 แถว + แถวว่าง): chips "3 แถว × 3 คอลัมน์ · คอลัมน์ตัวเลข 1 · ตัดแถวว่าง 2" · markdown → `| --- | ---: | --- |` (kg ชิดขวา) · aligned → kg ชิดขวา (12/5.5/340) + เส้นคั่น · TSV → tab-join 4 บรรทัดไม่มีเส้นคั่น · ดาวน์โหลด `packing-ตาราง.tsv` 65B เริ่ม "tracking" มี tab 4 บรรทัด · **console สะอาด**
- 2026-07-10 — **เครื่องมือที่ 42 พร้อมใช้: ตรวจอักขระซ่อน & ช่องว่างแปลก 👻** (`/whitespace`) — หมวดจัดระเบียบ · **แก้ปัญหา reconcile ที่แสบสุด**: tracking 2 ค่าดู "เหมือนกันเป๊ะ" แต่ match ไม่ได้เพราะมี NBSP/zero-width/ช่องว่างแฝงที่ตาไม่เห็น
  · engine `src\lib\hiddenchars\hiddenchars.ts` (pure): `scanHidden(header, dataRows, opts?)` → `HiddenScanResult` (findings[{row,col,before,after,issues,changed}]/cleanedRows/counts/affectedCells/affectedRows/changedCells/scannedCells) + `detectIssues(s)` + `cleanCell(s,opts)` + `visualize(s)`
    - 7 หมวดปัญหา (`IssueKey`): leading/trailing (ช่องว่างหัว-ท้าย รวม unicode space) · double (ช่องว่าง ASCII ซ้ำ) · tab · nbsp (Zs family U+00A0/2000-200A/202F/205F/3000/1680) · zerowidth (U+200B-200D/2060/FEFF) · control (C0/C1 non-printable รวม \n\r ยกเว้น tab)
    - **ปรัชญาตรวจให้เห็นก่อนแล้วค่อยล้าง ไม่แก้เงียบ:** detect ทุกหมวดเสมอ (diagnostic) · clean ตาม option ที่เลือก · **เฉพาะช่อง string** (number/bool/null ไม่มีอักขระซ่อน = ไม่แตะ) · **ไม่ทำแถวหาย/ไม่เพิ่มแถว** (cleanedRows รูปเดิม, input ไม่ mutate)
    - clean options 6 ตัว (default on): normalizeUnicodeSpace (NBSP→space) · tabToSpace · removeZeroWidth (ลบ) · stripControl (→space) · collapseSpaces (ยุบ) · trim · **idempotent** (ล้างซ้ำได้ผลเดิม + detectIssues หลังล้าง = ว่าง)
    - iterate ด้วย `Array.from` (code point, กัน surrogate) · `visualize` แปลงตัวมองไม่เห็นเป็นสัญลักษณ์ (·=space →=tab ␣=nbsp ∅=zero-width ⍰=control) ให้ตาเห็นใน UI
  · UI `src\app\whitespace\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → เลือกแถวหัว → chips เลือกคอลัมน์ที่ตรวจ (default ทุกคอลัมน์) + toggle วิธีล้าง 6 →
    ถ้าสะอาด = badge เขียว · ถ้าพบ = chips นับต่อหมวด (7 สี) + ตาราง findings (แถว/คอลัมน์/**ก่อน-แสดงอักขระซ่อน**/หลังล้าง/ปัญหา sticky header) + ดาวน์โหลด CSV/Excel (ล้างแล้ว)
    - **บั๊กที่เจอ+แก้ตอน verify:** เผลอส่ง `columnOptionLabel(header, c)` (ทั้ง array) → `String(array)` join comma โชว์ "A · tracking,kg,note" ทุกคอลัมน์ · แก้เป็น `columnOptionLabel(header[c], c)` (helper รับ "1 เซลล์หัว" ไม่ใช่ทั้ง array)
  · verify 2 ชั้น: (1) **Node test 63/63 ผ่าน**: detectIssues (7 หมวด + ideographic space=nbsp + BOM=zerowidth + leading nbsp + order canonical + multi), cleanCell (trim/collapse/nbsp→space/tab→space/zw ลบ/control→space + ทุก option off + **idempotent**),
    scanHidden (affectedCells/affectedRows/counts, cleanedRows ถูก, changedCells, number ไม่แตะ, scannedCells เฉพาะ string, cols filter, note "has space" single-space ไม่ใช่ปัญหา, empty→error, bad cols→error, **input ไม่ mutate**), visualize, number/bool ข้าม
    (2) **Chrome UI จริง** (CSV tracking มี " KY002 "/NBSP/zero-width): พบ 3 ช่อง/3 แถว · chips นับ leading/trailing/nbsp/zerowidth ละ 1 · findings แสดง `·KY002·`→KY002, `KY␣003`→`KY·003` (NBSP→space), `KY∅004`→KY004 · CSV ล้างแล้ว `dirty-ล้างอักขระ.csv` 80B: KY002 trim/KY 003 (nbsp→space)/KY004 (zw ลบ), 6 บรรทัดครบ · **console สะอาด**
- 2026-07-10 — **เครื่องมือที่ 43 พร้อมใช้: ตรวจเลขขาดช่วง (Sequence Gap) 🕳️** (`/seq-gap`) — หมวดจัดระเบียบ · ตอบปัญหา "เลขที่ควรต่อเนื่องแต่บางเลขหาย" (เลขกล่อง/เลขใบ/running number)
  · **ต่างจาก /gap:** gap = หาช่อง "ว่าง/เป็น 0" · อันนี้ = หา "เลขที่ควรมีในลำดับแต่ไม่โผล่" เช่น กล่อง 1-500 แต่ 37, 52 หาย
  · engine `src\lib\seqgap\seqgap.ts` (pure): `findSequenceGaps(header, dataRows, col, opts)` → `SeqGapResult` (present/missing/duplicates[{value,count}]/min/max/rangeStart/rangeEnd/expectedCount/presentInRange/missingCount/skipped/outOfRange/...) + `extractInt(cell,mode)` + `seqGapToCsv` + `summarizeRanges`
    - 3 โหมดดึงเลข (`ExtractMode`): **trailing** (default, เลขชุดท้าย เช่น KY001→1) · **leading** (เลขชุดหน้า เช่น 12-A→12) · **whole** (ทั้งช่องเป็นเลข, ตัด comma, regex `^[+-]?\d+$`) · ใช้ `Number.isSafeInteger` กันเลขใหญ่เกิน
    - **ปรัชญาอ่านอย่างเดียว ไม่แก้ข้อมูล + ไม่เดามั่ว:** ช่องที่ดึงเลขไม่ได้ = นับ `skipped` ให้เห็น (ไม่ทิ้งเงียบ) · number cell ที่เป็น float/bool/null → null
    - กำหนดช่วงเองได้ (`rangeStart`/`rangeEnd`) ทับ min/max ในข้อมูล → จับตัวท้าย ๆ ที่หายได้ (เช่นไฟล์มีถึง 480 แต่ควรถึง 500) · guard `SPAN_CAP` 2M กัน loop ค้าง · `MISSING_CAP` 5000 · duplicates = เลขที่ count>1
    - `summarizeRanges` ย่อ `[4,7,8,9,11..15]` → `"4, 7-9, 11-15"` อ่านง่าย
  · UI `src\app\seq-gap\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → **auto-guess คอลัมน์+โหมด** (หัวเข้าข่าย box/เลขที่/tracking/running ก่อน ไม่งั้นคอลัมน์ที่ trailing ดึงเลขได้มากสุด; เลือก whole ถ้าเป็นเลขล้วน) →
    เลือกคอลัมน์ (chips) + โหมดดึงเลข (dropdown) + ช่วงตั้งแต่/ถึง (auto ถ้าเว้นว่าง) → chips (ขาดกี่เลข/ช่วง+ควรมี+มีจริง/ซ้ำ/ดึงไม่ได้/นอกช่วง) + กล่องเลขที่หาย (แดง + range summary) + กล่องเลขซ้ำ (amber) + CSV เลขที่หาย
  · verify 2 ชั้น: (1) **Node test 61/61 ผ่าน**: extractInt (trailing/leading/whole, comma/neg/float reject/number cell/bool/null/blank/no-digit/leading-zero), findSequenceGaps (basic missing, tracking trailing, duplicates, skipped, custom range เติมล่าง-บน, narrow→outOfRange, invalid range, span too wide, empty/col oob/no-number errors, **input ไม่ mutate**, ragged row), seqGapToCsv, summarizeRanges
    (2) **Chrome UI จริง** (CSV box 1,2,3,5,6,10 + KY002 ซ้ำ): auto-guess = tracking + trailing → ขาด 4 เลข [4,7,8,9] ช่วง 1-10 ควรมี 10 มีจริง 6, ซ้ำ 1 ค่า [2 ×2] · ตั้ง ถึง=15 → ขาด 9 [4,7,8,9,11-15] summary "4, 7-9, 11-15" · คอลัมน์ B (box) + whole → ผลเดียวกัน · CSV `boxes-เลขขาด.csv` 50B (หัว+9 เลข) · **console สะอาด**
- 2026-07-10 — **เครื่องมือที่ 44 พร้อมใช้: รวมแถวซ้ำ (Rollup) 🗜️** (`/rollup`) — หมวด excel · ตอบ use-case แกนหลัก packing list: **1 tracking แตกหลายกล่อง/หลายแถว → ยุบเป็น 1 แถว/tracking พร้อมยอดรวม kg/CBM/กล่อง**
  · **ต่างจากเครื่องมือใกล้เคียง:** /dedup = ลบแถวซ้ำทิ้ง (ไม่รวมยอด) · /group = สร้างตารางสรุปเฉพาะ key+ยอด (**คอลัมน์อื่นหาย**) · /rollup (อันนี้) = **เก็บทุกคอลัมน์เดิม** แค่ยุบแถว → ตัวเลขรวมยอด, คอลัมน์อื่นเก็บค่าตัวแทน (แรก/สุดท้าย)
  · engine `src\lib\rollup\rollup.ts` (pure): `rollupByKey(header, dataRows, keyCols, sumCols, opts)` → `RollupResult` (header/rows/inputRows/outputRows/collapsedRows/groups/emptyKeyRows/droppedEmpty/droppedBlank/biggestGroup/error)
    - key หลายคอลัมน์ได้ (composite) · `otherMode: first|last` (คอลัมน์อื่นเก็บค่าจากแถวแรก/สุดท้ายของกลุ่ม) · `trim` (default on) · `caseInsensitive` (default off) · `addCount` (เพิ่มคอลัมน์ "จำนวนแถวรวม") · sumCol ที่ทับ keyCol ถูกกันออกจาก sum อัตโนมัติ
    - sum: parse ตัด comma+trim, ปัด 1e6 กัน float error · **คอลัมน์ที่ไม่มีค่าตัวเลขเลย → เว้นว่าง (ไม่กุ 0)** · **ปรัชญาไม่ทำข้อมูลหายเงียบ:** คีย์ว่างคงเป็นแถวเดี่ยว (ไม่ยุบมั่วรวมกัน) เว้นสั่ง `dropEmptyKey` · ตัดแถวว่างทั้งแถวก่อน (droppedBlank) · input ไม่ mutate
    - **invariant: outputRows + collapsedRows + droppedEmpty + droppedBlank = inputRows** (มี test 200 แถว)
  · UI `src\app\rollup\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → auto-guess (key=tracking/awb/ref, sum=kg/cbm/box/qty ที่เป็นตัวเลข ≥50%) → chips key (sky 🔑) + chips sum (emerald Σ, ปิดตัวที่เป็น key) + otherMode dropdown + toggle trim/ci/dropEmptyKey/addCount → chips สรุป (เข้า→ออก/ยุบรวม/กลุ่ม/ใหญ่สุด/คีย์ว่าง/ตัดแถวว่าง) + ตารางผล (sticky header, sum ชิดขวา Σ, key 🔑) + ดาวน์โหลด CSV/Excel
  · verify 2 ชั้น: (1) **Node test 44/44 ผ่าน**: collapse+sum kg, multi-col sum, otherMode first/last, keep-first container (แถวหลังคีย์ว่าง), composite key 2 คอลัมน์, trim+caseInsensitive, mixed non-numeric (รวมเฉพาะเลข), no-numeric→ว่าง, comma numbers, float rounding (0.1+0.2=0.3), addCount, empty-key แยกเดี่ยว, dropEmptyKey, fully-blank dropped, sumCol/keyCol overlap กันออก, **invariant 200 แถว**, input ไม่ mutate, errors, ragged row
    (2) **Chrome UI จริง** (CSV `tracking,box,kg,cbm,container` KY001×3 กล่อง + KY002 + แถวคีย์ว่าง + แถวว่างล้วน): auto-guess key=tracking, sum=box/kg/cbm · ยุบ 6→3: **KY001 box 3 / kg 17.5 / cbm 0.17 / container TU-A (kept-first แม้แถว 2-3 ว่าง)**, KY002, **คีย์ว่างคงเดี่ยว** · addCount → คอลัมน์ "จำนวนแถวรวม" (3/1/1) · dropEmptyKey → ตัดแถวคีย์ว่าง เหลือ 2 แถว · CSV 112B 3 บรรทัด (คีย์ว่างถูกตัด, KY001 17.5+TU-A) · Excel 16388B sheet MIME · **console สะอาด**
- 2026-07-10 — **เครื่องมือที่ 45 พร้อมใช้: หาค่าที่คล้ายกัน (Near-duplicate) 🫧** (`/near-dup`) — หมวดจัดระเบียบ · จับคู่ค่าที่ **"คล้ายกันแต่ไม่เหมือนเป๊ะ"** ในคอลัมน์เดียว (พิมพ์ผิด O↔0, สลับตัว, ช่องว่างเกิน) ที่ทำให้ reconcile จับคู่ไม่ติด/นับซ้ำ — เช่น KY001 vs KYO01
  · **ต่างจากเครื่องมือใกล้เคียง:** /dedup = ซ้ำเป๊ะ · /whitespace = อักขระล่องหน · /list-compare = set diff (มี/ไม่มี) · /near-dup (อันนี้) = **ระยะแก้ไข (edit distance / Levenshtein)** — คล้ายแค่ไหนถึงนับว่า "น่าจะพิมพ์ผิด" · **ปรัชญาไม่เดามั่ว:** โชว์คู่ที่น่าสงสัยให้ดูก่อน ไม่แก้ให้อัตโนมัติ
  · engine `src\lib\neardup\neardup.ts` (pure): `findNearDuplicates(header, dataRows, col, opts)` → `NearDupResult` (pairs/distinctValues/totalRows/blankRows/pairCount/cappedPairs/error) + `levenshteinCapped(aCps, bCps, cap)` (export แยกเทส) + `nearDupToCsv`
    - **Levenshtein cap เร็ว:** ทำงานบน **code point** (`Array.from`+codePointAt — รองรับ unicode/ไทย/emoji), length prefilter (`|la-lb|>cap` → cap+1), early-exit เมื่อทั้งแถวเกิน cap → คืน cap+1 (ไม่คำนวณต่อ) · จับกลุ่มตามค่า normalize (trim/ci/collapseSpaces) แต่ **แสดงค่าจริงตัวแรกที่พบ**
    - `maxDistance` (default 1 = จับพิมพ์ผิดทีละตัว แม่นสุด) · `caseInsensitive` (default on) · `trim` (default on) · `collapseSpaces` (default off) · similarity = `1 - distance/maxLen` · **เรียง:** ระยะน้อยก่อน (ใกล้สุด=น่าสงสัยสุด) → similarity มากก่อน → a,b (localeCompare th)
    - guard: `ROWS_CAP` 200 (index แถวต่อค่า), `PAIRS_CAP` 5000 (คู่สูงสุด), `DISTINCT_CAP` 3000 (ค่าไม่ซ้ำเกินนี้ = O(n²) ช้าเกิน → error บอกให้กรอง/แยกไฟล์) · แถวว่าง → blankRows (ข้าม) · exact dup (distance 0) **ไม่นับเป็น near** (ต้อง 1..maxDistance) · self-contained (import แค่ *type* ผ่าน `@/`)
  · UI `src\app\near-dup\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → **auto-guess คอลัมน์** (ชื่อหัวเข้าข่าย tracking/awb/ref/ตู้/container/hbl/forwarder/เลข/code ก่อน ไม่งั้นคอลัมน์ข้อความ (numeric<90%) ที่ค่าไม่ซ้ำเยอะสุด) → เลือกคอลัมน์ (chips indigo) + dropdown ต่างได้ 1-3 ตำแหน่ง + toggle ci/trim/collapseSpaces →
    chips สรุป (พบกี่คู่/ค่าไม่ซ้ำ·จากกี่แถว/ช่องว่าง/เตือนคู่เยอะเกิน) + การ์ดรายคู่ (amber, `A ×countA ≈ B ×countB` + badge "ต่าง N ตำแหน่ง" + "คล้าย N%") cap 500 คู่ + ดาวน์โหลด CSV
  · verify 2 ชั้น: (1) **Node test 55/55 ผ่าน**: levenshteinCapped (identical/sub/ins/del/2-edit/over-cap→cap+1/length-prefilter/empty/ไทย/O↔0), near-dup พื้นฐาน (KY001~KYO01), exact dup ไม่นับ near, ci default merge, maxDistance 2 จับ 2-char typo, similarity 0.8, blank ข้าม, row index จับถูก (rowsA [0,1] countA 2), trim/collapseSpaces merge, multi-pair เรียงตามระยะ, number cell stringify, errors (empty/col-oob), no-near, input ไม่ mutate, ragged row, csv export (+escape comma), transposition ต้อง dist2
    (2) **Chrome UI จริง** (CSV `tracking,kg`: KY001×2/KYO01/TU-A123/TU-A124/MN888): auto-guess = tracking · พบ 2 คู่ (TU-A123≈TU-A124 ต่าง 1 คล้าย 86%, KY001×2≈KYO01×1 ต่าง 1 คล้าย 80%), MN888 ไม่จับคู่ (ไกล), count KY001=2 ถูก, เรียง similarity มากก่อน · dropdown ต่างได้ 2 (AAAA/AAAB/AACC) → 1 คู่ → 3 คู่ เรียงระยะ (dist1 ก่อน 2×dist2) · CSV 175B หัว `ค่า A,ค่า B,ระยะแก้ไข,ความคล้าย,จำนวน A,จำนวน B` 4 บรรทัด 6 คอลัมน์ text/csv · **console สะอาด**
- 2026-07-10 — **เครื่องมือที่ 46 พร้อมใช้: จับค่าตัวเลขผิดปกติ (Outlier) 🚩** (`/outlier`) — หมวดจัดระเบียบ · จับค่าน้ำหนัก/CBM/จำนวนที่ **"สูง-ต่ำผิดปกติเทียบกับเพื่อน ๆ"** (น่าจะกรอกผิด เกินศูนย์ 50→5000 / จุดทศนิยมเลื่อน 0.5→0.05) ที่ทำให้ยอดรวมเพี้ยน ตรวจตาไม่ทัน
  · **ต่างจาก /gap:** /gap จับแค่ช่อง 0/ว่าง · อันนี้จับ **"ค่ามีอยู่แต่ผิดปกติ"** (สูง/ต่ำกว่าเพื่อนมาก) · **ปรัชญาไม่เดามั่ว:** โชว์ค่าที่น่าสงสัยให้ดูก่อน ไม่แก้ให้
  · engine `src\lib\outlier\outlier.ts` (pure): `findOutliers(header, dataRows, col, opts)` → `OutlierResult` (outliers/method/numericValues/outlierCount/blankRows/nonNumeric + สถิติ min/max/q1/median/q3/iqr/mean/stddev/lowerBound/upperBound/error) + `outlierToCsv`
    - 2 วิธี: **IQR** (default, robust ไม่ต้องสมมติการกระจาย) — รั้ว q1−k·iqr / q3+k·iqr, k default 1.5 · **z-score** (mean ± k·sd, k default 3) · percentile type-7 (เหมือน Excel PERCENTILE.INC) · sample stddev (หาร n−1)
    - **guard false positive:** IQR=0 (ค่ากระจายน้อยมาก) → **ไม่ flag** · stddev=0 → ไม่ flag · numericValues < 4 → error (คำนวณ quartile ไม่มีความหมาย) · score = กี่เท่าของ IQR ที่พ้นรั้ว (IQR) / |z| (zscore) · เรียง score มากก่อน → row
    - `parseNumeric` inline (ตัด comma+trim, boolean/Infinity/ว่าง→null) · ตัดแถวว่าง/ไม่ใช่ตัวเลข (นับ blankRows/nonNumeric แยก) · self-contained (import แค่ *type* ผ่าน `@/`) · ไม่ mutate input
  · UI `src\app\outlier\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → **auto-guess คอลัมน์ตัวเลข** (ชื่อหัวเข้าข่าย kg/weight/cbm/box/qty/price/amount ที่ numericRatio≥0.5 ก่อน ไม่งั้นคอลัมน์ตัวเลขมากสุด) → เลือกคอลัมน์ (chips rose) + dropdown วิธี (IQR/z-score) + ความเข้มงวด (k) →
    การ์ดสถิติ (min/Q1/median/Q3/max/mean) + chips สรุป (พบกี่ค่า/ค่าตัวเลข/ช่วงปกติ/ไม่ใช่ตัวเลข/ช่องว่าง) + การ์ดรายค่า (rose, "แถว N" + ค่า + badge ▲สูง/▼ต่ำผิดปกติ + score ×IQR/SD) + ดาวน์โหลด CSV
  · verify 2 ชั้น: (1) **Node test 67/67 ผ่าน**: IQR พื้นฐาน (5000 สูงผิดปกติ), quartile type-7 (1..9→q1 3/median 5/q3 7/iqr 4), ค่าต่ำผิดปกติ, IQR=0 guard, k 1.5 vs 3, z-score, stddev=0 guard, mean/sample stddev, score 2×IQR (1..12+31), หลาย outlier เรียง score, blank+nonNumeric นับ/ข้าม, comma parse, ค่าลบ, ค่าน้อยเกิน→error, empty/col-oob error, คอลัมน์อื่น, input ไม่ mutate, ragged row, number cell, csv (หัว IQR/z-score + escape comma)
    (2) **Chrome UI จริง** (CSV `name,kg`: 10-15 + 5000): auto-guess = kg (rose ON) · พบ 1 ค่าผิดปกติ (5000 สูงผิดปกติ), สถิติ min/Q1/median/Q3 ครบ · dropdown IQR→Z-score reactive (k options เปลี่ยนเป็น 2/2.5/3 SD, ยังจับ 5000, โชว์ mean/stddev) · CSV 132B หัวมี แถว+IQR 2 บรรทัด 4 คอลัมน์ text/csv · **console สะอาด**
- 2026-07-10 — **เครื่องมือที่ 47 พร้อมใช้: ตรวจความถูกต้องตามกฎ (Data Validation) 🛡️** (`/validate`) — หมวดจัดระเบียบ · **rule-based validation** — ตั้งกฎที่ข้อมูลควรเป็น แล้วบอกว่าแถวไหนช่องไหนผิดกฎอะไร ก่อน export เข้า Pacred
  · **ต่างจากเครื่องมือตรวจข้อมูลตัวอื่น (ครบ 3 มุม):** /gap = จับแค่ 0/ว่าง · /outlier = จับค่าเพี้ยนเชิงสถิติ · **/validate (อันนี้) = rule-based** ตรวจตามกฎที่ผู้ใช้กำหนดเอง (รูปแบบ/ช่วง/รายการ/ความซ้ำ) · **ปรัชญาไม่แก้เงียบ:** โชว์จุดที่ผิดให้ดูก่อน ไม่แก้ให้
  · engine `src\lib\validate\validate.ts` (pure): `validateTable(header, dataRows, rules)` → `ValidateResult` (violations/totalRows/validRows/invalidRows/violationCount/ruleCount/byRule/error) + `validateToCsv` + `RULE_LABEL`/`ruleNeedsParam`
    - **10 ชนิดกฎ (`RuleType`):** required (ต้องมีค่า) · number (ตัวเลข) · integer (จำนวนเต็ม) · min/max (ช่วงค่า) · min-length/max-length (ความยาว — นับ **code point** ผ่าน `Array.from` รองรับไทย/emoji) · pattern (regex, มี ci) · allowed (อยู่ในรายการ คั่นด้วย comma, มี ci) · unique (ห้ามซ้ำ, มี ci)
    - **ปรัชญาไม่เดามั่ว:** ช่องว่าง = **ข้ามทุกกฎยกเว้น required** (ฟิลด์ไม่บังคับที่เว้นว่าง = ผ่าน type/range) · 0/false ไม่ถือว่าว่าง (required ผ่าน) · min/max บนช่องไม่ใช่ตัวเลข → violation ชัด · unique = 2-pass (นับ normalize ก่อน แล้ว flag ทุกแถวที่ count>1, ช่องว่างไม่นับ)
    - **pre-compile กฎ + error ชัด:** col นอกช่วง → `กฎข้อ N: เลือกคอลัมน์...` · min/max param ไม่ใช่ตัวเลข → error · pattern regex เสีย → error (ไม่ crash) · allowed ว่าง → error · ตารางว่าง/ไม่มีกฎ → error · VIOLATIONS_CAP 5000 · ตัดแถวว่างทั้งแถว (isDataRow) · self-contained (import แค่ *type* ผ่าน `@/`) · ไม่ mutate input
  · UI `src\app\validate\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → **auto-seed กฎ required** บนคอลัมน์ key ที่เดา (tracking/awb/ref/ตู้/code) → แถวแก้กฎ (เลือกคอลัมน์ + ชนิดกฎ 10 แบบ + ช่อง param เฉพาะกฎที่ต้องการ + toggle Aa สำหรับ pattern/allowed/unique + ✕ ลบ · ปุ่ม + เพิ่มกฎ) → chips (พบกี่จุดผิด/แถวผ่าน/แถวมีปัญหา/จากกี่แถว) + chips สรุปต่อกฎ (แดง) + ตาราง violations (แถว/คอลัมน์/ค่า/กฎ/เหตุผลไทย sticky) + ดาวน์โหลด CSV
    - **บทเรียน:** `RuleRow extends Rule { id }` (id คงที่ กัน input เสีย focus ตอนเพิ่ม/ลบกฎ) · เปลี่ยนชนิดกฎ → reset param/ci
  · verify 2 ชั้น: (1) **Node test 64/64 ผ่าน**: required (0 ไม่ถือว่าว่าง), number (comma ok/blank skip), integer, min/max (+non-numeric flag +param error), min-length/max-length (+code-point ไทย/emoji), pattern (+ci +regex เสีย error), allowed (+ci), unique (+ci flag ทุก dup, blank ไม่นับ), หลายกฎหลายคอลัมน์ (byRule), แถวว่างข้าม, errors (empty/no-rules/col-oob), ragged row, input ไม่ mutate, RULE_LABEL/ruleNeedsParam, CSV (header/col-name/escape/fallback "คอลัมน์ N")
    (2) **Chrome UI จริง** (CSV `tracking,kg,container` 5 แถว มี blank tracking/kg=abc/container BADCODE/KY001 ซ้ำ): auto-seed required บน tracking → 1 violation (แถว 2 ว่าง) · เพิ่ม 3 กฎผ่าน UI (number/kg + pattern `^[A-Z]{4}[0-9]{7}$`/container + unique/tracking) → **5 จุดผิด** (unique KY001×2, required blank, number abc, pattern BADCODE), container ถูก (ABCD1234567/WXYZ7654321) ไม่ถูก flag · chips viol 5/pass 0/bad 5/from 5 · byRule (required 1/number 1/pattern 1/unique 2) · CSV 571B หัว `แถว,คอลัมน์,ค่า,กฎ,เหตุผล` 6 บรรทัด text/csv · **console สะอาด**
- 2026-07-10 — **เครื่องมือที่ 48 พร้อมใช้: ดึงข้อความด้วย pattern 🎯** (`/extract`) — หมวดจัดระเบียบ · ดึงส่วนที่ตรง regex ออกจากช่องเดียว (เช่น เลขตู้/tracking ที่ปนใน note/รายละเอียด) มาเป็นคอลัมน์ใหม่ เพื่อเอาไป /group /reconcile /sort ต่อ
  · **ต่างจากตระกูล split/regex/replace:** /split-col = แยกตามตัวคั่น literal ตามตำแหน่ง · /regex = เล่นกับข้อความเดี่ยว (ไม่รู้จักตาราง) · /replace = ค้นหา-แทนที่ในที่เดิม · **/extract (อันนี้) = ดึงส่วนที่ match ออกมาเป็นคอลัมน์ใหม่** (ไม่แก้ค่าเดิม)
  · engine `src\lib\extract\extract.ts` (pure): `extractColumn(header, dataRows, col, opts)` → `ExtractResult` (header/rows/newCols/groupCount/matchedRows/unmatchedRows/blankRows/inputRows/error) + `extractToCsv`
    - **capture group → 1 คอลัมน์/กลุ่ม:** ไม่มีกลุ่ม → ดึงทั้ง match 1 คอลัมน์ (`ชื่อ (ดึง)`) · มี N กลุ่ม → N คอลัมน์ (`ชื่อ #1..#N`) · `countGroups` ใช้กลวิธี empty-alternative (`new RegExp(src+"|").exec("")` → length-1) · non-capturing `(?:)` นับ 0, named group นับเป็นกลุ่ม, กลุ่มที่ match ไม่ติดในทางเลือก → ""
    - **2 โหมด:** first (match แรก, non-global exec) · all (`matchAll` global รวมทุก match ต่อด้วย separator default ", ", zero-width safe ไม่ค้าง) · caseInsensitive เติม flag i
    - **ปรัชญาไม่ทำแถวหาย/ไม่เดามั่ว:** จำนวนแถวเท่าเดิมเสมอ · ช่องต้นฉบับว่าง → blankRows (ข้าม ไม่นับ matched/unmatched) · match ไม่ได้ → เว้นว่าง + นับ unmatchedRows · keepOriginal (default true) เก็บคอลัมน์เดิม · error (col นอกช่วง/pattern ว่าง/regex เสีย) → คืนของเดิมไม่แตะ · self-contained (import แค่ *type* ผ่าน `@/`) · ไม่ mutate input
  · UI `src\app\extract\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → **auto-guess คอลัมน์ free-text** (หัวเข้าข่าย note/detail/รายละเอียด/หมายเหตุ ก่อน ไม่งั้นคอลัมน์ข้อความยาวเฉลี่ยมากสุด) → เลือกคอลัมน์ + ช่อง pattern (font-mono) + ปุ่ม preset (เลขตู้ `[A-Z]{4}[0-9]{7}`/ตัวเลข/ทศนิยม/ตัวอักษร/รหัส) + toggle โหมด first/all (+ช่อง separator เมื่อ all) + caseInsensitive + keepOriginal → chips (ดึงเป็น N คอลัมน์ (M กลุ่ม)/ดึงได้/ไม่ match/ช่องว่าง) + ตาราง (คอลัมน์ใหม่ไฮไลต์ sky +🎯) + ดาวน์โหลด CSV/Excel
  · verify 2 ชั้น: (1) **Node test 63/63 ผ่าน**: whole-match (ไม่มีกลุ่ม), capture groups → หลายคอลัมน์, keepOriginal true/false, blank→blankRows (null preserved), mode all join + all+groups, custom separator, custom/partial names, caseInsensitive, non-capturing นับ 0, named group นับ, undefined alternation group→"", number cell stringify, errors (regex เสีย/col oob/pattern ว่าง คืนของเดิม), ragged row, input ไม่ mutate, invariant rows.length + matched+unmatched+blank=input, zero-width all ไม่ค้าง, extractToCsv (escape comma), empty-header fallback `คอลัมน์ 1 (ดึง)`
    (2) **Chrome UI จริง** (CSV `note,box` 5 แถวจริง + trailing blank, note ปนโค้ด): auto-guess = note · default `[0-9]+` → ดึง 1234567/7654321/1112223 (ดึงได้ 3/ไม่ match 1/ช่องว่าง 2) · preset เลขตู้ `[A-Z]{4}[0-9]{7}` → ABCD1234567/WXYZ7654321/MNOP1112223 (whole match) · capture `([A-Z]{4})([0-9]{7})` → 2 คอลัมน์ `note #1 🎯` (ABCD/WXYZ) + `note #2 🎯` (1234567/7654321) · CSV 210B หัว note/#1/#2/box 7 บรรทัด text/csv · **console สะอาด**
- 2026-07-10 — **เครื่องมือที่ 49 พร้อมใช้: ออกเลขลำดับ #️⃣** (`/row-number`) — หมวดจัดระเบียบ · เติมคอลัมน์เลขรัน (No. 1..N) ให้ทุกแถว เพื่อ numbering line item packing list ก่อน export เข้า Pacred หรือออกเลขกล่องแยกต่อตู้/tracking
  · **ต่างจาก /seq-gap (หา "เลขที่ควรมีแต่หาย") · /calc-col (คำนวณจากคอลัมน์เดิม):** อันนี้ "สร้างเลขลำดับใหม่" เป็นคอลัมน์เดียว
  · engine `src\lib\rownum\rownum.ts` (pure): `addRowNumber(header, dataRows, opts)` → `RowNumberResult` (header/rows/inputRows/numbered/skipped/groups/newColIndex/error)
    - **type-preserving:** `plain = prefix==="" && suffix==="" && padWidth<=0` → ปล่อยเป็น **number จริง** (ให้ /sort /group ใช้ต่อได้) · ไม่งั้น → string `prefix + padNumber + suffix` · `padNumber` รักษาเครื่องหมายลบ (`-001`)
    - **group mode = per-key running counter** (Map<string,number>): ค่ากลุ่มเดียวกันโผล่อีก = นับต่อจากเดิม ไม่รีเซ็ต → sorted/unsorted ก็ถูก · `trimGroup` (default on) trim คีย์ก่อนเทียบ
    - **ปรัชญาไม่ทำแถวหาย/ไม่แก้ค่าเดิม:** เติมคอลัมน์เดียว จำนวนแถวเท่าเดิมเสมอ · `skipBlankRows` (default on) แถวว่างทั้งแถว → ช่องเลขว่าง (กันเลขติดแถวผี) counter ไม่ advance · start/step/padWidth/position(start·end) ปรับได้ · rectangularize แถว ragged · error (name ว่าง/groupCol นอกช่วง) → คืนของเดิม · self-contained (import แค่ *type*) · ไม่ mutate input
  · UI `src\app\row-number\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → เลือก header → ตั้งชื่อคอลัมน์/เริ่ม/ก้าว/เติม 0/prefix/suffix + toggle ตำแหน่ง(หน้าสุด·ท้ายสุด) + toggle นับแยกต่อกลุ่ม (auto-guess คอลัมน์ตู้/container) + toggle แถวว่างไม่ใส่เลข → chips (ออกเลข N/แถวว่าง M/N กลุ่ม) + ตาราง (คอลัมน์ใหม่ไฮไลต์ indigo +#️⃣) + ดาวน์โหลด CSV/Excel
  · verify 2 ชั้น: (1) **Node test 51/51 ผ่าน**: running พื้นฐาน (number type), start/step custom, padWidth zero-pad (string), prefix+suffix, prefix only, position end, group per-key running ([1,2,1,3,2] groups 2), group+pad+prefix, skipBlankRows กลางตาราง ([1,"",2,""]) + off, trimGroup on/off, step 0, error (name ว่าง/groupCol oob คืนของเดิม), invariant length + numbered+skipped=input (100 แถว), input ไม่ mutate, ragged row (["x",null,1]), empty dataRows, group blank row skip (key ไม่ advance), negative pad ("-001","000")
    (2) **Chrome UI จริง** (CSV `container,tracking` 5 แถวจริง TU-A×3/TU-B×2 + blank กลาง + trailing blank): default → ลำดับ 1,2,3,[ว่าง],4,5 (chips ออกเลข 5/แถวว่าง 2) · เปิดนับแยกกลุ่ม (auto=container) → TU-A 1,2,3 · TU-B 1,2 (per-key running, chips 2 กลุ่ม) · padWidth 3 + prefix "BOX-" → BOX-001..BOX-003 (string, per-group) · position ท้ายสุด → คอลัมน์ `ลำดับ #️⃣` ย้ายไปขวาสุด · CSV 142B 8 บรรทัด header+BOX text/csv · **console สะอาด**
- 2026-07-10 — **เครื่องมือที่ 50 พร้อมใช้: อ่านเลขเป็นบาทถ้วน 💰** (`/baht-text`) — หมวดงานออฟฟิศ · แปลงจำนวนเงินเป็นข้อความไทย (บาทถ้วน/สตางค์) สำหรับบรรทัด "จำนวนเงินตัวอักษร" ในใบแจ้งหนี้/ใบกำกับ/ใบเสร็จงานนำเข้า-ส่งออก
  · engine `src\lib\bahttext\bahttext.ts` (pure, ไม่ต้องอัปไฟล์): `bahtText(input)` → `BahtTextResult` (ok/text/amount/baht/satang/negative/error) + `readInteger(intStr)` (export ไว้เทส)
    - **deterministic ล้วน:** input เดียว → ผลเดียว · ปัดเป็น **จำนวนสตางค์เต็ม** (`Math.round(abs*100)` แล้วหาร) เลี่ยง float error · รองรับ number หรือ string (ตัด comma/ช่องว่าง) + ค่าติดลบ
    - **กฎอ่านเลขไทยครบ:** เอ็ด (21→ยี่สิบเอ็ด, 101→หนึ่งร้อยเอ็ด, 11→สิบเอ็ด — เช็คว่ามีหลักสูงกว่าที่ไม่ใช่ 0 ในกลุ่ม) · ยี่สิบ · สิบ (ไม่ใช่หนึ่งสิบ) · ล้านซ้ำได้ (แบ่งกลุ่มละ 6 หลักจากขวา → `readGroup` ต่อด้วย "ล้าน".repeat(n) เช่น ล้านล้าน)
    - **ปรัชญาไม่คืนขยะ:** ว่าง/ไม่ใช่ตัวเลข/Infinity/NaN → ok=false + error ไทยชัด (ไม่คืนข้อความมั่ว) · ปัดแล้วเป็น 0 → "ศูนย์บาทถ้วน" (ไม่ใส่ "ลบ") · มีเฉพาะสตางค์ (0.50) → "ห้าสิบสตางค์" (ไม่มีคำว่าบาท) · สตางค์=0 → "...บาทถ้วน"
  · UI `src\app\baht-text\page.tsx` (client): ช่องกรอกจำนวนเงิน (autoFocus, inputMode decimal) + ปุ่มตัวอย่าง → การ์ดผลลัพธ์สด (ข้อความบาทถ้วนตัวใหญ่ + ปุ่มคัดลอก) + chips แยก (จำนวน/บาท/สตางค์) · ค่าผิด → กล่องแดง
  · verify 2 ชั้น: (1) **Node test 81/81 ผ่าน**: readInteger (0/หน่วย/สิบ/เอ็ด/ยี่สิบ/ร้อย/พัน/หมื่น/แสน/ล้าน/พันล้าน/ล้านล้าน, 101→เอ็ด, 110→สิบ, 1000001→ล้านหนึ่ง), bahtText (บาทถ้วน, สตางค์อย่างเดียว, บาท+สตางค์, ปัดเศษ 1.006→หนึ่งสตางค์ / 2.125→สิบสามสตางค์, ติดลบ, -0.001→ศูนย์, string+comma, error empty/abc/Infinity/NaN, fields baht/satang/amount/negative)
    (2) **Chrome UI จริง**: 1,234.50 → "หนึ่งพันสองร้อยสามสิบสี่บาทห้าสิบสตางค์" (chips บาท 1,234/สตางค์ 50) · 21000000 → "ยี่สิบเอ็ดล้านบาทถ้วน" · 0.50 → "ห้าสิบสตางค์" · -1234.50 → "ลบ...บาทห้าสิบสตางค์" · 1000001 → "หนึ่งล้านหนึ่งบาทถ้วน" · abc → กล่องแดง "ไม่ใช่ตัวเลขที่ถูกต้อง" · search "บาทถ้วน" หน้าแรก → การ์ด → /baht-text · **console สะอาด**
- 2026-07-11 — **เครื่องมือที่ 51 พร้อมใช้: แมปค่าตามพจนานุกรม 🗺️** (`/map`) — หมวด excel · แทนค่าทั้งคอลัมน์ทีเดียวตาม "พจนานุกรม" ที่พิมพ์เอง (รหัส forwarder → ชื่อเต็ม, รหัสสถานะตู้/ประเทศ/ท่าเรือ → ข้อความ)
  · **ต่างจากเครื่องมือแทนค่าเดิม:** `/replace` = ค้นหา-แทนทีละคู่ · `/lookup` = ดึงจากไฟล์อ้างอิงตาม key · **อันนี้ = ใส่หลายคู่ (พจนานุกรมสั้น ๆ ที่จำง่าย) แล้วแทนทีเดียวทั้งคอลัมน์**
  · engine `src\lib\valuemap\valuemap.ts` (pure): `parseMapping(text)` + `applyValueMap(header, dataRows, col, mapping, opts)` → `ValueMapResult` (header/rows/inputRows/entries/mappedCells/unmatchedCells/blankCells/unmatchedSamples/newColIndex/error)
    - `parseMapping`: บรรทัดละ 1 คู่ `from=to` · ตัวคั่นเลือก **ซ้ายสุด** ของ tab/`=`/`,` (value มีตัวคั่นได้เพราะ split เฉพาะตัวแรก) · บรรทัดว่าง/ไม่มีตัวคั่น/key ว่าง = ข้าม · ไม่ trim ตอน parse (คงช่องว่างใน from/to)
    - **ปรัชญาไม่ทำแถวหาย/ไม่แทนมั่ว:** ค่าที่ไม่มีในพจนานุกรม → **default เก็บของเดิม (keep)** + เก็บ `unmatchedSamples` (unique, cap 50) โชว์ให้ดูก่อน (เลือก blank = ทำเป็นว่างได้) · ช่องว่างคงว่าง (นับ blankCells) · **rows.length เท่าเดิม + input ไม่ mutate** · rectangularize แถวให้เท่า width
    - `mode: replace` (แทนในคอลัมน์เดิม) / `new-column` (เพิ่มคอลัมน์ท้าย, ชื่อ default `${หัวคอลัมน์} (แมป)`) · `caseInsensitive` (default off) + `trim` (default on) normalize key · lut `Map` key ซ้ำ = ตัวหลังทับ (dedup ตาม normalize) · number cell → stringify ก่อนเทียบ (map "10=สิบ" ได้) · error: col นอกช่วง → "เลือกคอลัมน์ที่จะแมปค่า" · mapping ว่าง → "ใส่ตารางแมปค่าอย่างน้อย 1 บรรทัด (เช่น TU-A=ตู้เอ)" (คืนของเดิมไม่แตะ)
  · UI `src\app\map\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → auto-guess คอลัมน์ (forwarder/สถานะ/รหัส/ตู้/ประเทศ/ท่าเรือ) + ปุ่ม "เดาให้" → textarea พจนานุกรม (นับคู่สด) + toggle โหมด(แทน/เพิ่มคอลัมน์)/ค่าที่ไม่มี(เก็บ/ว่าง)/ci/trim + ชื่อคอลัมน์ใหม่ → chips (แมปได้/ไม่มีในพจนานุกรม/ว่าง/พจนานุกรมกี่คู่) + กล่อง amber โชว์ค่าที่ยังไม่มีในพจนานุกรม + ตาราง (คอลัมน์แมปไฮไลต์ indigo +🗺️) + ดาวน์โหลด CSV/Excel
  · verify 2 ชั้น: (1) **Node test 81/81 ผ่าน**: parseMapping (=/tab/comma, ซ้ายสุดชนะ, value มีตัวคั่น, บรรทัดว่าง/ไม่มีตัวคั่น/key ว่างข้าม, to ว่างได้, CRLF, ไม่ trim), applyValueMap (replace mapped/unmatched keep+blank, new-column เพิ่มคอลัมน์+ชื่อ default/custom, ci on/off, trim on/off, blank cells null/ว่าง, number stringify "10=สิบ", unmatchedSamples unique+cap 50, error col oob/mapping ว่างคืนของเดิม, dedup last-wins + ci dedup, **invariant input ไม่ mutate + rows.length เท่าเดิม**, ragged rectangularize)
    (2) **Chrome UI จริง** (CSV `tracking,forwarder,kg` 5 แถว + trailing blank): auto-guess = B·forwarder · map `TU-A=ตู้เอ\nTU-B=ตู้บี` → แมปได้ 3/ไม่มีในพจนานุกรม 1 (TU-X โชว์กล่อง amber)/ว่าง 2 (KY005+trailing) คอลัมน์ไฮไลต์ = ตู้เอ,ตู้บี,ตู้เอ,TU-X(keep) · new-column → หัว `forwarder (แมป) 🗺️` ต่อท้าย + คอลัมน์เดิมไม่แตะ (แถว0 TU-A|ตู้เอ) · unmatched=blank → TU-X → ว่าง · CSV 123B/text/csv/7 บรรทัด (ตู้เอ มา, TU-X หาย) · **console สะอาด**
- 2026-07-11 — **เครื่องมือที่ 52 พร้อมใช้: ตรวจเลขตู้คอนเทนเนอร์ 📦** (`/container-check`) — หมวดโลจิสติกส์ · จับเลขตู้พิมพ์ผิดในไฟล์ก่อนเอาเข้า Pacred (deterministic ล้วน ยืนยันได้ด้วย vector จริง — ไม่ใช่ barcode ที่สแกนผิดได้)
  · **มาตรฐาน ISO 6346:** เลขตู้ = 4 ตัวอักษร (owner 3 + category 1) + 6 ตัวเลข (serial) + 1 ตัวเลข (check digit) เช่น CSQU3054383 → เช็คดิจิต 3
    - อัลกอริทึม: ค่าประจำตัวอักษร A=10 เพิ่มทีละ 1 **ข้ามค่าที่หาร 11 ลงตัว** (B=12 C=13...K=21 L=23...U=32 V=34...Z=38) · แต่ละหลัก (10 ตัวแรก) × 2^ตำแหน่ง(0..9) รวม · mod 11 · ได้ 10 → check digit = 0
  · engine `src\lib\containercheck\containercheck.ts` (pure): `letterValue(ch)` · `containerCheckDigit(prefix)` (10 ตัว→0..9 หรือ null ถ้า char ผิด/ยาวผิด) · `validateContainer(raw)` → `ContainerValidation` (ok/status: valid|bad-format|bad-check/normalized/expected/given/category) · `resultLabel(v)` · `checkContainers(header, dataRows, col, opts)` → `ContainerCheckResult`
    - normalize: พิมพ์ใหญ่ + ตัดช่องว่าง/ขีด (`csqu-3054383`, `MSKU 070613 5` อ่านได้) · regex `^[A-Z]{4}[0-9]{7}$` ผ่านก่อนคำนวณ · category (ตัวที่ 4) เก็บเป็นข้อมูล ไม่ hard-fail
    - **ปรัชญาไม่แก้เลขเดิม/ไม่ตัดสินมั่ว:** **เพิ่มคอลัมน์ "ผลตรวจเลขตู้" ต่อท้ายเสมอ** (ไม่ทับคอลัมน์เดิม) · ช่องว่าง → ข้าม+นับ blank · ตัวที่ผิดเก็บใน `findings` (cap 50) โชว์ก่อน · bad-check บอกเลขที่ควรเป็น (`✗ เช็คดิจิตผิด (ควรเป็น N)`) · rows.length เท่าเดิม + input ไม่ mutate · col นอกช่วง → error "เลือกคอลัมน์เลขตู้ที่จะตรวจ" (newColIndex -1 คืนของเดิม)
  · UI `src\app\container-check\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → **auto-guess คอลัมน์** (ชื่อหัว ตู้/container/cntr ก่อน ไม่งั้นสแกนค่าที่ match รูปเลขตู้มากสุด) → เลือกคอลัมน์ (chips) → chips (✓ถูกต้อง/เช็คดิจิตผิด/รูปแบบผิด/ว่าง/ตรวจกี่แถว) + กล่องรีวิว rose (เลขตู้ที่ผิด + ควรลงท้ายอะไร) + ตาราง (คอลัมน์ผลไฮไลต์ 🔎, เขียว=ถูก แดง=ผิด) + ดาวน์โหลด CSV/Excel
  · verify 2 ชั้น: (1) **Node test 80/80 ผ่าน**: letterValue (A/B/C/K/L/U/V/Z + ข้าม 11×, lowercase/digit→-1), containerCheckDigit (CSQU305438→3 anchor, ยาวผิด/lowercase/non-digit→null, range 0..9), validateContainer (CSQU3054383 valid expected/given/category=U, CSQU3054384 bad-check expected 3, normalize lowercase/space/dash, too-short/long/3-letter/digit-in-owner→bad-format, expected/given/category=null), resultLabel, checkContainers (header appended/newColIndex/counts valid 2·invalidCheck 1·invalidFormat 1·blank 2, findings invalid-only, col oob→error newColIndex -1, ragged เติม blank, number cell→bad-format, custom/blank col name, **input ไม่ mutate**)
    (2) **Chrome UI จริง** (CSV 6 ค่า: CSQU3054383 valid, CSQU3054384 typo, MSKU 070613 5 spaced→bad-check, ABCD123 short, ว่าง, csqu-3054383 lowercase): chips ✓ถูกต้อง 2/เช็คดิจิตผิด 2/รูปแบบผิด 1/ว่าง 2 · คอลัมน์ `🔎 ผลตรวจเลขตู้` ต่อท้าย, labels `✗ เช็คดิจิตผิด (ควรเป็น 3)` + `(ควรเป็น 7)` (MSKU คำนวณได้ 7) · กล่องรีวิว "เลขตู้ที่มีปัญหา (3)" โชว์ CSQU3054384·ควรลงท้าย 3, MSKU·ควรลงท้าย 7, ABCD123·รูปแบบผิด · CSV 403B/csv/8 บรรทัด หัวมี ผลตรวจเลขตู้ · **console สะอาด**
- 2026-07-11 — **เครื่องมือที่ 53 พร้อมใช้: ตรวจเลขบัตร ปชช. / ผู้เสียภาษี 🪪** (`/thai-id`) — หมวดออฟฟิศ · คู่กับ /container-check (deterministic ล้วน ยืนยันได้ด้วย vector — ไม่ blocked เหมือน barcode) · จับเลข 13 หลักพิมพ์ผิดในใบกำกับ/ทะเบียนผู้ส่งก่อนเข้า Pacred
  · **อัลกอริทึม (บัตรประชาชน + เลขนิติบุคคล/ผู้เสียภาษี ใช้ตัวเดียวกัน):** 12 หลักแรก × น้ำหนัก 13,12,...,2 · รวม · mod 11 · check digit = (11 − (sum mod 11)) mod 10 (หลักที่ 13) · vector: 123456789012 → 1 (sum 352, mod 0) · 123456789018 → 0 (sum 364, mod 1 → เทส mapping 10→0)
  · engine `src\lib\thaiid\thaiid.ts` (pure): `thaiIdCheckDigit(prefix)` (12 หลัก→0..9 หรือ null ถ้าไม่ใช่ตัวเลข/ยาวผิด) · `validateThaiId(raw)` → `ThaiIdValidation` (ok/status: valid|bad-format|bad-check/normalized/expected/given) · `resultLabel(v)` · `checkThaiIds(header, dataRows, col, opts)` → `ThaiIdCheckResult`
    - normalize: ตัดช่องว่าง/ขีด (`1-2345-67890-12-1`, `1 2345 67890 12 1` อ่านได้) · regex `^\d{13}$` ผ่านก่อนคำนวณ
    - **ปรัชญาไม่แก้เลขเดิม/ไม่ตัดสินมั่ว:** **เพิ่มคอลัมน์ "ผลตรวจเลข 13 หลัก" ต่อท้ายเสมอ** (ไม่ทับเดิม) · ช่องว่าง → ข้าม+นับ blank · ตัวผิดเก็บใน `findings` (cap 50) · bad-check บอกเลขที่ควรเป็น (`✗ เช็คดิจิตผิด (ควรลงท้าย N)`) · rows.length เท่าเดิม + input ไม่ mutate · col นอกช่วง → error "เลือกคอลัมน์เลข 13 หลักที่จะตรวจ" (newColIndex -1 คืนของเดิม)
  · UI `src\app\thai-id\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → **auto-guess คอลัมน์** (ชื่อหัว ผู้เสียภาษี/ภาษี/บัตรประชาชน/national id ก่อน ไม่งั้นสแกนค่าที่ตัดขีด/ช่องว่างแล้วเป็นเลข 13 หลัก) → เลือกคอลัมน์ (chips) → chips (✓ถูกต้อง/เช็คดิจิตผิด/รูปแบบผิด/ว่าง/ตรวจกี่แถว) + กล่องรีวิว rose + ตาราง (คอลัมน์ผลไฮไลต์ 🔎) + ดาวน์โหลด CSV/Excel
  · verify 2 ชั้น: (1) **Node test 66/66 ผ่าน**: thaiIdCheckDigit (123456789012→1 anchor, 123456789018→0 mapping 10→0, ยาวผิด/non-digit→null, range 0..9, self-consistent prefix+check→valid), validateThaiId (valid expected/given, bad-check 1234567890129 expected 1 given 9, normalize dashes/spaces, too-short/long/letter/empty→bad-format expected/given=null), resultLabel, checkThaiIds (header appended/newColIndex/counts valid 2·invalidCheck 1·invalidFormat 1·blank 2, findings invalid-only, col oob→error newColIndex -1, ragged เติม blank, number cell→valid, custom/blank col name, **input ไม่ mutate**)
    (2) **Chrome UI จริง** (CSV 5 ค่า: 1234567890121 valid, 1234567890129 typo, 123456789012 short, ว่าง, 1-2345-67890-12-1 dashed→valid + แถวว่างท้าย): auto-guess = คอลัมน์ A (เลขผู้เสียภาษี) · chips ✓ถูกต้อง 2/เช็คดิจิตผิด 1/รูปแบบผิด 1/ว่าง 2 · ตรวจ 4/6 · คอลัมน์ `🔎 ผลตรวจเลข 13 หลัก` ต่อท้าย, label `✗ เช็คดิจิตผิด (ควรลงท้าย 1)` · กล่องรีวิว "เลขที่มีปัญหา (2)" โชว์ 1234567890129·ควรลงท้าย 1, 123456789012·รูปแบบผิด · CSV type csv/7 บรรทัด หัวมี ผลตรวจเลข 13 หลัก · **console สะอาด**
- 2026-07-11 — **เครื่องมือที่ 54 พร้อมใช้: เติมเลข 0 นำหน้า / จัดความกว้างรหัส 🔢** (`/pad`) — หมวด excel · แก้บั๊ก reconcile ที่แสบสุดตัวหนึ่ง: รหัส/เลขกล่องที่ระบบต่างเก็บความยาวไม่ตรง เช่น "007" กลายเป็น "7" (Excel/CSV ตัดเลข 0 นำหน้า) → พอเทียบแล้ว "007" ≠ "7" หาคู่ไม่เจอ
  · engine `src\lib\padcol\pad.ts` (pure): `padColumns(header, dataRows, {cols, width, mode, padChar, side})` → จัดความกว้างเฉพาะคอลัมน์ที่เลือก
    - 3 โหมด (`PadMode`): **pad** (default, เติมอย่างเดียว — ไม่ลบตัวอักษร ปลอดภัย) · **truncate** (ตัดที่ยาวเกิน — ข้อมูลหาย) · **pad-truncate** (บังคับกว้างเป๊ะ สั้นเติม/ยาวตัด)
    - `side` (default left): pad = เติมด้านซ้าย(นำหน้า)/ขวา(ต่อท้าย) · truncate = เก็บหัว(left)/เก็บท้าย(right) · `padChar` (default "0", ใช้ code point ตัวแรกถ้าใส่หลายตัว) · นับความยาวด้วย `Array.from` (code point — emoji/สระซ้อนไม่เพี้ยน)
    - **ปรัชญา:** default เติมอย่างเดียว = ไม่ลบข้อมูล · **truncate ลบข้อมูล → opt-in + โชว์ตัวอย่างก่อน→หลัง + นับ truncatedCount + จัด sample เคสตัดขึ้นก่อน** (ไม่ตัดเงียบ) · ช่องว่าง/null = ข้าม (ไม่สร้างค่าจากที่ว่าง "" → "000") · number cell → coerce เป็น string แล้วเติม (7 → "007") · **rows.length เท่าเดิม + input ไม่ mutate** · stats: paddedCount/truncatedCount/blankSkipped/cellsChanged/rowsAffected/samples (cap 50)
    - error (ไม่เลือกคอลัมน์/width<1/คอลัมน์นอกช่วงทั้งหมด) → คืนของเดิมไม่แตะ · float width → floor
  · UI `src\app\pad\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → **auto-guess คอลัมน์รหัส + ความกว้าง** (สแกนคอลัมน์ค่า code-like ≤24 ตัว a-z0-9-_ ≥60%, ให้คะแนนพิเศษถ้าความยาวไม่เท่ากัน (เข้าข่ายถูกตัด 0) + หัวเข้าข่าย box/รหัส/tracking/no; width = max length ที่พบ) → เลือกคอลัมน์ (chips) + ความกว้าง + ตัวเติม + ด้าน + โหมด → chips (เติม/ตัด/แถวถูกแตะ/ข้ามช่องว่าง) + เตือน amber ตอนโหมดตัด + ตัวอย่างก่อน→หลัง (แดง=ถูกตัด) + ตาราง (คอลัมน์ที่จัด 🔢, ช่องที่เปลี่ยนไฮไลต์เขียว, font-mono) + ดาวน์โหลด CSV/Excel
  · verify 2 ชั้น: (1) **Node test 52/52 ผ่าน**: pad 7→007/12→012/345 คงเดิม, number cell 7→0007, pad right + custom char (ใช้ตัวแรก), blank/null/spaces ข้าม (ไม่สร้างค่า), truncate keep-head/keep-tail, pad-truncate บังคับกว้างเป๊ะ (ทุกช่อง width 4), samples เคสตัดขึ้นก่อน, หลายคอลัมน์, error (ไม่เลือก/width<1/oob คืนของเดิม), ragged เติม null, float floor, **invariant rows.length + input ไม่ mutate**, emoji นับ code point (🚛→00🚛)
    (2) **Chrome UI จริง** (CSV `box,tracking,note`: 7/12/345/ว่าง + แถวว่างท้าย): auto-guess = คอลัมน์ A (box) + width 3 · "เติม 2 ช่อง · 2 แถวถูกแตะ · ข้ามช่องว่าง 2" · 7→007, 12→012, 345 คงเดิม, ช่องว่าง+แถวว่างข้าม · **CSV export คงเลข 0 นำหน้าเป็น string** (มี "007"/"012", หัว box,tracking,note, 6 บรรทัด) · **console สะอาด**
- 2026-07-11 — **เครื่องมือที่ 55 พร้อมใช้: แปลงตัวพิมพ์ใหญ่/เล็ก 🔠** (`/case`) — หมวด excel · normalize ตัวพิมพ์ก่อน reconcile/dedup: รหัส forwarder / tracking / เลขตู้ ที่พิมพ์ปนตัวใหญ่-เล็ก (เช่น "ky001" กับ "KY001") มองเป็นคนละค่า หาคู่ไม่เจอ → แปลงให้เป็นแบบเดียวกันก่อน
  · engine `src\lib\casecol\case.ts` (pure): `convertCase(header, dataRows, {cols, mode})` → แปลงตัวพิมพ์เฉพาะคอลัมน์ที่เลือก
    - 4 โหมด (`CaseMode`): **upper** (ตัวใหญ่หมด) · **lower** (ตัวเล็กหมด) · **title** (ตัวแรกของแต่ละคำใหญ่ ที่เหลือเล็ก — ใช้ regex `\p{L}+` จับ run ตัวอักษร คงตัวคั่น) · **sentence** (ตัวอักษรตัวแรกของช่องใหญ่ ข้ามตัวเลขนำหน้า ที่เหลือเล็ก)
    - **ปรัชญา: แค่เปลี่ยน "ตัวพิมพ์" ไม่ลบ/เพิ่มตัวอักษร** · **แตะเฉพาะช่อง string** (number/boolean → ข้าม+นับ skippedNonString กัน type เพี้ยน) · ช่องว่าง/null → ข้าม+นับ blankSkipped · **ภาษาไทยไม่มี case → ผ่านทะลุไม่เปลี่ยน** (toUpperCase/toLowerCase ของไทยคืนค่าเดิม) · code point ผ่าน `Array.from` (emoji/สระซ้อนไม่เพี้ยน) · ค่าเดิมตรงกับผลแล้วไม่นับเปลี่ยน · **rows.length เท่าเดิม + input ไม่ mutate** · stats: changedCount/rowsAffected/skippedNonString/blankSkipped/samples (cap 50)
    - error (ไม่เลือกคอลัมน์/คอลัมน์นอกช่วงทั้งหมด/mode ผิด) → คืนของเดิมไม่แตะ
  · UI `src\app\case\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → **auto-guess คอลัมน์ข้อความ** (สแกนคอลัมน์ที่มีตัวอักษรอังกฤษ ≥50%, ให้คะแนนพิเศษถ้าปนตัวใหญ่-เล็ก + หัวเข้าข่าย tracking/forwarder/name/code) → เลือกคอลัมน์ (chips) + โหมด (4 ปุ่ม + hint + ตัวอย่าง) → chips (แปลง/แถวถูกแตะ/ข้ามช่องตัวเลข/ข้ามช่องว่าง) + ตัวอย่างก่อน→หลัง + ตาราง (คอลัมน์ที่แปลง 🔠, ช่องที่เปลี่ยนไฮไลต์เขียว) + ดาวน์โหลด CSV/Excel
  · verify 2 ชั้น: (1) **Node test 43/43 ผ่าน**: upper/lower หลายคอลัมน์, title (john smith→John Smith, MARY JANE watson→Mary Jane Watson, ky001-abc→Ky001-Abc ตัวคั่นแยกคำ), sentence (first LETTER ข้ามตัวเลขนำหน้า "123 then abc"→"123 Then abc", leading spaces คงไว้), **ไทยผ่านไม่เปลี่ยน (upper "สมชาย ใจดี" คงเดิม, ไทย+อังกฤษ "ตู้ TU-a01"→"ตู้ TU-A01")**, skip number/boolean/blank (นับ skippedNonString/blankSkipped ถูก, ตัวเลขคง type), ค่าเดิม=ผล ไม่นับ, error (ไม่เลือก/oob/mode ผิด คืนของเดิม), samples cap 50, **invariant rows.length + input ไม่ mutate**, ragged เติม null
    (2) **Chrome UI จริง** (CSV `tracking,name,kg`: ky001/john smith, AB-002/MARY JANE, Ky003/สมชาย ใจดี, 123num/ว่าง, ว่าง/already): auto-guess = คอลัมน์ A (tracking) · **upper** = แปลง 3 ช่อง (ky001→KY001, Ky003→KY003, 123num→123NUM, AB-002 คงเดิม) · เพิ่มคอลัมน์ name + **title** = แปลง 6 ช่อง (john smith→John Smith, MARY JANE→Mary Jane, **สมชาย ใจดี คงเดิม (ไทยผ่าน)**, already→Already, 123num→123Num) · **CSV export** 6 บรรทัด มี John Smith + Thai คงไว้ + Ky001 · **console สะอาด**
- 2026-07-11 — **เครื่องมือที่ 56 พร้อมใช้: ส่องชนิดข้อมูลแต่ละคอลัมน์ 🔬** (`/schema`) — หมวดจัดระเบียบ · "รู้จักไฟล์ก่อนลงมือ" — profiler อ่านอย่างเดียว เดาชนิดทุกคอลัมน์ + ชี้ค่าที่ผิดแปลกจากพวก · เสริม /stats (สรุปตัวเลข) ด้วยการเดา "ชนิด" ทุกคอลัมน์
  · engine `src\lib\schema\schema.ts` (pure): `profileColumns(header, allRows)` → ต่อคอลัมน์คืน `ColumnProfile` (dominantType/typeCounts/filled/blank/distinct/minLen/maxLen/hasLeadingZero/numericLike/sampleValues/oddValues) + `classifyCell(v)` + `schemaToCsv` + `TYPE_LABEL`
    - `classifyCell` เดาชนิดแบบ **deterministic (regex ชัดเจน)**: boolean → date → integer → decimal → text · number cell → integer/decimal ตาม `Number.isInteger` (Infinity→text) · **date เดาแบบระวัง กัน false positive**: ISO `YYYY-M-D` + DMY `D/M/Y` (คั่น / - .) validate เดือน 1-12 วัน 1-31 · **ไม่จับ 8 หลักล้วน (เช่น 20250711 = รหัส ไม่ใช่วันที่)** · มี comma → text (ไม่ใช่ตัวเลข)
    - dominant = ชนิดที่นับได้มากสุดในช่องมีค่า · tie-break ตาม TYPE_PRIORITY (boolean>date>integer>decimal>text) · **oddValues = ค่าที่ชนิดต่างจาก dominant** (cap 20) → จับ typo/ข้อมูลปน (เช่น "3O" ปนในคอลัมน์เลข) · `hasLeadingZero` (`/^0\d+$/` เช่น 007) → เตือน Excel/CSV อาจตัด 0 หาย
    - **ปรัชญา: อ่านอย่างเดียว ไม่แก้ข้อมูล** (แค่รายงาน) · ตัดแถวว่างทั้งแถวก่อนวิเคราะห์ (isDataRow) · width ขยายตามแถวที่กว้างกว่า header · หัวว่าง→"คอลัมน์ N" · sampleValues cap 5 (distinct) · **input ไม่ mutate**
  · UI `src\app\schema\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → เลือกชีต/แถวหัว + พรีวิว → การ์ดต่อคอลัมน์ (badge ชนิดหลัก + มีค่า%/ไม่ซ้ำ/ช่วงความยาว + sub-badge สัดส่วนชนิดถ้าปน + เตือน amber เลข 0 นำหน้า + ตัวอย่างค่า + กล่อง rose "ค่าที่ไม่เข้าพวก") + chips สรุป (N คอลัมน์/N แถว/ตัดแถวว่าง) + ดาวน์โหลดสรุป CSV
  · verify 2 ชั้น: (1) **Node test 79/79 ผ่าน**: classifyCell (integer/decimal/boolean/date/text/blank + edge: "20250711"→integer ไม่ใช่ date, "2025-13-01"→text เดือนผิด, "40/40/2025"→text, Infinity→text, "1,234"→text), profileColumns (dominant + tie priority, typeCounts, oddValues typo "3O" ตำแหน่งถูก, hasLeadingZero, minLen/maxLen, distinct+dup, ตัดแถวว่างทั้งแถว, หัวว่าง→default, ragged ขยาย width, all-blank column, sample cap 5, odd cap 20, **input ไม่ mutate**, error empty), schemaToCsv, boolean column
    (2) **Chrome UI จริง** (CSV `tracking,kg,box,date`, kg มี typo "3O", box เลข 0 นำหน้า 007/012/055): 4 คอลัมน์ · 4 แถว (ตัดแถวว่าง 1) · tracking→ข้อความ · **kg→จำนวนเต็ม + "ค่าที่ไม่เข้าพวก (2)": 12.5 (ทศนิยม) + 3O (ข้อความ typo)** · **box→จำนวนเต็ม + เตือน amber เลข 0 นำหน้า** · date→วันที่ · CSV export 5 บรรทัด (หัวมี ชนิดหลัก + เลข0นำหน้า, kg=จำนวนเต็ม, box leading-zero=ใช่, kg odd=2, type text/csv) · **console สะอาด**
- 2026-07-11 — **เครื่องมือที่ 57 พร้อมใช้: เทียบ 2 คอลัมน์ 🆚** (`/compare-cols`) — หมวด "เทียบ" · reconcile "ในไฟล์เดียว" ข้าม 2 คอลัมน์ (ไม่ต้อง key join) · use-case จริง: น้ำหนักแจ้ง ↔ ชั่งจริง, จำนวนแจ้ง ↔ นับจริง, tracking 2 คอลัมน์ที่ควรตรงกัน
  · **ต่างจาก /reconcile** (เทียบข้าม 2 ไฟล์ด้วย key) · **ต่างจาก /list-compare** (set diff ระหว่าง 2 ลิสต์) — อันนี้เทียบ "ในแถวเดียวกัน" ระหว่าง 2 คอลัมน์
  · engine `src\lib\colcompare\colcompare.ts` (pure): `compareColumns(header, allRows, {colA, colB, tolerance?, caseInsensitive?, trim?})` → ต่อแถวคืน `CompareRow` {a, b, status, numeric, delta} + `counts`/`numericComparable`/`aName`/`bName`
    - 5 สถานะ (`CompareStatus`): **match/diff** (ทั้งคู่มีค่า) · **only-a/only-b** (ว่างฝั่งเดียว) · **both-blank** (ว่างทั้งคู่แต่คอลัมน์อื่นไม่ว่าง → แถวไม่ถูกตัด) · ตัดแถวว่างทั้งแถวก่อน (isDataRow)
    - **ตัวเลข:** ทั้ง 2 ฝั่ง parseNumeric ได้ → เทียบด้วย tolerance (`|B−A| ≤ tolerance` = match) + delta = B−A · **ข้อความ:** อย่างน้อยฝั่งหนึ่งไม่ใช่ตัวเลข → เทียบข้อความ (normalize trim/caseInsensitive ตาม option แต่แสดงค่าจริง) delta = null
    - **บทเรียน float:** `12.4 − 12 = 0.40000000000000036` → `cleanFloat` (`Number(x.toPrecision(15))`) ล้าง noise **เฉพาะค่าที่แสดง/ส่งออก** — การตัดสิน tolerance ยังใช้ค่าดิบ (กัน boundary เพี้ยน)
    - **ปรัชญา: อ่านอย่างเดียว ไม่แก้ข้อมูล ไม่ทำแถวหาย** · error (คอลัมน์ติดลบ/เลือกซ้ำคอลัมน์เดียว → คืน error ไม่มี rows) · `colCompareToCsv(result, onlyDiff?)` (onlyDiff ตัด match+both-blank) · `STATUS_LABEL`
  · UI `src\app\compare-cols\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → **auto-guess คู่คอลัมน์** (`guessPair`: (1) หัวตารางฐานเดียวกันหลังตัดคำ "แจ้ง/ชั่ง/จริง/นับ/declared/actual/..." เช่น "kg แจ้ง" ↔ "kg ชั่ง" (2) 2 คอลัมน์ตัวเลขแรก (3) [0,1]) → เลือก A(sky)/B(violet) + tolerance + toggle ci/trim → chips 5 สถานะ + "เฉพาะที่ไม่ตรง" filter + ตารางไฮไลต์สี (match=emerald diff=amber only-a=sky only-b=violet) + delta B−A (เขียว/แดง) + ดาวน์โหลด CSV ทั้งหมด/เฉพาะที่ไม่ตรง
  · verify 2 ชั้น: (1) **Node test 65/65 ผ่าน**: numeric match/diff/delta ±, tolerance (0/0.5 flip match↔diff), **float cleanup (0.4/0.2 ไม่ใช่ 0.400...036) + tolerance ยังตัดสินด้วยค่าดิบ**, comma numbers, number cell, text ci+trim, ci/trim toggle, only-a/only-b/both-blank (ตัดแถวว่างทั้งแถว), both-blank survives, mixed numeric-vs-text→text diff, error (same col/neg col), header default "คอลัมน์ N", ragged→only-a, **input ไม่ mutate**, CSV all/onlyDiff + float delta cleaned, STATUS_LABEL, all-match 20
    (2) **Chrome UI จริง** (CSV `tracking,kg แจ้ง,kg ชั่ง` 6 แถว): **guessPair จับคู่ B↔C (kg แจ้ง↔kg ชั่ง)** อัตโนมัติ · สถานะ ตรงกัน 2/ไม่ตรง 2/เฉพาะ A 1/เฉพาะ B 1 (+ ABC↔abc text ci = match) · **delta row2 = +0.4 (float noise หายแล้ว ไม่ใช่ +0.40000...036)** · CSV export 7 บรรทัด (หัวมี kg แจ้ง, delta สะอาด 0.4, มีเฉพาะ A, type text/csv) · **tolerance 0.5 → ตรงกัน 2→3 row2 flip เป็น match** · เฉพาะที่ไม่ตรง filter → 3 แถว (ไม่มี match) · **console สะอาด**
- 2026-07-11 — **เครื่องมือที่ 58 พร้อมใช้: จัดกลุ่มช่วงตัวเลข (Histogram) 📶** (`/bins`) — หมวด excel · ดูการกระจายของค่าตัวเลข (น้ำหนัก/CBM/จำนวนกล่อง) เป็น "ช่วง" เช่น "มีกี่พัสดุในช่วง 0-10 / 10-50 / 50+ kg"
  · **ต่างจากญาติ ๆ:** /frequency = นับค่าซ้ำเป๊ะ (categorical) · /stats = สรุปทั้งคอลัมน์ · /group = รวมต่อกลุ่มที่มีอยู่ → อันนี้สร้าง "ช่วงต่อเนื่อง (continuous)" เองแล้วนับ/รวมในแต่ละช่วง
  · engine `src\lib\bins\bins.ts` (pure): `computeBins(header, allRows, opts)` → `BinResult` (bins[{lo,hi,loInclusive,hiInclusive,count,sum,percent,label}]/numericCount/skipped/dataRows/inputRows/min/max/total/colName/error?) + `binsToCsv`
    - 3 โหมด (`BinMode`): **width** (กว้างเท่ากันบน [min,max], ช่วงสุดท้ายรวม max, guard width>0 + nbins≤MAX_BINS=2000) · **count** (N ช่วงเท่า ๆ กัน, guard binCount≥1 จำนวนเต็ม, max==min→1 ช่วง) · **breaks** (จุดตัดเอง เรียง+ตัดซ้ำให้ → `(-∞,b0),[b0,b1),...,[b_last,+∞)` ปลายเปิด ทุกค่าตกลงช่วงเดียว)
    - assign: width/count ใช้ `idx=floor((v−min)/step)` clamp · breaks ใช้จำนวน break ที่ ≤ v · **invariant: Σcount = numericCount เสมอ** (ทุกค่าตกลงช่วงเดียว)
    - **ปรัชญาอ่านอย่างเดียว:** ตัดแถวว่างทั้งแถว (isDataRow ไม่นับ skipped) · คอลัมน์เป้าหมายไม่ใช่ตัวเลข → นับ skipped · `parseNumeric` inline (ตัด comma/trim, bool/Infinity→null) · `cleanFloat` toPrecision(12) ล้าง noise ขอบช่วง/sum · error (col ติดลบ/ไม่มีตัวเลข/width≤0/binCount<1/breaks ว่าง/ช่วงถี่เกิน MAX_BINS) · input ไม่ mutate
  · UI `src\app\bins\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → **auto-guess คอลัมน์ตัวเลข** (หัวเข้าข่าย kg/cbm/น้ำหนัก/กล่อง + ค่าเป็นเลข ≥50% ก่อน ไม่งั้นคอลัมน์ที่เป็นเลขมากสุด) → เลือกคอลัมน์ (chips) + โหมด (3 ปุ่ม) + input ต่อโหมด (ความกว้าง/จำนวนช่วง/จุดตัด) → chips (ค่าตัวเลข/ต่ำสุด-สูงสุด/รวม/ข้าม) + ตารางช่วง (ช่วง/จำนวน/%/แท่งสัดส่วน/ผลรวม) sticky header + ดาวน์โหลด CSV
  · verify 2 ชั้น: (1) **Node test 75/75 ผ่าน**: width (bins/counts/labels `[0, 10)`/`[20, 25]` inclusive/sum/total, max ตกช่วงสุดท้าย), count (step, ช่วงสุดท้าย inclusive), breaks (ปลายเปิด `< 10`/`≥ 50`, ค่าขอบ ≥ ไป bin บน, dedupe/sort), min==max→1 ช่วง, comma+text skip (แถวว่างทั้งแถวไม่นับ skipped), blank row dropped, target non-numeric skip, percent sums 100, float edges no noise, ค่าติดลบ, error (no numeric/width0/binCount0/breaks empty/too-many-bins/neg col), header default, **input ไม่ mutate**, number cell, CSV export, ragged header, large-dataset **invariant Σcount=numericCount**
    (2) **Chrome UI จริง** (CSV `tracking,kg,cbm`, kg=0,5,10,15,20,25): auto-guess = B (kg) · **width 10** → 3 ช่วง [0,10)=2/[10,20)=2/[20,25]=2 (sum 5/25/45, ต่ำสุด 0 สูงสุด 25 รวม 75, Σ=6) · **count 5** → step 5, [20,25] inclusive=2, Σ=6 · **breaks 10,50,100** → `< 10`=2/[10,50)=4/[50,100)=0/`≥ 100`=0 ปลายเปิดถูก Σ=6 · CSV 5 บรรทัด (หัว `ช่วง,จำนวน,%,ผลรวม`, `"[10, 50)"` quote comma, percent ค่าดิบ) · **console สะอาด**
- 2026-07-11 — **เครื่องมือที่ 59 พร้อมใช้: ดึงตัวอย่างแถว (Sampling) 🎰** (`/sample`) — spot-check ไฟล์ใหญ่ก่อนเอาเข้า Pacred (packing list 800 แถว → สุ่มดู 20 แถวเช็คคุณภาพ)
  · **ต่างจาก /filter** (เลือกตามเงื่อนไข) — อันนี้เลือกตาม "ตำแหน่ง/สุ่ม" · **ต่างจาก /random** (สุ่มรายชื่อใน list) — อันนี้สุ่ม "แถวของตาราง"
  · engine `src\lib\sample\sample.ts` (pure): `sampleRows(allRows, opts)` → `SampleResult` (rows/indexes/inputRows/dataRows/sampled/seedUsed/error) · 4 โหมด (`SampleMode`):
    - **head** (N แถวแรก) · **tail** (N แถวท้าย) · **random** (สุ่มไม่ซ้ำด้วย Fisher-Yates partial แล้วเรียง index กลับตามลำดับเดิม) · **systematic** (ทุก ๆ step แถว เริ่มที่ offset)
    - **ปรัชญาอ่านอย่างเดียว + ผลเป็น subset คงลำดับเดิม + ไฟล์ต้นฉบับไม่ถูกแตะ:** ตัดแถวว่างทั้งแถว (isDataRow) ก่อน · **random ใส่ seed → ทำซ้ำได้ผลเดิม** (mulberry32 deterministic, ไม่ใส่ seed → สุ่ม uint32 แต่ seedUsed คืนเป็นเลขเสมอเพื่อ audit/แชร์) · input ไม่ mutate
    - guard: n<1→error, step<1→error, ไม่มีแถวข้อมูล→error, n/take ≥ dataRows → คืนทั้งหมด, offset<0→clamp 0, offset เกินขอบ→ว่าง (ไม่ error)
  · UI `src\app\sample\page.tsx` (client): reuse parse/detect/FileDropzone → อัปโหลด → เลือก header → 4 ปุ่มโหมด + input ต่อโหมด (จำนวนแถว / step+offset / seed checkbox+ค่า) → chips (ดึง N/dataRows + seed) + ตารางผลมีคอลัมน์ **"แถวเดิม"** (index เดิม +1) + ดาวน์โหลด CSV/Excel (subset ไม่มีคอลัมน์ "แถวเดิม" — เป็นข้อมูลจริง)
  · verify 2 ชั้น: (1) **Node test 43/43 ผ่าน**: head/tail exact, n>rows→ทั้งหมด, systematic step/offset/neg-offset clamp/step1/offset-oob ว่าง, random reproducible (seed 42 index เดิม/seedUsed 42/ascending/in-range/distinct/rows match), diff seed→diff, random n>rows→ทั้งหมด, no-seed→seedUsed เป็นเลข, แถวว่างถูกตัด (dataRows/inputRows), no-data→error, n<1/n neg/step<1 errors, subset invariant, **input ไม่ mutate**, multi-col preserved, large systematic (1000/step100→10 first/last [0,900])
    (2) **Chrome UI จริง** (CSV `tracking,box,kg` 10 แถว KY001-010): head n3 → [1,2,3]=KY001-003 · tail n3 → [8,9,10]=KY008-010 · systematic step3 → [1,4,7,10]=KY001/004/007/010 · **random seed42 → [6,7,9] ascending, กดซ้ำได้ผลเดิม (reproducible=true), seed99 ต่างจาก seed42=true** · CSV 4 บรรทัด (หัว+3 แถว KY006/007/009, type text/csv) · Excel PK magic 16KB spreadsheetml · **console สะอาด**
- 2026-07-11 — **เครื่องมือที่ 60 พร้อมใช้: สัดส่วน & อันดับในกลุ่ม 🥧** (`/group-share`) — เติมค่าวิเคราะห์ราย "แถว" ที่คิดเทียบ "ภายในกลุ่ม (ตู้) ของตัวเอง"
  · use-case จริง: แต่ละกล่อง/tracking คิดเป็นกี่ % ของ "ตู้ของตัวเอง" · น้ำหนักรวมของตู้นั้น · อันดับหนักสุดในตู้ → เห็นว่ากล่องไหนกินสัดส่วนในตู้เยอะ / เรียงความสำคัญภายในแต่ละตู้
  · **ต่างจาก /percent** (สัดส่วนเทียบ "ทั้งคอลัมน์") — อันนี้เทียบ "ภายในกลุ่ม" · **ต่างจาก /group** (ยุบทั้งกลุ่มเป็น 1 แถว) — อันนี้เติมค่าคืนราย "แถว" (ทุกแถวอยู่ครบ)
  · engine `src\lib\groupshare\groupshare.ts` (pure): `analyzeGroupShare(header, allRows, opts)` → เติมได้ 3 metric (ตามลำดับที่เลือก):
    - **share** = ค่า ÷ ยอดรวมกลุ่ม × 100 · **group-total** = ยอดรวมของกลุ่ม (โชว์ทุกแถวในกลุ่ม) · **rank** = อันดับในกลุ่ม (competition 1-2-2-4, เลือกมากสุด/น้อยสุด = 1)
    - **ปรัชญาอ่านอย่างเดียว + ไม่เดามั่ว + ไม่ทำแถวหาย:** เติมคอลัมน์ท้ายตาราง ไม่แก้ข้อมูลเดิม · จัดกลุ่มหลายชั้นได้ (groupCols หลายคอลัมน์, key = join ด้วย SEP ``, trim default) · ช่องค่าไม่ใช่ตัวเลข → **เว้นว่าง ไม่นับเข้ายอดกลุ่ม** + นับ `skipped` · `ignoreEmptyKey` (default UI เปิด) แถวคีย์ว่าง → เว้นว่าง ไม่จัดกลุ่ม (กัน subtotal/grand-total ปน) + นับ `ignoredKeyRows` **แต่ยังอยู่ในผลลัพธ์** · ทุกแถวออกครบ (rows.length = dataRows, input ไม่ mutate)
    - `parseNumeric` inline (comma/trim, bool/Infinity/ว่าง→null) · `round?` ปัด % + ยอดรวม · **group total 0 → share = null (กันหารศูนย์)** · error (col ค่านอกช่วง/ไม่เลือก groupCol/groupCol นอกช่วง/ไม่เลือก metric) → คืนของเดิม · ชื่อคอลัมน์: `${valueName} % ในกลุ่ม` / `${valueName} รวมกลุ่ม` / `อันดับในกลุ่ม`
  · UI `src\app\group-share\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → **auto-guess** (ค่า = kg/น้ำหนัก/weight/cbm/กล่อง หรือคอลัมน์ที่เป็นเลขมากสุด · กลุ่ม = container/ตู้/forwarder หรือคอลัมน์ข้อความแรก) → เลือกคอลัมน์จัดกลุ่ม (chips เรียงลำดับ sky) + คอลัมน์ค่า (single) + chips เลือก metric (emerald) + toggle ทิศอันดับ/ข้ามคีย์ว่าง/ปัดทศนิยม → chips (กลุ่ม/แถวตัวเลข/ข้าม/เติมกี่คอลัมน์) + ตาราง (คอลัมน์ใหม่ไฮไลต์ emerald +🥧) + ดาวน์โหลด CSV/Excel
  · verify 2 ชั้น: (1) **Node test 72/72 ผ่าน**: share ราย group (sums 100/กลุ่ม), group-total, rank desc/asc + ties (competition 1-2-2-4), หลาย metric ตามลำดับ, ไม่ใช่ตัวเลข→เว้นว่าง+skipped, comma parse, ignoreEmptyKey (แถวคงอยู่ metric ว่าง), trim on/off, คีย์หลายชั้น, round 2, group total 0→share null, ตัดแถวว่าง, error (no-data/valueCol oob/no-groupCols/groupCol oob/no-metrics), **invariant rows.length + input ไม่ mutate + share รวม/กลุ่ม = 100**, ragged, number cell
    (2) **Chrome UI จริง** (CSV `container,tracking,kg` TU-A[10,30,60]/TU-B[25,75] + แถวคีย์ว่าง GRAND 200): 2 กลุ่ม/แถวตัวเลข 5/ข้ามคีย์ว่าง 1 · share TU-A 10/30/60 (รวม 100), TU-B 25/75 (รวม 100) · รวมกลุ่ม 100 ทุกแถว · อันดับ (มากสุด=1) TU-A 3/2/1, TU-B 2/1 · **แถว GRAND (คีย์ว่าง) → metric ว่างแต่ยังอยู่ในตาราง+CSV (ไม่หาย)** · CSV 7 บรรทัด หัวสะอาด (ไม่มี 🥧) · Excel PK magic 17KB spreadsheetml · **console สะอาด**
- 2026-07-11 — **เครื่องมือที่ 61 พร้อมใช้: รวมหลายคอลัมน์ต่อแถว ➕** (`/row-agg`) — สรุปหลายคอลัมน์ "ข้ามกัน" ในแถวเดียว → เติม 1 คอลัมน์ท้ายตาราง
  · use-case จริง: ไฟล์ที่แยกค่าเป็นหลายคอลัมน์ (น้ำหนักต่อวัน/ต่อ forwarder เจ้าละคอลัมน์, จำนวนกล่องต่อไซซ์) → อยากได้ยอดรวม/เฉลี่ย/มากสุด/น้อยสุด/พิสัย/นับ ต่อแถว
  · **ต่างจาก /calc-col** (ค่าซ้าย OP ค่าขวา แค่ 2 ตัว) — อันนี้รวมได้หลายคอลัมน์ · **ต่างจาก /group /stats /percent** (สรุป "ลงคอลัมน์" ข้ามแถว) — อันนี้สรุป "ข้ามคอลัมน์" ในแถวเดียว
  · engine `src\lib\rowagg\rowagg.ts` (pure): `analyzeRowAgg(header, allRows, opts)` → 7 ฟังก์ชัน (`RowAggFn`): sum/avg/min/max/range (มาก−น้อย)/count (นับช่องมีค่า ทุกชนิด)/count-numeric (นับช่องตัวเลข)
    - **ปรัชญาอ่านอย่างเดียว + ไม่เดามั่ว + ไม่ทำแถวหาย:** เติมคอลัมน์ท้าย ไม่แก้ข้อมูลเดิม · ช่องไม่ใช่ตัวเลข → **ข้ามไป ไม่นับ** (sum/avg/min/max/range/count-numeric) · **แถวที่ไม่มีตัวเลขเลย → เว้นว่าง (ไม่แต่งค่า 0)** + นับ `skippedRows` · count นับช่องไม่ว่างทุกชนิด (ให้ค่าเสมอ 0 ได้ → computedRows = dataRows) · ทุกแถวออกครบ (rows.length = dataRows, input ไม่ mutate)
    - `parseNumeric` inline (comma/trim, bool/Infinity/ว่าง→null) · `round?` ปัด (sum/avg/min/max/range) · ชื่อ default `${FN_LABEL} (คอลัมน์...)` ตั้งเองได้ · error (no-data/ไม่เลือกคอลัมน์/คอลัมน์นอกช่วง) → คืนของเดิม
  · UI `src\app\row-agg\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → **auto-guess คอลัมน์ตัวเลข** (คอลัมน์ที่ค่าเป็นเลขเกินครึ่ง) → chips เลือกคอลัมน์ (emerald) + ปุ่มเลือกฟังก์ชัน (indigo) + ช่องตั้งชื่อ + toggle ปัดทศนิยม → chips (คำนวณได้/เว้นว่าง/ชื่อคอลัมน์ใหม่) + ตาราง (คอลัมน์ใหม่ไฮไลต์ emerald +➕) + ดาวน์โหลด CSV/Excel
  · verify 2 ชั้น: (1) **Node test 58/58 ผ่าน**: sum/avg/min/max/range (ข้ามช่องว่าง/text, all-text→blank+skipped, all-zero→0), count (text/zero counts, blank ไม่นับ, computedRows=dataRows), count-numeric (text→0), comma parse, round 2 + no-round full precision, custom name trimmed, single col, boolean/Infinity skipped, error (no-data/no-cols/oob/neg), ตัดแถวว่าง, **invariant rows.length + input ไม่ mutate + ทุกแถวมีคอลัมน์เพิ่ม**, ragged (blank cells ไม่นับ), number cell, negative numbers
    (2) **Chrome UI จริง** (CSV `container,mon,tue,wed`: TU-A[10,20,30]/TU-B[5,ว่าง,15]/TU-C[abc,def,ghi]): auto-guess = mon+wed (tue sparse), เพิ่ม tue → sum TU-A 60/TU-B 20 (ข้ามช่องว่าง)/TU-C ว่าง · avg 20/10/ว่าง · max 30/15/ว่าง · count 3/2/3 (text นับ, blank ไม่นับ, computedRows 3) · CSV 4 บรรทัด (หัวมี comma → quote) · Excel PK magic 16KB spreadsheetml · **console สะอาด**
- 2026-07-11 — **เครื่องมือที่ 62 พร้อมใช้: คำนวณน้ำหนักคิดค่าขนส่ง ✈️** (`/chargeable`) — หมวดโลจิสติกส์ · เครื่อง cargo-core ที่ยังขาด: คิด chargeable weight "ทั้งไฟล์" ทีเดียว
  · use-case จริง: packing list มีคอลัมน์ กว้าง/ยาว/สูง/จำนวน/น้ำหนัก อยู่แล้ว → อยากได้ CBM + น้ำหนักเชิงปริมาตร + **น้ำหนักคิดเงิน** ต่อแถว ไว้ตั้งราคา/quote ค่าระวาง
  · **ต่างจาก /cbm** (กรอกมือทีละรายการ live) — อันนี้ชี้คอลัมน์จากไฟล์แล้วทำทั้งไฟล์ · **air** คิดเงิน = max(น้ำหนักจริง, ปริมาตร÷divisor) · **sea (W/M)** = max(น้ำหนักจริง, CBM×1000)
  · engine `src\lib\chargeable\chargeable.ts` (pure): `analyzeChargeable(header, allRows, opts)` → เติมได้ 3 metric (`ChargeMetric`): cbm/volumetric/chargeable (เลือก+เรียงลำดับได้)
    - **หน่วยมิติ** (`DimUnit` cm/m/inch): TO_METER (cm .01/m 1/inch .0254) คิด CBM = L×W×H เมตร × qty · TO_CM (cm 1/m 100/inch 2.54) คิดน้ำหนักปริมาตร air = (L×W×H cm)/divisor × qty · **divisor** default 6000 (5000=express)
    - **ปรัชญาอ่านอย่างเดียว + ไม่เดามั่ว + ไม่ทำแถวหาย:** เติมคอลัมน์ท้าย ไม่แก้ข้อมูลเดิม · **มิติ (กxยxส) หรือ qty ไม่ใช่ตัวเลข → ทุก metric ของแถวนั้นเว้นว่าง** (ไม่แต่งค่า 0) + นับ `skippedRows` · qty ไม่มีคอลัมน์ = 1 · **น้ำหนักจริงไม่มีคอลัมน์ = null** → air ใช้ปริมาตรล้วน, sea ใช้ WM ล้วน · ทุกแถวออกครบ (rows.length = dataRows, input ไม่ mutate)
    - `parseNumeric` inline (comma/trim, bool/Infinity/ว่าง→null) · `round?` ปัดทุก metric + ยอดรวม · คืน `totalCbm`/`totalChargeable` (เฉพาะแถวที่คิดได้) · ชื่อคอลัมน์ auto: `CBM` · `น้ำหนักปริมาตร (÷divisor)` · `น้ำหนักคิดเงิน (air)` / `(W/M)` · error (no-data/มิตินอกช่วง/ไม่เลือก metric) → คืนของเดิม
  · UI `src\app\chargeable\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → **auto-guess คอลัมน์จากชื่อหัว** (ยาว/length, กว้าง/width, สูง/height, จำนวน/qty, น้ำหนัก/weight/kg — fallback คอลัมน์ตัวเลขถัดไป) → dropdown ชี้คอลัมน์ L/W/H (บังคับ) + qty/weight (มี "— ไม่มี —") + ปุ่มหน่วย (indigo) + ปุ่มโหมด air/sea (sky) + input divisor (โผล่เฉพาะ air) + chips metric (emerald, เหลืออย่างน้อย 1) + toggle ปัดทศนิยม → chips (คำนวณได้/มิติไม่ครบ/รวม CBM/รวมน้ำหนักคิดเงิน) + ตาราง (คอลัมน์ใหม่ไฮไลต์ emerald +✈️) + ดาวน์โหลด CSV/Excel
  · verify 2 ชั้น: (1) **Node test 49/49 ผ่าน**: cbm (0.24/0.25, C skip, totalCbm 0.49), volumetric ÷6000/÷5000 (ชื่อคอลัมน์มี divisor), chargeable air = max(actual,vol) (100/300 + vol wins 166.67), chargeable sea W/M = max(actual,cbm×1000) (240/300), no-weight → air=vol/sea=WM, no-qty → qty 1, qty non-numeric → skip, หน่วย m/inch, หลาย metric เรียงลำดับ, round null full precision, comma parse, error (no-data/dim oob/no-metric), **invariant input ไม่ mutate + rows.length=dataRows (ตัดแถวว่าง) + ทุกแถว +col**, ragged skip
    (2) **Chrome UI จริง** (CSV `item,ยาว,กว้าง,สูง,จำนวน,น้ำหนัก`: A[40,30,20,10,100]/B[50,50,50,2,300]/C[100³,1,5]/D[x...]): **auto-guess ชี้ครบทุกคอลัมน์ตามชื่อไทย** · **air** → A คิดเงิน 100 (max 100 vs vol 40), B 300, **C 166.67 (vol ชนะ actual 5)**, D มิติไม่ครบ(x)→ว่าง; CBM 0.24/0.25/1, vol 40/41.67/166.67 · **sea** → W/M A 240/B 300/C 1000 (max actual vs CBM×1000), header เปลี่ยนเป็น (W/M), divisor ซ่อน · chips คำนวณได้ 3/มิติไม่ครบ 1 · CSV 5 บรรทัด (หัวสะอาด, W/M col A240/B300/C1000/D ว่าง) · Excel PK magic 17KB spreadsheetml · **console สะอาด**
- 2026-07-11 — **เครื่องมือที่ 63 พร้อมใช้: ปันส่วนต้นทุนตามสัดส่วน ⚖️** (`/allocate`) — หมวดโลจิสติกส์ · use-case จริง: มีค่าขนส่ง/ต้นทุนรวมของตู้ 1 ก้อน → ปันลงแต่ละกล่อง/tracking ตาม "ฐาน" (น้ำหนัก/CBM/จำนวน) → รู้ว่ากล่องไหนต้องคิดเงินเท่าไหร่
  · **ต่างจาก /group-share** (บอกแค่ % / อันดับในกลุ่ม) — อันนี้ปันเป็น "ยอดจริง (บาท/กก.)" · ต่างจาก /calc-col (คูณ/หารตรง ๆ) — อันนี้ต้องรู้ผลรวมฐานทั้งคอลัมน์
  · engine `src\lib\allocate\allocate.ts` (pure): `analyzeAllocate(header, allRows, {basisCol, total, round?, amountName?, showShare?})` → เติมคอลัมน์ "ยอดปันส่วน" (+ "% สัดส่วน") ท้ายตาราง
    - **ปรัชญาหลัก = ผลรวมยอดที่ปัน = ยอดรวมเป๊ะเสมอ (no-loss):** ใช้ **largest remainder method** (หน่วย = 10^-round) → totalUnits = round(total×scale); raw = totalUnits×basis/basisTotal; floor ทุกแถว; remainder = totalUnits − Σfloor (จำนวนเต็ม ∈ [0, N)) → แจก +1 หน่วยให้แถวที่ "เศษ" มากสุดก่อน (เท่ากันแตกด้วย index เสถียร) · **เศษปัดไม่ทำเงินหาย/เกิน** (invariant: Σ alloc === totalUnits/scale เป๊ะ — test 300 สุ่ม)
    - **อ่านอย่างเดียว + ไม่เดามั่ว + ไม่ทำแถวหาย:** เติมคอลัมน์ท้าย ไม่แก้ข้อมูลเดิม · **ฐานไม่ใช่ตัวเลข/ติดลบ → เว้นว่าง ไม่ปันให้** + นับ `skippedRows` · ฐาน = 0 → ได้ปัน 0 (ยังนับเป็นแถวที่ปันได้) · ทุกแถวออกครบ (rows.length = dataRows, input ไม่ mutate)
    - `parseNumeric` inline (comma/trim, bool/Infinity/ว่าง→null) · `round?` default 2 · error: no-data / basisCol นอกช่วง / total ไม่ finite ("ใส่ยอดรวม...") / total<0 ("ยอดรวมต้องไม่ติดลบ") / ไม่มีแถวฐานเป็นเลข / basisTotal=0 → คืนของเดิม · คืน `allocatedTotal` (= total ที่ปัดแล้ว) ยืนยัน no-loss
  · UI `src\app\allocate\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → **auto-guess คอลัมน์ฐาน** (หัวเข้าข่าย น้ำหนัก/weight/kg/cbm/คิว/ปริมาตร/จำนวน/กล่อง ก่อน ไม่งั้นคอลัมน์ตัวเลขที่มีค่ามากสุด) → dropdown ชี้คอลัมน์ฐาน + input ยอดรวม + ชื่อคอลัมน์ + toggle % สัดส่วน / ปัดทศนิยม → chips (ปันได้/ฐานไม่ใช่ตัวเลข/ผลรวมฐาน + **"รวมที่ปันส่วน" sky = allocatedTotal ยืนยันเป๊ะ**) + ตาราง (คอลัมน์ใหม่ไฮไลต์ emerald +⚖️) + ดาวน์โหลด CSV/Excel
  · verify 2 ชั้น: (1) **Node test 68/68 ผ่าน**: ปันพื้นฐาน (2/3/5 → 20/30/50), **largest remainder** ([1,1,1]/100 → 33.34/33.33/33.33 รวม 100 เป๊ะ, tie แถวแรกได้เศษ · 7×1/100 → 4×14.29+3×14.28), **invariant Σ=allocatedTotal (300 สุ่ม)**, ฐานไม่ใช่ตัวเลข/ติดลบ → เว้นว่าง+skip, ฐาน 0 → ได้ 0, basisTotal=0/no-alloc/total<0/NaN → error, total=0 → ทุกแถว 0, round 0 (34/33/33), showShare, ชื่อ custom/ว่าง→default, comma parse, ตัดแถวว่าง, ragged skip, input ไม่ mutate
    (2) **Chrome UI จริง** (CSV `tracking,น้ำหนัก,note`: KY001-003=1, KY004=xxx, KY005=-5, total 100): auto-guess = น้ำหนัก · **ปันได้ 3/ฐานไม่ใช่ตัวเลข 2/รวมที่ปันส่วน 100** · ยอด 33.34/33.33/33.33 (รวม 100 เป๊ะ largest remainder), % 33.33 ทุกแถว, KY004(xxx)+KY005(-5) เว้นว่างทั้ง 2 คอลัมน์ · CSV 6 บรรทัด (แถวเว้นว่างคงอยู่ KY004,xxx,skip,, ) มี 33.34 · Excel PK magic 16.7KB spreadsheetml · **console สะอาด**
- 2026-07-11 — **เครื่องมือที่ 64 พร้อมใช้: ปัดตัวเลขในคอลัมน์ 🔟** (`/round`) — หมวดโลจิสติกส์ · use-case จริง: บิลค่าขนส่งมักปัด "น้ำหนักคิดเงิน" **ขึ้น** เป็นขั้น 0.5/1.0 กก. เสมอ → ปัดทั้งคอลัมน์ทีเดียวตามกฎบิล
  · **ต่างจาก /calc-col (คูณ/หาร) และ /clean (แค่ตัด comma เป็น number)** — อันนี้ปัดตามกฎบิล (ขึ้น/ลง/ใกล้สุด + ขั้น/ทศนิยม)
  · engine `src\lib\roundcol\roundcol.ts` (pure): `roundValue(value, mode, step, decimals)` (ปัดค่าเดียว — export ไว้เทส) + `analyzeRound(header, allRows, {col, mode, step?, decimals?, replace?, colName?})`
    - 3 โหมด (`RoundMode`): nearest (Math.round) / up (ceil) / down (floor) · ปัด 2 แบบ: **เป็นขั้น (step>0)** → q=value/step; applyMode; qr×step; แล้ว `cleanFloat` ล้างเศษ float (decimalsOf(step)+2 ตำแหน่ง) · **จำนวนทศนิยม (step=0/ว่าง)** → ปัดตาม decimals
    - `applyMode` ใช้ **EPS=1e-9** กันเศษ float หลอก (12.5 ปัดขึ้นขั้น 0.5 = 12.5 ไม่เด้งเป็น 13) · step 0.5/1/0.25/5/10/100 · negative ทำงานถูก (up −12.3→−12, down −12.3→−13)
    - **ปรัชญาไม่เดามั่ว + ไม่ทำแถวหาย:** ช่องไม่ใช่ตัวเลข = **คงค่าเดิม ไม่แตะ** + นับ `skippedRows` (โหมดเติม → คอลัมน์ใหม่เว้นว่าง; โหมดแทนที่ → เก็บค่าเดิม) · **default = เติมคอลัมน์ใหม่ท้ายตาราง (ไม่ทับของเดิม)** ชื่อ "ปัดแล้ว" · **โหมดแทนที่ = opt-in** (ทับ opts.col เฉพาะช่องที่ปัดได้) · `changedRows` = ช่องที่ค่าจริงเปลี่ยนหลังปัด · ทุกแถวออกครบ (rows.length=dataRows, input ไม่ mutate)
    - error: no-data / col นอกช่วง / step ติดลบ ("ขั้น (step) ต้องเป็นบวก") · step=0 → fall through ไปโหมดทศนิยม
  · UI `src\app\round\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → **auto-guess คอลัมน์** (หัวเข้าข่าย น้ำหนัก/weight/kg/chargeable/คิดเงิน/cbm/คิว/ปริมาตร ก่อน ไม่งั้นคอลัมน์ตัวเลขแรก) → dropdown คอลัมน์ + ปุ่มโหมด (indigo up/nearest/down) + toggle เป็นขั้น/ทศนิยม (sky) + input ขั้น + ปุ่มลัด preset (0.5/1/0.25/5/10/100) หรือ input ทศนิยม + checkbox ทับคอลัมน์เดิม + ชื่อคอลัมน์ใหม่ → chips (emerald "ปัดได้ N"/sky "ค่าเปลี่ยน N"/amber "ไม่ใช่ตัวเลข (คงเดิม) N") + ตาราง (คอลัมน์ใหม่/ที่ทับไฮไลต์ +🔟) + ดาวน์โหลด CSV/Excel
  · verify 2 ชั้น: (1) **Node test 69/69 ผ่าน**: roundValue (nearest/up/down d0-d2, exact-stays, negative Math.round −12.5→−12, step 0.5/1/0.25/5/10 up/down/nearest, float dust 0.29→0.3/0.31→0.4/0.1→0.5), analyzeRound (add-column default step 0.5 up A→12.5/B→12.5/C→13 + roundedRows 3/changedRows 2, replace mode ทับ col, non-numeric skip เว้นว่าง+เก็บเดิม, comma parse 1234.5→1235, decimals mode 3.14159→3.14, step=0→decimals, custom/blank colName, error no-data/oob/negcol/negstep, ตัดแถวว่าง, ragged skip, input ไม่ mutate, rows.length, changedRows=1 เมื่อค่าอยู่บนขั้นแล้ว)
    (2) **Chrome UI จริง** (CSV `item,น้ำหนัก,note`: A 12.3/B 12.5/C 12.6/D xxx/E 5): auto-guess = น้ำหนัก · **step 0.5 up** → A 12.5/B 12.5(exact)/C 13/D เว้นว่าง(skip)/E 5 · chips ปัดได้ 4/ค่าเปลี่ยน 2/ไม่ใช่ตัวเลข 1 · **ทศนิยม d0 nearest** → 12.3→12/12.5→13/12.6→13, ค่าเปลี่ยน 3 · **โหมดแทนที่** → ทับ น้ำหนัก ในที่ (ไม่มีคอลัมน์ใหม่), xxx เก็บเดิม, หัวไฮไลต์ "น้ำหนัก 🔟" · CSV 6 บรรทัด (แถว skip เว้นว่างคงอยู่) · Excel PK magic 16.6KB spreadsheetml · **console สะอาด**
- 2026-07-11 — **เครื่องมือที่ 65 พร้อมใช้: จัดชั้นตามช่วงตัวเลข 🪜** (`/bracket`) — หมวดโลจิสติกส์ · **ค้นค่าตามช่วง (tiered/bracket lookup)** · use-case จริง: อัตราค่าขนส่งขั้นบันได — น้ำหนัก ≤10 กก. เรต 50, ≤50 เรต 40, ≤100 เรต 30, มากกว่านั้น 20 → เติมคอลัมน์ "เรต/ชั้น" ให้ทุกแถวตามช่วงที่ค่าตกลงไป · หรือจัดหมวดขนาด (เล็ก/กลาง/ใหญ่)
  · **ต่างจาก /histogram (แค่นับจำนวนต่อ bin) และ /calc-col (คูณ/หารตรง ๆ)** — อันนี้ "ค้นค่า" ตามช่วงที่ผู้ใช้กำหนดเอง แล้วเติมค่า (เรต/ป้าย) กลับเข้าตาราง
  · engine `src\lib\bracket\bracket.ts` (pure): `sortBrackets(brackets)` (เรียงน้อย→มาก, null=+∞ ท้ายสุด, เสถียร) + `classify(v, sorted, boundary)` (คืน index ช่วงแรกที่เข้า, -1=ไม่เข้า) + `analyzeBracket(header, allRows, {col, brackets, boundary?, colName?})`
    - `Bracket {upTo: number|null, value: Cell}` · **upTo=null = catch-all** (ชั้นบนสุดรับทุกค่าที่เกินขอบอื่น) · **boundary "le"** (v≤upTo, ขั้นบันไดมาตรฐาน) vs **"lt"** (v<upTo)
    - **ปรัชญาไม่เดามั่ว + ไม่ทำแถวหาย:** ช่องไม่ใช่ตัวเลข → เว้นว่าง (นับ `skippedRows`) · เป็นตัวเลขแต่ไม่เข้าช่วงไหนเลย (ไม่มี catch-all) → เว้นว่าง (นับ `outOfRangeRows`) · จัดชั้นได้ → นับ `matchedRows` เติม `bracket.value` · **default = เติมคอลัมน์ใหม่ท้ายตาราง (ไม่ทับของเดิม)** ชื่อ "ชั้น" · ทุกแถวออกครบ (rows.length=dataRows, input ไม่ mutate)
    - error: no-data / col นอกช่วง ("เลือกคอลัมน์ที่จะจัดชั้นให้อยู่ในช่วง") / ไม่มี bracket ("ยังไม่มีช่วง (bracket) ให้จัด") / upTo ไม่ใช่ตัวเลข ("ขอบบนของช่วงต้องเป็นตัวเลข")
  · UI `src\app\bracket\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → **auto-guess คอลัมน์** (หัวเข้าข่าย น้ำหนัก/weight/kg/cbm/คิว/ปริมาตร/ราคา/จำนวน) → dropdown คอลัมน์ + ปุ่ม boundary (sky ≤ รวมขอบบน / < ไม่รวมขอบบน) + รายการช่วงแบบไดนามิก (upTo → value + ✕ ลบ + "+ เพิ่มช่วง") + checkbox "และมากกว่านั้น →" (catch-all) + input ค่า + ชื่อคอลัมน์ใหม่ → chips (emerald "จัดชั้นได้ N"/orange "นอกช่วง N"/amber "ไม่ใช่ตัวเลข (คงเดิม) N") + ตาราง (คอลัมน์ใหม่ไฮไลต์ +🪜) + ดาวน์โหลด CSV/Excel · `coerceValue` แปลงค่า value เป็นเลขถ้าเป็นรูปเลข ไม่งั้นคงเป็น string (ป้ายข้อความ S/M/L)
  · verify 2 ชั้น: (1) **Node test 55/55 ผ่าน**: sortBrackets (เรียง+null ท้าย+เสถียร tie), classify le (5→0/10→0 boundary/10.1→1/250→catch-all/negative→0), classify lt (10→1 exclusive/100→catch-all), no-catch-all (60→-1), analyzeBracket table (TIERS ≤10→50/≤50→40/≤100→30/null→20, matchedRows, คอลัมน์เดิมไม่แตะ), non-numeric skip, out-of-range, lt boundary, comma parse (1,500→20), string labels (S/M/L), unsorted input, custom/blank colName, errors (no-data/col-oob/negcol/no-brackets/NaN-upTo), blank rows dropped, ragged, rows.length, input ไม่ mutate, only-catch-all (all→FLAT), zero value (3→0 matched)
    (2) **Chrome UI จริง** (CSV `tracking,weight,note`: 5/25/100/500/xxx/10): auto-guess = weight · **le + catch-all** → 5→50/25→40/100→30/500→catch-all 20/xxx→เว้นว่าง(skip)/10→50 · chips จัดชั้นได้ 5/ไม่ใช่ตัวเลข 1 · **lt** → 10→40 (10<10 เท็จ ตกช่วง ≤50), 100→catch-all 20 (100<100 เท็จ) · **catch-all off** → 500→เว้นว่าง(นอกช่วง), chips จัดชั้นได้ 4/นอกช่วง 1/ไม่ใช่ตัวเลข 1 · CSV 7 บรรทัด (หัวมี "ชั้น", KY004 เว้นว่างคงอยู่) · Excel PK magic 16.7KB spreadsheetml · **console สะอาด**
- 2026-07-11 — **เครื่องมือที่ 66 พร้อมใช้: คำนวณจำนวนวันระหว่างวันที่ 📆** (`/date-diff`) — หมวดโลจิสติกส์ · เติมคอลัมน์ "จำนวนวัน" จากผลต่างวันที่ 2 ช่อง · use-case จริง: ระยะเวลาขนส่ง (ETA − ETD = กี่วัน) · วันเก็บตู้/ค่าเดโมเรจ (วันนี้ − วันตู้เข้า) · อายุงาน (กี่วันผ่านมาแล้ว)
  · **ต่างจาก /calc-col (คูณ/หารตัวเลขตรง ๆ)** — อันนี้ parse "วันที่" ก่อน (ISO/DD-MM/YYYYMMDD/Excel serial/พ.ศ.) แล้วค่อยลบกันเป็นจำนวนวัน/สัปดาห์
  · engine `src\lib\datediff\datediff.ts` (pure): `parseDateToMs(cell, dayFirst?, buddhistInput?)` (→ epoch ms UTC เที่ยงคืน หรือ null · reuse ตรรกะ parse จาก datefmt: Excel serial integer เท่านั้น ช่วง 20000–60000, normalizeYear pivot 70 + พ.ศ. −543, validYMD leap) + `diffDates(startMs, endMs, {unit, absolute, inclusive, round})` (rawDays = Math.round((end−start)/86400000), negative=rawDays<0, inclusive ±1 ตามทิศ, weeks=days/7, cleanFloat ปัด) + `analyzeDateDiff(header, allRows, {startCol, endCol, unit?, absolute?, inclusive?, dayFirst?, buddhistInput?, round?, colName?})`
    - **ปรัชญาไม่เดามั่ว + ไม่ทำแถวหาย:** ช่องใดช่องหนึ่ง parse วันที่ไม่ได้ → เว้นว่าง (นับ `skippedRows`) · parse ได้ทั้ง 2 → นับ `computedRows` เติมผลต่าง · `negativeRows` = จบก่อนเริ่ม (นับก่อนทำ absolute) · **default = เติมคอลัมน์ใหม่ท้ายตาราง (ไม่ทับของเดิม)** ชื่อ "จำนวนวัน"/"จำนวนสัปดาห์" · ทุกแถวออกครบ (rows.length=dataRows, input ไม่ mutate) · width ขยายถ้าแถวกว้างกว่าหัว
    - error: no-data / startCol นอกช่วง ("เลือกคอลัมน์วันที่เริ่มให้อยู่ในช่วง") / endCol นอกช่วง ("เลือกคอลัมน์วันที่จบให้อยู่ในช่วง") / startCol===endCol ("คอลัมน์เริ่มกับจบต้องคนละคอลัมน์")
  · UI `src\app\date-diff\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → **auto-guess 2 คอลัมน์** (หัวเข้าข่าย etd/เริ่ม/start/loading → เริ่ม · eta/จบ/end/arrival/due → จบ ไม่งั้นคอลัมน์วันที่ 2 ตัวแรก) → dropdown เริ่ม/จบ + ปุ่มหน่วย (sky วัน/สัปดาห์) + ชื่อคอลัมน์ใหม่ + checkbox นับปลายทั้งสอง(inclusive)/ไม่สนทิศ(absolute)/DD-MM(dayFirst)/พ.ศ.(buddhistInput) → chips (emerald "คำนวณได้ N"/orange "ค่าติดลบ N"/amber "อ่านวันที่ไม่ได้ (เว้นว่าง) N") + ตาราง (คอลัมน์ใหม่ไฮไลต์ +📆) + ดาวน์โหลด CSV/Excel · weeks default ปัด 2 ตำแหน่ง · dayFirst toggle re-guess คอลัมน์
  · verify 2 ชั้น: (1) **Node test 79/79 ผ่าน**: parseDateToMs (iso/dd-mm/mm-dd(dayFirst=false)/yyyymmdd/dot/dash/short-month/พ.ศ. 2&4 หลัก/pivot 70/Excel serial 45848→2025-07-10/out-of-range null/invalid month-day/29 ก.พ. ปีปกติ null/leap ok/blank/garbage/bool/null/**float serial rejected (time-of-day ไม่จัดการ)**), diffDates (10 วัน/negative/absolute/same-day 0/inclusive same-day 1/inclusive +1/inclusive negative −1/weeks 2/weeks fractional 1.43/no-round/null start-end-both/round 0), analyzeDateDiff (r1 ตารางเต็ม A→10/B→4/C→−5/D,E skip/F→0 + addedCols/firstNewIndex 3/computedRows 4/skippedRows 2/negativeRows 1/คอลัมน์เดิมไม่แตะ, absolute, inclusive, weeks colName+1.43, custom/blank colName, buddhist, mm/dd, errors no-data/oob×2/neg/same-col, blank rows dropped, ragged skip, input ไม่ mutate, UNIT_LABEL, width ขยาย, cross-year 11, leap span 2)
    (2) **Chrome UI จริง** (CSV `tracking,etd,eta`: 2025-07-01→2025-07-11 / 01/07/2025→05/07/2025 (DD/MM) / 2025-07-10→2025-07-05 (ย้อน) / xxx→2025-07-11 / same-day): auto-guess = etd/eta · **days** → KY001 10/KY002 4(DD/MM parse ถูก)/KY003 −5/KY004 เว้นว่าง(skip)/KY005 0 · chips คำนวณได้ 4/ค่าติดลบ 1/อ่านวันที่ไม่ได้ 1 · **weeks** → หัว "จำนวนสัปดาห์", 10→1.43/4→0.57/−5→−0.71 · **inclusive** → 10→11/0→1/−5→−6 · CSV 6 บรรทัด (หัวมี "จำนวนวัน", KY004 เว้นว่างคงอยู่) · Excel PK magic 16.7KB spreadsheetml · **console สะอาด**
- 2026-07-11 — **เครื่องมือที่ 67 พร้อมใช้: ติดป้ายตามเงื่อนไข 🏷️** (`/if-col`) — หมวดจัดระเบียบ · เติมคอลัมน์ป้าย/หมวดตามเงื่อนไข (IF/CASE) · use-case จริง: note มี "ด่วน" → "เร่งด่วน", status = "hold" → "ระงับ", น้ำหนัก > 100 → "หนักพิเศษ", CBM ว่าง → "ต้องตรวจ"
  · **ต่างจากเครื่องมืออื่น:** /bracket จัดชั้นตัวเลขล้วน · /filter กรองแถว (ไม่เติมคอลัมน์) · /validate แค่ valid/invalid · **อันนี้ = หลายเงื่อนไขไล่บนลงล่าง เจอข้อแรกที่ตรง = ใช้ป้ายนั้น รองรับทั้งข้อความ+ตัวเลข**
  · engine `src\lib\ifcol\ifcol.ts` (pure): `analyzeIfCol(header, allRows, {col, rules, elseValue?, colName?, caseInsensitive?, trim?})` → `CondRule {op, value?, then}` · 14 operator (`OP_LABEL`): ข้อความ contains/not-contains/equals/not-equals/starts/ends/regex · ว่าง empty/not-empty (`NO_VALUE_OPS`) · ตัวเลข gt/gte/lt/lte/eq-num (`NUMERIC_OPS`)
    - **ปรัชญาไม่เดามั่ว + ไม่ทำแถวหาย:** เงื่อนไขที่ยังไม่กรอกค่า = **ถูกข้าม** (isActiveRule: value ว่าง / numeric op ที่ค่าเทียบไม่ใช่ตัวเลข → ไม่ compile) · เลขเทียบกับช่องไม่ใช่ตัวเลข = ไม่ตรง (ตกไป else) · **default = เติมคอลัมน์ใหม่ท้ายตาราง ชื่อ "ป้าย" (ไม่ทับของเดิม)** · else default = null (เว้นว่าง) · ทุกแถวออกครบ (rows.length=dataRows, input ไม่ mutate) · width ขยายถ้าแถวกว้างกว่าหัว
    - **first-match-wins:** ไล่ compiled rules ตามลำดับ เจอข้อแรก evalRule=true → ใช้ `rule.then`, `ruleCounts[idx]++`, `matchedRows++`, return ทันที · ไม่ตรงเลย → `elseValue`, `elseRows++` · text ops normalize ด้วย trim (default on) + caseInsensitive (default on, lowercase) · regex compile flag "i" ถ้า caseInsensitive · `parseNumeric` inline (ตัด comma+trim, bool/Infinity/ว่าง→null)
    - error: no-data / col นอกช่วง ("เลือกคอลัมน์ที่จะตรวจให้อยู่ในช่วง") / rules ว่าง ("ยังไม่มีเงื่อนไข") / regex เสีย (`Regex ไม่ถูกต้อง (เงื่อนไขที่ N): ...`)
  · UI `src\app\if-col\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → auto-guess คอลัมน์ (หัวเข้าข่าย note/สถานะ/หมายเหตุ/status ก่อน ไม่งั้นคอลัมน์แรก) → dropdown คอลัมน์ + **ลิสต์เงื่อนไขไดนามิก** (operator select ซ่อนช่องค่าเมื่อ empty/not-empty · ช่องค่า · → ป้าย · นับ N แถว/ข้อ · ✕ · "+ เพิ่มเงื่อนไข") + ป้าย else + ชื่อคอลัมน์ + toggle ไม่สนพิมพ์เล็กใหญ่/ตัดช่องว่าง → chips (emerald "ติดป้ายได้ N"/neutral "ตกกรณีอื่น (else) N") + ตาราง (คอลัมน์ใหม่ไฮไลต์ +🏷️) + ดาวน์โหลด CSV/Excel
  · verify 2 ชั้น: (1) **Node test 84/84 ผ่าน**: contains/not-contains/equals/not-equals/starts/ends/empty(+spaces=blank)/not-empty, first-match-wins (ruleCounts ถูก), else custom, numeric gt/gte/lt/lte/eq-num (+ช่องไม่ใช่ตัวเลข→false, comma parse), case-insensitive on/off, trim on/off, regex (+ci default, invalid→error), **inactive rule ข้าม** (value ว่าง / numeric op ค่าเทียบไม่ใช่ตัวเลข → ข้ามไป rule ถัดไป), all-inactive→else, then เป็นตัวเลข, colName custom/blank→"ป้าย", errors (no-data/col-oob×2/no-rules), blank rows filtered, width ขยาย, short row→null cell→else, empty บน 0(number)→ไม่ blank, **invariant matched+else=dataRows + ΣruleCounts=matchedRows + input ไม่ mutate**
    (2) **Chrome UI จริง** (CSV `tracking,note,kg` 5 แถวจริง + แถวว่าง): auto-guess = note · **ข้อความ** rule1 contains ด่วน→เร่งด่วน / rule2 contains hold→ระงับ → KY001 เร่งด่วน, KY003 "hold ระงับ"→ระงับ (**first-match-wins: rule1 ด่วน ไม่ตรง → rule2 ชนะ**), อื่น→else · chips ติดป้ายได้ 2/else 3, ruleCounts 1/1 · **ตัวเลข** col=kg, rule1 gt 100→หนักพิเศษ / rule2 lt 10→เบา → KY002/KY004 หนักพิเศษ, KY005 เบา, KY001/KY003 else · chips 3/2, ruleCounts 2/1 · **else custom "อื่นๆ"** → KY001/KY003 ได้ "อื่นๆ" · CSV 6 บรรทัด 4 คอลัมน์ (หัวท้าย "ป้าย") · Excel PK magic 16.8KB spreadsheetml · **console สะอาด**
- 2026-07-11 — **เครื่องมือที่ 68 พร้อมใช้: แยกส่วนวันที่ 📅** (`/date-parts`) — หมวด excel · แยกคอลัมน์วันที่ (ETD/ETA/วันตู้เข้า) เป็น ปี/เดือน/วัน/ไตรมาส/ปี-เดือน/ชื่อเดือน/วันในสัปดาห์/สัปดาห์ ISO → เอาไป /group /pivot ต่อได้ (มีกี่ตู้ต่อเดือน / น้ำหนักรวมต่อไตรมาส)
  · **ต่างจากญาติ ๆ:** /date (datefmt = จัดรูปทั้งวันเป็นรูปแบบเดียว) · /split-col (แยกตามตัวคั่น literal ตามตำแหน่ง) · /date-diff (ผลต่าง 2 วันเป็นจำนวนวัน) → **อันนี้ parse วันที่จริงแล้วแตกเป็นหลายคอลัมน์ส่วนประกอบ** (enable group/pivot by month/quarter)
  · engine `src\lib\dateparts\dateparts.ts` (pure): `analyzeDateParts(header, allRows, {col, parts, dayFirst?, buddhistInput?, monthNameStyle?, quarterStyle?})` + `parseDateParts(cell, dayFirst, buddhistInput)` (→ `{y,m,d}` Gregorian หรือ null) + `partValue(ymd, part, opts)` (export ไว้เทส) · 9 ส่วน (`DatePart`): year/buddhist-year/month/month-name/day/weekday/quarter/year-month/iso-week (`PART_LABEL`/`PART_COLNAME`)
    - parse reuse ตรรกะ datediff (inline ตามกฎ pure): ISO ปีก่อน · DD-MM-YYYY (คั่น / . -) · YYYYMMDD 8 หลัก · Excel serial (number cell เท่านั้น, ช่วง 20000–60000, ไม่ปรับ พ.ศ.) · normalizeYear pivot 70 + `buddhistInput` −543 · validYMD (เดือน 1-12, วันในเดือนจริง + leap)
    - **ปรัชญาไม่เดามั่ว + ไม่ทำแถวหาย:** ช่อง parse ไม่ได้ → **เว้นว่างทุกคอลัมน์ + นับ `skippedRows`** (ไม่เดา) · ช่องว่าง → เว้นว่าง + `blankRows` · parse ได้ → `computedRows` เติมส่วนตามลำดับที่เลือก · **default = เติมคอลัมน์ใหม่ท้ายตาราง (add-column only, ไม่ทับของเดิม)** firstNewIndex ท้ายหัวเดิม · **invariant: computed+skipped+blank = dataRows** · ทุกแถวออกครบ (rows.length, input ไม่ mutate) · ragged เติม null
    - `partValue`: buddhist-year = y+543 · quarter = ceil(m/3) เป็น "Q3" หรือ 3 (quarterStyle) · month-name = THAI_MONTHS_FULL/ABBR (monthNameStyle) · weekday = THAI_WEEKDAYS[getUTCDay] (index 0=อาทิตย์) · year-month = `${y}-${pad2(m)}` · iso-week = ISO 8601 (Thursday algorithm) · error: no-data / col นอกช่วง / parts ว่าง
  · UI `src\app\date-parts\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → **auto-guess คอลัมน์วันที่** (`dateScore`: หัวเข้าข่าย date/วันที่/eta/etd ก่อน ไม่งั้นสแกนค่าที่เป็นรูปวันที่/Excel serial/YYYYMMDD) → dropdown คอลัมน์ + ปุ่มเลือกส่วน (indigo ✓, default ปี/เดือน/วัน, `orderedParts` คงลำดับ ALL_PARTS) + toggle วันมาก่อน (DD/MM vs MM/DD)/พ.ศ.เข้า + ปุ่ม monthNameStyle (โผล่เมื่อเลือกชื่อเดือน)/quarterStyle (โผล่เมื่อเลือกไตรมาส) → chips (emerald "แยกได้ N"/amber "อ่านไม่ออก (เว้นว่าง) N"/neutral "ช่องว่าง N"/sky "เติม N คอลัมน์") + ตาราง (คอลัมน์ใหม่ไฮไลต์ +📅) + ดาวน์โหลด CSV/Excel
  · verify 2 ชั้น: (1) **Node test 70/70 ผ่าน**: parseDateParts (ISO/DD-MM/MM-DD dayFirst=false/YYYYMMDD/dot-dash/Excel serial 45848→2025-07-10/พ.ศ. 2&4 หลัก/pivot 70/out-of-range null/invalid month-day/29 ก.พ. ปีปกติ null/leap ok/blank/garbage), partValue (9 ส่วนครบ: weekday "พฤหัสบดี" 2025-07-10, quarter Q3/3, year-month zero-pad, buddhist-year +543, iso-week 28 + edge 2021-01-01=53), analyzeDateParts (ตารางเต็ม hello+empty skips, **invariant computed+skipped+blank=dataRows**, col ไม่ถูกแตะ, part-order, buddhist+abbr+quarter-number, dayFirst false, buddhistInput, errors, ragged, short header, blank-row filter, input ไม่ mutate)
    (2) **Chrome UI จริง** (CSV `tracking,etd,kg`: 10/07/2025, 2025-01-05, hello, ว่าง, 20250815): auto-guess = etd · default ปี/เดือน/วัน → **แยกได้ 3/อ่านไม่ออก 1/ช่องว่าง 1/เติม 3 คอลัมน์** · KY001 10/07/2025→2025/7/10 (dayFirst DD/MM), KY002 2025-01-05→2025/1/5, KY005 20250815→2025/8/15, KY003 hello→เว้นว่าง (skip), KY004 ว่าง→เว้นว่าง · หัวใหม่ ปี 📅/เดือน 📅/วันที่ 📅 · Excel PK magic (80,75,3,4) 16793B spreadsheetml · **console สะอาด ไม่มี hydration**
- 2026-07-11 — **เครื่องมือที่ 69 พร้อมใช้: รวมหน่วยในคอลัมน์ ⚖️** (`/unit-col`) — หมวดโลจิสติกส์ · แปลงทั้งคอลัมน์ที่ค่าปนหน่วยให้เป็นหน่วยเดียวกัน · use-case จริง: packing list/export ที่น้ำหนักปนหน่วย "10 kg" / "5,000 g" / "1.5 ton" → เป็น kg หมดก่อนเอาไป /reconcile /group /stats (ไม่งั้นบวกกันมั่ว)
  · **ต่างจาก /convert** (แปลงหน่วยกรอกทีละค่า live) — อันนี้ **อ่านหน่วยจากในช่องเอง** แล้วทำทั้งไฟล์ · ต่างจาก /calc-col (คูณตัวคูณคงที่) — อันนี้จับหน่วยต่อช่องได้ (แต่ละแถวหน่วยต่างกันได้)
  · engine `src\lib\unitcol\unitcol.ts` (pure): `analyzeUnitCol(header, allRows, {col, category, targetUnit, assumeUnit?, round?, mode?, colName?})` + `parseValueUnit(cell)` + `UNIT_COL_CATEGORIES` (3 หมวด) + `getCategoryDef`/`getUnitEntry`/`STATUS_LABEL`
    - 3 หมวด: **weight** (base kg: kg/g/ton/lb 0.45359237/oz) · **length** (base m: m/cm/mm/inch 0.0254 alias `"`/ft 0.3048 alias `'`) · **volume** (base m³: m3/cm3/liter/ft3) — แต่ละหน่วยมี alias ไทย+อังกฤษ (กิโล/กรัม/ตัน/ปอนด์/ออนซ์/เมตร/นิ้ว/ฟุต/ลิตร/คิว...)
    - `parseValueUnit`: number cell → `{num, unitToken:""}` (ไม่มีหน่วย) · boolean/null → null · ตัด comma · regex `/^([+-]?(?:\d+\.?\d*|\.\d+))\s*(.*)$/` แยกตัวเลข+โทเคนหน่วย (มี/ไม่มีช่องว่างก็ได้ "500g"/"500 g")
    - **6 สถานะต่อแถว** (`UnitRowStatus`): converted (มีหน่วยในหมวด แปลงได้) · assumed (ไม่มีหน่วย + ตั้ง assumeUnit → ถือเป็นหน่วยนั้น) · ambiguous (ไม่มีหน่วย + ไม่ตั้ง assume → **ข้าม ไม่เดามั่ว**) · mismatch (หน่วยผิดหมวด/อ่านไม่ออก เช่น "3 m" ในหมวดน้ำหนัก → ข้าม) · non-numeric (ไม่ใช่ตัวเลข → ข้าม) · blank (ว่าง)
    - **ปรัชญาไม่เดามั่ว + ไม่ทำแถวหาย:** ช่องไม่มีหน่วย = **ไม่เดา** (ข้าม เว้นแต่ผู้ใช้สั่ง assumeUnit) · หน่วยผิดหมวด/อ่านไม่ออก = เว้นว่าง โชว์ให้เห็น · **default = เติมคอลัมน์ใหม่ท้ายตาราง (ไม่ทับของเดิม)**, replace = opt-in · **invariant: 6 status counts รวม = dataRows** · ทุกแถวออกครบ (rows.length, input ไม่ mutate) · `applyRound` (null → cleanFloat(v,12); else ปัด N ตำแหน่ง) · samples cap 50
  · UI `src\app\unit-col\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → **auto-guess คอลัมน์** (`guessCol`: หัวเข้าข่าย น้ำหนัก/weight/kg/cbm/คิว/ปริมาตร/ยาว/กว้าง/สูง/ขนาด/unit/หน่วย ก่อน ไม่งั้น `unitScore` คอลัมน์ที่ parse หน่วยได้มากสุด) → แท็บหมวด (indigo) + dropdown หน่วยปลายทาง + checkbox "ช่องที่ไม่มีหน่วย → ถือว่าเป็น:" + dropdown + toggle ปัดทศนิยม/ทับคอลัมน์เดิม + ชื่อคอลัมน์ใหม่ → chips 6 สถานะ + ตัวอย่างก่อน→หลัง + ตาราง (คอลัมน์ใหม่ไฮไลต์ +⚖️) + ดาวน์โหลด CSV/Excel
  · verify 2 ชั้น: (1) **Node test 75/75 ผ่าน**: parseValueUnit (number/comma/no-space/boolean-null/negative/decimal), หน่วยครบ 3 หมวด (weight kg/g/ton/lb/oz, length m/cm/mm/inch/ft + alias `"`/`'`, volume m3/cm3/liter/ft3), converted/assumed/ambiguous/mismatch/non-numeric/blank, assumeUnit null=ข้าม vs set=ถือเป็นหน่วย, add vs replace mode, round on/off (cleanFloat), samples cap 50, **invariant 6 counts รวม = dataRows + input ไม่ mutate**, error (col นอกช่วง)
    (2) **Chrome UI จริง** (CSV น้ำหนักปนหน่วย 7 แถว): 10kg→10, 5,000g→5 (comma), 1.5ton→1500, 500g→0.5 (ไม่มีช่องว่าง), "2"→ไม่มีหน่วย(ข้าม), "3 m"→หน่วยอ่านไม่ออก(ข้าม), "abc"→ไม่ใช่ตัวเลข · chips แปลงแล้ว 4/ไม่มีหน่วย 1/หน่วยอ่านไม่ออก 1/ไม่ใช่ตัวเลข 1 = 7 แถว · **assume kg** → "2"→assumed 2 kg (chip ถือว่าเป็นหน่วย 1) · Excel PK magic (80,75,3,4) 16561B spreadsheetml · **console สะอาด ไม่มี hydration**
- 2026-07-11 — **เครื่องมือที่ 70 พร้อมใช้: ล้างตัวเลขให้สะอาด 🧼** (`/num-clean`) — หมวดจัดระเบียบ · แปลงข้อความตัวเลขที่เลอะเป็น number จริง (locale/currency-aware) · use-case จริง: export/บิลที่ตัวเลขปนสัญลักษณ์เงิน/หลักพันคนละแบบ → ล้างทั้งคอลัมน์ก่อนเอาไป /group /reconcile /calc-col ต่อ
  · **ต่างจาก /clean** (แค่ตัด comma แบบ US แล้ว `Number()`) — อันนี้เข้าใจ EU "1.234,56", สัญลักษณ์+รหัสสกุลเงิน ($ ฿ € £ ¥ ₩ ₫ ₱ / usd/eur/บาท/ดอลลาร์...), วงเล็บติดลบสไตล์บัญชี, %, NBSP/ช่องว่าง
  · engine `src\lib\numclean\numclean.ts` (pure): `cleanNumber(cell, {decimalMode?, percentToFraction?})` → `ParseNumResult {ok, value}` + `analyzeNumClean(header, allRows, opts)` → `NumCleanResult`
    - **3 โหมดจุดทศนิยม (`DecimalMode` us/eu/auto, default us):** ทั้งจุด+คอมมา → us "."=ทศนิยม/eu ","=ทศนิยม/auto=ตัวขวาสุดเป็นทศนิยม · ตัวเดียว → us/eu กำหนดบทบาทตายตัว · auto เดาจาก count>1=group / กลุ่มท้ายยาว 3=group · >1 จุดหลังลบ group → null (ไม่เดามั่ว)
    - `parseCore`: strip currency symbol/code + `\s`/NBSP · วงเล็บ `(...)` = ติดลบบัญชี · +/- นำหน้า · ต่อท้าย % (เก็บ % ไว้ หรือ ÷100 ถ้า percentToFraction) · **เหลืออักขระที่ไม่ใช่ `[\d.,]` → null** (ไม่เดา) · validate `/^\d*\.?\d*$/` + ต้องมีเลข
    - **ปรัชญาไม่เดามั่ว + ไม่ทำแถวหาย:** อ่านไม่ออก → เว้นว่าง (นับ unparseableRows) โชว์ให้เห็น · number cell finite → already (นับแยก) · ช่องว่าง → blank · **default = เติมคอลัมน์ใหม่ท้ายตาราง (ไม่ทับของเดิม)** ชื่อ `${หัว} (ตัวเลข)`, replace = opt-in (ทับเฉพาะช่องที่ค่า≠null) · `round?` ปัดทศนิยม · samples cap 50 · **invariant: cleaned+already+unparseable+blank = dataRows** (input ไม่ mutate)
    - error: no-data / col นอกช่วง ("เลือกคอลัมน์ที่จะล้างตัวเลขให้อยู่ในช่วง")
  · UI `src\app\num-clean\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → **auto-guess คอลัมน์** (`dirtyScore`: นับช่องที่ cleanNumber(us) สำเร็จ แต่ยังไม่เท่ากับค่าดิบ = "ตัวเลขที่ยังเลอะ", หัวเข้าข่าย price/ราคา/amount/ยอด/เงิน/total/รวม/มูลค่า/cost/ต้นทุน ก่อน) → แท็บโหมดจุดทศนิยม (us/eu/auto) + toggle %→เศษส่วน/ปัดทศนิยม/ทับคอลัมน์เดิม + ชื่อคอลัมน์ใหม่ → chips (emerald ล้างแล้ว/sky เป็นตัวเลขอยู่แล้ว/amber อ่านไม่ออก/neutral ว่าง) + ตัวอย่างก่อน→หลัง + ตาราง (คอลัมน์ใหม่ไฮไลต์ +🧼) + ดาวน์โหลด CSV/Excel
  · verify 2 ชั้น: (1) **Node test 103/103 ผ่าน**: cleanNumber us/eu/auto (จุด+คอมมา + ตัวเดียว), currency symbol/code strip, วงเล็บติดลบบัญชี, +/- sign, % (เก็บ vs ÷100), whitespace/NBSP, อ่านไม่ออก→null (ไม่เดา), number/boolean/null cell, table counts (cleaned/already/unparseable/blank), invariant 4 counts รวม=dataRows, add vs replace (replace ไม่ทับด้วย null), custom colName, EU/% ในตาราง, round, samples cap 50, input ไม่ mutate, ragged rows, STATUS_LABEL
    (2) **Chrome UI จริง** (CSV ราคาปน 8 แถว): **US** → $1,234.56→1234.56, (1,000)→-1000, 50%→50, ฿2,500→2500, abc→เว้นว่าง, 42→42; chips ล้างแล้ว 6/อ่านไม่ออก 1/ว่าง 1 · **EU** → 1.234,56→1234.56, $1,234.56→1.23456, (1,000)→-1, ฿2,500→2.5 (สลับ group/decimal ถูก) · CSV 179B (หัว `...,ราคา (ตัวเลข)`, 8 แถวครบ, abc→ว่าง, คอลัมน์เดิมคงอยู่) · Excel PK magic (80,75,3,4) 17018B spreadsheetml · **console สะอาด ไม่มี hydration**
- 2026-07-11 — **เครื่องมือที่ 71 พร้อมใช้: จัดรูปแบบตัวเลข 💵** (`/num-format`) — หมวด excel · **ทิศตรงข้ามกับ /num-clean** (num-clean = ข้อความเลอะ→number · อันนี้ = number ดิบ→ข้อความจัดรูปสวย) · use-case จริง: เอาผลจาก /calc-col /allocate /chargeable (number ดิบ) มาจัดรูปสำหรับใบเสนอราคา/ใบแจ้งหนี้
  · **ต่างจากญาติ:** /round (ปัดค่าแต่ยังเป็น number) · /baht-text (อ่านเป็นคำไทย) · /template (mail-merge ค่าดิบ) — อันนี้ = number → "string ที่จัดรูปแล้ว" สำหรับแสดง/ส่งออก
  · engine `src\lib\numformat\numformat.ts` (pure): `formatNumber(value, opts)` (จัด number 1 ตัว → string — export ไว้เทส/พรีวิว) + `analyzeNumFormat(header, allRows, opts)` → `NumFormatResult`
    - **ตัวคั่นหลักพัน (`ThousandsSep` comma/dot/space/none)** × **จุดทศนิยม (`DecimalSep` dot/comma)** → US 1,234.56 / EU 1.234,56 / space 1 234.56 / none 1234.56 · `groupThousands` regex `/\B(?=(\d{3})+(?!\d))/g` · `clampDecimals` (0–20, floored, default 2)
    - **prefix/suffix** (฿ $ / บาท / kg) · **ติดลบ (`NegativeStyle` minus/parens):** parens = สไตล์บัญชี `(1,234.50)` · **plusSign** แสดง + หน้าค่าบวก · **-0.00 guard:** `showNeg = negative && Number(fixed) !== 0` (ปัดแล้วเป็นศูนย์ = ไม่ติดลบ)
    - **ปรัชญาไม่เดามั่ว + ไม่ทำแถวหาย:** ช่องไม่ใช่ตัวเลข → add mode เว้นว่าง / replace mode คงค่าเดิม (นับ skippedRows) · ช่องว่าง → blank (ไม่ push sample) · **default = เติมคอลัมน์ใหม่ท้ายตาราง (ไม่ทับของเดิม)** ชื่อ `${หัว} (จัดรูป)`, replace = opt-in · non-finite (Infinity/NaN) → "" · **invariant: formattedRows + skippedRows + blankRows = dataRows** (input ไม่ mutate) · `parseNumeric` ตัด comma หลักพันแบบ US ก่อนแปลง
    - error: no-data / col นอกช่วง ("เลือกคอลัมน์ที่จะจัดรูปแบบให้อยู่ในช่วง") / **ตัวคั่นหลักพัน = จุดทศนิยม** ("ตัวคั่นหลักพันกับจุดทศนิยมต้องเป็นคนละตัว" — none ไม่เคยชน)
  · UI `src\app\num-format\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → auto-guess คอลัมน์ตัวเลข (หัวเข้าข่าย price/ราคา/amount/ยอด/kg/น้ำหนัก/weight/cbm) → เลือกคอลัมน์ + ปุ่มตัวคั่นหลักพัน/จุดทศนิยม + input ทศนิยม + prefix/suffix + ปุ่มติดลบ (−/วงเล็บ) + toggle +บวก/ทับคอลัมน์เดิม + ชื่อคอลัมน์ + **พรีวิวสด** (1,234,567.50 · -1,234.50 · 0.00) → chips (จัดรูปแล้ว/ไม่ใช่ตัวเลข ข้าม/ว่าง) + ตัวอย่างก่อน→หลัง + ตาราง (คอลัมน์ใหม่ไฮไลต์ +💵) + ดาวน์โหลด CSV/Excel
  · verify 2 ชั้น: (1) **Node test 82/82 ผ่าน**: formatNumber (US/EU/space/none separators, decimals 0-N + clamp neg→0/float floor/>20, prefix/suffix, minus/parens + prefix, **-0.00 guard** (-0.001/-0.004→0, -0.006→-0.01), plusSign (บวก/ไม่ศูนย์/ไม่ติดลบ/+prefix), Infinity/NaN→""), analyzeNumFormat (add header/counts/rows/samples — **ช่องว่างไม่ push sample** (3 formatted+1 skipped=4), replace in-place/keep-original, custom colName, EU+suffix, errors no-data/col-oob/col-neg/sep-conflict, blank-header→"คอลัมน์ 1 (จัดรูป)", all-blank-row dropped, ragged, big-number grouping, neg dec0 prefix+suffix, **invariant + input ไม่ mutate**)
    (2) **Chrome UI จริง** (CSV `item,amount` 5 แถว: 1234.56/2500/-50/abc/blank): auto-guess = amount · **US ฿ prefix dec2** → ฿1,234.56 / ฿2,500.00 / -฿50.00 / abc เว้นว่าง(skip) / ว่าง; chips จัดรูปแล้ว 3/ไม่ใช่ตัวเลข 1/ว่าง 1 · **EU parens** → 1.234,56 / (50,00) · **replace + " kg" suffix dec0** → ทับคอลัมน์ amount ในที่ (1,235 kg / 2,500 kg / abc คงเดิม) · พรีวิวสดถูกต้อง · CSV 6 บรรทัด (หัว `item,amount,amount (จัดรูป)`, ฿ ครบ) · Excel PK magic 16.8KB spreadsheetml · **console สะอาด**
- 2026-07-11 — **เครื่องมือที่ 72 พร้อมใช้: รวมค่าต่อกลุ่ม (GROUP_CONCAT) 🧵** (`/group-concat`) — หมวด excel · ยุบหลายแถว key เดียวกันเป็น 1 แถว/กลุ่ม แล้ว "ต่อ" ค่าหลายแถวในกลุ่มเป็นข้อความเดียว · use-case จริง: packing list 1 tracking แตกหลายกล่อง/หลายแถว → 1 แถว/tracking + ต่อเลขกล่อง "1, 2, 3"
  · **ต่างจากญาติ:** /rollup (รวม "ยอด" ตัวเลข sum · คอลัมน์อื่นเก็บค่าแรก/สุดท้าย) · /group (สรุปเฉพาะ key+agg — คอลัมน์อื่นหาย) · /combine-col (ต่อ "คอลัมน์" ในแถวเดียว แนวนอน) — อันนี้ = ต่อ "ค่าหลายแถว" ในกลุ่มเดียว (แนวตั้ง) เป็นข้อความเดียว
  · engine `src\lib\groupconcat\groupconcat.ts` (pure): `analyzeGroupConcat(header, allRows, opts)` → `GroupConcatResult` + `groupConcatToCsv`
    - **groupCols หลายคอลัมน์** (composite key) × **valueCols หลายคอลัมน์** (แต่ละคอลัมน์ = 1 คอลัมน์ผลลัพธ์) · `joinGroup` ต่อค่าทุกแถวในกลุ่มด้วย separator (default ", ") → string เดียว (หรือ null ถ้าไม่มีค่า)
    - opt-in ชัดเจน: `dedupe` (ตัดซ้ำใน Set, `caseInsensitive` lowercase) · `sortValues` (`localeCompare "th" {numeric:true}`) · `skipBlank` (default on — กันตัวคั่นซ้อน) · `trim` (default on) · `addCount` (เพิ่มคอลัมน์นับแถว ชื่อ `countHeader` default "จำนวนแถว") · `sortGroups` (เรียงแถวผลลัพธ์ตามคีย์)
    - **ปรัชญาไม่เดามั่ว/ไม่ทำข้อมูลหายเงียบ:** ทุกแถวเข้ากลุ่มเดียว (ผลรวมนับ = ที่นับได้) · คีย์ว่างคงเป็นกลุ่มเดี่ยวโชว์ "(ว่าง)" (เว้นสั่ง `ignoreEmptyKey` = ข้าม + นับ emptyKeyRows) · ตัดแถวว่างทั้งแถวก่อน (droppedBlankRows) · `normKey` (trim+lowercase) จับกลุ่ม แต่แสดงค่าคีย์จริงตัวแรกที่พบ · input ไม่ mutate
    - error: no-data / ไม่เลือก groupCol ("เลือกคอลัมน์ที่จะจัดกลุ่มอย่างน้อย 1 คอลัมน์") / ไม่เลือก valueCol ("เลือกคอลัมน์ที่จะต่อค่าอย่างน้อย 1 คอลัมน์")
  · UI `src\app\group-concat\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → auto-guess (คีย์=tracking, ค่า=box/กล่อง) → chips คอลัมน์จัดกลุ่ม (sky 🔑) + chips คอลัมน์ต่อค่า (indigo 🧵) + ปุ่มตัวคั่นลัด (`, / | ↵`) + 7 checkbox (ตัดซ้ำ/เรียงค่า/ข้ามว่าง[on]/trim[on]/ข้ามคีย์ว่าง/เรียงกลุ่ม/เพิ่มคอลัมน์นับ) → chips (กลุ่ม/เข้า→ยุบ/คีย์ว่าง/ตัดแถวว่าง/กลุ่มใหญ่สุด) + ตาราง (ค่าต่อ `whitespace-pre-wrap`) + ดาวน์โหลด CSV/Excel
  · verify 2 ชั้น: (1) **Node test 55/55 ผ่าน**: join พื้นฐาน (1 tracking หลายกล่อง→"1, 2, 3"), separator custom, dedupe (+ci), sortValues (numeric th), skipBlank on/off (กันตัวคั่นซ้อน), trim, composite key, addCount (นับแถวจริง), ignoreEmptyKey (คีย์ว่างข้าม vs กลุ่ม "(ว่าง)"), sortGroups, หลาย valueCol, biggestGroup, error (no-data/no-groupCol/no-valueCol), **invariant Σกลุ่ม + input ไม่ mutate**, groupConcatToCsv (esc quote เฉพาะ `,`/`"`/newline)
    (2) **Chrome UI จริง** (CSV `tracking,box,weight`: KY001×3 box[1,2,3] · KY002×2 box[1,1] ซ้ำ · KY003 box ว่าง): auto-guess key=tracking/value=box · ยุบ KY001→"1, 2, 3", KY002→"1, 1", KY003→"" · **dedupe** → KY002 "1, 1"→"1" · **addCount** → คอลัมน์ "จำนวนแถว" = 3/2/1 · CSV `tracking,จำนวนแถว,box` + `"1, 2, 3"` (comma quote), CRLF · Excel PK magic (80,75,3,4) 16210B spreadsheetml · **console สะอาด**
- 2026-07-11 — **เครื่องมือที่ 73 พร้อมใช้: เลือกค่าแรกที่ไม่ว่าง (Coalesce) 🧯** (`/coalesce`) — หมวด excel · เดินหลายคอลัมน์ตามลำดับความสำคัญ เจอค่าไม่ว่างช่องแรก = ใช้ค่านั้น → เติมเป็น 1 คอลัมน์เดียวที่ครบ · use-case จริง: ไฟล์รวมหลายแหล่ง ค่าเดียวกันอยู่คนละคอลัมน์ (tracking อยู่ "tracking"/"เลขพัสดุ"/"AWB" · น้ำหนักอยู่ "kg"/"น้ำหนัก"/"weight")
  · **ต่างจากญาติ:** /combine-col (ต่อ "ทุกคอลัมน์" ติดกันเป็นข้อความ) · /row-agg (รวมเลข sum/avg ข้ามคอลัมน์) · /fill (เติมช่องว่างจากค่าบน-ล่างในคอลัมน์เดียว แนวตั้ง) · /map (แทนค่าตามพจนานุกรม) — อันนี้ = เลือก "ค่าแรกที่มี" ข้ามคอลัมน์ (แนวนอน) ตามลำดับความสำคัญ
  · engine `src\lib\coalesce\coalesce.ts` (pure): `analyzeCoalesce(header, allRows, opts)` → `CoalesceResult` + `coalesceToCsv`
    - **cols เรียงตามลำดับความสำคัญ (ซ้าย = ก่อน)** · `pick(row)` เดินคอลัมน์ตามลำดับ เจอค่าไม่ว่างช่องแรก = ใช้ + คืน [value, sourcePosition] · `trim` (default on) trim ค่าสตริง + ใช้เช็คว่าว่าง
    - 2 โหมด: **add** (default, เติมคอลัมน์ผลรวมท้ายตาราง ชื่อ default `ค่าแรกที่ไม่ว่าง (a / b / c)`) · **replace** (เขียนลงคอลัมน์แรกที่เลือก `cols[0]` ในที่) · `addSource` = เพิ่มคอลัมน์บอกว่าค่ามาจากคอลัมน์ไหน (default "แหล่งที่มา")
    - **ปรัชญาไม่เดามั่ว/ไม่ทำข้อมูลหาย:** เลือกค่าตามที่มีจริง (ไม่แต่งค่า) · ทุกแถวออกครบ · เก็บคอลัมน์เดิม (default add) · ทุกคอลัมน์ที่เลือกว่าง → เว้นว่าง (นับ `emptyRows`) · `fromCounts` ขนานกับ opts.cols นับว่าแต่ละคอลัมน์เป็นแหล่งค่ากี่แถว · input ไม่ mutate
    - error: no-data / ไม่เลือกคอลัมน์ ("เลือกคอลัมน์ที่จะรวมอย่างน้อย 1 คอลัมน์") / คอลัมน์นอกช่วง ("คอลัมน์ที่เลือกอยู่นอกช่วง")
  · UI `src\app\coalesce\page.tsx` (client): reuse parse/detect/columns/FileDropzone → อัปโหลด → auto-guess (5 กลุ่ม regex tracking/kg/cbm/container/box เลือกกลุ่มแรกที่เจอ ≥2) → **ลิสต์คอลัมน์ที่เลือกแบบมีลำดับ** (`<ol>` เลขลำดับ + ▲▼ สลับ/✕ ลบ emerald · ไม่ sort) + chips คอลัมน์ที่ยังไม่เลือก + radio โหมด add/replace + ชื่อคอลัมน์ (add) + toggle trim/addSource + ชื่อคอลัมน์แหล่งที่มา → chips (ได้ค่า/ทุกคอลัมน์ว่าง/จากกี่แถว + fromCounts รายคอลัมน์) + ตาราง (คอลัมน์ผลไฮไลต์ 🧯 emerald + คอลัมน์แหล่งที่มา 🏷️ sky) + ดาวน์โหลด CSV/Excel
  · verify 2 ชั้น: (1) **Node test 63/63 ผ่าน**: pick ตามลำดับ (เจอช่องแรกไม่ว่าง), priority order (คอลัมน์ซ้ายชนะ), trim, add mode (คอลัมน์ผลท้าย + ชื่อ default/custom), replace mode (เขียนลง cols[0] ในที่), addSource (ชื่อคอลัมน์แหล่ง), ทุกคอลัมน์ว่าง→เว้นว่าง+emptyRows, fromCounts รายคอลัมน์, error (no-data/no-cols/col-oob), **invariant rows.length + input ไม่ mutate**, ragged, coalesceToCsv
    (2) **Chrome UI จริง** (CSV หลายคอลัมน์ tracking/AWB/เลขพัสดุ + note): auto-guess เลือก 3 คอลัมน์ตามลำดับความสำคัญ · **add** → ค่าแรกที่ไม่ว่าง KY001/AWB222/PS333/**KY004 (priority: tracking ชนะ AWB999)**/ว่าง(ทุกคอลัมน์ว่างแต่แถวรอดเพราะ note)/**KY006 (trim "  KY006  ")** · fromCounts tracking:3/AWB:1/เลขพัสดุ:1 · chips ได้ค่า 5/ว่าง 1 · **addSource** → คอลัมน์แหล่งที่มาบอกชื่อคอลัมน์ต้นทางรายแถว · **replace** → เขียนทับ tracking (cols[0]) ในที่ + คอลัมน์แหล่งที่มาต่อท้าย · CSV magic "trac" 227B CRLF · Excel PK magic 16788B spreadsheetml · **console สะอาด**
- **ถัดไป (roadmap):** persist ลง staging table ใน Supabase ภูม + เก็บ mapping preset
  ต่อฝั่ง (จำ column map ของแต่ละ format ไว้ใช้ซ้ำ) · handle หลาย sheet ดีขึ้น
  · ideas: Pacred paste-ready export · three-way reconcile · Data Cleaner/normalizer
  · **soon ที่เหลือ = ติดเงื่อนไข** (จงใจยังไม่ทำ ตามกฎ "ห้ามทำงานบัค/ไม่มี dep เกินจำเป็น"):
    - ต้อง dep นอก: PDF (merge/split/compare/pdf→excel), OCR, ลบพื้นหลัง, AI ทุกตัว (แปล/อีเมล/สรุป/prompt)
    - ต้อง "vector ตรวจถูกต้อง" ที่ยืนยันเองไม่ได้ → **QR / barcode** (ปล่อยไปถ้าสแกนได้ค่าผิด = อันตราย → รอ lib ที่เชื่อถือได้)
    - ต้องไฟล์จริงของภูม → **invoice-vs-packing 🧾** (คือ reconcile เฉพาะทาง — รอ format จริงก่อนค่อยทำ ไม่งั้นเดา schema ผิด)
    - ต้อง spec/network → container-load (3D packing), fx-rate (เรตสด)
  · **จากบรีฟ (ยังไม่ทำ):** ประวัติการใช้งาน (history) · แชร์ผลลัพธ์
    (✅ ทำแล้ว: CBM, Data Cleaner, แปลงหน่วย, drag-drop upload, จัดรูป JSON, ปุ่มสลับธีม dark/light, ลบข้อมูลซ้ำ ♻️, แปลง CSV↔Excel 🔄, แยกไฟล์ Excel ✂️, รวมหลายไฟล์ Excel 🧩, เข้ารหัส/ถอดรหัส Base64+URL 🔡, ทดสอบ Regex 🔤, คำนวณ VAT + กำไร 🧮, เปรียบเทียบ JSON 🧬, ค้นหา & กรองข้อมูล 🔎, เทียบข้อความ 🔀, จัดรูป SQL 🗃️, แปลง/ย่อ/บีบอัดรูป 🖼️, สุ่มรายชื่อ 🎲, สรุปยอด & สถิติคอลัมน์ 📊, แปลง JSON ↔ ตาราง/CSV 🔧, เทียบ 2 รายการ 🔁, เลือก/จัดเรียงคอลัมน์ 🧲, สรุปยอดแบบจัดกลุ่ม 🧮, เรียงลำดับตาราง ↕️, เติมค่าลงล่าง ⬇️, ดึงข้อมูลข้ามไฟล์ (VLOOKUP) 🔗, แยกคอลัมน์ ✂️➡️, รวมคอลัมน์ 🔗➡️, ค้นหา-แทนที่ 🔁, สร้างข้อความจากตาราง 📝, แตกแถว ↕️➡️, แปลงรูปแบบวันที่ 📅, คอลัมน์คำนวณ ➗, % สัดส่วน & ยอดสะสม 📈, แปลงเวลา Unix ⏱️, ตารางสรุปไขว้ (Pivot) 🔲, คลี่ตารางกว้าง → แนวยาว (Unpivot) 🔃, สลับแถว ↔ คอลัมน์ (Transpose) ↔️, นับความถี่ค่า (Value Frequency) 🔢, ตาราง → ข้อความ Markdown/TSV 📋, ตรวจอักขระซ่อน & ช่องว่างแปลก 👻, ตรวจเลขขาดช่วง (Sequence Gap) 🕳️, รวมแถวซ้ำ (Rollup) 🗜️, หาค่าที่คล้ายกัน (Near-duplicate) 🫧, จับค่าตัวเลขผิดปกติ (Outlier) 🚩, ตรวจความถูกต้องตามกฎ (Data Validation) 🛡️, ดึงข้อความด้วย pattern 🎯, ออกเลขลำดับ #️⃣, อ่านเลขเป็นบาทถ้วน 💰, แมปค่าตามพจนานุกรม 🗺️, ตรวจเลขตู้คอนเทนเนอร์ 📦, ตรวจเลขบัตร ปชช./ผู้เสียภาษี 🪪, เติมเลข 0 นำหน้า/จัดความกว้างรหัส 🔢, แปลงตัวพิมพ์ใหญ่/เล็ก 🔠, ส่องชนิดข้อมูลแต่ละคอลัมน์ 🔬, เทียบ 2 คอลัมน์ 🆚, จัดกลุ่มช่วงตัวเลข (Histogram) 📶, ดึงตัวอย่างแถว (Sampling) 🎰, สัดส่วน & อันดับในกลุ่ม 🥧, รวมหลายคอลัมน์ต่อแถว ➕, คำนวณน้ำหนักคิดค่าขนส่ง ✈️, ปันส่วนต้นทุนตามสัดส่วน ⚖️, ปัดตัวเลขในคอลัมน์ 🔟, จัดชั้นตามช่วงตัวเลข 🪜, คำนวณจำนวนวันระหว่างวันที่ 📆, ติดป้ายตามเงื่อนไข 🏷️, แยกส่วนวันที่ 📅, รวมหน่วยในคอลัมน์ ⚖️, ล้างตัวเลขให้สะอาด 🧼, จัดรูปแบบตัวเลข 💵, รวมค่าต่อกลุ่ม (GROUP_CONCAT) 🧵, เลือกค่าแรกที่ไม่ว่าง (Coalesce) 🧯)

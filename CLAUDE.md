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
- **ถัดไป (roadmap):** persist ลง staging table ใน Supabase ภูม + เก็บ mapping preset
  ต่อฝั่ง (จำ column map ของแต่ละ format ไว้ใช้ซ้ำ) · handle หลาย sheet ดีขึ้น
  · ideas: Pacred paste-ready export · three-way reconcile · Data Cleaner/normalizer
  · **จากบรีฟ (ยังไม่ทำ):** ประวัติการใช้งาน (history) · แชร์ผลลัพธ์ · ทยอยเปลี่ยน tool "soon" ให้เป็น ready ทีละตัว
    (✅ ทำแล้ว: CBM, Data Cleaner, แปลงหน่วย, drag-drop upload, จัดรูป JSON, ปุ่มสลับธีม dark/light · ถัดไปที่คุ้ม: ลบข้อมูลซ้ำ ♻️, เทียบ Invoice↔Packing 🧾)

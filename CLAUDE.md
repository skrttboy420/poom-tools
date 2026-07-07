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
- **ถัดไป (roadmap):** persist ลง staging table ใน Supabase ภูม + เก็บ mapping preset
  ต่อฝั่ง (จำ column map ของแต่ละ format ไว้ใช้ซ้ำ) · handle หลาย sheet ดีขึ้น
  · ideas: Pacred paste-ready export · three-way reconcile · Data Cleaner/normalizer
  · **จากบรีฟ (ยังไม่ทำ):** ประวัติการใช้งาน (history) · แชร์ผลลัพธ์ · ทยอยเปลี่ยน tool "soon" ให้เป็น ready ทีละตัว
    (✅ ทำแล้ว: CBM, Data Cleaner, แปลงหน่วย, drag-drop upload, จัดรูป JSON, ปุ่มสลับธีม dark/light, ลบข้อมูลซ้ำ ♻️, แปลง CSV↔Excel 🔄, แยกไฟล์ Excel ✂️, รวมหลายไฟล์ Excel 🧩, เข้ารหัส/ถอดรหัส Base64+URL 🔡, ทดสอบ Regex 🔤, คำนวณ VAT + กำไร 🧮, เปรียบเทียบ JSON 🧬, ค้นหา & กรองข้อมูล 🔎, เทียบข้อความ 🔀, จัดรูป SQL 🗃️ · ถัดไปที่คุ้ม: เทียบ Invoice↔Packing 🧾, สร้าง QR 🔳)

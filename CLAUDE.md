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
- **xlsx (SheetJS)** — parse Excel
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
  · ⚠️ `xlsx` (SheetJS) มี high-severity vuln ตอน parse — tool ส่วนตัวความเสี่ยงต่ำ แต่ถ้าซีเรียส
    ค่อยย้ายไปลงจาก CDN ของ SheetJS (`npm i https://cdn.sheetjs.com/xlsx-latest/xlsx-latest.tgz`)
- **ถัดไป: STEP 3 MVP Reconciler** — upload Excel/CSV → parse + column mapper → normalize ลง
  staging table → หน้า diff เทียบ 2 ฝั่ง (key=tracking) → ไฮไลต์สี → export CSV/JSON
  (รอไฟล์ตัวอย่างจริงจากพี่แต้ม/Pacred เพื่อทำ column preset)

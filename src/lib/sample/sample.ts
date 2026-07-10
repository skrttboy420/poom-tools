// ดึงตัวอย่างแถว (Sampling) — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case จริง: ก่อนเอา packing list 800 แถวเข้า Pacred อยากสุ่มดู 20 แถวเช็คคุณภาพ (spot-check)
//   หรือดึง 100 แถวแรก/ท้าย ดูหัว-ท้ายไฟล์ หรือดึงทุก ๆ แถวที่ N (systematic) กระจายทั่วไฟล์
// ต่างจาก /filter (เลือกตามเงื่อนไข) — อันนี้เลือกตาม "ตำแหน่ง/สุ่ม" · ต่างจาก /random (สุ่มรายชื่อ list) — อันนี้สุ่ม "แถวของตาราง"
// ปรัชญา: อ่านอย่างเดียว ไม่แก้ข้อมูล · ผลลัพธ์เป็น subset ของ input เสมอ (คงลำดับเดิม) · ไฟล์ต้นฉบับไม่ถูกแตะ
//   สุ่มแบบใส่ seed ได้ → ทำซ้ำได้ผลเดิม (reproducible) เพื่อ audit/แชร์

import type { Cell, Row } from "@/lib/reconcile/types";

export type SampleMode = "head" | "tail" | "random" | "systematic";

export interface SampleOptions {
  mode: SampleMode;
  n?: number; // head/tail/random: จำนวนแถวที่ดึง
  step?: number; // systematic: ทุก ๆ แถวที่ N
  offset?: number; // systematic: เริ่มที่แถวที่ (0-based)
  seed?: number; // random: seed สำหรับทำซ้ำได้
}

export interface SampleResult {
  rows: Row[]; // แถวที่ดึงได้ (คงลำดับเดิมเสมอ)
  indexes: number[]; // index เดิม (0-based ในแถวข้อมูลหลังตัดแถวว่างทั้งแถว)
  inputRows: number; // แถว input ทั้งหมด
  dataRows: number; // แถวหลังตัดแถวว่างทั้งแถว
  sampled: number; // จำนวนแถวที่ดึงได้ (= rows.length)
  seedUsed: number | null; // seed ที่ใช้จริง (โหมด random)
  error?: string;
}

function isBlankCell(v: Cell): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

function isDataRow(row: Row): boolean {
  return row.some((c) => !isBlankCell(c));
}

// RNG แบบ deterministic (mulberry32) — seed เดิม → ลำดับเลขเดิม (เทสได้/ทำซ้ำได้)
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function emptyResult(inputRows: number, dataRows: number, error: string): SampleResult {
  return { rows: [], indexes: [], inputRows, dataRows, sampled: 0, seedUsed: null, error };
}

export function sampleRows(allRows: Row[], opts: SampleOptions): SampleResult {
  const inputRows = allRows.length;
  const rows = allRows.filter(isDataRow);
  const dataRows = rows.length;

  if (dataRows === 0) return emptyResult(inputRows, 0, "ไม่มีแถวข้อมูล");

  let indexes: number[];
  let seedUsed: number | null = null;

  if (opts.mode === "head" || opts.mode === "tail" || opts.mode === "random") {
    const n = Math.floor(opts.n ?? 0);
    if (!(n >= 1)) return emptyResult(inputRows, dataRows, "จำนวนแถวต้องเป็นจำนวนเต็ม ≥ 1");
    const take = Math.min(n, dataRows);

    if (opts.mode === "head") {
      indexes = [];
      for (let i = 0; i < take; i++) indexes.push(i);
    } else if (opts.mode === "tail") {
      indexes = [];
      for (let i = dataRows - take; i < dataRows; i++) indexes.push(i);
    } else {
      // random: สุ่ม index ไม่ซ้ำด้วย Fisher-Yates (partial) แล้วเรียงกลับตามลำดับเดิม
      seedUsed = Number.isFinite(opts.seed) ? (opts.seed as number) >>> 0 : (Math.floor(Math.random() * 0xffffffff) >>> 0);
      const rng = mulberry32(seedUsed);
      const pool = Array.from({ length: dataRows }, (_, i) => i);
      for (let i = 0; i < take; i++) {
        const j = i + Math.floor(rng() * (dataRows - i));
        const tmp = pool[i];
        pool[i] = pool[j];
        pool[j] = tmp;
      }
      indexes = pool.slice(0, take).sort((a, b) => a - b);
    }
  } else {
    // systematic: ทุก ๆ แถวที่ step เริ่มที่ offset
    const step = Math.floor(opts.step ?? 0);
    if (!(step >= 1)) return emptyResult(inputRows, dataRows, "ระยะ (ทุก ๆ N แถว) ต้องเป็นจำนวนเต็ม ≥ 1");
    let offset = Math.floor(opts.offset ?? 0);
    if (offset < 0) offset = 0;
    indexes = [];
    for (let i = offset; i < dataRows; i += step) indexes.push(i);
  }

  return {
    rows: indexes.map((i) => rows[i]),
    indexes,
    inputRows,
    dataRows,
    sampled: indexes.length,
    seedUsed,
  };
}

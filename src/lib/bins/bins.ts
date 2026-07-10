// จัดกลุ่มช่วงตัวเลข (Histogram / Binning) — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case จริง: อยากรู้การกระจายของน้ำหนัก/CBM/จำนวนกล่อง เช่น "มีกี่พัสดุในช่วง 0-10 / 10-50 / 50+ kg"
//   ต่างจาก /frequency (นับค่าที่ซ้ำเป๊ะ = categorical) — อันนี้แบ่ง "ช่วง" ของตัวเลขต่อเนื่อง (continuous)
//   ต่างจาก /stats (สรุปทั้งคอลัมน์) · /group (รวมต่อกลุ่มที่มีอยู่) — อันนี้สร้าง "ช่วง" เองแล้วนับ/รวมในแต่ละช่วง
// ปรัชญา: อ่านอย่างเดียว ไม่แก้ข้อมูล · ทุกค่าตัวเลขต้องตกลงช่วงเดียวเสมอ (invariant: Σ count = numericCount)

import type { Cell, Row } from "@/lib/reconcile/types";

export type BinMode = "width" | "count" | "breaks";

export interface Bin {
  lo: number; // ขอบล่าง (อาจเป็น -Infinity ในโหมด breaks)
  hi: number; // ขอบบน (อาจเป็น +Infinity ในโหมด breaks)
  loInclusive: boolean; // ช่วงนี้รวมขอบล่างไหม (ปกติ true)
  hiInclusive: boolean; // ช่วงนี้รวมขอบบนไหม (จริงเฉพาะช่วงสุดท้ายของ width/count)
  count: number;
  sum: number; // ผลรวมของค่าในช่วง
  percent: number; // count / numericCount * 100
  label: string; // ป้ายอ่านง่าย เช่น "[0, 10)" หรือ "≥ 50"
}

export interface BinResult {
  bins: Bin[];
  numericCount: number; // แถวที่มีค่าตัวเลขในคอลัมน์
  skipped: number; // แถวข้อมูลที่ค่าไม่ใช่ตัวเลข (ว่าง/ข้อความ)
  dataRows: number; // แถวหลังตัดแถวว่างทั้งแถว
  inputRows: number;
  min: number | null;
  max: number | null;
  total: number; // ผลรวมค่าตัวเลขทั้งหมด
  colName: string;
  error?: string;
}

export interface BinOptions {
  col: number;
  mode: BinMode;
  width?: number; // โหมด width: ความกว้างแต่ละช่วง
  binCount?: number; // โหมด count: จำนวนช่วงเท่า ๆ กัน
  breaks?: number[]; // โหมด breaks: จุดตัดที่กำหนดเอง (จะเรียง+ตัดซ้ำให้เอง)
}

const MAX_BINS = 2000; // กัน loop ค้าง/ตารางระเบิดตอน width เล็กมาก

function isBlankCell(v: Cell): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

function isDataRow(row: Row): boolean {
  return row.some((c) => !isBlankCell(c));
}

// แปลงเป็นตัวเลข (ตัด comma + trim) · boolean/Infinity/ว่าง → null (สอดคล้อง toNumber ของ diff)
function parseNumeric(v: Cell): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/,/g, "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ล้าง noise ของ floating point (เช่น 0.1+0.2) — ใช้กับค่าที่แสดง/ขอบช่วงเท่านั้น
function cleanFloat(x: number): number {
  if (!Number.isFinite(x) || x === 0) return x;
  return Number(x.toPrecision(12));
}

function headerName(header: string[], idx: number): string {
  const h = header[idx];
  return h !== undefined && String(h).trim() !== "" ? String(h) : `คอลัมน์ ${idx + 1}`;
}

// จัดรูปเลขให้อ่านง่าย (ตัด .0 ท้าย, ใส่ comma หลักพัน)
function fmt(n: number): string {
  if (!Number.isFinite(n)) return n > 0 ? "∞" : "-∞";
  const r = cleanFloat(n);
  return r.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

function makeLabel(lo: number, hi: number, hiInclusive: boolean): string {
  if (lo === -Infinity) return `< ${fmt(hi)}`;
  if (hi === Infinity) return `≥ ${fmt(lo)}`;
  const close = hiInclusive ? "]" : ")";
  return `[${fmt(lo)}, ${fmt(hi)}${close}`;
}

function emptyResult(colName: string, inputRows: number, error?: string): BinResult {
  return {
    bins: [],
    numericCount: 0,
    skipped: 0,
    dataRows: 0,
    inputRows,
    min: null,
    max: null,
    total: 0,
    colName,
    error,
  };
}

export function computeBins(header: string[], allRows: Row[], opts: BinOptions): BinResult {
  const inputRows = allRows.length;
  const colName = headerName(header, opts.col);

  // header อาจสั้นกว่าข้อมูลจริง (ragged) → ตรวจแค่ติดลบ ที่เหลือปล่อยให้อ่านค่าเป็น null เอง
  if (opts.col < 0) return emptyResult(colName, inputRows, "เลือกคอลัมน์ให้ถูกต้อง");

  const rows = allRows.filter(isDataRow);
  const dataRows = rows.length;

  // เก็บค่าตัวเลข
  const values: number[] = [];
  let skipped = 0;
  for (const r of rows) {
    const n = parseNumeric(r[opts.col] ?? null);
    if (n === null) skipped++;
    else values.push(n);
  }
  const numericCount = values.length;

  if (numericCount === 0) {
    return { ...emptyResult(colName, inputRows), dataRows, skipped, error: "ไม่มีค่าตัวเลขในคอลัมน์นี้" };
  }

  let min = values[0];
  let max = values[0];
  let total = 0;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
    total += v;
  }
  total = cleanFloat(total);

  // สร้างช่วง
  let bins: Bin[];
  if (opts.mode === "breaks") {
    const breaks = Array.from(new Set((opts.breaks ?? []).filter((b) => Number.isFinite(b)))).sort((a, b) => a - b);
    if (breaks.length === 0) {
      return { ...emptyResult(colName, inputRows), dataRows, skipped, min, max, total, error: "ใส่จุดตัด (breaks) อย่างน้อย 1 ค่า" };
    }
    // ช่วง: (-∞, b0), [b0, b1), ..., [b_{n-1}, +∞)
    const edges = [-Infinity, ...breaks, Infinity];
    bins = [];
    for (let i = 0; i < edges.length - 1; i++) {
      const lo = edges[i];
      const hi = edges[i + 1];
      bins.push({ lo, hi, loInclusive: lo !== -Infinity, hiInclusive: false, count: 0, sum: 0, percent: 0, label: makeLabel(lo, hi, false) });
    }
    // assign: bin i = จำนวน breaks ที่ <= v
    for (const v of values) {
      let idx = 0;
      while (idx < breaks.length && breaks[idx] <= v) idx++;
      bins[idx].count++;
      bins[idx].sum += v;
    }
  } else {
    // width / count → ช่วงเท่า ๆ กันบน [min, max], ช่วงสุดท้ายรวม max
    let nbins: number;
    let step: number;
    if (max === min) {
      nbins = 1;
      step = 0;
    } else if (opts.mode === "width") {
      const width = opts.width ?? 0;
      if (!(width > 0)) return { ...emptyResult(colName, inputRows), dataRows, skipped, min, max, total, error: "ความกว้างช่วงต้องมากกว่า 0" };
      nbins = Math.ceil((max - min) / width - 1e-9);
      if (nbins < 1) nbins = 1;
      if (nbins > MAX_BINS) return { ...emptyResult(colName, inputRows), dataRows, skipped, min, max, total, error: `ช่วงถี่เกินไป (เกิน ${MAX_BINS} ช่วง) — เพิ่มความกว้าง` };
      step = width;
    } else {
      // count
      const bc = Math.floor(opts.binCount ?? 0);
      if (!(bc >= 1)) return { ...emptyResult(colName, inputRows), dataRows, skipped, min, max, total, error: "จำนวนช่วงต้องเป็นจำนวนเต็ม ≥ 1" };
      if (bc > MAX_BINS) return { ...emptyResult(colName, inputRows), dataRows, skipped, min, max, total, error: `จำนวนช่วงมากเกินไป (เกิน ${MAX_BINS})` };
      nbins = bc;
      step = (max - min) / nbins;
    }

    bins = [];
    for (let i = 0; i < nbins; i++) {
      const lo = cleanFloat(min + step * i);
      const hi = i === nbins - 1 ? max : cleanFloat(min + step * (i + 1));
      const hiInclusive = i === nbins - 1;
      bins.push({ lo, hi, loInclusive: true, hiInclusive, count: 0, sum: 0, percent: 0, label: makeLabel(lo, hi, hiInclusive) });
    }
    // assign
    for (const v of values) {
      let idx: number;
      if (step === 0) idx = 0;
      else {
        idx = Math.floor((v - min) / step);
        if (idx < 0) idx = 0;
        if (idx >= nbins) idx = nbins - 1;
      }
      bins[idx].count++;
      bins[idx].sum += v;
    }
  }

  // ปัด sum + คำนวณ percent
  for (const b of bins) {
    b.sum = cleanFloat(b.sum);
    b.percent = cleanFloat((b.count / numericCount) * 100);
  }

  return { bins, numericCount, skipped, dataRows, inputRows, min, max, total, colName };
}

// สรุปเป็น CSV
export function binsToCsv(result: BinResult): string {
  const head = ["ช่วง", "จำนวน", "%", "ผลรวม"];
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [head.map(esc).join(",")];
  for (const b of result.bins) {
    lines.push([b.label, String(b.count), String(b.percent), String(b.sum)].map((x) => esc(String(x))).join(","));
  }
  return lines.join("\n");
}

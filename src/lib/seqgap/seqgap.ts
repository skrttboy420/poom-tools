// ตรวจเลขขาดช่วง — หา "เลขจำนวนเต็มที่หายไป" ในลำดับที่ควรจะต่อเนื่อง — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case จริง: เลขกล่อง / เลขใบ (invoice) / running number ที่ควรจะต่อกัน 1..N แต่บางเลขหาย
//   เช่น กล่อง 1-500 แต่ 37, 52 หาย → tool ชี้ให้เห็นว่าขาดตัวไหนบ้าง + เลขไหนซ้ำ
// ต่างจาก /gap: gap = หาช่อง "ว่าง/เป็น 0" · อันนี้ = หา "เลขที่ควรมีแต่ไม่โผล่" ในลำดับ
// ปรัชญา: อ่านอย่างเดียว ไม่แก้ข้อมูล · ไม่เดามั่ว (ช่องที่ดึงเลขไม่ได้ = นับ skipped ให้เห็น ไม่ทิ้งเงียบ)

import type { Cell, Row } from "@/lib/reconcile/types";

// วิธีดึงเลขจากช่อง: ทั้งช่อง / เลขชุดท้าย (เช่น KY001→1) / เลขชุดหน้า
export type ExtractMode = "whole" | "trailing" | "leading";
export const EXTRACT_MODES: ExtractMode[] = ["trailing", "leading", "whole"];
export const EXTRACT_LABEL: Record<ExtractMode, string> = {
  trailing: "เลขชุดท้าย (เช่น KY001 → 1)",
  leading: "เลขชุดหน้า (เช่น 12-A → 12)",
  whole: "ทั้งช่องเป็นเลข (เช่น 1234)",
};

export interface SeqGapOptions {
  extract?: ExtractMode; // default trailing
  rangeStart?: number | null; // กำหนดขอบล่างเอง (default = เลขน้อยสุดในข้อมูล)
  rangeEnd?: number | null; // กำหนดขอบบนเอง (default = เลขมากสุดในข้อมูล)
}

export interface SeqGapResult {
  present: number[]; // เลขที่มีจริง (unique, เรียงจากน้อยไปมาก)
  missing: number[]; // เลขที่หายในช่วง (เรียง)
  duplicates: { value: number; count: number }[]; // เลขที่ซ้ำ (count > 1)
  min: number | null; // เลขน้อยสุดในข้อมูล
  max: number | null; // เลขมากสุดในข้อมูล
  rangeStart: number | null; // ขอบล่างที่ใช้จริง
  rangeEnd: number | null; // ขอบบนที่ใช้จริง
  expectedCount: number; // จำนวนเลขที่ควรมีในช่วง (rangeEnd - rangeStart + 1)
  presentInRange: number; // เลขไม่ซ้ำที่มีจริงและอยู่ในช่วง
  missingCount: number; // จำนวนเลขที่หาย (= missing.length ยกเว้นโดน cap)
  duplicateCount: number; // จำนวน "ค่า" ที่ซ้ำ (distinct)
  scanned: number; // ช่องที่อ่าน (ทุกแถวในคอลัมน์นี้)
  parsed: number; // ช่องที่ดึงเลขได้
  skipped: number; // ช่องที่ดึงเลขไม่ได้ (ว่าง/ไม่มีเลข)
  outOfRange: number; // เลขที่อยู่นอกช่วงที่กำหนดเอง
  cappedMissing: boolean; // missing ยาวเกิน cap (ตัดแสดง)
  inputRows: number;
  error?: string;
}

const MISSING_CAP = 5000;
const SPAN_CAP = 2_000_000; // กันช่วงกว้างมหาศาลทำ loop ค้าง

// ดึงจำนวนเต็มจากช่องตามโหมด — คืน null ถ้าดึงไม่ได้
export function extractInt(cell: Cell, mode: ExtractMode): number | null {
  if (cell === null || cell === undefined) return null;
  if (typeof cell === "number") {
    return Number.isFinite(cell) && Number.isInteger(cell) ? cell : null;
  }
  if (typeof cell === "boolean") return null;
  const s = cell.trim();
  if (s === "") return null;
  if (mode === "whole") {
    const t = s.replace(/,/g, "");
    if (!/^[+-]?\d+$/.test(t)) return null;
    const n = Number(t);
    return Number.isSafeInteger(n) ? n : null;
  }
  // trailing / leading — จับชุดตัวเลขติดกัน
  const matches = s.match(/\d+/g);
  if (!matches || matches.length === 0) return null;
  const pick = mode === "leading" ? matches[0] : matches[matches.length - 1];
  const n = Number(pick);
  return Number.isSafeInteger(n) ? n : null;
}

function gridWidth(header: Row, rows: Row[]): number {
  let w = header.length;
  for (const r of rows) if (r.length > w) w = r.length;
  return w;
}

export function findSequenceGaps(
  header: Row,
  dataRows: Row[],
  col: number,
  opts: SeqGapOptions = {},
): SeqGapResult {
  const extract = opts.extract ?? "trailing";

  const base: Omit<SeqGapResult, "error"> = {
    present: [],
    missing: [],
    duplicates: [],
    min: null,
    max: null,
    rangeStart: null,
    rangeEnd: null,
    expectedCount: 0,
    presentInRange: 0,
    missingCount: 0,
    duplicateCount: 0,
    scanned: 0,
    parsed: 0,
    skipped: 0,
    outOfRange: 0,
    cappedMissing: false,
    inputRows: dataRows.length,
  };

  const width = gridWidth(header, dataRows);
  if (width === 0) return { ...base, error: "ไม่มีข้อมูลให้ตรวจ (ตารางว่าง)" };
  if (col < 0 || col >= width) return { ...base, error: "เลือกคอลัมน์ที่จะตรวจ" };

  const counts = new Map<number, number>();
  let scanned = 0;
  let parsed = 0;
  let skipped = 0;

  for (const row of dataRows) {
    const cell: Cell = col < row.length ? (row[col] ?? null) : null;
    scanned += 1;
    const n = extractInt(cell, extract);
    if (n === null) {
      skipped += 1;
      continue;
    }
    parsed += 1;
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }

  if (counts.size === 0) {
    return { ...base, scanned, skipped, error: "ไม่พบเลขในคอลัมน์นี้ (ดึงเลขไม่ได้เลย)" };
  }

  const present = [...counts.keys()].sort((a, b) => a - b);
  const dataMin = present[0];
  const dataMax = present[present.length - 1];

  const rangeStart =
    opts.rangeStart != null && Number.isFinite(opts.rangeStart)
      ? Math.floor(opts.rangeStart)
      : dataMin;
  const rangeEnd =
    opts.rangeEnd != null && Number.isFinite(opts.rangeEnd) ? Math.floor(opts.rangeEnd) : dataMax;

  if (rangeEnd < rangeStart) {
    return {
      ...base,
      present,
      min: dataMin,
      max: dataMax,
      scanned,
      parsed,
      skipped,
      error: "ช่วงไม่ถูกต้อง (ปลายช่วงน้อยกว่าต้นช่วง)",
    };
  }

  const span = rangeEnd - rangeStart + 1;
  if (span > SPAN_CAP) {
    return {
      ...base,
      present,
      min: dataMin,
      max: dataMax,
      rangeStart,
      rangeEnd,
      scanned,
      parsed,
      skipped,
      error: `ช่วงกว้างเกินไป (${span.toLocaleString()} ตัว) — กำหนดช่วงให้แคบลง`,
    };
  }

  let outOfRange = 0;
  let presentInRange = 0;
  for (const v of present) {
    if (v < rangeStart || v > rangeEnd) outOfRange += 1;
    else presentInRange += 1;
  }

  const missing: number[] = [];
  let cappedMissing = false;
  for (let i = rangeStart; i <= rangeEnd; i++) {
    if (!counts.has(i)) {
      if (missing.length < MISSING_CAP) missing.push(i);
      else {
        cappedMissing = true;
        break;
      }
    }
  }

  const duplicates = present
    .filter((v) => (counts.get(v) ?? 0) > 1)
    .map((v) => ({ value: v, count: counts.get(v)! }));

  return {
    present,
    missing,
    duplicates,
    min: dataMin,
    max: dataMax,
    rangeStart,
    rangeEnd,
    expectedCount: span,
    presentInRange,
    missingCount: span - presentInRange,
    duplicateCount: duplicates.length,
    scanned,
    parsed,
    skipped,
    outOfRange,
    cappedMissing,
    inputRows: dataRows.length,
  };
}

// export รายการเลขที่หายเป็น CSV (คอลัมน์เดียว)
export function seqGapToCsv(result: SeqGapResult): string {
  const lines = ["เลขที่หาย"];
  for (const n of result.missing) lines.push(String(n));
  return lines.join("\n");
}

// ย่อรายการเลขเป็นช่วงอ่านง่าย เช่น [1,2,3,7,8,10] → "1-3, 7-8, 10"
export function summarizeRanges(nums: number[]): string {
  if (nums.length === 0) return "";
  const parts: string[] = [];
  let start = nums[0];
  let prev = nums[0];
  for (let i = 1; i < nums.length; i++) {
    const n = nums[i];
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    parts.push(start === prev ? String(start) : `${start}-${prev}`);
    start = n;
    prev = n;
  }
  parts.push(start === prev ? String(start) : `${start}-${prev}`);
  return parts.join(", ");
}

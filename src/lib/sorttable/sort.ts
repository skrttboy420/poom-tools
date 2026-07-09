// เรียงลำดับตาราง (multi-key sort) — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case: จัดเรียง packing list ก่อน export — เช่น เรียงตามเลขตู้ แล้วตามน้ำหนักมาก→น้อย
// ปรัชญา: **แค่สลับลำดับแถว ไม่ทำแถวหาย/ไม่แก้ค่า** (ผลลัพธ์ = permutation ของ input เสมอ) ·
//   sort แบบเสถียร (แถวที่เท่ากันคงลำดับเดิม) · รู้จักตัวเลข (เรียงเลขจริง ไม่ใช่เรียง string "10" < "2")

import type { Cell, Row } from "@/lib/reconcile/types";

export type SortDir = "asc" | "desc";
export type SortType = "auto" | "number" | "text";

export interface SortKey {
  col: number; // index คอลัมน์
  dir: SortDir; // น้อย→มาก / มาก→น้อย
  type?: SortType; // auto (เดา) · number (บังคับตัวเลข) · text (บังคับข้อความ)
}

export interface SortOptions {
  blanksLast?: boolean; // ช่องว่างไปท้ายเสมอ (ไม่ขึ้นกับทิศ) — default true
  caseInsensitive?: boolean; // เรียงข้อความไม่สนพิมพ์เล็ก/ใหญ่ — default true
}

export interface SortResult {
  header: string[];
  rows: Row[];
  rowCount: number;
}

// แปลงเป็นตัวเลข: string ตัด comma + trim แล้วค่อยแปลง · null ถ้าไม่ใช่ตัวเลข/ว่าง
function parseNumeric(v: Cell): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return null;
  if (typeof v === "string") {
    const s = v.replace(/,/g, "").trim();
    if (s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isBlankCell(v: Cell): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

function cellAt(row: Row, idx: number): Cell {
  return idx >= 0 && idx < row.length ? (row[idx] ?? null) : null;
}

// เทียบค่า 2 ช่อง (ยังไม่คิดทิศ/ช่องว่าง — จัดการที่ compareRows)
function compareVals(av: Cell, bv: Cell, type: SortType, ci: boolean): number {
  if (type !== "text") {
    const an = parseNumeric(av);
    const bn = parseNumeric(bv);
    if (an !== null && bn !== null) return an < bn ? -1 : an > bn ? 1 : 0;
    if (type === "number") {
      // บังคับตัวเลข: ช่องที่เป็นตัวเลขมาก่อนช่องที่ไม่ใช่
      if (an !== null) return -1;
      if (bn !== null) return 1;
      // ทั้งคู่ไม่ใช่ตัวเลข → ตกไปเทียบข้อความ
    }
    // auto: ถ้าไม่ใช่ตัวเลขทั้งคู่ → เทียบข้อความ
  }
  let as = String(av);
  let bs = String(bv);
  if (ci) {
    as = as.toLowerCase();
    bs = bs.toLowerCase();
  }
  return as.localeCompare(bs, "th");
}

function compareRows(a: Row, b: Row, keys: SortKey[], blanksLast: boolean, ci: boolean): number {
  for (const key of keys) {
    const av = cellAt(a, key.col);
    const bv = cellAt(b, key.col);
    const ab = isBlankCell(av);
    const bb = isBlankCell(bv);
    if (ab || bb) {
      if (ab && bb) continue; // เท่ากัน (ว่างทั้งคู่) → คีย์ถัดไป
      // มีช่องเดียวที่ว่าง — ถ้า blanksLast: ว่างไปท้ายเสมอ (ไม่ขึ้นกับทิศ)
      if (blanksLast) return ab ? 1 : -1;
      return ab ? -1 : 1;
    }
    let c = compareVals(av, bv, key.type ?? "auto", ci);
    if (key.dir === "desc") c = -c;
    if (c !== 0) return c;
  }
  return 0;
}

// เรียงตาราง — คืน rows ที่เป็น permutation ของ input (เสถียร: แถวเท่ากันคงลำดับเดิม)
export function sortRows(
  header: string[],
  dataRows: Row[],
  keys: SortKey[],
  opts: SortOptions = {},
): SortResult {
  const blanksLast = opts.blanksLast !== false;
  const ci = opts.caseInsensitive !== false;
  const valid = keys.filter((k) => k.col >= 0);

  let rows: Row[];
  if (valid.length === 0) {
    rows = dataRows.slice(); // ไม่มีคีย์ → คงเดิม
  } else {
    // decorate-sort-undecorate: ผูก index เดิมไว้ tie-break ให้เสถียรแน่นอน
    const indexed = dataRows.map((r, i) => ({ r, i }));
    indexed.sort((x, y) => {
      const c = compareRows(x.r, y.r, valid, blanksLast, ci);
      return c !== 0 ? c : x.i - y.i;
    });
    rows = indexed.map((x) => x.r);
  }

  return { header, rows, rowCount: rows.length };
}

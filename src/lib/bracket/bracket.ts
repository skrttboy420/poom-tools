// จัดชั้น/ค้นค่าตามช่วงตัวเลข (Bracket / tiered-rate lookup) — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case จริง: อัตราค่าขนส่งแบบขั้นบันได — น้ำหนัก ≤10 กก. คิดเรต 50, ≤50 คิด 40, ≤100 คิด 30, มากกว่านั้น 20
//   → เติมคอลัมน์ "เรต/ชั้น" ให้ทุกแถวตามช่วงที่ค่าตกลงไป · หรือจัดหมวดขนาด (เล็ก/กลาง/ใหญ่)
// ต่างจาก /histogram (แค่นับจำนวนต่อ bin) และ /calc-col (คูณ/หารตรง ๆ) — อันนี้ "ค้นค่า" ตามช่วงที่ผู้ใช้กำหนดเอง
// ปรัชญา: ไม่เดามั่ว — ช่องไม่ใช่ตัวเลข = เว้นว่าง (นับ skipped) · ค่าที่ไม่เข้าช่วงไหนเลย = เว้นว่าง (นับ outOfRange) ·
//   ทุกแถวออกครบ · default = เติมคอลัมน์ใหม่ (ไม่ทับของเดิม)

import type { Cell, Row } from "@/lib/reconcile/types";

// ช่วง 1 ชั้น: upTo = ขอบบน (null = "และมากกว่านั้น" — ชั้นบนสุดรับทุกค่าที่เกินขอบอื่น) · value = ค่าที่จะเติม (เรต/ป้าย)
export interface Bracket {
  upTo: number | null;
  value: Cell;
}

// le = v ≤ upTo (แบบขั้นบันไดมาตรฐาน) · lt = v < upTo
export type BracketBoundary = "le" | "lt";

export interface BracketOptions {
  col: number; // คอลัมน์ตัวเลขที่จะจัดชั้น
  brackets: Bracket[]; // รายการช่วง (เครื่องเรียงจากน้อยไปมากให้เอง)
  boundary?: BracketBoundary; // default "le"
  colName?: string; // ชื่อคอลัมน์ใหม่ (default "ชั้น")
}

export interface BracketResult {
  header: Row;
  rows: Row[];
  addedCols: string[];
  firstNewIndex: number;
  inputRows: number;
  dataRows: number;
  matchedRows: number; // แถวที่จัดชั้นได้
  skippedRows: number; // ช่องไม่ใช่ตัวเลข → เว้นว่าง
  outOfRangeRows: number; // เป็นตัวเลขแต่ไม่เข้าช่วงไหนเลย → เว้นว่าง
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
function parseNumeric(v: Cell): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/,/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function cellAt(row: Row, col: number): Cell {
  if (col < 0) return null;
  return col < row.length ? row[col] : null;
}

// เรียงช่วงจากน้อยไปมาก (null = +Infinity อยู่ท้ายสุด) แบบเสถียร (ลำดับเดิมถ้าเท่ากัน)
export function sortBrackets(brackets: Bracket[]): Bracket[] {
  return brackets
    .map((b, i) => ({ b, i }))
    .sort((a, x) => {
      const ua = a.b.upTo === null ? Infinity : a.b.upTo;
      const ux = x.b.upTo === null ? Infinity : x.b.upTo;
      if (ua !== ux) return ua - ux;
      return a.i - x.i;
    })
    .map((o) => o.b);
}

// คืน index ของช่วงแรกที่ค่า v เข้า (จาก brackets ที่เรียงแล้ว) · -1 = ไม่เข้าช่วงไหน
export function classify(v: number, sorted: Bracket[], boundary: BracketBoundary = "le"): number {
  for (let i = 0; i < sorted.length; i++) {
    const upTo = sorted[i].upTo;
    if (upTo === null) return i; // catch-all รับทุกค่า
    if (boundary === "le" ? v <= upTo : v < upTo) return i;
  }
  return -1;
}

export function analyzeBracket(header: Row, allRows: Row[], opts: BracketOptions): BracketResult {
  const inputRows = allRows.length;
  const rows = allRows.filter(isDataRow);
  const dataRows = rows.length;
  const width = Math.max(header.length, ...rows.map((r) => r.length), 1);

  const base = (msg: string): BracketResult => ({
    header: header.slice(),
    rows: rows.map((r) => r.slice()),
    addedCols: [],
    firstNewIndex: -1,
    inputRows,
    dataRows,
    matchedRows: 0,
    skippedRows: 0,
    outOfRangeRows: 0,
    error: msg,
  });

  if (dataRows === 0) return base("ไม่มีแถวข้อมูล");
  if (opts.col < 0 || opts.col >= width) return base("เลือกคอลัมน์ที่จะจัดชั้นให้อยู่ในช่วง");
  const rawBrackets = opts.brackets || [];
  if (rawBrackets.length === 0) return base("ยังไม่มีช่วง (bracket) ให้จัด");
  // ขอบบนที่ไม่ใช่ null ต้องเป็นตัวเลขจริง
  for (const b of rawBrackets) {
    if (b.upTo !== null && !Number.isFinite(b.upTo)) return base("ขอบบนของช่วงต้องเป็นตัวเลข");
  }

  const boundary: BracketBoundary = opts.boundary === "lt" ? "lt" : "le";
  const sorted = sortBrackets(rawBrackets);
  const colName = opts.colName && opts.colName.trim() !== "" ? opts.colName.trim() : "ชั้น";

  let matchedRows = 0;
  let skippedRows = 0;
  let outOfRangeRows = 0;

  const assigned: Cell[] = rows.map((r) => {
    const v = parseNumeric(cellAt(r, opts.col));
    if (v === null) {
      skippedRows++;
      return null;
    }
    const idx = classify(v, sorted, boundary);
    if (idx < 0) {
      outOfRangeRows++;
      return null;
    }
    matchedRows++;
    return sorted[idx].value;
  });

  const outHeader = header.slice();
  while (outHeader.length < width) outHeader.push(null);
  const firstNewIndex = outHeader.length;
  outHeader.push(colName);

  const outRows: Row[] = rows.map((r, i) => {
    const out = r.slice();
    while (out.length < width) out.push(null);
    out.push(assigned[i]);
    return out;
  });

  return {
    header: outHeader,
    rows: outRows,
    addedCols: [colName],
    firstNewIndex,
    inputRows,
    dataRows,
    matchedRows,
    skippedRows,
    outOfRangeRows,
  };
}

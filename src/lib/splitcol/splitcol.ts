// แยกคอลัมน์เดียวออกเป็นหลายคอลัมน์ตามตัวคั่น (literal) — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case จริง: ช่องเดียวมีค่าปนกัน เช่น "TU-A/123" (ตู้/เลข), "KY001-1" (tracking-กล่อง),
//   "2024-01-15 นครปฐม" → แยกเป็นคอลัมน์แยกกันเพื่อ /group /sort /reconcile ต่อ
// ต่างจาก /split (แยก "ไฟล์" เป็นหลายชีตตามค่าคอลัมน์) — อันนี้แยก "คอลัมน์" เป็นหลายคอลัมน์ในไฟล์เดิม
// ปรัชญา: **ไม่ทำแถวหาย (จำนวนแถวเท่าเดิมเสมอ) + ไม่ทำข้อมูลหาย**
//   ถ้าจำกัดจำนวนคอลัมน์ (maxParts) แล้วชิ้นเกิน → เอาชิ้นที่เหลือ "ต่อกลับด้วยตัวคั่นเดิม" ใส่คอลัมน์สุดท้าย (ไม่ตัดทิ้ง)

import type { Cell, Row } from "@/lib/reconcile/types";

export interface SplitColOptions {
  delimiter: string; // ตัวคั่น (ตีความตรงตัว literal ไม่ใช่ regex → คาดเดาผลได้ 100%)
  maxParts?: number; // จำกัดจำนวนคอลัมน์ใหม่ (0/undefined = auto = จำนวนชิ้นมากสุดที่พบ)
  keepOriginal?: boolean; // เก็บคอลัมน์ต้นฉบับไว้ด้วย (default false = แทนที่)
  trim?: boolean; // trim แต่ละชิ้น (default true)
  names?: string[]; // ชื่อหัวคอลัมน์ใหม่ (ไม่ครบ → เติม "ชื่อเดิม N")
}

export interface SplitColResult {
  header: string[];
  rows: Row[];
  parts: number; // จำนวนคอลัมน์ใหม่ที่สร้าง
  maxPartsFound: number; // จำนวนชิ้นมากสุดที่พบจริง (ก่อน cap)
  splitRows: number; // จำนวนแถวที่ถูกแยกจริง (แยกได้ >1 ชิ้น)
  inputRows: number;
  error?: string; // ถ้ามี = header/rows คืนของเดิมไม่แตะ
}

function isBlankCell(v: Cell): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

function headerName(header: string[], idx: number): string {
  const h = header[idx];
  return h !== undefined && String(h).trim() !== "" ? String(h) : `คอลัมน์ ${idx + 1}`;
}

export function splitColumn(
  header: string[],
  dataRows: Row[],
  col: number,
  opts: SplitColOptions,
): SplitColResult {
  const trim = opts.trim !== false;
  const width = header.length;
  const cloneRows: Row[] = dataRows.map((r) => r.slice());

  const fail = (error: string): SplitColResult => ({
    header: header.slice(),
    rows: cloneRows,
    parts: 0,
    maxPartsFound: 0,
    splitRows: 0,
    inputRows: dataRows.length,
    error,
  });

  if (col < 0 || col >= width) return fail("คอลัมน์ที่จะแยกไม่ถูกต้อง");
  const delimiter = opts.delimiter;
  if (delimiter === "") return fail("ต้องระบุตัวคั่น");

  // แยกแต่ละแถวเป็นชิ้น ๆ ก่อน (เก็บไว้คำนวณจำนวนคอลัมน์)
  const perRowPieces: string[][] = dataRows.map((row) => {
    const cell = col < row.length ? (row[col] ?? null) : null;
    const s = isBlankCell(cell) ? "" : String(cell);
    let pieces = s.split(delimiter);
    if (trim) pieces = pieces.map((p) => p.trim());
    return pieces;
  });

  let maxPartsFound = 1;
  let splitRows = 0;
  for (const pieces of perRowPieces) {
    if (pieces.length > maxPartsFound) maxPartsFound = pieces.length;
    if (pieces.length > 1) splitRows++;
  }

  const cap = opts.maxParts && opts.maxParts > 0 ? Math.floor(opts.maxParts) : 0;
  const parts = cap > 0 ? cap : maxPartsFound;

  // ปรับชิ้นให้ยาว = parts พอดี: เกิน → ต่อชิ้นที่เหลือกลับด้วยตัวคั่น (ไม่ทิ้ง) · ขาด → เติม ""
  const fitted: string[][] = perRowPieces.map((pieces) => {
    if (pieces.length > parts) {
      const head = pieces.slice(0, parts - 1);
      const tail = pieces.slice(parts - 1).join(delimiter);
      return [...head, tail];
    }
    if (pieces.length < parts) {
      return [...pieces, ...Array(parts - pieces.length).fill("")];
    }
    return pieces;
  });

  const origName = headerName(header, col);
  const newCols: string[] = [];
  for (let i = 0; i < parts; i++) {
    const nm = opts.names?.[i];
    newCols.push(nm && nm.trim() !== "" ? nm : `${origName} ${i + 1}`);
  }

  const before = header.slice(0, col);
  const after = header.slice(col + 1);
  const keep = opts.keepOriginal === true;

  const outHeader = keep
    ? [...before, header[col] ?? origName, ...newCols, ...after]
    : [...before, ...newCols, ...after];

  const outRows: Row[] = dataRows.map((row, ri) => {
    const b = row.slice(0, col);
    const a = row.slice(col + 1);
    const pieces = fitted[ri];
    const origCell = col < row.length ? (row[col] ?? null) : null;
    return keep ? [...b, origCell, ...pieces, ...a] : [...b, ...pieces, ...a];
  });

  return {
    header: outHeader,
    rows: outRows,
    parts,
    maxPartsFound,
    splitRows,
    inputRows: dataRows.length,
  };
}

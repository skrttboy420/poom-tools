// ดึงข้อมูลข้ามไฟล์ (VLOOKUP / key join) — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case: เอาไฟล์หลัก A (เช่น packing list) มาดึงคอลัมน์จากไฟล์อ้างอิง B (เช่น export ที่มีน้ำหนัก/เลขตู้)
//   โดย match ตาม key (tracking) → เติมคอลัมน์เข้าไฟล์ A
// ต่างจาก:
//   - reconcile = "เทียบ" A กับ B แล้วไฮไลต์ตรง/ไม่ตรง/หาย   (อันนี้ = enrich)
//   - merge = ต่อแถว A+B (แนวตั้ง)                          (อันนี้ = ต่อคอลัมน์ตาม key แนวนอน)
// ปรัชญา: **ทุกแถวของ A อยู่ครบเสมอ (ไม่หาย/ไม่สลับลำดับ)** — แค่เติมคอลัมน์จาก B · แถวที่ไม่เจอ match → เติมค่าว่าง

import type { Cell, Row } from "@/lib/reconcile/types";

export interface LookupSpec {
  bCol: number; // index คอลัมน์ใน B ที่จะดึงมา
  name?: string; // ชื่อหัวคอลัมน์ผลลัพธ์ (default = หัวของ B)
}

export interface LookupOptions {
  caseInsensitive?: boolean; // เทียบ key ไม่สนพิมพ์เล็ก/ใหญ่ (default true)
  trim?: boolean; // trim key ก่อนเทียบ (default true)
  onMultiple?: "first" | "last"; // ถ้า key ใน B ซ้ำ ใช้แถวไหน (default first)
}

export interface LookupResult {
  header: string[]; // หัวของ A + คอลัมน์ที่ดึงมา
  rows: Row[]; // แถว A + ค่าที่ดึงมา (จำนวน = แถวข้อมูล A หลังตัดแถวว่าง)
  matched: number; // แถว A ที่เจอ match
  unmatched: number; // แถว A ที่ไม่เจอ match
  matchedKeys: number; // จำนวน key ไม่ซ้ำใน B ที่ถูกใช้จริง (informational)
  duplicateKeysB: number; // จำนวน key ใน B ที่ซ้ำ (>1 แถว) — บอกว่ามี ambiguous
  blankKeyRowsA: number; // แถว A ที่ key ว่าง (match ไม่ได้)
  addedCols: number;
  inputRows: number; // แถวข้อมูล A (หลังตัดแถวว่างทั้งแถว)
}

function isBlankCell(v: Cell): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

function isDataRow(row: Row): boolean {
  return row.some((c) => !isBlankCell(c));
}

function cellAt(row: Row, idx: number): Cell {
  return idx >= 0 && idx < row.length ? (row[idx] ?? null) : null;
}

function normKey(v: Cell, trim: boolean, ci: boolean): string {
  if (isBlankCell(v)) return "";
  let s = String(v);
  if (trim) s = s.trim();
  if (ci) s = s.toLowerCase();
  return s;
}

function headerName(header: string[], idx: number): string {
  const h = header[idx];
  return h !== undefined && String(h).trim() !== "" ? String(h) : `คอลัมน์ ${idx + 1}`;
}

export function lookupJoin(
  aHeader: string[],
  aRows: Row[],
  aKeyCol: number,
  bHeader: string[],
  bRows: Row[],
  bKeyCol: number,
  specs: LookupSpec[],
  opts: LookupOptions = {},
): LookupResult {
  const ci = opts.caseInsensitive !== false;
  const trim = opts.trim !== false;
  const onMultiple = opts.onMultiple ?? "first";

  const validSpecs = specs.filter((s) => s.bCol >= 0 && s.bCol < bHeader.length);

  // สร้าง index ของ B: key → แถว (ข้าม key ว่าง) · นับ key ซ้ำ
  const index = new Map<string, Row>();
  const seen = new Map<string, number>();
  for (const row of bRows) {
    if (!isDataRow(row)) continue;
    const k = normKey(cellAt(row, bKeyCol), trim, ci);
    if (k === "") continue;
    seen.set(k, (seen.get(k) ?? 0) + 1);
    if (onMultiple === "first") {
      if (!index.has(k)) index.set(k, row);
    } else {
      index.set(k, row); // last wins
    }
  }
  let duplicateKeysB = 0;
  for (const c of seen.values()) if (c > 1) duplicateKeysB++;

  const dataA = aRows.filter(isDataRow);

  let matched = 0;
  let unmatched = 0;
  let blankKeyRowsA = 0;
  const usedKeys = new Set<string>();

  const outRows: Row[] = dataA.map((row) => {
    const k = normKey(cellAt(row, aKeyCol), trim, ci);
    const base = row.slice();
    if (k === "") {
      blankKeyRowsA++;
      unmatched++;
      return [...base, ...validSpecs.map(() => null)];
    }
    const bRow = index.get(k);
    if (bRow) {
      matched++;
      usedKeys.add(k);
      return [...base, ...validSpecs.map((s) => cellAt(bRow, s.bCol))];
    }
    unmatched++;
    return [...base, ...validSpecs.map(() => null)];
  });

  const header = [
    ...aHeader,
    ...validSpecs.map((s) => (s.name && s.name.trim() !== "" ? s.name : headerName(bHeader, s.bCol))),
  ];

  return {
    header,
    rows: outRows,
    matched,
    unmatched,
    matchedKeys: usedKeys.size,
    duplicateKeysB,
    blankKeyRowsA,
    addedCols: validSpecs.length,
    inputRows: dataA.length,
  };
}

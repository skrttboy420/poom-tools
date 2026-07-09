// แตกแถว (explode / split into rows) — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case จริง: บางแถวใส่หลาย tracking ในช่องเดียว ("KY001, KY002, KY003") → อยากได้ 1 tracking ต่อ 1 แถว
//   (normalize ให้พร้อมเอาไป /reconcile /dedup /group ต่อ) · คอลัมน์อื่นถูกคัดลอกซ้ำตามจำนวนชิ้น
// คู่กับ /split-col (แตกเป็น "คอลัมน์") — อันนี้แตกเป็น "แถว"
// ปรัชญา: **ไม่ทำแถวหาย** — ทุกแถวเข้าออกอย่างน้อย 1 แถว (แถวว่าง/ไม่มีตัวคั่น = คงไว้ 1 แถว) · outputRows ≥ inputRows เสมอ

import type { Cell, Row } from "@/lib/reconcile/types";

export interface ExplodeOptions {
  delimiter: string; // ตัวคั่นในช่อง (literal) เช่น "," "/" " "
  trim?: boolean; // trim แต่ละชิ้น (default true)
  skipEmpty?: boolean; // ทิ้งชิ้นว่างที่เกิดจากตัวคั่นซ้อน (default true)
}

export interface ExplodeResult {
  header: string[];
  rows: Row[];
  inputRows: number;
  outputRows: number;
  expandedRows: number; // จำนวนแถวต้นทางที่แตกออกเป็น >1 แถว
  addedRows: number; // outputRows - inputRows
  error?: string; // ถ้ามี = header/rows คืนของเดิมไม่แตะ
}

function isBlankCell(v: Cell): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

export function explodeRows(
  header: string[],
  dataRows: Row[],
  col: number,
  opts: ExplodeOptions,
): ExplodeResult {
  const trim = opts.trim !== false;
  const skipEmpty = opts.skipEmpty !== false;

  const cloneRows: Row[] = dataRows.map((r) => r.slice());
  const base: ExplodeResult = {
    header: header.slice(),
    rows: cloneRows,
    inputRows: dataRows.length,
    outputRows: dataRows.length,
    expandedRows: 0,
    addedRows: 0,
  };

  if (col < 0 || col >= header.length) {
    return { ...base, error: "เลือกคอลัมน์ที่จะแตกแถว" };
  }
  if (opts.delimiter === "") {
    return { ...base, error: "ใส่ตัวคั่นในช่อง (เช่น , หรือ /)" };
  }

  const out: Row[] = [];
  let expandedRows = 0;

  for (const row of dataRows) {
    const cell = col < row.length ? (row[col] ?? null) : null;

    // ช่องว่าง → คงแถวเดิมไว้ 1 แถว (ไม่แตะค่า, ไม่ทำแถวหาย)
    if (isBlankCell(cell)) {
      out.push(row.slice());
      continue;
    }

    const raw = String(cell).split(opts.delimiter);
    let pieces = trim ? raw.map((p) => p.trim()) : raw;
    if (skipEmpty) pieces = pieces.filter((p) => p !== "");
    // ถ้ากรองจนไม่เหลือชิ้น (เช่นทั้งช่องเป็นตัวคั่นล้วน) → คงค่าเดิมไว้ 1 แถว (ไม่ทิ้ง)
    if (pieces.length === 0) pieces = [trim ? String(cell).trim() : String(cell)];

    if (pieces.length > 1) expandedRows++;
    for (const p of pieces) {
      const nr = row.slice();
      nr[col] = p;
      out.push(nr);
    }
  }

  return {
    header: header.slice(),
    rows: out,
    inputRows: dataRows.length,
    outputRows: out.length,
    expandedRows,
    addedRows: out.length - dataRows.length,
  };
}

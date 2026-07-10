// คลี่ตารางแนวกว้าง → แนวยาว (unpivot / melt) — pure ล้วน (ไม่พึ่ง DOM/DB)
// ตรงข้ามกับ /pivot: pivot = long→wide (สรุปไขว้) · unpivot = wide→long (คลี่กลับ)
// use-case จริง: report มาแบบกว้าง (เช่น แถว = เลขตู้, มีคอลัมน์น้ำหนักแยกตาม forwarder เจ้าละคอลัมน์
//   หรือแยกตามเดือน) → คลี่เป็น "1 แถวต่อ 1 ค่า" พร้อมคอลัมน์บอกว่ามาจากหัวไหน
//   เพื่อ normalize ก่อนเอาไป /reconcile /group /pivot ต่อ
// ปรัชญา: **ไม่ทิ้งข้อมูล** — แต่ละแถว input → N แถว output (N = จำนวนคอลัมน์ค่า) ·
//   คอลัมน์ id (ที่ตรึงไว้) คัดลอกซ้ำครบทุกแถวที่คลี่ · ตัดแถวว่างทั้งแถวก่อน · ไม่แก้ค่าจริงในเซลล์

import type { Cell, Row } from "@/lib/reconcile/types";

export interface UnpivotOptions {
  varName?: string; // ชื่อหัวคอลัมน์ "ตัวแปร" (มาจากหัวไหน) — default "คอลัมน์"
  valueName?: string; // ชื่อหัวคอลัมน์ "ค่า" — default "ค่า"
  dropEmpty?: boolean; // ข้ามแถว output ที่ค่าว่าง (default false) — ตารางกว้างมักมีช่องว่างเยอะ
  trim?: boolean; // trim string ก่อน "เช็คว่าว่าง" เท่านั้น (ไม่แก้ค่าจริง) — default true
}

export interface UnpivotResult {
  header: Row; // หัวตาราง output = [...ชื่อคอลัมน์ id, varName, valueName]
  rows: Row[]; // แถวแนวยาว
  idCols: number[];
  valueCols: number[];
  inputRows: number; // แถวข้อมูลจริง (หลังตัดแถวว่างทั้งแถว)
  outputRows: number; // จำนวนแถวผลลัพธ์
  droppedEmpty: number; // แถวที่ถูกข้ามเพราะค่าว่าง (เมื่อ dropEmpty)
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

function cellAt(row: Row, idx: number): Cell {
  return idx >= 0 && idx < row.length ? (row[idx] ?? null) : null;
}

function headerName(header: Row, idx: number): string {
  const h = header[idx];
  return h !== null && h !== undefined && String(h).trim() !== "" ? String(h) : `คอลัมน์ ${idx + 1}`;
}

// เช็ค "ว่าง" สำหรับ dropEmpty (trim เฉพาะตอนเช็ค ไม่แตะค่าจริง)
function isEmptyValue(v: Cell, trim: boolean): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return (trim ? v.trim() : v) === "";
  return false;
}

export function unpivotTable(
  header: Row,
  dataRows: Row[],
  idCols: number[],
  valueCols: number[],
  opts: UnpivotOptions = {},
): UnpivotResult {
  const varName = opts.varName && opts.varName.trim() !== "" ? opts.varName : "คอลัมน์";
  const valueName = opts.valueName && opts.valueName.trim() !== "" ? opts.valueName : "ค่า";
  const trim = opts.trim !== false;
  const dropEmpty = opts.dropEmpty === true;

  const outHeader: Row = [...idCols.map((c) => headerName(header, c)), varName, valueName];
  const base: Omit<UnpivotResult, "error"> = {
    header: outHeader,
    rows: [],
    idCols,
    valueCols,
    inputRows: 0,
    outputRows: 0,
    droppedEmpty: 0,
  };

  if (valueCols.length === 0) {
    return { ...base, error: "เลือกคอลัมน์ค่าอย่างน้อย 1 คอลัมน์ (ที่จะคลี่)" };
  }

  const rows = dataRows.filter(isDataRow);
  const out: Row[] = [];
  let droppedEmpty = 0;

  for (const row of rows) {
    const idValues = idCols.map((c) => cellAt(row, c));
    for (const vc of valueCols) {
      const value = cellAt(row, vc);
      if (dropEmpty && isEmptyValue(value, trim)) {
        droppedEmpty += 1;
        continue;
      }
      out.push([...idValues, headerName(header, vc), value]);
    }
  }

  return {
    ...base,
    rows: out,
    inputRows: rows.length,
    outputRows: out.length,
    droppedEmpty,
  };
}

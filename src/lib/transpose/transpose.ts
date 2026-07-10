// สลับแถว ↔ คอลัมน์ (transpose) — pure ล้วน (ไม่พึ่ง DOM/DB)
// output[c][r] = input[r][c] · แถวกลายเป็นคอลัมน์ คอลัมน์กลายเป็นแถว
// use-case จริง: report บางอันหัวตารางอยู่ "แนวตั้ง" (แต่ละแถว = 1 ฟิลด์ เช่น น้ำหนัก/CBM/จำนวน)
//   แต่เครื่องมืออื่น (/group /pivot /reconcile) ต้องการ "1 แถว = 1 record คอลัมน์ = ฟิลด์" → สลับให้ก่อน
//   หรือกลับกัน: อยากพลิกตารางแนวยาวให้อ่านเทียบง่ายในแนวกว้าง
// ปรัชญา: **ไม่ทิ้งข้อมูล/ไม่แก้ค่า** — แค่ย้ายตำแหน่งเซลล์ · แถว ragged เติม null ให้เป็นสี่เหลี่ยม
//   invariant: transpose(transpose(grid)) = grid เวอร์ชันสี่เหลี่ยม (ค่าเดิมทุกช่อง)

import type { Cell, Row } from "@/lib/reconcile/types";

export interface TransposeOptions {
  dropBlankRows?: boolean; // ตัดแถวว่างทั้งแถวก่อนสลับ (กันคอลัมน์ว่างในผลลัพธ์) — default true
  trim?: boolean; // trim string ก่อน "เช็คว่าว่าง" เท่านั้น (ไม่แก้ค่าจริง) — default true
}

export interface TransposeResult {
  rows: Row[]; // ตารางหลังสลับ
  inputRows: number; // จำนวนแถวที่นำเข้าสลับจริง (หลังตัดแถวว่าง)
  inputCols: number; // จำนวนคอลัมน์นำเข้า (= ความกว้างมากสุด)
  outputRows: number; // = inputCols
  outputCols: number; // = inputRows
  droppedBlankRows: number; // แถวว่างที่ถูกตัดก่อนสลับ
  error?: string;
}

function isBlankCell(v: Cell, trim: boolean): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return (trim ? v.trim() : v) === "";
  return false;
}

function isDataRow(row: Row, trim: boolean): boolean {
  return row.some((c) => !isBlankCell(c, trim));
}

function gridWidth(grid: Row[]): number {
  let w = 0;
  for (const r of grid) if (r.length > w) w = r.length;
  return w;
}

export function transposeGrid(grid: Row[], opts: TransposeOptions = {}): TransposeResult {
  const dropBlankRows = opts.dropBlankRows !== false;
  const trim = opts.trim !== false;

  const base: Omit<TransposeResult, "error"> = {
    rows: [],
    inputRows: 0,
    inputCols: 0,
    outputRows: 0,
    outputCols: 0,
    droppedBlankRows: 0,
  };

  const source = dropBlankRows ? grid.filter((r) => isDataRow(r, trim)) : grid.slice();
  const droppedBlankRows = grid.length - source.length;

  const inputRows = source.length;
  const width = gridWidth(source);

  if (inputRows === 0 || width === 0) {
    return { ...base, droppedBlankRows, error: "ไม่มีข้อมูลให้สลับ (ตารางว่าง)" };
  }

  const out: Row[] = [];
  for (let c = 0; c < width; c++) {
    const newRow: Row = new Array(inputRows);
    for (let r = 0; r < inputRows; r++) {
      const row = source[r];
      newRow[r] = c < row.length ? (row[c] ?? null) : null;
    }
    out.push(newRow);
  }

  return {
    rows: out,
    inputRows,
    inputCols: width,
    outputRows: out.length,
    outputCols: inputRows,
    droppedBlankRows,
  };
}

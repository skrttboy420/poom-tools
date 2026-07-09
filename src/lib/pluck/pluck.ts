// เลือก/จัดเรียง/เปลี่ยนชื่อคอลัมน์ (reshape ตาราง) — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case: ตัด packing list ให้เหลือเฉพาะคอลัมน์ที่ Pacred ต้องการ + สลับลำดับ + เปลี่ยนชื่อหัว
//   + เพิ่มคอลัมน์ "ค่าคงที่" (เช่น ติดเลขตู้/เลข shipment ให้ทุกแถว) ก่อน export
// ปรัชญา: แค่ "จัดรูปคอลัมน์" ไม่แตะค่าจริงในเซลล์ (ยึดค่าตามต้นฉบับ) · เลือกออกไปกี่คอลัมน์ก็ได้ ไม่ทำ tracking หาย

import type { Cell, Row } from "@/lib/reconcile/types";

export interface ColumnSpec {
  src: number; // index คอลัมน์ต้นทาง (< 0 = คอลัมน์ค่าคงที่)
  name: string; // ชื่อหัวตารางปลายทาง
  constant?: string; // ค่าที่ใส่ทุกแถว (ใช้เมื่อ src < 0)
}

export interface PluckOptions {
  dropEmptyRows?: boolean; // ตัดแถวที่ (หลังเลือกคอลัมน์แล้ว) ว่างทุกช่อง
}

export interface PluckResult {
  header: string[];
  rows: Row[];
  inputRows: number; // จำนวนแถวข้อมูลเข้า
  outputRows: number; // จำนวนแถวออก (หลัง dropEmptyRows)
}

function getCell(row: Row, idx: number): Cell {
  return idx >= 0 && idx < row.length ? (row[idx] ?? null) : null;
}

function isBlank(v: Cell): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

// สร้างตารางใหม่จาก spec — เรียงคอลัมน์ตามลำดับใน specs เป๊ะ
export function pluckColumns(
  header: string[],
  dataRows: Row[],
  specs: ColumnSpec[],
  opts: PluckOptions = {},
): PluckResult {
  const outHeader = specs.map((s) => s.name);

  const mapped: Row[] = dataRows.map((row) =>
    specs.map((s) => (s.src < 0 ? (s.constant ?? "") : getCell(row, s.src))),
  );

  let outRows = mapped;
  if (opts.dropEmptyRows) {
    // ตัดเฉพาะแถวที่ "ทุกช่องที่มาจากต้นฉบับ" ว่าง (ไม่นับคอลัมน์ค่าคงที่ กันแถวว่างรอด)
    const srcCols = specs
      .map((s, i) => ({ i, src: s.src }))
      .filter((x) => x.src >= 0)
      .map((x) => x.i);
    outRows = mapped.filter((r) => {
      if (srcCols.length === 0) return true; // ไม่มีคอลัมน์ต้นฉบับ → ไม่ตัด
      return srcCols.some((i) => !isBlank(r[i]));
    });
  }

  return {
    header: outHeader,
    rows: outRows,
    inputRows: dataRows.length,
    outputRows: outRows.length,
  };
}

// เดา spec เริ่มต้น = เอาทุกคอลัมน์ ตามลำดับเดิม ใช้ชื่อหัวเดิม (ว่าง → "คอลัมน์ N")
export function defaultSpecs(header: string[]): ColumnSpec[] {
  return header.map((h, i) => ({
    src: i,
    name: h && String(h).trim() !== "" ? String(h) : `คอลัมน์ ${i + 1}`,
  }));
}

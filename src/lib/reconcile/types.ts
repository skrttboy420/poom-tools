// โครงข้อมูลกลางของเครื่องมือ reconcile — ออกแบบให้ generic ใช้กับไฟล์อะไรก็ได้

export type Cell = string | number | boolean | null;
export type Row = Cell[];

export interface ParsedSheet {
  name: string;
  rows: Row[]; // ตาราง 2 มิติดิบ (รวมแถวว่าง/แถวสรุป) เพื่อให้เลือก header row เองได้
}

export type ParseVia = "xlsx" | "xlsx-repair" | "csv";

export interface ParsedFile {
  fileName: string;
  via: ParseVia; // xlsx-repair = ไฟล์ zip เพี้ยน (เช่น MOMO) ต้องซ่อมก่อน
  sheets: ParsedSheet[];
}

// การเลือกขอบเขตข้อมูลของ "หนึ่งฝั่ง" (A หรือ B)
export interface SideSelection {
  sheetIndex: number;
  headerRow: number; // index แถวหัวตารางใน sheet.rows
  dataStart: number; // แถวข้อมูลแถวแรก (ปกติ headerRow + 1)
  dataEnd: number | null; // exclusive; null = จนจบ
}

export type FieldRole = "key" | "compare";

export interface FieldDef {
  id: string; // ไอดี canonical เช่น "tracking"
  label: string; // ชื่อที่แสดง
  role: FieldRole; // key = ใช้ join, compare = ใช้เทียบ
  numeric: boolean; // true = เทียบเชิงตัวเลข (มี tolerance)
  tolerance: number; // ค่าคลาดเคลื่อนที่ยอมรับได้ (numeric)
}

export interface Mapping {
  fields: FieldDef[];
  colA: Record<string, number>; // fieldId -> column index ฝั่ง A (-1 = ไม่ได้ map)
  colB: Record<string, number>; // fieldId -> column index ฝั่ง B
}

export type FieldStatus = "match" | "mismatch" | "na";
export type RowStatus = "match" | "mismatch" | "only-a" | "only-b";

export interface CellCompare {
  a: Cell;
  b: Cell;
  status: FieldStatus;
}

export interface DiffRow {
  key: string;
  status: RowStatus;
  fields: Record<string, CellCompare>; // per compare field
}

export interface DiffSummary {
  totalKeys: number;
  match: number;
  mismatch: number;
  onlyA: number;
  onlyB: number;
  dupKeysA: number;
  dupKeysB: number;
  emptyKeyA: number;
  emptyKeyB: number;
}

export interface DiffResult {
  keyFieldId: string;
  keyFieldLabel: string;
  compareFields: FieldDef[];
  rows: DiffRow[];
  summary: DiffSummary;
}

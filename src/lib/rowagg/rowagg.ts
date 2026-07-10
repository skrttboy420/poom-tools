// รวม/สรุปหลายคอลัมน์ "ต่อแถว" (row-wise aggregate) — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case จริง: ไฟล์ที่แยกค่าเป็นหลายคอลัมน์ (น้ำหนักต่อวัน/ต่อ forwarder เจ้าละคอลัมน์, จำนวนกล่องต่อไซซ์) → อยากได้ยอดรวม/เฉลี่ย/มากสุด/น้อยสุด ต่อแถว
//   → เติม 1 คอลัมน์ท้ายตาราง = สรุปของคอลัมน์ที่เลือก "ในแถวนั้น"
// ต่างจาก /calc-col (ค่าซ้าย OP ค่าขวา 2 ตัว) — อันนี้รวมได้หลายคอลัมน์ · ต่างจาก /group /stats (สรุป "ลงคอลัมน์" ข้ามแถว) — อันนี้สรุป "ข้ามคอลัมน์" ในแถวเดียว
// ปรัชญา: อ่านอย่างเดียว ไม่แก้ข้อมูลเดิม (เติมคอลัมน์ท้าย) · ทุกแถวออกครบ (ไม่หาย) ·
//   ช่องที่ไม่ใช่ตัวเลข = ข้ามไป ไม่นับ (ไม่เดามั่วเป็น 0) · แถวที่ไม่มีค่าตัวเลขเลย → เว้นว่าง (ไม่แต่งค่า 0 ให้)

import type { Cell, Row } from "@/lib/reconcile/types";

export type RowAggFn = "sum" | "avg" | "min" | "max" | "range" | "count" | "count-numeric";

export interface RowAggOptions {
  cols: number[]; // คอลัมน์ที่จะสรุปข้ามกัน (ในแต่ละแถว)
  fn: RowAggFn; // ฟังก์ชันสรุป
  round?: number | null; // ปัดทศนิยม (null = ไม่ปัด) — ใช้กับ sum/avg/min/max/range
  name?: string; // ชื่อคอลัมน์ใหม่ (ว่าง = ใช้ชื่อ default ตามฟังก์ชัน)
}

export interface RowAggResult {
  header: Row; // หัวตาราง + คอลัมน์ที่เติม
  rows: Row[]; // แถวข้อมูล + ค่าที่เติม (ทุกแถว)
  addedCol: string; // ชื่อคอลัมน์ที่เติม
  newColIndex: number; // ตำแหน่งคอลัมน์ใหม่ (index)
  inputRows: number; // แถว input ทั้งหมด
  dataRows: number; // แถวหลังตัดแถวว่างทั้งแถว
  computedRows: number; // แถวที่คำนวณค่าออกมาได้ (ผลไม่ว่าง)
  skippedRows: number; // แถวที่คำนวณไม่ได้ (ไม่มีค่าตัวเลขเลย → เว้นว่าง)
  error?: string;
}

export const FN_LABEL: Record<RowAggFn, string> = {
  sum: "ผลรวม",
  avg: "ค่าเฉลี่ย",
  min: "ค่าต่ำสุด",
  max: "ค่าสูงสุด",
  range: "พิสัย (มาก−น้อย)",
  count: "นับช่องมีค่า",
  "count-numeric": "นับช่องตัวเลข",
};

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
function headerText(c: Cell): string {
  return c === null || c === undefined ? "" : String(c);
}
function roundTo(v: number, digits: number | null | undefined): number {
  if (digits === null || digits === undefined) return v;
  const f = Math.pow(10, digits);
  return Math.round((v + Number.EPSILON) * f) / f;
}

export function analyzeRowAgg(header: Row, allRows: Row[], opts: RowAggOptions): RowAggResult {
  const inputRows = allRows.length;
  const rows = allRows.filter(isDataRow);
  const dataRows = rows.length;
  const width = Math.max(header.length, ...rows.map((r) => r.length), 1);

  const base = (msg: string): RowAggResult => ({
    header: header.slice(),
    rows: rows.map((r) => r.slice()),
    addedCol: "",
    newColIndex: -1,
    inputRows,
    dataRows,
    computedRows: 0,
    skippedRows: 0,
    error: msg,
  });

  if (dataRows === 0) return base("ไม่มีแถวข้อมูล");
  if (!opts.cols || opts.cols.length === 0) return base("เลือกคอลัมน์ที่จะสรุปอย่างน้อย 1 คอลัมน์");
  for (const c of opts.cols) if (c < 0 || c >= width) return base("คอลัมน์ที่เลือกอยู่นอกช่วง");

  const fn = opts.fn;
  const countMode = fn === "count" || fn === "count-numeric";
  const defaultName =
    (opts.name && opts.name.trim() !== "" ? opts.name.trim() : "") ||
    (() => {
      const parts = opts.cols.map((c) => headerText(header[c]) || `คอลัมน์ ${c + 1}`);
      return `${FN_LABEL[fn]} (${parts.join(", ")})`;
    })();

  // คำนวณค่าต่อแถว
  function computeCell(row: Row): Cell {
    if (fn === "count") {
      // นับช่องที่ "มีค่า" (ไม่ว่าง) — ทุกชนิด · เป็นตัวเลขเสมอ (0 ได้)
      let n = 0;
      for (const c of opts.cols) {
        const cell = c < row.length ? row[c] : null;
        if (!isBlankCell(cell)) n++;
      }
      return n;
    }
    // เก็บเฉพาะค่าตัวเลข
    const nums: number[] = [];
    for (const c of opts.cols) {
      const v = parseNumeric(c < row.length ? row[c] : null);
      if (v !== null) nums.push(v);
    }
    if (fn === "count-numeric") return nums.length; // ตัวเลขเสมอ (0 ได้)
    if (nums.length === 0) return null; // ไม่มีตัวเลข → เว้นว่าง (ไม่เดา 0)
    let out: number;
    if (fn === "sum") out = nums.reduce((a, b) => a + b, 0);
    else if (fn === "avg") out = nums.reduce((a, b) => a + b, 0) / nums.length;
    else if (fn === "min") out = Math.min(...nums);
    else if (fn === "max") out = Math.max(...nums);
    else out = Math.max(...nums) - Math.min(...nums); // range
    return roundTo(out, opts.round);
  }

  const outHeader = header.slice();
  while (outHeader.length < width) outHeader.push(null);
  const newColIndex = outHeader.length;
  outHeader.push(defaultName);

  let computedRows = 0;
  let skippedRows = 0;
  const outRows: Row[] = rows.map((r) => {
    const out = r.slice();
    while (out.length < width) out.push(null);
    const cell = computeCell(r);
    // count/count-numeric ให้ค่าเสมอ (นับเป็น computed แม้ผลเป็น 0)
    if (cell === null) skippedRows++;
    else computedRows++;
    out.push(cell);
    return out;
  });

  // count mode: ทุกแถวถือว่า computed (มีผลเลขเสมอ) — ปรับให้สอดคล้อง
  if (countMode) {
    computedRows = dataRows;
    skippedRows = 0;
  }

  return {
    header: outHeader,
    rows: outRows,
    addedCol: defaultName,
    newColIndex,
    inputRows,
    dataRows,
    computedRows,
    skippedRows,
  };
}

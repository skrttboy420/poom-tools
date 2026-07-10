// ตารางสรุปไขว้ 2 มิติ (pivot / crosstab) — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case จริง: packing list → แถว = เลขตู้ (container), คอลัมน์ = forwarder → ช่อง = รวมน้ำหนัก/นับกล่อง
//   เห็นสรุป "ไขว้" 2 มิติในตารางเดียว (ต่อจาก /group ที่สรุปมิติเดียว) พร้อมยอดรวมต่อแถว/ต่อคอลัมน์/รวมทั้งหมด
// ปรัชญา: แค่ "อ่านสรุป" ไม่แก้ข้อมูลต้นฉบับ · ตัดแถวว่างทั้งแถวก่อนนับ ·
//   **ทุกแถวที่นับ = ตกลงช่องเดียว (ไม่หาย/ไม่ซ้ำ)** → ผลรวมจำนวนช่องทั้งหมด = countedRows (invariant)
//   · ยอดรวมคิดจากแถวจริงในกลุ่ม (ไม่ใช่รวมค่าของช่อง) → avg/min/max ถูกต้อง · คีย์ว่าง → "(ว่าง)"

import type { Cell, Row } from "@/lib/reconcile/types";

// แปลงเป็นตัวเลข: string ตัด comma + trim แล้วค่อยแปลง · คืน null ถ้าไม่ใช่ตัวเลข/ว่าง
// (logic เดียวกับ stats/group.parseNumeric — inline ไว้ให้ engine นี้ self-contained ตาม pattern pure engine)
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

export type PivotAgg = "sum" | "count" | "avg" | "min" | "max" | "count-distinct";

export const PIVOT_AGGS: PivotAgg[] = ["sum", "count", "avg", "min", "max", "count-distinct"];

export const PIVOT_AGG_LABEL: Record<PivotAgg, string> = {
  sum: "รวม",
  count: "นับแถว",
  avg: "เฉลี่ย",
  min: "ต่ำสุด",
  max: "สูงสุด",
  "count-distinct": "นับไม่ซ้ำ",
};

// agg ที่ไม่ต้องใช้คอลัมน์ค่า (นับจำนวนแถวล้วน)
export function aggNeedsValue(agg: PivotAgg): boolean {
  return agg !== "count";
}

export interface PivotOptions {
  trim?: boolean; // trim ค่าคีย์ก่อนจับกลุ่ม (default true)
  ignoreEmptyKey?: boolean; // ข้ามแถวที่คีย์แถว "หรือ" คีย์คอลัมน์ ว่าง (กัน subtotal ปน) — default false
}

export interface PivotResult {
  rowField: number;
  colField: number;
  valueCol: number; // -1 = ไม่ใช้ (สำหรับ count)
  agg: PivotAgg;
  rowHeader: string;
  colHeader: string;
  rowKeys: string[]; // ค่าหัวแถว (distinct ตามลำดับที่พบ)
  colKeys: string[]; // ค่าหัวคอลัมน์ (distinct ตามลำดับที่พบ)
  cells: (number | string | null)[][]; // [rowIdx][colIdx] · null = ไม่มีแถวตกช่องนี้
  counts: number[][]; // จำนวนแถวต่อช่อง (ยืนยัน invariant + tooltip)
  rowTotals: (number | string | null)[]; // ยอดต่อแถว (คิดจากทุกแถวในแถวนั้น)
  colTotals: (number | string | null)[]; // ยอดต่อคอลัมน์
  grandTotal: number | string | null;
  inputRows: number; // แถวข้อมูลจริง (หลังตัดแถวว่าง)
  countedRows: number; // แถวที่นับเข้าตาราง (= inputRows - แถวคีย์ว่างที่ถูกข้าม)
  emptyKeyRows: number; // แถวที่คีย์แถวหรือคอลัมน์ว่าง (บอกไว้เฉย ๆ)
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

function normKey(v: Cell, trim: boolean): string {
  if (isBlankCell(v)) return "";
  const s = String(v);
  return trim ? s.trim() : s;
}

function headerName(header: string[], idx: number): string {
  const h = header[idx];
  return h !== undefined && String(h).trim() !== "" ? String(h) : `คอลัมน์ ${idx + 1}`;
}

// คำนวณ agg เดียวจากชุดแถว (valueCol ใช้เฉพาะ agg ที่ต้องการค่า)
function aggOne(rows: Row[], agg: PivotAgg, valueCol: number, trim: boolean): number | string | null {
  if (rows.length === 0) return agg === "sum" ? 0 : agg === "count" || agg === "count-distinct" ? 0 : null;
  if (agg === "count") return rows.length;
  if (agg === "count-distinct") {
    const seen = new Set<string>();
    for (const r of rows) {
      const v = cellAt(r, valueCol);
      if (!isBlankCell(v)) seen.add(normKey(v, trim));
    }
    return seen.size;
  }
  // sum / avg / min / max — เฉพาะช่องตัวเลข
  let sum = 0;
  let n = 0;
  let min: number | null = null;
  let max: number | null = null;
  for (const r of rows) {
    const num = parseNumeric(cellAt(r, valueCol));
    if (num === null) continue;
    n++;
    sum += num;
    if (min === null || num < min) min = num;
    if (max === null || num > max) max = num;
  }
  if (agg === "sum") return sum; // ไม่มีตัวเลข → 0
  if (n === 0) return null; // avg/min/max ของกลุ่มไม่มีตัวเลข → ไม่มีค่า
  if (agg === "avg") return sum / n;
  if (agg === "min") return min;
  return max;
}

const SEP = ""; // คั่น signature กันปน

export function pivotTable(
  header: string[],
  dataRows: Row[],
  rowField: number,
  colField: number,
  valueCol: number,
  agg: PivotAgg,
  opts: PivotOptions = {},
): PivotResult {
  const trim = opts.trim !== false;
  const base: Omit<PivotResult, "error"> = {
    rowField,
    colField,
    valueCol,
    agg,
    rowHeader: "",
    colHeader: "",
    rowKeys: [],
    colKeys: [],
    cells: [],
    counts: [],
    rowTotals: [],
    colTotals: [],
    grandTotal: null,
    inputRows: 0,
    countedRows: 0,
    emptyKeyRows: 0,
  };

  const width = header.length;
  if (rowField < 0 || rowField >= width) return { ...base, error: "เลือกคอลัมน์สำหรับ 'แถว'" };
  if (colField < 0 || colField >= width) return { ...base, error: "เลือกคอลัมน์สำหรับ 'คอลัมน์'" };
  if (aggNeedsValue(agg) && (valueCol < 0 || valueCol >= width)) {
    return { ...base, error: "เลือกคอลัมน์ค่า (ที่จะสรุป)" };
  }

  const rows = dataRows.filter(isDataRow);

  // ลำดับคีย์ตามที่พบ + map signature → รายการแถว
  const rowOrder: string[] = [];
  const rowIndex = new Map<string, number>(); // rowSig → index (+ เก็บ display)
  const rowDisp = new Map<string, string>();
  const colOrder: string[] = [];
  const colIndex = new Map<string, number>();
  const colDisp = new Map<string, string>();

  const cellMap = new Map<string, Row[]>(); // rowSig+SEP+colSig → rows
  const rowAll = new Map<string, Row[]>();
  const colAll = new Map<string, Row[]>();
  const allRows: Row[] = [];
  let emptyKeyRows = 0;

  for (const row of rows) {
    const rv = cellAt(row, rowField);
    const cv = cellAt(row, colField);
    const rBlank = isBlankCell(rv);
    const cBlank = isBlankCell(cv);
    if (rBlank || cBlank) {
      emptyKeyRows++;
      if (opts.ignoreEmptyKey) continue;
    }
    const rSig = normKey(rv, trim);
    const cSig = normKey(cv, trim);
    if (!rowIndex.has(rSig)) {
      rowIndex.set(rSig, rowOrder.length);
      rowOrder.push(rSig);
      rowDisp.set(rSig, rBlank ? "(ว่าง)" : String(rv));
    }
    if (!colIndex.has(cSig)) {
      colIndex.set(cSig, colOrder.length);
      colOrder.push(cSig);
      colDisp.set(cSig, cBlank ? "(ว่าง)" : String(cv));
    }
    const ck = rSig + SEP + cSig;
    (cellMap.get(ck) ?? cellMap.set(ck, []).get(ck)!).push(row);
    (rowAll.get(rSig) ?? rowAll.set(rSig, []).get(rSig)!).push(row);
    (colAll.get(cSig) ?? colAll.set(cSig, []).get(cSig)!).push(row);
    allRows.push(row);
  }

  const cells: (number | string | null)[][] = [];
  const counts: number[][] = [];
  for (const rSig of rowOrder) {
    const cellRow: (number | string | null)[] = [];
    const countRow: number[] = [];
    for (const cSig of colOrder) {
      const bucket = cellMap.get(rSig + SEP + cSig);
      countRow.push(bucket ? bucket.length : 0);
      cellRow.push(bucket ? aggOne(bucket, agg, valueCol, trim) : null);
    }
    cells.push(cellRow);
    counts.push(countRow);
  }

  const rowTotals = rowOrder.map((rSig) => aggOne(rowAll.get(rSig) ?? [], agg, valueCol, trim));
  const colTotals = colOrder.map((cSig) => aggOne(colAll.get(cSig) ?? [], agg, valueCol, trim));
  const grandTotal = aggOne(allRows, agg, valueCol, trim);

  return {
    ...base,
    rowHeader: headerName(header, rowField),
    colHeader: headerName(header, colField),
    rowKeys: rowOrder.map((s) => rowDisp.get(s)!),
    colKeys: colOrder.map((s) => colDisp.get(s)!),
    cells,
    counts,
    rowTotals,
    colTotals,
    grandTotal,
    inputRows: rows.length,
    countedRows: allRows.length,
    emptyKeyRows,
  };
}

function fmtVal(v: number | string | null): string {
  if (v === null) return "";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "";
    return String(Math.round(v * 1e6) / 1e6); // กัน floating error
  }
  return v;
}

// export ผลเป็น CSV: หัว = [row\col, ...colKeys, รวม] · แถว = [rowKey, ...cells, rowTotal] · ปิดท้าย = [รวม, ...colTotals, grand]
export function pivotToCsv(result: PivotResult): string {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const corner = `${result.rowHeader} \\ ${result.colHeader}`;
  const lines = [[corner, ...result.colKeys, "รวม"].map(esc).join(",")];
  result.rowKeys.forEach((rk, i) => {
    lines.push(
      [rk, ...result.cells[i].map(fmtVal), fmtVal(result.rowTotals[i])].map(esc).join(","),
    );
  });
  lines.push(
    ["รวม", ...result.colTotals.map(fmtVal), fmtVal(result.grandTotal)].map(esc).join(","),
  );
  return lines.join("\n");
}

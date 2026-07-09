// จัดกลุ่ม + สรุปยอด (group-by / pivot เบา ๆ) — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case: packing list → จัดกลุ่มตาม "เลขตู้ (container)" แล้วรวมน้ำหนัก/CBM/นับกล่องต่อตู้
//   หรือกลุ่มตาม forwarder → รวมยอด · เป็นก้าวต่อจาก /stats (สถิติทั้งคอลัมน์) มาเป็น "สรุปต่อกลุ่ม"
// ปรัชญา: แค่ "อ่านสรุป" ไม่แก้ข้อมูลต้นฉบับ · ตัดแถวว่างทั้งแถวก่อนนับ · ทุกแถวที่นับเข้ากลุ่มใดกลุ่มหนึ่งเสมอ

import type { Cell, Row } from "@/lib/reconcile/types";

// แปลงเป็นตัวเลข: string ตัด comma + trim แล้วค่อยแปลง · คืน null ถ้าไม่ใช่ตัวเลข/ว่าง
// (logic เดียวกับ stats.parseNumeric — inline ไว้ให้ engine นี้ self-contained ตาม pattern pure engine อื่น)
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

export type AggFn = "sum" | "avg" | "min" | "max" | "count" | "count-distinct" | "first";

export const AGG_FNS: AggFn[] = ["sum", "avg", "min", "max", "count", "count-distinct", "first"];

export const AGG_LABEL: Record<AggFn, string> = {
  sum: "รวม",
  avg: "เฉลี่ย",
  min: "ต่ำสุด",
  max: "สูงสุด",
  count: "นับ (มีค่า)",
  "count-distinct": "นับไม่ซ้ำ",
  first: "ค่าแรก",
};

export interface AggSpec {
  col: number; // index คอลัมน์ที่จะสรุป
  fn: AggFn;
}

export interface GroupOptions {
  trim?: boolean; // trim ค่าคีย์ก่อนจับกลุ่ม (default true)
  ignoreEmptyKey?: boolean; // ข้ามแถวที่คีย์ว่างทั้งหมด (กัน subtotal/grand-total ปน) — default false
}

export interface GroupRow {
  keys: string[]; // ค่าคีย์ของกลุ่ม (ตามลำดับ groupCols) — ช่องว่างโชว์ "(ว่าง)"
  count: number; // จำนวนแถวในกลุ่ม
  values: (number | string | null)[]; // ผลของแต่ละ agg (เรียงตาม aggs)
}

export interface GroupResult {
  groupCols: number[];
  aggs: AggSpec[];
  keyHeaders: string[]; // ชื่อหัวของคอลัมน์คีย์
  aggHeaders: string[]; // ชื่อหัวของคอลัมน์ผลสรุป (เช่น "รวม(kg)")
  rows: GroupRow[];
  total: GroupRow; // แถวรวมทั้งหมด (grand total) — คำนวณจากทุกแถวที่นับเข้ากลุ่ม
  inputRows: number; // แถวข้อมูลจริง (หลังตัดแถวว่าง)
  countedRows: number; // แถวที่นับเข้ากลุ่มจริง (= inputRows - แถวคีย์ว่างที่ถูกข้าม)
  groups: number;
  emptyKeyRows: number; // จำนวนแถวที่คีย์ว่างทั้งหมด (บอกไว้เฉย ๆ)
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

// คำนวณ agg เดียวจากชุดแถว
function aggOne(rows: Row[], spec: AggSpec, trim: boolean): number | string | null {
  if (spec.fn === "count") {
    let c = 0;
    for (const r of rows) if (!isBlankCell(cellAt(r, spec.col))) c++;
    return c;
  }
  if (spec.fn === "count-distinct") {
    const seen = new Set<string>();
    for (const r of rows) {
      const v = cellAt(r, spec.col);
      if (!isBlankCell(v)) seen.add(normKey(v, trim));
    }
    return seen.size;
  }
  if (spec.fn === "first") {
    for (const r of rows) {
      const v = cellAt(r, spec.col);
      if (!isBlankCell(v)) return String(v);
    }
    return null;
  }
  // sum / avg / min / max — เฉพาะช่องตัวเลข
  let sum = 0;
  let n = 0;
  let min: number | null = null;
  let max: number | null = null;
  for (const r of rows) {
    const num = parseNumeric(cellAt(r, spec.col));
    if (num === null) continue;
    n++;
    sum += num;
    if (min === null || num < min) min = num;
    if (max === null || num > max) max = num;
  }
  if (spec.fn === "sum") return sum; // ไม่มีตัวเลข → 0 (ผลรวมของว่าง)
  if (n === 0) return null; // avg/min/max ของกลุ่มไม่มีตัวเลข → ไม่มีค่า
  if (spec.fn === "avg") return sum / n;
  if (spec.fn === "min") return min;
  return max;
}

function aggRow(rows: Row[], aggs: AggSpec[], trim: boolean): (number | string | null)[] {
  return aggs.map((a) => aggOne(rows, a, trim));
}

// จัดกลุ่มตาม groupCols แล้วสรุปตาม aggs
export function groupBy(
  header: string[],
  dataRows: Row[],
  groupCols: number[],
  aggs: AggSpec[],
  opts: GroupOptions = {},
): GroupResult {
  const trim = opts.trim !== false;
  const rows = dataRows.filter(isDataRow);

  const map = new Map<string, { keys: string[]; rows: Row[] }>();
  const included: Row[] = [];
  let emptyKeyRows = 0;

  for (const row of rows) {
    const keyVals = groupCols.map((c) => cellAt(row, c));
    const allEmpty = keyVals.length > 0 && keyVals.every(isBlankCell);
    if (allEmpty) {
      emptyKeyRows++;
      if (opts.ignoreEmptyKey) continue;
    }
    const dispKeys = keyVals.map((v) => (isBlankCell(v) ? "(ว่าง)" : String(v)));
    const sig = keyVals.map((v) => normKey(v, trim)).join("");
    let g = map.get(sig);
    if (!g) {
      g = { keys: dispKeys, rows: [] };
      map.set(sig, g);
    }
    g.rows.push(row);
    included.push(row);
  }

  const groupRows: GroupRow[] = [];
  for (const g of map.values()) {
    groupRows.push({ keys: g.keys, count: g.rows.length, values: aggRow(g.rows, aggs, trim) });
  }

  const total: GroupRow = {
    keys: groupCols.map(() => ""),
    count: included.length,
    values: aggRow(included, aggs, trim),
  };

  return {
    groupCols,
    aggs,
    keyHeaders: groupCols.map((c) => headerName(header, c)),
    aggHeaders: aggs.map((a) => `${AGG_LABEL[a.fn]}(${headerName(header, a.col)})`),
    rows: groupRows,
    total,
    inputRows: rows.length,
    countedRows: included.length,
    groups: groupRows.length,
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

// export ผลเป็น CSV (หัว = คีย์ + จำนวนแถว + agg · ปิดท้ายด้วยแถวรวม)
export function groupToCsv(result: GroupResult): string {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const head = [...result.keyHeaders, "จำนวนแถว", ...result.aggHeaders];
  const lines = [head.map(esc).join(",")];
  for (const r of result.rows) {
    lines.push([...r.keys, String(r.count), ...r.values.map(fmtVal)].map(esc).join(","));
  }
  lines.push(
    ["รวมทั้งหมด", ...result.keyHeaders.slice(1).map(() => ""), String(result.total.count), ...result.total.values.map(fmtVal)]
      .map(esc)
      .join(","),
  );
  return lines.join("\n");
}

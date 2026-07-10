// จับ "ค่าตัวเลขที่ผิดปกติ" ในคอลัมน์เดียว — น้ำหนัก/CBM/จำนวนกล่องที่น่าจะกรอกผิด (เกินศูนย์, จุดทศนิยมเลื่อน) — pure ล้วน
// use-case จริง: packing list น้ำหนัก 50 kg แต่พิมพ์ 5000 (เกินศูนย์) หรือ 0.05 แทน 0.5 → ยอดรวมเพี้ยน ตรวจตาไม่ทัน
//   → /gap จับแค่ 0/ว่าง · อันนี้จับ "ค่ามีอยู่แต่ผิดปกติ" (สูง/ต่ำกว่าเพื่อนมาก) · ตามปรัชญาไม่เดามั่ว: โชว์ค่าที่น่าสงสัยให้ดูก่อน ไม่แก้ให้
// วิธี: IQR (robust ไม่ต้องสมมติการกระจาย — default) หรือ z-score (mean ± k·sd)

import type { Cell, Row } from "@/lib/reconcile/types";

export type OutlierMethod = "iqr" | "zscore";

export interface OutlierOptions {
  method?: OutlierMethod; // "iqr" (default) หรือ "zscore"
  k?: number; // IQR: ตัวคูณ (default 1.5 = อ่อน, 3 = สุดโต่ง) · zscore: จำนวน sd (default 3)
}

export interface OutlierItem {
  row: number; // index แถว (0-based ใน dataRows)
  value: number; // ค่าตัวเลขที่ parse ได้
  display: string; // ค่าที่แสดง (ตามต้นฉบับ)
  side: "low" | "high"; // ต่ำผิดปกติ / สูงผิดปกติ
  score: number; // ความผิดปกติ — IQR: กี่เท่าของ IQR ที่พ้นรั้ว · zscore: |z|
}

export interface OutlierResult {
  outliers: OutlierItem[];
  method: OutlierMethod;
  numericValues: number; // จำนวนค่าตัวเลขที่นำมาคิด
  outlierCount: number;
  blankRows: number; // แถวที่ช่องนี้ว่าง
  nonNumeric: number; // ช่องมีค่าแต่ไม่ใช่ตัวเลข
  // สถิติสรุป (คิดจากค่าตัวเลขทั้งหมด)
  min: number | null;
  max: number | null;
  q1: number | null;
  median: number | null;
  q3: number | null;
  iqr: number | null;
  mean: number | null;
  stddev: number | null;
  lowerBound: number | null; // รั้วล่าง (ต่ำกว่านี้ = ผิดปกติ)
  upperBound: number | null; // รั้วบน
  error?: string;
}

const MIN_VALUES = 4; // ต้องมีอย่างน้อยเท่านี้ถึงคำนวณ quartile/กระจายได้มีความหมาย
const ROWS_CAP = 5000; // เก็บ outlier ไม่เกินเท่านี้ (กัน payload บวม)

// parse ตัวเลข: ตัด comma+trim · boolean/Infinity/ว่าง → null (สอดคล้อง toNumber ของ diff/stats)
function parseNumeric(cell: Cell): number | null {
  if (cell === null || cell === undefined) return null;
  if (typeof cell === "boolean") return null;
  if (typeof cell === "number") return Number.isFinite(cell) ? cell : null;
  const s = String(cell).replace(/,/g, "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function isBlankCell(c: Cell): boolean {
  return c === null || c === undefined || (typeof c === "string" && c.trim() === "");
}

// percentile แบบ interpolation (type 7 = เหมือน Excel PERCENTILE.INC) บน array ที่เรียงแล้ว
function percentile(sorted: number[], p: number): number {
  const n = sorted.length;
  if (n === 1) return sorted[0];
  const idx = p * (n - 1);
  const lo = Math.floor(idx);
  const frac = idx - lo;
  if (lo + 1 >= n) return sorted[n - 1];
  return sorted[lo] + frac * (sorted[lo + 1] - sorted[lo]);
}

// ปัดกัน float error (เช่น 0.1+0.2)
function tidy(n: number): number {
  return Math.round((n + Number.EPSILON) * 1e6) / 1e6;
}

export function findOutliers(
  header: Row,
  dataRows: Row[],
  col: number,
  opts: OutlierOptions = {},
): OutlierResult {
  void header;
  const method: OutlierMethod = opts.method === "zscore" ? "zscore" : "iqr";
  const defaultK = method === "iqr" ? 1.5 : 3;
  const k = opts.k !== undefined && Number.isFinite(opts.k) && opts.k > 0 ? opts.k : defaultK;

  const base: Omit<OutlierResult, "error"> = {
    outliers: [],
    method,
    numericValues: 0,
    outlierCount: 0,
    blankRows: 0,
    nonNumeric: 0,
    min: null,
    max: null,
    q1: null,
    median: null,
    q3: null,
    iqr: null,
    mean: null,
    stddev: null,
    lowerBound: null,
    upperBound: null,
  };

  // validate col
  let width = header.length;
  for (const r of dataRows) if (r.length > width) width = r.length;
  if (width === 0) return { ...base, error: "ไม่มีข้อมูลให้ตรวจ (ตารางว่าง)" };
  if (col < 0 || col >= width) return { ...base, error: "เลือกคอลัมน์ตัวเลขที่จะตรวจ" };

  // เก็บค่าตัวเลข + index แถว
  const values: { row: number; value: number; display: string }[] = [];
  let blankRows = 0;
  let nonNumeric = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const cell: Cell = col < row.length ? (row[col] ?? null) : null;
    if (isBlankCell(cell)) {
      blankRows += 1;
      continue;
    }
    const num = parseNumeric(cell);
    if (num === null) {
      nonNumeric += 1;
      continue;
    }
    values.push({ row: i, value: num, display: typeof cell === "string" ? cell : String(cell) });
  }

  const numericValues = values.length;
  if (numericValues < MIN_VALUES) {
    return {
      ...base,
      numericValues,
      blankRows,
      nonNumeric,
      error: `ค่าตัวเลขน้อยเกินไป (${numericValues} ค่า) — ต้องมีอย่างน้อย ${MIN_VALUES} ค่าถึงจะหาค่าผิดปกติได้`,
    };
  }

  const nums = values.map((v) => v.value);
  const sorted = [...nums].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const q1 = percentile(sorted, 0.25);
  const median = percentile(sorted, 0.5);
  const q3 = percentile(sorted, 0.75);
  const iqr = q3 - q1;
  const mean = nums.reduce((s, v) => s + v, 0) / numericValues;
  const variance = nums.reduce((s, v) => s + (v - mean) * (v - mean), 0) / (numericValues - 1); // sample sd
  const stddev = Math.sqrt(variance);

  let lowerBound: number;
  let upperBound: number;
  const outliers: OutlierItem[] = [];

  if (method === "iqr") {
    lowerBound = q1 - k * iqr;
    upperBound = q3 + k * iqr;
    // ถ้า IQR = 0 (ค่ากระจายน้อยมาก) วัดความผิดปกติแบบ IQR ไม่ได้ → ไม่ flag (กัน false positive)
    if (iqr > 0) {
      for (const v of values) {
        if (v.value < lowerBound) {
          outliers.push({ row: v.row, value: v.value, display: v.display, side: "low", score: tidy((lowerBound - v.value) / iqr) });
        } else if (v.value > upperBound) {
          outliers.push({ row: v.row, value: v.value, display: v.display, side: "high", score: tidy((v.value - upperBound) / iqr) });
        }
        if (outliers.length >= ROWS_CAP) break;
      }
    }
  } else {
    lowerBound = mean - k * stddev;
    upperBound = mean + k * stddev;
    if (stddev > 0) {
      for (const v of values) {
        const z = (v.value - mean) / stddev;
        if (Math.abs(z) > k) {
          outliers.push({ row: v.row, value: v.value, display: v.display, side: z < 0 ? "low" : "high", score: tidy(Math.abs(z)) });
        }
        if (outliers.length >= ROWS_CAP) break;
      }
    }
  }

  // เรียง: ผิดปกติมากสุดก่อน (score สูง) → แล้วตาม row
  outliers.sort((a, b) => b.score - a.score || a.row - b.row);

  return {
    outliers,
    method,
    numericValues,
    outlierCount: outliers.length,
    blankRows,
    nonNumeric,
    min: tidy(min),
    max: tidy(max),
    q1: tidy(q1),
    median: tidy(median),
    q3: tidy(q3),
    iqr: tidy(iqr),
    mean: tidy(mean),
    stddev: tidy(stddev),
    lowerBound: tidy(lowerBound),
    upperBound: tidy(upperBound),
    error: undefined,
  };
}

// export ค่าผิดปกติเป็น CSV (แถว, ค่า, ด้าน, คะแนนผิดปกติ)
export function outlierToCsv(result: OutlierResult): string {
  const esc = (v: string | number): string => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const label = result.method === "iqr" ? "เท่าของ IQR" : "z-score";
  const lines: string[] = [`แถว,ค่า,ด้าน,ผิดปกติ (${label})`];
  for (const o of result.outliers) {
    lines.push([o.row + 1, esc(o.display), o.side === "low" ? "ต่ำผิดปกติ" : "สูงผิดปกติ", o.score].join(","));
  }
  return lines.join("\n");
}

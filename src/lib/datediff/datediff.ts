// คำนวณจำนวนวันระหว่าง 2 คอลัมน์วันที่ (date difference) — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case จริง: ระยะเวลาขนส่ง (ETA − ETD = กี่วัน) · วันเก็บตู้/ค่าเดโมเรจ (วันนี้ − วันตู้เข้า) · อายุงาน (กี่วันผ่านมาแล้ว)
//   → เติมคอลัมน์ "จำนวนวัน" ให้ทุกแถวจากผลต่างวันที่ 2 ช่อง
// ต่างจาก /calc-col (คูณ/หารตัวเลขตรง ๆ) — อันนี้ parse "วันที่" ก่อนแล้วค่อยลบกันเป็นจำนวนวัน/สัปดาห์
// ปรัชญา: ไม่เดามั่ว — ช่องใดช่องหนึ่ง parse วันที่ไม่ได้ = เว้นว่าง (นับ skipped) · ความกำกวม DD/MM = ผู้ใช้เลือกเอง (dayFirst) ·
//   ทุกแถวออกครบ · default = เติมคอลัมน์ใหม่ (ไม่ทับของเดิม)

import type { Cell, Row } from "@/lib/reconcile/types";

export type DiffUnit = "days" | "weeks";

export const UNIT_LABEL: Record<DiffUnit, string> = {
  days: "วัน",
  weeks: "สัปดาห์",
};

export interface DateDiffOptions {
  startCol: number; // คอลัมน์วันที่เริ่ม (ตัวตั้ง)
  endCol: number; // คอลัมน์วันที่จบ (end − start)
  unit?: DiffUnit; // default "days"
  absolute?: boolean; // ไม่สนทิศ (ค่าติดลบ → บวก)
  inclusive?: boolean; // นับปลายทั้งสองข้าง (+1 วัน) เช่น นับวันเก็บตู้
  dayFirst?: boolean; // ตีความ DD/MM (default true) · false = MM/DD
  buddhistInput?: boolean; // ปีที่รับเข้าเป็น พ.ศ. (ลบ 543 ก่อน)
  round?: number | null; // ปัดทศนิยม (null = ไม่ปัด) — days ปกติเป็นจำนวนเต็มอยู่แล้ว
  colName?: string; // ชื่อคอลัมน์ใหม่ (default ตามหน่วย)
}

export interface DateDiffResult {
  header: Row;
  rows: Row[];
  addedCols: string[];
  firstNewIndex: number;
  inputRows: number;
  dataRows: number;
  computedRows: number; // parse ได้ทั้ง 2 ช่อง → คำนวณผลต่างได้
  skippedRows: number; // ช่องใดช่องหนึ่ง parse วันที่ไม่ได้ → เว้นว่าง
  negativeRows: number; // end < start (ก่อนทำ absolute)
  error?: string;
}

const MS_PER_DAY = 86400000;
// Excel serial → รับเฉพาะช่วงสมเหตุสมผล (ราว ค.ศ. 1954–2064) กันตัวเลขทั่วไปโดนตีความมั่ว
const MIN_SERIAL = 20000;
const MAX_SERIAL = 60000;

interface YMD {
  y: number;
  m: number;
  d: number;
}

function isBlankCell(v: Cell): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}
function isDataRow(row: Row): boolean {
  return row.some((c) => !isBlankCell(c));
}
function cellAt(row: Row, col: number): Cell {
  if (col < 0) return null;
  return col < row.length ? row[col] : null;
}

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}
function daysInMonth(y: number, m: number): number {
  const table = [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return table[m - 1] ?? 0;
}
function validYMD(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > daysInMonth(y, m)) return false;
  return true;
}
function fromExcelSerial(serial: number): YMD | null {
  if (!Number.isFinite(serial)) return null;
  const whole = Math.floor(serial);
  const ms = Date.UTC(1899, 11, 30) + whole * MS_PER_DAY;
  const dt = new Date(ms);
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth() + 1;
  const d = dt.getUTCDate();
  if (!validYMD(y, m, d)) return null;
  return { y, m, d };
}
function normalizeYear(rawYear: number, buddhistInput: boolean): number {
  let year = rawYear;
  if (rawYear < 100) {
    if (buddhistInput) year = 2500 + rawYear;
    else year = rawYear < 70 ? 2000 + rawYear : 1900 + rawYear;
  }
  if (buddhistInput) year = year - 543;
  return year;
}

// parse ค่าช่องเดียว → epoch ms (UTC เที่ยงคืน) หรือ null
export function parseDateToMs(cell: Cell, dayFirst = true, buddhistInput = false): number | null {
  if (typeof cell === "number") {
    if (Number.isInteger(cell) && cell >= MIN_SERIAL && cell <= MAX_SERIAL) {
      const ymd = fromExcelSerial(cell);
      return ymd ? Date.UTC(ymd.y, ymd.m - 1, ymd.d) : null;
    }
    return null;
  }
  if (typeof cell !== "string") return null;

  const s = cell.trim();
  if (s === "") return null;

  let y: number;
  let m: number;
  let d: number;

  if (/^\d{8}$/.test(s)) {
    y = normalizeYear(Number(s.slice(0, 4)), buddhistInput);
    m = Number(s.slice(4, 6));
    d = Number(s.slice(6, 8));
  } else {
    const parts = s.split(/[/.\-]/).map((p) => p.trim());
    if (parts.length !== 3) return null;
    if (!parts.every((p) => /^\d{1,4}$/.test(p))) return null;
    const nums = parts.map((p) => Number(p));
    if (parts[0].length >= 3) {
      y = normalizeYear(nums[0], buddhistInput);
      m = nums[1];
      d = nums[2];
    } else {
      y = normalizeYear(nums[2], buddhistInput);
      if (dayFirst) {
        d = nums[0];
        m = nums[1];
      } else {
        m = nums[0];
        d = nums[1];
      }
    }
  }

  if (!validYMD(y, m, d)) return null;
  return Date.UTC(y, m - 1, d);
}

// ล้างเศษ float (สำหรับ weeks ที่หารแล้วมีทศนิยม)
function cleanFloat(x: number, places: number): number {
  const f = Math.pow(10, places);
  return Math.round((x + Number.EPSILON) * f) / f;
}

// คำนวณผลต่าง 2 วันที่ (ms) → ค่าตามหน่วย/ออปชัน · null ถ้าฝั่งใดฝั่ง parse ไม่ได้
export function diffDates(
  startMs: number | null,
  endMs: number | null,
  opts: { unit?: DiffUnit; absolute?: boolean; inclusive?: boolean; round?: number | null } = {},
): { value: number; negative: boolean } | null {
  if (startMs === null || endMs === null) return null;
  const rawDays = Math.round((endMs - startMs) / MS_PER_DAY);
  const negative = rawDays < 0;

  let days = rawDays;
  if (opts.inclusive) days = days + (days >= 0 ? 1 : -1);
  if (opts.absolute) days = Math.abs(days);

  let value = opts.unit === "weeks" ? days / 7 : days;
  if (opts.round !== null && opts.round !== undefined) value = cleanFloat(value, opts.round);
  return { value, negative };
}

export function analyzeDateDiff(header: Row, allRows: Row[], opts: DateDiffOptions): DateDiffResult {
  const inputRows = allRows.length;
  const rows = allRows.filter(isDataRow);
  const dataRows = rows.length;
  const width = Math.max(header.length, ...rows.map((r) => r.length), 1);

  const base = (msg: string): DateDiffResult => ({
    header: header.slice(),
    rows: rows.map((r) => r.slice()),
    addedCols: [],
    firstNewIndex: -1,
    inputRows,
    dataRows,
    computedRows: 0,
    skippedRows: 0,
    negativeRows: 0,
    error: msg,
  });

  if (dataRows === 0) return base("ไม่มีแถวข้อมูล");
  if (opts.startCol < 0 || opts.startCol >= width) return base("เลือกคอลัมน์วันที่เริ่มให้อยู่ในช่วง");
  if (opts.endCol < 0 || opts.endCol >= width) return base("เลือกคอลัมน์วันที่จบให้อยู่ในช่วง");
  if (opts.startCol === opts.endCol) return base("คอลัมน์เริ่มกับจบต้องคนละคอลัมน์");

  const unit: DiffUnit = opts.unit === "weeks" ? "weeks" : "days";
  const dayFirst = opts.dayFirst !== false;
  const buddhistInput = opts.buddhistInput === true;
  const round = opts.round === undefined ? null : opts.round;
  const colName =
    opts.colName && opts.colName.trim() !== ""
      ? opts.colName.trim()
      : `จำนวน${UNIT_LABEL[unit]}`;

  let computedRows = 0;
  let skippedRows = 0;
  let negativeRows = 0;

  const assigned: Cell[] = rows.map((r) => {
    const startMs = parseDateToMs(cellAt(r, opts.startCol), dayFirst, buddhistInput);
    const endMs = parseDateToMs(cellAt(r, opts.endCol), dayFirst, buddhistInput);
    const res = diffDates(startMs, endMs, {
      unit,
      absolute: opts.absolute,
      inclusive: opts.inclusive,
      round,
    });
    if (res === null) {
      skippedRows++;
      return null;
    }
    computedRows++;
    if (res.negative) negativeRows++;
    return res.value;
  });

  const outHeader = header.slice();
  while (outHeader.length < width) outHeader.push(null);
  const firstNewIndex = outHeader.length;
  outHeader.push(colName);

  const outRows: Row[] = rows.map((r, i) => {
    const out = r.slice();
    while (out.length < width) out.push(null);
    out.push(assigned[i]);
    return out;
  });

  return {
    header: outHeader,
    rows: outRows,
    addedCols: [colName],
    firstNewIndex,
    inputRows,
    dataRows,
    computedRows,
    skippedRows,
    negativeRows,
  };
}

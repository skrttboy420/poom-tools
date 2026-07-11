// แยกส่วนของวันที่ (date parts) — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case จริง: อยากสรุป/จัดกลุ่มตาม "เดือน" หรือ "ไตรมาส" เช่น มีกี่ตู้ต่อเดือน · น้ำหนักรวมต่อไตรมาส
//   → แยกคอลัมน์วันที่ (ETD/ETA/วันตู้เข้า) เป็น ปี / เดือน / วัน / ไตรมาส / ปี-เดือน / วันในสัปดาห์ → เอาไป /group /pivot ต่อ
// ต่างจาก /date (จัดรูปแบบทั้งค่าให้เป็นรูปเดียว) · /split-col (แยกตามตัวคั่น literal ล้วน) —
//   อันนี้ parse "วันที่" จริง (รองรับหลายรูปแบบ + Excel serial + พ.ศ.) แล้วดึงส่วนที่ต้องการเป็นคอลัมน์
// ปรัชญา: ไม่เดามั่ว — ช่องที่ parse ไม่ได้ = เว้นว่างทุกคอลัมน์ที่แยก (นับ skipped) · ความกำกวม DD/MM = ผู้ใช้เลือกเอง ·
//   ทุกแถวออกครบ · default = เติมคอลัมน์ใหม่ (ไม่ทับของเดิม)

import type { Cell, Row } from "@/lib/reconcile/types";

export type DatePart =
  | "year"
  | "buddhist-year"
  | "month"
  | "month-name"
  | "day"
  | "weekday"
  | "quarter"
  | "year-month"
  | "iso-week";

export const PART_LABEL: Record<DatePart, string> = {
  year: "ปี (ค.ศ.)",
  "buddhist-year": "ปี (พ.ศ.)",
  month: "เดือน (เลข)",
  "month-name": "ชื่อเดือน",
  day: "วันที่",
  weekday: "วันในสัปดาห์",
  quarter: "ไตรมาส",
  "year-month": "ปี-เดือน",
  "iso-week": "สัปดาห์ (ISO)",
};

// ชื่อคอลัมน์ default เมื่อเติม
export const PART_COLNAME: Record<DatePart, string> = {
  year: "ปี",
  "buddhist-year": "ปี พ.ศ.",
  month: "เดือน",
  "month-name": "ชื่อเดือน",
  day: "วันที่",
  weekday: "วันในสัปดาห์",
  quarter: "ไตรมาส",
  "year-month": "ปี-เดือน",
  "iso-week": "สัปดาห์",
};

export const THAI_MONTHS_FULL = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];
export const THAI_MONTHS_ABBR = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];
export const THAI_WEEKDAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

export interface DatePartsOptions {
  col: number; // คอลัมน์วันที่
  parts: DatePart[]; // ส่วนที่จะแยก (ตามลำดับ)
  dayFirst?: boolean; // ตีความ DD/MM (default true) · false = MM/DD
  buddhistInput?: boolean; // ปีที่รับเข้าเป็น พ.ศ. (ลบ 543 ก่อน)
  monthNameStyle?: "full" | "abbr"; // ชื่อเดือนเต็ม/ย่อ (default full)
  quarterStyle?: "q" | "number"; // "Q3" หรือ 3 (default "q")
}

export interface DatePartsResult {
  header: Row;
  rows: Row[];
  addedCols: string[];
  firstNewIndex: number;
  inputRows: number;
  dataRows: number;
  computedRows: number; // parse ได้
  skippedRows: number; // มีค่าแต่ parse ไม่ได้ → เว้นว่าง
  blankRows: number; // ช่องว่าง → เว้นว่าง
  error?: string;
}

const MS_PER_DAY = 86400000;
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

// parse ค่าช่องเดียว → YMD (ค.ศ. หลังปรับ พ.ศ. แล้ว) หรือ null
export function parseDateParts(cell: Cell, dayFirst = true, buddhistInput = false): YMD | null {
  if (typeof cell === "number") {
    if (Number.isInteger(cell) && cell >= MIN_SERIAL && cell <= MAX_SERIAL) {
      return fromExcelSerial(cell);
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
  return { y, m, d };
}

function weekdayIndex(ymd: YMD): number {
  return new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d)).getUTCDay(); // 0 = อาทิตย์
}
// ISO 8601 week number
function isoWeek(ymd: YMD): number {
  const date = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d));
  const dayNum = (date.getUTCDay() + 6) % 7; // จันทร์ = 0
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // เลื่อนไปวันพฤหัสของสัปดาห์นั้น
  const firstThursday = date.getTime();
  date.setUTCMonth(0, 1); // 1 ม.ค.
  if (date.getUTCDay() !== 4) {
    date.setUTCMonth(0, 1 + ((4 - date.getUTCDay() + 7) % 7));
  }
  return 1 + Math.round((firstThursday - date.getTime()) / (7 * MS_PER_DAY));
}

// คำนวณค่าของ 1 ส่วน จาก YMD (ตาม option)
export function partValue(
  ymd: YMD,
  part: DatePart,
  opts: { monthNameStyle: "full" | "abbr"; quarterStyle: "q" | "number" },
): Cell {
  switch (part) {
    case "year":
      return ymd.y;
    case "buddhist-year":
      return ymd.y + 543;
    case "month":
      return ymd.m;
    case "month-name":
      return (opts.monthNameStyle === "abbr" ? THAI_MONTHS_ABBR : THAI_MONTHS_FULL)[ymd.m - 1] ?? "";
    case "day":
      return ymd.d;
    case "weekday":
      return THAI_WEEKDAYS[weekdayIndex(ymd)] ?? "";
    case "quarter": {
      const q = Math.ceil(ymd.m / 3);
      return opts.quarterStyle === "number" ? q : `Q${q}`;
    }
    case "year-month":
      return `${ymd.y}-${String(ymd.m).padStart(2, "0")}`;
    case "iso-week":
      return isoWeek(ymd);
  }
}

export function analyzeDateParts(header: Row, allRows: Row[], opts: DatePartsOptions): DatePartsResult {
  const inputRows = allRows.length;
  const rows = allRows.filter(isDataRow);
  const dataRows = rows.length;
  const tableWidth = Math.max(header.length, ...rows.map((r) => r.length), 1);

  const base = (msg: string): DatePartsResult => ({
    header: header.slice(),
    rows: rows.map((r) => r.slice()),
    addedCols: [],
    firstNewIndex: -1,
    inputRows,
    dataRows,
    computedRows: 0,
    skippedRows: 0,
    blankRows: 0,
    error: msg,
  });

  if (dataRows === 0) return base("ไม่มีแถวข้อมูล");
  if (opts.col < 0 || opts.col >= tableWidth) return base("เลือกคอลัมน์วันที่ให้อยู่ในช่วง");
  if (opts.parts.length === 0) return base("เลือกส่วนของวันที่ที่จะแยกอย่างน้อย 1 อย่าง");

  const dayFirst = opts.dayFirst !== false;
  const buddhistInput = opts.buddhistInput === true;
  const monthNameStyle = opts.monthNameStyle === "abbr" ? "abbr" : "full";
  const quarterStyle = opts.quarterStyle === "number" ? "number" : "q";

  let computedRows = 0;
  let skippedRows = 0;
  let blankRows = 0;

  // คำนวณค่าแต่ละส่วนต่อแถว (null ถ้า parse ไม่ได้/ว่าง)
  const perRow: Cell[][] = rows.map((r) => {
    const cell = cellAt(r, opts.col);
    if (isBlankCell(cell)) {
      blankRows++;
      return opts.parts.map(() => null);
    }
    const ymd = parseDateParts(cell, dayFirst, buddhistInput);
    if (ymd === null) {
      skippedRows++;
      return opts.parts.map(() => null);
    }
    computedRows++;
    return opts.parts.map((p) => partValue(ymd, p, { monthNameStyle, quarterStyle }));
  });

  const addedCols = opts.parts.map((p) => PART_COLNAME[p]);

  const outHeader = header.slice();
  while (outHeader.length < tableWidth) outHeader.push(null);
  const firstNewIndex = outHeader.length;
  for (const name of addedCols) outHeader.push(name);

  const outRows: Row[] = rows.map((r, i) => {
    const out = r.slice();
    while (out.length < tableWidth) out.push(null);
    for (const v of perRow[i]) out.push(v);
    return out;
  });

  return {
    header: outHeader,
    rows: outRows,
    addedCols,
    firstNewIndex,
    inputRows,
    dataRows,
    computedRows,
    skippedRows,
    blankRows,
  };
}

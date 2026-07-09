// แปลงรูปแบบวันที่ (date normalizer) — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case จริง: packing list / export มีวันที่คนละรูปแบบปนกัน — "10/07/2025", "2025-7-10",
//   "10/7/68" (ปี พ.ศ. สองหลัก), "20250710", Excel serial → อยากได้รูปแบบเดียวกันทั้งคอลัมน์
//   (พร้อมเอาไปเรียง/เทียบ/เข้า Pacred ต่อ)
// ปรัชญา: **ห้ามข้อมูลหาย + ห้ามเดามั่ว** — ช่องที่ parse ไม่ได้ = คงค่าเดิมไว้ (ไม่ทิ้ง ไม่แทนค่ามั่ว) + นับ/โชว์ให้เห็น
//   ความกำกวม DD/MM vs MM/DD = ผู้ใช้ "เลือกเอง" (dayFirst) ไม่เดาให้ · แปลงเสร็จ validate ช่วง (เดือน 1-12, วันในเดือนจริง)

import type { Cell, Row } from "@/lib/reconcile/types";

export type OutputFormat =
  | "YYYY-MM-DD"
  | "DD/MM/YYYY"
  | "MM/DD/YYYY"
  | "DD-MM-YYYY"
  | "D MMM YYYY"
  | "YYYYMMDD";

export const OUTPUT_FORMATS: { id: OutputFormat; label: string; sample: string }[] = [
  { id: "YYYY-MM-DD", label: "ISO (ปี-เดือน-วัน)", sample: "2025-07-10" },
  { id: "DD/MM/YYYY", label: "วัน/เดือน/ปี", sample: "10/07/2025" },
  { id: "MM/DD/YYYY", label: "เดือน/วัน/ปี", sample: "07/10/2025" },
  { id: "DD-MM-YYYY", label: "วัน-เดือน-ปี", sample: "10-07-2025" },
  { id: "D MMM YYYY", label: "วัน เดือนอังกฤษ ปี", sample: "10 Jul 2025" },
  { id: "YYYYMMDD", label: "ติดกัน (ปีเดือนวัน)", sample: "20250710" },
];

export interface DateFmtOptions {
  outputFormat: OutputFormat;
  dayFirst?: boolean; // ตีความ DD/MM (default true) · false = MM/DD (แบบอเมริกา)
  buddhistInput?: boolean; // ปีที่รับเข้าเป็น พ.ศ. (ลบ 543 ก่อน) — ใช้กับ text/ตัวเลขที่พิมพ์เอง
  buddhistOutput?: boolean; // ให้ผลลัพธ์เป็นปี พ.ศ. (บวก 543)
}

export interface DateSample {
  rowIndex: number;
  before: string;
  after: string;
}

export interface DateFmtResult {
  header: string[];
  rows: Row[];
  inputRows: number;
  converted: number; // parse ได้ + ค่าเปลี่ยนจากเดิม
  unchanged: number; // parse ได้ แต่รูปแบบตรงเดิมอยู่แล้ว
  unparsed: number; // parse ไม่ได้ → คงค่าเดิม
  blank: number; // ช่องว่าง → คงไว้
  samples: DateSample[]; // ตัวอย่างที่แปลง (cap 50)
  unparsedSamples: string[]; // ตัวอย่างค่าที่ parse ไม่ได้ (unique, cap 50)
  error?: string; // ถ้ามี = rows คืนของเดิมไม่แตะ
}

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Excel serial → รับเฉพาะช่วงสมเหตุสมผล (ราว ค.ศ. 1954–2064) กันตัวเลขทั่วไป (เช่น ปี/รหัส) โดนตีความมั่ว
const MIN_SERIAL = 20000; // ~1954-10
const MAX_SERIAL = 60000; // ~2064-03

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

// Excel serial (1900 date system, ชดเชยบั๊ก 1900 leap ของ Excel ด้วยฐาน 1899-12-30)
function fromExcelSerial(serial: number): YMD | null {
  if (!Number.isFinite(serial)) return null;
  const whole = Math.floor(serial);
  const ms = Date.UTC(1899, 11, 30) + whole * 86400000;
  const dt = new Date(ms);
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth() + 1;
  const d = dt.getUTCDate();
  if (!validYMD(y, m, d)) return null;
  return { y, m, d };
}

// ขยายปี 2 หลัก + ปรับ พ.ศ.→ค.ศ.
function normalizeYear(rawYear: number, buddhistInput: boolean): number {
  let year = rawYear;
  if (rawYear < 100) {
    // ปี 2 หลัก
    if (buddhistInput) year = 2500 + rawYear; // พ.ศ. เต็ม เช่น 68 → 2568
    else year = rawYear < 70 ? 2000 + rawYear : 1900 + rawYear;
  }
  if (buddhistInput) year = year - 543;
  return year;
}

// parse ค่าช่องเดียว → YMD (ค.ศ.) หรือ null (parse ไม่ได้)
function parseDateCell(cell: Cell, opts: DateFmtOptions): YMD | null {
  const dayFirst = opts.dayFirst !== false;
  const buddhistInput = opts.buddhistInput === true;

  // ตัวเลขล้วน = Excel serial (ค.ศ. อยู่แล้ว ไม่ปรับ พ.ศ.)
  if (typeof cell === "number") {
    if (Number.isInteger(cell) && cell >= MIN_SERIAL && cell <= MAX_SERIAL) {
      return fromExcelSerial(cell);
    }
    return null;
  }
  if (typeof cell !== "string") return null;

  const s = cell.trim();
  if (s === "") return null;

  // รูปแบบติดกัน YYYYMMDD (8 หลักล้วน)
  if (/^\d{8}$/.test(s)) {
    const y = normalizeYear(Number(s.slice(0, 4)), buddhistInput);
    const m = Number(s.slice(4, 6));
    const d = Number(s.slice(6, 8));
    return validYMD(y, m, d) ? { y, m, d } : null;
  }

  // แยกด้วยตัวคั่น / - .
  const parts = s.split(/[/.\-]/).map((p) => p.trim());
  if (parts.length !== 3) return null;
  if (!parts.every((p) => /^\d{1,4}$/.test(p))) return null;
  const nums = parts.map((p) => Number(p));

  let y: number;
  let m: number;
  let d: number;

  if (parts[0].length >= 3) {
    // ปีมาก่อน (YYYY-MM-DD) — ชัดเจน ไม่ต้องใช้ dayFirst
    y = normalizeYear(nums[0], buddhistInput);
    m = nums[1];
    d = nums[2];
  } else {
    // ปีอยู่ท้าย — วัน/เดือน ขึ้นกับ dayFirst
    y = normalizeYear(nums[2], buddhistInput);
    if (dayFirst) {
      d = nums[0];
      m = nums[1];
    } else {
      m = nums[0];
      d = nums[1];
    }
  }

  return validYMD(y, m, d) ? { y, m, d } : null;
}

function formatYMD(ymd: YMD, format: OutputFormat, buddhistOutput: boolean): string {
  const year = buddhistOutput ? ymd.y + 543 : ymd.y;
  const YYYY = String(year).padStart(4, "0");
  const MM = String(ymd.m).padStart(2, "0");
  const DD = String(ymd.d).padStart(2, "0");
  switch (format) {
    case "YYYY-MM-DD":
      return `${YYYY}-${MM}-${DD}`;
    case "DD/MM/YYYY":
      return `${DD}/${MM}/${YYYY}`;
    case "MM/DD/YYYY":
      return `${MM}/${DD}/${YYYY}`;
    case "DD-MM-YYYY":
      return `${DD}-${MM}-${YYYY}`;
    case "D MMM YYYY":
      return `${ymd.d} ${MONTHS_EN[ymd.m - 1]} ${YYYY}`;
    case "YYYYMMDD":
      return `${YYYY}${MM}${DD}`;
    default:
      return `${YYYY}-${MM}-${DD}`;
  }
}

// export ตัวช่วยให้ UI ใช้พรีวิว/เทสได้ตรง ๆ
export function normalizeOneDate(cell: Cell, opts: DateFmtOptions): string | null {
  const ymd = parseDateCell(cell, opts);
  if (!ymd) return null;
  return formatYMD(ymd, opts.outputFormat, opts.buddhistOutput === true);
}

export function normalizeDates(
  header: string[],
  dataRows: Row[],
  col: number,
  opts: DateFmtOptions,
): DateFmtResult {
  const cloneRows: Row[] = dataRows.map((r) => r.slice());
  const base: DateFmtResult = {
    header: header.slice(),
    rows: cloneRows,
    inputRows: dataRows.length,
    converted: 0,
    unchanged: 0,
    unparsed: 0,
    blank: 0,
    samples: [],
    unparsedSamples: [],
  };

  if (col < 0 || col >= header.length) {
    return { ...base, error: "เลือกคอลัมน์วันที่ที่จะแปลง" };
  }

  const out: Row[] = [];
  let converted = 0;
  let unchanged = 0;
  let unparsed = 0;
  let blank = 0;
  const samples: DateSample[] = [];
  const unparsedSet = new Set<string>();
  const unparsedSamples: string[] = [];

  dataRows.forEach((row, i) => {
    const nr = row.slice();
    const cell = col < row.length ? (row[col] ?? null) : null;

    if (isBlankCell(cell)) {
      blank++;
      out.push(nr);
      return;
    }

    const before = String(cell);
    const formatted = normalizeOneDate(cell, opts);

    if (formatted === null) {
      unparsed++;
      if (!unparsedSet.has(before) && unparsedSamples.length < 50) {
        unparsedSet.add(before);
        unparsedSamples.push(before);
      }
      out.push(nr); // คงค่าเดิม (ไม่ทิ้ง ไม่แทนมั่ว)
      return;
    }

    if (formatted === before) {
      unchanged++;
    } else {
      converted++;
      if (samples.length < 50) samples.push({ rowIndex: i, before, after: formatted });
    }
    nr[col] = formatted;
    out.push(nr);
  });

  return {
    header: header.slice(),
    rows: out,
    inputRows: dataRows.length,
    converted,
    unchanged,
    unparsed,
    blank,
    samples,
    unparsedSamples,
  };
}

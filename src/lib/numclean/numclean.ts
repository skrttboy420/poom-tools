// ล้างตัวเลขให้สะอาด (locale/currency-aware number normalizer) — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case จริง: invoice/ไฟล์ต่างเจ้าใส่ตัวเลขคนละแบบ — สัญลักษณ์เงิน ($ € ฿ บาท USD),
//   ตัวคั่นหลักพันแบบยุโรป "1.234,56", วงเล็บติดลบ "(1,234)", ช่องว่าง/NBSP, ต่อท้าย % →
//   อยากได้ number จริงสะอาด ๆ ก่อนเอาไปรวมยอด/เทียบ/เข้า Pacred
// ต่างจาก /clean (แค่ตัด comma US แล้ว Number()) — อันนี้รองรับ EU/สกุลเงิน/วงเล็บ/% ครบ
// ปรัชญา: ไม่เดามั่ว — default = โหมด US (deterministic) · โหมด auto = ผู้ใช้เลือกเอง ·
//   อ่านตัวเลขไม่ได้ (เหลืออักขระแปลก) = เว้นว่าง โชว์ให้เห็น ไม่เดา · ทุกแถวออกครบ ·
//   default = เติมคอลัมน์ใหม่ (ไม่ทับของเดิม) · โหมดแทนที่ = opt-in

import type { Cell, Row } from "@/lib/reconcile/types";

// us: comma=หลักพัน, dot=ทศนิยม (1,234.56) · eu: dot=หลักพัน, comma=ทศนิยม (1.234,56) ·
// auto: เดาแบบ deterministic (ตัวคั่นตัวท้ายสุด=ทศนิยม ถ้ามีทั้งคู่ · ตัวเดียว: >1 ครั้ง หรือ 3 หลักท้าย=หลักพัน)
export type DecimalMode = "us" | "eu" | "auto";

export type NumRowStatus =
  | "cleaned" // เป็นข้อความที่ล้างเป็นตัวเลขได้
  | "already" // เป็น number อยู่แล้ว
  | "unparseable" // มีค่าแต่อ่านเป็นตัวเลขไม่ได้ → เว้นว่าง
  | "blank"; // ช่องว่าง

export interface NumCleanOptions {
  col: number;
  decimalMode?: DecimalMode; // default "us"
  percentToFraction?: boolean; // ต่อท้าย % → หารร้อย (50% → 0.5) · default false (คงค่า 50)
  round?: number | null; // ปัดทศนิยม · null = ไม่ปัด
  mode?: "add" | "replace"; // default add (เติมคอลัมน์ใหม่)
  colName?: string; // ชื่อคอลัมน์ใหม่ (โหมดเติม)
}

export interface NumCleanSample {
  before: string;
  after: Cell;
  status: NumRowStatus;
}

export interface NumCleanResult {
  header: Row;
  rows: Row[];
  addedCols: string[];
  firstNewIndex: number;
  replacedCol: number;
  inputRows: number;
  dataRows: number;
  cleanedRows: number;
  alreadyRows: number;
  unparseableRows: number;
  blankRows: number;
  samples: NumCleanSample[]; // cap 50 (โชว์ก่อน→หลัง)
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
function cellAt(row: Row, col: number): Cell {
  if (col < 0) return null;
  return col < row.length ? row[col] : null;
}
function cellToStr(v: Cell): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function cleanFloat(v: number, digits: number): number {
  const d = Math.min(Math.max(digits, 0), 12);
  const f = Math.pow(10, d);
  return Math.round((v + (v >= 0 ? 1 : -1) * Number.EPSILON) * f) / f;
}
function applyRound(v: number, round: number | null | undefined): number {
  if (round === null || round === undefined) return cleanFloat(v, 12);
  const d = Math.max(0, Math.floor(round));
  const f = Math.pow(10, d);
  return cleanFloat(Math.round(v * f) / f, d + 2);
}

// สัญลักษณ์เงิน + รหัสสกุลเงินที่เจอบ่อยในงาน cargo (ตัดทิ้งก่อนอ่านตัวเลข)
const CURRENCY_SYMBOLS = /[฿$€£¥₩₫₱]/g;
// เรียงยาวก่อนสั้นกัน match ซ้อน · case-insensitive สำหรับตัวอังกฤษ
const CURRENCY_CODES = [
  "ดอลลาร์",
  "ดอลล่าร์",
  "usd",
  "eur",
  "gbp",
  "jpy",
  "cny",
  "rmb",
  "krw",
  "thb",
  "บาท",
  "ยูโร",
  "หยวน",
  "เยน",
];
const CURRENCY_CODE_RE = new RegExp(CURRENCY_CODES.slice().sort((a, b) => b.length - a.length).join("|"), "gi");

export interface ParseNumResult {
  ok: boolean;
  value: number | null;
}

// อ่าน "แกนตัวเลข" ที่เหลือแต่ [0-9 . ,] ตามโหมดที่เลือก → number หรือ null
function parseCore(core: string, mode: DecimalMode): number | null {
  if (!/\d/.test(core)) return null;
  const hasDot = core.includes(".");
  const hasComma = core.includes(",");
  let normalized: string;

  if (hasDot && hasComma) {
    const lastDot = core.lastIndexOf(".");
    const lastComma = core.lastIndexOf(",");
    const decimalSep: "." | "," = mode === "us" ? "." : mode === "eu" ? "," : lastDot > lastComma ? "." : ",";
    const groupSep = decimalSep === "." ? "," : ".";
    let out = core.split(groupSep).join(""); // ลบตัวคั่นหลักพัน
    out = out.split(decimalSep).join("."); // ตัวคั่นทศนิยม → จุด
    if ((out.match(/\./g) || []).length > 1) return null; // เหลือจุดมากกว่า 1 = ผิดรูป
    normalized = out;
  } else if (hasDot || hasComma) {
    const sep = hasDot ? "." : ",";
    const count = core.split(sep).length - 1;
    let role: "decimal" | "group";
    if (mode === "us") role = sep === "," ? "group" : "decimal";
    else if (mode === "eu") role = sep === "." ? "group" : "decimal";
    else {
      // auto: หลายตัว = หลักพัน · ตัวเดียวแต่ตามด้วย 3 หลักพอดี = หลักพัน · ไม่งั้น = ทศนิยม
      if (count > 1) role = "group";
      else role = core.slice(core.lastIndexOf(sep) + 1).length === 3 ? "group" : "decimal";
    }
    if (role === "group") {
      normalized = core.split(sep).join("");
    } else {
      if (count > 1) return null; // ตัวคั่นทศนิยมมีได้ตัวเดียว
      normalized = core.split(sep).join(".");
    }
  } else {
    normalized = core;
  }

  if (!/^\d*\.?\d*$/.test(normalized) || !/\d/.test(normalized)) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

// ล้างค่า 1 ช่อง → number หรือ null (ไม่เดามั่ว: เหลืออักขระแปลก = null)
export function cleanNumber(cell: Cell, opts: { decimalMode?: DecimalMode; percentToFraction?: boolean }): ParseNumResult {
  if (typeof cell === "number") return Number.isFinite(cell) ? { ok: true, value: cell } : { ok: false, value: null };
  if (typeof cell === "boolean" || cell === null || cell === undefined) return { ok: false, value: null };

  let s = String(cell).trim();
  if (s === "") return { ok: false, value: null };

  const mode: DecimalMode = opts.decimalMode ?? "us";

  // วงเล็บติดลบแบบบัญชี (1,234) → ติดลบ
  let negParen = false;
  const paren = s.match(/^\((.+)\)$/);
  if (paren) {
    negParen = true;
    s = paren[1].trim();
  }

  // ตัดสัญลักษณ์/รหัสสกุลเงิน + ช่องว่างทุกชนิด (\s ครอบ NBSP/unicode space)
  s = s.replace(CURRENCY_SYMBOLS, "").replace(CURRENCY_CODE_RE, "").replace(/\s/g, "");

  // เปอร์เซ็นต์ต่อท้าย
  let hadPercent = false;
  if (s.endsWith("%")) {
    hadPercent = true;
    s = s.slice(0, -1);
  }

  // เครื่องหมายนำหน้า
  let sign = "";
  const sm = s.match(/^([+-])/);
  if (sm) {
    sign = sm[1];
    s = s.slice(1);
  }

  // เหลือได้เฉพาะ [0-9 . ,] เท่านั้น — ไม่งั้น = อ่านไม่ได้ (ไม่เดา)
  if (s === "" || /[^\d.,]/.test(s)) return { ok: false, value: null };

  const core = parseCore(s, mode);
  if (core === null) return { ok: false, value: null };

  let value = core; // core ≥ 0 เสมอ (ไม่มีเครื่องหมายใน core)
  if (hadPercent && opts.percentToFraction) value = value / 100;

  let negative = false;
  if (sign === "-") negative = !negative;
  if (negParen) negative = !negative;
  if (negative) value = -value;

  return { ok: true, value };
}

export function analyzeNumClean(header: Row, allRows: Row[], opts: NumCleanOptions): NumCleanResult {
  const inputRows = allRows.length;
  const rows = allRows.filter(isDataRow);
  const dataRows = rows.length;
  const width = Math.max(header.length, ...rows.map((r) => r.length), 1);

  const base = (msg: string): NumCleanResult => ({
    header: header.slice(),
    rows: rows.map((r) => r.slice()),
    addedCols: [],
    firstNewIndex: -1,
    replacedCol: -1,
    inputRows,
    dataRows,
    cleanedRows: 0,
    alreadyRows: 0,
    unparseableRows: 0,
    blankRows: 0,
    samples: [],
    error: msg,
  });

  if (dataRows === 0) return base("ไม่มีแถวข้อมูล");
  if (opts.col < 0 || opts.col >= width) return base("เลือกคอลัมน์ที่จะล้างตัวเลขให้อยู่ในช่วง");

  const parseOpts = { decimalMode: opts.decimalMode ?? "us", percentToFraction: opts.percentToFraction };

  let cleanedRows = 0;
  let alreadyRows = 0;
  let unparseableRows = 0;
  let blankRows = 0;
  const samples: NumCleanSample[] = [];

  const outVals: Cell[] = rows.map((r) => {
    const cell = cellAt(r, opts.col);
    const before = cellToStr(cell);
    let after: Cell = null;
    let status: NumRowStatus;

    if (isBlankCell(cell)) {
      status = "blank";
      blankRows++;
    } else if (typeof cell === "number" && Number.isFinite(cell)) {
      after = applyRound(cell, opts.round);
      status = "already";
      alreadyRows++;
    } else {
      const res = cleanNumber(cell, parseOpts);
      if (res.ok && res.value !== null) {
        after = applyRound(res.value, opts.round);
        status = "cleaned";
        cleanedRows++;
      } else {
        status = "unparseable";
        unparseableRows++;
      }
    }

    if (samples.length < 50 && status !== "blank") {
      samples.push({ before, after, status });
    }
    return after;
  });

  const replace = opts.mode === "replace";
  const colName =
    opts.colName && opts.colName.trim() !== ""
      ? opts.colName.trim()
      : `${cellToStr(cellAt(header, opts.col)) || `คอลัมน์ ${opts.col + 1}`} (ตัวเลข)`;

  if (replace) {
    const outHeader = header.slice();
    while (outHeader.length < width) outHeader.push(null);
    const outRows: Row[] = rows.map((r, i) => {
      const out = r.slice();
      while (out.length < width) out.push(null);
      if (outVals[i] !== null) out[opts.col] = outVals[i]; // ไม่ทับด้วย null (คงค่าเดิมถ้าอ่านไม่ได้)
      return out;
    });
    return {
      header: outHeader,
      rows: outRows,
      addedCols: [],
      firstNewIndex: -1,
      replacedCol: opts.col,
      inputRows,
      dataRows,
      cleanedRows,
      alreadyRows,
      unparseableRows,
      blankRows,
      samples,
    };
  }

  const outHeader = header.slice();
  while (outHeader.length < width) outHeader.push(null);
  const firstNewIndex = outHeader.length;
  outHeader.push(colName);

  const outRows: Row[] = rows.map((r, i) => {
    const out = r.slice();
    while (out.length < width) out.push(null);
    out.push(outVals[i]);
    return out;
  });

  return {
    header: outHeader,
    rows: outRows,
    addedCols: [colName],
    firstNewIndex,
    replacedCol: -1,
    inputRows,
    dataRows,
    cleanedRows,
    alreadyRows,
    unparseableRows,
    blankRows,
    samples,
  };
}

export const STATUS_LABEL: Record<NumRowStatus, string> = {
  cleaned: "ล้างแล้ว",
  already: "เป็นตัวเลขอยู่แล้ว",
  unparseable: "อ่านเป็นตัวเลขไม่ได้ (เว้นว่าง)",
  blank: "ว่าง",
};

// จัดรูปแบบตัวเลขให้สวย (number → display string) — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case จริง: เอาผลจาก /num-clean /calc-col /allocate /chargeable (number ดิบ) มาจัดรูปสำหรับใบเสนอราคา/ใบแจ้งหนี้ ·
//   ใส่ตัวคั่นหลักพัน (1,234.56 US / 1.234,56 EU / 1 234.56) · ทศนิยมคงที่ · สัญลักษณ์เงินหน้า/ท้าย (฿ $ / บาท / kg) ·
//   ติดลบสไตล์บัญชี (1,000.00) · เครื่องหมาย +/-
// ต่างจาก /num-clean (ข้อความเลอะ → number, ทิศตรงข้าม) · /round (ปัดค่าแต่ยังเป็น number) · /baht-text (อ่านเป็นคำไทย) ·
//   /template (mail-merge ค่าดิบ) — อันนี้ = number → "string ที่จัดรูปแล้ว" สำหรับแสดง/ส่งออก
// ปรัชญา: ช่องไม่ใช่ตัวเลข = เว้นว่าง (add) / คงค่าเดิม (replace) ไม่เดามั่ว · ทุกแถวออกครบ · default = เติมคอลัมน์ใหม่ (ไม่ทับของเดิม)

import type { Cell, Row } from "@/lib/reconcile/types";

export type ThousandsSep = "comma" | "dot" | "space" | "none";
export type DecimalSep = "dot" | "comma";
export type NegativeStyle = "minus" | "parens";
export type FormatMode = "add" | "replace";

export interface NumFormatOptions {
  col: number;
  decimals?: number; // จำนวนทศนิยมคงที่ (default 2, floored, 0–20)
  thousandsSep?: ThousandsSep; // default "comma"
  decimalSep?: DecimalSep; // default "dot"
  prefix?: string; // เช่น "฿" "$" "USD " (default "")
  suffix?: string; // เช่น " kg" " บาท" "%" (default "")
  negativeStyle?: NegativeStyle; // default "minus"
  plusSign?: boolean; // แสดง + หน้าค่าบวก (default false)
  mode?: FormatMode; // default "add"
  colName?: string; // ชื่อคอลัมน์ใหม่ (default "${หัวเดิม} (จัดรูป)")
}

export interface NumFormatSample {
  before: Cell;
  after: Cell;
  skipped: boolean; // true = ช่องไม่ใช่ตัวเลข (ข้าม)
}

export interface NumFormatResult {
  header: Row;
  rows: Row[];
  addedCols: string[];
  firstNewIndex: number;
  replacedCol: number; // -1 ถ้าโหมด add
  inputRows: number;
  dataRows: number;
  formattedRows: number;
  skippedRows: number; // ช่องไม่ใช่ตัวเลข
  blankRows: number;
  samples: NumFormatSample[];
  error?: string;
}

const SEP_CHAR: Record<ThousandsSep, string> = { comma: ",", dot: ".", space: " ", none: "" };
const DEC_CHAR: Record<DecimalSep, string> = { dot: ".", comma: "," };

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
// แปลงเป็นตัวเลข (ตัด comma หลักพันแบบ US + trim) · boolean/Infinity/ว่าง → null (ไม่เดามั่ว)
function parseNumeric(v: Cell): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.replace(/,/g, "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function clampDecimals(d: number | undefined): number {
  if (d == null || !Number.isFinite(d)) return 2;
  return Math.min(20, Math.max(0, Math.floor(d)));
}
// ใส่ตัวคั่นหลักพันให้สตริงตัวเลขล้วน (ทีละ 3 หลักจากขวา)
function groupThousands(intDigits: string, sep: string): string {
  if (sep === "") return intDigits;
  return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

// จัดรูป number 1 ตัว → string (export ไว้เทส/พรีวิว)
export function formatNumber(value: number, opts: NumFormatOptions): string {
  if (!Number.isFinite(value)) return "";
  const decimals = clampDecimals(opts.decimals);
  const tSep = SEP_CHAR[opts.thousandsSep ?? "comma"];
  const dSep = DEC_CHAR[opts.decimalSep ?? "dot"];
  const negative = value < 0;
  const abs = Math.abs(value);
  const fixed = abs.toFixed(decimals); // "1234.56"
  const dotIdx = fixed.indexOf(".");
  const intPart = dotIdx === -1 ? fixed : fixed.slice(0, dotIdx);
  const fracPart = dotIdx === -1 ? "" : fixed.slice(dotIdx + 1);
  const grouped = groupThousands(intPart, tSep);
  let body = grouped + (fracPart ? dSep + fracPart : "");
  body = (opts.prefix ?? "") + body + (opts.suffix ?? "");
  // -0.00 ที่ปัดแล้วเป็นศูนย์ = ไม่ถือว่าติดลบ
  const showNeg = negative && Number(fixed) !== 0;
  if (showNeg) {
    body = opts.negativeStyle === "parens" ? `(${body})` : `-${body}`;
  } else if (opts.plusSign && value > 0) {
    body = `+${body}`;
  }
  return body;
}

export function analyzeNumFormat(header: Row, allRows: Row[], opts: NumFormatOptions): NumFormatResult {
  const inputRows = allRows.length;
  const rows = allRows.filter(isDataRow);
  const dataRows = rows.length;
  const width = Math.max(header.length, ...rows.map((r) => r.length), 1);

  const base = (msg: string): NumFormatResult => ({
    header: header.slice(),
    rows: rows.map((r) => r.slice()),
    addedCols: [],
    firstNewIndex: -1,
    replacedCol: -1,
    inputRows,
    dataRows,
    formattedRows: 0,
    skippedRows: 0,
    blankRows: 0,
    samples: [],
    error: msg,
  });

  if (dataRows === 0) return base("ไม่มีแถวข้อมูล");
  if (opts.col < 0 || opts.col >= width) return base("เลือกคอลัมน์ที่จะจัดรูปแบบให้อยู่ในช่วง");

  const tSepKind = opts.thousandsSep ?? "comma";
  const dSepKind = opts.decimalSep ?? "dot";
  if (tSepKind !== "none" && SEP_CHAR[tSepKind] === DEC_CHAR[dSepKind]) {
    return base("ตัวคั่นหลักพันกับจุดทศนิยมต้องเป็นคนละตัว");
  }

  const mode: FormatMode = opts.mode === "replace" ? "replace" : "add";

  const samples: NumFormatSample[] = [];
  let formattedRows = 0;
  let skippedRows = 0;
  let blankRows = 0;

  const produced: Cell[] = rows.map((r) => {
    const cell = cellAt(r, opts.col);
    if (isBlankCell(cell)) {
      blankRows++;
      return mode === "replace" ? cell : null;
    }
    const n = parseNumeric(cell);
    if (n === null) {
      skippedRows++;
      if (samples.length < 50) samples.push({ before: cell, after: mode === "replace" ? cell : null, skipped: true });
      return mode === "replace" ? cell : null;
    }
    const out = formatNumber(n, opts);
    formattedRows++;
    if (samples.length < 50) samples.push({ before: cell, after: out, skipped: false });
    return out;
  });

  if (mode === "replace") {
    const outRows: Row[] = rows.map((r, i) => {
      const out = r.slice();
      while (out.length < width) out.push(null);
      out[opts.col] = produced[i];
      return out;
    });
    return {
      header: header.slice(),
      rows: outRows,
      addedCols: [],
      firstNewIndex: -1,
      replacedCol: opts.col,
      inputRows,
      dataRows,
      formattedRows,
      skippedRows,
      blankRows,
      samples,
    };
  }

  // add mode
  const srcName = opts.col < header.length ? header[opts.col] : null;
  const srcLabel = srcName === null || srcName === undefined || String(srcName).trim() === "" ? `คอลัมน์ ${opts.col + 1}` : String(srcName).trim();
  const colName = opts.colName && opts.colName.trim() !== "" ? opts.colName.trim() : `${srcLabel} (จัดรูป)`;

  const outHeader = header.slice();
  while (outHeader.length < width) outHeader.push(null);
  const firstNewIndex = outHeader.length;
  outHeader.push(colName);

  const outRows: Row[] = rows.map((r, i) => {
    const out = r.slice();
    while (out.length < width) out.push(null);
    out.push(produced[i]);
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
    formattedRows,
    skippedRows,
    blankRows,
    samples,
  };
}

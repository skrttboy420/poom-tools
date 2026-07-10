// ตาราง → ข้อความ (Markdown / จัดคอลัมน์ monospace / TSV) — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case จริง: อยาก paste ตารางเข้า PR/README/docs/แชท (Markdown), หรือทำเป็นตารางอ่านง่ายในโน้ต (จัดคอลัมน์),
//   หรือก๊อปไปวางใน Excel/Sheets (TSV — วางแล้วแตกคอลัมน์อัตโนมัติ)
// ปรัชญา: **แค่จัดรูปเป็นข้อความ ไม่แก้ค่าจริง** · ไม่ทำแถวหาย (ยกเว้นตัดแถวว่างทั้งแถวก่อน — เลือกได้)
//   escape ให้ปลอดภัยตามรูปแบบ (Markdown `|`→`\|`, ขึ้นบรรทัด→`<br>` · TSV tab/newline→ช่องว่าง) เพื่อไม่ให้ตารางเพี้ยน

import type { Cell, Row } from "@/lib/reconcile/types";

export type TableTextFormat = "markdown" | "aligned" | "tsv";
export const TABLE_TEXT_FORMATS: TableTextFormat[] = ["markdown", "aligned", "tsv"];
export const TABLE_TEXT_LABEL: Record<TableTextFormat, string> = {
  markdown: "Markdown (paste เข้า PR/README/แชท)",
  aligned: "จัดคอลัมน์ (monospace — อ่านง่าย)",
  tsv: "TSV (วางเข้า Excel/Sheets แตกคอลัมน์เอง)",
};

export interface TableTextOptions {
  format?: TableTextFormat; // default markdown
  alignNumericRight?: boolean; // ชิดขวาคอลัมน์ตัวเลข (markdown + aligned) — default true
  includeHeader?: boolean; // รวมแถวหัวตาราง — default true
  dropBlankRows?: boolean; // ตัดแถวว่างทั้งแถวก่อนแปลง — default true
  trim?: boolean; // trim string ก่อน "เช็คว่าว่าง/เดาตัวเลข" (ไม่แก้ค่าจริงที่แสดง) — default true
}

export interface TableTextResult {
  text: string;
  format: TableTextFormat;
  outputRows: number; // จำนวนแถวข้อมูล (ไม่รวมหัว) ที่ออกมา
  outputCols: number;
  numericCols: number[]; // index คอลัมน์ที่ถือว่าเป็นตัวเลข (ชิดขวา)
  droppedBlankRows: number;
  error?: string;
}

function isBlankCell(v: Cell, trim: boolean): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return (trim ? v.trim() : v) === "";
  return false;
}

function isDataRow(row: Row, trim: boolean): boolean {
  return row.some((c) => !isBlankCell(c, trim));
}

// ค่า → ข้อความสำหรับแสดง (ตัวเลขคง canonical ไม่ใส่ comma, bool→true/false)
function displayStr(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (typeof v === "boolean") return String(v);
  return v;
}

// เดาว่าเป็นตัวเลข (ตัด comma + trim ก่อน) — ใช้จับคอลัมน์ตัวเลขเพื่อชิดขวา
function looksNumeric(s: string): boolean {
  const t = s.trim().replace(/,/g, "");
  if (t === "") return false;
  return Number.isFinite(Number(t));
}

// ความกว้างเป็น "จำนวน code point" (กัน surrogate pair เช่น emoji นับเกิน)
function displayWidth(s: string): number {
  return Array.from(s).length;
}

function gridWidth(header: Row, rows: Row[], includeHeader: boolean): number {
  let w = includeHeader ? header.length : 0;
  for (const r of rows) if (r.length > w) w = r.length;
  return w;
}

function cellText(row: Row, col: number): string {
  return col < row.length ? displayStr(row[col] ?? null) : "";
}

// ---------- Markdown ----------
function escapeMd(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\r\n|\r|\n/g, "<br>");
}

function buildMarkdown(
  header: Row,
  rows: Row[],
  width: number,
  numeric: Set<number>,
  includeHeader: boolean,
  alignRight: boolean,
): string {
  const head: string[] = [];
  for (let c = 0; c < width; c++) {
    head.push(includeHeader ? escapeMd(cellText(header, c)) : "");
  }
  const sep: string[] = [];
  for (let c = 0; c < width; c++) {
    sep.push(alignRight && numeric.has(c) ? "---:" : "---");
  }
  const lines: string[] = [];
  lines.push(`| ${head.join(" | ")} |`);
  lines.push(`| ${sep.join(" | ")} |`);
  for (const r of rows) {
    const cells: string[] = [];
    for (let c = 0; c < width; c++) cells.push(escapeMd(cellText(r, c)));
    lines.push(`| ${cells.join(" | ")} |`);
  }
  return lines.join("\n");
}

// ---------- Aligned monospace ----------
function padTo(s: string, target: number, right: boolean): string {
  const pad = " ".repeat(Math.max(0, target - displayWidth(s)));
  return right ? pad + s : s + pad;
}

function buildAligned(
  header: Row,
  rows: Row[],
  width: number,
  numeric: Set<number>,
  includeHeader: boolean,
  alignRight: boolean,
): string {
  // แทน newline ในเซลล์ด้วยช่องว่าง (จัดคอลัมน์แบบบรรทัดเดียว)
  const clean = (s: string) => s.replace(/\r\n|\r|\n/g, " ");
  const colW: number[] = new Array(width).fill(0);
  for (let c = 0; c < width; c++) {
    if (includeHeader) colW[c] = displayWidth(clean(cellText(header, c)));
    for (const r of rows) {
      const w = displayWidth(clean(cellText(r, c)));
      if (w > colW[c]) colW[c] = w;
    }
  }
  const rowToLine = (r: Row) => {
    const cells: string[] = [];
    for (let c = 0; c < width; c++) {
      cells.push(padTo(clean(cellText(r, c)), colW[c], alignRight && numeric.has(c)));
    }
    return cells.join("  ").replace(/\s+$/, "");
  };
  const lines: string[] = [];
  if (includeHeader) {
    const cells: string[] = [];
    for (let c = 0; c < width; c++) {
      cells.push(padTo(clean(cellText(header, c)), colW[c], alignRight && numeric.has(c)));
    }
    lines.push(cells.join("  ").replace(/\s+$/, ""));
    // เส้นคั่นใต้หัว
    const dash: string[] = [];
    for (let c = 0; c < width; c++) dash.push("-".repeat(Math.max(1, colW[c])));
    lines.push(dash.join("  ").replace(/\s+$/, ""));
  }
  for (const r of rows) lines.push(rowToLine(r));
  return lines.join("\n");
}

// ---------- TSV ----------
function escapeTsv(s: string): string {
  return s.replace(/\t/g, " ").replace(/\r\n|\r|\n/g, " ");
}

function buildTsv(header: Row, rows: Row[], width: number, includeHeader: boolean): string {
  const lines: string[] = [];
  if (includeHeader) {
    const cells: string[] = [];
    for (let c = 0; c < width; c++) cells.push(escapeTsv(cellText(header, c)));
    lines.push(cells.join("\t"));
  }
  for (const r of rows) {
    const cells: string[] = [];
    for (let c = 0; c < width; c++) cells.push(escapeTsv(cellText(r, c)));
    lines.push(cells.join("\t"));
  }
  return lines.join("\n");
}

export function tableToText(
  header: Row,
  dataRows: Row[],
  opts: TableTextOptions = {},
): TableTextResult {
  const format: TableTextFormat = opts.format ?? "markdown";
  const alignRight = opts.alignNumericRight !== false;
  const includeHeader = opts.includeHeader !== false;
  const dropBlankRows = opts.dropBlankRows !== false;
  const trim = opts.trim !== false;

  const rows = dropBlankRows ? dataRows.filter((r) => isDataRow(r, trim)) : dataRows.slice();
  const droppedBlankRows = dataRows.length - rows.length;

  const base: Omit<TableTextResult, "error"> = {
    text: "",
    format,
    outputRows: 0,
    outputCols: 0,
    numericCols: [],
    droppedBlankRows,
  };

  const width = gridWidth(header, rows, includeHeader);
  if (width === 0 || (!includeHeader && rows.length === 0)) {
    return { ...base, error: "ไม่มีข้อมูลให้แปลง (ตารางว่าง)" };
  }

  // เดาคอลัมน์ตัวเลข: ในบรรดาช่องที่ "ไม่ว่าง" ต้องเป็นตัวเลข ≥ ครึ่งหนึ่ง (และมีอย่างน้อย 1 ช่อง)
  const numeric = new Set<number>();
  for (let c = 0; c < width; c++) {
    let filled = 0;
    let num = 0;
    for (const r of rows) {
      const s = cellText(r, c);
      if (isBlankCell(s, trim)) continue;
      filled += 1;
      if (looksNumeric(s)) num += 1;
    }
    if (filled > 0 && num >= filled / 2) numeric.add(c);
  }

  let text: string;
  switch (format) {
    case "aligned":
      text = buildAligned(header, rows, width, numeric, includeHeader, alignRight);
      break;
    case "tsv":
      text = buildTsv(header, rows, width, includeHeader);
      break;
    case "markdown":
    default:
      text = buildMarkdown(header, rows, width, numeric, includeHeader, alignRight);
      break;
  }

  return {
    text,
    format,
    outputRows: rows.length,
    outputCols: width,
    numericCols: Array.from(numeric).sort((a, b) => a - b),
    droppedBlankRows,
  };
}

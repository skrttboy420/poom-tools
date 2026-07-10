// ส่องชนิดข้อมูลแต่ละคอลัมน์ (Column Profiler) — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case จริง: ก่อนเทียบ/clean/เข้า Pacred อยากรู้ว่า "ไฟล์นี้แต่ละคอลัมน์เป็นชนิดอะไร"
//   คอลัมน์น้ำหนักมีค่าที่ไม่ใช่ตัวเลขปนไหม? · คอลัมน์ tracking มีเลข 0 นำหน้าที่ Excel อาจตัดหายไหม?
//   · คอลัมน์นี้มีค่ากี่แบบ (distinct)? ความยาวเท่ากันไหม? → รู้จักไฟล์ก่อนลงมือ
// ต่างจาก /stats (สรุปยอด "ตัวเลข") — อันนี้เดา "ชนิด" ทุกคอลัมน์ + ชี้ค่าที่ผิดแปลกจากพวก
// ปรัชญา:
//   - **อ่านอย่างเดียว ไม่แก้ข้อมูล** (แค่รายงาน)
//   - เดาชนิดแบบ deterministic (regex ชัดเจน) · date เดาแบบระวัง (จับเฉพาะรูปแบบชัด กัน false positive)
//   - โชว์ "ค่าที่ไม่เข้าพวก" (ชนิดต่างจาก dominant) เพื่อจับ typo/ข้อมูลปน · ตัดแถวว่างทั้งแถวก่อนวิเคราะห์

import type { Cell, Row } from "@/lib/reconcile/types";

export type CellType = "integer" | "decimal" | "boolean" | "date" | "text" | "blank";

export interface OddValue {
  row: number; // index แถวข้อมูล (0-based ตาม dataRows เดิม)
  value: string;
  type: CellType;
}

export interface ColumnProfile {
  index: number;
  name: string;
  total: number; // ช่องที่พิจารณา (จากแถวที่ไม่ว่างทั้งแถว)
  filled: number; // ช่องที่มีค่า
  blank: number; // ช่องว่าง
  typeCounts: Record<CellType, number>; // นับต่อชนิด (เฉพาะช่องมีค่า; blank แยกไว้ที่ blank)
  dominantType: CellType; // ชนิดที่พบบ่อยสุด (ในช่องมีค่า) · "blank" ถ้าไม่มีค่าเลย
  distinct: number; // จำนวนค่าไม่ซ้ำ (เทียบแบบ trim)
  minLen: number; // ความยาวสั้นสุดของค่ามีค่า (0 ถ้าไม่มี)
  maxLen: number;
  hasLeadingZero: boolean; // มีค่าแบบ "007" (เลข 0 นำหน้า + หลายหลัก) → เตือน Excel อาจตัดหาย
  numericLike: boolean; // dominant เป็น integer/decimal
  sampleValues: string[]; // ตัวอย่างค่าไม่ซ้ำ (สูงสุด 5)
  oddValues: OddValue[]; // ค่าที่ชนิดต่างจาก dominant (cap 20) — จับ typo/ข้อมูลปน
}

export interface SchemaResult {
  columns: ColumnProfile[];
  inputRows: number; // แถว input ทั้งหมด
  dataRows: number; // แถวหลังตัดแถวว่างทั้งแถว
  error?: string;
}

const ODD_CAP = 20;
const SAMPLE_CAP = 5;

// ลำดับความสำคัญเวลาคะแนนเท่ากัน (เจาะจงกว่า → มาก่อน)
const TYPE_PRIORITY: CellType[] = ["boolean", "date", "integer", "decimal", "text"];

function isBlankCell(v: Cell): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

function isDataRow(row: Row): boolean {
  return row.some((c) => !isBlankCell(c));
}

const INT_RE = /^[+-]?\d+$/;
const DEC_RE = /^[+-]?(?:\d+\.\d*|\.\d+|\d+\.\d+)$/;
// วันที่: จับเฉพาะรูปแบบชัด กัน false positive (ไม่จับ 8 หลักล้วน เพราะอาจเป็นรหัส)
const ISO_DATE_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const DMY_DATE_RE = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/;

function validMonthDay(m: number, d: number): boolean {
  return m >= 1 && m <= 12 && d >= 1 && d <= 31;
}

function looksLikeDate(s: string): boolean {
  const iso = ISO_DATE_RE.exec(s);
  if (iso) {
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    return validMonthDay(m, d);
  }
  const dmy = DMY_DATE_RE.exec(s);
  if (dmy) {
    // กำกวม DD/MM vs MM/DD → ยอมรับถ้า "อย่างน้อยการตีความหนึ่ง" ถูกต้อง
    const a = Number(dmy[1]);
    const b = Number(dmy[2]);
    return validMonthDay(b, a) || validMonthDay(a, b);
  }
  return false;
}

// เดาชนิดของ 1 ช่อง (ต้องไม่ใช่ช่องว่าง)
export function classifyCell(v: Cell): CellType {
  if (isBlankCell(v)) return "blank";
  if (typeof v === "boolean") return "boolean";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "text";
    return Number.isInteger(v) ? "integer" : "decimal";
  }
  const s = String(v).trim();
  const low = s.toLowerCase();
  if (low === "true" || low === "false") return "boolean";
  // date ต้องเช็คก่อน integer/decimal (เลขคั่น / - . อาจโดน DEC ไม่ตรงอยู่แล้ว แต่กันไว้)
  if (looksLikeDate(s)) return "date";
  if (INT_RE.test(s)) return "integer";
  if (DEC_RE.test(s)) return "decimal";
  return "text";
}

// มีเลข 0 นำหน้าแล้วตามด้วยหลักอื่น (เช่น "007", "0123") — เป็นสัญญาณว่า Excel/CSV อาจตัด 0 หาย
function isLeadingZero(s: string): boolean {
  return /^0\d+$/.test(s);
}

function emptyCounts(): Record<CellType, number> {
  return { integer: 0, decimal: 0, boolean: 0, date: 0, text: 0, blank: 0 };
}

export function profileColumns(header: string[], allRows: Row[]): SchemaResult {
  const inputRows = allRows.length;
  const rows = allRows.filter(isDataRow);
  const dataRows = rows.length;

  // ความกว้าง = max(header, แถวที่กว้างสุด)
  let width = header.length;
  for (const r of rows) if (r.length > width) width = r.length;

  if (width === 0) {
    return { columns: [], inputRows, dataRows, error: "ไม่มีคอลัมน์ให้วิเคราะห์" };
  }

  const columns: ColumnProfile[] = [];

  for (let c = 0; c < width; c++) {
    const counts = emptyCounts();
    let filled = 0;
    let blank = 0;
    let minLen = Infinity;
    let maxLen = 0;
    let hasLeadingZero = false;
    const distinctSet = new Set<string>();
    const samples: string[] = [];
    const cellTypes: { row: number; type: CellType; value: string }[] = [];

    for (let ri = 0; ri < rows.length; ri++) {
      const raw = rows[ri][c] ?? null;
      if (isBlankCell(raw)) {
        blank++;
        continue;
      }
      filled++;
      const type = classifyCell(raw);
      counts[type]++;
      const s = typeof raw === "string" ? raw : String(raw);
      const trimmed = s.trim();
      const len = Array.from(trimmed).length;
      if (len < minLen) minLen = len;
      if (len > maxLen) maxLen = len;
      if (isLeadingZero(trimmed)) hasLeadingZero = true;
      if (!distinctSet.has(trimmed)) {
        distinctSet.add(trimmed);
        if (samples.length < SAMPLE_CAP) samples.push(trimmed);
      }
      cellTypes.push({ row: ri, type, value: trimmed });
    }

    // dominant = ชนิดที่นับได้มากสุด (ในช่องมีค่า) · tie-break ตาม TYPE_PRIORITY
    let dominant: CellType = "blank";
    if (filled > 0) {
      let bestCount = -1;
      for (const t of TYPE_PRIORITY) {
        if (counts[t] > bestCount) {
          bestCount = counts[t];
          dominant = t;
        }
      }
    }

    const numericLike = dominant === "integer" || dominant === "decimal";

    // ค่าที่ไม่เข้าพวก (ชนิดต่างจาก dominant) — จับ typo/ข้อมูลปน
    const oddValues: OddValue[] = [];
    if (filled > 0 && dominant !== "blank") {
      for (const ct of cellTypes) {
        if (ct.type !== dominant) {
          oddValues.push({ row: ct.row, value: ct.value, type: ct.type });
          if (oddValues.length >= ODD_CAP) break;
        }
      }
    }

    const name = header[c] !== undefined && String(header[c]).trim() !== "" ? String(header[c]) : `คอลัมน์ ${c + 1}`;

    columns.push({
      index: c,
      name,
      total: filled + blank,
      filled,
      blank,
      typeCounts: counts,
      dominantType: dominant,
      distinct: distinctSet.size,
      minLen: minLen === Infinity ? 0 : minLen,
      maxLen,
      hasLeadingZero,
      numericLike,
      sampleValues: samples,
      oddValues,
    });
  }

  return { columns, inputRows, dataRows };
}

export const TYPE_LABEL: Record<CellType, string> = {
  integer: "จำนวนเต็ม",
  decimal: "ทศนิยม",
  boolean: "จริง/เท็จ",
  date: "วันที่",
  text: "ข้อความ",
  blank: "ว่าง",
};

// สรุปเป็น CSV: 1 แถวต่อคอลัมน์
export function schemaToCsv(result: SchemaResult): string {
  const head = [
    "คอลัมน์",
    "ชื่อ",
    "ชนิดหลัก",
    "มีค่า",
    "ว่าง",
    "ไม่ซ้ำ",
    "ยาวต่ำสุด",
    "ยาวสูงสุด",
    "เลข0นำหน้า",
    "จำนวนเต็ม",
    "ทศนิยม",
    "จริงเท็จ",
    "วันที่",
    "ข้อความ",
    "ค่าแปลก",
  ];
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [head.map(esc).join(",")];
  for (const col of result.columns) {
    const row = [
      String(col.index + 1),
      col.name,
      TYPE_LABEL[col.dominantType],
      String(col.filled),
      String(col.blank),
      String(col.distinct),
      String(col.minLen),
      String(col.maxLen),
      col.hasLeadingZero ? "ใช่" : "",
      String(col.typeCounts.integer),
      String(col.typeCounts.decimal),
      String(col.typeCounts.boolean),
      String(col.typeCounts.date),
      String(col.typeCounts.text),
      String(col.oddValues.length),
    ];
    lines.push(row.map((x) => esc(String(x))).join(","));
  }
  return lines.join("\n");
}

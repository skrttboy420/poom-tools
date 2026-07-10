// เทียบ 2 คอลัมน์ในไฟล์เดียว (Column vs Column) — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case จริง: packing list/export หลายไฟล์มี "ค่าที่แจ้ง" กับ "ค่าที่ชั่ง/นับจริง" อยู่คนละคอลัมน์
//   เช่น น้ำหนักแจ้ง ↔ น้ำหนักชั่ง · จำนวนกล่องแจ้ง ↔ นับจริง · tracking ที่ควรตรงกัน 2 คอลัมน์
//   → อยากรู้ทีละแถวว่า "ตรง / ต่าง / มีฝั่งเดียว" เพื่อจับจุดผิดก่อนเข้า Pacred
// ต่างจาก /reconcile (เทียบข้าม 2 ไฟล์ด้วย key join) — อันนี้เทียบ "ในแถวเดียวกัน" 2 คอลัมน์ (ไม่ต้องมี key)
// ปรัชญา: อ่านอย่างเดียว ไม่แก้ข้อมูล · แค่รายงานสถานะแต่ละแถว (ไม่ทำแถวหาย)

import type { Cell, Row } from "@/lib/reconcile/types";

export type CompareStatus = "match" | "diff" | "only-a" | "only-b" | "both-blank";

export interface CompareRow {
  row: number; // index ในแถวข้อมูล (0-based หลังตัดแถวว่างทั้งแถว)
  a: string; // ค่าที่แสดงฝั่ง A (ตามต้นฉบับ)
  b: string; // ค่าที่แสดงฝั่ง B
  status: CompareStatus;
  numeric: boolean; // เทียบแบบตัวเลขไหม (ทั้งคู่เป็นตัวเลข)
  delta: number | null; // ผลต่าง b - a (เฉพาะตอนทั้งคู่เป็นตัวเลข) · null ถ้าเทียบข้อความ
}

export interface ColCompareResult {
  rows: CompareRow[];
  counts: Record<CompareStatus, number>;
  numericComparable: number; // จำนวนแถวที่ทั้ง 2 ฝั่งเป็นตัวเลข (เทียบด้วย tolerance)
  inputRows: number; // แถว input ทั้งหมด
  dataRows: number; // แถวหลังตัดแถวว่างทั้งแถว
  aName: string;
  bName: string;
  error?: string;
}

export interface CompareOptions {
  colA: number;
  colB: number;
  tolerance?: number; // ตัวเลข: |b-a| <= tolerance → ตรง (default 0)
  caseInsensitive?: boolean; // ข้อความ: ไม่สนพิมพ์เล็ก/ใหญ่ (default true)
  trim?: boolean; // ตัดช่องว่างหัว-ท้ายก่อนเทียบ (default true)
}

function isBlankCell(v: Cell): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

function isDataRow(row: Row): boolean {
  return row.some((c) => !isBlankCell(c));
}

// แปลงเป็นตัวเลข (ตัด comma + trim) · boolean/Infinity/ว่าง → null (สอดคล้อง toNumber ของ diff)
function parseNumeric(v: Cell): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/,/g, "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function cellToString(v: Cell): string {
  if (v === null || v === undefined) return "";
  return typeof v === "string" ? v : String(v);
}

// ล้าง noise ของ floating point (เช่น 12.4 - 12 = 0.40000000000000036 → 0.4)
// ใช้กับ "ค่าที่แสดง/ส่งออก" เท่านั้น — การเทียบ tolerance ยังใช้ค่าดิบ
function cleanFloat(x: number): number {
  if (!Number.isFinite(x) || x === 0) return x;
  return Number(x.toPrecision(15));
}

function emptyCounts(): Record<CompareStatus, number> {
  return { match: 0, diff: 0, "only-a": 0, "only-b": 0, "both-blank": 0 };
}

function headerName(header: string[], idx: number): string {
  const h = header[idx];
  return h !== undefined && String(h).trim() !== "" ? String(h) : `คอลัมน์ ${idx + 1}`;
}

export function compareColumns(header: string[], allRows: Row[], opts: CompareOptions): ColCompareResult {
  const inputRows = allRows.length;
  const { colA, colB } = opts;
  const tolerance = opts.tolerance ?? 0;
  const caseInsensitive = opts.caseInsensitive ?? true;
  const trim = opts.trim ?? true;

  const aName = headerName(header, colA);
  const bName = headerName(header, colB);

  if (colA < 0 || colB < 0 || colA === colB) {
    return {
      rows: [],
      counts: emptyCounts(),
      numericComparable: 0,
      inputRows,
      dataRows: 0,
      aName,
      bName,
      error: colA === colB ? "เลือกคอลัมน์ที่ต่างกัน 2 คอลัมน์" : "เลือกคอลัมน์ให้ครบทั้ง 2 ฝั่ง",
    };
  }

  const rows = allRows.filter(isDataRow);
  const dataRows = rows.length;

  const counts = emptyCounts();
  const out: CompareRow[] = [];
  let numericComparable = 0;

  for (let ri = 0; ri < rows.length; ri++) {
    const rawA = rows[ri][colA] ?? null;
    const rawB = rows[ri][colB] ?? null;
    const aStr = cellToString(rawA);
    const bStr = cellToString(rawB);
    const blankA = isBlankCell(rawA);
    const blankB = isBlankCell(rawB);

    let status: CompareStatus;
    let numeric = false;
    let delta: number | null = null;

    if (blankA && blankB) {
      status = "both-blank";
    } else if (blankA) {
      status = "only-b";
    } else if (blankB) {
      status = "only-a";
    } else {
      const na = parseNumeric(rawA);
      const nb = parseNumeric(rawB);
      if (na !== null && nb !== null) {
        // เทียบแบบตัวเลข (มี tolerance) — เทียบด้วยค่าดิบ แต่เก็บค่าที่ล้าง float noise แล้ว
        numeric = true;
        numericComparable++;
        const rawDelta = nb - na;
        status = Math.abs(rawDelta) <= tolerance ? "match" : "diff";
        delta = cleanFloat(rawDelta);
      } else {
        // เทียบแบบข้อความ (normalize ตาม option แต่แสดงค่าจริง)
        let ka = trim ? aStr.trim() : aStr;
        let kb = trim ? bStr.trim() : bStr;
        if (caseInsensitive) {
          ka = ka.toLowerCase();
          kb = kb.toLowerCase();
        }
        status = ka === kb ? "match" : "diff";
      }
    }

    counts[status]++;
    out.push({ row: ri, a: aStr, b: bStr, status, numeric, delta });
  }

  return { rows: out, counts, numericComparable, inputRows, dataRows, aName, bName };
}

export const STATUS_LABEL: Record<CompareStatus, string> = {
  match: "ตรงกัน",
  diff: "ไม่ตรง",
  "only-a": "เฉพาะ A",
  "only-b": "เฉพาะ B",
  "both-blank": "ว่างทั้งคู่",
};

// สรุปเป็น CSV · onlyDiff = เอาเฉพาะแถวที่ไม่ตรง (diff/only-a/only-b) — จับจุดผิดเร็ว
export function colCompareToCsv(result: ColCompareResult, onlyDiff = false): string {
  const head = ["แถว", result.aName, result.bName, "สถานะ", "ผลต่าง"];
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [head.map(esc).join(",")];
  for (const r of result.rows) {
    if (onlyDiff && (r.status === "match" || r.status === "both-blank")) continue;
    const row = [String(r.row + 1), r.a, r.b, STATUS_LABEL[r.status], r.delta === null ? "" : String(r.delta)];
    lines.push(row.map((x) => esc(String(x))).join(","));
  }
  return lines.join("\n");
}

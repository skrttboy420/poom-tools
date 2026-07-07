// Gap Finder — ตรวจไฟล์ "ไฟล์เดียว" หาข้อมูลที่หาย/เป็น 0/ผิดรูป
// use-case หลัก: MOMO ชอบทิ้งข้อมูล 30-40% → tracking หาย / น้ำหนักเป็น 0 → ต้องจับให้เจอ
// เป็น pure function ไม่พึ่ง DOM/DB — ใช้ซ้ำได้ทั้ง browser/node
import Papa from "papaparse";
import type { Cell, Row } from "./types";

export type GapKind = "missing-key" | "blank" | "zero" | "invalid" | "dup-key";

export const GAP_KIND_LABEL: Record<GapKind, string> = {
  "missing-key": "ไม่มี tracking",
  blank: "ค่าว่าง",
  zero: "เป็น 0",
  invalid: "ค่าผิดรูปแบบ",
  "dup-key": "tracking ซ้ำ",
};

// นิยาม "ช่องที่จะตรวจ" ของ field หนึ่ง
export interface GapCheck {
  fieldId: string;
  label: string;
  col: number; // index คอลัมน์ในแถว (-1 = ไม่ได้ map)
  isKey: boolean; // true = ฟิลด์ key (tracking) → ตรวจ missing/dup
  numeric: boolean; // true = ตรวจ zero/blank/invalid, false = ตรวจ blank อย่างเดียว
  enabled: boolean; // ผู้ใช้เปิด/ปิดการตรวจ field นี้ได้
}

export interface GapCellFlag {
  fieldId: string;
  kind: GapKind;
}

export interface GapRow {
  rowNumber: number; // เลขแถวแบบ 1-based ในชีต (ให้ผู้ใช้ไปหาในไฟล์จริงได้)
  key: string;
  values: Record<string, Cell>; // fieldId -> ค่าดิบ (เฉพาะ field ที่ตรวจ)
  flags: GapCellFlag[]; // ปัญหาที่เจอในแถวนี้
}

export interface GapSummary {
  totalRows: number; // แถวข้อมูลที่สแกน (ตัดแถวว่างทั้งแถวออกแล้ว)
  cleanRows: number; // แถวที่ไม่มีปัญหา
  problemRows: number; // แถวที่มี >=1 ปัญหา
  byKind: Record<GapKind, number>; // นับจำนวน "ช่อง" ที่มีปัญหาแยกตามชนิด
  byField: Record<string, number>; // fieldId -> จำนวนช่องมีปัญหา
}

export interface GapResult {
  keyFieldId: string | null;
  keyFieldLabel: string;
  checks: GapCheck[]; // เฉพาะที่ enabled + map แล้ว
  rows: GapRow[]; // เฉพาะแถวที่มีปัญหา เรียงหนักสุดขึ้นก่อน
  summary: GapSummary;
}

export interface GapOptions {
  trimKey?: boolean; // ตัดช่องว่างหน้า/หลังคีย์ก่อนเทียบซ้ำ (default true)
  checkDupKey?: boolean; // ตรวจ tracking ซ้ำ (default true)
  zeroIsProblem?: boolean; // นับตัวเลข 0 เป็นปัญหา (default true)
  blankIsProblem?: boolean; // นับค่าว่างเป็นปัญหา (default true)
  rowNumberBase?: number; // เลขแถวของ dataRows[0] แบบ 1-based (default 1)
}

function cellStr(v: Cell): string {
  return v === null || v === undefined ? "" : String(v).trim();
}

// พยายามอ่านเป็นตัวเลข: "" -> blank, ตัวเลข -> number, อ่านไม่ได้ -> invalid
type NumParse = { kind: "blank" } | { kind: "num"; n: number } | { kind: "invalid" };
function parseNum(v: Cell): NumParse {
  if (v === null || v === undefined) return { kind: "blank" };
  if (typeof v === "number") return Number.isNaN(v) ? { kind: "invalid" } : { kind: "num", n: v };
  if (typeof v === "boolean") return { kind: "invalid" };
  const s = v.replace(/,/g, "").trim();
  if (s === "") return { kind: "blank" };
  const n = Number(s);
  return Number.isNaN(n) ? { kind: "invalid" } : { kind: "num", n };
}

// แถวนี้ "เป็นแถวข้อมูลจริง" ไหม = มีอย่างน้อย 1 ช่องในคอลัมน์ที่ตรวจที่ไม่ว่าง
function isDataRow(row: Row, cols: number[]): boolean {
  for (const c of cols) {
    if (c < 0) continue;
    if (cellStr(row[c] ?? null) !== "") return true;
  }
  return false;
}

// เรียงลำดับความ "หนัก" ของปัญหา เพื่อเรียงแถวหนักขึ้นก่อน
const KIND_WEIGHT: Record<GapKind, number> = {
  "missing-key": 5,
  invalid: 4,
  zero: 3,
  blank: 2,
  "dup-key": 1,
};

export function findGaps(dataRows: Row[], checks: GapCheck[], opts: GapOptions = {}): GapResult {
  const trimKey = opts.trimKey ?? true;
  const checkDupKey = opts.checkDupKey ?? true;
  const zeroIsProblem = opts.zeroIsProblem ?? true;
  const blankIsProblem = opts.blankIsProblem ?? true;
  const base = opts.rowNumberBase ?? 1;

  const active = checks.filter((c) => c.enabled && c.col >= 0);
  const keyCheck = active.find((c) => c.isKey) ?? null;
  const cols = active.map((c) => c.col);

  const byKind: Record<GapKind, number> = {
    "missing-key": 0,
    blank: 0,
    zero: 0,
    invalid: 0,
    "dup-key": 0,
  };
  const byField: Record<string, number> = {};
  for (const c of active) byField[c.fieldId] = 0;

  // รอบแรก: นับความถี่ของคีย์ (สำหรับหา dup) เฉพาะแถวข้อมูลจริง
  const keyCount = new Map<string, number>();
  if (keyCheck && checkDupKey) {
    for (const row of dataRows) {
      if (!isDataRow(row, cols)) continue;
      let k = cellStr(row[keyCheck.col] ?? null);
      if (trimKey) k = k.trim();
      if (k === "") continue;
      keyCount.set(k, (keyCount.get(k) ?? 0) + 1);
    }
  }

  const rows: GapRow[] = [];
  let totalRows = 0;
  const seenDup = new Set<string>();

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    if (!isDataRow(row, cols)) continue; // ตัดแถวว่างทั้งแถวออก
    totalRows++;

    const flags: GapCellFlag[] = [];
    const values: Record<string, Cell> = {};

    const rawKey = keyCheck ? cellStr(row[keyCheck.col] ?? null) : "";
    const key = trimKey ? rawKey.trim() : rawKey;

    for (const c of active) {
      const val = c.col >= 0 ? (row[c.col] ?? null) : null;
      values[c.fieldId] = val;

      if (c.isKey) {
        if (cellStr(val) === "") {
          flags.push({ fieldId: c.fieldId, kind: "missing-key" });
          byKind["missing-key"]++;
          byField[c.fieldId]++;
        } else if (checkDupKey && (keyCount.get(key) ?? 0) > 1) {
          // นับ dup ครั้งเดียวต่อแถว (ทุกแถวที่ซ้ำถือว่ามีปัญหา)
          flags.push({ fieldId: c.fieldId, kind: "dup-key" });
          byKind["dup-key"]++;
          byField[c.fieldId]++;
          seenDup.add(key);
        }
        continue;
      }

      if (c.numeric) {
        const p = parseNum(val);
        if (p.kind === "blank") {
          if (blankIsProblem) {
            flags.push({ fieldId: c.fieldId, kind: "blank" });
            byKind.blank++;
            byField[c.fieldId]++;
          }
        } else if (p.kind === "invalid") {
          flags.push({ fieldId: c.fieldId, kind: "invalid" });
          byKind.invalid++;
          byField[c.fieldId]++;
        } else if (p.n === 0 && zeroIsProblem) {
          flags.push({ fieldId: c.fieldId, kind: "zero" });
          byKind.zero++;
          byField[c.fieldId]++;
        }
      } else {
        // ฟิลด์ข้อความ: ตรวจแค่ค่าว่าง
        if (blankIsProblem && cellStr(val) === "") {
          flags.push({ fieldId: c.fieldId, kind: "blank" });
          byKind.blank++;
          byField[c.fieldId]++;
        }
      }
    }

    if (flags.length > 0) {
      rows.push({ rowNumber: base + i, key, values, flags });
    }
  }

  // เรียงแถว: ปัญหาหนักสุดในแถวมาก่อน แล้วตามจำนวน flag
  rows.sort((a, b) => {
    const wa = Math.max(...a.flags.map((f) => KIND_WEIGHT[f.kind]));
    const wb = Math.max(...b.flags.map((f) => KIND_WEIGHT[f.kind]));
    if (wb !== wa) return wb - wa;
    return b.flags.length - a.flags.length;
  });

  const problemRows = rows.length;
  return {
    keyFieldId: keyCheck?.fieldId ?? null,
    keyFieldLabel: keyCheck?.label ?? "key",
    checks: active,
    rows,
    summary: {
      totalRows,
      cleanRows: totalRows - problemRows,
      problemRows,
      byKind,
      byField,
    },
  };
}

// ส่งออกเฉพาะแถวที่มีปัญหาเป็น CSV ให้เอาไปตามเก็บต่อ
export function gapToCsv(result: GapResult): string {
  const header: string[] = ["แถวที่", result.keyFieldLabel || "key"];
  for (const c of result.checks) {
    if (c.isKey) continue;
    header.push(c.label);
  }
  header.push("ปัญหาที่เจอ");

  const data: string[][] = result.rows.map((r) => {
    const line: string[] = [String(r.rowNumber), r.key];
    for (const c of result.checks) {
      if (c.isKey) continue;
      const v = r.values[c.fieldId];
      line.push(v === null || v === undefined ? "" : String(v));
    }
    const issues = r.flags.map((f) => GAP_KIND_LABEL[f.kind]).join(", ");
    line.push(issues);
    return line;
  });

  return Papa.unparse({ fields: header, data });
}

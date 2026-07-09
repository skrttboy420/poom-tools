// ค้นหา-แทนที่ค่าในตาราง (find & replace) — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case จริง: แก้ชื่อตู้พิมพ์ผิดทั้งไฟล์ (TU-A → TU-01), ลบคำนำหน้า, แทนค่า "-"/"N/A" เป็นว่าง,
//   normalize ค่าซ้ำ ๆ ก่อนเอาเข้า Pacred
// ปรัชญา: **ไม่ทำแถวหาย (จำนวนแถวเท่าเดิม) + แตะเฉพาะช่องที่ตรงเงื่อนไข** · โชว์จำนวน/ตัวอย่างที่แก้ก่อน (ไม่แก้เงียบ)

import type { Cell, Row } from "@/lib/reconcile/types";

export type ReplaceMode = "contains" | "exact" | "regex";

export interface ReplaceOptions {
  find: string;
  replacement: string;
  mode?: ReplaceMode; // default "contains"
  caseInsensitive?: boolean; // default false
  trimCompare?: boolean; // exact mode: เทียบแบบ trim (default false)
  cols?: number[]; // จำกัดเฉพาะคอลัมน์ (ว่าง/undefined = ทุกคอลัมน์)
}

export interface ReplaceSample {
  row: number; // index แถวข้อมูล (0-based)
  col: number;
  before: string;
  after: string;
}

export interface ReplaceResult {
  header: string[];
  rows: Row[];
  cellsChanged: number;
  rowsAffected: number;
  samples: ReplaceSample[]; // cap 50
  inputRows: number;
  error?: string; // ถ้ามี = header/rows คืนของเดิมไม่แตะ
}

const SAMPLE_CAP = 50;

function isBlankCell(v: Cell): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// แทนที่ในสตริงเดียว → คืน string ใหม่ (ถ้าไม่เปลี่ยน คืนค่าเดิม identical)
type CellReplacer = (s: string) => string;

export function replaceInTable(
  header: string[],
  dataRows: Row[],
  opts: ReplaceOptions,
): ReplaceResult {
  const mode = opts.mode ?? "contains";
  const ci = opts.caseInsensitive === true;
  const trimCompare = opts.trimCompare === true;
  const width = header.length;

  const cloneRows: Row[] = dataRows.map((r) => r.slice());

  const fail = (error: string): ReplaceResult => ({
    header: header.slice(),
    rows: cloneRows,
    cellsChanged: 0,
    rowsAffected: 0,
    samples: [],
    inputRows: dataRows.length,
    error,
  });

  if (opts.find === "") return fail("ต้องระบุข้อความที่จะค้นหา");

  // คอลัมน์เป้าหมาย (ว่าง = ทุกคอลัมน์)
  const targetCols =
    opts.cols && opts.cols.length > 0
      ? new Set(opts.cols.filter((c) => c >= 0))
      : null; // null = ทุกคอลัมน์

  // สร้างฟังก์ชันแทนที่ตามโหมด
  let replacer: CellReplacer;
  if (mode === "contains") {
    const re = new RegExp(escapeRegex(opts.find), ci ? "gi" : "g");
    const rep = opts.replacement.replace(/\$/g, "$$$$"); // escape $ ให้เป็นตัวอักษรจริง
    replacer = (s) => s.replace(re, rep);
  } else if (mode === "regex") {
    let re: RegExp;
    try {
      re = new RegExp(opts.find, ci ? "gi" : "g");
    } catch (e) {
      return fail(`Regex ไม่ถูกต้อง: ${(e as Error).message}`);
    }
    const rep = opts.replacement;
    replacer = (s) => s.replace(re, rep);
  } else {
    // exact: ทั้งช่องต้องตรง (ตาม trim/ci) → แทนทั้งช่อง
    const target = trimCompare ? opts.find.trim() : opts.find;
    const targetCmp = ci ? target.toLowerCase() : target;
    const rep = opts.replacement;
    replacer = (s) => {
      const cmp0 = trimCompare ? s.trim() : s;
      const cmp = ci ? cmp0.toLowerCase() : cmp0;
      return cmp === targetCmp ? rep : s;
    };
  }

  let cellsChanged = 0;
  let rowsAffected = 0;
  const samples: ReplaceSample[] = [];

  const outRows: Row[] = dataRows.map((row, ri) => {
    const out: Row = row.slice();
    let rowTouched = false;
    const cols = targetCols ? [...targetCols].filter((c) => c < Math.max(row.length, width)) : null;
    const iterate = cols ?? Array.from({ length: Math.max(row.length, width) }, (_, i) => i);
    for (const ci2 of iterate) {
      const v = ci2 < row.length ? (row[ci2] ?? null) : null;
      if (isBlankCell(v)) continue; // ไม่แตะช่องว่าง (กันสร้างค่าจากที่ว่าง)
      const s = String(v);
      const next = replacer(s);
      if (next !== s) {
        out[ci2] = next;
        cellsChanged++;
        rowTouched = true;
        if (samples.length < SAMPLE_CAP) samples.push({ row: ri, col: ci2, before: s, after: next });
      }
    }
    if (rowTouched) rowsAffected++;
    return out;
  });

  return {
    header: header.slice(),
    rows: outRows,
    cellsChanged,
    rowsAffected,
    samples,
    inputRows: dataRows.length,
  };
}

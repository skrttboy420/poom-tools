// ตรวจ/ล้างอักขระซ่อน & ช่องว่างแปลก — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case จริง (ปัญหา reconcile ที่แสบสุด): tracking 2 ค่าดู "เหมือนกันเป๊ะ" แต่ match ไม่ได้
//   เพราะมี NBSP (U+00A0) / zero-width (U+200B) / ช่องว่างท้าย / Tab แฝงอยู่ที่ตาไม่เห็น
//   → tool นี้ "ส่องให้เห็น" ว่าช่องไหนมีตัวปัญหาแบบไหน + ล้างให้ (เลือกได้) ก่อนเอาไปเทียบ/เข้า Pacred
// ปรัชญา: **ตรวจให้เห็นก่อน แล้วค่อยล้างตามที่เลือก** (ไม่แก้เงียบ) · ล้างเฉพาะช่อง string ในคอลัมน์ที่เลือก
//   ไม่ทำแถวหาย/ไม่เพิ่มแถว (จำนวนแถว/รูปตารางคงเดิม) · number/boolean/null ไม่มีอักขระซ่อน = ไม่แตะ

import type { Cell, Row } from "@/lib/reconcile/types";

export type IssueKey = "leading" | "trailing" | "double" | "tab" | "nbsp" | "zerowidth" | "control";
export const ISSUE_KEYS: IssueKey[] = [
  "leading",
  "trailing",
  "double",
  "tab",
  "nbsp",
  "zerowidth",
  "control",
];
export const ISSUE_LABEL: Record<IssueKey, string> = {
  leading: "ช่องว่างนำหน้า",
  trailing: "ช่องว่างต่อท้าย",
  double: "ช่องว่างซ้ำซ้อน",
  tab: "อักขระ Tab",
  nbsp: "ช่องว่างพิเศษ (NBSP/Unicode)",
  zerowidth: "อักขระล่องหน (zero-width)",
  control: "อักขระควบคุม (มองไม่เห็น)",
};

// unicode space separators (Zs) + NBSP-family — ต่างจากช่องว่างธรรมดา แต่ตาแยกไม่ออก
const UNICODE_SPACE = new Set<number>([
  0x00a0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009,
  0x200a, 0x202f, 0x205f, 0x3000,
]);
// อักขระกว้าง 0 (มองไม่เห็นเลย) — zero-width space/joiner/BOM
const ZERO_WIDTH = new Set<number>([0x200b, 0x200c, 0x200d, 0x2060, 0xfeff]);

function isAsciiWs(cp: number): boolean {
  return cp === 0x20 || cp === 0x09; // space or tab
}
function isUnicodeSpace(cp: number): boolean {
  return UNICODE_SPACE.has(cp);
}
function isZeroWidth(cp: number): boolean {
  return ZERO_WIDTH.has(cp);
}
// อักขระควบคุม C0/C1 (ยกเว้น tab ที่จัดเป็นหมวด tab แยก) รวม newline/CR ด้วย
function isControl(cp: number): boolean {
  if (cp === 0x09) return false;
  return cp < 0x20 || cp === 0x7f || (cp >= 0x80 && cp <= 0x9f);
}

// ตรวจว่าช่อง string นี้มีปัญหาอะไรบ้าง (คืน key ตามลำดับ canonical)
export function detectIssues(s: string): IssueKey[] {
  if (s === "") return [];
  const chars = Array.from(s);
  const found = new Set<IssueKey>();

  const firstCp = chars[0].codePointAt(0)!;
  const lastCp = chars[chars.length - 1].codePointAt(0)!;
  if (isAsciiWs(firstCp) || isUnicodeSpace(firstCp)) found.add("leading");
  if (isAsciiWs(lastCp) || isUnicodeSpace(lastCp)) found.add("trailing");

  for (const ch of chars) {
    const c = ch.codePointAt(0)!;
    if (c === 0x09) found.add("tab");
    else if (isUnicodeSpace(c)) found.add("nbsp");
    else if (isZeroWidth(c)) found.add("zerowidth");
    else if (isControl(c)) found.add("control");
  }
  if (/ {2,}/.test(s)) found.add("double");

  return ISSUE_KEYS.filter((k) => found.has(k));
}

export interface CleanOptions {
  normalizeUnicodeSpace?: boolean; // NBSP/unicode space → ช่องว่างปกติ — default on
  tabToSpace?: boolean; // Tab → ช่องว่าง — default on
  removeZeroWidth?: boolean; // ลบอักขระล่องหน — default on
  stripControl?: boolean; // อักขระควบคุม → ช่องว่าง — default on
  collapseSpaces?: boolean; // ยุบช่องว่างซ้ำเป็นช่องเดียว — default on
  trim?: boolean; // ตัดช่องว่างหัว-ท้าย — default on
}

function resolveClean(o: CleanOptions) {
  return {
    normalizeUnicodeSpace: o.normalizeUnicodeSpace !== false,
    tabToSpace: o.tabToSpace !== false,
    removeZeroWidth: o.removeZeroWidth !== false,
    stripControl: o.stripControl !== false,
    collapseSpaces: o.collapseSpaces !== false,
    trim: o.trim !== false,
  };
}

// ล้างช่อง string ตาม option (คืนค่าที่ล้างแล้ว) — ใช้กับ string เท่านั้น
export function cleanCell(s: string, opts: CleanOptions = {}): string {
  const o = resolveClean(opts);
  const out: string[] = [];
  for (const ch of Array.from(s)) {
    const c = ch.codePointAt(0)!;
    if (isZeroWidth(c)) {
      if (o.removeZeroWidth) continue;
      out.push(ch);
    } else if (c === 0x09) {
      out.push(o.tabToSpace ? " " : ch);
    } else if (isUnicodeSpace(c)) {
      out.push(o.normalizeUnicodeSpace ? " " : ch);
    } else if (isControl(c)) {
      out.push(o.stripControl ? " " : ch);
    } else {
      out.push(ch);
    }
  }
  let r = out.join("");
  if (o.collapseSpaces) r = r.replace(/ {2,}/g, " ");
  if (o.trim) r = r.trim();
  return r;
}

export interface HiddenScanOptions extends CleanOptions {
  cols?: number[]; // จำกัดเฉพาะบางคอลัมน์ (default = ทุกคอลัมน์)
}

export interface CellFinding {
  row: number; // index ในชุดข้อมูล (0-based, ไม่นับหัว)
  col: number;
  before: string;
  after: string;
  issues: IssueKey[];
  changed: boolean; // ล้างแล้วค่าต่างจากเดิมไหม
}

export interface HiddenScanResult {
  findings: CellFinding[];
  cleanedRows: Row[]; // ตารางที่ล้างแล้ว (รูปเดิม ทุกแถวอยู่ครบ)
  scannedCells: number;
  affectedCells: number; // ช่องที่มี ≥1 ปัญหา
  affectedRows: number; // จำนวนแถวที่มีช่องปัญหา
  changedCells: number; // ช่องที่ล้างแล้วค่าเปลี่ยน
  counts: Record<IssueKey, number>; // จำนวนช่องที่พบแต่ละปัญหา
  inputRows: number;
  cappedFindings: boolean;
  error?: string;
}

const FINDINGS_CAP = 500;

function gridWidth(header: Row, rows: Row[]): number {
  let w = header.length;
  for (const r of rows) if (r.length > w) w = r.length;
  return w;
}

export function scanHidden(
  header: Row,
  dataRows: Row[],
  opts: HiddenScanOptions = {},
): HiddenScanResult {
  const width = gridWidth(header, dataRows);
  const cols =
    opts.cols && opts.cols.length > 0
      ? opts.cols.filter((c) => c >= 0 && c < width)
      : Array.from({ length: width }, (_, i) => i);

  const counts: Record<IssueKey, number> = {
    leading: 0,
    trailing: 0,
    double: 0,
    tab: 0,
    nbsp: 0,
    zerowidth: 0,
    control: 0,
  };

  const base: Omit<HiddenScanResult, "error"> = {
    findings: [],
    cleanedRows: [],
    scannedCells: 0,
    affectedCells: 0,
    affectedRows: 0,
    changedCells: 0,
    counts,
    inputRows: dataRows.length,
    cappedFindings: false,
  };

  if (width === 0) {
    return { ...base, error: "ไม่มีข้อมูลให้ตรวจ (ตารางว่าง)" };
  }
  if (cols.length === 0) {
    return { ...base, error: "เลือกคอลัมน์ที่จะตรวจ" };
  }

  const findings: CellFinding[] = [];
  const cleanedRows: Row[] = [];
  let scannedCells = 0;
  let affectedCells = 0;
  let affectedRows = 0;
  let changedCells = 0;
  let capped = false;

  for (let r = 0; r < dataRows.length; r++) {
    const row = dataRows[r];
    const newRow: Row = row.slice();
    let rowAffected = false;

    for (const c of cols) {
      const v: Cell = c < row.length ? (row[c] ?? null) : null;
      if (typeof v !== "string") continue; // เฉพาะ string เท่านั้นที่มีอักขระซ่อนได้
      scannedCells += 1;
      const issues = detectIssues(v);
      const after = cleanCell(v, opts);
      if (after !== v) {
        newRow[c] = after;
        changedCells += 1;
      }
      if (issues.length > 0) {
        affectedCells += 1;
        rowAffected = true;
        for (const k of issues) counts[k] += 1;
        if (findings.length < FINDINGS_CAP) {
          findings.push({ row: r, col: c, before: v, after, issues, changed: after !== v });
        } else {
          capped = true;
        }
      }
    }

    // คอลัมน์ที่ไม่ได้เลือก → คงค่าเดิม (newRow เริ่มจาก slice อยู่แล้ว)
    cleanedRows.push(newRow);
    if (rowAffected) affectedRows += 1;
  }

  return {
    findings,
    cleanedRows,
    scannedCells,
    affectedCells,
    affectedRows,
    changedCells,
    counts,
    inputRows: dataRows.length,
    cappedFindings: capped,
  };
}

// ทำ before/after ให้ "เห็นอักขระซ่อน" — แปลงตัวที่มองไม่เห็นเป็นสัญลักษณ์ (สำหรับ UI แสดง)
export function visualize(s: string): string {
  const out: string[] = [];
  for (const ch of Array.from(s)) {
    const c = ch.codePointAt(0)!;
    if (c === 0x20) out.push("·"); // ช่องว่างปกติ
    else if (c === 0x09) out.push("→"); // tab
    else if (isZeroWidth(c)) out.push("∅"); // zero-width
    else if (isUnicodeSpace(c)) out.push("␣"); // unicode space / nbsp
    else if (isControl(c)) out.push("⍰"); // control
    else out.push(ch);
  }
  return out.join("");
}

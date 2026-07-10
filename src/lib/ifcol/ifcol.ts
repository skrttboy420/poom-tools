// ติดป้าย/จัดหมวดตามเงื่อนไข (conditional label column · IF/CASE) — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case จริง: ติดป้ายแถวตามเงื่อนไข เช่น note มีคำว่า "ด่วน" → "เร่งด่วน" · status = "hold" → "ระงับ" ·
//   น้ำหนัก > 100 → "หนักพิเศษ" · CBM ว่าง → "ต้องตรวจ" → เติมคอลัมน์ป้ายให้ทุกแถว
// ต่างจาก /bracket (จัดชั้นตัวเลขล้วน) · /filter (กรองแถว ไม่เติมคอลัมน์) · /validate (แค่ valid/invalid)
//   → อันนี้ = หลายเงื่อนไขไล่จากบนลงล่าง (เจอเงื่อนไขแรกที่ตรง = ใช้ป้ายนั้น) รองรับทั้งข้อความและตัวเลข
// ปรัชญา: ไม่เดามั่ว — เงื่อนไขที่ยังไม่กรอกค่า = ถูกข้าม · เลขเทียบกับช่องไม่ใช่ตัวเลข = ไม่ตรง (ตกไป else) ·
//   ทุกแถวออกครบ · default = เติมคอลัมน์ใหม่ (ไม่ทับของเดิม)

import type { Cell, Row } from "@/lib/reconcile/types";

export type CondOp =
  | "contains"
  | "not-contains"
  | "equals"
  | "not-equals"
  | "starts"
  | "ends"
  | "empty"
  | "not-empty"
  | "regex"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "eq-num";

export const OP_LABEL: Record<CondOp, string> = {
  contains: "มีคำว่า",
  "not-contains": "ไม่มีคำว่า",
  equals: "เท่ากับ (ข้อความ)",
  "not-equals": "ไม่เท่ากับ (ข้อความ)",
  starts: "ขึ้นต้นด้วย",
  ends: "ลงท้ายด้วย",
  empty: "ว่าง",
  "not-empty": "ไม่ว่าง",
  regex: "ตรงกับ regex",
  gt: "มากกว่า >",
  gte: "มากกว่าเท่ากับ ≥",
  lt: "น้อยกว่า <",
  lte: "น้อยกว่าเท่ากับ ≤",
  "eq-num": "เท่ากับ (ตัวเลข)",
};

// operator ที่ไม่ต้องกรอกค่าเทียบ
export const NO_VALUE_OPS: CondOp[] = ["empty", "not-empty"];
// operator ที่เทียบเชิงตัวเลข
export const NUMERIC_OPS: CondOp[] = ["gt", "gte", "lt", "lte", "eq-num"];

export interface CondRule {
  op: CondOp;
  value?: string; // ค่าที่ใช้เทียบ (ไม่ต้องมีสำหรับ empty/not-empty)
  then: Cell; // ป้ายที่จะเติมถ้าเงื่อนไขตรง
}

export interface IfColOptions {
  col: number;
  rules: CondRule[];
  elseValue?: Cell; // ค่าเมื่อไม่เข้าเงื่อนไขไหนเลย (default null = เว้นว่าง)
  colName?: string; // ชื่อคอลัมน์ใหม่ (default "ป้าย")
  caseInsensitive?: boolean; // default true (ข้อความไม่สนพิมพ์เล็กใหญ่)
  trim?: boolean; // default true (ตัดช่องว่างหัว-ท้ายก่อนเทียบข้อความ)
}

export interface IfColResult {
  header: Row;
  rows: Row[];
  addedCols: string[];
  firstNewIndex: number;
  inputRows: number;
  dataRows: number;
  matchedRows: number; // ตรงเงื่อนไขอย่างน้อยหนึ่งข้อ
  elseRows: number; // ไม่เข้าเงื่อนไขไหน → else
  ruleCounts: number[]; // นับต่อเงื่อนไข (ตามลำดับ rules ที่ส่งเข้า)
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
// แปลงเป็นตัวเลข (ตัด comma + trim) · boolean/Infinity/ว่าง → null
function parseNumeric(v: Cell): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.replace(/,/g, "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// เงื่อนไข "ใช้งานได้" ไหม (มีค่าเทียบครบ) — เงื่อนไขที่ยังไม่กรอกค่า = ถูกข้าม (ไม่เดามั่ว)
function isActiveRule(r: CondRule): boolean {
  if (NO_VALUE_OPS.includes(r.op)) return true;
  const val = (r.value ?? "").trim();
  if (val === "") return false;
  if (NUMERIC_OPS.includes(r.op)) return parseNumeric(val) !== null;
  return true;
}

interface CompiledRule {
  rule: CondRule;
  idx: number; // ตำแหน่งเดิมใน rules[]
  re?: RegExp; // สำหรับ regex
}

// ประเมินเงื่อนไข 1 ข้อกับ 1 ช่อง
function evalRule(cell: Cell, c: CompiledRule, caseInsensitive: boolean, trim: boolean): boolean {
  const { rule } = c;
  const op = rule.op;

  if (op === "empty") return isBlankCell(cell);
  if (op === "not-empty") return !isBlankCell(cell);

  if (NUMERIC_OPS.includes(op)) {
    const n = parseNumeric(cell);
    const v = parseNumeric(rule.value ?? "");
    if (n === null || v === null) return false; // เลขเทียบกับช่องไม่ใช่ตัวเลข = ไม่ตรง
    switch (op) {
      case "gt":
        return n > v;
      case "gte":
        return n >= v;
      case "lt":
        return n < v;
      case "lte":
        return n <= v;
      case "eq-num":
        return n === v;
    }
  }

  if (op === "regex") {
    return c.re ? c.re.test(cellToStr(cell)) : false;
  }

  // ข้อความ
  let s = cellToStr(cell);
  let val = rule.value ?? "";
  if (trim) {
    s = s.trim();
    val = val.trim();
  }
  if (caseInsensitive) {
    s = s.toLowerCase();
    val = val.toLowerCase();
  }
  switch (op) {
    case "contains":
      return s.includes(val);
    case "not-contains":
      return !s.includes(val);
    case "equals":
      return s === val;
    case "not-equals":
      return s !== val;
    case "starts":
      return s.startsWith(val);
    case "ends":
      return s.endsWith(val);
  }
  return false;
}

export function analyzeIfCol(header: Row, allRows: Row[], opts: IfColOptions): IfColResult {
  const inputRows = allRows.length;
  const rows = allRows.filter(isDataRow);
  const dataRows = rows.length;
  const width = Math.max(header.length, ...rows.map((r) => r.length), 1);

  const base = (msg: string): IfColResult => ({
    header: header.slice(),
    rows: rows.map((r) => r.slice()),
    addedCols: [],
    firstNewIndex: -1,
    inputRows,
    dataRows,
    matchedRows: 0,
    elseRows: 0,
    ruleCounts: opts.rules.map(() => 0),
    error: msg,
  });

  if (dataRows === 0) return base("ไม่มีแถวข้อมูล");
  if (opts.col < 0 || opts.col >= width) return base("เลือกคอลัมน์ที่จะตรวจให้อยู่ในช่วง");
  if (opts.rules.length === 0) return base("ยังไม่มีเงื่อนไข");

  const caseInsensitive = opts.caseInsensitive !== false;
  const trim = opts.trim !== false;
  const elseValue = opts.elseValue === undefined ? null : opts.elseValue;
  const colName = opts.colName && opts.colName.trim() !== "" ? opts.colName.trim() : "ป้าย";

  // compile เฉพาะเงื่อนไขที่ใช้งานได้ (มีค่าครบ) + regex
  const compiled: CompiledRule[] = [];
  for (let i = 0; i < opts.rules.length; i++) {
    const rule = opts.rules[i];
    if (!isActiveRule(rule)) continue;
    if (rule.op === "regex") {
      try {
        compiled.push({ rule, idx: i, re: new RegExp(rule.value ?? "", caseInsensitive ? "i" : "") });
      } catch (e) {
        return base(`Regex ไม่ถูกต้อง (เงื่อนไขที่ ${i + 1}): ${(e as Error).message}`);
      }
    } else {
      compiled.push({ rule, idx: i });
    }
  }

  const ruleCounts = opts.rules.map(() => 0);
  let matchedRows = 0;
  let elseRows = 0;

  const assigned: Cell[] = rows.map((r) => {
    const cell = cellAt(r, opts.col);
    for (const c of compiled) {
      if (evalRule(cell, c, caseInsensitive, trim)) {
        ruleCounts[c.idx]++;
        matchedRows++;
        return c.rule.then;
      }
    }
    elseRows++;
    return elseValue;
  });

  const outHeader = header.slice();
  while (outHeader.length < width) outHeader.push(null);
  const firstNewIndex = outHeader.length;
  outHeader.push(colName);

  const outRows: Row[] = rows.map((r, i) => {
    const out = r.slice();
    while (out.length < width) out.push(null);
    out.push(assigned[i]);
    return out;
  });

  return {
    header: outHeader,
    rows: outRows,
    addedCols: [colName],
    firstNewIndex,
    inputRows,
    dataRows,
    matchedRows,
    elseRows,
    ruleCounts,
  };
}

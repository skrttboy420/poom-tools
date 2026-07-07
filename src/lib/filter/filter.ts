// ค้นหา & กรองข้อมูล — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case: หา/กรองแถวในไฟล์ใหญ่ (เช่น หา tracking/ตู้/น้ำหนัก 0 ในไฟล์เป็นพันแถว)
// รวมหลายเงื่อนไข (AND/OR) + ค้นเร็วทุกคอลัมน์ · คงลำดับแถวเดิม · ไม่ทำข้อมูลหาย

import type { Cell, Row } from "@/lib/reconcile/types";

export type FilterOp =
  | "contains"
  | "not-contains"
  | "equals"
  | "not-equals"
  | "starts"
  | "ends"
  | "empty"
  | "not-empty"
  | "gt"
  | "gte"
  | "lt"
  | "lte";

export const OP_LABEL: Record<FilterOp, string> = {
  contains: "มีคำว่า",
  "not-contains": "ไม่มีคำว่า",
  equals: "เท่ากับ",
  "not-equals": "ไม่เท่ากับ",
  starts: "ขึ้นต้นด้วย",
  ends: "ลงท้ายด้วย",
  empty: "ว่าง",
  "not-empty": "ไม่ว่าง",
  gt: "มากกว่า (>)",
  gte: "อย่างน้อย (≥)",
  lt: "น้อยกว่า (<)",
  lte: "ไม่เกิน (≤)",
};

// op ที่ไม่ต้องกรอกค่า
export const NO_VALUE_OPS: FilterOp[] = ["empty", "not-empty"];
// op ที่เทียบแบบตัวเลข
export const NUMERIC_OPS: FilterOp[] = ["gt", "gte", "lt", "lte"];

export interface FilterCond {
  col: number; // index ใน header; -1 = ทุกคอลัมน์
  op: FilterOp;
  value: string;
  caseSensitive?: boolean;
}

export interface FilterOptions {
  match: "all" | "any"; // AND / OR ระหว่างเงื่อนไข
  quick?: string; // ค้นเร็วทุกคอลัมน์ (contains) — AND กับเงื่อนไขเสมอ
}

export interface FilterResult {
  header: Row;
  rows: Row[]; // แถวที่ผ่าน (คงลำดับเดิม)
  matchedIndexes: number[]; // index อ้างอิงใน dataRows เดิม
  total: number; // จำนวนแถวข้อมูลจริง (ตัดแถวว่างทั้งแถวออก)
  matched: number;
}

function cellText(c: Cell): string {
  return c === null ? "" : String(c);
}

// แปลงเป็นตัวเลข (ลบ comma) · ไม่ใช่ตัวเลข → null
function cellNum(c: Cell): number | null {
  if (typeof c === "number") return Number.isFinite(c) ? c : null;
  if (c === null) return null;
  const n = parseFloat(String(c).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function matchOp(cell: Cell, op: FilterOp, value: string, cs: boolean): boolean {
  const raw = cellText(cell);
  if (op === "empty") return raw.trim() === "";
  if (op === "not-empty") return raw.trim() !== "";

  if (NUMERIC_OPS.includes(op)) {
    const n = cellNum(cell);
    const v = parseFloat(value.replace(/,/g, "").trim());
    if (n === null || !Number.isFinite(v)) return false;
    if (op === "gt") return n > v;
    if (op === "gte") return n >= v;
    if (op === "lt") return n < v;
    return n <= v; // lte
  }

  const a = cs ? raw : raw.toLowerCase();
  const b = cs ? value : value.toLowerCase();
  switch (op) {
    case "contains":
      return a.includes(b);
    case "not-contains":
      return !a.includes(b);
    case "equals":
      return a.trim() === b.trim();
    case "not-equals":
      return a.trim() !== b.trim();
    case "starts":
      return a.startsWith(b);
    case "ends":
      return a.endsWith(b);
    default:
      return false;
  }
}

// เงื่อนไขเดียวผ่านมั้ย · col = -1 → ผ่านถ้าคอลัมน์ใดคอลัมน์หนึ่งเข้าเงื่อนไข
function condPass(row: Row, cond: FilterCond): boolean {
  const cs = !!cond.caseSensitive;
  if (cond.col === -1) {
    return row.some((c) => matchOp(c, cond.op, cond.value, cs));
  }
  return matchOp(row[cond.col] ?? null, cond.op, cond.value, cs);
}

// แถวมีข้อมูลจริงมั้ย (ไม่ใช่แถวว่างทั้งแถว)
function isDataRow(row: Row): boolean {
  return row.some((c) => c !== null && String(c).trim() !== "");
}

export function applyFilter(
  header: Row,
  dataRows: Row[],
  conds: FilterCond[],
  opts: FilterOptions,
): FilterResult {
  // ใช้เฉพาะเงื่อนไขที่กรอกค่าแล้ว (หรือ op ที่ไม่ต้องมีค่า)
  const active = conds.filter((c) => NO_VALUE_OPS.includes(c.op) || c.value.trim() !== "");
  const quick = (opts.quick ?? "").trim().toLowerCase();

  const rows: Row[] = [];
  const matchedIndexes: number[] = [];
  let total = 0;

  dataRows.forEach((row, i) => {
    if (!isDataRow(row)) return; // ข้ามแถวว่างทั้งแถว
    total++;

    // ค้นเร็ว (AND เสมอ)
    if (quick !== "" && !row.some((c) => cellText(c).toLowerCase().includes(quick))) return;

    // เงื่อนไขที่ตั้งไว้
    if (active.length > 0) {
      const results = active.map((c) => condPass(row, c));
      const pass = opts.match === "all" ? results.every(Boolean) : results.some(Boolean);
      if (!pass) return;
    }

    rows.push(row);
    matchedIndexes.push(i);
  });

  return { header, rows, matchedIndexes, total, matched: rows.length };
}

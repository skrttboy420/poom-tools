// ปัดตัวเลขในคอลัมน์ (round / ปัดขึ้น / ปัดลง) — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case จริง: บิลค่าขนส่งมักปัด "น้ำหนักคิดเงิน" ขึ้นเป็นขั้น 0.5 หรือ 1.0 กก. เสมอ (ปัดขึ้น ไม่ปัดลง)
//   → ปัดทั้งคอลัมน์ทีเดียว ตามขั้น (step) หรือตามจำนวนทศนิยม
// ต่างจาก /calc-col (คูณ/หาร) และ /clean (แค่ตัด comma เป็น number) — อันนี้ปัดตามกฎบิล (ขึ้น/ลง/ใกล้สุด + ขั้น)
// ปรัชญา: ไม่เดามั่ว — ช่องที่ไม่ใช่ตัวเลข = คงค่าเดิม ไม่แตะ (นับ skipped) · ทุกแถวออกครบ ·
//   default = เติมคอลัมน์ใหม่ (ไม่ทับของเดิม) · โหมดแทนที่ = opt-in

import type { Cell, Row } from "@/lib/reconcile/types";

export type RoundMode = "nearest" | "up" | "down";

export const ROUND_MODE_LABEL: Record<RoundMode, string> = {
  nearest: "ใกล้สุด (round)",
  up: "ปัดขึ้น (ceil)",
  down: "ปัดลง (floor)",
};

export interface RoundOptions {
  col: number; // คอลัมน์ที่จะปัด
  mode: RoundMode; // ใกล้สุด / ขึ้น / ลง
  step?: number | null; // ปัดเป็นขั้น (เช่น 0.5) — ถ้า >0 ใช้ step, ไม่งั้นใช้ decimals
  decimals?: number; // จำนวนทศนิยม (ใช้เมื่อไม่มี step) — default 0
  replace?: boolean; // true = ทับคอลัมน์เดิม · false (default) = เติมคอลัมน์ใหม่
  colName?: string; // ชื่อคอลัมน์ใหม่ (โหมดเติม)
}

export interface RoundResult {
  header: Row;
  rows: Row[];
  addedCols: string[]; // ชื่อคอลัมน์ที่เติม ([] ถ้าโหมดแทนที่)
  firstNewIndex: number; // ตำแหน่งคอลัมน์ใหม่ (-1 ถ้าแทนที่)
  replacedCol: number; // คอลัมน์ที่ถูกทับ (-1 ถ้าโหมดเติม)
  inputRows: number;
  dataRows: number;
  roundedRows: number; // ช่องที่ปัดได้ (เป็นตัวเลข)
  skippedRows: number; // ช่องที่ไม่ใช่ตัวเลข → คงเดิม
  changedRows: number; // ช่องที่ค่าจริงเปลี่ยนหลังปัด
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
function parseNumeric(v: Cell): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/,/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function cellAt(row: Row, col: number): Cell {
  if (col < 0) return null;
  return col < row.length ? row[col] : null;
}
// นับจำนวนทศนิยมของ step เพื่อล้างเศษ float หลังปัด
function decimalsOf(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const s = String(n);
  if (s.includes("e") || s.includes("E")) return 10; // เลขวิทยาศาสตร์ → ปลอดภัยไว้ก่อน
  const i = s.indexOf(".");
  return i < 0 ? 0 : s.length - i - 1;
}
function cleanFloat(v: number, digits: number): number {
  const d = Math.min(Math.max(digits, 0), 12);
  const f = Math.pow(10, d);
  return Math.round((v + (v >= 0 ? 1 : -1) * Number.EPSILON) * f) / f;
}
const EPS = 1e-9;
function applyMode(x: number, mode: RoundMode): number {
  if (mode === "up") return Math.ceil(x - EPS);
  if (mode === "down") return Math.floor(x + EPS);
  return Math.round(x);
}

// ปัดค่าเดียว: ถ้ามี step (>0) ปัดเป็นขั้น · ไม่งั้นปัดตามทศนิยม
export function roundValue(value: number, mode: RoundMode, step: number | null | undefined, decimals: number): number {
  if (step !== null && step !== undefined && step > 0) {
    const q = value / step;
    const qr = applyMode(q, mode);
    const raw = qr * step;
    return cleanFloat(raw, decimalsOf(step) + 2);
  }
  const d = Math.max(0, Math.floor(decimals));
  const f = Math.pow(10, d);
  const scaled = applyMode(value * f, mode);
  return cleanFloat(scaled / f, d + 2);
}

export function analyzeRound(header: Row, allRows: Row[], opts: RoundOptions): RoundResult {
  const inputRows = allRows.length;
  const rows = allRows.filter(isDataRow);
  const dataRows = rows.length;
  const width = Math.max(header.length, ...rows.map((r) => r.length), 1);

  const base = (msg: string): RoundResult => ({
    header: header.slice(),
    rows: rows.map((r) => r.slice()),
    addedCols: [],
    firstNewIndex: -1,
    replacedCol: -1,
    inputRows,
    dataRows,
    roundedRows: 0,
    skippedRows: 0,
    changedRows: 0,
    error: msg,
  });

  if (dataRows === 0) return base("ไม่มีแถวข้อมูล");
  if (opts.col < 0 || opts.col >= width) return base("เลือกคอลัมน์ที่จะปัดให้อยู่ในช่วง");
  if (opts.step !== null && opts.step !== undefined && opts.step < 0) return base("ขั้น (step) ต้องเป็นบวก");
  // step > 0 ใช้ปัดเป็นขั้น · step = 0/ว่าง → ใช้จำนวนทศนิยม
  const step = opts.step !== null && opts.step !== undefined && opts.step > 0 ? opts.step : null;
  const decimals = opts.decimals === null || opts.decimals === undefined ? 0 : Math.max(0, Math.floor(opts.decimals));

  let roundedRows = 0;
  let skippedRows = 0;
  let changedRows = 0;

  // คำนวณค่าที่ปัดต่อแถว
  const roundedVals: (number | null)[] = rows.map((r) => {
    const v = parseNumeric(cellAt(r, opts.col));
    if (v === null) {
      skippedRows++;
      return null;
    }
    const rv = roundValue(v, opts.mode, step, decimals);
    roundedRows++;
    if (rv !== v) changedRows++;
    return rv;
  });

  const replace = opts.replace === true;
  const colName = opts.colName && opts.colName.trim() !== "" ? opts.colName.trim() : "ปัดแล้ว";

  if (replace) {
    // ทับค่าในคอลัมน์เดิม เฉพาะช่องที่ปัดได้ (ช่องไม่ใช่ตัวเลข = คงเดิม)
    const outHeader = header.slice();
    while (outHeader.length < width) outHeader.push(null);
    const outRows: Row[] = rows.map((r, i) => {
      const out = r.slice();
      while (out.length < width) out.push(null);
      if (roundedVals[i] !== null) out[opts.col] = roundedVals[i];
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
      roundedRows,
      skippedRows,
      changedRows,
    };
  }

  // โหมดเติมคอลัมน์ใหม่ท้ายตาราง
  const outHeader = header.slice();
  while (outHeader.length < width) outHeader.push(null);
  const firstNewIndex = outHeader.length;
  outHeader.push(colName);

  const outRows: Row[] = rows.map((r, i) => {
    const out = r.slice();
    while (out.length < width) out.push(null);
    out.push(roundedVals[i]);
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
    roundedRows,
    skippedRows,
    changedRows,
  };
}

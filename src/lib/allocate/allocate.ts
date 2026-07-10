// ปันส่วนยอดรวมลงแต่ละแถวตามสัดส่วน (Proportional Allocation) — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case จริง: มีค่าขนส่ง/ต้นทุนรวมของตู้ 1 ก้อน → ปันส่วนลงแต่ละกล่อง/tracking ตาม "ฐาน" (น้ำหนัก/CBM/จำนวน)
//   → รู้ว่ากล่องไหนต้องคิดเงินเท่าไหร่ (คิดตามสัดส่วนที่กินพื้นที่/น้ำหนัก)
// ต่างจาก /group-share (บอกแค่ % / อันดับในกลุ่ม) — อันนี้ปันเป็น "ยอดจริง (บาท/กก.)" · ต่างจาก /calc-col (คูณ/หารตรง ๆ) — อันนี้ต้องรู้ผลรวมฐานทั้งคอลัมน์
// ปรัชญา: ผลรวมของยอดที่ปันส่วน = ยอดรวมเป๊ะเสมอ (largest remainder — เศษปัดไม่ทำเงินหาย/เกิน) ·
//   อ่านอย่างเดียว ไม่แก้ข้อมูลเดิม (เติมคอลัมน์ท้าย) · ทุกแถวออกครบ · ฐานไม่ใช่ตัวเลข/ติดลบ = เว้นว่าง ไม่ปันให้ (ไม่เดามั่ว)

import type { Cell, Row } from "@/lib/reconcile/types";

export interface AllocateOptions {
  basisCol: number; // คอลัมน์ฐานปันส่วน (ตัวเลข เช่น น้ำหนัก/CBM/จำนวน)
  total: number; // ยอดรวมที่จะปันส่วน (บาท ฯลฯ)
  round?: number; // ทศนิยมของยอดปันส่วน (default 2)
  amountName?: string; // ชื่อคอลัมน์ยอดปันส่วน (ว่าง = default)
  showShare?: boolean; // เพิ่มคอลัมน์ % สัดส่วน
}

export interface AllocateResult {
  header: Row; // หัวตาราง + คอลัมน์ที่เติม
  rows: Row[]; // แถวข้อมูล + ค่าที่เติม (ทุกแถว)
  addedCols: string[]; // ชื่อคอลัมน์ที่เติม
  firstNewIndex: number; // ตำแหน่งคอลัมน์ใหม่ตัวแรก
  inputRows: number; // แถว input ทั้งหมด
  dataRows: number; // แถวหลังตัดแถวว่างทั้งแถว
  allocatedRows: number; // แถวที่ปันส่วนได้ (ฐานเป็นเลข ≥ 0)
  skippedRows: number; // แถวที่ปันไม่ได้ (ฐานไม่ใช่ตัวเลข/ติดลบ → เว้นว่าง)
  basisTotal: number; // ผลรวมฐาน (เฉพาะแถวที่ปันได้)
  allocatedTotal: number; // ผลรวมยอดที่ปันจริง (= total ที่ปัดแล้ว) — ยืนยัน no-loss
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
function roundTo(v: number, digits: number | null | undefined): number {
  if (digits === null || digits === undefined) return v;
  const f = Math.pow(10, digits);
  return Math.round((v + Number.EPSILON) * f) / f;
}
function cellAt(row: Row, col: number): Cell {
  if (col < 0) return null;
  return col < row.length ? row[col] : null;
}

export function analyzeAllocate(header: Row, allRows: Row[], opts: AllocateOptions): AllocateResult {
  const inputRows = allRows.length;
  const rows = allRows.filter(isDataRow);
  const dataRows = rows.length;
  const width = Math.max(header.length, ...rows.map((r) => r.length), 1);

  const base = (msg: string): AllocateResult => ({
    header: header.slice(),
    rows: rows.map((r) => r.slice()),
    addedCols: [],
    firstNewIndex: -1,
    inputRows,
    dataRows,
    allocatedRows: 0,
    skippedRows: 0,
    basisTotal: 0,
    allocatedTotal: 0,
    error: msg,
  });

  if (dataRows === 0) return base("ไม่มีแถวข้อมูล");
  if (opts.basisCol < 0 || opts.basisCol >= width) return base("เลือกคอลัมน์ฐานปันส่วนให้อยู่ในช่วง");
  if (!Number.isFinite(opts.total)) return base("ใส่ยอดรวมที่จะปันส่วน");
  if (opts.total < 0) return base("ยอดรวมต้องไม่ติดลบ");

  const round = opts.round === null || opts.round === undefined ? 2 : Math.max(0, Math.floor(opts.round));
  const scale = Math.pow(10, round);

  // ฐานต่อแถว: ตัวเลข ≥ 0 = ปันได้ · null/ติดลบ = ข้าม (เว้นว่าง)
  const basis: (number | null)[] = rows.map((r) => {
    const v = parseNumeric(cellAt(r, opts.basisCol));
    if (v === null || v < 0) return null;
    return v;
  });
  const includeIdx: number[] = [];
  let basisTotal = 0;
  for (let i = 0; i < basis.length; i++) {
    if (basis[i] !== null) {
      includeIdx.push(i);
      basisTotal += basis[i]!;
    }
  }
  const allocatedRows = includeIdx.length;
  const skippedRows = dataRows - allocatedRows;

  if (allocatedRows === 0) return base("ไม่มีแถวที่ฐานเป็นตัวเลข ปันส่วนไม่ได้");
  if (basisTotal <= 0) return base("ผลรวมฐานปันส่วนเป็น 0 ปันส่วนไม่ได้");

  // === largest remainder method (หน่วย = 10^-round) → ผลรวมเป๊ะ ===
  const totalUnits = Math.round(opts.total * scale);
  // raw units ต่อแถวที่ปันได้
  const raw = includeIdx.map((i) => (totalUnits * basis[i]!) / basisTotal);
  const floorUnits = raw.map((x) => Math.floor(x));
  let sumFloor = 0;
  for (const f of floorUnits) sumFloor += f;
  let remainder = totalUnits - sumFloor; // จำนวนหน่วยที่เหลือแจก (0 ≤ remainder < allocatedRows)

  // แจก +1 หน่วยให้แถวที่เศษ (fractional part) มากสุดก่อน · เท่ากันแตกด้วย index (เสถียร)
  const order = raw
    .map((x, k) => ({ k, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.k - b.k);
  const extra = new Array(raw.length).fill(0);
  for (let j = 0; j < order.length && remainder > 0; j++) {
    extra[order[j].k] += 1;
    remainder -= 1;
  }

  // map units → allocation ต่อแถวที่ปันได้
  const allocByLocal: number[] = raw.map((_, k) => (floorUnits[k] + extra[k]) / scale);
  // แผนที่กลับไปยัง index ของแถวจริง
  const allocByRow: (number | null)[] = new Array(rows.length).fill(null);
  const shareByRow: (number | null)[] = new Array(rows.length).fill(null);
  for (let k = 0; k < includeIdx.length; k++) {
    const i = includeIdx[k];
    allocByRow[i] = allocByLocal[k];
    shareByRow[i] = roundTo((basis[i]! / basisTotal) * 100, Math.max(round, 2));
  }
  const allocatedTotal = totalUnits / scale;

  // ชื่อคอลัมน์
  const amountName = opts.amountName && opts.amountName.trim() !== "" ? opts.amountName.trim() : "ยอดปันส่วน";
  const addedCols: string[] = [amountName];
  if (opts.showShare) addedCols.push("% สัดส่วน");

  const outHeader = header.slice();
  while (outHeader.length < width) outHeader.push(null);
  const firstNewIndex = outHeader.length;
  for (const nm of addedCols) outHeader.push(nm);

  const outRows: Row[] = rows.map((r, i) => {
    const out = r.slice();
    while (out.length < width) out.push(null);
    out.push(allocByRow[i]);
    if (opts.showShare) out.push(shareByRow[i]);
    return out;
  });

  return {
    header: outHeader,
    rows: outRows,
    addedCols,
    firstNewIndex,
    inputRows,
    dataRows,
    allocatedRows,
    skippedRows,
    basisTotal: roundTo(basisTotal, 6),
    allocatedTotal,
  };
}

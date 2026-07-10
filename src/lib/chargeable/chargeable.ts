// คำนวณ "น้ำหนักคิดค่าขนส่ง" (chargeable weight) จากไฟล์ตาราง — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case จริง: packing list มีคอลัมน์ กว้าง/ยาว/สูง/จำนวน/น้ำหนัก อยู่แล้ว → อยากได้ CBM + น้ำหนักเชิงปริมาตร + น้ำหนักคิดเงิน ต่อแถว
//   → เติมคอลัมน์ท้ายตาราง (เลือกได้ว่าจะเอา CBM / น้ำหนักปริมาตร / น้ำหนักคิดเงิน)
// ต่างจาก /cbm (กรอกมือทีละรายการ) — อันนี้ทำ "ทั้งไฟล์" ทีเดียว โดยชี้คอลัมน์เอง
//   air: น้ำหนักปริมาตร = (กว้าง×ยาว×สูง cm)/divisor × จำนวน · คิดเงิน = max(น้ำหนักจริง, น้ำหนักปริมาตร)
//   sea (W/M): คิดเงิน = max(น้ำหนักจริง, CBM×1000)
// ปรัชญา: อ่านอย่างเดียว ไม่แก้ข้อมูลเดิม (เติมคอลัมน์ท้าย) · ทุกแถวออกครบ (ไม่หาย) ·
//   มิติไหนไม่ใช่ตัวเลข → ช่อง metric นั้นเว้นว่าง (ไม่เดามั่วเป็น 0) · น้ำหนักไม่กรอก → ใช้น้ำหนักปริมาตร/ปริมาตรล้วน

import type { Cell, Row } from "@/lib/reconcile/types";

export type DimUnit = "cm" | "m" | "inch";
export type FreightMode = "air" | "sea";
export type ChargeMetric = "cbm" | "volumetric" | "chargeable";

export const DIM_UNIT_LABEL: Record<DimUnit, string> = {
  cm: "เซนติเมตร (cm)",
  m: "เมตร (m)",
  inch: "นิ้ว (inch)",
};

export const MODE_LABEL: Record<FreightMode, string> = {
  air: "ทางอากาศ (air — ปริมาตร÷divisor)",
  sea: "ทางเรือ (sea — W/M = CBM×1000)",
};

export const METRIC_LABEL: Record<ChargeMetric, string> = {
  cbm: "CBM (ปริมาตร)",
  volumetric: "น้ำหนักเชิงปริมาตร",
  chargeable: "น้ำหนักคิดค่าขนส่ง",
};

// ตัวคูณแปลงหน่วย → เมตร (คิด CBM) และ → เซนติเมตร (คิดน้ำหนักปริมาตร air)
const TO_METER: Record<DimUnit, number> = { cm: 0.01, m: 1, inch: 0.0254 };
const TO_CM: Record<DimUnit, number> = { cm: 1, m: 100, inch: 2.54 };

export interface ChargeableOptions {
  lenCol: number; // คอลัมน์ ยาว (บังคับ)
  widthCol: number; // คอลัมน์ กว้าง (บังคับ)
  heightCol: number; // คอลัมน์ สูง (บังคับ)
  qtyCol?: number | null; // คอลัมน์ จำนวนกล่อง (ไม่มี = 1)
  weightCol?: number | null; // คอลัมน์ น้ำหนักจริง (kg) — ไม่มี = คิดจากปริมาตรล้วน
  unit: DimUnit; // หน่วยของมิติ
  mode: FreightMode; // air / sea
  divisor?: number; // air divisor (default 6000) — ใช้เฉพาะ air
  round?: number | null; // ปัดทศนิยม (null = ไม่ปัด)
  metrics: ChargeMetric[]; // คอลัมน์ที่จะเติม (ตามลำดับ)
}

export interface ChargeableResult {
  header: Row; // หัวตาราง + คอลัมน์ที่เติม
  rows: Row[]; // แถวข้อมูล + ค่าที่เติม (ทุกแถว)
  addedCols: string[]; // ชื่อคอลัมน์ที่เติม
  firstNewIndex: number; // ตำแหน่งคอลัมน์ใหม่ตัวแรก
  inputRows: number; // แถว input ทั้งหมด
  dataRows: number; // แถวหลังตัดแถวว่างทั้งแถว
  computedRows: number; // แถวที่คิด "น้ำหนักคิดเงิน" ออกได้ (มิติครบ)
  skippedRows: number; // แถวที่มิติไม่ครบ → เว้นว่าง
  totalChargeable: number; // ยอดรวม น้ำหนักคิดเงิน (เฉพาะแถวที่คิดได้)
  totalCbm: number; // ยอดรวม CBM (เฉพาะแถวที่คิดได้)
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
function cellAt(row: Row, col: number | null | undefined): Cell {
  if (col === null || col === undefined || col < 0) return null;
  return col < row.length ? row[col] : null;
}

export function analyzeChargeable(header: Row, allRows: Row[], opts: ChargeableOptions): ChargeableResult {
  const inputRows = allRows.length;
  const rows = allRows.filter(isDataRow);
  const dataRows = rows.length;
  const width = Math.max(header.length, ...rows.map((r) => r.length), 1);

  const base = (msg: string): ChargeableResult => ({
    header: header.slice(),
    rows: rows.map((r) => r.slice()),
    addedCols: [],
    firstNewIndex: -1,
    inputRows,
    dataRows,
    computedRows: 0,
    skippedRows: 0,
    totalChargeable: 0,
    totalCbm: 0,
    error: msg,
  });

  if (dataRows === 0) return base("ไม่มีแถวข้อมูล");
  const dimCols = [opts.lenCol, opts.widthCol, opts.heightCol];
  for (const c of dimCols) {
    if (c === null || c === undefined || c < 0 || c >= width) return base("เลือกคอลัมน์ กว้าง/ยาว/สูง ให้ครบและอยู่ในช่วง");
  }
  if (opts.qtyCol !== null && opts.qtyCol !== undefined && opts.qtyCol >= 0 && opts.qtyCol >= width)
    return base("คอลัมน์จำนวนอยู่นอกช่วง");
  if (opts.weightCol !== null && opts.weightCol !== undefined && opts.weightCol >= 0 && opts.weightCol >= width)
    return base("คอลัมน์น้ำหนักอยู่นอกช่วง");
  if (!opts.metrics || opts.metrics.length === 0) return base("เลือกอย่างน้อย 1 ค่าที่จะเติม");

  const mF = TO_METER[opts.unit];
  const cmF = TO_CM[opts.unit];
  const divisor = opts.divisor && opts.divisor > 0 ? opts.divisor : 6000;
  const hasWeightCol = opts.weightCol !== null && opts.weightCol !== undefined && opts.weightCol >= 0;
  const hasQtyCol = opts.qtyCol !== null && opts.qtyCol !== undefined && opts.qtyCol >= 0;

  interface RowCalc {
    cbm: number | null; // ปริมาตรรวมของแถว (m³) — null ถ้ามิติไม่ครบ
    volumetric: number | null; // น้ำหนักปริมาตร (air) — null ถ้ามิติไม่ครบ
    chargeable: number | null; // น้ำหนักคิดเงิน — null ถ้าคิดไม่ได้
  }

  function computeRow(row: Row): RowCalc {
    const l = parseNumeric(cellAt(row, opts.lenCol));
    const w = parseNumeric(cellAt(row, opts.widthCol));
    const h = parseNumeric(cellAt(row, opts.heightCol));
    // จำนวน: ไม่มีคอลัมน์ = 1 · มีคอลัมน์แต่ค่าไม่ใช่ตัวเลข = ถือว่าไม่ครบ (null)
    let qty: number | null = 1;
    if (hasQtyCol) qty = parseNumeric(cellAt(row, opts.qtyCol));
    // น้ำหนักจริง: ไม่มีคอลัมน์ = null (ไม่กรอก) · มีคอลัมน์แต่ไม่ใช่ตัวเลข = null
    const actualWeight = hasWeightCol ? parseNumeric(cellAt(row, opts.weightCol)) : null;

    if (l === null || w === null || h === null || qty === null) {
      return { cbm: null, volumetric: null, chargeable: null };
    }
    const cbm = l * mF * (w * mF) * (h * mF) * qty; // m³ รวมทั้งแถว
    const volumetric = ((l * cmF) * (w * cmF) * (h * cmF) / divisor) * qty; // kg (air)

    let chargeable: number;
    if (opts.mode === "air") {
      chargeable = actualWeight !== null ? Math.max(actualWeight, volumetric) : volumetric;
    } else {
      const wm = cbm * 1000; // W/M ทะเล
      chargeable = actualWeight !== null ? Math.max(actualWeight, wm) : wm;
    }
    return { cbm, volumetric, chargeable };
  }

  // ชื่อคอลัมน์ที่เติม
  const nameFor = (m: ChargeMetric): string => {
    if (m === "cbm") return "CBM";
    if (m === "volumetric") return `น้ำหนักปริมาตร (÷${divisor})`;
    return opts.mode === "air" ? "น้ำหนักคิดเงิน (air)" : "น้ำหนักคิดเงิน (W/M)";
  };
  const addedCols = opts.metrics.map(nameFor);

  const outHeader = header.slice();
  while (outHeader.length < width) outHeader.push(null);
  const firstNewIndex = outHeader.length;
  for (const nm of addedCols) outHeader.push(nm);

  let computedRows = 0;
  let skippedRows = 0;
  let totalChargeable = 0;
  let totalCbm = 0;

  const outRows: Row[] = rows.map((r) => {
    const out = r.slice();
    while (out.length < width) out.push(null);
    const calc = computeRow(r);
    if (calc.chargeable === null) skippedRows++;
    else {
      computedRows++;
      totalChargeable += calc.chargeable;
      if (calc.cbm !== null) totalCbm += calc.cbm;
    }
    for (const m of opts.metrics) {
      let cell: Cell = null;
      const val = m === "cbm" ? calc.cbm : m === "volumetric" ? calc.volumetric : calc.chargeable;
      if (val !== null) cell = roundTo(val, opts.round);
      out.push(cell);
    }
    return out;
  });

  return {
    header: outHeader,
    rows: outRows,
    addedCols,
    firstNewIndex,
    inputRows,
    dataRows,
    computedRows,
    skippedRows,
    totalChargeable: roundTo(totalChargeable, opts.round),
    totalCbm: roundTo(totalCbm, opts.round),
  };
}

// คอลัมน์คำนวณ (computed column) — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case จริง: เติมคอลัมน์ที่คำนวณจากของเดิม — น้ำหนัก × เรต = ค่าขนส่ง · CBM × 7000 = น้ำหนักคิดเงินขั้นต่ำ ·
//   จำนวนกล่อง × ราคาต่อกล่อง · กxยxส (ทำทีละคู่) · แปลงหน่วยด้วยตัวคูณคงที่
// ปรัชญา: **เติมคอลัมน์ใหม่ท้ายตาราง ไม่แตะคอลัมน์เดิม (ไม่ทำข้อมูลหาย)** · ช่องที่คำนวณไม่ได้ (ไม่ใช่ตัวเลข/หารศูนย์)
//   = ปล่อยว่าง ไม่แทนค่ามั่ว (ไม่เดา 0) + นับ/โชว์ให้เห็น · ทุกแถวออกครบเท่าเข้า

import type { Cell, Row } from "@/lib/reconcile/types";

export type BinOp = "+" | "-" | "*" | "/";

export const OP_LABEL: Record<BinOp, string> = {
  "+": "บวก (+)",
  "-": "ลบ (−)",
  "*": "คูณ (×)",
  "/": "หาร (÷)",
};

export interface Operand {
  kind: "col" | "const";
  col?: number; // ใช้เมื่อ kind = "col"
  value?: number; // ใช้เมื่อ kind = "const"
}

export interface CalcColOptions {
  left: Operand;
  op: BinOp;
  right: Operand;
  newName: string; // ชื่อหัวคอลัมน์ใหม่
  round?: number | null; // ปัดทศนิยมกี่ตำแหน่ง (null/undefined = ไม่ปัด)
}

export interface CalcSample {
  rowIndex: number;
  left: string;
  right: string;
  value: number;
}

export interface CalcColResult {
  header: string[];
  rows: Row[];
  inputRows: number;
  computed: number; // แถวที่คำนวณได้ (ผลเป็นตัวเลข)
  skipped: number; // แถวที่คำนวณไม่ได้ (operand ไม่ใช่ตัวเลข / หารศูนย์) → ช่องใหม่ว่าง
  newColIndex: number; // ตำแหน่งคอลัมน์ใหม่ (= header เดิม.length)
  samples: CalcSample[]; // ตัวอย่างที่คำนวณได้ (cap 50)
  error?: string; // ถ้ามี = header/rows คืนของเดิมไม่แตะ
}

// parse ตัวเลขแบบเดียวกับ diff/stats: ตัด comma + trim · boolean/Infinity/ว่าง → null
function parseNumeric(v: Cell): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return null;
  const s = String(v).replace(/,/g, "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function operandValue(row: Row, op: Operand): number | null {
  if (op.kind === "const") {
    return typeof op.value === "number" && Number.isFinite(op.value) ? op.value : null;
  }
  const c = op.col ?? -1;
  if (c < 0) return null;
  return parseNumeric(c < row.length ? (row[c] ?? null) : null);
}

function operandLabel(row: Row, op: Operand): string {
  if (op.kind === "const") return String(op.value ?? "");
  const c = op.col ?? -1;
  const v = c >= 0 && c < row.length ? (row[c] ?? null) : null;
  return v === null || v === undefined ? "" : String(v);
}

function applyOp(l: number, op: BinOp, r: number): number | null {
  switch (op) {
    case "+":
      return l + r;
    case "-":
      return l - r;
    case "*":
      return l * r;
    case "/":
      return r === 0 ? null : l / r;
    default:
      return null;
  }
}

function roundTo(n: number, places: number): number {
  if (!Number.isFinite(places) || places < 0) return n;
  const f = Math.pow(10, Math.min(places, 12));
  return Math.round((n + Number.EPSILON) * f) / f;
}

export function calcColumn(
  header: string[],
  dataRows: Row[],
  opts: CalcColOptions,
): CalcColResult {
  const newColIndex = header.length;
  const cloneRows: Row[] = dataRows.map((r) => r.slice());
  const base: CalcColResult = {
    header: header.slice(),
    rows: cloneRows,
    inputRows: dataRows.length,
    computed: 0,
    skipped: 0,
    newColIndex,
    samples: [],
  };

  const name = opts.newName.trim();
  if (name === "") return { ...base, error: "ตั้งชื่อคอลัมน์ใหม่ก่อน" };

  const checkOperand = (o: Operand, side: string): string | null => {
    if (o.kind === "col") {
      if (o.col === undefined || o.col < 0 || o.col >= header.length)
        return `เลือกคอลัมน์ฝั่ง${side}`;
    } else if (o.value === undefined || !Number.isFinite(o.value)) {
      return `ใส่ค่าคงที่ฝั่ง${side}`;
    }
    return null;
  };
  const errL = checkOperand(opts.left, "ซ้าย");
  if (errL) return { ...base, error: errL };
  const errR = checkOperand(opts.right, "ขวา");
  if (errR) return { ...base, error: errR };

  const round = opts.round ?? null;
  const newHeader = [...header, name];

  const out: Row[] = [];
  let computed = 0;
  let skipped = 0;
  const samples: CalcSample[] = [];

  dataRows.forEach((row, i) => {
    // ทำให้แถวเป็นสี่เหลี่ยม (aligned กับ header เดิม) แล้วเติมช่องผลท้ายสุด
    const nr: Row = [];
    for (let c = 0; c < header.length; c++) nr.push(row[c] ?? null);

    const l = operandValue(row, opts.left);
    const r = operandValue(row, opts.right);
    let result: number | null = null;
    if (l !== null && r !== null) result = applyOp(l, opts.op, r);

    if (result === null) {
      skipped++;
      nr.push(null); // คำนวณไม่ได้ → ปล่อยว่าง (ไม่เดามั่ว)
    } else {
      const val = round !== null ? roundTo(result, round) : result;
      computed++;
      if (samples.length < 50) {
        samples.push({
          rowIndex: i,
          left: operandLabel(row, opts.left),
          right: operandLabel(row, opts.right),
          value: val,
        });
      }
      nr.push(val);
    }
    out.push(nr);
  });

  return {
    header: newHeader,
    rows: out,
    inputRows: dataRows.length,
    computed,
    skipped,
    newColIndex,
    samples,
  };
}

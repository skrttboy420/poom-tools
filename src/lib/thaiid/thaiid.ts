// ตรวจเลขบัตรประชาชน / เลขประจำตัวผู้เสียภาษี 13 หลัก (check digit) — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case จริง: ใบแจ้งหนี้/ใบกำกับ/ทะเบียนผู้ส่ง (shipper) มีเลข 13 หลัก พิมพ์ผิดได้ง่าย
//   → ตรวจ "เช็คดิจิต" (หลักสุดท้าย) ว่าถูกต้องไหม ก่อนเอาเข้า Pacred (จับ typo ได้)
// รูปแบบ: 13 หลักเป็นตัวเลขล้วน (บัตรประชาชนบุคคล + เลขนิติบุคคล/ผู้เสียภาษีใช้อัลกอริทึมเดียวกัน)
// อัลกอริทึม: หลักที่ 1..12 คูณด้วยน้ำหนัก 13,12,...,2 ตามลำดับ · รวม · mod 11 ·
//   check digit = (11 - (sum mod 11)) mod 10  (หลักที่ 13 ต้องตรงกับค่านี้)
// ปรัชญา: deterministic ล้วน (ยืนยันด้วย vector: 123456789012 → 1) ·
//   ไม่แก้เลขเดิม (แค่เพิ่มคอลัมน์ "ผลตรวจ") · ค่าที่อ่านไม่ได้/ว่าง → ข้าม โชว์ให้ดูก่อน (ไม่ตัดสินมั่ว)

import type { Cell, Row } from "@/lib/reconcile/types";

export type CheckStatus = "valid" | "bad-format" | "bad-check";

export interface ThaiIdValidation {
  ok: boolean; // check digit ถูกต้อง (รูปแบบถูก + หลักตรงตามคำนวณ)
  status: CheckStatus;
  normalized: string; // ตัดช่องว่าง/ขีด แล้ว (13 หลักถ้ารูปแบบถูก)
  expected: number | null; // เช็คดิจิตที่ควรจะเป็น (0..9) · null ถ้ารูปแบบผิด
  given: number | null; // เช็คดิจิตที่ให้มา · null ถ้ารูปแบบผิด
}

export interface ThaiIdFinding {
  row: number; // index แถวข้อมูล (0-based)
  value: string; // ค่าเดิมตามที่พิมพ์
  normalized: string;
  status: CheckStatus;
  expected: number | null;
}

export interface ThaiIdCheckOptions {
  newColName?: string; // ชื่อหัวคอลัมน์ผลตรวจ (default "ผลตรวจเลข 13 หลัก")
}

export interface ThaiIdCheckResult {
  header: string[];
  rows: Row[]; // ตารางเดิม + คอลัมน์ผลตรวจต่อท้าย
  inputRows: number;
  checked: number; // ช่องที่มีค่า (ไม่ว่าง) ที่ตรวจ
  valid: number;
  invalidFormat: number;
  invalidCheck: number;
  blank: number; // ช่องว่าง (ข้าม)
  findings: ThaiIdFinding[]; // เฉพาะที่ผิด (unique cap 50)
  newColIndex: number; // ตำแหน่งคอลัมน์ผลตรวจ (= width เดิม) · -1 ถ้า error
  error?: string;
}

const SAMPLE_CAP = 50;

function isBlankCell(v: Cell): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

// คำนวณเช็คดิจิตจาก prefix 12 หลัก · คืน 0..9 หรือ null ถ้าไม่ใช่ตัวเลข 12 หลัก
export function thaiIdCheckDigit(prefix: string): number | null {
  if (prefix.length !== 12) return null;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const ch = prefix[i];
    if (ch < "0" || ch > "9") return null;
    const d = ch.charCodeAt(0) - 48;
    sum += d * (13 - i); // น้ำหนัก 13,12,...,2
  }
  return (11 - (sum % 11)) % 10;
}

// ตรวจเลข 13 หลัก 1 ค่า
export function validateThaiId(raw: string): ThaiIdValidation {
  const normalized = String(raw).replace(/[\s-]/g, "");
  if (!/^\d{13}$/.test(normalized)) {
    return { ok: false, status: "bad-format", normalized, expected: null, given: null };
  }
  const prefix = normalized.slice(0, 12);
  const given = normalized.charCodeAt(12) - 48;
  const expected = thaiIdCheckDigit(prefix);
  if (expected === null) {
    // ไม่ควรเกิด (regex ผ่านแล้ว) แต่กันไว้
    return { ok: false, status: "bad-format", normalized, expected: null, given };
  }
  if (expected !== given) {
    return { ok: false, status: "bad-check", normalized, expected, given };
  }
  return { ok: true, status: "valid", normalized, expected, given };
}

const STATUS_TEXT: Record<CheckStatus, string> = {
  valid: "✓ ถูกต้อง",
  "bad-format": "✗ รูปแบบผิด",
  "bad-check": "✗ เช็คดิจิตผิด",
};

// ป้ายผลตรวจสำหรับใส่ในคอลัมน์ (bad-check บอกเลขที่ควรเป็นด้วย)
export function resultLabel(v: ThaiIdValidation): string {
  if (v.status === "bad-check" && v.expected !== null) {
    return `✗ เช็คดิจิตผิด (ควรลงท้าย ${v.expected})`;
  }
  return STATUS_TEXT[v.status];
}

export function checkThaiIds(
  header: string[],
  dataRows: Row[],
  col: number,
  opts: ThaiIdCheckOptions = {},
): ThaiIdCheckResult {
  const width = header.length;
  const newColIndex = width;
  const newName = opts.newColName && opts.newColName.trim() !== "" ? opts.newColName.trim() : "ผลตรวจเลข 13 หลัก";

  if (col < 0 || col >= width) {
    // คืนตารางเดิม (ไม่เพิ่มคอลัมน์) พร้อม error
    return {
      header: header.slice(),
      rows: dataRows.map((r) => r.slice()),
      inputRows: dataRows.length,
      checked: 0,
      valid: 0,
      invalidFormat: 0,
      invalidCheck: 0,
      blank: 0,
      findings: [],
      newColIndex: -1,
      error: "เลือกคอลัมน์เลข 13 หลักที่จะตรวจ",
    };
  }

  let checked = 0;
  let valid = 0;
  let invalidFormat = 0;
  let invalidCheck = 0;
  let blank = 0;
  const findings: ThaiIdFinding[] = [];

  const out: Row[] = dataRows.map((row, ri) => {
    const nr: Row = [];
    for (let c = 0; c < width; c++) nr.push(row[c] ?? null);

    const raw = nr[col];
    if (isBlankCell(raw)) {
      blank++;
      nr.push("");
      return nr;
    }

    checked++;
    const v = validateThaiId(String(raw));
    if (v.status === "valid") valid++;
    else if (v.status === "bad-format") invalidFormat++;
    else invalidCheck++;

    if (!v.ok && findings.length < SAMPLE_CAP) {
      findings.push({ row: ri, value: String(raw), normalized: v.normalized, status: v.status, expected: v.expected });
    }

    nr.push(resultLabel(v));
    return nr;
  });

  return {
    header: [...header, newName],
    rows: out,
    inputRows: dataRows.length,
    checked,
    valid,
    invalidFormat,
    invalidCheck,
    blank,
    findings,
    newColIndex,
  };
}

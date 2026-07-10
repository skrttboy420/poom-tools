// ตรวจเลขตู้คอนเทนเนอร์ตามมาตรฐาน ISO 6346 (check digit) — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case จริง: packing list / export มีเลขตู้ (container no.) เยอะ พิมพ์ผิดได้ง่าย
//   → ตรวจ "เช็คดิจิต" (หลักสุดท้าย) ว่าถูกต้องไหม ก่อนเอาเข้า Pacred (จับ typo ได้)
// รูปแบบ ISO 6346: 4 ตัวอักษร (owner code 3 + category 1) + 6 ตัวเลข (serial) + 1 ตัวเลข (check digit)
//   เช่น CSQU3054383 → owner CSQ · category U · serial 305438 · check digit 3
// อัลกอริทึม: แต่ละตัวอักษรมีค่าประจำ (A=10, B=12, ... ข้ามค่าที่หารด้วย 11 ลงตัว)
//   คูณด้วย 2^ตำแหน่ง (0..9) แล้วรวม · mod 11 · ถ้าได้ 10 → check digit = 0
// ปรัชญา: deterministic ล้วน (ยืนยันได้ด้วย vector ที่รู้ผลจริง เช่น CSQU3054383=3) ·
//   ไม่แก้เลขตู้เดิม (แค่เพิ่มคอลัมน์ "ผลตรวจ") · ค่าที่อ่านไม่ได้/ว่าง → ข้าม โชว์ให้ดูก่อน (ไม่ตัดสินมั่ว)

import type { Cell, Row } from "@/lib/reconcile/types";

export type CheckStatus = "valid" | "bad-format" | "bad-check";

export interface ContainerValidation {
  ok: boolean; // check digit ถูกต้อง (รูปแบบถูก + หลักตรงตามคำนวณ)
  status: CheckStatus;
  normalized: string; // ตัดช่องว่าง/ขีด + พิมพ์ใหญ่แล้ว
  expected: number | null; // เช็คดิจิตที่ควรจะเป็น (0..9) · null ถ้ารูปแบบผิด
  given: number | null; // เช็คดิจิตที่ให้มา · null ถ้ารูปแบบผิด
  category: string | null; // ตัวอักษรที่ 4 (U/J/Z ปกติ) · null ถ้ารูปแบบผิด
}

export interface ContainerFinding {
  row: number; // index แถวข้อมูล (0-based)
  value: string; // ค่าเดิมตามที่พิมพ์
  normalized: string;
  status: CheckStatus;
  expected: number | null;
}

export interface ContainerCheckOptions {
  newColName?: string; // ชื่อหัวคอลัมน์ผลตรวจ (default "ผลตรวจเลขตู้")
}

export interface ContainerCheckResult {
  header: string[];
  rows: Row[]; // ตารางเดิม + คอลัมน์ผลตรวจต่อท้าย
  inputRows: number;
  checked: number; // ช่องที่มีค่า (ไม่ว่าง) ที่ตรวจ
  valid: number;
  invalidFormat: number;
  invalidCheck: number;
  blank: number; // ช่องว่าง (ข้าม)
  findings: ContainerFinding[]; // เฉพาะที่ผิด (unique cap 50)
  newColIndex: number; // ตำแหน่งคอลัมน์ผลตรวจ (= width เดิม)
  error?: string;
}

const SAMPLE_CAP = 50;

function isBlankCell(v: Cell): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

// ค่าประจำตัวอักษร A-Z ตาม ISO 6346 (เริ่ม A=10 เพิ่มทีละ 1 ข้ามค่าที่หาร 11 ลงตัว)
// A=10 B=12 C=13 ... K=21 L=23 ... U=32 V=34 ... Z=38
export function letterValue(ch: string): number {
  const code = ch.charCodeAt(0);
  if (code < 65 || code > 90) return -1; // ไม่ใช่ A-Z
  let val = 10;
  for (let c = 65; c <= 90; c++) {
    while (val % 11 === 0) val++;
    if (c === code) return val;
    val++;
  }
  return -1;
}

// คำนวณเช็คดิจิตจาก prefix 10 ตัว (4 ตัวอักษร + 6 ตัวเลข) · คืน 0..9 หรือ null ถ้า char ผิด
export function containerCheckDigit(prefix: string): number | null {
  if (prefix.length !== 10) return null;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = prefix[i];
    let v: number;
    if (i < 4) {
      v = letterValue(ch);
      if (v < 0) return null;
    } else {
      if (ch < "0" || ch > "9") return null;
      v = ch.charCodeAt(0) - 48;
    }
    sum += v * Math.pow(2, i);
  }
  const mod = sum % 11;
  return mod === 10 ? 0 : mod;
}

// ตรวจเลขตู้ 1 ค่า
export function validateContainer(raw: string): ContainerValidation {
  const normalized = String(raw).toUpperCase().replace(/[\s-]/g, "");
  if (!/^[A-Z]{4}[0-9]{7}$/.test(normalized)) {
    return { ok: false, status: "bad-format", normalized, expected: null, given: null, category: null };
  }
  const category = normalized[3];
  const prefix = normalized.slice(0, 10);
  const given = normalized.charCodeAt(10) - 48;
  const expected = containerCheckDigit(prefix);
  if (expected === null) {
    // ไม่ควรเกิด (regex ผ่านแล้ว) แต่กันไว้
    return { ok: false, status: "bad-format", normalized, expected: null, given, category };
  }
  if (expected !== given) {
    return { ok: false, status: "bad-check", normalized, expected, given, category };
  }
  return { ok: true, status: "valid", normalized, expected, given, category };
}

const STATUS_TEXT: Record<CheckStatus, string> = {
  valid: "✓ ถูกต้อง",
  "bad-format": "✗ รูปแบบผิด",
  "bad-check": "✗ เช็คดิจิตผิด",
};

// ป้ายผลตรวจสำหรับใส่ในคอลัมน์ (bad-check บอกเลขที่ควรเป็นด้วย)
export function resultLabel(v: ContainerValidation): string {
  if (v.status === "bad-check" && v.expected !== null) {
    return `✗ เช็คดิจิตผิด (ควรเป็น ${v.expected})`;
  }
  return STATUS_TEXT[v.status];
}

export function checkContainers(
  header: string[],
  dataRows: Row[],
  col: number,
  opts: ContainerCheckOptions = {},
): ContainerCheckResult {
  const width = header.length;
  const newColIndex = width;
  const newName = opts.newColName && opts.newColName.trim() !== "" ? opts.newColName.trim() : "ผลตรวจเลขตู้";

  const base: ContainerCheckResult = {
    header: [...header, newName],
    rows: dataRows.map((r) => {
      const nr: Row = [];
      for (let c = 0; c < width; c++) nr.push(r[c] ?? null);
      nr.push("");
      return nr;
    }),
    inputRows: dataRows.length,
    checked: 0,
    valid: 0,
    invalidFormat: 0,
    invalidCheck: 0,
    blank: 0,
    findings: [],
    newColIndex,
  };

  if (col < 0 || col >= width) {
    // คืนตารางเดิม (ไม่เพิ่มคอลัมน์) พร้อม error
    return {
      ...base,
      header: header.slice(),
      rows: dataRows.map((r) => r.slice()),
      newColIndex: -1,
      error: "เลือกคอลัมน์เลขตู้ที่จะตรวจ",
    };
  }

  let checked = 0;
  let valid = 0;
  let invalidFormat = 0;
  let invalidCheck = 0;
  let blank = 0;
  const findings: ContainerFinding[] = [];

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
    const v = validateContainer(String(raw));
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

// แปลงตัวพิมพ์ใหญ่/เล็กในคอลัมน์ (case converter) — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case จริง: รหัส forwarder / เลข tracking / เลขตู้ ที่พิมพ์มาปนตัวใหญ่-เล็ก
//   เช่น "ky001" กับ "KY001" reconcile แล้วหาคู่ไม่เจอ (มองเป็นคนละค่า)
//   → normalize ให้เป็นตัวพิมพ์เดียวกันก่อนเทียบ/เข้า Pacred
// ปรัชญา:
//   - **แค่เปลี่ยน "ตัวพิมพ์" ไม่ลบ/ไม่เพิ่มตัวอักษร** (ความยาวเท่าเดิม ยกเว้นตัวอักษรที่มี case)
//   - แตะเฉพาะช่องที่เป็น "ข้อความ" · number/boolean/null = ข้าม (case ไม่มีความหมายกับตัวเลข + กัน type เพี้ยน)
//   - ภาษาไทยไม่มี case → ผ่านทะลุไม่เปลี่ยน (toUpperCase/toLowerCase ของไทยคืนค่าเดิม)
//   - ไม่ทำแถวหาย (จำนวนแถวเท่าเดิม) · input ไม่ถูก mutate · โชว์ตัวอย่างก่อน→หลัง

import type { Cell, Row } from "@/lib/reconcile/types";

export type CaseMode = "upper" | "lower" | "title" | "sentence";

export interface CaseOptions {
  cols: number[]; // คอลัมน์ที่จะแปลง (ต้องระบุอย่างน้อย 1)
  mode: CaseMode; // รูปแบบตัวพิมพ์
}

export interface CaseSample {
  row: number; // index แถวข้อมูล (0-based)
  col: number;
  before: string;
  after: string;
}

export interface CaseResult {
  header: string[];
  rows: Row[];
  cellsChanged: number;
  rowsAffected: number;
  changedCount: number; // ช่องที่ค่าเปลี่ยนจริง
  skippedNonString: number; // ช่องที่ไม่ใช่ข้อความ (number/bool) → ข้าม
  blankSkipped: number; // ช่องว่าง/null → ข้าม
  samples: CaseSample[]; // cap 50
  inputRows: number;
  error?: string; // ถ้ามี = header/rows คืนของเดิมไม่แตะ
}

const SAMPLE_CAP = 50;

function isBlankCell(v: Cell): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

// ทำ Title Case: ตัวแรกของแต่ละคำ (คั่นด้วยช่องว่าง) เป็นตัวใหญ่ ที่เหลือเป็นตัวเล็ก
// ใช้ regex จับ "run ของตัวอักษร/ตัวเลข" แล้วจัดเฉพาะตัวแรก — คงตัวคั่น (ช่องว่าง/ขีด/จุด) ตามเดิม
function toTitleCase(s: string): string {
  // จับกลุ่มตัวอักษร (Unicode letter) ต่อเนื่อง แล้วทำตัวแรกใหญ่ ที่เหลือเล็ก
  return s.replace(/\p{L}+/gu, (word) => {
    const first = Array.from(word)[0];
    const rest = Array.from(word).slice(1).join("");
    return first.toUpperCase() + rest.toLowerCase();
  });
}

// Sentence case: ตัวอักษรตัวแรกของ "ทั้งช่อง" เป็นตัวใหญ่ ที่เหลือเป็นตัวเล็ก
function toSentenceCase(s: string): string {
  const lower = s.toLowerCase();
  // หาตำแหน่งตัวอักษรตัวแรก แล้วทำเป็นตัวใหญ่
  const chars = Array.from(lower);
  for (let i = 0; i < chars.length; i++) {
    if (/\p{L}/u.test(chars[i])) {
      chars[i] = chars[i].toUpperCase();
      break;
    }
  }
  return chars.join("");
}

// คืน string ที่แปลงแล้ว (ถ้าไม่เปลี่ยน คืนค่าเดิมเป๊ะ)
function applyCase(s: string, mode: CaseMode): string {
  switch (mode) {
    case "upper":
      return s.toUpperCase();
    case "lower":
      return s.toLowerCase();
    case "title":
      return toTitleCase(s);
    case "sentence":
      return toSentenceCase(s);
    default:
      return s;
  }
}

export function convertCase(header: string[], dataRows: Row[], opts: CaseOptions): CaseResult {
  const width = header.length;
  const base: CaseResult = {
    header: header.slice(),
    rows: dataRows.map((r) => r.slice()),
    cellsChanged: 0,
    rowsAffected: 0,
    changedCount: 0,
    skippedNonString: 0,
    blankSkipped: 0,
    samples: [],
    inputRows: dataRows.length,
  };

  const mode = opts.mode;
  if (mode !== "upper" && mode !== "lower" && mode !== "title" && mode !== "sentence") {
    return { ...base, error: "เลือกรูปแบบตัวพิมพ์ (ใหญ่/เล็ก/ขึ้นต้นคำ/ขึ้นต้นประโยค)" };
  }

  const cols = (opts.cols ?? []).filter((c) => Number.isInteger(c) && c >= 0 && c < width);
  if (cols.length === 0) {
    return { ...base, error: "เลือกคอลัมน์ที่จะแปลงตัวพิมพ์อย่างน้อย 1 คอลัมน์" };
  }
  const colSet = new Set(cols);

  let cellsChanged = 0;
  let changedCount = 0;
  let skippedNonString = 0;
  let blankSkipped = 0;
  const affectedRows = new Set<number>();
  const samples: CaseSample[] = [];

  const rows: Row[] = dataRows.map((row, ri) => {
    // ทำให้เป็นสี่เหลี่ยม (กว้างเท่า header อย่างน้อย)
    const w = Math.max(width, row.length);
    const nr: Row = [];
    for (let c = 0; c < w; c++) nr.push(row[c] ?? null);

    for (const c of colSet) {
      const raw = nr[c];
      if (isBlankCell(raw)) {
        blankSkipped++;
        continue;
      }
      // แตะเฉพาะช่องที่เป็น string จริง (number/boolean = ข้าม กัน type เพี้ยน)
      if (typeof raw !== "string") {
        skippedNonString++;
        continue;
      }
      const before = raw;
      const after = applyCase(before, mode);
      if (after === before) continue;

      nr[c] = after;
      cellsChanged++;
      changedCount++;
      affectedRows.add(ri);

      if (samples.length < SAMPLE_CAP) {
        samples.push({ row: ri, col: c, before, after });
      }
    }
    return nr;
  });

  return {
    ...base,
    rows,
    cellsChanged,
    rowsAffected: affectedRows.size,
    changedCount,
    skippedNonString,
    blankSkipped,
    samples,
  };
}

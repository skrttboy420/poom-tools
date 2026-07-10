// เติม/ตัดความยาวค่าในคอลัมน์ (pad & align) — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case จริง: รหัส/เลขกล่อง/tracking ที่ระบบต่างเก็บความยาวไม่ตรงกัน เช่น "007" กลายเป็น "7"
//   (Excel/CSV ตัดเลข 0 นำหน้า) → พอ reconcile แล้ว "007" ≠ "7" หาคู่ไม่เจอ
//   → เติมเลข 0 นำหน้าให้ครบความกว้างเดียวกัน ก่อนเอาไปเทียบ/เข้า Pacred
// ปรัชญา:
//   - **เติมอย่างเดียว = ปลอดภัย (ไม่ลบตัวอักษร)** เป็นค่า default · truncate ลบข้อมูล → opt-in + โชว์ตัวอย่างก่อน→หลัง + นับจำนวนที่ถูกตัด (ไม่ตัดเงียบ)
//   - แตะเฉพาะคอลัมน์ที่เลือก · ช่องว่าง/null = ข้าม (ไม่สร้างค่าจากที่ว่าง เช่น "" → "000")
//   - ไม่ทำแถวหาย (จำนวนแถวเท่าเดิม) · input ไม่ถูก mutate

import type { Cell, Row } from "@/lib/reconcile/types";

export type PadMode = "pad" | "truncate" | "pad-truncate";
export type PadSide = "left" | "right";

export interface PadOptions {
  cols: number[]; // คอลัมน์ที่จะจัด (ต้องระบุอย่างน้อย 1)
  width: number; // ความกว้างเป้าหมาย
  mode?: PadMode; // default "pad" (เติมอย่างเดียว)
  padChar?: string; // ตัวอักษรที่ใช้เติม (default "0") · ใช้ตัวแรกถ้าใส่หลายตัว
  side?: PadSide; // pad: เติมด้านไหน (left=นำหน้า default) · truncate: เก็บด้านไหน (left=เก็บหัว)
}

export interface PadSample {
  row: number; // index แถวข้อมูล (0-based)
  col: number;
  before: string;
  after: string;
  truncated: boolean; // เคสนี้เป็นการตัด (ข้อมูลหาย) ไหม
}

export interface PadResult {
  header: string[];
  rows: Row[];
  cellsChanged: number;
  rowsAffected: number;
  paddedCount: number; // ช่องที่ถูกเติม
  truncatedCount: number; // ช่องที่ถูกตัด (ข้อมูลหาย)
  blankSkipped: number; // ช่องว่างที่ข้าม
  samples: PadSample[]; // cap 50 (จัดลำดับให้เคสตัดขึ้นก่อน เพื่อให้เห็นตัวที่เสี่ยง)
  inputRows: number;
  error?: string; // ถ้ามี = header/rows คืนของเดิมไม่แตะ
}

const SAMPLE_CAP = 50;

function isBlankCell(v: Cell): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

// คืน string ที่จัดแล้ว (ถ้าไม่เปลี่ยน คืนค่าเดิมเป๊ะ)
function applyPad(s: string, mode: PadMode, width: number, padChar: string, side: PadSide): string {
  const len = Array.from(s).length; // นับ code point (กัน emoji/สระซ้อนเพี้ยน)
  if (mode === "pad") {
    if (len >= width) return s;
    const fill = padChar.repeat(width - len);
    return side === "left" ? fill + s : s + fill;
  }
  if (mode === "truncate") {
    if (len <= width) return s;
    const arr = Array.from(s);
    // side=left → เก็บหัว (ตัดท้าย) · side=right → เก็บท้าย (ตัดหัว)
    return side === "left" ? arr.slice(0, width).join("") : arr.slice(len - width).join("");
  }
  // pad-truncate: บังคับความกว้างเป๊ะ
  if (len < width) {
    const fill = padChar.repeat(width - len);
    return side === "left" ? fill + s : s + fill;
  }
  if (len > width) {
    const arr = Array.from(s);
    return side === "left" ? arr.slice(0, width).join("") : arr.slice(len - width).join("");
  }
  return s;
}

export function padColumns(header: string[], dataRows: Row[], opts: PadOptions): PadResult {
  const width = header.length;
  const base: PadResult = {
    header: header.slice(),
    rows: dataRows.map((r) => r.slice()),
    cellsChanged: 0,
    rowsAffected: 0,
    paddedCount: 0,
    truncatedCount: 0,
    blankSkipped: 0,
    samples: [],
    inputRows: dataRows.length,
  };

  const mode = opts.mode ?? "pad";
  const side = opts.side ?? "left";
  const padChar = opts.padChar && opts.padChar.length > 0 ? Array.from(opts.padChar)[0] : "0";

  if (!Number.isFinite(opts.width) || opts.width < 1) {
    return { ...base, error: "กำหนดความกว้างเป้าหมาย (อย่างน้อย 1)" };
  }
  const target = Math.floor(opts.width);

  const cols = (opts.cols ?? []).filter((c) => Number.isInteger(c) && c >= 0 && c < width);
  if (cols.length === 0) {
    return { ...base, error: "เลือกคอลัมน์ที่จะจัดความกว้างอย่างน้อย 1 คอลัมน์" };
  }
  const colSet = new Set(cols);

  let cellsChanged = 0;
  let paddedCount = 0;
  let truncatedCount = 0;
  let blankSkipped = 0;
  const affectedRows = new Set<number>();
  const samples: PadSample[] = [];

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
      const before = String(raw);
      const after = applyPad(before, mode, target, padChar, side);
      if (after === before) continue;

      const beforeLen = Array.from(before).length;
      const afterLen = Array.from(after).length;
      const truncated = afterLen < beforeLen;

      nr[c] = after;
      cellsChanged++;
      affectedRows.add(ri);
      if (truncated) truncatedCount++;
      else paddedCount++;

      samples.push({ row: ri, col: c, before, after, truncated });
    }
    return nr;
  });

  // จัดลำดับ sample ให้เคสตัด (เสี่ยงข้อมูลหาย) ขึ้นก่อน แล้วค่อย cap
  samples.sort((a, b) => Number(b.truncated) - Number(a.truncated));

  return {
    ...base,
    rows,
    cellsChanged,
    rowsAffected: affectedRows.size,
    paddedCount,
    truncatedCount,
    blankSkipped,
    samples: samples.slice(0, SAMPLE_CAP),
  };
}

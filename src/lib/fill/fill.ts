// เติมค่าลงล่าง/ขึ้นบน (fill down / fill up) — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case จริง: ฟอร์แมต iTAM (พี่แต้ม) มี "เลขตู้ (container)" เฉพาะแถวแรกของกลุ่ม แถวที่เหลือเว้นว่าง
//   → เติมค่าตู้ให้ครบทุกแถว เพื่อให้ /group /split /reconcile จับกลุ่มถูก
// ปรัชญา: **เติมเฉพาะช่องว่างเท่านั้น — ไม่ทับค่าที่มีอยู่, ไม่ทำแถวหาย/ไม่เพิ่มแถว**
//   → ผลลัพธ์มีจำนวนแถวเท่าเดิม · ทุกช่องที่ "มีค่า" อยู่แล้วคงเดิมเป๊ะ

import type { Cell, Row } from "@/lib/reconcile/types";

export type FillDir = "down" | "up";

export interface FillOptions {
  direction?: FillDir; // เติมลงล่าง (default) หรือขึ้นบน
  trimBlank?: boolean; // มองช่องที่มีแต่ช่องว่างเป็น "ว่าง" ด้วย (default true)
  resetOnBlankRow?: boolean; // เจอแถวว่างทั้งแถว → รีเซ็ตค่าที่พาไป (treat เป็น hard section break) — default false
}
// หมายเหตุ: **แถวที่ว่างทั้งแถวจะไม่ถูกเติมเสมอ** (กันสร้าง "แถวผี" ที่มีแต่ค่าที่เติม เช่น trailing row จาก CSV)
//   default = ข้ามแถวว่างแต่ยัง carry ค่าไปแถวถัดไป · resetOnBlankRow = ให้แถวว่างรีเซ็ต carry ด้วย (เริ่มกลุ่มใหม่)

export interface FillResult {
  header: string[];
  rows: Row[];
  cols: number[]; // คอลัมน์ที่สั่งเติม
  filledPerCol: number[]; // จำนวนช่องที่เติม (เรียงตาม cols)
  filledTotal: number; // รวมทุกคอลัมน์
  stillBlank: number; // ช่องว่างที่ยังเติมไม่ได้ (ไม่มีค่าให้พาไป เช่น ว่างตั้งแต่บนสุด)
  inputRows: number;
}

function isBlankCell(v: Cell, trim: boolean): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return trim ? v.trim() === "" : v === "";
  return false;
}

function isBlankRow(row: Row, trim: boolean): boolean {
  return row.every((c) => isBlankCell(c, trim));
}

// เติมค่าให้คอลัมน์ที่เลือก: ช่องว่างรับค่าจากช่อง "ที่มีค่า" ล่าสุดในทิศที่กำหนด
// - down: ไล่บน→ล่าง · up: ไล่ล่าง→บน
// - เติมเฉพาะช่องว่าง (ช่องมีค่าไม่แตะ) → output = permutation ของค่าเดิม + เติมช่องว่างบางช่อง
export function fillCells(
  header: string[],
  dataRows: Row[],
  cols: number[],
  opts: FillOptions = {},
): FillResult {
  const dir = opts.direction ?? "down";
  const trim = opts.trimBlank !== false;
  const resetOnBlankRow = opts.resetOnBlankRow === true;

  const width = header.length;
  const targets = cols.filter((c) => c >= 0 && c < width);
  // clone แถวเพื่อไม่แก้ input (คัดลอกช่องเท่าที่กว้างที่สุด กันแถวสั้น/ยาวไม่เท่ากัน)
  const rows: Row[] = dataRows.map((r) => {
    const out: Row = r.slice();
    return out;
  });

  const filledPerCol = targets.map(() => 0);
  let stillBlank = 0;

  const order = dir === "down" ? [...rows.keys()] : [...rows.keys()].reverse();

  // ค่าที่พาไปของแต่ละคอลัมน์ (null = ยังไม่เจอค่าเริ่ม)
  const carry: (Cell | null)[] = targets.map(() => null);

  for (const ri of order) {
    const row = rows[ri];
    // แถวว่างทั้งแถว = ไม่เติมเสมอ (กันแถวผี) · resetOnBlankRow เพิ่มการรีเซ็ต carry
    if (isBlankRow(row, trim)) {
      if (resetOnBlankRow) for (let i = 0; i < carry.length; i++) carry[i] = null;
      continue;
    }
    for (let i = 0; i < targets.length; i++) {
      const col = targets[i];
      const cur = col < row.length ? (row[col] ?? null) : null;
      if (!isBlankCell(cur, trim)) {
        carry[i] = cur; // ช่องมีค่า → อัปเดตค่าที่พาไป (ไม่แตะค่าเดิม)
      } else if (carry[i] !== null) {
        // ช่องว่าง + มีค่าให้พาไป → เติม
        if (col >= row.length) {
          // ขยายแถวให้ถึง col (เติม null ระหว่างทาง)
          while (row.length <= col) row.push(null);
        }
        row[col] = carry[i];
        filledPerCol[i]++;
      } else {
        stillBlank++; // ว่าง + ยังไม่มีค่าให้พาไป (เช่น ว่างตั้งแต่ต้น)
      }
    }
  }

  const filledTotal = filledPerCol.reduce((a, b) => a + b, 0);

  return {
    header,
    rows,
    cols: targets,
    filledPerCol,
    filledTotal,
    stillBlank,
    inputRows: dataRows.length,
  };
}

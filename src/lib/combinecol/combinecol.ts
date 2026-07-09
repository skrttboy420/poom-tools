// รวมหลายคอลัมน์เป็นคอลัมน์เดียว (ต่อข้อความ) — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case จริง: ต่อค่าเป็น key ผสม (tracking + กล่อง) เพื่อเทียบ, ต่อ ตู้+เลข เป็นรหัสเดียว,
//   ต่อวัน/เดือน/ปี เป็นวันที่เดียว → แล้วเอาไป /reconcile /dedup /group ต่อ
// คู่กลับกับ /split-col (แยกคอลัมน์เดียวเป็นหลายคอลัมน์)
// ปรัชญา: **ไม่ทำแถวหาย (จำนวนแถวเท่าเดิมเสมอ)** · โหมด default = เพิ่มคอลัมน์ใหม่ (เก็บของเดิมไว้ = ไม่ทิ้งข้อมูล)

import type { Cell, Row } from "@/lib/reconcile/types";

export interface CombineColOptions {
  separator: string; // ตัวเชื่อม เช่น "-" "/" " " "" (ไม่ต้องมีก็ได้)
  name?: string; // ชื่อหัวคอลัมน์ผลลัพธ์ (default = ชื่อหัวต้นทางต่อด้วย " + ")
  keepOriginals?: boolean; // เก็บคอลัมน์ต้นทางไว้ด้วย (default true = เพิ่มท้าย, ไม่ทิ้ง)
  trim?: boolean; // trim แต่ละชิ้นก่อนต่อ (default true)
  skipEmpty?: boolean; // ข้ามชิ้นว่าง (กันได้ "A--B" เวลาช่องกลางว่าง) (default true)
}

export interface CombineColResult {
  header: string[];
  rows: Row[];
  name: string; // ชื่อคอลัมน์รวมจริง
  sourceCount: number; // จำนวนคอลัมน์ต้นทางที่ใช้จริง
  inputRows: number;
  error?: string; // ถ้ามี = header/rows คืนของเดิมไม่แตะ
}

function isBlankCell(v: Cell): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

function cellAt(row: Row, idx: number): Cell {
  return idx >= 0 && idx < row.length ? (row[idx] ?? null) : null;
}

function headerName(header: string[], idx: number): string {
  const h = header[idx];
  return h !== undefined && String(h).trim() !== "" ? String(h) : `คอลัมน์ ${idx + 1}`;
}

export function combineColumns(
  header: string[],
  dataRows: Row[],
  cols: number[],
  opts: CombineColOptions,
): CombineColResult {
  const trim = opts.trim !== false;
  const skipEmpty = opts.skipEmpty !== false;
  const keep = opts.keepOriginals !== false;
  const sep = opts.separator ?? "";
  const width = header.length;

  const cloneRows: Row[] = dataRows.map((r) => r.slice());
  const valid = cols.filter((c) => c >= 0 && c < width);

  if (valid.length === 0) {
    return {
      header: header.slice(),
      rows: cloneRows,
      name: "",
      sourceCount: 0,
      inputRows: dataRows.length,
      error: "เลือกคอลัมน์ที่จะรวมอย่างน้อย 1 คอลัมน์",
    };
  }

  const name =
    opts.name && opts.name.trim() !== ""
      ? opts.name
      : valid.map((c) => headerName(header, c)).join(" + ");

  // ต่อค่าของแต่ละแถวตามลำดับคอลัมน์ที่เลือก
  const combine = (row: Row): string => {
    const pieces: string[] = [];
    for (const c of valid) {
      const v = cellAt(row, c);
      let s = isBlankCell(v) ? "" : String(v);
      if (trim) s = s.trim();
      if (skipEmpty && s === "") continue;
      pieces.push(s);
    }
    return pieces.join(sep);
  };

  if (keep) {
    // เพิ่มคอลัมน์รวมท้ายสุด — คอลัมน์เดิมอยู่ครบ (normalize ความกว้างเป็น width)
    const outHeader = [...header, name];
    const outRows: Row[] = dataRows.map((row) => {
      const base: Row = [];
      for (let i = 0; i < width; i++) base.push(cellAt(row, i));
      base.push(combine(row));
      return base;
    });
    return { header: outHeader, rows: outRows, name, sourceCount: valid.length, inputRows: dataRows.length };
  }

  // โหมดแทนที่: เอาคอลัมน์รวมไปวางตำแหน่งคอลัมน์แรกที่เลือก แล้วตัดคอลัมน์ต้นทางที่เหลือออก
  const removeSet = new Set(valid);
  const firstPos = Math.min(...valid);
  const outHeader: string[] = [];
  for (let i = 0; i < width; i++) {
    if (i === firstPos) outHeader.push(name);
    else if (!removeSet.has(i)) outHeader.push(header[i] ?? "");
  }
  const outRows: Row[] = dataRows.map((row) => {
    const out: Row = [];
    for (let i = 0; i < width; i++) {
      if (i === firstPos) out.push(combine(row));
      else if (!removeSet.has(i)) out.push(cellAt(row, i));
    }
    return out;
  });

  return { header: outHeader, rows: outRows, name, sourceCount: valid.length, inputRows: dataRows.length };
}

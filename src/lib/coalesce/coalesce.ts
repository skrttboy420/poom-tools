// เลือกค่าแรกที่ไม่ว่างจากหลายคอลัมน์ (Coalesce · FIRST NON-BLANK) — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case จริง: ไฟล์รวมจากหลายแหล่ง (packing list หลาย format) → ค่าเดียวกันไปอยู่คนละคอลัมน์
//   เช่น tracking บางแถวอยู่คอลัมน์ "tracking" บางแถวอยู่ "เลขพัสดุ"/"AWB" · น้ำหนักอยู่ "kg" หรือ "น้ำหนัก" หรือ "weight"
//   → เดินคอลัมน์ตามลำดับความสำคัญ เจอค่าไม่ว่างช่องแรก = ใช้ค่านั้น → เติมเป็น 1 คอลัมน์เดียวที่ครบ
// ต่างจาก /combine-col (ต่อ "ทุกคอลัมน์" ติดกันเป็นข้อความ) · /row-agg (รวมเลข sum/avg ข้ามคอลัมน์) ·
//   /fill (เติมช่องว่างจากค่าบน-ล่างในคอลัมน์เดียว แนวตั้ง) · /map (แทนค่าตามพจนานุกรม) — อันนี้ = เลือก "ค่าแรกที่มี" ข้ามคอลัมน์ (แนวนอน)
// ปรัชญา: ไม่เดามั่ว/ไม่ทำข้อมูลหาย — เลือกค่าตามที่มีจริง (ไม่แต่งค่า) · ทุกแถวออกครบ · เก็บคอลัมน์เดิมไว้ (default เติมคอลัมน์ใหม่) ·
//   ทุกแถวว่างทุกคอลัมน์ที่เลือก → เว้นว่าง (ไม่กุค่า) · เพิ่มคอลัมน์ "แหล่งที่มา" ได้ (โปร่งใส บอกว่าค่ามาจากคอลัมน์ไหน)

import type { Cell, Row } from "@/lib/reconcile/types";

export type CoalesceMode = "add" | "replace";

export interface CoalesceOptions {
  cols: number[]; // คอลัมน์เรียงตามลำดับความสำคัญ (ซ้าย = ก่อน)
  mode?: CoalesceMode; // add = เติมคอลัมน์ใหม่ท้าย (default) · replace = เขียนลงคอลัมน์แรกที่เลือก
  colName?: string; // ชื่อคอลัมน์ผลลัพธ์ (add mode · ว่าง = ชื่อ default)
  trim?: boolean; // trim ค่าสตริงในผลลัพธ์ + ใช้เช็คว่าว่าง (default true)
  addSource?: boolean; // เพิ่มคอลัมน์บอกว่าค่ามาจากคอลัมน์ไหน (default false)
  sourceName?: string; // ชื่อคอลัมน์แหล่งที่มา (default "แหล่งที่มา")
}

export interface CoalesceResult {
  header: Row;
  rows: Row[];
  addedCols: string[]; // ชื่อคอลัมน์ที่เพิ่ม (ผลรวม + แหล่งที่มา ถ้ามี)
  newColIndex: number; // ตำแหน่งคอลัมน์ผลรวม (add) / คอลัมน์ที่ถูกเขียนทับ (replace)
  replacedCol: number; // -1 ถ้า add mode
  inputRows: number;
  dataRows: number; // หลังตัดแถวว่างทั้งแถว
  filledRows: number; // แถวที่ได้ค่า (มีค่าไม่ว่างอย่างน้อย 1 คอลัมน์)
  emptyRows: number; // แถวที่ทุกคอลัมน์ที่เลือกว่าง → เว้นว่าง
  fromCounts: number[]; // ขนานกับ opts.cols — นับว่าแต่ละคอลัมน์เป็นแหล่งค่ากี่แถว
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
function cellAt(row: Row, col: number): Cell {
  if (col < 0) return null;
  return col < row.length ? row[col] : null;
}
function headerName(header: Row, col: number): string {
  const h = col < header.length ? header[col] : null;
  const s = h === null || h === undefined ? "" : String(h).trim();
  return s === "" ? `คอลัมน์ ${col + 1}` : s;
}

export function analyzeCoalesce(header: Row, allRows: Row[], opts: CoalesceOptions): CoalesceResult {
  const inputRows = allRows.length;
  const dataRowsArr = allRows.filter(isDataRow);
  const dataRows = dataRowsArr.length;
  const width = Math.max(header.length, ...dataRowsArr.map((r) => r.length), 1);

  const base = (msg: string): CoalesceResult => ({
    header: header.slice(),
    rows: dataRowsArr.map((r) => r.slice()),
    addedCols: [],
    newColIndex: -1,
    replacedCol: -1,
    inputRows,
    dataRows,
    filledRows: 0,
    emptyRows: 0,
    fromCounts: (opts.cols ?? []).map(() => 0),
    error: msg,
  });

  if (dataRows === 0) return base("ไม่มีแถวข้อมูล");
  if (!opts.cols || opts.cols.length === 0) return base("เลือกคอลัมน์ที่จะรวมอย่างน้อย 1 คอลัมน์");
  for (const c of opts.cols) if (c < 0 || c >= width) return base("คอลัมน์ที่เลือกอยู่นอกช่วง");

  const trim = opts.trim !== false;
  const addSource = opts.addSource === true;
  const mode: CoalesceMode = opts.mode === "replace" ? "replace" : "add";

  const fromCounts = opts.cols.map(() => 0);
  let filledRows = 0;
  let emptyRows = 0;

  // เดินคอลัมน์ตามลำดับ → เจอค่าไม่ว่างช่องแรก = ใช้ · คืน [value, sourcePosition] (sourcePosition = index ใน opts.cols หรือ -1)
  function pick(row: Row): [Cell, number] {
    for (let i = 0; i < opts.cols.length; i++) {
      const raw = cellAt(row, opts.cols[i]);
      if (!isBlankCell(raw)) {
        const val = trim && typeof raw === "string" ? raw.trim() : raw;
        return [val, i];
      }
    }
    return [null, -1];
  }

  // คำนวณค่าต่อแถว + แหล่งที่มา
  const picked: { value: Cell; source: number }[] = dataRowsArr.map((r) => {
    const [value, source] = pick(r);
    if (source >= 0) {
      fromCounts[source]++;
      filledRows++;
    } else {
      emptyRows++;
    }
    return { value, source };
  });

  const defaultName =
    opts.colName && opts.colName.trim() !== ""
      ? opts.colName.trim()
      : `ค่าแรกที่ไม่ว่าง (${opts.cols.map((c) => headerName(header, c)).join(" / ")})`;
  const sourceHeader = opts.sourceName && opts.sourceName.trim() !== "" ? opts.sourceName.trim() : "แหล่งที่มา";

  const addedCols: string[] = [];

  if (mode === "replace") {
    const target = opts.cols[0];
    const outHeader = header.slice();
    while (outHeader.length < width) outHeader.push(null);
    if (addSource) {
      outHeader.push(sourceHeader);
      addedCols.push(sourceHeader);
    }
    const outRows: Row[] = dataRowsArr.map((r, i) => {
      const out = r.slice();
      while (out.length < width) out.push(null);
      out[target] = picked[i].value;
      if (addSource) out.push(picked[i].source >= 0 ? headerName(header, opts.cols[picked[i].source]) : null);
      return out;
    });
    return {
      header: outHeader,
      rows: outRows,
      addedCols,
      newColIndex: target,
      replacedCol: target,
      inputRows,
      dataRows,
      filledRows,
      emptyRows,
      fromCounts,
    };
  }

  // add mode
  const outHeader = header.slice();
  while (outHeader.length < width) outHeader.push(null);
  const newColIndex = outHeader.length;
  outHeader.push(defaultName);
  addedCols.push(defaultName);
  if (addSource) {
    outHeader.push(sourceHeader);
    addedCols.push(sourceHeader);
  }

  const outRows: Row[] = dataRowsArr.map((r, i) => {
    const out = r.slice();
    while (out.length < width) out.push(null);
    out.push(picked[i].value);
    if (addSource) out.push(picked[i].source >= 0 ? headerName(header, opts.cols[picked[i].source]) : null);
    return out;
  });

  return {
    header: outHeader,
    rows: outRows,
    addedCols,
    newColIndex,
    replacedCol: -1,
    inputRows,
    dataRows,
    filledRows,
    emptyRows,
    fromCounts,
  };
}

// export ผลเป็น CSV
export function coalesceToCsv(result: CoalesceResult): string {
  const esc = (v: Cell) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [result.header.map(esc).join(",")];
  for (const r of result.rows) lines.push(r.map(esc).join(","));
  return lines.join("\n");
}

// เติมค่าให้ช่องว่าง (Fill Blank · เติมค่าเริ่มต้น/ค่าที่พบบ่อยสุด) — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case จริง: ก่อน export เข้า Pacred อยากให้ช่องว่างมีค่า default — เช่น น้ำหนัก/CBM ที่เว้นว่าง → 0,
//   สถานะที่เว้นว่าง → "รอตรวจ", forwarder ที่เว้นว่าง → เติมค่าที่พบบ่อยสุดในคอลัมน์นั้น
// ต่างจากญาติ:
//   /fill (เติมค่าลง-ขึ้นจากช่อง "ที่มีค่าล่าสุด" ในคอลัมน์เดียว แนวตั้ง) · /coalesce (เลือกค่าแรกไม่ว่าง "ข้ามคอลัมน์" แนวนอน) ·
//   /map (แทนค่าตามพจนานุกรม — ค่าที่มีอยู่) · /replace (ค้นหา-แทนที่ — ข้ามช่องว่าง) — อันนี้ = เติม "เฉพาะช่องว่าง" ด้วยค่าคงที่หรือค่าที่พบบ่อยสุด
// ปรัชญา: **เติมเฉพาะช่องว่างเท่านั้น — ไม่ทับค่าที่มีอยู่, ไม่ทำแถวหาย/ไม่เพิ่มแถว**
//   · โหมด mode: คอลัมน์ที่ไม่มีค่าไม่ว่างเลย → เติมไม่ได้ (เว้นว่าง ไม่กุค่า) · ตัดแถวว่างทั้งแถวก่อน (กันเติมแถวผี)

import type { Cell, Row } from "@/lib/reconcile/types";

export type FillBlankMode = "constant" | "mode";

export interface FillBlankOptions {
  cols: number[]; // คอลัมน์ที่จะเติมช่องว่าง
  mode?: FillBlankMode; // constant (default) = เติมด้วย value · mode = เติมด้วยค่าที่พบบ่อยสุดในคอลัมน์นั้น (ต่อคอลัมน์)
  value?: Cell; // ค่าคงที่ (constant mode)
  trimBlank?: boolean; // มองช่องที่มีแต่ช่องว่างเป็น "ว่าง" ด้วย (default true)
  coerceNumber?: boolean; // constant mode: ถ้า value เป็นรูปตัวเลข → เก็บเป็น number (default true) · คงเลข 0 นำหน้า (รหัส) เป็น string
}

export interface FillBlankColumnStat {
  col: number;
  filled: number; // ช่องที่เติมจริงในคอลัมน์นี้
  blank: number; // ช่องว่างที่พบในคอลัมน์นี้
  fillValue: Cell; // ค่าที่ใช้เติม (mode: ค่าที่พบบ่อยสุด · constant: ค่าที่กำหนด) · null = เติมไม่ได้ (ไม่มีค่าให้เติม)
}

export interface FillBlankResult {
  header: Row;
  rows: Row[]; // ทุกแถวข้อมูล (เติมช่องว่างแล้ว)
  cols: number[]; // คอลัมน์ที่สั่งเติม (กรองเฉพาะที่อยู่ในช่วง)
  perCol: FillBlankColumnStat[];
  filledCells: number; // รวมช่องที่เติมทุกคอลัมน์
  blankCells: number; // รวมช่องว่างที่พบทุกคอลัมน์
  rowsAffected: number; // แถวที่มีการเติมอย่างน้อย 1 ช่อง
  inputRows: number;
  dataRows: number; // หลังตัดแถวว่างทั้งแถว
  droppedBlankRows: number;
  error?: string;
}

function isBlankCell(v: Cell, trim: boolean): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return trim ? v.trim() === "" : v === "";
  return false;
}
function isDataRow(row: Row): boolean {
  return row.some((c) => !isBlankCell(c, true));
}
function cellAt(row: Row, col: number): Cell {
  if (col < 0) return null;
  return col < row.length ? row[col] : null;
}
// แปลงค่าคงที่: ถ้าเป็นรูปตัวเลขล้วน (ไม่มีเลข 0 นำหน้า) → number · ไม่งั้นคง string เดิม
function coerceConstant(v: Cell): Cell {
  if (typeof v !== "string") return v;
  const t = v.trim();
  if (t === "") return v;
  if (/^-?0\d/.test(t)) return v; // เลข 0 นำหน้า (เช่น "007") = รหัส → คง string
  if (/^-?\d+(\.\d+)?$/.test(t)) {
    const n = Number(t);
    if (Number.isFinite(n)) return n;
  }
  return v;
}
// หาค่าที่พบบ่อยสุด (mode) ของคอลัมน์ (นับเฉพาะช่องไม่ว่าง) · คืน null ถ้าไม่มีค่าไม่ว่างเลย
function columnMode(rows: Row[], col: number, trim: boolean): Cell {
  const counts = new Map<string, { value: Cell; count: number; order: number }>();
  let order = 0;
  for (const r of rows) {
    const v = cellAt(r, col);
    if (isBlankCell(v, trim)) continue;
    const key = trim && typeof v === "string" ? v.trim() : String(v);
    const e = counts.get(key);
    if (e) e.count++;
    else counts.set(key, { value: v, count: 1, order: order++ });
  }
  let best: { value: Cell; count: number; order: number } | null = null;
  for (const e of counts.values()) {
    if (best === null || e.count > best.count || (e.count === best.count && e.order < best.order)) {
      best = e;
    }
  }
  return best ? best.value : null;
}

export function fillBlank(header: Row, allRows: Row[], opts: FillBlankOptions): FillBlankResult {
  const inputRows = allRows.length;
  const dataRowsArr = allRows.filter(isDataRow);
  const dataRows = dataRowsArr.length;
  const droppedBlankRows = inputRows - dataRows;
  const width = Math.max(header.length, ...dataRowsArr.map((r) => r.length), 1);

  const base = (msg: string): FillBlankResult => ({
    header: header.slice(),
    rows: dataRowsArr.map((r) => r.slice()),
    cols: [],
    perCol: [],
    filledCells: 0,
    blankCells: 0,
    rowsAffected: 0,
    inputRows,
    dataRows,
    droppedBlankRows,
    error: msg,
  });

  if (dataRows === 0) return base("ไม่มีแถวข้อมูล");
  const cols = (opts.cols ?? []).filter((c) => c >= 0 && c < width);
  if (cols.length === 0) return base("เลือกคอลัมน์ที่จะเติมช่องว่างอย่างน้อย 1 คอลัมน์");

  const trim = opts.trimBlank !== false;
  const mode: FillBlankMode = opts.mode === "mode" ? "mode" : "constant";
  const coerce = opts.coerceNumber !== false;

  // หาค่าที่จะเติมต่อคอลัมน์
  const fillValueOf = new Map<number, Cell>();
  if (mode === "constant") {
    const raw = opts.value ?? "";
    if (isBlankCell(raw, trim)) return base("ใส่ค่าที่จะเติมในช่องว่าง");
    const v = coerce ? coerceConstant(raw) : raw;
    for (const c of cols) fillValueOf.set(c, v);
  } else {
    for (const c of cols) fillValueOf.set(c, columnMode(dataRowsArr, c, trim));
  }

  // เตรียม stat ต่อคอลัมน์ (คงลำดับตาม cols)
  const statOf = new Map<number, FillBlankColumnStat>();
  for (const c of cols) statOf.set(c, { col: c, filled: 0, blank: 0, fillValue: fillValueOf.get(c) ?? null });

  let filledCells = 0;
  let blankCells = 0;
  let rowsAffected = 0;

  const outRows: Row[] = dataRowsArr.map((r) => {
    const out = r.slice();
    while (out.length < width) out.push(null);
    let touched = false;
    for (const c of cols) {
      if (!isBlankCell(out[c], trim)) continue;
      const st = statOf.get(c)!;
      st.blank++;
      blankCells++;
      const fv = fillValueOf.get(c) ?? null;
      if (fv !== null && !(typeof fv === "string" && fv === "")) {
        out[c] = fv;
        st.filled++;
        filledCells++;
        touched = true;
      }
    }
    if (touched) rowsAffected++;
    return out;
  });

  const outHeader = header.slice();
  while (outHeader.length < width) outHeader.push(null);

  return {
    header: outHeader,
    rows: outRows,
    cols,
    perCol: cols.map((c) => statOf.get(c)!),
    filledCells,
    blankCells,
    rowsAffected,
    inputRows,
    dataRows,
    droppedBlankRows,
  };
}

// รวมค่าต่อกลุ่ม (GROUP_CONCAT / TEXTJOIN by group) — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case จริง: packing list 1 tracking แตกหลายกล่อง/หลายแถว → ยุบเป็น 1 แถว/tracking แล้ว "ต่อ" เลขกล่องทั้งหมดเป็นข้อความเดียว
//   เช่น tracking KY001 มีกล่อง 1,2,3 → "1, 2, 3" · ต่อ tracking ทั้งหมดต่อตู้ → รายการ tracking ในตู้นั้น
// ต่างจาก /rollup (รวม "ยอด" ตัวเลข sum · คอลัมน์อื่นเก็บค่าแรก/สุดท้าย) · /group (สรุปเฉพาะ key+agg — คอลัมน์อื่นหาย) ·
//   /combine-col (ต่อ "คอลัมน์" ในแถวเดียว แนวนอน) — อันนี้ = ต่อ "ค่าหลายแถว" ในกลุ่มเดียว (แนวตั้ง) เป็นข้อความเดียว
// ปรัชญา: ไม่เดามั่ว/ไม่ทำข้อมูลหายเงียบ — ทุกแถวเข้ากลุ่มเดียว (ผลรวมนับ = ที่นับได้) · คีย์ว่างคงเป็นกลุ่มเดี่ยว (เว้นสั่งข้าม) ·
//   ค่าว่างข้ามได้ (skipBlank) · ซ้ำตัดได้ (dedupe) · เรียงได้ (sortValues) — แต่ทั้งหมด opt-in ชัดเจน

import type { Cell, Row } from "@/lib/reconcile/types";

export interface GroupConcatOptions {
  groupCols: number[]; // คอลัมน์ที่ใช้จัดกลุ่ม (หลายคอลัมน์ = composite key)
  valueCols: number[]; // คอลัมน์ที่จะต่อค่า (แต่ละคอลัมน์ = 1 คอลัมน์ผลลัพธ์)
  separator?: string; // ตัวคั่นระหว่างค่า (default ", ")
  dedupe?: boolean; // ตัดค่าซ้ำในกลุ่ม (default false)
  sortValues?: boolean; // เรียงค่าในกลุ่ม (default false)
  skipBlank?: boolean; // ข้ามค่าว่าง (default true — กันตัวคั่นซ้อน)
  trim?: boolean; // trim ค่าแต่ละตัวก่อนต่อ/เทียบ (default true)
  caseInsensitive?: boolean; // dedupe ไม่สนพิมพ์เล็ก/ใหญ่ (default false)
  ignoreEmptyKey?: boolean; // แถวคีย์ว่าง = ข้าม ไม่จัดกลุ่ม (default false)
  addCount?: boolean; // เพิ่มคอลัมน์ "จำนวนแถว" (default false)
  sortGroups?: boolean; // เรียงแถวผลลัพธ์ตามคีย์ (default false)
  countHeader?: string; // ชื่อคอลัมน์นับ (default "จำนวนแถว")
}

export interface GroupConcatResult {
  header: Row;
  rows: Row[];
  keyCols: number[];
  valueCols: number[];
  inputRows: number;
  dataRows: number; // หลังตัดแถวว่างทั้งแถว
  groups: number; // จำนวนกลุ่มผลลัพธ์
  emptyKeyRows: number; // แถวคีย์ว่าง (ทุกคอลัมน์คีย์ว่าง)
  droppedBlankRows: number; // แถวว่างทั้งแถวที่ตัดออก
  biggestGroup: number; // จำนวนแถวในกลุ่มใหญ่สุด
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
function cellToStr(v: Cell): string {
  if (v === null || v === undefined) return "";
  return String(v);
}
// normalize คีย์กลุ่ม (trim + lowercase เสมอ — คีย์ควรจับคู่แบบไม่สนช่องว่าง/พิมพ์)
function normKey(v: Cell, trim: boolean): string {
  let s = cellToStr(v);
  if (trim) s = s.trim();
  return s.toLowerCase();
}
function headerName(header: Row, col: number): string {
  const h = col < header.length ? header[col] : null;
  const s = h === null || h === undefined ? "" : String(h).trim();
  return s === "" ? `คอลัมน์ ${col + 1}` : s;
}

// ต่อค่าจากหลายแถวของกลุ่ม 1 คอลัมน์ → string เดียว (หรือ null ถ้าไม่มีค่า)
function joinGroup(rows: Row[], col: number, opts: GroupConcatOptions): Cell {
  const sep = opts.separator ?? ", ";
  const trim = opts.trim !== false;
  const skipBlank = opts.skipBlank !== false;
  const dedupe = opts.dedupe === true;
  const ci = opts.caseInsensitive === true;

  const values: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const raw = cellAt(r, col);
    let s = cellToStr(raw);
    if (trim) s = s.trim();
    if (skipBlank && s === "") continue;
    if (dedupe) {
      const k = ci ? s.toLowerCase() : s;
      if (seen.has(k)) continue;
      seen.add(k);
    }
    values.push(s);
  }
  if (opts.sortValues) {
    values.sort((a, b) => a.localeCompare(b, "th", { numeric: true }));
  }
  if (values.length === 0) return null;
  return values.join(sep);
}

export function analyzeGroupConcat(header: Row, allRows: Row[], opts: GroupConcatOptions): GroupConcatResult {
  const inputRows = allRows.length;
  const dataRowsArr = allRows.filter(isDataRow);
  const dataRows = dataRowsArr.length;
  const droppedBlankRows = inputRows - dataRows;
  const width = Math.max(header.length, ...dataRowsArr.map((r) => r.length), 1);

  const base = (msg: string): GroupConcatResult => ({
    header: header.slice(),
    rows: dataRowsArr.map((r) => r.slice()),
    keyCols: opts.groupCols,
    valueCols: opts.valueCols,
    inputRows,
    dataRows,
    groups: 0,
    emptyKeyRows: 0,
    droppedBlankRows,
    biggestGroup: 0,
    error: msg,
  });

  if (dataRows === 0) return base("ไม่มีแถวข้อมูล");
  const groupCols = opts.groupCols.filter((c) => c >= 0 && c < width);
  if (groupCols.length === 0) return base("เลือกคอลัมน์ที่จะจัดกลุ่มอย่างน้อย 1 คอลัมน์");
  const valueCols = opts.valueCols.filter((c) => c >= 0 && c < width);
  if (valueCols.length === 0) return base("เลือกคอลัมน์ที่จะต่อค่าอย่างน้อย 1 คอลัมน์");

  const trim = opts.trim !== false;
  const addCount = opts.addCount === true;
  const ignoreEmptyKey = opts.ignoreEmptyKey === true;

  const map = new Map<string, { keys: Cell[]; rows: Row[] }>();
  let emptyKeyRows = 0;

  for (const row of dataRowsArr) {
    const keyVals = groupCols.map((c) => cellAt(row, c));
    const allEmpty = keyVals.every(isBlankCell);
    if (allEmpty) {
      emptyKeyRows++;
      if (ignoreEmptyKey) continue;
    }
    const dispKeys = keyVals.map((v) => (isBlankCell(v) ? "(ว่าง)" : v));
    const sig = keyVals.map((v) => normKey(v, trim)).join("");
    let g = map.get(sig);
    if (!g) {
      g = { keys: dispKeys, rows: [] };
      map.set(sig, g);
    }
    g.rows.push(row);
  }

  const groupList = Array.from(map.values());
  if (opts.sortGroups) {
    groupList.sort((a, b) => {
      for (let i = 0; i < a.keys.length; i++) {
        const cmp = cellToStr(a.keys[i]).localeCompare(cellToStr(b.keys[i]), "th", { numeric: true });
        if (cmp !== 0) return cmp;
      }
      return 0;
    });
  }

  let biggestGroup = 0;
  const outRows: Row[] = groupList.map((g) => {
    if (g.rows.length > biggestGroup) biggestGroup = g.rows.length;
    const out: Row = g.keys.slice();
    if (addCount) out.push(g.rows.length);
    for (const vc of valueCols) out.push(joinGroup(g.rows, vc, opts));
    return out;
  });

  const outHeader: Row = groupCols.map((c) => headerName(header, c));
  if (addCount) outHeader.push(opts.countHeader && opts.countHeader.trim() !== "" ? opts.countHeader.trim() : "จำนวนแถว");
  for (const vc of valueCols) outHeader.push(headerName(header, vc));

  return {
    header: outHeader,
    rows: outRows,
    keyCols: groupCols,
    valueCols,
    inputRows,
    dataRows,
    groups: outRows.length,
    emptyKeyRows,
    droppedBlankRows,
    biggestGroup,
  };
}

// export ผลเป็น CSV
export function groupConcatToCsv(result: GroupConcatResult): string {
  const esc = (v: Cell) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [result.header.map(esc).join(",")];
  for (const r of result.rows) lines.push(r.map(esc).join(","));
  return lines.join("\n");
}

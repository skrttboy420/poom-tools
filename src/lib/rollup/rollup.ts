// รวมแถวซ้ำตาม key — ยุบหลายแถวที่ key เดียวกันเป็น "แถวเดียว" โดยคอลัมน์ตัวเลขรวมยอด (sum) — pure ล้วน
// use-case จริง: packing list ที่ 1 tracking แตกเป็นหลายกล่อง/หลายแถว → ยุบเป็น 1 แถว/tracking พร้อมยอดรวม kg/CBM/กล่อง
// ต่างจากเครื่องมืออื่น:
//   /dedup = ลบแถวซ้ำทิ้ง (เก็บแค่แถวเดียว ไม่รวมยอด) · /group = สร้างตารางสรุปเฉพาะ key+ยอด (คอลัมน์อื่นหาย)
//   /rollup (อันนี้) = **เก็บทุกคอลัมน์เดิม** แค่ยุบแถว: ตัวเลข→รวมยอด, คอลัมน์อื่น→ค่าตัวแทน (แรก/สุดท้าย)
// ปรัชญาไม่ทำข้อมูลหายเงียบ: คีย์ว่างคงเป็นแถวเดี่ยว (ไม่ยุบมั่ว) เว้นผู้ใช้สั่งทิ้ง · input ไม่ mutate

import type { Cell, Row } from "@/lib/reconcile/types";

export type OtherMode = "first" | "last"; // คอลัมน์ที่ไม่ใช่ key/sum เก็บค่าจากแถวแรก/สุดท้ายของกลุ่ม

export interface RollupOptions {
  trim?: boolean; // trim ก่อนเทียบ key — default true
  caseInsensitive?: boolean; // เทียบ key ไม่สนพิมพ์เล็ก/ใหญ่ — default false
  dropEmptyKey?: boolean; // ทิ้งแถวคีย์ว่าง — default false (คงเป็นแถวเดี่ยว ไม่ยุบ)
  otherMode?: OtherMode; // ค่าตัวแทนคอลัมน์อื่น — default first
  addCount?: boolean; // เพิ่มคอลัมน์ "จำนวนแถวรวม" ท้ายสุด — default false
}

export interface RollupResult {
  header: Row;
  rows: Row[]; // ตารางที่ยุบแล้ว (รูปคอลัมน์เดิม + count ถ้าเปิด)
  inputRows: number;
  outputRows: number; // จำนวนแถวหลังยุบ
  collapsedRows: number; // จำนวนแถวที่ถูกยุบหาย (= counted - groups)
  groups: number; // จำนวนกลุ่ม (= outputRows)
  emptyKeyRows: number; // แถวคีย์ว่างที่พบ
  droppedEmpty: number; // แถวคีย์ว่างที่ทิ้งจริง (เมื่อ dropEmptyKey)
  droppedBlank: number; // แถวว่างทั้งแถวที่ตัดออกก่อน
  biggestGroup: number; // ขนาดกลุ่มใหญ่สุด
  error?: string;
}

const SEP = ""; // กัน key หลายคอลัมน์ปนกัน

function gridWidth(header: Row, rows: Row[]): number {
  let w = header.length;
  for (const r of rows) if (r.length > w) w = r.length;
  return w;
}

function isBlankCell(c: Cell): boolean {
  return c === null || c === undefined || (typeof c === "string" && c.trim() === "");
}

function normKey(cell: Cell, trim: boolean, ci: boolean): string {
  if (cell === null || cell === undefined) return "";
  let s = typeof cell === "string" ? cell : String(cell);
  if (trim) s = s.trim();
  if (ci) s = s.toLowerCase();
  return s;
}

// parse ตัวเลข (ตัด comma + trim) — self-contained ตามกฎ pure engine
function parseNumeric(v: Cell): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return null;
  if (v === null || v === undefined) return null;
  const t = v.replace(/,/g, "").trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function rollupByKey(
  header: Row,
  dataRows: Row[],
  keyCols: number[],
  sumCols: number[],
  opts: RollupOptions = {},
): RollupResult {
  const trim = opts.trim !== false;
  const ci = opts.caseInsensitive === true;
  const dropEmptyKey = opts.dropEmptyKey === true;
  const otherMode: OtherMode = opts.otherMode ?? "first";
  const addCount = opts.addCount === true;

  const width = gridWidth(header, dataRows);
  const keys = keyCols.filter((c) => c >= 0 && c < width);
  const sums = sumCols.filter((c) => c >= 0 && c < width && !keys.includes(c));

  const base: Omit<RollupResult, "error"> = {
    header: [],
    rows: [],
    inputRows: dataRows.length,
    outputRows: 0,
    collapsedRows: 0,
    groups: 0,
    emptyKeyRows: 0,
    droppedEmpty: 0,
    droppedBlank: 0,
    biggestGroup: 0,
  };

  if (width === 0) return { ...base, error: "ไม่มีข้อมูล (ตารางว่าง)" };
  if (keys.length === 0) return { ...base, error: "เลือกคอลัมน์ key อย่างน้อย 1 คอลัมน์" };

  const order: string[] = [];
  const map = new Map<string, Row[]>();
  let emptyKeyRows = 0;
  let droppedEmpty = 0;
  let droppedBlank = 0;
  let emptyCounter = 0;

  for (const row of dataRows) {
    // ตัดแถวว่างทั้งแถวก่อน (ไม่มีข้อมูล)
    if (!row.some((c) => !isBlankCell(c))) {
      droppedBlank += 1;
      continue;
    }
    const parts = keys.map((kc) => normKey(kc < row.length ? (row[kc] ?? null) : null, trim, ci));
    const isEmpty = parts.every((p) => p === "");
    let key: string;
    if (isEmpty) {
      emptyKeyRows += 1;
      if (dropEmptyKey) {
        droppedEmpty += 1;
        continue;
      }
      key = `empty${emptyCounter++}`; // คีย์ว่าง = แถวเดี่ยว (ไม่ยุบรวมกัน)
    } else {
      key = parts.join(SEP);
    }
    let bucket = map.get(key);
    if (!bucket) {
      bucket = [];
      map.set(key, bucket);
      order.push(key);
    }
    bucket.push(row);
  }

  const outRows: Row[] = [];
  let biggest = 0;
  let counted = 0;
  for (const key of order) {
    const grp = map.get(key)!;
    counted += grp.length;
    if (grp.length > biggest) biggest = grp.length;
    const rep = otherMode === "last" ? grp[grp.length - 1] : grp[0];
    const newRow: Row = [];
    for (let c = 0; c < width; c++) {
      if (sums.includes(c)) {
        let s = 0;
        let n = 0;
        for (const r of grp) {
          const v = parseNumeric(c < r.length ? (r[c] ?? null) : null);
          if (v !== null) {
            s += v;
            n += 1;
          }
        }
        newRow.push(n > 0 ? Math.round(s * 1e6) / 1e6 : "");
      } else {
        newRow.push(c < rep.length ? (rep[c] ?? null) : null);
      }
    }
    if (addCount) newRow.push(grp.length);
    outRows.push(newRow);
  }

  const outHeader: Row = [];
  for (let c = 0; c < width; c++) outHeader.push(c < header.length ? (header[c] ?? null) : null);
  if (addCount) outHeader.push("จำนวนแถวรวม");

  return {
    header: outHeader,
    rows: outRows,
    inputRows: dataRows.length,
    outputRows: outRows.length,
    collapsedRows: counted - order.length,
    groups: order.length,
    emptyKeyRows,
    droppedEmpty,
    droppedBlank,
    biggestGroup: biggest,
  };
}

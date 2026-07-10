// สัดส่วน / ยอดรวม / อันดับ "ภายในกลุ่ม" (Group Share) — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case จริง: แต่ละกล่อง/tracking คิดเป็นกี่ % ของ "ตู้ (container) ของตัวเอง" · น้ำหนักรวมของตู้นั้น · อันดับหนักสุดในตู้
//   → เห็นว่ากล่องไหนกินสัดส่วนในตู้เยอะ / เรียงความสำคัญภายในแต่ละตู้
// ต่างจาก /percent (สัดส่วนเทียบ "ทั้งคอลัมน์") — อันนี้เทียบ "ภายในกลุ่ม" · ต่างจาก /group (ยุบทั้งกลุ่มเป็น 1 แถว) — อันนี้เติมค่าคืนราย "แถว"
// ปรัชญา: อ่านอย่างเดียว ไม่แก้ข้อมูลเดิม (เติมคอลัมน์ท้ายตาราง) · ทุกแถวออกครบ (ไม่หาย) ·
//   ช่องค่าที่ไม่ใช่ตัวเลข / แถวคีย์ว่าง (เมื่อเลือกข้าม) = เว้นว่าง ไม่นับเข้ายอดกลุ่ม (ไม่เดามั่ว)

import type { Cell, Row } from "@/lib/reconcile/types";

export type GroupMetric = "share" | "group-total" | "rank";

export interface GroupShareOptions {
  groupCols: number[]; // คอลัมน์ที่ใช้จัดกลุ่ม (หลายชั้นได้)
  valueCol: number; // คอลัมน์ค่า (ตัวเลข) ที่จะคิดสัดส่วน/ยอดรวม/อันดับ
  metrics: GroupMetric[]; // ค่าที่จะเติม (ตามลำดับ)
  round?: number | null; // ปัดทศนิยม % และยอดรวม (null = ไม่ปัด)
  trim?: boolean; // trim คีย์กลุ่มก่อนจับกลุ่ม (default true)
  ignoreEmptyKey?: boolean; // แถวคีย์กลุ่มว่าง → เว้นว่าง ไม่จัดกลุ่ม (default false)
  rankDir?: "desc" | "asc"; // อันดับ: desc = มากสุด=1 (default) · asc = น้อยสุด=1
}

export interface GroupShareResult {
  header: Row; // หัวตาราง + คอลัมน์ที่เติม
  rows: Row[]; // แถวข้อมูล + ค่าที่เติม (ทุกแถว)
  addedCols: string[]; // ชื่อคอลัมน์ที่เติมเข้าไป
  inputRows: number; // แถว input ทั้งหมด
  dataRows: number; // แถวหลังตัดแถวว่างทั้งแถว
  numericRows: number; // แถวที่ค่าเป็นตัวเลข (นับเข้ายอดกลุ่ม)
  skipped: number; // แถวที่ค่าไม่ใช่ตัวเลข (จัดกลุ่มได้แต่ไม่นับยอด)
  ignoredKeyRows: number; // แถวคีย์ว่างที่ถูกข้าม (เมื่อ ignoreEmptyKey)
  groups: number; // จำนวนกลุ่ม (distinct key)
  error?: string;
}

const SEP = "";

function isBlankCell(v: Cell): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}
function isDataRow(row: Row): boolean {
  return row.some((c) => !isBlankCell(c));
}
function parseNumeric(v: Cell): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/,/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function headerText(c: Cell): string {
  return c === null || c === undefined ? "" : String(c);
}
function roundTo(v: number, digits: number | null | undefined): number {
  if (digits === null || digits === undefined) return v;
  const f = Math.pow(10, digits);
  return Math.round((v + Number.EPSILON) * f) / f;
}
function keyOf(row: Row, cols: number[], trim: boolean): { key: string; blank: boolean } {
  const parts: string[] = [];
  let allBlank = true;
  for (const c of cols) {
    const cell = c >= 0 && c < row.length ? row[c] : null;
    let s = cell === null || cell === undefined ? "" : String(cell);
    if (trim) s = s.trim();
    if (s !== "") allBlank = false;
    parts.push(s);
  }
  return { key: parts.join(SEP), blank: allBlank };
}

export function analyzeGroupShare(header: Row, allRows: Row[], opts: GroupShareOptions): GroupShareResult {
  const trim = opts.trim !== false;
  const ignoreEmptyKey = opts.ignoreEmptyKey === true;
  const rankDir = opts.rankDir === "asc" ? "asc" : "desc";
  const inputRows = allRows.length;
  const rows = allRows.filter(isDataRow);
  const dataRows = rows.length;

  const width = Math.max(header.length, ...rows.map((r) => r.length), 1);

  const base = (msg: string): GroupShareResult => ({
    header: header.slice(),
    rows: rows.map((r) => r.slice()),
    addedCols: [],
    inputRows,
    dataRows,
    numericRows: 0,
    skipped: 0,
    ignoredKeyRows: 0,
    groups: 0,
    error: msg,
  });

  if (dataRows === 0) return base("ไม่มีแถวข้อมูล");
  if (opts.valueCol < 0 || opts.valueCol >= width) return base("เลือกคอลัมน์ค่า (ตัวเลข) ที่จะคิดสัดส่วน");
  if (!opts.groupCols || opts.groupCols.length === 0) return base("เลือกคอลัมน์สำหรับจัดกลุ่มอย่างน้อย 1 คอลัมน์");
  for (const c of opts.groupCols) if (c < 0 || c >= width) return base("คอลัมน์จัดกลุ่มอยู่นอกช่วง");
  if (!opts.metrics || opts.metrics.length === 0) return base("เลือกอย่างน้อย 1 ค่าที่จะคำนวณ");

  // pass 1: จัดกลุ่ม + รวมยอด
  interface G {
    total: number;
    values: number[];
  }
  const groups = new Map<string, G>();
  const rowInfo: { key: string | null; value: number | null }[] = [];
  let numericRows = 0;
  let skipped = 0;
  let ignoredKeyRows = 0;

  for (const r of rows) {
    const { key, blank } = keyOf(r, opts.groupCols, trim);
    if (blank && ignoreEmptyKey) {
      rowInfo.push({ key: null, value: null });
      ignoredKeyRows++;
      continue;
    }
    const value = parseNumeric(opts.valueCol < r.length ? r[opts.valueCol] : null);
    rowInfo.push({ key, value });
    let g = groups.get(key);
    if (!g) {
      g = { total: 0, values: [] };
      groups.set(key, g);
    }
    if (value === null) {
      skipped++;
    } else {
      g.total += value;
      g.values.push(value);
      numericRows++;
    }
  }

  // ชื่อคอลัมน์ที่เติม
  const valueName = headerText(header[opts.valueCol]) || `คอลัมน์ ${opts.valueCol + 1}`;
  const nameFor = (m: GroupMetric): string => {
    if (m === "share") return `${valueName} % ในกลุ่ม`;
    if (m === "group-total") return `${valueName} รวมกลุ่ม`;
    return "อันดับในกลุ่ม";
  };
  const addedCols = opts.metrics.map(nameFor);

  // อันดับแบบ competition (1-2-2-4) ภายในกลุ่ม
  function rankIn(g: G, value: number): number {
    let ahead = 0;
    for (const v of g.values) {
      if (rankDir === "desc" ? v > value : v < value) ahead++;
    }
    return ahead + 1;
  }

  const outHeader = header.slice();
  while (outHeader.length < width) outHeader.push(null);
  for (const nm of addedCols) outHeader.push(nm);

  const outRows: Row[] = rows.map((r, i) => {
    const out = r.slice();
    while (out.length < width) out.push(null);
    const info = rowInfo[i];
    for (const m of opts.metrics) {
      let cell: Cell = null;
      if (info.key !== null && info.value !== null) {
        const g = groups.get(info.key)!;
        if (m === "share") {
          cell = g.total === 0 ? null : roundTo((info.value / g.total) * 100, opts.round);
        } else if (m === "group-total") {
          cell = roundTo(g.total, opts.round);
        } else {
          cell = rankIn(g, info.value);
        }
      }
      out.push(cell);
    }
    return out;
  });

  return {
    header: outHeader,
    rows: outRows,
    addedCols,
    inputRows,
    dataRows,
    numericRows,
    skipped,
    ignoredKeyRows,
    groups: groups.size,
  };
}

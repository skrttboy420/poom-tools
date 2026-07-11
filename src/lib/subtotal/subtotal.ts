// แทรกแถวยอดย่อยต่อกลุ่ม + แถวรวมท้าย (Subtotal · Excel Data ▸ Subtotal) — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case จริง: packing list ต่อตู้ → เก็บรายละเอียดทุกกล่อง/ทุกแถวไว้ครบ แล้ว "แทรก" แถวยอดรวมต่อตู้ (kg/CBM/กล่อง) คั่นแต่ละกลุ่ม + แถวรวมทั้งหมดท้ายสุด
//   → ได้รายงานปริ้นต์ได้เลย: เห็นทั้งของจริงรายแถว + ยอดรวมต่อตู้ในไฟล์เดียว
// ต่างจาก /group (ยุบทั้งกลุ่มเหลือ 1 แถว — รายละเอียดหาย) · /rollup (ยุบเหมือนกัน เก็บค่าตัวแทน) · /group-share (เติมคอลัมน์ % ราย "แถว") ·
//   /pivot (ตารางไขว้) — อันนี้ = เก็บ "ทุกแถวเดิม" ครบ แล้วแค่ "แทรก" แถวยอดย่อยคั่น (ไม่ยุบ ไม่ทำข้อมูลหาย)
// ปรัชญา: ไม่เดามั่ว/ไม่ทำข้อมูลหาย — ทุกแถวรายละเอียดอยู่ครบ (output = detail + แถวยอดย่อย/กลุ่ม + แถวรวมท้าย) ·
//   ช่องไม่ใช่ตัวเลข = ไม่นับเข้ายอด · คอลัมน์ที่ไม่มีเลขเลยในกลุ่ม → เว้นว่าง (ไม่กุ 0) · คีย์ว่างคงเป็นกลุ่ม "(ว่าง)"

import type { Cell, Row } from "@/lib/reconcile/types";

export interface SubtotalOptions {
  groupCols: number[]; // คอลัมน์จัดกลุ่ม (หลายคอลัมน์ = composite key)
  sumCols: number[]; // คอลัมน์ตัวเลขที่จะรวมยอดในแถวยอดย่อย
  regroup?: boolean; // true (default) = จัดแถวกลุ่มเดียวกันให้ติดกันก่อน (เสถียร) · false = ตัดกลุ่มเมื่อคีย์ "ติดกัน" เปลี่ยน (แบบ Excel ที่ต้อง sort ก่อน)
  grandTotal?: boolean; // เพิ่มแถวรวมทั้งหมดท้ายสุด (default true)
  labelCol?: number; // คอลัมน์ที่จะใส่ป้าย "X รวม" (default = groupCols แรก)
  trim?: boolean; // trim คีย์ตอนจับกลุ่ม (default true)
  round?: number | null; // ปัดยอดรวม (default null = ไม่ปัด · ล้าง float noise ให้เอง)
  totalLabel?: string; // ป้ายแถวรวมทั้งหมด (default "รวมทั้งหมด")
  subtotalSuffix?: string; // ต่อท้ายคีย์กลุ่มในแถวยอดย่อย (default " รวม")
}

export interface SubtotalResult {
  header: Row;
  rows: Row[]; // รายละเอียดทุกแถว + แถวยอดย่อยต่อกลุ่ม + แถวรวมท้าย
  inputRows: number;
  dataRows: number; // หลังตัดแถวว่างทั้งแถว
  groups: number;
  subtotalRowIndexes: number[]; // index ใน rows[] ที่เป็นแถวยอดย่อย
  grandTotalIndex: number; // -1 ถ้าไม่มี
  droppedBlankRows: number;
  emptyKeyGroups: number; // กลุ่มที่คีย์ว่างทั้งหมด
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
// แปลงเป็นตัวเลข (ตัด comma หลักพัน + trim) · boolean/Infinity/ว่าง → null (ไม่เดามั่ว)
function parseNumeric(v: Cell): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.replace(/,/g, "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function cleanFloat(n: number): number {
  return Number(n.toPrecision(12));
}
function roundTo(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round((n + Number.EPSILON) * f) / f;
}
// normalize คีย์กลุ่ม (trim + lowercase — คีย์ควรจับคู่แบบไม่สนช่องว่าง/พิมพ์)
function normKey(v: Cell, trim: boolean): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (trim) s = s.trim();
  return s.toLowerCase();
}
// ค่าคีย์ที่จะเอาไปแสดง (คงค่าจริง · ว่าง → "(ว่าง)")
function displayKey(v: Cell, trim: boolean): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (trim) s = s.trim();
  return s === "" ? "(ว่าง)" : s;
}

interface Group {
  keyLabel: string; // ป้ายรวม (composite → join ด้วย " · ")
  keyBlank: boolean;
  rows: Row[];
}

export function analyzeSubtotal(header: Row, allRows: Row[], opts: SubtotalOptions): SubtotalResult {
  const inputRows = allRows.length;
  const dataRowsArr = allRows.filter(isDataRow);
  const dataRows = dataRowsArr.length;
  const droppedBlankRows = inputRows - dataRows;
  const width = Math.max(header.length, ...dataRowsArr.map((r) => r.length), 1);

  const base = (msg: string): SubtotalResult => ({
    header: header.slice(),
    rows: dataRowsArr.map((r) => r.slice()),
    inputRows,
    dataRows,
    groups: 0,
    subtotalRowIndexes: [],
    grandTotalIndex: -1,
    droppedBlankRows,
    emptyKeyGroups: 0,
    error: msg,
  });

  if (dataRows === 0) return base("ไม่มีแถวข้อมูล");
  const groupCols = (opts.groupCols ?? []).filter((c) => c >= 0 && c < width);
  if (groupCols.length === 0) return base("เลือกคอลัมน์ที่จะจัดกลุ่มอย่างน้อย 1 คอลัมน์");
  const sumCols = (opts.sumCols ?? []).filter((c) => c >= 0 && c < width);
  if (sumCols.length === 0) return base("เลือกคอลัมน์ตัวเลขที่จะรวมยอดอย่างน้อย 1 คอลัมน์");

  const trim = opts.trim !== false;
  const regroup = opts.regroup !== false;
  const grandTotal = opts.grandTotal !== false;
  const totalLabel = opts.totalLabel && opts.totalLabel.trim() !== "" ? opts.totalLabel.trim() : "รวมทั้งหมด";
  const subtotalSuffix = opts.subtotalSuffix != null ? opts.subtotalSuffix : " รวม";
  // labelCol: default = groupCols แรก · ถ้าเลือกมาอยู่นอกช่วง → กลับไป groupCols แรก
  let labelCol = opts.labelCol != null && opts.labelCol >= 0 && opts.labelCol < width ? opts.labelCol : groupCols[0];
  const sumSet = new Set(sumCols);
  // ถ้า labelCol ชนคอลัมน์ยอด → หาคอลัมน์กลุ่มตัวแรกที่ไม่ใช่คอลัมน์ยอด (ไม่งั้นยอดจะทับป้าย)
  if (sumSet.has(labelCol)) {
    const alt = groupCols.find((c) => !sumSet.has(c));
    if (alt != null) labelCol = alt;
  }

  const sig = (row: Row): string => groupCols.map((c) => normKey(cellAt(row, c), trim)).join("");
  const makeLabel = (row: Row): string => groupCols.map((c) => displayKey(cellAt(row, c), trim)).join(" · ");
  const isKeyBlank = (row: Row): boolean => groupCols.every((c) => normKey(cellAt(row, c), trim) === "");

  // สร้างลิสต์กลุ่มตามลำดับ
  const groups: Group[] = [];
  if (regroup) {
    const map = new Map<string, Group>();
    for (const row of dataRowsArr) {
      const s = sig(row);
      let g = map.get(s);
      if (!g) {
        g = { keyLabel: makeLabel(row), keyBlank: isKeyBlank(row), rows: [] };
        map.set(s, g);
        groups.push(g);
      }
      g.rows.push(row);
    }
  } else {
    let cur: Group | null = null;
    let curSig: string | null = null;
    for (const row of dataRowsArr) {
      const s = sig(row);
      if (cur === null || s !== curSig) {
        cur = { keyLabel: makeLabel(row), keyBlank: isKeyBlank(row), rows: [] };
        groups.push(cur);
        curSig = s;
      }
      cur.rows.push(row);
    }
  }

  const finalizeSum = (n: number): number => (opts.round != null ? roundTo(n, opts.round) : cleanFloat(n));

  // รวมยอดของชุดแถว → คืน Map<col, number|null> (null = ไม่มีเลขเลย → เว้นว่าง)
  const sumOf = (rows: Row[]): Map<number, number | null> => {
    const acc = new Map<number, { sum: number; has: boolean }>();
    for (const c of sumCols) acc.set(c, { sum: 0, has: false });
    for (const r of rows) {
      for (const c of sumCols) {
        const n = parseNumeric(cellAt(r, c));
        if (n !== null) {
          const a = acc.get(c)!;
          a.sum += n;
          a.has = true;
        }
      }
    }
    const out = new Map<number, number | null>();
    for (const c of sumCols) {
      const a = acc.get(c)!;
      out.set(c, a.has ? finalizeSum(a.sum) : null);
    }
    return out;
  };

  const outRows: Row[] = [];
  const subtotalRowIndexes: number[] = [];
  let emptyKeyGroups = 0;

  for (const g of groups) {
    if (g.keyBlank) emptyKeyGroups++;
    // แถวรายละเอียด (rectangularize ให้เท่า width)
    for (const r of g.rows) {
      const row = r.slice();
      while (row.length < width) row.push(null);
      outRows.push(row);
    }
    // แถวยอดย่อย
    const sub: Row = new Array<Cell>(width).fill(null);
    const sums = sumOf(g.rows);
    for (const c of sumCols) sub[c] = sums.get(c) ?? null;
    if (!sumSet.has(labelCol)) sub[labelCol] = `${g.keyLabel}${subtotalSuffix}`;
    subtotalRowIndexes.push(outRows.length);
    outRows.push(sub);
  }

  let grandTotalIndex = -1;
  if (grandTotal) {
    const grand: Row = new Array<Cell>(width).fill(null);
    const sums = sumOf(dataRowsArr);
    for (const c of sumCols) grand[c] = sums.get(c) ?? null;
    if (!sumSet.has(labelCol)) grand[labelCol] = totalLabel;
    grandTotalIndex = outRows.length;
    outRows.push(grand);
  }

  const outHeader = header.slice();
  while (outHeader.length < width) outHeader.push(null);

  return {
    header: outHeader,
    rows: outRows,
    inputRows,
    dataRows,
    groups: groups.length,
    subtotalRowIndexes,
    grandTotalIndex,
    droppedBlankRows,
    emptyKeyGroups,
  };
}

// export ผลเป็น CSV
export function subtotalToCsv(result: SubtotalResult): string {
  const esc = (v: Cell) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [result.header.map(esc).join(",")];
  for (const r of result.rows) lines.push(r.map(esc).join(","));
  return lines.join("\n");
}

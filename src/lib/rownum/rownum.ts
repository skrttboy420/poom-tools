// ออกเลขลำดับ / เลขรัน (running number) → เติมเป็นคอลัมน์ใหม่ — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case จริง: numbering line item ของ packing list ก่อน export เข้า Pacred (No. 1..N),
//   ออกเลขกล่องแยกต่อ "ตู้/tracking" (นับใหม่ในแต่ละกลุ่ม เช่น BOX-001 ต่อตู้), เลข running มี prefix/zero-pad
// ต่างจาก /seq-gap (หา "เลขที่ควรมีแต่หาย") · /calc-col (คำนวณจากคอลัมน์เดิม) — อันนี้ "สร้างเลขลำดับใหม่"
// ปรัชญา: ไม่ทำแถวหาย (จำนวนแถวเท่าเดิมเสมอ) + ไม่แก้ค่าเดิม (เติมคอลัมน์เดียว) ·
//   แถวว่างทั้งแถว → ไม่ใส่เลข (กันเลขติดแถวผี) แต่แถวยังอยู่ · นับแยกต่อกลุ่มแบบ "per-key running"
//   (ค่ากลุ่มเดียวกันโผล่อีก = นับต่อจากเดิม ไม่รีเซ็ต) → sorted ก็ได้ unsorted ก็ถูก

import type { Cell, Row } from "@/lib/reconcile/types";

export interface RowNumberOptions {
  name?: string; // ชื่อหัวคอลัมน์ใหม่ (default "ลำดับ")
  start?: number; // เริ่มนับที่ (default 1)
  step?: number; // ก้าวละ (default 1)
  padWidth?: number; // เติม 0 ข้างหน้าให้ครบกี่หลัก (0/ไม่ใส่ = ไม่เติม)
  prefix?: string; // ข้อความนำหน้าเลข
  suffix?: string; // ข้อความต่อท้ายเลข
  position?: "start" | "end"; // คอลัมน์ใหม่อยู่หน้าสุด/ท้ายสุด (default "start")
  groupCol?: number | null; // ตั้ง = นับแยกต่อค่าคอลัมน์นี้ · null = นับรวดเดียว
  trimGroup?: boolean; // trim ค่าคีย์กลุ่มก่อนเทียบ (default true)
  skipBlankRows?: boolean; // แถวว่างทั้งแถว → ไม่ใส่เลข (default true)
}

export interface RowNumberResult {
  header: string[];
  rows: Row[];
  inputRows: number;
  numbered: number; // แถวที่ได้เลข
  skipped: number; // แถวที่ข้าม (ว่างทั้งแถว) → ช่องเลขว่าง
  groups: number; // จำนวนกลุ่ม (1 ถ้าไม่แบ่งกลุ่ม, 0 ถ้าไม่มีแถวได้เลข)
  newColIndex: number; // ตำแหน่งคอลัมน์ใหม่ (0 = หน้าสุด, = header เดิม.length ถ้าท้าย)
  error?: string; // ถ้ามี = header/rows คืนของเดิมไม่แตะ
}

function isBlankCell(v: Cell): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

function isBlankRow(row: Row): boolean {
  for (const c of row) if (!isBlankCell(c)) return false;
  return true;
}

// zero-pad ส่วนตัวเลข (รักษาเครื่องหมายลบไว้หน้าสุด)
function padNumber(n: number, width: number): string {
  const neg = n < 0;
  const digits = String(Math.abs(n));
  return (neg ? "-" : "") + digits.padStart(width, "0");
}

export function addRowNumber(
  header: string[],
  dataRows: Row[],
  opts: RowNumberOptions = {},
): RowNumberResult {
  const cloneRows: Row[] = dataRows.map((r) => r.slice());
  const width = header.length;
  const posEnd = opts.position === "end";
  const newColIndex = posEnd ? width : 0;

  const base: RowNumberResult = {
    header: header.slice(),
    rows: cloneRows,
    inputRows: dataRows.length,
    numbered: 0,
    skipped: 0,
    groups: 0,
    newColIndex,
    error: undefined,
  };

  const name = (opts.name ?? "ลำดับ").trim();
  if (name === "") return { ...base, error: "ตั้งชื่อคอลัมน์ใหม่ก่อน" };

  const groupCol = opts.groupCol ?? null;
  const groupMode = groupCol !== null;
  if (groupMode && (groupCol < 0 || groupCol >= width)) {
    return { ...base, error: "เลือกคอลัมน์จัดกลุ่มให้ถูกต้อง" };
  }

  const start = Number.isFinite(opts.start) ? (opts.start as number) : 1;
  const step = Number.isFinite(opts.step) ? (opts.step as number) : 1;
  const padWidth = Number.isFinite(opts.padWidth) ? Math.max(0, opts.padWidth as number) : 0;
  const prefix = opts.prefix ?? "";
  const suffix = opts.suffix ?? "";
  const trimGroup = opts.trimGroup !== false;
  const skipBlank = opts.skipBlankRows !== false;
  const plain = prefix === "" && suffix === "" && padWidth <= 0; // เก็บ type ตัวเลขได้

  const formatNum = (n: number): Cell => {
    if (plain) return n; // ปล่อยเป็น number จริง (ให้ /sort /group ใช้ต่อได้)
    const numStr = padWidth > 0 ? padNumber(n, padWidth) : String(n);
    return prefix + numStr + suffix;
  };

  const newHeader = posEnd ? [...header, name] : [name, ...header];

  const groupCounters = new Map<string, number>();
  let globalCounter = 0;
  let numbered = 0;
  let skipped = 0;

  const out: Row[] = dataRows.map((row) => {
    // ทำแถวให้เป็นสี่เหลี่ยม (aligned กับ header เดิม) ก่อน
    const nr: Row = [];
    for (let c = 0; c < width; c++) nr.push(row[c] ?? null);

    let cellVal: Cell;
    if (skipBlank && isBlankRow(row)) {
      cellVal = ""; // แถวว่าง → ไม่ใส่เลข (กันแถวผีมีเลข)
      skipped++;
    } else {
      let k: number;
      if (groupMode) {
        const raw = groupCol < row.length ? (row[groupCol] ?? "") : "";
        let key = String(raw);
        if (trimGroup) key = key.trim();
        k = groupCounters.get(key) ?? 0;
        groupCounters.set(key, k + 1);
      } else {
        k = globalCounter;
        globalCounter++;
      }
      cellVal = formatNum(start + k * step);
      numbered++;
    }

    return posEnd ? [...nr, cellVal] : [cellVal, ...nr];
  });

  const groups = groupMode ? groupCounters.size : numbered > 0 ? 1 : 0;

  return {
    header: newHeader,
    rows: out,
    inputRows: dataRows.length,
    numbered,
    skipped,
    groups,
    newColIndex,
  };
}

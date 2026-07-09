// สรุปยอด/สถิติต่อคอลัมน์ — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case: อัปโหลด packing list → รู้ยอดรวม/เฉลี่ย/ต่ำสุด/สูงสุด ของน้ำหนัก/CBM/จำนวนกล่องทันที
//   + นับช่องว่าง/ศูนย์/ไม่ใช่ตัวเลข เพื่อจับข้อมูลเพี้ยน (สอดคล้อง gap finder)
// ปรัชญา: แค่ "อ่านสรุป" ไม่แก้ข้อมูล · ตัดแถวว่างทั้งแถวออกก่อนนับ (ไม่ให้ยอดเพี้ยน)

import type { Cell, Row } from "@/lib/reconcile/types";

// แปลงเป็นตัวเลข: string ตัด comma + trim แล้วค่อยพยายามแปลง · คืน null ถ้าไม่ใช่ตัวเลข/ว่าง
export function parseNumeric(v: Cell): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return null;
  if (typeof v === "string") {
    const s = v.replace(/,/g, "").trim();
    if (s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// ช่องว่างไหม (null/undefined/ช่องว่างล้วน)
function isBlankCell(v: Cell): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

// แถวนี้มีข้อมูลจริงไหม (มีอย่างน้อย 1 ช่องไม่ว่าง) — กันแถวว่างทั้งแถวมาปั่นยอด
function isDataRow(row: Row): boolean {
  return row.some((c) => !isBlankCell(c));
}

export interface ColumnStat {
  index: number;
  header: string;
  count: number; // จำนวนแถวข้อมูลจริงที่พิจารณา
  filled: number; // ช่องที่มีค่า (ไม่ว่าง)
  blank: number; // ช่องว่าง
  numeric: number; // ช่องที่เป็นตัวเลข
  nonNumeric: number; // ช่องมีค่าแต่ไม่ใช่ตัวเลข
  zero: number; // ช่องที่เป็น 0
  distinct: number; // จำนวนค่าไม่ซ้ำ (นับเฉพาะช่องไม่ว่าง, เทียบแบบ string)
  sum: number; // ผลรวมของช่องตัวเลข
  avg: number | null; // เฉลี่ย = sum / numeric (null ถ้าไม่มีตัวเลขเลย)
  min: number | null;
  max: number | null;
  isNumericCol: boolean; // คอลัมน์นี้ "ส่วนใหญ่เป็นตัวเลข" ไหม (numeric >= filled/2 และ filled>0)
}

export interface StatsResult {
  totalRows: number; // แถวข้อมูลจริงทั้งหมด (หลังตัดแถวว่าง)
  columns: ColumnStat[];
}

// สรุปสถิติของทุกคอลัมน์ (หรือเฉพาะที่เลือกผ่าน cols)
export function computeStats(
  header: string[],
  dataRows: Row[],
  cols?: number[],
): StatsResult {
  const rows = dataRows.filter(isDataRow);
  const width = Math.max(header.length, ...rows.map((r) => r.length), 0);
  const targets =
    cols && cols.length > 0
      ? cols.filter((c) => c >= 0 && c < width)
      : Array.from({ length: width }, (_, i) => i);

  const columns: ColumnStat[] = targets.map((idx) => {
    let filled = 0;
    let blank = 0;
    let numeric = 0;
    let nonNumeric = 0;
    let zero = 0;
    let sum = 0;
    let min: number | null = null;
    let max: number | null = null;
    const seen = new Set<string>();

    for (const row of rows) {
      const cell = idx < row.length ? row[idx] : null;
      if (isBlankCell(cell)) {
        blank++;
        continue;
      }
      filled++;
      seen.add(String(cell).trim());
      const n = parseNumeric(cell);
      if (n === null) {
        nonNumeric++;
      } else {
        numeric++;
        sum += n;
        if (n === 0) zero++;
        if (min === null || n < min) min = n;
        if (max === null || n > max) max = n;
      }
    }

    const avg = numeric > 0 ? sum / numeric : null;
    return {
      index: idx,
      header: header[idx] ?? `คอลัมน์ ${idx + 1}`,
      count: rows.length,
      filled,
      blank,
      numeric,
      nonNumeric,
      zero,
      distinct: seen.size,
      sum,
      avg,
      min,
      max,
      isNumericCol: filled > 0 && numeric >= filled / 2,
    };
  });

  return { totalRows: rows.length, columns };
}

// จัดรูปตัวเลขให้อ่านง่าย (คอมมา + ทศนิยมพอดี — เลขจำนวนเต็มไม่โชว์ .00)
export function fmtNum(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  const rounded = Math.round(n * 1e6) / 1e6; // กัน floating error (เช่น 0.1+0.2)
  return rounded.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

// export สรุปเป็น CSV (1 คอลัมน์ = 1 แถว)
export function statsToCsv(result: StatsResult): string {
  const head = [
    "คอลัมน์",
    "แถวทั้งหมด",
    "มีค่า",
    "ว่าง",
    "ตัวเลข",
    "ไม่ใช่ตัวเลข",
    "ศูนย์",
    "ค่าไม่ซ้ำ",
    "ผลรวม",
    "เฉลี่ย",
    "ต่ำสุด",
    "สูงสุด",
  ];
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [head.map(esc).join(",")];
  for (const c of result.columns) {
    lines.push(
      [
        c.header,
        c.count,
        c.filled,
        c.blank,
        c.numeric,
        c.nonNumeric,
        c.zero,
        c.distinct,
        c.numeric > 0 ? c.sum : "",
        c.avg === null ? "" : c.avg,
        c.min === null ? "" : c.min,
        c.max === null ? "" : c.max,
      ]
        .map((v) => esc(String(v)))
        .join(","),
    );
  }
  return lines.join("\n");
}

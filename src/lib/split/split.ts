// แยกไฟล์เดียวเป็นหลายกลุ่ม — pure ล้วน (ไม่พึ่ง DOM/DB)
// 2 แบบ: ตามค่าคอลัมน์ (เช่น แยกตามตู้ container) · ตามจำนวนแถว (แบ่งเป็นก้อน ๆ)
// ปรัชญาเดียวกับทั้ง repo: ไม่ทิ้งข้อมูล — ทุกแถวเข้าไปอยู่ในกลุ่มใดกลุ่มหนึ่งเสมอ (คีย์ว่าง → กลุ่ม "(ว่าง)")
import type { Cell, Row } from "@/lib/reconcile/types";

export type SplitMode = "by-column" | "by-rows";

export const SPLIT_MODE_LABEL: Record<SplitMode, string> = {
  "by-column": "ตามค่าในคอลัมน์ (เช่น ตู้/container)",
  "by-rows": "ตามจำนวนแถวต่อไฟล์",
};

export const EMPTY_KEY_LABEL = "(ว่าง)";

export interface SplitGroup {
  key: string; // ชื่อกลุ่ม (ค่าคอลัมน์ หรือช่วงแถว "1–100")
  rows: Row[]; // แถวข้อมูลของกลุ่ม (ไม่รวม header)
}

export interface SplitStats {
  inputRows: number;
  groups: number;
  emptyKeyRows: number; // แถวคีย์ว่าง (เฉพาะ by-column) ที่ถูกจัดเข้ากลุ่ม "(ว่าง)"
  biggest: number; // จำนวนแถวของกลุ่มใหญ่สุด
}

export interface SplitResult {
  header: Row;
  groups: SplitGroup[];
  stats: SplitStats;
}

function cellText(v: Cell): string {
  return v === null || v === undefined ? "" : String(v);
}

// แยกตามค่าคอลัมน์ — คงลำดับกลุ่มตามที่เจอครั้งแรก (stable) แล้วค่อยเรียงตอนแสดง
export function splitByColumn(
  header: Row,
  dataRows: Row[],
  col: number,
  opts: { trim: boolean } = { trim: true },
): SplitResult {
  const map = new Map<string, Row[]>();
  let emptyKeyRows = 0;
  for (const row of dataRows) {
    let key = cellText(row[col]);
    if (opts.trim) key = key.trim();
    if (key === "") {
      emptyKeyRows += 1;
      key = EMPTY_KEY_LABEL;
    }
    const arr = map.get(key);
    if (arr) arr.push(row);
    else map.set(key, [row]);
  }
  const groups: SplitGroup[] = Array.from(map, ([key, rows]) => ({ key, rows }));
  return finalize(header, dataRows.length, groups, emptyKeyRows);
}

// แยกตามจำนวนแถวต่อไฟล์ (chunk) — เรียงตามลำดับเดิม
export function splitByRows(header: Row, dataRows: Row[], chunk: number): SplitResult {
  const size = Math.max(1, Math.floor(chunk) || 1);
  const groups: SplitGroup[] = [];
  for (let i = 0; i < dataRows.length; i += size) {
    const slice = dataRows.slice(i, i + size);
    groups.push({ key: `${i + 1}-${i + slice.length}`, rows: slice });
  }
  return finalize(header, dataRows.length, groups, 0);
}

function finalize(header: Row, inputRows: number, groups: SplitGroup[], emptyKeyRows: number): SplitResult {
  const biggest = groups.reduce((m, g) => Math.max(m, g.rows.length), 0);
  return {
    header,
    groups,
    stats: { inputRows, groups: groups.length, emptyKeyRows, biggest },
  };
}

// กลุ่ม → รูปแบบ sheets (มี header นำหน้า) ให้ sheetsToXlsx ใช้ต่อ
export function groupsToSheets(result: SplitResult): { name: string; rows: Row[] }[] {
  return result.groups.map((g) => ({ name: g.key, rows: [result.header, ...g.rows] }));
}

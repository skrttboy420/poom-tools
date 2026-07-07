// ลบข้อมูลซ้ำ — pure ล้วน (ไม่พึ่ง DOM/DB)
// ปรัชญา "ห้ามข้อมูลหาย": โชว์กลุ่มที่ซ้ำให้ดูก่อน แล้วค่อยเลือกเก็บ/ลบ
// - exact-row = ทั้งแถวเหมือนกันเป๊ะ (ปลอดภัยสุด กันลบผิด)
// - by-columns = ซ้ำตามคอลัมน์ที่เลือกเอง (เช่น tracking) — ระวัง packing list 1 tracking หลายกล่อง
import type { Cell, Row } from "@/lib/reconcile/types";

export type DedupMode = "exact-row" | "by-columns";

export const DEDUP_MODE_LABEL: Record<DedupMode, string> = {
  "exact-row": "ทั้งแถวเหมือนกันเป๊ะ",
  "by-columns": "ซ้ำตามคอลัมน์ที่เลือก",
};

export interface DedupOptions {
  mode: DedupMode;
  keyCols: number[]; // ใช้เมื่อ mode = by-columns
  keep: "first" | "last"; // เก็บแถวแรกหรือแถวสุดท้ายของกลุ่ม
  caseInsensitive: boolean; // เทียบไม่สนตัวพิมพ์ใหญ่-เล็ก
  trimWhitespace: boolean; // ตัดช่องว่างหน้า-หลังก่อนเทียบ
  ignoreEmptyKey: boolean; // แถวที่คีย์ว่าง = ไม่นับซ้ำ (กัน subtotal/grand total โดนจับ)
  rowNumberBase?: number; // เลขแถว 1-based ของแถวข้อมูลแรก (ไว้แสดง)
}

export interface DedupRowRef {
  index: number; // index ใน dataRows (0-based)
  rowLabel: number; // เลขแถวจริงในไฟล์ (1-based)
  row: Row;
  kept: boolean; // true = เก็บไว้, false = จะถูกลบ
}

export interface DupGroup {
  signature: string; // ค่าคีย์ที่ทำให้ซ้ำ (คั่นด้วย SEP — ใช้ formatSignature ตอนแสดง)
  rows: DedupRowRef[]; // ทุกแถวในกลุ่ม (>= 2)
}

export interface DedupStats {
  inputRows: number;
  outputRows: number; // หลังลบซ้ำ
  dupGroups: number; // จำนวนกลุ่มที่ซ้ำ
  dupRowsRemoved: number; // จำนวนแถวที่จะถูกลบ
  emptyKeySkipped: number; // แถวคีย์ว่างที่ข้ามไม่นับซ้ำ
}

export interface DedupResult {
  groups: DupGroup[];
  uniqueRows: Row[]; // ผลลัพธ์หลังลบซ้ำ (คงลำดับเดิม)
  stats: DedupStats;
}

const SEP = ""; // ตัวคั่น signature (แทบไม่มีในข้อมูลจริง)

function cellText(v: Cell): string {
  return v === null || v === undefined ? "" : String(v);
}

function sigPart(v: Cell, opts: DedupOptions): string {
  let s = cellText(v);
  if (opts.trimWhitespace) s = s.trim();
  if (opts.caseInsensitive) s = s.toLowerCase();
  return s;
}

// แปลง signature ให้อ่านง่ายตอนแสดงผล
export function formatSignature(sig: string): string {
  return sig.split(SEP).join(" · ");
}

export function findDuplicates(dataRows: Row[], opts: DedupOptions): DedupResult {
  const base = opts.rowNumberBase ?? 1;

  // 1) สร้าง signature ต่อแถว
  const map = new Map<string, number[]>();
  let emptyKeySkipped = 0;
  dataRows.forEach((row, index) => {
    const cols = opts.mode === "exact-row" ? row.map((_, i) => i) : opts.keyCols;
    const parts = cols.map((c) => sigPart(row[c], opts));
    const empty = parts.every((p) => p === "");
    if (opts.ignoreEmptyKey && empty) {
      emptyKeySkipped += 1;
      return;
    }
    const signature = parts.join(SEP);
    const arr = map.get(signature);
    if (arr) arr.push(index);
    else map.set(signature, [index]);
  });

  // 2) หากลุ่มซ้ำ + ตัดสินว่าจะเก็บแถวไหน
  const removed = new Set<number>();
  const groups: DupGroup[] = [];
  for (const [signature, idxs] of map) {
    if (idxs.length < 2) continue;
    const keepIdx = opts.keep === "first" ? idxs[0] : idxs[idxs.length - 1];
    const rows: DedupRowRef[] = idxs.map((index) => {
      const kept = index === keepIdx;
      if (!kept) removed.add(index);
      return { index, rowLabel: base + index, row: dataRows[index], kept };
    });
    groups.push({ signature, rows });
  }

  // เรียงกลุ่มที่ซ้ำเยอะสุดขึ้นก่อน
  groups.sort((a, b) => b.rows.length - a.rows.length);

  // 3) ผลลัพธ์หลังลบซ้ำ (คงลำดับเดิม)
  const uniqueRows = dataRows.filter((_, i) => !removed.has(i));

  return {
    groups,
    uniqueRows,
    stats: {
      inputRows: dataRows.length,
      outputRows: uniqueRows.length,
      dupGroups: groups.length,
      dupRowsRemoved: removed.size,
      emptyKeySkipped,
    },
  };
}

// export ผลลัพธ์ (ไม่มีซ้ำ) เป็น CSV
export function dedupToCsv(header: Row, rows: Row[]): string {
  const esc = (v: Cell) => {
    const s = cellText(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header, ...rows].map((r) => r.map(esc).join(","));
  return lines.join("\n");
}

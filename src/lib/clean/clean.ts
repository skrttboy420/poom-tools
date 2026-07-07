// Data Cleaner / normalizer — จัดรูปข้อมูลก่อนเอาเข้า Pacred (pure, ไม่พึ่ง DOM/DB)
// operations: trim ช่องว่าง · ยุบช่องว่างซ้ำ · ลบแถวว่าง · normalize ตัวเลข (ลบ comma) ·
//             normalize tracking (trim+ตัวพิมพ์ใหญ่+ตัดช่องว่างใน) · ลบแถวซ้ำตาม key
import type { Cell, Row } from "@/lib/reconcile/types";

export type CleanChangeKind = "trim" | "collapse" | "number" | "key";

export const CLEAN_KIND_LABEL: Record<CleanChangeKind, string> = {
  trim: "ตัดช่องว่าง",
  collapse: "ยุบช่องว่างซ้ำ",
  number: "จัดรูปตัวเลข",
  key: "normalize tracking",
};

export interface CleanOptions {
  trim: boolean; // ตัดช่องว่างหน้า-หลังทุกช่องข้อความ
  collapseSpaces: boolean; // ยุบช่องว่างซ้ำในข้อความให้เหลือช่องเดียว
  dropEmptyRows: boolean; // ลบแถวที่ว่างทั้งแถว
  normalizeNumbers: boolean; // คอลัมน์ตัวเลข: ลบ comma/ช่องว่าง แล้วแปลงเป็นตัวเลข
  numberCols: number[]; // index คอลัมน์ที่ถือเป็นตัวเลข
  normalizeKey: boolean; // คอลัมน์ key: trim + พิมพ์ใหญ่ + ตัดช่องว่างภายใน
  keyCol: number; // -1 = ไม่มี
  dedupByKey: boolean; // ลบแถวซ้ำตามค่า key (เก็บแถวแรก)
  rowNumberBase?: number; // เลขแถว 1-based ของแถวข้อมูลแรก (ไว้แสดง)
}

export interface CleanChange {
  rowLabel: number; // เลขแถวเดิม (1-based) เพื่ออ้างอิง
  col: number;
  before: string;
  after: string;
  kind: CleanChangeKind;
}

export interface CleanStats {
  inputRows: number; // แถวข้อมูลก่อน clean (รวมแถวว่าง)
  outputRows: number; // แถวหลัง clean
  droppedEmpty: number;
  droppedDup: number;
  cellsChanged: number;
  byKind: Record<CleanChangeKind, number>;
}

export interface CleanResult {
  rows: Row[]; // ข้อมูลหลัง clean (ไม่รวม header)
  changes: CleanChange[]; // ตัวอย่างการแก้ (cap ไว้เพื่อแสดงผล)
  stats: CleanStats;
}

const CHANGE_CAP = 500; // เก็บตัวอย่างการแก้ไม่เกินเท่านี้เพื่อไม่ให้ UI หน่วง

function cellText(v: Cell): string {
  return v === null || v === undefined ? "" : String(v);
}

function isEmptyCell(v: Cell): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

function isEmptyRow(row: Row): boolean {
  return row.every(isEmptyCell);
}

export function findCleanResult(dataRows: Row[], opts: CleanOptions): CleanResult {
  const base = opts.rowNumberBase ?? 1;
  const numberSet = new Set(opts.normalizeNumbers ? opts.numberCols : []);
  const changes: CleanChange[] = [];
  const byKind: Record<CleanChangeKind, number> = { trim: 0, collapse: 0, number: 0, key: 0 };
  let cellsChanged = 0;

  const record = (rowLabel: number, col: number, before: string, after: string, kind: CleanChangeKind) => {
    cellsChanged += 1;
    byKind[kind] += 1;
    if (changes.length < CHANGE_CAP) changes.push({ rowLabel, col, before, after, kind });
  };

  // 1) แปลงระดับ cell
  const transformed: Row[] = dataRows.map((row, i) => {
    const rowLabel = base + i;
    return row.map((cell, col) => {
      const before = cellText(cell);

      // key column: trim + พิมพ์ใหญ่ + ตัดช่องว่างภายใน
      if (opts.normalizeKey && col === opts.keyCol && opts.keyCol >= 0) {
        if (typeof cell === "string") {
          const after = cell.replace(/\s+/g, "").toUpperCase();
          if (after !== before) record(rowLabel, col, before, after, "key");
          return after;
        }
        return cell;
      }

      // number column: ลบ comma/ช่องว่าง แล้วแปลงเป็นตัวเลขถ้าได้
      if (numberSet.has(col)) {
        if (typeof cell === "string") {
          const cleaned = cell.replace(/,/g, "").trim();
          if (cleaned === "") return before === "" ? cell : "";
          const n = Number(cleaned);
          if (Number.isFinite(n)) {
            const after = String(n);
            if (after !== before) record(rowLabel, col, before, after, "number");
            return n;
          }
        }
        return cell; // ตัวเลขอยู่แล้ว หรือ parse ไม่ได้ → ปล่อย
      }

      // text column: trim + ยุบช่องว่าง
      if (typeof cell === "string") {
        let after = cell;
        if (opts.collapseSpaces) after = after.replace(/\s+/g, " ");
        if (opts.trim) after = after.trim();
        if (after !== before) {
          // เดา kind: ถ้าความยาวหลังตัดขอบต่างจากหลังยุบ = การยุบมีผล
          const kind: CleanChangeKind =
            opts.collapseSpaces && /\s{2,}/.test(before.trim()) ? "collapse" : "trim";
          record(rowLabel, col, before, after, kind);
        }
        return after;
      }
      return cell;
    });
  });

  // 2) ลบแถวว่างทั้งแถว
  let rows = transformed;
  let droppedEmpty = 0;
  if (opts.dropEmptyRows) {
    const kept: Row[] = [];
    for (const r of rows) {
      if (isEmptyRow(r)) droppedEmpty += 1;
      else kept.push(r);
    }
    rows = kept;
  }

  // 3) ลบแถวซ้ำตาม key (เก็บแถวแรก)
  let droppedDup = 0;
  if (opts.dedupByKey && opts.keyCol >= 0) {
    const seen = new Set<string>();
    const kept: Row[] = [];
    for (const r of rows) {
      const kRaw = cellText(r[opts.keyCol]);
      const k = kRaw.trim();
      if (k === "") {
        kept.push(r); // key ว่าง = ไม่ถือว่าซ้ำ เก็บไว้
        continue;
      }
      if (seen.has(k)) {
        droppedDup += 1;
        continue;
      }
      seen.add(k);
      kept.push(r);
    }
    rows = kept;
  }

  return {
    rows,
    changes,
    stats: {
      inputRows: dataRows.length,
      outputRows: rows.length,
      droppedEmpty,
      droppedDup,
      cellsChanged,
      byKind,
    },
  };
}

// export ข้อมูลที่ clean แล้วเป็น CSV (header + rows)
export function cleanToCsv(header: Row, rows: Row[]): string {
  const esc = (v: Cell) => {
    const s = cellText(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header, ...rows].map((r) => r.map(esc).join(","));
  return lines.join("\n");
}

// แปลงไฟล์ CSV ↔ Excel — pure ล้วน (ไม่พึ่ง DOM/DB)
// reuse ตัวอ่าน robust ของ reconcile (parseFile) ที่ซ่อมไฟล์ MOMO เพี้ยนได้อยู่แล้ว
// → โบนัส: อัป xlsx เพี้ยน (MOMO) แล้ว export กลับเป็น .xlsx มาตรฐานได้เลย
import * as XLSX from "xlsx";
import Papa from "papaparse";
import type { Row } from "@/lib/reconcile/types";

export type OutFormat = "csv" | "xlsx";

export interface SheetStats {
  rows: number; // จำนวนแถวทั้งหมด (รวมแถวว่าง)
  cols: number; // จำนวนคอลัมน์สูงสุดที่เจอ
  nonEmptyRows: number; // แถวที่มีข้อมูลจริง (กันนับแถวว่างท้ายไฟล์)
}

export function sheetStats(rows: Row[]): SheetStats {
  let cols = 0;
  let nonEmpty = 0;
  for (const r of rows) {
    if (r.length > cols) cols = r.length;
    if (r.some((c) => c !== null && c !== undefined && String(c).trim() !== "")) nonEmpty += 1;
  }
  return { rows: rows.length, cols, nonEmptyRows: nonEmpty };
}

// rows → CSV (papaparse จัด escape/quote ให้ครบ · null = ช่องว่าง)
export function rowsToCsv(rows: Row[]): string {
  return Papa.unparse(rows as unknown[][]);
}

// rows → ไฟล์ .xlsx (Uint8Array พร้อมดาวน์โหลด) — ชีตเดียว
export function rowsToXlsx(rows: Row[], sheetName = "Sheet1"): Uint8Array {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows as unknown[][]);
  XLSX.utils.book_append_sheet(wb, ws, safeSheetName(sheetName));
  return writeXlsxBytes(wb);
}

// หลายชีต → ไฟล์ .xlsx เดียว (ไว้ export ทั้งไฟล์ / ซ่อมไฟล์เพี้ยนกลับเป็นมาตรฐาน)
export function sheetsToXlsx(sheets: { name: string; rows: Row[] }[]): Uint8Array {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  sheets.forEach((s, i) => {
    let name = safeSheetName(s.name || `Sheet${i + 1}`);
    // กันชื่อชีตซ้ำ (Excel ไม่ยอม)
    let n = 2;
    while (used.has(name.toLowerCase())) {
      name = safeSheetName(`${s.name || "Sheet"}_${n++}`);
    }
    used.add(name.toLowerCase());
    const ws = XLSX.utils.aoa_to_sheet(s.rows as unknown[][]);
    XLSX.utils.book_append_sheet(wb, ws, name);
  });
  return writeXlsxBytes(wb);
}

// SheetJS type:"array" คืน ArrayBuffer (ไม่ใช่ Uint8Array) — ห่อให้เป็น Uint8Array จริงเสมอ
function writeXlsxBytes(wb: XLSX.WorkBook): Uint8Array {
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new Uint8Array(out);
}

// Excel จำกัดชื่อชีต 31 ตัว + ห้ามอักขระ : \ / ? * [ ]
function safeSheetName(name: string): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, "_").trim() || "Sheet1";
  return cleaned.slice(0, 31);
}

// เปลี่ยนนามสกุลไฟล์ให้ตรง format ผลลัพธ์ (ตัดของเดิมออกก่อน)
export function changeExt(original: string, ext: string, suffix = ""): string {
  const dot = original.lastIndexOf(".");
  const base = dot > 0 ? original.slice(0, dot) : original;
  return `${base}${suffix}.${ext}`;
}

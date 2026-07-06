// ตัวอ่านไฟล์ที่ทนทาน (robust) — ใช้ได้ทั้งใน browser และ node
// - xlsx/xls ปกติ: ใช้ SheetJS อ่านตรง ๆ
// - ไฟล์ zip เพี้ยน (เช่น MOMO ที่ local header อันแรกพัง): ซ่อมด้วย fflate แล้วอ่านซ้ำ
// - csv/txt: papaparse
import * as XLSX from "xlsx";
import { unzipSync, zipSync } from "fflate";
import Papa from "papaparse";
import type { Cell, ParsedFile, ParsedSheet, Row } from "./types";

// แปลงค่าดิบจาก cell ให้เป็นค่าที่เทียบ/แสดงได้
function cellToValue(v: unknown): Cell {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) {
    // เลี่ยงปัญหา timezone: ใช้ค่า UTC ที่ SheetJS ใส่มา
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, "0");
    const d = String(v.getUTCDate()).padStart(2, "0");
    const hh = v.getUTCHours();
    const mm = v.getUTCMinutes();
    const ss = v.getUTCSeconds();
    if (hh || mm || ss) {
      return `${y}-${m}-${d} ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    }
    return `${y}-${m}-${d}`;
  }
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return v;
  return String(v);
}

// เดาว่า workbook ที่อ่านได้เป็น "ขยะ" ไหม (กรณี zip เพี้ยนแต่ SheetJS ไม่ throw)
function looksGarbled(wb: XLSX.WorkBook): boolean {
  const name = wb.SheetNames[0];
  if (!name) return true;
  const ws = wb.Sheets[name];
  if (!ws) return true;
  // ดูค่าเซลล์ต้น ๆ ว่ามีเศษ xml/zip โผล่มาไหม
  for (const addr of ["A1", "A2", "A3", "A4", "A5", "A6", "A7"]) {
    const cell = ws[addr];
    if (cell && typeof cell.v === "string") {
      const s = cell.v as string;
      if (s.includes("<?xml") || s.includes("xl/_rels") || s.includes("PK")) {
        return true;
      }
    }
  }
  return false;
}

function sheetsFromWorkbook(wb: XLSX.WorkBook): ParsedSheet[] {
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: null,
      raw: true,
      blankrows: true,
    });
    const rows: Row[] = raw.map((r) => (r || []).map(cellToValue));
    return { name, rows };
  });
}

function readWorkbookRobust(buf: Uint8Array): {
  wb: XLSX.WorkBook;
  via: "xlsx" | "xlsx-repair";
} {
  try {
    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    if (looksGarbled(wb)) throw new Error("garbled workbook");
    return { wb, via: "xlsx" };
  } catch {
    // ซ่อม container: unzip ผ่าน central directory (fflate ทน) แล้ว zip ใหม่ให้มาตรฐาน
    const entries = unzipSync(buf);
    const clean = zipSync(entries);
    const wb = XLSX.read(clean, { type: "array", cellDates: true });
    return { wb, via: "xlsx-repair" };
  }
}

function parseCsv(fileName: string, text: string): ParsedFile {
  const res = Papa.parse<string[]>(text, {
    skipEmptyLines: false,
  });
  const rows: Row[] = (res.data || []).map((r) => (r || []).map((c) => (c === "" ? null : c)));
  return {
    fileName,
    via: "csv",
    sheets: [{ name: "CSV", rows }],
  };
}

export async function parseFile(file: File): Promise<ParsedFile> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".tsv") || lower.endsWith(".txt")) {
    const text = await file.text();
    return parseCsv(file.name, text);
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  const { wb, via } = readWorkbookRobust(buf);
  return { fileName: file.name, via, sheets: sheetsFromWorkbook(wb) };
}

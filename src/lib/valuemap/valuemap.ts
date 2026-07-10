// แมปค่า / แทนค่าตามพจนานุกรม (value mapping) — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case จริง: แปลงรหัสเป็นชื่อทีเดียวทั้งคอลัมน์ เช่น รหัส forwarder → ชื่อเต็ม, รหัสสถานะตู้ → ข้อความ,
//   รหัสประเทศ/ท่าเรือ → ชื่อ · ต่างจาก /replace (ค้นหา-แทนที่ทีละคู่) — อันนี้ใส่ "พจนานุกรม" หลายคู่แล้วแทนทีเดียว
//   · ต่างจาก /lookup (ดึงจากไฟล์อ้างอิงตาม key) — อันนี้พิมพ์คู่ค่าเอง (mapping สั้น ๆ ที่จำง่าย)
// ปรัชญา: ไม่ทำแถวหาย/ไม่แก้ค่าอื่น · ค่าที่ไม่มีในพจนานุกรม → เก็บของเดิม (default) แล้วโชว์ให้ดูก่อน (ไม่แทนมั่ว)

import type { Cell, Row } from "@/lib/reconcile/types";

export interface MapEntry {
  from: string;
  to: string;
}

export interface ValueMapOptions {
  caseInsensitive?: boolean; // เทียบ key แบบไม่สนพิมพ์เล็ก/ใหญ่ (default false)
  trim?: boolean; // trim key ก่อนเทียบ (default true)
  mode?: "replace" | "new-column"; // แทนที่ในคอลัมน์เดิม / เพิ่มคอลัมน์ใหม่ท้ายตาราง (default replace)
  unmatched?: "keep" | "blank"; // ค่าที่ไม่มีในพจนานุกรม → เก็บของเดิม / ทำเป็นว่าง (default keep)
  newColName?: string; // ชื่อหัวคอลัมน์ใหม่ (โหมด new-column)
}

export interface ValueMapResult {
  header: string[];
  rows: Row[];
  inputRows: number;
  entries: number; // จำนวนคู่ในพจนานุกรม (หลัง dedup key)
  mappedCells: number; // ช่องที่แทนค่าสำเร็จ
  unmatchedCells: number; // ช่องมีค่าแต่ไม่มีในพจนานุกรม
  blankCells: number; // ช่องว่าง (ข้าม)
  unmatchedSamples: string[]; // ค่าที่ไม่ match (unique, cap 50)
  newColIndex: number | null; // ตำแหน่งคอลัมน์ใหม่ (โหมด new-column) · null ถ้า replace
  error?: string; // ถ้ามี = header/rows คืนของเดิมไม่แตะ
}

const SAMPLE_CAP = 50;

function isBlankCell(v: Cell): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

function headerName(header: string[], c: number): string {
  const h = header[c];
  return h && h.trim() !== "" ? h : `คอลัมน์ ${c + 1}`;
}

// แตกข้อความพจนานุกรมทีละบรรทัด → คู่ from→to
// รองรับตัวคั่น: tab (ก่อน), "=" , "," (เลือกตัวแรกที่เจอ) · split เฉพาะตัวคั่น "ตัวแรก" (value มีตัวคั่นได้)
export function parseMapping(text: string): MapEntry[] {
  const out: MapEntry[] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (line.trim() === "") continue;
    const tab = line.indexOf("\t");
    const eq = line.indexOf("=");
    const comma = line.indexOf(",");
    // เลือกตัวคั่นที่อยู่ซ้ายสุด (tab > = > , เมื่อตำแหน่งเท่ากันแทบเป็นไปไม่ได้)
    const cands = [tab, eq, comma].filter((x) => x >= 0);
    if (cands.length === 0) continue; // ไม่มีตัวคั่น = ข้าม (ต้องมีทั้ง from และ to)
    const idx = Math.min(...cands);
    const from = line.slice(0, idx);
    const to = line.slice(idx + 1);
    if (from.trim() === "") continue; // key ว่าง = ข้าม
    out.push({ from, to });
  }
  return out;
}

export function applyValueMap(
  header: string[],
  dataRows: Row[],
  col: number,
  mapping: MapEntry[],
  opts: ValueMapOptions = {},
): ValueMapResult {
  const width = header.length;
  const mode = opts.mode === "new-column" ? "new-column" : "replace";
  const unmatched = opts.unmatched === "blank" ? "blank" : "keep";
  const ci = opts.caseInsensitive === true;
  const trim = opts.trim !== false;
  const newColIndex = mode === "new-column" ? width : null;

  const cloneRows: Row[] = dataRows.map((r) => r.slice());
  const base: ValueMapResult = {
    header: header.slice(),
    rows: cloneRows,
    inputRows: dataRows.length,
    entries: 0,
    mappedCells: 0,
    unmatchedCells: 0,
    blankCells: 0,
    unmatchedSamples: [],
    newColIndex,
  };

  if (col < 0 || col >= width) {
    return { ...base, error: "เลือกคอลัมน์ที่จะแมปค่า" };
  }

  const normKey = (s: string): string => {
    let k = s;
    if (trim) k = k.trim();
    if (ci) k = k.toLowerCase();
    return k;
  };

  // สร้าง lookup (key ที่ normalize แล้ว → to) · key ซ้ำ = ตัวหลังทับ
  const lut = new Map<string, string>();
  for (const e of mapping) {
    lut.set(normKey(e.from), e.to);
  }
  const entries = lut.size;
  if (entries === 0) {
    return { ...base, error: "ใส่ตารางแมปค่าอย่างน้อย 1 บรรทัด (เช่น TU-A=ตู้เอ)" };
  }

  const newName =
    opts.newColName && opts.newColName.trim() !== ""
      ? opts.newColName.trim()
      : `${headerName(header, col)} (แมป)`;

  let mappedCells = 0;
  let unmatchedCells = 0;
  let blankCells = 0;
  const seenUnmatched = new Set<string>();
  const unmatchedSamples: string[] = [];

  const out: Row[] = dataRows.map((row) => {
    // ทำแถวให้เป็นสี่เหลี่ยม (aligned กับ header)
    const nr: Row = [];
    for (let c = 0; c < width; c++) nr.push(row[c] ?? null);

    const raw = nr[col];
    let resultVal: Cell;
    if (isBlankCell(raw)) {
      blankCells++;
      resultVal = mode === "new-column" ? "" : raw; // ว่างคงว่าง
    } else {
      const key = normKey(String(raw));
      if (lut.has(key)) {
        resultVal = lut.get(key) as string;
        mappedCells++;
      } else {
        unmatchedCells++;
        const shown = String(raw);
        if (!seenUnmatched.has(shown)) {
          seenUnmatched.add(shown);
          if (unmatchedSamples.length < SAMPLE_CAP) unmatchedSamples.push(shown);
        }
        resultVal = unmatched === "blank" ? "" : raw; // keep = ค่าเดิม
      }
    }

    if (mode === "new-column") {
      return [...nr, resultVal];
    }
    nr[col] = resultVal;
    return nr;
  });

  return {
    header: mode === "new-column" ? [...header, newName] : header.slice(),
    rows: out,
    inputRows: dataRows.length,
    entries,
    mappedCells,
    unmatchedCells,
    blankCells,
    unmatchedSamples,
    newColIndex,
  };
}

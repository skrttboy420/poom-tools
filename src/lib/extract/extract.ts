// ดึงข้อความด้วย regex จากคอลัมน์เดียว → เติมเป็นคอลัมน์ใหม่ — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case จริง: ช่อง note/description ปนกัน → ดึงเฉพาะเลขตู้ (container ^[A-Z]{4}[0-9]{7}),
//   ดึงเลข tracking, ดึงตัวเลขน้ำหนักออกมาจากข้อความ เพื่อเอาไป /group /reconcile /sort ต่อ
// ต่างจาก /split-col (แยกตามตัวคั่น literal ตามตำแหน่ง) · /regex (เล่นกับข้อความเดี่ยว ไม่รู้จักตาราง) ·
//   /replace (ค้นหา-แทนที่ในที่เดิม) — อันนี้ = "ดึงส่วนที่ match ออกมาเป็นคอลัมน์ใหม่"
// ปรัชญา: ไม่ทำแถวหาย (จำนวนแถวเท่าเดิมเสมอ) + เก็บคอลัมน์เดิมได้ + ไม่แก้ค่าเดิม ·
//   ช่องที่ match ไม่ได้ → เว้นว่าง (ไม่เดามั่ว) แล้วนับให้เห็น · capture group → 1 คอลัมน์/กลุ่ม

import type { Cell, Row } from "@/lib/reconcile/types";

export type ExtractMode = "first" | "all";

export interface ExtractOptions {
  pattern: string; // regex source (เช่น [A-Z]{4}[0-9]{7})
  caseInsensitive?: boolean; // เติม flag i
  mode?: ExtractMode; // first = match แรก · all = ทุก match ต่อด้วย separator (default first)
  separator?: string; // ตัวเชื่อมตอน mode=all (default ", ")
  keepOriginal?: boolean; // เก็บคอลัมน์ต้นฉบับไว้ด้วย (default true)
  names?: string[]; // ชื่อหัวคอลัมน์ใหม่ (ไม่ครบ → เติมชื่อ default)
}

export interface ExtractResult {
  header: string[];
  rows: Row[];
  newCols: number; // จำนวนคอลัมน์ที่เพิ่ม (= groupCount หรือ 1 ถ้าไม่มีกลุ่ม)
  groupCount: number; // จำนวน capture group ใน pattern (0 = ดึงทั้ง match)
  matchedRows: number; // แถว (ที่มีค่า) ที่ดึงได้อย่างน้อย 1 match
  unmatchedRows: number; // แถว (ที่มีค่า) ที่ไม่ match เลย
  blankRows: number; // แถวที่ช่องต้นฉบับว่าง (ข้าม ไม่นับ matched/unmatched)
  inputRows: number;
  error?: string; // ถ้ามี = header/rows คืนของเดิมไม่แตะ
}

function isBlankCell(v: Cell): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

function headerName(header: string[], idx: number): string {
  const h = header[idx];
  return h !== undefined && String(h).trim() !== "" ? String(h) : `คอลัมน์ ${idx + 1}`;
}

// นับจำนวน capture group ด้วยกลวิธี empty-alternative (source + "|") — match สตริงว่างผ่านทางเลือกว่าง
// คืน array ที่ยาว = จำนวนกลุ่ม+1 → length-1 = จำนวนกลุ่ม · ครอบ try กัน source แปลก ๆ
function countGroups(source: string, flags: string): number {
  try {
    const probe = new RegExp(source + "|", flags).exec("");
    return probe ? probe.length - 1 : 0;
  } catch {
    return 0;
  }
}

export function extractColumn(
  header: string[],
  dataRows: Row[],
  col: number,
  opts: ExtractOptions,
): ExtractResult {
  const width = header.length;
  const cloneRows: Row[] = dataRows.map((r) => r.slice());

  const fail = (error: string): ExtractResult => ({
    header: header.slice(),
    rows: cloneRows,
    newCols: 0,
    groupCount: 0,
    matchedRows: 0,
    unmatchedRows: 0,
    blankRows: 0,
    inputRows: dataRows.length,
    error,
  });

  if (col < 0 || col >= width) return fail("เลือกคอลัมน์ที่จะดึงข้อความ");
  const source = opts.pattern;
  if (!source || source.trim() === "") return fail("ใส่ pattern (regex) ที่จะดึง");

  const ci = opts.caseInsensitive === true;
  const mode: ExtractMode = opts.mode === "all" ? "all" : "first";
  const sep = opts.separator ?? ", ";

  // compile regex (validate) — first ใช้แบบไม่ global, all ใช้ global สำหรับ matchAll
  let reFirst: RegExp;
  let reAll: RegExp;
  try {
    reFirst = new RegExp(source, ci ? "i" : "");
    reAll = new RegExp(source, ci ? "gi" : "g");
  } catch (e) {
    return fail("Regex ไม่ถูกต้อง: " + (e instanceof Error ? e.message : String(e)));
  }

  const groupCount = countGroups(source, ci ? "i" : "");
  const outCols = groupCount === 0 ? 1 : groupCount;

  // ดึงค่าต่อแถว → คืน [pieces(length=outCols), matchFound, blank]
  let matchedRows = 0;
  let unmatchedRows = 0;
  let blankRows = 0;

  const extracted: string[][] = dataRows.map((row) => {
    const cell = col < row.length ? (row[col] ?? null) : null;
    if (isBlankCell(cell)) {
      blankRows++;
      return Array(outCols).fill("");
    }
    const s = String(cell);

    if (mode === "first") {
      const m = reFirst.exec(s);
      if (!m) {
        unmatchedRows++;
        return Array(outCols).fill("");
      }
      matchedRows++;
      if (groupCount === 0) return [m[0]];
      const pieces: string[] = [];
      for (let g = 1; g <= groupCount; g++) pieces.push(m[g] ?? "");
      return pieces;
    }

    // mode = all → รวมทุก match
    const all = [...s.matchAll(reAll)];
    if (all.length === 0) {
      unmatchedRows++;
      return Array(outCols).fill("");
    }
    matchedRows++;
    if (groupCount === 0) {
      return [all.map((m) => m[0]).join(sep)];
    }
    const pieces: string[] = [];
    for (let g = 1; g <= groupCount; g++) {
      const vals = all.map((m) => m[g]).filter((v): v is string => v !== undefined && v !== "");
      pieces.push(vals.join(sep));
    }
    return pieces;
  });

  // ชื่อคอลัมน์ใหม่
  const origName = headerName(header, col);
  const newColNames: string[] = [];
  for (let i = 0; i < outCols; i++) {
    const nm = opts.names?.[i];
    if (nm && nm.trim() !== "") {
      newColNames.push(nm);
    } else if (outCols === 1) {
      newColNames.push(`${origName} (ดึง)`);
    } else {
      newColNames.push(`${origName} #${i + 1}`);
    }
  }

  const keep = opts.keepOriginal !== false;
  const before = header.slice(0, col);
  const after = header.slice(col + 1);
  const origHeader = header[col] ?? origName;

  const outHeader = keep
    ? [...before, origHeader, ...newColNames, ...after]
    : [...before, ...newColNames, ...after];

  const outRows: Row[] = dataRows.map((row, ri) => {
    const b = row.slice(0, col);
    const a = row.slice(col + 1);
    const pieces = extracted[ri];
    const origCell = col < row.length ? (row[col] ?? null) : null;
    return keep ? [...b, origCell, ...pieces, ...a] : [...b, ...pieces, ...a];
  });

  return {
    header: outHeader,
    rows: outRows,
    newCols: outCols,
    groupCount,
    matchedRows,
    unmatchedRows,
    blankRows,
    inputRows: dataRows.length,
  };
}

// export CSV ของตารางผลลัพธ์ (header + rows)
export function extractToCsv(result: ExtractResult): string {
  const esc = (v: Cell): string => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines: string[] = [];
  lines.push(result.header.map((h) => esc(h)).join(","));
  for (const row of result.rows) {
    lines.push(row.map((c) => esc(c)).join(","));
  }
  return lines.join("\n");
}

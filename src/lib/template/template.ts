// สร้างข้อความจากตาราง (template / mail-merge) — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case จริง: แปลงแต่ละแถวของ packing list เป็นบรรทัดข้อความพร้อมวาง —
//   เช่น สร้างบรรทัด paste เข้า Pacred, ข้อความแจ้งลูกค้ารายกล่อง, SQL VALUES, รายการสรุปต่อ tracking
// ปรัชญา: **1 แถว → 1 บล็อกข้อความ (ไม่ทำแถวหาย)** · placeholder ที่ไม่รู้จัก = คงไว้ให้เห็น + เตือน (ไม่แทนค่ามั่ว/ไม่ทิ้งเงียบ)

import type { Cell, Row } from "@/lib/reconcile/types";

export interface TemplateOptions {
  joiner?: string; // ตัวเชื่อมระหว่างแต่ละแถว (default "\n")
  skipEmptyRows?: boolean; // ข้ามแถวว่างทั้งแถว (default true)
  trimValues?: boolean; // trim ค่าที่ดึงมาก่อนใส่ (default false)
}

export interface TemplateResult {
  text: string;
  rowsUsed: number; // จำนวนแถวที่ render จริง
  skipped: number; // แถวที่ข้าม (ว่างทั้งแถว)
  inputRows: number;
  unknownTokens: string[]; // placeholder ที่หาไม่เจอ (unique, ไว้เตือน)
  usedTokens: string[]; // placeholder ที่ใช้จริงและ resolve ได้ (unique)
  error?: string; // ถ้ามี = text ว่าง
}

function isBlankCell(v: Cell): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

function cellToStr(v: Cell): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

// token ภายใน {...} → resolver คืน index คอลัมน์ (>=0) หรือ -1 (ไม่รู้จัก)
// รองรับ: {#N} = คอลัมน์ลำดับ N (1-based) · {ชื่อหัว} = จับตามชื่อ (trim + ไม่สนพิมพ์เล็กใหญ่)
function resolveToken(token: string, headerNorm: string[]): number {
  const t = token.trim();
  if (t === "") return -1;
  const hashMatch = /^#(\d+)$/.exec(t);
  if (hashMatch) {
    const n = Number(hashMatch[1]);
    if (n >= 1 && n <= headerNorm.length) return n - 1;
    return -1;
  }
  const norm = t.toLowerCase();
  const idx = headerNorm.indexOf(norm);
  return idx; // -1 ถ้าไม่เจอ
}

// แตก template เป็นชิ้น: literal | token | escape
// รองรับ escape: {{ → "{" , }} → "}"
type Piece = { kind: "lit"; text: string } | { kind: "tok"; name: string };

function parseTemplate(tpl: string): Piece[] {
  const pieces: Piece[] = [];
  const re = /\{\{|\}\}|\{([^{}]*)\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tpl)) !== null) {
    if (m.index > last) pieces.push({ kind: "lit", text: tpl.slice(last, m.index) });
    if (m[0] === "{{") pieces.push({ kind: "lit", text: "{" });
    else if (m[0] === "}}") pieces.push({ kind: "lit", text: "}" });
    else pieces.push({ kind: "tok", name: m[1] ?? "" });
    last = re.lastIndex;
  }
  if (last < tpl.length) pieces.push({ kind: "lit", text: tpl.slice(last) });
  return pieces;
}

export function renderTemplate(
  header: string[],
  dataRows: Row[],
  template: string,
  opts: TemplateOptions = {},
): TemplateResult {
  const joiner = opts.joiner ?? "\n";
  const skipEmptyRows = opts.skipEmptyRows !== false;
  const trimValues = opts.trimValues === true;

  const base: TemplateResult = {
    text: "",
    rowsUsed: 0,
    skipped: 0,
    inputRows: dataRows.length,
    unknownTokens: [],
    usedTokens: [],
  };

  if (template === "") return { ...base, error: "ใส่รูปแบบข้อความ (template) ก่อน" };

  const headerNorm = header.map((h) => (h ?? "").trim().toLowerCase());
  const pieces = parseTemplate(template);

  // pre-resolve token → column index (ทำครั้งเดียว) + เก็บ unknown/used
  const unknown = new Set<string>();
  const used = new Set<string>();
  const resolved: (Piece & { col?: number })[] = pieces.map((p) => {
    if (p.kind !== "tok") return p;
    const col = resolveToken(p.name, headerNorm);
    if (col < 0) unknown.add(p.name.trim());
    else used.add(p.name.trim());
    return { ...p, col };
  });

  const renderRow = (row: Row): string => {
    let out = "";
    for (const p of resolved) {
      if (p.kind === "lit") out += p.text;
      else if (p.col === undefined || p.col < 0) out += `{${p.name}}`; // คงไว้ให้เห็น
      else {
        let v = cellToStr(row[p.col] ?? null);
        if (trimValues) v = v.trim();
        out += v;
      }
    }
    return out;
  };

  const blocks: string[] = [];
  let skipped = 0;
  for (const row of dataRows) {
    if (skipEmptyRows && row.every((c) => isBlankCell(c))) {
      skipped++;
      continue;
    }
    blocks.push(renderRow(row));
  }

  return {
    text: blocks.join(joiner),
    rowsUsed: blocks.length,
    skipped,
    inputRows: dataRows.length,
    unknownTokens: [...unknown],
    usedTokens: [...used],
  };
}

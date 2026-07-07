// เครื่องมือจัดรูปแบบ JSON — pure ล้วน (ไม่พึ่ง DOM/DB)
// ใช้ตรวจ/จัด payload จาก MOMO API หรือ Supabase ให้อ่านง่าย + จับ JSON เสียตรงตำแหน่ง

export type IndentMode = "2" | "4" | "tab";

export interface JsonStats {
  inputChars: number;
  outputChars: number;
  rootType: string; // object / array / string / number / boolean / null
  topLevelCount: number | null; // จำนวน key (object) หรือ item (array) ชั้นบนสุด
  totalKeys: number; // จำนวน key ทั้งหมดทุกชั้น
  maxDepth: number; // ความลึกสูงสุดของโครงสร้าง
}

export type JsonResult =
  | { ok: true; output: string; stats: JsonStats }
  | { ok: false; error: string; line?: number; col?: number; pos?: number };

const INDENT_VALUE: Record<IndentMode, string | number> = {
  "2": 2,
  "4": 4,
  tab: "\t",
};

// นับชนิดของค่า root ให้เป็นคำอ่านง่าย
function typeOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v; // object / string / number / boolean
}

// เดินโครงสร้างเก็บสถิติ: จำนวน key ทั้งหมด + ความลึกสูงสุด
function walk(v: unknown, depth: number, acc: { keys: number; maxDepth: number }) {
  if (depth > acc.maxDepth) acc.maxDepth = depth;
  if (Array.isArray(v)) {
    for (const item of v) walk(item, depth + 1, acc);
  } else if (v && typeof v === "object") {
    for (const k of Object.keys(v as Record<string, unknown>)) {
      acc.keys += 1;
      walk((v as Record<string, unknown>)[k], depth + 1, acc);
    }
  }
}

// เรียง key ของทุก object ลึกลงไป (ค่าใน array คงลำดับเดิม)
export function sortKeysDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  if (v && typeof v === "object") {
    const src = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(src).sort()) out[k] = sortKeysDeep(src[k]);
    return out;
  }
  return v;
}

// แปลงตำแหน่ง (index ตัวอักษร) → บรรทัด/คอลัมน์ (เริ่มที่ 1)
function posToLineCol(text: string, pos: number): { line: number; col: number } {
  let line = 1;
  let col = 1;
  const limit = Math.min(pos, text.length);
  for (let i = 0; i < limit; i++) {
    if (text[i] === "\n") {
      line += 1;
      col = 1;
    } else {
      col += 1;
    }
  }
  return { line, col };
}

// ดึงตำแหน่งจากข้อความ error ของ JSON.parse (V8 มีได้หลายรูปแบบ)
function extractPos(msg: string, text: string): { pos?: number; line?: number; col?: number } {
  // รูปแบบใหม่: "... (line 3 column 5)"
  const lc = msg.match(/line (\d+) column (\d+)/i);
  if (lc) return { line: Number(lc[1]), col: Number(lc[2]) };
  // รูปแบบเดิม: "... at position 42"
  const p = msg.match(/position (\d+)/i);
  if (p) {
    const pos = Number(p[1]);
    return { pos, ...posToLineCol(text, pos) };
  }
  return {};
}

function buildStats(input: string, output: string, parsed: unknown): JsonStats {
  const acc = { keys: 0, maxDepth: 0 };
  walk(parsed, 1, acc);
  let topLevelCount: number | null = null;
  if (Array.isArray(parsed)) topLevelCount = parsed.length;
  else if (parsed && typeof parsed === "object") topLevelCount = Object.keys(parsed).length;
  return {
    inputChars: input.length,
    outputChars: output.length,
    rootType: typeOf(parsed),
    topLevelCount,
    totalKeys: acc.keys,
    maxDepth: acc.maxDepth,
  };
}

// จัดรูป (beautify) — เว้นวรรคตามโหมด indent + เลือกเรียง key ได้
export function formatJson(input: string, indent: IndentMode, sortKeys = false): JsonResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: "ยังไม่มีข้อมูล — วาง JSON ก่อน" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg, ...extractPos(msg, trimmed) };
  }
  const value = sortKeys ? sortKeysDeep(parsed) : parsed;
  const output = JSON.stringify(value, null, INDENT_VALUE[indent]);
  return { ok: true, output, stats: buildStats(input, output, parsed) };
}

// ย่อ (minify) — บรรทัดเดียว ไม่มีเว้นวรรค
export function minifyJson(input: string, sortKeys = false): JsonResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: "ยังไม่มีข้อมูล — วาง JSON ก่อน" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg, ...extractPos(msg, trimmed) };
  }
  const value = sortKeys ? sortKeysDeep(parsed) : parsed;
  const output = JSON.stringify(value);
  return { ok: true, output, stats: buildStats(input, output, parsed) };
}

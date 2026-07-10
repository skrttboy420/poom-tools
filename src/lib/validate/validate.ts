// ตรวจความถูกต้องของข้อมูลตาม "กฎ" ที่ตั้งเอง — จับแถว/ช่องที่ผิดรูปก่อนเอาเข้า Pacred — pure ล้วน
// use-case จริง: packing list ก่อน import — tracking ต้องมี, kg ต้องเป็นเลข 0-2000, container ต้องตรง pattern, forwarder ต้องอยู่ในรายชื่อ
//   → /gap จับแค่ 0/ว่าง · /outlier จับค่าเพี้ยนทางสถิติ · อันนี้จับ "ผิดกฎที่เรารู้ว่าควรเป็น" (rule-based) แล้วบอกเหตุผลรายช่อง
//   ตามปรัชญาไม่เดามั่ว/ไม่แก้ให้: โชว์ว่าแถวไหนช่องไหนผิดกฎอะไร ให้ดูก่อน ไม่แก้ค่าให้

import type { Cell, Row } from "@/lib/reconcile/types";

export type RuleType =
  | "required" // ต้องมีค่า (ไม่ว่าง)
  | "number" // ต้องเป็นตัวเลข
  | "integer" // ต้องเป็นจำนวนเต็ม
  | "min" // ตัวเลข ≥ param
  | "max" // ตัวเลข ≤ param
  | "min-length" // ความยาว ≥ param (นับ code point)
  | "max-length" // ความยาว ≤ param
  | "pattern" // match regex (param)
  | "allowed" // ต้องอยู่ในรายการ (param คั่นด้วย ,)
  | "unique"; // ค่าต้องไม่ซ้ำในคอลัมน์

export interface Rule {
  col: number;
  type: RuleType;
  param?: string; // ค่าประกอบ: min/max=ตัวเลข · length=ตัวเลข · pattern=regex · allowed=list คั่นด้วย ,
  caseInsensitive?: boolean; // สำหรับ allowed/pattern/unique
}

export interface Violation {
  row: number; // 0-based ใน dataRows
  col: number;
  value: string; // ค่าที่แสดง (ตามต้นฉบับ)
  ruleType: RuleType;
  message: string; // อธิบายภาษาไทย
}

export interface RuleSummary {
  type: RuleType;
  col: number;
  count: number;
}

export interface ValidateResult {
  violations: Violation[];
  totalRows: number; // แถวข้อมูลจริง (ตัดแถวว่างทั้งแถว)
  validRows: number; // แถวที่ไม่มี violation เลย
  invalidRows: number; // แถวที่มี ≥1 violation
  violationCount: number;
  ruleCount: number;
  byRule: RuleSummary[]; // สรุปต่อกฎ (เรียงตามที่ตั้ง)
  error?: string;
}

const VIOLATIONS_CAP = 5000; // กัน payload บวม

// label ไทยของชนิดกฎ (ใช้ทั้ง engine + UI)
export const RULE_LABEL: Record<RuleType, string> = {
  required: "ต้องมีค่า",
  number: "ต้องเป็นตัวเลข",
  integer: "ต้องเป็นจำนวนเต็ม",
  min: "ค่าต่ำสุด",
  max: "ค่าสูงสุด",
  "min-length": "ความยาวขั้นต่ำ",
  "max-length": "ความยาวสูงสุด",
  pattern: "ตรงรูปแบบ (regex)",
  allowed: "อยู่ในรายการที่กำหนด",
  unique: "ห้ามซ้ำ",
};

const NEEDS_PARAM: Set<RuleType> = new Set([
  "min",
  "max",
  "min-length",
  "max-length",
  "pattern",
  "allowed",
]);

export function ruleNeedsParam(t: RuleType): boolean {
  return NEEDS_PARAM.has(t);
}

// parse ตัวเลข: ตัด comma+trim · boolean/Infinity/ว่าง → null (สอดคล้อง toNumber ของ diff/stats)
function parseNumeric(cell: Cell): number | null {
  if (cell === null || cell === undefined) return null;
  if (typeof cell === "boolean") return null;
  if (typeof cell === "number") return Number.isFinite(cell) ? cell : null;
  const s = String(cell).replace(/,/g, "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function cellStr(cell: Cell): string {
  if (cell === null || cell === undefined) return "";
  return typeof cell === "string" ? cell : String(cell);
}

function isBlankStr(s: string): boolean {
  return s.trim() === "";
}

// แถวที่ "มีอย่างน้อย 1 ช่องที่ไม่ว่าง" = แถวข้อมูลจริง (ตัดแถวว่างล้วน เช่น trailing row)
function isDataRow(row: Row): boolean {
  for (const c of row) {
    if (!isBlankStr(cellStr(c))) return true;
  }
  return false;
}

// สร้าง RegExp จาก pattern (ไม่ผูก anchor เอง — ให้ผู้ใช้คุมเอง) · เสีย → null
function buildRegex(pattern: string, ci: boolean): RegExp | null {
  try {
    return new RegExp(pattern, ci ? "i" : "");
  } catch {
    return null;
  }
}

export function validateTable(header: Row, dataRows: Row[], rules: Rule[]): ValidateResult {
  void header;
  const base: Omit<ValidateResult, "error"> = {
    violations: [],
    totalRows: 0,
    validRows: 0,
    invalidRows: 0,
    violationCount: 0,
    ruleCount: rules.length,
    byRule: [],
  };

  // validate width
  let width = header.length;
  for (const r of dataRows) if (r.length > width) width = r.length;
  if (width === 0) return { ...base, error: "ไม่มีข้อมูลให้ตรวจ (ตารางว่าง)" };
  if (rules.length === 0) return { ...base, error: "ยังไม่มีกฎให้ตรวจ — เพิ่มกฎอย่างน้อย 1 ข้อ" };

  // ตรวจกฎเบื้องต้น (คอลัมน์ในช่วง, param ที่จำเป็นต้องมี, regex ใช้ได้)
  const compiled: { rule: Rule; num?: number; regex?: RegExp; allowed?: Set<string> }[] = [];
  for (let ri = 0; ri < rules.length; ri++) {
    const rule = rules[ri];
    if (rule.col < 0 || rule.col >= width) {
      return { ...base, error: `กฎข้อ ${ri + 1}: เลือกคอลัมน์ที่จะตรวจ` };
    }
    const c: { rule: Rule; num?: number; regex?: RegExp; allowed?: Set<string> } = { rule };
    if (rule.type === "min" || rule.type === "max") {
      const n = parseNumeric(rule.param ?? "");
      if (n === null) return { ...base, error: `กฎข้อ ${ri + 1} (${RULE_LABEL[rule.type]}): ใส่ค่าตัวเลข` };
      c.num = n;
    } else if (rule.type === "min-length" || rule.type === "max-length") {
      const n = parseNumeric(rule.param ?? "");
      if (n === null || n < 0) return { ...base, error: `กฎข้อ ${ri + 1} (${RULE_LABEL[rule.type]}): ใส่จำนวนความยาว (≥ 0)` };
      c.num = Math.floor(n);
    } else if (rule.type === "pattern") {
      const p = rule.param ?? "";
      if (p === "") return { ...base, error: `กฎข้อ ${ri + 1} (${RULE_LABEL.pattern}): ใส่ regex` };
      const re = buildRegex(p, rule.caseInsensitive === true);
      if (!re) return { ...base, error: `กฎข้อ ${ri + 1} (${RULE_LABEL.pattern}): regex ไม่ถูกต้อง` };
      c.regex = re;
    } else if (rule.type === "allowed") {
      const list = (rule.param ?? "")
        .split(",")
        .map((s) => (rule.caseInsensitive ? s.trim().toLowerCase() : s.trim()))
        .filter((s) => s !== "");
      if (list.length === 0) return { ...base, error: `กฎข้อ ${ri + 1} (${RULE_LABEL.allowed}): ใส่รายการค่าที่ยอมรับ (คั่นด้วย ,)` };
      c.allowed = new Set(list);
    }
    compiled.push(c);
  }

  // แถวข้อมูลจริง (เก็บ index เดิมไว้อ้างอิง)
  const dataIdx: number[] = [];
  for (let i = 0; i < dataRows.length; i++) {
    if (isDataRow(dataRows[i])) dataIdx.push(i);
  }
  const totalRows = dataIdx.length;

  // สำหรับกฎ unique: นับความถี่ค่า (normalize ตาม ci) ต่อคอลัมน์ — เฉพาะช่องไม่ว่าง
  const uniqueCounts = new Map<number, Map<string, number>>(); // ruleIndex → (normValue → count)
  for (let ci = 0; ci < compiled.length; ci++) {
    if (compiled[ci].rule.type !== "unique") continue;
    const rule = compiled[ci].rule;
    const counts = new Map<string, number>();
    for (const i of dataIdx) {
      const raw = cellStr(dataRows[i][rule.col] ?? null);
      if (isBlankStr(raw)) continue; // ช่องว่างไม่นับซ้ำ (ปล่อยให้ required คุมเรื่องว่าง)
      const key = rule.caseInsensitive ? raw.trim().toLowerCase() : raw.trim();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    uniqueCounts.set(ci, counts);
  }

  const violations: Violation[] = [];
  const ruleCounts = new Array<number>(compiled.length).fill(0);
  const invalidRowSet = new Set<number>();
  let capped = false;

  for (const i of dataIdx) {
    const row = dataRows[i];
    for (let ci = 0; ci < compiled.length; ci++) {
      const { rule, num, regex, allowed } = compiled[ci];
      const cell: Cell = rule.col < row.length ? (row[rule.col] ?? null) : null;
      const raw = cellStr(cell);
      const blank = isBlankStr(raw);
      let bad = false;
      let message = "";

      switch (rule.type) {
        case "required":
          if (blank) {
            bad = true;
            message = "ช่องนี้ต้องมีค่า (ว่างอยู่)";
          }
          break;
        case "number":
          if (!blank && parseNumeric(cell) === null) {
            bad = true;
            message = "ต้องเป็นตัวเลข";
          }
          break;
        case "integer":
          if (!blank) {
            const n = parseNumeric(cell);
            if (n === null || !Number.isInteger(n)) {
              bad = true;
              message = "ต้องเป็นจำนวนเต็ม";
            }
          }
          break;
        case "min":
          if (!blank) {
            const n = parseNumeric(cell);
            if (n === null) {
              bad = true;
              message = "ต้องเป็นตัวเลขเพื่อเทียบค่าต่ำสุด";
            } else if (n < (num as number)) {
              bad = true;
              message = `ต้อง ≥ ${num}`;
            }
          }
          break;
        case "max":
          if (!blank) {
            const n = parseNumeric(cell);
            if (n === null) {
              bad = true;
              message = "ต้องเป็นตัวเลขเพื่อเทียบค่าสูงสุด";
            } else if (n > (num as number)) {
              bad = true;
              message = `ต้อง ≤ ${num}`;
            }
          }
          break;
        case "min-length":
          if (!blank && Array.from(raw).length < (num as number)) {
            bad = true;
            message = `ความยาวต้อง ≥ ${num} ตัวอักษร`;
          }
          break;
        case "max-length":
          if (!blank && Array.from(raw).length > (num as number)) {
            bad = true;
            message = `ความยาวต้อง ≤ ${num} ตัวอักษร`;
          }
          break;
        case "pattern":
          if (!blank && regex && !regex.test(raw)) {
            bad = true;
            message = "ไม่ตรงรูปแบบที่กำหนด";
          }
          break;
        case "allowed":
          if (!blank && allowed) {
            const key = rule.caseInsensitive ? raw.trim().toLowerCase() : raw.trim();
            if (!allowed.has(key)) {
              bad = true;
              message = "ค่านี้ไม่อยู่ในรายการที่ยอมรับ";
            }
          }
          break;
        case "unique":
          if (!blank) {
            const counts = uniqueCounts.get(ci);
            const key = rule.caseInsensitive ? raw.trim().toLowerCase() : raw.trim();
            if (counts && (counts.get(key) ?? 0) > 1) {
              bad = true;
              message = "ค่าซ้ำกับแถวอื่น";
            }
          }
          break;
      }

      if (bad) {
        violations.push({ row: i, col: rule.col, value: raw, ruleType: rule.type, message });
        ruleCounts[ci] += 1;
        invalidRowSet.add(i);
        if (violations.length >= VIOLATIONS_CAP) {
          capped = true;
          break;
        }
      }
    }
    if (capped) break;
  }

  const byRule: RuleSummary[] = compiled.map((c, ci) => ({
    type: c.rule.type,
    col: c.rule.col,
    count: ruleCounts[ci],
  }));

  const invalidRows = invalidRowSet.size;

  return {
    ...base,
    violations,
    totalRows,
    validRows: totalRows - invalidRows,
    invalidRows,
    violationCount: violations.length,
    byRule,
    error: undefined,
  };
}

// export รายการ violation เป็น CSV (แถว, คอลัมน์, ค่า, กฎ, เหตุผล)
export function validateToCsv(header: Row, result: ValidateResult): string {
  const esc = (v: string | number): string => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const colName = (col: number): string => {
    const h = header[col];
    const s = h === null || h === undefined ? "" : String(h).trim();
    return s === "" ? `คอลัมน์ ${col + 1}` : s;
  };
  const lines: string[] = ["แถว,คอลัมน์,ค่า,กฎ,เหตุผล"];
  for (const v of result.violations) {
    lines.push(
      [v.row + 1, esc(colName(v.col)), esc(v.value), esc(RULE_LABEL[v.ruleType]), esc(v.message)].join(","),
    );
  }
  return lines.join("\n");
}

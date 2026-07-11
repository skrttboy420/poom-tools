// รวมหน่วยในคอลัมน์ (normalize mixed units) — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case จริง: ซัพ/ไฟล์ต่างเจ้าใส่หน่วยปนกันในช่องเดียว เช่น "10 kg" / "5,000g" / "1.5 ton" / "500g"
//   → อยากได้ทั้งคอลัมน์เป็นหน่วยเดียว (เช่น kg ล้วน) ก่อนเอาไปรวมยอด/เทียบ/เข้า Pacred
// ต่างจาก /convert (พิมพ์ค่าเดียวเห็นทุกหน่วย) — อันนี้แปลง "ทั้งคอลัมน์" ที่หน่วยฝังอยู่ในข้อความ
// ปรัชญา: ไม่เดามั่ว — ช่องที่ไม่มีหน่วย = ข้าม (ambiguous) เว้นผู้ใช้สั่ง "ถือว่าเป็นหน่วย X" ·
//   หน่วยที่อ่านไม่ออก/คนละหมวด = ข้าม · ช่องไม่มีตัวเลข = ข้าม · ทุกแถวออกครบ ·
//   default = เติมคอลัมน์ใหม่ (ไม่ทับของเดิม) · โหมดแทนที่ = opt-in

import type { Cell, Row } from "@/lib/reconcile/types";

export type UnitCategoryId = "weight" | "length" | "volume";

interface UnitEntry {
  id: string;
  label: string; // ชื่อไทย + ตัวย่อ
  factor: number; // ค่าของ 1 หน่วยนี้ เมื่อคิดเป็นหน่วยฐาน
  aliases: string[]; // token ที่ยอมรับ (จะ normalize เป็นตัวเล็ก + ตัดจุดก่อนเทียบ)
}

interface CategoryDef {
  id: UnitCategoryId;
  name: string;
  icon: string;
  baseId: string;
  units: UnitEntry[];
}

// หมวดหน่วย + alias ที่เจอบ่อยในงาน cargo (ทั้งอังกฤษและไทย)
export const UNIT_COL_CATEGORIES: CategoryDef[] = [
  {
    id: "weight",
    name: "น้ำหนัก",
    icon: "⚖️",
    baseId: "kg",
    units: [
      { id: "kg", label: "กิโลกรัม (kg)", factor: 1, aliases: ["kg", "kgs", "kgm", "กก", "กิโล", "กิโลกรัม"] },
      { id: "g", label: "กรัม (g)", factor: 0.001, aliases: ["g", "gr", "gm", "gram", "grams", "grm", "กรัม"] },
      { id: "ton", label: "ตัน (metric ton)", factor: 1000, aliases: ["ton", "tons", "tonne", "tonnes", "t", "mt", "ตัน"] },
      { id: "lb", label: "ปอนด์ (lb)", factor: 0.45359237, aliases: ["lb", "lbs", "pound", "pounds", "ปอนด์"] },
      { id: "oz", label: "ออนซ์ (oz)", factor: 0.028349523125, aliases: ["oz", "ounce", "ounces", "ออนซ์"] },
    ],
  },
  {
    id: "length",
    name: "ความยาว",
    icon: "📏",
    baseId: "m",
    units: [
      { id: "m", label: "เมตร (m)", factor: 1, aliases: ["m", "meter", "meters", "metre", "metres", "เมตร"] },
      { id: "cm", label: "เซนติเมตร (cm)", factor: 0.01, aliases: ["cm", "เซน", "เซนติเมตร", "ซม"] },
      { id: "mm", label: "มิลลิเมตร (mm)", factor: 0.001, aliases: ["mm", "มิลลิเมตร", "มม"] },
      { id: "inch", label: "นิ้ว (inch)", factor: 0.0254, aliases: ["inch", "inches", "in", '"', "นิ้ว"] },
      { id: "ft", label: "ฟุต (ft)", factor: 0.3048, aliases: ["ft", "feet", "foot", "ฟุต", "'"] },
    ],
  },
  {
    id: "volume",
    name: "ปริมาตร",
    icon: "📦",
    baseId: "m3",
    units: [
      { id: "m3", label: "ลูกบาศก์เมตร (CBM / m³)", factor: 1, aliases: ["m3", "m³", "cbm", "cbms", "คิว", "ลบม", "ลูกบาศก์เมตร"] },
      { id: "cm3", label: "ลูกบาศก์เซนติเมตร (cm³)", factor: 0.000001, aliases: ["cm3", "cm³", "cc", "ลบซม"] },
      { id: "liter", label: "ลิตร (L)", factor: 0.001, aliases: ["l", "liter", "liters", "litre", "litres", "ltr", "ลิตร"] },
      { id: "ft3", label: "ลูกบาศก์ฟุต (ft³)", factor: 0.028316846592, aliases: ["ft3", "ft³", "cuft", "cbf", "ลูกบาศก์ฟุต"] },
    ],
  },
];

export interface UnitColOptions {
  col: number;
  category: UnitCategoryId;
  targetUnit: string; // id ของหน่วยเป้าหมายในหมวด
  assumeUnit?: string | null; // id หน่วยที่ถือว่าใช้กับช่อง "ไม่มีหน่วย" · null/undefined = ข้าม (ไม่เดา)
  round?: number | null; // ปัดทศนิยม · null = ไม่ปัด
  mode?: "add" | "replace"; // default add (เติมคอลัมน์ใหม่)
  colName?: string; // ชื่อคอลัมน์ใหม่ (โหมดเติม)
}

export type UnitRowStatus =
  | "converted" // อ่านหน่วยได้ในหมวด → แปลงแล้ว
  | "assumed" // ไม่มีหน่วย แต่ผู้ใช้สั่งให้ถือว่าเป็นหน่วย X
  | "ambiguous" // ไม่มีหน่วย + ไม่ได้สั่งถือว่า → ข้าม
  | "mismatch" // มีหน่วยแต่คนละหมวด/อ่านไม่ออก → ข้าม
  | "non-numeric" // ไม่มีตัวเลข → ข้าม
  | "blank"; // ช่องว่าง

export interface UnitColSample {
  before: string;
  after: Cell;
  status: UnitRowStatus;
}

export interface UnitColResult {
  header: Row;
  rows: Row[];
  addedCols: string[];
  firstNewIndex: number;
  replacedCol: number;
  inputRows: number;
  dataRows: number;
  convertedRows: number;
  assumedRows: number;
  ambiguousRows: number;
  mismatchRows: number;
  nonNumericRows: number;
  blankRows: number;
  samples: UnitColSample[]; // cap 50 (โชว์ก่อน→หลัง)
  targetLabel: string;
  error?: string;
}

function isBlankCell(v: Cell): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}
function isDataRow(row: Row): boolean {
  return row.some((c) => !isBlankCell(c));
}
function cellAt(row: Row, col: number): Cell {
  if (col < 0) return null;
  return col < row.length ? row[col] : null;
}
function cellToStr(v: Cell): string {
  if (v === null || v === undefined) return "";
  return String(v);
}
// normalize token หน่วย: ตัวเล็ก + ตัดจุด/ช่องว่างในตัว (กก. = กก · ลบ.ม. = ลบม)
function normUnitToken(s: string): string {
  return s.toLowerCase().replace(/[.\s]/g, "");
}

export function getCategoryDef(id: UnitCategoryId): CategoryDef | undefined {
  return UNIT_COL_CATEGORIES.find((c) => c.id === id);
}
export function getUnitEntry(cat: CategoryDef, unitId: string): UnitEntry | undefined {
  return cat.units.find((u) => u.id === unitId);
}

// สร้างแผนที่ alias → unitId (ตัด normalize แล้ว) สำหรับหมวดหนึ่ง
function buildAliasMap(cat: CategoryDef): Map<string, string> {
  const m = new Map<string, string>();
  for (const u of cat.units) {
    m.set(normUnitToken(u.id), u.id);
    for (const a of u.aliases) m.set(normUnitToken(a), u.id);
  }
  return m;
}

export interface ParsedValueUnit {
  num: number;
  unitToken: string; // token ที่ต่อจากตัวเลข ("" = ไม่มีหน่วย)
}

// ดึงตัวเลข + token หน่วยจากข้อความ · number cell → ไม่มีหน่วย · อ่านตัวเลขไม่ได้ → null
export function parseValueUnit(cell: Cell): ParsedValueUnit | null {
  if (typeof cell === "number") {
    return Number.isFinite(cell) ? { num: cell, unitToken: "" } : null;
  }
  if (typeof cell === "boolean" || cell === null || cell === undefined) return null;
  const raw = String(cell).trim();
  if (raw === "") return null;
  // ตัด comma คั่นหลักพันออกก่อน (5,000g → 5000g)
  const s = raw.replace(/,/g, "");
  const m = s.match(/^([+-]?(?:\d+\.?\d*|\.\d+))\s*(.*)$/);
  if (!m) return null;
  const num = Number(m[1]);
  if (!Number.isFinite(num)) return null;
  return { num, unitToken: m[2].trim() };
}

function cleanFloat(v: number, digits: number): number {
  const d = Math.min(Math.max(digits, 0), 12);
  const f = Math.pow(10, d);
  return Math.round((v + (v >= 0 ? 1 : -1) * Number.EPSILON) * f) / f;
}
function applyRound(v: number, round: number | null | undefined): number {
  if (round === null || round === undefined) return cleanFloat(v, 12);
  const d = Math.max(0, Math.floor(round));
  const f = Math.pow(10, d);
  return cleanFloat(Math.round(v * f) / f, d + 2);
}

export function analyzeUnitCol(header: Row, allRows: Row[], opts: UnitColOptions): UnitColResult {
  const inputRows = allRows.length;
  const rows = allRows.filter(isDataRow);
  const dataRows = rows.length;
  const width = Math.max(header.length, ...rows.map((r) => r.length), 1);

  const base = (msg: string): UnitColResult => ({
    header: header.slice(),
    rows: rows.map((r) => r.slice()),
    addedCols: [],
    firstNewIndex: -1,
    replacedCol: -1,
    inputRows,
    dataRows,
    convertedRows: 0,
    assumedRows: 0,
    ambiguousRows: 0,
    mismatchRows: 0,
    nonNumericRows: 0,
    blankRows: 0,
    samples: [],
    targetLabel: "",
    error: msg,
  });

  if (dataRows === 0) return base("ไม่มีแถวข้อมูล");
  if (opts.col < 0 || opts.col >= width) return base("เลือกคอลัมน์ที่จะรวมหน่วยให้อยู่ในช่วง");

  const cat = getCategoryDef(opts.category);
  if (!cat) return base("หมวดหน่วยไม่ถูกต้อง");
  const target = getUnitEntry(cat, opts.targetUnit);
  if (!target) return base("เลือกหน่วยเป้าหมายให้อยู่ในหมวด");
  const assume =
    opts.assumeUnit === null || opts.assumeUnit === undefined || opts.assumeUnit === ""
      ? null
      : getUnitEntry(cat, opts.assumeUnit);
  if (opts.assumeUnit && !assume) return base("หน่วยที่ถือว่าใช้กับช่องไม่มีหน่วย ต้องอยู่ในหมวดเดียวกัน");

  const aliasMap = buildAliasMap(cat);

  let convertedRows = 0;
  let assumedRows = 0;
  let ambiguousRows = 0;
  let mismatchRows = 0;
  let nonNumericRows = 0;
  let blankRows = 0;
  const samples: UnitColSample[] = [];

  const convert = (num: number, from: UnitEntry): number => applyRound((num * from.factor) / target.factor, opts.round);

  // คำนวณค่าที่แปลงต่อแถว + สถานะ
  const outVals: Cell[] = rows.map((r) => {
    const cell = cellAt(r, opts.col);
    const before = cellToStr(cell);
    let after: Cell = null;
    let status: UnitRowStatus;

    if (isBlankCell(cell)) {
      status = "blank";
      blankRows++;
    } else {
      const parsed = parseValueUnit(cell);
      if (parsed === null) {
        status = "non-numeric";
        nonNumericRows++;
      } else if (parsed.unitToken === "") {
        // ไม่มีหน่วย
        if (assume) {
          after = convert(parsed.num, assume);
          status = "assumed";
          assumedRows++;
        } else {
          status = "ambiguous";
          ambiguousRows++;
        }
      } else {
        const uid = aliasMap.get(normUnitToken(parsed.unitToken));
        const from = uid ? getUnitEntry(cat, uid) : undefined;
        if (from) {
          after = convert(parsed.num, from);
          status = "converted";
          convertedRows++;
        } else {
          status = "mismatch";
          mismatchRows++;
        }
      }
    }

    if (samples.length < 50 && status !== "blank") {
      samples.push({ before, after, status });
    }
    return after;
  });

  const replace = opts.mode === "replace";
  const colName =
    opts.colName && opts.colName.trim() !== ""
      ? opts.colName.trim()
      : `${cellToStr(cellAt(header, opts.col)) || `คอลัมน์ ${opts.col + 1}`} (${target.id})`;

  if (replace) {
    const outHeader = header.slice();
    while (outHeader.length < width) outHeader.push(null);
    const outRows: Row[] = rows.map((r, i) => {
      const out = r.slice();
      while (out.length < width) out.push(null);
      if (outVals[i] !== null) out[opts.col] = outVals[i];
      return out;
    });
    return {
      header: outHeader,
      rows: outRows,
      addedCols: [],
      firstNewIndex: -1,
      replacedCol: opts.col,
      inputRows,
      dataRows,
      convertedRows,
      assumedRows,
      ambiguousRows,
      mismatchRows,
      nonNumericRows,
      blankRows,
      samples,
      targetLabel: target.label,
    };
  }

  const outHeader = header.slice();
  while (outHeader.length < width) outHeader.push(null);
  const firstNewIndex = outHeader.length;
  outHeader.push(colName);

  const outRows: Row[] = rows.map((r, i) => {
    const out = r.slice();
    while (out.length < width) out.push(null);
    out.push(outVals[i]);
    return out;
  });

  return {
    header: outHeader,
    rows: outRows,
    addedCols: [colName],
    firstNewIndex,
    replacedCol: -1,
    inputRows,
    dataRows,
    convertedRows,
    assumedRows,
    ambiguousRows,
    mismatchRows,
    nonNumericRows,
    blankRows,
    samples,
    targetLabel: target.label,
  };
}

// export CSV: ค่าก่อน → ค่าหลัง + สถานะ (เฉพาะแถวที่ไม่ว่าง)
export const STATUS_LABEL: Record<UnitRowStatus, string> = {
  converted: "แปลงแล้ว",
  assumed: "ถือว่าเป็นหน่วยที่กำหนด",
  ambiguous: "ไม่มีหน่วย (ข้าม)",
  mismatch: "หน่วยอ่านไม่ออก/คนละหมวด (ข้าม)",
  "non-numeric": "ไม่มีตัวเลข (ข้าม)",
  blank: "ว่าง",
};

// รวมหลายไฟล์/หลายชีตเป็นไฟล์เดียว — pure ล้วน (ไม่พึ่ง DOM/DB)
// คู่กับ split: split = แยก 1 → หลาย · merge = รวม หลาย → 1
// use-case จริง: รวม packing list หลายตู้/หลายไฟล์ (ฟอร์แมตเดียวกัน) เป็นไฟล์มาสเตอร์เดียว
// ปรัชญาเดียวกับทั้ง repo: **ไม่ทิ้งข้อมูล** — จำนวนแถวออก = ผลรวมแถวเข้าเสมอ (outputRows === inputRows)
import type { Cell, Row } from "@/lib/reconcile/types";

export type MergeMode = "by-header" | "by-position";

export const MERGE_MODE_LABEL: Record<MergeMode, string> = {
  "by-header": "จับคอลัมน์ตามชื่อหัวตาราง (กันสลับคอลัมน์)",
  "by-position": "เรียงตามตำแหน่งคอลัมน์เดิม",
};

export const SOURCE_COL_LABEL = "ไฟล์ต้นทาง";

export interface MergeInput {
  name: string; // ชื่อไฟล์/ชีต (ไว้ทำคอลัมน์ต้นทาง)
  header: Row; // แถวหัวตาราง
  rows: Row[]; // แถวข้อมูล (ไม่รวม header)
}

export interface MergeStats {
  files: number; // จำนวนไฟล์/ชีตที่รวม
  inputRows: number; // ผลรวมแถวข้อมูลทุกไฟล์
  outputRows: number; // แถวข้อมูลผลลัพธ์ (ต้อง = inputRows เสมอ = ไม่หาย)
  columns: number; // จำนวนคอลัมน์ผลลัพธ์ (ไม่รวมคอลัมน์ต้นทาง)
  addedColumns: number; // คอลัมน์ที่โผล่เพิ่มจากไฟล์หลัง (เฉพาะ by-header)
}

export interface MergeResult {
  header: Row;
  rows: Row[];
  stats: MergeStats;
}

function cellText(v: Cell): string {
  return v === null || v === undefined ? "" : String(v);
}

function normKey(v: Cell): string {
  return cellText(v).trim().toLowerCase();
}

// รวมแบบจับตามชื่อหัวตาราง — สร้าง union ของคอลัมน์ (เจอครั้งแรกที่ไหนคงลำดับนั้น)
// คอลัมน์ที่บางไฟล์ไม่มี → เติมช่องว่าง (null) ให้ ไม่ทำข้อมูลเลื่อน
function mergeByHeader(inputs: MergeInput[], addSource: boolean): MergeResult {
  const unionKeys: string[] = []; // key normalize (กันหัวตารางพิมพ์ต่างเคส/มีช่องว่าง)
  const displayByKey = new Map<string, Cell>(); // key → ข้อความหัวตารางที่จะโชว์ (ครั้งแรกที่เจอ)
  const firstFileKeys = new Set<string>(); // คอลัมน์ที่ไฟล์แรกมี (ไว้นับ addedColumns)

  inputs.forEach((inp, fileIdx) => {
    inp.header.forEach((h, i) => {
      const key = normKey(h) || `__col${i}`; // หัวตารางว่าง → key ตามตำแหน่ง (กันยุบรวมมั่ว)
      if (!displayByKey.has(key)) {
        displayByKey.set(key, h);
        unionKeys.push(key);
      }
      if (fileIdx === 0) firstFileKeys.add(key);
    });
  });

  const header: Row = unionKeys.map((k) => displayByKey.get(k) ?? "");
  const rows: Row[] = [];
  for (const inp of inputs) {
    // map: ตำแหน่งคอลัมน์ในไฟล์นี้ → ตำแหน่งใน union
    const colMap = inp.header.map((h, i) => {
      const key = normKey(h) || `__col${i}`;
      return unionKeys.indexOf(key);
    });
    for (const row of inp.rows) {
      const out: Row = new Array(unionKeys.length).fill(null);
      row.forEach((v, i) => {
        const target = colMap[i];
        if (target >= 0) out[target] = v;
      });
      rows.push(addSource ? [inp.name, ...out] : out);
    }
  }

  const addedColumns = unionKeys.filter((k) => !firstFileKeys.has(k)).length;
  return finalize(header, rows, inputs, unionKeys.length, addedColumns, addSource);
}

// รวมแบบเรียงตามตำแหน่ง — ใช้หัวตารางไฟล์แรก, ความกว้าง = คอลัมน์มากสุดที่เจอ
// เหมาะกับไฟล์ฟอร์แมตเดียวกันเป๊ะ (คอลัมน์เรียงเหมือนกัน)
function mergeByPosition(inputs: MergeInput[], addSource: boolean): MergeResult {
  const width = inputs.reduce(
    (m, inp) => Math.max(m, inp.header.length, ...inp.rows.map((r) => r.length)),
    0,
  );
  const first = inputs[0]?.header ?? [];
  const header: Row = Array.from({ length: width }, (_, i) => first[i] ?? "");
  const rows: Row[] = [];
  for (const inp of inputs) {
    for (const row of inp.rows) {
      const out: Row = Array.from({ length: width }, (_, i) => row[i] ?? null);
      rows.push(addSource ? [inp.name, ...out] : out);
    }
  }
  return finalize(header, rows, inputs, width, 0, addSource);
}

export function mergeFiles(
  inputs: MergeInput[],
  opts: { mode: MergeMode; addSource: boolean } = { mode: "by-header", addSource: false },
): MergeResult {
  const clean = inputs.filter((i) => i.header.length > 0 || i.rows.length > 0);
  if (opts.mode === "by-position") return mergeByPosition(clean, opts.addSource);
  return mergeByHeader(clean, opts.addSource);
}

function finalize(
  header: Row,
  rows: Row[],
  inputs: MergeInput[],
  columns: number,
  addedColumns: number,
  addSource: boolean,
): MergeResult {
  const inputRows = inputs.reduce((s, i) => s + i.rows.length, 0);
  return {
    header: addSource ? [SOURCE_COL_LABEL, ...header] : header,
    rows,
    stats: { files: inputs.length, inputRows, outputRows: rows.length, columns, addedColumns },
  };
}

// ผลลัพธ์ → รูปแบบ sheets (มี header นำหน้า) ให้ sheetsToXlsx / rowsToCsv ใช้ต่อ
export function mergeToRows(result: MergeResult): Row[] {
  return [result.header, ...result.rows];
}

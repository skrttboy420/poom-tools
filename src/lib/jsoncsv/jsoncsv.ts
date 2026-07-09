// แปลง JSON ↔ ตาราง/CSV — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case: response จาก MOMO API / Supabase (JSON array) → ตาราง/CSV ดูง่าย/เอาไปเทียบต่อได้
//   และกลับทาง: CSV/ตาราง → JSON array of objects (เอาไปยิง API / เก็บ config)
// ปรัชญา: ไม่ทิ้งข้อมูล — ค่าที่เป็น object/array ซ้อน ถ้าไม่ flatten จะเก็บเป็น JSON string ในช่อง (ไม่หาย)

import Papa from "papaparse";
import type { Cell, Row } from "@/lib/reconcile/types";

// ---------- JSON → ตาราง ----------

export interface TableData {
  header: string[];
  rows: Row[];
  count: number; // จำนวนแถวข้อมูล (ไม่รวม header)
}

export type JsonToTableResult = ({ ok: true } & TableData) | { ok: false; error: string };

type Plain = Record<string, unknown>;

function isPlainObject(v: unknown): v is Plain {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// แปลงค่าเดี่ยวเป็น Cell — object/array ที่เหลือ → JSON string (ไม่ทิ้งข้อมูล)
function toCell(v: unknown): Cell {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

// แผ่ object ซ้อนเป็น key แบบ dot notation (array ไม่แผ่ — เก็บเป็น JSON string)
function flattenInto(obj: Plain, prefix: string, out: Plain): void {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (isPlainObject(v)) {
      // object ว่าง → เก็บเป็น {} กันคอลัมน์หาย
      if (Object.keys(v).length === 0) out[key] = v;
      else flattenInto(v, key, out);
    } else {
      out[key] = v;
    }
  }
}

export function jsonToTable(input: string, opts: { flatten?: boolean } = {}): JsonToTableResult {
  const text = input.trim();
  if (text === "") return { ok: false, error: "ยังไม่มีข้อมูล JSON" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `JSON ไม่ถูกต้อง: ${(e as Error).message}` };
  }

  // normalize เป็น array ของ element
  let arr: unknown[];
  if (Array.isArray(parsed)) arr = parsed;
  else if (isPlainObject(parsed)) arr = [parsed];
  else return { ok: false, error: "ต้องเป็น JSON object หรือ array (ไม่ใช่ค่าเดี่ยว)" };

  // array ว่าง → ตารางว่าง (ไม่ error)
  if (arr.length === 0) return { ok: true, header: [], rows: [], count: 0 };

  const allObjects = arr.every((e) => isPlainObject(e));
  const allArrays = arr.every((e) => Array.isArray(e));

  // กรณี 1: array ของ object → คอลัมน์ = union ของ key (คงลำดับพบครั้งแรก)
  if (allObjects) {
    const keys: string[] = [];
    const seen = new Set<string>();
    const prepared: Plain[] = arr.map((e) => {
      const obj = e as Plain;
      if (!opts.flatten) return obj;
      const out: Plain = {};
      flattenInto(obj, "", out);
      return out;
    });
    for (const obj of prepared) {
      for (const k of Object.keys(obj)) {
        if (!seen.has(k)) {
          seen.add(k);
          keys.push(k);
        }
      }
    }
    const rows: Row[] = prepared.map((obj) =>
      keys.map((k) => (k in obj ? toCell(obj[k]) : null)),
    );
    return { ok: true, header: keys, rows, count: rows.length };
  }

  // กรณี 2: array ของ array → แต่ละ inner array = 1 แถว, header = คอลัมน์ 1..N
  if (allArrays) {
    const width = Math.max(0, ...arr.map((e) => (e as unknown[]).length));
    const header = Array.from({ length: width }, (_, i) => `คอลัมน์ ${i + 1}`);
    const rows: Row[] = arr.map((e) => {
      const inner = e as unknown[];
      return Array.from({ length: width }, (_, i) => toCell(inner[i]));
    });
    return { ok: true, header, rows, count: rows.length };
  }

  // กรณี 3: อื่น ๆ (primitive ล้วน หรือปนกัน) → คอลัมน์เดียว "value" (object/array → JSON string)
  const rows: Row[] = arr.map((e) => [toCell(e)]);
  return { ok: true, header: ["value"], rows, count: rows.length };
}

// ---------- ตาราง/CSV → JSON ----------

export type TableToJsonResult = { ok: true; json: string; count: number } | { ok: false; error: string };

// เดาชนิดค่าจาก string (เปิด inferTypes): "" → null, true/false → bool, ตัวเลข → number, null → null, ที่เหลือ = string
function inferValue(s: string): Cell {
  const t = s.trim();
  if (t === "") return null;
  if (t === "true") return true;
  if (t === "false") return false;
  if (t === "null") return null;
  // ตัวเลข: ต้อง match เป๊ะ (กัน "1,234"/"08-01" หลุด) และ round-trip ได้
  // **คงเลขที่มี 0 นำหน้า (เช่น "007" tracking/รหัส) เป็น string** — กันข้อมูลเพี้ยนตามปรัชญา no-data-loss
  if (/^-?(\d+\.?\d*|\.\d+)$/.test(t) && !/^-?0\d/.test(t)) {
    const n = Number(t);
    if (Number.isFinite(n)) return n;
  }
  return s; // คงค่าดิบ (ไม่ trim) กันข้อมูลเพี้ยน
}

export function tableToJson(
  csvText: string,
  opts: { inferTypes?: boolean; pretty?: boolean } = {},
): TableToJsonResult {
  const text = csvText.trim();
  if (text === "") return { ok: false, error: "ยังไม่มีข้อมูล CSV" };

  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
  const data = parsed.data.filter((r) => Array.isArray(r));
  if (data.length === 0) return { ok: false, error: "ไม่พบข้อมูลในตาราง" };

  const header = data[0].map((h, i) => {
    const name = (h ?? "").trim();
    return name === "" ? `col${i + 1}` : name;
  });
  const body = data.slice(1);

  const objects = body.map((row) => {
    const obj: Record<string, Cell> = {};
    header.forEach((key, i) => {
      const raw = row[i] ?? "";
      obj[key] = opts.inferTypes ? inferValue(raw) : raw;
    });
    return obj;
  });

  const json = JSON.stringify(objects, null, opts.pretty ? 2 : 0);
  return { ok: true, json, count: objects.length };
}

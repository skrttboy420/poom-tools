// หาค่าที่ "คล้ายกันแต่ไม่เหมือนเป๊ะ" ในคอลัมน์เดียว — จับพิมพ์ผิด/สลับตัวอักษรของ tracking/ตู้ ก่อนเอาไป reconcile — pure ล้วน
// use-case จริง: KY001 vs KYO01 (O แทน 0), TU-A vs TU-Α (อักษรกรีก/ไทยหน้าตาเหมือน), ช่องว่างเกิน, ตัวพิมพ์ต่าง
//   → 2 ค่านี้ "ดูเหมือนคนละอัน" ทำให้ join ไม่ติด/นับซ้ำ · เครื่องมือนี้ชี้คู่ที่น่าสงสัยให้ดูก่อน (ไม่แก้ให้อัตโนมัติ ตามปรัชญาไม่เดามั่ว)
// ต่างจากเครื่องมืออื่น: /dedup = ซ้ำเป๊ะ · /whitespace = อักขระล่องหน · /list-compare = set diff (มี/ไม่มี)
//   /near-dup (อันนี้) = ระยะแก้ไข (edit distance / Levenshtein) — คล้ายแค่ไหนถึงนับว่า "น่าจะพิมพ์ผิด"

import type { Cell, Row } from "@/lib/reconcile/types";

export interface NearDupOptions {
  maxDistance?: number; // ระยะแก้ไขสูงสุดที่ถือว่า "ใกล้กัน" — default 1
  caseInsensitive?: boolean; // ไม่สนพิมพ์เล็ก/ใหญ่ก่อนเทียบ — default true (พิมพ์ผิดมักสลับ case)
  trim?: boolean; // ตัดช่องว่างหน้า-หลังก่อนเทียบ — default true
  collapseSpaces?: boolean; // ยุบช่องว่างในค่าเป็นช่องเดียว + ตัดหัวท้าย — default false
}

export interface NearDupPair {
  a: string; // ค่าที่แสดง (ตัวแรกที่พบของกลุ่ม normalize A)
  b: string;
  distance: number; // ระยะแก้ไข (1 = ต่างกัน 1 ตำแหน่ง)
  similarity: number; // 0..1 = 1 - distance/maxLen
  countA: number; // จำนวนแถวที่ค่านี้ปรากฏ
  countB: number;
  rowsA: number[]; // index แถว (0-based ใน dataRows) — cap ที่ ROWS_CAP
  rowsB: number[];
}

export interface NearDupResult {
  pairs: NearDupPair[];
  distinctValues: number; // ค่าไม่ซ้ำ (หลัง normalize, ไม่นับว่าง)
  totalRows: number; // แถวที่มีค่า (ไม่ว่าง) ที่สแกน
  blankRows: number; // แถวที่ช่องนี้ว่าง
  pairCount: number;
  cappedPairs: boolean; // true = คู่เยอะเกิน หยุดเก็บที่ PAIRS_CAP
  error?: string;
}

const ROWS_CAP = 200; // เก็บ index แถวต่อค่าไม่เกินเท่านี้ (กัน payload บวม)
const PAIRS_CAP = 5000; // จำนวนคู่สูงสุดที่คืน
const DISTINCT_CAP = 3000; // ค่าไม่ซ้ำเกินนี้ = ไม่เทียบ (O(n²) ช้าเกิน)

function isBlankCell(c: Cell): boolean {
  return c === null || c === undefined || (typeof c === "string" && c.trim() === "");
}

function normValue(cell: Cell, opts: Required<Pick<NearDupOptions, "trim" | "caseInsensitive" | "collapseSpaces">>): string {
  let s = typeof cell === "string" ? cell : String(cell);
  if (opts.collapseSpaces) s = s.replace(/\s+/g, " ").trim();
  else if (opts.trim) s = s.trim();
  if (opts.caseInsensitive) s = s.toLowerCase();
  return s;
}

// Levenshtein distance ที่ตัดจบเร็วเมื่อเกิน cap (คืน cap+1) — ทำงานบน code point (รองรับ unicode/ไทย/emoji)
export function levenshteinCapped(aCps: number[], bCps: number[], cap: number): number {
  const la = aCps.length;
  const lb = bCps.length;
  if (Math.abs(la - lb) > cap) return cap + 1;
  if (la === 0) return lb <= cap ? lb : cap + 1;
  if (lb === 0) return la <= cap ? la : cap + 1;

  const prev = new Array<number>(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  const cur = new Array<number>(lb + 1);

  for (let i = 1; i <= la; i++) {
    cur[0] = i;
    let rowMin = i;
    const ai = aCps[i - 1];
    for (let j = 1; j <= lb; j++) {
      const cost = ai === bCps[j - 1] ? 0 : 1;
      let v = prev[j - 1] + cost; // แทนที่/ตรงกัน
      const del = prev[j] + 1; // ลบ
      const ins = cur[j - 1] + 1; // เพิ่ม
      if (del < v) v = del;
      if (ins < v) v = ins;
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > cap) return cap + 1; // ทั้งแถวเกิน cap แล้ว → ไปต่อก็ไม่ลด
    for (let j = 0; j <= lb; j++) prev[j] = cur[j];
  }
  return prev[lb] <= cap ? prev[lb] : cap + 1;
}

export function findNearDuplicates(
  header: Row,
  dataRows: Row[],
  col: number,
  opts: NearDupOptions = {},
): NearDupResult {
  void header;
  const maxDistance = Math.max(1, Math.floor(opts.maxDistance ?? 1));
  const trim = opts.trim !== false;
  const caseInsensitive = opts.caseInsensitive !== false;
  const collapseSpaces = opts.collapseSpaces === true;
  const nOpts = { trim, caseInsensitive, collapseSpaces };

  const base: Omit<NearDupResult, "error"> = {
    pairs: [],
    distinctValues: 0,
    totalRows: 0,
    blankRows: 0,
    pairCount: 0,
    cappedPairs: false,
  };

  // หา width เพื่อ validate col
  let width = header.length;
  for (const r of dataRows) if (r.length > width) width = r.length;
  if (width === 0) return { ...base, error: "ไม่มีข้อมูลให้ตรวจ (ตารางว่าง)" };
  if (col < 0 || col >= width) return { ...base, error: "เลือกคอลัมน์ที่จะตรวจ" };

  // เก็บกลุ่มตามค่า normalize: key → { display, rows[] }
  const groups = new Map<string, { display: string; rows: number[]; count: number }>();
  let totalRows = 0;
  let blankRows = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const cell = col < row.length ? (row[col] ?? null) : null;
    if (isBlankCell(cell)) {
      // แถวว่างทั้งแถว vs ช่องนี้ว่าง — ถ้าช่องนี้ว่างก็ไม่นับ (ตรวจได้เฉพาะช่องที่มีค่า)
      blankRows += 1;
      continue;
    }
    const key = normValue(cell, nOpts);
    if (key === "") {
      blankRows += 1;
      continue;
    }
    totalRows += 1;
    let g = groups.get(key);
    if (!g) {
      g = { display: typeof cell === "string" ? cell : String(cell), rows: [], count: 0 };
      groups.set(key, g);
    }
    g.count += 1;
    if (g.rows.length < ROWS_CAP) g.rows.push(i);
  }

  const keys = [...groups.keys()];
  const distinctValues = keys.length;

  if (distinctValues > DISTINCT_CAP) {
    return {
      ...base,
      distinctValues,
      totalRows,
      blankRows,
      error: `ค่าไม่ซ้ำเยอะเกินไป (${distinctValues.toLocaleString()} ค่า) — เทียบทีละคู่ช้าเกิน · ลองกรอง/แยกไฟล์ก่อน หรือใช้คอลัมน์อื่น`,
    };
  }

  // precompute code-point arrays ต่อ key (เทียบเร็วขึ้น)
  const cps = keys.map((k) => Array.from(k, (ch) => ch.codePointAt(0) ?? 0));

  const pairs: NearDupPair[] = [];
  let cappedPairs = false;

  outer: for (let i = 0; i < keys.length; i++) {
    const ci = cps[i];
    for (let j = i + 1; j < keys.length; j++) {
      const cj = cps[j];
      if (Math.abs(ci.length - cj.length) > maxDistance) continue; // prefilter ความยาว
      const d = levenshteinCapped(ci, cj, maxDistance);
      if (d >= 1 && d <= maxDistance) {
        const gi = groups.get(keys[i])!;
        const gj = groups.get(keys[j])!;
        const maxLen = Math.max(ci.length, cj.length) || 1;
        pairs.push({
          a: gi.display,
          b: gj.display,
          distance: d,
          similarity: Math.round((1 - d / maxLen) * 1000) / 1000,
          countA: gi.count,
          countB: gj.count,
          rowsA: gi.rows,
          rowsB: gj.rows,
        });
        if (pairs.length >= PAIRS_CAP) {
          cappedPairs = true;
          break outer;
        }
      }
    }
  }

  // เรียง: ระยะน้อยก่อน (ใกล้สุด = น่าสงสัยสุด) → similarity มากก่อน → a,b
  pairs.sort(
    (p, q) =>
      p.distance - q.distance ||
      q.similarity - p.similarity ||
      p.a.localeCompare(q.a, "th") ||
      p.b.localeCompare(q.b, "th"),
  );

  return {
    pairs,
    distinctValues,
    totalRows,
    blankRows,
    pairCount: pairs.length,
    cappedPairs,
    error: undefined,
  };
}

// export คู่ที่น่าสงสัยเป็น CSV (ค่า A, ค่า B, ระยะ, ความคล้าย, จำนวน A, จำนวน B)
export function nearDupToCsv(result: NearDupResult): string {
  const esc = (v: string | number): string => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines: string[] = ["ค่า A,ค่า B,ระยะแก้ไข,ความคล้าย,จำนวน A,จำนวน B"];
  for (const p of result.pairs) {
    lines.push(
      [esc(p.a), esc(p.b), p.distance, `${Math.round(p.similarity * 100)}%`, p.countA, p.countB].join(","),
    );
  }
  return lines.join("\n");
}

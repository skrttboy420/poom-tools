// คอลัมน์วิเคราะห์ต่อแถว (% สัดส่วน · ยอดสะสม · % สะสม · อันดับ) — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case จริง: ตู้/tracking นี้คิดเป็นกี่ % ของน้ำหนักรวม · น้ำหนักสะสมไล่ลงมา · จัดอันดับหนักสุด →
//   เอาไปดูสัดส่วน/คัดตัวหนัก ก่อน export เข้า Pacred
// ปรัชญา: **เติมคอลัมน์ใหม่ท้ายตาราง ไม่แตะคอลัมน์เดิม (ไม่ทำข้อมูลหาย)** · ช่องที่ไม่ใช่ตัวเลข
//   = ปล่อยว่าง ไม่แทนค่ามั่ว (ไม่นับเข้ายอดรวม/อันดับ) + นับ/โชว์ให้เห็น · ทุกแถวออกครบเท่าเข้า

import type { Cell, Row } from "@/lib/reconcile/types";

export type Metric = "share" | "running" | "runningShare" | "rank";

export const METRICS: { id: Metric; label: string; hint: string }[] = [
  { id: "share", label: "% สัดส่วน", hint: "ค่าแถวนี้ ÷ ยอดรวม × 100" },
  { id: "running", label: "ยอดสะสม", hint: "บวกสะสมไล่จากบนลงล่าง" },
  { id: "runningShare", label: "% สะสม", hint: "ยอดสะสม ÷ ยอดรวม × 100" },
  { id: "rank", label: "อันดับ", hint: "จัดอันดับตามค่า (เท่ากัน = อันดับเดียวกัน)" },
];

export const METRIC_LABEL: Record<Metric, string> = {
  share: "% สัดส่วน",
  running: "ยอดสะสม",
  runningShare: "% สะสม",
  rank: "อันดับ",
};

export interface PercentOptions {
  col: number; // คอลัมน์ตัวเลขที่วิเคราะห์
  metrics: Metric[]; // เลือกคอลัมน์วิเคราะห์ที่จะเติม (ตามลำดับ)
  round?: number | null; // ปัดทศนิยม % และยอดสะสม (null/undefined = ไม่ปัด)
  rankDescending?: boolean; // อันดับ: true = มากสุด = อันดับ 1 (default) · false = น้อยสุด = 1
}

export interface PercentResult {
  header: string[];
  rows: Row[];
  inputRows: number;
  numericRows: number; // แถวที่ค่าเป็นตัวเลข (นับเข้ายอดรวม)
  skipped: number; // แถวที่ค่าไม่ใช่ตัวเลข → คอลัมน์วิเคราะห์เว้นว่าง
  total: number; // ผลรวมของคอลัมน์ (เฉพาะตัวเลข)
  addedCols: number; // จำนวนคอลัมน์ที่เติม
  firstNewColIndex: number; // ตำแหน่งคอลัมน์ใหม่ตัวแรก (= header เดิม.length)
  error?: string; // ถ้ามี = header/rows คืนของเดิมไม่แตะ
}

// parse ตัวเลขแบบเดียวกับ diff/stats/calccol: ตัด comma + trim · boolean/Infinity/ว่าง → null
function parseNumeric(v: Cell): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return null;
  const s = String(v).replace(/,/g, "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function roundTo(n: number, places: number): number {
  if (!Number.isFinite(places) || places < 0) return n;
  const f = Math.pow(10, Math.min(places, 12));
  return Math.round((n + Number.EPSILON) * f) / f;
}

function newColName(metric: Metric, colName: string): string {
  const base = colName.trim() === "" ? "" : colName.trim();
  switch (metric) {
    case "share":
      return base ? `% ${base}` : "% สัดส่วน";
    case "running":
      return base ? `${base} สะสม` : "ยอดสะสม";
    case "runningShare":
      return base ? `% สะสม ${base}` : "% สะสม";
    case "rank":
      return base ? `อันดับ ${base}` : "อันดับ";
    default:
      return "วิเคราะห์";
  }
}

export function analyzeColumn(
  header: string[],
  dataRows: Row[],
  opts: PercentOptions,
): PercentResult {
  const firstNewColIndex = header.length;
  const cloneRows: Row[] = dataRows.map((r) => r.slice());
  const base: PercentResult = {
    header: header.slice(),
    rows: cloneRows,
    inputRows: dataRows.length,
    numericRows: 0,
    skipped: 0,
    total: 0,
    addedCols: 0,
    firstNewColIndex,
  };

  if (opts.col < 0 || opts.col >= header.length) {
    return { ...base, error: "เลือกคอลัมน์ตัวเลขที่จะวิเคราะห์" };
  }
  const metrics = opts.metrics ?? [];
  if (metrics.length === 0) {
    return { ...base, error: "เลือกอย่างน้อย 1 คอลัมน์วิเคราะห์" };
  }

  const col = opts.col;
  const round = opts.round ?? null;
  const descending = opts.rankDescending !== false; // default true (มากสุด = 1)
  const colName = header[col] ?? "";

  // pre-pass: ค่าตัวเลขต่อแถว + ยอดรวม
  const values: (number | null)[] = dataRows.map((row) =>
    parseNumeric(col < row.length ? (row[col] ?? null) : null),
  );
  let total = 0;
  let numericRows = 0;
  for (const v of values) {
    if (v !== null) {
      total += v;
      numericRows++;
    }
  }
  const skipped = dataRows.length - numericRows;

  // อันดับ (competition ranking 1-2-2-4) — เฉพาะเมื่อเลือก rank
  const rankMap = new Map<number, number>();
  if (metrics.includes("rank")) {
    const numericIdx: number[] = [];
    for (let i = 0; i < values.length; i++) if (values[i] !== null) numericIdx.push(i);
    numericIdx.sort((a, b) => {
      const va = values[a] as number;
      const vb = values[b] as number;
      return descending ? vb - va : va - vb;
    });
    let rank = 0;
    let count = 0;
    let prev: number | null = null;
    for (const i of numericIdx) {
      const v = values[i] as number;
      count++;
      if (prev === null || v !== prev) {
        rank = count;
        prev = v;
      }
      rankMap.set(i, rank);
    }
  }

  const newHeader = [...header, ...metrics.map((m) => newColName(m, colName))];
  const canShare = total !== 0;

  const out: Row[] = [];
  let running = 0;
  const maybeRound = (n: number): number => (round !== null ? roundTo(n, round) : n);

  dataRows.forEach((row, i) => {
    // ทำให้แถวเป็นสี่เหลี่ยม (aligned กับ header เดิม) แล้วเติมคอลัมน์วิเคราะห์
    const nr: Row = [];
    for (let c = 0; c < header.length; c++) nr.push(row[c] ?? null);

    const v = values[i];
    if (v !== null) running += v;

    for (const m of metrics) {
      if (v === null) {
        nr.push(null); // ไม่ใช่ตัวเลข → เว้นว่าง (ไม่เดามั่ว)
        continue;
      }
      switch (m) {
        case "share":
          nr.push(canShare ? maybeRound((v / total) * 100) : null);
          break;
        case "running":
          nr.push(maybeRound(running));
          break;
        case "runningShare":
          nr.push(canShare ? maybeRound((running / total) * 100) : null);
          break;
        case "rank":
          nr.push(rankMap.get(i) ?? null);
          break;
        default:
          nr.push(null);
      }
    }
    out.push(nr);
  });

  return {
    header: newHeader,
    rows: out,
    inputRows: dataRows.length,
    numericRows,
    skipped,
    total,
    addedCols: metrics.length,
    firstNewColIndex,
  };
}

// ตัวช่วยเดา: แถวหัวตาราง + จับคู่คอลัมน์อัตโนมัติ (ผู้ใช้แก้ทับได้เสมอ)
import type { Cell, FieldDef, Row } from "./types";

function isNumericLike(v: Cell): boolean {
  if (typeof v === "number") return true;
  if (typeof v === "string") {
    const s = v.replace(/,/g, "").trim();
    return s !== "" && !Number.isNaN(Number(s));
  }
  return false;
}

function nonEmptyTextCount(row: Row): number {
  let n = 0;
  for (const c of row) {
    if (c === null || c === "") continue;
    if (typeof c === "string" && !isNumericLike(c)) n++;
  }
  return n;
}

// เดาแถว header: แถวที่มีข้อความ (ไม่ใช่ตัวเลข) เยอะสุดในช่วงต้นไฟล์
export function guessHeaderRow(rows: Row[], scanLimit = 30): number {
  const limit = Math.min(rows.length, scanLimit);
  let best = 0;
  let bestScore = -1;
  for (let i = 0; i < limit; i++) {
    const score = nonEmptyTextCount(rows[i] || []);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

function normHeader(v: Cell): string {
  return String(v ?? "")
    .toLowerCase()
    .replace(/[\s._\-()/\\:#]/g, "")
    .trim();
}

// พจนานุกรมคำพ้องของ field มาตรฐาน (ไทย/อังกฤษ/จีนที่พบบ่อย)
const SYNONYMS: Record<string, string[]> = {
  tracking: ["tracking", "trackingnumber", "trackingno", "track", "awb", "เลขแทรค", "เลขพัสดุ", "หมายเลขพัสดุ", "运单号", "快递单号"],
  weight: ["weight", "weightkg", "wt", "kg", "น้ำหนัก", "重量"],
  cbm: ["cbm", "vol", "volume", "ปริมาตร", "体积", "方数"],
  parcel: ["parcel", "parcelcount", "totalparcel", "pcs", "qty", "quantity", "จำนวน", "กล่อง", "ชิ้น", "件数", "数量"],
  container: ["container", "containername", "containerno", "containernumber", "ตู้", "柜号"],
};

// ให้คะแนนความเข้ากันของ header กับ field: exact > startsWith > includes; ยิ่งสั้นยิ่งชอบ
function scoreHeaderForField(header: string, fieldId: string): number {
  const h = header;
  if (!h) return 0;
  const syns = SYNONYMS[fieldId] ?? [normHeader(fieldId)];
  let best = 0;
  for (const syn of syns) {
    if (!syn) continue;
    let s = 0;
    if (h === syn) s = 100;
    else if (h.startsWith(syn)) s = 70;
    else if (h.includes(syn)) s = 45;
    else if (syn.includes(h) && h.length >= 2) s = 30;
    if (s > 0) {
      // เลี่ยง "total weight" มาชนะ "weight" — ยิ่ง header ยาวเกิน syn มากยิ่งหักคะแนน
      s -= Math.max(0, h.length - syn.length) * 0.5;
      best = Math.max(best, s);
    }
  }
  return best;
}

// จับคู่ field -> column index จาก header row; คืน -1 ถ้าไม่เจอที่เข้าเกณฑ์
export function guessColumns(headerRow: Row, fields: FieldDef[]): Record<string, number> {
  const headers = headerRow.map(normHeader);
  const out: Record<string, number> = {};
  const used = new Set<number>();
  // เรียง field ให้ตัวที่ "เฉพาะเจาะจง" จับก่อน (tracking/container ก่อน weight/cbm)
  const order = [...fields];
  for (const f of order) {
    let bestIdx = -1;
    let bestScore = 20; // threshold ขั้นต่ำ
    for (let i = 0; i < headers.length; i++) {
      if (used.has(i)) continue;
      const s = scoreHeaderForField(headers[i], f.id);
      if (s > bestScore) {
        bestScore = s;
        bestIdx = i;
      }
    }
    out[f.id] = bestIdx;
    if (bestIdx >= 0) used.add(bestIdx);
  }
  return out;
}

// field เริ่มต้นสำหรับงาน cargo ของ Pacred (ผู้ใช้เพิ่ม/ลบ/แก้ได้)
export function defaultFields(): FieldDef[] {
  return [
    { id: "tracking", label: "Tracking", role: "key", numeric: false, tolerance: 0 },
    { id: "weight", label: "น้ำหนัก (kg)", role: "compare", numeric: true, tolerance: 0 },
    { id: "cbm", label: "CBM / ปริมาตร", role: "compare", numeric: true, tolerance: 0 },
    { id: "parcel", label: "จำนวนกล่อง", role: "compare", numeric: true, tolerance: 0 },
    { id: "container", label: "เลขตู้", role: "compare", numeric: false, tolerance: 0 },
  ];
}

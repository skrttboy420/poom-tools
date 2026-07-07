// เครื่องคำนวณ CBM (ปริมาตร/คิว) สำหรับงาน cargo — pure ไม่พึ่ง DOM/DB
// CBM = กว้าง × ยาว × สูง (เมตร) × จำนวนกล่อง
// ใช้ในงานภูมจริง: เช็คคิวของ packing list, คิดค่าระวาง (freight) เทียบน้ำหนัก vs ปริมาตร

export type DimUnit = "cm" | "m" | "inch";

export const DIM_UNIT_LABEL: Record<DimUnit, string> = {
  cm: "เซนติเมตร (cm)",
  m: "เมตร (m)",
  inch: "นิ้ว (inch)",
};

// ตัวคูณแปลงหน่วย → เมตร (สำหรับคิด CBM)
const TO_METER: Record<DimUnit, number> = { cm: 0.01, m: 1, inch: 0.0254 };
// ตัวคูณแปลงหน่วย → เซนติเมตร (สำหรับคิดน้ำหนักเชิงปริมาตร air ที่ใช้สูตร cm)
const TO_CM: Record<DimUnit, number> = { cm: 1, m: 100, inch: 2.54 };

export interface CbmLine {
  id: string;
  name: string;
  w: number | null; // กว้าง
  l: number | null; // ยาว
  h: number | null; // สูง
  qty: number | null; // จำนวนกล่อง
  weight: number | null; // น้ำหนัก/กล่อง (kg) — ใส่หรือไม่ก็ได้
}

export interface CbmLineResult {
  cbmEach: number; // CBM ต่อกล่อง
  cbmTotal: number; // CBM รวมของแถว (× จำนวนกล่อง)
  weightTotal: number; // น้ำหนักรวมของแถว
  complete: boolean; // ครบ 3 มิติ + จำนวน
}

export interface CbmTotals {
  totalCbm: number; // CBM รวมทั้งหมด
  totalCartons: number; // จำนวนกล่องรวม
  totalWeight: number; // น้ำหนักรวม (kg) — เท่าที่กรอก
  volumetricAir: number; // น้ำหนักเชิงปริมาตร (air) = (กxยxส cm)/divisor × qty
  chargeableSea: number; // W/M ทะเล = max(น้ำหนักจริง, CBM×1000)
  lines: number; // จำนวนแถวที่คำนวณได้ (complete)
}

export function newLine(): CbmLine {
  return {
    id: Math.random().toString(36).slice(2, 9),
    name: "",
    w: null,
    l: null,
    h: null,
    qty: null,
    weight: null,
  };
}

export function computeLine(line: CbmLine, unit: DimUnit): CbmLineResult {
  const f = TO_METER[unit];
  const w = line.w ?? 0;
  const l = line.l ?? 0;
  const h = line.h ?? 0;
  const qty = line.qty ?? 0;
  const cbmEach = w * f * (l * f) * (h * f);
  const cbmTotal = cbmEach * qty;
  const weightTotal = (line.weight ?? 0) * qty;
  const complete = Boolean(line.w && line.l && line.h && line.qty);
  return { cbmEach, cbmTotal, weightTotal, complete };
}

// airDivisor: 6000 = มาตรฐาน air freight, 5000 = courier/express
export function computeTotals(lines: CbmLine[], unit: DimUnit, airDivisor = 6000): CbmTotals {
  const cmF = TO_CM[unit];
  let totalCbm = 0;
  let totalCartons = 0;
  let totalWeight = 0;
  let volumetricAir = 0;
  let completeLines = 0;

  for (const ln of lines) {
    const r = computeLine(ln, unit);
    totalCbm += r.cbmTotal;
    totalCartons += ln.qty ?? 0;
    totalWeight += r.weightTotal;
    const wcm = (ln.w ?? 0) * cmF;
    const lcm = (ln.l ?? 0) * cmF;
    const hcm = (ln.h ?? 0) * cmF;
    volumetricAir += ((wcm * lcm * hcm) / airDivisor) * (ln.qty ?? 0);
    if (r.complete) completeLines += 1;
  }

  const chargeableSea = Math.max(totalWeight, totalCbm * 1000);
  return {
    totalCbm,
    totalCartons,
    totalWeight,
    volumetricAir,
    chargeableSea,
    lines: completeLines,
  };
}

export function round(n: number, digits = 4): number {
  const p = 10 ** digits;
  return Math.round((n + Number.EPSILON) * p) / p;
}

// export สรุปเป็น CSV: 1 แถวต่อ 1 รายการ + ท้ายด้วยแถวรวม
export function cbmToCsv(lines: CbmLine[], unit: DimUnit, airDivisor = 6000): string {
  const header = [
    "รายการ",
    `กว้าง(${unit})`,
    `ยาว(${unit})`,
    `สูง(${unit})`,
    "จำนวนกล่อง",
    "น้ำหนัก/กล่อง(kg)",
    "CBM/กล่อง",
    "CBM รวม",
    "น้ำหนักรวม(kg)",
  ];
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body: (string | number)[][] = lines.map((ln, i) => {
    const r = computeLine(ln, unit);
    return [
      ln.name || `รายการ ${i + 1}`,
      ln.w ?? "",
      ln.l ?? "",
      ln.h ?? "",
      ln.qty ?? "",
      ln.weight ?? "",
      round(r.cbmEach, 6),
      round(r.cbmTotal, 6),
      round(r.weightTotal, 2),
    ];
  });
  const t = computeTotals(lines, unit, airDivisor);
  body.push([
    "รวมทั้งหมด",
    "",
    "",
    "",
    t.totalCartons,
    "",
    "",
    round(t.totalCbm, 4),
    round(t.totalWeight, 2),
  ]);
  return [header, ...body].map((row) => row.map(esc).join(",")).join("\n");
}

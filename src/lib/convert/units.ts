// แปลงหน่วย — งาน cargo เจอบ่อย: inch↔cm (ซัพจีนให้นิ้ว), lb↔kg, ft³↔CBM
// วิธีคิด: ทุกหน่วยเก็บ "factor" = ค่าเมื่อเทียบเป็นหน่วยฐาน → แปลงข้ามหน่วยด้วย value*from/to
// pure ไม่พึ่ง DOM/DB

export interface UnitDef {
  id: string;
  label: string; // ชื่อไทย + ตัวย่อ
  factor: number; // ค่าของ 1 หน่วยนี้ เมื่อคิดเป็นหน่วยฐาน
}

export interface UnitCategory {
  id: string;
  name: string;
  icon: string;
  baseId: string; // หน่วยฐาน
  units: UnitDef[];
}

export const UNIT_CATEGORIES: UnitCategory[] = [
  {
    id: "weight",
    name: "น้ำหนัก",
    icon: "⚖️",
    baseId: "kg",
    units: [
      { id: "kg", label: "กิโลกรัม (kg)", factor: 1 },
      { id: "g", label: "กรัม (g)", factor: 0.001 },
      { id: "ton", label: "ตัน (metric ton)", factor: 1000 },
      { id: "lb", label: "ปอนด์ (lb)", factor: 0.45359237 },
      { id: "oz", label: "ออนซ์ (oz)", factor: 0.028349523125 },
    ],
  },
  {
    id: "length",
    name: "ความยาว",
    icon: "📏",
    baseId: "m",
    units: [
      { id: "m", label: "เมตร (m)", factor: 1 },
      { id: "cm", label: "เซนติเมตร (cm)", factor: 0.01 },
      { id: "mm", label: "มิลลิเมตร (mm)", factor: 0.001 },
      { id: "inch", label: "นิ้ว (inch)", factor: 0.0254 },
      { id: "ft", label: "ฟุต (ft)", factor: 0.3048 },
    ],
  },
  {
    id: "volume",
    name: "ปริมาตร",
    icon: "📦",
    baseId: "m3",
    units: [
      { id: "m3", label: "ลูกบาศก์เมตร (CBM / m³)", factor: 1 },
      { id: "cm3", label: "ลูกบาศก์เซนติเมตร (cm³)", factor: 0.000001 },
      { id: "liter", label: "ลิตร (L)", factor: 0.001 },
      { id: "ft3", label: "ลูกบาศก์ฟุต (ft³)", factor: 0.028316846592 },
    ],
  },
];

export function getCategory(id: string): UnitCategory | undefined {
  return UNIT_CATEGORIES.find((c) => c.id === id);
}

export function getUnit(cat: UnitCategory, unitId: string): UnitDef | undefined {
  return cat.units.find((u) => u.id === unitId);
}

// แปลง value จากหน่วย from → to ภายในหมวดเดียวกัน
export function convert(value: number, from: UnitDef, to: UnitDef): number {
  return (value * from.factor) / to.factor;
}

// แปลง value (หน่วย fromId) เป็นทุกหน่วยในหมวด → [{unit, value}]
export function convertToAll(
  value: number,
  cat: UnitCategory,
  fromId: string,
): { unit: UnitDef; value: number }[] {
  const from = getUnit(cat, fromId);
  if (!from) return [];
  return cat.units.map((u) => ({ unit: u, value: convert(value, from, u) }));
}

// จัดรูปตัวเลขผลลัพธ์: ตัด 0 ท้าย, จำกัดทศนิยม (ปริมาตร/เล็ก ๆ ต้องการทศนิยมเยอะ)
export function formatResult(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "0";
  const abs = Math.abs(n);
  let digits = 4;
  if (abs < 0.0001) digits = 8;
  else if (abs < 1) digits = 6;
  else if (abs >= 1000) digits = 2;
  const s = n.toLocaleString("en-US", { maximumFractionDigits: digits });
  return s;
}

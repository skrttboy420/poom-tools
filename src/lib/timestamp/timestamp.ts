// แปลงเวลา Unix epoch ↔ วันที่ — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case จริง: เช็ค timestamp ใน payload MOMO API / แถว Supabase (เป็น epoch วินาที/มิลลิ) →
//   อ่านเป็นวันเวลาจริง หรือกลับกัน · เทียบเวลา created_at/updated_at
// ปรัชญา: **ไม่เดามั่ว** — ตัวเลขล้วนกำกวมว่าเป็นวินาที/มิลลิ/ไมโคร → ให้ผู้ใช้ "เลือกหน่วยเอง"
//   (auto ใช้จำนวนหลักเดา แต่เลือกทับได้) · parse ไม่ได้ = บอก error ชัด ไม่คืนค่ามั่ว
//   · UTC คำนวณตรง (ยืนยันได้) · local โชว์แยกพร้อมป้ายเขตเวลา

export type EpochUnit = "auto" | "s" | "ms" | "us";

export const UNIT_LABEL: Record<EpochUnit, string> = {
  auto: "เดาอัตโนมัติ",
  s: "วินาที (s)",
  ms: "มิลลิวินาที (ms)",
  us: "ไมโครวินาที (µs)",
};

const THAI_WEEKDAYS = [
  "อาทิตย์",
  "จันทร์",
  "อังคาร",
  "พุธ",
  "พฤหัสบดี",
  "ศุกร์",
  "เสาร์",
];

export interface TsResult {
  ok: boolean;
  error?: string;
  ms: number; // epoch มิลลิวินาที (แหล่งความจริง)
  unixS: number; // epoch วินาที (ปัดลง)
  unixMs: number;
  iso: string; // ISO 8601 UTC (toISOString)
  utc: string; // อ่านง่าย UTC "YYYY-MM-DD HH:mm:ss"
  utcWeekday: string; // วันในสัปดาห์ (ไทย) ตาม UTC
  local: string; // อ่านง่าย local "YYYY-MM-DD HH:mm:ss"
  localWeekday: string; // วันในสัปดาห์ (ไทย) ตาม local
  localOffset: string; // เขตเวลา local เช่น "UTC+7"
  detected: string; // ตีความ input ว่าอะไร
}

const EMPTY: Omit<TsResult, "ok" | "error"> = {
  ms: 0,
  unixS: 0,
  unixMs: 0,
  iso: "",
  utc: "",
  utcWeekday: "",
  local: "",
  localWeekday: "",
  localOffset: "",
  detected: "",
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function localOffsetLabel(d: Date): string {
  // getTimezoneOffset: นาทีที่ต้องบวกเพื่อไป UTC (ไทย = -420) → UTC+7
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m === 0 ? `UTC${sign}${h}` : `UTC${sign}${h}:${pad2(m)}`;
}

// สร้างผลลัพธ์จาก epoch ms (source of truth)
export function buildResult(ms: number, detected: string): TsResult {
  if (!Number.isFinite(ms)) {
    return { ok: false, error: "ค่าเวลาไม่ถูกต้อง", ...EMPTY };
  }
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) {
    return { ok: false, error: "ค่าเวลาไม่ถูกต้อง (นอกช่วงที่รองรับ)", ...EMPTY };
  }
  const utc = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
  const local = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  return {
    ok: true,
    ms,
    unixS: Math.floor(ms / 1000),
    unixMs: ms,
    iso: d.toISOString(),
    utc,
    utcWeekday: THAI_WEEKDAYS[d.getUTCDay()],
    local,
    localWeekday: THAI_WEEKDAYS[d.getDay()],
    localOffset: localOffsetLabel(d),
    detected,
  };
}

// เดาหน่วย epoch จากจำนวนหลัก (เฉพาะโหมด auto)
function guessUnit(digits: number): Exclude<EpochUnit, "auto"> {
  if (digits <= 11) return "s";
  if (digits <= 14) return "ms";
  return "us";
}

function unitToMs(value: number, unit: Exclude<EpochUnit, "auto">): number {
  switch (unit) {
    case "s":
      return value * 1000;
    case "ms":
      return value;
    case "us":
      return Math.floor(value / 1000);
    default:
      return value;
  }
}

export function parseTimestamp(input: string, unit: EpochUnit = "auto"): TsResult {
  const s = input.trim();
  if (s === "") return { ok: false, error: "ใส่ค่าเวลา (epoch หรือ วันที่)", ...EMPTY };

  // ตัวเลขล้วน (มี +/- ได้) = epoch
  if (/^[+-]?\d+$/.test(s)) {
    const value = Number(s);
    if (!Number.isFinite(value)) return { ok: false, error: "ตัวเลขใหญ่เกินไป", ...EMPTY };
    const digits = s.replace(/^[+-]/, "").length;
    const useUnit: Exclude<EpochUnit, "auto"> = unit === "auto" ? guessUnit(digits) : unit;
    const ms = unitToMs(value, useUnit);
    const label =
      unit === "auto"
        ? `epoch ${UNIT_LABEL[useUnit]} (เดาจาก ${digits} หลัก)`
        : `epoch ${UNIT_LABEL[useUnit]}`;
    return buildResult(ms, label);
  }

  // ไม่ใช่ตัวเลขล้วน = ข้อความวันที่ (ISO ฯลฯ)
  const parsed = Date.parse(s);
  if (Number.isNaN(parsed)) {
    return { ok: false, error: "อ่านวันที่ไม่ออก — ลองรูปแบบ ISO เช่น 2025-07-10T08:30:00Z", ...EMPTY };
  }
  return buildResult(parsed, "ข้อความวันที่");
}

// เวลาปัจจุบัน
export function nowResult(nowMs: number = Date.now()): TsResult {
  return buildResult(nowMs, "เวลาปัจจุบัน");
}

// เวลาสัมพัทธ์ (relative) — inject now เพื่อ test ได้
export function formatRelative(ms: number, nowMs: number = Date.now()): string {
  const diff = nowMs - ms; // >0 = อดีต
  const future = diff < 0;
  const sec = Math.floor(Math.abs(diff) / 1000);
  if (sec < 1) return "เมื่อกี้นี้";
  const units: [number, string][] = [
    [60, "วินาที"],
    [60, "นาที"],
    [24, "ชั่วโมง"],
    [30, "วัน"],
    [12, "เดือน"],
    [Number.POSITIVE_INFINITY, "ปี"],
  ];
  let value = sec;
  let label = "วินาที";
  for (let i = 0; i < units.length; i++) {
    const [div, name] = units[i];
    if (value < div) {
      label = name;
      break;
    }
    value = Math.floor(value / div);
    label = units[i + 1] ? units[i + 1][1] : name;
  }
  return future ? `ในอีก ${value} ${label}` : `${value} ${label}ที่แล้ว`;
}

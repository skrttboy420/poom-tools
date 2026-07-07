// ทดสอบ Regex — pure ล้วน (ไม่พึ่ง DOM/DB)
// dev quick-win: ลอง pattern กับข้อความจริง เห็น match/กลุ่ม + ลอง replace ก่อนเอาไปใช้ clean ข้อมูล
// (เช่น ดึงเลข tracking, แยกเลขตู้, ตัด prefix)
export const REGEX_FLAGS: { flag: string; label: string; hint: string }[] = [
  { flag: "g", label: "g", hint: "หาทุกที่ (global)" },
  { flag: "i", label: "i", hint: "ไม่สนตัวพิมพ์เล็ก/ใหญ่" },
  { flag: "m", label: "m", hint: "^ $ จับหลายบรรทัด" },
  { flag: "s", label: "s", hint: ". จับขึ้นบรรทัดใหม่ด้วย" },
  { flag: "u", label: "u", hint: "โหมด Unicode" },
];

const MATCH_CAP = 1000; // กัน UI หน่วงถ้า match เยอะเวอร์

export interface RegexMatch {
  index: number; // ตำแหน่งเริ่ม (char offset)
  end: number; // ตำแหน่งจบ
  match: string; // ข้อความที่ match
  groups: (string | undefined)[]; // capture group 1..n
  namedGroups: Record<string, string | undefined>;
}

export interface RegexResult {
  ok: boolean;
  error?: string;
  matches: RegexMatch[];
  count: number;
  capped: boolean; // ตัดที่ MATCH_CAP หรือไม่
}

// เติม flag g ตอนหาเพื่อ list ได้ทุก match (แต่ UI ยังโชว์ flag ตามที่ผู้ใช้เลือก)
function withGlobal(flags: string): string {
  return flags.includes("g") ? flags : flags + "g";
}

export function runRegex(pattern: string, flags: string, text: string): RegexResult {
  if (pattern === "") return { ok: true, matches: [], count: 0, capped: false };
  let re: RegExp;
  try {
    re = new RegExp(pattern, withGlobal(flags));
  } catch (e) {
    return { ok: false, error: (e as Error).message, matches: [], count: 0, capped: false };
  }
  const matches: RegexMatch[] = [];
  let capped = false;
  try {
    for (const m of text.matchAll(re)) {
      matches.push({
        index: m.index ?? 0,
        end: (m.index ?? 0) + m[0].length,
        match: m[0],
        groups: m.slice(1),
        namedGroups: { ...(m.groups ?? {}) },
      });
      if (matches.length >= MATCH_CAP) {
        capped = true;
        break;
      }
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message, matches: [], count: 0, capped: false };
  }
  return { ok: true, matches, count: matches.length, capped };
}

export interface ReplaceResult {
  ok: boolean;
  output: string;
  error?: string;
}

// ลอง replace — respect flag ผู้ใช้ (ไม่มี g = แทนที่อันแรกอันเดียว) · รองรับ $1 $<name>
export function runReplace(pattern: string, flags: string, text: string, replacement: string): ReplaceResult {
  if (pattern === "") return { ok: true, output: text };
  try {
    const re = new RegExp(pattern, flags);
    return { ok: true, output: text.replace(re, replacement) };
  } catch (e) {
    return { ok: false, output: "", error: (e as Error).message };
  }
}

// ตัดข้อความเป็นชิ้น ๆ (ปกติ / match) เพื่อไปไฮไลต์บน UI — ไม่พึ่ง DOM
export interface TextSegment {
  text: string;
  matchIndex: number; // -1 = ข้อความปกติ, >=0 = ลำดับ match
}

export function segmentText(text: string, matches: RegexMatch[]): TextSegment[] {
  if (matches.length === 0) return text ? [{ text, matchIndex: -1 }] : [];
  const segs: TextSegment[] = [];
  let pos = 0;
  matches.forEach((m, i) => {
    if (m.index > pos) segs.push({ text: text.slice(pos, m.index), matchIndex: -1 });
    // เผื่อ match ยาว 0 ตัว — ยังคงดันตำแหน่งไปข้างหน้าไม่ให้ค้าง
    if (m.end > m.index) segs.push({ text: text.slice(m.index, m.end), matchIndex: i });
    pos = Math.max(pos, m.end);
  });
  if (pos < text.length) segs.push({ text: text.slice(pos), matchIndex: -1 });
  return segs;
}

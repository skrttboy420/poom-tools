// สุ่มรายชื่อ / สลับลำดับ / แบ่งกลุ่ม — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case: สุ่มผู้โชคดี, สลับคิว, แบ่งของ/คน เป็นกลุ่มเท่า ๆ กัน
// ปรัชญา: ใช้ Fisher-Yates ที่ "ยุติธรรม" (ทุกลำดับความน่าจะเป็นเท่ากัน) + RNG แบบ inject ได้
//   → ใส่ seed ได้ ทำผลซ้ำเดิมได้ (reproducible) และเทสแบบ deterministic ได้

export interface ParseListOptions {
  dedupe?: boolean; // ตัดรายชื่อซ้ำ (คงตัวแรก)
}

// แตกข้อความเป็นรายการ (ทีละบรรทัด) — trim + ตัดบรรทัดว่าง + ตัดซ้ำ (option)
export function parseList(text: string, opts: ParseListOptions = {}): string[] {
  const raw = text.split(/\r\n|\r|\n/).map((s) => s.trim()).filter((s) => s !== "");
  if (!opts.dedupe) return raw;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

// RNG แบบ deterministic จาก seed (mulberry32) — คืนฟังก์ชันสุ่ม [0,1)
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// สลับลำดับแบบ Fisher-Yates (ไม่แก้ต้นฉบับ — คืน array ใหม่)
export function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// สุ่มเลือก n รายการ (ไม่ซ้ำ) — ถ้า n >= จำนวนทั้งหมด คืนทั้งหมด (สลับลำดับ)
export function pickN<T>(items: readonly T[], n: number, rng: () => number = Math.random): T[] {
  const k = Math.max(0, Math.floor(n));
  const shuffled = shuffle(items, rng);
  return shuffled.slice(0, Math.min(k, shuffled.length));
}

// แบ่งเป็น k กลุ่ม เกลี่ยให้เท่า ๆ กัน (สลับก่อนแล้วแจกแบบ round-robin)
// invariant: ผลรวมทุกกลุ่ม = จำนวน items (ไม่ทิ้ง/ไม่เพิ่ม)
export function splitGroups<T>(items: readonly T[], k: number, rng: () => number = Math.random): T[][] {
  const g = Math.max(1, Math.floor(k));
  const groups: T[][] = Array.from({ length: g }, () => []);
  const shuffled = shuffle(items, rng);
  shuffled.forEach((item, idx) => {
    groups[idx % g].push(item);
  });
  return groups;
}

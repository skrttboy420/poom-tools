// เทียบ 2 รายการแบบ set — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case: วางลิสต์ tracking จาก packing list (A) ↔ จาก Pacred/MOMO (B) →
//   รู้ทันทีว่าตัวไหน "เฉพาะ A / เฉพาะ B / มีทั้งคู่" · reconcile เบา ๆ ไม่ต้องอัปไฟล์
// ปรัชญา: normalize เพื่อ "จับคู่" แต่ยึด "ค่าที่แสดง" ตามที่พิมพ์มาจริง (ไม่ทำข้อมูลเพี้ยน)

export interface CompareOptions {
  trim?: boolean; // ตัดช่องว่างหัวท้ายก่อนเทียบ (default true)
  caseInsensitive?: boolean; // ไม่สนตัวพิมพ์เล็ก/ใหญ่ (default false)
}

export interface CompareResult {
  onlyA: string[]; // อยู่ใน A ไม่อยู่ใน B
  onlyB: string[]; // อยู่ใน B ไม่อยู่ใน A
  both: string[]; // อยู่ทั้งคู่ (แสดงค่าจากฝั่ง A)
  countA: number; // จำนวนรายการไม่ซ้ำใน A
  countB: number; // จำนวนรายการไม่ซ้ำใน B
  dupA: number; // จำนวน "รายการซ้ำ" ใน A (บรรทัดเกินตัวแรกของแต่ละคีย์)
  dupB: number;
}

// แตกข้อความเป็นรายการ (ทีละบรรทัด) — ตัดบรรทัดว่างทิ้ง (แต่ยังไม่ trim ค่าจริง)
export function parseLines(text: string): string[] {
  return text
    .split(/\r\n|\r|\n/)
    .map((s) => s.replace(/\s+$/g, "")) // ตัดช่องว่างท้ายบรรทัดเสมอ (ขยะจาก copy)
    .filter((s) => s.trim() !== "");
}

// สร้างคีย์ normalize สำหรับ "จับคู่"
function keyOf(raw: string, opts: CompareOptions): string {
  let s = raw;
  if (opts.trim !== false) s = s.trim();
  if (opts.caseInsensitive) s = s.toLowerCase();
  return s;
}

// สร้าง map: key → ค่าที่แสดง (ตัวแรกที่พบ) + นับซ้ำ
function indexList(items: string[], opts: CompareOptions): { map: Map<string, string>; dup: number } {
  const map = new Map<string, string>();
  let dup = 0;
  for (const raw of items) {
    const k = keyOf(raw, opts);
    if (map.has(k)) {
      dup++;
    } else {
      map.set(k, opts.trim !== false ? raw.trim() : raw);
    }
  }
  return { map, dup };
}

// เทียบ 2 ลิสต์ (รับเป็น array ของบรรทัดดิบ) — คงลำดับตามที่พบใน A/B
export function compareLists(
  aItems: string[],
  bItems: string[],
  opts: CompareOptions = {},
): CompareResult {
  const a = indexList(aItems, opts);
  const b = indexList(bItems, opts);

  const onlyA: string[] = [];
  const both: string[] = [];
  for (const [k, disp] of a.map) {
    if (b.map.has(k)) both.push(disp);
    else onlyA.push(disp);
  }
  const onlyB: string[] = [];
  for (const [k, disp] of b.map) {
    if (!a.map.has(k)) onlyB.push(disp);
  }

  return {
    onlyA,
    onlyB,
    both,
    countA: a.map.size,
    countB: b.map.size,
    dupA: a.dup,
    dupB: b.dup,
  };
}

// สะดวก: เทียบจากข้อความดิบ 2 ก้อน
export function compareText(aText: string, bText: string, opts: CompareOptions = {}): CompareResult {
  return compareLists(parseLines(aText), parseLines(bText), opts);
}

// export ผลเป็น CSV 2 คอลัมน์ (ค่า, สถานะ) — เรียง onlyA → onlyB → both
export function compareToCsv(result: CompareResult): string {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = ["value,status"];
  for (const v of result.onlyA) lines.push(`${esc(v)},only-A`);
  for (const v of result.onlyB) lines.push(`${esc(v)},only-B`);
  for (const v of result.both) lines.push(`${esc(v)},both`);
  return lines.join("\n");
}

// อ่านตัวเลขจำนวนเงินเป็นข้อความไทย "บาทถ้วน" (Thai baht text) — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case จริง: ออกใบแจ้งหนี้/ใบกำกับ/ใบเสร็จงานนำเข้า-ส่งออก ต้องมีบรรทัด "จำนวนเงิน (ตัวอักษร)"
//   เช่น 1,234.50 → "หนึ่งพันสองร้อยสามสิบสี่บาทห้าสิบสตางค์"
// ปรัชญา: deterministic ล้วน (input เดียว → ผลเดียว) · ปัดเป็นสตางค์ (ทศนิยม 2 ตำแหน่ง) แบบจำนวนเต็มสตางค์
//   (เลี่ยง float error) · ค่าที่อ่านไม่ได้ (ว่าง/ไม่ใช่ตัวเลข/Infinity) → ok=false บอกชัด ไม่คืนขยะ

const TXTNUM = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
// หลักภายในกลุ่ม 6 หลัก: [หน่วย, สิบ, ร้อย, พัน, หมื่น, แสน]
const TXTPLACE = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

// อ่านเลขกลุ่มเดียว (ความยาว 1..6 หลัก, ค่า 0..999999) เป็นข้อความ
// s อาจมี 0 นำหน้า (จากการแบ่งกลุ่ม) — จัดการเอง
function readGroup(s: string): string {
  let out = "";
  const n = s.length;
  for (let i = 0; i < n; i++) {
    const d = s.charCodeAt(i) - 48; // '0' = 48
    if (d === 0) continue;
    const pos = n - i - 1; // 0=หน่วย, 1=สิบ, ..., 5=แสน
    if (pos === 1) {
      // หลักสิบ: 1→"สิบ", 2→"ยี่สิบ", อื่น→"Xสิบ"
      if (d === 1) out += "สิบ";
      else if (d === 2) out += "ยี่สิบ";
      else out += TXTNUM[d] + "สิบ";
    } else if (pos === 0) {
      // หลักหน่วย: ถ้าเป็น 1 และมีหลักสูงกว่าที่ไม่ใช่ 0 อยู่ในกลุ่มนี้ → "เอ็ด"
      if (d === 1) {
        const hasHigher = /[1-9]/.test(s.slice(0, i));
        out += hasHigher ? "เอ็ด" : "หนึ่ง";
      } else {
        out += TXTNUM[d];
      }
    } else {
      // ร้อย/พัน/หมื่น/แสน
      out += TXTNUM[d] + TXTPLACE[pos];
    }
  }
  return out;
}

// อ่านจำนวนเต็ม (string ตัวเลขล้วน ไม่มีเครื่องหมาย) เป็นข้อความไทย · รองรับ "ล้าน" ซ้ำ (ล้านล้าน)
export function readInteger(intStr: string): string {
  const trimmed = intStr.replace(/^0+/, "");
  if (trimmed === "") return "ศูนย์";
  // แบ่งเป็นกลุ่มละ 6 หลักจากขวา
  const groups: string[] = [];
  for (let end = trimmed.length; end > 0; end -= 6) {
    groups.unshift(trimmed.slice(Math.max(0, end - 6), end));
  }
  const g = groups.length;
  let out = "";
  for (let i = 0; i < g; i++) {
    const part = readGroup(groups[i]);
    const millions = g - i - 1; // จำนวน "ล้าน" ที่ต่อท้ายกลุ่มนี้
    if (part) {
      out += part;
      if (millions > 0) out += "ล้าน".repeat(millions);
    }
  }
  return out;
}

export interface BahtTextResult {
  ok: boolean;
  text: string; // ข้อความบาทถ้วน (ถ้า ok)
  amount?: number; // ค่าที่ปัดเป็น 2 ตำแหน่งแล้ว
  baht?: number; // ส่วนบาท
  satang?: number; // ส่วนสตางค์ (0..99)
  negative?: boolean;
  error?: string;
}

// รับ number หรือ string (ตัด comma / ช่องว่างได้) → ข้อความบาทถ้วน
export function bahtText(input: number | string): BahtTextResult {
  let num: number;
  if (typeof input === "number") {
    num = input;
  } else {
    const cleaned = String(input).trim().replace(/,/g, "");
    if (cleaned === "") return { ok: false, text: "", error: "ใส่ตัวเลขจำนวนเงิน" };
    num = Number(cleaned);
  }
  if (!Number.isFinite(num)) {
    return { ok: false, text: "", error: "ไม่ใช่ตัวเลขที่ถูกต้อง" };
  }

  const negative = num < 0;
  const abs = Math.abs(num);
  // แปลงเป็นจำนวนสตางค์เต็ม (เลี่ยง float error) แล้วปัดครึ่งขึ้น
  const totalSatang = Math.round(abs * 100);
  const baht = Math.floor(totalSatang / 100);
  const satang = totalSatang % 100;
  const roundedAmount = totalSatang / 100;

  // ปัดแล้วเป็นศูนย์ → "ศูนย์บาทถ้วน" (ไม่ใส่ "ลบ")
  if (baht === 0 && satang === 0) {
    return { ok: true, text: "ศูนย์บาทถ้วน", amount: 0, baht: 0, satang: 0, negative: false };
  }

  let text = negative ? "ลบ" : "";
  if (baht > 0) {
    text += readInteger(String(baht)) + "บาท";
  }
  if (satang === 0) {
    text += "ถ้วน";
  } else {
    // สตางค์ 1..99 อ่านเหมือนเลข  2 หลัก
    text += readGroup(String(satang)) + "สตางค์";
  }

  return {
    ok: true,
    text,
    amount: negative ? -roundedAmount : roundedAmount,
    baht,
    satang,
    negative,
  };
}

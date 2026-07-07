// คำนวณ VAT + กำไร/มาร์จิ้น — pure ล้วน (ไม่พึ่ง DOM/DB)
// ช่วยตอนตั้งราคา/quote งานนำเข้า: แยก VAT, คิดกำไร, หาราคาขายจาก % ที่ต้องการ
export const DEFAULT_VAT_RATE = 7; // ไทย 7%

export interface VatResult {
  rate: number;
  base: number; // ราคาก่อน VAT
  vat: number; // ภาษี
  total: number; // ราคารวม VAT
}

// inclusive = true → amount คือราคารวม VAT แล้ว (ถอด VAT ออก) · false → amount คือราคาก่อน VAT (บวก VAT)
export function computeVat(amount: number, rate = DEFAULT_VAT_RATE, inclusive = false): VatResult {
  const a = safe(amount);
  const r = safe(rate);
  if (inclusive) {
    const base = a / (1 + r / 100);
    return { rate: r, base, vat: a - base, total: a };
  }
  const vat = (a * r) / 100;
  return { rate: r, base: a, vat, total: a + vat };
}

export interface ProfitResult {
  cost: number;
  sell: number;
  profit: number; // กำไร = ขาย - ทุน
  marginPct: number; // กำไร/ราคาขาย ×100 (มาร์จิ้น)
  markupPct: number; // กำไร/ทุน ×100 (บวกกำไรกี่ %)
}

export function computeProfit(cost: number, sell: number): ProfitResult {
  const c = safe(cost);
  const s = safe(sell);
  const profit = s - c;
  return {
    cost: c,
    sell: s,
    profit,
    marginPct: s !== 0 ? (profit / s) * 100 : 0,
    markupPct: c !== 0 ? (profit / c) * 100 : 0,
  };
}

// หาราคาขายจากทุน + % มาร์จิ้น (กำไรคิดเป็น % ของราคาขาย) · margin ≥100% = คิดไม่ได้ → 0
export function sellFromMargin(cost: number, marginPct: number): number {
  const c = safe(cost);
  const m = safe(marginPct);
  if (m >= 100) return 0;
  return c / (1 - m / 100);
}

// หาราคาขายจากทุน + % markup (บวกกำไรกี่ % ของทุน)
export function sellFromMarkup(cost: number, markupPct: number): number {
  return safe(cost) * (1 + safe(markupPct) / 100);
}

// กันค่าเพี้ยน (NaN/Infinity/ติดลบจากช่องว่าง) ให้เป็น 0
function safe(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

// จัดรูปตัวเลขเงิน (คอมมา + ทศนิยม 2) — ไว้โชว์บน UI
export function money(n: number): string {
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function pct(n: number): string {
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

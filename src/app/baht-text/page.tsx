"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { bahtText } from "@/lib/bahttext/bahttext";

const EXAMPLES = ["1234.50", "1,000,000", "99.99", "0.25", "21000000", "1500.75"];

// จัดรูปตัวเลขให้อ่านง่าย (คอมมา, คงทศนิยมตามจริง)
function pretty(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export default function BahtTextPage() {
  const [amount, setAmount] = useState("");
  const [copied, setCopied] = useState(false);

  const r = useMemo(() => bahtText(amount), [amount]);

  const copy = async () => {
    if (!r.ok) return;
    try {
      await navigator.clipboard.writeText(r.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };

  const showResult = amount.trim() !== "";

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">อ่านเลขเป็นบาทถ้วน 💰</h1>
          <p className="text-xs text-neutral-500">
            แปลงจำนวนเงินเป็นข้อความไทย (บาทถ้วน / สตางค์) — ไว้ใส่บรรทัด &ldquo;จำนวนเงินตัวอักษร&rdquo; ในใบแจ้งหนี้/ใบกำกับ/ใบเสร็จ
          </p>
        </div>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← กลับหน้าหลัก
        </Link>
      </header>

      <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 p-6">
        {/* input */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="amt" className="text-sm font-medium">
            จำนวนเงิน (บาท)
          </label>
          <input
            id="amt"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            autoFocus
            placeholder="เช่น 1,234.50"
            className="w-full rounded-lg border border-black/15 bg-transparent px-4 py-3 text-lg tabular-nums outline-none focus:border-emerald-500 dark:border-white/15"
          />
          <div className="flex flex-wrap gap-1.5 pt-1">
            <span className="self-center text-xs text-neutral-500">ตัวอย่าง:</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setAmount(ex)}
                className="rounded-md border border-black/10 px-2 py-0.5 text-xs text-neutral-600 transition hover:bg-black/5 dark:border-white/10 dark:text-neutral-300 dark:hover:bg-white/5"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>

        {/* result */}
        {showResult && r.ok && (
          <div className="flex flex-col gap-3 rounded-xl border border-emerald-500/30 bg-emerald-50/60 p-5 dark:bg-emerald-950/20">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xl leading-relaxed font-semibold text-emerald-800 dark:text-emerald-200">
                {r.text}
              </p>
              <button
                type="button"
                onClick={copy}
                className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700"
              >
                {copied ? "คัดลอกแล้ว ✓" : "คัดลอก"}
              </button>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-md bg-black/5 px-2 py-1 tabular-nums dark:bg-white/10">
                จำนวน {r.negative ? "-" : ""}
                {pretty(Math.abs(r.amount ?? 0))} บาท
              </span>
              <span className="rounded-md bg-black/5 px-2 py-1 tabular-nums dark:bg-white/10">
                บาท {pretty(r.baht ?? 0)}
              </span>
              <span className="rounded-md bg-black/5 px-2 py-1 tabular-nums dark:bg-white/10">
                สตางค์ {r.satang ?? 0}
              </span>
            </div>
          </div>
        )}

        {showResult && !r.ok && (
          <div className="rounded-xl border border-red-500/40 bg-red-50/60 p-4 text-sm text-red-700 dark:bg-red-950/20 dark:text-red-300">
            {r.error}
          </div>
        )}

        <p className="text-xs leading-relaxed text-neutral-500">
          หมายเหตุ: ปัดเศษเป็นสตางค์ (ทศนิยม 2 ตำแหน่ง) ก่อนอ่าน · รองรับคอมมา (1,234.50) และค่าติดลบ ·
          ศูนย์บาท → &ldquo;ศูนย์บาทถ้วน&rdquo; · มีเฉพาะสตางค์ (เช่น 0.50) → &ldquo;ห้าสิบสตางค์&rdquo; (ไม่มีคำว่าบาท)
        </p>
      </section>
    </main>
  );
}

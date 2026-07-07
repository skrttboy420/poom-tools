"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  computeVat,
  computeProfit,
  sellFromMargin,
  sellFromMarkup,
  money,
  pct,
  DEFAULT_VAT_RATE,
} from "@/lib/calc/price";

// รับค่าจาก input (string) → number (ว่าง/ผิด = 0)
function num(s: string): number {
  const n = parseFloat(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export default function CalcPage() {
  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">คำนวณ VAT + กำไร 🧮</h1>
          <p className="text-xs text-neutral-500">
            แยก VAT (7%), คิดกำไร/มาร์จิ้น/มาร์กอัป, หาราคาขายจาก % ที่อยากได้ — ไว้ตั้งราคา/quote งานนำเข้า
          </p>
        </div>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← กลับหน้าหลัก
        </Link>
      </header>

      <section className="grid flex-1 gap-6 p-6 lg:grid-cols-3">
        <VatCard />
        <ProfitCard />
        <SellCard />
      </section>
    </main>
  );
}

// ── VAT ──
function VatCard() {
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState(String(DEFAULT_VAT_RATE));
  const [inclusive, setInclusive] = useState(false);

  const r = useMemo(
    () => computeVat(num(amount), num(rate), inclusive),
    [amount, rate, inclusive],
  );

  return (
    <Card title="VAT (ภาษีมูลค่าเพิ่ม)">
      <div className="flex overflow-hidden rounded-lg border border-black/15 text-sm dark:border-white/15">
        <button
          type="button"
          onClick={() => setInclusive(false)}
          className={`flex-1 px-3 py-1.5 transition ${!inclusive ? "bg-emerald-600 text-white" : "hover:bg-black/5 dark:hover:bg-white/5"}`}
        >
          บวก VAT (ก่อน→รวม)
        </button>
        <button
          type="button"
          onClick={() => setInclusive(true)}
          className={`flex-1 px-3 py-1.5 transition ${inclusive ? "bg-emerald-600 text-white" : "hover:bg-black/5 dark:hover:bg-white/5"}`}
        >
          ถอด VAT (รวม→แยก)
        </button>
      </div>

      <Field label={inclusive ? "ราคารวม VAT แล้ว" : "ราคาก่อน VAT"}>
        <NumInput value={amount} onChange={setAmount} placeholder="0.00" />
      </Field>
      <Field label="อัตรา VAT (%)">
        <NumInput value={rate} onChange={setRate} placeholder="7" />
      </Field>

      <div className="mt-1 space-y-1 rounded-lg bg-neutral-50 p-3 text-sm dark:bg-neutral-900">
        <RowOut label="ราคาก่อน VAT" value={money(r.base)} />
        <RowOut label={`VAT ${pct(r.rate)}%`} value={money(r.vat)} />
        <RowOut label="ราคารวม VAT" value={money(r.total)} strong />
      </div>
    </Card>
  );
}

// ── กำไร/มาร์จิ้น ──
function ProfitCard() {
  const [cost, setCost] = useState("");
  const [sell, setSell] = useState("");

  const r = useMemo(() => computeProfit(num(cost), num(sell)), [cost, sell]);
  const loss = r.profit < 0;

  return (
    <Card title="กำไร / มาร์จิ้น">
      <Field label="ต้นทุน">
        <NumInput value={cost} onChange={setCost} placeholder="0.00" />
      </Field>
      <Field label="ราคาขาย">
        <NumInput value={sell} onChange={setSell} placeholder="0.00" />
      </Field>

      <div className="mt-1 space-y-1 rounded-lg bg-neutral-50 p-3 text-sm dark:bg-neutral-900">
        <RowOut
          label={loss ? "ขาดทุน" : "กำไร"}
          value={money(r.profit)}
          strong
          tone={loss ? "loss" : "profit"}
        />
        <RowOut label="มาร์จิ้น (กำไร/ขาย)" value={`${pct(r.marginPct)}%`} />
        <RowOut label="มาร์กอัป (กำไร/ทุน)" value={`${pct(r.markupPct)}%`} />
      </div>
      <p className="text-[11px] text-neutral-400">
        มาร์จิ้น = กำไรคิดเป็น % ของราคาขาย · มาร์กอัป = บวกกำไรกี่ % จากทุน
      </p>
    </Card>
  );
}

// ── หาราคาขายจาก % ──
function SellCard() {
  const [cost, setCost] = useState("");
  const [basis, setBasis] = useState<"margin" | "markup">("margin");
  const [target, setTarget] = useState("");

  const c = num(cost);
  const t = num(target);
  const sell = useMemo(
    () => (basis === "margin" ? sellFromMargin(c, t) : sellFromMarkup(c, t)),
    [basis, c, t],
  );
  const profit = sell - c;
  const capped = basis === "margin" && t >= 100;

  return (
    <Card title="หาราคาขายจาก %">
      <Field label="ต้นทุน">
        <NumInput value={cost} onChange={setCost} placeholder="0.00" />
      </Field>

      <div className="flex overflow-hidden rounded-lg border border-black/15 text-sm dark:border-white/15">
        <button
          type="button"
          onClick={() => setBasis("margin")}
          className={`flex-1 px-3 py-1.5 transition ${basis === "margin" ? "bg-emerald-600 text-white" : "hover:bg-black/5 dark:hover:bg-white/5"}`}
        >
          อยากได้มาร์จิ้น %
        </button>
        <button
          type="button"
          onClick={() => setBasis("markup")}
          className={`flex-1 px-3 py-1.5 transition ${basis === "markup" ? "bg-emerald-600 text-white" : "hover:bg-black/5 dark:hover:bg-white/5"}`}
        >
          อยากบวก %
        </button>
      </div>

      <Field label={basis === "margin" ? "มาร์จิ้นที่ต้องการ (%)" : "มาร์กอัปที่ต้องการ (%)"}>
        <NumInput value={target} onChange={setTarget} placeholder="0" />
      </Field>

      <div className="mt-1 space-y-1 rounded-lg bg-neutral-50 p-3 text-sm dark:bg-neutral-900">
        <RowOut label="ราคาขายที่ควรตั้ง" value={money(sell)} strong tone="profit" />
        <RowOut label="กำไรที่ได้" value={money(profit)} />
      </div>
      {capped && (
        <p className="text-[11px] text-red-500">
          มาร์จิ้น ≥ 100% คิดไม่ได้ (ราคาขายจะเป็นอนันต์) — ลองใช้ &ldquo;อยากบวก %&rdquo; แทน
        </p>
      )}
    </Card>
  );
}

// ── ชิ้นส่วน UI ร่วม ──
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-neutral-500">{label}</span>
      {children}
    </label>
  );
}

function NumInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      inputMode="decimal"
      spellCheck={false}
      className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-right font-mono text-sm tabular-nums outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
    />
  );
}

function RowOut({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "profit" | "loss";
}) {
  const toneClass =
    tone === "profit" ? "text-emerald-600" : tone === "loss" ? "text-red-500" : "";
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-neutral-500">{label}</span>
      <span className={`font-mono tabular-nums ${strong ? "text-base font-semibold" : ""} ${toneClass}`}>
        {value}
      </span>
    </div>
  );
}

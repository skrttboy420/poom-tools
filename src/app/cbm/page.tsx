"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  computeLine,
  computeTotals,
  cbmToCsv,
  newLine,
  round,
  DIM_UNIT_LABEL,
  type CbmLine,
  type DimUnit,
} from "@/lib/cbm/calc";
import { downloadText } from "@/lib/reconcile/export";

const UNITS: DimUnit[] = ["cm", "m", "inch"];
const AIR_DIVISORS = [
  { value: 6000, label: "6000 (air มาตรฐาน)" },
  { value: 5000, label: "5000 (courier/express)" },
];

function fmt(n: number, digits = 2): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

export default function CbmPage() {
  const [unit, setUnit] = useState<DimUnit>("cm");
  const [airDivisor, setAirDivisor] = useState(6000);
  const [lines, setLines] = useState<CbmLine[]>(() => [newLine(), newLine(), newLine()]);
  const [copied, setCopied] = useState(false);

  const totals = useMemo(() => computeTotals(lines, unit, airDivisor), [lines, unit, airDivisor]);

  const update = (id: string, patch: Partial<CbmLine>) =>
    setLines((prev) => prev.map((ln) => (ln.id === id ? { ...ln, ...patch } : ln)));
  const remove = (id: string) => setLines((prev) => (prev.length > 1 ? prev.filter((ln) => ln.id !== id) : prev));
  const addRow = () => setLines((prev) => [...prev, newLine()]);
  const reset = () => setLines([newLine(), newLine(), newLine()]);

  const num = (v: string): number | null => {
    if (v.trim() === "") return null;
    const n = Number(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  };

  const hasData = totals.lines > 0;

  const copySummary = async () => {
    const text =
      `สรุป CBM (หน่วย ${unit})\n` +
      `รวม CBM: ${fmt(round(totals.totalCbm, 4), 4)} คิว\n` +
      `จำนวนกล่อง: ${fmt(totals.totalCartons, 0)} กล่อง\n` +
      `น้ำหนักรวม: ${fmt(round(totals.totalWeight, 2))} kg\n` +
      `น้ำหนักเชิงปริมาตร (air ÷${airDivisor}): ${fmt(round(totals.volumetricAir, 2))} kg\n` +
      `น้ำหนักคิดเงินทะเล W/M: ${fmt(round(totals.chargeableSea, 2))} kg`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const exportCsv = () => {
    const csv = cbmToCsv(lines, unit, airDivisor);
    downloadText(`cbm-${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv");
  };

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">คำนวณ CBM — ปริมาตร/คิว</h1>
          <p className="text-xs text-neutral-500">
            กรอก กว้าง × ยาว × สูง × จำนวนกล่อง → ได้ CBM รวม + น้ำหนักเชิงปริมาตรสำหรับคิดค่าระวาง
          </p>
        </div>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← กลับหน้าหลัก
        </Link>
      </header>

      <section className="flex-1 space-y-6 p-6">
        {/* ตัวเลือกหน่วย */}
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-black/10 p-4 dark:border-white/10">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-neutral-500">หน่วยขนาด</span>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as DimUnit)}
              className="rounded-md border border-black/15 bg-transparent px-2 py-1 text-sm outline-none dark:border-white/15"
            >
              {UNITS.map((u) => (
                <option key={u} value={u} className="text-black">
                  {DIM_UNIT_LABEL[u]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-neutral-500">ตัวหารน้ำหนักปริมาตร</span>
            <select
              value={airDivisor}
              onChange={(e) => setAirDivisor(Number(e.target.value))}
              className="rounded-md border border-black/15 bg-transparent px-2 py-1 text-sm outline-none dark:border-white/15"
            >
              {AIR_DIVISORS.map((d) => (
                <option key={d.value} value={d.value} className="text-black">
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* ตารางกรอกรายการ */}
        <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead className="bg-neutral-50 text-left text-xs text-neutral-500 dark:bg-neutral-900">
              <tr>
                <th className="px-3 py-2 font-medium">รายการ</th>
                <th className="px-3 py-2 font-medium">กว้าง</th>
                <th className="px-3 py-2 font-medium">ยาว</th>
                <th className="px-3 py-2 font-medium">สูง</th>
                <th className="px-3 py-2 font-medium">จำนวนกล่อง</th>
                <th className="px-3 py-2 font-medium">น้ำหนัก/กล่อง (kg)</th>
                <th className="px-3 py-2 text-right font-medium">CBM รวม</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((ln, i) => {
                const r = computeLine(ln, unit);
                return (
                  <tr key={ln.id} className="border-t border-black/5 dark:border-white/5">
                    <td className="px-3 py-1.5">
                      <input
                        value={ln.name}
                        onChange={(e) => update(ln.id, { name: e.target.value })}
                        placeholder={`รายการ ${i + 1}`}
                        className="w-32 rounded border border-transparent bg-transparent px-1.5 py-1 outline-none focus:border-black/20 dark:focus:border-white/20"
                      />
                    </td>
                    {(["w", "l", "h", "qty", "weight"] as const).map((k) => (
                      <td key={k} className="px-3 py-1.5">
                        <input
                          inputMode="decimal"
                          value={ln[k] ?? ""}
                          onChange={(e) => update(ln.id, { [k]: num(e.target.value) })}
                          placeholder="0"
                          className="w-20 rounded border border-black/10 bg-transparent px-1.5 py-1 text-right outline-none focus:border-black/30 dark:border-white/10 dark:focus:border-white/30"
                        />
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                      {r.complete ? fmt(round(r.cbmTotal, 4), 4) : <span className="text-neutral-300 dark:text-neutral-600">—</span>}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => remove(ln.id)}
                        aria-label="ลบแถว"
                        className="text-neutral-300 transition hover:text-rose-500 dark:text-neutral-600"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={addRow}
            className="rounded-lg border border-black/15 px-3 py-1.5 text-sm transition hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
          >
            + เพิ่มรายการ
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded-lg border border-black/10 px-3 py-1.5 text-sm text-neutral-500 transition hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
          >
            ล้างทั้งหมด
          </button>
        </div>

        {/* สรุปรวม */}
        <div className="rounded-xl border border-black/10 p-5 dark:border-white/10">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Stat label="รวม CBM (คิว)" value={fmt(round(totals.totalCbm, 4), 4)} accent />
            <Stat label="จำนวนกล่อง" value={fmt(totals.totalCartons, 0)} />
            <Stat label="น้ำหนักรวม (kg)" value={totals.totalWeight > 0 ? fmt(round(totals.totalWeight, 2)) : "—"} />
            <Stat
              label={`น้ำหนักเชิงปริมาตร air ÷${airDivisor} (kg)`}
              value={fmt(round(totals.volumetricAir, 2))}
            />
            <Stat
              label="น้ำหนักคิดเงินทะเล W/M (kg)"
              value={fmt(round(totals.chargeableSea, 2))}
              hint="max(น้ำหนักจริง, CBM×1000)"
            />
            <Stat label="รายการที่คำนวณได้" value={`${totals.lines} รายการ`} />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copySummary}
              disabled={!hasData}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
            >
              {copied ? "คัดลอกแล้ว ✓" : "คัดลอกสรุป"}
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={!hasData}
              className="rounded-lg border border-black/15 px-4 py-2 text-sm font-medium transition hover:bg-black/5 disabled:opacity-40 dark:border-white/15 dark:hover:bg-white/5"
            >
              ดาวน์โหลด CSV
            </button>
          </div>
        </div>

        <p className="text-xs text-neutral-400">
          CBM = (กว้าง × ยาว × สูง เป็นเมตร) × จำนวนกล่อง · W/M ทะเลคิด 1 CBM = 1,000 kg
        </p>
      </section>
    </main>
  );
}

function Stat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-black/5 bg-black/[0.015] p-3 dark:border-white/5 dark:bg-white/[0.02]">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className={`mt-1 tabular-nums ${accent ? "text-2xl font-semibold text-emerald-600 dark:text-emerald-400" : "text-xl font-semibold"}`}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[10px] text-neutral-400">{hint}</div>}
    </div>
  );
}

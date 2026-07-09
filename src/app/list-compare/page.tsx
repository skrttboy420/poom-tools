"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { compareText, compareToCsv, type CompareResult } from "@/lib/listcompare/listcompare";
import { downloadText } from "@/lib/reconcile/export";

const SAMPLE_A = `KY001
KY002
KY003
KY004`;
const SAMPLE_B = `KY002
KY003
KY005`;

type Bucket = "onlyA" | "both" | "onlyB";

// class แบบ static เต็ม ๆ (Tailwind v4 JIT อ่านจาก literal เท่านั้น — ห้ามประกอบ string สี)
const BUCKETS: { id: Bucket; label: string; chip: string; title: string }[] = [
  {
    id: "onlyA",
    label: "เฉพาะ A",
    chip: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
    title: "text-sky-700 dark:text-sky-300",
  },
  {
    id: "both",
    label: "มีทั้งคู่",
    chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    title: "text-emerald-700 dark:text-emerald-300",
  },
  {
    id: "onlyB",
    label: "เฉพาะ B",
    chip: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    title: "text-amber-700 dark:text-amber-300",
  },
];

function List({ items, titleClass }: { items: string[]; titleClass: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(items.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ข้าม */
    }
  };
  return (
    <div className="flex flex-col rounded-xl border border-black/10 dark:border-white/10">
      <div className="flex items-center justify-between border-b border-black/10 px-3 py-1.5 text-xs dark:border-white/10">
        <span className={`font-medium ${titleClass}`}>{items.length} รายการ</span>
        <button
          onClick={copy}
          disabled={items.length === 0}
          className="rounded border border-black/15 px-2 py-0.5 hover:bg-black/5 disabled:opacity-40 dark:border-white/15 dark:hover:bg-white/5"
        >
          {copied ? "คัดลอกแล้ว ✓" : "คัดลอก"}
        </button>
      </div>
      <ul className="max-h-72 overflow-auto p-2 font-mono text-sm">
        {items.length === 0 ? (
          <li className="px-1 py-2 text-center text-neutral-400">—</li>
        ) : (
          items.map((x, i) => (
            <li key={i} className="truncate px-1 py-0.5" title={x}>
              {x}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

export default function ListComparePage() {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [trim, setTrim] = useState(true);
  const [ci, setCi] = useState(false);

  const result: CompareResult = useMemo(
    () => compareText(a, b, { trim, caseInsensitive: ci }),
    [a, b, trim, ci],
  );

  const dl = () => downloadText("list-compare.csv", compareToCsv(result), "text/csv");

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">เทียบ 2 รายการ 🔁</h1>
          <p className="text-xs text-neutral-500">
            วาง 2 ลิสต์ (ทีละบรรทัด) เช่น tracking จาก packing list ↔ จาก Pacred/MOMO → รู้ทันทีว่าตัวไหนเฉพาะ A / เฉพาะ B / มีทั้งคู่
          </p>
        </div>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← กลับหน้าหลัก
        </Link>
      </header>

      <section className="mx-auto w-full max-w-6xl flex-1 space-y-4 p-6">
        {/* options */}
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex cursor-pointer items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
            <input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} />
            ตัดช่องว่างหัวท้าย
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
            <input type="checkbox" checked={ci} onChange={(e) => setCi(e.target.checked)} />
            ไม่สนพิมพ์เล็ก/ใหญ่
          </label>
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => {
                setA(SAMPLE_A);
                setB(SAMPLE_B);
              }}
              className="rounded-md border border-black/15 px-3 py-1.5 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
            >
              ตัวอย่าง
            </button>
            <button
              onClick={() => {
                setA("");
                setB("");
              }}
              className="rounded-md border border-black/15 px-3 py-1.5 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
            >
              ล้าง
            </button>
            <button
              onClick={() => {
                setA(b);
                setB(a);
              }}
              className="rounded-md border border-black/15 px-3 py-1.5 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
              title="สลับฝั่ง A ↔ B"
            >
              ↔ สลับ A/B
            </button>
          </div>
        </div>

        {/* inputs */}
        <div className="grid gap-4 md:grid-cols-2">
          {[
            { label: "รายการ A", val: a, set: setA, dup: result.dupA, count: result.countA },
            { label: "รายการ B", val: b, set: setB, dup: result.dupB, count: result.countB },
          ].map((f) => (
            <div key={f.label} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-neutral-500">
                <span>{f.label}</span>
                <span>
                  {f.count} รายการไม่ซ้ำ
                  {f.dup > 0 && <span className="ml-1 text-amber-600 dark:text-amber-400">· ซ้ำ {f.dup}</span>}
                </span>
              </div>
              <textarea
                value={f.val}
                onChange={(e) => f.set(e.target.value)}
                placeholder="วางรายการทีละบรรทัด..."
                spellCheck={false}
                className="h-56 w-full resize-none rounded-xl border border-black/15 bg-transparent p-3 font-mono text-sm outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
              />
            </div>
          ))}
        </div>

        {/* summary chips */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {BUCKETS.map((bkt) => (
            <span key={bkt.id} className={`rounded-full px-3 py-1 font-medium ${bkt.chip}`}>
              {bkt.label} <span className="tabular-nums">{result[bkt.id].length}</span>
            </span>
          ))}
          <button
            onClick={dl}
            disabled={result.countA === 0 && result.countB === 0}
            className="ml-auto rounded-md bg-emerald-600 px-3 py-1.5 font-medium text-white transition hover:bg-emerald-700 disabled:opacity-40"
          >
            ↓ ดาวน์โหลดผล (CSV)
          </button>
        </div>

        {/* result columns */}
        <div className="grid gap-4 md:grid-cols-3">
          {BUCKETS.map((bkt) => (
            <div key={bkt.id} className="space-y-1.5">
              <div className={`text-sm font-medium ${bkt.title}`}>{bkt.label}</div>
              <List items={result[bkt.id]} titleClass={bkt.title} />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

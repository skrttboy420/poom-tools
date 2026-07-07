"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { parseList, mulberry32, shuffle, pickN, splitGroups } from "@/lib/random/pick";

const SAMPLE = `สมชาย
สมหญิง
สมปอง
KY001
KY002
TU-A
TU-B`;

type Mode = "pick" | "shuffle" | "groups";

const MODES: { id: Mode; label: string }[] = [
  { id: "pick", label: "สุ่มผู้โชคดี" },
  { id: "shuffle", label: "สลับลำดับทั้งหมด" },
  { id: "groups", label: "แบ่งเป็นกลุ่ม" },
];

interface Result {
  kind: Mode;
  flat?: string[]; // pick / shuffle
  groups?: string[][]; // groups
}

export default function RandomPage() {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<Mode>("pick");
  const [count, setCount] = useState("1");
  const [numGroups, setNumGroups] = useState("2");
  const [dedupe, setDedupe] = useState(true);
  const [useSeed, setUseSeed] = useState(false);
  const [seed, setSeed] = useState("42");
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);

  const items = useMemo(() => parseList(text, { dedupe }), [text, dedupe]);

  const run = () => {
    if (items.length === 0) {
      setResult(null);
      return;
    }
    // ถ้าใส่ seed → deterministic (ทำผลเดิมซ้ำได้) · ไม่งั้นสุ่มจริงจาก seed แบบสด
    const s = useSeed ? Number(seed) || 0 : (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
    const rng = mulberry32(s);
    if (mode === "pick") {
      setResult({ kind: "pick", flat: pickN(items, Number(count) || 0, rng) });
    } else if (mode === "shuffle") {
      setResult({ kind: "shuffle", flat: shuffle(items, rng) });
    } else {
      setResult({ kind: "groups", groups: splitGroups(items, Number(numGroups) || 1, rng) });
    }
  };

  const resultText = useMemo(() => {
    if (!result) return "";
    if (result.groups) {
      return result.groups
        .map((g, i) => `— กลุ่ม ${i + 1} (${g.length}) —\n${g.join("\n")}`)
        .join("\n\n");
    }
    return (result.flat ?? []).join("\n");
  }, [result]);

  const copy = async () => {
    if (!resultText) return;
    try {
      await navigator.clipboard.writeText(resultText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard บล็อค — ข้าม */
    }
  };

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">สุ่มรายชื่อ 🎲</h1>
          <p className="text-xs text-neutral-500">
            วางรายชื่อ (ทีละบรรทัด) → สุ่มผู้โชคดี / สลับลำดับ / แบ่งกลุ่มเท่า ๆ กัน · ใส่ seed เพื่อทำผลเดิมซ้ำได้
          </p>
        </div>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← กลับหน้าหลัก
        </Link>
      </header>

      <section className="mx-auto w-full max-w-4xl flex-1 space-y-4 p-6">
        <div className="grid gap-4 md:grid-cols-2">
          {/* input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-neutral-500">
              <span>รายชื่อ (ทีละบรรทัด) — {items.length} รายการ</span>
              <div className="flex gap-2">
                <button onClick={() => setText(SAMPLE)} className="hover:underline">ตัวอย่าง</button>
                <button onClick={() => { setText(""); setResult(null); }} className="hover:underline">ล้าง</button>
              </div>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="ชื่อ 1&#10;ชื่อ 2&#10;ชื่อ 3 ..."
              spellCheck={false}
              className="h-72 w-full resize-none rounded-xl border border-black/15 bg-transparent p-3 font-mono text-sm outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
            />
            <label className="flex cursor-pointer items-center gap-1.5 text-sm text-neutral-600 dark:text-neutral-400">
              <input type="checkbox" checked={dedupe} onChange={(e) => setDedupe(e.target.checked)} />
              ตัดรายชื่อซ้ำ
            </label>
          </div>

          {/* controls + result */}
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                    mode === m.id
                      ? "border-transparent bg-neutral-900 text-white dark:bg-white dark:text-black"
                      : "border-black/15 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {mode === "pick" && (
              <label className="flex items-center gap-2 text-sm">
                <span className="text-neutral-500">สุ่มกี่คน:</span>
                <input type="number" min={1} value={count} onChange={(e) => setCount(e.target.value)}
                  className="w-24 rounded-md border border-black/15 bg-transparent px-2 py-1 outline-none focus:border-black/40 dark:border-white/15" />
              </label>
            )}
            {mode === "groups" && (
              <label className="flex items-center gap-2 text-sm">
                <span className="text-neutral-500">จำนวนกลุ่ม:</span>
                <input type="number" min={1} value={numGroups} onChange={(e) => setNumGroups(e.target.value)}
                  className="w-24 rounded-md border border-black/15 bg-transparent px-2 py-1 outline-none focus:border-black/40 dark:border-white/15" />
              </label>
            )}

            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex cursor-pointer items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
                <input type="checkbox" checked={useSeed} onChange={(e) => setUseSeed(e.target.checked)} />
                ใช้ seed (ทำซ้ำได้)
              </label>
              {useSeed && (
                <input type="number" value={seed} onChange={(e) => setSeed(e.target.value)}
                  className="w-24 rounded-md border border-black/15 bg-transparent px-2 py-1 outline-none focus:border-black/40 dark:border-white/15" />
              )}
            </div>

            <button
              type="button"
              onClick={run}
              disabled={items.length === 0}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              🎲 สุ่ม
            </button>

            {result && (
              <div className="space-y-2 rounded-xl border border-black/10 p-3 dark:border-white/10">
                <div className="flex items-center justify-between text-xs text-neutral-500">
                  <span>ผลลัพธ์</span>
                  <button onClick={copy} className="rounded-md border border-black/15 px-2 py-0.5 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5">
                    {copied ? "คัดลอกแล้ว ✓" : "คัดลอก"}
                  </button>
                </div>
                {result.groups ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {result.groups.map((g, i) => (
                      <div key={i} className="rounded-lg border border-black/10 p-2 dark:border-white/10">
                        <div className="mb-1 text-xs font-medium text-neutral-500">กลุ่ม {i + 1} ({g.length})</div>
                        <ul className="space-y-0.5 text-sm">
                          {g.map((x, j) => <li key={j}>{x}</li>)}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : (
                  <ol className="list-decimal space-y-0.5 pl-6 text-sm">
                    {(result.flat ?? []).map((x, i) => <li key={i}>{x}</li>)}
                  </ol>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

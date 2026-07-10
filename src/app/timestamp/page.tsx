"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  parseTimestamp,
  nowResult,
  formatRelative,
  UNIT_LABEL,
  type EpochUnit,
  type TsResult,
} from "@/lib/timestamp/timestamp";

// นาฬิกาสดผ่าน external store — เลี่ยงกฎ set-state-in-effect ของ React 19
// + hydration ตรง (server snapshot = 0 → ไม่ render เวลาตอน SSR)
let clockNow = Date.now();
const clockSubs = new Set<() => void>();
let clockTimer: ReturnType<typeof setInterval> | null = null;
function subscribeClock(cb: () => void): () => void {
  clockSubs.add(cb);
  if (clockTimer === null) {
    clockTimer = setInterval(() => {
      clockNow = Date.now();
      clockSubs.forEach((f) => f());
    }, 1000);
  }
  return () => {
    clockSubs.delete(cb);
    if (clockSubs.size === 0 && clockTimer !== null) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
  };
}
const getClockSnapshot = () => clockNow;
const getClockServerSnapshot = () => 0;

const SAMPLES = [
  { label: "epoch วินาที (10 หลัก)", value: "1700000000" },
  { label: "epoch มิลลิ (13 หลัก)", value: "1700000000000" },
  { label: "ข้อความ ISO", value: "2025-07-10T08:30:00Z" },
];

// แถวผลลัพธ์: ป้าย + ค่า + ปุ่มคัดลอก
function ResultRow({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    } catch {
      /* clipboard บล็อค — ข้าม */
    }
  };
  return (
    <div className="flex items-center justify-between gap-3 border-b border-black/5 py-2 last:border-0 dark:border-white/5">
      <span className="w-40 shrink-0 text-xs text-neutral-500">{label}</span>
      <span className={`flex-1 break-all text-sm ${mono ? "font-mono" : ""}`}>{value || "—"}</span>
      <button
        onClick={copy}
        disabled={!value}
        className="shrink-0 text-xs text-neutral-400 hover:text-neutral-700 disabled:opacity-30 dark:hover:text-neutral-200"
      >
        {copied ? "✓" : "คัดลอก"}
      </button>
    </div>
  );
}

export default function TimestampPage() {
  const [input, setInput] = useState("");
  const [unit, setUnit] = useState<EpochUnit>("auto");
  // now = 0 ตอน SSR/hydration แรก (ยังไม่ render เวลา) → หลัง mount ได้ค่าจริงและขยับทุกวินาที
  const now = useSyncExternalStore(subscribeClock, getClockSnapshot, getClockServerSnapshot);

  const result: TsResult | null = useMemo(() => {
    if (input.trim() === "") return null;
    return parseTimestamp(input, unit);
  }, [input, unit]);

  const clock = useMemo(() => (now === 0 ? null : nowResult(now)), [now]);
  const relative =
    result && result.ok && now !== 0 ? formatRelative(result.ms, now) : "";

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">แปลงเวลา Unix ⏱️</h1>
          <p className="text-xs text-neutral-500">
            แปลง <b>epoch</b> (วินาที/มิลลิ/ไมโคร) ↔ วันเวลาจริง — เช็ค timestamp ใน payload MOMO API / แถว Supabase (created_at/updated_at)
          </p>
        </div>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← กลับหน้าหลัก
        </Link>
      </header>

      <section className="flex-1 space-y-5 p-6">
        {/* input + หน่วย */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="วาง epoch หรือ วันที่ เช่น 1700000000 หรือ 2025-07-10T08:30:00Z"
              spellCheck={false}
              className="min-w-64 flex-1 rounded-lg border border-black/15 bg-transparent px-3 py-2 font-mono text-sm outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
            />
            <button
              onClick={() => {
                setInput(String(Date.now()));
                setUnit("ms");
              }}
              className="rounded-lg border border-black/15 px-3 py-2 text-sm hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
            >
              ⏱️ ตอนนี้
            </button>
            <button
              onClick={() => setInput("")}
              className="rounded-lg border border-black/15 px-3 py-2 text-sm hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
            >
              ล้าง
            </button>
          </div>

          {/* หน่วย epoch */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-neutral-500">หน่วย (เมื่อเป็นตัวเลข):</span>
            {(["auto", "s", "ms", "us"] as EpochUnit[]).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnit(u)}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  unit === u
                    ? "border-transparent bg-emerald-600 text-white"
                    : "border-black/15 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
                }`}
              >
                {UNIT_LABEL[u]}
              </button>
            ))}
          </div>

          {/* ตัวอย่าง */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
            <span>ตัวอย่าง:</span>
            {SAMPLES.map((s) => (
              <button
                key={s.value}
                onClick={() => {
                  setInput(s.value);
                  setUnit("auto");
                }}
                className="rounded-full border border-black/10 px-2.5 py-0.5 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* ผลลัพธ์ */}
        {result && !result.ok && (
          <p className="rounded-md border border-red-500/30 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
            {result.error}
          </p>
        )}

        {result && result.ok && (
          <div className="space-y-4">
            {/* การ์ดหลัก: ตีความ + relative */}
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-50 px-4 py-3 dark:bg-emerald-950/20">
              <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs text-white">
                {result.detected}
              </span>
              <span className="text-sm font-medium">{relative}</span>
            </div>

            {/* UTC */}
            <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
              <h2 className="mb-2 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                UTC (เวลามาตรฐาน — ยืนยันได้)
              </h2>
              <ResultRow label="ISO 8601" value={result.iso} />
              <ResultRow label="อ่านง่าย (UTC)" value={result.utc} />
              <ResultRow label="วันในสัปดาห์" value={result.utcWeekday} mono={false} />
            </div>

            {/* Local */}
            <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
              <h2 className="mb-2 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                เวลาเครื่องนี้ ({result.localOffset})
              </h2>
              <ResultRow label="อ่านง่าย (local)" value={result.local} />
              <ResultRow label="วันในสัปดาห์" value={result.localWeekday} mono={false} />
            </div>

            {/* epoch หน่วยต่าง ๆ */}
            <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
              <h2 className="mb-2 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                epoch
              </h2>
              <ResultRow label="วินาที (s)" value={String(result.unixS)} />
              <ResultRow label="มิลลิวินาที (ms)" value={String(result.unixMs)} />
            </div>
          </div>
        )}

        {/* นาฬิกาปัจจุบันสด — ไว้ใช้อ้างอิง/คัดลอก (render หลัง mount เท่านั้น) */}
        {clock && (
          <div className="rounded-lg border border-black/10 bg-neutral-50 p-4 dark:border-white/10 dark:bg-neutral-900">
            <h2 className="mb-2 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
              เวลาปัจจุบัน (สด)
            </h2>
            <ResultRow label="epoch วินาที" value={String(clock.unixS)} />
            <ResultRow label="epoch มิลลิ" value={String(clock.unixMs)} />
            <ResultRow label="ISO 8601" value={clock.iso} />
            <ResultRow label={`local (${clock.localOffset})`} value={clock.local} />
          </div>
        )}
      </section>
    </main>
  );
}

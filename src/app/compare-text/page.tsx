"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { diffLines, diffToText, type LineKind } from "@/lib/textdiff/textdiff";

const SAMPLE_A = `KY001
KY002
KY003
KY004
TU-A
340.5`;
const SAMPLE_B = `KY001
KY002
KY005
KY004
TU-A
341.0`;

const KIND_META: Record<LineKind, { sign: string; row: string; sign_cls: string }> = {
  same: { sign: " ", row: "", sign_cls: "text-neutral-300 dark:text-neutral-600" },
  added: { sign: "+", row: "bg-emerald-50 dark:bg-emerald-950/25", sign_cls: "text-emerald-600" },
  removed: { sign: "-", row: "bg-red-50 dark:bg-red-950/25", sign_cls: "text-red-500" },
};

export default function CompareTextPage() {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [trim, setTrim] = useState(true);
  const [ignoreBlank, setIgnoreBlank] = useState(false);
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [copied, setCopied] = useState(false);

  const result = useMemo(
    () => diffLines(a, b, { ignoreCase, trim, ignoreBlank }),
    [a, b, ignoreCase, trim, ignoreBlank],
  );

  const shown = useMemo(
    () => (onlyDiff ? result.lines.filter((l) => l.kind !== "same") : result.lines),
    [result, onlyDiff],
  );

  const s = result.stats;
  const diffCount = s.added + s.removed;
  const touched = a !== "" || b !== "";

  const loadSample = () => {
    setA(SAMPLE_A);
    setB(SAMPLE_B);
  };
  const copyDiff = async () => {
    try {
      await navigator.clipboard.writeText(diffToText(result.lines));
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
          <h1 className="text-lg font-semibold">เทียบข้อความ 🔀</h1>
          <p className="text-xs text-neutral-500">
            วางข้อความ 2 ชุด → เทียบทีละบรรทัด เห็นบรรทัด <b>เพิ่ม / หาย</b> (เช่น เทียบ list tracking/ตู้ 2 รอบ, config เก่า↔ใหม่)
          </p>
        </div>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← กลับหน้าหลัก
        </Link>
      </header>

      <section className="flex-1 space-y-4 p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Pane label="ข้อความ A (ซ้าย)" value={a} onChange={setA} onClear={() => setA("")} />
          <Pane label="ข้อความ B (ขวา)" value={b} onChange={setB} onClear={() => setB("")} />
        </div>

        {/* ตัวเลือก */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <Toggle checked={trim} onChange={setTrim} label="ตัดช่องว่างหัว-ท้าย" />
          <Toggle checked={ignoreCase} onChange={setIgnoreCase} label="ไม่สนพิมพ์เล็ก/ใหญ่" />
          <Toggle checked={ignoreBlank} onChange={setIgnoreBlank} label="ข้ามบรรทัดว่าง" />
          <button onClick={loadSample} className="ml-auto rounded-md border border-black/15 px-3 py-1.5 text-xs hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5">
            ตัวอย่าง
          </button>
        </div>

        {touched && (
          <>
            {/* สรุป + filter */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                + เพิ่ม {s.added}
              </span>
              <span className="rounded-full bg-red-100 px-3 py-1 font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300">
                − หาย {s.removed}
              </span>
              <span className="rounded-full bg-neutral-100 px-3 py-1 font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                เหมือน {s.same}
              </span>
              {diffCount === 0 && <span className="text-emerald-600">✓ เหมือนกันทุกบรรทัด</span>}
              <label className="ml-auto flex items-center gap-1.5 text-neutral-500">
                <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} />
                โชว์เฉพาะที่ต่าง
              </label>
              <button
                onClick={copyDiff}
                disabled={!touched}
                className="rounded-md border border-black/15 px-3 py-1.5 hover:bg-black/5 disabled:opacity-40 dark:border-white/15 dark:hover:bg-white/5"
              >
                {copied ? "คัดลอกแล้ว ✓" : "คัดลอก diff"}
              </button>
            </div>

            {result.capped && (
              <p className="rounded-md border border-amber-500/30 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                ข้อความยาวเกิน — เทียบแค่ 2000 บรรทัดแรกของแต่ละฝั่ง
              </p>
            )}

            {/* ตาราง diff */}
            <div className="rounded-xl border border-black/10 dark:border-white/10">
              <div className="border-b border-black/10 px-3 py-2 text-xs text-neutral-500 dark:border-white/10">
                แสดง {shown.length} บรรทัด
              </div>
              <div className="max-h-[55vh] overflow-auto font-mono text-xs">
                <table className="w-full">
                  <tbody>
                    {shown.map((l, i) => {
                      const meta = KIND_META[l.kind];
                      return (
                        <tr key={i} className={meta.row}>
                          <td className="select-none px-2 py-0.5 text-right text-neutral-400 tabular-nums">{l.aLine ?? ""}</td>
                          <td className="select-none px-2 py-0.5 text-right text-neutral-400 tabular-nums">{l.bLine ?? ""}</td>
                          <td className={`select-none px-1 py-0.5 text-center font-bold ${meta.sign_cls}`}>{meta.sign}</td>
                          <td className="whitespace-pre-wrap break-all py-0.5 pr-3">{l.text === "" ? " " : l.text}</td>
                        </tr>
                      );
                    })}
                    {shown.length === 0 && (
                      <tr>
                        <td className="px-3 py-4 text-center text-neutral-400">ไม่มีบรรทัด</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function Pane({
  label,
  value,
  onChange,
  onClear,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span>{label}</span>
        <button onClick={onClear} className="hover:underline">
          ล้าง
        </button>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="วางข้อความที่นี่ (ทีละบรรทัด)..."
        spellCheck={false}
        className="h-64 w-full resize-y rounded-lg border border-black/15 bg-transparent p-3 font-mono text-sm outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
      />
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

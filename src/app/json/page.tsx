"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatJson, minifyJson, type IndentMode, type JsonResult } from "@/lib/json/format";
import { downloadText } from "@/lib/reconcile/export";

const SAMPLE = `{"tracking":"KY001","weight":12.5,"cbm":0.30,"boxes":[{"no":1,"kg":6},{"no":2,"kg":6.5}],"container":"MSKU1234567"}`;

const INDENT_OPTIONS: { id: IndentMode; label: string }[] = [
  { id: "2", label: "2 ช่อง" },
  { id: "4", label: "4 ช่อง" },
  { id: "tab", label: "Tab" },
];

export default function JsonPage() {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"pretty" | "mini">("pretty");
  const [indent, setIndent] = useState<IndentMode>("2");
  const [sortKeys, setSortKeys] = useState(false);
  const [copied, setCopied] = useState(false);

  const result: JsonResult | null = useMemo(() => {
    if (!input.trim()) return null;
    return mode === "mini" ? minifyJson(input, sortKeys) : formatJson(input, indent, sortKeys);
  }, [input, mode, indent, sortKeys]);

  const output = result?.ok ? result.output : "";

  const copy = async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* เงียบไว้ ถ้า clipboard ถูกบล็อก */
    }
  };

  const save = () => {
    if (output) downloadText("formatted.json", output, "application/json");
  };

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">จัดรูปแบบ JSON</h1>
          <p className="text-xs text-neutral-500">
            วาง JSON → จัดให้อ่านง่าย (beautify) หรือย่อ (minify) · จับ JSON เสียพร้อมบอกบรรทัด/คอลัมน์
          </p>
        </div>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← กลับหน้าหลัก
        </Link>
      </header>

      <section className="mx-auto w-full max-w-5xl flex-1 space-y-4 p-6">
        {/* แถบควบคุม */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex overflow-hidden rounded-lg border border-black/15 dark:border-white/15">
            <button
              type="button"
              onClick={() => setMode("pretty")}
              className={`px-4 py-1.5 text-sm transition ${
                mode === "pretty" ? "bg-neutral-900 text-white dark:bg-white dark:text-black" : "hover:bg-black/5 dark:hover:bg-white/5"
              }`}
            >
              จัดรูป
            </button>
            <button
              type="button"
              onClick={() => setMode("mini")}
              className={`border-l border-black/15 px-4 py-1.5 text-sm transition dark:border-white/15 ${
                mode === "mini" ? "bg-neutral-900 text-white dark:bg-white dark:text-black" : "hover:bg-black/5 dark:hover:bg-white/5"
              }`}
            >
              ย่อ
            </button>
          </div>

          {mode === "pretty" && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-neutral-500">เว้นวรรค:</span>
              {INDENT_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setIndent(o.id)}
                  className={`rounded-md border px-2.5 py-1 text-xs transition ${
                    indent === o.id
                      ? "border-transparent bg-neutral-900 text-white dark:bg-white dark:text-black"
                      : "border-black/15 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}

          <label className="flex cursor-pointer items-center gap-1.5 text-sm">
            <input type="checkbox" checked={sortKeys} onChange={(e) => setSortKeys(e.target.checked)} />
            เรียง key (A→Z)
          </label>

          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={() => setInput(SAMPLE)}
              className="rounded-lg border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
            >
              ตัวอย่าง
            </button>
            <button
              type="button"
              onClick={() => setInput("")}
              className="rounded-lg border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
            >
              ล้าง
            </button>
          </div>
        </div>

        {/* input + output */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <span className="block text-xs text-neutral-500">วาง JSON ที่นี่</span>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder='{"tracking":"KY001", ...}'
              spellCheck={false}
              className="h-[55vh] w-full resize-none rounded-xl border border-black/15 bg-transparent p-3 font-mono text-xs outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="block text-xs text-neutral-500">ผลลัพธ์</span>
              {result?.ok && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={copy}
                    className="rounded-md border border-black/15 px-2.5 py-1 text-xs hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
                  >
                    {copied ? "คัดลอกแล้ว ✓" : "คัดลอก"}
                  </button>
                  <button
                    type="button"
                    onClick={save}
                    className="rounded-md border border-black/15 px-2.5 py-1 text-xs hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
                  >
                    ดาวน์โหลด .json
                  </button>
                </div>
              )}
            </div>

            {result && !result.ok ? (
              <div className="flex h-[55vh] flex-col rounded-xl border border-red-300 bg-red-50 p-3 text-sm dark:border-red-900/50 dark:bg-red-950/20">
                <span className="font-semibold text-red-700 dark:text-red-300">JSON ไม่ถูกต้อง</span>
                <span className="mt-1 text-red-600 dark:text-red-400">{result.error}</span>
                {(result.line || result.pos !== undefined) && (
                  <span className="mt-1 text-xs text-red-500">
                    {result.line
                      ? `ราวบรรทัด ${result.line}${result.col ? ` คอลัมน์ ${result.col}` : ""}`
                      : `ราวตำแหน่งตัวอักษรที่ ${result.pos}`}
                  </span>
                )}
              </div>
            ) : (
              <textarea
                readOnly
                value={output}
                placeholder="ผลลัพธ์จะขึ้นที่นี่"
                spellCheck={false}
                className="h-[55vh] w-full resize-none rounded-xl border border-black/15 bg-black/[0.02] p-3 font-mono text-xs outline-none dark:border-white/15 dark:bg-white/[0.03]"
              />
            )}
          </div>
        </div>

        {/* สถิติ */}
        {result?.ok && (
          <div className="flex flex-wrap gap-2 text-xs">
            <Chip label="ชนิด root" value={result.stats.rootType} />
            {result.stats.topLevelCount !== null && (
              <Chip
                label={result.stats.rootType === "array" ? "item ชั้นบน" : "key ชั้นบน"}
                value={String(result.stats.topLevelCount)}
              />
            )}
            <Chip label="key ทั้งหมด" value={String(result.stats.totalKeys)} />
            <Chip label="ความลึก" value={String(result.stats.maxDepth)} />
            <Chip label="ขนาด" value={`${result.stats.inputChars} → ${result.stats.outputChars} ตัวอักษร`} />
          </div>
        )}
      </section>
    </main>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-full border border-black/10 bg-black/[0.03] px-3 py-1 dark:border-white/10 dark:bg-white/[0.04]">
      <span className="text-neutral-500">{label}: </span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  );
}

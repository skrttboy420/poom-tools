"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  runEncode,
  ENC_MODE_LABEL,
  type EncMode,
  type EncDir,
} from "@/lib/encode/encode";

const SAMPLES: Record<EncMode, string> = {
  base64: "packing list ตู้ TU-A · 12 กล่อง",
  url: "https://pacred.app/search?q=พัสดุ ด่วน&page=2",
};

export default function EncodePage() {
  const [mode, setMode] = useState<EncMode>("base64");
  const [dir, setDir] = useState<EncDir>("encode");
  const [urlSafe, setUrlSafe] = useState(false);
  const [component, setComponent] = useState(true);
  const [input, setInput] = useState("");
  const [copied, setCopied] = useState(false);

  const result = useMemo(
    () => runEncode(input, mode, dir, { urlSafe, component }),
    [input, mode, dir, urlSafe, component],
  );

  const swap = () => {
    // เอาผลลัพธ์กลับไปเป็น input แล้วสลับทิศ (เข้า↔ถอด) — เช็ค round-trip เร็ว ๆ
    if (!result.ok) return;
    setInput(result.output);
    setDir((d) => (d === "encode" ? "decode" : "encode"));
  };

  const copyOut = async () => {
    if (!result.output) return;
    try {
      await navigator.clipboard.writeText(result.output);
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
          <h1 className="text-lg font-semibold">เข้ารหัส / ถอดรหัส 🔡</h1>
          <p className="text-xs text-neutral-500">
            <b>Base64</b> (รองรับ UTF-8/ไทย + Base64URL) และ <b>URL encode/decode</b> — เช็ค payload / token / escape ค่าใส่ URL
          </p>
        </div>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← กลับหน้าหลัก
        </Link>
      </header>

      <section className="flex-1 space-y-4 p-6">
        {/* แถบเลือกโหมด + ทิศทาง */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex gap-1.5">
            {(["base64", "url"] as EncMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-full border px-4 py-1.5 text-sm transition ${
                  mode === m
                    ? "border-transparent bg-neutral-900 text-white dark:bg-white dark:text-black"
                    : "border-black/15 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
                }`}
              >
                {ENC_MODE_LABEL[m]}
              </button>
            ))}
          </div>

          <div className="flex overflow-hidden rounded-full border border-black/15 dark:border-white/15">
            {(["encode", "decode"] as EncDir[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDir(d)}
                className={`px-4 py-1.5 text-sm transition ${
                  dir === d
                    ? "bg-emerald-600 text-white"
                    : "hover:bg-black/5 dark:hover:bg-white/5"
                }`}
              >
                {d === "encode" ? "เข้ารหัส →" : "← ถอดรหัส"}
              </button>
            ))}
          </div>

          {/* ตัวเลือกเฉพาะโหมด */}
          {mode === "base64" ? (
            <label className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
              <input type="checkbox" checked={urlSafe} onChange={(e) => setUrlSafe(e.target.checked)} />
              Base64URL (<code>- _</code> ไม่มี padding)
            </label>
          ) : (
            <label className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
              <input type="checkbox" checked={component} onChange={(e) => setComponent(e.target.checked)} />
              encodeURIComponent (escape ทั้งค่า — เอา checkbox ออก = คงโครง URL)
            </label>
          )}
        </div>

        {/* 2 ช่อง: input ↔ output */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-neutral-500">
              <span>{dir === "encode" ? "ข้อความต้นฉบับ" : "ข้อความที่เข้ารหัสแล้ว"}</span>
              <div className="flex gap-2">
                <button onClick={() => setInput(SAMPLES[mode])} className="hover:underline">
                  ตัวอย่าง
                </button>
                <button onClick={() => setInput("")} className="hover:underline">
                  ล้าง
                </button>
              </div>
            </div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={dir === "encode" ? "วางข้อความที่จะเข้ารหัส..." : "วางข้อความที่จะถอดรหัส..."}
              spellCheck={false}
              className="h-64 w-full resize-y rounded-lg border border-black/15 bg-transparent p-3 font-mono text-sm outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
            />
            <div className="text-right text-[11px] text-neutral-400">{result.bytesIn} bytes</div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-neutral-500">
              <span>ผลลัพธ์</span>
              <div className="flex gap-2">
                <button onClick={swap} disabled={!result.ok || !result.output} className="hover:underline disabled:opacity-40">
                  ↔ สลับเข้า
                </button>
                <button onClick={copyOut} disabled={!result.output} className="hover:underline disabled:opacity-40">
                  {copied ? "คัดลอกแล้ว ✓" : "คัดลอก"}
                </button>
              </div>
            </div>
            <textarea
              value={result.ok ? result.output : ""}
              readOnly
              placeholder="ผลลัพธ์จะขึ้นที่นี่..."
              spellCheck={false}
              className={`h-64 w-full resize-y rounded-lg border bg-neutral-50 p-3 font-mono text-sm outline-none dark:bg-neutral-900 ${
                result.ok ? "border-black/15 dark:border-white/15" : "border-red-500/40"
              }`}
            />
            <div className="text-right text-[11px] text-neutral-400">{result.bytesOut} bytes</div>
          </div>
        </div>

        {!result.ok && result.error && (
          <p className="rounded-md border border-red-500/30 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
            {result.error}
          </p>
        )}
      </section>
    </main>
  );
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  runRegex,
  runReplace,
  segmentText,
  REGEX_FLAGS,
} from "@/lib/regex/regex";

const SAMPLE_PATTERN = "([A-Z]{2,})-?(\\d+)";
const SAMPLE_TEXT = "ตู้ TU-12 · พัสดุ KY345 · GZE-2025 · เลขเสีย abc · TU12";

export default function RegexPage() {
  const [pattern, setPattern] = useState("");
  const [flags, setFlags] = useState("g");
  const [text, setText] = useState("");
  const [replacement, setReplacement] = useState("");
  const [showReplace, setShowReplace] = useState(false);

  const result = useMemo(() => runRegex(pattern, flags, text), [pattern, flags, text]);
  const segments = useMemo(
    () => (result.ok ? segmentText(text, result.matches) : []),
    [result, text],
  );
  const replaced = useMemo(
    () => (showReplace ? runReplace(pattern, flags, text, replacement) : null),
    [showReplace, pattern, flags, text, replacement],
  );

  const toggleFlag = (f: string) =>
    setFlags((cur) => (cur.includes(f) ? cur.replace(f, "") : cur + f));

  const loadSample = () => {
    setPattern(SAMPLE_PATTERN);
    setText(SAMPLE_TEXT);
    setFlags("g");
  };

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">ทดสอบ Regex 🔤</h1>
          <p className="text-xs text-neutral-500">
            ลอง pattern กับข้อความจริง เห็น match/กลุ่ม + ลอง replace ก่อนเอาไป clean ข้อมูล (ดึงเลข tracking/ตู้)
          </p>
        </div>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← กลับหน้าหลัก
        </Link>
      </header>

      <section className="flex-1 space-y-4 p-6">
        {/* pattern + flags */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg text-neutral-400">/</span>
            <input
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="เขียน regex ตรงนี้... เช่น  ([A-Z]+)-(\d+)"
              spellCheck={false}
              className={`flex-1 rounded-lg border bg-transparent px-3 py-2 font-mono text-sm outline-none ${
                result.ok
                  ? "border-black/15 focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
                  : "border-red-500/50"
              }`}
            />
            <span className="font-mono text-lg text-neutral-400">/</span>
            <span className="font-mono text-sm text-emerald-600">{flags}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {REGEX_FLAGS.map((f) => (
              <button
                key={f.flag}
                type="button"
                onClick={() => toggleFlag(f.flag)}
                title={f.hint}
                className={`rounded-md border px-2.5 py-1 font-mono text-xs transition ${
                  flags.includes(f.flag)
                    ? "border-transparent bg-emerald-600 text-white"
                    : "border-black/15 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
                }`}
              >
                {f.label}
              </button>
            ))}
            <span className="ml-1 text-[11px] text-neutral-400">
              {REGEX_FLAGS.find((f) => flags.includes(f.flag))
                ? REGEX_FLAGS.filter((f) => flags.includes(f.flag)).map((f) => `${f.flag}=${f.hint}`).join(" · ")
                : "เลือก flag"}
            </span>
            <button onClick={loadSample} className="ml-auto text-xs text-neutral-500 hover:underline">
              ตัวอย่าง
            </button>
          </div>

          {!result.ok && result.error && (
            <p className="rounded-md border border-red-500/30 bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">
              regex ผิด: {result.error}
            </p>
          )}
        </div>

        {/* ข้อความทดสอบ + ไฮไลต์ */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-neutral-500">
              <span>ข้อความทดสอบ</span>
              <button onClick={() => setText("")} className="hover:underline">
                ล้าง
              </button>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="วางข้อความที่จะทดสอบ..."
              spellCheck={false}
              className="h-56 w-full resize-y rounded-lg border border-black/15 bg-transparent p-3 font-mono text-sm outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-neutral-500">
              <span>ไฮไลต์ผลลัพธ์</span>
              <span className={result.count > 0 ? "text-emerald-600" : ""}>
                เจอ {result.count} match{result.capped ? "+ (ตัดที่ 1000)" : ""}
              </span>
            </div>
            <div className="h-56 w-full overflow-auto whitespace-pre-wrap break-words rounded-lg border border-black/15 bg-neutral-50 p-3 font-mono text-sm dark:border-white/15 dark:bg-neutral-900">
              {text === "" ? (
                <span className="text-neutral-400">ผลจะไฮไลต์ตรงนี้...</span>
              ) : (
                segments.map((s, i) =>
                  s.matchIndex >= 0 ? (
                    <mark
                      key={i}
                      className="rounded bg-emerald-200 text-black dark:bg-emerald-500/40 dark:text-white"
                      title={`match #${s.matchIndex + 1}`}
                    >
                      {s.text}
                    </mark>
                  ) : (
                    <span key={i}>{s.text}</span>
                  ),
                )
              )}
            </div>
          </div>
        </div>

        {/* รายการ match + กลุ่ม */}
        {result.ok && result.count > 0 && (
          <div className="rounded-xl border border-black/10 dark:border-white/10">
            <div className="border-b border-black/10 px-3 py-2 text-xs font-semibold dark:border-white/10">
              รายการ match ({result.count})
            </div>
            <div className="max-h-64 overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-900">
                  <tr>
                    <th className="px-2 py-1">#</th>
                    <th className="px-2 py-1">ตำแหน่ง</th>
                    <th className="px-2 py-1">match</th>
                    <th className="px-2 py-1">กลุ่ม</th>
                  </tr>
                </thead>
                <tbody>
                  {result.matches.map((m, i) => {
                    const named = Object.entries(m.namedGroups).filter(([, v]) => v !== undefined);
                    return (
                      <tr key={i} className="border-t border-black/5 dark:border-white/5">
                        <td className="px-2 py-1 text-neutral-400">{i + 1}</td>
                        <td className="px-2 py-1 tabular-nums text-neutral-400">{m.index}</td>
                        <td className="px-2 py-1 font-mono">
                          <span className="rounded bg-emerald-100 px-1 dark:bg-emerald-900/40">{m.match || "∅"}</span>
                        </td>
                        <td className="px-2 py-1 font-mono text-neutral-600 dark:text-neutral-400">
                          {m.groups.length === 0 && named.length === 0
                            ? "—"
                            : m.groups.map((g, gi) => (
                                <span key={gi} className="mr-2">
                                  <span className="text-neutral-400">${gi + 1}</span>=
                                  {g === undefined ? <span className="text-neutral-400">(ว่าง)</span> : g}
                                </span>
                              ))}
                          {named.map(([k, v]) => (
                            <span key={k} className="mr-2">
                              <span className="text-neutral-400">{"<" + k + ">"}</span>={v}
                            </span>
                          ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* replace (พับได้) */}
        <div className="rounded-xl border border-black/10 dark:border-white/10">
          <button
            onClick={() => setShowReplace((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold"
          >
            <span>ลอง replace (แทนที่)</span>
            <span className="text-neutral-400">{showReplace ? "▲ ซ่อน" : "▼ เปิด"}</span>
          </button>
          {showReplace && (
            <div className="space-y-2 border-t border-black/10 p-3 dark:border-white/10">
              <input
                value={replacement}
                onChange={(e) => setReplacement(e.target.value)}
                placeholder="ข้อความแทนที่ — ใช้ $1 $2 $<ชื่อกลุ่ม> ได้"
                spellCheck={false}
                className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 font-mono text-sm outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
              />
              <div className="text-xs text-neutral-500">ผลหลังแทนที่:</div>
              <div
                className={`min-h-[3rem] w-full whitespace-pre-wrap break-words rounded-lg border bg-neutral-50 p-3 font-mono text-sm dark:bg-neutral-900 ${
                  replaced && !replaced.ok ? "border-red-500/40 text-red-600" : "border-black/15 dark:border-white/15"
                }`}
              >
                {replaced ? (replaced.ok ? replaced.output || <span className="text-neutral-400">(ว่าง)</span> : replaced.error) : null}
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

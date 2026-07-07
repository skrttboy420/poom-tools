"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  diffJson,
  previewValue,
  diffToCsv,
  type DiffKind,
} from "@/lib/jsondiff/jsondiff";
import { downloadText } from "@/lib/reconcile/export";

const SAMPLE_A = `{
  "container": "TU-A",
  "boxes": 12,
  "weight": 340.5,
  "items": [
    { "tracking": "KY001", "cbm": 0.24 },
    { "tracking": "KY002", "cbm": 0.18 }
  ],
  "note": "ok"
}`;
const SAMPLE_B = `{
  "container": "TU-A",
  "boxes": 10,
  "weight": 340.5,
  "items": [
    { "tracking": "KY001", "cbm": 0.24 },
    { "tracking": "KY002", "cbm": 0.20 }
  ],
  "shipDate": "2026-07-07"
}`;

const KIND_META: Record<DiffKind, { label: string; dot: string; row: string }> = {
  changed: { label: "เปลี่ยน", dot: "bg-amber-500", row: "bg-amber-50 dark:bg-amber-950/20" },
  added: { label: "เพิ่ม (มีเฉพาะ B)", dot: "bg-emerald-500", row: "bg-emerald-50 dark:bg-emerald-950/20" },
  removed: { label: "หาย (มีเฉพาะ A)", dot: "bg-red-500", row: "bg-red-50 dark:bg-red-950/20" },
  same: { label: "เหมือน", dot: "bg-neutral-400", row: "" },
};

type Filter = "diff" | "all" | DiffKind;

export default function CompareJsonPage() {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [filter, setFilter] = useState<Filter>("diff");

  const result = useMemo(() => diffJson(a, b), [a, b]);

  const shown = useMemo(() => {
    if (!result.ok) return [];
    if (filter === "all") return result.nodes;
    if (filter === "diff") return result.nodes.filter((n) => n.kind !== "same");
    return result.nodes.filter((n) => n.kind === filter);
  }, [result, filter]);

  const s = result.stats;
  const diffCount = s.added + s.removed + s.changed;

  const loadSample = () => {
    setA(SAMPLE_A);
    setB(SAMPLE_B);
  };
  const dlCsv = () => {
    if (!result.ok) return;
    downloadText("json-diff.csv", diffToCsv(result.nodes), "text/csv");
  };

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">เปรียบเทียบ JSON 🧬</h1>
          <p className="text-xs text-neutral-500">
            วาง JSON 2 ชุด → ไล่ลึกทุกชั้น เห็นว่าอะไร <b>เปลี่ยน / เพิ่ม / หาย</b> ตรง path ไหน (เช็ค payload MOMO API ↔ Pacred)
          </p>
        </div>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← กลับหน้าหลัก
        </Link>
      </header>

      <section className="flex-1 space-y-4 p-6">
        {/* 2 ช่องวาง JSON */}
        <div className="grid gap-4 md:grid-cols-2">
          <JsonPane label="JSON ฝั่ง A (ซ้าย)" value={a} onChange={setA} onClear={() => setA("")} />
          <JsonPane label="JSON ฝั่ง B (ขวา)" value={b} onChange={setB} onClear={() => setB("")} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={loadSample} className="rounded-md border border-black/15 px-3 py-1.5 text-xs hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5">
            ตัวอย่าง
          </button>
          <button
            onClick={dlCsv}
            disabled={!result.ok || diffCount === 0}
            className="rounded-md border border-black/15 px-3 py-1.5 text-xs hover:bg-black/5 disabled:opacity-40 dark:border-white/15 dark:hover:bg-white/5"
          >
            ↓ export ความต่าง (CSV)
          </button>
        </div>

        {!result.ok && result.error && (
          <p className="rounded-md border border-red-500/30 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
            {result.error}
          </p>
        )}

        {result.ok && (a.trim() !== "" || b.trim() !== "") && (
          <>
            {/* chips สรุป + filter */}
            <div className="flex flex-wrap items-center gap-2">
              <Chip active={filter === "diff"} onClick={() => setFilter("diff")} dot="bg-neutral-800 dark:bg-white">
                ต่างทั้งหมด {diffCount}
              </Chip>
              <Chip active={filter === "changed"} onClick={() => setFilter("changed")} dot={KIND_META.changed.dot}>
                เปลี่ยน {s.changed}
              </Chip>
              <Chip active={filter === "added"} onClick={() => setFilter("added")} dot={KIND_META.added.dot}>
                เพิ่ม {s.added}
              </Chip>
              <Chip active={filter === "removed"} onClick={() => setFilter("removed")} dot={KIND_META.removed.dot}>
                หาย {s.removed}
              </Chip>
              <Chip active={filter === "all"} onClick={() => setFilter("all")} dot={KIND_META.same.dot}>
                ทั้งหมด {result.nodes.length}
              </Chip>
              {diffCount === 0 && (
                <span className="text-xs text-emerald-600">✓ เหมือนกันทุกจุด</span>
              )}
            </div>

            {/* ตาราง diff */}
            <div className="rounded-xl border border-black/10 dark:border-white/10">
              <div className="border-b border-black/10 px-3 py-2 text-xs text-neutral-500 dark:border-white/10">
                แสดง {shown.length} จุด
              </div>
              <div className="max-h-[55vh] overflow-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-900">
                    <tr>
                      <th className="px-3 py-1.5">สถานะ</th>
                      <th className="px-3 py-1.5">path</th>
                      <th className="px-3 py-1.5">A (ซ้าย)</th>
                      <th className="px-3 py-1.5">B (ขวา)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((n, i) => {
                      const meta = KIND_META[n.kind];
                      return (
                        <tr key={i} className={`border-t border-black/5 dark:border-white/5 ${meta.row}`}>
                          <td className="whitespace-nowrap px-3 py-1.5">
                            <span className="inline-flex items-center gap-1.5">
                              <span className={`inline-block h-2 w-2 rounded-full ${meta.dot}`} />
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 font-mono text-neutral-500">{n.path}</td>
                          <td className="px-3 py-1.5 font-mono">
                            {n.left === undefined ? <span className="text-neutral-400">—</span> : previewValue(n.left)}
                          </td>
                          <td className="px-3 py-1.5 font-mono">
                            {n.right === undefined ? <span className="text-neutral-400">—</span> : previewValue(n.right)}
                          </td>
                        </tr>
                      );
                    })}
                    {shown.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-4 text-center text-neutral-400">
                          ไม่มีจุดในหมวดนี้
                        </td>
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

function JsonPane({
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
        placeholder="วาง JSON ที่นี่..."
        spellCheck={false}
        className="h-64 w-full resize-y rounded-lg border border-black/15 bg-transparent p-3 font-mono text-sm outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
      />
    </div>
  );
}

function Chip({
  active,
  onClick,
  dot,
  children,
}: {
  active: boolean;
  onClick: () => void;
  dot: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${
        active
          ? "border-transparent bg-neutral-900 text-white dark:bg-white dark:text-black"
          : "border-black/15 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
      }`}
    >
      <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
      {children}
    </button>
  );
}

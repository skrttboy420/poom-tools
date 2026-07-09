"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { jsonToTable, tableToJson } from "@/lib/jsoncsv/jsoncsv";
import { rowsToCsv } from "@/lib/convertfile/convertfile";
import { downloadText } from "@/lib/reconcile/export";

type Dir = "json2csv" | "csv2json";

const SAMPLE_JSON = `[
  { "tracking": "KY001", "kg": 12, "cbm": 0.24, "meta": { "box": 2 } },
  { "tracking": "KY002", "kg": 5.5, "cbm": 0.10, "meta": { "box": 1 } }
]`;

const SAMPLE_CSV = `tracking,kg,cbm
KY001,12,0.24
KY002,5.5,0.10`;

export default function JsonCsvPage() {
  const [dir, setDir] = useState<Dir>("json2csv");
  const [input, setInput] = useState("");
  const [flatten, setFlatten] = useState(false);
  const [inferTypes, setInferTypes] = useState(true);
  const [pretty, setPretty] = useState(true);
  const [copied, setCopied] = useState(false);

  // JSON → ตาราง/CSV
  const j2c = useMemo(() => {
    if (dir !== "json2csv") return null;
    const t = jsonToTable(input, { flatten });
    if (!t.ok) return { ok: false as const, error: t.error };
    const csv = rowsToCsv([t.header, ...t.rows]);
    return { ok: true as const, header: t.header, rows: t.rows, count: t.count, csv };
  }, [dir, input, flatten]);

  // CSV → JSON
  const c2j = useMemo(() => {
    if (dir !== "csv2json") return null;
    return tableToJson(input, { inferTypes, pretty });
  }, [dir, input, inferTypes, pretty]);

  const output = dir === "json2csv" ? (j2c?.ok ? j2c.csv : "") : c2j?.ok ? c2j.json : "";
  const error = dir === "json2csv" ? (j2c && !j2c.ok ? j2c.error : null) : c2j && !c2j.ok ? c2j.error : null;

  const copy = async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard บล็อค — ข้าม */
    }
  };

  const download = () => {
    if (!output) return;
    if (dir === "json2csv") downloadText("data.csv", output, "text/csv");
    else downloadText("data.json", output, "application/json");
  };

  const loadSample = () => setInput(dir === "json2csv" ? SAMPLE_JSON : SAMPLE_CSV);

  // สลับทิศ = เอาผลลัพธ์ปัจจุบันไปเป็น input ของทิศตรงข้าม (เช็ค round-trip เร็ว)
  const swap = () => {
    if (output) setInput(output);
    setDir((d) => (d === "json2csv" ? "csv2json" : "json2csv"));
  };

  const preview = dir === "json2csv" && j2c?.ok ? j2c.rows.slice(0, 30) : [];

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">แปลง JSON ↔ ตาราง/CSV 🔧</h1>
          <p className="text-xs text-neutral-500">
            เปลี่ยน response JSON (MOMO API / Supabase) เป็นตาราง/CSV ดูง่าย · หรือ CSV → JSON array of objects เอาไปยิง API ต่อ
          </p>
        </div>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← กลับหน้าหลัก
        </Link>
      </header>

      <section className="mx-auto w-full max-w-6xl flex-1 space-y-4 p-6">
        {/* direction + options */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex overflow-hidden rounded-lg border border-black/15 text-sm dark:border-white/15">
            {(
              [
                ["json2csv", "JSON → ตาราง/CSV"],
                ["csv2json", "CSV → JSON"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setDir(id)}
                className={`px-4 py-1.5 transition ${
                  dir === id ? "bg-emerald-600 text-white" : "hover:bg-black/5 dark:hover:bg-white/5"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {dir === "json2csv" && (
            <label className="flex cursor-pointer items-center gap-1.5 text-sm text-neutral-600 dark:text-neutral-400">
              <input type="checkbox" checked={flatten} onChange={(e) => setFlatten(e.target.checked)} />
              แผ่ object ซ้อน (dot notation)
            </label>
          )}
          {dir === "csv2json" && (
            <>
              <label className="flex cursor-pointer items-center gap-1.5 text-sm text-neutral-600 dark:text-neutral-400" title="แปลงตัวเลข/true/false/null อัตโนมัติ (คงเลขที่มี 0 นำหน้าเป็นข้อความ)">
                <input type="checkbox" checked={inferTypes} onChange={(e) => setInferTypes(e.target.checked)} />
                เดาชนิดค่า (ตัวเลข/bool/null)
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-sm text-neutral-600 dark:text-neutral-400">
                <input type="checkbox" checked={pretty} onChange={(e) => setPretty(e.target.checked)} />
                จัดรูปสวย
              </label>
            </>
          )}

          <div className="ml-auto flex gap-2 text-sm">
            <button onClick={loadSample} className="rounded-md border border-black/15 px-3 py-1.5 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5">
              ตัวอย่าง
            </button>
            <button onClick={() => setInput("")} className="rounded-md border border-black/15 px-3 py-1.5 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5">
              ล้าง
            </button>
            <button onClick={swap} disabled={!output} className="rounded-md border border-black/15 px-3 py-1.5 hover:bg-black/5 disabled:opacity-40 dark:border-white/15 dark:hover:bg-white/5" title="เอาผลลัพธ์ไปเป็น input ทิศตรงข้าม">
              ↔ สลับทิศ
            </button>
          </div>
        </div>

        {/* two panels */}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-1.5">
            <span className="text-xs text-neutral-500">{dir === "json2csv" ? "วาง JSON" : "วาง CSV"}</span>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={dir === "json2csv" ? '[{"tracking":"KY001","kg":12}, ...]' : "tracking,kg\nKY001,12\n..."}
              spellCheck={false}
              className="h-80 w-full resize-none rounded-xl border border-black/15 bg-transparent p-3 font-mono text-sm outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-neutral-500">
              <span>{dir === "json2csv" ? "ผลลัพธ์ CSV" : "ผลลัพธ์ JSON"}</span>
              <div className="flex gap-2">
                <button onClick={copy} disabled={!output} className="rounded-md border border-black/15 px-2 py-0.5 hover:bg-black/5 disabled:opacity-40 dark:border-white/15 dark:hover:bg-white/5">
                  {copied ? "คัดลอกแล้ว ✓" : "คัดลอก"}
                </button>
                <button onClick={download} disabled={!output} className="rounded-md border border-black/15 px-2 py-0.5 hover:bg-black/5 disabled:opacity-40 dark:border-white/15 dark:hover:bg-white/5">
                  ↓ ดาวน์โหลด
                </button>
              </div>
            </div>
            <textarea
              value={output}
              readOnly
              spellCheck={false}
              placeholder="ผลลัพธ์จะขึ้นที่นี่..."
              className="h-80 w-full resize-none rounded-xl border border-black/15 bg-neutral-50 p-3 font-mono text-sm outline-none dark:border-white/15 dark:bg-neutral-900/50"
            />
          </div>
        </div>

        {error && (
          <p className="rounded-md border border-red-500/30 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </p>
        )}

        {/* table preview for JSON → table */}
        {dir === "json2csv" && j2c?.ok && j2c.count > 0 && (
          <div className="rounded-xl border border-black/10 dark:border-white/10">
            <div className="border-b border-black/10 px-3 py-2 text-xs text-neutral-500 dark:border-white/10">
              พรีวิวตาราง — {j2c.count} แถว · {j2c.header.length} คอลัมน์
              {j2c.count > 30 && <span className="text-neutral-400"> (แสดง 30 แถวแรก)</span>}
            </div>
            <div className="max-h-[45vh] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-900">
                  <tr>
                    <th className="px-2 py-1.5">#</th>
                    {j2c.header.map((h, i) => (
                      <th key={i} className="px-2 py-1.5 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, ri) => (
                    <tr key={ri} className="border-t border-black/5 dark:border-white/5">
                      <td className="px-2 py-1 text-right text-neutral-400 tabular-nums">{ri + 1}</td>
                      {j2c.header.map((_, ci) => (
                        <td key={ci} className="max-w-[220px] truncate whitespace-nowrap px-2 py-1">
                          {r[ci] === null || r[ci] === undefined ? "" : String(r[ci])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

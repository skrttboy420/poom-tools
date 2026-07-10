"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { columnLetter } from "@/lib/reconcile/columns";
import { downloadText } from "@/lib/reconcile/export";
import { changeExt } from "@/lib/convertfile/convertfile";
import { profileColumns, schemaToCsv, TYPE_LABEL, type CellType, type ColumnProfile } from "@/lib/schema/schema";
import FileDropzone from "@/components/FileDropzone";
import type { ParsedFile, Row, SideSelection } from "@/lib/reconcile/types";

interface FileState {
  file: ParsedFile;
  sel: SideSelection;
}

function makeSelection(file: ParsedFile, sheetIndex = 0): SideSelection {
  const rows = file.sheets[sheetIndex]?.rows ?? [];
  const headerRow = guessHeaderRow(rows);
  return { sheetIndex, headerRow, dataStart: headerRow + 1, dataEnd: null };
}

function headerRowOf(s: FileState | null): Row {
  if (!s) return [];
  return s.file.sheets[s.sel.sheetIndex]?.rows[s.sel.headerRow] ?? [];
}

function dataRowsOf(s: FileState | null): Row[] {
  if (!s) return [];
  const rows = s.file.sheets[s.sel.sheetIndex]?.rows ?? [];
  return rows.slice(s.sel.dataStart, s.sel.dataEnd ?? undefined);
}

// สีป้ายชนิด (class เต็ม — Tailwind v4 JIT อ่าน literal เท่านั้น)
const TYPE_CLASS: Record<CellType, string> = {
  integer: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  decimal: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200",
  boolean: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200",
  date: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  text: "bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200",
  blank: "bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500",
};

const ORDER: CellType[] = ["integer", "decimal", "date", "boolean", "text"];

function TypeBadge({ type }: { type: CellType }) {
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${TYPE_CLASS[type]}`}>{TYPE_LABEL[type]}</span>;
}

export default function SchemaPage() {
  const [state, setState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const header = useMemo(() => headerRowOf(state), [state]);
  const data = useMemo(() => dataRowsOf(state), [state]);
  const headerStr = useMemo(() => header.map((h) => (h === null ? "" : String(h))), [header]);

  const result = useMemo(() => profileColumns(headerStr, data), [headerStr, data]);

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const parsed = await parseFile(file);
      const sel = makeSelection(parsed, 0);
      setState({ file: parsed, sel });
    } catch (e) {
      setError(`อ่านไฟล์ ${file.name} ไม่สำเร็จ: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const updateSel = useCallback((patch: Partial<SideSelection>) => {
    setState((cur) => (cur ? { ...cur, sel: { ...cur.sel, ...patch } } : cur));
  }, []);

  const dlCsv = () => {
    if (!state || result.error) return;
    downloadText(changeExt(state.file.fileName, "csv", "-ชนิดข้อมูล"), schemaToCsv(result), "text/csv");
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">ส่องชนิดข้อมูลแต่ละคอลัมน์ 🔬</h1>
          <p className="text-xs text-neutral-500">
            รู้จักไฟล์ก่อนลงมือ — เดาชนิดทุกคอลัมน์ (ตัวเลข/ทศนิยม/วันที่/ข้อความ), ชี้ค่าที่ไม่เข้าพวก (typo/ข้อมูลปน) + เตือนคอลัมน์เลข 0 นำหน้าที่ Excel อาจตัดหาย · อ่านอย่างเดียว ไม่แก้ข้อมูล
          </p>
        </div>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← กลับหน้าหลัก
        </Link>
      </header>

      <section className="flex-1 space-y-6 p-6">
        {error && (
          <p className="rounded-md border border-red-500/30 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </p>
        )}

        {/* STEP 1: อัปโหลด */}
        <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">ไฟล์ที่จะส่อง</h2>
            {state && (
              <span
                className={`rounded px-2 py-0.5 text-[11px] ${
                  state.file.via === "xlsx-repair"
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                    : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                }`}
              >
                {state.file.via === "xlsx-repair" ? "ซ่อมไฟล์เพี้ยนแล้ว" : state.file.via}
              </span>
            )}
          </div>

          <FileDropzone
            onFile={handleFile}
            accept=".xlsx,.xls,.csv,.tsv,.txt"
            busy={busy}
            label={state ? `เปลี่ยนไฟล์ — ${state.file.fileName}` : "ลากไฟล์มาวาง หรือคลิกเลือก (.xlsx / .csv)"}
          />

          {state && sheet && (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                {state.file.sheets.length > 1 && (
                  <label className="flex items-center gap-1">
                    ชีต:
                    <select
                      value={state.sel.sheetIndex}
                      onChange={(e) => updateSel({ sheetIndex: Number(e.target.value), headerRow: 0, dataStart: 1, dataEnd: null })}
                      className="rounded border border-black/15 bg-transparent px-1 py-0.5 dark:border-white/15 dark:bg-neutral-900"
                    >
                      {state.file.sheets.map((s, i) => (
                        <option key={i} value={i}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="flex items-center gap-1">
                  แถวหัวตาราง (0-based):
                  <input
                    type="number"
                    min={0}
                    value={state.sel.headerRow}
                    onChange={(e) => {
                      const h = Math.max(0, Number(e.target.value) || 0);
                      updateSel({ headerRow: h, dataStart: h + 1 });
                    }}
                    className="w-16 rounded border border-black/15 bg-transparent px-1 py-0.5 dark:border-white/15"
                  />
                </label>
                <span className="text-neutral-400">แถวข้อมูล: {Math.max(0, sheet.rows.length - state.sel.dataStart)}</span>
              </div>

              <div className="max-h-44 overflow-auto rounded border border-black/10 dark:border-white/10">
                <table className="w-full text-[11px]">
                  <tbody>
                    {preview.map((r, ri) => {
                      const isHeader = ri === state.sel.headerRow;
                      const isBefore = ri < state.sel.dataStart && !isHeader;
                      return (
                        <tr key={ri} className={isHeader ? "bg-black/5 font-medium dark:bg-white/10" : isBefore ? "text-neutral-400" : ""}>
                          <td className="border-r border-black/10 px-1 text-right text-neutral-400 dark:border-white/10">{ri}</td>
                          {r.slice(0, 8).map((c, ci) => (
                            <td key={ci} className="max-w-[120px] truncate whitespace-nowrap px-1">
                              {c === null ? "" : String(c)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* STEP 2: ผลลัพธ์ */}
        {state && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {result.error ? (
                <span className="rounded-full bg-red-100 px-3 py-1 font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300">{result.error}</span>
              ) : (
                <>
                  <span className="rounded-full bg-indigo-100 px-3 py-1 font-medium text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200">
                    <span className="tabular-nums">{result.columns.length}</span> คอลัมน์
                  </span>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                    <span className="tabular-nums">{result.dataRows}</span> แถวข้อมูล
                  </span>
                  {result.inputRows !== result.dataRows && (
                    <span className="text-neutral-400">
                      (ตัดแถวว่าง <span className="tabular-nums">{result.inputRows - result.dataRows}</span>)
                    </span>
                  )}
                </>
              )}
              {!result.error && (
                <button
                  onClick={dlCsv}
                  className="ml-auto rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                >
                  ↓ สรุป CSV
                </button>
              )}
            </div>

            {/* การ์ดต่อคอลัมน์ */}
            {!result.error && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {result.columns.map((col) => (
                  <ColumnCard key={col.index} col={col} />
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

function ColumnCard({ col }: { col: ColumnProfile }) {
  const filledPct = col.total > 0 ? Math.round((col.filled / col.total) * 100) : 0;
  const mixed = ORDER.filter((t) => col.typeCounts[t] > 0);
  return (
    <div className="rounded-xl border border-black/10 p-3 dark:border-white/10">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold" title={col.name}>
            {col.name}
          </div>
          <div className="text-[11px] text-neutral-400">คอลัมน์ {columnLetter(col.index)}</div>
        </div>
        <TypeBadge type={col.dominantType} />
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-neutral-500">
        <span>
          มีค่า <span className="tabular-nums text-neutral-700 dark:text-neutral-300">{col.filled}</span>/{col.total} ({filledPct}%)
        </span>
        <span>
          ไม่ซ้ำ <span className="tabular-nums text-neutral-700 dark:text-neutral-300">{col.distinct}</span>
        </span>
        <span>
          ยาว <span className="tabular-nums text-neutral-700 dark:text-neutral-300">{col.minLen === col.maxLen ? col.minLen : `${col.minLen}–${col.maxLen}`}</span>
        </span>
      </div>

      {/* สัดส่วนชนิด (ถ้าปนหลายชนิด) */}
      {mixed.length > 1 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {mixed.map((t) => (
            <span key={t} className={`rounded px-1.5 py-0.5 text-[10px] ${TYPE_CLASS[t]}`}>
              {TYPE_LABEL[t]} {col.typeCounts[t]}
            </span>
          ))}
        </div>
      )}

      {/* เตือนเลข 0 นำหน้า */}
      {col.hasLeadingZero && (
        <p className="mt-1.5 rounded border border-amber-500/30 bg-amber-50 px-2 py-1 text-[11px] text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
          ⚠️ มีค่าเลข 0 นำหน้า (เช่น 007) — Excel/CSV อาจตัดหาย ลองใช้ &quot;เติมเลข 0 นำหน้า&quot; เพื่อจัดความกว้าง
        </p>
      )}

      {/* ตัวอย่างค่า */}
      {col.sampleValues.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {col.sampleValues.map((v, i) => (
            <span key={i} className="max-w-[140px] truncate rounded border border-black/10 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500 dark:border-white/10">
              {v}
            </span>
          ))}
        </div>
      )}

      {/* ค่าที่ไม่เข้าพวก */}
      {col.oddValues.length > 0 && (
        <div className="mt-1.5 rounded border border-rose-500/30 bg-rose-50 px-2 py-1 dark:bg-rose-950/20">
          <p className="text-[11px] font-medium text-rose-700 dark:text-rose-300">
            ค่าที่ไม่เข้าพวก ({col.oddValues.length}
            {col.oddValues.length >= 20 ? "+" : ""})
          </p>
          <div className="mt-0.5 flex flex-wrap gap-1">
            {col.oddValues.slice(0, 8).map((o, i) => (
              <span
                key={i}
                className="rounded bg-white px-1.5 py-0.5 font-mono text-[10px] text-rose-700 dark:bg-neutral-900 dark:text-rose-300"
                title={`แถว ${o.row + 1} · ${TYPE_LABEL[o.type]}`}
              >
                {o.value || "(ว่าง)"}
              </span>
            ))}
            {col.oddValues.length > 8 && <span className="self-center text-[10px] text-rose-400">…อีก {col.oddValues.length - 8}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

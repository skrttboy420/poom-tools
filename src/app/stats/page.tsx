"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { columnLetter } from "@/lib/reconcile/columns";
import { downloadText } from "@/lib/reconcile/export";
import { changeExt } from "@/lib/convertfile/convertfile";
import { computeStats, fmtNum, statsToCsv } from "@/lib/stats/stats";
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

export default function StatsPage() {
  const [state, setState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [onlyNumeric, setOnlyNumeric] = useState(false);

  const header = useMemo(
    () => headerRowOf(state).map((c) => (c === null ? "" : String(c))),
    [state],
  );
  const data = useMemo(() => dataRowsOf(state), [state]);

  const result = useMemo(() => computeStats(header, data), [header, data]);

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const parsed = await parseFile(file);
      setState({ file: parsed, sel: makeSelection(parsed, 0) });
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
    if (!state) return;
    downloadText(changeExt(state.file.fileName, "csv", "-สรุป"), statsToCsv(result), "text/csv");
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];

  const shown = onlyNumeric ? result.columns.filter((c) => c.isNumericCol) : result.columns;
  const numericCols = result.columns.filter((c) => c.isNumericCol);

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">สรุปยอด &amp; สถิติคอลัมน์ 📊</h1>
          <p className="text-xs text-neutral-500">
            อัปโหลดไฟล์ → รู้ยอดรวม/เฉลี่ย/ต่ำสุด/สูงสุด ของทุกคอลัมน์ทันที (น้ำหนัก, CBM, จำนวนกล่อง) + นับช่องว่าง/ศูนย์/ค่าไม่ซ้ำ
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
            <h2 className="text-sm font-semibold">ไฟล์ที่จะสรุป</h2>
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

        {/* STEP 2: การ์ดยอดรวมคอลัมน์ตัวเลข (เด่น) */}
        {state && numericCols.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {numericCols.map((c) => (
              <div key={c.index} className="rounded-xl border border-emerald-500/25 bg-emerald-50/40 p-4 dark:border-emerald-500/25 dark:bg-emerald-950/20">
                <div className="truncate text-xs font-medium text-neutral-500" title={c.header}>
                  {c.header || columnLetter(c.index)}
                </div>
                <div className="mt-1 text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                  {fmtNum(c.sum)}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-neutral-500">
                  <span>เฉลี่ย {fmtNum(c.avg)}</span>
                  <span>ต่ำ {fmtNum(c.min)}</span>
                  <span>สูง {fmtNum(c.max)}</span>
                  <span>{c.numeric} ค่า{c.zero > 0 ? ` · ${c.zero} ศูนย์` : ""}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* STEP 3: ตารางสถิติทุกคอลัมน์ */}
        {state && (
          <div className="rounded-xl border border-black/10 dark:border-white/10">
            <div className="flex flex-wrap items-center gap-3 border-b border-black/10 px-3 py-2 text-xs dark:border-white/10">
              <span className="rounded-full bg-neutral-100 px-3 py-1 font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                {result.totalRows.toLocaleString("en-US")} แถวข้อมูล · {result.columns.length} คอลัมน์
              </span>
              <label className="flex cursor-pointer items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
                <input type="checkbox" checked={onlyNumeric} onChange={(e) => setOnlyNumeric(e.target.checked)} />
                เฉพาะคอลัมน์ตัวเลข ({numericCols.length})
              </label>
              <button
                onClick={dlCsv}
                className="ml-auto rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700"
              >
                ↓ ดาวน์โหลดสรุป (CSV)
              </button>
            </div>

            <div className="max-h-[55vh] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-900">
                  <tr>
                    <th className="px-2 py-1.5">คอลัมน์</th>
                    <th className="px-2 py-1.5 text-right">มีค่า</th>
                    <th className="px-2 py-1.5 text-right">ว่าง</th>
                    <th className="px-2 py-1.5 text-right">ไม่ซ้ำ</th>
                    <th className="px-2 py-1.5 text-right">ตัวเลข</th>
                    <th className="px-2 py-1.5 text-right">ศูนย์</th>
                    <th className="px-2 py-1.5 text-right">ผลรวม</th>
                    <th className="px-2 py-1.5 text-right">เฉลี่ย</th>
                    <th className="px-2 py-1.5 text-right">ต่ำสุด</th>
                    <th className="px-2 py-1.5 text-right">สูงสุด</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((c) => (
                    <tr key={c.index} className="border-t border-black/5 dark:border-white/5">
                      <td className="px-2 py-1 whitespace-nowrap">
                        <span className="text-neutral-400">{columnLetter(c.index)}</span>{" "}
                        {c.header || <span className="text-neutral-400">(ว่าง)</span>}
                        {c.isNumericCol && (
                          <span className="ml-1 rounded bg-emerald-100 px-1 text-[10px] text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                            ตัวเลข
                          </span>
                        )}
                        {c.blank > 0 && (
                          <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                            ว่าง {c.blank}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums">{c.filled.toLocaleString("en-US")}</td>
                      <td className="px-2 py-1 text-right tabular-nums text-neutral-400">{c.blank || ""}</td>
                      <td className="px-2 py-1 text-right tabular-nums text-neutral-400">{c.distinct.toLocaleString("en-US")}</td>
                      <td className="px-2 py-1 text-right tabular-nums text-neutral-400">{c.numeric || ""}</td>
                      <td className="px-2 py-1 text-right tabular-nums text-neutral-400">{c.zero || ""}</td>
                      <td className="px-2 py-1 text-right font-medium tabular-nums">{c.numeric > 0 ? fmtNum(c.sum) : "—"}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{fmtNum(c.avg)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{fmtNum(c.min)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{fmtNum(c.max)}</td>
                    </tr>
                  ))}
                  {shown.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-2 py-4 text-center text-neutral-400">
                        {result.totalRows === 0 ? "ไม่มีข้อมูล" : "ไม่มีคอลัมน์ตัวเลข"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

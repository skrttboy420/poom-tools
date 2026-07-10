"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { downloadText, downloadBlob } from "@/lib/reconcile/export";
import { rowsToCsv, rowsToXlsx, changeExt } from "@/lib/convertfile/convertfile";
import { transposeGrid } from "@/lib/transpose/transpose";
import FileDropzone from "@/components/FileDropzone";
import type { Cell, ParsedFile, Row, SideSelection } from "@/lib/reconcile/types";

const PREVIEW_ROWS = 300;
const MAX_COLS = 60;
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

interface FileState {
  file: ParsedFile;
  sel: SideSelection;
}

function makeSelection(file: ParsedFile, sheetIndex = 0): SideSelection {
  const rows = file.sheets[sheetIndex]?.rows ?? [];
  const headerRow = guessHeaderRow(rows);
  return { sheetIndex, headerRow, dataStart: headerRow + 1, dataEnd: null };
}

// สำหรับ transpose เราเอาทั้ง "หัวตาราง + ข้อมูล" (จากแถวหัวที่เลือกไปจนจบ) มาเป็นกริดเดียว
function gridOf(s: FileState | null): Row[] {
  if (!s) return [];
  const rows = s.file.sheets[s.sel.sheetIndex]?.rows ?? [];
  return rows.slice(s.sel.headerRow, s.sel.dataEnd ?? undefined);
}

function fmtCell(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "";
    return (Math.round(v * 1e6) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 6 });
  }
  return String(v);
}

export default function TransposePage() {
  const [state, setState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dropBlankRows, setDropBlankRows] = useState(true);

  const grid = useMemo(() => gridOf(state), [state]);

  const result = useMemo(
    () => (state ? transposeGrid(grid, { dropBlankRows }) : null),
    [state, grid, dropBlankRows],
  );

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
    if (!state || !result || result.error) return;
    downloadText(changeExt(state.file.fileName, "csv", "-สลับ"), rowsToCsv(result.rows), "text/csv");
  };
  const dlXlsx = () => {
    if (!state || !result || result.error) return;
    downloadBlob(changeExt(state.file.fileName, "xlsx", "-สลับ"), rowsToXlsx(result.rows), XLSX_MIME);
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];
  const shownRows = result && !result.error ? result.rows.slice(0, PREVIEW_ROWS) : [];
  const colCap = result && !result.error ? Math.min(result.outputCols, MAX_COLS) : 0;

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">สลับแถว ↔ คอลัมน์ (Transpose) ↔️</h1>
          <p className="text-xs text-neutral-500">
            พลิกตาราง — แถวกลายเป็นคอลัมน์ คอลัมน์กลายเป็นแถว · แค่ย้ายตำแหน่งเซลล์ ไม่แก้ค่า/ไม่ทิ้งข้อมูล (แถวไม่เท่ากันเติมช่องว่างให้เป็นสี่เหลี่ยม)
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
            <h2 className="text-sm font-semibold">ไฟล์ที่จะสลับ</h2>
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
                <label className="flex items-center gap-1" title="เริ่มสลับจากแถวนี้ลงไป (ข้ามหัวรายงาน/บล็อกสรุปด้านบนได้)">
                  เริ่มจากแถว (0-based):
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
                <span className="text-neutral-400">แถวที่จะสลับ: {Math.max(0, sheet.rows.length - state.sel.headerRow)}</span>
              </div>

              <div className="max-h-44 overflow-auto rounded border border-black/10 dark:border-white/10">
                <table className="w-full text-[11px]">
                  <tbody>
                    {preview.map((r, ri) => {
                      const isStart = ri === state.sel.headerRow;
                      const isBefore = ri < state.sel.headerRow;
                      return (
                        <tr key={ri} className={isStart ? "bg-black/5 font-medium dark:bg-white/10" : isBefore ? "text-neutral-400" : ""}>
                          <td className="border-r border-black/10 px-1 text-right text-neutral-400 dark:border-white/10">{ri}</td>
                          {r.slice(0, 10).map((c, ci) => (
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

        {/* STEP 2: ตัวเลือก */}
        {state && (
          <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
            <h2 className="mb-2 text-sm font-semibold">ตัวเลือก</h2>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400" title="ตัดแถวว่างทั้งแถวก่อนสลับ (กันไม่ให้เกิดคอลัมน์ว่างในผลลัพธ์)">
              <input type="checkbox" checked={dropBlankRows} onChange={(e) => setDropBlankRows(e.target.checked)} />
              ตัดแถวว่างทั้งแถวก่อนสลับ
            </label>
          </div>
        )}

        {/* STEP 3: ผลลัพธ์ */}
        {state && result && !result.error && (
          <div className="rounded-xl border border-black/10 dark:border-white/10">
            <div className="flex flex-wrap items-center gap-2 border-b border-black/10 px-3 py-2 text-xs dark:border-white/10">
              <span className="rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                <span className="tabular-nums">{result.inputRows}</span>×<span className="tabular-nums">{result.inputCols}</span> → <span className="tabular-nums">{result.outputRows}</span>×<span className="tabular-nums">{result.outputCols}</span> (แถว×คอลัมน์)
              </span>
              {result.droppedBlankRows > 0 && (
                <span className="text-neutral-400">ตัดแถวว่าง {result.droppedBlankRows}</span>
              )}
              {(result.outputRows > PREVIEW_ROWS || result.outputCols > MAX_COLS) && (
                <span className="text-amber-600 dark:text-amber-400">
                  แสดง {Math.min(result.outputRows, PREVIEW_ROWS)} แถว × {colCap} คอลัมน์แรก
                </span>
              )}
              <div className="ml-auto flex gap-2">
                <button onClick={dlCsv} className="rounded-md border border-emerald-600 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40">
                  ↓ CSV
                </button>
                <button onClick={dlXlsx} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700">
                  ↓ Excel
                </button>
              </div>
            </div>

            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full text-xs">
                <tbody>
                  {shownRows.map((r, ri) => (
                    <tr key={ri} className="border-t border-black/5 dark:border-white/5">
                      <td className="sticky left-0 z-10 border-r border-black/10 bg-neutral-50 px-2 py-1 text-right text-neutral-400 dark:border-white/10 dark:bg-neutral-900">
                        {ri + 1}
                      </td>
                      {r.slice(0, MAX_COLS).map((c, ci) => (
                        <td
                          key={ci}
                          className={`px-2 py-1 whitespace-nowrap ${
                            ci === 0 ? "bg-sky-50/60 font-medium text-sky-800 dark:bg-sky-950/20 dark:text-sky-300" : ""
                          }`}
                        >
                          {fmtCell(c)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {state && result?.error && (
          <p className="rounded-md border border-amber-500/30 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
            {result.error}
          </p>
        )}
      </section>
    </main>
  );
}

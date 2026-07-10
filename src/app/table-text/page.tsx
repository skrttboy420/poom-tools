"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { downloadText } from "@/lib/reconcile/export";
import { changeExt } from "@/lib/convertfile/convertfile";
import {
  tableToText,
  TABLE_TEXT_FORMATS,
  TABLE_TEXT_LABEL,
  type TableTextFormat,
} from "@/lib/tabletext/tabletext";
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

function headerOf(s: FileState | null): Row {
  if (!s) return [];
  const rows = s.file.sheets[s.sel.sheetIndex]?.rows ?? [];
  return rows[s.sel.headerRow] ?? [];
}

function dataRowsOf(s: FileState | null): Row[] {
  if (!s) return [];
  const rows = s.file.sheets[s.sel.sheetIndex]?.rows ?? [];
  return rows.slice(s.sel.dataStart, s.sel.dataEnd ?? undefined);
}

const EXT_FOR: Record<TableTextFormat, string> = {
  markdown: "md",
  aligned: "txt",
  tsv: "tsv",
};

export default function TableTextPage() {
  const [state, setState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const [format, setFormat] = useState<TableTextFormat>("markdown");
  const [alignNumericRight, setAlignNumericRight] = useState(true);
  const [includeHeader, setIncludeHeader] = useState(true);
  const [dropBlankRows, setDropBlankRows] = useState(true);

  const header = useMemo(() => headerOf(state), [state]);
  const dataRows = useMemo(() => dataRowsOf(state), [state]);

  const result = useMemo(
    () =>
      state
        ? tableToText(header, dataRows, {
            format,
            alignNumericRight,
            includeHeader,
            dropBlankRows,
          })
        : null,
    [state, header, dataRows, format, alignNumericRight, includeHeader, dropBlankRows],
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

  const copy = async () => {
    if (!result || result.error) return;
    try {
      await navigator.clipboard.writeText(result.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };

  const download = () => {
    if (!state || !result || result.error) return;
    const ext = EXT_FOR[result.format];
    const mime = ext === "md" ? "text/markdown" : "text/plain";
    downloadText(changeExt(state.file.fileName, ext, "-ตาราง"), result.text, mime);
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet
    ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8))
    : [];

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">ตาราง → ข้อความ (Markdown / TSV) 📋</h1>
          <p className="text-xs text-neutral-500">
            แปลงตารางเป็นข้อความพร้อม paste — Markdown (ลง PR/README/แชท) · จัดคอลัมน์อ่านง่าย · TSV
            (วางเข้า Excel/Sheets แตกคอลัมน์เอง) · แค่จัดรูป ไม่แก้ค่า
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
            <h2 className="text-sm font-semibold">ไฟล์ตาราง</h2>
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
            label={
              state
                ? `เปลี่ยนไฟล์ — ${state.file.fileName}`
                : "ลากไฟล์มาวาง หรือคลิกเลือก (.xlsx / .csv)"
            }
          />

          {state && sheet && (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                {state.file.sheets.length > 1 && (
                  <label className="flex items-center gap-1">
                    ชีต:
                    <select
                      value={state.sel.sheetIndex}
                      onChange={(e) =>
                        updateSel({
                          sheetIndex: Number(e.target.value),
                          headerRow: 0,
                          dataStart: 1,
                          dataEnd: null,
                        })
                      }
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
                <label className="flex items-center gap-1" title="แถวที่เป็นหัวตาราง (0-based)">
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
                <span className="text-neutral-400">แถวข้อมูล: {dataRows.length}</span>
              </div>

              <div className="max-h-44 overflow-auto rounded border border-black/10 dark:border-white/10">
                <table className="w-full text-[11px]">
                  <tbody>
                    {preview.map((r, ri) => {
                      const isHead = ri === state.sel.headerRow;
                      const isBefore = ri < state.sel.headerRow;
                      return (
                        <tr
                          key={ri}
                          className={
                            isHead
                              ? "bg-black/5 font-medium dark:bg-white/10"
                              : isBefore
                                ? "text-neutral-400"
                                : ""
                          }
                        >
                          <td className="border-r border-black/10 px-1 text-right text-neutral-400 dark:border-white/10">
                            {ri}
                          </td>
                          {r.slice(0, 10).map((c, ci) => (
                            <td
                              key={ci}
                              className="max-w-[120px] truncate whitespace-nowrap px-1"
                            >
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
            <h2 className="mb-3 text-sm font-semibold">รูปแบบข้อความ</h2>
            <div className="flex flex-wrap gap-2">
              {TABLE_TEXT_FORMATS.map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
                    format === f
                      ? "border-indigo-600 bg-indigo-600 text-white"
                      : "border-black/15 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
                  }`}
                >
                  {TABLE_TEXT_LABEL[f]}
                </button>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-neutral-600 dark:text-neutral-400">
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={includeHeader}
                  onChange={(e) => setIncludeHeader(e.target.checked)}
                />
                รวมแถวหัวตาราง
              </label>
              <label
                className={`flex items-center gap-1.5 ${
                  format === "tsv"
                    ? "cursor-not-allowed opacity-40"
                    : "cursor-pointer"
                }`}
                title={format === "tsv" ? "TSV ไม่จัดคอลัมน์ (ปล่อยให้ Excel จัดเอง)" : ""}
              >
                <input
                  type="checkbox"
                  checked={alignNumericRight}
                  disabled={format === "tsv"}
                  onChange={(e) => setAlignNumericRight(e.target.checked)}
                />
                ชิดขวาคอลัมน์ตัวเลข
              </label>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={dropBlankRows}
                  onChange={(e) => setDropBlankRows(e.target.checked)}
                />
                ตัดแถวว่างทั้งแถว
              </label>
            </div>
          </div>
        )}

        {/* STEP 3: ผลลัพธ์ */}
        {state && result && !result.error && (
          <div className="rounded-xl border border-black/10 dark:border-white/10">
            <div className="flex flex-wrap items-center gap-2 border-b border-black/10 px-3 py-2 text-xs dark:border-white/10">
              <span className="rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                <span className="tabular-nums">{result.outputRows}</span> แถว ×{" "}
                <span className="tabular-nums">{result.outputCols}</span> คอลัมน์
              </span>
              {result.numericCols.length > 0 && (
                <span className="text-neutral-400">
                  คอลัมน์ตัวเลข {result.numericCols.length}
                </span>
              )}
              {result.droppedBlankRows > 0 && (
                <span className="text-neutral-400">ตัดแถวว่าง {result.droppedBlankRows}</span>
              )}
              <div className="ml-auto flex gap-2">
                <button
                  onClick={copy}
                  className="rounded-md border border-indigo-600 px-3 py-1.5 text-xs font-medium text-indigo-700 transition hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
                >
                  {copied ? "✓ คัดลอกแล้ว" : "⧉ คัดลอก"}
                </button>
                <button
                  onClick={download}
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-700"
                >
                  ↓ ดาวน์โหลด .{EXT_FOR[result.format]}
                </button>
              </div>
            </div>

            <div className="max-h-[60vh] overflow-auto p-3">
              <pre className="whitespace-pre font-mono text-xs leading-relaxed">
                {result.text}
              </pre>
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

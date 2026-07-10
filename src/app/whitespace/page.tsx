"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { columnOptionLabel } from "@/lib/reconcile/columns";
import { downloadText, downloadBlob } from "@/lib/reconcile/export";
import { rowsToCsv, rowsToXlsx, changeExt } from "@/lib/convertfile/convertfile";
import {
  scanHidden,
  visualize,
  ISSUE_KEYS,
  ISSUE_LABEL,
  type CleanOptions,
  type IssueKey,
} from "@/lib/hiddenchars/hiddenchars";
import FileDropzone from "@/components/FileDropzone";
import type { ParsedFile, Row, SideSelection } from "@/lib/reconcile/types";

const PREVIEW_FINDINGS = 300;
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

const CLEAN_TOGGLES: { key: keyof CleanOptions; label: string }[] = [
  { key: "normalizeUnicodeSpace", label: "NBSP/ช่องว่างพิเศษ → ช่องว่างปกติ" },
  { key: "tabToSpace", label: "Tab → ช่องว่าง" },
  { key: "removeZeroWidth", label: "ลบอักขระล่องหน (zero-width)" },
  { key: "stripControl", label: "อักขระควบคุม → ช่องว่าง" },
  { key: "collapseSpaces", label: "ยุบช่องว่างซ้ำ" },
  { key: "trim", label: "ตัดช่องว่างหัว-ท้าย" },
];

const ISSUE_COLOR: Record<IssueKey, string> = {
  leading: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  trailing: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
  double: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
  tab: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  nbsp: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  zerowidth: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  control: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/40 dark:text-fuchsia-300",
};

export default function WhitespacePage() {
  const [state, setState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [selCols, setSelCols] = useState<number[] | null>(null); // null = ทุกคอลัมน์
  const [opts, setOpts] = useState<CleanOptions>({});

  const header = useMemo(() => headerOf(state), [state]);
  const dataRows = useMemo(() => dataRowsOf(state), [state]);

  const result = useMemo(
    () =>
      state
        ? scanHidden(header, dataRows, {
            ...opts,
            cols: selCols ?? undefined,
          })
        : null,
    [state, header, dataRows, opts, selCols],
  );

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const parsed = await parseFile(file);
      const sel = makeSelection(parsed, 0);
      setState({ file: parsed, sel });
      setSelCols(null);
    } catch (e) {
      setError(`อ่านไฟล์ ${file.name} ไม่สำเร็จ: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const updateSel = useCallback((patch: Partial<SideSelection>) => {
    setState((cur) => (cur ? { ...cur, sel: { ...cur.sel, ...patch } } : cur));
  }, []);

  const width = useMemo(() => {
    let w = header.length;
    for (const r of dataRows) if (r.length > w) w = r.length;
    return w;
  }, [header, dataRows]);

  const toggleCol = (c: number) => {
    setSelCols((cur) => {
      const all = Array.from({ length: width }, (_, i) => i);
      const base = cur ?? all;
      const next = base.includes(c) ? base.filter((x) => x !== c) : [...base, c].sort((a, b) => a - b);
      return next.length === width ? null : next;
    });
  };
  const colSelected = (c: number) => (selCols === null ? true : selCols.includes(c));

  const dlCsv = () => {
    if (!state || !result || result.error) return;
    downloadText(
      changeExt(state.file.fileName, "csv", "-ล้างอักขระ"),
      rowsToCsv([header, ...result.cleanedRows]),
      "text/csv",
    );
  };
  const dlXlsx = () => {
    if (!state || !result || result.error) return;
    downloadBlob(
      changeExt(state.file.fileName, "xlsx", "-ล้างอักขระ"),
      rowsToXlsx([header, ...result.cleanedRows]),
      XLSX_MIME,
    );
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];
  const shownFindings = result && !result.error ? result.findings.slice(0, PREVIEW_FINDINGS) : [];

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">ตรวจอักขระซ่อน & ช่องว่างแปลก 👻</h1>
          <p className="text-xs text-neutral-500">
            ส่องหาตัวที่ตาไม่เห็น — NBSP / zero-width / ช่องว่างหัว-ท้าย / Tab ที่ทำให้ tracking
            &ldquo;ดูเหมือนกัน&rdquo; แต่ match ไม่ได้ · ดูก่อนแล้วค่อยล้าง ไม่แก้เงียบ ไม่ทำแถวหาย
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
            <h2 className="text-sm font-semibold">ไฟล์ที่จะตรวจ</h2>
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
          <div className="space-y-4 rounded-xl border border-black/10 p-4 dark:border-white/10">
            <div>
              <h2 className="mb-2 text-sm font-semibold">คอลัมน์ที่ตรวจ</h2>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: width }, (_, c) => (
                  <button
                    key={c}
                    onClick={() => toggleCol(c)}
                    className={`rounded-full border px-2.5 py-1 text-xs transition ${
                      colSelected(c)
                        ? "border-indigo-600 bg-indigo-600 text-white"
                        : "border-black/15 text-neutral-500 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
                    }`}
                  >
                    {columnOptionLabel(header[c], c)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h2 className="mb-2 text-sm font-semibold">วิธีล้าง (ผลลัพธ์ที่จะดาวน์โหลด)</h2>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-neutral-600 dark:text-neutral-400">
                {CLEAN_TOGGLES.map(({ key, label }) => (
                  <label key={key} className="flex cursor-pointer items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={opts[key] !== false}
                      onChange={(e) => setOpts((cur) => ({ ...cur, [key]: e.target.checked }))}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: ผลลัพธ์ */}
        {state && result && !result.error && (
          <div className="rounded-xl border border-black/10 dark:border-white/10">
            <div className="flex flex-wrap items-center gap-2 border-b border-black/10 px-3 py-2 text-xs dark:border-white/10">
              {result.affectedCells === 0 ? (
                <span className="rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                  ✓ สะอาด — ไม่พบอักขระซ่อน ({result.scannedCells} ช่อง)
                </span>
              ) : (
                <>
                  <span className="rounded-full bg-red-100 px-3 py-1 font-medium text-red-800 dark:bg-red-900/40 dark:text-red-300">
                    พบปัญหา {result.affectedCells} ช่อง · {result.affectedRows} แถว
                  </span>
                  <span className="text-neutral-400">ล้างแล้วเปลี่ยน {result.changedCells} ช่อง</span>
                </>
              )}
              <div className="ml-auto flex gap-2">
                <button
                  onClick={dlCsv}
                  className="rounded-md border border-emerald-600 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                >
                  ↓ CSV (ล้างแล้ว)
                </button>
                <button
                  onClick={dlXlsx}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700"
                >
                  ↓ Excel (ล้างแล้ว)
                </button>
              </div>
            </div>

            {result.affectedCells > 0 && (
              <>
                <div className="flex flex-wrap gap-1.5 border-b border-black/10 px-3 py-2 dark:border-white/10">
                  {ISSUE_KEYS.filter((k) => result.counts[k] > 0).map((k) => (
                    <span
                      key={k}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${ISSUE_COLOR[k]}`}
                    >
                      {ISSUE_LABEL[k]} · {result.counts[k]}
                    </span>
                  ))}
                </div>

                <div className="max-h-[55vh] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-neutral-50 dark:bg-neutral-900">
                      <tr className="text-left text-neutral-500">
                        <th className="px-2 py-1.5 font-medium">แถว</th>
                        <th className="px-2 py-1.5 font-medium">คอลัมน์</th>
                        <th className="px-2 py-1.5 font-medium">ก่อน (แสดงอักขระซ่อน)</th>
                        <th className="px-2 py-1.5 font-medium">หลังล้าง</th>
                        <th className="px-2 py-1.5 font-medium">ปัญหา</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shownFindings.map((f, i) => (
                        <tr key={i} className="border-t border-black/5 dark:border-white/5">
                          <td className="px-2 py-1 text-right tabular-nums text-neutral-400">
                            {f.row + 1}
                          </td>
                          <td className="px-2 py-1 whitespace-nowrap text-neutral-500">
                            {columnOptionLabel(header[f.col], f.col)}
                          </td>
                          <td className="px-2 py-1 font-mono whitespace-pre">
                            <span className="rounded bg-red-50 px-1 dark:bg-red-950/30">
                              {visualize(f.before)}
                            </span>
                          </td>
                          <td className="px-2 py-1 font-mono whitespace-pre">
                            <span className="rounded bg-emerald-50 px-1 dark:bg-emerald-950/30">
                              {visualize(f.after)}
                            </span>
                          </td>
                          <td className="px-2 py-1">
                            <span className="flex flex-wrap gap-1">
                              {f.issues.map((k) => (
                                <span
                                  key={k}
                                  className={`rounded px-1.5 py-0.5 text-[10px] ${ISSUE_COLOR[k]}`}
                                >
                                  {ISSUE_LABEL[k]}
                                </span>
                              ))}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {result.cappedFindings && (
                  <p className="border-t border-black/10 px-3 py-2 text-[11px] text-amber-600 dark:border-white/10 dark:text-amber-400">
                    แสดง {PREVIEW_FINDINGS} รายการแรก (ไฟล์ที่ดาวน์โหลดล้างครบทุกช่อง)
                  </p>
                )}
                <p className="border-t border-black/10 px-3 py-2 text-[11px] text-neutral-400 dark:border-white/10">
                  สัญลักษณ์: · = ช่องว่าง · → = Tab · ␣ = ช่องว่างพิเศษ (NBSP) · ∅ = อักขระล่องหน · ⍰
                  = อักขระควบคุม
                </p>
              </>
            )}
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

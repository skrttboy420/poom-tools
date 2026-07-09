"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { columnOptionLabel, columnLetter } from "@/lib/reconcile/columns";
import { downloadText, downloadBlob } from "@/lib/reconcile/export";
import { rowsToCsv, rowsToXlsx, changeExt } from "@/lib/convertfile/convertfile";
import { sortRows, type SortDir, type SortType, type SortKey } from "@/lib/sorttable/sort";
import FileDropzone from "@/components/FileDropzone";
import type { ParsedFile, Row, SideSelection } from "@/lib/reconcile/types";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PREVIEW_ROWS = 300;

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

let uid = 0;
type Key = SortKey & { id: number };
const newKey = (col = 0): Key => ({ id: ++uid, col, dir: "asc", type: "auto" });

const TYPE_LABEL: Record<SortType, string> = { auto: "อัตโนมัติ", number: "ตัวเลข", text: "ข้อความ" };
const TYPES: SortType[] = ["auto", "number", "text"];

export default function SortPage() {
  const [state, setState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [keys, setKeys] = useState<Key[]>([]);
  const [blanksLast, setBlanksLast] = useState(true);
  const [ci, setCi] = useState(true);

  const header = useMemo(() => headerRowOf(state), [state]);
  const data = useMemo(() => dataRowsOf(state), [state]);
  const headerStr = useMemo(() => header.map((h) => (h === null ? "" : String(h))), [header]);

  const validKeys = useMemo(() => keys.filter((k) => k.col >= 0 && k.col < header.length), [keys, header]);

  const result = useMemo(
    () => sortRows(headerStr, data, validKeys, { blanksLast, caseInsensitive: ci }),
    [headerStr, data, validKeys, blanksLast, ci],
  );

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const parsed = await parseFile(file);
      setState({ file: parsed, sel: makeSelection(parsed, 0) });
      setKeys([newKey(0)]);
    } catch (e) {
      setError(`อ่านไฟล์ ${file.name} ไม่สำเร็จ: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const updateSel = useCallback((patch: Partial<SideSelection>) => {
    setState((cur) => (cur ? { ...cur, sel: { ...cur.sel, ...patch } } : cur));
  }, []);

  const patchKey = (id: number, patch: Partial<Key>) =>
    setKeys((cur) => cur.map((k) => (k.id === id ? { ...k, ...patch } : k)));
  const removeKey = (id: number) => setKeys((cur) => cur.filter((k) => k.id !== id));

  const dlCsv = () => {
    if (!state) return;
    downloadText(changeExt(state.file.fileName, "csv", "-เรียง"), rowsToCsv([result.header, ...result.rows]), "text/csv");
  };
  const dlXlsx = () => {
    if (!state) return;
    downloadBlob(changeExt(state.file.fileName, "xlsx", "-เรียง"), rowsToXlsx([result.header, ...result.rows]), XLSX_MIME);
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];
  const shownRows = result.rows.slice(0, PREVIEW_ROWS);

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">เรียงลำดับตาราง ↕️</h1>
          <p className="text-xs text-neutral-500">
            เรียงแถวตามหลายคอลัมน์ (เช่น ตู้ แล้วน้ำหนักมาก→น้อย) · รู้จักตัวเลข (เรียงเลขจริง) · ช่องว่างไปท้าย · แถวไม่หาย
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
            <h2 className="text-sm font-semibold">ไฟล์ที่จะเรียง</h2>
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
                          {r.slice(0, 8).map((c, ci2) => (
                            <td key={ci2} className="max-w-[120px] truncate whitespace-nowrap px-1">
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

        {/* STEP 2: คีย์เรียง */}
        {state && (
          <div className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
            <h2 className="text-sm font-semibold">เรียงตาม (ลำดับความสำคัญบน→ล่าง)</h2>
            <div className="space-y-2">
              {keys.map((k, idx) => (
                <div key={k.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-5 text-right text-xs text-neutral-400 tabular-nums">{idx + 1}</span>
                  <select
                    value={k.col}
                    onChange={(e) => patchKey(k.id, { col: Number(e.target.value) })}
                    className="rounded border border-black/15 bg-transparent px-2 py-1.5 dark:border-white/15 dark:bg-neutral-900"
                  >
                    {header.map((h, i) => (
                      <option key={i} value={i} title={columnOptionLabel(h, i)}>
                        {columnLetter(i)} · {h === null || String(h).trim() === "" ? "(ว่าง)" : String(h)}
                      </option>
                    ))}
                  </select>

                  <div className="flex overflow-hidden rounded-lg border border-black/15 text-xs dark:border-white/15">
                    {(["asc", "desc"] as SortDir[]).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => patchKey(k.id, { dir: d })}
                        className={`px-2.5 py-1.5 transition ${k.dir === d ? "bg-emerald-600 text-white" : "hover:bg-black/5 dark:hover:bg-white/5"}`}
                      >
                        {d === "asc" ? "น้อย→มาก ↑" : "มาก→น้อย ↓"}
                      </button>
                    ))}
                  </div>

                  <select
                    value={k.type ?? "auto"}
                    onChange={(e) => patchKey(k.id, { type: e.target.value as SortType })}
                    className="rounded border border-black/15 bg-transparent px-2 py-1.5 text-xs dark:border-white/15 dark:bg-neutral-900"
                    title="ชนิดการเปรียบเทียบ"
                  >
                    {TYPES.map((t) => (
                      <option key={t} value={t}>
                        {TYPE_LABEL[t]}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => removeKey(k.id)}
                    disabled={keys.length <= 1}
                    className="ml-auto rounded border border-black/15 px-2 py-1 text-xs text-neutral-500 hover:bg-black/5 disabled:opacity-30 dark:border-white/15 dark:hover:bg-white/10"
                  >
                    ลบ
                  </button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <button
                onClick={() => setKeys((cur) => [...cur, newKey(0)])}
                className="rounded-md border border-dashed border-black/25 px-3 py-1.5 text-xs text-neutral-500 hover:bg-black/5 dark:border-white/25 dark:hover:bg-white/5"
              >
                + เพิ่มคีย์เรียง
              </button>
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
                <input type="checkbox" checked={blanksLast} onChange={(e) => setBlanksLast(e.target.checked)} />
                ช่องว่างไปท้าย
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
                <input type="checkbox" checked={ci} onChange={(e) => setCi(e.target.checked)} />
                ไม่สนพิมพ์เล็ก/ใหญ่
              </label>
            </div>
          </div>
        )}

        {/* STEP 3: ผลลัพธ์ */}
        {state && (
          <div className="rounded-xl border border-black/10 dark:border-white/10">
            <div className="flex flex-wrap items-center gap-2 border-b border-black/10 px-3 py-2 text-xs dark:border-white/10">
              <span className="rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                <span className="tabular-nums">{result.rowCount}</span> แถว
              </span>
              {result.rowCount > PREVIEW_ROWS && <span className="text-neutral-400">แสดง {PREVIEW_ROWS} แถวแรก</span>}
              <div className="ml-auto flex gap-2">
                <button
                  onClick={dlCsv}
                  className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                >
                  ↓ CSV
                </button>
                <button
                  onClick={dlXlsx}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700"
                >
                  ↓ Excel
                </button>
              </div>
            </div>

            <div className="max-h-[55vh] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-900">
                  <tr>
                    <th className="px-2 py-1.5">#</th>
                    {header.map((h, i) => (
                      <th key={i} className="px-2 py-1.5 whitespace-nowrap">
                        {h === null || String(h).trim() === "" ? columnLetter(i) : String(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shownRows.map((r, ri) => (
                    <tr key={ri} className="border-t border-black/5 dark:border-white/5">
                      <td className="px-2 py-1 text-right text-neutral-400 tabular-nums">{ri + 1}</td>
                      {header.map((_, ci2) => (
                        <td key={ci2} className="max-w-[200px] truncate whitespace-nowrap px-2 py-1">
                          {r[ci2] === null || r[ci2] === undefined ? "" : String(r[ci2])}
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

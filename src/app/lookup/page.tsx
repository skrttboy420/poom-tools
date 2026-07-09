"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { columnLetter } from "@/lib/reconcile/columns";
import { downloadText, downloadBlob } from "@/lib/reconcile/export";
import { rowsToCsv, rowsToXlsx, changeExt } from "@/lib/convertfile/convertfile";
import { lookupJoin, type LookupSpec } from "@/lib/lookup/lookup";
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

const KEY_GUESS = ["tracking", "เลขพัสดุ", "พัสดุ", "awb", "หมายเลข", "barcode", "เลขที่", "ref"];
function guessKeyCol(header: Row): number {
  for (let i = 0; i < header.length; i++) {
    const s = String(header[i] ?? "").toLowerCase();
    if (KEY_GUESS.some((g) => s.includes(g))) return i;
  }
  return 0;
}

export default function LookupPage() {
  const [aState, setAState] = useState<FileState | null>(null);
  const [bState, setBState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyA, setBusyA] = useState(false);
  const [busyB, setBusyB] = useState(false);

  const [aKey, setAKey] = useState(0);
  const [bKey, setBKey] = useState(0);
  const [bCols, setBCols] = useState<number[]>([]);
  const [ci, setCi] = useState(true);
  const [trim, setTrim] = useState(true);
  const [onMultiple, setOnMultiple] = useState<"first" | "last">("first");

  const aHeader = useMemo(() => headerRowOf(aState), [aState]);
  const bHeader = useMemo(() => headerRowOf(bState), [bState]);
  const aData = useMemo(() => dataRowsOf(aState), [aState]);
  const bData = useMemo(() => dataRowsOf(bState), [bState]);
  const aHeaderStr = useMemo(() => aHeader.map((h) => (h === null ? "" : String(h))), [aHeader]);
  const bHeaderStr = useMemo(() => bHeader.map((h) => (h === null ? "" : String(h))), [bHeader]);

  const specs: LookupSpec[] = useMemo(
    () => bCols.filter((c) => c >= 0 && c < bHeader.length).map((c) => ({ bCol: c })),
    [bCols, bHeader],
  );

  const ready = aState && bState;
  const result = useMemo(() => {
    if (!ready) return null;
    return lookupJoin(aHeaderStr, aData, aKey, bHeaderStr, bData, bKey, specs, {
      caseInsensitive: ci,
      trim,
      onMultiple,
    });
  }, [ready, aHeaderStr, aData, aKey, bHeaderStr, bData, bKey, specs, ci, trim, onMultiple]);

  const handleA = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusyA(true);
    try {
      const parsed = await parseFile(file);
      const sel = makeSelection(parsed, 0);
      setAState({ file: parsed, sel });
      setAKey(guessKeyCol(parsed.sheets[sel.sheetIndex]?.rows[sel.headerRow] ?? []));
    } catch (e) {
      setError(`อ่านไฟล์หลัก ${file.name} ไม่สำเร็จ: ${(e as Error).message}`);
    } finally {
      setBusyA(false);
    }
  }, []);

  const handleB = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusyB(true);
    try {
      const parsed = await parseFile(file);
      const sel = makeSelection(parsed, 0);
      setBState({ file: parsed, sel });
      const hdr = parsed.sheets[sel.sheetIndex]?.rows[sel.headerRow] ?? [];
      const key = guessKeyCol(hdr);
      setBKey(key);
      // default = ดึงทุกคอลัมน์ B ยกเว้นคอลัมน์ key
      setBCols(hdr.map((_, i) => i).filter((i) => i !== key));
    } catch (e) {
      setError(`อ่านไฟล์อ้างอิง ${file.name} ไม่สำเร็จ: ${(e as Error).message}`);
    } finally {
      setBusyB(false);
    }
  }, []);

  const updateSelA = useCallback((patch: Partial<SideSelection>) => {
    setAState((cur) => (cur ? { ...cur, sel: { ...cur.sel, ...patch } } : cur));
  }, []);
  const updateSelB = useCallback((patch: Partial<SideSelection>) => {
    setBState((cur) => (cur ? { ...cur, sel: { ...cur.sel, ...patch } } : cur));
  }, []);

  const toggleBCol = (i: number) =>
    setBCols((cur) => (cur.includes(i) ? cur.filter((c) => c !== i) : [...cur, i]));

  const dlCsv = () => {
    if (!aState || !result) return;
    downloadText(changeExt(aState.file.fileName, "csv", "-ดึงข้อมูล"), rowsToCsv([result.header, ...result.rows]), "text/csv");
  };
  const dlXlsx = () => {
    if (!aState || !result) return;
    downloadBlob(changeExt(aState.file.fileName, "xlsx", "-ดึงข้อมูล"), rowsToXlsx([result.header, ...result.rows]), XLSX_MIME);
  };

  const shownRows = result ? result.rows.slice(0, PREVIEW_ROWS) : [];
  const aWidth = aHeader.length;

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">ดึงข้อมูลข้ามไฟล์ (VLOOKUP) 🔗</h1>
          <p className="text-xs text-neutral-500">
            ไฟล์หลัก (A) ดึงคอลัมน์จากไฟล์อ้างอิง (B) โดย match ตาม key เช่น เติมน้ำหนัก/เลขตู้เข้า packing list · ทุกแถว A อยู่ครบ ไม่หาย
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

        {/* STEP 1: อัปโหลด 2 ไฟล์ */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* A */}
          <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
            <h2 className="mb-2 text-sm font-semibold">
              <span className="rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">A</span> ไฟล์หลัก (ตัวตั้ง)
            </h2>
            <FileDropzone
              onFile={handleA}
              accept=".xlsx,.xls,.csv,.tsv,.txt"
              busy={busyA}
              label={aState ? `เปลี่ยน — ${aState.file.fileName}` : "ลากไฟล์หลักมาวาง (.xlsx / .csv)"}
            />
            {aState && (
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                {aState.file.sheets.length > 1 && (
                  <label className="flex items-center gap-1">
                    ชีต:
                    <select
                      value={aState.sel.sheetIndex}
                      onChange={(e) => updateSelA({ sheetIndex: Number(e.target.value), headerRow: 0, dataStart: 1, dataEnd: null })}
                      className="rounded border border-black/15 bg-transparent px-1 py-0.5 dark:border-white/15 dark:bg-neutral-900"
                    >
                      {aState.file.sheets.map((s, i) => (
                        <option key={i} value={i}>{s.name}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="flex items-center gap-1">
                  แถวหัว:
                  <input
                    type="number"
                    min={0}
                    value={aState.sel.headerRow}
                    onChange={(e) => {
                      const h = Math.max(0, Number(e.target.value) || 0);
                      updateSelA({ headerRow: h, dataStart: h + 1 });
                    }}
                    className="w-14 rounded border border-black/15 bg-transparent px-1 py-0.5 dark:border-white/15"
                  />
                </label>
                <label className="flex items-center gap-1">
                  คีย์:
                  <select
                    value={aKey}
                    onChange={(e) => setAKey(Number(e.target.value))}
                    className="rounded border border-black/15 bg-transparent px-1 py-0.5 dark:border-white/15 dark:bg-neutral-900"
                  >
                    {aHeader.map((h, i) => (
                      <option key={i} value={i}>
                        {columnLetter(i)} · {h === null || String(h).trim() === "" ? "(ว่าง)" : String(h)}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="text-neutral-400">{aData.length} แถว</span>
              </div>
            )}
          </div>

          {/* B */}
          <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
            <h2 className="mb-2 text-sm font-semibold">
              <span className="rounded bg-violet-100 px-1.5 py-0.5 text-xs text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">B</span> ไฟล์อ้างอิง (ดึงคอลัมน์จากนี่)
            </h2>
            <FileDropzone
              onFile={handleB}
              accept=".xlsx,.xls,.csv,.tsv,.txt"
              busy={busyB}
              label={bState ? `เปลี่ยน — ${bState.file.fileName}` : "ลากไฟล์อ้างอิงมาวาง (.xlsx / .csv)"}
            />
            {bState && (
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                {bState.file.sheets.length > 1 && (
                  <label className="flex items-center gap-1">
                    ชีต:
                    <select
                      value={bState.sel.sheetIndex}
                      onChange={(e) => updateSelB({ sheetIndex: Number(e.target.value), headerRow: 0, dataStart: 1, dataEnd: null })}
                      className="rounded border border-black/15 bg-transparent px-1 py-0.5 dark:border-white/15 dark:bg-neutral-900"
                    >
                      {bState.file.sheets.map((s, i) => (
                        <option key={i} value={i}>{s.name}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="flex items-center gap-1">
                  แถวหัว:
                  <input
                    type="number"
                    min={0}
                    value={bState.sel.headerRow}
                    onChange={(e) => {
                      const h = Math.max(0, Number(e.target.value) || 0);
                      updateSelB({ headerRow: h, dataStart: h + 1 });
                    }}
                    className="w-14 rounded border border-black/15 bg-transparent px-1 py-0.5 dark:border-white/15"
                  />
                </label>
                <label className="flex items-center gap-1">
                  คีย์:
                  <select
                    value={bKey}
                    onChange={(e) => setBKey(Number(e.target.value))}
                    className="rounded border border-black/15 bg-transparent px-1 py-0.5 dark:border-white/15 dark:bg-neutral-900"
                  >
                    {bHeader.map((h, i) => (
                      <option key={i} value={i}>
                        {columnLetter(i)} · {h === null || String(h).trim() === "" ? "(ว่าง)" : String(h)}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="text-neutral-400">{bData.length} แถว</span>
              </div>
            )}
          </div>
        </div>

        {/* STEP 2: เลือกคอลัมน์ B + ตัวเลือก */}
        {ready && (
          <div className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
            <h2 className="text-sm font-semibold">คอลัมน์จาก B ที่จะดึงมาเติมใน A</h2>
            <div className="flex flex-wrap gap-1.5">
              {bHeader.map((h, i) => {
                if (i === bKey) return null;
                const on = bCols.includes(i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleBCol(i)}
                    className={`rounded-full border px-2.5 py-1 text-xs transition ${
                      on
                        ? "border-violet-600 bg-violet-600 text-white"
                        : "border-black/15 text-neutral-600 hover:bg-black/5 dark:border-white/15 dark:text-neutral-400 dark:hover:bg-white/5"
                    }`}
                  >
                    {columnLetter(i)} · {h === null || String(h).trim() === "" ? "(ว่าง)" : String(h)}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-4 pt-1">
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
                <input type="checkbox" checked={ci} onChange={(e) => setCi(e.target.checked)} />
                ไม่สนพิมพ์เล็ก/ใหญ่
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
                <input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} />
                ตัดช่องว่างหน้า-หลัง key
              </label>
              <label className="flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
                ถ้า key ใน B ซ้ำ:
                <select
                  value={onMultiple}
                  onChange={(e) => setOnMultiple(e.target.value as "first" | "last")}
                  className="rounded border border-black/15 bg-transparent px-1 py-0.5 dark:border-white/15 dark:bg-neutral-900"
                >
                  <option value="first">ใช้แถวแรก</option>
                  <option value="last">ใช้แถวสุดท้าย</option>
                </select>
              </label>
            </div>
          </div>
        )}

        {/* STEP 3: ผลลัพธ์ */}
        {result && (
          <div className="rounded-xl border border-black/10 dark:border-white/10">
            <div className="flex flex-wrap items-center gap-2 border-b border-black/10 px-3 py-2 text-xs dark:border-white/10">
              <span className="rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                เจอ <span className="tabular-nums">{result.matched}</span>
              </span>
              {result.unmatched > 0 && (
                <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                  ไม่เจอ <span className="tabular-nums">{result.unmatched}</span>
                </span>
              )}
              {result.duplicateKeysB > 0 && (
                <span className="rounded-full bg-orange-100 px-3 py-1 font-medium text-orange-800 dark:bg-orange-900/40 dark:text-orange-300" title="key ที่ซ้ำในไฟล์ B — เลือกได้ว่าใช้แถวแรก/สุดท้าย">
                  key B ซ้ำ <span className="tabular-nums">{result.duplicateKeysB}</span>
                </span>
              )}
              <span className="text-neutral-400">
                {result.inputRows} แถว · เติม {result.addedCols} คอลัมน์
              </span>
              {result.rows.length > PREVIEW_ROWS && <span className="text-neutral-400">· แสดง {PREVIEW_ROWS} แถวแรก</span>}
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
                    {result.header.map((h, i) => (
                      <th
                        key={i}
                        className={`px-2 py-1.5 whitespace-nowrap ${i >= aWidth ? "text-violet-700 dark:text-violet-400" : ""}`}
                      >
                        {h === null || String(h).trim() === "" ? columnLetter(i) : String(h)}
                        {i >= aWidth && " (B)"}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shownRows.map((r, ri) => (
                    <tr key={ri} className="border-t border-black/5 dark:border-white/5">
                      <td className="px-2 py-1 text-right text-neutral-400 tabular-nums">{ri + 1}</td>
                      {result.header.map((_, ci2) => {
                        const brought = ci2 >= aWidth;
                        const empty = r[ci2] === null || r[ci2] === undefined || r[ci2] === "";
                        return (
                          <td
                            key={ci2}
                            className={`max-w-[200px] truncate whitespace-nowrap px-2 py-1 ${
                              brought
                                ? empty
                                  ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                                  : "bg-violet-50 text-violet-800 dark:bg-violet-950/30 dark:text-violet-200"
                                : ""
                            }`}
                          >
                            {r[ci2] === null || r[ci2] === undefined ? "" : String(r[ci2])}
                          </td>
                        );
                      })}
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

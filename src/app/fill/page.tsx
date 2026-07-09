"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { columnLetter } from "@/lib/reconcile/columns";
import { downloadText, downloadBlob } from "@/lib/reconcile/export";
import { rowsToCsv, rowsToXlsx, changeExt } from "@/lib/convertfile/convertfile";
import { fillCells, type FillDir } from "@/lib/fill/fill";
import FileDropzone from "@/components/FileDropzone";
import type { ParsedFile, Cell, Row, SideSelection } from "@/lib/reconcile/types";

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

// เดาคอลัมน์ที่ควรเติม: ตู้/container มาก่อน (use-case iTAM) แล้วค่อยพวก forwarder
const GUESS = ["container", "ตู้", "เลขตู้", "cabinet", "tank", "cntr", "forwarder", "ฝากนำเข้า"];
function guessFillCols(header: Row): number[] {
  const found: number[] = [];
  header.forEach((h, i) => {
    const s = String(h ?? "").toLowerCase();
    if (GUESS.some((g) => s.includes(g))) found.push(i);
  });
  return found.length ? found : header.length ? [0] : [];
}

function isBlank(v: Cell, trim: boolean): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return trim ? v.trim() === "" : v === "";
  return false;
}

export default function FillPage() {
  const [state, setState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cols, setCols] = useState<number[]>([]);
  const [dir, setDir] = useState<FillDir>("down");
  const [trimBlank, setTrimBlank] = useState(true);
  const [resetOnBlankRow, setResetOnBlankRow] = useState(false);

  const header = useMemo(() => headerRowOf(state), [state]);
  const data = useMemo(() => dataRowsOf(state), [state]);
  const headerStr = useMemo(() => header.map((h) => (h === null ? "" : String(h))), [header]);

  const validCols = useMemo(() => cols.filter((c) => c >= 0 && c < header.length), [cols, header]);

  const result = useMemo(
    () => fillCells(headerStr, data, validCols, { direction: dir, trimBlank, resetOnBlankRow }),
    [headerStr, data, validCols, dir, trimBlank, resetOnBlankRow],
  );

  // ช่องที่ถูก "เติม" = เดิมว่าง + ผลลัพธ์มีค่า (ไว้ไฮไลต์)
  const filledSet = useMemo(() => {
    const set = new Set<string>();
    for (const c of validCols) {
      for (let ri = 0; ri < result.rows.length; ri++) {
        const orig = data[ri]?.[c] ?? null;
        const now = result.rows[ri]?.[c] ?? null;
        if (isBlank(orig, trimBlank) && !isBlank(now, trimBlank)) set.add(`${ri}:${c}`);
      }
    }
    return set;
  }, [validCols, result.rows, data, trimBlank]);

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const parsed = await parseFile(file);
      const sel = makeSelection(parsed, 0);
      setState({ file: parsed, sel });
      const hdr = parsed.sheets[sel.sheetIndex]?.rows[sel.headerRow] ?? [];
      setCols(guessFillCols(hdr));
    } catch (e) {
      setError(`อ่านไฟล์ ${file.name} ไม่สำเร็จ: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const updateSel = useCallback((patch: Partial<SideSelection>) => {
    setState((cur) => (cur ? { ...cur, sel: { ...cur.sel, ...patch } } : cur));
  }, []);

  const toggleCol = (i: number) =>
    setCols((cur) => (cur.includes(i) ? cur.filter((c) => c !== i) : [...cur, i]));

  const dlCsv = () => {
    if (!state) return;
    downloadText(changeExt(state.file.fileName, "csv", "-เติม"), rowsToCsv([result.header, ...result.rows]), "text/csv");
  };
  const dlXlsx = () => {
    if (!state) return;
    downloadBlob(changeExt(state.file.fileName, "xlsx", "-เติม"), rowsToXlsx([result.header, ...result.rows]), XLSX_MIME);
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];
  const shownRows = result.rows.slice(0, PREVIEW_ROWS);

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">เติมค่าลงล่าง ⬇️</h1>
          <p className="text-xs text-neutral-500">
            เติมช่องว่างด้วยค่าล่าสุดด้านบน (เช่น เลขตู้ที่มีแค่แถวแรกของกลุ่ม) · เติมเฉพาะช่องว่าง ไม่ทับค่าเดิม · แถวไม่หาย
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
            <h2 className="text-sm font-semibold">ไฟล์ที่จะเติม</h2>
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

        {/* STEP 2: เลือกคอลัมน์ + ตัวเลือก */}
        {state && (
          <div className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
            <h2 className="text-sm font-semibold">คอลัมน์ที่จะเติมช่องว่าง</h2>
            <div className="flex flex-wrap gap-1.5">
              {header.map((h, i) => {
                const on = cols.includes(i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleCol(i)}
                    className={`rounded-full border px-2.5 py-1 text-xs transition ${
                      on
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-black/15 text-neutral-600 hover:bg-black/5 dark:border-white/15 dark:text-neutral-400 dark:hover:bg-white/5"
                    }`}
                  >
                    {columnLetter(i)} · {h === null || String(h).trim() === "" ? "(ว่าง)" : String(h)}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-4 pt-1">
              <div className="flex overflow-hidden rounded-lg border border-black/15 text-xs dark:border-white/15">
                {(["down", "up"] as FillDir[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDir(d)}
                    className={`px-3 py-1.5 transition ${dir === d ? "bg-emerald-600 text-white" : "hover:bg-black/5 dark:hover:bg-white/5"}`}
                  >
                    {d === "down" ? "เติมลงล่าง ⬇️" : "เติมขึ้นบน ⬆️"}
                  </button>
                ))}
              </div>
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
                <input type="checkbox" checked={trimBlank} onChange={(e) => setTrimBlank(e.target.checked)} />
                นับช่องเว้นวรรคล้วนเป็นว่าง
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
                <input type="checkbox" checked={resetOnBlankRow} onChange={(e) => setResetOnBlankRow(e.target.checked)} />
                เจอแถวว่างทั้งแถว = เริ่มกลุ่มใหม่ (ไม่ข้าม)
              </label>
            </div>
          </div>
        )}

        {/* STEP 3: ผลลัพธ์ */}
        {state && (
          <div className="rounded-xl border border-black/10 dark:border-white/10">
            <div className="flex flex-wrap items-center gap-2 border-b border-black/10 px-3 py-2 text-xs dark:border-white/10">
              <span className="rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                เติม <span className="tabular-nums">{result.filledTotal}</span> ช่อง
              </span>
              {result.stillBlank > 0 && (
                <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                  ยังว่าง <span className="tabular-nums">{result.stillBlank}</span> (ไม่มีค่าให้พาไป)
                </span>
              )}
              <span className="text-neutral-400">{result.inputRows} แถว</span>
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
                    {header.map((h, i) => (
                      <th key={i} className={`px-2 py-1.5 whitespace-nowrap ${cols.includes(i) ? "text-emerald-700 dark:text-emerald-400" : ""}`}>
                        {h === null || String(h).trim() === "" ? columnLetter(i) : String(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shownRows.map((r, ri) => (
                    <tr key={ri} className="border-t border-black/5 dark:border-white/5">
                      <td className="px-2 py-1 text-right text-neutral-400 tabular-nums">{ri + 1}</td>
                      {header.map((_, ci2) => {
                        const isFilled = filledSet.has(`${ri}:${ci2}`);
                        return (
                          <td
                            key={ci2}
                            className={`max-w-[200px] truncate whitespace-nowrap px-2 py-1 ${
                              isFilled ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" : ""
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

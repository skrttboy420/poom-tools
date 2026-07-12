"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { columnLetter } from "@/lib/reconcile/columns";
import { downloadText, downloadBlob } from "@/lib/reconcile/export";
import { rowsToCsv, rowsToXlsx, changeExt } from "@/lib/convertfile/convertfile";
import { fillBlank, type FillBlankMode } from "@/lib/fillblank/fillblank";
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

function headerRowOf(s: FileState): Row {
  return s.file.sheets[s.sel.sheetIndex]?.rows[s.sel.headerRow] ?? [];
}
function dataRowsOf(s: FileState): Row[] {
  const rows = s.file.sheets[s.sel.sheetIndex]?.rows ?? [];
  return rows.slice(s.sel.dataStart, s.sel.dataEnd ?? undefined);
}

const GUESS = ["น้ำหนัก", "kg", "weight", "cbm", "คิว", "สถานะ", "status", "forwarder", "ฝากนำเข้า"];
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

export default function FillBlankPage() {
  const [state, setState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cols, setCols] = useState<number[]>([]);
  const [mode, setMode] = useState<FillBlankMode>("constant");
  const [value, setValue] = useState("");
  const [trimBlank, setTrimBlank] = useState(true);
  const [coerceNumber, setCoerceNumber] = useState(true);

  const header = useMemo(() => (state ? headerRowOf(state) : []), [state]);
  const data = useMemo(() => (state ? dataRowsOf(state) : []), [state]);
  const headerStr = useMemo(() => header.map((h) => (h === null ? "" : String(h))), [header]);
  const validCols = useMemo(() => cols.filter((c) => c >= 0 && c < header.length), [cols, header.length]);

  const result = useMemo(
    () => fillBlank(headerStr, data, { cols: validCols, mode, value, trimBlank, coerceNumber }),
    [headerStr, data, validCols, mode, value, trimBlank, coerceNumber],
  );

  const filledSet = useMemo(() => {
    const set = new Set<string>();
    result.rows.forEach((row, ri) => {
      validCols.forEach((c) => {
        const orig = data[ri]?.[c] ?? null;
        const now = row[c] ?? null;
        if (isBlank(orig, trimBlank) && !isBlank(now, trimBlank)) set.add(`${ri}:${c}`);
      });
    });
    return set;
  }, [result.rows, data, validCols, trimBlank]);

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const parsed = await parseFile(file);
      const sel = makeSelection(parsed);
      setState({ file: parsed, sel });
      const hdr = parsed.sheets[sel.sheetIndex]?.rows[sel.headerRow] ?? [];
      setCols(guessFillCols(hdr));
    } catch (e) {
      setState(null);
      setError(`อ่านไฟล์ ${file.name} ไม่สำเร็จ: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const updateSel = useCallback((patch: Partial<SideSelection>) => {
    setState((prev) => (prev ? { ...prev, sel: { ...prev.sel, ...patch } } : prev));
  }, []);

  const toggleCol = useCallback((i: number) => {
    setCols((prev) => (prev.includes(i) ? prev.filter((c) => c !== i) : [...prev, i].sort((a, b) => a - b)));
  }, []);

  const dlCsv = useCallback(() => {
    if (!state) return;
    const name = changeExt(state.file.fileName, "csv", "-เติมช่องว่าง");
    downloadText(name, rowsToCsv([result.header, ...result.rows]), "text/csv");
  }, [state, result]);

  const dlXlsx = useCallback(() => {
    if (!state) return;
    const name = changeExt(state.file.fileName, "xlsx", "-เติมช่องว่าง");
    downloadBlob(name, rowsToXlsx([result.header, ...result.rows]), XLSX_MIME);
  }, [state, result]);

  const sheet = state?.file.sheets[state.sel.sheetIndex];
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];
  const shownRows = result.rows.slice(0, PREVIEW_ROWS);

  return (
    <main className="flex flex-1 flex-col">
      <div className="border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold">เติมค่าให้ช่องว่าง 🪣</h1>
            <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
              เติมเฉพาะช่องที่เว้นว่าง ด้วยค่าคงที่ (เช่น 0 / &quot;รอตรวจ&quot;) หรือค่าที่พบบ่อยสุดในคอลัมน์นั้น — ไม่ทับค่าที่มีอยู่
            </p>
          </div>
          <Link href="/" className="shrink-0 text-sm text-neutral-500 hover:underline dark:text-neutral-400">
            ← กลับหน้าหลัก
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-5 p-6">
        {/* STEP 1 — upload */}
        <section className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-neutral-900">
          <div className="mb-2 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-800 text-xs font-semibold text-white dark:bg-neutral-200 dark:text-neutral-900">
              1
            </span>
            <h2 className="text-sm font-semibold">อัปโหลดไฟล์</h2>
            {state?.file.via === "xlsx-repair" && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                ซ่อมไฟล์เพี้ยนแล้ว
              </span>
            )}
          </div>

          <FileDropzone
            onFile={handleFile}
            accept=".xlsx,.xls,.csv,.tsv,.txt"
            busy={busy}
            label={state ? `เปลี่ยนไฟล์ — ${state.file.fileName}` : "ลากไฟล์มาวาง หรือคลิกเลือก (.xlsx / .csv)"}
          />
          {error && <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{error}</p>}

          {sheet && (
            <div className="mt-3 flex flex-col gap-3">
              {state && state.file.sheets.length > 1 && (
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-neutral-500 dark:text-neutral-400">ชีต:</span>
                  <select
                    className="rounded-lg border border-black/15 bg-transparent px-2 py-1 dark:border-white/15"
                    value={state.sel.sheetIndex}
                    onChange={(e) => {
                      const idx = Number(e.target.value);
                      const s = makeSelection(state.file, idx);
                      setState({ ...state, sel: s });
                      setCols(guessFillCols(state.file.sheets[idx]?.rows[s.headerRow] ?? []));
                    }}
                  >
                    {state.file.sheets.map((sh, i) => (
                      <option key={i} value={i}>
                        {sh.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="flex items-center gap-2 text-sm">
                <span className="text-neutral-500 dark:text-neutral-400">แถวหัวตาราง:</span>
                <input
                  type="number"
                  min={0}
                  className="w-20 rounded-lg border border-black/15 bg-transparent px-2 py-1 dark:border-white/15"
                  value={state?.sel.headerRow ?? 0}
                  onChange={(e) => {
                    const hr = Math.max(0, Number(e.target.value));
                    updateSel({ headerRow: hr, dataStart: hr + 1 });
                    setCols(guessFillCols(sheet.rows[hr] ?? []));
                  }}
                />
              </label>

              <div className="overflow-auto rounded-lg border border-black/10 dark:border-white/10">
                <table className="min-w-full text-xs">
                  <tbody>
                    {preview.map((r, ri) => (
                      <tr
                        key={ri}
                        className={ri === state?.sel.headerRow ? "bg-emerald-50 dark:bg-emerald-900/20" : ""}
                      >
                        <td className="border border-black/5 px-2 py-1 text-neutral-400 dark:border-white/5">{ri}</td>
                        {r.slice(0, 8).map((c, ci) => (
                          <td key={ci} className="border border-black/5 px-2 py-1 dark:border-white/5">
                            {c === null ? "" : String(c)}
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

        {/* STEP 2 — options */}
        {sheet && (
          <section className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-neutral-900">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-800 text-xs font-semibold text-white dark:bg-neutral-200 dark:text-neutral-900">
                2
              </span>
              <h2 className="text-sm font-semibold">เลือกคอลัมน์ที่จะเติมช่องว่าง + วิธีเติม</h2>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {header.map((h, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleCol(i)}
                  className={`rounded-lg border px-2.5 py-1 text-xs transition ${
                    cols.includes(i)
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-black/15 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
                  }`}
                >
                  <span className="text-[10px] opacity-60">{columnLetter(i)}</span> {h === null || String(h) === "" ? `คอลัมน์ ${i + 1}` : String(h)}
                </button>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-4 pt-1">
              <div className="flex overflow-hidden rounded-lg border border-black/15 text-xs dark:border-white/15">
                {(["constant", "mode"] as FillBlankMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`px-3 py-1.5 transition ${
                      mode === m ? "bg-emerald-600 text-white" : "hover:bg-black/5 dark:hover:bg-white/5"
                    }`}
                  >
                    {m === "constant" ? "เติมด้วยค่าคงที่ ✏️" : "เติมด้วยค่าที่พบบ่อยสุด 📊"}
                  </button>
                ))}
              </div>

              {mode === "constant" && (
                <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
                  <span>ค่าที่จะเติม:</span>
                  <input
                    type="text"
                    className="w-40 rounded-lg border border-black/15 bg-transparent px-2 py-1 dark:border-white/15"
                    placeholder="เช่น 0 หรือ รอตรวจ"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setValue("0")}
                    className="rounded-md border border-black/15 px-2 py-1 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
                  >
                    0
                  </button>
                </label>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-4">
              {mode === "constant" && (
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
                  <input type="checkbox" checked={coerceNumber} onChange={(e) => setCoerceNumber(e.target.checked)} />
                  ค่าที่เป็นตัวเลข → เก็บเป็นตัวเลข (คงเลข 0 นำหน้าเป็นข้อความ)
                </label>
              )}
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
                <input type="checkbox" checked={trimBlank} onChange={(e) => setTrimBlank(e.target.checked)} />
                นับช่องเว้นวรรคล้วนเป็นว่าง
              </label>
            </div>
          </section>
        )}

        {/* STEP 3 — result */}
        {sheet && (
          <section className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-neutral-900">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-800 text-xs font-semibold text-white dark:bg-neutral-200 dark:text-neutral-900">
                  3
                </span>
                <h2 className="text-sm font-semibold">ผลลัพธ์</h2>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={dlCsv}
                  disabled={!!result.error}
                  className="rounded-lg border border-black/15 px-3 py-1.5 text-xs hover:bg-black/5 disabled:opacity-40 dark:border-white/15 dark:hover:bg-white/5"
                >
                  ↓ CSV
                </button>
                <button
                  type="button"
                  onClick={dlXlsx}
                  disabled={!!result.error}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
                >
                  ↓ Excel
                </button>
              </div>
            </div>

            {result.error ? (
              <p className="text-sm text-rose-600 dark:text-rose-400">{result.error}</p>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                    เติม <span className="tabular-nums">{result.filledCells}</span> ช่อง
                  </span>
                  {result.blankCells - result.filledCells > 0 && (
                    <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                      ยังว่าง <span className="tabular-nums">{result.blankCells - result.filledCells}</span> (ไม่มีค่าให้เติม)
                    </span>
                  )}
                  <span className="rounded-full bg-sky-100 px-3 py-1 font-medium text-sky-800 dark:bg-sky-900/40 dark:text-sky-300">
                    แตะ <span className="tabular-nums">{result.rowsAffected}</span> แถว
                  </span>
                  <span className="text-neutral-400">{result.dataRows} แถวข้อมูล</span>
                  {result.droppedBlankRows > 0 && (
                    <span className="text-neutral-400">· ตัดแถวว่าง {result.droppedBlankRows}</span>
                  )}
                  {result.rows.length > PREVIEW_ROWS && (
                    <span className="text-neutral-400">· แสดง {PREVIEW_ROWS} แถวแรก</span>
                  )}
                </div>

                <div className="max-h-[55vh] overflow-auto rounded-lg border border-black/10 dark:border-white/10">
                  <table className="min-w-full text-xs">
                    <thead className="sticky top-0 bg-neutral-100 dark:bg-neutral-800">
                      <tr>
                        <th className="border border-black/5 px-2 py-1 text-left font-medium text-neutral-400 dark:border-white/5">
                          #
                        </th>
                        {result.header.map((h, i) => (
                          <th
                            key={i}
                            className={`border border-black/5 px-2 py-1 text-left font-medium dark:border-white/5 ${
                              cols.includes(i) ? "text-emerald-700 dark:text-emerald-300" : ""
                            }`}
                          >
                            {h === null || String(h) === "" ? `คอลัมน์ ${i + 1}` : String(h)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {shownRows.map((row, ri) => (
                        <tr key={ri}>
                          <td className="border border-black/5 px-2 py-1 text-neutral-400 dark:border-white/5">{ri + 1}</td>
                          {row.map((c, ci) => (
                            <td
                              key={ci}
                              className={`border border-black/5 px-2 py-1 dark:border-white/5 ${
                                filledSet.has(`${ri}:${ci}`)
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                                  : ""
                              }`}
                            >
                              {c === null ? "" : String(c)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { columnLetter } from "@/lib/reconcile/columns";
import { downloadText, downloadBlob } from "@/lib/reconcile/export";
import { rowsToCsv, rowsToXlsx, changeExt } from "@/lib/convertfile/convertfile";
import { analyzeDateParts, PART_LABEL, type DatePart } from "@/lib/dateparts/dateparts";
import FileDropzone from "@/components/FileDropzone";
import type { ParsedFile, Row, SideSelection, Cell } from "@/lib/reconcile/types";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PREVIEW_ROWS = 300;
// ลำดับที่โชว์ในหน้า UI
const ALL_PARTS: DatePart[] = [
  "year",
  "buddhist-year",
  "month",
  "month-name",
  "day",
  "weekday",
  "quarter",
  "year-month",
  "iso-week",
];
const DEFAULT_PARTS: DatePart[] = ["year", "month", "day"];

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
function colLabel(header: Row, i: number): string {
  const h = header[i];
  return h === null || h === undefined || String(h).trim() === "" ? columnLetter(i) : String(h);
}
// เดาว่าเป็นค่าวันที่ไหม (นับช่องที่ parse เป็นวันที่ได้จากรูปแบบทั่วไป)
function dateScore(data: Row[], c: number): number {
  let n = 0;
  for (const row of data.slice(0, 60)) {
    const v = c < row.length ? row[c] : null;
    if (v === null || v === undefined) continue;
    if (typeof v === "number") {
      if (Number.isInteger(v) && v >= 20000 && v <= 60000) n++;
      continue;
    }
    const s = String(v).trim();
    if (s === "") continue;
    if (/^\d{8}$/.test(s) || /^\d{1,4}[/.\-]\d{1,2}[/.\-]\d{1,4}$/.test(s)) n++;
  }
  return n;
}
// เดาคอลัมน์วันที่: หัวเข้าข่าย date/วันที่/eta/etd ก่อน ไม่งั้นคอลัมน์ที่ค่าเป็นวันที่มากสุด
function guessCol(header: Row, data: Row[]): number {
  const keys = ["date", "วันที่", "วัน", "eta", "etd", "atd", "ata", "ตู้เข้า", "ship", "รับ", "ส่ง"];
  for (let i = 0; i < header.length; i++) {
    const h = String(header[i] ?? "").toLowerCase().trim();
    if (h !== "" && keys.some((k) => h.includes(k)) && dateScore(data, i) > 0) return i;
  }
  let best = -1;
  let bestScore = 0;
  for (let i = 0; i < header.length; i++) {
    const sc = dateScore(data, i);
    if (sc > bestScore) {
      bestScore = sc;
      best = i;
    }
  }
  return bestScore >= 1 ? best : -1;
}

export default function DatePartsPage() {
  const [state, setState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [col, setCol] = useState(-1);
  const [parts, setParts] = useState<DatePart[]>(DEFAULT_PARTS);
  const [dayFirst, setDayFirst] = useState(true);
  const [buddhistInput, setBuddhistInput] = useState(false);
  const [monthNameStyle, setMonthNameStyle] = useState<"full" | "abbr">("full");
  const [quarterStyle, setQuarterStyle] = useState<"q" | "number">("q");

  const header = useMemo(() => headerRowOf(state), [state]);
  const data = useMemo(() => dataRowsOf(state), [state]);
  const headerStr = useMemo(() => header.map((h) => (h === null ? "" : String(h))), [header]);

  const reguess = useCallback((rows: Row[], sel: SideSelection) => {
    const hdr = rows[sel.headerRow] ?? [];
    const dat = rows.slice(sel.dataStart);
    setCol(guessCol(hdr, dat));
  }, []);

  // เก็บ parts ตามลำดับ ALL_PARTS เสมอ (คาดเดาผลได้)
  const orderedParts = useMemo(() => ALL_PARTS.filter((p) => parts.includes(p)), [parts]);

  const result = useMemo(
    () =>
      analyzeDateParts(headerStr, data, {
        col,
        parts: orderedParts,
        dayFirst,
        buddhistInput,
        monthNameStyle,
        quarterStyle,
      }),
    [headerStr, data, col, orderedParts, dayFirst, buddhistInput, monthNameStyle, quarterStyle],
  );

  const togglePart = (p: DatePart) =>
    setParts((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setError(null);
      setBusy(true);
      try {
        const parsed = await parseFile(file);
        const sel = makeSelection(parsed, 0);
        setState({ file: parsed, sel });
        reguess(parsed.sheets[sel.sheetIndex]?.rows ?? [], sel);
      } catch (e) {
        setError(`อ่านไฟล์ ${file.name} ไม่สำเร็จ: ${(e as Error).message}`);
      } finally {
        setBusy(false);
      }
    },
    [reguess],
  );

  const updateSel = useCallback(
    (patch: Partial<SideSelection>) => {
      setState((cur) => {
        if (!cur) return cur;
        const sel = { ...cur.sel, ...patch };
        const rows = cur.file.sheets[sel.sheetIndex]?.rows ?? [];
        reguess(rows, sel);
        return { ...cur, sel };
      });
    },
    [reguess],
  );

  const dlCsv = () => {
    if (!state || result.error) return;
    downloadText(changeExt(state.file.fileName, "csv", "-แยกวันที่"), rowsToCsv([result.header, ...result.rows]), "text/csv");
  };
  const dlXlsx = () => {
    if (!state || result.error) return;
    downloadBlob(changeExt(state.file.fileName, "xlsx", "-แยกวันที่"), rowsToXlsx([result.header, ...result.rows]), XLSX_MIME);
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];
  const shownRows = result.rows.slice(0, PREVIEW_ROWS);
  const isNewCol = (i: number) => result.firstNewIndex >= 0 && i >= result.firstNewIndex;
  const cellStr = (v: Cell) => (v === null || v === undefined ? "" : String(v));

  const hasMonthName = parts.includes("month-name");
  const hasQuarter = parts.includes("quarter");

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">แยกส่วนวันที่ 📅</h1>
          <p className="text-xs text-neutral-500">
            แยกคอลัมน์วันที่ (ETD/ETA/วันตู้เข้า) เป็น ปี / เดือน / วัน / ไตรมาส / ปี-เดือน / วันในสัปดาห์ / สัปดาห์ ·
            เอาไปจัดกลุ่ม-สรุปตามเดือน/ไตรมาสต่อได้ (/group /pivot) · ช่อง parse ไม่ได้ = เว้นว่าง ไม่เดามั่ว
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
            <h2 className="text-sm font-semibold">ไฟล์ต้นทาง</h2>
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
                          {r.slice(0, 12).map((c, ci) => (
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

        {/* STEP 2: ตั้งค่า */}
        {state && (
          <div className="space-y-4 rounded-xl border border-black/10 p-4 dark:border-white/10">
            <label className="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400 sm:max-w-xs">
              <span>คอลัมน์วันที่</span>
              <select
                value={col}
                onChange={(e) => setCol(Number(e.target.value))}
                className="rounded border border-black/15 bg-transparent px-2 py-1 dark:border-white/15 dark:bg-neutral-900"
              >
                <option value={-1}>— เลือก —</option>
                {header.map((_, i) => (
                  <option key={i} value={i}>
                    {columnLetter(i)} · {colLabel(header, i)}
                  </option>
                ))}
              </select>
            </label>

            <div className="border-t border-black/5 pt-3 dark:border-white/5">
              <span className="text-xs text-neutral-500">ส่วนที่จะแยก (เติมคอลัมน์ใหม่ท้ายตาราง):</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {ALL_PARTS.map((p) => {
                  const on = parts.includes(p);
                  return (
                    <button
                      key={p}
                      onClick={() => togglePart(p)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                        on
                          ? "border-indigo-500/50 bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200"
                          : "border-black/15 text-neutral-500 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                      }`}
                    >
                      {on ? "✓ " : ""}
                      {PART_LABEL[p]}
                    </button>
                  );
                })}
              </div>
              {orderedParts.length === 0 && (
                <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">เลือกอย่างน้อย 1 ส่วน</p>
              )}
            </div>

            <div className="flex flex-wrap items-end gap-x-6 gap-y-3 border-t border-black/5 pt-3 text-xs text-neutral-600 dark:border-white/5 dark:text-neutral-400">
              <div>
                <span className="text-neutral-500">วันหรือเดือนมาก่อน (ตอนกำกวม เช่น 10/07/2025):</span>
                <div className="mt-1 flex gap-2">
                  <button
                    onClick={() => setDayFirst(true)}
                    className={`rounded-lg border px-3 py-1 font-medium transition ${
                      dayFirst
                        ? "border-sky-500/50 bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200"
                        : "border-black/15 text-neutral-500 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                    }`}
                  >
                    วัน/เดือน (DD/MM)
                  </button>
                  <button
                    onClick={() => setDayFirst(false)}
                    className={`rounded-lg border px-3 py-1 font-medium transition ${
                      !dayFirst
                        ? "border-sky-500/50 bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200"
                        : "border-black/15 text-neutral-500 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                    }`}
                  >
                    เดือน/วัน (MM/DD)
                  </button>
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-1.5">
                <input type="checkbox" checked={buddhistInput} onChange={(e) => setBuddhistInput(e.target.checked)} />
                ปีในไฟล์เป็น พ.ศ. (ลบ 543 ก่อน)
              </label>
            </div>

            {(hasMonthName || hasQuarter) && (
              <div className="flex flex-wrap items-end gap-x-6 gap-y-3 border-t border-black/5 pt-3 text-xs text-neutral-600 dark:border-white/5 dark:text-neutral-400">
                {hasMonthName && (
                  <div>
                    <span className="text-neutral-500">ชื่อเดือน:</span>
                    <div className="mt-1 flex gap-2">
                      <button
                        onClick={() => setMonthNameStyle("full")}
                        className={`rounded-lg border px-3 py-1 font-medium transition ${
                          monthNameStyle === "full"
                            ? "border-emerald-500/50 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                            : "border-black/15 text-neutral-500 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                        }`}
                      >
                        เต็ม (กรกฎาคม)
                      </button>
                      <button
                        onClick={() => setMonthNameStyle("abbr")}
                        className={`rounded-lg border px-3 py-1 font-medium transition ${
                          monthNameStyle === "abbr"
                            ? "border-emerald-500/50 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                            : "border-black/15 text-neutral-500 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                        }`}
                      >
                        ย่อ (ก.ค.)
                      </button>
                    </div>
                  </div>
                )}
                {hasQuarter && (
                  <div>
                    <span className="text-neutral-500">ไตรมาส:</span>
                    <div className="mt-1 flex gap-2">
                      <button
                        onClick={() => setQuarterStyle("q")}
                        className={`rounded-lg border px-3 py-1 font-medium transition ${
                          quarterStyle === "q"
                            ? "border-emerald-500/50 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                            : "border-black/15 text-neutral-500 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                        }`}
                      >
                        Q3
                      </button>
                      <button
                        onClick={() => setQuarterStyle("number")}
                        className={`rounded-lg border px-3 py-1 font-medium transition ${
                          quarterStyle === "number"
                            ? "border-emerald-500/50 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                            : "border-black/15 text-neutral-500 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                        }`}
                      >
                        เลข (3)
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* STEP 3: ผลลัพธ์ */}
        {state && (
          <div className="rounded-xl border border-black/10 dark:border-white/10">
            <div className="flex flex-wrap items-center gap-2 border-b border-black/10 px-3 py-2 text-xs dark:border-white/10">
              {result.error ? (
                <span className="rounded-full bg-red-100 px-3 py-1 font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300">
                  {result.error}
                </span>
              ) : (
                <>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                    แยกได้ <span className="tabular-nums">{result.computedRows}</span> แถว
                  </span>
                  {result.skippedRows > 0 && (
                    <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                      อ่านไม่ออก (เว้นว่าง) <span className="tabular-nums">{result.skippedRows}</span>
                    </span>
                  )}
                  {result.blankRows > 0 && (
                    <span className="rounded-full bg-neutral-100 px-3 py-1 font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                      ช่องว่าง <span className="tabular-nums">{result.blankRows}</span>
                    </span>
                  )}
                  <span className="rounded-full bg-sky-100 px-3 py-1 font-medium text-sky-800 dark:bg-sky-900/40 dark:text-sky-300">
                    เติม <span className="tabular-nums">{result.addedCols.length}</span> คอลัมน์
                  </span>
                </>
              )}
              {result.rows.length > PREVIEW_ROWS && <span className="text-neutral-400">แสดง {PREVIEW_ROWS} แถวแรก</span>}
              <div className="ml-auto flex gap-2">
                <button
                  onClick={dlCsv}
                  disabled={!!result.error}
                  className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium hover:bg-black/5 disabled:opacity-40 dark:border-white/15 dark:hover:bg-white/10"
                >
                  ↓ CSV
                </button>
                <button
                  onClick={dlXlsx}
                  disabled={!!result.error}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-40"
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
                      <th key={i} className={`px-2 py-1.5 whitespace-nowrap ${isNewCol(i) ? "text-indigo-700 dark:text-indigo-300" : ""}`}>
                        {h === "" || h === null ? columnLetter(i) : String(h)}
                        {isNewCol(i) && " 📅"}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shownRows.map((r, ri) => (
                    <tr key={ri} className="border-t border-black/5 dark:border-white/5">
                      <td className="px-2 py-1 text-right text-neutral-400 tabular-nums">{ri + 1}</td>
                      {result.header.map((_, ci) => (
                        <td
                          key={ci}
                          className={`max-w-[220px] truncate whitespace-nowrap px-2 py-1 tabular-nums ${
                            isNewCol(ci) ? "bg-indigo-50 font-medium dark:bg-indigo-950/30" : ""
                          }`}
                        >
                          {cellStr(r[ci] ?? null)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {result.rows.length === 0 && (
                    <tr>
                      <td colSpan={Math.max(1, result.header.length) + 1} className="px-2 py-4 text-center text-neutral-400">
                        ไม่มีแถวข้อมูล
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

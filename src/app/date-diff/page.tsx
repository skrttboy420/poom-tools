"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { columnLetter } from "@/lib/reconcile/columns";
import { downloadText, downloadBlob } from "@/lib/reconcile/export";
import { rowsToCsv, rowsToXlsx, changeExt } from "@/lib/convertfile/convertfile";
import { analyzeDateDiff, parseDateToMs, type DiffUnit } from "@/lib/datediff/datediff";
import FileDropzone from "@/components/FileDropzone";
import type { ParsedFile, Row, SideSelection, Cell } from "@/lib/reconcile/types";

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
function colLabel(header: Row, i: number): string {
  const h = header[i];
  return h === null || h === undefined || String(h).trim() === "" ? columnLetter(i) : String(h);
}
// นับช่องที่ parse เป็นวันที่ได้ใน 60 แถวแรก
function dateScore(data: Row[], c: number, dayFirst: boolean): number {
  let n = 0;
  for (const row of data.slice(0, 60)) {
    const v = c < row.length ? row[c] : null;
    if (parseDateToMs(v ?? null, dayFirst) !== null) n++;
  }
  return n;
}
// เดา 2 คอลัมน์วันที่: หัวเข้าข่ายเริ่ม/จบ ก่อน ไม่งั้นคอลัมน์วันที่ 2 ตัวแรก
function guessCols(header: Row, data: Row[], dayFirst: boolean): [number, number] {
  const startKeys = ["etd", "เริ่ม", "วันเข้า", "เข้า", "start", "from", "loading", "ต้นทาง", "ออกจาก", "issue", "วันที่รับ"];
  const endKeys = ["eta", "จบ", "วันออก", "ถึง", "end", "to", "arrival", "delivery", "ปลายทาง", "due", "กำหนด"];
  const isDate: number[] = [];
  for (let i = 0; i < header.length; i++) {
    if (dateScore(data, i, dayFirst) > 0) isDate.push(i);
  }
  const findByKey = (keys: string[]): number => {
    for (const i of isDate) {
      const h = String(header[i] ?? "").toLowerCase().trim();
      if (h !== "" && keys.some((k) => h.includes(k))) return i;
    }
    return -1;
  };
  let start = findByKey(startKeys);
  let end = findByKey(endKeys);
  const rest = isDate.filter((i) => i !== start && i !== end);
  if (start < 0) start = rest.shift() ?? (isDate[0] ?? -1);
  if (end < 0) end = rest.find((i) => i !== start) ?? isDate.find((i) => i !== start) ?? -1;
  return [start, end];
}

const UNITS: { id: DiffUnit; label: string }[] = [
  { id: "days", label: "วัน" },
  { id: "weeks", label: "สัปดาห์" },
];

export default function DateDiffPage() {
  const [state, setState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [startCol, setStartCol] = useState(-1);
  const [endCol, setEndCol] = useState(-1);
  const [unit, setUnit] = useState<DiffUnit>("days");
  const [absolute, setAbsolute] = useState(false);
  const [inclusive, setInclusive] = useState(false);
  const [dayFirst, setDayFirst] = useState(true);
  const [buddhistInput, setBuddhistInput] = useState(false);
  const [colName, setColName] = useState("");

  const header = useMemo(() => headerRowOf(state), [state]);
  const data = useMemo(() => dataRowsOf(state), [state]);
  const headerStr = useMemo(() => header.map((h) => (h === null ? "" : String(h))), [header]);

  const reguess = useCallback(
    (rows: Row[], sel: SideSelection, df: boolean) => {
      const hdr = rows[sel.headerRow] ?? [];
      const dat = rows.slice(sel.dataStart);
      const [s, e] = guessCols(hdr, dat, df);
      setStartCol(s);
      setEndCol(e);
    },
    [],
  );

  // weeks default ปัด 2 ตำแหน่ง · days เป็นจำนวนเต็ม (ไม่ปัด)
  const round = unit === "weeks" ? 2 : null;

  const result = useMemo(
    () =>
      analyzeDateDiff(headerStr, data, {
        startCol,
        endCol,
        unit,
        absolute,
        inclusive,
        dayFirst,
        buddhistInput,
        round,
        colName: colName.trim() === "" ? undefined : colName,
      }),
    [headerStr, data, startCol, endCol, unit, absolute, inclusive, dayFirst, buddhistInput, round, colName],
  );

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setError(null);
      setBusy(true);
      try {
        const parsed = await parseFile(file);
        const sel = makeSelection(parsed, 0);
        setState({ file: parsed, sel });
        reguess(parsed.sheets[sel.sheetIndex]?.rows ?? [], sel, dayFirst);
      } catch (e) {
        setError(`อ่านไฟล์ ${file.name} ไม่สำเร็จ: ${(e as Error).message}`);
      } finally {
        setBusy(false);
      }
    },
    [reguess, dayFirst],
  );

  const updateSel = useCallback(
    (patch: Partial<SideSelection>) => {
      setState((cur) => {
        if (!cur) return cur;
        const sel = { ...cur.sel, ...patch };
        const rows = cur.file.sheets[sel.sheetIndex]?.rows ?? [];
        reguess(rows, sel, dayFirst);
        return { ...cur, sel };
      });
    },
    [reguess, dayFirst],
  );

  const dlCsv = () => {
    if (!state || result.error) return;
    downloadText(changeExt(state.file.fileName, "csv", "-จำนวนวัน"), rowsToCsv([result.header, ...result.rows]), "text/csv");
  };
  const dlXlsx = () => {
    if (!state || result.error) return;
    downloadBlob(changeExt(state.file.fileName, "xlsx", "-จำนวนวัน"), rowsToXlsx([result.header, ...result.rows]), XLSX_MIME);
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];
  const shownRows = result.rows.slice(0, PREVIEW_ROWS);
  const isNewCol = (i: number) => result.firstNewIndex >= 0 && i >= result.firstNewIndex;
  const cellStr = (v: Cell) => (v === null || v === undefined ? "" : String(v));

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">คำนวณจำนวนวันระหว่างวันที่ 📆</h1>
          <p className="text-xs text-neutral-500">
            เลือก 2 คอลัมน์วันที่ → เติมคอลัมน์ผลต่าง (จบ − เริ่ม) · use-case จริง: ระยะเวลาขนส่ง ETA−ETD · วันเก็บตู้/เดโมเรจ · อายุงาน ·
            ช่องที่อ่านวันที่ไม่ได้ = เว้นว่าง ไม่เดามั่ว
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400">
                <span>วันที่เริ่ม (ตัวตั้ง)</span>
                <select
                  value={startCol}
                  onChange={(e) => setStartCol(Number(e.target.value))}
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
              <label className="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400">
                <span>วันที่จบ (จบ − เริ่ม)</span>
                <select
                  value={endCol}
                  onChange={(e) => setEndCol(Number(e.target.value))}
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
            </div>

            <div className="flex flex-wrap items-end gap-6 border-t border-black/5 pt-3 dark:border-white/5">
              <div>
                <span className="text-xs text-neutral-500">หน่วย:</span>
                <div className="mt-1 flex gap-2">
                  {UNITS.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => setUnit(u.id)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                        unit === u.id
                          ? "border-sky-500/50 bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200"
                          : "border-black/15 text-neutral-500 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                      }`}
                    >
                      {u.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400">
                <span>ชื่อคอลัมน์ใหม่</span>
                <input
                  type="text"
                  value={colName}
                  onChange={(e) => setColName(e.target.value)}
                  placeholder={`จำนวน${unit === "weeks" ? "สัปดาห์" : "วัน"}`}
                  className="w-48 rounded border border-black/15 bg-transparent px-2 py-1 dark:border-white/15 dark:bg-neutral-900"
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-black/5 pt-3 text-xs text-neutral-600 dark:border-white/5 dark:text-neutral-400">
              <label className="flex cursor-pointer items-center gap-1.5">
                <input type="checkbox" checked={inclusive} onChange={(e) => setInclusive(e.target.checked)} />
                นับปลายทั้งสองข้าง (+1 วัน) — เช่น นับวันเก็บตู้
              </label>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input type="checkbox" checked={absolute} onChange={(e) => setAbsolute(e.target.checked)} />
                ไม่สนทิศ (ค่าติดลบ → บวก)
              </label>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={dayFirst}
                  onChange={(e) => {
                    setDayFirst(e.target.checked);
                    if (state) reguess(state.file.sheets[state.sel.sheetIndex]?.rows ?? [], state.sel, e.target.checked);
                  }}
                />
                วัน/เดือน/ปี (DD/MM) — ปิด = MM/DD
              </label>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input type="checkbox" checked={buddhistInput} onChange={(e) => setBuddhistInput(e.target.checked)} />
                ปีในไฟล์เป็น พ.ศ.
              </label>
            </div>
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
                    คำนวณได้ <span className="tabular-nums">{result.computedRows}</span> แถว
                  </span>
                  {result.negativeRows > 0 && (
                    <span className="rounded-full bg-orange-100 px-3 py-1 font-medium text-orange-800 dark:bg-orange-900/40 dark:text-orange-300">
                      ค่าติดลบ (จบก่อนเริ่ม) <span className="tabular-nums">{result.negativeRows}</span>
                    </span>
                  )}
                  {result.skippedRows > 0 && (
                    <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                      อ่านวันที่ไม่ได้ (เว้นว่าง) <span className="tabular-nums">{result.skippedRows}</span>
                    </span>
                  )}
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
                      <th key={i} className={`px-2 py-1.5 whitespace-nowrap ${isNewCol(i) ? "text-emerald-700 dark:text-emerald-300" : ""}`}>
                        {h === "" || h === null ? columnLetter(i) : String(h)}
                        {isNewCol(i) && " 📆"}
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
                            isNewCol(ci) ? "bg-emerald-50 font-medium dark:bg-emerald-950/30" : ""
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

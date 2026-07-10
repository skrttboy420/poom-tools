"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { columnOptionLabel, columnLetter } from "@/lib/reconcile/columns";
import { downloadText, downloadBlob } from "@/lib/reconcile/export";
import { rowsToCsv, rowsToXlsx, changeExt } from "@/lib/convertfile/convertfile";
import { extractColumn, type ExtractMode } from "@/lib/extract/extract";
import FileDropzone from "@/components/FileDropzone";
import type { ParsedFile, Row, SideSelection } from "@/lib/reconcile/types";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PREVIEW_ROWS = 200;

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

function headerText(h: unknown): string {
  return h === null || h === undefined || String(h).trim() === "" ? "" : String(h);
}

// เดาคอลัมน์ที่น่าดึง: ชื่อหัวเข้าข่าย note/รายละเอียด ก่อน · ไม่งั้นคอลัมน์ข้อความยาวสุด (free text)
function guessColumn(header: Row, data: Row[]): number {
  const HINT = /note|detail|desc|remark|รายละเอียด|หมายเหตุ|บันทึก|รายการ|สินค้า|ชื่อ/i;
  for (let c = 0; c < header.length; c++) {
    if (HINT.test(headerText(header[c]))) return c;
  }
  const sample = data.slice(0, 60);
  const width = sample.reduce((m, r) => Math.max(m, r.length), 0);
  let best = { col: 0, score: -1 };
  for (let c = 0; c < width; c++) {
    let totLen = 0;
    let n = 0;
    let hasLetter = 0;
    for (const r of sample) {
      const v = c < r.length ? r[c] : null;
      if (v === null || v === undefined) continue;
      const s = String(v).trim();
      if (s === "") continue;
      totLen += s.length;
      n++;
      if (/[A-Za-z]/.test(s)) hasLetter++;
    }
    if (n === 0) continue;
    const score = totLen / n + (hasLetter / n) * 3;
    if (score > best.score) best = { col: c, score };
  }
  return best.col;
}

const PATTERN_PRESETS: { label: string; value: string }[] = [
  { label: "เลขตู้ (container)", value: "[A-Z]{4}[0-9]{7}" },
  { label: "ตัวเลข", value: "[0-9]+" },
  { label: "ทศนิยม", value: "[0-9]+(?:\\.[0-9]+)?" },
  { label: "ตัวอักษร", value: "[A-Za-z]+" },
  { label: "รหัส (ABC-123)", value: "[A-Z]+-?[0-9]+" },
];

export default function ExtractPage() {
  const [state, setState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [col, setCol] = useState(0);
  const [pattern, setPattern] = useState("[0-9]+");
  const [caseInsensitive, setCaseInsensitive] = useState(false);
  const [mode, setMode] = useState<ExtractMode>("first");
  const [separator, setSeparator] = useState(", ");
  const [keepOriginal, setKeepOriginal] = useState(true);

  const header = useMemo(() => headerRowOf(state), [state]);
  const data = useMemo(() => dataRowsOf(state), [state]);
  const headerStr = useMemo(() => header.map((h) => (h === null ? "" : String(h))), [header]);

  const result = useMemo(
    () => extractColumn(headerStr, data, col, { pattern, caseInsensitive, mode, separator, keepOriginal }),
    [headerStr, data, col, pattern, caseInsensitive, mode, separator, keepOriginal],
  );

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const parsed = await parseFile(file);
      const sel = makeSelection(parsed, 0);
      setState({ file: parsed, sel });
      const rows = parsed.sheets[sel.sheetIndex]?.rows ?? [];
      const headerRow = rows[sel.headerRow] ?? [];
      const dataRows = rows.slice(sel.dataStart);
      setCol(guessColumn(headerRow, dataRows));
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
    if (!state || result.error) return;
    downloadText(
      changeExt(state.file.fileName, "csv", "-ดึง"),
      rowsToCsv([result.header, ...result.rows]),
      "text/csv",
    );
  };
  const dlXlsx = () => {
    if (!state || result.error) return;
    downloadBlob(
      changeExt(state.file.fileName, "xlsx", "-ดึง"),
      rowsToXlsx([result.header, ...result.rows]),
      XLSX_MIME,
    );
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];
  const shownRows = result.rows.slice(0, PREVIEW_ROWS);

  // คอลัมน์ใหม่ที่ดึงมา อยู่ช่วง index ไหน (ไว้ไฮไลต์)
  const newStart = keepOriginal ? col + 1 : col;
  const newEnd = newStart + result.newCols; // [newStart, newEnd)

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">ดึงข้อความด้วย pattern 🎯</h1>
          <p className="text-xs text-neutral-500">
            ดึงส่วนที่ตรง regex ออกจากช่องเดียว (เช่น เลขตู้ในช่อง note) เป็นคอลัมน์ใหม่ · capture group → 1 คอลัมน์/กลุ่ม · ทุกแถวอยู่ครบ ไม่แก้ค่าเดิม
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

        {/* STEP 2: ตั้งค่าดึง */}
        {state && (
          <div className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
            <h2 className="text-sm font-semibold">ตั้งค่าการดึง</h2>

            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-1.5">
                <span className="text-xs text-neutral-500">คอลัมน์ที่จะดึง:</span>
                <select
                  value={col}
                  onChange={(e) => setCol(Number(e.target.value))}
                  className="rounded border border-black/15 bg-transparent px-2 py-1.5 dark:border-white/15 dark:bg-neutral-900"
                >
                  {header.map((h, i) => (
                    <option key={i} value={i} title={columnOptionLabel(h, i)}>
                      {columnLetter(i)} · {h === null || String(h).trim() === "" ? "(ว่าง)" : String(h)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-1 items-center gap-1.5">
                <span className="text-xs text-neutral-500">pattern (regex):</span>
                <input
                  value={pattern}
                  onChange={(e) => setPattern(e.target.value)}
                  placeholder="เช่น [A-Z]{4}[0-9]{7}"
                  spellCheck={false}
                  className="min-w-[200px] flex-1 rounded border border-black/15 bg-transparent px-2 py-1.5 font-mono outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-1 text-xs text-neutral-500">ตัวอย่าง pattern:</span>
              {PATTERN_PRESETS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPattern(p.value)}
                  className={`rounded border px-2 py-1 text-xs transition ${
                    pattern === p.value
                      ? "border-sky-500 bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200"
                      : "border-black/15 text-neutral-500 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-600 dark:text-neutral-400">
              <div className="flex items-center gap-1" title="match แรก = ดึงตัวแรกที่เจอ · ทุก match = ดึงทุกตัวมาต่อกัน">
                <span className="text-neutral-500">โหมด:</span>
                <button
                  onClick={() => setMode("first")}
                  className={`rounded border px-2 py-1 transition ${
                    mode === "first"
                      ? "border-sky-500 bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200"
                      : "border-black/15 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                  }`}
                >
                  match แรก
                </button>
                <button
                  onClick={() => setMode("all")}
                  className={`rounded border px-2 py-1 transition ${
                    mode === "all"
                      ? "border-sky-500 bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200"
                      : "border-black/15 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                  }`}
                >
                  ทุก match
                </button>
              </div>

              {mode === "all" && (
                <label className="flex items-center gap-1.5" title="ตัวเชื่อมตอนดึงหลายค่ามาต่อกัน">
                  ตัวเชื่อม:
                  <input
                    value={separator}
                    onChange={(e) => setSeparator(e.target.value)}
                    className="w-20 rounded border border-black/15 bg-transparent px-2 py-1 font-mono dark:border-white/15"
                  />
                </label>
              )}

              <label className="flex cursor-pointer items-center gap-1.5" title="ไม่สนตัวพิมพ์เล็ก/ใหญ่">
                <input type="checkbox" checked={caseInsensitive} onChange={(e) => setCaseInsensitive(e.target.checked)} />
                ไม่สนพิมพ์เล็ก/ใหญ่ (i)
              </label>
              <label className="flex cursor-pointer items-center gap-1.5" title="เก็บคอลัมน์เดิมไว้ด้วย">
                <input type="checkbox" checked={keepOriginal} onChange={(e) => setKeepOriginal(e.target.checked)} />
                เก็บคอลัมน์เดิมไว้ด้วย
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
                  <span className="rounded-full bg-sky-100 px-3 py-1 font-medium text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">
                    ดึงเป็น <span className="tabular-nums">{result.newCols}</span> คอลัมน์
                    {result.groupCount > 0 && <span className="text-sky-600 dark:text-sky-400"> ({result.groupCount} กลุ่ม)</span>}
                  </span>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                    ดึงได้ <span className="tabular-nums">{result.matchedRows}</span> แถว
                  </span>
                  {result.unmatchedRows > 0 && (
                    <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                      ไม่ match <span className="tabular-nums">{result.unmatchedRows}</span> แถว
                    </span>
                  )}
                  {result.blankRows > 0 && (
                    <span className="text-neutral-400">ช่องว่าง {result.blankRows}</span>
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
                    {result.header.map((h, i) => {
                      const isNew = !result.error && i >= newStart && i < newEnd;
                      return (
                        <th key={i} className={`px-2 py-1.5 whitespace-nowrap ${isNew ? "text-sky-700 dark:text-sky-300" : ""}`}>
                          {h === "" ? columnLetter(i) : h}
                          {isNew && " 🎯"}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {shownRows.map((r, ri) => (
                    <tr key={ri} className="border-t border-black/5 dark:border-white/5">
                      <td className="px-2 py-1 text-right text-neutral-400 tabular-nums">{ri + 1}</td>
                      {result.header.map((_, ci) => {
                        const isNew = !result.error && ci >= newStart && ci < newEnd;
                        const v = r[ci];
                        return (
                          <td
                            key={ci}
                            className={`max-w-[220px] truncate whitespace-nowrap px-2 py-1 ${
                              isNew ? "bg-sky-50 dark:bg-sky-950/30" : ""
                            }`}
                          >
                            {v === null || v === undefined ? "" : String(v)}
                          </td>
                        );
                      })}
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

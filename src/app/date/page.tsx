"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { columnLetter } from "@/lib/reconcile/columns";
import { downloadText, downloadBlob } from "@/lib/reconcile/export";
import { rowsToCsv, rowsToXlsx, changeExt } from "@/lib/convertfile/convertfile";
import { normalizeDates, OUTPUT_FORMATS, type OutputFormat } from "@/lib/datefmt/datefmt";
import FileDropzone from "@/components/FileDropzone";
import type { ParsedFile, Row, SideSelection, Cell } from "@/lib/reconcile/types";

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

function colLabel(header: Row, i: number): string {
  const h = header[i];
  return h === null || h === undefined || String(h).trim() === "" ? `(ว่าง)` : String(h);
}

const DATE_HINTS = ["date", "วันที่", "วัน", "day", "eta", "etd", "ปี", "เดือน"];

// เดาคอลัมน์วันที่: จับจากชื่อหัวก่อน ไม่งั้นดูค่าที่มีตัวคั่นวันที่ปนตัวเลข
function guessDateCol(header: Row, data: Row[]): number {
  for (let c = 0; c < header.length; c++) {
    const h = String(header[c] ?? "").toLowerCase();
    if (DATE_HINTS.some((k) => h.includes(k))) return c;
  }
  let best = { col: 0, score: 0 };
  const scan = data.slice(0, 50);
  for (let c = 0; c < header.length; c++) {
    let score = 0;
    for (const row of scan) {
      const v = row[c];
      if (v === null || v === undefined) continue;
      const s = String(v).trim();
      if (/^\d{1,4}[/.\-]\d{1,2}[/.\-]\d{1,4}$/.test(s) || /^\d{8}$/.test(s)) score++;
    }
    if (score > best.score) best = { col: c, score };
  }
  return best.col;
}

export default function DatePage() {
  const [state, setState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [col, setCol] = useState(0);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("YYYY-MM-DD");
  const [dayFirst, setDayFirst] = useState(true);
  const [buddhistInput, setBuddhistInput] = useState(false);
  const [buddhistOutput, setBuddhistOutput] = useState(false);

  const header = useMemo(() => headerRowOf(state), [state]);
  const data = useMemo(() => dataRowsOf(state), [state]);
  const headerStr = useMemo(() => header.map((h) => (h === null ? "" : String(h))), [header]);

  const result = useMemo(
    () =>
      normalizeDates(headerStr, data, col, {
        outputFormat,
        dayFirst,
        buddhistInput,
        buddhistOutput,
      }),
    [headerStr, data, col, outputFormat, dayFirst, buddhistInput, buddhistOutput],
  );

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const parsed = await parseFile(file);
      const sel = makeSelection(parsed, 0);
      setState({ file: parsed, sel });
      const hdr = parsed.sheets[sel.sheetIndex]?.rows[sel.headerRow] ?? [];
      const rows = (parsed.sheets[sel.sheetIndex]?.rows ?? []).slice(sel.dataStart);
      setCol(guessDateCol(hdr, rows));
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
      changeExt(state.file.fileName, "csv", "-วันที่"),
      rowsToCsv([result.header, ...result.rows]),
      "text/csv",
    );
  };
  const dlXlsx = () => {
    if (!state || result.error) return;
    downloadBlob(
      changeExt(state.file.fileName, "xlsx", "-วันที่"),
      rowsToXlsx([result.header, ...result.rows]),
      XLSX_MIME,
    );
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];
  const shownRows = result.rows.slice(0, PREVIEW_ROWS);
  const cellStr = (v: Cell) => (v === null || v === undefined ? "" : String(v));

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">แปลงรูปแบบวันที่ 📅</h1>
          <p className="text-xs text-neutral-500">
            วันที่คนละรูปแบบปนกัน (10/07/2025, 2025-7-1, 68 พ.ศ., Excel serial) → รูปแบบเดียวทั้งคอลัมน์ ·
            ช่องที่อ่านไม่ออก = คงค่าเดิม ไม่ทิ้ง ไม่เดามั่ว
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
                <span className="text-neutral-400">
                  แถวข้อมูล: {Math.max(0, sheet.rows.length - state.sel.dataStart)}
                </span>
              </div>

              <div className="max-h-44 overflow-auto rounded border border-black/10 dark:border-white/10">
                <table className="w-full text-[11px]">
                  <tbody>
                    {preview.map((r, ri) => {
                      const isHeader = ri === state.sel.headerRow;
                      const isBefore = ri < state.sel.dataStart && !isHeader;
                      return (
                        <tr
                          key={ri}
                          className={
                            isHeader
                              ? "bg-black/5 font-medium dark:bg-white/10"
                              : isBefore
                                ? "text-neutral-400"
                                : ""
                          }
                        >
                          <td className="border-r border-black/10 px-1 text-right text-neutral-400 dark:border-white/10">
                            {ri}
                          </td>
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

        {/* STEP 2: เลือกคอลัมน์ + รูปแบบ */}
        {state && (
          <div className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
            <h2 className="text-sm font-semibold">แปลงคอลัมน์ไหน</h2>

            <div className="flex flex-wrap gap-1.5">
              {header.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCol(i)}
                  className={`rounded border px-2 py-1 text-xs transition ${
                    col === i
                      ? "border-indigo-500 bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200"
                      : "border-black/15 text-neutral-500 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                  }`}
                >
                  {col === i ? "✓ " : ""}
                  {columnLetter(i)} · {colLabel(header, i)}
                </button>
              ))}
            </div>

            <div className="border-t border-black/5 pt-3 dark:border-white/5">
              <p className="mb-1.5 text-xs text-neutral-500">รูปแบบผลลัพธ์</p>
              <div className="flex flex-wrap gap-1.5">
                {OUTPUT_FORMATS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setOutputFormat(f.id)}
                    title={f.sample}
                    className={`rounded border px-2 py-1 text-xs transition ${
                      outputFormat === f.id
                        ? "border-indigo-500 bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200"
                        : "border-black/15 text-neutral-500 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                    }`}
                  >
                    {f.label}
                    <span className="ml-1 font-mono text-[10px] text-neutral-400">{f.sample}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 border-t border-black/5 pt-3 text-xs text-neutral-600 dark:border-white/5 dark:text-neutral-400">
              <label
                className="flex cursor-pointer items-center gap-1.5"
                title="ตีความ 01/02/2025 เป็น วันที่ 1 เดือน 2 (ปิด = แบบอเมริกา เดือน/วัน)"
              >
                <input
                  type="checkbox"
                  checked={dayFirst}
                  onChange={(e) => setDayFirst(e.target.checked)}
                />
                วันมาก่อนเดือน (DD/MM)
              </label>
              <label
                className="flex cursor-pointer items-center gap-1.5"
                title="ปีที่รับเข้าเป็น พ.ศ. (จะลบ 543 ให้เป็น ค.ศ.)"
              >
                <input
                  type="checkbox"
                  checked={buddhistInput}
                  onChange={(e) => setBuddhistInput(e.target.checked)}
                />
                ปีเข้าเป็น พ.ศ.
              </label>
              <label
                className="flex cursor-pointer items-center gap-1.5"
                title="ให้ผลลัพธ์เป็นปี พ.ศ. (บวก 543)"
              >
                <input
                  type="checkbox"
                  checked={buddhistOutput}
                  onChange={(e) => setBuddhistOutput(e.target.checked)}
                />
                ปีออกเป็น พ.ศ.
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
                    แปลง <span className="tabular-nums">{result.converted}</span>
                  </span>
                  {result.unchanged > 0 && (
                    <span className="rounded-full bg-neutral-100 px-3 py-1 font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                      ตรงเดิม <span className="tabular-nums">{result.unchanged}</span>
                    </span>
                  )}
                  {result.unparsed > 0 && (
                    <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                      อ่านไม่ออก <span className="tabular-nums">{result.unparsed}</span>
                    </span>
                  )}
                  {result.blank > 0 && (
                    <span className="text-neutral-400">
                      ว่าง <span className="tabular-nums">{result.blank}</span>
                    </span>
                  )}
                </>
              )}
              {result.rows.length > PREVIEW_ROWS && (
                <span className="text-neutral-400">แสดง {PREVIEW_ROWS} แถวแรก</span>
              )}
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

            {/* เตือนค่าที่อ่านไม่ออก */}
            {!result.error && result.unparsedSamples.length > 0 && (
              <div className="border-b border-black/10 bg-amber-50/50 px-3 py-2 text-xs text-amber-800 dark:border-white/10 dark:bg-amber-950/20 dark:text-amber-300">
                อ่านไม่ออก (คงค่าเดิมไว้):{" "}
                {result.unparsedSamples.slice(0, 12).map((v, i) => (
                  <span
                    key={i}
                    className="mr-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 font-mono dark:bg-amber-900/40"
                  >
                    {v || "(ว่าง)"}
                  </span>
                ))}
                {result.unparsedSamples.length > 12 && <span>…</span>}
              </div>
            )}

            <div className="max-h-[55vh] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-900">
                  <tr>
                    <th className="px-2 py-1.5">#</th>
                    {result.header.map((h, i) => (
                      <th
                        key={i}
                        className={`px-2 py-1.5 whitespace-nowrap ${
                          i === col ? "text-indigo-700 dark:text-indigo-300" : ""
                        }`}
                      >
                        {h === "" ? columnLetter(i) : h}
                        {i === col && " 📅"}
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
                          className={`max-w-[220px] truncate whitespace-nowrap px-2 py-1 ${
                            ci === col ? "bg-indigo-50 font-medium dark:bg-indigo-950/30" : ""
                          }`}
                        >
                          {cellStr(r[ci] ?? null)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {result.rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={Math.max(1, result.header.length) + 1}
                        className="px-2 py-4 text-center text-neutral-400"
                      >
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

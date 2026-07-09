"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { columnOptionLabel, columnLetter } from "@/lib/reconcile/columns";
import { downloadText, downloadBlob } from "@/lib/reconcile/export";
import { rowsToCsv, rowsToXlsx, changeExt } from "@/lib/convertfile/convertfile";
import { splitColumn } from "@/lib/splitcol/splitcol";
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

// เดาคอลัมน์+ตัวคั่นที่น่าจะแยก: สแกนช่องตัวอย่าง หาคอลัมน์ที่มีตัวคั่นบ่อยสุด
const DELIM_CANDIDATES = ["/", "|", " - ", "-", ",", "\t", " "];
function guessSplit(data: Row[]): { col: number; delimiter: string } {
  const sample = data.slice(0, 40);
  let best = { col: 0, delimiter: "/", score: 0 };
  const width = sample.reduce((m, r) => Math.max(m, r.length), 0);
  for (let c = 0; c < width; c++) {
    for (const d of DELIM_CANDIDATES) {
      let score = 0;
      for (const r of sample) {
        const v = c < r.length ? r[c] : null;
        if (v === null || v === undefined) continue;
        const s = String(v);
        if (s.trim() !== "" && s.includes(d) && s.split(d).length > 1) score++;
      }
      if (score > best.score) best = { col: c, delimiter: d, score };
    }
  }
  return { col: best.col, delimiter: best.delimiter };
}

const PRESETS: { label: string; value: string }[] = [
  { label: "/", value: "/" },
  { label: "-", value: "-" },
  { label: ",", value: "," },
  { label: "|", value: "|" },
  { label: "( - )", value: " - " },
  { label: "เว้นวรรค", value: " " },
  { label: "Tab", value: "\t" },
];

function delimDisplay(d: string): string {
  if (d === " ") return "เว้นวรรค";
  if (d === "\t") return "Tab";
  if (d === " - ") return "( - )";
  return d;
}

export default function SplitColPage() {
  const [state, setState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [col, setCol] = useState(0);
  const [delimiter, setDelimiter] = useState("/");
  const [trim, setTrim] = useState(true);
  const [keepOriginal, setKeepOriginal] = useState(false);
  const [maxParts, setMaxParts] = useState(0); // 0 = auto

  const header = useMemo(() => headerRowOf(state), [state]);
  const data = useMemo(() => dataRowsOf(state), [state]);
  const headerStr = useMemo(() => header.map((h) => (h === null ? "" : String(h))), [header]);

  const result = useMemo(
    () => splitColumn(headerStr, data, col, { delimiter, trim, keepOriginal, maxParts }),
    [headerStr, data, col, delimiter, trim, keepOriginal, maxParts],
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
      const dataRows = rows.slice(sel.dataStart);
      const g = guessSplit(dataRows);
      setCol(g.col);
      setDelimiter(g.delimiter);
      setMaxParts(0);
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
      changeExt(state.file.fileName, "csv", "-แยกคอลัมน์"),
      rowsToCsv([result.header, ...result.rows]),
      "text/csv",
    );
  };
  const dlXlsx = () => {
    if (!state || result.error) return;
    downloadBlob(
      changeExt(state.file.fileName, "xlsx", "-แยกคอลัมน์"),
      rowsToXlsx([result.header, ...result.rows]),
      XLSX_MIME,
    );
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];
  const shownRows = result.rows.slice(0, PREVIEW_ROWS);

  // คอลัมน์ใหม่ที่เกิดจากการแยก อยู่ช่วง index ไหน (ไว้ไฮไลต์)
  const newStart = keepOriginal ? col + 1 : col;
  const newEnd = newStart + result.parts; // [newStart, newEnd)

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">แยกคอลัมน์ ✂️➡️</h1>
          <p className="text-xs text-neutral-500">
            แยกช่องเดียวที่มีค่าปนกัน (เช่น &quot;TU-A/123&quot;, &quot;KY001-1&quot;) ออกเป็นหลายคอลัมน์ตามตัวคั่น · ทุกแถวอยู่ครบ ไม่ทำข้อมูลหาย
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

        {/* STEP 2: ตั้งค่าแยก */}
        {state && (
          <div className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
            <h2 className="text-sm font-semibold">ตั้งค่าการแยก</h2>

            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-1.5">
                <span className="text-xs text-neutral-500">คอลัมน์ที่จะแยก:</span>
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

              <label className="flex items-center gap-1.5">
                <span className="text-xs text-neutral-500">ตัวคั่น:</span>
                <input
                  value={delimiter}
                  onChange={(e) => setDelimiter(e.target.value)}
                  placeholder="เช่น /"
                  spellCheck={false}
                  className="w-24 rounded border border-black/15 bg-transparent px-2 py-1.5 font-mono outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
                />
              </label>

              <div className="flex flex-wrap items-center gap-1">
                {PRESETS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setDelimiter(p.value)}
                    className={`rounded border px-2 py-1 text-xs transition ${
                      delimiter === p.value
                        ? "border-sky-500 bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200"
                        : "border-black/15 text-neutral-500 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-600 dark:text-neutral-400">
              <label className="flex cursor-pointer items-center gap-1.5">
                <input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} />
                ตัดช่องว่างแต่ละชิ้น (trim)
              </label>
              <label className="flex cursor-pointer items-center gap-1.5" title="เก็บคอลัมน์เดิมไว้ด้วย (ไม่แทนที่)">
                <input type="checkbox" checked={keepOriginal} onChange={(e) => setKeepOriginal(e.target.checked)} />
                เก็บคอลัมน์เดิมไว้ด้วย
              </label>
              <label className="flex items-center gap-1.5" title="0 = อัตโนมัติ (ตามจำนวนชิ้นมากสุด) · ถ้าจำกัดแล้วชิ้นเกิน ชิ้นสุดท้ายจะรวมส่วนที่เหลือ (ไม่ทิ้ง)">
                จำกัดจำนวนคอลัมน์:
                <input
                  type="number"
                  min={0}
                  value={maxParts}
                  onChange={(e) => setMaxParts(Math.max(0, Number(e.target.value) || 0))}
                  className="w-16 rounded border border-black/15 bg-transparent px-1 py-0.5 dark:border-white/15"
                />
                <span className="text-neutral-400">(0 = อัตโนมัติ)</span>
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
                    แยกเป็น <span className="tabular-nums">{result.parts}</span> คอลัมน์
                  </span>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                    แยกได้ <span className="tabular-nums">{result.splitRows}</span>/{result.inputRows} แถว
                  </span>
                  <span className="text-neutral-400">
                    ตัวคั่น &quot;{delimDisplay(delimiter)}&quot; · ชิ้นมากสุด {result.maxPartsFound}
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
                    {result.header.map((h, i) => {
                      const isNew = !result.error && i >= newStart && i < newEnd;
                      return (
                        <th
                          key={i}
                          className={`px-2 py-1.5 whitespace-nowrap ${
                            isNew ? "text-sky-700 dark:text-sky-300" : ""
                          }`}
                        >
                          {h === "" ? columnLetter(i) : h}
                          {isNew && " ✂️"}
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
                            className={`max-w-[200px] truncate whitespace-nowrap px-2 py-1 ${
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

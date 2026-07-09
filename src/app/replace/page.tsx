"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { columnLetter } from "@/lib/reconcile/columns";
import { downloadText, downloadBlob } from "@/lib/reconcile/export";
import { rowsToCsv, rowsToXlsx, changeExt } from "@/lib/convertfile/convertfile";
import { replaceInTable, type ReplaceMode } from "@/lib/replacecell/replace";
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

function colLabel(header: Row, i: number): string {
  const h = header[i];
  return h === null || h === undefined || String(h).trim() === "" ? `(ว่าง)` : String(h);
}

const MODES: { value: ReplaceMode; label: string; hint: string }[] = [
  { value: "contains", label: "มีคำนี้อยู่", hint: "แทนทุกที่ที่เจอข้อความในช่อง (เช่น TU-A → TU-01)" },
  { value: "exact", label: "ตรงทั้งช่อง", hint: "แทนเฉพาะช่องที่ค่าตรงเป๊ะทั้งช่อง (เช่น '-' → ว่าง)" },
  { value: "regex", label: "Regex", hint: "ใช้ regular expression + กลุ่มจับ $1 $2 (ขั้นสูง)" },
];

export default function ReplacePage() {
  const [state, setState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [find, setFind] = useState("");
  const [replacement, setReplacement] = useState("");
  const [mode, setMode] = useState<ReplaceMode>("contains");
  const [caseInsensitive, setCaseInsensitive] = useState(false);
  const [trimCompare, setTrimCompare] = useState(false);
  const [limitCols, setLimitCols] = useState(false);
  const [cols, setCols] = useState<number[]>([]);

  const header = useMemo(() => headerRowOf(state), [state]);
  const data = useMemo(() => dataRowsOf(state), [state]);
  const headerStr = useMemo(() => header.map((h) => (h === null ? "" : String(h))), [header]);

  const result = useMemo(
    () =>
      replaceInTable(headerStr, data, {
        find,
        replacement,
        mode,
        caseInsensitive,
        trimCompare,
        cols: limitCols && cols.length > 0 ? cols : undefined,
      }),
    [headerStr, data, find, replacement, mode, caseInsensitive, trimCompare, limitCols, cols],
  );

  // เซ็ตช่องที่เปลี่ยน (ไว้ไฮไลต์ในตาราง — เทียบกับข้อมูลต้นฉบับ)
  const changedSet = useMemo(() => {
    const s = new Set<string>();
    if (result.error) return s;
    const n = Math.min(result.rows.length, PREVIEW_ROWS);
    for (let ri = 0; ri < n; ri++) {
      const before = data[ri] ?? [];
      const after = result.rows[ri] ?? [];
      const w = Math.max(before.length, after.length);
      for (let ci = 0; ci < w; ci++) {
        const b = before[ci] ?? null;
        const a = after[ci] ?? null;
        if (String(b ?? "") !== String(a ?? "")) s.add(`${ri}:${ci}`);
      }
    }
    return s;
  }, [result, data]);

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const parsed = await parseFile(file);
      const sel = makeSelection(parsed, 0);
      setState({ file: parsed, sel });
      setCols([]);
      setLimitCols(false);
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
    setCols((cur) => (cur.includes(i) ? cur.filter((c) => c !== i) : [...cur, i].sort((a, b) => a - b)));

  const dlCsv = () => {
    if (!state || result.error) return;
    downloadText(changeExt(state.file.fileName, "csv", "-แทนที่"), rowsToCsv([result.header, ...result.rows]), "text/csv");
  };
  const dlXlsx = () => {
    if (!state || result.error) return;
    downloadBlob(changeExt(state.file.fileName, "xlsx", "-แทนที่"), rowsToXlsx([result.header, ...result.rows]), XLSX_MIME);
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];
  const shownRows = result.rows.slice(0, PREVIEW_ROWS);
  const modeHint = MODES.find((m) => m.value === mode)?.hint ?? "";

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">ค้นหา-แทนที่ 🔁</h1>
          <p className="text-xs text-neutral-500">
            แก้ค่าซ้ำ ๆ ทั้งไฟล์ (เช่น ตู้พิมพ์ผิด TU-A → TU-01, ลบ &quot;-&quot;/&quot;N/A&quot; เป็นว่าง) · โชว์จำนวน/ตัวอย่างที่แก้ก่อน ไม่แก้เงียบ
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

        {/* STEP 2: ตั้งค่าค้นหา-แทนที่ */}
        {state && (
          <div className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
            <h2 className="text-sm font-semibold">ค้นหาอะไร → แทนด้วยอะไร</h2>

            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-xs text-neutral-500">ค้นหา {mode === "regex" ? "(regex)" : ""}</span>
                <input
                  value={find}
                  onChange={(e) => setFind(e.target.value)}
                  placeholder={mode === "regex" ? "เช่น ([A-Z]+)-(\\d+)" : "เช่น TU-A"}
                  spellCheck={false}
                  className="min-w-[140px] rounded border border-black/15 bg-transparent px-2 py-1.5 font-mono text-sm outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
                />
              </label>
              <span className="pb-2 text-neutral-400">→</span>
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-xs text-neutral-500">แทนด้วย {mode === "regex" ? "($1 $2 = กลุ่มจับ)" : ""}</span>
                <input
                  value={replacement}
                  onChange={(e) => setReplacement(e.target.value)}
                  placeholder="เว้นว่าง = ลบข้อความออก"
                  spellCheck={false}
                  className="min-w-[140px] rounded border border-black/15 bg-transparent px-2 py-1.5 font-mono text-sm outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
                />
              </label>
            </div>

            {/* โหมด */}
            <div className="flex flex-wrap items-center gap-1 border-t border-black/5 pt-3 dark:border-white/5">
              <span className="mr-1 text-xs text-neutral-500">วิธีจับคู่:</span>
              {MODES.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setMode(m.value)}
                  className={`rounded border px-2.5 py-1 text-xs transition ${
                    mode === m.value
                      ? "border-indigo-500 bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200"
                      : "border-black/15 text-neutral-500 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                  }`}
                >
                  {m.label}
                </button>
              ))}
              <span className="ml-1 text-xs text-neutral-400">{modeHint}</span>
            </div>

            {/* options */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-600 dark:text-neutral-400">
              <label className="flex cursor-pointer items-center gap-1.5" title="ไม่สนพิมพ์เล็ก/ใหญ่ (tu-a = TU-A)">
                <input type="checkbox" checked={caseInsensitive} onChange={(e) => setCaseInsensitive(e.target.checked)} />
                ไม่สนพิมพ์เล็ก/ใหญ่
              </label>
              {mode === "exact" && (
                <label className="flex cursor-pointer items-center gap-1.5" title="ตัดช่องว่างหน้า-หลังก่อนเทียบ ( TU-A  = TU-A)">
                  <input type="checkbox" checked={trimCompare} onChange={(e) => setTrimCompare(e.target.checked)} />
                  ตัดช่องว่างก่อนเทียบ
                </label>
              )}
              <label className="flex cursor-pointer items-center gap-1.5" title="แทนเฉพาะบางคอลัมน์ (ไม่ติ๊ก = ทุกคอลัมน์)">
                <input type="checkbox" checked={limitCols} onChange={(e) => setLimitCols(e.target.checked)} />
                จำกัดเฉพาะบางคอลัมน์
              </label>
            </div>

            {/* เลือกคอลัมน์ */}
            {limitCols && (
              <div className="flex flex-wrap gap-1.5 border-t border-black/5 pt-3 dark:border-white/5">
                {header.map((h, i) => {
                  const on = cols.includes(i);
                  return (
                    <button
                      key={i}
                      onClick={() => toggleCol(i)}
                      className={`rounded border px-2 py-1 text-xs transition ${
                        on
                          ? "border-indigo-500 bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200"
                          : "border-black/15 text-neutral-500 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                      }`}
                    >
                      {on ? "✓ " : ""}
                      {columnLetter(i)} · {colLabel(header, i)}
                    </button>
                  );
                })}
                {cols.length === 0 && <span className="self-center text-xs text-amber-600">ยังไม่ได้เลือกคอลัมน์ → จะแทนทุกคอลัมน์</span>}
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
                  <span className="rounded-full bg-indigo-100 px-3 py-1 font-medium text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200">
                    แก้ <span className="tabular-nums">{result.cellsChanged}</span> ช่อง
                  </span>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                    <span className="tabular-nums">{result.rowsAffected}</span> แถวถูกแตะ
                  </span>
                  <span className="text-neutral-400">
                    จาก <span className="tabular-nums">{result.inputRows}</span> แถว
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

            {/* ตัวอย่างก่อน → หลัง */}
            {!result.error && result.samples.length > 0 && (
              <div className="border-b border-black/10 px-3 py-2 dark:border-white/10">
                <p className="mb-1.5 text-xs font-medium text-neutral-500">ตัวอย่างที่แก้ (สูงสุด {result.samples.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {result.samples.slice(0, 12).map((s, i) => (
                    <span
                      key={i}
                      className="rounded border border-black/10 px-2 py-1 text-[11px] dark:border-white/10"
                      title={`แถว ${s.row + 1} · คอลัมน์ ${columnLetter(s.col)}`}
                    >
                      <span className="text-neutral-400 line-through">{s.before || "(ว่าง)"}</span>
                      <span className="mx-1 text-neutral-400">→</span>
                      <span className="font-medium text-indigo-700 dark:text-indigo-300">{s.after || "(ว่าง)"}</span>
                    </span>
                  ))}
                  {result.samples.length > 12 && <span className="self-center text-[11px] text-neutral-400">…อีก {result.samples.length - 12}</span>}
                </div>
              </div>
            )}

            <div className="max-h-[55vh] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-900">
                  <tr>
                    <th className="px-2 py-1.5">#</th>
                    {result.header.map((h, i) => (
                      <th key={i} className="px-2 py-1.5 whitespace-nowrap">
                        {h === "" ? columnLetter(i) : h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shownRows.map((r, ri) => (
                    <tr key={ri} className="border-t border-black/5 dark:border-white/5">
                      <td className="px-2 py-1 text-right text-neutral-400 tabular-nums">{ri + 1}</td>
                      {result.header.map((_, ci) => {
                        const changed = changedSet.has(`${ri}:${ci}`);
                        const v = r[ci];
                        return (
                          <td
                            key={ci}
                            className={`max-w-[220px] truncate whitespace-nowrap px-2 py-1 ${
                              changed ? "bg-indigo-50 font-medium text-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-200" : ""
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

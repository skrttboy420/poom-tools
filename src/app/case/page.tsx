"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { columnLetter } from "@/lib/reconcile/columns";
import { downloadText, downloadBlob } from "@/lib/reconcile/export";
import { rowsToCsv, rowsToXlsx, changeExt } from "@/lib/convertfile/convertfile";
import { convertCase, type CaseMode } from "@/lib/casecol/case";
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

function isBlank(v: Cell): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

const HEADER_KEYS = ["tracking", "forwarder", "รหัส", "code", "name", "ชื่อ", "ตู้", "container", "เลข", "id"];

// เดาคอลัมน์ที่น่าจะเป็น "ข้อความ" ที่ควร normalize ตัวพิมพ์ (มีตัวอักษรอังกฤษปนตัวใหญ่-เล็ก)
function guessCaseCols(header: Row, data: Row[]): number[] {
  const width = header.length;
  const sample = data.slice(0, 200);
  const picks: { col: number; score: number }[] = [];
  for (let c = 0; c < width; c++) {
    let strVals = 0;
    let hasLetters = 0;
    let mixed = 0; // มีทั้งตัวใหญ่และตัวเล็ก (หรือปนกันข้ามแถว) = น่า normalize
    let sawUpper = false;
    let sawLower = false;
    for (const row of sample) {
      const v = row[c];
      if (isBlank(v)) continue;
      if (typeof v !== "string") continue;
      strVals++;
      if (/[A-Za-z]/.test(v)) hasLetters++;
      const u = /[A-Z]/.test(v);
      const l = /[a-z]/.test(v);
      if (u && l) mixed++;
      if (u) sawUpper = true;
      if (l) sawLower = true;
    }
    if (strVals < 2 || hasLetters < 1) continue;
    const letterRatio = hasLetters / strVals;
    if (letterRatio < 0.5) continue;
    const nameHit = HEADER_KEYS.some((k) => String(header[c] ?? "").toLowerCase().includes(k));
    const inconsistent = sawUpper && sawLower; // ทั้งคอลัมน์ปนตัวใหญ่-เล็ก
    const score = letterRatio + (mixed > 0 ? 0.5 : 0) + (inconsistent ? 0.5 : 0) + (nameHit ? 1 : 0);
    picks.push({ col: c, score });
  }
  if (picks.length === 0) return [];
  picks.sort((a, b) => b.score - a.score);
  return [picks[0].col];
}

const MODES: { value: CaseMode; label: string; hint: string; example: string }[] = [
  { value: "upper", label: "ตัวใหญ่ทั้งหมด", hint: "แปลงตัวอักษรอังกฤษเป็นตัวพิมพ์ใหญ่ทั้งหมด — เหมาะ normalize รหัส/tracking", example: "ky001 → KY001" },
  { value: "lower", label: "ตัวเล็กทั้งหมด", hint: "แปลงตัวอักษรอังกฤษเป็นตัวพิมพ์เล็กทั้งหมด", example: "KY001 → ky001" },
  { value: "title", label: "ขึ้นต้นคำ", hint: "ตัวแรกของแต่ละคำเป็นตัวใหญ่ ที่เหลือเล็ก — เหมาะชื่อคน/สถานที่", example: "john smith → John Smith" },
  { value: "sentence", label: "ขึ้นต้นประโยค", hint: "ตัวอักษรแรกของช่องเป็นตัวใหญ่ ที่เหลือเล็ก", example: "HELLO world → Hello world" },
];

export default function CasePage() {
  const [state, setState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cols, setCols] = useState<number[]>([]);
  const [mode, setMode] = useState<CaseMode>("upper");

  const header = useMemo(() => headerRowOf(state), [state]);
  const data = useMemo(() => dataRowsOf(state), [state]);
  const headerStr = useMemo(() => header.map((h) => (h === null ? "" : String(h))), [header]);

  const result = useMemo(() => convertCase(headerStr, data, { cols, mode }), [headerStr, data, cols, mode]);

  const changedSet = useMemo(() => {
    const s = new Set<string>();
    if (result.error) return s;
    const n = Math.min(result.rows.length, PREVIEW_ROWS);
    for (let ri = 0; ri < n; ri++) {
      const before = data[ri] ?? [];
      const after = result.rows[ri] ?? [];
      const w = Math.max(before.length, after.length);
      for (let ci = 0; ci < w; ci++) {
        if (String(before[ci] ?? "") !== String(after[ci] ?? "")) s.add(`${ri}:${ci}`);
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
      const rows = parsed.sheets[sel.sheetIndex]?.rows ?? [];
      const hdr = rows[sel.headerRow] ?? [];
      const dat = rows.slice(sel.dataStart);
      setState({ file: parsed, sel });
      setCols(guessCaseCols(hdr, dat));
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
    downloadText(changeExt(state.file.fileName, "csv", "-แปลงตัวพิมพ์"), rowsToCsv([result.header, ...result.rows]), "text/csv");
  };
  const dlXlsx = () => {
    if (!state || result.error) return;
    downloadBlob(changeExt(state.file.fileName, "xlsx", "-แปลงตัวพิมพ์"), rowsToXlsx([result.header, ...result.rows]), XLSX_MIME);
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];
  const shownRows = result.rows.slice(0, PREVIEW_ROWS);
  const modeInfo = MODES.find((m) => m.value === mode);

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">แปลงตัวพิมพ์ใหญ่/เล็ก 🔠</h1>
          <p className="text-xs text-neutral-500">
            normalize ตัวพิมพ์ในคอลัมน์ (เช่น &quot;ky001&quot; ↔ &quot;KY001&quot;) ให้เป็นแบบเดียวก่อนเทียบ/เข้า Pacred · แค่เปลี่ยนตัวพิมพ์ ไม่ลบ/เพิ่มตัวอักษร · ภาษาไทยไม่กระทบ
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
            <h2 className="text-sm font-semibold">ไฟล์ที่จะแปลงตัวพิมพ์</h2>
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

        {/* STEP 2: ตั้งค่า */}
        {state && (
          <div className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
            <h2 className="text-sm font-semibold">แปลงคอลัมน์ไหน</h2>

            {/* เลือกคอลัมน์ */}
            <div className="flex flex-wrap gap-1.5">
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
            </div>

            {/* โหมด */}
            <div className="flex flex-wrap items-center gap-1 border-t border-black/5 pt-3 dark:border-white/5">
              <span className="mr-1 text-xs text-neutral-500">รูปแบบ:</span>
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
            </div>
            {modeInfo && (
              <p className="text-xs text-neutral-400">
                {modeInfo.hint} · ตัวอย่าง: <span className="font-mono">{modeInfo.example}</span>
              </p>
            )}
            <p className="rounded-md border border-black/5 bg-black/[0.02] px-3 py-2 text-xs text-neutral-500 dark:border-white/5 dark:bg-white/[0.02]">
              แตะเฉพาะช่องที่เป็นข้อความ · ตัวเลข/ค่าว่างข้ามให้ (ไม่ทำ type เพี้ยน) · ภาษาไทยไม่มีตัวใหญ่-เล็ก จึงผ่านไม่เปลี่ยน
            </p>
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
                    แปลง <span className="tabular-nums">{result.changedCount}</span> ช่อง
                  </span>
                  <span className="rounded-full bg-indigo-100 px-3 py-1 font-medium text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200">
                    <span className="tabular-nums">{result.rowsAffected}</span> แถวถูกแตะ
                  </span>
                  {result.skippedNonString > 0 && (
                    <span className="text-neutral-400">
                      ข้ามช่องตัวเลข <span className="tabular-nums">{result.skippedNonString}</span>
                    </span>
                  )}
                  {result.blankSkipped > 0 && (
                    <span className="text-neutral-400">
                      ข้ามช่องว่าง <span className="tabular-nums">{result.blankSkipped}</span>
                    </span>
                  )}
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
                <p className="mb-1.5 text-xs font-medium text-neutral-500">ตัวอย่างที่แปลง (สูงสุด {result.samples.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {result.samples.slice(0, 14).map((s, i) => (
                    <span
                      key={i}
                      className="rounded border border-black/10 px-2 py-1 text-[11px] dark:border-white/10"
                      title={`แถว ${s.row + 1} · คอลัมน์ ${columnLetter(s.col)}`}
                    >
                      <span className="text-neutral-400 line-through">{s.before || "(ว่าง)"}</span>
                      <span className="mx-1 text-neutral-400">→</span>
                      <span className="font-medium text-emerald-700 dark:text-emerald-300">{s.after || "(ว่าง)"}</span>
                    </span>
                  ))}
                  {result.samples.length > 14 && <span className="self-center text-[11px] text-neutral-400">…อีก {result.samples.length - 14}</span>}
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
                        {cols.includes(i) ? " 🔠" : ""}
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
                              changed ? "bg-emerald-50 font-medium text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200" : ""
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

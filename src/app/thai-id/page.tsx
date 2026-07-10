"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { columnLetter } from "@/lib/reconcile/columns";
import { downloadText, downloadBlob } from "@/lib/reconcile/export";
import { rowsToCsv, rowsToXlsx, changeExt } from "@/lib/convertfile/convertfile";
import { checkThaiIds } from "@/lib/thaiid/thaiid";
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

// เดาคอลัมน์เลข 13 หลัก: จับชื่อหัวก่อน ไม่งั้นสแกนหาค่าที่เป็นเลข 13 หลักมากสุด
const HEADER_KEYS = ["ผู้เสียภาษี", "ภาษี", "tax", "บัตรประชาชน", "ประชาชน", "national id", "nid", "citizen", "เลข 13", "เลขประจำตัว"];
const ID13_RE = /^\s*\d[\d\s-]{11,15}\d\s*$/; // เผื่อขีด/ช่องว่าง

function digitsOnly(v: unknown): string {
  return String(v).replace(/[\s-]/g, "");
}

function guessColumn(header: Row, data: Row[]): number {
  // 1) จับตามชื่อหัว
  for (let i = 0; i < header.length; i++) {
    const h = String(header[i] ?? "").toLowerCase();
    if (HEADER_KEYS.some((k) => h.includes(k))) return i;
  }
  // 2) สแกนค่า: คอลัมน์ไหนมีค่าที่ดูเป็นเลข 13 หลักมากสุด
  const width = header.length;
  let best = -1;
  let bestHits = 0;
  const sample = data.slice(0, 40);
  for (let c = 0; c < width; c++) {
    let hits = 0;
    for (const r of sample) {
      const v = r[c];
      if ((typeof v === "string" || typeof v === "number") && ID13_RE.test(String(v)) && digitsOnly(v).length === 13) hits++;
    }
    if (hits > bestHits) {
      bestHits = hits;
      best = c;
    }
  }
  return bestHits > 0 ? best : header.length > 0 ? 0 : -1;
}

export default function ThaiIdPage() {
  const [state, setState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [col, setCol] = useState(0);

  const header = useMemo(() => headerRowOf(state), [state]);
  const data = useMemo(() => dataRowsOf(state), [state]);
  const headerStr = useMemo(() => header.map((h) => (h === null ? "" : String(h))), [header]);

  const result = useMemo(() => checkThaiIds(headerStr, data, col), [headerStr, data, col]);

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const parsed = await parseFile(file);
      const sel = makeSelection(parsed, 0);
      const hdr = parsed.sheets[sel.sheetIndex]?.rows[sel.headerRow] ?? [];
      const rows = (parsed.sheets[sel.sheetIndex]?.rows ?? []).slice(sel.dataStart);
      setCol(guessColumn(hdr, rows));
      setState({ file: parsed, sel });
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
    downloadText(changeExt(state.file.fileName, "csv", "-ตรวจเลข13"), rowsToCsv([result.header, ...result.rows]), "text/csv");
  };
  const dlXlsx = () => {
    if (!state || result.error) return;
    downloadBlob(changeExt(state.file.fileName, "xlsx", "-ตรวจเลข13"), rowsToXlsx([result.header, ...result.rows]), XLSX_MIME);
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];
  const shownRows = result.rows.slice(0, PREVIEW_ROWS);
  const hlCol = result.newColIndex;

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">ตรวจเลขบัตร ปชช. / ผู้เสียภาษี 🪪</h1>
          <p className="text-xs text-neutral-500">
            ตรวจเช็คดิจิตเลข 13 หลัก (บัตรประชาชน / เลขประจำตัวผู้เสียภาษี) — จับเลขพิมพ์ผิดในใบกำกับ/ทะเบียนผู้ส่งก่อนเข้า Pacred · ไม่แก้เลขเดิม แค่เพิ่มคอลัมน์ &ldquo;ผลตรวจ&rdquo;
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
            <h2 className="text-sm font-semibold">ไฟล์ที่มีเลข 13 หลัก</h2>
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

        {/* STEP 2: เลือกคอลัมน์ */}
        {state && (
          <div className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
            <h2 className="text-sm font-semibold">เลือกคอลัมน์เลข 13 หลัก</h2>
            <div className="flex flex-wrap gap-1.5">
              {header.map((h, i) => {
                const on = col === i;
                return (
                  <button
                    key={i}
                    onClick={() => setCol(i)}
                    className={`rounded border px-2 py-1 text-xs transition ${
                      on
                        ? "border-emerald-500 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                        : "border-black/15 text-neutral-500 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                    }`}
                  >
                    {on ? "✓ " : ""}
                    {columnLetter(i)} · {colLabel(header, i)}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-neutral-400">
              รูปแบบ: ตัวเลข 13 หลัก (เช่น 1-2345-67890-12-1) · หลักสุดท้าย = เช็คดิจิต ·
              เว้นวรรค/ขีดจะถูกตัดให้อัตโนมัติ · ใช้ได้ทั้งบัตรประชาชนและเลขนิติบุคคล/ผู้เสียภาษี (อัลกอริทึมเดียวกัน)
            </p>
          </div>
        )}

        {/* STEP 3: ผลตรวจ */}
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
                    ✓ ถูกต้อง <span className="tabular-nums">{result.valid}</span>
                  </span>
                  <span className="rounded-full bg-rose-100 px-3 py-1 font-medium text-rose-800 dark:bg-rose-900/40 dark:text-rose-300">
                    เช็คดิจิตผิด <span className="tabular-nums">{result.invalidCheck}</span>
                  </span>
                  <span className="rounded-full bg-orange-100 px-3 py-1 font-medium text-orange-800 dark:bg-orange-900/40 dark:text-orange-300">
                    รูปแบบผิด <span className="tabular-nums">{result.invalidFormat}</span>
                  </span>
                  <span className="rounded-full bg-neutral-100 px-3 py-1 font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                    ว่าง <span className="tabular-nums">{result.blank}</span>
                  </span>
                  <span className="text-neutral-400">
                    ตรวจ <span className="tabular-nums">{result.checked}</span> / {result.inputRows} แถว
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

            {/* กล่องรีวิวตัวที่ผิด */}
            {!result.error && result.findings.length > 0 && (
              <div className="border-b border-black/10 bg-rose-50/40 px-3 py-2 dark:border-white/10 dark:bg-rose-950/10">
                <p className="mb-1.5 text-xs font-medium text-rose-700 dark:text-rose-300">
                  เลขที่มีปัญหา ({result.findings.length}
                  {result.findings.length >= 50 ? "+" : ""}) — เช็คก่อนแก้ ไม่แก้ให้อัตโนมัติ
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {result.findings.slice(0, 20).map((f, i) => (
                    <span
                      key={i}
                      className="rounded border border-rose-200 bg-white px-2 py-1 text-[11px] dark:border-rose-900/40 dark:bg-neutral-900"
                      title={`แถว ${f.row + 1}`}
                    >
                      <span className="font-mono font-medium">{f.value || "(ว่าง)"}</span>
                      <span className="mx-1 text-neutral-400">
                        {f.status === "bad-format"
                          ? "· รูปแบบผิด"
                          : f.expected !== null
                            ? `· ควรลงท้าย ${f.expected}`
                            : "· เช็คดิจิตผิด"}
                      </span>
                    </span>
                  ))}
                  {result.findings.length > 20 && (
                    <span className="self-center text-[11px] text-neutral-400">…อีก {result.findings.length - 20}</span>
                  )}
                </div>
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
                        className={`px-2 py-1.5 whitespace-nowrap ${i === hlCol ? "text-emerald-700 dark:text-emerald-300" : ""}`}
                      >
                        {i === hlCol ? "🔎 " : ""}
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
                        const v = r[ci];
                        const isResult = ci === hlCol;
                        const txt = v === null || v === undefined ? "" : String(v);
                        const bad = isResult && txt.startsWith("✗");
                        const good = isResult && txt.startsWith("✓");
                        return (
                          <td
                            key={ci}
                            className={`max-w-[260px] truncate whitespace-nowrap px-2 py-1 ${
                              bad
                                ? "bg-rose-50 font-medium text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
                                : good
                                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300"
                                  : ci === col
                                    ? "font-mono"
                                    : ""
                            }`}
                          >
                            {txt}
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

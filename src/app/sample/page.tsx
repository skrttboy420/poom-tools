"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { downloadText, downloadBlob } from "@/lib/reconcile/export";
import { rowsToCsv, rowsToXlsx, changeExt } from "@/lib/convertfile/convertfile";
import { sampleRows, type SampleMode } from "@/lib/sample/sample";
import FileDropzone from "@/components/FileDropzone";
import type { Cell, ParsedFile, Row, SideSelection } from "@/lib/reconcile/types";

const PREVIEW_ROWS = 300;
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

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

const MODES: { key: SampleMode; label: string; hint: string }[] = [
  { key: "head", label: "แถวแรก N", hint: "ดึง N แถวแรกของไฟล์ (ดูหัวไฟล์)" },
  { key: "tail", label: "แถวท้าย N", hint: "ดึง N แถวท้ายของไฟล์ (ดูท้ายไฟล์)" },
  { key: "random", label: "สุ่ม N แถว", hint: "สุ่ม N แถวกระจายทั่วไฟล์ · ใส่ seed เพื่อทำซ้ำได้ผลเดิม (คงลำดับเดิม)" },
  { key: "systematic", label: "ทุก ๆ N แถว", hint: "ดึงทุก ๆ แถวที่ N (systematic) เริ่มที่ offset — กระจายสม่ำเสมอทั้งไฟล์" },
];

export default function SamplePage() {
  const [state, setState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<SampleMode>("random");
  const [n, setN] = useState(20);
  const [step, setStep] = useState(10);
  const [offset, setOffset] = useState(0);
  const [useSeed, setUseSeed] = useState(true);
  const [seed, setSeed] = useState(42);

  const header = useMemo(() => headerRowOf(state), [state]);
  const data = useMemo(() => dataRowsOf(state), [state]);

  const result = useMemo(
    () =>
      state
        ? sampleRows(data, {
            mode,
            n,
            step,
            offset,
            seed: mode === "random" && useSeed ? seed : undefined,
          })
        : null,
    [state, data, mode, n, step, offset, useSeed, seed],
  );

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const parsed = await parseFile(file);
      setState({ file: parsed, sel: makeSelection(parsed, 0) });
    } catch (e) {
      setError(`อ่านไฟล์ ${file.name} ไม่สำเร็จ: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const updateSel = useCallback((patch: Partial<SideSelection>) => {
    setState((cur) => (cur ? { ...cur, sel: { ...cur.sel, ...patch } } : cur));
  }, []);

  const outRows = useMemo<Row[]>(() => {
    if (!result || result.error) return [];
    return [header, ...result.rows];
  }, [result, header]);

  const dlCsv = () => {
    if (!state || outRows.length === 0) return;
    downloadText(changeExt(state.file.fileName, "csv", "-ตัวอย่าง"), rowsToCsv(outRows), "text/csv");
  };
  const dlXlsx = () => {
    if (!state || outRows.length === 0) return;
    downloadBlob(changeExt(state.file.fileName, "xlsx", "-ตัวอย่าง"), rowsToXlsx(outRows), XLSX_MIME);
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];
  const shown = result ? result.rows.slice(0, PREVIEW_ROWS) : [];

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">ดึงตัวอย่างแถว (Sampling) 🎰</h1>
          <p className="text-xs text-neutral-500">
            สุ่ม/ดึงบางแถวจากไฟล์ใหญ่ไว้ตรวจสอบ (spot-check) ก่อนเอาเข้า Pacred · แถวแรก/ท้าย, สุ่ม (ทำซ้ำได้ด้วย seed), หรือทุก ๆ N แถว ·
            อ่านอย่างเดียว ไม่แก้ข้อมูล · ผลเป็นส่วนหนึ่งของไฟล์เดิม คงลำดับเดิม
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
            <h2 className="text-sm font-semibold">ไฟล์ที่จะดึงตัวอย่าง</h2>
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
                          {r.slice(0, 10).map((c, ci) => (
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

        {/* STEP 2: เลือกวิธีดึง */}
        {state && (
          <div className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
            <div>
              <h2 className="mb-1 text-sm font-semibold">วิธีดึงตัวอย่าง</h2>
              <div className="flex flex-wrap gap-1.5">
                {MODES.map((m) => {
                  const on = mode === m.key;
                  return (
                    <button
                      key={m.key}
                      onClick={() => setMode(m.key)}
                      title={m.hint}
                      className={`rounded-full border px-3 py-1 text-xs transition ${
                        on
                          ? "border-indigo-600 bg-indigo-600 text-white"
                          : "border-black/15 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                      }`}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-[11px] text-neutral-400">{MODES.find((m) => m.key === mode)?.hint}</p>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs">
              {(mode === "head" || mode === "tail" || mode === "random") && (
                <label className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
                  จำนวนแถว:
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={n}
                    onChange={(e) => setN(Math.floor(Number(e.target.value)) || 0)}
                    className="w-24 rounded border border-black/15 bg-transparent px-1.5 py-1 dark:border-white/15 dark:bg-neutral-900"
                  />
                </label>
              )}
              {mode === "systematic" && (
                <>
                  <label className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
                    ทุก ๆ (แถว):
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={step}
                      onChange={(e) => setStep(Math.floor(Number(e.target.value)) || 0)}
                      className="w-20 rounded border border-black/15 bg-transparent px-1.5 py-1 dark:border-white/15 dark:bg-neutral-900"
                    />
                  </label>
                  <label className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
                    เริ่มที่แถว (0-based):
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={offset}
                      onChange={(e) => setOffset(Math.max(0, Math.floor(Number(e.target.value)) || 0))}
                      className="w-20 rounded border border-black/15 bg-transparent px-1.5 py-1 dark:border-white/15 dark:bg-neutral-900"
                    />
                  </label>
                </>
              )}
              {mode === "random" && (
                <>
                  <label className="flex cursor-pointer items-center gap-1.5 text-neutral-600 dark:text-neutral-400" title="ใส่ seed แล้วสุ่มได้ผลเดิมทุกครั้ง (ทำซ้ำได้/แชร์ได้)">
                    <input type="checkbox" checked={useSeed} onChange={(e) => setUseSeed(e.target.checked)} />
                    ทำซ้ำได้ (seed)
                  </label>
                  {useSeed && (
                    <label className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
                      seed:
                      <input
                        type="number"
                        step={1}
                        value={seed}
                        onChange={(e) => setSeed(Math.floor(Number(e.target.value)) || 0)}
                        className="w-24 rounded border border-black/15 bg-transparent px-1.5 py-1 dark:border-white/15 dark:bg-neutral-900"
                      />
                    </label>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* STEP 3: ผลลัพธ์ */}
        {state && result && !result.error && (
          <div className="rounded-xl border border-black/10 dark:border-white/10">
            <div className="flex flex-wrap items-center gap-2 border-b border-black/10 px-3 py-2 text-xs dark:border-white/10">
              <span className="rounded-full bg-indigo-100 px-3 py-1 font-medium text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300">
                ดึง <span className="tabular-nums">{result.sampled.toLocaleString("en-US")}</span> / {result.dataRows.toLocaleString("en-US")} แถว
              </span>
              {mode === "random" && result.seedUsed !== null && (
                <span className="text-neutral-400">seed {result.seedUsed}</span>
              )}
              {result.sampled > PREVIEW_ROWS && (
                <span className="text-amber-600 dark:text-amber-400">แสดง {PREVIEW_ROWS} แถวแรก</span>
              )}
              <div className="ml-auto flex gap-2">
                <button onClick={dlCsv} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700">
                  ↓ CSV
                </button>
                <button onClick={dlXlsx} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700">
                  ↓ Excel
                </button>
              </div>
            </div>

            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-neutral-50 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
                  <tr>
                    <th className="border-b border-r border-black/10 px-2 py-1.5 text-right text-neutral-400 dark:border-white/10">แถวเดิม</th>
                    {header.map((h, ci) => (
                      <th key={ci} className="border-b border-black/10 px-2 py-1.5 text-left dark:border-white/10">
                        {h === null || h === undefined ? "" : String(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r, ri) => (
                    <tr key={ri} className="border-t border-black/5 dark:border-white/5">
                      <td className="border-r border-black/10 px-2 py-1 text-right tabular-nums text-neutral-400 dark:border-white/10">
                        {(result.indexes[ri] ?? 0) + 1}
                      </td>
                      {header.map((_, ci) => {
                        const c: Cell = ci < r.length ? r[ci] ?? null : null;
                        return (
                          <td key={ci} className="max-w-[220px] truncate whitespace-nowrap px-2 py-1">
                            {c === null ? "" : String(c)}
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

        {state && result?.error && (
          <p className="rounded-md border border-amber-500/30 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
            {result.error}
          </p>
        )}
      </section>
    </main>
  );
}

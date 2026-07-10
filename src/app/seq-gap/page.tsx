"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { columnOptionLabel, columnLetter } from "@/lib/reconcile/columns";
import { downloadText } from "@/lib/reconcile/export";
import { changeExt } from "@/lib/convertfile/convertfile";
import {
  findSequenceGaps,
  seqGapToCsv,
  summarizeRanges,
  extractInt,
  EXTRACT_MODES,
  EXTRACT_LABEL,
  type ExtractMode,
} from "@/lib/seqgap/seqgap";
import FileDropzone from "@/components/FileDropzone";
import type { Cell, ParsedFile, Row, SideSelection } from "@/lib/reconcile/types";

const PREVIEW_MISSING = 2000;

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

function headerText(h: Cell): string {
  return h === null || h === undefined || String(h).trim() === "" ? "" : String(h);
}

// เดาคอลัมน์ + โหมดดึงเลข: ชื่อหัวเข้าข่ายเลขลำดับก่อน; ไม่งั้นคอลัมน์ที่ดึงเลขได้เยอะสุด
function guessColumnAndMode(header: Row, rows: Row[]): { col: number; mode: ExtractMode } {
  const width = header.length;
  if (width === 0) return { col: -1, mode: "trailing" };
  const NAME_HINT = /box|กล่อง|no\.?|เลขที่|running|ลำดับ|seq|ใบ|invoice|order|ที่|tracking|เลข/i;
  const sample = rows.slice(0, 200);

  // เลือกโหมดต่อคอลัมน์: whole ถ้าค่าเป็นเลขล้วนส่วนใหญ่, ไม่งั้น trailing
  const scoreCol = (c: number): { parsedWhole: number; parsedTrailing: number; filled: number } => {
    let filled = 0;
    let pw = 0;
    let pt = 0;
    for (const r of sample) {
      const v: Cell = c < r.length ? (r[c] ?? null) : null;
      if (v === null || (typeof v === "string" && v.trim() === "")) continue;
      filled++;
      if (extractInt(v, "whole") !== null) pw++;
      if (extractInt(v, "trailing") !== null) pt++;
    }
    return { parsedWhole: pw, parsedTrailing: pt, filled };
  };

  // 1) หัวตารางเข้าข่าย + ดึงเลขได้
  for (let c = 0; c < width; c++) {
    if (!NAME_HINT.test(headerText(header[c]))) continue;
    const s = scoreCol(c);
    if (s.filled > 0 && s.parsedTrailing >= s.filled / 2) {
      return { col: c, mode: s.parsedWhole >= s.filled / 2 ? "whole" : "trailing" };
    }
  }
  // 2) คอลัมน์ที่ trailing ดึงได้มากสุด
  let best = -1;
  let bestParsed = 0;
  let bestWhole = 0;
  let bestFilled = 0;
  for (let c = 0; c < width; c++) {
    const s = scoreCol(c);
    if (s.parsedTrailing > bestParsed) {
      bestParsed = s.parsedTrailing;
      bestWhole = s.parsedWhole;
      bestFilled = s.filled;
      best = c;
    }
  }
  if (best < 0) return { col: 0, mode: "trailing" };
  return { col: best, mode: bestWhole >= bestFilled / 2 ? "whole" : "trailing" };
}

export default function SeqGapPage() {
  const [state, setState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [col, setCol] = useState(-1);
  const [mode, setMode] = useState<ExtractMode>("trailing");
  const [startStr, setStartStr] = useState("");
  const [endStr, setEndStr] = useState("");

  const header = useMemo(() => headerRowOf(state), [state]);
  const data = useMemo(() => dataRowsOf(state), [state]);

  const rangeStart = startStr.trim() === "" ? null : Number(startStr);
  const rangeEnd = endStr.trim() === "" ? null : Number(endStr);

  const result = useMemo(
    () =>
      state && col >= 0
        ? findSequenceGaps(header, data, col, {
            extract: mode,
            rangeStart: rangeStart != null && Number.isFinite(rangeStart) ? rangeStart : null,
            rangeEnd: rangeEnd != null && Number.isFinite(rangeEnd) ? rangeEnd : null,
          })
        : null,
    [state, header, data, col, mode, rangeStart, rangeEnd],
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
      const g = guessColumnAndMode(rows[sel.headerRow] ?? [], rows.slice(sel.dataStart));
      setCol(g.col);
      setMode(g.mode);
      setStartStr("");
      setEndStr("");
    } catch (e) {
      setError(`อ่านไฟล์ ${file.name} ไม่สำเร็จ: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const updateSel = useCallback((patch: Partial<SideSelection>) => {
    setState((cur) => {
      if (!cur) return cur;
      const next = { ...cur, sel: { ...cur.sel, ...patch } };
      const rows = next.file.sheets[next.sel.sheetIndex]?.rows ?? [];
      const g = guessColumnAndMode(rows[next.sel.headerRow] ?? [], rows.slice(next.sel.dataStart));
      setCol(g.col);
      setMode(g.mode);
      return next;
    });
  }, []);

  const dlCsv = () => {
    if (!state || !result || result.error || result.missing.length === 0) return;
    downloadText(
      changeExt(state.file.fileName, "csv", "-เลขขาด"),
      seqGapToCsv(result),
      "text/csv",
    );
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];
  const missingSummary = result ? summarizeRanges(result.missing) : "";
  const shownMissing = result ? result.missing.slice(0, PREVIEW_MISSING) : [];

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">ตรวจเลขขาดช่วง (Sequence Gap) 🕳️</h1>
          <p className="text-xs text-neutral-500">
            เลือก 1 คอลัมน์ที่ควรเป็นเลขต่อเนื่อง (เลขกล่อง / เลขใบ / running number) → บอกทันทีว่า
            <b>ขาดเลขไหนบ้าง</b> + เลขไหน<b>ซ้ำ</b> · เช่น กล่อง 1-500 แต่ 37, 52 หาย · อ่านอย่างเดียว ไม่แก้ข้อมูล
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
            <h2 className="text-sm font-semibold">ไฟล์ที่จะตรวจ</h2>
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

        {/* STEP 2: เลือกคอลัมน์ + ตัวเลือก */}
        {state && (
          <div className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
            <div>
              <h2 className="mb-1 text-sm font-semibold">คอลัมน์ที่จะตรวจ (เลขลำดับ)</h2>
              <div className="flex flex-wrap gap-1.5">
                {header.map((h, i) => {
                  const on = col === i;
                  return (
                    <button
                      key={i}
                      onClick={() => setCol(i)}
                      title={columnOptionLabel(h, i)}
                      className={`rounded-full border px-2.5 py-1 text-xs transition ${
                        on
                          ? "border-indigo-600 bg-indigo-600 text-white"
                          : "border-black/15 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                      }`}
                    >
                      {columnLetter(i)} · {headerText(h) || "(ว่าง)"}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs">
              <label className="flex items-center gap-1 text-neutral-500">
                วิธีดึงเลข:
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as ExtractMode)}
                  className="rounded border border-black/15 bg-transparent px-1.5 py-1 dark:border-white/15 dark:bg-neutral-900"
                >
                  {EXTRACT_MODES.map((m) => (
                    <option key={m} value={m}>
                      {EXTRACT_LABEL[m]}
                    </option>
                  ))}
                </select>
              </label>
              <label
                className="flex items-center gap-1 text-neutral-500"
                title="ปล่อยว่าง = ใช้เลขน้อยสุดในข้อมูล"
              >
                ช่วงตั้งแต่:
                <input
                  type="number"
                  value={startStr}
                  placeholder="auto"
                  onChange={(e) => setStartStr(e.target.value)}
                  className="w-20 rounded border border-black/15 bg-transparent px-1.5 py-1 dark:border-white/15"
                />
              </label>
              <label
                className="flex items-center gap-1 text-neutral-500"
                title="ปล่อยว่าง = ใช้เลขมากสุดในข้อมูล"
              >
                ถึง:
                <input
                  type="number"
                  value={endStr}
                  placeholder="auto"
                  onChange={(e) => setEndStr(e.target.value)}
                  className="w-20 rounded border border-black/15 bg-transparent px-1.5 py-1 dark:border-white/15"
                />
              </label>
            </div>
            <p className="text-[11px] text-neutral-400">
              กำหนดช่วงเองได้ เช่น รู้ว่าควรมีกล่อง 1-500 แต่ไฟล์มีถึงแค่ 480 → ใส่ ถึง = 500
              เพื่อจับตัวท้าย ๆ ที่หายด้วย
            </p>
          </div>
        )}

        {/* STEP 3: ผลลัพธ์ */}
        {state && result && !result.error && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span
                className={`rounded-full px-3 py-1 font-medium ${
                  result.missingCount === 0
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                    : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                }`}
              >
                {result.missingCount === 0
                  ? "✓ ครบ ไม่ขาดเลข"
                  : `ขาด ${result.missingCount.toLocaleString("en-US")} เลข`}
              </span>
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                ช่วง {result.rangeStart}–{result.rangeEnd} · ควรมี{" "}
                <span className="tabular-nums">{result.expectedCount.toLocaleString("en-US")}</span>{" "}
                มีจริง{" "}
                <span className="tabular-nums">{result.presentInRange.toLocaleString("en-US")}</span>
              </span>
              {result.duplicateCount > 0 && (
                <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                  ซ้ำ {result.duplicateCount} ค่า
                </span>
              )}
              {result.skipped > 0 && (
                <span className="text-neutral-400">ดึงเลขไม่ได้ {result.skipped} ช่อง</span>
              )}
              {result.outOfRange > 0 && (
                <span className="text-neutral-400">นอกช่วง {result.outOfRange}</span>
              )}
              {result.missing.length > 0 && (
                <button
                  onClick={dlCsv}
                  className="ml-auto rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700"
                >
                  ↓ CSV เลขที่หาย
                </button>
              )}
            </div>

            {/* เลขที่หาย */}
            {result.missingCount > 0 ? (
              <div className="rounded-xl border border-red-500/25 bg-red-50/50 p-4 dark:border-red-500/20 dark:bg-red-950/20">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-red-700 dark:text-red-300">
                    เลขที่หาย
                    {result.cappedMissing && (
                      <span className="ml-2 text-[11px] font-normal text-amber-600 dark:text-amber-400">
                        (แสดงบางส่วน — มีมากเกินไป)
                      </span>
                    )}
                  </h3>
                  {missingSummary && (
                    <span className="text-[11px] text-neutral-500">ช่วง: {missingSummary}</span>
                  )}
                </div>
                <div className="flex max-h-60 flex-wrap gap-1.5 overflow-auto">
                  {shownMissing.map((n) => (
                    <span
                      key={n}
                      className="rounded bg-red-100 px-2 py-0.5 font-mono text-xs text-red-800 tabular-nums dark:bg-red-900/40 dark:text-red-300"
                    >
                      {n}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-50/50 p-4 text-sm text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-950/20 dark:text-emerald-300">
                ✓ เลขในช่วง {result.rangeStart}–{result.rangeEnd} ครบทุกตัว ไม่มีเลขหาย
              </div>
            )}

            {/* เลขซ้ำ */}
            {result.duplicates.length > 0 && (
              <div className="rounded-xl border border-amber-500/25 bg-amber-50/50 p-4 dark:border-amber-500/20 dark:bg-amber-950/20">
                <h3 className="mb-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
                  เลขที่ซ้ำ ({result.duplicates.length})
                </h3>
                <div className="flex max-h-40 flex-wrap gap-1.5 overflow-auto">
                  {result.duplicates.slice(0, 500).map((d) => (
                    <span
                      key={d.value}
                      className="rounded bg-amber-100 px-2 py-0.5 font-mono text-xs text-amber-800 tabular-nums dark:bg-amber-900/40 dark:text-amber-300"
                    >
                      {d.value} ×{d.count}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {state && result?.error && (
          <p className="rounded-md border border-amber-500/30 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
            {result.error}
          </p>
        )}

        {state && col < 0 && (
          <p className="rounded-md border border-black/10 px-4 py-3 text-sm text-neutral-500 dark:border-white/10">
            เลือกคอลัมน์ที่จะตรวจ
          </p>
        )}
      </section>
    </main>
  );
}

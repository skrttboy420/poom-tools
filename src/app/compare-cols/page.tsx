"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { columnLetter } from "@/lib/reconcile/columns";
import { downloadText } from "@/lib/reconcile/export";
import { changeExt } from "@/lib/convertfile/convertfile";
import { compareColumns, colCompareToCsv, STATUS_LABEL, type CompareStatus } from "@/lib/colcompare/colcompare";
import FileDropzone from "@/components/FileDropzone";
import type { ParsedFile, Row, SideSelection, Cell } from "@/lib/reconcile/types";

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
  return h === null || h === undefined || String(h).trim() === "" ? `(ว่าง)` : String(h);
}

function isBlank(v: Cell): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

function looksNumeric(v: Cell): boolean {
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v !== "string") return false;
  const s = v.replace(/,/g, "").trim();
  return s !== "" && Number.isFinite(Number(s));
}

// ตัดคำที่บอก "แจ้ง/จริง" ออก เพื่อจับคู่คอลัมน์ที่เป็นค่าเดียวกันแต่คนละที่มา
const PAIR_NOISE = /(แจ้ง|ชั่ง|จริง|นับ|declared|actual|expected|count|est|estimate|scale|invoice|packing)/gi;
function pairKey(h: Cell): string {
  return String(h ?? "")
    .replace(PAIR_NOISE, "")
    .replace(/[\s_()\-–]/g, "")
    .toLowerCase();
}

// เดาคู่คอลัมน์ที่น่าจะเทียบกัน: (1) หัวตารางฐานเดียวกัน (kg แจ้ง ↔ kg ชั่ง) (2) 2 คอลัมน์ตัวเลขแรก
function guessPair(header: Row, data: Row[]): [number, number] {
  const width = header.length;
  const sample = data.slice(0, 100);
  // (1) header base-name match
  const seen = new Map<string, number>();
  for (let c = 0; c < width; c++) {
    const k = pairKey(header[c]);
    if (k === "") continue;
    if (seen.has(k)) return [seen.get(k)!, c];
    seen.set(k, c);
  }
  // (2) numeric columns
  const numericCols: number[] = [];
  for (let c = 0; c < width; c++) {
    let filled = 0;
    let num = 0;
    for (const row of sample) {
      const v = row[c];
      if (isBlank(v)) continue;
      filled++;
      if (looksNumeric(v)) num++;
    }
    if (filled >= 2 && num >= filled / 2) numericCols.push(c);
  }
  if (numericCols.length >= 2) return [numericCols[0], numericCols[1]];
  if (width >= 2) return [0, 1];
  return [0, width > 1 ? 1 : 0];
}

const STATUS_CLASS: Record<CompareStatus, string> = {
  match: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  diff: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  "only-a": "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  "only-b": "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200",
  "both-blank": "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400",
};
const STATUS_ROW: Record<CompareStatus, string> = {
  match: "",
  diff: "bg-amber-50 dark:bg-amber-950/20",
  "only-a": "bg-sky-50 dark:bg-sky-950/20",
  "only-b": "bg-violet-50 dark:bg-violet-950/20",
  "both-blank": "",
};
const CHIP_ORDER: CompareStatus[] = ["match", "diff", "only-a", "only-b", "both-blank"];

export default function CompareColsPage() {
  const [state, setState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [colA, setColA] = useState(0);
  const [colB, setColB] = useState(1);
  const [tolerance, setTolerance] = useState(0);
  const [caseInsensitive, setCaseInsensitive] = useState(true);
  const [trim, setTrim] = useState(true);
  const [onlyDiff, setOnlyDiff] = useState(false);

  const header = useMemo(() => headerRowOf(state), [state]);
  const data = useMemo(() => dataRowsOf(state), [state]);
  const headerStr = useMemo(() => header.map((h) => (h === null ? "" : String(h))), [header]);

  const result = useMemo(
    () => compareColumns(headerStr, data, { colA, colB, tolerance, caseInsensitive, trim }),
    [headerStr, data, colA, colB, tolerance, caseInsensitive, trim],
  );

  const shown = useMemo(() => {
    const base = onlyDiff ? result.rows.filter((r) => r.status !== "match" && r.status !== "both-blank") : result.rows;
    return base.slice(0, PREVIEW_ROWS);
  }, [result, onlyDiff]);

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
      const [a, b] = guessPair(hdr, dat);
      setState({ file: parsed, sel });
      setColA(a);
      setColB(b);
    } catch (e) {
      setError(`อ่านไฟล์ ${file.name} ไม่สำเร็จ: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const updateSel = useCallback((patch: Partial<SideSelection>) => {
    setState((cur) => (cur ? { ...cur, sel: { ...cur.sel, ...patch } } : cur));
  }, []);

  const dlCsv = (diffOnly: boolean) => {
    if (!state || result.error) return;
    const suffix = diffOnly ? "-ต่าง" : "-เทียบคอลัมน์";
    downloadText(changeExt(state.file.fileName, "csv", suffix), colCompareToCsv(result, diffOnly), "text/csv");
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];
  const width = header.length;

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">เทียบ 2 คอลัมน์ 🆚</h1>
          <p className="text-xs text-neutral-500">
            เทียบค่าทีละแถวระหว่าง 2 คอลัมน์ในไฟล์เดียว (เช่น น้ำหนักแจ้ง ↔ ชั่งจริง) — บอกว่าตรง/ไม่ตรง/มีฝั่งเดียว + ผลต่าง · ตัวเลขมี tolerance · อ่านอย่างเดียว ไม่แก้ข้อมูล
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
            <h2 className="text-sm font-semibold">ไฟล์ที่จะเทียบ</h2>
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

        {/* STEP 2: เลือกคอลัมน์ + ตัวเลือก */}
        {state && (
          <div className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
            <h2 className="text-sm font-semibold">เทียบคอลัมน์ไหนกับไหน</h2>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <label className="flex items-center gap-1">
                <span className="rounded bg-sky-100 px-1.5 py-0.5 font-medium text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">A</span>
                <select
                  value={colA}
                  onChange={(e) => setColA(Number(e.target.value))}
                  className="rounded border border-black/15 bg-transparent px-1.5 py-1 dark:border-white/15 dark:bg-neutral-900"
                >
                  {Array.from({ length: width }, (_, i) => (
                    <option key={i} value={i}>
                      {columnLetter(i)} · {colLabel(header, i)}
                    </option>
                  ))}
                </select>
              </label>
              <span className="text-neutral-400">🆚</span>
              <label className="flex items-center gap-1">
                <span className="rounded bg-violet-100 px-1.5 py-0.5 font-medium text-violet-800 dark:bg-violet-900/40 dark:text-violet-200">B</span>
                <select
                  value={colB}
                  onChange={(e) => setColB(Number(e.target.value))}
                  className="rounded border border-black/15 bg-transparent px-1.5 py-1 dark:border-white/15 dark:bg-neutral-900"
                >
                  {Array.from({ length: width }, (_, i) => (
                    <option key={i} value={i}>
                      {columnLetter(i)} · {colLabel(header, i)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-4 border-t border-black/5 pt-3 text-xs dark:border-white/5">
              <label className="flex items-center gap-1.5">
                ค่าคลาดเคลื่อนตัวเลข (tolerance):
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={tolerance}
                  onChange={(e) => setTolerance(Math.max(0, Number(e.target.value) || 0))}
                  className="w-24 rounded border border-black/15 bg-transparent px-1.5 py-1 dark:border-white/15"
                />
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={caseInsensitive} onChange={(e) => setCaseInsensitive(e.target.checked)} />
                ไม่สนพิมพ์เล็ก/ใหญ่ (ข้อความ)
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} />
                ตัดช่องว่างหัว-ท้าย
              </label>
            </div>
            <p className="rounded-md border border-black/5 bg-black/[0.02] px-3 py-2 text-xs text-neutral-500 dark:border-white/5 dark:bg-white/[0.02]">
              ถ้าทั้ง 2 ช่องเป็นตัวเลข → เทียบด้วย tolerance (|B−A| ≤ ค่าที่ตั้ง = ตรง) · ไม่งั้นเทียบแบบข้อความ · ช่องว่างฝั่งเดียว = &quot;เฉพาะ A/B&quot;
            </p>
          </div>
        )}

        {/* STEP 3: ผลลัพธ์ */}
        {state && (
          <div className="rounded-xl border border-black/10 dark:border-white/10">
            <div className="flex flex-wrap items-center gap-2 border-b border-black/10 px-3 py-2 text-xs dark:border-white/10">
              {result.error ? (
                <span className="rounded-full bg-red-100 px-3 py-1 font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300">{result.error}</span>
              ) : (
                <>
                  {CHIP_ORDER.map((st) =>
                    result.counts[st] > 0 ? (
                      <span key={st} className={`rounded-full px-3 py-1 font-medium ${STATUS_CLASS[st]}`}>
                        {STATUS_LABEL[st]} <span className="tabular-nums">{result.counts[st]}</span>
                      </span>
                    ) : null,
                  )}
                  <span className="text-neutral-400">
                    จาก <span className="tabular-nums">{result.dataRows}</span> แถว
                    {result.numericComparable > 0 && (
                      <>
                        {" · "}เทียบตัวเลข <span className="tabular-nums">{result.numericComparable}</span>
                      </>
                    )}
                  </span>
                </>
              )}
              {!result.error && (
                <label className="ml-2 flex items-center gap-1.5 text-neutral-500">
                  <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} />
                  เฉพาะที่ไม่ตรง
                </label>
              )}
              <div className="ml-auto flex gap-2">
                <button
                  onClick={() => dlCsv(false)}
                  disabled={!!result.error}
                  className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium hover:bg-black/5 disabled:opacity-40 dark:border-white/15 dark:hover:bg-white/10"
                >
                  ↓ CSV ทั้งหมด
                </button>
                <button
                  onClick={() => dlCsv(true)}
                  disabled={!!result.error}
                  className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-amber-700 disabled:opacity-40"
                >
                  ↓ เฉพาะที่ไม่ตรง
                </button>
              </div>
            </div>

            {!result.error && (
              <div className="max-h-[55vh] overflow-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-900">
                    <tr>
                      <th className="px-2 py-1.5">#</th>
                      <th className="px-2 py-1.5 whitespace-nowrap">
                        <span className="rounded bg-sky-100 px-1 text-[10px] text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">A</span> {result.aName}
                      </th>
                      <th className="px-2 py-1.5 whitespace-nowrap">
                        <span className="rounded bg-violet-100 px-1 text-[10px] text-violet-800 dark:bg-violet-900/40 dark:text-violet-200">B</span> {result.bName}
                      </th>
                      <th className="px-2 py-1.5">สถานะ</th>
                      <th className="px-2 py-1.5 text-right">ผลต่าง (B−A)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => (
                      <tr key={r.row} className={`border-t border-black/5 dark:border-white/5 ${STATUS_ROW[r.status]}`}>
                        <td className="px-2 py-1 text-right text-neutral-400 tabular-nums">{r.row + 1}</td>
                        <td className="max-w-[220px] truncate whitespace-nowrap px-2 py-1">{r.a || <span className="text-neutral-300">—</span>}</td>
                        <td className="max-w-[220px] truncate whitespace-nowrap px-2 py-1">{r.b || <span className="text-neutral-300">—</span>}</td>
                        <td className="px-2 py-1">
                          <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_CLASS[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums">
                          {r.delta === null ? (
                            <span className="text-neutral-300">—</span>
                          ) : (
                            <span className={r.delta === 0 ? "text-neutral-400" : r.delta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                              {r.delta > 0 ? "+" : ""}
                              {r.delta}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {shown.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-2 py-4 text-center text-neutral-400">
                          {onlyDiff ? "ไม่มีแถวที่ไม่ตรง 🎉" : "ไม่มีแถวข้อมูล"}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            {!result.error && result.rows.length > PREVIEW_ROWS && !onlyDiff && (
              <div className="border-t border-black/10 px-3 py-1.5 text-center text-[11px] text-neutral-400 dark:border-white/10">
                แสดง {PREVIEW_ROWS} แถวแรกจาก {result.rows.length}
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

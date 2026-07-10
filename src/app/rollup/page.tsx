"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { columnOptionLabel, columnLetter } from "@/lib/reconcile/columns";
import { downloadText, downloadBlob } from "@/lib/reconcile/export";
import { rowsToCsv, rowsToXlsx, changeExt } from "@/lib/convertfile/convertfile";
import { rollupByKey, type OtherMode } from "@/lib/rollup/rollup";
import FileDropzone from "@/components/FileDropzone";
import type { Cell, ParsedFile, Row, SideSelection } from "@/lib/reconcile/types";

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

function headerText(h: Cell): string {
  return h === null || h === undefined || String(h).trim() === "" ? "" : String(h);
}

// เดา key = คอลัมน์ tracking/เลขพัสดุ · เดา sum = คอลัมน์ตัวเลข (kg/cbm/box)
function guessCols(header: Row, rows: Row[]): { key: number[]; sum: number[] } {
  const width = header.length;
  if (width === 0) return { key: [], sum: [] };
  const KEY_HINT = /tracking|พัสดุ|เลขพัสดุ|awb|ref|เลขที่|barcode|hbl|mbl/i;
  const SUM_HINT = /kg|น้ำหนัก|weight|cbm|คิว|ปริมาตร|volume|กล่อง|box|จำนวน|qty|ชิ้น|pcs|amount|ยอด/i;
  const sample = rows.slice(0, 200);
  const numericRatio = (c: number): number => {
    let filled = 0;
    let num = 0;
    for (const r of sample) {
      const v: Cell = c < r.length ? (r[c] ?? null) : null;
      if (v === null || (typeof v === "string" && v.trim() === "")) continue;
      filled++;
      const t = typeof v === "number" ? v : Number(String(v).replace(/,/g, "").trim());
      if (Number.isFinite(t)) num++;
    }
    return filled === 0 ? 0 : num / filled;
  };

  let key = -1;
  for (let c = 0; c < width; c++) {
    if (KEY_HINT.test(headerText(header[c]))) {
      key = c;
      break;
    }
  }
  if (key < 0) {
    // fallback: คอลัมน์แรกที่ "ไม่ใช่ตัวเลขล้วน" (น่าจะเป็น id/tracking)
    for (let c = 0; c < width; c++) {
      if (numericRatio(c) < 0.5) {
        key = c;
        break;
      }
    }
    if (key < 0) key = 0;
  }

  const sum: number[] = [];
  for (let c = 0; c < width; c++) {
    if (c === key) continue;
    const isNum = numericRatio(c) >= 0.5;
    if (isNum && (SUM_HINT.test(headerText(header[c])) || sum.length < 3)) sum.push(c);
  }
  return { key: [key], sum };
}

export default function RollupPage() {
  const [state, setState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [keyCols, setKeyCols] = useState<number[]>([]);
  const [sumCols, setSumCols] = useState<number[]>([]);
  const [otherMode, setOtherMode] = useState<OtherMode>("first");
  const [trim, setTrim] = useState(true);
  const [caseInsensitive, setCaseInsensitive] = useState(false);
  const [dropEmptyKey, setDropEmptyKey] = useState(false);
  const [addCount, setAddCount] = useState(false);

  const header = useMemo(() => headerRowOf(state), [state]);
  const data = useMemo(() => dataRowsOf(state), [state]);

  const result = useMemo(
    () =>
      state && keyCols.length > 0
        ? rollupByKey(header, data, keyCols, sumCols, {
            otherMode,
            trim,
            caseInsensitive,
            dropEmptyKey,
            addCount,
          })
        : null,
    [state, header, data, keyCols, sumCols, otherMode, trim, caseInsensitive, dropEmptyKey, addCount],
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
      const g = guessCols(rows[sel.headerRow] ?? [], rows.slice(sel.dataStart));
      setKeyCols(g.key);
      setSumCols(g.sum);
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
      const g = guessCols(rows[next.sel.headerRow] ?? [], rows.slice(next.sel.dataStart));
      setKeyCols(g.key);
      setSumCols(g.sum);
      return next;
    });
  }, []);

  const toggle = (list: number[], setList: (v: number[]) => void, i: number) =>
    setList(list.includes(i) ? list.filter((x) => x !== i) : [...list, i].sort((a, b) => a - b));

  const dlCsv = () => {
    if (!state || !result || result.error) return;
    downloadText(
      changeExt(state.file.fileName, "csv", "-รวมแถว"),
      rowsToCsv([result.header, ...result.rows]),
      "text/csv",
    );
  };
  const dlXlsx = () => {
    if (!state || !result || result.error) return;
    downloadBlob(
      changeExt(state.file.fileName, "xlsx", "-รวมแถว"),
      rowsToXlsx([result.header, ...result.rows]),
      XLSX_MIME,
    );
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];
  const shownRows = result ? result.rows.slice(0, PREVIEW_ROWS) : [];

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">รวมแถวซ้ำ (Rollup) 🗜️</h1>
          <p className="text-xs text-neutral-500">
            ยุบหลายแถวที่ key เดียวกันเป็นแถวเดียว → คอลัมน์ตัวเลข<b>รวมยอด</b> (kg/CBM/กล่อง)
            คอลัมน์อื่นเก็บค่าตัวแทน · เช่น 1 tracking แตกหลายกล่อง → 1 แถวพร้อมยอดรวม ·
            เก็บทุกคอลัมน์เดิม (ต่างจาก /group ที่เหลือแค่ key+ยอด)
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

        {/* STEP 2: เลือกคอลัมน์ */}
        {state && (
          <div className="space-y-4 rounded-xl border border-black/10 p-4 dark:border-white/10">
            <div>
              <h2 className="mb-1 text-sm font-semibold">
                คอลัมน์ key (ยุบแถวที่ค่าเหมือนกัน){" "}
                <span className="font-normal text-neutral-400">— เช่น tracking</span>
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {header.map((h, i) => {
                  const on = keyCols.includes(i);
                  return (
                    <button
                      key={i}
                      onClick={() => toggle(keyCols, setKeyCols, i)}
                      title={columnOptionLabel(h, i)}
                      className={`rounded-full border px-2.5 py-1 text-xs transition ${
                        on
                          ? "border-sky-600 bg-sky-600 text-white"
                          : "border-black/15 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                      }`}
                    >
                      {columnLetter(i)} · {headerText(h) || "(ว่าง)"}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <h2 className="mb-1 text-sm font-semibold">
                คอลัมน์ที่จะ<b>รวมยอด</b> (sum){" "}
                <span className="font-normal text-neutral-400">— เช่น kg / CBM / กล่อง</span>
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {header.map((h, i) => {
                  const isKey = keyCols.includes(i);
                  const on = sumCols.includes(i);
                  return (
                    <button
                      key={i}
                      disabled={isKey}
                      onClick={() => toggle(sumCols, setSumCols, i)}
                      title={isKey ? "เป็นคอลัมน์ key อยู่แล้ว" : columnOptionLabel(h, i)}
                      className={`rounded-full border px-2.5 py-1 text-xs transition ${
                        isKey
                          ? "cursor-not-allowed border-black/10 text-neutral-300 dark:border-white/10 dark:text-neutral-600"
                          : on
                            ? "border-emerald-600 bg-emerald-600 text-white"
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
                คอลัมน์อื่นเก็บค่า:
                <select
                  value={otherMode}
                  onChange={(e) => setOtherMode(e.target.value as OtherMode)}
                  className="rounded border border-black/15 bg-transparent px-1.5 py-1 dark:border-white/15 dark:bg-neutral-900"
                >
                  <option value="first">แถวแรกของกลุ่ม</option>
                  <option value="last">แถวสุดท้ายของกลุ่ม</option>
                </select>
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
                <input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} />
                ตัดช่องว่างหน้า-หลัง (เทียบ key)
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
                <input
                  type="checkbox"
                  checked={caseInsensitive}
                  onChange={(e) => setCaseInsensitive(e.target.checked)}
                />
                ไม่สนพิมพ์เล็ก/ใหญ่
              </label>
              <label
                className="flex cursor-pointer items-center gap-1.5 text-neutral-600 dark:text-neutral-400"
                title="ถ้าปิด: แถวคีย์ว่างจะคงเป็นแถวเดี่ยว ไม่ยุบรวมกัน"
              >
                <input
                  type="checkbox"
                  checked={dropEmptyKey}
                  onChange={(e) => setDropEmptyKey(e.target.checked)}
                />
                ทิ้งแถวคีย์ว่าง
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
                <input
                  type="checkbox"
                  checked={addCount}
                  onChange={(e) => setAddCount(e.target.checked)}
                />
                เพิ่มคอลัมน์ &quot;จำนวนแถวรวม&quot;
              </label>
            </div>
          </div>
        )}

        {/* STEP 3: ผลลัพธ์ */}
        {state && result && !result.error && (
          <div className="rounded-xl border border-black/10 dark:border-white/10">
            <div className="flex flex-wrap items-center gap-2 border-b border-black/10 px-3 py-2 text-xs dark:border-white/10">
              <span className="rounded-full bg-indigo-100 px-3 py-1 font-medium text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300">
                {result.inputRows} แถว → <span className="tabular-nums">{result.outputRows}</span> แถว
              </span>
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                ยุบรวม {result.collapsedRows} แถว · {result.groups} กลุ่ม
              </span>
              {result.biggestGroup > 1 && (
                <span className="text-neutral-400">กลุ่มใหญ่สุด {result.biggestGroup} แถว</span>
              )}
              {result.emptyKeyRows > 0 && (
                <span className="text-neutral-400">
                  คีย์ว่าง {result.emptyKeyRows}
                  {dropEmptyKey ? " (ทิ้ง)" : " (คงเดี่ยว)"}
                </span>
              )}
              {result.droppedBlank > 0 && (
                <span className="text-neutral-400">ตัดแถวว่าง {result.droppedBlank}</span>
              )}
              <div className="ml-auto flex gap-2">
                <button
                  onClick={dlCsv}
                  className="rounded-md border border-emerald-600 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                >
                  ↓ CSV
                </button>
                <button
                  onClick={dlXlsx}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700"
                >
                  ↓ Excel
                </button>
              </div>
            </div>

            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-neutral-50 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
                  <tr>
                    <th className="border-b border-r border-black/10 px-2 py-1.5 text-right text-neutral-400 dark:border-white/10">
                      #
                    </th>
                    {result.header.map((h, i) => {
                      const isSum = sumCols.includes(i);
                      const isKey = keyCols.includes(i);
                      return (
                        <th
                          key={i}
                          className={`border-b border-black/10 px-2 py-1.5 text-left whitespace-nowrap dark:border-white/10 ${
                            isSum
                              ? "text-emerald-700 dark:text-emerald-400"
                              : isKey
                                ? "text-sky-700 dark:text-sky-400"
                                : ""
                          }`}
                        >
                          {headerText(h) || columnLetter(i)}
                          {isSum ? " Σ" : isKey ? " 🔑" : ""}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {shownRows.map((r, ri) => (
                    <tr key={ri} className="border-t border-black/5 dark:border-white/5">
                      <td className="border-r border-black/10 px-2 py-1 text-right text-neutral-400 dark:border-white/10">
                        {ri + 1}
                      </td>
                      {result.header.map((_h, ci) => {
                        const isSum = sumCols.includes(ci);
                        const v = ci < r.length ? r[ci] : null;
                        return (
                          <td
                            key={ci}
                            className={`px-2 py-1 whitespace-nowrap ${
                              isSum ? "text-right tabular-nums font-medium text-emerald-700 dark:text-emerald-400" : ""
                            }`}
                          >
                            {v === null || v === undefined ? "" : String(v)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result.outputRows > PREVIEW_ROWS && (
              <div className="border-t border-black/10 px-3 py-1.5 text-[11px] text-amber-600 dark:border-white/10 dark:text-amber-400">
                แสดง {PREVIEW_ROWS} แถวแรก (ดาวน์โหลดได้ครบ {result.outputRows} แถว)
              </div>
            )}
          </div>
        )}

        {state && result?.error && (
          <p className="rounded-md border border-amber-500/30 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
            {result.error}
          </p>
        )}

        {state && keyCols.length === 0 && (
          <p className="rounded-md border border-black/10 px-4 py-3 text-sm text-neutral-500 dark:border-white/10">
            เลือกคอลัมน์ key อย่างน้อย 1 คอลัมน์ (ยุบแถวที่ค่าเหมือนกัน)
          </p>
        )}
      </section>
    </main>
  );
}

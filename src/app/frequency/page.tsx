"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { columnOptionLabel, columnLetter } from "@/lib/reconcile/columns";
import { downloadText } from "@/lib/reconcile/export";
import { changeExt } from "@/lib/convertfile/convertfile";
import {
  computeFrequency,
  frequencyToCsv,
  FREQ_SORTS,
  FREQ_SORT_LABEL,
  type FreqSort,
} from "@/lib/frequency/frequency";
import FileDropzone from "@/components/FileDropzone";
import type { Cell, ParsedFile, Row, SideSelection } from "@/lib/reconcile/types";

const PREVIEW_ROWS = 500;

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

// เดาคอลัมน์เริ่มต้น: ชื่อหัวเข้าข่ายหมวดหมู่ก่อน (container/forwarder/status); ไม่งั้นคอลัมน์ที่ค่าซ้ำเยอะสุด
function guessColumn(header: Row, rows: Row[]): number {
  const width = header.length;
  if (width === 0) return -1;
  const NAME_HINT = /container|ตู้|forwarder|fwd|เจ้า|status|สถานะ|type|ประเภท|เดือน|month|ปลายทาง|destination/i;
  for (let c = 0; c < width; c++) {
    if (NAME_HINT.test(headerText(header[c]))) return c;
  }
  const sample = rows.slice(0, 200);
  let best = 0;
  let bestRatio = Infinity;
  for (let c = 0; c < width; c++) {
    const seen = new Set<string>();
    let filled = 0;
    for (const r of sample) {
      const v = c < r.length ? (r[c] ?? null) : null;
      if (v === null || (typeof v === "string" && v.trim() === "")) continue;
      filled++;
      seen.add(String(v).trim());
    }
    if (filled === 0) continue;
    const ratio = seen.size / filled; // ต่ำ = ซ้ำเยอะ (categorical)
    if (ratio < bestRatio) {
      bestRatio = ratio;
      best = c;
    }
  }
  return best;
}

export default function FrequencyPage() {
  const [state, setState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [col, setCol] = useState(-1);
  const [sort, setSort] = useState<FreqSort>("count-desc");
  const [trim, setTrim] = useState(true);
  const [caseInsensitive, setCaseInsensitive] = useState(false);
  const [ignoreBlank, setIgnoreBlank] = useState(false);

  const header = useMemo(() => headerRowOf(state), [state]);
  const data = useMemo(() => dataRowsOf(state), [state]);

  const result = useMemo(
    () => (state && col >= 0 ? computeFrequency(header, data, col, { sort, trim, caseInsensitive, ignoreBlank }) : null),
    [state, header, data, col, sort, trim, caseInsensitive, ignoreBlank],
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
      setCol(guessColumn(rows[sel.headerRow] ?? [], rows.slice(sel.dataStart)));
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
      setCol(guessColumn(rows[next.sel.headerRow] ?? [], rows.slice(next.sel.dataStart)));
      return next;
    });
  }, []);

  const dlCsv = () => {
    if (!state || !result || result.error) return;
    const name = headerText(header[col]) || `คอลัมน์ ${col + 1}`;
    downloadText(changeExt(state.file.fileName, "csv", "-ความถี่"), frequencyToCsv(result, name), "text/csv");
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];
  const maxCount = result && result.items.length > 0 ? result.items[0].count : 0;
  const shownItems = result ? result.items.slice(0, PREVIEW_ROWS) : [];
  // barMax = ค่าจำนวนสูงสุด เพื่อสเกลแท่ง (ไม่ขึ้นกับ sort — หา max จริง)
  const barMax = result ? result.items.reduce((m, i) => Math.max(m, i.count), 0) : 0;

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">นับความถี่ค่า (Value Frequency) 🔢</h1>
          <p className="text-xs text-neutral-500">
            เลือก 1 คอลัมน์ → รู้ทันทีว่าค่าไหนโผล่กี่ครั้ง + สัดส่วน % + % สะสม (Pareto) · เช่น มีกี่รายการต่อ forwarder / ต่อเลขตู้ / ต่อสถานะ · อ่านอย่างเดียว ไม่แก้ข้อมูล
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
            <h2 className="text-sm font-semibold">ไฟล์ที่จะนับความถี่</h2>
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

        {/* STEP 2: เลือกคอลัมน์ + ตัวเลือก */}
        {state && (
          <div className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
            <div>
              <h2 className="mb-1 text-sm font-semibold">คอลัมน์ที่จะนับความถี่</h2>
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
                เรียงตาม:
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as FreqSort)}
                  className="rounded border border-black/15 bg-transparent px-1.5 py-1 dark:border-white/15 dark:bg-neutral-900"
                >
                  {FREQ_SORTS.map((s) => (
                    <option key={s} value={s}>
                      {FREQ_SORT_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-neutral-600 dark:text-neutral-400" title="จับกลุ่มค่าที่ต่างแค่ช่องว่างหน้า-หลังให้เป็นค่าเดียวกัน">
                <input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} />
                ตัดช่องว่างหน้า-หลัง
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-neutral-600 dark:text-neutral-400" title="จับ A กับ a เป็นค่าเดียวกัน">
                <input type="checkbox" checked={caseInsensitive} onChange={(e) => setCaseInsensitive(e.target.checked)} />
                ไม่สนพิมพ์เล็ก/ใหญ่
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-neutral-600 dark:text-neutral-400" title="ไม่นับช่องว่างเป็นกลุ่ม (ว่าง)">
                <input type="checkbox" checked={ignoreBlank} onChange={(e) => setIgnoreBlank(e.target.checked)} />
                ข้ามช่องว่าง
              </label>
            </div>
          </div>
        )}

        {/* STEP 3: ผลลัพธ์ */}
        {state && result && !result.error && (
          <div className="rounded-xl border border-black/10 dark:border-white/10">
            <div className="flex flex-wrap items-center gap-2 border-b border-black/10 px-3 py-2 text-xs dark:border-white/10">
              <span className="rounded-full bg-indigo-100 px-3 py-1 font-medium text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300">
                นับ <span className="tabular-nums">{result.total}</span> ช่อง · <span className="tabular-nums">{result.distinct}</span> ค่าต่างกัน
              </span>
              {result.blankCount > 0 && (
                <span className="text-neutral-400">ช่องว่าง {result.blankCount}{ignoreBlank ? " (ข้าม)" : ""}</span>
              )}
              {maxCount > 0 && (
                <span className="text-neutral-400">มากสุด: {result.items.find((i) => i.count === maxCount)?.value} ({maxCount})</span>
              )}
              {result.distinct > PREVIEW_ROWS && (
                <span className="text-amber-600 dark:text-amber-400">แสดง {PREVIEW_ROWS} อันดับแรก</span>
              )}
              <div className="ml-auto">
                <button onClick={dlCsv} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700">
                  ↓ CSV
                </button>
              </div>
            </div>

            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-neutral-50 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
                  <tr>
                    <th className="border-b border-r border-black/10 px-2 py-1.5 text-right text-neutral-400 dark:border-white/10">#</th>
                    <th className="border-b border-black/10 px-2 py-1.5 text-left dark:border-white/10">ค่า</th>
                    <th className="border-b border-black/10 px-2 py-1.5 text-right dark:border-white/10">จำนวน</th>
                    <th className="border-b border-black/10 px-2 py-1.5 text-right dark:border-white/10">%</th>
                    <th className="border-b border-black/10 px-2 py-1.5 text-left dark:border-white/10">สัดส่วน</th>
                    <th className="border-b border-black/10 px-2 py-1.5 text-right dark:border-white/10">% สะสม</th>
                  </tr>
                </thead>
                <tbody>
                  {shownItems.map((it, ri) => (
                    <tr key={ri} className="border-t border-black/5 dark:border-white/5">
                      <td className="border-r border-black/10 px-2 py-1 text-right text-neutral-400 dark:border-white/10">{ri + 1}</td>
                      <td className={`px-2 py-1 whitespace-nowrap ${it.isBlank ? "italic text-neutral-400" : "font-medium"}`}>
                        {it.value}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums">{it.count.toLocaleString("en-US")}</td>
                      <td className="px-2 py-1 text-right tabular-nums text-neutral-500">{(Math.round(it.percent * 10) / 10).toFixed(1)}%</td>
                      <td className="px-2 py-1">
                        <div className="h-3 w-32 overflow-hidden rounded bg-black/5 dark:bg-white/10">
                          <div
                            className="h-full rounded bg-indigo-500/70"
                            style={{ width: `${barMax > 0 ? (it.count / barMax) * 100 : 0}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums text-neutral-500">{(Math.round(it.cumulativePercent * 10) / 10).toFixed(1)}%</td>
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

        {state && col < 0 && (
          <p className="rounded-md border border-black/10 px-4 py-3 text-sm text-neutral-500 dark:border-white/10">
            เลือกคอลัมน์ที่จะนับความถี่
          </p>
        )}
      </section>
    </main>
  );
}

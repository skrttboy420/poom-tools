"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { columnOptionLabel, columnLetter } from "@/lib/reconcile/columns";
import { downloadText } from "@/lib/reconcile/export";
import { changeExt } from "@/lib/convertfile/convertfile";
import {
  pivotTable,
  pivotToCsv,
  aggNeedsValue,
  PIVOT_AGGS,
  PIVOT_AGG_LABEL,
  type PivotAgg,
} from "@/lib/pivot/pivot";
import FileDropzone from "@/components/FileDropzone";
import type { ParsedFile, Row, SideSelection } from "@/lib/reconcile/types";

const PREVIEW_ROWS = 300;
const MAX_COLS = 50; // จำกัดคอลัมน์ที่แสดง (ตารางไขว้ที่คอลัมน์เยอะเกินอ่านยาก)

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

function fmtCell(v: number | string | null): string {
  if (v === null) return "";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "";
    return (Math.round(v * 1e6) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 6 });
  }
  return v;
}

export default function PivotPage() {
  const [state, setState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rowField, setRowField] = useState(-1);
  const [colField, setColField] = useState(-1);
  const [valueCol, setValueCol] = useState(-1);
  const [agg, setAgg] = useState<PivotAgg>("sum");
  const [ignoreEmptyKey, setIgnoreEmptyKey] = useState(true);

  const header = useMemo(() => headerRowOf(state), [state]);
  const data = useMemo(() => dataRowsOf(state), [state]);
  const headerStr = useMemo(() => header.map((h) => (h === null ? "" : String(h))), [header]);

  const needsValue = aggNeedsValue(agg);
  const ready =
    rowField >= 0 &&
    rowField < header.length &&
    colField >= 0 &&
    colField < header.length &&
    (!needsValue || (valueCol >= 0 && valueCol < header.length));

  const result = useMemo(
    () =>
      ready
        ? pivotTable(headerStr, data, rowField, colField, needsValue ? valueCol : -1, agg, {
            ignoreEmptyKey,
          })
        : null,
    [ready, headerStr, data, rowField, colField, valueCol, agg, needsValue, ignoreEmptyKey],
  );

  // เดาเริ่มต้น: แถว = container/ตู้ · คอลัมน์ = forwarder/ฝาก · ค่า = kg/น้ำหนัก
  const autoGuess = useCallback((hdr: Row) => {
    const names = hdr.map((h) => (h === null ? "" : String(h)).toLowerCase());
    const findBy = (kw: string[], exclude = -1) =>
      names.findIndex((n, i) => i !== exclude && kw.some((k) => n.includes(k)));
    const rIdx = findBy(["container", "ตู้", "cont"]);
    const cIdx = findBy(["forwarder", "fwd", "ฝาก", "ตัวแทน", "agent", "shipper"], rIdx);
    const vIdx = findBy(["kg", "น้ำหนัก", "weight", "gw", "nw", "cbm", "คิว"]);
    const rf = rIdx >= 0 ? rIdx : hdr.length > 0 ? 0 : -1;
    const cf = cIdx >= 0 ? cIdx : hdr.length > 1 ? (rf === 1 ? 0 : 1) : -1;
    setRowField(rf);
    setColField(cf);
    setValueCol(vIdx >= 0 ? vIdx : hdr.length > 2 ? hdr.length - 1 : -1);
    setAgg("sum");
  }, []);

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setError(null);
      setBusy(true);
      try {
        const parsed = await parseFile(file);
        const sel = makeSelection(parsed, 0);
        setState({ file: parsed, sel });
        autoGuess(parsed.sheets[sel.sheetIndex]?.rows[sel.headerRow] ?? []);
      } catch (e) {
        setError(`อ่านไฟล์ ${file.name} ไม่สำเร็จ: ${(e as Error).message}`);
      } finally {
        setBusy(false);
      }
    },
    [autoGuess],
  );

  const updateSel = useCallback(
    (patch: Partial<SideSelection>) => {
      setState((cur) => {
        if (!cur) return cur;
        const next = { ...cur, sel: { ...cur.sel, ...patch } };
        autoGuess(next.file.sheets[next.sel.sheetIndex]?.rows[next.sel.headerRow] ?? []);
        return next;
      });
    },
    [autoGuess],
  );

  const dlCsv = () => {
    if (!state || !result) return;
    downloadText(changeExt(state.file.fileName, "csv", "-ตารางไขว้"), pivotToCsv(result), "text/csv");
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];
  const shownCols = result ? result.colKeys.slice(0, MAX_COLS) : [];
  const colsTrimmed = result ? result.colKeys.length - shownCols.length : 0;
  const shownRowKeys = result ? result.rowKeys.slice(0, PREVIEW_ROWS) : [];

  // dropdown เลือกคอลัมน์ (ใช้ซ้ำ)
  const colSelect = (value: number, onChange: (n: number) => void, allowNone = false) => (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="rounded border border-black/15 bg-transparent px-2 py-1.5 text-sm dark:border-white/15 dark:bg-neutral-900"
    >
      {allowNone && <option value={-1}>— ไม่เลือก —</option>}
      {header.map((h, i) => (
        <option key={i} value={i} title={columnOptionLabel(h, i)}>
          {columnLetter(i)} · {h === null || String(h).trim() === "" ? "(ว่าง)" : String(h)}
        </option>
      ))}
    </select>
  );

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">ตารางสรุปไขว้ (Pivot) 🔲</h1>
          <p className="text-xs text-neutral-500">
            สรุป 2 มิติในตารางเดียว — เช่น แถว = เลขตู้, คอลัมน์ = forwarder, ช่อง = รวมน้ำหนัก · มียอดรวมต่อแถว/ต่อคอลัมน์/รวมทั้งหมด
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
            <h2 className="text-sm font-semibold">ไฟล์ที่จะสรุป</h2>
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

        {/* STEP 2: ตั้งค่า pivot */}
        {state && (
          <div className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
            <h2 className="text-sm font-semibold">ตั้งค่าตารางไขว้</h2>
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex flex-col gap-1 text-xs text-neutral-500">
                แถว (row)
                {colSelect(rowField, setRowField)}
              </label>
              <label className="flex flex-col gap-1 text-xs text-neutral-500">
                คอลัมน์ (column)
                {colSelect(colField, setColField)}
              </label>
              <label className="flex flex-col gap-1 text-xs text-neutral-500">
                สรุปด้วย
                <select
                  value={agg}
                  onChange={(e) => setAgg(e.target.value as PivotAgg)}
                  className="rounded border border-black/15 bg-transparent px-2 py-1.5 text-sm dark:border-white/15 dark:bg-neutral-900"
                >
                  {PIVOT_AGGS.map((a) => (
                    <option key={a} value={a}>
                      {PIVOT_AGG_LABEL[a]}
                    </option>
                  ))}
                </select>
              </label>
              {needsValue && (
                <label className="flex flex-col gap-1 text-xs text-neutral-500">
                  ค่า (ที่จะสรุป)
                  {colSelect(valueCol, setValueCol)}
                </label>
              )}
              <label
                className="flex cursor-pointer items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400"
                title="ข้ามแถวที่คีย์แถวหรือคอลัมน์ว่าง (กันแถว subtotal/grand-total ในไฟล์ปน)"
              >
                <input type="checkbox" checked={ignoreEmptyKey} onChange={(e) => setIgnoreEmptyKey(e.target.checked)} />
                ข้ามแถวคีย์ว่าง
              </label>
            </div>
            {agg === "count" && (
              <p className="text-xs text-neutral-400">โหมด &quot;นับแถว&quot; นับจำนวนแถวในแต่ละช่อง — ไม่ต้องใช้คอลัมน์ค่า</p>
            )}
          </div>
        )}

        {/* STEP 3: ผลลัพธ์ */}
        {state && result && !result.error && (
          <div className="rounded-xl border border-black/10 dark:border-white/10">
            <div className="flex flex-wrap items-center gap-2 border-b border-black/10 px-3 py-2 text-xs dark:border-white/10">
              <span className="rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                <span className="tabular-nums">{result.rowKeys.length}</span> แถว ×{" "}
                <span className="tabular-nums">{result.colKeys.length}</span> คอลัมน์ · จาก {result.countedRows} แถว
              </span>
              {result.emptyKeyRows > 0 && (
                <span className="text-neutral-400">
                  {ignoreEmptyKey ? `ข้ามแถวคีย์ว่าง ${result.emptyKeyRows}` : `มีคีย์ว่าง ${result.emptyKeyRows} แถว`}
                </span>
              )}
              {colsTrimmed > 0 && <span className="text-amber-600 dark:text-amber-400">แสดง {MAX_COLS} คอลัมน์แรก (ซ่อน {colsTrimmed})</span>}
              <button
                onClick={dlCsv}
                className="ml-auto rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700"
              >
                ↓ ดาวน์โหลดตาราง (CSV)
              </button>
            </div>

            <div className="max-h-[60vh] overflow-auto">
              <table className="text-xs">
                <thead className="sticky top-0 z-10 bg-neutral-50 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
                  <tr>
                    <th className="sticky left-0 z-20 border-r border-b border-black/10 bg-neutral-50 px-2 py-1.5 text-left whitespace-nowrap dark:border-white/10 dark:bg-neutral-900">
                      {result.rowHeader} \ {result.colHeader}
                    </th>
                    {shownCols.map((c, i) => (
                      <th key={i} className="border-b border-black/10 px-2 py-1.5 text-right whitespace-nowrap dark:border-white/10">
                        {c}
                      </th>
                    ))}
                    <th className="border-b border-l-2 border-black/10 border-l-emerald-500/40 bg-emerald-50 px-2 py-1.5 text-right font-semibold whitespace-nowrap dark:border-white/10 dark:bg-emerald-950/30">
                      รวม
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shownRowKeys.map((rk, ri) => (
                    <tr key={ri} className="border-t border-black/5 dark:border-white/5">
                      <td className="sticky left-0 z-10 border-r border-black/10 bg-white px-2 py-1 font-medium whitespace-nowrap dark:border-white/10 dark:bg-neutral-950">
                        {rk}
                      </td>
                      {shownCols.map((_, ci) => (
                        <td key={ci} className="px-2 py-1 text-right tabular-nums">
                          {fmtCell(result.cells[ri][ci])}
                        </td>
                      ))}
                      <td className="border-l-2 border-l-emerald-500/40 bg-emerald-50/60 px-2 py-1 text-right font-medium tabular-nums dark:bg-emerald-950/20">
                        {fmtCell(result.rowTotals[ri])}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 bg-emerald-50 font-medium dark:bg-emerald-950/40">
                  <tr className="border-t-2 border-emerald-500/40">
                    <td className="sticky left-0 z-10 bg-emerald-50 px-2 py-1.5 whitespace-nowrap dark:bg-emerald-950/40">รวม</td>
                    {shownCols.map((_, ci) => (
                      <td key={ci} className="px-2 py-1.5 text-right tabular-nums">
                        {fmtCell(result.colTotals[ci])}
                      </td>
                    ))}
                    <td className="border-l-2 border-l-emerald-500/40 px-2 py-1.5 text-right tabular-nums">
                      {fmtCell(result.grandTotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {state && result?.error && (
          <p className="rounded-md border border-amber-500/30 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
            {result.error}
          </p>
        )}

        {state && !ready && !result && (
          <p className="rounded-md border border-black/10 px-4 py-3 text-sm text-neutral-500 dark:border-white/10">
            เลือกคอลัมน์ &quot;แถว&quot; และ &quot;คอลัมน์&quot;{needsValue ? " และ \"ค่า\"" : ""} เพื่อสร้างตารางไขว้
          </p>
        )}
      </section>
    </main>
  );
}

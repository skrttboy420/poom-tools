"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { columnOptionLabel, columnLetter } from "@/lib/reconcile/columns";
import { downloadText } from "@/lib/reconcile/export";
import { changeExt } from "@/lib/convertfile/convertfile";
import { groupBy, groupToCsv, AGG_FNS, AGG_LABEL, type AggFn, type AggSpec } from "@/lib/group/group";
import FileDropzone from "@/components/FileDropzone";
import type { ParsedFile, Row, SideSelection } from "@/lib/reconcile/types";

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

let uid = 0;
type Agg = AggSpec & { id: number };
const newAgg = (col: number, fn: AggFn = "sum"): Agg => ({ id: ++uid, col, fn });

function fmtCell(v: number | string | null): string {
  if (v === null) return "—";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "—";
    return (Math.round(v * 1e6) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 6 });
  }
  return v;
}

export default function GroupPage() {
  const [state, setState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [groupCols, setGroupCols] = useState<number[]>([]);
  const [aggs, setAggs] = useState<Agg[]>([]);
  const [ignoreEmptyKey, setIgnoreEmptyKey] = useState(true);

  const header = useMemo(() => headerRowOf(state), [state]);
  const data = useMemo(() => dataRowsOf(state), [state]);
  const headerStr = useMemo(() => header.map((h) => (h === null ? "" : String(h))), [header]);

  const validGroupCols = useMemo(() => groupCols.filter((c) => c >= 0 && c < header.length), [groupCols, header]);
  const ready = validGroupCols.length > 0 && aggs.length > 0;

  const result = useMemo(
    () => (ready ? groupBy(headerStr, data, validGroupCols, aggs, { ignoreEmptyKey }) : null),
    [ready, headerStr, data, validGroupCols, aggs, ignoreEmptyKey],
  );

  // เดา group col + aggs เริ่มต้น: หา container/ตู้ เป็นคีย์ + คอลัมน์ตัวเลขเป็น sum
  const autoGuess = useCallback((hdr: Row) => {
    const names = hdr.map((h) => (h === null ? "" : String(h)).toLowerCase());
    const findBy = (kw: string[]) => names.findIndex((n) => kw.some((k) => n.includes(k)));
    const keyIdx = findBy(["container", "ตู้", "cont"]);
    setGroupCols(keyIdx >= 0 ? [keyIdx] : hdr.length > 0 ? [0] : []);
    const numGuess: Agg[] = [];
    const kgIdx = findBy(["kg", "น้ำหนัก", "weight", "gw", "nw"]);
    const cbmIdx = findBy(["cbm", "คิว", "ปริมาตร", "volume", "m3"]);
    if (kgIdx >= 0) numGuess.push(newAgg(kgIdx, "sum"));
    if (cbmIdx >= 0) numGuess.push(newAgg(cbmIdx, "sum"));
    if (numGuess.length === 0 && hdr.length > 1) numGuess.push(newAgg(hdr.length - 1, "sum"));
    setAggs(numGuess);
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

  const toggleGroupCol = (i: number) =>
    setGroupCols((cur) => (cur.includes(i) ? cur.filter((c) => c !== i) : [...cur, i]));

  const patchAgg = (id: number, patch: Partial<Agg>) =>
    setAggs((cur) => cur.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const removeAgg = (id: number) => setAggs((cur) => cur.filter((a) => a.id !== id));

  const dlCsv = () => {
    if (!state || !result) return;
    downloadText(changeExt(state.file.fileName, "csv", "-สรุปกลุ่ม"), groupToCsv(result), "text/csv");
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];
  const shownRows = result ? result.rows.slice(0, PREVIEW_ROWS) : [];

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">สรุปยอดแบบจัดกลุ่ม 🧮</h1>
          <p className="text-xs text-neutral-500">
            จัดกลุ่มแถวตามคอลัมน์ (เช่น เลขตู้) แล้วสรุปยอด — รวม/เฉลี่ย/นับ ของน้ำหนัก/CBM/กล่อง ต่อกลุ่ม + แถวรวมทั้งหมด
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

        {/* STEP 2: ตั้งค่ากลุ่ม + สรุป */}
        {state && (
          <div className="space-y-4 rounded-xl border border-black/10 p-4 dark:border-white/10">
            <div>
              <h2 className="mb-2 text-sm font-semibold">จัดกลุ่มตามคอลัมน์ (เลือกได้หลายชั้น)</h2>
              <div className="flex flex-wrap gap-1.5">
                {header.map((h, i) => {
                  const on = groupCols.includes(i);
                  return (
                    <button
                      key={i}
                      onClick={() => toggleGroupCol(i)}
                      title={columnOptionLabel(h, i)}
                      className={`rounded-full border px-2.5 py-1 text-xs transition ${
                        on
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-black/15 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                      }`}
                    >
                      {columnLetter(i)} · {h === null || String(h).trim() === "" ? "(ว่าง)" : String(h)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold">สรุปยอด ({aggs.length})</h2>
              </div>
              <div className="space-y-2">
                {aggs.map((a) => (
                  <div key={a.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <select
                      value={a.fn}
                      onChange={(e) => patchAgg(a.id, { fn: e.target.value as AggFn })}
                      className="rounded border border-black/15 bg-transparent px-2 py-1.5 dark:border-white/15 dark:bg-neutral-900"
                    >
                      {AGG_FNS.map((fn) => (
                        <option key={fn} value={fn}>
                          {AGG_LABEL[fn]}
                        </option>
                      ))}
                    </select>
                    <span className="text-neutral-400">ของ</span>
                    <select
                      value={a.col}
                      onChange={(e) => patchAgg(a.id, { col: Number(e.target.value) })}
                      className="rounded border border-black/15 bg-transparent px-2 py-1.5 dark:border-white/15 dark:bg-neutral-900"
                    >
                      {header.map((h, i) => (
                        <option key={i} value={i} title={columnOptionLabel(h, i)}>
                          {columnLetter(i)} · {h === null || String(h).trim() === "" ? "(ว่าง)" : String(h)}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => removeAgg(a.id)}
                      className="rounded border border-black/15 px-2 py-1 text-xs text-neutral-500 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                    >
                      ลบ
                    </button>
                  </div>
                ))}
                {aggs.length === 0 && (
                  <p className="py-1 text-center text-xs text-neutral-400">ยังไม่มีการสรุป — กด &quot;เพิ่มการสรุป&quot;</p>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setAggs((cur) => [...cur, newAgg(header.length > 0 ? 0 : 0, "sum")])}
                  className="rounded-md border border-dashed border-black/25 px-3 py-1.5 text-xs text-neutral-500 hover:bg-black/5 dark:border-white/25 dark:hover:bg-white/5"
                >
                  + เพิ่มการสรุป
                </button>
                <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400" title="ข้ามแถวที่คีย์ว่างทั้งหมด (กันแถว subtotal/grand-total ในไฟล์ปน)">
                  <input type="checkbox" checked={ignoreEmptyKey} onChange={(e) => setIgnoreEmptyKey(e.target.checked)} />
                  ข้ามแถวคีย์ว่าง
                </label>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: ผลลัพธ์ */}
        {state && result && (
          <div className="rounded-xl border border-black/10 dark:border-white/10">
            <div className="flex flex-wrap items-center gap-2 border-b border-black/10 px-3 py-2 text-xs dark:border-white/10">
              <span className="rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                <span className="tabular-nums">{result.groups}</span> กลุ่ม · จาก {result.countedRows} แถว
              </span>
              {result.emptyKeyRows > 0 && (
                <span className="text-neutral-400">
                  {ignoreEmptyKey ? `ข้ามแถวคีย์ว่าง ${result.emptyKeyRows}` : `มีคีย์ว่าง ${result.emptyKeyRows} แถว`}
                </span>
              )}
              <button
                onClick={dlCsv}
                className="ml-auto rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700"
              >
                ↓ ดาวน์โหลดสรุป (CSV)
              </button>
            </div>

            <div className="max-h-[55vh] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-900">
                  <tr>
                    {result.keyHeaders.map((h, i) => (
                      <th key={`k${i}`} className="px-2 py-1.5 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                    <th className="px-2 py-1.5 text-right whitespace-nowrap">จำนวนแถว</th>
                    {result.aggHeaders.map((h, i) => (
                      <th key={`a${i}`} className="px-2 py-1.5 text-right whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shownRows.map((r, ri) => (
                    <tr key={ri} className="border-t border-black/5 dark:border-white/5">
                      {r.keys.map((k, ci) => (
                        <td key={`k${ci}`} className="max-w-[220px] truncate whitespace-nowrap px-2 py-1 font-medium">
                          {k}
                        </td>
                      ))}
                      <td className="px-2 py-1 text-right tabular-nums text-neutral-500">{r.count}</td>
                      {r.values.map((v, ci) => (
                        <td key={`v${ci}`} className="px-2 py-1 text-right tabular-nums">
                          {fmtCell(v)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 bg-emerald-50 font-medium dark:bg-emerald-950/40">
                  <tr className="border-t-2 border-emerald-500/40">
                    <td className="px-2 py-1.5" colSpan={result.keyHeaders.length}>
                      รวมทั้งหมด
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{result.total.count}</td>
                    {result.total.values.map((v, ci) => (
                      <td key={`t${ci}`} className="px-2 py-1.5 text-right tabular-nums">
                        {fmtCell(v)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {state && !ready && (
          <p className="rounded-md border border-black/10 px-4 py-3 text-sm text-neutral-500 dark:border-white/10">
            เลือกคอลัมน์ที่จะจัดกลุ่ม และเพิ่มการสรุปอย่างน้อย 1 รายการ
          </p>
        )}
      </section>
    </main>
  );
}

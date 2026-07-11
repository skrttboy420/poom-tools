"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { columnOptionLabel, columnLetter } from "@/lib/reconcile/columns";
import { downloadText, downloadBlob } from "@/lib/reconcile/export";
import { rowsToCsv, rowsToXlsx, changeExt } from "@/lib/convertfile/convertfile";
import { analyzeSubtotal } from "@/lib/subtotal/subtotal";
import FileDropzone from "@/components/FileDropzone";
import type { ParsedFile, Row, SideSelection, Cell } from "@/lib/reconcile/types";

const PREVIEW_ROWS = 400;
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

function fmtCell(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "";
    return (Math.round(v * 1e6) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 6 });
  }
  return String(v);
}

export default function SubtotalPage() {
  const [state, setState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [groupCols, setGroupCols] = useState<number[]>([]);
  const [sumCols, setSumCols] = useState<number[]>([]);
  const [regroup, setRegroup] = useState(true);
  const [grandTotal, setGrandTotal] = useState(true);
  const [doRound, setDoRound] = useState(false);
  const [roundDigits, setRoundDigits] = useState(2);

  const header = useMemo(() => headerRowOf(state), [state]);
  const data = useMemo(() => dataRowsOf(state), [state]);
  const headerStr = useMemo(() => header.map((h) => (h === null ? "" : String(h))), [header]);

  const validGroupCols = useMemo(() => groupCols.filter((c) => c >= 0 && c < header.length), [groupCols, header]);
  const validSumCols = useMemo(() => sumCols.filter((c) => c >= 0 && c < header.length), [sumCols, header]);
  const ready = validGroupCols.length > 0 && validSumCols.length > 0;

  const result = useMemo(
    () =>
      ready
        ? analyzeSubtotal(headerStr, data, {
            groupCols: validGroupCols,
            sumCols: validSumCols,
            regroup,
            grandTotal,
            round: doRound ? roundDigits : null,
          })
        : null,
    [ready, headerStr, data, validGroupCols, validSumCols, regroup, grandTotal, doRound, roundDigits],
  );

  const subtotalSet = useMemo(() => new Set(result?.subtotalRowIndexes ?? []), [result]);

  // เดา group col + sum col เริ่มต้น: หา container/ตู้ เป็นคีย์ + คอลัมน์ตัวเลข (kg/cbm/กล่อง) เป็นยอด
  const autoGuess = useCallback((hdr: Row) => {
    const names = hdr.map((h) => (h === null ? "" : String(h)).toLowerCase());
    const findBy = (kw: string[]) => names.findIndex((n) => kw.some((k) => n.includes(k)));
    const keyIdx = findBy(["container", "ตู้", "cont", "forwarder", "ผู้ส่ง"]);
    setGroupCols(keyIdx >= 0 ? [keyIdx] : hdr.length > 0 ? [0] : []);
    const nums: number[] = [];
    const kgIdx = findBy(["kg", "น้ำหนัก", "weight", "gw", "nw"]);
    const cbmIdx = findBy(["cbm", "คิว", "ปริมาตร", "volume", "m3"]);
    const boxIdx = findBy(["กล่อง", "box", "ctn", "carton", "จำนวน", "qty"]);
    for (const idx of [kgIdx, cbmIdx, boxIdx]) if (idx >= 0 && !nums.includes(idx)) nums.push(idx);
    if (nums.length === 0 && hdr.length > 1) nums.push(hdr.length - 1);
    setSumCols(nums);
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
  const toggleSumCol = (i: number) =>
    setSumCols((cur) => (cur.includes(i) ? cur.filter((c) => c !== i) : [...cur, i]));

  const dlCsv = () => {
    if (!state || !result || result.error) return;
    downloadText(
      changeExt(state.file.fileName, "csv", "-ยอดย่อย"),
      rowsToCsv([result.header, ...result.rows]),
      "text/csv",
    );
  };
  const dlXlsx = () => {
    if (!state || !result || result.error) return;
    downloadBlob(changeExt(state.file.fileName, "xlsx", "-ยอดย่อย"), rowsToXlsx([result.header, ...result.rows]), XLSX_MIME);
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];
  const shownRows = result ? result.rows.slice(0, PREVIEW_ROWS) : [];

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">แทรกแถวยอดย่อย 📑</h1>
          <p className="text-xs text-neutral-500">
            เก็บทุกแถวรายละเอียดครบ แล้ว &quot;แทรก&quot; แถวยอดรวมต่อกลุ่ม (เช่น รวม kg/CBM/กล่อง ต่อตู้) + แถวรวมทั้งหมดท้ายสุด — พร้อมปริ้นต์
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
            <h2 className="text-sm font-semibold">ไฟล์ที่จะแทรกยอดย่อย</h2>
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

        {/* STEP 2: ตั้งค่ากลุ่ม + คอลัมน์ยอด */}
        {state && (
          <div className="space-y-4 rounded-xl border border-black/10 p-4 dark:border-white/10">
            <div>
              <h2 className="mb-2 text-sm font-semibold">จัดกลุ่มตามคอลัมน์ (แทรกยอดย่อยคั่นแต่ละกลุ่ม)</h2>
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
                          ? "border-sky-600 bg-sky-600 text-white"
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
              <h2 className="mb-2 text-sm font-semibold">คอลัมน์ตัวเลขที่จะรวมยอด (Σ)</h2>
              <div className="flex flex-wrap gap-1.5">
                {header.map((h, i) => {
                  const on = sumCols.includes(i);
                  return (
                    <button
                      key={i}
                      onClick={() => toggleSumCol(i)}
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

            <div className="flex flex-wrap items-center gap-4 border-t border-black/5 pt-3 text-xs dark:border-white/5">
              <label
                className="flex cursor-pointer items-center gap-1.5 text-neutral-600 dark:text-neutral-400"
                title="จัดแถวกลุ่มเดียวกันให้ติดกันก่อน (เสถียร) · ปิด = ตัดกลุ่มเมื่อคีย์ 'ติดกัน' เปลี่ยน (แบบ Excel ที่ต้อง sort ก่อน)"
              >
                <input type="checkbox" checked={regroup} onChange={(e) => setRegroup(e.target.checked)} />
                จัดแถวกลุ่มเดียวกันให้ติดกัน
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-neutral-600 dark:text-neutral-400" title="เพิ่มแถวรวมทั้งหมดท้ายสุด">
                <input type="checkbox" checked={grandTotal} onChange={(e) => setGrandTotal(e.target.checked)} />
                แถวรวมทั้งหมดท้ายสุด
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-neutral-600 dark:text-neutral-400" title="ปัดยอดรวมให้เป็นทศนิยมคงที่">
                <input type="checkbox" checked={doRound} onChange={(e) => setDoRound(e.target.checked)} />
                ปัดทศนิยม
              </label>
              {doRound && (
                <label className="flex items-center gap-1 text-neutral-600 dark:text-neutral-400">
                  ตำแหน่ง:
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={roundDigits}
                    onChange={(e) => setRoundDigits(Math.min(10, Math.max(0, Number(e.target.value) || 0)))}
                    className="w-14 rounded border border-black/15 bg-transparent px-1 py-0.5 dark:border-white/15"
                  />
                </label>
              )}
            </div>
          </div>
        )}

        {/* STEP 3: ผลลัพธ์ */}
        {state && result && !result.error && (
          <div className="rounded-xl border border-black/10 dark:border-white/10">
            <div className="flex flex-wrap items-center gap-2 border-b border-black/10 px-3 py-2 text-xs dark:border-white/10">
              <span className="rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                <span className="tabular-nums">{result.groups}</span> กลุ่ม · {result.dataRows} แถวรายละเอียด
              </span>
              <span className="text-neutral-400">
                แทรกแถวยอดย่อย {result.subtotalRowIndexes.length}
                {result.grandTotalIndex >= 0 ? " + แถวรวมท้าย 1" : ""}
              </span>
              {result.emptyKeyGroups > 0 && <span className="text-neutral-400">กลุ่มคีย์ว่าง {result.emptyKeyGroups}</span>}
              {result.droppedBlankRows > 0 && <span className="text-neutral-400">ตัดแถวว่าง {result.droppedBlankRows}</span>}
              <div className="ml-auto flex gap-2">
                <button
                  onClick={dlCsv}
                  className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium transition hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
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

            <div className="max-h-[55vh] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-900">
                  <tr>
                    <th className="px-2 py-1.5 text-right whitespace-nowrap">#</th>
                    {result.header.map((h, i) => (
                      <th key={i} className="px-2 py-1.5 whitespace-nowrap">
                        {fmtCell(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shownRows.map((r, ri) => {
                    const isSub = subtotalSet.has(ri);
                    const isGrand = ri === result.grandTotalIndex;
                    const rowClass = isGrand
                      ? "bg-emerald-100 font-semibold dark:bg-emerald-950/50"
                      : isSub
                        ? "bg-sky-50 font-medium dark:bg-sky-950/40"
                        : "border-t border-black/5 dark:border-white/5";
                    return (
                      <tr key={ri} className={rowClass}>
                        <td className="px-2 py-1 text-right text-neutral-400 tabular-nums">{ri + 1}</td>
                        {result.header.map((_, ci) => (
                          <td key={ci} className="max-w-[220px] truncate whitespace-nowrap px-2 py-1 tabular-nums">
                            {fmtCell(r[ci] ?? null)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {result.rows.length > PREVIEW_ROWS && (
              <p className="border-t border-black/10 px-3 py-1.5 text-center text-[11px] text-neutral-400 dark:border-white/10">
                แสดง {PREVIEW_ROWS} จาก {result.rows.length} แถว — ดาวน์โหลดเพื่อดูครบ
              </p>
            )}
          </div>
        )}

        {state && result && result.error && (
          <p className="rounded-md border border-amber-500/30 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
            {result.error}
          </p>
        )}

        {state && !ready && (
          <p className="rounded-md border border-black/10 px-4 py-3 text-sm text-neutral-500 dark:border-white/10">
            เลือกคอลัมน์ที่จะจัดกลุ่มอย่างน้อย 1 คอลัมน์ และคอลัมน์ตัวเลขที่จะรวมยอดอย่างน้อย 1 คอลัมน์
          </p>
        )}
      </section>
    </main>
  );
}

"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { columnOptionLabel, columnLetter } from "@/lib/reconcile/columns";
import { downloadText, downloadBlob } from "@/lib/reconcile/export";
import { rowsToCsv, rowsToXlsx, changeExt } from "@/lib/convertfile/convertfile";
import { analyzeGroupConcat } from "@/lib/groupconcat/groupconcat";
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

// เดา group key = คอลัมน์ tracking/ตู้ · เดา value = คอลัมน์กล่อง/เลขที่ (ค่าที่อยากต่อกันต่อกลุ่ม)
function guessCols(header: Row, rows: Row[]): { group: number[]; value: number[] } {
  const width = header.length;
  if (width === 0) return { group: [], value: [] };
  const GROUP_HINT = /tracking|พัสดุ|เลขพัสดุ|awb|ref|hbl|mbl|ตู้|container|cntr|forwarder|ผู้ส่ง/i;
  const VALUE_HINT = /กล่อง|box|carton|ชิ้น|pcs|เลขที่|no\.?|item|tracking|พัสดุ|ลำดับ|seq/i;
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

  let group = -1;
  for (let c = 0; c < width; c++) {
    if (GROUP_HINT.test(headerText(header[c]))) {
      group = c;
      break;
    }
  }
  if (group < 0) {
    for (let c = 0; c < width; c++) {
      if (numericRatio(c) < 0.5) {
        group = c;
        break;
      }
    }
    if (group < 0) group = 0;
  }

  // value = คอลัมน์อื่นที่ชื่อเข้าข่าย (กล่อง/เลขที่) หรือคอลัมน์ถัดจาก group ถ้าไม่เจอ
  const value: number[] = [];
  for (let c = 0; c < width; c++) {
    if (c === group) continue;
    if (VALUE_HINT.test(headerText(header[c]))) value.push(c);
  }
  if (value.length === 0) {
    for (let c = 0; c < width; c++) {
      if (c !== group) {
        value.push(c);
        break;
      }
    }
  }
  return { group: [group], value };
}

export default function GroupConcatPage() {
  const [state, setState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [groupCols, setGroupCols] = useState<number[]>([]);
  const [valueCols, setValueCols] = useState<number[]>([]);
  const [separator, setSeparator] = useState(", ");
  const [dedupe, setDedupe] = useState(false);
  const [sortValues, setSortValues] = useState(false);
  const [skipBlank, setSkipBlank] = useState(true);
  const [trim, setTrim] = useState(true);
  const [caseInsensitive, setCaseInsensitive] = useState(false);
  const [ignoreEmptyKey, setIgnoreEmptyKey] = useState(false);
  const [addCount, setAddCount] = useState(false);
  const [sortGroups, setSortGroups] = useState(false);

  const header = useMemo(() => headerRowOf(state), [state]);
  const data = useMemo(() => dataRowsOf(state), [state]);

  const result = useMemo(
    () =>
      state && groupCols.length > 0 && valueCols.length > 0
        ? analyzeGroupConcat(header, data, {
            groupCols,
            valueCols,
            separator,
            dedupe,
            sortValues,
            skipBlank,
            trim,
            caseInsensitive,
            ignoreEmptyKey,
            addCount,
            sortGroups,
          })
        : null,
    [
      state,
      header,
      data,
      groupCols,
      valueCols,
      separator,
      dedupe,
      sortValues,
      skipBlank,
      trim,
      caseInsensitive,
      ignoreEmptyKey,
      addCount,
      sortGroups,
    ],
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
      setGroupCols(g.group);
      setValueCols(g.value);
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
      setGroupCols(g.group);
      setValueCols(g.value);
      return next;
    });
  }, []);

  const toggle = (list: number[], setList: (v: number[]) => void, i: number) =>
    setList(list.includes(i) ? list.filter((x) => x !== i) : [...list, i].sort((a, b) => a - b));

  const dlCsv = () => {
    if (!state || !result || result.error) return;
    downloadText(
      changeExt(state.file.fileName, "csv", "-ต่อค่ากลุ่ม"),
      rowsToCsv([result.header, ...result.rows]),
      "text/csv",
    );
  };
  const dlXlsx = () => {
    if (!state || !result || result.error) return;
    downloadBlob(
      changeExt(state.file.fileName, "xlsx", "-ต่อค่ากลุ่ม"),
      rowsToXlsx([result.header, ...result.rows]),
      XLSX_MIME,
    );
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];
  const shownRows = result ? result.rows.slice(0, PREVIEW_ROWS) : [];
  // คอลัมน์ผลลัพธ์ที่เป็น "ค่าที่ต่อกัน" = ท้าย ๆ (หลัง key + count) → ไฮไลต์
  const nKeyOut = result ? result.keyCols.length : 0;
  const valueOutStart = nKeyOut + (addCount ? 1 : 0);

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">รวมค่าต่อกลุ่ม (GROUP_CONCAT) 🧵</h1>
          <p className="text-xs text-neutral-500">
            ยุบหลายแถวที่ key เดียวกันเป็นแถวเดียว แล้ว<b>ต่อค่าหลายแถว</b>ในกลุ่มเป็นข้อความเดียว ·
            เช่น 1 tracking แตกหลายกล่อง → &quot;1, 2, 3&quot; · ต่อ tracking ทั้งหมดต่อตู้ ·
            ต่างจาก /rollup (รวมยอดตัวเลข) · /group (เหลือแค่ key+ยอด) · /combine-col (ต่อคอลัมน์แนวนอน)
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
                จัดกลุ่มตาม (key){" "}
                <span className="font-normal text-neutral-400">— เช่น tracking / เลขตู้</span>
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {header.map((h, i) => {
                  const on = groupCols.includes(i);
                  return (
                    <button
                      key={i}
                      onClick={() => toggle(groupCols, setGroupCols, i)}
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
                คอลัมน์ที่จะ<b>ต่อค่า</b>{" "}
                <span className="font-normal text-neutral-400">
                  — เช่น เลขกล่อง (แต่ละคอลัมน์ = 1 คอลัมน์ผลลัพธ์)
                </span>
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {header.map((h, i) => {
                  const isKey = groupCols.includes(i);
                  const on = valueCols.includes(i);
                  return (
                    <button
                      key={i}
                      onClick={() => toggle(valueCols, setValueCols, i)}
                      title={columnOptionLabel(h, i)}
                      className={`rounded-full border px-2.5 py-1 text-xs transition ${
                        on
                          ? "border-indigo-600 bg-indigo-600 text-white"
                          : isKey
                            ? "border-sky-300 text-sky-600 hover:bg-black/5 dark:border-sky-800 dark:hover:bg-white/10"
                            : "border-black/15 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                      }`}
                    >
                      {columnLetter(i)} · {headerText(h) || "(ว่าง)"}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-[11px] text-neutral-400">
                เลือกคอลัมน์ key เป็นคอลัมน์ต่อค่าได้ (จะโชว์รายการ key ทั้งหมดในกลุ่ม)
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs">
              <label className="flex items-center gap-1 text-neutral-500">
                ตัวคั่น:
                <input
                  type="text"
                  value={separator}
                  onChange={(e) => setSeparator(e.target.value)}
                  className="w-20 rounded border border-black/15 bg-transparent px-1.5 py-1 font-mono dark:border-white/15 dark:bg-neutral-900"
                  placeholder=", "
                />
                <span className="flex gap-1">
                  {[
                    { label: ", ", val: ", " },
                    { label: " / ", val: " / " },
                    { label: " | ", val: " | " },
                    { label: "↵", val: "\n" },
                  ].map((s) => (
                    <button
                      key={s.label}
                      onClick={() => setSeparator(s.val)}
                      className="rounded border border-black/15 px-1.5 py-0.5 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                    >
                      {s.label}
                    </button>
                  ))}
                </span>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs">
              <label className="flex cursor-pointer items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
                <input type="checkbox" checked={dedupe} onChange={(e) => setDedupe(e.target.checked)} />
                ตัดค่าซ้ำในกลุ่ม
              </label>
              {dedupe && (
                <label className="flex cursor-pointer items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
                  <input
                    type="checkbox"
                    checked={caseInsensitive}
                    onChange={(e) => setCaseInsensitive(e.target.checked)}
                  />
                  ตัดซ้ำไม่สนพิมพ์เล็ก/ใหญ่
                </label>
              )}
              <label className="flex cursor-pointer items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
                <input
                  type="checkbox"
                  checked={sortValues}
                  onChange={(e) => setSortValues(e.target.checked)}
                />
                เรียงค่าในกลุ่ม
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
                <input
                  type="checkbox"
                  checked={skipBlank}
                  onChange={(e) => setSkipBlank(e.target.checked)}
                />
                ข้ามค่าว่าง (กันตัวคั่นซ้อน)
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
                <input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} />
                ตัดช่องว่างหน้า-หลัง
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs">
              <label
                className="flex cursor-pointer items-center gap-1.5 text-neutral-600 dark:text-neutral-400"
                title="ถ้าเปิด: แถวคีย์ว่างจะไม่ถูกจัดกลุ่ม (กัน subtotal/grand-total ปน)"
              >
                <input
                  type="checkbox"
                  checked={ignoreEmptyKey}
                  onChange={(e) => setIgnoreEmptyKey(e.target.checked)}
                />
                ข้ามแถวคีย์ว่าง
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
                <input
                  type="checkbox"
                  checked={sortGroups}
                  onChange={(e) => setSortGroups(e.target.checked)}
                />
                เรียงกลุ่มตามคีย์
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
                <input
                  type="checkbox"
                  checked={addCount}
                  onChange={(e) => setAddCount(e.target.checked)}
                />
                เพิ่มคอลัมน์ &quot;จำนวนแถว&quot;
              </label>
            </div>
          </div>
        )}

        {/* STEP 3: ผลลัพธ์ */}
        {state && result && !result.error && (
          <div className="rounded-xl border border-black/10 dark:border-white/10">
            <div className="flex flex-wrap items-center gap-2 border-b border-black/10 px-3 py-2 text-xs dark:border-white/10">
              <span className="rounded-full bg-indigo-100 px-3 py-1 font-medium text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300">
                {result.dataRows} แถว → <span className="tabular-nums">{result.groups}</span> กลุ่ม
              </span>
              {result.biggestGroup > 1 && (
                <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                  กลุ่มใหญ่สุด {result.biggestGroup} แถว
                </span>
              )}
              {result.emptyKeyRows > 0 && (
                <span className="text-neutral-400">
                  คีย์ว่าง {result.emptyKeyRows}
                  {ignoreEmptyKey ? " (ข้าม)" : " (คงเดี่ยว)"}
                </span>
              )}
              {result.droppedBlankRows > 0 && (
                <span className="text-neutral-400">ตัดแถวว่าง {result.droppedBlankRows}</span>
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
                      const isKey = i < nKeyOut;
                      const isValue = i >= valueOutStart;
                      return (
                        <th
                          key={i}
                          className={`border-b border-black/10 px-2 py-1.5 text-left whitespace-nowrap dark:border-white/10 ${
                            isValue
                              ? "text-indigo-700 dark:text-indigo-400"
                              : isKey
                                ? "text-sky-700 dark:text-sky-400"
                                : ""
                          }`}
                        >
                          {headerText(h) || columnLetter(i)}
                          {isValue ? " 🧵" : isKey ? " 🔑" : ""}
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
                        const isValue = ci >= valueOutStart;
                        const v = ci < r.length ? r[ci] : null;
                        return (
                          <td
                            key={ci}
                            className={`px-2 py-1 whitespace-pre-wrap ${
                              isValue ? "text-indigo-700 dark:text-indigo-400" : ""
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
            {result.groups > PREVIEW_ROWS && (
              <div className="border-t border-black/10 px-3 py-1.5 text-[11px] text-amber-600 dark:border-white/10 dark:text-amber-400">
                แสดง {PREVIEW_ROWS} กลุ่มแรก (ดาวน์โหลดได้ครบ {result.groups} กลุ่ม)
              </div>
            )}
          </div>
        )}

        {state && result?.error && (
          <p className="rounded-md border border-amber-500/30 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
            {result.error}
          </p>
        )}

        {state && (groupCols.length === 0 || valueCols.length === 0) && (
          <p className="rounded-md border border-black/10 px-4 py-3 text-sm text-neutral-500 dark:border-white/10">
            เลือกคอลัมน์จัดกลุ่ม (key) และคอลัมน์ที่จะต่อค่า อย่างละ 1 คอลัมน์เป็นอย่างน้อย
          </p>
        )}
      </section>
    </main>
  );
}

"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { columnOptionLabel, columnLetter } from "@/lib/reconcile/columns";
import { downloadText, downloadBlob } from "@/lib/reconcile/export";
import { rowsToCsv, rowsToXlsx, changeExt } from "@/lib/convertfile/convertfile";
import { analyzeCoalesce, type CoalesceMode } from "@/lib/coalesce/coalesce";
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

// เดาคอลัมน์ที่ "ค่าเดียวกันไปอยู่คนละคอลัมน์" — จับตามชื่อหัวที่เข้าข่ายชนิดเดียวกัน (tracking / น้ำหนัก / cbm)
// เดินหากลุ่มที่ชนิดเดียวกันมากกว่า 1 คอลัมน์ก่อน · ไม่งั้น fallback = 2 คอลัมน์แรก
function guessCols(header: Row): number[] {
  const width = header.length;
  if (width === 0) return [];
  const GROUPS: RegExp[] = [
    /tracking|เลขพัสดุ|พัสดุ|awb|hbl|mbl|ref|เลขที่.*ส่ง|เลขติดตาม/i,
    /kg|น้ำหนัก|weight|น\.น|กก/i,
    /cbm|คิว|ปริมาตร|volume|q'?ty.*m3/i,
    /container|ตู้|cntr|เลขตู้/i,
    /กล่อง|box|carton|จำนวน|qty|ชิ้น/i,
  ];
  for (const g of GROUPS) {
    const hits: number[] = [];
    for (let c = 0; c < width; c++) if (g.test(headerText(header[c]))) hits.push(c);
    if (hits.length >= 2) return hits;
  }
  // ไม่เจอกลุ่มชัด → 2 คอลัมน์แรก (ให้ผู้ใช้ปรับเอง)
  return width >= 2 ? [0, 1] : [0];
}

export default function CoalescePage() {
  const [state, setState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cols, setCols] = useState<number[]>([]); // เรียงตามลำดับความสำคัญ (ซ้าย = ก่อน) — ห้าม sort
  const [mode, setMode] = useState<CoalesceMode>("add");
  const [colName, setColName] = useState("");
  const [trim, setTrim] = useState(true);
  const [addSource, setAddSource] = useState(false);
  const [sourceName, setSourceName] = useState("");

  const header = useMemo(() => headerRowOf(state), [state]);
  const data = useMemo(() => dataRowsOf(state), [state]);

  const result = useMemo(
    () =>
      state && cols.length > 0
        ? analyzeCoalesce(header, data, {
            cols,
            mode,
            colName: colName.trim() || undefined,
            trim,
            addSource,
            sourceName: sourceName.trim() || undefined,
          })
        : null,
    [state, header, data, cols, mode, colName, trim, addSource, sourceName],
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
      setCols(guessCols(rows[sel.headerRow] ?? []));
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
      setCols(guessCols(rows[next.sel.headerRow] ?? []));
      return next;
    });
  }, []);

  // เพิ่ม/ลบคอลัมน์ — เพิ่มต่อท้าย (คงลำดับความสำคัญ) · ไม่ sort
  const addCol = (i: number) => setCols((c) => (c.includes(i) ? c : [...c, i]));
  const removeCol = (i: number) => setCols((c) => c.filter((x) => x !== i));
  const moveCol = (idx: number, dir: -1 | 1) =>
    setCols((c) => {
      const j = idx + dir;
      if (j < 0 || j >= c.length) return c;
      const next = c.slice();
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });

  const dlCsv = () => {
    if (!state || !result || result.error) return;
    downloadText(
      changeExt(state.file.fileName, "csv", "-ค่าแรกที่ไม่ว่าง"),
      rowsToCsv([result.header, ...result.rows]),
      "text/csv",
    );
  };
  const dlXlsx = () => {
    if (!state || !result || result.error) return;
    downloadBlob(
      changeExt(state.file.fileName, "xlsx", "-ค่าแรกที่ไม่ว่าง"),
      rowsToXlsx([result.header, ...result.rows]),
      XLSX_MIME,
    );
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];
  const shownRows = result ? result.rows.slice(0, PREVIEW_ROWS) : [];
  const coalesceIdx = result ? result.newColIndex : -1;
  const sourceIdx = result && addSource ? result.header.length - 1 : -1;
  const unpicked = header.map((_, i) => i).filter((i) => !cols.includes(i));

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">เลือกค่าแรกที่ไม่ว่าง (Coalesce) 🧯</h1>
          <p className="text-xs text-neutral-500">
            เดินหลายคอลัมน์ตามลำดับความสำคัญ → เจอ<b>ค่าไม่ว่างช่องแรก = ใช้ค่านั้น</b> → เติมเป็น 1
            คอลัมน์ที่ครบ · เช่น tracking บางแถวอยู่คอลัมน์ &quot;tracking&quot; บางแถวอยู่
            &quot;AWB&quot;/&quot;เลขพัสดุ&quot; · ต่างจาก /combine-col (ต่อทุกคอลัมน์เป็นข้อความ) ·
            /row-agg (รวมเลข) · /fill (เติมช่องว่างแนวตั้ง)
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

        {/* STEP 2: เลือกคอลัมน์ + ตัวเลือก */}
        {state && (
          <div className="space-y-4 rounded-xl border border-black/10 p-4 dark:border-white/10">
            <div>
              <h2 className="mb-1 text-sm font-semibold">
                คอลัมน์ตามลำดับความสำคัญ{" "}
                <span className="font-normal text-neutral-400">
                  — บนสุด = ตรวจก่อน (เจอค่าไม่ว่างช่องแรก = ใช้เลย)
                </span>
              </h2>

              {cols.length === 0 ? (
                <p className="text-[11px] text-neutral-400">ยังไม่ได้เลือกคอลัมน์ (เลือกด้านล่าง)</p>
              ) : (
                <ol className="space-y-1">
                  {cols.map((c, idx) => (
                    <li
                      key={c}
                      className="flex items-center gap-2 rounded-md border border-emerald-600/40 bg-emerald-50 px-2 py-1 text-xs dark:bg-emerald-950/30"
                    >
                      <span className="w-5 text-right font-mono text-neutral-400">{idx + 1}.</span>
                      <span className="flex-1 truncate">
                        {columnLetter(c)} · {headerText(header[c]) || "(ว่าง)"}
                      </span>
                      <button
                        onClick={() => moveCol(idx, -1)}
                        disabled={idx === 0}
                        title="ขึ้น"
                        className="rounded px-1.5 py-0.5 text-neutral-500 hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/10"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => moveCol(idx, 1)}
                        disabled={idx === cols.length - 1}
                        title="ลง"
                        className="rounded px-1.5 py-0.5 text-neutral-500 hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/10"
                      >
                        ▼
                      </button>
                      <button
                        onClick={() => removeCol(c)}
                        title="ลบ"
                        className="rounded px-1.5 py-0.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ol>
              )}

              {unpicked.length > 0 && (
                <div className="mt-2">
                  <p className="mb-1 text-[11px] text-neutral-400">เพิ่มคอลัมน์ (ต่อท้ายลำดับ):</p>
                  <div className="flex flex-wrap gap-1.5">
                    {unpicked.map((i) => (
                      <button
                        key={i}
                        onClick={() => addCol(i)}
                        title={columnOptionLabel(header[i], i)}
                        className="rounded-full border border-black/15 px-2.5 py-1 text-xs transition hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                      >
                        + {columnLetter(i)} · {headerText(header[i]) || "(ว่าง)"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* โหมด */}
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <span className="font-medium text-neutral-600 dark:text-neutral-400">ผลลัพธ์:</span>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "add"}
                  onChange={() => setMode("add")}
                />
                เติมคอลัมน์ใหม่ท้ายตาราง
              </label>
              <label
                className="flex cursor-pointer items-center gap-1.5"
                title="เขียนค่าลงคอลัมน์แรกที่เลือก (ทับของเดิม)"
              >
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "replace"}
                  onChange={() => setMode("replace")}
                />
                เขียนทับคอลัมน์แรกที่เลือก
              </label>
            </div>

            {mode === "add" && (
              <label className="flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
                ชื่อคอลัมน์ผลลัพธ์:
                <input
                  type="text"
                  value={colName}
                  onChange={(e) => setColName(e.target.value)}
                  placeholder="(ว่าง = ตั้งชื่อให้อัตโนมัติ)"
                  className="w-64 rounded border border-black/15 bg-transparent px-1.5 py-1 dark:border-white/15 dark:bg-neutral-900"
                />
              </label>
            )}

            <div className="flex flex-wrap items-center gap-4 text-xs">
              <label className="flex cursor-pointer items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
                <input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} />
                ตัดช่องว่างหน้า-หลัง
              </label>
              <label
                className="flex cursor-pointer items-center gap-1.5 text-neutral-600 dark:text-neutral-400"
                title="เพิ่มคอลัมน์บอกว่าค่ามาจากคอลัมน์ไหน (โปร่งใส)"
              >
                <input
                  type="checkbox"
                  checked={addSource}
                  onChange={(e) => setAddSource(e.target.checked)}
                />
                เพิ่มคอลัมน์ &quot;แหล่งที่มา&quot;
              </label>
              {addSource && (
                <label className="flex items-center gap-1.5 text-neutral-500">
                  ชื่อ:
                  <input
                    type="text"
                    value={sourceName}
                    onChange={(e) => setSourceName(e.target.value)}
                    placeholder="แหล่งที่มา"
                    className="w-40 rounded border border-black/15 bg-transparent px-1.5 py-1 dark:border-white/15 dark:bg-neutral-900"
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
                ได้ค่า {result.filledRows} แถว
              </span>
              {result.emptyRows > 0 && (
                <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                  ทุกคอลัมน์ว่าง {result.emptyRows} (เว้นว่าง)
                </span>
              )}
              <span className="text-neutral-400">
                จาก {result.dataRows} แถว
                {result.inputRows > result.dataRows
                  ? ` (ตัดแถวว่าง ${result.inputRows - result.dataRows})`
                  : ""}
              </span>
              {/* นับว่าแต่ละคอลัมน์เป็นแหล่งค่ากี่แถว */}
              <span className="flex flex-wrap gap-1">
                {cols.map((c, i) =>
                  result.fromCounts[i] > 0 ? (
                    <span
                      key={c}
                      className="rounded bg-sky-100 px-1.5 py-0.5 text-[11px] text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
                    >
                      {headerText(header[c]) || columnLetter(c)}: {result.fromCounts[i]}
                    </span>
                  ) : null,
                )}
              </span>
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
                      const isCoalesce = i === coalesceIdx;
                      const isSource = i === sourceIdx;
                      return (
                        <th
                          key={i}
                          className={`border-b border-black/10 px-2 py-1.5 text-left whitespace-nowrap dark:border-white/10 ${
                            isCoalesce
                              ? "text-emerald-700 dark:text-emerald-400"
                              : isSource
                                ? "text-sky-700 dark:text-sky-400"
                                : ""
                          }`}
                        >
                          {headerText(h) || columnLetter(i)}
                          {isCoalesce ? " 🧯" : isSource ? " 🏷️" : ""}
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
                        const isCoalesce = ci === coalesceIdx;
                        const isSource = ci === sourceIdx;
                        const v = ci < r.length ? r[ci] : null;
                        return (
                          <td
                            key={ci}
                            className={`px-2 py-1 whitespace-pre-wrap ${
                              isCoalesce
                                ? "font-medium text-emerald-700 dark:text-emerald-400"
                                : isSource
                                  ? "text-sky-700 dark:text-sky-400"
                                  : ""
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
            {result.dataRows > PREVIEW_ROWS && (
              <div className="border-t border-black/10 px-3 py-1.5 text-[11px] text-amber-600 dark:border-white/10 dark:text-amber-400">
                แสดง {PREVIEW_ROWS} แถวแรก (ดาวน์โหลดได้ครบ {result.dataRows} แถว)
              </div>
            )}
          </div>
        )}

        {state && result?.error && (
          <p className="rounded-md border border-amber-500/30 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
            {result.error}
          </p>
        )}

        {state && cols.length === 0 && (
          <p className="rounded-md border border-black/10 px-4 py-3 text-sm text-neutral-500 dark:border-white/10">
            เลือกคอลัมน์ที่จะรวมอย่างน้อย 1 คอลัมน์ (เรียงตามลำดับความสำคัญ)
          </p>
        )}
      </section>
    </main>
  );
}

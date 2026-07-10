"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { columnLetter } from "@/lib/reconcile/columns";
import { downloadText, downloadBlob } from "@/lib/reconcile/export";
import { rowsToCsv, rowsToXlsx, changeExt } from "@/lib/convertfile/convertfile";
import { addRowNumber } from "@/lib/rownum/rownum";
import FileDropzone from "@/components/FileDropzone";
import type { ParsedFile, Row, SideSelection, Cell } from "@/lib/reconcile/types";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PREVIEW_ROWS = 200;
const GROUP_HINT = /container|ตู้|forwarder|เจ้า|tracking|awb|ref|กลุ่ม|batch|lot|order|ออเดอร์/i;

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
  return h === null || h === undefined || String(h).trim() === "" ? columnLetter(i) : String(h);
}

function guessGroupCol(header: Row): number {
  for (let i = 0; i < header.length; i++) {
    const h = header[i];
    if (h !== null && h !== undefined && GROUP_HINT.test(String(h))) return i;
  }
  return 0;
}

export default function RowNumberPage() {
  const [state, setState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("ลำดับ");
  const [start, setStart] = useState("1");
  const [step, setStep] = useState("1");
  const [padWidth, setPadWidth] = useState("0");
  const [prefix, setPrefix] = useState("");
  const [suffix, setSuffix] = useState("");
  const [position, setPosition] = useState<"start" | "end">("start");
  const [groupOn, setGroupOn] = useState(false);
  const [groupCol, setGroupCol] = useState(0);
  const [trimGroup, setTrimGroup] = useState(true);
  const [skipBlankRows, setSkipBlankRows] = useState(true);

  const header = useMemo(() => headerRowOf(state), [state]);
  const data = useMemo(() => dataRowsOf(state), [state]);
  const headerStr = useMemo(() => header.map((h) => (h === null ? "" : String(h))), [header]);

  const result = useMemo(
    () =>
      addRowNumber(headerStr, data, {
        name,
        start: Number(start),
        step: Number(step),
        padWidth: Math.max(0, Number(padWidth) || 0),
        prefix,
        suffix,
        position,
        groupCol: groupOn ? groupCol : null,
        trimGroup,
        skipBlankRows,
      }),
    [headerStr, data, name, start, step, padWidth, prefix, suffix, position, groupOn, groupCol, trimGroup, skipBlankRows],
  );

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const parsed = await parseFile(file);
      const sel = makeSelection(parsed, 0);
      const hdr = parsed.sheets[sel.sheetIndex]?.rows[sel.headerRow] ?? [];
      setGroupCol(guessGroupCol(hdr));
      setState({ file: parsed, sel });
    } catch (e) {
      setError(`อ่านไฟล์ ${file.name} ไม่สำเร็จ: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const updateSel = useCallback((patch: Partial<SideSelection>) => {
    setState((cur) => (cur ? { ...cur, sel: { ...cur.sel, ...patch } } : cur));
  }, []);

  const dlCsv = () => {
    if (!state || result.error) return;
    downloadText(
      changeExt(state.file.fileName, "csv", "-เลขลำดับ"),
      rowsToCsv([result.header, ...result.rows]),
      "text/csv",
    );
  };
  const dlXlsx = () => {
    if (!state || result.error) return;
    downloadBlob(
      changeExt(state.file.fileName, "xlsx", "-เลขลำดับ"),
      rowsToXlsx([result.header, ...result.rows]),
      XLSX_MIME,
    );
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];
  const shownRows = result.rows.slice(0, PREVIEW_ROWS);
  const newCol = result.newColIndex;
  const cellStr = (v: Cell) => (v === null || v === undefined ? "" : String(v));
  const sample =
    result.rows.length > 0 && !result.error
      ? cellStr(result.rows.find((r) => cellStr(r[newCol]) !== "")?.[newCol] ?? null)
      : "";

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">ออกเลขลำดับ #️⃣</h1>
          <p className="text-xs text-neutral-500">
            เติมคอลัมน์เลขรัน (No. 1..N) ให้ทุกแถว — ตั้งจุดเริ่ม/ก้าว/เติม 0 นำหน้า/prefix ·
            นับแยกต่อกลุ่ม (เช่น เลขกล่องต่อตู้) ได้ · แถวว่างไม่ใส่เลข · ไม่แตะข้อมูลเดิม
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
                      onChange={(e) => {
                        const si = Number(e.target.value);
                        const hdr = state.file.sheets[si]?.rows[guessHeaderRow(state.file.sheets[si]?.rows ?? [])] ?? [];
                        setGroupCol(guessGroupCol(hdr));
                        updateSel({
                          sheetIndex: si,
                          headerRow: guessHeaderRow(state.file.sheets[si]?.rows ?? []),
                          dataStart: guessHeaderRow(state.file.sheets[si]?.rows ?? []) + 1,
                          dataEnd: null,
                        });
                      }}
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

        {/* STEP 2: ตั้งค่าเลขลำดับ */}
        {state && (
          <div className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
            <h2 className="text-sm font-semibold">ตั้งค่าเลขลำดับ</h2>

            <div className="flex flex-wrap items-end gap-4 text-sm">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-neutral-500">ชื่อคอลัมน์ใหม่</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="เช่น No. / ลำดับ"
                  className="w-32 rounded border border-black/15 bg-transparent px-2 py-1.5 outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-neutral-500">เริ่มที่</span>
                <input
                  type="number"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="w-20 rounded border border-black/15 bg-transparent px-2 py-1.5 dark:border-white/15"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-neutral-500">ก้าวละ</span>
                <input
                  type="number"
                  value={step}
                  onChange={(e) => setStep(e.target.value)}
                  className="w-20 rounded border border-black/15 bg-transparent px-2 py-1.5 dark:border-white/15"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-neutral-500">เติม 0 นำหน้า (หลัก)</span>
                <input
                  type="number"
                  min={0}
                  max={12}
                  value={padWidth}
                  onChange={(e) => setPadWidth(e.target.value)}
                  className="w-20 rounded border border-black/15 bg-transparent px-2 py-1.5 dark:border-white/15"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-neutral-500">นำหน้า (prefix)</span>
                <input
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                  placeholder="เช่น BOX-"
                  className="w-24 rounded border border-black/15 bg-transparent px-2 py-1.5 font-mono outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-neutral-500">ต่อท้าย (suffix)</span>
                <input
                  value={suffix}
                  onChange={(e) => setSuffix(e.target.value)}
                  placeholder="เช่น /A"
                  className="w-24 rounded border border-black/15 bg-transparent px-2 py-1.5 font-mono outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-4 border-t border-black/5 pt-3 text-xs dark:border-white/5">
              <div className="flex items-center gap-1.5">
                <span className="text-neutral-500">ตำแหน่งคอลัมน์:</span>
                <div className="flex overflow-hidden rounded border border-black/15 dark:border-white/15">
                  <button
                    onClick={() => setPosition("start")}
                    className={`px-2.5 py-1 ${position === "start" ? "bg-indigo-600 text-white" : "text-neutral-500 hover:bg-black/5 dark:hover:bg-white/10"}`}
                  >
                    หน้าสุด
                  </button>
                  <button
                    onClick={() => setPosition("end")}
                    className={`px-2.5 py-1 ${position === "end" ? "bg-indigo-600 text-white" : "text-neutral-500 hover:bg-black/5 dark:hover:bg-white/10"}`}
                  >
                    ท้ายสุด
                  </button>
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
                <input type="checkbox" checked={groupOn} onChange={(e) => setGroupOn(e.target.checked)} />
                นับแยกต่อกลุ่ม
              </label>
              {groupOn && (
                <>
                  <select
                    value={groupCol}
                    onChange={(e) => setGroupCol(Number(e.target.value))}
                    className="rounded border border-black/15 bg-transparent px-2 py-1 dark:border-white/15 dark:bg-neutral-900"
                  >
                    {header.map((_, i) => (
                      <option key={i} value={i}>
                        {columnLetter(i)} · {colLabel(header, i)}
                      </option>
                    ))}
                  </select>
                  <label className="flex cursor-pointer items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
                    <input type="checkbox" checked={trimGroup} onChange={(e) => setTrimGroup(e.target.checked)} />
                    ตัดช่องว่างหน้า-หลังคีย์
                  </label>
                </>
              )}

              <label className="flex cursor-pointer items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
                <input
                  type="checkbox"
                  checked={skipBlankRows}
                  onChange={(e) => setSkipBlankRows(e.target.checked)}
                />
                แถวว่างไม่ใส่เลข
              </label>

              {sample !== "" && (
                <span className="ml-auto text-neutral-400">
                  ตัวอย่างเลขแรก: <span className="font-mono text-neutral-600 dark:text-neutral-300">{sample}</span>
                </span>
              )}
            </div>
          </div>
        )}

        {/* STEP 3: ผลลัพธ์ */}
        {state && (
          <div className="rounded-xl border border-black/10 dark:border-white/10">
            <div className="flex flex-wrap items-center gap-2 border-b border-black/10 px-3 py-2 text-xs dark:border-white/10">
              {result.error ? (
                <span className="rounded-full bg-red-100 px-3 py-1 font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300">
                  {result.error}
                </span>
              ) : (
                <>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                    ออกเลข <span className="tabular-nums">{result.numbered}</span> แถว
                  </span>
                  {result.skipped > 0 && (
                    <span className="rounded-full bg-neutral-100 px-3 py-1 font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                      แถวว่าง (ไม่ใส่เลข) <span className="tabular-nums">{result.skipped}</span>
                    </span>
                  )}
                  {groupOn && (
                    <span className="rounded-full bg-sky-100 px-3 py-1 font-medium text-sky-800 dark:bg-sky-900/40 dark:text-sky-300">
                      <span className="tabular-nums">{result.groups}</span> กลุ่ม
                    </span>
                  )}
                </>
              )}
              {result.rows.length > PREVIEW_ROWS && (
                <span className="text-neutral-400">แสดง {PREVIEW_ROWS} แถวแรก</span>
              )}
              <div className="ml-auto flex gap-2">
                <button
                  onClick={dlCsv}
                  disabled={!!result.error}
                  className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium hover:bg-black/5 disabled:opacity-40 dark:border-white/15 dark:hover:bg-white/10"
                >
                  ↓ CSV
                </button>
                <button
                  onClick={dlXlsx}
                  disabled={!!result.error}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-40"
                >
                  ↓ Excel
                </button>
              </div>
            </div>

            <div className="max-h-[55vh] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-900">
                  <tr>
                    <th className="px-2 py-1.5">#</th>
                    {result.header.map((h, i) => (
                      <th
                        key={i}
                        className={`px-2 py-1.5 whitespace-nowrap ${
                          i === newCol ? "text-indigo-700 dark:text-indigo-300" : ""
                        }`}
                      >
                        {h === "" ? columnLetter(i) : h}
                        {i === newCol && " #️⃣"}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shownRows.map((r, ri) => (
                    <tr key={ri} className="border-t border-black/5 dark:border-white/5">
                      <td className="px-2 py-1 text-right text-neutral-400 tabular-nums">{ri + 1}</td>
                      {result.header.map((_, ci) => (
                        <td
                          key={ci}
                          className={`max-w-[220px] truncate whitespace-nowrap px-2 py-1 ${
                            ci === newCol
                              ? "bg-indigo-50 font-medium tabular-nums dark:bg-indigo-950/30"
                              : ""
                          }`}
                        >
                          {cellStr(r[ci] ?? null)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {result.rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={Math.max(1, result.header.length) + 1}
                        className="px-2 py-4 text-center text-neutral-400"
                      >
                        ไม่มีแถวข้อมูล
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

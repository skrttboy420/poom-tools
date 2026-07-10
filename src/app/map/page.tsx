"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { columnLetter } from "@/lib/reconcile/columns";
import { downloadText, downloadBlob } from "@/lib/reconcile/export";
import { rowsToCsv, rowsToXlsx, changeExt } from "@/lib/convertfile/convertfile";
import { parseMapping, applyValueMap } from "@/lib/valuemap/valuemap";
import FileDropzone from "@/components/FileDropzone";
import type { ParsedFile, Row, SideSelection } from "@/lib/reconcile/types";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PREVIEW_ROWS = 200;

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

// เดาคอลัมน์ที่น่าจะแมป (forwarder / สถานะ / รหัส / ตู้)
function guessColumn(header: Row): number {
  const KEYS = ["forwarder", "ฟอร์เวิร์ด", "สถานะ", "status", "รหัส", "code", "ตู้", "container", "ประเทศ", "port", "ท่าเรือ"];
  for (let i = 0; i < header.length; i++) {
    const h = String(header[i] ?? "").toLowerCase();
    if (KEYS.some((k) => h.includes(k))) return i;
  }
  return 0;
}

export default function MapPage() {
  const [state, setState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [col, setCol] = useState(0);
  const [mappingText, setMappingText] = useState("");
  const [mode, setMode] = useState<"replace" | "new-column">("replace");
  const [unmatched, setUnmatched] = useState<"keep" | "blank">("keep");
  const [caseInsensitive, setCaseInsensitive] = useState(false);
  const [trim, setTrim] = useState(true);
  const [newColName, setNewColName] = useState("");

  const header = useMemo(() => headerRowOf(state), [state]);
  const data = useMemo(() => dataRowsOf(state), [state]);
  const headerStr = useMemo(() => header.map((h) => (h === null ? "" : String(h))), [header]);

  const mapping = useMemo(() => parseMapping(mappingText), [mappingText]);

  const result = useMemo(
    () =>
      applyValueMap(headerStr, data, col, mapping, {
        mode,
        unmatched,
        caseInsensitive,
        trim,
        newColName,
      }),
    [headerStr, data, col, mapping, mode, unmatched, caseInsensitive, trim, newColName],
  );

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const parsed = await parseFile(file);
      const sel = makeSelection(parsed, 0);
      setState({ file: parsed, sel });
      // auto-guess คอลัมน์ที่จะแมป จากหัวตารางของไฟล์ใหม่
      const hdr = parsed.sheets[sel.sheetIndex]?.rows[sel.headerRow] ?? [];
      setCol(guessColumn(hdr));
    } catch (e) {
      setError(`อ่านไฟล์ ${file.name} ไม่สำเร็จ: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const guessAndSet = useCallback(() => {
    setCol(guessColumn(header));
  }, [header]);

  const updateSel = useCallback((patch: Partial<SideSelection>) => {
    setState((cur) => (cur ? { ...cur, sel: { ...cur.sel, ...patch } } : cur));
  }, []);

  // ตำแหน่งคอลัมน์ที่ต้องไฮไลต์ในผลลัพธ์
  const highlightCol = result.newColIndex !== null ? result.newColIndex : col;

  const dlCsv = () => {
    if (!state || result.error) return;
    downloadText(changeExt(state.file.fileName, "csv", "-แมป"), rowsToCsv([result.header, ...result.rows]), "text/csv");
  };
  const dlXlsx = () => {
    if (!state || result.error) return;
    downloadBlob(changeExt(state.file.fileName, "xlsx", "-แมป"), rowsToXlsx([result.header, ...result.rows]), XLSX_MIME);
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];
  const shownRows = result.rows.slice(0, PREVIEW_ROWS);

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">แมปค่าตามพจนานุกรม 🗺️</h1>
          <p className="text-xs text-neutral-500">
            แทนค่าทั้งคอลัมน์ทีเดียวตาม &quot;พจนานุกรม&quot; ที่พิมพ์เอง (เช่น รหัส forwarder → ชื่อเต็ม, รหัสสถานะ → ข้อความ) · ค่าที่ไม่มีในพจนานุกรม → เก็บของเดิม โชว์ให้ดูก่อน
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

        {/* STEP 2: เลือกคอลัมน์ + พจนานุกรม */}
        {state && (
          <div className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-sm font-semibold">คอลัมน์ที่จะแมป</h2>
              <select
                value={col}
                onChange={(e) => setCol(Number(e.target.value))}
                className="rounded border border-black/15 bg-transparent px-2 py-1 text-sm dark:border-white/15 dark:bg-neutral-900"
              >
                {header.map((h, i) => (
                  <option key={i} value={i}>
                    {columnLetter(i)} · {colLabel(header, i)}
                  </option>
                ))}
              </select>
              <button
                onClick={guessAndSet}
                className="rounded border border-black/15 px-2 py-1 text-xs text-neutral-500 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
              >
                เดาให้
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-neutral-500">
                พจนานุกรม — บรรทัดละ 1 คู่ &quot;ค่าเดิม=ค่าใหม่&quot; (ใช้ = หรือ Tab หรือ , ก็ได้)
              </label>
              <textarea
                value={mappingText}
                onChange={(e) => setMappingText(e.target.value)}
                spellCheck={false}
                rows={6}
                placeholder={"เช่น\nTU-A=ตู้เอ\nTU-B=ตู้บี\nCN=จีน\nUS=อเมริกา"}
                className="w-full rounded border border-black/15 bg-transparent px-3 py-2 font-mono text-sm outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
              />
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-neutral-400">
                <span>อ่านได้ {mapping.length} คู่</span>
                <button
                  onClick={() => setMappingText("TU-A=ตู้เอ\nTU-B=ตู้บี\nTU-C=ตู้ซี")}
                  className="rounded border border-black/10 px-2 py-0.5 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
                >
                  ใส่ตัวอย่าง
                </button>
                <button
                  onClick={() => setMappingText("")}
                  className="rounded border border-black/10 px-2 py-0.5 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
                >
                  ล้าง
                </button>
              </div>
            </div>

            {/* options */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-black/5 pt-3 text-xs dark:border-white/5">
              <div className="flex items-center gap-1">
                <span className="text-neutral-500">ผลลัพธ์:</span>
                <button
                  onClick={() => setMode("replace")}
                  className={`rounded border px-2 py-1 transition ${
                    mode === "replace"
                      ? "border-indigo-500 bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200"
                      : "border-black/15 text-neutral-500 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                  }`}
                >
                  แทนในคอลัมน์เดิม
                </button>
                <button
                  onClick={() => setMode("new-column")}
                  className={`rounded border px-2 py-1 transition ${
                    mode === "new-column"
                      ? "border-indigo-500 bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200"
                      : "border-black/15 text-neutral-500 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                  }`}
                >
                  เพิ่มคอลัมน์ใหม่
                </button>
              </div>

              <div className="flex items-center gap-1">
                <span className="text-neutral-500">ค่าที่ไม่มีในพจนานุกรม:</span>
                <button
                  onClick={() => setUnmatched("keep")}
                  className={`rounded border px-2 py-1 transition ${
                    unmatched === "keep"
                      ? "border-emerald-500 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                      : "border-black/15 text-neutral-500 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                  }`}
                >
                  เก็บของเดิม
                </button>
                <button
                  onClick={() => setUnmatched("blank")}
                  className={`rounded border px-2 py-1 transition ${
                    unmatched === "blank"
                      ? "border-emerald-500 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                      : "border-black/15 text-neutral-500 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                  }`}
                >
                  ทำเป็นว่าง
                </button>
              </div>

              <label className="flex cursor-pointer items-center gap-1.5 text-neutral-600 dark:text-neutral-400" title="ไม่สนพิมพ์เล็ก/ใหญ่ตอนเทียบ key">
                <input type="checkbox" checked={caseInsensitive} onChange={(e) => setCaseInsensitive(e.target.checked)} />
                ไม่สนพิมพ์เล็ก/ใหญ่
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-neutral-600 dark:text-neutral-400" title="ตัดช่องว่างหน้า-หลังก่อนเทียบ key">
                <input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} />
                ตัดช่องว่างก่อนเทียบ
              </label>

              {mode === "new-column" && (
                <label className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
                  ชื่อคอลัมน์ใหม่:
                  <input
                    value={newColName}
                    onChange={(e) => setNewColName(e.target.value)}
                    placeholder={`${colLabel(header, col)} (แมป)`}
                    className="w-40 rounded border border-black/15 bg-transparent px-2 py-1 dark:border-white/15"
                  />
                </label>
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
                  <span className="rounded-full bg-indigo-100 px-3 py-1 font-medium text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200">
                    แมปได้ <span className="tabular-nums">{result.mappedCells}</span> ช่อง
                  </span>
                  <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                    ไม่มีในพจนานุกรม <span className="tabular-nums">{result.unmatchedCells}</span>
                  </span>
                  <span className="rounded-full bg-neutral-100 px-3 py-1 font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                    ว่าง <span className="tabular-nums">{result.blankCells}</span>
                  </span>
                  <span className="text-neutral-400">
                    พจนานุกรม <span className="tabular-nums">{result.entries}</span> คู่ · จาก{" "}
                    <span className="tabular-nums">{result.inputRows}</span> แถว
                  </span>
                </>
              )}
              {result.rows.length > PREVIEW_ROWS && <span className="text-neutral-400">แสดง {PREVIEW_ROWS} แถวแรก</span>}
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

            {/* ค่าที่ไม่มีในพจนานุกรม (โชว์ให้ดูก่อน) */}
            {!result.error && result.unmatchedSamples.length > 0 && (
              <div className="border-b border-black/10 bg-amber-50/50 px-3 py-2 dark:border-white/10 dark:bg-amber-950/10">
                <p className="mb-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                  ค่าที่ยังไม่มีในพจนานุกรม (unique {result.unmatchedSamples.length}
                  {result.unmatchedSamples.length >= 50 ? "+" : ""}) — {unmatched === "keep" ? "เก็บของเดิมไว้" : "ถูกทำเป็นว่าง"}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {result.unmatchedSamples.map((s, i) => (
                    <span key={i} className="rounded border border-amber-300/50 bg-white px-2 py-0.5 text-[11px] text-amber-800 dark:bg-neutral-900 dark:text-amber-300">
                      {s || "(ว่าง)"}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="max-h-[55vh] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-900">
                  <tr>
                    <th className="px-2 py-1.5">#</th>
                    {result.header.map((h, i) => (
                      <th
                        key={i}
                        className={`px-2 py-1.5 whitespace-nowrap ${
                          i === highlightCol ? "text-indigo-700 dark:text-indigo-300" : ""
                        }`}
                      >
                        {h === "" ? columnLetter(i) : h}
                        {i === highlightCol ? " 🗺️" : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shownRows.map((r, ri) => (
                    <tr key={ri} className="border-t border-black/5 dark:border-white/5">
                      <td className="px-2 py-1 text-right text-neutral-400 tabular-nums">{ri + 1}</td>
                      {result.header.map((_, ci) => {
                        const hot = ci === highlightCol;
                        const v = r[ci];
                        return (
                          <td
                            key={ci}
                            className={`max-w-[220px] truncate whitespace-nowrap px-2 py-1 ${
                              hot ? "bg-indigo-50 font-medium text-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-200" : ""
                            }`}
                          >
                            {v === null || v === undefined ? "" : String(v)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {result.rows.length === 0 && (
                    <tr>
                      <td colSpan={Math.max(1, result.header.length) + 1} className="px-2 py-4 text-center text-neutral-400">
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

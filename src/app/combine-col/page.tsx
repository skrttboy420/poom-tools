"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { columnLetter } from "@/lib/reconcile/columns";
import { downloadText, downloadBlob } from "@/lib/reconcile/export";
import { rowsToCsv, rowsToXlsx, changeExt } from "@/lib/convertfile/convertfile";
import { combineColumns } from "@/lib/combinecol/combinecol";
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

const PRESETS: { label: string; value: string }[] = [
  { label: "-", value: "-" },
  { label: "/", value: "/" },
  { label: "_", value: "_" },
  { label: ",", value: "," },
  { label: "เว้นวรรค", value: " " },
  { label: "ไม่มี", value: "" },
];

function sepDisplay(d: string): string {
  if (d === "") return "(ชิดกัน)";
  if (d === " ") return "เว้นวรรค";
  return d;
}

function colLabel(header: Row, i: number): string {
  const h = header[i];
  return h === null || h === undefined || String(h).trim() === "" ? `(ว่าง)` : String(h);
}

export default function CombineColPage() {
  const [state, setState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [separator, setSeparator] = useState("-");
  const [name, setName] = useState("");
  const [keepOriginals, setKeepOriginals] = useState(true);
  const [trim, setTrim] = useState(true);
  const [skipEmpty, setSkipEmpty] = useState(true);

  const header = useMemo(() => headerRowOf(state), [state]);
  const data = useMemo(() => dataRowsOf(state), [state]);
  const headerStr = useMemo(() => header.map((h) => (h === null ? "" : String(h))), [header]);

  const result = useMemo(
    () => combineColumns(headerStr, data, selected, { separator, name, keepOriginals, trim, skipEmpty }),
    [headerStr, data, selected, separator, name, keepOriginals, trim, skipEmpty],
  );

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const parsed = await parseFile(file);
      const sel = makeSelection(parsed, 0);
      setState({ file: parsed, sel });
      const hdr = parsed.sheets[sel.sheetIndex]?.rows[sel.headerRow] ?? [];
      // เดาเริ่มต้น: เลือก 2 คอลัมน์แรก (ให้เห็นผลทันที)
      setSelected(hdr.length >= 2 ? [0, 1] : hdr.length === 1 ? [0] : []);
      setName("");
    } catch (e) {
      setError(`อ่านไฟล์ ${file.name} ไม่สำเร็จ: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const updateSel = useCallback((patch: Partial<SideSelection>) => {
    setState((cur) => (cur ? { ...cur, sel: { ...cur.sel, ...patch } } : cur));
  }, []);

  const addCol = (i: number) => setSelected((cur) => [...cur, i]);
  const removeAt = (idx: number) => setSelected((cur) => cur.filter((_, k) => k !== idx));
  const moveAt = (idx: number, dir: -1 | 1) =>
    setSelected((cur) => {
      const j = idx + dir;
      if (j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });

  const dlCsv = () => {
    if (!state || result.error) return;
    downloadText(changeExt(state.file.fileName, "csv", "-รวมคอลัมน์"), rowsToCsv([result.header, ...result.rows]), "text/csv");
  };
  const dlXlsx = () => {
    if (!state || result.error) return;
    downloadBlob(changeExt(state.file.fileName, "xlsx", "-รวมคอลัมน์"), rowsToXlsx([result.header, ...result.rows]), XLSX_MIME);
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];
  const shownRows = result.rows.slice(0, PREVIEW_ROWS);

  // ตำแหน่งคอลัมน์รวม (ไว้ไฮไลต์)
  const validSel = selected.filter((c) => c >= 0 && c < header.length);
  const combinedIdx = result.error ? -1 : keepOriginals ? result.header.length - 1 : Math.min(...validSel);

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">รวมคอลัมน์ 🔗➡️</h1>
          <p className="text-xs text-neutral-500">
            ต่อหลายคอลัมน์เป็นคอลัมน์เดียว (เช่น ตู้+เลข → รหัสเดียว, tracking+กล่อง → key ผสม) · ทุกแถวอยู่ครบ ไม่ทำข้อมูลหาย
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

        {/* STEP 2: เลือกคอลัมน์ + ตั้งค่า */}
        {state && (
          <div className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
            <h2 className="text-sm font-semibold">เลือกคอลัมน์ที่จะรวม (ลำดับสำคัญ)</h2>

            {/* ลำดับที่เลือก */}
            <div className="space-y-2">
              {validSel.length === 0 && (
                <p className="py-1 text-xs text-neutral-400">ยังไม่ได้เลือก — กดคอลัมน์ด้านล่างเพื่อเพิ่ม</p>
              )}
              {selected.map((c, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm">
                  <span className="w-5 text-right text-xs text-neutral-400 tabular-nums">{idx + 1}</span>
                  <span className="rounded-md bg-indigo-100 px-2 py-1 text-xs font-medium text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200">
                    {columnLetter(c)} · {colLabel(header, c)}
                  </span>
                  <button onClick={() => moveAt(idx, -1)} disabled={idx === 0} className="px-1 text-xs text-neutral-400 hover:text-neutral-700 disabled:opacity-20 dark:hover:text-neutral-200" title="เลื่อนซ้าย/ขึ้น">
                    ▲
                  </button>
                  <button onClick={() => moveAt(idx, 1)} disabled={idx === selected.length - 1} className="px-1 text-xs text-neutral-400 hover:text-neutral-700 disabled:opacity-20 dark:hover:text-neutral-200" title="เลื่อนขวา/ลง">
                    ▼
                  </button>
                  <button onClick={() => removeAt(idx)} className="px-1 text-xs text-neutral-400 hover:text-red-600" title="เอาออก">
                    ✕
                  </button>
                </div>
              ))}
            </div>

            {/* คอลัมน์ทั้งหมด (กดเพื่อเพิ่ม) */}
            <div className="flex flex-wrap gap-1.5 border-t border-black/5 pt-3 dark:border-white/5">
              {header.map((h, i) => (
                <button
                  key={i}
                  onClick={() => addCol(i)}
                  className="rounded border border-black/15 px-2 py-1 text-xs text-neutral-600 hover:border-indigo-400 hover:bg-indigo-50 dark:border-white/15 dark:text-neutral-300 dark:hover:bg-indigo-950/30"
                  title="เพิ่มคอลัมน์นี้เข้าการรวม"
                >
                  + {columnLetter(i)} · {colLabel(header, i)}
                </button>
              ))}
            </div>

            {/* ตัวเชื่อม + ชื่อ + options */}
            <div className="flex flex-wrap items-center gap-3 border-t border-black/5 pt-3 text-sm dark:border-white/5">
              <label className="flex items-center gap-1.5">
                <span className="text-xs text-neutral-500">ตัวเชื่อม:</span>
                <input
                  value={separator}
                  onChange={(e) => setSeparator(e.target.value)}
                  placeholder="เช่น -"
                  spellCheck={false}
                  className="w-20 rounded border border-black/15 bg-transparent px-2 py-1.5 font-mono outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
                />
              </label>
              <div className="flex flex-wrap items-center gap-1">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => setSeparator(p.value)}
                    className={`rounded border px-2 py-1 text-xs transition ${
                      separator === p.value
                        ? "border-indigo-500 bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200"
                        : "border-black/15 text-neutral-500 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <label className="flex flex-1 items-center gap-1.5">
                <span className="text-xs text-neutral-500">ชื่อหัวคอลัมน์:</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={result.error ? "" : `อัตโนมัติ: ${result.name}`}
                  spellCheck={false}
                  className="min-w-[140px] flex-1 rounded border border-black/15 bg-transparent px-2 py-1.5 outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-600 dark:text-neutral-400">
              <label className="flex cursor-pointer items-center gap-1.5" title="เก็บคอลัมน์เดิมไว้ด้วย (ไม่ทิ้ง) — ปิด = ตัดคอลัมน์ต้นทางออก เหลือคอลัมน์รวม">
                <input type="checkbox" checked={keepOriginals} onChange={(e) => setKeepOriginals(e.target.checked)} />
                เก็บคอลัมน์เดิมไว้ด้วย
              </label>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} />
                ตัดช่องว่างแต่ละชิ้น
              </label>
              <label className="flex cursor-pointer items-center gap-1.5" title="ข้ามชิ้นที่ว่าง กันได้ตัวเชื่อมซ้ำ เช่น A--B">
                <input type="checkbox" checked={skipEmpty} onChange={(e) => setSkipEmpty(e.target.checked)} />
                ข้ามชิ้นว่าง
              </label>
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
                    รวม <span className="tabular-nums">{result.sourceCount}</span> คอลัมน์ → &quot;{result.name}&quot;
                  </span>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                    <span className="tabular-nums">{result.inputRows}</span> แถว
                  </span>
                  <span className="text-neutral-400">ตัวเชื่อม &quot;{sepDisplay(separator)}&quot;</span>
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

            <div className="max-h-[55vh] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-900">
                  <tr>
                    <th className="px-2 py-1.5">#</th>
                    {result.header.map((h, i) => {
                      const isNew = i === combinedIdx;
                      return (
                        <th key={i} className={`px-2 py-1.5 whitespace-nowrap ${isNew ? "text-indigo-700 dark:text-indigo-300" : ""}`}>
                          {h === "" ? columnLetter(i) : h}
                          {isNew && " 🔗"}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {shownRows.map((r, ri) => (
                    <tr key={ri} className="border-t border-black/5 dark:border-white/5">
                      <td className="px-2 py-1 text-right text-neutral-400 tabular-nums">{ri + 1}</td>
                      {result.header.map((_, ci) => {
                        const isNew = ci === combinedIdx;
                        const v = r[ci];
                        return (
                          <td
                            key={ci}
                            className={`max-w-[220px] truncate whitespace-nowrap px-2 py-1 ${isNew ? "bg-indigo-50 font-medium dark:bg-indigo-950/30" : ""}`}
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

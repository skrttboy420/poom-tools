"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { columnOptionLabel, columnLetter } from "@/lib/reconcile/columns";
import { downloadText, downloadBlob } from "@/lib/reconcile/export";
import { rowsToCsv, rowsToXlsx, changeExt } from "@/lib/convertfile/convertfile";
import { pluckColumns, defaultSpecs, type ColumnSpec } from "@/lib/pluck/pluck";
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

let uid = 0;
type Spec = ColumnSpec & { id: number };
const newSpec = (src: number, name: string, constant = ""): Spec => ({ id: ++uid, src, name, constant });

export default function ColumnsPage() {
  const [state, setState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [specs, setSpecs] = useState<Spec[]>([]);
  const [dropEmpty, setDropEmpty] = useState(false);

  const header = useMemo(() => headerRowOf(state), [state]);
  const data = useMemo(() => dataRowsOf(state), [state]);
  const headerStr = useMemo(() => header.map((h) => (h === null ? "" : String(h))), [header]);

  const result = useMemo(
    () => pluckColumns(headerStr, data, specs, { dropEmptyRows: dropEmpty }),
    [headerStr, data, specs, dropEmpty],
  );

  const loadDefaults = useCallback((hdr: Row) => {
    const hs = hdr.map((h) => (h === null ? "" : String(h)));
    setSpecs(defaultSpecs(hs).map((s) => newSpec(s.src, s.name)));
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
        loadDefaults(parsed.sheets[sel.sheetIndex]?.rows[sel.headerRow] ?? []);
      } catch (e) {
        setError(`อ่านไฟล์ ${file.name} ไม่สำเร็จ: ${(e as Error).message}`);
      } finally {
        setBusy(false);
      }
    },
    [loadDefaults],
  );

  const updateSel = useCallback(
    (patch: Partial<SideSelection>) => {
      setState((cur) => {
        if (!cur) return cur;
        const next = { ...cur, sel: { ...cur.sel, ...patch } };
        loadDefaults(next.file.sheets[next.sel.sheetIndex]?.rows[next.sel.headerRow] ?? []);
        return next;
      });
    },
    [loadDefaults],
  );

  const patchSpec = (id: number, patch: Partial<Spec>) =>
    setSpecs((cur) => cur.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const removeSpec = (id: number) => setSpecs((cur) => cur.filter((s) => s.id !== id));
  const move = (id: number, dir: -1 | 1) =>
    setSpecs((cur) => {
      const i = cur.findIndex((s) => s.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const dlCsv = () => {
    if (!state) return;
    downloadText(changeExt(state.file.fileName, "csv", "-คอลัมน์"), rowsToCsv([result.header, ...result.rows]), "text/csv");
  };
  const dlXlsx = () => {
    if (!state) return;
    downloadBlob(changeExt(state.file.fileName, "xlsx", "-คอลัมน์"), rowsToXlsx([result.header, ...result.rows]), XLSX_MIME);
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];
  const shownRows = result.rows.slice(0, PREVIEW_ROWS);

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">เลือก/จัดเรียงคอลัมน์ 🧲</h1>
          <p className="text-xs text-neutral-500">
            ตัดตารางให้เหลือเฉพาะคอลัมน์ที่ต้องการ + สลับลำดับ + เปลี่ยนชื่อหัว + เพิ่มคอลัมน์ค่าคงที่ (เช่น ติดเลขตู้ทุกแถว) ก่อน export เข้า Pacred
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

        {/* STEP 2: จัดคอลัมน์ */}
        {state && (
          <div className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">คอลัมน์ปลายทาง ({specs.length})</h2>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <button
                  onClick={() => loadDefaults(header)}
                  className="rounded border border-black/15 px-2 py-1 text-neutral-500 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                >
                  รีเซ็ต (ทุกคอลัมน์)
                </button>
                <button
                  onClick={() => setSpecs([])}
                  className="rounded border border-black/15 px-2 py-1 text-neutral-500 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                >
                  ล้างทั้งหมด
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {specs.map((s, idx) => {
                const isConst = s.src < 0;
                return (
                  <div key={s.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="w-6 text-right text-xs text-neutral-400 tabular-nums">{idx + 1}</span>
                    <div className="flex flex-col">
                      <button
                        onClick={() => move(s.id, -1)}
                        disabled={idx === 0}
                        className="px-1 text-[10px] leading-none text-neutral-400 hover:text-neutral-700 disabled:opacity-20 dark:hover:text-neutral-200"
                        title="เลื่อนขึ้น"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => move(s.id, 1)}
                        disabled={idx === specs.length - 1}
                        className="px-1 text-[10px] leading-none text-neutral-400 hover:text-neutral-700 disabled:opacity-20 dark:hover:text-neutral-200"
                        title="เลื่อนลง"
                      >
                        ▼
                      </button>
                    </div>

                    <select
                      value={s.src}
                      onChange={(e) => patchSpec(s.id, { src: Number(e.target.value) })}
                      className="rounded border border-black/15 bg-transparent px-2 py-1.5 dark:border-white/15 dark:bg-neutral-900"
                    >
                      <option value={-1}>➕ ค่าคงที่</option>
                      {header.map((h, i) => (
                        <option key={i} value={i} title={columnOptionLabel(h, i)}>
                          {columnLetter(i)} · {h === null || String(h).trim() === "" ? "(ว่าง)" : String(h)}
                        </option>
                      ))}
                    </select>

                    <input
                      value={s.name}
                      onChange={(e) => patchSpec(s.id, { name: e.target.value })}
                      placeholder="ชื่อหัวปลายทาง"
                      spellCheck={false}
                      className="min-w-[140px] flex-1 rounded border border-black/15 bg-transparent px-2 py-1.5 outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
                    />

                    {isConst && (
                      <input
                        value={s.constant ?? ""}
                        onChange={(e) => patchSpec(s.id, { constant: e.target.value })}
                        placeholder="ค่าคงที่ทุกแถว เช่น TU-A"
                        spellCheck={false}
                        className="min-w-[140px] flex-1 rounded border border-emerald-500/40 bg-emerald-50/40 px-2 py-1.5 outline-none focus:border-emerald-500 dark:border-emerald-500/40 dark:bg-emerald-950/20"
                      />
                    )}

                    <button
                      onClick={() => removeSpec(s.id)}
                      className="rounded border border-black/15 px-2 py-1 text-xs text-neutral-500 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                    >
                      ลบ
                    </button>
                  </div>
                );
              })}
              {specs.length === 0 && (
                <p className="py-2 text-center text-xs text-neutral-400">ยังไม่มีคอลัมน์ — กด &quot;รีเซ็ต&quot; หรือ &quot;เพิ่มคอลัมน์&quot;</p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setSpecs((cur) => [...cur, newSpec(header.length > 0 ? 0 : -1, "")])}
                className="rounded-md border border-dashed border-black/25 px-3 py-1.5 text-xs text-neutral-500 hover:bg-black/5 dark:border-white/25 dark:hover:bg-white/5"
              >
                + เพิ่มคอลัมน์
              </button>
              <button
                onClick={() => setSpecs((cur) => [...cur, newSpec(-1, "", "")])}
                className="rounded-md border border-dashed border-emerald-500/40 px-3 py-1.5 text-xs text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/20"
              >
                + คอลัมน์ค่าคงที่
              </button>
              <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400" title="ตัดแถวที่ทุกช่องจากต้นฉบับว่าง (ไม่นับคอลัมน์ค่าคงที่)">
                <input type="checkbox" checked={dropEmpty} onChange={(e) => setDropEmpty(e.target.checked)} />
                ตัดแถวว่าง
              </label>
            </div>
          </div>
        )}

        {/* STEP 3: ผลลัพธ์ */}
        {state && (
          <div className="rounded-xl border border-black/10 dark:border-white/10">
            <div className="flex flex-wrap items-center gap-2 border-b border-black/10 px-3 py-2 text-xs dark:border-white/10">
              <span className="rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                <span className="tabular-nums">{result.outputRows}</span> แถว · {result.header.length} คอลัมน์
              </span>
              {result.inputRows !== result.outputRows && (
                <span className="text-neutral-400">(ตัดว่าง {result.inputRows - result.outputRows} แถว)</span>
              )}
              {result.outputRows > PREVIEW_ROWS && <span className="text-neutral-400">แสดง {PREVIEW_ROWS} แถวแรก</span>}
              <div className="ml-auto flex gap-2">
                <button
                  onClick={dlCsv}
                  disabled={specs.length === 0}
                  className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium hover:bg-black/5 disabled:opacity-40 dark:border-white/15 dark:hover:bg-white/10"
                >
                  ↓ CSV
                </button>
                <button
                  onClick={dlXlsx}
                  disabled={specs.length === 0}
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
                      <th key={i} className="px-2 py-1.5 whitespace-nowrap">
                        {h === "" ? columnLetter(i) : h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shownRows.map((r, ri) => (
                    <tr key={ri} className="border-t border-black/5 dark:border-white/5">
                      <td className="px-2 py-1 text-right text-neutral-400 tabular-nums">{ri + 1}</td>
                      {result.header.map((_, ci) => (
                        <td key={ci} className="max-w-[200px] truncate whitespace-nowrap px-2 py-1">
                          {r[ci] === null || r[ci] === undefined ? "" : String(r[ci])}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {(result.outputRows === 0 || result.header.length === 0) && (
                    <tr>
                      <td colSpan={Math.max(1, result.header.length) + 1} className="px-2 py-4 text-center text-neutral-400">
                        {specs.length === 0 ? "เลือกคอลัมน์ก่อน" : "ไม่มีแถวข้อมูล"}
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

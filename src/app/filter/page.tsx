"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { columnOptionLabel, columnLetter } from "@/lib/reconcile/columns";
import { downloadText } from "@/lib/reconcile/export";
import { rowsToCsv, changeExt } from "@/lib/convertfile/convertfile";
import {
  applyFilter,
  OP_LABEL,
  NO_VALUE_OPS,
  NUMERIC_OPS,
  type FilterCond,
  type FilterOp,
} from "@/lib/filter/filter";
import FileDropzone from "@/components/FileDropzone";
import type { ParsedFile, Row, SideSelection } from "@/lib/reconcile/types";

const PREVIEW_ROWS = 200; // แสดงผลไม่เกินเท่านี้กัน UI หน่วง

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
type Cond = FilterCond & { id: number };
const newCond = (): Cond => ({ id: ++uid, col: -1, op: "contains", value: "", caseSensitive: false });

const OPS: FilterOp[] = [
  "contains",
  "not-contains",
  "equals",
  "not-equals",
  "starts",
  "ends",
  "empty",
  "not-empty",
  "gt",
  "gte",
  "lt",
  "lte",
];

export default function FilterPage() {
  const [state, setState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [quick, setQuick] = useState("");
  const [match, setMatch] = useState<"all" | "any">("all");
  const [conds, setConds] = useState<Cond[]>([newCond()]);

  const header = useMemo(() => headerRowOf(state), [state]);
  const data = useMemo(() => dataRowsOf(state), [state]);

  const result = useMemo(
    () => applyFilter(header, data, conds, { match, quick }),
    [header, data, conds, match, quick],
  );

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const parsed = await parseFile(file);
      setState({ file: parsed, sel: makeSelection(parsed, 0) });
    } catch (e) {
      setError(`อ่านไฟล์ ${file.name} ไม่สำเร็จ: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const updateSel = useCallback((patch: Partial<SideSelection>) => {
    setState((cur) => (cur ? { ...cur, sel: { ...cur.sel, ...patch } } : cur));
  }, []);

  const patchCond = (id: number, patch: Partial<Cond>) =>
    setConds((cur) => cur.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const removeCond = (id: number) =>
    setConds((cur) => (cur.length <= 1 ? [newCond()] : cur.filter((c) => c.id !== id)));

  const dlCsv = () => {
    if (!state) return;
    downloadText(
      changeExt(state.file.fileName, "csv", "-กรอง"),
      rowsToCsv([result.header, ...result.rows]),
      "text/csv",
    );
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];
  const shownRows = result.rows.slice(0, PREVIEW_ROWS);

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">ค้นหา &amp; กรองข้อมูล 🔎</h1>
          <p className="text-xs text-neutral-500">
            หา/กรองแถวในไฟล์ใหญ่ — ค้นเร็วทุกคอลัมน์ หรือตั้งเงื่อนไขหลายชั้น (AND/OR) เช่น น้ำหนัก 0, ตู้ TU-A, tracking ขึ้นต้น KY
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
            <h2 className="text-sm font-semibold">ไฟล์ที่จะค้น</h2>
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

        {/* STEP 2: เงื่อนไข */}
        {state && (
          <div className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-sm font-semibold">เงื่อนไข</h2>
              <input
                value={quick}
                onChange={(e) => setQuick(e.target.value)}
                placeholder="🔎 ค้นเร็วทุกคอลัมน์..."
                spellCheck={false}
                className="min-w-[220px] flex-1 rounded-lg border border-black/15 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
              />
              <div className="flex overflow-hidden rounded-lg border border-black/15 text-xs dark:border-white/15">
                {(["all", "any"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMatch(m)}
                    className={`px-3 py-1.5 transition ${match === m ? "bg-emerald-600 text-white" : "hover:bg-black/5 dark:hover:bg-white/5"}`}
                  >
                    {m === "all" ? "เข้าทุกเงื่อนไข (AND)" : "เข้าอย่างน้อยหนึ่ง (OR)"}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              {conds.map((c) => {
                const noValue = NO_VALUE_OPS.includes(c.op);
                return (
                  <div key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <select
                      value={c.col}
                      onChange={(e) => patchCond(c.id, { col: Number(e.target.value) })}
                      className="rounded border border-black/15 bg-transparent px-2 py-1.5 dark:border-white/15 dark:bg-neutral-900"
                    >
                      <option value={-1}>ทุกคอลัมน์</option>
                      {header.map((h, i) => (
                        <option key={i} value={i} title={columnOptionLabel(h, i)}>
                          {columnLetter(i)} · {h === null || String(h).trim() === "" ? "(ว่าง)" : String(h)}
                        </option>
                      ))}
                    </select>

                    <select
                      value={c.op}
                      onChange={(e) => patchCond(c.id, { op: e.target.value as FilterOp })}
                      className="rounded border border-black/15 bg-transparent px-2 py-1.5 dark:border-white/15 dark:bg-neutral-900"
                    >
                      {OPS.map((op) => (
                        <option key={op} value={op}>
                          {OP_LABEL[op]}
                        </option>
                      ))}
                    </select>

                    {!noValue && (
                      <input
                        value={c.value}
                        onChange={(e) => patchCond(c.id, { value: e.target.value })}
                        placeholder={NUMERIC_OPS.includes(c.op) ? "ตัวเลข..." : "ค่าที่จะเทียบ..."}
                        inputMode={NUMERIC_OPS.includes(c.op) ? "decimal" : "text"}
                        spellCheck={false}
                        className="min-w-[140px] flex-1 rounded border border-black/15 bg-transparent px-2 py-1.5 outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
                      />
                    )}

                    {!noValue && !NUMERIC_OPS.includes(c.op) && (
                      <label className="flex items-center gap-1 text-xs text-neutral-500" title="สนตัวพิมพ์เล็ก/ใหญ่">
                        <input
                          type="checkbox"
                          checked={!!c.caseSensitive}
                          onChange={(e) => patchCond(c.id, { caseSensitive: e.target.checked })}
                        />
                        Aa
                      </label>
                    )}

                    <button
                      onClick={() => removeCond(c.id)}
                      className="ml-auto rounded border border-black/15 px-2 py-1 text-xs text-neutral-500 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                    >
                      ลบ
                    </button>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => setConds((cur) => [...cur, newCond()])}
              className="rounded-md border border-dashed border-black/25 px-3 py-1.5 text-xs text-neutral-500 hover:bg-black/5 dark:border-white/25 dark:hover:bg-white/5"
            >
              + เพิ่มเงื่อนไข
            </button>
          </div>
        )}

        {/* STEP 3: ผลลัพธ์ */}
        {state && (
          <div className="rounded-xl border border-black/10 dark:border-white/10">
            <div className="flex flex-wrap items-center gap-2 border-b border-black/10 px-3 py-2 text-xs dark:border-white/10">
              <span className="rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                เจอ <span className="tabular-nums">{result.matched}</span> / {result.total} แถว
              </span>
              {result.matched > PREVIEW_ROWS && (
                <span className="text-neutral-400">แสดง {PREVIEW_ROWS} แถวแรก</span>
              )}
              <button
                onClick={dlCsv}
                disabled={result.matched === 0}
                className="ml-auto rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-40"
              >
                ↓ ดาวน์โหลดผลกรอง (CSV)
              </button>
            </div>

            <div className="max-h-[55vh] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-900">
                  <tr>
                    <th className="px-2 py-1.5">#</th>
                    {header.map((h, i) => (
                      <th key={i} className="px-2 py-1.5 whitespace-nowrap">
                        {h === null || String(h).trim() === "" ? columnLetter(i) : String(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shownRows.map((r, ri) => (
                    <tr key={ri} className="border-t border-black/5 dark:border-white/5">
                      <td className="px-2 py-1 text-right text-neutral-400 tabular-nums">{ri + 1}</td>
                      {header.map((_, ci) => (
                        <td key={ci} className="max-w-[200px] truncate whitespace-nowrap px-2 py-1">
                          {r[ci] === null || r[ci] === undefined ? "" : String(r[ci])}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {result.matched === 0 && (
                    <tr>
                      <td colSpan={header.length + 1} className="px-2 py-4 text-center text-neutral-400">
                        ไม่มีแถวที่ตรงเงื่อนไข
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

"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { defaultFields, guessColumns, guessHeaderRow } from "@/lib/reconcile/detect";
import { columnOptionLabel } from "@/lib/reconcile/columns";
import { downloadText } from "@/lib/reconcile/export";
import { findGaps, gapToCsv, GAP_KIND_LABEL } from "@/lib/reconcile/gap";
import type { GapCheck, GapKind, GapResult } from "@/lib/reconcile/gap";
import type { ParsedFile, Row, SideSelection } from "@/lib/reconcile/types";

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

function defaultChecks(): GapCheck[] {
  return defaultFields().map((f) => ({
    fieldId: f.id,
    label: f.label,
    col: -1,
    isKey: f.role === "key",
    numeric: f.numeric,
    // container มักว่างเป็นปกติ (ต่อแถว) → ปิดการตรวจไว้ก่อน กันสัญญาณลวง
    enabled: f.id !== "container",
  }));
}

const KIND_TAG: Record<GapKind, string> = {
  "missing-key": "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
  zero: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  blank: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  invalid: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  "dup-key": "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
};

export default function GapPage() {
  const [state, setState] = useState<FileState | null>(null);
  const [checks, setChecks] = useState<GapCheck[]>(() => defaultChecks());
  const [trimKey, setTrimKey] = useState(true);
  const [checkDupKey, setCheckDupKey] = useState(true);
  const [zeroIsProblem, setZeroIsProblem] = useState(true);
  const [blankIsProblem, setBlankIsProblem] = useState(true);
  const [result, setResult] = useState<GapResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"all" | GapKind>("all");

  const header = useMemo(() => headerRowOf(state), [state]);

  const remap = useCallback(
    (hdr: Row) => {
      setChecks((prev) => {
        const fields = prev.map((c) => ({
          id: c.fieldId,
          label: c.label,
          role: (c.isKey ? "key" : "compare") as "key" | "compare",
          numeric: c.numeric,
          tolerance: 0,
        }));
        const guessed = guessColumns(hdr, fields);
        return prev.map((c) => ({ ...c, col: guessed[c.fieldId] ?? -1 }));
      });
    },
    [],
  );

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setError(null);
      setResult(null);
      setBusy(true);
      try {
        const parsed = await parseFile(file);
        const sel = makeSelection(parsed, 0);
        setState({ file: parsed, sel });
        remap(parsed.sheets[sel.sheetIndex]?.rows[sel.headerRow] ?? []);
      } catch (e) {
        setError(`อ่านไฟล์ ${file.name} ไม่สำเร็จ: ${(e as Error).message}`);
      } finally {
        setBusy(false);
      }
    },
    [remap],
  );

  const updateSel = useCallback(
    (patch: Partial<SideSelection>) => {
      setState((cur) => {
        if (!cur) return cur;
        const nextSel = { ...cur.sel, ...patch };
        const next = { ...cur, sel: nextSel };
        if (patch.sheetIndex !== undefined || patch.headerRow !== undefined) {
          const hdr = next.file.sheets[nextSel.sheetIndex]?.rows[nextSel.headerRow] ?? [];
          remap(hdr);
        }
        return next;
      });
    },
    [remap],
  );

  const setCheck = (id: string, patch: Partial<GapCheck>) =>
    setChecks((prev) => prev.map((c) => (c.fieldId === id ? { ...c, ...patch } : c)));

  const run = () => {
    setError(null);
    if (!state) return;
    const anyEnabled = checks.some((c) => c.enabled && c.col >= 0);
    if (!anyEnabled) {
      setError("เลือกอย่างน้อย 1 ฟิลด์ที่จะตรวจ และ map คอลัมน์ให้เรียบร้อยก่อน");
      return;
    }
    const base = state.sel.dataStart + 1; // เลขแถว 1-based ของแถวข้อมูลแรก
    const res = findGaps(dataRowsOf(state), checks, {
      trimKey,
      checkDupKey,
      zeroIsProblem,
      blankIsProblem,
      rowNumberBase: base,
    });
    setResult(res);
    setFilter("all");
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">Gap Finder — จับข้อมูลหาย/เป็น 0</h1>
          <p className="text-xs text-neutral-500">
            อัปโหลดไฟล์เดียว (เช่น export จาก MOMO) แล้วหาแถวที่ tracking หาย / น้ำหนัก-คิว เป็น 0 / คีย์ซ้ำ
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
            <h2 className="text-sm font-semibold">ไฟล์ที่จะตรวจ</h2>
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

          <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-black/20 px-3 py-4 text-sm text-neutral-500 hover:border-black/40 dark:border-white/20">
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.tsv,.txt"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            {busy ? "กำลังอ่าน..." : state ? `เปลี่ยนไฟล์ — ${state.file.fileName}` : "เลือกไฟล์ (.xlsx / .csv)"}
          </label>

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
                        <tr
                          key={ri}
                          className={isHeader ? "bg-black/5 font-medium dark:bg-white/10" : isBefore ? "text-neutral-400" : ""}
                        >
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

        {/* STEP 2: เลือกฟิลด์ที่จะตรวจ */}
        {state && (
          <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
            <h2 className="mb-3 text-sm font-semibold">เลือกฟิลด์ที่จะตรวจ</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-neutral-500">
                    <th className="py-1 pr-3">ตรวจ?</th>
                    <th className="py-1 pr-3">ฟิลด์</th>
                    <th className="py-1 pr-3">ชนิด</th>
                    <th className="py-1 pr-3">คอลัมน์</th>
                  </tr>
                </thead>
                <tbody>
                  {checks.map((c) => (
                    <tr key={c.fieldId} className="border-t border-black/5 dark:border-white/5">
                      <td className="py-2 pr-3 text-center">
                        <input type="checkbox" checked={c.enabled} onChange={(e) => setCheck(c.fieldId, { enabled: e.target.checked })} />
                      </td>
                      <td className="py-2 pr-3">
                        <span className="font-medium">{c.label}</span>
                        {c.isKey && <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">key</span>}
                      </td>
                      <td className="py-2 pr-3 text-xs text-neutral-500">
                        {c.isKey ? "หา tracking ที่หาย + ซ้ำ" : c.numeric ? "หาค่า 0 / ว่าง" : "หาค่าว่าง"}
                      </td>
                      <td className="py-2 pr-3">
                        <select
                          value={c.col}
                          onChange={(e) => setCheck(c.fieldId, { col: Number(e.target.value) })}
                          className="w-56 rounded border border-black/15 bg-transparent px-2 py-1 text-sm outline-none dark:border-white/15 dark:bg-neutral-900"
                        >
                          <option value={-1}>— ไม่ใช้ —</option>
                          {header.map((h, i) => (
                            <option key={i} value={i}>
                              {columnOptionLabel(h, i)}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={zeroIsProblem} onChange={(e) => setZeroIsProblem(e.target.checked)} />
                นับ 0 เป็นปัญหา
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={blankIsProblem} onChange={(e) => setBlankIsProblem(e.target.checked)} />
                นับค่าว่างเป็นปัญหา
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={checkDupKey} onChange={(e) => setCheckDupKey(e.target.checked)} />
                ตรวจ tracking ซ้ำ
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={trimKey} onChange={(e) => setTrimKey(e.target.checked)} />
                ตัดช่องว่างหน้า/หลังคีย์
              </label>
              <button
                onClick={run}
                className="ml-auto rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition disabled:opacity-40 dark:bg-white dark:text-black"
              >
                ตรวจหาข้อมูลหาย
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: ผลลัพธ์ */}
        {result && <GapResultView result={result} filter={filter} setFilter={setFilter} />}
      </section>
    </main>
  );
}

function GapResultView({
  result,
  filter,
  setFilter,
}: {
  result: GapResult;
  filter: "all" | GapKind;
  setFilter: (f: "all" | GapKind) => void;
}) {
  const s = result.summary;
  const kinds: GapKind[] = ["missing-key", "zero", "blank", "invalid", "dup-key"];
  const compareChecks = result.checks.filter((c) => !c.isKey);

  const visibleRows = useMemo(() => {
    if (filter === "all") return result.rows;
    return result.rows.filter((r) => r.flags.some((f) => f.kind === filter));
  }, [result, filter]);

  const okRatio = s.totalRows > 0 ? Math.round((s.cleanRows / s.totalRows) * 100) : 0;

  return (
    <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setFilter("all")}
          className={`rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 ${filter === "all" ? "ring-2 ring-black/30 dark:ring-white/40" : ""}`}
        >
          มีปัญหา · {s.problemRows}
        </button>
        {kinds.map((k) => {
          const n = s.byKind[k];
          if (n === 0) return null;
          return (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${KIND_TAG[k]} ${filter === k ? "ring-2 ring-black/30 dark:ring-white/40" : ""}`}
            >
              {GAP_KIND_LABEL[k]} · {n}
            </button>
          );
        })}
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
          สะอาด · {s.cleanRows}
        </span>
        <span className="text-xs text-neutral-500">
          จากทั้งหมด {s.totalRows} แถว ({okRatio}% สะอาด)
        </span>
        <button
          onClick={() => downloadText("gap-finder.csv", gapToCsv(result), "text/csv")}
          className="ml-auto rounded-md border border-black/15 px-3 py-1 text-xs hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
        >
          ↓ CSV (เฉพาะแถวมีปัญหา)
        </button>
      </div>

      {s.problemRows === 0 ? (
        <p className="rounded-md bg-emerald-50 px-3 py-6 text-center text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
          ไม่พบข้อมูลหาย/เป็น 0 ในฟิลด์ที่ตรวจ — ไฟล์นี้สะอาด ✓
        </p>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between text-xs text-neutral-500">
            <span>แสดง {visibleRows.length} แถว{filter !== "all" ? ` (กรอง: ${GAP_KIND_LABEL[filter]})` : ""}</span>
            <span className="text-neutral-400">เลื่อนในตารางเพื่อดูแถวอื่น ↕</span>
          </div>
          <div className="max-h-[65vh] overflow-auto rounded-lg border border-black/10 dark:border-white/10">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-neutral-50 shadow-[0_1px_0_rgba(0,0,0,0.08)] dark:bg-neutral-900">
                <tr className="text-left text-xs text-neutral-500">
                  <th className="px-2 py-2">แถวที่</th>
                  <th className="px-2 py-2">{result.keyFieldLabel}</th>
                  {compareChecks.map((c) => (
                    <th key={c.fieldId} className="px-2 py-2">
                      {c.label}
                    </th>
                  ))}
                  <th className="px-2 py-2">ปัญหา</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => {
                  const flagOf = (fid: string) => r.flags.find((f) => f.fieldId === fid);
                  const keyFlag = result.keyFieldId ? flagOf(result.keyFieldId) : undefined;
                  return (
                    <tr key={r.rowNumber} className="border-t border-black/5 dark:border-white/5">
                      <td className="px-2 py-1 text-xs text-neutral-500">{r.rowNumber}</td>
                      <td className={`px-2 py-1 font-mono text-xs ${keyFlag ? "text-rose-600 dark:text-rose-400" : ""}`}>
                        {r.key || <span className="italic text-rose-500">(ว่าง)</span>}
                      </td>
                      {compareChecks.map((c) => {
                        const fl = flagOf(c.fieldId);
                        const v = r.values[c.fieldId];
                        return (
                          <td key={c.fieldId} className={`px-2 py-1 text-xs ${fl ? "font-semibold text-amber-700 dark:text-amber-300" : ""}`}>
                            {v === null || v === undefined || String(v).trim() === "" ? (fl ? <span className="italic">(ว่าง)</span> : "") : String(v)}
                          </td>
                        );
                      })}
                      <td className="px-2 py-1">
                        <div className="flex flex-wrap gap-1">
                          {r.flags.map((f, fi) => (
                            <span key={fi} className={`rounded px-1.5 py-0.5 text-[10px] ${KIND_TAG[f.kind]}`}>
                              {GAP_KIND_LABEL[f.kind]}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

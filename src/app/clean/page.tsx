"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { defaultFields, guessColumns, guessHeaderRow } from "@/lib/reconcile/detect";
import { columnOptionLabel } from "@/lib/reconcile/columns";
import { downloadText } from "@/lib/reconcile/export";
import FileDropzone from "@/components/FileDropzone";
import {
  findCleanResult,
  cleanToCsv,
  CLEAN_KIND_LABEL,
  type CleanChangeKind,
  type CleanResult,
} from "@/lib/clean/clean";
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

function cellText(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

const KIND_TAG: Record<CleanChangeKind, string> = {
  trim: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  collapse: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
  number: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  key: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
};

export default function CleanPage() {
  const [state, setState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // operations
  const [trim, setTrim] = useState(true);
  const [collapseSpaces, setCollapseSpaces] = useState(true);
  const [dropEmptyRows, setDropEmptyRows] = useState(true);
  const [normalizeNumbers, setNormalizeNumbers] = useState(true);
  const [normalizeKey, setNormalizeKey] = useState(true);
  // ลบแถวซ้ำ = ปิด default: packing list ปกติ 1 tracking แตกได้หลายกล่อง (หลายแถว) → ลบทิ้ง = ข้อมูลหาย
  const [dedupByKey, setDedupByKey] = useState(false);

  const [keyCol, setKeyCol] = useState<number>(-1);
  const [numberCols, setNumberCols] = useState<number[]>([]);

  const [result, setResult] = useState<CleanResult | null>(null);

  const header = useMemo(() => headerRowOf(state), [state]);

  const autoDetect = useCallback((hdr: Row) => {
    const fields = defaultFields();
    const guessed = guessColumns(hdr, fields);
    setKeyCol(guessed.tracking ?? -1);
    const nums = ["weight", "cbm", "parcel"].map((id) => guessed[id]).filter((i) => i >= 0);
    setNumberCols(Array.from(new Set(nums)));
  }, []);

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
        autoDetect(parsed.sheets[sel.sheetIndex]?.rows[sel.headerRow] ?? []);
      } catch (e) {
        setError(`อ่านไฟล์ ${file.name} ไม่สำเร็จ: ${(e as Error).message}`);
      } finally {
        setBusy(false);
      }
    },
    [autoDetect],
  );

  const updateSel = useCallback(
    (patch: Partial<SideSelection>) => {
      setState((cur) => {
        if (!cur) return cur;
        const nextSel = { ...cur.sel, ...patch };
        const next = { ...cur, sel: nextSel };
        if (patch.headerRow !== undefined) {
          autoDetect(next.file.sheets[nextSel.sheetIndex]?.rows[nextSel.headerRow] ?? []);
        }
        return next;
      });
      setResult(null);
    },
    [autoDetect],
  );

  const toggleNumberCol = (i: number) =>
    setNumberCols((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));

  const run = () => {
    setError(null);
    if (!state) return;
    const base = state.sel.dataStart + 1;
    const res = findCleanResult(dataRowsOf(state), {
      trim,
      collapseSpaces,
      dropEmptyRows,
      normalizeNumbers,
      numberCols,
      normalizeKey,
      keyCol,
      dedupByKey,
      rowNumberBase: base,
    });
    setResult(res);
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];

  const exportCsv = () => {
    if (!result) return;
    const csv = cleanToCsv(header, result.rows);
    downloadText(`cleaned-${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv");
  };

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">Data Cleaner — จัดระเบียบข้อมูลก่อนเข้า Pacred</h1>
          <p className="text-xs text-neutral-500">
            อัปโหลดไฟล์ → ตัดช่องว่าง / จัดรูปตัวเลข / normalize tracking / ลบแถวว่าง → ดาวน์โหลดข้อมูลที่สะอาด
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
            <h2 className="text-sm font-semibold">ไฟล์ที่จะจัดระเบียบ</h2>
            {state && (
              <span
                className={`rounded px-2 py-0.5 text-[11px] ${
                  state.file.via === "xlsx-repair"
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                    : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800"
                }`}
              >
                {state.file.via === "xlsx-repair" ? "ซ่อมไฟล์เพี้ยนแล้ว" : state.file.via.toUpperCase()}
              </span>
            )}
          </div>
          <FileDropzone
            onFile={handleFile}
            accept=".xlsx,.xls,.csv,.tsv,.txt"
            busy={busy}
            label={state ? `เปลี่ยนไฟล์ — ${state.file.fileName}` : "ลากไฟล์มาวาง หรือคลิกเลือก (.xlsx / .csv)"}
          />
        </div>

        {state && (
          <>
            {/* STEP 2: เลือกแถว header + preview */}
            <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <h2 className="text-sm font-semibold">แถวหัวตาราง</h2>
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-neutral-500">แถวที่</span>
                  <input
                    type="number"
                    min={0}
                    value={state.sel.headerRow}
                    onChange={(e) => updateSel({ headerRow: Math.max(0, Number(e.target.value)), dataStart: Math.max(0, Number(e.target.value)) + 1 })}
                    className="w-16 rounded border border-black/15 bg-transparent px-2 py-1 dark:border-white/15"
                  />
                </label>
                <span className="text-xs text-neutral-400">(ข้อมูลเริ่มแถวถัดไป)</span>
              </div>
              <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
                <table className="w-full min-w-[640px] border-collapse text-xs">
                  <tbody>
                    {preview.map((r, ri) => (
                      <tr
                        key={ri}
                        className={ri === state.sel.headerRow ? "bg-emerald-50 font-medium dark:bg-emerald-950/30" : ""}
                      >
                        <td className="border border-black/5 px-2 py-1 text-neutral-400 dark:border-white/5">{ri}</td>
                        {r.slice(0, 12).map((c, ci) => (
                          <td key={ci} className="border border-black/5 px-2 py-1 dark:border-white/5">
                            {cellText(c)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* STEP 3: เลือก operations */}
            <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
              <h2 className="mb-3 text-sm font-semibold">สิ่งที่จะจัดระเบียบ</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                <Toggle checked={trim} onChange={setTrim} label="ตัดช่องว่างหน้า-หลัง (trim)" />
                <Toggle checked={collapseSpaces} onChange={setCollapseSpaces} label="ยุบช่องว่างซ้ำให้เหลือช่องเดียว" />
                <Toggle checked={dropEmptyRows} onChange={setDropEmptyRows} label="ลบแถวที่ว่างทั้งแถว" />
                <Toggle checked={normalizeNumbers} onChange={setNormalizeNumbers} label="จัดรูปตัวเลข (ลบ comma แล้วแปลงเป็นเลข)" />
                <Toggle checked={normalizeKey} onChange={setNormalizeKey} label="normalize tracking (ตัดช่องว่าง + พิมพ์ใหญ่)" />
                <Toggle
                  checked={dedupByKey}
                  onChange={setDedupByKey}
                  label="ลบแถวซ้ำตาม tracking"
                  hint="ระวัง: packing list ปกติ 1 tracking มีได้หลายกล่อง/หลายแถว — เปิดเฉพาะไฟล์ 1 tracking/แถว"
                />
              </div>

              {/* เลือกคอลัมน์ key + ตัวเลข */}
              <div className="mt-4 space-y-3 border-t border-black/5 pt-4 dark:border-white/5">
                <label className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-28 text-neutral-500">คอลัมน์ tracking</span>
                  <select
                    value={keyCol}
                    onChange={(e) => setKeyCol(Number(e.target.value))}
                    className="rounded-md border border-black/15 bg-transparent px-2 py-1 text-sm outline-none dark:border-white/15"
                  >
                    <option value={-1} className="text-black">— ไม่มี —</option>
                    {header.map((h, i) => (
                      <option key={i} value={i} className="text-black">
                        {columnOptionLabel(h, i)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="text-sm">
                  <div className="mb-1.5 text-neutral-500">คอลัมน์ที่เป็นตัวเลข (คลิกเพื่อเปิด/ปิด)</div>
                  <div className="flex flex-wrap gap-1.5">
                    {header.map((h, i) => {
                      const on = numberCols.includes(i);
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => toggleNumberCol(i)}
                          className={`rounded-full border px-2.5 py-1 text-xs transition ${
                            on
                              ? "border-amber-400 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                              : "border-black/15 text-neutral-500 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
                          }`}
                        >
                          {columnOptionLabel(h, i)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={run}
                className="mt-4 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
              >
                จัดระเบียบข้อมูล
              </button>
            </div>

            {result && <CleanResultView result={result} header={header} onExport={exportCsv} />}
          </>
        )}
      </section>
    </main>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-black/5 p-2.5 text-sm transition hover:bg-black/[0.02] dark:border-white/5 dark:hover:bg-white/[0.02]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5" />
      <span>
        {label}
        {hint && <span className="mt-0.5 block text-[11px] text-neutral-400">{hint}</span>}
      </span>
    </label>
  );
}

function CleanResultView({
  result,
  header,
  onExport,
}: {
  result: CleanResult;
  header: Row;
  onExport: () => void;
}) {
  const { stats, rows, changes } = result;
  const kinds = (Object.keys(CLEAN_KIND_LABEL) as CleanChangeKind[]).filter((k) => stats.byKind[k] > 0);
  const previewRows = rows.slice(0, 60);
  const colCount = Math.min(header.length || (rows[0]?.length ?? 0), 12);

  return (
    <div className="space-y-4">
      {/* สรุป */}
      <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-semibold">
            {stats.inputRows} แถว → <span className="text-emerald-600 dark:text-emerald-400">{stats.outputRows} แถว</span>
          </span>
          {stats.droppedEmpty > 0 && <Chip label={`ลบแถวว่าง ${stats.droppedEmpty}`} />}
          {stats.droppedDup > 0 && <Chip label={`ลบซ้ำ ${stats.droppedDup}`} />}
          <Chip label={`แก้ค่า ${stats.cellsChanged} ช่อง`} accent />
        </div>
        {kinds.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {kinds.map((k) => (
              <span key={k} className={`rounded-full px-2.5 py-0.5 text-xs ${KIND_TAG[k]}`}>
                {CLEAN_KIND_LABEL[k]} · {stats.byKind[k]}
              </span>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={onExport}
          className="mt-4 rounded-lg border border-black/15 px-4 py-2 text-sm font-medium transition hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
        >
          ดาวน์โหลด CSV ที่สะอาด
        </button>
      </div>

      {/* ตัวอย่างข้อมูลหลัง clean */}
      <div>
        <div className="mb-2 text-xs text-neutral-500">
          ตัวอย่างข้อมูลหลังจัดระเบียบ (แสดง {previewRows.length} จาก {rows.length} แถว)
        </div>
        <div className="max-h-[55vh] overflow-auto rounded-lg border border-black/10 dark:border-white/10">
          <table className="w-full min-w-[640px] border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-neutral-50 shadow-[0_1px_0_rgba(0,0,0,0.08)] dark:bg-neutral-900">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium text-neutral-400">#</th>
                {header.slice(0, colCount).map((h, i) => (
                  <th key={i} className="px-2 py-1.5 text-left font-medium">
                    {cellText(h) || columnOptionLabel(h, i)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((r, ri) => (
                <tr key={ri} className="border-t border-black/5 dark:border-white/5">
                  <td className="px-2 py-1 text-neutral-400">{ri + 1}</td>
                  {r.slice(0, colCount).map((c, ci) => (
                    <td key={ci} className="px-2 py-1">
                      {cellText(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ตัวอย่างการแก้ */}
      {changes.length > 0 && (
        <details className="rounded-xl border border-black/10 p-4 dark:border-white/10">
          <summary className="cursor-pointer text-sm font-medium">
            ดูตัวอย่างการแก้ ({changes.length} รายการแรก)
          </summary>
          <div className="mt-3 max-h-[45vh] overflow-auto">
            <table className="w-full border-collapse text-xs">
              <thead className="text-left text-neutral-500">
                <tr>
                  <th className="px-2 py-1 font-medium">แถว</th>
                  <th className="px-2 py-1 font-medium">คอลัมน์</th>
                  <th className="px-2 py-1 font-medium">ก่อน</th>
                  <th className="px-2 py-1 font-medium">หลัง</th>
                  <th className="px-2 py-1 font-medium">ชนิด</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((c, i) => (
                  <tr key={i} className="border-t border-black/5 dark:border-white/5">
                    <td className="px-2 py-1 text-neutral-400">{c.rowLabel}</td>
                    <td className="px-2 py-1">{columnOptionLabel(header[c.col], c.col)}</td>
                    <td className="px-2 py-1 text-rose-600 dark:text-rose-400">
                      <code className="whitespace-pre-wrap">{JSON.stringify(c.before)}</code>
                    </td>
                    <td className="px-2 py-1 text-emerald-600 dark:text-emerald-400">
                      <code className="whitespace-pre-wrap">{JSON.stringify(c.after)}</code>
                    </td>
                    <td className="px-2 py-1">
                      <span className={`rounded-full px-2 py-0.5 ${KIND_TAG[c.kind]}`}>{CLEAN_KIND_LABEL[c.kind]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

function Chip({ label, accent }: { label: string; accent?: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs ${
        accent
          ? "bg-neutral-900 text-white dark:bg-white dark:text-black"
          : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
      }`}
    >
      {label}
    </span>
  );
}

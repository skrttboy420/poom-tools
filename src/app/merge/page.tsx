"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { downloadText, downloadBlob } from "@/lib/reconcile/export";
import { rowsToCsv, rowsToXlsx, changeExt } from "@/lib/convertfile/convertfile";
import {
  mergeFiles,
  mergeToRows,
  MERGE_MODE_LABEL,
  type MergeMode,
  type MergeResult,
} from "@/lib/merge/merge";
import FileDropzone from "@/components/FileDropzone";
import type { ParsedFile, Row, SideSelection } from "@/lib/reconcile/types";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PREVIEW_ROWS = 20;
const PREVIEW_COLS = 12;

interface FileState {
  id: number;
  file: ParsedFile;
  sel: SideSelection;
}

let uid = 0;

function makeSelection(file: ParsedFile, sheetIndex = 0): SideSelection {
  const rows = file.sheets[sheetIndex]?.rows ?? [];
  const headerRow = guessHeaderRow(rows);
  return { sheetIndex, headerRow, dataStart: headerRow + 1, dataEnd: null };
}

function headerRowOf(s: FileState): Row {
  return s.file.sheets[s.sel.sheetIndex]?.rows[s.sel.headerRow] ?? [];
}

function dataRowsOf(s: FileState): Row[] {
  const rows = s.file.sheets[s.sel.sheetIndex]?.rows ?? [];
  return rows.slice(s.sel.dataStart, s.sel.dataEnd ?? undefined);
}

export default function MergePage() {
  const [files, setFiles] = useState<FileState[]>([]);
  const [mode, setMode] = useState<MergeMode>("by-header");
  const [addSource, setAddSource] = useState(false);
  const [result, setResult] = useState<MergeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleFiles = useCallback(async (incoming: File[]) => {
    if (incoming.length === 0) return;
    setError(null);
    setResult(null);
    setBusy(true);
    const added: FileState[] = [];
    const failed: string[] = [];
    for (const f of incoming) {
      try {
        const parsed = await parseFile(f);
        added.push({ id: uid++, file: parsed, sel: makeSelection(parsed, 0) });
      } catch (e) {
        failed.push(`${f.name}: ${(e as Error).message}`);
      }
    }
    if (added.length) setFiles((cur) => [...cur, ...added]);
    if (failed.length) setError(`อ่านบางไฟล์ไม่สำเร็จ — ${failed.join(" · ")}`);
    setBusy(false);
  }, []);

  const updateFile = useCallback((id: number, patch: Partial<SideSelection>) => {
    setFiles((cur) =>
      cur.map((f) => {
        if (f.id !== id) return f;
        const nextSel = { ...f.sel, ...patch };
        // เปลี่ยนชีต → เดาแถวหัวตารางใหม่
        if (patch.sheetIndex !== undefined && patch.headerRow === undefined) {
          const rows = f.file.sheets[nextSel.sheetIndex]?.rows ?? [];
          const h = guessHeaderRow(rows);
          nextSel.headerRow = h;
          nextSel.dataStart = h + 1;
        }
        return { ...f, sel: nextSel };
      }),
    );
    setResult(null);
  }, []);

  const removeFile = useCallback((id: number) => {
    setFiles((cur) => cur.filter((f) => f.id !== id));
    setResult(null);
  }, []);

  const clearAll = () => {
    setFiles([]);
    setResult(null);
    setError(null);
  };

  const totalDataRows = useMemo(() => files.reduce((s, f) => s + dataRowsOf(f).length, 0), [files]);

  const run = () => {
    setError(null);
    if (files.length < 2) {
      setError("ใส่อย่างน้อย 2 ไฟล์ถึงจะรวมได้");
      return;
    }
    const inputs = files.map((f) => ({
      name: f.file.fileName,
      header: headerRowOf(f),
      rows: dataRowsOf(f),
    }));
    const res = mergeFiles(inputs, { mode, addSource });
    if (res.rows.length === 0) {
      setError("ไม่มีแถวข้อมูลให้รวม (เช็คแถวหัวตารางของแต่ละไฟล์)");
      return;
    }
    setResult(res);
  };

  const baseName = files[0]?.file.fileName ?? "merged";

  const dlXlsx = () => {
    if (!result) return;
    downloadBlob(changeExt(baseName, "xlsx", "-รวม"), rowsToXlsx(mergeToRows(result), "รวม"), XLSX_MIME);
  };
  const dlCsv = () => {
    if (!result) return;
    downloadText(changeExt(baseName, "csv", "-รวม"), rowsToCsv(mergeToRows(result)), "text/csv");
  };

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">รวมหลายไฟล์ Excel 🧩</h1>
          <p className="text-xs text-neutral-500">
            รวมหลายไฟล์/หลายชีต (ฟอร์แมตเดียวกัน) เป็นไฟล์เดียว — <b>จับคอลัมน์ตามชื่อหัวตาราง</b> กันสลับ · ทุกแถวไม่หาย
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

        {/* STEP 1: อัปโหลดหลายไฟล์ */}
        <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">ไฟล์ที่จะรวม</h2>
            {files.length > 0 && (
              <button onClick={clearAll} className="text-xs text-neutral-500 hover:underline">
                ล้างทั้งหมด
              </button>
            )}
          </div>

          <FileDropzone
            multiple
            onFiles={handleFiles}
            accept=".xlsx,.xls,.csv,.tsv,.txt"
            busy={busy}
            label={
              files.length
                ? `เพิ่มไฟล์อีก (ตอนนี้ ${files.length} ไฟล์ · ${totalDataRows} แถว)`
                : "ลากหลายไฟล์มาวางพร้อมกัน หรือคลิกเลือก (.xlsx / .csv)"
            }
          />

          {files.length > 0 && (
            <div className="mt-3 space-y-2">
              {files.map((f, idx) => {
                const sheet = f.file.sheets[f.sel.sheetIndex];
                const cols = headerRowOf(f).length;
                const dataRows = dataRowsOf(f).length;
                return (
                  <div
                    key={f.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-black/10 px-3 py-2 text-xs dark:border-white/10"
                  >
                    <span className="shrink-0 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500 dark:bg-neutral-800">
                      {idx + 1}
                    </span>
                    <span className="max-w-[240px] truncate font-medium" title={f.file.fileName}>
                      {f.file.fileName}
                    </span>
                    {f.file.via === "xlsx-repair" && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                        ซ่อมแล้ว
                      </span>
                    )}
                    {f.file.sheets.length > 1 && (
                      <label className="flex items-center gap-1">
                        ชีต:
                        <select
                          value={f.sel.sheetIndex}
                          onChange={(e) => updateFile(f.id, { sheetIndex: Number(e.target.value) })}
                          className="rounded border border-black/15 bg-transparent px-1 py-0.5 dark:border-white/15 dark:bg-neutral-900"
                        >
                          {f.file.sheets.map((s, i) => (
                            <option key={i} value={i}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label className="flex items-center gap-1">
                      หัวตารางแถว:
                      <input
                        type="number"
                        min={0}
                        value={f.sel.headerRow}
                        onChange={(e) => {
                          const h = Math.max(0, Number(e.target.value) || 0);
                          updateFile(f.id, { headerRow: h, dataStart: h + 1 });
                        }}
                        className="w-14 rounded border border-black/15 bg-transparent px-1 py-0.5 dark:border-white/15"
                      />
                    </label>
                    <span className="text-neutral-400">
                      {cols} คอลัมน์ · {dataRows} แถว
                      {sheet ? "" : " (ชีตว่าง)"}
                    </span>
                    <button
                      onClick={() => removeFile(f.id)}
                      className="ml-auto shrink-0 rounded border border-black/15 px-2 py-0.5 text-neutral-500 hover:bg-red-50 hover:text-red-600 dark:border-white/15 dark:hover:bg-red-950/30"
                      title="เอาไฟล์นี้ออก"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* STEP 2: ตั้งค่าการรวม */}
        {files.length > 0 && (
          <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
            <h2 className="mb-3 text-sm font-semibold">รวมแบบไหน</h2>
            <div className="flex flex-wrap gap-2">
              {(["by-header", "by-position"] as MergeMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMode(m);
                    setResult(null);
                  }}
                  className={`rounded-full border px-4 py-1.5 text-sm transition ${
                    mode === m
                      ? "border-transparent bg-neutral-900 text-white dark:bg-white dark:text-black"
                      : "border-black/15 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
                  }`}
                >
                  {MERGE_MODE_LABEL[m]}
                </button>
              ))}
            </div>

            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={addSource}
                onChange={(e) => {
                  setAddSource(e.target.checked);
                  setResult(null);
                }}
              />
              เพิ่มคอลัมน์ &quot;ไฟล์ต้นทาง&quot; (บอกว่าแต่ละแถวมาจากไฟล์ไหน)
            </label>

            <div className="mt-4 flex justify-end">
              <button
                onClick={run}
                className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition dark:bg-white dark:text-black"
              >
                รวมไฟล์ ({files.length})
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: ผลลัพธ์ */}
        {result && <MergeResultView result={result} onXlsx={dlXlsx} onCsv={dlCsv} />}
      </section>
    </main>
  );
}

function MergeResultView({
  result,
  onXlsx,
  onCsv,
}: {
  result: MergeResult;
  onXlsx: () => void;
  onCsv: () => void;
}) {
  const s = result.stats;
  const lossless = s.outputRows === s.inputRows;
  const previewRows = result.rows.slice(0, PREVIEW_ROWS);

  return (
    <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <Chip label="ไฟล์" value={s.files} />
        <Chip label="แถวเข้ารวม" value={s.inputRows} />
        <Chip label="แถวออก" value={s.outputRows} tone={lossless ? "ok" : "warn"} />
        <Chip label="คอลัมน์" value={s.columns} />
        {s.addedColumns > 0 && <Chip label="คอลัมน์เพิ่ม" value={s.addedColumns} tone="warn" />}
        <div className="ml-auto flex gap-2">
          <button
            onClick={onXlsx}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700"
          >
            ↓ ดาวน์โหลด Excel
          </button>
          <button
            onClick={onCsv}
            className="rounded-md border border-black/15 px-3 py-1.5 text-xs hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
          >
            ↓ CSV
          </button>
        </div>
      </div>

      {s.addedColumns > 0 && (
        <p className="mb-2 rounded-md bg-orange-50 px-3 py-2 text-[11px] text-orange-700 dark:bg-orange-950/30 dark:text-orange-300">
          มี {s.addedColumns} คอลัมน์ที่ไฟล์แรกไม่มี — บางไฟล์หัวตารางไม่ตรงกัน (ระบบเติมช่องว่างให้ ไม่ทำข้อมูลเลื่อน)
        </p>
      )}

      <div className="mb-2 text-xs text-neutral-500">
        ตัวอย่าง {previewRows.length} แถวแรก จากทั้งหมด {s.outputRows} แถว
      </div>
      <div className="max-h-[60vh] overflow-auto rounded border border-black/10 dark:border-white/10">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-neutral-50 dark:bg-neutral-900">
            <tr>
              <th className="border-r border-black/10 px-1 text-right text-neutral-400 dark:border-white/10">#</th>
              {result.header.slice(0, PREVIEW_COLS).map((h, ci) => (
                <th key={ci} className="max-w-[140px] truncate whitespace-nowrap px-1 text-left font-medium">
                  {h === null ? "" : String(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((r, ri) => (
              <tr key={ri} className="border-t border-black/5 dark:border-white/5">
                <td className="border-r border-black/10 px-1 text-right text-neutral-400 dark:border-white/10">{ri + 1}</td>
                {Array.from({ length: Math.min(result.header.length, PREVIEW_COLS) }, (_, ci) => (
                  <td key={ci} className="max-w-[140px] truncate whitespace-nowrap px-1">
                    {r[ci] === null || r[ci] === undefined ? "" : String(r[ci])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Chip({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" }) {
  const toneCls =
    tone === "ok"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
      : tone === "warn"
        ? "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300"
        : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400";
  return (
    <span className={`rounded-full px-3 py-1 font-medium ${toneCls}`}>
      {label}: <span className="tabular-nums">{value}</span>
    </span>
  );
}

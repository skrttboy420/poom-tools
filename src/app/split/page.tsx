"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { defaultFields, guessColumns, guessHeaderRow } from "@/lib/reconcile/detect";
import { columnOptionLabel, columnLetter } from "@/lib/reconcile/columns";
import { downloadText, downloadBlob } from "@/lib/reconcile/export";
import { rowsToCsv, sheetsToXlsx, changeExt } from "@/lib/convertfile/convertfile";
import {
  splitByColumn,
  splitByRows,
  groupsToSheets,
  SPLIT_MODE_LABEL,
  type SplitMode,
  type SplitResult,
} from "@/lib/split/split";
import FileDropzone from "@/components/FileDropzone";
import type { ParsedFile, Row, SideSelection } from "@/lib/reconcile/types";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const GROUP_CAP = 200; // แสดงกลุ่มไม่เกินเท่านี้กัน UI หน่วง

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

// เดาคอลัมน์สำหรับแยก: container ก่อน (ตรงกับ use-case แยกตามตู้) แล้วค่อย tracking
function guessSplitCol(header: Row): number {
  const guessed = guessColumns(header, defaultFields());
  const c = guessed["container"];
  if (c !== undefined && c >= 0) return c;
  const t = guessed["tracking"];
  if (t !== undefined && t >= 0) return t;
  return 0;
}

export default function SplitPage() {
  const [state, setState] = useState<FileState | null>(null);
  const [mode, setMode] = useState<SplitMode>("by-column");
  const [splitCol, setSplitCol] = useState(0);
  const [chunk, setChunk] = useState(100);
  const [result, setResult] = useState<SplitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const header = useMemo(() => headerRowOf(state), [state]);

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const parsed = await parseFile(file);
      const sel = makeSelection(parsed, 0);
      setState({ file: parsed, sel });
      setSplitCol(guessSplitCol(parsed.sheets[sel.sheetIndex]?.rows[sel.headerRow] ?? []));
    } catch (e) {
      setError(`อ่านไฟล์ ${file.name} ไม่สำเร็จ: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const updateSel = useCallback((patch: Partial<SideSelection>) => {
    setState((cur) => {
      if (!cur) return cur;
      const nextSel = { ...cur.sel, ...patch };
      const next = { ...cur, sel: nextSel };
      if (patch.sheetIndex !== undefined || patch.headerRow !== undefined) {
        setSplitCol(guessSplitCol(next.file.sheets[nextSel.sheetIndex]?.rows[nextSel.headerRow] ?? []));
      }
      return next;
    });
    setResult(null);
  }, []);

  const run = () => {
    setError(null);
    if (!state) return;
    const data = dataRowsOf(state);
    if (data.length === 0) {
      setError("ไม่มีแถวข้อมูลให้แยก (เช็คแถวหัวตาราง)");
      return;
    }
    const res =
      mode === "by-column"
        ? splitByColumn(header, data, splitCol, { trim: true })
        : splitByRows(header, data, chunk);
    setResult(res);
  };

  const baseName = state?.file.fileName ?? "split";

  const dlAllXlsx = () => {
    if (!result) return;
    downloadBlob(changeExt(baseName, "xlsx", "-แยกกลุ่ม"), sheetsToXlsx(groupsToSheets(result)), XLSX_MIME);
  };

  const dlGroupCsv = (key: string, rows: Row[]) => {
    if (!result) return;
    downloadText(changeExt(baseName, "csv", `-${safeName(key)}`), rowsToCsv([result.header, ...rows]), "text/csv");
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">แยกไฟล์ Excel ✂️</h1>
          <p className="text-xs text-neutral-500">
            แยกไฟล์เดียวเป็นหลายกลุ่ม — <b>ตามค่าคอลัมน์</b> (เช่น แยกตามตู้) หรือ <b>ตามจำนวนแถว</b> · ทุกแถวไม่หาย
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
            <h2 className="text-sm font-semibold">ไฟล์ที่จะแยก</h2>
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

        {/* STEP 2: ตั้งค่าการแยก */}
        {state && (
          <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
            <h2 className="mb-3 text-sm font-semibold">แยกแบบไหน</h2>

            <div className="flex flex-wrap gap-2">
              {(["by-column", "by-rows"] as SplitMode[]).map((m) => (
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
                  {SPLIT_MODE_LABEL[m]}
                </button>
              ))}
            </div>

            {mode === "by-column" ? (
              <div className="mt-3">
                <p className="mb-2 text-xs text-neutral-500">เลือกคอลัมน์ที่ใช้แยกกลุ่ม (แถวที่ค่าเท่ากัน = กลุ่มเดียวกัน)</p>
                <div className="flex flex-wrap gap-1.5">
                  {header.map((h, i) => {
                    const on = splitCol === i;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setSplitCol(i);
                          setResult(null);
                        }}
                        className={`rounded-md border px-2.5 py-1 text-xs transition ${
                          on
                            ? "border-transparent bg-emerald-600 text-white"
                            : "border-black/15 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
                        }`}
                        title={columnOptionLabel(h, i)}
                      >
                        {columnLetter(i)} · {h === null || String(h).trim() === "" ? "(ว่าง)" : String(h)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <label className="flex items-center gap-2 text-sm">
                  จำนวนแถวต่อไฟล์:
                  <input
                    type="number"
                    min={1}
                    value={chunk}
                    onChange={(e) => {
                      setChunk(Math.max(1, Number(e.target.value) || 1));
                      setResult(null);
                    }}
                    className="w-24 rounded border border-black/15 bg-transparent px-2 py-1 dark:border-white/15 dark:bg-neutral-900"
                  />
                </label>
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <button
                onClick={run}
                className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition dark:bg-white dark:text-black"
              >
                แยกไฟล์
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: ผลลัพธ์ */}
        {result && <SplitResultView result={result} onAllXlsx={dlAllXlsx} onGroupCsv={dlGroupCsv} />}
      </section>
    </main>
  );
}

function SplitResultView({
  result,
  onAllXlsx,
  onGroupCsv,
}: {
  result: SplitResult;
  onAllXlsx: () => void;
  onGroupCsv: (key: string, rows: Row[]) => void;
}) {
  const s = result.stats;
  const shown = result.groups.slice(0, GROUP_CAP);

  return (
    <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <Chip label="แถวเข้า" value={s.inputRows} />
        <Chip label="แยกได้" value={s.groups} tone="ok" />
        <Chip label="กลุ่มใหญ่สุด" value={s.biggest} />
        {s.emptyKeyRows > 0 && <Chip label="คีย์ว่าง" value={s.emptyKeyRows} tone="warn" />}
        <button
          onClick={onAllXlsx}
          className="ml-auto rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700"
        >
          ↓ ดาวน์โหลด Excel (ชีตละกลุ่ม · {s.groups} ชีต)
        </button>
      </div>

      <div className="mb-2 text-xs text-neutral-500">
        แสดง {shown.length} กลุ่ม{result.groups.length > shown.length ? ` (จากทั้งหมด ${result.groups.length})` : ""} — กดปุ่มข้างกลุ่มเพื่อโหลดเฉพาะกลุ่มนั้นเป็น CSV
      </div>
      <div className="max-h-[60vh] space-y-1.5 overflow-auto pr-1">
        {shown.map((g, gi) => (
          <div
            key={gi}
            className="flex items-center gap-2 rounded-lg border border-black/10 px-3 py-2 text-sm dark:border-white/10"
          >
            <span className="truncate font-medium" title={g.key}>
              {g.key}
            </span>
            <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
              {g.rows.length} แถว
            </span>
            <button
              onClick={() => onGroupCsv(g.key, g.rows)}
              className="ml-auto shrink-0 rounded border border-black/15 px-2.5 py-1 text-xs hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
            >
              ↓ CSV
            </button>
          </div>
        ))}
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

// ชื่อกลุ่มไปต่อท้ายชื่อไฟล์ — กันอักขระที่ตั้งชื่อไฟล์ไม่ได้
function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim() || "group";
}

"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { defaultFields, guessColumns, guessHeaderRow } from "@/lib/reconcile/detect";
import { columnOptionLabel, columnLetter } from "@/lib/reconcile/columns";
import { downloadText } from "@/lib/reconcile/export";
import {
  findDuplicates,
  dedupToCsv,
  formatSignature,
  DEDUP_MODE_LABEL,
  type DedupMode,
  type DedupResult,
} from "@/lib/dedup/dedup";
import FileDropzone from "@/components/FileDropzone";
import type { ParsedFile, Row, SideSelection } from "@/lib/reconcile/types";

interface FileState {
  file: ParsedFile;
  sel: SideSelection;
}

const GROUP_CAP = 300; // แสดงกลุ่มซ้ำไม่เกินเท่านี้เพื่อไม่ให้ UI หน่วง

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

// เดาคอลัมน์ tracking ไว้เป็น key เริ่มต้น (mode by-columns)
function guessKeyCols(header: Row): number[] {
  const guessed = guessColumns(header, defaultFields());
  const t = guessed["tracking"];
  return t !== undefined && t >= 0 ? [t] : [];
}

export default function DedupPage() {
  const [state, setState] = useState<FileState | null>(null);
  const [mode, setMode] = useState<DedupMode>("exact-row");
  const [keyCols, setKeyCols] = useState<number[]>([]);
  const [keep, setKeep] = useState<"first" | "last">("first");
  const [caseInsensitive, setCaseInsensitive] = useState(false);
  const [trimWhitespace, setTrimWhitespace] = useState(true);
  const [ignoreEmptyKey, setIgnoreEmptyKey] = useState(true);
  const [result, setResult] = useState<DedupResult | null>(null);
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
      setKeyCols(guessKeyCols(parsed.sheets[sel.sheetIndex]?.rows[sel.headerRow] ?? []));
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
        setKeyCols(guessKeyCols(next.file.sheets[nextSel.sheetIndex]?.rows[nextSel.headerRow] ?? []));
      }
      return next;
    });
    setResult(null);
  }, []);

  const toggleKeyCol = (col: number) =>
    setKeyCols((prev) => (prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col].sort((a, b) => a - b)));

  const run = () => {
    setError(null);
    if (!state) return;
    if (mode === "by-columns" && keyCols.length === 0) {
      setError("เลือกอย่างน้อย 1 คอลัมน์ที่จะใช้เทียบว่าซ้ำ");
      return;
    }
    const base = state.sel.dataStart + 1; // เลขแถว 1-based ของแถวข้อมูลแรก
    const res = findDuplicates(dataRowsOf(state), {
      mode,
      keyCols,
      keep,
      caseInsensitive,
      trimWhitespace,
      ignoreEmptyKey,
      rowNumberBase: base,
    });
    setResult(res);
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">ลบข้อมูลซ้ำ ♻️</h1>
          <p className="text-xs text-neutral-500">
            หากลุ่มแถวที่ซ้ำ — <b>โชว์ให้ดูก่อนลบ</b> แล้วค่อยดาวน์โหลดผลที่ไม่มีซ้ำ (กันข้อมูลหาย)
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
            <h2 className="text-sm font-semibold">ไฟล์ที่จะตรวจซ้ำ</h2>
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

        {/* STEP 2: ตั้งค่าการหาซ้ำ */}
        {state && (
          <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
            <h2 className="mb-3 text-sm font-semibold">หาซ้ำแบบไหน</h2>

            <div className="flex flex-wrap gap-2">
              {(["exact-row", "by-columns"] as DedupMode[]).map((m) => (
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
                  {DEDUP_MODE_LABEL[m]}
                </button>
              ))}
            </div>

            {mode === "exact-row" ? (
              <p className="mt-2 text-xs text-neutral-500">
                ปลอดภัยสุด: นับซ้ำเฉพาะแถวที่ <b>ทุกช่องเหมือนกันเป๊ะ</b> (เหมาะกับเก็บซ้ำจาก copy-paste)
              </p>
            ) : (
              <div className="mt-3">
                <p className="mb-2 text-xs text-neutral-500">
                  เลือกคอลัมน์ที่ใช้ตัดสินว่าซ้ำ (เช่น tracking) — <span className="text-amber-600 dark:text-amber-400">ระวัง: packing list ปกติ 1 tracking แตกหลายกล่องได้</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {header.map((h, i) => {
                    const on = keyCols.includes(i);
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => toggleKeyCol(i)}
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
            )}

            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-2">
                เก็บแถว:
                <select
                  value={keep}
                  onChange={(e) => setKeep(e.target.value as "first" | "last")}
                  className="rounded border border-black/15 bg-transparent px-2 py-1 text-sm dark:border-white/15 dark:bg-neutral-900"
                >
                  <option value="first">แรกสุด</option>
                  <option value="last">ท้ายสุด</option>
                </select>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={trimWhitespace} onChange={(e) => setTrimWhitespace(e.target.checked)} />
                ตัดช่องว่างก่อนเทียบ
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={caseInsensitive} onChange={(e) => setCaseInsensitive(e.target.checked)} />
                ไม่สนตัวพิมพ์ใหญ่-เล็ก
              </label>
              <label className="flex items-center gap-2" title="แถวที่คีย์ว่าง (เช่น subtotal/grand total) จะไม่ถูกนับว่าซ้ำ">
                <input type="checkbox" checked={ignoreEmptyKey} onChange={(e) => setIgnoreEmptyKey(e.target.checked)} />
                ข้ามแถวคีย์ว่าง
              </label>
              <button
                onClick={run}
                className="ml-auto rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition disabled:opacity-40 dark:bg-white dark:text-black"
              >
                หาข้อมูลซ้ำ
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: ผลลัพธ์ */}
        {result && state && <DedupResultView result={result} header={header} />}
      </section>
    </main>
  );
}

function DedupResultView({ result, header }: { result: DedupResult; header: Row }) {
  const s = result.stats;
  const shownGroups = result.groups.slice(0, GROUP_CAP);
  const cols = Math.min(Math.max(header.length, 1), 8);

  return (
    <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <Chip label="แถวเข้า" value={s.inputRows} />
        <Chip label="กลุ่มซ้ำ" value={s.dupGroups} tone={s.dupGroups > 0 ? "warn" : "ok"} />
        <Chip label="แถวที่จะลบ" value={s.dupRowsRemoved} tone={s.dupRowsRemoved > 0 ? "warn" : "ok"} />
        <Chip label="เหลือหลังลบ" value={s.outputRows} tone="ok" />
        {s.emptyKeySkipped > 0 && <Chip label="ข้ามคีย์ว่าง" value={s.emptyKeySkipped} />}
        <button
          onClick={() => downloadText("dedup-result.csv", dedupToCsv(header, result.uniqueRows), "text/csv")}
          className="ml-auto rounded-md border border-black/15 px-3 py-1 text-xs hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
        >
          ↓ CSV ผลลัพธ์ (ไม่มีซ้ำ · {s.outputRows} แถว)
        </button>
      </div>

      {s.dupGroups === 0 ? (
        <p className="rounded-md bg-emerald-50 px-3 py-6 text-center text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
          ไม่พบข้อมูลซ้ำ — ไฟล์นี้ไม่มีแถวซ้ำตามเงื่อนไขที่ตั้ง ✓
        </p>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between text-xs text-neutral-500">
            <span>
              แสดง {shownGroups.length} กลุ่ม{result.groups.length > shownGroups.length ? ` (จากทั้งหมด ${result.groups.length})` : ""} —
              <span className="ml-1 text-emerald-600 dark:text-emerald-400">เขียว = เก็บไว้</span>,
              <span className="ml-1 text-rose-600 dark:text-rose-400"> แดง = จะถูกลบ</span>
            </span>
          </div>
          <div className="max-h-[65vh] space-y-3 overflow-auto pr-1">
            {shownGroups.map((g, gi) => (
              <div key={gi} className="rounded-lg border border-black/10 dark:border-white/10">
                <div className="flex items-center justify-between border-b border-black/5 bg-black/[0.02] px-3 py-1.5 text-xs dark:border-white/5 dark:bg-white/[0.03]">
                  <span className="truncate font-mono" title={formatSignature(g.signature)}>
                    {formatSignature(g.signature) || <span className="italic text-neutral-400">(ว่าง)</span>}
                  </span>
                  <span className="ml-2 shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300">
                    ซ้ำ {g.rows.length}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-[11px]">
                    <tbody>
                      {g.rows.map((rr) => (
                        <tr
                          key={rr.index}
                          className={
                            rr.kept
                              ? "bg-emerald-50 dark:bg-emerald-950/20"
                              : "bg-rose-50 text-neutral-500 line-through decoration-rose-400/60 dark:bg-rose-950/20"
                          }
                        >
                          <td className="w-12 border-r border-black/5 px-2 py-1 text-right text-neutral-400 dark:border-white/5">#{rr.rowLabel}</td>
                          <td className="w-16 px-2 py-1 no-underline">
                            <span className={`rounded px-1.5 py-0.5 text-[10px] ${rr.kept ? "bg-emerald-200 text-emerald-900 dark:bg-emerald-800/60 dark:text-emerald-200" : "bg-rose-200 text-rose-900 dark:bg-rose-800/60 dark:text-rose-200"}`}>
                              {rr.kept ? "เก็บ" : "ลบ"}
                            </span>
                          </td>
                          {Array.from({ length: cols }).map((_, ci) => {
                            const c = rr.row[ci];
                            return (
                              <td key={ci} className="max-w-[140px] truncate whitespace-nowrap px-2 py-1">
                                {c === null || c === undefined ? "" : String(c)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
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

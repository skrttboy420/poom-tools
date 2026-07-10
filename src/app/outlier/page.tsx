"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { columnOptionLabel, columnLetter } from "@/lib/reconcile/columns";
import { downloadText } from "@/lib/reconcile/export";
import { changeExt } from "@/lib/convertfile/convertfile";
import { findOutliers, outlierToCsv, type OutlierMethod } from "@/lib/outlier/outlier";
import FileDropzone from "@/components/FileDropzone";
import type { Cell, ParsedFile, Row, SideSelection } from "@/lib/reconcile/types";

const PREVIEW_ROWS = 500;

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

function headerText(h: Cell): string {
  return h === null || h === undefined || String(h).trim() === "" ? "" : String(h);
}

function isNum(v: Cell): boolean {
  if (v === null || v === undefined || typeof v === "boolean") return false;
  if (typeof v === "number") return Number.isFinite(v);
  const s = String(v).replace(/,/g, "").trim();
  return s !== "" && Number.isFinite(Number(s));
}

// เดาคอลัมน์ตัวเลขที่น่าตรวจ: ชื่อหัวเข้าข่ายน้ำหนัก/ปริมาตร/จำนวน ก่อน; ไม่งั้นคอลัมน์ที่เป็นตัวเลขมากสุด
function guessColumn(header: Row, rows: Row[]): number {
  const width = header.length;
  if (width === 0) return -1;
  const NAME_HINT = /kg|weight|น้ำหนัก|cbm|คิว|ปริมาตร|volume|กล่อง|box|qty|จำนวน|ราคา|price|amount|มูลค่า|value/i;
  const sample = rows.slice(0, 300);

  const numericRatio: number[] = [];
  for (let c = 0; c < width; c++) {
    let numeric = 0;
    let filled = 0;
    for (const r of sample) {
      const v: Cell = c < r.length ? (r[c] ?? null) : null;
      if (v === null || (typeof v === "string" && v.trim() === "")) continue;
      filled++;
      if (isNum(v)) numeric++;
    }
    numericRatio[c] = filled > 0 ? numeric / filled : 0;
  }

  // ชื่อหัวเข้าข่าย + เป็นตัวเลขจริง (>=50%)
  for (let c = 0; c < width; c++) {
    if (NAME_HINT.test(headerText(header[c])) && numericRatio[c] >= 0.5) return c;
  }
  // คอลัมน์ที่เป็นตัวเลขมากสุด
  let best = -1;
  let bestRatio = 0.5;
  for (let c = 0; c < width; c++) {
    if (numericRatio[c] > bestRatio) {
      bestRatio = numericRatio[c];
      best = c;
    }
  }
  return best;
}

const METHODS: { id: OutlierMethod; label: string; hint: string }[] = [
  { id: "iqr", label: "IQR (แนะนำ)", hint: "ทนต่อค่าเบ้ — ใช้ควอไทล์ ไม่ต้องสมมติการกระจาย" },
  { id: "zscore", label: "Z-score", hint: "ระยะจากค่าเฉลี่ยเป็นกี่ SD — เหมาะข้อมูลกระจายปกติ" },
];
const K_OPTIONS: Record<OutlierMethod, { v: number; label: string }[]> = {
  iqr: [
    { v: 1.5, label: "1.5 × IQR (มาตรฐาน)" },
    { v: 2.5, label: "2.5 × IQR" },
    { v: 3, label: "3 × IQR (เฉพาะสุดโต่ง)" },
  ],
  zscore: [
    { v: 2, label: "2 SD" },
    { v: 2.5, label: "2.5 SD" },
    { v: 3, label: "3 SD (เฉพาะสุดโต่ง)" },
  ],
};

function fmt(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

export default function OutlierPage() {
  const [state, setState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [col, setCol] = useState(-1);
  const [method, setMethod] = useState<OutlierMethod>("iqr");
  const [k, setK] = useState(1.5);

  const header = useMemo(() => headerRowOf(state), [state]);
  const data = useMemo(() => dataRowsOf(state), [state]);

  const result = useMemo(
    () => (state && col >= 0 ? findOutliers(header, data, col, { method, k }) : null),
    [state, header, data, col, method, k],
  );

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const parsed = await parseFile(file);
      const sel = makeSelection(parsed, 0);
      setState({ file: parsed, sel });
      const rows = parsed.sheets[sel.sheetIndex]?.rows ?? [];
      setCol(guessColumn(rows[sel.headerRow] ?? [], rows.slice(sel.dataStart)));
    } catch (e) {
      setError(`อ่านไฟล์ ${file.name} ไม่สำเร็จ: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const updateSel = useCallback((patch: Partial<SideSelection>) => {
    setState((cur) => {
      if (!cur) return cur;
      const next = { ...cur, sel: { ...cur.sel, ...patch } };
      const rows = next.file.sheets[next.sel.sheetIndex]?.rows ?? [];
      setCol(guessColumn(rows[next.sel.headerRow] ?? [], rows.slice(next.sel.dataStart)));
      return next;
    });
  }, []);

  const chooseMethod = (m: OutlierMethod) => {
    setMethod(m);
    setK(K_OPTIONS[m][0].v); // reset k เป็น default ของวิธีนั้น
  };

  const dlCsv = () => {
    if (!state || !result || result.error || result.outliers.length === 0) return;
    downloadText(changeExt(state.file.fileName, "csv", "-ผิดปกติ"), outlierToCsv(result), "text/csv");
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];
  const shown = result ? result.outliers.slice(0, PREVIEW_ROWS) : [];

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">จับค่าตัวเลขผิดปกติ (Outlier) 🚩</h1>
          <p className="text-xs text-neutral-500">
            เลือกคอลัมน์ตัวเลข (น้ำหนัก / CBM / จำนวน) → หาค่าที่<b>สูง/ต่ำผิดปกติ</b> เทียบกับเพื่อน ๆ
            (น่าจะกรอกผิด เช่น เกินศูนย์ จุดทศนิยมเลื่อน) · โชว์ให้ดูก่อน ไม่แก้ให้
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

          <FileDropzone
            onFile={handleFile}
            accept=".xlsx,.xls,.csv,.tsv,.txt"
            busy={busy}
            label={
              state ? `เปลี่ยนไฟล์ — ${state.file.fileName}` : "ลากไฟล์มาวาง หรือคลิกเลือก (.xlsx / .csv)"
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
                      onChange={(e) =>
                        updateSel({
                          sheetIndex: Number(e.target.value),
                          headerRow: 0,
                          dataStart: 1,
                          dataEnd: null,
                        })
                      }
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
                          {r.slice(0, 10).map((c, ci) => (
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

        {/* STEP 2: เลือกคอลัมน์ + วิธี */}
        {state && (
          <div className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
            <div>
              <h2 className="mb-1 text-sm font-semibold">คอลัมน์ตัวเลขที่จะตรวจ</h2>
              <div className="flex flex-wrap gap-1.5">
                {header.map((h, i) => {
                  const on = col === i;
                  return (
                    <button
                      key={i}
                      onClick={() => setCol(i)}
                      title={columnOptionLabel(h, i)}
                      className={`rounded-full border px-2.5 py-1 text-xs transition ${
                        on
                          ? "border-rose-600 bg-rose-600 text-white"
                          : "border-black/15 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                      }`}
                    >
                      {columnLetter(i)} · {headerText(h) || "(ว่าง)"}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs">
              <label className="flex items-center gap-1 text-neutral-500" title={METHODS.find((m) => m.id === method)?.hint}>
                วิธี:
                <select
                  value={method}
                  onChange={(e) => chooseMethod(e.target.value as OutlierMethod)}
                  className="rounded border border-black/15 bg-transparent px-1.5 py-1 dark:border-white/15 dark:bg-neutral-900"
                >
                  {METHODS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1 text-neutral-500" title="ยิ่งมาก = เข้มงวดขึ้น (จับเฉพาะที่ผิดปกติจริง ๆ)">
                ความเข้มงวด:
                <select
                  value={k}
                  onChange={(e) => setK(Number(e.target.value))}
                  className="rounded border border-black/15 bg-transparent px-1.5 py-1 dark:border-white/15 dark:bg-neutral-900"
                >
                  {K_OPTIONS[method].map((o) => (
                    <option key={o.v} value={o.v}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="text-[11px] text-neutral-400">
              {METHODS.find((m) => m.id === method)?.hint} · ค่าที่จับได้คือ &quot;น่าสงสัย&quot; ควรเปิดดูจริงก่อนแก้
            </p>
          </div>
        )}

        {/* STEP 3: ผลลัพธ์ */}
        {state && result && !result.error && (
          <div className="space-y-4">
            {/* สรุปสถิติ */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { label: "ต่ำสุด", v: result.min },
                { label: "Q1", v: result.q1 },
                { label: "มัธยฐาน", v: result.median },
                { label: "Q3", v: result.q3 },
                { label: "สูงสุด", v: result.max },
                { label: "เฉลี่ย", v: result.mean },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border border-black/10 px-3 py-2 dark:border-white/10">
                  <div className="text-[10px] uppercase tracking-wide text-neutral-400">{s.label}</div>
                  <div className="tabular-nums text-sm font-medium">{fmt(s.v)}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span
                className={`rounded-full px-3 py-1 font-medium ${
                  result.outlierCount === 0
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                    : "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300"
                }`}
              >
                {result.outlierCount === 0
                  ? "✓ ไม่พบค่าผิดปกติ"
                  : `พบ ${result.outlierCount.toLocaleString("en-US")} ค่าผิดปกติ`}
              </span>
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                จาก <span className="tabular-nums">{result.numericValues.toLocaleString("en-US")}</span> ค่าตัวเลข
              </span>
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                ช่วงปกติ <span className="tabular-nums">{fmt(result.lowerBound)}</span> ถึ{" "}
                <span className="tabular-nums">{fmt(result.upperBound)}</span>
              </span>
              {result.nonNumeric > 0 && (
                <span className="text-neutral-400">ไม่ใช่ตัวเลข {result.nonNumeric}</span>
              )}
              {result.blankRows > 0 && <span className="text-neutral-400">ช่องว่าง {result.blankRows}</span>}
              {result.outliers.length > 0 && (
                <button
                  onClick={dlCsv}
                  className="ml-auto rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700"
                >
                  ↓ CSV ค่าผิดปกติ
                </button>
              )}
            </div>

            {result.outlierCount > 0 ? (
              <div className="space-y-2">
                {shown.map((o, i) => (
                  <div
                    key={i}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-rose-500/25 bg-rose-50/40 px-4 py-2.5 text-sm dark:border-rose-500/20 dark:bg-rose-950/15"
                  >
                    <span className="w-16 text-[11px] text-neutral-400">แถว {o.row + 1}</span>
                    <span className="font-mono text-base font-semibold tabular-nums">{o.display}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] ${
                        o.side === "high"
                          ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                          : "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
                      }`}
                    >
                      {o.side === "high" ? "▲ สูงผิดปกติ" : "▼ ต่ำผิดปกติ"}
                    </span>
                    <span className="ml-auto text-[11px] text-neutral-500">
                      ผิดปกติ{" "}
                      <span className="tabular-nums font-medium">{o.score}</span>
                      {result.method === "iqr" ? "× IQR" : " SD"}
                    </span>
                  </div>
                ))}
                {result.outlierCount > PREVIEW_ROWS && (
                  <p className="text-[11px] text-neutral-400">
                    แสดง {PREVIEW_ROWS} ค่าแรก จากทั้งหมด {result.outlierCount.toLocaleString("en-US")} ค่า ·
                    ดาวน์โหลด CSV เพื่อดูครบ
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-50/50 p-4 text-sm text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-950/20 dark:text-emerald-300">
                ✓ ทุกค่าอยู่ในช่วงปกติ ({fmt(result.lowerBound)} ถึง {fmt(result.upperBound)}) — คอลัมน์นี้ดูสม่ำเสมอดี
              </div>
            )}
          </div>
        )}

        {state && result?.error && (
          <p className="rounded-md border border-amber-500/30 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
            {result.error}
          </p>
        )}

        {state && col < 0 && (
          <p className="rounded-md border border-black/10 px-4 py-3 text-sm text-neutral-500 dark:border-white/10">
            เลือกคอลัมน์ตัวเลขที่จะตรวจ
          </p>
        )}
      </section>
    </main>
  );
}

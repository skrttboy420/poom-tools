"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { columnLetter } from "@/lib/reconcile/columns";
import { downloadText, downloadBlob } from "@/lib/reconcile/export";
import { rowsToCsv, rowsToXlsx, changeExt } from "@/lib/convertfile/convertfile";
import {
  analyzeChargeable,
  DIM_UNIT_LABEL,
  MODE_LABEL,
  METRIC_LABEL,
  type DimUnit,
  type FreightMode,
  type ChargeMetric,
} from "@/lib/chargeable/chargeable";
import FileDropzone from "@/components/FileDropzone";
import type { ParsedFile, Row, SideSelection, Cell } from "@/lib/reconcile/types";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PREVIEW_ROWS = 300;

const UNITS: DimUnit[] = ["cm", "m", "inch"];
const MODES: FreightMode[] = ["air", "sea"];
const METRICS: ChargeMetric[] = ["chargeable", "cbm", "volumetric"];

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
  return h === null || h === undefined || String(h).trim() === "" ? columnLetter(i) : String(h);
}

function numericScore(data: Row[], c: number): number {
  let num = 0;
  for (const row of data.slice(0, 60)) {
    const v = c < row.length ? row[c] : null;
    if (v === null || v === undefined) continue;
    const s = String(v).replace(/,/g, "").trim();
    if (s !== "" && Number.isFinite(Number(s))) num++;
  }
  return num;
}

// เดาคอลัมน์จากชื่อหัวตาราง (คีย์เวิร์ด) แล้ว fallback เป็นคอลัมน์ตัวเลข
function findByKeywords(header: Row, data: Row[], keywords: string[], used: Set<number>): number | null {
  for (let i = 0; i < header.length; i++) {
    if (used.has(i)) continue;
    const h = String(header[i] ?? "").toLowerCase().trim();
    if (h === "") continue;
    if (keywords.some((k) => h.includes(k))) {
      used.add(i);
      return i;
    }
  }
  // fallback: คอลัมน์ตัวเลขตัวถัดไปที่ยังไม่ถูกใช้
  const cap = Math.max(1, data.slice(0, 60).length);
  for (let i = 0; i < header.length; i++) {
    if (used.has(i)) continue;
    if (numericScore(data, i) >= cap / 2) {
      used.add(i);
      return i;
    }
  }
  return null;
}

export default function ChargeablePage() {
  const [state, setState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [lenCol, setLenCol] = useState(-1);
  const [widthCol, setWidthCol] = useState(-1);
  const [heightCol, setHeightCol] = useState(-1);
  const [qtyCol, setQtyCol] = useState(-1);
  const [weightCol, setWeightCol] = useState(-1);
  const [unit, setUnit] = useState<DimUnit>("cm");
  const [mode, setMode] = useState<FreightMode>("air");
  const [divisor, setDivisor] = useState("6000");
  const [metrics, setMetrics] = useState<ChargeMetric[]>(["chargeable", "cbm", "volumetric"]);
  const [roundOn, setRoundOn] = useState(true);
  const [roundPlaces, setRoundPlaces] = useState("2");

  const header = useMemo(() => headerRowOf(state), [state]);
  const data = useMemo(() => dataRowsOf(state), [state]);
  const headerStr = useMemo(() => header.map((h) => (h === null ? "" : String(h))), [header]);

  const reguess = useCallback((rows: Row[], sel: SideSelection) => {
    const hdr = rows[sel.headerRow] ?? [];
    const dat = rows.slice(sel.dataStart);
    const used = new Set<number>();
    const l = findByKeywords(hdr, dat, ["ยาว", "length", "len", "long", "l("], used);
    const w = findByKeywords(hdr, dat, ["กว้าง", "width", "wide", "w("], used);
    const h = findByKeywords(hdr, dat, ["สูง", "height", "high", "h("], used);
    const q = findByKeywords(hdr, dat, ["จำนวน", "qty", "quantity", "กล่อง", "carton", "ctn", "pcs", "pieces"], used);
    const wt = findByKeywords(hdr, dat, ["น้ำหนัก", "weight", "kg", "wt", "gross", "gw"], used);
    setLenCol(l ?? -1);
    setWidthCol(w ?? -1);
    setHeightCol(h ?? -1);
    setQtyCol(q ?? -1);
    setWeightCol(wt ?? -1);
  }, []);

  const result = useMemo(
    () =>
      analyzeChargeable(headerStr, data, {
        lenCol,
        widthCol,
        heightCol,
        qtyCol: qtyCol >= 0 ? qtyCol : null,
        weightCol: weightCol >= 0 ? weightCol : null,
        unit,
        mode,
        divisor: Math.max(1, Number(divisor) || 6000),
        round: roundOn ? Math.max(0, Number(roundPlaces) || 0) : null,
        metrics,
      }),
    [headerStr, data, lenCol, widthCol, heightCol, qtyCol, weightCol, unit, mode, divisor, roundOn, roundPlaces, metrics],
  );

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setError(null);
      setBusy(true);
      try {
        const parsed = await parseFile(file);
        const sel = makeSelection(parsed, 0);
        setState({ file: parsed, sel });
        reguess(parsed.sheets[sel.sheetIndex]?.rows ?? [], sel);
      } catch (e) {
        setError(`อ่านไฟล์ ${file.name} ไม่สำเร็จ: ${(e as Error).message}`);
      } finally {
        setBusy(false);
      }
    },
    [reguess],
  );

  const updateSel = useCallback(
    (patch: Partial<SideSelection>) => {
      setState((cur) => {
        if (!cur) return cur;
        const sel = { ...cur.sel, ...patch };
        const rows = cur.file.sheets[sel.sheetIndex]?.rows ?? [];
        reguess(rows, sel);
        return { ...cur, sel };
      });
    },
    [reguess],
  );

  const toggleMetric = (m: ChargeMetric) => {
    setMetrics((cur) => {
      if (cur.includes(m)) {
        const next = cur.filter((x) => x !== m);
        return next.length === 0 ? cur : next; // อย่างน้อยต้องเหลือ 1
      }
      // เพิ่มโดยรักษาลำดับตาม METRICS
      return METRICS.filter((x) => cur.includes(x) || x === m);
    });
  };

  const dlCsv = () => {
    if (!state || result.error) return;
    downloadText(changeExt(state.file.fileName, "csv", "-คิดค่าขนส่ง"), rowsToCsv([result.header, ...result.rows]), "text/csv");
  };
  const dlXlsx = () => {
    if (!state || result.error) return;
    downloadBlob(changeExt(state.file.fileName, "xlsx", "-คิดค่าขนส่ง"), rowsToXlsx([result.header, ...result.rows]), XLSX_MIME);
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];
  const shownRows = result.rows.slice(0, PREVIEW_ROWS);
  const isNewCol = (i: number) => i >= result.firstNewIndex && result.firstNewIndex >= 0;
  const cellStr = (v: Cell) => (v === null || v === undefined ? "" : String(v));

  // dropdown เลือกคอลัมน์ (พร้อมตัวเลือก "— ไม่มี —" สำหรับ qty/weight)
  const colPicker = (
    label: string,
    value: number,
    onChange: (v: number) => void,
    optional: boolean,
    hint?: string,
  ) => (
    <label className="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400">
      <span>
        {label}
        {hint && <span className="ml-1 text-[10px] text-neutral-400">{hint}</span>}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded border border-black/15 bg-transparent px-2 py-1 dark:border-white/15 dark:bg-neutral-900"
      >
        {optional && <option value={-1}>— ไม่มี —</option>}
        {!optional && <option value={-1}>— เลือก —</option>}
        {header.map((_, i) => (
          <option key={i} value={i}>
            {columnLetter(i)} · {colLabel(header, i)}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">คำนวณน้ำหนักคิดค่าขนส่ง ✈️</h1>
          <p className="text-xs text-neutral-500">
            จากไฟล์ที่มีคอลัมน์ กว้าง/ยาว/สูง/จำนวน/น้ำหนัก → เติม CBM · น้ำหนักเชิงปริมาตร · น้ำหนักคิดเงิน ต่อแถว ·
            air = max(น้ำหนักจริง, ปริมาตร÷divisor) · ทะเล W/M = max(น้ำหนักจริง, CBM×1000) · มิติไม่ครบ = เว้นว่าง ไม่แตะข้อมูลเดิม
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
                          {r.slice(0, 12).map((c, ci) => (
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

        {/* STEP 2: ตั้งค่า */}
        {state && (
          <div className="space-y-4 rounded-xl border border-black/10 p-4 dark:border-white/10">
            <div>
              <h2 className="mb-2 text-sm font-semibold">ชี้คอลัมน์มิติ &amp; ค่า (เดาให้แล้ว—ปรับได้)</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {colPicker("ยาว (L)", lenCol, setLenCol, false)}
                {colPicker("กว้าง (W)", widthCol, setWidthCol, false)}
                {colPicker("สูง (H)", heightCol, setHeightCol, false)}
                {colPicker("จำนวนกล่อง", qtyCol, setQtyCol, true, "ไม่มี = 1")}
                {colPicker("น้ำหนักจริง", weightCol, setWeightCol, true, "kg · ไม่มี = ปริมาตรล้วน")}
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-6 border-t border-black/5 pt-3 dark:border-white/5">
              <div>
                <span className="text-xs text-neutral-500">หน่วยมิติ:</span>
                <div className="mt-1 flex gap-2">
                  {UNITS.map((u) => (
                    <button
                      key={u}
                      onClick={() => setUnit(u)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                        unit === u
                          ? "border-indigo-500/50 bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200"
                          : "border-black/15 text-neutral-500 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                      }`}
                    >
                      {DIM_UNIT_LABEL[u]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-xs text-neutral-500">รูปแบบขนส่ง:</span>
                <div className="mt-1 flex gap-2">
                  {MODES.map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                        mode === m
                          ? "border-sky-500/50 bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200"
                          : "border-black/15 text-neutral-500 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                      }`}
                    >
                      {MODE_LABEL[m]}
                    </button>
                  ))}
                </div>
              </div>

              {mode === "air" && (
                <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
                  divisor (air):
                  <input
                    type="number"
                    min={1}
                    value={divisor}
                    onChange={(e) => setDivisor(e.target.value)}
                    className="w-24 rounded border border-black/15 bg-transparent px-2 py-1 dark:border-white/15"
                  />
                  <span className="text-[10px] text-neutral-400">6000=มาตรฐาน · 5000=express</span>
                </label>
              )}
            </div>

            <div className="border-t border-black/5 pt-3 dark:border-white/5">
              <span className="text-xs text-neutral-500">ค่าที่จะเติม (คอลัมน์ใหม่):</span>
              <div className="mt-1 flex flex-wrap gap-2">
                {METRICS.map((m) => {
                  const on = metrics.includes(m);
                  return (
                    <button
                      key={m}
                      onClick={() => toggleMetric(m)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                        on
                          ? "border-emerald-500 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                          : "border-black/15 text-neutral-500 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                      }`}
                    >
                      {on ? "✓ " : ""}
                      {METRIC_LABEL[m]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 border-t border-black/5 pt-3 text-xs dark:border-white/5">
              <label className="flex cursor-pointer items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
                <input type="checkbox" checked={roundOn} onChange={(e) => setRoundOn(e.target.checked)} />
                ปัดทศนิยม
              </label>
              {roundOn && (
                <input
                  type="number"
                  min={0}
                  max={12}
                  value={roundPlaces}
                  onChange={(e) => setRoundPlaces(e.target.value)}
                  className="w-16 rounded border border-black/15 bg-transparent px-2 py-1 dark:border-white/15"
                />
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
                  <span className="rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                    คำนวณได้ <span className="tabular-nums">{result.computedRows}</span>
                  </span>
                  {result.skippedRows > 0 && (
                    <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                      มิติไม่ครบ (เว้นว่าง) <span className="tabular-nums">{result.skippedRows}</span>
                    </span>
                  )}
                  <span className="text-neutral-400">
                    รวม CBM <span className="font-medium text-neutral-600 dark:text-neutral-300 tabular-nums">{result.totalCbm}</span>
                  </span>
                  <span className="text-neutral-400">
                    รวมน้ำหนักคิดเงิน{" "}
                    <span className="font-medium text-emerald-700 dark:text-emerald-300 tabular-nums">{result.totalChargeable}</span>
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

            <div className="max-h-[55vh] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-900">
                  <tr>
                    <th className="px-2 py-1.5">#</th>
                    {result.header.map((h, i) => (
                      <th key={i} className={`px-2 py-1.5 whitespace-nowrap ${isNewCol(i) ? "text-emerald-700 dark:text-emerald-300" : ""}`}>
                        {h === "" || h === null ? columnLetter(i) : String(h)}
                        {isNewCol(i) && " ✈️"}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shownRows.map((r, ri) => (
                    <tr key={ri} className="border-t border-black/5 dark:border-white/5">
                      <td className="px-2 py-1 text-right text-neutral-400 tabular-nums">{ri + 1}</td>
                      {result.header.map((_, ci) => (
                        <td
                          key={ci}
                          className={`max-w-[220px] truncate whitespace-nowrap px-2 py-1 tabular-nums ${
                            isNewCol(ci) ? "bg-emerald-50 font-medium dark:bg-emerald-950/30" : ""
                          }`}
                        >
                          {cellStr(r[ci] ?? null)}
                        </td>
                      ))}
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

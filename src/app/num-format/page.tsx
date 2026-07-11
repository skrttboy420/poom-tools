"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { columnLetter } from "@/lib/reconcile/columns";
import { downloadText, downloadBlob } from "@/lib/reconcile/export";
import { rowsToCsv, rowsToXlsx, changeExt } from "@/lib/convertfile/convertfile";
import {
  analyzeNumFormat,
  formatNumber,
  type ThousandsSep,
  type DecimalSep,
  type NegativeStyle,
} from "@/lib/numformat/numformat";
import FileDropzone from "@/components/FileDropzone";
import type { ParsedFile, Row, SideSelection, Cell } from "@/lib/reconcile/types";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PREVIEW_ROWS = 300;

const THOUSANDS: { id: ThousandsSep; label: string }[] = [
  { id: "comma", label: "1,234 (จุลภาค)" },
  { id: "dot", label: "1.234 (จุด)" },
  { id: "space", label: "1 234 (เว้นวรรค)" },
  { id: "none", label: "1234 (ไม่มี)" },
];
const DECIMALS: { id: DecimalSep; label: string }[] = [
  { id: "dot", label: ". (จุด)" },
  { id: "comma", label: ", (จุลภาค)" },
];
const NEGATIVES: { id: NegativeStyle; label: string }[] = [
  { id: "minus", label: "-1,000.00 (ลบหน้า)" },
  { id: "parens", label: "(1,000.00) (วงเล็บบัญชี)" },
];

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
// นับช่องที่เป็นตัวเลข (number หรือ string ที่ parse เป็นเลขได้) — คอลัมน์ที่ควรจัดรูป
function numericScore(data: Row[], c: number): number {
  let score = 0;
  for (const row of data.slice(0, 60)) {
    const v = c < row.length ? row[c] : null;
    if (v === null || v === undefined || v === "") continue;
    if (typeof v === "number") {
      if (Number.isFinite(v)) score++;
    } else if (typeof v === "string") {
      const n = Number(v.replace(/,/g, "").trim());
      if (v.trim() !== "" && Number.isFinite(n)) score++;
    }
  }
  return score;
}
// เดาคอลัมน์: หัวเข้าข่ายเงิน/ยอด/ราคา/น้ำหนัก ก่อน ไม่งั้นคอลัมน์ตัวเลขมากสุด
function guessCol(header: Row, data: Row[]): number {
  const keys = ["price", "ราคา", "amount", "ยอด", "เงิน", "total", "รวม", "มูลค่า", "cost", "ต้นทุน", "kg", "น้ำหนัก", "weight", "cbm", "cost"];
  for (let i = 0; i < header.length; i++) {
    const h = String(header[i] ?? "").toLowerCase().trim();
    if (h !== "" && keys.some((k) => h.includes(k)) && numericScore(data, i) > 0) return i;
  }
  let best = -1;
  let bestScore = 0;
  for (let i = 0; i < header.length; i++) {
    const sc = numericScore(data, i);
    if (sc > bestScore) {
      bestScore = sc;
      best = i;
    }
  }
  return best;
}

export default function NumFormatPage() {
  const [state, setState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [col, setCol] = useState(-1);
  const [decimals, setDecimals] = useState("2");
  const [thousandsSep, setThousandsSep] = useState<ThousandsSep>("comma");
  const [decimalSep, setDecimalSep] = useState<DecimalSep>("dot");
  const [prefix, setPrefix] = useState("");
  const [suffix, setSuffix] = useState("");
  const [negativeStyle, setNegativeStyle] = useState<NegativeStyle>("minus");
  const [plusSign, setPlusSign] = useState(false);
  const [replace, setReplace] = useState(false);
  const [colName, setColName] = useState("");

  const header = useMemo(() => headerRowOf(state), [state]);
  const data = useMemo(() => dataRowsOf(state), [state]);
  const headerStr = useMemo(() => header.map((h) => (h === null ? "" : String(h))), [header]);

  const reguess = useCallback((rows: Row[], sel: SideSelection) => {
    const hdr = rows[sel.headerRow] ?? [];
    const dat = rows.slice(sel.dataStart);
    setCol(guessCol(hdr, dat));
  }, []);

  const opts = useMemo(
    () => ({
      col,
      decimals: Math.max(0, Number(decimals) || 0),
      thousandsSep,
      decimalSep,
      prefix,
      suffix,
      negativeStyle,
      plusSign,
      mode: (replace ? "replace" : "add") as "replace" | "add",
      colName: colName.trim() === "" ? undefined : colName,
    }),
    [col, decimals, thousandsSep, decimalSep, prefix, suffix, negativeStyle, plusSign, replace, colName],
  );

  const result = useMemo(() => analyzeNumFormat(headerStr, data, opts), [headerStr, data, opts]);

  // ตัวอย่างสด (พรีวิวรูปแบบโดยไม่ต้องมีไฟล์)
  const livePreview = useMemo(() => {
    if (thousandsSep !== "none" && THOUSANDS_CHAR[thousandsSep] === DEC_CHAR[decimalSep]) return "— ตัวคั่นชนกัน —";
    return [1234567.5, -1234.5, 0].map((v) => formatNumber(v, opts)).join("   ·   ");
  }, [thousandsSep, decimalSep, opts]);

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

  const dlCsv = () => {
    if (!state || result.error) return;
    downloadText(changeExt(state.file.fileName, "csv", "-จัดรูป"), rowsToCsv([result.header, ...result.rows]), "text/csv");
  };
  const dlXlsx = () => {
    if (!state || result.error) return;
    downloadBlob(changeExt(state.file.fileName, "xlsx", "-จัดรูป"), rowsToXlsx([result.header, ...result.rows]), XLSX_MIME);
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];
  const shownRows = result.rows.slice(0, PREVIEW_ROWS);
  const isNewCol = (i: number) =>
    (result.firstNewIndex >= 0 && i >= result.firstNewIndex) || (result.replacedCol >= 0 && i === result.replacedCol);
  const cellStr = (v: Cell) => (v === null || v === undefined ? "" : String(v));

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">จัดรูปแบบตัวเลข 💵</h1>
          <p className="text-xs text-neutral-500">
            number ดิบ → ข้อความจัดรูปสำหรับใบเสนอราคา/ใบแจ้งหนี้ · ตัวคั่นหลักพัน · ทศนิยมคงที่ · สัญลักษณ์เงิน ฿ $ · ติดลบสไตล์บัญชี (1,000.00) ·
            ต่างจาก /num-clean (ทิศตรงข้าม: ข้อความเลอะ → number)
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400">
                <span>คอลัมน์ตัวเลขที่จะจัดรูป</span>
                <select
                  value={col}
                  onChange={(e) => setCol(Number(e.target.value))}
                  className="rounded border border-black/15 bg-transparent px-2 py-1 dark:border-white/15 dark:bg-neutral-900"
                >
                  <option value={-1}>— เลือก —</option>
                  {header.map((_, i) => (
                    <option key={i} value={i}>
                      {columnLetter(i)} · {colLabel(header, i)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400">
                <span>จำนวนทศนิยม (คงที่)</span>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={decimals}
                  onChange={(e) => setDecimals(e.target.value)}
                  className="w-24 rounded border border-black/15 bg-transparent px-2 py-1 dark:border-white/15 dark:bg-neutral-900"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <span className="text-xs text-neutral-500">ตัวคั่นหลักพัน:</span>
                <div className="mt-1 flex flex-wrap gap-2">
                  {THOUSANDS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setThousandsSep(m.id)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                        thousandsSep === m.id
                          ? "border-indigo-500/50 bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200"
                          : "border-black/15 text-neutral-500 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="text-xs text-neutral-500">จุดทศนิยม:</span>
                <div className="mt-1 flex flex-wrap gap-2">
                  {DECIMALS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setDecimalSep(m.id)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                        decimalSep === m.id
                          ? "border-indigo-500/50 bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200"
                          : "border-black/15 text-neutral-500 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400">
                <span>คำนำหน้า (prefix) เช่น ฿ $ USD</span>
                <input
                  type="text"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                  placeholder="฿"
                  className="w-40 rounded border border-black/15 bg-transparent px-2 py-1 dark:border-white/15 dark:bg-neutral-900"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400">
                <span>คำต่อท้าย (suffix) เช่น บาท kg %</span>
                <input
                  type="text"
                  value={suffix}
                  onChange={(e) => setSuffix(e.target.value)}
                  placeholder=" บาท"
                  className="w-40 rounded border border-black/15 bg-transparent px-2 py-1 dark:border-white/15 dark:bg-neutral-900"
                />
              </label>
            </div>

            <div>
              <span className="text-xs text-neutral-500">รูปแบบติดลบ:</span>
              <div className="mt-1 flex flex-wrap gap-2">
                {NEGATIVES.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setNegativeStyle(m.id)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                      negativeStyle === m.id
                        ? "border-indigo-500/50 bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200"
                        : "border-black/15 text-neutral-500 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-6 border-t border-black/5 pt-3 dark:border-white/5">
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
                <input type="checkbox" checked={plusSign} onChange={(e) => setPlusSign(e.target.checked)} />
                แสดง + หน้าค่าบวก
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
                <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
                ทับค่าในคอลัมน์เดิม (แทนที่จะเติมคอลัมน์ใหม่)
              </label>
              {!replace && (
                <label className="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400">
                  <span>ชื่อคอลัมน์ใหม่</span>
                  <input
                    type="text"
                    value={colName}
                    onChange={(e) => setColName(e.target.value)}
                    placeholder="เช่น ราคา (จัดรูป)"
                    className="w-52 rounded border border-black/15 bg-transparent px-2 py-1 dark:border-white/15 dark:bg-neutral-900"
                  />
                </label>
              )}
            </div>

            <div className="rounded-lg border border-black/5 bg-neutral-50 px-3 py-2 text-xs dark:border-white/5 dark:bg-neutral-900/50">
              <span className="text-neutral-400">ตัวอย่างรูปแบบ:</span>{" "}
              <span className="font-medium tabular-nums text-neutral-700 dark:text-neutral-200">{livePreview}</span>
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
                    จัดรูปแล้ว <span className="tabular-nums">{result.formattedRows}</span>
                  </span>
                  {result.skippedRows > 0 && (
                    <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                      ไม่ใช่ตัวเลข (ข้าม) <span className="tabular-nums">{result.skippedRows}</span>
                    </span>
                  )}
                  {result.blankRows > 0 && (
                    <span className="rounded-full bg-neutral-200 px-3 py-1 font-medium text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
                      ว่าง <span className="tabular-nums">{result.blankRows}</span>
                    </span>
                  )}
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

            {/* ตัวอย่างก่อน → หลัง */}
            {!result.error && result.samples.length > 0 && (
              <div className="border-b border-black/10 px-3 py-2 dark:border-white/10">
                <p className="mb-1 text-[11px] text-neutral-500">ตัวอย่างก่อน → หลัง (สูงสุด 50):</p>
                <div className="flex flex-wrap gap-1.5">
                  {result.samples.slice(0, 24).map((s, i) => (
                    <span
                      key={i}
                      className={`rounded px-2 py-0.5 text-[11px] tabular-nums ${
                        s.skipped
                          ? "bg-neutral-100 text-neutral-500 line-through dark:bg-neutral-800 dark:text-neutral-400"
                          : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                      }`}
                      title={s.skipped ? "ไม่ใช่ตัวเลข (ข้าม)" : "จัดรูปแล้ว"}
                    >
                      {cellStr(s.before) || "∅"}
                      {s.skipped ? " · ข้าม" : ` → ${cellStr(s.after)}`}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="max-h-[55vh] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-900">
                  <tr>
                    <th className="px-2 py-1.5">#</th>
                    {result.header.map((h, i) => (
                      <th key={i} className={`px-2 py-1.5 whitespace-nowrap ${isNewCol(i) ? "text-emerald-700 dark:text-emerald-300" : ""}`}>
                        {h === "" || h === null ? columnLetter(i) : String(h)}
                        {isNewCol(i) && " 💵"}
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

// ตัวคั่นสำหรับพรีวิวสด (mirror ของ engine)
const THOUSANDS_CHAR: Record<ThousandsSep, string> = { comma: ",", dot: ".", space: " ", none: "" };
const DEC_CHAR: Record<DecimalSep, string> = { dot: ".", comma: "," };

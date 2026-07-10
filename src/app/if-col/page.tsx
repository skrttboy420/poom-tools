"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { columnLetter } from "@/lib/reconcile/columns";
import { downloadText, downloadBlob } from "@/lib/reconcile/export";
import { rowsToCsv, rowsToXlsx, changeExt } from "@/lib/convertfile/convertfile";
import {
  analyzeIfCol,
  OP_LABEL,
  NO_VALUE_OPS,
  NUMERIC_OPS,
  type CondOp,
  type CondRule,
} from "@/lib/ifcol/ifcol";
import FileDropzone from "@/components/FileDropzone";
import type { ParsedFile, Row, SideSelection, Cell } from "@/lib/reconcile/types";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PREVIEW_ROWS = 300;

interface FileState {
  file: ParsedFile;
  sel: SideSelection;
}
// เงื่อนไขในหน้า UI — value/then เก็บเป็น string เสมอ (แปลงตอนส่งเข้า engine)
interface UiRule {
  op: CondOp;
  value: string;
  then: string;
}

const OP_ORDER: CondOp[] = [
  "contains",
  "not-contains",
  "equals",
  "not-equals",
  "starts",
  "ends",
  "regex",
  "empty",
  "not-empty",
  "gt",
  "gte",
  "lt",
  "lte",
  "eq-num",
];

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

export default function IfColPage() {
  const [state, setState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [col, setCol] = useState(-1);
  const [rules, setRules] = useState<UiRule[]>([{ op: "contains", value: "", then: "" }]);
  const [elseValue, setElseValue] = useState("");
  const [colName, setColName] = useState("");
  const [caseInsensitive, setCaseInsensitive] = useState(true);
  const [trim, setTrim] = useState(true);

  const header = useMemo(() => headerRowOf(state), [state]);
  const data = useMemo(() => dataRowsOf(state), [state]);
  const headerStr = useMemo(() => header.map((h) => (h === null ? "" : String(h))), [header]);

  // แปลง UiRule → CondRule (value ว่างสำหรับ NO_VALUE_OPS, then ว่าง → null)
  const engineRules = useMemo<CondRule[]>(
    () =>
      rules.map((r) => ({
        op: r.op,
        value: NO_VALUE_OPS.includes(r.op) ? undefined : r.value,
        then: r.then.trim() === "" ? null : r.then,
      })),
    [rules],
  );

  const result = useMemo(
    () =>
      analyzeIfCol(headerStr, data, {
        col,
        rules: engineRules,
        elseValue: elseValue.trim() === "" ? null : elseValue,
        colName: colName.trim() === "" ? undefined : colName,
        caseInsensitive,
        trim,
      }),
    [headerStr, data, col, engineRules, elseValue, colName, caseInsensitive, trim],
  );

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const parsed = await parseFile(file);
      const sel = makeSelection(parsed, 0);
      setState({ file: parsed, sel });
      const hdr = parsed.sheets[sel.sheetIndex]?.rows[sel.headerRow] ?? [];
      // เดาคอลัมน์: หัวเข้าข่าย note/สถานะ/หมายเหตุ ก่อน ไม่งั้นคอลัมน์แรก
      const keys = ["note", "หมายเหตุ", "สถานะ", "status", "remark", "detail", "รายละเอียด", "ประเภท", "type"];
      let guess = -1;
      for (let i = 0; i < hdr.length; i++) {
        const h = String(hdr[i] ?? "").toLowerCase().trim();
        if (h !== "" && keys.some((k) => h.includes(k))) {
          guess = i;
          break;
        }
      }
      if (guess < 0 && hdr.length > 0) guess = 0;
      setCol(guess);
    } catch (e) {
      setError(`อ่านไฟล์ ${file.name} ไม่สำเร็จ: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const updateSel = useCallback((patch: Partial<SideSelection>) => {
    setState((cur) => (cur ? { ...cur, sel: { ...cur.sel, ...patch } } : cur));
  }, []);

  const setRule = (i: number, patch: Partial<UiRule>) =>
    setRules((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRule = () => setRules((rs) => [...rs, { op: "contains", value: "", then: "" }]);
  const removeRule = (i: number) => setRules((rs) => (rs.length <= 1 ? rs : rs.filter((_, idx) => idx !== i)));

  const dlCsv = () => {
    if (!state || result.error) return;
    downloadText(changeExt(state.file.fileName, "csv", "-ป้าย"), rowsToCsv([result.header, ...result.rows]), "text/csv");
  };
  const dlXlsx = () => {
    if (!state || result.error) return;
    downloadBlob(changeExt(state.file.fileName, "xlsx", "-ป้าย"), rowsToXlsx([result.header, ...result.rows]), XLSX_MIME);
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];
  const shownRows = result.rows.slice(0, PREVIEW_ROWS);
  const isNewCol = (i: number) => result.firstNewIndex >= 0 && i >= result.firstNewIndex;
  const cellStr = (v: Cell) => (v === null || v === undefined ? "" : String(v));

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">ติดป้ายตามเงื่อนไข 🏷️</h1>
          <p className="text-xs text-neutral-500">
            ตั้งเงื่อนไขไล่จากบนลงล่าง → เจอข้อแรกที่ตรง = ใช้ป้ายนั้น → เติมคอลัมน์ป้ายให้ทุกแถว · เช่น note มี &quot;ด่วน&quot; → &quot;เร่งด่วน&quot; ·
            น้ำหนัก &gt; 100 → &quot;หนักพิเศษ&quot; · รองรับทั้งข้อความและตัวเลข · เงื่อนไขที่ยังไม่กรอกค่า = ถูกข้าม ไม่เดามั่ว
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

        {/* STEP 2: ตั้งเงื่อนไข */}
        {state && (
          <div className="space-y-4 rounded-xl border border-black/10 p-4 dark:border-white/10">
            <label className="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400">
              <span>คอลัมน์ที่จะตรวจ</span>
              <select
                value={col}
                onChange={(e) => setCol(Number(e.target.value))}
                className="w-64 rounded border border-black/15 bg-transparent px-2 py-1 dark:border-white/15 dark:bg-neutral-900"
              >
                <option value={-1}>— เลือก —</option>
                {header.map((_, i) => (
                  <option key={i} value={i}>
                    {columnLetter(i)} · {colLabel(header, i)}
                  </option>
                ))}
              </select>
            </label>

            <div className="space-y-2 border-t border-black/5 pt-3 dark:border-white/5">
              <span className="text-xs font-medium text-neutral-500">เงื่อนไข (ไล่จากบนลงล่าง — เจอข้อแรกที่ตรง = ใช้ป้ายนั้น):</span>
              {rules.map((r, i) => {
                const noValue = NO_VALUE_OPS.includes(r.op);
                const isNum = NUMERIC_OPS.includes(r.op);
                return (
                  <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-black/10 bg-black/[0.015] p-2 text-xs dark:border-white/10 dark:bg-white/[0.02]">
                    <span className="w-5 text-center font-medium text-neutral-400 tabular-nums">{i + 1}</span>
                    <select
                      value={r.op}
                      onChange={(e) => setRule(i, { op: e.target.value as CondOp })}
                      className="rounded border border-black/15 bg-transparent px-2 py-1 dark:border-white/15 dark:bg-neutral-900"
                    >
                      {OP_ORDER.map((op) => (
                        <option key={op} value={op}>
                          {OP_LABEL[op]}
                        </option>
                      ))}
                    </select>
                    {!noValue && (
                      <input
                        type="text"
                        value={r.value}
                        onChange={(e) => setRule(i, { value: e.target.value })}
                        placeholder={isNum ? "ค่าตัวเลข" : r.op === "regex" ? "regex" : "ค่าที่จะเทียบ"}
                        className="w-32 rounded border border-black/15 bg-transparent px-2 py-1 dark:border-white/15 dark:bg-neutral-900"
                      />
                    )}
                    <span className="text-neutral-400">→ ป้าย</span>
                    <input
                      type="text"
                      value={r.then}
                      onChange={(e) => setRule(i, { then: e.target.value })}
                      placeholder="ป้ายที่จะติด"
                      className="w-36 rounded border border-black/15 bg-transparent px-2 py-1 dark:border-white/15 dark:bg-neutral-900"
                    />
                    <span className="ml-auto text-neutral-400 tabular-nums">
                      {!result.error && result.ruleCounts[i] !== undefined ? `${result.ruleCounts[i]} แถว` : ""}
                    </span>
                    <button
                      onClick={() => removeRule(i)}
                      disabled={rules.length <= 1}
                      className="rounded border border-black/15 px-2 py-1 text-neutral-500 hover:bg-black/5 disabled:opacity-30 dark:border-white/15 dark:hover:bg-white/10"
                      title="ลบเงื่อนไข"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
              <button
                onClick={addRule}
                className="rounded-md border border-dashed border-black/20 px-3 py-1.5 text-xs font-medium text-neutral-500 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
              >
                + เพิ่มเงื่อนไข
              </button>
            </div>

            <div className="flex flex-wrap items-end gap-6 border-t border-black/5 pt-3 dark:border-white/5">
              <label className="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400">
                <span>ป้ายเมื่อไม่เข้าเงื่อนไขไหนเลย (else)</span>
                <input
                  type="text"
                  value={elseValue}
                  onChange={(e) => setElseValue(e.target.value)}
                  placeholder="เว้นว่าง"
                  className="w-44 rounded border border-black/15 bg-transparent px-2 py-1 dark:border-white/15 dark:bg-neutral-900"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400">
                <span>ชื่อคอลัมน์ใหม่</span>
                <input
                  type="text"
                  value={colName}
                  onChange={(e) => setColName(e.target.value)}
                  placeholder="ป้าย"
                  className="w-44 rounded border border-black/15 bg-transparent px-2 py-1 dark:border-white/15 dark:bg-neutral-900"
                />
              </label>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-neutral-600 dark:text-neutral-400">
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input type="checkbox" checked={caseInsensitive} onChange={(e) => setCaseInsensitive(e.target.checked)} />
                  ไม่สนพิมพ์เล็ก/ใหญ่
                </label>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} />
                  ตัดช่องว่างหัว-ท้ายก่อนเทียบ
                </label>
              </div>
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
                    ติดป้ายได้ <span className="tabular-nums">{result.matchedRows}</span> แถว
                  </span>
                  <span className="rounded-full bg-neutral-100 px-3 py-1 font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                    ตกกรณีอื่น (else) <span className="tabular-nums">{result.elseRows}</span>
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
                        {isNewCol(i) && " 🏷️"}
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
                          className={`max-w-[220px] truncate whitespace-nowrap px-2 py-1 ${
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

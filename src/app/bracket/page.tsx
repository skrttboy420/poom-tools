"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { columnLetter } from "@/lib/reconcile/columns";
import { downloadText, downloadBlob } from "@/lib/reconcile/export";
import { rowsToCsv, rowsToXlsx, changeExt } from "@/lib/convertfile/convertfile";
import { analyzeBracket, type Bracket, type BracketBoundary } from "@/lib/bracket/bracket";
import FileDropzone from "@/components/FileDropzone";
import type { ParsedFile, Row, SideSelection, Cell } from "@/lib/reconcile/types";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PREVIEW_ROWS = 300;

interface FileState {
  file: ParsedFile;
  sel: SideSelection;
}
interface BracketRow {
  upTo: string;
  value: string;
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
// เดาคอลัมน์: หัวเข้าข่าย น้ำหนัก/weight/kg/cbm ก่อน ไม่งั้นคอลัมน์ตัวเลขตัวแรก
function guessCol(header: Row, data: Row[]): number {
  const keys = ["น้ำหนัก", "weight", "kg", "chargeable", "คิดเงิน", "cbm", "คิว", "ปริมาตร", "ราคา", "จำนวน"];
  for (let i = 0; i < header.length; i++) {
    const h = String(header[i] ?? "").toLowerCase().trim();
    if (h !== "" && keys.some((k) => h.includes(k)) && numericScore(data, i) > 0) return i;
  }
  const cap = Math.max(1, data.slice(0, 60).length);
  for (let i = 0; i < header.length; i++) {
    if (numericScore(data, i) >= cap / 2) return i;
  }
  return -1;
}
// แปลงค่าที่พิมพ์: ถ้าเป็นตัวเลขล้วน → เก็บเป็น number (คิดเลขต่อได้) · ว่าง → null · ไม่งั้นเก็บ string
function coerceValue(s: string): Cell {
  const t = s.trim();
  if (t === "") return null;
  const clean = t.replace(/,/g, "");
  if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(clean) && Number.isFinite(Number(clean))) return Number(clean);
  return t;
}

export default function BracketPage() {
  const [state, setState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [col, setCol] = useState(-1);
  const [boundary, setBoundary] = useState<BracketBoundary>("le");
  const [brackets, setBrackets] = useState<BracketRow[]>([
    { upTo: "10", value: "50" },
    { upTo: "50", value: "40" },
    { upTo: "100", value: "30" },
  ]);
  const [hasCatchAll, setHasCatchAll] = useState(true);
  const [catchAllValue, setCatchAllValue] = useState("20");
  const [colName, setColName] = useState("");

  const header = useMemo(() => headerRowOf(state), [state]);
  const data = useMemo(() => dataRowsOf(state), [state]);
  const headerStr = useMemo(() => header.map((h) => (h === null ? "" : String(h))), [header]);

  const reguess = useCallback((rows: Row[], sel: SideSelection) => {
    const hdr = rows[sel.headerRow] ?? [];
    const dat = rows.slice(sel.dataStart);
    setCol(guessCol(hdr, dat));
  }, []);

  const engineBrackets = useMemo<Bracket[]>(() => {
    const list: Bracket[] = [];
    for (const b of brackets) {
      const t = b.upTo.trim().replace(/,/g, "");
      if (t === "") continue;
      const n = Number(t);
      if (!Number.isFinite(n)) continue;
      list.push({ upTo: n, value: coerceValue(b.value) });
    }
    if (hasCatchAll) list.push({ upTo: null, value: coerceValue(catchAllValue) });
    return list;
  }, [brackets, hasCatchAll, catchAllValue]);

  const result = useMemo(
    () =>
      analyzeBracket(headerStr, data, {
        col,
        brackets: engineBrackets,
        boundary,
        colName: colName.trim() === "" ? undefined : colName,
      }),
    [headerStr, data, col, engineBrackets, boundary, colName],
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

  const setBracketField = (i: number, field: keyof BracketRow, val: string) =>
    setBrackets((cur) => cur.map((b, idx) => (idx === i ? { ...b, [field]: val } : b)));
  const addBracket = () => setBrackets((cur) => [...cur, { upTo: "", value: "" }]);
  const removeBracket = (i: number) => setBrackets((cur) => cur.filter((_, idx) => idx !== i));

  const dlCsv = () => {
    if (!state || result.error) return;
    downloadText(changeExt(state.file.fileName, "csv", "-จัดชั้น"), rowsToCsv([result.header, ...result.rows]), "text/csv");
  };
  const dlXlsx = () => {
    if (!state || result.error) return;
    downloadBlob(changeExt(state.file.fileName, "xlsx", "-จัดชั้น"), rowsToXlsx([result.header, ...result.rows]), XLSX_MIME);
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];
  const shownRows = result.rows.slice(0, PREVIEW_ROWS);
  const isNewCol = (i: number) => result.firstNewIndex >= 0 && i >= result.firstNewIndex;
  const cellStr = (v: Cell) => (v === null || v === undefined ? "" : String(v));
  const cmp = boundary === "le" ? "≤" : "<";

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">จัดชั้นตามช่วงตัวเลข 🪜</h1>
          <p className="text-xs text-neutral-500">
            ค้นค่าตามช่วง (bracket) — เช่น อัตราค่าขนส่งขั้นบันได น้ำหนัก ≤10→เรต 50, ≤50→40, มากกว่านั้น→20 · หรือจัดหมวดขนาด (เล็ก/กลาง/ใหญ่) ·
            ช่องไม่ใช่ตัวเลข/ไม่เข้าช่วงไหน = เว้นว่าง ไม่เดามั่ว
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
                <span>คอลัมน์ที่จะจัดชั้น (ตัวเลข)</span>
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

              <div>
                <span className="text-xs text-neutral-500">การนับขอบบน:</span>
                <div className="mt-1 flex gap-2">
                  <button
                    onClick={() => setBoundary("le")}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                      boundary === "le"
                        ? "border-sky-500/50 bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200"
                        : "border-black/15 text-neutral-500 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                    }`}
                  >
                    ≤ รวมขอบบน
                  </button>
                  <button
                    onClick={() => setBoundary("lt")}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                      boundary === "lt"
                        ? "border-sky-500/50 bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200"
                        : "border-black/15 text-neutral-500 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                    }`}
                  >
                    &lt; ไม่รวมขอบบน
                  </button>
                </div>
              </div>
            </div>

            {/* ช่วง (brackets) */}
            <div className="border-t border-black/5 pt-3 dark:border-white/5">
              <div className="mb-2 text-xs font-medium text-neutral-600 dark:text-neutral-400">
                ช่วง (เรียงจากน้อยไปมากอัตโนมัติ) — ค่า {cmp} ขอบบน → ได้ค่านี้
              </div>
              <div className="space-y-2">
                {brackets.map((b, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-neutral-500">{cmp}</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={b.upTo}
                      onChange={(e) => setBracketField(i, "upTo", e.target.value)}
                      placeholder="ขอบบน"
                      className="w-24 rounded border border-black/15 bg-transparent px-2 py-1 tabular-nums dark:border-white/15"
                    />
                    <span className="text-neutral-500">→</span>
                    <input
                      type="text"
                      value={b.value}
                      onChange={(e) => setBracketField(i, "value", e.target.value)}
                      placeholder="ค่า / ป้าย (เช่น เรต 40 หรือ กลาง)"
                      className="w-56 rounded border border-black/15 bg-transparent px-2 py-1 dark:border-white/15"
                    />
                    <button
                      onClick={() => removeBracket(i)}
                      className="rounded border border-black/15 px-2 py-1 text-neutral-500 hover:bg-red-50 hover:text-red-600 dark:border-white/15 dark:hover:bg-red-950/40"
                      aria-label="ลบช่วง"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={addBracket}
                className="mt-2 rounded-lg border border-dashed border-black/20 px-3 py-1 text-xs text-neutral-500 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
              >
                + เพิ่มช่วง
              </button>

              {/* catch-all */}
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-black/5 pt-3 text-xs dark:border-white/5">
                <label className="flex cursor-pointer items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
                  <input type="checkbox" checked={hasCatchAll} onChange={(e) => setHasCatchAll(e.target.checked)} />
                  และมากกว่านั้น →
                </label>
                <input
                  type="text"
                  value={catchAllValue}
                  onChange={(e) => setCatchAllValue(e.target.value)}
                  disabled={!hasCatchAll}
                  placeholder="ค่าชั้นบนสุด"
                  className="w-56 rounded border border-black/15 bg-transparent px-2 py-1 disabled:opacity-40 dark:border-white/15"
                />
                <span className="text-neutral-400">(ถ้าไม่ติ๊ก ค่าที่เกินขอบสุดท้ายจะเว้นว่าง = นอกช่วง)</span>
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-6 border-t border-black/5 pt-3 dark:border-white/5">
              <label className="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-400">
                <span>ชื่อคอลัมน์ใหม่</span>
                <input
                  type="text"
                  value={colName}
                  onChange={(e) => setColName(e.target.value)}
                  placeholder="ชั้น"
                  className="w-48 rounded border border-black/15 bg-transparent px-2 py-1 dark:border-white/15 dark:bg-neutral-900"
                />
              </label>
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
                    จัดชั้นได้ <span className="tabular-nums">{result.matchedRows}</span> แถว
                  </span>
                  {result.outOfRangeRows > 0 && (
                    <span className="rounded-full bg-orange-100 px-3 py-1 font-medium text-orange-800 dark:bg-orange-900/40 dark:text-orange-300">
                      นอกช่วง <span className="tabular-nums">{result.outOfRangeRows}</span>
                    </span>
                  )}
                  {result.skippedRows > 0 && (
                    <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                      ไม่ใช่ตัวเลข (คงเดิม) <span className="tabular-nums">{result.skippedRows}</span>
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

            <div className="max-h-[55vh] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-900">
                  <tr>
                    <th className="px-2 py-1.5">#</th>
                    {result.header.map((h, i) => (
                      <th key={i} className={`px-2 py-1.5 whitespace-nowrap ${isNewCol(i) ? "text-emerald-700 dark:text-emerald-300" : ""}`}>
                        {h === "" || h === null ? columnLetter(i) : String(h)}
                        {isNewCol(i) && " 🪜"}
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

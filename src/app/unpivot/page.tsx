"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { columnOptionLabel, columnLetter } from "@/lib/reconcile/columns";
import { downloadText, downloadBlob } from "@/lib/reconcile/export";
import { rowsToCsv, rowsToXlsx, changeExt } from "@/lib/convertfile/convertfile";
import { unpivotTable } from "@/lib/unpivot/unpivot";
import FileDropzone from "@/components/FileDropzone";
import type { Cell, ParsedFile, Row, SideSelection } from "@/lib/reconcile/types";

const PREVIEW_ROWS = 300;
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

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

function fmtCell(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "";
    return (Math.round(v * 1e6) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 6 });
  }
  return String(v);
}

// เดาว่าคอลัมน์ไหน "เป็นค่า (ตัวเลข)" จากตัวอย่างแถว → value; ที่เหลือ = id
function looksNumeric(v: Cell): boolean {
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "string") {
    const s = v.replace(/,/g, "").trim();
    if (s === "") return false;
    return Number.isFinite(Number(s));
  }
  return false;
}

export default function UnpivotPage() {
  const [state, setState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [idCols, setIdCols] = useState<number[]>([]);
  const [valueCols, setValueCols] = useState<number[]>([]);
  const [varName, setVarName] = useState("");
  const [valueName, setValueName] = useState("");
  const [dropEmpty, setDropEmpty] = useState(false);

  const header = useMemo(() => headerRowOf(state), [state]);
  const data = useMemo(() => dataRowsOf(state), [state]);

  const validId = useMemo(() => idCols.filter((c) => c >= 0 && c < header.length), [idCols, header]);
  const validValue = useMemo(() => valueCols.filter((c) => c >= 0 && c < header.length), [valueCols, header]);
  const ready = validValue.length > 0;

  const result = useMemo(
    () =>
      ready
        ? unpivotTable(header, data, validId, validValue, { varName, valueName, dropEmpty })
        : null,
    [ready, header, data, validId, validValue, varName, valueName, dropEmpty],
  );

  // เดาเริ่มต้น: คอลัมน์ตัวเลข = ค่า (คลี่) · คอลัมน์ข้อความ = id (ตรึง)
  const autoGuess = useCallback((hdr: Row, rows: Row[]) => {
    const width = hdr.length;
    if (width === 0) {
      setIdCols([]);
      setValueCols([]);
      return;
    }
    const sample = rows.slice(0, 20);
    const numericCols: number[] = [];
    const textCols: number[] = [];
    for (let c = 0; c < width; c++) {
      let filled = 0;
      let numeric = 0;
      for (const r of sample) {
        const v = c < r.length ? (r[c] ?? null) : null;
        if (v === null || (typeof v === "string" && v.trim() === "")) continue;
        filled++;
        if (looksNumeric(v)) numeric++;
      }
      if (filled > 0 && numeric >= filled / 2) numericCols.push(c);
      else textCols.push(c);
    }
    if (numericCols.length > 0 && textCols.length > 0) {
      setIdCols(textCols);
      setValueCols(numericCols);
    } else {
      // ไม่ชัด → ตรึงคอลัมน์แรก คลี่ที่เหลือ
      setIdCols([0]);
      setValueCols(Array.from({ length: width - 1 }, (_, i) => i + 1));
    }
  }, []);

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setError(null);
      setBusy(true);
      try {
        const parsed = await parseFile(file);
        const sel = makeSelection(parsed, 0);
        setState({ file: parsed, sel });
        const rows = parsed.sheets[sel.sheetIndex]?.rows ?? [];
        autoGuess(rows[sel.headerRow] ?? [], rows.slice(sel.dataStart));
      } catch (e) {
        setError(`อ่านไฟล์ ${file.name} ไม่สำเร็จ: ${(e as Error).message}`);
      } finally {
        setBusy(false);
      }
    },
    [autoGuess],
  );

  const updateSel = useCallback(
    (patch: Partial<SideSelection>) => {
      setState((cur) => {
        if (!cur) return cur;
        const next = { ...cur, sel: { ...cur.sel, ...patch } };
        const rows = next.file.sheets[next.sel.sheetIndex]?.rows ?? [];
        autoGuess(rows[next.sel.headerRow] ?? [], rows.slice(next.sel.dataStart));
        return next;
      });
    },
    [autoGuess],
  );

  // toggle คอลัมน์ id/ค่า แบบไม่ให้ซ้อนกัน (คอลัมน์เดียวเป็นได้อย่างเดียว)
  const toggleId = (i: number) => {
    setIdCols((cur) => (cur.includes(i) ? cur.filter((c) => c !== i) : [...cur, i]));
    setValueCols((cur) => cur.filter((c) => c !== i));
  };
  const toggleValue = (i: number) => {
    setValueCols((cur) => (cur.includes(i) ? cur.filter((c) => c !== i) : [...cur, i]));
    setIdCols((cur) => cur.filter((c) => c !== i));
  };

  const dlCsv = () => {
    if (!state || !result) return;
    downloadText(changeExt(state.file.fileName, "csv", "-คลี่"), rowsToCsv([result.header, ...result.rows]), "text/csv");
  };
  const dlXlsx = () => {
    if (!state || !result) return;
    downloadBlob(changeExt(state.file.fileName, "xlsx", "-คลี่"), rowsToXlsx([result.header, ...result.rows]), XLSX_MIME);
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];
  const shownRows = result ? result.rows.slice(0, PREVIEW_ROWS) : [];

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">คลี่ตารางกว้าง → แนวยาว (Unpivot) 🔃</h1>
          <p className="text-xs text-neutral-500">
            ตรงข้ามกับ Pivot — ตารางที่มีคอลัมน์ค่ากระจายหลายหัว (เช่น น้ำหนักแยกตาม forwarder เจ้าละคอลัมน์) → คลี่เป็น &quot;1 แถวต่อ 1 ค่า&quot; เพื่อ normalize ก่อนเทียบ/จัดกลุ่ม
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
            <h2 className="text-sm font-semibold">ไฟล์ที่จะคลี่</h2>
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

        {/* STEP 2: ตั้งค่าการคลี่ */}
        {state && (
          <div className="space-y-4 rounded-xl border border-black/10 p-4 dark:border-white/10">
            <div>
              <h2 className="mb-1 text-sm font-semibold">
                คอลัมน์ที่ตรึงไว้ (id) — <span className="text-neutral-400">คัดลอกซ้ำทุกแถวที่คลี่</span>
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {header.map((h, i) => {
                  const on = idCols.includes(i);
                  return (
                    <button
                      key={i}
                      onClick={() => toggleId(i)}
                      title={columnOptionLabel(h, i)}
                      className={`rounded-full border px-2.5 py-1 text-xs transition ${
                        on
                          ? "border-sky-600 bg-sky-600 text-white"
                          : "border-black/15 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                      }`}
                    >
                      {columnLetter(i)} · {h === null || String(h).trim() === "" ? "(ว่าง)" : String(h)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <h2 className="mb-1 text-sm font-semibold">
                คอลัมน์ค่าที่จะคลี่ (value) — <span className="text-neutral-400">แต่ละหัวกลายเป็น 1 แถว</span>
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {header.map((h, i) => {
                  const on = valueCols.includes(i);
                  return (
                    <button
                      key={i}
                      onClick={() => toggleValue(i)}
                      title={columnOptionLabel(h, i)}
                      className={`rounded-full border px-2.5 py-1 text-xs transition ${
                        on
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-black/15 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                      }`}
                    >
                      {columnLetter(i)} · {h === null || String(h).trim() === "" ? "(ว่าง)" : String(h)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-4">
              <label className="flex flex-col gap-1 text-xs text-neutral-500">
                ชื่อหัวคอลัมน์ &quot;ตัวแปร&quot;
                <input
                  value={varName}
                  onChange={(e) => setVarName(e.target.value)}
                  placeholder="คอลัมน์"
                  className="w-40 rounded border border-black/15 bg-transparent px-2 py-1.5 text-sm dark:border-white/15"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-neutral-500">
                ชื่อหัวคอลัมน์ &quot;ค่า&quot;
                <input
                  value={valueName}
                  onChange={(e) => setValueName(e.target.value)}
                  placeholder="ค่า"
                  className="w-40 rounded border border-black/15 bg-transparent px-2 py-1.5 text-sm dark:border-white/15"
                />
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400" title="ข้ามแถวผลลัพธ์ที่ช่องค่าว่าง (ตารางกว้างมักมีช่องว่างเยอะ)">
                <input type="checkbox" checked={dropEmpty} onChange={(e) => setDropEmpty(e.target.checked)} />
                ข้ามแถวที่ค่าว่าง
              </label>
            </div>
          </div>
        )}

        {/* STEP 3: ผลลัพธ์ */}
        {state && result && !result.error && (
          <div className="rounded-xl border border-black/10 dark:border-white/10">
            <div className="flex flex-wrap items-center gap-2 border-b border-black/10 px-3 py-2 text-xs dark:border-white/10">
              <span className="rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                <span className="tabular-nums">{result.inputRows}</span> แถว → <span className="tabular-nums">{result.outputRows}</span> แถว · คลี่ {result.valueCols.length} คอลัมน์
              </span>
              {result.droppedEmpty > 0 && (
                <span className="text-neutral-400">ข้ามช่องว่าง {result.droppedEmpty}</span>
              )}
              {result.outputRows > PREVIEW_ROWS && (
                <span className="text-amber-600 dark:text-amber-400">แสดง {PREVIEW_ROWS} แถวแรก</span>
              )}
              <div className="ml-auto flex gap-2">
                <button onClick={dlCsv} className="rounded-md border border-emerald-600 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40">
                  ↓ CSV
                </button>
                <button onClick={dlXlsx} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700">
                  ↓ Excel
                </button>
              </div>
            </div>

            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-neutral-50 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
                  <tr>
                    <th className="border-b border-r border-black/10 px-2 py-1.5 text-right text-neutral-400 dark:border-white/10">#</th>
                    {result.header.map((h, i) => {
                      const isVar = i === result.header.length - 2;
                      const isVal = i === result.header.length - 1;
                      return (
                        <th
                          key={i}
                          className={`border-b border-black/10 px-2 py-1.5 text-left whitespace-nowrap dark:border-white/10 ${
                            isVar
                              ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300"
                              : isVal
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                                : ""
                          }`}
                        >
                          {fmtCell(h)}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {shownRows.map((r, ri) => (
                    <tr key={ri} className="border-t border-black/5 dark:border-white/5">
                      <td className="border-r border-black/10 px-2 py-1 text-right text-neutral-400 dark:border-white/10">{ri + 1}</td>
                      {r.map((c, ci) => {
                        const isVar = ci === r.length - 2;
                        const isVal = ci === r.length - 1;
                        return (
                          <td
                            key={ci}
                            className={`px-2 py-1 whitespace-nowrap ${
                              isVar
                                ? "bg-indigo-50/50 text-indigo-800 dark:bg-indigo-950/20 dark:text-indigo-300"
                                : isVal
                                  ? "bg-emerald-50/50 text-right tabular-nums dark:bg-emerald-950/20"
                                  : ""
                            }`}
                          >
                            {fmtCell(c)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {state && result?.error && (
          <p className="rounded-md border border-amber-500/30 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
            {result.error}
          </p>
        )}

        {state && !ready && (
          <p className="rounded-md border border-black/10 px-4 py-3 text-sm text-neutral-500 dark:border-white/10">
            เลือก &quot;คอลัมน์ค่าที่จะคลี่&quot; อย่างน้อย 1 คอลัมน์ เพื่อคลี่ตาราง
          </p>
        )}
      </section>
    </main>
  );
}

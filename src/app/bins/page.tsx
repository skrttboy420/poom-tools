"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { columnOptionLabel, columnLetter } from "@/lib/reconcile/columns";
import { downloadText } from "@/lib/reconcile/export";
import { changeExt } from "@/lib/convertfile/convertfile";
import { computeBins, binsToCsv, type BinMode } from "@/lib/bins/bins";
import FileDropzone from "@/components/FileDropzone";
import type { Cell, ParsedFile, Row, SideSelection } from "@/lib/reconcile/types";

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

function looksNumeric(v: Cell): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "boolean") return false;
  if (typeof v === "number") return Number.isFinite(v);
  const s = String(v).replace(/,/g, "").trim();
  if (s === "") return false;
  return Number.isFinite(Number(s));
}

// เดาคอลัมน์เริ่มต้น: ชื่อหัวเข้าข่ายค่าตัวเลข (kg/cbm/น้ำหนัก/กล่อง) ก่อน; ไม่งั้นคอลัมน์ที่เป็นตัวเลขมากสุด
function guessColumn(header: Row, rows: Row[]): number {
  const width = header.length;
  if (width === 0) return -1;
  const NAME_HINT = /kg|น้ำหนัก|weight|cbm|คิว|ปริมาตร|volume|กล่อง|box|จำนวน|qty|quantity|ราคา|price|amount|ยอด/i;
  const sample = rows.slice(0, 200);
  const ratioOf = (c: number): number => {
    let filled = 0;
    let numeric = 0;
    for (const r of sample) {
      const v = c < r.length ? (r[c] ?? null) : null;
      if (v === null || (typeof v === "string" && v.trim() === "")) continue;
      filled++;
      if (looksNumeric(v)) numeric++;
    }
    return filled === 0 ? 0 : numeric / filled;
  };
  // ชื่อหัวเข้าข่าย + ค่าเป็นตัวเลขจริง
  for (let c = 0; c < width; c++) {
    if (NAME_HINT.test(headerText(header[c])) && ratioOf(c) >= 0.5) return c;
  }
  // คอลัมน์ที่เป็นตัวเลขมากสุด
  let best = -1;
  let bestRatio = 0.5; // ต้องเกินครึ่งถึงถือว่าเป็นคอลัมน์ตัวเลข
  for (let c = 0; c < width; c++) {
    const ratio = ratioOf(c);
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = c;
    }
  }
  return best >= 0 ? best : 0;
}

const MODES: { key: BinMode; label: string; hint: string }[] = [
  { key: "width", label: "กว้างช่วงเท่ากัน", hint: "กำหนดความกว้างต่อช่วง เช่น ทุก 10 kg" },
  { key: "count", label: "จำนวนช่วง", hint: "แบ่งเป็น N ช่วงเท่า ๆ กันบน [ต่ำสุด, สูงสุด]" },
  { key: "breaks", label: "จุดตัดเอง", hint: "กำหนดจุดตัดเอง เช่น 10, 50, 100 → <10 / 10-50 / 50-100 / ≥100" },
];

export default function BinsPage() {
  const [state, setState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [col, setCol] = useState(-1);
  const [mode, setMode] = useState<BinMode>("width");
  const [width, setWidth] = useState(10);
  const [binCount, setBinCount] = useState(5);
  const [breaksText, setBreaksText] = useState("10, 50, 100");

  const header = useMemo(() => headerRowOf(state), [state]);
  const data = useMemo(() => dataRowsOf(state), [state]);

  const breaks = useMemo(
    () =>
      breaksText
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter((s) => s !== "")
        .map(Number)
        .filter((n) => Number.isFinite(n)),
    [breaksText],
  );

  const result = useMemo(
    () =>
      state && col >= 0
        ? computeBins(header.map((h) => headerText(h)), data, { col, mode, width, binCount, breaks })
        : null,
    [state, header, data, col, mode, width, binCount, breaks],
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

  const dlCsv = () => {
    if (!state || !result || result.error) return;
    downloadText(changeExt(state.file.fileName, "csv", "-ช่วง"), binsToCsv(result), "text/csv");
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];
  const barMax = result ? result.bins.reduce((m, b) => Math.max(m, b.count), 0) : 0;

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">จัดกลุ่มช่วงตัวเลข (Histogram) 📶</h1>
          <p className="text-xs text-neutral-500">
            เลือก 1 คอลัมน์ตัวเลข → นับว่ามีกี่รายการในแต่ละช่วง เช่น &quot;มีกี่พัสดุในช่วง 0-10 / 10-50 / 50+ kg&quot; ·
            แบ่งได้ 3 แบบ (กว้างเท่ากัน / จำนวนช่วง / จุดตัดเอง) · อ่านอย่างเดียว ไม่แก้ข้อมูล
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
            <h2 className="text-sm font-semibold">ไฟล์ที่จะจัดกลุ่มช่วง</h2>
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

        {/* STEP 2: เลือกคอลัมน์ + โหมด */}
        {state && (
          <div className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
            <div>
              <h2 className="mb-1 text-sm font-semibold">คอลัมน์ตัวเลขที่จะจัดกลุ่ม</h2>
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
                          ? "border-indigo-600 bg-indigo-600 text-white"
                          : "border-black/15 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                      }`}
                    >
                      {columnLetter(i)} · {headerText(h) || "(ว่าง)"}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <h2 className="mb-1 text-sm font-semibold">วิธีแบ่งช่วง</h2>
              <div className="flex flex-wrap gap-1.5">
                {MODES.map((m) => {
                  const on = mode === m.key;
                  return (
                    <button
                      key={m.key}
                      onClick={() => setMode(m.key)}
                      title={m.hint}
                      className={`rounded-full border px-3 py-1 text-xs transition ${
                        on
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-black/15 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                      }`}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-[11px] text-neutral-400">{MODES.find((m) => m.key === mode)?.hint}</p>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs">
              {mode === "width" && (
                <label className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
                  ความกว้างต่อช่วง:
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={width}
                    onChange={(e) => setWidth(Number(e.target.value))}
                    className="w-24 rounded border border-black/15 bg-transparent px-1.5 py-1 dark:border-white/15 dark:bg-neutral-900"
                  />
                </label>
              )}
              {mode === "count" && (
                <label className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
                  จำนวนช่วง:
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={binCount}
                    onChange={(e) => setBinCount(Math.floor(Number(e.target.value)) || 0)}
                    className="w-24 rounded border border-black/15 bg-transparent px-1.5 py-1 dark:border-white/15 dark:bg-neutral-900"
                  />
                </label>
              )}
              {mode === "breaks" && (
                <label className="flex flex-1 items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
                  จุดตัด (คั่นด้วย , หรือช่องว่าง):
                  <input
                    type="text"
                    value={breaksText}
                    onChange={(e) => setBreaksText(e.target.value)}
                    placeholder="เช่น 10, 50, 100"
                    className="w-56 rounded border border-black/15 bg-transparent px-1.5 py-1 dark:border-white/15 dark:bg-neutral-900"
                  />
                </label>
              )}
            </div>
          </div>
        )}

        {/* STEP 3: ผลลัพธ์ */}
        {state && result && !result.error && (
          <div className="rounded-xl border border-black/10 dark:border-white/10">
            <div className="flex flex-wrap items-center gap-2 border-b border-black/10 px-3 py-2 text-xs dark:border-white/10">
              <span className="rounded-full bg-indigo-100 px-3 py-1 font-medium text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300">
                ค่าตัวเลข <span className="tabular-nums">{result.numericCount.toLocaleString("en-US")}</span> · {result.bins.length} ช่วง
              </span>
              {result.min !== null && result.max !== null && (
                <span className="text-neutral-400">
                  ต่ำสุด {result.min.toLocaleString("en-US")} · สูงสุด {result.max.toLocaleString("en-US")}
                </span>
              )}
              <span className="text-neutral-400">รวม {result.total.toLocaleString("en-US")}</span>
              {result.skipped > 0 && (
                <span className="text-amber-600 dark:text-amber-400">ข้ามที่ไม่ใช่ตัวเลข {result.skipped}</span>
              )}
              <div className="ml-auto">
                <button onClick={dlCsv} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700">
                  ↓ CSV
                </button>
              </div>
            </div>

            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-neutral-50 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
                  <tr>
                    <th className="border-b border-r border-black/10 px-2 py-1.5 text-right text-neutral-400 dark:border-white/10">#</th>
                    <th className="border-b border-black/10 px-2 py-1.5 text-left dark:border-white/10">ช่วง</th>
                    <th className="border-b border-black/10 px-2 py-1.5 text-right dark:border-white/10">จำนวน</th>
                    <th className="border-b border-black/10 px-2 py-1.5 text-right dark:border-white/10">%</th>
                    <th className="border-b border-black/10 px-2 py-1.5 text-left dark:border-white/10">สัดส่วน</th>
                    <th className="border-b border-black/10 px-2 py-1.5 text-right dark:border-white/10">ผลรวม</th>
                  </tr>
                </thead>
                <tbody>
                  {result.bins.map((b, ri) => (
                    <tr key={ri} className="border-t border-black/5 dark:border-white/5">
                      <td className="border-r border-black/10 px-2 py-1 text-right text-neutral-400 dark:border-white/10">{ri + 1}</td>
                      <td className="px-2 py-1 whitespace-nowrap font-medium tabular-nums">{b.label}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{b.count.toLocaleString("en-US")}</td>
                      <td className="px-2 py-1 text-right tabular-nums text-neutral-500">{(Math.round(b.percent * 10) / 10).toFixed(1)}%</td>
                      <td className="px-2 py-1">
                        <div className="h-3 w-32 overflow-hidden rounded bg-black/5 dark:bg-white/10">
                          <div
                            className="h-full rounded bg-indigo-500/70"
                            style={{ width: `${barMax > 0 ? (b.count / barMax) * 100 : 0}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums text-neutral-500">{b.sum.toLocaleString("en-US")}</td>
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

        {state && col < 0 && (
          <p className="rounded-md border border-black/10 px-4 py-3 text-sm text-neutral-500 dark:border-white/10">
            เลือกคอลัมน์ตัวเลขที่จะจัดกลุ่มช่วง
          </p>
        )}
      </section>
    </main>
  );
}

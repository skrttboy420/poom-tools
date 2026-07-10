"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { columnLetter } from "@/lib/reconcile/columns";
import { downloadText, downloadBlob } from "@/lib/reconcile/export";
import { rowsToCsv, rowsToXlsx, changeExt } from "@/lib/convertfile/convertfile";
import { analyzeGroupShare, type GroupMetric } from "@/lib/groupshare/groupshare";
import FileDropzone from "@/components/FileDropzone";
import type { ParsedFile, Row, SideSelection, Cell } from "@/lib/reconcile/types";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PREVIEW_ROWS = 300;

const METRICS: { id: GroupMetric; label: string; hint: string }[] = [
  { id: "share", label: "% ในกลุ่ม", hint: "ค่า ÷ ยอดรวมของกลุ่ม × 100" },
  { id: "group-total", label: "ยอดรวมกลุ่ม", hint: "ผลรวมค่าของทั้งกลุ่ม(เติมทุกแถว)" },
  { id: "rank", label: "อันดับในกลุ่ม", hint: "อันดับค่าภายในกลุ่ม (เท่ากันได้อันดับเดียวกัน 1-2-2-4)" },
];

const GROUP_HINT = /container|ตู้|คอนเทนเนอร์|forwarder|ผู้ส่ง|เจ้า|วันที่|date|status|สถานะ|ประเภท|type|กลุ่ม|group|สาย|route/i;

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

function guessValueCol(header: Row, data: Row[]): number {
  // ชื่อหัวเข้าข่าย + เป็นตัวเลข
  for (let c = 0; c < header.length; c++) {
    if (/kg|น้ำหนัก|weight|cbm|คิว|ปริมาตร|กล่อง|box|ชิ้น|qty|จำนวน|amount|มูลค่า/i.test(String(header[c] ?? "")) && numericScore(data, c) > 0) {
      return c;
    }
  }
  let best = -1;
  let bestScore = 0;
  for (let c = 0; c < header.length; c++) {
    const s = numericScore(data, c);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return best >= 0 ? best : 0;
}

function guessGroupCol(header: Row, data: Row[], valueCol: number): number {
  for (let c = 0; c < header.length; c++) {
    if (c !== valueCol && GROUP_HINT.test(String(header[c] ?? ""))) return c;
  }
  // ไม่งั้น: คอลัมน์ที่ไม่ใช่ตัวเลข ตัวแรก (มักเป็นคีย์/หมวด)
  for (let c = 0; c < header.length; c++) {
    if (c !== valueCol && numericScore(data, c) < data.slice(0, 60).length / 2) return c;
  }
  return valueCol === 0 ? Math.min(1, Math.max(0, header.length - 1)) : 0;
}

export default function GroupSharePage() {
  const [state, setState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [groupCols, setGroupCols] = useState<number[]>([]);
  const [valueCol, setValueCol] = useState(0);
  const [metrics, setMetrics] = useState<GroupMetric[]>(["share", "group-total"]);
  const [rankDesc, setRankDesc] = useState(true);
  const [roundOn, setRoundOn] = useState(true);
  const [roundPlaces, setRoundPlaces] = useState("2");
  const [ignoreEmptyKey, setIgnoreEmptyKey] = useState(true);

  const header = useMemo(() => headerRowOf(state), [state]);
  const data = useMemo(() => dataRowsOf(state), [state]);
  const headerStr = useMemo(() => header.map((h) => (h === null ? "" : String(h))), [header]);

  const reguess = useCallback((rows: Row[], sel: SideSelection) => {
    const hdr = rows[sel.headerRow] ?? [];
    const dat = rows.slice(sel.dataStart);
    const vc = guessValueCol(hdr, dat);
    const gc = guessGroupCol(hdr, dat, vc);
    setValueCol(vc);
    setGroupCols([gc]);
  }, []);

  const result = useMemo(
    () =>
      analyzeGroupShare(headerStr, data, {
        groupCols,
        valueCol,
        metrics,
        round: roundOn ? Math.max(0, Number(roundPlaces) || 0) : null,
        ignoreEmptyKey,
        rankDir: rankDesc ? "desc" : "asc",
      }),
    [headerStr, data, groupCols, valueCol, metrics, roundOn, roundPlaces, ignoreEmptyKey, rankDesc],
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

  const toggleGroupCol = (c: number) => {
    setGroupCols((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));
  };
  const toggleMetric = (m: GroupMetric) => {
    setMetrics((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));
  };

  const dlCsv = () => {
    if (!state || result.error) return;
    downloadText(changeExt(state.file.fileName, "csv", "-สัดส่วนกลุ่ม"), rowsToCsv([result.header, ...result.rows]), "text/csv");
  };
  const dlXlsx = () => {
    if (!state || result.error) return;
    downloadBlob(changeExt(state.file.fileName, "xlsx", "-สัดส่วนกลุ่ม"), rowsToXlsx([result.header, ...result.rows]), XLSX_MIME);
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];
  const shownRows = result.rows.slice(0, PREVIEW_ROWS);
  const firstNew = result.header.length - result.addedCols.length;
  const isNewCol = (i: number) => i >= firstNew;
  const cellStr = (v: Cell) => (v === null || v === undefined ? "" : String(v));

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">สัดส่วน &amp; อันดับในกลุ่ม 🥧</h1>
          <p className="text-xs text-neutral-500">
            เติมคอลัมน์ต่อแถว — แต่ละแถวคิดเป็นกี่ % ของ &quot;กลุ่มตัวเอง&quot; (เช่นกล่องนี้กี่ % ของน้ำหนักในตู้) · ยอดรวมกลุ่ม · อันดับในกลุ่ม ·
            เติมท้ายตาราง ไม่แตะข้อมูลเดิม · ช่องที่ไม่ใช่ตัวเลข = เว้นว่าง ไม่นับเข้ารวม
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

        {/* STEP 2: ตั้งค่า */}
        {state && (
          <div className="space-y-4 rounded-xl border border-black/10 p-4 dark:border-white/10">
            <div>
              <h2 className="mb-1 text-sm font-semibold">จัดกลุ่มตามคอลัมน์ (เลือกได้หลายชั้น)</h2>
              <div className="flex flex-wrap gap-1.5">
                {header.map((_, i) => {
                  const on = groupCols.includes(i);
                  const order = groupCols.indexOf(i);
                  return (
                    <button
                      key={i}
                      onClick={() => toggleGroupCol(i)}
                      className={`rounded-full border px-2.5 py-1 text-xs transition ${
                        on
                          ? "border-sky-500 bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200"
                          : "border-black/15 text-neutral-500 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                      }`}
                    >
                      {on ? `${order + 1}. ` : ""}
                      {columnLetter(i)} · {colLabel(header, i)}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-xs text-neutral-500">คอลัมน์ค่า (ตัวเลข):</span>
              <select
                value={valueCol}
                onChange={(e) => setValueCol(Number(e.target.value))}
                className="rounded border border-black/15 bg-transparent px-2 py-1.5 text-sm dark:border-white/15 dark:bg-neutral-900"
              >
                {header.map((_, i) => (
                  <option key={i} value={i}>
                    {columnLetter(i)} · {colLabel(header, i)}
                  </option>
                ))}
              </select>
            </label>

            <div>
              <span className="text-xs text-neutral-500">ค่าที่จะเติม:</span>
              <div className="mt-1 flex flex-wrap gap-2">
                {METRICS.map((m) => {
                  const on = metrics.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      onClick={() => toggleMetric(m.id)}
                      title={m.hint}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                        on
                          ? "border-emerald-500/50 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                          : "border-black/15 text-neutral-500 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                      }`}
                    >
                      {on ? "✓ " : ""}
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 border-t border-black/5 pt-3 text-xs dark:border-white/5">
              {metrics.includes("rank") && (
                <div className="flex items-center gap-1.5">
                  <span className="text-neutral-500">อันดับ:</span>
                  <div className="flex overflow-hidden rounded border border-black/15 dark:border-white/15">
                    <button
                      onClick={() => setRankDesc(true)}
                      className={`px-2 py-0.5 ${rankDesc ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200" : "text-neutral-500"}`}
                    >
                      มากสุด = 1
                    </button>
                    <button
                      onClick={() => setRankDesc(false)}
                      className={`px-2 py-0.5 ${!rankDesc ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200" : "text-neutral-500"}`}
                    >
                      น้อยสุด = 1
                    </button>
                  </div>
                </div>
              )}
              <label className="flex cursor-pointer items-center gap-1.5 text-neutral-600 dark:text-neutral-400" title="แถวที่คอลัมน์จัดกลุ่มว่าง (เช่นแถวรวม/subtotal) → เว้นว่าง ไม่จัดกลุ่ม">
                <input type="checkbox" checked={ignoreEmptyKey} onChange={(e) => setIgnoreEmptyKey(e.target.checked)} />
                ข้ามแถวคีย์ว่าง
              </label>
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
                  <span className="rounded-full bg-sky-100 px-3 py-1 font-medium text-sky-800 dark:bg-sky-900/40 dark:text-sky-300">
                    {result.groups.toLocaleString()} กลุ่ม
                  </span>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                    แถวตัวเลข <span className="tabular-nums">{result.numericRows}</span>
                  </span>
                  {result.skipped > 0 && (
                    <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                      เว้นว่าง <span className="tabular-nums">{result.skipped}</span>
                    </span>
                  )}
                  {result.ignoredKeyRows > 0 && (
                    <span className="rounded-full bg-neutral-100 px-3 py-1 font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                      ข้ามคีย์ว่าง <span className="tabular-nums">{result.ignoredKeyRows}</span>
                    </span>
                  )}
                  <span className="text-neutral-400">เติม {result.addedCols.length} คอลัมน์</span>
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
                        {isNewCol(i) && " 🥧"}
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

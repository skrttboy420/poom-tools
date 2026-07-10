"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { columnOptionLabel, columnLetter } from "@/lib/reconcile/columns";
import { downloadText } from "@/lib/reconcile/export";
import { changeExt } from "@/lib/convertfile/convertfile";
import { findNearDuplicates, nearDupToCsv } from "@/lib/neardup/neardup";
import FileDropzone from "@/components/FileDropzone";
import type { Cell, ParsedFile, Row, SideSelection } from "@/lib/reconcile/types";

const PREVIEW_PAIRS = 500;

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

// เดาคอลัมน์ที่น่าตรวจ: ชื่อหัวเข้าข่าย identifier ก่อน; ไม่งั้นคอลัมน์ข้อความที่ค่าไม่ซ้ำเยอะสุด
function guessColumn(header: Row, rows: Row[]): number {
  const width = header.length;
  if (width === 0) return -1;
  const NAME_HINT = /tracking|พัสดุ|awb|ref|อ้างอิง|ตู้|container|hbl|mbl|forwarder|เลข|barcode|code|รหัส|no\.?/i;
  const sample = rows.slice(0, 300);

  for (let c = 0; c < width; c++) {
    if (NAME_HINT.test(headerText(header[c]))) return c;
  }
  // เลือกคอลัมน์ที่เป็นข้อความ (ไม่ใช่ตัวเลขล้วน) และค่าไม่ซ้ำเยอะสุด
  let best = 0;
  let bestDistinct = -1;
  for (let c = 0; c < width; c++) {
    const seen = new Set<string>();
    let numeric = 0;
    let filled = 0;
    for (const r of sample) {
      const v: Cell = c < r.length ? (r[c] ?? null) : null;
      if (v === null || (typeof v === "string" && v.trim() === "")) continue;
      filled++;
      const s = String(v).trim();
      seen.add(s.toLowerCase());
      if (s.replace(/,/g, "") !== "" && Number.isFinite(Number(s.replace(/,/g, "")))) numeric++;
    }
    if (filled === 0) continue;
    if (numeric >= filled * 0.9) continue; // คอลัมน์ตัวเลขล้วน มักไม่ใช่ identifier ที่พิมพ์ผิด
    if (seen.size > bestDistinct) {
      bestDistinct = seen.size;
      best = c;
    }
  }
  return best;
}

const DIST_OPTIONS = [1, 2, 3];

export default function NearDupPage() {
  const [state, setState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [col, setCol] = useState(-1);
  const [maxDistance, setMaxDistance] = useState(1);
  const [caseInsensitive, setCaseInsensitive] = useState(true);
  const [trim, setTrim] = useState(true);
  const [collapseSpaces, setCollapseSpaces] = useState(false);

  const header = useMemo(() => headerRowOf(state), [state]);
  const data = useMemo(() => dataRowsOf(state), [state]);

  const result = useMemo(
    () =>
      state && col >= 0
        ? findNearDuplicates(header, data, col, {
            maxDistance,
            caseInsensitive,
            trim,
            collapseSpaces,
          })
        : null,
    [state, header, data, col, maxDistance, caseInsensitive, trim, collapseSpaces],
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
    if (!state || !result || result.error || result.pairs.length === 0) return;
    downloadText(changeExt(state.file.fileName, "csv", "-คล้ายกัน"), nearDupToCsv(result), "text/csv");
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];
  const shownPairs = result ? result.pairs.slice(0, PREVIEW_PAIRS) : [];

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">หาค่าที่คล้ายกัน (Near-duplicate) 🫧</h1>
          <p className="text-xs text-neutral-500">
            เลือก 1 คอลัมน์ (เช่น tracking / เลขตู้) → หาคู่ค่าที่<b>คล้ายกันแต่ไม่เหมือนเป๊ะ</b>{" "}
            (พิมพ์ผิด O↔0, สลับตัว, ช่องว่างเกิน) ที่ทำให้ reconcile จับคู่ไม่ติด · โชว์คู่ที่น่าสงสัยให้ดูก่อน ไม่แก้ให้
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

        {/* STEP 2: เลือกคอลัมน์ + ตัวเลือก */}
        {state && (
          <div className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
            <div>
              <h2 className="mb-1 text-sm font-semibold">คอลัมน์ที่จะตรวจ</h2>
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

            <div className="flex flex-wrap items-center gap-4 text-xs">
              <label className="flex items-center gap-1 text-neutral-500" title="ต่างกันได้กี่ตำแหน่งถึงนับว่าใกล้">
                ต่างได้ไม่เกิน:
                <select
                  value={maxDistance}
                  onChange={(e) => setMaxDistance(Number(e.target.value))}
                  className="rounded border border-black/15 bg-transparent px-1.5 py-1 dark:border-white/15 dark:bg-neutral-900"
                >
                  {DIST_OPTIONS.map((d) => (
                    <option key={d} value={d}>
                      {d} ตำแหน่ง
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={caseInsensitive}
                  onChange={(e) => setCaseInsensitive(e.target.checked)}
                />
                ไม่สนพิมพ์เล็ก/ใหญ่
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} />
                ตัดช่องว่างหน้า-หลัง
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={collapseSpaces}
                  onChange={(e) => setCollapseSpaces(e.target.checked)}
                />
                ยุบช่องว่างในค่า
              </label>
            </div>
            <p className="text-[11px] text-neutral-400">
              ต่างได้ 1 ตำแหน่ง = จับพิมพ์ผิดทีละตัว (แม่นสุด) · เพิ่มเป็น 2-3 = จับผิดหลายจุด แต่จะมี false positive มากขึ้น
            </p>
          </div>
        )}

        {/* STEP 3: ผลลัพธ์ */}
        {state && result && !result.error && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span
                className={`rounded-full px-3 py-1 font-medium ${
                  result.pairCount === 0
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                    : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                }`}
              >
                {result.pairCount === 0
                  ? "✓ ไม่พบคู่ที่คล้ายกัน"
                  : `พบ ${result.pairCount.toLocaleString("en-US")} คู่น่าสงสัย`}
              </span>
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                ค่าไม่ซ้ำ{" "}
                <span className="tabular-nums">{result.distinctValues.toLocaleString("en-US")}</span> ·
                จาก <span className="tabular-nums">{result.totalRows.toLocaleString("en-US")}</span> แถว
              </span>
              {result.blankRows > 0 && (
                <span className="text-neutral-400">ช่องว่าง {result.blankRows}</span>
              )}
              {result.cappedPairs && (
                <span className="rounded-full bg-red-100 px-3 py-1 text-red-800 dark:bg-red-900/40 dark:text-red-300">
                  แสดงบางส่วน (คู่เยอะเกิน)
                </span>
              )}
              {result.pairs.length > 0 && (
                <button
                  onClick={dlCsv}
                  className="ml-auto rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700"
                >
                  ↓ CSV คู่ที่คล้ายกัน
                </button>
              )}
            </div>

            {result.pairCount > 0 ? (
              <div className="space-y-2">
                {shownPairs.map((p, i) => (
                  <div
                    key={i}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-amber-500/25 bg-amber-50/40 px-4 py-2.5 text-sm dark:border-amber-500/20 dark:bg-amber-950/15"
                  >
                    <span className="font-mono font-medium">
                      {p.a}
                      <span className="ml-1 text-[11px] font-normal text-neutral-400">×{p.countA}</span>
                    </span>
                    <span className="text-neutral-400">≈</span>
                    <span className="font-mono font-medium">
                      {p.b}
                      <span className="ml-1 text-[11px] font-normal text-neutral-400">×{p.countB}</span>
                    </span>
                    <span className="ml-auto flex items-center gap-2 text-[11px] text-neutral-500">
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                        ต่าง {p.distance} ตำแหน่ง
                      </span>
                      <span className="tabular-nums">คล้าย {Math.round(p.similarity * 100)}%</span>
                    </span>
                  </div>
                ))}
                {result.pairCount > PREVIEW_PAIRS && (
                  <p className="text-[11px] text-neutral-400">
                    แสดง {PREVIEW_PAIRS} คู่แรก จากทั้งหมด {result.pairCount.toLocaleString("en-US")} คู่ ·
                    ดาวน์โหลด CSV เพื่อดูครบ
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-50/50 p-4 text-sm text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-950/20 dark:text-emerald-300">
                ✓ ไม่พบคู่ค่าที่คล้ายกัน (ต่างไม่เกิน {maxDistance} ตำแหน่ง) — คอลัมน์นี้ดูสะอาดดี
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
            เลือกคอลัมน์ที่จะตรวจ
          </p>
        )}
      </section>
    </main>
  );
}

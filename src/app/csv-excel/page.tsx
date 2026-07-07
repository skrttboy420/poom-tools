"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { downloadText, downloadBlob } from "@/lib/reconcile/export";
import {
  rowsToCsv,
  rowsToXlsx,
  sheetsToXlsx,
  sheetStats,
  changeExt,
} from "@/lib/convertfile/convertfile";
import FileDropzone from "@/components/FileDropzone";
import type { ParsedFile } from "@/lib/reconcile/types";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PREVIEW_ROWS = 15;
const PREVIEW_COLS = 12;

export default function CsvExcelPage() {
  const [file, setFile] = useState<ParsedFile | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleFile = useCallback(async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    setBusy(true);
    try {
      const parsed = await parseFile(f);
      setFile(parsed);
      setSheetIndex(0);
    } catch (e) {
      setFile(null);
      setError(`อ่านไฟล์ ${f.name} ไม่สำเร็จ: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const sheet = file ? file.sheets[sheetIndex] : null;
  const stats = useMemo(() => (sheet ? sheetStats(sheet.rows) : null), [sheet]);
  const multi = (file?.sheets.length ?? 0) > 1;

  // ไฟล์เข้าเป็น csv → ชวนออก xlsx · เข้าเป็น xlsx → ชวนออก csv
  const isCsvIn = file?.via === "csv";

  const dlSheetCsv = () => {
    if (!file || !sheet) return;
    const name = changeExt(file.fileName, "csv", multi ? `-${safeName(sheet.name)}` : "");
    downloadText(name, rowsToCsv(sheet.rows), "text/csv");
  };

  const dlSheetXlsx = () => {
    if (!file || !sheet) return;
    const name = changeExt(file.fileName, "xlsx", multi ? `-${safeName(sheet.name)}` : "");
    downloadBlob(name, rowsToXlsx(sheet.rows, sheet.name), XLSX_MIME);
  };

  const dlAllXlsx = () => {
    if (!file) return;
    const name = changeExt(file.fileName, "xlsx");
    downloadBlob(name, sheetsToXlsx(file.sheets), XLSX_MIME);
  };

  const preview = sheet ? sheet.rows.slice(0, PREVIEW_ROWS) : [];

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">แปลง CSV ↔ Excel 🔄</h1>
          <p className="text-xs text-neutral-500">
            อัปไฟล์แล้วดาวน์โหลดเป็นอีกนามสกุล — <b>อ่านไฟล์เพี้ยน (เช่น MOMO) ได้</b> แล้ว export กลับเป็น .xlsx มาตรฐาน
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
            {file && (
              <span
                className={`rounded px-2 py-0.5 text-[11px] ${
                  file.via === "xlsx-repair"
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                    : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                }`}
              >
                {file.via === "xlsx-repair" ? "ซ่อมไฟล์เพี้ยนแล้ว" : `อ่านแบบ: ${file.via}`}
              </span>
            )}
          </div>

          <FileDropzone
            onFile={handleFile}
            accept=".xlsx,.xls,.csv,.tsv,.txt"
            busy={busy}
            label={file ? `เปลี่ยนไฟล์ — ${file.fileName}` : "ลากไฟล์มาวาง หรือคลิกเลือก (.xlsx / .csv)"}
          />

          {file && sheet && stats && (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
              {multi && (
                <label className="flex items-center gap-1">
                  ชีต:
                  <select
                    value={sheetIndex}
                    onChange={(e) => setSheetIndex(Number(e.target.value))}
                    className="rounded border border-black/15 bg-transparent px-1 py-0.5 dark:border-white/15 dark:bg-neutral-900"
                  >
                    {file.sheets.map((s, i) => (
                      <option key={i} value={i}>
                        {s.name} ({sheetStats(s.rows).nonEmptyRows} แถว)
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                แถวมีข้อมูล: <b className="tabular-nums">{stats.nonEmptyRows}</b>
              </span>
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                คอลัมน์: <b className="tabular-nums">{stats.cols}</b>
              </span>
              {file.sheets.length > 1 && (
                <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                  ทั้งไฟล์: <b className="tabular-nums">{file.sheets.length}</b> ชีต
                </span>
              )}
            </div>
          )}
        </div>

        {/* STEP 2: ดาวน์โหลด */}
        {file && sheet && (
          <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
            <h2 className="mb-1 text-sm font-semibold">ดาวน์โหลดผลลัพธ์</h2>
            <p className="mb-3 text-xs text-neutral-500">
              {isCsvIn
                ? "ไฟล์ต้นทางเป็น CSV — กดปุ่มเขียวเพื่อแปลงเป็น Excel"
                : "ไฟล์ต้นทางเป็น Excel — กดปุ่มเขียวเพื่อแปลงเป็น CSV"}
              {multi ? " · ชื่อไฟล์จะต่อท้ายด้วยชื่อชีต" : ""}
            </p>

            <div className="flex flex-wrap gap-2">
              {/* ปุ่มหลัก = ทิศทางแปลงที่ตั้งใจ (เขียว) */}
              {isCsvIn ? (
                <button
                  onClick={dlSheetXlsx}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
                >
                  ↓ ดาวน์โหลดเป็น Excel (.xlsx)
                </button>
              ) : (
                <button
                  onClick={dlSheetCsv}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
                >
                  ↓ ดาวน์โหลดชีตนี้เป็น CSV
                </button>
              )}

              {/* ปุ่มรอง = อีกทิศ / re-export */}
              {isCsvIn ? (
                <button
                  onClick={dlSheetCsv}
                  className="rounded-md border border-black/15 px-4 py-2 text-sm transition hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                >
                  ↓ CSV (จัดรูปใหม่)
                </button>
              ) : (
                <button
                  onClick={dlSheetXlsx}
                  className="rounded-md border border-black/15 px-4 py-2 text-sm transition hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                >
                  ↓ ชีตนี้เป็น Excel (.xlsx)
                </button>
              )}

              {multi && (
                <button
                  onClick={dlAllXlsx}
                  className="rounded-md border border-black/15 px-4 py-2 text-sm transition hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
                >
                  ↓ ทั้งไฟล์เป็น Excel (ทุกชีต)
                </button>
              )}
            </div>
          </div>
        )}

        {/* STEP 3: พรีวิว */}
        {file && sheet && (
          <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
            <h2 className="mb-2 text-sm font-semibold">
              ตัวอย่างข้อมูล
              <span className="ml-2 text-xs font-normal text-neutral-400">
                (แสดง {preview.length} แถวแรก{sheet.rows.length > PREVIEW_ROWS ? ` จาก ${sheet.rows.length}` : ""})
              </span>
            </h2>
            <div className="max-h-[55vh] overflow-auto rounded border border-black/10 dark:border-white/10">
              <table className="w-full text-[11px]">
                <tbody>
                  {preview.map((r, ri) => (
                    <tr key={ri} className="odd:bg-black/[0.02] dark:odd:bg-white/[0.03]">
                      <td className="sticky left-0 border-r border-black/10 bg-white px-1 text-right text-neutral-400 dark:border-white/10 dark:bg-neutral-950">
                        {ri}
                      </td>
                      {r.slice(0, PREVIEW_COLS).map((c, ci) => (
                        <td key={ci} className="max-w-[140px] truncate whitespace-nowrap px-2 py-0.5">
                          {c === null || c === undefined ? "" : String(c)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

// ชื่อชีตไปต่อท้ายชื่อไฟล์ — กันอักขระที่ใช้ตั้งชื่อไฟล์ไม่ได้
function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim() || "sheet";
}

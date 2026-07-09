"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { columnLetter } from "@/lib/reconcile/columns";
import { downloadText } from "@/lib/reconcile/export";
import { changeExt } from "@/lib/convertfile/convertfile";
import { renderTemplate } from "@/lib/template/template";
import FileDropzone from "@/components/FileDropzone";
import type { ParsedFile, Row, SideSelection } from "@/lib/reconcile/types";

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
  return h === null || h === undefined || String(h).trim() === "" ? `(ว่าง)` : String(h);
}

// token ที่ปลอดภัยสำหรับ header: ถ้าชื่อว่าง/มีวงเล็บปีกกา → ใช้ {#N}
function tokenFor(header: Row, i: number): string {
  const h = header[i];
  const s = h === null || h === undefined ? "" : String(h).trim();
  if (s === "" || s.includes("{") || s.includes("}")) return `{#${i + 1}}`;
  return `{${s}}`;
}

const JOINERS: { label: string; value: string }[] = [
  { label: "ขึ้นบรรทัดใหม่", value: "\n" },
  { label: "เว้น 1 บรรทัด", value: "\n\n" },
  { label: ", ", value: ", " },
  { label: "; ", value: "; " },
  { label: " | ", value: " | " },
];

export default function TemplatePage() {
  const [state, setState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [template, setTemplate] = useState("");
  const [joiner, setJoiner] = useState("\n");
  const [skipEmptyRows, setSkipEmptyRows] = useState(true);
  const [trimValues, setTrimValues] = useState(false);
  const [copied, setCopied] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  const header = useMemo(() => headerRowOf(state), [state]);
  const data = useMemo(() => dataRowsOf(state), [state]);
  const headerStr = useMemo(() => header.map((h) => (h === null ? "" : String(h))), [header]);

  const result = useMemo(
    () => renderTemplate(headerStr, data, template, { joiner, skipEmptyRows, trimValues }),
    [headerStr, data, template, joiner, skipEmptyRows, trimValues],
  );

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const parsed = await parseFile(file);
      const sel = makeSelection(parsed, 0);
      setState({ file: parsed, sel });
      // เดา template เริ่มต้น: ต่อทุกคอลัมน์ด้วย " · " ให้เห็นผลทันที
      const hdr = parsed.sheets[sel.sheetIndex]?.rows[sel.headerRow] ?? [];
      if (hdr.length > 0) {
        setTemplate(hdr.map((_, i) => tokenFor(hdr, i)).join(" · "));
      }
    } catch (e) {
      setError(`อ่านไฟล์ ${file.name} ไม่สำเร็จ: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const updateSel = useCallback((patch: Partial<SideSelection>) => {
    setState((cur) => (cur ? { ...cur, sel: { ...cur.sel, ...patch } } : cur));
  }, []);

  // แทรก token ที่ตำแหน่ง cursor
  const insertToken = (tok: string) => {
    const ta = taRef.current;
    if (!ta) {
      setTemplate((t) => t + tok);
      return;
    }
    const start = ta.selectionStart ?? template.length;
    const end = ta.selectionEnd ?? template.length;
    const next = template.slice(0, start) + tok + template.slice(end);
    setTemplate(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + tok.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  const copyOut = async () => {
    if (result.error || !result.text) return;
    try {
      await navigator.clipboard.writeText(result.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* noop */
    }
  };

  const dlTxt = () => {
    if (!state || result.error) return;
    downloadText(changeExt(state.file.fileName, "txt", "-ข้อความ"), result.text, "text/plain");
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">สร้างข้อความจากตาราง 📝</h1>
          <p className="text-xs text-neutral-500">
            แต่ละแถว → 1 บรรทัดข้อความตามรูปแบบที่กำหนด (เช่น สร้างบรรทัด paste เข้า Pacred, ข้อความแจ้งรายกล่อง, SQL VALUES) · ใส่ช่องด้วย {"{ชื่อคอลัมน์}"}
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

        {/* STEP 2: รูปแบบข้อความ */}
        {state && (
          <div className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
            <h2 className="text-sm font-semibold">รูปแบบข้อความ (template)</h2>

            {/* ปุ่มแทรกคอลัมน์ */}
            <div className="flex flex-wrap gap-1.5">
              <span className="self-center text-xs text-neutral-500">แทรกช่อง:</span>
              {header.map((_, i) => (
                <button
                  key={i}
                  onClick={() => insertToken(tokenFor(header, i))}
                  className="rounded border border-black/15 px-2 py-1 text-xs text-neutral-600 hover:border-indigo-400 hover:bg-indigo-50 dark:border-white/15 dark:text-neutral-300 dark:hover:bg-indigo-950/30"
                  title={`แทรก ${tokenFor(header, i)}`}
                >
                  {columnLetter(i)} · {colLabel(header, i)}
                </button>
              ))}
            </div>

            <textarea
              ref={taRef}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              rows={4}
              spellCheck={false}
              placeholder="เช่น  {tracking} = {kg}kg  (พิมพ์ {{ }} เพื่อใส่ปีกกาจริง)"
              className="w-full resize-y rounded-lg border border-black/15 bg-transparent px-3 py-2 font-mono text-sm outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
            />

            <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-600 dark:text-neutral-400">
              <label className="flex items-center gap-1.5">
                <span className="text-neutral-500">คั่นระหว่างแถว:</span>
                <select
                  value={joiner}
                  onChange={(e) => setJoiner(e.target.value)}
                  className="rounded border border-black/15 bg-transparent px-1.5 py-1 dark:border-white/15 dark:bg-neutral-900"
                >
                  {JOINERS.map((j) => (
                    <option key={j.label} value={j.value}>
                      {j.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex cursor-pointer items-center gap-1.5" title="ข้ามแถวที่ว่างทั้งแถว (ไม่สร้างบรรทัดเปล่า)">
                <input type="checkbox" checked={skipEmptyRows} onChange={(e) => setSkipEmptyRows(e.target.checked)} />
                ข้ามแถวว่าง
              </label>
              <label className="flex cursor-pointer items-center gap-1.5" title="ตัดช่องว่างหน้า-หลังของค่าก่อนใส่">
                <input type="checkbox" checked={trimValues} onChange={(e) => setTrimValues(e.target.checked)} />
                ตัดช่องว่างของค่า
              </label>
            </div>

            {result.unknownTokens.length > 0 && (
              <p className="rounded-md border border-amber-500/30 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                ⚠️ ไม่รู้จักช่อง: {result.unknownTokens.map((t) => `{${t}}`).join(", ")} — จะคงข้อความไว้ตามเดิม (เช็คชื่อคอลัมน์อีกที)
              </p>
            )}
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
                  <span className="rounded-full bg-indigo-100 px-3 py-1 font-medium text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200">
                    <span className="tabular-nums">{result.rowsUsed}</span> บรรทัด
                  </span>
                  {result.skipped > 0 && (
                    <span className="rounded-full bg-neutral-100 px-3 py-1 font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                      ข้ามแถวว่าง <span className="tabular-nums">{result.skipped}</span>
                    </span>
                  )}
                  <span className="text-neutral-400">
                    จาก <span className="tabular-nums">{result.inputRows}</span> แถว
                  </span>
                </>
              )}
              <div className="ml-auto flex gap-2">
                <button
                  onClick={copyOut}
                  disabled={!!result.error || !result.text}
                  className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium hover:bg-black/5 disabled:opacity-40 dark:border-white/15 dark:hover:bg-white/10"
                >
                  {copied ? "✓ คัดลอกแล้ว" : "คัดลอก"}
                </button>
                <button
                  onClick={dlTxt}
                  disabled={!!result.error || !result.text}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-40"
                >
                  ↓ .txt
                </button>
              </div>
            </div>

            <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap break-words px-4 py-3 font-mono text-xs leading-relaxed">
              {result.error ? "" : result.text || "(ยังไม่มีผลลัพธ์ — ใส่รูปแบบข้อความด้านบน)"}
            </pre>
          </div>
        )}
      </section>
    </main>
  );
}

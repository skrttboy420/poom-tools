"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { guessHeaderRow } from "@/lib/reconcile/detect";
import { columnOptionLabel, columnLetter } from "@/lib/reconcile/columns";
import { downloadText } from "@/lib/reconcile/export";
import { changeExt } from "@/lib/convertfile/convertfile";
import {
  validateTable,
  validateToCsv,
  RULE_LABEL,
  ruleNeedsParam,
  type Rule,
  type RuleType,
} from "@/lib/validate/validate";
import FileDropzone from "@/components/FileDropzone";
import type { Cell, ParsedFile, Row, SideSelection } from "@/lib/reconcile/types";

const PREVIEW_ROWS = 500;

interface FileState {
  file: ParsedFile;
  sel: SideSelection;
}

// กฎในหน้าจอ = Rule + id คงที่ (กัน input เสีย focus ตอนเพิ่ม/ลบ)
interface RuleRow extends Rule {
  id: number;
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

// เดาคอลัมน์ key (tracking/เลข/ตู้) เพื่อ seed กฎ "ต้องมีค่า" ให้เริ่มต้น
function guessKeyColumn(header: Row): number {
  const HINT = /tracking|awb|hbl|mbl|ref|เลขพัสดุ|เลขที่|container|ตู้|code|รหัส/i;
  for (let c = 0; c < header.length; c++) {
    if (HINT.test(headerText(header[c]))) return c;
  }
  return 0;
}

const RULE_TYPES: RuleType[] = [
  "required",
  "number",
  "integer",
  "min",
  "max",
  "min-length",
  "max-length",
  "pattern",
  "allowed",
  "unique",
];

const CI_RULES = new Set<RuleType>(["pattern", "allowed", "unique"]);

const PARAM_HINT: Partial<Record<RuleType, string>> = {
  min: "เช่น 0",
  max: "เช่น 2000",
  "min-length": "เช่น 3",
  "max-length": "เช่น 20",
  pattern: "regex เช่น ^[A-Z]{4}[0-9]{7}$",
  allowed: "คั่นด้วย , เช่น DHL, FedEx, UPS",
};

let RULE_ID = 1;
function newRule(col: number, type: RuleType = "required"): RuleRow {
  return { id: RULE_ID++, col, type };
}

function colLabel(header: Row, col: number): string {
  return `${columnLetter(col)} · ${headerText(header[col]) || "(ว่าง)"}`;
}

export default function ValidatePage() {
  const [state, setState] = useState<FileState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rules, setRules] = useState<RuleRow[]>([]);

  const header = useMemo(() => headerRowOf(state), [state]);
  const data = useMemo(() => dataRowsOf(state), [state]);

  const engineRules = useMemo<Rule[]>(
    () => rules.map(({ col, type, param, caseInsensitive }) => ({ col, type, param, caseInsensitive })),
    [rules],
  );

  const result = useMemo(
    () => (state && rules.length > 0 ? validateTable(header, data, engineRules) : null),
    [state, header, data, engineRules, rules.length],
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
      const hdr = rows[sel.headerRow] ?? [];
      setRules([newRule(guessKeyColumn(hdr), "required")]);
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
      const hdr = rows[next.sel.headerRow] ?? [];
      setRules([newRule(guessKeyColumn(hdr), "required")]);
      return next;
    });
  }, []);

  const patchRule = (id: number, patch: Partial<RuleRow>) =>
    setRules((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRule = (id: number) => setRules((rs) => rs.filter((r) => r.id !== id));
  const addRule = () => setRules((rs) => [...rs, newRule(0, "required")]);

  const dlCsv = () => {
    if (!state || !result || result.error || result.violations.length === 0) return;
    downloadText(changeExt(state.file.fileName, "csv", "-ตรวจ"), validateToCsv(header, result), "text/csv");
  };

  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max((state?.sel.headerRow ?? 0) + 4, 8)) : [];
  const shown = result ? result.violations.slice(0, PREVIEW_ROWS) : [];

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">ตรวจความถูกต้องตามกฎ (Data Validation) 🛡️</h1>
          <p className="text-xs text-neutral-500">
            ตั้ง<b>กฎ</b>ที่ข้อมูลควรเป็น (ต้องมีค่า / เป็นตัวเลข / อยู่ในช่วง / ตรง pattern / อยู่ในรายการ / ห้ามซ้ำ) →
            บอกว่าแถวไหนช่องไหน<b>ผิดกฎอะไร</b> ก่อนเอาเข้า Pacred · โชว์ให้ดูก่อน ไม่แก้ให้
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

        {/* STEP 2: กฎ */}
        {state && (
          <div className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">กฎที่จะตรวจ</h2>
              <button
                onClick={addRule}
                className="rounded-md border border-black/15 px-2.5 py-1 text-xs hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
              >
                + เพิ่มกฎ
              </button>
            </div>

            {rules.length === 0 && (
              <p className="text-xs text-neutral-400">ยังไม่มีกฎ — กด &quot;+ เพิ่มกฎ&quot; เพื่อเริ่มตรวจ</p>
            )}

            <div className="space-y-2">
              {rules.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-black/10 bg-black/[0.015] px-3 py-2 text-xs dark:border-white/10 dark:bg-white/[0.02]"
                >
                  <select
                    value={r.col}
                    onChange={(e) => patchRule(r.id, { col: Number(e.target.value) })}
                    title={columnOptionLabel(header[r.col], r.col)}
                    className="max-w-[180px] rounded border border-black/15 bg-transparent px-1.5 py-1 dark:border-white/15 dark:bg-neutral-900"
                  >
                    {header.map((h, i) => (
                      <option key={i} value={i}>
                        {colLabel(header, i)}
                      </option>
                    ))}
                  </select>

                  <select
                    value={r.type}
                    onChange={(e) => {
                      const type = e.target.value as RuleType;
                      patchRule(r.id, {
                        type,
                        param: "",
                        caseInsensitive: CI_RULES.has(type) ? r.caseInsensitive : undefined,
                      });
                    }}
                    className="rounded border border-black/15 bg-transparent px-1.5 py-1 dark:border-white/15 dark:bg-neutral-900"
                  >
                    {RULE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {RULE_LABEL[t]}
                      </option>
                    ))}
                  </select>

                  {ruleNeedsParam(r.type) && (
                    <input
                      type="text"
                      value={r.param ?? ""}
                      onChange={(e) => patchRule(r.id, { param: e.target.value })}
                      placeholder={PARAM_HINT[r.type] ?? ""}
                      className="min-w-[180px] flex-1 rounded border border-black/15 bg-transparent px-2 py-1 font-mono dark:border-white/15 dark:bg-neutral-900"
                    />
                  )}

                  {CI_RULES.has(r.type) && (
                    <label className="flex items-center gap-1 text-neutral-500" title="ไม่สนตัวพิมพ์เล็ก/ใหญ่">
                      <input
                        type="checkbox"
                        checked={r.caseInsensitive === true}
                        onChange={(e) => patchRule(r.id, { caseInsensitive: e.target.checked })}
                      />
                      Aa
                    </label>
                  )}

                  <button
                    onClick={() => removeRule(r.id)}
                    className="ml-auto rounded px-1.5 py-0.5 text-neutral-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/40"
                    title="ลบกฎนี้"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 3: ผลลัพธ์ */}
        {state && result && !result.error && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span
                className={`rounded-full px-3 py-1 font-medium ${
                  result.violationCount === 0
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                    : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                }`}
              >
                {result.violationCount === 0
                  ? "✓ ผ่านทุกกฎ"
                  : `พบ ${result.violationCount.toLocaleString("en-US")} จุดที่ผิดกฎ`}
              </span>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                แถวผ่าน <span className="tabular-nums">{result.validRows.toLocaleString("en-US")}</span>
              </span>
              {result.invalidRows > 0 && (
                <span className="rounded-full bg-red-100 px-3 py-1 text-red-800 dark:bg-red-900/40 dark:text-red-300">
                  แถวมีปัญหา <span className="tabular-nums">{result.invalidRows.toLocaleString("en-US")}</span>
                </span>
              )}
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                จาก <span className="tabular-nums">{result.totalRows.toLocaleString("en-US")}</span> แถว
              </span>
              {result.violations.length > 0 && (
                <button
                  onClick={dlCsv}
                  className="ml-auto rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700"
                >
                  ↓ CSV จุดที่ผิดกฎ
                </button>
              )}
            </div>

            {/* สรุปต่อกฎ */}
            {result.violationCount > 0 && (
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {result.byRule.map((b, i) =>
                  b.count > 0 ? (
                    <span
                      key={i}
                      className="rounded-full bg-red-50 px-2.5 py-1 text-red-700 ring-1 ring-red-500/20 dark:bg-red-950/25 dark:text-red-300"
                    >
                      {RULE_LABEL[b.type]} · {colLabel(header, b.col)}: {b.count.toLocaleString("en-US")}
                    </span>
                  ) : null,
                )}
              </div>
            )}

            {result.violationCount > 0 ? (
              <div className="max-h-[60vh] overflow-auto rounded-xl border border-black/10 dark:border-white/10">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-neutral-100 text-left text-[11px] uppercase tracking-wide text-neutral-500 dark:bg-neutral-800">
                    <tr>
                      <th className="px-3 py-2 font-medium">แถว</th>
                      <th className="px-3 py-2 font-medium">คอลัมน์</th>
                      <th className="px-3 py-2 font-medium">ค่า</th>
                      <th className="px-3 py-2 font-medium">กฎ</th>
                      <th className="px-3 py-2 font-medium">เหตุผล</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((v, i) => (
                      <tr
                        key={i}
                        className="border-t border-black/5 odd:bg-black/[0.015] dark:border-white/5 dark:odd:bg-white/[0.02]"
                      >
                        <td className="px-3 py-1.5 tabular-nums text-neutral-400">{v.row + 1}</td>
                        <td className="px-3 py-1.5 whitespace-nowrap">{colLabel(header, v.col)}</td>
                        <td className="max-w-[220px] truncate px-3 py-1.5 font-mono">
                          {v.value === "" ? <span className="text-neutral-400">(ว่าง)</span> : v.value}
                        </td>
                        <td className="px-3 py-1.5 whitespace-nowrap text-neutral-500">{RULE_LABEL[v.ruleType]}</td>
                        <td className="px-3 py-1.5 text-red-600 dark:text-red-400">{v.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {result.violationCount > PREVIEW_ROWS && (
                  <p className="px-3 py-2 text-[11px] text-neutral-400">
                    แสดง {PREVIEW_ROWS} จุดแรก จากทั้งหมด {result.violationCount.toLocaleString("en-US")} จุด ·
                    ดาวน์โหลด CSV เพื่อดูครบ
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-50/50 p-4 text-sm text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-950/20 dark:text-emerald-300">
                ✓ ข้อมูลผ่านทุกกฎที่ตั้งไว้ ({result.totalRows.toLocaleString("en-US")} แถว) — พร้อมเอาเข้า Pacred
              </div>
            )}
          </div>
        )}

        {state && result?.error && (
          <p className="rounded-md border border-amber-500/30 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
            {result.error}
          </p>
        )}
      </section>
    </main>
  );
}

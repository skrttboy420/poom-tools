"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { parseFile } from "@/lib/reconcile/parse";
import { defaultFields, guessColumns, guessHeaderRow } from "@/lib/reconcile/detect";
import { reconcile } from "@/lib/reconcile/diff";
import { diffToCsv, diffToJson, downloadText } from "@/lib/reconcile/export";
import { columnOptionLabel } from "@/lib/reconcile/columns";
import type {
  DiffResult,
  FieldDef,
  FieldRole,
  Mapping,
  ParsedFile,
  Row,
  RowStatus,
  SideSelection,
} from "@/lib/reconcile/types";

type SideKey = "A" | "B";

interface SideState {
  file: ParsedFile;
  sel: SideSelection;
}

function makeSelection(file: ParsedFile, sheetIndex = 0): SideSelection {
  const rows = file.sheets[sheetIndex]?.rows ?? [];
  const headerRow = guessHeaderRow(rows);
  return { sheetIndex, headerRow, dataStart: headerRow + 1, dataEnd: null };
}

function headerRowOf(side: SideState | null): Row {
  if (!side) return [];
  return side.file.sheets[side.sel.sheetIndex]?.rows[side.sel.headerRow] ?? [];
}

function dataRowsOf(side: SideState | null): Row[] {
  if (!side) return [];
  const rows = side.file.sheets[side.sel.sheetIndex]?.rows ?? [];
  return rows.slice(side.sel.dataStart, side.sel.dataEnd ?? undefined);
}

const ROW_TINT: Record<RowStatus, string> = {
  match: "bg-emerald-50 dark:bg-emerald-950/20",
  mismatch: "bg-amber-50 dark:bg-amber-950/20",
  "only-a": "bg-sky-50 dark:bg-sky-950/20",
  "only-b": "bg-rose-50 dark:bg-rose-950/20",
};

const ROW_BADGE: Record<RowStatus, { label: string; cls: string }> = {
  match: { label: "ตรงกัน", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  mismatch: { label: "ไม่ตรง", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  "only-a": { label: "เฉพาะ A", cls: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300" },
  "only-b": { label: "เฉพาะ B", cls: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300" },
};

export default function ReconcilePage() {
  const [sideA, setSideA] = useState<SideState | null>(null);
  const [sideB, setSideB] = useState<SideState | null>(null);
  const [fields, setFields] = useState<FieldDef[]>(() => defaultFields());
  const [colA, setColA] = useState<Record<string, number>>({});
  const [colB, setColB] = useState<Record<string, number>>({});
  const [trimKey, setTrimKey] = useState(true);
  const [caseInsensitiveKey, setCaseInsensitiveKey] = useState(true);
  const [result, setResult] = useState<DiffResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"all" | RowStatus>("all");

  const headerA = useMemo(() => headerRowOf(sideA), [sideA]);
  const headerB = useMemo(() => headerRowOf(sideB), [sideB]);

  const remapColumns = useCallback(
    (side: SideKey, header: Row) => {
      const guessed = guessColumns(header, fields);
      if (side === "A") setColA(guessed);
      else setColB(guessed);
    },
    [fields],
  );

  const handleFile = useCallback(
    async (side: SideKey, file: File | undefined) => {
      if (!file) return;
      setError(null);
      setResult(null);
      setBusy(true);
      try {
        const parsed = await parseFile(file);
        const sel = makeSelection(parsed, 0);
        const state: SideState = { file: parsed, sel };
        if (side === "A") setSideA(state);
        else setSideB(state);
        remapColumns(side, parsed.sheets[sel.sheetIndex]?.rows[sel.headerRow] ?? []);
      } catch (e) {
        setError(`อ่านไฟล์ ${file.name} ไม่สำเร็จ: ${(e as Error).message}`);
      } finally {
        setBusy(false);
      }
    },
    [remapColumns],
  );

  const updateSel = useCallback(
    (side: SideKey, patch: Partial<SideSelection>) => {
      const cur = side === "A" ? sideA : sideB;
      if (!cur) return;
      const nextSel = { ...cur.sel, ...patch };
      const nextState = { ...cur, sel: nextSel };
      if (side === "A") setSideA(nextState);
      else setSideB(nextState);
      // ถ้าเปลี่ยน sheet/แถว header ให้เดาคอลัมน์ใหม่
      if (patch.sheetIndex !== undefined || patch.headerRow !== undefined) {
        const header = nextState.file.sheets[nextSel.sheetIndex]?.rows[nextSel.headerRow] ?? [];
        remapColumns(side, header);
      }
    },
    [sideA, sideB, remapColumns],
  );

  // ---- field mapping handlers ----
  const setFieldRole = (id: string, role: FieldRole) => {
    setFields((prev) =>
      prev.map((f) => {
        if (f.id === id) return { ...f, role };
        // key ได้ตัวเดียว: ตั้ง key ใหม่ -> ตัวอื่นเป็น compare
        if (role === "key" && f.role === "key") return { ...f, role: "compare" };
        return f;
      }),
    );
  };
  const setFieldNumeric = (id: string, numeric: boolean) =>
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, numeric } : f)));
  const setFieldLabel = (id: string, label: string) =>
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, label } : f)));
  const setFieldCol = (side: SideKey, id: string, idx: number) => {
    if (side === "A") setColA((p) => ({ ...p, [id]: idx }));
    else setColB((p) => ({ ...p, [id]: idx }));
  };
  const addField = () => {
    const id = `custom_${Date.now().toString(36)}`;
    setFields((prev) => [...prev, { id, label: "ฟิลด์ใหม่", role: "compare", numeric: false, tolerance: 0 }]);
  };
  const removeField = (id: string) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
    setColA((p) => {
      const next = { ...p };
      delete next[id];
      return next;
    });
    setColB((p) => {
      const next = { ...p };
      delete next[id];
      return next;
    });
  };

  const run = () => {
    setError(null);
    try {
      const mapping: Mapping = { fields, colA, colB };
      const res = reconcile(dataRowsOf(sideA), dataRowsOf(sideB), mapping, {
        trimKey,
        caseInsensitiveKey,
      });
      setResult(res);
      setFilter("all");
    } catch (e) {
      setResult(null);
      setError((e as Error).message);
    }
  };

  const canRun = sideA !== null && sideB !== null;

  const visibleRows = useMemo(() => {
    if (!result) return [];
    if (filter === "all") return result.rows;
    return result.rows.filter((r) => r.status === filter);
  }, [result, filter]);

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">Reconciler — เทียบข้อมูล</h1>
          <p className="text-xs text-neutral-500">อัปโหลด 2 ไฟล์ (Excel/CSV) แล้วจับคู่คอลัมน์เพื่อเทียบ</p>
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

        {/* STEP 1: อัปโหลด 2 ฝั่ง */}
        <div className="grid gap-4 md:grid-cols-2">
          <SideCard
            label="ไฟล์ A (ฝั่งซ้าย)"
            state={sideA}
            busy={busy}
            onFile={(f) => handleFile("A", f)}
            onSel={(patch) => updateSel("A", patch)}
          />
          <SideCard
            label="ไฟล์ B (ฝั่งขวา)"
            state={sideB}
            busy={busy}
            onFile={(f) => handleFile("B", f)}
            onSel={(patch) => updateSel("B", patch)}
          />
        </div>

        {/* STEP 2: จับคู่คอลัมน์ */}
        {(sideA || sideB) && (
          <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">จับคู่คอลัมน์ (map)</h2>
              <button onClick={addField} className="text-xs text-neutral-500 hover:underline">
                + เพิ่มฟิลด์
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-neutral-500">
                    <th className="py-1 pr-3">ฟิลด์</th>
                    <th className="py-1 pr-3">บทบาท</th>
                    <th className="py-1 pr-3">ตัวเลข?</th>
                    <th className="py-1 pr-3">คอลัมน์ใน A</th>
                    <th className="py-1 pr-3">คอลัมน์ใน B</th>
                    <th className="py-1"></th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((f) => (
                    <tr key={f.id} className="border-t border-black/5 dark:border-white/5">
                      <td className="py-2 pr-3">
                        <input
                          value={f.label}
                          onChange={(e) => setFieldLabel(f.id, e.target.value)}
                          className="w-36 rounded border border-black/15 bg-transparent px-2 py-1 text-sm outline-none focus:border-black/40 dark:border-white/15"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <select
                          value={f.role}
                          onChange={(e) => setFieldRole(f.id, e.target.value as FieldRole)}
                          className="rounded border border-black/15 bg-transparent px-2 py-1 text-sm outline-none dark:border-white/15 dark:bg-neutral-900"
                        >
                          <option value="key">key (คีย์)</option>
                          <option value="compare">เทียบ</option>
                        </select>
                      </td>
                      <td className="py-2 pr-3 text-center">
                        <input
                          type="checkbox"
                          checked={f.numeric}
                          onChange={(e) => setFieldNumeric(f.id, e.target.checked)}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <ColumnSelect header={headerA} value={colA[f.id] ?? -1} onChange={(i) => setFieldCol("A", f.id, i)} />
                      </td>
                      <td className="py-2 pr-3">
                        <ColumnSelect header={headerB} value={colB[f.id] ?? -1} onChange={(i) => setFieldCol("B", f.id, i)} />
                      </td>
                      <td className="py-2 text-right">
                        <button onClick={() => removeField(f.id)} className="text-xs text-neutral-400 hover:text-red-500">
                          ลบ
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={trimKey} onChange={(e) => setTrimKey(e.target.checked)} />
                ตัดช่องว่างหน้า/หลังคีย์
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={caseInsensitiveKey}
                  onChange={(e) => setCaseInsensitiveKey(e.target.checked)}
                />
                ไม่สนตัวพิมพ์เล็ก/ใหญ่
              </label>
              <button
                onClick={run}
                disabled={!canRun}
                className="ml-auto rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition disabled:opacity-40 dark:bg-white dark:text-black"
              >
                เทียบข้อมูล
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: ผลลัพธ์ */}
        {result && <ResultView result={result} filter={filter} setFilter={setFilter} visibleRows={visibleRows} />}
      </section>
    </main>
  );
}

function SideCard({
  label,
  state,
  busy,
  onFile,
  onSel,
}: {
  label: string;
  state: SideState | null;
  busy: boolean;
  onFile: (f: File | undefined) => void;
  onSel: (patch: Partial<SideSelection>) => void;
}) {
  const sheet = state ? state.file.sheets[state.sel.sheetIndex] : null;
  const preview = sheet ? sheet.rows.slice(0, Math.max(state!.sel.headerRow + 4, 8)) : [];
  return (
    <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{label}</h3>
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

      <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-black/20 px-3 py-4 text-sm text-neutral-500 hover:border-black/40 dark:border-white/20">
        <input
          type="file"
          accept=".xlsx,.xls,.csv,.tsv,.txt"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        {busy ? "กำลังอ่าน..." : state ? `เปลี่ยนไฟล์ — ${state.file.fileName}` : "เลือกไฟล์ (.xlsx / .csv)"}
      </label>

      {state && sheet && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {state.file.sheets.length > 1 && (
              <label className="flex items-center gap-1">
                ชีต:
                <select
                  value={state.sel.sheetIndex}
                  onChange={(e) => onSel({ sheetIndex: Number(e.target.value), headerRow: 0, dataStart: 1, dataEnd: null })}
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
                  onSel({ headerRow: h, dataStart: h + 1 });
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
  );
}

function ColumnSelect({
  header,
  value,
  onChange,
}: {
  header: Row;
  value: number;
  onChange: (i: number) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-48 rounded border border-black/15 bg-transparent px-2 py-1 text-sm outline-none dark:border-white/15 dark:bg-neutral-900"
    >
      <option value={-1}>— ไม่ใช้ —</option>
      {header.map((h, i) => (
        <option key={i} value={i}>
          {columnOptionLabel(h, i)}
        </option>
      ))}
    </select>
  );
}

function ResultView({
  result,
  filter,
  setFilter,
  visibleRows,
}: {
  result: DiffResult;
  filter: "all" | RowStatus;
  setFilter: (f: "all" | RowStatus) => void;
  visibleRows: DiffResult["rows"];
}) {
  const s = result.summary;
  const chips: { key: "all" | RowStatus; label: string; n: number; cls: string }[] = [
    { key: "all", label: "ทั้งหมด", n: s.totalKeys, cls: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300" },
    { key: "match", label: "ตรงกัน", n: s.match, cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
    { key: "mismatch", label: "ไม่ตรง", n: s.mismatch, cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
    { key: "only-a", label: "เฉพาะ A", n: s.onlyA, cls: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300" },
    { key: "only-b", label: "เฉพาะ B", n: s.onlyB, cls: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300" },
  ];

  return (
    <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {chips.map((c) => (
          <button
            key={c.key}
            onClick={() => setFilter(c.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${c.cls} ${filter === c.key ? "ring-2 ring-black/30 dark:ring-white/40" : ""}`}
          >
            {c.label} · {c.n}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => downloadText("reconcile.csv", diffToCsv(result), "text/csv")}
            className="rounded-md border border-black/15 px-3 py-1 text-xs hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
          >
            ↓ CSV
          </button>
          <button
            onClick={() => downloadText("reconcile.json", diffToJson(result), "application/json")}
            className="rounded-md border border-black/15 px-3 py-1 text-xs hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
          >
            ↓ JSON
          </button>
        </div>
      </div>

      {(s.dupKeysA > 0 || s.dupKeysB > 0 || s.emptyKeyA > 0 || s.emptyKeyB > 0) && (
        <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          หมายเหตุ: คีย์ซ้ำ A={s.dupKeysA} B={s.dupKeysB} (ใช้แถวแรก) · คีย์ว่าง A={s.emptyKeyA} B={s.emptyKeyB} (ข้าม)
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs text-neutral-500">
              <th className="px-2 py-1">{result.keyFieldLabel || "key"}</th>
              <th className="px-2 py-1">สถานะ</th>
              {result.compareFields.map((f) => (
                <th key={f.id} className="px-2 py-1" colSpan={2}>
                  {f.label} <span className="text-neutral-400">(A · B)</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r, i) => (
              <tr key={i} className={`border-t border-black/5 dark:border-white/5 ${ROW_TINT[r.status]}`}>
                <td className="px-2 py-1 font-mono text-xs">{r.key}</td>
                <td className="px-2 py-1">
                  <span className={`rounded px-2 py-0.5 text-[11px] ${ROW_BADGE[r.status].cls}`}>
                    {ROW_BADGE[r.status].label}
                  </span>
                </td>
                {result.compareFields.map((f) => {
                  const cc = r.fields[f.id];
                  const bad = cc?.status === "mismatch";
                  return (
                    <FieldPair key={f.id} a={cc?.a ?? null} b={cc?.b ?? null} bad={bad} />
                  );
                })}
              </tr>
            ))}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={2 + result.compareFields.length * 2} className="px-2 py-6 text-center text-neutral-400">
                  ไม่มีข้อมูลในกลุ่มนี้
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FieldPair({ a, b, bad }: { a: unknown; b: unknown; bad: boolean }) {
  const cls = bad ? "font-semibold text-amber-700 dark:text-amber-300" : "";
  return (
    <>
      <td className={`px-2 py-1 text-xs ${cls}`}>{a === null || a === undefined ? "" : String(a)}</td>
      <td className={`px-2 py-1 text-xs ${cls}`}>{b === null || b === undefined ? "" : String(b)}</td>
    </>
  );
}

// เครื่องยนต์เทียบข้อมูล (reconcile) — pure functions ไม่พึ่ง DOM/DB
import type {
  Cell,
  CellCompare,
  DiffResult,
  DiffRow,
  FieldDef,
  FieldStatus,
  Mapping,
  Row,
  RowStatus,
} from "./types";

export interface ReconcileOptions {
  trimKey: boolean;
  caseInsensitiveKey: boolean;
}

const DEFAULT_OPTS: ReconcileOptions = { trimKey: true, caseInsensitiveKey: true };

function toNumber(v: Cell): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const s = v.replace(/,/g, "").trim();
    if (s === "") return null;
    const n = Number(s);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

function normKey(v: Cell, opts: ReconcileOptions): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (opts.trimKey) s = s.trim();
  if (opts.caseInsensitiveKey) s = s.toLowerCase();
  return s;
}

function getCell(row: Row | undefined, idx: number): Cell {
  if (!row || idx < 0 || idx >= row.length) return null;
  return row[idx] ?? null;
}

function compareField(field: FieldDef, a: Cell, b: Cell): FieldStatus {
  const aEmpty = a === null || a === "";
  const bEmpty = b === null || b === "";
  if (aEmpty && bEmpty) return "match"; // ว่างทั้งคู่ = เท่ากัน
  if (aEmpty || bEmpty) return "mismatch";

  if (field.numeric) {
    const na = toNumber(a);
    const nb = toNumber(b);
    if (na === null || nb === null) {
      // เทียบเป็นข้อความแทนถ้าแปลงตัวเลขไม่ได้
      return String(a).trim() === String(b).trim() ? "match" : "mismatch";
    }
    return Math.abs(na - nb) <= (field.tolerance || 0) ? "match" : "mismatch";
  }
  return String(a).trim() === String(b).trim() ? "match" : "mismatch";
}

interface IndexedSide {
  byKey: Map<string, Row>;
  dupKeys: number;
  emptyKey: number;
}

function indexSide(rows: Row[], keyCol: number, opts: ReconcileOptions): IndexedSide {
  const byKey = new Map<string, Row>();
  let dupKeys = 0;
  let emptyKey = 0;
  for (const row of rows) {
    const rawKey = getCell(row, keyCol);
    const key = normKey(rawKey, opts);
    if (key === "") {
      emptyKey++;
      continue;
    }
    if (byKey.has(key)) {
      dupKeys++;
      continue; // เก็บแถวแรกไว้
    }
    byKey.set(key, row);
  }
  return { byKey, dupKeys, emptyKey };
}

const ROW_ORDER: Record<RowStatus, number> = {
  mismatch: 0,
  "only-a": 1,
  "only-b": 2,
  match: 3,
};

export function reconcile(
  rowsA: Row[],
  rowsB: Row[],
  mapping: Mapping,
  options: Partial<ReconcileOptions> = {},
): DiffResult {
  const opts = { ...DEFAULT_OPTS, ...options };
  const keyField = mapping.fields.find((f) => f.role === "key");
  if (!keyField) {
    throw new Error("ต้องเลือก field ที่เป็น key (คีย์สำหรับ join) อย่างน้อย 1 อัน");
  }
  const keyColA = mapping.colA[keyField.id] ?? -1;
  const keyColB = mapping.colB[keyField.id] ?? -1;
  if (keyColA < 0 || keyColB < 0) {
    throw new Error("ต้อง map คอลัมน์ key ให้ครบทั้งฝั่ง A และ B");
  }

  // เฉพาะ compare field ที่ map ครบทั้งสองฝั่ง
  const compareFields = mapping.fields.filter(
    (f) => f.role === "compare" && (mapping.colA[f.id] ?? -1) >= 0 && (mapping.colB[f.id] ?? -1) >= 0,
  );

  const A = indexSide(rowsA, keyColA, opts);
  const B = indexSide(rowsB, keyColB, opts);

  const allKeys = new Set<string>([...A.byKey.keys(), ...B.byKey.keys()]);
  const rows: DiffRow[] = [];
  let match = 0;
  let mismatch = 0;
  let onlyA = 0;
  let onlyB = 0;

  for (const key of allKeys) {
    const rowA = A.byKey.get(key);
    const rowB = B.byKey.get(key);
    const inA = rowA !== undefined;
    const inB = rowB !== undefined;

    const fields: Record<string, CellCompare> = {};
    let displayKey = "";

    if (inA && inB) {
      let anyMismatch = false;
      for (const f of compareFields) {
        const a = getCell(rowA, mapping.colA[f.id]);
        const b = getCell(rowB, mapping.colB[f.id]);
        const status = compareField(f, a, b);
        if (status === "mismatch") anyMismatch = true;
        fields[f.id] = { a, b, status };
      }
      displayKey = String(getCell(rowA, keyColA) ?? key);
      const status: RowStatus = anyMismatch ? "mismatch" : "match";
      if (status === "match") match++;
      else mismatch++;
      rows.push({ key: displayKey, status, fields });
    } else if (inA) {
      for (const f of compareFields) {
        fields[f.id] = { a: getCell(rowA, mapping.colA[f.id]), b: null, status: "na" };
      }
      displayKey = String(getCell(rowA, keyColA) ?? key);
      onlyA++;
      rows.push({ key: displayKey, status: "only-a", fields });
    } else {
      for (const f of compareFields) {
        fields[f.id] = { a: null, b: getCell(rowB, mapping.colB[f.id]), status: "na" };
      }
      displayKey = String(getCell(rowB, keyColB) ?? key);
      onlyB++;
      rows.push({ key: displayKey, status: "only-b", fields });
    }
  }

  rows.sort((x, y) => {
    const d = ROW_ORDER[x.status] - ROW_ORDER[y.status];
    if (d !== 0) return d;
    return x.key.localeCompare(y.key);
  });

  return {
    keyFieldId: keyField.id,
    keyFieldLabel: keyField.label,
    compareFields,
    rows,
    summary: {
      totalKeys: allKeys.size,
      match,
      mismatch,
      onlyA,
      onlyB,
      dupKeysA: A.dupKeys,
      dupKeysB: B.dupKeys,
      emptyKeyA: A.emptyKey,
      emptyKeyB: B.emptyKey,
    },
  };
}

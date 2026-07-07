// เปรียบเทียบ JSON 2 ชุด — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case: เทียบ payload MOMO API ↔ Pacred (หรือ before/after) ว่าเพิ่ม/หาย/เปลี่ยนตรงไหน
// ตอบปรัชญา "เทียบ/reconcile" — ไล่ลึกทุกชั้น เห็นความต่างระดับ leaf

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [k: string]: JsonValue };

export type DiffKind = "added" | "removed" | "changed" | "same";

export interface DiffNode {
  path: string; // เช่น  root.items[0].weight
  kind: DiffKind;
  left?: JsonValue; // ค่าฝั่ง A (undefined = ฝั่ง A ไม่มี → added)
  right?: JsonValue; // ค่าฝั่ง B (undefined = ฝั่ง B ไม่มี → removed)
}

export interface DiffStats {
  added: number;
  removed: number;
  changed: number;
  same: number;
}

export interface JsonDiffResult {
  ok: boolean;
  error?: string; // JSON เสีย (บอกว่าฝั่งไหน)
  nodes: DiffNode[]; // ไล่ระดับ leaf (subtree ที่เพิ่ม/หายทั้งก้อน = 1 node)
  stats: DiffStats;
}

const NODE_CAP = 5000; // กัน UI หน่วงถ้า diff ใหญ่เวอร์

function typeOf(v: JsonValue | undefined): string {
  if (v === undefined) return "undefined";
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

// ต่อ path ให้อ่านง่าย: object → .key (หรือ ["key"] ถ้ามีอักขระแปลก) · array → [i]
function joinPath(base: string, key: string | number): string {
  if (typeof key === "number") return `${base}[${key}]`;
  if (/^[A-Za-z_$][\w$]*$/.test(key)) return base === "" ? key : `${base}.${key}`;
  const safe = key.replace(/"/g, '\\"');
  return `${base}["${safe}"]`;
}

// เทียบค่าเท่ากันเป๊ะแบบ deep (ใช้จัดกลุ่ม same)
function deepEqual(a: JsonValue, b: JsonValue): boolean {
  const ta = typeOf(a);
  const tb = typeOf(b);
  if (ta !== tb) return false;
  if (ta === "array") {
    const aa = a as JsonValue[];
    const bb = b as JsonValue[];
    if (aa.length !== bb.length) return false;
    return aa.every((x, i) => deepEqual(x, bb[i]));
  }
  if (ta === "object") {
    const ao = a as Record<string, JsonValue>;
    const bo = b as Record<string, JsonValue>;
    const ak = Object.keys(ao);
    const bk = Object.keys(bo);
    if (ak.length !== bk.length) return false;
    return ak.every((k) => k in bo && deepEqual(ao[k], bo[k]));
  }
  return a === b;
}

function walk(path: string, left: JsonValue, right: JsonValue, out: DiffNode[]): void {
  if (out.length >= NODE_CAP) return;
  const tl = typeOf(left);
  const tr = typeOf(right);

  // ทั้งคู่เป็น object → ไล่ตาม union ของ key
  if (tl === "object" && tr === "object") {
    const lo = left as Record<string, JsonValue>;
    const ro = right as Record<string, JsonValue>;
    const keys = unionKeys(Object.keys(lo), Object.keys(ro));
    for (const k of keys) {
      const p = joinPath(path, k);
      const inL = k in lo;
      const inR = k in ro;
      if (inL && inR) walk(p, lo[k], ro[k], out);
      else if (inL) out.push({ path: p, kind: "removed", left: lo[k] });
      else out.push({ path: p, kind: "added", right: ro[k] });
      if (out.length >= NODE_CAP) return;
    }
    return;
  }

  // ทั้งคู่เป็น array → ไล่ตาม index (union ความยาว)
  if (tl === "array" && tr === "array") {
    const la = left as JsonValue[];
    const ra = right as JsonValue[];
    const n = Math.max(la.length, ra.length);
    for (let i = 0; i < n; i++) {
      const p = joinPath(path, i);
      const inL = i < la.length;
      const inR = i < ra.length;
      if (inL && inR) walk(p, la[i], ra[i], out);
      else if (inL) out.push({ path: p, kind: "removed", left: la[i] });
      else out.push({ path: p, kind: "added", right: ra[i] });
      if (out.length >= NODE_CAP) return;
    }
    return;
  }

  // ที่เหลือ = leaf (primitive) หรือชนิดต่างกัน → same/changed
  if (deepEqual(left, right)) out.push({ path: path || "root", kind: "same", left, right });
  else out.push({ path: path || "root", kind: "changed", left, right });
}

function unionKeys(a: string[], b: string[]): string[] {
  const seen = new Set(a);
  const out = [...a];
  for (const k of b) if (!seen.has(k)) out.push(k);
  return out;
}

function countStats(nodes: DiffNode[]): DiffStats {
  const s: DiffStats = { added: 0, removed: 0, changed: 0, same: 0 };
  for (const n of nodes) s[n.kind]++;
  return s;
}

// parse JSON แล้ว diff · error บอกว่าฝั่งไหนเสีย (A/B)
export function diffJson(aText: string, bText: string): JsonDiffResult {
  const empty: JsonDiffResult = { ok: true, nodes: [], stats: { added: 0, removed: 0, changed: 0, same: 0 } };
  if (aText.trim() === "" && bText.trim() === "") return empty;

  let a: JsonValue;
  let b: JsonValue;
  try {
    a = JSON.parse(aText === "" ? "null" : aText);
  } catch (e) {
    return { ok: false, error: `JSON ฝั่ง A เสีย: ${(e as Error).message}`, nodes: [], stats: empty.stats };
  }
  try {
    b = JSON.parse(bText === "" ? "null" : bText);
  } catch (e) {
    return { ok: false, error: `JSON ฝั่ง B เสีย: ${(e as Error).message}`, nodes: [], stats: empty.stats };
  }

  const nodes: DiffNode[] = [];
  walk("", a, b, nodes);
  return { ok: true, nodes, stats: countStats(nodes) };
}

// ย่อค่าให้โชว์ในตาราง (ตัดยาว + one-line)
export function previewValue(v: JsonValue | undefined, max = 80): string {
  if (v === undefined) return "—";
  let s: string;
  try {
    s = JSON.stringify(v);
  } catch {
    s = String(v);
  }
  if (s === undefined) s = "undefined";
  return s.length > max ? s.slice(0, max) + "…" : s;
}

// export diff เป็น CSV (เฉพาะที่ต่าง — added/removed/changed)
export function diffToCsv(nodes: DiffNode[], includeSame = false): string {
  const head = ["path", "kind", "A (ฝั่งซ้าย)", "B (ฝั่งขวา)"];
  const rows = nodes
    .filter((n) => includeSame || n.kind !== "same")
    .map((n) => [n.path, n.kind, cell(n.left), cell(n.right)]);
  return [head, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n");
}

function cell(v: JsonValue | undefined): string {
  if (v === undefined) return "";
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function csvEscape(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

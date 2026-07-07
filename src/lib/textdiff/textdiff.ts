// เทียบข้อความทีละบรรทัด (LCS) — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case: วางข้อความ 2 ชุด (เช่น list tracking/ตู้ 2 รอบ, config เก่า↔ใหม่) เห็นบรรทัด เพิ่ม/หาย/เหมือน
// อัลกอริทึม: Longest Common Subsequence แบบ deterministic — เทสได้แน่น

export type LineKind = "same" | "added" | "removed";

export interface DiffLine {
  kind: LineKind;
  aLine?: number; // เลขบรรทัดในฝั่ง A (1-based) — undefined ถ้าเป็น added
  bLine?: number; // เลขบรรทัดในฝั่ง B (1-based) — undefined ถ้าเป็น removed
  text: string;
}

export interface DiffStats {
  added: number;
  removed: number;
  same: number;
}

export interface TextDiffResult {
  lines: DiffLine[];
  stats: DiffStats;
  capped: boolean; // ตัดที่ LINE_CAP หรือไม่
}

export interface TextDiffOptions {
  ignoreCase?: boolean; // ไม่สนตัวพิมพ์เล็ก/ใหญ่
  trim?: boolean; // ตัดช่องว่างหัว-ท้ายก่อนเทียบ
  ignoreBlank?: boolean; // ข้ามบรรทัดว่าง
}

const LINE_CAP = 2000; // กัน DP บวม (O(n·m)) — เกินนี้ตัด

interface LineRef {
  text: string; // ข้อความจริง (โชว์)
  no: number; // เลขบรรทัดเดิม 1-based
  key: string; // ข้อความหลัง normalize (ใช้เทียบ)
}

function normalize(line: string, opts: TextDiffOptions): string {
  let s = line;
  if (opts.trim) s = s.trim();
  if (opts.ignoreCase) s = s.toLowerCase();
  return s;
}

function toRefs(text: string, opts: TextDiffOptions): { refs: LineRef[]; capped: boolean } {
  const raw = text === "" ? [] : text.split(/\r\n|\r|\n/);
  const refs: LineRef[] = [];
  let capped = false;
  for (let i = 0; i < raw.length; i++) {
    const key = normalize(raw[i], opts);
    if (opts.ignoreBlank && key === "") continue;
    refs.push({ text: raw[i], no: i + 1, key });
    if (refs.length >= LINE_CAP) {
      capped = raw.length > i + 1;
      break;
    }
  }
  return { refs, capped };
}

export function diffLines(aText: string, bText: string, opts: TextDiffOptions = {}): TextDiffResult {
  const { refs: A, capped: capA } = toRefs(aText, opts);
  const { refs: B, capped: capB } = toRefs(bText, opts);
  const n = A.length;
  const m = B.length;

  // ตาราง LCS: dp[i][j] = ความยาว LCS ของ A[i..] กับ B[j..]
  const dp: Int32Array[] = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    const row = dp[i];
    const next = dp[i + 1];
    for (let j = m - 1; j >= 0; j--) {
      row[j] = A[i].key === B[j].key ? next[j + 1] + 1 : Math.max(next[j], row[j + 1]);
    }
  }

  // ย้อนรอยสร้างลำดับ same/removed/added
  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i].key === B[j].key) {
      lines.push({ kind: "same", aLine: A[i].no, bLine: B[j].no, text: A[i].text });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      lines.push({ kind: "removed", aLine: A[i].no, text: A[i].text });
      i++;
    } else {
      lines.push({ kind: "added", bLine: B[j].no, text: B[j].text });
      j++;
    }
  }
  while (i < n) lines.push({ kind: "removed", aLine: A[i++].no, text: A[i - 1].text });
  while (j < m) lines.push({ kind: "added", bLine: B[j++].no, text: B[j - 1].text });

  const stats: DiffStats = { added: 0, removed: 0, same: 0 };
  for (const l of lines) stats[l.kind]++;

  return { lines, stats, capped: capA || capB };
}

// export เป็นข้อความ unified-style (+ เพิ่ม, - หาย, เว้นวรรค = เหมือน)
export function diffToText(lines: DiffLine[], includeSame = true): string {
  const out: string[] = [];
  for (const l of lines) {
    if (l.kind === "same") {
      if (includeSame) out.push("  " + l.text);
    } else if (l.kind === "added") {
      out.push("+ " + l.text);
    } else {
      out.push("- " + l.text);
    }
  }
  return out.join("\n");
}

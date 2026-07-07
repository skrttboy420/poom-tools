// จัดรูปแบบ SQL ให้อ่านง่าย — pure ล้วน (ไม่พึ่ง DOM/DB)
// use-case: วาง query ของ Pacred/Supabase → อ่านง่ายขึ้น (ขึ้นบรรทัด clause หลัก + ย่อหน้า subquery + keyword ตัวใหญ่)
//
// 🔒 ปรัชญา "ปลอดภัยเชิงความหมาย" (semantically safe):
//   - preserve token ทุกตัวตามเดิม (string / comment / quoted-ident / operator / เลขทศนิยม ไม่แตะ)
//   - เปลี่ยนแค่ 2 อย่าง: (1) ตัวพิมพ์ใหญ่ของ keyword (2) ช่องว่าง/ขึ้นบรรทัด "ระหว่าง" token
//   - กฎช่องว่าง: ถ้าเดิม 2 token ติดกัน (ไม่มีช่องว่างคั่น) → คงติดกัน (กัน 3.14 → 3 . 14, กัน ->> เพี้ยน)
//     ถ้าเดิมมีช่องว่างคั่น → ใส่ 1 ช่องว่าง (หรือขึ้นบรรทัดในจุด clause) · SQL มองช่องว่างกี่ตัวก็เท่ากัน → ปลอดภัย

export interface SqlFormatOptions {
  uppercaseKeywords?: boolean; // ทำ keyword เป็นตัวพิมพ์ใหญ่ (default true)
  indent?: string; // สตริงย่อหน้า 1 ระดับ (default 2 ช่องว่าง)
}

type TokType = "ws" | "comment" | "string" | "ident" | "word" | "symbol";
interface Tok {
  t: TokType;
  v: string;
  glueLeft: boolean; // token นี้ติดกับ token ก่อนหน้า (ไม่มี ws คั่น) หรือไม่
}

// keyword ที่ทำเป็นตัวใหญ่ (subset ที่ใช้บ่อย — ปลอดภัยเพราะแค่เปลี่ยน case)
const KEYWORDS = new Set(
  (
    "select from where group by order having limit offset union all except intersect " +
    "insert into values update set delete join inner left right full cross outer on using " +
    "and or not in is null like between exists as distinct case when then else end " +
    "asc desc with returning on conflict do nothing default primary key foreign references " +
    "create table alter drop view index if column constraint unique check " +
    "count sum avg min max coalesce cast over partition"
  ).split(" "),
);

// clause หลัก → ขึ้นบรรทัดใหม่ก่อนถึงมัน (คำแรกของ clause)
const CLAUSE_1 = new Set([
  "select", "from", "where", "having", "values", "set", "limit", "offset",
  "union", "except", "intersect", "returning", "with",
]);
// clause 2 คำ (ขึ้นบรรทัดก่อนคำแรก ถ้าตามด้วยคำที่สอง)
const CLAUSE_2: Record<string, string> = {
  group: "by",
  order: "by",
  insert: "into",
  delete: "from",
};
// คำที่เริ่ม JOIN (ขึ้นบรรทัดก่อนมัน)
const JOIN_START = new Set(["join", "inner", "left", "right", "full", "cross"]);
// คำขยาย JOIN (นำหน้า "join" ได้ — inner/left/right/full/cross/outer) → ถ้า "join"
// ตามหลังคำพวกนี้ ไม่ต้องขึ้นบรรทัดใหม่ (เพราะ modifier ขึ้นบรรทัดให้แล้ว) กัน "INNER\nJOIN"
const JOIN_PREFIX = new Set(["inner", "left", "right", "full", "cross", "outer"]);
// AND/OR → ขึ้นบรรทัด (ย่อหน้าเพิ่ม)
const BOOL_OP = new Set(["and", "or"]);

function tokenize(sql: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const n = sql.length;
  let pendingGlue = true; // token แรกถือว่า "ไม่มี ws นำหน้า"
  const push = (t: TokType, v: string) => {
    toks.push({ t, v, glueLeft: pendingGlue });
    pendingGlue = true;
  };
  while (i < n) {
    const c = sql[i];
    if (/\s/.test(c)) {
      let j = i + 1;
      while (j < n && /\s/.test(sql[j])) j++;
      pendingGlue = false; // token ถัดไปมี ws นำหน้า
      i = j;
      continue;
    }
    if (c === "-" && sql[i + 1] === "-") {
      let j = i + 2;
      while (j < n && sql[j] !== "\n") j++;
      push("comment", sql.slice(i, j));
      i = j;
      continue;
    }
    if (c === "/" && sql[i + 1] === "*") {
      let j = i + 2;
      while (j < n && !(sql[j] === "*" && sql[j + 1] === "/")) j++;
      j = Math.min(n, j + 2);
      push("comment", sql.slice(i, j));
      i = j;
      continue;
    }
    if (c === "'") {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") { j += 2; continue; }
          j++;
          break;
        }
        j++;
      }
      push("string", sql.slice(i, j));
      i = j;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === '"') {
          if (sql[j + 1] === '"') { j += 2; continue; }
          j++;
          break;
        }
        j++;
      }
      push("ident", sql.slice(i, j));
      i = j;
      continue;
    }
    if (c === "`") {
      let j = i + 1;
      while (j < n && sql[j] !== "`") j++;
      j = Math.min(n, j + 1);
      push("ident", sql.slice(i, j));
      i = j;
      continue;
    }
    if (c === "[") {
      let j = i + 1;
      while (j < n && sql[j] !== "]") j++;
      j = Math.min(n, j + 1);
      push("ident", sql.slice(i, j));
      i = j;
      continue;
    }
    // word = ตัวอักษร/เลข/_/$ ต่อกัน (รวมเลขด้วย — ไม่ทำอะไรกับเลขอยู่แล้ว)
    if (/[A-Za-z0-9_$]/.test(c)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_$]/.test(sql[j])) j++;
      push("word", sql.slice(i, j));
      i = j;
      continue;
    }
    // symbol อื่น ๆ (เก็บทีละตัว — คงตามเดิม ไม่ยุ่งกับ operator หลายตัวเพราะ glue คุมอยู่)
    push("symbol", sql.slice(i, i + 1));
    i = i + 1;
    continue;
  }
  return toks;
}

const isSig = (t: Tok) => t.t !== "comment"; // token ที่นับเชิงไวยากรณ์ (ข้าม comment ตอน lookahead)
const lower = (t: Tok) => t.v.toLowerCase();

export function formatSql(sql: string, opts: SqlFormatOptions = {}): string {
  const uppercase = opts.uppercaseKeywords !== false;
  const indentUnit = opts.indent ?? "  ";
  const toks = tokenize(sql);
  if (toks.length === 0) return "";

  // significant tokens (ไม่รวม comment) สำหรับ lookahead clause
  const sig: number[] = [];
  toks.forEach((t, idx) => { if (isSig(t)) sig.push(idx); });
  const sigPos = new Map<number, number>(); // tokIndex → ตำแหน่งใน sig[]
  sig.forEach((tokIdx, k) => sigPos.set(tokIdx, k));

  let out = "";
  let depth = 0; // ระดับ paren
  let lineStarted = false;

  const nl = (extra = 0) => {
    out = out.replace(/[ \t]+$/, "");
    out += "\n" + indentUnit.repeat(Math.max(0, depth + extra));
    lineStarted = true;
  };

  // ตรวจว่า word ที่ตำแหน่ง sig k เป็น "จุดเริ่ม clause" หรือไม่ → คืน true/false
  const wordAt = (k: number): Tok | null => {
    if (k < 0 || k >= sig.length) return null;
    const t = toks[sig[k]];
    return t.t === "word" ? t : null;
  };

  for (let idx = 0; idx < toks.length; idx++) {
    const tok = toks[idx];
    const k = sigPos.get(idx); // ตำแหน่งใน sig (ถ้าเป็น comment = undefined)

    const isWord = tok.t === "word";
    const lw = isWord ? lower(tok) : "";
    const isKw = isWord && KEYWORDS.has(lw);

    // ── ตัดสินใจขึ้นบรรทัด/ย่อหน้า ก่อน render token นี้ ──
    let newlineBefore = false;
    let extraIndent = 0;
    if (k !== undefined && isWord && lineStarted) {
      const nextW = wordAt(k + 1);
      if (CLAUSE_1.has(lw)) {
        newlineBefore = true;
      } else if (CLAUSE_2[lw] && nextW && lower(nextW) === CLAUSE_2[lw]) {
        newlineBefore = true;
      } else if (JOIN_START.has(lw)) {
        // เป็นจุดเริ่ม join ถ้าเป็น JOIN เอง หรือ prefix ที่มี JOIN ตามมาใน 3 คำ
        if (lw === "join") {
          // "join" ขึ้นบรรทัดใหม่ เฉพาะเมื่อไม่มี modifier (INNER/LEFT/...) นำหน้า
          const prevW = wordAt(k - 1);
          if (!(prevW && JOIN_PREFIX.has(lower(prevW)))) newlineBefore = true;
        } else {
          for (let d = 1; d <= 3; d++) {
            const w = wordAt(k + d);
            if (w && lower(w) === "join") { newlineBefore = true; break; }
            if (!w) break;
          }
        }
      } else if (BOOL_OP.has(lw)) {
        newlineBefore = true;
        extraIndent = 1;
      }
    }

    // ── render ──
    const rendered =
      tok.t === "word" && isKw && uppercase ? tok.v.toUpperCase() : tok.v;

    if (tok.t === "symbol" && tok.v === "(") {
      // เปิดวงเล็บ: render ตามช่องว่างเดิม แล้วเพิ่ม depth
      emitSpace(tok);
      out += "(";
      depth++;
      lineStarted = true;
      continue;
    }
    if (tok.t === "symbol" && tok.v === ")") {
      depth = Math.max(0, depth - 1);
      // ปิดวงเล็บ: ชิดตัวหน้า (ตาม glue) — ไม่ขึ้นบรรทัด
      out += ")";
      lineStarted = true;
      continue;
    }
    if (tok.t === "symbol" && tok.v === ",") {
      // comma ชิดซ้าย แล้วขึ้นบรรทัดใหม่หลัง comma (อ่าน select list ง่าย)
      out = out.replace(/[ \t]+$/, "");
      out += ",";
      nl();
      continue;
    }
    if (tok.t === "symbol" && tok.v === ";") {
      out = out.replace(/[ \t]+$/, "");
      out += ";";
      nl();
      continue;
    }

    if (newlineBefore) {
      nl(extraIndent);
      out += rendered;
      lineStarted = true;
      continue;
    }

    emitSpace(tok);
    out += rendered;
    lineStarted = true;
  }

  // ใส่ช่องว่างก่อน token ตามกฎ glue (คงติด/แยกตามต้นฉบับ)
  function emitSpace(tok: Tok) {
    if (!lineStarted) return; // ต้นบรรทัด — ไม่ต้องเว้น
    if (out === "") return;
    const last = out[out.length - 1];
    if (last === "\n" || last === " " || last === "\t") return;
    if (!tok.glueLeft) out += " ";
  }

  // เก็บกวาด: ตัดช่องว่างท้ายบรรทัด + บรรทัดว่างซ้อน + trim
  return out
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

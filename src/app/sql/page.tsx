"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatSql } from "@/lib/sql/format";
import { downloadText } from "@/lib/reconcile/export";

const SAMPLE = `select t.tracking, t.weight, c.container_no, sum(t.cbm) as total_cbm from tracking t inner join container c on c.id = t.container_id where t.weight > 0 and c.status = 'active' group by t.tracking, t.weight, c.container_no order by total_cbm desc limit 100`;

const INDENT_OPTIONS: { id: string; label: string; value: string }[] = [
  { id: "2", label: "2 ช่อง", value: "  " },
  { id: "4", label: "4 ช่อง", value: "    " },
  { id: "tab", label: "Tab", value: "\t" },
];

export default function SqlPage() {
  const [input, setInput] = useState("");
  const [uppercase, setUppercase] = useState(true);
  const [indentId, setIndentId] = useState("2");
  const [copied, setCopied] = useState(false);

  const indentUnit = INDENT_OPTIONS.find((o) => o.id === indentId)?.value ?? "  ";

  const output = useMemo(() => {
    if (!input.trim()) return "";
    return formatSql(input, { uppercaseKeywords: uppercase, indent: indentUnit });
  }, [input, uppercase, indentUnit]);

  const copy = async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* เงียบไว้ ถ้า clipboard ถูกบล็อก */
    }
  };

  const save = () => {
    if (output) downloadText("formatted.sql", output, "text/sql");
  };

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
        <div>
          <h1 className="text-lg font-semibold">จัดรูปแบบ SQL 🗃️</h1>
          <p className="text-xs text-neutral-500">
            วาง query ของ Pacred/Supabase → อ่านง่ายขึ้น · <b>ปลอดภัยเชิงความหมาย</b> (ไม่แตะ operator/string/comment/ทศนิยม — แค่ขึ้นบรรทัด + ตัวพิมพ์ keyword)
          </p>
        </div>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← กลับหน้าหลัก
        </Link>
      </header>

      <section className="mx-auto w-full max-w-5xl flex-1 space-y-4 p-6">
        {/* แถบควบคุม */}
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-sm">
            <input type="checkbox" checked={uppercase} onChange={(e) => setUppercase(e.target.checked)} />
            keyword ตัวพิมพ์ใหญ่
          </label>

          <div className="flex items-center gap-1">
            <span className="text-xs text-neutral-500">ย่อหน้า:</span>
            {INDENT_OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setIndentId(o.id)}
                className={`rounded-md border px-2.5 py-1 text-xs transition ${
                  indentId === o.id
                    ? "border-transparent bg-neutral-900 text-white dark:bg-white dark:text-black"
                    : "border-black/15 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={() => setInput(SAMPLE)}
              className="rounded-lg border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
            >
              ตัวอย่าง
            </button>
            <button
              type="button"
              onClick={() => setInput("")}
              className="rounded-lg border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
            >
              ล้าง
            </button>
          </div>
        </div>

        {/* input + output */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <span className="block text-xs text-neutral-500">วาง SQL ที่นี่</span>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="select * from tracking where ..."
              spellCheck={false}
              className="h-[55vh] w-full resize-none rounded-xl border border-black/15 bg-transparent p-3 font-mono text-xs outline-none focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="block text-xs text-neutral-500">ผลลัพธ์</span>
              {output && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={copy}
                    className="rounded-md border border-black/15 px-2.5 py-1 text-xs hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
                  >
                    {copied ? "คัดลอกแล้ว ✓" : "คัดลอก"}
                  </button>
                  <button
                    type="button"
                    onClick={save}
                    className="rounded-md border border-black/15 px-2.5 py-1 text-xs hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
                  >
                    ดาวน์โหลด .sql
                  </button>
                </div>
              )}
            </div>
            <textarea
              readOnly
              value={output}
              placeholder="ผลลัพธ์จะขึ้นที่นี่"
              spellCheck={false}
              className="h-[55vh] w-full resize-none rounded-xl border border-black/15 bg-black/[0.02] p-3 font-mono text-xs outline-none dark:border-white/15 dark:bg-white/[0.03]"
            />
          </div>
        </div>

        <p className="text-xs text-neutral-400">
          💡 ตัวจัดรูปนี้ <b>ไม่แก้ความหมาย query</b> — เก็บ operator (<code>-&gt;&gt;</code>, <code>::</code>, <code>!=</code>),
          ทศนิยม, string, comment ไว้เป๊ะทุกตัว เปลี่ยนแค่ช่องว่าง/ขึ้นบรรทัด และตัวพิมพ์ของ keyword เท่านั้น
        </p>
      </section>
    </main>
  );
}

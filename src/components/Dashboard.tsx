"use client";

// Dashboard (หน้าแรกสไตล์ SaaS)
// · hero + ทักทาย + ช่องค้นหาใหญ่ (reuse searchTools)
// · การ์ดสรุป (วิเคราะห์และสรุป): พร้อมใช้ / รายการโปรด / เคยใช้ / หมวดหมู่ / เข้าใช้รวม
// · ทางลัด: รายการโปรด ⭐ · ใช้บ่อย 🔥 · ล่าสุด 🕘 (เก็บใน localStorage ผ่าน useUsage/useFavs)
// · พร้อมใช้แล้ว + แต่ละหมวด (เรียง ready ก่อน soon)
// ข้อมูล usage เก็บ client-side ผ่าน useSyncExternalStore (SSR snapshot ว่าง → sync ทีหลัง กัน hydration mismatch)

import { useMemo, useState } from "react";
import Link from "next/link";
import { CATEGORIES, TOOLS, searchTools, readyTools, type Tool } from "@/lib/tools/registry";
import { useFavs } from "@/lib/tools/useFavs";
import { useUsage } from "@/lib/tools/useUsage";

export default function Dashboard({ email }: { email: string }) {
  const [query, setQuery] = useState("");
  const [favs, toggleFav] = useFavs();
  const usage = useUsage();

  const searching = query.trim().length > 0;
  const results = useMemo(() => searchTools(query), [query]);

  const byId = useMemo(() => new Map(TOOLS.map((t) => [t.id, t])), []);
  const ready = useMemo(() => readyTools(), []);
  const readyCount = ready.length;
  const categoryCount = useMemo(
    () => CATEGORIES.filter((c) => TOOLS.some((t) => t.category === c.id)).length,
    [],
  );

  const favTools = useMemo(
    () => favs.map((id) => byId.get(id)).filter((t): t is Tool => Boolean(t)),
    [favs, byId],
  );

  // ใช้บ่อยสุด (เรียงตามจำนวนครั้ง) · ล่าสุด (เรียงตามเวลาเข้าล่าสุด)
  const mostUsed = useMemo(
    () =>
      Object.entries(usage)
        .filter(([, e]) => e.count > 0)
        .sort((a, b) => b[1].count - a[1].count)
        .map(([id]) => byId.get(id))
        .filter((t): t is Tool => Boolean(t))
        .slice(0, 8),
    [usage, byId],
  );
  const recent = useMemo(
    () =>
      Object.entries(usage)
        .filter(([, e]) => e.last > 0)
        .sort((a, b) => b[1].last - a[1].last)
        .map(([id]) => byId.get(id))
        .filter((t): t is Tool => Boolean(t))
        .slice(0, 8),
    [usage, byId],
  );

  const usedCount = useMemo(() => Object.values(usage).filter((e) => e.count > 0).length, [usage]);
  const totalVisits = useMemo(() => Object.values(usage).reduce((s, e) => s + e.count, 0), [usage]);

  const name = email ? email.split("@")[0] : "ภูม";

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-black/10 bg-gradient-to-br from-emerald-500/10 via-sky-500/5 to-violet-500/10 p-6 sm:p-8 dark:border-white/10">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-violet-400/20 blur-3xl" />
        <div className="relative">
          <p className="text-xs font-medium uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
            poom-tools · แดชบอร์ด
          </p>
          <h2 className="mt-1 text-2xl font-semibold sm:text-3xl">
            สวัสดี {name} 👋 วันนี้อยากทำอะไร?
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            พิมพ์สิ่งที่อยากทำ เช่น &quot;เทียบ excel&quot; · &quot;หาข้อมูลหาย&quot; · &quot;คำนวณ cbm&quot; — มี{" "}
            {readyCount} เครื่องมือพร้อมใช้
          </p>
          <div className="relative mt-4 max-w-xl">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400">
              🔍
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาเครื่องมือ..."
              autoFocus
              className="w-full rounded-full border border-black/15 bg-white/70 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-emerald-400 dark:border-white/15 dark:bg-white/5 dark:focus:border-emerald-400"
            />
          </div>
        </div>
      </div>

      {searching ? (
        /* โหมดค้นหา */
        <section>
          <SectionHead icon="🔍" title={`ผลการค้นหา "${query}" · ${results.length} รายการ`} />
          {results.length === 0 ? (
            <p className="rounded-xl border border-dashed border-black/15 px-4 py-10 text-center text-sm text-neutral-500 dark:border-white/15">
              ยังไม่มีเครื่องมือที่ตรงกับคำนี้ — ลองคำอื่น หรือเดี๋ยวเราเพิ่มให้ 🙂
            </p>
          ) : (
            <ToolGrid tools={results} favs={favs} onFav={toggleFav} />
          )}
        </section>
      ) : (
        <>
          {/* วิเคราะห์และสรุป */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard icon="✅" label="พร้อมใช้" value={readyCount} accent="emerald" />
            <StatCard icon="⭐" label="รายการโปรด" value={favTools.length} accent="amber" />
            <StatCard icon="🔥" label="เคยใช้แล้ว" value={usedCount} accent="rose" />
            <StatCard icon="📂" label="หมวดหมู่" value={categoryCount} accent="sky" />
            <StatCard icon="🕘" label="เข้าใช้รวม" value={totalVisits} accent="violet" />
          </section>

          {/* ทางลัด */}
          {favTools.length > 0 && (
            <section>
              <SectionHead icon="⭐" title="รายการโปรด" />
              <ToolGrid tools={favTools} favs={favs} onFav={toggleFav} />
            </section>
          )}
          {mostUsed.length > 0 && (
            <section>
              <SectionHead icon="🔥" title="ใช้บ่อย" />
              <ShortcutRow tools={mostUsed} usage={usage} />
            </section>
          )}
          {recent.length > 0 && (
            <section>
              <SectionHead icon="🕘" title="ใช้ล่าสุด" />
              <ShortcutRow tools={recent} usage={usage} />
            </section>
          )}

          {/* พร้อมใช้แล้ว */}
          <section>
            <SectionHead icon="🧰" title={`พร้อมใช้แล้ว · ${readyCount}`} />
            <ToolGrid tools={ready} favs={favs} onFav={toggleFav} />
          </section>

          {/* ทุกหมวด */}
          {CATEGORIES.map((cat) => {
            const tools = TOOLS.filter((t) => t.category === cat.id);
            if (tools.length === 0) return null;
            const sorted = [...tools].sort((a, b) =>
              a.status === b.status ? 0 : a.status === "ready" ? -1 : 1,
            );
            return (
              <section key={cat.id}>
                <SectionHead icon={cat.icon} title={cat.name} />
                <ToolGrid tools={sorted} favs={favs} onFav={toggleFav} />
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}

/* ── การ์ดสรุป (stat) ── */
const ACCENTS = {
  emerald: "from-emerald-500/15 to-emerald-500/0 text-emerald-600 dark:text-emerald-400",
  amber: "from-amber-500/15 to-amber-500/0 text-amber-600 dark:text-amber-400",
  rose: "from-rose-500/15 to-rose-500/0 text-rose-600 dark:text-rose-400",
  sky: "from-sky-500/15 to-sky-500/0 text-sky-600 dark:text-sky-400",
  violet: "from-violet-500/15 to-violet-500/0 text-violet-600 dark:text-violet-400",
} as const;

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: string;
  label: string;
  value: number;
  accent: keyof typeof ACCENTS;
}) {
  return (
    <div
      className={`rounded-xl border border-black/10 bg-gradient-to-br p-4 dark:border-white/10 ${ACCENTS[accent]}`}
    >
      <div className="flex items-center gap-2">
        <span className="text-lg" aria-hidden>
          {icon}
        </span>
        <span className="text-xs font-medium text-neutral-500">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
        {value}
      </p>
    </div>
  );
}

/* ── แถวทางลัด (chip แบบกดไปเลย) ── */
function ShortcutRow({ tools, usage }: { tools: Tool[]; usage: Record<string, { count: number }> }) {
  return (
    <div className="flex flex-wrap gap-2">
      {tools.map((t) =>
        t.href ? (
          <Link
            key={t.id}
            href={t.href}
            className="group flex items-center gap-2 rounded-full border border-black/10 bg-white/60 py-1.5 pl-3 pr-3.5 text-sm transition hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-sm dark:border-white/10 dark:bg-white/5"
          >
            <span aria-hidden>{t.icon}</span>
            <span className="truncate">{t.name}</span>
            {usage[t.id]?.count > 1 && (
              <span className="rounded-full bg-black/5 px-1.5 text-[10px] tabular-nums text-neutral-500 dark:bg-white/10">
                {usage[t.id].count}
              </span>
            )}
          </Link>
        ) : null,
      )}
    </div>
  );
}

/* ── ส่วนหัว ── */
function SectionHead({ icon, title }: { icon: string; title: string }) {
  return (
    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
      <span aria-hidden>{icon}</span>
      {title}
    </h3>
  );
}

/* ── grid + การ์ดเครื่องมือ ── */
function ToolGrid({ tools, favs, onFav }: { tools: Tool[]; favs: string[]; onFav: (id: string) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tools.map((t) => (
        <ToolCard key={t.id} tool={t} isFav={favs.includes(t.id)} onFav={() => onFav(t.id)} />
      ))}
    </div>
  );
}

function ToolCard({ tool, isFav, onFav }: { tool: Tool; isFav: boolean; onFav: () => void }) {
  const ready = tool.status === "ready";
  return (
    <div
      className={`group relative rounded-xl border p-4 transition ${
        ready
          ? "border-black/10 hover:-translate-y-0.5 hover:border-black/30 hover:shadow-sm dark:border-white/10 dark:hover:border-white/30"
          : "border-dashed border-black/10 opacity-70 dark:border-white/10"
      }`}
    >
      {ready && tool.href && (
        <Link href={tool.href} className="absolute inset-0 rounded-xl" aria-label={tool.name} />
      )}

      <button
        type="button"
        onClick={onFav}
        aria-label={isFav ? "เอาออกจากรายการโปรด" : "เพิ่มในรายการโปรด"}
        className={`absolute right-3 top-3 z-10 text-sm transition ${
          isFav ? "text-amber-400" : "text-neutral-300 hover:text-neutral-500 dark:text-neutral-600"
        }`}
      >
        {isFav ? "★" : "☆"}
      </button>

      <div className="flex items-start gap-3">
        <span className="text-2xl" aria-hidden>
          {tool.icon}
        </span>
        <div className="min-w-0 flex-1 pr-4">
          <h4 className="truncate text-sm font-semibold">{tool.name}</h4>
          <p className="mt-0.5 text-xs text-neutral-500">{tool.desc}</p>
          <span
            className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
              ready
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
            }`}
          >
            {ready ? "พร้อมใช้" : "เร็ว ๆ นี้"}
          </span>
        </div>
      </div>
    </div>
  );
}

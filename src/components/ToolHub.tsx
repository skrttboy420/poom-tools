"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { CATEGORIES, TOOLS, searchTools, type Tool } from "@/lib/tools/registry";

const FAV_KEY = "poom-tools:favs";

// อ่าน/เขียนรายการโปรดผ่าน localStorage ด้วย useSyncExternalStore
// (เลี่ยง setState-in-effect + กัน hydration mismatch: SSR = "[]" แล้ว client sync ทีหลัง)
function subscribeFavs(cb: () => void) {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}
function getFavsSnapshot() {
  return localStorage.getItem(FAV_KEY) ?? "[]";
}
function getFavsServerSnapshot() {
  return "[]";
}

function useFavs(): [string[], (id: string) => void] {
  const raw = useSyncExternalStore(subscribeFavs, getFavsSnapshot, getFavsServerSnapshot);
  const favs = useMemo<string[]>(() => {
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }, [raw]);
  const toggle = (id: string) => {
    const next = favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id];
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event("storage")); // แจ้ง subscriber ในแท็บเดียวกัน
  };
  return [favs, toggle];
}

export default function ToolHub() {
  const [query, setQuery] = useState("");
  const [favs, toggleFav] = useFavs();

  const results = useMemo(() => searchTools(query), [query]);
  const readyCount = TOOLS.filter((t) => t.status === "ready").length;
  const searching = query.trim().length > 0;

  const favTools = useMemo(
    () => favs.map((id) => TOOLS.find((t) => t.id === id)).filter((t): t is Tool => Boolean(t)),
    [favs],
  );

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* Hero + ช่องค้นหา */}
      <div className="pt-2 text-center">
        <h2 className="text-2xl font-semibold sm:text-3xl">วันนี้คุณอยากทำอะไร?</h2>
        <p className="mt-1 text-sm text-neutral-500">
          พิมพ์สิ่งที่อยากทำ เช่น &quot;เทียบ excel&quot; · &quot;หาข้อมูลหาย&quot; · &quot;คำนวณ cbm&quot; — มี {readyCount} เครื่องมือพร้อมใช้
        </p>
        <div className="relative mx-auto mt-4 max-w-xl">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400">🔍</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาเครื่องมือ..."
            autoFocus
            className="w-full rounded-full border border-black/15 bg-transparent py-3 pl-11 pr-4 text-sm outline-none transition focus:border-black/40 dark:border-white/15 dark:focus:border-white/40"
          />
        </div>
      </div>

      {/* โหมดค้นหา */}
      {searching ? (
        <section>
          <h3 className="mb-3 text-sm font-medium text-neutral-500">
            ผลการค้นหา &quot;{query}&quot; · {results.length} รายการ
          </h3>
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
          {/* รายการโปรด */}
          {favTools.length > 0 && (
            <section>
              <SectionHead icon="⭐" title="รายการโปรด" />
              <ToolGrid tools={favTools} favs={favs} onFav={toggleFav} />
            </section>
          )}

          {/* พร้อมใช้แล้ว */}
          <section>
            <SectionHead icon="✅" title="พร้อมใช้แล้ว" />
            <ToolGrid tools={TOOLS.filter((t) => t.status === "ready")} favs={favs} onFav={toggleFav} />
          </section>

          {/* ทุกหมวด (เรียงตามความสำคัญ) */}
          {CATEGORIES.map((cat) => {
            const tools = TOOLS.filter((t) => t.category === cat.id);
            if (tools.length === 0) return null;
            // เรียง ready ก่อน soon
            const sorted = [...tools].sort((a, b) => (a.status === b.status ? 0 : a.status === "ready" ? -1 : 1));
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

function SectionHead({ icon, title }: { icon: string; title: string }) {
  return (
    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
      <span aria-hidden>{icon}</span>
      {title}
    </h3>
  );
}

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
      {/* พื้นที่คลิกทั้งการ์ด (เฉพาะ ready) */}
      {ready && tool.href && (
        <Link href={tool.href} className="absolute inset-0 rounded-xl" aria-label={tool.name} />
      )}

      {/* ปุ่มดาว (อยู่เหนือ overlay) */}
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
          <div className="flex items-center gap-2">
            <h4 className="truncate text-sm font-semibold">{tool.name}</h4>
          </div>
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

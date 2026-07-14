"use client";

// แถบเมนูซ้าย (SaaS-style sidebar) — อ่านเครื่องมือจาก registry (data-driven)
// · brand + ช่องค้นหา (reuse searchTools) · รายการโปรด (reuse useFavs) ·
//   หมวดหมู่พับเปิด-ปิดได้ แต่ละหมวดลิสต์เครื่องมือเป็น <Link> ไฮไลต์ตัวที่กำลังเปิด (usePathname)
// · footer = ปุ่มออกจากระบบ
// ไม่ยุ่งกับ logic ของเครื่องมือเดิมเลย (แค่ nav)

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CATEGORIES,
  toolsByCategory,
  searchTools,
  type Tool,
} from "@/lib/tools/registry";
import { useFavs } from "@/lib/tools/useFavs";
import LogoutButton from "@/components/LogoutButton";

// หมวดที่มีเครื่องมือของ tool ปัจจุบัน (ไว้เปิดหมวดนั้นอัตโนมัติ)
function categoryOfPath(pathname: string): string | null {
  for (const cat of CATEGORIES) {
    const tools = toolsByCategory(cat.id);
    if (tools.some((t) => t.href && t.href === pathname)) return cat.id;
  }
  return null;
}

// แถวลิงก์เครื่องมือ 1 อัน — ไฮไลต์เมื่อ active · soon = จาง กดไม่ได้
function ToolLink({
  tool,
  active,
  fav,
  onToggleFav,
}: {
  tool: Tool;
  active: boolean;
  fav: boolean;
  onToggleFav: (id: string) => void;
}) {
  const base =
    "group flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition";
  const inner = (
    <>
      <span aria-hidden className="text-base leading-none">
        {tool.icon}
      </span>
      <span className="flex-1 truncate">{tool.name}</span>
      {tool.status === "soon" && (
        <span className="rounded bg-neutral-200 px-1 text-[10px] text-neutral-500 dark:bg-neutral-700 dark:text-neutral-300">
          เร็ว ๆ นี้
        </span>
      )}
    </>
  );

  return (
    <div className="flex items-center">
      {tool.status === "ready" && tool.href ? (
        <Link
          href={tool.href}
          className={`${base} flex-1 ${
            active
              ? "bg-emerald-500/15 font-medium text-emerald-700 dark:text-emerald-300"
              : "text-neutral-700 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/5"
          }`}
        >
          {inner}
        </Link>
      ) : (
        <span
          className={`${base} flex-1 cursor-default text-neutral-400 dark:text-neutral-600`}
        >
          {inner}
        </span>
      )}
      <button
        type="button"
        onClick={() => onToggleFav(tool.id)}
        aria-label={fav ? `เอา ${tool.name} ออกจากรายการโปรด` : `เพิ่ม ${tool.name} เป็นรายการโปรด`}
        title={fav ? "เอาออกจากรายการโปรด" : "เพิ่มรายการโปรด"}
        className="px-1 text-sm text-amber-400 opacity-0 transition group-hover:opacity-100 aria-[pressed=true]:opacity-100"
        aria-pressed={fav}
      >
        {fav ? "★" : "☆"}
      </button>
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const [favs, toggleFav] = useFavs();
  const [query, setQuery] = useState("");

  const activeCat = categoryOfPath(pathname);
  // หมวดที่เปิดอยู่ — เริ่มต้นเปิดหมวดของเครื่องมือปัจจุบัน
  const [openCats, setOpenCats] = useState<Record<string, boolean>>(() =>
    activeCat ? { [activeCat]: true } : {},
  );

  const results = useMemo(() => searchTools(query), [query]);
  const favTools = useMemo(() => {
    const all = CATEGORIES.flatMap((c) => toolsByCategory(c.id));
    const byId = new Map(all.map((t) => [t.id, t]));
    return favs.map((id) => byId.get(id)).filter((t): t is Tool => Boolean(t));
  }, [favs]);

  const isFav = (id: string) => favs.includes(id);
  const toggleCat = (id: string) =>
    setOpenCats((prev) => ({ ...prev, [id]: !prev[id] }));

  const searching = query.trim().length > 0;

  return (
    <div className="flex h-full flex-col">
      {/* brand */}
      <div className="flex items-center gap-2 border-b border-black/10 px-4 py-4 dark:border-white/10">
        <Link href="/" className="flex items-center gap-2">
          <span aria-hidden className="text-xl">
            🧰
          </span>
          <span className="text-base font-semibold tracking-tight">poom-tools</span>
        </Link>
      </div>

      {/* search */}
      <div className="px-3 py-3">
        <div className="relative">
          <span
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400"
          >
            🔍
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาเครื่องมือ…"
            className="w-full rounded-lg border border-black/10 bg-white/60 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-emerald-400 dark:border-white/10 dark:bg-white/5"
          />
        </div>
      </div>

      {/* body (scroll) */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {searching ? (
          // โหมดค้นหา = ลิสต์แบน
          <div className="space-y-0.5">
            <p className="px-2.5 py-1 text-xs text-neutral-500">
              ผลการค้นหา · {results.length}
            </p>
            {results.length === 0 ? (
              <p className="px-2.5 py-2 text-sm text-neutral-400">ไม่พบเครื่องมือ</p>
            ) : (
              results.map((tool) => (
                <ToolLink
                  key={tool.id}
                  tool={tool}
                  active={Boolean(tool.href && tool.href === pathname)}
                  fav={isFav(tool.id)}
                  onToggleFav={toggleFav}
                />
              ))
            )}
          </div>
        ) : (
          <>
            {/* รายการโปรด */}
            {favTools.length > 0 && (
              <div className="mb-3">
                <p className="px-2.5 py-1 text-xs font-semibold text-amber-500">
                  ⭐ รายการโปรด
                </p>
                <div className="space-y-0.5">
                  {favTools.map((tool) => (
                    <ToolLink
                      key={tool.id}
                      tool={tool}
                      active={Boolean(tool.href && tool.href === pathname)}
                      fav
                      onToggleFav={toggleFav}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* หมวดหมู่ */}
            {CATEGORIES.map((cat) => {
              const tools = toolsByCategory(cat.id);
              if (tools.length === 0) return null;
              const open = openCats[cat.id] ?? false;
              return (
                <div key={cat.id} className="mb-1">
                  <button
                    type="button"
                    onClick={() => toggleCat(cat.id)}
                    aria-expanded={open}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm font-medium text-neutral-600 transition hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/5"
                  >
                    <span aria-hidden>{cat.icon}</span>
                    <span className="flex-1 truncate">{cat.name}</span>
                    <span
                      aria-hidden
                      className={`text-xs text-neutral-400 transition-transform ${open ? "rotate-90" : ""}`}
                    >
                      ▶
                    </span>
                  </button>
                  {open && (
                    <div className="mt-0.5 space-y-0.5 pl-2">
                      {tools.map((tool) => (
                        <ToolLink
                          key={tool.id}
                          tool={tool}
                          active={Boolean(tool.href && tool.href === pathname)}
                          fav={isFav(tool.id)}
                          onToggleFav={toggleFav}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </nav>

      {/* footer */}
      <div className="border-t border-black/10 px-3 py-3 dark:border-white/10">
        <LogoutButton />
      </div>
    </div>
  );
}

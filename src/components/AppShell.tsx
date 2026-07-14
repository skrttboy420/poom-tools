"use client";

// เปลือกแอป (SaaS shell) — ครอบ sidebar ซ้าย + พื้นที่เนื้อหาขวา
// · ซ่อน sidebar ทั้งหมดในหน้า /login (แสดง children เปล่า ๆ)
// · desktop: sidebar ค้างซ้าย (sticky, w-64) · mobile: ปุ่มแฮมเบอร์เกอร์เปิด drawer ทับ
// ไม่ยุ่งกับ logic เครื่องมือเดิม — แค่ห่อ layout

import { useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { useTrackVisit } from "@/lib/tools/useUsage";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // บันทึกการเข้าใช้เครื่องมือ (hook ต้องรันทุกครั้งเสมอ — วางก่อน early-return ของ /login)
  useTrackVisit();

  // ปิด drawer ทุกครั้งที่เปลี่ยนหน้า — ปรับ state ตอน render เมื่อ pathname เปลี่ยน
  // (แทน useEffect เพื่อเลี่ยงกฎ set-state-in-effect ของ React 19)
  const [prevPath, setPrevPath] = useState(pathname);
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    setDrawerOpen(false);
  }

  // หน้า login = ไม่มี shell
  if (pathname === "/login") return <>{children}</>;

  return (
    <div className="flex min-h-full flex-1">
      {/* sidebar — desktop (ค้างซ้าย) */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-black/10 bg-white/70 backdrop-blur md:block dark:border-white/10 dark:bg-neutral-900/70">
        <Sidebar />
      </aside>

      {/* sidebar — mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="ปิดเมนู"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <aside className="absolute left-0 top-0 h-full w-64 border-r border-black/10 bg-white shadow-xl dark:border-white/10 dark:bg-neutral-900">
            <Sidebar />
          </aside>
        </div>
      )}

      {/* พื้นที่เนื้อหา */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* topbar (mobile) — ปุ่มเปิดเมนู */}
        <div className="flex items-center gap-2 border-b border-black/10 px-4 py-3 md:hidden dark:border-white/10">
          <button
            type="button"
            aria-label="เปิดเมนู"
            onClick={() => setDrawerOpen(true)}
            className="rounded-lg p-1.5 text-lg transition hover:bg-black/5 dark:hover:bg-white/5"
          >
            ☰
          </button>
          <span className="text-sm font-semibold tracking-tight">🧰 poom-tools</span>
        </div>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

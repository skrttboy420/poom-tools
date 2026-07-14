"use client";

// hook ติดตามการใช้งานเครื่องมือ (usage) เก็บใน localStorage คีย์ "poom-tools:usage"
// ใช้ useSyncExternalStore แบบเดียวกับ useFavs (เลี่ยง set-state-in-effect ของ React 19
//   + กัน hydration mismatch: SSR snapshot = "{}" แล้ว client sync ทีหลัง)
// บันทึกทุกครั้งที่เข้าหน้าเครื่องมือ (path ตรงกับ href ใน registry) ผ่าน useTrackVisit()
// เขียนแล้ว dispatch event "storage" เพื่อ sync ทุก subscriber ในแท็บเดียวกัน

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { TOOLS } from "@/lib/tools/registry";

export const USAGE_KEY = "poom-tools:usage";

export interface UsageEntry {
  count: number; // เข้าใช้กี่ครั้ง
  last: number; // เข้าใช้ครั้งล่าสุด (epoch ms)
}
export type UsageMap = Record<string, UsageEntry>;

function subscribeUsage(cb: () => void) {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}
function getUsageSnapshot() {
  return localStorage.getItem(USAGE_KEY) ?? "{}";
}
function getUsageServerSnapshot() {
  return "{}";
}

function parseUsage(raw: string): UsageMap {
  try {
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? (obj as UsageMap) : {};
  } catch {
    return {};
  }
}

// บันทึกการเข้าใช้ 1 ครั้ง (plain function เรียกได้นอก React)
export function recordVisit(id: string) {
  try {
    const map = parseUsage(localStorage.getItem(USAGE_KEY) ?? "{}");
    const prev = map[id] ?? { count: 0, last: 0 };
    map[id] = { count: prev.count + 1, last: Date.now() };
    localStorage.setItem(USAGE_KEY, JSON.stringify(map));
    window.dispatchEvent(new Event("storage")); // แจ้ง subscriber ในแท็บเดียวกัน
  } catch {
    /* localStorage อาจถูกบล็อก */
  }
}

export function useUsage(): UsageMap {
  const raw = useSyncExternalStore(subscribeUsage, getUsageSnapshot, getUsageServerSnapshot);
  return useMemo<UsageMap>(() => parseUsage(raw), [raw]);
}

// เรียกใน AppShell — บันทึกเมื่อเข้าหน้าที่ path ตรงกับเครื่องมือใน registry
// (เขียน localStorage ใน useEffect = side-effect ที่ถูกต้อง ไม่ใช่ setState จึงไม่ผิดกฎ React 19)
export function useTrackVisit() {
  const pathname = usePathname();
  useEffect(() => {
    const tool = TOOLS.find((t) => t.href === pathname);
    if (tool) recordVisit(tool.id);
  }, [pathname]);
}

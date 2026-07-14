"use client";

// hook รายการโปรด (favorites) ที่ใช้ร่วมกันระหว่าง Sidebar + Dashboard
// เก็บใน localStorage คีย์ "poom-tools:favs" · ใช้ useSyncExternalStore
// เพื่อเลี่ยง set-state-in-effect ของ React 19 + กัน hydration mismatch
//   (SSR snapshot = "[]" แล้ว client sync ทีหลัง)
// เขียนแล้ว dispatch event "storage" เพื่อ sync ทุก subscriber ในแท็บเดียวกัน

import { useMemo, useSyncExternalStore } from "react";

export const FAV_KEY = "poom-tools:favs";

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

export function useFavs(): [string[], (id: string) => void] {
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
      /* localStorage อาจถูกบล็อก */
    }
    window.dispatchEvent(new Event("storage")); // แจ้ง subscriber ในแท็บเดียวกัน
  };
  return [favs, toggle];
}

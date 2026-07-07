"use client";

import { useEffect, useSyncExternalStore } from "react";

// ปุ่มสลับธีม 3 สถานะ: ตามระบบ → สว่าง → มืด (วนลูป) · เก็บใน localStorage
// ใช้ useSyncExternalStore แทน useState+effect เพื่อเลี่ยง hydration mismatch + กฎ set-state-in-effect ของ React 19
export type Theme = "system" | "light" | "dark";

const KEY = "poom-theme";
const EVT = "poom-theme-change";
const ORDER: Theme[] = ["system", "light", "dark"];
const META: Record<Theme, { icon: string; label: string }> = {
  system: { icon: "🖥️", label: "ตามระบบ" },
  light: { icon: "☀️", label: "สว่าง" },
  dark: { icon: "🌙", label: "มืด" },
};

// resolve system → มืดจริงไหม แล้ว toggle class .dark บน <html>
function applyTheme(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

function readTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    if (t === "light" || t === "dark" || t === "system") return t;
  } catch {
    /* localStorage อาจถูกบล็อก */
  }
  return "system";
}

function subscribe(cb: () => void) {
  window.addEventListener(EVT, cb);
  window.addEventListener("storage", cb); // sync ข้ามแท็บ
  return () => {
    window.removeEventListener(EVT, cb);
    window.removeEventListener("storage", cb);
  };
}

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "system" as Theme);

  // โหมด system: ตามการเปลี่ยนธีมของ OS แบบสด
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const cycle = () => {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* เงียบไว้ */
    }
    applyTheme(next);
    window.dispatchEvent(new Event(EVT)); // แจ้ง store ให้ re-render icon
  };

  const meta = META[theme];
  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`ธีม: ${meta.label} (คลิกเพื่อสลับ)`}
      title={`ธีม: ${meta.label} — คลิกเพื่อสลับ`}
      className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border border-black/15 bg-white/90 px-3.5 py-2 text-sm shadow-lg backdrop-blur transition hover:scale-105 dark:border-white/15 dark:bg-neutral-900/90"
    >
      <span aria-hidden className="text-base leading-none">
        {meta.icon}
      </span>
      <span className="hidden sm:inline">{meta.label}</span>
    </button>
  );
}
